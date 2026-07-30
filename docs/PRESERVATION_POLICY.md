# PRESERVATION_POLICY — Política de preservación

Aplicable y proporcionada a un archivo personal (enmienda E1: sin burocracia institucional vacía). Referencia de madurez: NDSA Levels of Digital Preservation v2.1 como objetivo orientativo, no como certificación.

## Comunidad designada

Daniel. Todo se documenta para que él (o quien herede el archivo) pueda entenderlo y reconstruirlo sin este chat, sin Internet y sin conocimientos de programación profundos.

## Qué se preserva

- **Originales/masters:** el archivo adquirido, intacto. Si no hay transformación preservacional, original y master son el mismo asset con dos roles; no se duplican archivos por ritual.
- **Derivados:** texto extraído, HTML saneado, miniaturas — reconstruibles, desechables, nunca sustituyen al original.
- **Metadatos y procedencia:** origen (URL, fecha de adquisición, hash), eventos de transformación con herramienta y versión, registrados de forma automática por la CLI durante la ingesta (E1: la máquina registra, el humano no rellena formularios).

## Propiedades significativas por formato (qué debe sobrevivir)

| Formato          | Debe conservarse                                               |
| ---------------- | -------------------------------------------------------------- |
| PDF              | Contenido visual y texto; el original manda sobre el derivado. |
| EPUB/HTML/MD/TXT | Texto, estructura de secciones, imágenes; sin scripts.         |
| ZIM              | El archivo intacto, verificado con `zimcheck`.                 |
| Imágenes         | Resolución original; alt editorial cuando exista.              |

## Copias y fixity

- Copia de trabajo + **dos copias completas verificadas** en soportes distintos, una normalmente desconectada.
- SHA-256 en manifiestos; verificación de fixity al construir ediciones, al copiar a un soporte nuevo y en revisiones periódicas (al menos anual).
- BagIt para la copia de archivo/transferencia, construida una sola vez en RC, sin datos personales ni hashes autorreferentes.

## Revisión y migración

- Revisión anual ligera: fixity de copias, estado de soportes, formatos en riesgo.
- Migración de formato solo cuando un formato quede en riesgo real; el original nunca se elimina al migrar.

## Qué NO es esta política

No implementa OAIS ni PREMIS XML completos; no promete recuperación sin copia válida; no convierte la ingesta diaria en catalogación manual.
