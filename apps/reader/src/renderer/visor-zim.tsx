import { useEffect, useRef } from 'react';
import type { ResultadoZimUI } from '../comun/estado';

// El articulo ZIM se pinta en un WebContentsView del proceso principal,
// aislado del renderer. Este componente solo reserva el hueco y le dice al
// main donde colocarlo; nunca recibe ni manipula el contenido.

interface Props {
  articulo: ResultadoZimUI;
}

export function VisorZim({ articulo }: Props): React.JSX.Element {
  const hueco = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const colocar = (): void => {
      const nodo = hueco.current;
      if (nodo === null) return;
      const r = nodo.getBoundingClientRect();
      void window.vestigio.abrirZim(articulo.ruta, {
        x: Math.round(r.left),
        y: Math.round(r.top),
        ancho: Math.round(r.width),
        alto: Math.round(r.height),
      });
    };
    colocar();
    // La vista nativa no se mueve sola: hay que recolocarla cuando la
    // ventana cambia de tamano o la pagina hace scroll.
    window.addEventListener('resize', colocar);
    window.addEventListener('scroll', colocar, { passive: true });
    return () => {
      window.removeEventListener('resize', colocar);
      window.removeEventListener('scroll', colocar);
      void window.vestigio.cerrarVisorZim();
    };
  }, [articulo.ruta]);

  return <div className="hueco-zim" ref={hueco} aria-label="Artículo de la colección" />;
}
