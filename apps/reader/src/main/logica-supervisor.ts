// Maquina de estados pura del supervisor lease/epoch (ADR-0002, plan §6.2).
// Reglas: nunca dos procesos vivos a la vez; el sucesor solo se crea tras
// confirmar la muerte del anterior (evento 'salio'); reinicios acotados con
// espera creciente; tras agotar reinicios, estado degradado accionable.
// `fallos` cuenta crashes consecutivos sin llegar a 'listo': un servicio que
// arranca y muere en bucle termina en degradado, no en reinicio eterno.

export type EstadoSupervisor =
  | { fase: 'parado' }
  | { fase: 'arrancando'; epoch: number; fallos: number }
  | { fase: 'activo'; epoch: number }
  | { fase: 'muriendo'; epoch: number }
  | { fase: 'esperando-reinicio'; epoch: number; fallos: number }
  | { fase: 'degradado'; motivo: string };

export type EventoSupervisor =
  | { tipo: 'iniciar' }
  | { tipo: 'proceso-listo'; epoch: number }
  | { tipo: 'salio'; epoch: number }
  | { tipo: 'temporizador-cumplido' }
  | { tipo: 'cerrar' };

export type AccionSupervisor =
  | { tipo: 'lanzar-proceso'; epoch: number }
  | { tipo: 'programar-reinicio'; retrasoMs: number }
  | { tipo: 'descartar-pendientes'; epoch: number }
  | { tipo: 'declarar-degradado'; motivo: string }
  | { tipo: 'nada' };

export const MAX_FALLOS_CONSECUTIVOS = 4;
export const RETRASO_BASE_MS = 250;

const MOTIVO_DEGRADADO = 'el servicio de datos no consigue mantenerse en marcha';

export interface Transicion {
  estado: EstadoSupervisor;
  acciones: AccionSupervisor[];
}

export function retrasoParaFallo(fallos: number): number {
  return RETRASO_BASE_MS * 2 ** Math.max(0, fallos - 1);
}

export function transicionar(estado: EstadoSupervisor, evento: EventoSupervisor): Transicion {
  switch (evento.tipo) {
    case 'iniciar': {
      if (estado.fase !== 'parado') return { estado, acciones: [{ tipo: 'nada' }] };
      const epoch = 1;
      return {
        estado: { fase: 'arrancando', epoch, fallos: 0 },
        acciones: [{ tipo: 'lanzar-proceso', epoch }],
      };
    }

    case 'proceso-listo': {
      if (estado.fase !== 'arrancando' || estado.epoch !== evento.epoch) {
        // Un "listo" de un epoch viejo no resucita nada.
        return { estado, acciones: [{ tipo: 'nada' }] };
      }
      return { estado: { fase: 'activo', epoch: estado.epoch }, acciones: [{ tipo: 'nada' }] };
    }

    case 'salio': {
      // Solo el epoch vigente cuenta; la salida de un proceso viejo se ignora.
      if (
        (estado.fase !== 'activo' && estado.fase !== 'arrancando' && estado.fase !== 'muriendo') ||
        estado.epoch !== evento.epoch
      ) {
        return { estado, acciones: [{ tipo: 'nada' }] };
      }
      if (estado.fase === 'muriendo') {
        // Cierre ordenado: muerte confirmada, no se relanza.
        return {
          estado: { fase: 'parado' },
          acciones: [{ tipo: 'descartar-pendientes', epoch: estado.epoch }],
        };
      }
      // Crash con muerte confirmada: se puede programar un sucesor.
      const fallos = estado.fase === 'arrancando' ? estado.fallos + 1 : 1;
      if (fallos > MAX_FALLOS_CONSECUTIVOS) {
        return {
          estado: { fase: 'degradado', motivo: MOTIVO_DEGRADADO },
          acciones: [
            { tipo: 'descartar-pendientes', epoch: estado.epoch },
            { tipo: 'declarar-degradado', motivo: MOTIVO_DEGRADADO },
          ],
        };
      }
      return {
        estado: { fase: 'esperando-reinicio', epoch: estado.epoch, fallos },
        acciones: [
          { tipo: 'descartar-pendientes', epoch: estado.epoch },
          { tipo: 'programar-reinicio', retrasoMs: retrasoParaFallo(fallos) },
        ],
      };
    }

    case 'temporizador-cumplido': {
      if (estado.fase !== 'esperando-reinicio') return { estado, acciones: [{ tipo: 'nada' }] };
      const epoch = estado.epoch + 1;
      return {
        estado: { fase: 'arrancando', epoch, fallos: estado.fallos },
        acciones: [{ tipo: 'lanzar-proceso', epoch }],
      };
    }

    case 'cerrar': {
      if (estado.fase === 'activo' || estado.fase === 'arrancando') {
        return { estado: { fase: 'muriendo', epoch: estado.epoch }, acciones: [{ tipo: 'nada' }] };
      }
      return { estado: { fase: 'parado' }, acciones: [{ tipo: 'nada' }] };
    }
  }
}
