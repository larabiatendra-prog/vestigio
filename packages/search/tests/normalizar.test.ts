import { describe, expect, it } from 'vitest';
import {
  difierenSoloEnTildes,
  normalizarExacto,
  normalizarTolerante,
  quitarAcentosVocalicos,
  textoParaIndiceTolerante,
  unirGuionesDeCorte,
  variantesTolerantes,
} from '../src/normalizar.js';

// Casos de contrato congelados en docs/TESTING.md (plan §9.2 y bloque 09
// t.12). Son el examen que la normalizacion espanola y valenciana debe
// aprobar siempre: si uno falla, la busqueda ha dejado de ser fiable.

describe('la eñe es una letra, no una vocal acentuada', () => {
  it('año y ano NO se confunden en ninguna capa', () => {
    expect(normalizarTolerante('año')).toBe('año');
    expect(normalizarTolerante('ano')).toBe('ano');
    expect(normalizarTolerante('año')).not.toBe(normalizarTolerante('ano'));
  });

  it('cañón pierde la tilde pero conserva la eñe: nunca es canon', () => {
    expect(normalizarTolerante('cañón')).toBe('cañon');
    expect(normalizarTolerante('canon')).toBe('canon');
    expect(normalizarTolerante('cañón')).not.toBe(normalizarTolerante('canon'));
  });

  it('mantiene la eñe en mayuscula y en palabras compuestas', () => {
    expect(normalizarTolerante('MONTAÑA')).toBe('montaña');
    expect(quitarAcentosVocalicos('Ñu')).toBe('Ñu');
    expect(normalizarTolerante('señalización')).toBe('señalizacion');
  });
});

describe('acentos vocalicos y dieresis', () => {
  it('quita tildes de las cinco vocales', () => {
    expect(normalizarTolerante('áéíóú')).toBe('aeiou');
    expect(normalizarTolerante('desinfección')).toBe('desinfeccion');
    expect(normalizarTolerante('depósito')).toBe('deposito');
  });

  it('pingüino y pinguino se encuentran mutuamente', () => {
    expect(normalizarTolerante('pingüino')).toBe('pinguino');
    expect(normalizarTolerante('pinguino')).toBe('pinguino');
  });

  it('protecció y proteccio coinciden en la capa tolerante', () => {
    expect(normalizarTolerante('protecció')).toBe('proteccio');
    expect(normalizarTolerante('proteccio')).toBe('proteccio');
  });

  it('acentos graves del valenciano tambien', () => {
    expect(normalizarTolerante('què')).toBe('que');
    expect(normalizarTolerante('perquè')).toBe('perque');
  });
});

describe('NFC y NFD: la misma palabra escrita de dos formas', () => {
  it('la forma descompuesta se normaliza a la misma cadena', () => {
    const compuesta = 'año'; // ñ como un solo codepoint
    const descompuesta = 'año'; // n + tilde combinante
    expect(compuesta.normalize('NFC')).toBe(descompuesta.normalize('NFC'));
    expect(normalizarExacto(descompuesta)).toBe(compuesta);
    expect(normalizarTolerante(descompuesta)).toBe('año');
  });

  it('una tilde combinante se retira igual que una precompuesta', () => {
    expect(normalizarTolerante('camíon')).toBe('camion');
    expect(normalizarTolerante('camión')).toBe('camion');
  });
});

describe('grafias valencianas: variantes explicitas, no borrado', () => {
  it('façana genera la variante facana sin perder la cedilla', () => {
    const variantes = variantesTolerantes('façana');
    expect(variantes).toContain('façana');
    expect(variantes).toContain('facana');
  });

  it('col·lecció genera colleccio y viceversa', () => {
    expect(variantesTolerantes('col·lecció')).toContain('colleccio');
    expect(variantesTolerantes('colleccio')).toContain('col·leccio');
  });

  it('el indice tolerante incluye todas las formas de cada palabra', () => {
    const indice = textoParaIndiceTolerante('La façana del col·legi');
    expect(indice).toContain('facana');
    expect(indice).toContain('façana');
    expect(indice).toContain('collegi');
  });

  it('el indice exacto no toca nada: la diferencia se conserva', () => {
    expect(normalizarExacto('façana')).toBe('façana');
    expect(normalizarExacto('col·lecció')).toBe('col·lecció');
  });
});

describe('texto real de PDF y OCR', () => {
  it('une palabras partidas por guion de fin de linea', () => {
    expect(unirGuionesDeCorte('desinfec-\ncion del agua')).toBe('desinfeccion del agua');
    expect(unirGuionesDeCorte('poli-\n  cloruro')).toBe('policloruro');
  });

  it('no une guiones legitimos dentro de la linea', () => {
    expect(unirGuionesDeCorte('teorico-practico')).toBe('teorico-practico');
  });
});

describe('lo que jamas debe alterarse', () => {
  it('cifras, unidades, decimales y simbolos pasan intactos', () => {
    for (const texto of ['230 V', '1,5 mg', '1.5 mg', '50 %', '35 °C', '2,4 GHz']) {
      expect(normalizarTolerante(texto)).toBe(texto.toLowerCase());
    }
  });

  it('las siglas conservan sus letras', () => {
    expect(normalizarTolerante('RCP')).toBe('rcp');
    expect(normalizarTolerante('DEA')).toBe('dea');
  });

  it('las negaciones y palabras cortas no se eliminan', () => {
    const indice = textoParaIndiceTolerante('no usar sin ventilacion');
    expect(indice).toContain('no');
    expect(indice).toContain('sin');
  });
});

describe('deteccion de diferencia solo por tildes', () => {
  it('reconoce pares que solo se distinguen por acento', () => {
    expect(difierenSoloEnTildes('camión', 'camion')).toBe(true);
    expect(difierenSoloEnTildes('camion', 'camion')).toBe(false);
    expect(difierenSoloEnTildes('año', 'ano')).toBe(false);
  });
});
