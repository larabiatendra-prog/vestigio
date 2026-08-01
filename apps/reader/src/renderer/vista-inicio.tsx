// Inicio (bloque 10, tarea 2): la pantalla que responde "¿por dónde iba?".
//
// No es un escaparate: solo enseña lo que Daniel ha tocado. Con la biblioteca
// recien ingerida esta casi vacia a proposito, y lo dice, en vez de rellenarse
// con documentos elegidos al azar.

import type { RecursoResumenUI } from '../comun/estado';
import type { EspacioPersonal } from './personal';
import { etiquetaFormato, fechaYHoraLegible } from './etiquetas';

interface Props {
  biblioteca: RecursoResumenUI[];
  personal: EspacioPersonal;
  catalogoPresente: boolean;
  alAbrirFicha: (recursoId: string) => void;
  alSeguirLeyendo: (recursoId: string, localizador: string | null, pagina: number | null) => void;
  alIrABiblioteca: () => void;
  alIrAMiEspacio: () => void;
}

export function VistaInicio({
  biblioteca,
  personal,
  catalogoPresente,
  alAbrirFicha,
  alSeguirLeyendo,
  alIrABiblioteca,
  alIrAMiEspacio,
}: Props): React.JSX.Element {
  const porId = new Map(biblioteca.map((r) => [r.id, r]));
  const nombrar = (recursoId: string): string =>
    porId.get(recursoId)?.titulo ?? 'documento que ya no está en el catálogo';

  const enCurso = [...personal.espacio.progreso]
    .sort((a, b) => b.actualizado.localeCompare(a.actualizado))
    .slice(0, 4);
  const recientes = personal.espacio.recientes.slice(0, 6);
  const favoritos = personal.espacio.favoritos.slice(0, 8);

  const espacioVacio = enCurso.length === 0 && recientes.length === 0 && favoritos.length === 0;

  return (
    <>
      <section className="portada">
        <h1 className="titulo">VESTIGIO</h1>
        <p className="lema">El conocimiento que permanece</p>
        <p className="portada-texto">
          {catalogoPresente
            ? `${String(biblioteca.length)} ${biblioteca.length === 1 ? 'documento' : 'documentos'} en esta entrega, disponibles sin conexión y sin depender de nadie.`
            : 'Todavía no hay documentos en esta entrega. Vestigio funciona, pero está esperando su biblioteca.'}
        </p>
        <div className="acciones-ficha">
          <button type="button" className="boton-principal" onClick={alIrABiblioteca}>
            Ir a la biblioteca
          </button>
          <button type="button" className="boton-secundario" onClick={alIrAMiEspacio}>
            Mi espacio
          </button>
        </div>
      </section>

      {enCurso.length > 0 && (
        <section className="panel" aria-label="Lecturas empezadas">
          <p className="etiqueta">Seguir leyendo</p>
          {enCurso.map((progreso) => (
            <button
              type="button"
              className="fila fila-pulsable"
              key={progreso.recursoId}
              onClick={() => {
                alSeguirLeyendo(progreso.recursoId, progreso.localizador, progreso.pagina);
              }}
            >
              <span className="nombre">{nombrar(progreso.recursoId)}</span>
              <span className="valor">
                {progreso.pagina !== null
                  ? `página ${String(progreso.pagina)}`
                  : (progreso.localizador ?? 'sin localizar')}
                {progreso.porcentaje !== null
                  ? ` · ${String(Math.round(progreso.porcentaje))} %`
                  : ''}
              </span>
            </button>
          ))}
        </section>
      )}

      {favoritos.length > 0 && (
        <section className="panel" aria-label="Favoritos">
          <p className="etiqueta">Guardados</p>
          {favoritos.map((recursoId) => (
            <button
              type="button"
              className="fila fila-pulsable"
              key={recursoId}
              onClick={() => {
                alAbrirFicha(recursoId);
              }}
            >
              <span className="nombre">{nombrar(recursoId)}</span>
              <span className="valor">
                {etiquetaFormato(porId.get(recursoId)?.formato ?? 'desconocido')}
              </span>
            </button>
          ))}
        </section>
      )}

      {recientes.length > 0 && (
        <section className="panel" aria-label="Abiertos hace poco">
          <p className="etiqueta">Abiertos hace poco</p>
          {recientes.map((reciente) => (
            <button
              type="button"
              className="fila fila-pulsable"
              key={reciente.recursoId}
              onClick={() => {
                alAbrirFicha(reciente.recursoId);
              }}
            >
              <span className="nombre">{nombrar(reciente.recursoId)}</span>
              <span className="valor">{fechaYHoraLegible(reciente.visto) ?? ''}</span>
            </button>
          ))}
        </section>
      )}

      {espacioVacio && catalogoPresente && (
        <section className="panel" aria-label="Todavía no has empezado">
          <p className="etiqueta">Todavía no hay rastro tuyo</p>
          <p className="aviso-sutil">
            Aquí irán apareciendo las lecturas que empieces, lo que guardes y lo que hayas abierto
            hace poco. De momento está vacío porque acabas de llegar.
            {personal.temporal &&
              ' Además, este soporte es de solo lectura: nada de lo que hagas se guardará al cerrar.'}
          </p>
        </section>
      )}
    </>
  );
}
