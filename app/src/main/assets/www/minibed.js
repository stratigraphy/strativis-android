// Small schematic drawing of a bed for the bed list: width = grain size,
// fill = bed colour, simplified lithology pattern, base contact shape.

const SILI = ['clay', 'silt', 'vf', 'f', 'm', 'c', 'vc', 'granule', 'pebble', 'cobble', 'boulder'];
const DUNHAM = ['mudstone', 'wackestone', 'packstone', 'grainstone', 'boundstone', 'rudstone'];
const DUNHAM_ON_SILI = { mudstone: 2, wackestone: 3, packstone: 4, grainstone: 6, boundstone: 7, rudstone: 8 };

export function grainIndex(g, scale) {
  if (g === null || g === undefined || g === '') { return null; }
  const n = Number(g);
  if (!isNaN(n)) { return n; }
  if (scale === 'dunham' && DUNHAM.includes(g)) { return DUNHAM.indexOf(g) + 1; }
  if (SILI.includes(g)) { return SILI.indexOf(g) + 1; }
  if (DUNHAM_ON_SILI[g]) { return DUNHAM_ON_SILI[g]; }
  return 5;
}

function family(l) {
  l = String(l || '');
  if (l === 'covered') { return 'covered'; }
  if (l === 'none') { return 'none'; }
  if (/^(coal|peat|bitumen|asphalt)$/.test(l)) { return 'solid'; }
  if (/marl|calcareous_siltstone/.test(l)) { return 'wavy'; }
  if (/^dolo|dolostone|dolomitic/.test(l)) { return 'dolo'; }
  if (/conglomerate/.test(l)) { return 'pebbles'; }
  if (/breccia/.test(l)) { return 'angular'; }
  if (/limestone|chalk|grainstone|packstone|wackestone|lime_mudstone|boundstone/.test(l)) { return 'brick'; }
  if (/sand|quartzite|phosphate/.test(l)) { return 'dots'; }
  if (/silt/.test(l)) { return 'dashes'; }
  if (/mudstone/.test(l)) { return 'vlines'; }
  if (/clay|shale/.test(l)) { return 'hlines'; }
  if (/chert/.test(l)) { return 'triangles'; }
  if (/sulfate|gypsum|anhydrite/.test(l)) { return 'chevrons'; }
  if (/halite/.test(l)) { return 'cross'; }
  if (/kmg/.test(l)) { return 'grid'; }
  if (/tuff|pyroclastic/.test(l)) { return 'ticks'; }
  return 'brick';
}

function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) { return 1; }
  const v = parseInt(m[1], 16);
  return (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
}

function pattern(ctx, fam, x0, y0, w, h, ink) {
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  const x1 = x0 + w;
  const y1 = y0 + h;
  if (fam === 'hlines') {
    for (let y = y0 + 3; y < y1; y += 3.5) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
  } else if (fam === 'vlines') {
    for (let x = x0 + 2; x < x1; x += 3.5) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  } else if (fam === 'dashes') {
    let r = 0;
    for (let y = y0 + 3; y < y1; y += 4, r++) {
      for (let x = x0 + (r % 2) * 3; x < x1; x += 7) { ctx.moveTo(x, y); ctx.lineTo(x + 3.5, y); }
    }
  } else if (fam === 'wavy') {
    for (let y = y0 + 3; y < y1; y += 4) {
      ctx.moveTo(x0, y);
      for (let x = x0; x <= x1; x += 1) { ctx.lineTo(x, y + Math.sin((x - x0) / 1.6) * 0.9); }
    }
  } else if (fam === 'dots' || fam === 'pebbles' || fam === 'angular' || fam === 'triangles') {
    let r = 0;
    const st = fam === 'dots' ? 3.2 : 6;
    for (let y = y0 + 2.5; y < y1; y += st, r++) {
      for (let x = x0 + 2 + (r % 2) * st / 2; x < x1 - 1; x += st) {
        if (fam === 'dots') {
          ctx.moveTo(x + 0.7, y);
          ctx.arc(x, y, 0.7, 0, 2 * Math.PI);
        } else if (fam === 'pebbles') {
          ctx.moveTo(x + 2, y);
          ctx.ellipse(x, y, 2, 1.4, 0.4, 0, 2 * Math.PI);
        } else {
          ctx.moveTo(x - 1.8, y + 1.3);
          ctx.lineTo(x + 1.8, y + 1.3);
          ctx.lineTo(x, y - 1.6);
          ctx.closePath();
        }
      }
    }
  } else if (fam === 'brick' || fam === 'dolo') {
    const bh = 5;
    const bw = 9;
    let r = 0;
    for (let y = y0; y < y1; y += bh, r++) {
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      for (let x = x0 + (r % 2) * bw / 2; x < x1; x += bw) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + (fam === 'dolo' ? 2.5 : 0), y + bh);
      }
    }
  } else if (fam === 'chevrons') {
    let r = 0;
    for (let y = y0 + 3; y < y1; y += 5, r++) {
      for (let x = x0 + 2 + (r % 2) * 3; x < x1; x += 6) {
        ctx.moveTo(x + 2, y - 1.5);
        ctx.lineTo(x, y);
        ctx.lineTo(x + 2, y + 1.5);
      }
    }
  } else if (fam === 'cross' || fam === 'grid') {
    for (let x = x0 - h; x < x1; x += 3.5) {
      if (fam === 'cross') {
        ctx.moveTo(x, y1); ctx.lineTo(x + h, y0);
        ctx.moveTo(x, y0); ctx.lineTo(x + h, y1);
      } else {
        ctx.moveTo(x + h, y0); ctx.lineTo(x + h, y1);
      }
    }
    if (fam === 'grid') {
      for (let y = y0; y < y1; y += 3.5) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    }
  } else if (fam === 'ticks') {
    let r = 0;
    for (let y = y0 + 2; y < y1; y += 5, r++) {
      for (let x = x0 + 2 + (r % 2) * 3; x < x1; x += 6) {
        ctx.moveTo(x, y); ctx.lineTo(x, y + 2.5);
        ctx.moveTo(x + 1.5, y); ctx.lineTo(x + 1.5, y + 2.5);
      }
    }
  } else if (fam === 'covered') {
    ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    ctx.moveTo(x0, y1); ctx.lineTo(x1, y0);
  }
  ctx.stroke();
  if (fam === 'dots') { ctx.fill(); }
}

// Base contact, drawn from right to left along the bottom of the bed
function basePath(ctx, contact, x0, x1, y) {
  const n = Math.max(2, Math.round(x1 - x0));
  for (let i = 0; i <= n; i++) {
    const x = x1 - (x1 - x0) * i / n;
    const u = (x - x0) / Math.max(1, x1 - x0);
    let d = 0;
    if (contact === 'wavy' || contact === 'unconformity') { d = Math.sin(u * 4 * Math.PI) * 1.2; }
    else if (contact === 'erosive') { d = 1.2 + Math.sin(u * 9) * 0.8; }
    else if (contact === 'scour' || contact === 'concave') { d = 2.6 * Math.sin(Math.PI * u); }
    else if (contact === 'channel') { d = u > 0.12 && u < 0.88 ? 3 : 0; }
    else if (contact === 'convex') { d = -2.2 * Math.sin(Math.PI * u); }
    else if (contact === 'loaded') { d = 2 * Math.abs(Math.sin(u * 3 * Math.PI)); }
    else if (contact === 'stylolitic') { d = Math.sin(u * 7 * Math.PI) > 0 ? 1.2 : -1.2; }
    ctx.lineTo(x, y + d);
  }
}

export function drawMiniBed(canvas, bed, fill, opts) {
  const W = opts.width || 74;
  const H = opts.height || 32;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const maxIdx = opts.scale === 'dunham' ? 6 : 9;
  const span = W - 12;
  const gb = Math.min(maxIdx, grainIndex(bed.grain, opts.scale) || 5);
  const gtRaw = grainIndex(bed.grain_top, opts.scale);
  const gt = Math.min(maxIdx, gtRaw === null ? gb : gtRaw);
  const xl = 4;
  const wb = xl + 6 + span * gb / maxIdx;
  const wt = xl + 6 + span * gt / maxIdx;
  const yt = 3;
  const yb = H - 4;
  const r = 4;
  ctx.beginPath();
  ctx.moveTo(xl, yt);
  ctx.lineTo(wt - r, yt);
  ctx.quadraticCurveTo(wt, yt, wt, yt + r);
  ctx.lineTo(wb, yb - r);
  ctx.quadraticCurveTo(wb, yb, wb - r, yb);
  basePath(ctx, bed.contact, xl, wb - r, yb);
  ctx.closePath();
  ctx.save();
  ctx.fillStyle = fill || '#ffffff';
  ctx.fill();
  ctx.clip();
  const fam = family(bed.lithology);
  const ink = luminance(fill) < 0.35 ? 'rgba(255,255,255,0.55)' : 'rgba(25,25,25,0.6)';
  pattern(ctx, fam, xl, yt, Math.max(wb, wt) - xl, yb - yt + 4, ink);
  ctx.restore();
  ctx.strokeStyle = '#2b2f33';
  ctx.lineWidth = 1.1;
  if (bed.contact === 'gradational') { ctx.setLineDash([3, 2]); }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(xl, 1);
  ctx.lineTo(xl, H - 1);
  ctx.stroke();
  if (opts.nSymbols) {
    ctx.fillStyle = '#1f3a4d';
    ctx.beginPath();
    ctx.arc(W - 4, 5, 3.2, 0, 2 * Math.PI);
    ctx.fill();
  }
}
