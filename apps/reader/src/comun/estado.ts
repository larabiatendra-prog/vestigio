// Estado que el main expone al renderer por el canal 'estado:obtener'.

import type { VersionesVisibles } from './versiones';

export interface EstadoAplicacion {
  versiones: VersionesVisibles;
  modo: 'lectura-escritura' | 'solo-lectura';
  rootPortable: string;
  servicioDatos: {
    fase: string;
    epoch: number | null;
    detalle: string | null;
  };
  /** Constante por diseno: la app no habla con el exterior. */
  redExterna: 'bloqueada';
}
