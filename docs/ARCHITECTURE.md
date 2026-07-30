# ARCHITECTURE — Vestigio

Arquitectura técnica ejecutable. El detalle canónico vive en `PLAN_MAESTRO.md` §6–§9; este documento fija lo que la implementación debe cumplir y dónde se decide cada cosa (ADR en `docs/adr/`).

## Vista general

```
Renderer React (sin privilegios)
   │  contextBridge: API tipada y validada
Electron main (ciclo de vida, políticas, rutas, red bloqueada)
   ├── utilityProcess: SQLite + búsqueda (único dueño de las conexiones)
   │      ├── CONTENT/index/vestigio-content.sqlite  (solo lectura + FTS5)
   │      └── USER_DATA/vestigio-user.sqlite         (escribible, un escritor)
   ├── kiwix-serve.exe (proceso separado, 127.0.0.1, puerto propio)
   │      └── WebContentsView aislado (sin preload, sin IPC, sesión efímera)
   └── FALLBACK/ (HTML/CSV/TXT/PDF utilizables sin app, índice ni Kiwix)
```

## Reglas de proceso

- **Main mínimo:** ciclo de vida, resolución segura de rutas portables, arranque/cierre de Kiwix, bloqueo de red y navegación, supervisión del servicio de búsqueda, impresión, logging sin datos sensibles. Nada de trabajo pesado síncrono.
- **Servicio de datos (`utilityProcess`):** único propietario de SQLite; contrato de mensajes tipado por `MessagePort`; sin APIs de red; límites de tiempo/tamaño/concurrencia; reinicio supervisado con lease/epoch — nunca dos escritores; mutaciones con ID idempotente, sin reintentos ciegos.
- **Kiwix:** proceso separado ligado a `127.0.0.1` con puerto dinámico verificado (spawn → vivo → health-check de versión → aceptar); main es el único cliente HTTP loopback y actúa de proxy restringido al origen exacto. Visor en `WebContentsView` aislado, JavaScript desactivado por defecto.

## Persistencia

- Base de contenido: solo lectura real (`readonly` del backend + `PRAGMA query_only=ON`); se reconstruye con la herramienta administrativa; nunca recibe estado del usuario.
- Base personal: `journal_mode=DELETE`, `synchronous=EXTRA`; PRAGMAs afirmados tras abrir, no presupuestos; migraciones transaccionales con copia previa; marca de cierre limpio; backup solo con SQLite Backup API.
- Wrapper SQLite: `better-sqlite3` reconstruido para la ABI de Electron, salvo que `node:sqlite` supere la puerta de evaluación empaquetada (ADR-0003).
- Identidad: UUID opacos e inmutables para `resource`/`edition`/`asset`; slugs como alias mutables; datos personales anclados a UUID y localizadores lógicos, nunca a rutas.

## Búsqueda

- FTS5 exacto con `unicode61 remove_diacritics 0` (preserva `ñ`, tildes, grafías valencianas) + capa tolerante propia que equivale acentos sin corregir en silencio; sin Porter; sinónimos versionados; pesos por campo; filtros en SQL.
- Kiwix por su endpoint documentado con test contractual de versión; fusión determinista (RRF) con resultados marcados por origen; Documentos primero, grupo ZIM cancelable — Kiwix lento no bloquea.
- Umbrales congelados en `TESTING.md` §Búsqueda.

## Seguridad Electron (obligatoria, verificada por test)

`contextIsolation`, `sandbox`, `nodeIntegration:false`, preload mínimo, CSP estricta, navegación/ventanas bloqueadas, permisos denegados, IPC con canales enumerados y esquemas, rutas solo desde IDs de catálogo, protocolo local propio (no `file://` libre), `session.webRequest` bloqueando todo lo externo salvo el origen Kiwix exacto, y fuses de producción (`RunAsNode=false`, ASAR integrity, etc. — lista completa en `PLAN_MAESTRO.md` §6.3). La prueba de aceptación de red se hace con captura a nivel de sistema operativo.

## Entrega portable

Carpeta autocontenida con `Start.bat`, `Install.bat`, `Doctor.bat` y `EMERGENCIA.bat` en la raíz; Doctor y FALLBACK independientes de Electron/SQLite/Kiwix; sin rutas absolutas persistentes; tres versiones independientes (app, corpus, información vigente); perfiles de salida `portable-personal`, `public-code` y `preservation-archive`.

## Stack y dependencias

Electron + React + TypeScript; Electron Forge con el plugin Webpack estable; dependencias fijadas con lockfile; nativas con binario Windows x64 reproducible; Kiwix como programa separado; origen/versión/hash de herramientas en `toolchain.lock.json`; SBOM CycloneDX y avisos de terceros.
