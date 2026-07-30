import { useEffect, useMemo, useRef } from 'react';
import type { FichaUI } from '../comun/estado';

// Lector de formatos textuales. El HTML llega ya saneado en construccion
// (@vestigio/content-pipeline); aqui solo se inserta en un contenedor sin
// scripts posibles: la CSP del renderer prohibe cualquier ejecucion, y el
// saneado ya elimino handlers, recursos remotos y esquemas peligrosos.

interface Props {
  ficha: FichaUI;
  localizadorDestino: string | null;
  terminos: string[];
}

export function LectorTexto({ ficha, localizadorDestino, terminos }: Props): React.JSX.Element {
  const contenedor = useRef<HTMLDivElement>(null);

  const indice = useMemo(
    () => ficha.segmentos.filter((s) => s.titulo !== null && s.titulo.length > 0),
    [ficha.segmentos],
  );

  useEffect(() => {
    if (localizadorDestino === null) return;
    const destino = contenedor.current?.querySelector(
      `[data-localizador="${CSS.escape(localizadorDestino)}"]`,
    );
    destino?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [localizadorDestino, ficha.id]);

  return (
    <div className="lectura">
      {indice.length > 1 && (
        <nav className="indice" aria-label="Índice del documento">
          <p className="etiqueta">Índice</p>
          <ol>
            {indice.map((s) => (
              <li
                key={s.localizador}
                style={{ marginLeft: `${String(((s.nivel ?? 2) - 2) * 12)}px` }}
              >
                <a href={`#${s.localizador}`}>{s.titulo}</a>
              </li>
            ))}
          </ol>
        </nav>
      )}

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
      {terminos.length > 0 && <p className="nota-pie">buscado: {terminos.join(' ')}</p>}
    </div>
  );
}
