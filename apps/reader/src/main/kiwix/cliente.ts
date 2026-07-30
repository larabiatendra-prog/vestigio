// Unico cliente HTTP de Vestigio (plan §6.2/§6.3): vive en el main, habla
// exclusivamente con el origen exacto que el propio Vestigio arranco, y
// devuelve resultados ya validados. Ni el renderer ni el servicio de datos
// tienen acceso a red.

import { analizarBusquedaXml, urlBusqueda, type RespuestaBusquedaZim } from './contrato.js';

const MS_TIMEOUT = 4000;
const MAX_BYTES_RESPUESTA = 4 * 1024 * 1024;

export class ErrorKiwix extends Error {
  constructor(
    public readonly codigo: 'sin-servidor' | 'origen-ajeno' | 'timeout' | 'respuesta-invalida',
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorKiwix';
  }
}

/** Comprueba que una URL pertenece al origen exacto propiedad de Vestigio. */
export function esDelOrigenPropio(url: string, origenPropio: string | null): boolean {
  if (origenPropio === null) return false;
  try {
    return new URL(url).origin === new URL(origenPropio).origin;
  } catch {
    return false;
  }
}

/**
 * Busca en las colecciones ZIM. Cancelable y acotada: Kiwix lento o caido
 * nunca bloquea la busqueda del catalogo (plan §9.3).
 */
export async function buscarEnZim(
  origenPropio: string | null,
  texto: string,
  limite = 20,
  senal?: AbortSignal,
): Promise<RespuestaBusquedaZim> {
  if (origenPropio === null) {
    throw new ErrorKiwix('sin-servidor', 'no hay servidor de colecciones en marcha');
  }
  const url = urlBusqueda(origenPropio, texto, limite);
  if (!esDelOrigenPropio(url, origenPropio)) {
    // Defensa de cinturon y tirantes: la URL la construimos nosotros, pero
    // aun asi se verifica antes de cualquier peticion.
    throw new ErrorKiwix('origen-ajeno', 'destino fuera del origen propio');
  }

  const abortador = AbortSignal.any([AbortSignal.timeout(MS_TIMEOUT), ...(senal ? [senal] : [])]);

  let respuesta: Response;
  try {
    respuesta = await fetch(url, { signal: abortador, redirect: 'error' });
  } catch (error) {
    throw new ErrorKiwix(
      'timeout',
      error instanceof Error ? error.message : 'sin respuesta del servidor de colecciones',
    );
  }

  if (!respuesta.ok) {
    throw new ErrorKiwix('respuesta-invalida', `el servidor respondio ${String(respuesta.status)}`);
  }

  const texto_ = await respuesta.text();
  if (texto_.length > MAX_BYTES_RESPUESTA) {
    throw new ErrorKiwix('respuesta-invalida', 'respuesta demasiado grande');
  }
  return analizarBusquedaXml(texto_);
}
