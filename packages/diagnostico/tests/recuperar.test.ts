import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { recuperarContenido } from '../src/recuperar.js';
import { generarManifiesto, escribirManifiesto } from '../src/manifiesto.js';

// Recuperar es la operacion mas peligrosa que hace Vestigio: escribe encima
// de la biblioteca. Estas pruebas comprueban sobre todo lo que NO hace.

const APPLICATION_ID_CONTENIDO = 0x56455354;

let base: string;
let sana: string;
let rota: string;

function construir(root: string, textoDoc: string): void {
  for (const carpeta of ['CONTENT/index', 'CONTENT/originals', 'CONTENT/manifest', 'USER_DATA']) {
    mkdirSync(join(root, ...carpeta.split('/')), { recursive: true });
  }
  writeFileSync(join(root, 'VESTIGIO.portable'), 'entrega\n');
  writeFileSync(join(root, 'CONTENT', 'originals', 'doc.txt'), textoDoc);
  const db = new DatabaseSync(join(root, 'CONTENT', 'index', 'vestigio-content.sqlite'));
  db.exec(`PRAGMA application_id=${String(APPLICATION_ID_CONTENIDO)}`);
  db.exec('CREATE TABLE recursos (pk INTEGER PRIMARY KEY)');
  db.close();
  escribirManifiesto(root, generarManifiesto(root));
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'vestigio-recup-'));
  sana = join(base, 'copia-sana');
  rota = join(base, 'copia-rota');
  mkdirSync(sana);
  mkdirSync(rota);
  construir(sana, 'el documento bueno');
  construir(rota, 'el documento bueno');
  // Se estropea el destino DESPUES de generar su manifiesto.
  writeFileSync(join(rota, 'CONTENT', 'originals', 'doc.txt'), 'contenido corrompido');
  // Y algo personal que no debe tocarse jamas.
  writeFileSync(join(rota, 'USER_DATA', 'mis-notas.sqlite'), 'datos de Daniel');
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe('sin confirmar no se toca nada', () => {
  it('explica lo que haria y deja el destino intacto', () => {
    const resultado = recuperarContenido({ destino: rota, origen: sana });
    expect(resultado.ejecutado).toBe(false);
    expect(resultado.puedeSeguir).toBe(true);
    expect(resultado.pasos.join(' ')).toContain('USER_DATA no se toca');
    expect(resultado.mensaje).toContain('Nada se ha tocado');
    expect(readFileSync(join(rota, 'CONTENT', 'originals', 'doc.txt'), 'utf8')).toBe(
      'contenido corrompido',
    );
  });
});

describe('recuperacion confirmada', () => {
  it('sustituye el contenido y conserva el anterior a un lado', () => {
    const resultado = recuperarContenido({ destino: rota, origen: sana, confirmado: true });
    expect(resultado.ejecutado).toBe(true);
    expect(readFileSync(join(rota, 'CONTENT', 'originals', 'doc.txt'), 'utf8')).toBe(
      'el documento bueno',
    );
    // Lo viejo no se borra: se aparta.
    expect(existsSync(resultado.respaldoDeLoViejo)).toBe(true);
    expect(readFileSync(join(resultado.respaldoDeLoViejo, 'originals', 'doc.txt'), 'utf8')).toBe(
      'contenido corrompido',
    );
  });

  it('no roza USER_DATA', () => {
    recuperarContenido({ destino: rota, origen: sana, confirmado: true });
    expect(readFileSync(join(rota, 'USER_DATA', 'mis-notas.sqlite'), 'utf8')).toBe(
      'datos de Daniel',
    );
  });

  it('no deja restos en el area de staging', () => {
    recuperarContenido({ destino: rota, origen: sana, confirmado: true });
    expect(existsSync(join(rota, 'RUNTIME', 'recuperacion'))).toBe(false);
  });
});

describe('lo que se niega a hacer', () => {
  it('no restaura desde una copia que tampoco esta sana', () => {
    // Se estropea el ORIGEN.
    writeFileSync(join(sana, 'CONTENT', 'originals', 'doc.txt'), 'tambien roto');
    const resultado = recuperarContenido({ destino: rota, origen: sana, confirmado: true });
    expect(resultado.ejecutado).toBe(false);
    expect(resultado.impedimentos.join(' ')).toContain('tampoco está sana');
    // Y el destino sigue como estaba, con su problema, pero sin uno nuevo.
    expect(readFileSync(join(rota, 'CONTENT', 'originals', 'doc.txt'), 'utf8')).toBe(
      'contenido corrompido',
    );
  });

  it('no escribe en una carpeta que no sea una entrega', () => {
    const cualquiera = join(base, 'carpeta-cualquiera');
    mkdirSync(cualquiera);
    const resultado = recuperarContenido({
      destino: cualquiera,
      origen: sana,
      confirmado: true,
    });
    expect(resultado.ejecutado).toBe(false);
    expect(resultado.impedimentos.join(' ')).toContain('VESTIGIO.portable');
    expect(readdirSync(cualquiera)).toEqual([]);
  });

  it('no restaura desde una copia sin CONTENT', () => {
    const vacia = join(base, 'vacia');
    mkdirSync(vacia);
    const resultado = recuperarContenido({ destino: rota, origen: vacia, confirmado: true });
    expect(resultado.ejecutado).toBe(false);
    expect(resultado.impedimentos.join(' ')).toContain('no tiene CONTENT');
  });

  it('no se restaura sobre si misma', () => {
    const resultado = recuperarContenido({ destino: sana, origen: sana, confirmado: true });
    expect(resultado.ejecutado).toBe(false);
    expect(resultado.impedimentos.join(' ')).toContain('misma carpeta');
  });
});
