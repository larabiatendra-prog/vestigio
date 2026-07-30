// Preload minimo (plan §6.3): expone una API enumerada y tipada, nada
// generico. El renderer no ve Node ni Electron.

import { contextBridge, ipcRenderer } from 'electron';
import type { EstadoAplicacion } from '../comun/estado';

const api = {
  obtenerEstado: (): Promise<EstadoAplicacion> => ipcRenderer.invoke('estado:obtener'),
};

export type ApiVestigio = typeof api;

contextBridge.exposeInMainWorld('vestigio', api);
