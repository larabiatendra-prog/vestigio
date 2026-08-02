// Lectura de EPUB (bloque 07).
//
// Un EPUB es un ZIP con XML dentro, asi que se apoya en dos piezas que ya
// existian: el lector de ZIP endurecido (@vestigio/zip) y el tokenizador de
// marcado del saneador. No se anade ninguna dependencia.
//
// Lo que NO se hace, a proposito:
//
//  - No se ejecuta nada. El XHTML de cada capitulo pasa por el mismo saneado
//    por lista blanca que el HTML corriente: sin scripts, sin formularios,
//    sin recursos remotos.
//  - No se simulan paginas. Un EPUB reflowable no tiene paginas estables, y
//    fingirlas seria mentir sobre donde esta el lector (plan bloque 07 t.4).
//    Los localizadores son por capitulo del spine, que si es estable.
//  - No se valida con EPUBCheck. Es una herramienta externa en Java, de la
//    misma familia que DROID o veraPDF, y este proyecto ya aplazo esos
//    validadores al bloque 19 con el corpus real. Aqui se valida la
//    estructura que Vestigio necesita para leer, y un EPUB roto se rechaza
//    con un motivo entendible.

import { leerZip, ErrorZip, LIMITES_EPUB, type EntradaZip } from '@vestigio/zip';
import { sanearHtml, tokenizar, type Token } from './sanear-html.js';
import { aTextoPlano } from './segmentar.js';

const RUTA_CONTENEDOR = 'META-INF/container.xml';
const MIMETYPE_EPUB = 'application/epub+zip';

/** Prefijo con el que un capitulo referencia una imagen del propio EPUB. */
export const PREFIJO_IMAGEN_EPUB = 'vestigio://imagen/';

export interface CapituloEpub {
  /** Estable entre reconstrucciones: depende del orden del spine. */
  localizador: string;
  /** Ruta dentro del EPUB; sirve de cita de respaldo si el orden cambia. */
  href: string;
  titulo: string | null;
  /** XHTML ya saneado, listo para el lector comun. */
  html: string;
  /** Texto plano para el indice de busqueda. */
  texto: string;
  orden: number;
}

export interface ImagenEpub {
  /** Ruta normalizada dentro del EPUB; es la clave que usan los capitulos. */
  href: string;
  mimetype: string;
  datos: Buffer;
}

export type DiagnosticoEpub = 'con-texto' | 'sin-texto' | 'invalido';

export interface ResultadoEpub {
  diagnostico: DiagnosticoEpub;
  titulo: string | null;
  autor: string | null;
  idioma: string | null;
  fecha: string | null;
  capitulos: CapituloEpub[];
  imagenes: ImagenEpub[];
  /** Motivo legible cuando el diagnostico no es 'con-texto'. */
  detalle: string | null;
  /** Rarezas que no impiden leer pero conviene registrar. */
  avisos: string[];
  herramienta: string;
}

export const HERRAMIENTA_EPUB = 'vestigio-epub@1';

// --- Utilidades de XML -------------------------------------------------------
//
// No hace falta un parser XML completo: container.xml, el OPF y el NCX son
// documentos pequenos y planos. Se recorre la lista de tokens.

/** Entidades XML basicas mas las numericas. */
function decodificarEntidades(texto: string): string {
  return texto
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function atributo(token: Token, nombre: string): string | null {
  for (const [clave, valor] of token.atributos ?? []) {
    if (clave === nombre) return decodificarEntidades(valor);
  }
  return null;
}

/**
 * Elementos de apertura con ese nombre. El tokenizador pasa los nombres a
 * minusculas, asi que 'dc:Title' y 'dc:title' caen en el mismo sitio; los
 * EPUB reales usan minusculas y la alternativa seria un parser XML entero.
 */
function elementos(tokens: Token[], nombre: string): { token: Token; indice: number }[] {
  const encontrados: { token: Token; indice: number }[] = [];
  tokens.forEach((token, indice) => {
    if (token.tipo === 'apertura' && token.nombre === nombre) encontrados.push({ token, indice });
  });
  return encontrados;
}

/** Texto contenido entre un elemento de apertura y su cierre. */
function textoInterno(tokens: Token[], indiceApertura: number): string {
  const apertura = tokens[indiceApertura];
  if (apertura === undefined || apertura.autocerrado === true) return '';
  const nombre = apertura.nombre;
  let profundidad = 0;
  const partes: string[] = [];
  for (let i = indiceApertura + 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) break;
    if (token.tipo === 'apertura' && token.nombre === nombre && token.autocerrado !== true) {
      profundidad++;
    } else if (token.tipo === 'cierre' && token.nombre === nombre) {
      if (profundidad === 0) break;
      profundidad--;
    } else if (token.tipo === 'texto') {
      partes.push(token.texto ?? '');
    }
  }
  return decodificarEntidades(partes.join('')).trim();
}

/** Primer texto no vacio de los elementos con ese nombre. */
function primerTexto(tokens: Token[], nombre: string): string | null {
  for (const { indice } of elementos(tokens, nombre)) {
    const texto = textoInterno(tokens, indice);
    if (texto.length > 0) return texto;
  }
  return null;
}

// --- Rutas dentro del EPUB ---------------------------------------------------

/**
 * Resuelve una ruta relativa contra la carpeta del documento que la cita,
 * como haria un navegador, pero sin dejar que se salga del EPUB.
 */
export function resolverRutaEpub(base: string, relativa: string): string | null {
  const limpia = relativa.split('#')[0]?.split('?')[0] ?? '';
  if (limpia.length === 0) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(limpia) || limpia.startsWith('//')) return null;

  const partesBase = base.split('/').slice(0, -1);
  const partes = limpia.startsWith('/') ? [] : [...partesBase];
  for (const trozo of limpia.replace(/^\//, '').split('/')) {
    if (trozo === '' || trozo === '.') continue;
    if (trozo === '..') {
      // Salirse de la raiz del EPUB no es una ruta valida, es un intento.
      if (partes.length === 0) return null;
      partes.pop();
      continue;
    }
    partes.push(trozo);
  }
  return partes.length === 0 ? null : partes.join('/');
}

// --- Lectura -----------------------------------------------------------------

function vacio(
  diagnostico: DiagnosticoEpub,
  detalle: string,
  avisos: string[] = [],
): ResultadoEpub {
  return {
    diagnostico,
    titulo: null,
    autor: null,
    idioma: null,
    fecha: null,
    capitulos: [],
    imagenes: [],
    detalle,
    avisos,
    herramienta: HERRAMIENTA_EPUB,
  };
}

/**
 * Lee un EPUB entero en memoria. Devuelve siempre un resultado: un fichero
 * roto da diagnostico 'invalido' con su motivo, nunca una excepcion que
 * tumbe la ingesta de una carpeta con cien libros.
 */
export function leerEpub(bytes: Buffer): ResultadoEpub {
  const avisos: string[] = [];

  let entradas: EntradaZip[];
  try {
    entradas = leerZip(bytes, LIMITES_EPUB);
  } catch (error) {
    const motivo = error instanceof ErrorZip ? error.message : 'no se pudo abrir el contenedor';
    return vacio('invalido', `no es un EPUB legible: ${motivo}`);
  }

  const porNombre = new Map(entradas.map((e) => [e.nombre, e.datos]));
  const texto = (ruta: string): string | null => porNombre.get(ruta)?.toString('utf8') ?? null;

  // 1. El mimetype. Su ausencia no impide leer, pero se anota.
  const mimetype = texto('mimetype')?.trim();
  if (mimetype === undefined) {
    avisos.push('el EPUB no declara su mimetype');
  } else if (mimetype !== MIMETYPE_EPUB) {
    avisos.push(`mimetype inesperado: ${mimetype.slice(0, 60)}`);
  }

  // 2. El contenedor dice donde esta el documento de paquete (OPF).
  const contenedor = texto(RUTA_CONTENEDOR);
  if (contenedor === null) {
    return vacio('invalido', `falta ${RUTA_CONTENEDOR}: sin el no se sabe por donde empezar`);
  }
  const rutaOpf = elementos(tokenizar(contenedor), 'rootfile')
    .map(({ token }) => atributo(token, 'full-path'))
    .find((ruta): ruta is string => ruta !== null && ruta.length > 0);
  if (rutaOpf === undefined) {
    return vacio('invalido', 'el contenedor no apunta a ningun documento de paquete');
  }

  const opf = texto(rutaOpf);
  if (opf === null) {
    return vacio('invalido', `el documento de paquete declarado (${rutaOpf}) no esta en el EPUB`);
  }
  const tokensOpf = tokenizar(opf);

  // 3. Metadatos. Lo que no venga se queda ausente (E1: nada inventado).
  const titulo = primerTexto(tokensOpf, 'dc:title') ?? primerTexto(tokensOpf, 'title');
  const autor = primerTexto(tokensOpf, 'dc:creator') ?? primerTexto(tokensOpf, 'creator');
  const idioma = primerTexto(tokensOpf, 'dc:language') ?? primerTexto(tokensOpf, 'language');
  const fecha = primerTexto(tokensOpf, 'dc:date') ?? primerTexto(tokensOpf, 'date');

  // 4. Manifiesto: id -> recurso.
  interface Recurso {
    href: string;
    ruta: string;
    mimetype: string;
    propiedades: string;
  }
  const manifiesto = new Map<string, Recurso>();
  for (const { token } of elementos(tokensOpf, 'item')) {
    const id = atributo(token, 'id');
    const href = atributo(token, 'href');
    if (id === null || href === null) continue;
    const ruta = resolverRutaEpub(rutaOpf, href);
    if (ruta === null) {
      avisos.push(`recurso con ruta no valida, ignorado: ${href.slice(0, 60)}`);
      continue;
    }
    manifiesto.set(id, {
      href,
      ruta,
      mimetype: atributo(token, 'media-type') ?? '',
      propiedades: atributo(token, 'properties') ?? '',
    });
  }

  // 5. Spine: el orden de lectura, que es lo que da localizadores estables.
  const orden = elementos(tokensOpf, 'itemref')
    .map(({ token }) => atributo(token, 'idref'))
    .filter((id): id is string => id !== null);
  if (orden.length === 0) {
    return vacio('invalido', 'el EPUB no declara orden de lectura (spine vacio)', avisos);
  }

  // 6. Indice: nav de EPUB 3 o NCX de EPUB 2. Solo para poner titulos.
  const titulos = leerIndice(manifiesto, porNombre, tokensOpf);

  // 7. Imagenes del manifiesto, para poder mostrarlas sin salir a la red.
  const imagenes: ImagenEpub[] = [];
  for (const recurso of manifiesto.values()) {
    if (!recurso.mimetype.startsWith('image/')) continue;
    const datos = porNombre.get(recurso.ruta);
    if (datos === undefined) continue;
    imagenes.push({ href: recurso.ruta, mimetype: recurso.mimetype, datos });
  }

  // 8. Capitulos, en el orden del spine.
  const capitulos: CapituloEpub[] = [];
  for (const idref of orden) {
    const recurso = manifiesto.get(idref);
    if (recurso === undefined) {
      avisos.push(`el orden de lectura cita un recurso que no existe: ${idref.slice(0, 60)}`);
      continue;
    }
    const crudo = texto(recurso.ruta);
    if (crudo === null) {
      avisos.push(`capitulo declarado y ausente: ${recurso.ruta.slice(0, 60)}`);
      continue;
    }
    // Las imagenes se reescriben ANTES de sanear: asi el saneador ve una
    // referencia interna y la conserva, en vez de una relativa que luego
    // nadie sabria resolver.
    const conImagenes = reescribirImagenes(crudo, recurso.ruta);
    const saneado = sanearHtml(conImagenes);
    const plano = aTextoPlano(saneado.html).trim();
    if (plano.length === 0 && !saneado.html.includes('<img')) continue;

    const numero = capitulos.length + 1;
    capitulos.push({
      localizador: `cap-${String(numero)}`,
      href: recurso.ruta,
      titulo: titulos.get(recurso.ruta) ?? null,
      html: saneado.html,
      texto: plano,
      orden: numero,
    });
  }

  if (capitulos.length === 0) {
    return {
      ...vacio('sin-texto', 'el EPUB no tiene ningun capitulo con contenido legible', avisos),
      titulo,
      autor,
      idioma,
      fecha,
      imagenes,
    };
  }

  return {
    diagnostico: 'con-texto',
    titulo,
    autor,
    idioma,
    fecha,
    capitulos,
    imagenes,
    detalle: avisos.length > 0 ? (avisos[0] ?? null) : null,
    avisos,
    herramienta: HERRAMIENTA_EPUB,
  };
}

/**
 * Sustituye el src de cada imagen por una referencia interna estable. El
 * valor final (el identificador del asset ya ingerido) lo pone quien
 * construye la edicion: aqui solo se deja la ruta dentro del EPUB, que es
 * lo unico que este modulo puede saber.
 */
function reescribirImagenes(xhtml: string, rutaCapitulo: string): string {
  return xhtml.replace(
    /(<(?:img|image)\b[^>]*?\b(?:src|xlink:href|href)\s*=\s*)("([^"]*)"|'([^']*)')/gi,
    (completo, prefijo: string, _comillas: string, dobles?: string, simples?: string) => {
      const valor = dobles ?? simples ?? '';
      const destino = resolverRutaEpub(rutaCapitulo, decodificarEntidades(valor));
      if (destino === null) return completo;
      return `${prefijo}"${PREFIJO_IMAGEN_EPUB}${encodeURI(destino)}"`;
    },
  );
}

/** Titulos por ruta de capitulo, del nav de EPUB 3 o del NCX de EPUB 2. */
function leerIndice(
  manifiesto: Map<string, { href: string; ruta: string; mimetype: string; propiedades: string }>,
  porNombre: Map<string, Buffer>,
  tokensOpf: Token[],
): Map<string, string> {
  const titulos = new Map<string, string>();

  const nav = [...manifiesto.values()].find((r) => r.propiedades.split(/\s+/).includes('nav'));
  if (nav !== undefined) {
    const contenido = porNombre.get(nav.ruta)?.toString('utf8');
    if (contenido !== undefined) {
      const tokens = tokenizar(contenido);
      for (const { token, indice } of elementos(tokens, 'a')) {
        const href = atributo(token, 'href');
        if (href === null) continue;
        const destino = resolverRutaEpub(nav.ruta, href);
        const texto = textoInterno(tokens, indice);
        if (destino !== null && texto.length > 0 && !titulos.has(destino)) {
          titulos.set(destino, texto);
        }
      }
      if (titulos.size > 0) return titulos;
    }
  }

  // EPUB 2: el NCX se declara en el atributo toc del spine.
  const idNcx = elementos(tokensOpf, 'spine')
    .map(({ token }) => atributo(token, 'toc'))
    .find((id): id is string => id !== null);
  const ncx =
    (idNcx !== undefined ? manifiesto.get(idNcx) : undefined) ??
    [...manifiesto.values()].find((r) => r.mimetype === 'application/x-dtbncx+xml');
  if (ncx === undefined) return titulos;

  const contenido = porNombre.get(ncx.ruta)?.toString('utf8');
  if (contenido === undefined) return titulos;
  const tokens = tokenizar(contenido);

  // En un NCX, <navPoint> agrupa un <navLabel><text> y un <content src>.
  const etiquetas = elementos(tokens, 'text').map(({ indice }) => ({
    indice,
    texto: textoInterno(tokens, indice),
  }));
  for (const { token, indice } of elementos(tokens, 'content')) {
    const src = atributo(token, 'src');
    if (src === null) continue;
    const destino = resolverRutaEpub(ncx.ruta, src);
    if (destino === null || titulos.has(destino)) continue;
    // La etiqueta de un navPoint va justo antes de su content.
    const previa = etiquetas.filter((e) => e.indice < indice).pop();
    if (previa !== undefined && previa.texto.length > 0) titulos.set(destino, previa.texto);
  }
  return titulos;
}
