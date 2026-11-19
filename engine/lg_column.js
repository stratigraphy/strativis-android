// lg_column.js: lithoglyph strat_column.R and legend.R ####
//
// strat_column() draws a complete sedimentary log; example_log() returns the
// example section; log_legend() draws a catalogue of patterns, symbols or
// contacts. Tables are column tables, NA is NaN (numbers) or null.

import {
  par, plotNew, plotWindow, polygon, segments, text, arrows, axis, pretty, formatNums
} from './rgfx.js';
import { isNA, nrow, dfFromRows, dfToRows } from './rbase.js';
import { upiUser, matchArg, rMod } from './lg_utils.js';
import { fillPattern, patternNames } from './lg_patterns.js';
import { bedColours } from './lg_colours.js';
import { grainScale, grainWidth } from './lg_grain.js';
import { logSymbol, symbolNames } from './lg_symbols.js';
import { prettyLitholog, drawBeds, contactTypes, drawFault, FAULT_SYMBOLS, widthAt } from './lg_beds.js';
import { drawRelief } from './lg_relief.js';
import { drawExtraColumns, curveHeader, drawPhotoColumn, drawBoumaColumn, drawOrientationColumn, nBouma } from './lg_extra.js';

// Constants ####

/** .col_default_width */
export const COL_DEFAULT_WIDTH = {
  relief: 0.5, structures: 0.5, transport: 0.35, bioturbation: 0.35,
  fossils: 0.7, samples: 0.6, photos: 0.4, description: 1.8, bednum: 0.25, curve: 0.9,
  bouma: 0.3, orientations: 0.7
};

/** .col_header */
export const COL_HEADER = {
  relief: 'Relief', composition: 'Compos.\ntexture', structures: 'Sedimentary\nstructures',
  transport: 'Transport\ndirection', bioturbation: 'Bioturb.',
  fossils: 'Fossil\ncontent', samples: 'Samples', photos: 'Photos', description: 'Description', bednum: 'Bed',
  bouma: 'Bouma', orientations: 'Dip'
};

// Helpers ####

const asArr = (v) => (Array.isArray(v) ? v : [v]);

// x[[nm]] of a named vector: error when the name is missing, as R
function getNamed(obj, nm) {
  if (!Object.hasOwn(obj, nm)) {
    throw new Error('subscript out of bounds');
  }
  return obj[nm];
}

// as.data.frame(): accept a column table or an array of row objects
const cpRows = (cp) => cp.name.map((name, k) => ({ name, x0: cp.x0[k], x1: cp.x1[k] }));

function asTable(d) {
  if (Array.isArray(d)) {
    return dfFromRows(d);
  }
  const out = {};
  for (const [k, v] of Object.entries(d)) { out[k] = asArr(v).slice(); }
  // recycle length-1 columns as data.frame() does
  const n = Math.max(0, ...Object.values(out).map((v) => v.length));
  for (const k of Object.keys(out)) {
    if (out[k].length === 1 && n > 1) { out[k] = new Array(n).fill(out[k][0]); }
  }
  return out;
}

/** .get_col(d, names, default = NULL): first column of `d` among `names`, or rep(default) (null if no default). */
export function getCol(d, names, { default: def = null } = {}) {
  for (const nm of asArr(names)) {
    if (Object.hasOwn(d, nm)) {
      return d[nm];
    }
  }
  if (def === null || def === undefined) {
    return null;
  }
  return new Array(nrow(d)).fill(def);
}

/** .split_list(x): "a, b; c" -> ['a', 'b', 'c']. */
export function splitList(x) {
  if (isNA(x) || x === '') {
    return [];
  }
  const v = String(x).split(/[,;]/).map((s) => s.replace(/^[\t\r\n ]+|[\t\r\n ]+$/g, ''));
  return v.filter((s) => s !== '');
}

// strat_column ####

/**
 * strat_column(beds, symbols = NULL, layout = c("combined", "structures"),
 * scale = c("siliciclastic", "dunham"), columns = NULL, column_width = NULL,
 * class_width = 0.17, comp_width = 0.32, symbol_size = 0.15, ylim = NULL,
 * depth_lab = "m", header = TRUE, header_height = 0.75, corner = 0.05,
 * amp = 0.06, wavelength = 0.18, round = "exposed", pattern_scale = 1,
 * lwd = 1, cex = 0.7, guides = FALSE, relief_style = "beds",
 * colours = "none", n_classes = NULL)
 * Returns {litholog, columns: {name, x0, x1}, x0, class_width, ytop}.
 */
export function stratColumn(beds, {
  symbols = null, layout = undefined, scale = undefined, columns = null,
  columnWidth = null, classWidth = 0.17, compWidth = 0.32, symbolSize = 0.15,
  ylim = null, depthLab = 'm', header = true, headerHeight = 0.75,
  corner = 0.05, amp = 0.06, wavelength = 0.18, round = 'exposed',
  patternScale = 1, lwd = 1, cex = 0.7, guides = false, reliefStyle = 'beds',
  colours = 'none', nClasses = null, pad = null, reliefBeds = null, minorTicks = 0,
  samples = null, curves = null, curveLimits = null, bedNumbers = false, photos = null, depthDown = false,
  orientations = null, tickStep = null
} = {}) {
  if (layout === 'utrecht' || (Array.isArray(layout) && layout.length === 1 && layout[0] === 'utrecht')) {
    layout = 'structures'; // name used before version 0.4.0
  }
  layout = matchArg(layout, ['combined', 'structures']);
  scale = matchArg(scale, ['siliciclastic', 'dunham']);
  const userColumns = columns !== null && columns !== undefined;
  beds = asTable(beds);
  const n = nrow(beds);
  let base = getCol(beds, ['base', 'bottom', 'from']);
  let top = getCol(beds, ['top', 'to']);
  if (base === null || top === null) {
    const th = getCol(beds, ['thickness', 'h']);
    if (th === null) {
      throw new Error("'beds' needs 'base' and 'top' columns, or a 'thickness' column");
    }
    top = [];
    let s = 0;
    for (const v of th) { s += v; top.push(s); }
    base = top.map((v, k) => v - th[k]);
  }
  const lith = getCol(beds, ['lithology', 'lith', 'pattern'], { default: 'none' });
  const grain = getCol(beds, ['grain', 'grain_size', 'texture'], { default: 'm' });
  const gb = asArr(grainWidth(grain, { type: scale })).slice();
  let gt = getCol(beds, ['grain_top']);
  gt = gt === null ? gb.slice() : asArr(grainWidth(gt.map((v, k) => (isNA(v) ? grain[k] : v)), { type: scale }));
  const contact = getCol(beds, ['contact', 'base_contact'], { default: 'sharp' }).map((v) => (isNA(v) ? 'sharp' : v));
  const side = getCol(beds, ['side'], { default: 'straight' }).map((v) => (isNA(v) ? 'straight' : v));
  const surface = getCol(beds, ['surface'], { default: 'none' }).map((v) => (isNA(v) ? 'none' : v));
  const structure = getCol(beds, ['structure', 'structures'], { default: NaN });
  const fossils = getCol(beds, ['fossils', 'fossil'], { default: NaN });
  const biot = getCol(beds, ['bioturbation', 'bioturb'], { default: NaN });
  const descr = getCol(beds, ['description', 'descr'], { default: NaN });
  const bouma = getCol(beds, ['bouma'], { default: NaN });
  let bfill = getCol(beds, ['fill', 'colour', 'color'], { default: NaN }).map((v) => (!isNA(v) && v === '' ? null : v));
  const autoFill = bedColours(lith, colours);
  bfill = bfill.map((v, k) => (isNA(v) ? autoFill[k] : v));
  const corner1 = asArr(corner)[0];
  const bcorner = getCol(beds, ['corner'], { default: NaN }).map((v) => (isNA(v) ? corner1 : v));
  const relief = getCol(beds, ['relief'], { default: NaN });
  const reliefShape = getCol(beds, ['relief_shape'], { default: 'bank' });
  const faultAngle = getCol(beds, ['fault_angle'], { default: 0 }).map((v) => {
    const q = isNA(v) ? NaN : Number(v);
    return Number.isNaN(q) ? 0 : q;
  });
  const faultSense = getCol(beds, ['fault_sense'], { default: 'normal' }).map((v) => (isNA(v) ? 'normal' : v));
  let ids = getCol(beds, ['i', 'id', 'bed']);
  if (ids === null) {
    ids = [];
    for (let k = 1; k <= n; k++) { ids.push('B' + k); }
  }

  if (samples) { samples = asTable(samples); if ((samples.dt || []).length === 0) { samples = null; } }
  if (curves) { curves = asTable(curves); if ((curves.name || []).length === 0) { curves = null; } }
  if (photos) { photos = asTable(photos); if ((photos.dt || []).length === 0) { photos = null; } }
  if (orientations) { orientations = asTable(orientations); if ((orientations.dt || []).length === 0) { orientations = null; } }
  let faultSyms = null;
  if (symbols !== null && symbols !== undefined) {
    symbols = asTable(symbols);
    const ns = nrow(symbols);
    if (!Object.hasOwn(symbols, 'column')) {
      symbols.column = new Array(ns).fill('structures');
    }
    if (!Object.hasOwn(symbols, 'angle')) {
      symbols.angle = new Array(ns).fill(0);
    }
    if (!Object.hasOwn(symbols, 'size')) {
      symbols.size = new Array(ns).fill(NaN);
    }
    // faults inside beds (symbols fault_normal, fault_reverse; angle = dip)
    // are drawn across the profile like fault contacts
    const isF = symbols.name.map((v) => FAULT_SYMBOLS.includes(v));
    if (isF.some(Boolean)) {
      const keep = (want) => {
        const out = {};
        for (const [c, v] of Object.entries(symbols)) { out[c] = v.filter((_, k) => isF[k] === want); }
        return out;
      };
      faultSyms = keep(true);
      symbols = isF.every(Boolean) ? null : keep(false);
    }
  } else {
    symbols = null;
  }

  // Which columns
  if (!userColumns) {
    columns = [];
    const has = (v) => v !== null && v.some((x) => !isNA(x) && x !== '');
    const sc = symbols === null ? [] : [...new Set(symbols.column)];
    if (relief.some((v) => !isNA(v) && v !== 0)) {
      columns.push('relief');
    }
    if (nBouma(bouma).some((v) => v > 0)) {
      columns.push('bouma');
    }
    if ((layout === 'combined' && has(structure)) || sc.includes('structures')) {
      columns.push('structures');
    }
    if (sc.includes('transport')) {
      columns.push('transport');
    }
    if (orientations) {
      columns.push('orientations');
    }
    if (has(biot) || sc.includes('bioturbation')) {
      columns.push('bioturbation');
    }
    if (has(fossils) || sc.includes('fossils')) {
      columns.push('fossils');
    }
    if (samples && (samples.dt || []).length > 0) {
      columns.push('samples');
    }
    if (photos && (photos.dt || []).length > 0) {
      columns.push('photos');
    }
    if (has(descr)) {
      columns.push('description');
    }
    if (curves && (curves.name || []).length > 0) {
      for (const nm of [...new Set(curves.name)]) { columns.push('curve:' + nm); }
    }
  } else {
    columns = asArr(columns).slice();
  }
  const cw = Object.assign({}, COL_DEFAULT_WIDTH);
  if (columnWidth !== null && columnWidth !== undefined) {
    Object.assign(cw, columnWidth);
  }

  // Horizontal layout, in inches
  const scl = grainScale({ type: scale });
  const gmax = Math.max(...[...gb, ...gt].filter((v) => !isNA(v)));
  let ncls = Math.max(Math.ceil(gmax), scale === 'siliciclastic' ? 7 : 5);
  if (nClasses !== null && nClasses !== undefined) {
    ncls = nClasses;
  }
  ncls = Math.min(ncls, nrow(scl));
  // no bed wider than the profile column
  for (let k = 0; k < gb.length; k++) { gb[k] = Math.min(gb[k], ncls + 0.3); }
  for (let k = 0; k < gt.length; k++) { gt[k] = Math.min(gt[k], ncls + 0.3); }
  let x = 0;
  const colpos = { name: [], x0: [], x1: [] };
  const addCol = (nm, a, b) => { colpos.name.push(nm); colpos.x0.push(a); colpos.x1.push(b); };
  if (bedNumbers === true) {
    addCol('bednum', x, x + getNamed(cw, 'bednum'));
    x = x + getNamed(cw, 'bednum');
  }
  columns = columns.filter((v) => v !== 'bednum');
  if (columns.includes('relief')) {
    addCol('relief', x, x + getNamed(cw, 'relief'));
    x = x + getNamed(cw, 'relief');
    columns = [...new Set(columns.filter((v) => v !== 'relief'))];
  }
  if (layout === 'structures') {
    addCol('composition', x, x + compWidth);
    x = x + compWidth;
  }
  const p0 = x;
  const p1 = p0 + (ncls + 0.5) * classWidth;
  addCol('profile', p0, p1);
  x = p1;
  for (const cn of columns) {
    const wd = cn.startsWith('curve:') ? getNamed(cw, 'curve') : getNamed(cw, cn);
    addCol(cn, x, x + wd);
    x = x + wd;
  }
  const xmax = x;

  // Set up the plot: one x unit = one inch
  if (ylim === null || ylim === undefined) {
    const all = [...base, ...top];
    ylim = [Math.min(...all), Math.max(...all)];
  }
  plotNew();
  const pin = par('pin');
  const xl = -0.1;
  plotWindow([xl, xl + Math.max(pin[0], xmax + 0.15)], ylim, { xaxs: 'i', yaxs: 'i' });
  const hh = header ? headerHeight : 0;
  // free space below the base of the section (bed outline and contact marks)
  if (pad === null || pad === undefined) {
    pad = ylim[0] <= Math.min(...base) + 1e-9 ? 0.08 : 0;
  }
  const avail = Math.max(pin[1] - hh - pad, 0.1 * pin[1]);
  const ext = hh * (ylim[1] - ylim[0]) / avail;
  const ytop = ylim[1] + ext;
  const ybot = ylim[0] - pad * (ylim[1] - ylim[0]) / avail;
  plotWindow([xl, xl + Math.max(pin[0], xmax + 0.15)], [ybot, ytop], { xaxs: 'i', yaxs: 'i' });
  const upi = upiUser();

  // Beds
  const pl = prettyLitholog(base, top, gb.map((v) => p0 + v * classWidth), {
    widthTop: gt.map((v) => p0 + v * classWidth), i: ids, contact,
    side, surface, corner: bcorner, amp,
    wavelength, round, left: p0, upi
  });
  const idsChr = ids.map((v) => (isNA(v) ? null : String(v)));
  const o = pl.beds.i.map((v) => idsChr.indexOf(v));
  pl.fault_right = p1 - 0.03 * upi[0];
  pl.contacts.angle = pl.contacts.i.map((v) => faultAngle[idsChr.indexOf(v)]);
  pl.contacts.sense = pl.contacts.i.map((v) => faultSense[idsChr.indexOf(v)]);

  if (guides) {
    for (let v = 1; v <= ncls; v++) {
      segments(p0 + v * classWidth, ylim[0], p0 + v * classWidth, ylim[1], { col: 'grey80', lty: 3, lwd: 0.5 });
    }
  }

  if (layout === 'combined') {
    drawBeds(pl, { pattern: o.map((j) => lith[j]), fill: o.map((j) => bfill[j]), patternScale, lwd });
  } else {
    drawBeds(pl, { pattern: NaN, fill: o.map((j) => bfill[j]), lwd });
    for (let k = 0; k < n; k++) {
      const xs = [p0 - compWidth, p0, p0, p0 - compWidth];
      const ys = [base[k], base[k], top[k], top[k]];
      if (!isNA(bfill[k])) {
        polygon(xs, ys, { col: bfill[k], border: null });
      }
      fillPattern(xs, ys, lith[k], {
        scale: patternScale, border: 'black', borderLwd: lwd * 0.8,
        bg: isNA(bfill[k]) ? null : NaN
      });
    }
  }

  const sz = symbolSize;
  const colIdx = (nm) => colpos.name.reduce((a, v, k) => (v === nm ? [...a, k] : a), []);

  // Relief column
  let cp = colIdx('relief');
  if (cp.length === 1) {
    if (reliefBeds) {
      // app extra (not in R): relief of the whole section, cut at ylim, so that
      // a preview of a few beds shows the relief exactly as in the full log
      const rb = asTable(reliefBeds);
      const rr = getCol(rb, ['relief'], { default: NaN }).map((v) => (isNA(v) ? 0 : v));
      drawRelief(getCol(rb, ['base']), getCol(rb, ['top']), rr, colpos.x0[cp[0]] + 0.03, colpos.x1[cp[0]], {
        shape: getCol(rb, ['relief_shape'], { default: 'bank' }), style: reliefStyle, upi, clip: ylim
      });
    } else {
      const rv = relief.map((v) => (isNA(v) ? 0 : v));
      drawRelief(base, top, rv, colpos.x0[cp[0]] + 0.03, colpos.x1[cp[0]], {
        shape: reliefShape, style: reliefStyle, upi
      });
    }
  }

  // Internal structures drawn inside the white beds (structures layout)
  if (layout === 'structures') {
    for (let k = 0; k < n; k++) {
      const st = splitList(structure[k]);
      if (st.length === 0) {
        continue;
      }
      const w = Math.min(gb[k], gt[k]) * classWidth;
      const xs = st.map((_, j) => p0 + w * (j + 1 - 0.5) / st.length);
      const ssz = Math.min(sz * 1.4, 0.8 * w / st.length, 0.8 * (top[k] - base[k]) / upi[1]);
      logSymbol(st, xs, (base[k] + top[k]) / 2, { size: ssz, bg: 'white' });
    }
  }

  // Symbols of the side columns, from the bed table and the symbol table
  const items = [];
  const item = (column, dt, name, angle, size) => { items.push({ column, dt, name, angle, size }); };
  const cpd = colIdx('description');
  for (let k = 0; k < n; k++) {
    const ym = (base[k] + top[k]) / 2;
    if (layout === 'combined') {
      for (const s1 of splitList(structure[k])) {
        item('structures', ym, s1, 0, sz * 1.3);
      }
    }
    for (const s1 of splitList(fossils[k])) {
      item('fossils', ym, s1, 0, sz);
    }
    if (!isNA(biot[k]) && biot[k] !== '') {
      item('bioturbation', ym, 'bioturbation_' + biot[k], 0, sz);
    }
    if (!isNA(descr[k]) && descr[k] !== '' && cpd.length === 1) {
      text(colpos.x0[cpd[0]] + 0.06, ym, descr[k], { adj: [0, 0.5], cex });
    }
  }
  if (faultSyms !== null) {
    for (let k = 0; k < faultSyms.name.length; k++) {
      const fa = isNA(faultSyms.angle[k]) ? 0 : Number(faultSyms.angle[k]);
      drawFault(p0 / upi[0], widthAt(pl, faultSyms.dt[k]) / upi[0], faultSyms.dt[k] / upi[1], fa,
        faultSyms.name[k] === 'fault_reverse' ? 'reverse' : 'normal', upi, lwd, pl.fault_right / upi[0]);
    }
  }
  if (symbols !== null) {
    const ns = nrow(symbols);
    const bs = [], os = [];
    for (let k = 0; k < ns; k++) {
      (symbols.column[k] === 'bed' ? bs : os).push(k);
    }
    if (bs.length > 0) {
      const xs = Object.hasOwn(symbols, 'xy') ?
        bs.map((k) => p0 + symbols.xy[k] * classWidth) :
        bs.map(() => p0 + 1.5 * classWidth);
      logSymbol(bs.map((k) => symbols.name[k]), xs, bs.map((k) => symbols.dt[k]), {
        size: bs.map((k) => (isNA(symbols.size[k]) ? sz : symbols.size[k])),
        angle: bs.map((k) => symbols.angle[k]), bg: 'white'
      });
    }
    for (const k of os) {
      item(symbols.column[k], symbols.dt[k], symbols.name[k], symbols.angle[k],
        isNA(symbols.size[k]) ? sz : symbols.size[k]);
    }
  }
  if (items.length > 0) {
    for (const cn of [...new Set(items.map((r) => r.column))]) {
      let s = items.filter((r) => r.column === cn);
      cp = colIdx(cn);
      if (cp.length !== 1) {
        if (!userColumns) {
          console.warn("No column '" + cn + "' to draw symbols in");
        }
        continue;
      }
      // order(s$dt): stable, NA last
      s = s.map((r, k) => [r, k]).sort((a, b) => {
        const u = a[0].dt, v = b[0].dt;
        if (isNA(u) && isNA(v)) { return a[1] - b[1]; }
        if (isNA(u)) { return 1; }
        if (isNA(v)) { return -1; }
        return u < v ? -1 : (u > v ? 1 : a[1] - b[1]);
      }).map((p) => Object.assign({}, p[0]));
      // Symbols closer than their height are put side by side
      const cl = [];
      let c = 0;
      for (let k = 0; k < s.length; k++) {
        const gap = (k === 0 ? Infinity : s[k].dt - s[k - 1].dt) / upi[1];
        if (gap > 1.05 * s[k].size) { c++; }
        cl.push(c);
      }
      const xs = new Array(s.length).fill(0);
      const cx0 = colpos.x0[cp[0]];
      const cw1 = colpos.x1[cp[0]] - cx0;
      for (const g of [...new Set(cl)]) {
        const w = [];
        cl.forEach((v, k) => { if (v === g) { w.push(k); } });
        w.forEach((k, j) => {
          xs[k] = cx0 + cw1 * (j + 1 - 0.5) / w.length;
          s[k].size = Math.min(s[k].size, 0.9 * cw1 / w.length);
        });
      }
      logSymbol(s.map((r) => r.name), xs, s.map((r) => r.dt), {
        size: s.map((r) => r.size), angle: s.map((r) => r.angle)
      });
    }
  }

  drawExtraColumns(colpos, ylim, upi, cex, lwd, base, top, getCol(beds, ['number', 'bed_number']), samples, curves, curveLimits);
  drawPhotoColumn(colpos, ylim, upi, cex, lwd, photos);
  drawBoumaColumn(cpRows(colpos), ylim, upi, cex, lwd, base, top, bouma);
  drawOrientationColumn(cpRows(colpos), ylim, upi, cex, lwd, orientations ? dfToRows(orientations) : null);

  // Frame, headers and axes
  const yl = ylim[0];
  const yh = ylim[1];
  segments(p0, yl, p0, yh, { lwd });
  const nc = colpos.name.length;
  for (let r = 0; r < nc; r++) {
    if (colpos.name[r] === 'profile') {
      continue;
    }
    segments(colpos.x1[r], yl, colpos.x1[r], ytop, { lwd: lwd * 0.8 });
    if (colpos.name[r] === 'composition') {
      segments(colpos.x0[r], yl, colpos.x0[r], ytop, { lwd: lwd * 0.8 });
    }
  }
  segments(p1, yl, p1, ytop, { lwd: lwd * 0.8 });
  const xmin = Math.min(...colpos.x0);
  if (header) {
    segments(xmin, [yh, ytop], xmax, [yh, ytop], { lwd: lwd * 0.8 });
    if (layout === 'combined') {
      segments(p0, yh, p0, ytop, { lwd: lwd * 0.8 });
    }
    const hmid = (yh + ytop) / 2;
    for (let r = 0; r < nc; r++) {
      const nm = colpos.name[r];
      if (nm === 'profile') {
        continue;
      }
      const wcol = colpos.x1[r] - colpos.x0[r];
      const srt = wcol < 0.6 ? 90 : 0;
      if (nm.startsWith('curve:')) {
        curveHeader({ name: nm, x0: colpos.x0[r], x1: colpos.x1[r] }, yh, ytop, upi, cex, lwd, curves, curveLimits);
        continue;
      }
      text((colpos.x0[r] + colpos.x1[r]) / 2, hmid, getNamed(COL_HEADER, nm), { srt, cex: cex * 0.9 });
      if (nm === 'orientations') {
        // dip scale: 0 to 90 degrees
        const tx = [0, 30, 60, 90].map((v) => colpos.x0[r] + 0.06 + v / 90 * (wcol - 0.12));
        segments(tx, yh, tx, yh + 0.04 * upi[1], { lwd: lwd * 0.7 });
        text([tx[0], tx[3]], yh + 0.085 * upi[1], ['0', '90'], { cex: cex * 0.7 });
      }
      if (nm === 'relief') {
        // Scale of the relief values (0 at the profile, 1 at the left edge) and an
        // arrow: relative relief in the field increases to the left
        const rx1 = colpos.x1[r];
        const rx0 = colpos.x0[r] + 0.03;
        const tx = [0, 0.5, 1].map((v) => rx1 - v * (rx1 - rx0));
        segments(tx, yh, tx, yh + 0.04 * upi[1], { lwd: lwd * 0.7 });
        text(tx, yh + 0.085 * upi[1], ['0', '0.5', '1'], { cex: cex * 0.7 });
        arrows(colpos.x1[r] - 0.04, yh + 0.17 * upi[1], colpos.x0[r] + 0.04, yh + 0.17 * upi[1],
          { length: 0.04, lwd: lwd * 0.7 });
        segments(colpos.x0[r], yh, colpos.x0[r], ytop, { lwd: lwd * 0.8 });
      }
    }
    // Grain-size scale
    const yt0 = yh;
    const tick = 0.05 * upi[1];
    const xv = [];
    for (let v = 1; v <= ncls; v++) { xv.push(p0 + v * classWidth); }
    segments(xv, yt0, xv, yt0 + tick, { lwd: lwd * 0.7 });
    segments(p0, yt0 + tick, Math.max(...xv), yt0 + tick, { lwd: lwd * 0.7 });
    text(xv, yt0 + 1.6 * tick, scl.label.slice(0, ncls), { srt: 90, adj: [0, 0.5], cex: cex * 0.85 });
    const ttl = scale === 'siliciclastic' ? 'Grain size' : 'Texture';
    text((p0 + p1) / 2, ytop - 0.12 * upi[1], ttl, { cex: cex * 0.9 });
  }
  const { at, pv } = axisTicks(ylim, tickStep);
  axis(2, {
    pos: xmin - 0.02, las: 1, cexAxis: cex, tcl: -0.3, at,
    ...(depthDown === true ? { labels: formatNums(at.map((v) => -v)) } : {})
  });
  const nm = Math.trunc(Number(minorTicks));
  if (Number.isFinite(nm) && nm > 1 && pv.length > 1) {
    const mn = [];
    for (let kk = 0; kk <= nm * (pv.length - 1); kk++) {
      const v = pv[0] + (pv[1] - pv[0]) / nm * kk;
      if (kk % nm !== 0 && v >= ylim[0] - 1e-9 && v <= ylim[1] + 1e-9) { mn.push(v); }
    }
    if (mn.length > 0) {
      axis(2, { pos: xmin - 0.02, at: mn, labels: false, tcl: -0.15, lwd: 0, lwdTicks: 1 });
    }
  }
  text(xmin - 0.05, yh + 0.08 * upi[1], depthLab, { adj: [1, 0], cex, xpd: null });

  return { litholog: pl, columns: colpos, x0: p0, class_width: classWidth, ytop, ybot };
}

/**
 * .axis_ticks(ylim, step): labelled ticks of the depth axis, every step
 * (multiples of step) or pretty values; pv also holds the ticks just
 * outside ylim, for the minor ticks.
 */
export function axisTicks(ylim, step = null) {
  const s = step === null || step === undefined || step === '' ? NaN : Number(step);
  if (Number.isFinite(s) && s > 0) {
    const k0 = Math.floor(ylim[0] / s + 1e-9), k1 = Math.ceil(ylim[1] / s - 1e-9);
    if (k1 - k0 <= 500) {
      const pv = [];
      for (let k = k0; k <= k1; k++) { pv.push(Math.round(k * s * 1e10) / 1e10); }
      return { pv, at: pv.filter((v) => v >= ylim[0] - 1e-9 * s && v <= ylim[1] + 1e-9 * s) };
    }
  }
  const pv = pretty(ylim);
  return { pv, at: pv.filter((v) => v >= ylim[0] && v <= ylim[1]) };
}

// example_log ####

/** example_log(): {beds, symbols} column tables (NA = null). */
export function exampleLog() {
  const NA = null;
  const beds = {
    base: [0, 1.6, 2.1, 2.6, 3.4, 3.7, 4.2, 4.5, 5.3, 5.5, 6.4, 6.6, 7.5],
    top: [1.6, 2.1, 2.6, 3.4, 3.7, 4.2, 4.5, 5.3, 5.5, 6.4, 6.6, 7.5, 8.6],
    lithology: [
      'marl', 'silt', 'packstone', 'covered', 'marl', 'sandstone',
      'silty_limestone', 'dolo_grainstone', 'coal', 'shale', 'sandy_limestone',
      'conglomerate', 'sandstone'
    ],
    grain: ['clay', 'silt', 'packstone', 'silt', 'clay', 'f', 'silt', 'grainstone',
      'clay', 'silt', 'f', 'pebble', 'c'],
    grain_top: [NA, NA, NA, NA, NA, NA, NA, NA, NA, NA, NA, 'm', 'f'],
    contact: [
      'sharp', 'gradational', 'sharp', 'sharp', 'sharp', 'scour', 'loaded',
      'sharp', 'sharp', 'sharp', 'erosive', 'channel', 'sharp'
    ],
    side: [
      'straight', 'straight', 'straight', 'straight', 'straight', 'straight',
      'zigzag', 'straight', 'straight', 'straight', 'straight', 'convex', 'convex'
    ],
    surface: [
      'none', 'none', 'hardground', 'none', 'none', 'none', 'none', 'karst',
      'rootlets', 'none', 'none', 'none', 'none'
    ],
    structure: [
      'even_lamination', 'wavy_lamination', 'nodular_bedding', NA, NA,
      'ripple_lamination', NA, 'xbed_low_angle', NA, 'fissile_shale', NA,
      'xbed_trough', 'xbed_tabular'
    ],
    fossils: [
      'foraminifera', NA, 'brachiopod, crinoid', NA, 'bivalve', NA, NA,
      'ooids, oncoids', 'plant_remains', NA, NA, 'wood', NA
    ],
    bioturbation: ['moderate', 'weak', NA, NA, 'strong', NA, NA, NA, NA, NA, NA, NA, NA],
    relief: [0.1, 0.15, 0.6, 0, -0.6, 0.45, 0.3, 0.9, -0.4, -0.3, 0.4, 1, 0.7],
    relief_shape: [
      'bank', 'bank', 'bank', 'bank', 'niche', 'rounded', 'bank', 'scarp',
      'niche', 'niche', 'bank', 'ramp', 'rounded'
    ],
    description: [
      'grey marl', '', 'nodular packstone', 'poor exposure', '', 'fine sand',
      '', 'oolitic dolo-grainstone', 'coal seam, rootlets', 'fissile shale',
      '', 'deep scour, pebble lag', 'coarse to fine sand'
    ]
  };
  const symbols = {
    dt: [3.95, 7.9, 7.0, 8.2, 2.3, 4.85, 6.0],
    name: [
      'large_ripple_direction', 'large_ripple_direction', 'channel_direction',
      'current_ripples', 'stylolites', 'mottling', 'concretion_carbonate'
    ],
    column: ['transport', 'transport', 'transport', 'structures', 'structures', 'structures', 'structures'],
    angle: [60, 225, 200, 0, 0, 0, 0]
  };
  return { beds, symbols };
}

// log_legend ####

/**
 * log_legend(what = c("patterns", "symbols", "contacts"), names = NULL,
 * ncol = 4, size = NULL, cex = 0.7, labels = NULL, colours = "none").
 * Called as logLegend({what, names, ...}); logLegend('symbols', {names}) also
 * works. Returns the names drawn.
 */
export function logLegend(opts = {}, more = {}) {
  if (typeof opts === 'string' || Array.isArray(opts)) {
    opts = Object.assign({}, more, { what: opts });
  }
  let {
    what = undefined, names = null, ncol = 4, size = null, cex = 0.7,
    labels = null, colours = 'none'
  } = opts;
  what = matchArg(what, ['patterns', 'symbols', 'contacts']);
  if (names !== null && names !== undefined) {
    names = asArr(names);
  }
  if (what === 'patterns') {
    if (names === null || names === undefined) {
      names = [...new Set(patternNames().filter((v) => v !== 'none'))];
    }
    if (size === null || size === undefined) {
      size = 0.45;
    }
  } else if (what === 'symbols') {
    const g = symbolNames({ group: true });
    if (names === null || names === undefined) {
      names = Object.values(g).flat();
    } else {
      let ex = [];
      for (const nm of names) {
        if (Object.hasOwn(g, nm)) {
          ex = ex.concat(g[nm]);
        } else {
          ex.push(nm);
        }
      }
      names = ex;
    }
    if (size === null || size === undefined) {
      size = 0.26;
    }
  } else {
    if (names === null || names === undefined) {
      names = contactTypes.slice();
    }
    if (size === null || size === undefined) {
      size = 0.55;
    }
  }
  if (labels === null || labels === undefined) {
    labels = names.map((v) => (isNA(v) ? null : String(v).replace(/_/g, ' ')));
  } else {
    labels = asArr(labels);
  }
  const nn = names.length;
  const nr = Math.ceil(nn / ncol);
  plotNew();
  plotWindow([0, ncol], [0, nr], { xaxs: 'i', yaxs: 'i' });
  const upi = upiUser();
  for (let k = 1; k <= nn; k++) {
    const cx = rMod(k - 1, ncol);
    const cy = nr - 1 - Math.floor((k - 1) / ncol);
    const yc = cy + 0.5;
    const nm = names[k - 1];
    const lab = k - 1 < labels.length ? labels[k - 1] : null;
    if (what === 'patterns') {
      const bw = Math.min(0.38, 1.6 * size * upi[0]);
      const bh = Math.min(0.4, 0.5 * size * upi[1]);
      const xs = [0, bw, bw, 0].map((v) => cx + 0.04 + v);
      const ys = [-bh, -bh, bh, bh].map((v) => yc + v);
      const fc = bedColours([nm], colours)[0];
      if (!isNA(fc)) {
        polygon(xs, ys, { col: fc, border: null });
      }
      fillPattern(xs, ys, nm, { border: 'black', bg: isNA(fc) ? null : NaN });
      text(cx + 0.08 + bw, yc, lab, { adj: [0, 0.5], cex });
    } else if (what === 'symbols') {
      logSymbol(nm, cx + 0.04 + 0.5 * size * upi[0], yc, { size });
      text(cx + 0.08 + size * upi[0], yc, lab, { adj: [0, 0.5], cex });
    } else {
      const bw = Math.min(0.4, 1.6 * size * upi[0]);
      const bh = Math.min(0.42, 0.6 * size * upi[1]);
      const x0 = cx + 0.04 + 0.15 * upi[0];
      const pl = prettyLitholog([yc - bh, yc], [yc, yc + bh], [x0 + bw, x0 + bw * 0.75], {
        contact: ['sharp', nm], amp: 0.06, wavelength: 0.12, left: x0, upi
      });
      drawBeds(pl, { pattern: ['sandstone', 'limestone'], patternScale: 0.7 });
      text(x0 + bw + (nm === 'fault' ? 0.3 * upi[0] : 0.15 * upi[0]), yc, lab, { adj: [0, 0.5], cex });
    }
  }
  return names;
}
