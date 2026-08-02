// Servicio de datos (utilityProcess): unico propietario de las conexiones
// SQLite (ADR-0002/0003/0007). Sin APIs de red por diseno. Main y renderer
// solo ven contratos tipados; el SQL vive en @vestigio/database.

import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  abrirBasePersonal,
  abrirBaseContenido,
  cerrarBasePersonal,
  comprobarIntegridad,
  crearPaquetePersonal,
  ErrorBaseDatos,
  ErrorPaquete,
  esOperacionMutacion,
  inspeccionarPaquete,
  RepositorioContenido,
  RepositorioPersonal,
  respaldarBasePersonal,
  restaurarEspacioPersonal,
  type AperturaPersonal,
  type AperturaContenido,
} from '@vestigio/database';
import { diagnosticar, informeEnTexto, type NivelDoctor } from '@vestigio/diagnostico';
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
  if (personal !== null) {
    repositorio = new RepositorioPersonal(personal.db);
    // Notas que vienen de un esquema anterior sin texto normalizado.
    repositorio.prepararIndices();
  }
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
  const resumen = repositorio?.resumen() ?? {
    favoritos: 0,
    notas: 0,
    colecciones: 0,
    marcadores: 0,
    papelera: 0,
  };
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
            hayCambios: repositorio?.hayCambiosPersonales() ?? false,
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
    | {
        operacion?: string;
        recursoId?: string;
        texto?: string;
        limite?: number;
        avanzado?: boolean;
        sinonimos?: boolean;
        filtros?: { formatos?: string[]; idiomas?: string[]; modulos?: string[] };
      }
    | undefined;

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
        resultado:
          contenido?.buscar(carga.texto ?? '', {
            ...(carga.avanzado !== undefined ? { avanzado: carga.avanzado } : {}),
            ...(carga.sinonimos !== undefined ? { sinonimos: carga.sinonimos } : {}),
            ...(carga.filtros !== undefined ? { filtros: carga.filtros } : {}),
            ...(carga.limite !== undefined ? { limite: carga.limite } : {}),
          }) ?? null,
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
    case 'ruta-asset':
      responder({
        id: peticion.id,
        epoch: peticion.epoch,
        ok: true,
        resultado: contenido?.rutaAsset(carga.recursoId ?? '') ?? null,
      });
      return;
    case 'relacionados':
      responder({
        id: peticion.id,
        epoch: peticion.epoch,
        ok: true,
        resultado: contenido?.relacionados(carga.recursoId ?? '') ?? [],
      });
      return;
    case 'espacio-personal':
      // El espacio personal se pide entero: son pocos datos y asi la
      // pantalla nunca muestra una mitad coherente y otra vieja.
      responder({
        id: peticion.id,
        epoch: peticion.epoch,
        ok: true,
        resultado:
          repositorio === null
            ? {
                disponible: false,
                motivo:
                  modo === 'solo-lectura'
                    ? 'el soporte es de solo lectura: en esta sesión no se puede guardar nada'
                    : 'la base personal no está abierta',
                favoritos: [],
                colecciones: [],
                notas: [],
                marcadores: [],
                progreso: [],
                recientes: [],
                papelera: [],
                ajustes: {},
              }
            : {
                disponible: true,
                motivo: null,
                favoritos: repositorio.listarFavoritos().map((f) => f.recursoId),
                colecciones: repositorio.listarColecciones().map((c) => ({
                  ...c,
                  recursos: repositorio?.itemsColeccion(c.id).map((i) => i.recursoId) ?? [],
                })),
                notas: repositorio.listarNotas(),
                marcadores: repositorio.listarMarcadores(),
                progreso: repositorio.listarProgreso(),
                recientes: repositorio.listarRecientes(),
                papelera: repositorio.listarPapelera(),
                ajustes: repositorio.ajustes(),
              },
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
    case 'notas-buscar':
      responder({
        id: peticion.id,
        epoch: peticion.epoch,
        ok: true,
        resultado: repositorio.buscarNotas(carga.texto ?? ''),
      });
      return;
    default:
      error(peticion, 'consulta-desconocida', `operacion no reconocida`);
  }
}

/**
 * Mantenimiento del espacio personal: respaldo, exportacion e importacion.
 * Vive aqui porque este proceso es el unico que tiene abiertas las bases;
 * el main solo aporta las rutas que elige Daniel en el dialogo del sistema.
 */
function manejarMantenimiento(peticion: Peticion): void {
  const carga = peticion.carga as
    | {
        accion?: string;
        destino?: string;
        dirTemporal?: string;
        dirStaging?: string;
        dirBackups?: string;
        rutaZip?: string;
        rutaBaseStaging?: string;
        modo?: 'fusionar' | 'reemplazar';
        generado?: string;
        app?: string;
        nivel?: NivelDoctor;
        root?: string;
        dirLogs?: string;
      }
    | undefined;

  // El Doctor corre aunque no haya base personal: precisamente sirve para
  // los casos en que algo no ha podido abrirse.
  if (carga?.accion === 'doctor') {
    if (carga.root === undefined) {
      error(peticion, 'falta-parametro', 'se requiere root');
      return;
    }
    const informe = diagnosticar({ root: carga.root, nivel: carga.nivel ?? 'rapido' });
    let rutaInforme: string | null = null;
    if (carga.dirLogs !== undefined) {
      try {
        mkdirSync(carga.dirLogs, { recursive: true });
        const destino = join(carga.dirLogs, 'doctor.txt');
        writeFileSync(destino, informeEnTexto(informe), 'utf8');
        rutaInforme = destino;
      } catch {
        // Soporte de solo lectura: el informe se enseña igualmente.
      }
    }
    responder({
      id: peticion.id,
      epoch: peticion.epoch,
      ok: true,
      resultado: { ...informe, rutaInforme },
    });
    return;
  }

  // Inspeccionar no necesita base personal abierta: solo mira un fichero.
  if (carga?.accion === 'inspeccionar') {
    if (carga.rutaZip === undefined || carga.dirStaging === undefined) {
      error(peticion, 'falta-parametro', 'se requieren rutaZip y dirStaging');
      return;
    }
    responder({
      id: peticion.id,
      epoch: peticion.epoch,
      ok: true,
      resultado: inspeccionarPaquete(carga.rutaZip, carga.dirStaging),
    });
    return;
  }

  if (personal === null || repositorio === null) {
    error(peticion, 'sin-base-personal', 'no hay base personal en este modo');
    return;
  }
  const db = personal.db;

  switch (carga?.accion) {
    case 'exportar': {
      if (carga.destino === undefined || carga.dirTemporal === undefined) {
        error(peticion, 'falta-parametro', 'se requieren destino y dirTemporal');
        return;
      }
      void crearPaquetePersonal(db, {
        destino: carga.destino,
        dirTemporal: carga.dirTemporal,
        generado: carga.generado ?? new Date().toISOString(),
        app: carga.app ?? 'desconocida',
        corpus: corpusVersion,
        // El titulo de cada documento viene del catalogo: sin el, la
        // exportacion legible solo tendria UUID.
        resolver: (recursoId) => contenido?.nombrar(recursoId) ?? null,
      })
        .then((resultado) => {
          responder({
            id: peticion.id,
            epoch: peticion.epoch,
            ok: true,
            resultado: { ruta: resultado.ruta, bytes: resultado.bytes },
          });
        })
        .catch((excepcion: unknown) => {
          error(
            peticion,
            'exportacion-fallida',
            excepcion instanceof Error ? excepcion.message : 'no se pudo escribir el paquete',
          );
        });
      return;
    }

    case 'adoptar': {
      if (carga.rutaBaseStaging === undefined) {
        error(peticion, 'falta-parametro', 'se requiere rutaBaseStaging');
        return;
      }
      try {
        const resultado = restaurarEspacioPersonal(
          db,
          carga.rutaBaseStaging,
          carga.modo === 'reemplazar' ? 'reemplazar' : 'fusionar',
        );
        const filas = Object.values(resultado.filasPorTabla).reduce((a, b) => a + b, 0);
        responder({
          id: peticion.id,
          epoch: peticion.epoch,
          ok: true,
          resultado: { modo: resultado.modo, filas },
        });
      } catch (excepcion) {
        error(
          peticion,
          excepcion instanceof ErrorPaquete ? excepcion.codigo : 'importacion-fallida',
          excepcion instanceof Error ? excepcion.message : 'no se pudo importar',
        );
      }
      return;
    }

    case 'respaldar': {
      const destino = carga.dirBackups ?? rutaBackups;
      if (destino === undefined) {
        error(peticion, 'falta-parametro', 'no hay carpeta de copias');
        return;
      }
      if (!repositorio.hayCambiosPersonales()) {
        responder({
          id: peticion.id,
          epoch: peticion.epoch,
          ok: true,
          resultado: { estado: 'sin-cambios', ruta: null },
        });
        return;
      }
      void respaldarBasePersonal(db, destino)
        .then((r) => {
          responder({
            id: peticion.id,
            epoch: peticion.epoch,
            ok: true,
            resultado: { estado: 'hecho', ruta: r.ruta },
          });
        })
        .catch((excepcion: unknown) => {
          error(
            peticion,
            'respaldo-fallido',
            excepcion instanceof Error ? excepcion.message : 'no se pudo respaldar',
          );
        });
      return;
    }

    default:
      error(peticion, 'mantenimiento-desconocido', 'accion de mantenimiento no reconocida');
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
      case 'mantenimiento':
        manejarMantenimiento(peticion);
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
