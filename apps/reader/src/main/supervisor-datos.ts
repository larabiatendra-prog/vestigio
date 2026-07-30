// Supervisor real del servicio de datos: conecta la maquina de estados pura
// (logica-supervisor) con utilityProcess. Garantias: un solo proceso vivo,
// respuestas de epochs viejos descartadas, mutaciones nunca reintentadas a
// ciegas (su perdida se reporta como resultado desconocido).

import { utilityProcess, type UtilityProcess } from 'electron';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { esRespuesta, type Peticion, type TipoPeticion } from '../comun/mensajes';
import {
  transicionar,
  type AccionSupervisor,
  type EstadoSupervisor,
  type EventoSupervisor,
} from './logica-supervisor';
import type { Registro } from './registro';

const TIMEOUT_PETICION_MS = 5000;
const TIMEOUT_CIERRE_MS = 3000;

export class ErrorServicio extends Error {
  constructor(
    public readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorServicio';
  }
}

interface Pendiente {
  epoch: number;
  tipo: TipoPeticion;
  resolver: (valor: unknown) => void;
  rechazar: (error: ErrorServicio) => void;
  temporizador: NodeJS.Timeout;
}

export class SupervisorDatos {
  private estado: EstadoSupervisor = { fase: 'parado' };
  private proceso: UtilityProcess | null = null;
  private readonly pendientes = new Map<string, Pendiente>();
  private temporizadorReinicio: NodeJS.Timeout | null = null;

  constructor(
    private readonly registro: Registro,
    private readonly modo: 'lectura-escritura' | 'solo-lectura',
    private readonly rutas: { userData: string; content: string; backups: string },
    private readonly alCambiar: (estado: EstadoSupervisor) => void = () => undefined,
  ) {}

  estadoActual(): EstadoSupervisor {
    return this.estado;
  }

  iniciar(): void {
    this.despachar({ tipo: 'iniciar' });
  }

  private despachar(evento: EventoSupervisor): void {
    const { estado, acciones } = transicionar(this.estado, evento);
    this.estado = estado;
    for (const accion of acciones) this.ejecutar(accion);
    this.alCambiar(this.estado);
  }

  private ejecutar(accion: AccionSupervisor): void {
    switch (accion.tipo) {
      case 'lanzar-proceso':
        this.lanzar(accion.epoch);
        break;
      case 'programar-reinicio':
        this.temporizadorReinicio = setTimeout(() => {
          this.temporizadorReinicio = null;
          this.despachar({ tipo: 'temporizador-cumplido' });
        }, accion.retrasoMs);
        break;
      case 'descartar-pendientes':
        this.descartarPendientes(accion.epoch);
        break;
      case 'declarar-degradado':
        this.registro.error(`servicio de datos degradado: ${accion.motivo}`);
        break;
      case 'nada':
        break;
    }
  }

  private lanzar(epoch: number): void {
    const ruta = join(__dirname, 'servicio_datos.js');
    const proceso = utilityProcess.fork(ruta, [], {
      serviceName: `vestigio-datos-${String(epoch)}`,
      env: {
        VESTIGIO_EPOCH: String(epoch),
        VESTIGIO_MODO: this.modo,
        VESTIGIO_RUTA_USER_DATA: this.rutas.userData,
        VESTIGIO_RUTA_CONTENT: this.rutas.content,
        VESTIGIO_RUTA_BACKUPS: this.rutas.backups,
        ...(process.env['VESTIGIO_PRUEBAS'] === '1' ? { VESTIGIO_PRUEBAS: '1' } : {}),
      },
    });
    this.proceso = proceso;
    this.registro.info(`servicio de datos lanzado (epoch ${String(epoch)})`);

    proceso.on('message', (mensaje: unknown) => {
      this.recibir(epoch, mensaje);
    });
    proceso.once('exit', (codigo) => {
      this.registro.info(
        `servicio de datos salio (epoch ${String(epoch)}, codigo ${String(codigo)})`,
      );
      if (this.proceso === proceso) this.proceso = null;
      this.despachar({ tipo: 'salio', epoch });
    });
  }

  private recibir(epoch: number, mensaje: unknown): void {
    if (
      typeof mensaje === 'object' &&
      mensaje !== null &&
      (mensaje as Record<string, unknown>)['tipo'] === 'listo'
    ) {
      this.despachar({ tipo: 'proceso-listo', epoch });
      return;
    }
    if (!esRespuesta(mensaje)) {
      this.registro.aviso('mensaje no reconocido del servicio de datos; descartado');
      return;
    }
    const epochVigente = this.epochVigente();
    if (mensaje.epoch !== epochVigente) return; // respuesta de un epoch viejo
    const pendiente = this.pendientes.get(mensaje.id);
    if (!pendiente) return;
    this.pendientes.delete(mensaje.id);
    clearTimeout(pendiente.temporizador);
    if (mensaje.ok) pendiente.resolver(mensaje.resultado);
    else pendiente.rechazar(new ErrorServicio(mensaje.codigo, mensaje.mensaje));
  }

  private epochVigente(): number | null {
    const e = this.estado;
    return e.fase === 'activo' || e.fase === 'arrancando' || e.fase === 'muriendo' ? e.epoch : null;
  }

  private descartarPendientes(epoch: number): void {
    for (const [id, pendiente] of this.pendientes) {
      if (pendiente.epoch !== epoch) continue;
      this.pendientes.delete(id);
      clearTimeout(pendiente.temporizador);
      if (pendiente.tipo === 'mutar') {
        // Nunca se reintenta una mutacion a ciegas: su estado se consulta
        // por idMutacion cuando el servicio vuelva.
        pendiente.rechazar(
          new ErrorServicio('resultado-desconocido', 'el servicio cayo con la mutacion en vuelo'),
        );
      } else {
        pendiente.rechazar(new ErrorServicio('servicio-reiniciado', 'la consulta se descarto'));
      }
    }
  }

  enviar(
    tipo: TipoPeticion,
    carga?: unknown,
    idMutacion?: string,
    timeoutMs = TIMEOUT_PETICION_MS,
  ): Promise<unknown> {
    const e = this.estado;
    if (e.fase !== 'activo' || this.proceso === null) {
      return Promise.reject(
        new ErrorServicio('servicio-no-disponible', `servicio de datos en fase ${e.fase}`),
      );
    }
    const peticion: Peticion = {
      id: randomUUID(),
      epoch: e.epoch,
      tipo,
      ...(idMutacion !== undefined ? { idMutacion } : {}),
      ...(carga !== undefined ? { carga } : {}),
    };
    return new Promise((resolver, rechazar) => {
      const temporizador = setTimeout(() => {
        this.pendientes.delete(peticion.id);
        rechazar(
          tipo === 'mutar'
            ? new ErrorServicio('resultado-desconocido', 'sin respuesta; consultar estado-mutacion')
            : new ErrorServicio('timeout', 'el servicio no respondio a tiempo'),
        );
      }, timeoutMs);
      this.pendientes.set(peticion.id, {
        epoch: e.epoch,
        tipo,
        resolver,
        rechazar,
        temporizador,
      });
      this.proceso?.postMessage(peticion);
    });
  }

  async cerrar(): Promise<void> {
    if (this.temporizadorReinicio !== null) {
      clearTimeout(this.temporizadorReinicio);
      this.temporizadorReinicio = null;
    }
    const proceso = this.proceso;
    if (this.estado.fase !== 'activo' && this.estado.fase !== 'arrancando') {
      this.despachar({ tipo: 'cerrar' });
      return;
    }
    try {
      await this.enviar('cerrar', undefined, undefined, 1000);
    } catch {
      // Si no responde, se mata igualmente tras el plazo.
    }
    this.despachar({ tipo: 'cerrar' });
    if (proceso === null) return;
    await new Promise<void>((resolver) => {
      const plazo = setTimeout(() => {
        proceso.kill();
        resolver();
      }, TIMEOUT_CIERRE_MS);
      proceso.once('exit', () => {
        clearTimeout(plazo);
        resolver();
      });
    });
  }
}
