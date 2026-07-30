# ADR-0006 — Alcance: lectora cerrada + CLI administrativa; sin IA, red ni telemetría

**Fecha:** 2026-07-30
**Estado:** aceptada
**Ámbito:** límites del producto 1.0

## Contexto

El valor de Vestigio está en ser predecible, portable y honesto. Cada función conectada, generativa o editora dentro del lector añade superficie de fallo y de duda. Las enmiendas E1/E2 piden además que la construcción de la biblioteca sea cómoda sin abrir la puerta a editar el corpus desde el lector.

## Decisión

1. **App lectora cerrada:** no modifica la biblioteca maestra; el corpus es inmutable en lectura.
2. **CLI administrativa separada** (no incluida en la entrega de consulta): ingesta automática en bloque (E1), hashes, extracción de texto, saneado, validación de formatos, detección de duplicados, propuestas de etiquetas, construcción de SQLite/FTS, manifiestos, BagIt y ediciones cerradas. Errores comprensibles con archivo y línea. Sin segunda GUI en 1.0.
3. **Sin IA, RAG, embeddings ni generación en runtime.** Se permite automatización durante la construcción (extracción, duplicados, propuestas), nunca como árbitro editorial ni dependencia.
4. **Sin red en runtime, sin telemetría, sin cuentas, sin actualizador conectado.**
5. **Sin mapa interactivo en 1.0:** los mapas oficiales se admiten como documentos; el visor cartográfico queda para después.
6. **Notas ancladas (recurso/página/sección), no resaltado universal** en 1.0.

## Alternativas consideradas

- Edición del catálogo desde el lector: rompería el corpus cerrado y el modelo de release firmada.
- Búsqueda semántica local: contradice "sin IA" y añade dependencia de modelos; la búsqueda tradicional bien hecha cubre el caso de uso.
- Resaltado universal: exigiría infraestructura por formato desproporcionada para 1.0.

## Consecuencias

Todo lo excluido queda como posible 1.1+ mediante ADR nueva; la 1.0 se mantiene finita y verificable.

## Evidencia

Plan §2.5, §3, §3.1, §6.2; ENMIENDAS E1; REQ-C05, REQ-D04.
