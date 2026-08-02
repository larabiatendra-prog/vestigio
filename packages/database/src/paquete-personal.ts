// Paquete del espacio personal (bloque 12, tareas 6-8): exportar, inspeccionar
// e importar los datos personales.
//
// Tres reglas gobiernan este modulo:
//
//  1. La copia de la base se hace SIEMPRE con la Backup API de SQLite, nunca
//     copiando el fichero de una base abierta.
//  2. Un paquete que llega de fuera es sospechoso hasta que se demuestre lo
//     contrario: primero se descomprime en un area de staging, se verifica
//     el manifiesto, las huellas y el esquema, y solo despues se ofrece
//     restaurar. Un paquete malicioso o incompatible no llega a rozar los
//     datos actuales.
//  3. La restauracion entra entera o no entra: una sola transaccion.

import { DatabaseSync, backup } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { APPLICATION_ID_PERSONAL, VERSION_ESQUEMA_PERSONAL } from './esquemas.js';
import { escribirZip, leerZip, ErrorZip, type EntradaZip } from '@vestigio/zip';
import {
  aJson,
  aMarkdown,
  csvColecciones,
  csvFavoritos,
  csvMarcadores,
  csvNotas,
  csvProgreso,
  volcarPersonal,
  LEEME_PAQUETE,
  type ResolverRecurso,
} from './exportar.js';
import { RepositorioPersonal } from './repositorio-personal.js';

const RUTA_BASE_EN_PAQUETE = 'datos/personal.sqlite';
const RUTA_MANIFIESTO = 'manifiesto.json';
const FORMATO = 'vestigio-espacio-personal';

/** Tablas que viajan en una restauracion, en orden de dependencia. */
const TABLAS_RESTAURABLES = [
  'favoritos',
  'colecciones',
  'coleccion_items',
  'notas',
  'marcadores',
  'progreso_lectura',
  'recientes',
  'ajustes',
] as const;

export class ErrorPaquete extends Error {
  constructor(
    public readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorPaquete';
  }
}

export interface EntradaManifiesto {
  nombre: string;
  bytes: number;
  sha256: string;
}

export interface ResumenEspacio {
  favoritos: number;
  colecciones: number;
  notas: number;
  marcadores: number;
  progreso: number;
}

export interface Manifiesto {
  formato: typeof FORMATO;
  version: 1;
  generado: string;
  app: string;
  corpus: string | null;
  esquemaPersonal: number;
  resumen: ResumenEspacio;
  entradas: EntradaManifiesto[];
}

function sha256(datos: Buffer): string {
  return createHash('sha256').update(datos).digest('hex');
}

// --- Exportar ----------------------------------------------------------------

export interface OpcionesPaquete {
  /** Ruta del .zip a escribir. */
  destino: string;
  /** Carpeta donde dejar el snapshot intermedio (se limpia al terminar). */
  dirTemporal: string;
  generado: string;
  app: string;
  corpus: string | null;
  resolver?: ResolverRecurso;
}

export interface ResultadoPaquete {
  ruta: string;
  bytes: number;
  sha256: string;
  manifiesto: Manifiesto;
}

/**
 * Escribe el paquete completo: base personal por Backup API, exportaciones
 * legibles, LEEME y manifiesto con huellas.
 */
export async function crearPaquetePersonal(
  db: DatabaseSync,
  opciones: OpcionesPaquete,
): Promise<ResultadoPaquete> {
  mkdirSync(opciones.dirTemporal, { recursive: true });
  const snapshot = join(opciones.dirTemporal, `espacio-${String(process.pid)}.sqlite`);
  if (existsSync(snapshot)) rmSync(snapshot);

  await backup(db, snapshot);

  let bytesBase: Buffer;
  try {
    // El snapshot debe abrir y estar sano antes de empaquetarlo.
    const copia = new DatabaseSync(snapshot, { readOnly: true });
    try {
      const filas = copia.prepare('PRAGMA quick_check').all() as Record<string, unknown>[];
      const sana = filas.every((f) => String(Object.values(f)[0]) === 'ok');
      if (!sana) throw new ErrorPaquete('snapshot-danado', 'la copia no supera quick_check');
    } finally {
      copia.close();
    }
    bytesBase = readFileSync(snapshot);
  } finally {
    if (existsSync(snapshot)) rmSync(snapshot, { force: true });
  }

  const repo = new RepositorioPersonal(db);
  const conteo = repo.resumen();
  const volcado = volcarPersonal(db, {
    generado: opciones.generado,
    app: opciones.app,
    corpus: opciones.corpus,
    esquemaPersonal: VERSION_ESQUEMA_PERSONAL,
    ...(opciones.resolver !== undefined ? { resolver: opciones.resolver } : {}),
  });

  const texto = (contenido: string): Buffer => Buffer.from(contenido, 'utf8');
  const entradas: EntradaZip[] = [
    { nombre: RUTA_BASE_EN_PAQUETE, datos: bytesBase },
    { nombre: 'legible/mi-espacio.md', datos: texto(aMarkdown(volcado)) },
    { nombre: 'legible/mi-espacio.json', datos: texto(aJson(volcado)) },
    { nombre: 'legible/favoritos.csv', datos: texto(csvFavoritos(volcado)) },
    { nombre: 'legible/colecciones.csv', datos: texto(csvColecciones(volcado)) },
    { nombre: 'legible/notas.csv', datos: texto(csvNotas(volcado)) },
    { nombre: 'legible/marcadores.csv', datos: texto(csvMarcadores(volcado)) },
    { nombre: 'legible/progreso.csv', datos: texto(csvProgreso(volcado)) },
    { nombre: 'LEEME.txt', datos: texto(LEEME_PAQUETE) },
  ];

  const manifiesto: Manifiesto = {
    formato: FORMATO,
    version: 1,
    generado: opciones.generado,
    app: opciones.app,
    corpus: opciones.corpus,
    esquemaPersonal: VERSION_ESQUEMA_PERSONAL,
    resumen: {
      favoritos: conteo.favoritos,
      colecciones: conteo.colecciones,
      notas: conteo.notas,
      marcadores: conteo.marcadores,
      progreso: volcado.progreso.length,
    },
    entradas: entradas.map((e) => ({
      nombre: e.nombre,
      bytes: e.datos.length,
      sha256: sha256(e.datos),
    })),
  };

  const zip = escribirZip([
    { nombre: RUTA_MANIFIESTO, datos: texto(`${JSON.stringify(manifiesto, null, 2)}\n`) },
    ...entradas,
  ]);

  writeFileSync(opciones.destino, zip);
  return { ruta: opciones.destino, bytes: zip.length, sha256: sha256(zip), manifiesto };
}

// --- Inspeccionar ------------------------------------------------------------

export interface Inspeccion {
  ok: boolean;
  /** Motivos por los que el paquete no se puede adoptar. */
  problemas: string[];
  /** Cosas raras que no impiden restaurar pero conviene decir. */
  avisos: string[];
  manifiesto: Manifiesto | null;
  resumen: ResumenEspacio | null;
  /** Ruta de la base ya extraida en staging (null si no se pudo). */
  rutaBaseStaging: string | null;
}

function validarManifiesto(valor: unknown): Manifiesto | null {
  if (typeof valor !== 'object' || valor === null) return null;
  const m = valor as Record<string, unknown>;
  if (m['formato'] !== FORMATO) return null;
  if (m['version'] !== 1) return null;
  if (typeof m['esquemaPersonal'] !== 'number') return null;
  if (!Array.isArray(m['entradas'])) return null;
  for (const entrada of m['entradas']) {
    if (typeof entrada !== 'object' || entrada === null) return null;
    const e = entrada as Record<string, unknown>;
    if (typeof e['nombre'] !== 'string') return null;
    if (typeof e['sha256'] !== 'string' || !/^[0-9a-f]{64}$/.test(e['sha256'])) return null;
    if (typeof e['bytes'] !== 'number') return null;
  }
  return valor as unknown as Manifiesto;
}

/**
 * Abre el paquete en un area de staging y comprueba todo lo comprobable.
 * No toca la base personal en uso bajo ninguna circunstancia.
 */
export function inspeccionarPaquete(rutaZip: string, dirStaging: string): Inspeccion {
  const problemas: string[] = [];
  const avisos: string[] = [];

  let entradas: EntradaZip[];
  try {
    entradas = leerZip(readFileSync(rutaZip));
  } catch (error) {
    const mensaje =
      error instanceof ErrorZip
        ? error.message
        : `no se pudo leer el fichero: ${error instanceof Error ? error.message : 'error'}`;
    return {
      ok: false,
      problemas: [mensaje],
      avisos,
      manifiesto: null,
      resumen: null,
      rutaBaseStaging: null,
    };
  }

  const porNombre = new Map(entradas.map((e) => [e.nombre, e.datos]));
  const bytesManifiesto = porNombre.get(RUTA_MANIFIESTO);
  if (bytesManifiesto === undefined) {
    problemas.push('el paquete no lleva manifiesto: no es un espacio personal de Vestigio');
    return { ok: false, problemas, avisos, manifiesto: null, resumen: null, rutaBaseStaging: null };
  }

  const manifiesto = ((): Manifiesto | null => {
    try {
      return validarManifiesto(JSON.parse(bytesManifiesto.toString('utf8')));
    } catch {
      return null;
    }
  })();
  if (manifiesto === null) {
    problemas.push('el manifiesto no tiene la forma esperada');
    return { ok: false, problemas, avisos, manifiesto: null, resumen: null, rutaBaseStaging: null };
  }

  if (manifiesto.esquemaPersonal > VERSION_ESQUEMA_PERSONAL) {
    problemas.push(
      `el paquete viene de un Vestigio mas nuevo (esquema ${String(manifiesto.esquemaPersonal)}; este entiende hasta ${String(VERSION_ESQUEMA_PERSONAL)})`,
    );
  }

  // Cada entrada declarada tiene que estar y coincidir byte a byte.
  for (const declarada of manifiesto.entradas) {
    const datos = porNombre.get(declarada.nombre);
    if (datos === undefined) {
      problemas.push(`falta en el paquete: ${declarada.nombre}`);
      continue;
    }
    if (datos.length !== declarada.bytes || sha256(datos) !== declarada.sha256) {
      problemas.push(`no coincide con su huella: ${declarada.nombre}`);
    }
  }
  const declaradas = new Set(manifiesto.entradas.map((e) => e.nombre));
  for (const entrada of entradas) {
    if (entrada.nombre !== RUTA_MANIFIESTO && !declaradas.has(entrada.nombre)) {
      avisos.push(`el paquete lleva un fichero que el manifiesto no declara: ${entrada.nombre}`);
    }
  }

  const bytesBase = porNombre.get(RUTA_BASE_EN_PAQUETE);
  if (bytesBase === undefined) {
    problemas.push('el paquete no contiene la base personal');
    return { ok: false, problemas, avisos, manifiesto, resumen: null, rutaBaseStaging: null };
  }

  mkdirSync(dirStaging, { recursive: true });
  const rutaBaseStaging = join(dirStaging, 'personal.importado.sqlite');
  if (existsSync(rutaBaseStaging)) rmSync(rutaBaseStaging, { force: true });
  writeFileSync(rutaBaseStaging, bytesBase);

  let resumen: ResumenEspacio | null = null;
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(rutaBaseStaging, { readOnly: true });
    db.exec('PRAGMA query_only=ON');
    const appId = Number(
      Object.values(db.prepare('PRAGMA application_id').get() as Record<string, unknown>)[0],
    );
    if (appId !== APPLICATION_ID_PERSONAL) {
      problemas.push('el fichero de datos del paquete no es una base personal de Vestigio');
    }
    const version = Number(
      Object.values(db.prepare('PRAGMA user_version').get() as Record<string, unknown>)[0],
    );
    if (version > VERSION_ESQUEMA_PERSONAL) {
      problemas.push('la base del paquete usa un esquema posterior al que entiende este Vestigio');
    }
    const quick = db.prepare('PRAGMA quick_check').all() as Record<string, unknown>[];
    if (!quick.every((f) => String(Object.values(f)[0]) === 'ok')) {
      problemas.push('la base del paquete esta danada');
    }
    if (problemas.length === 0) {
      const contar = (tabla: string): number =>
        (db?.prepare(`SELECT count(*) AS n FROM ${tabla}`).get() as { n: number } | undefined)?.n ??
        0;
      resumen = {
        favoritos: contar('favoritos'),
        colecciones: contar('colecciones'),
        notas: contar('notas'),
        marcadores: contar('marcadores'),
        progreso: contar('progreso_lectura'),
      };
    }
  } catch (error) {
    problemas.push(
      `no se pudo abrir la base del paquete: ${error instanceof Error ? error.message : 'error'}`,
    );
  } finally {
    db?.close();
  }

  return {
    ok: problemas.length === 0,
    problemas,
    avisos,
    manifiesto,
    resumen,
    rutaBaseStaging,
  };
}

// --- Restaurar ---------------------------------------------------------------

export type ModoRestauracion = 'fusionar' | 'reemplazar';

export interface ResultadoRestauracion {
  modo: ModoRestauracion;
  filasPorTabla: Record<string, number>;
}

/**
 * Copia el espacio personal de la base en staging a la base en uso, dentro
 * de una unica transaccion: si algo falla a mitad, los datos actuales
 * quedan exactamente como estaban.
 *
 * No se importan la papelera, el historial de migraciones ni el registro de
 * mutaciones aplicadas: son diario de a bordo de la instalacion de origen,
 * no datos de Daniel.
 */
export function restaurarEspacioPersonal(
  destino: DatabaseSync,
  rutaBaseStaging: string,
  modo: ModoRestauracion,
): ResultadoRestauracion {
  const origen = new DatabaseSync(rutaBaseStaging, { readOnly: true });
  origen.exec('PRAGMA query_only=ON');
  const filasPorTabla: Record<string, number> = {};

  try {
    const lote: { tabla: string; columnas: string[]; filas: unknown[][] }[] = [];
    for (const tabla of TABLAS_RESTAURABLES) {
      const columnasDestino = new Set(
        (destino.prepare(`PRAGMA table_info(${tabla})`).all() as unknown as { name: string }[]).map(
          (c) => c.name,
        ),
      );
      const columnasOrigen = (
        origen.prepare(`PRAGMA table_info(${tabla})`).all() as unknown as { name: string }[]
      )
        .map((c) => c.name)
        // Solo columnas que existan en ambos lados: un paquete de un esquema
        // anterior se importa sin inventarse nada.
        .filter((c) => columnasDestino.has(c));
      if (columnasOrigen.length === 0) continue;

      const filas = origen
        .prepare(`SELECT ${columnasOrigen.join(', ')} FROM ${tabla}`)
        .all() as unknown as Record<string, unknown>[];
      lote.push({
        tabla,
        columnas: columnasOrigen,
        filas: filas.map((f) => columnasOrigen.map((c) => f[c])),
      });
    }

    destino.exec('BEGIN IMMEDIATE');
    try {
      if (modo === 'reemplazar') {
        for (const tabla of [...TABLAS_RESTAURABLES].reverse()) {
          destino.prepare(`DELETE FROM ${tabla}`).run();
        }
      }
      for (const grupo of lote) {
        const marcas = grupo.columnas.map(() => '?').join(', ');
        const verbo =
          modo === 'reemplazar'
            ? `INSERT INTO ${grupo.tabla}`
            : `INSERT OR IGNORE INTO ${grupo.tabla}`;
        const sentencia = destino.prepare(
          `${verbo} (${grupo.columnas.join(', ')}) VALUES (${marcas})`,
        );
        for (const fila of grupo.filas) {
          sentencia.run(...(fila as (string | number | null)[]));
        }
        filasPorTabla[grupo.tabla] = grupo.filas.length;
      }
      destino.exec('COMMIT');
    } catch (error) {
      destino.exec('ROLLBACK');
      throw new ErrorPaquete(
        'restauracion-fallida',
        `no se pudo restaurar; tus datos actuales siguen intactos: ${error instanceof Error ? error.message : 'error'}`,
      );
    }
  } finally {
    origen.close();
  }

  // Las notas importadas de un esquema viejo pueden venir sin normalizar.
  new RepositorioPersonal(destino).prepararIndices();

  return { modo, filasPorTabla };
}
