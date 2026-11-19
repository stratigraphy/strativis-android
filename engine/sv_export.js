// sv_export.js: Strativis export.R (export of a section for other R packages) ####
//
// strataExport() returns the files instead of writing them:
// {filename: string (UTF-8 text) | Uint8Array (PDF)}.

import { col2rgb } from './rgfx.js';
import { isNA, nrow, unique } from './rbase.js';
import { seqByStrict } from './lg_utils.js';
import { grainWidth, grainScale } from './lg_grain.js';
import { normaliseProject, projectToJson, formatRealR, roundR } from './sv_project.js';
import { schemeColours, strataPdf } from './sv_document.js';

const asArr = (v) => (Array.isArray(v) ? v : [v]);

// CSV text as utils::write.csv(d, row.names = FALSE, na = "") writes it
export function writeCsv(d) {
  const cols = Object.keys(d);
  const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  const cell = (v) => {
    if (isNA(v)) { return ''; }
    if (typeof v === 'number') { return formatRealR(v, 15); }
    if (typeof v === 'boolean') { return v ? 'TRUE' : 'FALSE'; }
    return q(v);
  };
  const lines = [cols.map(q).join(',')];
  const n = nrow(d);
  for (let k = 0; k < n; k++) {
    lines.push(cols.map((c) => cell(d[c][k])).join(','));
  }
  return lines.join('\n') + '\n';
}

/** strata_litholog(project): {l, r, h, i, lithology, colour}. */
export function strataLitholog(project) {
  const p = normaliseProject(project);
  const b = p.beds;
  const h = asArr(grainWidth(b.grain, { type: p.options.scale }));
  return {
    l: b.base.slice(), r: b.top.slice(), h, i: b.id.slice(), lithology: b.lithology.slice(),
    colour: bedHex(p)
  };
}

/** .bed_hex(p): colour of each bed: own fill, palette, scheme (white when none). */
export function bedHex(p) {
  const b = p.beds;
  const pal = schemeColours(p);
  return b.fill.map((v, k) => {
    let col = v;
    if (isNA(col)) {
      const l = b.lithology[k];
      col = !isNA(l) && Object.hasOwn(pal, l) ? pal[l] : null;
    }
    if (isNA(col)) { col = '#FFFFFF'; }
    return String(col).toUpperCase();
  });
}

/** .phi_of(g, scale): phi of grain-size classes (siliciclastic scale only). */
export function phiOf(g, scale) {
  const sc = grainScale({ type: 'siliciclastic' });
  const out = new Array(g.length).fill(NaN);
  if (scale !== 'siliciclastic') {
    return out;
  }
  const v = asArr(grainWidth(g, { type: 'siliciclastic' }));
  for (let k = 0; k < v.length; k++) {
    const r = roundR(v[k], 0);
    const j = sc.value.map((x, i) => (x === r ? i : -1)).filter((i) => i >= 0);
    if (j.length === 1) {
      out[k] = sc.phi[j[0]];
    }
  }
  return out;
}

/** .lab_of(hex): CIE L*a*b* of colours, {L, a, b} arrays. */
export function labOf(hex) {
  const L = [], A = [], B = [];
  const f = (t) => (t > 0.008856 ? Math.pow(t, 1 / 3) : 7.787 * t + 16 / 116);
  for (const h of hex) {
    const m = col2rgb(h).map((v) => v / 255);
    const lin = m.map((v) => (v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92));
    const X = (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047;
    const Y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    const Z = (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883;
    L.push(116 * f(Y) - 16);
    A.push(500 * (f(X) - f(Y)));
    B.push(200 * (f(Y) - f(Z)));
  }
  return { L, a: A, b: B };
}

// findInterval(x, vec, rightmost.closed): 1-based interval numbers (0 below)
export function findInterval(x, vec, { rightmostClosed = false } = {}) {
  for (let j = 0; j < vec.length; j++) {
    if (isNA(vec[j]) || (j > 0 && vec[j] < vec[j - 1])) {
      throw new Error("'vec' must be sorted non-decreasingly and not contain NAs");
    }
  }
  const n = vec.length;
  return x.map((v) => {
    if (isNA(v)) { return NaN; }
    let lo = 0, hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (vec[mid] <= v) { lo = mid + 1; } else { hi = mid; }
    }
    if (rightmostClosed && lo === n && n > 0 && v === vec[n - 1]) {
      // the last interval is closed: x at its right end belongs to it
      return n - 1;
    }
    return lo;
  });
}

/**
 * strata_series(project, step = NULL, gaps = NA): evenly sampled depth series.
 * Column table with non-enumerable `levels` and `step` (R attributes).
 */
export function strataSeries(project, { step = null, gaps = NaN } = {}) {
  const p = normaliseProject(project);
  const b = p.beds;
  if (nrow(b) === 0) {
    throw new Error('The project has no beds');
  }
  const lo = Math.min(...b.base);
  const hi = Math.max(...b.top);
  if (step === null || step === undefined) {
    const raw = (hi - lo) / 2000;
    const e = Number('1e' + Math.floor(Math.log10(raw)));
    const c = [1, 2, 5, 10];
    step = c[c.findIndex((v) => v * e >= raw)] * e;
  }
  const depth = seqByStrict(lo, hi, step);
  let k = findInterval(depth, b.base, { rightmostClosed: true });
  k = k.map((v) => (v < 1 ? NaN : v));
  k = k.map((v, i) => {
    const kk = isNA(v) ? NaN : Math.max(v, 1);
    const inside = !isNA(v) && depth[i] <= b.top[kk - 1] + 1e-12;
    return inside ? v : NaN;
  });
  const atN = (arr, i) => (isNA(k[i]) ? NaN : arr[k[i] - 1]);
  const atS = (arr, i) => (isNA(k[i]) ? null : arr[k[i] - 1]);
  const sc = p.options.scale;
  const g0 = asArr(grainWidth(b.grain, { type: sc }));
  const gt = b.grain_top.map((v, j) => (isNA(v) ? b.grain[j] : v));
  const g1 = asArr(grainWidth(gt, { type: sc }));
  const u = depth.map((d, i) => (d - atN(b.base, i)) / atN(b.thickness, i));
  const grain = depth.map((_, i) => atN(g0, i) + (atN(g1, i) - atN(g0, i)) * u[i]);
  const ph0 = phiOf(b.grain, sc);
  const ph1 = phiOf(gt, sc);
  const phi = depth.map((_, i) => atN(ph0, i) + (atN(ph1, i) - atN(ph0, i)) * u[i]);
  const hex = bedHex(p);
  const rgb = hex.map((h) => col2rgb(h));
  const lab = labOf(hex);
  const levs = unique(b.lithology);
  const lithCode = b.lithology.map((v) => levs.indexOf(v) + 1);
  const rel = b.relief.map((v) => (isNA(v) ? 0 : v));
  const R = rgb.map((v) => v[0]), G = rgb.map((v) => v[1]), Bl = rgb.map((v) => v[2]);
  const out = {
    depth,
    bed: depth.map((_, i) => atS(b.id, i)),
    lithology: depth.map((_, i) => atS(b.lithology, i)),
    lith_code: depth.map((_, i) => atN(lithCode, i)),
    grain_class: grain,
    phi,
    relief: depth.map((_, i) => atN(rel, i)),
    red: depth.map((_, i) => atN(R, i)),
    green: depth.map((_, i) => atN(G, i)),
    blue: depth.map((_, i) => atN(Bl, i)),
    grey: depth.map((_, i) => (isNA(k[i]) ? NaN :
      roundR(0.299 * R[k[i] - 1] + 0.587 * G[k[i] - 1] + 0.114 * Bl[k[i] - 1], 2))),
    L: depth.map((_, i) => roundR(atN(lab.L, i), 3)),
    a: depth.map((_, i) => roundR(atN(lab.a, i), 3)),
    b: depth.map((_, i) => roundR(atN(lab.b, i), 3))
  };
  if (!isNA(gaps)) {
    const num = ['lith_code', 'grain_class', 'phi', 'relief', 'red', 'green', 'blue', 'grey', 'L', 'a', 'b'];
    for (const cn of num) {
      out[cn] = out[cn].map((v, i) => (isNA(k[i]) ? gaps : v));
    }
  }
  if (p.options.core === true && nrow(b) > 0) {
    // core logs: depth below the top depth (option base)
    const tt = Math.max(...b.top);
    out.core_depth = depth.map((d) => p.options.base + tt - d);
  }
  Object.defineProperty(out, 'levels', { value: levs, enumerable: false });
  Object.defineProperty(out, 'step', { value: step, enumerable: false });
  return out;
}

/** .opt_strings(x): options as one string each. */
export function optStrings(x) {
  return Object.values(x).map((v) => formatVec(asArr(v)).join(','));
}

// format() of a vector: numbers with common decimals, all padded to a common width
function formatVec(v) {
  if (v.length <= 1) {
    return v.map(formatOne);
  }
  let s;
  let right = true;
  if (v.every((e) => typeof e === 'number' || isNA(e)) && v.some((e) => typeof e === 'number')) {
    let rgt = 0;
    for (const e of v) {
      if (isNA(e) || !Number.isFinite(e)) { continue; }
      const t = formatRealR(e, 7);
      if (!t.includes('e') && t.includes('.')) { rgt = Math.max(rgt, t.length - t.indexOf('.') - 1); }
    }
    s = v.map((e) => (isNA(e) ? 'NA' : (Number.isFinite(e) ? e.toFixed(rgt) : formatOne(e))));
  } else {
    right = v.every((e) => typeof e === 'boolean' || isNA(e));
    s = v.map(formatOne);
  }
  const w = Math.max(...s.map((e) => e.length));
  return s.map((e) => (right ? e.padStart(w) : e.padEnd(w)));
}

// format() of one value
function formatOne(v) {
  if (isNA(v)) { return 'NA'; }
  if (typeof v === 'number') { return formatRealR(v, 7); }
  if (typeof v === 'boolean') { return v ? 'TRUE' : 'FALSE'; }
  return String(v);
}

/** .load_script(name): lines of load_section.R. */
export function loadScript(name) {
  return [
    '# load_section.R: reads a section exported by Strativis ####',
    '# Run it from the folder that holds the exported files.',
    '',
    'beds <- read.csv("beds.csv", stringsAsFactors = FALSE)',
    'series <- read.csv("series.csv", stringsAsFactors = FALSE)',
    'litho <- read.csv("litholog.csv", stringsAsFactors = FALSE)',
    'symbols <- read.csv("symbols.csv", stringsAsFactors = FALSE)',
    'units <- read.csv("units.csv", stringsAsFactors = FALSE)',
    'samples <- read.csv("samples.csv", stringsAsFactors = FALSE)',
    'curves <- read.csv("curves.csv", stringsAsFactors = FALSE)',
    'photos <- read.csv("photos.csv", stringsAsFactors = FALSE)  # images in the photos folder',
    'orientations <- read.csv("orientations.csv", stringsAsFactors = FALSE)',
    '',
    '# Strativis: the full project, the PDF, the series ####',
    'if (requireNamespace("Strativis", quietly = TRUE)) {',
    '  p <- Strativis::read_strata("' + name + '.strata.json")',
    '  print(p)',
    '  # Strativis::strata_pdf(p, "my_log.pdf")',
    '  # Strativis::run_app(p)',
    '}',
    '',
    '# StratigrapheR: litholog polygons from base (l), top (r), hardness (h) ####',
    'if (requireNamespace("StratigrapheR", quietly = TRUE)) {',
    '  log <- StratigrapheR::litholog(l = litho$l, r = litho$r, h = litho$h, i = litho$i)',
    '  StratigrapheR::whiteSet(xlim = c(0, max(litho$h) + 1), ylim = range(c(litho$l, litho$r)))',
    '  StratigrapheR::multigons(log$i, log$xy, log$dt, col = litho$colour)',
    '}',
    '',
    '# WaverideR (or astrochron): evenly sampled two-column series ####',
    '# grain_class, phi, grey, L, lith_code... can all be used as proxies',
    'proxy <- series[!is.na(series$grain_class), c("depth", "grain_class")]',
    'if (requireNamespace("WaverideR", quietly = TRUE)) {',
    '  # wt <- WaverideR::analyze_wavelet(data = proxy, dj = 1/100, lowerPeriod = 0.1,',
    '  #   upperPeriod = diff(range(proxy$depth)) / 2, verbose = FALSE, omega_nr = 6)',
    '  # WaverideR::plot_wavelet(wt)',
    '}',
    'plot(proxy$grain_class, proxy$depth, type = "s", xlab = "grain-size class", ylab = "depth")'
  ];
}

/** File name stub of a project: the title with other characters as "_". */
export function exportName(p) {
  let name = String(p.meta.title).replace(/[^A-Za-z0-9_-]+/g, '_');
  if (name === '' || name === '_') {
    name = 'section';
  }
  return name;
}

/**
 * strata_export(project, dir, step = NULL, pdf = TRUE) without the folder:
 * Promise<{filename: string | Uint8Array}> in the order R writes the files.
 */
export async function strataExport(project, { step = null, pdf = true } = {}) {
  const p = normaliseProject(project);
  const name = exportName(p);
  const files = {};
  const b = { ...p.beds };
  b.colour = bedHex(p);
  b.grain_class = asArr(grainWidth(b.grain, { type: p.options.scale }));
  const gt = b.grain_top.map((v, k) => (isNA(v) ? b.grain[k] : v));
  b.grain_top_class = asArr(grainWidth(gt, { type: p.options.scale }));
  b.phi = phiOf(b.grain, p.options.scale);
  if (p.options.core === true && nrow(p.beds) > 0) {
    const tt = Math.max(...p.beds.top);
    b.depth_top = p.beds.top.map((v) => p.options.base + tt - v);
    b.depth_base = p.beds.base.map((v) => p.options.base + tt - v);
  }
  files['beds.csv'] = writeCsv(b);
  files['litholog.csv'] = writeCsv(strataLitholog(p));
  const s = strataSeries(p, { step });
  files['series.csv'] = writeCsv(s);
  files['symbols.csv'] = writeCsv(p.symbols);
  files['units.csv'] = writeCsv(p.units);
  files['samples.csv'] = writeCsv(p.samples);
  files['curves.csv'] = writeCsv(p.curves);
  files['photos.csv'] = writeCsv(p.photos);
  files['orientations.csv'] = writeCsv(p.orientations);
  const md = {
    key: Object.keys(p.meta).map((k) => 'meta.' + k)
      .concat(Object.keys(p.options).map((k) => 'option.' + k), ['series.step', 'series.lith_codes']),
    value: Object.values(p.meta).concat(optStrings(p.options),
      [formatRealR(s.step, 7), s.levels.map((l, k) => (k + 1) + '=' + (isNA(l) ? 'NA' : l)).join('; ')])
  };
  files['metadata.csv'] = writeCsv(md);
  const pal = schemeColours(p);
  const used = unique(p.beds.lithology);
  files['palette.csv'] = writeCsv({
    lithology: used,
    colour: used.map((l) => (Object.hasOwn(pal, l) && !isNA(pal[l]) ? pal[l] : null)),
    source: used.map((l) => (Object.hasOwn(p.palette, l) ? 'palette' : p.options.colours))
  });
  files[name + '.strata.json'] = projectToJson(p);
  if (pdf) {
    files[name + '.pdf'] = await strataPdf(p);
  }
  files['load_section.R'] = loadScript(name).join('\n') + '\n';
  return files;
}
