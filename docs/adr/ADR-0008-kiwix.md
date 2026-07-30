# ADR-0008 — Kiwix: proceso separado, origen exacto y visor sin puente

**Fecha:** 2026-07-30
**Estado:** aceptada
**Ámbito:** colecciones ZIM (bloque 08)

## Contexto

Las colecciones ZIM (guías, wikis temáticas, manuales) son la única parte del corpus que no se puede indexar con el pipeline propio: vienen empaquetadas y se consultan a través de `kiwix-serve`, un servidor HTTP de terceros. Meter un servidor HTTP dentro de una aplicación que promete "cero red" exige cuidado: el riesgo real no es teórico, es que un servicio local quede escuchando donde no debe o que el visor de artículos se convierta en un puente hacia el resto de la aplicación.

## Decisión

1. **Binario de terceros fijado:** `kiwix-serve` de kiwix-tools **3.8.1** (libkiwix 14.1.1, libzim 9.4.0), GPLv3, Windows x64. Vive en `TOOLS/kiwix/` de la entrega, con sus DLL de ICU y sus avisos de licencia. **No se enlaza ni se modifica**: se lanza como programa separado.
2. **Solo loopback, puerto propio:** arranque con `--address=127.0.0.1` (nunca `0.0.0.0`), puerto dinámico en el rango 41800–41899, `--blockexternal` y `--attachToProcess=<pid de Vestigio>` para que no sobreviva a la aplicación.
3. **Health-check de identidad, no de puerto:** la secuencia es _spawn → proceso vivo → el catálogo OPDS responde con nuestras colecciones → aceptar_. Que "algo" conteste en el puerto no basta; si responde otro servicio, se cierra y se reintenta con otro puerto (hasta 6 veces).
4. **El main es el único cliente HTTP.** El renderer y el servicio de datos no tienen red. Toda petición se valida contra el **origen exacto** (`http://127.0.0.1:<puerto propio>`): no vale "cualquier 127.0.0.1", ni `localhost`, ni otro puerto.
5. **Solo la API pública documentada:** `/catalog/v2/entries` para identidad y `/search?...&format=xml` (OpenSearch) para buscar. Test contractual con una respuesta real capturada: si una versión futura cambia el formato, falla la prueba y se bloquea la actualización en lugar de romperse en producción.
6. **Visor sin puente:** los artículos se muestran en un `WebContentsView` con sesión efímera propia, `sandbox`, sin preload, sin IPC, **con JavaScript desactivado**, permisos y descargas denegados, y una allowlist de red que solo admite el origen propio.
7. **Degradación honesta:** sin binario, sin ZIM o con Kiwix caído, la biblioteca funciona igual. El estado se muestra en la sala de máquinas con palabras claras, no como error.

## Alternativas consideradas

- **libzim embebido en el proceso:** evitaría el HTTP, pero añade una dependencia nativa que compilar y verificar, y perdería el visor y el buscador ya maduros de Kiwix. Reconsiderable si el servidor da problemas.
- **Permitir todo loopback en la allowlist:** más simple, pero dejaría al visor hablar con cualquier servicio local del equipo. Descartado.
- **Extraer los ZIM a disco:** multiplicaría el espacio y rompería la integridad del archivo original. El plan lo prohíbe explícitamente.

## Consecuencias

Un proceso más que supervisar y un binario de terceros en la cadena de integridad (se verificará con el manifiesto firmado, bloques 16/20). A cambio, colecciones enormes consultables sin extraerlas y sin exponer nada fuera del equipo.

## Nota sobre el contenido

Vestigio **no incluye Wikipedia** (plan §2.5): esa es la función de WikiLocal, proyecto aparte del ecosistema. El ZIM de Wikipedia usado durante el desarrollo es solo un fixture de pruebas prestado de WikiLocal; qué colecciones entran en el corpus real es decisión editorial de Daniel.

## Evidencia

Verificado en NODO el 2026-07-30: el servidor ligado a 127.0.0.1 **no responde desde la IP de la máquina en la red** (timeout), mientras responde en loopback. `/search?format=xml` devuelve OpenSearch RSS con 706 resultados para "clima" sobre un ZIM real de 72 MB.
