import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import {
  abrirBasePersonal,
  cerrarBasePersonal,
  crearPaquetePersonal,
  escribirZip,
  esOperacionMutacion,
  inspeccionarPaquete,
  leerZip,
  migrar,
  nombreEntradaValido,
  restaurarEspacioPersonal,
  volcarPersonal,
  aMarkdown,
  csvNotas,
  MIGRACIONES_PERSONAL,
  RepositorioPersonal,
  VERSION_ESQUEMA_PERSONAL,
  APPLICATION_ID_PERSONAL,
} from '../src/index.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vestigio-espacio-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const uuidA = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const uuidB = '9b2d7a10-1234-4abc-8def-0305e82c3399';

function abrir(nombre = 'user.sqlite'): { db: DatabaseSync; repo: RepositorioPersonal } {
  const { db } = abrirBasePersonal(join(dir, nombre));
  return { db, repo: new RepositorioPersonal(db) };
}

/** Falla la prueba en vez de propagar un valor ausente. */
function exigir<T>(valor: T | null | undefined, que: string): T {
  if (valor === null || valor === undefined) throw new Error(`falta ${que}`);
  return valor;
}

let contador = 0;
function mutar(
  repo: RepositorioPersonal,
  operacion: Parameters<typeof repo.aplicarMutacion>[1],
): void {
  contador += 1;
  repo.aplicarMutacion(`m-${String(contador)}`, operacion);
}

describe('notas', () => {
  it('se crean, se editan y se borran con posibilidad de deshacer', () => {
    const { db, repo } = abrir();
    mutar(repo, {
      operacion: 'nota-crear',
      id: 'n1',
      destinoTipo: 'segmento',
      recursoId: uuidA,
      segmento: 'sec-2',
      contexto: 'Dosis de hipoclorito',
      texto: 'Comprobar la dosis para la cañería del huerto',
    });
    expect(repo.listarNotas(uuidA)).toHaveLength(1);

    mutar(repo, { operacion: 'nota-editar', id: 'n1', texto: 'Revisado: dos gotas por litro' });
    const editada = repo.listarNotas()[0];
    expect(editada?.texto).toBe('Revisado: dos gotas por litro');
    expect(editada?.modificada).not.toBeNull();

    mutar(repo, { operacion: 'nota-borrar', id: 'n1' });
    expect(repo.listarNotas()).toHaveLength(0);
    const papelera = repo.listarPapelera();
    expect(papelera).toHaveLength(1);

    // Deshacer devuelve la nota entera, no un resto.
    mutar(repo, { operacion: 'papelera-restaurar', id: papelera[0]?.id ?? '' });
    const recuperada = repo.listarNotas()[0];
    expect(recuperada?.texto).toBe('Revisado: dos gotas por litro');
    expect(recuperada?.contexto).toBe('Dosis de hipoclorito');
    expect(repo.listarPapelera()).toHaveLength(0);
    cerrarBasePersonal(db);
  });

  it('se buscan sin acertar con las tildes', () => {
    const { db, repo } = abrir();
    mutar(repo, {
      operacion: 'nota-crear',
      id: 'n1',
      destinoTipo: 'recurso',
      recursoId: uuidA,
      texto: 'Revisar la cañería antes del invierno',
    });
    mutar(repo, {
      operacion: 'nota-crear',
      id: 'n2',
      destinoTipo: 'recurso',
      recursoId: uuidB,
      texto: 'Comprar depósito de agua',
    });

    // Los acentos vocalicos sobran: "deposito" encuentra "depósito".
    expect(repo.buscarNotas('deposito')).toHaveLength(1);
    expect(repo.buscarNotas('depósito')).toHaveLength(1);
    // La 'ñ' es una letra, no una tilde: se conserva aqui igual que en el
    // buscador de la biblioteca, asi que hay que escribirla.
    expect(repo.buscarNotas('cañeria')).toHaveLength(1);
    expect(repo.buscarNotas('cañería')).toHaveLength(1);
    expect(repo.buscarNotas('caneria')).toHaveLength(0);

    expect(repo.buscarNotas('')).toHaveLength(2);
    // El comodin de LIKE escrito por el usuario no es un comodin.
    expect(repo.buscarNotas('%')).toHaveLength(0);
    cerrarBasePersonal(db);
  });

  it('el contrato rechaza una nota vacia, descomunal o con destino inventado', () => {
    const base = { operacion: 'nota-crear', id: 'n9', recursoId: uuidA } as const;
    expect(esOperacionMutacion({ ...base, destinoTipo: 'recurso', texto: 'vale' })).toBe(true);
    expect(esOperacionMutacion({ ...base, destinoTipo: 'recurso', texto: '' })).toBe(false);
    expect(esOperacionMutacion({ ...base, destinoTipo: 'recurso', texto: 'x'.repeat(20001) })).toBe(
      false,
    );
    expect(esOperacionMutacion({ ...base, destinoTipo: 'inventado', texto: 'vale' })).toBe(false);
    expect(esOperacionMutacion({ operacion: 'coleccion-crear', id: 'c', nombre: '' })).toBe(false);
    expect(
      esOperacionMutacion({
        operacion: 'progreso-guardar',
        recursoId: uuidA,
        localizador: 'x',
        porcentaje: 101,
      }),
    ).toBe(false);
  });
});

describe('colecciones', () => {
  it('se crean, se llenan, se borran enteras y se deshacen con sus elementos', () => {
    const { db, repo } = abrir();
    mutar(repo, { operacion: 'coleccion-crear', id: 'c1', nombre: 'Invierno' });
    mutar(repo, { operacion: 'coleccion-anadir', coleccionId: 'c1', recursoId: uuidA });
    mutar(repo, { operacion: 'coleccion-anadir', coleccionId: 'c1', recursoId: uuidB });
    // Anadir dos veces el mismo recurso no lo duplica.
    mutar(repo, { operacion: 'coleccion-anadir', coleccionId: 'c1', recursoId: uuidB });

    expect(repo.listarColecciones()[0]?.elementos).toBe(2);
    expect(repo.itemsColeccion('c1').map((i) => i.recursoId)).toEqual([uuidA, uuidB]);

    mutar(repo, { operacion: 'coleccion-borrar', id: 'c1' });
    expect(repo.listarColecciones()).toHaveLength(0);
    expect(repo.itemsColeccion('c1')).toHaveLength(0);

    const entrada = repo.listarPapelera()[0];
    expect(entrada?.descripcion).toContain('2 elementos');
    mutar(repo, { operacion: 'papelera-restaurar', id: entrada?.id ?? '' });
    expect(repo.listarColecciones()[0]?.elementos).toBe(2);
    cerrarBasePersonal(db);
  });

  it('anadir a una coleccion inexistente no crea basura', () => {
    const { db, repo } = abrir();
    mutar(repo, { operacion: 'coleccion-anadir', coleccionId: 'fantasma', recursoId: uuidA });
    expect(repo.itemsColeccion('fantasma')).toHaveLength(0);
    cerrarBasePersonal(db);
  });
});

describe('marcadores, progreso y recientes', () => {
  it('un mismo punto no se marca dos veces', () => {
    const { db, repo } = abrir();
    mutar(repo, {
      operacion: 'marcador-poner',
      id: 'b1',
      recursoId: uuidA,
      localizador: 'sec-2',
      etiqueta: 'la tabla de dosis',
    });
    mutar(repo, {
      operacion: 'marcador-poner',
      id: 'b2',
      recursoId: uuidA,
      localizador: 'sec-2',
      etiqueta: 'la tabla buena',
    });
    const marcadores = repo.listarMarcadores(uuidA);
    expect(marcadores).toHaveLength(1);
    expect(marcadores[0]?.etiqueta).toBe('la tabla buena');

    mutar(repo, { operacion: 'marcador-quitar', recursoId: uuidA, localizador: 'sec-2' });
    expect(repo.listarMarcadores()).toHaveLength(0);
    expect(repo.listarPapelera()).toHaveLength(1);
    cerrarBasePersonal(db);
  });

  it('el progreso guarda localizador, pagina y fallback textual', () => {
    const { db, repo } = abrir();
    mutar(repo, {
      operacion: 'progreso-guardar',
      recursoId: uuidA,
      localizador: 'sec-3',
      porcentaje: 42.5,
      pagina: 7,
      fallbackTexto: 'Hervir el agua un minuto',
    });
    const p = repo.progreso(uuidA);
    expect(p?.localizador).toBe('sec-3');
    expect(p?.pagina).toBe(7);
    expect(p?.fallbackTexto).toBe('Hervir el agua un minuto');

    // Guardar de nuevo actualiza en vez de duplicar.
    mutar(repo, {
      operacion: 'progreso-guardar',
      recursoId: uuidA,
      localizador: 'sec-4',
      porcentaje: 60,
    });
    expect(repo.listarProgreso()).toHaveLength(1);
    expect(repo.progreso(uuidA)?.localizador).toBe('sec-4');
    cerrarBasePersonal(db);
  });

  it('la lista de recientes no crece sin fin', () => {
    const { db, repo } = abrir();
    for (let i = 0; i < 60; i++) {
      mutar(repo, { operacion: 'reciente-registrar', recursoId: `recurso-${String(i)}` });
    }
    expect(repo.listarRecientes(40).length).toBeLessThanOrEqual(40);
    cerrarBasePersonal(db);
  });

  it('los ajustes de lectura persisten', () => {
    const { db, repo } = abrir();
    mutar(repo, { operacion: 'ajuste-guardar', clave: 'lectura.tamano', valor: '20' });
    mutar(repo, { operacion: 'ajuste-guardar', clave: 'lectura.tamano', valor: '22' });
    expect(repo.ajustes()['lectura.tamano']).toBe('22');
    cerrarBasePersonal(db);
  });
});

describe('migracion 2 sobre datos de un esquema anterior', () => {
  it('conserva las notas existentes y las deja buscables', () => {
    const ruta = join(dir, 'vieja.sqlite');
    const vieja = new DatabaseSync(ruta);
    vieja.exec(`PRAGMA application_id=${String(APPLICATION_ID_PERSONAL)}`);
    migrar(vieja, [exigir(MIGRACIONES_PERSONAL[0], 'la migracion 1')]);
    vieja
      .prepare(
        'INSERT INTO notas (id, destino_tipo, recurso_id, texto, creada) VALUES (?, ?, ?, ?, ?)',
      )
      .run('vieja-1', 'recurso', uuidA, 'Cañería del huerto', '2026-07-01T00:00:00.000Z');
    vieja
      .prepare('INSERT INTO marcadores (id, recurso_id, localizador) VALUES (?, ?, ?)')
      .run('mk-1', uuidA, 'sec-1');
    // Duplicado que la migracion tiene que resolver antes del indice unico.
    vieja
      .prepare('INSERT INTO marcadores (id, recurso_id, localizador) VALUES (?, ?, ?)')
      .run('mk-2', uuidA, 'sec-1');
    vieja.close();

    const abierta = abrirBasePersonal(ruta);
    expect(abierta.versionEsquema).toBe(VERSION_ESQUEMA_PERSONAL);
    const repo = new RepositorioPersonal(abierta.db);
    expect(repo.listarNotas()).toHaveLength(1);
    expect(repo.listarMarcadores()).toHaveLength(1);

    // Antes de reindexar la nota vieja no es buscable sin tildes; despues si.
    expect(repo.prepararIndices()).toBe(1);
    expect(repo.buscarNotas('cañeria')).toHaveLength(1);
    cerrarBasePersonal(abierta.db);
  });
});

describe('contenedor ZIP', () => {
  // El contenedor y sus defensas se prueban a fondo en packages/zip. Aqui
  // solo se comprueba que el paquete personal sigue hablando con el.
  it('se re-exporta y funciona desde el paquete de datos', () => {
    const entradas = [{ nombre: 'prueba.txt', datos: Buffer.from('hola', 'utf8') }];
    expect(leerZip(escribirZip(entradas))[0]?.datos.toString('utf8')).toBe('hola');
    expect(nombreEntradaValido('../fuera.txt')).toBe(false);
  });
});

describe('exportacion legible', () => {
  function conDatos(repo: RepositorioPersonal): void {
    mutar(repo, { operacion: 'favorito-poner', recursoId: uuidA });
    mutar(repo, { operacion: 'coleccion-crear', id: 'c1', nombre: 'Invierno' });
    mutar(repo, { operacion: 'coleccion-anadir', coleccionId: 'c1', recursoId: uuidA });
    mutar(repo, {
      operacion: 'nota-crear',
      id: 'n1',
      destinoTipo: 'pagina',
      recursoId: uuidA,
      pagina: 3,
      texto: 'La tabla de dosis, con "comillas" y, comas',
    });
    mutar(repo, {
      operacion: 'progreso-guardar',
      recursoId: uuidA,
      localizador: 'p3',
      porcentaje: 75,
      pagina: 3,
    });
  }

  const opciones = {
    generado: '2026-07-31T10:00:00.000Z',
    app: '0.1.0',
    corpus: '2026-C1-semilla',
    esquemaPersonal: VERSION_ESQUEMA_PERSONAL,
    resolver: (id: string) =>
      id === uuidA ? { titulo: 'Guía de desinfección de agua', slug: 'guia-agua' } : null,
  };

  it('el markdown es legible y nombra los documentos, no solo los UUID', () => {
    const { db, repo } = abrir();
    conDatos(repo);
    const md = aMarkdown(volcarPersonal(db, opciones));
    expect(md).toContain('# Mi espacio en Vestigio');
    expect(md).toContain('Guía de desinfección de agua');
    expect(md).toContain('La tabla de dosis');
    expect(md).toContain('Invierno');
    cerrarBasePersonal(db);
  });

  it('un documento que ya no esta en el catalogo se declara, no se oculta', () => {
    const { db, repo } = abrir();
    mutar(repo, { operacion: 'favorito-poner', recursoId: uuidB });
    const md = aMarkdown(volcarPersonal(db, opciones));
    expect(md).toContain('documento sin catalogar');
    expect(md).toContain(uuidB);
    cerrarBasePersonal(db);
  });

  it('el CSV escapa comillas y comas segun RFC 4180', () => {
    const { db, repo } = abrir();
    conDatos(repo);
    const csv = csvNotas(volcarPersonal(db, opciones));
    expect(csv).toContain('"La tabla de dosis, con ""comillas"" y, comas"');
    cerrarBasePersonal(db);
  });

  it('exportar dos veces el mismo estado da exactamente lo mismo', () => {
    const { db, repo } = abrir();
    conDatos(repo);
    expect(aMarkdown(volcarPersonal(db, opciones))).toBe(aMarkdown(volcarPersonal(db, opciones)));
    cerrarBasePersonal(db);
  });
});

describe('paquete del espacio personal', () => {
  async function paqueteDePrueba(): Promise<{ ruta: string; db: DatabaseSync }> {
    const { db, repo } = abrir();
    mutar(repo, { operacion: 'favorito-poner', recursoId: uuidA });
    mutar(repo, { operacion: 'coleccion-crear', id: 'c1', nombre: 'Invierno' });
    mutar(repo, { operacion: 'coleccion-anadir', coleccionId: 'c1', recursoId: uuidA });
    mutar(repo, {
      operacion: 'nota-crear',
      id: 'n1',
      destinoTipo: 'recurso',
      recursoId: uuidA,
      texto: 'Nota que tiene que sobrevivir a todo',
    });
    const ruta = join(dir, 'espacio.zip');
    await crearPaquetePersonal(db, {
      destino: ruta,
      dirTemporal: join(dir, 'tmp'),
      generado: '2026-07-31T10:00:00.000Z',
      app: '0.1.0',
      corpus: '2026-C1-semilla',
    });
    return { ruta, db };
  }

  it('el paquete lleva la base, las versiones legibles y un manifiesto con huellas', async () => {
    const { ruta, db } = await paqueteDePrueba();
    const entradas = leerZip(readFileSync(ruta));
    const nombres = entradas.map((e) => e.nombre);
    expect(nombres).toContain('manifiesto.json');
    expect(nombres).toContain('datos/personal.sqlite');
    expect(nombres).toContain('legible/mi-espacio.md');
    expect(nombres).toContain('legible/notas.csv');
    expect(nombres).toContain('LEEME.txt');

    const inspeccion = inspeccionarPaquete(ruta, join(dir, 'staging'));
    expect(inspeccion.problemas).toEqual([]);
    expect(inspeccion.ok).toBe(true);
    expect(inspeccion.resumen?.notas).toBe(1);
    expect(inspeccion.resumen?.colecciones).toBe(1);
    cerrarBasePersonal(db);
  });

  it('un paquete manipulado se detecta y no se adopta', async () => {
    const { ruta, db } = await paqueteDePrueba();
    cerrarBasePersonal(db);

    // Se reescribe el markdown conservando el manifiesto original.
    const entradas = leerZip(readFileSync(ruta)).map((e) =>
      e.nombre === 'legible/mi-espacio.md'
        ? { nombre: e.nombre, datos: Buffer.from('contenido sustituido', 'utf8') }
        : e,
    );
    const rutaFalsa = join(dir, 'manipulado.zip');
    writeFileSync(rutaFalsa, escribirZip(entradas));

    const inspeccion = inspeccionarPaquete(rutaFalsa, join(dir, 'staging2'));
    expect(inspeccion.ok).toBe(false);
    expect(inspeccion.problemas.join(' ')).toContain('huella');
  });

  it('un fichero que no es un paquete se rechaza con un motivo claro', () => {
    const basura = join(dir, 'basura.zip');
    writeFileSync(basura, Buffer.from('esto no es un zip ni de lejos', 'utf8'));
    const inspeccion = inspeccionarPaquete(basura, join(dir, 'staging3'));
    expect(inspeccion.ok).toBe(false);
    expect(inspeccion.rutaBaseStaging).toBeNull();
  });

  it('restaurar fusiona sin perder lo que ya habia', async () => {
    const { ruta, db } = await paqueteDePrueba();
    cerrarBasePersonal(db);

    const destino = abrir('otro-equipo.sqlite');
    mutar(destino.repo, { operacion: 'favorito-poner', recursoId: uuidB });
    mutar(destino.repo, {
      operacion: 'nota-crear',
      id: 'local-1',
      destinoTipo: 'recurso',
      recursoId: uuidB,
      texto: 'Nota local previa',
    });

    const inspeccion = inspeccionarPaquete(ruta, join(dir, 'staging4'));
    expect(inspeccion.ok).toBe(true);
    restaurarEspacioPersonal(
      destino.db,
      exigir(inspeccion.rutaBaseStaging, 'la base en staging'),
      'fusionar',
    );

    expect(destino.repo.listarFavoritos()).toHaveLength(2);
    expect(destino.repo.listarNotas()).toHaveLength(2);
    expect(destino.repo.listarColecciones()).toHaveLength(1);
    cerrarBasePersonal(destino.db);
  });

  it('restaurar reemplazando deja exactamente el paquete', async () => {
    const { ruta, db } = await paqueteDePrueba();
    cerrarBasePersonal(db);

    const destino = abrir('reemplazo.sqlite');
    mutar(destino.repo, { operacion: 'favorito-poner', recursoId: uuidB });
    const inspeccion = inspeccionarPaquete(ruta, join(dir, 'staging5'));
    restaurarEspacioPersonal(
      destino.db,
      exigir(inspeccion.rutaBaseStaging, 'la base en staging'),
      'reemplazar',
    );

    const favoritos = destino.repo.listarFavoritos();
    expect(favoritos).toHaveLength(1);
    expect(favoritos[0]?.recursoId).toBe(uuidA);
    cerrarBasePersonal(destino.db);
  });

  it('una restauracion que falla a mitad deja los datos actuales intactos', async () => {
    const { ruta, db } = await paqueteDePrueba();
    cerrarBasePersonal(db);

    const destino = abrir('intacto.sqlite');
    mutar(destino.repo, { operacion: 'favorito-poner', recursoId: uuidB });
    const inspeccion = inspeccionarPaquete(ruta, join(dir, 'staging6'));

    // Se rompe el fichero de staging DESPUES de inspeccionarlo: la
    // restauracion no puede completarse.
    writeFileSync(
      exigir(inspeccion.rutaBaseStaging, 'la base en staging'),
      Buffer.from('ya no es una base', 'utf8'),
    );
    expect(() =>
      restaurarEspacioPersonal(
        destino.db,
        exigir(inspeccion.rutaBaseStaging, 'la base en staging'),
        'reemplazar',
      ),
    ).toThrow();

    // Lo que habia sigue ahi.
    expect(destino.repo.listarFavoritos()).toHaveLength(1);
    expect(destino.repo.listarFavoritos()[0]?.recursoId).toBe(uuidB);
    cerrarBasePersonal(destino.db);
  });

  it('el paquete no se escribe si el destino no existe, y el temporal no queda tirado', async () => {
    const { db } = abrir('sin-destino.sqlite');
    const dirTemporal = join(dir, 'tmp-limpio');
    await expect(
      crearPaquetePersonal(db, {
        destino: join(dir, 'carpeta-que-no-existe', 'x.zip'),
        dirTemporal,
        generado: '2026-07-31T10:00:00.000Z',
        app: '0.1.0',
        corpus: null,
      }),
    ).rejects.toThrow();
    expect(existsSync(join(dirTemporal, `espacio-${String(process.pid)}.sqlite`))).toBe(false);
    cerrarBasePersonal(db);
  });
});
