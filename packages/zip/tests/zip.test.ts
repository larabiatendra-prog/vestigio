import { describe, expect, it } from 'vitest';
import {
  escribirZip,
  leerZip,
  nombreEntradaValido,
  crc32,
  ErrorZip,
  LIMITES_EPUB,
  type EntradaZip,
} from '../src/index.js';

const entradas: EntradaZip[] = [
  { nombre: 'manifiesto.json', datos: Buffer.from('{"a":1}', 'utf8') },
  { nombre: 'legible/mi-espacio.md', datos: Buffer.from('# Mi espacio\n'.repeat(50), 'utf8') },
];

describe('ida y vuelta', () => {
  it('no pierde un byte', () => {
    const leidas = leerZip(escribirZip(entradas));
    expect(leidas.map((e) => e.nombre)).toEqual(entradas.map((e) => e.nombre));
    expect(leidas[1]?.datos.toString('utf8')).toBe(entradas[1]?.datos.toString('utf8'));
  });

  it('es determinista: el mismo contenido da los mismos bytes', () => {
    expect(escribirZip(entradas).equals(escribirZip(entradas))).toBe(true);
  });

  it('el CRC-32 coincide con el valor conocido de la especificacion', () => {
    // Vector de referencia clasico: CRC-32 de "123456789".
    expect(crc32(Buffer.from('123456789', 'utf8'))).toBe(0xcbf43926);
  });
});

describe('nombres: defensa contra zip-slip', () => {
  const escapes = [
    '../fuera.txt',
    'a/../../fuera.txt',
    '/absoluto.txt',
    'C:/windows/system32.txt',
    'carpeta\\otra.txt',
    './aqui.txt',
    'a//b.txt',
  ];

  it('ningun perfil deja salir de la carpeta', () => {
    for (const malo of escapes) {
      expect(nombreEntradaValido(malo, 'estricto')).toBe(false);
      expect(nombreEntradaValido(malo, 'documento', 8)).toBe(false);
    }
  });

  it('ningun perfil acepta nombres que Windows reinterpreta', () => {
    // Puntos y espacios finales: Windows los borra al crear el fichero.
    expect(nombreEntradaValido('carpeta./x.txt', 'documento', 8)).toBe(false);
    expect(nombreEntradaValido('documento.txt ', 'documento', 8)).toBe(false);
    expect(nombreEntradaValido('documento.txt.', 'documento', 8)).toBe(false);
    // Un espacio en medio si es legitimo: "Section 0001.xhtml" existe.
    expect(nombreEntradaValido('Section 0001.xhtml', 'documento', 8)).toBe(true);
    // Nombres de dispositivo de MS-DOS, todavia vivos.
    for (const reservado of ['CON', 'nul.txt', 'COM1', 'lpt9.xhtml', 'aux']) {
      expect(nombreEntradaValido(reservado, 'documento', 8)).toBe(false);
    }
    // Caracteres de control y prohibidos por Windows.
    expect(nombreEntradaValido('a\u0000b', 'documento', 8)).toBe(false);
    expect(nombreEntradaValido('a\u001fb', 'documento', 8)).toBe(false);
    expect(nombreEntradaValido('a:b', 'documento', 8)).toBe(false);
    expect(nombreEntradaValido('a?b', 'documento', 8)).toBe(false);
  });

  it('el perfil de documento acepta nombres reales de un EPUB', () => {
    for (const bueno of [
      'OEBPS/Text/Section 0001.xhtml',
      'OPS/images/fig-1.jpeg',
      'META-INF/container.xml',
      'OEBPS/capítulo (2).xhtml',
      'mimetype',
    ]) {
      expect(nombreEntradaValido(bueno, 'documento', 8)).toBe(true);
      // El perfil estricto no los admite: solo vale lo que genera Vestigio.
      if (bueno.includes(' ') || bueno.includes('í') || bueno.includes('(')) {
        expect(nombreEntradaValido(bueno, 'estricto')).toBe(false);
      }
    }
  });

  it('la profundidad se acota segun quien lea', () => {
    const hondo = 'a/b/c/d/e/f.txt';
    expect(nombreEntradaValido(hondo, 'documento', 4)).toBe(false);
    expect(nombreEntradaValido(hondo, 'documento', 8)).toBe(true);
  });

  it('escribir rechaza cualquier nombre con truco', () => {
    for (const malo of escapes) {
      expect(() => escribirZip([{ nombre: malo, datos: Buffer.from('x') }])).toThrowError(ErrorZip);
    }
  });
});

describe('ficheros hostiles o rotos', () => {
  it('detecta un byte alterado', () => {
    const zip = escribirZip([
      { nombre: 'datos.txt', datos: Buffer.from('el conocimiento que permanece', 'utf8') },
    ]);
    const copia = Buffer.from(zip);
    const posicion = copia.indexOf(Buffer.from('permanece', 'utf8'));
    expect(posicion).toBeGreaterThan(0);
    copia[posicion] = (copia[posicion] ?? 0) ^ 0x01;
    expect(() => leerZip(copia)).toThrowError(/alterado|danado|corrupto/i);
  });

  it('un ZIP truncado no se acepta a medias', () => {
    const zip = escribirZip(entradas);
    expect(() => leerZip(zip.subarray(0, zip.length - 10))).toThrowError(ErrorZip);
  });

  it('lo que no es un ZIP se rechaza con motivo', () => {
    expect(() => leerZip(Buffer.from('esto no es un zip', 'utf8'))).toThrowError(
      /no-es-zip|corto/i,
    );
  });

  it('una bomba choca contra los topes absolutos antes de descomprimirse', () => {
    const bomba = escribirZip([{ nombre: 'bomba.txt', datos: Buffer.alloc(4 * 1024 * 1024, 0) }]);
    expect(() =>
      leerZip(bomba, { ...LIMITES_EPUB, maxBytesEntrada: 64 * 1024, maxBytesTotal: 64 * 1024 }),
    ).toThrowError(/demasiado grande/);
    expect(() => leerZip(bomba, { ...LIMITES_EPUB, maxRatio: 10 })).toThrowError(/expande/);
    expect(() => leerZip(bomba)).not.toThrow();
  });
});

describe('entradas de carpeta', () => {
  it('se ignoran en vez de tumbar el fichero entero', () => {
    // Los ZIP reales (y casi todos los EPUB) traen entradas de carpeta con
    // cero bytes y nombre acabado en '/'. Antes hacian fallar la lectura
    // entera por "nombre invalido".
    const zip = zipCrudo([
      { nombre: 'OEBPS/', datos: Buffer.alloc(0) },
      { nombre: 'OEBPS/contenido.xhtml', datos: Buffer.from('<p>hola</p>', 'utf8') },
    ]);
    const leidas = leerZip(zip, LIMITES_EPUB);
    expect(leidas.map((e) => e.nombre)).toEqual(['OEBPS/contenido.xhtml']);
    expect(leidas[0]?.datos.toString('utf8')).toBe('<p>hola</p>');
  });
});

/**
 * Escritor ZIP minimo y sin validaciones, solo para las pruebas: permite
 * construir ficheros que el escritor de verdad se niega a producir (como
 * una entrada de carpeta). Al ser una implementacion independiente, ademas
 * sirve de contraste para el lector.
 */
function zipCrudo(entradas: EntradaZip[]): Buffer {
  const piezas: Buffer[] = [];
  const centrales: Buffer[] = [];
  let desplazamiento = 0;

  for (const entrada of entradas) {
    const nombre = Buffer.from(entrada.nombre, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8); // store
    local.writeUInt32LE(crc32(entrada.datos), 14);
    local.writeUInt32LE(entrada.datos.length, 18);
    local.writeUInt32LE(entrada.datos.length, 22);
    local.writeUInt16LE(nombre.length, 26);
    piezas.push(local, nombre, entrada.datos);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc32(entrada.datos), 16);
    central.writeUInt32LE(entrada.datos.length, 20);
    central.writeUInt32LE(entrada.datos.length, 24);
    central.writeUInt16LE(nombre.length, 28);
    central.writeUInt32LE(desplazamiento, 42);
    centrales.push(central, nombre);

    desplazamiento += local.length + nombre.length + entrada.datos.length;
  }

  const directorio = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);

  return Buffer.concat([...piezas, directorio, fin]);
}
