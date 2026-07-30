# ADR-0005 — Integridad y recuperación: firma offline, BagIt, Doctor y FALLBACK independientes

**Fecha:** 2026-07-30
**Estado:** aceptada
**Ámbito:** integridad, autenticidad, diagnóstico y degradación

## Contexto

Auditoría 2.0, P0-1/P0-2/P0-6: el lector debe seguir ofreciendo salida útil si fallan Electron, SQLite o Kiwix; los hashes detectan pero no autentican ni recuperan; el diagnóstico no puede depender de la app que se está diagnosticando.

## Decisión

1. **Fixity:** SHA-256 de todos los archivos en manifiestos por edición.
2. **Autenticidad:** manifiesto superior firmado offline con Minisign (Ed25519). Clave privada fuera del repo y de la entrega; fingerprint conocido-bueno impreso en la guía de recuperación. Clave de prueba separada para CI; ceremonia de producción manual (la ejecuta Daniel con guía paso a paso; especificación en el bloque 16/20).
3. **Recuperación:** solo otra copia válida o redundancia explícita; dos copias completas verificadas en soportes distintos; BagIt para archivo/transferencia, construida una vez en RC, sin datos personales ni hashes autorreferentes.
4. **Doctor bootstrap independiente:** `Doctor.bat` diagnostica primero con CMD/PowerShell puros (estructura, firma, archivos críticos, espacio, permisos) sin ejecutar `Vestigio.exe`; el diagnóstico profundo es un segundo paso opcional.
5. **FALLBACK estático:** `CATALOGO.html`, `CATALOGO.csv`, núcleo de emergencia y guía de recuperación utilizables sin Electron, SQLite ni Kiwix, generados desde los mismos datos canónicos que la app (T09).

## Alternativas consideradas

- GPG en lugar de Minisign: más pesado, más superficie; Minisign es mínimo y auditable.
- Authenticode: solo si el binario se distribuye públicamente (P2, pospuesto).
- Paridad PAR2: endurecimiento P2 posterior, no condición de 1.0.
- Doctor dentro de la app: se diagnosticaría a sí mismo; inaceptable (P0-2).

## Consecuencias

Un paso manual de firma en cada release de producción y disciplina de copias; a cambio, T01–T04 del modelo de amenazas quedan mitigadas con pruebas.

## Evidencia

Plan §13, auditoría P0-1/2/6/11; `RECOVERY.md`; REQ-I01–I05, REQ-P04, REQ-P07.
