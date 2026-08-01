export {
  APPLICATION_ID_CONTENIDO,
  APPLICATION_ID_PERSONAL,
  MIGRACIONES_CONTENIDO,
  MIGRACIONES_PERSONAL,
  VERSION_ESQUEMA_CONTENIDO,
  VERSION_ESQUEMA_PERSONAL,
  type Migracion,
} from './esquemas.js';
export {
  abrirBasePersonal,
  abrirBaseContenido,
  cerrarBasePersonal,
  ErrorBaseDatos,
  type AperturaPersonal,
  type AperturaContenido,
} from './abrir.js';
export { migrar, versionEsquema } from './migrador.js';
export { comprobarIntegridad, type ResultadoIntegridad } from './integridad.js';
export { respaldarBasePersonal, type ResultadoRespaldo } from './respaldo.js';
export {
  RepositorioPersonal,
  esOperacionMutacion,
  type OperacionMutacion,
  type DestinoNota,
  type Favorito,
  type NotaPersonal,
  type Marcador,
  type Coleccion,
  type ItemColeccion,
  type ProgresoLectura,
  type Reciente,
  type EntradaPapelera,
} from './repositorio-personal.js';
export {
  crc32,
  escribirZip,
  leerZip,
  nombreEntradaValido,
  ErrorZip,
  LIMITES_POR_DEFECTO,
  type EntradaZip,
  type LimitesZip,
} from './zip.js';
export {
  volcarPersonal,
  aJson,
  aMarkdown,
  csvColecciones,
  csvFavoritos,
  csvMarcadores,
  csvNotas,
  csvProgreso,
  LEEME_PAQUETE,
  type ResolverRecurso,
  type VolcadoPersonal,
} from './exportar.js';
export {
  crearPaquetePersonal,
  inspeccionarPaquete,
  restaurarEspacioPersonal,
  ErrorPaquete,
  type Inspeccion,
  type Manifiesto,
  type ModoRestauracion,
  type ResultadoPaquete,
  type ResultadoRestauracion,
  type ResumenEspacio,
} from './paquete-personal.js';
export {
  RepositorioContenido,
  consultaLiteralFts,
  type RecursoResumen,
  type FichaRecurso,
  type SegmentoLectura,
  type Coincidencia,
  type Relacionado,
} from './repositorio-contenido.js';
export {
  construirCatalogoFixture,
  type AssetCanonico,
  type RecursoCanonico,
  type SegmentoCanonico,
  type VersionesCatalogo,
} from './fixture.js';
