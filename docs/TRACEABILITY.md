# Trazabilidad — Vestigio

Registro de qué requisito del plan (o enmienda) se materializa en qué parte del repositorio. Una línea por elemento; se actualiza en el mismo cambio que el código. La matriz completa de requisitos con ID vive en `REQUIREMENTS.md`.

| Requisito                                  | Origen                              | Dónde se materializa                                               | Estado                   |
| ------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------ | ------------------------ |
| Repositorio gobernado por documentos       | PLAN_MAESTRO §1, Bloque 00          | `PLAN_MAESTRO.md`, `ENMIENDAS.md`, `CLAUDE.md`, `PROJECT_STATE.md` | hecho                    |
| Curación ligera e ingesta automática       | ENMIENDAS E1                        | `docs/CONTENT_POLICY.md` (política); implementación en bloques 04+ | política hecha           |
| Orden de bloques flexible                  | ENMIENDAS E2                        | `CLAUDE.md`, forma de trabajo                                      | hecho                    |
| Estética El Páramo de Canon                | ENMIENDAS E3                        | `docs/UX_REQUIREMENTS.md`; implementación en bloques de interfaz   | pendiente                |
| Utilidad como criterio de inclusión        | ENMIENDAS E4                        | `docs/CONTENT_POLICY.md` §1                                        | hecho                    |
| No corpus/datos personales/secretos en Git | PLAN_MAESTRO §15.1, Bloque 00       | `.gitignore`, `tests/guard/`                                       | hecho                    |
| Tooling reproducible con lockfile          | PLAN_MAESTRO §4.3                   | `package.json`, `package-lock.json`, CI                            | hecho                    |
| Acciones CI fijadas por SHA completo       | PLAN_MAESTRO §15.1                  | `.github/workflows/ci.yml`                                         | hecho                    |
| Definición ejecutable de producto          | PLAN_MAESTRO §2, §5, §12; Bloque 01 | `docs/PRODUCT.md`                                                  | hecho                    |
| Arquitectura vinculante                    | PLAN_MAESTRO §6–§9; Bloque 01       | `docs/ARCHITECTURE.md`, ADR-0001…0006                              | hecho                    |
| Criterios de prueba y presupuestos         | PLAN_MAESTRO §9.4, §14; Bloque 01   | `docs/TESTING.md`                                                  | hecho                    |
| Política de recuperación y preservación    | PLAN_MAESTRO §13; Bloque 01         | `docs/RECOVERY.md`, `docs/PRESERVATION_POLICY.md`                  | hecho                    |
| Modelo de amenazas con mitigación y prueba | Bloque 01                           | `docs/THREAT_MODEL.md` (T01–T12)                                   | hecho                    |
| Matriz de requisitos REQ-*                 | Bloque 01                           | `docs/REQUIREMENTS.md`                                             | hecho                    |
| Requisitos y plan de pruebas UX            | PLAN_MAESTRO §14; Bloque 01         | `docs/UX_REQUIREMENTS.md`, `docs/UX_TEST_PLAN.md` (rondas R1–R5)   | hecho; rondas pendientes |
| Matriz de capacidades congelada            | PLAN_MAESTRO §11; E1                | `content/coverage/capabilities-1.0.yml`                            | hecho                    |
| Contratos de datos preliminares            | PLAN_MAESTRO §8; Bloque 01          | `packages/contracts/` (tipos + schemas + tests ajv)                | hecho (preliminar)       |
| Patrón de emergencia e impresión           | Bloque 01 →aplazado                 | se redactará en el bloque 14 con los datos canónicos reales        | aplazado (E2)            |
| Banco de 100 consultas y tareas UX         | PLAN_MAESTRO §9.4 →aplazado         | se construye en bloque 09 con corpus real; Daniel aprueba críticas | aplazado (E2)            |
| Ceremonia de firma de producción           | PLAN_MAESTRO §13; ADR-0005          | especificación detallada en bloques 16/20                          | aplazado (E2)            |
