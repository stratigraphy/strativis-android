// lg_utils.js: lithoglyph utils.R (internal geometry helpers) ####
//
// Segment matrices (R: matrix with columns x0, y0, x1, y1) are arrays of
// rows [x0, y0, x1, y1]. Paths are {x: [...], y: [...]}.

import { devCur, upi } from './rgfx.js';

// R arithmetic helpers ####

/** R's %% for doubles (result has the sign of the divisor). */
export function rMod(a, b) {
  const r = a % b;
  return (r !== 0 && (r < 0) !== (b < 0)) ? r + b : r;
}

// R's cumsum() / sum() accumulate in x87 long double (64-bit mantissa) and
// round to double at the end. extAdd emulates that exactly with BigInt.
const F64 = new Float64Array(1);
const U64 = new BigUint64Array(F64.buffer);

// double -> [mantissa (BigInt), exponent] with value = m * 2^e
function dbl2me(x) {
  F64[0] = x;
  const bits = U64[0];
  const neg = (bits >> 63n) === 1n;
  const ex = Number((bits >> 52n) & 0x7FFn);
  let m = bits & 0xFFFFFFFFFFFFFn;
  let e;
  if (ex === 0) { e = -1074; } else { m |= 0x10000000000000n; e = ex - 1075; }
  return [neg ? -m : m, e];
}

function bitLen(m) {
  return m === 0n ? 0 : (m < 0n ? -m : m).toString(2).length;
}

// round m * 2^e to `bits` significant bits, half to even
function roundBits(m, e, bits) {
  const L = bitLen(m);
  if (L <= bits) { return [m, e]; }
  const sh = BigInt(L - bits);
  const neg = m < 0n;
  let a = neg ? -m : m;
  const q = a >> sh;
  const rem = a - (q << sh);
  const half = 1n << (sh - 1n);
  let r = q;
  if (rem > half || (rem === half && (q & 1n) === 1n)) { r = q + 1n; }
  a = r;
  return [neg ? -a : a, e + Number(sh)];
}

function me2dbl(m, e) {
  [m, e] = roundBits(m, e, 53);
  let v = Number(m);
  // scale in two steps to stay in range
  const h = Math.trunc(e / 2);
  return v * Math.pow(2, h) * Math.pow(2, e - h);
}

/** cumsum() as R computes it (long double accumulator). */
export function cumsumR(v) {
  const out = [];
  let sm = 0n, se = 0;
  let nonfin = 0; // running sum of NaN / Inf values
  for (const x of v) {
    if (!Number.isFinite(x)) { nonfin += x; }
    if (nonfin !== 0) {
      out.push(nonfin);
      continue;
    }
    const [m, e] = dbl2me(x);
    if (m !== 0n) {
      if (sm === 0n) {
        sm = m; se = e;
      } else if (e < se) {
        sm = (sm << BigInt(se - e)) + m; se = e;
      } else {
        sm = sm + (m << BigInt(e - se));
      }
      [sm, se] = roundBits(sm, se, 64);
    }
    out.push(sm === 0n ? 0 : me2dbl(sm, se));
  }
  return out;
}

/** sum() as R computes it (long double accumulator). */
export function sumR(v) {
  const c = cumsumR(v);
  return c.length ? c[c.length - 1] : 0;
}

// Correctly rounded sin, cos, tan ####
// R uses the C library (glibc: correctly rounded in practice); V8's Math.sin
// and Math.cos (fdlibm) are sometimes 1 ulp away. These evaluate in
// double-double arithmetic and round once, so they match R bit for bit.

const SPLIT = 134217729; // 2^27 + 1

function twoSum(a, b) {
  const s = a + b;
  const bb = s - a;
  return [s, (a - (s - bb)) + (b - bb)];
}

function twoProd(a, b) {
  const p = a * b;
  let t = SPLIT * a;
  const ah = t - (t - a), al = a - ah;
  t = SPLIT * b;
  const bh = t - (t - b), bl = b - bh;
  return [p, ((ah * bh - p) + ah * bl + al * bh) + al * bl];
}

function ddAdd(a, b) {
  let [s, e] = twoSum(a[0], b[0]);
  const [t, f] = twoSum(a[1], b[1]);
  e += t;
  [s, e] = twoSum(s, e);
  e += f;
  return twoSum(s, e);
}

function ddMul(a, b) {
  const [p, e] = twoProd(a[0], b[0]);
  return twoSum(p, e + (a[0] * b[1] + a[1] * b[0]));
}

function ddDivD(a, d) {
  const q1 = a[0] / d;
  const [p, e] = twoProd(q1, d);
  const r = ddAdd(a, [-p, -e]);
  const q2 = r[0] / d;
  return twoSum(q1, q2);
}

function ddDiv(a, b) {
  const q1 = a[0] / b[0];
  const r = ddAdd(a, ddMul(b, [-q1, 0]));
  const q2 = r[0] / b[0];
  const r2 = ddAdd(r, ddMul(b, [-q2, 0]));
  const q3 = r2[0] / b[0];
  return ddAdd(twoSum(q1, q2), [q3, 0]);
}

// 1 / k! as double-doubles, k = 0..30
const INV_FACT = (() => {
  const out = [[1, 0]];
  for (let k = 1; k <= 30; k++) { out.push(ddDivD(out[k - 1], k)); }
  return out;
})();

// pi / 2 in four pieces of 33 bits (fdlibm)
const PIO2 = [1.57079632673412561417e+00, 6.07710050630396597660e-11, 2.02226624871116645580e-21, 8.47842766036889956997e-32];

// x = k * pi / 2 + r, r as a double-double
function reduce(x) {
  const k = Math.round(x / (Math.PI / 2));
  let r = twoSum(x, -k * PIO2[0]);
  for (let j = 1; j < 4; j++) { r = ddAdd(r, [-k * PIO2[j], 0]); }
  return [k, r];
}

function ddSinCos(r) {
  const r2 = ddMul(r, r);
  // sin: r - r^3/3! + ...; cos: 1 - r^2/2! + ...
  let s = [0, 0], c = [0, 0];
  for (let k = 29; k >= 1; k -= 2) {
    const ci = k % 4 === 1 ? INV_FACT[k] : [-INV_FACT[k][0], -INV_FACT[k][1]];
    s = ddAdd(ddMul(s, r2), ci);
  }
  s = ddMul(s, r);
  for (let k = 28; k >= 0; k -= 2) {
    const ci = k % 4 === 0 ? INV_FACT[k] : [-INV_FACT[k][0], -INV_FACT[k][1]];
    c = ddAdd(ddMul(c, r2), ci);
  }
  return [s, c];
}

function sinCosDD(x) {
  const [k, r] = reduce(x);
  const [s, c] = ddSinCos(r);
  const q = ((k % 4) + 4) % 4;
  const neg = (v) => [-v[0], -v[1]];
  if (q === 0) { return [s, c]; }
  if (q === 1) { return [c, neg(s)]; }
  if (q === 2) { return [neg(s), neg(c)]; }
  return [neg(c), s];
}

const TRIG_MAX = 1e6;

/** sin(x) as R gives it (correctly rounded). */
export function sinR(x) {
  if (!Number.isFinite(x) || Math.abs(x) > TRIG_MAX) { return Math.sin(x); }
  if (Math.abs(x) < 1e-8) { return Math.sin(x); }
  const s = sinCosDD(x)[0];
  return s[0] + s[1];
}

/** cos(x) as R gives it (correctly rounded). */
export function cosR(x) {
  if (!Number.isFinite(x) || Math.abs(x) > TRIG_MAX) { return Math.cos(x); }
  const c = sinCosDD(x)[1];
  return c[0] + c[1];
}

/** tan(x) as R gives it (correctly rounded). */
export function tanR(x) {
  if (!Number.isFinite(x) || Math.abs(x) > TRIG_MAX) { return Math.tan(x); }
  if (Math.abs(x) < 1e-8) { return Math.tan(x); }
  const [s, c] = sinCosDD(x);
  const t = ddDiv(s, c);
  return t[0] + t[1];
}

/** seq(from, to, length.out = n) exactly as R computes it (doubles). */
export function seqOutR(from, to, n) {
  n = Math.ceil(n);
  if (n <= 0) { return []; }
  if (n === 1) { return [from]; }
  if (n === 2) { return [from, to]; }
  if (from === to) { return new Array(n).fill(from); }
  const n1 = n - 1;
  const del = to - from;
  const by = del / n1;
  const out = [from];
  for (let k = 1; k <= n - 2; k++) { out.push(from + k * by); }
  out.push(to);
  return out;
}

/** from:to for doubles (R's colon operator). */
export function colonR(from, to) {
  const out = [];
  if (from <= to) {
    const n = Math.floor(to - from + 1e-10);
    for (let k = 0; k <= n; k++) { out.push(from + k); }
  } else {
    const n = Math.floor(from - to + 1e-10);
    for (let k = 0; k <= n; k++) { out.push(from - k); }
  }
  return out;
}

/** seq(from, to, by = by) for doubles, as R's seq.default. */
export function seqByStrict(from, to, by) {
  const del = to - from;
  if (del === 0 && to === 0) { return [to]; }
  const n0 = del / by;
  if (!Number.isFinite(n0)) {
    if (by === 0 && del === 0) { return [from]; }
    throw new Error("invalid '(to - from)/by'");
  }
  if (n0 < 0) { throw new Error("wrong sign in 'by' argument"); }
  if (n0 > 2147483647) { throw new Error("'by' argument is much too small"); }
  if (Math.abs(del) / Math.max(Math.abs(to), Math.abs(from)) < 100 * Number.EPSILON) { return [from]; }
  const n = Math.trunc(n0 + 1e-10);
  const out = [];
  for (let k = 0; k <= n; k++) {
    const x = from + k * by;
    out.push(by > 0 ? Math.min(x, to) : Math.max(x, to));
  }
  return out;
}

/**
 * match.arg(arg, choices): undefined / null / the full choices give the first
 * choice; otherwise exact or unique partial matching, as R.
 */
export function matchArg(arg, choices) {
  if (arg === undefined || arg === null) { return choices[0]; }
  if (Array.isArray(arg)) {
    if (arg.length === choices.length && arg.every((a, k) => a === choices[k])) { return choices[0]; }
    if (arg.length !== 1) { throw new Error("'arg' must be of length 1"); }
    arg = arg[0];
  }
  arg = String(arg);
  if (arg !== '') {
    if (choices.includes(arg)) { return arg; }
    const part = choices.filter((c) => c.startsWith(arg));
    if (part.length === 1) { return part[0]; }
  }
  throw new Error("'arg' should be one of " + choices.map((c) => '"' + c + '"').join(', '));
}

/** as.numeric() of one value (character input parsed like R; '' and junk give NaN). */
export function asNumericR(v) {
  if (v === null || v === undefined) { return NaN; }
  if (typeof v === 'number') { return v; }
  if (typeof v === 'boolean') { return v ? 1 : 0; }
  const s = String(v).trim();
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) { return Number(s); }
  if (/^[+-]?0[xX][0-9a-fA-F]+$/.test(s)) {
    const neg = s[0] === '-';
    const h = parseInt(s.replace(/^[+-]?0[xX]/, ''), 16);
    return neg ? -h : h;
  }
  if (/^[+-]?(inf|infinity)$/i.test(s)) { return s[0] === '-' ? -Infinity : Infinity; }
  return NaN;
}

// User units per inch ####

/**
 * par("pin") as R's pdf device computes it: the margins in inches go to lines
 * and back through device units (1/72 inch; pointsize truncated to an
 * integer), so the result can differ from the plain value by an ulp. The
 * patterns divide coordinates by upi, so this keeps their clipping decisions
 * identical to R. Returns null if the device lacks the needed fields.
 */
export function pinR(d) {
  if (!d || !(d.W > 0) || !(d.H > 0) || !d.fig || !d.mai) {
    return null;
  }
  const right = 72 * d.W, top = 72 * d.H, ipr = 1 / 72;
  const cra1 = 1.2 * Math.trunc(d.ps ?? 12);
  const cex = d.cex ?? 1;
  const xNDCPerInch = 1.0 / Math.abs(right * ipr);
  const yNDCPerInch = 1.0 / Math.abs(top * ipr);
  const xNDCPerLine = Math.abs(1 * cex * 1 * cra1 * 1 / right);
  const yNDCPerLine = Math.abs(1 * cex * 1 * cra1 / top);
  const fbx = Math.abs(d.fig[1] * right - d.fig[0] * right);
  const fby = Math.abs(d.fig[3] * top - d.fig[2] * top);
  // mai (inches) -> mar (lines) -> plt (NFC)
  const marX = (m) => ((m * xNDCPerInch) * right / right) / xNDCPerLine;
  const marY = (m) => ((m * yNDCPerInch) * top / top) / yNDCPerLine;
  const nfcX = (l) => ((l * xNDCPerLine) * right) / fbx;
  const nfcY = (l) => ((l * yNDCPerLine) * top) / fby;
  const plt = [nfcX(marX(d.mai[1])), 1.0 - nfcX(marX(d.mai[3])), nfcY(marY(d.mai[0])), 1.0 - nfcY(marY(d.mai[2]))];
  return [(((plt[1] - plt[0]) * fbx) / right) / xNDCPerInch, (((plt[3] - plt[2]) * fby) / top) / yNDCPerInch];
}

/** .upi(): user units per inch of the plot region, [x, y]; [1, 1] with no device. */
export function upiUser() {
  const d = devCur();
  if (!d) {
    return [1, 1];
  }
  const pin = pinR(d);
  if (pin === null || !d.usr) {
    return upi();
  }
  const usr = d.usr;
  return [(usr[1] - usr[0]) / pin[0], (usr[3] - usr[2]) / pin[1]];
}

// Pseudo-random numbers ####

/** .lcg(n, seed = 1): deterministic numbers in [0, 1) (Park-Miller). */
export function lcg(n, { seed = 1 } = {}) {
  const out = new Array(n);
  // 16807 * s < 2^53, so double arithmetic is exact, as in R
  let s = rMod(Number(seed), 2147483647);
  if (s === 0) {
    s = 1;
  }
  for (let k = 0; k < n; k++) {
    s = rMod(16807 * s, 2147483647);
    out[k] = s / 2147483647;
  }
  return out;
}

// Segments ####

/** .pl2seg(x, y): polyline to segment rows; NA breaks the line. */
export function pl2seg(x, y) {
  const n = x.length;
  const out = [];
  if (n < 2) {
    return out;
  }
  for (let k = 0; k < n - 1; k++) {
    const r = [x[k], y[k], x[k + 1], y[k + 1]];
    if (r.every((v) => typeof v === 'number' && !Number.isNaN(v))) { out.push(r); }
  }
  return out;
}

/** .ring2seg(x, y): closed outline to segment rows. */
export function ring2seg(x, y) {
  return pl2seg(x.concat([x[0]]), y.concat([y[0]]));
}

// Shapes ####

/** .circ(cx = 0, cy = 0, r = 0.5, n = 24). */
export function circ({ cx = 0, cy = 0, r = 0.5, n = 24 } = {}) {
  const a = seqOutR(0, 2 * Math.PI, n + 1).slice(0, n);
  return { x: a.map((v) => cx + r * cosR(v)), y: a.map((v) => cy + r * sinR(v)) };
}

/** .arc(cx = 0, cy = 0, r = 0.5, from = 0, to = pi, n = 16). */
export function arc({ cx = 0, cy = 0, r = 0.5, from = 0, to = Math.PI, n = 16 } = {}) {
  const a = seqOutR(from, to, n);
  return { x: a.map((v) => cx + r * cosR(v)), y: a.map((v) => cy + r * sinR(v)) };
}

/** .ell(cx = 0, cy = 0, a = 0.5, b = 0.3, rot = 0, n = 20). */
export function ell({ cx = 0, cy = 0, a = 0.5, b = 0.3, rot = 0, n = 20 } = {}) {
  const t = seqOutR(0, 2 * Math.PI, n + 1).slice(0, n);
  const x = t.map((v) => a * cosR(v));
  const y = t.map((v) => b * sinR(v));
  const cr = cosR(rot), sr = sinR(rot);
  return {
    x: x.map((v, k) => cx + v * cr - y[k] * sr),
    y: x.map((v, k) => cy + v * sr + y[k] * cr)
  };
}

// Point in polygon and clipping ####

/** .pip(px, py, polx, poly): point in polygon (ray casting), boolean array. */
export function pip(px, py, polx, poly) {
  if (!Array.isArray(px)) { px = [px]; }
  if (!Array.isArray(py)) { py = [py]; }
  const np = px.length;
  const inside = new Array(np).fill(false);
  const m = polx.length;
  let j = m - 1;
  for (let i = 0; i < m; i++) {
    const xi = polx[i];
    const yi = poly[i];
    const xj = polx[j];
    const yj = poly[j];
    if (yi !== yj) {
      for (let k = 0; k < np; k++) {
        const cond = ((yi > py[k]) !== (yj > py[k])) &&
          (px[k] < (xj - xi) * (py[k] - yi) / (yj - yi) + xi);
        inside[k] = inside[k] !== cond;
      }
    }
    j = i;
  }
  return inside;
}

/**
 * .clip_segs(S, polx, poly): pieces of the segments (rows [x0, y0, x1, y1])
 * that lie inside the polygon.
 */
export function clipSegs(S, polx, poly) {
  if (S.length === 0) {
    return S;
  }
  let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
  for (const v of polx) { if (v < bx0) { bx0 = v; } if (v > bx1) { bx1 = v; } }
  for (const v of poly) { if (v < by0) { by0 = v; } if (v > by1) { by1 = v; } }
  S = S.filter((r) => Math.max(r[0], r[2]) >= bx0 && Math.min(r[0], r[2]) <= bx1 &&
    Math.max(r[1], r[3]) >= by0 && Math.min(r[1], r[3]) <= by1);
  const n = S.length;
  if (n === 0) {
    return S;
  }
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  for (let q = 0; q < n; q++) {
    dx[q] = S[q][2] - S[q][0];
    dy[q] = S[q][3] - S[q][1];
  }
  const m = polx.length;
  const id = [];
  const tt = [];
  for (let e = 0; e < m; e++) {
    const e2 = e === m - 1 ? 0 : e + 1;
    const ex = polx[e];
    const ey = poly[e];
    const fx = polx[e2] - ex;
    const fy = poly[e2] - ey;
    for (let q = 0; q < n; q++) {
      const den = dx[q] * fy - dy[q] * fx;
      if (!(Math.abs(den) > 1e-12)) { continue; }
      const t = ((ex - S[q][0]) * fy - (ey - S[q][1]) * fx) / den;
      const s = ((ex - S[q][0]) * dy[q] - (ey - S[q][1]) * dx[q]) / den;
      if (t > 0 && t < 1 && s >= 0 && s < 1) {
        id.push(q);
        tt.push(t);
      }
    }
  }
  for (let q = 0; q < n; q++) { id.push(q); tt.push(0); }
  for (let q = 0; q < n; q++) { id.push(q); tt.push(1); }
  const o = id.map((_, k) => k);
  o.sort((a, b) => (id[a] - id[b]) || (tt[a] - tt[b]) || (a - b));
  const k = o.length;
  const A = [], B = [], sid = [], mx = [], my = [];
  for (let r = 0; r < k - 1; r++) {
    const i0 = o[r], i1 = o[r + 1];
    if (id[i0] !== id[i1]) { continue; }
    const a = tt[i0], b = tt[i1];
    if (!((b - a) > 1e-9)) { continue; }
    const q = id[i0];
    const mid = (a + b) / 2;
    A.push(a);
    B.push(b);
    sid.push(q);
    mx.push(S[q][0] + mid * dx[q]);
    my.push(S[q][1] + mid * dy[q]);
  }
  const ins = pip(mx, my, polx, poly);
  const out = [];
  for (let r = 0; r < sid.length; r++) {
    if (!ins[r]) { continue; }
    const q = sid[r];
    out.push([
      S[q][0] + A[r] * dx[q], S[q][1] + A[r] * dy[q],
      S[q][0] + B[r] * dx[q], S[q][1] + B[r] * dy[q]
    ]);
  }
  return out;
}

// Path helpers (paths are {x, y}, in inch space) ####

/** .plen(p): cumulative length along the path (0 for fewer than 2 points). */
export function plen(p) {
  const n = p.x.length;
  if (n < 2) {
    return [0];
  }
  const d = [];
  for (let k = 1; k < n; k++) {
    const ddx = p.x[k] - p.x[k - 1];
    const ddy = p.y[k] - p.y[k - 1];
    d.push(Math.sqrt(ddx * ddx + ddy * ddy));
  }
  return [0].concat(cumsumR(d));
}

/** .trim_end(p, d): remove distance d from the end of a path. */
export function trimEnd(p, d) {
  const cl = plen(p);
  const tot = cl[cl.length - 1];
  if (d <= 0 || tot <= 0) {
    return p;
  }
  const target = Math.max(tot - d, 0);
  let k = -1;
  for (let q = 0; q < cl.length; q++) { if (cl[q] <= target) { k = q; } }
  if (k >= cl.length - 1) {
    return p;
  }
  const f = (target - cl[k]) / (cl[k + 1] - cl[k]);
  return {
    x: p.x.slice(0, k + 1).concat([p.x[k] + f * (p.x[k + 1] - p.x[k])]),
    y: p.y.slice(0, k + 1).concat([p.y[k] + f * (p.y[k + 1] - p.y[k])])
  };
}

/** .rev_path(p). */
export function revPath(p) {
  return { x: p.x.slice().reverse(), y: p.y.slice().reverse() };
}

/** .trim_start(p, d). */
export function trimStart(p, d) {
  return revPath(trimEnd(revPath(p), d));
}

/**
 * .fillet(p1, p2, r, n = 10): rounded joint between the end of p1 and the
 * start of p2. Returns {p1, curve, p2}.
 */
export function fillet(p1, p2, r, { n = 10 } = {}) {
  const l1 = plen(p1);
  const l2 = plen(p2);
  r = Math.min(r, 0.45 * l1[l1.length - 1], 0.45 * l2[l2.length - 1]);
  if (r <= 1e-9) {
    return { p1, curve: { x: [], y: [] }, p2 };
  }
  const vx = p1.x[p1.x.length - 1];
  const vy = p1.y[p1.y.length - 1];
  const a = trimEnd(p1, r);
  const b = trimStart(p2, r);
  const ax = a.x[a.x.length - 1];
  const ay = a.y[a.y.length - 1];
  const bx = b.x[0];
  const by = b.y[0];
  const t = seqOutR(0, 1, n);
  const cx = t.map((v) => { const u = 1 - v; return u * u * ax + 2 * u * v * vx + v * v * bx; });
  const cy = t.map((v) => { const u = 1 - v; return u * u * ay + 2 * u * v * vy + v * v * by; });
  return { p1: a, curve: { x: cx, y: cy }, p2: b };
}

/** .join(...): concatenate paths. */
export function join(...ps) {
  let x = [];
  let y = [];
  for (const p of ps) {
    x = x.concat(p.x);
    y = y.concat(p.y);
  }
  return { x, y };
}

/** .recycle(v, n, name): length 1 -> rep(v, n); length n -> v; otherwise an error. */
export function recycle(v, n, name) {
  if (!Array.isArray(v)) {
    return new Array(n).fill(v);
  }
  if (v.length === 1) {
    return new Array(n).fill(v[0]);
  }
  if (v.length !== n) {
    throw new Error("'" + name + "' should be of length 1 or " + n);
  }
  return v.slice();
}

/** .seq_by(from, to, by): seq(from, to, by) that returns nothing when the range is empty. */
export function seqByR(from, to, by) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
    return [];
  }
  return seqByStrict(from, to, by);
}
