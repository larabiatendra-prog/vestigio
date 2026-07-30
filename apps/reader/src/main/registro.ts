// Logging rotativo simple, sin datos sensibles (plan §6.2): nunca se
// registran consultas del usuario, titulos leidos ni contenido de notas.

import { appendFileSync, existsSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LIMITE_BYTES = 1024 * 1024; // 1 MB por fichero
const COPIAS = 2;

export class Registro {
  private readonly fichero: string;

  constructor(dirLogs: string) {
    this.fichero = join(dirLogs, 'vestigio.log');
  }

  info(mensaje: string): void {
    this.escribir('INFO', mensaje);
  }

  aviso(mensaje: string): void {
    this.escribir('AVISO', mensaje);
  }

  error(mensaje: string): void {
    this.escribir('ERROR', mensaje);
  }

  private escribir(nivel: string, mensaje: string): void {
    try {
      this.rotarSiHaceFalta();
      appendFileSync(this.fichero, `${new Date().toISOString()} ${nivel} ${mensaje}\n`);
    } catch {
      // El logging nunca tumba la aplicacion.
    }
  }

  private rotarSiHaceFalta(): void {
    if (!existsSync(this.fichero)) return;
    if (statSync(this.fichero).size < LIMITE_BYTES) return;
    const ultima = `${this.fichero}.${String(COPIAS)}`;
    if (existsSync(ultima)) rmSync(ultima);
    for (let i = COPIAS - 1; i >= 1; i--) {
      const origen = `${this.fichero}.${String(i)}`;
      if (existsSync(origen)) renameSync(origen, `${this.fichero}.${String(i + 1)}`);
    }
    renameSync(this.fichero, `${this.fichero}.1`);
  }
}
