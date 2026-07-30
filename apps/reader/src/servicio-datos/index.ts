// Servicio de datos (utilityProcess): unico propietario de las conexiones
// SQLite (ADR-0002/0003/0007). Sin APIs de red por diseno. Main y renderer
// solo ven contratos tipados; el SQL vive en @vestigio/database.

import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import {
  abrirBasePersonal,
  abrirBaseContenido,
  cerrarBasePersonal,
  comprobarIntegridad,
  ErrorBaseDatos,
  esOperacionMutacion,
  RepositorioContenido,
  RepositorioPersonal,
  respaldarBasePersonal,
  type AperturaPersonal,
  type AperturaContenido,
} from '@vestigio/database';
import { esPeticion, type EstadoServicio, type Peticion, type Respuesta } from '../comun/mensajes';

const epochPropio = Number(process.env['VESTIGIO_EPOCH'] ?? '0');
const modo = process.env['VESTIGIO_MODO'] === 'solo-lectura' ? 'solo-lectura' : 'lectura-escritura';
const pruebasActivas = process.env['VESTIGIO_PRUEBAS'] === '1';
const rutaUserData = process.env['VESTIGIO_RUTA_USER_DATA'];
const rutaContent = process.env['VESTIGIO_RUTA_CONTENT'];
const rutaBackups = process.env['VESTIGIO_RUTA_BACKUPS'];

const puerto = process.parentPort;

// --- Apertura de bases -------------------------------------------------------

let personal: AperturaPersonal | null = null;
let repositorio: RepositorioPersonal | null = null;
let catalogo: AperturaContenido | null = null;
let contenido: RepositorioContenido | null = null;
let corpusVersion: string | null = null;

if (modo === 'lectura-escritura' && rutaUserData !== undefined) {
  mkdirSync(rutaUserData, { recursive: true });
  personal = abrirBasePersonal(join(rutaUserData, 'vestigio-user.sqlite'));
  // Tras un cierre sucio, comprobacion reforzada antes de habilitar escritura
  // (plan §6.2). Si la base esta mal, no se escribe: recuperacion desde copia.
  if (!personal.cierreLimpioAnterior) {
    const integridad = comprobarIntegridad(personal.db);
    if (!integridad.ok) {
      process.stderr.write(
        `base personal danada tras cierre sucio: ${integridad.problemas.join('; ')}\n`,
      );
      personal.db.close();
      personal = null;
    }
  }
  if (personal !== null) repositorio = new RepositorioPersonal(personal.db);
}

if (rutaContent !== undefined) {
  try {
    catalogo = abrirBaseContenido(join(rutaContent, 'index', 'vestigio-content.sqlite'));
    contenido = new RepositorioContenido(catalogo.db);
    corpusVersion = contenido.versionCorpus();
  } catch {
    // Sin catalogo todavia: estado degradado honesto, no un error fatal.
    catalogo = null;
  }
}

// --- Contrato de mensajes ----------------------------------------------------

function responder(respuesta: Respuesta): void {
  puerto.postMessage(respuesta);
}

function error(peticion: Peticion, codigo: string, mensaje: string): void {
  responder({ id: peticion.id, epoch: peticion.epoch, ok: false, codigo, mensaje });
}

function estadoActual(): EstadoServicio {
  let resumen = { favoritos: 0, notas: 0, colecciones: 0 };
  if (repositorio !== null) resumen = repositorio.resumen();
  return {
    listo: true,
    modo,
    epoch: epochPropio,
    basePersonal:
      personal === null
        ? null
        : {
            abierta: true,
            cierreLimpioAnterior: personal.cierreLimpioAnterior,
            versionEsquema: personal.versionEsquema,
            favoritos: resumen.favoritos,
            notas: resumen.notas,
          },
    catalogo: {
      presente: catalogo !== null,
      corpusVersion,
      recursos: contenido?.contarRecursos() ?? 0,
    },
  };
}

function manejarConsulta(peticion: Peticion): void {
  const carga = peticion.carga as
    { operacion?: string; recursoId?: string; texto?: string; limite?: number } | undefined;

  // Consultas del catalogo: disponibles aunque no haya base personal.
  switch (carga?.operacion) {
    case 'biblioteca-listar':
      responder({
        id: peticion.id,
        epoch: peticion.epoch,
        ok: true,
        resultado: contenido?.listar() ?? [],
      });
      return;
    case 'recurso-ficha': {
      if (carga.recursoId === undefined) {
        error(peticion, 'falta-parametro', 'se requiere recursoId');
        return;
      }
      responder({
        id: peticion.id,
        epoch: peticion.epoch,
        ok: true,
        resultado: contenido?.ficha(carga.recursoId) ?? null,
      });
      return;
    }
    case 'buscar':
      responder({
        id: peticion.id,
        epoch: peticion.epoch,
        ok: true,
        resultado: contenido?.buscar(carga.texto ?? '', carga.limite) ?? [],
      });
      return;
    case 'ruta-original':
      responder({
        id: peticion.id,
        epoch: peticion.epoch,
        ok: true,
        resultado: contenido?.rutaOriginal(carga.recursoId ?? '') ?? null,
      });
      return;
    default:
      break;
  }

  if (repositorio === null) {
    error(peticion, 'sin-base-personal', 'no hay base personal en este modo');
    return;
  }
  switch (carga?.operacion) {
    case 'favoritos-listar':
      responder({
        id: peticion.id,
        epoch: peticion.epoch,
        ok: true,
        resultado: repositorio.listarFavoritos(),
      });
      return;
    case 'notas-listar':
      responder({
        id: peticion.id,
        epoch: peticion.epoch,
        ok: true,
        resultado: repositorio.listarNotas(carga.recursoId),
      });
      return;
    default:
      error(peticion, 'consulta-desconocida', `operacion no reconocida`);
  }
}

function manejarMutacion(peticion: Peticion): void {
  if (modo === 'solo-lectura' || repositorio === null) {
    error(peticion, 'solo-lectura', 'el medio es de solo lectura; no se aceptan mutaciones');
    return;
  }
  const carga = peticion.carga as { accion?: string } | undefined;
  if (pruebasActivas && carga?.accion === 'simular-crash') {
    // Gancho de pruebas del supervisor: muere sin responder.
    process.exit(1);
  }
  if (!esOperacionMutacion(peticion.carga)) {
    error(peticion, 'mutacion-invalida', 'la operacion no cumple el contrato');
    return;
  }
  const resultado = repositorio.aplicarMutacion(peticion.idMutacion ?? '', peticion.carga);
  responder({ id: peticion.id, epoch: peticion.epoch, ok: true, resultado });
}

function manejar(peticion: Peticion): void {
  try {
    switch (peticion.tipo) {
      case 'ping':
        responder({ id: peticion.id, epoch: peticion.epoch, ok: true, resultado: 'pong' });
        return;
      case 'estado':
        responder({ id: peticion.id, epoch: peticion.epoch, ok: true, resultado: estadoActual() });
        return;
      case 'consultar':
        manejarConsulta(peticion);
        return;
      case 'mutar':
        manejarMutacion(peticion);
        return;
      case 'estado-mutacion': {
        const aplicada = repositorio?.mutacionAplicada(peticion.idMutacion ?? '') ?? false;
        responder({
          id: peticion.id,
          epoch: peticion.epoch,
          ok: true,
          resultado: aplicada ? 'aplicada' : 'desconocida',
        });
        return;
      }
      case 'cerrar': {
        void (async () => {
          try {
            if (personal !== null && rutaBackups !== undefined && modo === 'lectura-escritura') {
              await respaldarBasePersonal(personal.db, rutaBackups);
            }
          } catch {
            // El backup de despedida es best-effort; el cierre limpio no.
          }
          if (personal !== null) cerrarBasePersonal(personal.db);
          catalogo?.db.close();
          responder({ id: peticion.id, epoch: peticion.epoch, ok: true, resultado: 'cerrando' });
          setImmediate(() => process.exit(0));
        })();
        return;
      }
    }
  } catch (excepcion) {
    if (excepcion instanceof ErrorBaseDatos) {
      error(peticion, excepcion.codigo, excepcion.message);
      return;
    }
    error(peticion, 'error-interno', excepcion instanceof Error ? excepcion.message : 'fallo');
  }
}

puerto.on('message', (evento) => {
  const mensaje: unknown = evento.data;
  if (!esPeticion(mensaje)) {
    process.stderr.write('peticion fuera de contrato descartada\n');
    return;
  }
  manejar(mensaje);
});

puerto.postMessage({ tipo: 'listo', epoch: epochPropio });
