# TOOLCHAIN — Versiones fijadas del Bloque 02

Versiones exactas resueltas el 2026-07-30; el `package-lock.json` es la fuente autoritativa (incluye hashes de integridad de cada paquete). Origen de todo: registro público de npm.

| Pieza                                       | Versión          | Papel                  | Soporte                                                                          |
| ------------------------------------------- | ---------------- | ---------------------- | -------------------------------------------------------------------------------- |
| Electron                                    | 43.2.0           | runtime de la app      | estable actual; ~8 semanas por major, se revisará EOL antes de RC                |
| Electron Forge (+ plugins webpack y fuses)  | 7.11.2           | empaquetado            | estable                                                                          |
| @electron/fuses                             | 1.8.x            | grabar/verificar fuses | compatible con plugin-fuses 7.x (peer ^1)                                        |
| React / react-dom                           | 19.2.8           | renderer               | estable                                                                          |
| TypeScript                                  | 6.0.x            | tipos estrictos        | estable (TS 7 nativo existe; se migrará con ADR cuando el ecosistema lo soporte) |
| webpack + ts-loader/css-loader/style-loader | vía plugin Forge | bundling               | estable                                                                          |
| Vitest                                      | 4.1.x            | pruebas                | estable                                                                          |
| Node (desarrollo/CI)                        | 24.x             | tooling                | LTS                                                                              |

## Hallazgo del Bloque 02: firma rota tras grabar fuses

Grabar los fuses modifica `Vestigio.exe`, lo que **invalida la firma Authenticode** con la que se distribuye Electron. Consecuencia real observada en NODO: el Control de aplicaciones inteligente de Windows 11 bloquea el ejecutable empaquetado (el primero llegó a ejecutarse; a partir de ahí, bloqueo por hash nuevo sin firma).

Implicación: **firmar el binario tras grabar los fuses deja de ser un extra P2 y pasa a ser necesario para máquinas con Smart App Control activo.** Opciones (decisión del propietario, registrada como deuda del bloque 16/20):

1. Certificado propio autofirmado instalado localmente (suficiente para uso personal; no vale para distribuir).
2. Authenticode comercial (el plan lo tenía como P2 para distribución pública).
3. Ejecutar solo en máquinas sin SAC o con la app permitida explícitamente por el propietario.

`scripts/verificar-fuses.mjs` verifica el contrato de fuses del binario sin ejecutarlo, así que la verificación de seguridad no depende de que Windows permita el arranque.
