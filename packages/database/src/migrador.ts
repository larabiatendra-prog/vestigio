// Migrador transaccional (plan §6.2): cada migracion corre en una unica
// transaccion que incluye el incremento de user_version y el apunte en el
// historial; un fallo a mitad deja la base exactamente como estaba.

import type { DatabaseSync } from 'node:sqlite';
import type { Migracion } from './esquemas.js';

export function versionEsquema(db: DatabaseSync): number {
  const fila = db.prepare('PRAGMA user_version').get() as Record<string, unknown>;
  return Number(Object.values(fila)[0]);
}

export function migrar(db: DatabaseSync, migraciones: Migracion[]): number {
  let aplicadas = 0;
  for (const migracion of [...migraciones].sort((a, b) => a.version - b.version)) {
    if (versionEsquema(db) >= migracion.version) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migracion.sql);
      db.exec(`PRAGMA user_version=${String(migracion.version)}`);
      // El historial existe a partir de la migracion 1 de la base personal;
      // en la base de contenido no hay historial y este INSERT no aplica.
      if (
        (
          db
            .prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name='historial_migraciones'",
            )
            .get() as { name: string } | undefined
        )?.name === 'historial_migraciones'
      ) {
        db.prepare('INSERT INTO historial_migraciones (version, descripcion) VALUES (?, ?)').run(
          migracion.version,
          migracion.descripcion,
        );
      }
      db.exec('COMMIT');
      aplicadas++;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return aplicadas;
}
