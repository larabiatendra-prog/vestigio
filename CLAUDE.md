# CLAUDE.md — Vestigio

## Qué es Vestigio

Biblioteca técnica y práctica completamente offline para Windows, portable en una carpeta (USB, sin administrador, sin instalación). Conserva documentos originales, los hace buscables sin IA y añade capas de aprendizaje, aplicación y emergencia. Lema: **el conocimiento que permanece**. Un solo usuario: Daniel.

## Documentos que mandan, en orden

1. `ENMIENDAS.md` — decisiones del propietario que **prevalecen sobre el plan** donde lo contradigan.
2. `PLAN_MAESTRO.md` — la especificación maestra (versión 2.0), fuente de todo lo no enmendado.
3. `PROJECT_STATE.md` — estado real del proyecto; leerlo antes de trabajar y actualizarlo al terminar.
4. `docs/` — especificaciones por área y ADR, según existan.
5. `C:\DEV\canon` — Canon, la fuente de verdad del ecosistema NODO (filosofía, línea gráfica El Páramo, patrones). Para lo visual manda `canon/linea-grafica`.

## Reglas permanentes

- Trabaja por bloques del plan, pero con **orden flexible** (enmienda E2): decide cuándo cerrar un bloque y cuándo solapar o adelantar. Prioriza el hito "biblioteca usable cuanto antes".
- Antes de cambiar nada: `git status` y examinar el código existente. Conserva cambios del propietario ajenos a tu tarea.
- No sustituyas una decisión del plan o de las enmiendas sin ADR, evidencia y aprobación de Daniel.
- Sin IA, RAG, embeddings, telemetría, cuentas, Docker ni dependencia de Internet en runtime. Internet sí durante desarrollo.
- Runtime final: Windows x64, portable, sin administrador, sin instalación previa, sin GPU, 8 GB RAM y 1366×768 como equipo objetivo.
- `CONTENT` es inmutable para la app lectora; `USER_DATA` es el único estado personal. Tres versiones independientes: aplicación, corpus e Información vigente.
- `FALLBACK` y el diagnóstico bootstrap no dependen de Electron, SQLite ni Kiwix.
- Sin rutas absolutas persistentes ni letras de unidad asumidas. Sin Node expuesto al renderer, sin navegación ni red externa.
- Curación **ligera** (enmienda E1): ingesta automática en bloque, metadatos automáticos honestos, esfuerzo editorial humano solo en el núcleo de emergencia e imprimibles.
- Inclusión de contenido por **utilidad** (enmienda E4): ningún tema útil se excluye por incomodidad moral; lo sensible se contextualiza, no se veta.
- No declares éxito sin ejecutar las pruebas. Una prueba fallida no se convierte en "pendiente": se corrige o se documenta un bloqueo real.
- Cambios pequeños y legibles, TypeScript estricto, errores accionables. Documentación y pruebas en el mismo cambio que el código.
- Nada de corpus, datos personales, secretos, claves de firma, builds ni archivos grandes en Git. Los tests de guardia (`tests/guard/`) lo vigilan.
- No autoapruebes puertas de UX o de contenido asignadas a Daniel: prepara la prueba, espera su resultado y regístralo.
- Daniel no es técnico en programación: explica en claro, sin jerga innecesaria. Textos y documentación en español, sin emojis.

## Al terminar una unidad de trabajo

1. Ejecuta lint, typecheck y las pruebas relevantes; da comandos y resultados reales.
2. Resume archivos tocados y decisiones tomadas.
3. Lista riesgos, deudas o bloqueos.
4. Actualiza `PROJECT_STATE.md` (y `docs/TRACEABILITY.md` cuando exista trazabilidad que mantener).
5. Deja un commit pequeño y coherente.

Si te bloquea una credencial, un permiso o una decisión del propietario, detente y explica exactamente qué falta. No improvises una alternativa que cambie el producto.
