// lg_symbols.js: lithoglyph point symbols (symbol_defs.R, symbols.R) ####
//
// Every symbol is an array of primitives drawn in a unit box centred on 0, 0
// (x and y from -0.5 to 0.5): polylines {t: 'l', x, y}, polygons
// {t: 'p', x, y, fill} and text {t: 't', x, y, label, cex}. Coordinates are
// arrays (length 1 for text), as the R vectors.

import { lines, polygon, text, par } from './rgfx.js';
import { isNA } from './rbase.js';
import { arc, circ, ell, upiUser } from './lg_utils.js';

const PI = Math.PI;

// seq(from, to, length.out = n) with R's arithmetic
function seqLo(from, to, n) {
  n = Math.ceil(n);
  if (n <= 0) { return []; }
  if (n === 1) { return [from]; }
  if (n === 2) { return [from, to]; }
  if (from === to) { return new Array(n).fill(from); }
  const by = (to - from) / (n - 1);
  const out = [from];
  for (let i = 1; i <= n - 2; i++) { out.push(from + i * by); }
  out.push(to);
  return out;
}

// v[-length(v)]
const dropLast = (v) => v.slice(0, v.length - 1);

// Primitives ####

/** .Lp(x, y): polyline. */
export function Lp(x, y) {
  return { t: 'l', x: x.slice(), y: y.slice() };
}

/** .Pp(x, y, fill = FALSE): polygon. */
export function Pp(x, y, { fill = false } = {}) {
  return { t: 'p', x: x.slice(), y: y.slice(), fill };
}

/** .Cp(cx = 0, cy = 0, r = 0.3, fill = FALSE, n = 28): circle. */
export function Cp({ cx = 0, cy = 0, r = 0.3, fill = false, n = 28 } = {}) {
  const c1 = circ({ cx, cy, r, n });
  return Pp(c1.x, c1.y, { fill });
}

/** .Ep(cx = 0, cy = 0, a = 0.4, b = 0.25, rot = 0, fill = FALSE): ellipse. */
export function Ep({ cx = 0, cy = 0, a = 0.4, b = 0.25, rot = 0, fill = false } = {}) {
  const e = ell({ cx, cy, a, b, rot, n: 28 });
  return Pp(e.x, e.y, { fill });
}

/** .Ap(cx = 0, cy = 0, r = 0.3, from = 0, to = pi, n = 20): arc. */
export function Ap({ cx = 0, cy = 0, r = 0.3, from = 0, to = PI, n = 20 } = {}) {
  const a = arc({ cx, cy, r, from, to, n });
  return Lp(a.x, a.y);
}

/** .Tp(label, x = 0, y = 0, cex = 1): text. */
export function Tp(label, { x = 0, y = 0, cex = 1 } = {}) {
  return { t: 't', x: [x], y: [y], label, cex };
}

/** .Seg(x0, y0, x1, y1): straight segment. */
export function Seg(x0, y0, x1, y1) {
  return Lp([x0, x1], [y0, y1]);
}

/** .mv(s, dx = 0, dy = 0, f = 1): shift / scale a whole symbol (returns a copy). */
export function mv(s, { dx = 0, dy = 0, f = 1 } = {}) {
  return s.map((p) => {
    const q = { ...p, x: p.x.map((v) => v * f + dx), y: p.y.map((v) => v * f + dy) };
    if (p.t === 't') { q.cex = p.cex * f; }
    return q;
  });
}

/** .rot_sym(s, a): rotate a whole symbol by a radians (returns a copy). */
export function rotSym(s, a) {
  return s.map((p) => {
    const x = p.x, y = p.y;
    return {
      ...p,
      x: x.map((v, k) => v * Math.cos(a) - y[k] * Math.sin(a)),
      y: x.map((v, k) => v * Math.sin(a) + y[k] * Math.cos(a))
    };
  });
}

/** .arrow(y0 = -0.45, y1 = 0.45, x = 0, head = 0.15, half = FALSE): arrow pointing up. */
export function arrow({ y0 = -0.45, y1 = 0.45, x = 0, head = 0.15, half = false } = {}) {
  const out = [Seg(x, y0, x, y1)];
  if (half) {
    out[1] = Lp([x, x - head * 0.6], [y1, y1 - head]);
  } else {
    out[1] = Lp([x - head * 0.6, x, x + head * 0.6], [y1 - head, y1, y1 - head]);
  }
  return out;
}

/** .sine_line(x0, x1, y, amp, nper, n = 40, phase = 0). */
export function sineLine(x0, x1, y, amp, nper, { n = 40, phase = 0 } = {}) {
  const x = seqLo(x0, x1, n);
  return Lp(x, x.map((v) => y + amp * Math.sin(2 * PI * nper * (v - x0) / (x1 - x0) + phase)));
}

/** .fossil(): generic fossil (skeletal grain sign). */
export function fossil() {
  const b = circ({ cx: 0, cy: -0.17, r: 0.2, n: 24 });
  const a = arc({ cx: 0.02, cy: 0.12, r: 0.17, from: -PI / 2 + 0.3, to: PI * 1.1, n: 16 });
  return [
    Pp(b.x, b.y),
    Lp([-0.12, ...a.x], [-0.01, ...a.y]),
    Ap({ cx: -0.02, cy: -0.17, r: 0.09, from: PI * 0.2, to: PI * 1.4, n: 10 })
  ];
}

/** .leaf(cx = 0, cy = 0.12, s = 1). */
export function leaf({ cx = 0, cy = 0.12, s = 1 } = {}) {
  const t = dropLast(seqLo(0, 2 * PI, 25));
  const x = t.map((v) => 0.17 * s * Math.sin(v) * Math.pow(Math.abs(Math.sin(v / 2)), 0.2));
  const y = t.map((v) => 0.24 * s * Math.cos(v));
  return [Pp(x.map((v) => cx + v), y.map((v) => cy + v)), Seg(cx, cy - 0.24 * s, cx, cy - 0.5 * s)];
}

/** .u_burrow(w = 0.22, top = 0.4, bot = -0.35). */
export function uBurrow({ w = 0.22, top = 0.4, bot = -0.35 } = {}) {
  const a = arc({ cx: 0, cy: bot + w / 2, r: w / 2, from: PI, to: 2 * PI, n: 14 });
  return Lp([-w / 2, ...a.x, w / 2], [top, ...a.y, top]);
}

/** .spiral(r0 = 0.04, r1 = 0.42, turns = 2.2, n = 80). */
export function spiral({ r0 = 0.04, r1 = 0.42, turns = 2.2, n = 80 } = {}) {
  const t = seqLo(0, 2 * PI * turns, n);
  const mt = Math.max(...t);
  const r = t.map((v) => r0 + (r1 - r0) * v / mt);
  return Lp(r.map((v, k) => v * Math.cos(t[k])), r.map((v, k) => v * Math.sin(t[k])));
}

/** .star(r1 = 0.42, r2 = 0.17, k = 5, fill = FALSE). */
export function star({ r1 = 0.42, r2 = 0.17, k = 5, fill = false } = {}) {
  const a = dropLast(seqLo(0, 2 * PI, 2 * k + 1)).map((v) => PI / 2 + v);
  const r = a.map((_, j) => (j % 2 === 0 ? r1 : r2));
  return Pp(r.map((v, j) => v * Math.cos(a[j])), r.map((v, j) => v * Math.sin(a[j])), { fill });
}

/** .diamond(w = 0.4, h = 0.28, fill = FALSE). */
export function diamond({ w = 0.4, h = 0.28, fill = false } = {}) {
  return Pp([-w, 0, w, 0], [0, h, 0, -h], { fill });
}

/** .concretion(extra = list(), fill = FALSE). */
export function concretion({ extra = [], fill = false } = {}) {
  return [Ep({ cx: 0, cy: 0, a: 0.42, b: 0.24, fill }), ...extra];
}

/** .boring(extra = list()). */
export function boring({ extra = [] } = {}) {
  return [Seg(-0.25, 0.4, 0.25, 0.4), uBurrow({ w: 0.26, top: 0.4, bot: -0.38 }), ...extra];
}

/** .ripple_foreset(x, y0, y1, w): concave-up foreset rising to the right. */
export function rippleForeset(x, y0, y1, w) {
  const t = seqLo(0, 1, 10);
  return Lp(t.map((v) => x + w * v), t.map((v) => y0 + (y1 - y0) * Math.pow(v, 2.2)));
}

// Symbol definitions ####

// positional shorthands for the definitions below (undefined = R default)
const C = (cx, cy, r, fill, n) => Cp({ cx, cy, r, fill, n });
const E = (cx, cy, a, b, rot, fill) => Ep({ cx, cy, a, b, rot, fill });
const A = (cx, cy, r, from, to, n) => Ap({ cx, cy, r, from, to, n });
const P = (x, y, fill) => Pp(x, y, { fill });
const T = (label, x, y, cex) => Tp(label, { x, y, cex });
const S = Seg;
const L = Lp;
const SL = (x0, x1, y, amp, nper, phase) => sineLine(x0, x1, y, amp, nper, { phase });
const MV = (s, dx, dy, f) => mv(s, { dx, dy, f });
const AR = (y0, y1, x, head, half) => arrow({ y0, y1, x, head, half });
const RF = rippleForeset;
const UB = (w, top, bot) => uBurrow({ w, top, bot });

let SYM_DEFS = null;

/** .symbol_defs(): named object of all symbols (cached). */
export function symbolDefs() {
  if (SYM_DEFS !== null) { return SYM_DEFS; }
  const s = {};

  // Column I: outcrop data
  s.key_bed = [P([-0.35, 0.1, 0.4, 0.1, -0.35], [-0.2, -0.2, 0, 0.2, 0.2], true)];
  s.tectonic_disturbance = [L([0, 0.12, -0.12, 0.12, -0.12, 0.12, -0.12, 0], seqLo(0.5, -0.5, 8))];
  s.sample = [S(-0.4, 0, 0.4, 0), C(0, 0, 0.08, true)];

  // Column III2: grains and additional symbols
  s.shell_bed = [
    A(-0.22, -0.1, 0.2, 0, PI), A(0.22, -0.1, 0.2, 0, PI),
    A(-0.47, -0.1, 0.05, PI, 2 * PI, 6), A(0.47, -0.1, 0.05, PI, 2 * PI, 6)
  ];
  const oy = [A(-0.22, -0.12, 0.2, 0, PI), A(0.22, -0.12, 0.2, 0, PI)];
  for (const cx of [-0.22, 0.22]) {
    for (const a of seqLo(0.2, PI - 0.2, 5)) {
      oy.push(S(cx + 0.2 * Math.cos(a), -0.12 + 0.2 * Math.sin(a),
        cx + 0.29 * Math.cos(a + 0.15), -0.12 + 0.29 * Math.sin(a + 0.15)));
    }
  }
  s.oyster_bed = oy;
  s.skeletal_grains = fossil();
  s.rock_fragments = [C(0, 0, 0.3), S(-0.21, -0.21, 0.21, 0.21), S(-0.21, 0.21, 0.21, -0.21)];
  s.shale_flakes = [E(0, 0, 0.36, 0.09, undefined, true)];
  s.carbonate_clasts = [P([-0.2, 0.2, 0.2, -0.2], [-0.2, -0.2, 0.2, 0.2])];
  s.ooids = [C(0, 0, 0.32), C(0, 0, 0.08, true)];
  s.pisoids = [C(0, 0, 0.34), C(0, 0, 0.28), C(0, 0, 0.15, true)];
  s.peloids = [S(-0.35, 0, 0.35, 0), S(0, -0.35, 0, 0.35),
    S(-0.25, -0.25, 0.25, 0.25), S(-0.25, 0.25, 0.25, -0.25)];
  s.oncoids = [C(0, 0, 0.38), C(0, 0, 0.27, true)];
  s.dolomite_rhombs = [diamond({ w: 0.38, h: 0.27, fill: true })];
  s.dedolomite_replacement = [diamond({ w: 0.4, h: 0.3 }), diamond({ w: 0.24, h: 0.17, fill: true })];
  s.dedolomite_pores = [diamond({ w: 0.4, h: 0.3 })];
  s.bipyramidal_quartz = [P([0, 0.17, 0.17, 0, -0.17, -0.17], [0.42, 0.2, -0.2, -0.42, -0.2, 0.2])];
  s.feldspar = [P([-0.4, 0.2, 0.4, -0.2], [-0.2, -0.2, 0.2, 0.2])];

  // Column IV: internal bedding structures
  s.even_bedding = [S(-0.5, -0.3, 0.5, -0.3), S(-0.5, 0, 0.5, 0), S(-0.5, 0.3, 0.5, 0.3)];
  s.xbed_low_angle = [S(-0.5, -0.3, 0.5, -0.3), S(-0.5, 0.3, 0.5, 0.3),
    S(-0.5, -0.05, 0.3, -0.3), S(-0.5, 0.12, 0.5, -0.12), S(-0.5, 0.3, 0.5, 0.06)];
  s.xbed_tabular = [S(-0.5, -0.3, 0.5, -0.3), S(-0.5, 0.3, 0.5, 0.3),
    S(-0.45, -0.3, -0.2, 0.3), S(-0.15, -0.3, 0.1, 0.3), S(0.15, -0.3, 0.4, 0.3)];
  s.xbed_trough = [S(-0.5, 0.3, 0.5, 0.3),
    A(-0.05, 0.45, 0.55, 1.18 * PI, 1.82 * PI, 24), A(0.05, 0.42, 0.42, 1.12 * PI, 1.88 * PI, 20),
    A(0.15, 0.4, 0.28, 1.05 * PI, 1.95 * PI, 16)];
  s.mega_herringbone = [S(-0.5, -0.35, 0.5, -0.35), S(-0.5, 0, 0.5, 0), S(-0.5, 0.35, 0.5, 0.35),
    S(-0.35, -0.35, -0.2, 0), S(-0.05, -0.35, 0.1, 0), S(0.25, -0.35, 0.4, 0),
    S(-0.2, 0, -0.35, 0.35), S(0.1, 0, -0.05, 0.35), S(0.4, 0, 0.25, 0.35)];
  s.ripples_on_foresets = [S(-0.5, -0.3, 0.5, -0.3), S(-0.5, 0.3, 0.5, 0.3),
    S(-0.4, -0.3, -0.15, 0.3), S(0.05, -0.3, 0.3, 0.3),
    S(-0.32, -0.1, -0.2, -0.05), S(-0.25, 0.08, -0.13, 0.13),
    S(0.13, -0.1, 0.25, -0.05), S(0.2, 0.08, 0.32, 0.13)];
  s.backflow_ripples = [S(-0.5, -0.3, 0.5, -0.3), S(-0.5, 0.3, 0.5, 0.3),
    S(-0.35, -0.3, -0.1, 0.3), S(0.1, -0.3, 0.35, 0.3),
    L([-0.1, -0.15, -0.2, -0.25], [-0.3, -0.22, -0.3, -0.22]),
    L([0.35, 0.3, 0.25, 0.2], [-0.3, -0.22, -0.3, -0.22])];
  s.reactivation_surfaces = [S(-0.5, -0.3, 0.5, -0.3), S(-0.5, 0.3, 0.5, 0.3),
    S(-0.45, -0.3, -0.2, 0.3), S(-0.1, -0.3, 0.15, 0.3), S(0.2, -0.3, 0.45, 0.3),
    A(-0.05, 0.4, 0.62, 1.38 * PI, 1.6 * PI, 12)];
  s.undulous_bedding = [SL(-0.5, 0.5, -0.25, 0.07, 1.5), SL(-0.5, 0.5, 0.05, 0.07, 1.5),
    SL(-0.5, 0.5, 0.35, 0.07, 1.5)];
  const nod = [SL(-0.5, 0.5, -0.3, 0.04, 2), SL(-0.5, 0.5, 0.3, 0.04, 2)];
  for (const cx of [-0.3, 0.05, 0.38]) {
    nod.push(E(cx, 0, 0.13, 0.11));
  }
  s.nodular_bedding = nod;
  s.stylolite_flaser = [SL(-0.5, 0.5, -0.12, 0.13, 1.5), SL(-0.5, 0.5, 0.12, 0.13, 1.5, PI),
    SL(-0.5, 0.5, -0.38, 0.06, 2), SL(-0.5, 0.5, 0.38, 0.06, 2)];
  s.even_lamination = [];
  for (let k = 1; k <= 6; k++) {
    s.even_lamination[k - 1] = S(-0.5, -0.4 + (k - 1) * 0.16, 0.5, -0.4 + (k - 1) * 0.16);
  }
  s.wavy_lamination = [];
  for (let k = 1; k <= 4; k++) {
    s.wavy_lamination[k - 1] = SL(-0.5, 0.5, -0.33 + (k - 1) * 0.22, 0.05, 3);
  }
  s.ripple_lamination = [S(-0.45, -0.25, 0.45, -0.25),
    RF(-0.28, -0.25, 0.25, 0.25), RF(0.12, -0.25, 0.25, 0.25)];
  const cr = [];
  for (let k = 0; k <= 2; k++) {
    const yb = -0.42 + 0.3 * k;
    const xb = -0.45 + 0.17 * k;
    cr.push(S(xb - 0.05, yb, xb + 0.5, yb + 0.12));
    cr.push(RF(xb, yb + 0.01, yb + 0.24, 0.17));
    cr.push(RF(xb + 0.17, yb + 0.05, yb + 0.26, 0.17));
  }
  s.climbing_ripples = cr;
  s.herringbone_lamination = [S(-0.45, 0, 0.45, 0),
    L([-0.05, -0.3, -0.05], [0.25, 0, -0.25]), L([0.3, 0.05, 0.3], [0.25, 0, -0.25])];
  s.fissile_shale = [S(-0.45, 0.15, -0.1, 0.15), S(-0.275, 0.15, -0.275, -0.15),
    S(0.1, 0.15, 0.45, 0.15), S(0.275, 0.15, 0.275, -0.15)];
  s.laminated_clay = s.even_lamination;
  const l1 = arc({ cx: -0.2, cy: -0.15, r: 0.25, from: 0, to: PI, n: 16 });
  const l2 = arc({ cx: 0.25, cy: 0.12, r: 0.2, from: 0, to: PI, n: 16 });
  s.linsen = [
    P(l1.x, l1.y.map((v) => -0.15 + 0.45 * (v + 0.15))),
    P(l2.x, l2.y.map((v) => 0.12 + 0.45 * (v - 0.12)))
  ];
  s.flaser = [A(-0.22, 0.25, 0.25, 1.15 * PI, 1.85 * PI, 14), A(0.22, 0.25, 0.25, 1.15 * PI, 1.85 * PI, 14),
    A(0, -0.05, 0.25, 1.15 * PI, 1.85 * PI, 14)];
  s.flaser_ripples = [A(-0.2, 0.32, 0.22, 1.15 * PI, 1.85 * PI, 14), A(0.22, 0.32, 0.22, 1.15 * PI, 1.85 * PI, 14),
    S(-0.4, -0.35, 0.1, -0.35), RF(-0.3, -0.35, -0.05, 0.12), RF(-0.1, -0.35, -0.05, 0.12)];
  s.discontinuous_bedding = [S(-0.5, 0.25, 0.05, 0.25), L([0.05, 0.12], [0.25, 0.18]),
    S(-0.2, -0.05, 0.45, -0.05), S(-0.5, -0.3, -0.05, -0.3), L([0.05, 0.45], [-0.3, -0.3])];
  s.contorted_bedding = [
    L([-0.45, -0.3, -0.15, -0.25, -0.1, 0.1, 0.0, 0.2, 0.4], [-0.35, -0.2, 0.05, 0.25, 0.4, 0.3, 0.05, -0.1, 0.05]),
    L([-0.45, -0.32, -0.25, -0.35, -0.2, 0.05, 0.12, 0.3, 0.45], [-0.15, -0.05, 0.1, 0.25, 0.48, 0.42, 0.2, 0.08, 0.2])];
  s.bioturbation_homogenized = [MV([UB(0.2, 0.35, -0.35)], -0.2, 0)[0],
    MV([UB(0.2, 0.25, -0.4)], 0.2, 0)[0]];
  s.stromatolite = [A(-0.25, -0.25, 0.25, 0, PI), A(0.25, -0.25, 0.25, 0, PI),
    A(-0.25, -0.25, 0.15, 0, PI), A(0.25, -0.25, 0.15, 0, PI), S(-0.5, -0.25, 0.5, -0.25)];
  s.birdseye = [P([-0.4, -0.2, 0.05, 0.3, 0.42, 0.2, -0.05, -0.28],
    [-0.05, 0.08, 0.1, 0.12, 0.05, -0.08, -0.1, -0.1])];
  s.turbidite = [S(-0.45, -0.3, 0.45, -0.3), T('Ta-e', 0, 0.1, 0.8)];

  // Column V: transport direction (pointing to the north; rotate with 'angle')
  s.channel_direction = [S(-0.07, -0.45, -0.07, 0.3), S(0.07, -0.45, 0.07, 0.3),
    L([-0.2, 0, 0.2], [0.22, 0.47, 0.22])];
  s.large_ripple_direction = AR(-0.45, 0.45, 0, 0.2);
  s.small_ripple_direction = AR(-0.3, 0.3, 0, 0.14, true);
  s.opposite_currents_equal = [...AR(-0.45, 0.45, -0.1, 0.16), ...rotSym(AR(-0.45, 0.45, -0.1, 0.16), PI)];
  s.opposite_one_predominant = [...AR(-0.45, 0.45, -0.1, 0.16), ...rotSym(AR(-0.45, 0.1, -0.1, 0.16), PI)];
  s.opposite_one_strongly = [...AR(-0.45, 0.45, -0.1, 0.16), ...rotSym(AR(-0.45, -0.15, -0.1, 0.14), PI)];
  s.wave_ripple_orientation = [...AR(-0.05, 0.45, 0, 0.15), ...rotSym(AR(-0.05, 0.45, 0, 0.15), PI)];
  s.interference_ripples = [...rotSym(s.wave_ripple_orientation, PI / 4), ...rotSym(s.wave_ripple_orientation, -PI / 4)];
  s.parting_lineation = [S(-0.07, -0.45, -0.07, 0.45), S(0.07, -0.45, 0.07, 0.45)];
  s.groove_cast = [S(0, -0.45, 0, 0.45), C(0, 0, 0.09)];
  s.sole_mark_direction = [...AR(-0.35, 0.45, 0, 0.16), C(0, -0.38, 0.08, true)];
  s.fossil_orientation = [S(0, -0.45, 0, 0.2), ...MV(fossil(), 0, 0.3, 0.45)];
  s.plant_orientation = [S(0, -0.45, 0, 0.05), ...leaf({ cx: 0, cy: 0.25, s: 0.8 })];

  // Column VI: sedimentary and diagenetic structures
  s.vertical_extent = [S(0, -0.45, 0, 0.45), S(-0.12, -0.45, 0.12, -0.45), S(-0.12, 0.45, 0.12, 0.45)];
  s.current_ripples = [
    L([-0.45, -0.05, 0.05, 0.45], [-0.1, 0.12, -0.1, 0.12]),
    S(-0.5, -0.1, 0.5, -0.1)
  ];
  s.wave_ripples = [S(-0.45, -0.1, -0.18, -0.1), L([-0.18, 0, 0.18], [-0.1, 0.18, -0.1]),
    S(0.18, -0.1, 0.45, -0.1), L([-0.12, 0, 0.12], [0.05, 0.3, 0.05])];
  s.mudcracks = [S(-0.45, 0.2, 0.45, 0.2), L([-0.15, 0, 0.15], [0.2, -0.3, 0.2])];
  const lc = arc({ cx: 0, cy: 0.0, r: 0.18, from: PI, to: 2 * PI, n: 14 });
  s.load_cast = [S(-0.45, 0.15, 0.45, 0.15),
    L([-0.18, ...lc.x, 0.18], [0.15, ...lc.y, 0.15])];
  s.ball_pillow = [S(-0.45, 0.25, 0.45, 0.25), E(0, -0.1, 0.2, 0.17)];
  s.sole_marking = [L([-0.45, -0.2, 0.0, 0.15, 0.45], [0.15, 0.15, -0.05, -0.2, -0.2])];
  s.channel_fill_sand = [A(0, 0.15, 0.35, 1.05 * PI, 1.95 * PI, 18), C(0, -0.02, 0.05, true)];
  s.channel_fill_mud = [A(0, 0.15, 0.35, 1.05 * PI, 1.95 * PI, 18)];
  s.lateral_fill = [A(0, 0.15, 0.35, 1.05 * PI, 1.95 * PI, 18), E(0.0, -0.02, 0.16, 0.07, 0.4)];
  s.convolute_lamination = [L(
    [-0.38, -0.2, -0.25, -0.15, 0.0, 0.15, 0.25, 0.2, 0.38],
    [-0.3, -0.3, -0.05, 0.22, 0.3, 0.22, -0.05, -0.3, -0.3]
  )];
  const sp = spiral({ r0: 0.04, r1: 0.24, turns: 1.6, n: 50 });
  s.slump = [L(sp.x.map((v) => v + 0.1), sp.y.map((v) => v + 0.05)),
    L([0.36, 0.3, 0.0, -0.3, -0.38], [0.05, -0.2, -0.3, -0.2, 0.1])];
  s.olistolith = [C(0, 0, 0.47), ...MV(s.slump, 0, 0, 0.8)];
  s.clastic_dyke = [S(-0.12, -0.45, -0.12, 0.45), L([-0.12, -0.21], [0.45, 0.3]),
    S(0.12, -0.45, 0.12, 0.45), L([0.12, 0.21], [0.45, 0.3])];
  s.concretion = concretion();
  s.concretion_carbonate = concretion({ extra: [S(0, -0.24, 0, 0.24)] });
  s.concretion_sandstone = concretion({ extra: [C(0, 0, 0.05, true)] });
  s.concretion_iron = concretion({ extra: [S(-0.2, -0.2, 0.05, 0.22), S(-0.05, -0.22, 0.2, 0.2)] });
  s.concretion_manganese = concretion({ extra: [S(-0.2, -0.2, 0.05, 0.22), S(-0.05, -0.22, 0.2, 0.2),
    S(-0.2, 0.2, 0.05, -0.22), S(-0.05, 0.22, 0.2, -0.2)] });
  s.concretion_silica = concretion({ fill: true });
  s.concretion_phosphate = concretion({ extra: [T('P', 0.47, 0.22, 0.7)] });
  const ray = [C(0, 0, 0.17)];
  for (const a of dropLast(seqLo(0, 2 * PI, 9))) {
    ray.push(S(0.24 * Math.cos(a), 0.24 * Math.sin(a), 0.42 * Math.cos(a), 0.42 * Math.sin(a)));
  }
  s.mottling = ray;
  s.birdseye_keystone = [...s.birdseye, C(0, 0.3, 0.05, true)];
  s.vugs = [L([-0.2, -0.1, 0.1, 0.2, 0.12, 0.2, 0.1, -0.1, -0.2, -0.12, -0.2],
    [0.2, 0.12, 0.12, 0.2, 0, -0.2, -0.12, -0.12, -0.2, 0, 0.2])];
  s.microstalactite = [L([-0.4, 0.4, 0.25, -0.25, -0.4], [0.3, 0.3, -0.3, -0.3, 0.3]),
    L([-0.22, -0.1, 0, 0.1, 0.22], [0.18, -0.15, 0.1, -0.15, 0.18])];
  const hb = arc({ cx: 0, cy: 0, r: 0.32, from: PI, to: 2 * PI, n: 16 });
  s.geopetal = [C(0, 0, 0.32), P(hb.x, hb.y, true)];
  const hb2 = arc({ cx: 0, cy: 0, r: 0.18, from: PI, to: 2 * PI, n: 12 });
  s.geopetal_intergranular = [C(0, 0, 0.18), P(hb2.x, hb2.y, true), C(-0.38, 0, 0.05, true), C(0.38, 0, 0.05, true)];
  s.stromatactis = [C(0, 0, 0.36), C(0, 0, 0.2), P(hb2.x.map((v) => v * 1.1), hb2.y.map((v) => v * 1.1), true),
    S(-0.5, 0, -0.36, 0), S(0.36, 0, 0.5, 0)];
  s.sheet_crack = [P([-0.3, 0.3, 0.3, -0.3], [-0.12, -0.12, 0.12, 0.12]),
    P([-0.3, 0.3, 0.3, -0.3], [-0.12, -0.12, 0, 0], true), S(-0.5, 0, -0.3, 0), S(0.3, 0, 0.5, 0)];
  s.stylolites = [L([-0.45, -0.3, -0.15, 0, 0.15, 0.3, 0.45], [-0.1, 0.12, -0.1, 0.12, -0.1, 0.12, -0.1])];

  // Trace fossils (Martinsson 1965) and borings
  const ep = arc({ cx: 0, cy: 0.05, r: 0.15, from: PI, to: 2 * PI, n: 10 });
  s.epichnia = [L([-0.45, -0.15, ...ep.x, 0.15, 0.45], [0.05, 0.05, ...ep.y, 0.05, 0.05])];
  s.exichnia = [UB(0.26, 0.4, -0.4), S(0, 0.3, 0, -0.1)];
  s.endichnia = [UB(0.26, 0.4, -0.4), C(-0.3, 0, 0.04, true), C(0.3, 0, 0.04, true)];
  s.spreite_burrow = [UB(0.26, 0.4, -0.4), S(-0.13, 0.1, 0.13, 0.1), S(-0.13, -0.1, 0.13, -0.1)];
  const hy = arc({ cx: 0, cy: -0.05, r: 0.15, from: PI, to: 0, n: 10 });
  s.hypichnia = [L([-0.45, -0.15, ...hy.x, 0.15, 0.45], [-0.05, -0.05, ...hy.y, -0.05, -0.05])];
  s.boring = boring();
  s.boring_sand_fill = boring({ extra: [C(0, -0.12, 0.05, true)] });
  s.boring_mud_fill = boring({ extra: [S(-0.07, -0.12, 0.07, -0.12)] });
  s.boring_carbonate_fill = boring({ extra: [S(0, -0.25, 0, 0.1)] });
  s.boring_dolomite_fill = boring({ extra: [S(-0.07, -0.25, 0.07, 0.1)] });
  s.inverted_boring = rotSym(boring(), PI);
  s.in_situ_infauna = boring({ extra: [S(-0.13, 0.05, 0.13, 0.05), C(0, -0.2, 0.08)] });

  // Column VII: bioturbation degree
  const burrow1 = (dx) => L(seqLo(0, 2 * PI, 20).map((v) => dx + 0.07 * Math.sin(v)), seqLo(-0.4, 0.4, 20));
  s.bioturbation_weak = [burrow1(0)];
  s.bioturbation_moderate = [burrow1(-0.1), burrow1(0.1)];
  s.bioturbation_strong = [burrow1(-0.22), burrow1(0), burrow1(0.22)];

  // Column VIII: fossil content (macro)
  s.fossils_abundant = fossil();
  s.fossils_sparse = [...MV(fossil(), 0, 0, 0.7), A(0.1, 0, 0.42, 0.75 * PI, 1.25 * PI, 8), A(-0.1, 0, 0.42, -0.25 * PI, 0.25 * PI, 8)];
  s.fossils_marine = [...MV(fossil(), -0.12, 0, 0.8), T('M', 0.32, -0.2, 0.7)];
  s.fossils_brackish = [...MV(fossil(), -0.12, 0, 0.8), T('B', 0.32, -0.2, 0.7)];
  s.fossils_freshwater = [...MV(fossil(), -0.12, 0, 0.8), T('F', 0.32, -0.2, 0.7)];
  const alg = [S(-0.35, -0.42, 0.2, 0.42), S(-0.2, -0.42, 0.35, 0.42)];
  for (let k = 1; k <= 4; k++) {
    const t = k / 5;
    alg.push(S(-0.35 + 0.55 * t, -0.42 + 0.84 * t, -0.2 + 0.55 * t, -0.42 + 0.84 * t));
  }
  s.algae = alg;
  s.ammonite = [spiral({ r0: 0.03, r1: 0.4, turns: 2.3 })];
  s.belemnite = [L([0.45, -0.45, 0.45], [0.14, 0, -0.14])];
  s.brachiopod = [S(-0.3, 0.2, 0.3, 0.2), L([-0.3, -0.12, 0, 0.12, 0.3], [0.2, -0.05, -0.3, -0.05, 0.2])];
  s.brachiopod_doublet = [...s.brachiopod, S(-0.3, 0.3, 0.3, 0.3),
    S(-0.3, 0.3, -0.3, 0.2), S(0.3, 0.3, 0.3, 0.2)];
  s.bryozoan = [S(0, -0.45, 0, 0.0), S(0, 0, -0.3, 0.42), S(0, 0, 0.3, 0.42),
    S(0.04, -0.45, 0.04, 0.0)];
  s.coral = [C(0, 0, 0.36), S(-0.36, 0, 0.36, 0), S(0, -0.36, 0, 0.36)];
  s.crinoid = [star({ r1: 0.44, r2: 0.18, k: 5 })];
  const cu1 = arc({ cx: -0.2, cy: 0.1, r: 0.16, from: -0.2, to: 1.8 * PI, n: 20 });
  const cu2 = arc({ cx: 0.2, cy: 0.1, r: 0.16, from: PI + 0.2, to: -0.8 * PI, n: 20 });
  s.crustacean = [L([-0.05, ...cu1.x], [-0.25, ...cu1.y]), L([0.05, ...cu2.x], [-0.25, ...cu2.y])];
  s.echinoid_irregular = [C(0, 0, 0.34), S(-0.24, -0.24, 0.24, 0.24), S(-0.24, 0.24, 0.24, -0.24)];
  s.echinoid_regular = [C(0, 0, 0.36), star({ r1: 0.25, r2: 0.1, k: 5 })];
  s.echinoid_spine = [S(-0.35, -0.35, 0.35, -0.35),
    L([-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15], [-0.35, 0.1, 0.32, 0.4, 0.32, 0.1, -0.35])];
  s.fish = [E(0.08, 0, 0.3, 0.15), P([-0.22, -0.45, -0.45], [0, 0.15, -0.15])];
  s.fish_scales = [C(0, 0, 0.32), A(0, -0.1, 0.2, 0, PI, 12), S(-0.2, -0.1, 0.2, -0.1)];
  s.foraminifera = [C(-0.16, -0.12, 0.13), C(0.16, -0.12, 0.13), C(0, 0.16, 0.14)];
  s.macroforaminifera = [P([0, 0.13, 0.17, 0.13, 0, -0.13, -0.17, -0.13], [0.42, 0.25, 0, -0.25, -0.42, -0.25, 0, 0.25]),
    S(0, -0.3, 0, 0.3)];
  s.foram_benthic = [A(0, -0.2, 0.36, 0, PI, 18), S(-0.36, -0.2, 0.36, -0.2),
    A(0, -0.2, 0.2, 0, PI, 12), S(0, 0, 0, 0.16)];
  s.foram_pelagic = [C(0, 0, 0.42), C(-0.13, -0.09, 0.11), C(0.13, -0.09, 0.11), C(0, 0.14, 0.12)];
  s.gastropod = [P([0, 0.22, 0.24, 0.12, -0.12, -0.24, -0.22], [0.45, -0.05, -0.28, -0.42, -0.42, -0.28, -0.05]),
    S(-0.16, 0.12, 0.16, 0.03), S(-0.22, -0.08, 0.22, -0.18), E(0.06, -0.3, 0.08, 0.06)];
  const gr = [S(-0.3, -0.45, 0.3, 0.45)];
  for (let k = 1; k <= 5; k++) {
    const t = k / 6;
    const x0 = -0.3 + 0.6 * t;
    const y0 = -0.45 + 0.9 * t;
    gr.push(L([x0, x0 + 0.14, x0 + 0.06], [y0, y0 + 0.02, y0 + 0.12]));
  }
  s.graptolite = gr;
  s.bivalve = [A(0, -0.15, 0.38, 0, PI, 20)];
  const lower = arc({ cx: 0, cy: -0.15, r: 0.38, from: PI, to: 2 * PI, n: 20 });
  s.bivalve_doublet = [A(0, -0.15, 0.38, 0, PI, 20), L(lower.x, lower.y.map((v) => -0.15 + (v + 0.15) * 0.4))];
  // oy[c(1, 3:7)]
  s.oyster = [oy[0], oy[2], oy[3], oy[4], oy[5], oy[6]];
  s.oyster = MV(s.oyster, 0.22, 0.05, 1.6);
  s.oyster_doublet = [...s.oyster, S(-0.32, -0.14, 0.32, -0.14)];
  s.ostracod = [A(0, -0.12, 0.3, 0, PI, 16), S(-0.3, -0.12, 0.3, -0.12)];
  s.ostracod_doublet = [E(0, 0, 0.32, 0.2)];
  s.plant_remains = leaf({ cx: 0, cy: 0.12, s: 1 });
  const rad = [C(0, -0.08, 0.25)];
  for (const a of seqLo(0.15 * PI, 0.85 * PI, 5)) {
    rad.push(S(0.25 * Math.cos(a), -0.08 + 0.25 * Math.sin(a), 0.42 * Math.cos(a), -0.08 + 0.42 * Math.sin(a)));
  }
  s.radiolarian = rad;
  s.rudist = [L([-0.32, -0.33, -0.22, 0.0, 0.25, 0.4], [0.4, 0.05, -0.25, -0.38, -0.32, -0.15]),
    L([-0.08, -0.1, -0.02, 0.15, 0.4], [0.4, 0.1, -0.12, -0.2, -0.15]), S(-0.32, 0.4, -0.08, 0.4)];
  s.sponge_spicules = [S(0, 0, 0, -0.45), S(0, 0, 0.38, 0.25), S(0, 0, -0.38, 0.25)];
  s.stromatoporoid = [A(0, -0.3, 0.42, 0, PI, 22), S(-0.42, -0.3, 0.42, -0.3), T('S', 0, -0.05, 0.9)];
  const tb = arc({ cx: 0, cy: -0.15, r: 0.15, from: PI, to: 2 * PI, n: 12 });
  s.tintinnid = [L([-0.25, -0.15, -0.15, ...tb.x, 0.15, 0.15, 0.25], [0.4, 0.3, -0.15, ...tb.y, -0.15, 0.3, 0.4])];
  const tri = arc({ cx: 0, cy: -0.1, r: 0.38, from: 0, to: PI, n: 20 });
  s.trilobite = [P(tri.x, tri.y), A(0, -0.1, 0.15, 0, PI, 12), S(-0.38, -0.25, 0.38, -0.25),
    S(-0.38, -0.1, -0.38, -0.25), S(0.38, -0.1, 0.38, -0.25)];
  s.vertebrate = [S(-0.3, 0.04, 0.3, 0.04), S(-0.3, -0.04, 0.3, -0.04),
    C(-0.36, 0.06, 0.07), C(-0.36, -0.06, 0.07), C(0.36, 0.06, 0.07), C(0.36, -0.06, 0.07)];
  const wa = arc({ cx: -0.3, cy: 0, r: 0.1, from: PI / 2, to: 1.5 * PI, n: 8 });
  const wb = arc({ cx: 0.3, cy: 0, r: 0.1, from: -PI / 2, to: PI / 2, n: 8 });
  const wd = P([...wa.x, ...wb.x], [...wa.y, ...wb.y]);
  s.wood = [wd, S(-0.22, -0.1, -0.22, 0.1)];
  s.wood_silicified = [...MV(s.wood, -0.12, 0, 0.8), P([0.3, 0.46, 0.38], [-0.07, -0.07, 0.08])];

  // Column VIII: fossil content (micro)
  s.balanids = [L([-0.42, -0.25, -0.1, 0, 0.1, 0.25, 0.42], [-0.2, 0.15, -0.05, 0.2, -0.05, 0.15, -0.2]), S(-0.42, -0.2, 0.42, -0.2)];
  s.calcispheres = [A(0, 0, 0.3, PI / 2 + 0.4, 2.5 * PI - 0.4, 22)];
  s.charophytes = [C(0, 0, 0.34), S(-0.24, -0.1, 0.1, 0.32), S(-0.1, -0.32, 0.24, 0.1)];
  s.charophytes_thallus = [...s.charophytes, S(0, -0.34, 0, -0.48), S(0, 0.34, 0, 0.48)];
  s.coccoliths = [A(0, 0.05, 0.32, 0, PI, 16), S(-0.32, 0.05, 0.32, 0.05), S(0, 0.05, 0, -0.4)];
  s.conodonts = [L([-0.4, 0.4, 0, -0.4], [0.15, 0.15, -0.3, 0.15]),
    L([-0.3, -0.24, -0.15, -0.06, 0.03, 0.12, 0.21, 0.3], [0.15, 0.3, 0.15, 0.3, 0.15, 0.3, 0.15, 0.3])];
  s.encrusting_algae = [S(-0.45, -0.3, 0.45, -0.3), A(-0.2, -0.3, 0.2, 0, PI, 12), A(0.2, -0.3, 0.2, 0, PI, 12),
    A(-0.2, -0.3, 0.1, 0, PI, 8), A(0.2, -0.3, 0.1, 0, PI, 8)];
  s.coralline_algae = [S(0, -0.42, 0, 0.42), S(-0.25, 0.25, 0.25, 0.25), S(-0.25, 0.05, 0.25, 0.05),
    S(-0.25, -0.15, 0.25, -0.15), S(-0.25, -0.35, 0.25, -0.35)];
  s.melobesian_algae = [E(0, 0, 0.42, 0.2, PI / 4), S(-0.25, -0.25, 0.25, 0.25), S(-0.05, 0.1, 0.12, -0.08), S(-0.15, 0.0, 0.0, -0.15)];
  s.dasycladacean_algae = [S(0, -0.42, 0, 0.42), S(-0.25, 0.15, 0.25, 0.15), S(-0.25, -0.15, 0.25, -0.15),
    S(-0.25, 0.15, -0.25, 0.3), S(0.25, 0.15, 0.25, 0.3), S(-0.25, -0.15, -0.25, 0.0), S(0.25, -0.15, 0.25, 0.0)];
  s.endolithic_algae = [L([-0.35, -0.05, 0.1, 0.35], [-0.4, -0.05, 0.05, 0.4]), S(0.1, 0.05, 0.38, 0.05)];
  s.alveolinids = [C(0, 0, 0.36), S(-0.36, 0, 0.36, 0), S(0, -0.36, 0, 0.36), C(0, 0, 0.2)];
  s.orbitoids = [E(0, 0, 0.44, 0.1), E(0, 0, 0.14, 0.14)];
  s.nummulitids = [C(0, 0, 0.38), spiral({ r0: 0.04, r1: 0.3, turns: 2.2, n: 60 })];
  s.orbitolinids = [P([-0.32, 0.32, 0], [-0.3, -0.3, 0.4]), S(-0.21, -0.07, 0.21, -0.07), S(-0.1, 0.17, 0.1, 0.17)];
  s.soritids = [A(-0.25, 0, 0.42, -PI / 2, PI / 2, 16),
    A(-0.25, 0, 0.28, -PI / 2, PI / 2, 12), A(-0.25, 0, 0.14, -PI / 2, PI / 2, 8)];
  const ef = arc({ cx: 0, cy: -0.15, r: 0.32, from: 0, to: PI, n: 16 });
  s.encrusting_foram = [S(-0.45, -0.15, 0.45, -0.15), P(ef.x, ef.y.map((v) => -0.15 + 0.6 * (v + 0.15)), true)];
  s.lituolids = [P([-0.32, 0.32, 0], [0.32, 0.32, -0.4]), S(-0.2, 0.15, 0.2, 0.15), S(-0.1, -0.05, 0.1, -0.05)];
  s.miliolids = [E(0, 0, 0.26, 0.4), L([0.1, -0.08, 0.08, -0.1], [0.3, 0.1, -0.1, -0.3])];
  s.rotalids = [P([-0.4, 0.4, 0], [-0.3, -0.3, 0.38]), A(0, -0.3, 0.2, 0, PI, 10), S(0, -0.1, 0, 0.38)];

  SYM_DEFS = s;
  return s;
}

/** .symbol_groups(): symbol names by legend column. */
export function symbolGroups() {
  return {
    'Outcrop data': ['key_bed', 'tectonic_disturbance', 'sample'],
    'Additional grains': [
      'shell_bed', 'oyster_bed', 'skeletal_grains', 'rock_fragments', 'shale_flakes',
      'carbonate_clasts', 'ooids', 'pisoids', 'peloids', 'oncoids', 'dolomite_rhombs',
      'dedolomite_replacement', 'dedolomite_pores', 'bipyramidal_quartz', 'feldspar'
    ],
    'Internal bedding structures': [
      'even_bedding', 'xbed_low_angle', 'xbed_tabular', 'xbed_trough', 'mega_herringbone',
      'ripples_on_foresets', 'backflow_ripples', 'reactivation_surfaces', 'undulous_bedding',
      'nodular_bedding', 'stylolite_flaser', 'even_lamination', 'wavy_lamination',
      'ripple_lamination', 'climbing_ripples', 'herringbone_lamination', 'laminated_clay',
      'fissile_shale', 'linsen', 'flaser', 'flaser_ripples', 'discontinuous_bedding',
      'contorted_bedding', 'bioturbation_homogenized', 'stromatolite', 'birdseye', 'turbidite'
    ],
    'Transport direction': [
      'channel_direction', 'large_ripple_direction', 'small_ripple_direction',
      'opposite_currents_equal', 'opposite_one_predominant', 'opposite_one_strongly',
      'wave_ripple_orientation', 'interference_ripples', 'parting_lineation', 'groove_cast',
      'sole_mark_direction', 'fossil_orientation', 'plant_orientation'
    ],
    'Sedimentary / diagenetic structures': [
      'vertical_extent', 'current_ripples', 'wave_ripples', 'mudcracks', 'load_cast',
      'ball_pillow', 'sole_marking', 'channel_fill_sand', 'channel_fill_mud', 'lateral_fill',
      'convolute_lamination', 'slump', 'olistolith', 'clastic_dyke', 'concretion',
      'concretion_carbonate', 'concretion_sandstone', 'concretion_iron',
      'concretion_manganese', 'concretion_silica', 'concretion_phosphate', 'mottling',
      'birdseye_keystone', 'vugs', 'microstalactite', 'geopetal', 'geopetal_intergranular',
      'stromatactis', 'sheet_crack', 'stylolites'
    ],
    'Trace fossils': [
      'epichnia', 'exichnia', 'endichnia', 'spreite_burrow', 'hypichnia', 'boring',
      'boring_sand_fill', 'boring_mud_fill', 'boring_carbonate_fill', 'boring_dolomite_fill',
      'inverted_boring', 'in_situ_infauna'
    ],
    'Bioturbation': ['bioturbation_weak', 'bioturbation_moderate', 'bioturbation_strong'],
    'Macrofossils': [
      'fossils_abundant', 'fossils_sparse', 'fossils_marine', 'fossils_brackish',
      'fossils_freshwater', 'algae', 'ammonite', 'belemnite', 'brachiopod',
      'brachiopod_doublet', 'bryozoan', 'coral', 'crinoid', 'crustacean',
      'echinoid_irregular', 'echinoid_regular', 'echinoid_spine', 'fish', 'fish_scales',
      'macroforaminifera', 'gastropod', 'graptolite', 'bivalve', 'bivalve_doublet', 'oyster',
      'oyster_doublet', 'plant_remains', 'rudist', 'stromatoporoid', 'trilobite',
      'vertebrate', 'wood', 'wood_silicified'
    ],
    'Microfossils': [
      'balanids', 'calcispheres', 'charophytes', 'charophytes_thallus', 'coccoliths',
      'conodonts', 'foraminifera', 'foram_benthic', 'foram_pelagic', 'ostracod',
      'ostracod_doublet', 'radiolarian', 'sponge_spicules', 'tintinnid', 'encrusting_algae',
      'coralline_algae', 'melobesian_algae', 'dasycladacean_algae', 'endolithic_algae',
      'alveolinids', 'orbitoids', 'nummulitids', 'orbitolinids', 'soritids',
      'encrusting_foram', 'lituolids', 'miliolids', 'rotalids'
    ]
  };
}

/** .symbol_alias: alias -> symbol name. */
export const symbolAlias = {
  bivalves: 'bivalve', lamellibranch: 'bivalve', brachiopods: 'brachiopod',
  crinoids: 'crinoid', corals: 'coral', gastropods: 'gastropod',
  ammonites: 'ammonite', belemnites: 'belemnite', trilobites: 'trilobite',
  bryozoans: 'bryozoan', graptolites: 'graptolite', ostracods: 'ostracod',
  forams: 'foraminifera', plants: 'plant_remains', ooid: 'ooids',
  oncoid: 'oncoids', peloid: 'peloids', pellets: 'peloids', nodule: 'concretion',
  burrows: 'bioturbation_moderate', hcs: 'undulous_bedding',
  cross_bedding: 'xbed_tabular', trough_cross_bedding: 'xbed_trough',
  ripples: 'current_ripples', lamination: 'even_lamination',
  parallel_lamination: 'even_lamination', stylolite: 'stylolites',
  fenestrae: 'birdseye', slump_fold: 'slump'
};

/** .resolve_symbol(name): normalise names and apply the aliases (vectorised). */
export function resolveSymbol(name) {
  const one = (nm) => {
    if (isNA(nm)) { return null; }
    let v = String(nm).replace(/[ .()-]+/g, '_').toLowerCase();
    v = v.replace(/^_|_$/g, '');
    return Object.prototype.hasOwnProperty.call(symbolAlias, v) ? symbolAlias[v] : v;
  };
  return Array.isArray(name) ? name.map(one) : one(name);
}

// Exported functions ####

/** symbol_names(group = FALSE, aliases = FALSE). */
export function symbolNames({ group = false, aliases = false } = {}) {
  if (aliases) {
    return { ...symbolAlias };
  }
  if (group) {
    return symbolGroups();
  }
  return Object.keys(symbolDefs());
}

// rep_len(x, n)
function repLen(v, n) {
  const a = Array.isArray(v) ? v : [v];
  const out = new Array(n);
  for (let k = 0; k < n; k++) { out[k] = a.length ? a[k % a.length] : null; }
  return out;
}

/** log_symbol(name, x, y, size = 0.15, angle = 0, col = "black", lwd = 1, bg = NA). */
export function logSymbol(name, x, y, { size = 0.15, angle = 0, col = 'black', lwd = 1, bg = NaN } = {}) {
  const len = (v) => (Array.isArray(v) ? v.length : 1);
  const n = Math.max(len(name), len(x), len(y));
  name = resolveSymbol(repLen(name, n));
  x = repLen(x, n);
  y = repLen(y, n);
  size = repLen(size, n);
  angle = repLen(angle, n);
  col = repLen(col, n);
  lwd = repLen(lwd, n);
  bg = repLen(bg, n);
  const defs = symbolDefs();
  const unknown = [...new Set(name)].filter((v) => !Object.prototype.hasOwnProperty.call(defs, v));
  if (unknown.length > 0) {
    throw new Error('Unknown symbol(s): ' + unknown.map((v) => (v === null ? 'NA' : v)).join(', ') +
      '. See symbol_names().');
  }
  const upi = upiUser();
  const cin = par('cin')[1];
  for (let k = 0; k < n; k++) {
    if (isNA(x[k]) || isNA(y[k])) {
      continue;
    }
    const sym = defs[name[k]];
    const a = -angle[k] * PI / 180;
    for (const p of sym) {
      const ux = p.x.map((v, j) => x[k] + (v * Math.cos(a) - p.y[j] * Math.sin(a)) * size[k] * upi[0]);
      const uy = p.x.map((v, j) => y[k] + (v * Math.sin(a) + p.y[j] * Math.cos(a)) * size[k] * upi[1]);
      if (p.t === 'l') {
        lines(ux, uy, { col: col[k], lwd: lwd[k], lend: 1, ljoin: 1 });
      } else if (p.t === 'p') {
        if (p.fill === true) {
          polygon(ux, uy, { col: col[k], border: col[k], lwd: lwd[k] });
        } else {
          polygon(ux, uy, { col: bg[k], border: col[k], lwd: lwd[k] });
        }
      } else if (p.t === 't') {
        text(ux, uy, p.label, { cex: 0.6 * p.cex * size[k] / cin, col: col[k] });
      }
    }
  }
  return null;
}
