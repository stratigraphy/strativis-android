// lg_colours.js: lithoglyph colours.R (lithology colour schemes) ####
//
// Named colour vectors are plain objects {name: '#RRGGBB'}; NA is null.

import { col2rgb } from './rgfx.js';
import { resolvePattern } from './lg_patterns.js';
import { matchArg } from './lg_utils.js';

/** .colour_conventional */
export const COLOUR_CONVENTIONAL = {
  clay: '#A7B89E', silt: '#D9DCA2', mudstone: '#B3B7A0', shale: '#98A794',
  sandstone: '#F6E27F', quartzite: '#F3ECBA',
  conglomerate: '#F2B35E', coarse_conglomerate: '#EBA04A', breccia: '#E8A27A',
  coarse_breccia: '#DF906A',
  // carbonates in natural rock colours: limestones light to medium grey (cream
  // for grainstones and reefal limestones), dolostones buff to yellowish brown
  lime_conglomerate: '#C9C5B6', carbonate_breccia: '#C0BCAE',
  limestone: '#BEC3C6', chalk: '#F1EFE6', dolomitic_limestone: '#CEC5AC',
  calcareous_dolostone: '#D3C29C', dolostone: '#D4B98A',
  clayey_limestone: '#B3B7B4', silty_limestone: '#C3C5BA', sandy_limestone: '#D0CCB6',
  siliceous_limestone: '#BABFC3',
  grainstone: '#DCD7C6', packstone: '#CBC8BD', wackestone: '#BEBEB9',
  lime_mudstone: '#B2B5B7', boundstone: '#D8D0BB', crystalline_limestone: '#C5C7C9',
  dolo_grainstone: '#DABF8F', dolo_packstone: '#D0B588', dolo_wackestone: '#C8AF86',
  dolo_boundstone: '#CAA97A', crystalline_dolostone: '#C3A57B',
  marl: '#B6BFBC', calcareous_siltstone: '#C3D3B6', sandy_clay: '#C8C99A',
  siliceous_clay: '#B7B3A6', sandy_siltstone: '#E3E2A0', siliceous_siltstone: '#CFCDA8',
  calcareous_sandstone: '#E8E7A6', clayey_sandstone: '#E6D98F',
  silty_sandstone: '#EEE29A', siliceous_sandstone: '#EFE3B0',
  calcareous_conglomerate: '#E4C389', pebbly_mudstone: '#C9B78F',
  sandy_conglomerate: '#F3C46F', calcareous_breccia: '#DDB48F',
  clayey_breccia: '#C8A98E', sandy_breccia: '#EBB685',
  chert: '#C98F7A', sulfate: '#E9B7D6', gypsum: '#EBC4DD', anhydrite: '#DDA8CC',
  halite: '#F2D3E6', kmg_salt: '#E3A6C9', phosphate: '#9ED6B5',
  coal: '#2B2B2B', peat: '#5B4A3A', bitumen: '#4A4A4A', asphalt: '#3A3A3A',
  tuff: '#E79A9A', pyroclastic_breccia: '#D97E7E',
  covered: null, none: null
};

const isNa = (v) => v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v)) || v === 'NA';

/** rgb(r, g, b, maxColorValue = 255): R truncates the values to integers. */
export function rgb255(r, g, b) {
  const h = (v) => {
    const i = Math.trunc(v);
    if (!(i >= 0 && i <= 255)) { throw new Error('color intensity ' + i + ', not in 0:255'); }
    return i.toString(16).padStart(2, '0').toUpperCase();
  };
  return '#' + h(r) + h(g) + h(b);
}

// apply fn to each non-NA colour of an object or array, keeping names
function mapCols(col, fn) {
  if (Array.isArray(col)) {
    return col.map((c) => (isNa(c) ? null : fn(c)));
  }
  if (col !== null && typeof col === 'object') {
    const out = {};
    for (const [k, c] of Object.entries(col)) { out[k] = isNa(c) ? null : fn(c); }
    return out;
  }
  return isNa(col) ? null : fn(col);
}

/** .mix_white(col, f): mix colours with white (fraction f of white). */
export function mixWhite(col, f) {
  return mapCols(col, (c) => {
    const m = col2rgb(c).map((v) => v + (255 - v) * f);
    return rgb255(m[0], m[1], m[2]);
  });
}

/** .to_grey(col): greyscale version, lightened by 20 %. */
export function toGrey(col) {
  return mapCols(col, (c) => {
    const m = col2rgb(c);
    let g = 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2];
    g = 255 - (255 - g) * 0.8;
    return rgb255(g, g, g);
  });
}

/**
 * litho_colours(scheme = c("conventional", "pastel", "grey", "none"), names = NULL):
 * {pattern: colour}; with `names`, an object keyed by the given names.
 */
export function lithoColours({ scheme = 'conventional', names = null } = {}) {
  scheme = matchArg(scheme, ['conventional', 'pastel', 'grey', 'none']);
  let pal = Object.assign({}, COLOUR_CONVENTIONAL);
  if (scheme === 'pastel') {
    pal = mixWhite(pal, 0.45);
  } else if (scheme === 'grey') {
    pal = toGrey(pal);
  } else if (scheme === 'none') {
    for (const k of Object.keys(pal)) { pal[k] = null; }
  }
  if (names === null || names === undefined) {
    return pal;
  }
  const nm = Array.isArray(names) ? names : [names];
  const key = resolvePattern(nm);
  const out = {};
  nm.forEach((n, k) => {
    const v = key[k] !== null && Object.hasOwn(pal, key[k]) ? pal[key[k]] : null;
    if (!Object.hasOwn(out, n)) { out[n] = v; }
  });
  return out;
}

/** litho_colours(scheme, names) as an unnamed array (one colour per name, duplicates kept). */
export function lithoColoursArray(scheme, names) {
  const pal = lithoColours({ scheme });
  const nm = Array.isArray(names) ? names : [names];
  return resolvePattern(nm).map((k) => (k !== null && Object.hasOwn(pal, k) ? pal[k] : null));
}

/**
 * .bed_colours(lith, colours): fill colours of beds from a scheme name or a
 * named colour object {lithology: colour}. Returns an array (null = NA).
 */
export function bedColours(lith, colours) {
  const n = lith.length;
  if (colours === null || colours === undefined ||
    (Array.isArray(colours) && colours.length === 0) ||
    (typeof colours === 'object' && !Array.isArray(colours) && Object.keys(colours).length === 0)) {
    return new Array(n).fill(null);
  }
  const schemes = ['conventional', 'pastel', 'grey', 'none'];
  const one = typeof colours === 'string' ? colours : (Array.isArray(colours) && colours.length === 1 ? colours[0] : null);
  if (one !== null && schemes.includes(one)) {
    return lithoColoursArray(one, lith);
  }
  if (typeof colours !== 'object' || Array.isArray(colours)) {
    throw new Error("'colours' should be a scheme name or a named vector of colours");
  }
  const nms = Object.keys(colours);
  const vals = Object.values(colours);
  const key = resolvePattern(lith);
  const cn = resolvePattern(nms);
  const out = new Array(n).fill(null);
  for (let k = 0; k < n; k++) {
    let hit = -1;
    for (let q = 0; q < nms.length; q++) {
      if ((key[k] !== null && cn[q] === key[k]) || nms[q] === lith[k]) { hit = q; break; }
    }
    if (hit >= 0) {
      out[k] = vals[hit];
    }
  }
  return out;
}
