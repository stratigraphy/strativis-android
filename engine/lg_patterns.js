// lg_patterns.js: lithoglyph pattern_defs.R + patterns.R ####
//
// A pattern is an array of layers (tiles). A tile is a rectangle of w x h
// inches holding primitives: segments (rows [x0, y0, x1, y1]), small closed
// polygons ({x, y, fill}), points (column table {x, y, cex}) and text
// (column table {x, y, label, cex}). Tiles are repeated over the area to fill
// and clipped.

import { polygon, segments, points, text } from './rgfx.js';
import { sinR, cosR, tanR, lcg, pl2seg, ring2seg, circ, ell, pip, clipSegs, upiUser, recycle, seqOutR, colonR } from './lg_utils.js';

// Fragments ####

/** .frag(segs = NULL, polys = list(), pts = NULL, txt = NULL). */
export function frag({ segs = null, polys = [], pts = null, txt = null } = {}) {
  if (segs === null) {
    segs = [];
  }
  if (pts === null) {
    pts = { x: [], y: [], cex: [] };
  }
  if (txt === null) {
    txt = { x: [], y: [], label: [], cex: [] };
  }
  return { segs, polys, pts, txt };
}

/** .merge_frags(fl). */
export function mergeFrags(fl) {
  const segs = [];
  let polys = [];
  const pts = { x: [], y: [], cex: [] };
  const txt = { x: [], y: [], label: [], cex: [] };
  for (const f of fl) {
    for (const s of f.segs) { segs.push(s.slice()); }
    polys = polys.concat(f.polys);
    pts.x.push(...f.pts.x); pts.y.push(...f.pts.y); pts.cex.push(...f.pts.cex);
    txt.x.push(...f.txt.x); txt.y.push(...f.txt.y); txt.label.push(...f.txt.label); txt.cex.push(...f.txt.cex);
  }
  return { segs, polys, pts, txt };
}

/** .place(f, x = 0, y = 0, rot = 0): translate and rotate a fragment. */
export function place(f, { x = 0, y = 0, rot = 0 } = {}) {
  const cr = cosR(rot);
  const sr = sinR(rot);
  const trx = (px, py) => x + px * cr - py * sr;
  const tryy = (px, py) => y + px * sr + py * cr;
  let s = f.segs;
  if (s.length > 0) {
    s = s.map((r) => [trx(r[0], r[1]), tryy(r[0], r[1]), trx(r[2], r[3]), tryy(r[2], r[3])]);
  }
  const polys = f.polys.map((p) => {
    const q = Object.assign({}, p);
    q.x = p.x.map((v, k) => trx(v, p.y[k]));
    q.y = p.x.map((v, k) => tryy(v, p.y[k]));
    return q;
  });
  let pts = f.pts;
  if (pts.x.length > 0) {
    pts = { x: pts.x.map((v, k) => trx(v, f.pts.y[k])), y: pts.x.map((v, k) => tryy(v, f.pts.y[k])), cex: pts.cex.slice() };
  }
  let txt = f.txt;
  if (txt.x.length > 0) {
    txt = {
      x: txt.x.map((v, k) => trx(v, f.txt.y[k])), y: txt.x.map((v, k) => tryy(v, f.txt.y[k])),
      label: txt.label.slice(), cex: txt.cex.slice()
    };
  }
  return { segs: s, polys, pts, txt };
}

/** .tile(w, h, frags). */
export function tile(w, h, frags) {
  const f = mergeFrags(frags);
  f.w = w;
  f.h = h;
  return f;
}

// Elementary glyphs (inches, centred on 0, 0) ####

export function gDot({ cex = 0.22 } = {}) {
  return frag({ pts: { x: [0], y: [0], cex: [cex] } });
}
export function gHline(len) {
  return frag({ segs: [[-len / 2, 0, len / 2, 0]] });
}
export function gVline(len) {
  return frag({ segs: [[0, -len / 2, 0, len / 2]] });
}
export function gDash2({ len = 0.022, gap = 0.012 } = {}) {
  return frag({ segs: [
    [-gap / 2 - len, 0, -gap / 2, 0],
    [gap / 2, 0, gap / 2 + len, 0]
  ] });
}
export function gTri({ s = 0.04, fill = false } = {}) {
  const x = [-s / 2, s / 2, 0];
  const y = [-s * 0.38, -s * 0.38, s * 0.48];
  if (fill) {
    return frag({ polys: [{ x, y, fill: true }] });
  }
  return frag({ segs: ring2seg(x, y) });
}
export function gChevron({ s = 0.035 } = {}) {
  return frag({ segs: pl2seg([s / 2, -s / 2, s / 2], [s * 0.35, 0, -s * 0.35]) });
}
export function gX({ s = 0.03 } = {}) {
  return frag({ segs: [[-s / 2, -s / 2, s / 2, s / 2], [-s / 2, s / 2, s / 2, -s / 2]] });
}
export function gI({ s = 0.045 } = {}) {
  return frag({ segs: [
    [0, -s / 2, 0, s / 2],
    [-s / 4, s / 2, s / 4, s / 2],
    [-s / 4, -s / 2, s / 4, -s / 2]
  ] });
}
export function gCircle({ r = 0.012, fill = false, n = 12 } = {}) {
  const c1 = circ({ cx: 0, cy: 0, r, n });
  if (fill) {
    return frag({ polys: [{ x: c1.x, y: c1.y, fill: true }] });
  }
  return frag({ segs: ring2seg(c1.x, c1.y) });
}
export function gText(label, { cex = 0.45 } = {}) {
  return frag({ txt: { x: [0], y: [0], label: [label], cex: [cex] } });
}
export function gWave({ len = 0.06, amp = 0.008, n = 13 } = {}) {
  const x = seqOutR(-len / 2, len / 2, n);
  const y = x.map((v) => amp * sinR(2 * Math.PI * (v + len / 2) / (len / 2)));
  return frag({ segs: pl2seg(x, y) });
}

// Dunham texture glyphs
export function gGrainsupport({ s = 0.05 } = {}) {
  const c1 = circ({ cx: 0, cy: 0, r: s * 0.2, n: 12 });
  return frag({ segs: [
    [0, -s / 2, 0, -s * 0.2], [0, s * 0.2, 0, s / 2],
    ...ring2seg(c1.x, c1.y)
  ] });
}
export function gPackstone({ s = 0.05 } = {}) {
  return mergeFrags([frag({ segs: [[0, -s / 2, 0, s / 2]] }), gCircle({ r: s * 0.16, fill: true })]);
}
export function gMudsupport({ s = 0.05 } = {}) {
  return frag({ segs: [[-s * 0.12, -s / 2, -s * 0.12, s / 2], [s * 0.12, -s / 2, s * 0.12, s / 2]] });
}
export function gBinding({ s = 0.05 } = {}) {
  return frag({ segs: [
    [0, -s / 2, 0, s / 2],
    [-s * 0.3, s * 0.05, 0, -s * 0.3], [s * 0.3, s * 0.05, 0, -s * 0.3]
  ] });
}

// Base tiles ####

/** .brick(w = 0.18, h = 0.08, slant = 0). */
export function brick({ w = 0.18, h = 0.08, slant = 0 } = {}) {
  const dx = h * slant;
  return frag({ segs: [
    [0, 0, w, 0], [0, h, w, h],
    [0, 0, dx, h], [w / 2, h, w / 2 + dx, 2 * h]
  ] });
}

/** .brick_cells(): brick cell centres for a w x 2h brick tile. */
export function brickCells({ w = 0.18, h = 0.08, slant = 0 } = {}) {
  const dx = h * slant;
  return { x: [w / 2 + dx / 2, dx / 2 + w], y: [h / 2, 1.5 * h] };
}

/** .brick_tile(glyph = NULL, w = 0.18, h = 0.08, slant = 0, rot = 0, dx_glyph = 0). */
export function brickTile({ glyph = null, w = 0.18, h = 0.08, slant = 0, rot = 0, dxGlyph = 0 } = {}) {
  const fr = [brick({ w, h, slant })];
  if (glyph !== null) {
    const cc = brickCells({ w, h, slant });
    for (let k = 0; k < 2; k++) {
      fr[k + 1] = place(glyph, { x: cc.x[k] + dxGlyph, y: cc.y[k], rot });
    }
  }
  return tile(w, 2 * h, fr);
}

/** .stagger(glyph, w, h, jitter = 0, seed = 1, rot = 0): two glyphs per tile. */
export function stagger(glyph, w, h, { jitter = 0, seed = 1, rot = 0 } = {}) {
  const u = lcg(4, { seed });
  return tile(w, h, [
    place(glyph, { x: w * 0.25 + jitter * (u[0] - 0.5), y: h * 0.25 + jitter * (u[1] - 0.5), rot }),
    place(glyph, { x: w * 0.75 + jitter * (u[2] - 0.5), y: h * 0.75 + jitter * (u[3] - 0.5), rot })
  ]);
}

/** .hlines(h = 0.035, w = 0.2): horizontal lines every h inches. */
export function hlines({ h = 0.035, w = 0.2 } = {}) {
  return tile(w, h, [frag({ segs: [[0, 0, w, 0]] })]);
}

/** .vlines(w = 0.035, h = 0.2). */
export function vlines({ w = 0.035, h = 0.2 } = {}) {
  return tile(w, h, [frag({ segs: [[0, 0, 0, h]] })]);
}

/** .dashes(len = 0.05, gap = 0.035, h = 0.045): rows of dashes, staggered. */
export function dashes({ len = 0.05, gap = 0.035, h = 0.045 } = {}) {
  const w = len + gap;
  return tile(w, 2 * h, [frag({ segs: [
    [0, 0, len, 0],
    [w / 2, h, w / 2 + len, h]
  ] })]);
}

/** .waves(w = 0.1, h = 0.05, amp = 0.01). */
export function waves({ w = 0.1, h = 0.05, amp = 0.01 } = {}) {
  const x = seqOutR(0, w, 17);
  const y = x.map((v) => amp * sinR(2 * Math.PI * v / (w / 2)));
  return tile(w, h, [frag({ segs: pl2seg(x, y) })]);
}

/** .dots(w = 0.16, h = 0.16, n = 9, cex = 0.22, seed = 3): random-looking dots. */
export function dots({ w = 0.16, h = 0.16, n = 9, cex = 0.22, seed = 3 } = {}) {
  const u = lcg(2 * n, { seed });
  const k = Math.ceil(Math.sqrt(n));
  const gx = [], gy = [];
  for (let i = 1; i <= n; i++) {
    gx.push(((i - 1) % k + u[i - 1] * 0.8 + 0.1) / k);
    gy.push((Math.floor((i - 1) / k) + u[n + i - 1] * 0.8 + 0.1) / k);
  }
  return tile(w, h, [frag({ pts: { x: gx.map((v) => v * w), y: gy.map((v) => v * h), cex: gx.map(() => cex) } })]);
}

/** .clasts(w, h, nx, ny, size, angular = FALSE, seed = 7): pebbles or angular clasts. */
export function clasts(w, h, nx, ny, size, { angular = false, seed = 7 } = {}) {
  const n = nx * ny;
  const u = lcg(5 * n, { seed });
  const fr = [];
  for (let k = 1; k <= n; k++) {
    const ix = (k - 1) % nx;
    const iy = Math.floor((k - 1) / nx);
    const cx = (ix + 0.5 + (u[k - 1] - 0.5) * 0.35) * w / nx;
    const cy = (iy + 0.5 + (u[n + k - 1] - 0.5) * 0.35) * h / ny;
    const s = size * (0.75 + 0.5 * u[2 * n + k - 1]);
    const rot = u[3 * n + k - 1] * Math.PI;
    if (angular) {
      const nv = 3 + Math.floor(u[4 * n + k - 1] * 2.99);
      const a = lcg(nv, { seed: seed + k }).map((v) => v * 2 * Math.PI).sort((p, q) => p - q);
      const rr = lcg(nv, { seed: seed + 100 + k }).map((v) => s * (0.35 + 0.25 * v));
      const px = rr.map((v, j) => v * cosR(a[j] + rot));
      const py = rr.map((v, j) => v * sinR(a[j] + rot) * 0.8);
      fr[k - 1] = frag({ segs: ring2seg(px.map((v) => cx + v), py.map((v) => cy + v)) });
    } else {
      const e = ell({ cx, cy, a: s / 2, b: s * (0.28 + 0.1 * u[4 * n + k - 1]), rot: rot * 0.4, n: 16 });
      fr[k - 1] = frag({ segs: ring2seg(e.x, e.y) });
    }
  }
  return tile(w, h, fr);
}

/** .lines_with(glyph, h = 0.05, w = 0.12): glyphs staggered in the gaps of horizontal lines. */
export function linesWith(glyph, { h = 0.05, w = 0.12 } = {}) {
  return tile(w, 2 * h, [
    frag({ segs: [[0, 0, w, 0], [0, h, w, h]] }),
    place(glyph, { x: w * 0.25, y: h / 2 }),
    place(glyph, { x: w * 0.75, y: 1.5 * h })
  ]);
}

// All pattern definitions ####

let PATTERN_DEFS = null;

/** .pattern_defs(): {name: [layers]} (cached). */
export function patternDefs() {
  if (PATTERN_DEFS !== null) {
    return PATTERN_DEFS;
  }
  const p = {};
  const sl = tanR(Math.PI / 6);
  const rotDolo = -Math.PI / 7;

  // Lutites
  p.clay = [hlines({ h: 0.035 })];
  p.silt = [dashes({ len: 0.05, gap: 0.035, h: 0.04 })];
  p.mudstone = [vlines({ w: 0.035 })];
  p.shale = [hlines({ h: 0.035 }), tile(0.24, 0.07, [frag({ segs: [
    [0.03, 0.0175, 0.09, 0.0175], [0.15, 0.0525, 0.21, 0.0525]
  ] })])];

  // Arenites
  p.sandstone = [dots({ w: 0.16, h: 0.16, n: 9, cex: 0.22 })];
  p.quartzite = [dots({ w: 0.16, h: 0.16, n: 9, cex: 0.22 }), stagger(frag({ segs: [
    [0, -0.012, 0, 0.012], [-0.008, 0.012, 0.008, 0.012]
  ] }), 0.16, 0.1)];

  // Rudites
  p.conglomerate = [clasts(0.3, 0.2, 4, 3, 0.055)];
  p.coarse_conglomerate = [clasts(0.36, 0.24, 3, 2, 0.11, { seed: 11 })];
  p.breccia = [clasts(0.3, 0.2, 4, 3, 0.07, { angular: true })];
  p.coarse_breccia = [clasts(0.36, 0.24, 3, 2, 0.11, { angular: true, seed: 13 })];
  const e1 = ell({ cx: 0.1, cy: 0.045, a: 0.03, b: 0.016 });
  const e2 = ell({ cx: 0.2, cy: 0.135, a: 0.03, b: 0.016 });
  p.lime_conglomerate = [brickTile({ glyph: null, w: 0.2, h: 0.09 }), tile(0.2, 0.18, [
    frag({ segs: ring2seg(e1.x, e1.y) }),
    frag({ segs: ring2seg(e2.x, e2.y) })
  ])];
  p.carbonate_breccia = [
    tile(0.2, 0.18, [frag({ segs: [[0, 0, 0.2, 0], [0, 0.09, 0.2, 0.09]] })]),
    stagger(frag({ segs: pl2seg([-0.025, 0.01, -0.01, 0.025], [0.03, 0.005, -0.005, -0.03]) }),
      0.2, 0.18)
  ];

  // Carbonates
  p.limestone = [brickTile()];
  p.chalk = [brickTile({ glyph: gI() })];
  p.dolomitic_limestone = [brickTile({ glyph: frag({ segs: [
    [-0.005, -0.025, 0.02, 0.0], [-0.005, -0.025, 0.025, -0.025]
  ] }) })];
  p.calcareous_dolostone = [brickTile({
    glyph: frag({ segs: [[-0.015, -0.025, 0.02, 0.01]] }), slant: sl
  })];
  p.dolostone = [brickTile({ glyph: null, slant: sl })];
  p.clayey_limestone = [brickTile({ glyph: gHline(0.05) })];
  p.silty_limestone = [brickTile({ glyph: gDash2() })];
  p.sandy_limestone = [brickTile({ glyph: mergeFrags([
    place(gDot(), { x: -0.02, y: 0 }), place(gDot(), { x: 0.02, y: 0 })
  ]) })];
  p.siliceous_limestone = [brickTile({ glyph: gTri({ s: 0.035 }) })];

  // Carbonate depositional textures (Dunham 1962)
  p.grainstone = [brickTile({ glyph: gGrainsupport() })];
  p.packstone = [brickTile({ glyph: gPackstone() })];
  p.wackestone = [brickTile({ glyph: gMudsupport() })];
  p.lime_mudstone = [brickTile({ glyph: gMudsupport() })];
  p.boundstone = [brickTile({ glyph: gBinding() })];
  p.crystalline_limestone = [brickTile({ glyph: gX() })];
  p.dolo_grainstone = [brickTile({ glyph: gGrainsupport(), slant: sl, rot: rotDolo })];
  p.dolo_packstone = [brickTile({ glyph: gPackstone(), slant: sl, rot: rotDolo })];
  p.dolo_wackestone = [brickTile({ glyph: gMudsupport(), slant: sl, rot: rotDolo })];
  p.dolo_boundstone = [brickTile({ glyph: gBinding(), slant: sl, rot: rotDolo })];
  p.crystalline_dolostone = [brickTile({ glyph: gX(), slant: sl })];

  // Mixed siliciclastic lithotypes
  p.marl = [waves({ w: 0.1, h: 0.05, amp: 0.009 })];
  const xs = seqOutR(0, 0.1, 17);
  p.calcareous_siltstone = [tile(0.1, 0.1, [
    frag({ segs: pl2seg(xs, xs.map((v) => 0.009 * sinR(2 * Math.PI * v / 0.05))) }),
    frag({ segs: [[0.005, 0.05, 0.04, 0.05], [0.06, 0.05, 0.095, 0.05]] })
  ])];
  p.sandy_clay = [linesWith(mergeFrags([
    place(gDot(), { x: -0.012, y: 0 }), place(gDot(), { x: 0.012, y: 0 })
  ]), { h: 0.045, w: 0.12 })];
  p.siliceous_clay = [linesWith(gTri({ s: 0.03 }), { h: 0.045, w: 0.12 })];
  p.sandy_siltstone = [dashes({ len: 0.05, gap: 0.035, h: 0.045 }), tile(0.17, 0.18, [
    frag({ pts: { x: [0.04, 0.125], y: [0.045, 0.135], cex: [0.22, 0.22] } })
  ])];
  p.siliceous_siltstone = [dashes({ len: 0.05, gap: 0.035, h: 0.045 }), stagger(gTri({ s: 0.028 }), 0.17, 0.18)];
  p.calcareous_sandstone = [dots({ w: 0.16, h: 0.16, n: 9, cex: 0.22 }), stagger(gVline(0.035), 0.12, 0.1)];
  p.clayey_sandstone = [dots({ w: 0.16, h: 0.16, n: 9, cex: 0.22 }), stagger(gHline(0.05), 0.14, 0.1)];
  p.silty_sandstone = [dots({ w: 0.16, h: 0.16, n: 9, cex: 0.22 }), stagger(gDash2(), 0.14, 0.1)];
  p.siliceous_sandstone = [dots({ w: 0.16, h: 0.16, n: 7, cex: 0.22 }), stagger(gTri({ s: 0.03 }), 0.14, 0.12)];
  p.calcareous_conglomerate = [clasts(0.36, 0.24, 4, 3, 0.06),
    stagger(gVline(0.04), 0.12, 0.16, { rot: 0 })];
  p.pebbly_mudstone = [clasts(0.36, 0.24, 3, 2, 0.06, { seed: 5 }), dashes({ len: 0.05, gap: 0.04, h: 0.045 })];
  p.sandy_conglomerate = [clasts(0.36, 0.24, 4, 3, 0.06), dots({ w: 0.16, h: 0.16, n: 5, cex: 0.2, seed: 9 })];
  p.calcareous_breccia = [clasts(0.36, 0.24, 4, 3, 0.07, { angular: true }),
    stagger(gVline(0.04), 0.12, 0.16)];
  p.clayey_breccia = [clasts(0.36, 0.24, 3, 2, 0.06, { angular: true, seed: 5 }), dashes({ len: 0.05, gap: 0.04, h: 0.045 })];
  p.sandy_breccia = [clasts(0.36, 0.24, 4, 3, 0.07, { angular: true }), dots({ w: 0.16, h: 0.16, n: 5, cex: 0.2, seed: 9 })];

  // Chemical sediments
  p.chert = [stagger(gTri({ s: 0.04 }), 0.1, 0.09)];
  p.sulfate = [stagger(gChevron(), 0.1, 0.08)];
  p.gypsum = [stagger(gChevron(), 0.1, 0.08), tile(0.4, 0.16, [
    place(gText('G', { cex: 0.4 }), { x: 0.2, y: 0.0 })
  ])];
  p.anhydrite = [stagger(gChevron(), 0.1, 0.08), tile(0.4, 0.16, [
    place(gText('A', { cex: 0.4 }), { x: 0.2, y: 0.0 })
  ])];
  p.halite = [tile(0.05, 0.05, [frag({ segs: [
    [0, 0, 0.05, 0.05], [0, 0.05, 0.05, 0]
  ] })])];
  p.kmg_salt = [tile(0.04, 0.04, [frag({ segs: [
    [0, 0, 0.04, 0], [0, 0, 0, 0.04]
  ] })])];
  p.phosphate = [stagger(gText('P', { cex: 0.42 }), 0.11, 0.1)];

  // Organic sediments
  p.coal = [tile(1, 1, [frag()])];
  p.peat = [tile(1, 1, [frag()]), dashes({ len: 0.04, gap: 0.05, h: 0.04 })];
  p.bitumen = [stagger(mergeFrags([gHline(0.05), gCircle({ r: 0.009, fill: true })]), 0.12, 0.09)];
  p.asphalt = [stagger(gTri({ s: 0.03, fill: true }), 0.1, 0.09)];

  // Volcanic sediments
  const tick2 = frag({ segs: [[-0.007, -0.014, -0.007, 0.014], [0.007, -0.014, 0.007, 0.014]] });
  p.tuff = [stagger(tick2, 0.09, 0.08)];
  p.pyroclastic_breccia = [stagger(tick2, 0.12, 0.1),
    clasts(0.36, 0.24, 3, 2, 0.08, { angular: true, seed: 17 })];

  // Exposure
  p.covered = [tile(1, 1, [frag()])];
  p.none = [tile(1, 1, [frag()])];

  PATTERN_DEFS = p;
  return p;
}

/** .pattern_bg(name): fill colour drawn under the pattern (null = NA). */
export function patternBg(name) {
  if (name === 'coal') {
    return 'grey25';
  }
  if (name === 'peat') {
    return 'grey45';
  }
  return null;
}

/** .pattern_alias: common names mapped on pattern identifiers. */
export const PATTERN_ALIAS = {
  shale_fissile: 'shale', claystone: 'clay', mud: 'mudstone',
  siltstone: 'silt', sand: 'sandstone', sst: 'sandstone',
  orthoquartzite: 'quartzite', cg: 'conglomerate', br: 'breccia',
  lst: 'limestone', dol: 'dolostone', dolomite: 'dolostone',
  mudstone_carbonate: 'lime_mudstone', wacke: 'wackestone',
  pack: 'packstone', grain: 'grainstone', bound: 'boundstone',
  rock_salt: 'halite', salt: 'halite', lignite: 'coal',
  volcanic_tuff: 'tuff', argillaceous_limestone: 'clayey_limestone',
  marlstone: 'marl', calcareous_clay: 'marl', silty_clay: 'mudstone',
  clayey_silt: 'mudstone', pebbly_mud: 'pebbly_mudstone',
  no_exposure: 'covered', gap: 'covered', blank: 'none'
};

function resolveOne(name) {
  if (name === null || name === undefined || (typeof name === 'number' && Number.isNaN(name))) {
    return null;
  }
  let s = String(name).replace(/[ .()-]+/g, '_').toLowerCase();
  s = s.replace(/^_|_$/g, '');
  if (Object.hasOwn(PATTERN_ALIAS, s)) {
    s = PATTERN_ALIAS[s];
  }
  return s;
}

/** .resolve_pattern(name): a name or an array of names (NA stays null). */
export function resolvePattern(name) {
  if (Array.isArray(name)) {
    return name.map(resolveOne);
  }
  return resolveOne(name);
}

// Exported functions ####

/** pattern_names(aliases = FALSE): pattern names, or {alias: pattern}. */
export function patternNames({ aliases = false } = {}) {
  if (aliases) {
    return Object.assign({}, PATTERN_ALIAS);
  }
  return Object.keys(patternDefs());
}

const isNa = (v) => v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v)) || v === 'NA';

/**
 * fill_pattern(x, y, pattern, scale = 1, col = "black", lwd = 0.5, bg = NULL,
 * border = NA, border.lwd = 1). bg: undefined or null = R NULL (default of
 * the pattern), NaN / 'NA' = R NA (no background). Returns the number of
 * primitives drawn.
 */
export function fillPattern(x, y, pattern, { scale = 1, col = 'black', lwd = 0.5, bg = null, border = NaN, borderLwd = 1 } = {}) {
  const xx = [], yy = [];
  for (let k = 0; k < x.length; k++) {
    if (!isNa(x[k]) && !isNa(y[k])) { xx.push(x[k]); yy.push(y[k]); }
  }
  x = xx;
  y = yy;
  if (x.length < 3) {
    return 0;
  }
  const pname = resolvePattern(pattern);
  const defs = patternDefs();
  if (pname === null || !Object.hasOwn(defs, pname)) {
    throw new Error("Unknown pattern '" + (isNa(pattern) ? 'NA' : pattern) + "'. See pattern_names().");
  }
  if (bg === null || bg === undefined) {
    bg = patternBg(pname);
  }
  if (!isNa(bg)) {
    polygon(x, y, { col: bg, border: null });
  }
  const u = upiUser();
  const px = x.map((v) => v / u[0]);
  const py = y.map((v) => v / u[1]);
  let nprim = 0;
  const layers = defs[pname];
  for (const tl of layers) {
    nprim += drawTileLayer(tl, px, py, u, scale, col, lwd);
  }
  if (pname === 'covered') {
    const mnx = Math.min(...px), mny = Math.min(...py), mxx = Math.max(...px), mxy = Math.max(...py);
    let S = [
      [mnx, mny, mxx, mxy],
      [mnx, mxy, mxx, mny]
    ];
    S = clipSegs(S, px, py);
    segments(S.map((r) => r[0] * u[0]), S.map((r) => r[1] * u[1]), S.map((r) => r[2] * u[0]), S.map((r) => r[3] * u[1]),
      { col, lwd: lwd * 1.5 });
  }
  if (!isNa(border)) {
    polygon(x, y, { border, lwd: borderLwd });
  }
  return nprim;
}

/** .draw_tile_layer(tl, px, py, upi, scale, col, lwd). */
export function drawTileLayer(tl, px, py, upi, scale, col, lwd) {
  const w = tl.w * scale;
  const h = tl.h * scale;
  let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
  for (const v of px) { if (v < mnx) { mnx = v; } if (v > mxx) { mxx = v; } }
  for (const v of py) { if (v < mny) { mny = v; } if (v > mxy) { mxy = v; } }
  const ix = colonR(Math.floor(mnx / w) - 1, Math.ceil(mxx / w));
  const iy = colonR(Math.floor(mny / h) - 1, Math.ceil(mxy / h));
  const nt = ix.length * iy.length;
  if (nt > 2e5) {
    console.warn("Pattern too dense for the area to fill; increase 'scale'.");
    return 0;
  }
  const ox = new Array(nt), oy = new Array(nt);
  for (let t = 0; t < nt; t++) {
    ox[t] = ix[t % ix.length] * w;
    oy[t] = iy[Math.floor(t / ix.length)] * h;
  }
  let n = 0;
  const S = tl.segs;
  if (S && S.length > 0) {
    const ns = S.length;
    const big = new Array(nt * ns);
    for (let t = 0; t < nt; t++) {
      for (let s = 0; s < ns; s++) {
        big[t * ns + s] = [S[s][0] * scale + ox[t], S[s][1] * scale + oy[t], S[s][2] * scale + ox[t], S[s][3] * scale + oy[t]];
      }
    }
    const cl = clipSegs(big, px, py);
    if (cl.length > 0) {
      segments(cl.map((r) => r[0] * upi[0]), cl.map((r) => r[1] * upi[1]), cl.map((r) => r[2] * upi[0]), cl.map((r) => r[3] * upi[1]),
        { col, lwd, lend: 1 });
      n += cl.length;
    }
  }
  const pts = tl.pts;
  if (pts && pts.x.length > 0) {
    const np = pts.x.length;
    const qx = [], qy = [], qc = [];
    for (let t = 0; t < nt; t++) {
      for (let s = 0; s < np; s++) {
        qx.push(pts.x[s] * scale + ox[t]);
        qy.push(pts.y[s] * scale + oy[t]);
        qc.push(pts.cex[s]);
      }
    }
    const ins = pip(qx, qy, px, py);
    const sel = [];
    ins.forEach((v, k) => { if (v) { sel.push(k); } });
    if (sel.length > 0) {
      points(sel.map((k) => qx[k] * upi[0]), sel.map((k) => qy[k] * upi[1]), { pch: 16, cex: sel.map((k) => qc[k] * scale), col });
      n += sel.length;
    }
  }
  const txt = tl.txt;
  if (txt && txt.x.length > 0) {
    const nx = txt.x.length;
    const qx = [], qy = [], lab = [], qc = [];
    for (let t = 0; t < nt; t++) {
      for (let s = 0; s < nx; s++) {
        qx.push(txt.x[s] * scale + ox[t]);
        qy.push(txt.y[s] * scale + oy[t]);
        lab.push(txt.label[s]);
        qc.push(txt.cex[s]);
      }
    }
    const m = 0.02 * scale;
    const i1 = pip(qx, qy, px, py);
    const i2 = pip(qx.map((v) => v - m), qy.map((v) => v - m), px, py);
    const i3 = pip(qx.map((v) => v + m), qy.map((v) => v + m), px, py);
    const sel = [];
    i1.forEach((v, k) => { if (v && i2[k] && i3[k]) { sel.push(k); } });
    if (sel.length > 0) {
      text(sel.map((k) => qx[k] * upi[0]), sel.map((k) => qy[k] * upi[1]), sel.map((k) => lab[k]),
        { cex: sel.map((k) => qc[k] * scale), col });
      n += sel.length;
    }
  }
  const polys = tl.polys;
  if (polys && polys.length > 0) {
    const allx = [], ally = [], fills = [];
    for (const pk of polys) {
      const nv = pk.x.length;
      const vx = [], vy = [];
      for (let t = 0; t < nt; t++) {
        for (let v = 0; v < nv; v++) {
          vx.push(pk.x[v] * scale + ox[t]);
          vy.push(pk.y[v] * scale + oy[t]);
        }
      }
      const ins = pip(vx, vy, px, py);
      const ax = [], ay = [];
      for (let t = 0; t < nt; t++) {
        let full = true;
        for (let v = 0; v < nv; v++) { if (!ins[t * nv + v]) { full = false; break; } }
        if (full) {
          for (let v = 0; v < nv; v++) { ax.push(vx[t * nv + v]); ay.push(vy[t * nv + v]); }
          ax.push(NaN);
          ay.push(NaN);
        }
      }
      if (ax.length > 0) {
        allx.push(ax);
        ally.push(ay);
        fills.push(pk.fill === true);
      }
    }
    for (let k = 0; k < allx.length; k++) {
      const X = allx[k].map((v) => v * upi[0]), Y = ally[k].map((v) => v * upi[1]);
      if (fills[k]) {
        polygon(X, Y, { col, border: col, lwd: lwd * 0.5 });
      } else {
        polygon(X, Y, { col: null, border: col, lwd });
      }
      n += allx[k].filter((v) => Number.isNaN(v)).length;
    }
  }
  return n;
}

/**
 * multipatterns(i, x, y, pattern, j = unique(i), scale = 1, col = "black",
 * lwd = 0.5, bg = NULL, border = NA). `pattern` may be an object {id: pattern}.
 */
export function multipatterns(i, x, y, pattern, { j = undefined, scale = 1, col = 'black', lwd = 0.5, bg = null, border = NaN } = {}) {
  i = i.map((v) => (isNa(v) ? null : String(v)));
  if (j === undefined || j === null) {
    j = [...new Set(i)];
  }
  j = (Array.isArray(j) ? j : [j]).map((v) => (isNa(v) ? null : String(v)));
  const nj = j.length;
  if (pattern !== null && typeof pattern === 'object' && !Array.isArray(pattern)) {
    if (j.every((v) => Object.hasOwn(pattern, v))) {
      pattern = j.map((v) => pattern[v]);
    } else {
      pattern = Object.values(pattern);
    }
  }
  pattern = recycle(pattern, nj, 'pattern');
  scale = recycle(scale, nj, 'scale');
  col = recycle(col, nj, 'col');
  lwd = recycle(lwd, nj, 'lwd');
  border = recycle(border, nj, 'border');
  for (let k = 0; k < nj; k++) {
    const sx = [], sy = [];
    for (let q = 0; q < i.length; q++) {
      if (i[q] === j[k]) { sx.push(x[q]); sy.push(y[q]); }
    }
    const bgk = (bg === null || bg === undefined) ? null : recycle(bg, nj, 'bg')[k];
    fillPattern(sx, sy, pattern[k], {
      scale: scale[k], col: col[k], lwd: lwd[k],
      bg: bgk, border: border[k]
    });
  }
  return null;
}
