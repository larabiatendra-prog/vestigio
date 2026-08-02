import { useState } from 'react';
import type { FichaUI } from '../comun/estado';
import { tamanoLegible } from './etiquetas';

// Lector de imagenes sueltas (bloque 07). El original se sirve por el
// protocolo interno resolviendo el UUID: aqui nunca hay rutas de disco.
//
// Una imagen no tiene texto, y Vestigio lo dice en vez de disimularlo: no
// aparecera al buscar por su contenido, solo por su titulo y sus etiquetas.

interface Props {
  ficha: FichaUI;
}

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 6;

export function LectorImagen({ ficha }: Props): React.JSX.Element {
  const [zoom, setZoom] = useState(1);
  const [ajustada, setAjustada] = useState(true);
  const [fallo, setFallo] = useState(false);

  if (fallo) {
    return (
      <div className="cuerpo-lectura">
        <p className="aviso">No se pudo mostrar esta imagen.</p>
        <p className="nota-pie">
          El fichero original se conserva intacto en la biblioteca; puede que el formato no sea uno
          de los que Vestigio sabe pintar.
        </p>
      </div>
    );
  }

  return (
    <div className="cuerpo-lectura">
      <div className="barra-pdf" role="toolbar" aria-label="Controles de la imagen">
        <button
          type="button"
          onClick={() => {
            setAjustada((a) => !a);
            setZoom(1);
          }}
          aria-pressed={ajustada}
        >
          {ajustada ? 'tamaño real' : 'ajustar a la ventana'}
        </button>
        <button
          type="button"
          disabled={ajustada || zoom <= ZOOM_MIN}
          onClick={() => {
            setZoom((z) => Math.max(ZOOM_MIN, z - 0.25));
          }}
        >
          menos zoom
        </button>
        <span className="valor">
          {ajustada ? 'ajustada' : `${String(Math.round(zoom * 100))} %`}
        </span>
        <button
          type="button"
          disabled={ajustada || zoom >= ZOOM_MAX}
          onClick={() => {
            setZoom((z) => Math.min(ZOOM_MAX, z + 0.25));
          }}
        >
          más zoom
        </button>
        <span className="valor">{tamanoLegible(ficha.bytes)}</span>
      </div>

      <div className={ajustada ? 'lienzo-imagen ajustada' : 'lienzo-imagen'}>
        <img
          src={`vestigio://original/${ficha.id}`}
          alt={ficha.titulo}
          style={ajustada ? undefined : { width: `${String(zoom * 100)}%` }}
          onError={() => {
            setFallo(true);
          }}
        />
      </div>

      <p className="nota-pie">
        Una imagen no tiene texto que buscar: esta la encontrarás por su título y sus etiquetas, no
        por lo que se vea dentro.
      </p>
    </div>
  );
}
