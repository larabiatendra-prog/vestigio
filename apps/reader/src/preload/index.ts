// Preload minimo (plan §6.3): expone una API enumerada y tipada, nada
// generico. El renderer no ve Node ni Electron.

import { contextBridge, ipcRenderer } from 'electron';
import type { CoincidenciaUI, EstadoAplicacion, FichaUI, RecursoResumenUI } from '../comun/estado';

const api = {
  obtenerEstado: (): Promise<EstadoAplicacion> => ipcRenderer.invoke('estado:obtener'),
  listarBiblioteca: (): Promise<RecursoResumenUI[]> => ipcRenderer.invoke('biblioteca:listar'),
  obtenerFicha: (recursoId: string): Promise<FichaUI | null> =>
    ipcRenderer.invoke('biblioteca:ficha', recursoId),
  buscar: (texto: string): Promise<CoincidenciaUI[]> =>
    ipcRenderer.invoke('biblioteca:buscar', texto),
};

export type ApiVestigio = typeof api;

contextBridge.exposeInMainWorld('vestigio', api);
