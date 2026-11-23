// Author: Imperator_Aug (ARSENAL, ia-97e5649d)
'use strict';
// GL-3: builds tools/xlate/armour/table.json (peer values, rule per class, held-back score, per-unit list) from GoH + AS2 data.
//   node tools/xlate/armour/build.js [--goh dir --as2 dir --goh-mod dir --as2-mod dir] [--seed 67] [--out f]
// Read-only on the game folders. Pairs = vehicle .def with the same class folder and stem in both games (vanilla with vanilla, mod with mod).
const fs = require('fs'), path = require('path');
const T = path.join(__dirname, '..', '..') + path.sep;
const X = require('../xlate.js'), pd = require('../../pairdiff/pairdiff.js');
const sdlx = require('../../lib/sdlx'), CK = require('../../portdiff/checks'), { fixHashTags } = require('../../goh2as2/goh2as2');
const ix = require('../../entityindex/index'), { armorOf } = require('../../statsheet/statsheet.js');
const { mode, FACES, TANK } = require('./rule.js');
const readEnt = e => e.path ? fs.readFileSync(e.path) : require('../../lib/pakset').read(e);
// DOOR-A: no hard-coded drive paths; defaults come from lib/gamedir (arg > env > as2.json > Steam). Valour = workshop 2537987794 (GoH), 455424236 (AS2).
const o = { seed: 67, out: path.join(__dirname, 'table.json') };
const av = process.argv.slice(2);
for (let i = 0; i < av.length; i++) { const a = av[i]; if (a === '--goh') o.goh = av[++i]; else if (a === '--as2') o.as2 = av[++i]; else if (a === '--goh-mod') o.gohMod = av[++i]; else if (a === '--as2-mod') o.as2Mod = av[++i]; else if (a === '--seed') o.seed = +av[++i]; else if (a === '--out') o.out = av[++i]; }
{ const gd = require('../../lib/gamedir');
  o.goh = o.goh || gd.goh(); o.as2 = o.as2 || gd.require({ what: 'xlate/armour/build --as2' });
  o.gohMod = o.gohMod || gd.workshop(400750, 2537987794); o.as2Mod = o.as2Mod || gd.workshop(244450, 455424236);
  if (!o.goh) gd.missing('xlate/armour/build --goh'); }
const lc = s => String(s).toLowerCase();
const med = a => { a = a.slice().sort((x, y) => x - y); const n = a.length; return n ? (n % 2 ? a[n >> 1] : (a[n / 2 - 1] + a[n / 2]) / 2) : null; };
const pct = (a, q) => { a = a.slice().sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : null; };
const PART = { body: /^(body|hull)/i, turret: /^turret/i };

function parseTree(side, key, game) {
  const fix = b => game === 'goh' && b.includes('{##') ? Buffer.from(CK.stripDisabledBlocks(fixHashTags(b.toString('latin1'))), 'latin1') : b;
  const open = r => { if (r.kind !== 'virtual') return null; const k = r.key.replace(/^resource\//, ''); const e = side.map.get(k) || (side.base && side.base.map.get(k)); return e ? { buf: fix(readEnt(e)), file: r.key, key: r.key } : null; };
  const b = fix(readEnt(side.map.get(key)));
  if (b.includes(0) && !(b[0] === 0xFF || b[0] === 0xFE)) return null;
  return sdlx.read(b, { file: 'resource/' + key, key: 'resource/' + key, open, onError: () => {}, preInclude: [] }).root;
}
function vunits(side, game) {
  const out = [];
  for (const k of side.map.keys()) {
    if (!k.startsWith('entity/-vehicle/') || !k.endsWith('.def')) continue;
    const p = k.split('/'), stem = p[p.length - 1].slice(0, -4);
    if (p[p.length - 2] !== stem) continue;
    const cls = game === 'goh' ? p[3] : p[2];
    if (!cls || p.length < (game === 'goh' ? 6 : 5)) continue;
    out.push({ key: k, stem, cls });
  }
  return out;
}
function info(side, game, u) {
  const root = parseTree(side, u.key, game); if (!root) return null;
  const top = ix.kids(root).find(b => /^(game_)?entity$/i.test(ix.nameOf(b) || '')) || root;
  const { volumes, areas } = armorOf(top);
  return { vol: volumes.map(v => ({ name: v.name, sides: v.sides })), areas: areas.map(a => ({ name: a.name, pats: a.pats, t: a.t })) };
}
function collectPairs() {
  const out = [];
  for (const [src, gd, gb, ad, ab] of [['vanilla', o.goh, null, o.as2, null], ['valour', o.gohMod, o.goh, o.as2Mod, o.as2]]) {
    if (!gd || !ad) continue;
    const gs = pd.collect(gd); if (gb) gs.base = pd.collect(gb);
    const as = pd.collect(ad); if (ab) as.base = pd.collect(ab);
    const am = new Map(vunits(as, 'as2').map(u => [u.cls + '|' + u.stem, u]));
    for (const g of vunits(gs, 'goh')) {
      const a = am.get(g.cls + '|' + g.stem); if (!a) continue;
      try { const gi = info(gs, 'goh', g), ai = info(as, 'as2', a); if (gi && ai) out.push({ src, cls: g.cls, stem: g.stem, goh: gi, as2: ai }); } catch (e) { /* unreadable pair */ }
    }
    gs.close(); as.close();
  }
  return out;
}
const aArea = (p, part) => { const a = p.as2.areas.find(a => a.t && (a.pats.some(x => lc(x).startsWith(part)) || lc(a.name) === part)); return a ? a.t : null; };
function gList(p, part, f) { return p.goh.vol.filter(v => PART[part].test(v.name)).map(v => f === 'side' ? Math.max(v.sides.left, v.sides.right) : v.sides[f]).filter(x => x > 0); }

const pairs = collectPairs();
const stems = [...new Set(pairs.map(p => p.cls + '|' + p.stem))].sort(), rand = X.rng(o.seed), test = new Set();
for (const s of stems) if (rand() < 1 / 3) test.add(s);
const rows = [];
for (const p of pairs) for (const part of ['body', 'turret']) {
  const a = aArea(p, part); if (!a) continue;
  for (const f of FACES) { const g = gList(p, part, f); if (a[f] > 0) rows.push({ cls: p.cls, stem: p.stem, src: p.src, part, f, g, a: a[f], test: test.has(p.cls + '|' + p.stem) }); }
}
const T_ = { meta: { seed: o.seed, pairs: pairs.length, stems: stems.length, heldOutStems: test.size, rows: rows.length, rule: 'mode of non-zero GoH volume thickness per part and face, copied; peer value otherwise' }, peer: {}, classes: {}, units: {}, pooled: {} };
// peer value: AS2 native median per class, part, face over the paired AS2 units (train third only, so the held-back score is honest)
for (const c of [...new Set(rows.map(r => r.cls))]) for (const part of ['body', 'turret']) for (const f of FACES) {
  const v = rows.filter(r => r.cls === c && r.part === part && r.f === f && !r.test).map(r => r.a);
  if (v.length) ((T_.peer[c] = T_.peer[c] || {})[part] = T_.peer[c][part] || {})[f] = med(v);
}
const err = (p, a) => Math.abs(p / a - 1), allErr = { mode: [], peer: [], vanilla: [] };
for (const c of Object.keys(T_.peer)) {
  const R = rows.filter(r => r.cls === c), te = R.filter(r => r.test), cr = { stems: new Set(R.map(r => r.stem)).size, heldStems: new Set(te.map(r => r.stem)).size, heldRows: te.length };
  const em = te.filter(r => r.g.length).map(r => err(mode(r.g), r.a)), ep = te.map(r => err(T_.peer[c][r.part] ? T_.peer[c][r.part][r.f] : NaN, r.a)).filter(x => !isNaN(x));
  cr.held_mode = { n: em.length, median: med(em), p75: pct(em, .75), within25: em.filter(x => x <= .25).length };
  cr.held_peer = { n: ep.length, median: med(ep), p75: pct(ep, .75) };
  const all = R.filter(r => r.g.length).map(r => err(mode(r.g), r.a));
  cr.all_mode = { n: all.length, median: med(all), p75: pct(all, .75), exact: all.filter(x => x === 0).length };
  const ev = R.filter(r => r.g.length && r.src === 'vanilla').map(r => err(mode(r.g), r.a)); cr.all_mode_vanilla = { n: ev.length, median: med(ev), p75: pct(ev, .75) };
  if (TANK.has(c)) {
    // ARMF-1F: tank_heavy is exempt from the 10-stem line: a heavy tank's own volumes beat one class block on all rows, though its top face is weak. Still marked weak, so every unit carries the flag.
    const heavy = c === 'tank_heavy', ok = (cr.stems >= 10 || heavy) && cr.held_mode.n >= 6 && cr.held_mode.median !== null && cr.held_mode.median < 0.17;
    cr.use = ok ? 'mode' : 'peer'; if (!ok || heavy) cr.note = `held-back ${cr.held_mode.n} rows / ${cr.heldStems} stems, median ${cr.held_mode.median === null ? 'n/a' : (cr.held_mode.median * 100).toFixed(0) + '%'}; ${cr.stems} stems`;
    const bf = R.filter(r => r.part === 'body' && r.f === 'front').map(r => r.a); cr.p5 = { body_front: pct(bf, .05) }; cr.p95 = { body_front: pct(bf, .95) };
    if (ok && !heavy) { allErr.mode.push(...em); allErr.vanilla.push(...te.filter(r => r.g.length && r.src === 'vanilla').map(r => err(mode(r.g), r.a))); allErr.peer.push(...ep); }
    cr.confidence = ok && !heavy ? 'ok' : 'weak';
  } else { cr.use = 'peer'; cr.note = 'not a tank class: AS2 areas are constants per class'; }
  T_.classes[c] = cr;
}
const sm = a => ({ n: a.length, median: med(a), p75: pct(a, .75), p90: pct(a, .9), within25: a.filter(x => x <= .25).length });
T_.pooled = { tank_classes_using_mode_heldback: sm(allErr.mode), same_rows_peer_value: sm(allErr.peer), vanilla_only_heldback: sm(allErr.vanilla) };
// per-unit list: every tank unit whose mode-copy misses an AS2 face by over 25% (names only), so a peer/override decision can be made per unit
for (const c of Object.keys(T_.classes)) if (TANK.has(c)) {
  const l = [];
  for (const p of pairs.filter(p => p.cls === c)) {
    const miss = rows.filter(r => r.cls === c && r.stem === p.stem && r.src === p.src && r.g.length && err(mode(r.g), r.a) > .25).map(r => `${r.part}.${r.f} goh ${mode(r.g)} as2 ${r.a}`);
    if (miss.length) l.push({ stem: p.stem, src: p.src, held: test.has(c + '|' + p.stem), miss });
  }
  T_.units[c] = l;
}
fs.writeFileSync(o.out, JSON.stringify(T_, null, 1));
console.log(`armour table: ${pairs.length} pairs, ${rows.length} rows, ${test.size}/${stems.length} stems held back (seed ${o.seed}) -> ${o.out}`);
for (const [c, v] of Object.entries(T_.classes)) console.log(c.padEnd(12), v.use.padEnd(5), 'stems', v.stems, 'held mode', v.held_mode.n, v.held_mode.median === null ? '-' : (v.held_mode.median * 100).toFixed(0) + '%', 'peer', v.held_peer.median === null ? '-' : (v.held_peer.median * 100).toFixed(0) + '%', (T_.units[c] || []).length ? 'units off>25%: ' + T_.units[c].length : '');
console.log('pooled', JSON.stringify(T_.pooled));
