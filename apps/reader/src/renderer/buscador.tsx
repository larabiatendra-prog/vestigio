import { useMemo } from 'react';
import type {
  CoincidenciaUI,
  FacetaUI,
  FiltrosUI,
  MotivoUI,
  ResultadoBusquedaUI,
  ResultadoZimUI,
} from '../comun/estado';

// Pantalla de resultados. Principios que la gobiernan (plan §9.4-9.5):
//  - Documentos catalogados primero y estables; los ZIM en su propio grupo.
//  - Cada resultado explica POR QUE aparecio.
//  - Nada se corrige en silencio: las erratas son sugerencias visibles.
//  - Las expansiones de sinonimos se muestran y se pueden desactivar.

const ETIQUETA_MOTIVO: Record<MotivoUI, string> = {
  exacta: 'coincidencia exacta',
  'sin-tilde': 'sin tildes',
  alias: 'por sinónimo',
  aproximada: 'aproximada',
};

/** Resalta lo que el buscador marco con [[ ]] sin insertar HTML. */
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

interface PropsChips {
  titulo: string;
  facetas: FacetaUI[];
  seleccionados: string[];
  alAlternar: (valor: string) => void;
}

function GrupoChips({
  titulo,
  facetas,
  seleccionados,
  alAlternar,
}: PropsChips): React.JSX.Element | null {
  if (facetas.length <= 1) return null;
  return (
    <div className="grupo-chips" role="group" aria-label={titulo}>
      <span className="etiqueta">{titulo}</span>
      {facetas.map((f) => {
        const activo = seleccionados.includes(f.valor);
        return (
          <button
            key={f.valor}
            type="button"
            className={activo ? 'chip activo' : 'chip'}
            aria-pressed={activo}
            onClick={() => alAlternar(f.valor)}
          >
            {f.etiqueta} <span className="chip-cuenta">{f.cuenta}</span>
          </button>
        );
      })}
    </div>
  );
}

interface Props {
  resultado: ResultadoBusquedaUI | null;
  resultadosZim: ResultadoZimUI[] | null;
  buscando: boolean;
  filtros: FiltrosUI;
  sinonimosActivos: boolean;
  modoAvanzado: boolean;
  alAlternarFiltro: (faceta: 'formatos' | 'idiomas', valor: string) => void;
  alAlternarSinonimos: () => void;
  alAceptarSugerencia: (texto: string) => void;
  alAbrirDocumento: (recursoId: string, localizador: string | null, pagina: number | null) => void;
  alAbrirZim: (articulo: ResultadoZimUI) => void;
}

export function Buscador({
  resultado,
  resultadosZim,
  buscando,
  filtros,
  sinonimosActivos,
  modoAvanzado,
  alAlternarFiltro,
  alAlternarSinonimos,
  alAceptarSugerencia,
  alAbrirDocumento,
  alAbrirZim,
}: Props): React.JSX.Element | null {
  const coincidencias: CoincidenciaUI[] = resultado?.coincidencias ?? [];
  const hayFiltros = useMemo(
    () => (filtros.formatos?.length ?? 0) + (filtros.idiomas?.length ?? 0) > 0,
    [filtros],
  );

  if (resultado === null) return null;

  if (resultado.error !== null) {
    return (
      <section className="panel" aria-label="Error en la consulta">
        <p className="etiqueta">La consulta tiene un problema</p>
        <p className="aviso">
          {resultado.error.mensaje} (carácter {resultado.error.posicion + 1})
        </p>
        <p className="aviso-sutil">
          En modo avanzado puedes usar &quot;frases entre comillas&quot;, prefijos con asterisco y
          excluir con guion.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="panel" aria-label="Documentos catalogados" aria-busy={buscando}>
        <p className="etiqueta" role="status" aria-live="polite">
          Documentos catalogados ·{' '}
          {coincidencias.length === 0
            ? 'sin coincidencias'
            : `${String(coincidencias.length)}${resultado.total > coincidencias.length ? ` de ${String(resultado.total)}` : ''}`}
        </p>

        {(resultado.facetas.formatos.length > 1 || resultado.facetas.idiomas.length > 1) && (
          <div className="filtros">
            <GrupoChips
              titulo="Formato"
              facetas={resultado.facetas.formatos}
              seleccionados={filtros.formatos ?? []}
              alAlternar={(v) => alAlternarFiltro('formatos', v)}
            />
            <GrupoChips
              titulo="Idioma"
              facetas={resultado.facetas.idiomas}
              seleccionados={filtros.idiomas ?? []}
              alAlternar={(v) => alAlternarFiltro('idiomas', v)}
            />
          </div>
        )}

        {resultado.expansiones.length > 0 && (
          <p className="aviso-sutil">
            También se ha buscado: {resultado.expansiones.map((e) => e.anadido).join(', ')}.{' '}
            <button type="button" className="enlace-sutil" onClick={alAlternarSinonimos}>
              {sinonimosActivos ? 'buscar solo lo que escribí' : 'ampliar con sinónimos'}
            </button>
          </p>
        )}
        {resultado.expansionBloqueadaPor !== null &&
          resultado.expansionBloqueadaPor.startsWith('la consulta contiene') && (
            <p className="aviso-sutil">Búsqueda literal: {resultado.expansionBloqueadaPor}.</p>
          )}

        {resultado.sugerencias.length > 0 && (
          <p className="aviso-sutil">
            ¿Quisiste decir{' '}
            {resultado.sugerencias.map((s, i) => (
              <span key={s.escrito}>
                {i > 0 ? ', ' : ''}
                <button
                  type="button"
                  className="enlace-sutil"
                  onClick={() => alAceptarSugerencia(s.sugerido)}
                >
                  {s.sugerido}
                </button>
              </span>
            ))}
            ? Vestigio no cambia tu búsqueda por su cuenta.
          </p>
        )}

        {coincidencias.map((r, i) => (
          <button
            type="button"
            className="resultado"
            key={`${r.recursoId}-${r.localizador}-${String(i)}`}
            onClick={() => alAbrirDocumento(r.recursoId, r.localizador, r.pagina)}
          >
            <span className="resultado-titulo">{r.titulo}</span>
            <span className="resultado-donde">
              {r.tituloSeccion ??
                (r.pagina !== null ? `página ${String(r.pagina)}` : r.localizador)}
              {r.motivo !== 'exacta' && (
                <span className="motivo"> · {ETIQUETA_MOTIVO[r.motivo]}</span>
              )}
            </span>
            <span className="resultado-fragmento">
              <Fragmento texto={r.fragmento} />
            </span>
          </button>
        ))}

        {coincidencias.length === 0 && (
          <p className="aviso-sutil">
            {hayFiltros
              ? 'Ningún documento pasa los filtros activos. Prueba a quitar alguno.'
              : modoAvanzado
                ? 'Sin coincidencias. Revisa la sintaxis o prueba el modo sencillo.'
                : 'Sin coincidencias. Prueba con otra palabra o mira la biblioteca completa más abajo.'}
          </p>
        )}
      </section>

      {resultadosZim !== null && resultadosZim.length > 0 && (
        <section className="panel" aria-label="Artículos de colecciones">
          <p className="etiqueta" role="status" aria-live="polite">
            Artículos de colecciones · {String(resultadosZim.length)}
          </p>
          <p className="aviso-sutil">
            Los filtros de arriba no se aplican aquí: las colecciones se buscan enteras.
          </p>
          {resultadosZim.map((r, i) => (
            <button
              type="button"
              className="resultado"
              key={`${r.libro}-${r.ruta}-${String(i)}`}
              onClick={() => alAbrirZim(r)}
            >
              <span className="resultado-titulo">{r.titulo}</span>
              <span className="resultado-donde salvia">colección · {r.libro}</span>
              <span className="resultado-fragmento">{r.fragmento}</span>
            </button>
          ))}
        </section>
      )}
    </>
  );
}
