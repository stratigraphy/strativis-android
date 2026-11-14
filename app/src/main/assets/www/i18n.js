// Strativis: languages of the app ####
//
// English is the language of the source code and the default. A language
// file (lang/xx.js) holds three tables:
//   ui:    English text -> translated text (whole texts, with {name}
//          placeholders for the variable parts);
//   terms: internal names (lithologies, symbols, contacts...) -> names;
//   help:  the chapters of the manual ({id, title, html}).
// Text written into the page by the app is translated as it appears (a
// MutationObserver), so most of the code just writes English. Text with
// variable parts goes through t(). The PDF, the exports and the project
// files stay in English (the language of the R packages and of most
// publications).

export const LANGS = [
  ['en', 'English'], ['fr', 'Français'], ['nl', 'Nederlands'], ['de', 'Deutsch'],
  ['es', 'Español'], ['pt', 'Português'], ['it', 'Italiano'], ['pl', 'Polski'],
  ['tr', 'Türkçe'], ['id', 'Bahasa Indonesia'], ['ru', 'Русский'], ['ja', '日本語'],
  ['ar', 'العربية'], ['ur', 'اردو'], ['hi', 'हिन्दी']
];
// languages written from right to left
const RTL = new Set(['ar', 'ur']);
const KEY = 'strativis.lang';
let lang = 'en';
let ui = new Map();
let terms = new Map();
let help = null;
// development: records the texts met on the page (strativis.i18n.collect = 1)
let seen = null;
try { if (localStorage.getItem('strativis.i18n.collect') === '1') { seen = new Set(); window.__i18nSeen = seen; } } catch (e) { seen = null; }

export function getLang() { return lang; }
export function savedLang() {
  let l = 'en';
  try { l = localStorage.getItem(KEY) || 'en'; } catch (e) { l = 'en'; }
  return LANGS.some((x) => x[0] === l) ? l : 'en';
}
export function saveLang(l) {
  try { localStorage.setItem(KEY, l); } catch (e) { /* no storage: back to English next time */ }
}

/** Loads a language (English needs no file). Falls back to English on any error. */
export async function loadLang(l) {
  lang = 'en';
  ui = new Map();
  terms = new Map();
  help = null;
  if (!l || l === 'en') { return; }
  try {
    const m = await import(`./lang/${l}.js`);
    const d = m.default || {};
    ui = new Map(Object.entries(d.ui || {}));
    terms = new Map(Object.entries(d.terms || {}));
    help = Array.isArray(d.help) ? d.help : null;
    lang = l;
    document.documentElement.lang = l;
    document.documentElement.dir = RTL.has(l) ? 'rtl' : 'ltr';
  } catch (e) {
    console.warn('language ' + l + ': ' + (e.message || e));
  }
}

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

/** Translated text; {name} placeholders are filled from vars. */
export function t(s, vars) {
  if (seen) { seen.add(s); }
  const tr = ui.get(s);
  return fill(tr === undefined || tr === '' ? s : tr, vars);
}

// English names of the lithologies and symbols whose internal names are cryptic
export const EN_TERMS = {
  dolo_grainstone: 'dolomitized grainstone', dolo_packstone: 'dolomitized packstone',
  dolo_wackestone: 'dolomitized wackestone', dolo_boundstone: 'dolomitized boundstone', kmg_salt: 'K/Mg salts',
  xbed_low_angle: 'low-angle cross-bedding', xbed_tabular: 'tabular cross-bedding', xbed_trough: 'trough cross-bedding',
  stylolite_flaser: 'stylolitic flaser structure', linsen: 'lenticular bedding (linsen)', flaser: 'flaser bedding',
  flaser_ripples: 'flaser ripples', bioturbation_homogenized: 'bioturbation, homogenized',
  birdseye_keystone: 'birdseye / keystone vugs', epichnia: 'epichnia (trace on top of bed)',
  exichnia: 'exichnia (trace outside bed)', endichnia: 'endichnia (trace within bed)',
  hypichnia: 'hypichnia (trace on base of bed)', foram_benthic: 'benthic foraminifera',
  foram_pelagic: 'planktonic foraminifera', encrusting_foram: 'encrusting foraminifera',
  opposite_currents_equal: 'opposite currents, equal', opposite_one_predominant: 'opposite currents, one predominant',
  opposite_one_strongly: 'opposite currents, one strongly predominant', clay_parting: 'clay parting',
  paleosol: 'palaeosol', large_ripple_direction: 'palaeocurrent (large ripples)',
  small_ripple_direction: 'palaeocurrent (small ripples)', sole_mark_direction: 'palaeocurrent (sole marks)',
  vf: 'very fine sand', f: 'fine sand', m: 'medium sand', c: 'coarse sand', vc: 'very coarse sand'
};

/** Name of a lithology, symbol, contact... (null: none, use the internal name). */
export function term(name) {
  const v = terms.get(name);
  if (v !== undefined && v !== '') { return v; }
  return EN_TERMS[name] ? t(EN_TERMS[name]) : null;
}

/** Translated chapter of the manual, or null. */
export function helpChapter(id) {
  return help ? help.find((c) => c.id === id) || null : null;
}

// Translation of the page ####
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CANVAS', 'svg', 'SVG']);
function skipped(el) {
  for (let e = el; e && e !== document.body; e = e.parentNode) {
    if (e.nodeType === 1 && (SKIP.has(e.tagName) || e.namespaceURI === 'http://www.w3.org/2000/svg' || e.hasAttribute('data-no-i18n'))) {
      return true;
    }
  }
  return false;
}
// text nodes already translated, with the text written (a translation can
// itself be an English text: "Data" is Portuguese for "Date")
const done = new WeakMap();
const doneEl = new WeakSet();
function textNode(n) {
  const s = n.nodeValue;
  if (done.get(n) === s) { return; }
  if (!s || !/[A-Za-z]/.test(s)) { return; }
  const core = s.trim();
  if (seen) { seen.add(core); }
  const tr = ui.get(core);
  if (tr !== undefined && tr !== '' && tr !== core) {
    const lead = s.slice(0, s.indexOf(core));
    const trail = s.slice(s.indexOf(core) + core.length);
    n.nodeValue = lead + tr + trail;
    done.set(n, n.nodeValue);
  }
}
function element(el) {
  if (el.tagName === 'OPTION' && !el.hasAttribute('value')) {
    el.setAttribute('value', el.textContent); // keep the English value
  }
  if (doneEl.has(el)) { return; }
  doneEl.add(el);
  for (const a of ['placeholder', 'title', 'aria-label', 'label']) {
    const v = el.getAttribute(a);
    if (v) {
      if (seen) { seen.add(v.trim()); }
      const tr = ui.get(v.trim());
      if (tr !== undefined && tr !== '') { el.setAttribute(a, tr); }
    }
  }
}
function walk(root) {
  if (root.nodeType === 3) {
    if (!skipped(root.parentNode)) { textNode(root); }
    return;
  }
  if (root.nodeType !== 1 || skipped(root)) { return; }
  element(root);
  const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeType === 1 && (SKIP.has(n.tagName) || n.namespaceURI === 'http://www.w3.org/2000/svg' || n.hasAttribute('data-no-i18n'))
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
  });
  let n = it.nextNode();
  while (n) {
    if (n.nodeType === 3) { textNode(n); } else { element(n); }
    n = it.nextNode();
  }
}

/** Translates the page now and everything the app writes into it later. */
export function translatePage() {
  // option values first, also in English (selects keep English values)
  for (const o of document.querySelectorAll('option:not([value])')) { o.setAttribute('value', o.textContent); }
  if (lang === 'en' && !seen) { return; }
  walk(document.body);
  const obs = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') {
        if (!skipped(m.target.parentNode)) { textNode(m.target); }
      } else {
        for (const n of m.addedNodes) { walk(n); }
      }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  // confirm() texts
  const c0 = window.confirm.bind(window);
  window.confirm = (msg) => c0(ui.get(String(msg)) || String(msg));
}
