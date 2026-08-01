// Mi espacio (bloque 12, tareas 5-8): todo lo que Daniel ha puesto de su
// parte, en un sitio del que se puede sacar y al que se puede devolver.
//
// Aqui viven las dos operaciones que hacen que el espacio personal sea
// realmente suyo: exportarlo a un paquete que se lee sin Vestigio, e
// importar uno comprobandolo antes de tocar nada.

import { useCallback, useEffect, useState } from 'react';
import type {
  InspeccionPaqueteUI,
  NotaUI,
  RecursoResumenUI,
  ResultadoExportacionUI,
} from '../comun/estado';
import type { EspacioPersonal } from './personal';
import { nuevoId } from './personal';
import { fechaYHoraLegible, tamanoLegible } from './etiquetas';

interface Props {
  personal: EspacioPersonal;
  biblioteca: RecursoResumenUI[];
  alAbrirFicha: (recursoId: string) => void;
}

export function VistaMiEspacio({ personal, biblioteca, alAbrirFicha }: Props): React.JSX.Element {
  const [consultaNotas, setConsultaNotas] = useState('');
  const [notasEncontradas, setNotasEncontradas] = useState<NotaUI[] | null>(null);
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
  const [nombreColeccion, setNombreColeccion] = useState('');
  const [exportacion, setExportacion] = useState<ResultadoExportacionUI | null>(null);
  const [inspeccion, setInspeccion] = useState<InspeccionPaqueteUI | null>(null);
  const [importacion, setImportacion] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const { espacio } = personal;
  const porId = new Map(biblioteca.map((r) => [r.id, r]));
  const nombrar = (recursoId: string): string =>
    porId.get(recursoId)?.titulo ?? 'documento que ya no está en el catálogo';

  // La busqueda de notas se resuelve en el servicio (normaliza igual que el
  // buscador de la biblioteca); en sesion temporal se filtra en memoria.
  useEffect(() => {
    const aguja = consultaNotas.trim();
    if (aguja.length === 0) {
      setNotasEncontradas(null);
      return;
    }
    if (personal.temporal) {
      const minuscula = aguja.toLowerCase();
      setNotasEncontradas(espacio.notas.filter((n) => n.texto.toLowerCase().includes(minuscula)));
      return;
    }
    const temporizador = setTimeout(() => {
      window.vestigio
        .buscarNotas(aguja)
        .then(setNotasEncontradas)
        .catch(() => {
          setNotasEncontradas([]);
        });
    }, 200);
    return () => {
      clearTimeout(temporizador);
    };
  }, [consultaNotas, personal.temporal, espacio.notas]);

  const notasVisibles = notasEncontradas ?? espacio.notas;

  const exportar = useCallback(() => {
    setTrabajando(true);
    setExportacion(null);
    window.vestigio
      .exportarEspacio()
      .then(setExportacion)
      .catch((error: unknown) => {
        setExportacion({
          ok: false,
          ruta: null,
          bytes: null,
          cancelado: false,
          mensaje: error instanceof Error ? error.message : 'no se pudo exportar',
        });
      })
      .finally(() => {
        setTrabajando(false);
      });
  }, []);

  const elegirPaquete = useCallback(() => {
    setTrabajando(true);
    setImportacion(null);
    window.vestigio
      .elegirPaquete()
      .then(setInspeccion)
      .catch(() => {
        setInspeccion(null);
      })
      .finally(() => {
        setTrabajando(false);
      });
  }, []);

  const adoptar = useCallback(
    (modo: 'fusionar' | 'reemplazar') => {
      setTrabajando(true);
      window.vestigio
        .adoptarPaquete(modo)
        .then((resultado) => {
          setImportacion(
            resultado.ok
              ? `Importado: ${String(resultado.filas)} registros ${modo === 'fusionar' ? 'añadidos a lo que ya tenías' : 'sustituyen a lo que había'}.`
              : (resultado.mensaje ?? 'no se pudo importar'),
          );
          if (resultado.ok) setInspeccion(null);
          personal.recargar();
        })
        .catch((error: unknown) => {
          setImportacion(error instanceof Error ? error.message : 'no se pudo importar');
        })
        .finally(() => {
          setTrabajando(false);
        });
    },
    [personal],
  );

  /** Unica salida de lo apuntado cuando no hay dónde guardarlo. */
  const copiarApuntes = (): void => {
    const lineas = [
      '# Apuntes de esta sesión de Vestigio',
      '',
      ...espacio.notas.map((n) => `- ${nombrar(n.recursoId)}: ${n.texto}`),
      ...espacio.favoritos.map((f) => `- Guardado: ${nombrar(f)}`),
    ];
    void navigator.clipboard.writeText(lineas.join('\n'));
    setImportacion('Apuntes copiados al portapapeles. Pégalos donde quieras conservarlos.');
  };

  return (
    <>
      <header className="cabecera-ficha">
        <h1 className="titulo-obra">Mi espacio</h1>
        <p className="lema">Lo tuyo: favoritos, colecciones, notas y copias</p>
        {personal.temporal && (
          <p className="aviso">
            {espacio.motivo ?? 'No hay dónde guardar en este momento.'} Lo que apuntes ahora vive
            solo en la memoria de esta sesión.
          </p>
        )}
      </header>

      <section className="panel" aria-label="Favoritos">
        <p className="etiqueta">Favoritos · {String(espacio.favoritos.length)}</p>
        {espacio.favoritos.length === 0 ? (
          <p className="aviso-sutil">
            Nada guardado todavía. En la ficha de cualquier documento hay un botón para guardarlo.
          </p>
        ) : (
          espacio.favoritos.map((recursoId) => (
            <div className="fila" key={recursoId}>
              <button
                type="button"
                className="enlace-titulo"
                onClick={() => {
                  alAbrirFicha(recursoId);
                }}
              >
                {nombrar(recursoId)}
              </button>
              <button
                type="button"
                className="enlace-sutil"
                onClick={() => {
                  void personal.aplicar({ operacion: 'favorito-quitar', recursoId });
                }}
              >
                quitar
              </button>
            </div>
          ))
        )}
      </section>

      {!personal.temporal && (
        <section className="panel" aria-label="Colecciones">
          <p className="etiqueta">Colecciones · {String(espacio.colecciones.length)}</p>
          <p className="aviso-sutil">
            Listas tuyas para agrupar documentos como te convenga. No tienen nada que ver con las
            colecciones ZIM de la biblioteca.
          </p>
          {espacio.colecciones.map((coleccion) => (
            <details className="coleccion" key={coleccion.id}>
              <summary>
                {coleccion.nombre} · {String(coleccion.elementos)}{' '}
                {coleccion.elementos === 1 ? 'documento' : 'documentos'}
              </summary>
              {coleccion.recursos.length === 0 && <p className="aviso-sutil">Vacía por ahora.</p>}
              {coleccion.recursos.map((recursoId) => (
                <div className="fila" key={recursoId}>
                  <button
                    type="button"
                    className="enlace-titulo"
                    onClick={() => {
                      alAbrirFicha(recursoId);
                    }}
                  >
                    {nombrar(recursoId)}
                  </button>
                  <button
                    type="button"
                    className="enlace-sutil"
                    onClick={() => {
                      void personal.aplicar({
                        operacion: 'coleccion-quitar',
                        coleccionId: coleccion.id,
                        recursoId,
                      });
                    }}
                  >
                    quitar
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="boton-secundario"
                onClick={() => {
                  void personal.aplicar({ operacion: 'coleccion-borrar', id: coleccion.id });
                }}
              >
                Borrar la colección
              </button>
            </details>
          ))}
          <form
            className="formulario-en-linea"
            onSubmit={(e) => {
              e.preventDefault();
              const nombre = nombreColeccion.trim();
              if (nombre.length === 0) return;
              void personal
                .aplicar({ operacion: 'coleccion-crear', id: nuevoId(), nombre })
                .then((ok) => {
                  if (ok) setNombreColeccion('');
                });
            }}
          >
            <label className="solo-lectores" htmlFor="coleccion-nueva">
              Nombre de la colección nueva
            </label>
            <input
              id="coleccion-nueva"
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
              Crear
            </button>
          </form>
        </section>
      )}

      <section className="panel" aria-label="Notas">
        <p className="etiqueta">Notas · {String(espacio.notas.length)}</p>
        <input
          type="search"
          className="campo-texto ancho-total"
          placeholder="buscar entre tus notas…"
          value={consultaNotas}
          onChange={(e) => {
            setConsultaNotas(e.target.value);
          }}
          aria-label="Buscar entre tus notas"
        />
        {notasVisibles.length === 0 && (
          <p className="aviso-sutil">
            {consultaNotas.trim().length > 0
              ? 'Ninguna nota tuya dice eso.'
              : 'Todavía no has escrito ninguna nota.'}
          </p>
        )}
        {notasVisibles.map((nota) => (
          <article className="nota" key={nota.id}>
            {editando?.id === nota.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const texto = editando.texto.trim();
                  if (texto.length === 0) return;
                  void personal
                    .aplicar({ operacion: 'nota-editar', id: nota.id, texto })
                    .then((ok) => {
                      if (ok) setEditando(null);
                    });
                }}
              >
                <label className="solo-lectores" htmlFor={`editar-${nota.id}`}>
                  Editar la nota
                </label>
                <textarea
                  id={`editar-${nota.id}`}
                  className="campo-nota"
                  rows={3}
                  maxLength={20000}
                  value={editando.texto}
                  onChange={(e) => {
                    setEditando({ id: nota.id, texto: e.target.value });
                  }}
                />
                <button type="submit" className="boton-secundario">
                  Guardar
                </button>
                <button
                  type="button"
                  className="enlace-sutil"
                  onClick={() => {
                    setEditando(null);
                  }}
                >
                  cancelar
                </button>
              </form>
            ) : (
              <>
                <p className="nota-texto">{nota.texto}</p>
                <p className="nota-pie">
                  <button
                    type="button"
                    className="enlace-titulo"
                    onClick={() => {
                      alAbrirFicha(nota.recursoId);
                    }}
                  >
                    {nombrar(nota.recursoId)}
                  </button>
                  {' · '}
                  {nota.pagina !== null
                    ? `página ${String(nota.pagina)}`
                    : (nota.segmento ?? 'documento entero')}
                  {' · '}
                  {fechaYHoraLegible(nota.modificada ?? nota.creada)}
                  <button
                    type="button"
                    className="enlace-sutil"
                    onClick={() => {
                      setEditando({ id: nota.id, texto: nota.texto });
                    }}
                  >
                    editar
                  </button>
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
              </>
            )}
          </article>
        ))}
      </section>

      {espacio.marcadores.length > 0 && (
        <section className="panel" aria-label="Marcadores">
          <p className="etiqueta">Marcadores · {String(espacio.marcadores.length)}</p>
          {espacio.marcadores.map((marcador) => (
            <div className="fila" key={marcador.id}>
              <button
                type="button"
                className="enlace-titulo"
                onClick={() => {
                  alAbrirFicha(marcador.recursoId);
                }}
              >
                {nombrar(marcador.recursoId)}
              </button>
              <span className="valor">{marcador.etiqueta ?? marcador.localizador}</span>
            </div>
          ))}
        </section>
      )}

      {espacio.papelera.length > 0 && (
        <section className="panel" aria-label="Papelera">
          <p className="etiqueta">Papelera · {String(espacio.papelera.length)}</p>
          <p className="aviso-sutil">
            Lo que has borrado sigue aquí hasta que vacíes la papelera a propósito. Nada se pierde
            por un clic de más.
          </p>
          {espacio.papelera.map((entrada) => (
            <div className="fila" key={entrada.id}>
              <span className="nombre">{entrada.descripcion}</span>
              <button
                type="button"
                className="enlace-sutil"
                onClick={() => {
                  void personal.aplicar({ operacion: 'papelera-restaurar', id: entrada.id });
                }}
              >
                deshacer
              </button>
            </div>
          ))}
          <button
            type="button"
            className="boton-secundario"
            onClick={() => {
              void personal.aplicar({ operacion: 'papelera-vaciar' });
            }}
          >
            Vaciar la papelera (esto ya no se deshace)
          </button>
        </section>
      )}

      <section className="panel" aria-label="Copias de tu espacio">
        <p className="etiqueta">Copias y traslados</p>

        {personal.temporal ? (
          <>
            <p className="aviso-sutil">
              En un soporte de solo lectura no hay nada guardado que copiar. Lo que has apuntado en
              esta sesión puedes llevártelo al portapapeles antes de cerrar.
            </p>
            <button type="button" className="boton-secundario" onClick={copiarApuntes}>
              Copiar mis apuntes de esta sesión
            </button>
          </>
        ) : (
          <>
            <p className="aviso-sutil">
              Un paquete es un ZIP corriente con tu espacio en dos formas: una copia de la base y
              los mismos datos en texto plano, legibles con el Bloc de notas o Excel aunque Vestigio
              no exista.
            </p>
            <div className="acciones-ficha">
              <button
                type="button"
                className="boton-principal"
                onClick={exportar}
                disabled={trabajando}
              >
                Guardar una copia de mi espacio
              </button>
              <button
                type="button"
                className="boton-secundario"
                onClick={elegirPaquete}
                disabled={trabajando}
              >
                Recuperar desde una copia
              </button>
            </div>

            {exportacion !== null && !exportacion.cancelado && (
              <p className={exportacion.ok ? 'aviso-sutil' : 'aviso'} role="status">
                {exportacion.ok
                  ? `Copia guardada en ${exportacion.ruta ?? ''} (${tamanoLegible(exportacion.bytes)}).`
                  : (exportacion.mensaje ?? 'no se pudo guardar la copia')}
                {exportacion.ok && exportacion.mensaje !== null && ` ${exportacion.mensaje}`}
              </p>
            )}

            {inspeccion !== null && !inspeccion.cancelado && (
              <div className="bloque-importacion">
                {inspeccion.ok ? (
                  <>
                    <p className="aviso-sutil" role="status">
                      Paquete comprobado: creado el {fechaYHoraLegible(inspeccion.generado) ?? '—'}{' '}
                      con Vestigio {inspeccion.app ?? '—'}. Contiene{' '}
                      {String(inspeccion.resumen?.notas ?? 0)} notas,{' '}
                      {String(inspeccion.resumen?.favoritos ?? 0)} favoritos y{' '}
                      {String(inspeccion.resumen?.colecciones ?? 0)} colecciones. Todavía no se ha
                      tocado nada tuyo.
                    </p>
                    {inspeccion.avisos.map((aviso) => (
                      <p className="aviso-sutil" key={aviso}>
                        {aviso}
                      </p>
                    ))}
                    <div className="acciones-ficha">
                      <button
                        type="button"
                        className="boton-secundario"
                        onClick={() => {
                          adoptar('fusionar');
                        }}
                        disabled={trabajando}
                      >
                        Añadir a lo que ya tengo
                      </button>
                      <button
                        type="button"
                        className="boton-secundario"
                        onClick={() => {
                          adoptar('reemplazar');
                        }}
                        disabled={trabajando}
                      >
                        Sustituir todo lo mío por esto
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="aviso" role="status">
                      Ese paquete no se puede usar. Tus datos actuales no se han tocado.
                    </p>
                    <ul className="lista-simple">
                      {inspeccion.problemas.map((problema) => (
                        <li key={problema}>{problema}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            {importacion !== null && (
              <p className="aviso-sutil" role="status">
                {importacion}
              </p>
            )}
          </>
        )}
      </section>
    </>
  );
}
