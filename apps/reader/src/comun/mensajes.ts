// Contrato de mensajes entre main y el servicio de datos (utilityProcess).
// Cada peticion lleva id propio y epoch del supervisor: las respuestas de un
// epoch anterior se descartan (ADR-0002). Las mutaciones llevan ademas un
// idMutacion idempotente: tras perder una respuesta se consulta su estado,
// nunca se reintenta a ciegas.

export const TIPOS_PETICION = [
  'ping',
  'estado',
  'consultar',
  'mutar',
  'estado-mutacion',
  // Operaciones de mantenimiento del espacio personal (bloque 12): respaldo,
  // exportacion e importacion. No son consultas (tienen efecto) ni mutaciones
  // del contrato idempotente (no cambian datos de Daniel uno a uno).
  'mantenimiento',
  'cerrar',
] as const;

export type TipoPeticion = (typeof TIPOS_PETICION)[number];

export interface Peticion {
  id: string;
  epoch: number;
  tipo: TipoPeticion;
  /** Solo para tipo 'mutar' y 'estado-mutacion'. */
  idMutacion?: string;
  carga?: unknown;
}

export interface RespuestaOk {
  id: string;
  epoch: number;
  ok: true;
  resultado: unknown;
}

export interface RespuestaError {
  id: string;
  epoch: number;
  ok: false;
  /** Codigo estable y accionable, nunca un stack crudo. */
  codigo: string;
  mensaje: string;
}

export type Respuesta = RespuestaOk | RespuestaError;

export type EstadoMutacion = 'aplicada' | 'desconocida';

export interface EstadoServicio {
  listo: boolean;
  modo: 'lectura-escritura' | 'solo-lectura';
  epoch: number;
  basePersonal: {
    abierta: boolean;
    cierreLimpioAnterior: boolean;
    versionEsquema: number;
    favoritos: number;
    notas: number;
    hayCambios: boolean;
  } | null;
  catalogo: {
    presente: boolean;
    corpusVersion: string | null;
    recursos: number;
  };
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

export function esPeticion(valor: unknown): valor is Peticion {
  if (!esObjeto(valor)) return false;
  if (typeof valor['id'] !== 'string' || valor['id'].length === 0) return false;
  if (typeof valor['epoch'] !== 'number' || !Number.isInteger(valor['epoch'])) return false;
  if (!TIPOS_PETICION.includes(valor['tipo'] as TipoPeticion)) return false;
  const tipo = valor['tipo'] as TipoPeticion;
  if (tipo === 'mutar' || tipo === 'estado-mutacion') {
    if (typeof valor['idMutacion'] !== 'string' || valor['idMutacion'].length === 0) return false;
  }
  return true;
}

export function esRespuesta(valor: unknown): valor is Respuesta {
  if (!esObjeto(valor)) return false;
  if (typeof valor['id'] !== 'string') return false;
  if (typeof valor['epoch'] !== 'number') return false;
  if (valor['ok'] === true) return 'resultado' in valor;
  if (valor['ok'] === false) {
    return typeof valor['codigo'] === 'string' && typeof valor['mensaje'] === 'string';
  }
  return false;
}
