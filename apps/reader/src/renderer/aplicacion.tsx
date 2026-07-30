import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CoincidenciaUI, EstadoAplicacion, FichaUI, RecursoResumenUI } from '../comun/estado';
import { LectorTexto } from './lector-texto';
import { LectorPdf } from './lector-pdf';

type Vista = { modo: 'biblioteca' } | { modo: 'lectura'; recursoId: string };

interface Destino {
  localizador: string | null;
  pagina: number | null;
}

const ETIQUETAS_ESTADO: Record<string, string> = {
  'texto-completo': 'texto completo',
  'texto-por-pagina': 'texto por página',
  'texto-parcial': 'texto parcial',
  'sin-texto-escaneado': 'escaneado, sin texto',
  cifrado: 'cifrado',
  ilegible: 'ilegible',
  'sin-texto': 'sin texto',
  desconocido: 'sin analizar',
};

/** Resalta los tramos que el buscador marco con [[ ]] sin insertar HTML. */
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

export function Aplicacion(): React.JSX.Element {
  const [estado, setEstado] = useState<EstadoAplicacion | null>(null);
  const [biblioteca, setBiblioteca] = useState<RecursoResumenUI[]>([]);
  const [consulta, setConsulta] = useState('');
  const [resultados, setResultados] = useState<CoincidenciaUI[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [vista, setVista] = useState<Vista>({ modo: 'biblioteca' });
  const [ficha, setFicha] = useState<FichaUI | null>(null);
  const [destino, setDestino] = useState<Destino>({ localizador: null, pagina: null });

  useEffect(() => {
    let activo = true;
    const consultarEstado = (): void => {
      window.vestigio
        .obtenerEstado()
        .then((e) => {
          if (activo) setEstado(e);
        })
        .catch(() => undefined);
    };
    consultarEstado();
    const intervalo = setInterval(consultarEstado, 5000);
    return () => {
      activo = false;
      clearInterval(intervalo);
    };
  }, []);

  useEffect(() => {
    window.vestigio
      .listarBiblioteca()
      .then(setBiblioteca)
      .catch(() => setBiblioteca([]));
  }, [estado?.versiones.corpus]);

  useEffect(() => {
    if (vista.modo !== 'lectura') {
      setFicha(null);
      return;
    }
    window.vestigio
      .obtenerFicha(vista.recursoId)
      .then(setFicha)
      .catch(() => setFicha(null));
  }, [vista]);

  const buscar = useCallback((texto: string) => {
    if (texto.trim().length === 0) {
      setResultados(null);
      return;
    }
    setBuscando(true);
    window.vestigio
      .buscar(texto)
      .then(setResultados)
      .catch(() => setResultados([]))
      .finally(() => setBuscando(false));
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      buscar(consulta);
    }, 200);
    return () => clearTimeout(id);
  }, [consulta, buscar]);

  const terminos = useMemo(
    () =>
      consulta
        .trim()
        .split(/\s+/)
        .filter((t) => t.length > 0),
    [consulta],
  );

  const abrir = (recursoId: string, localizador: string | null, pagina: number | null): void => {
    setDestino({ localizador, pagina });
    setVista({ modo: 'lectura', recursoId });
  };

  const volver = (): void => {
    setVista({ modo: 'biblioteca' });
    setDestino({ localizador: null, pagina: null });
  };

  if (vista.modo === 'lectura') {
    return (
      <main className="pantalla ancha">
        <button type="button" className="volver" onClick={volver}>
          ← biblioteca
        </button>
        {ficha === null ? (
          <p className="etiqueta">abriendo…</p>
        ) : (
          <>
            <header className="cabecera-lectura">
              <h1 className="titulo-obra">{ficha.titulo}</h1>
              <p className="lema">
                {ficha.formato} · {ETIQUETAS_ESTADO[ficha.estadoTexto] ?? ficha.estadoTexto}
                {ficha.numPaginas !== null ? ` · ${String(ficha.numPaginas)} páginas` : ''}
                {' · '}
                {ficha.idioma === 'und' ? 'idioma sin determinar' : ficha.idioma}
              </p>
              {ficha.detalleTexto !== null && <p className="aviso-sutil">{ficha.detalleTexto}</p>}
            </header>
            {ficha.formato === 'pdf' ? (
              <LectorPdf ficha={ficha} paginaDestino={destino.pagina} />
            ) : (
              <LectorTexto
                ficha={ficha}
                localizadorDestino={destino.localizador}
                terminos={terminos}
              />
            )}
          </>
        )}
      </main>
    );
  }

  const catalogoVacio = biblioteca.length === 0;

  return (
    <main className="pantalla">
      <h1 className="titulo">VESTIGIO</h1>
      <p className="lema">El conocimiento que permanece</p>

      <section className="buscador" aria-label="Buscar en la biblioteca">
        <input
          type="search"
          className="campo-busqueda"
          placeholder="buscar en la biblioteca…"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          aria-label="Buscar en la biblioteca"
          autoFocus
        />
      </section>

      {resultados !== null && (
        <section className="panel" aria-label="Resultados de la búsqueda" aria-busy={buscando}>
          <p className="etiqueta">
            {resultados.length === 0
              ? 'sin coincidencias'
              : `${String(resultados.length)} ${resultados.length === 1 ? 'coincidencia' : 'coincidencias'}`}
          </p>
          {resultados.map((r, i) => (
            <button
              type="button"
              className="resultado"
              key={`${r.recursoId}-${r.localizador}-${String(i)}`}
              onClick={() => abrir(r.recursoId, r.localizador, r.pagina)}
            >
              <span className="resultado-titulo">{r.titulo}</span>
              <span className="resultado-donde">
                {r.tituloSeccion ??
                  (r.pagina !== null ? `página ${String(r.pagina)}` : r.localizador)}
              </span>
              <span className="resultado-fragmento">
                <Fragmento texto={r.fragmento} />
              </span>
            </button>
          ))}
          {resultados.length === 0 && (
            <p className="aviso-sutil">
              Prueba con otra palabra o revisa la biblioteca completa más abajo. Vestigio no corrige
              tu búsqueda por su cuenta.
            </p>
          )}
        </section>
      )}

      <section className="panel" aria-label="Biblioteca">
        <p className="etiqueta">
          Biblioteca
          {estado?.versiones.corpus !== null && estado?.versiones.corpus !== undefined
            ? ` · ${estado.versiones.corpus}`
            : ''}
        </p>
        {catalogoVacio ? (
          <p className="aviso-sutil">
            Todavía no hay nada aquí. Se añade con la herramienta de ingesta:{' '}
            <code>vestigio-admin ingerir</code>.
          </p>
        ) : (
          biblioteca.map((recurso) => (
            <button
              type="button"
              className="fila fila-pulsable"
              key={recurso.id}
              onClick={() => abrir(recurso.id, null, null)}
            >
              <span className="nombre">{recurso.titulo}</span>
              <span className="valor">
                {recurso.formato}
                {recurso.numPaginas !== null ? ` · ${String(recurso.numPaginas)} pág.` : ''}
                {recurso.estadoTexto === 'sin-texto-escaneado' ||
                recurso.estadoTexto === 'ilegible' ||
                recurso.estadoTexto === 'cifrado'
                  ? ` · ${ETIQUETAS_ESTADO[recurso.estadoTexto] ?? recurso.estadoTexto}`
                  : ''}
              </span>
            </button>
          ))
        )}
      </section>

      <section className="panel" aria-label="Estado de la aplicación">
        <p className="etiqueta">Sala de máquinas</p>
        <div className="fila">
          <span className="nombre">Servicio de datos</span>
          <span className={estado?.servicioDatos.fase === 'activo' ? 'valor' : 'valor ascua'}>
            <span
              className={estado?.servicioDatos.fase === 'activo' ? 'latido' : 'latido degradado'}
              aria-hidden="true"
            />
            {estado?.servicioDatos.detalle ?? estado?.servicioDatos.fase ?? 'consultando'}
          </span>
        </div>
        <div className="fila">
          <span className="nombre">Datos personales</span>
          <span className="valor">
            {estado?.basePersonal == null
              ? estado?.modo === 'solo-lectura'
                ? 'en reposo — soporte de solo lectura'
                : 'preparando'
              : `${String(estado.basePersonal.favoritos)} favoritos · ${String(estado.basePersonal.notas)} notas`}
          </span>
        </div>
        <div className="fila">
          <span className="nombre">Red exterior</span>
          <span className="valor">bloqueada por diseño</span>
        </div>
      </section>
    </main>
  );
}
