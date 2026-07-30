# Trazabilidad — Vestigio

Registro de qué requisito del plan (o enmienda) se materializa en qué parte del repositorio. Una línea por elemento; se actualiza en el mismo cambio que el código.

| Requisito                                  | Origen                        | Dónde se materializa                                               | Estado    |
| ------------------------------------------ | ----------------------------- | ------------------------------------------------------------------ | --------- |
| Repositorio gobernado por documentos       | PLAN_MAESTRO §1, Bloque 00    | `PLAN_MAESTRO.md`, `ENMIENDAS.md`, `CLAUDE.md`, `PROJECT_STATE.md` | hecho     |
| Curación ligera e ingesta automática       | ENMIENDAS E1                  | pendiente (herramienta de administración, bloques 04+)             | pendiente |
| Orden de bloques flexible                  | ENMIENDAS E2                  | `CLAUDE.md`, forma de trabajo                                      | hecho     |
| Estética El Páramo de Canon                | ENMIENDAS E3                  | pendiente (bloques de interfaz)                                    | pendiente |
| Utilidad como criterio de inclusión        | ENMIENDAS E4                  | pendiente (`docs/CONTENT_POLICY.md`, Bloque 01)                    | pendiente |
| No corpus/datos personales/secretos en Git | PLAN_MAESTRO §15.1, Bloque 00 | `.gitignore`, `tests/guard/`                                       | hecho     |
| Tooling reproducible con lockfile          | PLAN_MAESTRO §4.3             | `package.json`, `package-lock.json`, CI                            | hecho     |
| Acciones CI fijadas por SHA completo       | PLAN_MAESTRO §15.1            | `.github/workflows/ci.yml`                                         | hecho     |
