// Strativis manual: built into the app (works offline), one chapter per screen ####

import { helpChapter, t as T } from './i18n.js';

export const HELP = [
  {
    id: 'start', title: 'Getting started', html: `
<p>Strativis draws sedimentary logs from what you record in the field. Everything is stored on
your phone and saved automatically after each change; nothing is sent anywhere.</p>
<ol>
  <li><b>Section</b>: give the section a title, location and author (or use <i>Get GPS position</i>).</li>
  <li><b>Beds</b>: add the beds, from the top of the section down to the base (as you see them
    in the list), with their thickness, lithology, grain size and contacts.</li>
  <li><b>Data</b> and <b>Units</b> (optional): palaeocurrents and other symbols at given levels,
    samples and data curves (gamma ray, susceptibility, isotopes&hellip;), and the formations,
    members, facies, polarity&hellip; of the section.</li>
  <li><b>Layout</b>: page size, vertical scale, colours and drawing sizes.</li>
  <li><b>Preview</b>: check the log, then press <b>PDF</b> (top right) to save it.</li>
</ol>
<p>Every screen has a <span class="kbd">?</span> button that opens the part of this manual about
that screen. The whole manual is in the menu (&#8942;) under <i>Manual</i>.</p>
<p>To try things out, use <i>Add example section</i> in the menu: it adds a complete example
section that you can edit or delete.</p>` },
  {
    id: 'section', title: 'Section screen', html: `
<p><b>Sections.</b> One project holds any number of sections (logs). Tap a section in the list to
work on it; the other screens always show the selected section.</p>
<ul>
  <li><b>+ New</b> starts an empty section, <b>Duplicate</b> copies the selected one (for instance
    to log a nearby section with the same settings), <b>Delete</b> removes it.</li>
  <li><b>Export for R (ZIP)</b>: see <a data-goto="files">Files and exports</a>.</li>
</ul>
<p><b>Section details.</b> Title, section name, location, coordinates, elevation, date, author
and notes appear in the title block of the PDF. <i>Get GPS position</i> fills in latitude,
longitude and elevation from the phone (allow location access when asked).</p>
<p><b>Statistics.</b> At the bottom: the number of beds, total thickness, mean, median, thinnest
and thickest bed, and for each lithology its total thickness, its share of the section and its
number of beds.</p>` },
  {
    id: 'beds', title: 'Beds screen', html: `
<p>The list shows the beds from the <b>top</b> of the section (first) to the <b>base</b> (last), as
on the log. Each row shows the bed number, lithology, thickness, levels, grain size and contact,
with a small drawing of the bed as it appears on the log below.</p>
<ul>
  <li><b>Edit</b>: tap a bed.</li>
  <li><b>Add</b>: <b>+ Top</b> adds a bed at the top of the section, <b>+ Bottom</b> at the base,
    and the small <b>+</b> between two beds inserts a bed there.</li>
  <li><b>Move</b>: press <b>&equiv;</b> on the left of a bed and drag it up or down; or press and
    hold the bed anywhere, then drag.</li>
  <li><b>Duplicate</b>: <b>&#10697;</b> copies a bed (with its symbols) on top of itself. Use it,
    or <i>Repeat pair</i> in the bed editor, to log alternations quickly.</li>
</ul>
<p>Levels are worked out from the thicknesses, from the base level of the section (see
<a data-goto="layout">Layout</a>, <i>Stack beds from thickness</i>).</p>` },
  {
    id: 'bed', title: 'Bed editor', html: `
<p>The drawing at the top shows the bed (with the beds just above and below, faded) exactly as on
the log, and follows every change. The buttons add a bed above or below, duplicate the bed,
repeat the pair formed with the bed below (for alternations), move the bed or delete it.</p>
<dl>
  <dt>Colour</dt><dd>The colour of the bed: from the colour scheme by default; <i>Presets</i>,
    <i>Wheel</i> or <i>From photo</i> (pick a colour from a picture of the rock) give the bed its
    own colour; <i>Scheme colour</i> goes back to the scheme. To colour all beds of a lithology,
    use the Layout screen.</dd>
  <dt>Thickness</dt><dd>In the depth unit of the section (Layout). A decimal comma is accepted.</dd>
  <dt>Lithology</dt><dd>The pattern of the bed.</dd>
  <dt>Grain size (base, top)</dt><dd>The width of the bed on the log (siliciclastic scale clay to
    boulder, or Dunham texture for carbonates, see Layout; the Embry &amp; Klovan names floatstone,
    bafflestone, bindstone and framestone can be chosen too, drawn as packstone and boundstone).
    A different grain size at the top
    draws a graded (fining or coarsening upward) bed.</dd>
  <dt>Base contact</dt><dd>The boundary with the bed below: sharp, gradational (dashed),
    erosive, scour, channel, convex, concave, wavy, loaded (load casts), stylolitic,
    unconformity, diastem, clay parting or fault.</dd>
  <dt>Fault dip and movement</dt><dd>For a <b>fault</b> contact only. A fault is drawn as a red
    line through the contact with two half arrows showing the movement. <i>Fault dip</i> tilts
    the line across the log (degrees; positive values rise to the right). <i>Fault movement</i>:
    normal (hanging wall, above the fault, moves down the dip) or reverse (moves up).
    A fault <b>inside</b> a bed (not at its base): under <i>Symbols on this bed</i> press
    <i>+ Symbol</i>, choose the group <i>Faults (inside a bed)</i>, normal or reverse, its position
    in the bed, and its dip as the angle.</dd>
  <dt>Bed side</dt><dd>Shape of the right side of the bed: straight, convex, concave, wavy or
    zigzag.</dd>
  <dt>Top surface</dt><dd>Ornament on the top of the bed: hardground, borings, mud cracks,
    rootlets, palaeosol or karst.</dd>
  <dt>Bioturbation</dt><dd>Weak, moderate or strong, drawn in the bioturbation column.</dd>
  <dt>Induration / relief</dt><dd>How the bed weathers in the field, from &minus;1 (deep niche)
    through 0 (none) to 1 (strongly protruding). It is drawn in the relief column left of the
    log. Type the value in the box or use the slider.</dd>
  <dt>Relief shape</dt><dd>bank (block), scarp (overhanging, wider at the top), ramp (wider at
    the base), rounded, or niche (a hollow joining the beds above and below).</dd>
  <dt>Internal structures, fossils and grains</dt><dd>Add symbols with <i>+ add&hellip;</i>; tap
    &times; to remove one. They are drawn in the structures and fossil columns at the middle of
    the bed.</dd>
  <dt>Bouma divisions</dt><dd>For turbidites: the Bouma (1962) divisions present in the bed,
    Ta (massive or graded sand), Tb (parallel lamination), Tc (ripple cross-lamination), Td
    (silt laminae) and Te (mud). They are drawn in a Bouma column, Ta at the base, each division
    over an equal part of the bed (thin beds get one label such as Tb-e).</dd>
  <dt>Bedding dip and dip direction</dt><dd>The attitude of the bed, used by the true
    thickness calculator. Orientations measured in the bed (below) are drawn in the dip column
    and the stereonet.</dd>
  <dt>Description</dt><dd>Text printed in the description column.</dd>
  <dt>Symbols on this bed</dt><dd>Symbols placed at a chosen position in the bed (0 = base,
    1 = top). They move with the bed when beds are moved or change thickness.</dd>
  <dt>Orientations in this bed</dt><dd><i>Measure</i> uses the phone as a compass-clinometer;
    <i>+ Type in</i> enters a strike and dip (or trend and plunge) by hand. See
    <a data-goto="orientations">Orientations</a>.</dd>
  <dt>Photos of this bed</dt><dd><i>+ Photo</i> takes a picture with the camera or picks one
    from the gallery. The photos are kept on the phone (reduced to 1600 pixels), drawn as
    camera symbols with their label (P1, P2&hellip;) in a Photos column of the log, and added to
    the ZIP export in a <i>photos</i> folder. Tap a photo to see it, give it a caption, move it
    in the bed or delete it.</dd>
  <dt>Thickness from dip&hellip;</dt><dd>The true thickness of a bed from a measurement across
    the beds that is not perpendicular to the bedding: the length measured along a tape (or
    between two GPS points), the direction of the tape (azimuth, towards the younger beds), its
    slope (positive uphill) and the dip and dip direction of the bedding:
    t = |L (sin &delta; sin &alpha;<sub>d</sub> cos &sigma; sin &alpha; + sin &delta; cos
    &alpha;<sub>d</sub> cos &sigma; cos &alpha; + cos &delta; sin &sigma;)|. <i>Use as
    thickness</i> puts the result in the bed.</dd>
</dl>` },
  {
    id: 'symbols', title: 'Data screen: symbols, samples, curves', html: `
<p><b>Extra symbols</b> at a given level of the section, for instance palaeocurrent arrows, a fossil
level or a concretion horizon. (Symbols that belong to one bed are best added in the bed editor,
so that they follow the bed.)</p>
<dl>
  <dt>Group and Symbol</dt><dd>Choose the kind of symbol (internal structures, transport direction,
    sedimentary and diagenetic structures, trace fossils, bioturbation, macro- and microfossils,
    grains, outcrop data, faults) and the symbol itself. A fault is drawn as a red line across the
    log at its level, like a fault contact.</dd>
  <dt>Column</dt><dd>Where the symbol is drawn: structures, transport, bioturbation, fossils, or
    inside the bed.</dd>
  <dt>Angle</dt><dd>For palaeocurrents: direction of the arrow in degrees. For a fault: its dip
    (positive values rise to the right).</dd>
  <dt>Level</dt><dd>Stratigraphic level, in the depth unit of the section.</dd>
</dl>
<p><b>Samples</b> are drawn in a Samples column next to the symbols: a short tick and the label at
a level, or a bracket over a sampled interval (fill in <i>Top</i>). Labels that are too close are
staggered. <i>+ Sample</i> adds one; <i>Import CSV</i> reads a file with a label column (id,
sample, name), a level column (level, depth, height, dt or base) and optionally a <i>top</i>
column.</p>
<p><b>Data curves</b> are measurements along the section (gamma ray, magnetic susceptibility,
d13C, XRF ratios, carbonate content&hellip;). Each curve is drawn in its own column right of the
descriptions: a line through the values with a dot at each measured level, and the value scale
in the header. The scale is the same on every page. <i>Import CSV</i> reads a file with a level
column and one column per curve; the header gives the name and, in brackets, the unit, for
example <i>level;GR (API);MS (SI)</i>. A curve of the same name is replaced. Tap a curve to
rename it, set its unit or edit its values (one line per level: level and value, separated by a
tab, a space or a semicolon). The separators tab, ; and , are recognised, and a decimal comma
works with tab or ; separated files. Greek letters cannot be printed in the PDF: write d13C for
&delta;13C.</p>
<p><b>Orientations</b> (strike and dip, measured with the phone or typed in), the stereonet and the palaeocurrent rose: see <a data-goto="orientations">Orientations</a>.</p>` },
  {
    id: 'orientations', title: 'Orientations, stereonet and palaeocurrents', html: `
<p><b>Orientation measurements</b> (Data screen, and in the bed editor for measurements that
belong to one bed) record the attitude of planes and lines:</p>
<ul>
  <li><b>Planes</b>: bedding, cross-bedding foresets, fault planes, joints, cleavage, veins. Enter
    the <i>strike</i> (right-hand rule: the plane dips to the right of the strike direction) or
    the <i>dip direction</i> (each fills in the other: dip direction = strike + 90&deg;), and the
    <i>dip</i> (0&ndash;90&deg;).</li>
  <li><b>Lines</b>: lineations and fold axes, with their <i>trend</i> (azimuth of the downward
    direction) and <i>plunge</i>.</li>
  <li><b>Palaeocurrents</b>: the direction of flow (trend) only.</li>
</ul>
<p>Azimuths are degrees from north (0&ndash;360); you can also type quadrant notation (N30E,
S45W) or a compass point (SE).</p>
<p><b>Measuring with the phone.</b> <i>Measure with phone</i> turns the phone into a
compass-clinometer. Choose the kind, then:</p>
<ul>
  <li>for a <b>plane</b>, lay the phone flat on the surface (screen up, or screen down under an
    overhang); use a notebook or clipboard on rough surfaces;</li>
  <li>for a <b>line</b>, lay the long edge of the phone along it;</li>
  <li>for a <b>palaeocurrent</b>, hold the phone flat with its top pointing down-current.</li>
</ul>
<p>The reading is averaged over the last moments; wait for <i>Steady</i>, then press
<i>Save</i> (or <i>Hold</i> to freeze the reading first). <i>Save &amp; next</i> keeps the
compass open for a series of measurements. The magnetic declination of the Layout screen is
added. Keep the phone away from the hammer, magnets and steel, and calibrate the compass (wave
the phone in a figure 8) when the direction drifts. The phone's sensors are less accurate than
a good compass (a few degrees): check a few readings against your compass. Phones without a
magnetometer give the dip but not its direction: type that in.</p>
<p><b>Import CSV</b> reads a file with a level column and strike, dip, dip direction, trend,
plunge, kind and note columns (any of them).</p>
<p><b>On the log</b>, the measurements are drawn in a <b>Dip</b> column as <i>tadpoles</i>: the
mark at the dip (0&deg; left, 90&deg; right) and a tail pointing in the dip direction (north
up). Planes and lines have their own marks (legend). The first page shows a <b>stereonet</b>
(Schmidt net, lower hemisphere: poles to planes and lines) and the <b>rose diagram</b> of the
palaeocurrents: the transport symbols, the palaeocurrent measurements and the dip directions of
the cross-bedding foresets. The Data screen shows both, with the vector mean, the consistency R
(1 = all the same direction) and the mean attitude of each kind of plane.</p>` },
  {
    id: 'units', title: 'Units screen', html: `
<p>Stratigraphic units are drawn as named, coloured bars in columns left of the log.</p>
<dl>
  <dt>Rank</dt><dd>Lithostratigraphic (Supergroup, Group, Subgroup, Formation, Member, Bed),
    chronostratigraphic (System, Series, Stage, Substage), biostratigraphic (Biozone, Subzone), or
    an interpretation: magnetic polarity, depositional environment, facies association, facies,
    systems tract, sequence, cycle or trend.
    Each rank has its own column; the columns are ordered by rank, the highest on the left
    (stages, then groups, formations, members, beds, then biozones). In the list, lower ranks are
    indented under the higher ones.</dd>
  <dt>Name, colour</dt><dd>The label of the bar and its colour.</dd>
  <dt>Base, top</dt><dd>The levels of the unit, in the depth unit of the section.</dd>
</dl>
<dl>
  <dt>Magnetic polarity</dt><dd>Normal intervals are black, reversed ones white: a name N or
    <i>normal</i>, or a chron ending in n (C24n), is normal; R, <i>reversed</i> or a chron ending
    in r (C24r) is reversed. A colour you choose overrides this.</dd>
  <dt>Trend</dt><dd>Triangles for transgressive&ndash;regressive or grain-size trends: name the
    interval <b>T</b> (or <i>fining</i>, <i>deepening</i>, <i>transgressive</i>) for a triangle
    wide at the base and narrow at the top, <b>R</b> (or <i>coarsening</i>, <i>shallowing</i>,
    <i>regressive</i>) for one narrow at the base and wide at the top.</dd>
  <dt>Facies, systems tracts, cycles&hellip;</dt><dd>Named, coloured bars, like formations
    (e.g. F1&ndash;F8, FA-2, TST and HST, precession or eccentricity cycles).</dd>
</dl>
<p>Units of the same rank should not overlap: their names would be printed on top of each
other.</p>` },
  {
    id: 'layout', title: 'Layout screen', html: `
<dl>
  <dt>Layout</dt><dd><i>combined</i>: the lithology pattern fills the grain-size profile;
    <i>structures</i>: white beds with the internal structures drawn inside them.</dd>
  <dt>Profile scale</dt><dd>Siliciclastic grain sizes (clay to boulder) or the Dunham texture
    scale for carbonates.</dd>
  <dt>Colours</dt><dd>Colour scheme of the lithologies: conventional, pastel, grey or none.</dd>
  <dt>Page, orientation</dt><dd>A4, A3, Letter, Legal, or <b>Fit</b>: the whole log on one page
    as long as needed (one column, legend below; PDF pages are limited to about 5 m, beyond that
    the scale is reduced).</dd>
  <dt>Vertical scale</dt><dd>1:10 to 1:1000, or <i>fit to page</i> (the scale is chosen so that
    the section fits; with a Fit page, so that a typical bed is about 8 mm thick).</dd>
  <dt>Columns per page</dt><dd>How many columns of log side by side on a page (<i>auto</i>:
    as many as fit).</dd>
  <dt>Relief</dt><dd><i>beds</i>: one shape per bed; <i>smooth</i>: a continuous weathering
    profile.</dd>
  <dt>Depth unit</dt><dd>SI (m, cm, mm; m by default) or imperial (ft, in). The vertical scale
    and scale bar are worked out in this unit. Changing it does not convert the thicknesses.</dd>
  <dt>Depth axis interval</dt><dd>Distance between two numbered ticks of the depth axis, in the depth unit (for instance 1 for a number every metre, 0.5 for every half metre). Leave it empty for an automatic interval.</dd>
  <dt>Depth axis minor ticks</dt><dd>Short ticks between the numbered ticks of the depth axis.</dd>
  <dt>Sizes in</dt><dd>Unit of the drawing sizes below: mm (SI, default) or inches.</dd>
  <dt>Base level (Depth of the top)</dt><dd>Level of the base of the section (for instance its height above a
    datum). In a core log: the depth of the top of the logged interval.</dd>
  <dt>Rose classes</dt><dd>Width of the classes (petals) of the palaeocurrent rose diagram.</dd>
  <dt>Magnetic declination</dt><dd>Added to every compass reading of the phone, so that the
    stored azimuths are true (geographic) azimuths. East declinations are positive (about +2&deg;
    in Belgium in 2026). Look it up for your area and year, for instance on the NOAA magnetic
    field calculator.</dd>
  <dt>Grain class width, description width, symbol size, pattern size, corner radius, contact
    relief</dt><dd>Sizes of the drawing: width of one grain-size class, width of the description
    column, size of the symbols, size of the lithology patterns, rounding of the bed corners and
    height of wavy or erosive contacts.</dd>
  <dt>Legend</dt><dd>Adds a legend of all the lithologies, contacts, relief shapes and symbols
    used.</dd>
  <dt>Bed numbers</dt><dd>Numbers the beds (1 at the base, as in the Beds list) in a narrow
    column left of the log.</dd>
  <dt>Stack beds from thickness</dt><dd>On (normal use): levels are worked out from the
    thicknesses, from the base level up. Off: the base and top of each bed are kept as imported
    from a file.</dd>
  <dt>Core log (depth downwards)</dt><dd>For cores and boreholes: the depth axis increases
    downwards, from the depth of the top (above) to the base of the core; the PDF pages run from
    the top down. Beds are still entered by thickness. Levels typed in for symbols, samples,
    curves, units, photos and measurements that are not attached to a bed are depths; the exports
    add depth columns.</dd>
  <dt>Palaeocurrent rose, Stereonet</dt><dd>Draw the rose diagram of the palaeocurrents and the
    stereonet of the orientation measurements in the title block of the first page.</dd>
  <dt>Lithology colours</dt><dd>Tap a lithology to give all its beds one colour.</dd>
  <dt>A log wider than the page</dt><dd>With many columns (samples, data curves) the log can be
    wider than the page; the Preview then says so. Choose landscape, A3, a narrower description,
    or the Fit page, which is made as wide as the log.</dd>
</dl>` },
  {
    id: 'preview', title: 'Preview and PDF', html: `
<p>The Preview shows the pages of the PDF as a sharp vector image.</p>
<ul>
  <li><b>Move</b> the page with one finger in any direction; flick it to let it glide.</li>
  <li><b>Zoom</b> with two fingers, or with <b>&minus;</b> and <b>+</b>.</li>
  <li><b>&lsaquo; &rsaquo;</b> go to the previous or next page; <b>Refresh</b> draws the page
    again.</li>
  <li>The line below shows the vertical scale, the page size and the drawing time.</li>
</ul>
<p><b>PDF</b> (top right) writes the document: Android asks where to save it. The PDF is made of
vector graphics, ready for printing or for editing in a drawing program.</p>` },
  {
    id: 'files', title: 'Files and exports', html: `
<p>All in the menu (&#8942;):</p>
<dl>
  <dt>Save section (.strata.json)</dt><dd>The section as one file, to keep a copy, to move it
    to another phone or to open it in the Strativis desktop app or in R.</dd>
  <dt>Open project(s)</dt><dd>Opens one or more .strata.json files as new sections.</dd>
  <dt>Export section for R (ZIP)</dt><dd>The section file, its tables (beds, symbols, units,
    orientations, photos, samples, curves, metadata as CSV), the photos (in a photos folder), a regularly sampled series, the PDF and an R script
    (<i>load_section.R</i>) that loads everything in R with the Strativis and lithoglyph
    packages.</dd>
  <dt>Export all sections (ZIP)</dt><dd>The same for every section.</dd>
  <dt>Export beds (CSV)</dt><dd>The bed table for a spreadsheet.</dd>
  <dt>Import beds (CSV)</dt><dd>Reads beds from a spreadsheet with the same columns as the export
    (at least <i>thickness</i>, or <i>base</i> and <i>top</i>; also lithology, grain, contact,
    description&hellip;), one row per bed from the base up. They replace the beds of the
    section (you are asked first).</dd>
  <dt>Export pages as SVG</dt><dd>The pages as SVG vector images (one file, or a ZIP for several
    pages) to finish a figure in Inkscape or Illustrator.</dd>
</dl>` },
  {
    id: 'about', title: 'About', html: `
<p>Strativis is free and open source, without adverts or accounts. The drawings follow the
conventions of sedimentary logging (lithology patterns, grain-size profile, contacts, relief and
symbols); the R packages <i>lithoglyph</i> and <i>Strativis</i> make the same logs on a computer.
If you publish a log made with Strativis, please cite Strativis and StratigrapheR (Wouters et
al. 2021).</p>` }
];


const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Opens the manual, scrolled to chapter `id` (the whole manual stays readable). */
export function openHelp(id = 'start') {
  const old = document.querySelector('.sheet.manual');
  if (old) { old.remove(); }
  const ov = document.createElement('div');
  ov.className = 'sheet picker manual';
  ov.setAttribute('data-no-i18n', '');
  // chapters in the language of the app, English where a translation is missing
  const chapters = HELP.map((h) => helpChapter(h.id) || h);
  const toc = chapters.map((h) => `<button class="chip tap" data-goto="${h.id}">${esc(h.title)}</button>`).join('');
  const body = chapters.map((h) => `<section id="help-${h.id}" class="help-ch"><h3>${esc(h.title)}</h3>${h.html}</section>`).join('');
  ov.innerHTML = `<div class="sheet-body manual-body">
    <div class="row-head"><h2>${esc(T('Manual'))}</h2><span class="spacer"></span>
      <button class="small" data-close>${esc(T('Close'))}</button></div>
    <div class="help-toc">${toc}</div>
    <div class="help-text">${body}</div></div>`;
  const text = ov.querySelector('.help-text');
  const go = (k) => {
    const el = ov.querySelector('#help-' + k);
    if (el) { text.scrollTop = el.offsetTop - text.offsetTop; }
  };
  ov.addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]');
    if (g) { e.preventDefault(); go(g.dataset.goto); return; }
    if (e.target === ov || e.target.closest('[data-close]')) { ov.remove(); }
  });
  document.body.appendChild(ov);
  requestAnimationFrame(() => go(id));
}
