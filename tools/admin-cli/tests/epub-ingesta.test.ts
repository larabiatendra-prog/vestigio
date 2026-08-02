import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { abrirBaseContenido } from '@vestigio/database';
import { escribirZip } from '@vestigio/zip';
import { analizarCarpeta, materializarEdicion } from '../src/ingesta.js';

// Bloque 07 de extremo a extremo: de un fichero .epub en una carpeta a un
// libro buscable, con sus capitulos, su indice y sus imagenes servidas por
// el protocolo interno.

let dir: string;
let origen: string;
let edicion: string;

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const t = (s: string): Buffer => Buffer.from(s, 'utf8');

const OPF = `<?xml version="1.0"?>
<package version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Tratado del fuego</dc:title>
    <dc:creator>Nuria Sanchis</dc:creator>
    <dc:language>ca</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="cap1.xhtml" media-type="application/xhtml+xml"/>
    <item id="fig" href="img/fuego.png" media-type="image/png"/>
  </manifest>
  <spine><itemref idref="c1"/></spine>
</package>`;

const CAPITULO =
  '<html><body><h1>La yesca</h1>' +
  '<p>La yesca seca prende con una sola chispa del pedernal.</p>' +
  '<img src="img/fuego.png" alt="Chispa sobre yesca"/></body></html>';

function escribirEpub(destino: string): void {
  writeFileSync(
    destino,
    escribirZip([
      { nombre: 'mimetype', datos: t('application/epub+zip') },
      {
        nombre: 'META-INF/container.xml',
        datos: t(
          '<?xml version="1.0"?><container version="1.0"><rootfiles>' +
            '<rootfile full-path="OEBPS/libro.opf"/></rootfiles></container>',
        ),
      },
      { nombre: 'OEBPS/libro.opf', datos: t(OPF) },
      {
        nombre: 'OEBPS/nav.xhtml',
        datos: t(
          '<html><body><nav><ol><li><a href="cap1.xhtml">La yesca</a></li></ol></nav></body></html>',
        ),
      },
      { nombre: 'OEBPS/cap1.xhtml', datos: t(CAPITULO) },
      { nombre: 'OEBPS/img/fuego.png', datos: PNG },
    ]),
  );
}

function abrirCatalogo(): ReturnType<typeof abrirBaseContenido>['db'] {
  return abrirBaseContenido(join(edicion, 'CONTENT', 'index', 'vestigio-content.sqlite')).db;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vestigio-epub-'));
  origen = join(dir, 'origen');
  edicion = join(dir, 'edicion');
  mkdirSync(origen, { recursive: true });
  // Un documento corriente para que la carpeta no sea solo el EPUB.
  writeFileSync(join(origen, 'nota.md'), '# Nota\n\nAlgo de texto para acompanar.\n');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('un EPUB entra en la biblioteca', () => {
  it('con sus metadatos, su capitulo y su indice', async () => {
    escribirEpub(join(origen, 'fuego.epub'));
    const resultado = await analizarCarpeta(origen, edicion);
    materializarEdicion(resultado, origen, edicion, '2026-C1-prueba');

    const db = abrirCatalogo();
    const libro = db
      .prepare("SELECT id, titulo, autor, idioma, estado_texto FROM recursos WHERE formato='epub'")
      .get() as {
      id: string;
      titulo: string;
      autor: string;
      idioma: string;
      estado_texto: string;
    };

    expect(libro.titulo).toBe('Tratado del fuego');
    expect(libro.autor).toBe('Nuria Sanchis');
    // El idioma que declara el libro manda sobre la deteccion estadistica.
    expect(libro.idioma).toBe('ca');
    expect(libro.estado_texto).toBe('texto-completo');

    const segmentos = db
      .prepare(
        'SELECT localizador, titulo, cuerpo, html, pagina FROM segmentos ' +
          'WHERE recurso_pk = (SELECT pk FROM recursos WHERE id = ?)',
      )
      .all(libro.id) as unknown as {
      localizador: string;
      titulo: string;
      cuerpo: string;
      html: string;
      pagina: number | null;
    }[];

    expect(segmentos).toHaveLength(1);
    expect(segmentos[0]?.localizador).toBe('cap-1');
    expect(segmentos[0]?.titulo).toBe('La yesca');
    expect(segmentos[0]?.cuerpo).toContain('pedernal');
    // Nunca una pagina inventada en un EPUB reflowable.
    expect(segmentos[0]?.pagina).toBeNull();
    db.close();
  });

  it('la imagen se guarda como asset propio y el capitulo la cita por el protocolo', async () => {
    escribirEpub(join(origen, 'fuego.epub'));
    const resultado = await analizarCarpeta(origen, edicion);
    materializarEdicion(resultado, origen, edicion, '2026-C1-prueba');

    const db = abrirCatalogo();
    const imagen = db
      .prepare(
        'SELECT a.id, a.ruta_logica AS ruta FROM assets a ' +
          "JOIN asset_roles r ON r.asset_pk = a.pk WHERE r.rol = 'access_derivative'",
      )
      .get() as { id: string; ruta: string } | undefined;
    expect(imagen).toBeDefined();

    const html = (
      db.prepare("SELECT html FROM segmentos WHERE localizador='cap-1'").get() as { html: string }
    ).html;
    expect(html).toContain(`vestigio://asset/${imagen?.id ?? ''}`);
    // El texto alternativo original se conserva (bloque 07, t.6).
    expect(html).toContain('Chispa sobre yesca');
    // Y el fichero esta de verdad en la entrega.
    expect(existsSync(join(edicion, 'CONTENT', imagen?.ruta ?? ''))).toBe(true);
    db.close();
  });

  it('se puede buscar por su interior', async () => {
    escribirEpub(join(origen, 'fuego.epub'));
    const resultado = await analizarCarpeta(origen, edicion);
    materializarEdicion(resultado, origen, edicion, '2026-C1-prueba');

    const db = abrirCatalogo();
    const encontrados = db
      .prepare("SELECT count(*) AS n FROM segmentos_fts WHERE segmentos_fts MATCH 'pedernal'")
      .get() as { n: number };
    expect(encontrados.n).toBe(1);
    db.close();
  });

  it('reingerir la misma carpeta da los mismos identificadores', async () => {
    escribirEpub(join(origen, 'fuego.epub'));
    const primera = await analizarCarpeta(origen, edicion);
    const segunda = await analizarCarpeta(origen, edicion);
    expect(segunda.recursos.map((r) => r.id)).toEqual(primera.recursos.map((r) => r.id));
    expect(segunda.derivados.map((d) => d.rutaLogica)).toEqual(
      primera.derivados.map((d) => d.rutaLogica),
    );
  });
});

describe('lo que puede salir mal', () => {
  it('un EPUB roto no tumba la ingesta del resto de la carpeta', async () => {
    writeFileSync(join(origen, 'roto.epub'), Buffer.from('PK y basura', 'latin1'));
    const resultado = await analizarCarpeta(origen, edicion);
    // La nota corriente entra igualmente.
    expect(resultado.informe.ingeridos).toBeGreaterThanOrEqual(1);
    expect(resultado.recursos.some((r) => r.titulo === 'Nota')).toBe(true);
  });

  it('una imagen suelta entra y declara que no tiene texto', async () => {
    writeFileSync(join(origen, 'plano.png'), PNG);
    const resultado = await analizarCarpeta(origen, edicion);
    materializarEdicion(resultado, origen, edicion, '2026-C1-prueba');

    const db = abrirCatalogo();
    const imagen = db
      .prepare("SELECT estado_texto, detalle_texto FROM recursos WHERE formato='imagen'")
      .get() as { estado_texto: string; detalle_texto: string };
    expect(imagen.estado_texto).toBe('sin-texto');
    expect(imagen.detalle_texto).toContain('no hay texto que buscar');
    db.close();
  });
});
