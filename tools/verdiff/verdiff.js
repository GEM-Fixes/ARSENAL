#!/usr/bin/env node
// verdiff: what changed between two game releases, for modders, and draft upgrade rules.
//   node tools/verdiff/verdiff.js <a> <b> [--from g --to g] [--rules-out f.json] [--json f] [--top N] [-q]
//   <a>,<b>: a game dir (resource/ walked: every pak via lib/pakset + loose files) or a tools/snap baseline (.json.gz). both the same kind.
//   1 file level (added/removed/changed by ext and top dir; diff itself = snap.diff)  2 renames (lib/renames.js: SDL key-path + value overlap
//   for text, CRC equal for binary; one-to-one best pairs)  3 key level: SDL keys added/removed in changed files, per keylint kind
//   4 --rules-out: draft rows for upgrade/rules (origin auto, tag I; never written into tools/upgrade/rules)
//   snap baselines hold names + CRCs only: file level + CRC renames, no key comparison (stated in the output).
//   games: AS64 and MoW:AS2 share one install, so two AS2 releases are two folders (or snaps); AS64's as64/core sits outside resource/ and
//   is not listed. GoH install: resource/ (sub-folder paks keyed by folder, lib/pakset, PORT-34: the same names as the GoH vfs view [I:
//   checked on the real install, every key matched]) plus localizations/ (keys localizations/<lang>/.., the GoH text .pot, GHLOC-01).
//   Mixing an AS2 dir and a GoH dir compares two games, not two releases: the line "games differ" says so, and the run stops after the
//   file level (no renames, no key level: those took 36 min on the real pair and mean nothing across games). --rules-out then writes
//   nothing ("no draft rules: the inputs are two games, not two releases"): cross-game removals are not upgrade rules.
// codes (all WARN_, unverified): WARN_VERDIFF_RENAME WARN_VERDIFF_RENAME_MAYBE WARN_VERDIFF_KEYS_REMOVED WARN_VERDIFF_KEYS_ADDED
// no cache: listing a game takes seconds, so there is no --no-cache either (an unknown flag exits 2).
// Author: Imperator_Aug (ARSENAL, ia-e0536a96)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const pakset = require('../lib/pakset'), pak = require('../lib/pak'), snap = require('../snap/snap');
const { createReport } = require('../lib/report');
const M = require('../keylint/model'), R = require('./lib/renames');

const SDL_EXT = new Set(['def', 'ext', 'inc', 'def1', 'mdl', 'mtl', 'mi', 'set', 'ammo', 'weapon', 'grenade', 'mine', 'hand', 'fx', 'pattern', 'presets', 'fsm', 'dl', 'info', 'mod', 'water', 'template', 'accuracy']);
const extOf = n => { const b = n.slice(n.lastIndexOf('/') + 1), i = b.lastIndexOf('.'); return i < 0 ? '' : b.slice(i + 1).toLowerCase(); };
const topOf = n => { const i = n.indexOf('/'); return i < 0 ? '(root)' : n.slice(0, i); };
const kindOfName = n => SDL_EXT.has(extOf(n)) ? M.kindOf((n.startsWith('resource/') ? '' : 'resource/') + n) : '.' + extOf(n);
const MAX_TEXT = 2 << 20;

// -> { kind:'dir'|'snap', s: snap-shaped {entries, loose}, read(name) -> Buffer|null }
function load(src) {
  if (/\.json\.gz$/i.test(src)) return { kind: 'snap', s: snap.load(src), read: null };
  const root = fs.existsSync(path.join(src, 'resource')) ? path.join(src, 'resource') : src;
  const s = { entries: {}, loose: {} }, ents = new Map(), paths = new Map();
  // GoH install (binaries/x64/call_to_arms.exe): its text sits outside resource/, in localizations/Default.pak (<lang>/interface/text/*.pot,
  // GHLOC-01): walked too, keys 'localizations/<lang>/..' (the GoH vfs mounts them as resource/interface/text/..). AS2 dirs: resource/ only.
  const roots = [[root, '']];
  if (root !== src && require('../lib/games').detect(src) === 'goh' && fs.existsSync(path.join(src, 'localizations'))) roots.push([path.join(src, 'localizations'), 'localizations/']);
  let ps = null;
  for (const [dir, pre] of roots) {
    const p0 = pakset.open(dir, null);
    if (!ps) ps = p0; else { ps.entries.push(...p0.entries); ps.errors.push(...p0.errors); }
    for (const e of p0.entries) { const k = pre + e.key; s.entries[k] = [e.ent.crc, e.size, path.basename(e.pak)]; ents.set(k, e); }
    for (const f of fs.readdirSync(dir, { recursive: true })) {
      if (/\.pak$/i.test(f)) continue;
      const p = path.join(dir, f);
      let st; try { st = fs.statSync(p); } catch (e) { continue; }
      if (!st.isFile()) continue;
      const name = pre + f.replace(/\\/g, '/').toLowerCase();
      s.loose[name] = { size: st.size, sha: zlib.crc32(fs.readFileSync(p)).toString(16) };
      paths.set(name, p);
    }
  }
  return { kind: 'dir', s, ps, errors: ps.errors, game: roots.length > 1 ? 'goh' : null, read: n => { if (paths.has(n)) return fs.readFileSync(paths.get(n)); const e = ents.get(n); return e ? pakset.read(e) : null; } };
}
const sizeOf = (L, n) => L.s.entries[n] ? L.s.entries[n][1] : L.s.loose[n] ? L.s.loose[n].size : 0;
const crcOf = (L, n) => L.s.entries[n] ? L.s.entries[n][0] : L.s.loose[n] && L.s.loose[n].sha ? parseInt(L.s.loose[n].sha, 16) : null;

function tally(names) {
  const byExt = {}, byTop = {};
  for (const n of names) { const e = extOf(n) || '(none)', t = topOf(n); byExt[e] = (byExt[e] || 0) + 1; byTop[t] = (byTop[t] || 0) + 1; }
  return { byExt, byTop };
}
const topN = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v}`).join(', ');

function run(a, b, o) {
  const t0 = Date.now(), out = { lines: [] }, say = s => out.lines.push(s);
  const A = load(a), B = load(b);
  if (A.kind !== B.kind) throw new Error('inputs must both be game dirs or both snap baselines');
  const hasKeys = A.kind === 'dir';
  // two games: renames and keys between them mean nothing and take over half an hour on real installs, so stop after the file level
  const differ = hasKeys && (A.game || B.game) && A.game !== B.game;
  if (differ) say('games differ: one input is a GoH install, the other is not; this compares two games, not two releases: file level only, renames and key level skipped');
  const d = snap.diff(A.s, B.s);
  const added = d.added.concat(d.looseAdded), removed = d.removed.concat(d.looseRemoved), changed = d.changed.concat(d.looseChanged);
  out.file = { added: added.length, removed: removed.length, changed: changed.length, byExt: { added: tally(added).byExt, removed: tally(removed).byExt, changed: tally(changed).byExt }, byTop: { added: tally(added).byTop, removed: tally(removed).byTop, changed: tally(changed).byTop } };
  out.keyLevel = differ ? 'files only (games differ)' : hasKeys ? 'keys' : 'names+crc only';
  say(`== file level (${hasKeys ? 'game dirs' : 'snap baselines: names + CRCs only, no keys compared'})`);
  say(`added ${added.length}, removed ${removed.length}, changed ${changed.length}`);
  for (const [w, l] of [['added', added], ['removed', removed], ['changed', changed]]) {
    const t = tally(l); say(`  ${w} by ext: ${topN(t.byExt, o.top)}`); say(`  ${w} by top dir: ${topN(t.byTop, o.top)}`);
  }
  if (differ) {
    say('== renames and key level: skipped (games differ)');
    out.renames = []; out.maybes = []; out.kl = {}; out.ms = Date.now() - t0; out.added = added; out.removed = removed;
    return out;
  }
  // renames
  const item = (L, n) => {
    const it = { name: n, ext: extOf(n), crc: crcOf(L, n), size: sizeOf(L, n) };
    if (L.read && SDL_EXT.has(it.ext) && it.size <= MAX_TEXT) { try { const buf = L.read(n); if (buf) { const sc = R.scan(buf); it.elems = sc.elems; it.keys = sc.keys; } } catch (e) { /* unreadable: crc only */ } }
    return it;
  };
  const pr = R.pair(removed.map(n => item(A, n)), added.map(n => item(B, n)), o);
  out.renames = pr.renames; out.maybes = pr.maybes;
  say(`== renames: ${pr.renames.length} (one-to-one, ${hasKeys ? 'key+value Jaccard >= 0.8 or CRC equal' : 'CRC equal only'}), maybe ${pr.maybes.length}`);
  // key level
  const kl = {};
  if (hasKeys) {
    for (const n of changed) {
      const e = extOf(n);
      if (!SDL_EXT.has(e) || sizeOf(A, n) > MAX_TEXT || sizeOf(B, n) > MAX_TEXT) continue;
      let x, y; try { x = R.scan(A.read(n)).keys; y = R.scan(B.read(n)).keys; } catch (err) { continue; }
      const k = kindOfName(n), m = kl[k] || (kl[k] = { files: 0, added: new Map(), removed: new Map() });
      m.files++;
      for (const q of y) if (!x.has(q)) m.added.set(q, (m.added.get(q) || 0) + 1);
      for (const q of x) if (!y.has(q)) m.removed.set(q, (m.removed.get(q) || 0) + 1);
    }
    say('== key level: changed SDL files, keys added/removed per kind (n = files)');
    out.keys = {};
    for (const [k, m] of Object.entries(kl).sort((p, q) => q[1].files - p[1].files)) {
      out.keys[k] = { files: m.files, added: m.added.size, removed: m.removed.size };
      say(`  ${k}: ${m.files} files, +${m.added.size} keys, -${m.removed.size} keys`);
    }
  } else say('== key level: skipped (snap baselines carry no keys)');
  out.kl = kl; out.ms = Date.now() - t0; out.added = added; out.removed = removed;
  return out;
}

function rules(out, o) {
  const rows = [], seen = new Set(), from = o.from, to = o.to;
  const id = s => { let k = s, i = 2; while (seen.has(k)) k = s + '-' + i++; seen.add(k); return k; };
  const base = n => n.slice(n.lastIndexOf('/') + 1);
  const ev = (p, w) => `verdiff ${from}->${to}: ${w} ${p.how} score ${p.score}`;
  for (const p of out.renames) {
    const inc = extOf(p.from) === 'inc';
    rows.push({ id: id((inc ? 'include-' : 'moved-') + base(p.from).replace(/\.[^.]+$/, '')), kind: inc ? 'include' : 'warn', from, to, scope: '*.def *.ext *.inc *.set', action: inc && p.score >= 0.9 ? 'rewrite' : 'warn', evidence: ev(p, 'rename'), tag: 'I', origin: 'auto', test: 'L3 sweep of a def using it', name: base(p.from), path: '/' + p.to });
  }
  for (const p of out.maybes) rows.push({ id: id('maybe-' + base(p.from).replace(/\.[^.]+$/, '')), kind: 'warn', from, to, scope: '*.def *.ext *.inc *.set', action: 'warn', evidence: ev(p, 'maybe ' + p.why), tag: 'I', origin: 'auto', test: 'L3 sweep of a def using it', name: base(p.from), path: '/' + p.to });
  const taken = new Set(out.renames.concat(out.maybes).map(p => p.from));
  for (const n of out.removed) if (extOf(n) === 'inc' && !taken.has(n)) rows.push({ id: id('gone-' + base(n).replace(/\.[^.]+$/, '')), kind: 'path_drop', from, to, scope: '*.def *.ext *.inc *.set', action: 'warn', evidence: `verdiff ${from}->${to}: include removed, no rename candidate`, tag: 'I', origin: 'auto', test: 'L3 sweep of a def using it', name: base(n), path: '/' + n });
  return rows.slice(0, o.rulesMax);
}

function main() {
  const a = process.argv.slice(2), o = { top: 12, hi: 0.8, lo: 0.5, rulesMax: 2000 }, pos = [];
  const val = i => { if (i + 1 >= a.length) { console.error(a[i] + ' needs a value'); process.exit(2); } return a[i + 1]; };
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    if (x === '--from') o.from = val(i++); else if (x === '--to') o.to = val(i++); else if (x === '--rules-out') o.rulesOut = val(i++);
    else if (x === '--json') o.json = val(i++); else if (x === '--top') o.top = Math.max(1, parseInt(val(i++), 10) || 1);
    else if (x === '-q') o.q = true;
    else if (x.startsWith('-')) { console.error('unknown arg ' + x); process.exit(2); } else pos.push(x);
  }
  if (pos.length !== 2) { console.error('usage: verdiff <a> <b> [--from g --to g] [--rules-out f.json] [--json f] [--top N] [-q]'); process.exit(2); }
  o.from = o.from || 'a'; o.to = o.to || 'b';
  const out = run(pos[0], pos[1], o), rep = createReport();
  for (const p of out.renames.slice(0, o.top)) rep.add(p.from, 0, 'WARN_VERDIFF_RENAME', `-> ${p.to} (${p.how} ${p.score})`);
  for (const p of out.maybes.slice(0, o.top)) rep.add(p.from, 0, 'WARN_VERDIFF_RENAME_MAYBE', `-> ${p.to} (${p.how} ${p.score}, ${p.why})`);
  for (const [k, m] of Object.entries(out.kl)) {
    for (const [w, code] of [['removed', 'WARN_VERDIFF_KEYS_REMOVED'], ['added', 'WARN_VERDIFF_KEYS_ADDED']]) {
      const top = [...m[w]].sort((x, y) => y[1] - x[1]).slice(0, 3);
      if (top.length) rep.add(k, 0, code, `${m[w].size} keys in ${m.files} files, top: ${top.map(([q, n]) => q + ' x' + n).join(', ')}`);
    }
  }
  if (!o.q) console.log(out.lines.join('\n'));
  rep.print({ showInfo: !o.q });
  console.log(`${out.ms} ms`);
  if (o.rulesOut && out.keyLevel === 'files only (games differ)') console.log(`no draft rules: the inputs are two games, not two releases (${o.rulesOut} not written)`);
  else if (o.rulesOut) {
    const rows = rules(out, o);
    require('../upgrade/lib/rules').validate(rows, o.rulesOut);
    fs.writeFileSync(o.rulesOut, JSON.stringify(rows, null, 1));
    console.log(`${rows.length} draft rows -> ${o.rulesOut}`);
  }
  if (o.json) fs.writeFileSync(o.json, JSON.stringify({ tool: 'verdiff', file: out.file, keyLevel: out.keyLevel, renames: out.renames, maybes: out.maybes, keys: out.keys || null, ms: out.ms }, null, 1));
}
if (require.main === module) main();
module.exports = { run, rules, load };
