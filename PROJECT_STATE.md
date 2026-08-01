# PROJECT_STATE — Vestigio

**Última actualización:** 2026-08-01
**Fase:** Bloques 00–06 y 08–12 ejecutados (con deudas registradas); siguiente: 07 (EPUB) o 13 (Aprender y Aplicar). **Dos puertas esperan a Daniel: rondas R1 y R2 de `docs/UX_TEST_PLAN.md`.**
**Versiones:** app `0.1.0` · corpus `2026-C1-semilla (desarrollo)` · información vigente `—`

> **Vestigio ya es una biblioteca de trabajo**: se le echa una carpeta de documentos, se busca, se abre, se lee, se anota y lo anotado viaja con la carpeta. Buscar → abrir en la sección o página exacta funciona de extremo a extremo, y volver atrás devuelve la pantalla exactamente como estaba.

- **La CLI de ingesta existe** (`tools/admin-cli`, `vestigio-admin`): `ingerir <carpeta> --salida <edición>` analiza en bloque, deduplica por hash exacto, detecta formato por firma binaria, extrae título/idioma/texto con honestidad (lo desconocido queda ausente), copia originales content-addressed, construye el catálogo SQLite con FTS y snippets, registra `content-sources.lock.json` y escribe el manifiesto SHA-256 de CONTENT. `verificar` detecta un byte alterado, archivos ausentes e intrusos. UUID derivados del contenido: reconstruir la edición conserva las anclas de los datos personales. Derechos por defecto: `personal-preservation` (conservador; nunca se publica sin decisión).
- **Formatos textuales seguros (bloque 05, `packages/content-pipeline`):** saneado de HTML por lista blanca con tokenizador propio (reconstruye lo permitido en vez de "limpiar" cadenas); elimina scripts, handlers, iframes/formularios/objetos, `javascript:`/`data:` incluso ofuscados con entidades o tabuladores, y todo recurso remoto. Markdown y TXT se convierten y pasan por el mismo saneado. Segmentación estructural con localizadores jerárquicos estables (`sec-1`, `sec-1-1`) que no cambian al reconstruir.
- **PDF (bloque 06):** extracción por página en construcción con `pdfjs-dist` 6.2.108 fijado, límites de páginas/tiempo, y diagnóstico honesto (con texto, parcial, escaneado candidato a OCR, cifrado, ilegible). Un PDF corrupto no tumba la ingesta ni la app. Lector en pantalla con PDF.js empaquetado (worker copiado junto a la ventana, sin CDN), navegación por páginas, zoom y vista textual marcada como extracción.
- **Interfaz de biblioteca y lectura:** buscador con fragmentos resaltados, listado del catálogo, lector de texto con índice lateral y sección destacada, lector de PDF que abre en la página del resultado. Todo con El Páramo (E3).
- **Protocolo `vestigio://original/<uuid>`:** el renderer pide contenido por identificador; el main resuelve la ruta y comprueba que queda dentro de CONTENT. Nunca hay rutas de disco en el renderer.
- Verificado en vivo: biblioteca semilla (2 markdown, 1 txt, 1 PDF de 4 páginas) ingerida y abierta por la app; buscar "generador" lleva a la página 3 del PDF, "lejía" a la sección del markdown.
- **Colecciones ZIM (bloque 08, ADR-0008):** `kiwix-serve` 3.8.1 como proceso separado en `TOOLS/kiwix/`, ligado solo a 127.0.0.1 con puerto dinámico propio, `--blockexternal` y `--attachToProcess`. Health-check que identifica la instancia (no basta que el puerto responda). El main es el único cliente HTTP y valida el **origen exacto**: otro puerto de loopback o `localhost` se rechazan. Búsqueda por la API pública con test contractual sobre respuestas reales. Visor en `WebContentsView` con sesión efímera, sin preload ni IPC, JavaScript desactivado y allowlist del origen propio. Los resultados ZIM aparecen en su propio grupo, sin reordenar los documentos catalogados.
- Verificado en vivo con un ZIM real de 72 MB: el servidor **no responde desde la IP de red** (solo loopback), la búsqueda devuelve artículos, y al **matar Electron a la fuerza kiwix-serve muere solo** (sin procesos huérfanos).
- **Búsqueda unificada (bloque 09, `packages/search`):** normalización de doble capa — índice exacto que preserva `ñ`, tildes, `ç` y `l·l`, más capa tolerante que quita solo acentos vocálicos y genera variantes explícitas de grafía (`façana`↔`facana`, `col·legi`↔`collegi`). Parser seguro con modo sencillo (sin sintaxis mágica) y avanzado (frases, prefijos, exclusión) con errores que señalan la posición exacta. Diccionario de sinónimos versionado, visible y desactivable, que **no expande si hay cifras, unidades o negaciones**. Sugerencias de errata sobre el vocabulario real, nunca sustitución silenciosa. Fusión RRF determinista con orden de señal (todas las palabras > título > exacta > sin tildes > alias); cada resultado declara su motivo. Filtros por facetas con OR dentro y AND entre, contados en SQL. Títulos de documentos ahora buscables (no lo eran).
- **Rendimiento medido** sobre 10.000 segmentos: p50 **9 ms**, p95 **18 ms** (presupuesto: 250 ms / 1,5 s).
- **Navegación y biblioteca visual (bloque 10):** barra primaria (Inicio, Biblioteca, Mi espacio, Sistema), migas de pan e historial propio con atrás/adelante por `Alt`+flechas y botones laterales del ratón. La restauración es exacta porque el estado de la búsqueda —consulta, filtros, modo avanzado, sinónimos, lista o rejilla— viaja **dentro** del destino del historial, no en un estado suelto. Biblioteca en lista y rejilla; los vacíos distinguen "no hay catálogo" de "el catálogo está vacío".
- **Ficha de recurso (bloque 10):** cada eje editorial por separado y, bajo E1, lo que no se sabe se declara con palabras ("no consta en el documento y nadie la ha declarado") en vez de rellenarse. Explica qué significa cada estado del texto y cada nivel de derechos. Vecinos temáticos deducidos del catálogo, presentados como deducción y no como recomendación editorial.
- **Lector unificado (bloque 11):** TXT, Markdown, HTML, PDF y ZIM comparten cabecera, índice, marcadores, notas, relacionados y cita. La cabecera dice siempre qué versión se está leyendo: formato, edición del corpus y si es el original o una extracción. `Ctrl+F` con siguiente/anterior, `F3`, `Escape` y vuelta al foco de partida, con la misma normalización que el buscador de la biblioteca. Preferencias de lectura (tamaño, ancho, interlineado, letra y superficie) persistidas en los ajustes y restaurables de un botón.
- **Progreso honesto (bloque 11):** se guarda por localizador estable más página y un texto de referencia. Si la edición se reconstruye y el ancla desaparece, Vestigio recoloca por ese texto **y lo dice**; si no puede, admite la pérdida en vez de dejar a Daniel en un sitio cualquiera.
- **Espacio personal completo (bloque 12):** favoritos, colecciones, notas editables ancladas a sección o página, marcadores sin duplicados y papelera. Ningún borrado personal es definitivo en el acto. Búsqueda de notas sin acertar con las tildes.
- **Paquete portable del espacio personal (bloque 12):** un ZIP corriente con la base (Backup API) y los mismos datos en Markdown, CSV y JSON, deterministas, pensados para seguir sirviendo con Vestigio roto o ausente. El contenedor ZIP está escrito en el repo sobre `node:zlib` para que las defensas queden a la vista y bajo prueba: sin rutas absolutas ni `..`, topes absolutos de tamaño, ratio de expansión y CRC verificado. Importar pasa siempre por _staging_: manifiesto, huellas y esquema se comprueban antes de tocar nada, y la restauración entra entera o no entra.
- **Cerrar y preparar para copiar (bloque 12):** respalda si hay algo nuevo, cierra las bases, detiene Kiwix, suelta los ficheros y aclara que **no** sustituye a la expulsión segura de Windows.
- **Solo lectura honesto (bloque 12):** en un soporte bloqueado hay sesión temporal en memoria, marcada como tal en todas las pantallas, con salida al portapapeles. Nunca se promete guardar.
- **Accesibilidad (bloque 10):** saltar al contenido, foco visible, áreas de 44 px, `prefers-reduced-motion` respetado de verdad, `forced-colors` con bordes y `Highlight`, resaltado que no depende solo del color y reflow a una columna para 1366×768 y ampliaciones grandes.

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
| 2026-08-01 | Bloque 12 (motor): migración 2 del esquema personal, repositorio completo con papelera, exportación determinista y paquete portable con ZIP propio verificado.   |
| 2026-08-01 | Bloque 10: navegación primaria, historial con restauración exacta, biblioteca en lista y rejilla, ficha con ejes honestos y pasada de accesibilidad.             |
| 2026-08-01 | Bloque 11: shell común de lector para todos los formatos, `Ctrl+F` unificado, preferencias de lectura y progreso con fallback textual.                           |
| 2026-08-01 | Bloque 12 (pantalla): Mi espacio, exportar e importar el espacio personal, y "cerrar y preparar para copiar o expulsar".                                         |

## Bloqueos

- **Firma del binario (decisión de Daniel):** grabar los fuses invalida la firma Authenticode de Electron y el Control de aplicaciones inteligente de Windows bloquea el `Vestigio.exe` empaquetado en NODO (detalle y opciones en `docs/TOOLCHAIN.md`). No impide desarrollar (el modo dev usa el electron.exe firmado), pero sí revalidar la UI empaquetada en esta máquina.

## Deudas de los Bloques 02–03 (pendientes, con destino)

- Pruebas end-to-end sobre el paquete real con Electron vivo: crash/reinicio del servicio con la base abierta, mutación con respuesta perdida de extremo a extremo, rechazo de un segundo escritor entre procesos, medio de solo lectura físico y NTFS/exFAT en USB real → bloque 16 (BAT/doctor/recuperación), donde se ensaya la entrega completa. La lógica equivalente está cubierta por tests unitarios/integración (50 en verde).
- Captura de red a nivel de sistema operativo como aceptación (bloque 19; el bloqueo por `webRequest` + tests unitarios ya cubre la app).
- Revalidación de la UI del paquete final cuando se resuelva la firma.
- Tablas editoriales completas del catálogo (rights por acción, eventos/agentes, format validation, coverage/scenarios) → bloque 04+, junto a la CLI que las construye y usa (E1: el esquema crece con su herramienta, no antes).
- **Bloques 05–06:** validadores externos por formato (DROID/Siegfried, qpdf/JHOVE, veraPDF) → bloque 19 con el corpus real; OCR selectivo → cuando exista material escaneado que lo justifique; WARC/WACZ preservacional → caso excepcional, sin corpus que lo pida; miniaturas de PDF → con la vista de biblioteca en rejilla (bloque 10).
- **Puerta de UX pendiente (Daniel):** rondas **R1 y R2** de `UX_TEST_PLAN.md`, ya escritas con sus tareas. R1 cierra el bloque 10 (su criterio de salida exige que las apruebe Daniel con evidencia, y Claude no las autoaprueba); R2 valida notas, progreso, copias y traslado.

## Decisiones y deudas de los bloques 10–12

- **Aprender, Aplicar, Emergencia e Información vigente no están en la barra de navegación.** El plan los pide ahí, pero sus destinos los construyen los bloques 13–15, y el criterio de salida del bloque 10 prohíbe placeholders en la UI entregada. Aparecen cuando existan. Si Daniel prefiere verlos ya como pistas de lo que viene, es una decisión suya, no una omisión.
- **Superficie clara de lectura ("papel"): revisar con Canon.** El bloque 11 pide tema entre las preferencias de lectura, y El Páramo define la oscuridad como modo primario. La resolución adoptada es acotarlo: el _chrome_ de la aplicación es siempre El Páramo y solo la columna de texto puede pasar a papel claro, como ajuste de comodidad de lectura. **Contradicción potencial con `canon/linea-grafica` señalada para que Daniel decida**: o se acepta como excepción documentada de lectura larga, o se retira la opción.
- **Estado editorial actual/sustituido/retirado (bloque 10, t.5):** no se implementa porque bajo E1 nadie revisa editorialmente los recursos, así que el campo solo podría decir "sin declarar" para todos. Llega con el bloque 18, cuando haya revisión real que registrar.
- **EPUB en el lector:** el shell común ya lo admite sin cambios, pero el formato no existe hasta el bloque 07. La regla del plan de no usar "página" en EPUB reflowable está respetada por construcción: el progreso se guarda por localizador, y la página es un dato adicional que solo rellena el PDF.
- **Miniaturas de PDF en la rejilla:** la rejilla existe pero muestra formato y autoría, no portadas. Renderizar miniaturas en la ingesta sigue pendiente (deuda del bloque 06).
- **Pruebas físicas del espacio personal (bloque 12, t.11):** cambio de letra de unidad en un USB real, poco espacio en disco y corte de corriente durante una migración → bloque 16, con la entrega completa montada. La lógica equivalente está cubierta: paquete manipulado rechazado, ZIP hostil rechazado y restauración fallida que deja los datos intactos.
- **Narrador y Accessibility Insights:** el CSS cumple reduced-motion, forced-colors, foco visible, áreas de 44 px y reflow a una columna, pero la comprobación con lector de pantalla real acompaña a la ronda R1; no se da por hecha.

## Deudas (aplazamientos deliberados por E2, con bloque de destino)

- Patrón canónico de emergencia e impresión (`EMERGENCY_CONTENT_PATTERN.md`, `PRINT_SPEC.md`) → bloque 14, con los datos canónicos reales.
- Banco de consultas de búsqueda y tareas UX aprobadas por Daniel → bloque 09 (búsqueda) y rondas R1–R5 de `UX_TEST_PLAN.md`.
- Especificación detallada de la ceremonia de firma → bloques 16/20.
- Wireflows detallados → resueltos en el bloque 10 construyendo la interfaz real sobre El Páramo, en vez de dibujarla aparte.
- Comprobación básica de nombre y marcas ("Vestigio") antes de 1.0.

## Siguiente paso previsto

Con los bloques 10–12 cerrados, Vestigio ya no es solo una biblioteca que se lee: es una en la que se trabaja y de la que el trabajo se puede sacar. Lo que toca ahora, por orden de valor:

1. **Rondas R1 y R2 con Daniel.** Son la única forma de saber si esto se usa de verdad, y R1 es la puerta de salida del bloque 10. Todo lo demás puede esperar a saber qué sale de ahí.
2. **Bloque 07 (EPUB e imágenes)** si el corpus real va a tener libros electrónicos: es el único formato importante que falta y el lector ya está preparado para recibirlo.
3. **Bloque 13 (Aprender y Aplicar)**, que además trae los destinos que faltan en la barra de navegación.

Decide Daniel.

## Entorno de desarrollo

`apps/reader/.portable-dev/` (ignorado por Git) contiene la entrega de pruebas: biblioteca semilla, `TOOLS/kiwix/` con kiwix-serve 3.8.1 y un ZIM de 72 MB prestado de WikiLocal como fixture. **Ese ZIM es de Wikipedia y no forma parte del corpus de Vestigio** (plan §2.5): solo sirve para probar la integración.
