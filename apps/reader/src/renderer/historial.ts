// Historial de navegacion (bloque 10, tarea 6).
//
// La regla es que volver atras devuelva la pantalla EXACTAMENTE como estaba:
// la misma consulta, los mismos filtros, la misma posicion de scroll y el
// mismo elemento enfocado. Por eso el estado de la busqueda no vive en un
// useState suelto, sino DENTRO del destino: cada entrada del historial se
// basta a si misma para reconstruir lo que se veia.
//
// La pila y el indice son un unico estado a proposito: dos useState separados
// se desincronizan en cuanto la pila se recorta por el limite.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FiltrosUI, ResultadoZimUI } from '../comun/estado';

export interface EstadoBusqueda {
  consulta: string;
  filtros: FiltrosUI;
  avanzado: boolean;
  sinonimos: boolean;
  presentacion: 'lista' | 'rejilla';
}

export const BUSQUEDA_INICIAL: EstadoBusqueda = {
  consulta: '',
  filtros: {},
  avanzado: false,
  sinonimos: true,
  presentacion: 'lista',
};

export type Destino =
  | { vista: 'inicio' }
  | ({ vista: 'biblioteca' } & EstadoBusqueda)
  | { vista: 'ficha'; recursoId: string }
  | { vista: 'lectura'; recursoId: string; localizador: string | null; pagina: number | null }
  | { vista: 'zim'; articulo: ResultadoZimUI }
  | { vista: 'mi-espacio' }
  | { vista: 'sistema' };

interface Entrada {
  destino: Destino;
  /** Posicion de scroll al abandonar esta entrada. */
  scroll: number;
  /** Valor de data-ancla del elemento que tenia el foco. */
  ancla: string | null;
}

interface Pila {
  entradas: Entrada[];
  indice: number;
}

export interface Historial {
  destino: Destino;
  puedeAtras: boolean;
  puedeAdelante: boolean;
  ir: (destino: Destino) => void;
  /** Sustituye el destino actual sin crear una entrada nueva. */
  reemplazar: (destino: Destino) => void;
  atras: () => void;
  adelante: () => void;
}

const LIMITE_ENTRADAS = 60;

function anclaEnfocada(): string | null {
  const activo = document.activeElement;
  if (!(activo instanceof HTMLElement)) return null;
  return activo.dataset['ancla'] ?? null;
}

/** Anota donde estaba Daniel antes de moverse de sitio. */
function conPosicionActual(pila: Pila): Entrada[] {
  return pila.entradas.map((entrada, i) =>
    i === pila.indice ? { ...entrada, scroll: window.scrollY, ancla: anclaEnfocada() } : entrada,
  );
}

export function useHistorial(inicial: Destino = { vista: 'inicio' }): Historial {
  const [pila, setPila] = useState<Pila>({
    entradas: [{ destino: inicial, scroll: 0, ancla: null }],
    indice: 0,
  });
  /** Lo que hay que restaurar tras pintar; null si el destino es nuevo. */
  const porRestaurar = useRef<Entrada | null>(null);

  const ir = useCallback((destino: Destino) => {
    porRestaurar.current = null;
    setPila((previa) => {
      // Navegar desde el medio del historial descarta lo que habia delante:
      // es lo que hace cualquier navegador y lo que la gente espera.
      const conservadas = conPosicionActual(previa).slice(0, previa.indice + 1);
      const entradas = [...conservadas, { destino, scroll: 0, ancla: null }];
      const recortadas =
        entradas.length > LIMITE_ENTRADAS
          ? entradas.slice(entradas.length - LIMITE_ENTRADAS)
          : entradas;
      return { entradas: recortadas, indice: recortadas.length - 1 };
    });
  }, []);

  const reemplazar = useCallback((destino: Destino) => {
    // Solo cambia el destino de la entrada actual: no se ha ido a ningun
    // sitio, asi que ni el scroll ni el foco se tocan.
    setPila((previa) => ({
      indice: previa.indice,
      entradas: previa.entradas.map((entrada, i) =>
        i === previa.indice ? { ...entrada, destino } : entrada,
      ),
    }));
  }, []);

  const mover = useCallback((delta: number) => {
    setPila((previa) => {
      const destinoIndice = Math.min(
        Math.max(0, previa.indice + delta),
        previa.entradas.length - 1,
      );
      if (destinoIndice === previa.indice) return previa;
      const entradas = conPosicionActual(previa);
      porRestaurar.current = entradas[destinoIndice] ?? null;
      return { entradas, indice: destinoIndice };
    });
  }, []);

  const atras = useCallback(() => {
    mover(-1);
  }, [mover]);
  const adelante = useCallback(() => {
    mover(1);
  }, [mover]);

  // Restauracion exacta tras pintar el destino recuperado.
  useEffect(() => {
    const entrada = porRestaurar.current;
    if (entrada === null) {
      window.scrollTo({ top: 0 });
      return;
    }
    porRestaurar.current = null;
    const cuadro = requestAnimationFrame(() => {
      window.scrollTo({ top: entrada.scroll });
      if (entrada.ancla !== null) {
        const objetivo = document.querySelector<HTMLElement>(
          `[data-ancla="${CSS.escape(entrada.ancla)}"]`,
        );
        objetivo?.focus({ preventScroll: true });
      }
    });
    return () => {
      cancelAnimationFrame(cuadro);
    };
  }, [pila.indice]);

  // Atajos del sistema: Alt+flechas y los botones laterales del raton.
  useEffect(() => {
    const teclado = (evento: KeyboardEvent): void => {
      if (!evento.altKey) return;
      if (evento.key === 'ArrowLeft') {
        evento.preventDefault();
        atras();
      } else if (evento.key === 'ArrowRight') {
        evento.preventDefault();
        adelante();
      }
    };
    const raton = (evento: MouseEvent): void => {
      if (evento.button === 3) {
        evento.preventDefault();
        atras();
      } else if (evento.button === 4) {
        evento.preventDefault();
        adelante();
      }
    };
    window.addEventListener('keydown', teclado);
    window.addEventListener('mouseup', raton);
    return () => {
      window.removeEventListener('keydown', teclado);
      window.removeEventListener('mouseup', raton);
    };
  }, [atras, adelante]);

  const actual = pila.entradas[pila.indice] ?? { destino: inicial, scroll: 0, ancla: null };
  return {
    destino: actual.destino,
    puedeAtras: pila.indice > 0,
    puedeAdelante: pila.indice < pila.entradas.length - 1,
    ir,
    reemplazar,
    atras,
    adelante,
  };
}
