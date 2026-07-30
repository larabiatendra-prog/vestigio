import { describe, expect, it } from 'vitest';
import { sanearHtml, clasificarUrl } from '../src/sanear-html.js';
import { markdownAHtml, textoAHtml } from '../src/markdown.js';
import { segmentarHtml, segmentarTexto, aTextoPlano } from '../src/segmentar.js';

// Fixtures hostiles generados (bloque 05 t.9): ningun documento del corpus
// puede ejecutar script ni provocar una peticion de red.

describe('saneado: contenido activo', () => {
  it('elimina scripts con su contenido', () => {
    const { html, eliminados } = sanearHtml(
      '<p>antes</p><script>fetch("https://malo.example")</script><p>despues</p>',
    );
    expect(html).toBe('<p>antes</p><p>despues</p>');
    expect(html).not.toContain('fetch');
    expect(eliminados.scripts).toBe(1);
  });

  it('elimina manejadores de eventos en cualquier etiqueta', () => {
    const { html, eliminados } = sanearHtml(
      '<p onclick="robar()" onmouseover="x" ONLOAD="y">texto</p>',
    );
    expect(html).toBe('<p>texto</p>');
    expect(eliminados.handlers).toBe(3);
  });

  it('elimina iframes, formularios, objetos y svg con su contenido', () => {
    for (const hostil of [
      '<iframe src="https://malo.example"></iframe>',
      '<form action="https://malo.example"><input name="x"></form>',
      '<object data="x.swf"></object>',
      '<svg><script>alert(1)</script></svg>',
      '<embed src="x">',
    ]) {
      const { html } = sanearHtml(`<p>ok</p>${hostil}`);
      expect(html).toBe('<p>ok</p>');
    }
  });

  it('neutraliza javascript: aunque venga ofuscado con entidades o espacios', () => {
    const casos = [
      '<a href="javascript:alert(1)">x</a>',
      '<a href="JaVaScRiPt:alert(1)">x</a>',
      '<a href="java&#115;cript:alert(1)">x</a>',
      '<a href="  javascript:alert(1)">x</a>',
      '<a href="java\tscript:alert(1)">x</a>',
      '<a href="&#106;avascript:alert(1)">x</a>',
    ];
    for (const caso of casos) {
      const { html } = sanearHtml(caso);
      expect(html.toLowerCase()).not.toContain('javascript');
      expect(html).toBe('<a>x</a>');
    }
  });

  it('elimina data: y vbscript: en href y src', () => {
    const { html, eliminados } = sanearHtml(
      '<img src="data:text/html;base64,PHNjcmlwdD4="><a href="vbscript:msgbox">x</a>',
    );
    expect(html).not.toContain('data:');
    expect(html).not.toContain('vbscript');
    expect(eliminados.urlsPeligrosas).toBe(2);
  });

  it('no deja pasar recursos remotos: cero red en el lector', () => {
    const { html, eliminados } = sanearHtml(
      '<img src="https://cdn.example/x.png"><a href="//evil.example">y</a><img src="imagenes/local.png">',
    );
    expect(html).not.toContain('example');
    expect(html).toContain('imagenes/local.png');
    expect(eliminados.recursosRemotos).toBe(2);
  });

  it('descarta style y comentarios condicionales', () => {
    const { html } = sanearHtml(
      '<p style="background:url(https://malo.example)">t</p><!--[if IE]><script>x</script><![endif]-->',
    );
    expect(html).toBe('<p>t</p>');
  });

  it('un < suelto no rompe el saneado ni inyecta marcado', () => {
    const { html } = sanearHtml('<p>5 < 7 y 9 > 2</p>');
    expect(html).toContain('&lt;');
    expect(html).not.toContain('<7');
  });

  it('etiquetas mal cerradas no dejan HTML roto', () => {
    const { html } = sanearHtml('<div><p>uno<div>dos');
    expect(html.match(/<div>/g)?.length).toBe(html.match(/<\/div>/g)?.length);
  });
});

describe('saneado: estructura conservada', () => {
  it('conserva encabezados, listas, tablas y anclas', () => {
    const original =
      '<h2 id="agua">Agua</h2><ul><li>hervir</li></ul><table><tr><th scope="col">dosis</th><td colspan="2">2 gotas</td></tr></table><a href="#agua">volver</a>';
    const { html } = sanearHtml(original);
    expect(html).toContain('<h2 id="agua">Agua</h2>');
    expect(html).toContain('<li>hervir</li>');
    expect(html).toContain('scope="col"');
    expect(html).toContain('colspan="2"');
    expect(html).toContain('href="#agua"');
  });

  it('conserva alt de imagenes locales', () => {
    const { html } = sanearHtml('<img src="fig/1.png" alt="Filtro de tres capas">');
    expect(html).toContain('alt="Filtro de tres capas"');
  });

  it('preserva tildes y eñes en NFC', () => {
    const { html } = sanearHtml('<p>El cañón de riego en la montaña</p>');
    expect(aTextoPlano(html)).toBe('El cañón de riego en la montaña');
  });

  it('clasifica URLs correctamente', () => {
    expect(clasificarUrl('#seccion')).toBe('ancla');
    expect(clasificarUrl('imagenes/a.png')).toBe('segura-relativa');
    expect(clasificarUrl('https://x.example')).toBe('remota');
    expect(clasificarUrl('javascript:x')).toBe('peligrosa');
    expect(clasificarUrl('file:///C:/windows')).toBe('peligrosa');
  });
});

describe('segmentacion con localizadores estables', () => {
  const documento =
    '<h2>Agua</h2><p>Hervir un minuto.</p><h3>Lejía</h3><p>Dos gotas por litro.</p><h3>Filtrado</h3><p>Tela limpia.</p><h2>Comida</h2><p>Conservas.</p>';

  it('genera localizadores jerarquicos deterministas', () => {
    const segmentos = segmentarHtml(documento);
    expect(segmentos.map((s) => s.localizador)).toEqual(['sec-1', 'sec-1-1', 'sec-1-2', 'sec-2']);
    expect(segmentos.map((s) => s.titulo)).toEqual(['Agua', 'Lejía', 'Filtrado', 'Comida']);
    expect(segmentos[1]?.cuerpo).toContain('Dos gotas');
  });

  it('los localizadores no cambian al reprocesar', () => {
    expect(segmentarHtml(documento).map((s) => s.localizador)).toEqual(
      segmentarHtml(documento).map((s) => s.localizador),
    );
  });

  it('un documento sin encabezados usa bloques ordinales', () => {
    const segmentos = segmentarTexto('Primer parrafo.\n\nSegundo parrafo.');
    expect(segmentos[0]?.localizador).toBe('bloque-1');
    expect(segmentos[0]?.cuerpo).toContain('Primer parrafo');
  });

  it('el texto anterior al primer encabezado queda como preambulo', () => {
    const segmentos = segmentarHtml('<p>Intro.</p><h2>Uno</h2><p>Cuerpo.</p>');
    expect(segmentos[0]?.localizador).toBe('preambulo');
    expect(segmentos[1]?.localizador).toBe('sec-1');
  });
});

describe('markdown y txt', () => {
  it('convierte encabezados, listas, enfasis y codigo', () => {
    const html = markdownAHtml(
      '# Título\n\nTexto con **negrita** y `código`.\n\n- uno\n- dos\n\n1. primero\n',
    );
    expect(html).toContain('<h1>Título</h1>');
    expect(html).toContain('<strong>negrita</strong>');
    expect(html).toContain('<code>código</code>');
    expect(html).toContain('<ul><li>uno</li><li>dos</li></ul>');
    expect(html).toContain('<ol><li>primero</li></ol>');
  });

  it('el HTML crudo dentro de Markdown queda como texto inerte, nunca como marcado', () => {
    const { html } = sanearHtml(markdownAHtml('Texto <script>alert(1)</script> más texto'));
    // Markdown escapa el marcado: se ve el texto literal, no se ejecuta nada.
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('más texto');
  });

  it('los bloques de codigo no ejecutan nada al sanearse', () => {
    const { html } = sanearHtml(markdownAHtml('```\n<script>alert(1)</script>\n```'));
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('TXT se escapa por completo', () => {
    const html = textoAHtml('Comparar 3 < 5\n\n<b>no es negrita</b>');
    expect(html).toContain('3 &lt; 5');
    expect(html).toContain('&lt;b&gt;');
  });
});
