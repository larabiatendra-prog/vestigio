// Metadatos honestos automaticos (ENMIENDAS E1): lo que se puede extraer se
// extrae; lo que no, se declara ausente. Nada de campos manuales obligatorios.

import { createHash } from 'node:crypto';
import { basename, extname } from 'node:path';

export type FormatoDetectado = 'pdf' | 'epub' | 'html' | 'markdown' | 'txt' | 'imagen' | null;

/**
 * Deteccion por firma binaria primero, extension como senal secundaria
 * (plan bloque 04, tarea 6).
 */
export function detectarFormato(ruta: string, contenido: Buffer): FormatoDetectado {
  const ext = extname(ruta).toLowerCase();

  if (contenido.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (contenido[0] === 0x50 && contenido[1] === 0x4b) {
    // Contenedor ZIP: EPUB si lo dice el mimetype interno o la extension.
    if (contenido.subarray(0, 100).toString('latin1').includes('mimetypeapplication/epub')) {
      return 'epub';
    }
    return ext === '.epub' ? 'epub' : null;
  }
  if (
    (contenido[0] === 0x89 && contenido[1] === 0x50) || // PNG
    (contenido[0] === 0xff && contenido[1] === 0xd8) || // JPEG
    contenido.subarray(0, 6).toString('latin1') === 'GIF87a' ||
    contenido.subarray(0, 6).toString('latin1') === 'GIF89a'
  ) {
    return 'imagen';
  }

  const inicio = contenido.subarray(0, 512).toString('utf8').trimStart().toLowerCase();
  if (inicio.startsWith('<!doctype html') || inicio.startsWith('<html')) return 'html';

  if (ext === '.md' || ext === '.markdown') return 'markdown';
  if (ext === '.txt') return 'txt';
  if (ext === '.html' || ext === '.htm') return 'html';
  return null;
}

/** Titulo: del contenido si es posible; si no, del nombre de fichero. */
export function extraerTitulo(
  formato: FormatoDetectado,
  contenido: Buffer,
  ruta: string,
): { titulo: string; origen: 'contenido' | 'nombre-fichero' } {
  const texto = contenido.subarray(0, 64 * 1024).toString('utf8');

  if (formato === 'html') {
    const m = /<title[^>]*>([^<]{1,300})<\/title>/i.exec(texto);
    if (m?.[1] !== undefined && m[1].trim().length > 0) {
      return { titulo: limpiarEspacios(decodificarEntidades(m[1])), origen: 'contenido' };
    }
    const h1 = /<h1[^>]*>([^<]{1,300})<\/h1>/i.exec(texto);
    if (h1?.[1] !== undefined && h1[1].trim().length > 0) {
      return { titulo: limpiarEspacios(decodificarEntidades(h1[1])), origen: 'contenido' };
    }
  }
  if (formato === 'markdown') {
    const m = /^#\s+(.{1,300})$/m.exec(texto);
    if (m?.[1] !== undefined) return { titulo: limpiarEspacios(m[1]), origen: 'contenido' };
  }

  const nombre = basename(ruta, extname(ruta)).replace(/[-_]+/g, ' ').trim();
  return { titulo: nombre.length > 0 ? nombre : basename(ruta), origen: 'nombre-fichero' };
}

const PALABRAS_ES = new Set(
  'el la los las un una de del que y en es por con para no se su al como mas pero sus le ya o si porque cuando muy sin sobre tambien hasta donde quien desde todo esta entre'.split(
    ' ',
  ),
);
const PALABRAS_EN = new Set(
  'the of and to in is that it for on with as was at by an be this have from or had not are but they you which one all were her his'.split(
    ' ',
  ),
);

/** Heuristica ligera y honesta: es | en | und (desconocido). */
export function detectarIdioma(texto: string): 'es' | 'en' | 'und' {
  const palabras = texto
    .toLowerCase()
    .replace(/[^a-záéíóúüñ\s]/g, ' ')
    .split(/\s+/)
    .slice(0, 500);
  let es = 0;
  let en = 0;
  for (const palabra of palabras) {
    if (PALABRAS_ES.has(palabra)) es++;
    if (PALABRAS_EN.has(palabra)) en++;
  }
  if (es === 0 && en === 0) return 'und';
  if (es >= en * 1.5) return 'es';
  if (en >= es * 1.5) return 'en';
  return 'und';
}

/**
 * UUID estable derivado del contenido (sha256): el mismo fichero produce el
 * mismo UUID en cada reconstruccion, y los datos personales anclados a el
 * sobreviven a reindexados (REQ-D03). Formato UUID v8 (contenido propio).
 */
export function uuidDesdeSha256(sha256hex: string): string {
  const bytes = Buffer.from(sha256hex.slice(0, 32), 'hex');
  const b6 = bytes[6] ?? 0;
  const b8 = bytes[8] ?? 0;
  bytes[6] = (b6 & 0x0f) | 0x80; // version 8
  bytes[8] = (b8 & 0x3f) | 0x80; // variante RFC
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function sha256De(contenido: Buffer): string {
  return createHash('sha256').update(contenido).digest('hex');
}

export function generarSlug(titulo: string, uuid: string): string {
  const base = titulo
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const sufijo = uuid.slice(0, 8);
  return base.length > 0 ? `${base}-${sufijo}` : sufijo;
}

function limpiarEspacios(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

function decodificarEntidades(texto: string): string {
  return texto
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ntilde;/g, 'ñ')
    .replace(/&aacute;/g, 'á')
    .replace(/&eacute;/g, 'é')
    .replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó')
    .replace(/&uacute;/g, 'ú');
}
