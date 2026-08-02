// Shell comun de lectura (bloque 11, tareas 1-9).
//
// Todos los formatos entran por aqui: la cabecera, el indice, el buscar
// dentro, las preferencias, la cita, las notas y el progreso son los mismos
// para un TXT, un PDF o un articulo de una coleccion. Lo que cambia es solo
// la superficie que pinta el contenido.
//
// Dos promesas que la pantalla mantiene siempre:
//  - Se sabe QUE version se esta leyendo: formato, edicion del corpus y si lo
//    que ves es el original o un texto extraido.
//  - Nada sale a Internet. Un enlace externo se copia o se explica, jamas se
//    abre.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FichaUI, RelacionadoUI, ResultadoZimUI } from '../comun/estado';
import type { EspacioPersonal } from './personal';
import { nuevoId } from './personal';
import { usePreferencias, LIMITES_PREFERENCIAS } from './preferencias';
import { buscarEnSegmentos, recolocar, type CoincidenciaInterna } from './busqueda-interna';
import { LectorTexto } from './lector-texto';
import { LectorPdf } from './lector-pdf';
import { LectorImagen } from './lector-imagen';
import { VisorZim } from './visor-zim';
import {
  DETALLE_ESTADO_TEXTO,
  etiquetaEstadoTexto,
  etiquetaFormato,
  etiquetaIdioma,
  estadoPreocupante,
} from './etiquetas';

type Contenido =
  | { clase: 'documento'; ficha: FichaUI; localizador: string | null; pagina: number | null }
  | { clase: 'zim'; articulo: ResultadoZimUI };

interface Props {
  contenido: Contenido;
  edicionCorpus: string | null;
  personal: EspacioPersonal;
  alAbrirFicha: (recursoId: string) => void;
  alCerrar: () => void;
}

/** Resalta lo que la busqueda interna marco con [[ ]] sin insertar HTML. */
function Fragmento({ texto }: { texto: string }): React.JSX.Element {
  const partes = texto.split(/\[\[|\]\]/);
  return (
    <>
      {partes.map((parte, i) =>
        i % 2 === 1 ? <mark key={i}>{parte}</mark> : <span key={i}>{parte}</span>,
      )}
    </>
  );
}

export function Lector({
  contenido,
  edicionCorpus,
  personal,
  alAbrirFicha,
  alCerrar,
}: Props): React.JSX.Element {
  const control = usePreferencias(personal);
  const [panel, setPanel] = useState<'ninguno' | 'buscar' | 'preferencias' | 'notas'>('ninguno');
  const [dentro, setDentro] = useState('');
  const [indiceCoincidencia, setIndiceCoincidencia] = useState(0);
  const [notaNueva, setNotaNueva] = useState('');
  const [copiado, setCopiado] = useState<string | null>(null);
  const [relacionados, setRelacionados] = useState<RelacionadoUI[]>([]);

  /** A donde devolver el foco al cerrar un panel (bloque 11, tarea 3). */
  const focoPrevio = useRef<HTMLElement | null>(null);
  const campoDentro = useRef<HTMLInputElement>(null);

  const esDocumento = contenido.clase === 'documento';
  const ficha = esDocumento ? contenido.ficha : null;

  // --- Destino y anclajes que ya no existen (tarea 8) ------------------------

  const progresoGuardado = ficha !== null ? personal.progresoDe(ficha.id) : null;

  const destino = useMemo(() => {
    if (contenido.clase !== 'documento') return { localizador: null, via: 'sin-destino' as const };
    if (contenido.localizador !== null) {
      return recolocar(contenido.ficha.segmentos, contenido.localizador, null);
    }
    // Sin destino explicito se retoma por donde iba, con el texto de
    // referencia como red de seguridad si el ancla cambio de nombre.
    return recolocar(
      contenido.ficha.segmentos,
      progresoGuardado?.localizador ?? null,
      progresoGuardado?.fallbackTexto ?? null,
    );
  }, [contenido, progresoGuardado]);

  const paginaDestino = esDocumento
    ? (contenido.pagina ??
      (contenido.localizador === null ? progresoGuardado?.pagina : null) ??
      null)
    : null;

  // --- Buscar dentro ---------------------------------------------------------

  const coincidencias: CoincidenciaInterna[] = useMemo(
    () => (ficha === null ? [] : buscarEnSegmentos(ficha.segmentos, dentro)),
    [ficha, dentro],
  );

  const coincidenciaActual = coincidencias[indiceCoincidencia] ?? null;

  useEffect(() => {
    setIndiceCoincidencia(0);
  }, [dentro]);

  const abrirPanel = useCallback((cual: 'buscar' | 'preferencias' | 'notas') => {
    const activo = document.activeElement;
    if (activo instanceof HTMLElement) focoPrevio.current = activo;
    setPanel((previo) => (previo === cual ? 'ninguno' : cual));
  }, []);

  const cerrarPanel = useCallback(() => {
    setPanel('ninguno');
    // Volver exactamente al sitio desde el que se abrio (tarea 3).
    focoPrevio.current?.focus();
  }, []);

  const mover = useCallback(
    (delta: number) => {
      if (coincidencias.length === 0) return;
      setIndiceCoincidencia((i) => (i + delta + coincidencias.length) % coincidencias.length);
    },
    [coincidencias.length],
  );

  // Ctrl+F unificado: el mismo gesto en cualquier formato.
  useEffect(() => {
    const teclado = (evento: KeyboardEvent): void => {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'f') {
        evento.preventDefault();
        abrirPanel('buscar');
        setTimeout(() => campoDentro.current?.focus(), 0);
        return;
      }
      if (evento.key === 'Escape' && panel !== 'ninguno') {
        evento.preventDefault();
        cerrarPanel();
        return;
      }
      if (evento.key === 'F3') {
        evento.preventDefault();
        mover(evento.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener('keydown', teclado);
    return () => {
      window.removeEventListener('keydown', teclado);
    };
  }, [abrirPanel, cerrarPanel, mover, panel]);

  // --- Relacionados ----------------------------------------------------------

  useEffect(() => {
    if (ficha === null) {
      setRelacionados([]);
      return;
    }
    window.vestigio
      .relacionados(ficha.id)
      .then(setRelacionados)
      .catch(() => {
        setRelacionados([]);
      });
  }, [ficha]);

  // --- Progreso y recientes (tarea 7) ---------------------------------------

  const guardarProgreso = useCallback(
    (localizador: string, pagina: number | null, porcentaje: number, referencia: string | null) => {
      if (ficha === null) return;
      void personal.aplicar({
        operacion: 'progreso-guardar',
        recursoId: ficha.id,
        localizador,
        porcentaje: Math.min(100, Math.max(0, porcentaje)),
        ...(pagina !== null ? { pagina } : {}),
        ...(referencia !== null ? { fallbackTexto: referencia.slice(0, 200) } : {}),
      });
    },
    [ficha, personal],
  );

  // Solo al abrir el documento, no en cada cambio de seccion: registrar mas a
  // menudo llenaria la lista de ruido y escribiria en disco sin motivo. Por
  // eso la dependencia es el identificador, no la ficha ni el destino.
  const idAbierto = ficha?.id ?? null;
  const registrarReciente = useRef(personal.aplicar);
  registrarReciente.current = personal.aplicar;

  useEffect(() => {
    if (idAbierto === null) return;
    void registrarReciente.current({ operacion: 'reciente-registrar', recursoId: idAbierto });
  }, [idAbierto]);

  // --- Cita e identificacion de la version (tarea 6) -------------------------

  const cita = useMemo(() => {
    if (ficha === null) {
      return `«${contenido.clase === 'zim' ? contenido.articulo.titulo : ''}». Colección ${
        contenido.clase === 'zim' ? contenido.articulo.libro : ''
      }, consultada sin conexión en Vestigio.`;
    }
    const partes = [
      ficha.autor ?? 'Autoría sin determinar',
      `«${ficha.titulo}»`,
      ficha.fechaPublicacion ?? 's. f.',
      `${etiquetaFormato(ficha.formato)}, ${ficha.origenSha256 !== null ? `SHA-256 ${ficha.origenSha256.slice(0, 16)}…` : 'sin huella'}`,
      `Vestigio, edición del corpus ${edicionCorpus ?? 'sin declarar'}`,
    ];
    return `${partes.join('. ')}.`;
  }, [ficha, contenido, edicionCorpus]);

  const copiar = useCallback((texto: string, que: string) => {
    void navigator.clipboard
      .writeText(texto)
      .then(() => {
        setCopiado(`${que} copiado al portapapeles`);
      })
      .catch(() => {
        setCopiado('no se pudo copiar');
      });
    setTimeout(() => {
      setCopiado(null);
    }, 4000);
  }, []);

  // --- Acciones personales ---------------------------------------------------

  const favorito = ficha !== null && personal.esFavorito(ficha.id);
  const marcadores = ficha !== null ? personal.marcadoresDe(ficha.id) : [];
  const notas = ficha !== null ? personal.notasDe(ficha.id) : [];
  const anclaActual = coincidenciaActual?.localizador ?? destino.localizador;
  const marcadoAqui = anclaActual !== null && marcadores.some((m) => m.localizador === anclaActual);

  if (contenido.clase === 'zim') {
    return (
      <article className="lector" style={control.estilo}>
        <header className="cabecera-lector">
          <div className="cabecera-lector-titulo">
            <p className="etiqueta">colección · {contenido.articulo.libro}</p>
            <h1 className="titulo-obra">{contenido.articulo.titulo}</h1>
          </div>
          <div className="barra-lector" role="toolbar" aria-label="Herramientas de lectura">
            <button
              type="button"
              className="boton-barra"
              onClick={() => {
                copiar(cita, 'la referencia');
              }}
            >
              copiar cita
            </button>
            <button type="button" className="boton-barra" onClick={alCerrar}>
              cerrar
            </button>
          </div>
        </header>
        <p className="aviso-sutil">
          Este artículo procede de una colección completa, no del catálogo de Vestigio. Se muestra
          aislado, sin scripts y sin salida a Internet; su contenido no ha pasado por la ingesta ni
          tiene ficha propia.
        </p>
        {copiado !== null && (
          <p className="aviso-sutil" role="status">
            {copiado}
          </p>
        )}
        <VisorZim articulo={contenido.articulo} />
      </article>
    );
  }

  if (ficha === null) return <p className="etiqueta">abriendo…</p>;

  const indice = ficha.segmentos.filter((s) => s.titulo !== null && s.titulo.length > 0);

  return (
    <article
      className="lector"
      style={control.estilo}
      data-superficie={control.preferencias.superficie}
    >
      <header className="cabecera-lector">
        <div className="cabecera-lector-titulo">
          <p className="etiqueta">
            {etiquetaFormato(ficha.formato)}
            {' · '}
            {ficha.idioma === 'und' ? 'idioma sin determinar' : etiquetaIdioma(ficha.idioma)}
            {' · edición '}
            {edicionCorpus ?? 'sin declarar'}
          </p>
          <h1 className="titulo-obra">{ficha.titulo}</h1>
          <p className="lema">{ficha.autor ?? 'autoría sin determinar'}</p>
        </div>

        <div className="barra-lector" role="toolbar" aria-label="Herramientas de lectura">
          <button
            type="button"
            className={panel === 'buscar' ? 'boton-barra activo' : 'boton-barra'}
            aria-pressed={panel === 'buscar'}
            onClick={() => {
              abrirPanel('buscar');
              setTimeout(() => campoDentro.current?.focus(), 0);
            }}
          >
            buscar dentro
          </button>
          <button
            type="button"
            className={panel === 'preferencias' ? 'boton-barra activo' : 'boton-barra'}
            aria-pressed={panel === 'preferencias'}
            onClick={() => {
              abrirPanel('preferencias');
            }}
          >
            lectura
          </button>
          <button
            type="button"
            className={panel === 'notas' ? 'boton-barra activo' : 'boton-barra'}
            aria-pressed={panel === 'notas'}
            onClick={() => {
              abrirPanel('notas');
            }}
          >
            notas{notas.length > 0 ? ` (${String(notas.length)})` : ''}
          </button>
          <button
            type="button"
            className={favorito ? 'boton-barra activo' : 'boton-barra'}
            aria-pressed={favorito}
            onClick={() => {
              void personal.aplicar({
                operacion: favorito ? 'favorito-quitar' : 'favorito-poner',
                recursoId: ficha.id,
              });
            }}
          >
            {favorito ? 'guardado' : 'guardar'}
          </button>
          <button
            type="button"
            className={marcadoAqui ? 'boton-barra activo' : 'boton-barra'}
            disabled={anclaActual === null}
            aria-pressed={marcadoAqui}
            onClick={() => {
              if (anclaActual === null) return;
              void personal.aplicar(
                marcadoAqui
                  ? {
                      operacion: 'marcador-quitar',
                      recursoId: ficha.id,
                      localizador: anclaActual,
                    }
                  : {
                      operacion: 'marcador-poner',
                      id: nuevoId(),
                      recursoId: ficha.id,
                      localizador: anclaActual,
                      etiqueta:
                        ficha.segmentos.find((s) => s.localizador === anclaActual)?.titulo ??
                        anclaActual,
                    },
              );
            }}
          >
            {marcadoAqui ? 'marcado' : 'marcar aquí'}
          </button>
          <button
            type="button"
            className="boton-barra"
            onClick={() => {
              copiar(cita, 'la referencia');
            }}
          >
            copiar cita
          </button>
          <button type="button" className="boton-barra" onClick={alCerrar}>
            cerrar
          </button>
        </div>
      </header>

      {/* Honestidad sobre lo que se esta viendo (tarea 4). */}
      {estadoPreocupante(ficha.estadoTexto) && (
        <p className="aviso" role="status">
          {etiquetaEstadoTexto(ficha.estadoTexto)}. {DETALLE_ESTADO_TEXTO[ficha.estadoTexto] ?? ''}
        </p>
      )}
      {destino.via === 'por-texto' && (
        <p className="aviso-sutil" role="status">
          El punto exacto donde lo dejaste ya no existe en esta edición. Vestigio te ha llevado al
          sitio más parecido buscando el texto que había guardado.
        </p>
      )}
      {destino.via === 'perdido' && (
        <p className="aviso-sutil" role="status">
          Habías dejado una marca en este documento, pero la edición ha cambiado y no hay forma
          honesta de saber dónde estaba. Empiezas desde el principio.
        </p>
      )}
      {copiado !== null && (
        <p className="aviso-sutil" role="status">
          {copiado}
        </p>
      )}

      {panel === 'buscar' && (
        <section className="panel-lector" aria-label="Buscar dentro del documento">
          <div className="linea-buscar">
            <label className="solo-lectores" htmlFor="buscar-dentro">
              Buscar dentro de este documento
            </label>
            <input
              id="buscar-dentro"
              ref={campoDentro}
              type="search"
              className="campo-texto"
              placeholder="buscar dentro del documento…"
              value={dentro}
              onChange={(e) => {
                setDentro(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  mover(e.shiftKey ? -1 : 1);
                }
              }}
            />
            <button
              type="button"
              className="boton-barra"
              onClick={() => {
                mover(-1);
              }}
              disabled={coincidencias.length === 0}
            >
              anterior
            </button>
            <button
              type="button"
              className="boton-barra"
              onClick={() => {
                mover(1);
              }}
              disabled={coincidencias.length === 0}
            >
              siguiente
            </button>
            <span className="valor" role="status" aria-live="polite">
              {dentro.trim().length === 0
                ? ''
                : coincidencias.length === 0
                  ? 'sin coincidencias'
                  : `${String(indiceCoincidencia + 1)} de ${String(coincidencias.length)}`}
            </span>
            <button type="button" className="boton-barra" onClick={cerrarPanel}>
              cerrar
            </button>
          </div>
          {coincidenciaActual !== null && (
            <p className="resultado-fragmento">
              <Fragmento texto={coincidenciaActual.fragmento} />
            </p>
          )}
        </section>
      )}

      {panel === 'preferencias' && (
        <section className="panel-lector" aria-label="Preferencias de lectura">
          <div className="filas-preferencias">
            <div className="preferencia">
              <span className="etiqueta">Tamaño</span>
              <button
                type="button"
                className="boton-barra"
                onClick={() => {
                  control.ajustar('tamano', -1);
                }}
                disabled={control.preferencias.tamano <= LIMITES_PREFERENCIAS.tamano.min}
              >
                menos
              </button>
              <span className="valor">{control.preferencias.tamano} px</span>
              <button
                type="button"
                className="boton-barra"
                onClick={() => {
                  control.ajustar('tamano', 1);
                }}
                disabled={control.preferencias.tamano >= LIMITES_PREFERENCIAS.tamano.max}
              >
                más
              </button>
            </div>
            <div className="preferencia">
              <span className="etiqueta">Ancho</span>
              <button
                type="button"
                className="boton-barra"
                onClick={() => {
                  control.ajustar('ancho', -1);
                }}
              >
                estrecho
              </button>
              <span className="valor">{control.preferencias.ancho} caracteres</span>
              <button
                type="button"
                className="boton-barra"
                onClick={() => {
                  control.ajustar('ancho', 1);
                }}
              >
                ancho
              </button>
            </div>
            <div className="preferencia">
              <span className="etiqueta">Interlineado</span>
              <button
                type="button"
                className="boton-barra"
                onClick={() => {
                  control.ajustar('interlineado', -1);
                }}
              >
                junto
              </button>
              <span className="valor">{control.preferencias.interlineado.toFixed(1)}</span>
              <button
                type="button"
                className="boton-barra"
                onClick={() => {
                  control.ajustar('interlineado', 1);
                }}
              >
                suelto
              </button>
            </div>
            <div className="preferencia">
              <span className="etiqueta">Letra</span>
              <button
                type="button"
                className={control.preferencias.voz === 'serif' ? 'chip activo' : 'chip'}
                aria-pressed={control.preferencias.voz === 'serif'}
                onClick={() => {
                  control.cambiar({ voz: 'serif' });
                }}
              >
                serif
              </button>
              <button
                type="button"
                className={control.preferencias.voz === 'sans' ? 'chip activo' : 'chip'}
                aria-pressed={control.preferencias.voz === 'sans'}
                onClick={() => {
                  control.cambiar({ voz: 'sans' });
                }}
              >
                sin serif
              </button>
            </div>
            <div className="preferencia">
              <span className="etiqueta">Superficie</span>
              <button
                type="button"
                className={control.preferencias.superficie === 'penumbra' ? 'chip activo' : 'chip'}
                aria-pressed={control.preferencias.superficie === 'penumbra'}
                onClick={() => {
                  control.cambiar({ superficie: 'penumbra' });
                }}
              >
                penumbra
              </button>
              <button
                type="button"
                className={control.preferencias.superficie === 'papel' ? 'chip activo' : 'chip'}
                aria-pressed={control.preferencias.superficie === 'papel'}
                onClick={() => {
                  control.cambiar({ superficie: 'papel' });
                }}
              >
                papel
              </button>
            </div>
          </div>
          <button
            type="button"
            className="boton-secundario"
            onClick={control.restaurar}
            disabled={control.sonDeFabrica}
          >
            Volver a los valores de fábrica
          </button>
        </section>
      )}

      {panel === 'notas' && (
        <section className="panel-lector" aria-label="Notas de este documento">
          {personal.temporal && (
            <p className="aviso-sutil">
              Soporte de solo lectura: lo que escribas aquí desaparece al cerrar Vestigio.
            </p>
          )}
          {notas.length === 0 && <p className="aviso-sutil">Todavía no hay notas.</p>}
          {notas.map((nota) => (
            <article className="nota" key={nota.id}>
              <p className="nota-texto">{nota.texto}</p>
              <p className="nota-pie">
                {nota.pagina !== null
                  ? `página ${String(nota.pagina)}`
                  : (nota.segmento ?? 'documento entero')}
                <button
                  type="button"
                  className="enlace-sutil"
                  onClick={() => {
                    void personal.aplicar({ operacion: 'nota-borrar', id: nota.id });
                  }}
                >
                  borrar
                </button>
              </p>
            </article>
          ))}
          <form
            className="formulario-nota"
            onSubmit={(e) => {
              e.preventDefault();
              const texto = notaNueva.trim();
              if (texto.length === 0) return;
              const seccion = ficha.segmentos.find((s) => s.localizador === anclaActual);
              void personal
                .aplicar({
                  operacion: 'nota-crear',
                  id: nuevoId(),
                  destinoTipo: anclaActual === null ? 'recurso' : 'segmento',
                  recursoId: ficha.id,
                  ...(anclaActual !== null ? { segmento: anclaActual } : {}),
                  ...(seccion?.pagina != null ? { pagina: seccion.pagina } : {}),
                  ...(seccion !== undefined ? { contexto: seccion.cuerpo.slice(0, 200) } : {}),
                  texto,
                })
                .then((ok) => {
                  if (ok) setNotaNueva('');
                });
            }}
          >
            <label className="solo-lectores" htmlFor="nota-lector">
              Escribir una nota aquí
            </label>
            <textarea
              id="nota-lector"
              className="campo-nota"
              rows={3}
              maxLength={20000}
              placeholder={
                anclaActual === null
                  ? 'una nota sobre este documento…'
                  : 'una nota sobre esta sección…'
              }
              value={notaNueva}
              onChange={(e) => {
                setNotaNueva(e.target.value);
              }}
            />
            <button
              type="submit"
              className="boton-secundario"
              disabled={notaNueva.trim().length === 0}
            >
              Guardar nota
            </button>
          </form>
        </section>
      )}

      <div className="superficie-lectura">
        {indice.length > 1 && (
          <nav className="indice" aria-label="Índice del documento">
            <p className="etiqueta">Índice</p>
            <ol>
              {indice.map((segmento) => (
                <li
                  key={segmento.localizador}
                  style={{ marginLeft: `${String(((segmento.nivel ?? 2) - 2) * 12)}px` }}
                >
                  <a href={`#${segmento.localizador}`}>{segmento.titulo}</a>
                </li>
              ))}
            </ol>
            {marcadores.length > 0 && (
              <>
                <p className="etiqueta">Tus marcadores</p>
                <ul className="lista-simple">
                  {marcadores.map((marcador) => (
                    <li key={marcador.id}>
                      <a href={`#${marcador.localizador}`}>
                        {marcador.etiqueta ?? marcador.localizador}
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </nav>
        )}

        {ficha.formato === 'imagen' ? (
          <LectorImagen ficha={ficha} />
        ) : ficha.formato === 'pdf' ? (
          <LectorPdf
            ficha={ficha}
            paginaDestino={coincidenciaActual?.pagina ?? paginaDestino}
            alCambiarPagina={(pagina, total) => {
              const segmento = ficha.segmentos.find((s) => s.pagina === pagina);
              guardarProgreso(
                segmento?.localizador ?? `p${String(pagina)}`,
                pagina,
                total > 0 ? (pagina / total) * 100 : 0,
                segmento?.cuerpo ?? null,
              );
            }}
          />
        ) : (
          <LectorTexto
            ficha={ficha}
            localizadorDestino={coincidenciaActual?.localizador ?? destino.localizador}
            alLeerSeccion={(localizador, porcentaje) => {
              const segmento = ficha.segmentos.find((s) => s.localizador === localizador);
              guardarProgreso(
                localizador,
                segmento?.pagina ?? null,
                porcentaje,
                segmento?.cuerpo ?? null,
              );
            }}
          />
        )}
      </div>

      {relacionados.length > 0 && (
        <section className="panel" aria-label="Documentos relacionados">
          <p className="etiqueta">Al terminar, quizá</p>
          {relacionados.slice(0, 5).map((relacionado) => (
            <button
              type="button"
              className="fila fila-pulsable"
              key={relacionado.id}
              onClick={() => {
                alAbrirFicha(relacionado.id);
              }}
            >
              <span className="nombre">{relacionado.titulo}</span>
              <span className="valor">
                {etiquetaFormato(relacionado.formato)} · {relacionado.motivo}
              </span>
            </button>
          ))}
        </section>
      )}
    </article>
  );
}
