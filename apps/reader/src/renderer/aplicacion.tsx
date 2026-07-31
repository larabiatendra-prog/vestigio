import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  EstadoAplicacion,
  EstadoZimUI,
  FichaUI,
  FiltrosUI,
  RecursoResumenUI,
  ResultadoBusquedaUI,
  ResultadoZimUI,
} from '../comun/estado';
import { LectorTexto } from './lector-texto';
import { LectorPdf } from './lector-pdf';
import { VisorZim } from './visor-zim';
import { Buscador } from './buscador';

type Vista =
  | { modo: 'biblioteca' }
  | { modo: 'lectura'; recursoId: string }
  | { modo: 'zim'; articulo: ResultadoZimUI };

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

export function Aplicacion(): React.JSX.Element {
  const [estado, setEstado] = useState<EstadoAplicacion | null>(null);
  const [biblioteca, setBiblioteca] = useState<RecursoResumenUI[]>([]);
  const [consulta, setConsulta] = useState('');
  const [resultados, setResultados] = useState<ResultadoBusquedaUI | null>(null);
  const [resultadosZim, setResultadosZim] = useState<ResultadoZimUI[] | null>(null);
  const [estadoZim, setEstadoZim] = useState<EstadoZimUI | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosUI>({});
  const [sinonimos, setSinonimos] = useState(true);
  const [avanzado, setAvanzado] = useState(false);
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

  useEffect(() => {
    // El estado de las colecciones se consulta aparte: Kiwix tarda en
    // arrancar y la biblioteca no debe esperarlo.
    let activo = true;
    const mirar = (): void => {
      window.vestigio
        .estadoZim()
        .then((z) => {
          if (activo) setEstadoZim(z);
        })
        .catch(() => undefined);
    };
    mirar();
    const intervalo = setInterval(mirar, 4000);
    return () => {
      activo = false;
      clearInterval(intervalo);
    };
  }, []);

  const buscar = useCallback(
    (texto: string, opciones: { filtros: FiltrosUI; sinonimos: boolean; avanzado: boolean }) => {
      if (texto.trim().length === 0) {
        setResultados(null);
        setResultadosZim(null);
        return;
      }
      setBuscando(true);
      // Documentos catalogados primero y estables; los ZIM llegan aparte y
      // nunca reordenan ni bloquean la lista que ya se esta leyendo (§9.3).
      window.vestigio
        .buscar(texto, opciones)
        .then(setResultados)
        .catch(() => setResultados(null))
        .finally(() => setBuscando(false));
      window.vestigio
        .buscarZim(texto)
        .then(setResultadosZim)
        .catch(() => setResultadosZim([]));
    },
    [],
  );

  useEffect(() => {
    const id = setTimeout(() => {
      buscar(consulta, { filtros, sinonimos, avanzado });
    }, 200);
    return () => clearTimeout(id);
  }, [consulta, filtros, sinonimos, avanzado, buscar]);

  /** OR dentro de la faceta: pulsar un chip lo anade o lo quita. */
  const alternarFiltro = useCallback((faceta: 'formatos' | 'idiomas', valor: string) => {
    setFiltros((previos) => {
      const actuales = previos[faceta] ?? [];
      const nuevos = actuales.includes(valor)
        ? actuales.filter((v) => v !== valor)
        : [...actuales, valor];
      // Una faceta sin valores desaparece del filtro (no queda un array
      // vacio que el repositorio tendria que interpretar).
      const siguiente: FiltrosUI = {};
      for (const [clave, valores] of Object.entries(previos)) {
        if (clave !== faceta && valores !== undefined && valores.length > 0) {
          siguiente[clave as keyof FiltrosUI] = valores;
        }
      }
      if (nuevos.length > 0) siguiente[faceta] = nuevos;
      return siguiente;
    });
  }, []);

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

  if (vista.modo === 'zim') {
    return (
      <main className="pantalla ancha">
        <button type="button" className="volver" onClick={volver}>
          ← biblioteca
        </button>
        <VisorZim articulo={vista.articulo} alCerrar={volver} />
      </main>
    );
  }

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
          placeholder={
            avanzado ? '"frases exactas", prefijo*, -excluir…' : 'buscar en la biblioteca…'
          }
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          aria-label="Buscar en la biblioteca"
          autoFocus
        />
        <div className="opciones-busqueda">
          <button
            type="button"
            className={avanzado ? 'chip activo' : 'chip'}
            aria-pressed={avanzado}
            onClick={() => setAvanzado((a) => !a)}
          >
            modo avanzado
          </button>
          <button
            type="button"
            className={sinonimos ? 'chip activo' : 'chip'}
            aria-pressed={sinonimos}
            onClick={() => setSinonimos((s) => !s)}
          >
            sinónimos
          </button>
        </div>
      </section>

      <Buscador
        resultado={resultados}
        resultadosZim={resultadosZim}
        buscando={buscando}
        filtros={filtros}
        sinonimosActivos={sinonimos}
        modoAvanzado={avanzado}
        alAlternarFiltro={alternarFiltro}
        alAlternarSinonimos={() => setSinonimos((s) => !s)}
        alAceptarSugerencia={(t) => setConsulta(t)}
        alAbrirDocumento={abrir}
        alAbrirZim={(articulo) => setVista({ modo: 'zim', articulo })}
      />

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
          <span className="nombre">Colecciones ZIM</span>
          <span className="valor">
            {estadoZim === null
              ? 'consultando'
              : estadoZim.fase === 'activo'
                ? `${String(estadoZim.colecciones.length)} ${estadoZim.colecciones.length === 1 ? 'colección' : 'colecciones'}, solo en este equipo`
                : estadoZim.fase === 'sin-binario'
                  ? 'sin instalar'
                  : estadoZim.fase === 'sin-colecciones'
                    ? 'ninguna añadida'
                    : estadoZim.fase === 'arrancando'
                      ? 'abriendo…'
                      : (estadoZim.detalle ?? estadoZim.fase)}
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
