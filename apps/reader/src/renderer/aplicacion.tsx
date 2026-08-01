// Orquestador de la ventana: monta la navegacion, decide que vista se pinta
// y reparte los datos comunes. No guarda estado de pantalla propio: lo que
// se ve depende del destino que manda el historial, que es lo que hace que
// volver atras devuelva exactamente lo que habia.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  EstadoAplicacion,
  EstadoZimUI,
  FichaUI,
  RecursoResumenUI,
  ResultadoZimUI,
} from '../comun/estado';
import { BUSQUEDA_INICIAL, useHistorial, type EstadoBusqueda } from './historial';
import { useEspacioPersonal } from './personal';
import { Navegacion, type Miga } from './navegacion';
import { VistaInicio } from './vista-inicio';
import { VistaBiblioteca } from './vista-biblioteca';
import { VistaFicha } from './vista-ficha';
import { VistaMiEspacio } from './vista-mi-espacio';
import { VistaSistema } from './vista-sistema';
import { Lector } from './lector';

export function Aplicacion(): React.JSX.Element {
  const [estado, setEstado] = useState<EstadoAplicacion | null>(null);
  const [biblioteca, setBiblioteca] = useState<RecursoResumenUI[]>([]);
  const [estadoZim, setEstadoZim] = useState<EstadoZimUI | null>(null);
  const [ficha, setFicha] = useState<FichaUI | null>(null);
  const [fichaFallida, setFichaFallida] = useState(false);

  const historial = useHistorial({ vista: 'inicio' });
  const personal = useEspacioPersonal();
  const { destino } = historial;

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
      .catch(() => {
        setBiblioteca([]);
      });
  }, [estado?.versiones.corpus]);

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

  // La ficha se carga para 'ficha' y para 'lectura': el lector la necesita
  // entera (segmentos incluidos).
  const recursoAbierto =
    destino.vista === 'ficha' || destino.vista === 'lectura' ? destino.recursoId : null;

  useEffect(() => {
    if (recursoAbierto === null) {
      setFicha(null);
      setFichaFallida(false);
      return;
    }
    let activo = true;
    setFichaFallida(false);
    window.vestigio
      .obtenerFicha(recursoAbierto)
      .then((resultado) => {
        if (!activo) return;
        setFicha(resultado);
        setFichaFallida(resultado === null);
      })
      .catch(() => {
        if (!activo) return;
        setFicha(null);
        setFichaFallida(true);
      });
    return () => {
      activo = false;
    };
  }, [recursoAbierto]);

  // --- Navegacion ------------------------------------------------------------

  const irABiblioteca = useCallback(
    (parcial?: Partial<EstadoBusqueda>) => {
      historial.ir({ vista: 'biblioteca', ...BUSQUEDA_INICIAL, ...parcial });
    },
    [historial],
  );

  const abrirFicha = useCallback(
    (recursoId: string) => {
      historial.ir({ vista: 'ficha', recursoId });
    },
    [historial],
  );

  const abrirLectura = useCallback(
    (recursoId: string, localizador: string | null, pagina: number | null) => {
      historial.ir({ vista: 'lectura', recursoId, localizador, pagina });
    },
    [historial],
  );

  const cambiarBusqueda = useCallback(
    (parcial: Partial<EstadoBusqueda>) => {
      if (destino.vista !== 'biblioteca') return;
      // Escribir en el buscador no llena el historial de entradas: se
      // reemplaza la actual y solo se apila al cambiar de pantalla.
      historial.reemplazar({ ...destino, ...parcial });
    },
    [destino, historial],
  );

  // --- Migas de pan ----------------------------------------------------------

  const migas: Miga[] = useMemo(() => {
    const inicio: Miga = { etiqueta: 'Inicio', destino: { vista: 'inicio' } };
    const biblioteca: Miga = {
      etiqueta: 'Biblioteca',
      destino: { vista: 'biblioteca', ...BUSQUEDA_INICIAL },
    };
    switch (destino.vista) {
      case 'inicio':
        return [inicio];
      case 'biblioteca':
        return [inicio, biblioteca];
      case 'ficha':
        return [inicio, biblioteca, { etiqueta: ficha?.titulo ?? 'documento', destino: null }];
      case 'lectura':
        return [
          inicio,
          biblioteca,
          {
            etiqueta: ficha?.titulo ?? 'documento',
            destino: { vista: 'ficha', recursoId: destino.recursoId },
          },
          { etiqueta: 'Lectura', destino: null },
        ];
      case 'zim':
        return [inicio, biblioteca, { etiqueta: destino.articulo.titulo, destino: null }];
      case 'mi-espacio':
        return [inicio, { etiqueta: 'Mi espacio', destino: null }];
      case 'sistema':
        return [inicio, { etiqueta: 'Sistema', destino: null }];
    }
  }, [destino, ficha]);

  // --- Contenido -------------------------------------------------------------

  const contenido = ((): React.JSX.Element => {
    switch (destino.vista) {
      case 'inicio':
        return (
          <VistaInicio
            biblioteca={biblioteca}
            personal={personal}
            catalogoPresente={estado?.catalogo.presente ?? false}
            alAbrirFicha={abrirFicha}
            alSeguirLeyendo={abrirLectura}
            alIrABiblioteca={() => {
              irABiblioteca();
            }}
            alIrAMiEspacio={() => {
              historial.ir({ vista: 'mi-espacio' });
            }}
          />
        );

      case 'biblioteca':
        return (
          <VistaBiblioteca
            busqueda={destino}
            alCambiarBusqueda={cambiarBusqueda}
            biblioteca={biblioteca}
            catalogoPresente={estado?.catalogo.presente ?? false}
            estadoZim={estadoZim}
            esFavorito={personal.esFavorito}
            alAbrirFicha={abrirFicha}
            alAbrirLectura={abrirLectura}
            alAbrirZim={(articulo: ResultadoZimUI) => {
              historial.ir({ vista: 'zim', articulo });
            }}
          />
        );

      case 'ficha':
        if (fichaFallida) return <DocumentoAusente alVolver={irABiblioteca} />;
        if (ficha === null) return <p className="etiqueta">abriendo…</p>;
        return (
          <VistaFicha
            ficha={ficha}
            personal={personal}
            alLeer={() => {
              historial.ir({
                vista: 'lectura',
                recursoId: ficha.id,
                localizador: null,
                pagina: null,
              });
            }}
            alAbrirFicha={abrirFicha}
          />
        );

      case 'lectura':
        if (fichaFallida) return <DocumentoAusente alVolver={irABiblioteca} />;
        if (ficha === null) return <p className="etiqueta">abriendo…</p>;
        return (
          <Lector
            contenido={{
              clase: 'documento',
              ficha,
              localizador: destino.localizador,
              pagina: destino.pagina,
            }}
            edicionCorpus={estado?.versiones.corpus ?? null}
            personal={personal}
            alAbrirFicha={abrirFicha}
            alCerrar={() => {
              historial.ir({ vista: 'ficha', recursoId: destino.recursoId });
            }}
          />
        );

      case 'zim':
        return (
          <Lector
            contenido={{ clase: 'zim', articulo: destino.articulo }}
            edicionCorpus={estado?.versiones.corpus ?? null}
            personal={personal}
            alAbrirFicha={abrirFicha}
            alCerrar={historial.atras}
          />
        );

      case 'mi-espacio':
        return (
          <VistaMiEspacio personal={personal} biblioteca={biblioteca} alAbrirFicha={abrirFicha} />
        );

      case 'sistema':
        return <VistaSistema estado={estado} estadoZim={estadoZim} />;
    }
  })();

  const anchaDeVerdad = destino.vista === 'lectura' || destino.vista === 'zim';

  return (
    <>
      <Navegacion
        historial={historial}
        migas={migas}
        modoSoloLectura={estado?.modo === 'solo-lectura'}
      />
      <main id="contenido" className={anchaDeVerdad ? 'pantalla ancha' : 'pantalla'}>
        {personal.aviso !== null && (
          <p className="cinta-aviso" role="alert">
            {personal.aviso}
            <button type="button" className="enlace-sutil" onClick={personal.descartarAviso}>
              entendido
            </button>
          </p>
        )}
        {contenido}
      </main>
    </>
  );
}

/** Un documento que ya no esta: se dice, no se deja la pantalla en blanco. */
function DocumentoAusente({ alVolver }: { alVolver: () => void }): React.JSX.Element {
  return (
    <section className="panel" aria-label="Documento no disponible">
      <p className="etiqueta">Ese documento ya no está</p>
      <p className="aviso">
        El catálogo no tiene ningún documento con ese identificador. Puede que la edición se haya
        reconstruido sin él, o que venga de un enlace tuyo anterior a esta entrega.
      </p>
      <button type="button" className="boton-secundario" onClick={alVolver}>
        Volver a la biblioteca
      </button>
    </section>
  );
}
