// Navegacion primaria y migas de pan (bloque 10, tareas 2 y 6).
//
// Nota deliberada sobre lo que NO esta aqui: el plan pide tambien Aprender,
// Aplicar, Emergencia e Informacion vigente en la barra. Esos destinos los
// construyen los bloques 13, 14 y 15. Un boton que no lleva a ningun sitio es
// exactamente el "placeholder en la UI entregada" que el criterio de salida
// de este bloque prohibe, asi que aparecen cuando existan, no antes.

import type { Destino, Historial } from './historial';
import { BUSQUEDA_INICIAL } from './historial';

interface Seccion {
  clave: Destino['vista'];
  etiqueta: string;
  destino: Destino;
  descripcion: string;
}

const SECCIONES: Seccion[] = [
  {
    clave: 'inicio',
    etiqueta: 'Inicio',
    destino: { vista: 'inicio' },
    descripcion: 'por dónde ibas y lo que has guardado',
  },
  {
    clave: 'biblioteca',
    etiqueta: 'Biblioteca',
    destino: { vista: 'biblioteca', ...BUSQUEDA_INICIAL },
    descripcion: 'buscar y explorar todo el fondo',
  },
  {
    clave: 'mi-espacio',
    etiqueta: 'Mi espacio',
    destino: { vista: 'mi-espacio' },
    descripcion: 'favoritos, colecciones, notas y copias',
  },
  {
    clave: 'sistema',
    etiqueta: 'Sistema',
    destino: { vista: 'sistema' },
    descripcion: 'estado de la aplicación y de la entrega',
  },
];

/** Seccion de la barra a la que pertenece cada destino. */
function seccionDe(destino: Destino): Destino['vista'] {
  switch (destino.vista) {
    case 'ficha':
    case 'lectura':
    case 'zim':
      return 'biblioteca';
    default:
      return destino.vista;
  }
}

export interface Miga {
  etiqueta: string;
  destino: Destino | null;
}

interface Props {
  historial: Historial;
  migas: Miga[];
  modoSoloLectura: boolean;
}

export function Navegacion({ historial, migas, modoSoloLectura }: Props): React.JSX.Element {
  const seccionActiva = seccionDe(historial.destino);

  return (
    <header className="cabecera-app">
      <a href="#contenido" className="saltar-a-contenido">
        Saltar al contenido
      </a>

      <div className="barra-superior">
        <div className="marca">
          <span className="marca-nombre">VESTIGIO</span>
          <span className="marca-lema">El conocimiento que permanece</span>
        </div>

        <nav className="navegacion-primaria" aria-label="Secciones de Vestigio">
          <ul>
            {SECCIONES.map((seccion) => {
              const activa = seccion.clave === seccionActiva;
              return (
                <li key={seccion.clave}>
                  <button
                    type="button"
                    className={activa ? 'nav-boton activo' : 'nav-boton'}
                    aria-current={activa ? 'page' : undefined}
                    title={seccion.descripcion}
                    data-ancla={`nav-${seccion.clave}`}
                    onClick={() => {
                      historial.ir(seccion.destino);
                    }}
                  >
                    {seccion.etiqueta}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="controles-historial" role="group" aria-label="Historial de navegación">
          <button
            type="button"
            className="boton-icono"
            onClick={historial.atras}
            disabled={!historial.puedeAtras}
            title="Atrás (Alt + flecha izquierda)"
          >
            <span aria-hidden="true">←</span>
            <span className="solo-lectores">Atrás</span>
          </button>
          <button
            type="button"
            className="boton-icono"
            onClick={historial.adelante}
            disabled={!historial.puedeAdelante}
            title="Adelante (Alt + flecha derecha)"
          >
            <span aria-hidden="true">→</span>
            <span className="solo-lectores">Adelante</span>
          </button>
        </div>
      </div>

      {modoSoloLectura && (
        <p className="cinta-aviso" role="status">
          Soporte de solo lectura. Puedes leer y buscar todo, pero lo que marques o anotes vivirá
          solo hasta que cierres Vestigio: no se guardará en ningún sitio.
        </p>
      )}

      {migas.length > 1 && (
        <nav className="migas" aria-label="Dónde estás">
          <ol>
            {migas.map((miga, i) => (
              <li key={`${miga.etiqueta}-${String(i)}`}>
                {miga.destino !== null && i < migas.length - 1 ? (
                  <button
                    type="button"
                    className="miga-enlace"
                    onClick={() => {
                      if (miga.destino !== null) historial.ir(miga.destino);
                    }}
                  >
                    {miga.etiqueta}
                  </button>
                ) : (
                  <span aria-current={i === migas.length - 1 ? 'page' : undefined}>
                    {miga.etiqueta}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
    </header>
  );
}
