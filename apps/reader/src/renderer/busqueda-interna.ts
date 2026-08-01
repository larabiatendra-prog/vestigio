// Buscar dentro del documento abierto (bloque 11, tarea 3).
//
// Usa la MISMA normalizacion que el buscador de la biblioteca: quita acentos
// vocalicos y conserva la ñ. Que "cañería" se comporte igual dentro y fuera
// del lector no es un detalle: es lo que evita que Daniel crea que el
// buscador esta roto.
//
// Logica pura y sin DOM a proposito, para poder probarla.

import { normalizarTolerante } from '@vestigio/search';
import type { SegmentoUI } from '../comun/estado';

export interface CoincidenciaInterna {
  localizador: string;
  pagina: number | null;
  tituloSeccion: string | null;
  /** Contexto con la parte encontrada marcada entre [[ ]]. */
  fragmento: string;
  /** Posicion dentro del cuerpo del segmento. */
  posicion: number;
}

const CONTEXTO = 60;
const MAX_COINCIDENCIAS = 300;

/**
 * Todas las apariciones del texto en el documento, en orden de lectura.
 *
 * La busqueda se hace sobre el cuerpo normalizado, que tiene la misma
 * longitud que el original (quitar una tilde no cambia el numero de
 * caracteres), asi que las posiciones sirven para recortar el texto real.
 */
export function buscarEnSegmentos(segmentos: SegmentoUI[], texto: string): CoincidenciaInterna[] {
  const aguja = normalizarTolerante(texto).trim();
  if (aguja.length === 0) return [];

  const coincidencias: CoincidenciaInterna[] = [];
  for (const segmento of segmentos) {
    const pajar = normalizarTolerante(segmento.cuerpo);
    // Si la normalizacion cambiase la longitud, recortar por posicion daria
    // fragmentos desplazados; en ese caso se marca el segmento entero.
    const alineado = pajar.length === segmento.cuerpo.length;
    let desde = 0;
    for (;;) {
      const posicion = pajar.indexOf(aguja, desde);
      if (posicion < 0) break;
      coincidencias.push({
        localizador: segmento.localizador,
        pagina: segmento.pagina,
        tituloSeccion: segmento.titulo,
        fragmento: alineado
          ? recortar(segmento.cuerpo, posicion, aguja.length)
          : segmento.cuerpo.slice(0, CONTEXTO * 2),
        posicion,
      });
      if (coincidencias.length >= MAX_COINCIDENCIAS) return coincidencias;
      desde = posicion + aguja.length;
    }
  }
  return coincidencias;
}

function recortar(cuerpo: string, posicion: number, largo: number): string {
  const inicio = Math.max(0, posicion - CONTEXTO);
  const fin = Math.min(cuerpo.length, posicion + largo + CONTEXTO);
  const antes = cuerpo.slice(inicio, posicion);
  const medio = cuerpo.slice(posicion, posicion + largo);
  const despues = cuerpo.slice(posicion + largo, fin);
  return `${inicio > 0 ? '…' : ''}${antes}[[${medio}]]${despues}${fin < cuerpo.length ? '…' : ''}`;
}

/**
 * Resuelve a que segmento lleva un localizador que puede ya no existir
 * (edicion reconstruida, documento reingerido con otra estructura).
 *
 * Primero se intenta el localizador exacto; si no esta, se busca por el
 * texto de referencia que se guardo junto al progreso. Nunca se elige un
 * sitio al azar: si no hay forma honesta de recolocar, se dice.
 */
export interface Recolocacion {
  localizador: string | null;
  /** Como se llego hasta ahi, para poder contarlo. */
  via: 'exacto' | 'por-texto' | 'perdido' | 'sin-destino';
}

export function recolocar(
  segmentos: SegmentoUI[],
  localizador: string | null,
  fallbackTexto: string | null,
): Recolocacion {
  if (localizador === null || localizador.length === 0) {
    return { localizador: null, via: 'sin-destino' };
  }
  if (segmentos.some((s) => s.localizador === localizador)) {
    return { localizador, via: 'exacto' };
  }
  if (fallbackTexto !== null && fallbackTexto.trim().length > 0) {
    const encontradas = buscarEnSegmentos(segmentos, fallbackTexto.slice(0, 120));
    const primera = encontradas[0];
    if (primera !== undefined) return { localizador: primera.localizador, via: 'por-texto' };
  }
  return { localizador: null, via: 'perdido' };
}
