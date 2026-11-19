// Colour picker: scheme colours, rock-colour chart presets, colour wheel and
// picking a colour from a photo of the outcrop.

import { t as T } from './i18n.js';

// Approximate sRGB values of common Munsell rock-colour chart chips
export const ROCK_CHART = [
  ['white', 'N9', '#E8E8E6'], ['very light gray', 'N8', '#CBCBC9'], ['light gray', 'N7', '#B4B4B2'],
  ['medium light gray', 'N6', '#9B9B99'], ['medium gray', 'N5', '#7F7F7D'], ['medium dark gray', 'N4', '#666664'],
  ['dark gray', 'N3', '#4D4D4C'], ['grayish black', 'N2', '#353535'], ['black', 'N1', '#1F1F1F'],
  ['pinkish gray', '5YR 8/1', '#CFC5BF'], ['very pale orange', '10YR 8/2', '#D9CBB0'],
  ['pale yellowish orange', '10YR 8/6', '#E2C38A'], ['grayish orange', '10YR 7/4', '#C4A880'],
  ['dark yellowish orange', '10YR 6/6', '#B78E50'], ['pale yellowish brown', '10YR 6/2', '#A08E78'],
  ['moderate yellowish brown', '10YR 5/4', '#8A7353'], ['dark yellowish brown', '10YR 4/2', '#6A5A48'],
  ['dusky yellowish brown', '10YR 2/2', '#3B3127'], ['pale brown', '5YR 5/2', '#85736A'],
  ['light brown', '5YR 5/6', '#9B6A45'], ['moderate brown', '5YR 4/4', '#7A5840'],
  ['grayish brown', '5YR 3/2', '#574537'], ['light olive gray', '5Y 6/1', '#95938A'],
  ['olive gray', '5Y 4/1', '#66655C'], ['dusky yellow', '5Y 6/4', '#A79A6A'],
  ['pale olive', '10Y 6/2', '#949479'], ['moderate olive brown', '5Y 4/4', '#6F6440'],
  ['light greenish gray', '5GY 8/1', '#C3C8BF'], ['greenish gray', '5GY 6/1', '#8F958B'],
  ['grayish green', '10GY 5/2', '#6B7A67'], ['dusky green', '5G 3/2', '#3E4F44'],
  ['light bluish gray', '5B 7/1', '#A9B0B2'], ['medium bluish gray', '5B 5/1', '#767D80'],
  ['pale blue', '5PB 7/2', '#A4ABB8'], ['grayish blue', '5PB 5/2', '#6E7787'],
  ['grayish purple', '5P 4/2', '#6E5E70'], ['grayish pink', '5R 8/2', '#D8C3BF'],
  ['moderate orange pink', '10R 7/4', '#CB9A8A'], ['light red', '5R 6/6', '#C1807A'],
  ['pale red', '10R 6/2', '#A48A86'], ['pale reddish brown', '10R 5/4', '#946B5F'],
  ['moderate reddish brown', '10R 4/6', '#8A4F3D'], ['grayish red', '10R 4/2', '#735955'],
  ['moderate red', '5R 4/6', '#8F4A47'], ['dusky red', '5R 3/4', '#6A3D3A']
];

const RECENT_KEY = 'strativis.recent_colours';

function hexToRgb(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
  if (!m) { return [255, 255, 255]; }
  const v = parseInt(m[1], 16);
  return [v >> 16, (v >> 8) & 255, v & 255];
}
export function rgbToHex(r, g, b) {
  const c = (x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return ('#' + c(r) + c(g) + c(b)).toUpperCase();
}
function hsvToRgb(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) { h = 60 * (((g - b) / d) % 6); } else if (mx === g) { h = 60 * ((b - r) / d + 2); } else { h = 60 * ((r - g) / d + 4); }
  }
  if (h < 0) { h += 360; }
  return [h, mx === 0 ? 0 : d / mx, mx];
}
// Nearest chart chip (CIE76 distance in Lab)
function toLab([r, g, b]) {
  const lin = (c) => { c /= 255; return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92; };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
export function nearestChip(hex) {
  const a = toLab(hexToRgb(hex));
  let best = null;
  let bd = Infinity;
  for (const c of ROCK_CHART) {
    const b = toLab(hexToRgb(c[2]));
    const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    if (d < bd) { bd = d; best = c; }
  }
  return { name: best[0], code: best[1], hex: best[2], dist: bd };
}
function recent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; }
}
function addRecent(hex) {
  const r = [hex].concat(recent().filter((x) => x !== hex)).slice(0, 12);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(r)); } catch (e) { /* ignore */ }
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) { e.className = cls; }
  if (html !== undefined) { e.innerHTML = html; }
  return e;
}
function swatch(hex, title, onClick) {
  const b = el('button', 'chipsw');
  b.style.background = hex;
  b.title = title || hex;
  b.setAttribute('aria-label', title || hex);
  b.addEventListener('click', () => onClick(hex));
  return b;
}

// opts: { title, initial, schemes: {name: hex}, onPick(hex), allLabel, allDefault }
export function openColourPicker(opts) {
  let current = (opts.initial || '#FFFFFF').toUpperCase();
  let applyAll = !!opts.allDefault;
  const ov = el('div', 'sheet picker');
  const body = el('div', 'sheet-body');
  ov.appendChild(body);
  const head = el('div', 'row-head');
  head.append(el('h2', '', opts.title || 'Colour'), el('span', 'spacer'));
  const close = el('button', 'small', 'Cancel');
  head.appendChild(close);
  body.appendChild(head);
  const cur = el('div', 'colour-current');
  const curSw = el('span', 'sw big');
  const curTxt = el('span', 'colour-txt');
  cur.append(curSw, curTxt);
  body.appendChild(cur);
  const tabs = el('div', 'seg');
  const panes = {};
  for (const [k, txt] of [['presets', 'Presets'], ['wheel', 'Wheel'], ['photo', 'Photo']]) {
    const b = el('button', '', txt);
    b.dataset.k = k;
    b.addEventListener('click', () => show(k));
    tabs.appendChild(b);
    panes[k] = el('div', 'pane hidden');
  }
  body.appendChild(tabs);
  for (const k in panes) { body.appendChild(panes[k]); }
  const foot = el('div', 'actions');
  let allBox = null;
  if (opts.allLabel) {
    const lab = el('label', 'check');
    allBox = el('input');
    allBox.type = 'checkbox';
    allBox.checked = applyAll;
    allBox.addEventListener('change', () => { applyAll = allBox.checked; });
    lab.append(allBox, document.createTextNode(' ' + opts.allLabel));
    foot.appendChild(lab);
  }
  const use = el('button', 'accent', 'Use this colour');
  foot.appendChild(use);
  body.appendChild(foot);
  document.body.appendChild(ov);

  function setCurrent(hex, from) {
    current = hex.toUpperCase();
    curSw.style.background = current;
    const n = nearestChip(current);
    curTxt.innerHTML = `<b>${current}</b><br><small>${T('nearest chart chip')}: ${n.name} (${n.code})</small>`;
    if (from !== 'wheel') { syncWheel(); }
  }
  function show(k) {
    for (const b of tabs.children) { b.classList.toggle('on', b.dataset.k === k); }
    for (const p in panes) { panes[p].classList.toggle('hidden', p !== k); }
    if (k === 'wheel') { drawWheel(); }
  }
  function done() {
    ov.remove();
  }
  close.addEventListener('click', done);
  use.addEventListener('click', () => {
    addRecent(current);
    opts.onPick(current, applyAll);
    done();
  });

  // Presets
  const pp = panes.presets;
  if (opts.schemes) {
    pp.appendChild(el('h3', '', 'Colour schemes'));
    const row = el('div', 'swrow');
    for (const [nm, hex] of Object.entries(opts.schemes)) {
      if (!hex) { continue; }
      const w = el('div', 'swlab');
      w.append(swatch(hex, nm, (h) => setCurrent(h)), el('small', '', nm));
      row.appendChild(w);
    }
    pp.appendChild(row);
  }
  const rc = recent();
  if (rc.length) {
    pp.appendChild(el('h3', '', 'Recently used'));
    const row = el('div', 'swrow');
    for (const h of rc) { row.appendChild(swatch(h, h, (x) => setCurrent(x))); }
    pp.appendChild(row);
  }
  pp.appendChild(el('h3', '', 'Rock-colour chart (approximate Munsell)'));
  const grid = el('div', 'chart');
  for (const [nm, code, hex] of ROCK_CHART) {
    const w = el('div', 'chartchip');
    w.append(swatch(hex, nm + ' ' + code, (h) => setCurrent(h)), el('small', '', `${nm}<br>${code}`));
    grid.appendChild(w);
  }
  pp.appendChild(grid);

  // Wheel: hue around, saturation outwards, brightness slider
  const wp = panes.wheel;
  const wc = el('canvas', 'wheel');
  const wsize = 240;
  const vRow = el('label', '', 'Brightness');
  const vIn = el('input');
  vIn.type = 'range';
  vIn.min = 0;
  vIn.max = 100;
  vRow.appendChild(vIn);
  const hexRow = el('label', '', 'Hex code');
  const hexIn = el('input');
  hexIn.placeholder = '#A08E78';
  hexRow.appendChild(hexIn);
  wp.append(wc, vRow, hexRow);
  let hsv = rgbToHsv(...hexToRgb(current));
  function drawWheel() {
    const dpr = window.devicePixelRatio || 1;
    wc.width = wsize * dpr;
    wc.height = wsize * dpr;
    wc.style.width = wsize + 'px';
    wc.style.height = wsize + 'px';
    const ctx = wc.getContext('2d');
    const img = ctx.createImageData(wc.width, wc.height);
    const R = wc.width / 2;
    for (let y = 0; y < wc.height; y++) {
      for (let x = 0; x < wc.width; x++) {
        const dx = x - R;
        const dy = y - R;
        const d = Math.hypot(dx, dy) / R;
        const i = (y * wc.width + x) * 4;
        if (d > 1) { img.data[i + 3] = 0; continue; }
        let h = Math.atan2(dy, dx) * 180 / Math.PI;
        if (h < 0) { h += 360; }
        const c = hsvToRgb(h, d, hsv[2]);
        img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const a = hsv[0] * Math.PI / 180;
    ctx.beginPath();
    ctx.arc(R + Math.cos(a) * hsv[1] * R, R + Math.sin(a) * hsv[1] * R, 7 * dpr, 0, 2 * Math.PI);
    ctx.lineWidth = 2 * dpr;
    ctx.strokeStyle = hsv[2] > 0.5 ? '#000' : '#fff';
    ctx.stroke();
  }
  function syncWheel() {
    hsv = rgbToHsv(...hexToRgb(current));
    vIn.value = Math.round(hsv[2] * 100);
    hexIn.value = current;
    if (!panes.wheel.classList.contains('hidden')) { drawWheel(); }
  }
  function wheelAt(e) {
    const r = wc.getBoundingClientRect();
    const dx = e.clientX - r.left - r.width / 2;
    const dy = e.clientY - r.top - r.height / 2;
    let h = Math.atan2(dy, dx) * 180 / Math.PI;
    if (h < 0) { h += 360; }
    hsv[0] = h;
    hsv[1] = Math.min(1, Math.hypot(dx, dy) / (r.width / 2));
    setCurrent(rgbToHex(...hsvToRgb(hsv[0], hsv[1], hsv[2])), 'wheel');
    hexIn.value = current;
    drawWheel();
  }
  let wDown = false;
  wc.addEventListener('pointerdown', (e) => { wDown = true; wc.setPointerCapture(e.pointerId); wheelAt(e); });
  wc.addEventListener('pointermove', (e) => { if (wDown) { wheelAt(e); } });
  wc.addEventListener('pointerup', () => { wDown = false; });
  vIn.addEventListener('input', () => {
    hsv[2] = Number(vIn.value) / 100;
    setCurrent(rgbToHex(...hsvToRgb(hsv[0], hsv[1], hsv[2])), 'wheel');
    hexIn.value = current;
    drawWheel();
  });
  hexIn.addEventListener('change', () => {
    const v = hexIn.value.trim();
    if (/^#?[0-9a-f]{6}$/i.test(v)) { setCurrent(v.startsWith('#') ? v : '#' + v); }
  });

  // Photo: tap the image to sample the average colour around the point
  const ph = panes.photo;
  const pin = el('input');
  pin.type = 'file';
  pin.accept = 'image/*';
  pin.setAttribute('capture', 'environment');
  pin.className = 'hidden';
  const take = el('button', '', 'Take or choose a photo');
  const note = el('p', 'hint', 'Tap the photo where the rock is clean and in daylight. The colour is averaged over the circle.');
  const pc = el('canvas', 'photo hidden');
  const rRow = el('label', 'hidden', 'Sample size');
  const rIn = el('input');
  rIn.type = 'range';
  rIn.min = 2;
  rIn.max = 60;
  rIn.value = 14;
  rRow.appendChild(rIn);
  ph.append(take, pin, note, pc, rRow);
  take.addEventListener('click', () => pin.click());
  let bmp = null;
  let mark = null;
  pin.addEventListener('change', async () => {
    const f = pin.files[0];
    if (!f) { return; }
    try {
      const big = await createImageBitmap(f, { imageOrientation: 'from-image' });
      const scale = Math.min(1, 1600 / Math.max(big.width, big.height));
      bmp = await createImageBitmap(big, { resizeWidth: Math.round(big.width * scale), resizeHeight: Math.round(big.height * scale) });
      big.close && big.close();
      pc.width = bmp.width;
      pc.height = bmp.height;
      pc.classList.remove('hidden');
      rRow.classList.remove('hidden');
      mark = { x: bmp.width / 2, y: bmp.height / 2 };
      drawPhoto();
      sample();
    } catch (err) {
      note.textContent = T('Could not read the photo') + ': ' + err.message;
    }
    pin.value = '';
  });
  function drawPhoto() {
    const ctx = pc.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    if (mark) {
      const rr = Number(rIn.value) * pc.width / pc.getBoundingClientRect().width;
      ctx.beginPath();
      ctx.arc(mark.x, mark.y, rr, 0, 2 * Math.PI);
      ctx.lineWidth = Math.max(2, pc.width / 300);
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(mark.x, mark.y, rr + ctx.lineWidth, 0, 2 * Math.PI);
      ctx.strokeStyle = '#000';
      ctx.stroke();
    }
  }
  function sample() {
    if (!bmp || !mark) { return; }
    const c2 = document.createElement('canvas');
    c2.width = bmp.width;
    c2.height = bmp.height;
    const cx = c2.getContext('2d');
    cx.drawImage(bmp, 0, 0);
    const rr = Math.max(1, Math.round(Number(rIn.value) * pc.width / pc.getBoundingClientRect().width));
    const x0 = Math.max(0, Math.round(mark.x - rr));
    const y0 = Math.max(0, Math.round(mark.y - rr));
    const w = Math.min(bmp.width - x0, 2 * rr + 1);
    const h = Math.min(bmp.height - y0, 2 * rr + 1);
    const d = cx.getImageData(x0, y0, w, h).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (Math.hypot(x0 + x - mark.x, y0 + y - mark.y) > rr) { continue; }
        const i = (y * w + x) * 4;
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      }
    }
    if (n > 0) { setCurrent(rgbToHex(r / n, g / n, b / n)); }
  }
  function photoAt(e) {
    const r = pc.getBoundingClientRect();
    mark = { x: (e.clientX - r.left) * pc.width / r.width, y: (e.clientY - r.top) * pc.height / r.height };
    drawPhoto();
    sample();
  }
  let pDown = false;
  pc.addEventListener('pointerdown', (e) => { pDown = true; pc.setPointerCapture(e.pointerId); photoAt(e); });
  pc.addEventListener('pointermove', (e) => { if (pDown) { photoAt(e); } });
  pc.addEventListener('pointerup', () => { pDown = false; });
  rIn.addEventListener('input', () => { drawPhoto(); sample(); });

  setCurrent(current);
  show(opts.start || 'presets');
  return { close: done };
}
