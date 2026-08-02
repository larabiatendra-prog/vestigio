// FALLBACK (bloque 16, tarea 6): la biblioteca sin Vestigio.
//
// Esto es lo que queda cuando la aplicación no arranca: un catálogo en HTML
// que abre cualquier navegador, un CSV que abre Excel, y una guía de
// recuperación en texto plano. Enlaces relativos a los originales, que
// siguen ahí intactos porque nunca se tocaron.
//
// Restricciones deliberadas:
//
//  - **Sin JavaScript.** Ni una línea. Tiene que funcionar en un navegador
//    viejo, con scripts desactivados, o abierto desde un USB por alguien
//    que no sabe qué es Vestigio.
//  - **Sin recursos externos.** El CSS va dentro del propio HTML.
//  - **Rutas relativas.** La carpeta se puede copiar a cualquier sitio y
//    seguir funcionando; ninguna ruta absoluta ni letra de unidad.
//
// Se genera al construir la edición, no al arrancar: si la aplicación está
// rota, ya es tarde para generarlo.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface RecursoFallback {
  titulo: string;
  autor: string | null;
  formato: string;
  idioma: string;
  /** Ruta lógica dentro de CONTENT, tal cual está en el catálogo. */
  rutaOriginal: string | null;
  /** Primeras líneas del documento, para reconocerlo sin abrirlo. */
  resumen: string | null;
}

export interface OpcionesFallback {
  root: string;
  corpus: string;
  generado: string;
  recursos: RecursoFallback[];
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Ruta relativa desde FALLBACK/ hasta un fichero de CONTENT. */
function enlaceA(rutaLogica: string): string {
  return `../CONTENT/${rutaLogica.split('/').map(encodeURIComponent).join('/')}`;
}

function celdaCsv(valor: string): string {
  return /[",\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

const ESTILO = `
  :root { color-scheme: light dark; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    max-width: 60rem; margin: 0 auto; padding: 2rem 1.5rem 4rem;
    line-height: 1.6; background: #131110; color: #e7dfcd;
  }
  h1 { font-size: 2rem; font-weight: normal; letter-spacing: 0.1em; }
  .lema { font-family: Consolas, monospace; font-size: 0.7rem;
          letter-spacing: 0.3em; text-transform: uppercase; color: #d9b36c; }
  .aviso { border: 1px solid rgba(217,179,108,0.35); padding: 1rem 1.25rem;
           margin: 1.5rem 0; }
  table { border-collapse: collapse; width: 100%; margin-top: 1.5rem; }
  th, td { text-align: left; padding: 0.6rem 0.5rem;
           border-bottom: 1px solid rgba(231,223,205,0.15); vertical-align: top; }
  th { font-family: Consolas, monospace; font-size: 0.7rem;
       letter-spacing: 0.12em; text-transform: uppercase; color: #8fae9c; }
  a { color: #d9b36c; }
  .sin-fichero { color: #8a8170; font-style: italic; }
  .resumen { color: #8a8170; font-size: 0.9rem; }
  @media print { body { background: #fff; color: #000; } a { color: #000; } }
`;

function paginaCatalogo(opciones: OpcionesFallback): string {
  const filas = opciones.recursos
    .map((recurso) => {
      const enlace =
        recurso.rutaOriginal === null
          ? '<span class="sin-fichero">sin fichero asociado</span>'
          : `<a href="${escapar(enlaceA(recurso.rutaOriginal))}">abrir</a>`;
      return `      <tr>
        <td>${escapar(recurso.titulo)}${
          recurso.resumen === null ? '' : `<div class="resumen">${escapar(recurso.resumen)}</div>`
        }</td>
        <td>${escapar(recurso.autor ?? 'sin determinar')}</td>
        <td>${escapar(recurso.formato)}</td>
        <td>${escapar(recurso.idioma)}</td>
        <td>${enlace}</td>
      </tr>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vestigio — catálogo de emergencia</title>
<style>${ESTILO}</style>
</head>
<body>
<h1>VESTIGIO</h1>
<p class="lema">El conocimiento que permanece</p>

<div class="aviso">
  <p><strong>Esta es la salida de emergencia.</strong> Estás viendo el catálogo
  sin la aplicación: una lista de todo lo que hay, con enlaces directos a los
  ficheros originales, que siguen intactos.</p>
  <p>Aquí no hay buscador ni notas: para eso hace falta Vestigio. Pero puedes
  llegar a cualquier documento, y eso es lo que importa hoy.</p>
  <p>Si Vestigio no arranca, lee <a href="RECUPERACION.txt">RECUPERACION.txt</a>.</p>
</div>

<p>Edición del corpus <strong>${escapar(opciones.corpus)}</strong> ·
${String(opciones.recursos.length)} documentos · lista generada el
${escapar(opciones.generado.slice(0, 10))}.</p>

<p>También disponible como <a href="catalogo.csv">hoja de cálculo (CSV)</a>.</p>

<table>
  <thead>
    <tr><th>Documento</th><th>Autoría</th><th>Formato</th><th>Idioma</th><th>Fichero</th></tr>
  </thead>
  <tbody>
${filas}
  </tbody>
</table>
</body>
</html>
`;
}

function catalogoCsv(opciones: OpcionesFallback): string {
  const lineas = ['documento,autoria,formato,idioma,fichero'];
  for (const recurso of opciones.recursos) {
    lineas.push(
      [
        celdaCsv(recurso.titulo),
        celdaCsv(recurso.autor ?? 'sin determinar'),
        celdaCsv(recurso.formato),
        celdaCsv(recurso.idioma),
        celdaCsv(recurso.rutaOriginal === null ? '' : `CONTENT/${recurso.rutaOriginal}`),
      ].join(','),
    );
  }
  // BOM: sin él, Excel en Windows destroza las tildes.
  return '﻿' + lineas.join('\n') + '\n';
}

function guiaRecuperacion(opciones: OpcionesFallback): string {
  return `SI VESTIGIO NO ARRANCA
======================

Edicion del corpus: ${opciones.corpus}
Lista generada el:  ${opciones.generado.slice(0, 10)}

Lo primero, y lo mas importante: TUS DOCUMENTOS ESTAN BIEN.

Vestigio nunca modifica los ficheros originales. Estan todos en la carpeta
CONTENT\\originals, con el nombre que les puso la ingesta. La aplicacion es
solo la forma comoda de buscarlos y leerlos; si se rompe, los documentos
siguen ahi.


COMO LLEGAR A ELLOS AHORA MISMO
-------------------------------

1. Abre FALLBACK\\index.html con doble clic. Es una lista de todo lo que hay,
   con un enlace a cada documento. Funciona en cualquier navegador y no
   necesita nada instalado.

2. Si prefieres una hoja de calculo, abre FALLBACK\\catalogo.csv con Excel.

3. Si ni eso funciona, entra directamente en CONTENT\\originals con el
   explorador de Windows. Los ficheros estan enteros, aunque con nombres
   poco amables.


COMO SABER QUE LE PASA
----------------------

Haz doble clic en Doctor.bat, en la raiz de la carpeta. Revisa la entrega y
escribe un informe en claro diciendo que ha encontrado y que hacer. No
necesita Internet, ni permisos de administrador, ni que Vestigio arranque.

El informe se guarda tambien en LOGS\\doctor.txt por si quieres consultarlo
despues o enviarlo a alguien.


COMO ARREGLARLO
---------------

Depende de lo que diga el Doctor:

- "Necesitas otra copia": el catalogo o los documentos estan danados de una
  forma que no se arregla desde aqui. Copia la carpeta CONTENT de otra copia
  de la biblioteca encima de esta.

- Problemas con tus notas y favoritos: en la carpeta BACKUPS hay copias
  automaticas (personal.respaldo.db y personal.respaldo.1.db). Sustituye
  USER_DATA\\vestigio-user.sqlite por la mas reciente que funcione.

- La aplicacion no arranca pero el Doctor no ve nada raro: puede ser el
  Control de aplicaciones de Windows bloqueando el ejecutable. Arranca con
  Vestigio.bat, que usa un camino distinto.


LO QUE NUNCA DEBES HACER
------------------------

No borres CONTENT para "empezar de cero". Es lo unico irrecuperable si no
tienes otra copia: tus notas se pueden rehacer, la biblioteca no.

No edites los ficheros de CONTENT a mano. Vestigio comprueba su huella y
dejaria de fiarse de ellos, con razon.
`;
}

export interface ResultadoFallback {
  ficheros: string[];
}

/** Escribe la carpeta FALLBACK entera. Idempotente. */
export function generarFallback(opciones: OpcionesFallback): ResultadoFallback {
  const dir = join(opciones.root, 'FALLBACK');
  mkdirSync(dir, { recursive: true });

  const ficheros: { nombre: string; contenido: string }[] = [
    { nombre: 'index.html', contenido: paginaCatalogo(opciones) },
    { nombre: 'catalogo.csv', contenido: catalogoCsv(opciones) },
    { nombre: 'RECUPERACION.txt', contenido: guiaRecuperacion(opciones) },
  ];
  for (const fichero of ficheros) {
    writeFileSync(join(dir, fichero.nombre), fichero.contenido, 'utf8');
  }
  return { ficheros: ficheros.map((f) => f.nombre) };
}

export const _internoFallback = { paginaCatalogo, catalogoCsv, guiaRecuperacion, enlaceA };
