// sv_project.js: Strativis project.R (projects: metadata, options, beds, symbols, units) ####
//
// Projects are plain objects {format, version, meta, options, beds, symbols,
// units, palette}; beds, symbols and units are column tables. The JSON file
// stores the tables as arrays of row objects: projectFromJson() and
// projectToJson() convert, like read_strata() and write_strata().

import { isNA, nrow, dfFromRows } from './rbase.js';
import { cumsumR, asNumericR } from './lg_utils.js';
import { exampleLog } from './lg_column.js';
import { orientationKinds } from './lg_extra.js';

// R formatting helpers ####

// significant digits and decimal exponent of |x| rounded to `digits` digits
function sciParts(x, digits) {
  const s = Math.abs(x).toExponential(digits - 1);
  const [m, e] = s.split('e');
  const mant = m.replace('.', '').replace(/0+$/, '');
  return { nsig: Math.max(1, mant.length), kpower: Number(e) };
}

/**
 * One number as R prints it with `digits` significant digits (format(x),
 * as.character(x) with 15 digits, write.csv): fixed notation unless the
 * scientific one is narrower.
 */
export function formatRealR(x, digits = 7, { scipen = 0 } = {}) {
  if (isNA(x)) { return 'NA'; }
  if (x === Infinity) { return 'Inf'; }
  if (x === -Infinity) { return '-Inf'; }
  if (x === 0) { return '0'; }
  const neg = x < 0 ? 1 : 0;
  const { nsig, kpower } = sciParts(x, digits);
  const left = kpower >= 0 ? kpower + 1 : 1;
  let rgt = nsig - kpower - 1;
  if (rgt < 0) { rgt = 0; }
  const wF = neg + left + rgt + (rgt !== 0 ? 1 : 0);
  const wE = neg + (nsig > 1 ? nsig + 1 : nsig) + (Math.abs(kpower) >= 100 ? 5 : 4);
  if (wF <= wE + scipen) {
    return x.toFixed(rgt);
  }
  const m = Math.abs(x).toExponential(nsig - 1).split('e')[0];
  const ex = Math.abs(kpower);
  return (neg ? '-' : '') + m + 'e' + (kpower < 0 ? '-' : '+') + (ex < 10 ? '0' : '') + ex;
}

/** sprintf("%.15g", x) (jsonlite with digits = NA). */
export function sprintfG(x, p = 15) {
  if (x === 0) { return Object.is(x, -0) ? '-0' : '0'; }
  const s = x.toExponential(p - 1);
  const X = Number(s.split('e')[1]);
  if (X < -4 || X >= p) {
    let [m] = s.split('e');
    if (m.includes('.')) { m = m.replace(/0+$/, '').replace(/\.$/, ''); }
    const ex = Math.abs(X);
    return m + 'e' + (X < 0 ? '-' : '+') + (ex < 10 ? '0' : '') + ex;
  }
  let f = x.toFixed(p - 1 - X);
  if (f.includes('.')) { f = f.replace(/0+$/, '').replace(/\.$/, ''); }
  return f;
}

/** as.character() of one value (NA -> null). */
export function asCharacterR(v) {
  if (isNA(v)) { return null; }
  if (typeof v === 'number') { return formatRealR(v, 15); }
  if (typeof v === 'boolean') { return v ? 'TRUE' : 'FALSE'; }
  return String(v);
}

/** as.logical() of one value (NA -> null). */
export function asLogicalR(v) {
  if (isNA(v)) { return null; }
  if (typeof v === 'boolean') { return v; }
  if (typeof v === 'number') { return v !== 0; }
  const s = String(v);
  if (['TRUE', 'true', 'True', 'T'].includes(s)) { return true; }
  if (['FALSE', 'false', 'False', 'F'].includes(s)) { return false; }
  return null;
}

/** trimws() (which = "both"). */
export function trimwsR(s) {
  return String(s).replace(/^[ \t\r\n]+/, '').replace(/[ \t\r\n]+$/, '');
}

/** make.unique(names) with sep ".". */
export function makeUnique(names) {
  const seen = new Set(names);
  const done = new Set();
  const cnt = {};
  return names.map((nm) => {
    if (!done.has(nm)) {
      done.add(nm);
      return nm;
    }
    let k = cnt[nm] || 1;
    let cand = nm + '.' + k;
    while (seen.has(cand)) {
      k++;
      cand = nm + '.' + k;
    }
    cnt[nm] = k + 1;
    seen.add(cand);
    return cand;
  });
}

// Defaults ####

export const BED_COLS = [
  'id', 'thickness', 'base', 'top', 'lithology', 'grain', 'grain_top', 'contact',
  'side', 'surface', 'structure', 'fossils', 'bioturbation', 'relief',
  'relief_shape', 'fill', 'description', 'fault_angle', 'fault_sense', 'dip', 'dip_dir', 'bouma'
];
export const BED_NUM = ['thickness', 'base', 'top', 'relief', 'fault_angle', 'dip', 'dip_dir'];
export const BED_DEFAULT = {
  lithology: 'sandstone', grain: 'm', grain_top: null, contact: 'sharp',
  side: 'straight', surface: 'none', structure: null, fossils: null,
  bioturbation: null, relief: NaN, relief_shape: 'bank', fill: null, description: null,
  fault_angle: NaN, fault_sense: null, dip: NaN, dip_dir: NaN, bouma: null
};
export const SYM_COLS = ['dt', 'name', 'column', 'angle', 'bed', 'pos'];
export const UNIT_COLS = ['base', 'top', 'level', 'name', 'fill'];
export const SAMPLE_COLS = ['id', 'dt', 'top'];
export const CURVE_COLS = ['name', 'unit', 'dt', 'value'];
export const PHOTO_COLS = ['id', 'dt', 'bed', 'pos', 'caption', 'file'];
export const ORI_COLS = ['id', 'dt', 'bed', 'pos', 'kind', 'strike', 'dip', 'dip_dir', 'trend', 'plunge', 'note'];
export const ORI_NUM = ['dt', 'pos', 'strike', 'dip', 'dip_dir', 'trend', 'plunge'];

export const META_DEFAULT = {
  title: 'Untitled section', section: '', location: '', latitude: '',
  longitude: '', elevation: '', author: '', date: '', notes: ''
};

export const OPT_DEFAULT = {
  layout: 'combined', scale: 'siliciclastic', colours: 'conventional',
  page: 'A4', orientation: 'portrait', vscale: 'fit', panels: 'auto',
  // drawing sizes in inches, round values in mm
  base: 0, unit: 'm', class_width: 4.5 / 25.4, symbol_size: 4 / 25.4,
  pattern_scale: 1, relief_style: 'beds', legend: true, description_width: 45 / 25.4,
  corner: 1.5 / 25.4, amp: 1.5 / 25.4, stack: true, minor_ticks: 0, tick_step: 0, size_unit: 'mm',
  bed_numbers: false, core: false, rose: true, rose_bin: 30, stereonet: true, declination: 0
};

// Tables ####

/** .empty_df(cols, num): a table with no rows. */
export function emptyDf(cols, { num = [] } = {}) {
  const d = {};
  for (const cn of cols) { d[cn] = []; }
  return d;
}

// a table given as rows, a column table or null -> column table (scalars recycled)
function asTable(d) {
  if (Array.isArray(d)) { return dfFromRows(d); }
  const out = {};
  let n = 0;
  for (const v of Object.values(d)) { n = Math.max(n, Array.isArray(v) ? v.length : 1); }
  for (const [k, v] of Object.entries(d)) {
    if (Array.isArray(v)) {
      out[k] = v.length === n ? v.slice() : Array.from({ length: n }, (_, i) => v[i % v.length]);
    } else {
      out[k] = new Array(n).fill(v);
    }
  }
  return out;
}

const isEmptyInput = (d) => d === null || d === undefined ||
  (Array.isArray(d) && d.length === 0) || (typeof d === 'object' && !Array.isArray(d) && Object.keys(d).length === 0);

/** .fix_table(d, cols, num, defaults): the expected columns and types. */
export function fixTable(d, cols, num, { defaults = {} } = {}) {
  if (isEmptyInput(d)) {
    return emptyDf(cols, { num });
  }
  d = asTable(d);
  const n = nrow(d);
  const out = {};
  for (const cn of cols) {
    let v;
    if (Object.hasOwn(d, cn)) {
      v = d[cn];
    } else {
      const dv = Object.hasOwn(defaults, cn) ? defaults[cn] : null;
      v = new Array(n).fill(dv);
    }
    if (num.includes(cn)) {
      out[cn] = v.map((x) => asNumericR(x));
    } else {
      out[cn] = v.map((x) => {
        const s = asCharacterR(x);
        return s !== null && trimwsR(s) === '' ? null : s;
      });
    }
  }
  return out;
}

/** strata_project(beds, symbols, units, meta, options, palette). */
export function strataProject({ beds = null, symbols = null, units = null, meta = {}, options = {}, palette = null, samples = null, curves = null, photos = null, orientations = null } = {}) {
  const p = {
    format: 'Strativis', version: 1,
    meta, options, beds, symbols, units, palette, samples, curves, photos, orientations
  };
  return normaliseProject(p);
}

const filterRows = (d, keep) => {
  const out = {};
  for (const [k, v] of Object.entries(d)) { out[k] = v.filter((_, i) => keep[i]); }
  return out;
};

/** .normalise_project(p) */
export function normaliseProject(p) {
  const meta = { ...META_DEFAULT };
  for (const nm of Object.keys(p.meta || {})) {
    const v = p.meta[nm];
    if (v === null || v === undefined || (Array.isArray(v) && v.length === 0)) {
      meta[nm] = '';
    } else {
      meta[nm] = asCharacterR(Array.isArray(v) ? v[0] : v);
    }
  }
  const opt = { ...OPT_DEFAULT };
  for (const nm of Object.keys(p.options || {})) {
    const v = p.options[nm];
    if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) {
      opt[nm] = v;
    }
  }
  for (const nm of ['base', 'class_width', 'symbol_size', 'pattern_scale', 'description_width', 'corner', 'amp', 'minor_ticks', 'tick_step']) {
    const v = opt[nm];
    opt[nm] = asNumericR(Array.isArray(v) ? v[0] : v);
  }
  if (opt.layout === 'utrecht') {
    opt.layout = 'structures'; // name used before version 1.2.0
  }
  const isTrue = (v) => (Array.isArray(v) ? v.length === 1 && asLogicalR(v[0]) === true : asLogicalR(v) === true);
  opt.legend = isTrue(opt.legend);
  opt.stack = isTrue(opt.stack);
  opt.stereonet = isTrue(opt.stereonet);
  {
    const dc = asNumericR(Array.isArray(opt.declination) ? opt.declination[0] : opt.declination);
    opt.declination = isNA(dc) ? 0 : dc;
  }
  opt.bed_numbers = isTrue(opt.bed_numbers);
  opt.core = isTrue(opt.core);
  opt.rose = isTrue(opt.rose);
  {
    const rb = asNumericR(Array.isArray(opt.rose_bin) ? opt.rose_bin[0] : opt.rose_bin);
    opt.rose_bin = isNA(rb) || rb <= 0 ? 30 : rb;
  }
  const beds = fixTable(p.beds, BED_COLS, BED_NUM, { defaults: BED_DEFAULT });
  for (const cn of Object.keys(BED_DEFAULT)) {
    const dv = BED_DEFAULT[cn];
    if (!isNA(dv)) {
      beds[cn] = beds[cn].map((v) => (isNA(v) ? dv : v));
    }
  }
  const nb = nrow(beds);
  if (nb > 0) {
    if (opt.stack || beds.base.some((v, k) => isNA(v) || isNA(beds.top[k]))) {
      const th = beds.thickness.map((v, k) => (isNA(v) ? beds.top[k] - beds.base[k] : v))
        .map((v) => (isNA(v) || v <= 0 ? 0.1 : v))
        .map((v) => roundR(v, 9));
      beds.thickness = th;
      // core logs: heights from 0 at the base; the depths are worked out when drawing
      beds.top = cumsumR(th).map((v) => (opt.core ? 0 : opt.base) + v);
      beds.base = beds.top.map((v, k) => v - th[k]);
    } else {
      beds.thickness = beds.top.map((v, k) => roundR(v - beds.base[k], 9));
    }
    beds.id = beds.id.map((v, k) => (isNA(v) ? 'B' + (k + 1) : v));
    if (new Set(beds.id).size < beds.id.length) {
      beds.id = makeUnique(beds.id);
    }
  }
  let symbols = fixTable(p.symbols, SYM_COLS, ['dt', 'angle', 'pos']);
  if (nrow(symbols) > 0) {
    symbols.angle = symbols.angle.map((v) => (isNA(v) ? 0 : v));
    symbols.column = symbols.column.map((v) => (isNA(v) ? 'structures' : v));
    // faults inside beds are drawn across the log, not in a column
    symbols.column = symbols.column.map((v, k) => (['fault', 'fault_normal', 'fault_reverse'].includes(symbols.name[k]) ? 'bed' : v));
    // symbols attached to a bed follow it
    const ids = new Set(beds.id);
    const onBed = symbols.bed.map((v) => !isNA(v) && ids.has(v));
    symbols.pos = symbols.pos.map((v, k) => (onBed[k] && isNA(v) ? 0.5 : v));
    symbols.pos = symbols.pos.map((v) => (isNA(v) ? NaN : Math.min(Math.max(v, 0), 1)));
    symbols.dt = symbols.dt.map((v, k) => {
      if (!onBed[k]) { return v; }
      const j = beds.id.indexOf(symbols.bed[k]);
      return beds.base[j] + symbols.pos[k] * beds.thickness[j];
    });
    symbols.bed = symbols.bed.map((v, k) => (onBed[k] ? v : null));
    symbols.pos = symbols.pos.map((v, k) => (onBed[k] ? v : NaN));
    symbols = filterRows(symbols, symbols.dt.map((v, k) => !isNA(v) && !isNA(symbols.name[k])));
  }
  let units = fixTable(p.units, UNIT_COLS, ['base', 'top']);
  if (nrow(units) > 0) {
    units.level = units.level.map((v) => (isNA(v) ? 'Unit' : v));
    units = filterRows(units, units.base.map((v, k) => !isNA(v) && !isNA(units.top[k])));
  }
  let samples = fixTable(p.samples, SAMPLE_COLS, ['dt', 'top']);
  if (nrow(samples) > 0) {
    samples = filterRows(samples, samples.dt.map((v) => !isNA(v)));
    samples.id = samples.id.map((v) => (isNA(v) ? '' : v));
  }
  let curves = fixTable(p.curves, CURVE_COLS, ['dt', 'value']);
  if (nrow(curves) > 0) {
    curves = filterRows(curves, curves.dt.map((v, k) => !isNA(v) && !isNA(curves.value[k]) && !isNA(curves.name[k])));
  }
  let photos = fixTable(p.photos, PHOTO_COLS, ['dt', 'pos']);
  if (nrow(photos) > 0) {
    // photos attached to a bed follow it, like symbols
    const ids = new Set(beds.id);
    const onBed = photos.bed.map((v) => !isNA(v) && ids.has(v));
    photos.pos = photos.pos.map((v, k) => (onBed[k] && isNA(v) ? 0.5 : v));
    photos.pos = photos.pos.map((v) => (isNA(v) ? NaN : Math.min(Math.max(v, 0), 1)));
    photos.dt = photos.dt.map((v, k) => {
      if (!onBed[k]) { return v; }
      const j = beds.id.indexOf(photos.bed[k]);
      return beds.base[j] + photos.pos[k] * beds.thickness[j];
    });
    photos.bed = photos.bed.map((v, k) => (onBed[k] ? v : null));
    photos.pos = photos.pos.map((v, k) => (onBed[k] ? v : NaN));
    photos = filterRows(photos, photos.dt.map((v) => !isNA(v)));
    photos.id = photos.id.map((v, k) => (isNA(v) ? 'P' + (k + 1) : v));
  }
  let ori = fixTable(p.orientations, ORI_COLS, ORI_NUM);
  if (nrow(ori) > 0) {
    // measurements attached to a bed follow it, like symbols
    const ids = new Set(beds.id);
    const onBed = ori.bed.map((v) => !isNA(v) && ids.has(v));
    ori.pos = ori.pos.map((v, k) => (onBed[k] && isNA(v) ? 0.5 : v));
    ori.pos = ori.pos.map((v) => (isNA(v) ? NaN : Math.min(Math.max(v, 0), 1)));
    ori.dt = ori.dt.map((v, k) => {
      if (!onBed[k]) { return v; }
      const j = beds.id.indexOf(ori.bed[k]);
      return beds.base[j] + ori.pos[k] * beds.thickness[j];
    });
    ori.bed = ori.bed.map((v, k) => (onBed[k] ? v : null));
    ori.pos = ori.pos.map((v, k) => (onBed[k] ? v : NaN));
    ori = filterRows(ori, ori.dt.map((v) => !isNA(v)));
    const kinds = orientationKinds().map((r) => r.kind);
    ori.kind = ori.kind.map((v) => (isNA(v) || !kinds.includes(v) ? 'bedding' : v));
    // strike (right-hand rule) and dip direction complete each other
    const m360 = (v) => (isNA(v) ? NaN : ((v % 360) + 360) % 360);
    ori.dip_dir = ori.dip_dir.map((v, k) => (isNA(v) && !isNA(ori.strike[k]) ? ori.strike[k] + 90 : v));
    ori.strike = ori.strike.map((v, k) => (isNA(v) && !isNA(ori.dip_dir[k]) ? ori.dip_dir[k] - 90 : v));
    ori.strike = ori.strike.map(m360);
    ori.dip_dir = ori.dip_dir.map(m360);
    ori.trend = ori.trend.map(m360);
    const clamp = (v) => (isNA(v) ? NaN : Math.min(Math.max(v, 0), 90));
    ori.dip = ori.dip.map(clamp);
    ori.plunge = ori.plunge.map(clamp);
    ori.id = ori.id.map((v, k) => (isNA(v) ? 'O' + (k + 1) : v));
  }
  return {
    format: 'Strativis', version: 1, meta, options: opt,
    beds, symbols, units, palette: fixPalette(p.palette), samples, curves, photos, orientations: ori
  };
}

// round(x, digits) as R >= 4.0 does it: the shortest decimal candidates
// around x, the nearer one (ties: the one whose last digit is even)
export function roundR(x, d = 0) {
  if (!Number.isFinite(x) || x === 0) { return x; }
  if (x < 0) { return -roundR(-x, d); }
  if (d > 0) {
    let lb = Math.floor(Math.log2(x));
    if (Math.pow(2, lb) > x) { lb--; } else if (Math.pow(2, lb + 1) <= x) { lb++; }
    if ((lb + 0.5) * Math.LOG10E * Math.LN2 + d > 15) { return x; }
  }
  if (d === 0) {
    const r = Math.round(x);
    return (Math.abs(x % 1) === 0.5) ? 2 * Math.round(x / 2) : r;
  }
  const p10 = Number('1e' + d);
  const x10 = p10 * x, i10 = Math.floor(x10);
  const xd = i10 / p10, xu = Math.ceil(x10) / p10;
  if (xd === xu) { return xd; }
  const du = xu - x, dd = x - xd;
  if (dd < du) { return xd; }
  if (du < dd) { return xu; }
  return (i10 % 2 === 0) ? xd : xu;
}

/** .fix_palette(x): {lithology: colour} without empty entries. */
export function fixPalette(x) {
  if (x === null || x === undefined || typeof x !== 'object' || Array.isArray(x)) {
    return {};
  }
  // unlist(): NULL entries vanish and vectors expand; names must still match one to one
  const nm = Object.keys(x);
  const v = [];
  for (const v0 of Object.values(x)) {
    if (v0 === null || v0 === undefined) { continue; }
    for (const e of (Array.isArray(v0) ? v0 : [v0])) { v.push(asCharacterR(e)); }
  }
  if (nm.length !== v.length) {
    return {};
  }
  const out = {};
  nm.forEach((n, k) => {
    if (v[k] !== null && v[k] !== '' && n !== '' && !Object.hasOwn(out, n)) { out[n] = v[k]; }
  });
  return out;
}

/** print.strata_project(): the text R prints. */
export function printProject(x) {
  let s = '<Strativis project> ' + x.meta.title + '\n';
  if (nrow(x.beds) > 0) {
    s += '  ' + nrow(x.beds) + ' beds, ' + formatRealR(Math.min(...x.beds.base)) + ' to ' +
      formatRealR(Math.max(...x.beds.top)) + ' ' + x.options.unit + '\n';
  } else {
    s += '  no beds\n';
  }
  s += '  ' + nrow(x.symbols) + ' extra symbols, ' + nrow(x.units) + ' units, ' + nrow(x.samples) + ' samples, ' +
    new Set(x.curves.name).size + ' data curves\n';
  return s;
}

// JSON files (write_strata / read_strata) ####

function jsonString(s) {
  let out = '"';
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (ch === '"') { out += '\\"'; } else if (ch === '\\') { out += '\\\\'; } else if (ch === '\n') { out += '\\n'; } else if (ch === '\r') { out += '\\r'; } else if (ch === '\t') { out += '\\t'; } else if (ch === '\b') { out += '\\b'; } else if (ch === '\f') { out += '\\f'; } else if (c < 0x20) { out += '\\u' + c.toString(16).padStart(4, '0'); } else { out += ch; }
  }
  return out + '"';
}

function jsonScalar(v) {
  if (isNA(v)) { return 'null'; }
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) { return v > 0 ? '"Inf"' : '"-Inf"'; }
    return sprintfG(v, 15);
  }
  if (typeof v === 'boolean') { return v ? 'true' : 'false'; }
  return jsonString(v);
}

// jsonlite pretty printing (auto_unbox, 2-space indent)
function jsonValue(v, ind) {
  const pad = '  '.repeat(ind + 1), end = '  '.repeat(ind);
  if (Array.isArray(v)) {
    if (v.length === 1 && (v[0] === null || typeof v[0] !== 'object')) { return jsonScalar(v[0]); }
    if (v.length === 0) { return '[]'; }
    if (v.every((x) => x === null || typeof x !== 'object')) { return '[' + v.map(jsonScalar).join(', ') + ']'; }
    return '[\n' + v.map((x) => pad + jsonValue(x, ind + 1)).join(',\n') + '\n' + end + ']';
  }
  if (v !== null && typeof v === 'object') {
    const ks = Object.keys(v);
    if (ks.length === 0) { return '{}'; }
    return '{\n' + ks.map((k) => pad + jsonString(k) + ': ' + jsonValue(v[k], ind + 1)).join(',\n') + '\n' + end + '}';
  }
  return jsonScalar(v);
}

// column table -> rows (dataframe = "rows", na = "null")
function tableRows(d) {
  const cols = Object.keys(d);
  const out = [];
  for (let k = 0; k < nrow(d); k++) {
    const r = {};
    for (const c of cols) { r[c] = d[c][k]; }
    out.push(r);
  }
  return out;
}

/** write_strata(project, file) without the file: the JSON text. */
export function projectToJson(project) {
  const p = normaliseProject(project);
  const out = {
    format: p.format, version: p.version, meta: p.meta, options: p.options,
    beds: tableRows(p.beds), symbols: tableRows(p.symbols), units: tableRows(p.units),
    palette: p.palette, samples: tableRows(p.samples), curves: tableRows(p.curves), photos: tableRows(p.photos),
    orientations: tableRows(p.orientations)
  };
  return jsonValue(out, 0) + '\n';
}

// fromJSON(simplifyVector = TRUE): arrays of scalars become vectors (length 1 -> scalar)
function simplify(v) {
  if (Array.isArray(v)) {
    if (v.every((x) => x === null || typeof x !== 'object')) {
      return v.length === 1 ? v[0] : v;
    }
    return v.map(simplify);
  }
  if (v !== null && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) { out[k] = simplify(x); }
    return out;
  }
  return v;
}

/** read_strata(file) without the file: a JSON text or parsed object -> project. */
export function projectFromJson(obj, { file = 'project' } = {}) {
  const x = typeof obj === 'string' ? JSON.parse(obj) : obj;
  if (!x || x.format !== 'Strativis') {
    throw new Error("'" + file + "' is not a Strativis project");
  }
  const tab = (t) => {
    if (Array.isArray(t)) {
      return t.length === 0 ? null : dfFromRows(t.map((r) => simplify(r)));
    }
    return t ?? null;
  };
  return normaliseProject({
    format: x.format, version: x.version,
    meta: simplify(x.meta ?? {}), options: simplify(x.options ?? {}),
    beds: tab(x.beds), symbols: tab(x.symbols), units: tab(x.units),
    palette: x.palette ?? null, samples: tab(x.samples), curves: tab(x.curves), photos: tab(x.photos),
    orientations: tab(x.orientations)
  });
}

// Import of beds from a CSV text (import_beds_csv) is not ported: the app
// reads spreadsheets itself.

/** strata_example(): the example project. */
export function strataExample() {
  const ex = exampleLog();
  const b = { ...ex.beds };
  b.thickness = b.top.map((v, k) => v - b.base[k]);
  b.id = b.top.map((_, k) => 'B' + (k + 1));
  return strataProject({
    beds: b,
    symbols: ex.symbols,
    units: {
      base: [0, 3.4, 0, 2.6, 6.6],
      top: [3.4, 8.6, 2.6, 6.6, 8.6],
      level: ['Formation', 'Formation', 'Member', 'Member', 'Member'],
      name: ['Lower Fm.', 'Upper Fm.', 'Marl Mbr.', 'Carbonate Mbr.', 'Fluvial Mbr.'],
      fill: ['#E6EEF7', '#F6EED8', null, null, null]
    },
    meta: {
      title: 'Example section', section: 'Logging conventions demonstration',
      location: 'Example quarry', latitude: '50.52 N', longitude: '5.24 E',
      elevation: '120 m', author: 'M. Arts', date: '2026-11-06',
      notes: 'Logged at 1:20 in the field; colours after the conventional scheme.'
    },
    options: { stack: false }
  });
}
