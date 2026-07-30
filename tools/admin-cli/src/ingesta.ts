// Ingesta automatica en bloque (ENMIENDAS E1, corazon del producto): una
// carpeta entera entra sola. Extraccion automatica de metadatos, dedupe
// exacto por hash, originales content-addressed y catalogo buscable.
// El original jamas se modifica; la edicion es funcion pura de la carpeta.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { extname, join, relative } from 'node:path';
import { construirCatalogoFixture, type RecursoCanonico } from '@vestigio/database';
import {
  detectarFormato,
  detectarIdioma,
  extraerTitulo,
  generarSlug,
  sha256De,
  uuidDesdeSha256,
} from './metadatos.js';
import { extraerTexto, segmentar } from './texto.js';

export const HERRAMIENTA = 'vestigio-admin@0.1.0';
const LIMITE_BYTES_ARCHIVO = 512 * 1024 * 1024; // 512 MB por archivo

export interface Omitido {
  ruta: string;
  motivo: string;
}

export interface InformeIngesta {
  origen: string;
  edicion: string;
  explorados: number;
  ingeridos: number;
  duplicados: { ruta: string; duplicadoDe: string }[];
  omitidos: Omitido[];
  sinTexto: number;
  porFormato: Record<string, number>;
}

export interface FuenteRegistrada {
  uuid: string;
  nombreOriginal: string;
  sha256: string;
  bytes: number;
  adquirido: string;
  herramienta: string;
}

function explorar(dir: string): string[] {
  const resultado: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entrada.isFile()) resultado.push(join(entrada.parentPath, entrada.name));
  }
  return resultado.sort();
}

export interface ResultadoIngesta {
  recursos: RecursoCanonico[];
  fuentes: FuenteRegistrada[];
  informe: InformeIngesta;
}

/** Analiza la carpeta origen y produce la representacion canonica. */
export function analizarCarpeta(origen: string, dirEdicion: string): ResultadoIngesta {
  const rutas = explorar(origen);
  const recursos: RecursoCanonico[] = [];
  const fuentes: FuenteRegistrada[] = [];
  const vistos = new Map<string, string>(); // sha256 -> ruta primera
  const informe: InformeIngesta = {
    origen,
    edicion: dirEdicion,
    explorados: rutas.length,
    ingeridos: 0,
    duplicados: [],
    omitidos: [],
    sinTexto: 0,
    porFormato: {},
  };

  for (const ruta of rutas) {
    const rel = relative(origen, ruta);
    const bytes = statSync(ruta).size;
    if (bytes === 0) {
      informe.omitidos.push({ ruta: rel, motivo: 'archivo vacio' });
      continue;
    }
    if (bytes > LIMITE_BYTES_ARCHIVO) {
      informe.omitidos.push({ ruta: rel, motivo: 'supera el limite de 512 MB' });
      continue;
    }
    const contenido = readFileSync(ruta);
    const formato = detectarFormato(ruta, contenido);
    if (formato === null) {
      informe.omitidos.push({ ruta: rel, motivo: 'formato no admitido' });
      continue;
    }
    const sha = sha256De(contenido);
    const previo = vistos.get(sha);
    if (previo !== undefined) {
      informe.duplicados.push({ ruta: rel, duplicadoDe: previo });
      continue;
    }
    vistos.set(sha, rel);

    const uuid = uuidDesdeSha256(sha);
    const { titulo } = extraerTitulo(formato, contenido, ruta);
    const texto = extraerTexto(formato, contenido);
    const segmentos = texto === null ? [] : segmentar(texto);
    if (texto === null) informe.sinTexto++;
    const idioma = texto !== null ? detectarIdioma(texto) : detectarIdioma(titulo);
    const adquirido = new Date().toISOString();
    const extension = extname(ruta).toLowerCase() || `.${formato}`;
    const rutaLogica = `originals/${uuid}${extension}`;

    recursos.push({
      id: uuid,
      slug: generarSlug(titulo, uuid),
      titulo,
      idioma,
      formato,
      // Sin decision humana registrada, la base mas conservadora (E1 +
      // plan §8.5): conservacion personal; nunca se publica por defecto.
      derechos: 'personal-preservation',
      modulos: [],
      origen: { adquirido, sha256: sha },
      assets: [
        {
          id: uuid,
          roles: ['source_original', 'preservation_master'],
          formato,
          rutaLogica,
          bytes,
          sha256: sha,
        },
      ],
      segmentos,
    });
    fuentes.push({
      uuid,
      nombreOriginal: rel,
      sha256: sha,
      bytes,
      adquirido,
      herramienta: HERRAMIENTA,
    });
    informe.ingeridos++;
    informe.porFormato[formato] = (informe.porFormato[formato] ?? 0) + 1;
  }

  return { recursos, fuentes, informe };
}

/**
 * Materializa la edicion: copia originales content-addressed, construye el
 * catalogo SQLite y registra las fuentes. CONTENT se reconstruye entero;
 * USER_DATA y demas carpetas de la entrega jamas se tocan.
 */
export function materializarEdicion(
  resultado: ResultadoIngesta,
  origen: string,
  dirEdicion: string,
  corpusVersion: string,
): void {
  const dirContent = join(dirEdicion, 'CONTENT');
  if (existsSync(dirContent)) rmSync(dirContent, { recursive: true, force: true });
  mkdirSync(join(dirContent, 'originals'), { recursive: true });
  mkdirSync(join(dirContent, 'index'), { recursive: true });
  mkdirSync(join(dirContent, 'manifest'), { recursive: true });

  for (const [i, recurso] of resultado.recursos.entries()) {
    const fuente = resultado.fuentes[i];
    const asset = recurso.assets?.[0];
    if (fuente === undefined || asset === undefined) continue;
    copyFileSync(join(origen, fuente.nombreOriginal), join(dirContent, asset.rutaLogica));
  }

  construirCatalogoFixture(
    join(dirContent, 'index', 'vestigio-content.sqlite'),
    resultado.recursos,
    {
      corpus: corpusVersion,
      informacionVigente: '',
    },
  );

  writeFileSync(
    join(dirEdicion, 'content-sources.lock.json'),
    `${JSON.stringify({ herramienta: HERRAMIENTA, generado: new Date().toISOString(), fuentes: resultado.fuentes }, null, 2)}\n`,
  );
}
