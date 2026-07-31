import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  abrirBaseContenido,
  construirCatalogoFixture,
  RepositorioContenido,
  type RecursoCanonico,
} from '../src/index.js';
import type { DatabaseSync } from 'node:sqlite';

// Presupuestos del plan §14.1, medidos sobre un corpus de escala
// representativa (no cinco archivos): 2.000 documentos con 5 segmentos
// cada uno = 10.000 segmentos indexados.
//
// Umbrales exigidos: p50 < 250 ms, p95 <= 1,5 s.

const DOCUMENTOS = 2000;
const SEGMENTOS_POR_DOCUMENTO = 5;
const P50_MAXIMO_MS = 250;
const P95_MAXIMO_MS = 1500;

let dir: string;
let db: DatabaseSync;
let repo: RepositorioContenido;

const TEMAS = [
  'desinfección del agua con hipoclorito',
  'cañón de riego para parcelas grandes',
  'reanimación cardiopulmonar y compresiones',
  'conservación de alimentos por salazón',
  'seguridad eléctrica en baja tensión',
  'orientación con mapa y brújula en la montaña',
  'huerto mediterráneo y riego por goteo',
  'la façana del col·legi i la protecció',
];

function corpusSintetico(): RecursoCanonico[] {
  const recursos: RecursoCanonico[] = [];
  for (let i = 0; i < DOCUMENTOS; i++) {
    const tema = TEMAS[i % TEMAS.length] ?? '';
    const id = `${String(i).padStart(8, '0')}-0000-8000-8000-000000000000`;
    recursos.push({
      id,
      slug: `documento-${String(i)}`,
      titulo: `Manual ${String(i)}: ${tema}`,
      idioma: i % 7 === 0 ? 'ca' : 'es',
      formato: ['pdf', 'markdown', 'html', 'txt'][i % 4] ?? 'txt',
      derechos: 'personal-preservation',
      modulos: [`M${String((i % 12) + 1).padStart(2, '0')}`],
      segmentos: Array.from({ length: SEGMENTOS_POR_DOCUMENTO }, (_v, s) => ({
        localizador: `sec-${String(s + 1)}`,
        titulo: `Sección ${String(s + 1)}`,
        cuerpo:
          `${tema}. Documento ${String(i)}, sección ${String(s + 1)}. ` +
          'Este párrafo describe el procedimiento con detalle suficiente para ' +
          'que el índice de texto completo tenga material real que recorrer, ' +
          'incluyendo palabras con tildes, eñes y grafías valencianas como ' +
          'protecció, façana i col·legi, además de cifras como 230 V y 1,5 mg.',
      })),
    });
  }
  return recursos;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'vestigio-perf-'));
  const ruta = join(dir, 'contenido.sqlite');
  construirCatalogoFixture(ruta, corpusSintetico(), {
    corpus: 'perf',
    informacionVigente: '',
  });
  db = abrirBaseContenido(ruta).db;
  repo = new RepositorioContenido(db);
}, 180_000);

afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function percentil(valores: number[], p: number): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  const indice = Math.min(ordenados.length - 1, Math.floor((p / 100) * ordenados.length));
  return ordenados[indice] ?? 0;
}

describe('rendimiento con corpus representativo', () => {
  it(`indexa ${String(DOCUMENTOS)} documentos y los cuenta`, () => {
    expect(repo.contarRecursos()).toBe(DOCUMENTOS);
  });

  it('las busquedas cumplen los presupuestos p50 y p95 del plan', () => {
    // Consultas que DEBEN encontrar algo en este corpus.
    const conResultados = [
      'agua',
      'desinfección',
      'desinfeccion',
      'cañón',
      'reanimación cardiopulmonar',
      'RCP',
      'facana',
      'col·legi',
      'protecció',
      'brújula montaña',
      'riego goteo huerto',
      'seguridad eléctrica',
      '230',
      'salazón conservación alimentos',
    ];
    // Consultas que NO deben encontrar nada: el corpus dice 'cañón', asi
    // que 'canon' no puede coincidir. Se miden igual, porque una busqueda
    // sin resultados tambien tiene que ser rapida.
    const sinResultados = ['canon', 'xilofono', 'ano'];

    const tiempos: number[] = [];
    // Varias pasadas para que el percentil signifique algo.
    for (let pasada = 0; pasada < 4; pasada++) {
      for (const consulta of conResultados) {
        const inicio = performance.now();
        const r = repo.buscar(consulta);
        tiempos.push(performance.now() - inicio);
        expect(r.coincidencias.length, `"${consulta}" deberia encontrar algo`).toBeGreaterThan(0);
      }
      for (const consulta of sinResultados) {
        const inicio = performance.now();
        const r = repo.buscar(consulta);
        tiempos.push(performance.now() - inicio);
        expect(r.coincidencias.length, `"${consulta}" no deberia encontrar nada`).toBe(0);
      }
    }

    const p50 = percentil(tiempos, 50);
    const p95 = percentil(tiempos, 95);
    console.warn(
      `busqueda sobre ${String(DOCUMENTOS * SEGMENTOS_POR_DOCUMENTO)} segmentos: ` +
        `p50 ${p50.toFixed(0)} ms · p95 ${p95.toFixed(0)} ms · max ${Math.max(...tiempos).toFixed(0)} ms`,
    );

    expect(p50, `p50 ${p50.toFixed(0)} ms supera el presupuesto`).toBeLessThan(P50_MAXIMO_MS);
    expect(p95, `p95 ${p95.toFixed(0)} ms supera el presupuesto`).toBeLessThan(P95_MAXIMO_MS);
  });

  it('aplicar un filtro tambien cumple el presupuesto', () => {
    const tiempos: number[] = [];
    for (let i = 0; i < 20; i++) {
      const inicio = performance.now();
      repo.buscar('agua', { filtros: { formatos: ['pdf'], idiomas: ['es'] } });
      tiempos.push(performance.now() - inicio);
    }
    const p95 = percentil(tiempos, 95);
    console.warn(`filtro aplicado: p95 ${p95.toFixed(0)} ms`);
    expect(p95).toBeLessThan(P95_MAXIMO_MS);
  });

  it('el filtro no carga el corpus en memoria: la faceta cuenta en SQL', () => {
    const r = repo.buscar('agua', { filtros: { idiomas: ['ca'] } });
    const totalFacetas = r.facetas.idiomas.reduce((s, f) => s + f.cuenta, 0);
    // Solo cuenta los del idioma filtrado, no los 2000.
    expect(totalFacetas).toBeLessThan(DOCUMENTOS);
    expect(totalFacetas).toBeGreaterThan(0);
  });
});
