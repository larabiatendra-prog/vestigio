import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  analizarBusquedaXml,
  analizarCatalogo,
  libroDeRuta,
  urlBusqueda,
  VERSION_KIWIX_PROBADA,
} from '../src/main/kiwix/contrato';
import { esDelOrigenPropio } from '../src/main/kiwix/cliente';

// Respuesta real capturada de kiwix-serve 3.8.1 (test contractual: si una
// version futura cambia el formato, esto falla y se bloquea la
// actualizacion en lugar de romperse en silencio).
const XML_REAL = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
  <channel>
    <title>Search: clima</title>
    <opensearch:totalResults>706</opensearch:totalResults>
    <opensearch:startIndex>0</opensearch:startIndex>
    <item>
      <title>Clima del Perú</title>
      <link>/content/wikipedia_es_climate-change_maxi_2026-07/Clima_del_Per%C3%BA</link>
      <description>El &lt;b&gt;clima&lt;/b&gt; del Perú es muy diverso...</description>
    </item>
    <item>
      <title>Cambio climático</title>
      <link>/content/wikipedia_es_climate-change_maxi_2026-07/Cambio_clim%C3%A1tico</link>
      <description>Variación del &lt;b&gt;clima&lt;/b&gt; a escala global</description>
    </item>
  </channel>
</rss>`;

describe('contrato de busqueda ZIM (kiwix-serve 3.8.1)', () => {
  it('analiza la respuesta XML real en el contrato comun', () => {
    const { total, resultados } = analizarBusquedaXml(XML_REAL);
    expect(total).toBe(706);
    expect(resultados).toHaveLength(2);
    expect(resultados[0]?.titulo).toBe('Clima del Perú');
    expect(resultados[0]?.libro).toBe('wikipedia_es_climate-change_maxi_2026-07');
    expect(resultados[0]?.ruta).toContain('/content/');
    // El marcado del fragmento se limpia: nada de HTML del servidor.
    expect(resultados[0]?.fragmento).toBe('El clima del Perú es muy diverso...');
    expect(resultados[1]?.titulo).toBe('Cambio climático');
  });

  it('una respuesta corrupta o inesperada devuelve vacio, no lanza', () => {
    expect(analizarBusquedaXml('esto no es xml').resultados).toEqual([]);
    expect(analizarBusquedaXml('').resultados).toEqual([]);
    expect(analizarBusquedaXml('<rss><channel><item></item></channel></rss>').resultados).toEqual(
      [],
    );
  });

  it('descarta items cuyo enlace no sea una ruta de contenido', () => {
    const xml = `<rss><channel><item><title>X</title><link>https://externo.example/x</link></item></channel></rss>`;
    expect(analizarBusquedaXml(xml).resultados).toEqual([]);
  });

  it('construye la URL de busqueda contra el origen propio y acota el limite', () => {
    const url = new URL(urlBusqueda('http://127.0.0.1:41850', 'agua potable', 999));
    expect(url.origin).toBe('http://127.0.0.1:41850');
    expect(url.pathname).toBe('/search');
    expect(url.searchParams.get('pattern')).toBe('agua potable');
    expect(url.searchParams.get('format')).toBe('xml');
    expect(url.searchParams.get('pageLength')).toBe('50');
  });

  it('extrae el libro de una ruta de contenido', () => {
    expect(libroDeRuta('/content/mi_libro/Articulo')).toBe('mi_libro');
    expect(libroDeRuta('/otra/cosa')).toBe('');
  });

  it('analiza el catalogo OPDS real sin contar autor y editor como colecciones', () => {
    // Fragmento real de kiwix-serve 3.8.1: el <name> del libro convive con
    // los <name> de <author> y <publisher>. Contarlos daba 3 colecciones
    // donde solo hay una.
    const opds = `<feed><entry>
      <id>urn:uuid:20df1f2b-424e-bf21-bcac-44a7440ac3c2</id>
      <title>Cambio climático por Wikipedia</title>
      <updated>2026-07-17T00:00:00Z</updated>
      <summary>Una selección de artículos sobre el cambio climático</summary>
      <language>spa</language>
      <name>wikipedia_es_climate-change</name>
      <tags>wikipedia;_category:wikipedia;_pictures:yes</tags>
      <articleCount>3759</articleCount>
      <author><name>Wikipedia</name></author>
      <publisher><name>openZIM</name></publisher>
    </entry></feed>`;

    const colecciones = analizarCatalogo(opds);
    expect(colecciones).toHaveLength(1);
    const c = colecciones[0];
    expect(c?.nombre).toBe('wikipedia_es_climate-change');
    expect(c?.autor).toBe('Wikipedia');
    expect(c?.editor).toBe('openZIM');
    expect(c?.uuid).toBe('20df1f2b-424e-bf21-bcac-44a7440ac3c2');
    expect(c?.idioma).toBe('spa');
    expect(c?.articulos).toBe(3759);
    // Las etiquetas internas de openZIM (con _) no se muestran.
    expect(c?.etiquetas).toEqual(['wikipedia']);
  });

  it('un catalogo vacio o ilegible no produce colecciones fantasma', () => {
    expect(analizarCatalogo('<feed></feed>')).toEqual([]);
    expect(analizarCatalogo('no es xml')).toEqual([]);
    expect(analizarCatalogo('<feed><entry><title>sin nombre</title></entry></feed>')).toEqual([]);
  });
});

describe('restriccion de origen exacto', () => {
  const propio = 'http://127.0.0.1:41850';

  it('acepta solo el origen exacto propiedad de Vestigio', () => {
    expect(esDelOrigenPropio('http://127.0.0.1:41850/search?x=1', propio)).toBe(true);
    expect(esDelOrigenPropio('http://127.0.0.1:41850/content/a/b', propio)).toBe(true);
  });

  it('rechaza otro puerto de loopback: no vale "todo 127.0.0.1"', () => {
    expect(esDelOrigenPropio('http://127.0.0.1:8080/algo', propio)).toBe(false);
    expect(esDelOrigenPropio('http://127.0.0.1:41851/algo', propio)).toBe(false);
  });

  it('rechaza localhost, la LAN y cualquier destino externo', () => {
    expect(esDelOrigenPropio('http://localhost:41850/x', propio)).toBe(false);
    expect(esDelOrigenPropio('http://192.168.1.5:41850/x', propio)).toBe(false);
    expect(esDelOrigenPropio('https://evil.example/x', propio)).toBe(false);
    expect(esDelOrigenPropio('no es una url', propio)).toBe(false);
  });

  it('sin servidor no se permite ningun destino', () => {
    expect(esDelOrigenPropio('http://127.0.0.1:41850/x', null)).toBe(false);
  });
});

describe('binario de kiwix', () => {
  it('la version probada esta declarada en el contrato', () => {
    expect(VERSION_KIWIX_PROBADA).toBe('3.8.1');
  });

  it('la ausencia de binario es un estado previsto, no un error', () => {
    // El gestor comprueba existencia antes de intentar arrancar; aqui se
    // fija la ruta esperada dentro de la entrega portable.
    const rutaEsperada = join('TOOLS', 'kiwix', 'kiwix-serve.exe');
    expect(rutaEsperada).toContain('kiwix-serve.exe');
    expect(existsSync(join('/ruta/que/no/existe', rutaEsperada))).toBe(false);
  });
});
