// engine.js: what the Android app asked of the R engine (r/engine.R), in JavaScript ####
//
// The app keeps its project as {meta, options, beds: [rows], symbols: [rows],
// units: [rows], palette}. The R bridge passed it through CSV / TSV files
// (every value as text); engineLoad() reproduces that conversion, so the
// results are those of engine_load() + Strativis.

import { strataProject } from './sv_project.js';
import { strataPlan, drawPage, strataPdf, columnArgs, cutInterval, drawCoords, palaeocurrents } from './sv_document.js';
import { stratColumn } from './lg_column.js';
import { dfToRows } from './rbase.js';
import { openDevice, devCur, devSet, par, rect, plotNew, plotWindow, NullBackend, CanvasBackend, SvgBackend } from './rgfx.js';
import { roseDiagram, stereonet, oriValues } from './lg_extra.js';
import { strataExport } from './sv_export.js';
import { patternNames } from './lg_patterns.js';
import { grainScale } from './lg_grain.js';
import { contactNames } from './lg_beds.js';
import { symbolNames } from './lg_symbols.js';
import { lithoColours } from './lg_colours.js';
import { exampleLog } from './lg_column.js';
import { asNumericR } from './lg_utils.js';

export const BED_FIELDS = ['id', 'thickness', 'base', 'top', 'lithology', 'grain', 'grain_top', 'contact',
  'side', 'surface', 'structure', 'fossils', 'bioturbation', 'relief', 'relief_shape', 'fill', 'description', 'fault_angle', 'fault_sense', 'dip', 'dip_dir', 'bouma'];
export const SYM_FIELDS = ['dt', 'name', 'column', 'angle', 'bed', 'pos'];
export const UNIT_FIELDS = ['base', 'top', 'level', 'name', 'fill'];
export const SAMPLE_FIELDS = ['id', 'dt', 'top'];
export const CURVE_FIELDS = ['name', 'unit', 'dt', 'value'];
export const PHOTO_FIELDS = ['id', 'dt', 'bed', 'pos', 'caption', 'file'];
export const ORI_FIELDS = ['id', 'dt', 'bed', 'pos', 'kind', 'strike', 'dip', 'dip_dir', 'trend', 'plunge', 'note'];

// app.js isNA()
const appNA = (v) => v === null || v === undefined || v === '' || (typeof v === 'number' && isNaN(v));

// rows -> character columns as read.csv(colClasses = "character", na.strings = c("", "NA")); null if no rows
function readTab(rows, fields) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  const out = {};
  for (const f of fields) {
    out[f] = rows.map((r) => {
      if (appNA(r[f])) { return null; }
      const s = String(r[f]);
      return s === '' || s === 'NA' ? null : s;
    });
  }
  return out;
}

// object -> the strings .read_kv() reads back from toKV()
function readKv(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const s = String(appNA(v) ? '' : v).replace(/\n/g, '\\n');
    out[k] = s.replace(/\\n/g, '\n');
  }
  return out;
}

/** engine_load(): the app's project -> a Strativis project. */
export function engineLoad(project) {
  const p = project || {};
  const o0 = Object.assign({}, p.options || {});
  o0.legend = o0.legend ? 'TRUE' : 'FALSE';
  o0.stack = o0.stack ? 'TRUE' : 'FALSE';
  o0.bed_numbers = o0.bed_numbers ? 'TRUE' : 'FALSE';
  o0.core = o0.core ? 'TRUE' : 'FALSE';
  o0.rose = o0.rose === false ? 'FALSE' : 'TRUE';
  o0.stereonet = o0.stereonet === false ? 'FALSE' : 'TRUE';
  const o = readKv(o0);
  for (const nm of ['vscale', 'panels']) {
    if (o[nm] !== undefined && !Number.isNaN(asNumericR(o[nm]))) {
      o[nm] = asNumericR(o[nm]);
    }
  }
  const pal = readKv(p.palette || {});
  return strataProject({
    beds: readTab(p.beds, BED_FIELDS),
    symbols: readTab(p.symbols, SYM_FIELDS),
    units: readTab(p.units, UNIT_FIELDS),
    samples: readTab(p.samples, SAMPLE_FIELDS),
    curves: readTab(p.curves, CURVE_FIELDS),
    photos: readTab(p.photos, PHOTO_FIELDS),
    orientations: readTab(p.orientations, ORI_FIELDS),
    meta: readKv(p.meta || {}),
    options: o,
    palette: Object.keys(pal).length ? pal : null
  });
}

/** engine_plan(): {pages, scale, width, height, plan}. */
export function enginePlan(project) {
  const plan = strataPlan(engineLoad(project));
  return { pages: plan.pages.length, scale: plan.scale, width: plan.width, height: plan.height, plan };
}

/** engine_page(k): draws page k (clamped to the pages) on a backend. Returns the plan. */
export function engineDrawPage(project, k, backend) {
  const p = engineLoad(project);
  const plan = strataPlan(p);
  k = Math.max(1, Math.min(k, plan.pages.length));
  return drawPage(p, k, backend, { plan });
}

/** engine_pdf(): Promise<Uint8Array> of the PDF document. */
export function enginePdf(project) {
  return strataPdf(engineLoad(project));
}

/**
 * engine_choices() as an object: {patterns, grains, contacts, surfaces,
 * structures, fossils, symbols: [names], colours: {conventional, pastel,
 * grey: {lithology: colour | null}}, groups: {group: [names]}}.
 */
export function engineChoices() {
  const g = symbolNames({ group: true });
  const gr = (nm) => g[nm] || [];
  const cn = contactNames();
  return {
    patterns: patternNames().filter((v) => v !== 'none'),
    grains: grainScale({ type: 'siliciclastic' }).code.concat(grainScale({ type: 'dunham' }).code),
    contacts: cn.contacts.slice(),
    surfaces: cn.surfaces.slice(),
    structures: gr('Internal bedding structures').concat(gr('Sedimentary / diagenetic structures'), gr('Trace fossils')),
    fossils: gr('Macrofossils').concat(gr('Microfossils'), gr('Additional grains')),
    symbols: symbolNames(),
    colours: {
      conventional: lithoColours({ scheme: 'conventional' }),
      pastel: lithoColours({ scheme: 'pastel' }),
      grey: lithoColours({ scheme: 'grey' })
    },
    groups: Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.slice()]))
  };
}

/** engine_example(): the example beds (column table) with a thickness column. */
export function engineExample() {
  const ex = exampleLog();
  const b = { ...ex.beds };
  b.thickness = b.top.map((v, k) => v - b.base[k]);
  return b;
}

/**
 * engine_export(step): Promise<{filename: string | Uint8Array}>, the files of
 * strata_export() with the PDF (step null or NaN: automatic).
 */
export function engineExport(project, { step = null } = {}) {
  const st = step === null || step === undefined || Number.isNaN(step) ? null : step;
  return strataExport(engineLoad(project), { step: st, pdf: true });
}

/**
 * Small live preview of bed k (app row order) with the beds just below and
 * above it, drawn like the log (same columns, colours and scale) on a canvas
 * `cssWidth` pixels wide. The neighbouring beds are faded.
 */
export function engineBedPreview(project, k, canvas, cssWidth, { height = 1.5 } = {}) {
  const rows = project.beds || [];
  if (!rows[k]) { return; }
  // drawing coordinates (core logs: -depth); beds in the same order as the rows
  const p = drawCoords(engineLoad(project));
  const B = p.beds;
  const n = B.base.length;
  const bed = { base: B.base[k], top: B.top[k] };
  const below = k > 0 ? { base: B.base[k - 1] } : null;
  const above = k < n - 1 ? { top: B.top[k + 1] } : null;
  const y0 = below ? below.base : bed.base;
  const y1 = above ? above.top : bed.top;
  const a = columnArgs(p);
  a.columns = (a.columns || []).filter((c) => c !== 'description');
  const cut = cutInterval(p, y0, y1);
  const args = {
    symbols: cut.symbols.dt && cut.symbols.dt.length ? cut.symbols : null, ...a, ylim: [y0, y1], header: false, reliefBeds: p.beds,
    samples: cut.samples && cut.samples.dt.length ? cut.samples : null, curves: p.curves && p.curves.dt.length ? p.curves : null,
    photos: cut.photos && cut.photos.dt.length ? cut.photos : null,
    orientations: cut.orientations && cut.orientations.dt.length ? cut.orientations : null
  };
  const mai = [0.03, 0.3, 0.03, 0.04];
  const prev = devCur();
  try {
    // width of the drawing, measured first
    openDevice(new NullBackend(), 30, height);
    par({ mai });
    const m = stratColumn(cut.beds, args);
    const W = Math.max(...m.columns.x1) + 0.2 + mai[1] + mai[3];
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const dpi = Math.min(300, cssWidth * dpr / W);
    canvas.width = Math.round(W * dpi);
    canvas.height = Math.round(height * dpi);
    canvas.style.width = (W * dpi / dpr) + 'px';
    canvas.style.height = (height * dpi / dpr) + 'px';
    const be = new CanvasBackend(canvas.getContext('2d'), W, height, dpi);
    openDevice(be, W, height);
    par({ mai });
    stratColumn(cut.beds, args);
    // fade the neighbouring beds
    const u = par('usr');
    if (below) { rect(u[0], u[2], u[1], Number(bed.base), { col: '#FFFFFFB0', border: null }); }
    if (above) { rect(u[0], Number(bed.top), u[1], u[3], { col: '#FFFFFFB0', border: null }); }
  } finally {
    devSet(prev);
  }
}

/**
 * Thumbnails of single beds for the bed list, drawn like the log: pattern,
 * colour, width, contact, shape, surface, plus the relief (induration),
 * structure, bioturbation and fossil columns and their symbols (no
 * description). The columns are those of the whole project, so all rows line
 * up. Returns draw(k, canvas, maxCssWidth, cssHeight) for bed k (app row order).
 */
export function engineBedThumbs(project) {
  const rows = project.beds || [];
  const p = drawCoords(engineLoad(project));
  const a = columnArgs(p);
  a.columns = (a.columns || []).filter((c) => c !== 'description' && c !== 'samples' && c !== 'photos' && c !== 'orientations' && c !== 'bouma' && !c.startsWith('curve:'));
  a.bedNumbers = false;
  const H = 0.6;
  const mai = [0.02, 0.02, 0.02, 0.02];
  let W = null;
  return (k, canvas, maxCssWidth = 300, cssHeight = 64) => {
    if (!rows[k] || k >= p.beds.base.length) { return; }
    const bed = { base: p.beds.base[k], top: p.beds.top[k] };
    if (!(bed.top > bed.base)) { return; }
    const y0 = bed.base, y1 = bed.top;
    const cut = cutInterval(p, y0, y1);
    const args = { symbols: cut.symbols.dt && cut.symbols.dt.length ? cut.symbols : null, ...a, ylim: [y0, y1], header: false, pad: 0.03, reliefBeds: p.beds };
    const prev = devCur();
    try {
      if (W === null) {
        // width of the drawing (the same for every bed: same columns)
        openDevice(new NullBackend(), 30, H);
        par({ mai });
        const m = stratColumn(cut.beds, args);
        W = Math.max(...m.columns.x1) + 0.12 + mai[1] + mai[3];
      }
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      const cssPerIn = Math.min(cssHeight / H, maxCssWidth / W);
      const dpi = cssPerIn * dpr;
      canvas.width = Math.round(W * dpi);
      canvas.height = Math.round(H * dpi);
      canvas.style.width = (W * cssPerIn) + 'px';
      canvas.style.height = (H * cssPerIn) + 'px';
      openDevice(new CanvasBackend(canvas.getContext('2d'), W, H, dpi), W, H);
      par({ mai });
      stratColumn(cut.beds, args);
    } finally {
      devSet(prev);
    }
  };
}

/**
 * Rose diagram of the palaeocurrents (transport symbols) as an SVG image:
 * {svg, n, mean, R}.
 */
export function engineRose(project, { size = 1.6 } = {}) {
  const p = engineLoad(project);
  const pc = palaeocurrents(p);
  const be = new SvgBackend(size, size);
  const prev = devCur();
  let st;
  try {
    openDevice(be, size, size);
    par({ mai: [0, 0, 0, 0] });
    plotNew();
    plotWindow([0, size], [0, size], { xaxs: 'i', yaxs: 'i' });
    st = roseDiagram(pc, size / 2, size / 2 - 0.06, { radius: size * 0.38, bin: p.options.rose_bin, upi: [1, 1] });
  } finally {
    devSet(prev);
  }
  return { svg: be.svg(), ...st };
}

/**
 * Stereonet of the orientation measurements (lower hemisphere, equal area):
 * {svg, planes, lines}.
 */
export function engineStereonet(project, { size = 1.6, greatCircles = true } = {}) {
  const p = engineLoad(project);
  const rows = p.orientations && p.orientations.dt.length ? dfToRows(p.orientations) : [];
  const be = new SvgBackend(size, size);
  const prev = devCur();
  let st;
  try {
    openDevice(be, size, size);
    par({ mai: [0, 0, 0, 0] });
    plotNew();
    plotWindow([0, size], [0, size], { xaxs: 'i', yaxs: 'i' });
    st = stereonet(rows, size / 2, size / 2 - 0.06, { radius: size * 0.38, greatCircles, upi: [1, 1] });
  } finally {
    devSet(prev);
  }
  return { svg: be.svg(), ...st };
}

/**
 * Mean orientation per kind of measurement: planes from the vector mean of
 * their poles ({kind, type, n, dip, dip_dir, R}), lines from the vector mean
 * of the lines ({kind, type, n, plunge, trend, R}).
 */
export function engineOrientationStats(project) {
  const p = engineLoad(project);
  if (!p.orientations || !p.orientations.dt.length) { return []; }
  const rows = dfToRows(p.orientations);
  const vv = oriValues(rows);
  const r = Math.PI / 180;
  const acc = new Map();
  rows.forEach((o, j) => {
    const v = vv[j];
    if (!Number.isFinite(v.value) || !Number.isFinite(v.azimuth)) { return; }
    // unit vector pointing down: pole of the plane or the line itself (x east, y north, z up)
    const tr = v.type === 'plane' ? v.azimuth + 180 : v.azimuth;
    const pl = v.type === 'plane' ? 90 - v.value : v.value;
    const e = [Math.cos(pl * r) * Math.sin(tr * r), Math.cos(pl * r) * Math.cos(tr * r), -Math.sin(pl * r)];
    if (!acc.has(o.kind)) { acc.set(o.kind, { kind: o.kind, type: v.type, n: 0, s: [0, 0, 0] }); }
    const a = acc.get(o.kind);
    a.n += 1;
    for (let i = 0; i < 3; i++) { a.s[i] += e[i]; }
  });
  const out = [];
  for (const a of acc.values()) {
    const L = Math.hypot(a.s[0], a.s[1], a.s[2]);
    if (L === 0) { continue; }
    const pl = Math.asin(Math.min(1, -a.s[2] / L)) / r;
    const tr = ((Math.atan2(a.s[0], a.s[1]) / r) % 360 + 360) % 360;
    if (a.type === 'plane') {
      out.push({ kind: a.kind, type: a.type, n: a.n, dip: 90 - pl, dip_dir: (tr + 180) % 360, R: L / a.n });
    } else {
      out.push({ kind: a.kind, type: a.type, n: a.n, plunge: pl, trend: tr, R: L / a.n });
    }
  }
  return out;
}
