import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { FichaUI } from '../comun/estado';

// Lector de PDF con PDF.js empaquetado localmente (jamas de CDN) y worker
// real. El original se sirve por el protocolo interno resolviendo el UUID:
// el renderer nunca maneja rutas del disco.

// El worker vive junto a esta ventana (lo copia webpack.renderer.config).
// Ruta relativa al documento: identica en desarrollo (http://localhost) y
// en el paquete (file://), sin red ni CDN en ningun caso.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdf.worker.min.mjs',
  window.location.href,
).toString();

const MAX_ANCHO = 900;

interface Props {
  ficha: FichaUI;
  paginaDestino: number | null;
}

export function LectorPdf({ ficha, paginaDestino }: Props): React.JSX.Element {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [documento, setDocumento] = useState<PDFDocumentProxy | null>(null);
  const [pagina, setPagina] = useState(paginaDestino ?? 1);
  const [total, setTotal] = useState(ficha.numPaginas ?? 0);
  const [zoom, setZoom] = useState(1);
  const [fallo, setFallo] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    const tarea = pdfjs.getDocument({
      // Solo por UUID: el renderer nunca conoce rutas del disco.
      url: `vestigio://original/${ficha.id}`,
      stopAtErrors: false,
    });
    tarea.promise
      .then((doc) => {
        // Si el componente ya se desmonto, la limpieza de la tarea (abajo)
        // se encarga de liberar el documento.
        if (cancelado) return;
        setDocumento(doc);
        setTotal(doc.numPages);
      })
      .catch((error: unknown) => {
        if (!cancelado) {
          setFallo(error instanceof Error ? error.message : 'no se pudo abrir el documento');
        }
      });
    return () => {
      cancelado = true;
      void tarea.destroy();
    };
  }, [ficha.id]);

  useEffect(() => {
    setPagina(paginaDestino ?? 1);
  }, [paginaDestino, ficha.id]);

  useEffect(() => {
    if (documento === null) return;
    let cancelada = false;
    let tareaRender: { cancel: () => void } | null = null;

    void (async () => {
      try {
        const p = await documento.getPage(Math.min(Math.max(1, pagina), documento.numPages));
        if (cancelada) return;
        const lienzoActual = lienzo.current;
        if (lienzoActual === null) return;
        const base = p.getViewport({ scale: 1 });
        const escala = Math.min(MAX_ANCHO / base.width, 2) * zoom;
        const viewport = p.getViewport({ scale: escala });
        const contexto = lienzoActual.getContext('2d');
        if (contexto === null) return;
        lienzoActual.width = Math.floor(viewport.width);
        lienzoActual.height = Math.floor(viewport.height);
        const render = p.render({ canvas: lienzoActual, canvasContext: contexto, viewport });
        tareaRender = render;
        await render.promise;
      } catch (error) {
        if (!cancelada && error instanceof Error && !/cancel/i.test(error.message)) {
          setFallo(error.message);
        }
      }
    })();

    return () => {
      cancelada = true;
      tareaRender?.cancel();
    };
  }, [documento, pagina, zoom]);

  if (fallo !== null) {
    return (
      <div className="lectura">
        <p className="aviso">No se pudo mostrar el PDF: {fallo}</p>
        <p className="nota-pie">El original se conserva intacto en la biblioteca.</p>
      </div>
    );
  }

  return (
    <div className="lectura">
      <div className="barra-pdf" role="toolbar" aria-label="Controles del documento">
        <button
          type="button"
          onClick={() => setPagina((p) => Math.max(1, p - 1))}
          disabled={pagina <= 1}
        >
          anterior
        </button>
        <span className="valor">
          página {pagina} de {total > 0 ? total : '?'}
        </span>
        <button
          type="button"
          onClick={() => setPagina((p) => Math.min(total > 0 ? total : p + 1, p + 1))}
          disabled={total > 0 && pagina >= total}
        >
          siguiente
        </button>
        <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}>
          menos zoom
        </button>
        <button type="button" onClick={() => setZoom((z) => Math.min(3, z + 0.2))}>
          más zoom
        </button>
      </div>
      <div className="lienzo-pdf">
        <canvas ref={lienzo} aria-label={`Página ${String(pagina)} de ${ficha.titulo}`} />
      </div>
      {ficha.segmentos.length > 0 && (
        <details className="vista-textual">
          <summary>Vista textual de esta página (extracción, no el original)</summary>
          <p className="cuerpo-textual">
            {ficha.segmentos.find((s) => s.pagina === pagina)?.cuerpo ??
              'Sin texto extraído para esta página.'}
          </p>
        </details>
      )}
    </div>
  );
}
