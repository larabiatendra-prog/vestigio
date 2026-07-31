// Normalizacion espanola y valenciana de doble capa (plan §9.2).
//
// Capa EXACTA: el texto tal cual, en NFC. El indice FTS5 usa
// `unicode61 remove_diacritics 0`, asi que 'cañón' y 'canon' son palabras
// distintas y 'año' nunca se confunde con 'ano'. Es la capa que manda.
//
// Capa TOLERANTE: quita SOLO los acentos vocalicos y conserva la 'ñ'.
// Nunca se usa `remove_diacritics=1/2` global: eso destruiria la ñ, que en
// espanol es una letra, no una vocal acentuada.
//
// 'ç' y 'l·l' no se "normalizan": generan VARIANTES EXPLICITAS, de modo
// que 'façana' se encuentre escribiendo 'facana' sin borrar la diferencia
// en el indice exacto. Las variantes son auditables: la funcion dice
// exactamente que produjo.

// Marcadores del area de uso privado de Unicode: no aparecen en texto real,
// asi que sirven para proteger letras durante la descomposicion.
const RESGUARDO_ENYE_MIN = '\uE001';
const RESGUARDO_ENYE_MAY = '\uE002';
const RESGUARDO_CEDILLA_MIN = '\uE003';
const RESGUARDO_CEDILLA_MAY = '\uE004';

/** El punto volado del valenciano en sus varios codepoints reales. */
const ELE_GEMINADA = /l[\u00b7\u2022\u2219\u2027]l/gi;

/** Marcas combinantes: tildes, dieresis, agudos, graves. */
const MARCAS_COMBINANTES = /[\u0300-\u036f]/g;

/** Texto listo para el indice exacto: solo NFC, sin perder nada. */
export function normalizarExacto(texto: string): string {
  return texto.normalize('NFC');
}

/**
 * Quita acentos vocalicos conservando la 'ñ'. La 'ç' y 'l·l' se conservan
 * tal cual aqui; sus equivalencias viven en `variantesTolerantes`.
 */
export function quitarAcentosVocalicos(texto: string): string {
  return texto
    .normalize('NFC')
    .replaceAll('ñ', RESGUARDO_ENYE_MIN)
    .replaceAll('Ñ', RESGUARDO_ENYE_MAY)
    .replaceAll('ç', RESGUARDO_CEDILLA_MIN)
    .replaceAll('Ç', RESGUARDO_CEDILLA_MAY)
    .normalize('NFD')
    .replace(MARCAS_COMBINANTES, '')
    .normalize('NFC')
    .replaceAll(RESGUARDO_ENYE_MIN, 'ñ')
    .replaceAll(RESGUARDO_ENYE_MAY, 'Ñ')
    .replaceAll(RESGUARDO_CEDILLA_MIN, 'ç')
    .replaceAll(RESGUARDO_CEDILLA_MAY, 'Ç');
}

/** Forma canonica de la capa tolerante: minusculas y sin acentos vocalicos. */
export function normalizarTolerante(texto: string): string {
  return quitarAcentosVocalicos(texto).toLowerCase();
}

/**
 * Devuelve la forma tolerante MAS sus variantes explicitas de grafia.
 * Ejemplos:
 *   'façana'     -> ['facana', 'façana']
 *   'col·lecció' -> ['col·leccio', 'colleccio']
 * Indexadas juntas, cualquiera de las formas encuentra el documento sin
 * que el indice exacto pierda la diferencia.
 */
export function variantesTolerantes(texto: string): string[] {
  const base = normalizarTolerante(texto);
  const variantes = new Set<string>([base]);

  const conCedillaLlana = base.includes('ç') ? base.replaceAll('ç', 'c') : null;
  if (conCedillaLlana !== null) variantes.add(conCedillaLlana);

  if (ELE_GEMINADA.test(base)) {
    ELE_GEMINADA.lastIndex = 0;
    variantes.add(base.replace(ELE_GEMINADA, 'll'));
    if (conCedillaLlana !== null) {
      variantes.add(conCedillaLlana.replace(ELE_GEMINADA, 'll'));
    }
  }
  ELE_GEMINADA.lastIndex = 0;

  // Quien escriba 'colleccio' tambien debe encontrar 'col·leccio'.
  if (/ll/.test(base)) variantes.add(base.replace(/ll/g, 'l·l'));

  return [...variantes];
}

/**
 * Texto que se guarda en el indice tolerante: la forma canonica mas las
 * variantes de cada palabra, separadas por espacio para que FTS5 las
 * tokenice todas.
 */
export function textoParaIndiceTolerante(texto: string): string {
  const canonico = normalizarTolerante(texto);
  const extras = new Set<string>();

  for (const palabra of canonico.split(/\s+/)) {
    if (palabra.length === 0) continue;
    for (const variante of variantesTolerantes(palabra)) {
      if (variante !== palabra) extras.add(variante);
    }
  }

  return extras.size === 0 ? canonico : `${canonico} ${[...extras].join(' ')}`;
}

/**
 * Une palabras partidas por guion de fin de linea, tipico de la extraccion
 * de PDF y del OCR: 'desinfec-\ncion' -> 'desinfeccion'.
 */
export function unirGuionesDeCorte(texto: string): string {
  return texto.replace(/(\p{L})[-\u00ad]\s*\n\s*(\p{L})/gu, '$1$2');
}

/** Dos textos que solo se diferencian en acentos vocalicos. */
export function difierenSoloEnTildes(a: string, b: string): boolean {
  if (a.normalize('NFC') === b.normalize('NFC')) return false;
  return normalizarTolerante(a) === normalizarTolerante(b);
}
