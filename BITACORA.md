# Bitácora de Vestigio

Registro cronológico del trabajo. Se escribe al cerrar cada jornada, en lenguaje llano: qué existe ahora, qué se decidió y por qué, y qué queda pendiente. Complementa a `PROJECT_STATE.md` (estado técnico) sin sustituirlo.

---

## 30 de julio de 2026 — Del plan a una biblioteca que funciona

**Punto de partida:** una carpeta con un único archivo, el plan maestro de 2.700 líneas.
**Punto de llegada:** una aplicación que arranca, guarda datos, se llena de documentos, los busca y los lee — incluidas colecciones ZIM enteras.

En números: 9 commits, 114 ficheros, unas 7.200 líneas de código propio y **101 pruebas automáticas**, todas en verde tanto en NODO como en el servidor de integración de GitHub.

Repositorio público: <https://github.com/larabiatendra-prog/vestigio>

### Lo primero: cambiar el plan antes de empezar

Antes de escribir una línea de código se registraron cuatro enmiendas al plan maestro (`ENMIENDAS.md`). Mandan sobre el plan allí donde lo contradigan, y las cuatro salieron de decisiones de Daniel:

- **E1 — Curación ligera.** El plan original exigía una ficha editorial completa por cada documento: procedencia, derechos, evaluación de confianza, resumen… Eso convertía al propietario en catalogador a tiempo completo. Se cambió el enfoque: **la aplicación hace el trabajo pesado**. Se le echa una carpeta y ella extrae lo que puede, declara lo que no sabe, y deja el esfuerzo humano solo para el núcleo de emergencia.
- **E2 — Orden flexible.** Los 22 bloques del plan dejan de ser una secuencia rígida. Se prioriza llegar cuanto antes a "una biblioteca que se pueda usar de verdad", y el endurecimiento (firmas, copias de archivo, diagnósticos) viene después.
- **E3 — Estética.** Vestigio hereda El Páramo, la línea gráfica oficial del ecosistema NODO, adaptada a su temática. No inventa una propia.
- **E4 — Utilidad como único criterio.** Entra lo que es útil. Ningún tema importante se excluye por incomodidad moral: lo delicado se contextualiza con su riesgo y sus límites, no se veta.

### Qué existe ahora, en orden de utilidad

**Una aplicación portable de escritorio.** Vive en una carpeta que se puede copiar a un USB; encuentra su propia raíz por un marcador (no por la letra de unidad, así que da igual si es D: o F:), escribe solo dentro de sus carpetas, y si el soporte es de solo lectura entra en modo consulta y lo dice. Probada arrancando desde una carpeta externa con espacios y eñes en el nombre.

**Una herramienta de ingesta que hace el trabajo aburrido.** `vestigio-admin ingerir <carpeta>` recorre una carpeta entera con sus subcarpetas, descarta duplicados exactos comparando el contenido (no el nombre), reconoce el formato por la firma binaria del archivo, extrae título, idioma y texto, copia los originales intactos, construye el catálogo buscable y escribe un manifiesto que permite detectar después si un solo byte ha cambiado.

**Lectura de documentos.** HTML, Markdown y TXT se limpian a fondo en la ingesta y se leen con índice lateral. Los PDF se leen con navegación por páginas y zoom, y se puede consultar su texto extraído (siempre marcado como extracción, nunca disfrazado de original).

**Búsqueda que lleva al sitio exacto.** Buscar "generador" abre la página 3 del manual; buscar "lejía" abre la sección concreta de la guía del agua. Distingue `cañón` de `canon` y respeta las tildes.

**Colecciones ZIM.** Wikis y enciclopedias temáticas enteras, consultables sin descomprimirlas, servidas por Kiwix como programa aparte.

**Datos personales que sobreviven.** Base propia separada del contenido, con copias de seguridad automáticas al cerrar. Todavía no se ven en pantalla (pendiente), pero ya se guardan.

### Las decisiones técnicas que más importan

Ocho decisiones quedaron registradas con su porqué y sus alternativas descartadas (`docs/adr/`). Las tres que más condicionan el futuro:

1. **Base de datos sin dependencias externas.** El plan pedía evaluar el SQLite que trae el propio Electron antes de recurrir a una librería de terceros. Se probó de verdad sobre el binario real: pasó las ocho comprobaciones (búsqueda de texto completo respetando la `ñ`, copias en caliente, solo lectura efectiva). Resultado: **cero dependencias nativas** que compilar o verificar.

2. **Todo aislado en compartimentos.** La ventana que ves no tiene acceso al disco ni a Internet. Los datos viven en un proceso aparte que puede caerse y reiniciarse sin arrastrar la aplicación, con la garantía de que **nunca hay dos procesos escribiendo a la vez**. Kiwix es otro proceso más, encerrado en su propio puerto.

3. **La seguridad se demuestra, no se promete.** El limpiador de HTML no "quita lo malo": reconstruye el documento desde cero dejando pasar solo lo autorizado. Tiene 21 pruebas que intentan colar scripts y trampas conocidas. Y el servidor de colecciones se verificó de verdad: **no responde desde la IP de la máquina en la red**, solo en local.

### Fallos reales encontrados y corregidos hoy

Merece la pena dejarlos escritos, porque son la prueba de que las comprobaciones sirven para algo:

- El **worker del lector de PDF** quedaba en una ruta que habría resuelto a la raíz del disco en la versión empaquetada. Habría fallado solo al abrir un PDF en el paquete final, nunca durante el desarrollo. Corregido y con prueba de guardia.
- El **HTML del servidor de colecciones** se colaba en los fragmentos de búsqueda por decodificar en el orden equivocado.
- El **catálogo de colecciones** contaba al autor y al editor como si fueran colecciones: decía "3 colecciones" habiendo una.
- Mi propia forma de encadenar comandos **enmascaraba los fallos del verificador de estilo**, y la integración continua se puso roja. Desde entonces se comprueban códigos de salida reales.

### Lo que quedó pendiente, con su sitio

Nada de esto está olvidado: todo está anotado en `PROJECT_STATE.md` con el bloque donde se hará.

- **Bloques por hacer:** 07 (EPUB e imágenes), 09 (fusión de los dos buscadores con filtros), 10–12 (biblioteca visual, notas y favoritos en pantalla), 13–15 (aprender, aplicar, emergencia), 16 (los .bat, el diagnóstico y la recuperación), 17–21 (corpus real, endurecimiento y versión 1.0).
- **Validadores externos de formato y OCR:** cuando haya corpus real que lo justifique.
- **Copia de archivo BagIt y firma del paquete:** bloques 20 y 16.

### Dos cosas que necesitan a Daniel

1. **Decisión sobre la firma del ejecutable.** Grabar los ajustes de seguridad de Electron rompe su firma digital, y el Control de aplicaciones de Windows 11 bloquea el `Vestigio.exe` empaquetado en NODO. No frena el desarrollo (el modo desarrollo usa el Electron firmado), pero antes de la 1.0 hay que elegir entre certificado propio, certificado comercial o convivir con el aviso. Las opciones están en `docs/TOOLCHAIN.md`.

2. **Primera ronda de pruebas de uso (R1).** La biblioteca ya es real, así que la prueba de "búscame esto y ábrelo" tiene sentido. La IA prepara las tareas; la valoración es de Daniel y se registra en `docs/UX_TEST_PLAN.md`.

### Cómo retomar

```
cd C:\DEV\vestigio
npm ci                                  # solo la primera vez tras clonar
npm run test                            # las 101 pruebas
cd apps\reader && npx electron-forge start   # abrir Vestigio
```

Para añadir documentos a la biblioteca de pruebas:

```
npm run -w @vestigio/admin-cli admin -- ingerir "<carpeta>" --salida "C:\DEV\vestigio\apps\reader\.portable-dev"
```

La carpeta `apps/reader/.portable-dev/` es la entrega de pruebas y no viaja en Git: contiene la biblioteca semilla, las herramientas de Kiwix y un ZIM de 72 MB prestado de WikiLocal solo como banco de pruebas. **Vestigio no incorpora Wikipedia**: eso es WikiLocal, proyecto aparte.

---

_Escrito al cerrar la jornada del 30 de julio de 2026._
