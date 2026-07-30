# ENMIENDAS al Plan Maestro de Vestigio

**Documento normativo.** Estas enmiendas fueron decididas y aprobadas por el propietario (Daniel) el 30 de julio de 2026, antes de iniciar la construcción. Donde una enmienda contradiga al `PLAN_MAESTRO.md` (versión 2.0), **la enmienda manda**. El plan maestro no se edita: se conserva íntegro como referencia y este documento registra qué cambia y por qué, siguiendo el mismo espíritu que las ADR.

---

## E1 — Curación ligera: la aplicación hace el trabajo pesado

**Sustituye o reinterpreta:** secciones 10 (política editorial), 11 (corpus y matriz de cobertura), 4.2 (criterio de contenido) y los bloques 04, 17 y 18 en lo relativo a curación por recurso.

**Decisión.** El plan 2.0 exigía una ficha editorial completa por cada recurso (procedencia, derechos, evaluación de confianza manual, resumen en español, riesgos, geografía, dificultad…). Ese modelo convierte al propietario en un catalogador a tiempo completo y queda descartado. En su lugar:

1. **Ingesta automática como corazón del producto.** La herramienta de administración acepta documentos en bloque (una carpeta entera) y extrae sola lo que puede: título, autor, idioma, fecha, formato, texto completo para el buscador y propuestas de categorías o etiquetas. Todo recurso ingerido queda inmediatamente buscable y legible.
2. **Metadatos honestos en vez de fichas artesanales.** La ficha de un recurso muestra lo que se sabe automáticamente (origen, fecha, formato, tamaño, idioma detectado) y declara lo que no se sabe. Ningún campo editorial manual es obligatorio para que un recurso entre en la biblioteca.
3. **El esfuerzo humano se reserva al núcleo crítico.** Solo el núcleo de emergencia y las piezas imprimibles (conjunto pequeño y finito) reciben curación editorial completa con el rigor del plan original: fuente canónica, claridad validada, citas y fecha de revisión.
4. **La cobertura se mide con ligereza.** La matriz de capacidades (`capabilities-1.0.yml`) sigue existiendo como guía de qué temas conviene tener, pero deja de ser una puerta que exige validación editorial recurso a recurso. Basta con que los módulos tengan material útil y localizable.

**Por qué.** El fuerte de Vestigio debe ser que la aplicación te lo pone fácil para navegar, buscar, acceder y consumir, sin un humano esclavizado curando documentos. El rigor editorial se concentra donde salva vidas; el resto lo resuelve una buena ingesta y una búsqueda excelente.

## E2 — Orden de bloques flexible

**Sustituye o reinterpreta:** sección 1 (reglas 1–3), sección 16 y el protocolo de la sección 17 en lo relativo a la secuencia estricta.

**Decisión.** Los 22 bloques dejan de ser una secuencia rígida con puertas cerradas. La IA constructora decide cuándo merece la pena cerrar un bloque por completo antes de avanzar y cuándo conviene reordenar, solapar o adelantar trabajo. Se mantienen los criterios de salida como definición de "terminado" de cada área, la regla de commits pequeños y coherentes, y la prohibición de convertir pruebas fallidas en "pendientes".

**Además**, se adopta como guía de ritmo el hito intermedio de **biblioteca usable cuanto antes**: esqueleto de la app, ingesta, lectores de PDF/HTML y búsqueda tienen prioridad sobre el endurecimiento (firmas, BagIt, modo emergencia, diagnósticos), que llega después. La regla "no hay MVP" del plan se entiende como "no publicar prototipos como producto", no como impedimento para que el propietario use su propia herramienta a medio construir.

## E3 — Estética: la línea gráfica de Canon manda

**Sustituye o reinterpreta:** la fila "Diseño" de la sección 3 y cualquier pasaje que defina una estética autónoma.

**Decisión.** Vestigio hereda la línea gráfica oficial del ecosistema NODO, **El Páramo** (definida en `C:\DEV\canon\linea-grafica`): base carbón/crema/oro/salvia, dos voces tipográficas (serif para contenido, mono con tracking para el chrome), oscuridad como modo primario, movimiento lento que respira, tokens semánticos en español, sin emojis como iconografía. La atmósfera propia del plan ("piedra, musgo, luz y silencio") se aplica como matiz temático sobre esa base, no como línea independiente.

## E4 — Utilidad como único criterio de inclusión

**Refuerza:** principio 5 de la sección 2.4 ("peligro contextualizado"). **Reinterpreta:** sección 10.6 (contenido de riesgo) para que no actúe como censura previa.

**Decisión.** Al construir la biblioteca, el único criterio de inclusión es si el recurso merece consideración por ser útil. Ningún tema importante se excluye por contingencias morales — sexualidad, armas y otros temas sensibles incluidos. El tratamiento correcto de un tema delicado es el que ya define el plan: contexto, riesgo, legalidad y límites explicados de forma visible, nunca la exclusión silenciosa. Las advertencias existen para informar, no para vetar.

---

## Registro

| Enmienda                        | Fecha      | Aprobada por |
| ------------------------------- | ---------- | ------------ |
| E1 Curación ligera              | 2026-07-30 | Daniel       |
| E2 Orden flexible               | 2026-07-30 | Daniel       |
| E3 Estética Canon / El Páramo   | 2026-07-30 | Daniel       |
| E4 Utilidad como criterio único | 2026-07-30 | Daniel       |
