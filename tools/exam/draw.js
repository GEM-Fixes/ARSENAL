#!/usr/bin/env node
// exam/draw: fresh exam draw. One rep per unit group, drawn at random (uniform over the eligible members, NOT sweep-pass-first), seeded
//   node tools/exam/draw.js --seed N --groups <groups json> [--per 1] [--rounds 4] [--eligible units.json|.txt] [--pairs-src file|dir]
//        [--control pair.json] [--per-game 7] [--insts 2,3] [--mods as64+,<mod>] [--secs 75] [--game G] [--root F:/as64-3] [--out dir] [--dry]
//   --groups: tools/unitgroups output ({groups:[{sig,kind,members:[{card}],rep}]}), or {"<group id>":[unit..]}, or [{g,units:[..]}]
//        unitgroups groups get the id g<NN>:<rep> in file order (as REPROOF-3 mkd.js named them)
//        or a .csv with group and unit columns (the voln sweep.csv the C39 sets drew from): rows with build other than "built" or a nameClash are left out
//   --per N: N distinct reps per group (fewer when the pool is smaller; pick rows say pool and drawn)
//   --eligible: units that may be drawn (built, no name clash ...): JSON array, {rep}/{u} rows, or one name per line; a group with none eligible goes to "none"
//   --pairs-src: edrun pair lists (a .json file or a dir of them, read recursively); a unit's pair = the first non-control pair whose shooter is the unit,
//        matched pairs are copied whole. Without one (or no match) a pair is made: class from the group kind (vehicle | gun | infantry), foe t34_0
//        (infantry: mp/ger/rifle), dist 300 (rules-count/EXAM.md: 300 map units = 15 m), made:true in the pair
//   --donors: build.json ({rows:[{rep,donor,status}]}) or [{rep,donor}]: <out>/units.json gets {rep, class, donor} per drawn unit, the tools/unitmod --list
//        shape (donor null when not known: unitmod then needs one, the summary counts them)
//   --control: the control pair (default ctlpz: pz6bh on t34_0, as every MB/C39 game); it is first in every game
//   --rounds R: R shuffles of the drawn pairs (the 4-run pass line needs 4); isolate pairs get a game alone, the rest fill games of --per-game (<= 7: 8 with the control)
//   --insts: run-list lines alternate --inst over these (default 2,3); --secs default 75 (exam cap)
//   --game: default the AS2 install found by tools/lib/gamedir (was a fixed path); --exe as64 (default) | mowas_2 | mowas2 | goh: game parity, the run list
//        serves as64_ed.exe only, so mowas2 (no control pipe, TST-19, ENG-19) and goh (editor -game never starts, in-play-nopipe.md:9) refuse, exit 2
// writes <out>/pick.json {seed, per, rounds, groups, pick:[{g, u, pool, drawn, pair, made}], none}, <out>/kill/r<R>-g<N>.json (edrun --pairs lists),
//   <out>/run-list.txt (one edrun command per game), <out>/list.txt (one pairs file per line, for the SPEED-B3 `edrun --list list.txt --insts 2,3`).
//   pick.json is the shape tools/score/classify.js reads (pick[].g, .u, .pair; found beside runs/). --dry: print the pick summary, write nothing. Same seed + same inputs = the same files.
// exit 0 ok, 2 usage, 3 input unreadable
// Author: Imperator_Aug (ARSENAL, ia-bba1e5a5)
require('../lib/help')(__filename);
const fs = require('fs'), path = require('path');

const CTL = { name: 'ctlpz', class: 'vehicle', shooter: 'pz6bh', crew: Array(5).fill('mp/ger/tankman'), foe: 't34_0', foeCrew: Array(4).fill('mp/rus/tankman'), control: true };
const CLASS = { vehicle: 'vehicle', gun: 'gun', infantry: 'infantry', human: 'infantry' };

// seeded LCG (same as reproof3/c39/mkd.js): rnd() in [0,1)
function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

// sweep csv (voln/result/sweep/sweep.csv: class,unit,group,build,...,nameClash): a row counts when build is "built" (or no build column)
//   and nameClash is empty, as REPROOF-3 mkd.js filtered; class gives the kind
function csvGroups(t) {
  const rows = t.trim().split(/\r?\n/), H = rows.shift().split(',').map(s => s.trim()), by = {};
  if (!H.includes('group') || !H.includes('unit')) throw new Error('csv needs group and unit columns');
  for (const r of rows) {
    const o = {}; r.split(',').forEach((v, i) => o[H[i]] = v.trim());
    if (('build' in o && o.build !== 'built') || o.nameClash) continue;
    (by[o.group] = by[o.group] || { g: o.group, kind: o.class || 'vehicle', units: [] }).units.push(o.unit);
  }
  return Object.keys(by).sort().map(g => ({ ...by[g], units: [...new Set(by[g].units)].sort() }));
}

// any groups shape -> [{g, kind, units:[sorted unique]}]
function normGroups(j) {
  const card = m => (typeof m === 'string' ? m : m && (m.card || m.unit || m.rep || m.u));
  const uniqSort = a => [...new Set(a.filter(Boolean))].sort();
  if (j && Array.isArray(j.groups)) {
    const w = String(j.groups.length).length < 2 ? 2 : String(j.groups.length).length;
    return j.groups.map((x, i) => ({ g: 'g' + String(i + 1).padStart(w, '0') + ':' + (x.rep || card((x.members || [])[0]) || '?'), kind: x.kind || 'vehicle', units: uniqSort((x.members || []).map(card)) }));
  }
  if (Array.isArray(j)) return j.map((x, i) => ({ g: x.g || x.id || x.group || 'g' + (i + 1), kind: x.kind || 'vehicle', units: uniqSort((x.units || x.members || []).map(card)) }));
  if (j && typeof j === 'object') return Object.keys(j).sort().map(g => ({ g, kind: 'vehicle', units: uniqSort((Array.isArray(j[g]) ? j[g] : (j[g].units || j[g].members || [])).map(card)) }));
  throw new Error('groups: unknown shape');
}

function readEligible(f) {
  const t = fs.readFileSync(f, 'utf8');
  try {
    const j = JSON.parse(t), a = Array.isArray(j) ? j : Object.values(j).flat();
    return new Set(a.map(x => (typeof x === 'string' ? x : x && (x.rep || x.u || x.unit))).filter(Boolean));
  } catch (e) { return new Set(t.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'))); }
}

function readPairs(p) {
  const out = [];
  const one = f => { try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); if (Array.isArray(j)) out.push(...j.filter(x => x && x.shooter)); } catch (e) { /* not a pair list */ } };
  const walk = d => { for (const n of fs.readdirSync(d).sort()) { const f = path.join(d, n); if (fs.statSync(f).isDirectory()) walk(f); else if (/\.json$/i.test(n)) one(f); } };
  if (fs.statSync(p).isDirectory()) walk(p); else one(p);
  return out;
}

// donor per unit from build.json ({rows:[{rep,donor,status?}]}), units.json ({units:[..]} or [{rep,donor}]); first donor wins, failed builds skipped
function readDonors(f) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8')), m = {};
  const rows = Array.isArray(j) ? j : (j.rows || j.units || Object.values(j).flat());
  for (const r of rows) if (r && r.rep && r.donor && !m[r.rep] && (!r.status || r.status === 'built')) m[r.rep] = r.donor;
  return m;
}

function safeName(u) { return String(u).toLowerCase().replace(/[^a-z0-9_]+/g, '_'); }

function makePair(u, kind) {
  const cls = CLASS[kind] || 'vehicle';
  if (cls === 'infantry') return { name: 'x_' + safeName(u), class: 'infantry', shooter: u, foe: 'mp/ger/rifle', dist: 300, made: true };
  return { name: 'x_' + safeName(u), class: cls, shooter: u, foe: 't34_0', foeCrew: Array(4).fill('mp/rus/tankman'), dist: 300, made: true };
}

// the draw: per group, uniform over the eligible sorted pool, `per` distinct units
function draw(groups, o) {
  const rnd = rng(o.seed), pick = [], none = [];
  const src = {}; for (const p of o.pairs || []) if (!p.control && !src[p.shooter]) src[p.shooter] = p;
  for (const G of groups) {
    const pool = G.units.filter(u => !o.eligible || o.eligible.has(u));
    if (!pool.length) { none.push(G.g); continue; }
    const left = pool.slice(), n = Math.min(o.per || 1, pool.length);
    for (let k = 0; k < n; k++) {
      const u = left.splice(Math.floor(rnd() * left.length), 1)[0];
      const p = src[u] ? { ...src[u] } : makePair(u, G.kind);
      pick.push({ g: G.g, u, kind: G.kind, pool: pool.length, drawn: n, pair: p.name, made: !src[u], p: { ...p, group: G.g } });
    }
  }
  return { pick, none, rnd };
}

// rounds of shuffled games: isolate pairs alone, the rest packed per game, control first in each
function games(pick, o, rnd) {
  const per = Math.max(1, Math.min(7, o.perGame || 7)), out = [];
  for (let r = 1; r <= (o.rounds || 4); r++) {
    const a = pick.map(x => x.p);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    const gs = [];
    for (const p of a.filter(p => p.isolate)) gs.push([p]);
    let cur = null;
    for (const p of a.filter(p => !p.isolate)) { if (!cur || cur.length >= per) gs.push(cur = []); cur.push(p); }
    gs.forEach((l, i) => out.push({ file: `r${r}-g${i + 1}`, pairs: [o.control || CTL, ...l] }));
  }
  return out;
}

function runList(gl, o) {
  const insts = o.insts || [2, 3];
  return gl.map((g, i) => `node tools/edrun/edrun.js --inst ${insts[i % insts.length]} --game "${o.game}" --root ${o.root} --exe as64_ed.exe --pairs ${o.out}/kill/${g.file}.json --mods ${o.mods} --speed very_fast --secs ${o.secs} --pipe "dbg_blast 1;dbg_health 1" --out ${o.out}/runs/${g.file}`);
}

// --exe: the game the draw is for. none / as64 / as64_ed.exe -> '' (draw); mowas2 or goh -> [game, why, row] (refuse); another *.exe -> '' (as64, edrun's rule); unknown word -> null
const GATE = {
  mowas2: ['the run list is edrun runs with --pipe "dbg_blast 1;dbg_health 1" (shots and health), which need the control pipe; mowas_2_ed.exe has no -control or -console', 'TST-19, ENG-19'],
  goh: ['the run list is edrun runs, and the GoH editor (call_to_arms_ed.exe -game) never starts the mission', 'modweb/testing/in-play-nopipe.md:9'],
};
function gateOf(exe) {
  const g = require('../edrun/mindist.js').gameOfExe(exe);
  if (!g) return null;
  return g === 'as64' ? '' : [g, ...GATE[g]];
}

function main(argv, opt = {}) {
  const o = { per: 1, rounds: 4, perGame: 7, secs: 75, mods: 'as64+,exam_t', root: 'F:/as64-3', out: '../run/EXAM-N' };
  let gf, ef, pf, cf;
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = () => argv[++i];
    if (k === '--seed') o.seed = +v(); else if (k === '--groups') gf = v(); else if (k === '--per') o.per = +v();
    else if (k === '--rounds') o.rounds = +v(); else if (k === '--eligible') ef = v(); else if (k === '--pairs-src') pf = v();
    else if (k === '--donors') o.donorsFile = v(); else if (k === '--control') cf = v(); else if (k === '--per-game') o.perGame = +v(); else if (k === '--insts') o.insts = v().split(',').map(Number);
    else if (k === '--mods') o.mods = v(); else if (k === '--secs') o.secs = +v(); else if (k === '--game') o.game = v();
    else if (k === '--root') o.root = v(); else if (k === '--out') o.out = v().replace(/\\/g, '/').replace(/\/$/, ''); else if (k === '--dry') o.dry = true;
    else if (k === '--exe') o.exe = v();
    else { console.error('unknown arg ' + k); return 2; }
  }
  // game parity: the run list serves only as64_ed.exe; MoW:AS2 and GoH refuse at the start (exit 2, one line with its row)
  const why = gateOf(o.exe);
  if (why === null) { console.error('exam draw: unknown --exe ' + o.exe + ' (as64, mowas_2, mowas2, goh or an exe file name)'); return 2; }
  if (why) { (opt.refuse || require('../lib/games').refuse)('exam draw', why[0], why[1], why[2]); return 2; }
  // the install comes from tools/lib/gamedir (as2.json, AS2_GAME, Steam), never a path written here; --game wins
  if (!o.game) { const d = require('../lib/gamedir').resolve().dir; o.game = d ? d.replace(/\\/g, '/') : '<game dir>'; }
  if (!Number.isInteger(o.seed) || !gf || !(o.per >= 1) || !(o.rounds >= 1)) { console.error('usage: --seed N (integer) --groups file required; --per, --rounds >= 1'); return 2; }
  let groups;
  try {
    const gt = fs.readFileSync(gf, 'utf8');
    groups = /\.csv$/i.test(gf) ? csvGroups(gt) : normGroups(JSON.parse(gt));
    if (ef) o.eligible = readEligible(ef);
    if (pf) o.pairs = readPairs(pf);
    o.donors = o.donorsFile ? readDonors(o.donorsFile) : {};
    if (cf) { const c = JSON.parse(fs.readFileSync(cf, 'utf8')); o.control = { ...(Array.isArray(c) ? c[0] : c), control: true }; }
  } catch (e) { console.error('input: ' + e.message); return 3; }
  const d = draw(groups, o), gl = games(d.pick, o, d.rnd), list = runList(gl, o);
  console.log(`groups ${groups.length} drawn ${d.pick.length} (per ${o.per}) none ${d.none.length}${d.none.length ? ' ' + d.none.slice(0, 12).join(' ') + (d.none.length > 12 ? ' ...' : '') : ''} made-pairs ${d.pick.filter(x => x.made).length}${o.donorsFile ? ' no-donor ' + d.pick.filter(x => !o.donors[x.u]).length : ''} games ${gl.length} (${o.rounds} rounds)`);
  if (o.dry) return 0;
  fs.mkdirSync(path.join(o.out, 'kill'), { recursive: true });
  for (const g of gl) fs.writeFileSync(path.join(o.out, 'kill', g.file + '.json'), JSON.stringify(g.pairs, null, 1) + '\n');
  fs.writeFileSync(path.join(o.out, 'run-list.txt'), list.join('\n') + '\n');
  fs.writeFileSync(path.join(o.out, 'list.txt'), gl.map(g => `${o.out}/kill/${g.file}.json`).join('\n') + '\n');
  fs.writeFileSync(path.join(o.out, 'units.json'), JSON.stringify(d.pick.map(x => ({ rep: x.u, class: CLASS[x.kind] || 'vehicle', donor: o.donors[x.u] || null })), null, 1) + '\n');
  fs.writeFileSync(path.join(o.out, 'pick.json'), JSON.stringify({ seed: o.seed, per: o.per, rounds: o.rounds, groups: groups.length, pick: d.pick.map(({ p, ...x }) => x), none: d.none }, null, 1) + '\n');
  return 0;
}

module.exports = { gateOf, rng, csvGroups, normGroups, readDonors, draw, games, runList, makePair, readEligible, readPairs, main };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
