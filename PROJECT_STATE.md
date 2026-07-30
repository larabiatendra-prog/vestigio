# PROJECT_STATE — Vestigio

**Última actualización:** 2026-07-30
**Fase:** Bloques 00–01 completados; Bloque 02 con núcleo completado (deudas registradas); siguiente: Bloque 03 (dos SQLite)
**Versiones:** app `0.1.0` · corpus `—` · información vigente `—`

## Estado actual

- Plan maestro 2.0 adoptado como `PLAN_MAESTRO.md`, con cuatro enmiendas del propietario en `ENMIENDAS.md` que prevalecen donde contradigan al plan.
- Repositorio público en `https://github.com/larabiatendra-prog/vestigio`; CI en verde sobre Windows.
- Especificación ejecutable completa en `docs/`: producto, arquitectura, política de contenido, pruebas, recuperación, preservación, UX, modelo de amenazas (T01–T12) y matriz de requisitos (REQ-*).
- Seis ADR aceptadas (`docs/adr/`): stack, procesos/aislamiento, datos/búsqueda, portabilidad/versiones, integridad/recuperación, alcance.
- Matriz de capacidades congelada en `content/coverage/capabilities-1.0.yml` (guía, no puerta — E1).
- Contratos de datos preliminares en `packages/contracts/`: tipos TypeScript + JSON Schemas con tests ajv de ejemplos válidos/inválidos.
- **La aplicación existe** (`apps/reader/`, Electron 43 + React 19 + Forge/Webpack): main mínimo, preload tipado, renderer con la línea El Páramo, servicio de datos en `utilityProcess` con supervisor lease/epoch y mutaciones idempotentes, `PortablePathService` (marcador de entrega, modo solo lectura a %TEMP%), `NetworkPolicyService` (allowlist exacta), CSP estricta sin `unsafe-eval` ni en desarrollo, protocolo `vestigio://` (deniega todo aún), logging rotativo, single-instance por root. Empaquetado Windows x64 real con 7/7 fuses verificados en el binario (`scripts/verificar-fuses.mjs`).
- Verificado en real: arranque empaquetado desde carpeta externa con espacios y eñe (crea USER_DATA/BACKUPS/LOGS/RUNTIME correctos), arranque dev completo con renderer conectado, 37 pruebas unitarias.

## Hecho

| Fecha      | Qué                                                                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-30 | Bloque 00: estructura, documentos, tooling, tests de guardia, CI. Repo remoto creado, push y CI verde.                                               |
| 2026-07-30 | Bloque 01: especificación ejecutable, 6 ADR, amenazas, requisitos, capacidades y contratos preliminares.                                             |
| 2026-07-30 | Bloque 02 (núcleo): shell Electron portable y seguro, supervisor lease/epoch, empaquetado con fuses verificados, primera ventana real con El Páramo. |

## Bloqueos

- **Firma del binario (decisión de Daniel):** grabar los fuses invalida la firma Authenticode de Electron y el Control de aplicaciones inteligente de Windows bloquea el `Vestigio.exe` empaquetado en NODO (detalle y opciones en `docs/TOOLCHAIN.md`). No impide desarrollar (el modo dev usa el electron.exe firmado), pero sí revalidar la UI empaquetada en esta máquina.

## Deudas del Bloque 02 (pendientes, con destino)

- Pruebas end-to-end de la matriz de fallos sobre el paquete real (crash/reinicio del servicio en vivo, mutación con respuesta perdida, rechazo de segundo escritor, modo solo lectura real): se harán con datos reales del bloque 03, donde dejan de ser simulacros vacíos.
- Captura de red a nivel de sistema operativo como aceptación (bloque 19; el bloqueo por `webRequest` + tests unitarios ya cubre la app).
- Revalidación de la UI del paquete final cuando se resuelva la firma.

## Deudas (aplazamientos deliberados por E2, con bloque de destino)

- Patrón canónico de emergencia e impresión (`EMERGENCY_CONTENT_PATTERN.md`, `PRINT_SPEC.md`) → bloque 14, con los datos canónicos reales.
- Banco de consultas de búsqueda y tareas UX aprobadas por Daniel → bloque 09 (búsqueda) y rondas R1–R5 de `UX_TEST_PLAN.md`.
- Especificación detallada de la ceremonia de firma → bloques 16/20.
- Wireflows detallados → se diseñan con la primera interfaz real (bloque 10), sobre la línea El Páramo.
- Comprobación básica de nombre y marcas ("Vestigio") antes de 1.0.

## Siguiente paso previsto

Bloque 03: las dos SQLite reales (contenido RO + personal RW) sobre el servicio de datos ya supervisado, con migraciones, PRAGMAs afirmados y las pruebas de crash que saldan parte de la deuda del 02. Camino al hito "biblioteca usable" (E2): 03 → 04–06 (ingesta + HTML/PDF) → 09–11 (búsqueda y lectura).
