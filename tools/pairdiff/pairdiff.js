#!/usr/bin/env node
// pairdiff: static structure diff of the same content in two mods or game dirs (GoH Valour vs AS2 Valour, or any A vs B). Reads only.
//   node tools/pairdiff/pairdiff.js --a <dirA> --b <dirB> --out pairs.json [--class <substring>] [--top N] [--no-goh-fix] [--base-a <GoH game dir> --base-b <AS2 game dir>]
//   --base-a/--base-b: expand pass. Includes (/properties/*.inc, .ext) and macro defines missing from the mod resolve in the base game dir; stats in out.expand.
//   dir: <dir>/resource paks and loose files, then <dir>/N.pat overlays in number order (later wins). A = GoH side.
// Pairs: entity .def by stem (unique both sides); every other SDL text file by exact key. Group: entity/<-vehicle>/<nation>/<class>, set/stuff/<x>.
// Per group: pairs, byte-identical, keys only in A or only in B (with share of pairs), numeric keys whose value moved (median A/B).
// Also: layout (top dirs, extensions, identical by size+crc), sibling extensions per unit, and maps with the same dir name.
// Author: Imperator_Aug (ARSENAL, ia-e741cf96)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');
const pakset = require('../lib/pakset'), pak = require('../lib/pak'), sdlx = require('../lib/sdlx');
const M = require('../keylint/model');
const { fixHashTags } = require('../goh2as2/goh2as2');
const CK = require('../portdiff/checks');

const SDL = /\.(def|ext|inc|def1|mdl|mtl|mi|set|ammo|weapon|grenade|mine|hand|fx|pattern|presets|fsm|dl|info|template)$/;
const extOf = k => { const b = k.slice(k.lastIndexOf('/') + 1), i = b.lastIndexOf('.'); return i < 0 ? '' : b.slice(i); };
const stem = k => { const b = k.slice(k.lastIndexOf('/') + 1), i = b.lastIndexOf('.'); return i < 0 ? b : b.slice(0, i); };
const inc = (m, k, d = 1) => m.set(k, (m.get(k) || 0) + d);

function collect(dir) {
  const root = fs.existsSync(path.join(dir, 'resource')) ? path.join(dir, 'resource') : dir;
  const ps = pakset.open(root, null), map = new Map(), lists = [];
  for (const e of ps.entries) map.set(e.key, e);
  for (const f of fs.readdirSync(root, { recursive: true })) {
    const p = path.join(root, f);
    let st; try { st = fs.statSync(p); } catch (e) { continue; }
    if (st.isFile() && !/\.pak$/i.test(p)) { const key = f.replace(/\\/g, '/').toLowerCase(); map.set(key, { key, size: st.size, path: p }); }
  }
  const pats = root === dir ? [] : fs.readdirSync(dir).filter(f => /^\d+\.pat$/i.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
  let overlays = 0;
  for (const f of pats) {
    let L; try { L = pak.list(path.join(dir, f)); } catch (e) { continue; }
    L.fd = fs.openSync(path.join(dir, f), 'r'); lists.push(L);
    for (const ent of L) {
      if (ent.name.endsWith('/')) continue;
      const key = ent.name.toLowerCase().replace(/^resource\//, '');
      map.set(key, { key, name: key, size: ent.size, ent, L }); overlays++;
    }
  }
  return { map, overlays, errors: ps.errors, close() { ps.close(); for (const L of lists) { try { fs.closeSync(L.fd); } catch (e) {} } } };
}
const readEnt = e => e.path ? fs.readFileSync(e.path) : pakset.read(e);
const crcOf = e => { if (e.ent) return e.ent.crc ?? e.ent.crc32; if (e.path) return e.crcv ??= require('zlib').crc32(fs.readFileSync(e.path)); };
const same = (x, y) => x.size === y.size && crcOf(x) !== undefined && crcOf(x) === crcOf(y);

// walk a parsed tree: path -> first numeric value (or null) per block key
function flatten(b, p, isRoot, out, depth) {
  if (depth > 24) return;
  const { kids } = M.parts(b, isRoot);
  for (const c of kids) {
    const cp = M.parts(c, false);
    if (!cp.key || (cp.keyTok && cp.keyTok.k === 'IDENT' && cp.keyTok.text[0] === '%')) continue;
    const id = p ? p + '/' + cp.key : cp.key;
    const t = cp.toks.find(x => typeof x.value === 'number');
    if (!out.has(id)) out.set(id, t ? t.value : null);
    flatten(c, id, false, out, depth + 1);
  }
}
function parse(side, key, gohFix) {
  const fix = b => gohFix && b.includes('{##') ? Buffer.from(CK.stripDisabledBlocks(fixHashTags(b.toString('latin1'))), 'latin1') : b;
  // expand pass: includes resolve in the mod first, then in the base game dir (side.base, --base-a/--base-b) when given.
  // Vanilla holds /properties/*.inc|ext and the macro defines, so a mod-only read leaves chassis/pather blocks unexpanded.
  const open = r => {
    if (r.kind !== 'virtual') return null;
    const k = r.key.replace(/^resource\//, '');
    const e = side.map.get(k) || (side.base && side.base.map.get(k));
    return e ? { buf: fix(readEnt(e)), file: r.key, key: r.key } : null;
  };
  const b = fix(readEnt(side.map.get(key)));
  if (b.includes(0) && !(b[0] === 0xFF || b[0] === 0xFE)) return null;
  const fk = 'resource/' + key;
  const st = side.stats || (side.stats = { files: 0, includeMissing: 0, macroUndefined: 0 });
  st.files++;
  const r = sdlx.read(b, { file: fk, key: fk, open, onError: (f, l, c) => { if (c === 'INCLUDE_MISSING') st.includeMissing++; else if (c === 'MACRO_UNDEFINED') st.macroUndefined++; } });
  const raw = new Map(); flatten(r.root, '', true, raw, 0);
  // GoH roots a def in `game_entity`, AS2 in `entity`: same block, so fold the name or no key ever pairs
  const out = new Map(); for (const [k, v] of raw) out.set(k.replace(/^game_entity(?=\/|$)/, 'entity'), v);
  return out;
}

function groupOf(k) {
  const p = k.split('/');
  if (p[0] === 'entity') {
    if (p[1] === '-vehicle') return 'entity/-vehicle/' + (p[3] || '?');
    if (p[1] === '-human' || p[1] === 'human') return 'entity/human';
    return 'entity/' + p[1];
  }
  if (p[0] === 'set' && p[1] === 'stuff') return 'set/stuff/' + (p[2] && p.length > 3 ? p[2] : extOf(k));
  if (p[0] === 'set') return 'set/' + (p.length > 2 ? p[1] : '(top)');
  if (p[0] === 'map') return 'map';
  return p[0];
}
function pairsOf(A, B) {
  // the same stem can sit in several folders (GoH adds nation dirs): sorted lists pair off in order, so repeats still pair
  const out = [], stemsOf = S => { const m = new Map(); for (const k of [...S.map.keys()].sort()) if (k.startsWith('entity/') && k.endsWith('.def')) { const s = stem(k); (m.get(s) || m.set(s, []).get(s)).push(k); } return m; };
  const sa = stemsOf(A), sb = stemsOf(B), used = new Set();
  for (const [s, l] of sa) { const r = sb.get(s); if (r) for (let i = 0; i < Math.min(l.length, r.length); i++) { out.push([l[i], r[i]]); used.add(l[i]); } }
  for (const k of A.map.keys()) if (!used.has(k) && SDL.test(k) && B.map.has(k) && !k.startsWith('map/') && !k.startsWith('shader/')) out.push([k, k]);
  return out;
}

function layout(S) {
  const top = {}, ext = {};
  for (const [k, e] of S.map) { const t = k.split('/')[0]; top[t] = (top[t] || 0) + 1; const x = extOf(k); (ext[x] = ext[x] || [0, 0])[0]++; ext[x][1] += e.size; }
  return { files: S.map.size, top, ext: Object.fromEntries(Object.entries(ext).sort((a, b) => b[1][1] - a[1][1]).slice(0, 40)) };
}
function grsInfo(b) {   // GRAS: AS2 = PMAP straight after magic; GoH = VER-/SEED tags first (mapport)
  if (b.length < 12 || b.toString('latin1', 0, 4) !== 'GRAS') return null;
  let p = 4, ver = null;
  while (['VER-', 'SEED'].includes(b.toString('latin1', p, p + 4))) { if (b.toString('latin1', p, p + 4) === 'VER-') ver = b.readUInt32LE(p + 4); p += 8; }
  if (b.toString('latin1', p, p + 4) !== 'PMAP') return null;
  const form = p === 4 ? 'as2' : 'goh'; p += 4;
  const count = b.readUInt32LE(p); p += 4;
  for (let i = 0; i < count; i++) p += 1 + b[p];
  const l = b.readInt32LE(p), t = b.readInt32LE(p + 4), r = b.readInt32LE(p + 8), bt = b.readInt32LE(p + 12), cell = b.readFloatLE(p + 16);
  return { form, ver, names: count, w: r - l, h: bt - t, cell, bytes: b.length };
}
// one side's maps at a glance, for when the two sides share no map names: files per dir, mi/info keys, grs form and cell size
function mapProfile(S, gohFix) {
  const dirs = new Map(), ext = new Map(), keys = new Map(), grs = new Map();
  for (const k of S.map.keys()) if (k.startsWith('map/')) { const i = k.lastIndexOf('/'), d = k.slice(0, i); (dirs.get(d) || dirs.set(d, []).get(d)).push(k.slice(i + 1)); }
  let maps = 0, sizes = [];
  for (const [d, l] of dirs) {
    if (!l.some(f => f.endsWith('.mi') || f === 'map.info' || f.endsWith('.grs'))) continue;
    maps++;
    for (const x of new Set(l.map(extOf))) inc(ext, x);
    for (const f of l) {
      const key = d + '/' + f;
      if (/\.grs$/.test(f)) { const g = grsInfo(readEnt(S.map.get(key))); if (g) { inc(grs, g.form + ' cell ' + g.cell); sizes.push(g.w * g.h); } }
      else if (/\.(mi|info)$/.test(f)) {
        try { const t = parse(S, key, gohFix); if (t) for (const p of t.keys()) inc(keys, extOf(f) + ' ' + p.split('/').slice(0, 2).join('/')); } catch (e) {}
      }
    }
  }
  sizes.sort((a, b) => a - b);
  const top = m => [...m].sort((a, b) => b[1] - a[1]).slice(0, 80);
  return { maps, ext: top(ext), keys: top(keys), grs: top(grs), medianCells: sizes[sizes.length >> 1] || 0 };
}
function mapPairs(A, B, gohFix) {
  // maps pair by leaf dir name, since each side files them under different parents
  const dirs = S => { const m = new Map(); for (const k of S.map.keys()) { if (!k.startsWith('map/')) continue; const i = k.lastIndexOf('/'); const d = k.slice(0, i); (m.get(d) || m.set(d, []).get(d)).push(k.slice(i + 1)); } return m; };
  const leaf = d => d.slice(d.lastIndexOf('/') + 1);
  const da = dirs(A), db = dirs(B), rows = [], extA = new Map(), extB = new Map(), keyA = new Map(), keyB = new Map(), keyBoth = new Map();
  const isMap = fs_ => fs_.some(f => f.endsWith('.mi') || f === 'map.info' || f.endsWith('.grs'));
  const byLeaf = new Map(); for (const [d, l] of db) if (isMap(l)) (byLeaf.get(leaf(d)) || byLeaf.set(leaf(d), []).get(leaf(d))).push(d);
  let n = 0, identical = 0, files = 0;
  const leafA = new Set(), allA = [...da].filter(([, l]) => isMap(l));
  for (const [da1] of allA) leafA.add(leaf(da1));
  const leafNames = { a: leafA.size, b: byLeaf.size };
  for (const [d, fa] of allA) {
    const dbs = byLeaf.get(leaf(d)); if (!dbs) continue;
    const d2 = dbs.includes(d) ? d : dbs[0], fb = db.get(d2);
    n++;
    const sb = new Set(fb), sa = new Set(fa), row = { dir: d, dirB: d2, onlyA: fa.filter(f => !sb.has(f)), onlyB: fb.filter(f => !sa.has(f)), identical: 0, shared: 0 };
    for (const f of fa) { inc(extA, extOf(f)); if (sb.has(f)) { row.shared++; files++; if (same(A.map.get(d + '/' + f), B.map.get(d2 + '/' + f))) { row.identical++; identical++; } } else inc(keyA, 'file ' + extOf(f)); }
    for (const f of fb) { inc(extB, extOf(f)); if (!sa.has(f)) inc(keyB, 'file ' + extOf(f)); }
    for (const f of fa.filter(x => sb.has(x) && /\.(mi|info|set)$/.test(x))) {
      try {
        const ka = parse(A, d + '/' + f, gohFix), kb = parse(B, d2 + '/' + f, false);
        if (!ka || !kb) continue;
        for (const k of ka.keys()) { const id = extOf(f) + ' ' + k.split('/').slice(0, 3).join('/'); if (kb.has(k)) inc(keyBoth, id); else inc(keyA, id); }
        for (const k of kb.keys()) if (!ka.has(k)) inc(keyB, extOf(f) + ' ' + k.split('/').slice(0, 3).join('/'));
      } catch (e) { row.err = (row.err || 0) + 1; }
    }
    const grs = fa.find(f => /\.grs$/.test(f)) || null;
    if (grs) { row.grsA = grsInfo(readEnt(A.map.get(d + '/' + grs))); if (sb.has(grs)) row.grsB = grsInfo(readEnt(B.map.get(d2 + '/' + grs))); }
    rows.push(row);
  }
  const top = m => [...m].sort((a, b) => b[1] - a[1]).slice(0, 60);
  return { pairs: n, sharedFiles: files, identical, dirsA: da.size, dirsB: db.size, leafNames, extA: top(extA), extB: top(extB), keysOnlyA: top(keyA), keysOnlyB: top(keyB), keysBoth: top(keyBoth), rows };
}

function main() {
  const o = { top: 40, gohFix: true };
  const av = process.argv.slice(2);
  for (let i = 0; i < av.length; i++) {
    if (av[i] === '--a') o.a = av[++i]; else if (av[i] === '--b') o.b = av[++i]; else if (av[i] === '--out') o.out = av[++i];
    else if (av[i] === '--class') o.cls = av[++i]; else if (av[i] === '--top') o.top = +av[++i]; else if (av[i] === '--no-goh-fix') o.gohFix = false;
    else if (av[i] === '--base-a') o.baseA = av[++i]; else if (av[i] === '--base-b') o.baseB = av[++i];
  }
  if (!o.a || !o.b || !o.out) { console.error('usage: pairdiff.js --a <dirA> --b <dirB> --out pairs.json [--class s] [--top N]'); process.exit(2); }
  const A = collect(o.a), B = collect(o.b);
  const bases = [];
  if (o.baseA) bases.push(A.base = collect(o.baseA));
  if (o.baseB) bases.push(B.base = collect(o.baseB));
  const closeAll = () => { A.close(); B.close(); for (const x of bases) x.close(); };
  if (av.includes('--maps-only')) {
    const maps = mapPairs(A, B, o.gohFix);
    maps.profileA = mapProfile(A, o.gohFix); maps.profileB = mapProfile(B, false);
    fs.writeFileSync(o.out, JSON.stringify({ maps }));
    closeAll();
    console.log(`pairdiff maps: ${maps.profileA.maps} vs ${maps.profileB.maps} map dirs, ${maps.pairs} pairs -> ${o.out}`);
    return;
  }
  const groups = new Map();
  let errors = 0;
  for (const [ka, kb] of pairsOf(A, B)) {
    const g = groupOf(ka);
    if (o.cls && !g.includes(o.cls)) continue;
    const G = groups.get(g) || groups.set(g, { pairs: 0, identical: 0, onlyA: new Map(), onlyB: new Map(), both: new Map(), ratio: new Map(), ex: null }).get(g);
    G.pairs++;
    if (!G.ex) G.ex = ka;
    const ea = A.map.get(ka), eb = B.map.get(kb);
    if (same(ea, eb)) { G.identical++; continue; }
    let fa, fb;
    try { fa = parse(A, ka, o.gohFix); fb = parse(B, kb, false); } catch (e) { errors++; continue; }
    if (!fa || !fb) continue;
    for (const [k, v] of fa) {
      if (!fb.has(k)) { inc(G.onlyA, k); continue; }
      inc(G.both, k);
      const w = fb.get(k);
      if (v !== null && w !== null && w !== 0) { let l = G.ratio.get(k); if (!l) G.ratio.set(k, l = []); if (l.length < 4000) l.push(v / w); }
    }
    for (const k of fb.keys()) if (!fa.has(k)) inc(G.onlyB, k);
  }
  const top = (m, N) => [...m].sort((a, b) => b[1] - a[1]).slice(0, N);
  const med = l => { const s = [...l].sort((a, b) => a - b); return s[s.length >> 1]; };
  const gout = {};
  for (const [g, G] of groups) {
    const moved = [...G.ratio].map(([k, l]) => ({ k, n: l.length, med: +med(l).toFixed(3), same: l.filter(x => x === 1).length })).filter(r => r.n >= 3 && r.same < r.n * 0.9).sort((a, b) => b.n - a.n).slice(0, o.top);
    gout[g] = { pairs: G.pairs, identical: G.identical, ex: G.ex, onlyA: top(G.onlyA, o.top), onlyB: top(G.onlyB, o.top), moved };
  }
  // sibling files of paired units, by extension: what a unit folder holds on each side
  const sib = { A: new Map(), B: new Map(), both: new Map() };
  const dirFiles = S => { const m = new Map(); for (const k of S.map.keys()) if (k.startsWith('entity/')) { const i = k.lastIndexOf('/'), d = k.slice(0, i); (m.get(d) || m.set(d, []).get(d)).push(k.slice(i + 1)); } return m; };
  const dfa = dirFiles(A), dfb = dirFiles(B);
  for (const [ka, kb] of pairsOf(A, B)) {
    if (!ka.startsWith('entity/')) continue;
    const fa = dfa.get(ka.slice(0, ka.lastIndexOf('/'))) || [], fb = dfb.get(kb.slice(0, kb.lastIndexOf('/'))) || [];
    const xa = new Set(fa.map(extOf)), xb = new Set(fb.map(extOf));
    for (const x of xa) inc(xb.has(x) ? sib.both : sib.A, x);
    for (const x of xb) if (!xa.has(x)) inc(sib.B, x);
  }
  const maps = mapPairs(A, B, o.gohFix);
  maps.profileA = mapProfile(A, o.gohFix); maps.profileB = mapProfile(B, false);
  const ident = [...A.map].filter(([k, e]) => { const f = B.map.get(k); return f && same(e, f); }).length;
  const shared = [...A.map.keys()].filter(k => B.map.has(k)).length;
  const res = { a: path.basename(o.a), b: path.basename(o.b), layout: { a: layout(A), b: layout(B), sharedKeys: shared, identical: ident, overlaysA: A.overlays, overlaysB: B.overlays, errors: [...A.errors, ...B.errors].length }, parseErrors: errors, expand: { base: { a: !!o.baseA, b: !!o.baseB }, a: A.stats || null, b: B.stats || null }, siblings: { onlyA: top(sib.A, 30), onlyB: top(sib.B, 30), both: top(sib.both, 30) }, groups: gout, maps };
  fs.writeFileSync(o.out, JSON.stringify(res));
  closeAll();
  console.log(`pairdiff: ${res.layout.a.files} vs ${res.layout.b.files} files, ${shared} shared keys, ${ident} identical, ${Object.keys(gout).length} groups, ${maps.pairs} map pairs, ${errors} parse errors -> ${o.out}`);
}
if (require.main === module) main();
module.exports = { main, collect, grsInfo, groupOf, flatten };
