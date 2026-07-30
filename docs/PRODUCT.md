# PRODUCT — Vestigio

Definición ejecutable del producto. Fuente: `PLAN_MAESTRO.md` §2, §5 y §12, con las enmiendas de `ENMIENDAS.md` aplicadas (mandan donde contradigan al plan).

## Qué es

Biblioteca técnica y práctica completamente offline para Windows 11 x64. Vive en una carpeta portable que arranca desde USB sin instalación, sin administrador y sin GPU (equipo objetivo: 8 GB RAM, 1366×768). Conserva documentos originales, los hace localizables con búsqueda tradicional excelente y ayuda a entender y hacer, no solo a encontrar.

**Propósito:** conservar el conocimiento más práctico, buscable, comprensible y aplicable para sobrevivir, aprender, construir y reconstruir en un contexto de degradación o colapso, sin dejar de resultar útil en la vida normal.

**Usuario:** una sola persona (Daniel). Sin cuentas, roles, nube ni sincronización.

## Qué no es

Ni Wikipedia (ni la incorpora), ni chatbot, ni RAG, ni modelo local, ni servidor doméstico, ni carpeta de PDF sin estructura. Fuera de alcance 1.0: IA en runtime, móvil/macOS/Linux, LAN, telemetría, OCR masivo, vídeo, cartografía interactiva, cifrado propio (ver `PLAN_MAESTRO.md` §2.5).

## Los cuatro modos

| Modo       | Qué ofrece                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| Biblioteca | Buscar, filtrar, abrir y navegar todos los formatos admitidos (PDF, EPUB, HTML, Markdown, TXT, ZIM, imágenes).    |
| Aprender   | Rutas de aprendizaje ordenadas con progreso personal.                                                             |
| Aplicar    | Procedimientos paso a paso, checklists reutilizables, materiales y herramientas.                                  |
| Emergencia | Interfaz simplificada con el núcleo crítico; accesible también sin la app (fallback estático y `EMERGENCIA.bat`). |

"Información vigente" es una sección separada y fechada, con caducidad editorial visible.

## Principios de producto (resumen operativo)

1. Offline real: ninguna consulta necesita red.
2. Original conservado: toda derivación apunta al documento original.
3. **La aplicación hace el trabajo pesado** (enmienda E1): ingesta automática en bloque, metadatos automáticos honestos, búsqueda excelente. La curación editorial humana se reserva al núcleo de emergencia y a las piezas imprimibles.
4. **Utilidad como único criterio de inclusión** (enmienda E4): ningún tema útil se excluye por incomodidad moral; lo sensible se contextualiza con riesgo, legalidad y límites visibles.
5. Confianza legible: lo que se sabe de un recurso se muestra; lo que no se sabe, se declara.
6. Degradación útil: si fallan app, índice o Kiwix, el catálogo, los originales y el núcleo de emergencia siguen accesibles.
7. Corpus cerrado en lectura; datos personales portables y recuperables.
8. Sin IA, sin telemetría, sin red en runtime.

## Ritmo de construcción

Hito rector (enmienda E2): **biblioteca usable cuanto antes** — esqueleto, ingesta, lectores y búsqueda antes que endurecimiento (firmas, BagIt, emergencia, diagnósticos). "No hay MVP" significa "no publicar prototipos como producto", no impedir el uso propio durante la construcción.

## Puertas de aceptación humanas

Daniel aprueba usabilidad, encontrabilidad y comprensión; la IA propone y prueba, no autoaprueba. Las puertas se ejecutan cuando existe algo real que probar (ver `UX_TEST_PLAN.md`).
