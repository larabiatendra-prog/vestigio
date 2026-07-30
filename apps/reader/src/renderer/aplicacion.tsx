import { useEffect, useState } from 'react';
import type { EstadoAplicacion } from '../comun/estado';

function ValorVersion({ valor }: { valor: string | null }): React.JSX.Element {
  if (valor === null) return <span className="valor apagado">sin edición todavía</span>;
  return <span className="valor oro">{valor}</span>;
}

export function Aplicacion(): React.JSX.Element {
  const [estado, setEstado] = useState<EstadoAplicacion | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    const consultar = (): void => {
      window.vestigio
        .obtenerEstado()
        .then((e) => {
          if (activo) setEstado(e);
        })
        .catch((error: unknown) => {
          if (activo) setFallo(error instanceof Error ? error.message : 'estado no disponible');
        });
    };
    consultar();
    const intervalo = setInterval(consultar, 4000);
    return () => {
      activo = false;
      clearInterval(intervalo);
    };
  }, []);

  const servicio = estado?.servicioDatos;
  const servicioSano = servicio?.fase === 'activo';

  return (
    <main className="pantalla">
      <h1 className="titulo">VESTIGIO</h1>
      <p className="lema">El conocimiento que permanece</p>

      <section className="panel" aria-label="Versiones de la entrega">
        <p className="etiqueta">Esta entrega</p>
        <div className="fila">
          <span className="nombre">Aplicación</span>
          <ValorVersion valor={estado?.versiones.app ?? null} />
        </div>
        <div className="fila">
          <span className="nombre">Biblioteca</span>
          <ValorVersion valor={estado?.versiones.corpus ?? null} />
        </div>
        <div className="fila">
          <span className="nombre">Información vigente</span>
          <ValorVersion valor={estado?.versiones.informacionVigente ?? null} />
        </div>
      </section>

      <section className="panel" aria-label="Estado de la aplicación">
        <p className="etiqueta">Sala de máquinas</p>
        <div className="fila">
          <span className="nombre">Servicio de datos</span>
          <span className={servicioSano ? 'valor' : 'valor ascua'} role="status">
            <span className={servicioSano ? 'latido' : 'latido degradado'} aria-hidden="true" />
            {fallo ?? servicio?.detalle ?? servicio?.fase ?? 'consultando'}
          </span>
        </div>
        <div className="fila">
          <span className="nombre">Modo del soporte</span>
          <span className="valor">
            {estado?.modo === 'solo-lectura' ? 'solo lectura — consulta' : 'lectura y escritura'}
          </span>
        </div>
        <div className="fila">
          <span className="nombre">Red exterior</span>
          <span className="valor">bloqueada por diseño</span>
        </div>
      </section>

      <p className="nota-pie">raíz portable: {estado?.rootPortable ?? '…'}</p>
    </main>
  );
}
