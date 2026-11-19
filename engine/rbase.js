// rbase.js: small helpers that stand in for R base functions ####
//
// Missing values: numbers use NaN, strings and other values use null; isNA()
// accepts both. Tables (R data frames) are "column tables": plain objects of
// equal-length arrays, e.g. {base: [0, 1], top: [1, 2], lithology: ['shale', 'marl']}.

export const NA = NaN;

/** is.na() for one value. */
export function isNA(v) {
  return v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));
}

/** rep(x, length.out = n) for scalars and arrays. */
export function rep(v, n) {
  if (!Array.isArray(v)) { return new Array(n).fill(v); }
  if (v.length === n) { return v.slice(); }
  const out = new Array(n);
  for (let k = 0; k < n; k++) { out[k] = v[k % v.length]; }
  return out;
}

/** rep(x, each = n). */
export function repEach(v, n) {
  const out = [];
  for (const x of v) { for (let k = 0; k < n; k++) { out.push(x); } }
  return out;
}

/** seq_len(n) as 1..n (R indices) or 0..n-1 with zero = true. */
export function seqLen(n, zero = false) {
  const out = [];
  for (let k = 0; k < n; k++) { out.push(zero ? k : k + 1); }
  return out;
}

/** seq(from, to, length.out = n). */
export function seqOut(from, to, n) {
  n = Math.ceil(n);
  if (n <= 0) { return []; }
  if (n === 1) { return [from]; }
  if (n === 2) { return [from, to]; }
  if (from === to) { return new Array(n).fill(from); }
  const by = (to - from) / (n - 1);
  const out = [from];
  for (let k = 1; k <= n - 2; k++) { out.push(from + k * by); }
  out.push(to);
  return out;
}

/** seq(from, to, by), with R's small tolerance at the end. */
export function seqBy(from, to, by) {
  const del = to - from;
  if (del === 0 && to === 0) { return [to]; }
  if (Math.abs(del) / Math.max(Math.abs(to), Math.abs(from)) < 100 * Number.EPSILON) { return [from]; }
  const n = Math.trunc(del / by + 1e-10);
  const out = [];
  for (let k = 0; k <= n; k++) {
    const x = from + k * by;
    out.push(by > 0 ? Math.min(x, to) : Math.max(x, to));
  }
  return out;
}

const nums = (v) => (Array.isArray(v) ? v : [v]).flat(Infinity).filter((x) => !isNA(x));

/** sum, min, max, range, mean with na.rm = TRUE. */
export const sum = (v) => nums(v).reduce((a, b) => a + b, 0);
export const min = (...v) => Math.min(...nums(v));
export const max = (...v) => Math.max(...nums(v));
export const range = (...v) => [min(...v), max(...v)];
export const mean = (v) => { const a = nums(v); return a.length ? sum(a) / a.length : NaN; };

/** cumsum(). */
export function cumsum(v) {
  const out = [];
  let s = 0;
  for (const x of v) { s += x; out.push(s); }
  return out;
}

/** diff(). */
export function diff(v) {
  const out = [];
  for (let k = 1; k < v.length; k++) { out.push(v[k] - v[k - 1]); }
  return out;
}

/** pmin / pmax of two arrays or scalars. */
export function pmin(a, b) {
  const n = Math.max(Array.isArray(a) ? a.length : 1, Array.isArray(b) ? b.length : 1);
  const A = rep(a, n), B = rep(b, n);
  return A.map((x, k) => Math.min(x, B[k]));
}
export function pmax(a, b) {
  const n = Math.max(Array.isArray(a) ? a.length : 1, Array.isArray(b) ? b.length : 1);
  const A = rep(a, n), B = rep(b, n);
  return A.map((x, k) => Math.max(x, B[k]));
}

/** which(): 0-based indices of true values. */
export function which(v) {
  const out = [];
  v.forEach((x, k) => { if (x) { out.push(k); } });
  return out;
}

/** order(): 0-based indices that sort v (stable; NA last). */
export function order(v, decreasing = false) {
  const idx = v.map((_, k) => k);
  idx.sort((a, b) => {
    const x = v[a], y = v[b];
    if (isNA(x) && isNA(y)) { return a - b; }
    if (isNA(x)) { return 1; }
    if (isNA(y)) { return -1; }
    if (x < y) { return decreasing ? 1 : -1; }
    if (x > y) { return decreasing ? -1 : 1; }
    return a - b;
  });
  return idx;
}

/** unique() keeping first occurrences. */
export function unique(v) {
  return [...new Set(v)];
}

/** x %in% table. */
export function inSet(x, table) {
  const s = new Set(table);
  return Array.isArray(x) ? x.map((v) => s.has(v)) : s.has(x);
}

/** setdiff(a, b). */
export function setdiff(a, b) {
  const s = new Set(b);
  return unique(a.filter((x) => !s.has(x)));
}

/** match(x, table): 0-based position or -1. */
export function match(x, table) {
  return table.indexOf(x);
}

/** Number of rows of a column table. */
export function nrow(df) {
  if (!df) { return 0; }
  const k = Object.keys(df);
  return k.length ? df[k[0]].length : 0;
}

/** df[idx, , drop = FALSE] with 0-based row indices. */
export function dfRows(df, idx) {
  const out = {};
  for (const [k, v] of Object.entries(df)) { out[k] = idx.map((i) => v[i]); }
  return out;
}

/** df[mask, ] for a boolean mask. */
export function dfFilter(df, mask) {
  return dfRows(df, which(mask));
}

/** Row k of a column table as an object. */
export function dfRow(df, k) {
  const out = {};
  for (const [c, v] of Object.entries(df)) { out[c] = v[k]; }
  return out;
}

/** Array of row objects -> column table (columns = union of keys, or `cols`). */
export function dfFromRows(rows, cols = null) {
  const names = cols || unique(rows.flatMap((r) => Object.keys(r)));
  const out = {};
  for (const c of names) { out[c] = rows.map((r) => (c in r ? r[c] : null)); }
  return out;
}

/** Column table -> array of row objects. */
export function dfToRows(df) {
  const n = nrow(df);
  const out = [];
  for (let k = 0; k < n; k++) { out.push(dfRow(df, k)); }
  return out;
}

/** rbind() of column tables with the same columns. */
export function rbindDf(...dfs) {
  const parts = dfs.filter((d) => d && nrow(d) > 0);
  if (parts.length === 0) { return dfs[0] || {}; }
  const out = {};
  for (const c of Object.keys(parts[0])) { out[c] = parts.flatMap((d) => d[c] || rep(null, nrow(d))); }
  return out;
}

/** Numeric conversion like as.numeric(): non-numbers become NaN. */
export function asNumber(v) {
  if (isNA(v) || v === '') { return NaN; }
  const x = Number(v);
  return Number.isFinite(x) ? x : NaN;
}

/** Round to `d` decimals like R's round(): binary value decides, exact halves go to even. */
export function round(x, d = 0) {
  if (!Number.isFinite(x)) { return x; }
  const m = Math.pow(10, d);
  const y = x * m;
  if (Number.isInteger(y)) { return y / m; }
  // R >= 4.0: take the nearer of the two candidates, ties to the even one
  const lo = Math.floor(y), x1 = lo / m, x2 = (lo + 1) / m;
  const d1 = x - x1, d2 = x2 - x;
  if (d1 < d2) { return x1; }
  if (d2 < d1) { return x2; }
  return lo % 2 === 0 ? x1 : x2;
}

/** sprintf("%.nf") convenience. */
export function fixed(x, n) {
  return (+x).toFixed(n);
}
