// Apertura de las dos bases con PRAGMAs afirmados (plan §6.2): nunca se
// presupone que un PRAGMA solicitado quedo aplicado; se lee y se exige.

import { DatabaseSync } from 'node:sqlite';
import {
  APPLICATION_ID_CONTENIDO,
  APPLICATION_ID_PERSONAL,
  MIGRACIONES_PERSONAL,
  VERSION_ESQUEMA_CONTENIDO,
  VERSION_ESQUEMA_PERSONAL,
} from './esquemas.js';
import { migrar } from './migrador.js';

export class ErrorBaseDatos extends Error {
  constructor(
    public readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorBaseDatos';
  }
}

function valorPragma(db: DatabaseSync, pragma: string): unknown {
  const fila = db.prepare(`PRAGMA ${pragma}`).get() as Record<string, unknown> | undefined;
  if (fila === undefined) return undefined;
  return Object.values(fila)[0];
}

function afirmarPragma(db: DatabaseSync, pragma: string, esperado: unknown): void {
  const real = valorPragma(db, pragma);
  if (real !== esperado) {
    db.close();
    throw new ErrorBaseDatos(
      'pragma-no-aplicado',
      `PRAGMA ${pragma} = ${String(real)}, esperado ${String(esperado)}`,
    );
  }
}

export interface AperturaPersonal {
  db: DatabaseSync;
  /** false si la sesion anterior no cerro limpiamente. */
  cierreLimpioAnterior: boolean;
  versionEsquema: number;
}

/**
 * Abre (o crea) la base personal: PRAGMAs de produccion afirmados,
 * migraciones aplicadas, marca de cierre limpio gestionada.
 */
export function abrirBasePersonal(ruta: string): AperturaPersonal {
  const db = new DatabaseSync(ruta);

  db.exec('PRAGMA journal_mode=DELETE');
  db.exec('PRAGMA synchronous=EXTRA');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec('PRAGMA trusted_schema=OFF');
  db.exec('PRAGMA busy_timeout=5000');

  afirmarPragma(db, 'journal_mode', 'delete');
  afirmarPragma(db, 'synchronous', 3); // EXTRA
  afirmarPragma(db, 'foreign_keys', 1);
  afirmarPragma(db, 'busy_timeout', 5000);

  const appId = valorPragma(db, 'application_id');
  const version = Number(valorPragma(db, 'user_version'));

  if (appId === 0 && version === 0) {
    // Base nueva: se firma y migra desde cero.
    db.exec(`PRAGMA application_id=${String(APPLICATION_ID_PERSONAL)}`);
  } else if (appId !== APPLICATION_ID_PERSONAL) {
    db.close();
    throw new ErrorBaseDatos('base-ajena', 'el fichero no es una base personal de Vestigio');
  }

  if (version > VERSION_ESQUEMA_PERSONAL) {
    db.close();
    throw new ErrorBaseDatos(
      'esquema-futuro',
      `la base personal es de un esquema ${String(version)} posterior al soportado ${String(VERSION_ESQUEMA_PERSONAL)}; usa una version mas nueva de Vestigio`,
    );
  }

  migrar(db, MIGRACIONES_PERSONAL);

  const cierre = db
    .prepare("SELECT valor FROM estado_sesion WHERE clave = 'cierre_limpio'")
    .get() as { valor: string } | undefined;
  const cierreLimpioAnterior = cierre === undefined || cierre.valor === 'si';

  db.prepare(
    "INSERT INTO estado_sesion (clave, valor) VALUES ('cierre_limpio','no') " +
      "ON CONFLICT(clave) DO UPDATE SET valor='no'",
  ).run();

  return { db, cierreLimpioAnterior, versionEsquema: Number(valorPragma(db, 'user_version')) };
}

/** Marca cierre limpio y cierra. */
export function cerrarBasePersonal(db: DatabaseSync): void {
  try {
    db.prepare("UPDATE estado_sesion SET valor='si' WHERE clave='cierre_limpio'").run();
  } finally {
    db.close();
  }
}

export interface AperturaContenido {
  db: DatabaseSync;
  versionEsquema: number;
}

/**
 * Abre la base de contenido en solo lectura real (opcion del backend) y
 * ademas query_only. Nunca crea el fichero: sin catalogo no hay base.
 */
export function abrirBaseContenido(ruta: string): AperturaContenido {
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(ruta, { readOnly: true });
  } catch (error) {
    throw new ErrorBaseDatos(
      'contenido-no-disponible',
      `no se pudo abrir el catalogo: ${error instanceof Error ? error.message : 'error'}`,
    );
  }
  db.exec('PRAGMA query_only=ON');
  afirmarPragma(db, 'query_only', 1);

  const appId = valorPragma(db, 'application_id');
  if (appId !== APPLICATION_ID_CONTENIDO) {
    db.close();
    throw new ErrorBaseDatos('base-ajena', 'el fichero no es un catalogo de Vestigio');
  }
  const version = Number(valorPragma(db, 'user_version'));
  if (version > VERSION_ESQUEMA_CONTENIDO) {
    db.close();
    throw new ErrorBaseDatos('esquema-futuro', 'catalogo de un esquema posterior al soportado');
  }
  return { db, versionEsquema: version };
}
