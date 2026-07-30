import { describe, expect, it } from 'vitest';
import {
  MAX_FALLOS_CONSECUTIVOS,
  transicionar,
  type EstadoSupervisor,
  type EventoSupervisor,
} from '../src/main/logica-supervisor';

function ejecutar(estado: EstadoSupervisor, eventos: EventoSupervisor[]) {
  const acciones = [];
  for (const evento of eventos) {
    const t = transicionar(estado, evento);
    estado = t.estado;
    acciones.push(...t.acciones);
  }
  return { estado, acciones };
}

describe('supervisor lease/epoch', () => {
  it('iniciar lanza el proceso con epoch 1', () => {
    const { estado, acciones } = ejecutar({ fase: 'parado' }, [{ tipo: 'iniciar' }]);
    expect(estado).toEqual({ fase: 'arrancando', epoch: 1, fallos: 0 });
    expect(acciones).toContainEqual({ tipo: 'lanzar-proceso', epoch: 1 });
  });

  it('nunca lanza un sucesor sin muerte confirmada: el crash programa, el temporizador lanza', () => {
    const { estado, acciones } = ejecutar({ fase: 'parado' }, [
      { tipo: 'iniciar' },
      { tipo: 'proceso-listo', epoch: 1 },
      { tipo: 'salio', epoch: 1 },
    ]);
    expect(estado.fase).toBe('esperando-reinicio');
    // Tras 'salio' se descarta y programa, pero no se lanza todavia.
    expect(acciones.filter((a) => a.tipo === 'lanzar-proceso')).toHaveLength(1); // solo el inicial
    expect(acciones).toContainEqual({ tipo: 'descartar-pendientes', epoch: 1 });

    const relanzo = transicionar(estado, { tipo: 'temporizador-cumplido' });
    expect(relanzo.estado).toEqual({ fase: 'arrancando', epoch: 2, fallos: 1 });
    expect(relanzo.acciones).toContainEqual({ tipo: 'lanzar-proceso', epoch: 2 });
  });

  it('la salida de un proceso de epoch viejo se ignora', () => {
    const activo: EstadoSupervisor = { fase: 'activo', epoch: 3 };
    const { estado, acciones } = ejecutar(activo, [{ tipo: 'salio', epoch: 2 }]);
    expect(estado).toEqual(activo);
    expect(acciones).toEqual([{ tipo: 'nada' }]);
  });

  it('un "listo" de un epoch viejo no resucita nada', () => {
    const esperando: EstadoSupervisor = { fase: 'esperando-reinicio', epoch: 2, fallos: 1 };
    const { estado } = ejecutar(esperando, [{ tipo: 'proceso-listo', epoch: 1 }]);
    expect(estado).toEqual(esperando);
  });

  it('un crashloop en arranque termina en degradado, no en reinicio eterno', () => {
    let estado: EstadoSupervisor = { fase: 'parado' };
    estado = transicionar(estado, { tipo: 'iniciar' }).estado;
    let declaroDegradado = false;
    for (let i = 0; i < MAX_FALLOS_CONSECUTIVOS + 1; i++) {
      const epoch = (estado as { epoch: number }).epoch;
      const trasCrash = transicionar(estado, { tipo: 'salio', epoch });
      estado = trasCrash.estado;
      if (trasCrash.acciones.some((a) => a.tipo === 'declarar-degradado')) {
        declaroDegradado = true;
        break;
      }
      estado = transicionar(estado, { tipo: 'temporizador-cumplido' }).estado;
    }
    expect(declaroDegradado).toBe(true);
    expect(estado.fase).toBe('degradado');
  });

  it('el exito resetea la cuenta de fallos', () => {
    let estado: EstadoSupervisor = { fase: 'parado' };
    estado = transicionar(estado, { tipo: 'iniciar' }).estado;
    estado = transicionar(estado, { tipo: 'salio', epoch: 1 }).estado; // fallo 1
    estado = transicionar(estado, { tipo: 'temporizador-cumplido' }).estado;
    estado = transicionar(estado, { tipo: 'proceso-listo', epoch: 2 }).estado; // sano
    estado = transicionar(estado, { tipo: 'salio', epoch: 2 }).estado; // crash desde activo
    expect(estado).toEqual({ fase: 'esperando-reinicio', epoch: 2, fallos: 1 });
  });

  it('el cierre ordenado no relanza: muriendo -> salio -> parado', () => {
    let estado: EstadoSupervisor = { fase: 'activo', epoch: 5 };
    estado = transicionar(estado, { tipo: 'cerrar' }).estado;
    expect(estado).toEqual({ fase: 'muriendo', epoch: 5 });
    const final = transicionar(estado, { tipo: 'salio', epoch: 5 });
    expect(final.estado).toEqual({ fase: 'parado' });
    expect(final.acciones.some((a) => a.tipo === 'lanzar-proceso')).toBe(false);
    expect(final.acciones).toContainEqual({ tipo: 'descartar-pendientes', epoch: 5 });
  });
});
