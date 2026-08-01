import { useEffect, useRef } from 'react';
import type { FichaUI } from '../comun/estado';

// Lector de formatos textuales. El HTML llega ya saneado en construccion
// (@vestigio/content-pipeline); aqui solo se inserta en un contenedor sin
// scripts posibles: la CSP del renderer prohibe cualquier ejecucion, y el
// saneado ya elimino handlers, recursos remotos y esquemas peligrosos.
//
// El progreso se calcula por SECCION VISIBLE, no por pixeles: un localizador
// estable sobrevive a reconstruir la edicion, y el porcentaje de scroll no.

interface Props {
  ficha: FichaUI;
  localizadorDestino: string | null;
  /** Aviso al shell de por donde va la lectura (localizador + % del documento). */
  alLeerSeccion?: (localizador: string, porcentaje: number) => void;
}

export function LectorTexto({
  ficha,
  localizadorDestino,
  alLeerSeccion,
}: Props): React.JSX.Element {
  const contenedor = useRef<HTMLDivElement>(null);
  const ultimoAvisado = useRef<string | null>(null);

  useEffect(() => {
    if (localizadorDestino === null) return;
    const destino = contenedor.current?.querySelector(
      `[data-localizador="${CSS.escape(localizadorDestino)}"]`,
    );
    destino?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [localizadorDestino, ficha.id]);

  // Seccion mas alta que sigue visible: esa es "por donde voy".
  useEffect(() => {
    const nodo = contenedor.current;
    if (nodo === null || alLeerSeccion === undefined) return;

    const observador = new IntersectionObserver(
      (entradas) => {
        const visible = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible === undefined) return;
        const localizador = (visible.target as HTMLElement).dataset['localizador'];
        if (localizador === undefined || localizador === ultimoAvisado.current) return;
        ultimoAvisado.current = localizador;
        const posicion = ficha.segmentos.findIndex((s) => s.localizador === localizador);
        const porcentaje =
          ficha.segmentos.length > 0 ? ((posicion + 1) / ficha.segmentos.length) * 100 : 0;
        alLeerSeccion(localizador, porcentaje);
      },
      { rootMargin: '-10% 0px -70% 0px' },
    );
    for (const seccion of nodo.querySelectorAll('[data-localizador]')) {
      observador.observe(seccion);
    }
    return () => {
      observador.disconnect();
    };
  }, [ficha.id, ficha.segmentos, alLeerSeccion]);

  return (
    <div className="cuerpo-lectura">
      <article className="cuerpo" ref={contenedor}>
        {ficha.segmentos.map((segmento) => (
          <section
            key={segmento.localizador}
            id={segmento.localizador}
            data-localizador={segmento.localizador}
            className={
              localizadorDestino === segmento.localizador ? 'seccion destacada' : 'seccion'
            }
          >
            {segmento.html !== null ? (
              <div
                // El contenido ya fue saneado por lista blanca en construccion.
                dangerouslySetInnerHTML={{ __html: segmento.html }}
              />
            ) : (
              <p>{segmento.cuerpo}</p>
            )}
          </section>
        ))}
        {ficha.segmentos.length === 0 && (
          <p className="aviso">
            Este documento no tiene texto extraído.{' '}
            {ficha.detalleTexto ?? 'Se conserva el original tal cual se recibió.'}
          </p>
        )}
      </article>

      {ficha.formato === 'html' && (
        <p className="nota-pie">
          Esta es una versión saneada de la página original: se han eliminado scripts, formularios y
          cualquier recurso que intentara salir a Internet. El fichero original se conserva intacto.
        </p>
      )}
    </div>
  );
}
