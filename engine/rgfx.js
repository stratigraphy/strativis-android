// rgfx.js: a small subset of R base graphics in JavaScript ####
//
// The Strativis drawing code was written in R. This module copies the parts of
// R's graphics model that it uses, so the R functions translate almost line by
// line: a device of W x H inches with pages, par(fig, mai, new, usr, pin, cin),
// plot.new(), plot.window(), and polygon, lines, segments, rect, text, points,
// arrows, axis. Coordinates passed to the drawing functions are user
// coordinates (as in R); the backends receive inches from the bottom-left
// corner of the page.
//
// Backends: CanvasBackend (screen preview), PdfBackend (vector PDF, standard
// Helvetica fonts, WinAnsi encoding) and NullBackend (measuring only).
//
// Conventions kept from R:
//   lwd 1 = 1/96 inch; lty 0 blank, 1 solid, 2 dashed, 3 dotted, 4 dotdash,
//   5 longdash, 6 twodash, or a hex string such as "44";
//   lend 0 round, 1 butt, 2 square; ljoin 0 round, 1 mitre, 2 bevel;
//   text(adj = [x, y]) with 0 left/bottom and 1 right/top, srt in degrees,
//   font 1 plain, 2 bold, 3 italic, 4 bold italic, size = pointsize * cex;
//   drawing is clipped to the plot region unless xpd is true (figure region)
//   or NA (null here: whole device).

import { HELV_WIDTHS, HELV_ASCENT, HELV_DESCENT } from './metrics.js';

// Colours ####

const NAMED = {
  black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], blue: [0, 0, 255],
  green: [0, 255, 0], yellow: [255, 255, 0], orange: [255, 165, 0], brown: [165, 42, 42],
  purple: [160, 32, 240], darkgrey: [169, 169, 169], darkgray: [169, 169, 169],
  lightgrey: [211, 211, 211], lightgray: [211, 211, 211], grey: [190, 190, 190], gray: [190, 190, 190],
  transparent: null
};

/** R colour -> {r, g, b, a} (0-255, a 0-1) or null for NA / transparent. */
export function parseCol(col) {
  if (col === null || col === undefined || col === false) { return null; }
  if (typeof col === 'number') {
    if (Number.isNaN(col)) { return null; }
    // R palette() numbers: only 0 (background, i.e. none) and 1 (black) are used here
    return col === 0 ? null : { r: 0, g: 0, b: 0, a: 1 };
  }
  let s = String(col).trim();
  if (s === '' || s === 'NA') { return null; }
  if (s[0] === '#') {
    const h = s.slice(1);
    if (h.length === 3) {
      return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16), a: 1 };
    }
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    if (a === 0) { return null; }
    return { r, g, b, a };
  }
  s = s.toLowerCase().replace(/\s+/g, '');
  const m = s.match(/^gr[ae]y(\d{1,3})$/);
  if (m) {
    const v = Math.round(Number(m[1]) * 2.55);
    return { r: v, g: v, b: v, a: 1 };
  }
  if (s in NAMED) {
    const v = NAMED[s];
    return v ? { r: v[0], g: v[1], b: v[2], a: 1 } : null;
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

/** col2rgb for one colour: [r, g, b] (white for NA, as R gives for "white"). */
export function col2rgb(col) {
  const c = parseCol(col);
  return c ? [c.r, c.g, c.b] : [255, 255, 255];
}

/** rgb(r, g, b, maxColorValue = 255) -> "#RRGGBB". */
export function rgbHex(r, g, b) {
  const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0').toUpperCase();
  return '#' + h(r) + h(g) + h(b);
}

// Text: WinAnsi encoding and Helvetica metrics ####

const WIN_EXTRA = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91,
  0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98,
  0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F
};

/** Prepare a label for drawing: soft hyphens become hyphens, minus signs too. */
export function cleanLabel(s) {
  return String(s).replace(/­/g, '-').replace(/−/g, '-');
}

/** Unicode string -> array of WinAnsi codes ('?' for characters outside it). */
export function winAnsiCodes(s) {
  const out = [];
  for (const ch of cleanLabel(s)) {
    const u = ch.codePointAt(0);
    if (u < 0x80 || (u >= 0xA0 && u <= 0xFF)) {
      out.push(u);
    } else if (u in WIN_EXTRA) {
      out.push(WIN_EXTRA[u]);
    } else {
      out.push(0x3F);
    }
  }
  return out;
}

// Text hooks (app extra, not in R) ####
// tr(label): the label in the reader's language (default: unchanged).
// measure(label, size, font): width in points of a label that WinAnsi cannot
// encode; raster(label, size, font): that label as an alpha image (see
// PdfBackend.text). Without hooks the device behaves exactly as R's pdf().
let hooks = { tr: null, measure: null, raster: null };

/** Sets (or, with no argument, clears) the text hooks. */
export function setTextHooks(h = {}) {
  hooks = { tr: h.tr || null, measure: h.measure || null, raster: h.raster || null };
}

/** TRUE when labels are translated (tr hook set). */
export function textTranslated() { return hooks.tr !== null; }

/** A label translated by the tr hook (unchanged without it). */
export function trLabel(s) {
  if (!hooks.tr || s === null || s === undefined) { return s; }
  const t = hooks.tr(String(s));
  return t === undefined || t === null ? s : t;
}

/** TRUE when every character of the label has a WinAnsi code. */
export function isWinAnsi(s) {
  for (const ch of cleanLabel(s)) {
    const u = ch.codePointAt(0);
    if (!(u < 0x80 || (u >= 0xA0 && u <= 0xFF) || u in WIN_EXTRA)) { return false; }
  }
  return true;
}

// label drawn with the hooks (outside WinAnsi, with measure and raster hooks)
const hooked = (s) => hooks.measure !== null && !isWinAnsi(s);

/** Width of a one-line string in points, Helvetica `font` (1-4) at `size` points. */
export function textWidthPt(s, size, font = 1) {
  if (hooked(s)) { return hooks.measure(cleanLabel(s), size, font || 1); }
  const w = HELV_WIDTHS[(font || 1) - 1] || HELV_WIDTHS[0];
  let t = 0;
  for (const c of winAnsiCodes(s)) { t += w[c]; }
  return t * size / 1000;
}

/** Highest ascent and lowest descent (points) of the glyphs of a one-line string. */
export function inkExtentPt(s, size, font = 1) {
  if (hooked(s)) { return [0.72 * size, -0.2 * size]; }
  const A = HELV_ASCENT[(font || 1) - 1] || HELV_ASCENT[0];
  const D = HELV_DESCENT[(font || 1) - 1] || HELV_DESCENT[0];
  let a = 0, d = 0;
  for (const c of winAnsiCodes(s)) {
    if (c === 32) { continue; }
    a = Math.max(a, A[c]);
    d = Math.min(d, D[c]);
  }
  return [a * size / 1000, d * size / 1000];
}

const CAP_HEIGHT = 0.718; // Helvetica capital height (em), used for vertical adjustment as R does
const LINE_HEIGHT = 1.2;  // R: lheight 1, cin[2] = 1.2 * pointsize

// Line types ####

const LTY = { 0: null, 1: [], 2: '44', 3: '13', 4: '1343', 5: '73', 6: '2262',
  blank: null, solid: [], dashed: '44', dotted: '13', dotdash: '1343', longdash: '73', twodash: '2262' };

/** Dash pattern in inches for an R lty and lwd; null for blank, [] for solid. */
export function dashInches(lty, lwd) {
  if (lty === undefined || lty === null) { lty = 1; }
  let p = (lty in LTY) ? LTY[lty] : String(lty);
  if (p === null) { return null; }
  if (Array.isArray(p)) { return p; }
  const unit = Math.max(lwd || 1, 1) / 96;
  const out = [];
  for (const ch of p) { out.push(parseInt(ch, 16) * unit); }
  return out;
}

// Backends ####
// All take inch coordinates with origin at the bottom-left of the page.
// style: {fill: col|null, stroke: col|null, lwd, lty, lend, ljoin}

/** Measures nothing and draws nothing (R's pdf(NULL)). */
export class NullBackend {
  newPage() {}
  setClip() {}
  path() {}
  circle() {}
  text() {}
  finish() { return null; }
}

/** Draws on a 2D canvas context; `dpi` canvas pixels per inch. */
export class CanvasBackend {
  constructor(ctx, widthIn, heightIn, dpi) {
    this.ctx = ctx;
    this.W = widthIn;
    this.H = heightIn;
    this.dpi = dpi;
    this.clip = null;
  }

  X(x) { return x * this.dpi; }
  Y(y) { return (this.H - y) * this.dpi; }

  newPage() {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, this.W * this.dpi, this.H * this.dpi);
    this.clip = null;
  }

  setClip(r) { this.clip = r; }

  _withClip(fn) {
    const c = this.ctx;
    c.save();
    if (this.clip) {
      const r = this.clip;
      c.beginPath();
      c.rect(this.X(r[0]), this.Y(r[3]), (r[1] - r[0]) * this.dpi, (r[3] - r[2]) * this.dpi);
      c.clip();
    }
    fn(c);
    c.restore();
  }

  _css(col) {
    return `rgba(${col.r},${col.g},${col.b},${col.a})`;
  }

  _stroke(c, st) {
    const dash = dashInches(st.lty, st.lwd);
    if (dash === null || !st.stroke || !(st.lwd > 0)) { return; }
    c.lineWidth = Math.max(st.lwd / 96 * this.dpi, 0.01);
    c.lineCap = ['round', 'butt', 'square'][st.lend ?? 0] || 'round';
    c.lineJoin = ['round', 'miter', 'bevel'][st.ljoin ?? 0] || 'round';
    c.miterLimit = 10;
    c.setLineDash(dash.map((d) => d * this.dpi));
    c.strokeStyle = this._css(st.stroke);
    c.stroke();
  }

  path(pts, close, st) {
    if (pts.length < 2) { return; }
    this._withClip((c) => {
      c.beginPath();
      c.moveTo(this.X(pts[0][0]), this.Y(pts[0][1]));
      for (let k = 1; k < pts.length; k++) { c.lineTo(this.X(pts[k][0]), this.Y(pts[k][1])); }
      if (close) { c.closePath(); }
      if (close && st.fill) {
        c.fillStyle = this._css(st.fill);
        c.fill(st.rule === 'evenodd' ? 'evenodd' : 'nonzero');
      }
      this._stroke(c, st);
    });
  }

  circle(x, y, r, st) {
    this._withClip((c) => {
      c.beginPath();
      c.arc(this.X(x), this.Y(y), r * this.dpi, 0, 2 * Math.PI);
      if (st.fill) {
        c.fillStyle = this._css(st.fill);
        c.fill();
      }
      this._stroke(c, st);
    });
  }

  // one line of text: (x, y) is the anchor, hadj 0-1 along the text, vadj 0-1 of cap height
  text(x, y, s, o) {
    if (!o.col) { return; }
    this._withClip((c) => {
      const px = o.size / 72 * this.dpi;
      const style = (o.font === 3 || o.font === 4) ? 'italic ' : '';
      const weight = (o.font === 2 || o.font === 4) ? 'bold ' : '';
      c.font = `${style}${weight}${px}px Helvetica, Arial, "Liberation Sans", Roboto, sans-serif`;
      c.fillStyle = this._css(o.col);
      c.textBaseline = 'alphabetic';
      c.textAlign = 'left';
      c.translate(this.X(x), this.Y(y));
      c.rotate(-(o.rot || 0) * Math.PI / 180);
      const label = cleanLabel(s);
      const w = c.measureText(label).width;
      c.fillText(label, -o.hadj * w, o.vadj * CAP_HEIGHT * px);
    });
  }

  finish() { return null; }
}

const svgNum = (v) => (Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '0');
const svgCol = (c) => `rgb(${c.r},${c.g},${c.b})`;
const xmlEsc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Draws a vector SVG image (app extra, not in R). Coordinates in points
 * (72 per inch). svg() returns the current page as an SVG string; finish()
 * returns the pages. Consecutive unfilled lines of one style are merged into
 * one SVG path, which keeps hatch patterns light.
 */
export class SvgBackend {
  constructor(widthIn, heightIn) {
    this.W = widthIn;
    this.H = heightIn;
    this.clip = null;
    this.pages = [];
    this.started = false;
    this._reset();
  }

  _reset() {
    this.out = [];
    this.defs = [];
    this.clipIds = new Map();
    this.gClip = null;
    this.run = null; // merged lines: {attrs, d: []}
  }

  X(x) { return svgNum(x * 72); }
  Y(y) { return svgNum((this.H - y) * 72); }

  newPage() {
    if (this.started) { this.pages.push(this.svg()); }
    this.started = true;
    this._reset();
    this.clip = null;
  }

  setClip(r) { this.clip = r; }

  _flush() {
    if (this.run) {
      this.out.push(`<path d="${this.run.d.join('')}"${this.run.attrs}/>`);
      this.run = null;
    }
  }

  // open the clip group of the current clip rectangle
  _group() {
    const r = this.clip;
    const key = r ? r.map((v) => svgNum(v * 72)).join(',') : null;
    if (key === this.gClip) { return; }
    this._flush();
    if (this.gClip !== null) { this.out.push('</g>'); }
    this.gClip = key;
    if (key === null) { return; }
    let id = this.clipIds.get(key);
    if (!id) {
      id = 'c' + (this.clipIds.size + 1);
      this.clipIds.set(key, id);
      this.defs.push(`<clipPath id="${id}"><rect x="${this.X(r[0])}" y="${this.Y(r[3])}" width="${svgNum((r[1] - r[0]) * 72)}" height="${svgNum((r[3] - r[2]) * 72)}"/></clipPath>`);
    }
    this.out.push(`<g clip-path="url(#${id})">`);
  }

  _strokeAttrs(st) {
    const dash = dashInches(st.lty, st.lwd);
    if (dash === null || !st.stroke || !(st.lwd > 0)) { return ''; }
    let a = ` stroke="${svgCol(st.stroke)}" stroke-width="${svgNum(Math.max(st.lwd / 96 * 72, 0.01))}"`;
    a += ` stroke-linecap="${['round', 'butt', 'square'][st.lend ?? 0] || 'round'}"`;
    a += ` stroke-linejoin="${['round', 'miter', 'bevel'][st.ljoin ?? 0] || 'round'}" stroke-miterlimit="10"`;
    if (st.stroke.a < 1) { a += ` stroke-opacity="${svgNum(st.stroke.a)}"`; }
    if (dash.length > 0) { a += ` stroke-dasharray="${dash.map((d) => svgNum(d * 72)).join(' ')}"`; }
    return a;
  }

  _fillAttrs(st) {
    let a = ` fill="${svgCol(st.fill)}"`;
    if (st.fill.a < 1) { a += ` fill-opacity="${svgNum(st.fill.a)}"`; }
    if (st.rule === 'evenodd') { a += ' fill-rule="evenodd"'; }
    return a;
  }

  path(pts, close, st) {
    if (pts.length < 2) { return; }
    const filled = close && st.fill;
    const sa = this._strokeAttrs(st);
    if (!filled && !sa) { return; }
    this._group();
    let d = `M${this.X(pts[0][0])} ${this.Y(pts[0][1])}`;
    for (let k = 1; k < pts.length; k++) { d += `L${this.X(pts[k][0])} ${this.Y(pts[k][1])}`; }
    if (close) { d += 'Z'; }
    if (filled) {
      this._flush();
      this.out.push(`<path d="${d}"${this._fillAttrs(st)}${sa}/>`);
      return;
    }
    const attrs = ' fill="none"' + sa;
    if (this.run && this.run.attrs === attrs) {
      this.run.d.push(d);
    } else {
      this._flush();
      this.run = { attrs, d: [d] };
    }
  }

  circle(x, y, r, st) {
    const sa = this._strokeAttrs(st);
    if (!st.fill && !sa) { return; }
    this._group();
    this._flush();
    const fa = st.fill ? this._fillAttrs(st) : ' fill="none"';
    this.out.push(`<circle cx="${this.X(x)}" cy="${this.Y(y)}" r="${svgNum(r * 72)}"${fa}${sa}/>`);
  }

  // one line of text, placed as in the PDF (Helvetica metrics); its length is
  // fixed so that other fonts take the same room
  text(x, y, s, o) {
    if (!o.col) { return; }
    const label = cleanLabel(s);
    if (label === '') { return; }
    this._group();
    this._flush();
    const w = textWidthPt(s, o.size, o.font) / 72;
    const rot = o.rot || 0;
    const a = rot * Math.PI / 180;
    const ca = Math.cos(a), sa = Math.sin(a);
    const dx = -o.hadj * w, dy = -o.vadj * CAP_HEIGHT * o.size / 72;
    const tx = x + dx * ca - dy * sa, ty = y + dx * sa + dy * ca;
    const X = this.X(tx), Y = this.Y(ty);
    let t = `<text x="${X}" y="${Y}" font-size="${svgNum(o.size)}"`;
    if (o.font === 2 || o.font === 4) { t += ' font-weight="bold"'; }
    if (o.font === 3 || o.font === 4) { t += ' font-style="italic"'; }
    t += ` fill="${svgCol(o.col)}"`;
    if (o.col.a < 1) { t += ` fill-opacity="${svgNum(o.col.a)}"`; }
    if (w > 0) { t += ` textLength="${svgNum(w * 72)}" lengthAdjust="spacingAndGlyphs"`; }
    if (rot) { t += ` transform="rotate(${svgNum(-rot)} ${X} ${Y})"`; }
    this.out.push(t + `>${xmlEsc(label)}</text>`);
  }

  /** The current page as an SVG document (string). */
  svg() {
    this._flush();
    const end = this.gClip !== null ? '</g>' : '';
    const W = svgNum(this.W * 72), H = svgNum(this.H * 72);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}pt" height="${H}pt"` +
      ` font-family="Helvetica, Arial, 'Liberation Sans', Roboto, sans-serif">` +
      `<defs>${this.defs.join('')}</defs><rect width="${W}" height="${H}" fill="#fff"/>` +
      this.out.join('') + end + '</svg>';
  }

  /** The pages, as SVG strings. */
  finish() {
    if (this.started) { this.pages.push(this.svg()); this.started = false; }
    return this.pages;
  }
}

function pdfNum(v) {
  if (!Number.isFinite(v)) { return '0'; }
  const s = (Math.round(v * 1000) / 1000).toFixed(3);
  return s.replace(/\.?0+$/, '') || '0';
}

function pdfString(codes) {
  let out = '(';
  for (const c of codes) {
    if (c === 0x28 || c === 0x29 || c === 0x5C) {
      out += '\\' + String.fromCharCode(c);
    } else if (c < 32 || c > 126) {
      out += '\\' + c.toString(8).padStart(3, '0');
    } else {
      out += String.fromCharCode(c);
    }
  }
  return out + ')';
}

/** Writes a vector PDF (one content stream per page). finish() returns a Uint8Array. */
export class PdfBackend {
  constructor(widthIn, heightIn, info = {}) {
    this.W = widthIn;
    this.H = heightIn;
    this.pages = [];
    this.cur = null;
    this.clip = null;
    this.alphas = new Map();
    this.info = info;
  }

  newPage() {
    this.cur = [];
    this.pages.push(this.cur);
    this.clip = null;
  }

  setClip(r) { this.clip = r; }

  _op(s) {
    if (!this.cur) { this.newPage(); }
    this.cur.push(s);
  }

  _gs(alpha, kind) {
    if (alpha >= 1) { return ''; }
    const key = kind + Math.round(alpha * 1000);
    if (!this.alphas.has(key)) { this.alphas.set(key, { name: 'GS' + (this.alphas.size + 1), kind, alpha }); }
    return '/' + this.alphas.get(key).name + ' gs ';
  }

  _begin() {
    let s = 'q ';
    if (this.clip) {
      const r = this.clip;
      s += `${pdfNum(r[0] * 72)} ${pdfNum(r[2] * 72)} ${pdfNum((r[1] - r[0]) * 72)} ${pdfNum((r[3] - r[2]) * 72)} re W n `;
    }
    return s;
  }

  _strokeState(st) {
    const dash = dashInches(st.lty, st.lwd);
    if (dash === null || !st.stroke || !(st.lwd > 0)) { return null; }
    const c = st.stroke;
    let s = this._gs(c.a, 'CA');
    s += `${pdfNum(st.lwd * 0.75)} w ${[1, 0, 2][st.lend ?? 0] ?? 1} J ${[1, 0, 2][st.ljoin ?? 0] ?? 1} j 10 M `;
    s += `[${dash.map((d) => pdfNum(d * 72)).join(' ')}] 0 d `;
    s += `${pdfNum(c.r / 255)} ${pdfNum(c.g / 255)} ${pdfNum(c.b / 255)} RG `;
    return s;
  }

  path(pts, close, st) {
    if (pts.length < 2) { return; }
    let s = this._begin();
    s += `${pdfNum(pts[0][0] * 72)} ${pdfNum(pts[0][1] * 72)} m `;
    for (let k = 1; k < pts.length; k++) { s += `${pdfNum(pts[k][0] * 72)} ${pdfNum(pts[k][1] * 72)} l `; }
    const fill = close && st.fill;
    const stroke = this._strokeState(st);
    if (fill) {
      const c = st.fill;
      s = s.replace(/^q /, 'q ' + this._gs(c.a, 'ca') + `${pdfNum(c.r / 255)} ${pdfNum(c.g / 255)} ${pdfNum(c.b / 255)} rg `);
    }
    if (stroke) { s = s.replace(/^q /, 'q ' + stroke); }
    const eo = st.rule === 'evenodd' ? '*' : '';
    if (fill && stroke) {
      s += close ? `b${eo} ` : `B${eo} `;
    } else if (fill) {
      s += `h f${eo} `;
    } else if (stroke) {
      s += close ? 's ' : 'S ';
    } else {
      return;
    }
    this._op(s + 'Q');
  }

  circle(x, y, r, st) {
    const n = 32;
    const pts = [];
    for (let k = 0; k < n; k++) {
      const a = 2 * Math.PI * k / n;
      pts.push([x + r * Math.cos(a), y + r * Math.sin(a)]);
    }
    this.path(pts, true, st);
  }

  text(x, y, s, o) {
    if (!o.col) { return; }
    if (hooked(s) && hooks.raster) { this._imageText(x, y, s, o); return; }
    const codes = winAnsiCodes(s);
    const w = textWidthPt(s, o.size, o.font) / 72;
    const a = (o.rot || 0) * Math.PI / 180;
    const ca = Math.cos(a), sa = Math.sin(a);
    // anchor shifted along the baseline (hadj) and across it (vadj)
    const dx = -o.hadj * w, dy = -o.vadj * CAP_HEIGHT * o.size / 72;
    const tx = x + dx * ca - dy * sa, ty = y + dx * sa + dy * ca;
    const c = o.col;
    let t = this._begin() + this._gs(c.a, 'ca');
    t += `${pdfNum(c.r / 255)} ${pdfNum(c.g / 255)} ${pdfNum(c.b / 255)} rg BT /F${o.font || 1} ${pdfNum(o.size)} Tf `;
    t += `${pdfNum(ca)} ${pdfNum(sa)} ${pdfNum(-sa)} ${pdfNum(ca)} ${pdfNum(tx * 72)} ${pdfNum(ty * 72)} Tm `;
    t += pdfString(codes) + ' Tj ET Q';
    this._op(t);
  }

  // a label WinAnsi cannot encode: drawn by the raster hook (any script,
  // shaped by the browser) as an image in the text colour with the label as
  // soft mask, at the label's place and width
  _imageText(x, y, s, o) {
    const label = cleanLabel(s);
    const r = hooks.raster(label, o.size, o.font || 1);
    if (!r || !r.width || !r.height) { return; }
    const w = textWidthPt(s, o.size, o.font) / 72;
    const a = (o.rot || 0) * Math.PI / 180;
    const ca = Math.cos(a), sa = Math.sin(a);
    const dx = -o.hadj * w, dy = -o.vadj * CAP_HEIGHT * o.size / 72;
    const tx = x + dx * ca - dy * sa, ty = y + dx * sa + dy * ca;
    const c = o.col;
    if (!this.images) { this.images = []; }
    const name = 'Im' + (this.images.length + 1);
    this.images.push({ name, rgb: [c.r, c.g, c.b], width: r.width, height: r.height, alpha: r.alpha });
    // image box in points: r.left/r.descent/r.wPt/r.hPt relative to the text origin
    let t = this._begin() + this._gs(c.a, 'ca');
    t += `${pdfNum(ca)} ${pdfNum(sa)} ${pdfNum(-sa)} ${pdfNum(ca)} ${pdfNum(tx * 72)} ${pdfNum(ty * 72)} cm `;
    t += `${pdfNum(r.wPt)} 0 0 ${pdfNum(r.hPt)} ${pdfNum(r.left)} ${pdfNum(-r.descent)} cm /${name} Do Q`;
    this._op(t);
  }

  /** The PDF file, content streams uncompressed. */
  finish() {
    return this._assemble(this._contents().map((s) => ({ bytes: latin1(s), flate: false })));
  }

  /** The PDF file with Flate-compressed content streams (CompressionStream, browsers and Node 18+). */
  async finishAsync() {
    const parts = [];
    for (const s of this._contents()) {
      if (typeof CompressionStream === 'undefined') {
        parts.push({ bytes: latin1(s), flate: false });
        continue;
      }
      const cs = new CompressionStream('deflate');
      const stream = new Blob([latin1(s)]).stream().pipeThrough(cs);
      parts.push({ bytes: new Uint8Array(await new Response(stream).arrayBuffer()), flate: true });
    }
    const masks = [];
    for (const im of this.images || []) {
      if (typeof CompressionStream === 'undefined') {
        masks.push({ bytes: im.alpha, flate: false });
        continue;
      }
      const stream = new Blob([im.alpha]).stream().pipeThrough(new CompressionStream('deflate'));
      masks.push({ bytes: new Uint8Array(await new Response(stream).arrayBuffer()), flate: true });
    }
    return this._assemble(parts, masks);
  }

  _contents() {
    if (this.pages.length === 0) { this.pages.push([]); }
    return this.pages.map((ops) => ops.join('\n'));
  }

  _assemble(streams, masks = null) {
    const objs = [];
    const add = (s) => { objs.push(s); return objs.length; };
    const catalog = add(null);
    const pagesObj = add(null);
    const fontNames = ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'];
    const fontIds = fontNames.map((f) => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`));
    let gsDict = '';
    for (const g of this.alphas.values()) {
      const id = add(`<< /Type /ExtGState /${g.kind} ${pdfNum(g.alpha)} >>`);
      gsDict += `/${g.name} ${id} 0 R `;
    }
    let xoDict = '';
    (this.images || []).forEach((im, k) => {
      const m = masks ? masks[k] : { bytes: im.alpha, flate: false };
      const sm = add({ dict: `<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${m.bytes.length}${m.flate ? ' /Filter /FlateDecode' : ''} >>`, bytes: m.bytes });
      const px = latin1(String.fromCharCode(im.rgb[0], im.rgb[1], im.rgb[2]));
      const id = add({ dict: `<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask ${sm} 0 R /Length 3 >>`, bytes: px });
      xoDict += `/${im.name} ${id} 0 R `;
    });
    const res = add(`<< /Font << ${fontIds.map((id, k) => `/F${k + 1} ${id} 0 R`).join(' ')} >> /ExtGState << ${gsDict}>>${xoDict ? ` /XObject << ${xoDict}>>` : ''} >>`);
    const kids = [];
    for (const st of streams) {
      const cid = add({ dict: `<< /Length ${st.bytes.length}${st.flate ? ' /Filter /FlateDecode' : ''} >>`, bytes: st.bytes });
      const pid = add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${Math.trunc(this.W * 72)} ${Math.trunc(this.H * 72)}] /Resources ${res} 0 R /Contents ${cid} 0 R >>`);
      kids.push(pid);
    }
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
    objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
    const title = !this.info.title ? '(Strativis log)' : isWinAnsi(this.info.title) ? pdfString(winAnsiCodes(this.info.title)) : utf16Hex(this.info.title);
    const infoId = add(`<< /Title ${title} /Producer (Strativis) /Creator (Strativis) >>`);
    const chunks = [];
    let len = 0;
    const put = (b) => { chunks.push(b); len += b.length; };
    put(latin1('%PDF-1.4\n%âãÏÓ\n'));
    const offsets = [];
    for (let k = 0; k < objs.length; k++) {
      offsets.push(len);
      const o = objs[k];
      if (typeof o === 'string') {
        put(latin1(`${k + 1} 0 obj\n${o}\nendobj\n`));
      } else {
        put(latin1(`${k + 1} 0 obj\n${o.dict}\nstream\n`));
        put(o.bytes);
        put(latin1('\nendstream\nendobj\n'));
      }
    }
    const xref = len;
    let tail = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) { tail += String(o).padStart(10, '0') + ' 00000 n \n'; }
    tail += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    put(latin1(tail));
    const out = new Uint8Array(len);
    let pos = 0;
    for (const c of chunks) { out.set(c, pos); pos += c.length; }
    return out;
  }
}

// PDF text string in UTF-16BE (hex, with byte order mark)
function utf16Hex(s) {
  let h = '<FEFF';
  for (let k = 0; k < s.length; k++) { h += s.charCodeAt(k).toString(16).toUpperCase().padStart(4, '0'); }
  return h + '>';
}

// string of byte values (all < 256) -> Uint8Array
function latin1(s) {
  const b = new Uint8Array(s.length);
  for (let k = 0; k < s.length; k++) { b[k] = s.charCodeAt(k) & 0xFF; }
  return b;
}

// The R-like device and functions ####

let dev = null;

/** Open a device (W x H inches) on a backend and make it current, like pdf(). */
export function openDevice(backend, widthIn, heightIn, pointsize = 12) {
  dev = {
    be: backend, W: widthIn, H: heightIn, ps: Math.trunc(pointsize),
    fig: [0, 1, 0, 1], mai: [0, 0, 0, 0], newFlag: false, started: false,
    usr: [0, 1, 0, 1], cex: 1
  };
  return dev;
}

/** The current device (R's dev.cur()) and switching (dev.set()). */
export function devCur() { return dev; }
export function devSet(d) { dev = d; }

/** Close the device and return what the backend produced (PDF bytes or null). */
export function devOff() {
  const d = dev;
  dev = null;
  return d ? d.be.finish() : null;
}

// par("pin") exactly as R computes it for a pdf device (margins go through
// lines and device units), so user-per-inch values match R bit for bit
function pinExact(d) {
  const right = 72 * d.W, top = 72 * d.H;
  const cra1 = 1.2 * d.ps, cex = d.cex ?? 1;
  const xNDCPerInch = 1 / Math.abs(right / 72), yNDCPerInch = 1 / Math.abs(top / 72);
  const xNDCPerLine = Math.abs(cex * cra1 / right), yNDCPerLine = Math.abs(cex * cra1 / top);
  const fbx = Math.abs(d.fig[1] * right - d.fig[0] * right), fby = Math.abs(d.fig[3] * top - d.fig[2] * top);
  const marX = (m) => ((m * xNDCPerInch) * right / right) / xNDCPerLine;
  const marY = (m) => ((m * yNDCPerInch) * top / top) / yNDCPerLine;
  const nfcX = (l) => ((l * xNDCPerLine) * right) / fbx;
  const nfcY = (l) => ((l * yNDCPerLine) * top) / fby;
  const p = [nfcX(marX(d.mai[1])), 1 - nfcX(marX(d.mai[3])), nfcY(marY(d.mai[0])), 1 - nfcY(marY(d.mai[2]))];
  return [(((p[1] - p[0]) * fbx) / right) / xNDCPerInch, (((p[3] - p[2]) * fby) / top) / yNDCPerInch];
}

function plt() {
  const d = dev;
  const fx0 = d.fig[0] * d.W, fx1 = d.fig[1] * d.W, fy0 = d.fig[2] * d.H, fy1 = d.fig[3] * d.H;
  return [fx0 + d.mai[1], fx1 - d.mai[3], fy0 + d.mai[0], fy1 - d.mai[2]];
}

/**
 * par(): with a string, returns that parameter ("usr", "pin", "cin", "fig",
 * "mai", "cex"); with an object, sets parameters and returns their old values.
 */
export function par(arg) {
  const d = dev;
  const get = (nm) => {
    if (nm === 'usr') { return d.usr.slice(); }
    if (nm === 'pin') { return pinExact(d); }
    if (nm === 'cin') { return [0.6 * d.ps / 72, LINE_HEIGHT * d.ps / 72]; }
    if (nm === 'fig') { return d.fig.slice(); }
    if (nm === 'mai') { return d.mai.slice(); }
    if (nm === 'cex') { return d.cex; }
    if (nm === 'new') { return d.newFlag; }
    if (nm === 'plt') { return plt(); }
    return undefined;
  };
  if (typeof arg === 'string') { return get(arg); }
  if (arg === undefined) { return { fig: d.fig.slice(), mai: d.mai.slice(), cex: d.cex, usr: d.usr.slice() }; }
  const old = {};
  for (const [k, v] of Object.entries(arg)) {
    old[k] = get(k);
    if (k === 'fig') { d.fig = v.slice(); d.newFlag = true; }
    else if (k === 'mai') { d.mai = v.slice(); }
    else if (k === 'new') { d.newFlag = !!v; }
    else if (k === 'cex') { d.cex = v; }
    else if (k === 'usr') { d.usr = v.slice(); }
  }
  // setting fig without new = TRUE starts a new page in R; keep the explicit value if given
  if ('fig' in arg && !('new' in arg)) { d.newFlag = false; }
  return old;
}

/** plot.new(): a new page unless par(new = TRUE) was set. */
export function plotNew() {
  const d = dev;
  if (!d.started || !d.newFlag) {
    d.be.newPage();
    d.started = true;
  }
  d.newFlag = false;
  d.usr = [0, 1, 0, 1];
}

/** plot.window(xlim, ylim): sets usr ("i" axis style, or "r" adds 4 %). */
export function plotWindow(xlim, ylim, opts = {}) {
  const ext = (lim, style) => {
    if (style === 'i') { return [lim[0], lim[1]]; }
    const r = (lim[1] - lim[0]) * 0.04;
    return [lim[0] - r, lim[1] + r];
  };
  const x = ext(xlim, opts.xaxs || 'r');
  const y = ext(ylim, opts.yaxs || 'r');
  dev.usr = [x[0], x[1], y[0], y[1]];
}

/** User coordinates -> page inches. */
function toIn(x, y) {
  const d = dev, p = plt(), u = d.usr;
  return [p[0] + (x - u[0]) / (u[1] - u[0]) * (p[1] - p[0]), p[2] + (y - u[2]) / (u[3] - u[2]) * (p[3] - p[2])];
}

/** User units per inch along x and y (R: diff(par("usr")) / par("pin")). */
export function upi() {
  const p = pinExact(dev), u = dev.usr;
  return [(u[1] - u[0]) / p[0], (u[3] - u[2]) / p[1]];
}

function clipFor(xpd) {
  if (xpd === null || (typeof xpd === 'number' && Number.isNaN(xpd))) { return null; }
  if (xpd === true) {
    const d = dev;
    return [d.fig[0] * d.W, d.fig[1] * d.W, d.fig[2] * d.H, d.fig[3] * d.H];
  }
  return plt();
}

// recycle a scalar or array to length n
function rep(v, n) {
  if (!Array.isArray(v)) { return new Array(n).fill(v); }
  if (v.length === n) { return v; }
  const out = new Array(n);
  for (let k = 0; k < n; k++) { out[k] = v[k % v.length]; }
  return out;
}
const asArr = (v) => (Array.isArray(v) ? v : [v]);
const isNA = (v) => v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));

function style(o, k, defStroke) {
  const pick = (v) => (Array.isArray(v) ? v[k % v.length] : v);
  const border = 'border' in o ? pick(o.border) : (o.col !== undefined && !o.fillMode ? pick(o.col) : defStroke);
  return {
    fill: o.fillMode ? parseCol(pick(o.col)) : null,
    stroke: parseCol(border),
    lwd: pick(o.lwd ?? 1),
    lty: pick(o.lty ?? 1),
    lend: pick(o.lend ?? 0),
    ljoin: pick(o.ljoin ?? 0),
    rule: o.rule
  };
}

// split x, y at NA values into runs of points (in inches)
function runs(x, y) {
  const out = [];
  let cur = [];
  for (let k = 0; k < x.length; k++) {
    if (isNA(x[k]) || isNA(y[k])) {
      if (cur.length) { out.push(cur); }
      cur = [];
    } else {
      cur.push(toIn(x[k], y[k]));
    }
  }
  if (cur.length) { out.push(cur); }
  return out;
}

/** polygon(x, y, col, border, lwd, lty): NA values separate polygons. */
export function polygon(x, y, o = {}) {
  x = asArr(x); y = asArr(y);
  dev.be.setClip(clipFor(o.xpd));
  const rs = runs(x, y);
  for (let k = 0; k < rs.length; k++) {
    const st = {
      fill: parseCol(Array.isArray(o.col) ? o.col[k % o.col.length] : o.col),
      stroke: parseCol('border' in o ? (Array.isArray(o.border) ? o.border[k % o.border.length] : o.border) : 'black'),
      lwd: o.lwd ?? 1, lty: o.lty ?? 1, lend: o.lend ?? 0, ljoin: o.ljoin ?? 0, rule: o.rule
    };
    dev.be.path(rs[k], true, st);
  }
}

/** lines(x, y): NA values break the line. */
export function lines(x, y, o = {}) {
  x = asArr(x); y = asArr(y);
  dev.be.setClip(clipFor(o.xpd));
  const st = { fill: null, stroke: parseCol(o.col ?? 'black'), lwd: o.lwd ?? 1, lty: o.lty ?? 1, lend: o.lend ?? 0, ljoin: o.ljoin ?? 0 };
  for (const r of runs(x, y)) { dev.be.path(r, false, st); }
}

/** segments(x0, y0, x1, y1), vectorised with recycling. */
export function segments(x0, y0, x1, y1, o = {}) {
  x0 = asArr(x0); y0 = asArr(y0);
  if (x1 === undefined) { x1 = x0; }
  if (y1 === undefined) { y1 = y0; }
  x1 = asArr(x1); y1 = asArr(y1);
  const n = Math.max(x0.length, y0.length, x1.length, y1.length);
  if (n === 0 || x0.length === 0 || y0.length === 0 || x1.length === 0 || y1.length === 0) { return; }
  const X0 = rep(x0, n), Y0 = rep(y0, n), X1 = rep(x1, n), Y1 = rep(y1, n);
  const col = rep(o.col ?? 'black', n), lwd = rep(o.lwd ?? 1, n), lty = rep(o.lty ?? 1, n);
  dev.be.setClip(clipFor(o.xpd));
  for (let k = 0; k < n; k++) {
    if (isNA(X0[k]) || isNA(Y0[k]) || isNA(X1[k]) || isNA(Y1[k])) { continue; }
    dev.be.path([toIn(X0[k], Y0[k]), toIn(X1[k], Y1[k])], false,
      { fill: null, stroke: parseCol(col[k]), lwd: lwd[k], lty: lty[k], lend: o.lend ?? 0, ljoin: o.ljoin ?? 0 });
  }
}

/** rect(xleft, ybottom, xright, ytop), vectorised. */
export function rect(xl, yb, xr, yt, o = {}) {
  xl = asArr(xl); yb = asArr(yb); xr = asArr(xr); yt = asArr(yt);
  const n = Math.max(xl.length, yb.length, xr.length, yt.length);
  const XL = rep(xl, n), YB = rep(yb, n), XR = rep(xr, n), YT = rep(yt, n);
  const col = rep(o.col ?? null, n), border = rep('border' in o ? o.border : 'black', n);
  const lwd = rep(o.lwd ?? 1, n), lty = rep(o.lty ?? 1, n);
  dev.be.setClip(clipFor(o.xpd));
  for (let k = 0; k < n; k++) {
    if (isNA(XL[k]) || isNA(YB[k]) || isNA(XR[k]) || isNA(YT[k])) { continue; }
    const pts = [toIn(XL[k], YB[k]), toIn(XR[k], YB[k]), toIn(XR[k], YT[k]), toIn(XL[k], YT[k])];
    dev.be.path(pts, true, { fill: parseCol(col[k]), stroke: parseCol(border[k]), lwd: lwd[k], lty: lty[k], lend: 0, ljoin: o.ljoin ?? 1 });
  }
}

/**
 * text(x, y, labels, adj, cex, font, col, srt, xpd). adj is a number or
 * [x, y]; labels may contain "\n" (lines 1.2 x the font size apart).
 */
export function text(x, y, labels, o = {}) {
  x = asArr(x); y = asArr(y); labels = asArr(labels);
  const n = Math.max(x.length, y.length, labels.length);
  if (n === 0 || x.length === 0 || y.length === 0 || labels.length === 0) { return; }
  const X = rep(x, n), Y = rep(y, n), L = rep(labels, n).map(trLabel);
  const cex = rep(o.cex ?? 1, n), col = rep(o.col ?? 'black', n), font = rep(o.font ?? 1, n);
  const srt = rep(o.srt ?? 0, n);
  let adj = o.adj ?? 0.5;
  if (!Array.isArray(adj)) { adj = [adj, NaN]; }
  const hadj = isNA(adj[0]) ? 0.5 : adj[0];
  // R: with no vertical adj, one-line labels are centred on their ink extent
  const exact = isNA(adj[1]);
  const vadj = exact ? 0.5 : adj[1];
  dev.be.setClip(clipFor(o.xpd));
  for (let k = 0; k < n; k++) {
    if (isNA(X[k]) || isNA(Y[k]) || isNA(L[k])) { continue; }
    const size = Math.floor(dev.ps * cex[k] * dev.cex + 0.5);
    const ls = String(L[k]).split('\n');
    const lh = LINE_HEIGHT * dev.ps * cex[k] * dev.cex / 72; // unrounded, as R
    const [px, py] = toIn(X[k], Y[k]);
    const a = srt[k] * Math.PI / 180;
    // block of lines: the anchor is placed at vadj of the block height
    const blockH = (ls.length - 1) * lh + CAP_HEIGHT * size / 72;
    for (let j = 0; j < ls.length; j++) {
      // baseline of line j, perpendicular to the text: line j sits (n - 1 - j)
      // lines above the last one, and the block is shifted down by vadj of its height
      let by = -vadj * blockH + (ls.length - 1 - j) * lh;
      if (exact && ls.length === 1) {
        const [ia, id] = inkExtentPt(ls[0], size, font[k]);
        by = -(ia + id) / 2 / 72;
      }
      const tx = px - by * Math.sin(a);
      const ty = py + by * Math.cos(a);
      dev.be.text(tx, ty, ls[j], { size, font: font[k], col: parseCol(col[k]), rot: srt[k], hadj, vadj: 0 });
    }
  }
}

/** strwidth(s, cex, font, units = "user" | "inches"). */
export function strwidth(s, o = {}) {
  const size = Math.floor((dev ? dev.ps * dev.cex : 12) * (o.cex ?? 1) + 0.5);
  let w = 0;
  for (const line of String(trLabel(s)).split('\n')) { w = Math.max(w, textWidthPt(line, size, o.font ?? 1)); }
  const inches = w / 72;
  return o.units === 'inches' ? inches : inches * upi()[0];
}

/** strheight(s, cex, units = "user" | "inches"): R uses the height of "M" plus extra lines. */
export function strheight(s, o = {}) {
  const size = Math.floor(dev.ps * (o.cex ?? 1) * dev.cex + 0.5);
  const nl = String(trLabel(s)).split("\n").length;
  const inches = (CAP_HEIGHT * size + (nl - 1) * LINE_HEIGHT * size) / 72;
  return o.units === 'inches' ? inches : inches * upi()[1];
}

/** points(x, y, pch = 16 | 19 | 20 | 1 | 21, cex, col, bg). */
export function points(x, y, o = {}) {
  x = asArr(x); y = asArr(y);
  const n = Math.max(x.length, y.length);
  const X = rep(x, n), Y = rep(y, n);
  const cex = rep(o.cex ?? 1, n), col = rep(o.col ?? 'black', n), pch = rep(o.pch ?? 1, n);
  dev.be.setClip(clipFor(o.xpd));
  for (let k = 0; k < n; k++) {
    if (isNA(X[k]) || isNA(Y[k])) { continue; }
    const [px, py] = toIn(X[k], Y[k]);
    const g = 0.6 * cex[k] * dev.cex * dev.ps / 72;
    const c = parseCol(col[k]);
    if (pch[k] === 16 || pch[k] === 19) {
      dev.be.circle(px, py, 0.375 * g, { fill: c, stroke: pch[k] === 19 ? c : null, lwd: 1 });
    } else if (pch[k] === 20) {
      dev.be.circle(px, py, 0.25 * g, { fill: c, stroke: null, lwd: 1 });
    } else {
      dev.be.circle(px, py, 0.375 * g, { fill: pch[k] === 21 ? parseCol(o.bg) : null, stroke: c, lwd: o.lwd ?? 1 });
    }
  }
}

/** arrows(x0, y0, x1, y1, length (inches), angle (degrees), code). */
export function arrows(x0, y0, x1, y1, o = {}) {
  x0 = asArr(x0); y0 = asArr(y0); x1 = asArr(x1); y1 = asArr(y1);
  const n = Math.max(x0.length, y0.length, x1.length, y1.length);
  const X0 = rep(x0, n), Y0 = rep(y0, n), X1 = rep(x1, n), Y1 = rep(y1, n);
  const len = o.length ?? 0.25, ang = (o.angle ?? 30) * Math.PI / 180, code = o.code ?? 2;
  const st = { fill: null, stroke: parseCol(o.col ?? 'black'), lwd: o.lwd ?? 1, lty: o.lty ?? 1, lend: 0, ljoin: 0 };
  dev.be.setClip(clipFor(o.xpd));
  for (let k = 0; k < n; k++) {
    const a = toIn(X0[k], Y0[k]), b = toIn(X1[k], Y1[k]);
    dev.be.path([a, b], false, st);
    const head = (p, q) => {
      const t = Math.atan2(q[1] - p[1], q[0] - p[0]);
      dev.be.path([
        [q[0] - len * Math.cos(t - ang), q[1] - len * Math.sin(t - ang)], q,
        [q[0] - len * Math.cos(t + ang), q[1] - len * Math.sin(t + ang)]
      ], false, st);
    };
    if (code === 2 || code === 3) { head(a, b); }
    if (code === 1 || code === 3) { head(b, a); }
  }
}

/** Formats numbers as R's format() of a vector: common number of decimals. */
export function formatNums(v) {
  let dec = 0;
  for (const x of v) {
    const s = String(+(+x).toPrecision(7));
    const i = s.indexOf('.');
    if (i >= 0) { dec = Math.max(dec, s.length - i - 1); }
  }
  return v.map((x) => (+x).toFixed(dec));
}

/** format() of one number (R: up to 7 significant digits, no trailing zeros). */
export function formatNum(x) {
  return String(+(+x).toPrecision(7));
}

/**
 * axis(side = 2 only, at, labels, pos, las, cexAxis, tcl, lwd).
 * The axis line runs from min(at) to max(at); ticks point outwards by tcl lines.
 */
export function axis(side, o = {}) {
  if (side !== 2) { throw new Error('axis(): only side 2 is implemented'); }
  const at = o.at ?? [];
  if (at.length === 0) { return; }
  const labels = o.labels ?? formatNums(at);
  const u = upi();
  const pos = o.pos ?? dev.usr[0];
  const cexA = o.cexAxis ?? 1;
  const lineIn = LINE_HEIGHT * dev.ps / 72; // one margin line (mex = 1)
  const tick = (o.tcl ?? -0.5) * lineIn * u[0];
  const lwd = o.lwd ?? 1;
  const lo = Math.min(...at), hi = Math.max(...at);
  if (lwd > 0) { segments(pos, lo, pos, hi, { lwd, xpd: null }); }
  segments(rep(pos, at.length), at, rep(pos + tick, at.length), at, { lwd: o.lwdTicks ?? lwd, xpd: null });
  if (labels === false) { return; }
  // labels at mgp[2] = 1 line from the axis, right-aligned (las = 1)
  const lx = pos - 1 * lineIn * u[0];
  if ((o.las ?? 0) === 1) {
    text(rep(lx, at.length), at, labels, { adj: [1, 0.5], cex: cexA, xpd: null });
  } else {
    text(rep(lx, at.length), at, labels, { adj: [0.5, 0], srt: 90, cex: cexA, xpd: null });
  }
}

// Helpers from R base ####

/** pretty(range): R's algorithm for about n = 5 nice intervals. */
export function pretty(x, n = 5) {
  let lo = Math.min(...x), hi = Math.max(...x);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { return []; }
  if (hi === lo) {
    if (lo === 0) { hi = 1; } else { const d = Math.abs(lo) / 10; lo -= d; hi += d; }
  }
  const h = 1.5, h5 = 0.5 + 1.5 * h;
  const dx = hi - lo;
  let cell = Math.max(Math.abs(lo), Math.abs(hi));
  const i_small = dx < cell * 20 * 2.220446e-16 * 3 / 1;
  if (i_small) { cell = cell / 10; } else { cell = dx / n; }
  let U = Math.pow(10, Math.floor(Math.log10(cell)));
  let unit = U;
  if (2 * U - cell < h * (cell - unit)) {
    unit = 2 * U;
    if (5 * U - cell < h5 * (cell - unit)) {
      unit = 5 * U;
      if (10 * U - cell < h * (cell - unit)) { unit = 10 * U; }
    }
  }
  let ns = Math.floor(lo / unit + 1e-7);
  let nu = Math.ceil(hi / unit - 1e-7);
  while (ns * unit > lo + 1e-7 * unit) { ns--; }
  while (nu * unit < hi - 1e-7 * unit) { nu++; }
  let k = Math.floor(0.5 + nu - ns);
  if (k < 1) {
    k = 1 - k;
    if (ns >= 0) { nu += k / 2; ns -= k / 2 + k % 2; } else { ns -= k / 2; nu += k / 2 + k % 2; }
  }
  const out = [];
  for (let j = ns; j <= nu; j++) { out.push(+(j * unit).toPrecision(12)); }
  return out;
}

/** strwrap(x, width): greedy word wrap on character counts, like R. */
export function strwrap(x, width) {
  const out = [];
  for (const para of String(x).split(/\n\s*\n/)) {
    const words = para.split(/\s+/).filter((w) => w.length > 0);
    let line = '';
    for (const w of words) {
      if (line === '') { line = w; } else if (line.length + 1 + w.length < width) { line += ' ' + w; } else { out.push(line); line = w; }
    }
    if (line !== '') { out.push(line); }
  }
  return out;
}

/** seq(from, to, by) with R's tolerance. */
export function seqBy(from, to, by) {
  const n = Math.floor((to - from) / by + 1e-10);
  const out = [];
  for (let k = 0; k <= n; k++) { out.push(from + k * by); }
  return out;
}

/** seq(from, to, length.out = n). */
export function seqLen(from, to, n) {
  if (n === 1) { return [from]; }
  const out = [];
  for (let k = 0; k < n; k++) { out.push(from + (to - from) * k / (n - 1)); }
  return out;
}
