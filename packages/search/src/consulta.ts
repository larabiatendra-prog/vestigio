// Analisis de la consulta del usuario (plan §9.2, bloque 09 t.1).
//
// Dos modos:
//  - SIMPLE: todo lo que escribe el usuario son palabras. No hay sintaxis
//    magica: escribir "no" o "-" busca esas palabras, no operadores. Es lo
//    que espera alguien que no programa.
//  - AVANZADO: frases entre comillas, prefijos con *, exclusion con - y
//    alternativa con O/OR. Con limites de complejidad y errores que dicen
//    el punto exacto del problema.
//
// En los dos modos la consulta se ESCAPA antes de tocar FTS5: la sintaxis
// de SQLite nunca queda expuesta a lo que se teclea.

import { normalizarExacto, normalizarTolerante } from './normalizar.js';

export const MAX_LONGITUD_CONSULTA = 200;
export const MAX_TERMINOS = 16;

export interface TerminoConsulta {
  /** Texto tal como lo escribio el usuario, en NFC. */
  texto: string;
  tipo: 'palabra' | 'frase' | 'prefijo';
  /** true si va precedido de '-' en modo avanzado. */
  excluido: boolean;
}

export interface ConsultaAnalizada {
  modo: 'simple' | 'avanzado';
  terminos: TerminoConsulta[];
  /** Grupos de alternativas: [['rcp','reanimacion']] significa uno u otro. */
  vacia: boolean;
}

export interface ErrorConsulta {
  mensaje: string;
  /** Posicion (base 0) donde esta el problema, para senalarlo en pantalla. */
  posicion: number;
}

export type ResultadoAnalisis =
  { ok: true; consulta: ConsultaAnalizada } | { ok: false; error: ErrorConsulta };

/** Palabras que en modo avanzado significan alternativa. */
const ALTERNATIVA = new Set(['o', 'or']);

/**
 * Escapa un termino para FTS5: siempre entre comillas dobles, con las
 * comillas internas duplicadas. Asi ningun caracter se interpreta como
 * operador de SQLite.
 */
export function escaparTerminoFts(texto: string): string {
  return `"${texto.replace(/"/g, '""')}"`;
}

function limpiar(texto: string): string {
  return normalizarExacto(texto).slice(0, MAX_LONGITUD_CONSULTA).trim();
}

/** Modo simple: cada palabra es un termino literal. */
export function analizarSimple(entrada: string): ConsultaAnalizada {
  const palabras = limpiar(entrada)
    .split(/\s+/)
    .filter((p) => p.length > 0)
    .slice(0, MAX_TERMINOS);
  return {
    modo: 'simple',
    terminos: palabras.map((texto) => ({ texto, tipo: 'palabra', excluido: false })),
    vacia: palabras.length === 0,
  };
}

/**
 * Modo avanzado. Devuelve un error localizado en vez de adivinar: una
 * comilla sin cerrar es un fallo del usuario que merece explicacion, no
 * una busqueda silenciosamente distinta de la que pidio.
 */
export function analizarAvanzado(entrada: string): ResultadoAnalisis {
  const texto = limpiar(entrada);
  const terminos: TerminoConsulta[] = [];
  let i = 0;

  while (i < texto.length) {
    const c = texto[i] ?? '';
    if (/\s/.test(c)) {
      i++;
      continue;
    }

    let excluido = false;
    if (c === '-') {
      excluido = true;
      i++;
      if (i >= texto.length || /\s/.test(texto[i] ?? ' ')) {
        return {
          ok: false,
          error: { mensaje: 'falta la palabra que quieres excluir tras el guion', posicion: i - 1 },
        };
      }
    }

    if (texto[i] === '"') {
      const cierre = texto.indexOf('"', i + 1);
      if (cierre === -1) {
        return {
          ok: false,
          error: {
            mensaje: 'falta la comilla de cierre de la frase',
            posicion: i,
          },
        };
      }
      const frase = texto.slice(i + 1, cierre).trim();
      if (frase.length === 0) {
        return { ok: false, error: { mensaje: 'la frase entre comillas esta vacia', posicion: i } };
      }
      terminos.push({ texto: frase, tipo: 'frase', excluido });
      i = cierre + 1;
      continue;
    }

    let fin = i;
    while (fin < texto.length && !/[\s"]/.test(texto[fin] ?? '')) fin++;
    let palabra = texto.slice(i, fin);
    i = fin;

    if (ALTERNATIVA.has(palabra.toLowerCase()) && !excluido) {
      // 'o'/'OR' entre dos palabras: se trata como separador; el motor ya
      // devuelve documentos que contengan cualquiera de los terminos.
      continue;
    }

    let tipo: TerminoConsulta['tipo'] = 'palabra';
    if (palabra.endsWith('*')) {
      palabra = palabra.slice(0, -1);
      tipo = 'prefijo';
      if (palabra.length < 2) {
        return {
          ok: false,
          error: {
            mensaje: 'un prefijo necesita al menos dos letras antes del asterisco',
            posicion: i - 1,
          },
        };
      }
    }
    if (palabra.includes('*')) {
      return {
        ok: false,
        error: {
          mensaje: 'el asterisco solo puede ir al final de una palabra',
          posicion: i - palabra.length + palabra.indexOf('*'),
        },
      };
    }
    if (palabra.length === 0) continue;

    terminos.push({ texto: palabra, tipo, excluido });
    if (terminos.length > MAX_TERMINOS) {
      return {
        ok: false,
        error: {
          mensaje: `demasiados terminos: el maximo son ${String(MAX_TERMINOS)}`,
          posicion: i,
        },
      };
    }
  }

  if (terminos.every((t) => t.excluido) && terminos.length > 0) {
    return {
      ok: false,
      error: { mensaje: 'la consulta solo excluye: falta algo que buscar', posicion: 0 },
    };
  }

  return {
    ok: true,
    consulta: { modo: 'avanzado', terminos, vacia: terminos.length === 0 },
  };
}

/** Construye la expresion MATCH de FTS5 para el indice exacto. */
export function expresionFtsExacta(consulta: ConsultaAnalizada): string {
  return construirExpresion(consulta, (t) => normalizarExacto(t));
}

/** Construye la expresion MATCH para el indice tolerante. */
export function expresionFtsTolerante(consulta: ConsultaAnalizada): string {
  return construirExpresion(consulta, (t) => normalizarTolerante(t));
}

/**
 * Expresion que exige TODAS las palabras. Se usa como capa de mayor peso:
 * quien escribe "as de guia" espera primero el documento que contiene las
 * tres palabras, no el que solo comparte el "de". Solo tiene sentido con
 * mas de un termino.
 */
export function expresionFtsTodas(consulta: ConsultaAnalizada, tolerante: boolean): string {
  const incluidos = consulta.terminos.filter((t) => !t.excluido);
  if (incluidos.length < 2) return '';
  return construirExpresion(
    consulta,
    (t) => (tolerante ? normalizarTolerante(t) : normalizarExacto(t)),
    'AND',
  );
}

function construirExpresion(
  consulta: ConsultaAnalizada,
  transformar: (texto: string) => string,
  conector: 'OR' | 'AND' = 'OR',
): string {
  const incluidos: string[] = [];
  const excluidos: string[] = [];

  for (const termino of consulta.terminos) {
    const valor = transformar(termino.texto);
    if (valor.length === 0) continue;
    const pieza =
      termino.tipo === 'prefijo' ? `${escaparTerminoFts(valor)}*` : escaparTerminoFts(valor);
    if (termino.excluido) excluidos.push(pieza);
    else incluidos.push(pieza);
  }

  if (incluidos.length === 0) return '';
  const positivo = incluidos.join(` ${conector} `);
  return excluidos.length === 0 ? positivo : `(${positivo}) NOT (${excluidos.join(' OR ')})`;
}

/** Analiza segun el modo elegido por el usuario. */
export function analizar(entrada: string, avanzado: boolean): ResultadoAnalisis {
  if (avanzado) return analizarAvanzado(entrada);
  return { ok: true, consulta: analizarSimple(entrada) };
}
