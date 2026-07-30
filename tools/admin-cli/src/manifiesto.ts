// Manifiesto SHA-256 canonico de una edicion: detecta cualquier alteracion
// de un byte (T03). La firma del manifiesto llega en los bloques 16/20.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export interface Manifiesto {
  generado: string;
  totalArchivos: number;
  totalBytes: number;
  archivos: Record<string, { sha256: string; bytes: number }>;
}

const NOMBRE_MANIFIESTO = 'manifiesto.json';

function listarArchivos(dir: string): string[] {
  const resultado: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entrada.isFile()) continue;
    resultado.push(join(entrada.parentPath, entrada.name));
  }
  return resultado.sort();
}

function rutaCanonica(raiz: string, ruta: string): string {
  return relative(raiz, ruta).split(sep).join('/');
}

/**
 * Genera el manifiesto de una edicion. Cubre exclusivamente CONTENT (el
 * payload inmutable): USER_DATA, BACKUPS, LOGS y RUNTIME son mutables y
 * quedan fuera por diseno (plan §7); sus garantias son el backup personal.
 */
export function generarManifiesto(dirEdicion: string): Manifiesto {
  const archivos: Manifiesto['archivos'] = {};
  let totalBytes = 0;
  for (const ruta of listarArchivos(join(dirEdicion, 'CONTENT'))) {
    const rel = rutaCanonica(dirEdicion, ruta);
    if (rel === `CONTENT/manifest/${NOMBRE_MANIFIESTO}`) continue;
    const contenido = readFileSync(ruta);
    archivos[rel] = {
      sha256: createHash('sha256').update(contenido).digest('hex'),
      bytes: contenido.length,
    };
    totalBytes += contenido.length;
  }
  const manifiesto: Manifiesto = {
    generado: new Date().toISOString(),
    totalArchivos: Object.keys(archivos).length,
    totalBytes,
    archivos,
  };
  return manifiesto;
}

export function escribirManifiesto(dirEdicion: string, manifiesto: Manifiesto): string {
  const ruta = join(dirEdicion, 'CONTENT', 'manifest', NOMBRE_MANIFIESTO);
  writeFileSync(ruta, `${JSON.stringify(manifiesto, null, 2)}\n`);
  return ruta;
}

export interface ProblemaVerificacion {
  archivo: string;
  problema: 'alterado' | 'ausente' | 'no-manifestado';
}

/** Verifica una edicion contra su manifiesto. */
export function verificarManifiesto(dirEdicion: string): ProblemaVerificacion[] {
  const rutaManifiesto = join(dirEdicion, 'CONTENT', 'manifest', NOMBRE_MANIFIESTO);
  const manifiesto = JSON.parse(readFileSync(rutaManifiesto, 'utf8')) as Manifiesto;
  const problemas: ProblemaVerificacion[] = [];

  const presentes = new Set<string>();
  for (const ruta of listarArchivos(join(dirEdicion, 'CONTENT'))) {
    const rel = rutaCanonica(dirEdicion, ruta);
    if (rel === `CONTENT/manifest/${NOMBRE_MANIFIESTO}`) continue;
    presentes.add(rel);
    const esperado = manifiesto.archivos[rel];
    if (esperado === undefined) {
      problemas.push({ archivo: rel, problema: 'no-manifestado' });
      continue;
    }
    const contenido = readFileSync(ruta);
    const sha = createHash('sha256').update(contenido).digest('hex');
    if (sha !== esperado.sha256 || contenido.length !== esperado.bytes) {
      problemas.push({ archivo: rel, problema: 'alterado' });
    }
  }
  for (const rel of Object.keys(manifiesto.archivos)) {
    if (!presentes.has(rel)) problemas.push({ archivo: rel, problema: 'ausente' });
  }

  const orden = { alterado: 0, ausente: 1, 'no-manifestado': 2 };
  return problemas.sort((a, b) => orden[a.problema] - orden[b.problema]);
}

function statSeguro(ruta: string): number {
  try {
    return statSync(ruta).size;
  } catch {
    return 0;
  }
}

export const _interno = { listarArchivos, rutaCanonica, statSeguro };
