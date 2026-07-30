# TESTING — Criterios de prueba de Vestigio

Convierte los presupuestos del plan (§9.4, §14) en criterios verificables. Una prueba fallida no se convierte en "pendiente".

## Pirámide

1. **Unitarias (Vitest):** normalización española, contratos de mensajes, resolución de rutas, guardias del repositorio.
2. **Integración:** SQLite real (contenido RO + personal RW), crash/reinicio del `utilityProcess`, arranque/cierre de Kiwix, migraciones con rollback.
3. **End-to-end (paquete real):** arranque portable, búsqueda→ficha→lectura, cierre seguro, BAT, red cero verificada a nivel de sistema operativo.
4. **Puertas humanas:** usabilidad, encontrabilidad y comprensión — las ejecuta Daniel (ver `UX_TEST_PLAN.md`).

## Presupuestos de rendimiento (equipo objetivo: 8 GB, sin GPU, 1366×768, SSD USB)

| Operación                              | Objetivo                                     |
| -------------------------------------- | -------------------------------------------- |
| Arranque en frío                       | ≤ 8 s (máx. documentado 12 s en medio lento) |
| UI interactiva tras arranque           | ≤ 3 s                                        |
| Emergencia desde app abierta           | ≤ 1 s                                        |
| Arranque frío `--emergency`            | ≤ 5 s                                        |
| Búsqueda SQLite p50                    | < 250 ms                                     |
| Primer resultado SQLite útil p95       | ≤ 750 ms                                     |
| Búsqueda SQLite completa p95           | ≤ 1,5 s                                      |
| Búsqueda combinada con Kiwix p95       | < 2,5 s                                      |
| Aplicar/quitar filtro                  | < 300 ms                                     |
| Abrir ficha                            | < 500 ms                                     |
| Memoria en reposo / con PDF típico     | < 600 MB / < 1,2 GB                          |
| Arranque respecto al tamaño del corpus | O(1), sin escaneo inicial                    |
| Reinicio del servicio de búsqueda      | ≤ 3 s o degradación accionable               |

Se validan con un corpus de escala representativa, no con cinco archivos.

## Búsqueda: umbrales congelados (del §9.4)

- 100 % top-1 en consultas críticas de recurso conocido.
- ≥ 90 % top-1 en el conjunto de recurso conocido.
- ≥ 95 % con al menos un resultado relevante en top-5.
- nDCG@10 ≥ 0,80 en exploratorias.
- Cada intención declara qué cuenta como fallo; ningún promedio oculta un fallo crítico.

El banco de consultas se construye en el bloque de búsqueda (09) con el corpus real; Daniel escribe o aprueba las críticas (≥ 30). Ajuste y evaluación final se separan. _(Aplazado desde Bloque 01 por E2: sin corpus ni buscador, un banco ahora sería ficción.)_

## Casos de contrato de normalización española (obligatorios desde el primer índice)

NFC/NFD, `año/ano`, `cañón/canon`, `pingüino/pinguino`, `protecció/proteccio`, `façana/facana`, `l·l/ll`, tildes, guiones de OCR, `RCP/DEA`, `230 V`, `1,5/1.5`, `%`, `°C`.

## Accesibilidad (WCAG 2.2 AA)

Teclado completo, foco visible y no oculto, nombres accesibles, contraste medido, reflow 400 %, `forced-colors`, targets 24×24 (44×44 en Emergencia), mensajes de estado accesibles, `prefers-reduced-motion`, Narrador en flujos críticos (NVDA como segunda comprobación). Vista textual accesible común para derivados de PDF/EPUB/HTML. El fallback estático y los PDF propios se auditan también.

## Matriz de fallos (resumen; detalle en §14.5 del plan)

Corrupción simulada de índice → se recupera sin perder originales ni datos personales. Corrupción de base personal → recuperación desde copia, sin reemplazo silencioso. Kiwix caído → biblioteca SQLite sigue. App rota → fallback estático utilizable. Todo con prueba automatizada o ensayo documentado antes de 1.0.
