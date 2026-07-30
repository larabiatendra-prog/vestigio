# ADR-0007 — Backend SQLite: node:sqlite del runtime embebido

**Fecha:** 2026-07-30
**Estado:** aceptada
**Ámbito:** persistencia (bloque 03)

## Contexto

El plan (§6.4) exigía evaluar `node:sqlite` mediante una puerta con evidencia real y usar `better-sqlite3` reconstruido para la ABI de Electron si fallaba cualquier requisito: FTS5 real, backup, solo lectura efectiva, PRAGMAs afirmables.

## Decisión

Se adopta **`node:sqlite`** (el SQLite integrado en el Node embebido por Electron). Sin dependencias nativas de terceros, sin reconstrucción de ABI, sin binarios extra en la entrega.

## Evidencia (2026-07-30, `apps/reader/scripts/evaluar-node-sqlite.cjs`)

Ejecutada sobre el binario Electron 43.2.0 del repo (Node embebido 24.18.0, el mismo runtime que empaqueta la entrega) con `ELECTRON_RUN_AS_NODE=1`. Resultado: **8/8 pruebas superadas**:

- módulo disponible: `DatabaseSync, StatementSync, Session, constants, backup`;
- `PRAGMA compile_options` incluye `ENABLE_FTS5` (y FTS3, RTREE, MATH_FUNCTIONS…);
- FTS5 real con `unicode61 remove_diacritics 0`: `cañón` y `canon` no se confunden;
- `journal_mode=DELETE`, `synchronous=EXTRA(3)`, `foreign_keys=ON` afirmados tras apertura;
- `backup()` asíncrono funcional y copia legible;
- `readOnly: true` rechaza escrituras; `PRAGMA query_only=ON` también.

El fuse `RunAsNode=false` impide repetir el script dentro del exe empaquetado; la evidencia se toma del mismo binario/versión de runtime que se empaqueta, y los checks de integridad en arranque cubren el paquete real.

## Alternativas consideradas

- **better-sqlite3:** maduro y rápido, pero exige compilación nativa por ABI de Electron, complica CI/reproducibilidad y añade un binario que verificar en la cadena de integridad. Solo compensa si `node:sqlite` falla algo — no falla nada de lo exigido.

## Consecuencias

- La versión de SQLite queda ligada a la de Electron: cualquier actualización de Electron revalida esta puerta (el script queda en el repo).
- `node:sqlite` es más joven que better-sqlite3; los tests de integración del paquete `@vestigio/database` son el contrato que lo vigila en CI.
