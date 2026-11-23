// unitcard/styles: the vanilla look of each picture kind, read from the game's own files at run time (no vanilla art in the repo).
//   frames(V, kind, stem) -> [picture] | null      the frames of a stem (_00.._0N, an .ebm alias, or the one file)
//   refs(V, kind, group, army, opt) -> [stem]       vanilla stems of the same style group (and army when it has enough)
//   extract(V, kind, group, army, opt) -> style     per-frame plate, alpha, subject box, look, per-frame LUTs, residual, outline
//   fallback(kind, group) -> style                  built-in numbers (no vanilla files: tests, a game that has none of the kind)
//   summary(style) -> plain JSON (no pixels)
// Method (README part 1, styles): per pixel the median over the reference cards of the same group gives the plate of each frame
// where the cards agree (low spread); where they differ (the subject area) the plate is filled from its neighbours. The subject
// box is the bounding box of the high-spread pixels. Subject pixels of a reference (far from the plate) give the look: flat
// low-saturation tone = silhouette (AS2 infantry), else colour. Frame N of a reference against frame 0 gives a per-channel table
// (conditional mean) for subject pixels, a per-pixel residual median (fixed overlays such as stripes) and an edge ring colour
// (outline). The mark zone (nation strip) is copied from one card of the same army.
// Author: unitcard tool (ARSENAL)
// Author: Imperator_Aug (ARSENAL, ia-6774f412)
'use strict';
const I = require('./img');
const K = require('./kinds');
const U = require('./unit');

const EXTS = ['.tga', '.dds', '.png'];
function find(V, base) { for (const e of EXTS) if (V.has(base + e)) return base + e; return null; }
function dec(V, key) { try { const b = V.read(key); return b ? I.decode(b, key) : null; } catch (e) { return null; } }
// an .ebm is a text alias: {bitmap {frame "x_00.tga"} ...} [V GoH data; README]
function ebmFrames(V, key) {
  const b = V.read(key); if (!b) return null;
  const out = [], re = /\{\s*frame\s+"([^"]+)"/gi, dir = key.slice(0, key.lastIndexOf('/') + 1); let m;
  while ((m = re.exec(b.toString('latin1')))) out.push(dir + m[1].toLowerCase().replace(/\\/g, '/'));
  return out.length ? out : null;
}
function frameKeys(V, k, stem) {
  const base = K.SCENE + k.folder + '/' + stem;
  if (k.id === 'scheme') { const f = find(V, base + '/' + k.file); return f ? [f] : null; }
  if (V.has(base + '.ebm')) { const e = ebmFrames(V, base + '.ebm'); if (e) return e.filter(x => V.has(x)); }
  if (!k.frames) { const f = find(V, base); return f ? [f] : null; }
  const out = [];
  for (let i = 0; i < k.frames; i++) { const f = find(V, base + '_0' + i) || find(V, base + '0' + i); if (!f) break; out.push(f); }
  return out.length ? out : null;
}
function frames(V, k, stem) {
  const ks = frameKeys(V, k, stem); if (!ks) return null;
  const out = ks.map(x => dec(V, x)); return out.every(Boolean) ? out : null;
}
// every stem of a kind folder (frame number and extension cut)
function stems(V, k) {
  const pre = K.SCENE + k.folder + '/', m = new Map();
  for (const key of V.keys(pre)) {
    const r = key.slice(pre.length);
    if (k.id === 'scheme') { const x = /^([^/]+)\/scheme\.(tga|dds|png)$/.exec(r); if (x) m.set(x[1], 1); continue; }
    if (r.includes('/')) continue;
    const x = /^(.*?)_?0(\d)\.(tga|dds|png)$/.exec(r) || /^(.*)\.(ebm)$/.exec(r) || (!k.frames && /^(.*)\.(tga|dds|png)$/.exec(r));
    if (x) m.set(x[1], 1);
  }
  return [...m.keys()];
}
const NOT_UNIT = /^(menu\d|stub|icon_|mark_|spectator|doctrine_|hotkey|skeleton)/;
// stems of the same style group; army when at least 3 cards of it exist
function refs(V, k, group, army, opt) {
  opt = opt || {};
  const all = stems(V, k).filter(s => !NOT_UNIT.test(s));
  const arm = U.armyOf(V), dfs = U.defs(V);
  const armyOfStem = s => arm.get(s) || (/\(([a-z0-9]+)\)$/.exec(s) || [])[1] || (/^([a-z0-9]+)_(soldier|elite|medic|officer|tankman)/.exec(s) || [])[1] || '';
  let pick;
  if (k.id === 'squad' || k.id === 'portrait') pick = all.filter(s => group === 'hero' ? !/_(soldier|elite|medic|officer|tankman)\d*$/.test(s) : /_(soldier|elite|medic|officer|tankman)\d*$/.test(s) || /\(/.test(s));
  else if (k.id === 'scheme' || k.id === 'small') pick = all.filter(s => { const d = dfs.get(s.replace(/_ger2$/, '')); return d && /\/-vehicle\//.test(d) && (group === 'gun') === (U.clsOf(d) === 'gun'); });
  else if (group === 'hero') pick = all.filter(s => /hero/.test(s));
  else if (group === 'infantry') pick = all.filter(s => /\([a-z0-9]+\)$/.test(s) && !/hero|kamikaze|civilian/.test(s));
  else pick = all.filter(s => { const d = dfs.get(s); return d && /\/-vehicle\//.test(d) && (group === 'gun') === (U.clsOf(d) === 'gun'); });
  if (pick.length < 3 && group === 'gun') return refs(V, k, 'vehicle', army, opt);
  const same = army ? pick.filter(s => armyOfStem(s) === army) : [];
  const use = same.length >= 3 ? same : pick;
  const max = opt.max || 32, out = [];
  for (let i = 0; i < use.length && out.length < max; i += Math.max(1, Math.floor(use.length / max))) out.push(use[i]);
  return { stems: out, army: same.length >= 3 ? army : '', sameArmy: same, all: pick.length };
}
const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
function median(a) { const s = Float32Array.from(a).sort(); return s.length ? s[s.length >> 1] : 0; }
// fill the pixels where mask is false from their neighbours (repeated 3x3 mean of known pixels)
function inpaint(p, known) {
  const o = I.copy(p), w = p.w, h = p.h, k = Uint8Array.from(known);
  for (let it = 0; it < 400; it++) {
    let left = 0; const nk = Uint8Array.from(k), add = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (k[i]) continue;
      let n = 0; const s = [0, 0, 0, 0];
      for (let j = -1; j <= 1; j++) for (let q = -1; q <= 1; q++) { const X = x + q, Y = y + j; if (X < 0 || Y < 0 || X >= w || Y >= h) continue; const t = Y * w + X; if (!k[t]) continue; n++; for (let c = 0; c < 4; c++) s[c] += o.d[t * 4 + c]; }
      if (n) { add.push([i, s.map(v => v / n)]); nk[i] = 1; } else left++;
    }
    for (const [i, s] of add) for (let c = 0; c < 4; c++) o.d[i * 4 + c] = Math.round(s[c]);
    k.set(nk);
    if (!left) break;
  }
  return o;
}
function seam(p, known) {
  const o = I.copy(p), w = p.w, h = p.h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (known[i]) continue;
    const s = [0, 0, 0, 0]; let n = 0;
    for (let j = -2; j <= 2; j++) { const Y = y + j; if (Y < 0 || Y >= h) continue; for (let q = -2; q <= 2; q++) { const X = x + q; if (X < 0 || X >= w) continue; const t = (Y * w + X) * 4; for (let c = 0; c < 4; c++) s[c] += p.d[t + c]; n++; } }
    for (let c = 0; c < 4; c++) o.d[i * 4 + c] = Math.round(s[c] / n);
  }
  return o;
}
function lutFit(pairs) {
  // pairs[c] = [sum[256], n[256]] -> table, gaps interpolated, smoothed 5 wide
  return pairs.map(([sum, n]) => {
    const t = new Float32Array(256), have = [];
    for (let v = 0; v < 256; v++) if (n[v] >= 3) { t[v] = sum[v] / n[v]; have.push(v); }
    if (!have.length) { for (let v = 0; v < 256; v++) t[v] = v; return Array.from(t); }
    for (let v = 0; v < 256; v++) if (!(n[v] >= 3)) {
      let a = -1, b = -1; for (const h of have) { if (h < v) a = h; else if (h > v && b < 0) b = h; }
      t[v] = a < 0 ? t[b] + (v - b) : b < 0 ? t[a] + (v - a) : t[a] + (t[b] - t[a]) * (v - a) / (b - a);
    }
    const s = new Array(256); for (let v = 0; v < 256; v++) { let q = 0, m = 0; for (let d = -2; d <= 2; d++) { const x = v + d; if (x < 0 || x > 255) continue; q += t[x]; m++; } s[v] = I.cl(q / m); }
    return s;
  });
}
const MARK = { as2: { card: [0, 0, 29, 52], small: null }, goh: { card: [0, 0, 32, 72] } };

function extract(V, k, group, army, opt) {
  opt = opt || {};
  const R = refs(V, k, group, army, opt);
  const sets = [];
  for (const s of R.stems) { const f = frames(V, k, s); if (f && f.length) sets.push({ stem: s, f }); }
  if (!sets.length) return Object.assign(fallback(k, group), { refs: [], note: 'no vanilla ' + k.folder + ' pictures of this group were found: built-in style' });
  // size = the most common size of the frame 0 pictures
  const sz = new Map(); for (const s of sets) { const q = s.f[0].w + 'x' + s.f[0].h; sz.set(q, (sz.get(q) || 0) + 1); }
  const size = [...sz.entries()].sort((a, b) => b[1] - a[1])[0][0], [W, H] = size.split('x').map(Number);
  const same = sets.filter(s => s.f[0].w === W && s.f[0].h === H);
  // frame count = the most common count (an .ebm alias with fewer frames must not cut it), refs with fewer frames dropped
  const fc = new Map(); for (const s of same) fc.set(s.f.length, (fc.get(s.f.length) || 0) + 1);
  const nfMost = [...fc.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  const use = same.filter(s => s.f.length >= nfMost);
  const nf = Math.max(1, nfMost), N = W * H, n = use.length;
  // the plate tone of each row: the median of that row's side bands (3..8 px in from the left and right edge, outside the mark
  // zone), where every card shows its plate (subjects keep clear of the sides)
  const mzB = (MARK[k.game] || {})[k.id], inMark = x => !!(mzB && (group === 'infantry' || group === 'hero' || k.game === 'goh') && x < mzB[2]);
  const x0b = mzB && inMark(0) ? mzB[2] : 0, rowC = [];
  for (let y = 0; y < H; y++) {
    const ch = [[], [], [], []];
    for (const x of [x0b + 3, x0b + 4, x0b + 5, x0b + 6, x0b + 7, W - 8, W - 7, W - 6, W - 5, W - 4]) if (x >= 0 && x < W) for (const s of use) { if (s.f[0].d[(y * W + x) * 4 + 3] < 128) continue; for (let c = 0; c < 4; c++) ch[c].push(s.f[0].d[(y * W + x) * 4 + c]); }
    rowC.push(ch[0].length ? ch.map(median) : null);
  }
  // body tone (below the header rows): the median of the ring 3..6 px in from the edge, outside the mark zone
  const top = Math.round(H * 0.22), body = [[], [], []];
  for (let y = top; y < H; y++) for (let x = 0; x < W; x++) { const e = Math.min(x, y, W - 1 - x, H - 1 - y); if (e >= 3 && e <= 6 && !inMark(x)) for (const s of use) { if (s.f[0].d[(y * W + x) * 4 + 3] < 128) continue; for (let c = 0; c < 3; c++) body[c].push(s.f[0].d[(y * W + x) * 4 + c]); } }
  if (!body[0].length) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (const s of use) { const o = (y * W + x) * 4; if (s.f[0].d[o + 3] < 128) continue; for (let c = 0; c < 3; c++) body[c].push(s.f[0].d[o + c]); }
  const bodyC = body.map(median);
  const far = (d, o, y) => { const t = y < top && rowC[y] ? rowC[y] : bodyC; return Math.hypot(d[o] - t[0], d[o + 1] - t[1], d[o + 2] - t[2]) > 30; };
  // per pixel: the largest group of references that agree (lum within 12) and look like plate (near the row tone);
  // the plate of every frame is the median of that group. A pixel without such a group (subject area) is filled in later.
  const need = n >= 3 ? Math.max(2, Math.ceil(n * 0.4)) : 1, known = new Uint8Array(N), who = new Array(N);
  for (let i = 0; i < N; i++) {
    const L = use.map(s => lum(s.f[0].d, i * 4)), A = use.map(s => s.f[0].d[i * 4 + 3]), x = i % W, y = (i / W) | 0, free = inMark(x) || Math.min(x, y, W - 1 - x, H - 1 - y) < 3;
    let best = null, bc = 0;
    for (let r = 0; r < n; r++) {
      if (!free && A[r] > 32 && far(use[r].f[0].d, i * 4, y)) continue;
      let c = 0; for (let q = 0; q < n; q++) if (Math.abs(L[q] - L[r]) <= 12 && Math.abs(A[q] - A[r]) <= 40) c++;
      if (c > bc) { bc = c; best = r; }
    }
    if (best != null && bc >= need) { known[i] = 1; who[i] = []; for (let q = 0; q < n; q++) if (Math.abs(L[q] - L[best]) <= 12 && Math.abs(A[q] - A[best]) <= 40) who[i].push(q); }
  }
  // a pixel no group covers takes the tone of its row: the median of the read pixels of that row (nearest row with some), per frame
  const plates = [];
  for (let f = 0; f < nf; f++) {
    const p = I.blank(W, H);
    for (let i = 0; i < N; i++) if (known[i]) { const g = who[i]; for (let c = 0; c < 4; c++) p.d[i * 4 + c] = median(g.map(q => use[q].f[f].d[i * 4 + c])); }
    const rows = [];
    for (let y = 0; y < H; y++) { const ch = [[], [], [], []]; for (let x = 0; x < W; x++) { const i = y * W + x; if (!known[i] || inMark(x) || Math.min(x, y, W - 1 - x, H - 1 - y) < 3 || p.d[i * 4 + 3] < 128) continue; for (let c = 0; c < 4; c++) ch[c].push(p.d[i * 4 + c]); } rows.push(ch[0].length >= 3 ? ch.map(median) : null); }
    for (let y = 0; y < H; y++) if (!rows[y]) { for (let d = 1; d < H; d++) { const r = rows[y - d] || rows[y + d]; if (r) { rows[y] = r; break; } } }
    for (let i = 0; i < N; i++) if (!known[i]) { const r = rows[(i / W) | 0] || rowC[(i / W) | 0] || [bodyC[0], bodyC[1], bodyC[2], 255]; for (let c = 0; c < 4; c++) p.d[i * 4 + c] = Math.round(r[c]); }
    plates.push(p);
  }
  // soften the seam between read and filled pixels
  const plate = plates.map(p => seam(p, known));
  // subject masks of each reference: far from its own frame-0 plate
  const subj = use.map(s => { const m = new Uint8Array(N); for (let i = 0; i < N; i++) { const a = s.f[0].d, b = plate[0].d; const o = i * 4, e = Math.hypot(a[o] - b[o], a[o + 1] - b[o + 1], a[o + 2] - b[o + 2]) + Math.abs(a[o + 3] - b[o + 3]) / 2; const x = i % W, y = (i / W) | 0; m[i] = e > 40 && !inMark(x) && !inMark(x - 2) && Math.min(x, y, W - 1 - x, H - 1 - y) >= 3 ? 1 : 0; } return m; });
  // drop specks: a mask pixel with fewer than 3 mask neighbours goes (the header line, plate noise)
  for (const m of subj) { const c = Uint8Array.from(m); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!c[i]) continue; let q = 0; for (let j = -1; j <= 1; j++) for (let p = -1; p <= 1; p++) { const X = x + p, Y = y + j; if ((p || j) && X >= 0 && Y >= 0 && X < W && Y < H && c[Y * W + X]) q++; } if (q < 3) m[i] = 0; } }
  // inner pixels (all four neighbours subject): the tone of a subject without its soft edge
  const inner = (m, i) => { const x = i % W, y = (i / W) | 0; return m[i] && x > 0 && y > 0 && x < W - 1 && y < H - 1 && m[i - 1] && m[i + 1] && m[i - W] && m[i + W]; };
  // subject box: the median of the references' own subject boxes (outside the mark zone)
  const mz0 = (MARK[k.game] || {})[k.id], bxs = [];
  subj.forEach(m => {
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (!m[y * W + x]) continue; if (mz0 && (group === 'infantry' || group === 'hero' || k.game === 'goh') && x < mz0[2]) continue; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 >= 0 && (x1 - x0) * (y1 - y0) > 16) bxs.push([x0, y0, x1, y1]);
  });
  const box = bxs.length ? (() => { const q = [0, 1, 2, 3].map(j => median(bxs.map(b => b[j]))); return [q[0], q[1], q[2] - q[0] + 1, q[3] - q[1] + 1]; })()
    : [Math.round(W * 0.1), Math.round(H * 0.1), Math.round(W * 0.8), Math.round(H * 0.8)];
  // look: saturation and tone spread of subject pixels
  const tones = [], sats = [];
  use.forEach((s, r) => { for (let i = 0; i < N; i++) if (subj[r][i] && s.f[0].d[i * 4 + 3] > 128) { const d = s.f[0].d, o = i * 4, mx = Math.max(d[o], d[o + 1], d[o + 2]), mn = Math.min(d[o], d[o + 1], d[o + 2]); sats.push(mx ? (mx - mn) / mx : 0); tones.push(lum(d, o)); } });
  const satM = median(sats), toneM = median(tones), toneMad = median(tones.map(v => Math.abs(v - toneM)));
  // per reference: a flat subject (tone spread small, little colour) is a silhouette; the look of the most references wins
  let flat = 0, counted = 0;
  use.forEach((s, r) => {
    const t = [], sa = [];
    for (let i = 0; i < N; i++) if (inner(subj[r], i) && s.f[0].d[i * 4 + 3] > 128) { const d = s.f[0].d, o = i * 4, mx = Math.max(d[o], d[o + 1], d[o + 2]), mn = Math.min(d[o], d[o + 1], d[o + 2]); t.push(lum(d, o)); sa.push(mx ? (mx - mn) / mx : 0); }
    if (t.length < 12) return;
    counted++; const tm = median(t), md = median(t.map(v => Math.abs(v - tm)));
    if (md < 12 && median(sa) < 0.3) flat++;
  });
  const look = counted && flat * 2 > counted ? 'silhouette' : 'colour';
  if (process.env.UC_DEBUG) process.stderr.write('look ' + flat + '/' + counted + ' sat ' + satM.toFixed(2) + ' mad ' + toneMad.toFixed(1) + '\n');
  let tone = null;
  if (look === 'silhouette') {
    const rs = [], gs = [], bs = [];
    use.forEach((s, r) => { for (let i = 0; i < N; i++) if (inner(subj[r], i) && s.f[0].d[i * 4 + 3] > 128) { rs.push(s.f[0].d[i * 4]); gs.push(s.f[0].d[i * 4 + 1]); bs.push(s.f[0].d[i * 4 + 2]); } });
    tone = [median(rs), median(gs), median(bs)].map(Math.round);
  }
  // per-frame tables (subject pixels), residual and outline
  const fx = [{ lut: null, alut: null, resid: null, outline: null }];
  for (let f = 1; f < nf; f++) {
    // a grey frame (locked): the subject has colour in frame 0 and none in frame f -> grey first, then the table (a per-channel table cannot make grey)
    let s0 = 0, sf = 0, sn = 0;
    use.forEach((s, r) => { for (let i = 0; i < N; i++) { if (!subj[r][i]) continue; const a = s.f[0].d, b = s.f[f].d, j = i * 4; s0 += Math.max(a[j], a[j + 1], a[j + 2]) - Math.min(a[j], a[j + 1], a[j + 2]); sf += Math.max(b[j], b[j + 1], b[j + 2]) - Math.min(b[j], b[j + 1], b[j + 2]); sn++; } });
    const grey = sn > 0 && s0 / sn > 12 && sf / sn < 5;
    const src0 = use.map(s => grey ? I.grey(s.f[0]) : s.f[0]);
    const pr = [0, 1, 2].map(() => [new Float64Array(256), new Float64Array(256)]), pa = [[new Float64Array(256), new Float64Array(256)]];
    use.forEach((s, r) => { for (let i = 0; i < N; i++) { if (!subj[r][i]) continue; const a = src0[r].d, b = s.f[f].d; for (let c = 0; c < 3; c++) { pr[c][0][a[i * 4 + c]] += b[i * 4 + c]; pr[c][1][a[i * 4 + c]]++; } pa[0][0][a[i * 4 + 3]] += b[i * 4 + 3]; pa[0][1][a[i * 4 + 3]]++; } });
    const lut = lutFit(pr), alut = lutFit(pa)[0];
    // residual: what the table misses at fixed places (stripes), median over the references where the pixel is subject
    const resid = new Int16Array(N * 3); let rsum = 0;
    for (let i = 0; i < N; i++) {
      const per = [[], [], []];
      use.forEach((s, r) => { if (!subj[r][i]) return; for (let c = 0; c < 3; c++) per[c].push(s.f[f].d[i * 4 + c] - lut[c][src0[r].d[i * 4 + c]]); });
      if (per[0].length >= Math.max(2, n / 3)) for (let c = 0; c < 3; c++) { resid[i * 3 + c] = Math.round(median(per[c])); rsum += Math.abs(resid[i * 3 + c]); }
    }
    // outline: the ring just outside each reference's subject, frame f against the plate of frame f
    let ringN = 0, ringD = 0; const rc = [0, 0, 0];
    use.forEach((s, r) => {
      const m = subj[r];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x; if (m[i]) continue;
        let near = false; for (let j = -2; j <= 2 && !near; j++) for (let q = -2; q <= 2; q++) { const X = x + q, Y = y + j; if (X >= 0 && Y >= 0 && X < W && Y < H && m[Y * W + X]) { near = true; break; } }
        if (!near) continue;
        const d = lum(s.f[f].d, i * 4) - lum(plate[f].d, i * 4); ringD += d; ringN++; for (let c = 0; c < 3; c++) rc[c] += s.f[f].d[i * 4 + c];
      }
    });
    const outline = ringN && ringD / ringN > 18 ? { rgb: rc.map(v => Math.round(v / ringN)), r: 1, gain: Math.round(ringD / ringN) } : null;
    fx.push({ lut, alut, resid: rsum / N > 1.5 ? resid : null, outline, grey });
  }
  // mark zone (nation strip / emblem) from one card of the same army
  const mz = (MARK[k.game] || {})[k.id];
  let mark = null;
  if (mz && (k.game === 'goh' || group === 'infantry' || group === 'hero')) {
    const one = (R.sameArmy || []).map(s => ({ s, f: frames(V, k, s) })).find(x => x.f && x.f[0].w === W && x.f[0].h === H);
    if (one) mark = { stem: one.s, zone: mz.slice(), frames: one.f.slice(0, nf).map(p => I.crop(p, mz[0], mz[1], mz[2], mz[3])) };
  }
  return { kind: k.id, game: k.game, group, army: R.army, w: W, h: H, frames: nf, refs: use.map(s => s.stem), plate, box, look, tone, shadow: look === 'colour' ? { dx: 1, dy: 2, r: 2, op: 0.45 } : null, fx, mark, from: 'game', _dbg: process.env.UC_DEBUG ? { subj, use } : undefined };
}

// built-in numbers (fitted on AS2 unit_icon, README part 1 [V fit over 300 cards]): hover brighter, pressed red, locked grey
function tableOf(fn) { const t = new Array(256); for (let v = 0; v < 256; v++) t[v] = I.cl(fn(v)); return t; }
function fallback(k, group) {
  const W = k.w, H = k.h, nf = Math.max(1, k.frames || 1);
  const goh = k.game === 'goh', base = goh ? [52, 50, 44, 255] : group === 'hero' ? [70, 66, 60, 255] : [206, 196, 164, 255];
  const p = I.blank(W, H, base);
  // rounded corners and a light border (AS2) / darker top band (GoH)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, edge = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (!goh && edge === 0) { p.d[i] = p.d[i + 1] = p.d[i + 2] = 224; }
    if (goh && y < H * 0.18) { p.d[i] -= 14; p.d[i + 1] -= 14; p.d[i + 2] -= 12; }
    const cx = Math.min(x, W - 1 - x), cy = Math.min(y, H - 1 - y); if (cx + cy < 2 && k.id !== 'portrait') p.d[i + 3] = 0;
  }
  const plate = [p];
  const fx = [{ lut: null, alut: null, resid: null, outline: null }];
  const hover = tableOf(v => (v < 200 ? v * 1.25 + 5 : 255 - (255 - v) * 0.4));
  const red = [tableOf(v => v), tableOf(v => v * 0.72), tableOf(v => v * 0.68)];
  const lock = tableOf(v => (v < 16 ? 24 + v * 2 : v < 128 ? 56 + (v - 16) * (65 / 112) : 121 + (v - 128) * (51 / 64)));
  for (let f = 1; f < nf; f++) {
    let lut, pl;
    if (f === 1) { lut = [hover, hover, hover]; pl = I.lut(p, lut); }
    else if (f === 2) { lut = red; pl = I.lut(p, red); }
    else { lut = [lock, lock, lock]; pl = I.lut(I.grey(p), lut); }
    plate.push(pl);
    fx.push({ lut, alut: null, resid: null, outline: goh && f < 3 ? { rgb: [220, 214, 190], r: 1, gain: 40 } : null, grey: f === 3 });
  }
  const look = !goh && group === 'infantry' ? 'silhouette' : 'colour';
  const box = k.id === 'portrait' ? [4, 4, W - 8, H - 8] : group === 'infantry' && !goh && k.id === 'card' ? [31, 3, W - 35, H - 6] : [Math.round(W * 0.06), Math.round(H * 0.08), Math.round(W * 0.88), Math.round(H * 0.84)];
  return { kind: k.id, game: k.game, group, army: '', w: W, h: H, frames: k.frames || 0, refs: [], plate, box, look, tone: look === 'silhouette' ? [72, 66, 56] : null, shadow: look === 'colour' ? { dx: 1, dy: 2, r: 2, op: 0.45 } : null, fx, mark: null, from: 'built-in' };
}
function summary(s) {
  const mid = t => (t ? [t[0][128], t[1][128], t[2][128]] : null);
  return { kind: s.kind, game: s.game, group: s.group, army: s.army || '', size: s.w + 'x' + s.h, frames: s.frames, from: s.from, refs: s.refs.length, refsShown: s.refs.slice(0, 8),
    box: s.box, look: s.look, tone: s.tone, shadow: s.shadow, mark: s.mark ? { stem: s.mark.stem, zone: s.mark.zone } : null,
    perFrame: s.fx.map((f, i) => ({ frame: i, mid128: mid(f.lut), overlay: !!f.resid, grey: !!f.grey, outline: f.outline ? f.outline.rgb : null })), note: s.note || '' };
}
module.exports = { frames, frameKeys, stems, refs, extract, fallback, summary, ebmFrames };
