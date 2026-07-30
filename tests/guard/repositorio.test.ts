import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Tests de guardia del Bloque 00: fallan si alguien intenta versionar en Git
// corpus, datos personales, claves de firma, secretos o binarios grandes.
// La politica vive en PLAN_MAESTRO.md §15 y en ENMIENDAS.md.

const raiz = join(import.meta.dirname, '..', '..');

function archivosVersionados(): string[] {
  const salida = execFileSync('git', ['ls-files', '-z'], { cwd: raiz, encoding: 'utf8' });
  return salida.split('\0').filter((ruta) => ruta.length > 0);
}

const rutasProhibidas: RegExp[] = [
  /^CORPUS_ADMIN\//i,
  /^USER_DATA\//i,
  /^CONTENT\//,
  /^FALLBACK\//i,
];

const extensionesProhibidas: RegExp[] = [
  /\.zim$/i,
  /\.db$/i,
  /\.sqlite3?$/i,
  /\.db-(journal|wal|shm)$/i,
  /\.key$/i,
  /\.pem$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /(^|\/)\.env(\..+)?$/i,
  /minisign.*secret/i,
];

// Fixtures pequenos y trazables si estan permitidos, pero nunca claves ni secretos.
const esFixture = (ruta: string): boolean => ruta.startsWith('content/fixtures/');

const LIMITE_BYTES = 5 * 1024 * 1024; // 5 MB: por encima no es codigo ni metadata, es corpus o build
const LIMITE_FIXTURE_BYTES = 1 * 1024 * 1024; // 1 MB por fixture

describe('guardia del repositorio', () => {
  const archivos = archivosVersionados();

  it('el repositorio tiene archivos versionados', () => {
    expect(archivos.length).toBeGreaterThan(0);
  });

  it('no versiona corpus, datos personales ni fallback generado', () => {
    const infractores = archivos.filter((ruta) =>
      rutasProhibidas.some((patron) => patron.test(ruta)),
    );
    expect(infractores, `Rutas prohibidas en Git: ${infractores.join(', ')}`).toEqual([]);
  });

  it('no versiona bases de datos, claves, certificados ni ficheros de entorno', () => {
    const infractores = archivos.filter((ruta) =>
      extensionesProhibidas.some((patron) => patron.test(ruta)),
    );
    expect(infractores, `Archivos prohibidos en Git: ${infractores.join(', ')}`).toEqual([]);
  });

  it('no versiona archivos grandes: el corpus no viaja en Git', () => {
    const infractores = archivos.filter((ruta) => {
      const limite = esFixture(ruta) ? LIMITE_FIXTURE_BYTES : LIMITE_BYTES;
      try {
        return statSync(join(raiz, ruta)).size > limite;
      } catch {
        return false; // borrado del disco pero aun listado: lo vigila git, no este test
      }
    });
    expect(infractores, `Archivos demasiado grandes en Git: ${infractores.join(', ')}`).toEqual([]);
  });

  it('las claves y secretos tampoco se admiten como fixtures', () => {
    const infractores = archivos.filter(
      (ruta) => esFixture(ruta) && extensionesProhibidas.some((patron) => patron.test(ruta)),
    );
    expect(infractores, `Secretos disfrazados de fixture: ${infractores.join(', ')}`).toEqual([]);
  });
});
