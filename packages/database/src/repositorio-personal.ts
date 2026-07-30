// Repositorio de datos personales: operaciones tipadas con limites; el SQL
// no sale de este paquete (plan bloque 03, tarea 8). Las mutaciones se
// registran en mutaciones_aplicadas para idempotencia persistente.

import type { DatabaseSync } from 'node:sqlite';

const LIMITE_LISTADO = 500;
const LIMITE_TEXTO_NOTA = 20000;

export interface Favorito {
  recursoId: string;
  creado: string;
}

export interface NotaPersonal {
  id: string;
  destinoTipo: 'recurso' | 'segmento' | 'pagina';
  recursoId: string;
  segmento: string | null;
  pagina: number | null;
  texto: string;
  creada: string;
  modificada: string | null;
}

export type OperacionMutacion =
  | { operacion: 'favorito-poner'; recursoId: string }
  | { operacion: 'favorito-quitar'; recursoId: string }
  | {
      operacion: 'nota-crear';
      id: string;
      destinoTipo: 'recurso' | 'segmento' | 'pagina';
      recursoId: string;
      segmento?: string;
      pagina?: number;
      texto: string;
    }
  | { operacion: 'nota-borrar'; id: string }
  | { operacion: 'progreso-guardar'; recursoId: string; localizador: string; porcentaje: number };

export function esOperacionMutacion(valor: unknown): valor is OperacionMutacion {
  if (typeof valor !== 'object' || valor === null) return false;
  const v = valor as Record<string, unknown>;
  switch (v['operacion']) {
    case 'favorito-poner':
    case 'favorito-quitar':
      return typeof v['recursoId'] === 'string' && v['recursoId'].length > 0;
    case 'nota-crear':
      return (
        typeof v['id'] === 'string' &&
        typeof v['recursoId'] === 'string' &&
        (v['destinoTipo'] === 'recurso' ||
          v['destinoTipo'] === 'segmento' ||
          v['destinoTipo'] === 'pagina') &&
        typeof v['texto'] === 'string' &&
        v['texto'].length > 0 &&
        v['texto'].length <= LIMITE_TEXTO_NOTA
      );
    case 'nota-borrar':
      return typeof v['id'] === 'string';
    case 'progreso-guardar':
      return (
        typeof v['recursoId'] === 'string' &&
        typeof v['localizador'] === 'string' &&
        typeof v['porcentaje'] === 'number' &&
        v['porcentaje'] >= 0 &&
        v['porcentaje'] <= 100
      );
    default:
      return false;
  }
}

export class RepositorioPersonal {
  constructor(private readonly db: DatabaseSync) {}

  /**
   * Aplica una mutacion de forma idempotente: si idMutacion ya se registro,
   * no se reaplica y se devuelve 'ya-aplicada'. Registro y efecto comparten
   * transaccion: o entran juntos o no entra ninguno.
   */
  aplicarMutacion(idMutacion: string, operacion: OperacionMutacion): 'aplicada' | 'ya-aplicada' {
    const previa = this.db
      .prepare('SELECT id FROM mutaciones_aplicadas WHERE id = ?')
      .get(idMutacion);
    if (previa !== undefined) return 'ya-aplicada';

    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.ejecutar(operacion);
      this.db.prepare('INSERT INTO mutaciones_aplicadas (id) VALUES (?)').run(idMutacion);
      this.db.exec('COMMIT');
      return 'aplicada';
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  mutacionAplicada(idMutacion: string): boolean {
    return (
      this.db.prepare('SELECT id FROM mutaciones_aplicadas WHERE id = ?').get(idMutacion) !==
      undefined
    );
  }

  private ejecutar(op: OperacionMutacion): void {
    switch (op.operacion) {
      case 'favorito-poner':
        this.db
          .prepare(
            'INSERT INTO favoritos (recurso_id) VALUES (?) ON CONFLICT(recurso_id) DO NOTHING',
          )
          .run(op.recursoId);
        return;
      case 'favorito-quitar':
        this.db.prepare('DELETE FROM favoritos WHERE recurso_id = ?').run(op.recursoId);
        return;
      case 'nota-crear':
        this.db
          .prepare(
            'INSERT INTO notas (id, destino_tipo, recurso_id, segmento, pagina, texto, creada) VALUES (?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            op.id,
            op.destinoTipo,
            op.recursoId,
            op.segmento ?? null,
            op.pagina ?? null,
            op.texto,
            new Date().toISOString(),
          );
        return;
      case 'nota-borrar':
        this.db.prepare('DELETE FROM notas WHERE id = ?').run(op.id);
        return;
      case 'progreso-guardar':
        this.db
          .prepare(
            'INSERT INTO progreso_lectura (recurso_id, localizador, porcentaje, actualizado) VALUES (?, ?, ?, ?) ' +
              'ON CONFLICT(recurso_id) DO UPDATE SET localizador=excluded.localizador, porcentaje=excluded.porcentaje, actualizado=excluded.actualizado',
          )
          .run(op.recursoId, op.localizador, op.porcentaje, new Date().toISOString());
        return;
    }
  }

  listarFavoritos(): Favorito[] {
    return this.db
      .prepare(
        `SELECT recurso_id AS recursoId, creado FROM favoritos ORDER BY creado DESC LIMIT ${String(LIMITE_LISTADO)}`,
      )
      .all() as unknown as Favorito[];
  }

  listarNotas(recursoId?: string): NotaPersonal[] {
    const base =
      'SELECT id, destino_tipo AS destinoTipo, recurso_id AS recursoId, segmento, pagina, texto, creada, modificada FROM notas';
    const limite = ` ORDER BY creada DESC LIMIT ${String(LIMITE_LISTADO)}`;
    if (recursoId !== undefined) {
      return this.db
        .prepare(`${base} WHERE recurso_id = ?${limite}`)
        .all(recursoId) as unknown as NotaPersonal[];
    }
    return this.db.prepare(`${base}${limite}`).all() as unknown as NotaPersonal[];
  }

  resumen(): { favoritos: number; notas: number; colecciones: number } {
    const contar = (tabla: string): number => {
      const fila = this.db.prepare(`SELECT count(*) AS n FROM ${tabla}`).get() as { n: number };
      return fila.n;
    };
    return {
      favoritos: contar('favoritos'),
      notas: contar('notas'),
      colecciones: contar('colecciones'),
    };
  }
}
