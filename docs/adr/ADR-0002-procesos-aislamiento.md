# ADR-0002 — Procesos y aislamiento: main mínimo, utilityProcess, Kiwix confinado

**Fecha:** 2026-07-30
**Estado:** aceptada
**Ámbito:** arquitectura de procesos y seguridad de Electron

## Contexto

Una biblioteca para escenarios adversos no puede depender de que nada falle: SQLite puede corromperse, Kiwix puede colgarse, un documento puede ser hostil. Cada pieza debe poder caer sin arrastrar al resto ni corromper datos.

## Decisión

1. **Main mínimo:** ciclo de vida, políticas, rutas, red; sin trabajo pesado síncrono.
2. **`utilityProcess` para SQLite y búsqueda:** único dueño de las conexiones; contrato de mensajes tipado por `MessagePort`; sin APIs de red; reinicio supervisado con **lease/epoch** (nunca dos escritores); mutaciones idempotentes por ID, sin reintentos ciegos.
3. **Kiwix como proceso separado:** ligado a `127.0.0.1`, puerto dinámico verificado con health-check de versión, ciclo de vida unido a Vestigio. Main es el **único cliente HTTP loopback** y hace de proxy restringido al origen exacto.
4. **Visor ZIM en `WebContentsView` aislado:** sin preload, sin IPC, sesión efímera, permisos denegados, JavaScript desactivado salvo prueba de seguridad específica.
5. **Renderer sin privilegios:** `contextIsolation`, `sandbox`, `nodeIntegration:false`, CSP estricta, IPC con canales enumerados y esquemas, rutas solo desde IDs de catálogo, protocolo local propio (no `file://` libre), `session.webRequest` como allowlist exacta.
6. **Fuses de producción y ASAR con integridad** (lista del plan §6.3), verificados tras empaquetar; corpus y datos personales fuera del ASAR.

## Alternativas consideradas

- SQLite en main: simple, pero un query lento congela la UI y un crash de datos tumba la app.
- Kiwix embebido como librería: acopla el ciclo de vida y amplía la superficie de ataque del proceso principal.
- Permitir todo loopback: dejaría al visor ZIM hablar con cualquier servicio local; se restringe al puerto propiedad de Vestigio.

## Consecuencias

Más piezas móviles y un contrato de mensajes que mantener; a cambio, fallos contenidos, un solo escritor garantizado y una superficie de ataque mínima verificable por test (T05–T08 del `THREAT_MODEL.md`).

## Evidencia

Plan §6.2–6.3; auditoría 2.0 P0-3, P0-4; pruebas exigidas en `REQUIREMENTS.md` REQ-P06/P10, REQ-D02, REQ-C04.
