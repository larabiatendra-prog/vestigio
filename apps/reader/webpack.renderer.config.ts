import type { Configuration } from 'webpack';
import CopyPlugin from 'copy-webpack-plugin';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { reglas } from './webpack.rules';

const requerir = createRequire(import.meta.url);

/**
 * El worker de PDF.js se copia AL LADO de la ventana y se referencia con una
 * ruta relativa fija. Dejar que webpack lo emita como asset produce una URL
 * que resuelve mal bajo file:// en el paquete final (fallo que solo aparece
 * al abrir un PDF empaquetado). Copiarlo hace la ubicacion determinista y,
 * sobre todo, verificable: el fichero esta o no esta.
 */
const rutaPdfWorker = join(
  dirname(requerir.resolve('pdfjs-dist/package.json')),
  'build',
  'pdf.worker.min.mjs',
);

export const rendererConfig: Configuration = {
  // Source maps sin eval: la CSP estricta (sin 'unsafe-eval') aplica
  // tambien en desarrollo; relajarla ocultaria fallos reales de produccion.
  devtool: 'source-map',
  module: {
    rules: [
      ...reglas,
      {
        test: /\.css$/,
        use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [{ from: rutaPdfWorker, to: 'ventana_principal/pdf.worker.min.mjs' }],
    }),
  ],
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
  },
};
