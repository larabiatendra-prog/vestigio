// Builder de catalogos fixture (plan bloque 03, tarea 10): las bases de
// prueba se construyen desde una representacion canonica, nunca a mano.
// Es tambien el nucleo que reutilizara la CLI administrativa (bloque 04).

import { DatabaseSync } from 'node:sqlite';
import { APPLICATION_ID_CONTENIDO, MIGRACIONES_CONTENIDO } from './esquemas.js';
import { migrar } from './migrador.js';

export interface RecursoCanonico {
  id: string;
  slug: string;
  titulo: string;
  idioma: string;
  formato: string;
  derechos: string;
  modulos: string[];
  etiquetas?: string[];
  resumen?: string;
  segmentos?: { localizador: string; titulo?: string; cuerpo: string }[];
}

export interface VersionesCatalogo {
  corpus: string;
  informacionVigente: string;
  esquema?: number;
}

/** Construye un catalogo completo en `ruta` (el fichero no debe existir). */
export function construirCatalogoFixture(
  ruta: string,
  recursos: RecursoCanonico[],
  versiones: VersionesCatalogo,
): void {
  const db = new DatabaseSync(ruta);
  try {
    db.exec(`PRAGMA application_id=${String(APPLICATION_ID_CONTENIDO)}`);
    db.exec('PRAGMA journal_mode=DELETE');
    migrar(db, MIGRACIONES_CONTENIDO);

    db.exec('BEGIN');
    const insertarRecurso = db.prepare(
      'INSERT INTO recursos (id, slug, titulo, idioma, formato, derechos, resumen) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const insertarModulo = db.prepare(
      'INSERT INTO recurso_modulos (recurso_pk, modulo) VALUES (?, ?)',
    );
    const insertarEtiqueta = db.prepare(
      'INSERT INTO etiquetas (nombre) VALUES (?) ON CONFLICT(nombre) DO NOTHING',
    );
    const vincularEtiqueta = db.prepare(
      'INSERT INTO recurso_etiquetas (recurso_pk, etiqueta_pk) SELECT ?, pk FROM etiquetas WHERE nombre = ?',
    );
    const insertarSegmento = db.prepare(
      'INSERT INTO segmentos (recurso_pk, localizador, titulo, orden) VALUES (?, ?, ?, ?)',
    );
    const insertarFts = db.prepare(
      'INSERT INTO segmentos_fts (rowid, titulo, cuerpo) VALUES (?, ?, ?)',
    );

    for (const recurso of recursos) {
      const r = insertarRecurso.run(
        recurso.id,
        recurso.slug,
        recurso.titulo,
        recurso.idioma,
        recurso.formato,
        recurso.derechos,
        recurso.resumen ?? null,
      );
      const recursoPk = Number(r.lastInsertRowid);
      for (const modulo of recurso.modulos) insertarModulo.run(recursoPk, modulo);
      for (const etiqueta of recurso.etiquetas ?? []) {
        insertarEtiqueta.run(etiqueta);
        vincularEtiqueta.run(recursoPk, etiqueta);
      }
      let orden = 0;
      for (const segmento of recurso.segmentos ?? []) {
        const s = insertarSegmento.run(
          recursoPk,
          segmento.localizador,
          segmento.titulo ?? null,
          orden++,
        );
        insertarFts.run(Number(s.lastInsertRowid), segmento.titulo ?? '', segmento.cuerpo);
      }
    }

    const meta = db.prepare('INSERT INTO release_metadata (clave, valor) VALUES (?, ?)');
    meta.run('corpus_version', versiones.corpus);
    meta.run('current_info_version', versiones.informacionVigente);
    meta.run('construido', new Date().toISOString());
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // sin transaccion abierta
    }
    throw error;
  } finally {
    db.close();
  }
}
