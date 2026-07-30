// Puerta de evaluacion de node:sqlite DENTRO del Node embebido por Electron
// (plan §6.4, bloque 03 tarea 1). Se ejecuta con:
//   ELECTRON_RUN_AS_NODE=1 electron.exe scripts/evaluar-node-sqlite.cjs
// Imprime un informe JSON; cualquier fallo marca la puerta como NO superada.

'use strict';
const { mkdtempSync, rmSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

const informe = {
  runtime: {
    node: process.versions.node,
    electron: process.versions.electron ?? 'run-as-node',
    modules: process.versions.modules,
  },
  pruebas: {},
  superada: false,
};

function prueba(nombre, fn) {
  try {
    const detalle = fn();
    informe.pruebas[nombre] = { ok: true, detalle: detalle ?? null };
  } catch (error) {
    informe.pruebas[nombre] = { ok: false, error: String(error && error.message) };
  }
}

let sqlite;
prueba('importable', () => {
  sqlite = require('node:sqlite');
  return Object.keys(sqlite).join(',');
});

const dir = mkdtempSync(join(tmpdir(), 'vestigio-sqlite-'));
const rutaDb = join(dir, 'prueba.db');
let db;

prueba('abrir-y-compile-options', () => {
  db = new sqlite.DatabaseSync(rutaDb);
  const opciones = db
    .prepare('PRAGMA compile_options')
    .all()
    .map((f) => Object.values(f)[0]);
  const necesarias = ['ENABLE_FTS5'];
  const faltan = necesarias.filter((o) => !opciones.some((x) => String(x).includes(o)));
  if (faltan.length > 0) throw new Error(`faltan compile options: ${faltan.join(',')}`);
  return opciones.filter((o) => String(o).startsWith('ENABLE')).join(',');
});

prueba('fts5-real', () => {
  db.exec(
    "CREATE VIRTUAL TABLE prueba_fts USING fts5(titulo, cuerpo, tokenize='unicode61 remove_diacritics 0')",
  );
  const ins = db.prepare('INSERT INTO prueba_fts (titulo, cuerpo) VALUES (?, ?)');
  ins.run('Desinfeccion del agua', 'Como desinfectar agua con lejia en el año 2026');
  ins.run('Cañón de riego', 'El cañón no es un canon');
  const hits = db.prepare('SELECT titulo FROM prueba_fts WHERE prueba_fts MATCH ?').all('cañón');
  if (hits.length !== 1)
    throw new Error(`esperaba 1 resultado exacto para cañón, hay ${hits.length}`);
  const sinTilde = db
    .prepare('SELECT titulo FROM prueba_fts WHERE prueba_fts MATCH ?')
    .all('canon');
  if (sinTilde.length !== 1) throw new Error('remove_diacritics 0 no distingue cañón/canon');
  return 'MATCH exacto con ñ preservada';
});

prueba('pragmas-afirmables', () => {
  db.exec('PRAGMA journal_mode=DELETE');
  db.exec('PRAGMA synchronous=EXTRA');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec('PRAGMA busy_timeout=5000');
  const jm = db.prepare('PRAGMA journal_mode').get();
  const sy = db.prepare('PRAGMA synchronous').get();
  const fk = db.prepare('PRAGMA foreign_keys').get();
  return JSON.stringify({ jm, sy, fk });
});

prueba('backup-api', () => {
  if (typeof sqlite.backup !== 'function') throw new Error('no existe sqlite.backup');
  const destino = join(dir, 'copia.db');
  // backup devuelve promesa; la puerta exige que exista y funcione.
  return sqlite.backup(db, destino).then
    ? 'backup(db, destino) disponible (promesa)'
    : 'backup sincrono';
});

prueba('solo-lectura-real', () => {
  const ro = new sqlite.DatabaseSync(rutaDb, { readOnly: true });
  try {
    ro.exec('CREATE TABLE intrusa (x)');
    throw new Error('una base readOnly acepto una escritura');
  } catch (error) {
    if (String(error.message).includes('intrusa')) throw error;
  } finally {
    ro.close();
  }
  return 'escritura rechazada en readOnly';
});

prueba('query-only', () => {
  const qo = new sqlite.DatabaseSync(rutaDb);
  qo.exec('PRAGMA query_only=ON');
  try {
    qo.exec("INSERT INTO prueba_fts (titulo, cuerpo) VALUES ('x', 'y')");
    throw new Error('query_only no impidio la escritura');
  } catch (error) {
    if (
      !String(error.message).includes('query_only') &&
      !String(error.message).includes('readonly')
    )
      throw error;
  } finally {
    qo.close();
  }
  return 'query_only=ON bloquea escrituras';
});

Promise.resolve(
  informe.pruebas['backup-api'] && informe.pruebas['backup-api'].ok
    ? require('node:sqlite').backup(db, join(dir, 'copia2.db'))
    : null,
)
  .catch((e) => {
    informe.pruebas['backup-api'] = { ok: false, error: String(e && e.message) };
  })
  .then(() => {
    prueba('backup-copia-abre', () => {
      const ruta = join(dir, 'copia2.db');
      if (!existsSync(ruta)) throw new Error('el backup no creo fichero');
      const copia = new sqlite.DatabaseSync(ruta, { readOnly: true });
      const n = copia.prepare('SELECT count(*) AS n FROM prueba_fts').get();
      copia.close();
      return `copia legible con ${JSON.stringify(n)} filas`;
    });
    if (db) db.close();
    rmSync(dir, { recursive: true, force: true });
    informe.superada = Object.values(informe.pruebas).every((p) => p.ok);
    console.log(JSON.stringify(informe, null, 2));
    process.exit(informe.superada ? 0 : 1);
  });
