import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generarFallback, type RecursoFallback } from '../src/fallback.js';

// La salida de emergencia es lo que queda cuando todo lo demas falla, asi
// que sus garantias hay que comprobarlas, no suponerlas.

let root: string;

const RECURSOS: RecursoFallback[] = [
  {
    titulo: 'Desinfección del agua',
    autor: 'Protección Civil',
    formato: 'markdown',
    idioma: 'es',
    rutaOriginal: 'originals/abc-123.md',
    resumen: 'Hervir el agua un minuto a borbotones.',
  },
  {
    titulo: 'Documento con <script> y "comillas" & símbolos',
    autor: null,
    formato: 'txt',
    idioma: 'und',
    rutaOriginal: 'originals/raro nombre (1).txt',
    resumen: null,
  },
  {
    titulo: 'Ficha sin fichero',
    autor: null,
    formato: 'html',
    idioma: 'es',
    rutaOriginal: null,
    resumen: null,
  },
];

function generar(): void {
  generarFallback({
    root,
    corpus: '2026-C1-prueba',
    generado: '2026-08-02T10:00:00.000Z',
    recursos: RECURSOS,
  });
}

function leer(nombre: string): string {
  return readFileSync(join(root, 'FALLBACK', nombre), 'utf8');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vestigio-fallback-'));
  mkdirSync(join(root, 'CONTENT', 'originals'), { recursive: true });
  writeFileSync(join(root, 'CONTENT', 'originals', 'abc-123.md'), '# Agua');
  writeFileSync(join(root, 'CONTENT', 'originals', 'raro nombre (1).txt'), 'texto');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('la salida de emergencia', () => {
  beforeEach(generar);

  it('escribe las tres piezas', () => {
    for (const fichero of ['index.html', 'catalogo.csv', 'RECUPERACION.txt']) {
      expect(existsSync(join(root, 'FALLBACK', fichero))).toBe(true);
    }
  });

  it('no lleva ni una linea de JavaScript', () => {
    const html = leer('index.html');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\bon[a-z]+\s*=/i);
    expect(html).not.toContain('javascript:');
  });

  it('no pide nada a Internet: ni fuentes, ni hojas de estilo, ni imagenes', () => {
    const html = leer('index.html');
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<link[^>]+href/i);
    expect(html).not.toMatch(/<img/i);
  });

  it('enlaza a los documentos con rutas relativas que existen de verdad', () => {
    const html = leer('index.html');
    const enlaces = [...html.matchAll(/href="(\.\.\/CONTENT\/[^"]+)"/g)].map((m) => m[1] ?? '');
    expect(enlaces.length).toBe(2);
    for (const enlace of enlaces) {
      // Desde FALLBACK/, '../CONTENT/...' tiene que dar en un fichero real.
      const relativa = decodeURIComponent(enlace.replace('../', ''));
      expect(existsSync(join(root, ...relativa.split('/')))).toBe(true);
    }
  });

  it('ninguna ruta es absoluta ni lleva letra de unidad', () => {
    const html = leer('index.html');
    const csv = leer('catalogo.csv');
    expect(html).not.toMatch(/href="[A-Za-z]:/);
    expect(html).not.toMatch(/href="\//);
    expect(csv).not.toMatch(/[A-Za-z]:\\/);
  });

  it('escapa el marcado que venga en los titulos', () => {
    const html = leer('index.html');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script> y');
  });

  it('un documento sin fichero se declara en vez de dar un enlace roto', () => {
    const html = leer('index.html');
    expect(html).toContain('sin fichero asociado');
  });

  it('el CSV lleva BOM y escapa segun RFC 4180', () => {
    const csv = leer('catalogo.csv');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"Documento con <script> y ""comillas"" & símbolos"');
  });

  it('la guia de recuperacion dice lo primero que hay que saber', () => {
    const guia = leer('RECUPERACION.txt');
    expect(guia).toContain('TUS DOCUMENTOS ESTAN BIEN');
    expect(guia).toContain('CONTENT\\originals');
    expect(guia).toContain('Doctor.bat');
    // Y advierte de lo unico irreversible.
    expect(guia).toContain('No borres CONTENT');
  });

  it('se puede regenerar encima sin duplicar nada', () => {
    const antes = leer('index.html');
    generar();
    expect(leer('index.html')).toBe(antes);
  });
});
