import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { abrirBaseContenido } from '@vestigio/database';
import { extraerPdf } from '../src/pdf.js';
import { analizarCarpeta, materializarEdicion } from '../src/ingesta.js';
import { crearPdfConTexto, crearPdfSinTexto } from './pdf-fixture.js';

describe('extraccion de PDF', () => {
  it('extrae texto por pagina conservando el numero de pagina', async () => {
    const pdf = crearPdfConTexto(
      [
        'Hervir el agua un minuto a borbotones',
        'Dosis de lejia: dos gotas por litro',
        'El cañon de riego no es un canon',
      ],
      'Manual del agua',
    );
    const resultado = await extraerPdf(new Uint8Array(pdf));

    expect(resultado.diagnostico).toBe('con-texto');
    expect(resultado.totalPaginas).toBe(3);
    expect(resultado.paginas).toHaveLength(3);
    expect(resultado.paginas[0]?.pagina).toBe(1);
    expect(resultado.paginas[0]?.texto).toContain('borbotones');
    expect(resultado.paginas[1]?.texto).toContain('dos gotas');
    expect(resultado.paginas[2]?.pagina).toBe(3);
    expect(resultado.titulo).toBe('Manual del agua');
    expect(resultado.herramienta).toContain('pdfjs-dist@');
  });

  it('marca como candidato a OCR un PDF sin capa de texto', async () => {
    const resultado = await extraerPdf(new Uint8Array(crearPdfSinTexto()));
    expect(resultado.diagnostico).toBe('sin-texto-candidato-ocr');
    expect(resultado.detalle).toContain('escaneo');
  });

  it('un PDF corrupto no lanza: informa y sigue', async () => {
    const basura = Buffer.concat([
      Buffer.from('%PDF-1.4\n'),
      Buffer.from(Array.from({ length: 400 }, (_v, i) => i % 256)),
    ]);
    const resultado = await extraerPdf(new Uint8Array(basura));
    expect(['corrupto', 'sin-texto-candidato-ocr']).toContain(resultado.diagnostico);
    expect(resultado.paginas).toHaveLength(0);
  });

  it('un archivo que no es PDF se rechaza con motivo legible', async () => {
    const resultado = await extraerPdf(new Uint8Array(Buffer.from('esto no es un pdf')));
    expect(resultado.diagnostico).toBe('corrupto');
    expect(resultado.detalle).toBeTruthy();
  });
});

describe('PDF dentro de la ingesta', () => {
  let dir: string;
  let origen: string;
  let edicion: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vestigio-pdf-'));
    origen = join(dir, 'origen');
    edicion = join(dir, 'edicion');
    mkdirSync(origen, { recursive: true });
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('el PDF entra al catalogo con localizadores de pagina buscables', async () => {
    writeFileSync(
      join(origen, 'agua.pdf'),
      crearPdfConTexto(
        ['Pagina uno sobre potabilizacion', 'Pagina dos sobre el cañon de riego'],
        'Guia practica del agua',
      ),
    );
    const resultado = await analizarCarpeta(origen, edicion);
    materializarEdicion(resultado, origen, edicion, 'v-pdf');

    const { db } = abrirBaseContenido(join(edicion, 'CONTENT', 'index', 'vestigio-content.sqlite'));

    const recurso = db.prepare('SELECT titulo, estado_texto, num_paginas FROM recursos').get() as {
      titulo: string;
      estado_texto: string;
      num_paginas: number;
    };
    // El titulo de los metadatos del PDF gana al nombre de fichero.
    expect(recurso.titulo).toBe('Guia practica del agua');
    expect(recurso.estado_texto).toBe('texto-por-pagina');
    expect(recurso.num_paginas).toBe(2);

    // Una busqueda devuelve el localizador de la pagina exacta.
    const hit = db
      .prepare(
        `SELECT s.localizador, s.pagina FROM segmentos_fts f
         JOIN segmentos s ON s.pk = f.rowid
         WHERE segmentos_fts MATCH ?`,
      )
      .get('cañon') as { localizador: string; pagina: number } | undefined;
    expect(hit?.localizador).toBe('p2');
    expect(hit?.pagina).toBe(2);
    db.close();
  });

  it('un PDF escaneado queda marcado como no buscable, no como roto', async () => {
    writeFileSync(join(origen, 'escaneo.pdf'), crearPdfSinTexto());
    const resultado = await analizarCarpeta(origen, edicion);
    materializarEdicion(resultado, origen, edicion, 'v');

    const { db } = abrirBaseContenido(join(edicion, 'CONTENT', 'index', 'vestigio-content.sqlite'));
    const recurso = db.prepare('SELECT estado_texto, detalle_texto FROM recursos').get() as {
      estado_texto: string;
      detalle_texto: string;
    };
    expect(recurso.estado_texto).toBe('sin-texto-escaneado');
    expect(recurso.detalle_texto).toContain('escaneo');
    db.close();
  });

  it('un PDF corrupto no impide ingerir el resto de la carpeta', async () => {
    writeFileSync(join(origen, 'roto.pdf'), Buffer.from('%PDF-1.4\nbasura sin estructura\n'));
    writeFileSync(join(origen, 'bueno.md'), '# Nudos\n\nEl as de guia no se desliza.\n');
    const resultado = await analizarCarpeta(origen, edicion);

    expect(resultado.informe.ingeridos).toBe(2);
    const roto = resultado.recursos.find((r) => r.formato === 'pdf');
    expect(roto?.estadoTexto).toMatch(/ilegible|sin-texto-escaneado/);
    const bueno = resultado.recursos.find((r) => r.formato === 'markdown');
    expect(bueno?.estadoTexto).toBe('texto-completo');
  });
});

describe('derivados de acceso saneados en el catalogo', () => {
  let dir: string;
  let origen: string;
  let edicion: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vestigio-deriv-'));
    origen = join(dir, 'origen');
    edicion = join(dir, 'edicion');
    mkdirSync(origen, { recursive: true });
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('el HTML hostil se guarda saneado y la ficha lo declara', async () => {
    writeFileSync(
      join(origen, 'hostil.html'),
      '<html><head><title>Riego</title></head><body><h2>Goteo</h2><p onclick="robar()">Ahorra agua</p><script>fetch("https://malo.example")</script><img src="https://cdn.example/x.png"></body></html>',
    );
    const resultado = await analizarCarpeta(origen, edicion);
    materializarEdicion(resultado, origen, edicion, 'v');

    const { db } = abrirBaseContenido(join(edicion, 'CONTENT', 'index', 'vestigio-content.sqlite'));
    const segmento = db.prepare('SELECT html, titulo, localizador FROM segmentos').get() as {
      html: string;
      titulo: string;
      localizador: string;
    };
    expect(segmento.html).not.toContain('script');
    expect(segmento.html).not.toContain('onclick');
    expect(segmento.html).not.toContain('example');
    expect(segmento.html).toContain('Ahorra agua');
    expect(segmento.localizador).toBe('sec-1');

    const recurso = db.prepare('SELECT detalle_texto FROM recursos').get() as {
      detalle_texto: string;
    };
    expect(recurso.detalle_texto).toContain('retirados');
    db.close();
  });
});
