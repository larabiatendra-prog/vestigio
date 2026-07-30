# UX_REQUIREMENTS — Requisitos de experiencia

Contrato de experiencia de usuario. La navegación detallada vive en `PLAN_MAESTRO.md` §5; la estética la gobierna la enmienda E3 (línea El Páramo de Canon, `C:\DEV\canon\linea-grafica`, adaptada a la atmósfera "piedra, musgo, luz y silencio").

## Flujos que deben funcionar de principio a fin

1. **Buscar:** escribir → resultados con origen visible (documento local / ZIM) → filtrar → abrir ficha → leer en la sección/página exacta.
2. **Explorar:** entrar sin consulta → navegación por módulos/categorías → ficha → lectura.
3. **Aprender:** elegir ruta → avanzar con progreso guardado → retomar donde se dejó.
4. **Aplicar:** abrir procedimiento → seguir pasos → ejecutar checklist → registrar práctica.
5. **Emergencia:** llegar al contenido crítico en ≤ 1 s desde la app abierta; también sin app (`EMERGENCIA.bat`, fallback estático).
6. **Datos personales:** favoritos, colecciones, notas ancladas, progreso — sobreviven a cierre, cambio de letra de unidad y actualización manual.
7. **Cierre seguro:** "Cerrar y preparar para copiar/expulsar" con confirmación clara de cuándo es seguro extraer.

## Principios de interfaz

- Español, con voz propia (el texto de la interfaz es diseño — principio de Canon).
- Estados honestos: cargando, vacío, sin resultados (con tres salidas útiles), error accionable, degradado (Kiwix caído ≠ app rota).
- Nada se corrige en silencio: erratas como sugerencia visible ("Quizá quisiste decir…"), nunca sustitución, sobre todo en temas de riesgo.
- Origen y confianza visibles, no incrustados en el ranking.
- Filtros combinables que muestran su efecto y se quitan con un gesto.
- Oscuridad como modo primario; `prefers-reduced-motion` respetado; accesibilidad según `TESTING.md`.
- Emergencia: interfaz realmente simplificada — targets grandes (44×44), pasos primero, contexto después.

## Puertas de aceptación de Daniel

Daniel valida con tareas reales (no con demos guiadas): encontrar un recurso concreto, resolver una duda práctica, seguir un procedimiento, llegar al núcleo de emergencia. La IA prepara las pruebas y registra resultados; no las autoaprueba. Detalle y calendario en `UX_TEST_PLAN.md`.
