// Acceso del renderer al espacio personal (bloque 12).
//
// Un unico hook centraliza el estado y las mutaciones para que ninguna
// pantalla se invente su propia copia. Dos decisiones que importan:
//
//  - Nada se da por guardado hasta que el servicio responde. Si una mutacion
//    se pierde en vuelo, no se reintenta a ciegas: se cuenta lo que pasa.
//  - En un soporte de solo lectura hay una SESION TEMPORAL en memoria,
//    marcada como tal en todas las pantallas. Sirve para ir apuntando
//    mientras lees desde un USB bloqueado, y desaparece al cerrar. Nunca se
//    presenta como guardado (plan bloque 12, tarea 10).

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ColeccionUI,
  EspacioPersonalUI,
  MarcadorUI,
  NotaUI,
  OperacionPersonalUI,
  ProgresoUI,
} from '../comun/estado';

const ESPACIO_VACIO: EspacioPersonalUI = {
  disponible: false,
  motivo: null,
  favoritos: [],
  colecciones: [],
  notas: [],
  marcadores: [],
  progreso: [],
  recientes: [],
  papelera: [],
  ajustes: {},
};

export interface EspacioPersonal {
  espacio: EspacioPersonalUI;
  /** true cuando lo que se apunta solo vive en esta sesion. */
  temporal: boolean;
  cargando: boolean;
  /** Ultimo problema real que merece contarse; null si todo va bien. */
  aviso: string | null;
  descartarAviso: () => void;
  aplicar: (operacion: OperacionPersonalUI) => Promise<boolean>;
  recargar: () => void;
  // Consultas derivadas de uso constante.
  esFavorito: (recursoId: string) => boolean;
  notasDe: (recursoId: string) => NotaUI[];
  marcadoresDe: (recursoId: string) => MarcadorUI[];
  progresoDe: (recursoId: string) => ProgresoUI | null;
  coleccionesCon: (recursoId: string) => ColeccionUI[];
}

/** Aplica una operacion sobre el espacio en memoria (sesion temporal). */
function aplicarEnMemoria(
  espacio: EspacioPersonalUI,
  operacion: OperacionPersonalUI,
): EspacioPersonalUI {
  const ahora = new Date().toISOString();
  switch (operacion.operacion) {
    case 'favorito-poner':
      return espacio.favoritos.includes(operacion.recursoId)
        ? espacio
        : { ...espacio, favoritos: [...espacio.favoritos, operacion.recursoId] };
    case 'favorito-quitar':
      return { ...espacio, favoritos: espacio.favoritos.filter((f) => f !== operacion.recursoId) };
    case 'nota-crear':
      return {
        ...espacio,
        notas: [
          {
            id: operacion.id,
            destinoTipo: operacion.destinoTipo,
            recursoId: operacion.recursoId,
            segmento: operacion.segmento ?? null,
            pagina: operacion.pagina ?? null,
            ancla: operacion.ancla ?? null,
            contexto: operacion.contexto ?? null,
            texto: operacion.texto,
            creada: ahora,
            modificada: null,
          },
          ...espacio.notas,
        ],
      };
    case 'nota-editar':
      return {
        ...espacio,
        notas: espacio.notas.map((n) =>
          n.id === operacion.id ? { ...n, texto: operacion.texto, modificada: ahora } : n,
        ),
      };
    case 'nota-borrar':
      return { ...espacio, notas: espacio.notas.filter((n) => n.id !== operacion.id) };
    case 'marcador-poner':
      return {
        ...espacio,
        marcadores: [
          ...espacio.marcadores.filter(
            (m) =>
              !(m.recursoId === operacion.recursoId && m.localizador === operacion.localizador),
          ),
          {
            id: operacion.id,
            recursoId: operacion.recursoId,
            localizador: operacion.localizador,
            etiqueta: operacion.etiqueta ?? null,
            creado: ahora,
          },
        ],
      };
    case 'marcador-quitar':
      return {
        ...espacio,
        marcadores: espacio.marcadores.filter(
          (m) => !(m.recursoId === operacion.recursoId && m.localizador === operacion.localizador),
        ),
      };
    case 'progreso-guardar':
      return {
        ...espacio,
        progreso: [
          ...espacio.progreso.filter((p) => p.recursoId !== operacion.recursoId),
          {
            recursoId: operacion.recursoId,
            localizador: operacion.localizador,
            pagina: operacion.pagina ?? null,
            porcentaje: operacion.porcentaje,
            fallbackTexto: operacion.fallbackTexto ?? null,
            actualizado: ahora,
          },
        ],
      };
    case 'ajuste-guardar':
      return { ...espacio, ajustes: { ...espacio.ajustes, [operacion.clave]: operacion.valor } };
    default:
      // Colecciones y papelera no tienen sentido sin persistencia: en la
      // sesion temporal se quedan fuera en vez de fingir que funcionan.
      return espacio;
  }
}

export function useEspacioPersonal(): EspacioPersonal {
  const [espacio, setEspacio] = useState<EspacioPersonalUI>(ESPACIO_VACIO);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);

  const recargar = useCallback(() => {
    window.vestigio
      .espacioPersonal()
      .then((nuevo) => {
        setEspacio((previo) =>
          // En sesion temporal no se pisa lo apuntado con la respuesta vacia
          // del servicio: lo de memoria es lo unico que hay.
          nuevo.disponible ? nuevo : { ...nuevo, ...recuperarTemporal(previo) },
        );
      })
      .catch(() => undefined)
      .finally(() => {
        setCargando(false);
      });
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const aplicar = useCallback(
    async (operacion: OperacionPersonalUI): Promise<boolean> => {
      if (!espacio.disponible) {
        setEspacio((previo) => aplicarEnMemoria(previo, operacion));
        return true;
      }
      const resultado = await window.vestigio.mutarPersonal(operacion);
      if (resultado.ok) {
        recargar();
        return true;
      }
      setAviso(resultado.mensaje ?? 'no se pudo guardar el cambio');
      // Aunque falle, se recarga: asi la pantalla muestra la verdad y no lo
      // que Daniel creia haber hecho.
      recargar();
      return false;
    },
    [espacio.disponible, recargar],
  );

  const favoritos = useMemo(() => new Set(espacio.favoritos), [espacio.favoritos]);

  return {
    espacio,
    temporal: !espacio.disponible,
    cargando,
    aviso,
    descartarAviso: useCallback(() => {
      setAviso(null);
    }, []),
    aplicar,
    recargar,
    esFavorito: useCallback((recursoId: string) => favoritos.has(recursoId), [favoritos]),
    notasDe: useCallback(
      (recursoId: string) => espacio.notas.filter((n) => n.recursoId === recursoId),
      [espacio.notas],
    ),
    marcadoresDe: useCallback(
      (recursoId: string) => espacio.marcadores.filter((m) => m.recursoId === recursoId),
      [espacio.marcadores],
    ),
    progresoDe: useCallback(
      (recursoId: string) => espacio.progreso.find((p) => p.recursoId === recursoId) ?? null,
      [espacio.progreso],
    ),
    coleccionesCon: useCallback(
      (recursoId: string) => espacio.colecciones.filter((c) => c.recursos.includes(recursoId)),
      [espacio.colecciones],
    ),
  };
}

/** Lo apuntado en la sesion temporal, que ninguna recarga debe borrar. */
function recuperarTemporal(previo: EspacioPersonalUI): Partial<EspacioPersonalUI> {
  return {
    favoritos: previo.favoritos,
    notas: previo.notas,
    marcadores: previo.marcadores,
    progreso: previo.progreso,
    ajustes: previo.ajustes,
  };
}

/** Identificador de nota o marcador: aqui no hay servidor que los ponga. */
export function nuevoId(): string {
  return crypto.randomUUID();
}
