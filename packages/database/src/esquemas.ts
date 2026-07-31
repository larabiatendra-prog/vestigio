// Esquemas SQL de las dos bases (plan §8, adaptado por E1: nucleo lean ahora,
// las tablas editoriales pesadas llegan con la CLI administrativa que las
// construye). Cada base lleva application_id propio y user_version = version
// de esquema; el migrador aplica las migraciones en orden y en transaccion.

// 'VEST' y 'VUSR' como enteros de 32 bits.
export const APPLICATION_ID_CONTENIDO = 0x56455354;
export const APPLICATION_ID_PERSONAL = 0x56555352;

export interface Migracion {
  version: number;
  descripcion: string;
  sql: string;
}

// ---------------------------------------------------------------------------
// Base de contenido (solo lectura en la app; la construye la herramienta
// administrativa). El esquema vive aqui para que fixtures y CLI compartan
// una unica definicion.
//
// A diferencia de la base personal, este catalogo es un ARTEFACTO DE
// CONSTRUCCION: se regenera entero desde los originales en cada edicion.
// Por eso su esquema puede evolucionar en la migracion 1 mientras no haya
// una edicion publicada; los datos personales, anclados a UUID, no dependen
// de su forma interna.
// ---------------------------------------------------------------------------

export const MIGRACIONES_CONTENIDO: Migracion[] = [
  {
    version: 1,
    descripcion: 'nucleo del catalogo: recursos, assets, segmentos, FTS y metadata de release',
    sql: `
      -- UUID opacos como identidad externa; pk enteros como claves internas.
      CREATE TABLE recursos (
        pk INTEGER PRIMARY KEY,
        id TEXT NOT NULL UNIQUE,
        slug TEXT NOT NULL UNIQUE,
        titulo TEXT NOT NULL,
        idioma TEXT NOT NULL,
        formato TEXT NOT NULL CHECK (formato IN ('pdf','epub','html','markdown','txt','zim','imagen','audio')),
        derechos TEXT NOT NULL CHECK (derechos IN ('open-redistributable','personal-preservation','unknown-blocked')),
        autor TEXT,
        fecha_publicacion TEXT,
        resumen TEXT,
        -- Honestidad sobre el derivado (E1): que se pudo extraer y como.
        estado_texto TEXT NOT NULL DEFAULT 'desconocido',
        detalle_texto TEXT,
        num_paginas INTEGER,
        origen_url TEXT,
        origen_adquirido TEXT,
        origen_sha256 TEXT,
        creado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      -- Aliases historicos de slug: un slug puede cambiar; el UUID jamas.
      CREATE TABLE alias_slug (
        slug TEXT PRIMARY KEY,
        recurso_pk INTEGER NOT NULL REFERENCES recursos(pk),
        retirado TEXT
      );

      CREATE TABLE assets (
        pk INTEGER PRIMARY KEY,
        id TEXT NOT NULL UNIQUE,
        recurso_pk INTEGER NOT NULL REFERENCES recursos(pk),
        formato TEXT NOT NULL,
        ruta_logica TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        derivado_de_pk INTEGER REFERENCES assets(pk)
      );

      CREATE TABLE asset_roles (
        asset_pk INTEGER NOT NULL REFERENCES assets(pk),
        rol TEXT NOT NULL CHECK (rol IN ('source_original','preservation_master','access_derivative','text_derivative','thumbnail')),
        PRIMARY KEY (asset_pk, rol)
      );

      -- El cuerpo canonico vive aqui (para lectura y snippets); el indice
      -- FTS es de contenido externo sobre esta tabla.
      CREATE TABLE segmentos (
        pk INTEGER PRIMARY KEY,
        recurso_pk INTEGER NOT NULL REFERENCES recursos(pk),
        localizador TEXT NOT NULL,
        titulo TEXT,
        nivel INTEGER,
        cuerpo TEXT NOT NULL,
        -- Derivado de acceso saneado para el lector; null en PDF (se lee
        -- el original con PDF.js y esta el texto por pagina en 'cuerpo').
        html TEXT,
        pagina INTEGER,
        orden INTEGER NOT NULL,
        UNIQUE (recurso_pk, localizador)
      );

      -- Indice EXACTO: remove_diacritics 0 mantiene 'ñ', tildes y grafias
      -- valencianas. 'cañón' y 'canon' son palabras distintas aqui.
      CREATE VIRTUAL TABLE segmentos_fts USING fts5(
        titulo,
        cuerpo,
        content='segmentos',
        content_rowid='pk',
        tokenize='unicode61 remove_diacritics 0'
      );

      -- Indice TOLERANTE: el mismo texto sin acentos vocalicos (la 'ñ'
      -- sigue intacta) mas las variantes de grafia. Es contenido propio,
      -- no external content, porque guarda una version transformada.
      CREATE VIRTUAL TABLE segmentos_tolerante_fts USING fts5(
        titulo,
        cuerpo,
        tokenize='unicode61 remove_diacritics 0'
      );

      -- Titulos y resumenes de los recursos: el plan §9.1 exige que la
      -- busqueda encuentre "titulos y subtitulos", no solo el interior de
      -- los documentos. Se indexan aparte para poder darles mas peso.
      CREATE VIRTUAL TABLE recursos_fts USING fts5(
        titulo,
        resumen,
        tokenize='unicode61 remove_diacritics 0'
      );

      CREATE VIRTUAL TABLE recursos_tolerante_fts USING fts5(
        titulo,
        resumen,
        tokenize='unicode61 remove_diacritics 0'
      );

      -- Vocabulario real del corpus: es la unica fuente de las sugerencias
      -- de errata. Nunca se propone una palabra que no este indexada.
      CREATE VIRTUAL TABLE segmentos_vocabulario
        USING fts5vocab(segmentos_tolerante_fts, 'row');

      CREATE VIRTUAL TABLE recursos_vocabulario
        USING fts5vocab(recursos_tolerante_fts, 'row');

      CREATE TABLE etiquetas (
        pk INTEGER PRIMARY KEY,
        nombre TEXT NOT NULL UNIQUE
      );

      CREATE TABLE recurso_etiquetas (
        recurso_pk INTEGER NOT NULL REFERENCES recursos(pk),
        etiqueta_pk INTEGER NOT NULL REFERENCES etiquetas(pk),
        PRIMARY KEY (recurso_pk, etiqueta_pk)
      );

      CREATE TABLE recurso_modulos (
        recurso_pk INTEGER NOT NULL REFERENCES recursos(pk),
        modulo TEXT NOT NULL,
        PRIMARY KEY (recurso_pk, modulo)
      );

      -- Metadata de la release: las tres versiones independientes y el esquema.
      CREATE TABLE release_metadata (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
      );

      CREATE INDEX idx_assets_recurso ON assets(recurso_pk);
      CREATE INDEX idx_segmentos_recurso ON segmentos(recurso_pk);
    `,
  },
];

// ---------------------------------------------------------------------------
// Base personal (unico estado escribible; viaja con la carpeta).
// Ancla todo a UUID de recurso, nunca a pk internos ni rutas.
// ---------------------------------------------------------------------------

export const MIGRACIONES_PERSONAL: Migracion[] = [
  {
    version: 1,
    descripcion: 'estado personal: favoritos, colecciones, notas, progreso, sesion y mutaciones',
    sql: `
      CREATE TABLE favoritos (
        recurso_id TEXT PRIMARY KEY,
        creado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE colecciones (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        creada TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE coleccion_items (
        coleccion_id TEXT NOT NULL REFERENCES colecciones(id) ON DELETE CASCADE,
        recurso_id TEXT NOT NULL,
        orden INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (coleccion_id, recurso_id)
      );

      CREATE TABLE notas (
        id TEXT PRIMARY KEY,
        destino_tipo TEXT NOT NULL CHECK (destino_tipo IN ('recurso','segmento','pagina')),
        recurso_id TEXT NOT NULL,
        segmento TEXT,
        pagina INTEGER,
        texto TEXT NOT NULL,
        creada TEXT NOT NULL,
        modificada TEXT
      );

      CREATE TABLE marcadores (
        id TEXT PRIMARY KEY,
        recurso_id TEXT NOT NULL,
        localizador TEXT NOT NULL,
        creado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE progreso_lectura (
        recurso_id TEXT PRIMARY KEY,
        localizador TEXT,
        porcentaje REAL,
        actualizado TEXT NOT NULL
      );

      CREATE TABLE recientes (
        recurso_id TEXT PRIMARY KEY,
        visto TEXT NOT NULL
      );

      CREATE TABLE ajustes (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
      );

      -- Marca de cierre limpio: se pone 'no' al abrir y 'si' al cerrar bien.
      CREATE TABLE estado_sesion (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
      );

      -- Idempotencia persistente de mutaciones (ADR-0002): una mutacion cuya
      -- respuesta se perdio puede consultarse incluso tras reiniciar.
      CREATE TABLE mutaciones_aplicadas (
        id TEXT PRIMARY KEY,
        fecha TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE historial_migraciones (
        version INTEGER PRIMARY KEY,
        descripcion TEXT NOT NULL,
        fecha TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE historial_backups (
        fecha TEXT NOT NULL,
        ruta TEXT NOT NULL,
        resultado TEXT NOT NULL
      );

      CREATE INDEX idx_notas_recurso ON notas(recurso_id);
    `,
  },
  {
    version: 2,
    descripcion: 'espacio personal completo: notas editables, papelera, marcadores y progreso rico',
    sql: `
      -- Notas reconstruidas: destinos nuevos (ruta y procedimiento, que llegan
      -- con el bloque 13), contexto citado para relocalizar un anclaje perdido
      -- y texto normalizado para buscarlas sin tildes. El CHECK no se puede
      -- ampliar in situ en SQLite, asi que la tabla se rehace copiando.
      CREATE TABLE notas_nueva (
        id TEXT PRIMARY KEY,
        destino_tipo TEXT NOT NULL CHECK (destino_tipo IN ('recurso','segmento','pagina','ruta','procedimiento')),
        recurso_id TEXT NOT NULL,
        segmento TEXT,
        pagina INTEGER,
        -- Ancla libre para destinos que no son un punto del documento
        -- (una ruta de aprendizaje, un paso de un procedimiento).
        ancla TEXT,
        -- Fragmento citado al crear la nota: si el localizador desaparece
        -- tras reconstruir la edicion, esto permite decir donde estaba.
        contexto TEXT,
        texto TEXT NOT NULL,
        texto_norm TEXT NOT NULL DEFAULT '',
        creada TEXT NOT NULL,
        modificada TEXT
      );

      INSERT INTO notas_nueva (id, destino_tipo, recurso_id, segmento, pagina, texto, creada, modificada)
        SELECT id, destino_tipo, recurso_id, segmento, pagina, texto, creada, modificada FROM notas;

      DROP TABLE notas;
      ALTER TABLE notas_nueva RENAME TO notas;
      CREATE INDEX idx_notas_recurso ON notas(recurso_id);
      CREATE INDEX idx_notas_norm ON notas(texto_norm);

      -- Un mismo punto del documento no se marca dos veces; la etiqueta
      -- opcional es el nombre que le pone el lector.
      DELETE FROM marcadores WHERE rowid NOT IN (
        SELECT min(rowid) FROM marcadores GROUP BY recurso_id, localizador
      );
      ALTER TABLE marcadores ADD COLUMN etiqueta TEXT;
      CREATE UNIQUE INDEX idx_marcadores_ancla ON marcadores(recurso_id, localizador);

      -- Progreso: el localizador manda, pero se guarda ademas un fallback
      -- textual y la pagina para no perder el sitio si el ancla cambia.
      ALTER TABLE progreso_lectura ADD COLUMN pagina INTEGER;
      ALTER TABLE progreso_lectura ADD COLUMN fallback_texto TEXT;

      ALTER TABLE colecciones ADD COLUMN descripcion TEXT;
      ALTER TABLE colecciones ADD COLUMN modificada TEXT;
      ALTER TABLE coleccion_items ADD COLUMN anadido TEXT;

      ALTER TABLE recientes ADD COLUMN localizador TEXT;

      -- Papelera: borrar algo personal nunca es definitivo en el acto. Lo
      -- borrado se guarda entero (JSON) hasta que se vacia a proposito.
      CREATE TABLE papelera (
        id TEXT PRIMARY KEY,
        tipo TEXT NOT NULL CHECK (tipo IN ('nota','marcador','favorito','coleccion','coleccion-item')),
        descripcion TEXT NOT NULL,
        carga TEXT NOT NULL,
        borrado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE INDEX idx_papelera_borrado ON papelera(borrado);
    `,
  },
];

export const VERSION_ESQUEMA_PERSONAL = MIGRACIONES_PERSONAL.length;
export const VERSION_ESQUEMA_CONTENIDO = MIGRACIONES_CONTENIDO.length;
