# UX_TEST_PLAN — Plan de pruebas de experiencia

Las puertas humanas se ejecutan **cuando existe algo real que probar** (enmienda E2); prepararlas antes sería teatro. Este plan fija qué se probará y cómo se registra; las fechas se añaden al ejecutar.

## Método

- Tareas reales sin guía: se le da a Daniel un objetivo ("encuentra cómo desinfectar agua con lejía"), no una ruta de clics.
- Se registra: tarea, éxito/fracaso, tiempo aproximado, dónde se atascó, verbatim de confusión.
- Fracaso de una tarea crítica = defecto a corregir, no "feedback".

## Rondas previstas

| Ronda                 | Cuándo                                  | Qué valida                                                               | Estado                              |
| --------------------- | --------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------- |
| R1 Biblioteca usable  | primer hito usable (búsqueda + lectura) | encontrar, filtrar, abrir, leer; primeras impresiones de la línea visual | **lista para ejecutar** (ver abajo) |
| R2 Datos personales   | tras notas/colecciones/progreso         | anclar notas, retomar lectura, backup y restauración                     | **lista para ejecutar** (ver abajo) |
| R3 Aprender y Aplicar | tras rutas y procedimientos             | seguir una ruta, ejecutar un procedimiento y checklist                   | pendiente                           |
| R4 Emergencia         | tras modo emergencia y fallback         | llegar al contenido crítico con estrés de tiempo, también sin app        | pendiente                           |
| R5 Aceptación final   | release candidate                       | tareas de la lista final del plan §19, en equipo objetivo y sin Internet | pendiente                           |

## Ronda R1 — Biblioteca usable (preparada tras el bloque 10)

Tareas neutrales para Daniel. **No las ejecuta ni las aprueba Claude**: se le entregan, él las hace sin ayuda y el resultado se anota abajo. Un fracaso en una tarea crítica es un defecto que se corrige antes de cerrar el bloque 10.

Antes de empezar: arrancar con `npm start` en `apps/reader` sobre la entrega de desarrollo, sin que nadie explique la interfaz.

| #   | Tarea (objetivo, no ruta)                                                               | Crítica | Qué se observa                                                |
| --- | --------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------- |
| 1   | Busca algo que sabes que está en la biblioteca y ábrelo por donde lo menciona           | sí      | tiempo hasta el texto correcto; si usa el buscador o la lista |
| 2   | Averigua de dónde salió ese documento y si es de fiar                                   | sí      | si encuentra la ficha; si entiende "conservación personal"    |
| 3   | Deja solo los documentos en español y en PDF, y vuelve al resultado que estabas mirando | sí      | si usa los chips; si al volver atrás está todo como lo dejó   |
| 4   | Explora un tema del que no sabes el título exacto                                       | no      | si prueba la rejilla; si los vecinos temáticos le sirven      |
| 5   | Cambia entre lista y rejilla y di cuál prefieres para tu forma de buscar                | no      | preferencia y por qué                                         |
| 6   | Con la ventana a 1366×768 y el zoom de Windows al 150 %, repite la tarea 1              | sí      | si algo se corta, se solapa o exige scroll horizontal         |
| 7   | Haz la tarea 1 sin tocar el ratón                                                       | sí      | si el foco se ve siempre; si "saltar al contenido" aparece    |
| 8   | Busca algo que no existe y cuenta qué crees que ha pasado                               | no      | si el vacío se entiende y sugiere salida                      |

Comprobaciones técnicas que acompañan a la ronda (las hace quien asista, no sustituyen a las tareas): Narrador leyendo la ficha de principio a fin, Accessibility Insights sin fallos de contraste ni de nombre accesible, y modo de contraste alto de Windows activado durante la tarea 1.

## Ronda R2 — Datos personales (preparada tras los bloques 11 y 12)

| #   | Tarea                                                                                      | Crítica | Qué se observa                                                    |
| --- | ------------------------------------------------------------------------------------------ | ------- | ----------------------------------------------------------------- |
| 1   | Deja anotado, dentro de un documento, algo que quieras recordar de una sección concreta    | sí      | si encuentra dónde anotar; si entiende a qué queda pegada la nota |
| 2   | Cierra el documento, vuelve mañana y retoma la lectura donde la dejaste                    | sí      | si "Seguir leyendo" en Inicio le resulta evidente                 |
| 3   | Agrupa tres documentos en una lista tuya y ponle nombre                                    | no      | si distingue tus colecciones de las colecciones ZIM               |
| 4   | Encuentra una nota que escribiste hace tiempo sin recordar en qué documento estaba         | sí      | si usa la búsqueda de notas de Mi espacio                         |
| 5   | Borra una nota y arrepiéntete                                                              | sí      | si encuentra la papelera sin ayuda                                |
| 6   | Guarda una copia de todo lo tuyo y ábrela fuera de Vestigio (Bloc de notas o Excel)        | sí      | si el paquete se entiende sin explicación; si el LEEME sirve      |
| 7   | Recupera esa copia en una entrega distinta y di si falta algo                              | sí      | si entiende la diferencia entre "añadir" y "sustituir"            |
| 8   | Prepara la carpeta para llevártela en un USB                                               | sí      | si queda claro que no sustituye a la expulsión segura de Windows  |
| 9   | Cambia el tamaño de letra y el ancho de línea a lo que te resulte cómodo, y luego deshazlo | no      | si "volver a los valores de fábrica" se encuentra                 |
| 10  | Busca una palabra dentro de un documento largo y ve saltando entre las apariciones         | no      | si prueba Ctrl+F por costumbre; si sabe volver a donde estaba     |

## Consultas críticas de búsqueda

Con el buscador real (bloque 09), Daniel escribe o aprueba ≥ 30 consultas críticas con su resultado esperado; se congelan como banco de evaluación (umbral en `TESTING.md`). Registro aquí al ejecutarse.

## Registro de resultados

| Fecha | Ronda | Resultado | Acciones derivadas |
| ----- | ----- | --------- | ------------------ |
| —     | —     | —         | —                  |
