import { describe, expect, it } from 'vitest';
import { buscarEnSegmentos, recolocar } from '../src/renderer/busqueda-interna';
import type { SegmentoUI } from '../src/comun/estado';

function segmento(
  localizador: string,
  cuerpo: string,
  extra: Partial<SegmentoUI> = {},
): SegmentoUI {
  return {
    localizador,
    titulo: null,
    nivel: null,
    pagina: null,
    html: null,
    cuerpo,
    ...extra,
  };
}

const documento: SegmentoUI[] = [
  segmento('sec-1', 'Hervir el agua un minuto a borbotones antes de beberla.', {
    titulo: 'Hervido',
    pagina: 1,
  }),
  segmento('sec-2', 'La dosis de lejía depende de la turbidez del agua.', {
    titulo: 'Lejía',
    pagina: 2,
  }),
  segmento('sec-3', 'Revisar la cañería y el depósito cada temporada.', { pagina: 3 }),
];

describe('buscar dentro del documento', () => {
  it('encuentra todas las apariciones en orden de lectura', () => {
    const encontradas = buscarEnSegmentos(documento, 'agua');
    expect(encontradas).toHaveLength(2);
    expect(encontradas.map((c) => c.localizador)).toEqual(['sec-1', 'sec-2']);
  });

  it('marca la coincidencia con su contexto alrededor', () => {
    const [primera] = buscarEnSegmentos(documento, 'borbotones');
    expect(primera?.fragmento).toContain('[[borbotones]]');
    expect(primera?.fragmento).toContain('minuto');
  });

  it('devuelve la pagina y el titulo de seccion para poder saltar alli', () => {
    const [encontrada] = buscarEnSegmentos(documento, 'lejía');
    expect(encontrada?.pagina).toBe(2);
    expect(encontrada?.tituloSeccion).toBe('Lejía');
  });

  it('se comporta como el buscador de la biblioteca con tildes y con la ñ', () => {
    // Los acentos vocalicos no hacen falta...
    expect(buscarEnSegmentos(documento, 'deposito')).toHaveLength(1);
    expect(buscarEnSegmentos(documento, 'depósito')).toHaveLength(1);
    expect(buscarEnSegmentos(documento, 'lejia')).toHaveLength(1);
    // ...pero la ñ es una letra y hay que escribirla.
    expect(buscarEnSegmentos(documento, 'cañeria')).toHaveLength(1);
    expect(buscarEnSegmentos(documento, 'caneria')).toHaveLength(0);
  });

  it('una busqueda vacia no devuelve nada, ni siquiera todo', () => {
    expect(buscarEnSegmentos(documento, '')).toEqual([]);
    expect(buscarEnSegmentos(documento, '   ')).toEqual([]);
  });

  it('varias apariciones en un mismo segmento se cuentan por separado', () => {
    const repetido = [segmento('s', 'agua, más agua y otra vez agua')];
    expect(buscarEnSegmentos(repetido, 'agua')).toHaveLength(3);
  });
});

describe('anclajes que ya no existen', () => {
  it('un localizador que sigue estando se usa tal cual', () => {
    expect(recolocar(documento, 'sec-2', null)).toEqual({ localizador: 'sec-2', via: 'exacto' });
  });

  it('un localizador desaparecido se recupera por el texto guardado', () => {
    const recolocado = recolocar(documento, 'seccion-vieja-7', 'La dosis de lejía depende');
    expect(recolocado).toEqual({ localizador: 'sec-2', via: 'por-texto' });
  });

  it('sin texto de referencia se admite la perdida en vez de inventar un sitio', () => {
    expect(recolocar(documento, 'seccion-vieja-7', null)).toEqual({
      localizador: null,
      via: 'perdido',
    });
  });

  it('un texto de referencia que ya no aparece tampoco se fuerza', () => {
    const recolocado = recolocar(documento, 'seccion-vieja-7', 'esto no está en ningún sitio');
    expect(recolocado.localizador).toBeNull();
    expect(recolocado.via).toBe('perdido');
  });

  it('sin destino no hay nada que recolocar', () => {
    expect(recolocar(documento, null, 'lo que sea').via).toBe('sin-destino');
  });
});
