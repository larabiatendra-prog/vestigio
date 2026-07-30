// Visor de articulos ZIM en un WebContentsView aislado (plan §6.2/§6.3):
// sin preload, sin IPC, sandbox, sesion efimera propia, permisos y
// descargas denegados, y allowlist del ORIGEN EXACTO (no "todo loopback":
// otro servicio local no debe poder cargarse aqui).

import { BrowserWindow, WebContentsView, session } from 'electron';
import type { Registro } from '../registro';

const PARTICION_EFIMERA = 'vestigio-zim';

export interface RecuadroVista {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export class VisorZim {
  private vista: WebContentsView | null = null;

  constructor(
    private readonly ventana: BrowserWindow,
    private readonly registro: Registro,
  ) {}

  /** Muestra un articulo. `url` debe pertenecer al origen propio. */
  mostrar(url: string, origenPropio: string, recuadro: RecuadroVista): void {
    if (new URL(url).origin !== new URL(origenPropio).origin) {
      this.registro.aviso('visor zim: url fuera del origen propio, denegada');
      return;
    }

    if (this.vista === null) {
      // Sesion efimera propia: nada compartido con la app.
      const sesion = session.fromPartition(PARTICION_EFIMERA, { cache: false });
      sesion.setPermissionRequestHandler((_wc, permiso, cb) => {
        this.registro.aviso(`visor zim: permiso denegado (${permiso})`);
        cb(false);
      });
      sesion.setPermissionCheckHandler(() => false);
      sesion.on('will-download', (evento) => {
        evento.preventDefault();
      });
      // Allowlist del origen exacto: cualquier otro destino se cancela.
      sesion.webRequest.onBeforeRequest((detalles, cb) => {
        const permitida = ((): boolean => {
          try {
            const destino = new URL(detalles.url);
            return (
              destino.origin === new URL(origenPropio).origin ||
              destino.protocol === 'data:' ||
              destino.protocol === 'blob:'
            );
          } catch {
            return false;
          }
        })();
        if (!permitida) this.registro.aviso(`visor zim: bloqueado ${detalles.url.slice(0, 120)}`);
        cb({ cancel: !permitida });
      });

      this.vista = new WebContentsView({
        webPreferences: {
          session: sesion,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          // Sin preload: el visor no tiene ninguna via hacia Vestigio.
          // JavaScript desactivado por defecto (plan §6.2): las colecciones
          // documentales se leen bien sin el.
          javascript: false,
          webSecurity: true,
          allowRunningInsecureContent: false,
        },
      });
      this.vista.setBackgroundColor('#131110');
      this.vista.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      this.vista.webContents.on('will-navigate', (evento, destino) => {
        try {
          if (new URL(destino).origin !== new URL(origenPropio).origin) {
            evento.preventDefault();
            this.registro.aviso('visor zim: navegacion externa bloqueada');
          }
        } catch {
          evento.preventDefault();
        }
      });
      this.ventana.contentView.addChildView(this.vista);
    }

    this.vista.setBounds({
      x: recuadro.x,
      y: recuadro.y,
      width: recuadro.ancho,
      height: recuadro.alto,
    });
    void this.vista.webContents.loadURL(url);
  }

  redimensionar(recuadro: RecuadroVista): void {
    this.vista?.setBounds({
      x: recuadro.x,
      y: recuadro.y,
      width: recuadro.ancho,
      height: recuadro.alto,
    });
  }

  ocultar(): void {
    if (this.vista === null) return;
    this.ventana.contentView.removeChildView(this.vista);
    this.vista.webContents.close();
    this.vista = null;
  }
}
