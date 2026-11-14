// lg_extra.js: port of lithoglyph extra_columns.R (bed numbers, samples and
// data curves: extra columns of strat_column()) ####

import { segments, text, lines, points, pretty, polygon, arrows } from './rgfx.js';
import { upiUser } from './lg_utils.js';
import { isNA } from './rbase.js';

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v) => (isNA(v) || v === '' ? NaN : Number(v));

/** formatC(x, format = "g", digits = d), trimmed (C's %g). */
export function fmtG(x, d = 3) {
  if (x === 0) { return '0'; }
  const s = x.toExponential(d - 1);
  const [m, ex] = s.split('e');
  const E = parseInt(ex, 10);
  if (E < -4 || E >= d) {
    const mant = m.includes('.') ? m.replace(/\.?0+$/, '') : m;
    return mant + 'e' + (E < 0 ? '-' : '+') + String(Math.abs(E)).padStart(2, '0');
  }
  const t = x.toFixed(Math.max(0, d - 1 - E));
  return t.includes('.') ? t.replace(/\.?0+$/, '') : t;
}

function curveRows(curves, nm) {
  const out = { dt: [], value: [] };
  if (!curves) { return out; }
  for (let k = 0; k < curves.name.length; k++) {
    if (curves.name[k] === nm) { out.dt.push(num(curves.dt[k])); out.value.push(num(curves.value[k])); }
  }
  return out;
}

/** .curve_plim(nm, curves, curve_limits): value range extended to round ticks. */
export function curvePlim(nm, curves, curveLimits) {
  let lim = null;
  if (curveLimits && curveLimits[nm]) {
    lim = curveLimits[nm].map(Number);
  } else {
    const v = curveRows(curves, nm).value.filter(fin);
    if (v.length > 0) { lim = [Math.min(...v), Math.max(...v)]; }
  }
  if (!lim || lim.length !== 2 || !lim.every(fin)) { lim = [0, 1]; }
  if (lim[1] - lim[0] < 1e-12) {
    const d0 = Math.abs(lim[0]) > 0 ? Math.abs(lim[0]) * 0.1 : 1;
    lim = [lim[0] - d0, lim[1] + d0];
  }
  const pv = pretty(lim, 3);
  return [Math.min(...pv), Math.max(...pv)];
}

/** .curve_cut(d, y0, y1): points inside y0-y1, interpolated at y0 and y1. */
export function curveCut(d, y0, y1) {
  const idx = [];
  for (let k = 0; k < d.dt.length; k++) { if (fin(d.dt[k]) && fin(d.value[k])) { idx.push(k); } }
  idx.sort((a, b) => d.dt[a] - d.dt[b] || a - b);
  const dt = idx.map((k) => d.dt[k]), va = idx.map((k) => d.value[k]);
  const interp = (y) => {
    if (dt.length < 2 || dt.some((v) => Math.abs(v - y) < 1e-12)) { return null; }
    let a = -1, b = -1;
    for (let k = 0; k < dt.length; k++) { if (dt[k] < y) { a = k; } }
    for (let k = dt.length - 1; k >= 0; k--) { if (dt[k] > y) { b = k; } }
    if (a < 0 || b < 0) { return null; }
    return [y, va[a] + (va[b] - va[a]) * (y - dt[a]) / (dt[b] - dt[a])];
  };
  const out = { dt: [], value: [] };
  const push = (p) => { if (p) { out.dt.push(p[0]); out.value.push(p[1]); } };
  push(interp(y0));
  for (let k = 0; k < dt.length; k++) { if (dt[k] >= y0 && dt[k] <= y1) { out.dt.push(dt[k]); out.value.push(va[k]); } }
  push(interp(y1));
  return out;
}

/** .curve_unit(nm, curves) */
export function curveUnit(nm, curves) {
  if (!curves || !curves.unit) { return ''; }
  for (let k = 0; k < curves.name.length; k++) {
    const u = curves.unit[k];
    if (curves.name[k] === nm && !isNA(u) && u !== '') { return String(u); }
  }
  return '';
}

/** .curve_header(cp, yh, ytop, upi, cex, lwd, curves, curve_limits) */
export function curveHeader(cp, yh, ytop, upi, cex, lwd, curves, curveLimits) {
  const nm = cp.name.substring(6);
  const u = curveUnit(nm, curves);
  const ttl = u !== '' ? nm + '\n(' + u + ')' : nm;
  text((cp.x0 + cp.x1) / 2, (yh + ytop) / 2 + 0.08 * upi[1], ttl, { cex: cex * 0.9 });
  const plim = curvePlim(nm, curves, curveLimits);
  const w = cp.x1 - cp.x0 - 0.12;
  const pv = pretty(plim, 3).filter((v) => v >= plim[0] - 1e-9 && v <= plim[1] + 1e-9);
  const tx = pv.map((v) => cp.x0 + 0.06 + (v - plim[0]) / (plim[1] - plim[0]) * w);
  segments(tx, yh, tx, yh + 0.04 * upi[1], { lwd: lwd * 0.7 });
  // the two ends of the scale are labelled
  text(cp.x0 + 0.04, yh + 0.085 * upi[1], fmtG(plim[0]), { adj: [0, 0.5], cex: cex * 0.7 });
  text(cp.x1 - 0.04, yh + 0.085 * upi[1], fmtG(plim[1]), { adj: [1, 0.5], cex: cex * 0.7 });
}

/** .draw_extra_columns(colpos, ylim, upi, cex, lwd, base, top, numbers, samples, curves, curve_limits) */
export function drawExtraColumns(colpos, ylim, upi, cex, lwd, base, top, numbers, samples, curves, curveLimits) {
  const inr = (y) => fin(y) && y >= ylim[0] - 1e-9 && y <= ylim[1] + 1e-9;
  const colOf = (nm) => colpos.name.indexOf(nm);
  // Bed numbers, at the middle of the visible part of each bed
  let r = colOf('bednum');
  if (r >= 0) {
    let nb = numbers;
    if (!nb) {
      const o = base.map((_, k) => k).sort((a, b) => base[a] - base[b] || a - b);
      nb = new Array(base.length);
      o.forEach((k, j) => { nb[k] = j + 1; });
    }
    const ys = [], labs = [];
    for (let k = 0; k < base.length; k++) {
      if (top[k] > ylim[0] && base[k] < ylim[1]) {
        ys.push((Math.max(base[k], ylim[0]) + Math.min(top[k], ylim[1])) / 2);
        labs.push(String(nb[k]));
      }
    }
    if (ys.length > 0) {
      text(ys.map(() => (colpos.x0[r] + colpos.x1[r]) / 2), ys, labs, { cex: cex * 0.8 });
    }
  }
  // Samples: a tick at a level, a bracket over an interval, and the label
  r = colOf('samples');
  if (r >= 0 && samples) {
    const n0 = (samples.dt || []).length;
    const S = [];
    for (let k = 0; k < n0; k++) {
      const dt = num(samples.dt[k]);
      let tp = samples.top ? num(samples.top[k]) : NaN;
      const id = samples.id && !isNA(samples.id[k]) ? String(samples.id[k]) : '';
      if (!fin(dt)) { continue; }
      if (!fin(tp) || tp <= dt) { tp = NaN; }
      const keep = (Number.isNaN(tp) && inr(dt)) || (!Number.isNaN(tp) && tp >= ylim[0] && dt <= ylim[1]);
      if (keep) { S.push({ dt, top: tp, id }); }
    }
    if (S.length > 0) {
      const y0 = S.map((s) => Math.max(s.dt, ylim[0]));
      const y1 = S.map((s, j) => (Number.isNaN(s.top) ? y0[j] : Math.min(s.top, ylim[1])));
      const ym = y0.map((v, j) => (v + y1[j]) / 2);
      const lx = S.map(() => 0.13);
      let last = -Infinity, alt = false;
      const ord = ym.map((_, j) => j).sort((a, b) => ym[a] - ym[b] || a - b);
      for (const j of ord) {
        alt = (ym[j] - last) / upi[1] < 0.09 ? !alt : false;
        lx[j] = alt ? 0.33 : 0.13;
        last = ym[j];
      }
      const xa = colpos.x0[r] + 0.04;
      for (let j = 0; j < S.length; j++) {
        if (Number.isNaN(S[j].top)) {
          segments(xa, y0[j], xa + 0.07, y0[j], { lwd: lwd * 0.8 });
        } else {
          segments(xa + 0.035, y0[j], xa + 0.035, y1[j], { lwd: lwd * 0.8 });
          if (S[j].dt >= ylim[0]) { segments(xa, y0[j], xa + 0.07, y0[j], { lwd: lwd * 0.8 }); }
          if (S[j].top <= ylim[1]) { segments(xa, y1[j], xa + 0.07, y1[j], { lwd: lwd * 0.8 }); }
        }
        text(colpos.x0[r] + lx[j], ym[j], S[j].id, { adj: [0, 0.5], cex: cex * 0.75 });
      }
    }
  }
  // Data curves: line through the values, dots at the measured levels
  for (let c = 0; c < colpos.name.length; c++) {
    if (!colpos.name[c].startsWith('curve:')) { continue; }
    const nm = colpos.name[c].substring(6);
    const d = curveRows(curves, nm);
    const plim = curvePlim(nm, curves, curveLimits);
    const x0 = colpos.x0[c] + 0.06;
    const w = colpos.x1[c] - colpos.x0[c] - 0.12;
    const px = (v) => x0 + (v - plim[0]) / (plim[1] - plim[0]) * w;
    const pv = pretty(plim, 3).filter((v) => v >= plim[0] - 1e-9 && v <= plim[1] + 1e-9);
    segments(pv.map(px), ylim[0], pv.map(px), ylim[1], { col: 'grey85', lwd: 0.4 });
    const cc = curveCut(d, ylim[0], ylim[1]);
    if (cc.dt.length > 1) {
      lines(cc.value.map(px), cc.dt, { lwd: lwd * 0.8 });
    }
    const ptx = [], pty = [];
    for (let k = 0; k < d.dt.length; k++) {
      if (fin(d.value[k]) && inr(d.dt[k])) { ptx.push(px(d.value[k])); pty.push(d.dt[k]); }
    }
    if (ptx.length > 0) {
      points(ptx, pty, { pch: 16, cex: 0.3 });
    }
  }
  return null;
}

// Small camera symbol centred at (x, y), w inches wide
function camera(x, y, w, upi, lwd) {
  const h = 0.62 * w;
  polygon([-0.5, 0.5, 0.5, -0.5].map((v) => x + v * w * upi[0]), [-0.5, -0.5, 0.5, 0.5].map((v) => y + v * h * upi[1]),
    { col: 'white', border: 'black', lwd: lwd * 0.7 });
  polygon([-0.18, -0.06, 0.06, 0.18].map((v) => x + v * w * upi[0]), [0.5, 0.72, 0.72, 0.5].map((v) => y + v * h * upi[1]),
    { col: 'black', border: 'black', lwd: lwd * 0.5 });
  const a = [];
  for (let k = 0; k < 25; k++) { a.push(2 * Math.PI * k / 24); }
  polygon(a.map((t) => x + 0.24 * w * Math.cos(t) * upi[0]), a.map((t) => y + 0.24 * w * Math.sin(t) * upi[1]),
    { col: 'white', border: 'black', lwd: lwd * 0.7 });
}

/** .draw_photo_column(colpos, ylim, upi, cex, lwd, photos): camera symbols and labels. */
export function drawPhotoColumn(colpos, ylim, upi, cex, lwd, photos) {
  const r = colpos.name.indexOf('photos');
  if (r < 0 || !photos) { return null; }
  const S = [];
  for (let k = 0; k < (photos.dt || []).length; k++) {
    const dt = num(photos.dt[k]);
    const id = photos.id && !isNA(photos.id[k]) ? String(photos.id[k]) : '';
    if (fin(dt) && dt >= ylim[0] - 1e-9 && dt <= ylim[1] + 1e-9) { S.push({ dt, id, k }); }
  }
  if (S.length === 0) { return null; }
  S.sort((a, b) => a.dt - b.dt || a.k - b.k);
  const w = 0.13;
  let last = -Infinity, kk = 0;
  for (const s of S) {
    kk = (s.dt - last) / upi[1] < 0.1 ? kk + 1 : 0;
    last = s.dt;
    const xc = colpos.x0[r] + 0.08 + (kk % 2) * 0.17;
    camera(xc, s.dt, w, upi, lwd);
    text(xc + 0.075, s.dt, s.id, { adj: [0, 0.5], cex: cex * 0.6 });
  }
  return null;
}

/** rose_diagram(angles, x, y, radius, bin, col, cex, upi): {n, mean, R}. */
export function roseDiagram(angles, x, y, { radius = 0.5, bin = 30, col = 'grey70', cex = 0.6, upi = null } = {}) {
  if (!upi) { upi = upiUser(); }
  const a = (angles || []).map(num).filter(fin).map((v) => ((v % 360) + 360) % 360);
  const n = a.length;
  const rx = radius * upi[0], ry = radius * upi[1];
  const t = [];
  for (let k = 0; k < 73; k++) { t.push(2 * Math.PI * k / 72); }
  polygon(t.map((v) => x + rx * Math.sin(v)), t.map((v) => y + ry * Math.cos(v)), { border: 'grey40', lwd: 0.5 });
  segments(x, y - ry, x, y + ry, { col: 'grey60', lwd: 0.4 });
  segments(x - rx, y, x + rx, y, { col: 'grey60', lwd: 0.4 });
  text(x, y + ry * 1.18, 'N', { cex });
  if (n === 0) { return { n: 0, mean: NaN, R: NaN }; }
  const nb = Math.round(360 / bin);
  const cnt = new Array(nb).fill(0);
  for (const v of a) { cnt[((Math.floor(v / bin) % nb) + nb) % nb] += 1; }
  const mx = Math.max(...cnt);
  for (let k = 0; k < nb; k++) {
    if (cnt[k] === 0) { continue; }
    const r = Math.sqrt(cnt[k] / mx);
    const t0 = k * bin * Math.PI / 180;
    const tt = [];
    for (let j = 0; j < 9; j++) { tt.push(t0 + bin * Math.PI / 180 * j / 8); }
    polygon([x, ...tt.map((v) => x + rx * r * Math.sin(v))], [y, ...tt.map((v) => y + ry * r * Math.cos(v))],
      { col, border: 'black', lwd: 0.5 });
  }
  let sx = 0, sy = 0;
  for (const v of a) { sx += Math.sin(v * Math.PI / 180); sy += Math.cos(v * Math.PI / 180); }
  const m = (((Math.atan2(sx, sy) * 180 / Math.PI) % 360) + 360) % 360;
  const R = Math.sqrt(sx * sx + sy * sy) / n;
  arrows(x, y, x + rx * R * Math.sin(m * Math.PI / 180), y + ry * R * Math.cos(m * Math.PI / 180), { length: 0.06, lwd: 1.2 });
  return { n, mean: m, R };
}

/** Bouma divisions of a bed, from "abc", "Ta-Tc", "Tb-e", "a,b,c"... */
export function parseBouma(x) {
  if (isNA(x)) { return []; }
  let s = String(x).toLowerCase();
  if (!s.length) { return []; }
  s = s.replace(/t/g, '').replace(/[^a-e-]/g, '');
  const parts = s.split('');
  const out = [];
  const L = 'abcdefghijklmnopqrstuvwxyz';
  let j = 0;
  while (j < parts.length) {
    if (j + 2 < parts.length && parts[j + 1] === '-' && parts[j + 2] !== '-') {
      const a = L.indexOf(parts[j]), b = L.indexOf(parts[j + 2]);
      for (let k = Math.min(a, b); k <= Math.max(a, b); k++) { out.push(L[k]); }
      j += 3;
    } else {
      if (parts[j] !== '-') { out.push(parts[j]); }
      j += 1;
    }
  }
  return ['a', 'b', 'c', 'd', 'e'].filter((v) => out.includes(v));
}
export const boumaDivisions = (x) => parseBouma(Array.isArray(x) ? x[0] : x);
export function nBouma(bouma) { return (bouma || []).map((v) => parseBouma(v).length); }

/** Bouma column: Ta at the base to Te at the top of each turbidite bed. */
export function drawBoumaColumn(colpos, ylim, upi, cex, lwd, base, top, bouma) {
  const cp = colpos.find((c) => c.name === 'bouma');
  if (!cp || !bouma) { return; }
  const xm = (cp.x0 + cp.x1) / 2;
  const th = 0.09 * upi[1];
  for (let i = 0; i < base.length; i++) {
    const dv = parseBouma(bouma[i]);
    if (dv.length === 0) { continue; }
    const b = Math.max(base[i], ylim[0]), t = Math.min(top[i], ylim[1]);
    if (t <= b) { continue; }
    const h = (top[i] - base[i]) / dv.length;
    if (h < th) {
      const lab = dv.length === 1 ? 'T' + dv[0] : 'T' + dv[0] + '-' + dv[dv.length - 1];
      text(xm, (b + t) / 2, lab, { cex: cex * 0.6 });
      continue;
    }
    for (let j = 0; j < dv.length; j++) {
      const y0 = base[i] + j * h, y1 = y0 + h;
      if (j > 0 && y0 > ylim[0] && y0 < ylim[1]) {
        segments(cp.x0 + 0.03, y0, cp.x1 - 0.03, y0, { lty: 2, lwd: lwd * 0.6, col: 'grey40' });
      }
      const ym = (Math.max(y0, ylim[0]) + Math.min(y1, ylim[1])) / 2;
      if (Math.min(y1, ylim[1]) - Math.max(y0, ylim[0]) >= th) {
        text(xm, ym, 'T' + dv[j], { cex: cex * 0.65 });
      }
    }
  }
}

const ORI_KINDS = [
  ['bedding', 'plane', 'circle', 'black', 'Bedding'],
  ['cross_bedding', 'plane', 'circle', 'white', 'Cross-bedding (foresets)'],
  ['fault', 'plane', 'triangle', '#D7191C', 'Fault plane'],
  ['joint', 'plane', 'square', 'white', 'Joint'],
  ['cleavage', 'plane', 'triangle', 'white', 'Cleavage'],
  ['vein', 'plane', 'diamond', 'white', 'Vein'],
  ['other_plane', 'plane', 'diamond', 'grey60', 'Other plane'],
  ['lineation', 'line', 'plus', 'black', 'Lineation'],
  ['fold_axis', 'line', 'cross', 'black', 'Fold axis'],
  ['palaeocurrent', 'line', 'diamond', 'black', 'Palaeocurrent']
];
/** orientation_kinds(): rows {kind, type, mark, fill, label}. */
export function orientationKinds() {
  return ORI_KINDS.map(([kind, type, mark, fill, label]) => ({ kind, type, mark, fill, label }));
}

function oriMark(x, y, kind, s, upi, lwd) {
  const ok = orientationKinds();
  let k = ok.find((r) => r.kind === kind);
  if (!k) { k = ok.find((r) => r.kind === 'other_plane'); }
  const fl = k.fill;
  const bd = fl === '#D7191C' ? '#D7191C' : 'black';
  const rx = s / 2 * upi[0], ry = s / 2 * upi[1];
  const poly = (xs, ys) => polygon(xs.map((v) => x + rx * v), ys.map((v) => y + ry * v), { col: fl, border: bd, lwd: lwd * 0.7 });
  if (k.mark === 'circle') {
    const t = [];
    for (let j = 0; j < 16; j++) { t.push(2 * Math.PI * j / 16); }
    poly(t.map(Math.cos), t.map(Math.sin));
  } else if (k.mark === 'triangle') {
    poly([-1, 1, 0], [-0.8, -0.8, 1]);
  } else if (k.mark === 'square') {
    poly([-0.85, 0.85, 0.85, -0.85], [-0.85, -0.85, 0.85, 0.85]);
  } else if (k.mark === 'diamond') {
    poly([-1, 0, 1, 0], [0, -1, 0, 1]);
  } else if (k.mark === 'plus') {
    segments([x - rx, x], [y, y - ry], [x + rx, x], [y, y + ry], { lwd: lwd * 1.1 });
  } else {
    segments([x - rx * 0.8, x - rx * 0.8], [y - ry * 0.8, y + ry * 0.8], [x + rx * 0.8, x + rx * 0.8], [y + ry * 0.8, y - ry * 0.8], { lwd: lwd * 1.1 });
  }
}

/** orientation_mark(x, y, kind, size, upi, lwd). */
export function orientationMark(x, y, kind, { size = 0.065, upi = null, lwd = 1 } = {}) {
  if (!upi) { upi = upiUser(); }
  const X = [].concat(x), Y = [].concat(y), K = [].concat(kind);
  const n = Math.max(X.length, Y.length, K.length);
  for (let k = 0; k < n; k++) { oriMark(X[k % X.length], Y[k % Y.length], K[k % K.length], size, upi, lwd); }
}

const mod360 = (v) => ((v % 360) + 360) % 360;

/** Value (dip or plunge) and azimuth (dip direction or trend) of each row. */
export function oriValues(rows) {
  const ok = orientationKinds();
  return rows.map((o) => {
    const kd = ok.find((r) => r.kind === o.kind);
    const type = kd ? kd.type : 'plane';
    const dip = num(o.dip), st = num(o.strike), pl = num(o.plunge), tr = num(o.trend);
    let dd = num(o.dip_dir);
    if (!fin(dd) && fin(st)) { dd = mod360(st + 90); }
    if (type === 'line') {
      return { type, value: fin(pl) ? pl : 0, azimuth: tr };
    }
    return { type, value: dip, azimuth: dd };
  });
}

/** Orientation column: tadpole plot (dip 0-90 left to right, tail to the dip direction). */
export function drawOrientationColumn(colpos, ylim, upi, cex, lwd, orientations) {
  const cp = colpos.find((c) => c.name === 'orientations');
  if (!cp || !orientations) { return; }
  const o = orientations.map((r) => ({ ...r, kind: isNA(r.kind) || r.kind === undefined ? 'bedding' : r.kind, dt: num(r.dt) }));
  const vv = oriValues(o);
  const xa = cp.x0 + 0.06, xb = cp.x1 - 0.06;
  const gx = [30, 60].map((v) => xa + v / 90 * (xb - xa));
  segments(gx, ylim[0], gx, ylim[1], { col: 'grey80', lty: 3, lwd: 0.5 });
  for (let j = 0; j < o.length; j++) {
    const v = vv[j];
    if (!fin(o[j].dt) || o[j].dt < ylim[0] - 1e-9 || o[j].dt > ylim[1] + 1e-9 || !fin(v.value)) { continue; }
    const x = xa + Math.min(Math.max(v.value, 0), 90) / 90 * (xb - xa);
    if (fin(v.azimuth)) {
      const a = v.azimuth * Math.PI / 180;
      const x1 = x + 0.11 * Math.sin(a) * upi[0], y1 = o[j].dt + 0.11 * Math.cos(a) * upi[1];
      if (v.type === 'line') {
        arrows(x, o[j].dt, x1, y1, { length: 0.035, lwd: lwd * 0.8 });
      } else {
        segments(x, o[j].dt, x1, y1, { lwd: lwd * 0.8 });
      }
    }
    oriMark(x, o[j].dt, o[j].kind, 0.065, upi, lwd);
  }
}

/** stereonet(): lower-hemisphere equal-area net of poles and lines. */
export function stereonet(orientations, x, y, { radius = 0.5, cex = 0.6, greatCircles = false, upi = null } = {}) {
  if (!upi) { upi = upiUser(); }
  const rx = radius * upi[0], ry = radius * upi[1];
  const t = [];
  for (let k = 0; k < 73; k++) { t.push(2 * Math.PI * k / 72); }
  polygon(t.map((v) => x + rx * Math.sin(v)), t.map((v) => y + ry * Math.cos(v)), { col: 'white', border: 'grey40', lwd: 0.5 });
  segments([x - 0.04 * upi[0], x], [y, y - 0.04 * upi[1]], [x + 0.04 * upi[0], x], [y, y + 0.04 * upi[1]], { col: 'grey50', lwd: 0.4 });
  segments(x, y + ry, x, y + ry * 1.06, { lwd: 0.5 });
  text(x, y + ry * 1.18, 'N', { cex });
  let o = (orientations || []).map((r) => ({ ...r, kind: isNA(r.kind) || r.kind === undefined ? 'bedding' : r.kind }));
  if (o.length === 0) { return { planes: 0, lines: 0 }; }
  let vv = oriValues(o);
  const keep = o.map((r, j) => r.kind !== 'palaeocurrent' && fin(vv[j].value) && fin(vv[j].azimuth));
  o = o.filter((r, j) => keep[j]);
  vv = vv.filter((r, j) => keep[j]);
  const proj = (trend, plunge) => {
    const r = Math.SQRT2 * Math.sin((90 - plunge) / 2 * Math.PI / 180);
    return [x + rx * r * Math.sin(trend * Math.PI / 180), y + ry * r * Math.cos(trend * Math.PI / 180)];
  };
  let np = 0, nl = 0;
  if (greatCircles) {
    for (const v of vv) {
      if (v.type !== 'plane') { continue; }
      const d = v.value * Math.PI / 180, dd = v.azimuth * Math.PI / 180;
      const sx = Math.sin(dd - Math.PI / 2), sy = Math.cos(dd - Math.PI / 2);
      const ex = Math.cos(d) * Math.sin(dd), ey = Math.cos(d) * Math.cos(dd), ez = -Math.sin(d);
      const xs = [], ys = [];
      for (let k = 0; k < 37; k++) {
        const rk = Math.PI * k / 36;
        const vx = Math.cos(rk) * sx + Math.sin(rk) * ex, vy = Math.cos(rk) * sy + Math.sin(rk) * ey, vz = Math.sin(rk) * ez;
        const p = proj(Math.atan2(vx, vy) * 180 / Math.PI, Math.asin(Math.min(1, -vz)) * 180 / Math.PI);
        xs.push(p[0]); ys.push(p[1]);
      }
      lines(xs, ys, { col: 'grey55', lwd: 0.5 });
    }
  }
  for (let j = 0; j < o.length; j++) {
    const v = vv[j];
    let p;
    if (v.type === 'plane') {
      p = proj(mod360(v.azimuth + 180), 90 - Math.min(Math.max(v.value, 0), 90));
      np += 1;
    } else {
      p = proj(mod360(v.azimuth), Math.min(Math.max(v.value, 0), 90));
      nl += 1;
    }
    oriMark(p[0], p[1], o[j].kind, 0.055, upi, 0.8);
  }
  return { planes: np, lines: nl };
}
