// Comprobaciones de integridad (plan bloque 03, tarea 9). Se ejecutan al
// abrir tras un cierre sucio y bajo demanda desde el diagnostico.

import type { DatabaseSync } from 'node:sqlite';

export interface ResultadoIntegridad {
  ok: boolean;
  problemas: string[];
}

export function comprobarIntegridad(
  db: DatabaseSync,
  opciones: { rapida?: boolean; conFts?: string[] } = {},
): ResultadoIntegridad {
  const problemas: string[] = [];

  const pragma = opciones.rapida === true ? 'quick_check' : 'integrity_check';
  const filas = db.prepare(`PRAGMA ${pragma}`).all() as Record<string, unknown>[];
  for (const fila of filas) {
    const valor = String(Object.values(fila)[0]);
    if (valor !== 'ok') problemas.push(`${pragma}: ${valor}`);
  }

  const fk = db.prepare('PRAGMA foreign_key_check').all();
  if (fk.length > 0) problemas.push(`foreign_key_check: ${String(fk.length)} violaciones`);

  for (const tablaFts of opciones.conFts ?? []) {
    try {
      // El comando especial de FTS5; lanza error SQL si el indice esta mal.
      db.exec(`INSERT INTO ${tablaFts}(${tablaFts}) VALUES('integrity-check')`);
    } catch (error) {
      problemas.push(
        `fts ${tablaFts}: ${error instanceof Error ? error.message : 'indice corrupto'}`,
      );
    }
  }

  return { ok: problemas.length === 0, problemas };
}
