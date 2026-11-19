// Strativis: texts of the log in any script ####
//
// The drawing engine writes the PDF with the standard Helvetica font, which
// covers the Latin-1 (WinAnsi) characters only. Texts with other characters
// (Polish, Turkish, Cyrillic, Japanese, Arabic, Urdu, Hindi...) are measured
// and drawn here by the browser, with the phone's fonts and full shaping,
// and the engine puts them in the PDF as sharp images (600 dpi) in the text
// colour. The engine's text hooks are set by setupPdfText().
import { setTextHooks } from './engine/rgfx.js';
import { engineChoices } from './engine/engine.js';
import { label as engineLabel } from './engine/sv_document.js';
import { pdfTranslator } from './i18n.js';

const FAMILY = 'Helvetica, Arial, "Liberation Sans", Roboto, "Noto Sans", sans-serif';
const DPI = 600;
const SCALE = DPI / 72; // pixels per point
const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
let ctx = null;

function context() {
  if (!ctx) {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 8;
    ctx = c.getContext('2d', { willReadFrequently: true });
  }
  return ctx;
}

function fontCss(px, font) {
  const style = font === 3 || font === 4 ? 'italic ' : '';
  const weight = font === 2 || font === 4 ? 'bold ' : '';
  return `${style}${weight}${px}px ${FAMILY}`;
}

function setFont(c, s, px, font) {
  c.font = fontCss(px, font);
  c.direction = RTL.test(s) ? 'rtl' : 'ltr';
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
}

/** Width in points of a one-line text at `size` points. */
export function measureText(s, size, font) {
  const c = context();
  setFont(c, s, 100, font);
  return c.measureText(s).width * size / 100;
}

/** A one-line text as an alpha image, with its box in points around the text origin. */
export function rasterText(s, size, font) {
  const px = size * SCALE;
  const c0 = context();
  setFont(c0, s, px, font);
  const m = c0.measureText(s);
  const asc = Math.ceil(Math.max(m.fontBoundingBoxAscent || 0, m.actualBoundingBoxAscent || 0, 0.95 * px));
  const desc = Math.ceil(Math.max(m.fontBoundingBoxDescent || 0, m.actualBoundingBoxDescent || 0, 0.3 * px));
  const pad = Math.ceil(0.1 * px);
  const W = Math.ceil(m.width) + 2 * pad;
  const H = asc + desc + 2 * pad;
  if (W < 1 || H < 1 || W * H > 3e7) { return null; }
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d', { willReadFrequently: true });
  setFont(c, s, px, font);
  c.fillStyle = '#000';
  c.fillText(s, pad, pad + asc);
  const d = c.getImageData(0, 0, W, H).data;
  const alpha = new Uint8Array(W * H);
  for (let k = 0; k < alpha.length; k++) { alpha[k] = d[4 * k + 3]; }
  return { width: W, height: H, alpha, wPt: W / SCALE, hPt: H / SCALE, left: -pad / SCALE, descent: (desc + pad) / SCALE };
}

/** Sets the engine's text hooks for the current language (call after loadLang). */
export function setupPdfText() {
  const labels = new Map();
  const ch = engineChoices();
  // grain sizes are not translated: their short names (vf, f, m, c...) label
  // the grain-size scale; the lithologies among them are in patterns
  const skip = new Set((ch.grains || []).filter((n) => !(ch.patterns || []).includes(n)));
  for (const [k, v] of Object.entries(ch)) {
    if (!Array.isArray(v) || k === 'grains') { continue; }
    for (const n of v) {
      if (typeof n === 'string' && !skip.has(n)) { labels.set(engineLabel(n), n); }
    }
  }
  setTextHooks({ tr: pdfTranslator(labels), measure: measureText, raster: rasterText });
}
