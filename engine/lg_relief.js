// lg_relief.js: lithoglyph relief column (relief.R) ####

import { polygon } from './rgfx.js';
import { isNA, order } from './rbase.js';
import { arc, recycle, upiUser, seqOutR, matchArg } from './lg_utils.js';

const PI = Math.PI;

export const reliefShapes = ['bank', 'scarp', 'ramp', 'rounded', 'niche'];

/** .relief_bank(x1, w, b, t, r): rounded rectangle path in inch space, left corners rounded. */
export function reliefBank(x1, w, b, t, r, rt = r) {
  r = Math.min(r, w / 2, (t - b) / 2);
  rt = Math.min(rt, w / 2, (t - b) / 2);
  const a1 = arc({ cx: x1 - w + r, cy: b + r, r, from: 1.5 * PI, to: PI, n: 8 });
  const a2 = arc({ cx: x1 - w + rt, cy: t - rt, r: rt, from: PI, to: 0.5 * PI, n: 8 });
  return { x: [x1, ...a1.x, ...a2.x, x1], y: [b, ...a1.y, ...a2.y, t] };
}

// stats::spline(method = "fmm") ####

/** Coefficients of R's "fmm" cubic spline (port of fmm_spline() in R's splines.c). */
export function fmmSplineCoef(x, y) {
  const n = x.length;
  // 1-based arrays as in the C code
  const X = [0, ...x], Y = [0, ...y];
  const b = new Array(n + 1).fill(0), c = new Array(n + 1).fill(0), d = new Array(n + 1).fill(0);
  const out = () => ({ x: x.slice(), y: y.slice(), b: b.slice(1), c: c.slice(1), d: d.slice(1) });
  if (n < 2) {
    return out();
  }
  if (n < 3) {
    const t = Y[2] - Y[1];
    b[1] = t / (X[2] - X[1]);
    b[2] = b[1];
    c[1] = c[2] = d[1] = d[2] = 0;
    return out();
  }
  const nm1 = n - 1;
  // tridiagonal system: b = diagonal, d = off-diagonal, c = right-hand side
  d[1] = X[2] - X[1];
  c[2] = (Y[2] - Y[1]) / d[1];
  for (let i = 2; i < n; i++) {
    d[i] = X[i + 1] - X[i];
    b[i] = 2 * (d[i - 1] + d[i]);
    c[i + 1] = (Y[i + 1] - Y[i]) / d[i];
    c[i] = c[i + 1] - c[i];
  }
  // end conditions: third derivatives from divided differences
  b[1] = -d[1];
  b[n] = -d[nm1];
  c[1] = c[n] = 0;
  if (n > 3) {
    c[1] = c[3] / (X[4] - X[2]) - c[2] / (X[3] - X[1]);
    c[n] = c[nm1] / (X[n] - X[n - 2]) - c[n - 2] / (X[nm1] - X[n - 3]);
    c[1] = c[1] * d[1] * d[1] / (X[4] - X[1]);
    c[n] = -c[n] * d[nm1] * d[nm1] / (X[n] - X[n - 3]);
  }
  // Gaussian elimination
  for (let i = 2; i <= n; i++) {
    const t = d[i - 1] / b[i - 1];
    b[i] = b[i] - t * d[i - 1];
    c[i] = c[i] - t * c[i - 1];
  }
  // backward substitution
  c[n] = c[n] / b[n];
  for (let i = nm1; i >= 1; i--) {
    c[i] = (c[i] - d[i] * c[i + 1]) / b[i];
  }
  // polynomial coefficients
  b[n] = (Y[n] - Y[n - 1]) / d[n - 1] + d[n - 1] * (c[n - 1] + 2 * c[n]);
  for (let i = 1; i <= nm1; i++) {
    b[i] = (Y[i + 1] - Y[i]) / d[i] - d[i] * (c[i + 1] + 2 * c[i]);
    d[i] = (c[i + 1] - c[i]) / d[i];
    c[i] = 3 * c[i];
  }
  c[n] = 3 * c[n];
  d[n] = d[nm1];
  return out();
}

/** Evaluate spline coefficients at u (port of spline_eval(), non-periodic, non-natural). */
export function splineEval(u, z) {
  const { x, y, b, c, d } = z;
  const n = x.length;
  const n1 = n - 1;
  const v = new Array(u.length);
  let i = 0;
  for (let l = 0; l < u.length; l++) {
    const ul = u[l];
    if (ul < x[i] || (i < n1 && x[i + 1] < ul)) {
      i = 0;
      let j = n;
      do {
        const k = Math.floor((i + j) / 2);
        if (ul < x[k]) { j = k; } else { i = k; }
      } while (j > i + 1);
    }
    const dx = ul - x[i];
    v[l] = y[i] + dx * (b[i] + dx * (c[i] + dx * d[i]));
  }
  return v;
}

/** stats::spline(x, y, n, method = "fmm"): {x, y} at n equally spaced points (ties averaged). */
export function splineFmm(x, y, { n = 3 * x.length } = {}) {
  // regularize.values(): drop NA, sort, average ties
  let idx = x.map((_, k) => k).filter((k) => !isNA(x[k]) && !isNA(y[k]));
  let xs = idx.map((k) => x[k]), ys = idx.map((k) => y[k]);
  const unsorted = xs.some((v, k) => k > 0 && v < xs[k - 1]);
  if (unsorted) {
    const o = order(xs);
    xs = o.map((k) => xs[k]);
    ys = o.map((k) => ys[k]);
  }
  const ux = [], uy = [];
  for (let k = 0; k < xs.length; k++) {
    const j = ux.indexOf(xs[k]);
    if (j < 0) {
      ux.push(xs[k]);
      uy.push([ys[k]]);
    } else {
      uy[j].push(ys[k]);
    }
  }
  xs = ux;
  ys = uy.map((g) => g.reduce((a, b) => a + b, 0) / g.length);
  if (xs.length === 0) {
    throw new Error('zero non-NA points');
  }
  const xout = seqOutR(Math.min(...xs), Math.max(...xs), n);
  if (xs.length === 1) {
    return { x: xout, y: xout.map(() => ys[0]) };
  }
  const z = fmmSplineCoef(xs, ys);
  return { x: xout, y: splineEval(xout, z) };
}

// draw_relief ####

/**
 * draw_relief(base, top, relief, x0, x1, shape = "bank", style = c("beds", "smooth"),
 * gap = 0, corner = 0.03, col = "black", upi = NULL)
 */
export function drawRelief(base, top, relief, x0, x1, {
  shape = 'bank', style = undefined, gap = 0, corner = 0.03, col = 'black', upi = null, clip = null
} = {}) {
  style = matchArg(style, ['beds', 'smooth']);
  base = Array.isArray(base) ? base : [base];
  top = Array.isArray(top) ? top : [top];
  relief = (Array.isArray(relief) ? relief : [relief]).map((v) => (isNA(v) ? NaN : v));
  const n = base.length;
  if (top.length !== n || relief.length !== n) {
    throw new Error("'base', 'top' and 'relief' should have the same length");
  }
  shape = recycle(shape, n, 'shape');
  shape = shape.map((v) => (isNA(v) ? 'bank' : v));
  const bad = [...new Set(shape)].filter((v) => !reliefShapes.includes(v));
  if (bad.length > 0) {
    throw new Error('Unknown relief shape(s): ' + bad.join(', ') +
      '. Use one of: ' + reliefShapes.join(', ') + '.');
  }
  if (upi === null || upi === undefined) {
    upi = upiUser();
  }
  let r = relief.map((v) => Math.min(Math.max(v, -1), 1));
  const X1 = x1 / upi[0];
  const W = (x1 - x0) / upi[0];
  const B = base.map((v) => v / upi[1]);
  const Tp = top.map((v) => v / upi[1]);
  // app extra (not in R): clip = [lo, hi] keeps only that part of the relief
  // (user units), for previews of a few beds cut from the whole section
  const clipY = (p) => {
    const lo = clip[0] / upi[1], hi = clip[1] / upi[1];
    const xs = [], ys = [];
    for (let i = 0; i < p.x.length; i++) {
      const y = p.y[i];
      if (i > 0) {
        const yp = p.y[i - 1];
        for (const c of [lo, hi]) {
          if ((yp < c && y > c) || (yp > c && y < c)) {
            xs.push(p.x[i - 1] + (c - yp) / (y - yp) * (p.x[i] - p.x[i - 1]));
            ys.push(c);
          }
        }
      }
      if (y >= lo && y <= hi) { xs.push(p.x[i]); ys.push(y); }
    }
    if (xs.length > 0 && p.y[0] < lo) { xs.unshift(X1); ys.unshift(lo); }
    if (xs.length > 0 && p.y[p.y.length - 1] > hi) { xs.push(X1); ys.push(hi); }
    return { x: xs, y: ys };
  };
  const drawp = (p0) => {
    const p = clip ? clipY(p0) : p0;
    if (p.x.length < 3) { return; }
    polygon(p.x.map((v) => v * upi[0]), p.y.map((v) => v * upi[1]), { col, border: col, lwd: 0.5 });
  };

  if (style === 'smooth') {
    const o = order(base);
    const mids = o.map((k) => (B[k] + Tp[k]) / 2);
    const rv = o.map((k) => (isNA(r[k]) ? 0 : r[k]));
    // niches (negative values) pull the profile in: the curve goes through
    // the values themselves and is cut at zero, so a niche is a recess
    const yy = [B[o[0]], ...mids, Tp[o[n - 1]]];
    const vv = [rv[0], ...rv, rv[n - 1]];
    const sp = splineFmm(yy, vv, { n: Math.max(100, 40 * n) });
    const v = sp.y.map((q) => Math.min(Math.max(q, 0), 1));
    drawp({
      x: [X1, ...v.map((q) => X1 - W * q), X1],
      y: [sp.x[0], ...sp.x, sp.x[sp.x.length - 1]]
    });
    return null;
  }

  // width of the relief of bed j at its top (atTop) or base, for niches joining it
  const edgeW = (j, atTop) => {
    if (j < 0 || isNA(r[j]) || r[j] <= 0 || shape[j] === 'niche') { return 0; }
    const w = r[j] * W;
    if (shape[j] === 'bank') { return w; }
    if (shape[j] === 'scarp') { return atTop ? w : 0; }
    if (shape[j] === 'ramp') { return atTop ? 0 : w; }
    return 0;
  };
  const touch = (a, b) => Math.abs(a - b) < 1e-6;
  const isNiche = (j) => j >= 0 && !isNA(r[j]) && (r[j] < 0 || shape[j] === 'niche');
  const nbBelow = (k) => { for (let j = 0; j < n; j++) { if (j !== k && touch(Tp[j], B[k])) { return j; } } return -1; };
  const nbAbove = (k) => { for (let j = 0; j < n; j++) { if (j !== k && touch(B[j], Tp[k])) { return j; } } return -1; };

  for (let k = 0; k < n; k++) {
    if (isNA(r[k]) || r[k] === 0) {
      continue;
    }
    const w = Math.abs(r[k]) * W;
    const b = B[k] + gap / 2;
    const t = Tp[k] - gap / 2;
    if (t <= b) {
      continue;
    }
    const v = seqOutR(0, 1, 40);
    const y = v.map((q) => b + (t - b) * q);
    if (r[k] < 0 || shape[k] === 'niche') {
      // a niche is a hollow under or over the relief of the beds below and
      // above: smooth S-shaped faces that leave the neighbouring relief
      // vertically and curve in to a floor, which is the bed's
      // own relief (positive values) or 1 - |relief| of the narrower neighbour
      // (negative values). At the end of the section the floor continues.
      const jb = nbBelow(k), jt = nbAbove(k);
      let eb = jb >= 0 ? edgeW(jb, true) : NaN;
      let et = jt >= 0 ? edgeW(jt, false) : NaN;
      const known = [eb, et].filter((q) => !Number.isNaN(q));
      let f;
      if (r[k] < 0) {
        f = known.length > 0 ? Math.min(...known) * (1 + r[k]) : 0;
      } else {
        f = known.length > 0 ? Math.min(r[k] * W, ...known) : r[k] * W;
      }
      if (Number.isNaN(eb)) { eb = f; }
      if (Number.isNaN(et)) { et = f; }
      if (Math.max(eb, et, f) > 0) {
        const d0 = eb - f, d1 = et - f;
        const cc = d0 > 0 && d1 > 0 ? 0.5 : 0.6;
        const hollow = (q) => (q >= cc ? 0 : (1 + Math.cos(PI * Math.min(q / cc, 1))) / 2);
        const b2 = d0 > 0 ? B[k] - gap / 2 : b;
        const t2 = d1 > 0 ? Tp[k] + gap / 2 : t;
        const vn = seqOutR(0, 1, 121);
        const y2 = vn.map((q) => b2 + (t2 - b2) * q);
        const face = vn.map((q) => X1 - (f + d0 * hollow(q) + d1 * hollow(1 - q)));
        drawp({ x: [X1, ...face, X1], y: [b2, ...y2, t2] });
      }
      // between beds without relief a negative niche is flush: nothing sticks out
    } else if (shape[k] === 'bank') {
      // round a corner only where the neighbouring relief is narrower
      const jb = nbBelow(k), jt = nbAbove(k);
      const eb = isNiche(jb) ? w : edgeW(jb, true);
      const et = isNiche(jt) ? w : edgeW(jt, false);
      drawp(reliefBank(X1, w, b, t, eb >= w - 1e-9 ? 0 : corner, et >= w - 1e-9 ? 0 : corner));
    } else if (shape[k] === 'scarp') {
      drawp({ x: [X1, ...v.map((q) => X1 - w * Math.pow(q, 1.6)), X1], y: [b, ...y, t] });
    } else if (shape[k] === 'ramp') {
      drawp({ x: [X1, ...v.map((q) => X1 - w * Math.pow(1 - q, 1.6)), X1], y: [b, ...y, t] });
    } else if (shape[k] === 'rounded') {
      drawp({ x: [X1, ...v.map((q) => X1 - w * Math.pow(Math.sin(PI * q), 0.6)), X1], y: [b, ...y, t] });
    }
  }
  return null;
}
