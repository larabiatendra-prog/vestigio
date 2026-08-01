// Ficha de recurso (bloque 10, tareas 4 y 5).
//
// Bajo la enmienda E1 la ficha NO es un formulario editorial relleno a mano:
// muestra por separado cada eje que la ingesta pudo averiguar y declara sin
// rodeos lo que no se sabe. Un campo ausente se dice, no se disimula con un
// guion ni se rellena con una suposicion.

import { useEffect, useState } from 'react';
import type { FichaUI, RelacionadoUI } from '../comun/estado';
import type { EspacioPersonal } from './personal';
import { nuevoId } from './personal';
import {
  DETALLE_ESTADO_TEXTO,
  ETIQUETAS_DERECHOS,
  EXPLICACION_DERECHOS,
  etiquetaEstadoTexto,
  etiquetaFormato,
  etiquetaIdioma,
  fechaLegible,
  tamanoLegible,
} from './etiquetas';

interface Props {
  ficha: FichaUI;
  personal: EspacioPersonal;
  alLeer: () => void;
  alAbrirFicha: (recursoId: string) => void;
}

interface Eje {
  nombre: string;
  valor: string | null;
  /** Lo que se dice cuando el valor no existe: honestidad explicita. */
  ausente: string;
  detalle?: string | undefined;
}

function Ejes({ ejes }: { ejes: Eje[] }): React.JSX.Element {
  return (
    <dl className="ejes">
      {ejes.map((eje) => (
        <div className="eje" key={eje.nombre}>
          <dt>{eje.nombre}</dt>
          <dd className={eje.valor === null ? 'eje-ausente' : undefined}>
            {eje.valor ?? eje.ausente}
            {eje.detalle !== undefined && <span className="eje-detalle">{eje.detalle}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function VistaFicha({ ficha, personal, alLeer, alAbrirFicha }: Props): React.JSX.Element {
  const [relacionados, setRelacionados] = useState<RelacionadoUI[]>([]);
  const [notaNueva, setNotaNueva] = useState('');
  const [nombreColeccion, setNombreColeccion] = useState('');
  const [mostrarColecciones, setMostrarColecciones] = useState(false);

  useEffect(() => {
    window.vestigio
      .relacionados(ficha.id)
      .then(setRelacionados)
      .catch(() => {
        setRelacionados([]);
      });
  }, [ficha.id]);

  const favorito = personal.esFavorito(ficha.id);
  const notas = personal.notasDe(ficha.id);
  const marcadores = personal.marcadoresDe(ficha.id);
  const progreso = personal.progresoDe(ficha.id);
  const enColecciones = personal.coleccionesCon(ficha.id);

  const guardarNota = (): void => {
    const texto = notaNueva.trim();
    if (texto.length === 0) return;
    void personal
      .aplicar({
        operacion: 'nota-crear',
        id: nuevoId(),
        destinoTipo: 'recurso',
        recursoId: ficha.id,
        texto,
      })
      .then((ok) => {
        if (ok) setNotaNueva('');
      });
  };

  return (
    <>
      <header className="cabecera-ficha">
        <p className="etiqueta">{etiquetaFormato(ficha.formato)}</p>
        <h1 className="titulo-obra">{ficha.titulo}</h1>
        <p className="lema">
          {ficha.autor ?? 'autoría sin determinar'}
          {' · '}
          {ficha.idioma === 'und' ? 'idioma sin determinar' : etiquetaIdioma(ficha.idioma)}
          {ficha.numPaginas !== null ? ` · ${String(ficha.numPaginas)} páginas` : ''}
        </p>
        {ficha.resumen !== null && ficha.resumen.length > 0 && (
          <p className="resumen-ficha">{ficha.resumen}</p>
        )}

        <div className="acciones-ficha">
          <button type="button" className="boton-principal" onClick={alLeer} data-ancla="leer">
            {progreso !== null ? 'Seguir leyendo' : 'Leer'}
          </button>
          <button
            type="button"
            className={favorito ? 'boton-secundario activo' : 'boton-secundario'}
            aria-pressed={favorito}
            onClick={() => {
              void personal.aplicar({
                operacion: favorito ? 'favorito-quitar' : 'favorito-poner',
                recursoId: ficha.id,
              });
            }}
          >
            {favorito ? 'Quitar de favoritos' : 'Guardar en favoritos'}
          </button>
          {!personal.temporal && (
            <button
              type="button"
              className="boton-secundario"
              aria-expanded={mostrarColecciones}
              onClick={() => {
                setMostrarColecciones((v) => !v);
              }}
            >
              Colecciones
              {enColecciones.length > 0 ? ` (${String(enColecciones.length)})` : ''}
            </button>
          )}
        </div>

        {progreso !== null && (
          <p className="aviso-sutil">
            Ibas por{' '}
            {progreso.pagina !== null
              ? `la página ${String(progreso.pagina)}`
              : (progreso.localizador ?? 'un punto que ya no existe')}
            {progreso.porcentaje !== null
              ? ` · ${String(Math.round(progreso.porcentaje))} % leído`
              : ''}
            .
          </p>
        )}
      </header>

      {mostrarColecciones && !personal.temporal && (
        <section className="panel" aria-label="Colecciones de este documento">
          <p className="etiqueta">Colecciones</p>
          {personal.espacio.colecciones.length === 0 && (
            <p className="aviso-sutil">
              Todavía no tienes colecciones. Crea la primera aquí abajo: son listas tuyas, no del
              catálogo.
            </p>
          )}
          {personal.espacio.colecciones.map((coleccion) => {
            const dentro = coleccion.recursos.includes(ficha.id);
            return (
              <div className="fila" key={coleccion.id}>
                <span className="nombre">{coleccion.nombre}</span>
                <button
                  type="button"
                  className={dentro ? 'chip activo' : 'chip'}
                  aria-pressed={dentro}
                  onClick={() => {
                    void personal.aplicar({
                      operacion: dentro ? 'coleccion-quitar' : 'coleccion-anadir',
                      coleccionId: coleccion.id,
                      recursoId: ficha.id,
                    });
                  }}
                >
                  {dentro ? 'quitar de aquí' : 'añadir aquí'}
                </button>
              </div>
            );
          })}
          <form
            className="formulario-en-linea"
            onSubmit={(e) => {
              e.preventDefault();
              const nombre = nombreColeccion.trim();
              if (nombre.length === 0) return;
              const id = nuevoId();
              void personal
                .aplicar({ operacion: 'coleccion-crear', id, nombre })
                .then(async (ok) => {
                  if (ok) {
                    await personal.aplicar({
                      operacion: 'coleccion-anadir',
                      coleccionId: id,
                      recursoId: ficha.id,
                    });
                    setNombreColeccion('');
                  }
                });
            }}
          >
            <label className="solo-lectores" htmlFor="nueva-coleccion">
              Nombre de la colección nueva
            </label>
            <input
              id="nueva-coleccion"
              type="text"
              className="campo-texto"
              placeholder="nueva colección…"
              maxLength={120}
              value={nombreColeccion}
              onChange={(e) => {
                setNombreColeccion(e.target.value);
              }}
            />
            <button type="submit" className="boton-secundario">
              Crear y añadir
            </button>
          </form>
        </section>
      )}

      <section className="panel" aria-label="Qué es este documento">
        <p className="etiqueta">Qué es</p>
        <Ejes
          ejes={[
            {
              nombre: 'Autoría',
              valor: ficha.autor,
              ausente: 'no consta en el documento y nadie la ha declarado',
            },
            {
              nombre: 'Publicación',
              valor: fechaLegible(ficha.fechaPublicacion),
              ausente: 'sin fecha conocida',
            },
            { nombre: 'Idioma', valor: etiquetaIdioma(ficha.idioma), ausente: 'sin determinar' },
            {
              nombre: 'Temas',
              valor: ficha.etiquetas.length > 0 ? ficha.etiquetas.join(', ') : null,
              ausente: 'sin etiquetar: la ingesta no dedujo temas y nadie los ha puesto a mano',
            },
            {
              nombre: 'Módulos',
              valor: ficha.modulos.length > 0 ? ficha.modulos.join(', ') : null,
              ausente: 'no asignado a ningún módulo de la matriz de cobertura',
            },
          ]}
        />
      </section>

      <section className="panel" aria-label="Qué se puede hacer con él">
        <p className="etiqueta">Estado del texto</p>
        <Ejes
          ejes={[
            {
              nombre: 'Extracción',
              valor: etiquetaEstadoTexto(ficha.estadoTexto),
              ausente: 'sin analizar',
              detalle: DETALLE_ESTADO_TEXTO[ficha.estadoTexto],
            },
            {
              nombre: 'Secciones',
              valor:
                ficha.numSegmentos > 0
                  ? `${String(ficha.numSegmentos)} ${ficha.numSegmentos === 1 ? 'sección' : 'secciones'} indexadas`
                  : null,
              ausente:
                'no hay texto indexado: este documento no aparecerá al buscar por su interior',
            },
          ]}
        />
        {ficha.detalleTexto !== null && <p className="aviso-sutil">{ficha.detalleTexto}</p>}
      </section>

      <section className="panel" aria-label="De dónde viene">
        <p className="etiqueta">Procedencia e integridad</p>
        <Ejes
          ejes={[
            {
              nombre: 'Origen',
              valor: ficha.origenUrl ?? ficha.origenAdquirido,
              ausente: 'no se registró de dónde salió este fichero',
            },
            {
              nombre: 'Formato',
              valor: `${etiquetaFormato(ficha.formato)} · ${tamanoLegible(ficha.bytes)}`,
              ausente: 'sin determinar',
            },
            {
              nombre: 'Huella SHA-256',
              valor: ficha.origenSha256,
              ausente: 'sin huella registrada',
              detalle:
                ficha.origenSha256 !== null
                  ? 'Si un solo byte del original cambiara, la verificación de la entrega lo detectaría.'
                  : undefined,
            },
            {
              nombre: 'Derechos',
              valor: ETIQUETAS_DERECHOS[ficha.derechos] ?? ficha.derechos,
              ausente: 'sin declarar',
              detalle: EXPLICACION_DERECHOS[ficha.derechos],
            },
          ]}
        />
        <p className="aviso-sutil">
          Vestigio no revisa editorialmente cada documento: lo que ves aquí es lo que se pudo
          averiguar solo. Juzga la fuente por lo que dice esta ficha, no por el hecho de estar en la
          biblioteca.
        </p>
      </section>

      <section className="panel" aria-label="Lo tuyo sobre este documento">
        <p className="etiqueta">
          Tus notas y marcadores
          {personal.temporal ? ' · solo en esta sesión' : ''}
        </p>

        {marcadores.length > 0 && (
          <ul className="lista-simple">
            {marcadores.map((marcador) => (
              <li key={marcador.id}>
                Marcador en {marcador.etiqueta ?? marcador.localizador}
                <button
                  type="button"
                  className="enlace-sutil"
                  onClick={() => {
                    void personal.aplicar({
                      operacion: 'marcador-quitar',
                      recursoId: marcador.recursoId,
                      localizador: marcador.localizador,
                    });
                  }}
                >
                  quitar
                </button>
              </li>
            ))}
          </ul>
        )}

        {notas.length === 0 && marcadores.length === 0 && (
          <p className="aviso-sutil">Todavía no has escrito nada sobre este documento.</p>
        )}

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
            guardarNota();
          }}
        >
          <label className="solo-lectores" htmlFor="nota-ficha">
            Escribir una nota sobre este documento
          </label>
          <textarea
            id="nota-ficha"
            className="campo-nota"
            rows={3}
            maxLength={20000}
            placeholder="escribe una nota sobre este documento…"
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

      {relacionados.length > 0 && (
        <section className="panel" aria-label="Documentos relacionados">
          <p className="etiqueta">También podría servirte</p>
          <p className="aviso-sutil">
            Vecinos por tema o módulo, deducidos del catálogo. No es una recomendación editorial:
            nadie ha dicho que uno sea mejor que otro.
          </p>
          {relacionados.map((relacionado) => (
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
    </>
  );
}
