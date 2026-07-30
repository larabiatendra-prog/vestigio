// Servicio de datos (utilityProcess): en este bloque es el esqueleto real
// del contrato — validacion de mensajes, mutaciones idempotentes y cierre
// ordenado. SQLite llega en el bloque 03 sobre esta misma base.
// Sin APIs de red por diseno (ADR-0002): este proceso jamas abre sockets.

import {
  esPeticion,
  type EstadoMutacion,
  type EstadoServicio,
  type Peticion,
  type Respuesta,
} from '../comun/mensajes';

const epochPropio = Number(process.env['VESTIGIO_EPOCH'] ?? '0');
const modo = process.env['VESTIGIO_MODO'] === 'solo-lectura' ? 'solo-lectura' : 'lectura-escritura';
const pruebasActivas = process.env['VESTIGIO_PRUEBAS'] === '1';

// Registro de mutaciones aplicadas: la misma mutacion dos veces no se
// reaplica, y su estado puede consultarse tras una respuesta perdida.
const mutacionesAplicadas = new Set<string>();

const puerto = process.parentPort;

function responder(respuesta: Respuesta): void {
  puerto.postMessage(respuesta);
}

function manejar(peticion: Peticion): void {
  switch (peticion.tipo) {
    case 'ping': {
      responder({ id: peticion.id, epoch: peticion.epoch, ok: true, resultado: 'pong' });
      return;
    }
    case 'estado': {
      const estado: EstadoServicio = { listo: true, modo, epoch: epochPropio };
      responder({ id: peticion.id, epoch: peticion.epoch, ok: true, resultado: estado });
      return;
    }
    case 'mutar': {
      if (modo === 'solo-lectura') {
        responder({
          id: peticion.id,
          epoch: peticion.epoch,
          ok: false,
          codigo: 'solo-lectura',
          mensaje: 'el medio es de solo lectura; no se aceptan mutaciones',
        });
        return;
      }
      const carga = peticion.carga as { accion?: string } | undefined;
      if (pruebasActivas && carga?.accion === 'simular-crash') {
        // Gancho de pruebas del supervisor (solo con VESTIGIO_PRUEBAS=1):
        // muere sin responder, dejando la mutacion en vuelo.
        process.exit(1);
      }
      const idMutacion = peticion.idMutacion ?? '';
      if (!mutacionesAplicadas.has(idMutacion)) {
        mutacionesAplicadas.add(idMutacion);
        // Aqui aplicaria la escritura real (bloque 03); el registro basta
        // para probar idempotencia y respuesta perdida.
      }
      responder({ id: peticion.id, epoch: peticion.epoch, ok: true, resultado: 'aplicada' });
      return;
    }
    case 'estado-mutacion': {
      const estado: EstadoMutacion = mutacionesAplicadas.has(peticion.idMutacion ?? '')
        ? 'aplicada'
        : 'desconocida';
      responder({ id: peticion.id, epoch: peticion.epoch, ok: true, resultado: estado });
      return;
    }
    case 'cerrar': {
      responder({ id: peticion.id, epoch: peticion.epoch, ok: true, resultado: 'cerrando' });
      // Salida ordenada tras vaciar la cola de mensajes.
      setImmediate(() => process.exit(0));
      return;
    }
  }
}

puerto.on('message', (evento) => {
  const mensaje: unknown = evento.data;
  if (!esPeticion(mensaje)) {
    // Mensaje fuera de contrato: se ignora y se deja constancia via stderr
    // (el supervisor ya registra los descartes de su lado).
    process.stderr.write('peticion fuera de contrato descartada\n');
    return;
  }
  manejar(mensaje);
});

puerto.postMessage({ tipo: 'listo', epoch: epochPropio });
