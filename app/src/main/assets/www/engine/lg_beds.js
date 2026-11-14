// lg_beds.js: lithoglyph bed outlines with shaped contacts (beds.R) ####
//
// pretty_litholog() returns a plain object with the R element names
// (log, lines, beds, contacts, top_contact, left, upi); the data frames are
// column tables. It also carries a non-enumerable class = 'pretty_litholog'.

import { lines, polygon, segments, text } from './rgfx.js';
import { isNA, order, dfRows } from './rbase.js';
import {
  arc, pip, clipSegs, pl2seg, fillet, join, recycle, upiUser, seqByR, seqOutR, matchArg
} from './lg_utils.js';
import { fillPattern } from './lg_patterns.js';
import { logSymbol } from './lg_symbols.js';

const PI = Math.PI;

const has = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
const last = (v) => v[v.length - 1];
const asArr = (v) => (Array.isArray(v) ? v : [v]);
const setdiffU = (a, b) => [...new Set(a)].filter((v) => !b.includes(v));

// Contact types ####

export const contactTypes = [
  'sharp', 'gradational', 'erosive', 'scour', 'channel', 'convex', 'concave',
  'wavy', 'loaded', 'stylolitic', 'unconformity', 'diastem', 'clay_parting', 'fault'
];

export const contactAlias = {
  abrupt: 'sharp', flat: 'sharp', planar: 'sharp', transitional: 'gradational',
  gradual: 'gradational', erosional: 'erosive', irregular: 'erosive',
  scoured: 'scour', undulose: 'wavy', undulating: 'wavy', load: 'loaded',
  load_cast: 'loaded', distorted: 'loaded', stylolite: 'stylolitic',
  stylolithic: 'stylolitic', convex_up: 'convex', concave_up: 'concave',
  mound: 'convex', lens: 'convex', diastema: 'diastem'
};

export const surfaceTypes = ['none', 'hardground', 'bored', 'mudcracks', 'rootlets', 'paleosol', 'karst'];

/** .resolve_contact(x): normalise contact names (scalar or array, same shape back). */
export function resolveContact(x) {
  const scalar = !Array.isArray(x);
  let v = asArr(x).map((s) => {
    if (isNA(s)) { return null; }
    return String(s).replace(/[ .-]+/g, '_').toLowerCase();
  });
  v = v.map((s) => (s !== null && has(contactAlias, s) ? contactAlias[s] : s));
  const bad = setdiffU(v, contactTypes);
  if (bad.length > 0) {
    throw new Error('Unknown contact type(s): ' + bad.map((b) => (b === null ? 'NA' : b)).join(', ') +
      '. Use one of: ' + contactTypes.join(', ') + '.');
  }
  return scalar ? v[0] : v;
}

/** contact_names(): the contact types and the surface types. */
export function contactNames() {
  return { contacts: contactTypes.slice(), surfaces: surfaceTypes.slice() };
}

// Geometry ####

/**
 * .contact_dev(type, X, L, s, A, lam, taper): deviation of a contact from its
 * nominal level (inches), for X (inches) on the span [L, s].
 */
export function contactDev(type, X, L, s, A, lam, taper) {
  const n = X.length;
  if (s - L <= 1e-9 || A <= 0) {
    return new Array(n).fill(0);
  }
  const u = X.map((x) => Math.min(Math.max((x - L) / (s - L), 0), 1));
  let d;
  switch (type) {
    case 'convex':
      d = u.map((v) => A * Math.pow(Math.sin(PI * v), 0.8));
      break;
    case 'concave':
      d = u.map((v) => -A * Math.pow(Math.sin(PI * v), 0.8));
      break;
    case 'scour':
      d = u.map((v) => {
        const w = Math.abs(v - 0.62) / 0.32;
        return -A * (w < 1 ? Math.pow(Math.cos(PI / 2 * w), 1.4) : 0);
      });
      break;
    case 'channel':
      d = u.map((v) => {
        const w = Math.abs(v - 0.5) / 0.4;
        return -A * (w < 1 ? Math.sqrt(Math.max(1 - Math.pow(w, 4), 0)) : 0);
      });
      break;
    case 'erosive':
      d = X.map((x) => -A * (0.55 + 0.3 * Math.sin(2 * PI * x / lam + 1.1) + 0.15 * Math.sin(2 * PI * x / (0.43 * lam) + 0.3)));
      break;
    case 'wavy':
      d = X.map((x) => 0.5 * A * Math.sin(2 * PI * x / lam));
      break;
    case 'loaded':
      d = X.map((x) => {
        const v = Math.abs(Math.sin(PI * x / lam));
        return -A * Math.pow(v, 0.6) + 0.15 * A;
      });
      break;
    case 'stylolitic':
      d = X.map((x) => {
        const q = Math.sin(2 * PI * x / lam);
        return 0.5 * A * Math.sign(q) * Math.min(Math.abs(q) / 0.25, 1);
      });
      break;
    case 'unconformity':
      d = X.map((x) => 0.35 * A * Math.sin(2 * PI * x / lam));
      break;
    default:
      d = new Array(n).fill(0);
  }
  if (taper) {
    d = d.map((v, k) => {
      const f = Math.min(1, Math.max(0, (s - X[k]) / (0.15 * (s - L))));
      return v * (3 * f * f - 2 * Math.pow(f, 3));
    });
  }
  return d.map((v, k) => (X[k] > s ? 0 : v));
}

/** .dense(a, b, step = 0.004): dense sequence from a to b (just a when b <= a). */
export function dense(a, b, { step = 0.004 } = {}) {
  if (b <= a) {
    return [a];
  }
  return seqOutR(a, b, Math.max(2, Math.ceil((b - a) / step) + 1));
}

/** .iface_path(X, y0, ifc): interface level along X (inches). */
export function ifacePath(X, y0, ifc) {
  if (ifc === null || ifc === undefined) {
    return new Array(X.length).fill(y0);
  }
  return contactDev(ifc.type, X, ifc.L, ifc.s, ifc.A, ifc.lam, ifc.taper).map((v) => y0 + v);
}

// round() of R (half to even)
function roundR(x) {
  const r = Math.round(x);
  return (r - x === 0.5 && r % 2 !== 0) ? r - 1 : r;
}

/** .side_path(xb, yb, xt, yt, side, amp, lam): right side of a bed. */
export function sidePath(xb, yb, xt, yt, side, amp, lam) {
  let v = seqOutR(0, 1, Math.max(12, Math.ceil(Math.abs(yt - yb) / 0.01)));
  let x = v.map((q) => xb + (xt - xb) * q);
  let y = v.map((q) => yb + (yt - yb) * q);
  if (side === 'convex') {
    x = x.map((q, k) => q + amp * Math.sin(PI * v[k]));
  } else if (side === 'concave') {
    x = x.map((q, k) => q - amp * Math.sin(PI * v[k]));
  } else if (side === 'zigzag') {
    const nz = Math.max(2, roundR(Math.abs(yt - yb) / lam));
    v = seqOutR(0, 1, 2 * nz + 1);
    x = v.map((q, k) => xb + (xt - xb) * q + (k === 0 ? 0 : (k % 2 === 1 ? amp : -amp)));
    x[x.length - 1] = xt;
    y = v.map((q) => yb + (yt - yb) * q);
  } else if (side === 'wavy') {
    x = x.map((q, k) => q + 0.5 * amp * Math.sin(2 * PI * (y[k] - yb) / lam));
  }
  return { x, y };
}

// sort(unique(v))
const sortUnique = (v) => [...new Set(v)].sort((a, b) => a - b);

// pretty_litholog ####

/**
 * pretty_litholog(base, top, width, width_top = width, i = NULL, contact = "sharp",
 * top_contact = "sharp", amp = 0.06, wavelength = 0.18, side = "straight",
 * side_amp = NA, corner = 0.05, round = c("exposed", "all", "none"),
 * surface = "none", left = 0, upi = NULL, tol = 1e-6)
 */
export function prettyLitholog(base, top, width, {
  widthTop = width, i = null, contact = 'sharp', topContact = 'sharp',
  amp = 0.06, wavelength = 0.18, side = 'straight', sideAmp = NaN, corner = 0.05,
  round = undefined, surface = 'none', left = 0, upi = null, tol = 1e-6
} = {}) {
  round = matchArg(round, ['exposed', 'all', 'none']);
  base = asArr(base);
  top = asArr(top);
  width = asArr(width);
  const n = base.length;
  if (top.length !== n || width.length !== n) {
    throw new Error("'base', 'top' and 'width' should have the same length");
  }
  if (top.some((t, k) => t <= base[k])) {
    throw new Error('Each bed should have top > base');
  }
  if (i === null || i === undefined) {
    i = base.map((_, k) => 'B' + (k + 1));
  }
  i = asArr(i).map((v) => (isNA(v) ? null : String(v)));
  if (i.length === 1 && n > 1) { i = new Array(n).fill(i[0]); } // data.frame() recycling
  widthTop = recycle(widthTop, n, 'width_top');
  contact = resolveContact(recycle(contact, n, 'contact'));
  topContact = resolveContact(Array.isArray(topContact) ? topContact[0] : topContact);
  amp = recycle(amp, n, 'amp');
  wavelength = recycle(wavelength, n, 'wavelength');
  side = recycle(side, n, 'side');
  sideAmp = recycle(sideAmp, n, 'side_amp');
  corner = recycle(corner, n, 'corner');
  surface = recycle(surface, n, 'surface');
  let bad = setdiffU(surface, surfaceTypes);
  if (bad.length > 0) {
    throw new Error('Unknown surface(s): ' + bad.join(', '));
  }
  bad = setdiffU(side, ['straight', 'convex', 'concave', 'wavy', 'zigzag']);
  if (bad.length > 0) {
    throw new Error('Unknown side shape(s): ' + bad.join(', '));
  }
  if (upi === null || upi === undefined) {
    upi = upiUser();
  }

  const o = order(base);
  const beds = dfRows({
    i, base, top, width, width_top: widthTop,
    contact, amp, wavelength, side,
    side_amp: sideAmp, corner, surface
  }, o);

  // Convert to inches
  const Lx = left / upi[0];
  const B = beds.base.map((v) => v / upi[1]);
  const Tp = beds.top.map((v) => v / upi[1]);
  const WB = beds.width.map((v) => v / upi[0]);
  const WT = beds.width_top.map((v) => v / upi[0]);
  const TH = Tp.map((v, k) => v - B[k]);

  // Interfaces at the base of each bed (ifc[k]) and top of the last bed
  const shared = B.map((v, k) => (k === 0 ? false : Math.abs(v - Tp[k - 1]) <= tol / upi[1]));
  const ifc = new Array(n + 1).fill(null);
  for (let k = 0; k < n; k++) {
    const tp = beds.contact[k];
    let s, differ, thLo;
    if (shared[k]) {
      s = Math.min(WT[k - 1], WB[k]);
      differ = Math.abs(WT[k - 1] - WB[k]) > 1e-6;
      thLo = TH[k - 1];
    } else {
      s = WB[k];
      differ = false;
      thLo = 0.5 * TH[k];
    }
    ifc[k] = { type: tp, L: Lx, s, A: beds.amp[k], lam: beds.wavelength[k], taper: differ };
    const X = dense(Lx, s);
    const d = contactDev(tp, X, Lx, s, ifc[k].A, ifc[k].lam, differ);
    const up = d.reduce((a, b) => Math.max(a, b), 0);
    const dn = d.reduce((a, b) => Math.max(a, -b), 0);
    let f = 1;
    if (up > 0) {
      f = Math.min(f, 0.8 * TH[k] / up);
    }
    if (dn > 0) {
      f = Math.min(f, 0.8 * thLo / dn);
    }
    ifc[k].A = ifc[k].A * f;
    ifc[k].shared = shared[k];
  }
  ifc[n] = {
    type: topContact, L: Lx, s: WT[n - 1], A: Math.min(beds.amp[n - 1], 0.8 * TH[n - 1]),
    lam: beds.wavelength[n - 1], taper: false, shared: false
  };

  const logs = [];
  const lns = [];
  const addline = (p, style, bed, part) => {
    if (p.x.length < 2) {
      return;
    }
    const id = lns.length + 1;
    lns.push({
      id: p.x.map(() => id), i: p.x.map(() => bed), part: p.x.map(() => part),
      style: p.x.map(() => style), x: p.x.slice(), y: p.y.slice()
    });
  };
  const tou = (p) => ({ x: p.x.map((v) => v * upi[0]), y: p.y.map((v) => v * upi[1]) });

  for (let k = 0; k < n; k++) {
    const ib = ifc[k];
    const it = ifc[k + 1];
    const topShared = k < n - 1 && shared[k + 1];
    // Base path, left to right
    const mb = Math.min(ib.s, WB[k]);
    const Xb = sortUnique([...dense(Lx, mb), ...dense(mb, WB[k])]);
    const pb = { x: Xb, y: ifacePath(Xb, B[k], ib) };
    // Top path, right to left
    const mt = Math.min(it.s, WT[k]);
    const Xt = sortUnique([...dense(Lx, mt), ...dense(mt, WT[k])]);
    const yt = (topShared || k === n - 1) ? ifacePath(Xt, Tp[k], it) : new Array(Xt.length).fill(Tp[k]);
    const pt = { x: Xt.slice().reverse(), y: yt.slice().reverse() };
    // Side path
    let sa = beds.side_amp[k];
    if (isNA(sa)) {
      sa = 0.03;
      if (beds.side[k] === 'convex') {
        sa = 0.05 + 0.3 * Math.abs(WB[k] - WT[k]);
      } else if (beds.side[k] === 'concave') {
        sa = 0.03 + 0.12 * Math.abs(WB[k] - WT[k]);
      }
    }
    const ps = sidePath(WB[k], last(pb.y), WT[k], pt.y[0], beds.side[k], sa, 0.06);

    // Rounded corners
    const expB = !shared[k] || WT[Math.max(k - 1, 0)] < WB[k] - 1e-6;
    const expT = !topShared || WB[Math.min(k + 1, n - 1)] < WT[k] - 1e-6;
    let rb = (round === 'all' || (round === 'exposed' && expB)) ? beds.corner[k] : 0;
    let rt = (round === 'all' || (round === 'exposed' && expT)) ? beds.corner[k] : 0;
    if (beds.side[k] === 'zigzag') {
      rb = 0;
      rt = 0;
    }
    const f1 = fillet(pb, ps, rb);
    const f2 = fillet(f1.p2, pt, rt);
    const pb2 = f1.p1;
    const sideFull = join(f1.curve, f2.p1, f2.curve);
    const pt2 = f2.p2;
    const leftP = { x: [Lx, Lx], y: [last(pt2.y), pb2.y[0]] };
    const poly = join(pb2, sideFull, pt2);
    logs.push({
      i: poly.y.map(() => beds.i[k]), dt: poly.y.map((v) => v * upi[1]), xy: poly.x.map((v) => v * upi[0])
    });

    // Outline pieces (in user units)
    addline(tou(sideFull), 'solid', beds.i[k], 'side');
    addline(tou(leftP), 'solid', beds.i[k], 'left');
    // Base: only the part not shared with the bed below
    if (!shared[k]) {
      addline(tou(pb2), lineStyle(ib.type), beds.i[k], 'base');
    } else {
      const idx = [];
      pb2.x.forEach((v, j) => { if (v >= ib.s - 1e-9) { idx.push(j); } });
      if (idx.length >= 2) {
        addline(tou({ x: idx.map((j) => pb2.x[j]), y: idx.map((j) => pb2.y[j]) }), 'solid', beds.i[k], 'base');
      }
    }
    // Top: shared part with the contact style, rest solid
    if (topShared) {
      const stl = lineStyle(it.type);
      const iin = [], iout = [];
      pt2.x.forEach((v, j) => {
        if (v <= it.s + 1e-9) { iin.push(j); }
        if (v >= it.s - 1e-9) { iout.push(j); }
      });
      if (iin.length >= 2) {
        addline(tou({ x: iin.map((j) => pt2.x[j]), y: iin.map((j) => pt2.y[j]) }), stl, beds.i[k], 'contact');
      }
      if (iout.length >= 2) {
        addline(tou({ x: iout.map((j) => pt2.x[j]), y: iout.map((j) => pt2.y[j]) }), 'solid', beds.i[k], 'top');
      }
    } else {
      const stl = (k === n - 1) ? lineStyle(topContact) : 'solid';
      addline(tou(pt2), stl, beds.i[k], 'top');
    }
  }

  const bindCols = (parts, cols) => {
    const outT = {};
    for (const c of cols) { outT[c] = parts.flatMap((p) => p[c]); }
    return outT;
  };
  const out = {
    log: bindCols(logs, ['i', 'dt', 'xy']),
    lines: bindCols(lns, ['id', 'i', 'part', 'style', 'x', 'y']),
    beds,
    contacts: {
      i: beds.i.slice(), level: beds.base.slice(), type: beds.contact.slice(),
      shared: shared.slice(), s: ifcS(ifc, n).map((v) => v * upi[0])
    },
    top_contact: topContact,
    left,
    upi: upi.slice()
  };
  Object.defineProperty(out, 'class', { value: 'pretty_litholog', enumerable: false });
  return out;
}

/** .ifc_s(ifc, n): right ends of the base interfaces. */
export function ifcS(ifc, n) {
  const s = new Array(n).fill(0);
  for (let k = 0; k < n; k++) {
    s[k] = ifc[k].s;
  }
  return s;
}

/** .line_style(type): line style of a contact. */
export function lineStyle(type) {
  if (type === 'gradational') {
    return 'dashed';
  }
  if (type === 'diastem') {
    return 'thick';
  }
  return 'solid';
}

// draw_beds ####

/**
 * draw_beds(x, pattern = NA, fill = NA, pattern.scale = 1, pattern.col = "black",
 * pattern.lwd = 0.5, border = "black", lwd = 1, ornaments = TRUE)
 */
export function drawBeds(x, {
  pattern = NaN, fill = NaN, patternScale = 1, patternCol = 'black',
  patternLwd = 0.5, border = 'black', lwd = 1, ornaments = true
} = {}) {
  const isPL = x && typeof x === 'object' && (x.class === 'pretty_litholog' ||
    (x.log && x.lines && x.beds && x.contacts && x.upi));
  if (!isPL) {
    throw new Error("'x' should come from pretty_litholog()");
  }
  const beds = x.beds;
  const n = beds.i.length;
  pattern = recycle(pattern, n, 'pattern');
  fill = recycle(fill, n, 'fill');
  for (let k = 0; k < n; k++) {
    const px = [], py = [];
    x.log.i.forEach((v, j) => {
      if (v === beds.i[k]) { px.push(x.log.xy[j]); py.push(x.log.dt[j]); }
    });
    if (!isNA(fill[k])) {
      polygon(px, py, { col: fill[k], border: null });
    }
    if (!isNA(pattern[k]) && pattern[k] !== 'none') {
      // bg: NULL (pattern default) without fill, NA with a fill
      const opts = { scale: patternScale, col: patternCol, lwd: patternLwd };
      if (!isNA(fill[k])) { opts.bg = NaN; }
      fillPattern(px, py, pattern[k], opts);
    }
  }
  if (ornaments) {
    drawSurfaces(x, patternCol, patternLwd * 1.6);
  }
  const L = x.lines;
  const groups = new Map();
  L.id.forEach((id, j) => {
    if (!groups.has(id)) { groups.set(id, []); }
    groups.get(id).push(j);
  });
  for (const idx of groups.values()) {
    const st = L.style[idx[0]];
    const lt = st === 'dashed' ? 2 : 1;
    const lw = st === 'thick' ? lwd * 2.8 : lwd;
    lines(idx.map((j) => L.x[j]), idx.map((j) => L.y[j]), { lty: lt, lwd: lw, col: border, lend: 1, ljoin: 1 });
  }
  if (ornaments) {
    drawContactOrnaments(x, border, lwd);
  }
  return x;
}

/** .draw_contact_ornaments(x, col, lwd): D and F labels, fault lines, clay partings, unconformity diamonds. */
export function drawContactOrnaments(x, col, lwd) {
  const upi = x.upi;
  const ct = x.contacts;
  const L = x.left;
  for (let k = 0; k < ct.type.length; k++) {
    const tp = ct.type[k];
    const y = ct.level[k];
    if (tp === 'diastem') {
      text(L - 0.08 * upi[0], y, 'D', { adj: [1, 0.5], cex: 0.7, col });
    } else if (tp === 'fault') {
      const a = !ct.angle || isNA(ct.angle[k]) ? 0 : ct.angle[k];
      const sense = !ct.sense || isNA(ct.sense[k]) ? 'normal' : ct.sense[k];
      const right = x.fault_right === undefined || x.fault_right === null ? Infinity : x.fault_right / upi[0];
      drawFault(L / upi[0], widthAt(x, y) / upi[0], y / upi[1], a, sense, upi, lwd, right);
    } else if (tp === 'clay_parting' && k > 0) {
      const lo = x.log.xy.filter((_, j) => x.log.i[j] === ct.i[k - 1]);
      const xr = Math.min(ct.s[k], lo.reduce((a, b) => Math.max(a, b), -Infinity));
      segments(L, y - 0.03 * upi[1], xr - 0.02 * upi[0], y - 0.03 * upi[1],
        { lty: 2, col, lwd: lwd * 0.8 });
    } else if (tp === 'unconformity') {
      const xs = seqByR(L + 0.1 * upi[0], ct.s[k] - 0.05 * upi[0], 0.22 * upi[0]);
      if (xs.length > 0) {
        logSymbol('dedolomite_pores', xs, y, { size: 0.09, col, bg: 'white', lwd: lwd * 0.8 });
      }
    }
  }
}

/**
 * .draw_fault(x0, x1, y, angle, sense, upi, lwd): red fault line through the
 * contact (inches), dipping `angle` degrees, with two half arrows beyond the
 * column (hanging wall down the dip for a normal fault, up for a reverse one).
 */
export const FAULT_COL = '#D7191C';
/** .width_at(x, y): right edge of the beds touching level y (a fault reaches just beyond them). */
export function widthAt(x, y) {
  const tol = 1e-6 * Math.max(1, Math.abs(y));
  const b = x.beds;
  const ids = new Set(b.i.filter((_, k) => b.base[k] <= y + tol && b.top[k] >= y - tol));
  let xy = x.log.xy.filter((_, j) => ids.has(x.log.i[j]));
  if (xy.length === 0) { xy = x.log.xy; }
  return xy.reduce((p, q) => Math.max(p, q), -Infinity);
}

/** .fault_symbols: symbols that draw a fault inside a bed (at their level). */
export const FAULT_SYMBOLS = ['fault', 'fault_normal', 'fault_reverse'];
export function drawFault(x0, x1, y, angle, sense, upi, lwd, right = Infinity) {
  const a = Math.max(-80, Math.min(80, angle)) * Math.PI / 180;
  const xa = x0 - 0.06;
  const xb = Math.max(Math.min(x1 + 0.3, right), (x0 + x1) / 2 + 0.25);
  const xm = (x0 + x1) / 2;
  const ta = Math.tan(a);
  const seg = (px0, py0, px1, py1, w) => {
    segments(px0 * upi[0], py0 * upi[1], px1 * upi[0], py1 * upi[1], { col: FAULT_COL, lwd: w, lend: 1 });
  };
  seg(xa, y + (xa - xm) * ta, xb, y + (xb - xm) * ta, lwd * 1.4);
  const d = [Math.cos(a), Math.sin(a)];
  const nv = [-Math.sin(a), Math.cos(a)];
  let sUp = a > 0 ? -1 : (a < 0 ? 1 : -1);
  if (sense === 'reverse') { sUp = -sUp; }
  const pc = [xb - 0.12, y + (xb - 0.12 - xm) * ta];
  for (const side of [1, -1]) {
    const dir = [d[0] * sUp * side, d[1] * sUp * side];
    const mid = [pc[0] + nv[0] * side * 0.045, pc[1] + nv[1] * side * 0.045];
    const tail = [mid[0] - dir[0] * 0.07, mid[1] - dir[1] * 0.07];
    const tip = [mid[0] + dir[0] * 0.07, mid[1] + dir[1] * 0.07];
    const barb = [tip[0] - dir[0] * 0.05 + nv[0] * side * 0.03, tip[1] - dir[1] * 0.05 + nv[1] * side * 0.03];
    seg(tail[0], tail[1], tip[0], tip[1], lwd);
    seg(tip[0], tip[1], barb[0], barb[1], lwd);
  }
}

/** .draw_surfaces(x, col, lwd): bed-top ornaments, clipped to the beds. */
export function drawSurfaces(x, col, lwd) {
  const upi = x.upi;
  const beds = x.beds;
  for (let k = 0; k < beds.i.length; k++) {
    const sf = beds.surface[k];
    if (sf === 'none') {
      continue;
    }
    const px = [], py = [];
    x.log.i.forEach((v, j) => {
      if (v === beds.i[k]) { px.push(x.log.xy[j] / upi[0]); py.push(x.log.dt[j] / upi[1]); }
    });
    const xr = px.reduce((a, b) => Math.max(a, b), -Infinity);
    const x0 = x.left / upi[0];
    const ytop = beds.top[k] / upi[1];
    let S = [];
    if (sf === 'hardground') {
      const xs = seqByR(x0 + 0.01, xr, 0.025);
      S = xs.map((v) => [v, ytop - 0.035, v, ytop + 0.01]);
    } else if (sf === 'mudcracks') {
      const xs = seqByR(x0 + 0.06, xr - 0.03, 0.12);
      S = [...xs.map((v) => [v - 0.03, ytop + 0.01, v, ytop - 0.08]),
        ...xs.map((v) => [v + 0.03, ytop + 0.01, v, ytop - 0.08])];
    } else if (sf === 'rootlets') {
      const xs = seqByR(x0 + 0.06, xr - 0.02, 0.1);
      S = [
        ...xs.map((v) => [v, ytop + 0.01, v, ytop - 0.05]),
        ...xs.map((v) => [v, ytop - 0.05, v - 0.025, ytop - 0.09]),
        ...xs.map((v) => [v, ytop - 0.05, v + 0.025, ytop - 0.09])
      ];
    } else if (sf === 'paleosol') {
      const xs = seqByR(x0 - 0.1, xr, 0.025);
      S = xs.map((v) => [v, ytop - 0.06, v + 0.06, ytop + 0.0]);
    } else if (sf === 'bored') {
      const xs = seqByR(x0 + 0.06, xr - 0.03, 0.11);
      S = [];
      for (const v of xs) {
        const a = arc({ cx: v, cy: ytop - 0.055, r: 0.02, from: PI, to: 2 * PI, n: 8 });
        S = S.concat(pl2seg([v - 0.02, ...a.x, v + 0.02], [ytop + 0.01, ...a.y, ytop + 0.01]));
      }
    } else if (sf === 'karst') {
      const xs = seqByR(x0 + 0.06, xr - 0.04, 0.1);
      for (const v of xs) {
        const sx = [-0.017, 0.017, 0.017, -0.017].map((d) => v + d);
        const sy = [-0.034, -0.034, 0, 0].map((d) => ytop - 0.012 + d);
        if (pip(sx, sy, px, py).every(Boolean)) {
          polygon(sx.map((q) => q * upi[0]), sy.map((q) => q * upi[1]), { col, border: col });
        }
      }
      continue;
    }
    const cl = clipSegs(S, px, py);
    if (cl.length > 0) {
      segments(cl.map((r) => r[0] * upi[0]), cl.map((r) => r[1] * upi[1]),
        cl.map((r) => r[2] * upi[0]), cl.map((r) => r[3] * upi[1]),
        { col, lwd, lend: 1 });
    }
  }
}
