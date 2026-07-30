// Contratos de datos de Vestigio — preliminares del Bloque 01.
// Los JSON Schemas de `schemas/` son la forma validable; estos tipos son su
// espejo TypeScript. Se amplían en los bloques 03+ junto a las tablas reales.

/** Las tres versiones independientes de la entrega (ADR-0004). */
export interface VersionesEntrega {
  app: string;
  corpus: string;
  informacionVigente: string;
}

/** Base de derechos con perfiles conservadores (CONTENT_POLICY §2.4). */
export type BaseDerechos = 'open-redistributable' | 'personal-preservation' | 'unknown-blocked';

/** Roles que puede cumplir un asset (plan §8.2). */
export type RolAsset =
  'source_original' | 'preservation_master' | 'access_derivative' | 'text_derivative' | 'thumbnail';

export type FormatoAdmitido =
  'pdf' | 'epub' | 'html' | 'markdown' | 'txt' | 'zim' | 'imagen' | 'audio';

/** Ejes editoriales opcionales (plan §8.4; opcionales por E1 salvo núcleo). */
export interface EjesEditoriales {
  autoridad?: 'desconocida' | 'comunitaria' | 'profesional' | 'academica' | 'organismo';
  vigencia?: 'actual' | 'necesita-revision' | 'historica-util' | 'desconocida';
  consenso?: 'no-aplica' | 'discutido' | 'emergente' | 'mixto' | 'amplio' | 'establecido';
  trazabilidad?: 'insuficiente' | 'parcial' | 'completa';
  dificultad?: 'sin-previos' | 'basica' | 'tecnica' | 'especialista';
  riesgo?: 'bajo' | 'moderado' | 'alto' | 'critico';
}

/** Un asset concreto: el original o un derivado. */
export interface Asset {
  id: string; // UUID opaco e inmutable
  roles: RolAsset[];
  formato: FormatoAdmitido;
  rutaLogica: string; // relativa a la edición, nunca absoluta
  bytes: number;
  sha256: string;
  derivadoDe?: string; // UUID del asset origen si es derivado
}

/**
 * Recurso del catálogo con metadatos honestos (E1): lo no extraíble
 * simplemente falta; ningún campo editorial manual es obligatorio.
 */
export interface Recurso {
  id: string; // UUID opaco e inmutable
  slug: string; // alias humano mutable, nunca clave
  titulo: string;
  idioma: string; // BCP 47, p. ej. "es", "ca-ES-valencia"
  formato: FormatoAdmitido;
  derechos: BaseDerechos;
  modulos: string[]; // M01–M12, MV
  autor?: string;
  fechaPublicacion?: string; // ISO 8601, tan precisa como se conozca
  resumen?: string;
  etiquetas?: string[];
  geografia?: string[];
  ejes?: EjesEditoriales;
  origen?: { url?: string; adquirido: string; sha256: string };
  advertencias?: string[];
  assets: Asset[];
}

/** Consulta de búsqueda del usuario (plan §9). */
export interface ConsultaBusqueda {
  texto: string;
  filtros?: {
    modulos?: string[];
    formatos?: FormatoAdmitido[];
    idiomas?: string[];
    geografia?: string[];
    riesgoMaximo?: EjesEditoriales['riesgo'];
  };
  limite?: number;
  incluirZim?: boolean;
}

export type OrigenResultado = 'catalogo' | 'zim';

/** Por qué apareció un resultado (plan §9.2: el usuario puede verlo). */
export type MotivoCoincidencia = 'exacta' | 'sin-tilde' | 'alias' | 'aproximada';

export interface ResultadoBusqueda {
  origen: OrigenResultado;
  recursoId?: string; // UUID si es del catálogo
  coleccionZim?: string; // nombre de la colección si es ZIM
  titulo: string;
  snippet?: string;
  localizador?: string; // página, sección o ruta interna ZIM
  motivo: MotivoCoincidencia;
  puntuacion: number;
}

/** Dónde se ancla una nota personal (ADR-0006: ancladas, no resaltado). */
export type DestinoNota =
  | { tipo: 'recurso'; recursoId: string }
  | { tipo: 'segmento'; recursoId: string; segmento: string }
  | { tipo: 'pagina'; recursoId: string; pagina: number };

export interface Nota {
  id: string;
  destino: DestinoNota;
  texto: string;
  creada: string; // ISO 8601 UTC
  modificada?: string;
}

/** Metadatos de una release firmada (ADR-0005). */
export interface Release {
  versiones: VersionesEntrega;
  fecha: string; // ISO 8601
  esquema: number; // versión del esquema de datos
  manifiestoSha256: string;
  firmaMinisign?: string; // presente en releases de producción
}
