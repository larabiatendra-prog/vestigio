import type { ForgeConfig } from '@electron-forge/shared-types';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';

// Los fuses son parte del contrato de seguridad (ADR-0002, plan §6.3).
// scripts/verificar-fuses.mjs comprueba tras empaquetar que el binario
// real coincide exactamente con esta configuracion.
const config: ForgeConfig = {
  packagerConfig: {
    name: 'Vestigio',
    executableName: 'Vestigio',
    asar: true,
  },
  rebuildConfig: {},
  makers: [],
  plugins: [
    new WebpackPlugin({
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: './src/renderer/index.html',
            js: './src/renderer/index.tsx',
            name: 'ventana_principal',
            preload: {
              js: './src/preload/index.ts',
            },
          },
        ],
      },
      // CSP de desarrollo; en produccion la fija ventana-principal.ts.
      devContentSecurityPolicy:
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws:",
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    }),
  ],
};

export default config;
