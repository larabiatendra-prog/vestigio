// Contrato con kiwix-serve, fijado por version (plan §6.2, bloque 08 t.5).
// Solo se usa la API publica documentada. Si una ruta cambia en una version
// futura, los tests contractuales fallan y se bloquea la actualizacion en
// lugar de ampliar la allowlist.

export const VERSION_KIWIX_PROBADA = '3.8.1';

/** Resultado de busqueda normalizado al contrato comun de Vestigio. */
export interface ResultadoZim {
  titulo: string;
  /** Ruta interna servida por Kiwix: /content/<libro>/<articulo>. */
  ruta: string;
  libro: string;
  fragmento: string;
}

export interface RespuestaBusquedaZim {
  total: number;
  resultados: ResultadoZim[];
}

function extraerEtiqueta(bloque: string, etiqueta: string): string {
  const re = new RegExp(`<${etiqueta}[^>]*>([\\s\\S]*?)</${etiqueta}>`, 'i');
  const m = re.exec(bloque);
  return m?.[1] ?? '';
}

/**
 * Convierte un valor XML de Kiwix en texto plano. El orden importa: se
 * decodifican las entidades ANTES de quitar etiquetas, porque Kiwix envia
 * el resaltado escapado (`&lt;b&gt;`) y decodificar al final lo dejaria
 * pasar como marcado. Aqui solo entra texto: la interfaz nunca recibe HTML
 * procedente del servidor de colecciones.
 */
function decodificarXml(texto: string): string {
  return (
    texto
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
      // Segunda pasada: lo que las entidades hayan revelado tampoco pasa.
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Extrae el nombre del libro de una ruta /content/<libro>/<articulo>. */
export function libroDeRuta(ruta: string): string {
  const m = /^\/content\/([^/]+)\//.exec(ruta);
  return m?.[1] ?? '';
}

/**
 * Analiza la respuesta OpenSearch/RSS de `/search?...&format=xml`.
 * Tolerante: una respuesta inesperada devuelve cero resultados en vez de
 * lanzar; Kiwix nunca debe poder tumbar la busqueda del catalogo.
 */
export function analizarBusquedaXml(xml: string): RespuestaBusquedaZim {
  const totalTexto = extraerEtiqueta(xml, 'opensearch:totalResults');
  const total = Number.parseInt(decodificarXml(totalTexto), 10);

  const resultados: ResultadoZim[] = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const bloque = m[1] ?? '';
    const titulo = decodificarXml(extraerEtiqueta(bloque, 'title'));
    const ruta = decodificarXml(extraerEtiqueta(bloque, 'link'));
    if (titulo.length === 0 || !ruta.startsWith('/content/')) continue;
    resultados.push({
      titulo,
      ruta,
      libro: libroDeRuta(ruta),
      fragmento: decodificarXml(extraerEtiqueta(bloque, 'description')),
    });
  }

  return { total: Number.isFinite(total) ? total : resultados.length, resultados };
}

/** Construye la URL de busqueda contra el origen exacto propio. */
export function urlBusqueda(origen: string, texto: string, limite: number): string {
  const url = new URL('/search', origen);
  url.searchParams.set('pattern', texto);
  url.searchParams.set('format', 'xml');
  url.searchParams.set('pageLength', String(Math.min(Math.max(1, limite), 50)));
  url.searchParams.set('start', '0');
  return url.toString();
}

/**
 * Metadatos de una coleccion ZIM (plan §8.2 `zim_collections`, bloque 08
 * t.4). Se registran para poder distinguir la evaluacion de la COLECCION
 * de la de cada articulo: que una coleccion sea fiable no convierte cada
 * uno de sus articulos en una fuente evaluada (plan §8.4).
 */
export interface ColeccionZim {
  /** Nombre servido por Kiwix; es el que aparece en /content/<nombre>/. */
  nombre: string;
  uuid: string | null;
  titulo: string | null;
  descripcion: string | null;
  idioma: string | null;
  fecha: string | null;
  autor: string | null;
  editor: string | null;
  etiquetas: string[];
  articulos: number | null;
}

/**
 * Analiza el catalogo OPDS. Cada `<entry>` es una coleccion; el `<name>`
 * del libro convive con los `<name>` de autor y editor, asi que esos
 * bloques se retiran antes de leerlo (si no, se cuentan como colecciones).
 */
export function analizarCatalogo(xml: string): ColeccionZim[] {
  const colecciones: ColeccionZim[] = [];
  const re = /<entry>([\s\S]*?)<\/entry>/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(xml)) !== null) {
    const bloque = m[1] ?? '';
    const autor = decodificarXml(extraerEtiqueta(extraerEtiqueta(bloque, 'author'), 'name'));
    const editor = decodificarXml(extraerEtiqueta(extraerEtiqueta(bloque, 'publisher'), 'name'));
    const sinAgentes = bloque
      .replace(/<author>[\s\S]*?<\/author>/gi, '')
      .replace(/<publisher>[\s\S]*?<\/publisher>/gi, '');

    const nombre = decodificarXml(extraerEtiqueta(sinAgentes, 'name'));
    if (nombre.length === 0) continue;

    const etiquetas = decodificarXml(extraerEtiqueta(sinAgentes, 'tags'))
      .split(';')
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !t.startsWith('_'));
    const articulos = Number.parseInt(
      decodificarXml(extraerEtiqueta(sinAgentes, 'articleCount')),
      10,
    );
    const uuid = decodificarXml(extraerEtiqueta(sinAgentes, 'id')).replace(/^urn:uuid:/, '');

    colecciones.push({
      nombre,
      uuid: uuid.length > 0 ? uuid : null,
      titulo: vacioANulo(decodificarXml(extraerEtiqueta(sinAgentes, 'title'))),
      descripcion: vacioANulo(decodificarXml(extraerEtiqueta(sinAgentes, 'summary'))),
      idioma: vacioANulo(decodificarXml(extraerEtiqueta(sinAgentes, 'language'))),
      fecha: vacioANulo(decodificarXml(extraerEtiqueta(sinAgentes, 'updated'))),
      autor: vacioANulo(autor),
      editor: vacioANulo(editor),
      etiquetas,
      articulos: Number.isFinite(articulos) ? articulos : null,
    });
  }
  return colecciones;
}

function vacioANulo(texto: string): string | null {
  return texto.length > 0 ? texto : null;
}
