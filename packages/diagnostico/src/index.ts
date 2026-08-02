export {
  generarManifiesto,
  escribirManifiesto,
  verificarManifiesto,
  muestrearManifiesto,
  type Manifiesto,
  type ProblemaVerificacion,
  type ResultadoMuestreo,
} from './manifiesto.js';
export {
  diagnosticar,
  informeEnTexto,
  huellaInforme,
  type Comprobacion,
  type EstadoComprobacion,
  type InformeDoctor,
  type Muestreo,
  type NivelDoctor,
  type OpcionesDoctor,
  type Veredicto,
} from './doctor.js';
export {
  generarFallback,
  type OpcionesFallback,
  type RecursoFallback,
  type ResultadoFallback,
} from './fallback.js';
export {
  recuperarContenido,
  type OpcionesRecuperacion,
  type PlanRecuperacion,
  type ResultadoRecuperacion,
} from './recuperar.js';
