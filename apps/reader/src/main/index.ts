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
import { GestorKiwix } from './kiwix/proceso';
import { buscarEnZim, ErrorKiwix } from './kiwix/cliente';
import { VisorZim, type RecuadroVista } from './kiwix/vista';
import { VERSION_APP } from '../comun/versiones';
import type {
  CoincidenciaUI,
  EstadoAplicacion,
  EstadoZimUI,
  FichaUI,
  RecursoResumenUI,
  ResultadoZimUI,
} from '../comun/estado';
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

const kiwix = new GestorKiwix({
  dirBinario: join(rutas.root, 'TOOLS', 'kiwix'),
  dirZim: join(rutas.content, 'zim'),
  registro,
});

let ventana: BrowserWindow | null = null;
let visorZim: VisorZim | null = null;

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
  let catalogo: EstadoAplicacion['catalogo'] = { presente: false, recursos: 0 };
  if (fase.fase === 'activo') {
    epoch = fase.epoch;
    try {
      const estadoServicio = (await supervisor.enviar('estado')) as EstadoServicio;
      detalle = estadoServicio.listo ? 'operativo' : 'inicializando';
      corpus = estadoServicio.catalogo.corpusVersion;
      catalogo = {
        presente: estadoServicio.catalogo.presente,
        recursos: estadoServicio.catalogo.recursos,
      };
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
    catalogo,
    redExterna: 'bloqueada',
  };
});

/** Consulta al servicio de datos con emisor verificado. */
async function consultar(evento: Electron.IpcMainInvokeEvent, carga: unknown): Promise<unknown> {
  if (!emisorLegitimo(evento.senderFrame?.url ?? '')) {
    registro.aviso('ipc rechazado: emisor no autorizado');
    throw new Error('emisor no autorizado');
  }
  return supervisor.enviar('consultar', carga);
}

ipcMain.handle('biblioteca:listar', async (evento): Promise<RecursoResumenUI[]> => {
  return (await consultar(evento, { operacion: 'biblioteca-listar' })) as RecursoResumenUI[];
});

ipcMain.handle('biblioteca:ficha', async (evento, recursoId: unknown): Promise<FichaUI | null> => {
  if (typeof recursoId !== 'string') throw new Error('recursoId invalido');
  return (await consultar(evento, { operacion: 'recurso-ficha', recursoId })) as FichaUI | null;
});

ipcMain.handle('zim:estado', (evento): EstadoZimUI => {
  if (!emisorLegitimo(evento.senderFrame?.url ?? '')) throw new Error('emisor no autorizado');
  const estado = kiwix.estadoActual();
  return {
    fase: estado.fase,
    colecciones:
      estado.fase === 'activo'
        ? estado.colecciones.map((c) => ({
            nombre: c.nombre,
            titulo: c.titulo,
            idioma: c.idioma,
            fecha: c.fecha,
            editor: c.editor,
            articulos: c.articulos,
          }))
        : [],
    detalle: estado.fase === 'sin-binario' || estado.fase === 'fallido' ? estado.detalle : null,
  };
});

ipcMain.handle('zim:buscar', async (evento, texto: unknown): Promise<ResultadoZimUI[]> => {
  if (!emisorLegitimo(evento.senderFrame?.url ?? '')) throw new Error('emisor no autorizado');
  if (typeof texto !== 'string' || texto.trim().length === 0) return [];
  try {
    const respuesta = await buscarEnZim(kiwix.origen(), texto);
    return respuesta.resultados.map((r) => ({
      titulo: r.titulo,
      libro: r.libro,
      ruta: r.ruta,
      fragmento: r.fragmento,
    }));
  } catch (error) {
    // Kiwix caido o lento NUNCA rompe la busqueda: se informa y se sigue.
    if (error instanceof ErrorKiwix && error.codigo !== 'sin-servidor') {
      registro.aviso(`busqueda zim fallida: ${error.message}`);
    }
    return [];
  }
});

ipcMain.handle('zim:abrir', (evento, ruta: unknown, recuadro: unknown): boolean => {
  if (!emisorLegitimo(evento.senderFrame?.url ?? '')) throw new Error('emisor no autorizado');
  const origen = kiwix.origen();
  if (origen === null || typeof ruta !== 'string' || !ruta.startsWith('/content/')) return false;
  if (ventana === null) return false;
  visorZim ??= new VisorZim(ventana, registro);
  visorZim.mostrar(`${origen}${ruta}`, origen, recuadro as RecuadroVista);
  return true;
});

ipcMain.handle('zim:cerrar-visor', (evento): void => {
  if (!emisorLegitimo(evento.senderFrame?.url ?? '')) throw new Error('emisor no autorizado');
  visorZim?.ocultar();
});

ipcMain.handle('biblioteca:buscar', async (evento, texto: unknown): Promise<CoincidenciaUI[]> => {
  if (typeof texto !== 'string') throw new Error('consulta invalida');
  return (await consultar(evento, { operacion: 'buscar', texto })) as CoincidenciaUI[];
});

// --- Ciclo de vida -----------------------------------------------------------

void app.whenReady().then(() => {
  aplicarPoliticasDeSesion(session.defaultSession, politicaRed, registro);
  // El protocolo interno resuelve UUID -> ruta preguntando al servicio de
  // datos: el renderer nunca entrega rutas, solo identificadores.
  manejarProtocoloInterno(rutas.content, async (recursoId) => {
    try {
      const ruta = await supervisor.enviar('consultar', {
        operacion: 'ruta-original',
        recursoId,
      });
      return typeof ruta === 'string' ? ruta : null;
    } catch {
      return null;
    }
  });
  supervisor.iniciar();
  crearVentana();
  registro.info(`vestigio ${VERSION_APP} arrancado en modo ${rutas.modo}`);

  // Kiwix arranca en segundo plano: la biblioteca no espera por el, y si
  // no esta disponible la app funciona igual (criterio del bloque 08).
  void kiwix.iniciar().then((estado) => {
    if (estado.fase === 'activo') {
      politicaRed.origenKiwix = estado.origen;
      registro.info(`politica de red: origen kiwix permitido ${estado.origen}`);
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

let cerrandoOrdenadamente = false;
app.on('before-quit', (evento) => {
  if (cerrandoOrdenadamente) return;
  evento.preventDefault();
  cerrandoOrdenadamente = true;
  visorZim?.ocultar();
  void Promise.allSettled([supervisor.cerrar(), kiwix.detener()]).then(() => {
    limpiarTemporal(rutas);
    registro.info('cierre ordenado completado');
    app.quit();
  });
});
