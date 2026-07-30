// Backup en caliente exclusivamente con la Backup API de SQLite (plan §6.2):
// jamas se copia el fichero de una base abierta. Dos snapshots rotativos.

import { backup, DatabaseSync } from 'node:sqlite';
import { existsSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export interface ResultadoRespaldo {
  ruta: string;
  bytesCopiados: boolean;
}

/**
 * Crea un snapshot coherente de la base personal en dirBackups, rotando:
 * personal.respaldo.db (mas reciente) y personal.respaldo.1.db (anterior).
 * Verifica que la copia abre y pasa quick_check antes de rotar.
 */
export async function respaldarBasePersonal(
  db: DatabaseSync,
  dirBackups: string,
): Promise<ResultadoRespaldo> {
  const destinoFinal = join(dirBackups, 'personal.respaldo.db');
  const destinoAnterior = join(dirBackups, 'personal.respaldo.1.db');
  const temporal = join(dirBackups, `personal.respaldo.tmp-${String(process.pid)}.db`);

  if (existsSync(temporal)) rmSync(temporal);
  await backup(db, temporal);

  // La copia debe abrir y estar sana; si no, se descarta sin tocar las buenas.
  const copia = new DatabaseSync(temporal, { readOnly: true });
  try {
    const filas = copia.prepare('PRAGMA quick_check').all() as Record<string, unknown>[];
    const sana = filas.every((f) => String(Object.values(f)[0]) === 'ok');
    if (!sana) throw new Error('el snapshot no supera quick_check');
  } finally {
    copia.close();
  }

  if (existsSync(destinoAnterior)) rmSync(destinoAnterior);
  if (existsSync(destinoFinal)) renameSync(destinoFinal, destinoAnterior);
  renameSync(temporal, destinoFinal);

  db.prepare('INSERT INTO historial_backups (fecha, ruta, resultado) VALUES (?, ?, ?)').run(
    new Date().toISOString(),
    destinoFinal,
    'ok',
  );

  return { ruta: destinoFinal, bytesCopiados: true };
}
