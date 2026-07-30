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
  type Favorito,
  type NotaPersonal,
} from './repositorio-personal.js';
export {
  RepositorioContenido,
  consultaLiteralFts,
  type RecursoResumen,
  type FichaRecurso,
  type SegmentoLectura,
  type Coincidencia,
} from './repositorio-contenido.js';
export {
  construirCatalogoFixture,
  type AssetCanonico,
  type RecursoCanonico,
  type SegmentoCanonico,
  type VersionesCatalogo,
} from './fixture.js';
