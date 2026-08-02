import { describe, expect, it } from 'vitest';
import { escribirZip, type EntradaZip } from '@vestigio/zip';
import { leerEpub, resolverRutaEpub, PREFIJO_IMAGEN_EPUB } from '../src/epub.js';

const texto = (s: string): Buffer => Buffer.from(s, 'utf8');

/** PNG de 1x1 valido: basta para comprobar que la imagen viaja entera. */
const PNG_MINIMO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const CONTENEDOR = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/libro.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

function opf(extra: { manifiesto?: string; spine?: string } = {}): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Manual de supervivencia doméstica</dc:title>
    <dc:creator>Ana Bermúdez</dc:creator>
    <dc:language>es</dc:language>
    <dc:date>2024-03-01</dc:date>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="cap1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="cap2.xhtml" media-type="application/xhtml+xml"/>
    <item id="fig" href="img/figura.png" media-type="image/png"/>
    ${extra.manifiesto ?? ''}
  </manifest>
  <spine>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
    ${extra.spine ?? ''}
  </spine>
</package>`;
}

const NAV = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body><nav epub:type="toc"><ol>
    <li><a href="cap1.xhtml">El agua</a></li>
    <li><a href="cap2.xhtml">El fuego</a></li>
  </ol></nav></body>
</html>`;

const CAP1 = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><body>
  <h1>El agua</h1>
  <p>Hervir el agua un minuto a borbotones destruye los patógenos.</p>
  <img src="img/figura.png" alt="Esquema del filtro de arena"/>
</body></html>`;

const CAP2 = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><body>
  <h1>El fuego</h1>
  <p>La yesca seca prende con una chispa; la húmeda no prende con nada.</p>
</body></html>`;

function epubDePrueba(entradas: EntradaZip[] = []): Buffer {
  return escribirZip([
    { nombre: 'mimetype', datos: texto('application/epub+zip') },
    { nombre: 'META-INF/container.xml', datos: texto(CONTENEDOR) },
    { nombre: 'OEBPS/libro.opf', datos: texto(opf()) },
    { nombre: 'OEBPS/nav.xhtml', datos: texto(NAV) },
    { nombre: 'OEBPS/cap1.xhtml', datos: texto(CAP1) },
    { nombre: 'OEBPS/cap2.xhtml', datos: texto(CAP2) },
    { nombre: 'OEBPS/img/figura.png', datos: PNG_MINIMO },
    ...entradas,
  ]);
}

describe('un EPUB corriente', () => {
  const resultado = leerEpub(epubDePrueba());

  it('se lee entero y saca los metadatos que declara', () => {
    expect(resultado.diagnostico).toBe('con-texto');
    expect(resultado.titulo).toBe('Manual de supervivencia doméstica');
    expect(resultado.autor).toBe('Ana Bermúdez');
    expect(resultado.idioma).toBe('es');
    expect(resultado.fecha).toBe('2024-03-01');
  });

  it('respeta el orden de lectura del spine', () => {
    expect(resultado.capitulos.map((c) => c.href)).toEqual([
      'OEBPS/cap1.xhtml',
      'OEBPS/cap2.xhtml',
    ]);
  });

  it('los localizadores son por capitulo, nunca por pagina inventada', () => {
    expect(resultado.capitulos.map((c) => c.localizador)).toEqual(['cap-1', 'cap-2']);
    // Reconstruir el mismo EPUB da exactamente los mismos localizadores.
    const otra = leerEpub(epubDePrueba());
    expect(otra.capitulos.map((c) => c.localizador)).toEqual(
      resultado.capitulos.map((c) => c.localizador),
    );
  });

  it('toma los titulos del indice de navegacion', () => {
    expect(resultado.capitulos.map((c) => c.titulo)).toEqual(['El agua', 'El fuego']);
  });

  it('extrae el texto para poder buscarlo', () => {
    expect(resultado.capitulos[0]?.texto).toContain('borbotones');
    expect(resultado.capitulos[1]?.texto).toContain('yesca');
  });

  it('saca las imagenes con sus bytes intactos', () => {
    expect(resultado.imagenes).toHaveLength(1);
    expect(resultado.imagenes[0]?.href).toBe('OEBPS/img/figura.png');
    expect(resultado.imagenes[0]?.datos.equals(PNG_MINIMO)).toBe(true);
  });

  it('apunta las imagenes al protocolo interno y conserva el alt', () => {
    const html = resultado.capitulos[0]?.html ?? '';
    expect(html).toContain(`${PREFIJO_IMAGEN_EPUB}OEBPS/img/figura.png`);
    expect(html).toContain('Esquema del filtro de arena');
  });
});

describe('nada se ejecuta y nada sale a la red', () => {
  const hostil = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><body>
  <h1>Capítulo con sorpresas</h1>
  <script>fetch('https://ejemplo.invalido/robo')</script>
  <p onclick="alert(1)">Texto legítimo que debe sobrevivir.</p>
  <img src="https://ejemplo.invalido/rastreador.gif" alt="rastreador"/>
  <iframe src="https://ejemplo.invalido/"></iframe>
  <a href="javascript:alert(1)">enlace</a>
  <form action="https://ejemplo.invalido/"><input name="x"/></form>
</body></html>`;

  const resultado = leerEpub(
    escribirZip([
      { nombre: 'mimetype', datos: texto('application/epub+zip') },
      { nombre: 'META-INF/container.xml', datos: texto(CONTENEDOR) },
      { nombre: 'OEBPS/libro.opf', datos: texto(opf()) },
      { nombre: 'OEBPS/nav.xhtml', datos: texto(NAV) },
      { nombre: 'OEBPS/cap1.xhtml', datos: texto(hostil) },
      { nombre: 'OEBPS/cap2.xhtml', datos: texto(CAP2) },
      { nombre: 'OEBPS/img/figura.png', datos: PNG_MINIMO },
    ]),
  );

  const html = resultado.capitulos[0]?.html ?? '';

  it('el texto legitimo sobrevive', () => {
    expect(html).toContain('Texto legítimo que debe sobrevivir');
  });

  it('no queda script, ni handler, ni formulario, ni iframe', () => {
    expect(html).not.toContain('<script');
    expect(html).not.toContain('fetch(');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<form');
  });

  it('no queda ninguna direccion de Internet', () => {
    expect(html).not.toContain('ejemplo.invalido');
    expect(html).not.toContain('javascript:');
  });
});

describe('EPUB rotos o con trampa', () => {
  it('lo que no es un ZIP se rechaza con motivo, sin excepcion', () => {
    const r = leerEpub(Buffer.from('esto no es un epub', 'utf8'));
    expect(r.diagnostico).toBe('invalido');
    expect(r.detalle).toMatch(/no es un EPUB legible/);
  });

  it('sin contenedor no hay por donde empezar', () => {
    const r = leerEpub(escribirZip([{ nombre: 'mimetype', datos: texto('application/epub+zip') }]));
    expect(r.diagnostico).toBe('invalido');
    expect(r.detalle).toContain('META-INF/container.xml');
  });

  it('un contenedor que apunta a un paquete ausente se explica', () => {
    const r = leerEpub(
      escribirZip([
        { nombre: 'mimetype', datos: texto('application/epub+zip') },
        { nombre: 'META-INF/container.xml', datos: texto(CONTENEDOR) },
      ]),
    );
    expect(r.diagnostico).toBe('invalido');
    expect(r.detalle).toContain('OEBPS/libro.opf');
  });

  it('sin orden de lectura no se inventa uno', () => {
    const sinSpine = opf().replace(/<itemref[^>]*\/>/g, '');
    const r = leerEpub(
      escribirZip([
        { nombre: 'mimetype', datos: texto('application/epub+zip') },
        { nombre: 'META-INF/container.xml', datos: texto(CONTENEDOR) },
        { nombre: 'OEBPS/libro.opf', datos: texto(sinSpine) },
      ]),
    );
    expect(r.diagnostico).toBe('invalido');
    expect(r.detalle).toContain('spine');
  });

  it('un capitulo que el spine cita y no existe no tumba el libro', () => {
    const conFantasma = opf({
      manifiesto: '<item id="c9" href="fantasma.xhtml" media-type="application/xhtml+xml"/>',
      spine: '<itemref idref="c9"/>',
    });
    const r = leerEpub(
      escribirZip([
        { nombre: 'mimetype', datos: texto('application/epub+zip') },
        { nombre: 'META-INF/container.xml', datos: texto(CONTENEDOR) },
        { nombre: 'OEBPS/libro.opf', datos: texto(conFantasma) },
        { nombre: 'OEBPS/nav.xhtml', datos: texto(NAV) },
        { nombre: 'OEBPS/cap1.xhtml', datos: texto(CAP1) },
        { nombre: 'OEBPS/cap2.xhtml', datos: texto(CAP2) },
        { nombre: 'OEBPS/img/figura.png', datos: PNG_MINIMO },
      ]),
    );
    expect(r.diagnostico).toBe('con-texto');
    expect(r.capitulos).toHaveLength(2);
    expect(r.avisos.join(' ')).toContain('ausente');
  });

  it('el mimetype raro se anota pero no impide leer', () => {
    const r = leerEpub(
      escribirZip([
        { nombre: 'mimetype', datos: texto('application/zip') },
        { nombre: 'META-INF/container.xml', datos: texto(CONTENEDOR) },
        { nombre: 'OEBPS/libro.opf', datos: texto(opf()) },
        { nombre: 'OEBPS/nav.xhtml', datos: texto(NAV) },
        { nombre: 'OEBPS/cap1.xhtml', datos: texto(CAP1) },
        { nombre: 'OEBPS/cap2.xhtml', datos: texto(CAP2) },
        { nombre: 'OEBPS/img/figura.png', datos: PNG_MINIMO },
      ]),
    );
    expect(r.diagnostico).toBe('con-texto');
    expect(r.avisos.join(' ')).toContain('mimetype inesperado');
  });
});

describe('rutas dentro del EPUB', () => {
  it('resuelve relativas contra la carpeta del documento que las cita', () => {
    expect(resolverRutaEpub('OEBPS/cap1.xhtml', 'img/f.png')).toBe('OEBPS/img/f.png');
    expect(resolverRutaEpub('OEBPS/Text/cap1.xhtml', '../Images/f.png')).toBe('OEBPS/Images/f.png');
    expect(resolverRutaEpub('OEBPS/cap1.xhtml', './otro.xhtml')).toBe('OEBPS/otro.xhtml');
    // El ancla no forma parte del fichero.
    expect(resolverRutaEpub('OEBPS/cap1.xhtml', 'cap2.xhtml#seccion')).toBe('OEBPS/cap2.xhtml');
  });

  it('no deja salirse del EPUB ni saltar a la red', () => {
    expect(resolverRutaEpub('OEBPS/cap1.xhtml', '../../../../etc/passwd')).toBeNull();
    expect(resolverRutaEpub('cap1.xhtml', '../fuera.png')).toBeNull();
    expect(resolverRutaEpub('OEBPS/cap1.xhtml', 'https://ejemplo.invalido/x.png')).toBeNull();
    expect(resolverRutaEpub('OEBPS/cap1.xhtml', '//ejemplo.invalido/x.png')).toBeNull();
    expect(resolverRutaEpub('OEBPS/cap1.xhtml', '')).toBeNull();
  });
});

describe('EPUB 2 con NCX en vez de nav', () => {
  const OPF2 = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Libro antiguo</dc:title>
    <dc:language>es</dc:language>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="c1" href="cap1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx"><itemref idref="c1"/></spine>
</package>`;

  const NCX = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="n1" playOrder="1">
      <navLabel><text>Capítulo primero</text></navLabel>
      <content src="cap1.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`;

  it('saca los titulos del NCX', () => {
    const r = leerEpub(
      escribirZip([
        { nombre: 'mimetype', datos: texto('application/epub+zip') },
        { nombre: 'META-INF/container.xml', datos: texto(CONTENEDOR) },
        { nombre: 'OEBPS/libro.opf', datos: texto(OPF2) },
        { nombre: 'OEBPS/toc.ncx', datos: texto(NCX) },
        { nombre: 'OEBPS/cap1.xhtml', datos: texto(CAP1) },
      ]),
    );
    expect(r.diagnostico).toBe('con-texto');
    expect(r.titulo).toBe('Libro antiguo');
    expect(r.capitulos[0]?.titulo).toBe('Capítulo primero');
  });
});
