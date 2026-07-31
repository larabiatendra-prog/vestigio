// Diccionario explicito y versionado (plan §9.2, bloque 09 t.4).
//
// Reglas de esta tabla:
//  - Es EXPLICITA: nada se infiere ni se aprende. Lo que no esta aqui, no
//    se expande.
//  - Es VISIBLE: la interfaz muestra que expansiones se aplicaron.
//  - Es DESACTIVABLE: quien busca puede exigir literalidad.
//  - Los terminos de riesgo (dosis, farmacos, tension electrica) NO se
//    expanden: en medicina o electricidad, "casi lo mismo" mata.

export const VERSION_DICCIONARIO = '2026-07-31';

export type TipoRelacion = 'sigla' | 'sinonimo' | 'variante-regional' | 'extranjero';

export interface EntradaDiccionario {
  /** Forma canonica en minusculas y sin acentos (capa tolerante). */
  termino: string;
  equivalentes: string[];
  tipo: TipoRelacion;
}

/**
 * Semilla del diccionario. Crece con el corpus real; cada entrada nueva
 * debe poder justificarse ante Daniel.
 */
export const DICCIONARIO: EntradaDiccionario[] = [
  // Siglas de emergencia y salud
  { termino: 'rcp', equivalentes: ['reanimacion cardiopulmonar'], tipo: 'sigla' },
  { termino: 'dea', equivalentes: ['desfibrilador'], tipo: 'sigla' },
  { termino: 'dva', equivalentes: ['desfibrilador'], tipo: 'sigla' },
  { termino: 'epi', equivalentes: ['equipo de proteccion individual'], tipo: 'sigla' },
  { termino: 'sem', equivalentes: ['servicio de emergencias medicas'], tipo: 'sigla' },

  // Organismos que Daniel usara a diario
  { termino: 'aemet', equivalentes: ['agencia estatal de meteorologia'], tipo: 'sigla' },
  { termino: 'ign', equivalentes: ['instituto geografico nacional'], tipo: 'sigla' },
  { termino: 'gva', equivalentes: ['generalitat valenciana'], tipo: 'sigla' },

  // Agua y saneamiento
  { termino: 'lejia', equivalentes: ['hipoclorito', 'hipoclorito sodico'], tipo: 'sinonimo' },
  { termino: 'potabilizar', equivalentes: ['potabilizacion', 'hacer potable'], tipo: 'sinonimo' },
  { termino: 'depuradora', equivalentes: ['edar'], tipo: 'sinonimo' },

  // Energia y electricidad (terminologia, nunca magnitudes)
  { termino: 'placa solar', equivalentes: ['panel solar', 'fotovoltaico'], tipo: 'sinonimo' },
  { termino: 'grupo electrogeno', equivalentes: ['generador'], tipo: 'sinonimo' },

  // Variantes regionales y valenciano
  { termino: 'patata', equivalentes: ['papa'], tipo: 'variante-regional' },
  { termino: 'judia', equivalentes: ['alubia', 'frijol', 'habichuela'], tipo: 'variante-regional' },
  { termino: 'aigua', equivalentes: ['agua'], tipo: 'variante-regional' },
  { termino: 'foc', equivalentes: ['fuego'], tipo: 'variante-regional' },
  { termino: 'incendi', equivalentes: ['incendio'], tipo: 'variante-regional' },

  // Terminos extranjeros de uso comun en manuales tecnicos
  { termino: 'first aid', equivalentes: ['primeros auxilios'], tipo: 'extranjero' },
  { termino: 'shelter', equivalentes: ['refugio'], tipo: 'extranjero' },
  { termino: 'water purification', equivalentes: ['potabilizacion del agua'], tipo: 'extranjero' },
];

/**
 * Terminos que NUNCA se expanden (plan §9.2: "no eliminar negaciones ni
 * palabras cortas de forma agresiva"; aqui, ademas, no confundir dosis).
 * Si la consulta contiene uno de estos, la expansion se desactiva entera.
 */
const TERMINOS_SENSIBLES = [
  /\d/, // cualquier cifra: dosis, tensiones, frecuencias, porcentajes
  /\bmg\b|\bml\b|\bmcg\b|\bg\b/,
  /\bvoltios?\b|\bv\b|\bamperios?\b|\bhz\b/,
  /\bno\b|\bsin\b|\bnunca\b|\bjamas\b/, // negaciones: cambian el sentido
];

export interface Expansion {
  original: string;
  anadido: string;
  tipo: TipoRelacion;
}

export interface ResultadoExpansion {
  terminos: string[];
  expansiones: Expansion[];
  /** Motivo por el que no se expandio, si aplica. */
  bloqueadaPor: string | null;
}

/**
 * Expande los terminos con el diccionario. Devuelve tambien la lista de
 * lo anadido para que la interfaz pueda mostrarlo: quien busca debe poder
 * ver por que aparecio un resultado.
 */
export function expandir(terminosNormalizados: string[], activada: boolean): ResultadoExpansion {
  const original = [...terminosNormalizados];
  if (!activada) {
    return { terminos: original, expansiones: [], bloqueadaPor: 'desactivada por el usuario' };
  }

  const consultaEntera = terminosNormalizados.join(' ');
  for (const patron of TERMINOS_SENSIBLES) {
    if (patron.test(consultaEntera)) {
      return {
        terminos: original,
        expansiones: [],
        bloqueadaPor: 'la consulta contiene cifras, unidades o negaciones: se busca literal',
      };
    }
  }

  const expansiones: Expansion[] = [];
  const resultado = new Set(original);

  for (const entrada of DICCIONARIO) {
    const coincide =
      terminosNormalizados.includes(entrada.termino) ||
      (entrada.termino.includes(' ') && consultaEntera.includes(entrada.termino));
    if (coincide) {
      for (const equivalente of entrada.equivalentes) {
        if (!resultado.has(equivalente)) {
          resultado.add(equivalente);
          expansiones.push({ original: entrada.termino, anadido: equivalente, tipo: entrada.tipo });
        }
      }
      continue;
    }
    // Tambien en sentido inverso: buscar 'desfibrilador' encuentra 'DEA'.
    for (const equivalente of entrada.equivalentes) {
      if (terminosNormalizados.includes(equivalente) && !resultado.has(entrada.termino)) {
        resultado.add(entrada.termino);
        expansiones.push({ original: equivalente, anadido: entrada.termino, tipo: entrada.tipo });
      }
    }
  }

  return { terminos: [...resultado], expansiones, bloqueadaPor: null };
}
