// Sugerencias de errata (plan §9.2, bloque 09 t.5).
//
// Regla inviolable: NUNCA se sustituye la consulta en silencio. Se
// devuelve una sugerencia visible ("¿Quisiste decir...?") que el usuario
// acepta o ignora. En medicina, quimica, electricidad, radio o especies,
// corregir por tu cuenta puede hacer dano.
//
// Ademas solo se sugiere sobre vocabulario REAL del corpus: nada de
// diccionarios generales que propongan palabras que no estan indexadas.

import { normalizarTolerante } from './normalizar.js';

const DISTANCIA_MAXIMA = 2;
const LONGITUD_MINIMA = 4;

/** Distancia de edicion acotada: si supera el limite, corta y devuelve el limite+1. */
export function distanciaEdicion(a: string, b: string, limite = DISTANCIA_MAXIMA): number {
  if (Math.abs(a.length - b.length) > limite) return limite + 1;
  let anterior = Array.from({ length: b.length + 1 }, (_v, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i, ...Array.from({ length: b.length }, () => 0)];
    let mejorFila = i;
    for (let j = 1; j <= b.length; j++) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1;
      const valor = Math.min(
        (actual[j - 1] ?? 0) + 1,
        (anterior[j] ?? 0) + 1,
        (anterior[j - 1] ?? 0) + coste,
      );
      actual[j] = valor;
      if (valor < mejorFila) mejorFila = valor;
    }
    if (mejorFila > limite) return limite + 1;
    anterior = actual;
  }
  return anterior[b.length] ?? limite + 1;
}

export interface SugerenciaErrata {
  escrito: string;
  sugerido: string;
  distancia: number;
}

/**
 * Propone correcciones para los terminos que no aparecen en el vocabulario
 * del corpus. Devuelve como mucho una sugerencia por termino y solo si es
 * claramente mejor que las alternativas.
 */
export function sugerirErratas(terminos: string[], vocabulario: string[]): SugerenciaErrata[] {
  const vocabularioNormalizado = vocabulario.map((v) => normalizarTolerante(v));
  const conjunto = new Set(vocabularioNormalizado);
  const sugerencias: SugerenciaErrata[] = [];

  for (const termino of terminos) {
    const normalizado = normalizarTolerante(termino);
    if (normalizado.length < LONGITUD_MINIMA) continue;
    if (conjunto.has(normalizado)) continue; // existe: no hay nada que sugerir
    if (/\d/.test(normalizado)) continue; // cifras: jamas se corrigen

    let mejor: { palabra: string; distancia: number } | null = null;
    let empate = false;

    for (const candidato of vocabularioNormalizado) {
      if (Math.abs(candidato.length - normalizado.length) > DISTANCIA_MAXIMA) continue;
      const distancia = distanciaEdicion(normalizado, candidato);
      if (distancia > DISTANCIA_MAXIMA) continue;
      if (mejor === null || distancia < mejor.distancia) {
        mejor = { palabra: candidato, distancia };
        empate = false;
      } else if (distancia === mejor.distancia && candidato !== mejor.palabra) {
        empate = true;
      }
    }

    // Con empate no se sugiere: proponer una de dos igual de probables es
    // adivinar, y adivinar en temas de riesgo es lo que hay que evitar.
    if (mejor !== null && !empate) {
      sugerencias.push({ escrito: termino, sugerido: mejor.palabra, distancia: mejor.distancia });
    }
  }

  return sugerencias;
}
