#!/usr/bin/env node
// snap: file + CRC baseline of a game install, so the next update can be diffed after Steam replaces the files.
//   node tools/snap/snap.js --game <dir> [--label name] [--out dir] [--max-mb 512]
//   node tools/snap/snap.js --diff <old.json.gz> <new.json.gz> [--top 40]
// reads every pak central directory (fast, CRCs already there) + stats loose files; hashes loose exes/dlls/set text up to --max-mb total.
// writes <out>/<label>-<exe sha8>.json.gz. read-only on the game. mods/ is skipped: mods are not the game's baseline.
// Author: Imperator_Aug (ARSENAL, ia-bd894560)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const pak = require('../lib/pak');
const OUT = (process.env.AS64_RUN || path.resolve(__dirname, '..', '..', '..', 'run')).replace(/\\/g, '/') + '/snaps';
const EXES = ['binaries/x64/call_to_arms.exe', 'as64.exe', 'mowas_2.exe'];
const HASH = /\.(exe|dll|set|inc|ext|def|lua|info|txt)$/i;
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

function walk(root, rel, acc) {
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { if (!/^(mods|\.git|logs?|crashes|screenshots)$/i.test(e.name)) walk(root, r, acc); } else acc.push(r);
  }
  return acc;
}

function snap(game, o = {}) {
  const budget = { left: (o.maxMb || 512) * 1048576 };
  const s = { meta: { game: path.resolve(game).replace(/\\/g, '/'), when: new Date().toISOString(), exes: {} }, loose: {}, paks: {}, entries: {} };
  for (const e of EXES) { const p = path.join(game, e); if (fs.existsSync(p)) s.meta.exes[e] = sha(p); }
  for (const r of walk(game, '', [])) {
    const p = path.join(game, r), st = fs.statSync(p);
    if (/\.pak$/i.test(r)) {
      s.paks[r] = { size: st.size, mtime: Math.round(st.mtimeMs) };
      try { for (const x of pak.list(p)) if (!x.name.endsWith('/')) s.entries[x.name.toLowerCase()] = [x.crc, x.size, r]; }
      catch (e) { s.paks[r].error = e.message; }
      continue;
    }
    const row = { size: st.size, mtime: Math.round(st.mtimeMs) };
    if (HASH.test(r) && st.size <= budget.left) { row.sha = sha(p).slice(0, 16); budget.left -= st.size; }
    s.loose[r] = row;
  }
  return s;
}

function diff(a, b) {
  const d = { added: [], removed: [], changed: [], looseAdded: [], looseRemoved: [], looseChanged: [] };
  for (const k of Object.keys(b.entries)) { if (!a.entries[k]) d.added.push(k); else if (a.entries[k][0] !== b.entries[k][0]) d.changed.push(k); }
  for (const k of Object.keys(a.entries)) if (!b.entries[k]) d.removed.push(k);
  for (const k of Object.keys(b.loose)) { if (!a.loose[k]) d.looseAdded.push(k); else if ((a.loose[k].sha || a.loose[k].size) !== (b.loose[k].sha || b.loose[k].size)) d.looseChanged.push(k); }
  for (const k of Object.keys(a.loose)) if (!b.loose[k]) d.looseRemoved.push(k);
  return d;
}
const load = f => JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString());

if (require.main === module) {
  const a = process.argv.slice(2), o = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--game') o.game = a[++i]; else if (a[i] === '--label') o.label = a[++i]; else if (a[i] === '--out') o.out = a[++i];
    else if (a[i] === '--max-mb') o.maxMb = +a[++i]; else if (a[i] === '--top') o.top = +a[++i];
    else if (a[i] === '--diff') { o.old = a[++i]; o.new = a[++i]; }
    else { console.error('usage: snap --game <dir> [--label name] [--out dir] [--max-mb 512] | --diff <old> <new> [--top 40]'); process.exit(2); }
  }
  if (o.old) {
    const d = diff(load(o.old), load(o.new));
    for (const [k, v] of Object.entries(d)) { console.log(`${k}: ${v.length}`); for (const x of v.slice(0, o.top || 40)) console.log('  ' + x); }
    process.exit(0);
  }
  if (!o.game) { console.error('snap: --game <dir> required'); process.exit(2); }
  const t0 = Date.now(), s = snap(o.game, o);
  const exe = Object.values(s.meta.exes)[0] || 'noexe';
  const out = o.out || OUT; fs.mkdirSync(out, { recursive: true });
  const f = path.join(out, `${o.label || path.basename(path.resolve(o.game)).replace(/\W+/g, '_')}-${exe.slice(0, 8)}.json.gz`);
  fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(s)));
  console.log(`${f}: ${Object.keys(s.loose).length} loose, ${Object.keys(s.paks).length} paks, ${Object.keys(s.entries).length} pak entries, ${fs.statSync(f).size >> 10} KB, ${Date.now() - t0} ms`);
}
module.exports = { snap, diff, load };
