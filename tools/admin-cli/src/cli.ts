// vestigio-admin: la herramienta administrativa. Separada de la app lectora
// (ADR-0006); errores con archivo y motivo; codigos de salida estables:
// 0 exito, 1 fallo de validacion/verificacion, 2 uso incorrecto.

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { analizarCarpeta, materializarEdicion, HERRAMIENTA } from './ingesta.js';
import { abrirBaseContenido, RepositorioContenido } from '@vestigio/database';
import {
  diagnosticar,
  generarFallback,
  recuperarContenido,
  escribirManifiesto,
  generarManifiesto,
  informeEnTexto,
  verificarManifiesto,
  type NivelDoctor,
} from '@vestigio/diagnostico';

const AYUDA = `${HERRAMIENTA} — herramienta administrativa de Vestigio

Uso:
  vestigio-admin ingerir <carpeta-origen> --salida <dir-edicion> [--corpus-version <v>] [--json]
      Ingesta automatica en bloque: analiza la carpeta, deduplica por hash,
      copia originales, construye el catalogo buscable y el manifiesto.

  vestigio-admin verificar <dir-edicion> [--json]
      Verifica la edicion contra su manifiesto SHA-256.

  vestigio-admin doctor <dir-entrega> [--completo] [--json]
      Revisa una entrega y dice que le pasa, en claro. Sin Internet y sin
      necesidad de que la aplicacion arranque. Por defecto hace una
      revision rapida que declara cuanto ha muestreado; con --completo
      comprueba TODAS las huellas y las bases pagina a pagina.
      El informe se guarda ademas en LOGS/doctor.txt.

  vestigio-admin fallback <dir-entrega>
      Regenera la salida de emergencia (FALLBACK) a partir del catalogo que
      ya existe, sin volver a ingerir nada. Solo escribe dentro de FALLBACK:
      no toca documentos, catalogo ni datos personales.

  vestigio-admin recuperar <dir-entrega> --desde <otra-copia> [--confirmar]
      Recupera CONTENT desde otra copia sana. Sin --confirmar solo explica
      que haria. Revisa la copia de origen a fondo antes de tocar nada,
      verifica lo copiado ya en su sitio, aparta lo viejo en vez de
      borrarlo, y JAMAS toca USER_DATA.

  vestigio-admin ayuda
`;

function opcion(args: string[], nombre: string): string | undefined {
  const indice = args.indexOf(`--${nombre}`);
  if (indice === -1) return undefined;
  return args[indice + 1];
}

function salirUso(mensaje: string): never {
  console.error(`error: ${mensaje}\n`);
  console.error(AYUDA);
  process.exit(2);
}

async function comandoIngerir(args: string[]): Promise<number> {
  const origen = args[0];
  if (origen === undefined || origen.startsWith('--')) salirUso('falta la carpeta de origen');
  const salida = opcion(args, 'salida');
  if (salida === undefined) salirUso('falta --salida <dir-edicion>');
  const rutaOrigen = resolve(origen);
  const rutaSalida = resolve(salida);
  if (!existsSync(rutaOrigen) || !statSync(rutaOrigen).isDirectory()) {
    salirUso(`la carpeta de origen no existe: ${rutaOrigen}`);
  }
  if (rutaSalida === rutaOrigen || rutaSalida.startsWith(rutaOrigen + '\\')) {
    salirUso('la edicion no puede vivir dentro de la carpeta de origen');
  }
  const corpusVersion =
    opcion(args, 'corpus-version') ?? `edicion-${new Date().toISOString().slice(0, 10)}`;
  const json = args.includes('--json');

  const resultado = await analizarCarpeta(rutaOrigen, rutaSalida);
  materializarEdicion(resultado, rutaOrigen, rutaSalida, corpusVersion);
  const manifiesto = generarManifiesto(rutaSalida);
  escribirManifiesto(rutaSalida, manifiesto);

  const { informe } = resultado;
  if (json) {
    console.log(
      JSON.stringify(
        {
          informe,
          corpusVersion,
          manifiesto: { archivos: manifiesto.totalArchivos, bytes: manifiesto.totalBytes },
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`Edicion construida: ${rutaSalida}`);
    console.log(`  corpus_version: ${corpusVersion}`);
    console.log(`  explorados: ${String(informe.explorados)}`);
    console.log(
      `  ingeridos: ${String(informe.ingeridos)} (${
        Object.entries(informe.porFormato)
          .map(([f, n]) => `${f}: ${String(n)}`)
          .join(', ') || 'ninguno'
      })`,
    );
    console.log(`  sin texto todavia (pdf/epub/imagen): ${String(informe.sinTexto)}`);
    if (informe.duplicados.length > 0) {
      console.log(`  duplicados omitidos: ${String(informe.duplicados.length)}`);
      for (const d of informe.duplicados) console.log(`    ${d.ruta} = ${d.duplicadoDe}`);
    }
    if (informe.omitidos.length > 0) {
      console.log(`  omitidos: ${String(informe.omitidos.length)}`);
      for (const o of informe.omitidos) console.log(`    ${o.ruta} — ${o.motivo}`);
    }
    console.log(
      `  manifiesto: ${String(manifiesto.totalArchivos)} archivos, ${String(manifiesto.totalBytes)} bytes`,
    );
  }
  return informe.ingeridos > 0 ? 0 : 1;
}

function comandoVerificar(args: string[]): number {
  const dir = args[0];
  if (dir === undefined) salirUso('falta el directorio de la edicion');
  const ruta = resolve(dir);
  const json = args.includes('--json');
  let problemas;
  try {
    problemas = verificarManifiesto(ruta);
  } catch (error) {
    console.error(
      `error: no se pudo leer el manifiesto de ${ruta}: ${error instanceof Error ? error.message : 'fallo'}`,
    );
    return 1;
  }
  if (json) {
    console.log(JSON.stringify({ edicion: ruta, ok: problemas.length === 0, problemas }, null, 2));
  } else if (problemas.length === 0) {
    console.log(`Verificacion correcta: la edicion coincide con su manifiesto.`);
  } else {
    console.error(`Verificacion FALLIDA: ${String(problemas.length)} problemas`);
    for (const p of problemas) console.error(`  ${p.problema}: ${p.archivo}`);
  }
  return problemas.length === 0 ? 0 : 1;
}

/**
 * Codigos de salida del doctor, pensados para que un .bat pueda decidir:
 *   0 operativo (con o sin avisos)
 *   1 degradado: hay problemas, pero se puede intentar arrancar
 *   3 necesita otra copia: no arranques, ve al FALLBACK
 */
function comandoDoctor(args: string[]): number {
  const dir = args[0];
  if (dir === undefined || dir.startsWith('--')) salirUso('falta el directorio de la entrega');
  const root = resolve(dir);
  const nivel: NivelDoctor = args.includes('--completo') ? 'completo' : 'rapido';

  const informe = diagnosticar({ root, nivel });

  if (args.includes('--json')) {
    console.log(JSON.stringify(informe, null, 2));
  } else {
    console.log(informeEnTexto(informe));
  }

  // El informe queda escrito para poder consultarlo o enviarlo. Que no se
  // pueda escribir (soporte de solo lectura) no es motivo de fallo.
  try {
    const dirLogs = join(root, 'LOGS');
    mkdirSync(dirLogs, { recursive: true });
    writeFileSync(join(dirLogs, 'doctor.txt'), informeEnTexto(informe), 'utf8');
  } catch {
    // Soporte de solo lectura: el informe ya se ha mostrado por pantalla.
  }

  if (informe.veredicto === 'necesita-otra-copia') return 3;
  return informe.veredicto === 'degradado' ? 1 : 0;
}

/**
 * Reparacion explicita y acotada (bloque 16, t.11): reconstruye la salida de
 * emergencia desde el catalogo. Es segura porque no destruye nada -- solo
 * reescribe una carpeta derivada -- y por eso no exige copia previa.
 */
function comandoFallback(args: string[]): number {
  const dir = args[0];
  if (dir === undefined || dir.startsWith('--')) salirUso('falta el directorio de la entrega');
  const root = resolve(dir);
  const rutaCatalogo = join(root, 'CONTENT', 'index', 'vestigio-content.sqlite');
  if (!existsSync(rutaCatalogo)) {
    console.error(
      `error: no hay catalogo en ${rutaCatalogo}.
` + 'Sin catalogo no se puede escribir la salida de emergencia: primero recupera CONTENT.',
    );
    return 1;
  }

  const { db } = abrirBaseContenido(rutaCatalogo);
  try {
    const repositorio = new RepositorioContenido(db);
    const recursos = repositorio.listar().map((recurso) => {
      const ficha = repositorio.ficha(recurso.id);
      return {
        titulo: recurso.titulo,
        autor: recurso.autor,
        formato: recurso.formato,
        idioma: recurso.idioma,
        rutaOriginal: ficha?.rutaOriginal ?? null,
        resumen: ficha?.segmentos[0]?.cuerpo.slice(0, 160).trim() ?? null,
      };
    });
    const resultado = generarFallback({
      root,
      corpus: repositorio.versionCorpus() ?? 'sin declarar',
      generado: new Date().toISOString(),
      recursos,
    });
    console.log(
      `Salida de emergencia regenerada en ${join(root, 'FALLBACK')} ` +
        `(${String(recursos.length)} documentos): ${resultado.ficheros.join(', ')}.`,
    );
    return 0;
  } finally {
    db.close();
  }
}

function comandoRecuperar(args: string[]): number {
  const dir = args[0];
  if (dir === undefined || dir.startsWith('--')) salirUso('falta el directorio de la entrega');
  const desde = opcion(args, 'desde');
  if (desde === undefined) salirUso('falta --desde <otra-copia>');

  const resultado = recuperarContenido({
    destino: resolve(dir),
    origen: resolve(desde),
    confirmado: args.includes('--confirmar'),
  });

  console.log('Lo que hace una recuperacion:');
  for (const paso of resultado.pasos) console.log(`  - ${paso}`);
  console.log('');

  if (resultado.impedimentos.length > 0) {
    console.error('No se puede seguir:');
    for (const impedimento of resultado.impedimentos) console.error(`  - ${impedimento}`);
    console.error('');
  }
  console.log(resultado.mensaje);
  if (resultado.ejecutado) return 0;
  return resultado.puedeSeguir ? 0 : 1;
}

const [, , comando, ...resto] = process.argv;
switch (comando) {
  case 'ingerir':
    process.exit(await comandoIngerir(resto));
    break;
  case 'verificar':
    process.exit(comandoVerificar(resto));
    break;
  case 'doctor':
    process.exit(comandoDoctor(resto));
    break;
  case 'fallback':
    process.exit(comandoFallback(resto));
    break;
  case 'recuperar':
    process.exit(comandoRecuperar(resto));
    break;
  case 'ayuda':
  case undefined:
    console.log(AYUDA);
    process.exit(comando === undefined ? 2 : 0);
    break;
  default:
    salirUso(`comando desconocido: ${comando}`);
}
