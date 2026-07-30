import { describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buscarRoot, resolverRutas, MARCADOR_ENTREGA } from '../src/main/rutas-portables';

const sep = join('a', 'b').includes('\\') ? '\\' : '/';

describe('rutas portables', () => {
  it('encuentra el root subiendo desde APP hasta el marcador', () => {
    const root = join('D:', 'USB con espacios', 'VESTIGIO');
    const existe = (ruta: string): boolean => ruta === join(root, MARCADOR_ENTREGA);
    expect(buscarRoot(join(root, 'APP'), existe)).toBe(root);
  });

  it('devuelve null sin marcador (y el que resuelve usa entonces el directorio del exe)', () => {
    expect(buscarRoot(join('C:', 'cualquiera'), () => false)).toBeNull();
  });

  it('soporta rutas con espacios, tildes y eñes', () => {
    const root = join('E:', 'mochila de montaña', 'BIBLIOTECA ÑU');
    const existe = (ruta: string): boolean => ruta === join(root, MARCADOR_ENTREGA);
    const rutas = resolverRutas({
      execPath: join(root, 'APP', 'Vestigio.exe'),
      version: '0.1.0',
      pid: 123,
      existe,
      comprobarEscritura: () => true,
    });
    expect(rutas.root).toBe(root);
    expect(rutas.userData).toBe(join(root, 'USER_DATA'));
    expect(rutas.userData.split(sep)).toContain('BIBLIOTECA ÑU');
  });

  it('el cambio de letra de unidad no afecta: todo se deriva del execPath actual', () => {
    const enD = resolverRutas({
      execPath: join('D:', 'VESTIGIO', 'APP', 'Vestigio.exe'),
      version: '0.1.0',
      pid: 1,
      existe: (r) => r === join('D:', 'VESTIGIO', MARCADOR_ENTREGA),
      comprobarEscritura: () => true,
    });
    const enF = resolverRutas({
      execPath: join('F:', 'VESTIGIO', 'APP', 'Vestigio.exe'),
      version: '0.1.0',
      pid: 1,
      existe: (r) => r === join('F:', 'VESTIGIO', MARCADOR_ENTREGA),
      comprobarEscritura: () => true,
    });
    expect(enD.userData).toBe(join('D:', 'VESTIGIO', 'USER_DATA'));
    expect(enF.userData).toBe(join('F:', 'VESTIGIO', 'USER_DATA'));
  });

  it('en solo lectura lo mutable va al temporal con release y pid; el contenido sigue en el root', () => {
    const root = join('G:', 'VESTIGIO');
    const rutas = resolverRutas({
      execPath: join(root, 'APP', 'Vestigio.exe'),
      version: '0.1.0',
      pid: 4242,
      existe: (r) => r === join(root, MARCADOR_ENTREGA),
      comprobarEscritura: () => false,
    });
    expect(rutas.modo).toBe('solo-lectura');
    const temporal = join(tmpdir(), 'Vestigio', '0.1.0-4242');
    expect(rutas.userData).toBe(join(temporal, 'USER_DATA'));
    expect(rutas.logs).toBe(join(temporal, 'LOGS'));
    expect(rutas.content).toBe(join(root, 'CONTENT'));
    expect(rutas.fallback).toBe(join(root, 'FALLBACK'));
  });
});
