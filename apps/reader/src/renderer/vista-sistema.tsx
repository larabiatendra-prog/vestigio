// Sistema: la sala de maquinas (patron "sala de maquinas" de Canon).
//
// Aqui se enseña el estado real sin adornos, incluidas las malas noticias, y
// vive el boton de "cerrar y preparar para copiar o expulsar" (bloque 12,
// tarea 9), que suelta bases y colecciones antes de que Daniel saque el USB.

import { useState } from 'react';
import type {
  ComprobacionUI,
  EstadoAplicacion,
  EstadoZimUI,
  InformeCierreUI,
  InformeDoctorUI,
} from '../comun/estado';

interface Props {
  estado: EstadoAplicacion | null;
  estadoZim: EstadoZimUI | null;
}

function textoZim(estadoZim: EstadoZimUI | null): string {
  if (estadoZim === null) return 'consultando';
  switch (estadoZim.fase) {
    case 'activo':
      return `${String(estadoZim.colecciones.length)} ${
        estadoZim.colecciones.length === 1 ? 'colección' : 'colecciones'
      }, solo en este equipo`;
    case 'sin-binario':
      return 'sin instalar';
    case 'sin-colecciones':
      return 'ninguna añadida';
    case 'arrancando':
      return 'abriendo…';
    default:
      return estadoZim.detalle ?? estadoZim.fase;
  }
}

const ETIQUETA_ESTADO: Record<ComprobacionUI['estado'], string> = {
  bien: 'correcto',
  aviso: 'aviso',
  mal: 'problema',
  'no-aplica': 'no aplica',
};

export function VistaSistema({ estado, estadoZim }: Props): React.JSX.Element {
  const [informe, setInforme] = useState<InformeCierreUI | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [doctor, setDoctor] = useState<InformeDoctorUI | null>(null);
  const [revisando, setRevisando] = useState<false | 'rapido' | 'completo'>(false);
  const [falloDoctor, setFalloDoctor] = useState<string | null>(null);

  const pasarDoctor = (completo: boolean): void => {
    setRevisando(completo ? 'completo' : 'rapido');
    setFalloDoctor(null);
    window.vestigio
      .pasarDoctor(completo)
      .then(setDoctor)
      .catch((error: unknown) => {
        setFalloDoctor(
          error instanceof Error
            ? `La revisión no pudo terminar: ${error.message}`
            : 'La revisión no pudo terminar.',
        );
      })
      .finally(() => {
        setRevisando(false);
      });
  };

  const preparado = estado?.preparadoParaCopiar === true;
  const activo = estado?.servicioDatos.fase === 'activo';

  return (
    <>
      <header className="cabecera-ficha">
        <h1 className="titulo-obra">Sistema</h1>
        <p className="lema">Qué está pasando por dentro</p>
      </header>

      <section className="panel" aria-label="Estado de la aplicación">
        <p className="etiqueta">Sala de máquinas</p>
        <div className="fila">
          <span className="nombre">Servicio de datos</span>
          <span className={activo ? 'valor' : 'valor ascua'}>
            <span className={activo ? 'latido' : 'latido degradado'} aria-hidden="true" />
            {preparado
              ? 'detenido a propósito, listo para copiar'
              : (estado?.servicioDatos.detalle ?? estado?.servicioDatos.fase ?? 'consultando')}
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
          <span className="nombre">Cierre anterior</span>
          <span
            className={
              estado?.basePersonal?.cierreLimpioAnterior === false ? 'valor ascua' : 'valor'
            }
          >
            {estado?.basePersonal == null
              ? '—'
              : estado.basePersonal.cierreLimpioAnterior
                ? 'limpio'
                : 'sucio: se comprobó la base antes de escribir nada'}
          </span>
        </div>
        <div className="fila">
          <span className="nombre">Catálogo</span>
          <span className="valor">
            {estado?.catalogo.presente === true
              ? `${String(estado.catalogo.recursos)} documentos`
              : 'sin catálogo en esta entrega'}
          </span>
        </div>
        <div className="fila">
          <span className="nombre">Colecciones ZIM</span>
          <span className="valor">{textoZim(estadoZim)}</span>
        </div>
        <div className="fila">
          <span className="nombre">Red exterior</span>
          <span className="valor">bloqueada por diseño</span>
        </div>
      </section>

      <section className="panel" aria-label="Versiones y entrega">
        <p className="etiqueta">Esta entrega</p>
        <div className="fila">
          <span className="nombre">Aplicación</span>
          <span className="valor">{estado?.versiones.app ?? '—'}</span>
        </div>
        <div className="fila">
          <span className="nombre">Corpus</span>
          <span className="valor">{estado?.versiones.corpus ?? 'sin declarar'}</span>
        </div>
        <div className="fila">
          <span className="nombre">Información vigente</span>
          <span className="valor">{estado?.versiones.informacionVigente ?? 'sin declarar'}</span>
        </div>
        <div className="fila">
          <span className="nombre">Modo</span>
          <span className="valor">
            {estado?.modo === 'solo-lectura' ? 'solo lectura' : 'lectura y escritura'}
          </span>
        </div>
        <p className="nota-pie">{estado?.rootPortable ?? ''}</p>
      </section>

      <section className="panel" aria-label="Revisión de la entrega">
        <p className="etiqueta">¿Está todo en su sitio?</p>
        <p className="aviso-sutil">
          El Doctor mira la entrega entera y te dice qué encuentra: si los documentos siguen
          intactos, si las bases están sanas y si hay copias de tu espacio. No necesita conexión.
        </p>
        <div className="acciones-ficha">
          <button
            type="button"
            className="boton-principal"
            disabled={revisando !== false}
            onClick={() => {
              pasarDoctor(false);
            }}
          >
            {revisando === 'rapido' ? 'Revisando…' : 'Revisión rápida'}
          </button>
          <button
            type="button"
            className="boton-secundario"
            disabled={revisando !== false}
            onClick={() => {
              pasarDoctor(true);
            }}
          >
            {revisando === 'completo' ? 'Revisando a fondo…' : 'Revisión a fondo'}
          </button>
        </div>

        {falloDoctor !== null && (
          <p className="aviso" role="status">
            {falloDoctor}
          </p>
        )}

        {doctor !== null && (
          <div className="informe-doctor">
            <p className={doctor.veredicto === 'operativo' ? 'aviso-sutil' : 'aviso'} role="status">
              {doctor.titular}
            </p>
            <p className="aviso-sutil">
              {String(doctor.resumen.bien)} correctas · {String(doctor.resumen.avisos)} avisos ·{' '}
              {String(doctor.resumen.problemas)} problemas
              {doctor.rutaInforme !== null ? ' · informe guardado en LOGS/doctor.txt' : ''}
            </p>
            <ul className="lista-comprobaciones">
              {doctor.comprobaciones.map((c) => (
                <li key={c.id} className={`comprobacion ${c.estado}`}>
                  <span className="marca-estado">{ETIQUETA_ESTADO[c.estado]}</span>
                  <span className="comprobacion-cuerpo">
                    <strong>{c.titulo}</strong>
                    <span className="comprobacion-detalle">{c.detalle}</span>
                    {c.muestreo !== undefined && (
                      <span className="comprobacion-muestreo">
                        Revisados {c.muestreo.revisados} de {c.muestreo.total}: esto es una muestra,
                        no una garantía sobre el resto.
                      </span>
                    )}
                    {c.remedio !== null && (
                      <span className="comprobacion-remedio">{c.remedio}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="panel" aria-label="Preparar para copiar o expulsar">
        <p className="etiqueta">Antes de copiar la carpeta o sacar el USB</p>
        {preparado ? (
          <>
            <p className="aviso-sutil" role="status">
              Vestigio ya ha soltado la carpeta: no hay ninguna base abierta ni ninguna colección en
              marcha. Ya puedes copiarla o expulsar el soporte.
            </p>
            {informe !== null && (
              <ul className="lista-simple">
                <li>
                  Copia de seguridad:{' '}
                  {informe.respaldo === 'hecho'
                    ? `hecha en ${informe.rutaRespaldo ?? ''}`
                    : informe.respaldo === 'sin-cambios'
                      ? 'no hacía falta, no había nada nuevo que guardar'
                      : informe.respaldo === 'no-aplica'
                        ? 'no aplica en un soporte de solo lectura'
                        : 'no se pudo hacer'}
                </li>
                <li>Bases de datos: {informe.basesCerradas ? 'cerradas' : 'no del todo'}</li>
                <li>Colecciones: {informe.kiwixDetenido ? 'detenidas' : 'no del todo'}</li>
                {informe.problemas.map((problema) => (
                  <li key={problema} className="problema">
                    {problema}
                  </li>
                ))}
              </ul>
            )}
            <p className="aviso">{informe?.aviso ?? ''}</p>
            <p className="aviso-sutil">
              A partir de aquí Vestigio no guardará nada más. Para volver a usarlo, ciérralo y
              ábrelo otra vez.
            </p>
          </>
        ) : (
          <>
            <p className="aviso-sutil">
              Copiar la carpeta con Vestigio abierto puede llevarse una base a medio escribir. Este
              botón hace una copia de seguridad si hay algo nuevo, cierra las bases, detiene las
              colecciones y suelta todos los ficheros.
            </p>
            <button
              type="button"
              className="boton-principal"
              disabled={preparando}
              onClick={() => {
                setPreparando(true);
                window.vestigio
                  .prepararParaCopiar()
                  .then(setInforme)
                  .catch((error: unknown) => {
                    setInforme({
                      respaldo: 'fallido',
                      rutaRespaldo: null,
                      basesCerradas: false,
                      kiwixDetenido: false,
                      problemas: [error instanceof Error ? error.message : 'error inesperado'],
                      aviso:
                        'Vestigio no ha podido soltar la carpeta del todo. Ciérralo antes de copiar.',
                    });
                  })
                  .finally(() => {
                    setPreparando(false);
                  });
              }}
            >
              {preparando ? 'Preparando…' : 'Cerrar y preparar para copiar o expulsar'}
            </button>
          </>
        )}
      </section>
    </>
  );
}
