// unitcard/look: the game's own card look, read from ALL the cards of a class at run time (no vanilla art in the repo), and new
// cards made in that look. Replaces the median / push-pull plate guess of lib/layers.js for the picture side.
//   classOf(V, k, group, army, opt) -> C        one class = kind x group x army (opt.source 'game'|'mod', opt.max cards)
//     C.plate[f]   clean plate of frame f: per pixel the EXACT value most cards show there (the cards are flat copies of one plate,
//                  so the plate value repeats bit for bit; a subject almost never does) [V measured: AS64 vehicle cards, 200 cards,
//                  every pixel shown clean by 5+ cards]. Pixels no card shows (the AS2 portrait badge box, the squad shield middle)
//                  are made by patch synthesis: smooth base from around + real texture detail copied from known plate (no blur).
//     C.clean[f]   the same with the badge zones cleared (made from around), for kinds whose subject IS the badge
//     C.ring       frame / border pixels every card shows the same, drawn over the subject
//     C.env        alpha envelope (rounded corners, shield, GoH portrait fade)
//     C.mf         matte frame: a frame whose plate changes much while the subject stays (AS2 pressed = red plate). With it the
//                  matte is exact: alpha = 1 - (c0 - cm).(P0 - Pm) / |P0 - Pm|^2. Without it (GoH, single-frame kinds) the matte
//                  comes from the distance to the plate, edges unmixed against the subject colour next to them.
//     C.tf[f]      how frame f draws the subject: a table per channel (or from grey) + a per-pixel residual (fixed overlays: GoH
//                  locked stripes) taken from the plate or the subjects, whichever fits the cards better
//     C.m          measures over the cards' clean cutouts: size (w, h of the subject box), place (bottom, cx, cy), contact shadow
//                  (dy, blur, opacity, colour), colour statistics, role ('colour' render, 'silhouette', 'badge', 'bust', 'scheme')
//   cutout(C, stem) -> { pic (W x H, straight RGBA: alpha = cover), box } | null   the clean subject of one game card
//   compose(C, src, o) -> { frames, subject, why }   src = RGBA picture (any size, alpha = subject); refuses (why) a tiny or
//                  empty source. o: scale, dx, dy, height, width, baseline, cx, cy, look ('auto'|'colour'|'silhouette'|'keep'),
//                  tone [r,g,b], shadow false, match 0..1 (tone match toward the class: brightness, contrast, colour balance; 0.8 default), badgeFrom stem | badge picture, keepScale (src already at card scale),
//                  place 'numbers'|'own' (own: src is a W x H cutout, drawn where it is), plateFrom stem (that card is the plate,
//                  badge box cleared: the AS2 portrait's flag and man belong to the army, only the badge is the unit's)
//   summary(C) -> plain JSON
// Author: unitcard tool (ARSENAL)
// Author: Imperator_Aug (ARSENAL, ia-267599a5)
'use strict';
const I = require('./img'), K = require('./kinds'), S = require('./styles'), Ly = require('./layers');

const MAXC = 360;
const lum = (d, o) => 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
const med = a => { if (!a.length) return 0; const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };
const pct = (a, p) => { if (!a.length) return 0; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * p)))]; };
const key = (d, o) => ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0;

// what each kind draws as its unit-specific subject [V, tools/unitcard/README.md part 4]
const ROLE = {
  as2: { card: { vehicle: 'colour', gun: 'colour', infantry: 'auto', hero: 'auto' }, small: 'colour', squad: 'badge', portrait: { infantry: 'badge', hero: 'bust' }, scheme: 'scheme' },
  goh: { card: 'colour', small: 'colour', shop: 'colour', squad: 'badge', portrait: 'bust' },
};
function roleOf(gid, kid, group) { const r = (ROLE[K.family(gid)] || {})[kid]; return r && typeof r === 'object' ? r[group] || 'colour' : r || 'colour'; }

// ---------- cards ----------
function loadCards(V, k, group, opt) {
  const all = Ly.pick(V, k, group, { source: opt.source });
  const use = Ly.spreadOf(all, opt.max || MAXC), out = [], seen = new Set(), sch = roleOf(V.gid, k.id, group) === 'scheme';
  for (const r of use) {
    let f; try { f = S.frames(V, k, r.stem); } catch (e) { f = null; }
    if (!f || !f.length) continue;
    // the AS2 damage scheme: the picture is the RGB (multiplied in game); alpha holds small steps of 4 (0..24, damage zones [I]),
    // not cover. It is read opaque; the made scheme gets alpha back from the zones rule in compose
    if (sch) { const a = f[0].d.filter((_, j) => (j & 3) === 3); f = f.map(p => { const q = I.copy(p); for (let j = 3; j < q.d.length; j += 4) q.d[j] = 255; return q; }); f.alpha = a; }
    let h = 0; const d = f[0].d; for (let i = 0; i < d.length; i += 7) h = (h * 31 + d[i]) | 0;
    const id = f[0].w + 'x' + f[0].h + ':' + h; if (seen.has(id)) continue; seen.add(id);
    out.push({ stem: r.stem, army: r.army || '', f, za: f.alpha || null });
  }
  // near duplicates (one model under two names, a camo variant): a 16 x 8 grey signature within 2 levels counts once, or the
  // pair's subject repeats bit for bit and passes for the plate; the badge zones do not count (AS2 infantry: one rifle silhouette on
  // many cards under different rank badges)
  { let zs = K.badgeAreas(V.gid, k.id, group); if (zs.some(a => (a[2] - a[0]) * (a[3] - a[1]) > 0.5)) zs = [];   // a badge kind: the badge is the card
    const sig = c => { const p = c.f[0], g = new Float32Array(128); for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { if (zs.some(a => x >= a[0] * p.w && x < a[2] * p.w && y >= a[1] * p.h && y < a[3] * p.h)) continue; const j = ((y * 8 / p.h) | 0) * 16 + ((x * 16 / p.w) | 0); g[j] += lum(p.d, (y * p.w + x) * 4) / (p.w * p.h / 128); } return g; };
    const keep = []; for (const c of out) { const g = sig(c); if (keep.some(k => k.g.length === g.length && k.w === c.f[0].w && k.g.reduce((s, v, j) => s + Math.abs(v - g[j]), 0) / 128 < 2)) continue; keep.push({ c, g, w: c.f[0].w }); } out.length = 0; for (const k of keep) out.push(k.c); }
  // majority size and frame count
  const cnt = fn => { const m = new Map(); for (const c of out) m.set(fn(c), (m.get(fn(c)) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]; };
  if (!out.length) return { cards: [], W: k.w, H: k.h, nf: Math.max(1, k.frames || 1) };
  const [sz] = cnt(c => c.f[0].w + 'x' + c.f[0].h), [W, H] = sz.split('x').map(Number);
  let cards = out.filter(c => c.f.every(p => p.w === W && p.h === H));
  const [nf] = cnt(c => c.f.length); cards = cards.filter(c => c.f.length >= nf).map(c => Object.assign(c, { f: c.f.slice(0, nf) }));
  const layouts = layoutsOf(cards, K.baseFrame(k.id, nf), W, H);
  return { cards, W, H, nf, layouts };
}
// card layouts in one class: a card with a full-height divider line at the same column as several others has a strip left of it
// (AS2 soldier cards: flag strip + badge; AS2 supply vehicles: ammo strip); a card without one is 'full' (gun crew cards, most
// vehicles). [V: measured on AS64 infantry usa (34 strip x32, 18 full) and vehicle ger (15 strip x31, 168 full)]
function dividerOf(p, W, H) {
  let best = 0, bx = -1;
  for (let x = 8; x < W * 0.6; x++) { let n = 0, m = 0; for (let y = 4; y < H - 4; y++) { m++; const o = (y * W + x) * 4, a = lum(p.d, o), l = lum(p.d, o - 4), r = lum(p.d, o + 4); if (Math.abs(a - l) > 14 || Math.abs(a - r) > 14) n++; } if (n / m > best) { best = n / m; bx = x; } }
  return best > 0.8 ? bx : -1;
}
function layoutsOf(cards, b, W, H) {
  if (!cards.length) return [];
  const xs = cards.map(c => dividerOf(c.f[b], W, H)), h = new Map();
  for (const x of xs) if (x >= 0) h.set(x, (h.get(x) || 0) + 1);
  const need = Math.max(3, Math.ceil(cards.length * 0.05)), cl = [];
  for (const [x, n] of [...h].sort((p, q) => q[1] - p[1])) { const c = cl.find(z => Math.abs(z.x - x) <= 1); if (c) c.n += n; else cl.push({ x, n }); }
  const strips = cl.filter(z => z.n >= need);
  cards.forEach((c, i) => { const z = xs[i] >= 0 ? strips.find(s => Math.abs(s.x - xs[i]) <= 1) : null; c.layout = z ? 'strip' + z.x : 'full'; });
  const out = strips.map(z => ({ id: 'strip' + z.x, x: z.x, n: 0 })); out.push({ id: 'full', x: -1, n: 0 });
  for (const c of cards) out.find(l => l.id === c.layout).n++;
  return out.filter(l => l.n).sort((p, q) => q.n - p.n);
}
function cardsOf(V, k, group, opt) {
  const memo = memoOf(V), ck = 'cards|' + k.id + '|' + group + '|' + (opt.source || 'game');
  let L = memo.get(ck); if (!L) { L = loadCards(V, k, group, opt); memo.set(ck, L); }
  return L;
}
// the layouts of a class: [{ id, x (divider column, -1 full), n (cards) }], most cards first; stemLayout(stem) -> id
function layouts(V, k, group, opt) { opt = opt || {}; const L = cardsOf(V, k, group, opt); return L.layouts || []; }
function layoutOfStem(V, k, group, stem, opt) { const L = cardsOf(V, k, group, opt || {}); const c = L.cards.find(x => x.stem === stem); return c ? c.layout : null; }

// per pixel the exact value most of these cards show in frame b (count, value); then frame f's value among the same cards
// light: the classes whose subject is a see-through dark shape of one colour (AS2 infantry cards): that shape over plate pixel i is
// ONE exact value too, and in the middle of the card more cards show it than the plate; of the values shown often, the lightest wins
function modeOf(cards, b, W, H, light, binned) {
  const bin = light || binned;
  const N = W * H, n = cards.length, val = new Uint32Array(N), cnt = new Uint16Array(N), buf = new Uint32Array(n);
  const lk = v => 0.299 * (v >>> 24) + 0.587 * ((v >>> 16) & 255) + 0.114 * ((v >>> 8) & 255);
  for (let i = 0; i < N; i++) {
    // (these plates, and all GoH plates (compressed cards), are not exact copies: the same plate pixel varies by a few levels card to
    // card, so the light and the binned mode
    // counts in 8-level bins and the plate value is the mean of the cards in the winning bin)
    const o = i * 4; for (let r = 0; r < n; r++) buf[r] = bin ? (key(cards[r].f[b].d, o) & 0xF8F8F8F8) >>> 0 : key(cards[r].f[b].d, o);
    buf.sort(); let best = 0, bv = 0, run = 1; const runs = bin ? [] : null;
    for (let r = 1; r <= n; r++) { if (r < n && buf[r] === buf[r - 1]) run++; else { if (runs && run >= 2) runs.push([buf[r - 1], run]); if (run > best) { best = run; bv = buf[r - 1]; } run = 1; } }
    if (runs) {
      const b0 = bv; if (light) for (const [v, c] of runs) if ((c >= Math.max(3, best * 0.15, n * 0.015) && lk(v) > lk(bv) + 12 || c >= 2 && lk(v) > lk(b0) + 40) && (v & 255) >= (bv & 255)) { bv = v; best = c; }
      const m = [0, 0, 0, 0]; let q = 0; for (let r = 0; r < n; r++) if (((key(cards[r].f[b].d, o) & 0xF8F8F8F8) >>> 0) === bv) { for (let c = 0; c < 4; c++) m[c] += cards[r].f[b].d[o + c]; q++; }
      if (q) bv = ((Math.round(m[0] / q) << 24) | (Math.round(m[1] / q) << 16) | (Math.round(m[2] / q) << 8) | Math.round(m[3] / q)) >>> 0;
    }
    val[i] = bv; cnt[i] = best;
  }
  return { val, cnt, n, bin: !!bin };
}
// second pass: each card's vote at a pixel is weighted by how much of the plate around it (9 x 9) the card shows exactly; a card of
// a plate variant (the AS2 supply cards with an icon strip, a card with its own line) then loses where its variant differs
function plateFrames(cards, M, b, nf, W, H) {
  const N = W * H, out = [];
  for (let f = 0; f < nf; f++) {
    const p = I.blank(W, H);
    for (let i = 0; i < N; i++) {
      const o = i * 4;
      if (f === b) { const v = M.val[i]; p.d[o] = v >>> 24; p.d[o + 1] = (v >>> 16) & 255; p.d[o + 2] = (v >>> 8) & 255; p.d[o + 3] = v & 255; continue; }
      // the cards that show the plate at i in the base frame: their frame f value, the most common one
      const m = new Map(); let best = 0, bk = 0;
      if (M.bin) { // binned plate: the mean frame f value of the cards in the base bin
        const vb = (M.val[i] & 0xF8F8F8F8) >>> 0, a = [0, 0, 0, 0]; let q = 0;
        for (const c of cards) { if (((key(c.f[b].d, o) & 0xF8F8F8F8) >>> 0) !== vb) continue; for (let ch = 0; ch < 4; ch++) a[ch] += c.f[f].d[o + ch]; q++; }
        for (let ch = 0; ch < 4; ch++) p.d[o + ch] = q ? Math.round(a[ch] / q) : 0; continue;
      }
      for (const c of cards) { if (key(c.f[b].d, o) !== M.val[i]) continue; const kk = key(c.f[f].d, o), q = (m.get(kk) || 0) + 1; m.set(kk, q); if (q > best) { best = q; bk = kk; } }
      p.d[o] = bk >>> 24; p.d[o + 1] = (bk >>> 16) & 255; p.d[o + 2] = (bk >>> 8) & 255; p.d[o + 3] = bk & 255;
    }
    out.push(p);
  }
  return out;
}

// ---------- synthesis of the pixels no card shows ----------
// smooth base: normalised box blur of the known pixels, holes by push-pull; detail: copied in 4x4 tiles from known plate
// (offset chosen by the best match of the detail already there, vertical offsets cost more: the plates have rows and lines)
function lowOf(p, known, r) {
  const W = p.w, H = p.h, N = W * H, acc = new Float32Array(N * 4), wt = new Float32Array(N);
  for (let i = 0; i < N; i++) if (known[i]) { wt[i] = 1; for (let c = 0; c < 4; c++) acc[i * 4 + c] = p.d[i * 4 + c]; }
  const blur1 = (a, ch) => { // separable box, ch channels
    const t = new Float32Array(a.length), o = new Float32Array(a.length);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < ch; c++) { let s = 0; for (let k = -r; k <= r; k++) { const X = Math.min(W - 1, Math.max(0, x + k)); s += a[(y * W + X) * ch + c]; } t[(y * W + x) * ch + c] = s; }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < ch; c++) { let s = 0; for (let k = -r; k <= r; k++) { const Y = Math.min(H - 1, Math.max(0, y + k)); s += t[(Y * W + x) * ch + c]; } o[(y * W + x) * ch + c] = s; }
    return o;
  };
  const A = blur1(acc, 4), B = blur1(wt, 1), low = I.blank(W, H), hole = new Uint8Array(N);
  for (let i = 0; i < N; i++) { if (B[i] > 0.01) for (let c = 0; c < 4; c++) low.d[i * 4 + c] = I.cl(A[i * 4 + c] / B[i]); else hole[i] = 1; }
  return hole.some(v => v) ? Ly.pushPull(low, hole) : low;
}
// how frame f changes the plate, per pixel: the median change of the trusted plate pixels around (step edges such as the AS2 red
// plate's pale top band stay sharp: the same rows first, the plates run in rows; a stray variant line or speck does not survive a median)
function deltaOf(pb, pf, trust, W, H) {
  const N = W * H, out = new Float32Array(N * 3), buf = [[], [], []];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    for (const [R, Q] of [[3, 1], [12, 1], [400, 1], [400, 3], [400, 8], [400, 400]]) {
      buf[0].length = buf[1].length = buf[2].length = 0;
      for (let Y = Math.max(0, y - Q); Y <= Math.min(H - 1, y + Q); Y++) for (let X = Math.max(0, x - R); X <= Math.min(W - 1, x + R); X++) { const j = Y * W + X; if (!trust[j]) continue; for (let c = 0; c < 3; c++) buf[c].push(pf.d[j * 4 + c] - pb.d[j * 4 + c]); }
      if (buf[0].length >= 9 || Q === 400) break;
    }
    const i = y * W + x; for (let c = 0; c < 3; c++) out[i * 3 + c] = med(buf[c]);
  }
  return out;
}
function synth(pics, known, avoid, seedN) {
  const p0 = pics[0], W = p0.w, H = p0.h, N = W * H;
  const lows = pics.map(p => lowOf(p, known, 3));
  const hf = (p, low, i, c) => p.d[i * 4 + c] - low.d[i * 4 + c];
  const ok = new Uint8Array(N); for (let i = 0; i < N; i++) ok[i] = known[i] && !(avoid && avoid[i]) ? 1 : 0;
  const filled = new Uint8Array(N); for (let i = 0; i < N; i++) filled[i] = known[i];
  const outs = pics.map(p => I.copy(p)), donor = new Int32Array(N).fill(-1);
  // distance of each hole pixel to the known plate (tile order: from the edge inward)
  const dist = new Int32Array(N).fill(1e9), q = [];
  for (let i = 0; i < N; i++) if (known[i]) { dist[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const j = Y * W + X; if (dist[j] > dist[i] + 1) { dist[j] = dist[i] + 1; q.push(j); } } }
  const T = 4, tiles = [];
  for (let ty = 0; ty < H; ty += T) for (let tx = 0; tx < W; tx += T) { let need = false, dm = 1e9; for (let y = ty; y < Math.min(H, ty + T); y++) for (let x = tx; x < Math.min(W, tx + T); x++) if (!known[y * W + x]) { need = true; dm = Math.min(dm, dist[y * W + x]); } if (need) tiles.push({ tx, ty, d: dm }); }
  tiles.sort((a, b) => a.d - b.d || a.ty - b.ty || a.tx - b.tx);
  let seed = seedN || 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const offAt = new Map();
  const P = pics[0], L = lows[0];
  for (const t of tiles) {
    const x0 = Math.max(0, t.tx - 2), y0 = Math.max(0, t.ty - 2), x1 = Math.min(W - 1, t.tx + T + 1), y1 = Math.min(H - 1, t.ty + T + 1);
    const cands = [];
    for (const [ddx, ddy] of [[-T, 0], [T, 0], [0, -T], [0, T]]) { const o = offAt.get((t.tx + ddx) + ',' + (t.ty + ddy)); if (o) cands.push(o); }
    for (let r = 0; r < 90; r++) cands.push([Math.round((rnd() * 2 - 1) * W), Math.round((rnd() * 2 - 1) * Math.min(6, H) * (rnd() < 0.6 ? 0 : 1))]);
    for (let r = 0; r < 40; r++) cands.push([Math.round((rnd() * 2 - 1) * W), Math.round((rnd() * 2 - 1) * H)]);
    let best = null, bs = Infinity;
    for (const [dx, dy] of cands) {
      if (!dx && !dy) continue;
      let s = 0, n = 0, bad = false;
      for (let y = y0; y <= y1 && !bad; y++) for (let x = x0; x <= x1; x++) {
        const X = x + dx, Y = y + dy, inT = x >= t.tx && x < t.tx + T && y >= t.ty && y < t.ty + T;
        if (X < 0 || Y < 0 || X >= W || Y >= H || !ok[Y * W + X]) { if (inT && !known[y * W + x]) { bad = true; break; } continue; }
        const i = y * W + x; if (!filled[i]) continue;
        const j = Y * W + X; const src = known[i] ? P : outs[0];
        for (let c = 0; c < 3; c++) { const e = (src.d[i * 4 + c] - L.d[i * 4 + c]) - hf(P, L, j, c); s += e * e; } n++;
      }
      if (bad) continue;
      const sc = (n ? s / n : 400) + Math.abs(dy) * 6 + (n ? 0 : 1000);
      if (sc < bs) { bs = sc; best = [dx, dy]; }
    }
    if (!best) continue;
    offAt.set(t.tx + ',' + t.ty, best);
    for (let y = t.ty; y < Math.min(H, t.ty + T); y++) for (let x = t.tx; x < Math.min(W, t.tx + T); x++) {
      const i = y * W + x; if (known[i]) continue; const j = (y + best[1]) * W + x + best[0]; donor[i] = j; filled[i] = 1;
      pics.forEach((p, f) => { for (let c = 0; c < 4; c++) outs[f].d[i * 4 + c] = I.cl(lows[f].d[i * 4 + c] + p.d[j * 4 + c] - lows[f].d[j * 4 + c]); });
    }
  }
  // any pixel left (no donor fits): the smooth base
  for (let i = 0; i < N; i++) if (!filled[i]) pics.forEach((p, f) => { for (let c = 0; c < 4; c++) outs[f].d[i * 4 + c] = lows[f].d[i * 4 + c]; });
  return { pics: outs, donor };
}

// ---------- the class ----------
const MEMO = new WeakMap();
function memoOf(V) { if (!MEMO.has(V)) MEMO.set(V, new Map()); return MEMO.get(V); }
function zonesOf(gid, kid, group, W, H) { return K.badgeAreas(gid, kid, group).map(a => [Math.round(a[0] * W), Math.round(a[1] * H), Math.round(a[2] * W), Math.round(a[3] * H)]); }

function classOf(V, k, group, army, opt) {
  opt = opt || {};
  const L = cardsOf(V, k, group, opt), role0 = roleOf(V.gid, k.id, group);
  // the layout: AS2 buy and list cards (a class may hold strip cards and full cards: soldiers and gun crews, supply trucks)
  const lays = K.family(V.gid) === 'as2' && (role0 === 'colour' || role0 === 'auto') ? L.layouts || [] : [];
  const lay = lays.length ? (lays.find(l => l.id === opt.layout) || lays[0]) : null;
  const mk = [k.id, group, army || '', opt.source || 'game', opt.max || MAXC, lay ? lay.id : ''].join('|'), memo = memoOf(V);
  if (memo.has(mk)) return memo.get(mk);
  const { W, H, nf } = L, N = W * H, b = K.baseFrame(k.id, nf), cards = lay ? L.cards.filter(c => c.layout === lay.id) : L.cards;
  const C = { gid: V.gid, fam: K.family(V.gid), kind: k.id, group, army: army || '', source: opt.source || 'game', w: W, h: H, frames: nf, base: b, cards, notes: [],
    layout: lay ? lay.id : '', layouts: lays.map(l => ({ id: l.id, x: l.x, cards: l.n })) };
  if (cards.length < 3) { C.none = cards.length ? 'Only ' + cards.length + ' game picture(s) of this class' + (lay ? ' (layout ' + lay.id + ')' : '') + ': too few to read a clean plate.' : 'No ' + k.folder + ' pictures of this class in the ' + (C.source === 'mod' ? 'mod' : 'game') + '.'; memo.set(mk, C); return C; }
  // zones: a strip layout's strip (divider line included) is one layer picked from a card; a full card of a class whose badge
  // area is a strip has no strip; otherwise the kind's badge areas
  let zones = zonesOf(V.gid, k.id, group, W, H);
  if (lay && lay.x >= 0) zones = [[0, 0, lay.x + 2, H]];
  else if (lay && lays.some(l => l.x >= 0)) zones = zones.filter(z => z[3] - z[1] < H * 0.9);
  const inZone = new Uint8Array(N);
  for (const z of zones) for (let y = z[1]; y < z[3]; y++) for (let x = z[0]; x < z[2]; x++) inZone[y * W + x] = 1;
  C.zones = zones; C.inZone = inZone;
  C.role = role0 === 'auto' && lay && lay.x < 0 && lays.some(l => l.x >= 0) ? 'colour' : role0;   // gun crew cards: a colour render
  const light = C.role === 'auto' || C.fam === 'goh' && C.role === 'colour', binned = C.fam === 'goh';
  // plates: every card of the class, and the army's own cards (flags, emblems, strips differ by army)
  const mmk = 'mode|' + k.id + '|' + group + '|' + C.source + '|' + C.layout;
  const allM = memo.get(mmk) || modeOf(cards, b, W, H, light, binned);
  memo.set(mmk, allM);
  const mine = army ? cards.filter(c => c.army === army) : [];
  const armyM = mine.length >= 3 ? modeOf(mine, b, W, H, light, binned) : null;
  const need = (n, z) => Math.max(3, Math.ceil(n * (z ? 0.3 : 0.015)));
  const known = new Uint8Array(N), knownClean = new Uint8Array(N), armySpec = new Uint8Array(N), useArmy = new Uint8Array(N);
  // army-specific pixels: the army's cards agree strongly on a value every card does not (flag, emblem, strip); a weak army mode
  // (3 of 30 cards) is as often a subject colour, so it only counts next to strong army pixels
  const strong = i => armyM && armyM.cnt[i] >= Math.max(3, Math.ceil(armyM.n * 0.2));
  if (armyM) for (let i = 0; i < N; i++) if (strong(i) && (allM.cnt[i] < need(allM.n, 0) || armyM.val[i] !== allM.val[i])) armySpec[i] = 1;
  const spec = Ly.dilate(armySpec, W, H, 2);
  const cnt = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const aOk = armyM && armyM.cnt[i] >= 3, allOk = allM.cnt[i] >= need(allM.n, 0);
    if (aOk && (spec[i] || !allOk)) { cnt[i] = armyM.cnt[i] / armyM.n; useArmy[i] = 1; known[i] = 1; knownClean[i] = armyM.cnt[i] >= need(armyM.n, inZone[i]) ? 1 : 0; }
    else if (allOk && !spec[i]) { cnt[i] = allM.cnt[i] / allM.n; known[i] = 1; knownClean[i] = allM.cnt[i] >= need(allM.n, inZone[i]) ? 1 : 0; }
  }
  const pa = armyM ? plateFrames(mine, armyM, b, nf, W, H) : null, pl = plateFrames(cards, allM, b, nf, W, H);
  const raw = []; for (let f = 0; f < nf; f++) { const p = I.blank(W, H); for (let i = 0; i < N; i++) { const s = useArmy[i] ? pa[f] : pl[f]; for (let c = 0; c < 4; c++) p.d[i * 4 + c] = s.d[i * 4 + c]; } raw.push(p); }
  // envelope: the alpha cards reach at each pixel (90th percentile)
  C.env = new Uint8Array(N); { const a = new Float64Array(cards.length); for (let i = 0; i < N; i++) { cards.forEach((c, r) => { a[r] = c.f[b].d[i * 4 + 3]; }); a.sort(); C.env[i] = a[Math.min(a.length - 1, Math.floor(a.length * 0.9))]; } }
  // the matte frame: the plate changes much there, the subjects do not (read on the pixels most cards agree on)
  const conf = new Uint8Array(N); for (let i = 0; i < N; i++) conf[i] = known[i] && cnt[i] >= 0.2 ? 1 : 0;
  C.mf = -1;
  if (nf > 1) {
    let best = 0;
    for (let f = 0; f < nf; f++) {
      if (f === b) continue;
      let pc = 0, pn = 0; for (let i = 0; i < N; i++) if (conf[i]) { const o = i * 4; pc += Math.abs(raw[f].d[o] - raw[b].d[o]) + Math.abs(raw[f].d[o + 1] - raw[b].d[o + 1]) + Math.abs(raw[f].d[o + 2] - raw[b].d[o + 2]); pn++; }
      pc /= Math.max(1, pn) * 3;
      const sc = []; for (const c of cards.slice(0, 60)) { const d0 = c.f[b].d, d1 = c.f[f].d, P = raw[b].d; for (let i = 0; i < N; i += 3) { const o = i * 4; if (conf[i] && Math.abs(d0[o] - P[o]) + Math.abs(d0[o + 1] - P[o + 1]) + Math.abs(d0[o + 2] - P[o + 2]) > 150) sc.push((Math.abs(d1[o] - d0[o]) + Math.abs(d1[o + 1] - d0[o + 1]) + Math.abs(d1[o + 2] - d0[o + 2])) / 3); } }
      const sm = med(sc);
      if (pc > 18 && sm < pc * 0.2 && pc - sm > best) { best = pc - sm; C.mf = f; }
    }
  }
  // a plate value few cards show must look like the plate around it (and, with a matte frame, change the way the plate does):
  // a dark value shown by 4 of 200 cards in the middle of a parchment is a vehicle (two cards of one model), not the plate
  {
    const lb = lowOf(raw[b], conf, 4), lm = C.mf >= 0 ? lowOf(raw[C.mf], conf, 4) : null;
    for (let i = 0; i < N; i++) {
      if (!known[i]) continue; const o = i * 4, d = raw[b].d;
      let bad = !conf[i] && Math.max(Math.abs(d[o] - lb.d[o]), Math.abs(d[o + 1] - lb.d[o + 1]), Math.abs(d[o + 2] - lb.d[o + 2])) > 26;
      if (!bad && lm && !conf[i]) { const m = raw[C.mf].d, ch = Math.abs(m[o] - d[o]) + Math.abs(m[o + 1] - d[o + 1]) + Math.abs(m[o + 2] - d[o + 2]), lc = Math.abs(lm.d[o] - lb.d[o]) + Math.abs(lm.d[o + 1] - lb.d[o + 1]) + Math.abs(lm.d[o + 2] - lb.d[o + 2]); if (lc > 60 && (ch < lc * 0.5 || ch > lc * 2)) bad = true; }
      // a thin line or speck of a few cards (a plate variant's divider) stands out of the plate around it
      if (!bad && !conf[i]) { const x = i % W, y = (i / W) | 0, nb = [[], [], []]; for (let Y = Math.max(0, y - 3); Y <= Math.min(H - 1, y + 3); Y++) for (let X = Math.max(0, x - 3); X <= Math.min(W - 1, x + 3); X++) { const j = Y * W + X; if (known[j]) for (let c = 0; c < 3; c++) nb[c].push(d[j * 4 + c]); } if (nb[0].length >= 12 && Math.max(Math.abs(d[o] - med(nb[0])), Math.abs(d[o + 1] - med(nb[1])), Math.abs(d[o + 2] - med(nb[2]))) > 18) bad = true; }
      if (bad) { known[i] = 0; knownClean[i] = 0; }
    }
  }
  // a see-through silhouette class: a plate pixel outside the badge zones far darker than the plate is the silhouette every card
  // there shows (made from around instead)
  if (C.role === 'auto') { const L = []; for (let i = 0; i < N; i++) if (known[i] && !inZone[i]) L.push(lum(raw[b].d, i * 4)); const ml = med(L);
    for (let i = 0; i < N; i++) if (known[i] && !inZone[i] && lum(raw[b].d, i * 4) < ml * 0.7) { const x = i % W, y = (i / W) | 0; if (x > 2 && y > 2 && x < W - 3 && y < H - 3) { known[i] = 0; knownClean[i] = 0; } } }
  // frame ring: shown the same by most cards, within 2 px of the outer edge or an alpha edge
  const edge = new Uint8Array(N); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!x || !y || x === W - 1 || y === H - 1 || C.env[i] < 128) edge[i] = 1; }
  const nearE = Ly.dilate(edge, W, H, 2); C.ring = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (nearE[i] && known[i] && cnt[i] >= 0.5 && C.env[i] >= 128) C.ring[i] = 1;
  // holes made from around; the alpha of a made pixel is the envelope's
  const fill = (k0, seedN) => { const s = synth(raw, k0, C.ring, seedN); for (const p of s.pics) for (let i = 0; i < N; i++) if (!k0[i]) p.d[i * 4 + 3] = C.env[i]; return s; };
  const s1 = fill(known, 7), s2 = fill(knownClean, 11);
  // other frames of pixels not shown clean by many cards: the base plate + the frame's local change (no copied variant, no streak)
  if (nf > 1) { const trust = new Uint8Array(N); for (let i = 0; i < N; i++) trust[i] = conf[i] && known[i] && !nearE[i] ? 1 : 0;
    for (let f = 0; f < nf; f++) { if (f === b) continue; const dl = deltaOf(raw[b], raw[f], trust, W, H);
      for (const s of [s1, s2]) { const pb = s.pics[b].d, pf = s.pics[f].d; for (let i = 0; i < N; i++) { if (trust[i] || (nearE[i] && known[i])) continue; for (let c = 0; c < 3; c++) pf[i * 4 + c] = I.cl(pb[i * 4 + c] + dl[i * 3 + c]); } } } }
  C.plate = s1.pics; C.clean = s2.pics; C.known = known; C.knownClean = knownClean; C.cnt = cnt;
  // a strip layout: the strip (flag + its badge, or the ammo strip) is not averaged: the variants the army's cards draw are listed,
  // most used first, and the plate carries the first; compose takes another by o.strip (a stem of the list)
  // a strip layout of few cards (AS2 supply trucks: 15 cards of a few truck models) shows the same truck where the plate is: the
  // plate right of the strip comes from the class's full cards then (same parchment and frames, many more cards)
  const full = lays.find(l => l.x < 0);
  if (lay && lay.x >= 0 && cards.length < 24 && full && full.n >= 24) {
    const Cf = classOf(V, k, group, army, Object.assign({}, opt, { layout: 'full' }));
    if (!Cf.none) { const zw = Ly.dilate(inZone, W, H, 1); for (const [dst, src] of [[C.plate, Cf.plate], [C.clean, Cf.clean]]) dst.forEach((p, f) => { for (let i = 0; i < N; i++) if (!zw[i]) for (let c = 0; c < 4; c++) p.d[i * 4 + c] = src[f].d[i * 4 + c]; });
      for (let i = 0; i < N; i++) if (!zw[i]) known[i] = Cf.known[i]; C.notes.push('Plate right of the strip taken from the ' + full.n + ' full cards of the class.'); }
  }
  if (lay && lay.x >= 0) {
    const from = mine.length ? mine : cards, z = zones[0], zw = Ly.dilate(inZone, W, H, 1), g = new Map();
    for (const c of from) {
      const d = c.f[b].d, s = []; for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 3; cx++) { let r = 0, gg = 0, bb = 0, n = 0; for (let y = Math.floor(cy * H / 8); y < Math.floor((cy + 1) * H / 8); y++) for (let x = Math.floor(cx * z[2] / 3); x < Math.floor((cx + 1) * z[2] / 3); x++) { const o = (y * W + x) * 4; r += d[o]; gg += d[o + 1]; bb += d[o + 2]; n++; } s.push((r / n) >> 5, (gg / n) >> 5, (bb / n) >> 5); }
      const sk = s.join(','); if (!g.has(sk)) g.set(sk, []); g.get(sk).push(c);
    }
    C.strips = [...g.values()].sort((p, q) => q.length - p.length).map(v => ({ stem: v[0].stem, army: v[0].army, n: v.length, users: v.slice(0, 6).map(c => c.stem) }));
    const top = from.find(c => c.stem === C.strips[0].stem);
    for (const set of [C.plate, C.clean]) set.forEach((p, f) => { const s = top.f[f].d; for (let i = 0; i < N; i++) if (zw[i] && !C.ring[i]) { for (let c = 0; c < 4; c++) p.d[i * 4 + c] = s[i * 4 + c]; known[i] = 1; } });
    C.notes.push(C.strips.length + ' strip variant(s) on the ' + (mine.length ? C.army : 'class') + ' cards; the plate shows the most used (' + C.strips[0].stem + ', ' + C.strips[0].n + ' cards).');
  }
  C.hidden = 0; for (let i = 0; i < N; i++) if (!known[i]) C.hidden++; C.hidden /= N;
  if (C.hidden > 0.001) C.notes.push(Math.round(C.hidden * 1000) / 10 + '% of the plate is shown by no card: made from the plate around it (texture copied, not blurred).');
  C.matte = C.mf >= 0 ? 'pair' : 'distance';
  // GoH portrait: a see-through bust on nothing (no plate): the card itself is the cutout, the plate is empty
  if (C.fam === 'goh' && C.role === 'bust') {
    C.selfCut = true; C.matte = 'alpha'; C.plate = C.plate.map(() => I.blank(W, H)); C.clean = C.plate; C.ring = new Uint8Array(N); C.env = new Uint8Array(N).fill(255); C.hidden = 0;
    C.notes = ['The cards are see-through busts on nothing: the card itself is the cutout, the plate is empty.'];
  }
  memo.set(mk, C);
  measure(C);
  return C;
}
// the plate a card of army a was drawn on (its own army's when the class has one)
function plateFor(V, k, C, a) { if (!a || a === C.army) return C; try { return classOf(V, k, C.group, a, { source: C.source }); } catch (e) { return C; } }

// ---------- matte ----------
// -> { a: Float32Array cover, pic: straight RGBA subject (alpha = cover x own alpha) }
function boxBg(C, c0, Q) {
  const W = C.w, H = C.h, N = W * H, pc = { w: W, h: H, d: c0 }; let keep = new Uint8Array(N); for (let i = 0; i < N; i++) keep[i] = C.inZone[i] && !C.ring[i] ? 1 : 0;
  let bg = null;
  for (const r of [6, 4, 3]) {
    bg = lowOf(pc, keep, r); const sub = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (C.inZone[i]) { const o = i * 4; if (Math.abs(c0[o] - bg.d[o]) + Math.abs(c0[o + 1] - bg.d[o + 1]) + Math.abs(c0[o + 2] - bg.d[o + 2]) > 60) sub[i] = 1; }
    const sd = Ly.dilate(sub, W, H, 1); const k2 = new Uint8Array(N); for (let i = 0; i < N; i++) k2[i] = C.inZone[i] && !C.ring[i] && !sd[i] ? 1 : 0; keep = k2;
  }
  const q = new Uint8ClampedArray(Q); for (let i = 0; i < N; i++) if (C.inZone[i]) { const o = i * 4; for (let c = 0; c < 3; c++) q[o + c] = keep[i] ? c0[o + c] : bg.d[o + c]; q[o + 3] = c0[o + 3]; }
  return { q, keep };
}
function matteOf(C, card, P) {
  P = P || C; const W = C.w, H = C.h, N = W * H, b = C.base, c0 = card.f[b].d, P0 = P.clean[b].d, Pk = P.plate[b].d;
  if (C.selfCut) { const a0 = new Float32Array(N); for (let i = 0; i < N; i++) a0[i] = c0[i * 4 + 3] / 255; return { a: a0, pic: I.copy(card.f[b]), under: I.blank(W, H).d }; }
  const a = new Float32Array(N), hard = new Uint8Array(N), skip = new Uint8Array(N);
  const zoneOut = C.role !== 'badge';
  const zn = zoneOut ? Ly.dilate(C.inZone, W, H, 3) : null;   // the zone's edge line belongs to the badge strip
  // a badge kind whose badge sits in a box (AS2 portrait: rank badge lower right, the man and the flag are the army's): only the box
  const part = !zoneOut && C.zones.length && C.zones.every(z => (z[2] - z[0]) * (z[3] - z[1]) < W * H * 0.5);
  let zEdge = null; if (part) { const out = new Uint8Array(N); for (let i = 0; i < N; i++) out[i] = C.inZone[i] ? 0 : 1; zEdge = Ly.dilate(out, W, H, 3); }   // the box's own border lines
  for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (C.ring[i] || (zn && zn[i]) || (part && zEdge[i]) || C.env[i] < 8 || !x || !y || x === W - 1 || y === H - 1) skip[i] = 1; }
  // premultiplied distance to the plate (the badge kinds: to the clean plate; else to the plate, so the class badge is no subject)
  let Q = C.role === 'badge' ? P0 : Pk;
  // boxed badge: under it is this card's own box (a see-through box over its flag, so it differs card to card): a smooth
  // background of the box pixels that are not badge, the badge pixels found by distance and dropped, three rounds
  if (part) Q = boxBg(C, c0, Q).q;
  const pd = (d, o) => [d[o] * d[o + 3] / 255, d[o + 1] * d[o + 3] / 255, d[o + 2] * d[o + 3] / 255, d[o + 3]];
  const dist = new Float32Array(N);
  for (let i = 0; i < N; i++) { if (skip[i]) continue; const o = i * 4, x = pd(c0, o), q = pd(Q, o); dist[i] = Math.hypot(x[0] - q[0], x[1] - q[1], x[2] - q[2], x[3] - q[3]); }
  if (C.mf >= 0) {
    const cm = card.f[C.mf].d, Qm = (C.role === 'badge' ? P.clean : P.plate)[C.mf].d;
    for (let i = 0; i < N; i++) {
      if (skip[i]) continue; const o = i * 4;
      const D = [Q[o] - Qm[o], Q[o + 1] - Qm[o + 1], Q[o + 2] - Qm[o + 2]], dd = D[0] * D[0] + D[1] * D[1] + D[2] * D[2];
      if (dist[i] <= 5 && Math.abs(cm[o] - Qm[o]) + Math.abs(cm[o + 1] - Qm[o + 1]) + Math.abs(cm[o + 2] - Qm[o + 2]) <= 12) { a[i] = 0; continue; }
      if (dd >= 900) { const t = ((c0[o] - cm[o]) * D[0] + (c0[o + 1] - cm[o + 1]) * D[1] + (c0[o + 2] - cm[o + 2]) * D[2]) / dd; a[i] = Math.max(0, Math.min(1, 1 - t)); hard[i] = 2; }
      else hard[i] = 0;
    }
  }
  // distance matte where the pair gave nothing
  for (let i = 0; i < N; i++) if (!skip[i] && hard[i] !== 2 && dist[i] > 36) hard[i] = 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (skip[i] || hard[i] === 2) continue;
    const o = i * 4;
    if (Q[o + 3] < 8) { a[i] = c0[o + 3] / 255 > 0.02 ? 1 : 0; continue; }   // nothing under it (GoH portrait): the card is the subject
    if (hard[i] === 1) { a[i] = 1; continue; }
    if (dist[i] <= 7) { a[i] = 0; continue; }
    // an edge pixel: the subject colour next to it (hard pixels within 2), cover = projection of (c - P) on (S - P)
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0, n = 0;
    for (let j = -2; j <= 2; j++) for (let q = -2; q <= 2; q++) { const X = x + q, Y = y + j; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const t = Y * W + X; if (hard[t] !== 1) continue; s0 += c0[t * 4]; s1 += c0[t * 4 + 1]; s2 += c0[t * 4 + 2]; s3 += c0[t * 4 + 3]; n++; }
    if (n) { const Sv = [s0 / n - Q[o], s1 / n - Q[o + 1], s2 / n - Q[o + 2]], ss = Sv[0] * Sv[0] + Sv[1] * Sv[1] + Sv[2] * Sv[2]; a[i] = ss > 100 ? Math.max(0, Math.min(1, ((c0[o] - Q[o]) * Sv[0] + (c0[o + 1] - Q[o + 1]) * Sv[1] + (c0[o + 2] - Q[o + 2]) * Sv[2]) / ss)) : Math.min(1, (dist[i] - 7) / 30); }
    else a[i] = Math.min(0.5, (dist[i] - 7) / 60);
  }
  // unmix: S = (c - (1 - a) P) / a, premultiplied, alpha too
  const pic = I.blank(W, H);
  for (let i = 0; i < N; i++) {
    const A = a[i]; if (A < 0.03) { a[i] = 0; continue; }
    const o = i * 4, x = pd(c0, o), q = pd(Q, o), s = [0, 1, 2, 3].map(c => (x[c] - (1 - A) * q[c]) / A);
    const sa = Math.max(1, Math.min(255, s[3]));
    for (let c = 0; c < 3; c++) pic.d[o + c] = I.cl(s[c] * 255 / sa);
    pic.d[o + 3] = I.cl(A * sa);
  }
  // stray specks (a few pixels apart from the subject, plate noise): dropped
  { const lab = new Int32Array(N).fill(-1), st = []; for (let i = 0; i < N; i++) { if (a[i] <= 0.02 || lab[i] >= 0) continue; const comp = [i]; lab[i] = i;
      for (let h = 0; h < comp.length; h++) { const j = comp[h], x = j % W, y = (j / W) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const q = Y * W + X; if (a[q] > 0.02 && lab[q] < 0) { lab[q] = i; comp.push(q); } } }
      if (comp.length < 6) for (const j of comp) { a[j] = 0; pic.d[j * 4 + 3] = 0; } } }
  return { a, pic, under: Q };
}
function cutout(C, stem, V, k) {
  const card = C.cards.find(c => c.stem === stem); if (!card || C.none) return null;
  const P = V && k ? plateFor(V, k, C, card.army) : C;
  const m = matteOf(C, card, P); const bb = I.bbox(m.pic, 20);
  return { pic: m.pic, a: m.a, box: bb, army: card.army };
}

// ---------- frame transforms of the subject ----------
function lutFill(sum, n) {
  let tot = 0; for (let v = 0; v < 256; v++) tot += n[v]; const need = Math.max(2, tot * 0.0004);
  const t = new Float32Array(256), have = []; for (let v = 0; v < 256; v++) if (n[v] >= need) { t[v] = sum[v] / n[v]; have.push(v); }
  if (!have.length) { for (let v = 0; v < 256; v++) t[v] = v; return t; }
  for (let v = 0; v < 256; v++) if (!(n[v] >= 2)) { let lo = -1, hi = -1; for (const h of have) { if (h < v) lo = h; else if (h > v && hi < 0) hi = h; } t[v] = lo < 0 ? t[hi] + (v - hi) * (hi ? Math.min(1, t[hi] / hi) : 1) : hi < 0 ? t[lo] + (v - lo) * (lo ? Math.min(1.5, t[lo] / lo) : 1) : t[lo] + (t[hi] - t[lo]) * (v - lo) / (hi - lo); }
  // smooth (5 wide) and never falling: a few odd pixels at one level must not print specks
  const o = new Float32Array(256); for (let v = 0; v < 256; v++) { let a = 0, c = 0; for (let k = -2; k <= 2; k++) { const u = v + k; if (u >= 0 && u < 256) { a += t[u]; c++; } } o[v] = a / c; }
  for (let v = 1; v < 256; v++) if (o[v] < o[v - 1]) o[v] = o[v - 1];
  return o;
}
function fitTf(C, mats) {
  const W = C.w, H = C.h, N = W * H, b = C.base, nf = C.frames; C.tf = [];
  for (let f = 0; f < nf; f++) {
    if (f === b) { C.tf.push(null); continue; }
    const samples = []; // [i, x rgb, y rgb]
    mats.forEach(({ card, m }) => { const d0 = card.f[b].d, d1 = card.f[f].d; for (let i = 0; i < N; i++) if (m.a[i] >= 0.97 && !C.ring[i]) samples.push(i, d0[i * 4], d0[i * 4 + 1], d0[i * 4 + 2], d1[i * 4], d1[i * 4 + 1], d1[i * 4 + 2]); });
    const ns = samples.length / 7;
    const fit = grey => { const sum = [0, 1, 2].map(() => new Float64Array(256)), n = [0, 1, 2].map(() => new Float64Array(256)); for (let s = 0; s < ns; s++) { const o = s * 7, g = I.cl(0.299 * samples[o + 1] + 0.587 * samples[o + 2] + 0.114 * samples[o + 3]); for (let c = 0; c < 3; c++) { const x = grey ? g : samples[o + 1 + c]; sum[c][x] += samples[o + 4 + c]; n[c][x]++; } } return { grey, lut: [0, 1, 2].map(c => lutFill(sum[c], n[c])) }; };
    const pred = (t, x0, x1, x2, c) => t.lut[c][t.grey ? I.cl(0.299 * x0 + 0.587 * x1 + 0.114 * x2) : [x0, x1, x2][c]];
    const err = (t, res) => { let e = 0; for (let s = 0; s < ns; s++) { const o = s * 7, i = samples[o]; for (let c = 0; c < 3; c++) { const d = pred(t, samples[o + 1], samples[o + 2], samples[o + 3], c) + (res ? res[i * 3 + c] : 0) - samples[o + 4 + c]; e += Math.min(d * d, 2500); } } return e / Math.max(1, ns * 3); };
    const tc = fit(false), tg = fit(true), t = err(tg) < err(tc) * 0.95 ? tg : tc;
    // residual per pixel: from the plate (fixed overlay, both plate and subject get it) or from the subjects (smoothed)
    const rp = new Float32Array(N * 3), Pb = C.plate[b].d, Pf = C.plate[f].d;
    for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) rp[i * 3 + c] = Pf[i * 4 + c] - pred(t, Pb[i * 4], Pb[i * 4 + 1], Pb[i * 4 + 2], c);
    const acc = new Float32Array(N * 3), cn = new Float32Array(N);
    for (let s = 0; s < ns; s++) { const o = s * 7, i = samples[o]; for (let c = 0; c < 3; c++) acc[i * 3 + c] += samples[o + 4 + c] - pred(t, samples[o + 1], samples[o + 2], samples[o + 3], c); cn[i]++; }
    const rsP = I.blank(W, H), hole = new Uint8Array(N); for (let i = 0; i < N; i++) { if (cn[i] >= 3) for (let c = 0; c < 3; c++) rsP.d[i * 4 + c] = I.cl(128 + acc[i * 3 + c] / cn[i]); else hole[i] = 1; rsP.d[i * 4 + 3] = 255; }
    // smoothed hard: a residual the subjects share is a light change over the card (a lighter top), never one subject's detail
    const rsF = hole.every(v => v) ? null : lowOf(Ly.pushPull(rsP, hole), new Uint8Array(N).fill(1), 4), rs = new Float32Array(N * 3);
    if (rsF) for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) rs[i * 3 + c] = rsF.d[i * 4 + c] - 128;
    const e0 = err(t), eP = err(t, rp), eS = rsF ? err(t, rs) : Infinity;
    const use = eP < e0 * 0.8 && eP <= eS ? 'plate' : eS < e0 * 0.5 ? 'subjects' : 'none';
    C.tf.push(Object.assign(t, { res: use === 'plate' ? rp : use === 'subjects' ? rs : null, resFrom: use, err: Math.round(Math.sqrt(Math.min(e0, eP, eS)) * 10) / 10, samples: ns }));
  }
}
function applyTf(C, pic, f) {
  const t = C.tf && C.tf[f]; if (!t) return I.copy(pic);
  const o = I.copy(pic), N = pic.w * pic.h;
  for (let i = 0; i < N; i++) { if (!pic.d[i * 4 + 3]) continue; const d = pic.d, j = i * 4, g = I.cl(0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]); for (let c = 0; c < 3; c++) o.d[j + c] = I.cl(t.lut[c][t.grey ? g : d[j + c]] + (t.res ? t.res[i * 3 + c] : 0)); }
  return o;
}

// ---------- measures ----------
// the subject box: the pixels at or over th, less a stray speck (a corner pixel far off counts for nothing: 0.5 % cut each side)
// the subject box of a picture as the class numbers measure it (alpha at least half its own 95th percentile, 0.5% cut each side):
// a soft fade (GoH bust, shadow) does not count
function subjBox(p) {
  const N = p.w * p.h, a = new Float32Array(N), av = []; for (let i = 0; i < N; i++) { a[i] = p.d[i * 4 + 3] / 255; if (a[i] > 0.05) av.push(a[i]); }
  if (!av.length) return null; const b = boxOf(a, p.w, p.h, Math.max(0.12, 0.5 * pct(av, 0.95))); return b && { x0: b.x0, y0: b.y0, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 };
}
function boxOf(a, W, H, th) {
  const cx = new Float32Array(W), cy = new Float32Array(H); let n = 0;
  for (let i = 0; i < W * H; i++) if (a[i] >= th) { n++; cx[i % W]++; cy[(i / W) | 0]++; }
  if (!n) return null; const cut = Math.max(1, n * 0.005), lo = (c) => { let s = 0; for (let k = 0; k < c.length; k++) { s += c[k]; if (s >= cut) return k; } return 0; }, hi = (c) => { let s = 0; for (let k = c.length - 1; k >= 0; k--) { s += c[k]; if (s >= cut) return k; } return c.length - 1; };
  return { x0: lo(cx), y0: lo(cy), x1: hi(cx), y1: hi(cy), n };
}
function shiftBlur(core, W, H, dy, r) {
  const s = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const Y = y - dy; if (Y >= 0 && Y < H) s[y * W + x] = core[Y * W + x]; }
  if (r <= 0) return s; const t = new Float32Array(W * H), o = new Float32Array(W * H), n = 2 * r + 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let k = -r; k <= r; k++) v += s[y * W + Math.min(W - 1, Math.max(0, x + k))]; t[y * W + x] = v / n; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let k = -r; k <= r; k++) v += t[Math.min(H - 1, Math.max(0, y + k)) * W + x]; o[y * W + x] = v / n; }
  return o;
}
function measure(C) {
  const W = C.w, H = C.h, N = W * H, b = C.base;
  const use = C.cards.filter(c => !C.army || c.army === C.army); const pick = (use.length >= 6 ? use : C.cards).slice(0, 400);
  const mats = Ly.spreadOf(pick, 80).map(card => ({ card, m: matteOf(C, card, C) }));
  const bw = [], bh = [], bot = [], top = [], lx = [], rx = [], cx = [], cy = [], cover = [], silFlat = [], silCol = [[], [], []], silA = [], meanL = [], sdL = [], sat = [], chm = [[], [], []], touch = { l: 0, r: 0, b: 0, t: 0 }, edges = [];
  for (const { m } of mats) {
    // a see-through subject (AS2 infantry silhouette, cover about 0.4) is measured at half its own top cover
    const av = []; for (let i = 0; i < N; i++) if (m.a[i] > 0.05) av.push(m.a[i]); const th = Math.max(0.12, 0.5 * pct(av, 0.95));
    const bx = boxOf(m.a, W, H, th); if (!bx || bx.n < 12) continue;
    lx.push(bx.x0); rx.push(bx.x1); bw.push(bx.x1 - bx.x0 + 1); bh.push(bx.y1 - bx.y0 + 1); bot.push(bx.y1); top.push(bx.y0); cx.push((bx.x0 + bx.x1) / 2); cy.push((bx.y0 + bx.y1) / 2); cover.push(bx.n / N);
    if (bx.x0 <= 3) touch.l++; if (bx.x1 >= W - 4) touch.r++; if (bx.y1 >= H - 4) touch.b++; if (bx.y0 <= 3) touch.t++;
    const L = [], As = [], sa = [], ch = [[], [], []]; let soft = 0, all = 0;
    for (let i = 0; i < N; i++) {
      const A = m.a[i]; if (A > 0.02 && A < 0.98) soft++; if (A > 0.02) all++;
      if (A < th) continue; const o = i * 4, d = m.pic.d; L.push(lum(d, o)); As.push(A); const mx = Math.max(d[o], d[o + 1], d[o + 2]), mn = Math.min(d[o], d[o + 1], d[o + 2]); sa.push(mx ? (mx - mn) / mx : 0); for (let c = 0; c < 3; c++) ch[c].push(d[o + c]);
    }
    edges.push(all ? soft / all : 0);
    const lm = med(L); meanL.push(L.reduce((p, v) => p + v, 0) / L.length); sdL.push(Math.sqrt(L.reduce((p, v) => p + (v - meanL[meanL.length - 1]) ** 2, 0) / L.length)); sat.push(med(sa));
    for (let c = 0; c < 3; c++) chm[c].push(med(ch[c]));
    silFlat.push(med(L.map(v => Math.abs(v - lm))) < 10 && med(sa) < 0.4 ? 1 : 0);
    for (let c = 0; c < 3; c++) silCol[c].push(med(ch[c])); silA.push(med(As));
  }
  const n = bw.length;
  const mm = { cards: n, w: Math.round(med(bw)), h: Math.round(med(bh)), wq: [Math.round(pct(bw, 0.2)), Math.round(pct(bw, 0.8))], hq: [Math.round(pct(bh, 0.2)), Math.round(pct(bh, 0.8))], bottom: Math.round(med(bot)), top: Math.round(med(top)), left: Math.round(med(lx)), right: Math.round(med(rx)), cx: Math.round(med(cx) * 2) / 2, cy: Math.round(med(cy) * 2) / 2,
    cover: Math.round(med(cover) * 1000) / 1000, soft: Math.round(med(edges) * 100) / 100, touch: n ? { l: touch.l / n, r: touch.r / n, b: touch.b / n, t: touch.t / n } : null,
    lum: { mean: Math.round(med(meanL)), sd: Math.round(med(sdL)) }, sat: Math.round(med(sat) * 100) / 100, rgb: chm.map(a => Math.round(med(a))) };
  // role 'auto' (AS2 infantry cards): a flat dark see-through shape is a silhouette
  let role = C.role;
  // (an AS2 infantry class also holds gun crew cards with a colour render: a quarter of flat shapes is enough, and the silhouette
  // numbers come from the flat ones only; compose takes o.look 'colour' for a crew card)
  const nf0 = silFlat.reduce((p, v) => p + v, 0);
  if (role === 'auto') role = n && nf0 * 4 > n ? 'silhouette' : 'colour';
  if (role === 'silhouette') { const fl = (a) => a.filter((_, j) => silFlat[j] || !nf0); mm.sil = { rgb: silCol.map(a => Math.round(med(fl(a)))), alpha: Math.round(med(fl(silA)) * 100) / 100 }; mm.flat = nf0 / Math.max(1, n); }
  C.roleUsed = role;
  // contact shadow (colour renders): the cover below the solid subject, as a shifted, blurred copy of it
  if (role === 'colour') {
    let best = { op: 0, dy: 0, r: 0, e: Infinity };
    const sub = mats.slice(0, 30).map(({ m }) => { const core = new Float32Array(N); for (let i = 0; i < N; i++) core[i] = m.a[i] >= 0.9 ? 1 : 0; const near = Ly.dilate(core.map(v => (v ? 1 : 0)), W, H, 1); return { core, near, a: m.a, bx: boxOf(m.a, W, H, 0.9) }; }).filter(x => x.bx);
    for (const dy of [0, 1, 2, 3]) for (const r of [1, 2, 3]) {
      const sh = sub.map(x => shiftBlur(x.core, W, H, dy, r));
      for (const op of [0, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75]) {
        let e = 0; sub.forEach((x, j) => { const mid = (x.bx.y0 + x.bx.y1) / 2; for (let i = 0; i < N; i++) { if (x.core[i] || x.near[i] || ((i / W) | 0) < mid) continue; const p = op * sh[j][i]; if (!p && !x.a[i]) continue; e += (p - x.a[i]) ** 2; } });
        if (e < best.e) best = { op, dy, r, e };
      }
    }
    // the shadow colour: what the cover below the subject unmixes to
    const sc = [[], [], []]; for (const { m } of mats.slice(0, 30)) { const bx = boxOf(m.a, W, H, 0.9); if (!bx) continue; for (let i = 0; i < N; i++) if (m.a[i] > 0.05 && m.a[i] < 0.6 && ((i / W) | 0) > bx.y1 - 2) for (let c = 0; c < 3; c++) sc[c].push(m.pic.d[i * 4 + c]); }
    mm.shadow = { op: best.op, dy: best.dy, r: best.r, rgb: sc[0].length ? sc.map(a => Math.round(med(a))) : [0, 0, 0] };
  }
  if (role === 'scheme') { const h = new Map(); for (const c of C.cards) if (c.za) for (const v of c.za) if (v) h.set(v, (h.get(v) || 0) + 1); mm.zoneA = h.size ? [...h].sort((a, b) => b[1] - a[1])[0][0] : 4; }
  C.m = mm;
  fitTf(C, mats);
}

// ---------- compose ----------
// area-average down (exact box over the source pixels, premultiplied), Lanczos up
function scaleTo(p, w, h) { return w <= p.w && h <= p.h && I.area ? I.area(p, w, h) : I.resize(p, w, h); }
const MIN_PX = 12;
function compose(C, src, o) {
  o = o || {};
  if (C.none) return { why: C.none };
  const W = C.w, H = C.h, N = W * H, b = C.base, nf = C.frames, mm = C.m || {};
  let role = o.look && o.look !== 'auto' && o.look !== 'keep' ? o.look : C.roleUsed || 'colour';
  if (role === 'figure') role = 'silhouette';
  let subj = null;
  if (src) {
    const bb = I.bbox(src, 8);
    if (!bb) return { why: 'The picture is empty (no pixel with alpha): nothing to put on the card.' };
    let s = I.crop(src, bb[0], bb[1], bb[2], bb[3]); if (o.mirror) s = I.mirror(s);
    let cover = 0, amax = []; for (let i = 0; i < s.w * s.h; i++) { if (s.d[i * 4 + 3] > 24) cover++; if (s.d[i * 4 + 3]) amax.push(s.d[i * 4 + 3]); }
    const aTop = Math.max(1, pct(amax, 0.95));
    if (cover < 30) return { why: 'The picture has only ' + cover + ' solid pixels: too little to draw a unit from (give a larger or less transparent picture).' };
    let kx;
    // one side cut by the frame on most cards of the class (a gun's trail runs off the card): size by the other side's measure and
    // place by the uncut edge; the rest runs under the frame as the game does
    // guns (and gun crew cards): the class box is the body without the trail (the game's cards crop or hide it), so a gun is sized
    // by its height and its barrel end placed at the measured left edge; the trail runs off the right under the frame
    const tc = mm.touch || {}, gun = C.group === 'gun' || (C.group === 'infantry' && C.layout === 'full');
    const cut = (role === 'colour') && o.place !== 'own' && mm.left != null ? (tc.l > 0.4 && tc.r < 0.25 ? 'l' : (tc.r > 0.4 && tc.l < 0.25) || gun ? 'r' : '') : '';
    const sb = subjBox(s) || { x0: 0, y0: 0, w: s.w, h: s.h };   // sized and placed by the measured box (the class numbers are measured so)
    if (o.place === 'own') kx = 1;
    else {
      const tw = Number(o.width) || mm.w || W * 0.8, th = Number(o.height) || mm.h || H * 0.8;
      kx = (cut ? Math.min(th / sb.h, tw * 1.3 / sb.w) : Math.min(tw / sb.w, th / sb.h)) * (Number(o.scale) || 1);
    }
    const sw = Math.max(1, Math.round(s.w * kx)), sh = Math.max(1, Math.round(s.h * kx));
    if (Math.max(s.w, s.h) < MIN_PX || kx > 1.6) return { why: 'The picture is too small: its subject is ' + s.w + 'x' + s.h + ' px and would be blown up ' + (Math.round(kx * 10) / 10) + 'x to ' + sw + 'x' + sh + ' px on the card (at most 1.6x). Give a picture at least ' + Math.ceil(sw / 1.6) + 'x' + Math.ceil(sh / 1.6) + ' px (a render at 4x the card size is best).' };
    s = kx === 1 ? s : scaleTo(s, sw, sh);
    // look
    if (role === 'silhouette') {
      // the shape at full cover (a see-through cutout counts as solid), then the class's colour and opacity
      const sil = (mm.sil || {}), col = o.tone || sil.rgb || [60, 56, 48], al = sil.alpha || 0.7;
      for (let i = 0; i < sw * sh; i++) { s.d[i * 4] = col[0]; s.d[i * 4 + 1] = col[1]; s.d[i * 4 + 2] = col[2]; s.d[i * 4 + 3] = I.cl(Math.min(255, s.d[i * 4 + 3] * 255 / aTop) * al); }
    } else if (role === 'scheme') s = schemeOf(C, s);
    else if (o.look !== 'keep' && (role === 'colour' || role === 'bust') && mm.lum && o.match !== 0) s = tone(s, mm, o.match == null ? 0.8 : Number(o.match));
    // place
    subj = I.blank(W, H);
    let x, y;
    if (o.place === 'own') { x = bb[0]; y = bb[1]; }
    else {
      const cx = o.cx != null && o.cx !== '' ? Number(o.cx) : mm.cx != null ? mm.cx : W / 2;
      const bx0 = sb.x0 * kx, by0 = sb.y0 * kx, bw = sb.w * kx, bh = sb.h * kx;
      x = Math.round(cx - (bw - 1) / 2 - bx0 + (Number(o.dx) || 0));
      if (cut === 'l' && (o.cx == null || o.cx === '')) x = Math.round(mm.right - (bw - 1) - bx0 + (Number(o.dx) || 0));
      if (cut === 'r' && (o.cx == null || o.cx === '')) x = Math.round(mm.left - bx0 + (Number(o.dx) || 0));
      if ((role === 'colour' || role === 'bust') && !mm.centre) { const base = o.baseline != null && o.baseline !== '' ? Number(o.baseline) : mm.bottom != null ? mm.bottom : H - 2; y = Math.round(base - bh + 1 - by0 + (Number(o.dy) || 0)); }
      else { const cy = o.cy != null && o.cy !== '' ? Number(o.cy) : mm.cy != null ? mm.cy : H / 2; y = Math.round(cy - (bh - 1) / 2 - by0 + (Number(o.dy) || 0)); }
    }
    if ((role === 'colour') && o.shadow !== false && mm.shadow && mm.shadow.op > 0) {
      const core = new Float32Array(N); const tmp = I.blank(W, H); I.over(tmp, s, x, y, 1); for (let i = 0; i < N; i++) core[i] = tmp.d[i * 4 + 3] >= 230 ? 1 : 0;
      const sh2 = shiftBlur(core, W, H, mm.shadow.dy, mm.shadow.r), layer = I.blank(W, H);
      for (let i = 0; i < N; i++) { layer.d[i * 4] = mm.shadow.rgb[0]; layer.d[i * 4 + 1] = mm.shadow.rgb[1]; layer.d[i * 4 + 2] = mm.shadow.rgb[2]; layer.d[i * 4 + 3] = I.cl(sh2[i] * mm.shadow.op * 255); }
      I.over(subj, layer, 0, 0, 1);
    }
    I.over(subj, s, x, y, 1);
    // the card's shape and its frame: nothing outside the envelope, no subject under the ring
    for (let i = 0; i < N; i++) { if (C.ring[i]) subj.d[i * 4 + 3] = 0; else if (subj.d[i * 4 + 3] > C.env[i]) subj.d[i * 4 + 3] = C.env[i]; }
  }
  // the plate: badge kinds and a badge of the user's own get the clean plate (no class badge under it)
  const own = o.badge && typeof o.badge === 'object' && o.badge.d ? o.badge : null;
  let plates = C.roleUsed === 'badge' || own ? C.clean : C.plate;
  // o.plateFrom stem: that card is the plate, its badge box cleared from the class (AS2 portrait: flag + man of that unit's army)
  const pf = typeof o.plateFrom === 'string' && o.plateFrom ? C.cards.find(c => c.stem === o.plateFrom) : null;
  if (pf) { const mt = matteOf(C, pf, C); plates = pf.f.map((p, f) => { const q = I.copy(p); for (let i = 0; i < N; i++) if (mt.a[i] > 0.02 && C.inZone[i]) for (let c = 0; c < 3; c++) q.d[i * 4 + c] = f === b ? mt.under[i * 4 + c] : applyTf(C, { w: 1, h: 1, d: Uint8ClampedArray.of(mt.under[i * 4], mt.under[i * 4 + 1], mt.under[i * 4 + 2], 255) }, f).d[c]; return q; }); }
  let badgeCard = null;
  const bfs = (typeof o.strip === 'string' && o.strip) || (typeof o.badgeFrom === 'string' && o.badgeFrom) || '';
  if (bfs) badgeCard = C.cards.find(c => c.stem === bfs) || null;
  const zw = badgeCard ? Ly.dilate(C.inZone, W, H, 3) : null;   // the zone + its edge line (the strip's own border)
  const frames = [];
  for (let f = 0; f < Math.max(1, nf); f++) {
    const p = I.copy(plates[f]);
    if (badgeCard && C.roleUsed !== 'badge') for (let i = 0; i < N; i++) { if (!zw[i] || C.ring[i] || (subj && subj.d[i * 4 + 3])) continue; for (let c = 0; c < 4; c++) p.d[i * 4 + c] = badgeCard.f[f].d[i * 4 + c]; }
    if (own && C.zones.length && C.roleUsed !== 'badge') { const z = C.zones[0], fz = I.fit(own, z[2] - z[0], z[3] - z[1], { mode: 'contain' }); I.over(p, f === b ? fz : applyTf(C, placeAt(fz, W, H, z[0], z[1]), f), f === b ? z[0] : 0, f === b ? z[1] : 0, 1); }
    if (subj) I.over(p, f === b ? subj : applyTf(C, subj, f), 0, 0, 1);
    frames.push(p);
  }
  // scheme: alpha back as the game has it: 0 off the drawing, the class's most common zone step on it (the real zones are per part
  // of the vehicle; a made scheme has one zone) [T]
  if (role === 'scheme' && subj) { const za = (C.m && C.m.zoneA) || 4; for (const p of frames) for (let i = 0; i < N; i++) p.d[i * 4 + 3] = subj.d[i * 4 + 3] > 128 ? za : 0; }
  return { frames, subject: subj, role };
}
function placeAt(p, W, H, x, y) { const o = I.blank(W, H); I.over(o, p, x, y, 1); return o; }
// tone match (default strength 0.8): brightness and contrast toward the class, saturation a little (hue kept: a Soviet green stays green)
function tone(s, mm, k) {
  const N = s.w * s.h, L = []; for (let i = 0; i < N; i++) if (s.d[i * 4 + 3] > 128) L.push(lum(s.d, i * 4));
  if (L.length < 10) return s;
  const mu = L.reduce((p, v) => p + v, 0) / L.length, sd = Math.sqrt(L.reduce((p, v) => p + (v - mu) ** 2, 0) / L.length) || 1;
  // the middle (median) goes to the class's median colour's brightness: the game's cards are darker in the body with a few bright
  // highlights (mean over median), a render is even; contrast by the spread, saturation toward the class's
  const md = med(L), tm = mm.rgb ? 0.299 * mm.rgb[0] + 0.587 * mm.rgb[1] + 0.114 * mm.rgb[2] : mm.lum.mean;
  const g = 1 + ((mm.lum.sd / sd) - 1) * k, sh = (tm - md) * k, o = I.copy(s);
  const sa = []; for (let i = 0; i < N; i++) if (s.d[i * 4 + 3] > 128) { const j = i * 4, mx = Math.max(s.d[j], s.d[j + 1], s.d[j + 2]), mn = Math.min(s.d[j], s.d[j + 1], s.d[j + 2]); sa.push(mx ? (mx - mn) / mx : 0); }
  const ss = med(sa), chroma = mm.sat != null && ss > 0.02 ? 1 + (Math.max(0.5, Math.min(1.4, mm.sat / ss)) - 1) * k : Math.max(0.6, Math.min(1.4, g));
  // colour balance: each channel's share of the brightness toward the class's (the game's cards are warmer than a render)
  const ch = [[], [], []]; for (let i = 0; i < N; i++) if (s.d[i * 4 + 3] > 128) for (let c = 0; c < 3; c++) ch[c].push(s.d[i * 4 + c]);
  const sm = ch.map(med), sl = Math.max(1, 0.299 * sm[0] + 0.587 * sm[1] + 0.114 * sm[2]), tr = mm.rgb, tl = tr ? Math.max(1, 0.299 * tr[0] + 0.587 * tr[1] + 0.114 * tr[2]) : 0;
  const gain = [0, 1, 2].map(c => (tr && sm[c] > 4 ? Math.max(0.75, Math.min(1.33, 1 + ((tr[c] / tl) / (sm[c] / sl) - 1) * k)) : 1));
  for (let i = 0; i < N; i++) { if (!s.d[i * 4 + 3]) continue; const j = i * 4, l = lum(s.d, j), nl = (l - md) * g + md + sh; for (let c = 0; c < 3; c++) o.d[j + c] = I.cl((nl + (s.d[j + c] - l) * chroma) * gain[c]); }
  return o;
}
// the AS2 damage scheme: a grey line drawing seen from above (multiply blend in game): grey levels of the class, edges drawn dark
function schemeOf(C, s) {
  const mm = C.m || {}, w = s.w, h = s.h, o = I.copy(s), g = new Float32Array(w * h);
  let grey = true; for (let i = 0; i < w * h && grey; i++) { const j = i * 4; if (s.d[j + 3] > 128 && (Math.abs(s.d[j] - s.d[j + 1]) > 10 || Math.abs(s.d[j + 1] - s.d[j + 2]) > 10)) grey = false; }
  if (grey) return s;   // already a drawing (a scheme cut out of the game)
  for (let i = 0; i < w * h; i++) g[i] = lum(s.d, i * 4) * s.d[i * 4 + 3] / 255;
  const L = []; for (let i = 0; i < w * h; i++) if (s.d[i * 4 + 3] > 128) L.push(g[i]);
  const mu = L.reduce((p, v) => p + v, 0) / Math.max(1, L.length), sd = Math.sqrt(L.reduce((p, v) => p + (v - mu) ** 2, 0) / Math.max(1, L.length)) || 1;
  const tm = (mm.lum && mm.lum.mean) || 110, ts = (mm.lum && mm.lum.sd) || 25;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, gx = (x < w - 1 ? g[i + 1] : g[i]) - (x > 0 ? g[i - 1] : g[i]), gy = (y < h - 1 ? g[i + w] : g[i]) - (y > 0 ? g[i - w] : g[i]);
    const e = Math.min(1, Math.hypot(gx, gy) / 60), v = I.cl(((g[i] - mu) / sd * ts * 0.5 + tm) * (1 - 0.6 * e));
    o.d[i * 4] = o.d[i * 4 + 1] = o.d[i * 4 + 2] = v;
  }
  return o;
}

// what picture this class needs from the person (the window asks for it)
function wantsOf(C) {
  const m = C.m || {}, r = C.roleUsed;
  if (r === 'silhouette') return 'A side picture of the squad main WEAPON (any RGBA picture, e.g. a side render of the weapon model), not a soldier: it is flattened to the class silhouette (colour ' + JSON.stringify((m.sil || {}).rgb) + ', opacity ' + (m.sil || {}).alpha + ').';
  if (r === 'scheme') return 'A view of the vehicle from above (any RGBA picture): drawn as a grey line drawing.';
  if (r === 'badge') return C.kind === 'squad' ? 'An emblem or badge picture (RGBA), drawn on the shield: the game shows no soldier here, so a soldier render is wrong. With none given, a generic mark (chevrons) is drawn in plain style.' : 'The badge picture (RGBA), placed in the badge box.';
  if (r === 'bust') return 'A head-and-shoulders picture of the soldier (RGBA, transparent background).';
  return 'A colour picture of the unit (RGBA, transparent background, side view as the class cards; a render at 4x the card size is best).';
}
function summary(C) {
  if (!C || C.none) return { none: C ? C.none : 'no class' };
  return { kind: C.kind, group: C.group, army: C.army, layout: C.layout || '', layouts: C.layouts || [], strips: C.strips || [], wants: wantsOf(C), size: C.w + 'x' + C.h, frames: C.frames, base: C.base, cards: C.cards.length, role: C.roleUsed, matte: C.matte, matteFrame: C.mf,
    hidden: Math.round(C.hidden * 1000) / 10, measures: C.m, tf: (C.tf || []).map((t, f) => (t ? { frame: f, grey: t.grey, residual: t.resFrom, err: t.err } : { frame: f, base: true })), notes: C.notes };
}
// is this cut-out subject a flat see-through shape (an AS2 infantry silhouette) rather than a colour render
function flatOf(pic) { const L = [], sa = []; for (let i = 0; i < pic.w * pic.h; i++) { const o = i * 4; if (pic.d[o + 3] < 24) continue; L.push(lum(pic.d, o)); const mx = Math.max(pic.d[o], pic.d[o + 1], pic.d[o + 2]), mn = Math.min(pic.d[o], pic.d[o + 1], pic.d[o + 2]); sa.push(mx ? (mx - mn) / mx : 0); } if (L.length < 10) return false; const m = med(L); return med(L.map(v => Math.abs(v - m))) < 10 && med(sa) < 0.4; }
module.exports = { layoutsOf, layouts, layoutOfStem, wantsOf, subjBox, flatOf, classOf, cutout, matteOf, compose, applyTf, summary, roleOf, synth, plateFor, ROLE };
