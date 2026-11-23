#!/usr/bin/env node
// keylint learn: build tools/keylint/vocab.json from every vanilla SDL file (roots only; included fragments are learned in
// their includer's context). usage: node learn.js --game <gameDir> [--exe as64|mowas_2|mowas2|goh] [--out vocab.json] [--keys-only]
//   regenerate only when vanilla changes. --exe: the game mounted (mowas_2: the shared install without as64/core); default --out
//   per game: vocab.json (none, as64), vocab.mowas2.json (mowas_2), vocab.goh.json (goh; no --game: the GoH install, lib/games)
// vocab = { v, kinds: { kind: { "a/b/c": { n, k: { key: { n, s:{sig:count}, v:{ident:count}, sp:{spelling:count}, kids, dup, col, vo } } } } } }
//   kind = model.kindOf(file); path = folded block-key chain ('*s' string key, '#n' number key); n = blocks seen
// Author: Imperator_Aug (ARSENAL, ia-78c6c4a2)
const fs = require('fs'), path = require('path');
const sdlset = require('../lib/sdlset');
const M = require('./model');

const SIG_MAX = 8, V_CAP = 200, KEEP_V = 40, NAME_KEYS = new Set(['extender', 'patherid', 'collider']);   // global name lists (any path)

function newKs() { return { n: 0, s: new Map(), v: new Map(), sp: new Map(), kids: 0, dup: 0, col: 0 }; }
const inc = (m, k, d = 1) => m.set(k, (m.get(k) || 0) + d);

function visit(b, p, kind, stats, isRoot, depth) {
  const pk = kind + '|' + p;
  let ps = stats.get(pk);
  if (!ps) stats.set(pk, ps = { n: 0, k: new Map() });
  ps.n++;
  const { kids, groups } = M.parts(b, isRoot);
  const seen = new Map();
  kids.forEach((c, i) => {
    const cp = M.parts(c, false);
    if (cp.keyTok && cp.keyTok.k === 'IDENT' && cp.keyTok.text[0] === '%') return;
    const key = cp.key;
    let ks = ps.k.get(key);
    if (!ks) ps.k.set(key, ks = newKs());
    ks.n++;
    if (cp.keyTok && cp.keyTok.k === 'IDENT') inc(ks.sp, cp.keyTok.text);
    const sg = cp.toks.map(M.sigOf);
    if (!sg.includes('P')) inc(ks.s, sg.length > SIG_MAX ? sg.slice(0, SIG_MAX).join('') + '+' : sg.join(''));
    if (cp.kids.length) ks.kids++;
    const t0 = cp.toks[0];
    if (t0 && ks.v.size < V_CAP && t0.k === 'IDENT' && t0.text[0] !== '%') inc(ks.v, t0.text.toLowerCase());
    const nkey = key.startsWith('extender:') ? 'extender' : key;
    if (t0 && t0.k === 'STRING' && NAME_KEYS.has(nkey)) { const nm = stats.names || (stats.names = new Map()); (nm.get(nkey) || nm.set(nkey, new Set()).get(nkey)).add(t0.value.toLowerCase()); }
    for (const t of cp.toks) if (t.k === 'STRING' && M.hexColor(t.value)) ks.col++;
    const gk = groups[i] + '|' + key;
    seen.set(gk, (seen.get(gk) || 0) + 1);
    if (seen.get(gk) === 2) ks.dup++;
    if (depth < M.MAX_DEPTH) visit(c, M.childPath(p, key), kind, stats, false, depth + 1);
  });
}

function mergeInto(dst, src) {
  if (src.names) { const dn = dst.names || (dst.names = new Map()); for (const [k, st] of src.names) { const d = dn.get(k) || dn.set(k, new Set()).get(k); for (const x of st) d.add(x); } }
  for (const [pk, ps] of src) {
    let d = dst.get(pk);
    if (!d) dst.set(pk, d = { n: 0, k: new Map() });
    d.n += ps.n;
    for (const [key, ks] of ps.k) {
      let e = d.k.get(key);
      if (!e) d.k.set(key, e = newKs());
      e.n += ks.n; e.kids += ks.kids; e.dup += ks.dup; e.col += ks.col;
      for (const f of ['s', 'v', 'sp']) for (const [a, c] of ks[f]) inc(e[f], a, c);
    }
  }
}

// keysOnly (--keys-only): no value words (v), no name lists: key names, shapes and counts only, so no game data values ship
function toJson(all, keysOnly) {
  const kinds = {};
  for (const [pk, ps] of all) {
    if (ps.n < 3) continue;                       // rare paths: too thin to check keys under them
    const i = pk.indexOf('|'), kind = pk.slice(0, i), p = pk.slice(i + 1);
    const k = {};
    for (const [key, ks] of ps.k) {
      const o = { n: ks.n };
      const top = (m, cap) => { const a = [...m].sort((x, y) => y[1] - x[1]); const r = {}; for (const [x, c] of a.slice(0, cap)) r[x] = c; return r; };
      o.s = top(ks.s, 12);
      if (ks.v.size && ks.v.size <= KEEP_V && !keysOnly) o.v = Object.fromEntries(ks.v); else if (ks.v.size) o.vo = ks.v.size;
      if (ks.sp.size > 1 || (ks.sp.size === 1 && [...ks.sp.keys()][0] !== key)) o.sp = top(ks.sp, 4);
      if (ks.kids) o.kids = ks.kids;
      if (ks.dup) o.dup = ks.dup;
      if (ks.col) o.col = ks.col;
      k[key] = o;
    }
    (kinds[kind] || (kinds[kind] = {}))[p] = { n: ps.n, k };
  }
  const names = {}; if (all.names && !keysOnly) for (const [k, st] of all.names) names[k] = [...st].sort();
  return { v: 1, names, kinds };
}

// exe (optional): vfs exe of the game to mount ('as64'|'mowas_2'|'mowas2'|'goh'); none = the vfs pick (as64 when as64.exe is there)
function learn(gameDir, log, keysOnly, exe) {
  const src = sdlset.createSource(exe ? { gameDir, exe } : { gameDir });
  const items = src.vfsItems(), reads = [];
  let nerr = 0;
  for (const t of items) {
    try {
      const r = src.read(t, () => {});
      if (!r) continue;
      const stats = new Map();
      visit(r.root, '', M.kindOf(t.key), stats, true, 0);
      reads.push({ key: t.key, stats });
    } catch (e) { nerr++; if (log) log('CRASH ' + t.key + ' ' + e.message); }
  }
  const all = new Map();
  let used = 0;
  for (const r of reads) { if (src.included.has(r.key)) continue; used++; mergeInto(all, r.stats); }
  return { vocab: toJson(all, keysOnly), files: used, fragments: reads.length - used, crashes: nerr };
}

if (require.main === module) {
  const a = process.argv.slice(2);
  const gi = a.indexOf('--game'), oi = a.indexOf('--out'), ei = a.indexOf('--exe');
  const games = require('../lib/games'), g = ei >= 0 ? games.get(a[ei + 1]) : null;
  if (ei >= 0 && !g) { console.error('--exe must be one of as64|mowas_2|mowas2|goh'); process.exit(2); }
  const gameDir = gi >= 0 ? a[gi + 1] : g && g.id === 'goh' ? games.install('goh').dir : null;
  if (!gameDir) { console.error('usage: learn --game <gameDir> [--exe as64|mowas_2|mowas2|goh] [--out file] [--keys-only]'); process.exit(2); }
  const out = oi >= 0 ? a[oi + 1] : path.join(__dirname, g && g.id === 'mowas2' ? 'vocab.mowas2.json' : g && g.id === 'goh' ? 'vocab.goh.json' : 'vocab.json');
  const t0 = Date.now();
  const r = learn(gameDir, console.error, a.includes('--keys-only'), g ? g.exe : undefined);
  const txt = JSON.stringify(r.vocab);
  fs.writeFileSync(out, txt);
  let np = 0, nk = 0;
  for (const k of Object.values(r.vocab.kinds)) for (const p of Object.values(k)) { np++; nk += Object.keys(p.k).length; }
  console.log(`${r.files} root files (${r.fragments} fragments, ${r.crashes} crashes), ${Object.keys(r.vocab.kinds).length} kinds, ${np} paths, ${nk} keys; ${(txt.length / 1024).toFixed(0)} KB -> ${out}; ${Date.now() - t0} ms`);
}
module.exports = { learn, visit, mergeInto };
