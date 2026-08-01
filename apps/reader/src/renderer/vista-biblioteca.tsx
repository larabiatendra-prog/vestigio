// Biblioteca: buscar, filtrar y explorar el fondo (bloque 10, tarea 3).
//
// El estado de la busqueda no se guarda aqui: llega desde el historial y se
// devuelve por `alCambiarBusqueda`. Asi volver atras restituye la consulta y
// los filtros exactos, que es el criterio de salida del bloque.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  EstadoZimUI,
  FiltrosUI,
  RecursoResumenUI,
  ResultadoBusquedaUI,
  ResultadoZimUI,
} from '../comun/estado';
import type { EstadoBusqueda } from './historial';
import { Buscador } from './buscador';
import {
  etiquetaEstadoTexto,
  etiquetaFormato,
  etiquetaIdioma,
  estadoPreocupante,
} from './etiquetas';

interface Props {
  busqueda: EstadoBusqueda;
  alCambiarBusqueda: (parcial: Partial<EstadoBusqueda>) => void;
  biblioteca: RecursoResumenUI[];
  catalogoPresente: boolean;
  estadoZim: EstadoZimUI | null;
  esFavorito: (recursoId: string) => boolean;
  alAbrirFicha: (recursoId: string) => void;
  alAbrirLectura: (recursoId: string, localizador: string | null, pagina: number | null) => void;
  alAbrirZim: (articulo: ResultadoZimUI) => void;
}

export function VistaBiblioteca({
  busqueda,
  alCambiarBusqueda,
  biblioteca,
  catalogoPresente,
  estadoZim,
  esFavorito,
  alAbrirFicha,
  alAbrirLectura,
  alAbrirZim,
}: Props): React.JSX.Element {
  const [resultados, setResultados] = useState<ResultadoBusquedaUI | null>(null);
  const [resultadosZim, setResultadosZim] = useState<ResultadoZimUI[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [falloBusqueda, setFalloBusqueda] = useState<string | null>(null);

  const { consulta, filtros, avanzado, sinonimos, presentacion } = busqueda;

  useEffect(() => {
    if (consulta.trim().length === 0) {
      setResultados(null);
      setResultadosZim(null);
      setFalloBusqueda(null);
      return;
    }
    const temporizador = setTimeout(() => {
      setBuscando(true);
      setFalloBusqueda(null);
      // Documentos catalogados primero y estables; los ZIM llegan aparte y
      // nunca reordenan ni bloquean la lista que ya se esta leyendo (§9.3).
      window.vestigio
        .buscar(consulta, { filtros, sinonimos, avanzado })
        .then(setResultados)
        .catch((error: unknown) => {
          setResultados(null);
          setFalloBusqueda(
            error instanceof Error
              ? `La búsqueda no pudo completarse: ${error.message}`
              : 'La búsqueda no pudo completarse.',
          );
        })
        .finally(() => {
          setBuscando(false);
        });
      window.vestigio
        .buscarZim(consulta)
        .then(setResultadosZim)
        .catch(() => {
          setResultadosZim([]);
        });
    }, 200);
    return () => {
      clearTimeout(temporizador);
    };
  }, [consulta, filtros, avanzado, sinonimos]);

  /** OR dentro de la faceta: pulsar un chip lo anade o lo quita. */
  const alternarFiltro = useCallback(
    (faceta: 'formatos' | 'idiomas', valor: string) => {
      const actuales = filtros[faceta] ?? [];
      const nuevos = actuales.includes(valor)
        ? actuales.filter((v) => v !== valor)
        : [...actuales, valor];
      // Una faceta sin valores desaparece del filtro (no queda un array
      // vacio que el repositorio tendria que interpretar).
      const siguiente: FiltrosUI = {};
      for (const [clave, valores] of Object.entries(filtros)) {
        if (clave !== faceta && valores !== undefined && valores.length > 0) {
          siguiente[clave as keyof FiltrosUI] = valores;
        }
      }
      if (nuevos.length > 0) siguiente[faceta] = nuevos;
      alCambiarBusqueda({ filtros: siguiente });
    },
    [filtros, alCambiarBusqueda],
  );

  const hayConsulta = consulta.trim().length > 0;
  const catalogoVacio = biblioteca.length === 0;

  const coleccionesActivas = useMemo(
    () => (estadoZim?.fase === 'activo' ? estadoZim.colecciones : []),
    [estadoZim],
  );

  return (
    <>
      <section className="buscador" aria-label="Buscar en la biblioteca">
        <input
          type="search"
          className="campo-busqueda"
          placeholder={
            avanzado ? '"frases exactas", prefijo*, -excluir…' : 'buscar en la biblioteca…'
          }
          value={consulta}
          onChange={(e) => {
            alCambiarBusqueda({ consulta: e.target.value });
          }}
          aria-label="Buscar en la biblioteca"
          data-ancla="campo-busqueda"
          autoFocus
        />
        <div className="opciones-busqueda">
          <button
            type="button"
            className={avanzado ? 'chip activo' : 'chip'}
            aria-pressed={avanzado}
            onClick={() => {
              alCambiarBusqueda({ avanzado: !avanzado });
            }}
          >
            modo avanzado
          </button>
          <button
            type="button"
            className={sinonimos ? 'chip activo' : 'chip'}
            aria-pressed={sinonimos}
            onClick={() => {
              alCambiarBusqueda({ sinonimos: !sinonimos });
            }}
          >
            sinónimos
          </button>
        </div>
      </section>

      {falloBusqueda !== null && (
        <section className="panel" aria-label="Problema al buscar">
          <p className="etiqueta">No se pudo buscar</p>
          <p className="aviso">{falloBusqueda}</p>
          <p className="aviso-sutil">
            La biblioteca completa sigue disponible más abajo mientras tanto.
          </p>
        </section>
      )}

      {hayConsulta && (
        <Buscador
          resultado={resultados}
          resultadosZim={resultadosZim}
          buscando={buscando}
          filtros={filtros}
          sinonimosActivos={sinonimos}
          modoAvanzado={avanzado}
          alAlternarFiltro={alternarFiltro}
          alAlternarSinonimos={() => {
            alCambiarBusqueda({ sinonimos: !sinonimos });
          }}
          alAceptarSugerencia={(t) => {
            alCambiarBusqueda({ consulta: t });
          }}
          alAbrirDocumento={alAbrirLectura}
          alAbrirFicha={alAbrirFicha}
          alAbrirZim={alAbrirZim}
        />
      )}

      <section className="panel" aria-label="Todos los documentos">
        <div className="cabecera-panel">
          <p className="etiqueta">
            Documentos ·{' '}
            {catalogoVacio
              ? 'ninguno todavía'
              : `${String(biblioteca.length)} ${biblioteca.length === 1 ? 'documento' : 'documentos'}`}
          </p>
          <div className="grupo-chips" role="group" aria-label="Cómo se ven los documentos">
            <button
              type="button"
              className={presentacion === 'lista' ? 'chip activo' : 'chip'}
              aria-pressed={presentacion === 'lista'}
              onClick={() => {
                alCambiarBusqueda({ presentacion: 'lista' });
              }}
            >
              lista
            </button>
            <button
              type="button"
              className={presentacion === 'rejilla' ? 'chip activo' : 'chip'}
              aria-pressed={presentacion === 'rejilla'}
              onClick={() => {
                alCambiarBusqueda({ presentacion: 'rejilla' });
              }}
            >
              rejilla
            </button>
          </div>
        </div>

        {!catalogoPresente ? (
          <p className="aviso-sutil">
            Todavía no hay catálogo en esta entrega. Se construye con la herramienta de ingesta:{' '}
            <code>vestigio-admin ingerir &lt;carpeta&gt;</code>. Hasta entonces, Vestigio arranca y
            funciona, pero no tiene nada que enseñarte.
          </p>
        ) : catalogoVacio ? (
          <p className="aviso-sutil">
            El catálogo existe pero está vacío. Vuelve a pasar la ingesta sobre la carpeta de
            documentos.
          </p>
        ) : presentacion === 'rejilla' ? (
          <ul className="rejilla-documentos">
            {biblioteca.map((recurso) => (
              <li key={recurso.id}>
                <button
                  type="button"
                  className="tarjeta"
                  data-ancla={`doc-${recurso.id}`}
                  onClick={() => {
                    alAbrirFicha(recurso.id);
                  }}
                >
                  <span className="tarjeta-formato">{etiquetaFormato(recurso.formato)}</span>
                  <span className="tarjeta-titulo">{recurso.titulo}</span>
                  <span className="tarjeta-pie">
                    {recurso.autor ?? 'autoría sin determinar'}
                    {recurso.numPaginas !== null ? ` · ${String(recurso.numPaginas)} pág.` : ''}
                  </span>
                  {estadoPreocupante(recurso.estadoTexto) && (
                    <span className="tarjeta-alerta">
                      {etiquetaEstadoTexto(recurso.estadoTexto)}
                    </span>
                  )}
                  {esFavorito(recurso.id) && <span className="tarjeta-favorito">guardado</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          biblioteca.map((recurso) => (
            <button
              type="button"
              className="fila fila-pulsable"
              key={recurso.id}
              data-ancla={`doc-${recurso.id}`}
              onClick={() => {
                alAbrirFicha(recurso.id);
              }}
            >
              <span className="nombre">
                {recurso.titulo}
                {esFavorito(recurso.id) && <span className="marca-guardado"> · guardado</span>}
              </span>
              <span className="valor">
                {etiquetaFormato(recurso.formato)}
                {recurso.idioma !== 'und' ? ` · ${etiquetaIdioma(recurso.idioma)}` : ''}
                {recurso.numPaginas !== null ? ` · ${String(recurso.numPaginas)} pág.` : ''}
                {estadoPreocupante(recurso.estadoTexto)
                  ? ` · ${etiquetaEstadoTexto(recurso.estadoTexto)}`
                  : ''}
              </span>
            </button>
          ))
        )}
      </section>

      {coleccionesActivas.length > 0 && (
        <section className="panel" aria-label="Colecciones">
          <p className="etiqueta">Colecciones · {String(coleccionesActivas.length)}</p>
          <p className="aviso-sutil">
            Las colecciones son archivos completos de otra procedencia. No están catalogadas
            documento a documento: se buscan enteras y se leen aparte.
          </p>
          {coleccionesActivas.map((coleccion) => (
            <div className="fila" key={coleccion.nombre}>
              <span className="nombre">{coleccion.titulo ?? coleccion.nombre}</span>
              <span className="valor">
                {coleccion.articulos !== null
                  ? `${new Intl.NumberFormat('es-ES').format(coleccion.articulos)} artículos`
                  : 'sin recuento'}
                {coleccion.fecha !== null ? ` · ${coleccion.fecha}` : ''}
              </span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
