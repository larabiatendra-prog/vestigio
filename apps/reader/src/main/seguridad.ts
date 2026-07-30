// Politicas de seguridad de sesion y ventana (plan §6.3, ADR-0002).
// Un unico listener de webRequest por sesion: NetworkPolicyService decide.

import type { BrowserWindow, Session } from 'electron';
import { decidirPeticion, type PoliticaRed } from './politica-red';
import type { Registro } from './registro';

export function aplicarPoliticasDeSesion(
  sesion: Session,
  politica: PoliticaRed,
  registro: Registro,
): void {
  // Unico punto de decision de red de la sesion.
  sesion.webRequest.onBeforeRequest((detalles, callback) => {
    const decision = decidirPeticion(politica, detalles.url);
    if (!decision.permitida) registro.aviso(`peticion bloqueada: ${decision.motivo}`);
    callback({ cancel: !decision.permitida });
  });

  // Permisos denegados por defecto: esta app no usa camara, medios, etc.
  sesion.setPermissionRequestHandler((_wc, permiso, callback) => {
    registro.aviso(`permiso denegado: ${permiso}`);
    callback(false);
  });
  sesion.setPermissionCheckHandler(() => false);

  // Sin descargas en el lector.
  sesion.on('will-download', (evento, item) => {
    registro.aviso(`descarga bloqueada: ${item.getFilename()}`);
    evento.preventDefault();
  });
}

/** Bloquea navegacion y apertura de ventanas fuera de la entrada permitida. */
export function blindarVentana(ventana: BrowserWindow, urlPermitida: string): void {
  ventana.webContents.on('will-navigate', (evento, url) => {
    if (url !== urlPermitida) evento.preventDefault();
  });
  ventana.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  ventana.webContents.on('will-attach-webview', (evento) => {
    evento.preventDefault();
  });
}
