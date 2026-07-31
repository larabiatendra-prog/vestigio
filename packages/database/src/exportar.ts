// Exportacion legible y determinista del espacio personal (bloque 12, t.7).
//
// El criterio de salida es duro: estos ficheros tienen que seguir siendo
// utiles con Vestigio roto, borrado o inexistente. Por eso no hay formatos
// propios ni identificadores sin traducir cuando se puede evitar: cada nota
// dice a que documento pertenece por su titulo, ademas de por su UUID.
//
// Determinista significa que dos exportaciones del mismo estado producen
// byte a byte el mismo fichero: orden fijo por clave estable, saltos de
// linea LF y ninguna marca de tiempo generada por dentro (la fecha entra
// como parametro).

import type { DatabaseSync } from 'node:sqlite';
import {
  RepositorioPersonal,
  type Coleccion,
  type Favorito,
  type Marcador,
  type NotaPersonal,
  type ProgresoLectura,
} from './repositorio-personal.js';

export interface RecursoNombrado {
  titulo: string;
  slug: string;
}

/** Traduce UUID a titulo; si no se puede, la exportacion lo dice. */
export type ResolverRecurso = (recursoId: string) => RecursoNombrado | null;

export interface VolcadoPersonal {
  formato: 'vestigio-espacio-personal';
  version: 1;
  generado: string;
  app: string;
  corpus: string | null;
  esquemaPersonal: number;
  favoritos: (Favorito & { titulo: string | null })[];
  colecciones: (Coleccion & {
    elementosRecursos: { recursoId: string; titulo: string | null }[];
  })[];
  notas: (NotaPersonal & { titulo: string | null })[];
  marcadores: (Marcador & { titulo: string | null })[];
  progreso: (ProgresoLectura & { titulo: string | null })[];
}

export interface OpcionesVolcado {
  generado: string;
  app: string;
  corpus: string | null;
  esquemaPersonal: number;
  resolver?: ResolverRecurso;
}

const SIN_TITULO = null;

function titular(resolver: ResolverRecurso | undefined, recursoId: string): string | null {
  return resolver?.(recursoId)?.titulo ?? SIN_TITULO;
}

/** Reune todo el estado personal en una estructura ordenada y estable. */
export function volcarPersonal(db: DatabaseSync, opciones: OpcionesVolcado): VolcadoPersonal {
  const repo = new RepositorioPersonal(db);
  const { resolver } = opciones;

  const favoritos = repo
    .listarFavoritos()
    .map((f) => ({ ...f, titulo: titular(resolver, f.recursoId) }))
    .sort((a, b) => a.recursoId.localeCompare(b.recursoId));

  const colecciones = repo
    .listarColecciones()
    .map((c) => ({
      ...c,
      elementosRecursos: repo
        .itemsColeccion(c.id)
        .map((i) => ({ recursoId: i.recursoId, titulo: titular(resolver, i.recursoId) }))
        .sort((a, b) => a.recursoId.localeCompare(b.recursoId)),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const notas = repo
    .listarNotas()
    .map((n) => ({ ...n, titulo: titular(resolver, n.recursoId) }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const marcadores = repo
    .listarMarcadores()
    .map((m) => ({ ...m, titulo: titular(resolver, m.recursoId) }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const progreso = repo
    .listarProgreso()
    .map((p) => ({ ...p, titulo: titular(resolver, p.recursoId) }))
    .sort((a, b) => a.recursoId.localeCompare(b.recursoId));

  return {
    formato: 'vestigio-espacio-personal',
    version: 1,
    generado: opciones.generado,
    app: opciones.app,
    corpus: opciones.corpus,
    esquemaPersonal: opciones.esquemaPersonal,
    favoritos,
    colecciones,
    notas,
    marcadores,
    progreso,
  };
}

// --- JSON --------------------------------------------------------------------

export function aJson(volcado: VolcadoPersonal): string {
  return `${JSON.stringify(volcado, null, 2)}\n`;
}

// --- CSV ---------------------------------------------------------------------

/** BOM UTF-8: sin el, Excel en Windows destroza las tildes al abrir el CSV. */
const BOM = '﻿';

function celda(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  if (/[",\r\n]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

function tablaCsv(cabeceras: string[], filas: unknown[][]): string {
  const lineas = [cabeceras.join(','), ...filas.map((f) => f.map(celda).join(','))];
  return BOM + lineas.join('\n') + '\n';
}

export function csvFavoritos(v: VolcadoPersonal): string {
  return tablaCsv(
    ['documento', 'recurso_id', 'anadido'],
    v.favoritos.map((f) => [f.titulo ?? '(documento ausente del catálogo)', f.recursoId, f.creado]),
  );
}

export function csvNotas(v: VolcadoPersonal): string {
  return tablaCsv(
    ['documento', 'recurso_id', 'destino', 'seccion', 'pagina', 'nota', 'creada', 'modificada'],
    v.notas.map((n) => [
      n.titulo ?? '(documento ausente del catálogo)',
      n.recursoId,
      n.destinoTipo,
      n.segmento ?? n.ancla ?? '',
      n.pagina ?? '',
      n.texto,
      n.creada,
      n.modificada ?? '',
    ]),
  );
}

export function csvMarcadores(v: VolcadoPersonal): string {
  return tablaCsv(
    ['documento', 'recurso_id', 'localizador', 'etiqueta', 'creado'],
    v.marcadores.map((m) => [
      m.titulo ?? '(documento ausente del catálogo)',
      m.recursoId,
      m.localizador,
      m.etiqueta ?? '',
      m.creado,
    ]),
  );
}

export function csvColecciones(v: VolcadoPersonal): string {
  const filas: unknown[][] = [];
  for (const c of v.colecciones) {
    if (c.elementosRecursos.length === 0) {
      filas.push([c.nombre, c.descripcion ?? '', '', '', c.creada]);
      continue;
    }
    for (const e of c.elementosRecursos) {
      filas.push([
        c.nombre,
        c.descripcion ?? '',
        e.titulo ?? '(documento ausente del catálogo)',
        e.recursoId,
        c.creada,
      ]);
    }
  }
  return tablaCsv(['coleccion', 'descripcion', 'documento', 'recurso_id', 'creada'], filas);
}

export function csvProgreso(v: VolcadoPersonal): string {
  return tablaCsv(
    ['documento', 'recurso_id', 'localizador', 'pagina', 'porcentaje', 'actualizado'],
    v.progreso.map((p) => [
      p.titulo ?? '(documento ausente del catálogo)',
      p.recursoId,
      p.localizador ?? '',
      p.pagina ?? '',
      p.porcentaje ?? '',
      p.actualizado,
    ]),
  );
}

// --- Markdown ----------------------------------------------------------------

function nombreDocumento(titulo: string | null, recursoId: string): string {
  return titulo ?? `documento sin catalogar (${recursoId})`;
}

/** Version humana: la que se lee si un dia no hay ninguna aplicacion. */
export function aMarkdown(v: VolcadoPersonal): string {
  const l: string[] = [];
  l.push('# Mi espacio en Vestigio');
  l.push('');
  l.push(`Exportado el ${v.generado} · aplicación ${v.app} · corpus ${v.corpus ?? 'sin declarar'}`);
  l.push('');
  l.push(
    'Este fichero es texto plano: se lee con cualquier editor, sin Vestigio y sin ningún programa especial.',
  );
  l.push('');

  l.push('## Favoritos');
  l.push('');
  if (v.favoritos.length === 0) l.push('_Ninguno._');
  for (const f of v.favoritos) {
    l.push(`- ${nombreDocumento(f.titulo, f.recursoId)} — añadido el ${f.creado}`);
  }
  l.push('');

  l.push('## Colecciones');
  l.push('');
  if (v.colecciones.length === 0) l.push('_Ninguna._');
  for (const c of v.colecciones) {
    l.push(`### ${c.nombre}`);
    l.push('');
    if (c.descripcion !== null && c.descripcion.length > 0) {
      l.push(c.descripcion);
      l.push('');
    }
    if (c.elementosRecursos.length === 0) l.push('_Vacía._');
    for (const e of c.elementosRecursos) l.push(`- ${nombreDocumento(e.titulo, e.recursoId)}`);
    l.push('');
  }

  l.push('## Notas');
  l.push('');
  if (v.notas.length === 0) l.push('_Ninguna._');
  for (const n of v.notas) {
    const donde =
      n.destinoTipo === 'pagina' && n.pagina !== null
        ? `página ${String(n.pagina)}`
        : (n.segmento ?? n.ancla ?? 'el documento entero');
    l.push(`### ${nombreDocumento(n.titulo, n.recursoId)} — ${donde}`);
    l.push('');
    if (n.contexto !== null && n.contexto.length > 0) {
      l.push(`> ${n.contexto}`);
      l.push('');
    }
    l.push(n.texto);
    l.push('');
    l.push(
      `_Creada el ${n.creada}${n.modificada !== null ? `, modificada el ${n.modificada}` : ''}._`,
    );
    l.push('');
  }

  l.push('## Marcadores');
  l.push('');
  if (v.marcadores.length === 0) l.push('_Ninguno._');
  for (const m of v.marcadores) {
    l.push(
      `- ${nombreDocumento(m.titulo, m.recursoId)} — ${m.etiqueta ?? m.localizador} (${m.localizador})`,
    );
  }
  l.push('');

  l.push('## Por dónde iba');
  l.push('');
  if (v.progreso.length === 0) l.push('_Sin lecturas registradas._');
  for (const p of v.progreso) {
    const sitio =
      p.pagina !== null ? `página ${String(p.pagina)}` : (p.localizador ?? 'sin localizar');
    const porcentaje = p.porcentaje === null ? '' : ` (${String(Math.round(p.porcentaje))} %)`;
    l.push(`- ${nombreDocumento(p.titulo, p.recursoId)} — ${sitio}${porcentaje}`);
  }
  l.push('');

  return l.join('\n');
}

export const LEEME_PAQUETE = `Paquete del espacio personal de Vestigio
=======================================

Esto es un ZIP normal: se abre con el explorador de Windows sin instalar nada.

Dentro hay dos cosas:

  legible/     Tus datos en texto plano. Se leen con el Bloc de notas
               (mi-espacio.md), con Excel (los .csv) o con cualquier
               programa que entienda JSON (mi-espacio.json). No hacen
               falta Vestigio ni ningun otro programa.

  datos/       Una copia exacta de tu base personal (SQLite). Es lo que
               Vestigio usa para restaurar tu espacio tal y como estaba.

  manifiesto.json  Que hay en el paquete y la huella SHA-256 de cada
               fichero. Si alguien cambia un byte, Vestigio lo detecta al
               importar y no toca tus datos actuales.

Tus documentos NO estan aqui: el paquete guarda tu trabajo (favoritos,
colecciones, notas, marcadores y por donde ibas), no la biblioteca.
`;
