// Recuadro donde se coloca la vista nativa del visor ZIM.
//
// Los numeros llegan del renderer, asi que se validan antes de mover nada:
// un NaN o un negativo colocaria la vista fuera de la pantalla o la haria
// desaparecer, y depurar eso desde la ventana es un infierno. Vive aparte
// de `vista.ts` para poder probarlo sin arrancar Electron.

export interface RecuadroVista {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/** Tope defensivo: ninguna pantalla real necesita mas que esto. */
const MAX_COORDENADA = 100000;

export function esRecuadroValido(valor: unknown): valor is RecuadroVista {
  if (typeof valor !== 'object' || valor === null) return false;
  const r = valor as Record<string, unknown>;
  const numero = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= MAX_COORDENADA;
  if (!numero(r['x']) || !numero(r['y']) || !numero(r['ancho']) || !numero(r['alto'])) {
    return false;
  }
  // Un tamano negativo no es un recuadro; cero si (la vista queda oculta
  // mientras el hueco todavia no se ha medido).
  return r['ancho'] >= 0 && r['alto'] >= 0;
}
