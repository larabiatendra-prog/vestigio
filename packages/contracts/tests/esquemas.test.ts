import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

// Interop CJS/ESM: en runtime el import por defecto ya es la funcion.
const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => Ajv2020;

// Los JSON Schemas de contratos deben compilar y distinguir ejemplos
// validos de invalidos. Se amplian junto a las tablas reales (bloques 03+).

const dirEsquemas = join(import.meta.dirname, '..', 'schemas');

function cargar(nombre: string): object {
  return JSON.parse(readFileSync(join(dirEsquemas, nombre), 'utf8')) as object;
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const sha = 'a'.repeat(64);

const assetValido = {
  id: uuid,
  roles: ['source_original', 'preservation_master'],
  formato: 'pdf',
  rutaLogica: 'originales/guia-agua.pdf',
  bytes: 123456,
  sha256: sha,
};

describe('esquema de recurso', () => {
  const validar = ajv.compile(cargar('recurso.schema.json'));

  it('acepta un recurso minimo con metadatos honestos (solo lo extraible)', () => {
    const valido = validar({
      id: uuid,
      slug: 'guia-desinfeccion-agua',
      titulo: 'Guía de desinfección de agua',
      idioma: 'es',
      formato: 'pdf',
      derechos: 'personal-preservation',
      modulos: ['M03'],
      assets: [assetValido],
    });
    expect(validar.errors).toBeNull();
    expect(valido).toBe(true);
  });

  it('rechaza un recurso sin titulo', () => {
    expect(
      validar({
        id: uuid,
        slug: 'sin-titulo',
        idioma: 'es',
        formato: 'pdf',
        derechos: 'unknown-blocked',
        modulos: ['M01'],
        assets: [assetValido],
      }),
    ).toBe(false);
  });

  it('rechaza un modulo inexistente y un sha256 malformado', () => {
    expect(
      validar({
        id: uuid,
        slug: 'malos-datos',
        titulo: 'X',
        idioma: 'es',
        formato: 'pdf',
        derechos: 'open-redistributable',
        modulos: ['M99'],
        assets: [assetValido],
      }),
    ).toBe(false);
    expect(
      validar({
        id: uuid,
        slug: 'sha-malo',
        titulo: 'X',
        idioma: 'es',
        formato: 'pdf',
        derechos: 'open-redistributable',
        modulos: ['M01'],
        assets: [{ ...assetValido, sha256: 'no-es-un-hash' }],
      }),
    ).toBe(false);
  });

  it('rechaza rutas absolutas de Windows en assets', () => {
    expect(
      validar({
        id: uuid,
        slug: 'ruta-absoluta',
        titulo: 'X',
        idioma: 'es',
        formato: 'pdf',
        derechos: 'open-redistributable',
        modulos: ['M01'],
        assets: [{ ...assetValido, rutaLogica: 'C:\\Users\\alguien\\doc.pdf' }],
      }),
    ).toBe(false);
  });
});

describe('esquema de busqueda', () => {
  const validar = ajv.compile(cargar('busqueda.schema.json'));

  it('acepta una consulta con filtros y un resultado de cada origen', () => {
    expect(
      validar({
        consulta: {
          texto: 'desinfectar agua con lejía',
          filtros: { modulos: ['M03'], riesgoMaximo: 'alto' },
          limite: 50,
          incluirZim: true,
        },
      }),
    ).toBe(true);
    expect(
      validar({
        resultado: {
          origen: 'catalogo',
          recursoId: uuid,
          titulo: 'Guía de desinfección',
          motivo: 'exacta',
          puntuacion: 12.5,
        },
      }),
    ).toBe(true);
    expect(
      validar({
        resultado: {
          origen: 'zim',
          coleccionZim: 'wikihow-es',
          titulo: 'Cómo filtrar agua',
          motivo: 'sin-tilde',
          puntuacion: 3.1,
        },
      }),
    ).toBe(true);
  });

  it('rechaza consulta vacia y resultado de catalogo sin recursoId', () => {
    expect(validar({ consulta: { texto: '' } })).toBe(false);
    expect(
      validar({
        resultado: { origen: 'catalogo', titulo: 'X', motivo: 'exacta', puntuacion: 1 },
      }),
    ).toBe(false);
  });
});

describe('esquema de nota', () => {
  const validar = ajv.compile(cargar('nota.schema.json'));

  it('acepta notas ancladas a recurso, segmento y pagina', () => {
    const base = { id: uuid, texto: 'Revisar dosis', creada: '2026-07-30T12:00:00Z' };
    expect(validar({ ...base, destino: { tipo: 'recurso', recursoId: uuid } })).toBe(true);
    expect(
      validar({ ...base, destino: { tipo: 'segmento', recursoId: uuid, segmento: 'cap-3' } }),
    ).toBe(true);
    expect(validar({ ...base, destino: { tipo: 'pagina', recursoId: uuid, pagina: 12 } })).toBe(
      true,
    );
  });

  it('rechaza una nota de pagina sin numero de pagina y texto vacio', () => {
    const base = { id: uuid, creada: '2026-07-30T12:00:00Z' };
    expect(validar({ ...base, texto: 'x', destino: { tipo: 'pagina', recursoId: uuid } })).toBe(
      false,
    );
    expect(validar({ ...base, texto: '', destino: { tipo: 'recurso', recursoId: uuid } })).toBe(
      false,
    );
  });
});

describe('esquema de release', () => {
  const validar = ajv.compile(cargar('release.schema.json'));

  it('acepta una release con las tres versiones independientes', () => {
    expect(
      validar({
        versiones: { app: '1.0.0', corpus: '2026-C1', informacionVigente: '2026-V1' },
        fecha: '2026-07-30T12:00:00Z',
        esquema: 1,
        manifiestoSha256: sha,
      }),
    ).toBe(true);
  });

  it('rechaza una release sin alguna de las tres versiones', () => {
    expect(
      validar({
        versiones: { app: '1.0.0', corpus: '2026-C1' },
        fecha: '2026-07-30T12:00:00Z',
        esquema: 1,
        manifiestoSha256: sha,
      }),
    ).toBe(false);
  });
});
