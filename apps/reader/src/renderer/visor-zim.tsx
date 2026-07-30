import { useEffect, useRef } from 'react';
import type { ResultadoZimUI } from '../comun/estado';

// El articulo ZIM se pinta en un WebContentsView del proceso principal,
// aislado del renderer. Este componente solo reserva el hueco y le dice al
// main donde colocarlo; nunca recibe ni manipula el contenido.

interface Props {
  articulo: ResultadoZimUI;
  alCerrar: () => void;
}

export function VisorZim({ articulo, alCerrar }: Props): React.JSX.Element {
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
    window.addEventListener('resize', colocar);
    return () => {
      window.removeEventListener('resize', colocar);
      void window.vestigio.cerrarVisorZim();
    };
  }, [articulo.ruta]);

  return (
    <div className="lectura">
      <header className="cabecera-lectura">
        <h1 className="titulo-obra">{articulo.titulo}</h1>
        <p className="lema">colección {articulo.libro} · artículo externo</p>
        <p className="aviso-sutil">
          Este artículo procede de una colección ZIM, no del catálogo curado. Se muestra aislado,
          sin scripts y sin salida a Internet.
        </p>
        <button type="button" className="volver" onClick={alCerrar}>
          ← cerrar artículo
        </button>
      </header>
      <div className="hueco-zim" ref={hueco} aria-label="Artículo de la colección" />
    </div>
  );
}
