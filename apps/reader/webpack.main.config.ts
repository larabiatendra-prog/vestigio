import type { Configuration } from 'webpack';
import { reglas } from './webpack.rules';

// Dos entradas: el proceso principal y el servicio de datos (utilityProcess).
// El servicio se emite como fichero propio para poder lanzarlo con
// utilityProcess.fork(path.join(__dirname, 'servicio_datos.js')).
export const mainConfig: Configuration = {
  devtool: 'source-map',
  entry: {
    index: './src/main/index.ts',
    servicio_datos: './src/servicio-datos/index.ts',
  },
  output: {
    filename: '[name].js',
  },
  module: {
    rules: reglas,
  },
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
    // Imports estilo NodeNext ('./modulo.js' apuntando a .ts) en workspaces.
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
  },
};
