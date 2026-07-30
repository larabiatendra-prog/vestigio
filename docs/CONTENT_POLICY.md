# CONTENT_POLICY — Política de contenido de Vestigio

Gobierna qué entra en la biblioteca y cómo se trata. Aplica las enmiendas E1 (curación ligera) y E4 (utilidad como criterio único), que prevalecen sobre `PLAN_MAESTRO.md` §10–11 donde contradigan.

## 1. Criterio de inclusión

**El único criterio es la utilidad: si un recurso merece consideración por ser útil, entra.**

- Ningún tema importante se excluye por contingencias morales. Sexualidad, armas, defensa, sustancias y otros temas sensibles se incluyen cuando son útiles.
- El tratamiento correcto de lo delicado es contexto visible — riesgo, legalidad, límites, "esto no sustituye atención profesional" — nunca la exclusión silenciosa. Las advertencias informan, no vetan.
- Se rechazan: escaneos ilegibles con alternativa mejor, duplicados sin justificar, y volumen por volumen (conocimiento antes que abundancia).

## 2. Cómo entra el contenido (curación ligera)

1. **Ingesta automática en bloque.** La herramienta administrativa acepta carpetas enteras y extrae sola: título, autor, idioma detectado, fecha, formato, hash, texto completo para el índice y propuestas de categorías/etiquetas.
2. **Metadatos honestos.** La ficha muestra lo extraído automáticamente y declara lo desconocido. Ningún campo editorial manual es obligatorio para entrar en la biblioteca.
3. **Enriquecimiento opcional.** Los ejes editoriales (autoridad, vigencia, consenso, geografía, dificultad, riesgo — `PLAN_MAESTRO.md` §8.4) existen y se muestran cuando se rellenan, pero son opcionales salvo en el núcleo crítico.
4. **Derechos con perfiles conservadores.** Cada recurso lleva una base simple: `open-redistributable`, `personal-preservation` o `unknown-blocked`. La ausencia de dato deniega publicación en el repositorio público; el uso personal se rige por la base documentada. Sin expedientes jurídicos por recurso.

## 3. El núcleo crítico: la excepción con rigor

El núcleo de emergencia y las piezas imprimibles (conjunto pequeño y finito) sí reciben curación completa:

- fuente canónica única para pantalla, fallback e impresión;
- protocolos oficiales conservados sin recomposición (sin síntesis procedimental crítica propia en 1.0);
- citas, fecha de revisión y claridad validada;
- advertencias visibles en contenido de alto riesgo sanitario.

## 4. Idiomas y geografía

- Predominio español; búsqueda que respeta `ñ`, tildes y grafías valencianas.
- Recursos en idioma extranjero: al menos título y etiquetas en español (resumen cuando el valor lo justifique; automático si es posible, marcado como tal).
- Prioridad de fuentes: Valencia → España → Europa → mundo (`PLAN_MAESTRO.md` §11.3). Una fuente mundial no reemplaza la instrucción local cuando importan clima, normativa, tensión o especies.

## 5. Cobertura

`content/coverage/capabilities-1.0.yml` lista los módulos M01–M12+MV y sus capacidades como **guía de qué conviene tener, no como puerta editorial**. Un módulo está cubierto cuando tiene material útil y localizable; los escenarios de demostración se reservan al núcleo crítico.

## 6. Información vigente

Datos con caducidad real (normativa, contactos, frecuencias, servicios) viven en la sección "Información vigente", fechados, con verificación y caducidad editorial visibles, y versionado propio (`current_info_version`).
