// vestigio-admin: la herramienta administrativa. Separada de la app lectora
// (ADR-0006); errores con archivo y motivo; codigos de salida estables:
// 0 exito, 1 fallo de validacion/verificacion, 2 uso incorrecto.

import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { analizarCarpeta, materializarEdicion, HERRAMIENTA } from './ingesta.js';
import { generarManifiesto, escribirManifiesto, verificarManifiesto } from './manifiesto.js';

const AYUDA = `${HERRAMIENTA} — herramienta administrativa de Vestigio

Uso:
  vestigio-admin ingerir <carpeta-origen> --salida <dir-edicion> [--corpus-version <v>] [--json]
      Ingesta automatica en bloque: analiza la carpeta, deduplica por hash,
      copia originales, construye el catalogo buscable y el manifiesto.

  vestigio-admin verificar <dir-edicion> [--json]
      Verifica la edicion contra su manifiesto SHA-256.

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

const [, , comando, ...resto] = process.argv;
switch (comando) {
  case 'ingerir':
    process.exit(await comandoIngerir(resto));
    break;
  case 'verificar':
    process.exit(comandoVerificar(resto));
    break;
  case 'ayuda':
  case undefined:
    console.log(AYUDA);
    process.exit(comando === undefined ? 2 : 0);
    break;
  default:
    salirUso(`comando desconocido: ${comando}`);
}
