// Las tres versiones independientes de la entrega (ADR-0004).
// corpus e informacion vigente llegaran del RELEASE.json de la entrega;
// hasta que exista una edicion real se muestran como no disponibles.

export interface VersionesVisibles {
  app: string;
  corpus: string | null;
  informacionVigente: string | null;
}

export const VERSION_APP = '0.1.0';
