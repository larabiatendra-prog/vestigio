// El Doctor de Vestigio (bloque 16): mira una entrega y dice qué le pasa.
//
// Tres reglas gobiernan este módulo, y las tres vienen del plan:
//
//  1. **Un muestreo nunca se llama íntegro.** Cuando una comprobación solo
//     mira una parte, lo declara con números. Decir "todo correcto" tras
//     revisar el 5 % sería la peor mentira que Vestigio podría contar.
//  2. **Cuando hace falta otra copia, se dice.** Es preferible a ofrecer
//     una reparación falsa que deje a Daniel creyendo que está a salvo.
//  3. **Se lee sin ser técnico.** Cada comprobación explica qué se ha
//     mirado y, si algo va mal, qué hacer. Nada de códigos crudos.
//
// No depende de Electron ni de la aplicación: corre desde la CLI, desde el
// servicio de datos o desde una consola pelada.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  verificarManifiesto,
  muestrearManifiesto,
  type ProblemaVerificacion,
} from './manifiesto.js';

export type NivelDoctor = 'arranque' | 'rapido' | 'completo';
export type EstadoComprobacion = 'bien' | 'aviso' | 'mal' | 'no-aplica';

export interface Muestreo {
  revisados: number;
  total: number;
}

export interface Comprobacion {
  id: string;
  titulo: string;
  estado: EstadoComprobacion;
  /** Qué se ha visto, en claro. */
  detalle: string;
  /** Qué hacer al respecto; null si no hay nada que hacer. */
  remedio: string | null;
  /** Presente solo si la comprobación miró una parte, no el todo. */
  muestreo?: Muestreo;
}

export type Veredicto = 'operativo' | 'operativo-con-avisos' | 'degradado' | 'necesita-otra-copia';

export interface InformeDoctor {
  generado: string;
  nivel: NivelDoctor;
  root: string;
  comprobaciones: Comprobacion[];
  resumen: { bien: number; avisos: number; problemas: number };
  veredicto: Veredicto;
  /** Una frase que resume el estado para quien no quiera leer más. */
  titular: string;
}

// Identificadores de las dos bases, duplicados a proposito: el Doctor tiene
// que poder correr aunque @vestigio/database no cargue.
const APPLICATION_ID_CONTENIDO = 0x56455354;
const APPLICATION_ID_PERSONAL = 0x56555352;

const MARCADOR_ENTREGA = 'VESTIGIO.portable';

export interface OpcionesDoctor {
  root: string;
  nivel?: NivelDoctor;
  /** Fecha del informe; parametro para que las pruebas sean deterministas. */
  ahora?: Date;
  /** Cuántos ficheros mira el nivel rápido antes de declararse muestreo. */
  muestraRapida?: number;
}

function bien(id: string, titulo: string, detalle: string): Comprobacion {
  return { id, titulo, estado: 'bien', detalle, remedio: null };
}

function aviso(id: string, titulo: string, detalle: string, remedio: string): Comprobacion {
  return { id, titulo, estado: 'aviso', detalle, remedio };
}

function mal(id: string, titulo: string, detalle: string, remedio: string): Comprobacion {
  return { id, titulo, estado: 'mal', detalle, remedio };
}

function noAplica(id: string, titulo: string, detalle: string): Comprobacion {
  return { id, titulo, estado: 'no-aplica', detalle, remedio: null };
}

// --- Comprobaciones ----------------------------------------------------------

function revisarEstructura(root: string): Comprobacion[] {
  const comprobaciones: Comprobacion[] = [];

  comprobaciones.push(
    existsSync(join(root, MARCADOR_ENTREGA))
      ? bien('marcador', 'Marcador de la entrega', `Encontrado ${MARCADOR_ENTREGA} en la raíz.`)
      : mal(
          'marcador',
          'Marcador de la entrega',
          `No hay ${MARCADOR_ENTREGA} en esta carpeta.`,
          'Estás mirando una carpeta que no es una entrega de Vestigio, o falta el fichero que la identifica. Comprueba que apuntas al sitio correcto.',
        ),
  );

  // CONTENT es lo único imprescindible: sin él no hay biblioteca.
  const carpetas: { nombre: string; critica: boolean; para: string }[] = [
    { nombre: 'CONTENT', critica: true, para: 'los documentos y el catálogo' },
    { nombre: 'USER_DATA', critica: false, para: 'tus notas y favoritos' },
    { nombre: 'BACKUPS', critica: false, para: 'las copias de tu espacio personal' },
    { nombre: 'FALLBACK', critica: false, para: 'leer la biblioteca sin la aplicación' },
  ];
  for (const carpeta of carpetas) {
    if (existsSync(join(root, carpeta.nombre))) {
      comprobaciones.push(
        bien(
          `carpeta-${carpeta.nombre}`,
          `Carpeta ${carpeta.nombre}`,
          `Presente (${carpeta.para}).`,
        ),
      );
    } else if (carpeta.critica) {
      comprobaciones.push(
        mal(
          `carpeta-${carpeta.nombre}`,
          `Carpeta ${carpeta.nombre}`,
          `Falta la carpeta ${carpeta.nombre}, que contiene ${carpeta.para}.`,
          'Esta entrega está incompleta. Recupérala de otra copia: no hay forma de reconstruir los documentos desde aquí.',
        ),
      );
    } else {
      comprobaciones.push(
        aviso(
          `carpeta-${carpeta.nombre}`,
          `Carpeta ${carpeta.nombre}`,
          `Falta la carpeta ${carpeta.nombre} (${carpeta.para}).`,
          'Vestigio la creará al arrancar si el soporte admite escritura.',
        ),
      );
    }
  }

  return comprobaciones;
}

function revisarEscritura(root: string): Comprobacion {
  const prueba = join(root, `.vestigio-escritura-${String(process.pid)}.tmp`);
  try {
    writeFileSync(prueba, 'prueba');
    rmSync(prueba, { force: true });
    return bien('escritura', 'Permiso de escritura', 'Se puede escribir en la carpeta.');
  } catch {
    return aviso(
      'escritura',
      'Permiso de escritura',
      'No se puede escribir en esta carpeta.',
      'Vestigio arrancará en modo consulta: podrás leer y buscar todo, pero nada de lo que anotes se guardará. Si es un USB con la pestaña de bloqueo, quítala.',
    );
  }
}

interface RevisionBase {
  comprobaciones: Comprobacion[];
}

function revisarBase(
  ruta: string,
  etiqueta: string,
  idEsperado: number,
  nivel: NivelDoctor,
  critica: boolean,
): RevisionBase {
  const comprobaciones: Comprobacion[] = [];
  const idBase = etiqueta === 'catálogo' ? 'catalogo' : 'personal';

  if (!existsSync(ruta)) {
    comprobaciones.push(
      critica
        ? mal(
            `${idBase}-existe`,
            `Base del ${etiqueta}`,
            `No existe el fichero del ${etiqueta}.`,
            'Sin catálogo no hay biblioteca. Recupéralo de otra copia, o vuelve a pasar la ingesta sobre la carpeta de documentos.',
          )
        : noAplica(
            `${idBase}-existe`,
            `Base ${etiqueta}`,
            `Todavía no existe; se creará al arrancar.`,
          ),
    );
    return { comprobaciones };
  }

  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(ruta, { readOnly: true });
    const valor = (pragma: string): unknown =>
      Object.values(db?.prepare(`PRAGMA ${pragma}`).get() ?? {})[0];

    const appId = Number(valor('application_id'));
    comprobaciones.push(
      appId === idEsperado
        ? bien(`${idBase}-identidad`, `Identidad del ${etiqueta}`, 'El fichero es de Vestigio.')
        : mal(
            `${idBase}-identidad`,
            `Identidad del ${etiqueta}`,
            'El fichero existe pero no es una base de Vestigio.',
            'Alguien lo ha sustituido. Recupéralo de una copia; Vestigio no va a intentar leerlo.',
          ),
    );

    const quick = db.prepare('PRAGMA quick_check').all() as Record<string, unknown>[];
    const sana = quick.every((f) => String(Object.values(f)[0]) === 'ok');
    comprobaciones.push(
      sana
        ? bien(
            `${idBase}-salud`,
            `Salud del ${etiqueta}`,
            'La base responde y su estructura es coherente.',
          )
        : mal(
            `${idBase}-salud`,
            `Salud del ${etiqueta}`,
            'La base está dañada.',
            critica
              ? 'Recupera el catálogo de otra copia o reconstrúyelo con la herramienta de ingesta.'
              : 'Restaura tu espacio personal desde la copia más reciente en BACKUPS.',
          ),
    );

    // El chequeo completo recorre la base entera: lento, pero de verdad.
    if (nivel === 'completo' && sana) {
      const completo = db.prepare('PRAGMA integrity_check').all() as Record<string, unknown>[];
      const integra = completo.every((f) => String(Object.values(f)[0]) === 'ok');
      comprobaciones.push(
        integra
          ? bien(
              `${idBase}-integridad`,
              `Integridad completa del ${etiqueta}`,
              'Revisada la base entera, página a página.',
            )
          : mal(
              `${idBase}-integridad`,
              `Integridad completa del ${etiqueta}`,
              'La revisión a fondo ha encontrado páginas dañadas.',
              'Necesitas otra copia: una base con páginas rotas no se arregla desde aquí.',
            ),
      );

      const claves = db.prepare('PRAGMA foreign_key_check').all();
      comprobaciones.push(
        claves.length === 0
          ? bien(
              `${idBase}-relaciones`,
              `Relaciones del ${etiqueta}`,
              'Todas las referencias cuadran.',
            )
          : mal(
              `${idBase}-relaciones`,
              `Relaciones del ${etiqueta}`,
              `${String(claves.length)} referencias apuntan a filas que ya no existen.`,
              'La base es incoherente. Recupérala de una copia.',
            ),
      );
    }
  } catch (error) {
    comprobaciones.push(
      mal(
        `${idBase}-apertura`,
        `Base del ${etiqueta}`,
        `No se pudo abrir: ${error instanceof Error ? error.message : 'error desconocido'}`,
        'El fichero está corrupto o en uso por otro programa. Cierra Vestigio y vuelve a probar; si sigue, recupéralo de una copia.',
      ),
    );
  } finally {
    try {
      db?.close();
    } catch {
      // Una base rota puede negarse incluso a cerrar.
    }
  }

  return { comprobaciones };
}

function revisarCierreLimpio(ruta: string): Comprobacion {
  if (!existsSync(ruta)) {
    return noAplica('cierre-limpio', 'Cierre anterior', 'Todavía no hay espacio personal.');
  }
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(ruta, { readOnly: true });
    const fila = db
      .prepare("SELECT valor FROM estado_sesion WHERE clave = 'cierre_limpio'")
      .get() as { valor: string } | undefined;
    if (fila === undefined || fila.valor === 'si') {
      return bien('cierre-limpio', 'Cierre anterior', 'La última vez Vestigio se cerró bien.');
    }
    return aviso(
      'cierre-limpio',
      'Cierre anterior',
      'La última sesión no se cerró limpiamente (corte de luz, cierre forzado o similar).',
      'No suele tener consecuencias: Vestigio revisa la base a fondo antes de escribir nada. Si el Doctor no encuentra más problemas, sigue adelante con tranquilidad.',
    );
  } catch {
    return aviso(
      'cierre-limpio',
      'Cierre anterior',
      'No se pudo comprobar cómo terminó la última sesión.',
      'Mira el resto de comprobaciones del espacio personal.',
    );
  } finally {
    try {
      db?.close();
    } catch {
      // sin remedio y sin importancia
    }
  }
}

function describirProblemas(problemas: ProblemaVerificacion[]): string {
  const alterados = problemas.filter((p) => p.problema === 'alterado').length;
  const ausentes = problemas.filter((p) => p.problema === 'ausente').length;
  const intrusos = problemas.filter((p) => p.problema === 'no-manifestado').length;
  const partes: string[] = [];
  if (alterados > 0) partes.push(`${String(alterados)} alterados`);
  if (ausentes > 0) partes.push(`${String(ausentes)} ausentes`);
  if (intrusos > 0) partes.push(`${String(intrusos)} que nadie declaró`);
  return partes.join(', ');
}

function revisarManifiesto(root: string, nivel: NivelDoctor, muestra: number): Comprobacion {
  const rutaManifiesto = join(root, 'CONTENT', 'manifest', 'manifiesto.json');
  if (!existsSync(rutaManifiesto)) {
    return aviso(
      'manifiesto',
      'Huellas de los documentos',
      'Esta edición no trae manifiesto, así que no se puede comprobar si algún documento ha cambiado.',
      'Vuelve a generar la edición con la herramienta de ingesta para que tenga huellas.',
    );
  }

  if (nivel === 'arranque') {
    return noAplica(
      'manifiesto',
      'Huellas de los documentos',
      'No se comprueban al arrancar: tardaría demasiado. Usa el Doctor rápido o el completo.',
    );
  }

  try {
    if (nivel === 'completo') {
      const problemas = verificarManifiesto(root);
      return problemas.length === 0
        ? bien(
            'manifiesto',
            'Huellas de los documentos',
            'Todos los documentos coinciden con su huella: ni un byte ha cambiado.',
          )
        : mal(
            'manifiesto',
            'Huellas de los documentos',
            `Hay ${String(problemas.length)} ficheros que no cuadran (${describirProblemas(problemas)}).`,
            'Los documentos no son los que se entregaron. Recupera CONTENT de otra copia; Vestigio no puede repararlos.',
          );
    }

    // Nivel rápido: una muestra, y se dice que lo es. Salvo que la muestra
    // haya alcanzado a todos los ficheros, en cuyo caso decir "esto no
    // garantiza el resto" seria absurdo: no hay resto.
    const resultado = muestrearManifiesto(root, muestra);
    const completa = resultado.revisados >= resultado.total;
    const comprobacion: Comprobacion =
      resultado.problemas.length === 0
        ? bien(
            'manifiesto',
            completa ? 'Huellas de los documentos' : 'Huellas de los documentos (muestra)',
            completa
              ? `Los ${String(resultado.total)} ficheros de la edición cuadran con su huella: ni un byte ha cambiado.`
              : `Revisados ${String(resultado.revisados)} de ${String(resultado.total)} ficheros y todos cuadran. Esto NO garantiza que el resto esté bien: para eso está el Doctor completo.`,
          )
        : mal(
            'manifiesto',
            'Huellas de los documentos (muestra)',
            `En una muestra de ${String(resultado.revisados)} ficheros ya hay ${String(resultado.problemas.length)} que no cuadran (${describirProblemas(resultado.problemas)}).`,
            'Pasa el Doctor completo para saber el alcance, y prepara otra copia de CONTENT.',
          );
    if (!completa) {
      comprobacion.muestreo = { revisados: resultado.revisados, total: resultado.total };
    }
    return comprobacion;
  } catch (error) {
    return mal(
      'manifiesto',
      'Huellas de los documentos',
      `No se pudo comprobar: ${error instanceof Error ? error.message : 'error desconocido'}`,
      'El manifiesto puede estar corrupto. Regenera la edición o recupérala de otra copia.',
    );
  }
}

/** Cabecera mágica de un ZIM: 5A 49 4D 04 ("ZIM" + versión). */
const FIRMA_ZIM = Buffer.from([0x5a, 0x49, 0x4d, 0x04]);

function revisarColecciones(root: string): Comprobacion {
  const dirZim = join(root, 'CONTENT', 'zim');
  if (!existsSync(dirZim)) {
    return noAplica('zim', 'Colecciones', 'Esta entrega no lleva colecciones.');
  }
  let total = 0;
  const rotas: string[] = [];
  for (const entrada of readdirSeguro(dirZim)) {
    if (!entrada.endsWith('.zim')) continue;
    total++;
    try {
      const datos = readFileSync(join(dirZim, entrada)).subarray(0, 4);
      if (!datos.equals(FIRMA_ZIM)) rotas.push(entrada);
    } catch {
      rotas.push(entrada);
    }
  }
  if (total === 0) {
    return noAplica('zim', 'Colecciones', 'La carpeta de colecciones está vacía.');
  }
  return rotas.length === 0
    ? bien('zim', 'Colecciones', `${String(total)} colecciones con cabecera correcta.`)
    : mal(
        'zim',
        'Colecciones',
        `${String(rotas.length)} de ${String(total)} colecciones están truncadas o no son ZIM: ${rotas.join(', ')}.`,
        'Vuelve a copiar esos ficheros: una colección a medias no se puede leer.',
      );
}

/** Listado que no revienta si la carpeta desaparece a mitad. */
function readdirSeguro(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function revisarHerramientas(root: string): Comprobacion {
  const kiwix = join(root, 'TOOLS', 'kiwix', 'kiwix-serve.exe');
  return existsSync(kiwix)
    ? bien(
        'herramientas',
        'Herramientas auxiliares',
        'El servidor de colecciones está en su sitio.',
      )
    : noAplica(
        'herramientas',
        'Herramientas auxiliares',
        'No hay servidor de colecciones. Sin él la biblioteca funciona igual, pero las colecciones no se abren.',
      );
}

/** Cuenta lo personal que habria que respaldar; 0 si no hay nada o no se sabe. */
function contarPersonal(rutaPersonal: string): number {
  if (!existsSync(rutaPersonal)) return 0;
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(rutaPersonal, { readOnly: true });
    let total = 0;
    for (const tabla of ['favoritos', 'notas', 'marcadores', 'colecciones']) {
      try {
        total += (db.prepare(`SELECT count(*) AS n FROM ${tabla}`).get() as { n: number }).n;
      } catch {
        // La tabla no existe todavia: no hay nada de eso que respaldar.
      }
    }
    return total;
  } catch {
    return 0;
  } finally {
    try {
      db?.close();
    } catch {
      // sin importancia
    }
  }
}

function revisarCopias(root: string, ahora: Date, cosasPersonales: number): Comprobacion {
  const dir = join(root, 'BACKUPS');
  const reciente = join(dir, 'personal.respaldo.db');
  if (!existsSync(reciente)) {
    // Avisar de que falta la copia de algo que todavia no existe es ruido.
    return cosasPersonales === 0
      ? noAplica(
          'copias',
          'Copias de tu espacio',
          'Todavía no has guardado nada tuyo, así que no hay copia que hacer.',
        )
      : aviso(
          'copias',
          'Copias de tu espacio',
          `Tienes ${String(cosasPersonales)} cosas guardadas y ninguna copia de seguridad.`,
          'Vestigio hace una al cerrar. Ciérralo con normalidad una vez, y guarda además un paquete de tu espacio en otro disco desde Mi espacio.',
        );
  }
  const dias = Math.floor((ahora.getTime() - statSync(reciente).mtimeMs) / 86400000);
  if (dias > 30) {
    return aviso(
      'copias',
      'Copias de tu espacio',
      `La copia más reciente tiene ${String(dias)} días.`,
      'Abre y cierra Vestigio para refrescarla, y guarda un paquete de tu espacio en otro disco desde Mi espacio.',
    );
  }
  return bien(
    'copias',
    'Copias de tu espacio',
    dias === 0 ? 'Hay una copia de hoy.' : `La copia más reciente tiene ${String(dias)} días.`,
  );
}

function revisarFallback(root: string): Comprobacion {
  const indice = join(root, 'FALLBACK', 'index.html');
  return existsSync(indice)
    ? bien(
        'fallback',
        'Salida de emergencia',
        'Existe el catálogo en HTML: si la aplicación no arrancara, podrías llegar a los documentos con el navegador.',
      )
    : aviso(
        'fallback',
        'Salida de emergencia',
        'No hay catálogo de respaldo en HTML.',
        'Se genera al construir la edición con la herramienta de ingesta. Sin él, una aplicación rota te dejaría sin acceso fácil a los documentos.',
      );
}

// --- Informe -----------------------------------------------------------------

/** Examina una entrega y devuelve un informe legible. Nunca lanza. */
export function diagnosticar(opciones: OpcionesDoctor): InformeDoctor {
  const nivel = opciones.nivel ?? 'rapido';
  const ahora = opciones.ahora ?? new Date();
  const root = opciones.root;
  const muestra = opciones.muestraRapida ?? 25;

  const comprobaciones: Comprobacion[] = [...revisarEstructura(root)];
  comprobaciones.push(revisarEscritura(root));

  const rutaCatalogo = join(root, 'CONTENT', 'index', 'vestigio-content.sqlite');
  const rutaPersonal = join(root, 'USER_DATA', 'vestigio-user.sqlite');

  comprobaciones.push(
    ...revisarBase(rutaCatalogo, 'catálogo', APPLICATION_ID_CONTENIDO, nivel, true).comprobaciones,
  );

  if (nivel !== 'arranque') {
    comprobaciones.push(
      ...revisarBase(rutaPersonal, 'personal', APPLICATION_ID_PERSONAL, nivel, false)
        .comprobaciones,
    );
    comprobaciones.push(revisarCierreLimpio(rutaPersonal));
    comprobaciones.push(revisarCopias(root, ahora, contarPersonal(rutaPersonal)));
    comprobaciones.push(revisarColecciones(root));
    comprobaciones.push(revisarHerramientas(root));
  }

  comprobaciones.push(revisarManifiesto(root, nivel, muestra));
  comprobaciones.push(revisarFallback(root));

  const problemas = comprobaciones.filter((c) => c.estado === 'mal').length;
  const avisos = comprobaciones.filter((c) => c.estado === 'aviso').length;
  const correctas = comprobaciones.filter((c) => c.estado === 'bien').length;

  const irrecuperable = comprobaciones.some(
    (c) =>
      c.estado === 'mal' &&
      ['catalogo-salud', 'catalogo-integridad', 'catalogo-existe', 'manifiesto'].includes(c.id),
  );

  const veredicto: Veredicto = irrecuperable
    ? 'necesita-otra-copia'
    : problemas > 0
      ? 'degradado'
      : avisos > 0
        ? 'operativo-con-avisos'
        : 'operativo';

  const titulares: Record<Veredicto, string> = {
    operativo: 'Todo en orden: la biblioteca está sana y completa.',
    'operativo-con-avisos':
      'Vestigio funciona. Hay cosas que conviene mirar, pero ninguna te impide leer.',
    degradado: 'Vestigio funciona a medias. Hay problemas que hay que resolver.',
    'necesita-otra-copia':
      'Esta entrega está dañada de una forma que no se arregla desde aquí: necesitas otra copia.',
  };

  return {
    generado: ahora.toISOString(),
    nivel,
    root,
    comprobaciones,
    resumen: { bien: correctas, avisos, problemas },
    veredicto,
    titular: titulares[veredicto],
  };
}

/** Informe en texto plano, para consola o para un fichero de recuperación. */
export function informeEnTexto(informe: InformeDoctor): string {
  const simbolo: Record<EstadoComprobacion, string> = {
    bien: '  OK  ',
    aviso: ' AVISO',
    mal: ' FALLO',
    'no-aplica': '  --  ',
  };
  const lineas = [
    'DOCTOR DE VESTIGIO',
    '==================',
    '',
    `Entrega:   ${informe.root}`,
    `Revision:  ${informe.nivel}`,
    `Fecha:     ${informe.generado}`,
    '',
    informe.titular,
    '',
  ];
  for (const c of informe.comprobaciones) {
    lineas.push(`[${simbolo[c.estado]}] ${c.titulo}`);
    lineas.push(`          ${c.detalle}`);
    if (c.remedio !== null) lineas.push(`          -> ${c.remedio}`);
    lineas.push('');
  }
  lineas.push(
    `Resumen: ${String(informe.resumen.bien)} correctas, ` +
      `${String(informe.resumen.avisos)} avisos, ${String(informe.resumen.problemas)} problemas.`,
  );
  return lineas.join('\n');
}

/** Huella del informe, para poder archivarlo y compararlo despues. */
export function huellaInforme(informe: InformeDoctor): string {
  return createHash('sha256')
    .update(JSON.stringify(informe.comprobaciones.map((c) => [c.id, c.estado])))
    .digest('hex')
    .slice(0, 16);
}
