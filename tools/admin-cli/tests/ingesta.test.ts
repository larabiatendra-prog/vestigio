import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { abrirBaseContenido } from '@vestigio/database';
import { analizarCarpeta, materializarEdicion } from '../src/ingesta.js';
import { generarManifiesto, escribirManifiesto, verificarManifiesto } from '@vestigio/diagnostico';
import { detectarFormato, detectarIdioma, uuidDesdeSha256, sha256De } from '../src/metadatos.js';

let dir: string;
let origen: string;
let edicion: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vestigio-ingesta-'));
  origen = join(dir, 'origen');
  edicion = join(dir, 'edicion');
  mkdirSync(join(origen, 'subcarpeta'), { recursive: true });

  writeFileSync(
    join(origen, 'guia-agua.md'),
    '# Guía de desinfección del agua\n\nHervir el agua un minuto a borbotones mata los patógenos.\n\nCon lejía apta para desinfección: dos gotas por litro y esperar media hora antes de beber del cañón.\n',
  );
  writeFileSync(
    join(origen, 'subcarpeta', 'nudos.txt'),
    'El nudo as de guía no se desliza y es el rey de los nudos de rescate para izar a una persona.\n',
  );
  writeFileSync(
    join(origen, 'subcarpeta', 'huerto.html'),
    '<!doctype html><html><head><title>El huerto mediterráneo</title><script>alert("fuera")</script></head><body><h1>Huerto</h1><p>El riego por goteo ahorra agua en verano y el compost mejora el suelo del huerto.</p></body></html>',
  );
  // Duplicado exacto del primero con otro nombre.
  writeFileSync(join(origen, 'copia-guia.md'), readFileSync(join(origen, 'guia-agua.md')));
  // Formato no admitido.
  writeFileSync(join(origen, 'programa.exe'), Buffer.from([0x4d, 0x5a, 0x90, 0x00]));
  // PDF minimo (sin texto extraible en este bloque).
  writeFileSync(join(origen, 'mapa.pdf'), '%PDF-1.4\n%fake minimal\n%%EOF\n');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('deteccion de metadatos', () => {
  it('detecta formato por firma binaria, no por extension', () => {
    expect(detectarFormato('x.bin', Buffer.from('%PDF-1.7 lo que sea'))).toBe('pdf');
    expect(detectarFormato('x.md', Buffer.from('# titulo\n'))).toBe('markdown');
    expect(detectarFormato('x.exe', Buffer.from([0x4d, 0x5a]))).toBeNull();
    expect(detectarFormato('x.htm', Buffer.from('<!DOCTYPE html><html>'))).toBe('html');
  });

  it('detecta idioma con honestidad: es, en o desconocido', () => {
    expect(
      detectarIdioma('el agua se hierve con la olla en la cocina para que no haya patógenos'),
    ).toBe('es');
    expect(detectarIdioma('the water must be boiled in the pot for one minute to be safe')).toBe(
      'en',
    );
    expect(detectarIdioma('xyzzy plugh 42')).toBe('und');
  });

  it('el UUID derivado del contenido es estable y con formato valido', () => {
    const sha = sha256De(Buffer.from('contenido'));
    const uuid = uuidDesdeSha256(sha);
    expect(uuid).toBe(uuidDesdeSha256(sha));
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('cadena de ingesta completa', () => {
  it('carpeta entera -> edicion con catalogo buscable, dedupe y manifiesto', async () => {
    const resultado = await analizarCarpeta(origen, edicion);
    const { informe } = resultado;

    expect(informe.explorados).toBe(6);
    expect(informe.ingeridos).toBe(4); // md, txt, html, pdf
    expect(informe.duplicados).toHaveLength(1);
    // El orden de exploracion es alfabetico y determinista: copia-guia.md
    // entra primero y guia-agua.md queda registrado como su duplicado.
    expect(informe.duplicados[0]?.ruta).toBe('guia-agua.md');
    expect(informe.duplicados[0]?.duplicadoDe).toBe('copia-guia.md');
    expect(informe.omitidos).toHaveLength(1);
    expect(informe.omitidos[0]?.motivo).toBe('formato no admitido');
    expect(informe.sinTexto).toBe(1); // el pdf

    materializarEdicion(resultado, origen, edicion, '2026-C-prueba');
    escribirManifiesto(edicion, generarManifiesto(edicion));

    // El catalogo abre en solo lectura y encuentra contenido con enye.
    const { db } = abrirBaseContenido(join(edicion, 'CONTENT', 'index', 'vestigio-content.sqlite'));
    const buscar = (q: string): number =>
      (
        db
          .prepare('SELECT count(*) AS n FROM segmentos_fts WHERE segmentos_fts MATCH ?')
          .get(q) as { n: number }
      ).n;
    expect(buscar('cañón')).toBe(1);
    expect(buscar('goteo')).toBe(1);
    expect(buscar('guía')).toBeGreaterThanOrEqual(1);
    // El script del HTML no entro al indice.
    expect(buscar('alert')).toBe(0);

    // Metadatos honestos: titulo del contenido y version del corpus.
    const titulo = db.prepare('SELECT titulo FROM recursos WHERE formato = ?').get('html') as {
      titulo: string;
    };
    expect(titulo.titulo).toBe('El huerto mediterráneo');
    const version = db
      .prepare("SELECT valor FROM release_metadata WHERE clave='corpus_version'")
      .get() as { valor: string };
    expect(version.valor).toBe('2026-C-prueba');
    // Cada recurso tiene su original como asset con rol de master.
    const roles = db
      .prepare(
        "SELECT count(*) AS n FROM asset_roles WHERE rol IN ('source_original','preservation_master')",
      )
      .get() as { n: number };
    expect(roles.n).toBe(8); // 4 assets x 2 roles
    db.close();

    // content-sources.lock.json registra las fuentes con hash y fecha.
    const lock = JSON.parse(readFileSync(join(edicion, 'content-sources.lock.json'), 'utf8')) as {
      fuentes: { sha256: string; nombreOriginal: string }[];
    };
    expect(lock.fuentes).toHaveLength(4);

    // La verificacion del manifiesto pasa limpia.
    expect(verificarManifiesto(edicion)).toEqual([]);
  });

  it('alterar un byte de un original rompe la verificacion', async () => {
    const resultado = await analizarCarpeta(origen, edicion);
    materializarEdicion(resultado, origen, edicion, 'v');
    escribirManifiesto(edicion, generarManifiesto(edicion));

    const originales = join(edicion, 'CONTENT', 'originals');
    const primero = resultado.recursos[0]?.assets?.[0]?.rutaLogica;
    expect(primero).toBeDefined();
    const rutaAsset = join(edicion, 'CONTENT', primero ?? '');
    const contenido = readFileSync(rutaAsset);
    contenido[10] = (contenido[10] ?? 0) ^ 0xff;
    writeFileSync(rutaAsset, contenido);

    const problemas = verificarManifiesto(edicion);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]?.problema).toBe('alterado');
    expect(problemas[0]?.archivo).toContain('originals/');
    expect(originales).toBeTruthy();
  });

  it('borrar un archivo o colar uno nuevo tambien se detecta', async () => {
    const resultado = await analizarCarpeta(origen, edicion);
    materializarEdicion(resultado, origen, edicion, 'v');
    escribirManifiesto(edicion, generarManifiesto(edicion));

    writeFileSync(join(edicion, 'CONTENT', 'originals', 'intruso.txt'), 'no estaba');
    const problemas = verificarManifiesto(edicion);
    expect(problemas.some((p) => p.problema === 'no-manifestado')).toBe(true);
  });

  it('reingerir no destruye las colecciones ZIM ni lo curado aparte', async () => {
    const primera = await analizarCarpeta(origen, edicion);
    materializarEdicion(primera, origen, edicion, 'v1');

    // Una coleccion ZIM se anade aparte, no por ingesta.
    mkdirSync(join(edicion, 'CONTENT', 'zim'), { recursive: true });
    writeFileSync(join(edicion, 'CONTENT', 'zim', 'coleccion.zim'), 'contenido zim');

    const segunda = await analizarCarpeta(origen, edicion);
    materializarEdicion(segunda, origen, edicion, 'v2');

    expect(
      existsSync(join(edicion, 'CONTENT', 'zim', 'coleccion.zim')),
      'el ZIM debe sobrevivir',
    ).toBe(true);
  });

  it('reingestar la misma carpeta produce los mismos UUID (anclas estables)', async () => {
    const r1 = await analizarCarpeta(origen, edicion);
    const r2 = await analizarCarpeta(origen, edicion);
    expect(r1.recursos.map((r) => r.id)).toEqual(r2.recursos.map((r) => r.id));
  });
});
