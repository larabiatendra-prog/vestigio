// Fusion determinista de listas de resultados (plan §9.4, bloque 09 t.7).
//
// Reciprocal Rank Fusion: cada lista aporta 1/(k + posicion). Es
// determinista, no necesita que las puntuaciones de los dos motores sean
// comparables (no lo son) y no deja que un backend enorme ahogue al otro.
//
// Lo que NO hace, por diseno: mezclar autoridad o consenso en la
// puntuacion. Esos ejes se muestran y se filtran, nunca actuan como
// "verdad oculta" que reordena sin que se vea (plan §9.4.6).

/** Constante clasica de RRF: amortigua las primeras posiciones. */
export const K_RRF = 60;

export type OrigenResultado = 'catalogo' | 'zim';

/** Por que aparecio un resultado; se muestra al usuario. */
export type MotivoCoincidencia = 'exacta' | 'sin-tilde' | 'alias' | 'aproximada';

export interface Fusionable {
  /** Clave de deduplicacion: mismo documento y mismo punto de apertura. */
  clave: string;
  origen: OrigenResultado;
  motivo: MotivoCoincidencia;
}

export interface ListaFusionable<T extends Fusionable> {
  resultados: T[];
  /** Peso de la lista; la coincidencia exacta pesa mas que la tolerante. */
  peso: number;
}

export interface Fusionado<T extends Fusionable> {
  elemento: T;
  puntuacion: number;
  /** Motivo mas fuerte con el que aparecio (exacta gana a aproximada). */
  motivo: MotivoCoincidencia;
}

const FUERZA_MOTIVO: Record<MotivoCoincidencia, number> = {
  exacta: 4,
  'sin-tilde': 3,
  alias: 2,
  aproximada: 1,
};

/**
 * Fusiona listas con RRF. Deduplica por `clave` sumando las aportaciones
 * (aparecer en varias listas refuerza), y conserva el motivo mas fuerte.
 * El desempate es alfabetico por clave: dos ejecuciones iguales dan
 * exactamente el mismo orden.
 */
export function fusionarRrf<T extends Fusionable>(listas: ListaFusionable<T>[]): Fusionado<T>[] {
  const acumulado = new Map<string, Fusionado<T>>();

  for (const lista of listas) {
    for (const [indice, elemento] of lista.resultados.entries()) {
      const aporte = (lista.peso * 1) / (K_RRF + indice + 1);
      const previo = acumulado.get(elemento.clave);
      if (previo === undefined) {
        acumulado.set(elemento.clave, {
          elemento,
          puntuacion: aporte,
          motivo: elemento.motivo,
        });
      } else {
        previo.puntuacion += aporte;
        if (FUERZA_MOTIVO[elemento.motivo] > FUERZA_MOTIVO[previo.motivo]) {
          previo.motivo = elemento.motivo;
          previo.elemento = elemento;
        }
      }
    }
  }

  return [...acumulado.values()].sort((a, b) => {
    if (b.puntuacion !== a.puntuacion) return b.puntuacion - a.puntuacion;
    const fuerza = FUERZA_MOTIVO[b.motivo] - FUERZA_MOTIVO[a.motivo];
    if (fuerza !== 0) return fuerza;
    return a.elemento.clave.localeCompare(b.elemento.clave);
  });
}

/**
 * Limita cuantos resultados aporta cada origen ANTES de fusionar, para que
 * una coleccion ZIM enorme no desplace sistematicamente a los documentos
 * catalogados (criterio de salida del bloque 09).
 */
export function limitarPorOrigen<T extends Fusionable>(
  resultados: T[],
  limites: Record<OrigenResultado, number>,
): T[] {
  const cuenta: Record<OrigenResultado, number> = { catalogo: 0, zim: 0 };
  const salida: T[] = [];
  for (const resultado of resultados) {
    if (cuenta[resultado.origen] >= limites[resultado.origen]) continue;
    cuenta[resultado.origen]++;
    salida.push(resultado);
  }
  return salida;
}
