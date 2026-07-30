# PROJECT_STATE — Vestigio

**Última actualización:** 2026-07-30
**Fase:** Bloques 00–04 ejecutados (02–04 con deudas registradas); siguiente: Bloques 05–06 (lectores) y 09–10 (búsqueda y biblioteca en la interfaz)
**Versiones:** app `0.1.0` · corpus `2026-C0-semilla (desarrollo)` · información vigente `—`

- **La CLI de ingesta existe** (`tools/admin-cli`, `vestigio-admin`): `ingerir <carpeta> --salida <edición>` analiza en bloque, deduplica por hash exacto, detecta formato por firma binaria, extrae título/idioma/texto con honestidad (lo desconocido queda ausente), copia originales content-addressed, construye el catálogo SQLite con FTS y snippets, registra `content-sources.lock.json` y escribe el manifiesto SHA-256 de CONTENT. `verificar` detecta un byte alterado, archivos ausentes e intrusos. UUID derivados del contenido: reconstruir la edición conserva las anclas de los datos personales. Derechos por defecto: `personal-preservation` (conservador; nunca se publica sin decisión).
- Verificado en vivo: biblioteca semilla de 3 documentos ingerida en la carpeta portable de desarrollo; la app la abre y muestra `corpus: 2026-C0-semilla`; snippet de búsqueda con tilde funcionando.

## Estado actual

- Plan maestro 2.0 adoptado como `PLAN_MAESTRO.md`, con cuatro enmiendas del propietario en `ENMIENDAS.md` que prevalecen donde contradigan al plan.
- Repositorio público en `https://github.com/larabiatendra-prog/vestigio`; CI en verde sobre Windows.
- Especificación ejecutable completa en `docs/`: producto, arquitectura, política de contenido, pruebas, recuperación, preservación, UX, modelo de amenazas (T01–T12) y matriz de requisitos (REQ-*).
- Seis ADR aceptadas (`docs/adr/`): stack, procesos/aislamiento, datos/búsqueda, portabilidad/versiones, integridad/recuperación, alcance.
- Matriz de capacidades congelada en `content/coverage/capabilities-1.0.yml` (guía, no puerta — E1).
- Contratos de datos preliminares en `packages/contracts/`: tipos TypeScript + JSON Schemas con tests ajv de ejemplos válidos/inválidos.
- **La aplicación existe** (`apps/reader/`, Electron 43 + React 19 + Forge/Webpack): main mínimo, preload tipado, renderer con la línea El Páramo, servicio de datos en `utilityProcess` con supervisor lease/epoch y mutaciones idempotentes, `PortablePathService` (marcador de entrega, modo solo lectura a %TEMP%), `NetworkPolicyService` (allowlist exacta), CSP estricta sin `unsafe-eval` ni en desarrollo, protocolo `vestigio://` (deniega todo aún), logging rotativo, single-instance por root. Empaquetado Windows x64 real con 7/7 fuses verificados en el binario (`scripts/verificar-fuses.mjs`).
- Verificado en real: arranque empaquetado desde carpeta externa con espacios y eñe (crea USER_DATA/BACKUPS/LOGS/RUNTIME correctos), arranque dev completo con renderer conectado, 50 pruebas.
- **Persistencia real (`packages/database`, ADR-0007):** `node:sqlite` del runtime embebido (puerta 8/8 superada sobre el binario Electron: FTS5 con `ñ` preservada, backup API, readOnly y query_only). Dos bases: catálogo RO con `query_only` afirmado y personal RW con `journal_mode=DELETE`/`synchronous=EXTRA`/FK afirmados tras cada apertura. Migrador transaccional con rollback probado, backup solo por Backup API con dos snapshots rotativos verificados, marca de cierre limpio + comprobación reforzada tras cierre sucio, idempotencia de mutaciones persistente en tabla, datos anclados a UUID, fixture builder canónico. El servicio de datos abre las bases y expone favoritos/notas/progreso tipados; la ventana muestra los datos personales en vivo.

## Hecho

| Fecha      | Qué                                                                                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-30 | Bloque 00: estructura, documentos, tooling, tests de guardia, CI. Repo remoto creado, push y CI verde.                                                           |
| 2026-07-30 | Bloque 01: especificación ejecutable, 6 ADR, amenazas, requisitos, capacidades y contratos preliminares.                                                         |
| 2026-07-30 | Bloque 02 (núcleo): shell Electron portable y seguro, supervisor lease/epoch, empaquetado con fuses verificados, primera ventana real con El Páramo.             |
| 2026-07-30 | Bloque 03: node:sqlite con puerta superada (ADR-0007), dos bases con PRAGMAs afirmados, migrador, backup rotativo, idempotencia persistente y servicio cableado. |

## Bloqueos

- **Firma del binario (decisión de Daniel):** grabar los fuses invalida la firma Authenticode de Electron y el Control de aplicaciones inteligente de Windows bloquea el `Vestigio.exe` empaquetado en NODO (detalle y opciones en `docs/TOOLCHAIN.md`). No impide desarrollar (el modo dev usa el electron.exe firmado), pero sí revalidar la UI empaquetada en esta máquina.

## Deudas de los Bloques 02–03 (pendientes, con destino)

- Pruebas end-to-end sobre el paquete real con Electron vivo: crash/reinicio del servicio con la base abierta, mutación con respuesta perdida de extremo a extremo, rechazo de un segundo escritor entre procesos, medio de solo lectura físico y NTFS/exFAT en USB real → bloque 16 (BAT/doctor/recuperación), donde se ensaya la entrega completa. La lógica equivalente está cubierta por tests unitarios/integración (50 en verde).
- Captura de red a nivel de sistema operativo como aceptación (bloque 19; el bloqueo por `webRequest` + tests unitarios ya cubre la app).
- Revalidación de la UI del paquete final cuando se resuelva la firma.
- Tablas editoriales completas del catálogo (rights por acción, eventos/agentes, format validation, coverage/scenarios) → bloque 04+, junto a la CLI que las construye y usa (E1: el esquema crece con su herramienta, no antes).

## Deudas (aplazamientos deliberados por E2, con bloque de destino)

- Patrón canónico de emergencia e impresión (`EMERGENCY_CONTENT_PATTERN.md`, `PRINT_SPEC.md`) → bloque 14, con los datos canónicos reales.
- Banco de consultas de búsqueda y tareas UX aprobadas por Daniel → bloque 09 (búsqueda) y rondas R1–R5 de `UX_TEST_PLAN.md`.
- Especificación detallada de la ceremonia de firma → bloques 16/20.
- Wireflows detallados → se diseñan con la primera interfaz real (bloque 10), sobre la línea El Páramo.
- Comprobación básica de nombre y marcas ("Vestigio") antes de 1.0.

## Siguiente paso previsto

Bloque 04 con enfoque E1: la CLI administrativa de ingesta automática en bloque (carpeta entera → catálogo buscable con metadatos honestos), reutilizando el fixture builder como núcleo. Después 05–06 (HTML/PDF) y 09–11 (búsqueda y lectura) hacia el hito "biblioteca usable".
