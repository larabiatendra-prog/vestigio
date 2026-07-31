// Repositorio de datos personales: operaciones tipadas con limites; el SQL
// no sale de este paquete (plan bloque 03, tarea 8). Las mutaciones se
// registran en mutaciones_aplicadas para idempotencia persistente.
//
// Bloque 12: el espacio personal completo (favoritos, colecciones, notas,
// marcadores, progreso, recientes y ajustes) con papelera. Borrar algo
// personal nunca es definitivo en el acto: pasa por la papelera y se puede
// deshacer mientras siga ahi.

import type { DatabaseSync } from 'node:sqlite';
import { normalizarTolerante } from '@vestigio/search';

const LIMITE_LISTADO = 500;
const LIMITE_TEXTO_NOTA = 20000;
const LIMITE_NOMBRE_COLECCION = 120;
const LIMITE_ETIQUETA = 120;
const LIMITE_CONTEXTO = 400;
const LIMITE_AJUSTE = 4000;
const LIMITE_RECIENTES = 40;

export type DestinoNota = 'recurso' | 'segmento' | 'pagina' | 'ruta' | 'procedimiento';

export interface Favorito {
  recursoId: string;
  creado: string;
}

export interface NotaPersonal {
  id: string;
  destinoTipo: DestinoNota;
  recursoId: string;
  segmento: string | null;
  pagina: number | null;
  ancla: string | null;
  contexto: string | null;
  texto: string;
  creada: string;
  modificada: string | null;
}

export interface Marcador {
  id: string;
  recursoId: string;
  localizador: string;
  etiqueta: string | null;
  creado: string;
}

export interface Coleccion {
  id: string;
  nombre: string;
  descripcion: string | null;
  creada: string;
  modificada: string | null;
  elementos: number;
}

export interface ItemColeccion {
  recursoId: string;
  orden: number;
  anadido: string | null;
}

export interface ProgresoLectura {
  recursoId: string;
  localizador: string | null;
  pagina: number | null;
  porcentaje: number | null;
  fallbackTexto: string | null;
  actualizado: string;
}

export interface Reciente {
  recursoId: string;
  localizador: string | null;
  visto: string;
}

export interface EntradaPapelera {
  id: string;
  tipo: 'nota' | 'marcador' | 'favorito' | 'coleccion' | 'coleccion-item';
  descripcion: string;
  borrado: string;
}

export type OperacionMutacion =
  | { operacion: 'favorito-poner'; recursoId: string }
  | { operacion: 'favorito-quitar'; recursoId: string }
  | {
      operacion: 'nota-crear';
      id: string;
      destinoTipo: DestinoNota;
      recursoId: string;
      segmento?: string;
      pagina?: number;
      ancla?: string;
      contexto?: string;
      texto: string;
    }
  | { operacion: 'nota-editar'; id: string; texto: string }
  | { operacion: 'nota-borrar'; id: string }
  | {
      operacion: 'marcador-poner';
      id: string;
      recursoId: string;
      localizador: string;
      etiqueta?: string;
    }
  | { operacion: 'marcador-quitar'; recursoId: string; localizador: string }
  | { operacion: 'coleccion-crear'; id: string; nombre: string; descripcion?: string }
  | { operacion: 'coleccion-renombrar'; id: string; nombre: string; descripcion?: string }
  | { operacion: 'coleccion-borrar'; id: string }
  | { operacion: 'coleccion-anadir'; coleccionId: string; recursoId: string }
  | { operacion: 'coleccion-quitar'; coleccionId: string; recursoId: string }
  | {
      operacion: 'progreso-guardar';
      recursoId: string;
      localizador: string;
      porcentaje: number;
      pagina?: number;
      fallbackTexto?: string;
    }
  | { operacion: 'reciente-registrar'; recursoId: string; localizador?: string }
  | { operacion: 'ajuste-guardar'; clave: string; valor: string }
  | { operacion: 'papelera-restaurar'; id: string }
  | { operacion: 'papelera-vaciar' };

function esTextoNoVacio(valor: unknown, maximo: number): valor is string {
  return typeof valor === 'string' && valor.length > 0 && valor.length <= maximo;
}

function esOpcionalTexto(valor: unknown, maximo: number): boolean {
  return valor === undefined || (typeof valor === 'string' && valor.length <= maximo);
}

export function esOperacionMutacion(valor: unknown): valor is OperacionMutacion {
  if (typeof valor !== 'object' || valor === null) return false;
  const v = valor as Record<string, unknown>;
  switch (v['operacion']) {
    case 'favorito-poner':
    case 'favorito-quitar':
      return esTextoNoVacio(v['recursoId'], 200);
    case 'nota-crear':
      return (
        esTextoNoVacio(v['id'], 200) &&
        esTextoNoVacio(v['recursoId'], 200) &&
        (v['destinoTipo'] === 'recurso' ||
          v['destinoTipo'] === 'segmento' ||
          v['destinoTipo'] === 'pagina' ||
          v['destinoTipo'] === 'ruta' ||
          v['destinoTipo'] === 'procedimiento') &&
        esTextoNoVacio(v['texto'], LIMITE_TEXTO_NOTA) &&
        esOpcionalTexto(v['segmento'], 400) &&
        esOpcionalTexto(v['ancla'], 400) &&
        esOpcionalTexto(v['contexto'], LIMITE_CONTEXTO)
      );
    case 'nota-editar':
      return esTextoNoVacio(v['id'], 200) && esTextoNoVacio(v['texto'], LIMITE_TEXTO_NOTA);
    case 'nota-borrar':
      return esTextoNoVacio(v['id'], 200);
    case 'marcador-poner':
      return (
        esTextoNoVacio(v['id'], 200) &&
        esTextoNoVacio(v['recursoId'], 200) &&
        esTextoNoVacio(v['localizador'], 400) &&
        esOpcionalTexto(v['etiqueta'], LIMITE_ETIQUETA)
      );
    case 'marcador-quitar':
      return esTextoNoVacio(v['recursoId'], 200) && esTextoNoVacio(v['localizador'], 400);
    case 'coleccion-crear':
    case 'coleccion-renombrar':
      return (
        esTextoNoVacio(v['id'], 200) &&
        esTextoNoVacio(v['nombre'], LIMITE_NOMBRE_COLECCION) &&
        esOpcionalTexto(v['descripcion'], 1000)
      );
    case 'coleccion-borrar':
      return esTextoNoVacio(v['id'], 200);
    case 'coleccion-anadir':
    case 'coleccion-quitar':
      return esTextoNoVacio(v['coleccionId'], 200) && esTextoNoVacio(v['recursoId'], 200);
    case 'progreso-guardar':
      return (
        esTextoNoVacio(v['recursoId'], 200) &&
        typeof v['localizador'] === 'string' &&
        typeof v['porcentaje'] === 'number' &&
        Number.isFinite(v['porcentaje']) &&
        v['porcentaje'] >= 0 &&
        v['porcentaje'] <= 100 &&
        esOpcionalTexto(v['fallbackTexto'], LIMITE_CONTEXTO)
      );
    case 'reciente-registrar':
      return esTextoNoVacio(v['recursoId'], 200) && esOpcionalTexto(v['localizador'], 400);
    case 'ajuste-guardar':
      return esTextoNoVacio(v['clave'], 100) && esOpcionalTexto(v['valor'], LIMITE_AJUSTE);
    case 'papelera-restaurar':
      return esTextoNoVacio(v['id'], 200);
    case 'papelera-vaciar':
      return true;
    default:
      return false;
  }
}

/** Lo que se guarda en la papelera para poder devolverlo tal cual estaba. */
interface CargaPapelera {
  tabla: 'notas' | 'marcadores' | 'favoritos' | 'colecciones' | 'coleccion_items';
  filas: Record<string, unknown>[];
}

export class RepositorioPersonal {
  constructor(private readonly db: DatabaseSync) {}

  /**
   * Rellena texto_norm en las notas que vienen de un esquema anterior. La
   * normalizacion sin tildes no se puede hacer en SQL, asi que se hace aqui
   * una sola vez tras migrar.
   */
  prepararIndices(): number {
    const pendientes = this.db
      .prepare("SELECT id, texto FROM notas WHERE texto_norm = '' AND texto <> ''")
      .all() as unknown as { id: string; texto: string }[];
    if (pendientes.length === 0) return 0;
    const actualizar = this.db.prepare('UPDATE notas SET texto_norm = ? WHERE id = ?');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const nota of pendientes) actualizar.run(normalizarTolerante(nota.texto), nota.id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return pendientes.length;
  }

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

  private ahora(): string {
    return new Date().toISOString();
  }

  /** Guarda filas en la papelera dentro de la transaccion que las borra. */
  private aPapelera(
    id: string,
    tipo: EntradaPapelera['tipo'],
    descripcion: string,
    carga: CargaPapelera,
  ): void {
    // Mismo id si se borra, se restaura y se vuelve a borrar: la entrada se
    // sobrescribe con la version mas reciente en vez de chocar.
    this.db
      .prepare(
        'INSERT INTO papelera (id, tipo, descripcion, carga, borrado) VALUES (?, ?, ?, ?, ?) ' +
          'ON CONFLICT(id) DO UPDATE SET descripcion=excluded.descripcion, carga=excluded.carga, borrado=excluded.borrado',
      )
      .run(id, tipo, descripcion.slice(0, 300), JSON.stringify(carga), this.ahora());
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

      case 'favorito-quitar': {
        const fila = this.db
          .prepare('SELECT recurso_id, creado FROM favoritos WHERE recurso_id = ?')
          .get(op.recursoId) as Record<string, unknown> | undefined;
        if (fila === undefined) return;
        this.aPapelera(`fav-${op.recursoId}`, 'favorito', 'favorito retirado', {
          tabla: 'favoritos',
          filas: [fila],
        });
        this.db.prepare('DELETE FROM favoritos WHERE recurso_id = ?').run(op.recursoId);
        return;
      }

      case 'nota-crear':
        this.db
          .prepare(
            'INSERT INTO notas (id, destino_tipo, recurso_id, segmento, pagina, ancla, contexto, texto, texto_norm, creada) ' +
              'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            op.id,
            op.destinoTipo,
            op.recursoId,
            op.segmento ?? null,
            op.pagina ?? null,
            op.ancla ?? null,
            op.contexto ?? null,
            op.texto,
            normalizarTolerante(op.texto),
            this.ahora(),
          );
        return;

      case 'nota-editar':
        this.db
          .prepare('UPDATE notas SET texto = ?, texto_norm = ?, modificada = ? WHERE id = ?')
          .run(op.texto, normalizarTolerante(op.texto), this.ahora(), op.id);
        return;

      case 'nota-borrar': {
        const fila = this.db.prepare('SELECT * FROM notas WHERE id = ?').get(op.id) as
          Record<string, unknown> | undefined;
        if (fila === undefined) return;
        this.aPapelera(`nota-${op.id}`, 'nota', `nota: ${String(fila['texto']).slice(0, 80)}`, {
          tabla: 'notas',
          filas: [fila],
        });
        this.db.prepare('DELETE FROM notas WHERE id = ?').run(op.id);
        return;
      }

      case 'marcador-poner':
        this.db
          .prepare(
            'INSERT INTO marcadores (id, recurso_id, localizador, etiqueta) VALUES (?, ?, ?, ?) ' +
              'ON CONFLICT(recurso_id, localizador) DO UPDATE SET etiqueta = excluded.etiqueta',
          )
          .run(op.id, op.recursoId, op.localizador, op.etiqueta ?? null);
        return;

      case 'marcador-quitar': {
        const fila = this.db
          .prepare('SELECT * FROM marcadores WHERE recurso_id = ? AND localizador = ?')
          .get(op.recursoId, op.localizador) as Record<string, unknown> | undefined;
        if (fila === undefined) return;
        this.aPapelera(
          `marcador-${String(fila['id'])}`,
          'marcador',
          `marcador en ${op.localizador}`,
          { tabla: 'marcadores', filas: [fila] },
        );
        this.db
          .prepare('DELETE FROM marcadores WHERE recurso_id = ? AND localizador = ?')
          .run(op.recursoId, op.localizador);
        return;
      }

      case 'coleccion-crear':
        this.db
          .prepare(
            'INSERT INTO colecciones (id, nombre, descripcion, creada) VALUES (?, ?, ?, ?) ' +
              'ON CONFLICT(id) DO NOTHING',
          )
          .run(op.id, op.nombre, op.descripcion ?? null, this.ahora());
        return;

      case 'coleccion-renombrar':
        this.db
          .prepare(
            'UPDATE colecciones SET nombre = ?, descripcion = ?, modificada = ? WHERE id = ?',
          )
          .run(op.nombre, op.descripcion ?? null, this.ahora(), op.id);
        return;

      case 'coleccion-borrar': {
        const coleccion = this.db.prepare('SELECT * FROM colecciones WHERE id = ?').get(op.id) as
          Record<string, unknown> | undefined;
        if (coleccion === undefined) return;
        const items = this.db
          .prepare('SELECT * FROM coleccion_items WHERE coleccion_id = ? ORDER BY orden')
          .all(op.id) as unknown as Record<string, unknown>[];
        // La coleccion y sus miembros viajan juntos a la papelera: restaurar
        // devuelve la lista entera, no un cascaron vacio.
        this.aPapelera(
          `coleccion-${op.id}`,
          'coleccion',
          `colección "${String(coleccion['nombre'])}" con ${String(items.length)} elementos`,
          { tabla: 'colecciones', filas: [coleccion, ...items.map((i) => ({ ...i, __item: 1 }))] },
        );
        this.db.prepare('DELETE FROM coleccion_items WHERE coleccion_id = ?').run(op.id);
        this.db.prepare('DELETE FROM colecciones WHERE id = ?').run(op.id);
        return;
      }

      case 'coleccion-anadir': {
        const existe = this.db
          .prepare('SELECT id FROM colecciones WHERE id = ?')
          .get(op.coleccionId);
        if (existe === undefined) return;
        const orden = (
          this.db
            .prepare(
              'SELECT COALESCE(max(orden), -1) + 1 AS siguiente FROM coleccion_items WHERE coleccion_id = ?',
            )
            .get(op.coleccionId) as { siguiente: number }
        ).siguiente;
        this.db
          .prepare(
            'INSERT INTO coleccion_items (coleccion_id, recurso_id, orden, anadido) VALUES (?, ?, ?, ?) ' +
              'ON CONFLICT(coleccion_id, recurso_id) DO NOTHING',
          )
          .run(op.coleccionId, op.recursoId, orden, this.ahora());
        this.db
          .prepare('UPDATE colecciones SET modificada = ? WHERE id = ?')
          .run(this.ahora(), op.coleccionId);
        return;
      }

      case 'coleccion-quitar':
        this.db
          .prepare('DELETE FROM coleccion_items WHERE coleccion_id = ? AND recurso_id = ?')
          .run(op.coleccionId, op.recursoId);
        this.db
          .prepare('UPDATE colecciones SET modificada = ? WHERE id = ?')
          .run(this.ahora(), op.coleccionId);
        return;

      case 'progreso-guardar':
        this.db
          .prepare(
            'INSERT INTO progreso_lectura (recurso_id, localizador, porcentaje, pagina, fallback_texto, actualizado) ' +
              'VALUES (?, ?, ?, ?, ?, ?) ' +
              'ON CONFLICT(recurso_id) DO UPDATE SET localizador=excluded.localizador, ' +
              'porcentaje=excluded.porcentaje, pagina=excluded.pagina, ' +
              'fallback_texto=excluded.fallback_texto, actualizado=excluded.actualizado',
          )
          .run(
            op.recursoId,
            op.localizador,
            op.porcentaje,
            op.pagina ?? null,
            op.fallbackTexto ?? null,
            this.ahora(),
          );
        return;

      case 'reciente-registrar':
        this.db
          .prepare(
            'INSERT INTO recientes (recurso_id, visto, localizador) VALUES (?, ?, ?) ' +
              'ON CONFLICT(recurso_id) DO UPDATE SET visto=excluded.visto, localizador=excluded.localizador',
          )
          .run(op.recursoId, this.ahora(), op.localizador ?? null);
        // La lista de recientes no crece sin fin.
        this.db
          .prepare(
            `DELETE FROM recientes WHERE recurso_id NOT IN (
               SELECT recurso_id FROM recientes ORDER BY visto DESC LIMIT ${String(LIMITE_RECIENTES)}
             )`,
          )
          .run();
        return;

      case 'ajuste-guardar':
        this.db
          .prepare(
            'INSERT INTO ajustes (clave, valor) VALUES (?, ?) ' +
              'ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor',
          )
          .run(op.clave, op.valor);
        return;

      case 'papelera-restaurar': {
        const entrada = this.db.prepare('SELECT * FROM papelera WHERE id = ?').get(op.id) as
          { id: string; tipo: string; carga: string } | undefined;
        if (entrada === undefined) return;
        this.restaurarCarga(JSON.parse(entrada.carga) as CargaPapelera);
        this.db.prepare('DELETE FROM papelera WHERE id = ?').run(op.id);
        return;
      }

      case 'papelera-vaciar':
        this.db.prepare('DELETE FROM papelera').run();
        return;
    }
  }

  /** Reinserta las filas guardadas respetando su forma original. */
  private restaurarCarga(carga: CargaPapelera): void {
    for (const fila of carga.filas) {
      const esItem = fila['__item'] === 1;
      const tabla = esItem ? 'coleccion_items' : carga.tabla;
      const columnas = Object.keys(fila).filter((c) => c !== '__item');
      const marcas = columnas.map(() => '?').join(', ');
      this.db
        .prepare(
          `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${marcas}) ON CONFLICT DO NOTHING`,
        )
        .run(...columnas.map((c) => fila[c] as string | number | null));
    }
  }

  // --- Consultas -------------------------------------------------------------

  listarFavoritos(): Favorito[] {
    return this.db
      .prepare(
        `SELECT recurso_id AS recursoId, creado FROM favoritos ORDER BY creado DESC LIMIT ${String(LIMITE_LISTADO)}`,
      )
      .all() as unknown as Favorito[];
  }

  esFavorito(recursoId: string): boolean {
    return (
      this.db.prepare('SELECT recurso_id FROM favoritos WHERE recurso_id = ?').get(recursoId) !==
      undefined
    );
  }

  listarNotas(recursoId?: string): NotaPersonal[] {
    const base =
      'SELECT id, destino_tipo AS destinoTipo, recurso_id AS recursoId, segmento, pagina, ancla, contexto, texto, creada, modificada FROM notas';
    const limite = ` ORDER BY creada DESC LIMIT ${String(LIMITE_LISTADO)}`;
    if (recursoId !== undefined) {
      return this.db
        .prepare(`${base} WHERE recurso_id = ?${limite}`)
        .all(recursoId) as unknown as NotaPersonal[];
    }
    return this.db.prepare(`${base}${limite}`).all() as unknown as NotaPersonal[];
  }

  /**
   * Busqueda de notas sobre el texto normalizado: "cañeria" encuentra
   * "cañería" sin que el usuario tenga que acertar con las tildes.
   */
  buscarNotas(texto: string): NotaPersonal[] {
    const aguja = normalizarTolerante(texto).trim();
    if (aguja.length === 0) return this.listarNotas();
    return this.db
      .prepare(
        `SELECT id, destino_tipo AS destinoTipo, recurso_id AS recursoId, segmento, pagina,
                ancla, contexto, texto, creada, modificada
         FROM notas WHERE texto_norm LIKE ? ESCAPE '\\'
         ORDER BY creada DESC LIMIT ${String(LIMITE_LISTADO)}`,
      )
      .all(`%${aguja.replace(/[\\%_]/g, '\\$&')}%`) as unknown as NotaPersonal[];
  }

  listarMarcadores(recursoId?: string): Marcador[] {
    const base =
      'SELECT id, recurso_id AS recursoId, localizador, etiqueta, creado FROM marcadores';
    const limite = ` ORDER BY creado DESC LIMIT ${String(LIMITE_LISTADO)}`;
    if (recursoId !== undefined) {
      return this.db
        .prepare(`${base} WHERE recurso_id = ?${limite}`)
        .all(recursoId) as unknown as Marcador[];
    }
    return this.db.prepare(`${base}${limite}`).all() as unknown as Marcador[];
  }

  listarColecciones(): Coleccion[] {
    return this.db
      .prepare(
        `SELECT c.id, c.nombre, c.descripcion, c.creada, c.modificada,
                (SELECT count(*) FROM coleccion_items ci WHERE ci.coleccion_id = c.id) AS elementos
         FROM colecciones c ORDER BY c.nombre COLLATE NOCASE LIMIT ${String(LIMITE_LISTADO)}`,
      )
      .all() as unknown as Coleccion[];
  }

  itemsColeccion(coleccionId: string): ItemColeccion[] {
    return this.db
      .prepare(
        `SELECT recurso_id AS recursoId, orden, anadido FROM coleccion_items
         WHERE coleccion_id = ? ORDER BY orden LIMIT ${String(LIMITE_LISTADO)}`,
      )
      .all(coleccionId) as unknown as ItemColeccion[];
  }

  progreso(recursoId: string): ProgresoLectura | null {
    const fila = this.db
      .prepare(
        `SELECT recurso_id AS recursoId, localizador, pagina, porcentaje,
                fallback_texto AS fallbackTexto, actualizado
         FROM progreso_lectura WHERE recurso_id = ?`,
      )
      .get(recursoId) as unknown as ProgresoLectura | undefined;
    return fila ?? null;
  }

  listarProgreso(): ProgresoLectura[] {
    return this.db
      .prepare(
        `SELECT recurso_id AS recursoId, localizador, pagina, porcentaje,
                fallback_texto AS fallbackTexto, actualizado
         FROM progreso_lectura ORDER BY actualizado DESC LIMIT ${String(LIMITE_LISTADO)}`,
      )
      .all() as unknown as ProgresoLectura[];
  }

  listarRecientes(limite = 12): Reciente[] {
    const tope = Math.min(Math.max(1, limite), LIMITE_RECIENTES);
    return this.db
      .prepare(
        `SELECT recurso_id AS recursoId, localizador, visto FROM recientes
         ORDER BY visto DESC LIMIT ${String(tope)}`,
      )
      .all() as unknown as Reciente[];
  }

  ajustes(): Record<string, string> {
    const filas = this.db.prepare('SELECT clave, valor FROM ajustes').all() as unknown as {
      clave: string;
      valor: string;
    }[];
    const salida: Record<string, string> = {};
    for (const fila of filas) salida[fila.clave] = fila.valor;
    return salida;
  }

  listarPapelera(): EntradaPapelera[] {
    return this.db
      .prepare(
        `SELECT id, tipo, descripcion, borrado FROM papelera
         ORDER BY borrado DESC LIMIT ${String(LIMITE_LISTADO)}`,
      )
      .all() as unknown as EntradaPapelera[];
  }

  resumen(): {
    favoritos: number;
    notas: number;
    colecciones: number;
    marcadores: number;
    papelera: number;
  } {
    const contar = (tabla: string): number => {
      const fila = this.db.prepare(`SELECT count(*) AS n FROM ${tabla}`).get() as { n: number };
      return fila.n;
    };
    return {
      favoritos: contar('favoritos'),
      notas: contar('notas'),
      colecciones: contar('colecciones'),
      marcadores: contar('marcadores'),
      papelera: contar('papelera'),
    };
  }

  /** Si hay algo que respaldar: evita escribir copias identicas al cerrar. */
  hayCambiosPersonales(): boolean {
    const r = this.resumen();
    return (
      r.favoritos + r.notas + r.colecciones + r.marcadores > 0 ||
      (this.db.prepare('SELECT count(*) AS n FROM progreso_lectura').get() as { n: number }).n > 0
    );
  }
}
