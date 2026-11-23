// unitcard/layers: the vanilla look of a picture kind as LAYERS read from the game's (or the mod's) own files at run time; no
// vanilla art is stored in the repo. One model per kind + class group + army (+ source game|mod):
//   analyse(V, k, group, army, opt) -> model
//     opt: { source: 'game'|'mod', max, exclude: [stem] (leave-one-out), stems: [stem] (use exactly these) }
//     model.bg[f]       background of frame f: per pixel the plurality cluster over the references (cards of one army show the
//                       same plate or flag, the subject varies, so the value most references share is the background; a plain
//                       median blends subjects into it when more than half of the cards cover a pixel)
//     model.conf        share of the references in that cluster (base frame); hidden = no two references show the background
//     model.frame       frame / border pixels (all references agree, next to an alpha edge): drawn over the subject, alpha kept
//     model.army        pixels that differ between armies (flag, nation strip); null when no other army has 2+ references
//     model.generic     a figure every reference of every army draws in the same place (the AS2 portrait man): it is part of
//                       the class style, the background under it is never shown in the game
//     model.badges      class badges: regions in the kind's badge areas that are pixel-identical across subsets of references,
//                       deduplicated into classes with their users; frames copied exactly from the game
//     model.subject     how the class draws its subject, measured as medians over the references: box, height, baseline,
//                       centre, width, look (silhouette or colour), tone, light map, colour stats, draws ('subject'|'badge')
//     model.tf[f]       frame f from the base frame, per pixel: v_f = a*v_base + b per channel, least squares over the
//                       references' subject and badge pixels at that pixel; where too few references cover it, the table of
//                       the whole picture (+ the median residual there). grey frames (locked) go through grey first
//     model.template    true when no clean layer could be read (too few references, or the background is hidden in most
//                       pixels): compose then copies one chosen reference card instead (opt.template stem)
//   compose(model, subject, o) -> { frames: [picture], parts }   o: see compose()
//   fidelity(V, k, group, army, opt) -> per reference: rebuild through compose from its own subject, compare every frame
//   summary(model) -> plain JSON; layerPics(model) -> { name: dataUrl }
// Author: unitcard tool (ARSENAL)
// Author: Imperator_Aug (ARSENAL, ia-a376e202)
'use strict';
const I = require('./img');
const K = require('./kinds');
const U = require('./unit');
const S = require('./styles');

const TOL = 10, TOLA = 20;
const lum = (d, o) => 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
function median(a) { if (!a.length) return 0; const s = Float64Array.from(a).sort(); return s[s.length >> 1]; }
const near = (a, o, b, q) => Math.abs(a[o] - b[q]) <= TOL && Math.abs(a[o + 1] - b[q + 1]) <= TOL && Math.abs(a[o + 2] - b[q + 2]) <= TOL && Math.abs(a[o + 3] - b[q + 3]) <= TOLA;
const same = (a, o, b, q) => Math.abs(a[o] - b[q]) <= 6 && Math.abs(a[o + 1] - b[q + 1]) <= 6 && Math.abs(a[o + 2] - b[q + 2]) <= 6 && Math.abs(a[o + 3] - b[q + 3]) <= 8;

// ---------- references ----------
const NOT_UNIT = /^(menu\d|stub|icon_|mark_|spectator|hotkey|skeleton|hint|none|narrator|terrain_|template|rank\d|battle_assistant)/;
function armies(V) { if (!V.memo.armies) V.memo.armies = new Set([...U.armyOf(V).values()].concat(['rus', 'ger', 'usa', 'eng', 'jap', 'fin', 'ger2', 'ita', 'fra', 'pol'])); return V.memo.armies; }
function armyOfStem(V, s) {
  const m = U.armyOf(V).get(s); if (m) return m;
  const a = (/\(([a-z0-9]+)\)$/.exec(s) || [])[1]; if (a) return a;
  const p = (/^([a-z]+\d?)_/.exec(s) || [])[1]; return p && armies(V).has(p) ? p : '';
}
// the stems of the kind's class group (all armies), each with its army; doctrine_* / period aliases are dropped (same frames)
function pick(V, k, group, opt) {
  opt = opt || {};
  let all = S.stems(V, k).filter(s => !NOT_UNIT.test(s) && !/^doctrine_|_(early|mid|late)$|_barrage$/.test(s));
  if (opt.source === 'mod') all = all.filter(s => { const ks = S.frameKeys(V, k, s); return ks && ks.length && V.fromMod(ks[0]); });
  const dfs = U.defs(V);
  const vehOf = s => { const d = dfs.get(s.replace(/_ger2$/, '')); return d && /\/-vehicle\//.test(d) ? d : null; };
  let out;
  if (k.id === 'squad' || k.id === 'portrait') {
    const isHero = s => !armyOfStem(V, s) || /hero|kuznetsov|smirnoff|admiral|borg|consul|corporal|mave|palmer/.test(s);
    out = all.filter(s => (group === 'hero') === isHero(s));
  } else if (k.id === 'scheme' || k.id === 'small' || group === 'vehicle' || group === 'gun') {
    out = all.filter(s => { const d = vehOf(s); return d && (group === 'gun') === (U.clsOf(d) === 'gun'); });
    if (out.length < 3 && group === 'gun') out = all.filter(s => vehOf(s));
  } else if (group === 'hero') out = all.filter(s => /hero/.test(s));
  else out = all.filter(s => /\([a-z0-9]+\)$/.test(s) && !vehOf(s) && !/hero|kamikaze|civilian/.test(s));
  return out.map(s => ({ stem: s, army: armyOfStem(V, s) }));
}
// spread a list down to max items
const spread = (a, max) => { if (a.length <= max) return a.slice(); const o = []; for (let i = 0; i < max; i++) o.push(a[Math.floor(i * a.length / max)]); return o; };
function loadSets(V, k, stems) {
  const out = [], seen = new Set();
  for (const s of stems) {
    const keys = S.frameKeys(V, k, s); if (!keys || !keys.length) continue;
    const id = keys.join('|'); if (seen.has(id)) continue; seen.add(id);
    const f = S.frames(V, k, s); if (f && f.length) out.push({ stem: s, keys, f });
  }
  return out;
}
// majority size and frame count; drop the rest
function trimSets(sets) {
  if (!sets.length) return { sets, W: 0, H: 0, nf: 0 };
  const cnt = (f) => { const m = new Map(); for (const s of sets) { const q = f(s); m.set(q, (m.get(q) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1] || (typeof b[0] === 'number' ? b[0] - a[0] : 0))[0][0]; };
  const size = cnt(s => s.f[0].w + 'x' + s.f[0].h), [W, H] = size.split('x').map(Number);
  let use = sets.filter(s => s.f[0].w === W && s.f[0].h === H && s.f.every(p => p.w === W && p.h === H));
  const nf = cnt(s => s.f.length); use = use.filter(s => s.f.length >= nf);
  // pixel-identical duplicates (one picture under two names) count once
  const u = []; for (const s of use) if (!u.some(t => I.same(t.f[0], s.f[0]))) u.push(s);
  return { sets: u, W, H, nf };
}

// ---------- per pixel helpers ----------
function plural(pics, N) {
  // pics: [picture] of one frame; -> { mem: Uint32Array bitmask of the biggest agreeing group, cnt: Uint8Array }
  const n = pics.length, mem = new Uint32Array(N), cnt = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const o = i * 4; let best = 0, bm = 0;
    for (let r = 0; r < n; r++) {
      let m = 0, c = 0; const a = pics[r].d;
      for (let q = 0; q < n; q++) if (near(a, o, pics[q].d, o)) { m |= (1 << q); c++; }
      if (c > best) { best = c; bm = m; }
    }
    mem[i] = bm; cnt[i] = best;
  }
  return { mem, cnt };
}
// the background cluster of each pixel, coherent in space: a badge or a weapon drawn the same by many cards can win the plain
// vote at a pixel; here the pixels most cards agree on are decided first, and every other pixel takes the cluster (2+ cards) whose
// value goes on best from its decided neighbours (the flag around a chevron, the plate around a rifle)
function coherent(pics, W, H, keep) {
  const N = W * H, n = pics.length, P = plural(pics, N), mem = new Uint32Array(N), cnt = new Uint8Array(N), done = new Uint8Array(N), hid = new Uint8Array(N), val = new Float32Array(N * 4);
  const clusters = i => {
    const o = i * 4, out = []; let left = 0; for (let r = 0; r < n; r++) left |= (1 << r);
    while (left) {
      let best = 0, bm = 0;
      for (let r = 0; r < n; r++) { if (!(left & (1 << r))) continue; let m = 0, c = 0; for (let q = 0; q < n; q++) if ((left & (1 << q)) && near(pics[r].d, o, pics[q].d, o)) { m |= (1 << q); c++; } if (c > best) { best = c; bm = m; } }
      if (best < 2) break;
      const v = [0, 0, 0, 0]; for (let r = 0; r < n; r++) if (bm & (1 << r)) for (let c = 0; c < 4; c++) v[c] += pics[r].d[o + c] / best;
      out.push({ m: bm, c: best, v }); left &= ~bm;
    }
    return out;
  };
  const set = (i, cl) => { mem[i] = cl.m; cnt[i] = cl.c; done[i] = 1; for (let c = 0; c < 4; c++) val[i * 4 + c] = cl.v[c]; };
  const seed = Math.max(2, Math.ceil(n * 0.6)), C = new Array(N);
  for (let i = 0; i < N; i++) { C[i] = clusters(i); if (C[i].length && C[i][0].c >= seed && !(C[i][1] && C[i][1].c >= 2)) set(i, C[i][0]); }
  for (const need of [4, 3, 2, 1]) {
    for (let changed = true; changed;) {
      changed = false;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x; if (done[i]) continue;
        const nb = [0, 0, 0, 0]; let k = 0;
        for (let j = -1; j <= 1; j++) for (let q = -1; q <= 1; q++) { if (!j && !q) continue; const X = x + q, Y = y + j; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const t = Y * W + X; if (!done[t]) continue; k++; for (let c = 0; c < 4; c++) nb[c] += val[t * 4 + c]; }
        if (k < need) continue;
        let best = null, bd = 1e9, bc = 1e9;
        for (const cl of C[i]) { const cd = Math.abs(cl.v[0] - nb[0] / k) + Math.abs(cl.v[1] - nb[1] / k) + Math.abs(cl.v[2] - nb[2] / k) + Math.abs(cl.v[3] - nb[3] / k) * 0.5, d = cd - cl.c * 0.5; if (d < bd) { bd = d; bc = cd; best = cl; } }
        // no group goes on from the plate around it (every card draws over it here, in the same flat tone): hidden, carried on
        // with the neighbours' value so the plate keeps growing past it
        if (!best || (bc > 90 && !(keep && keep[i]))) { mem[i] = 0; cnt[i] = 0; done[i] = 1; hid[i] = 1; for (let c = 0; c < 4; c++) val[i * 4 + c] = nb[c] / k; }
        else set(i, best);
        changed = true;
      }
    }
  }
  for (let i = 0; i < N; i++) if (!done[i]) { mem[i] = P.mem[i]; cnt[i] = 0; hid[i] = 1; }
  return { mem, cnt, hid };
}
function medOf(pics, mem, N, W, H) {
  const p = I.blank(W, H), n = pics.length, v = [];
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    for (let c = 0; c < 4; c++) { v.length = 0; for (let r = 0; r < n; r++) if (mem[i] & (1 << r)) v.push(pics[r].d[o + c]); p.d[o + c] = v.length ? median(v) : 0; }
  }
  return p;
}
function dilate(m, W, H, r) {
  const o = new Uint8Array(m.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!m[y * W + x]) continue;
    for (let j = -r; j <= r; j++) for (let q = -r; q <= r; q++) { const X = x + q, Y = y + j; if (X >= 0 && Y >= 0 && X < W && Y < H) o[Y * W + X] = 1; }
  }
  return o;
}
function comps(m, W, H) {
  const lab = new Int32Array(m.length).fill(-1), out = [];
  for (let i = 0; i < m.length; i++) {
    if (!m[i] || lab[i] >= 0) continue;
    const st = [i], c = { px: [], x0: W, y0: H, x1: -1, y1: -1, edge: false }; lab[i] = out.length;
    while (st.length) {
      const j = st.pop(), x = j % W, y = (j / W) | 0; c.px.push(j);
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      if (!x || !y || x === W - 1 || y === H - 1) c.edge = true;
      for (const t of [j - 1, j + 1, j - W, j + W]) { if (t < 0 || t >= m.length) continue; if ((t === j - 1 && x === 0) || (t === j + 1 && x === W - 1)) continue; if (m[t] && lab[t] < 0) { lab[t] = out.length; st.push(t); } }
    }
    out.push(c);
  }
  return out;
}
// fill the masked pixels of p from their row: the mirror image of the nearest known pixels on both sides (keeps the texture of a
// flag or plate sharp, unlike a mean), blended by distance; rows with nothing known take the nearest filled row
// fill the hidden pixels smoothly from around them (push-pull: halve with weights until every pixel has a value, then blend back up);
// no rows, no copies of nearby shapes, so nothing of the figure that stood there shows (the AS2 portrait flag behind the man)
function pushPull(p, hide) {
  const lv = [{ w: p.w, h: p.h, c: new Float32Array(p.w * p.h * 4), m: new Float32Array(p.w * p.h) }];
  for (let i = 0; i < p.w * p.h; i++) if (!hide[i] && p.d[i * 4 + 3] > 8) { lv[0].m[i] = 1; for (let c = 0; c < 4; c++) lv[0].c[i * 4 + c] = p.d[i * 4 + c]; }
  while (lv[lv.length - 1].w > 1 || lv[lv.length - 1].h > 1) {
    const a = lv[lv.length - 1], w = Math.max(1, a.w >> 1), h = Math.max(1, a.h >> 1), b = { w, h, c: new Float32Array(w * h * 4), m: new Float32Array(w * h) };
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { const i = y * a.w + x, j = Math.min(h - 1, y >> 1) * w + Math.min(w - 1, x >> 1); const m = a.m[i]; if (!m) continue; b.m[j] += m; for (let c = 0; c < 4; c++) b.c[j * 4 + c] += a.c[i * 4 + c] * m; }
    for (let j = 0; j < w * h; j++) if (b.m[j]) { for (let c = 0; c < 4; c++) b.c[j * 4 + c] /= b.m[j]; b.m[j] = Math.min(1, b.m[j]); }
    lv.push(b);
  }
  for (let l = lv.length - 2; l >= 0; l--) {
    const a = lv[l], b = lv[l + 1];
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
      const i = y * a.w + x, m = a.m[i]; if (m >= 1) continue;
      // bilinear sample of the coarser level
      const fx = Math.min(b.w - 1, Math.max(0, (x - 0.5) / 2)), fy = Math.min(b.h - 1, Math.max(0, (y - 0.5) / 2)), x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(b.w - 1, x0 + 1), y1 = Math.min(b.h - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
      for (let c = 0; c < 4; c++) {
        const v = (b.c[(y0 * b.w + x0) * 4 + c] * (1 - tx) + b.c[(y0 * b.w + x1) * 4 + c] * tx) * (1 - ty) + (b.c[(y1 * b.w + x0) * 4 + c] * (1 - tx) + b.c[(y1 * b.w + x1) * 4 + c] * tx) * ty;
        a.c[i * 4 + c] = a.c[i * 4 + c] * m + v * (1 - m);
      }
      a.m[i] = 1;
    }
  }
  // colour from around (opaque pixels only), alpha kept: the alpha of the place is the class's (shield, corners), not a mix
  const o = I.copy(p); for (let i = 0; i < p.w * p.h; i++) if (hide[i]) for (let c = 0; c < 3; c++) o.d[i * 4 + c] = I.cl(lv[0].c[i * 4 + c]);
  return o;
}
function mirrorFill(p, hide) {
  const W = p.w, H = p.h, o = I.copy(p), done = new Uint8Array(H);
  for (let y = 0; y < H; y++) {
    let any = false; for (let x = 0; x < W; x++) if (!hide[y * W + x]) { any = true; break; }
    if (!any) continue; done[y] = 1;
    for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!hide[i]) continue;
      let xl = x - 1; while (xl >= 0 && hide[y * W + xl]) xl--;
      let xr = x + 1; while (xr < W && hide[y * W + xr]) xr++;
      const smp = (e, dir) => { if (e < 0 || e >= W) return null; let m = e - dir * (x - e); if (m < 0 || m >= W || hide[y * W + m]) m = e; return y * W + m; };
      const L = smp(xl, 1), R = smp(xr, -1), dl = x - xl, dr = xr - x;
      for (let c = 0; c < 4; c++) {
        const a = L != null ? p.d[L * 4 + c] : null, b = R != null ? p.d[R * 4 + c] : null;
        o.d[i * 4 + c] = a == null ? b : b == null ? a : I.cl((a * dr + b * dl) / (dl + dr));
      }
    }
  }
  for (let y = 0; y < H; y++) if (!done[y]) { for (let d = 1; d < H; d++) { const s = done[y - d] ? y - d : done[y + d] ? y + d : -1; if (s >= 0) { for (let x = 0; x < W; x++) { const i = y * W + x; if (hide[i]) for (let c = 0; c < 4; c++) o.d[i * 4 + c] = o.d[(s * W + x) * 4 + c]; } break; } } }
  return o;
}
function lutFit(sum, n) {
  const t = new Float32Array(256), have = [];
  for (let v = 0; v < 256; v++) if (n[v] >= 3) { t[v] = sum[v] / n[v]; have.push(v); }
  if (!have.length) { for (let v = 0; v < 256; v++) t[v] = v; return t; }
  for (let v = 0; v < 256; v++) if (!(n[v] >= 3)) {
    let a = -1, b = -1; for (const h of have) { if (h < v) a = h; else if (h > v && b < 0) b = h; }
    t[v] = a < 0 ? t[b] + (v - b) : b < 0 ? t[a] + (v - a) : t[a] + (t[b] - t[a]) * (v - a) / (b - a);
  }
  return t;
}

// ---------- analyse ----------
function analyse(V, k, group, army, opt) {
  opt = opt || {};
  const all = pick(V, k, group, opt), max = Math.min(31, opt.max || 31), ex = new Set(opt.exclude || []);
  let mine = opt.stems ? opt.stems.map(s => ({ stem: s, army: armyOfStem(V, s) })) : all.filter(x => !ex.has(x.stem) && army && x.army === army);
  let usedArmy = army;
  if (!opt.stems && mine.length < 3) { mine = all.filter(x => !ex.has(x.stem)); usedArmy = ''; }
  const T = trimSets(loadSets(V, k, spread(mine, max).map(x => x.stem)));
  const notes = [];
  const model = { kind: k.id, game: k.game, gid: V.gid, group, army: usedArmy, source: opt.source || 'game', w: T.W || k.w, h: T.H || k.h, frames: T.nf || Math.max(1, k.frames || 1),
    base: K.baseFrame(k.id, T.nf || k.frames || 1), refs: T.sets.map(s => s.stem), allRefs: all.length, notes, template: false };
  if (army && !usedArmy) notes.push('Fewer than 3 ' + k.folder + ' pictures of army ' + army + ' in this class: the layers are read over every army.');
  const n = T.sets.length;
  if (n < 3) {
    model.template = true;
    notes.push(n ? 'Only ' + n + ' reference picture(s) of this class: no clean layer can be read; a reference card is used as the template.' : 'No ' + k.folder + ' pictures of this class in the ' + (opt.source === 'mod' ? 'mod' : 'game') + '.');
    model._sets = T.sets; model.templates = T.sets.map(s => s.stem).concat(all.filter(x => !T.sets.some(s => s.stem === x.stem)).slice(0, 40).map(x => x.stem));
    return model;
  }
  const W = T.W, H = T.H, N = W * H, nf = T.nf, b = model.base, sets = T.sets;
  // background per frame from one membership (the base frame's clusters)
  // the badge areas of the kind: flags and emblems there are sharp, so the "no group goes on" rule is not used there
  const areas = K.badgeAreas(V.gid, k.id, group).map(a => [Math.round(a[0] * W), Math.round(a[1] * H), Math.round(a[2] * W), Math.round(a[3] * H)]);
  const inArea = new Uint8Array(N); for (const a of areas) for (let y = a[1]; y < a[3]; y++) for (let x = a[0]; x < a[2]; x++) inArea[y * W + x] = 1;
  const P = coherent(sets.map(s => s.f[b]), W, H, inArea);
  model.bg = []; for (let f = 0; f < nf; f++) model.bg.push(medOf(sets.map(s => s.f[f]), P.mem, N, W, H));
  // the other armies of the class, each read the same way (all frames)
  const obg = [];
  if (usedArmy) {
    const others = new Map(); for (const x of all) if (x.army && x.army !== usedArmy && !ex.has(x.stem)) { if (!others.has(x.army)) others.set(x.army, []); others.get(x.army).push(x.stem); }
    for (const [, st] of [...others.entries()].sort((p, q) => q[1].length - p[1].length).slice(0, 4)) {
      const t = trimSets(loadSets(V, k, spread(st, 10))); if (t.sets.length < 3 || t.W !== W || t.H !== H || t.nf < nf) continue;
      const q = coherent(t.sets.map(s => s.f[b]), W, H, inArea);
      obg.push({ f: t.sets[0].f.slice(0, nf).map((_, f) => medOf(t.sets.map(s => s.f[f]), q.mem, N, W, H)), cnt: q.cnt, n: t.sets.length });
    }
  }
  // a pixel every other army shows the same (the shared plate) where this army's choice differs: the subjects of this army
  // covered the plate there; take this army's cards that show the shared value, else the shared value itself
  const viaOthers = new Uint8Array(N);
  if (obg.length >= 2) for (let i = 0; i < N; i++) {
    const o0 = obg[0].f[b].d, j = i * 4;
    if (!obg.every(o => o.cnt[i] >= 2 && near(o.f[b].d, j, o0, j)) || near(model.bg[b].d, j, o0, j)) continue;
    let m = 0, c = 0; for (let r = 0; r < n; r++) if (near(sets[r].f[b].d, j, o0, j)) { m |= (1 << r); c++; }
    P.mem[i] = m; P.cnt[i] = c;
    for (let f = 0; f < nf; f++) for (let ch = 0; ch < 4; ch++) {
      const v = []; if (c) { for (let r = 0; r < n; r++) if (m & (1 << r)) v.push(sets[r].f[f].d[j + ch]); } else for (const o of obg) v.push(o.f[f].d[j + ch]);
      model.bg[f].d[j + ch] = median(v);
    }
    if (c < 2) viaOthers[i] = 1;
  }
  model.conf = new Float32Array(N); const hidden = new Uint8Array(N);
  for (let i = 0; i < N; i++) { model.conf[i] = P.cnt[i] / n; if ((P.cnt[i] < 2 || P.cnt[i] / n < 0.25) && !viaOthers[i]) hidden[i] = 1; }
  // alpha envelope: what alpha a subject may have at a pixel (the 90th percentile of the references), e.g. the rounded card corners,
  // the shield of the squad icon, the soft lower edge of a GoH portrait
  const env = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const a = sets.map(s => s.f[b].d[i * 4 + 3]).sort((x, y) => x - y); env[i] = a[Math.min(n - 1, Math.floor(n * 0.9))]; }
  model.env = env;
  // frame: all references agree, within 3 px of an alpha edge or the picture edge
  const fr = new Uint8Array(N), edgeA = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!x || !y || x === W - 1 || y === H - 1 || model.bg[b].d[i * 4 + 3] < 128) edgeA[i] = 1; }
  const nearEdge = dilate(edgeA, W, H, 3);
  for (let i = 0; i < N; i++) if (nearEdge[i] && P.cnt[i] / n >= 0.95 && model.bg[b].d[i * 4 + 3] >= 128) fr[i] = 1;
  model.frame = fr;
  // other armies: where the background differs between armies (flag, strip) and a figure every army draws the same (generic)
  model.armyMask = null; model.generic = null;
  {
    if (obg.length) {
      const am = new Uint8Array(N), cross = new Uint8Array(N);
      for (let i = 0; i < N; i++) { let diff = 0; for (const o of obg) if (!near(model.bg[b].d, i * 4, o.f[b].d, i * 4)) diff++; if (diff * 2 > obg.length) am[i] = 1; else if (!diff && obg.every(o => o.cnt[i] / o.n >= 0.95)) cross[i] = 1; }
      model.armyMask = am;
      // the class figure: dark and (nearly) the same in every army while the flag behind differs; it is drawn a little transparent,
      // so the armies differ by a few levels there (AS2 portrait man: lum 19..45, spread up to 17 over 5 armies [V measured])
      const cand = new Uint8Array(N); if (obg.length >= 2) for (let i = 0; i < N; i++) { if (fr[i] || P.cnt[i] / n < 0.9) continue; const ls = [lum(model.bg[b].d, i * 4)].concat(obg.map(o => lum(o.f[b].d, i * 4))); if (ls[0] <= 45 && Math.max(...ls) - Math.min(...ls) <= 20) cand[i] = 1; }
      const cs = comps(cand, W, H).filter(c => c.px.length > N * 0.05 && c.px.length < N * 0.45 && c.x1 - c.x0 < W * 0.8 && (c.x0 + c.x1) / 2 > W * 0.25 && (c.x0 + c.x1) / 2 < W * 0.75).sort((p, q) => q.px.length - p.px.length);
      if (cs.length) {
        const c = cs[0], m = new Uint8Array(N); for (const j of c.px) m[j] = 1;
        const ring = dilate(m, W, H, 3); let li = 0, ni = 0, lo = 0, no = 0;
        for (let i = 0; i < N; i++) { const l = lum(model.bg[b].d, i * 4); if (m[i]) { li += l; ni++; } else if (ring[i]) { lo += l; no++; } }
        if (ni && no && li / ni < lo / no - 10) { model.generic = { mask: m, box: [c.x0, c.y0, c.x1 - c.x0 + 1, c.y1 - c.y0 + 1], tone: 'dark' }; notes.push('Every reference of every army draws the same figure at the same place (the class figure): the background under it is never shown by the game, so where your subject does not cover it, it is filled from the rows beside it.'); }
      }
    }
  }
  const fillMask = new Uint8Array(N); for (let i = 0; i < N; i++) fillMask[i] = hidden[i] || (model.generic && model.generic.mask[i]) ? 1 : 0;
  model.fill = model.bg.map(p => mirrorFill(p, fillMask));
  // each reference against the background: what it draws over it (at a hidden pixel, against the filled plate, looser)
  const D = sets.map((s, r) => { const m = new Uint8Array(N); for (let i = 0; i < N; i++) if (!(P.mem[i] & (1 << r)) && !fr[i]) { const a = s.f[b].d, hd = hidden[i], q = hd ? model.fill[b].d : model.bg[b].d, o = i * 4, t = hd ? 30 : 12; if (Math.hypot(a[o] - q[o], a[o + 1] - q[o + 1], a[o + 2] - q[o + 2]) > t || Math.abs(a[o + 3] - q[o + 3]) > 2 * t) m[i] = 1; } return m; });
  // badges: in the kind's badge areas, regions two references draw pixel-identical; classes = distinct contents per zone
  const heat = new Uint16Array(N);
  for (let r = 0; r < n; r++) for (let q = r + 1; q < n; q++) {
    const e = []; const A = sets[r].f[b].d, B = sets[q].f[b].d;
    for (let i = 0; i < N; i++) if (inArea[i] && D[r][i] && D[q][i] && same(A, i * 4, B, i * 4)) e.push(i);
    if (e.length >= 12) for (const i of e) heat[i]++;
  }
  const hm = new Uint8Array(N); for (let i = 0; i < N; i++) hm[i] = heat[i] ? 1 : 0;
  let zones = comps(dilate(hm, W, H, 2), W, H).filter(c => c.px.length >= 16).map(c => [Math.max(0, c.x0 - 1), Math.max(0, c.y0 - 1), Math.min(W - 1, c.x1 + 1), Math.min(H - 1, c.y1 + 1)]);
  // merge zones in the same badge area into one box (a badge of another class may be a little larger)
  const merged = [];
  for (const a of areas) { const zs = zones.filter(z => z[0] >= a[0] - 2 && z[2] <= a[2] + 2 && z[1] >= a[1] - 2 && z[3] <= a[3] + 2); if (!zs.length) continue; merged.push([Math.min(...zs.map(z => z[0])), Math.min(...zs.map(z => z[1])), Math.max(...zs.map(z => z[2])), Math.max(...zs.map(z => z[3]))]); }
  zones = merged;
  const badges = [], ofRef = sets.map(() => []);
  zones.forEach((z, zi) => {
    const zw = z[2] - z[0] + 1, zh = z[3] - z[1] + 1, cls = [];
    sets.forEach((s, r) => {
      const m = new Uint8Array(zw * zh); let c = 0;
      for (let y = 0; y < zh; y++) for (let x = 0; x < zw; x++) { const i = (z[1] + y) * W + z[0] + x; if (D[r][i]) { m[y * zw + x] = 1; c++; } }
      if (c < 6) return;
      const md = dilate(m, zw, zh, 1);
      const hit = cls.find(cl => { for (let j = 0; j < zw * zh; j++) { if (md[j] !== cl.m[j]) return false; if (md[j]) { const i = ((z[1] + ((j / zw) | 0)) * W + z[0] + j % zw) * 4; if (!same(s.f[b].d, i, sets[cl.r].f[b].d, i)) return false; } } return true; });
      if (hit) { hit.users.push(s.stem); ofRef[r].push(hit.id); return; }
      const id = 'z' + zi + 'b' + cls.length; cls.push({ id, r, m: md, users: [s.stem] }); ofRef[r].push(id);
    });
    for (const c of cls) {
      // the badge carries its own strip where the background is hidden (the game never shows the flag under the badges there)
      const frames = sets[c.r].f.map(p => { const o = I.blank(zw, zh); for (let j = 0; j < zw * zh; j++) { const i = ((z[1] + ((j / zw) | 0)) * W + z[0] + j % zw) * 4; if (!c.m[j] && !hidden[i / 4]) continue; for (let q = 0; q < 4; q++) o.d[j * 4 + q] = p.d[i + q]; } return o; });
      badges.push({ id: c.id, zone: zi, box: [z[0], z[1], zw, zh], users: c.users, frames, ink: c.m.reduce((p, v) => p + v, 0) });
    }
  });
  badges.sort((p, q) => q.users.length - p.users.length);
  model.zones = zones.map(z => [z[0], z[1], z[2] - z[0] + 1, z[3] - z[1] + 1]); model.badges = badges; model._badgeOf = ofRef;
  const inZone = new Uint8Array(N); for (const z of zones) for (let y = z[1]; y <= z[3]; y++) for (let x = z[0]; x <= z[2]; x++) inZone[y * W + x] = 1;
  // subjects: what each reference draws outside the badge zones, specks dropped
  const SM = D.map(m => { const s = new Uint8Array(N); for (let i = 0; i < N; i++) s[i] = m[i] && !inZone[i] ? 1 : 0; for (const c of comps(s, W, H)) if (c.px.length < 8) for (const j of c.px) s[j] = 0; return s; });
  model._D = D; model._SM = SM; model._sets = sets; model._P = P;
  // hidden background: no two references show it; the class figure counts as hidden for a new subject
  model.hidden = hidden;
  let clean = 0; for (let i = 0; i < N; i++) if (!hidden[i]) clean++;
  model.clean = clean / N;
  // ---------- subject measures ----------
  const sub = { draws: 'subject' };
  const masks = model.generic ? [model.generic.mask] : SM, srcPics = model.generic ? [model.bg[b]] : sets.map(s => s.f[b]);
  const bx = [], area = [];
  masks.forEach(m => { let x0 = W, y0 = H, x1 = -1, y1 = -1, c = 0; for (let i = 0; i < N; i++) if (m[i]) { c++; const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } area.push(c); if (c >= 12) bx.push([x0, y0, x1, y1]); });
  if (median(area) < N * 0.015 && badges.length) sub.draws = 'badge';
  if (bx.length) {
    const q = [0, 1, 2, 3].map(j => Math.round(median(bx.map(v => v[j]))));
    sub.box = [q[0], q[1], q[2] - q[0] + 1, q[3] - q[1] + 1];
    sub.height = Math.round(median(bx.map(v => v[3] - v[1] + 1))); sub.width = Math.round(median(bx.map(v => v[2] - v[0] + 1)));
    sub.baseline = q[3]; sub.cx = Math.round(median(bx.map(v => (v[0] + v[2]) / 2)));
  } else { sub.box = [Math.round(W * 0.1), Math.round(H * 0.1), Math.round(W * 0.8), Math.round(H * 0.8)]; sub.height = sub.box[3]; sub.width = sub.box[2]; sub.baseline = sub.box[1] + sub.box[3] - 1; sub.cx = Math.round(W / 2); }
  // look: per reference, a flat, low-colour inner subject is a silhouette
  const inner = (m, i) => { const x = i % W; return m[i] && x > 0 && x < W - 1 && m[i - 1] && m[i + 1] && m[i - W] && m[i + W]; };
  let flat = 0, counted = 0; const tr = [], tg = [], tb = [], mean = [[], [], []], sd = [[], [], []];
  masks.forEach((m, r) => {
    const d = srcPics[r].d, t = [], sa = [], ch = [[], [], []];
    for (let i = W; i < N - W; i++) if (inner(m, i) && d[i * 4 + 3] > 128) { const o = i * 4, mx = Math.max(d[o], d[o + 1], d[o + 2]), mn = Math.min(d[o], d[o + 1], d[o + 2]); t.push(lum(d, o)); sa.push(mx ? (mx - mn) / mx : 0); for (let c = 0; c < 3; c++) ch[c].push(d[o + c]); }
    if (t.length < 12) return;
    counted++; const tm = median(t); if (median(t.map(v => Math.abs(v - tm))) < 14 && median(sa) < 0.35) flat++;
    tr.push(median(ch[0])); tg.push(median(ch[1])); tb.push(median(ch[2]));
    for (let c = 0; c < 3; c++) { const mu = ch[c].reduce((p, v) => p + v, 0) / ch[c].length; mean[c].push(mu); sd[c].push(Math.sqrt(ch[c].reduce((p, v) => p + (v - mu) * (v - mu), 0) / ch[c].length)); }
  });
  sub.look = (model.generic || (counted && flat * 2 > counted)) ? 'silhouette' : 'colour';
  sub.tone = counted ? [median(tr), median(tg), median(tb)].map(Math.round) : null;
  sub.stats = counted ? { mean: mean.map(a => Math.round(median(a))), sd: sd.map(a => Math.round(median(a))) } : null;
  // light map of a silhouette: the lum of each cell of its box against the subject's median lum (soft light from one side)
  if (sub.look === 'silhouette') {
    const GX = 4, GY = 6, cells = Array.from({ length: GX * GY }, () => []);
    masks.forEach((m, r) => {
      const d = srcPics[r].d; let x0 = W, y0 = H, x1 = -1, y1 = -1; const ls = [];
      for (let i = 0; i < N; i++) if (m[i]) { const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; ls.push(lum(d, i * 4)); }
      if (x1 < 0) return; const mm = median(ls) || 1, acc = Array.from({ length: GX * GY }, () => []);
      for (let i = 0; i < N; i++) if (inner(m, i)) { const x = i % W, y = (i / W) | 0, cx = Math.min(GX - 1, Math.floor((x - x0) / (x1 - x0 + 1) * GX)), cy = Math.min(GY - 1, Math.floor((y - y0) / (y1 - y0 + 1) * GY)); acc[cy * GX + cx].push(lum(d, i * 4) / mm); }
      acc.forEach((a, j) => { if (a.length >= 3) cells[j].push(median(a)); });
    });
    sub.light = { gx: GX, gy: GY, v: cells.map(a => (a.length ? Math.round(median(a) * 100) / 100 : 1)) };
  }
  model.subject = sub;
  // no clean layer: the background is hidden outside the place where the class draws its subject (inside it, the new subject
  // covers it and the few pixels left are filled from their rows)
  { const bxx = sub.box; let out = 0; for (let i = 0; i < N; i++) if (hidden[i] && !inArea[i]) { const x = i % W, y = (i / W) | 0; if (x < bxx[0] - 2 || x > bxx[0] + bxx[2] + 1 || y < bxx[1] - 2 || y > bxx[1] + bxx[3] + 1) out++; }
    model.hiddenOut = out / N;
    if (out / N > 0.08) { model.template = true; notes.push('The background is hidden outside the subject place in ' + Math.round(out / N * 100) + '% of the picture in every reference: no clean layer; a reference card is used as the template.'); } }
  // ---------- frame transforms ----------
  model.tf = [];
  // the transforms are fitted on clear subject and badge pixels only: far from the plate under them in the base frame (an edge
  // pixel half plate would teach the table the plate's change: AS2 pressed cards swap the plate to red and keep the vehicle)
  const PB = model.bg[b].d, PF = model.fill[b].d;
  const over = SM.map((m, r) => { const o = new Uint8Array(N), d = sets[r].f[b].d; for (let i = 0; i < N; i++) { if (!(m[i] || (D[r][i] && inZone[i]))) continue; const q = model.hidden[i] ? PF : PB, j = i * 4; o[i] = Math.hypot(d[j] - q[j], d[j + 1] - q[j + 1], d[j + 2] - q[j + 2]) > 40 || Math.abs(d[j + 3] - q[j + 3]) > 60 ? 1 : 0; } return o; });
  for (let f = 0; f < nf; f++) {
    if (f === b) { model.tf.push(null); continue; }
    // three global models, the one with the smaller error over the references wins: a table per channel (hover, pressed), a table
    // from the grey level (locked grey) or a colour matrix (the purple 'not available' squad frame turns gold pink: channels mix)
    const fitLut = grey => {
      const src = sets.map(s => grey ? I.grey(s.f[b]) : s.f[b]);
      const sum = [0, 1, 2, 3].map(() => new Float64Array(256)), cn = [0, 1, 2, 3].map(() => new Float64Array(256));
      sets.forEach((s, r) => { for (let i = 0; i < N; i++) { if (!over[r][i]) continue; for (let c = 0; c < 4; c++) { const x = (c === 3 ? s.f[b] : src[r]).d[i * 4 + c]; sum[c][x] += s.f[f].d[i * 4 + c]; cn[c][x]++; } } });
      return { mode: grey ? 'lum' : 'chan', lut: [0, 1, 2, 3].map(c => lutFit(sum[c], cn[c])) };
    };
    const fitMat = () => {
      const M = [];
      for (let c = 0; c < 3; c++) {
        const A = Array.from({ length: 4 }, () => new Float64Array(5));
        sets.forEach((s, r) => { const d = s.f[b].d, y = s.f[f].d; for (let i = 0; i < N; i++) { if (!over[r][i]) continue; const x = [d[i * 4], d[i * 4 + 1], d[i * 4 + 2], 1]; for (let p = 0; p < 4; p++) { for (let q = 0; q < 4; q++) A[p][q] += x[p] * x[q]; A[p][4] += x[p] * y[i * 4 + c]; } } });
        for (let p = 0; p < 4; p++) A[p][p] += 1e-3;
        for (let p = 0; p < 4; p++) { let m = p; for (let q = p + 1; q < 4; q++) if (Math.abs(A[q][p]) > Math.abs(A[m][p])) m = q; [A[p], A[m]] = [A[m], A[p]]; for (let q = p + 1; q < 4; q++) { const k = A[q][p] / A[p][p]; for (let z = p; z < 5; z++) A[q][z] -= k * A[p][z]; } }
        const w = [0, 0, 0, 0]; for (let p = 3; p >= 0; p--) { let s = A[p][4]; for (let q = p + 1; q < 4; q++) s -= A[p][q] * w[q]; w[p] = s / A[p][p]; }
        M.push(w);
      }
      return { mode: 'mat', M, lut: fitLut(false).lut };
    };
    const errOfModel = t => { let err = 0; sets.forEach((s, r) => { for (let i = 0; i < N; i++) { if (!over[r][i]) continue; for (let c = 0; c < 3; c++) { const d = predict(t, s.f[b].d, i * 4, c) - s.f[f].d[i * 4 + c]; err += Math.min(d * d, 900); } } }); return err; };
    const ident = { mode: 'chan', lut: [0, 1, 2, 3].map(() => Array.from({ length: 256 }, (_, v) => v)) };
    const cands = [ident, fitLut(false), fitLut(true), fitMat()].map(t => Object.assign(t, { err: errOfModel(t) }));
    // the simplest model within 5% of the smallest error wins (a free matrix fits shadows and edges, then tints the subject)
    const emin = Math.min(...cands.map(t => t.err)), best = cands.find(t => t.err <= emin * 1.05);
    // per pixel: y = a * (the global model's value) + b where the references vary enough there, kept to the range they cover;
    // else the global model plus its median miss at that pixel (fixed overlays: the GoH locked stripes)
    const A = new Float32Array(N * 3), B = new Float32Array(N * 3), lo = new Uint8Array(N * 3), hi = new Uint8Array(N * 3), how = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      for (let c = 0; c < 3; c++) {
        const xs = [], ys = [];
        for (let r = 0; r < n; r++) if (over[r][i]) { xs.push(predict(best, sets[r].f[b].d, i * 4, c)); ys.push(sets[r].f[f].d[i * 4 + c]); }
        const k = i * 3 + c;
        if (xs.length >= 6) {
          const mx = xs.reduce((p, v) => p + v, 0) / xs.length, my = ys.reduce((p, v) => p + v, 0) / ys.length;
          let sxx = 0, sxy = 0; for (let j = 0; j < xs.length; j++) { sxx += (xs[j] - mx) * (xs[j] - mx); sxy += (xs[j] - mx) * (ys[j] - my); }
          if (sxx / xs.length >= 64) { const a = Math.max(0, Math.min(3, sxy / sxx)); A[k] = a; B[k] = my - a * mx; lo[k] = I.cl(Math.min(...xs)); hi[k] = I.cl(Math.max(...xs)); how[i] = 1; continue; }
        }
        A[k] = -1; B[k] = xs.length >= 3 ? median(xs.map((x, j) => ys[j] - x)) : 0;
      }
    }
    model.tf.push({ mode: best.mode, grey: best.mode === 'lum', lut: best.lut, M: best.M || null, A, B, lo, hi, perPixel: how.reduce((p, v) => p + v, 0) / N, errs: cands.map(t => (t === ident ? 'id' : t.mode) + ':' + Math.round(Math.sqrt(t.err / Math.max(1, over.reduce((p, m) => p + m.reduce((q, v) => q + v, 0), 0) * 3)))) });
  }
  return model;
}
// the global model of a frame transform at one pixel and channel (d = the base frame's RGBA, o = the pixel offset)
function predict(t, d, o, c) {
  if (t.mode === 'mat') { const w = t.M[c]; return I.cl(w[0] * d[o] + w[1] * d[o + 1] + w[2] * d[o + 2] + w[3]); }
  if (t.mode === 'lum') return t.lut[c][I.cl(0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2])];
  return t.lut[c][d[o + c]];
}

// apply frame f's transform to a picture drawn for the base frame (straight alpha kept, alpha through its table)
function applyTf(model, p, f) {
  const t = model.tf && model.tf[f]; if (!t) return I.copy(p);
  const o = I.copy(p), N = p.w * p.h;
  for (let i = 0; i < N; i++) {
    if (!p.d[i * 4 + 3]) continue;
    for (let c = 0; c < 3; c++) {
      const k = i * 3 + c, v = predict(t, p.d, i * 4, c), a = t.A[k];
      o.d[i * 4 + c] = I.cl(a >= 0 && v >= t.lo[k] - 16 && v <= t.hi[k] + 16 ? a * v + t.B[k] : a >= 0 ? v : v + t.B[k]);
    }
    o.d[i * 4 + 3] = I.cl(t.lut[3][p.d[i * 4 + 3]]);
  }
  return o;
}

// ---------- subject styling ----------
// o: { look: 'auto'|'colour'|'silhouette'|'keep', tone: [r,g,b], height, width, baseline, cx (numbers of the class, editable),
//      scale, dx, dy, mirror, match (0..1 colour match to the class stats), shadow }
function styleSubject(model, src, o) {
  o = o || {};
  const W = model.w, H = model.h, sb = model.subject || {}, b0 = I.bbox(src, 8);
  if (!b0) return null;
  let s = I.crop(src, b0[0], b0[1], b0[2], b0[3]);
  if (o.mirror) s = I.mirror(s);
  const hgt = Number(o.height) || sb.height || H, wid = Number(o.width) || sb.width || W;
  let k = Math.min(hgt / s.h, (wid * 1.15) / s.w); k *= Number(o.scale) || 1;
  const sw = Math.max(1, Math.round(s.w * k)), sh = Math.max(1, Math.round(s.h * k));
  s = I.resize(s, sw, sh);
  const look = o.look && o.look !== 'auto' ? o.look : sb.look || 'colour';
  if (look === 'silhouette') {
    const tone = o.tone || sb.tone || [60, 56, 50], L = sb.light;
    const t = I.silhouette(s, tone);
    if (L) for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const v = L.v[Math.min(L.gy - 1, Math.floor(y / sh * L.gy)) * L.gx + Math.min(L.gx - 1, Math.floor(x / sw * L.gx))]; const i = (y * sw + x) * 4; for (let c = 0; c < 3; c++) t.d[i + c] = I.cl(t.d[i + c] * v); }
    s = t;
  } else if (look === 'colour' && sb.stats && o.match !== 0) {
    // colour match: each channel's mean and spread moved toward the class's measured ones (strength o.match, default 0.6)
    const m = o.match == null ? 0.6 : Number(o.match), st = I.stats(s), mu = [0, 0, 0], sd = [0, 0, 0]; let n = 0;
    for (let i = 0; i < sw * sh; i++) if (s.d[i * 4 + 3] > 128) { n++; for (let c = 0; c < 3; c++) mu[c] += s.d[i * 4 + c]; }
    if (n && st) {
      for (let c = 0; c < 3; c++) mu[c] /= n;
      for (let i = 0; i < sw * sh; i++) if (s.d[i * 4 + 3] > 128) for (let c = 0; c < 3; c++) sd[c] += (s.d[i * 4 + c] - mu[c]) ** 2;
      for (let c = 0; c < 3; c++) sd[c] = Math.sqrt(sd[c] / n) || 1;
      for (let i = 0; i < sw * sh; i++) for (let c = 0; c < 3; c++) { const v = s.d[i * 4 + c], t = (v - mu[c]) / sd[c] * sb.stats.sd[c] + sb.stats.mean[c]; s.d[i * 4 + c] = I.cl(v + (t - v) * m); }
    }
  }
  if (look === 'colour' && o.shadow) s = I.shadow(s, 1, 2, 2, 0.45);
  const out = I.blank(W, H);
  const cx = Number.isFinite(Number(o.cx)) && o.cx !== '' ? Number(o.cx) : sb.cx, base = Number.isFinite(Number(o.baseline)) && o.baseline !== '' ? Number(o.baseline) : sb.baseline;
  I.over(out, s, Math.round(cx - sw / 2 + (Number(o.dx) || 0)), Math.round(base - sh + 1 + (Number(o.dy) || 0)), 1);
  // the class's alpha envelope (rounded corners, shield, soft lower edge)
  if (model.env) for (let i = 0; i < W * H; i++) out.d[i * 4 + 3] = Math.min(out.d[i * 4 + 3], model.env[i]);
  return out;
}

// ---------- compose ----------
// a transformed subject q put on p by the base subject's cover (alpha of base): where the base frame is fully the subject, the
// other frame IS the transformed pixel, alpha included (AS2 squad frame 0 is the subject at 75% alpha, not that over the plate)
function lay(p, q, base, t) {
  const top = t && t.lut ? t.lut[3][255] : 255;
  for (let i = 0; i < p.w * p.h; i++) {
    const a = base.d[i * 4 + 3] / 255; if (!a) continue;
    for (let c = 0; c < 3; c++) p.d[i * 4 + c] = I.cl(p.d[i * 4 + c] * (1 - a) + q.d[i * 4 + c] * a);
    p.d[i * 4 + 3] = I.cl(p.d[i * 4 + 3] * (1 - a) + top * a);
  }
}

// subject: a picture (any size, alpha = the subject) or null. o:
//   badge: a badge id of model.badges | 'none' | a picture (the user's own badge) | undefined (= the most used one)
//   layers: { background, army, frame, badge, subject } (false hides it; preview only)
//   raw: { pic, x, y } a subject already in the style at canvas size (fidelity), skips styleSubject
//   template: stem of the reference card to copy when model.template (default the first)
//   + styleSubject options
function compose(model, subject, o) {
  o = o || {};
  const W = model.w, H = model.h, N = W * H, nf = model.frames, b = model.base, ly = Object.assign({ background: true, army: true, frame: true, badge: true, subject: true }, o.layers || {});
  let bg = model.bg, fill = model.fill;
  if (model.template) {
    const sets = model._sets || []; const t = sets.find(s => s.stem === o.template) || sets[0];
    if (!t) throw new Error('No picture of this class to use as the template.');
    bg = t.f; fill = t.f;
  }
  const subj = o.raw ? o.raw.pic : subject && ly.subject && (model.subject || {}).draws !== 'badge' ? styleSubject(model, subject, o) : null;
  // badge
  let bd = null;
  if (o.badge && typeof o.badge === 'object' && o.badge.d) {
    const z = model.zones && model.zones[0];
    // drawn over the strip of the game badge that covers least (the strip without any badge is never shown by the game)
    if (z) { const f = I.fit(o.badge, z[2], z[3], { mode: 'contain' }); const under = (model.badges || []).filter(x => x.box[0] === z[0] && x.box[1] === z[1]).sort((p, q) => p.ink - q.ink)[0] || null; bd = { box: z, own: f, under }; }
  } else if (o.badge !== 'none' && model.badges && model.badges.length && !model.template) {
    bd = model.badges.find(x => x.id === o.badge) || (o.badge === undefined ? model.badges[0] : null);
  }
  // a subject drawn by the user hides the class figure: the background there is filled
  const subA = subj ? new Uint8Array(N) : null; if (subj) for (let i = 0; i < N; i++) subA[i] = subj.d[i * 4 + 3];
  const frames = [];
  for (let f = 0; f < Math.max(1, nf); f++) {
    const B = bg[Math.min(f, bg.length - 1)], F = fill[Math.min(f, fill.length - 1)], p = I.blank(W, H);
    if (ly.background) for (let i = 0; i < N; i++) {
      const useFill = !model.template && (model.hidden[i] || (model.generic && model.generic.mask[i] && subj && !o.raw));
      const src = useFill ? F : B; for (let c = 0; c < 4; c++) p.d[i * 4 + c] = src.d[i * 4 + c];
      if (!ly.army && model.armyMask && model.armyMask[i]) p.d[i * 4 + 3] = 0;
    }
    if (subj) { if (f === b) I.over(p, subj, 0, 0, 1); else lay(p, applyTf(model, subj, f), subj, model.tf[f]); }
    if (bd && ly.badge) {
      if (bd.own) { const z = bd.box, own = I.blank(W, H); if (bd.under) I.over(p, bd.under.frames[Math.min(f, bd.under.frames.length - 1)], z[0], z[1], 1); I.over(own, bd.own, z[0], z[1], 1); if (f === b) I.over(p, own, 0, 0, 1); else lay(p, applyTf(model, own, f), own, model.tf[f]); }
      else { const pic = bd.frames[Math.min(f, bd.frames.length - 1)]; I.over(p, pic, bd.box[0], bd.box[1], 1); }
    }
    if (ly.frame && model.frame && !model.template) for (let i = 0; i < N; i++) if (model.frame[i]) for (let c = 0; c < 4; c++) p.d[i * 4 + c] = B.d[i * 4 + c];
    frames.push(p);
  }
  return { frames, subject: subj, badge: bd ? bd.id || 'own' : 'none' };
}

// ---------- fidelity: take a vanilla card apart and build it again ----------
function errOf(a, b) {
  const N = a.w * a.h, e = new Float32Array(N); let s = 0;
  for (let i = 0; i < N; i++) {
    const o = i * 4, w = Math.max(a.d[o + 3], b.d[o + 3]) / 255;
    const v = (Math.abs(a.d[o] - b.d[o]) + Math.abs(a.d[o + 1] - b.d[o + 1]) + Math.abs(a.d[o + 2] - b.d[o + 2])) / 3 * w;
    e[i] = Math.max(v, Math.abs(a.d[o + 3] - b.d[o + 3])); s += e[i];
  }
  const so = Float32Array.from(e).sort();
  return { mean: s / N, p99: so[Math.floor(N * 0.99)], max: so[N - 1] };
}
function fidelity(V, k, group, army, opt) {
  opt = opt || {};
  const all = pick(V, k, group, opt).filter(x => !army || x.army === army);
  const tests = spread(all, opt.tests || 5), out = [];
  for (const t of tests) {
    let m = analyse(V, k, group, army, Object.assign({}, opt, { exclude: [t.stem] }));
    if (opt.post && !m.template && m.bg) m = opt.post(m, t.stem) || m;
    if (m.template || !m.bg) { out.push({ stem: t.stem, skip: m.notes.slice(-1)[0] || 'template' }); continue; }
    const T = loadSets(V, k, [t.stem])[0]; if (!T || T.f[0].w !== m.w || T.f[0].h !== m.h || T.f.length < m.frames) { out.push({ stem: t.stem, skip: 'size or frames differ' }); continue; }
    const W = m.w, H = m.h, N = W * H, b = m.base, A = T.f[b].d, Bg = m.bg[b].d;
    // its own drawing: every pixel far from the rebuilt background (outside the frame), a 1 px edge kept
    const Fl = m.fill[b].d, d = new Uint8Array(N); for (let i = 0; i < N; i++) { if (m.frame[i]) continue; const o = i * 4, hd = m.hidden[i], q = hd ? Fl : Bg, t = hd ? 30 : 12; if (Math.hypot(A[o] - q[o], A[o + 1] - q[o + 1], A[o + 2] - q[o + 2]) > t || Math.abs(A[o + 3] - q[o + 3]) > 2 * t) d[i] = 1; }
    const dd = dilate(d, W, H, 1);
    // a badge of a class the game has: use that class (as a user picking it would)
    let badge = 'none';
    for (const bc of m.badges) { const z = bc.box; let ok = true, c = 0; for (let y = 0; y < z[3] && ok; y++) for (let x = 0; x < z[2]; x++) { const j = (y * z[2] + x) * 4; if (!bc.frames[b].d[j + 3]) continue; c++; if (!same(bc.frames[b].d, j, A, ((z[1] + y) * W + z[0] + x) * 4)) { ok = false; break; } } if (ok && c) { badge = bc.id; for (let y = 0; y < z[3]; y++) for (let x = 0; x < z[2]; x++) if (bc.frames[b].d[(y * z[2] + x) * 4 + 3]) dd[(z[1] + y) * W + z[0] + x] = 0; break; } }
    // a soft matte of its drawing: cover from the distance to the plate under it (full from 60 up), colour unmixed from the plate,
    // so the base frame comes out the same and the other frames get the plate's change where the drawing lets the plate through
    const raw = I.blank(W, H);
    for (let i = 0; i < N; i++) {
      if (!dd[i]) continue; const o = i * 4, q = m.hidden[i] ? Fl : Bg;
      const a = A[o + 3] && q[o + 3] === A[o + 3] ? Math.max(0.15, Math.min(1, Math.hypot(A[o] - q[o], A[o + 1] - q[o + 1], A[o + 2] - q[o + 2]) / 60)) : 1;
      for (let c = 0; c < 3; c++) raw.d[o + c] = I.cl((A[o + c] - (1 - a) * q[o + c]) / a);
      raw.d[o + 3] = Math.round(A[o + 3] * a);
    }
    const r = compose(m, null, { raw: { pic: raw }, badge });
    out.push({ stem: t.stem, badge, frames: r.frames.map((p, f) => errOf(p, T.f[f])), pics: opt.keep ? { made: r.frames, game: T.f } : undefined });
  }
  const ok = out.filter(x => x.frames);
  const agg = ok.length ? { mean: ok.reduce((p, x) => p + x.frames.reduce((q, e) => q + e.mean, 0) / x.frames.length, 0) / ok.length, p99: Math.max(...ok.map(x => Math.max(...x.frames.map(e => e.p99)))), max: Math.max(...ok.map(x => Math.max(...x.frames.map(e => e.max)))) } : null;
  return { kind: k.id, game: k.game, group, army, refs: all.length, tests: out, agg, cutter: opt.post ? 'gimp' : 'builtin' };
}

// ---------- reporting ----------
function summary(m) {
  return { kind: m.kind, game: m.game, group: m.group, army: m.army, source: m.source, size: m.w + 'x' + m.h, frames: m.frames, base: m.base, refs: m.refs.length, refsShown: m.refs.slice(0, 12), allRefs: m.allRefs,
    template: m.template, templates: m.template ? (m.templates || m.refs) : m.refs, clean: m.clean == null ? null : Math.round(m.clean * 100),
    generic: m.generic ? { box: m.generic.box } : null, zones: m.zones || [], badges: (m.badges || []).map(x => ({ id: x.id, users: x.users.length, usersShown: x.users.slice(0, 6), box: x.box })),
    subject: m.subject || null, tf: (m.tf || []).map((t, f) => (t ? { frame: f, model: t.mode, perPixel: Math.round(t.perPixel * 100), errs: t.errs } : { frame: f, base: true })), notes: m.notes };
}
function maskPic(m, W, H, rgb) { const p = I.blank(W, H); for (let i = 0; i < W * H; i++) if (m[i]) { p.d[i * 4] = rgb[0]; p.d[i * 4 + 1] = rgb[1]; p.d[i * 4 + 2] = rgb[2]; p.d[i * 4 + 3] = 170; } return p; }
function layerPics(m) {
  if (m.template) return { template: (m._sets || []).slice(0, 1).map(s => I.dataUrl(s.f[0]))[0] || null };
  const W = m.w, H = m.h, o = { background: I.dataUrl(m.fill[m.base]), backgroundRaw: I.dataUrl(m.bg[m.base]), frame: I.dataUrl(maskPic(m.frame, W, H, [80, 160, 255])), hidden: I.dataUrl(maskPic(m.hidden, W, H, [255, 60, 60])) };
  if (m.armyMask) o.army = I.dataUrl(maskPic(m.armyMask, W, H, [255, 200, 40]));
  if (m.generic) o.generic = I.dataUrl(maskPic(m.generic.mask, W, H, [180, 80, 255]));
  o.badges = (m.badges || []).map(x => ({ id: x.id, pics: x.frames.map(p => I.dataUrl(p)) }));
  return o;
}
module.exports = { pushPull, dilate, spreadOf: spread, analyse, compose, styleSubject, applyTf, fidelity, summary, layerPics, pick, armyOfStem, mirrorFill, errOf };
