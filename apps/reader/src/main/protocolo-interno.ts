// Protocolo interno vestigio:// (plan §6.3): el renderer pide contenido por
// UUID de catalogo, NUNCA por ruta. El main resuelve la ruta real y
// comprueba que el resultado sigue dentro de CONTENT. Sin navegacion libre
// por file:// y sin que una ruta manipulada pueda escapar del corpus.

import { protocol } from 'electron';
import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { PROTOCOLO_INTERNO } from './politica-red';

/** Resuelve el UUID a una ruta logica dentro de CONTENT, o null. */
export type ResolverOriginal = (recursoId: string) => Promise<string | null>;

const TIPOS: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.epub': 'application/epub+zip',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'text/plain', // jamas como imagen activa
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.html': 'text/plain; charset=utf-8', // el HTML se lee saneado, no crudo
};

function tipoDe(ruta: string): string {
  const punto = ruta.lastIndexOf('.');
  const ext = punto === -1 ? '' : ruta.slice(punto).toLowerCase();
  return TIPOS[ext] ?? 'application/octet-stream';
}

/** Debe llamarse antes de app.ready. */
export function registrarEsquemaInterno(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: PROTOCOLO_INTERNO,
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
  ]);
}

/**
 * Debe llamarse tras app.ready. Solo sirve `vestigio://original/<uuid>`.
 * Cualquier otra forma se deniega.
 */
export function manejarProtocoloInterno(
  dirContent: string,
  resolverOriginal: ResolverOriginal,
): void {
  const raizContent = resolve(dirContent);

  protocol.handle(PROTOCOLO_INTERNO, async (peticion) => {
    let url: URL;
    try {
      url = new URL(peticion.url);
    } catch {
      return new Response('peticion invalida', { status: 400 });
    }

    if (url.host !== 'original') {
      return new Response('recurso no permitido', { status: 403 });
    }

    const uuid = decodeURIComponent(url.pathname.replace(/^\//, ''));
    if (!/^[0-9a-fA-F-]{36}$/.test(uuid)) {
      return new Response('identificador invalido', { status: 400 });
    }

    const rutaLogica = await resolverOriginal(uuid);
    if (rutaLogica === null) {
      return new Response('recurso no encontrado', { status: 404 });
    }

    // Defensa final: la ruta resuelta debe quedar dentro de CONTENT aunque
    // el catalogo contuviera algo raro.
    const rutaAbsoluta = resolve(join(raizContent, rutaLogica));
    if (rutaAbsoluta !== raizContent && !rutaAbsoluta.startsWith(raizContent + sep)) {
      return new Response('ruta fuera del corpus', { status: 403 });
    }

    try {
      const datos = await readFile(rutaAbsoluta);
      return new Response(new Uint8Array(datos), {
        status: 200,
        headers: {
          'content-type': tipoDe(rutaAbsoluta),
          'content-security-policy': "default-src 'none'; object-src 'none'",
          'x-content-type-options': 'nosniff',
        },
      });
    } catch {
      return new Response('no se pudo leer el original', { status: 404 });
    }
  });
}
