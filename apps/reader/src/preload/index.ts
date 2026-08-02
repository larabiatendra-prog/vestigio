// Preload minimo (plan §6.3): expone una API enumerada y tipada, nada
// generico. El renderer no ve Node ni Electron.

import { contextBridge, ipcRenderer } from 'electron';
import type {
  EspacioPersonalUI,
  EstadoAplicacion,
  EstadoZimUI,
  FichaUI,
  FiltrosUI,
  InformeCierreUI,
  InspeccionPaqueteUI,
  NotaUI,
  OperacionPersonalUI,
  RecursoResumenUI,
  RelacionadoUI,
  ResultadoBusquedaUI,
  ResultadoExportacionUI,
  ResultadoImportacionUI,
  ResultadoMutacionUI,
  ResultadoZimUI,
} from '../comun/estado';

const api = {
  obtenerEstado: (): Promise<EstadoAplicacion> => ipcRenderer.invoke('estado:obtener'),
  listarBiblioteca: (): Promise<RecursoResumenUI[]> => ipcRenderer.invoke('biblioteca:listar'),
  obtenerFicha: (recursoId: string): Promise<FichaUI | null> =>
    ipcRenderer.invoke('biblioteca:ficha', recursoId),
  relacionados: (recursoId: string): Promise<RelacionadoUI[]> =>
    ipcRenderer.invoke('biblioteca:relacionados', recursoId),
  buscar: (
    texto: string,
    opciones?: { avanzado?: boolean; sinonimos?: boolean; filtros?: FiltrosUI },
  ): Promise<ResultadoBusquedaUI | null> =>
    ipcRenderer.invoke('biblioteca:buscar', texto, opciones ?? {}),

  estadoZim: (): Promise<EstadoZimUI> => ipcRenderer.invoke('zim:estado'),
  buscarZim: (texto: string): Promise<ResultadoZimUI[]> => ipcRenderer.invoke('zim:buscar', texto),
  abrirZim: (
    ruta: string,
    recuadro: { x: number; y: number; ancho: number; alto: number },
  ): Promise<boolean> => ipcRenderer.invoke('zim:abrir', ruta, recuadro),
  recolocarZim: (recuadro: { x: number; y: number; ancho: number; alto: number }): Promise<void> =>
    ipcRenderer.invoke('zim:recolocar', recuadro),
  cerrarVisorZim: (): Promise<void> => ipcRenderer.invoke('zim:cerrar-visor'),
  /**
   * Avisa de un enlace del articulo que salia a Internet y se ha bloqueado.
   * Se entrega solo la cadena, nunca el evento de Electron, y devuelve la
   * funcion para darse de baja.
   */
  alBloquearEnlaceZim: (escuchar: (url: string) => void): (() => void) => {
    const oyente = (_evento: unknown, url: unknown): void => {
      if (typeof url === 'string') escuchar(url);
    };
    ipcRenderer.on('zim:enlace-externo', oyente);
    return () => {
      ipcRenderer.removeListener('zim:enlace-externo', oyente);
    };
  },

  // --- Espacio personal ------------------------------------------------------
  espacioPersonal: (): Promise<EspacioPersonalUI> => ipcRenderer.invoke('personal:espacio'),
  buscarNotas: (texto: string): Promise<NotaUI[]> =>
    ipcRenderer.invoke('personal:buscar-notas', texto),
  mutarPersonal: (operacion: OperacionPersonalUI): Promise<ResultadoMutacionUI> =>
    ipcRenderer.invoke('personal:mutar', operacion),

  exportarEspacio: (): Promise<ResultadoExportacionUI> => ipcRenderer.invoke('personal:exportar'),
  elegirPaquete: (): Promise<InspeccionPaqueteUI> => ipcRenderer.invoke('personal:inspeccionar'),
  adoptarPaquete: (modo: 'fusionar' | 'reemplazar'): Promise<ResultadoImportacionUI> =>
    ipcRenderer.invoke('personal:adoptar', modo),

  prepararParaCopiar: (): Promise<InformeCierreUI> => ipcRenderer.invoke('sistema:preparar-copia'),
};

export type ApiVestigio = typeof api;

contextBridge.exposeInMainWorld('vestigio', api);
