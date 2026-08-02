import { useEffect, useRef, useState } from 'react';
import type { ResultadoZimUI } from '../comun/estado';

// El articulo ZIM se pinta en un WebContentsView del proceso principal,
// aislado del renderer. Este componente solo reserva el hueco y le dice al
// main donde colocarlo; nunca recibe ni manipula el contenido.
//
// Dos cosas que hay que hacer bien aqui:
//  - Cargar el articulo UNA vez y despues solo recolocar el recuadro. La
//    vista es nativa y no se mueve sola con el scroll, pero recolocarla
//    llamando a "abrir" recargaba el articulo y tiraba la lectura.
//  - Contar los enlaces que salen a Internet. Vestigio los bloquea, y debe
//    hacerlo, pero bloquear en silencio deja al lector pulsando algo que no
//    responde (plan bloque 11, tarea 6).

interface Props {
  articulo: ResultadoZimUI;
}

export function VisorZim({ articulo }: Props): React.JSX.Element {
  const hueco = useRef<HTMLDivElement>(null);
  const [enlaceBloqueado, setEnlaceBloqueado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    const nodo = hueco.current;
    if (nodo === null) return;

    const medir = (): { x: number; y: number; ancho: number; alto: number } => {
      const r = nodo.getBoundingClientRect();
      return {
        x: Math.round(r.left),
        y: Math.round(r.top),
        ancho: Math.round(r.width),
        alto: Math.round(r.height),
      };
    };

    void window.vestigio.abrirZim(articulo.ruta, medir());

    const recolocar = (): void => {
      void window.vestigio.recolocarZim(medir());
    };
    window.addEventListener('resize', recolocar);
    window.addEventListener('scroll', recolocar, { passive: true });

    return () => {
      window.removeEventListener('resize', recolocar);
      window.removeEventListener('scroll', recolocar);
      void window.vestigio.cerrarVisorZim();
    };
  }, [articulo.ruta]);

  useEffect(() => {
    const baja = window.vestigio.alBloquearEnlaceZim((url) => {
      setEnlaceBloqueado(url);
      setCopiado(false);
    });
    return baja;
  }, []);

  return (
    <>
      {enlaceBloqueado !== null && (
        <div className="aviso-enlace" role="status">
          <p className="aviso">Ese enlace sale a Internet, así que Vestigio no lo ha abierto.</p>
          <p className="aviso-sutil">
            Aquí no hay conexión por diseño: es lo que hace que la biblioteca siga funcionando el
            día que no haya red. Te dejo la dirección por si quieres consultarla en otro momento.
          </p>
          {/* Texto, nunca un enlace vivo: viene del contenido del ZIM. */}
          <p className="direccion-bloqueada">{enlaceBloqueado}</p>
          <div className="acciones-ficha">
            <button
              type="button"
              className="boton-secundario"
              onClick={() => {
                void navigator.clipboard.writeText(enlaceBloqueado).then(() => {
                  setCopiado(true);
                });
              }}
            >
              {copiado ? 'Dirección copiada' : 'Copiar la dirección'}
            </button>
            <button
              type="button"
              className="boton-secundario"
              onClick={() => {
                setEnlaceBloqueado(null);
              }}
            >
              Seguir leyendo
            </button>
          </div>
        </div>
      )}
      <div className="hueco-zim" ref={hueco} aria-label="Artículo de la colección" />
    </>
  );
}
