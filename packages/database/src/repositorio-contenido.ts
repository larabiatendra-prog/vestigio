// Consultas de solo lectura sobre el catalogo. El SQL no sale del paquete;
// la app ve contratos tipados con limites (plan bloque 03 t.8).

import type { DatabaseSync } from 'node:sqlite';

const LIMITE_LISTADO = 200;
const LIMITE_BUSQUEDA = 50;

export interface RecursoResumen {
  id: string;
  slug: string;
  titulo: string;
  idioma: string;
  formato: string;
  estadoTexto: string;
  detalleTexto: string | null;
  numPaginas: number | null;
  numSegmentos: number;
}

export interface SegmentoLectura {
  localizador: string;
  titulo: string | null;
  nivel: number | null;
  pagina: number | null;
  html: string | null;
  cuerpo: string;
}

export interface FichaRecurso extends RecursoResumen {
  derechos: string;
  origenSha256: string | null;
  origenAdquirido: string | null;
  /** Ruta logica del original dentro de CONTENT (para el lector de PDF). */
  rutaOriginal: string | null;
  bytes: number | null;
  segmentos: SegmentoLectura[];
}

export interface Coincidencia {
  recursoId: string;
  titulo: string;
  formato: string;
  localizador: string;
  tituloSeccion: string | null;
  pagina: number | null;
  fragmento: string;
}

/**
 * Escapa la consulta del usuario para FTS5: se trata como frase literal,
 * nunca como sintaxis de operadores (plan §9.2). El modo avanzado sera
 * una entrada distinta y validada.
 */
export function consultaLiteralFts(texto: string): string {
  const limpio = texto
    .normalize('NFC')
    .replace(/["^*():]/g, ' ')
    .trim()
    .slice(0, 200);
  const palabras = limpio.split(/\s+/).filter((p) => p.length > 0);
  if (palabras.length === 0) return '';
  return palabras.map((p) => `"${p}"`).join(' ');
}

export class RepositorioContenido {
  constructor(private readonly db: DatabaseSync) {}

  versionCorpus(): string | null {
    const fila = this.db
      .prepare("SELECT valor FROM release_metadata WHERE clave='corpus_version'")
      .get() as { valor: string } | undefined;
    return fila?.valor ?? null;
  }

  contarRecursos(): number {
    return (this.db.prepare('SELECT count(*) AS n FROM recursos').get() as { n: number }).n;
  }

  listar(): RecursoResumen[] {
    return this.db
      .prepare(
        `SELECT r.id, r.slug, r.titulo, r.idioma, r.formato,
                r.estado_texto AS estadoTexto, r.detalle_texto AS detalleTexto,
                r.num_paginas AS numPaginas,
                (SELECT count(*) FROM segmentos s WHERE s.recurso_pk = r.pk) AS numSegmentos
         FROM recursos r ORDER BY r.titulo COLLATE NOCASE LIMIT ${String(LIMITE_LISTADO)}`,
      )
      .all() as unknown as RecursoResumen[];
  }

  ficha(recursoId: string): FichaRecurso | null {
    const recurso = this.db
      .prepare(
        `SELECT r.pk, r.id, r.slug, r.titulo, r.idioma, r.formato, r.derechos,
                r.estado_texto AS estadoTexto, r.detalle_texto AS detalleTexto,
                r.num_paginas AS numPaginas,
                r.origen_sha256 AS origenSha256, r.origen_adquirido AS origenAdquirido
         FROM recursos r WHERE r.id = ?`,
      )
      .get(recursoId) as
      | (RecursoResumen & {
          pk: number;
          derechos: string;
          origenSha256: string | null;
          origenAdquirido: string | null;
        })
      | undefined;
    if (recurso === undefined) return null;

    const asset = this.db
      .prepare(
        `SELECT a.ruta_logica AS rutaLogica, a.bytes FROM assets a
         JOIN asset_roles ar ON ar.asset_pk = a.pk
         WHERE a.recurso_pk = ? AND ar.rol = 'source_original' LIMIT 1`,
      )
      .get(recurso.pk) as { rutaLogica: string; bytes: number } | undefined;

    const segmentos = this.db
      .prepare(
        `SELECT localizador, titulo, nivel, pagina, html, cuerpo
         FROM segmentos WHERE recurso_pk = ? ORDER BY orden`,
      )
      .all(recurso.pk) as unknown as SegmentoLectura[];

    return {
      id: recurso.id,
      slug: recurso.slug,
      titulo: recurso.titulo,
      idioma: recurso.idioma,
      formato: recurso.formato,
      derechos: recurso.derechos,
      estadoTexto: recurso.estadoTexto,
      detalleTexto: recurso.detalleTexto,
      numPaginas: recurso.numPaginas,
      numSegmentos: segmentos.length,
      origenSha256: recurso.origenSha256,
      origenAdquirido: recurso.origenAdquirido,
      rutaOriginal: asset?.rutaLogica ?? null,
      bytes: asset?.bytes ?? null,
      segmentos,
    };
  }

  /** Ruta logica del original, resuelta desde el UUID (nunca desde el renderer). */
  rutaOriginal(recursoId: string): string | null {
    const fila = this.db
      .prepare(
        `SELECT a.ruta_logica AS rutaLogica FROM assets a
         JOIN recursos r ON r.pk = a.recurso_pk
         JOIN asset_roles ar ON ar.asset_pk = a.pk
         WHERE r.id = ? AND ar.rol = 'source_original' LIMIT 1`,
      )
      .get(recursoId) as { rutaLogica: string } | undefined;
    return fila?.rutaLogica ?? null;
  }

  /** Busqueda literal en el indice exacto, con fragmento resaltado. */
  buscar(texto: string, limite = LIMITE_BUSQUEDA): Coincidencia[] {
    const consulta = consultaLiteralFts(texto);
    if (consulta.length === 0) return [];
    const tope = Math.min(Math.max(1, limite), LIMITE_BUSQUEDA);
    return this.db
      .prepare(
        `SELECT r.id AS recursoId, r.titulo, r.formato,
                s.localizador, s.titulo AS tituloSeccion, s.pagina,
                snippet(segmentos_fts, 1, '[[', ']]', '…', 14) AS fragmento
         FROM segmentos_fts
         JOIN segmentos s ON s.pk = segmentos_fts.rowid
         JOIN recursos r ON r.pk = s.recurso_pk
         WHERE segmentos_fts MATCH ?
         ORDER BY bm25(segmentos_fts, 4.0, 1.0)
         LIMIT ${String(tope)}`,
      )
      .all(consulta) as unknown as Coincidencia[];
  }
}
