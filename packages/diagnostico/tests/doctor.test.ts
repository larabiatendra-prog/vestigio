import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import {
  diagnosticar,
  informeEnTexto,
  type Comprobacion,
  type InformeDoctor,
} from '../src/doctor.js';
import { generarManifiesto, escribirManifiesto } from '../src/manifiesto.js';

// La matriz de fallos del bloque 16, simulada de verdad sobre entregas de
// mentira: no basta con que el Doctor no reviente, tiene que ACERTAR.

const APPLICATION_ID_CONTENIDO = 0x56455354;
const APPLICATION_ID_PERSONAL = 0x56555352;

let root: string;

/** Entrega minima pero completa y sana. */
function construirEntrega(): void {
  for (const carpeta of [
    'CONTENT/index',
    'CONTENT/originals',
    'CONTENT/manifest',
    'USER_DATA',
    'BACKUPS',
    'FALLBACK',
  ]) {
    mkdirSync(join(root, ...carpeta.split('/')), { recursive: true });
  }
  writeFileSync(join(root, 'VESTIGIO.portable'), 'entrega de prueba\n');
  writeFileSync(join(root, 'FALLBACK', 'index.html'), '<h1>Catalogo</h1>');
  writeFileSync(join(root, 'CONTENT', 'originals', 'doc.txt'), 'un documento cualquiera');

  const catalogo = new DatabaseSync(join(root, 'CONTENT', 'index', 'vestigio-content.sqlite'));
  catalogo.exec(`PRAGMA application_id=${String(APPLICATION_ID_CONTENIDO)}`);
  catalogo.exec('CREATE TABLE recursos (pk INTEGER PRIMARY KEY, titulo TEXT)');
  catalogo.exec("INSERT INTO recursos (titulo) VALUES ('algo')");
  catalogo.close();

  const personal = new DatabaseSync(join(root, 'USER_DATA', 'vestigio-user.sqlite'));
  personal.exec(`PRAGMA application_id=${String(APPLICATION_ID_PERSONAL)}`);
  personal.exec('CREATE TABLE estado_sesion (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)');
  personal.exec("INSERT INTO estado_sesion VALUES ('cierre_limpio','si')");
  personal.close();

  escribirManifiesto(root, generarManifiesto(root));
}

function comprobacion(informe: InformeDoctor, id: string): Comprobacion {
  const encontrada = informe.comprobaciones.find((c) => c.id === id);
  if (encontrada === undefined) throw new Error(`falta la comprobacion ${id}`);
  return encontrada;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vestigio-doctor-'));
  construirEntrega();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('una entrega sana', () => {
  it('sale operativa y sin problemas', () => {
    const informe = diagnosticar({ root, nivel: 'completo' });
    expect(informe.resumen.problemas).toBe(0);
    expect(informe.veredicto).toBe('operativo');
    expect(informe.titular).toContain('en orden');
  });

  it('el informe en texto se entiende sin ser tecnico', () => {
    const texto = informeEnTexto(diagnosticar({ root, nivel: 'completo' }));
    expect(texto).toContain('DOCTOR DE VESTIGIO');
    expect(texto).toContain('Marcador de la entrega');
    expect(texto).not.toMatch(/undefined|\[object/);
  });
});

describe('un muestreo jamas se presenta como completo', () => {
  it('el nivel rapido declara cuantos ficheros ha mirado', () => {
    // La entrega tiene mas de un fichero, asi que mirar 1 es de verdad una
    // muestra parcial.
    const informe = diagnosticar({ root, nivel: 'rapido', muestraRapida: 1 });
    const huellas = comprobacion(informe, 'manifiesto');
    expect(huellas.muestreo).toBeDefined();
    expect(huellas.muestreo?.revisados).toBe(1);
    expect(huellas.titulo).toContain('muestra');
    expect(huellas.detalle).toContain('NO garantiza');
  });

  it('si la muestra alcanza a todo, no se llama muestra ni se avisa de un resto que no existe', () => {
    const informe = diagnosticar({ root, nivel: 'rapido', muestraRapida: 1000 });
    const huellas = comprobacion(informe, 'manifiesto');
    expect(huellas.muestreo).toBeUndefined();
    expect(huellas.detalle).not.toContain('NO garantiza');
    expect(huellas.titulo).not.toContain('muestra');
  });

  it('el nivel completo no lleva muestreo y lo dice sin matices', () => {
    const huellas = comprobacion(diagnosticar({ root, nivel: 'completo' }), 'manifiesto');
    expect(huellas.muestreo).toBeUndefined();
    expect(huellas.detalle).toContain('ni un byte');
  });
});

describe('matriz de fallos', () => {
  it('detecta un documento alterado y pide otra copia', () => {
    writeFileSync(join(root, 'CONTENT', 'originals', 'doc.txt'), 'contenido cambiado a mano');
    const informe = diagnosticar({ root, nivel: 'completo' });
    const huellas = comprobacion(informe, 'manifiesto');
    expect(huellas.estado).toBe('mal');
    expect(huellas.detalle).toContain('alterados');
    expect(informe.veredicto).toBe('necesita-otra-copia');
  });

  it('detecta un documento que ha desaparecido', () => {
    rmSync(join(root, 'CONTENT', 'originals', 'doc.txt'));
    const huellas = comprobacion(diagnosticar({ root, nivel: 'completo' }), 'manifiesto');
    expect(huellas.estado).toBe('mal');
    expect(huellas.detalle).toContain('ausentes');
  });

  it('detecta un intruso que nadie declaro', () => {
    writeFileSync(join(root, 'CONTENT', 'originals', 'colado.txt'), 'esto no estaba');
    const huellas = comprobacion(diagnosticar({ root, nivel: 'completo' }), 'manifiesto');
    expect(huellas.estado).toBe('mal');
    expect(huellas.detalle).toContain('nadie declaró');
  });

  it('detecta que falta el catalogo entero', () => {
    rmSync(join(root, 'CONTENT', 'index'), { recursive: true, force: true });
    const informe = diagnosticar({ root, nivel: 'rapido' });
    expect(comprobacion(informe, 'catalogo-existe').estado).toBe('mal');
    expect(informe.veredicto).toBe('necesita-otra-copia');
  });

  it('detecta que el catalogo ha sido sustituido por otro fichero', () => {
    const ajena = new DatabaseSync(join(root, 'CONTENT', 'index', 'vestigio-content.sqlite'));
    ajena.exec('PRAGMA application_id=999');
    ajena.close();
    expect(comprobacion(diagnosticar({ root }), 'catalogo-identidad').estado).toBe('mal');
  });

  it('detecta un catalogo fisicamente corrupto', () => {
    const ruta = join(root, 'CONTENT', 'index', 'vestigio-content.sqlite');
    const bytes = readFileSync(ruta);
    bytes.fill(0xff, 0, Math.min(200, bytes.length));
    writeFileSync(ruta, bytes);
    const informe = diagnosticar({ root, nivel: 'rapido' });
    // Puede fallar al abrir o al comprobar; ambas cosas son deteccion.
    const malas = informe.comprobaciones.filter(
      (c) => c.estado === 'mal' && c.id.startsWith('catalogo'),
    );
    expect(malas.length).toBeGreaterThan(0);
    expect(informe.veredicto).toBe('necesita-otra-copia');
  });

  it('detecta el cierre sucio de la sesion anterior sin alarmar de mas', () => {
    const personal = new DatabaseSync(join(root, 'USER_DATA', 'vestigio-user.sqlite'));
    personal.exec("UPDATE estado_sesion SET valor='no' WHERE clave='cierre_limpio'");
    personal.close();
    const informe = diagnosticar({ root, nivel: 'rapido' });
    const cierre = comprobacion(informe, 'cierre-limpio');
    expect(cierre.estado).toBe('aviso');
    expect(cierre.remedio).toContain('No suele tener consecuencias');
    // Un cierre sucio no convierte la entrega en irrecuperable.
    expect(informe.veredicto).not.toBe('necesita-otra-copia');
  });

  it('detecta una coleccion truncada', () => {
    mkdirSync(join(root, 'CONTENT', 'zim'), { recursive: true });
    writeFileSync(join(root, 'CONTENT', 'zim', 'rota.zim'), Buffer.from('no soy un zim'));
    escribirManifiesto(root, generarManifiesto(root));
    const zim = comprobacion(diagnosticar({ root, nivel: 'rapido' }), 'zim');
    expect(zim.estado).toBe('mal');
    expect(zim.detalle).toContain('truncadas');
  });

  it('avisa de que no hay salida de emergencia', () => {
    rmSync(join(root, 'FALLBACK'), { recursive: true, force: true });
    const informe = diagnosticar({ root, nivel: 'rapido' });
    expect(comprobacion(informe, 'fallback').estado).toBe('aviso');
    // Un fallback ausente molesta, pero no impide leer.
    expect(informe.veredicto).toBe('operativo-con-avisos');
  });

  it('una carpeta que no es una entrega se dice claramente', () => {
    const ajena = mkdtempSync(join(tmpdir(), 'vestigio-ajena-'));
    const informe = diagnosticar({ root: ajena, nivel: 'rapido' });
    expect(comprobacion(informe, 'marcador').estado).toBe('mal');
    expect(comprobacion(informe, 'carpeta-CONTENT').estado).toBe('mal');
    rmSync(ajena, { recursive: true, force: true });
  });

  it('nunca lanza, por rota que este la entrega', () => {
    rmSync(join(root, 'CONTENT'), { recursive: true, force: true });
    rmSync(join(root, 'USER_DATA'), { recursive: true, force: true });
    expect(() => diagnosticar({ root, nivel: 'completo' })).not.toThrow();
  });
});

describe('niveles', () => {
  it('el de arranque es el mas corto y no toca las huellas', () => {
    const arranque = diagnosticar({ root, nivel: 'arranque' });
    const completo = diagnosticar({ root, nivel: 'completo' });
    expect(arranque.comprobaciones.length).toBeLessThan(completo.comprobaciones.length);
    expect(comprobacion(arranque, 'manifiesto').estado).toBe('no-aplica');
  });

  it('el completo revisa la base entera pagina a pagina', () => {
    const completo = diagnosticar({ root, nivel: 'completo' });
    expect(comprobacion(completo, 'catalogo-integridad').estado).toBe('bien');
    expect(comprobacion(completo, 'catalogo-relaciones').estado).toBe('bien');
  });
});
