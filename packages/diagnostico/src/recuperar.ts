// Recuperación desde otra copia (bloque 16, tareas 7 y 11).
//
// Cuando el Doctor dice "necesitas otra copia", esto es lo que hace algo con
// esa otra copia. Y lo hace con una coreografía deliberadamente lenta:
//
//   1. Se revisa la copia de ORIGEN. Restaurar desde una copia rota es peor
//      que no restaurar: dejaría a Daniel creyendo que está a salvo.
//   2. Se copia a un área aparte (staging) dentro del destino.
//   3. Se verifica lo copiado contra su propio manifiesto, ya en su sitio
//      nuevo: así se detecta también un fallo del propio copiado.
//   4. Solo entonces se intercambia, y lo viejo se conserva a un lado.
//
// USER_DATA no se toca JAMÁS. Los documentos se pueden volver a conseguir;
// las notas de Daniel, no.
//
// Nada de esto se ejecuta sin confirmación explícita: quien llama tiene que
// haber explicado el efecto y haber obtenido un sí.

import { cpSync, existsSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { diagnosticar } from './doctor.js';
import { verificarManifiesto } from './manifiesto.js';

export interface OpcionesRecuperacion {
  /** Entrega que se quiere arreglar. */
  destino: string;
  /** Entrega sana de la que copiar. */
  origen: string;
  /**
   * Sin esto no se toca nada: solo se dice qué pasaría. La confirmación es
   * de Daniel, no de este módulo.
   */
  confirmado?: boolean;
  ahora?: Date;
}

export interface PlanRecuperacion {
  /** Qué se va a hacer, en palabras, para poder enseñarlo antes de hacerlo. */
  pasos: string[];
  /** Motivos por los que no se puede seguir adelante. */
  impedimentos: string[];
  /** Dónde quedará lo que hoy está en el destino. */
  respaldoDeLoViejo: string;
  puedeSeguir: boolean;
}

export interface ResultadoRecuperacion extends PlanRecuperacion {
  ejecutado: boolean;
  mensaje: string;
}

function sello(ahora: Date): string {
  return ahora.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * Prepara (y opcionalmente ejecuta) la recuperación de CONTENT desde otra
 * copia. Sin `confirmado` se limita a explicar qué haría.
 */
export function recuperarContenido(opciones: OpcionesRecuperacion): ResultadoRecuperacion {
  const ahora = opciones.ahora ?? new Date();
  const impedimentos: string[] = [];

  const contenidoOrigen = join(opciones.origen, 'CONTENT');
  const contenidoDestino = join(opciones.destino, 'CONTENT');
  const respaldoDeLoViejo = join(opciones.destino, `CONTENT.anterior-${sello(ahora)}`);
  const staging = join(opciones.destino, 'RUNTIME', 'recuperacion', 'CONTENT');

  if (!existsSync(contenidoOrigen)) {
    impedimentos.push(`la copia de origen no tiene CONTENT: ${contenidoOrigen}`);
  }
  if (!existsSync(join(opciones.destino, 'VESTIGIO.portable'))) {
    impedimentos.push(
      'el destino no parece una entrega de Vestigio (falta VESTIGIO.portable). No se va a escribir en una carpeta cualquiera.',
    );
  }
  if (existsSync(contenidoOrigen) && existsSync(contenidoDestino)) {
    try {
      if (statSync(contenidoOrigen).ino === statSync(contenidoDestino).ino) {
        impedimentos.push('el origen y el destino son la misma carpeta');
      }
    } catch {
      // Si no se puede comparar, se sigue: hay defensas mas adelante.
    }
  }

  // La copia de origen tiene que estar sana. Este es el paso que impide
  // propagar el problema en vez de resolverlo.
  if (impedimentos.length === 0) {
    const salud = diagnosticar({ root: opciones.origen, nivel: 'completo', ahora });
    if (salud.veredicto === 'necesita-otra-copia' || salud.veredicto === 'degradado') {
      impedimentos.push(
        `la copia de origen tampoco está sana (${salud.titular}). Restaurar desde ella solo trasladaría el problema.`,
      );
    }
  }

  const pasos = [
    `Revisar a fondo la copia de origen (${opciones.origen}).`,
    `Copiar su CONTENT a un área aparte dentro del destino (${staging}).`,
    'Verificar lo copiado contra su manifiesto, ya en su sitio nuevo.',
    `Apartar el CONTENT actual del destino a ${respaldoDeLoViejo} (no se borra).`,
    'Poner el CONTENT recuperado en su lugar.',
    'USER_DATA no se toca: tus notas, favoritos y progreso se quedan como están.',
  ];

  const plan: PlanRecuperacion = {
    pasos,
    impedimentos,
    respaldoDeLoViejo,
    puedeSeguir: impedimentos.length === 0,
  };

  if (!plan.puedeSeguir) {
    return {
      ...plan,
      ejecutado: false,
      mensaje: 'No se puede recuperar desde esa copia. Nada se ha tocado.',
    };
  }
  if (opciones.confirmado !== true) {
    return {
      ...plan,
      ejecutado: false,
      mensaje:
        'Esto es lo que haría. Nada se ha tocado todavía: vuelve a lanzarlo confirmando si estás de acuerdo.',
    };
  }

  // --- Ejecución ------------------------------------------------------------

  rmSync(staging, { recursive: true, force: true });
  cpSync(contenidoOrigen, staging, { recursive: true });

  // Se verifica el CONTENT ya copiado, no el de origen: así se detecta
  // tambien un copiado incompleto o un disco que miente.
  const raizStaging = join(opciones.destino, 'RUNTIME', 'recuperacion');
  const problemas = verificarManifiesto(raizStaging);
  if (problemas.length > 0) {
    rmSync(staging, { recursive: true, force: true });
    return {
      ...plan,
      ejecutado: false,
      mensaje: `La copia llegó con ${String(problemas.length)} ficheros que no cuadran con su manifiesto, así que se ha descartado. El destino sigue exactamente como estaba. Prueba con otra copia o con otro cable o puerto.`,
    };
  }

  if (existsSync(contenidoDestino)) {
    renameSync(contenidoDestino, respaldoDeLoViejo);
  }
  try {
    renameSync(staging, contenidoDestino);
  } catch (error) {
    // Si el intercambio falla a mitad, se deshace: mejor como estaba.
    if (existsSync(respaldoDeLoViejo) && !existsSync(contenidoDestino)) {
      renameSync(respaldoDeLoViejo, contenidoDestino);
    }
    return {
      ...plan,
      ejecutado: false,
      mensaje: `No se pudo colocar el contenido recuperado (${error instanceof Error ? error.message : 'error'}). Se ha dejado todo como estaba.`,
    };
  }
  rmSync(raizStaging, { recursive: true, force: true });

  return {
    ...plan,
    ejecutado: true,
    mensaje: `Contenido recuperado. El anterior se ha guardado en ${respaldoDeLoViejo}: bórralo tú cuando compruebes que todo va bien.`,
  };
}
