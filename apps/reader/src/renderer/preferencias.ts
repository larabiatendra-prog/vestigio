// Preferencias de lectura (bloque 11, tarea 5).
//
// Viven en la tabla de ajustes del espacio personal, asi que viajan con la
// carpeta como cualquier otro dato de Daniel. Todas tienen un valor de
// fabrica al que se puede volver de un solo boton.

import { useCallback, useMemo } from 'react';
import type { EspacioPersonal } from './personal';

export interface Preferencias {
  /** Cuerpo del texto en pixeles. */
  tamano: number;
  /** Ancho maximo de la columna en caracteres. */
  ancho: number;
  interlineado: number;
  voz: 'serif' | 'sans';
  /** Superficie de lectura: la penumbra de El Paramo o papel claro. */
  superficie: 'penumbra' | 'papel';
}

export const PREFERENCIAS_DE_FABRICA: Preferencias = {
  tamano: 18,
  ancho: 68,
  interlineado: 1.72,
  voz: 'serif',
  superficie: 'penumbra',
};

const LIMITES = {
  tamano: { min: 14, max: 32, paso: 2 },
  ancho: { min: 45, max: 110, paso: 5 },
  interlineado: { min: 1.3, max: 2.4, paso: 0.1 },
};

const CLAVE = 'lectura.preferencias';

function acotar(valor: number, limite: { min: number; max: number }): number {
  return Math.min(Math.max(valor, limite.min), limite.max);
}

function leer(bruto: string | undefined): Preferencias {
  if (bruto === undefined) return PREFERENCIAS_DE_FABRICA;
  try {
    const guardadas = JSON.parse(bruto) as Partial<Preferencias>;
    return {
      tamano: acotar(Number(guardadas.tamano ?? PREFERENCIAS_DE_FABRICA.tamano), LIMITES.tamano),
      ancho: acotar(Number(guardadas.ancho ?? PREFERENCIAS_DE_FABRICA.ancho), LIMITES.ancho),
      interlineado: acotar(
        Number(guardadas.interlineado ?? PREFERENCIAS_DE_FABRICA.interlineado),
        LIMITES.interlineado,
      ),
      voz: guardadas.voz === 'sans' ? 'sans' : 'serif',
      superficie: guardadas.superficie === 'papel' ? 'papel' : 'penumbra',
    };
  } catch {
    // Un ajuste corrupto no puede impedir leer: se vuelve a fabrica.
    return PREFERENCIAS_DE_FABRICA;
  }
}

export interface ControlPreferencias {
  preferencias: Preferencias;
  cambiar: (parcial: Partial<Preferencias>) => void;
  ajustar: (clave: 'tamano' | 'ancho' | 'interlineado', direccion: 1 | -1) => void;
  restaurar: () => void;
  /** Variables CSS que aplican las preferencias a la superficie de lectura. */
  estilo: React.CSSProperties;
  sonDeFabrica: boolean;
}

export function usePreferencias(personal: EspacioPersonal): ControlPreferencias {
  const preferencias = useMemo(
    () => leer(personal.espacio.ajustes[CLAVE]),
    [personal.espacio.ajustes],
  );

  const cambiar = useCallback(
    (parcial: Partial<Preferencias>) => {
      void personal.aplicar({
        operacion: 'ajuste-guardar',
        clave: CLAVE,
        valor: JSON.stringify({ ...preferencias, ...parcial }),
      });
    },
    [personal, preferencias],
  );

  const ajustar = useCallback(
    (clave: 'tamano' | 'ancho' | 'interlineado', direccion: 1 | -1) => {
      const limite = LIMITES[clave];
      const bruto = preferencias[clave] + limite.paso * direccion;
      // El interlineado acumula decimales feos si no se redondea.
      const valor = clave === 'interlineado' ? Math.round(bruto * 10) / 10 : bruto;
      cambiar({ [clave]: acotar(valor, limite) } as Partial<Preferencias>);
    },
    [cambiar, preferencias],
  );

  const restaurar = useCallback(() => {
    cambiar(PREFERENCIAS_DE_FABRICA);
  }, [cambiar]);

  const estilo: React.CSSProperties = {
    ['--lectura-tamano' as string]: `${String(preferencias.tamano)}px`,
    ['--lectura-ancho' as string]: `${String(preferencias.ancho)}ch`,
    ['--lectura-interlineado' as string]: String(preferencias.interlineado),
    ['--lectura-voz' as string]:
      preferencias.voz === 'sans' ? 'var(--voz-neutra)' : 'var(--voz-humana)',
  };

  return {
    preferencias,
    cambiar,
    ajustar,
    restaurar,
    estilo,
    sonDeFabrica:
      preferencias.tamano === PREFERENCIAS_DE_FABRICA.tamano &&
      preferencias.ancho === PREFERENCIAS_DE_FABRICA.ancho &&
      preferencias.interlineado === PREFERENCIAS_DE_FABRICA.interlineado &&
      preferencias.voz === PREFERENCIAS_DE_FABRICA.voz &&
      preferencias.superficie === PREFERENCIAS_DE_FABRICA.superficie,
  };
}

export { LIMITES as LIMITES_PREFERENCIAS };
