// Vocabulario compartido de la interfaz: como se dicen en castellano llano
// los valores tecnicos del catalogo. Vive en un solo sitio para que la misma
// cosa se llame igual en la biblioteca, en la ficha y en el lector.

export const ETIQUETAS_ESTADO_TEXTO: Record<string, string> = {
  'texto-completo': 'texto completo',
  'texto-por-pagina': 'texto por página',
  'texto-parcial': 'texto parcial',
  'sin-texto-escaneado': 'escaneado, sin texto',
  cifrado: 'cifrado',
  ilegible: 'ilegible',
  'sin-texto': 'sin texto',
  desconocido: 'sin analizar',
};

/** Explicacion honesta de lo que se puede y no se puede hacer con el texto. */
export const DETALLE_ESTADO_TEXTO: Record<string, string> = {
  'texto-completo': 'Se ha podido extraer todo el texto: se busca y se lee entero.',
  'texto-por-pagina': 'El texto se extrajo página a página: buscar te lleva a la página exacta.',
  'texto-parcial': 'Solo se pudo extraer parte del texto. Lo que no aparece, no se busca.',
  'sin-texto-escaneado':
    'Son imágenes de páginas, no texto. No se puede buscar dentro hasta que exista reconocimiento de caracteres.',
  cifrado: 'El documento está protegido: se conserva tal cual, pero no se puede leer su texto.',
  ilegible: 'El fichero no se pudo procesar. El original se conserva intacto por si sirve.',
  'sin-texto': 'Este documento no tiene texto que extraer.',
  desconocido: 'Todavía no se ha analizado.',
};

export const ETIQUETAS_FORMATO: Record<string, string> = {
  pdf: 'PDF',
  epub: 'EPUB',
  html: 'página web',
  markdown: 'nota',
  txt: 'texto',
  imagen: 'imagen',
  audio: 'audio',
  zim: 'colección',
};

export const ETIQUETAS_IDIOMA: Record<string, string> = {
  es: 'español',
  en: 'inglés',
  ca: 'valenciano',
  fr: 'francés',
  de: 'alemán',
  pt: 'portugués',
  it: 'italiano',
  und: 'sin determinar',
};

export const ETIQUETAS_DERECHOS: Record<string, string> = {
  'open-redistributable': 'se puede redistribuir',
  'personal-preservation': 'conservación personal',
  'unknown-blocked': 'derechos sin aclarar',
};

export const EXPLICACION_DERECHOS: Record<string, string> = {
  'open-redistributable':
    'La licencia permite compartirlo. Aun así, Vestigio no publica nada por su cuenta.',
  'personal-preservation':
    'Se conserva para uso propio. Es lo que Vestigio supone cuando nadie ha dicho lo contrario: nunca se comparte sin una decisión explícita.',
  'unknown-blocked': 'No se sabe qué permite la licencia, así que se trata con la máxima cautela.',
};

export function etiquetaFormato(formato: string): string {
  return ETIQUETAS_FORMATO[formato] ?? formato;
}

export function etiquetaIdioma(idioma: string): string {
  return ETIQUETAS_IDIOMA[idioma] ?? idioma;
}

export function etiquetaEstadoTexto(estado: string): string {
  return ETIQUETAS_ESTADO_TEXTO[estado] ?? estado;
}

/** Estados en los que conviene avisar antes de que Daniel abra y se lleve un chasco. */
export function estadoPreocupante(estado: string): boolean {
  return estado === 'sin-texto-escaneado' || estado === 'cifrado' || estado === 'ilegible';
}

export function tamanoLegible(bytes: number | null): string {
  if (bytes === null) return 'tamaño sin determinar';
  if (bytes < 1024) return `${String(bytes)} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Fecha ISO a algo que se lee: "31 de julio de 2026". */
export function fechaLegible(iso: string | null): string | null {
  if (iso === null || iso.length === 0) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(fecha);
}

export function fechaYHoraLegible(iso: string | null): string | null {
  if (iso === null || iso.length === 0) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(fecha);
}
