import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import {
  abrirBasePersonal,
  abrirBaseContenido,
  cerrarBasePersonal,
  comprobarIntegridad,
  construirCatalogoFixture,
  ErrorBaseDatos,
  migrar,
  RepositorioPersonal,
  respaldarBasePersonal,
  versionEsquema,
  VERSION_ESQUEMA_PERSONAL,
} from '../src/index.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vestigio-db-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const uuidA = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const uuidB = '9b2d7a10-1234-4abc-8def-0305e82c3399';

function catalogoDePrueba(ruta: string): void {
  construirCatalogoFixture(
    ruta,
    [
      {
        id: uuidA,
        slug: 'guia-agua',
        titulo: 'Guía de desinfección de agua',
        idioma: 'es',
        formato: 'pdf',
        derechos: 'personal-preservation',
        modulos: ['M03'],
        etiquetas: ['agua', 'desinfección'],
        segmentos: [
          { localizador: 'p1', titulo: 'Hervido', cuerpo: 'Hervir el agua un minuto a borbotones' },
          { localizador: 'p2', titulo: 'Lejía', cuerpo: 'Dosis de hipoclorito para un año entero' },
        ],
      },
      {
        id: uuidB,
        slug: 'canon-riego',
        titulo: 'Cañón de riego',
        idioma: 'es',
        formato: 'html',
        derechos: 'open-redistributable',
        modulos: ['M05'],
        segmentos: [{ localizador: 's1', cuerpo: 'El cañón de riego no es un canon literario' }],
      },
    ],
    { corpus: '2026-C0-fixture', informacionVigente: '2026-V0' },
  );
}

describe('base personal', () => {
  it('abre con PRAGMAs afirmados, migra y sobrevive a reapertura', () => {
    const ruta = join(dir, 'user.sqlite');
    const a1 = abrirBasePersonal(ruta);
    expect(a1.versionEsquema).toBe(VERSION_ESQUEMA_PERSONAL);
    expect(a1.cierreLimpioAnterior).toBe(true);
    const repo = new RepositorioPersonal(a1.db);
    repo.aplicarMutacion('m-1', { operacion: 'favorito-poner', recursoId: uuidA });
    cerrarBasePersonal(a1.db);

    const a2 = abrirBasePersonal(ruta);
    expect(a2.cierreLimpioAnterior).toBe(true);
    expect(new RepositorioPersonal(a2.db).listarFavoritos()).toHaveLength(1);
    cerrarBasePersonal(a2.db);
  });

  it('detecta el cierre sucio', () => {
    const ruta = join(dir, 'user.sqlite');
    const a1 = abrirBasePersonal(ruta);
    a1.db.close(); // sin marcar cierre limpio

    const a2 = abrirBasePersonal(ruta);
    expect(a2.cierreLimpioAnterior).toBe(false);
    cerrarBasePersonal(a2.db);
  });

  it('las mutaciones son idempotentes y consultables (respuesta perdida)', () => {
    const ruta = join(dir, 'user.sqlite');
    const { db } = abrirBasePersonal(ruta);
    const repo = new RepositorioPersonal(db);
    expect(repo.aplicarMutacion('m-7', { operacion: 'favorito-poner', recursoId: uuidA })).toBe(
      'aplicada',
    );
    expect(repo.aplicarMutacion('m-7', { operacion: 'favorito-poner', recursoId: uuidA })).toBe(
      'ya-aplicada',
    );
    expect(repo.listarFavoritos()).toHaveLength(1);
    // Tras "perder la respuesta", el estado se consulta por id.
    expect(repo.mutacionAplicada('m-7')).toBe(true);
    expect(repo.mutacionAplicada('m-jamas-enviada')).toBe(false);
    cerrarBasePersonal(db);
  });

  it('rechaza una base de un esquema futuro (downgrade de app)', () => {
    const ruta = join(dir, 'user.sqlite');
    const { db } = abrirBasePersonal(ruta);
    db.exec('PRAGMA user_version=99');
    cerrarBasePersonal(db);
    expect(() => abrirBasePersonal(ruta)).toThrowError(/esquema.*posterior/);
  });

  it('rechaza un fichero que no es una base de Vestigio', () => {
    const ruta = join(dir, 'ajena.sqlite');
    const ajena = new DatabaseSync(ruta);
    ajena.exec('PRAGMA application_id=12345; CREATE TABLE x (y)');
    ajena.close();
    expect(() => abrirBasePersonal(ruta)).toThrowError(ErrorBaseDatos);
  });

  it('los datos personales anclan a UUID: cambiar el slug del catalogo no los rompe', () => {
    const rutaCatalogo = join(dir, 'contenido.sqlite');
    catalogoDePrueba(rutaCatalogo);
    const { db } = abrirBasePersonal(join(dir, 'user.sqlite'));
    const repo = new RepositorioPersonal(db);
    repo.aplicarMutacion('m-1', { operacion: 'favorito-poner', recursoId: uuidA });

    // El favorito guarda el UUID, no el slug ni el pk.
    const favorito = repo.listarFavoritos()[0];
    expect(favorito?.recursoId).toBe(uuidA);
    cerrarBasePersonal(db);
  });
});

describe('migrador', () => {
  it('una migracion que falla a mitad no deja rastro (rollback)', () => {
    const db = new DatabaseSync(join(dir, 'mig.sqlite'));
    expect(() =>
      migrar(db, [
        {
          version: 1,
          descripcion: 'rota a proposito',
          sql: 'CREATE TABLE buena (x); CREATE TABLE rota (y INEXISTENTE_TIPO CHECK (esto ni compila((',
        },
      ]),
    ).toThrow();
    expect(versionEsquema(db)).toBe(0);
    const tablas = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='buena'")
      .all();
    expect(tablas).toHaveLength(0); // ni la parte "buena" sobrevive
    db.close();
  });

  it('las migraciones ya aplicadas no se repiten', () => {
    const db = new DatabaseSync(join(dir, 'mig2.sqlite'));
    const migraciones = [{ version: 1, descripcion: 'x', sql: 'CREATE TABLE a (x)' }];
    expect(migrar(db, migraciones)).toBe(1);
    expect(migrar(db, migraciones)).toBe(0);
    db.close();
  });
});

describe('base de contenido', () => {
  it('el catalogo fixture se abre en solo lectura real y no admite escrituras', () => {
    const ruta = join(dir, 'contenido.sqlite');
    catalogoDePrueba(ruta);
    const { db, versionEsquema: v } = abrirBaseContenido(ruta);
    expect(v).toBe(1);
    expect(() =>
      db.exec(
        "INSERT INTO recursos (id, slug, titulo, idioma, formato, derechos) VALUES ('x','x','x','es','pdf','unknown-blocked')",
      ),
    ).toThrow();
    const recursos = db.prepare('SELECT count(*) AS n FROM recursos').get() as { n: number };
    expect(recursos.n).toBe(2);
    db.close();
  });

  it('FTS del catalogo distingue cañón de canon (ñ preservada)', () => {
    const ruta = join(dir, 'contenido.sqlite');
    catalogoDePrueba(ruta);
    const { db } = abrirBaseContenido(ruta);
    const buscar = (q: string): number =>
      (
        db
          .prepare('SELECT count(*) AS n FROM segmentos_fts WHERE segmentos_fts MATCH ?')
          .get(q) as { n: number }
      ).n;
    expect(buscar('cañón')).toBe(1);
    expect(buscar('canon')).toBe(1);
    expect(buscar('agua')).toBe(1);
    db.close();
  });

  it('sin catalogo no hay base: no se crea un fichero vacio', () => {
    expect(() => abrirBaseContenido(join(dir, 'no-existe.sqlite'))).toThrowError(
      /no se pudo abrir el catalogo/,
    );
    expect(existsSync(join(dir, 'no-existe.sqlite'))).toBe(false);
  });

  it('la integridad detecta corrupcion fisica', () => {
    const ruta = join(dir, 'corrupta.sqlite');
    catalogoDePrueba(ruta);
    // Corrupcion simulada: bytes basura en medio del fichero.
    const contenido = readFileSync(ruta);
    contenido.fill(0xff, 4096, 4200);
    writeFileSync(ruta, contenido);

    let db: ReturnType<typeof abrirBaseContenido>['db'] | null = null;
    const fallo = ((): boolean => {
      try {
        db = abrirBaseContenido(ruta).db;
        return !comprobarIntegridad(db, { conFts: ['segmentos_fts'] }).ok;
      } catch {
        return true; // abrir o comprobar pueden fallar: tambien es deteccion
      } finally {
        try {
          db?.close();
        } catch {
          // una base corrupta puede negarse incluso a cerrar
        }
      }
    })();
    expect(fallo).toBe(true);
  });
});

describe('respaldo', () => {
  it('el backup es un snapshot coherente y rota dos copias', async () => {
    const { db } = abrirBasePersonal(join(dir, 'user.sqlite'));
    const repo = new RepositorioPersonal(db);
    repo.aplicarMutacion('m-1', { operacion: 'favorito-poner', recursoId: uuidA });

    const r1 = await respaldarBasePersonal(db, dir);
    expect(existsSync(r1.ruta)).toBe(true);

    repo.aplicarMutacion('m-2', { operacion: 'favorito-poner', recursoId: uuidB });
    await respaldarBasePersonal(db, dir);
    expect(existsSync(join(dir, 'personal.respaldo.db'))).toBe(true);
    expect(existsSync(join(dir, 'personal.respaldo.1.db'))).toBe(true);

    // La copia reciente contiene ambos favoritos; la anterior, uno.
    const reciente = new DatabaseSync(join(dir, 'personal.respaldo.db'), { readOnly: true });
    const anterior = new DatabaseSync(join(dir, 'personal.respaldo.1.db'), { readOnly: true });
    expect((reciente.prepare('SELECT count(*) AS n FROM favoritos').get() as { n: number }).n).toBe(
      2,
    );
    expect((anterior.prepare('SELECT count(*) AS n FROM favoritos').get() as { n: number }).n).toBe(
      1,
    );
    reciente.close();
    anterior.close();

    // Restauracion: la copia sirve como base personal valida.
    cerrarBasePersonal(db);
    const restaurada = abrirBasePersonal(join(dir, 'personal.respaldo.db'));
    expect(new RepositorioPersonal(restaurada.db).listarFavoritos()).toHaveLength(2);
    cerrarBasePersonal(restaurada.db);
  });
});
