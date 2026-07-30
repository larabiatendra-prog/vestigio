// NetworkPolicyService (plan §6.3): unico por sesion, un solo listener,
// allowlists exactas. Decide sobre CADA peticion de la sesion del renderer.
// Permitido: el propio bundle (devtools/webpack en desarrollo), el protocolo
// interno y, cuando exista, el origen Kiwix exacto propiedad de Vestigio.

export const PROTOCOLO_INTERNO = 'vestigio';

export interface PoliticaRed {
  /** Origen exacto del Kiwix propio (p. ej. "http://127.0.0.1:41234"). Null hasta que exista. */
  origenKiwix: string | null;
  /** true solo bajo `electron-forge start` (webpack dev server en localhost). */
  desarrollo: boolean;
}

export type DecisionRed = { permitida: true } | { permitida: false; motivo: string };

export function decidirPeticion(politica: PoliticaRed, url: string): DecisionRed {
  let analizada: URL;
  try {
    analizada = new URL(url);
  } catch {
    return { permitida: false, motivo: 'URL no analizable' };
  }

  const esquema = analizada.protocol.replace(':', '');

  if (esquema === PROTOCOLO_INTERNO) return { permitida: true };

  // El shell empaquetado se carga por file:// desde el ASAR verificado.
  // No abre la puerta a contenido arbitrario: will-navigate bloquea salir de
  // la entrada, el renderer va con sandbox y el contenido de usuario nunca
  // se servira por file:// sino por el protocolo interno con allowlist.
  if (esquema === 'file') return { permitida: true };
  if (esquema === 'devtools' || esquema === 'chrome-extension') {
    if (politica.desarrollo) return { permitida: true };
    return { permitida: false, motivo: 'herramientas no permitidas en produccion' };
  }
  if (esquema === 'data' || esquema === 'blob') return { permitida: true };

  if (politica.desarrollo && (esquema === 'http' || esquema === 'ws')) {
    const host = analizada.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return { permitida: true };
  }

  if (politica.origenKiwix !== null && (esquema === 'http' || esquema === 'https')) {
    if (analizada.origin === politica.origenKiwix) return { permitida: true };
  }

  return { permitida: false, motivo: `origen externo bloqueado: ${analizada.origin}` };
}
