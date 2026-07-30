// Protocolo interno vestigio:// (plan §6.3): las rutas de contenido se
// resolveran desde IDs del catalogo, nunca desde rutas arbitrarias del
// renderer. En este bloque el protocolo existe y deniega todo: la allowlist
// de recursos reales llega con los lectores (bloques 05+).

import { protocol } from 'electron';
import { PROTOCOLO_INTERNO } from './politica-red';

/** Debe llamarse antes de app.ready. */
export function registrarEsquemaInterno(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: PROTOCOLO_INTERNO,
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
  ]);
}

/** Debe llamarse tras app.ready. */
export function manejarProtocoloInterno(): void {
  protocol.handle(PROTOCOLO_INTERNO, () => {
    // Allowlist vacia por ahora: nada que servir hasta que exista catalogo.
    return new Response('recurso no permitido', { status: 403 });
  });
}
