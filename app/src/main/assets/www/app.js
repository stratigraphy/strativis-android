// Strativis mobile: create, edit and publish sedimentary logs, offline.
// The drawing is done by a JavaScript port of the R packages lithoglyph and
// Strativis (engine/), giving the same logs and PDFs as the R packages.
import { engineChoices, enginePlan, engineDrawPage, enginePdf, engineExport, engineBedPreview, engineBedThumbs, engineRose, engineStereonet, engineOrientationStats } from './engine/engine.js';
import { SvgBackend } from './engine/rgfx.js';
import { unitRank } from './engine/sv_document.js';
import { drawMiniBed } from './minibed.js';
import { openColourPicker } from './colour.js';
import { makeZip } from './zip.js';
import { openHelp } from './help.js';
import { t as T, term, loadLang, savedLang, saveLang, translatePage, LANGS, getLang } from './i18n.js';

const STORE_KEY = 'strativis.workspace.v1';
const OLD_KEY = 'strativis.project.v1';
const BED_FIELDS = ['id', 'thickness', 'base', 'top', 'lithology', 'grain', 'grain_top', 'contact',
  'side', 'surface', 'structure', 'fossils', 'bioturbation', 'relief', 'relief_shape', 'fill', 'description', 'fault_angle', 'fault_sense', 'dip', 'dip_dir', 'bouma'];
const SYM_FIELDS = ['dt', 'name', 'column', 'angle', 'bed', 'pos'];
const UNIT_FIELDS = ['base', 'top', 'level', 'name', 'fill'];
const DEFAULT_OPTIONS = {
  layout: 'combined', scale: 'siliciclastic', colours: 'conventional', page: 'A4',
  orientation: 'portrait', vscale: 'fit', panels: 'auto', base: 0, unit: 'm', class_width: 4.5 / 25.4,
  symbol_size: 4 / 25.4, pattern_scale: 1, relief_style: 'beds', legend: true, description_width: 45 / 25.4,
  corner: 1.5 / 25.4, amp: 1.5 / 25.4, stack: true, minor_ticks: 0, tick_step: 0, size_unit: 'mm', bed_numbers: false,
  core: false, rose: true, rose_bin: 30, stereonet: true, declination: 0
};

let ready = false;
let ws = null; // workspace: { current, sections: [{ id, project }] }
let project = null;
let choices = {};
const schemes = { conventional: {}, pastel: {}, grey: {} };
const groups = {};
let selBed = -1;
let pvPage = 1;
let pvPages = 1;
let pvZoom = 1;
let dirtyPreview = true;

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.add('hidden'), ms);
}
function busy(on, text) {
  $('#busy').classList.toggle('hidden', !on);
  if (text) { $('#busy-text').textContent = text; }
}
const isNA = (v) => v === null || v === undefined || v === '' || (typeof v === 'number' && isNaN(v));
const NICE_LABEL = { fault_normal: 'fault, normal (hanging wall down)', fault_reverse: 'fault, reverse (hanging wall up)' };
const label = (s) => term(s) || T(NICE_LABEL[s] || String(s || '').replace(/_/g, ' '));
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function fmt(x) {
  return isNA(x) ? '' : (Math.round(Number(x) * 1000) / 1000).toString();
}

// Project model ####
function blankProject(title) {
  return {
    format: 'Strativis', version: 1,
    meta: { title: title || 'New section', section: '', location: '', latitude: '', longitude: '', elevation: '',
      author: '', date: new Date().toISOString().slice(0, 10), notes: '' },
    options: Object.assign({}, DEFAULT_OPTIONS),
    beds: [{ id: 'B1', thickness: 1, lithology: 'sandstone', grain: 'm', contact: 'sharp', side: 'straight',
      surface: 'none', relief_shape: 'bank' }],
    symbols: [], units: [], palette: {}
  };
}
function newBedId(p) {
  let mx = 0;
  for (const b of p.beds) {
    const m = /^B(\d+)$/.exec(b.id || '');
    if (m) { mx = Math.max(mx, Number(m[1])); }
  }
  return 'B' + (mx + 1);
}
function normalise(p) {
  p.format = 'Strativis';
  p.version = 1;
  p.meta = Object.assign(blankProject().meta, p.meta || {});
  p.options = Object.assign({}, DEFAULT_OPTIONS, p.options || {});
  if (p.options.layout === 'utrecht') { p.options.layout = 'structures'; } // name before 1.2.0
  p.beds = Array.isArray(p.beds) ? p.beds : [];
  p.symbols = Array.isArray(p.symbols) ? p.symbols : [];
  p.units = Array.isArray(p.units) ? p.units : [];
  p.samples = Array.isArray(p.samples) ? p.samples : [];
  p.curves = Array.isArray(p.curves) ? p.curves : [];
  p.photos = Array.isArray(p.photos) ? p.photos : [];
  p.orientations = Array.isArray(p.orientations) ? p.orientations : [];
  p.palette = (p.palette && typeof p.palette === 'object' && !Array.isArray(p.palette)) ? p.palette : {};
  const o = p.options;
  // core logs: the beds are stacked from 0 (heights); option base is the depth of the top
  let y = o.core ? 0 : (Number(o.base) || 0);
  const seen = new Set();
  for (const b of p.beds) {
    if (isNA(b.id) || seen.has(b.id)) { b.id = newBedId(p); }
    seen.add(b.id);
  }
  for (const b of p.beds) {
    if (isNA(b.thickness)) { b.thickness = (!isNA(b.top) && !isNA(b.base)) ? b.top - b.base : 0.5; }
    b.thickness = Math.round(Math.max(0.001, Number(b.thickness)) * 1e9) / 1e9;
    if (o.stack || isNA(b.base) || isNA(b.top)) {
      b.base = y;
      b.top = Math.round((y + b.thickness) * 1e9) / 1e9;
      y = b.top;
    }
    for (const [k, v] of [['lithology', 'sandstone'], ['grain', 'm'], ['contact', 'sharp'], ['side', 'straight'],
      ['surface', 'none'], ['relief_shape', 'bank']]) {
      if (isNA(b[k])) { b[k] = v; }
    }
  }
  // symbols attached to a bed follow it
  const byId = new Map(p.beds.map((b) => [b.id, b]));
  for (const s of p.symbols) {
    if (!isNA(s.bed) && byId.has(s.bed)) {
      const b = byId.get(s.bed);
      if (isNA(s.pos)) { s.pos = 0.5; }
      s.dt = Math.round((b.base + Number(s.pos) * b.thickness) * 1e6) / 1e6;
    } else if (!isNA(s.bed)) {
      s.bed = null;
      s.pos = null;
    }
    if (isNA(s.angle)) { s.angle = 0; }
  }
  // photos and orientation measurements attached to a bed follow it too
  for (const t of [p.photos, p.orientations]) {
    for (const s of t) {
      if (!isNA(s.bed) && byId.has(s.bed)) {
        const b = byId.get(s.bed);
        if (isNA(s.pos)) { s.pos = 0.5; }
        s.dt = Math.round((b.base + Number(s.pos) * b.thickness) * 1e6) / 1e6;
      } else if (!isNA(s.bed)) {
        s.bed = null;
        s.pos = null;
      }
    }
  }
  return p;
}

// Workspace with several sections, kept on the phone ####
function newSecId() {
  return 's' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
}
function save() {
  if (ws) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(ws)); } catch (e) { toast('Storage full: save your sections as files'); }
  }
  dirtyPreview = true;
}
function currentSection() {
  return ws.sections.find((s) => s.id === ws.current);
}
function switchSection(id) {
  ws.current = id;
  project = normalise(currentSection().project);
  currentSection().project = project;
  selBed = -1;
  pvPage = 1;
  save();
  renderAll();
}
function addSection(p, select = true) {
  const s = { id: newSecId(), project: normalise(p) };
  ws.sections.push(s);
  if (select) { switchSection(s.id); } else { save(); renderSections(); }
  return s;
}
function setProject(p) {
  addSection(p);
}

// Files (Android bridge when available, browser download otherwise) ####
function bytesToBase64(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}
function saveBytes(name, mime, bytes) {
  if (window.AndroidBridge && window.AndroidBridge.saveFile) {
    window.AndroidBridge.saveFile(name, mime, bytesToBase64(bytes));
    return;
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
window.onAndroidSaved = (msg) => toast(msg);
function stubOf(p) {
  return (p.meta.title || 'section').replace(/[^A-Za-z0-9_-]+/g, '_') || 'section';
}

// R engine ####
function csvCell(v) {
  if (isNA(v)) { return ''; }
  return '"' + String(v).replace(/"/g, '""') + '"';
}
function toCSV(rows, fields) {
  const lines = [fields.join(',')];
  for (const r of rows) { lines.push(fields.map((f) => csvCell(r[f])).join(',')); }
  return lines.join('\n') + '\n';
}
const enc = new TextEncoder();
async function startEngine() {
  busy(true, 'Loading Strativis…');
  const c = engineChoices();
  for (const key of ['patterns', 'grains', 'contacts', 'surfaces', 'structures', 'fossils', 'symbols']) {
    choices[key] = c[key];
  }
  for (const [g, v] of Object.entries(c.groups)) { groups[g] = v; }
  // Embry & Klovan carbonate textures (drawn as packstone or boundstone)
  for (const t of ['floatstone', 'bafflestone', 'bindstone', 'framestone']) {
    if (!choices.grains.includes(t)) { choices.grains.push(t); }
  }
  // faults inside a bed: drawn across the log at their level (angle = dip)
  groups['Faults (inside a bed)'] = ['fault_normal', 'fault_reverse'];
  for (const sc of Object.keys(schemes)) {
    for (const [k, v] of Object.entries(c.colours[sc])) { schemes[sc][k] = v || null; }
  }
  ready = true;
  $('#btn-pdf').disabled = false;
  busy(false);
}

// Only one drawing at a time: a request made while drawing runs once afterwards
let rendering = false;
let renderAgain = false;
async function renderPreview() {
  if (!ready) { return; }
  if (rendering) {
    renderAgain = true;
    return;
  }
  rendering = true;
  try {
    do {
      renderAgain = false;
      await drawPreview();
    } while (renderAgain);
  } finally {
    rendering = false;
  }
}
async function drawPreview() {
  const st = $('#pv-status');
  st.textContent = 'Drawing…';
  await new Promise((r) => setTimeout(r, 0)); // let the status show
  const t0 = performance.now();
  try {
    const plan = enginePlan(project);
    pvPages = plan.pages;
    pvPage = Math.min(Math.max(1, pvPage), pvPages);
    // vector image (SVG): sharp at any zoom
    const be = new SvgBackend(plan.width, plan.height);
    engineDrawPage(project, pvPage, be);
    const box = $('#pv-svg');
    box.innerHTML = be.svg();
    const sv = box.firstElementChild;
    sv.removeAttribute('width');
    sv.removeAttribute('height');
    sv.dataset.ratio = plan.height / plan.width;
    resizeCanvas();
    $('#pv-page').textContent = T('Page {k} / {n}', { k: pvPage, n: pvPages });
    const pageSize = lenImperial() ? `${plan.width.toFixed(2)} × ${plan.height.toFixed(2)} in`
      : `${Math.round(plan.width * 25.4)} × ${Math.round(plan.height * 25.4)} mm`;
    st.textContent = `${T('Scale')} 1:${plan.scale}, ${pageSize}, ${((performance.now() - t0) / 1000).toFixed(1)} s` +
      (plan.plan && plan.plan.too_wide ? ' \u2014 ' + T('the log is wider than the page: choose landscape, A3 or Fit (Layout)') : '');
    dirtyPreview = false;
  } catch (e) {
    st.textContent = T('Error') + ': ' + (e.message || e);
  }
}
async function waitRender() {
  while (rendering) {
    await new Promise((r) => setTimeout(r, 100));
  }
}
async function exportPDF() {
  if (!ready) { return; }
  await waitRender();
  busy(true, 'Writing the PDF…');
  await new Promise((r) => setTimeout(r, 0));
  try {
    const n = enginePlan(project).pages;
    const bytes = await enginePdf(project);
    saveBytes(stubOf(project) + '.pdf', 'application/pdf', bytes);
    toast(T('PDF ready: {n} page(s)', { n }));
  } catch (e) {
    toast(T('Error') + ': ' + (e.message || e), 5000);
  } finally {
    busy(false);
  }
}
// All the information of a section: project, CSV tables for R, series, PDF, R script
async function exportFiles(p, prefix) {
  const out = await engineExport(p);
  const files = [];
  for (const [nm, data] of Object.entries(out)) {
    files.push({ name: prefix + nm, data: typeof data === 'string' ? enc.encode(data) : data });
  }
  // the images of the photos, in a photos folder
  for (const f of await photoFiles(p, prefix)) { files.push(f); }
  // the export already holds the project as written by the R package; add the app's copy only if missing
  const own = prefix + stubOf(p) + '.strata.json';
  if (!files.some((f) => f.name === own)) {
    files.push({ name: own, data: enc.encode(JSON.stringify(p, null, 2)) });
  }
  return files;
}
async function exportZip(all) {
  if (!ready) { return; }
  await waitRender();
  busy(true, 'Exporting\u2026');
  try {
    let files = [];
    if (all) {
      const used = new Set();
      for (const s of ws.sections) {
        let stub = stubOf(s.project);
        while (used.has(stub)) { stub += '_2'; }
        used.add(stub);
        files = files.concat(await exportFiles(normalise(s.project), stub + '/'));
      }
    } else {
      files = await exportFiles(project, '');
    }
    const zip = makeZip(files);
    const name = all ? 'Strativis_sections.zip' : stubOf(project) + '_export.zip';
    saveBytes(name, 'application/zip', zip);
    toast(T('Exported {n} files', { n: files.length }));
  } catch (e) {
    toast(T('Error') + ': ' + (e.message || e), 5000);
  } finally {
    busy(false);
  }
}

// Section, layout and colour forms ####
function bindForms() {
  for (const el of $$('[data-meta]')) {
    el.addEventListener('input', () => {
      project.meta[el.dataset.meta] = el.value;
      save();
      if (el.dataset.meta === 'title') { renderSections(); }
    });
  }
  for (const el of $$('[data-opt]')) {
    el.addEventListener('change', () => {
      const k = el.dataset.opt;
      let v = el.type === 'checkbox' ? el.checked : el.value;
      if (el.dataset.num !== undefined) {
        // empty (or 0) = automatic
        if (el.dataset.auto !== undefined && String(v).trim() === '') { v = '0'; }
        const r = parseNum(v);
        if (!r.ok || r.value === null) { // not a number: show the stored value again
          const old = project.options[el.dataset.opt];
          el.value = isNA(old) ? '' : (el.dataset.len !== undefined ? lenShow(old) : String(old));
          return;
        }
        v = r.value;
        if (el.dataset.len !== undefined) { v = v / lenFactor(); } // to inches
        if (el.dataset.min !== undefined) { v = Math.max(Number(el.dataset.min), v); }
        if (el.dataset.max !== undefined) { v = Math.min(Number(el.dataset.max), v); }
        el.value = el.dataset.len !== undefined ? lenShow(v) : (el.dataset.auto !== undefined && v === 0 ? '' : String(v));
      }
      project.options[k] = v;
      normalise(project);
      save();
      if (k === 'size_unit' || k === 'unit') { fillForms(); } // sizes in mm or inches, depth unit
      if (k === 'core') { renderAll(); return; } // levels become depths
      if (k === 'rose_bin') { renderRose(); }
      renderBeds();
      renderLithoColours();
    });
  }
}
// Drawing sizes (column widths, symbol size...) are stored in inches, as in R;
// they are shown in mm (SI, default) or inches, as chosen in the layout
const lenImperial = () => project.options.size_unit === 'in';
const lenFactor = () => (lenImperial() ? 1 : 25.4);
// mm to 0.1 mm, inches to 0.01 in
const lenShow = (inches) => (lenImperial() ? String(Math.round(inches * 100) / 100) : String(Math.round(inches * 254) / 10));
function fillForms() {
  for (const el of $$('.lu')) { el.textContent = lenImperial() ? '(in)' : '(mm)'; }
  for (const el of $$('.du')) { el.textContent = project.options.unit || 'm'; }
  const bl = $('#base-label');
  if (bl) { bl.textContent = isCore() ? 'Depth of the top' : 'Base level'; }
  for (const el of $$('[data-meta]')) { el.value = project.meta[el.dataset.meta] || ''; }
  for (const el of $$('[data-opt]')) {
    const v = project.options[el.dataset.opt];
    if (el.type === 'checkbox') {
      el.checked = !!v;
    } else {
      const s = isNA(v) || (el.dataset.auto !== undefined && Number(v) === 0) ? '' : (el.dataset.len !== undefined ? lenShow(v) : String(v));
      // keep a value from an older file that is not in the list
      if (el.tagName === 'SELECT' && s !== '' && ![...el.options].some((o) => o.value === s)) {
        const o = document.createElement('option');
        o.value = s;
        o.textContent = s;
        el.appendChild(o);
      }
      el.value = s;
    }
  }
}
function schemeColour(lith, scheme) {
  const sc = schemes[scheme || project.options.colours];
  return sc ? sc[lith] || null : null;
}
function bedColour(b) {
  if (!isNA(b.fill)) { return b.fill; }
  if (project.palette[b.lithology]) { return project.palette[b.lithology]; }
  return schemeColour(b.lithology) || '#ffffff';
}
function colourSource(b) {
  if (!isNA(b.fill)) { return 'own colour of this bed'; }
  if (project.palette[b.lithology]) { return T('colour of all {l} beds', { l: label(b.lithology) }); }
  return project.options.colours === 'none' ? T('no colour') : T('{s} scheme', { s: T(project.options.colours) });
}
function schemeChoices(lith) {
  return {
    conventional: schemes.conventional[lith], pastel: schemes.pastel[lith], grey: schemes.grey[lith]
  };
}
function renderLithoColours() {
  const ol = $('#litho-colours');
  if (!ol) { return; }
  ol.innerHTML = '';
  const used = [...new Set(project.beds.map((b) => b.lithology))];
  for (const l of used) {
    const own = project.palette[l];
    const col = own || schemeColour(l) || '#ffffff';
    const li = document.createElement('li');
    li.innerHTML = `<span class="sw" style="background:${col}"></span><span class="main"><div class="t1">${label(l)}</div>
      <div class="t2">${own ? T('own colour') + ' ' + own : T('{s} scheme', { s: T(project.options.colours) })}</div></span>`;
    if (own) {
      const rs = document.createElement('button');
      rs.className = 'small';
      rs.textContent = 'Reset';
      rs.addEventListener('click', (e) => {
        e.stopPropagation();
        delete project.palette[l];
        save();
        renderLithoColours();
        renderBeds();
      });
      li.appendChild(rs);
    }
    li.addEventListener('click', () => {
      openColourPicker({
        title: T('Colour of all {l} beds', { l: label(l) }), initial: col, schemes: schemeChoices(l),
        onPick: (hex) => {
          project.palette[l] = hex;
          save();
          renderLithoColours();
          renderBeds();
        }
      });
    });
    ol.appendChild(li);
  }
}

// Sections list ####
function renderSections() {
  const ol = $('#sec-list');
  ol.innerHTML = '';
  for (const s of ws.sections) {
    const p = s.project;
    const n = (p.beds || []).length;
    const top = n ? p.beds[n - 1].top : 0;
    const li = document.createElement('li');
    if (s.id === ws.current) { li.classList.add('sel'); }
    li.innerHTML = `<span class="main"><div class="t1">${escapeHtml(p.meta.title || T('Untitled'))}</div>
      <div class="t2">${T('{n} beds', { n })} \u00b7 ${fmt(top - (n ? p.beds[0].base : 0))} ${p.options.unit || 'm'}${p.meta.location ? ' \u00b7 ' + escapeHtml(p.meta.location) : ''}</div></span>`;
    if (s.id !== ws.current) {
      li.addEventListener('click', () => { switchSection(s.id); toast(T('Opened {x}', { x: p.meta.title || T('section') })); });
    }
    ol.appendChild(li);
  }
}
function duplicateSection() {
  const copy = JSON.parse(JSON.stringify(project));
  copy.meta.title = (copy.meta.title || T('Section')) + ' (' + T('copy') + ')';
  addSection(copy);
  toast('Section duplicated');
}
function deleteSection() {
  if (ws.sections.length < 2) {
    toast('This is the only section');
    return;
  }
  if (!confirm(T('Delete the section "{x}"? Save it as a file first if you need it.', { x: project.meta.title || '' }))) { return; }
  const gone = project.photos.slice();
  ws.sections = ws.sections.filter((s) => s.id !== ws.current);
  for (const ph of gone) { if (ph.file && !photoUsedElsewhere(ph.file)) { photoDel(ph.file).catch(() => {}); } }
  switchSection(ws.sections[0].id);
}

// Beds list: mini drawing, drag to reorder, insert anywhere ####
function bedSymbols(b) {
  return project.symbols.filter((s) => s.bed === b.id);
}
function insertBar(at) {
  const li = document.createElement('li');
  li.className = 'ins';
  const btn = document.createElement('button');
  btn.textContent = '+';
  btn.title = T('Insert a bed here');
  btn.setAttribute('aria-label', T('Insert a bed here'));
  btn.addEventListener('click', () => insertBed(at, Math.max(0, at - 1)));
  li.appendChild(btn);
  return li;
}
// Bed thumbnails drawn like the log replace the quick sketches a little later,
// a few at a time, so the list stays responsive
let thumbJobs = [];
let thumbRun = 0;
function drawThumbs() {
  const run = ++thumbRun;
  const jobs = thumbJobs;
  thumbJobs = [];
  let draw;
  try { draw = engineBedThumbs(project); } catch (e) { console.warn('thumbnails: ' + (e.message || e)); return; }
  // room for the drawing: the width of the first row's preview box
  const box = jobs.length ? jobs[0][1].parentElement : null;
  const maxW = Math.max(120, (box && box.clientWidth) || 300);
  let i = 0;
  const step = () => {
    if (run !== thumbRun) { return; } // the list was drawn again
    const t0 = performance.now();
    while (i < jobs.length && performance.now() - t0 < 30) {
      const [k, cv] = jobs[i++];
      if (cv.isConnected) {
        try { draw(k, cv, maxW, 64); } catch (e) { /* keep the sketch */ }
      }
    }
    if (i < jobs.length) { setTimeout(step, 0); }
  };
  setTimeout(step, 0);
}
// photos, measurements and Bouma divisions of a bed, for the bed list
function bedExtras(b) {
  const np = project.photos.filter((x) => x.bed === b.id).length;
  const no = project.orientations.filter((x) => x.bed === b.id).length;
  let s = '';
  if (!isNA(b.bouma) && b.bouma !== '') { const d = ['a', 'b', 'c', 'd', 'e'].filter((c) => String(b.bouma).toLowerCase().replace(/t/g, '').includes(c)); if (d.length) { s += ' \u00b7 Bouma T' + d.join(''); } }
  if (!isNA(b.dip)) { s += ' \u00b7 ' + T('dip') + ' ' + fmt(b.dip) + '\u00b0' + (isNA(b.dip_dir) ? '' : '/' + fmt(b.dip_dir)); }
  if (no) { s += ' \u00b7 ' + T(no > 1 ? '{n} measurements' : '{n} measurement', { n: no }); }
  if (np) { s += ' \u00b7 ' + T(np > 1 ? '{n} photos' : '{n} photo', { n: np }); }
  return s;
}
function renderBeds() {
  const ol = $('#bed-list');
  ol.innerHTML = '';
  thumbJobs = [];
  const n = project.beds.length;
  ol.appendChild(insertBar(n));
  for (let k = n - 1; k >= 0; k--) {
    const b = project.beds[k];
    const li = document.createElement('li');
    li.className = 'bed';
    li.dataset.k = k;
    if (k === selBed) { li.classList.add('sel'); }
    const ns = bedSymbols(b).length;
    li.innerHTML = `<span class="drag" title="${T('Drag to move')}" aria-label="${T('Drag to move')}">\u2261</span>
      <span class="main"><div class="t1">${k + 1}. ${label(b.lithology)} \u00b7 ${fmt(b.thickness)} ${project.options.unit}</div>
      <div class="t2">${isCore() ? T('depth') + ' ' + fmt(depthOf(b.top)) + '\u2013' + fmt(depthOf(b.base)) : fmt(b.base) + '\u2013' + fmt(b.top)} \u00b7 ${label(b.grain)} \u00b7 ${label(b.contact)}${ns ? ' \u00b7 ' + T(ns > 1 ? '{n} symbols' : '{n} symbol', { n: ns }) : ''}${bedExtras(b)}${isNA(b.description) ? '' : ' \u00b7 ' + escapeHtml(b.description)}</div></span>
      <span class="rowbtns"><button class="rb" data-a="dup" title="${T('Duplicate (copy on top of this bed)')}" aria-label="${T('Duplicate')}">\u29c9</button></span>
      <div class="thumb"><canvas class="mini"></canvas></div>`;
    drawMiniBed(li.querySelector('canvas'), b, bedColour(b), { scale: project.options.scale, nSymbols: ns, width: 140, height: 60 });
    thumbJobs.push([k, li.querySelector('canvas')]);
    const open = () => { if (justDragged) { return; } selBed = k; renderBeds(); openBed(k); };
    li.querySelector('.main').addEventListener('click', open);
    li.querySelector('.thumb').addEventListener('click', open);
    // press and move on the handle drags the bed at once
    li.querySelector('.drag').addEventListener('pointerdown', (e) => startDrag(e, li));
    li.querySelector('[data-a=dup]').addEventListener('click', () => { insertBed(k + 1, k, true, false); });
    // long press anywhere on the bed (not on its buttons) also picks it up
    li.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.rowbtns') || e.target.closest('.drag') || e.button > 0) { return; }
      const x0 = e.clientX, y0 = e.clientY;
      const cancel = () => {
        clearTimeout(timer);
        li.removeEventListener('pointermove', onMove);
        li.removeEventListener('pointerup', cancel);
        li.removeEventListener('pointercancel', cancel);
      };
      const onMove = (m) => { if (Math.abs(m.clientX - x0) > 8 || Math.abs(m.clientY - y0) > 8) { cancel(); } };
      const timer = setTimeout(() => {
        cancel();
        if (navigator.vibrate) { try { navigator.vibrate(30); } catch (err) { /* no vibration */ } }
        startDrag(e, li);
      }, 300);
      li.addEventListener('pointermove', onMove);
      li.addEventListener('pointerup', cancel);
      li.addEventListener('pointercancel', cancel);
    });
    ol.appendChild(li);
    ol.appendChild(insertBar(k));
  }
  drawThumbs();
  renderStats();
}

let drag = null;
let justDragged = false;
document.addEventListener('touchmove', (e) => { if (drag) { e.preventDefault(); } }, { passive: false });
function startDrag(e, li) {
  if (e.cancelable) { e.preventDefault(); }
  const ol = $('#bed-list');
  const items = Array.from(ol.querySelectorAll('li.bed'));
  ol.classList.add('dragging');
  const rects = items.map((x) => x.getBoundingClientRect());
  drag = { li, items, rects, from: items.indexOf(li), to: items.indexOf(li), y0: e.clientY, id: e.pointerId, moved: false };
  li.classList.add('lifted');
  try { li.setPointerCapture(e.pointerId); } catch (err) { /* pointer already released */ }
  li.addEventListener('pointermove', moveDrag);
  li.addEventListener('pointerup', endDrag);
  li.addEventListener('pointercancel', endDrag);
}
function moveDrag(e) {
  if (!drag || e.pointerId !== drag.id) { return; }
  const dy = e.clientY - drag.y0;
  if (Math.abs(dy) > 6) { drag.moved = true; }
  const r = drag.rects[drag.from];
  const mid = r.top + r.height / 2 + dy;
  let to = 0;
  for (let i = 0; i < drag.rects.length; i++) {
    if (i === drag.from) { continue; }
    const ri = drag.rects[i];
    if (mid > ri.top + ri.height / 2) { to = i < drag.from ? i + 1 : i; }
  }
  if (mid < drag.rects[0].top + drag.rects[0].height / 2) { to = 0; }
  drag.to = Math.max(0, Math.min(drag.items.length - 1, to));
  const h = r.height + 6;
  drag.items.forEach((x, i) => {
    if (i === drag.from) {
      x.style.transform = `translateY(${dy}px)`;
    } else if (drag.from < drag.to && i > drag.from && i <= drag.to) {
      x.style.transform = `translateY(${-h}px)`;
    } else if (drag.from > drag.to && i < drag.from && i >= drag.to) {
      x.style.transform = `translateY(${h}px)`;
    } else {
      x.style.transform = '';
    }
  });
  // keep the dragged bed in view
  const m = $('main').getBoundingClientRect();
  if (e.clientY < m.top + 40) { $('main').scrollTop -= 12; } else if (e.clientY > m.bottom - 40) { $('main').scrollTop += 12; }
}
function endDrag(e) {
  if (!drag) { return; }
  const { li, items, from, to, moved } = drag;
  li.removeEventListener('pointermove', moveDrag);
  li.removeEventListener('pointerup', endDrag);
  li.removeEventListener('pointercancel', endDrag);
  for (const x of items) { x.style.transform = ''; }
  li.classList.remove('lifted');
  $('#bed-list').classList.remove('dragging');
  drag = null;
  if (moved) {
    justDragged = true;
    setTimeout(() => { justDragged = false; }, 350);
  }
  if (to === from) { return; }
  // list shows the top bed first: list position i is bed n - 1 - i
  const n = project.beds.length;
  const bFrom = n - 1 - from;
  const bTo = n - 1 - to;
  const [movedBed] = project.beds.splice(bFrom, 1);
  project.beds.splice(bTo, 0, movedBed);
  project.options.stack = true;
  normalise(project);
  save();
  selBed = bTo;
  renderBeds();
  fillForms();
  toast(T('Bed moved to position {n}', { n: bTo + 1 }));
}

function renderSymbols() {
  const ol = $('#sym-list');
  ol.innerHTML = '';
  project.symbols.forEach((s, k) => {
    const b = project.beds.find((x) => x.id === s.bed);
    const li = document.createElement('li');
    li.innerHTML = `<span class="main"><div class="t1">${label(s.name)}</div>
      <div class="t2">${b ? T('on bed {n}', { n: project.beds.indexOf(b) + 1 }) + ' \u00b7 ' : ''}${T('at')} ${fmt(b && isCore() ? depthOf(s.dt) : s.dt)} \u00b7 ${T(s.column)}${Number(s.angle) ? ' \u00b7 ' + s.angle + '\u00b0' : ''}</div></span>`;
    li.addEventListener('click', () => openSymbolForm(s, b || null));
    ol.appendChild(li);
  });
  renderRose();
}
// Samples, data curves, CSV import and statistics ####
// CSV text -> {head, rows}; the separator is a tab, ; or , (a decimal comma
// works with tab or ; separators)
function parseCsvText(txt) {
  const lines = String(txt).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) { return { head: [], rows: [] }; }
  const first = lines[0];
  const sep = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
  const split = (l) => {
    const out = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) {
        if (c === '"') {
          if (l[i + 1] === '"') { cur += '"'; i++; } else { q = false; }
        } else { cur += c; }
      } else if (c === '"') { q = true; } else if (c === sep) { out.push(cur); cur = ''; } else { cur += c; }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  return { head: split(first), rows: lines.slice(1).map(split) };
}
const numOf = (s) => { const r = parseNum(s === undefined || s === null ? '' : s); return r.ok ? r.value : null; };
const findCol = (head, re) => head.findIndex((h) => re.test(h.trim()));
const LEVEL_RE = /^(dt|depth|level|height|position|pos|z|base|from|m|meters|metres|stratigraphic)\b/i;

function renderSamples() {
  const ol = $('#smp-list');
  if (!ol) { return; }
  ol.innerHTML = '';
  const order = project.samples.map((s, k) => k).sort((a, b) => Number(project.samples[b].dt) - Number(project.samples[a].dt));
  for (const k of order) {
    const s = project.samples[k];
    const li = document.createElement('li');
    li.innerHTML = `<span class="main"><div class="t1">${escapeHtml(s.id || T('(no label)'))}</div>
      <div class="t2">${isCore() ? T('depth') + ' ' : ''}${isNA(s.top) ? T('at') + ' ' + fmt(s.dt) : fmt(s.dt) + '–' + fmt(s.top)} ${project.options.unit}</div></span>`;
    li.addEventListener('click', () => openSample(k));
    ol.appendChild(li);
  }
}
function openSample(k) {
  const s = project.samples[k];
  const changed = () => { save(); renderSamples(); renderStats(); };
  openSheet('Sample', [
    { key: 'id', label: 'Label', full: true },
    { key: 'dt', label: T(isCore() ? 'Depth, or one end of the interval ({u})' : 'Level, or base of the interval ({u})', { u: project.options.unit }), type: 'number' },
    { key: 'top', label: isCore() ? 'Other end of the interval (empty: one depth)' : 'Top of the interval (empty: one level)', type: 'number' }
  ], s, [['Delete', () => { project.samples.splice(k, 1); changed(); closeSheet(); }, 'danger']], changed, { help: 'symbols' });
}
function addSample() {
  const n = project.beds.length;
  const top = n ? Number(project.beds[n - 1].top) : 0;
  project.samples.push({ id: 'S' + (project.samples.length + 1), dt: midLevel(), top: null });
  save();
  renderSamples();
  openSample(project.samples.length - 1);
}
function importSamplesCsv(txt) {
  const { head, rows } = parseCsvText(txt);
  let di = findCol(head, LEVEL_RE);
  const ii = findCol(head, /^(id|sample|name|label|code)/i);
  const ti = findCol(head, /^(top|to)\b/i);
  if (di < 0) { di = ii === 0 ? 1 : 0; }
  let n = 0;
  for (const r of rows) {
    const dt = numOf(r[di]);
    if (dt === null) { continue; }
    project.samples.push({ id: ii >= 0 ? r[ii] : 'S' + (project.samples.length + 1), dt, top: ti >= 0 ? numOf(r[ti]) : null });
    n++;
  }
  return n + ' samples';
}

function curveNames() { return [...new Set(project.curves.map((c) => c.name))]; }
const fmtV = (x) => (Number.isFinite(x) ? String(+x.toPrecision(4)) : '');
function renderCurves() {
  const ol = $('#crv-list');
  if (!ol) { return; }
  ol.innerHTML = '';
  for (const nm of curveNames()) {
    const rows = project.curves.filter((c) => c.name === nm);
    const v = rows.map((c) => Number(c.value)).filter(Number.isFinite);
    const d = rows.map((c) => Number(c.dt)).filter(Number.isFinite);
    const u = rows.find((c) => !isNA(c.unit) && c.unit !== '');
    const li = document.createElement('li');
    li.innerHTML = `<span class="main"><div class="t1">${escapeHtml(nm)}${u ? ' (' + escapeHtml(u.unit) + ')' : ''}</div>
      <div class="t2">${T('{n} values', { n: rows.length })} · ${fmt(Math.min(...d))}–${fmt(Math.max(...d))} ${project.options.unit} · ${fmtV(Math.min(...v))} \u2013 ${fmtV(Math.max(...v))}</div></span>`;
    li.addEventListener('click', () => openCurve(nm));
    ol.appendChild(li);
  }
}
function openCurve(nm) {
  const rows = project.curves.filter((c) => c.name === nm);
  const u0 = rows.find((c) => !isNA(c.unit) && c.unit !== '');
  const obj = { name: nm, unit: u0 ? u0.unit : '', data: rows.map((c) => c.dt + '\t' + c.value).join('\n') };
  let cur = nm;
  const apply = () => {
    const pts = [];
    for (const line of String(obj.data || '').split(/\r?\n/)) {
      let parts = line.trim().split(/[\t; ]+/).filter(Boolean);
      if (parts.length === 1 && parts[0].includes(',')) { parts = parts[0].split(','); }
      if (parts.length >= 2) {
        const a = numOf(parts[0]), b = numOf(parts[1]);
        if (a !== null && b !== null) { pts.push({ dt: a, value: b }); }
      }
    }
    const name = String(obj.name || '').trim() || cur;
    const unit = String(obj.unit || '').trim() || null;
    project.curves = project.curves.filter((c) => c.name !== cur)
      .concat(pts.map((p) => ({ name, unit, dt: p.dt, value: p.value })));
    cur = name;
    save();
    renderCurves();
    renderStats();
  };
  openSheet('Data curve', [
    { key: 'name', label: 'Name (e.g. GR, MS, d13C)' },
    { key: 'unit', label: 'Unit (e.g. API, SI, ‰)' },
    { key: 'data', label: isCore() ? 'Values: one line per depth, "depth value" (separated by a tab, space or ;)' : 'Values: one line per level, "level value" (separated by a tab, space or ;)', type: 'textarea', full: true }
  ], obj, [['Delete curve', () => {
    project.curves = project.curves.filter((c) => c.name !== cur);
    save(); renderCurves(); renderStats(); closeSheet();
  }, 'danger']], apply, { help: 'symbols' });
}
function importCurvesCsv(txt) {
  const { head, rows } = parseCsvText(txt);
  if (head.length < 2) { throw new Error(T('the file needs a level column and at least one value column')); }
  let li = findCol(head, LEVEL_RE);
  if (li < 0) { li = 0; }
  const added = [];
  for (let j = 0; j < head.length; j++) {
    if (j === li) { continue; }
    const m = head[j].match(/^(.*?)\s*[([]\s*(.*?)\s*[)\]]\s*$/);
    const name = ((m ? m[1] : head[j]) || '').trim() || T('Curve') + ' ' + j;
    const unit = m ? m[2] : null;
    const pts = [];
    for (const r of rows) {
      const a = numOf(r[li]), b = numOf(r[j]);
      if (a !== null && b !== null) { pts.push({ name, unit, dt: a, value: b }); }
    }
    if (pts.length > 0) {
      project.curves = project.curves.filter((c) => c.name !== name).concat(pts);
      added.push(name + ' (' + pts.length + ')');
    }
  }
  if (added.length === 0) { throw new Error(T('no numbers found')); }
  return T('curves') + ' ' + added.join(', ');
}
// Beds from a CSV file with the columns of "Export beds (CSV)" (thickness, or base and top)
function importBedsCsv(txt) {
  const { head, rows } = parseCsvText(txt);
  const h = head.map((x) => x.trim().toLowerCase().replace(/\s+/g, '_'));
  const alias = { from: 'base', to: 'top', lith: 'lithology', grain_size: 'grain', contact_type: 'contact' };
  const cols = h.map((x) => alias[x] || x);
  if (!cols.includes('thickness') && !(cols.includes('base') && cols.includes('top'))) {
    throw new Error(T('the file needs a thickness column, or base and top columns'));
  }
  const numeric = ['thickness', 'base', 'top', 'relief', 'fault_angle'];
  const beds = [];
  for (const r of rows) {
    const b = {};
    cols.forEach((c, j) => {
      if (!BED_FIELDS.includes(c)) { return; }
      const v = r[j] === undefined || r[j] === '' || r[j] === 'NA' ? null : r[j];
      b[c] = numeric.includes(c) ? (v === null ? null : numOf(v)) : v;
    });
    if (isNA(b.thickness) && !isNA(b.base) && !isNA(b.top)) { b.thickness = b.top - b.base; }
    if (!isNA(b.thickness) && b.thickness > 0) { beds.push(b); }
  }
  if (beds.length === 0) { throw new Error(T('no beds with a thickness')); }
  if (beds.every((b) => !isNA(b.base))) { beds.sort((a, b) => a.base - b.base); }
  if (project.beds.length > 0 && !confirm(T('Replace the {a} beds of this section by the {b} beds of the file?', { a: project.beds.length, b: beds.length }))) {
    return null;
  }
  for (const b of beds) { b.id = null; }
  project.beds = beds;
  project.options.stack = true;
  if (!isNA(beds[0].base)) { project.options.base = beds[0].base; }
  normalise(project);
  return beds.length + ' beds';
}
async function exportSVG() {
  if (!ready) { return; }
  await waitRender();
  busy(true, 'Writing SVG…');
  await new Promise((r) => setTimeout(r, 0));
  try {
    const plan = enginePlan(project);
    const files = [];
    for (let k = 1; k <= plan.pages; k++) {
      const be = new SvgBackend(plan.width, plan.height);
      engineDrawPage(project, k, be);
      files.push({ name: stubOf(project) + (plan.pages > 1 ? '_page' + k : '') + '.svg', data: enc.encode('<?xml version="1.0" encoding="UTF-8"?>\n' + be.svg()) });
    }
    if (files.length === 1) {
      saveBytes(files[0].name, 'image/svg+xml', files[0].data);
    } else {
      saveBytes(stubOf(project) + '_svg.zip', 'application/zip', makeZip(files));
    }
    toast(T('SVG ready: {n} page(s)', { n: files.length }));
  } catch (e) {
    toast(T('Error') + ': ' + (e.message || e), 5000);
  } finally {
    busy(false);
  }
}
function renderStats() {
  const el = $('#stats');
  if (!el) { return; }
  const b = project.beds;
  const u = project.options.unit || 'm';
  if (b.length === 0) { el.innerHTML = '<p class="hint">No beds yet.</p>'; return; }
  const th = b.map((x) => Number(x.thickness) || 0);
  const tot = th.reduce((a, c) => a + c, 0);
  const s = th.slice().sort((a, c) => a - c);
  const med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  const per = {};
  b.forEach((x, k) => {
    const l = x.lithology || 'none';
    per[l] = per[l] || { t: 0, n: 0 };
    per[l].t += th[k];
    per[l].n += 1;
  });
  const rows = Object.entries(per).sort((a, c) => c[1].t - a[1].t)
    .map(([l, v]) => `<tr><td>${escapeHtml(label(l))}</td><td>${fmt(v.t)}</td><td>${(100 * v.t / tot).toFixed(1)}</td><td>${v.n}</td></tr>`).join('');
  el.innerHTML = `<p>${T('{n} beds, {tot} {u} in total. Bed thickness: mean {mean}, median {med}, thinnest {min}, thickest {max} {u}.', { n: b.length, tot: fmt(tot), u, mean: fmt(tot / b.length), med: fmt(med), min: fmt(s[0]), max: fmt(s[s.length - 1]) })}
    ${T('Samples: {a}, data curves: {b}, orientation measurements: {c}, photos: {d}.', { a: project.samples.length, b: curveNames().length, c: project.orientations.length, d: project.photos.length })}</p>
    <table class="stats"><tr><th>${T('Lithology')}</th><th>${escapeHtml(u)}</th><th>%</th><th>${T('beds')}</th></tr>${rows}</table>`;
}

// Core logs: levels are depths that increase downwards ####
const isCore = () => project.options.core === true;
const lvlWord = () => T(isCore() ? 'Depth' : 'Level');
// depth of a height of the stacked beds (core logs)
function depthOf(h) {
  const n = project.beds.length;
  const T = n ? Number(project.beds[n - 1].top) : 0;
  return (Number(project.options.base) || 0) + T - Number(h);
}
// a level in the middle of the section, in the units the user types
function midLevel() {
  const n = project.beds.length;
  const T = n ? Number(project.beds[n - 1].top) : 0;
  const B = n ? Number(project.beds[0].base) : 0;
  const v = isCore() ? (Number(project.options.base) || 0) + (T - B) / 2 : (B + T) / 2;
  return Math.round(v * 100) / 100;
}

// Photos ####
// The images stay on the phone (IndexedDB); the section holds their bed,
// position, caption and file name. They are added to the ZIP exports.
function photoDb() {
  return new Promise((res, rej) => {
    const rq = indexedDB.open('strativis-photos', 1);
    rq.onupgradeneeded = () => { rq.result.createObjectStore('photos'); };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
async function photoPut(key, blob) {
  const db = await photoDb();
  return new Promise((res, rej) => {
    const tx = db.transaction('photos', 'readwrite');
    tx.objectStore('photos').put(blob, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function photoGet(key) {
  const db = await photoDb();
  return new Promise((res, rej) => {
    const rq = db.transaction('photos').objectStore('photos').get(key);
    rq.onsuccess = () => res(rq.result || null);
    rq.onerror = () => rej(rq.error);
  });
}
async function photoDel(key) {
  const db = await photoDb();
  return new Promise((res, rej) => {
    const tx = db.transaction('photos', 'readwrite');
    tx.objectStore('photos').delete(key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
// a JPEG of at most 1600 px on its longest side
async function shrinkImage(file, max = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('not an image'));
      i.src = url;
    });
    const f = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * f));
    c.height = Math.max(1, Math.round(img.naturalHeight * f));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob((b) => res(b), 'image/jpeg', 0.85));
  } finally {
    URL.revokeObjectURL(url);
  }
}
function nextPhotoId() {
  let mx = 0;
  for (const ph of project.photos) {
    const m = /^P(\d+)$/.exec(ph.id || '');
    if (m) { mx = Math.max(mx, Number(m[1])); }
  }
  return 'P' + (mx + 1);
}
const bedPhotos = (b) => project.photos.filter((ph) => ph.bed === b.id);
function photoUsedElsewhere(file) {
  return ws.sections.some((s) => (s.project.photos || []).some((x) => x.file === file));
}
async function removePhotos(list) {
  const files = list.map((ph) => ph.file);
  project.photos = project.photos.filter((ph) => !list.includes(ph));
  for (const f of files) {
    if (f && !photoUsedElsewhere(f)) { await photoDel(f).catch(() => {}); }
  }
}
function photoBlock(b, onChange) {
  const box = document.createElement('div');
  box.className = 'sym-block';
  const head = document.createElement('div');
  head.className = 'row-head';
  head.innerHTML = '<h3>Photos of this bed</h3><span class="spacer"></span>';
  const add = document.createElement('button');
  add.className = 'small';
  add.textContent = '+ Photo';
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  inp.className = 'hidden';
  head.append(add, inp);
  box.appendChild(head);
  const strip = document.createElement('div');
  strip.className = 'photo-strip';
  box.appendChild(strip);
  const urls = [];
  const fill = async () => {
    for (const u of urls.splice(0)) { URL.revokeObjectURL(u); }
    strip.innerHTML = '';
    const list = bedPhotos(b);
    if (list.length === 0) {
      strip.innerHTML = '<span class="hint">Outcrop photos (camera or gallery), shown as camera symbols in a Photos column of the log.</span>';
      return;
    }
    for (const ph of list) {
      const fig = document.createElement('figure');
      const img = document.createElement('img');
      img.alt = ph.id;
      const blob = await photoGet(ph.file).catch(() => null);
      if (blob) { const u = URL.createObjectURL(blob); urls.push(u); img.src = u; }
      const cap = document.createElement('figcaption');
      cap.textContent = ph.id + (ph.caption ? ' · ' + ph.caption : '');
      fig.append(img, cap);
      fig.addEventListener('click', () => openPhoto(ph, blob, () => { fill(); onChange(); }));
      strip.appendChild(fig);
    }
  };
  add.addEventListener('click', () => inp.click());
  inp.addEventListener('change', async () => {
    const f = inp.files[0];
    inp.value = '';
    if (!f) { return; }
    busy(true, 'Saving the photo…');
    try {
      const blob = await shrinkImage(f);
      const id = nextPhotoId();
      const file = 'photo_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '.jpg';
      await photoPut(file, blob);
      project.photos.push({ id, bed: b.id, pos: 0.5, dt: null, caption: '', file });
      save();
      onChange();
      await fill();
      toast(T('Photo {id} added', { id }));
    } catch (e) {
      toast(T('Could not add the photo') + ': ' + (e.message || e), 5000);
    } finally {
      busy(false);
    }
  });
  fill();
  return box;
}
function openPhoto(ph, blob, after) {
  const ov = document.createElement('div');
  ov.className = 'sheet picker';
  const url = blob ? URL.createObjectURL(blob) : '';
  ov.innerHTML = `<div class="sheet-body"><div class="row-head"><h2>${T('Photo')} ${escapeHtml(ph.id)}</h2><span class="spacer"></span>
    <button class="small" data-close>Done</button></div>
    ${url ? `<img class="photo-big" src="${url}" alt="">` : '<p class="hint">The image is not on this phone.</p>'}
    <div class="grid"><label class="full">Caption<input data-k="caption"></label>
    <label class="full">Position in the bed (base → top)<input data-k="pos" type="range" min="0" max="1" step="0.05"></label></div>
    <div class="actions"><button class="danger" data-del>Delete photo</button></div></div>`;
  const cap = ov.querySelector('[data-k=caption]');
  cap.value = ph.caption || '';
  const pos = ov.querySelector('[data-k=pos]');
  pos.value = isNA(ph.pos) ? 0.5 : ph.pos;
  cap.addEventListener('input', () => { ph.caption = cap.value; save(); });
  pos.addEventListener('input', () => { ph.pos = Number(pos.value); save(); });
  const close = () => { ov.remove(); if (url) { URL.revokeObjectURL(url); } if (after) { after(); } };
  ov.querySelector('[data-close]').addEventListener('click', close);
  ov.addEventListener('click', (e) => { if (e.target === ov) { close(); } });
  ov.querySelector('[data-del]').addEventListener('click', async () => {
    if (!confirm(T('Delete photo {id}?', { id: ph.id }))) { return; }
    await removePhotos([ph]);
    save();
    close();
  });
  document.body.appendChild(ov);
}
async function photoFiles(p, prefix) {
  const out = [];
  for (const ph of (p.photos || [])) {
    const blob = ph.file ? await photoGet(ph.file).catch(() => null) : null;
    if (blob) { out.push({ name: prefix + 'photos/' + ph.file, data: new Uint8Array(await blob.arrayBuffer()) }); }
  }
  return out;
}

// Palaeocurrents ####
function renderRose() {
  const el = $('#rose-box');
  if (!el) { return; }
  let r;
  try { r = engineRose(project); } catch (e) { el.textContent = T('Rose diagram') + ': ' + (e.message || e); return; }
  if (r.n === 0) {
    el.innerHTML = '<p class="hint">No palaeocurrents yet: transport symbols (ripples, channels, flutes…) with their direction as the angle, palaeocurrent measurements and cross-bedding dip directions.</p>';
    return;
  }
  try {
    el.innerHTML = `<div class="rose-wrap">${r.svg}</div>
      <p>n = ${r.n} · ${T('vector mean')} ${Math.round(r.mean)}° · ${T('consistency')} R = ${r.R.toFixed(2)}
      ${r.n >= 2 ? '' : '<br><span class="hint">The PDF shows the rose from 2 measurements.</span>'}</p>`;
    const sv = el.querySelector('svg');
    sv.removeAttribute('width');
    sv.removeAttribute('height');
    sv.style.width = '170px';
    sv.style.height = '170px';
  } catch (e) {
    el.textContent = T('Rose diagram') + ': ' + (e.message || e);
  }
}

// True thickness from a tape measurement and the bedding attitude ####
function trueThickness(len, az, slope, dip, dd) {
  const r = Math.PI / 180;
  return Math.abs(len * (Math.sin(dip * r) * Math.sin(dd * r) * Math.cos(slope * r) * Math.sin(az * r) +
    Math.sin(dip * r) * Math.cos(dd * r) * Math.cos(slope * r) * Math.cos(az * r) +
    Math.cos(dip * r) * Math.sin(slope * r)));
}
function openThicknessCalc(b, k) {
  let last = {};
  try { last = JSON.parse(localStorage.getItem('strativis.tt') || '{}') || {}; } catch (e) { last = {}; }
  // the bedding attitude measured in this bed, if any
  const bb = bedOrientations(b).find((o) => o.kind === 'bedding') || null;
  const v = {
    len: last.len ?? '', az: last.az ?? '', slope: last.slope ?? 0,
    dip: !isNA(b.dip) ? b.dip : (bb && !isNA(bb.dip) ? bb.dip : (last.dip ?? '')), dd: !isNA(b.dip_dir) ? b.dip_dir : (bb && !isNA(bb.dip_dir) ? bb.dip_dir : (last.dd ?? ''))
  };
  const ov = document.createElement('div');
  ov.className = 'sheet picker';
  ov.innerHTML = `<div class="sheet-body"><div class="row-head"><h2>True thickness</h2><span class="spacer"></span>
    <button class="small help" data-help="bed" aria-label="Help">?</button><button class="small" data-close>Close</button></div>
    <p class="hint">From a tape (or GPS) measurement across the beds and the bedding attitude.</p>
    <div class="grid">
      <label>${T('Measured length ({u})', { u: escapeHtml(project.options.unit) })}<input data-k="len" type="text" inputmode="decimal"></label>
      <label>Tape direction (°, azimuth towards younger beds)<input data-k="az" type="text" inputmode="decimal"></label>
      <label>Tape slope (°, + uphill)<input data-k="slope" type="text" inputmode="decimal"></label>
      <label>Bedding dip (°)<input data-k="dip" type="text" inputmode="decimal"></label>
      <label>Dip direction (°)<input data-k="dd" type="text" inputmode="decimal"></label>
    </div>
    <p class="tt-result"></p>
    <div class="actions"><button class="accent" data-use disabled>${T('Use as thickness of bed {n}', { n: k + 1 })}</button></div></div>`;
  const res = ov.querySelector('.tt-result');
  const use = ov.querySelector('[data-use]');
  let t = null;
  const calc = () => {
    const x = {};
    for (const key of ['len', 'az', 'slope', 'dip', 'dd']) { x[key] = numOf(ov.querySelector(`[data-k=${key}]`).value); }
    const ok = ['len', 'az', 'slope', 'dip', 'dd'].every((key) => x[key] !== null);
    t = ok ? trueThickness(x.len, x.az, x.slope, x.dip, x.dd) : null;
    res.textContent = ok ? T('True thickness: {x} {u}', { x: fmt(Math.round(t * 1000) / 1000), u: project.options.unit }) : T('Fill in all five values.');
    use.disabled = !ok || !(t > 0);
    try { localStorage.setItem('strativis.tt', JSON.stringify(x)); } catch (e) { /* no storage */ }
    return x;
  };
  for (const key of ['len', 'az', 'slope', 'dip', 'dd']) {
    const el = ov.querySelector(`[data-k=${key}]`);
    el.value = v[key] === null ? '' : String(v[key]);
    el.addEventListener('input', calc);
  }
  calc();
  ov.querySelector('[data-close]').addEventListener('click', () => ov.remove());
  ov.addEventListener('click', (e) => { if (e.target === ov) { ov.remove(); } });
  use.addEventListener('click', () => {
    const x = calc();
    if (!(t > 0)) { return; }
    b.thickness = Math.round(t * 1000) / 1000;
    b.dip = x.dip;
    b.dip_dir = x.dd;
    project.options.stack = true;
    normalise(project);
    save();
    renderBeds();
    ov.remove();
    openBed(k);
    toast(T('Thickness') + ' ' + fmt(b.thickness) + ' ' + project.options.unit);
  });
  document.body.appendChild(ov);
}

// Orientation measurements: strike and dip, trend and plunge ####
const ORI_KINDS = [
  ['bedding', 'Bedding'], ['cross_bedding', 'Cross-bedding (foresets)'], ['fault', 'Fault plane'],
  ['joint', 'Joint'], ['cleavage', 'Cleavage'], ['vein', 'Vein'], ['other_plane', 'Other plane'],
  ['lineation', 'Lineation'], ['fold_axis', 'Fold axis'], ['palaeocurrent', 'Palaeocurrent (direction)']
];
const LINE_KINDS = ['lineation', 'fold_axis', 'palaeocurrent'];
const isLineKind = (k) => LINE_KINDS.includes(k);
const oriLabel = (k) => T((ORI_KINDS.find((x) => x[0] === k) || [k, label(k)])[1]);
const mod360 = (v) => ((v % 360) + 360) % 360;
const az3 = (v) => (isNA(v) ? '–' : String(Math.round(mod360(Number(v))) % 360).padStart(3, '0'));
const deg = (v) => (isNA(v) ? '–' : String(Math.round(Number(v))));
// azimuth typed as 120, "N30E", "S45W", "SE" (16 compass points) or "120,5"
const POINTS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
function parseAz(s) {
  const t = String(s ?? '').trim().toUpperCase().replace(/\s+/g, '').replace(/°/g, '');
  if (t === '') { return null; }
  const q = /^([NS])(\d+(?:[.,]\d+)?)([EW])$/.exec(t);
  if (q) {
    const a = Number(q[2].replace(',', '.'));
    if (a > 90) { return NaN; }
    if (q[1] === 'N') { return q[3] === 'E' ? a : mod360(-a); }
    return q[3] === 'E' ? 180 - a : 180 + a;
  }
  const p = POINTS16.indexOf(t);
  if (p >= 0) { return p * 22.5; }
  const n = numOf(t);
  return n === null ? NaN : mod360(n);
}
function oriText(o) {
  if (o.kind === 'palaeocurrent') { return T('towards') + ' ' + az3(o.trend) + '\u00b0'; }
  if (isLineKind(o.kind)) { return deg(o.plunge) + '° → ' + az3(o.trend) + '°'; }
  return deg(o.dip) + '\u00b0 / ' + az3(o.dip_dir) + '\u00b0 (' + T('strike') + ' ' + az3(o.strike) + ')';
}
function nextOriId() {
  let mx = 0;
  for (const o of project.orientations) {
    const m = /^O(\d+)$/.exec(o.id || '');
    if (m) { mx = Math.max(mx, Number(m[1])); }
  }
  return 'O' + (mx + 1);
}
const bedOrientations = (b) => project.orientations.filter((o) => o.bed === b.id);
// level shown to the user: height, or depth in core logs
const shownLevel = (o) => (isCore() && !isNA(o.bed) ? depthOf(o.dt) : o.dt);
// the last kind measured, for the next one
let lastKind = 'bedding';
function newOrientation(bed, kind) {
  const o = { id: nextOriId(), dt: bed ? null : midLevel(), bed: bed ? bed.id : null, pos: bed ? 0.5 : null,
    kind: kind || lastKind, strike: null, dip: null, dip_dir: null, trend: null, plunge: null, note: null };
  const prev = project.orientations.filter((x) => isNA(x.bed));
  if (!bed && prev.length) { o.dt = prev[prev.length - 1].dt; }
  return o;
}
function oriChanged() {
  normalise(project);
  save();
  renderOrientations();
  renderBeds();
}
function oriBlock(b, onChange) {
  const box = document.createElement('div');
  box.className = 'sym-block';
  const head = document.createElement('div');
  head.className = 'row-head';
  head.innerHTML = '<h3>Orientations in this bed</h3><span class="spacer"></span>';
  const meas = document.createElement('button');
  meas.className = 'small';
  meas.textContent = 'Measure';
  const add = document.createElement('button');
  add.className = 'small';
  add.textContent = '+ Type in';
  head.append(meas, add);
  box.appendChild(head);
  const chips = document.createElement('div');
  chips.className = 'chips';
  box.appendChild(chips);
  const fill = () => {
    chips.innerHTML = '';
    const list = bedOrientations(b);
    if (list.length === 0) {
      chips.innerHTML = '<span class="hint">Strike and dip of the bedding, cross-beds, faults, joints; lineations; palaeocurrents.</span>';
    }
    for (const o of list) {
      const c = document.createElement('span');
      c.className = 'chip tap';
      c.textContent = oriLabel(o.kind) + ' ' + oriText(o);
      c.addEventListener('click', () => openOrientation(o, () => { fill(); onChange(); }));
      chips.appendChild(c);
    }
  };
  add.addEventListener('click', () => {
    const o = newOrientation(b);
    project.orientations.push(o);
    oriChanged();
    openOrientation(o, () => { fill(); onChange(); });
  });
  meas.addEventListener('click', () => {
    openCompass({ kind: lastKind, bed: b, after: () => { fill(); onChange(); } });
  });
  fill();
  return box;
}
function renderOrientations() {
  const ol = $('#ori-list');
  if (!ol) { return; }
  ol.innerHTML = '';
  const order = project.orientations.map((o, k) => k)
    .sort((a, c) => Number(project.orientations[c].dt) - Number(project.orientations[a].dt));
  for (const k of order) {
    const o = project.orientations[k];
    const b = project.beds.find((x) => x.id === o.bed);
    const li = document.createElement('li');
    li.innerHTML = `<span class="main"><div class="t1">${escapeHtml(o.id || '')} · ${escapeHtml(oriLabel(o.kind))} ${oriText(o)}</div>
      <div class="t2">${b ? T('bed {n}', { n: project.beds.indexOf(b) + 1 }) + ' · ' : ''}${lvlWord().toLowerCase()} ${fmt(shownLevel(o))} ${project.options.unit}${isNA(o.note) ? '' : ' · ' + escapeHtml(o.note)}</div></span>`;
    li.addEventListener('click', () => openOrientation(o));
    ol.appendChild(li);
  }
  renderOriPlots();
}
function sizeSvg(el, px) {
  const sv = el.querySelector('svg');
  if (!sv) { return; }
  sv.removeAttribute('width');
  sv.removeAttribute('height');
  sv.style.width = px + 'px';
  sv.style.height = px + 'px';
}
function renderOriPlots() {
  const sb = $('#stereo-box');
  if (sb) {
    try {
      const s = engineStereonet(project);
      sb.innerHTML = s.planes + s.lines === 0
        ? '<p class="hint">No planes or lines yet.</p>'
        : `${s.svg}<p>${T('{a} poles to planes, {b} lines', { a: s.planes, b: s.lines })}</p>`;
      sizeSvg(sb, 170);
    } catch (e) {
      sb.textContent = T('Stereonet') + ': ' + (e.message || e);
    }
  }
  renderRose();
  const st = $('#ori-stats');
  if (st) {
    let rows = [];
    try { rows = engineOrientationStats(project); } catch (e) { rows = []; }
    st.innerHTML = rows.filter((r) => r.kind !== 'palaeocurrent').map((r) => r.type === 'plane'
      ? T('Mean {k}: dip {d}° towards {dd}° (strike {s})', { k: escapeHtml(oriLabel(r.kind).toLowerCase()), d: deg(r.dip), dd: az3(r.dip_dir), s: az3(r.dip_dir - 90) }) + `, n = ${r.n}${r.n > 1 ? ', R = ' + r.R.toFixed(2) : ''}`
      : T('Mean {k}: plunge {p}° towards {t}°', { k: escapeHtml(oriLabel(r.kind).toLowerCase()), p: deg(r.plunge), t: az3(r.trend) }) + `, n = ${r.n}${r.n > 1 ? ', R = ' + r.R.toFixed(2) : ''}`).join('<br>');
  }
}
function openOrientation(o, after) {
  const ov = document.createElement('div');
  ov.className = 'sheet picker';
  const bed = project.beds.find((x) => x.id === o.bed) || null;
  const line = isLineKind(o.kind);
  const kindOpts = ORI_KINDS.map(([v, t]) => `<option value="${v}">${escapeHtml(t)}</option>`).join('');
  ov.innerHTML = `<div class="sheet-body"><div class="row-head"><h2>${T('Orientation')} ${escapeHtml(o.id || '')}</h2><span class="spacer"></span>
    <button class="small help" data-help="orientations" aria-label="Help">?</button><button class="small" data-close>Done</button></div>
    <div class="actions"><button class="accent" data-measure>Measure with phone</button><button class="danger" data-del>Delete</button></div>
    <div class="grid">
      <label class="full">Kind<select data-k="kind">${kindOpts}</select></label>
      ${bed ? `<label class="full">${T('Position in bed {n} (base → top)', { n: project.beds.indexOf(bed) + 1 })}<input data-k="pos" type="range" min="0" max="1" step="0.05"></label>`
        : `<label class="full">${lvlWord()} (${escapeHtml(project.options.unit)})<input data-k="dt" type="text" inputmode="decimal" autocomplete="off"></label>`}
      ${line ? `<label>Trend (° azimuth)<input data-k="trend" type="text" autocomplete="off"></label>
        ${o.kind === 'palaeocurrent' ? '' : '<label>Plunge (°)<input data-k="plunge" type="text" inputmode="decimal" autocomplete="off"></label>'}`
        : `<label>Strike (°, right-hand rule)<input data-k="strike" type="text" autocomplete="off"></label>
        <label>Dip (°)<input data-k="dip" type="text" inputmode="decimal" autocomplete="off"></label>
        <label>Dip direction (° or SE…)<input data-k="dip_dir" type="text" autocomplete="off"></label>`}
      <label class="full">Note<input data-k="note" type="text"></label>
    </div>
    <p class="hint">Azimuths in degrees from true north (0–360), or N30E, S45W, SE… The strike follows the right-hand rule: the bed dips to the right of it, so dip direction = strike + 90°.</p></div>`;
  const q = (k) => ov.querySelector(`[data-k=${k}]`);
  const show = () => {
    for (const k of ['strike', 'dip', 'dip_dir', 'trend', 'plunge']) {
      const el = q(k);
      if (el && document.activeElement !== el) { el.value = isNA(o[k]) ? '' : fmt(o[k]); }
    }
  };
  q('kind').value = o.kind;
  q('note').value = isNA(o.note) ? '' : o.note;
  if (bed) { q('pos').value = isNA(o.pos) ? 0.5 : o.pos; } else { q('dt').value = isNA(o.dt) ? '' : fmt(o.dt); }
  show();
  q('kind').addEventListener('change', () => {
    o.kind = q('kind').value;
    lastKind = o.kind;
    if (o.kind === 'palaeocurrent') { o.plunge = null; }
    oriChanged();
    ov.remove();
    openOrientation(o, after);
  });
  q('note').addEventListener('input', () => { o.note = q('note').value || null; save(); });
  if (bed) {
    q('pos').addEventListener('input', () => { o.pos = Number(q('pos').value); oriChanged(); });
  } else {
    q('dt').addEventListener('input', () => { const v = numOf(q('dt').value); if (v !== null) { o.dt = v; oriChanged(); } });
  }
  const angle = (k, isAz, max) => {
    const el = q(k);
    if (!el) { return; }
    el.addEventListener('input', () => {
      const v = isAz ? parseAz(el.value) : numOf(el.value);
      if (v === null) { o[k] = null; } else if (Number.isNaN(v)) { return; } else { o[k] = isAz ? v : Math.min(Math.max(v, 0), max); }
      // strike and dip direction follow each other (right-hand rule)
      if (k === 'strike') { o.dip_dir = isNA(o.strike) ? o.dip_dir : mod360(o.strike + 90); }
      if (k === 'dip_dir') { o.strike = isNA(o.dip_dir) ? o.strike : mod360(o.dip_dir - 90); }
      show();
      oriChanged();
    });
    el.addEventListener('change', () => { el.value = isNA(o[k]) ? '' : fmt(o[k]); });
  };
  angle('strike', true);
  angle('dip_dir', true);
  angle('trend', true);
  angle('dip', false, 90);
  angle('plunge', false, 90);
  const close = () => { ov.remove(); if (after) { after(); } };
  ov.querySelector('[data-close]').addEventListener('click', close);
  ov.addEventListener('click', (e) => { if (e.target === ov) { close(); } });
  ov.querySelector('[data-del]').addEventListener('click', () => {
    if (!confirm(T('Delete this measurement?'))) { return; }
    project.orientations = project.orientations.filter((x) => x !== o);
    oriChanged();
    close();
  });
  ov.querySelector('[data-measure]').addEventListener('click', () => {
    ov.remove();
    openCompass({ kind: o.kind, target: o, after: () => openOrientation(o, after) });
  });
  document.body.appendChild(ov);
}

// Compass-clinometer with the phone's orientation sensor ####
// W3C device orientation (alpha, beta, gamma, degrees) -> the device axes in
// east-north-up coordinates: x to the right of the screen, y to its top, z
// out of the screen.
function deviceAxes(a, b, g) {
  const r = Math.PI / 180;
  const cA = Math.cos(a * r), sA = Math.sin(a * r), cB = Math.cos(b * r), sB = Math.sin(b * r);
  const cG = Math.cos(g * r), sG = Math.sin(g * r);
  return {
    x: [cA * cG - sA * sB * sG, sA * cG + cA * sB * sG, -cB * sG],
    y: [-sA * cB, cA * cB, sB],
    z: [cA * sG + sA * sB * cG, sA * sG - cA * sB * cG, cB * cG]
  };
}
const azOf = (v) => mod360(Math.atan2(v[0], v[1]) * 180 / Math.PI);
/**
 * Reading for a kind of measurement from the mean device axes:
 * planes: the phone lies on the surface (screen up or down);
 * lines: the long edge of the phone lies along the line;
 * palaeocurrents: the phone lies flat, its top pointing down the current.
 */
function compassReading(ax, kind, decl) {
  if (kind === 'palaeocurrent') {
    return { trend: mod360(azOf(ax.y) + decl) };
  }
  if (isLineKind(kind)) {
    let v = ax.y;
    if (v[2] > 0) { v = v.map((c) => -c); } // the downward end of the line
    const L = Math.hypot(...v);
    return { plunge: Math.asin(Math.min(1, -v[2] / L)) * 180 / Math.PI, trend: mod360(azOf(v) + decl) };
  }
  let n = ax.z;
  if (n[2] < 0) { n = n.map((c) => -c); } // upward normal: tilts towards the dip direction
  const L = Math.hypot(...n);
  const dip = Math.acos(Math.min(1, n[2] / L)) * 180 / Math.PI;
  const dd = mod360(azOf(n) + decl);
  return { dip, dip_dir: dd, strike: mod360(dd - 90) };
}
function compassSvg(rd, kind) {
  const az = kind === 'palaeocurrent' || isLineKind(kind) ? rd.trend : rd.dip_dir;
  const tilt = kind === 'palaeocurrent' ? null : (isLineKind(kind) ? rd.plunge : rd.dip);
  const r = Math.PI / 180;
  const tx = 60 + 46 * Math.sin(az * r), ty = 60 - 46 * Math.cos(az * r);
  const ticks = [];
  for (let k = 0; k < 360; k += 30) {
    const l = k % 90 === 0 ? 8 : 4;
    ticks.push(`<line x1="${60 + 52 * Math.sin(k * r)}" y1="${60 - 52 * Math.cos(k * r)}" x2="${60 + (52 - l) * Math.sin(k * r)}" y2="${60 - (52 - l) * Math.cos(k * r)}" stroke="#555" stroke-width="1"/>`);
  }
  // the bar of the dip scale (0 to 90 degrees)
  const bar = tilt === null ? '' : `<rect x="128" y="8" width="10" height="104" fill="none" stroke="#555"/>
    <rect x="128" y="${8 + 104 * (1 - Math.min(90, tilt) / 90)}" width="10" height="${104 * Math.min(90, tilt) / 90}" fill="#c0392b"/>
    <text x="133" y="122" font-size="9" text-anchor="middle">${deg(tilt)}°</text>`;
  return `<svg viewBox="0 0 150 128" width="210" height="180"><circle cx="60" cy="60" r="52" fill="#fff" stroke="#333"/>
    ${ticks.join('')}<text x="60" y="20" font-size="11" text-anchor="middle" font-weight="bold">N</text>
    <line x1="60" y1="60" x2="${tx}" y2="${ty}" stroke="#c0392b" stroke-width="4" stroke-linecap="round"/>
    <circle cx="60" cy="60" r="4" fill="#333"/>${bar}</svg>`;
}
/**
 * Measures with the phone. kind: the kind of measurement; target: the
 * measurement to fill in (else new ones are added, attached to bed if
 * given, else at a level typed in the sheet); after: called on closing.
 */
function openCompass({ kind = 'bedding', target = null, bed = null, after = null } = {}) {
  const ov = document.createElement('div');
  ov.className = 'sheet picker compass';
  const kindOpts = ORI_KINDS.map(([v, t]) => `<option value="${v}">${escapeHtml(t)}</option>`).join('');
  const where = target ? T('measurement {id}', { id: escapeHtml(target.id || '') }) : bed ? T('bed {n}', { n: project.beds.indexOf(bed) + 1 }) : '';
  ov.innerHTML = `<div class="sheet-body"><div class="row-head"><h2>${T('Measure')}${where ? ' · ' + where : ''}</h2><span class="spacer"></span>
    <button class="small help" data-help="orientations" aria-label="Help">?</button><button class="small" data-close>Close</button></div>
    <div class="grid">
      <label class="full">Kind<select data-k="kind" ${target ? 'disabled' : ''}>${kindOpts}</select></label>
      ${target || bed ? '' : `<label class="full">${lvlWord()} (${escapeHtml(project.options.unit)})<input data-k="dt" type="text" inputmode="decimal" autocomplete="off"></label>`}
    </div>
    <p class="hint" data-how></p>
    <div class="compass-view"><div data-dial></div><div class="compass-read"><div class="big" data-read>–</div><div data-state class="hint">Waiting for the sensor…</div></div></div>
    <div class="actions"><button data-hold>Hold</button><button class="accent" data-use disabled>Save</button>${target ? '' : '<button data-next disabled>Save &amp; next</button>'}</div>
    <p class="hint">${T('Declination {d}° is added to the compass (Layout).', { d: fmt(Number(project.options.declination) || 0) })} ${T('Keep the phone away from the hammer, magnets and steel; calibrate the compass by waving the phone in a figure 8 if the direction drifts.')}</p></div>`;
  const q = (k) => ov.querySelector(`[data-k=${k}]`);
  const kindSel = q('kind');
  kindSel.value = target ? target.kind : kind;
  const lvl = q('dt');
  if (lvl) {
    const prev = project.orientations.filter((x) => isNA(x.bed));
    lvl.value = fmt(prev.length ? prev[prev.length - 1].dt : midLevel());
  }
  const how = () => {
    const k = kindSel.value;
    ov.querySelector('[data-how]').textContent = k === 'palaeocurrent'
      ? 'Hold the phone flat with its top pointing in the direction of the current.'
      : isLineKind(k) ? 'Lay the long edge of the phone along the line (lineation, fold axis), its top on the line.'
        : 'Lay the phone flat on the surface (bedding plane, foreset, fault, joint…), screen up or down, and hold it still.';
  };
  how();
  kindSel.addEventListener('change', () => { lastKind = kindSel.value; how(); hold = false; holdBtn.textContent = 'Hold'; });
  const decl = Number(project.options.declination) || 0;
  const buf = [];
  let reading = null;
  let hold = false;
  let absolute = true;
  let got = false;
  const holdBtn = ov.querySelector('[data-hold]');
  const useBtn = ov.querySelector('[data-use]');
  const nextBtn = ov.querySelector('[data-next]');
  const show = () => {
    if (!reading) { return; }
    const k = kindSel.value;
    ov.querySelector('[data-read]').textContent = k === 'palaeocurrent' ? T('towards') + ' ' + az3(reading.trend) + '°'
      : isLineKind(k) ? deg(reading.plunge) + '° → ' + az3(reading.trend) + '°'
        : deg(reading.dip) + '° / ' + az3(reading.dip_dir) + '°';
    ov.querySelector('[data-dial]').innerHTML = compassSvg(reading, k);
  };
  // a reading: the device axes in east-north-up coordinates
  const onAxes = (ax) => {
    if (hold) { return; }
    got = true;
    buf.push(ax);
    if (buf.length > 20) { buf.shift(); }
    // mean axes over the last readings (unit vectors summed)
    const mean = { x: [0, 0, 0], y: [0, 0, 0], z: [0, 0, 0] };
    for (const a of buf) { for (const c of ['x', 'y', 'z']) { for (let i = 0; i < 3; i++) { mean[c][i] += a[c][i]; } } }
    const k = kindSel.value;
    reading = compassReading(mean, k, decl);
    // steadiness: angle between the newest reading and the mean axis used
    const c = k === 'palaeocurrent' || isLineKind(k) ? 'y' : 'z';
    const m = mean[c], L = Math.hypot(...m);
    const dot = Math.abs((ax[c][0] * m[0] + ax[c][1] * m[1] + ax[c][2] * m[2]) / L);
    const spread = Math.acos(Math.min(1, dot)) * 180 / Math.PI;
    const st = ov.querySelector('[data-state]');
    st.textContent = T(spread < 1.5 && buf.length >= 10 ? 'Steady' : 'Hold still\u2026') +
      (absolute ? '' : ' \u00b7 ' + T('no compass: the direction is relative, type it in'));
    st.classList.toggle('ok', spread < 1.5 && buf.length >= 10);
    useBtn.disabled = false;
    if (nextBtn) { nextBtn.disabled = false; }
    show();
  };
  // browser sensor events (W3C device orientation)
  const onEvent = (e) => {
    if (native || e.alpha === null || e.beta === null || e.gamma === null) { return; }
    if (e.type === 'deviceorientation' && absEvents) { return; }
    if (e.type === 'deviceorientation' && e.absolute !== true) { absolute = false; }
    onAxes(deviceAxes(e.alpha, e.beta, e.gamma));
  };
  let absEvents = false;
  const onAbs = (e) => { if (!absEvents) { buf.length = 0; absolute = true; } absEvents = true; onEvent(e); };
  // the Android app: the rotation vector sensor, through the bridge
  const bridge = window.AndroidBridge && typeof window.AndroidBridge.startOrientation === 'function' ? window.AndroidBridge : null;
  let native = false;
  const startNative = () => {
    if (!bridge) { return false; }
    window.__strativisAxes = (x, y, z, abs) => { absolute = abs !== false; onAxes({ x, y, z }); };
    try { native = bridge.startOrientation() === true; } catch (e) { native = false; }
    return native;
  };
  const onVisible = () => { if (document.visibilityState === 'visible' && native) { startNative(); } };
  const start = async () => {
    document.addEventListener('visibilitychange', onVisible);
    if (startNative()) { return; }
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        await DeviceOrientationEvent.requestPermission();
      }
    } catch (e) { /* permission refused: the sensor stays silent */ }
    window.addEventListener('deviceorientationabsolute', onAbs);
    window.addEventListener('deviceorientation', onEvent);
    setTimeout(() => {
      if (!got && ov.isConnected) {
        ov.querySelector('[data-state]').textContent = 'No orientation sensor found: type the values in instead.';
      }
    }, 2500);
  };
  const stop = () => {
    document.removeEventListener('visibilitychange', onVisible);
    if (native) {
      try { bridge.stopOrientation(); } catch (e) { /* already stopped */ }
      window.__strativisAxes = null;
    }
    window.removeEventListener('deviceorientationabsolute', onAbs);
    window.removeEventListener('deviceorientation', onEvent);
  };
  holdBtn.addEventListener('click', () => {
    hold = !hold;
    holdBtn.textContent = hold ? 'Release' : 'Hold';
    ov.querySelector('[data-state]').textContent = hold ? 'Held' : 'Hold still…';
  });
  const store = () => {
    if (!reading) { return null; }
    const k = kindSel.value;
    lastKind = k;
    let o = target;
    if (!o) {
      o = newOrientation(bed, k);
      if (lvl) { const v = numOf(lvl.value); if (v !== null) { o.dt = v; } }
      project.orientations.push(o);
    }
    o.kind = k;
    o.note = isNA(o.note) ? (absolute ? 'phone' : 'phone, no compass') : o.note;
    const rd = compassReading(buf.reduce((s, a) => {
      for (const c of ['x', 'y', 'z']) { for (let i = 0; i < 3; i++) { s[c][i] += a[c][i]; } }
      return s;
    }, { x: [0, 0, 0], y: [0, 0, 0], z: [0, 0, 0] }), k, decl);
    const r1 = (v) => Math.round(v);
    if (k === 'palaeocurrent') {
      Object.assign(o, { trend: r1(rd.trend), plunge: null, strike: null, dip: null, dip_dir: null });
    } else if (isLineKind(k)) {
      Object.assign(o, { trend: r1(rd.trend), plunge: r1(rd.plunge), strike: null, dip: null, dip_dir: null });
    } else {
      Object.assign(o, { dip: r1(rd.dip), dip_dir: r1(rd.dip_dir) % 360, strike: r1(rd.strike) % 360, trend: null, plunge: null });
    }
    oriChanged();
    toast((o.id || '') + ' ' + oriLabel(k) + ' ' + oriText(o));
    return o;
  };
  const close = () => { stop(); ov.remove(); if (after) { after(); } };
  useBtn.addEventListener('click', () => { if (store()) { close(); } });
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (!store()) { return; }
      hold = false;
      holdBtn.textContent = 'Hold';
      buf.length = 0;
    });
  }
  ov.querySelector('[data-close]').addEventListener('click', close);
  document.body.appendChild(ov);
  start();
}

// Orientations from a CSV file: a level column and strike/dip/dip direction
// and/or trend/plunge columns, optionally a kind column
function importOrientationsCsv(txt) {
  const { head, rows } = parseCsvText(txt);
  const h = head.map((x) => x.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  const col = (re) => h.findIndex((x) => re.test(x));
  let di = findCol(head, LEVEL_RE);
  if (di < 0) { di = 0; }
  const ki = col(/^(kind|type|feature|structure)/);
  const si = col(/^strike/), pi = col(/^dip$|^dip_?angle|^dip_?\(/), ddi = col(/^(dip_?dir|dip_?azimuth|dipdir|azimuth|dd)/);
  const ti = col(/^(trend|direction|palaeo|paleo|current)/), pli = col(/^plunge/), ni = col(/^(note|comment|remark)/);
  const kinds = ORI_KINDS.map((k) => k[0]);
  let n = 0;
  for (const r of rows) {
    const dt = numOf(r[di]);
    if (dt === null) { continue; }
    let kind = ki >= 0 ? String(r[ki] || '').trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
    kind = kind === 'paleocurrent' ? 'palaeocurrent' : kind;
    const az = (j) => { if (j < 0) { return null; } const v = parseAz(r[j]); return v === null || Number.isNaN(v) ? null : v; };
    const o = { id: null, dt, bed: null, pos: null, kind: kinds.includes(kind) ? kind : (pli >= 0 || ti >= 0) && pi < 0 ? 'lineation' : 'bedding',
      strike: az(si), dip: pi >= 0 ? numOf(r[pi]) : null, dip_dir: az(ddi), trend: az(ti), plunge: pli >= 0 ? numOf(r[pli]) : null,
      note: ni >= 0 && r[ni] ? r[ni] : null };
    if (isNA(o.dip_dir) && !isNA(o.strike)) { o.dip_dir = mod360(o.strike + 90); }
    if (isNA(o.strike) && !isNA(o.dip_dir)) { o.strike = mod360(o.dip_dir - 90); }
    if (o.kind === 'palaeocurrent' && isNA(o.trend)) { continue; }
    o.id = nextOriId();
    project.orientations.push(o);
    n++;
  }
  return T('{n} orientation measurements', { n });
}
function renderUnits() {
  const ol = $('#unit-list');
  ol.innerHTML = '';
  // by rank (Group, Formation, Member, Bed...), then from the top down; lower
  // ranks indented under the higher ones
  const rk = (u) => { const r = unitRank(u.level); return Number.isNaN(r) ? 99 : r; };
  const ranks = [...new Set(project.units.map(rk))].sort((a, b) => a - b);
  const order = project.units.map((u, k) => k).sort((a, b) => rk(project.units[a]) - rk(project.units[b]) ||
    Number(project.units[b].top) - Number(project.units[a].top));
  order.forEach((k) => {
    const u = project.units[k];
    const li = document.createElement('li');
    li.style.marginLeft = (ranks.indexOf(rk(u)) * 14) + 'px';
    li.innerHTML = `<span class="sw" style="background:${isNA(u.fill) ? '#fff' : u.fill}"></span>
      <span class="main"><div class="t1">${escapeHtml(u.name || '')}</div>
      <div class="t2">${escapeHtml(T(u.level || ''))} \u00b7 ${fmt(u.base)}\u2013${fmt(u.top)}</div></span>`;
    li.addEventListener('click', () => openUnit(k));
    ol.appendChild(li);
  });
}
function renderAll() {
  fillForms();
  renderSections();
  renderBeds();
  renderSymbols();
  renderUnits();
  renderLithoColours();
  renderSamples();
  renderCurves();
  renderStats();
  renderOrientations();
}

// Editor sheet ####
function field(def, obj) {
  const wrap = document.createElement('label');
  if (def.full) { wrap.classList.add('full'); }
  wrap.append(def.label);
  let el;
  const v = obj[def.key];
  if (def.type === 'select') {
    el = document.createElement('select');
    for (const opt of def.options) {
      const o = document.createElement('option');
      const [val, txt] = Array.isArray(opt) ? opt : [opt, label(opt)];
      o.value = val;
      o.textContent = txt;
      el.appendChild(o);
    }
    el.value = isNA(v) ? (def.empty !== undefined ? def.empty : def.options[0]) : v;
    el.addEventListener('change', () => { obj[def.key] = el.value === '' ? null : el.value; def.onChange && def.onChange(); });
  } else if (def.type === 'multi') {
    el = document.createElement('div');
    const chips = document.createElement('div');
    chips.className = 'chips';
    const sel = document.createElement('select');
    const items = () => (isNA(obj[def.key]) ? [] : String(obj[def.key]).split(',').map((s) => s.trim()).filter(Boolean));
    const draw = () => {
      chips.innerHTML = '';
      for (const it of items()) {
        const c = document.createElement('span');
        c.className = 'chip';
        c.innerHTML = `${label(it)}<b>\u00d7</b>`;
        c.querySelector('b').addEventListener('click', () => {
          const rest = items().filter((x) => x !== it);
          obj[def.key] = rest.length ? rest.join(', ') : null;
          draw();
          def.onChange && def.onChange();
        });
        chips.appendChild(c);
      }
    };
    const o0 = document.createElement('option');
    o0.value = '';
    o0.textContent = '+ add\u2026';
    sel.appendChild(o0);
    for (const opt of def.options) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = label(opt);
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => {
      if (!sel.value) { return; }
      const it = items();
      if (!it.includes(sel.value)) { it.push(sel.value); }
      obj[def.key] = it.join(', ');
      sel.value = '';
      draw();
      def.onChange && def.onChange();
    });
    el.append(sel, chips);
    draw();
  } else if (def.type === 'textarea') {
    el = document.createElement('textarea');
    el.rows = 2;
    el.value = isNA(v) ? '' : v;
    el.addEventListener('input', () => { obj[def.key] = el.value === '' ? null : el.value; def.onChange && def.onChange(); });
  } else {
    el = document.createElement('input');
    // numbers are typed in a text box: Android number boxes return an empty value
    // for a decimal comma ("0,5") or a half-typed number, which used to erase the value
    const numeric = def.type === 'number';
    el.type = numeric ? 'text' : (def.type || 'text');
    if (numeric) {
      el.inputMode = 'decimal';
      el.autocomplete = 'off';
    }
    if (def.step && !numeric) { el.step = def.step; }
    if (def.min !== undefined && !numeric) { el.min = def.min; }
    if (def.max !== undefined && !numeric) { el.max = def.max; }
    el.value = isNA(v) ? (def.type === 'color' ? '#ffffff' : (def.type === 'range' ? (def.min !== undefined && def.min >= 0 ? 0.5 : 0) : '')) : String(v);
    if (numeric) {
      el.addEventListener('input', () => {
        const r = parseNum(el.value);
        if (r.ok && r.value !== null) {
          obj[def.key] = clampNum(r.value, def);
          def.onChange && def.onChange();
        }
      });
      el.addEventListener('change', () => {
        const r = parseNum(el.value);
        if (r.ok && r.value === null) {
          obj[def.key] = null;
          def.onChange && def.onChange();
        } else if (!r.ok) {
          el.value = isNA(obj[def.key]) ? '' : String(obj[def.key]);
        }
      });
    } else {
      const input = el; // el becomes the slider box below: keep the input itself
      input.addEventListener('input', () => {
        let x = input.value;
        if (def.type === 'range') { x = x === '' ? null : Number(x); }
        obj[def.key] = x === '' ? null : x;
        def.onChange && def.onChange();
      });
    }
    if (def.type === 'range') {
      // slider plus a box showing (and taking) the value
      const num = document.createElement('input');
      num.type = 'text';
      num.inputMode = 'decimal';
      num.autocomplete = 'off';
      num.className = 'rangenum';
      num.value = isNA(v) ? '' : String(v);
      num.placeholder = '0';
      const slider = el;
      slider.addEventListener('input', () => { num.value = slider.value; });
      num.addEventListener('input', () => {
        const r = parseNum(num.value);
        if (!r.ok || r.value === null) { return; } // half-typed: keep the stored value
        const x = clampNum(r.value, def);
        slider.value = x;
        obj[def.key] = x;
        def.onChange && def.onChange();
      });
      num.addEventListener('change', () => {
        const r = parseNum(num.value);
        if (r.ok && r.value === null) {
          obj[def.key] = null;
          slider.value = 0;
          def.onChange && def.onChange();
        } else {
          num.value = isNA(obj[def.key]) ? '' : String(obj[def.key]);
        }
      });
      const box = document.createElement('div');
      box.className = 'rangebox';
      box.append(el, num);
      el = box;
    }
  }
  wrap.appendChild(el);
  return wrap;
}
/** Number typed by the user: "0,5" or "0.5"; {ok: false} for text that is not (yet) a number. */
function parseNum(s) {
  const t = String(s).trim().replace(',', '.');
  if (t === '') { return { ok: true, value: null }; }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) { return { ok: false, value: null }; }
  return { ok: true, value: Number(t) };
}
function clampNum(x, def) {
  if (def.min !== undefined) { x = Math.max(def.min, x); }
  if (def.max !== undefined) { x = Math.min(def.max, x); }
  return x;
}
function openSheet(title, defs, obj, actions, onChange, extra) {
  $('#sheet-title').textContent = title;
  // the ? of the editor opens the chapter about it
  $('#sheet-help').dataset.help = (extra && extra.help) || (/^Bed /.test(title) ? 'bed' : /unit/i.test(title) ? 'units' : 'start');
  const form = $('#sheet-form');
  form.innerHTML = '';
  if (extra && extra.before) { for (const e of [].concat(extra.before)) { form.appendChild(e); } }
  const grid = document.createElement('div');
  grid.className = 'grid';
  for (const d of defs) {
    d.onChange = d.onChange || onChange;
    grid.appendChild(field(d, obj));
  }
  form.appendChild(grid);
  if (extra && extra.after) { form.appendChild(extra.after); }
  const act = $('#sheet-actions');
  act.innerHTML = '';
  for (const [txt, fn, cls] of actions) {
    const b = document.createElement('button');
    b.textContent = txt;
    if (cls) { b.className = cls; }
    b.addEventListener('click', fn);
    act.appendChild(b);
  }
  $('#sheet').classList.remove('hidden');
}
function closeSheet() {
  $('#sheet').classList.add('hidden');
}

function colourBlock(b, k, changed) {
  const box = document.createElement('div');
  box.className = 'colour-block';
  const col = bedColour(b);
  box.innerHTML = `<div class="colour-current"><span class="sw big" style="background:${col}"></span>
    <span class="colour-txt"><b>Colour</b> ${col.toUpperCase()}<br><small>${colourSource(b)}</small></span></div>`;
  const row = document.createElement('div');
  row.className = 'actions';
  const pick = (start) => openColourPicker({
    title: T('Colour of bed {n} ({l})', { n: k + 1, l: label(b.lithology) }), initial: col, start,
    schemes: schemeChoices(b.lithology), allLabel: T('use for all {l} beds', { l: label(b.lithology) }),
    allDefault: false,
    onPick: (hex, all) => {
      if (all) {
        project.palette[b.lithology] = hex;
        for (const x of project.beds) {
          if (x.lithology === b.lithology) { x.fill = null; }
        }
      } else {
        b.fill = hex;
      }
      changed();
      renderLithoColours();
      openBed(k);
    }
  });
  for (const [txt, fn] of [['Presets', () => pick('presets')], ['Wheel', () => pick('wheel')], ['From photo', () => pick('photo')],
    ['Scheme colour', () => { b.fill = null; changed(); openBed(k); }]]) {
    const bt = document.createElement('button');
    bt.className = 'small';
    bt.textContent = txt;
    bt.addEventListener('click', fn);
    row.appendChild(bt);
  }
  box.appendChild(row);
  return box;
}
function symbolBlock(b, k) {
  const box = document.createElement('div');
  box.className = 'sym-block';
  const head = document.createElement('div');
  head.className = 'row-head';
  head.innerHTML = '<h3>Symbols on this bed</h3><span class="spacer"></span>';
  const add = document.createElement('button');
  add.className = 'small';
  add.textContent = '+ Symbol';
  add.addEventListener('click', () => {
    const s = { name: 'large_ripple_direction', column: 'transport', angle: 0, bed: b.id, pos: 0.5 };
    openSymbolForm(s, b, true);
  });
  head.appendChild(add);
  box.appendChild(head);
  const chips = document.createElement('div');
  chips.className = 'chips';
  const list = bedSymbols(b);
  if (list.length === 0) {
    chips.innerHTML = '<span class="hint">Palaeocurrents, structures, fossils\u2026 placed at a position in the bed.</span>';
  }
  for (const s of list) {
    const c = document.createElement('span');
    c.className = 'chip tap';
    c.textContent = `${label(s.name)} (${s.column}${Number(s.angle) ? ', ' + s.angle + '\u00b0' : ''})`;
    c.addEventListener('click', () => openSymbolForm(s, b));
    chips.appendChild(c);
  }
  box.appendChild(chips);
  void k;
  return box;
}
// Live preview of the bed being edited, with its neighbours (drawn like the log)
let previewTimer = null;
function drawBedPreview(cv, k) {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    if (!cv.isConnected) { return; }
    const w = Math.max(200, (cv.parentElement ? cv.parentElement.clientWidth : 320) - 4);
    try {
      engineBedPreview(project, k, cv, w);
    } catch (e) {
      console.warn('bed preview: ' + (e.message || e));
    }
  }, 120);
}
function openBed(k) {
  const b = project.beds[k];
  const pv = document.createElement('div');
  pv.className = 'bed-preview';
  const pvc = document.createElement('canvas');
  pv.appendChild(pvc);
  let cb = null;
  const changed = () => {
    normalise(project); save(); renderBeds(); renderSymbols(); drawBedPreview(pvc, k);
    // the colour shown follows a change of lithology
    if (cb && cb.isConnected) { const nc = colourBlock(b, k, changed); cb.replaceWith(nc); cb = nc; }
  };
  const isFault = b.contact === 'fault';
  const defs = [
    { key: 'thickness', label: T('Thickness ({u})', { u: project.options.unit }), type: 'number', step: 0.05, min: 0.001 },
    { key: 'lithology', label: 'Lithology', type: 'select', options: choices.patterns },
    { key: 'grain', label: 'Grain size (base)', type: 'select', options: choices.grains },
    { key: 'grain_top', label: 'Grain size (top)', type: 'select', options: [['', 'same as base']].concat(choices.grains), empty: '' },
    { key: 'contact', label: 'Base contact', type: 'select', options: choices.contacts,
      // the fault settings appear when the contact becomes a fault
      onChange: () => { if ((b.contact === 'fault') !== isFault) { setTimeout(() => openBed(k), 0); } } },
    ...(isFault ? [
      { key: 'fault_angle', label: 'Fault dip (\u00b0, + rising to the right)', type: 'range', step: 5, min: -80, max: 80, full: true },
      { key: 'fault_sense', label: 'Fault movement', type: 'select', options: [['normal', 'normal (hanging wall down)'], ['reverse', 'reverse (hanging wall up)']], empty: 'normal', full: true }
    ] : []),
    { key: 'side', label: 'Bed side', type: 'select', options: ['straight', 'convex', 'concave', 'wavy', 'zigzag'] },
    { key: 'surface', label: 'Top surface', type: 'select', options: choices.surfaces },
    { key: 'bioturbation', label: 'Bioturbation', type: 'select', options: [['', 'none'], 'weak', 'moderate', 'strong'], empty: '' },
    { key: 'relief', label: 'Induration / relief (\u22121 niche, 0 none, 1 protruding)', type: 'range', step: 0.05, min: -1, max: 1, full: true },
    { key: 'relief_shape', label: 'Relief shape', type: 'select', options: ['bank', 'scarp', 'ramp', 'rounded', 'niche'], full: true },
    { key: 'structure', label: 'Internal structures', type: 'multi', options: choices.structures, full: true },
    { key: 'fossils', label: 'Fossils and grains', type: 'multi', options: choices.fossils, full: true },
    { key: 'bouma', label: 'Bouma divisions (turbidites: Ta graded, Tb parallel laminated, Tc ripples, Td silt laminae, Te mud)', type: 'multi', options: ['Ta', 'Tb', 'Tc', 'Td', 'Te'], full: true },
    { key: 'dip', label: 'Bedding dip (\u00b0)', type: 'number', min: 0, max: 90 },
    { key: 'dip_dir', label: 'Dip direction (\u00b0)', type: 'number', min: 0, max: 360 },
    { key: 'description', label: 'Description', type: 'textarea', full: true }
  ];
  const after = document.createElement('div');
  const refresh = () => { drawBedPreview(pvc, k); renderBeds(); };
  after.append(symbolBlock(b, k), oriBlock(b, refresh), photoBlock(b, refresh));
  openSheet(T('Bed {n}', { n: k + 1 }), defs, b, [
    ['+ Above', () => { insertBed(k + 1, k); }],
    ['+ Below', () => { insertBed(k, k); }],
    ['Duplicate', () => { insertBed(k + 1, k, true); }],
    ...(k > 0 ? [['Repeat pair', () => { repeatBeds(k - 1, k); }]] : []),
    ['Move up', () => { moveBed(k, 1); }],
    ['Move down', () => { moveBed(k, -1); }],
    ['Thickness from dip\u2026', () => { openThicknessCalc(b, k); }],
    ['Delete', () => {
      const ns = bedSymbols(b).length + bedPhotos(b).length + bedOrientations(b).length;
      if (confirm(ns ? T('Delete this bed and its {n} symbol(s), photo(s) and measurement(s)?', { n: ns }) : T('Delete this bed?'))) {
        removePhotos(bedPhotos(b));
        project.orientations = project.orientations.filter((o) => o.bed !== b.id);
        project.symbols = project.symbols.filter((s) => s.bed !== b.id);
        project.beds.splice(k, 1);
        selBed = -1;
        changed();
        closeSheet();
      }
    }, 'danger']
  ], () => { changed(); }, { before: [pv, (cb = colourBlock(b, k, changed))], after, help: 'bed' });
  drawBedPreview(pvc, k);
}
function insertBed(at, from, copy, open = true) {
  const src = project.beds[from] || project.beds[at] || {};
  const nb = copy ? Object.assign({}, src) : { thickness: 0.5, lithology: src.lithology || 'sandstone', grain: src.grain || 'm' };
  nb.id = newBedId(project);
  if (!copy) { nb.fill = null; }
  project.beds.splice(at, 0, nb);
  if (copy) {
    for (const s of bedSymbols(src)) {
      project.symbols.push(Object.assign({}, s, { bed: nb.id }));
    }
  }
  project.options.stack = true;
  normalise(project);
  save();
  selBed = at;
  renderBeds();
  renderSymbols();
  fillForms();
  if (open) { openBed(at); } else { toast(copy ? 'Bed duplicated above' : 'Bed added'); }
}
function moveBed(k, d, open = true) {
  const j = k + d;
  if (j < 0 || j >= project.beds.length) { return; }
  const t = project.beds[k];
  project.beds[k] = project.beds[j];
  project.beds[j] = t;
  project.options.stack = true;
  normalise(project);
  save();
  selBed = j;
  renderBeds();
  renderSymbols();
  if (open) { openBed(j); } else { toast(T('Bed moved to position {n}', { n: j + 1 })); }
}
// Repeat beds from..to (indices, bottom to top) on top of them, e.g. an alternation
function repeatBeds(from, to, open = true) {
  const copies = [];
  for (let k = from; k <= to; k++) {
    const src = project.beds[k];
    const nb = Object.assign({}, src, { id: newBedId(project) });
    project.beds.splice(to + 1 + copies.length, 0, nb);
    for (const s of bedSymbols(src)) { project.symbols.push(Object.assign({}, s, { bed: nb.id })); }
    copies.push(nb);
  }
  project.options.stack = true;
  normalise(project);
  save();
  selBed = to + copies.length;
  renderBeds();
  renderSymbols();
  fillForms();
  if (open) { openBed(selBed); }
  toast(copies.length === 1 ? T('Bed duplicated') : T('{n} beds repeated on top', { n: copies.length }));
}

// Symbol form (extra symbols and symbols on a bed) ####
function groupOf(name) {
  for (const [g, list] of Object.entries(groups)) {
    if (list.includes(name)) { return g; }
  }
  return Object.keys(groups)[0];
}
function defaultColumn(g) {
  if (/^Faults/.test(g)) { return 'bed'; }
  if (/Transport/.test(g)) { return 'transport'; }
  if (/fossil|grains/i.test(g)) { return 'fossils'; }
  if (/Bioturbation/.test(g)) { return 'bioturbation'; }
  return 'structures';
}
function openSymbolForm(s, bed, isNew) {
  const changed = () => { normalise(project); save(); renderSymbols(); renderBeds(); };
  const box = document.createElement('div');
  box.className = 'grid';
  const mk = (lab, el) => {
    const w = document.createElement('label');
    w.append(lab, el);
    return w;
  };
  const gSel = document.createElement('select');
  for (const g of Object.keys(groups)) {
    const o = document.createElement('option');
    o.value = g;
    o.textContent = g;
    gSel.appendChild(o);
  }
  gSel.value = groupOf(s.name);
  const nSel = document.createElement('select');
  const fillNames = () => {
    nSel.innerHTML = '';
    for (const n of groups[gSel.value]) {
      const o = document.createElement('option');
      o.value = n;
      o.textContent = label(n);
      nSel.appendChild(o);
    }
    if (groups[gSel.value].includes(s.name)) { nSel.value = s.name; }
  };
  fillNames();
  const cSel = document.createElement('select');
  for (const c of ['structures', 'transport', 'bioturbation', 'fossils', 'bed']) {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = c === 'bed' ? 'inside the bed' : c;
    cSel.appendChild(o);
  }
  cSel.value = s.column || defaultColumn(gSel.value);
  const aIn = document.createElement('input');
  aIn.type = 'number';
  aIn.step = 5;
  aIn.value = isNA(s.angle) ? 0 : s.angle;
  const wGroup = mk('Symbol group', gSel);
  wGroup.classList.add('full');
  const wName = mk('Symbol', nSel);
  wName.classList.add('full');
  box.append(wGroup, wName, mk('Column', cSel), mk('Angle (\u00b0, palaeocurrent; dip for a fault)', aIn));
  let pIn = null;
  let dIn = null;
  if (bed) {
    pIn = document.createElement('input');
    pIn.type = 'range';
    pIn.min = 0;
    pIn.max = 1;
    pIn.step = 0.05;
    pIn.value = isNA(s.pos) ? 0.5 : s.pos;
    const w = mk('Position in the bed (base \u2192 top)', pIn);
    w.classList.add('full');
    box.appendChild(w);
  } else {
    dIn = document.createElement('input');
    dIn.type = 'number';
    dIn.step = 0.05;
    dIn.value = isNA(s.dt) ? 0 : s.dt;
    box.appendChild(mk('Level', dIn));
  }
  gSel.addEventListener('change', () => { fillNames(); cSel.value = defaultColumn(gSel.value); });
  const ov = document.createElement('div');
  ov.className = 'sheet picker';
  const body = document.createElement('div');
  body.className = 'sheet-body';
  body.innerHTML = `<div class="row-head"><h2>${bed ? T('Symbol on bed {n}', { n: project.beds.indexOf(bed) + 1 }) : T('Symbol')}</h2><span class="spacer"></span><button class="small help" data-help="symbols" aria-label="Help">?</button></div>`;
  body.appendChild(box);
  const act = document.createElement('div');
  act.className = 'actions';
  const ok = document.createElement('button');
  ok.className = 'accent';
  ok.textContent = isNew ? 'Add' : 'Save';
  ok.addEventListener('click', () => {
    s.name = nSel.value;
    s.column = cSel.value;
    s.angle = Number(aIn.value) || 0;
    if (bed) {
      s.bed = bed.id;
      s.pos = Number(pIn.value);
    } else {
      s.dt = Number(dIn.value);
    }
    if (isNew) { project.symbols.push(s); }
    changed();
    ov.remove();
    if (bed) { openBed(project.beds.indexOf(bed)); }
  });
  const cancel = document.createElement('button');
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => ov.remove());
  act.append(ok, cancel);
  if (!isNew) {
    const del = document.createElement('button');
    del.className = 'danger';
    del.textContent = 'Delete';
    del.addEventListener('click', () => {
      project.symbols = project.symbols.filter((x) => x !== s);
      changed();
      ov.remove();
      if (bed) { openBed(project.beds.indexOf(bed)); }
    });
    act.appendChild(del);
  }
  body.appendChild(act);
  ov.appendChild(body);
  document.body.appendChild(ov);
}
function pickCsv(mode) {
  const el = $('#file-csv');
  el.dataset.mode = mode;
  el.click();
}
// ranks of stratigraphic units, highest first (the order of the unit columns)
const UNIT_LEVELS = [
  ['Supergroup', 'Supergroup (lithostratigraphy)'], ['Group', 'Group'], ['Subgroup', 'Subgroup'],
  ['Formation', 'Formation'], ['Member', 'Member'], ['Bed', 'Bed'],
  ['System', 'System (chronostratigraphy)'], ['Series', 'Series'], ['Stage', 'Stage'], ['Substage', 'Substage'],
  ['Biozone', 'Biozone'], ['Subzone', 'Subzone'],
  ['Polarity', 'Magnetic polarity (normal black, reversed white)'], ['Environment', 'Depositional environment'],
  ['Facies association', 'Facies association'], ['Facies', 'Facies'], ['Systems tract', 'Systems tract'],
  ['Sequence', 'Sequence'], ['Cycle', 'Cycle'], ['Trend', 'Trend (T, fining or deepening: \u25b2; R, coarsening or shallowing: \u25bc)']
];
function unitLevelChoices(cur) {
  const ch = UNIT_LEVELS.slice();
  if (!isNA(cur) && cur !== '' && !ch.some(([v]) => v === cur)) { ch.push([cur, cur]); }
  return ch;
}
function openUnit(k) {
  const u = project.units[k];
  const changed = () => { save(); renderUnits(); };
  openSheet('Stratigraphic unit', [
    { key: 'name', label: 'Name', full: true },
    { key: 'level', label: 'Rank', type: 'select', options: unitLevelChoices(u.level) },
    { key: 'fill', label: 'Colour', type: 'color' },
    { key: 'base', label: isCore() ? 'Depth of the base' : 'Base', type: 'number', step: 0.1 },
    { key: 'top', label: isCore() ? 'Depth of the top' : 'Top', type: 'number', step: 0.1 }
  ], u, [['Delete', () => { project.units.splice(k, 1); changed(); closeSheet(); }, 'danger']], changed, { help: 'units' });
}

// About and donation ####
const APP_VERSION = '1.8.0';
const DONATE_URL = 'https://paypal.me/stratigraphy1';
// The Google Play build has no external donation link (Play payments policy).
const DONATIONS = !(window.AndroidBridge && window.AndroidBridge.donationsEnabled && !window.AndroidBridge.donationsEnabled());
const DONATE_HTML = DONATIONS
  ? `<p><b>Strativis is free.</b> No adverts, no account, no data leaves your phone.
      If it helps your fieldwork or your publications, you can support its development with a donation.</p>
    <a class="donate" href="${DONATE_URL}">\u2665 Donate with PayPal</a>
    <p class="hint">paypal.me/stratigraphy1</p>`
  : `<p><b>Strativis is free.</b> No adverts, no account, no data leaves your phone.</p>`;
function openAbout() {
  const ov = document.createElement('div');
  ov.className = 'sheet picker';
  ov.innerHTML = `<div class="sheet-body about">
    <div class="row-head"><h2>About Strativis</h2><span class="spacer"></span>
      <button class="small" data-close>Close</button></div>
    <div class="about-head"><img src="icon.png" alt="" width="64" height="64">
      <div><b>Strativis</b> ${APP_VERSION}<br><span class="hint">Sedimentary logs, from the field to publication</span></div></div>
    ${DONATE_HTML}
    <h3>Author</h3>
    <p>Dr Michiel Arts<br>Sedimentary Petrology, Department of Geology<br>Universit\u00e9 de Li\u00e8ge (ULi\u00e8ge), Belgium</p>
    <h3>Credits</h3>
    <p class="small-txt">Symbols, patterns and colours follow the usual sedimentological logging conventions, as compiled for example
      in the Sedimentology Utrecht logging legend and in Nichols (2009, <i>Sedimentology and Stratigraphy</i>) and other textbooks. Drawing engine: the R packages lithoglyph and Strativis, built on StratigrapheR
      (Wouters, Da Silva, Boulvain &amp; Devleeschouwer 2021, <i>The R Journal</i> 13(2): 153\u2013178), ported to JavaScript so the app runs offline without R.</p>
    <p class="small-txt">Licence: GPL-3. When you publish a log made with Strativis, please cite Strativis and StratigrapheR.</p>
  </div>`;
  ov.querySelector('[data-close]').addEventListener('click', () => ov.remove());
  ov.addEventListener('click', (e) => { if (e.target === ov) { ov.remove(); } });
  document.body.appendChild(ov);
}

// Navigation and menu ####
function showTab(name) {
  for (const b of $$('.tabs button')) { b.classList.toggle('on', b.dataset.tab === name); }
  for (const s of $$('.tab')) { s.classList.toggle('hidden', s.id !== 'tab-' + name); }
  if (name === 'preview') { fitPreviewBox(); if (dirtyPreview) { renderPreview(); } }
}
// Language of the app ####
function setLanguage(l) {
  if (l === getLang()) { return; }
  saveLang(l);
  location.reload();
}
function setupLanguage() {
  const sel = $('#lang-sel');
  if (sel) {
    sel.innerHTML = LANGS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
    sel.value = getLang();
    sel.addEventListener('change', () => setLanguage(sel.value));
  }
  // the menu item stays findable in any language
  const mi = document.querySelector('#menu [data-act=language]');
  if (mi && getLang() !== 'en') { mi.textContent = T('Language') + ' (Language)'; }
}
function openLanguage() {
  const ov = document.createElement('div');
  ov.className = 'sheet picker';
  ov.innerHTML = `<div class="sheet-body"><div class="row-head"><h2>${T('Language')}</h2><span class="spacer"></span>
    <button class="small" data-close>${T('Close')}</button></div>
    <div class="lang-list" data-no-i18n>${LANGS.map(([k, n]) => `<button data-l="${k}" class="${k === getLang() ? 'accent' : ''}">${n}</button>`).join('')}</div>
    <p class="hint">${T('The PDF, the exports and the project files stay in English, the language of most publications.')}</p></div>`;
  ov.addEventListener('click', (e) => {
    const b = e.target.closest('[data-l]');
    if (b) { setLanguage(b.dataset.l); return; }
    if (e.target === ov || e.target.closest('[data-close]')) { ov.remove(); }
  });
  document.body.appendChild(ov);
}
async function menuAction(act) {
  $('#menu').classList.add('hidden');
  if (act === 'new') {
    addSection(blankProject(T('Section') + ' ' + (ws.sections.length + 1)));
    showTab('section');
    toast('New section');
  } else if (act === 'language') {
    openLanguage();
  } else if (act === 'duplicate') {
    duplicateSection();
  } else if (act === 'delete') {
    deleteSection();
  } else if (act === 'open') {
    $('#file-open').click();
  } else if (act === 'save') {
    saveBytes(stubOf(project) + '.strata.json', 'application/json', enc.encode(JSON.stringify(project, null, 2)));
  } else if (act === 'export') {
    exportZip(false);
  } else if (act === 'export-all') {
    exportZip(true);
  } else if (act === 'import-beds') {
    pickCsv('beds');
  } else if (act === 'svg') {
    exportSVG();
  } else if (act === 'csv') {
    saveBytes(stubOf(project) + '_beds.csv', 'text/csv', enc.encode(toCSV(project.beds, BED_FIELDS)));
  } else if (act === 'example') {
    const ex = await (await fetch('example.strata.json')).json();
    addSection(ex);
    toast('Example added as a new section');
  } else if (act === 'manual') {
    openHelp('start');
  } else if (act === 'about' || act === 'donate') {
    openAbout();
  }
}
function wire() {
  if (!DONATIONS) {
    const d = document.querySelector('#menu [data-act="donate"]');
    if (d) { d.remove(); }
    $('#about-link').textContent = 'About';
  }
  for (const b of $$('.tabs button')) { b.addEventListener('click', () => showTab(b.dataset.tab)); }
  $('#btn-menu').addEventListener('click', () => $('#menu').classList.toggle('hidden'));
  for (const b of $$('#menu button')) { b.addEventListener('click', () => menuAction(b.dataset.act)); }
  $('#btn-pdf').addEventListener('click', exportPDF);
  // ? buttons: the chapter of the manual about this screen
  document.addEventListener('click', (e) => {
    const h = e.target.closest('button[data-help]');
    if (h) { e.preventDefault(); openHelp(h.dataset.help); }
  });
  $('#sheet-close').addEventListener('click', closeSheet);
  $('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') { closeSheet(); } });
  $('#bed-add-top').addEventListener('click', () => insertBed(project.beds.length, project.beds.length - 1));
  $('#bed-add-bottom').addEventListener('click', () => insertBed(0, 0));
  $('#sec-new').addEventListener('click', () => menuAction('new'));
  $('#sec-dup').addEventListener('click', duplicateSection);
  $('#sec-del').addEventListener('click', deleteSection);
  $('#sec-export').addEventListener('click', () => exportZip(false));
  $('#about-link').addEventListener('click', openAbout);
  $('#smp-add').addEventListener('click', addSample);
  $('#smp-import').addEventListener('click', () => pickCsv('samples'));
  $('#crv-add').addEventListener('click', () => openCurve(T('Curve') + ' ' + (curveNames().length + 1)));
  $('#crv-import').addEventListener('click', () => pickCsv('curves'));
  $('#ori-import').addEventListener('click', () => pickCsv('orientations'));
  $('#ori-add').addEventListener('click', () => {
    const o = newOrientation(null);
    project.orientations.push(o);
    oriChanged();
    openOrientation(o);
  });
  $('#ori-measure').addEventListener('click', () => openCompass({ kind: lastKind }));
  $('#file-csv').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    const mode = e.target.dataset.mode;
    e.target.value = '';
    if (!f) { return; }
    try {
      const txt = await f.text();
      const msg = mode === 'beds' ? importBedsCsv(txt) : mode === 'samples' ? importSamplesCsv(txt) : mode === 'orientations' ? importOrientationsCsv(txt) : importCurvesCsv(txt);
      if (msg === null) { return; }
      normalise(project);
      save();
      renderAll();
      toast(T('Imported') + ' ' + msg);
    } catch (err) {
      toast(T('Could not import {f}', { f: f.name }) + ': ' + (err.message || err), 5000);
    }
  });
  $('#sym-add').addEventListener('click', () => {
    const top = project.beds.length ? project.beds[project.beds.length - 1].top : 0;
    openSymbolForm({ dt: midLevel(), name: 'large_ripple_direction', column: 'transport', angle: 0 }, null, true);
  });
  $('#unit-add').addEventListener('click', () => {
    const top = project.beds.length ? project.beds[project.beds.length - 1].top : 1;
    const d0 = Number(project.options.base) || 0;
    project.units.push(isCore() ? { base: d0 + top, top: d0, level: 'Formation', name: 'New unit', fill: '#f2f2f2' }
      : { base: Number(project.beds.length ? project.beds[0].base : 0), top: top, level: 'Formation', name: 'New unit', fill: '#f2f2f2' });
    save();
    renderUnits();
    openUnit(project.units.length - 1);
  });
  $('#file-open').addEventListener('change', async (e) => {
    for (const f of Array.from(e.target.files)) {
      try {
        const p = JSON.parse(await f.text());
        if (p.format !== 'Strativis') { throw new Error(T('not a Strativis project')); }
        addSection(p);
        toast(T('Opened {x}', { x: f.name }));
      } catch (err) {
        toast(T('Could not open {f}', { f: f.name }) + ': ' + err.message, 5000);
      }
    }
    e.target.value = '';
  });
  $('#pv-prev').addEventListener('click', () => { pvPage = Math.max(1, pvPage - 1); renderPreview(); });
  $('#pv-next').addEventListener('click', () => { pvPage = Math.min(pvPages, pvPage + 1); renderPreview(); });
  $('#pv-refresh').addEventListener('click', renderPreview);
  $('#pv-zoom-in').addEventListener('click', () => { pvZoom = Math.min(8, pvZoom * 1.4); resizeCanvas(); });
  // move the preview freely with one finger (any direction, with a glide) and
  // zoom it with two (it is a vector image: sharp at any zoom)
  {
    const wrap = document.querySelector('.pv-wrap');
    const pts = new Map();
    let gest = null;
    let glide = 0;
    const mid = () => {
      const v = [...pts.values()];
      const r = wrap.getBoundingClientRect();
      const x = v.reduce((s, p) => s + p.x, 0) / v.length - r.left;
      const y = v.reduce((s, p) => s + p.y, 0) / v.length - r.top;
      const d = v.length > 1 ? Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y) : 0;
      return { x, y, d };
    };
    const start = () => {
      const m = mid();
      gest = { ...m, z: pvZoom, sx: wrap.scrollLeft, sy: wrap.scrollTop, vx: 0, vy: 0, t: performance.now() };
    };
    wrap.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button > 0) { return; }
      cancelAnimationFrame(glide);
      wrap.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      start();
    });
    wrap.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId) || !gest) { return; }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const m = mid();
      const pad = 8;
      if (pts.size > 1 && gest.d > 0) {
        const z = Math.min(8, Math.max(0.5, gest.z * m.d / gest.d));
        const f = z / gest.z;
        if (z !== pvZoom) { pvZoom = z; resizeCanvas(); }
        // the point that was under the fingers follows them
        wrap.scrollLeft = (gest.sx + gest.x - pad) * f + pad - m.x;
        wrap.scrollTop = (gest.sy + gest.y - pad) * f + pad - m.y;
      } else {
        const nx = gest.sx + gest.x - m.x, ny = gest.sy + gest.y - m.y;
        const now = performance.now(), dt = Math.max(now - gest.t, 1);
        gest.vx = 0.8 * gest.vx + 0.2 * (nx - wrap.scrollLeft) / dt;
        gest.vy = 0.8 * gest.vy + 0.2 * (ny - wrap.scrollTop) / dt;
        gest.t = now;
        wrap.scrollLeft = nx;
        wrap.scrollTop = ny;
      }
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) { return; }
      pts.delete(e.pointerId);
      const g = gest;
      if (pts.size > 0) { start(); return; }
      gest = null;
      // glide on after a flick
      if (g && performance.now() - g.t < 80 && Math.hypot(g.vx, g.vy) > 0.2) {
        let vx = g.vx, vy = g.vy, t0 = performance.now();
        const step = (t) => {
          const dt = t - t0;
          t0 = t;
          wrap.scrollLeft += vx * dt;
          wrap.scrollTop += vy * dt;
          const k = Math.pow(0.995, dt);
          vx *= k;
          vy *= k;
          if (Math.hypot(vx, vy) > 0.02) { glide = requestAnimationFrame(step); }
        };
        glide = requestAnimationFrame(step);
      }
    };
    wrap.addEventListener('pointerup', end);
    wrap.addEventListener('pointercancel', end);
    window.addEventListener('resize', fitPreviewBox);
  }
  $('#pv-zoom-out').addEventListener('click', () => { pvZoom = Math.max(0.5, pvZoom / 1.4); resizeCanvas(); });
  $('#btn-gps').addEventListener('click', () => {
    if (!navigator.geolocation) { toast('No GPS available'); return; }
    navigator.geolocation.getCurrentPosition((pos) => {
      const c = pos.coords;
      project.meta.latitude = Math.abs(c.latitude).toFixed(5) + (c.latitude >= 0 ? ' N' : ' S');
      project.meta.longitude = Math.abs(c.longitude).toFixed(5) + (c.longitude >= 0 ? ' E' : ' W');
      if (c.altitude !== null && c.altitude !== undefined) { project.meta.elevation = Math.round(c.altitude) + ' m'; }
      save();
      fillForms();
      toast('Position recorded');
    }, (err) => toast('GPS: ' + err.message, 4000), { enableHighAccuracy: true, timeout: 20000 });
  });
}
// the preview box fills the rest of the screen, so the page moves inside it
function fitPreviewBox() {
  const wrap = document.querySelector('.pv-wrap');
  const m = document.querySelector('main');
  if (!wrap || !m || wrap.offsetParent === null) { return; }
  const top = wrap.getBoundingClientRect().top - m.getBoundingClientRect().top + m.scrollTop;
  wrap.style.height = Math.max(240, m.clientHeight - top - 12) + 'px';
}
function resizeCanvas() {
  const sv = $('#pv-svg').firstElementChild;
  if (!sv) { return; }
  const cssW = Math.min(window.innerWidth - 40, 900) * pvZoom;
  sv.style.width = cssW + 'px';
  sv.style.height = (cssW * Number(sv.dataset.ratio)) + 'px';
}

// Start ####
async function loadWorkspace() {
  try { ws = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { ws = null; }
  if (!ws || !Array.isArray(ws.sections) || ws.sections.length === 0) {
    let first = null;
    try { first = JSON.parse(localStorage.getItem(OLD_KEY) || 'null'); } catch (e) { first = null; }
    if (!first || first.format !== 'Strativis') {
      first = await (await fetch('example.strata.json')).json();
    }
    ws = { current: null, sections: [{ id: newSecId(), project: first }] };
    ws.current = ws.sections[0].id;
  }
  if (!currentSection()) { ws.current = ws.sections[0].id; }
  for (const s of ws.sections) { s.project = normalise(s.project); }
  project = currentSection().project;
}
async function main() {
  // the language first: the page is translated as it is drawn
  await loadLang(savedLang());
  translatePage();
  setupLanguage();
  wire();
  bindForms();
  await loadWorkspace();
  try {
    await startEngine();
  } catch (e) {
    busy(true, T('Strativis could not start') + ': ' + (e.message || e));
    return;
  }
  renderAll();
  window.Strativis = { renderPreview, exportPDF, exportZip, getProject: () => project, getWorkspace: () => ws, showTab };
  // Android back button: close the open dialog or menu, else go back to the first tab
  window.StrativisBack = () => {
    const pk = document.querySelector('.sheet.picker');
    if (pk) { pk.remove(); return true; }
    if (!$('#sheet').classList.contains('hidden')) { closeSheet(); return true; }
    if (!$('#menu').classList.contains('hidden')) { $('#menu').classList.add('hidden'); return true; }
    if ($('#tab-section').classList.contains('hidden')) { showTab('section'); return true; }
    return false;
  };
}
main();
