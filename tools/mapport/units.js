#!/usr/bin/env node
// Author: Imperator_Aug (ARSENAL, ia-2c3feff4)
'use strict';
// mapport/units (DCGDEFS): the build plan for the defs a ported map names that the AS2 mod stack lacks. Before this, map fill runs
// ported scenery with goh2as2 --keys and left every entity/-vehicle def out (PORT-187: a raw GoH unit def stops the whole map load:
// "Wrong pather name" , or the AV on GoH stuff tags), so a map kept them as can't-spawn lines.
//   node tools/mapport/units.js (--log <game.log> | --map <resource root> <map name>) --goh <GoH dir> --game <AS2 dir> [--mods a,b] --out <dir> [--json]
//   names: --log = every `can't spawn entity <name>` line; --map = every {Entity "<name>"} of map/*/<name>/map and *.mi, minus the stack's defs.
// routes (one per name, first match wins):
//   NO_GOH    no GoH entity/**/<name>.def
//   SCENERY   GoH def not under entity/-vehicle/: goh2as2 --keys keys-scenery.txt --deps (the mapfill route)
//   DONOR     unit with a donorpick donor: units.json rows {rep, class, donor} for tools/unitmod (goh2as2 --donor --rep-key keeps the name)
//   RAW       unit with no donor (trains, wagons, static mounts) and no blocker: keys-raw.txt for goh2as2 --keys --deps, plus FORCE keys:
//             each "/properties/..." include AS2 lacks (and its {Sprite "x.ebm"}). Since GOHFIX goh2as2 itself renames subfolder PROP_NAMES includes
//             (selection/vehicle_elongated.inc -> selection/vehicle.inc), pulls props sprites and strips GoH Locomotion speed keys; forcing stays harmless.
//   BLOCKED   unit with no donor and a PatherId AS2 does not know (PATHER_UNKNOWN, PORT-187) or a {weapon} (GoH stuff tags, PORT-187)
// the AS2 pather set = every PatherId value in the stack's .def/.ext/.inc (as keylint KEY-22). Reads only; writes only --out.
//   node tools/mapport/units.js --fix-mod <built mod dir>   after the RAW build: strips GoH {Slow}{Normal}{Fast} from Locomotion (fatal in AS2)
//   --exe as64|mowas_2|mowas2 : the AS2 game whose stack the plan is made for (lib/vfs exe; also handed to donorpick --exe). none = as64
//     as before. mowas_2 on the shared install leaves as64/core and the Classic/Enhanced filter out [I].
//     With --exe and no --game the AS2 install comes from lib/games install. --exe goh: refused (exit 2): GoH is the port source (--goh).
const fs = require('fs'), path = require('path'), cp = require('child_process');
const games = require('../lib/games');

const INC_RE = /\(\s*include\s+"([^"]+)"/gi;
const lc = s => s.toLowerCase().replace(/\\/g, '/');
const stemOf = k => k.slice(k.lastIndexOf('/') + 1).replace(/\.def$/, '');

// pure: rows for names. env: { keyOf(name)->GoH key|null, read(key)->text|null, as2Has(key)->bool, pathers:Set, donorOf(name)->{donor,class}|null }
function route(names, env) {
  const rows = [];
  for (const name of names) {
    const key = env.keyOf(name);
    if (!key) { rows.push({ name, route: 'NO_GOH', why: 'no GoH def' }); continue; }
    if (!/^entity\/-vehicle\//.test(key)) { rows.push({ name, key, route: 'SCENERY' }); continue; }
    const d = env.donorOf(name);
    if (d && d.donor) { rows.push({ name, key, route: 'DONOR', donor: d.donor, class: d.class }); continue; }
    const text = env.read(key) || '', dir = key.slice(0, key.lastIndexOf('/'));
    // the def plus its relative includes (a unit's own .ext files carry PatherId and weapons too)
    let all = text; const seen = new Set([key]);
    const force = [];
    // a forced props file: also its {Sprite "x.ebm"} names, relative to its folder (goh2as2 --deps pulls its includes but warns
    // WARN_PORT_CLOSURE_MISSING "IN GoH, NOT PULLED" on these sprites [V dcgdefs raw build]); and the sprites' own includes, depth-limited
    const forceProp = (k, depth = 0) => {
      if (force.includes(k) || depth > 3) return; force.push(k);
      const t = env.read(k) || '', d0 = k.slice(0, k.lastIndexOf('/'));
      for (const m of t.matchAll(/\{\s*sprite\s+"([^"/$]+\.ebm)"/gi)) { const s = d0 + '/' + lc(m[1]); if (!env.as2Has(s) && env.read(s) != null) forceProp(s, depth + 1); }
      for (const m of t.matchAll(INC_RE)) { const r = lc(m[1]), s = r.startsWith('/') ? r.slice(1) : path.posix.normalize(d0 + '/' + r); if (/^properties\//.test(s) && !env.as2Has(s) && env.read(s) != null) forceProp(s, depth + 1); }
    };
    const walk = (t, d0, depth) => {
      for (const m of t.matchAll(INC_RE)) {
        const ref = lc(m[1]);
        const k = ref.startsWith('/') ? ref.slice(1) : path.posix.normalize(d0 + '/' + ref);
        if (seen.has(k)) continue; seen.add(k);
        if (/^properties\//.test(k)) { if (!env.as2Has(k) && env.read(k) != null) forceProp(k); continue; }   // shared props: goh2as2 decides, except the gap above
        const sub = env.read(k); if (sub == null || depth > 3) continue;
        all += '\n' + sub; walk(sub, k.slice(0, k.lastIndexOf('/')), depth + 1);
      }
    };
    walk(text, dir, 0);
    const why = [];
    for (const m of all.matchAll(/\{\s*patherid\s+"([^"]+)"/gi)) if (!env.pathers.has(m[1].toLowerCase())) why.push(`PATHER_UNKNOWN "${m[1]}"`);
    for (const m of all.matchAll(/\{\s*weapon\s+"([^"]+)"/gi)) why.push(`WEAPON "${m[1]}" (GoH stuff tag)`);
    if (why.length) rows.push({ name, key, route: 'BLOCKED', why: [...new Set(why)].join('; ') });
    else rows.push({ name, key, route: 'RAW', force });
  }
  return rows;
}

// GoH {Slow}{Normal}{Fast} inside a vehicle Locomotion block are fatal in AS2: shared helper, goh2as2 strips them at build too (GOHFIX)
const { stripGohLoco } = require('../goh2as2/loco');

// --fix-mod <mod dir>: stripGohLoco over the mod's resource/**/*.def|ext|inc, in place. Only for a mod folder this run built.
function fixMod(dir) {
  const res = fs.existsSync(path.join(dir, 'resource')) ? path.join(dir, 'resource') : dir, done = [];
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(def|ext|inc)$/i.test(e.name)) {
      const t = fs.readFileSync(p).toString('latin1'), r = stripGohLoco(t);
      if (r.n) { fs.writeFileSync(p, Buffer.from(r.text, 'latin1')); done.push(`${path.relative(res, p).replace(/\\/g, '/')} (${r.n})`); }
    } } };
  walk(res);
  return done;
}

function logNames(text) {
  const s = new Set();
  for (const m of text.matchAll(/can't spawn entity (\S+)/g)) s.add(m[1].toLowerCase());
  return [...s].sort();
}

function writePlan(rows, out) {
  fs.mkdirSync(out, { recursive: true });
  const w = (f, lines) => fs.writeFileSync(path.join(out, f), lines.join('\n') + (lines.length ? '\n' : ''));
  w('keys-scenery.txt', rows.filter(r => r.route === 'SCENERY').map(r => r.key));
  const raw = rows.filter(r => r.route === 'RAW');
  w('keys-raw.txt', [...new Set(raw.flatMap(r => [r.key, ...r.force]))]);
  fs.writeFileSync(path.join(out, 'units.json'), JSON.stringify(rows.filter(r => r.route === 'DONOR').map(r => ({ rep: r.name, class: r.class, donor: r.donor })), null, 1) + '\n');
  fs.writeFileSync(path.join(out, 'plan.json'), JSON.stringify(rows, null, 1) + '\n');
}

function summary(rows) {
  const c = {}; for (const r of rows) c[r.route] = (c[r.route] || 0) + 1;
  return `units: ${rows.length} names; ` + ['SCENERY', 'DONOR', 'RAW', 'BLOCKED', 'NO_GOH'].map(k => `${k} ${c[k] || 0}`).join(', ');
}

// the vfs exe of the AS2 target stack: --exe as64|mowas_2 (mowas2), none = 'as64' as before (byte-for-byte)
const targetExe = o => (o.exe ? o.exe.exe : 'as64');

// the donorpick argument list: --exe <vfs exe> only when --exe was given (donor pool of the same game); the AS64 argument list stays as it was
function donorArgs(o, unitNames) {
  const args = [path.join(__dirname, '..', 'donorpick', 'donorpick.js'), '--goh', o.goh, '--game', o.game, '--json', ...unitNames.flatMap(n => ['--entity', n])];
  if (o.exe) args.push('--exe', o.exe.exe);
  return args;
}

function main(argv) {
  const o = { mods: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--log') o.log = argv[++i]; else if (k === '--map') { o.root = argv[++i]; o.map = argv[++i]; }
    else if (k === '--goh') o.goh = argv[++i]; else if (k === '--game') o.game = argv[++i]; else if (k === '--mods') o.mods = argv[++i].split(',').filter(Boolean);
    else if (k === '--out') o.out = argv[++i]; else if (k === '--json') o.json = true;
    else if (k === '--fix-mod') o.fixMod = argv[++i];
    else if (k === '--exe') { const g = games.get(argv[++i]); if (!g) { console.error('--exe must be one of as64|mowas_2|mowas2|goh'); return 2; } o.exe = g; }
    else { console.error('unknown arg ' + k); return 2; }
  }
  if (o.fixMod) { const d = fixMod(o.fixMod); for (const l of d) console.log('LOCO_GOH stripped ' + l); console.log(`fix-mod: ${d.length} files`); return 0; }
  if (o.exe && o.exe.kind === 'goh') { games.refuse('mapport/units', 'goh', 'GoH is the source of the port (--goh); the target stack is AS64 or MoW:AS2', 'plan/reports/game-parity/t-maps.md:8'); return 2; }
  if (o.exe && !o.game) o.game = games.install(o.exe.id).dir || undefined;
  if ((!o.log && !o.map) || !o.goh || !o.game || !o.out) { console.error('usage: units.js (--log <game.log> | --map <root> <name>) --goh <GoH dir> --game <AS2 dir> [--mods a,b] [--exe as64|mowas_2] --out <dir> [--json]'); return 2; }
  const vfs = require('../lib/vfs');
  const vf = vfs.build({ gameDir: o.game, mods: o.mods, exe: targetExe(o) });
  const as2Keys = new Set(), as2Stems = new Set(), pathers = new Set();
  for (const [k, rec] of vf.files) {
    const kk = k.replace(/^resource\//, ''); as2Keys.add(kk);
    if (kk.endsWith('.def')) as2Stems.add(stemOf(kk));
    if (/^(entity|properties)\/.*\.(def|ext|inc)$/.test(kk)) {
      const t = vfs.readRec(rec).toString('latin1');
      for (const m of t.matchAll(/\{\s*patherid\s+"([^"]+)"/gi)) pathers.add(m[1].toLowerCase());
    }
  }
  let names;
  if (o.log) names = logNames(fs.readFileSync(o.log, 'latin1'));
  else {
    const ms = require('../mapscen/mapscen.js'), pakset = require('../lib/pakset');
    const ps = pakset.open(o.root, null), entries = ps.entries.map(e => ({ ...e, key: lc(e.key) }));
    names = [...ms.readMap(entries, o.map).counts.keys()].filter(n => !as2Stems.has(n)).sort();
  }
  names = names.filter(n => !as2Stems.has(n));
  // GoH index (the donorpick reader: loose files and paks)
  const goh = fs.existsSync(path.join(o.goh, 'resource')) ? path.join(o.goh, 'resource') : o.goh;
  const pakset = require('../lib/pakset'), ps = pakset.open(goh, null), gmap = new Map();
  for (const e of ps.entries) gmap.set(lc(e.key), e);
  const byStem = new Map();
  for (const k of gmap.keys()) if (k.startsWith('entity/') && k.endsWith('.def')) { const s = stemOf(k); if (!byStem.has(s)) byStem.set(s, []); byStem.get(s).push(k); }
  const read = k => { const e = gmap.get(k); if (!e) return null; let b = pakset.read(e); if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) b = b.subarray(3); return b.toString('latin1'); };
  const keyOf = n => { const h = byStem.get(n); return h ? h.sort()[0] : null; };
  // donors: one donorpick call for every unit name
  const unitNames = names.filter(n => { const k = keyOf(n); return k && /^entity\/-vehicle\//.test(k); });
  const donors = new Map();
  if (unitNames.length) {
    const args = donorArgs(o, unitNames);
    const r = cp.spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 64 << 20 });
    if (r.status !== 0) { console.error('donorpick failed: ' + (r.stderr || '').slice(0, 400)); return 1; }
    let js = JSON.parse(r.stdout); if (!Array.isArray(js)) js = [js];
    for (const d of js) donors.set(String(d.entity).toLowerCase(), d);
  }
  const rows = route(names, { keyOf, read, as2Has: k => as2Keys.has(k), pathers, donorOf: n => donors.get(n) || null });
  writePlan(rows, o.out);
  if (o.json) console.log(JSON.stringify(rows, null, 1));
  else for (const r of rows) console.log(`${r.route.padEnd(8)} ${r.name}${r.donor ? ' <- ' + r.donor : ''}${r.why ? ' : ' + r.why : ''}${r.force && r.force.length ? ' + force ' + r.force.join(' ') : ''}`);
  console.log(summary(rows) + `; plan in ${o.out}`);
  return 0;
}

module.exports = { route, logNames, writePlan, summary, stripGohLoco, fixMod, targetExe, donorArgs, main };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
