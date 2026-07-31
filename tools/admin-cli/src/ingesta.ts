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
import {
  construirCatalogoFixture,
  type RecursoCanonico,
  type SegmentoCanonico,
} from '@vestigio/database';
import {
  markdownAHtml,
  sanearHtml,
  segmentarHtml,
  textoAHtml,
  type ResultadoSaneado,
} from '@vestigio/content-pipeline';
import {
  detectarFormato,
  detectarIdioma,
  extraerTitulo,
  generarSlug,
  sha256De,
  uuidDesdeSha256,
} from './metadatos.js';
import { extraerPdf, VERSION_PDFJS, type DiagnosticoPdf } from './pdf.js';

export const HERRAMIENTA = 'vestigio-admin@0.1.0';
const LIMITE_BYTES_ARCHIVO = 512 * 1024 * 1024; // 512 MB por archivo

/**
 * Estado del texto tal como lo vera Daniel en la ficha: honesto sobre lo
 * que hay y lo que falta, nunca presentando una extraccion como original.
 */
const mapaEstadoPdf: Record<DiagnosticoPdf, string> = {
  'con-texto': 'texto-por-pagina',
  'parcialmente-extraible': 'texto-parcial',
  'sin-texto-candidato-ocr': 'sin-texto-escaneado',
  cifrado: 'cifrado',
  corrupto: 'ilegible',
};

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

/** Convierte el original en derivado de acceso saneado + segmentos. */
function procesarTextual(
  formato: 'html' | 'markdown' | 'txt',
  contenido: Buffer,
): { segmentos: SegmentoCanonico[]; texto: string; saneado: ResultadoSaneado } {
  const crudo = contenido.toString('utf8');
  const html =
    formato === 'html' ? crudo : formato === 'markdown' ? markdownAHtml(crudo) : textoAHtml(crudo);
  const saneado = sanearHtml(html);
  const estructurales = segmentarHtml(saneado.html);
  const segmentos: SegmentoCanonico[] = estructurales.map((s) => ({
    localizador: s.localizador,
    titulo: s.titulo,
    nivel: s.nivel,
    cuerpo: s.cuerpo,
    html: s.html,
  }));
  return { segmentos, texto: estructurales.map((s) => s.cuerpo).join('\n\n'), saneado };
}

/** Analiza la carpeta origen y produce la representacion canonica. */
export async function analizarCarpeta(
  origen: string,
  dirEdicion: string,
): Promise<ResultadoIngesta> {
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
    let { titulo } = extraerTitulo(formato, contenido, ruta);
    let segmentos: SegmentoCanonico[] = [];
    let textoParaIdioma = titulo;
    let estadoTexto = 'sin-texto';
    let detalleTexto: string | null = null;
    let numPaginas: number | null = null;

    if (formato === 'html' || formato === 'markdown' || formato === 'txt') {
      const procesado = procesarTextual(formato, contenido);
      segmentos = procesado.segmentos;
      textoParaIdioma = procesado.texto.length > 0 ? procesado.texto : titulo;
      estadoTexto = 'texto-completo';
      const { eliminados } = procesado.saneado;
      const retirado =
        eliminados.scripts +
        eliminados.handlers +
        eliminados.recursosRemotos +
        eliminados.urlsPeligrosas;
      if (retirado > 0) {
        detalleTexto = `derivado saneado: ${String(retirado)} elementos activos o remotos retirados`;
      }
    } else if (formato === 'pdf') {
      const pdf = await extraerPdf(new Uint8Array(contenido));
      numPaginas = pdf.totalPaginas > 0 ? pdf.totalPaginas : null;
      detalleTexto = pdf.detalle;
      estadoTexto = mapaEstadoPdf[pdf.diagnostico];
      if (pdf.titulo !== null && pdf.titulo.length > 2) titulo = pdf.titulo;
      segmentos = pdf.paginas.map((p) => ({
        // Localizador por pagina: la busqueda abre en la pagina exacta.
        localizador: `p${String(p.pagina)}`,
        titulo: null,
        nivel: null,
        cuerpo: p.texto,
        html: null,
        pagina: p.pagina,
      }));
      if (segmentos.length > 0) textoParaIdioma = segmentos.map((s) => s.cuerpo).join('\n');
    }

    if (segmentos.length === 0) informe.sinTexto++;
    const idioma = detectarIdioma(textoParaIdioma);
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
      estadoTexto,
      ...(detalleTexto !== null ? { detalleTexto } : {}),
      ...(numPaginas !== null ? { numPaginas } : {}),
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
  // Solo se reconstruye lo que produce la ingesta. Las colecciones ZIM y
  // cualquier otra carpeta curada aparte viven tambien en CONTENT y NO se
  // tocan: borrar CONTENT entero se llevaba por delante los ZIM.
  for (const carpeta of ['originals', 'index', 'manifest']) {
    const ruta = join(dirContent, carpeta);
    if (existsSync(ruta)) rmSync(ruta, { recursive: true, force: true });
    mkdirSync(ruta, { recursive: true });
  }

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
    `${JSON.stringify(
      {
        herramienta: HERRAMIENTA,
        // Herramientas de extraccion fijadas: un derivado siempre puede
        // explicarse por quien y con que version se produjo (plan §8.2).
        extractores: { pdf: `pdfjs-dist@${VERSION_PDFJS}` },
        generado: new Date().toISOString(),
        fuentes: resultado.fuentes,
      },
      null,
      2,
    )}\n`,
  );
}
