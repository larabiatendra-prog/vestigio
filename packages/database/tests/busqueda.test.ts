import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  abrirBaseContenido,
  construirCatalogoFixture,
  RepositorioContenido,
} from '../src/index.js';
import type { DatabaseSync } from 'node:sqlite';

// Busqueda de extremo a extremo sobre un catalogo real: los casos de
// contrato del plan §9.2 comprobados contra SQLite, no solo contra las
// funciones de normalizacion.

let dir: string;
let db: DatabaseSync;
let repo: RepositorioContenido;

const uuid = (n: number): string =>
  `0000000${String(n)}-0000-8000-8000-00000000000${String(n)}`.slice(0, 36);

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'vestigio-busq-'));
  const ruta = join(dir, 'contenido.sqlite');

  construirCatalogoFixture(
    ruta,
    [
      {
        id: uuid(1),
        slug: 'agua',
        titulo: 'Desinfección del agua',
        idioma: 'es',
        formato: 'markdown',
        derechos: 'personal-preservation',
        modulos: ['M03'],
        segmentos: [
          {
            localizador: 'sec-1',
            titulo: 'Con lejía',
            cuerpo:
              'Añadir dos gotas de lejía por litro y esperar treinta minutos antes de beber. El año pasado se revisó la dosis.',
          },
          {
            localizador: 'sec-2',
            titulo: 'Hervido',
            cuerpo: 'Hervir el agua un minuto a borbotones destruye los patógenos habituales.',
          },
        ],
      },
      {
        id: uuid(2),
        slug: 'riego',
        titulo: 'El cañón de riego',
        idioma: 'es',
        formato: 'html',
        derechos: 'open-redistributable',
        modulos: ['M05'],
        segmentos: [
          {
            localizador: 'sec-1',
            titulo: 'Instalación',
            cuerpo: 'El cañón de riego cubre una parcela grande. La montaña queda al norte.',
          },
        ],
      },
      {
        id: uuid(3),
        slug: 'canon',
        titulo: 'Canon literario del siglo XX',
        idioma: 'es',
        formato: 'pdf',
        derechos: 'personal-preservation',
        modulos: ['M11'],
        segmentos: [
          {
            localizador: 'p1',
            cuerpo: 'El canon literario reúne las obras consideradas centrales. Ano de referencia.',
            pagina: 1,
          },
        ],
      },
      {
        id: uuid(4),
        slug: 'valencia',
        titulo: 'La façana del col·legi',
        idioma: 'ca',
        formato: 'txt',
        derechos: 'open-redistributable',
        modulos: ['M07'],
        segmentos: [
          {
            localizador: 'bloque-1',
            cuerpo:
              'La façana del col·legi necessita protecció contra la pluja. El pingüino no viu aquí.',
          },
        ],
      },
      {
        id: uuid(5),
        slug: 'rcp',
        titulo: 'Reanimación cardiopulmonar',
        idioma: 'es',
        formato: 'markdown',
        derechos: 'personal-preservation',
        modulos: ['M02'],
        segmentos: [
          {
            localizador: 'sec-1',
            titulo: 'Compresiones',
            cuerpo:
              'La reanimación cardiopulmonar exige compresiones de 5 cm a 100 por minuto. No interrumpir sin necesidad.',
          },
        ],
      },
    ],
    { corpus: 'prueba-09', informacionVigente: '' },
  );

  db = abrirBaseContenido(ruta).db;
  repo = new RepositorioContenido(db);
});

afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const titulos = (texto: string, opciones = {}): string[] =>
  repo.buscar(texto, opciones).coincidencias.map((c) => c.titulo);

describe('la eñe y las tildes en la busqueda real', () => {
  it('cañón encuentra el cañón, no el canon literario', () => {
    const r = repo.buscar('cañón');
    expect(r.coincidencias[0]?.titulo).toBe('El cañón de riego');
    expect(r.coincidencias[0]?.motivo).toBe('exacta');
    expect(titulos('cañón')).not.toContain('Canon literario del siglo XX');
  });

  it('canon encuentra el canon literario, no el cañón', () => {
    expect(titulos('canon')).toContain('Canon literario del siglo XX');
    expect(titulos('canon')).not.toContain('El cañón de riego');
  });

  it('año y ano no se mezclan', () => {
    expect(titulos('año')).toContain('Desinfección del agua');
    expect(titulos('año')).not.toContain('Canon literario del siglo XX');
    expect(titulos('ano')).toContain('Canon literario del siglo XX');
    expect(titulos('ano')).not.toContain('Desinfección del agua');
  });

  it('escribir sin tildes encuentra igual, y lo dice', () => {
    const r = repo.buscar('desinfeccion');
    expect(r.coincidencias[0]?.titulo).toBe('Desinfección del agua');
    expect(r.coincidencias[0]?.motivo).toBe('sin-tilde');
  });

  it('escribir con tilde da coincidencia exacta', () => {
    const r = repo.buscar('desinfección');
    expect(r.coincidencias[0]?.motivo).toBe('exacta');
  });

  it('patógenos se encuentra escribiendo patogenos', () => {
    expect(titulos('patogenos')).toContain('Desinfección del agua');
  });
});

describe('grafias valencianas', () => {
  it('facana encuentra façana', () => {
    expect(titulos('facana')).toContain('La façana del col·legi');
  });

  it('collegi encuentra col·legi', () => {
    expect(titulos('collegi')).toContain('La façana del col·legi');
  });

  it('proteccio encuentra protecció', () => {
    expect(titulos('proteccio')).toContain('La façana del col·legi');
  });

  it('pinguino encuentra pingüino', () => {
    expect(titulos('pinguino')).toContain('La façana del col·legi');
  });
});

describe('sinonimos y siglas', () => {
  it('RCP encuentra reanimacion cardiopulmonar por sinonimo', () => {
    const r = repo.buscar('RCP');
    expect(r.coincidencias.map((c) => c.titulo)).toContain('Reanimación cardiopulmonar');
    expect(r.expansiones.some((e) => e.anadido.includes('reanimacion'))).toBe(true);
  });

  it('desactivar sinonimos deja la busqueda literal', () => {
    const r = repo.buscar('RCP', { sinonimos: false });
    expect(r.expansiones).toEqual([]);
    expect(r.expansionBloqueadaPor).toContain('desactivada');
  });

  it('hipoclorito encuentra lejia', () => {
    expect(titulos('hipoclorito')).toContain('Desinfección del agua');
  });

  it('una consulta con cifras no se expande', () => {
    const r = repo.buscar('lejia 2 gotas');
    expect(r.expansiones).toEqual([]);
    expect(r.expansionBloqueadaPor).toContain('cifras');
  });
});

describe('filtros combinables', () => {
  it('filtra por formato y cuenta las facetas', () => {
    const r = repo.buscar('el', { filtros: { formatos: ['pdf'] } });
    expect(r.coincidencias.every((c) => c.formato === 'pdf')).toBe(true);
    const total = r.facetas.formatos.reduce((s, f) => s + f.cuenta, 0);
    expect(total).toBe(1); // solo hay un pdf en el catalogo
  });

  it('OR dentro de la faceta: dos formatos suman', () => {
    const r = repo.buscar('el', { filtros: { formatos: ['pdf', 'html'] } });
    const formatos = new Set(r.coincidencias.map((c) => c.formato));
    expect([...formatos].every((f) => f === 'pdf' || f === 'html')).toBe(true);
  });

  it('AND entre facetas: formato e idioma a la vez', () => {
    const r = repo.buscar('el', { filtros: { formatos: ['txt'], idiomas: ['es'] } });
    // El unico txt es en valenciano: la interseccion es vacia.
    expect(r.coincidencias).toHaveLength(0);
  });

  it('las facetas traen etiqueta legible', () => {
    const r = repo.buscar('agua');
    const idioma = r.facetas.idiomas.find((f) => f.valor === 'es');
    expect(idioma?.etiqueta).toBe('español');
  });
});

describe('erratas: sugerir, jamas sustituir', () => {
  it('propone una correccion cuando no hay coincidencias', () => {
    const r = repo.buscar('desinfecion');
    expect(r.sugerencias.length).toBeGreaterThan(0);
    expect(r.sugerencias[0]?.sugerido).toContain('desinfec');
    // Lo importante: NO ha buscado por su cuenta la palabra corregida.
    expect(r.coincidencias).toHaveLength(0);
  });

  it('no sugiere nada si la palabra existe', () => {
    expect(repo.buscar('agua').sugerencias).toEqual([]);
  });

  it('nunca sugiere sobre cifras', () => {
    expect(repo.buscar('100 por minuto').sugerencias).toEqual([]);
  });
});

describe('modo avanzado', () => {
  it('las frases exactas buscan la secuencia', () => {
    const r = repo.buscar('"un minuto a borbotones"', { avanzado: true });
    expect(r.coincidencias[0]?.titulo).toBe('Desinfección del agua');
  });

  it('la exclusion quita resultados', () => {
    const conTodo = repo.buscar('el', { avanzado: true }).coincidencias.length;
    const sinCanon = repo.buscar('el -canon', { avanzado: true }).coincidencias.length;
    expect(sinCanon).toBeLessThan(conTodo);
  });

  it('un error de sintaxis se explica y no busca nada', () => {
    const r = repo.buscar('"sin cerrar', { avanzado: true });
    expect(r.error?.mensaje).toContain('comilla');
    expect(r.coincidencias).toEqual([]);
  });

  it('en modo sencillo las comillas son texto, no sintaxis', () => {
    const r = repo.buscar('"sin cerrar');
    expect(r.error).toBeNull();
  });
});

describe('orden de senal: relevancia real', () => {
  it('el documento con TODAS las palabras gana al que solo comparte una comun', () => {
    // 'de' aparece en casi todo; solo un documento tiene las tres palabras.
    const r = repo.buscar('gotas de lejía');
    expect(r.coincidencias[0]?.titulo).toBe('Desinfección del agua');
  });

  it('el titulo pesa mas que una mencion de pasada en el cuerpo', () => {
    const r = repo.buscar('canon literario');
    expect(r.coincidencias[0]?.titulo).toBe('Canon literario del siglo XX');
  });

  it('una coincidencia exacta se ordena antes que una tolerante', () => {
    const r = repo.buscar('montaña');
    expect(r.coincidencias[0]?.motivo).toBe('exacta');
  });
});

describe('robustez', () => {
  it('una consulta vacia no devuelve el corpus entero', () => {
    expect(repo.buscar('   ').coincidencias).toEqual([]);
    expect(repo.buscar('').total).toBe(0);
  });

  it('intentos de inyeccion se buscan como texto', () => {
    for (const hostil of ['" OR "1"="1', 'agua NEAR/99999 x', '*'.repeat(50), 'agua AND (']) {
      expect(() => repo.buscar(hostil)).not.toThrow();
    }
  });

  it('una consulta larguisima se acota', () => {
    expect(() => repo.buscar('agua '.repeat(500))).not.toThrow();
  });

  it('el orden es determinista entre ejecuciones', () => {
    const a = titulos('agua');
    const b = titulos('agua');
    expect(a).toEqual(b);
  });
});
