// sv_document.js: Strativis document.R and legend.R ####
//
// Publication document: pages, title block, log panels, units, legend.

import {
  openDevice, devCur, devSet, par, plotNew, plotWindow, text, segments, rect,
  polygon, strwrap, NullBackend, PdfBackend, arrows, strwidth, textTranslated
} from './rgfx.js';
import { isNA, nrow, unique, dfToRows as dfToRowsLocal } from './rbase.js';
import { stratColumn } from './lg_column.js';
import { roseDiagram, stereonet, nBouma, orientationKinds, orientationMark } from './lg_extra.js';

// round() as R (IEC 60559: halves to even)
const roundHalfEven = (x) => {
  const f = Math.floor(x);
  const d = x - f;
  if (Math.abs(d - 0.5) < 1e-12) { return f % 2 === 0 ? f : f + 1; }
  return Math.round(x);
};
import { grainWidth } from './lg_grain.js';
import { lithoColours } from './lg_colours.js';
import { fillPattern } from './lg_patterns.js';
import { prettyLitholog, drawBeds } from './lg_beds.js';
import { drawRelief } from './lg_relief.js';
import { logSymbol } from './lg_symbols.js';
import { normaliseProject, formatRealR, trimwsR } from './sv_project.js';
import { asNumericR } from './lg_utils.js';

// Pages and scales ####

export const PAGES = {
  A4: [8.27, 11.69], A3: [11.69, 16.54], Letter: [8.5, 11], Legal: [8.5, 14]
};

/** .depth_units: length of one depth unit in metres (SI, and imperial ft and in). */
export const DEPTH_UNITS = { m: 1, cm: 0.01, mm: 0.001, ft: 0.3048, in: 0.0254 };

/** .unit_factor(unit) */
export function unitFactor(unit) {
  return typeof unit === 'string' && Object.hasOwn(DEPTH_UNITS, unit) ? DEPTH_UNITS[unit] : 1;
}

/** .unit_ranks: ranks of stratigraphic units, highest first (columns from the left). */
export const UNIT_RANKS = [
  'eonothem', 'erathem', 'system', 'subsystem', 'series', 'subseries', 'stage', 'substage',
  'supergroup', 'group', 'subgroup', 'formation', 'member', 'bed', 'biozone', 'zone', 'subzone',
  // interpretation columns
  'polarity', 'environment', 'facies association', 'facies', 'systems tract', 'sequence', 'cycle', 'trend'
];
const RANK_ALIAS = {
  gp: 'group', fm: 'formation', mbr: 'member', mb: 'member',
  'magnetic polarity': 'polarity', magnetozone: 'polarity', chron: 'polarity',
  'depositional environment': 'environment', fa: 'facies association',
  'systems tracts': 'systems tract', cycles: 'cycle', 't-r trend': 'trend', 'tr trend': 'trend'
};
// trend triangles: wide at the base (fining, deepening, transgressive) or at the top
const TREND_UP = ['t', 'transgressive', 'deepening', 'deepening-upward', 'fining', 'fining-upward', 'fu'];
const TREND_DOWN = ['r', 'regressive', 'shallowing', 'shallowing-upward', 'coarsening', 'coarsening-upward', 'cu'];

/** .unit_rank(level): position in UNIT_RANKS (1-based) or NaN. */
export function unitRank(level) {
  if (isNA(level)) { return NaN; }
  let l = String(level).trim().replace(/\.$/, '').toLowerCase();
  if (Object.hasOwn(RANK_ALIAS, l)) { l = RANK_ALIAS[l]; }
  const i = UNIT_RANKS.indexOf(l);
  return i < 0 ? NaN : i + 1;
}

/** .page_size(page, orientation): [width, height] in inches. */
export function pageSize(page, orientation) {
  if (page === 'Fit') {
    page = 'A4';
  }
  let sz = Object.hasOwn(PAGES, page) ? PAGES[page] : null;
  if (sz === null) {
    throw new Error("Unknown page size '" + page + "'. Use one of: " + Object.keys(PAGES).concat('Fit').join(', '));
  }
  sz = sz.slice();
  if (orientation === 'landscape') {
    sz = sz.reverse();
  }
  return sz;
}

export const NICE_SCALES = [
  1, 2, 5, 10, 20, 25, 30, 40, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750,
  1000, 1500, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 1e5
];

/** .nice_scale(x): the first nice scale denominator >= x. */
export function niceScale(x) {
  const s = NICE_SCALES.filter((v) => v >= x);
  if (s.length === 0) {
    return Math.ceil(x);
  }
  return s[0];
}

/** .geo: geometry constants (inches). */
export const GEO = {
  margin: 0.45, title1: 1.2, title2: 0.42, footer: 0.32, header: 0.75,
  mai: [0.06, 0.42, 0.04, 0.06], pad: 0.08, unit_w: 0.3, gap: 0.12, leg_row: 0.235,
  leg_head: 0.22, leg_colw: 1.6
};

// Columns, classes, colours ####

const has = (v) => v.some((x) => !isNA(x) && x !== '');

/** .project_columns(p): columns shown in every panel, decided from the whole project. */
export function projectColumns(p) {
  const b = p.beds;
  const sc = p.symbols.column || [];
  const cols = [];
  if (b.relief.some((v) => !isNA(v) && v !== 0)) {
    cols.push('relief');
  }
  if ((p.options.layout === 'combined' && has(b.structure)) || sc.includes('structures')) {
    cols.push('structures');
  }
  if (nBouma(b.bouma || []).some((v) => v > 0)) {
    cols.push('bouma');
  }
  if (sc.includes('transport')) {
    cols.push('transport');
  }
  if (p.orientations && nrow(p.orientations) > 0) {
    cols.push('orientations');
  }
  if (has(b.bioturbation) || sc.includes('bioturbation')) {
    cols.push('bioturbation');
  }
  if (has(b.fossils) || sc.includes('fossils')) {
    cols.push('fossils');
  }
  if (p.samples && nrow(p.samples) > 0) {
    cols.push('samples');
  }
  if (p.photos && nrow(p.photos) > 0) {
    cols.push('photos');
  }
  if (has(b.description)) {
    cols.push('description');
  }
  if (p.curves && nrow(p.curves) > 0) {
    for (const nm of unique(p.curves.name)) { cols.push('curve:' + nm); }
  }
  return cols;
}

const asArr = (v) => (Array.isArray(v) ? v : [v]);

/** .n_classes(p) */
export function nClasses(p) {
  const scl = p.options.scale;
  const g = asArr(grainWidth(p.beds.grain, { type: scl }));
  const gt = p.beds.grain_top.map((v, k) => (isNA(v) ? p.beds.grain[k] : v));
  const g2 = asArr(grainWidth(gt, { type: scl }));
  let m = -Infinity;
  for (const v of g.concat(g2)) {
    if (!isNA(v) && v > m) { m = v; }
  }
  return Math.max(Math.ceil(m), scl === 'siliciclastic' ? 7 : 5);
}

/** .scheme_colours(p): colour of every lithology, the scheme overridden by the project palette. */
export function schemeColours(p) {
  const pal = lithoColours({ scheme: p.options.colours });
  const extra = p.palette || {};
  if (Object.keys(extra).length === 0) {
    return pal;
  }
  // palette entries first: the first matching name wins
  const out = { ...extra };
  for (const [k, v] of Object.entries(pal)) {
    if (!Object.hasOwn(extra, k)) { out[k] = v; }
  }
  return out;
}

/** .column_args(p): arguments of strat_column() (camelCase options object). */
export function columnArgs(p) {
  const o = p.options;
  return {
    layout: o.layout, scale: o.scale, columns: projectColumns(p),
    columnWidth: { description: o.description_width }, classWidth: o.class_width,
    symbolSize: o.symbol_size, depthLab: o.unit, corner: o.corner, amp: o.amp,
    patternScale: o.pattern_scale, reliefStyle: o.relief_style,
    colours: schemeColours(p), nClasses: nClasses(p), cex: 0.65,
    minorTicks: isNA(o.minor_ticks) ? 0 : o.minor_ticks,
    tickStep: isNA(o.tick_step) ? 0 : o.tick_step,
    bedNumbers: o.bed_numbers === true, curveLimits: curveLimits(p), depthDown: o.core === true
  };
}

const dfSub = (d, keep) => {
  const out = {};
  for (const [k, v] of Object.entries(d)) { out[k] = v.filter((_, i) => keep[i]); }
  return out;
};

/**
 * .draw_coords(p): drawing coordinates. Core logs: every level becomes
 * -depth (beds and what is attached to them are shifted, free levels are
 * depths).
 */
export function drawCoords(p) {
  if (!p.options.core || nrow(p.beds) === 0) { return p; }
  const shift = Math.max(...p.beds.top) + p.options.base;
  const q = { ...p };
  q.beds = { ...p.beds, base: p.beds.base.map((v) => v - shift), top: p.beds.top.map((v) => v - shift) };
  const att = (t) => {
    if (!t || nrow(t) === 0) { return t; }
    return { ...t, dt: t.dt.map((v, k) => (!isNA(t.bed[k]) ? v - shift : -v)) };
  };
  q.symbols = att(p.symbols);
  q.photos = att(p.photos);
  q.orientations = att(p.orientations);
  const sm = p.samples;
  if (sm && nrow(sm) > 0) {
    const d = sm.dt.map((v) => -v), t = sm.top.map((v) => (isNA(v) ? v : -v));
    q.samples = {
      ...sm,
      dt: d.map((v, k) => (isNA(t[k]) ? v : Math.min(v, t[k]))),
      top: d.map((v, k) => (isNA(t[k]) ? t[k] : Math.max(v, t[k])))
    };
  }
  if (p.curves && nrow(p.curves) > 0) {
    q.curves = { ...p.curves, dt: p.curves.dt.map((v) => -v) };
  }
  const u = p.units;
  if (nrow(u) > 0) {
    const b = u.top.map((v) => -v), t = u.base.map((v) => -v);
    q.units = { ...u, base: b.map((v, k) => Math.min(v, t[k])), top: b.map((v, k) => Math.max(v, t[k])) };
  }
  return q;
}

/**
 * .palaeocurrents(p): transport symbols, palaeocurrent measurements (trend)
 * and cross-bedding (dip direction of the foresets).
 */
export function palaeocurrents(p) {
  const s = p.symbols;
  let a = !s || nrow(s) === 0 ? [] : s.angle.filter((v, k) => s.column[k] === 'transport');
  const o = p.orientations;
  if (o && nrow(o) > 0) {
    a = a.concat(o.trend.filter((v, k) => o.kind[k] === 'palaeocurrent'), o.dip_dir.filter((v, k) => o.kind[k] === 'cross_bedding'));
  }
  return a.filter((v) => !isNA(v));
}

/** .curve_limits(p): value range of each curve over the whole section. */
export function curveLimits(p) {
  const cv = p.curves;
  if (!cv || nrow(cv) === 0) { return null; }
  const out = {};
  for (const nm of unique(cv.name)) {
    const v = cv.value.filter((x, k) => cv.name[k] === nm && Number.isFinite(x));
    out[nm] = [Math.min(...v), Math.max(...v)];
  }
  return out;
}

/** .cut_interval(p, y0, y1): beds, symbols, units and samples cut to an interval (beds keep their number). */
export function cutInterval(p, y0, y1) {
  let b = { ...p.beds, number: p.beds.top.map((_, k) => k + 1) };
  b = dfSub(b, b.top.map((t, k) => t > y0 + 1e-9 && b.base[k] < y1 - 1e-9));
  const cutLo = b.base.map((v) => v < y0 - 1e-9);
  const cutHi = b.top.map((v) => v > y1 + 1e-9);
  b.base = b.base.map((v) => (isNA(v) ? v : Math.max(v, y0)));
  b.top = b.top.map((v) => (isNA(v) ? v : Math.min(v, y1)));
  b.contact = b.contact.map((v, k) => (cutLo[k] ? 'sharp' : v));
  b.corner = cutLo.map((v, k) => (v || cutHi[k] ? 0 : p.options.corner));
  b.description = b.description.map((v, k) => (cutLo[k] && !cutHi[k] ? null : v));
  let s = p.symbols;
  s = dfSub(s, s.dt.map((v) => v >= y0 && v <= y1));
  let u = p.units;
  u = dfSub(u, u.top.map((t, k) => t > y0 && u.base[k] < y1));
  let sm = p.samples || null;
  if (sm && nrow(sm) > 0) {
    sm = dfSub(sm, sm.dt.map((v, k) => (isNA(sm.top[k]) && v >= y0 && v <= y1) || (!isNA(sm.top[k]) && sm.top[k] >= y0 && v <= y1)));
  }
  let ph = p.photos || null;
  if (ph && nrow(ph) > 0) {
    ph = dfSub(ph, ph.dt.map((v) => v >= y0 && v <= y1));
  }
  let oo = p.orientations || null;
  if (oo && nrow(oo) > 0) {
    oo = dfSub(oo, oo.dt.map((v) => v >= y0 && v <= y1));
  }
  return { beds: b, symbols: s, units: u, samples: sm, photos: ph, orientations: oo };
}

const maxOf = (v) => {
  let m = -Infinity;
  for (const x of v) { if (!isNA(x) && x > m) { m = x; } }
  return m;
};

/** .panel_width(p): width of one log panel (inches), measured on a null device. */
export function panelWidth(p) {
  // measure on a null device, then return to the device in use
  const prev = devCur();
  try {
    openDevice(new NullBackend(), 30, 10);
    par({ mai: GEO.mai });
    const a = columnArgs(p);
    const res = stratColumn(p.beds, {
      symbols: nrow(p.symbols) > 0 ? p.symbols : null, ...a,
      curves: p.curves && nrow(p.curves) > 0 ? p.curves : null
    });
    return maxOf(res.columns.x1) + 0.25;
  } finally {
    devSet(prev);
  }
}

/** .unit_levels(p) */
export function unitLevels(p) {
  const lv = unique(p.units.level);
  const r = lv.map(unitRank);
  const o = lv.map((_, k) => k).sort((a, b) => {
    const ra = r[a], rb = r[b];
    if (Number.isNaN(ra) && Number.isNaN(rb)) { return a - b; }
    if (Number.isNaN(ra)) { return 1; }
    if (Number.isNaN(rb)) { return -1; }
    return ra - rb || a - b;
  });
  return o.map((k) => lv[k]);
}

const medianR = (v) => {
  const s = v.slice().sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) { return NaN; }
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

/** .plan_fit(p, W0, pw, uf): one page as long as the section (one panel, legend below). */
function planFit(p, W0, pw, uf) {
  const o = p.options;
  const g = GEO;
  const W = Math.max(W0, pw + 2 * g.margin);
  const innerW = W - 2 * g.margin;
  const items = o.legend ? legendItems(p) : null;
  const legH = o.legend ? legendHeight(items, innerW) : 0;
  const yBase = Math.min(...p.beds.base);
  const yTop = Math.max(...p.beds.top);
  const Hsec = yTop - yBase;
  let fixed = 2 * g.margin + g.title1 + g.footer + g.gap + g.header + g.mai[0] + g.mai[2] + g.pad;
  if (o.legend) {
    fixed = fixed + legH + g.gap;
  }
  // PDF pages can be at most 200 inches long
  const sMin = niceScale(Hsec * uf / (Math.max(1, 200 - fixed) * 0.0254));
  let s;
  const vnum = asNumericScalar(o.vscale);
  if (o.vscale === 'fit' || o.vscale === null || o.vscale === undefined || isNA(vnum)) {
    // the typical (median) bed about 0.3 inch thick
    const th = p.beds.top.map((t, k) => t - p.beds.base[k]).filter((v) => v > 0);
    s = niceScale(medianR(th) * uf / (0.3 * 0.0254));
  } else {
    s = vnum;
  }
  s = Math.max(s, sMin);
  const mPerIn = s * 0.0254 / uf;
  const H = fixed + Hsec / mPerIn;
  return {
    width: W, height: H, scale: s, m_per_in: mPerIn,
    pages: [{ panels: [[yBase, yTop]], legend: o.legend }],
    panel_width: pw, panels: 1, legend_height: legH, legend_items: items, too_wide: false
  };
}

// Plan ####

/**
 * strata_plan(project): page size (width, height), vertical scale, m_per_in,
 * pages ({panels: [[y0, y1], ...], legend}), panel_width, panels,
 * legend_height and legend_items.
 */
export function strataPlan(project) {
  const p = drawCoords(normaliseProject(project));
  const o = p.options;
  if (nrow(p.beds) === 0) {
    throw new Error('The project has no beds');
  }
  const sz = pageSize(o.page, o.orientation);
  const W = sz[0];
  const H = sz[1];
  const g = GEO;
  const uf = unitFactor(o.unit);
  const pw = panelWidth(p) + unitLevels(p).length * g.unit_w;
  if (o.page === 'Fit') {
    return planFit(p, W, pw, uf);
  }
  const innerW = W - 2 * g.margin;
  const auto = o.panels === 'auto';
  let P = auto ? Math.max(1, Math.floor(innerW / pw)) : Math.max(1, asIntegerR(o.panels));
  const items = o.legend ? legendItems(p) : null;
  const legH = o.legend ? legendHeight(items, innerW) : 0;
  let yBase = Math.min(...p.beds.base);
  let yTop = Math.max(...p.beds.top);
  const Hsec = yTop - yBase;
  const extra = g.header + g.mai[0] + g.mai[2] + g.pad;
  const avail = (titleH, withLegend) => {
    let h = H - 2 * g.margin - titleH - g.footer - g.gap - extra;
    if (withLegend) {
      h = h - legH - g.gap;
    }
    return h;
  };
  let s;
  const vnum = asNumericScalar(o.vscale);
  if (o.vscale === 'fit' || o.vscale === null || o.vscale === undefined || isNA(vnum)) {
    let ah = avail(g.title1, o.legend && legH < 0.45 * H);
    if (ah < 1) {
      ah = avail(g.title1, false);
    }
    const Pfit = auto ? 1 : P;
    s = niceScale(Hsec * uf / (Pfit * ah * 0.0254));
    if (auto) {
      P = 1;
    }
  } else {
    s = vnum;
  }
  const mPerIn = s * 0.0254 / uf;
  // core logs: the pages run from the top down (worked out on -level)
  if (o.core) {
    const yb0 = yBase;
    yBase = -yTop;
    yTop = -yb0;
  }
  const pages = [];
  let y = yBase;
  let k = 1;
  let legendDone = !o.legend;
  for (;;) {
    const th = k === 1 ? g.title1 : g.title2;
    const capFull = avail(th, false) * mPerIn;
    const capLeg = avail(th, true) * mPerIn;
    const R = yTop - y;
    if (R <= 1e-9) {
      if (!legendDone) {
        pages[k - 1] = { panels: [], legend: true };
      }
      break;
    }
    if (capFull <= 0) {
      throw new Error('The page is too small for the log');
    }
    if (!legendDone && capLeg > 0 && R <= P * capLeg + 1e-9) {
      const np = Math.ceil(R / capLeg - 1e-9);
      let len = R / np;
      len = Math.min(capLeg, len);
      const pan = [];
      for (let j = 1; j <= np; j++) {
        pan.push([y + (j - 1) * len, Math.min(y + j * len, yTop)]);
      }
      pages[k - 1] = { panels: pan, legend: true };
      legendDone = true;
      break;
    }
    const np = Math.min(P, Math.ceil(R / capFull - 1e-9));
    const pan = [];
    for (let j = 1; j <= np; j++) {
      pan.push([y + (j - 1) * capFull, Math.min(y + j * capFull, yTop)]);
    }
    pages[k - 1] = { panels: pan, legend: false };
    y = pan[np - 1][1];
    k = k + 1;
  }
  if (o.core) {
    for (const pg of pages) {
      pg.panels = pg.panels.map((v) => [-v[1], -v[0]]);
    }
  }
  return {
    width: W, height: H, scale: s, m_per_in: mPerIn, pages,
    panel_width: pw, panels: P, legend_height: legH, legend_items: items,
    too_wide: pw > innerW + 1e-9
  };
}

// as.numeric(x)[1] without warnings
function asNumericScalar(v) {
  if (Array.isArray(v)) { v = v[0]; }
  return asNumericR(v);
}

// as.integer(x) (truncation; NA stays NA, and max(1, NA) is NA in R)
function asIntegerR(v) {
  const x = asNumericScalar(v);
  return isNA(x) ? NaN : Math.trunc(x);
}

// Text helpers ####

/** .soft_hyphen(x): word hyphens as soft hyphens. */
export function softHyphen(x) {
  if (x === null || x === undefined) {
    return x;
  }
  const f = (s) => (isNA(s) ? s : String(s).replace(/(?<=[A-Za-z0-9)~])-/g, '­'));
  return Array.isArray(x) ? x.map(f) : f(x);
}

/** .hyphenate_project(p) */
export function hyphenateProject(p) {
  const meta = {};
  for (const nm of Object.keys(p.meta)) { meta[nm] = softHyphen(p.meta[nm]); }
  return {
    ...p, meta,
    beds: { ...p.beds, description: softHyphen(p.beds.description) },
    units: { ...p.units, name: softHyphen(p.units.name) }
  };
}

// format(x, big.mark = " ", scientific = FALSE)
export function formatBigMark(x) {
  const s = formatRealR(x, 7, { scipen: 1000 });
  const m = s.match(/^(-?)(\d+)(.*)$/);
  if (!m) { return s; }
  return m[1] + m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + m[3];
}

// Regions ####

/** .region(x0, y0, x1, y1, W, H, mai): region of the page in inches -> par(fig). */
export function region(x0, y0, x1, y1, W, H, { mai = [0, 0, 0, 0] } = {}) {
  const fig = [Math.max(0, x0 / W), Math.min(1, x1 / W), Math.max(0, y0 / H), Math.min(1, y1 / H)];
  // par() refuses a figure region outside the page or empty
  if (!(fig[0] >= 0 && fig[0] < fig[1] && fig[1] <= 1 && fig[2] >= 0 && fig[2] < fig[3] && fig[3] <= 1)) {
    throw new Error('invalid value specified for graphical parameter "fig"');
  }
  par({ fig, mai, new: true });
}

/** .inch_window(w, h) */
export function inchWindow(w, h) {
  plotNew();
  plotWindow([0, w], [0, h], { xaxs: 'i', yaxs: 'i' });
}

// Title, footer, units, panel ####

/** .draw_title(p, plan, k, w, h) */
export function drawTitle(p, plan, k, w, h) {
  const m = p.meta;
  inchWindow(w, h);
  const tt = m.title;
  if (k > 1) {
    text(0, h - 0.18, tt + ' (continued)', { adj: [0, 0.5], font: 2, cex: 1 });
    segments(0, 0.04, w, 0.04, { lwd: 0.8 });
    return;
  }
  text(0, h - 0.2, tt, { adj: [0, 0.5], font: 2, cex: 1.45 });
  const nzc = (v) => v !== null && v !== undefined && String(v).length > 0;
  const nz = (v) => v.filter(nzc);
  const l2 = nz([m.section, m.location]).join('  |  ');
  const co = nz([
    nzc(m.latitude) || nzc(m.longitude) ? trimwsR(String(m.latitude) + ' ' + String(m.longitude)) : '',
    nzc(m.elevation) ? 'elev. ' + m.elevation : ''
  ]);
  const l3 = co.join('  |  ');
  const l4 = nz([m.author, m.date]).join('  |  ');
  let yy = h - 0.47;
  for (const ln of [l2, l3, l4]) {
    if (ln.length > 0) {
      text(0, yy, ln, { adj: [0, 0.5], cex: 0.75 });
      yy = yy - 0.16;
    }
  }
  if (nzc(m.notes)) {
    const so = p.options.stereonet === true && p.orientations && p.orientations.kind.filter((v) => v !== 'palaeocurrent').length >= 1;
    const nw = Math.max(20, Math.floor((w - (so ? 3.2 : 2.3)) / 0.055));
    let nl = strwrap(m.notes, nw);
    nl = nl.slice(0, Math.min(2, nl.length));
    for (const ln of nl) {
      text(0, yy, ln, { adj: [0, 0.5], cex: 0.65, font: 3 });
      yy = yy - 0.14;
    }
  }
  // Scale and scale bar
  const vs = 'Vertical scale 1:' + formatBigMark(plan.scale);
  text(w, h - 0.2, vs, { adj: [1, 0.5], cex: fitCex(vs, 0.8, 1.3) });
  const cand = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  let len = cand.filter((c) => c / plan.m_per_in <= 1.2);
  len = len.length > 0 ? len[len.length - 1] : cand[0];
  const bl = len / plan.m_per_in;
  const bx = w - bl;
  const by = h - 0.48;
  for (let j = 0; j <= 3; j++) {
    rect(bx + j * bl / 4, by, bx + (j + 1) * bl / 4, by + 0.06,
      { col: j % 2 === 0 ? 'black' : 'white', border: 'black', lwd: 0.6 });
  }
  text([bx, w], by - 0.08, ['0', formatRealR(len) + ' ' + p.options.unit], { cex: 0.6 });
  // Rose diagram of the palaeocurrents
  const pc = palaeocurrents(p);
  if (p.options.rose === true && pc.length >= 2) {
    const st = roseDiagram(pc, w - 1.75, h / 2 - 0.02, { radius: 0.36, bin: p.options.rose_bin, upi: [1, 1] });
    const pl = 'Palaeocurrents: n = ' + st.n + ', mean ' + formatRealR(roundHalfEven(st.mean)) + '\u00b0';
    text(w, 0.16, pl, { adj: [1, 0.5], cex: fitCex(pl, 0.6, 2.2) });
  }
  // Stereonet of the orientation measurements
  const oo = p.orientations;
  if (p.options.stereonet === true && oo && oo.kind.filter((v) => v !== 'palaeocurrent').length >= 1) {
    const sn = stereonet(dfToRowsLocal(oo), w - 2.7, h / 2 - 0.02, { radius: 0.36, upi: [1, 1] });
    text(w - 2.7, 0.1, 'Stereonet (lower hemisphere): ' + sn.planes + ' poles, ' + sn.lines + ' lines', { cex: 0.5 });
  }
  const sch = p.options.colours;
  if (sch !== 'none') {
    text(w, by - 0.25, 'Colours: ' + sch, { adj: [1, 0.5], cex: fitCex('Colours: ' + sch, 0.6, 1.3), col: 'grey30' });
  }
  segments(0, 0.04, w, 0.04, { lwd: 0.8 });
}

/** .draw_footer(k, n, w, h) */
export function drawFooter(k, n, w, h) {
  inchWindow(w, h);
  text(0, h / 2, 'Drawn with Strativis (lithoglyph + StratigrapheR)', { adj: [0, 0.5], cex: 0.55, col: 'grey40' });
  text(w, h / 2, 'Page ' + k + ' of ' + n, { adj: [1, 0.5], cex: 0.6, col: 'grey30' });
}

/**
 * StratigrapheR::infobar(xmin, xmax, ymax, ymin, labels, m = list(col, lwd),
 * t = list(cex), srt): the part used by .draw_units (rectangles drawn as
 * polygons by multigons(), then centred labels).
 */
export function infobar(xmin, xmax, ymax, ymin, { labels = null, m = {}, t = {}, srt = 90 } = {}) {
  const n = Math.max(asArr(xmin).length, asArr(xmax).length, asArr(ymax).length, asArr(ymin).length,
    labels === null ? 1 : asArr(labels).length);
  const rp = (v) => { const a = asArr(v); return Array.from({ length: n }, (_, k) => a[k % a.length]); };
  const X0 = rp(xmin), X1 = rp(xmax), Y1 = rp(ymax), Y0 = rp(ymin);
  const col = rp(m.col ?? 'white'), lwd = rp(m.lwd ?? 1);
  for (let k = 0; k < n; k++) {
    // multigons: border "black", lty 1, lend 0, ljoin 0; corners xmin-ymin, xmin-ymax, xmax-ymax, xmax-ymin
    polygon([X0[k], X0[k], X1[k], X1[k]], [Y0[k], Y1[k], Y1[k], Y0[k]],
      { col: col[k], border: 'black', lwd: lwd[k], lend: 0, ljoin: 0 });
  }
  if (labels !== null && !(asArr(labels).length === 1 && isNA(asArr(labels)[0]))) {
    const L = rp(labels).map((v) => (isNA(v) ? 'NA' : String(v)));
    // R draws nothing for empty labels
    const keep = L.map((v) => v !== '');
    const xm = X0.map((v, k) => (v + X1[k]) / 2).filter((_, k) => keep[k]);
    const ym = Y0.map((v, k) => (v + Y1[k]) / 2).filter((_, k) => keep[k]);
    if (xm.length > 0) {
      text(xm, ym, L.filter((_, k) => keep[k]), { cex: t.cex ?? 1, srt });
    }
  }
}

/** .draw_units(units, levels, y0, y1, ytop, w): stratigraphic units strip, aligned with a log panel. */
export function drawUnits(units, levels, y0, y1, ytop, w, ybot = y0) {
  plotNew();
  plotWindow([0, w], [ybot, ytop], { xaxs: 'i', yaxs: 'i' });
  const nl = levels.length;
  const cw = w / nl;
  for (let j = 1; j <= nl; j++) {
    const x0 = (j - 1) * cw;
    const x1 = j * cw;
    const u = dfSub(units, units.level.map((v) => v === levels[j - 1]));
    text((x0 + x1) / 2, (y1 + ytop) / 2, levels[j - 1], { srt: 90, cex: 0.6 });
    rect(x0, y0, x1, y1, { border: 'black', lwd: 0.6 });
    if (nrow(u) === 0) {
      continue;
    }
    const ub = u.base.map((v) => Math.max(v, y0));
    const ut = u.top.map((v) => Math.min(v, y1));
    const fills = u.fill.map((v) => (isNA(v) ? 'white' : v));
    const labs = u.name.map((v) => (isNA(v) ? '' : v));
    const rki = unitRank(levels[j - 1]);
    const rk = Number.isNaN(rki) ? null : UNIT_RANKS[rki - 1];
    if (rk === 'polarity') {
      // magnetic polarity: normal (N, normal, chrons ending in n) black, reversed white; labels white on black
      labs.forEach((l, k) => {
        const s = String(l).trim();
        const normal = ['n', 'normal'].includes(s.toLowerCase()) || /n$/.test(s);
        if (isNA(u.fill[k]) && normal) { fills[k] = 'black'; }
      });
      rect(x0, ub, x1, ut, { col: fills, lwd: 0.6 });
      text(labs.map(() => (x0 + x1) / 2), ub.map((v, k) => (v + ut[k]) / 2), labs,
        { srt: 90, cex: 0.6, col: fills.map((f) => (f === 'black' ? 'white' : 'black')) });
      continue;
    }
    if (rk === 'trend') {
      rect(x0, ub, x1, ut, { col: fills, lwd: 0.6 });
      labs.forEach((l, k) => {
        const key = String(l).trim().toLowerCase();
        if (TREND_UP.includes(key)) {
          polygon([x0 + 0.03, x1 - 0.03, (x0 + x1) / 2], [ub[k], ub[k], ut[k]], { col: 'grey85', lwd: 0.6 });
        } else if (TREND_DOWN.includes(key)) {
          polygon([x0 + 0.03, x1 - 0.03, (x0 + x1) / 2], [ut[k], ut[k], ub[k]], { col: 'grey85', lwd: 0.6 });
        } else {
          text((x0 + x1) / 2, (ub[k] + ut[k]) / 2, l, { srt: 90, cex: 0.6 });
        }
      });
      continue;
    }
    infobar(x0, x1, ut, ub, { labels: labs, m: { col: fills, lwd: 0.6 }, t: { cex: 0.6 }, srt: 90 });
  }
  segments(0, y1, w, y1, { lwd: 0.8 });
  segments(0, ytop, w, ytop, { lwd: 0.8 });
}

/** .draw_panel(p, y0, y1, x0, ytop_in, plan) */
export function drawPanel(p, y0, y1, x0, ytopIn, plan) {
  const W = plan.width;
  const H = plan.height;
  const g = GEO;
  const cut = cutInterval(p, y0, y1);
  const lv = unitLevels(p);
  const uw = lv.length * g.unit_w;
  const logH = (y1 - y0) / plan.m_per_in;
  // free space below the base of the section only (not where a page cuts it)
  const pad = y0 <= Math.min(...p.beds.base) + 1e-9 ? g.pad : 0;
  const regionH = logH + g.header + g.mai[0] + g.mai[2] + pad;
  const ybot = ytopIn - regionH;
  const a = columnArgs(p);
  region(x0 + uw, ybot, x0 + plan.panel_width, ytopIn, W, H, { mai: g.mai });
  const res = stratColumn(cut.beds, {
    symbols: nrow(cut.symbols) > 0 ? cut.symbols : null,
    ylim: [y0, y1], headerHeight: g.header, pad, ...a,
    samples: cut.samples && nrow(cut.samples) > 0 ? cut.samples : null,
    photos: cut.photos && nrow(cut.photos) > 0 ? cut.photos : null,
    orientations: cut.orientations && nrow(cut.orientations) > 0 ? cut.orientations : null,
    curves: p.curves && nrow(p.curves) > 0 ? p.curves : null
  });
  if (uw > 0) {
    region(x0, ybot, x0 + uw, ytopIn, W, H, { mai: [g.mai[0], 0, g.mai[2], 0] });
    drawUnits(cut.units, lv, y0, y1, res.ytop, uw, res.ybot);
  }
  return res;
}

// Document ####

/**
 * strata_document(project, pages = NULL, plan = NULL): draws the pages on the
 * current device (of the page size). Returns the plan.
 */
export function strataDocument(project, { pages = null, plan = null } = {}) {
  let p = normaliseProject(project);
  if (plan === null) {
    plan = strataPlan(p);
  }
  p = drawCoords(p);
  const d = devCur();
  const old = { fig: par('fig'), mai: par('mai'), cex: par('cex') };
  try {
    const W = plan.width;
    const H = plan.height;
    const g = GEO;
    const n = plan.pages.length;
    if (pages === null) {
      pages = Array.from({ length: n }, (_, k) => k + 1);
    }
    const innerW = W - 2 * g.margin;
    for (const k of asArr(pages)) {
      const pg = plan.pages[k - 1];
      par({ fig: [0, 1, 0, 1], mai: [0, 0, 0, 0], new: false });
      plotNew();
      const th = k === 1 ? g.title1 : g.title2;
      const top = H - g.margin;
      region(g.margin, top - th, W - g.margin, top, W, H);
      drawTitle(p, plan, k, innerW, th);
      const ytopIn = top - th - g.gap;
      const np = pg.panels.length;
      for (let j = 1; j <= np; j++) {
        const x0 = g.margin + (j - 1) * plan.panel_width;
        drawPanel(p, pg.panels[j - 1][0], pg.panels[j - 1][1], x0, ytopIn, plan);
      }
      if (pg.legend && plan.legend_items !== null && nrow(plan.legend_items) > 0) {
        const lh = plan.legend_height;
        let ly0 = g.margin + g.footer;
        if (np === 0) {
          ly0 = top - th - g.gap - lh;
        }
        region(g.margin, ly0, W - g.margin, ly0 + lh, W, H);
        drawLegend(plan.legend_items, innerW, lh, p);
      }
      region(g.margin, g.margin * 0.5, W - g.margin, g.margin * 0.5 + g.footer, W, H);
      drawFooter(k, n, innerW, g.footer);
    }
  } finally {
    if (devCur() === d && d) {
      par({ fig: old.fig, mai: old.mai, cex: old.cex, new: false });
    }
  }
  return plan;
}

/**
 * strata_pdf(project, file) without the file: Promise<Uint8Array> of the PDF
 * (Flate-compressed). project may also be a parsed JSON project.
 */
export async function strataPdf(project) {
  const p = normaliseProject(project);
  const plan = strataPlan(p);
  const be = new PdfBackend(plan.width, plan.height, { title: p.meta.title });
  const prev = devCur();
  try {
    openDevice(be, plan.width, plan.height, 12);
    strataDocument(hyphenateProject(p), { plan });
  } finally {
    devSet(prev);
  }
  return be.finishAsync();
}

/**
 * drawPage(project, k, backend, {plan}): draws page k on a backend (e.g. a
 * CanvasBackend of plan.width x plan.height inches) for the preview; no soft
 * hyphens (as strata_document() on screen). Returns the plan.
 */
export function drawPage(project, k, backend, { plan = null } = {}) {
  const p = normaliseProject(project);
  if (plan === null) {
    plan = strataPlan(p);
  }
  const prev = devCur();
  try {
    openDevice(backend, plan.width, plan.height, 12);
    strataDocument(p, { pages: [k], plan });
  } finally {
    devSet(prev);
  }
  return plan;
}

// Legend (legend.R) ####

export const NICE_LABELS = {
  xbed_low_angle: 'low-angle cross-bedding', xbed_tabular: 'tabular cross-bedding',
  xbed_trough: 'trough cross-bedding', even_bedding: 'even bedding',
  even_lamination: 'even lamination', wavy_lamination: 'wavy lamination',
  ripple_lamination: 'ripple cross-lamination', climbing_ripples: 'climbing ripples',
  herringbone_lamination: 'herringbone cross-lamination',
  bioturbation_weak: 'bioturbation, weak', bioturbation_moderate: 'bioturbation, moderate',
  bioturbation_strong: 'bioturbation, strong', large_ripple_direction: 'palaeocurrent (large ripples)',
  small_ripple_direction: 'palaeocurrent (small ripples)', channel_direction: 'channel direction',
  sole_mark_direction: 'palaeocurrent (sole marks)', concretion_carbonate: 'carbonate concretion',
  concretion_silica: 'silica concretion', concretion_iron: 'iron concretion',
  fossils_abundant: 'fossils, abundant', fossils_sparse: 'fossils, sparse',
  foram_benthic: 'benthic foraminifera', foram_pelagic: 'pelagic foraminifera',
  dolo_grainstone: 'dolomitized grainstone', dolo_packstone: 'dolomitized packstone',
  dolo_wackestone: 'dolomitized wackestone', dolo_boundstone: 'dolomitized boundstone',
  kmg_salt: 'K/Mg salts', clay_parting: 'sharp, clay parting', paleosol: 'palaeosol',
  covered: 'covered / no exposure'
};

/** .label(x) for one name or an array. */
export function label(x) {
  const f = (s) => (Object.hasOwn(NICE_LABELS, s) ? NICE_LABELS[s] : String(s).replace(/_/g, ' '));
  return Array.isArray(x) ? x.map(f) : f(x);
}

/** .split_names(v) */
export function splitNames(v) {
  v = v.filter((x) => !isNA(x) && x !== '');
  if (v.length === 0) {
    return [];
  }
  const out = [];
  for (const s of v) {
    for (const part of String(s).split(/[,;]/)) { out.push(trimwsR(part)); }
  }
  return out.filter((s) => s !== '');
}

/** .legend_items(p): table {type, name, colour} or null. */
export function legendItems(p) {
  const b = p.beds;
  const items = { type: [], name: [], colour: [] };
  const add = (type, name, colour = null) => {
    items.type.push(type);
    items.name.push(name);
    items.colour.push(colour);
  };
  const lith = unique(b.lithology.filter((v) => !isNA(v) && v !== 'none'));
  let sc = null;
  for (const l of lith) {
    const f = b.fill.filter((v, k) => b.lithology[k] === l && !isNA(v));
    let col;
    if (f.length > 0) {
      col = f[0];
    } else {
      if (sc === null) { sc = schemeColours(p); }
      col = Object.hasOwn(sc, l) ? sc[l] : null;
    }
    add('lithology', l, isNA(col) ? null : col);
  }
  const faultSy = ['fault', 'fault_normal', 'fault_reverse'];
  const ct = unique(b.contact.filter((v) => !isNA(v) && v !== 'sharp'));
  if ((p.symbols.name || []).some((v) => faultSy.includes(v)) && !ct.includes('fault')) {
    ct.push('fault');
  }
  for (const cn of ct) {
    add('contact', cn);
  }
  for (const s of unique(b.surface.filter((v) => !isNA(v) && v !== 'none'))) {
    add('surface', s);
  }
  const hasRel = b.relief.map((v) => !isNA(v) && v !== 0);
  if (hasRel.some((v) => v)) {
    let rs = b.relief_shape.map((v, k) => (!isNA(b.relief[k]) && b.relief[k] < 0 ? 'niche' : v));
    rs = unique(rs.filter((_, k) => hasRel[k]));
    if (p.options.relief_style === 'smooth') {
      rs = ['smooth'].concat(rs.includes('niche') ? ['niche'] : []);
    }
    for (const r of rs) {
      add('relief', r);
    }
  }
  let sy = splitNames(b.structure).concat(splitNames(b.fossils));
  const bt = b.bioturbation.filter((v) => !isNA(v) && v !== '');
  sy = sy.concat(bt.map((v) => 'bioturbation_' + v));
  sy = unique(sy.concat(p.symbols.name || [])).filter((v) => !faultSy.includes(v));
  for (const s of sy) {
    add('symbol', s);
  }
  const oo = p.orientations;
  if (oo && nrow(oo) > 0) {
    for (const r of orientationKinds()) {
      if (oo.kind.includes(r.kind)) { add('orientation', r.kind); }
    }
  }
  if (items.type.length === 0) {
    return null;
  }
  return items;
}

export const LEGEND_GROUPS = {
  lithology: 'Lithology', contact: 'Contacts and surfaces', surface: 'Contacts and surfaces',
  relief: 'Relief in the field', symbol: 'Structures, fossils and other symbols',
  orientation: 'Orientation measurements (dip and dip direction, plunge and trend)'
};

/** .legend_height(items, w) */
export function legendHeight(items, w) {
  if (items === null || items === undefined || nrow(items) === 0) {
    return 0;
  }
  const g = GEO;
  const ncol = Math.max(1, Math.floor(w / g.leg_colw));
  const grp = items.type.map((t) => LEGEND_GROUPS[t]);
  let h = 0.05;
  for (const gr of unique(grp)) {
    h = h + g.leg_head + Math.ceil(grp.filter((x) => x === gr).length / ncol) * g.leg_row;
  }
  return h;
}

/** .draw_legend(items, w, h, p) */
export function drawLegend(items, w, h, p) {
  inchWindow(w, h);
  const g = GEO;
  const ncol = Math.max(1, Math.floor(w / g.leg_colw));
  const cw = w / ncol;
  const grp = items.type.map((t) => LEGEND_GROUPS[t]);
  let y = h - 0.02;
  segments(0, h - 0.01, w, h - 0.01, { lwd: 0.6, col: 'grey50' });
  for (const gr of unique(grp)) {
    const it = dfSub(items, grp.map((x) => x === gr));
    text(0, y - g.leg_head / 2, gr, { adj: [0, 0.5], font: 2, cex: 0.72 });
    y = y - g.leg_head;
    const nit = nrow(it);
    for (let k = 1; k <= nit; k++) {
      const cx = ((k - 1) % ncol) * cw;
      const yc = y - Math.floor((k - 1) / ncol) * g.leg_row - g.leg_row / 2;
      legendKey({ type: it.type[k - 1], name: it.name[k - 1], colour: it.colour[k - 1] }, cx, yc, p);
      const lab = it.type[k - 1] === 'orientation' ? oriLabel(it.name[k - 1]) : label(it.name[k - 1]);
      text(cx + 0.55, yc, lab, { adj: [0, 0.5], cex: fitCex(lab, 0.62, cw - 0.62) });
    }
    y = y - Math.ceil(nit / ncol) * g.leg_row;
  }
}

// app extra: the cex of a translated label wider than maxIn inches, made
// smaller to fit (whole points, at least 4 pt); untranslated labels keep cex
function fitCex(lab, cex, maxIn) {
  if (!textTranslated() || !(maxIn > 0)) { return cex; }
  const sw = strwidth(lab, { cex, units: 'inches' });
  if (sw <= maxIn) { return cex; }
  const d = devCur();
  const unit = d.ps * d.cex;
  const size = Math.floor(unit * cex + 0.5);
  return Math.max(4, Math.floor(size * maxIn / sw)) / unit;
}

/** .legend_key(it, x, y, p): the key of one legend item {type, name, colour}. */
export function legendKey(it, x, y, p) {
  const bw = 0.45;
  const bh = 0.2;
  if (it.type === 'lithology') {
    const xs = [0, bw, bw, 0].map((v) => x + v);
    const ys = [-bh, -bh, bh, bh].map((v) => y + v / 2);
    if (!isNA(it.colour)) {
      polygon(xs, ys, { col: it.colour, border: NaN });
    }
    fillPattern(xs, ys, it.name, {
      scale: p.options.pattern_scale * 0.8, border: 'black', borderLwd: 0.6,
      bg: isNA(it.colour) ? null : NaN
    });
  } else if (it.type === 'contact') {
    // the fault line reaches outside the beds: draw a narrower key
    const xl = x;
    const kw = it.name === 'fault' ? [0.7 * bw, 0.55 * bw] : [bw, bw * 0.75];
    const pl = prettyLitholog([y - 0.11, y], [y, y + 0.1], [xl + kw[0], xl + kw[1]], {
      contact: ['sharp', it.name], amp: 0.04, wavelength: 0.08, left: xl, corner: 0.02,
      upi: [1, 1]
    });
    drawBeds(pl, { pattern: ['sandstone', 'limestone'], patternScale: 0.6, lwd: 0.7 });
  } else if (it.type === 'surface') {
    const pl = prettyLitholog([y - 0.11], [y + 0.08], [x + bw], {
      surface: it.name, left: x, corner: 0.02, upi: [1, 1]
    });
    drawBeds(pl, { pattern: 'limestone', patternScale: 0.6, lwd: 0.7 });
  } else if (it.type === 'relief') {
    if (it.name === 'smooth') {
      drawRelief([y - 0.11, y], [y, y + 0.11], [0.3, 0.9], x + bw - 0.3, x + bw,
        { style: 'smooth', upi: [1, 1] });
    } else if (it.name === 'niche') {
      // a niche is a hollow between two ledges
      drawRelief([y - 0.11, y - 0.05, y + 0.05], [y - 0.05, y + 0.05, y + 0.11], [0.8, -0.7, 0.8], x + bw - 0.3, x + bw,
        { shape: ['bank', 'niche', 'bank'], upi: [1, 1] });
    } else {
      drawRelief([y - 0.11], [y + 0.11], [0.8], x + bw - 0.3, x + bw,
        { shape: it.name, upi: [1, 1] });
    }
    segments(x + bw, y - 0.12, x + bw, y + 0.12, { lwd: 0.6 });
  } else if (it.type === 'orientation') {
    const ln = orientationKinds().find((r) => r.kind === it.name).type === 'line';
    if (ln) {
      arrows(x + bw / 2, y, x + bw / 2 + 0.12, y + 0.06, { length: 0.035, lwd: 0.8 });
    } else {
      segments(x + bw / 2, y, x + bw / 2 + 0.12, y + 0.06, { lwd: 0.8 });
    }
    orientationMark(x + bw / 2, y, it.name, { size: 0.08, upi: [1, 1] });
  } else {
    logSymbol(it.name, x + bw / 2, y, { size: 0.2 });
  }
}

/** Alias (spelling used in the task description). */
export const stataPdf = strataPdf;

const oriLabel = (kind) => orientationKinds().find((r) => r.kind === kind).label.toLowerCase();
