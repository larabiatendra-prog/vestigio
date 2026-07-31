import { describe, expect, it } from 'vitest';
import {
  analizar,
  analizarAvanzado,
  analizarSimple,
  escaparTerminoFts,
  expresionFtsExacta,
  expresionFtsTolerante,
  MAX_TERMINOS,
} from '../src/consulta.js';
import { expandir, VERSION_DICCIONARIO } from '../src/sinonimos.js';
import { fusionarRrf, limitarPorOrigen, type Fusionable } from '../src/fusion.js';
import { distanciaEdicion, sugerirErratas } from '../src/erratas.js';

describe('modo simple: sin sintaxis magica', () => {
  it('todo lo escrito son palabras, incluidos guiones y comillas', () => {
    const c = analizarSimple('desinfectar agua "con" -lejia');
    expect(c.terminos.map((t) => t.texto)).toEqual(['desinfectar', 'agua', '"con"', '-lejia']);
    expect(c.terminos.every((t) => !t.excluido)).toBe(true);
  });

  it('una consulta vacia se marca como tal', () => {
    expect(analizarSimple('   ').vacia).toBe(true);
  });

  it('acota el numero de terminos', () => {
    const muchos = Array.from({ length: 40 }, (_v, i) => `p${String(i)}`).join(' ');
    expect(analizarSimple(muchos).terminos).toHaveLength(MAX_TERMINOS);
  });
});

describe('modo avanzado: frases, prefijos y exclusion', () => {
  it('reconoce frases entre comillas', () => {
    const r = analizarAvanzado('"as de guia" nudo');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.consulta.terminos[0]).toEqual({
      texto: 'as de guia',
      tipo: 'frase',
      excluido: false,
    });
    expect(r.consulta.terminos[1]?.texto).toBe('nudo');
  });

  it('reconoce prefijos y exclusiones', () => {
    const r = analizarAvanzado('desinfec* -piscina');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.consulta.terminos[0]?.tipo).toBe('prefijo');
    expect(r.consulta.terminos[0]?.texto).toBe('desinfec');
    expect(r.consulta.terminos[1]?.excluido).toBe(true);
  });

  it('una comilla sin cerrar da un error con su posicion', () => {
    const r = analizarAvanzado('agua "sin cerrar');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.mensaje).toContain('comilla de cierre');
    expect(r.error.posicion).toBe(5);
  });

  it('explica los usos incorrectos en vez de adivinar', () => {
    const casos = [
      ['agua -', 'excluir'],
      ['a* agua', 'dos letras'],
      ['ag*ua', 'asterisco solo puede ir al final'],
      ['-agua', 'solo excluye'],
    ] as const;
    for (const [entrada, esperado] of casos) {
      const r = analizarAvanzado(entrada);
      expect(r.ok, `deberia fallar: ${entrada}`).toBe(false);
      if (r.ok) continue;
      expect(r.error.mensaje).toContain(esperado);
    }
  });
});

describe('escapado: la sintaxis de SQLite nunca queda expuesta', () => {
  it('las comillas del usuario se neutralizan', () => {
    expect(escaparTerminoFts('agua"OR"1=1')).toBe('"agua""OR""1=1"');
  });

  it('los operadores tecleados se buscan como texto', () => {
    const c = analizarSimple('agua NEAR/5 fuego');
    const expresion = expresionFtsExacta(c);
    expect(expresion).toContain('"NEAR/5"');
    // No aparece como operador suelto de FTS5.
    expect(expresion).not.toMatch(/\sNEAR\/5\s/);
  });

  it('la expresion tolerante usa la forma sin tildes', () => {
    const c = analizarSimple('desinfección');
    expect(expresionFtsTolerante(c)).toBe('"desinfeccion"');
    expect(expresionFtsExacta(c)).toBe('"desinfección"');
  });

  it('las exclusiones se traducen a NOT', () => {
    const r = analizarAvanzado('agua -piscina');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(expresionFtsExacta(r.consulta)).toBe('("agua") NOT ("piscina")');
  });
});

describe('diccionario de sinonimos', () => {
  it('esta versionado', () => {
    expect(VERSION_DICCIONARIO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('expande siglas en ambos sentidos y lo declara', () => {
    const r = expandir(['rcp'], true);
    expect(r.terminos).toContain('reanimacion cardiopulmonar');
    expect(r.expansiones[0]?.tipo).toBe('sigla');
    const inverso = expandir(['desfibrilador'], true);
    expect(inverso.terminos).toContain('dea');
  });

  it('se puede desactivar y entonces no toca nada', () => {
    const r = expandir(['rcp'], false);
    expect(r.terminos).toEqual(['rcp']);
    expect(r.expansiones).toEqual([]);
    expect(r.bloqueadaPor).toContain('desactivada');
  });

  it('NO expande si hay cifras o unidades: las dosis se buscan literales', () => {
    const r = expandir(['lejia', '2', 'gotas'], true);
    expect(r.expansiones).toEqual([]);
    expect(r.bloqueadaPor).toContain('cifras');
  });

  it('NO expande si hay negaciones: cambian el sentido', () => {
    const r = expandir(['no', 'usar', 'lejia'], true);
    expect(r.expansiones).toEqual([]);
    expect(r.bloqueadaPor).toContain('negaciones');
  });
});

interface Prueba extends Fusionable {
  nombre: string;
}

const hacer = (
  nombre: string,
  origen: 'catalogo' | 'zim',
  motivo: Prueba['motivo'] = 'exacta',
): Prueba => ({ clave: `${origen}:${nombre}`, origen, motivo, nombre });

describe('fusion RRF', () => {
  it('es determinista: dos ejecuciones dan el mismo orden', () => {
    const listas = [
      { resultados: [hacer('a', 'catalogo'), hacer('b', 'catalogo')], peso: 1 },
      { resultados: [hacer('b', 'catalogo'), hacer('c', 'catalogo')], peso: 1 },
    ];
    const primera = fusionarRrf(listas).map((f) => f.elemento.nombre);
    const segunda = fusionarRrf(listas).map((f) => f.elemento.nombre);
    expect(primera).toEqual(segunda);
    // 'b' aparece en las dos listas: sube.
    expect(primera[0]).toBe('b');
  });

  it('la coincidencia exacta pesa mas que la tolerante', () => {
    const fusion = fusionarRrf([
      { resultados: [hacer('tolerante', 'catalogo', 'sin-tilde')], peso: 1 },
      { resultados: [hacer('exacta', 'catalogo', 'exacta')], peso: 3 },
    ]);
    expect(fusion[0]?.elemento.nombre).toBe('exacta');
  });

  it('conserva el motivo mas fuerte al deduplicar', () => {
    const mismo = (motivo: Prueba['motivo']): Prueba => ({
      clave: 'catalogo:x',
      origen: 'catalogo',
      motivo,
      nombre: 'x',
    });
    const fusion = fusionarRrf([
      { resultados: [mismo('aproximada')], peso: 1 },
      { resultados: [mismo('exacta')], peso: 1 },
    ]);
    expect(fusion).toHaveLength(1);
    expect(fusion[0]?.motivo).toBe('exacta');
  });

  it('un ZIM enorme no desplaza a los documentos catalogados', () => {
    const muchosZim = Array.from({ length: 500 }, (_v, i) => hacer(`z${String(i)}`, 'zim'));
    const limitados = limitarPorOrigen([...muchosZim, hacer('mio', 'catalogo')], {
      catalogo: 50,
      zim: 10,
    });
    expect(limitados.filter((r) => r.origen === 'zim')).toHaveLength(10);
    expect(limitados.some((r) => r.nombre === 'mio')).toBe(true);
  });
});

describe('sugerencias de errata', () => {
  const vocabulario = ['desinfeccion', 'potabilizar', 'hipoclorito', 'incendio', 'inundacion'];

  it('sugiere sobre el vocabulario real del corpus', () => {
    const s = sugerirErratas(['desinfeccion'], vocabulario);
    expect(s).toEqual([]); // existe: no hay nada que sugerir
    const errata = sugerirErratas(['desinfecion'], vocabulario);
    expect(errata[0]?.sugerido).toBe('desinfeccion');
  });

  it('no sugiere nada que no este en el corpus', () => {
    expect(sugerirErratas(['xilofono'], vocabulario)).toEqual([]);
  });

  it('nunca sugiere sobre cifras', () => {
    expect(sugerirErratas(['230v', '1.5'], vocabulario)).toEqual([]);
  });

  it('ante empate no adivina', () => {
    // 'gato' esta a distancia 1 de 'gata' y de 'goto': no se sugiere.
    expect(sugerirErratas(['gatoo'], ['gato', 'gatos'])).toEqual([]);
  });

  it('la distancia de edicion se corta al superar el limite', () => {
    expect(distanciaEdicion('agua', 'agua')).toBe(0);
    expect(distanciaEdicion('agua', 'aguas')).toBe(1);
    expect(distanciaEdicion('agua', 'incendio')).toBeGreaterThan(2);
  });
});

describe('analizar segun el modo', () => {
  it('el modo simple nunca falla; el avanzado puede', () => {
    expect(analizar('"sin cerrar', false).ok).toBe(true);
    expect(analizar('"sin cerrar', true).ok).toBe(false);
  });
});
