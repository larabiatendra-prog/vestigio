// Segmentacion estructural con localizadores estables (bloque 05 t.6-7).
// Un localizador identifica una seccion de forma reproducible: la busqueda
// abre exactamente ahi. Se derivan de los encabezados; si no hay, se usan
// bloques ordinales. Reconstruir el catalogo no cambia los localizadores.

export interface SegmentoEstructural {
  /** Estable entre reconstrucciones: 'sec-1', 'sec-2-1'... o 'bloque-N'. */
  localizador: string;
  titulo: string | null;
  /** Nivel de encabezado (1-6) o null si es texto sin encabezado. */
  nivel: number | null;
  /** Texto plano para el indice de busqueda. */
  cuerpo: string;
  /** HTML saneado de la seccion, para el lector. */
  html: string;
}

const LIMITE_CUERPO = 20000;

/** Texto plano de un fragmento HTML ya saneado. */
export function aTextoPlano(html: string): string {
  return html
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|pre|section|article)>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((linea) => linea.trim())
    .join('\n')
    .trim()
    .normalize('NFC');
}

interface Encabezado {
  indice: number;
  fin: number;
  nivel: number;
  texto: string;
}

function localizarEncabezados(html: string): Encabezado[] {
  const encabezados: Encabezado[] = [];
  const re = /<h([1-6])(?:\s[^>]*)?>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    encabezados.push({
      indice: m.index,
      fin: m.index + m[0].length,
      nivel: Number(m[1]),
      texto: aTextoPlano(m[2] ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
    });
  }
  return encabezados;
}

/**
 * Construye localizadores jerarquicos estables a partir de los niveles de
 * encabezado: h2, h3, h3, h2 -> sec-1, sec-1-1, sec-1-2, sec-2.
 */
function localizadoresJerarquicos(niveles: number[]): string[] {
  const resultado: string[] = [];
  const pila: { nivel: number; contador: number }[] = [];

  for (const nivel of niveles) {
    // Cierra los niveles mas profundos que el actual.
    while (pila.length > 0 && (pila[pila.length - 1]?.nivel ?? 0) > nivel) pila.pop();

    const cima = pila[pila.length - 1];
    if (cima !== undefined && cima.nivel === nivel) {
      cima.contador++;
    } else {
      pila.push({ nivel, contador: 1 });
    }
    resultado.push(`sec-${pila.map((e) => String(e.contador)).join('-')}`);
  }
  return resultado;
}

/** Trocea texto largo sin encabezados en bloques manejables. */
function trocearTexto(texto: string, prefijo: string): SegmentoEstructural[] {
  const parrafos = texto
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const segmentos: SegmentoEstructural[] = [];
  let actual = '';
  const empujar = (): void => {
    if (actual.trim().length === 0) return;
    segmentos.push({
      localizador: `${prefijo}-${String(segmentos.length + 1)}`,
      titulo: null,
      nivel: null,
      cuerpo: actual.trim().slice(0, LIMITE_CUERPO),
      html: actual
        .trim()
        .split(/\n+/)
        .map((linea) => `<p>${linea.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`)
        .join(''),
    });
    actual = '';
  };
  for (const parrafo of parrafos) {
    if (actual.length > 0 && actual.length + parrafo.length > 1800) empujar();
    actual = actual.length === 0 ? parrafo : `${actual}\n\n${parrafo}`;
  }
  empujar();
  return segmentos;
}

/**
 * Segmenta HTML saneado por encabezados. Si no hay encabezados, trocea por
 * parrafos con localizadores ordinales.
 */
export function segmentarHtml(htmlSaneado: string): SegmentoEstructural[] {
  const encabezados = localizarEncabezados(htmlSaneado);

  if (encabezados.length === 0) {
    const texto = aTextoPlano(htmlSaneado);
    if (texto.length === 0) return [];
    return trocearTexto(texto, 'bloque');
  }

  const localizadores = localizadoresJerarquicos(encabezados.map((e) => e.nivel));
  const segmentos: SegmentoEstructural[] = [];

  // Preambulo antes del primer encabezado.
  const preambulo = htmlSaneado.slice(0, encabezados[0]?.indice ?? 0);
  const textoPreambulo = aTextoPlano(preambulo);
  if (textoPreambulo.length > 0) {
    segmentos.push({
      localizador: 'preambulo',
      titulo: null,
      nivel: null,
      cuerpo: textoPreambulo.slice(0, LIMITE_CUERPO),
      html: preambulo,
    });
  }

  for (const [i, encabezado] of encabezados.entries()) {
    const siguiente = encabezados[i + 1];
    const htmlSeccion = htmlSaneado.slice(
      encabezado.indice,
      siguiente?.indice ?? htmlSaneado.length,
    );
    const cuerpo = aTextoPlano(htmlSeccion);
    segmentos.push({
      localizador: localizadores[i] ?? `sec-${String(i + 1)}`,
      titulo: encabezado.texto.length > 0 ? encabezado.texto : null,
      nivel: encabezado.nivel,
      cuerpo: cuerpo.slice(0, LIMITE_CUERPO),
      html: htmlSeccion,
    });
  }

  return segmentos.filter((s) => s.cuerpo.length > 0 || s.titulo !== null);
}

/** Segmenta texto plano (TXT) en bloques con localizador estable. */
export function segmentarTexto(texto: string): SegmentoEstructural[] {
  return trocearTexto(texto.normalize('NFC').replace(/\r\n/g, '\n'), 'bloque');
}
