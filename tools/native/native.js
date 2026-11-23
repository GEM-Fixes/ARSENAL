#!/usr/bin/env node
// Author: Imperator_Aug (ARSENAL, ia-205394de)
'use strict';
// native: does a ported unit look native to as64? Static only (T-NATIVE, scoreboard row N).
//   node tools/native/native.js <ported unit .def | mod dir> --game <G> [--class auto|<class>] [-o out.json] [--table table.json] [--peers N] [--gaps <dir>] [--rules <dir> | --no-rules]
//   G = the AS2 install (read-only; vanilla = its base resource through pairdiff.collect: loose + paks + N.pat, no as64/core layer, so the
//   answer is the same for AS64 and MoW:AS2, which share that base data). A mod dir = every <stem>/<stem>.def under its resource/entity.
// a. keys:   the def's key paths (xlate flatten, includes expanded) vs vanilla peers of the same class: `missing` = in every peer and not in
//            the def, `extra` = in no peer and in the def. Peers: up to N (default 30) spread evenly by sorted key; fewer than 3 peers = skipped.
// b. values: each curated value (tools/xlate extract: speed, mass, armour faces, ...) vs the class's as2 min..max in the xlate table (n >= 3).
// c. gaps:   <mod>/gaps/<stem>.gaps.json (goh2as2, T-PORTGAP): counts, and its `hand` + `unexplained` entries count as findings. Absent: said so, skipped.
// class: --class X, else a -vehicle/<class>/ folder in the key, else the class whose common key paths (in >= half of its peers) overlap the def best [I].
// Output JSON form native/1, sorted, no dates, no absolute paths: same input, same bytes. Reads only.
// NAT-CLS: a def outside entity/-vehicle/<class> takes the nearest folder of its own path that vanilla has >= 3 direct peers in
//   (classBy "folder" / "folder +N" = N folders up); none = skipped, skipKind noClass. Per unit "defs" = mod files read (def + includes),
//   "odd" = keys in no peer of the class but in a vanilla def of another class of the same top folder (-vehicle, inventory): counted, not a finding.
//   Only text is read: no ply, texture or other binary is needed.
// NAT-KEEP: --rules <dir> (default tools/nativepass/rules when present; --no-rules = off) reads nativepass "keep" rows. A row whose src names an
//   as64 reader line (file.cpp:N / .h:N) proves the engine reads that key: an "extra" key it covers (key pattern, class "*" or listed) is no
//   finding but goes to the unit's "kept" list ({key, rule, src}). A keep row whose src is only a statistic ("vanilla n of m") excuses nothing.
//   Rule files are read in sorted order; the first proven row (by file, then row order) names the key.
//   node tools/native/native.js profile --class <c> --game <G> [-o f.json] [--peers N]  -> native-profile/1 (all peers unless --peers)
require('../lib/help')(__filename);
const fs = require('fs'), path = require('path');

const SRC = path.resolve(__dirname, '..', '..');
const J = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const rd = f => JSON.parse(fs.readFileSync(f, 'utf8'));

// classes: entity/-vehicle/<class>/<stem>/<stem>.def -> <class> (scope vehicle); any other entity/<folder..>/<stem>/<stem>.def -> the folder
// below entity/ (e.g. inventory/-ammo; NAT-CLS), scope = its first segment. Only direct peers: a def one folder below the class folder.
function peerList(base) {
  const by = {};
  for (const k of base.map.keys()) {
    if (!k.startsWith('entity/') || !k.endsWith('.def')) continue;
    const p = k.split('/'), stem = p[p.length - 1].slice(0, -4);
    if (p.length < 4 || p[p.length - 2] !== stem) continue;
    const veh = p[1] === '-vehicle';
    if (veh && p.length !== 5) continue;   // -vehicle/<class>/x/.. sub folders are not classes
    const cls = veh ? p[2] : p.slice(1, -2).join('/');
    (by[cls] = by[cls] || []).push({ key: k, stem, cls, scope: veh ? 'vehicle' : 'item', top: veh ? '-vehicle' : p[1] });
  }
  for (const c of Object.keys(by)) by[c].sort((a, b) => J(a.key, b.key));
  return by;
}
const isVeh = l => l && l.length && l[0].scope === 'vehicle';
// a def's class from its own folder: the nearest folder (walking up, entity/ itself excluded) that vanilla has >= 3 direct peers in
function folderClass(key, peersBy) {
  const p = key.split('/');
  for (let n = p.length - 2; n >= 2; n--) {
    const c = p.slice(1, n).join('/');
    if (c && !c.startsWith('-vehicle') && peersBy[c] && peersBy[c].length >= 3) return { cls: c, up: p.length - 2 - n };
  }
  return null;
}
const median = l => { if (!l.length) return null; const s = [...l].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pick = (l, n) => { if (l.length <= n) return l; const o = []; for (let i = 0; i < n; i++) o.push(l[Math.round(i * (l.length - 1) / (n - 1))]); return o; };
// native-profile/1: every flat key of a class's vanilla peers (all of them unless --peers N) with how many peers have it, up to 12 distinct
// numbers (spread over the sorted distinct values, min and max kept) and the median over the peers that carry a number.
function profile(o) {
  const X = require('../xlate/xlate.js'), pd = require('../pairdiff/pairdiff.js');
  const base = pd.collect(o.game), peersBy = peerList(base);
  try {
    const list = peersBy[o.class];
    if (!list) throw new Error('no vanilla peers for class ' + o.class + ' (classes: ' + Object.keys(peersBy).sort().join(', ') + ')');
    const recs = (o.peers ? spread(list, o.peers) : list).map(u => { try { return X.extract(base, 'as2', u, 'native'); } catch (e) { return null; } }).filter(Boolean);
    const acc = {};
    for (const r of recs) for (const [k, e] of Object.entries(r.flat)) {
      const a = acc[k] || (acc[k] = { n: 0, nums: [] });
      a.n++; if (typeof e[0] === 'number') a.nums.push(e[0]);
    }
    const keys = {};
    for (const k of Object.keys(acc).sort(J)) {
      const a = acc[k], d = [...new Set(a.nums)].sort((x, y) => x - y);
      keys[k] = { n: a.n, of: recs.length, values: pick(d, 12), median: median(a.nums) };
    }
    return { form: 'native-profile/1', class: o.class, peers: recs.length, keys };
  } finally { base.close(); }
}
const spread = (l, n) => { if (l.length <= n) return l; const o = []; for (let i = 0; i < n; i++) o.push(l[Math.floor(i * l.length / n)]); return o; };

function units(input) {
  const st = fs.statSync(input);
  if (st.isFile()) return [path.resolve(input)];
  const root = fs.existsSync(path.join(input, 'resource')) ? path.join(input, 'resource') : input, out = [];
  for (const f of fs.readdirSync(root, { recursive: true })) {
    const p = f.replace(/\\/g, '/').split('/'), b = p[p.length - 1];
    if (b.endsWith('.def') && p.length >= 2 && p[p.length - 2] === b.slice(0, -4) && p[0].toLowerCase() === 'entity') out.push(path.join(root, f));
  }
  return out.sort(J);
}
function modRootOf(file) {
  let d = path.dirname(file);
  for (; ; d = path.dirname(d)) {
    if (path.basename(d).toLowerCase() === 'resource') return path.dirname(d);
    if (d === path.dirname(d)) return path.dirname(file);
  }
}

// ---------- NAT-KEEP: proven keep rows ----------
const READER = /[\w./-]+\.(?:cpp|h|hpp|c|inl):\d+/i;
function loadKeep(dir) {
  const out = { proven: [], statOnly: [] };
  if (!dir || !fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.json')).sort(J)) {
    let j; try { j = rd(path.join(dir, f)); } catch (e) { continue; }
    for (const r of (Array.isArray(j) ? j : j.rules) || []) {
      if (!r || r.act !== 'keep' || typeof r.key !== 'string') continue;
      (READER.test(String(r.src || '')) ? out.proven : out.statOnly).push({ id: r.id, key: r.key, class: r.class || '*', src: String(r.src || '') });
    }
  }
  return out;
}
function matchKey(pat, key) {   // same as nativepass matchKey: * = one segment (or part of one), ** = any segments
  const p = pat.toLowerCase().split('/'), k = key.split('/');
  const seg = (a, b) => a === '*' || (a.includes('*') ? new RegExp('^' + a.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*/g, '[^/]*') + '$').test(b) : a === b);
  const m = (i, j) => {
    if (i === p.length) return j === k.length;
    if (p[i] === '**') { for (let x = j; x <= k.length; x++) if (m(i + 1, x)) return true; return false; }
    return j < k.length && seg(p[i], k[j]) && m(i + 1, j + 1);
  };
  return m(0, 0);
}
const keepRow = (rows, key, cls) => rows.find(r => (r.class === '*' || (Array.isArray(r.class) && r.class.map(c => String(c).toLowerCase()).includes(cls))) && matchKey(r.key, key));

function run(o) {
  const X = require('../xlate/xlate.js'), pd = require('../pairdiff/pairdiff.js');
  const table = rd(o.table || path.join(__dirname, '..', 'xlate', 'table.json'));
  const base = pd.collect(o.game), peersBy = peerList(base), cache = new Map();
  const rulesDir = o.noRules ? null : (o.rules || path.join(__dirname, '..', 'nativepass', 'rules')), keep = loadKeep(rulesDir);
  const ext =(side, u) => { try { return X.extract(side, 'as2', u, 'native'); } catch (e) { return null; } };
  const peerRecs = cls => {
    if (!cache.has(cls)) cache.set(cls, spread(peersBy[cls] || [], o.peers || 30).map(u => ext(base, u)).filter(Boolean));
    return cache.get(cls);
  };
  // wider scope (NAT-CLS): flat keys of every vanilla peer of every class in the same top folder (-vehicle, inventory, ..), all peers read
  const wideCache = new Map();
  const wide = top => {
    if (!wideCache.has(top)) {
      const s = new Set();
      for (const c of Object.keys(peersBy)) for (const u of peersBy[c]) if (u.top === top) { const r = ext(base, u); if (r) for (const k of Object.keys(r.flat)) s.add(k); }
      wideCache.set(top, s);
    }
    return wideCache.get(top);
  };
  const common = cls => { const rs = peerRecs(cls), c = {}; for (const r of rs) for (const k of Object.keys(r.flat)) c[k] = (c[k] || 0) + 1; return Object.keys(c).filter(k => c[k] * 2 >= rs.length); };
  const res = [], sides = new Map();
  for (const file of units(o.input)) {
    const root = modRootOf(file), resDir = path.join(root, 'resource');
    if (!sides.has(root)) { const s = pd.collect(root); s.base = base; sides.set(root, s); }
    const side = sides.get(root), stem = path.basename(file, '.def');
    const key = path.relative(fs.existsSync(resDir) ? resDir : root, file).replace(/\\/g, '/').toLowerCase();
    const u = { unit: stem, key, class: null, classBy: null, peers: 0, defs: [], missing: [], extra: [], odd: [], values: [], gaps: null, findings: 0 };
    const skip = (why, kind) => { u.skipped = why; if (kind) u.skipKind = kind; res.push(u); };
    // the mod files the unit was read from (the def + every include the mod itself supplies), mod-relative
    const seen = new Set(), ws = { map: { get: k => { const e = side.map.get(k); if (e) seen.add(k); return e; }, has: k => side.map.has(k) }, base: side.base };
    let cls = o.class && o.class !== 'auto' ? o.class : null;
    if (cls) u.classBy = 'given';
    if (!cls) { const m = /^entity\/-vehicle\/(?:[^/]+\/)?([^/]+)\//.exec(key); if (m && isVeh(peersBy[m[1]])) { cls = m[1]; u.classBy = 'path'; } }
    if (!cls && !key.startsWith('entity/-vehicle/')) { const f = folderClass(key, peersBy); if (f) { cls = f.cls; u.classBy = 'folder' + (f.up ? ' +' + f.up : ''); } }
    const scope = cls && peersBy[cls] && !isVeh(peersBy[cls]) ? 'item' : 'vehicle';
    const rec = ext(ws, { key, stem, cls: '?', scope });
    u.defs = [...seen].map(k => { const e = side.map.get(k); return e && e.path ? path.relative(root, e.path).replace(/\\/g, '/') : 'resource/' + k; }).sort(J);
    if (!rec) { skip('def unreadable'); continue; }
    const have = new Set(Object.keys(rec.flat));
    if (!cls) {
      let best = null, bs = 0;
      for (const c of Object.keys(peersBy).sort()) {
        if (!isVeh(peersBy[c])) continue;
        const cm = common(c); if (!cm.length) continue;
        const inter = cm.filter(k => have.has(k)).length, s = inter / (cm.length + have.size - inter);
        if (s > bs + 1e-9) { bs = s; best = c; }
      }
      if (best && bs >= 0.3) { cls = best; u.classBy = 'keys ' + bs.toFixed(2); }
    }
    if (!cls) { skip('no class: no vanilla peer folder (pass --class)', 'noClass'); continue; }
    u.class = cls;
    const peers = peerRecs(cls); u.peers = peers.length;
    if (peers.length < 3) { skip('fewer than 3 peers in class ' + cls, 'fewPeers'); continue; }
    const all = {}; for (const r of peers) for (const k of Object.keys(r.flat)) all[k] = (all[k] || 0) + 1;
    u.missing = Object.keys(all).filter(k => all[k] === peers.length && !have.has(k)).sort();
    // in no peer of the class: a key no vanilla def of the wider scope has = extra (finding); one vanilla uses in another class = odd (counted only)
    const W = wide((peersBy[cls] && peersBy[cls][0] && peersBy[cls][0].top) || '-vehicle'), notPeer = [...have].filter(k => !all[k]).sort();
    u.extra = []; u.kept = [];
    for (const k of notPeer.filter(x => !W.has(x))) { const r = keepRow(keep.proven, k, cls); if (r) u.kept.push({ key: k, rule: r.id, src: r.src }); else u.extra.push(k); }
    u.odd = notPeer.filter(k => W.has(k));
    const cur = (table.classes[cls] || {}).curated || {};
    for (const k of Object.keys(rec.k).sort()) {
      const s = cur[k] && cur[k].as2, v = rec.k[k];
      if (!s || s.n < 3) continue;
      if (v < s.min || v > s.max) u.values.push({ key: k, value: v, min: s.min, max: s.max, n: s.n });
    }
    const gd = o.gaps || path.join(root, 'gaps'), gf = path.join(gd, stem + '.gaps.json');
    if (fs.existsSync(gf)) {
      const g = rd(gf), c = g.counts || {};
      u.gaps = { present: true, counts: c, byCode: g.byCode || {}, hand: c.hand || 0, unexplained: c.unexplained || 0 };
    } else u.gaps = { present: false, note: 'no gaps/' + stem + '.gaps.json: the port wrote none (or an older goh2as2); gap check skipped' };
    u.findings = u.missing.length + u.extra.length + u.values.length + (u.gaps.present ? u.gaps.hand + u.gaps.unexplained : 0);
    res.push(u);
  }
  base.close(); for (const s of sides.values()) s.close();
  res.sort((a, b) => J(a.key, b.key));
  const chk = res.filter(u => !u.skipped);
  return { tool: 'native', form: 'native/1', units: res, rules: o.noRules ? 'off' : { proven: keep.proven.length, statOnly: keep.statOnly.length },
    totals: { units: res.length, checked: chk.length, native: chk.filter(u => !u.findings).length, skipped: res.length - chk.length,
      findings: chk.reduce((a, u) => a + u.findings, 0), missing: chk.reduce((a, u) => a + u.missing.length, 0), extra: chk.reduce((a, u) => a + u.extra.length, 0),
      values: chk.reduce((a, u) => a + u.values.length, 0), gapsAbsent: chk.filter(u => !u.gaps.present).length,
      odd: chk.reduce((a, u) => a + u.odd.length, 0), kept: chk.reduce((a, u) => a + (u.kept || []).length, 0), noClass: res.filter(u => u.skipKind === 'noClass').length,
      byClass: Object.fromEntries([...new Set(chk.map(u => u.class))].sort(J).map(c => [c, chk.filter(u => u.class === c).length])) } };
}

function main() {
  const a = process.argv.slice(2), o = {};
  if (a[0] === 'profile') {
    a.shift(); o.profile = true;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--game') o.game = a[++i]; else if (a[i] === '--class') o.class = a[++i]; else if (a[i] === '-o') o.out = a[++i];
    else if (a[i] === '--table') o.table = a[++i]; else if (a[i] === '--peers') o.peers = +a[++i]; else if (a[i] === '--gaps') o.gaps = a[++i];
    else if (a[i] === '--rules') o.rules = a[++i]; else if (a[i] === '--no-rules') o.noRules = true;
    else if (!o.input) o.input = a[i];
  }
  if (o.profile) {
    if (!o.class || !o.game) { console.error('usage: native profile --class <c> --game <G> [-o f.json] [--peers N]'); return 2; }
    let j; try { j = profile(o); } catch (e) { console.error('native profile: ' + e.message); return 1; }
    const txt = JSON.stringify(j, null, 1) + '\n';
    if (o.out) { fs.mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true }); fs.writeFileSync(o.out, txt); } else process.stdout.write(txt);
    console.error(`native profile: class ${j.class}, ${j.peers} peers, ${Object.keys(j.keys).length} keys`);
    return 0;
  }
  if (!o.input || !o.game) { console.error('usage: native <ported unit def|mod dir> --game <G> [--class auto] [-o out.json]'); return 2; }
  const j = run(o), txt = JSON.stringify(j, null, 1) + '\n';
  if (o.out) { fs.mkdirSync(require('path').dirname(require('path').resolve(o.out)), { recursive: true }); fs.writeFileSync(o.out, txt); } else process.stdout.write(txt);
  const t = j.totals;
  console.error(`native: ${t.native} of ${t.checked} checked units native, ${t.findings} findings (missing ${t.missing}, extra ${t.extra}, values ${t.values}; odd ${t.odd} not counted, kept ${t.kept || 0} by reader-proven keep rows), ${t.skipped} skipped (${t.noClass} no class), gaps absent on ${t.gapsAbsent}`);
  return 0;
}
module.exports = { run, units, peerList, profile, folderClass, loadKeep, matchKey };
if (require.main === module) process.exitCode = main();
