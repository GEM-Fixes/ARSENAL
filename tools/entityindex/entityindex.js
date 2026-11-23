#!/usr/bin/env node
// entityindex: JSON cache of entities over the VFS (refs: models, weapons, ammo, items, anims, visions; stuff; mdl/mtl refs)
//   node entityindex.js <gameDir> [--exe as64|mowas_2|mowas2|goh] [--mods a,b] [--folder dir] [--cache file] [--force] [--check] [--stats] [name...]
//   --exe  the game whose vfs view is indexed (default: the vfs choice, as64 when as64.exe is in gameDir); for goh give the GoH
//          install as gameDir. One cache per exe: mowas_2 / goh use <cache>.<exe>.json. The summary line starts 'exe <exe>:'
//   build/refresh the cache (only files whose signature changed are re-parsed). default cache:
//   tools/entityindex/cache/<vanilla|mods-hash>.json (kept in the per-user cache folder, lib/toolcache). There that name belongs to the
//   installed game; a gameDir that is not the installed game gets <name>.f<8 hex>.json, and a cache built for another game folder is
//   never reused.  name... = print those entities (inherits, extenders, refs)
//   --check  do not build; list stale / added / removed records against the current files (exit 1 if any)
//   --folder dir  index a loose folder (resource/...) instead of the game (gameDir then optional: pass -)
// API for other tools: require('./index') (see header there).
// Author: Imperator_Aug (ARSENAL, ia-bfe35da6)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const path = require('path'), crypto = require('crypto');
const ix = require('./index');

const args = process.argv.slice(2), pos = [];
const o = { mods: null, folder: null, cache: null, force: false };
let check = false, stats = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--mods' || a === '--mod') o.mods = args[++i].split(',').map(s => s.trim()).filter(Boolean);
  else if (a === '--folder') o.folder = args[++i];
  else if (a === '--cache' || a === '--out') { o.cache = args[++i]; if (/^(nul|con|prn|aux|com\d|lpt\d)(\..*)?$/i.test(require('path').basename(o.cache))) { console.error(`entityindex: ${a} ${o.cache} is a device name, it would write a real file`); process.exit(2); } }
  else if (a === '--exe') { try { o.exe = ix.normExe(args[++i]); } catch (e) { console.error(e.message); process.exit(2); } if (!o.exe) { console.error('entityindex: --exe needs a value (as64, mowas_2, mowas2, goh)'); process.exit(2); } }
  else if (a === '--force') o.force = true;
  else if (a === '--check') check = true;
  else if (a === '--stats') stats = true;
  else pos.push(a);
}
if (pos[0] && pos[0] !== '-') o.gameDir = pos.shift(); else pos.shift();
if (!o.gameDir && !o.folder) { console.error('usage: node entityindex.js <gameDir|-> [--mods a,b] [--folder dir] [--cache f] [--force] [--check] [--stats] [name...]'); process.exit(2); }
if (!o.cache) o.cache = path.join(__dirname, 'cache', (o.mods && o.mods.length ? 'mods-' + crypto.createHash('md5').update(o.mods.join(',')).digest('hex').slice(0, 8) : o.folder ? 'folder-' + crypto.createHash('md5').update(path.resolve(o.folder)).digest('hex').slice(0, 8) : 'vanilla') + '.json');

process.on('uncaughtException', e => { if (e.code !== 'MOD_NOT_MOUNTED') throw e; console.error(e.message); process.exit(3); });
if (check) {
  let idx;
  try { idx = ix.load(o.cache, o.exe, o.gameDir); } catch (e) { console.log('no cache: ' + ix.cachePath(o.cache, o.exe, o.gameDir)); process.exit(1); }
  const r = ix.staleness(ix.openSource(o), idx);
  for (const k of r.stale) console.log('stale: ' + k);
  for (const k of r.added) console.log('added: ' + k);
  for (const k of r.removed) console.log('removed: ' + k);
  const n = r.stale.length + r.added.length + r.removed.length;
  console.log(n ? `${n} stale` : 'up to date');
  process.exit(n ? 1 : 0);
}

const { idx, stats: st } = ix.build({ ...o });
console.log(`exe ${idx.meta.exe || '-'}: ${st.entities} entities, ${st.stuff} stuff, ${st.models} models; parsed ${st.parsed}, reused ${st.reused}, ${st.ms} ms -> ${ix.cachePath(o.cache, o.exe, o.gameDir)}`);
for (const n of pos) {
  const recs = idx.byName(n);
  if (!recs.length) console.log(`${n}: no such entity`);
  for (const r of recs) {
    console.log(`${r.key} [${r.source}/${r.layer}] model=${r.model || '-'}`);
    console.log('  inherits: ' + r.inherits.join(' '));
    console.log('  extenders: ' + r.extenders.join(' '));
    for (const f of r.refs) console.log(`  ${f[0]} "${f[1]}" @ ${f[2]}:${f[3]}`);
  }
}
if (stats) {
  const kinds = {};
  for (const r of Object.values(idx.entities)) for (const f of r.refs) kinds[f[0]] = (kinds[f[0]] || 0) + 1;
  console.log('ref kinds: ' + JSON.stringify(kinds));
}
