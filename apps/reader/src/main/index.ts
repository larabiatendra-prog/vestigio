// Proceso principal de Vestigio: minimo por diseno (ADR-0002). Ciclo de vida,
// rutas portables, politicas de seguridad y supervision del servicio de datos.
// Nada de trabajo pesado sincrono aqui.

import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
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
import { ErrorServicio, SupervisorDatos } from './supervisor-datos';
import { randomUUID } from 'node:crypto';
import { GestorKiwix } from './kiwix/proceso';
import { buscarEnZim, ErrorKiwix } from './kiwix/cliente';
import { VisorZim } from './kiwix/vista';
import { esRecuadroValido } from './kiwix/recuadro';
import { VERSION_APP } from '../comun/versiones';
import type {
  EspacioPersonalUI,
  EstadoAplicacion,
  EstadoZimUI,
  FichaUI,
  InformeCierreUI,
  InspeccionPaqueteUI,
  NotaUI,
  RecursoResumenUI,
  RelacionadoUI,
  ResultadoBusquedaUI,
  ResultadoExportacionUI,
  ResultadoImportacionUI,
  ResultadoMutacionUI,
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

/**
 * Cuando Daniel pide "preparar para copiar", Vestigio suelta bases y Kiwix y
 * se queda mirando. Este interruptor lo recuerda para que la pantalla lo diga
 * y el cierre no intente cerrar dos veces lo que ya esta cerrado.
 */
let preparadoParaCopiar = false;

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
    preparadoParaCopiar,
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
  if (ventana === null || !esRecuadroValido(recuadro)) return false;
  visorZim ??= new VisorZim(ventana, registro, (url) => {
    // La URL viene del contenido del ZIM: es dato ajeno. Se manda como
    // texto y la ventana la enseña como texto, nunca como enlace vivo.
    ventana?.webContents.send('zim:enlace-externo', url.slice(0, 500));
  });
  visorZim.mostrar(`${origen}${ruta}`, origen, recuadro);
  return true;
});

/**
 * Recoloca la vista nativa sin volver a cargar el articulo. La vista de
 * Kiwix la dibuja el sistema encima de la ventana, asi que hay que moverla
 * a mano cuando la pagina hace scroll o cambia de tamano; hacerlo con
 * 'zim:abrir' recargaba el articulo y tiraba la lectura.
 */
ipcMain.handle('zim:recolocar', (evento, recuadro: unknown): void => {
  if (!emisorLegitimo(evento.senderFrame?.url ?? '')) throw new Error('emisor no autorizado');
  if (!esRecuadroValido(recuadro)) return;
  visorZim?.redimensionar(recuadro);
});

ipcMain.handle('zim:cerrar-visor', (evento): void => {
  if (!emisorLegitimo(evento.senderFrame?.url ?? '')) throw new Error('emisor no autorizado');
  visorZim?.ocultar();
});

ipcMain.handle(
  'biblioteca:buscar',
  async (evento, texto: unknown, opciones: unknown): Promise<ResultadoBusquedaUI | null> => {
    if (typeof texto !== 'string') throw new Error('consulta invalida');
    const o = (typeof opciones === 'object' && opciones !== null ? opciones : {}) as {
      avanzado?: boolean;
      sinonimos?: boolean;
      filtros?: unknown;
    };
    return (await consultar(evento, {
      operacion: 'buscar',
      texto,
      avanzado: o.avanzado === true,
      sinonimos: o.sinonimos !== false,
      filtros: o.filtros,
    })) as ResultadoBusquedaUI | null;
  },
);

ipcMain.handle(
  'biblioteca:relacionados',
  async (evento, recursoId: unknown): Promise<RelacionadoUI[]> => {
    if (typeof recursoId !== 'string') throw new Error('recursoId invalido');
    return (await consultar(evento, { operacion: 'relacionados', recursoId })) as RelacionadoUI[];
  },
);

// --- IPC: espacio personal (bloque 12) --------------------------------------

const ESPACIO_VACIO: EspacioPersonalUI = {
  disponible: false,
  motivo: 'el servicio de datos no está disponible ahora mismo',
  favoritos: [],
  colecciones: [],
  notas: [],
  marcadores: [],
  progreso: [],
  recientes: [],
  papelera: [],
  ajustes: {},
};

ipcMain.handle('personal:espacio', async (evento): Promise<EspacioPersonalUI> => {
  try {
    return (await consultar(evento, { operacion: 'espacio-personal' })) as EspacioPersonalUI;
  } catch (error) {
    // Que el servicio este reiniciando no puede dejar la pantalla en blanco.
    return { ...ESPACIO_VACIO, motivo: error instanceof Error ? error.message : 'sin respuesta' };
  }
});

ipcMain.handle('personal:buscar-notas', async (evento, texto: unknown): Promise<NotaUI[]> => {
  if (typeof texto !== 'string') throw new Error('texto invalido');
  return (await consultar(evento, {
    operacion: 'notas-buscar',
    texto: texto.slice(0, 200),
  })) as NotaUI[];
});

/**
 * Comprobacion estructural minima en el main. La autoridad sobre el contrato
 * es el servicio de datos (`esOperacionMutacion`), que valida cada campo con
 * sus limites: aqui solo se descarta lo que ni siquiera tiene forma de
 * operacion, para no despertar al servicio con basura.
 */
function pareceOperacionPersonal(valor: unknown): valor is { operacion: string } {
  if (typeof valor !== 'object' || valor === null) return false;
  const operacion = (valor as Record<string, unknown>)['operacion'];
  if (typeof operacion !== 'string' || operacion.length === 0 || operacion.length > 40) {
    return false;
  }
  return JSON.stringify(valor).length <= 64 * 1024;
}

ipcMain.handle(
  'personal:mutar',
  async (evento, operacion: unknown): Promise<ResultadoMutacionUI> => {
    if (!emisorLegitimo(evento.senderFrame?.url ?? '')) {
      registro.aviso('ipc personal:mutar rechazado: emisor no autorizado');
      throw new Error('emisor no autorizado');
    }
    if (!pareceOperacionPersonal(operacion)) {
      return { ok: false, estado: 'rechazada', mensaje: 'la operación no tiene forma válida' };
    }
    try {
      const resultado = await supervisor.enviar('mutar', operacion, randomUUID());
      return {
        ok: true,
        estado: resultado === 'ya-aplicada' ? 'ya-aplicada' : 'aplicada',
        mensaje: null,
      };
    } catch (error) {
      const codigo = error instanceof ErrorServicio ? error.codigo : 'error';
      if (codigo === 'resultado-desconocido') {
        // Jamas se reintenta a ciegas: se dice la verdad y Daniel decide.
        return {
          ok: false,
          estado: 'desconocida',
          mensaje:
            'no se sabe si el cambio llegó a guardarse. Comprueba antes de repetirlo: Vestigio no lo reintenta por su cuenta.',
        };
      }
      if (codigo === 'solo-lectura') {
        return {
          ok: false,
          estado: 'rechazada',
          mensaje: 'el soporte es de solo lectura: nada de lo que hagas aquí se guardará',
        };
      }
      return {
        ok: false,
        estado: 'rechazada',
        mensaje: error instanceof Error ? error.message : 'no se pudo guardar',
      };
    }
  },
);

/** True si la ruta cae dentro de la propia entrega portable. */
function dentroDelRoot(ruta: string): boolean {
  const raiz = resolve(rutas.root);
  const destino = resolve(ruta);
  return destino === raiz || destino.startsWith(raiz + sep);
}

function fechaDeFichero(): string {
  return new Date().toISOString().slice(0, 10);
}

ipcMain.handle('personal:exportar', async (evento): Promise<ResultadoExportacionUI> => {
  if (!emisorLegitimo(evento.senderFrame?.url ?? '')) throw new Error('emisor no autorizado');
  if (ventana === null) throw new Error('sin ventana');

  const eleccion = await dialog.showSaveDialog(ventana, {
    title: 'Guardar mi espacio personal',
    defaultPath: join(rutas.root, `vestigio-mi-espacio-${fechaDeFichero()}.zip`),
    filters: [{ name: 'Paquete de Vestigio', extensions: ['zip'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });
  if (eleccion.canceled || eleccion.filePath.length === 0) {
    return { ok: false, ruta: null, bytes: null, cancelado: true, mensaje: null };
  }

  try {
    const resultado = (await supervisor.enviar(
      'mantenimiento',
      {
        accion: 'exportar',
        destino: eleccion.filePath,
        dirTemporal: join(rutas.runtime, 'exportacion'),
        generado: new Date().toISOString(),
        app: VERSION_APP,
      },
      undefined,
      30000,
    )) as { ruta: string; bytes: number };
    return {
      ok: true,
      ruta: resultado.ruta,
      bytes: resultado.bytes,
      cancelado: false,
      // Copia honesta: guardarla en el mismo USB no protege de perder el USB.
      mensaje: dentroDelRoot(resultado.ruta)
        ? 'La copia ha quedado dentro de la propia carpeta de Vestigio: viaja con ella, así que no te protege si pierdes o se estropea este soporte. Guarda otra en un disco distinto.'
        : null,
    };
  } catch (error) {
    return {
      ok: false,
      ruta: null,
      bytes: null,
      cancelado: false,
      mensaje: error instanceof Error ? error.message : 'no se pudo exportar',
    };
  }
});

/** Ultimo paquete inspeccionado con exito: solo ese se puede adoptar. */
let paqueteEnStaging: string | null = null;

ipcMain.handle('personal:inspeccionar', async (evento): Promise<InspeccionPaqueteUI> => {
  if (!emisorLegitimo(evento.senderFrame?.url ?? '')) throw new Error('emisor no autorizado');
  if (ventana === null) throw new Error('sin ventana');
  paqueteEnStaging = null;

  const eleccion = await dialog.showOpenDialog(ventana, {
    title: 'Abrir un paquete del espacio personal',
    filters: [{ name: 'Paquete de Vestigio', extensions: ['zip'] }],
    properties: ['openFile'],
  });
  const ruta = eleccion.filePaths[0];
  if (eleccion.canceled || ruta === undefined) {
    return {
      ok: false,
      cancelado: true,
      ruta: null,
      problemas: [],
      avisos: [],
      generado: null,
      app: null,
      corpus: null,
      resumen: null,
    };
  }

  try {
    const inspeccion = (await supervisor.enviar(
      'mantenimiento',
      {
        accion: 'inspeccionar',
        rutaZip: ruta,
        dirStaging: join(rutas.runtime, 'importacion'),
      },
      undefined,
      30000,
    )) as {
      ok: boolean;
      problemas: string[];
      avisos: string[];
      rutaBaseStaging: string | null;
      manifiesto: { generado: string; app: string; corpus: string | null } | null;
      resumen: InspeccionPaqueteUI['resumen'];
    };
    if (inspeccion.ok) paqueteEnStaging = inspeccion.rutaBaseStaging;
    return {
      ok: inspeccion.ok,
      cancelado: false,
      ruta,
      problemas: inspeccion.problemas,
      avisos: inspeccion.avisos,
      generado: inspeccion.manifiesto?.generado ?? null,
      app: inspeccion.manifiesto?.app ?? null,
      corpus: inspeccion.manifiesto?.corpus ?? null,
      resumen: inspeccion.resumen,
    };
  } catch (error) {
    return {
      ok: false,
      cancelado: false,
      ruta,
      problemas: [error instanceof Error ? error.message : 'no se pudo leer el paquete'],
      avisos: [],
      generado: null,
      app: null,
      corpus: null,
      resumen: null,
    };
  }
});

ipcMain.handle(
  'personal:adoptar',
  async (evento, modo: unknown): Promise<ResultadoImportacionUI> => {
    if (!emisorLegitimo(evento.senderFrame?.url ?? '')) throw new Error('emisor no autorizado');
    if (paqueteEnStaging === null) {
      return {
        ok: false,
        modo: null,
        filas: 0,
        mensaje: 'no hay ningún paquete verificado esperando: ábrelo primero',
      };
    }
    const modoValido = modo === 'reemplazar' ? 'reemplazar' : 'fusionar';
    try {
      const resultado = (await supervisor.enviar(
        'mantenimiento',
        { accion: 'adoptar', rutaBaseStaging: paqueteEnStaging, modo: modoValido },
        undefined,
        30000,
      )) as { modo: 'fusionar' | 'reemplazar'; filas: number };
      paqueteEnStaging = null;
      return { ok: true, modo: resultado.modo, filas: resultado.filas, mensaje: null };
    } catch (error) {
      return {
        ok: false,
        modo: modoValido,
        filas: 0,
        mensaje: error instanceof Error ? error.message : 'no se pudo importar',
      };
    }
  },
);

// --- IPC: preparar la carpeta para copiarla o expulsarla ---------------------

ipcMain.handle('sistema:preparar-copia', async (evento): Promise<InformeCierreUI> => {
  if (!emisorLegitimo(evento.senderFrame?.url ?? '')) throw new Error('emisor no autorizado');
  const problemas: string[] = [];
  let respaldo: InformeCierreUI['respaldo'] = 'no-aplica';
  let rutaRespaldo: string | null = null;

  if (rutas.modo === 'lectura-escritura') {
    try {
      const r = (await supervisor.enviar(
        'mantenimiento',
        { accion: 'respaldar', dirBackups: rutas.backups },
        undefined,
        30000,
      )) as { estado: 'hecho' | 'sin-cambios'; ruta: string | null };
      respaldo = r.estado;
      rutaRespaldo = r.ruta;
    } catch (error) {
      respaldo = 'fallido';
      problemas.push(
        `no se pudo hacer la copia previa: ${error instanceof Error ? error.message : 'error'}`,
      );
    }
  }

  // Cerrar el servicio de datos marca el cierre limpio y suelta los ficheros
  // SQLite; detener Kiwix suelta el ZIM y el puerto.
  const [cierre, kiwixParado] = await Promise.allSettled([supervisor.cerrar(), kiwix.detener()]);
  if (cierre.status === 'rejected') problemas.push('el servicio de datos no cerró del todo');
  if (kiwixParado.status === 'rejected')
    problemas.push('las colecciones no se detuvieron del todo');

  visorZim?.ocultar();
  preparadoParaCopiar = true;
  registro.info('carpeta preparada para copiar o expulsar');

  return {
    respaldo,
    rutaRespaldo,
    basesCerradas: cierre.status === 'fulfilled',
    kiwixDetenido: kiwixParado.status === 'fulfilled',
    problemas,
    aviso:
      'Vestigio ya no toca ningún fichero de la carpeta. Esto no es la expulsión segura de Windows: para sacar el USB, úsala igualmente desde la bandeja del sistema.',
  };
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
  // Si ya se preparo para copiar, bases y Kiwix estan cerrados: cerrar otra
  // vez seria inofensivo pero lento, y aqui no queremos hacer esperar.
  const tareas = preparadoParaCopiar ? [] : [supervisor.cerrar(), kiwix.detener()];
  void Promise.allSettled(tareas).then(() => {
    limpiarTemporal(rutas);
    registro.info('cierre ordenado completado');
    app.quit();
  });
});
