import { describe, expect, it } from 'vitest';
import { decidirPeticion, type PoliticaRed } from '../src/main/politica-red';

const produccion: PoliticaRed = { origenKiwix: null, desarrollo: false };
const conKiwix: PoliticaRed = { origenKiwix: 'http://127.0.0.1:41234', desarrollo: false };
const desarrollo: PoliticaRed = { origenKiwix: null, desarrollo: true };

describe('NetworkPolicyService', () => {
  it('bloquea todo origen externo en produccion', () => {
    for (const url of [
      'https://example.com/a.js',
      'http://update.electronjs.org/ping',
      'https://fonts.googleapis.com/css',
      'http://192.168.1.10/lan',
      'ws://example.com/socket',
    ]) {
      expect(decidirPeticion(produccion, url).permitida).toBe(false);
    }
  });

  it('permite el protocolo interno', () => {
    expect(decidirPeticion(produccion, 'vestigio://contenido/recurso/abc').permitida).toBe(true);
  });

  it('permite el bundle propio por file:// (shell en ASAR)', () => {
    expect(
      decidirPeticion(produccion, 'file:///C:/VESTIGIO/APP/resources/app.asar/.webpack/x.js')
        .permitida,
    ).toBe(true);
  });

  it('solo permite el origen Kiwix exacto, no todo loopback', () => {
    expect(decidirPeticion(conKiwix, 'http://127.0.0.1:41234/search?q=agua').permitida).toBe(true);
    expect(decidirPeticion(conKiwix, 'http://127.0.0.1:8080/otro-servicio').permitida).toBe(false);
    expect(decidirPeticion(conKiwix, 'http://localhost:41234/search').permitida).toBe(false);
    expect(decidirPeticion(produccion, 'http://127.0.0.1:41234/search').permitida).toBe(false);
  });

  it('en desarrollo admite el dev server local; en produccion no', () => {
    expect(decidirPeticion(desarrollo, 'http://localhost:3000/main.js').permitida).toBe(true);
    expect(decidirPeticion(desarrollo, 'ws://localhost:3000/ws').permitida).toBe(true);
    expect(decidirPeticion(produccion, 'http://localhost:3000/main.js').permitida).toBe(false);
    // Ni en desarrollo se abre nada externo.
    expect(decidirPeticion(desarrollo, 'https://example.com').permitida).toBe(false);
  });

  it('una URL no analizable se bloquea', () => {
    expect(decidirPeticion(produccion, 'esto no es una url').permitida).toBe(false);
  });
});
