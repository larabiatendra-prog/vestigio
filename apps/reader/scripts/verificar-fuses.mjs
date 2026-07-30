// Verifica que los fuses del binario EMPAQUETADO coinciden exactamente con
// el contrato de seguridad (forge.config.ts / ADR-0002). Se ejecuta tras
// `npm run package -w @vestigio/reader`.

import fuses from '@electron/fuses';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { getCurrentFuseWire, FuseV1Options } = fuses;

// Estados en el wire v1: '0' (0x30) = deshabilitado, '1' (0x31) = habilitado.
const DESHABILITADO = 0x30;
const HABILITADO = 0x31;

const aqui = dirname(fileURLToPath(import.meta.url));
const exe = process.argv[2] ?? join(aqui, '..', 'out', 'Vestigio-win32-x64', 'Vestigio.exe');

if (!existsSync(exe)) {
  console.error(`No existe el binario empaquetado: ${exe}`);
  console.error('Ejecuta antes: npm run package -w @vestigio/reader');
  process.exit(2);
}

const esperado = [
  [FuseV1Options.RunAsNode, DESHABILITADO],
  [FuseV1Options.EnableCookieEncryption, HABILITADO],
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable, DESHABILITADO],
  [FuseV1Options.EnableNodeCliInspectArguments, DESHABILITADO],
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, HABILITADO],
  [FuseV1Options.OnlyLoadAppFromAsar, HABILITADO],
  [FuseV1Options.GrantFileProtocolExtraPrivileges, DESHABILITADO],
];

const config = await getCurrentFuseWire(exe);
let fallos = 0;
for (const [opcion, estadoEsperado] of esperado) {
  const real = config[opcion];
  const nombre = FuseV1Options[opcion];
  if (real !== estadoEsperado) {
    console.error(
      `FUSE INCORRECTO: ${nombre} = ${String(real)} (esperado ${String(estadoEsperado)})`,
    );
    fallos++;
  } else {
    console.log(`ok ${nombre}`);
  }
}

if (fallos > 0) {
  console.error(`${String(fallos)} fuses fuera de contrato.`);
  process.exit(1);
}
console.log('Todos los fuses coinciden con el contrato.');
