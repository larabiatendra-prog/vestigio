// KiwixProcessManager (plan §6.2, bloque 08 t.2): kiwix-serve como proceso
// separado, ligado a 127.0.0.1, con puerto dinamico verificado por
// health-check de identidad (no basta que "algo" responda en el puerto),
// reinicios acotados y cierre garantizado. Si Kiwix falla, la biblioteca
// SQLite sigue funcionando: es una degradacion, no un error fatal.

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { analizarCatalogo, type ColeccionZim } from './contrato.js';
import type { Registro } from '../registro';

const PUERTO_MIN = 41800;
const PUERTO_MAX = 41899;
const INTENTOS_PUERTO = 6;
const MS_ESPERA_ARRANQUE = 15000;
const MS_ENTRE_SONDEOS = 250;
const MS_CIERRE = 4000;

export type EstadoKiwix =
  | { fase: 'apagado' }
  | { fase: 'sin-binario'; detalle: string }
  | { fase: 'sin-colecciones' }
  | { fase: 'arrancando' }
  | { fase: 'activo'; origen: string; puerto: number; colecciones: ColeccionZim[] }
  | { fase: 'fallido'; detalle: string };

export interface OpcionesKiwix {
  /** Carpeta con kiwix-serve.exe (TOOLS/kiwix en la entrega). */
  dirBinario: string;
  /** Carpeta CONTENT/zim con los archivos .zim. */
  dirZim: string;
  registro: Registro;
}

function puertoAleatorio(): number {
  return PUERTO_MIN + Math.floor(Math.random() * (PUERTO_MAX - PUERTO_MIN + 1));
}

function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class GestorKiwix {
  private estado: EstadoKiwix = { fase: 'apagado' };
  private proceso: ChildProcess | null = null;
  private cerrando = false;

  constructor(private readonly opciones: OpcionesKiwix) {}

  estadoActual(): EstadoKiwix {
    return this.estado;
  }

  /** Origen exacto propiedad de Vestigio, o null si no hay servidor. */
  origen(): string | null {
    return this.estado.fase === 'activo' ? this.estado.origen : null;
  }

  private rutaBinario(): string {
    return join(this.opciones.dirBinario, 'kiwix-serve.exe');
  }

  private listarZim(): string[] {
    try {
      return readdirSync(this.opciones.dirZim)
        .filter((f) => f.toLowerCase().endsWith('.zim'))
        .sort();
    } catch {
      return [];
    }
  }

  /**
   * Arranca kiwix-serve. Secuencia anti-TOCTOU: spawn -> proceso vivo ->
   * health-check que identifica ESTA instancia -> aceptar. Si el puerto
   * pertenece a otro proceso, se cierra y se reintenta con otro puerto.
   */
  async iniciar(): Promise<EstadoKiwix> {
    const binario = this.rutaBinario();
    if (!existsSync(binario)) {
      this.estado = {
        fase: 'sin-binario',
        detalle: `no se encontro kiwix-serve.exe en ${this.opciones.dirBinario}`,
      };
      this.opciones.registro.info('kiwix: sin binario; la biblioteca funciona igual');
      return this.estado;
    }

    const zims = this.listarZim();
    if (zims.length === 0) {
      this.estado = { fase: 'sin-colecciones' };
      this.opciones.registro.info('kiwix: no hay archivos ZIM; no se arranca el servidor');
      return this.estado;
    }

    this.estado = { fase: 'arrancando' };

    for (let intento = 1; intento <= INTENTOS_PUERTO; intento++) {
      const puerto = puertoAleatorio();
      const origen = `http://127.0.0.1:${String(puerto)}`;
      const proceso = spawn(
        binario,
        [
          `--port=${String(puerto)}`,
          // Solo loopback: jamas 0.0.0.0 ni la IP de la LAN.
          '--address=127.0.0.1',
          // Impide que el visor navegue a enlaces externos del ZIM.
          '--blockexternal',
          // Si Vestigio muere de golpe, kiwix-serve se va con el.
          `--attachToProcess=${String(process.pid)}`,
          '--nolibrarybutton',
          '--skipInvalid',
          ...zims,
        ],
        {
          // Gotcha conocido: kiwix-serve enruta desde su directorio de
          // trabajo; pasar rutas con directorios rompe el enrutado.
          cwd: this.opciones.dirZim,
          stdio: ['ignore', 'ignore', 'pipe'],
          windowsHide: true,
        },
      );

      proceso.stderr?.on('data', (datos: Buffer) => {
        const linea = datos.toString('utf8').trim();
        if (linea.length > 0) this.opciones.registro.aviso(`kiwix: ${linea.slice(0, 300)}`);
      });

      let salioSolo = false;
      proceso.once('exit', (codigo) => {
        salioSolo = true;
        if (this.proceso === proceso) this.proceso = null;
        if (!this.cerrando && this.estado.fase === 'activo') {
          this.opciones.registro.aviso(`kiwix murio (codigo ${String(codigo)})`);
          this.estado = { fase: 'fallido', detalle: 'el servidor de colecciones se detuvo' };
        }
      });

      this.proceso = proceso;
      const identidad = await this.esperarIdentidad(origen, () => salioSolo);

      if (identidad !== null) {
        this.estado = { fase: 'activo', origen, puerto, colecciones: identidad };
        this.opciones.registro.info(
          `kiwix activo en ${origen} con ${String(identidad.length)} coleccion(es): ${identidad
            .map((c) => c.nombre)
            .join(', ')}`,
        );
        return this.estado;
      }

      // Puerto ocupado por otro o arranque fallido: cerrar y reintentar.
      this.matar(proceso);
      this.opciones.registro.aviso(
        `kiwix: intento ${String(intento)} fallido en el puerto ${String(puerto)}`,
      );
    }

    this.estado = {
      fase: 'fallido',
      detalle: 'no se pudo arrancar el servidor de colecciones tras varios intentos',
    };
    return this.estado;
  }

  /**
   * Health-check que IDENTIFICA la instancia: no basta con que el puerto
   * responda, debe servir el catalogo con nuestras colecciones.
   */
  private async esperarIdentidad(
    origen: string,
    murio: () => boolean,
  ): Promise<ColeccionZim[] | null> {
    const limite = Date.now() + MS_ESPERA_ARRANQUE;
    while (Date.now() < limite) {
      if (murio()) return null;
      try {
        const respuesta = await fetch(`${origen}/catalog/v2/entries`, {
          signal: AbortSignal.timeout(2000),
        });
        if (respuesta.ok) {
          const xml = await respuesta.text();
          const colecciones = analizarCatalogo(xml);
          if (colecciones.length > 0) return colecciones;
        }
      } catch {
        // aun no escucha
      }
      await esperar(MS_ENTRE_SONDEOS);
    }
    return null;
  }

  private matar(proceso: ChildProcess): void {
    try {
      proceso.kill();
    } catch {
      // ya estaba muerto
    }
  }

  /** Cierre garantizado: al salir Vestigio no queda proceso huerfano. */
  async detener(): Promise<void> {
    this.cerrando = true;
    const proceso = this.proceso;
    this.estado = { fase: 'apagado' };
    if (proceso === null) return;

    await new Promise<void>((resolver) => {
      const plazo = setTimeout(() => {
        this.matar(proceso);
        resolver();
      }, MS_CIERRE);
      proceso.once('exit', () => {
        clearTimeout(plazo);
        resolver();
      });
      this.matar(proceso);
    });
    this.proceso = null;
  }
}
