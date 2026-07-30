// Extraccion de texto para el indice de busqueda. Solo formatos textuales:
// PDF y EPUB entran al catalogo sin texto hasta sus bloques (05-07), y la
// ficha lo declara (metadatos honestos, E1).

export interface SegmentoExtraido {
  localizador: string;
  titulo?: string;
  cuerpo: string;
}

const TAMANO_OBJETIVO = 1500;

export function extraerTexto(formato: string, contenido: Buffer): string | null {
  const texto = contenido.toString('utf8');
  switch (formato) {
    case 'txt':
      return texto;
    case 'markdown':
      return texto
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`([^`]*)`/g, '$1')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/[*_>~]/g, '');
    case 'html':
      return texto
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
    default:
      return null;
  }
}

/** Divide el texto en segmentos de tamano razonable por parrafos. */
export function segmentar(texto: string): SegmentoExtraido[] {
  const normalizado = texto.normalize('NFC').replace(/\r\n/g, '\n');
  const parrafos = normalizado
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0);

  const segmentos: SegmentoExtraido[] = [];
  let actual = '';
  for (const parrafo of parrafos) {
    if (actual.length > 0 && actual.length + parrafo.length > TAMANO_OBJETIVO) {
      segmentos.push({ localizador: `seccion-${String(segmentos.length + 1)}`, cuerpo: actual });
      actual = parrafo;
    } else {
      actual = actual.length === 0 ? parrafo : `${actual}\n${parrafo}`;
    }
  }
  if (actual.length > 0) {
    segmentos.push({ localizador: `seccion-${String(segmentos.length + 1)}`, cuerpo: actual });
  }
  return segmentos;
}
