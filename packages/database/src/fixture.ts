// Builder de catalogos fixture (plan bloque 03, tarea 10): las bases de
// prueba se construyen desde una representacion canonica, nunca a mano.
// Es tambien el nucleo que reutilizara la CLI administrativa (bloque 04).

import { DatabaseSync } from 'node:sqlite';
import { textoParaIndiceTolerante } from '@vestigio/search';
import { APPLICATION_ID_CONTENIDO, MIGRACIONES_CONTENIDO } from './esquemas.js';
import { migrar } from './migrador.js';

export interface AssetCanonico {
  id: string;
  roles: string[];
  formato: string;
  rutaLogica: string;
  bytes: number;
  sha256: string;
}

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
  origen?: { url?: string; adquirido: string; sha256: string };
  assets?: AssetCanonico[];
  segmentos?: SegmentoCanonico[];
  /** Que se pudo extraer del original y con que limitaciones (E1). */
  estadoTexto?: string;
  detalleTexto?: string;
  numPaginas?: number;
}

export interface SegmentoCanonico {
  localizador: string;
  titulo?: string | null;
  nivel?: number | null;
  cuerpo: string;
  /** Derivado de acceso saneado; null en formatos que se leen en original. */
  html?: string | null;
  pagina?: number | null;
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
      'INSERT INTO recursos (id, slug, titulo, idioma, formato, derechos, resumen, estado_texto, detalle_texto, num_paginas, origen_url, origen_adquirido, origen_sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const insertarAsset = db.prepare(
      'INSERT INTO assets (id, recurso_pk, formato, ruta_logica, bytes, sha256) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const insertarRol = db.prepare('INSERT INTO asset_roles (asset_pk, rol) VALUES (?, ?)');
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
      'INSERT INTO segmentos (recurso_pk, localizador, titulo, nivel, cuerpo, html, pagina, orden) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const insertarFts = db.prepare(
      'INSERT INTO segmentos_fts (rowid, titulo, cuerpo) VALUES (?, ?, ?)',
    );
    const insertarFtsTolerante = db.prepare(
      'INSERT INTO segmentos_tolerante_fts (rowid, titulo, cuerpo) VALUES (?, ?, ?)',
    );
    const insertarRecursoFts = db.prepare(
      'INSERT INTO recursos_fts (rowid, titulo, resumen) VALUES (?, ?, ?)',
    );
    const insertarRecursoFtsTolerante = db.prepare(
      'INSERT INTO recursos_tolerante_fts (rowid, titulo, resumen) VALUES (?, ?, ?)',
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
        recurso.estadoTexto ?? 'desconocido',
        recurso.detalleTexto ?? null,
        recurso.numPaginas ?? null,
        recurso.origen?.url ?? null,
        recurso.origen?.adquirido ?? null,
        recurso.origen?.sha256 ?? null,
      );
      const recursoPk = Number(r.lastInsertRowid);
      insertarRecursoFts.run(recursoPk, recurso.titulo, recurso.resumen ?? '');
      insertarRecursoFtsTolerante.run(
        recursoPk,
        textoParaIndiceTolerante(recurso.titulo),
        textoParaIndiceTolerante(recurso.resumen ?? ''),
      );
      for (const asset of recurso.assets ?? []) {
        const a = insertarAsset.run(
          asset.id,
          recursoPk,
          asset.formato,
          asset.rutaLogica,
          asset.bytes,
          asset.sha256,
        );
        for (const rol of asset.roles) insertarRol.run(Number(a.lastInsertRowid), rol);
      }
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
          segmento.nivel ?? null,
          segmento.cuerpo,
          segmento.html ?? null,
          segmento.pagina ?? null,
          orden++,
        );
        const rowid = Number(s.lastInsertRowid);
        insertarFts.run(rowid, segmento.titulo ?? '', segmento.cuerpo);
        insertarFtsTolerante.run(
          rowid,
          textoParaIndiceTolerante(segmento.titulo ?? ''),
          textoParaIndiceTolerante(segmento.cuerpo),
        );
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
