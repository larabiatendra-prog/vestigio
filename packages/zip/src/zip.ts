// ZIP propio de Vestigio, escrito aqui a proposito.
//
// Lo usan dos cosas con amenazas distintas: el paquete del espacio personal
// (bloque 12), que Vestigio escribe y vuelve a leer, y los EPUB (bloque 07),
// que llegan de donde sea. En ambos casos el fichero puede venir de fuera,
// asi que las defensas tienen que estar a la vista y bajo prueba: sin rutas
// absolutas ni '..', sin enlaces, con topes de tamano, de numero de entradas
// y de ratio de compresion (bomba zip), y con CRC verificado antes de creer
// un solo byte. Solo se aceptan 'store' y 'deflate'.
//
// Sin zip64 a proposito: ni el espacio personal ni un libro lo necesitan.
// Un fichero que lo pidiese seria una senal de que algo va mal.

import { deflateRawSync, inflateRawSync } from 'node:zlib';

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

const METODO_STORE = 0;
const METODO_DEFLATE = 8;

/** Fecha DOS fija (1980-01-01 00:00): dos paquetes iguales dan bytes iguales. */
const FECHA_DOS = 0x0021;
const HORA_DOS = 0x0000;

export interface EntradaZip {
  nombre: string;
  datos: Buffer;
}

/**
 * Que nombres de entrada se aceptan.
 *
 * - `estricto`: solo lo que Vestigio genera. Se usa al ESCRIBIR y al leer
 *   sus propios paquetes, donde cualquier nombre raro es de por si un aviso.
 * - `documento`: nombres de ficheros reales de terceros (un EPUB trae
 *   "OEBPS/Text/Section 0001.xhtml" o acentos). Mas permisivo en los
 *   caracteres, igual de duro con todo lo que permite escapar de la carpeta.
 */
export type PerfilNombres = 'estricto' | 'documento';

export interface LimitesZip {
  maxEntradas: number;
  maxBytesEntrada: number;
  maxBytesTotal: number;
  /** Tope de expansion por entrada: descomprimido / comprimido. */
  maxRatio: number;
  maxProfundidad: number;
  perfilNombres: PerfilNombres;
}

// La defensa principal contra una bomba zip son los topes ABSOLUTOS: por
// mucho que se expanda una entrada, nunca se descomprimen mas bytes de los
// que caben aqui. El ratio es una segunda linea, y por eso es holgado: una
// base SQLite con paginas vacias comprime muchisimo de forma legitima y no
// queremos rechazar paquetes buenos.
export const LIMITES_POR_DEFECTO: LimitesZip = {
  maxEntradas: 512,
  maxBytesEntrada: 128 * 1024 * 1024,
  maxBytesTotal: 512 * 1024 * 1024,
  maxRatio: 2000,
  maxProfundidad: 4,
  perfilNombres: 'estricto',
};

/**
 * Limites para EPUB. Un libro ilustrado trae facilmente cientos de ficheros
 * y carpetas mas hondas que un paquete propio, pero sigue siendo un libro:
 * si pide mas de esto, no es un libro.
 */
export const LIMITES_EPUB: LimitesZip = {
  maxEntradas: 5000,
  maxBytesEntrada: 64 * 1024 * 1024,
  maxBytesTotal: 512 * 1024 * 1024,
  maxRatio: 500,
  maxProfundidad: 8,
  perfilNombres: 'documento',
};

export class ErrorZip extends Error {
  constructor(
    public readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorZip';
  }
}

// --- CRC-32 -----------------------------------------------------------------

const TABLA_CRC = ((): Uint32Array => {
  const tabla = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[i] = c >>> 0;
  }
  return tabla;
})();

export function crc32(datos: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) {
    const indice = (c ^ (datos[i] ?? 0)) & 0xff;
    c = (TABLA_CRC[indice] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// --- Validacion de nombres ---------------------------------------------------

/** Solo lo que Vestigio genera. */
const NOMBRE_ESTRICTO = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

/**
 * Caracteres que no pueden aparecer en el nombre de una entrada: los de
 * control y los que Windows prohibe en un nombre de fichero. Se comparan
 * por codigo en vez de con una expresion regular para que se vea cual es
 * cada uno; la barra '/' no esta porque es el separador de carpetas.
 */
const CODIGOS_PROHIBIDOS = new Set([
  0x3c, // <
  0x3e, // >
  0x3a, // :
  0x22, // "
  0x7c, // |
  0x3f, // ?
  0x2a, // *
  0x5c, // \ (separador de Windows: nunca dentro de un nombre)
]);

function tieneCaracterProhibido(nombre: string): boolean {
  for (const caracter of nombre) {
    const codigo = caracter.codePointAt(0) ?? 0;
    if (codigo < 0x20 || codigo === 0x7f) return true;
    if (CODIGOS_PROHIBIDOS.has(codigo)) return true;
  }
  return false;
}

/** Nombres de dispositivo de MS-DOS que siguen vivos en Windows. */
const RESERVADOS_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

/**
 * Un nombre de entrada aceptable: relativo, sin trucos y sin sorpresas de
 * codificacion. Se comprueba al escribir y, sobre todo, al leer: es la
 * defensa contra zip-slip.
 *
 * Lo que se prohibe en ambos perfiles es lo que permite salirse de la
 * carpeta o confundir a Windows al escribir en disco. Lo unico que afloja
 * el perfil 'documento' es que letras y signos corrientes valgan.
 */
export function nombreEntradaValido(
  nombre: string,
  perfil: PerfilNombres = 'estricto',
  maxProfundidad = LIMITES_POR_DEFECTO.maxProfundidad,
): boolean {
  if (nombre.length === 0 || nombre.length > 250) return false;
  if (tieneCaracterProhibido(nombre)) return false;
  if (nombre.startsWith('/') || /^[A-Za-z]:/.test(nombre)) return false;

  const partes = nombre.split('/');
  if (partes.length > maxProfundidad) return false;
  for (const parte of partes) {
    if (parte.length === 0 || parte === '.' || parte === '..') return false;
    // Windows se come los puntos y espacios finales al crear el fichero, y
    // "carpeta.." acabaria siendo "carpeta." y luego otra cosa.
    if (parte !== parte.replace(/[. ]+$/, '')) return false;
    if (RESERVADOS_WINDOWS.test(parte)) return false;
  }

  if (perfil === 'estricto') return NOMBRE_ESTRICTO.test(nombre);
  return true;
}

// --- Escritura ---------------------------------------------------------------

interface EntradaEscrita {
  nombre: Buffer;
  crc: number;
  metodo: number;
  comprimido: Buffer;
  tamanoOriginal: number;
  desplazamiento: number;
}

/**
 * Escribe un ZIP determinista: mismas entradas y mismo contenido producen
 * exactamente los mismos bytes (fecha fija y nivel de compresion fijo).
 */
export function escribirZip(entradas: EntradaZip[]): Buffer {
  if (entradas.length > LIMITES_POR_DEFECTO.maxEntradas) {
    throw new ErrorZip('demasiadas-entradas', 'el paquete tiene demasiadas entradas');
  }
  const vistos = new Set<string>();
  const piezas: Buffer[] = [];
  const escritas: EntradaEscrita[] = [];
  let desplazamiento = 0;

  for (const entrada of entradas) {
    if (!nombreEntradaValido(entrada.nombre)) {
      throw new ErrorZip('nombre-invalido', `nombre de entrada no permitido: ${entrada.nombre}`);
    }
    if (vistos.has(entrada.nombre)) {
      throw new ErrorZip('entrada-duplicada', `entrada repetida: ${entrada.nombre}`);
    }
    vistos.add(entrada.nombre);

    const nombre = Buffer.from(entrada.nombre, 'utf8');
    const crc = crc32(entrada.datos);
    const deflactado = deflateRawSync(entrada.datos, { level: 9 });
    // Si comprimir no ayuda (ya lo esta, o es diminuto), se guarda tal cual.
    const usaDeflate = deflactado.length < entrada.datos.length;
    const comprimido = usaDeflate ? deflactado : entrada.datos;
    const metodo = usaDeflate ? METODO_DEFLATE : METODO_STORE;

    const cabecera = Buffer.alloc(30);
    cabecera.writeUInt32LE(SIG_LOCAL, 0);
    cabecera.writeUInt16LE(20, 4);
    cabecera.writeUInt16LE(0x0800, 6); // nombres en UTF-8
    cabecera.writeUInt16LE(metodo, 8);
    cabecera.writeUInt16LE(HORA_DOS, 10);
    cabecera.writeUInt16LE(FECHA_DOS, 12);
    cabecera.writeUInt32LE(crc, 14);
    cabecera.writeUInt32LE(comprimido.length, 18);
    cabecera.writeUInt32LE(entrada.datos.length, 22);
    cabecera.writeUInt16LE(nombre.length, 26);
    cabecera.writeUInt16LE(0, 28);

    piezas.push(cabecera, nombre, comprimido);
    escritas.push({
      nombre,
      crc,
      metodo,
      comprimido,
      tamanoOriginal: entrada.datos.length,
      desplazamiento,
    });
    desplazamiento += cabecera.length + nombre.length + comprimido.length;
  }

  const inicioCentral = desplazamiento;
  let tamanoCentral = 0;
  for (const e of escritas) {
    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIG_CENTRAL, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(e.metodo, 10);
    central.writeUInt16LE(HORA_DOS, 12);
    central.writeUInt16LE(FECHA_DOS, 14);
    central.writeUInt32LE(e.crc, 16);
    central.writeUInt32LE(e.comprimido.length, 20);
    central.writeUInt32LE(e.tamanoOriginal, 24);
    central.writeUInt16LE(e.nombre.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comentario
    central.writeUInt16LE(0, 34); // disco
    central.writeUInt16LE(0, 36); // atributos internos
    central.writeUInt32LE(0, 38); // atributos externos: fichero normal
    central.writeUInt32LE(e.desplazamiento, 42);
    piezas.push(central, e.nombre);
    tamanoCentral += central.length + e.nombre.length;
  }

  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(SIG_EOCD, 0);
  fin.writeUInt16LE(0, 4);
  fin.writeUInt16LE(0, 6);
  fin.writeUInt16LE(escritas.length, 8);
  fin.writeUInt16LE(escritas.length, 10);
  fin.writeUInt32LE(tamanoCentral, 12);
  fin.writeUInt32LE(inicioCentral, 16);
  fin.writeUInt16LE(0, 20);
  piezas.push(fin);

  return Buffer.concat(piezas);
}

// --- Lectura -----------------------------------------------------------------

interface EntradaCentral {
  nombre: string;
  metodo: number;
  crc: number;
  tamanoComprimido: number;
  tamanoOriginal: number;
  desplazamiento: number;
}

function localizarEocd(buffer: Buffer): number {
  // El EOCD esta al final salvo que haya comentario (max 65535 bytes).
  const minimo = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= minimo; i--) {
    if (buffer.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
}

/**
 * Lee un ZIP aplicando los limites: cualquier cosa rara aborta la lectura
 * entera con un codigo accionable, nunca con un volcado a disco a medias.
 */
export function leerZip(buffer: Buffer, limites: LimitesZip = LIMITES_POR_DEFECTO): EntradaZip[] {
  if (buffer.length < 22) throw new ErrorZip('no-es-zip', 'el fichero es demasiado corto');

  const eocd = localizarEocd(buffer);
  if (eocd < 0) throw new ErrorZip('no-es-zip', 'no se encuentra el final del ZIP');

  const total = buffer.readUInt16LE(eocd + 10);
  const tamanoCentral = buffer.readUInt32LE(eocd + 12);
  const inicioCentral = buffer.readUInt32LE(eocd + 16);

  if (total > limites.maxEntradas) {
    throw new ErrorZip('demasiadas-entradas', `el ZIP declara ${String(total)} entradas`);
  }
  if (inicioCentral + tamanoCentral > buffer.length) {
    throw new ErrorZip('zip-corrupto', 'el directorio central se sale del fichero');
  }

  const centrales: EntradaCentral[] = [];
  let cursor = inicioCentral;
  for (let i = 0; i < total; i++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== SIG_CENTRAL) {
      throw new ErrorZip('zip-corrupto', 'directorio central ilegible');
    }
    const metodo = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const tamanoComprimido = buffer.readUInt32LE(cursor + 20);
    const tamanoOriginal = buffer.readUInt32LE(cursor + 24);
    const largoNombre = buffer.readUInt16LE(cursor + 28);
    const largoExtra = buffer.readUInt16LE(cursor + 30);
    const largoComentario = buffer.readUInt16LE(cursor + 32);
    const desplazamiento = buffer.readUInt32LE(cursor + 42);
    const nombre = buffer.toString('utf8', cursor + 46, cursor + 46 + largoNombre);

    // Entradas de carpeta: los ZIP reales las traen y no llevan datos. Se
    // ignoran en vez de rechazar el fichero entero por ellas.
    if (nombre.endsWith('/')) {
      cursor += 46 + largoNombre + largoExtra + largoComentario;
      continue;
    }
    if (!nombreEntradaValido(nombre, limites.perfilNombres, limites.maxProfundidad)) {
      throw new ErrorZip(
        'nombre-invalido',
        `el fichero contiene una ruta que no se acepta: ${nombre.slice(0, 80)}`,
      );
    }
    if (tamanoOriginal > limites.maxBytesEntrada) {
      throw new ErrorZip('entrada-enorme', `la entrada ${nombre} es demasiado grande`);
    }
    if (
      metodo === METODO_DEFLATE &&
      tamanoComprimido > 0 &&
      tamanoOriginal / tamanoComprimido > limites.maxRatio
    ) {
      throw new ErrorZip('bomba-zip', `la entrada ${nombre} se expande demasiado`);
    }
    centrales.push({
      nombre,
      metodo,
      crc,
      tamanoComprimido,
      tamanoOriginal,
      desplazamiento,
    });
    cursor += 46 + largoNombre + largoExtra + largoComentario;
  }

  const sumaOriginal = centrales.reduce((acumulado, e) => acumulado + e.tamanoOriginal, 0);
  if (sumaOriginal > limites.maxBytesTotal) {
    throw new ErrorZip('paquete-enorme', 'el paquete descomprimido supera el limite');
  }

  const salida: EntradaZip[] = [];
  for (const entrada of centrales) {
    const inicio = entrada.desplazamiento;
    if (inicio + 30 > buffer.length || buffer.readUInt32LE(inicio) !== SIG_LOCAL) {
      throw new ErrorZip('zip-corrupto', `cabecera local ilegible en ${entrada.nombre}`);
    }
    const largoNombre = buffer.readUInt16LE(inicio + 26);
    const largoExtra = buffer.readUInt16LE(inicio + 28);
    const datosInicio = inicio + 30 + largoNombre + largoExtra;
    const datosFin = datosInicio + entrada.tamanoComprimido;
    if (datosFin > buffer.length) {
      throw new ErrorZip('zip-corrupto', `los datos de ${entrada.nombre} se salen del fichero`);
    }
    const crudo = buffer.subarray(datosInicio, datosFin);

    let datos: Buffer;
    if (entrada.metodo === METODO_STORE) {
      datos = Buffer.from(crudo);
    } else if (entrada.metodo === METODO_DEFLATE) {
      try {
        datos = inflateRawSync(crudo, { maxOutputLength: limites.maxBytesEntrada });
      } catch {
        throw new ErrorZip('zip-corrupto', `no se pudo descomprimir ${entrada.nombre}`);
      }
    } else {
      throw new ErrorZip(
        'metodo-no-soportado',
        `la entrada ${entrada.nombre} usa un metodo de compresion que Vestigio no acepta`,
      );
    }

    if (datos.length !== entrada.tamanoOriginal) {
      throw new ErrorZip('zip-corrupto', `${entrada.nombre} no mide lo que dice medir`);
    }
    if (crc32(datos) !== entrada.crc) {
      throw new ErrorZip('crc-no-cuadra', `${entrada.nombre} esta alterado o danado`);
    }
    salida.push({ nombre: entrada.nombre, datos });
  }

  return salida;
}
