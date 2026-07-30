# PROJECT_STATE — Vestigio

**Última actualización:** 2026-07-30
**Fase:** Bloque 00 — fundación, repositorio y reglas
**Versiones:** app `0.0.0` · corpus `—` · información vigente `—`

## Estado actual

- Plan maestro 2.0 adoptado como `PLAN_MAESTRO.md`, con cuatro enmiendas del propietario en `ENMIENDAS.md` (curación ligera, orden flexible, estética El Páramo de Canon, utilidad como criterio único de inclusión).
- Repositorio local inicializado con estructura de workspaces, documentos de gobierno, tooling (TypeScript estricto, ESLint, Prettier, Vitest) y CI mínima.
- Tests de guardia activos en `tests/guard/`: bloquean corpus, datos personales, claves y binarios grandes en Git.
- Sin código de aplicación todavía: Electron y las pantallas llegan en bloques posteriores.

## Hecho

| Fecha      | Qué                                                               |
| ---------- | ----------------------------------------------------------------- |
| 2026-07-30 | Bloque 00: estructura, documentos, tooling, tests de guardia, CI. |

## Bloqueos

- Creación del repositorio remoto `larabiatendra-prog/vestigio`: pendiente de que Daniel autentique `gh` (`gh auth login`).

## Deudas

- `docs/PRODUCT.md`, `docs/ARCHITECTURE.md` y `docs/CONTENT_POLICY.md` se redactarán en el Bloque 01, incorporando las enmiendas desde el origen.
- Comprobación básica de nombre y marcas ("Vestigio") antes de 1.0.

## Siguiente paso previsto

Bloque 01 (especificación ejecutable y ADR iniciales) y arranque temprano del esqueleto Electron (Bloque 02), con prioridad al hito "biblioteca usable cuanto antes" (enmienda E2).
