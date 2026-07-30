import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const requerir = createRequire(import.meta.url);

// El lector de PDF depende de que el worker exista en la ruta que copia
// webpack.renderer.config. Si una actualizacion de pdfjs-dist mueve o
// renombra el fichero, esto falla aqui y no al abrir un PDF en el paquete.

describe('worker de PDF.js', () => {
  it('el fichero del worker existe donde lo busca la configuracion de copia', () => {
    const ruta = join(
      dirname(requerir.resolve('pdfjs-dist/package.json')),
      'build',
      'pdf.worker.min.mjs',
    );
    expect(existsSync(ruta), `no existe el worker en ${ruta}`).toBe(true);
  });

  it('la version de pdfjs-dist esta fijada y coincide con la del extractor', () => {
    const paquete = requerir('pdfjs-dist/package.json') as { version: string };
    // La misma version extrae en construccion y renderiza en pantalla.
    expect(paquete.version).toBe('6.2.108');
  });
});
