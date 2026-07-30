import type { Configuration } from 'webpack';
import { reglas } from './webpack.rules';

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
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
  },
};
