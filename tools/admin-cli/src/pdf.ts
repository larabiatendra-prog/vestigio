// Extraccion de PDF por pagina en construccion (bloque 06 t.4-6).
// PDF.js empaquetado localmente, jamas de CDN. Limites duros de paginas,
// tiempo y tamano: un PDF corrupto u hostil no puede tumbar la herramienta
// ni, mas tarde, la aplicacion. Detecta cifrado, sin texto y corrupto.

import { getDocument, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem } from 'pdfjs-dist/types/src/display/api.js';

export const VERSION_PDFJS = '6.2.108';

const MAX_PAGINAS = 3000;
const MAX_MS = 120_000;
/** Bajo este umbral de caracteres por pagina se considera "sin texto". */
const MIN_CARACTERES_UTILES = 20;

export type DiagnosticoPdf =
  'con-texto' | 'sin-texto-candidato-ocr' | 'cifrado' | 'corrupto' | 'parcialmente-extraible';

export interface PaginaPdf {
  /** 1-based, tal como lo ve una persona. */
  pagina: number;
  texto: string;
}

export interface ResultadoPdf {
  diagnostico: DiagnosticoPdf;
  paginas: PaginaPdf[];
  totalPaginas: number;
  paginasConFallo: number[];
  titulo: string | null;
  autor: string | null;
  /** Motivo legible cuando no se pudo extraer nada. */
  detalle: string | null;
  herramienta: string;
}

function normalizar(texto: string): string {
  return texto
    .replace(/­/g, '') // guion suave
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .normalize('NFC');
}

/**
 * Reconstruye el texto de una pagina respetando saltos de linea segun la
 * posicion vertical de cada fragmento (los PDF no guardan parrafos).
 */
function componerPagina(items: TextItem[]): string {
  let texto = '';
  let ultimaY: number | null = null;
  for (const item of items) {
    const y = item.transform[5] as number | undefined;
    if (ultimaY !== null && y !== undefined && Math.abs(y - ultimaY) > 2) {
      texto += item.hasEOL === true ? '\n' : '\n';
    }
    texto += item.str;
    if (item.hasEOL === true) texto += '\n';
    if (y !== undefined) ultimaY = y;
  }
  return normalizar(texto);
}

/** Extrae texto por pagina de un PDF en memoria. Nunca lanza: informa. */
export async function extraerPdf(datos: Uint8Array): Promise<ResultadoPdf> {
  const base: ResultadoPdf = {
    diagnostico: 'corrupto',
    paginas: [],
    totalPaginas: 0,
    paginasConFallo: [],
    titulo: null,
    autor: null,
    detalle: null,
    herramienta: `pdfjs-dist@${VERSION_PDFJS}`,
  };

  const inicio = Date.now();
  // La tarea de carga es la duena del ciclo de vida: destroy() vive en ella,
  // no en el documento. Se libera siempre, incluso si la extraccion falla.
  let tarea;
  let documento;
  try {
    tarea = getDocument({
      data: datos,
      // Endurecimiento (plan §6.3). Nota: `isEvalSupported` desaparecio en
      // PDF.js 6 porque la libreria ya no usa eval en absoluto; el requisito
      // del plan lo cumple la propia version fijada, no una opcion.
      // Aqui ademas: sin fuentes del sistema ni recursos externos.
      disableFontFace: true,
      useSystemFonts: false,
      stopAtErrors: false,
      verbosity: VerbosityLevel.ERRORS,
    });
    documento = await tarea.promise;
  } catch (error) {
    await tarea?.destroy().catch(() => undefined);
    const mensaje = error instanceof Error ? error.message : 'ilegible';
    if (/password|encrypt/i.test(mensaje)) {
      return { ...base, diagnostico: 'cifrado', detalle: 'el PDF esta protegido con contrasena' };
    }
    return { ...base, detalle: `no se pudo abrir: ${mensaje}` };
  }

  try {
    base.totalPaginas = documento.numPages;
    const metadatos = await documento.getMetadata().catch(() => null);
    const info = metadatos?.info as { Title?: string; Author?: string } | undefined;
    base.titulo =
      info?.Title !== undefined && info.Title.trim().length > 0 ? info.Title.trim() : null;
    base.autor =
      info?.Author !== undefined && info.Author.trim().length > 0 ? info.Author.trim() : null;

    const limite = Math.min(documento.numPages, MAX_PAGINAS);
    const paginas: PaginaPdf[] = [];
    const fallos: number[] = [];

    for (let n = 1; n <= limite; n++) {
      if (Date.now() - inicio > MAX_MS) {
        fallos.push(n);
        break;
      }
      try {
        const pagina = await documento.getPage(n);
        const contenido = await pagina.getTextContent();
        const items = contenido.items.filter((i): i is TextItem => 'str' in i);
        const texto = componerPagina(items);
        if (texto.length > 0) paginas.push({ pagina: n, texto });
        pagina.cleanup();
      } catch {
        fallos.push(n);
      }
    }

    const caracteres = paginas.reduce((suma, p) => suma + p.texto.length, 0);
    const media = limite > 0 ? caracteres / limite : 0;

    let diagnostico: DiagnosticoPdf;
    if (paginas.length === 0 || media < MIN_CARACTERES_UTILES) {
      diagnostico = 'sin-texto-candidato-ocr';
    } else if (fallos.length > 0 || limite < documento.numPages) {
      diagnostico = 'parcialmente-extraible';
    } else {
      diagnostico = 'con-texto';
    }

    return {
      ...base,
      diagnostico,
      paginas,
      paginasConFallo: fallos,
      detalle:
        diagnostico === 'sin-texto-candidato-ocr'
          ? 'el PDF no tiene capa de texto: probablemente es un escaneo'
          : fallos.length > 0
            ? `${String(fallos.length)} paginas no se pudieron extraer`
            : null,
    };
  } catch (error) {
    return { ...base, detalle: error instanceof Error ? error.message : 'fallo al extraer' };
  } finally {
    await tarea.destroy().catch(() => undefined);
  }
}
