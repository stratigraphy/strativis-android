// lg_grain.js: lithoglyph grain_scale.R ####

import { matchArg, asNumericR } from './lg_utils.js';

/**
 * grain_scale(type = c("siliciclastic", "dunham")): column table
 * {code, label, value, phi} (phi NaN for NA).
 */
export function grainScale({ type = 'siliciclastic' } = {}) {
  type = matchArg(type, ['siliciclastic', 'dunham']);
  if (type === 'siliciclastic') {
    return {
      code: ['clay', 'silt', 'vf', 'f', 'm', 'c', 'vc', 'granule', 'pebble', 'cobble', 'boulder'],
      label: ['clay', 'silt', 'vf', 'f', 'm', 'c', 'vc', 'gran', 'pebb', 'cobb', 'bould'],
      value: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      phi: [8, 4, 3, 2, 1, 0, -1, -2, -6, -8, NaN]
    };
  }
  return {
    code: ['mudstone', 'wackestone', 'packstone', 'grainstone', 'boundstone', 'rudstone'],
    label: ['M', 'W', 'P', 'G', 'B', 'R'],
    value: [1, 2, 3, 4, 5, 6],
    phi: [NaN, NaN, NaN, NaN, NaN, NaN]
  };
}

/** .grain_alias */
export const GRAIN_ALIAS = {
  shale: 'clay', mud: 'clay', claystone: 'clay', siltstone: 'silt',
  very_fine: 'vf', fine: 'f', medium: 'm', coarse: 'c', very_coarse: 'vc',
  vfs: 'vf', fs: 'f', ms: 'm', cs: 'c', vcs: 'vc', gran: 'granule',
  pebbles: 'pebble', cobbles: 'cobble', boulders: 'boulder',
  vf_sand: 'vf', f_sand: 'f', m_sand: 'm', c_sand: 'c', vc_sand: 'vc',
  M: 'mudstone', W: 'wackestone', P: 'packstone', G: 'grainstone',
  B: 'boundstone', R: 'rudstone', Cr: 'boundstone', floatstone: 'packstone',
  bafflestone: 'boundstone', bindstone: 'boundstone', framestone: 'boundstone',
  lime_mudstone: 'mudstone'
};

const isNa = (v) => v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));

/**
 * grain_width(x, type = c("siliciclastic", "dunham")): class names -> positions
 * on the grain_scale(). Numbers are returned as they are. `x` is a value or an
 * array; the result has the same shape.
 */
export function grainWidth(x, { type = 'siliciclastic' } = {}) {
  type = matchArg(type, ['siliciclastic', 'dunham']);
  const scalar = !Array.isArray(x);
  const xs = scalar ? [x] : x;
  // is.numeric(x): every element a number (or NA)
  if (xs.every((v) => typeof v === 'number')) {
    return scalar ? x : x.slice();
  }
  const chr = xs.map((v) => (isNa(v) ? null : String(v)));
  const out = xs.map((v, k) => (typeof v === 'number' ? v : asNumericR(chr[k])));
  const todo = [];
  out.forEach((v, k) => { if (Number.isNaN(v) && chr[k] !== null) { todo.push(k); } });
  if (todo.length === 0) {
    return scalar ? out[0] : out;
  }
  let key = todo.map((k) => chr[k]);
  key = key.map((v) => (Object.hasOwn(GRAIN_ALIAS, v) ? GRAIN_ALIAS[v] : v));
  key = key.map((v) => v.toLowerCase());
  const sc = grainScale({ type: 'siliciclastic' });
  const du = grainScale({ type: 'dunham' });
  const duOnSc = { mudstone: 2, wackestone: 3, packstone: 4, grainstone: 6, boundstone: 7, rudstone: 8 };
  // clastic grain sizes on the Dunham axis (the inverse of duOnSc)
  const scOnDu = { clay: 0.75, silt: 1, vf: 2, f: 3, m: 3.5, c: 4, vc: 5, granule: 6, pebble: 6, cobble: 6, boulder: 6 };
  for (let k = 0; k < key.length; k++) {
    if (type === 'dunham' && du.code.includes(key[k])) {
      out[todo[k]] = du.value[du.code.indexOf(key[k])];
    } else if (type === 'dunham' && Object.hasOwn(scOnDu, key[k])) {
      out[todo[k]] = scOnDu[key[k]];
    } else if (sc.code.includes(key[k])) {
      out[todo[k]] = sc.value[sc.code.indexOf(key[k])];
    } else if (Object.hasOwn(duOnSc, key[k])) {
      out[todo[k]] = duOnSc[key[k]];
    } else {
      throw new Error("Unknown grain size class '" + chr[todo[k]] + "'. See grain_scale().");
    }
  }
  return scalar ? out[0] : out;
}
