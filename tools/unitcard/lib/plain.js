// unitcard/plain: the PLAIN plate style (default). Every layer (plate per frame state, gradient, top band, vignette, frame line,
// corner radius or shield, flag strip) is DRAWN BY CODE from a few numbers of the class; no pixel of any game card is copied.
// The numbers are measured on the class's game cards at run time (lib/look.js classOf: plate colours per frame, line colour and
// width, corner, band, vignette, strip colours, subject numbers, frame tables) and cached as JSON; with no game cards the
// built-in numbers below (measured once on AS64 and GoH, 2026-11) are used, so plain style works with no game art at all.
//   plainOf(V, k, group, army, opt) -> P   P has the shape of a look.js class (w, h, frames, base, plate, clean, ring, env, inZone,
//     zones, m, tf, roleUsed, cards []), so look.compose draws the subject on it the same way. opt: source, layout, cache (dir or
//     false), measure (false = built-in numbers only)
//   numbersOf(C) -> numbers of a look.js class;  draw(n, k) -> P;  defaults(gid, kid, group, layout, army) -> numbers
//   chevrons(w, h, rgb) -> RGBA generic squad mark;  stack(pics) -> one RGBA picture of up to three pictures stacked
// Author: unitcard tool (ARSENAL)
// Author: Imperator_Aug (ARSENAL, ia-f3bb5652)
'use strict';
const fs = require('fs'), path = require('path');
const I = require('./img'), K = require('./kinds');
const REV = 9;
const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const mean = (a) => (a.length ? a.reduce((p, v) => p + v, 0) / a.length : 0);
const r1 = (v) => Math.round(v * 10) / 10;
const med = (a) => { const b = a.slice().sort((p, q) => p - q); return b.length ? b[b.length >> 1] : 0; };

// ---------- measure (numbers only) ----------
function numbersOf(C) {
  const W = C.w, H = C.h, N = W * H, nf = C.frames, b = C.base;
  const n = { rev: REV, measured: true, w: W, h: H, frames: nf, base: b, role: C.roleUsed, layout: C.layout || '' };
  if (C.selfCut) { n.clear = true; n.shape = 'rect'; n.radius = 0; n.lw = 0; n.fade = 0.12; }
  const P = C.plate, env = C.env, at = (f, x, y) => { const o = (y * W + x) * 4; return [P[f].d[o], P[f].d[o + 1], P[f].d[o + 2]]; };
  const avg = (f, x0, y0, x1, y1) => { const s = [0, 0, 0]; let q = 0; for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) { if (env[y * W + x] < 128) continue; const c = at(f, x, y); s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; q++; } return q ? s.map(v => Math.round(v / q)) : [0, 0, 0]; };
  // shape: shield (bottom corners open, bottom middle closed) or a rect with a corner radius (diagonal steps open)
  if (!n.clear) {
    const open = (x, y) => env[y * W + x] < 128;
    // squad pictures are drawn as a shield in plain style (the game's: a shield under a flag band)
    if (C.kind === 'squad') n.shape = 'shield';
    else if (open(Math.round(W * 0.12), Math.round(H * 0.88)) && open(Math.round(W * 0.88), Math.round(H * 0.88)) && !open(W >> 1, H - 3) && !open(W >> 1, H >> 1)) n.shape = 'shield';
    else {
      // the card may sit inset in its picture (AS2 list cards: a clear margin); the corner radius from the inset corner
      let mx = 0, my = 0; while (mx < W / 3 && open(mx, H >> 1)) mx++; while (my < H / 3 && open(W >> 1, my)) my++;
      let d = 0; while (d < Math.min(W, H) / 3 && open(mx + d, my + d)) d++; n.shape = 'rect'; n.radius = d * 2; n.inset = [mx, my];
    }
    // frame line: from the right edge at mid height, the pixels unlike the plate 8 px in
    const ys = [Math.round(H * 0.4), Math.round(H * 0.5), Math.round(H * 0.6)], lws = [];
    for (const y of ys) { let e = W - 1; while (e > W / 2 && env[y * W + e] < 128) e--; const ref = at(b, e - 9, y); let k = 0; while (k < 5 && Math.abs(lum(at(b, e - k, y)) - lum(ref)) > 14) k++; lws.push(k); }
    n.lw = lws.sort((p, q) => p - q)[1];
    // the line colour per depth from the edge (AS2: a light outer line, a dark inner one), per frame
    const ed = ys.map(y => { let e = W - 1; while (e > W / 2 && env[y * W + e] < 128) e--; return e; });
    n.line = []; for (let f = 0; f < nf; f++) { const ds = []; for (let k = 0; k < n.lw; k++) ds.push([0, 1, 2].map(ch => Math.round(mean(ys.map((y, j) => at(f, ed[j] - k, y)[ch]))))); n.line.push(n.lw ? ds : null); }
    // AS2 buy and list cards: the same frame for every layout, read down from the top edge over many columns (the right edge
    // shows only the outer line), each depth the median over the columns, per frame state
    if (C.gid !== 'goh' && (C.kind === 'card' || C.kind === 'small') && n.shape === 'rect') {
      const xs = []; for (let x = Math.round(W * 0.45); x <= Math.round(W * 0.9); x += 3) xs.push(x);
      const e0 = xs.map(x => { let y = 0; while (y < H / 3 && env[y * W + x] < 128) y++; return y; });
      const ks = xs.map((x, j) => { const ref = lum(at(b, x, e0[j] + 9)); let k = 0; while (k < 4 && Math.abs(lum(at(b, x, e0[j] + k)) - ref) > 14) k++; return k; });
      const L = med(ks); if (L > n.lw) { n.lw = L; n.line = []; for (let f = 0; f < nf; f++) { const ds = []; for (let k = 0; k < L; k++) ds.push([0, 1, 2].map(ch => med(xs.map((x, j) => at(f, x, e0[j] + k)[ch])))); n.line.push(ds); } }
    }
  }
  // strip (AS2 soldier cards, supply trucks): the 2 or 3 main colours, top to bottom, and the divider
  const lay = (C.layouts || []).find(l => l.id === C.layout);
  // a divider close to the edge is the rounded frame's inner line (AS2 list cards), no strip
  const sx = lay && lay.x >= 12 ? lay.x : -1, x0 = sx >= 0 ? sx + 2 : 0, lw = n.lw || 0;
  if (sx >= 0) {
    n.strip = { x: sx, colours: [] };
    const bins = new Map();
    for (let y = lw; y < H - lw; y++) for (let x = lw; x < sx; x++) { const c = at(b, x, y), kk = (c[0] >> 5) + ',' + (c[1] >> 5) + ',' + (c[2] >> 5); let e = bins.get(kk); if (!e) bins.set(kk, e = { n: 0, px: [] }); e.n++; e.px.push([x, y]); }
    const all = [...bins.values()].sort((p, q) => q.n - p.n), tot = all.reduce((p, e) => p + e.n, 0), pick = [];
    for (const e of all) { if (e.n < tot * 0.08 || pick.length >= 3) break; const c = [0, 1, 2].map(ch => Math.round(mean(e.px.map(([x, y]) => at(b, x, y)[ch])))); if (pick.some(p => Math.abs(p.c[0] - c[0]) + Math.abs(p.c[1] - c[1]) + Math.abs(p.c[2] - c[2]) < 50)) continue; pick.push({ c, e }); }
    const dom = pick[0];
    pick.sort((p, q) => mean(p.e.px.map(v => v[1])) - mean(q.e.px.map(v => v[1])));
    const sh = pick.reduce((p, s) => p + s.e.n, 0) || 1;
    n.strip.colours = pick.map(s => ({ share: r1(s.e.n / sh), rgb: Array.from({ length: nf }, (_, f) => [0, 1, 2].map(ch => Math.round(mean(s.e.px.map(([x, y]) => at(f, x, y)[ch]))))) }));
    n.strip.line = Array.from({ length: nf }, (_, f) => avg(f, sx, Math.round(H * 0.3), sx + 1, Math.round(H * 0.7)));
    // the strip is drawn in ONE colour: the one most of its pixels have (not a badge's)
    n.strip.main = dom ? Array.from({ length: nf }, (_, f) => [0, 1, 2].map(ch => Math.round(mean(dom.e.px.map(([x, y]) => at(f, x, y)[ch]))))) : null;
  }
  if (!n.clear) {
    // plate: top and bottom colour in the middle columns (gradient), the top band (a step in the row means), the vignette
    const vx0 = Math.max(x0 + lw + 1, Math.round(W * 0.35)), vx1 = Math.round(W * 0.65), cx0 = x0 + lw + 2, cx1 = W - lw - 3, rowM = (f, y) => avg(f, cx0, y, cx1, y);
    let band = 0; for (let y = lw + 2; y < H * 0.4; y++) { const a = rowM(b, y - 1), c = rowM(b, y); if (Math.abs(a[0] - c[0]) + Math.abs(a[1] - c[1]) + Math.abs(a[2] - c[2]) > 36) { band = y; break; } }
    const top = band || lw, h6 = Math.max(2, Math.round(H * 0.14));
    n.band = band ? { h: band, rgb: Array.from({ length: nf }, (_, f) => avg(f, cx0, lw, cx1, band - 1)) } : null;
    // a shield: its body below the flag band (rows 45..55% and 70..80%)
    const sh = n.shape === 'shield', ty0 = sh ? Math.round(H * 0.45) : top, ty1 = sh ? Math.round(H * 0.55) : top + h6, by0 = sh ? Math.round(H * 0.7) : H - lw - 1 - h6, by1 = sh ? Math.round(H * 0.8) : H - lw - 1;
    if (sh) n.band = null;
    n.top = Array.from({ length: nf }, (_, f) => avg(f, cx0, ty0, cx1, ty1));
    n.bot = Array.from({ length: nf }, (_, f) => avg(f, cx0, by0, cx1, by1));
    // the middle rows (median): a strong pressed red stays as strong as the game's, not a blend of top and bottom
    if (!sh) n.mid = Array.from({ length: nf }, (_, f) => { const px = []; for (let y = Math.round(H * 0.42); y <= Math.round(H * 0.58); y++) for (let x = cx0; x <= cx1; x++) if (env[y * W + x] >= 128) px.push(at(f, x, y)); return [0, 1, 2].map(ch => med(px.map(c => c[ch]))); });
    const mid = Math.round(H / 2), cl = lum(avg(b, vx0, mid - 3, vx1, mid + 3)), el = lum(avg(b, x0 + lw + 1, mid - 3, x0 + lw + 3, mid + 3)) * 0.5 + lum(avg(b, W - lw - 4, mid - 3, W - lw - 2, mid + 3)) * 0.5;
    n.vig = cl > 8 ? r1(Math.max(0, Math.min(sh ? 0.25 : 0.6, 1 - el / cl))) : 0;
    // the shield's outline: a lighter line of the plate's colour when the class shows none (GoH squad pictures)
    if (sh && !n.lw) { n.lw = 1; n.line = n.top.map(c => c.map(v => Math.min(255, Math.round(v * 1.7 + 30)))); }
  }
  n.m = C.m || null;
  n.tf = (C.tf || []).map(t => (t ? { grey: !!t.grey, lut: t.lut.map(l => Array.from(l, v => Math.round(v))) } : null));
  return n;
}

// ---------- built-in numbers (no game cards) ----------
// measured on the AS64 and GoH installs (2026-11) with numbersOf; kept small: per family + kind (+ group / layout)
const ARMY = { ger: [[42, 42, 42], [196, 196, 190], [168, 40, 34]], rus: [[160, 34, 30], [196, 160, 64]], usa: [[44, 54, 104], [200, 198, 190], [160, 44, 42]],
  eng: [[36, 44, 100], [200, 198, 190], [168, 42, 40]], jap: [[208, 206, 200], [170, 34, 32]], fin: [[210, 210, 206], [40, 70, 140]], ita: [[40, 120, 60], [210, 210, 206], [170, 40, 36]] };
const DEF = {
  as2: {
    card: { shape: 'rect', radius: 4, lw: 3, line: [[[208, 208, 208], [134, 132, 128], [96, 92, 79]]], top: [[196, 182, 146]], bot: [[176, 160, 122]], vig: 0, band: null },
    small: { shape: 'rect', radius: 0, lw: 1, line: [[64, 58, 44]], top: [[196, 182, 146]], bot: [[176, 160, 122]], vig: 0, band: null },
    squad: { shape: 'shield', lw: 1, line: [[60, 56, 44]], top: [[150, 140, 110]], bot: [[120, 110, 86]], vig: 0.1, band: null },
    portrait: { shape: 'rect', radius: 0, lw: 1, line: [[60, 56, 44]], top: [[120, 116, 100]], bot: [[70, 66, 56]], vig: 0.15, band: null },
    scheme: { shape: 'rect', radius: 0, lw: 0, line: [null], top: [[236, 236, 236]], bot: [[236, 236, 236]], vig: 0, band: null },
  },
  goh: {
    card: { shape: 'rect', radius: 3, lw: 1, line: [[86, 84, 76]], top: [[52, 52, 50]], bot: [[30, 30, 30]], vig: 0.35, band: null },
    small: { shape: 'rect', radius: 3, lw: 1, line: [[86, 84, 76]], top: [[52, 52, 50]], bot: [[30, 30, 30]], vig: 0.35, band: null },
    shop: { shape: 'rect', radius: 3, lw: 1, line: [[86, 84, 76]], top: [[56, 56, 54]], bot: [[26, 26, 26]], vig: 0.35, band: null },
    squad: { shape: 'shield', lw: 1, line: [[150, 140, 110]], top: [[56, 56, 54]], bot: [[28, 28, 28]], vig: 0.3, band: null },
    portrait: { clear: true, shape: 'rect', radius: 0, lw: 0, line: [null], fade: 0.12 },
  },
};
const lin = (g, a) => ({ grey: false, lut: [0, 1, 2].map(() => Array.from({ length: 256 }, (_, v) => Math.max(0, Math.min(255, Math.round(v * g + a))))) });
const greyLin = (g, a) => ({ grey: true, lut: [0, 1, 2].map(() => Array.from({ length: 256 }, (_, v) => Math.max(0, Math.min(255, Math.round(v * g + a))))) });
function defaultTf(kid, nf, b) {
  const t = []; for (let f = 0; f < nf; f++) t.push(f === b ? null : nf === 3 ? (f === 0 ? greyLin(0.7, 12) : lin(1.12, 8)) : f === 1 ? lin(1.1, 8) : f === 2 ? lin(0.95, 0) : greyLin(0.55, 22));
  return t;
}
function roleDef(fam, kid, group, layout) {
  if (kid === 'squad') return 'badge';
  if (kid === 'portrait') return 'bust';
  if (kid === 'scheme') return 'scheme';
  if (fam === 'as2' && kid === 'card' && (group === 'infantry' || group === 'hero') && /^strip/.test(layout || '')) return 'silhouette';
  return 'colour';
}
function defaults(gid, kid, group, layout, army) {
  const fam = K.family(gid), k = K.get(gid, kid) || { w: 100, h: 50, frames: 1 }, W = k.w, H = k.h, nf = Math.max(1, k.frames || 1), b = K.baseFrame(kid, nf);
  const d = JSON.parse(JSON.stringify((DEF[fam] || DEF.as2)[kid] || DEF.as2.card)), tf = defaultTf(kid, nf, b);
  const per = (c) => Array.from({ length: nf }, (_, f) => (c ? applyLut(tf[f], c) : null));
  const n = Object.assign(d, { rev: REV, measured: false, w: W, h: H, frames: nf, base: b, role: roleDef(fam, kid, group, layout), layout: layout || '', tf });
  // an AS2 portrait backdrop: the army's first colour fading into the dark plate
  if (kid === 'portrait' && fam === 'as2' && ARMY[army]) n.top = [ARMY[army][0].map((v, c) => Math.round(v * 0.45 + n.top[0][c] * 0.35))];
  for (const key of ['top', 'bot']) if (n[key]) n[key] = per(n[key][0]);
  if (n.line) n.line = n.line[0] && Array.isArray(n.line[0][0]) ? Array.from({ length: nf }, (_, f) => n.line[0].map(c => applyLut(tf[f], c))) : per(n.line[0]);
  if (fam === 'as2' && kid === 'card' && /^strip(\d+)/.test(layout || '')) { const x = +/^strip(\d+)/.exec(layout)[1], cs = ARMY[army] || [[90, 90, 90], [170, 170, 170]]; n.strip = { x, colours: cs.map(c => ({ share: r1(1 / cs.length), rgb: per(c) })), line: per([50, 46, 36]), main: per(cs[0]) }; }
  return n;
}
function stripMain(n, f) { const s = n.strip, m = s.main || (s.colours.length ? s.colours.slice().sort((p, q) => q.share - p.share)[0].rgb : null); return m ? (m[f] || m[0]) : [90, 90, 90]; }
function applyLut(t, c) { if (!t) return c.slice(); const g = Math.round(lum(c)); return [0, 1, 2].map(ch => t.lut[ch][t.grey ? g : c[ch]]); }

// ---------- draw ----------
// the subject numbers a plain plate uses when the class gave none (or gave numbers of another role)
function subjDefaults(n) {
  const W = n.w, H = n.h, lw = n.lw || 0, sx = n.strip ? n.strip.x + 2 : 0, iw = W - sx - 2 * lw;
  if (n.role === 'badge') return { w: Math.round(W * 0.6), h: Math.round(H * 0.5), cx: (W - 1) / 2, cy: Math.round(H * 0.44), bottom: Math.round(H * 0.7), lum: { mean: 120, sd: 40 } };
  if (n.role === 'bust') return { w: Math.round(W * 0.92), h: Math.round(H * 0.94), cx: (W - 1) / 2, cy: H / 2, bottom: H - 1, lum: { mean: 92, sd: 46 }, rgb: [104, 94, 80] };
  return { w: Math.round(iw * 0.84), h: Math.round((H - 2 * lw) * 0.74), cx: sx + lw + (iw - 1) / 2, cy: H / 2, bottom: H - lw - 4, lum: { mean: 84, sd: 40 }, rgb: [92, 88, 76], sil: { rgb: [0, 0, 0], alpha: 0.47 }, shadow: { op: 0.35, dy: 1, r: 2, rgb: [12, 12, 10] } };
}
function shapeCover(n, x, y) {
  // 4x4 supersampled cover of pixel (x, y) by the shape
  const W = n.w, H = n.h; let q = 0;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const X = x + (i + 0.5) / 4, Y = y + (j + 0.5) / 4;
    if (n.shape === 'shield') { const m = W * 0.06, v0 = H * 0.52, hw0 = W / 2 - m; if (Y < m * 0.6) continue; let hw = hw0; if (Y > v0) { const t = (Y - v0) / (H - m * 0.6 - v0); hw = t >= 1 ? 0 : hw0 * Math.sqrt(1 - t * t) * (1 - 0.25 * t); } if (Math.abs(X - W / 2) <= hw) q++; continue; }
    const [mx, my] = n.inset || [0, 0], X0 = mx, Y0 = my, X1 = W - mx, Y1 = H - my; if (X < X0 || X > X1 || Y < Y0 || Y > Y1) continue;
    const r = n.radius || 0; if (r > 0) { const cx = X < X0 + r ? X0 + r : X > X1 - r ? X1 - r : X, cy = Y < Y0 + r ? Y0 + r : Y > Y1 - r ? Y1 - r : Y; if ((X - cx) ** 2 + (Y - cy) ** 2 > r * r) continue; } q++;
  }
  return q / 16;
}
// o.badge 'none' = the strip stays empty (no generic mark)
function draw(n, k, o) {
  o = o || {};
  const W = n.w, H = n.h, N = W * H, nf = n.frames, b = n.base, fade = n.fade || 0;
  const env = new Uint8Array(N); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let a = shapeCover(n, x, y); if (fade && y > H * (1 - fade)) a *= Math.max(0, (H - 1 - y) / (H * fade)); env[y * W + x] = Math.round(a * 255); }
  // the frame line: shape pixels within lw of the outside (or of the card edge)
  const lw = n.lw || 0, ring = new Uint8Array(N), depth = new Uint8Array(N), inZone = new Uint8Array(N);
  // depth of a frame pixel: 1 at the outside, up to lw
  if (lw) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (env[i] < 128) continue; for (let d = 1; d <= lw && !depth[i]; d++) for (let j = -d; j <= d && !depth[i]; j++) for (let q = -d; q <= d; q++) { const X = x + q, Y = y + j; if (X < 0 || Y < 0 || X >= W || Y >= H || env[Y * W + X] < 128) { depth[i] = d; break; } } if (depth[i]) ring[i] = 1; }
  const sx = n.strip ? n.strip.x : -1, zones = sx >= 0 ? [[0, 0, sx + 2, H]] : [];
  if (sx >= 0) for (let y = 0; y < H; y++) for (let x = 0; x < sx + 2; x++) { inZone[y * W + x] = 1; ring[y * W + x] = 1; }
  const plate = [];
  for (let f = 0; f < nf; f++) {
    const p = I.blank(W, H); plate.push(p); if (n.clear) continue;
    const top = n.top[f] || n.top[0], bot = n.bot[f] || n.bot[0], lines = (n.line && (n.line[f] || n.line[0])) || null;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, o = i * 4; if (!env[i]) continue;
      let c;
      if (lw && depth[i] && lines) { const L = Array.isArray(lines[0]) ? lines[Math.min(lines.length - 1, depth[i] - 1)] : lines; c = L; }
      if (!c && sx >= 0 && x < sx + 2) {
        // one flat army colour with a slight top-to-bottom gradient, a thin lighter divider at its right edge
        const sm = stripMain(n, f), t = (y - lw) / Math.max(1, H - 2 * lw);
        if (x === sx) c = sm.map(v => Math.min(255, v * 0.5 + 120)); else if (x > sx) c = sm.map(v => v * 0.7);
        else c = sm.map(v => v * (1.1 - 0.22 * t));
      }
      if (!c && n.band && y < n.band.h) c = n.band.rgb[f] || n.band.rgb[0];
      if (!c) {
        const t = H > 1 ? y / (H - 1) : 0, mid = n.mid && (n.mid[f] || n.mid[0]);
        c = mid ? [0, 1, 2].map(ch => (t < 0.5 ? top[ch] + (mid[ch] - top[ch]) * t * 2 : mid[ch] + (bot[ch] - mid[ch]) * (t - 0.5) * 2)) : [0, 1, 2].map(ch => top[ch] * (1 - t) + bot[ch] * t);
        if (n.vig) { const dx = (x - (W - 1) / 2) / (W / 2), dy = (y - (H - 1) / 2) / (H / 2), d = Math.min(1, dx * dx * 0.8 + dy * dy * 0.5); c = c.map(v => v * (1 - n.vig * d)); }
      }
      p.d[o] = I.cl(c[0]); p.d[o + 1] = I.cl(c[1]); p.d[o + 2] = I.cl(c[2]); p.d[o + 3] = env[i];
    }
    // the strip's mark: the generic light chevrons (as on the squad picture) centred in it; o.badge 'none' = an empty strip
    if (sx >= 0 && o.badge !== 'none') { const mw = Math.max(6, sx - 2 * lw - 6), mh = Math.round(Math.min(H * 0.42, mw * 1.1)), sm = stripMain(n, f), mk = chevrons(mw, mh, sm.map(v => Math.min(255, Math.round(v * 0.25 + 190)))); I.over(p, mk, Math.round((sx - mw) / 2), Math.round((H - mh) / 2), 1); }
  }
  if (n.clear) for (let i = 0; i < N; i++) env[i] = env[i] || 0;
  // subject numbers: the measured ones of the same role, else made from the plain layout
  const sd = subjDefaults(n), mm = n.m && n.mRole === n.role ? Object.assign({}, n.m) : sd;
  if (n.role === 'bust' || n.role === 'badge') { mm.w = sd.w; mm.h = sd.h; mm.cx = sd.cx; mm.cy = sd.cy; mm.bottom = sd.bottom; }
  // GoH soldier cards: the weapons (one, or up to three stacked) sit left of the middle, upper half and centre, not on a ground line
  if (n.fam === 'goh' && (k ? k.id : n.kind) === 'card' && (n.group === 'infantry' || n.group === 'hero')) Object.assign(mm, { w: Math.round(W * 0.55), h: Math.round(H * 0.62), cx: Math.round(W * 0.44), bottom: Math.round(H * 0.79), cy: Math.round(H * 0.48), centre: true, touch: null });
  const envC = n.clear ? (() => { const e = new Uint8Array(N); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) e[y * W + x] = fade && y > H * (1 - fade) ? Math.round(255 * Math.max(0, (H - 1 - y) / (H * fade))) : 255; return e; })() : env;
  return { gid: n.gid, fam: n.fam, kind: k ? k.id : n.kind, group: n.group, army: n.army || '', source: 'plain', w: W, h: H, frames: nf, base: b, cards: [], notes: n.notes || [],
    layout: n.layout || '', layouts: [], strips: [], plate, clean: plate, ring, env: envC, inZone, zones, role: n.role, roleUsed: n.role, m: mm, mf: -1, matte: 'plain', hidden: 0,
    tf: (n.tf || []).map(t => (t ? { grey: t.grey, lut: t.lut } : null)), plain: n };
}

// ---------- the class ----------
const MEMO = new Map();
function cacheDir(opt) { if (opt && opt.cache === false) return null; if (opt && typeof opt.cache === 'string') return opt.cache; try { return require('../../lib/platform').tmpDir('unitcard/plain'); } catch (e) { return null; } }
function plainOf(V, k, group, army, opt) {
  opt = opt || {};
  const gid = V ? V.gid : opt.gid || 'as64', src = opt.source || 'game';
  let layout = opt.layout || '';
  const fam = K.family(gid);
  // the layout: given, else (AS2 buy cards of soldiers) the strip of the class, else full
  if (!layout && fam === 'as2' && k.id === 'card' && (group === 'infantry' || group === 'hero')) layout = 'strip32';
  // the install (and the mod, when its own cards are read) is part of the key: two installs never share numbers
  const where = V ? require('crypto').createHash('sha1').update(String(V.game || '') + '|' + (src === 'mod' ? String(V.mod || '') : '')).digest('hex').slice(0, 8) : 'none';
  const key = [gid, k.id, group, army || '', src, layout, opt.measure === false ? 'b' : 'm', where].join('|');
  if (MEMO.has(key) && !opt.fresh) return draw(MEMO.get(key), k, opt);
  let n = null; const dir = opt.measure === false ? null : cacheDir(opt), file = dir ? path.join(dir, key.replace(/[|]/g, '_').replace(/[^a-z0-9_.-]/gi, '') + '.json') : null;
  if (file && !opt.fresh) try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); if (j.rev === REV) n = j; } catch (e) { /* not cached */ }
  if (!n && V && opt.measure !== false) {
    try {
      const Lk = require('./look');
      let C = Lk.classOf(V, k, group, army, { source: src, layout: layout || undefined });
      if (C && C.none && army) C = Lk.classOf(V, k, group, '', { source: src, layout: layout || undefined });
      if (C && !C.none && (!layout || !C.layout || C.layout === layout || fam !== 'as2')) { n = numbersOf(C); n.mRole = C.roleUsed; n.cards = C.cards.length; layout = C.layout || layout; }
    } catch (e) { n = null; }
    if (n && file) try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(n)); } catch (e) { /* no cache */ }
  }
  if (!n) { n = defaults(gid, k.id, group, layout, army); n.notes = ['Plain style from the built-in numbers (no game cards of this class were read).']; }
  else {
    n.notes = ['Plain style: drawn by code from numbers measured on ' + (n.cards || 'the') + ' game cards of the class (no pixel copied).'];
    // the plain plate of a bust or badge kind: the role is the plain one (a bust on a backdrop, an emblem on the shield)
    const rd = roleDef(fam, k.id, group, n.layout);
    if (rd === 'bust' || rd === 'badge') n.role = rd;
    // a strip layout measured on another army: the strip colours are the army's own (built-in) when the class gave none of it
    if (n.strip && !n.strip.colours.length && ARMY[army]) { n.strip.colours = ARMY[army].map(c => ({ share: r1(1 / ARMY[army].length), rgb: Array.from({ length: n.frames }, (_, f) => applyLut(n.tf[f], c)) })); n.strip.main = n.strip.colours[0].rgb; }
    if (!n.tf.length) n.tf = defaultTf(k.id, n.frames, n.base);
    // a bust kind with a plate (AS2 portrait: the game's is a flag and a man): the plain backdrop, only the subject numbers measured
    if (rd === 'bust' && !n.clear) Object.assign(n, defaults(gid, k.id, group, n.layout, army), { m: n.m, mRole: n.mRole, measured: true });
  }
  Object.assign(n, { gid, fam, group, army: army || '', kind: k.id });
  MEMO.set(key, n);
  return draw(n, k, opt);
}

// ---------- generic pictures ----------
function chevrons(w, h, rgb) {
  const p = I.blank(w, h), c = rgb || [214, 196, 140], th = Math.max(2, h * 0.11);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let q = 0; for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { const X = (x + (i + 0.5) / 3) / w - 0.5, Y = (y + (j + 0.5) / 3) / h; for (let s = 0; s < 3; s++) { const v = 0.12 + s * 0.28 + Math.abs(X) * 0.7; if (Math.abs(X) < 0.46 && Y >= v && Y < v + th / h) { q++; break; } } }
    if (q) { const o = (y * w + x) * 4; p.d[o] = c[0]; p.d[o + 1] = c[1]; p.d[o + 2] = c[2]; p.d[o + 3] = Math.round(q / 9 * 255); }
  }
  return p;
}
// up to three pictures (GoH infantry card weapons) stacked top to bottom at one width, a small gap between
function stack(pics) {
  const ps = pics.filter(Boolean).slice(0, 3).map(p => { const bb = I.bbox(p, 8); return bb ? I.crop(p, bb[0], bb[1], bb[2], bb[3]) : null; }).filter(Boolean);
  if (ps.length < 2) return ps[0] || null;
  const w = Math.max(...ps.map(p => p.w)), sc = ps.map(p => (p.w === w ? p : I.resize(p, w, Math.max(1, Math.round(p.h * w / p.w)))));
  const gap = Math.round(Math.max(...sc.map(p => p.h)) * 0.25), H = sc.reduce((s, p) => s + p.h, 0) + gap * (sc.length - 1), o = I.blank(w, H);
  let y = 0; for (const p of sc) { I.over(o, p, 0, y, 1); y += p.h + gap; }
  return o;
}
module.exports = { plainOf, numbersOf, draw, defaults, chevrons, stack, DEF, ARMY, REV };
