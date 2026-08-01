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

---

## 1 de agosto de 2026 — De biblioteca que se lee a biblioteca en la que se trabaja

**Punto de partida:** una biblioteca que se busca y se lee, pero de la que no quedaba rastro de tu paso: ni un favorito en pantalla, ni una nota, ni memoria de por dónde ibas.
**Punto de llegada:** una aplicación con secciones, historial, ficha por documento, un lector que es el mismo para todos los formatos, y un espacio personal del que puedes sacar todo tu trabajo en un ZIP que se lee sin Vestigio.

Bloques 10, 11 y 12 del plan, cerrados en dos commits. 229 pruebas automáticas en verde, y el empaquetado de Windows reconstruido con sus siete ajustes de seguridad verificados sobre el binario.

### Lo que cambia al abrirlo

**Ya no hay una sola pantalla.** Arriba aparece una barra con Inicio, Biblioteca, Mi espacio y Sistema, migas de pan que dicen dónde estás, y flechas de atrás y adelante que funcionan como las de un navegador (también con `Alt` + flechas, y con los botones laterales del ratón si los tiene).

Lo importante de ese atrás es que **devuelve la pantalla exactamente como estaba**: la misma búsqueda escrita, los mismos filtros marcados, la misma posición de la página y el mismo botón enfocado. Eso no sale gratis: el estado de la búsqueda no vive en una variable suelta, sino dentro de cada entrada del historial, de modo que cada entrada se basta a sí misma para reconstruir lo que se veía.

**Inicio responde a "¿por dónde iba?".** Lecturas empezadas, lo que has guardado y lo que abriste hace poco. Con la biblioteca recién ingerida está casi vacío a propósito, y lo dice, en vez de rellenarse con documentos elegidos al azar.

**Cada documento tiene ficha.** Antes, pulsar un documento te metía directamente en el texto. Ahora puedes ver primero de qué se trata: autoría, publicación, idioma, temas, qué se pudo extraer del texto y qué significa eso, de dónde salió el fichero, su huella SHA-256 y qué permite su licencia. Bajo la enmienda E1 la ficha no rellena huecos: cuando algo no se sabe, lo dice con palabras — "no consta en el documento y nadie la ha declarado" — en lugar de poner un guion. Y avisa de lo que Vestigio no hace: nadie ha revisado editorialmente ese documento, así que júzgalo por lo que dice la ficha, no por estar en la biblioteca.

Al preparar esa ficha salió a la luz un hueco: la ingesta **ya extraía la autoría de los PDF y la tiraba** antes de guardarla. Arreglado.

**La biblioteca se ve en lista o en rejilla**, a elegir. Y los vacíos ahora distinguen dos cosas que antes se confundían: que no haya catálogo (falta pasar la ingesta) y que el catálogo exista pero esté vacío.

### El lector, uno solo para todo

Antes cada formato tenía su pantalla. Ahora hay un solo lector con la misma cabecera, el mismo índice, las mismas notas y los mismos botones, y lo único que cambia por debajo es la superficie que pinta el contenido.

- **Siempre sabes qué estás leyendo:** formato, edición del corpus y si eso es el original o un texto extraído de él. Un PDF escaneado avisa de que son imágenes y de que no se puede buscar dentro; una página web dice que estás viendo una versión saneada y qué se le quitó.
- **`Ctrl+F` funciona donde esperas**, con siguiente y anterior, `F3`, y `Escape` para salir — y al salir el foco vuelve al sitio del que venía. Busca con las mismas reglas que el buscador de la biblioteca: da igual escribir "deposito" o "depósito", pero la eñe hay que escribirla, porque es una letra y no una tilde. Que se comporte igual dentro y fuera es lo que evita pensar que el buscador está roto.
- **Puedes ajustar la lectura:** tamaño de letra, ancho de columna, interlineado, serif o palo seco, y una superficie clara tipo papel para textos largos. Todo se guarda con tus datos y hay un botón para volver a los valores de fábrica.
- **Copiar cita** deja en el portapapeles una referencia con la edición del corpus y la huella del original. Sin tocar la red: aquí los enlaces externos se copian o se explican, nunca se abren.

**Y recuerda por dónde ibas, con honestidad.** El progreso se guarda por un identificador estable de sección, más la página y un trozo del texto que estabas leyendo. Si algún día reconstruyes la edición y esa sección cambia de nombre, Vestigio busca ese texto, te lleva al sitio más parecido **y te dice que lo ha hecho así**. Y si no lo encuentra, admite que se ha perdido en vez de dejarte en un punto cualquiera fingiendo que es el tuyo.

### Mi espacio: tu trabajo, y la puerta para llevártelo

Favoritos, colecciones tuyas, notas pegadas a una sección o a una página concreta, marcadores. Las notas se buscan sin acertar con las tildes.

**Nada que borres desaparece de golpe.** Todo pasa por una papelera de la que se puede deshacer, incluida una colección entera con sus documentos dentro. Vaciarla es lo único definitivo, y lo dice.

**Y todo se puede sacar.** El botón de guardar una copia produce un ZIP normal y corriente, que se abre con el explorador de Windows, con dos cosas dentro: una copia exacta de tu base y esos mismos datos en texto plano — Markdown para leer, CSV para Excel, JSON por si acaso — con un LEEME que lo explica. El criterio que gobierna esa carpeta es duro: **tiene que seguir sirviéndote con Vestigio roto, borrado o inexistente**. Por eso las notas nombran su documento en vez de dejar un identificador ilegible.

Al revés, recuperar una copia **nunca toca tus datos hasta que lo dices**. El paquete se abre aparte, se comprueban el manifiesto, las huellas de cada fichero y la versión del esquema, y solo entonces se te ofrece añadirlo a lo que ya tienes o sustituirlo. Un paquete manipulado se rechaza explicando el motivo, y si la importación falla a mitad, lo tuyo se queda como estaba: entra entera o no entra.

El contenedor ZIP está escrito dentro del proyecto en vez de usar una librería. Suena a rueda reinventada, y la razón es concreta: ese fichero puede venir de cualquier sitio, así que las defensas tienen que estar a la vista y bajo prueba — nada de rutas absolutas ni de saltos fuera de la carpeta, topes de tamaño, control de bombas de descompresión y comprobación de que cada byte es el que dice ser.

**Antes de sacar el USB** hay un botón en Sistema que hace lo aburrido y necesario: copia de seguridad si hay algo nuevo, cerrar las bases, detener las colecciones y soltar todos los ficheros. Y avisa de lo que no es: esto no sustituye a la expulsión segura de Windows.

**Si el soporte es de solo lectura**, Vestigio no se calla ni finge. Puedes leer y buscar todo, y lo que apuntes vive en la memoria de esa sesión, marcado como tal en cada pantalla, con un botón para copiártelo al portapapeles antes de cerrar. Lo que nunca hace es prometer que lo guarda.

### Accesibilidad, no como añadido

Saltar al contenido con el teclado, foco siempre visible, botones de al menos 44 píxeles, el movimiento de El Páramo desactivado de verdad si el sistema pide menos animación, modo de contraste alto de Windows respetado, y resaltados que no dependen solo del color. Con la ventana pequeña o el zoom alto todo pasa a una columna en vez de cortarse.

### Dos cosas que decide Daniel

1. **La superficie clara de lectura.** El plan pide poder cambiar el tema al leer; El Páramo define la oscuridad como modo primario del ecosistema. La solución adoptada acota el conflicto: la aplicación entera sigue siendo El Páramo y solo la columna de texto puede ponerse en papel claro, como comodidad para textos largos. Queda señalado como posible contradicción con Canon: o se acepta como excepción documentada, o se quita la opción.

2. **Aprender, Aplicar, Emergencia e Información vigente no están en la barra.** El plan los coloca ahí, pero esos destinos los construyen los bloques 13, 14 y 15, y el criterio de salida del bloque 10 prohíbe entregar botones que no llevan a ningún sitio. Aparecerán cuando existan. Si prefieres verlos ya como anticipo de lo que viene, se pone.

### Lo que espera

Las **rondas R1 y R2** de pruebas de uso están escritas con sus tareas en `docs/UX_TEST_PLAN.md`, y son de Daniel: la IA prepara las tareas, no las aprueba. R1 es literalmente la puerta de salida del bloque 10 — hasta que no se haga, ese bloque no está cerrado del todo.

Después, o el bloque 07 (EPUB, si el corpus va a tener libros electrónicos: es el único formato importante que falta, y el lector ya está listo para recibirlo) o el bloque 13 (Aprender y Aplicar, que además trae los destinos que faltan en la barra).

---

_Escrito al cerrar la jornada del 1 de agosto de 2026._
