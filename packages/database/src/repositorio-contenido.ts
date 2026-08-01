// Consultas de solo lectura sobre el catalogo. El SQL no sale del paquete;
// la app ve contratos tipados con limites (plan bloque 03 t.8).

import type { DatabaseSync } from 'node:sqlite';
import {
  analizar,
  escaparTerminoFts,
  expandir,
  expresionFtsExacta,
  expresionFtsTodas,
  expresionFtsTolerante,
  fusionarRrf,
  normalizarTolerante,
  sugerirErratas,
  type ErrorConsulta,
  type Expansion,
  type MotivoCoincidencia,
  type SugerenciaErrata,
} from '@vestigio/search';

const LIMITE_LISTADO = 200;
const LIMITE_BUSQUEDA = 50;
/** Cuantos candidatos pide cada capa antes de fusionar. */
const CANDIDATOS_POR_CAPA = 60;

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
  /** Ausente cuando la ingesta no pudo saberlo: honestidad, no relleno (E1). */
  autor: string | null;
  fechaPublicacion: string | null;
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
  origenUrl: string | null;
  resumen: string | null;
  etiquetas: string[];
  modulos: string[];
  /** Ruta logica del original dentro de CONTENT (para el lector de PDF). */
  rutaOriginal: string | null;
  bytes: number | null;
  segmentos: SegmentoLectura[];
}

/** Vecino tematico: otro documento que comparte modulo o etiquetas. */
export interface Relacionado {
  id: string;
  titulo: string;
  formato: string;
  /** Que tienen en comun, dicho con palabras. */
  motivo: string;
}

export interface Coincidencia {
  recursoId: string;
  titulo: string;
  formato: string;
  idioma: string;
  localizador: string;
  tituloSeccion: string | null;
  pagina: number | null;
  fragmento: string;
  /** Por que aparecio: exacta, sin-tilde, alias o aproximada. */
  motivo: MotivoCoincidencia;
}

/** Facetas disponibles con su recuento sobre el conjunto ya filtrado. */
export interface Faceta {
  valor: string;
  etiqueta: string;
  cuenta: number;
}

export interface Filtros {
  /** OR dentro de cada faceta, AND entre facetas (plan bloque 09 t.8). */
  formatos?: string[];
  idiomas?: string[];
  modulos?: string[];
}

export interface ResultadoBusqueda {
  coincidencias: Coincidencia[];
  /** Expansiones aplicadas, para mostrarlas: nada ocurre a escondidas. */
  expansiones: Expansion[];
  expansionBloqueadaPor: string | null;
  sugerencias: SugerenciaErrata[];
  /** Error de sintaxis del modo avanzado, con su posicion. */
  error: ErrorConsulta | null;
  facetas: {
    formatos: Faceta[];
    idiomas: Faceta[];
  };
  /** Total de coincidencias antes de aplicar el limite de pagina. */
  total: number;
}

export interface OpcionesBusqueda {
  avanzado?: boolean;
  sinonimos?: boolean;
  filtros?: Filtros;
  limite?: number;
}

const ETIQUETAS_FORMATO: Record<string, string> = {
  pdf: 'PDF',
  epub: 'EPUB',
  html: 'páginas web',
  markdown: 'notas',
  txt: 'texto',
  imagen: 'imágenes',
  audio: 'audio',
  zim: 'colecciones',
};

const ETIQUETAS_IDIOMA: Record<string, string> = {
  es: 'español',
  en: 'inglés',
  ca: 'valenciano',
  und: 'sin determinar',
};

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
                r.num_paginas AS numPaginas, r.autor,
                r.fecha_publicacion AS fechaPublicacion,
                (SELECT count(*) FROM segmentos s WHERE s.recurso_pk = r.pk) AS numSegmentos
         FROM recursos r ORDER BY r.titulo COLLATE NOCASE LIMIT ${String(LIMITE_LISTADO)}`,
      )
      .all() as unknown as RecursoResumen[];
  }

  /** Titulo y slug de un UUID, para exportaciones y listados personales. */
  nombrar(recursoId: string): { titulo: string; slug: string } | null {
    const fila = this.db
      .prepare('SELECT titulo, slug FROM recursos WHERE id = ?')
      .get(recursoId) as { titulo: string; slug: string } | undefined;
    return fila ?? null;
  }

  /**
   * Vecinos tematicos de un recurso: mismo modulo o etiquetas compartidas.
   * Es la "navegacion entre conocimiento" del plan sin inventar relaciones
   * editoriales que nadie ha declarado (E1): solo lo que la ingesta sabe.
   */
  relacionados(recursoId: string, limite = 8): Relacionado[] {
    const tope = Math.min(Math.max(1, limite), 24);
    try {
      return this.db
        .prepare(
          `WITH yo AS (SELECT pk FROM recursos WHERE id = ?)
           SELECT r.id, r.titulo, r.formato,
                  CASE WHEN comunes.modulos > 0 THEN 'del mismo módulo'
                       ELSE 'comparte etiquetas' END AS motivo
           FROM (
             SELECT rm.recurso_pk AS pk, count(*) AS modulos, 0 AS etiquetas
             FROM recurso_modulos rm
             WHERE rm.modulo IN (SELECT modulo FROM recurso_modulos WHERE recurso_pk = (SELECT pk FROM yo))
             GROUP BY rm.recurso_pk
             UNION ALL
             SELECT re.recurso_pk AS pk, 0 AS modulos, count(*) AS etiquetas
             FROM recurso_etiquetas re
             WHERE re.etiqueta_pk IN (SELECT etiqueta_pk FROM recurso_etiquetas WHERE recurso_pk = (SELECT pk FROM yo))
             GROUP BY re.recurso_pk
           ) AS comunes
           JOIN recursos r ON r.pk = comunes.pk
           WHERE r.pk <> (SELECT pk FROM yo)
           GROUP BY r.pk
           ORDER BY sum(comunes.modulos + comunes.etiquetas) DESC, r.titulo COLLATE NOCASE
           LIMIT ${String(tope)}`,
        )
        .all(recursoId) as unknown as Relacionado[];
    } catch {
      // Un catalogo sin tablas tematicas no rompe la ficha: no hay vecinos.
      return [];
    }
  }

  ficha(recursoId: string): FichaRecurso | null {
    const recurso = this.db
      .prepare(
        `SELECT r.pk, r.id, r.slug, r.titulo, r.idioma, r.formato, r.derechos,
                r.estado_texto AS estadoTexto, r.detalle_texto AS detalleTexto,
                r.num_paginas AS numPaginas, r.autor, r.resumen,
                r.fecha_publicacion AS fechaPublicacion,
                r.origen_url AS origenUrl,
                r.origen_sha256 AS origenSha256, r.origen_adquirido AS origenAdquirido
         FROM recursos r WHERE r.id = ?`,
      )
      .get(recursoId) as
      | (RecursoResumen & {
          pk: number;
          derechos: string;
          resumen: string | null;
          origenUrl: string | null;
          origenSha256: string | null;
          origenAdquirido: string | null;
        })
      | undefined;
    if (recurso === undefined) return null;

    const etiquetas = (
      this.db
        .prepare(
          `SELECT e.nombre FROM etiquetas e
           JOIN recurso_etiquetas re ON re.etiqueta_pk = e.pk
           WHERE re.recurso_pk = ? ORDER BY e.nombre COLLATE NOCASE`,
        )
        .all(recurso.pk) as unknown as { nombre: string }[]
    ).map((f) => f.nombre);

    const modulos = (
      this.db
        .prepare('SELECT modulo FROM recurso_modulos WHERE recurso_pk = ? ORDER BY modulo')
        .all(recurso.pk) as unknown as { modulo: string }[]
    ).map((f) => f.modulo);

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
      autor: recurso.autor,
      fechaPublicacion: recurso.fechaPublicacion,
      resumen: recurso.resumen,
      origenSha256: recurso.origenSha256,
      origenAdquirido: recurso.origenAdquirido,
      origenUrl: recurso.origenUrl,
      etiquetas,
      modulos,
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

  /**
   * Busqueda en dos capas con fusion determinista.
   *
   * 1. Capa exacta (respeta ñ, tildes y grafias valencianas): pesa mas.
   * 2. Capa tolerante (sin acentos vocalicos, con variantes de grafia).
   * 3. Capa de alias: los sinonimos del diccionario, si estan activos.
   *
   * Los filtros se aplican en SQL, nunca cargando todo en memoria, y las
   * facetas se cuentan sobre el conjunto ya filtrado.
   */
  buscar(texto: string, opciones: OpcionesBusqueda = {}): ResultadoBusqueda {
    const vacio: ResultadoBusqueda = {
      coincidencias: [],
      expansiones: [],
      expansionBloqueadaPor: null,
      sugerencias: [],
      error: null,
      facetas: { formatos: [], idiomas: [] },
      total: 0,
    };

    const analisis = analizar(texto, opciones.avanzado === true);
    if (!analisis.ok) return { ...vacio, error: analisis.error };
    const consulta = analisis.consulta;
    if (consulta.vacia) return vacio;

    const tope = Math.min(Math.max(1, opciones.limite ?? LIMITE_BUSQUEDA), LIMITE_BUSQUEDA);
    const { condicion, parametros } = this.condicionFiltros(opciones.filtros);

    // --- Capa "todas las palabras": la senal mas fuerte -----------------
    // Un documento que contiene todos los terminos responde mejor que uno
    // que solo comparte una palabra comun ("de", "el", "agua").
    const todasExactas = this.consultarCapa(
      'segmentos_fts',
      expresionFtsTodas(consulta, false),
      condicion,
      parametros,
      'exacta',
    );
    const todasTolerantes = this.consultarCapa(
      'segmentos_tolerante_fts',
      expresionFtsTodas(consulta, true),
      condicion,
      parametros,
      'sin-tilde',
    );

    // --- Capa exacta ---------------------------------------------------
    const exacta = this.consultarCapa(
      'segmentos_fts',
      expresionFtsExacta(consulta),
      condicion,
      parametros,
      'exacta',
    );

    // --- Capa tolerante ------------------------------------------------
    const expresionTolerante = expresionFtsTolerante(consulta);
    const tolerante = this.consultarCapa(
      'segmentos_tolerante_fts',
      expresionTolerante,
      condicion,
      parametros,
      'sin-tilde',
    );

    // --- Capa de alias -------------------------------------------------
    const terminosNormalizados = consulta.terminos
      .filter((t) => !t.excluido)
      .map((t) => normalizarTolerante(t.texto));
    const expansion = expandir(terminosNormalizados, opciones.sinonimos !== false);
    let alias: Coincidencia[] = [];
    if (expansion.expansiones.length > 0) {
      const nuevos = expansion.expansiones.map((e) => escaparTerminoFts(e.anadido));
      alias = this.consultarCapa(
        'segmentos_tolerante_fts',
        nuevos.join(' OR '),
        condicion,
        parametros,
        'alias',
      );
    }

    // --- Capa de titulos (el plan §9.1 exige encontrar por titulo) -----
    const titulosExactos = this.consultarTitulos(
      'recursos_fts',
      expresionFtsExacta(consulta),
      condicion,
      parametros,
      'exacta',
    );
    const titulosTolerantes = this.consultarTitulos(
      'recursos_tolerante_fts',
      expresionTolerante,
      condicion,
      parametros,
      'sin-tilde',
    );

    // --- Fusion --------------------------------------------------------
    const fusion = fusionarRrf<Coincidencia & { clave: string; origen: 'catalogo' }>([
      // Orden de senal (plan §9.2): todas las palabras > titulo > exacta en
      // el cuerpo > sin tildes > alias.
      //
      // El salto de peso hasta la capa "todas las palabras" es deliberado y
      // grande: contener TODOS los terminos es cualitativamente distinto de
      // compartir una palabra comun. Sin ese salto, un documento que solo
      // coincide en "de" acumulaba puntos en varias capas debiles y
      // adelantaba al que responde de verdad a la pregunta.
      { resultados: this.conClave(todasExactas), peso: 24 },
      { resultados: this.conClave(todasTolerantes), peso: 20 },
      // El titulo pesa mas que el cuerpo: quien busca "guia del agua"
      // espera el documento que se llama asi, no una mencion de pasada.
      { resultados: this.conClave(titulosExactos), peso: 4 },
      { resultados: this.conClave(exacta), peso: 3 },
      { resultados: this.conClave(titulosTolerantes), peso: 2.5 },
      { resultados: this.conClave(tolerante), peso: 2 },
      { resultados: this.conClave(alias), peso: 1 },
    ]);

    const coincidencias = fusion.slice(0, tope).map((f) => ({
      recursoId: f.elemento.recursoId,
      titulo: f.elemento.titulo,
      formato: f.elemento.formato,
      idioma: f.elemento.idioma,
      localizador: f.elemento.localizador,
      tituloSeccion: f.elemento.tituloSeccion,
      pagina: f.elemento.pagina,
      fragmento: f.elemento.fragmento,
      motivo: f.motivo,
    }));

    // --- Sugerencias de errata: solo si no encontro nada en ningun sitio
    const sugerencias =
      fusion.length === 0 ? sugerirErratas(terminosNormalizados, this.vocabulario()) : [];

    return {
      coincidencias,
      expansiones: expansion.expansiones,
      expansionBloqueadaPor: expansion.bloqueadaPor,
      sugerencias,
      error: null,
      facetas: this.facetas(condicion, parametros),
      total: fusion.length,
    };
  }

  private conClave(
    coincidencias: Coincidencia[],
  ): (Coincidencia & { clave: string; origen: 'catalogo' })[] {
    return coincidencias.map((c) => ({
      ...c,
      clave: `${c.recursoId}#${c.localizador}`,
      origen: 'catalogo' as const,
    }));
  }

  /** Traduce los filtros a SQL. OR dentro de cada faceta, AND entre ellas. */
  private condicionFiltros(filtros?: Filtros): { condicion: string; parametros: string[] } {
    const partes: string[] = [];
    const parametros: string[] = [];

    if (filtros?.formatos !== undefined && filtros.formatos.length > 0) {
      partes.push(`r.formato IN (${filtros.formatos.map(() => '?').join(',')})`);
      parametros.push(...filtros.formatos);
    }
    if (filtros?.idiomas !== undefined && filtros.idiomas.length > 0) {
      partes.push(`r.idioma IN (${filtros.idiomas.map(() => '?').join(',')})`);
      parametros.push(...filtros.idiomas);
    }
    if (filtros?.modulos !== undefined && filtros.modulos.length > 0) {
      partes.push(
        `EXISTS (SELECT 1 FROM recurso_modulos rm WHERE rm.recurso_pk = r.pk AND rm.modulo IN (${filtros.modulos
          .map(() => '?')
          .join(',')}))`,
      );
      parametros.push(...filtros.modulos);
    }

    return {
      condicion: partes.length === 0 ? '' : ` AND ${partes.join(' AND ')}`,
      parametros,
    };
  }

  private consultarCapa(
    tabla: string,
    expresion: string,
    condicion: string,
    parametrosFiltro: string[],
    motivo: MotivoCoincidencia,
  ): Coincidencia[] {
    if (expresion.length === 0) return [];
    try {
      const filas = this.db
        .prepare(
          `SELECT r.id AS recursoId, r.titulo, r.formato, r.idioma,
                  s.localizador, s.titulo AS tituloSeccion, s.pagina,
                  snippet(${tabla}, 1, '[[', ']]', '…', 14) AS fragmento
           FROM ${tabla}
           JOIN segmentos s ON s.pk = ${tabla}.rowid
           JOIN recursos r ON r.pk = s.recurso_pk
           WHERE ${tabla} MATCH ?${condicion}
           ORDER BY bm25(${tabla}, 4.0, 1.0)
           LIMIT ${String(CANDIDATOS_POR_CAPA)}`,
        )
        .all(expresion, ...parametrosFiltro) as unknown as Omit<Coincidencia, 'motivo'>[];
      return filas.map((f) => ({ ...f, motivo }));
    } catch {
      // Una expresion que FTS5 rechace no puede tumbar la busqueda entera.
      return [];
    }
  }

  /**
   * Coincidencias por titulo o resumen del recurso. Apuntan al primer
   * segmento para que abrir el resultado lleve al principio del documento.
   */
  private consultarTitulos(
    tabla: string,
    expresion: string,
    condicion: string,
    parametrosFiltro: string[],
    motivo: MotivoCoincidencia,
  ): Coincidencia[] {
    if (expresion.length === 0) return [];
    try {
      const filas = this.db
        .prepare(
          `SELECT r.id AS recursoId, r.titulo, r.formato, r.idioma,
                  COALESCE(s.localizador, '') AS localizador,
                  s.titulo AS tituloSeccion, s.pagina,
                  COALESCE(substr(s.cuerpo, 1, 180), r.resumen, '') AS fragmento
           FROM ${tabla}
           JOIN recursos r ON r.pk = ${tabla}.rowid
           LEFT JOIN segmentos s ON s.pk = (
             SELECT pk FROM segmentos WHERE recurso_pk = r.pk ORDER BY orden LIMIT 1
           )
           WHERE ${tabla} MATCH ?${condicion}
           ORDER BY bm25(${tabla}, 8.0, 1.0)
           LIMIT ${String(CANDIDATOS_POR_CAPA)}`,
        )
        .all(expresion, ...parametrosFiltro) as unknown as Omit<Coincidencia, 'motivo'>[];
      return filas.map((f) => ({ ...f, motivo }));
    } catch {
      return [];
    }
  }

  /**
   * Recuentos por faceta sobre el conjunto filtrado. Se calculan en SQL:
   * no se traen miles de filas a memoria para contarlas aqui.
   */
  private facetas(
    condicion: string,
    parametros: string[],
  ): { formatos: Faceta[]; idiomas: Faceta[] } {
    const contar = (columna: string, etiquetas: Record<string, string>): Faceta[] => {
      const filas = this.db
        .prepare(
          `SELECT r.${columna} AS valor, count(*) AS cuenta
           FROM recursos r WHERE 1=1${condicion}
           GROUP BY r.${columna} ORDER BY cuenta DESC, valor`,
        )
        .all(...parametros) as unknown as { valor: string; cuenta: number }[];
      return filas.map((f) => ({
        valor: f.valor,
        etiqueta: etiquetas[f.valor] ?? f.valor,
        cuenta: f.cuenta,
      }));
    };
    return {
      formatos: contar('formato', ETIQUETAS_FORMATO),
      idiomas: contar('idioma', ETIQUETAS_IDIOMA),
    };
  }

  /**
   * Vocabulario real del corpus para las sugerencias de errata: solo se
   * propone lo que existe de verdad (plan bloque 09 t.5).
   */
  private vocabulario(limite = 4000): string[] {
    try {
      const filas = this.db
        .prepare(
          `SELECT term FROM (
             SELECT term, cnt FROM segmentos_vocabulario
             UNION
             SELECT term, cnt FROM recursos_vocabulario
           ) WHERE length(term) >= 4
           ORDER BY cnt DESC LIMIT ${String(limite)}`,
        )
        .all() as unknown as { term: string }[];
      return filas.map((f) => f.term);
    } catch {
      // Catalogo antiguo sin tabla de vocabulario: sin sugerencias, pero
      // la busqueda sigue funcionando.
      return [];
    }
  }
}
