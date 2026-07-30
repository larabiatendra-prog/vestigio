# PROJECT_STATE — Vestigio

**Última actualización:** 2026-07-30
**Fase:** Bloques 00 y 01 completados; siguiente: Bloque 02 (shell Electron)
**Versiones:** app `0.0.0` · corpus `—` · información vigente `—`

## Estado actual

- Plan maestro 2.0 adoptado como `PLAN_MAESTRO.md`, con cuatro enmiendas del propietario en `ENMIENDAS.md` que prevalecen donde contradigan al plan.
- Repositorio público en `https://github.com/larabiatendra-prog/vestigio`; CI en verde sobre Windows.
- Especificación ejecutable completa en `docs/`: producto, arquitectura, política de contenido, pruebas, recuperación, preservación, UX, modelo de amenazas (T01–T12) y matriz de requisitos (REQ-*).
- Seis ADR aceptadas (`docs/adr/`): stack, procesos/aislamiento, datos/búsqueda, portabilidad/versiones, integridad/recuperación, alcance.
- Matriz de capacidades congelada en `content/coverage/capabilities-1.0.yml` (guía, no puerta — E1).
- Contratos de datos preliminares en `packages/contracts/`: tipos TypeScript + JSON Schemas con tests ajv de ejemplos válidos/inválidos.
- Sin código de aplicación todavía.

## Hecho

| Fecha      | Qué                                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| 2026-07-30 | Bloque 00: estructura, documentos, tooling, tests de guardia, CI. Repo remoto creado, push y CI verde.   |
| 2026-07-30 | Bloque 01: especificación ejecutable, 6 ADR, amenazas, requisitos, capacidades y contratos preliminares. |

## Bloqueos

- Ninguno.

## Deudas (aplazamientos deliberados por E2, con bloque de destino)

- Patrón canónico de emergencia e impresión (`EMERGENCY_CONTENT_PATTERN.md`, `PRINT_SPEC.md`) → bloque 14, con los datos canónicos reales.
- Banco de consultas de búsqueda y tareas UX aprobadas por Daniel → bloque 09 (búsqueda) y rondas R1–R5 de `UX_TEST_PLAN.md`.
- Especificación detallada de la ceremonia de firma → bloques 16/20.
- Wireflows detallados → se diseñan con la primera interfaz real (bloque 10), sobre la línea El Páramo.
- Comprobación básica de nombre y marcas ("Vestigio") antes de 1.0.

## Siguiente paso previsto

Bloque 02: shell Electron portable y seguro (Forge + Webpack, procesos, fuses), primer arranque de ventana con la base de la línea El Páramo. Camino directo al hito "biblioteca usable cuanto antes" (E2): 02 → 03 (dos SQLite) → 04–06 (ingesta + HTML/PDF) → 09–11 (búsqueda y lectura).
