#!/usr/bin/env node
// mapscen: which entity defs a GoH map names, how many records, does as64 vanilla have them, what class (by GoH folder). Read-only.
//   node mapscen.js <map>[,<map>...] [--goh <GoH resource dir>] [--cache <entityindex cache json>] [--top 20,50,100] [--json] [--defs] [--no-index]
//        [--exe as64|mowas_2|mowas2] [--game <AS2 dir>]
//   map = dir name under map/multi/ (also tried: map/sp/, any map/*/<name>/). Records = {Entity "name" ...} blocks in the map's `map`, *.mi files.
//   as64 column: same = vanilla has an entity of that name; near:<name> = vanilla has a name that differs only by case/_/-/trailing digits (NOT proven to look alike [I]); no = neither.
//   needs the entityindex vanilla cache (default tools/entityindex/cache/vanilla.json); --no-index skips as64 lookup (all "?").
//   --goh default: <GoH install>/resource, the install from lib/games install('goh') (GOH_GAME, as2.json "goh", Steam).
//   --exe as64|mowas_2|mowas2: the AS2 game whose vanilla forms the column (entityindex cache per exe: ix.load(cache, exe) reads
//     <cache>.mowas_2.json for MoW:AS2; missing -> built once from --game <AS2 dir>, else the AS2 install from lib/games install, entityindex build exe; that folder goes to
//     ix.cachePath/load as well, so load checks the cache was built for it). none = as64
//     as before. MoW:AS2 output names the column "MoW:AS2" in the text (JSON field stays `as64`). --exe goh: refused (exit 2, one line):
//     GoH is the source side of this compare.
// Author: Imperator_Aug (ARSENAL, ia-89940e46)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');
const pakset = require('../lib/pakset'), games = require('../lib/games');

// the GoH resource folder, found when needed (no IO at require time)
const gohRes = () => { const d = games.install('goh').dir; return d ? path.join(d, 'resource') : null; };
const CLASSES = ['tree', 'bush', 'fence', 'road border', 'building', 'debris', 'trench', 'prop', 'ground stamp', 'service/fx', 'vehicle/gun', 'mine/item', 'other'];

// class of a GoH def by its folder path (entity/<...>/<name>.def, lowercase). First match wins; order matters.
const RULES = [
  ['trench', /trench|dugout|foxhole|bunker|sandbag|barricade|hedgehog|tank_trap|dragon|wire|barbed/],
  ['road border', /road|border|curb|rail|bridge|asphalt|path|track/],
  ['fence', /fence|wall|gate|hedge|palisade|paling/],
  ['tree', /tree|forest|pine|spruce|birch|oak|poplar|fir\b|log\b|stump/],
  ['bush', /bush|shrub|grass|flower|reed|plant|crop|field|corn|wheat|vegetation/],
  ['debris', /debris|ruin|crater|wreck|rubble|destroyed|junk|trash|burnt|broken|shell|gib/],
  ['building', /build|house|barn|church|factory|warehouse|shed|barrack|station|tower|hangar|shop|mill|garage|hut|cottage|ruins?\b|edifice|cabin/],
  ['prop', /prop|decor|barrel|box|crate|cart|lamp|pole|sign|stone|rock|bench|haystack|hay|well|pile|stack|furniture|pipe|tank\b|container|car\b|truck/],
];
// folder-prefix rules first: things that are not scenery props (ground decals, service points, fx, vehicles/guns, mines)
const PREFIX = [
  ['debris', /^entity\/landscape\/stamp[^/]*\/(_[a-z]+\/)?(destroy|cover)\//],
  ['ground stamp', /^entity\/landscape\//],
  ['service/fx', /^entity\/(service|sfx|fx)\//],
  ['vehicle/gun', /^entity\/-vehicle\//],
  ['mine/item', /^entity\/inventory\//],
];
function classOf(key) {
  const k = key.toLowerCase();
  for (const [c, re] of PREFIX) if (re.test(k)) return c;
  for (const [c, re] of RULES) if (re.test(k)) return c;
  return 'other';
}

function entityNames(text) {
  const out = new Map(), re = /\{\s*Entity\s+"([^"]+)"/gi;
  let m;
  while ((m = re.exec(text))) { const n = m[1].toLowerCase(); out.set(n, (out.get(n) || 0) + 1); }
  return out;
}

// map name -> {counts:Map name->records, files:[key]}
function readMap(entries, name) {
  const re = new RegExp('^map/[^/]+/' + name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/([^/]+)$');
  const counts = new Map(), files = [];
  for (const e of entries) {
    const m = re.exec(e.key);
    if (!m) continue;
    if (!(m[1] === 'map' || /\.mi$/.test(m[1]))) continue;
    files.push(e.key);
    for (const [n, c] of entityNames((e.buf || pakset.read(e)).toString('latin1'))) counts.set(n, (counts.get(n) || 0) + c);
  }
  return { counts, files };
}

// GoH def index: basename -> [key] over entity/**/*.def
function defIndex(entries) {
  const by = new Map();
  for (const e of entries) {
    if (!e.key.startsWith('entity/') || !e.key.endsWith('.def')) continue;
    const base = e.key.slice(e.key.lastIndexOf('/') + 1, -4);
    (by.get(base) || by.set(base, []).get(base)).push(e.key);
  }
  return by;
}

const strip = n => n.replace(/[_\-\s]+/g, '').replace(/\d+$/, '');
function vanillaLookup(idx) {
  if (!idx) return () => '?';
  const exact = new Set(), loose = new Map();
  for (const rec of Object.values(idx.entities)) {
    const n = rec.name.toLowerCase();
    exact.add(n);
    const s = strip(n);
    if (!loose.has(s)) loose.set(s, n);
  }
  return n => exact.has(n) ? 'same' : loose.has(strip(n)) ? 'near:' + loose.get(strip(n)) : 'no';
}

function analyse(mapNames, opts) {
  opts = opts || {};
  const entries = opts.entries || pakset.open(opts.goh || gohRes(), {}).entries;
  const defs = opts.defs || defIndex(entries);
  const has = opts.has || vanillaLookup(null);
  const maps = [], total = new Map();
  for (const mn of mapNames) {
    const r = readMap(entries, mn);
    maps.push({ map: mn, files: r.files, records: [...r.counts.values()].reduce((a, b) => a + b, 0), distinct: r.counts.size });
    for (const [n, c] of r.counts) total.set(n, (total.get(n) || 0) + c);
  }
  const rows = [];
  for (const [name, count] of total) {
    const keys = defs.get(name.split('#')[0]) || [];   // name#win = variant of name (22 records over 6 defs in the 7 maps [V])
    const key = keys[0] || null;
    rows.push({ name, count, def: key, ambiguous: keys.length > 1, cls: key ? classOf(key) : 'nodef', as64: has(name.split('#')[0]) });
  }
  rows.sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1));
  return { maps, rows };
}

function classTable(rows) {
  const t = {}, tot = rows.reduce((a, r) => a + r.count, 0);
  for (const r of rows) {
    const c = t[r.cls] || (t[r.cls] = { cls: r.cls, defs: 0, records: 0, same: 0, near: 0, no: 0, recSame: 0, recMissing: 0 });
    c.defs++; c.records += r.count;
    if (r.as64 === 'same') { c.same++; c.recSame += r.count; } else { c.recMissing += r.count; if (r.as64.startsWith('near')) c.near++; else c.no++; }
  }
  return { table: Object.values(t).sort((a, b) => b.records - a.records), total: tot };
}

// share of records covered by the N most frequent defs
function coverage(rows, ns) {
  const tot = rows.reduce((a, r) => a + r.count, 0), out = [];
  for (const n of ns) out.push({ n, share: tot ? rows.slice(0, n).reduce((a, r) => a + r.count, 0) / tot : 0 });
  return out;
}
const missingRows = rows => rows.filter(r => r.as64 !== 'same');

// the vanilla entity index of the chosen AS2 game. No --exe: the given cache as before. --exe: that exe's cache (ix.cachePath); a missing
// one is built once from the AS2 install (vanilla, no mods). ix: injectable (tests).
function vanillaIndex(o, ix = require('../entityindex/index')) {
  const cache = o.cache || path.join(__dirname, '../entityindex/cache/vanilla.json');
  if (!o.exe) return ix.load(cache);
  // the game folder (--game, else the AS2 install) passed to cachePath/load/build alike: in the shared cache folder a non-home folder gets
  // its own f<dirKey> file, and load checks the cache was built for that folder (meta.game)
  let dir = o.game; if (!dir) { try { dir = games.install(o.exe.id).dir || undefined; } catch (e) { dir = undefined; } }
  const exe = o.exe.exe, file = ix.cachePath(cache, exe, dir);
  if (!fs.existsSync(file)) {
    if (!dir) throw new Error(`no ${o.exe.name} vanilla index at ${file} and no AS2 install found: build it with entityindex --exe ${exe}`);
    console.error(`mapscen: building the ${o.exe.name} vanilla index (${file}), once`);
    ix.build({ gameDir: dir, mods: [], cache, exe });
  }
  return ix.load(cache, exe, dir);
}

function main(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--goh') o.goh = argv[++i]; else if (a === '--game') o.game = argv[++i]; else if (a === '--cache') o.cache = argv[++i]; else if (a === '--top') o.top = argv[++i];
    else if (a === '--json') o.json = true; else if (a === '--defs') o.defs = true; else if (a === '--no-index') o.noindex = true;
    else if (a === '--exe') { const g = games.get(argv[++i]); if (!g) { console.error('--exe must be one of as64|mowas_2|mowas2|goh'); return 2; } o.exe = g; }
    else o._.push(a);
  }
  if (!o._.length) { console.error('usage: mapscen.js <map>[,<map>...] [--goh dir] [--cache file] [--exe as64|mowas_2] [--game <AS2 dir>] [--top 20,50,100] [--json] [--defs] [--no-index]'); return 2; }
  if (o.exe && o.exe.kind === 'goh') { games.refuse('mapscen', 'goh', 'the vanilla column compares a GoH map against an AS2 game; GoH is the source side (--goh)', 'plan/reports/game-parity/t-maps.md:21'); return 2; }
  const names = o._.join(',').split(',').filter(Boolean);
  let has = null;
  if (!o.noindex) has = vanillaLookup(vanillaIndex(o));
  const res = analyse(names, { goh: o.goh, has: has || undefined });
  const gname = o.exe && o.exe.id !== 'as64' ? o.exe.name : 'as64';
  const ct = classTable(res.rows), ns = (o.top || '20,50,100').split(',').map(Number);
  const cov = coverage(res.rows, ns), miss = missingRows(res.rows), covMiss = coverage(miss, ns);
  if (o.json) { console.log(JSON.stringify({ maps: res.maps, classes: ct, coverage: cov, coverageMissing: covMiss, rows: res.rows }, null, 1)); return 0; }
  for (const m of res.maps) console.log(`map ${m.map}: ${m.records} records, ${m.distinct} defs  [${m.files.length ? m.files.map(f => f.split('/').pop()).join(' ') : 'NOT FOUND'}]`);
  const pad = (s, n) => String(s).padEnd(n);
  console.log('\n' + pad('class', 12) + pad('defs', 7) + pad('records', 9) + pad('same', 6) + pad('near', 6) + pad('no', 6) + 'rec missing');
  for (const c of ct.table) console.log(pad(c.cls, 12) + pad(c.defs, 7) + pad(c.records, 9) + pad(c.same, 6) + pad(c.near, 6) + pad(c.no, 6) + c.recMissing + ` (${(100 * c.recMissing / c.records).toFixed(0)}%)`);
  const recMiss = miss.reduce((a, r) => a + r.count, 0);
  console.log(`\ntotal ${ct.total} records, ${res.rows.length} defs; not "same" in ${gname}: ${recMiss} records (${(100 * recMiss / ct.total).toFixed(1)}%), ${miss.length} defs`);
  console.log('top-N defs cover (all defs): ' + cov.map(c => `${c.n}: ${(100 * c.share).toFixed(1)}%`).join('  '));
  console.log('top-N missing defs cover (of missing records): ' + covMiss.map(c => `${c.n}: ${(100 * c.share).toFixed(1)}%`).join('  '));
  if (o.defs) for (const r of res.rows) console.log(`${r.count}\t${r.name}\t${r.cls}\t${r.as64}\t${r.def || '-'}`);
  return 0;
}

module.exports = { entityNames, classOf, readMap, defIndex, vanillaLookup, vanillaIndex, analyse, classTable, coverage, missingRows, CLASSES, main };
if (require.main === module) process.exit(main(process.argv.slice(2)));
