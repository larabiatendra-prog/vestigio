// PortablePathService (plan §7): el root portable se descubre desde
// process.execPath y un marcador de entrega, nunca desde la letra de unidad.
// Ninguna ruta persistida es absoluta; todas las escrituras van a
// USER_DATA, BACKUPS, LOGS o RUNTIME.

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { tmpdir } from 'node:os';

export const MARCADOR_ENTREGA = 'VESTIGIO.portable';

export interface RutasPortables {
  root: string;
  modo: 'lectura-escritura' | 'solo-lectura';
  userData: string;
  backups: string;
  logs: string;
  runtime: string;
  content: string;
  fallback: string;
}

/**
 * Busca el marcador de entrega subiendo desde el directorio dado.
 * En la entrega real: VESTIGIO/APP/Vestigio.exe -> el marcador esta en VESTIGIO/.
 * Pura respecto a la existencia: recibe el comprobador para poder probarse.
 */
export function buscarRoot(
  directorioInicial: string,
  existe: (ruta: string) => boolean = existsSync,
): string | null {
  let actual = directorioInicial;
  const tope = parse(actual).root;
  for (;;) {
    if (existe(join(actual, MARCADOR_ENTREGA))) return actual;
    if (actual === tope) return null;
    actual = dirname(actual);
  }
}

/** Prueba de escritura controlada y reversible (plan §7.1). */
export function esEscribible(directorio: string): boolean {
  const sonda = join(directorio, `.vestigio-sonda-${process.pid}`);
  try {
    writeFileSync(sonda, 'sonda');
    rmSync(sonda);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resuelve el conjunto de rutas de la sesion. En modo solo lectura, todo lo
 * mutable se dirige a %TEMP%\Vestigio\<release>-<pid> (plan §7, tarea 7 del
 * bloque 02); no se guarda estado esencial ahi.
 */
export function resolverRutas(opciones: {
  execPath: string;
  version: string;
  pid: number;
  rootExplicito?: string | undefined;
  existe?: (ruta: string) => boolean;
  comprobarEscritura?: (dir: string) => boolean;
}): RutasPortables {
  const existe = opciones.existe ?? existsSync;
  const comprobar = opciones.comprobarEscritura ?? esEscribible;

  const root =
    opciones.rootExplicito ??
    buscarRoot(dirname(opciones.execPath), existe) ??
    dirname(opciones.execPath);

  const escribible = comprobar(root);

  if (escribible) {
    return {
      root,
      modo: 'lectura-escritura',
      userData: join(root, 'USER_DATA'),
      backups: join(root, 'BACKUPS'),
      logs: join(root, 'LOGS'),
      runtime: join(root, 'RUNTIME'),
      content: join(root, 'CONTENT'),
      fallback: join(root, 'FALLBACK'),
    };
  }

  const temporal = join(tmpdir(), 'Vestigio', `${opciones.version}-${String(opciones.pid)}`);
  return {
    root,
    modo: 'solo-lectura',
    userData: join(temporal, 'USER_DATA'),
    backups: join(temporal, 'BACKUPS'),
    logs: join(temporal, 'LOGS'),
    runtime: join(temporal, 'RUNTIME'),
    content: join(root, 'CONTENT'),
    fallback: join(root, 'FALLBACK'),
  };
}

/** Crea las carpetas mutables de la sesion (idempotente). */
export function prepararCarpetasMutables(rutas: RutasPortables): void {
  for (const dir of [rutas.userData, rutas.backups, rutas.logs, rutas.runtime]) {
    mkdirSync(dir, { recursive: true });
  }
}

/** Limpieza best-effort del temporal en solo lectura (plan §7). */
export function limpiarTemporal(rutas: RutasPortables): void {
  if (rutas.modo !== 'solo-lectura') return;
  try {
    rmSync(dirname(rutas.userData), { recursive: true, force: true });
  } catch {
    // Un cierre brusco puede dejar temporales; se documenta, no se oculta.
  }
}
