# ADR-0003 — Datos y búsqueda: dos SQLite, FTS5 y doble normalización española

**Fecha:** 2026-07-30
**Estado:** aceptada
**Ámbito:** persistencia, identidad y búsqueda

## Contexto

El corpus es inmutable en lectura; las notas personales son lo único que cambia. Mezclarlos en una base haría imposible actualizar el corpus sin arriesgar datos personales. La búsqueda debe ser excelente en español y valenciano sin IA, y sin confundir `año` con `ano` en temas donde una errata importa.

## Decisión

1. **Dos SQLite:** `CONTENT/index/vestigio-content.sqlite` (solo lectura real + `query_only=ON`, reconstruible) y `USER_DATA/vestigio-user.sqlite` (un escritor, `journal_mode=DELETE`, `synchronous=EXTRA`, PRAGMAs afirmados tras abrir, backup solo con Backup API).
2. **Identidad estable:** UUID opacos e inmutables para `resource`/`edition`/`asset`; slugs como alias mutables; datos personales anclados a UUID y localizadores lógicos.
3. **FTS5 doble capa:** índice exacto con `unicode61 remove_diacritics 0` (preserva `ñ`, tildes, `ç`, `l·l`) + columna tolerante generada por función propia probada que equivale acentos vocálicos pero conserva `ñ`. Sin Porter. Erratas como sugerencia visible, nunca corrección silenciosa.
4. **Wrapper:** `better-sqlite3` reconstruido para la ABI de Electron; `node:sqlite` solo si supera una puerta empaquetada (FTS5 real, backup, límites, rendimiento).
5. **Fusión con Kiwix:** RRF determinista, origen marcado, candidatos limitados por backend, Documentos estables antes que ZIM.

## Alternativas consideradas

- Una sola base con tablas mixtas: actualizar corpus tocaría el archivo con datos personales.
- `remove_diacritics=1/2` global: borraría la distinción `ñ/n` y variantes valencianas — inaceptable.
- WAL para la base personal: mejor concurrencia, pero sin evidencia probada en NTFS/exFAT extraíble; exigiría ADR con pruebas.
- Motor de búsqueda dedicado (Lucene/Tantivy): dependencia pesada para un corpus de un usuario; FTS5 cumple con margen.

## Consecuencias

La capa tolerante propia exige una suite de casos de contrato (en `TESTING.md`) mantenida como parte del producto. La reconstrucción del índice es siempre posible desde originales (RECOVERY).

## Evidencia

Plan §6.2, §8, §9; auditoría P0-5; casos de contrato congelados en `TESTING.md`.
