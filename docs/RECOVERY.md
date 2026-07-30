# RECOVERY — Política de recuperación

Principio rector (plan §2.4.12): **un hash detecta; una firma autentica; solo otra copia o redundancia suficiente permite recuperar.** La documentación nunca promete recuperar un soporte perdido o dañado sin otra copia válida.

## Capas de defensa

1. **Fixity:** SHA-256 de cada archivo en manifiestos; detección de corrupción, no recuperación.
2. **Autenticidad:** manifiesto superior firmado offline (Minisign/Ed25519); la clave privada nunca viaja con la entrega ni entra en el repo.
3. **Redundancia:** copia de trabajo + dos copias completas verificadas en soportes físicos distintos, una normalmente desconectada. BagIt para archivo/transferencia.
4. **Reconstruibilidad:** índices y derivados se regeneran desde originales + manifiestos con la herramienta administrativa; son desechables por diseño.

## Escenarios y respuesta

| Fallo                             | Respuesta                                                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Índice corrupto                   | Doctor lo detecta; se reconstruye desde originales; sin pérdida de originales ni datos personales.                    |
| Base personal corrupta            | Recuperación desde el backup más reciente; nunca reemplazo silencioso; se informa de qué se recuperó y de cuándo era. |
| App/Electron roto                 | `FALLBACK/CATALOGO.html`, `CATALOGO.csv`, núcleo de emergencia estático y guía TXT/PDF siguen utilizables.            |
| Kiwix roto                        | La biblioteca SQLite sigue funcionando; diagnóstico accionable.                                                       |
| Soporte USB dañado                | Otra copia válida; sin ella no hay promesa de recuperación.                                                           |
| Manifiesto sustituido / downgrade | La verificación de firma falla → no se confía en el paquete (ver `THREAT_MODEL.md`).                                  |

## Cierre seguro

"Cerrar y preparar para copiar/expulsar": termina escrituras, snapshot coherente con SQLite Backup API, cierra SQLite y Kiwix, y confirma cuándo no quedan archivos abiertos. Tras un cierre sucio, comprobaciones reforzadas antes de habilitar escritura.

## Reproducibilidades separadas (tres promesas distintas)

1. **Aplicación:** reconstruible desde el repositorio en máquina limpia siguiendo la documentación.
2. **Corpus:** reconstruible desde masters preservados + manifiestos + herramientas fijadas, sin Internet.
3. **Readquisición de Internet:** solo _best effort_; nunca se promete.
