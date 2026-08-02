// Visor de articulos ZIM en un WebContentsView aislado (plan §6.2/§6.3):
// sin preload, sin IPC, sandbox, sesion efimera propia, permisos y
// descargas denegados, y allowlist del ORIGEN EXACTO (no "todo loopback":
// otro servicio local no debe poder cargarse aqui).

import { BrowserWindow, WebContentsView, session } from 'electron';
import type { Registro } from '../registro';
import type { RecuadroVista } from './recuadro';

const PARTICION_EFIMERA = 'vestigio-zim';

export type { RecuadroVista };

export class VisorZim {
  private vista: WebContentsView | null = null;
  /** Ultima URL cargada: recolocar la vista no debe recargar el articulo. */
  private urlCargada: string | null = null;

  constructor(
    private readonly ventana: BrowserWindow,
    private readonly registro: Registro,
    /** Se avisa de cada enlace que sale fuera para poder explicarlo. */
    private readonly alBloquearEnlace: (url: string) => void = () => undefined,
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
            // Bloquear en silencio deja al lector pulsando un enlace que no
            // hace nada. El plan (bloque 11 t.6) exige explicarlo: se avisa
            // hacia arriba para que la ventana lo cuente y ofrezca copiarlo.
            this.alBloquearEnlace(destino);
          } else {
            // Navegacion interna del propio ZIM: es legitima y hay que
            // recordarla, o recolocar la vista devolveria al articulo viejo.
            this.urlCargada = destino;
          }
        } catch {
          evento.preventDefault();
        }
      });
      this.ventana.contentView.addChildView(this.vista);
    }

    this.redimensionar(recuadro);
    // Solo se carga si de verdad cambia el articulo: mover el recuadro al
    // hacer scroll no puede tirar la lectura por la borda.
    if (this.urlCargada !== url) {
      this.urlCargada = url;
      void this.vista.webContents.loadURL(url);
    }
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
    this.urlCargada = null;
  }
}
