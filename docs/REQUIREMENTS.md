# REQUIREMENTS — Matriz de requisitos

Requisitos con ID estable, criterio verificable y bloque responsable. Derivada del criterio de terminado (plan §4) y las enmiendas. Los bloques son los del plan §16 con orden flexible (E2).

## Producto y portabilidad

| ID      | Requisito                        | Criterio                                                                           | Bloque |
| ------- | -------------------------------- | ---------------------------------------------------------------------------------- | ------ |
| REQ-P01 | Arranque portable                | Abre desde carpeta copiada a USB, sin admin ni instalación                         | 02, 20 |
| REQ-P02 | `Start.bat` con bootstrap previo | Verifica antes de arrancar; evita instancias duplicadas                            | 16     |
| REQ-P03 | `Install.bat` sin descargas      | Prueba escritura, selecciona modo, crea carpetas personales, diagnóstico inicial   | 16     |
| REQ-P04 | `Doctor.bat` independiente       | Diagnóstico CMD/PowerShell sin ejecutar `Vestigio.exe`; luego diagnóstico profundo | 16     |
| REQ-P05 | `EMERGENCIA.bat`                 | Núcleo crítico o fallback en doble clic                                            | 14, 16 |
| REQ-P06 | Red cero en runtime              | Captura a nivel de SO sin paquetes externos                                        | 02, 19 |
| REQ-P07 | Fallback sin app                 | `CATALOGO.html/csv` + núcleo estático utilizables con app/índice/Kiwix rotos       | 14, 16 |
| REQ-P08 | Cierre seguro                    | Snapshot coherente + confirmación de archivos cerrados                             | 12, 16 |
| REQ-P09 | Sin rutas absolutas              | Sobrevive a cambio de letra de unidad                                              | 03, 12 |
| REQ-P10 | Fuses y aislamiento Electron     | Configuración §6.3 verificada tras empaquetar                                      | 02, 19 |

## Datos y búsqueda

| ID      | Requisito                         | Criterio                                                                  | Bloque |
| ------- | --------------------------------- | ------------------------------------------------------------------------- | ------ |
| REQ-D01 | Dos SQLite separadas              | Contenido RO real + personal RW con PRAGMAs afirmados                     | 03     |
| REQ-D02 | Un solo escritor                  | Lease/epoch probado con crash simulado (T07)                              | 03     |
| REQ-D03 | UUID opacos + aliases             | Datos personales anclados a UUID, nunca a rutas                           | 03     |
| REQ-D04 | Ingesta automática en bloque      | Carpeta entera → recursos buscables sin campos manuales obligatorios (E1) | 04–08  |
| REQ-D05 | Metadatos honestos                | Ficha muestra lo extraído y declara lo desconocido                        | 04, 10 |
| REQ-D06 | FTS5 exacto + capa tolerante      | Casos de contrato españoles/valencianos de `TESTING.md` en verde          | 09     |
| REQ-D07 | Fusión determinista con Kiwix     | RRF; origen marcado; Kiwix lento no bloquea                               | 09     |
| REQ-D08 | Umbrales de búsqueda              | Los congelados en `TESTING.md` con banco aprobado por Daniel              | 09, 18 |
| REQ-D09 | Notas/favoritos/progreso robustos | Sobreviven cierre, cambio de unidad y actualización                       | 12     |
| REQ-D10 | Backup + exportación legible      | SQLite Backup API + Markdown/CSV/JSON                                     | 12     |
| REQ-D11 | Consultas patológicas acotadas    | Suite T08 sin cuelgues                                                    | 09     |

## Lectura y contenido

| ID      | Requisito                   | Criterio                                                       | Bloque    |
| ------- | --------------------------- | -------------------------------------------------------------- | --------- |
| REQ-C01 | Formatos completos          | HTML/MD/TXT/PDF/EPUB/imágenes/ZIM: ingesta, búsqueda y lectura | 05–08, 11 |
| REQ-C02 | Original conservado         | Toda derivación enlaza al original; nunca lo sustituye         | 04+       |
| REQ-C03 | Lectores sin scripts        | Fixtures maliciosos neutralizados (T05)                        | 05–08, 19 |
| REQ-C04 | Kiwix aislado               | 127.0.0.1, origen exacto, `WebContentsView` sin IPC            | 08        |
| REQ-C05 | Inclusión por utilidad      | Sin exclusiones morales; sensible contextualizado (E4)         | 17–18     |
| REQ-C06 | Núcleo crítico curado       | Fuente canónica única; protocolos oficiales sin recomposición  | 14, 18    |
| REQ-C07 | Información vigente fechada | Verificación y caducidad visibles; versión propia              | 15        |
| REQ-C08 | Cobertura ligera            | Módulos M01–M12+MV con material útil y localizable (E1)        | 17–18     |

## Integridad y entrega

| ID      | Requisito                     | Criterio                                                                               | Bloque |
| ------- | ----------------------------- | -------------------------------------------------------------------------------------- | ------ |
| REQ-I01 | SHA-256 total                 | Manifiesto completo verificable por Doctor                                             | 16, 20 |
| REQ-I02 | Firma offline                 | Minisign; clave fuera de la entrega; T01/T02 probadas                                  | 16, 20 |
| REQ-I03 | Tres versiones independientes | app / corpus / información vigente visibles                                            | 03, 20 |
| REQ-I04 | Recuperación probada          | Matriz de fallos de `TESTING.md` superada                                              | 16, 19 |
| REQ-I05 | BagIt + dos copias            | Copia de archivo válida, ensayo de restauración (T04)                                  | 20     |
| REQ-I06 | SBOM y licencias              | CycloneDX, avisos de terceros, `toolchain.lock.json`                                   | 19–20  |
| REQ-I07 | Perfiles de salida            | `portable-personal` / `public-code` / `preservation-archive` con test negativo de fuga | 04, 20 |

## Calidad

| ID      | Requisito                   | Criterio                                               | Bloque  |
| ------- | --------------------------- | ------------------------------------------------------ | ------- |
| REQ-Q01 | Presupuestos de rendimiento | Tabla de `TESTING.md` en equipo objetivo               | 19      |
| REQ-Q02 | WCAG 2.2 AA                 | Criterios de `TESTING.md`; Narrador en flujos críticos | 10+, 19 |
| REQ-Q03 | Línea El Páramo             | Tokens de Canon adaptados; sin deriva estética (E3)    | 10+     |
| REQ-Q04 | Puertas humanas             | Rondas R1–R5 de `UX_TEST_PLAN.md` registradas          | 10+, 21 |
| REQ-Q05 | CI reproducible             | Build Windows desde checkout limpio                    | 00, 19  |
