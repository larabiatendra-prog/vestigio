export {
  normalizarExacto,
  normalizarTolerante,
  quitarAcentosVocalicos,
  variantesTolerantes,
  textoParaIndiceTolerante,
  unirGuionesDeCorte,
  difierenSoloEnTildes,
} from './normalizar.js';
export {
  analizar,
  analizarSimple,
  analizarAvanzado,
  escaparTerminoFts,
  expresionFtsExacta,
  expresionFtsTolerante,
  expresionFtsTodas,
  MAX_LONGITUD_CONSULTA,
  MAX_TERMINOS,
  type ConsultaAnalizada,
  type ErrorConsulta,
  type ResultadoAnalisis,
  type TerminoConsulta,
} from './consulta.js';
export {
  DICCIONARIO,
  VERSION_DICCIONARIO,
  expandir,
  type EntradaDiccionario,
  type Expansion,
  type ResultadoExpansion,
  type TipoRelacion,
} from './sinonimos.js';
export {
  fusionarRrf,
  limitarPorOrigen,
  K_RRF,
  type Fusionable,
  type Fusionado,
  type ListaFusionable,
  type MotivoCoincidencia,
  type OrigenResultado,
} from './fusion.js';
export { sugerirErratas, distanciaEdicion, type SugerenciaErrata } from './erratas.js';
