#!/usr/bin/env node
// vfs: emulate the engine resource index for a game dir + mod list. rules:{emulate,order,mount,mods,patch}
//   node vfs.js <gameDir> [--mods a,b:1] [--profile options.set] [--exe as64|mowas_2|mowas2|goh] [--names] [-q]   problems as findings
//   node vfs.js <gameDir> ... which <virtual path>                                     winner + full shadow chain
//   node vfs.js <gameDir> ... shadowed [--list]                                        mod files hiding base files, per mod
//   --exe: the game whose file set is shown (lib/games; mowas2 = mowas_2). none = as before: as64.exe in the folder -> as64,
//     binaries/x64/call_to_arms.exe -> goh, else mowas_2. gameDir may be left out (or '-') with --exe: the install of that game
//     (lib/games install: the AS2 install for as64/mowas_2, the GoH install for goh). GoH layout: lib/vfs (GHVFS-04).
//   speed: each listed mod is listed once by lib/modtree (parallel, restore points left out: the game never mounts them) and
//     mounted from that listing; the files VFS-35 searches are read many at a time (chk refTexts). Findings as before.
//   main(argv, {ra}) = the CLI; ctx.js = the read-once module form for doctor (lib/modset, tools/lib/MODSET.md)
// Author: Imperator_Aug (ARSENAL, ia-bbd48152)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');
const games = require('../lib/games'), modtree = require('../lib/modtree');
const { build, listed, readModList } = require('../lib/vfs'), names = require('../lib/names'), { createReport, relPath } = require('../lib/report');

// main(args, {ra}): the CLI (and ctx.js, the read-once module form: the pass's reader as ra, the files VFS-35 searches read
// through it; the pass's scan of the mod folder is adopted, so listings() takes it instead of a walk). An error rejects.
async function main(args, { ra } = {}) {
try { return await cmdMain(args, ra); } finally { if (ra) ra.close(); }
}
async function cmdMain(args, ra) {
const pos = [], o = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--mods') o.mods = (args[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
  else if (a === '--exe') { const g = games.get(args[++i]); if (!g) { console.error('--exe must be as64, mowas_2 (mowas2) or goh'); process.exit(2); } o.exe = g.exe; }
  else if (a === '--profile') o.profile = args[++i];
  else if (a === '--names') o.checkNames = true;
  else if (a === '--list') o.list = true;
  else if (a === '-q') o.q = true;
  else pos.push(a);
}
// --exe with no gameDir (or '-'): the install of that game
if (o.exe && (!pos.length || pos[0] === '-' || pos[0] === 'which' || pos[0] === 'shadowed')) {
  if (pos[0] === '-') pos.shift();
  const r = games.install(o.exe);
  if (!r.dir) { console.error(`no ${games.get(o.exe).name} install found: pass the game folder`); process.exit(2); }
  pos.unshift(r.dir);
}
if (!pos.length) { console.error('usage: vfs.js <gameDir> [--mods a,b] [--profile options.set] [--exe as64|mowas_2|goh] [--names] [-q] [which <path> | shadowed [--list]]'); process.exit(2); }
const gameDir = pos[0], cmd = pos[1];
// GoH: the profile list is read at the GoH version (as lib/vfs build), else the AS2 3.262 default wipes a 1.0xx list
const gohVer = () => { const pe = require('../lib/gamever').peVersion(path.join(gameDir, 'binaries', 'x64', 'call_to_arms.exe')), g = pe && /^(\d+)\.(\d)\.(\d)\.(\d)/.exec(pe); return g ? g[1] + '.' + g[2] + g[3] + g[4] : '1.067'; };
// the listed mods: one lib/modtree scan each (listed and stat'ed in parallel, restore points left out: never mounted), handed to
// build as listings (same records as its own walk with a sync stat per file). A folder that cannot be scanned is walked as before.
async function listings() {
  let mods = o.mods;
  if (!mods && o.profile) {
    const isGoh = o.exe ? o.exe === 'goh' : !fs.existsSync(path.join(gameDir, 'as64.exe')) && fs.existsSync(path.join(gameDir, 'binaries', 'x64', 'call_to_arms.exe'));
    try { mods = readModList(o.profile, isGoh ? gohVer() : undefined).mods; } catch { mods = null; }
  }
  if (!mods || !mods.length) return [];
  let ls = []; try { ls = listed({ gameDir, mods, exe: o.exe }); } catch { return []; }
  const out = [];
  for (const m of ls) {
    // a scan this process already has of that very folder (in the read-once pass: the pass's, adopted): the same records
    const T = modtree.fresh(m.dir);
    if (T && T.dir === path.resolve(m.dir)) { out.push(T); continue; }
    try { out.push(await modtree.scan(m.dir)); } catch { /* walked by build */ }
  }
  return out;
}

const v = build({ gameDir, mods: o.mods, profile: o.profile, exe: o.exe, checkNames: o.checkNames, listings: await listings() });

const desc = r => r.deleted ? `DELETED by ${r.layer} (${r.how})` : `[${r.layer}] ${r.source} ${r.container}${r.source === 'pak' ? ' :: ' : ' / '}${r.entry}`;
const isBaseRec = r => r.layer === 'base' || /^patch \d+$/.test(r.layer);

if (cmd === 'which') {
  // virtual keys carry the mount root ('resource/set/x.set'); a pak-relative path ('set/x.set') is retried under resource/
  let key = names.normalize(pos[2] || '').replace(/^\.?\/+/, '');
  if (!v.chain(key).length && !key.startsWith('resource/') && v.chain('resource/' + key).length) { console.log(`(no mount root given: using resource/${key})`); key = 'resource/' + key; }
  const ch = v.chain(key), win = v.files.get(key);
  console.log(`key: ${key}`);
  if (!ch.length) { console.log('not in index'); process.exit(1); }
  console.log(win ? `winner: ${desc(win)}` : `winner: none (key absent): ${desc(ch[ch.length - 1])}`);
  for (let i = ch.length - 2; i >= 0; i--) console.log(`  shadowed: ${desc(ch[i])}`);
  console.log(`(exe ${v.exe}, mode ${v.mode || 'n/a'}, ${v.files.size} entries, mods: ${v.mods.join(', ') || 'none'})`);
} else if (cmd === 'shadowed') {
  const per = new Map();
  for (const key of new Set(v.shadows.map(s => s.key))) {
    const ch = v.chain(key);
    if (!ch.some(isBaseRec)) continue;
    const last = ch[ch.length - 1];
    if (isBaseRec(last)) continue;
    const mod = last.layer.replace(/ patch \d+$/, '');
    let p = per.get(mod); if (!p) per.set(mod, p = { hide: [], del: [] });
    (last.deleted ? p.del : p.hide).push(key);
  }
  for (const m of v.mods) {
    const p = per.get(m) || { hide: [], del: [] };
    const dirs = {};
    for (const k of p.hide) { const d = k.split('/').slice(0, 2).join('/'); dirs[d] = (dirs[d] || 0) + 1; }
    console.log(`${m}: hides ${p.hide.length} base files, deletes ${p.del.length}` + (p.hide.length ? ' | ' + Object.entries(dirs).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e.join(' ')).join(', ') : ''));
    if (o.list) { for (const k of p.hide) console.log('  hide ' + k); for (const k of p.del) console.log('  del  ' + k); }
  }
  if (!v.mods.length) console.log('no active mods');
} else {
  const rep = createReport();
  for (const p of v.problems) {
    const where = p.where && path.isAbsolute(p.where) ? relPath(path.resolve(gameDir), p.where) : (p.where || '.');
    (p.level === 'info' ? rep.info : rep.add).call(rep, where, 0, p.code, p.msg);
  }
  // CHK-VFS static checks (chk.js): VFS-35, 53, 57, 58
  const list = o.mods || (o.profile ? readModList(o.profile, v.exe === 'goh' ? gohVer() : undefined).mods : []);
  // = chk.checksAsync(v, { list }); with ra the reader closes once the texts are read (or at once: no delete, nothing to read)
  const chk = require('./chk'), pre = await chk.refTexts(v, { list, ra });
  if (ra) ra.close();
  for (const p of chk.checks(v, { list }, pre)) rep.add(p.where || '.', 0, p.code, p.msg);
  rep.info('.', 0, 'STATS', `exe ${v.exe}, mode ${v.mode || 'n/a'}, ${v.files.size} entries, ${v.shadows.length} shadow events, mods: ${v.mods.join(', ') || 'none'}, ${v.ms} ms`);
  rep.print({ byCode: true, showInfo: !o.q });
}
}
module.exports = { main };
if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e && e.stack || e); process.exit(1); });
