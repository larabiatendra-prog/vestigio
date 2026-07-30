// Proceso principal de Vestigio: minimo por diseno (ADR-0002). Ciclo de vida,
// rutas portables, politicas de seguridad y supervision del servicio de datos.
// Nada de trabajo pesado sincrono aqui.

import { app, BrowserWindow, ipcMain, session } from 'electron';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MARCADOR_ENTREGA,
  limpiarTemporal,
  prepararCarpetasMutables,
  resolverRutas,
  type RutasPortables,
} from './rutas-portables';
import { registrarEsquemaInterno, manejarProtocoloInterno } from './protocolo-interno';
import { aplicarPoliticasDeSesion, blindarVentana } from './seguridad';
import type { PoliticaRed } from './politica-red';
import { Registro } from './registro';
import { SupervisorDatos } from './supervisor-datos';
import { VERSION_APP } from '../comun/versiones';
import type { EstadoAplicacion } from '../comun/estado';
import type { EstadoServicio } from '../comun/mensajes';

declare const VENTANA_PRINCIPAL_WEBPACK_ENTRY: string;
declare const VENTANA_PRINCIPAL_PRELOAD_WEBPACK_ENTRY: string;

const enDesarrollo = !app.isPackaged;

// --- Root portable, resuelto antes de app.ready (plan §7) -------------------

function leerArgumento(nombre: string): string | undefined {
  const prefijo = `--${nombre}=`;
  const bruto = process.argv.find((arg) => arg.startsWith(prefijo));
  return bruto?.slice(prefijo.length);
}

function rootDeDesarrollo(): string {
  // En desarrollo no hay entrega: se usa una carpeta de trabajo del repo,
  // con marcador propio, que .gitignore excluye.
  const root = join(app.getAppPath(), '.portable-dev');
  mkdirSync(root, { recursive: true });
  const marcador = join(root, MARCADOR_ENTREGA);
  if (!existsSync(marcador)) writeFileSync(marcador, 'entrega de desarrollo\n');
  return root;
}

const rutas: RutasPortables = resolverRutas({
  execPath: process.execPath,
  version: VERSION_APP,
  pid: process.pid,
  rootExplicito: leerArgumento('portable-root') ?? (enDesarrollo ? rootDeDesarrollo() : undefined),
});

prepararCarpetasMutables(rutas);

// userData, sessionData, cache, logs y volcados bajo el root portable (o el
// temporal en solo lectura), fijados antes de ready.
app.setPath('userData', rutas.userData);
app.setPath('sessionData', join(rutas.runtime, 'sesion'));
app.setPath('logs', rutas.logs);
app.setPath('crashDumps', join(rutas.runtime, 'volcados'));

const registro = new Registro(rutas.logs);

// Single instance por root portable: el lock vive en userData, que ya cuelga
// del root, de modo que dos copias en discos distintos no se bloquean entre si.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

registrarEsquemaInterno();

const politicaRed: PoliticaRed = {
  origenKiwix: null, // no existe hasta el bloque 08
  desarrollo: enDesarrollo,
};

const supervisor = new SupervisorDatos(registro, rutas.modo, {
  userData: rutas.userData,
  content: rutas.content,
  backups: rutas.backups,
});

let ventana: BrowserWindow | null = null;

function crearVentana(): void {
  ventana = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#131110',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: VENTANA_PRINCIPAL_PRELOAD_WEBPACK_ENTRY,
    },
  });
  blindarVentana(ventana, VENTANA_PRINCIPAL_WEBPACK_ENTRY);
  ventana.webContents.on('preload-error', (_e, rutaPreload, error) => {
    registro.error(`preload fallo (${rutaPreload}): ${error.message}`);
  });
  if (enDesarrollo) {
    ventana.webContents.on('console-message', (_e, _nivel, mensaje) => {
      registro.info(`renderer consola: ${mensaje}`);
    });
  }
  ventana.once('ready-to-show', () => ventana?.show());
  ventana.on('closed', () => {
    ventana = null;
  });
  void ventana.loadURL(VENTANA_PRINCIPAL_WEBPACK_ENTRY);
  if (enDesarrollo) ventana.webContents.openDevTools({ mode: 'detach' });
}

app.on('second-instance', () => {
  if (ventana !== null) {
    if (ventana.isMinimized()) ventana.restore();
    ventana.focus();
  }
});

// --- IPC: canales enumerados con emisor verificado --------------------------

function emisorLegitimo(url: string): boolean {
  if (url === VENTANA_PRINCIPAL_WEBPACK_ENTRY || url.startsWith('vestigio://')) return true;
  // En desarrollo el dev server puede anexar /index.html a la entrada.
  if (enDesarrollo && url.startsWith('http://localhost:')) return true;
  return false;
}

let rendererConectado = false;

ipcMain.handle('estado:obtener', async (evento): Promise<EstadoAplicacion> => {
  if (!emisorLegitimo(evento.senderFrame?.url ?? '')) {
    registro.aviso('ipc estado:obtener rechazado: emisor no autorizado');
    throw new Error('emisor no autorizado');
  }
  if (!rendererConectado) {
    rendererConectado = true;
    registro.info('renderer conectado: primera consulta de estado recibida');
  }
  const fase = supervisor.estadoActual();
  let detalle: string | null = null;
  let epoch: number | null = null;
  let basePersonal: EstadoAplicacion['basePersonal'] = null;
  let corpus: string | null = null;
  if (fase.fase === 'activo') {
    epoch = fase.epoch;
    try {
      const estadoServicio = (await supervisor.enviar('estado')) as EstadoServicio;
      detalle = estadoServicio.listo ? 'operativo' : 'inicializando';
      corpus = estadoServicio.catalogo.corpusVersion;
      if (estadoServicio.basePersonal !== null) {
        basePersonal = {
          abierta: estadoServicio.basePersonal.abierta,
          cierreLimpioAnterior: estadoServicio.basePersonal.cierreLimpioAnterior,
          favoritos: estadoServicio.basePersonal.favoritos,
          notas: estadoServicio.basePersonal.notas,
        };
      }
    } catch (error) {
      detalle = error instanceof Error ? error.message : 'sin respuesta';
    }
  } else if (fase.fase === 'degradado') {
    detalle = fase.motivo;
  }
  return {
    versiones: { app: VERSION_APP, corpus, informacionVigente: null },
    modo: rutas.modo,
    rootPortable: rutas.root,
    servicioDatos: { fase: fase.fase, epoch, detalle },
    basePersonal,
    redExterna: 'bloqueada',
  };
});

// --- Ciclo de vida -----------------------------------------------------------

void app.whenReady().then(() => {
  aplicarPoliticasDeSesion(session.defaultSession, politicaRed, registro);
  manejarProtocoloInterno();
  supervisor.iniciar();
  crearVentana();
  registro.info(`vestigio ${VERSION_APP} arrancado en modo ${rutas.modo}`);
});

app.on('window-all-closed', () => {
  app.quit();
});

let cerrandoOrdenadamente = false;
app.on('before-quit', (evento) => {
  if (cerrandoOrdenadamente) return;
  evento.preventDefault();
  cerrandoOrdenadamente = true;
  void supervisor
    .cerrar()
    .catch(() => undefined)
    .then(() => {
      limpiarTemporal(rutas);
      registro.info('cierre ordenado completado');
      app.quit();
    });
});
