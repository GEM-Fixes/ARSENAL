// unitcard/sheet: the acceptance sheets. For about ten units of a class that have a game card, the clean cutout of unit X (or its
// render <unit>_<kind>.png from --renders) is the source of a NEW card made by the numbers of the class; one PNG per kind + class at
// 3x: game card | made card | difference, per shown frame, then the cutout itself and the card made on another army's plate.
//   sheet(V, k, group, army, o) -> { file, rows: [{ stem, err, why }], legend, summary }
//   o: { out (folder), units (10), zoom (3), renders (folder), scale, layout (Lk.layouts id; default the class's most used),
//        plate 'plain' (default: the made cards on the plain plate of lib/plain.js) | 'game' }
// Row 0 shows the class plates (every frame, then the clean plate of the badge kinds). Read the sheet by eye: the numbers only help.
// Author: unitcard tool (ARSENAL)
// Author: Imperator_Aug (ARSENAL, ia-7e30ade3)
'use strict';
const fs = require('fs'), path = require('path');
const I = require('./img'), Ly = require('./layers'), Lk = require('./look'), Pl = require('./plain');

function zoom(p, z) { const o = I.blank(p.w * z, p.h * z); for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) { const s = (((y / z) | 0) * p.w + ((x / z) | 0)) * 4, d = (y * o.w + x) * 4; for (let c = 0; c < 4; c++) o.d[d + c] = p.d[s + c]; } return o; }
function checker(w, h) { const o = I.blank(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, c = ((x >> 3) + (y >> 3)) & 1 ? 70 : 104; o.d[i] = c; o.d[i + 1] = c; o.d[i + 2] = c + 26; o.d[i + 3] = 255; } return o; }
function diff(a, b) { const o = I.blank(a.w, a.h); let s = 0; for (let i = 0; i < a.w * a.h; i++) { const j = i * 4, pa = a.d[j + 3] / 255, pb = b.d[j + 3] / 255, e = Math.max(Math.abs(a.d[j] * pa - b.d[j] * pb), Math.abs(a.d[j + 1] * pa - b.d[j + 1] * pb), Math.abs(a.d[j + 2] * pa - b.d[j + 2] * pb), Math.abs(a.d[j + 3] - b.d[j + 3]));   /* premultiplied: colour under alpha 0 does not count */ s += e; const v = I.cl(e * 3); o.d[j] = v; o.d[j + 1] = v; o.d[j + 2] = v; o.d[j + 3] = 255; } return { pic: o, mean: s / (a.w * a.h) }; }
function opaque(p) { const q = I.copy(p); for (let j = 3; j < q.d.length; j += 4) q.d[j] = 255; return q; }
function otherArmy(C) { const m = new Map(); for (const c of C.cards) if (c.army && c.army !== C.army) m.set(c.army, (m.get(c.army) || 0) + 1); return [...m.entries()].filter(x => x[1] >= 3).sort((a, b) => b[1] - a[1]).map(x => x[0])[0] || ''; }

function sheet(V, k, group, army, o) {
  o = o || {};
  const Z = o.zoom || 3, lo = o.layout ? { layout: o.layout } : {}, C = Lk.classOf(V, k, group, army, lo);
  if (C.none) return { why: C.none };
  const W = C.w, H = C.h, nf = C.frames, b = C.base, plain = o.plate !== 'game';
  const oa = otherArmy(C), Co0 = oa ? Lk.classOf(V, k, group, oa, lo) : null, Co1 = Co0 && !Co0.none ? Co0 : null;
  // plain style: the made cards go on the plate drawn by code (numbers of the class), the game cards stay for the comparison
  const P = plain ? Pl.plainOf(V, k, group, army, { layout: C.layout || undefined }) : C, Co = Co1 && plain ? Pl.plainOf(V, k, group, oa, { layout: C.layout || undefined }) : Co1;
  const shown = [b]; if (C.mf >= 0) shown.push(C.mf); if (nf > 1 && !shown.includes(nf - 1)) shown.push(nf - 1); if (nf > 2 && shown.length < 3) for (let f = 0; f < nf; f++) if (!shown.includes(f)) { shown.push(f); break; }
  const mine = C.cards.filter(c => !army || c.army === army), units = Ly.spreadOf(mine.length >= 3 ? mine : C.cards, o.units || 10);
  const legend = ['game f' + shown[0], 'made f' + shown[0], 'diff x3', 'cutout'];
  for (const f of shown.slice(1)) legend.push('game f' + f, 'made f' + f);
  if (Co) legend.push('made on ' + oa + ' plate');
  if (o.renders) legend.push('made from render');
  // the badge sits in a box of a card whose rest is the army's (AS2 portrait): the card of the unit (or of the other army) is the plate
  const boxed = C.roleUsed === 'badge' && C.zones.length && C.zones.every(z => (z[2] - z[0]) * (z[3] - z[1]) < W * H * 0.5);
  const rows = [], tiles = [];
  // row 0: the plates
  tiles.push(plain ? P.plate.slice() : C.plate.map(p => p).concat(C.roleUsed === 'badge' ? C.clean : []));
  for (const u of units) {
    const cut = Lk.cutout(C, u.stem, V, k), row = [], r = { stem: u.stem };
    if (!cut || !cut.box) { r.why = 'no subject read from the card'; rows.push(r); continue; }
    const src = I.crop(cut.pic, cut.box[0], cut.box[1], cut.box[2], cut.box[3]), sb = Lk.subjBox(src) || { w: src.w, h: src.h };
    // the size of the unit's own game subject (the game sizes a card by the real size of the unit; a new card of a known unit keeps it);
    // a cutout carries its own contact shadow
    const mk = (cls, extra) => Lk.compose(cls, src, Object.assign({ scale: o.scale, width: sb.w, height: sb.h, shadow: false }, extra || {}));
    const made = plain ? mk(P, {}) : mk(C, { badgeFrom: u.stem, plateFrom: boxed ? u.stem : undefined });   // the unit keeps its own rank or unit badge (the badge zone of its card)
    if (!made.frames) { r.why = made.why; rows.push(r); continue; }
    if (made.role === 'scheme') made.frames = made.frames.map(opaque);   // shown as the game multiplies it: the RGB
    const d = diff(made.frames[b], u.f[b]); r.err = Math.round(d.mean * 10) / 10;
    row.push(u.f[b], made.frames[b], d.pic, cut.pic);
    for (const f of shown.slice(1)) row.push(u.f[f], made.frames[f]);
    if (Co) { const m2 = mk(Co, { plateFrom: boxed && !plain ? (Co.cards.find(c => c.army === oa) || {}).stem : undefined }); row.push(m2.frames ? (m2.role === 'scheme' ? opaque(m2.frames[b]) : m2.frames[b]) : null); }
    if (o.renders) {
      const rp = [u.stem + '_' + k.id + '.png', u.stem.replace(/\(.*\)$/, '') + '_' + k.id + '.png'].map(n => path.join(o.renders, n)).find(p => fs.existsSync(p));
      if (rp) { const m3 = Lk.compose(P, I.decode(fs.readFileSync(rp), rp), plain && P.roleUsed !== C.roleUsed ? {} : { width: sb.w, height: sb.h }); row.push(m3.frames ? m3.frames[b] : null); r.render = m3.frames ? path.basename(rp) : m3.why; } else row.push(null);
    }
    rows.push(r); tiles.push(row);
  }
  // lay out
  const gap = 4, cw = W * Z + gap, ch = H * Z + gap, cols = Math.max(...tiles.map(t => t.length)), out = I.blank(cols * cw, tiles.length * ch, [28, 28, 36, 255]);
  tiles.forEach((t, ri) => t.forEach((p, ci) => { if (!p) return; const x = ci * cw, y = ri * ch; I.over(out, checker(W * Z, H * Z), x, y, 1); I.over(out, zoom(p, Z), x, y, 1); }));
  fs.mkdirSync(o.out, { recursive: true });
  const file = path.join(o.out, V.gid + '_' + k.id + '_' + group + (army ? '_' + army : '') + (C.layout && C.layouts.length > 1 ? '_' + C.layout : '') + '.png');
  fs.writeFileSync(file, I.png(out));
  return { file, rows, legend, other: oa, plate: plain ? 'plain' : 'game', summary: Lk.summary(C) };
}
module.exports = { sheet };
