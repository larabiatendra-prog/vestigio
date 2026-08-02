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
  type AssetCanonico,
  type RecursoCanonico,
  type SegmentoCanonico,
} from '@vestigio/database';
import {
  leerEpub,
  markdownAHtml,
  sanearHtml,
  segmentarHtml,
  textoAHtml,
  PREFIJO_IMAGEN_EPUB,
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
import { generarFallback, type RecursoFallback } from '@vestigio/diagnostico';

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

/**
 * Fichero producido por la ingesta (no copiado de la carpeta origen): hoy,
 * las imagenes extraidas de un EPUB. Se escriben en CONTENT/derivados.
 */
export interface DerivadoBinario {
  rutaLogica: string;
  datos: Buffer;
}

export interface ResultadoIngesta {
  recursos: RecursoCanonico[];
  fuentes: FuenteRegistrada[];
  derivados: DerivadoBinario[];
  informe: InformeIngesta;
}

/** Extension a partir del tipo declarado; sin adivinar por el nombre. */
function extensionDeMime(mimetype: string): string {
  switch (mimetype) {
    case 'image/png':
      return '.png';
    case 'image/jpeg':
      return '.jpg';
    case 'image/gif':
      return '.gif';
    case 'image/webp':
      return '.webp';
    case 'image/svg+xml':
      return '.svg';
    default:
      return '.bin';
  }
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

/**
 * Cambia las referencias internas del EPUB por el identificador del asset
 * que ya tiene la imagen en la edicion. El saneado ya paso: aqui solo se
 * sustituye un valor de atributo que hemos escrito nosotros y cuyo formato
 * conocemos, asi que no hay marcado que reinterpretar.
 *
 * Una imagen que el libro cita y no trae se queda sin src: mejor un hueco
 * con su texto alternativo que una ruta rota.
 */
function resolverImagenesDelCapitulo(html: string, porRuta: Map<string, string>): string {
  return html.replace(
    new RegExp(`src="${PREFIJO_IMAGEN_EPUB}([^"]*)"`, 'g'),
    (completo, codificada: string) => {
      const ruta = decodeURI(codificada);
      const uuid = porRuta.get(ruta);
      return uuid === undefined ? 'alt-sin-imagen="1"' : `src="vestigio://asset/${uuid}"`;
    },
  );
}

/** Analiza la carpeta origen y produce la representacion canonica. */
export async function analizarCarpeta(
  origen: string,
  dirEdicion: string,
): Promise<ResultadoIngesta> {
  const rutas = explorar(origen);
  const recursos: RecursoCanonico[] = [];
  const fuentes: FuenteRegistrada[] = [];
  const derivados: DerivadoBinario[] = [];
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
    let autor: string | null = null;
    let idiomaDeclarado: string | null = null;
    let herramientaExtra: string | null = null;
    const assetsExtra: AssetCanonico[] = [];

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
      // Los metadatos del PDF son lo unico que sabemos de la autoria: si
      // vienen, se guardan; si no, la ficha dira que no constan.
      autor = pdf.autor;
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
    } else if (formato === 'epub') {
      const libro = leerEpub(contenido);
      herramientaExtra = libro.herramienta;
      detalleTexto = libro.detalle;
      if (libro.titulo !== null && libro.titulo.length > 2) titulo = libro.titulo;
      autor = libro.autor;
      idiomaDeclarado = libro.idioma;

      if (libro.diagnostico === 'invalido') {
        estadoTexto = 'ilegible';
      } else {
        estadoTexto = libro.diagnostico === 'con-texto' ? 'texto-completo' : 'sin-texto';

        // Cada imagen del libro pasa a ser un asset derivado con identidad
        // propia derivada de su contenido, y el capitulo deja de apuntar a
        // una ruta interna del EPUB para apuntar a ese asset.
        const porRuta = new Map<string, string>();
        for (const imagen of libro.imagenes) {
          // El protocolo interno sirve SVG como texto plano a proposito
          // (decision del bloque 02: nunca como imagen activa), asi que
          // extraerlo solo daria un hueco roto. Se deja fuera y se dice.
          if (imagen.mimetype === 'image/svg+xml') continue;
          const shaImagen = sha256De(imagen.datos);
          const uuidImagen = uuidDesdeSha256(shaImagen);
          const rutaLogica = `derivados/${uuidImagen}${extensionDeMime(imagen.mimetype)}`;
          porRuta.set(imagen.href, uuidImagen);
          if (assetsExtra.some((a) => a.id === uuidImagen)) continue;
          assetsExtra.push({
            id: uuidImagen,
            roles: ['access_derivative'],
            formato: imagen.mimetype,
            rutaLogica,
            bytes: imagen.datos.length,
            sha256: shaImagen,
          });
          derivados.push({ rutaLogica, datos: imagen.datos });
        }

        segmentos = libro.capitulos.map((capitulo) => ({
          // Localizador por capitulo: un EPUB reflowable no tiene paginas.
          localizador: capitulo.localizador,
          titulo: capitulo.titulo,
          nivel: 2,
          cuerpo: capitulo.texto,
          html: resolverImagenesDelCapitulo(capitulo.html, porRuta),
          pagina: null,
        }));
        if (segmentos.length > 0) {
          textoParaIdioma = libro.capitulos.map((c) => c.texto).join('\n');
        }
      }
    } else if (formato === 'imagen') {
      // Una imagen suelta no tiene texto, y decirlo es mas util que fingir
      // que si: se conserva, se abre y se puede anotar.
      estadoTexto = 'sin-texto';
      detalleTexto = 'imagen: se conserva y se muestra, pero no hay texto que buscar dentro';
    }

    if (segmentos.length === 0) informe.sinTexto++;
    // Si el propio libro declara su idioma, se le cree antes que a la
    // deteccion estadistica sobre su texto.
    const idiomaNormalizado = idiomaDeclarado?.slice(0, 2).toLowerCase() ?? null;
    const idioma =
      idiomaNormalizado !== null && /^[a-z]{2}$/.test(idiomaNormalizado)
        ? idiomaNormalizado
        : detectarIdioma(textoParaIdioma);
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
      ...(autor !== null ? { autor } : {}),
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
        ...assetsExtra,
      ],
      segmentos,
    });
    fuentes.push({
      uuid,
      nombreOriginal: rel,
      sha256: sha,
      bytes,
      adquirido,
      herramienta: herramientaExtra === null ? HERRAMIENTA : `${HERRAMIENTA}+${herramientaExtra}`,
    });
    informe.ingeridos++;
    informe.porFormato[formato] = (informe.porFormato[formato] ?? 0) + 1;
  }

  return { recursos, fuentes, derivados, informe };
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
  for (const carpeta of ['originals', 'derivados', 'index', 'manifest']) {
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

  // Derivados producidos por la ingesta (hoy, imagenes sacadas de un EPUB):
  // no salen de la carpeta origen, asi que se escriben aqui.
  for (const derivado of resultado.derivados) {
    writeFileSync(join(dirContent, derivado.rutaLogica), derivado.datos);
  }

  construirCatalogoFixture(
    join(dirContent, 'index', 'vestigio-content.sqlite'),
    resultado.recursos,
    {
      corpus: corpusVersion,
      informacionVigente: '',
    },
  );

  // Salida de emergencia: el catalogo legible sin la aplicacion. Se genera
  // ahora, al construir la edicion, porque si la app se rompe ya es tarde.
  const paraFallback: RecursoFallback[] = resultado.recursos.map((recurso) => ({
    titulo: recurso.titulo,
    autor: recurso.autor ?? null,
    formato: recurso.formato,
    idioma: recurso.idioma,
    rutaOriginal: recurso.assets?.[0]?.rutaLogica ?? null,
    resumen: recurso.segmentos?.[0]?.cuerpo.slice(0, 160).trim() ?? null,
  }));
  generarFallback({
    root: dirEdicion,
    corpus: corpusVersion,
    generado: new Date().toISOString(),
    recursos: paraFallback,
  });

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
