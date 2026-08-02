// Saneado de HTML por lista blanca (plan §6.3, bloque 05 t.3-5).
// Estrategia: tokenizar y RECONSTRUIR solo lo permitido, nunca "quitar lo
// malo" de una cadena. Lo que no esta en la lista blanca no sobrevive.
// Es la defensa de construccion; en runtime ademas hay CSP estricta y
// bloqueo de red (defensa en profundidad, T05).

/** Elementos cuyo contenido entero se descarta, no solo la etiqueta. */
const ELEMENTOS_VENENOSOS = new Set([
  'script',
  'style',
  // La cabecera es metadata, no cuerpo: el texto de <title> no debe
  // aparecer en el derivado de lectura (el titulo se extrae aparte).
  'head',
  'title',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'option',
  'link',
  'meta',
  'base',
  'template',
  'noscript',
  'svg',
  'math',
  'audio',
  'video',
  'source',
  'track',
  'canvas',
  'portal',
]);

/** Etiquetas conservadas: estructura documental util (bloque 05 t.5). */
const ELEMENTOS_PERMITIDOS = new Set([
  'p',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'blockquote',
  'pre',
  'code',
  'em',
  'strong',
  'i',
  'b',
  'u',
  's',
  'sub',
  'sup',
  'small',
  'mark',
  'abbr',
  'cite',
  'q',
  'span',
  'div',
  'section',
  'article',
  'header',
  'footer',
  'main',
  'nav',
  'aside',
  'figure',
  'figcaption',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  'colgroup',
  'col',
  'a',
  'img',
  'time',
  'address',
]);

const VACIOS = new Set(['br', 'hr', 'img', 'col']);

/** Atributos permitidos por etiqueta; el resto se descarta en bloque. */
const ATRIBUTOS_PERMITIDOS: Record<string, Set<string>> = {
  '*': new Set(['id', 'title', 'lang', 'dir']),
  a: new Set(['href']),
  img: new Set(['src', 'alt', 'width', 'height']),
  td: new Set(['colspan', 'rowspan', 'headers']),
  th: new Set(['colspan', 'rowspan', 'scope', 'headers']),
  col: new Set(['span']),
  time: new Set(['datetime']),
  abbr: new Set(['title']),
  blockquote: new Set([]),
};

export interface ResultadoSaneado {
  html: string;
  /** Lo eliminado, para que la ficha pueda ser honesta sobre el derivado. */
  eliminados: {
    scripts: number;
    handlers: number;
    recursosRemotos: number;
    urlsPeligrosas: number;
    elementosNoPermitidos: number;
  };
}

export interface Token {
  tipo: 'texto' | 'apertura' | 'cierre' | 'comentario' | 'declaracion';
  nombre?: string;
  atributos?: [string, string][];
  texto?: string;
  autocerrado?: boolean;
}

/** Tokenizador HTML tolerante: nunca ejecuta ni evalua nada. */
export function tokenizar(html: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = html.length;

  while (i < n) {
    const menor = html.indexOf('<', i);
    if (menor === -1) {
      if (i < n) tokens.push({ tipo: 'texto', texto: html.slice(i) });
      break;
    }
    if (menor > i) tokens.push({ tipo: 'texto', texto: html.slice(i, menor) });

    if (html.startsWith('<!--', menor)) {
      const fin = html.indexOf('-->', menor + 4);
      const corte = fin === -1 ? n : fin + 3;
      tokens.push({ tipo: 'comentario' });
      i = corte;
      continue;
    }
    if (html.startsWith('<!', menor) || html.startsWith('<?', menor)) {
      const fin = html.indexOf('>', menor);
      tokens.push({ tipo: 'declaracion' });
      i = fin === -1 ? n : fin + 1;
      continue;
    }

    const esCierre = html[menor + 1] === '/';
    const inicioNombre = menor + (esCierre ? 2 : 1);
    let j = inicioNombre;
    while (j < n && /[a-zA-Z0-9:-]/.test(html[j] ?? '')) j++;
    const nombre = html.slice(inicioNombre, j).toLowerCase();

    if (nombre.length === 0) {
      // '<' suelto: es texto literal, no marcado.
      tokens.push({ tipo: 'texto', texto: '<' });
      i = menor + 1;
      continue;
    }

    // Avanzar hasta el '>' respetando comillas de atributos.
    let k = j;
    let comilla: string | null = null;
    while (k < n) {
      const c = html[k] ?? '';
      if (comilla !== null) {
        if (c === comilla) comilla = null;
      } else if (c === '"' || c === "'") {
        comilla = c;
      } else if (c === '>') {
        break;
      }
      k++;
    }
    const cuerpo = html.slice(j, k);
    const autocerrado = cuerpo.trimEnd().endsWith('/');

    if (esCierre) {
      tokens.push({ tipo: 'cierre', nombre });
    } else {
      tokens.push({
        tipo: 'apertura',
        nombre,
        atributos: parsearAtributos(cuerpo),
        autocerrado: autocerrado || VACIOS.has(nombre),
      });
    }
    i = k + 1;
  }
  return tokens;
}

function parsearAtributos(cuerpo: string): [string, string][] {
  const atributos: [string, string][] = [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cuerpo)) !== null) {
    const nombre = (m[1] ?? '').toLowerCase();
    if (nombre.length === 0) continue;
    const valor = m[2] ?? m[3] ?? m[4] ?? '';
    atributos.push([nombre, valor]);
  }
  return atributos;
}

function escaparTexto(texto: string): string {
  return texto
    .replace(/&(?![a-zA-Z]+;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escaparAtributo(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Normaliza para inspeccion de esquema: quita espacios de control y
 * decodifica entidades numericas que podrian ocultar "javascript:".
 */
function normalizarUrlParaInspeccion(url: string): string {
  return (
    url
      .replace(/&#x?([0-9a-fA-F]+);?/g, (_todo, codigo: string) => {
        const base = /^[0-9]+$/.test(codigo) ? 10 : 16;
        const punto = Number.parseInt(codigo, base);
        return Number.isFinite(punto) && punto > 0 && punto < 0x110000
          ? String.fromCodePoint(punto)
          : '';
      })
      // Espacios y controles: el navegador ignora tabuladores y saltos
      // dentro del esquema, asi que la inspeccion tambien debe ignorarlos.
      // Los caracteres de control son justo lo que hay que eliminar aqui:
      // "java<TAB>script:" es la trampa clasica que esta regla vigila.
      // eslint-disable-next-line no-control-regex
      .replace(/[\s\u0000-\u001F\u007F]/g, '')
      .toLowerCase()
  );
}

const ESQUEMAS_PELIGROSOS = ['javascript:', 'data:', 'vbscript:', 'file:', 'blob:', 'about:'];

type ClaseUrl = 'segura-relativa' | 'ancla' | 'interna' | 'remota' | 'peligrosa';

export function clasificarUrl(url: string): ClaseUrl {
  const limpia = normalizarUrlParaInspeccion(url);
  if (limpia.length === 0) return 'peligrosa';
  if (limpia.startsWith('#')) return 'ancla';
  for (const esquema of ESQUEMAS_PELIGROSOS) {
    if (limpia.startsWith(esquema)) return 'peligrosa';
  }
  // El protocolo propio lo sirve el proceso principal, que comprueba que la
  // ruta cae dentro de CONTENT. Es la unica via por la que un derivado puede
  // referenciar una imagen extraida de un EPUB.
  if (limpia.startsWith('vestigio:')) return 'interna';
  if (/^[a-z][a-z0-9+.-]*:/.test(limpia)) {
    // Cualquier otro esquema absoluto (http, https, ftp...) es remoto.
    return 'remota';
  }
  if (limpia.startsWith('//')) return 'remota';
  return 'segura-relativa';
}

/**
 * Sanea un documento HTML dejando solo estructura documental segura.
 * `hrefRemotos`: los enlaces remotos se conservan como texto con su URL
 * visible (no navegables) para no perder la cita; nunca como enlace vivo.
 */
export function sanearHtml(html: string): ResultadoSaneado {
  const tokens = tokenizar(html);
  const salida: string[] = [];
  const pila: string[] = [];
  const eliminados: ResultadoSaneado['eliminados'] = {
    scripts: 0,
    handlers: 0,
    recursosRemotos: 0,
    urlsPeligrosas: 0,
    elementosNoPermitidos: 0,
  };

  let profundidadVeneno = 0;
  let nombreVeneno: string | null = null;

  for (const token of tokens) {
    // Dentro de un elemento venenoso: todo se descarta hasta su cierre.
    if (profundidadVeneno > 0) {
      if (
        token.tipo === 'apertura' &&
        token.nombre === nombreVeneno &&
        token.autocerrado !== true
      ) {
        profundidadVeneno++;
      } else if (token.tipo === 'cierre' && token.nombre === nombreVeneno) {
        profundidadVeneno--;
        if (profundidadVeneno === 0) nombreVeneno = null;
      }
      continue;
    }

    switch (token.tipo) {
      case 'texto':
        salida.push(escaparTexto(token.texto ?? ''));
        break;

      case 'comentario':
      case 'declaracion':
        break; // se descartan siempre

      case 'apertura': {
        const nombre = token.nombre ?? '';
        if (ELEMENTOS_VENENOSOS.has(nombre)) {
          if (nombre === 'script') eliminados.scripts++;
          else eliminados.elementosNoPermitidos++;
          if (token.autocerrado !== true) {
            profundidadVeneno = 1;
            nombreVeneno = nombre;
          }
          break;
        }
        if (!ELEMENTOS_PERMITIDOS.has(nombre)) {
          // Etiqueta desconocida: se descarta la etiqueta pero se conserva
          // su contenido (puede ser texto util de un HTML antiguo).
          eliminados.elementosNoPermitidos++;
          break;
        }

        const permitidosEtiqueta = ATRIBUTOS_PERMITIDOS[nombre] ?? new Set<string>();
        const permitidosGlobal = ATRIBUTOS_PERMITIDOS['*'] ?? new Set<string>();
        const atributosSalida: string[] = [];

        for (const [attr, valor] of token.atributos ?? []) {
          if (attr.startsWith('on')) {
            eliminados.handlers++;
            continue;
          }
          if (attr === 'style') continue; // sin CSS embebido: url() y expresiones
          if (!permitidosEtiqueta.has(attr) && !permitidosGlobal.has(attr)) continue;

          if (attr === 'href' || attr === 'src') {
            const clase = clasificarUrl(valor);
            if (clase === 'peligrosa') {
              eliminados.urlsPeligrosas++;
              continue;
            }
            if (clase === 'remota') {
              // Cero red en el lector: un recurso remoto no se referencia.
              eliminados.recursosRemotos++;
              continue;
            }
          }
          atributosSalida.push(`${attr}="${escaparAtributo(valor)}"`);
        }

        const abierta = `<${nombre}${atributosSalida.length > 0 ? ' ' + atributosSalida.join(' ') : ''}>`;
        if (token.autocerrado === true || VACIOS.has(nombre)) {
          salida.push(nombre === 'img' ? abierta : abierta);
        } else {
          salida.push(abierta);
          pila.push(nombre);
        }
        break;
      }

      case 'cierre': {
        const nombre = token.nombre ?? '';
        if (!ELEMENTOS_PERMITIDOS.has(nombre) || VACIOS.has(nombre)) break;
        const indice = pila.lastIndexOf(nombre);
        if (indice === -1) break; // cierre huerfano
        // Cierra tambien lo que quedo abierto por dentro (HTML mal formado).
        while (pila.length > indice) {
          const abierto = pila.pop();
          if (abierto !== undefined) salida.push(`</${abierto}>`);
        }
        break;
      }
    }
  }

  while (pila.length > 0) {
    const abierto = pila.pop();
    if (abierto !== undefined) salida.push(`</${abierto}>`);
  }

  return { html: salida.join('').trim(), eliminados };
}
