# PROJECT_STATE — Vestigio

**Última actualización:** 2026-07-30
**Fase:** Bloques 00–06 y 08 ejecutados (con deudas registradas); siguiente: 07 (EPUB), 09 (fusión de búsqueda) o 12 (datos personales en la interfaz)
**Versiones:** app `0.1.0` · corpus `2026-C1-semilla (desarrollo)` · información vigente `—`

> **Vestigio ya es utilizable**: se le echa una carpeta de documentos, se abre y se lee. Buscar → abrir en la sección o página exacta funciona de extremo a extremo.

- **La CLI de ingesta existe** (`tools/admin-cli`, `vestigio-admin`): `ingerir <carpeta> --salida <edición>` analiza en bloque, deduplica por hash exacto, detecta formato por firma binaria, extrae título/idioma/texto con honestidad (lo desconocido queda ausente), copia originales content-addressed, construye el catálogo SQLite con FTS y snippets, registra `content-sources.lock.json` y escribe el manifiesto SHA-256 de CONTENT. `verificar` detecta un byte alterado, archivos ausentes e intrusos. UUID derivados del contenido: reconstruir la edición conserva las anclas de los datos personales. Derechos por defecto: `personal-preservation` (conservador; nunca se publica sin decisión).
- **Formatos textuales seguros (bloque 05, `packages/content-pipeline`):** saneado de HTML por lista blanca con tokenizador propio (reconstruye lo permitido en vez de "limpiar" cadenas); elimina scripts, handlers, iframes/formularios/objetos, `javascript:`/`data:` incluso ofuscados con entidades o tabuladores, y todo recurso remoto. Markdown y TXT se convierten y pasan por el mismo saneado. Segmentación estructural con localizadores jerárquicos estables (`sec-1`, `sec-1-1`) que no cambian al reconstruir.
- **PDF (bloque 06):** extracción por página en construcción con `pdfjs-dist` 6.2.108 fijado, límites de páginas/tiempo, y diagnóstico honesto (con texto, parcial, escaneado candidato a OCR, cifrado, ilegible). Un PDF corrupto no tumba la ingesta ni la app. Lector en pantalla con PDF.js empaquetado (worker copiado junto a la ventana, sin CDN), navegación por páginas, zoom y vista textual marcada como extracción.
- **Interfaz de biblioteca y lectura:** buscador con fragmentos resaltados, listado del catálogo, lector de texto con índice lateral y sección destacada, lector de PDF que abre en la página del resultado. Todo con El Páramo (E3).
- **Protocolo `vestigio://original/<uuid>`:** el renderer pide contenido por identificador; el main resuelve la ruta y comprueba que queda dentro de CONTENT. Nunca hay rutas de disco en el renderer.
- Verificado en vivo: biblioteca semilla (2 markdown, 1 txt, 1 PDF de 4 páginas) ingerida y abierta por la app; buscar "generador" lleva a la página 3 del PDF, "lejía" a la sección del markdown.
- **Colecciones ZIM (bloque 08, ADR-0008):** `kiwix-serve` 3.8.1 como proceso separado en `TOOLS/kiwix/`, ligado solo a 127.0.0.1 con puerto dinámico propio, `--blockexternal` y `--attachToProcess`. Health-check que identifica la instancia (no basta que el puerto responda). El main es el único cliente HTTP y valida el **origen exacto**: otro puerto de loopback o `localhost` se rechazan. Búsqueda por la API pública con test contractual sobre respuestas reales. Visor en `WebContentsView` con sesión efímera, sin preload ni IPC, JavaScript desactivado y allowlist del origen propio. Los resultados ZIM aparecen en su propio grupo, sin reordenar los documentos catalogados.
- Verificado en vivo con un ZIM real de 72 MB: el servidor **no responde desde la IP de red** (solo loopback), la búsqueda devuelve artículos, y al **matar Electron a la fuerza kiwix-serve muere solo** (sin procesos huérfanos).

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
- **Bloques 05–06:** validadores externos por formato (DROID/Siegfried, qpdf/JHOVE, veraPDF) → bloque 19 con el corpus real; OCR selectivo → cuando exista material escaneado que lo justifique; WARC/WACZ preservacional → caso excepcional, sin corpus que lo pida; miniaturas de PDF → con la vista de biblioteca en rejilla (bloque 10).
- **Puerta de UX pendiente (Daniel):** ronda R1 de `UX_TEST_PLAN.md` — la biblioteca ya es usable, así que la prueba de encontrabilidad y lectura con tareas reales ya tiene sentido.

## Deudas (aplazamientos deliberados por E2, con bloque de destino)

- Patrón canónico de emergencia e impresión (`EMERGENCY_CONTENT_PATTERN.md`, `PRINT_SPEC.md`) → bloque 14, con los datos canónicos reales.
- Banco de consultas de búsqueda y tareas UX aprobadas por Daniel → bloque 09 (búsqueda) y rondas R1–R5 de `UX_TEST_PLAN.md`.
- Especificación detallada de la ceremonia de firma → bloques 16/20.
- Wireflows detallados → se diseñan con la primera interfaz real (bloque 10), sobre la línea El Páramo.
- Comprobación básica de nombre y marcas ("Vestigio") antes de 1.0.

## Siguiente paso previsto

El hito "biblioteca usable" (E2) está alcanzado, con documentos propios y colecciones ZIM. Opciones: bloque 09 (fusión determinista de los dos buscadores con RRF y filtros), bloque 12 (favoritos, notas y progreso en la interfaz — la base ya los guarda), o bloque 07 (EPUB e imágenes). Decide Daniel.

## Entorno de desarrollo

`apps/reader/.portable-dev/` (ignorado por Git) contiene la entrega de pruebas: biblioteca semilla, `TOOLS/kiwix/` con kiwix-serve 3.8.1 y un ZIM de 72 MB prestado de WikiLocal como fixture. **Ese ZIM es de Wikipedia y no forma parte del corpus de Vestigio** (plan §2.5): solo sirve para probar la integración.
