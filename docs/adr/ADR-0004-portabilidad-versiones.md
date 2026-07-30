# ADR-0004 — Portabilidad: carpeta autocontenida, tres versiones, perfiles de salida

**Fecha:** 2026-07-30
**Estado:** aceptada
**Ámbito:** distribución, versionado y perfiles

## Contexto

Vestigio debe viajar en un USB entre ordenadores desconocidos, sin instalación, y seguir siendo publicable como código sin exponer ni el corpus personal ni los datos privados.

## Decisión

1. **Distribución por carpeta autocontenida:** runtime incluido, `Start.bat`/`Install.bat`/`Doctor.bat`/`EMERGENCIA.bat` en la raíz, sin registro de Windows, sin admin. Sin rutas absolutas persistentes ni letra de unidad asumida.
2. **Medio de solo lectura:** si la carpeta no es escribible, la app arranca en modo lectura con runtime temporal en el directorio temporal del sistema y lo comunica con claridad; los datos personales exigen medio escribible o ubicación alternativa elegida explícitamente.
3. **Tres versiones independientes:** `app_version` (semver del software), `corpus_version` (edición de la biblioteca) y `current_info_version` (información vigente). Actualizaciones manuales; nunca un actualizador conectado.
4. **Perfiles de salida:** `portable-personal` (app + corpus autorizado, USER_DATA vacío), `public-code` (repo publicable, sin corpus ni datos), `preservation-archive` (masters + procedencia, privado). Allowlists por asset y campo; la ausencia de dato deniega publicación; test negativo de fuga en cada release.

## Alternativas consideradas

- Instalador MSI/NSIS: rompe el requisito de no instalación y de no admin.
- Versión única para todo: un cambio de corpus forzaría "nueva app" y viceversa; imposible razonar sobre actualizaciones marginales.
- Un solo perfil con exclusiones ad hoc: las fugas de datos personales serían cuestión de tiempo; los perfiles con test negativo las hacen detectables.

## Consecuencias

La carpeta pesa (runtime incluido) y cada release exige construir y probar perfiles por separado; a cambio, portabilidad real y publicación sin miedo.

## Evidencia

Plan §3, §7, §8.5; criterio de terminado §4.1; REQ-P01–P09, REQ-I03, REQ-I07.
