import { describe, expect, it } from 'vitest';
import { esPeticion, esRespuesta } from '../src/comun/mensajes';

describe('contrato de mensajes main <-> servicio de datos', () => {
  it('acepta peticiones bien formadas', () => {
    expect(esPeticion({ id: 'a1', epoch: 1, tipo: 'ping' })).toBe(true);
    expect(esPeticion({ id: 'a2', epoch: 3, tipo: 'mutar', idMutacion: 'm-1' })).toBe(true);
    expect(esPeticion({ id: 'a3', epoch: 3, tipo: 'estado-mutacion', idMutacion: 'm-1' })).toBe(
      true,
    );
  });

  it('rechaza mutaciones sin idMutacion: sin ID no hay idempotencia', () => {
    expect(esPeticion({ id: 'a', epoch: 1, tipo: 'mutar' })).toBe(false);
    expect(esPeticion({ id: 'a', epoch: 1, tipo: 'estado-mutacion' })).toBe(false);
  });

  it('rechaza tipos desconocidos, ids vacios y epochs no enteros', () => {
    expect(esPeticion({ id: 'a', epoch: 1, tipo: 'ejecutar-sql' })).toBe(false);
    expect(esPeticion({ id: '', epoch: 1, tipo: 'ping' })).toBe(false);
    expect(esPeticion({ id: 'a', epoch: 1.5, tipo: 'ping' })).toBe(false);
    expect(esPeticion(null)).toBe(false);
    expect(esPeticion('ping')).toBe(false);
  });

  it('distingue respuestas ok y error', () => {
    expect(esRespuesta({ id: 'a', epoch: 1, ok: true, resultado: 'pong' })).toBe(true);
    expect(esRespuesta({ id: 'a', epoch: 1, ok: false, codigo: 'x', mensaje: 'y' })).toBe(true);
    expect(esRespuesta({ id: 'a', epoch: 1, ok: false })).toBe(false);
    expect(esRespuesta({ id: 'a', epoch: 1 })).toBe(false);
  });
});
