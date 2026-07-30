# Seguridad — Vestigio

Vestigio es un producto personal offline. Aun así, su diseño de seguridad es explícito:

- La aplicación final no realiza conexiones externas: solo protocolos internos y el servidor Kiwix local ligado a `127.0.0.1`.
- El renderer de Electron no tiene acceso a Node; el contenido no confiable (PDF, EPUB, HTML, ZIM) se procesa con lectores aislados y saneado en construcción.
- SQLite y la búsqueda corren en un proceso de utilidad reiniciable con un único escritor.
- La integridad del paquete se verifica con SHA-256 y la autenticidad con firma offline (Minisign/Ed25519). La clave privada de firma nunca entra en este repositorio ni en la entrega.
- Este repositorio no contiene corpus, datos personales ni secretos; tests de guardia lo comprueban en CI.

## Reportar un problema

Si encuentras una vulnerabilidad, abre un issue en el repositorio o contacta con el propietario. No publiques detalles explotables antes de que exista una corrección.
