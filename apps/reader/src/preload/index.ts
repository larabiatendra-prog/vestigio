// Preload minimo (plan §6.3): expone una API enumerada y tipada, nada
// generico. El renderer no ve Node ni Electron.

import { contextBridge, ipcRenderer } from 'electron';
import type {
  CoincidenciaUI,
  EstadoAplicacion,
  EstadoZimUI,
  FichaUI,
  RecursoResumenUI,
  ResultadoZimUI,
} from '../comun/estado';

const api = {
  obtenerEstado: (): Promise<EstadoAplicacion> => ipcRenderer.invoke('estado:obtener'),
  listarBiblioteca: (): Promise<RecursoResumenUI[]> => ipcRenderer.invoke('biblioteca:listar'),
  obtenerFicha: (recursoId: string): Promise<FichaUI | null> =>
    ipcRenderer.invoke('biblioteca:ficha', recursoId),
  buscar: (texto: string): Promise<CoincidenciaUI[]> =>
    ipcRenderer.invoke('biblioteca:buscar', texto),
  estadoZim: (): Promise<EstadoZimUI> => ipcRenderer.invoke('zim:estado'),
  buscarZim: (texto: string): Promise<ResultadoZimUI[]> => ipcRenderer.invoke('zim:buscar', texto),
  abrirZim: (
    ruta: string,
    recuadro: { x: number; y: number; ancho: number; alto: number },
  ): Promise<boolean> => ipcRenderer.invoke('zim:abrir', ruta, recuadro),
  cerrarVisorZim: (): Promise<void> => ipcRenderer.invoke('zim:cerrar-visor'),
};

export type ApiVestigio = typeof api;

contextBridge.exposeInMainWorld('vestigio', api);
