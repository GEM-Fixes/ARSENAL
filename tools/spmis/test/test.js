// spmis tests: a stock-form fixture game (loose resource/ with one SP map, breeds, entity defs), every template generated on it,
// --check clean, round trip, and the seeded defects of truth.md each caught by its code. No game install is read.
// Author: Imperator_Aug (ARSENAL, ia-b7a96807)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const sdl = require('../../lib/sdl'), sdlwrite = require('../../lib/sdlwrite');
const spmis = require('../spmis');
const TOOL = path.join(__dirname, '..', 'spmis.js');
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'spmis-'));
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL ' + m); } };
const run = args => { const r = cp.spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
const w = (rel, text, root = G) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };

// ---- fixture game: stock-form SP map whose zones carry the names the templates use
const G = path.join(T, 'game');
const MAPDIR = 'resource/map/single/fx_camp/fx_map';
const zones = { flag_playerbase: [0, 4000], flag_a01: [-1000, 2000], flag_a02: [0, 2000], flag_a03: [1000, 2000],
  flag_b01: [-1000, 0], flag_b02: [0, 0], flag_b03: [1000, 0], flag_c02: [0, -2000] };
w(`${MAPDIR}/map`, '{map\r\n\t{Clips\r\n\t\t{"[auto]"\r\n\t\t\t{world -6000 -6000 6000 6000}\r\n\t\t}\r\n\t}\r\n\t{Entity "house" 0xd000\r\n\t\t{Position 10 10}\r\n\t}\r\n\t{Include "map/single/fx_camp/fx_map/extra"}\r\n}\r\n');
w(`${MAPDIR}/map.net`, Buffer.from([0x0a, 0x02, 0, 0, 1, 2, 3]));
w(`${MAPDIR}/map.ply`, Buffer.from('BPLY fixture bytes'));
w(`${MAPDIR}/mtl0.mtl`, '{material {layer bump {diffuse "a"}}}\r\n');
w(`${MAPDIR}/minimap.dds`, 'DDS ');
w(`${MAPDIR}/interface.set`, '{location\r\n\t{level 0}\r\n\t{level_set 1}\r\n}\r\n');
w(`${MAPDIR}/heroic_ai_range.mod`, 'x');
w(`${MAPDIR}/0.mi`, `{mission\r\n\t{Environment "skirmish/usa-omaha"}\r\n\t{Helpers\r\n${Object.entries(zones).map(([n, p]) =>
  `\t\t{zone "circle"\r\n\t\t\t{position ${p[0]} ${p[1]} 0}\r\n\t\t\t{Name "${n}"}\r\n\t\t\t{Radius 240}\r\n\t\t}\r\n`).join('')}\t\t{waypoints "player"\r\n\t\t\t{"0"\r\n\t\t\t\t{position 0 4200 0}\r\n\t\t\t}\r\n\t\t}\r\n\t}\r\n}\r\n`);
for (const b of ['mp/usa/squadleader2', 'mp/usa/rifle', 'mp/usa/mgun', 'mp/usa/bazooker', 'mp/usa/smg', 'mp/usa/tankman2', 'mp/ger/rifle', 'mp/ger/mgun', 'mp/ger/smg'])
  w(`resource/set/breed/${b}.set`, '{breed\r\n\t{nationality x}\r\n}\r\n');
w('resource/entity/-vehicle/tank_medium/m4a3e8/m4a3e8.def', '{game_entity}\r\n');
w('resource/entity/-vehicle/cannon/pak40/pak40.def', '{game_entity}\r\n');

const fixSpec = name => { const s = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'templates', name + '.json'), 'utf8')); s.map = 'map/single/fx_camp/fx_map'; return s; };
const specFile = (s, n) => { const f = path.join(T, n + '.json'); fs.writeFileSync(f, JSON.stringify(s)); return f; };
const tree = t => { const errs = []; const r = sdl.parseLines(t.split(/\r?\n/), (l, c, m) => errs.push(c + ' ' + m)); return { r, errs }; };
const shape = n => ({ n: n.name, v: n.vals.map(x => x.v), k: n.kids.map(shape) });

// ---- 1. each template generates, checks clean, round trips
const OUT = path.join(T, 'mod');
const tpls = spmis.templates().map(t => t.name);
ok(tpls.length >= 5 && ['assault', 'defence', 'breakthrough', 'destroy', 'escort'].every(x => tpls.includes(x)), 'five templates listed (escort too)');
for (const t of tpls) {
  const s = fixSpec(t);
  const g = run(['--game', G, '--spec', specFile(s, t), '--out', OUT, '-q']);
  ok(g.code === 0, `${t}: generate exit 0, got ${g.code}: ${g.out}`);
  const c = run(['--game', G, '--check', OUT, '--mission', s.name, '--no-milint', '-q']);
  ok(c.code === 0 && /^0 findings/m.test(c.out), `${t}: --check clean: ${c.out}`);
  const mi = path.join(OUT, 'resource/map/single', s.campaign, s.name, '0.mi');
  const buf = fs.readFileSync(mi);
  ok(sdlwrite.serialize(sdlwrite.parse(buf)).equals(buf), `${t}: sdlwrite round trip byte-equal`);
  const a = tree(buf.toString('latin1'));
  ok(!a.errs.length, `${t}: parse errors ${a.errs.join(';')}`);
  ok(!buf.toString('latin1').replace(/\r\n/g, '').includes('\n'), `${t}: CRLF only`);
  const rendered = a.r.kids.map(shape), again = tree(buf.toString('latin1').replace(/\r\n/g, '\n')).r.kids.map(shape);
  ok(JSON.stringify(rendered) === JSON.stringify(again), `${t}: parse(CRLF) equals parse(LF)`);
  const lng = fs.readFileSync(path.join(OUT, 'localization/mission/single', s.campaign, s.name + '.lng'), 'utf8');
  ok(/^\{tags\r\n/.test(lng) && /\{"name" "/.test(lng), `${t}: lng {tags} root with name`);
  ok(!/0xd000\b/.test(buf.toString('latin1')), `${t}: ids avoid the map's own 0xd000`);
  ok(!fs.existsSync(path.join(OUT, 'resource/map/single', s.campaign, s.name, 'heroic_ai_range.mod')), `${t}: .mod not copied`);
}
const mapCopy = fs.readFileSync(path.join(OUT, 'resource/map/single/spmis_examples/spmis_assault/map'), 'latin1');
ok(mapCopy.includes('map/single/spmis_examples/spmis_assault/extra') && !mapCopy.includes('fx_camp/fx_map'), 'map text: old dir path renamed');
ok(fs.readFileSync(path.join(OUT, 'resource/map/single/spmis_examples/spmis_assault/map.net')).equals(fs.readFileSync(path.join(G, MAPDIR, 'map.net'))), 'map.net byte-equal');
ok(fs.readFileSync(path.join(G, MAPDIR, 'map'), 'latin1').includes('fx_camp/fx_map'), 'source map untouched');
const miA = fs.readFileSync(path.join(OUT, 'resource/map/single/spmis_examples/spmis_assault/0.mi'), 'latin1');
ok(/\{"autoassign"/.test(miA) && /\{Player 2\}/.test(miA) && /\{Player 1\}/.test(miA) && /\{result win\}/.test(miA) && /\{result loose\}/.test(miA), 'assault: stock sides, autoassign, both ends');
ok(/"spmis:difficulty\/extra"[\s\S]*?\{level easy\}[\s\S]*?\{level normal\}/.test(miA), 'assault: difficulty group deleted below hard');
const miD = fs.readFileSync(path.join(OUT, 'resource/map/single/spmis_examples/spmis_defence/0.mi'), 'latin1');
ok(/waypoints "enemy:patrol"/.test(miD) && /\{transition "100"\}/.test(miD) && /\{"timer"/.test(miD) && /\{delay 480\}/.test(miD), 'defence: patrol loop, timer, timed event');
ok(/"hidden" "enemy" "spmis_wave1"/.test(miD) && /\{inactive off\}/.test(miD), 'defence: hidden wave brought in');

// ---- 2. seeded defects (truth.md), each a copy of a clean mission with one edit
const truth = fs.readFileSync(path.join(__dirname, 'truth.md'), 'utf8').split(/\r?\n/).filter(l => /^\| \w/.test(l) && !/^\| defect/.test(l));
const copyMod = n => { const d = path.join(T, 'seed_' + n); fs.cpSync(OUT, d, { recursive: true }); return d; };
const edit = (f, a, b) => { const t = fs.readFileSync(f, 'latin1'); if (!t.includes(a)) throw new Error(`seed text not found in ${f}: ${a}`); fs.writeFileSync(f, t.replace(a, b), 'latin1'); };
const seeds = {
  missing_text_key: d => { edit(path.join(d, 'localization/mission/single/spmis_examples/spmis_defence.lng'), '{"hold_crossroads" ', '{"other_key" '); return ['--check', d, '--mission', 'spmis_defence']; },
  objective_no_trigger: d => { edit(path.join(d, 'resource/map/single/spmis_examples/spmis_defence/0.mi'), '{state complete}', '{state hide}'); return ['--check', d, '--mission', 'spmis_defence']; },
  unit_def_missing: d => { edit(path.join(d, 'resource/map/single/spmis_examples/spmis_defence/0.mi'), 'Human "mp/usa/rifle"', 'Human "mp/usa/nosuch"'); return ['--check', d, '--mission', 'spmis_defence']; },
  no_lose: d => { edit(path.join(d, 'resource/map/single/spmis_examples/spmis_defence/0.mi'), '{result loose}', '{result win}'); return ['--check', d, '--mission', 'spmis_defence']; },
  win_unreachable: d => { const f = path.join(d, 'resource/map/single/spmis_examples/spmis_defence/0.mi'); edit(f, '{"spmis:win"', '{"spmis:winx"'); edit(f, '{event "start_won"}\r\n\t\t\t\t\t\t{mode set}', '{event "start_won"}\r\n\t\t\t\t\t\t{mode reset}'); return ['--check', d, '--mission', 'spmis_defence']; },
  undefined_zone: d => { edit(path.join(d, 'resource/map/single/spmis_examples/spmis_defence/0.mi'), '{zone "flag_a02"}', '{zone "flag_zz"}'); return ['--check', d, '--mission', 'spmis_defence']; },
  out_inside_install: () => { fs.writeFileSync(path.join(G, 'as64.exe'), ''); return ['--game', G, '--spec', specFile(fixSpec('assault'), 'in'), '--out', path.join(G, 'resource', 'x')]; },
  spec_def_unknown: () => { const s = fixSpec('assault'); s.player.units[0].def = 'mp/usa/ghost'; return ['--spec', specFile(s, 'ghost'), '--out', path.join(T, 'o2')]; },
  spec_point_unknown: () => { const s = fixSpec('assault'); s.objectives[0].zone = 'nowhere'; return ['--spec', specFile(s, 'pt'), '--out', path.join(T, 'o3')]; },
  spec_escort_vehicle: () => { const s = fixSpec('assault'); s.objectives = [{ type: 'escort', unit: 'tank1', to: 'flag_a02' }]; return ['--spec', specFile(s, 'esc'), '--out', path.join(T, 'o4')]; },
  spec_no_lose: () => { const s = fixSpec('assault'); s.lose = { allDead: false }; return ['--spec', specFile(s, 'nl'), '--out', path.join(T, 'o5')]; },
  goh_refused: () => ['--exe', 'goh', '--spec', specFile(fixSpec('assault'), 'goh'), '--out', path.join(T, 'o6')],
  exists_no_force: () => ['--spec', specFile(fixSpec('assault'), 'again'), '--out', OUT],
  remove_not_generated: () => { const d = path.join(T, 'hand'); w('resource/map/single/c1/hand_made/map', '{map}', d); return ['--remove', d, '--mission', 'hand_made']; },
};
const seen = new Set();
for (const line of truth) {
  const [, id, code, exit] = line.split('|').map(x => x.trim());
  const f = seeds[id];
  if (!f) { ok(false, `truth row ${id}: no seed`); continue; }
  seen.add(id);
  let args = f(id.startsWith('spec_') || ['out_inside_install', 'goh_refused', 'exists_no_force', 'remove_not_generated'].includes(id) ? null : copyMod(id));
  if (!args.includes('--game')) args = ['--game', G, ...args];
  if (args.includes('--check')) args.push('--no-milint');
  const r = run(args);
  ok(new RegExp('\\b' + code + '\\b').test(r.out), `${id}: want ${code}, got: ${r.out.trim().split('\n').slice(0, 3).join(' | ')}`);
  ok(String(r.code) === exit, `${id}: exit ${exit}, got ${r.code}`);
}
ok(seen.size === Object.keys(seeds).length, `every seed has a truth row (${seen.size}/${Object.keys(seeds).length})`);

// ---- 3. manifest: write two missions of one campaign into a mod, list them, reopen the spec, regenerate with --force,
// remove both: the mod is byte-identical to before (files and folders)
const snap = root => { const o = {}; (function wk(d, rel) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) { o[r + '/'] = ''; wk(path.join(d, e.name), r); } else o[r] = fs.readFileSync(path.join(d, e.name)).toString('base64'); } })(root, ''); return JSON.stringify(o); };
const RM = path.join(T, 'rm_mod');
w('mod.info', '{Mod\r\n\t{Name "rm"}\r\n}\r\n', RM); w('resource/set/keep.set', '{x}\r\n', RM); fs.mkdirSync(path.join(RM, 'resource', 'entity'), { recursive: true });
const before = snap(RM);
const g1 = run(['--game', G, '--spec', specFile(fixSpec('escort'), 'esc1'), '--out', RM]);
const s2 = fixSpec('destroy');
const g2 = run(['--game', G, '--spec', specFile(s2, 'des1'), '--out', RM, '-q']);
ok(g1.code === 0 && g2.code === 0 && !/SPMIS_NO_MODINFO/.test(g1.out), 'two missions written into a mod with mod.info ' + g1.out.slice(-300));
const lg = run(['--list-generated', RM]);
ok(/spmis_examples\/spmis_escort \|/.test(lg.out) && /spmis_examples\/spmis_destroy \|/.test(lg.out), 'list-generated names both ' + lg.out);
const man = spmis.readManifest(path.join(RM, 'resource/map/single/spmis_examples/spmis_escort'));
ok(man && man.spec && man.spec.name === 'spmis_escort' && man.created.includes('resource/map/single/spmis_examples/interface.set') && man.created.includes('resource/map/single/spmis_examples/spmis_escort/spmis.json'), 'manifest: spec and created files');
const re = run(['--game', G, '--spec', specFile(man.spec, 'esc2'), '--out', RM, '--force', '-q']);
ok(re.code === 0 && spmis.readManifest(path.join(RM, 'resource/map/single/spmis_examples/spmis_escort')).created.includes('resource/map/single/spmis_examples/interface.set'), 'regenerate from the saved spec with --force keeps the created list');
const ce = run(['--game', G, '--check', RM, '--mission', 'spmis_escort', '--no-milint', '-q']);
ok(ce.code === 0, 'escort mission checks clean ' + ce.out);
// goal markers: only the stock form, and only where the game has the entity; every {point name} in a task has its tagged pointer entity
{ const miE = fs.readFileSync(path.join(RM, 'resource/map/single/spmis_examples/spmis_escort/0.mi'), 'latin1');
  const hasDef = fs.existsSync(path.join(G, 'resource/entity/service/skirmish/skirmish_pointer/skirmish_pointer.def'));
  const ents = (miE.match(/{Entity "skirmish_pointer" 0x[0-9a-f]+/gi) || []).length, pts = [...miE.matchAll(/{point (spmis_pt_[a-z0-9_]+)}/gi)].map(m => m[1]);
  ok(ents === pts.length && pts.every(n => new RegExp('\\{Tags "pointer" "' + n + '" 0x[0-9a-f]+\\}', 'i').test(miE)) && (hasDef ? ents > 0 : ents === 0),
    'goal markers: each task point has its tagged skirmish_pointer; none when the game lacks the entity (def in the test game: ' + hasDef + ', markers: ' + ents + ')');
  if (!hasDef) { const pd = path.join(G, 'resource/entity/service/skirmish/skirmish_pointer'), RP = path.join(T, 'ptr_mod');
    fs.mkdirSync(pd, { recursive: true }); fs.writeFileSync(path.join(pd, 'skirmish_pointer.def'), '{game_entity}'+String.fromCharCode(13,10));
    const gp = run(['--game', G, '--spec', specFile(fixSpec('escort'), 'esc_ptr'), '--out', RP]);
    const f2 = path.join(RP, 'resource/map/single/spmis_examples/spmis_escort/0.mi'), mi2 = fs.existsSync(f2) ? fs.readFileSync(f2, 'latin1') : '';
    fs.rmSync(path.join(G, 'resource/entity/service'), { recursive: true, force: true });
    const e2 = [...mi2.matchAll(/{Entity "skirmish_pointer" (0x[0-9a-f]+)\s*\{Position [-\d.]+ [-\d.]+\}\s*\}/gi)].map(m => m[1]), p2 = [...mi2.matchAll(/{point (spmis_pt_[a-z0-9_]+)}/gi)].map(m => m[1]);
    ok(gp.code === 0 && e2.length > 0 && e2.length === p2.length && p2.every((n, i) => mi2.includes('{Tags "pointer" "' + n + '" ' + e2[i] + '}')),
      'goal markers with the entity in the game: Entity "skirmish_pointer" with a Position, tagged "pointer" + name, {point name} in the task ' + JSON.stringify([gp.code, e2, p2]) + gp.out.slice(0, 200)); } }
const r1 = run(['--remove', RM, '--mission', 'spmis_escort']);
ok(r1.code === 0 && /SPMIS_KEPT/.test(r1.out) && fs.existsSync(path.join(RM, 'resource/map/single/spmis_examples/interface.set')) && !fs.existsSync(path.join(RM, 'resource/map/single/spmis_examples/spmis_escort')), 'remove one: its folder gone, the campaign files kept for the other ' + r1.out);
const r2 = run(['--remove', RM, '--mission', 'spmis_destroy', '-q']);
ok(r2.code === 0 && snap(RM) === before, 'remove both: the mod is byte-identical to before');
const nm = path.join(T, 'nomodinfo'); const g3 = run(['--game', G, '--spec', specFile(fixSpec('escort'), 'esc3'), '--out', nm, '--dry-run']);
ok(/SPMIS_NO_MODINFO/.test(g3.out) && !fs.existsSync(nm), 'a folder with no mod.info: said (info), dry run writes nothing');

// ---- 4. dry run writes nothing
const dry = path.join(T, 'dry');
const d = run(['--game', G, '--spec', specFile(fixSpec('destroy'), 'dry'), '--out', dry, '--dry-run']);
ok(d.code === 0 && !fs.existsSync(dry) && /SPMIS_PLAN/.test(d.out), 'dry run: plan printed, nothing written');

// ---- 5. goal order: capture, then hold after it; the hold goal (text, sound, timer and its timed event) waits for the capture
{
  const s = fixSpec('assault'); s.name = 'chain'; s.campaign = 'chain_c';
  s.objectives = [{ id: 'take', type: 'capture', zone: 'flag_a02', text: 'Take it' }, { id: 'keep', type: 'hold', zone: 'flag_a02', minutes: 3, after: 'take', text: 'Hold it' }];
  s.reinforcements[0].after = 'keep';
  const CO = path.join(T, 'chain_mod');
  const g = run(['--game', G, '--spec', specFile(s, 'chain'), '--out', CO, '-q']);
  ok(g.code === 0, 'chain: generate exit 0 ' + g.out);
  const c = run(['--game', G, '--check', CO, '--mission', 'chain', '--no-milint', '-q']);
  ok(c.code === 0 && /^0 findings/m.test(c.out), 'chain: --check clean ' + c.out);
  const mi = fs.readFileSync(path.join(CO, 'resource/map/single/chain_c/chain/0.mi'), 'latin1');
  const want = ['\t\t\t{"mission:objectives/keep: show"', '\t\t\t\t{condition', '\t\t\t\t\t{terms', '\t\t\t\t\t\t{"1.task"', '\t\t\t\t\t\t\t{name "take"}', '\t\t\t\t\t\t}', '\t\t\t\t\t}', '\t\t\t\t}',
    '\t\t\t\t{actions', '\t\t\t\t\t{"delay"', '\t\t\t\t\t\t{time 3}', '\t\t\t\t\t}', '\t\t\t\t\t{"task"', '\t\t\t\t\t\t{name "keep"}', '\t\t\t\t\t}', '\t\t\t\t\t{"sound"', '\t\t\t\t\t\t{name "mission/task_new"}', '\t\t\t\t\t}',
    '\t\t\t\t\t{"timer"', '\t\t\t\t\t\t{time "180"}', '\t\t\t\t\t\t{title "$/keep"}', '\t\t\t\t\t}', '\t\t\t\t\t{"event"', '\t\t\t\t\t\t{event "keep_time"}', '\t\t\t\t\t\t{mode set}', '\t\t\t\t\t\t{delay 180}', '\t\t\t\t\t}', '\t\t\t\t}', '\t\t\t}'].join('\r\n');
  ok(mi.includes(want), 'chain: the hold goal\'s show trigger, exact text: waits for "take" completed, then shows, starts the timer and its 180 s event');
  const top = tree(mi).r.kids[0], trs = top.kids.find(n => n.name === 'Helpers').kids.find(n => n.name === 'triggers').kids;
  const byName = n => trs.find(t => t.name === n);
  const terms = t => t.kids.find(k => k.name === 'condition').kids.filter(k => k.name === 'terms').flatMap(k => k.kids);
  const showKeep = byName('mission:objectives/keep: show'), showTake = byName('mission:objectives/take: show');
  ok(showKeep && terms(showKeep).length === 1 && terms(showKeep)[0].name === '1.task' && terms(showKeep)[0].kids[0].vals[0].v === 'take', 'chain parse: keep is shown after take is completed');
  ok(showTake && terms(showTake).length === 1 && terms(showTake)[0].name === '1.event', 'chain parse: the first goal still starts with the mission');
  const timerIn = t => { let n = 0; (function wk(x) { for (const k of x.kids) { if (k.name === 'timer') n++; wk(k); } })(t); return n; };
  ok(timerIn(showKeep) === 1 && trs.filter(t => t !== showKeep && timerIn(t) && t.name.startsWith('mission:objectives/keep: show')).length === 0
    && !trs.some(t => terms(t).some(x => x.name.endsWith('.event') && (x.kids.find(k => k.name === 'id') || { vals: [{}] }).vals[0].v === 'start') && timerIn(t) && /keep/.test(t.name)), 'chain: the hold timer is started only by the goal\'s own show trigger');
  const rfT = byName('reinforcements:player/armor');
  ok(rfT && terms(rfT)[0].name === '1.task' && terms(rfT)[0].kids[0].vals[0].v === 'keep', 'chain: help after the second goal waits for it');
  const bad = JSON.parse(JSON.stringify(s)); bad.objectives[0].after = 'keep';
  const rb = run(['--game', G, '--spec', specFile(bad, 'chainbad'), '--out', path.join(T, 'o7'), '--dry-run']);
  ok(rb.code === 1 && /SPMIS_SPEC objective take: after "keep"/.test(rb.out), 'chain: a goal after a later goal is refused ' + rb.out);
  const dv = fixSpec('destroy'); dv.enemy.defenders[0].difficulty = 'hard';
  const rd = run(['--game', G, '--spec', specFile(dv, 'dv'), '--out', path.join(T, 'o8'), '--dry-run']);
  ok(rd.code === 1 && /SPMIS_SPEC objective kill_guns: target "atguns" is a vehicle group/.test(rd.out), 'a vehicle target left out on lower levels is refused ' + rd.out);
  const pr = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'proven.json'), 'utf8'));
  ok(typeof pr.inGame === 'boolean' && pr.kinds && pr.kinds.assault === true && pr.kinds.defence === true && pr.kinds.escort === false && Array.isArray(pr.untried) && pr.untried.includes('menu'),
    'proven.json: assault and defence tried in the game, the rest named as not yet tried');
  ok(Array.isArray(pr.tries) && pr.tries.length && pr.tries.every(t => /^\d{4}-\d\d-\d\d$/.test(t.date) && ['as64', 'mowas2'].includes(t.exe) && ['direct', 'menu'].includes(t.how) && Array.isArray(t.kinds))
    && Object.keys(pr.kinds).filter(k => pr.kinds[k]).every(k => pr.tries.some(t => t.kinds.includes(k))) && !pr.tries.some(t => t.how === 'menu' && pr.untried.includes('menu')),
    'proven.json: every try names its date, game build and how it was started; every tried kind has a try; menu untried means no menu try');
  // the start shared with an enemy group: said by the generator and by --check (SPMIS_START_ENEMY)
  const se = fixSpec('destroy'); se.name = 'startenemy'; se.enemy.defenders[0].at = se.player.start;
  ok(spmis.startShared(se).groups.includes(se.enemy.defenders[0].name) && !spmis.startShared(fixSpec('destroy')).groups.length, 'startShared: names the enemy group at the start, none on the template');
  const SO = path.join(T, 'o9');
  const sg = run(['--game', G, '--spec', specFile(se, 'startenemy'), '--out', SO]);
  ok(sg.code === 0 && /SPMIS_START_ENEMY player\.start/.test(sg.out), 'generate: a start shared with enemies is said ' + sg.out);
  const sc = run(['--game', G, '--check', SO, '--mission', 'startenemy', '--no-milint', '-q']);
  ok(/SPMIS_START_ENEMY .*your units begin among them/.test(sc.out) && /spmis\.json/.test(sc.out), '--check: the start shared with enemies is its own finding ' + sc.out);
  // voice files the game looks up for every mission (story, the start message key, both outros): a short silent wav each, so the log has
  // no "Media file .../story not found" or "unknown sound file .../start"; remove takes them away with the mission
  const sd = path.join(CO, 'sound/mission/single/chain_c/chain');
  const wavs = ['story', 'start', 'outro_completed', 'outro_failed'].map(k => path.join(sd, k + '.wav'));
  ok(wavs.every(f => fs.existsSync(f)), 'voices: story, start, outro_completed and outro_failed written under sound/<text path>');
  const w = fs.readFileSync(wavs[0]);
  ok(w.toString('ascii', 0, 4) === 'RIFF' && w.toString('ascii', 8, 12) === 'WAVE' && w.readUInt16LE(20) === 1 && w.readUInt32LE(40) === w.length - 44 && w.subarray(44).every(x => x === 0), 'voices: a PCM wav of silence');
  ok(/\{text "\$\/start"\}/.test(mi) && fs.existsSync(path.join(sd, 'start.wav')), 'voices: the start message key has its file');
  const man2 = spmis.readManifest(path.join(CO, 'resource/map/single/chain_c/chain'));
  ok(wavs.every((f, i) => man2.created.includes(`sound/mission/single/chain_c/chain/${['story', 'start', 'outro_completed', 'outro_failed'][i]}.wav`)), 'voices: in the manifest');
  const rv = run(['--remove', CO, '--mission', 'chain', '-q']);
  ok(rv.code === 0 && !fs.existsSync(path.join(CO, 'sound')), 'voices: remove takes the files and their folders ' + rv.out);
}

// ---- 9. where units can walk: the pather box of the map's default clip. Seeded: a map whose named places lie outside it
{
  const ED = 'resource/map/single/fx_camp/fx_edge', BOX = [-1500, -1500, 1500, 1500];
  const ez = { flag_playerbase: [0, -1300], flag_a02: [0, 800], flag_b02: [4000, 0], flag_out: [-3000, 2500] };
  const mapText = clip => '{map\r\n\t{Clips\r\n\t\t{"[auto]"\r\n\t\t\t{world -6000 -6000 6000 6000}\r\n' + clip + '\t\t}\r\n\t\t{"side"\r\n\t\t\t{world -6000 -6000 6000 6000}\r\n\t\t\t{pather -200 -200 200 200}\r\n\t\t}\r\n\t}\r\n}\r\n';
  const miText = '{mission\r\n\t{Helpers\r\n' + Object.entries(ez).map(([n, p]) => '\t\t{zone "circle"\r\n\t\t\t{position ' + p[0] + ' ' + p[1] + ' 0}\r\n\t\t\t{Name "' + n + '"}\r\n\t\t\t{Radius 240}\r\n\t\t}\r\n').join('') + '\t}\r\n}\r\n';
  for (const [dir, clip] of [[ED, '\t\t\t{camera -1700 -1700 1700 1700}\r\n\t\t\t{pather 1500 1500 -1500 -1500}\r\n'], ['resource/map/single/fx_camp/fx_blind', '']]) {
    w(dir + '/map', mapText(clip)); w(dir + '/map.net', Buffer.from([0x0a, 0x02, 0, 0, 1])); w(dir + '/map.ply', 'BPLY'); w(dir + '/0.mi', miText);
  }
  const a1 = spmis.areaOf(fs.readFileSync(path.join(G, ED, 'map'), 'latin1'), 'x'), a0 = spmis.areaOf(fs.readFileSync(path.join(G, 'resource/map/single/fx_camp/fx_blind/map'), 'latin1'), 'x');
  ok(JSON.stringify(a1.area) === JSON.stringify(BOX) && a1.clip === '[auto]' && a0.area === null && a0.why && spmis.areaOf('{map}', 'x').area === null, 'area: the pather box of the [auto] clip (corners in any order), none when the clip has no pather ' + JSON.stringify([a1, a0]));
  const s = fixSpec('assault'); s.map = 'map/single/fx_camp/fx_edge'; s.name = 'edge'; s.campaign = 'edge_c';
  s.enemy.patrols = [{ name: 'walk', def: 'mp/ger/rifle', count: 2, route: ['flag_a02', 'flag_out', [1490, 0]] }];
  s.objectives.push({ id: 'go_out', type: 'reach', at: 'flag_out', text: 'Go there', primary: false });
  const EO = path.join(T, 'edge_mod');
  const g = run(['--game', G, '--spec', specFile(s, 'edge'), '--out', EO]);
  ok(g.code === 0 && /SPMIS_MOVED "flag_b02" 4000,0 .*moved to 1400,0/.test(g.out) && /SPMIS_MOVED "flag_out" -3000,2500 .*moved to -1400,1400/.test(g.out) && /SPMIS_UNIT_MOVED \d+ units? moved/.test(g.out) && !/SPMIS_AREA_UNKNOWN/.test(g.out),
    'area: places outside the walkable box are moved to the nearest spot inside, said per place: ' + g.out.split('\n').filter(l => /MOVED|AREA|POINT/.test(l)).join(' | '));
  const miF = path.join(EO, 'resource/map/single/edge_c/edge/0.mi'), mi = fs.readFileSync(miF, 'latin1');
  const pos = [...mi.matchAll(/\{(Human|Entity) "([^"]+)" 0x[0-9a-f]+\r\n\t\t\{Position (-?[\d.]+) (-?[\d.]+)\}/g)].map(m => ({ kind: m[1], def: m[2], x: +m[3], y: +m[4] }));
  const inB = p => p.x >= BOX[0] && p.x <= BOX[2] && p.y >= BOX[1] && p.y <= BOX[3];
  ok(pos.length >= 25 && pos.every(inB), 'area: every unit and goal marker of the mission stands inside the box: ' + JSON.stringify(pos.filter(p => !inB(p))));
  const units = pos.filter(p => p.def !== 'skirmish_pointer');
  let near = null; for (let i = 0; i < units.length; i++) for (let j = 0; j < i; j++) { const d = Math.hypot(units[i].x - units[j].x, units[i].y - units[j].y), need = units[i].kind === 'Human' && units[j].kind === 'Human' ? 50 : 200; if (d < need - 0.01) near = [units[i], units[j], d]; }
  ok(!near, 'area: no unit on top of another, a vehicle keeps its room: ' + JSON.stringify(near));
  const wps = [...mi.matchAll(/\{"(\d+)"\r\n\t\t\t\t\{position (-?[\d.]+) (-?[\d.]+) 0\}/g)].map(m => ({ id: m[1], x: +m[2], y: +m[3] }));
  ok(wps.length >= 4 && wps.every(inB) && wps.some(p => p.x === 1400 && p.y === 0) && wps.some(p => p.x === -1400 && p.y === 1400), 'area: patrol and wave points inside the box, the typed spot at the edge pulled in by the margin: ' + JSON.stringify(wps));
  ok(/\{Name "spmis_go_out"\}/.test(mi) && /\{position -1400 1400 0\}\r\n\t\t\t\{Name "spmis_go_out"\}/.test(mi) && !/\{Name "flag_out"\}/.test(mi), 'area: a goal on a zone outside the box gets its own circle at the moved spot');
  const c = run(['--game', G, '--check', EO, '--mission', 'edge', '--no-milint']);
  ok(c.code === 0 && /^0 findings/m.test(c.out) && !/SPMIS_OUTSIDE|SPMIS_AREA_UNKNOWN/.test(c.out), 'area: the generated mission checks clean: ' + c.out);
  // typed numbers outside the world clip are refused as before
  const sx = JSON.parse(JSON.stringify(s)); sx.name = 'edge_x'; sx.enemy.defenders[0].at = [7000, 0];
  const gx = run(['--game', G, '--spec', specFile(sx, 'edge_x'), '--out', EO, '-q']);
  ok(gx.code === 1 && /SPMIS_POINT_OUTSIDE/.test(gx.out), 'area: a typed spot outside the world clip is refused: ' + gx.out);
  // seeded: a unit, a waypoint and a goal zone moved outside the box by hand: the check fails each
  const first = /\{Position (-?[\d.]+) (-?[\d.]+)\}/.exec(mi)[0];
  fs.writeFileSync(miF, mi.replace(first, '{Position 1500.5 0}'), 'latin1');
  const c1 = run(['--game', G, '--check', EO, '--mission', 'edge', '--no-milint', '-q']);
  ok(c1.code === 1 && (c1.out.match(/SPMIS_OUTSIDE/g) || []).length === 1 && /is outside the area where units can walk/.test(c1.out), 'seeded unit outside the walkable box: SPMIS_OUTSIDE, exit 1: ' + c1.out);
  fs.writeFileSync(miF, mi.replace('{position 1400 0 0}', '{position 2400 0 0}').replace('{position -1400 1400 0}\r\n\t\t\t{Name "spmis_go_out"}', '{position -1400 1600 0}\r\n\t\t\t{Name "spmis_go_out"}'), 'latin1');
  const c2 = run(['--game', G, '--check', EO, '--mission', 'edge', '--no-milint', '-q']);
  ok(c2.code === 1 && /waypoint "\d+" at 2400,0/.test(c2.out) && /goal zone "spmis_go_out" at -1400,1600/.test(c2.out), 'seeded waypoint and goal zone outside: SPMIS_OUTSIDE each: ' + c2.out);
  fs.writeFileSync(miF, mi, 'latin1');
  // a map whose walkable box cannot be read: positions as before, and a plain warning on generate and on check
  const sb = fixSpec('assault'); sb.map = 'map/single/fx_camp/fx_blind'; sb.name = 'blind'; sb.campaign = 'edge_c';
  const gb = run(['--game', G, '--spec', specFile(sb, 'blind'), '--out', EO]);
  const mb = fs.readFileSync(path.join(EO, 'resource/map/single/edge_c/blind/0.mi'), 'latin1');
  ok(gb.code === 0 && gb.out.includes('SPMIS_AREA_UNKNOWN ' + spmis.AREA_UNKNOWN) && !/SPMIS_MOVED/.test(gb.out) && /\{Position 3750 0\}/.test(mb) && /\{Name "flag_a02"\}/.test(mb),
    'area unknown: generated with the places as named, warning said: ' + gb.out.split('\n').filter(l => /AREA|MOVED/.test(l)).join(' | '));
  const cb = run(['--game', G, '--check', EO, '--mission', 'blind', '--no-milint']);
  ok(cb.code === 0 && cb.out.includes('SPMIS_AREA_UNKNOWN ' + spmis.AREA_UNKNOWN) && /^0 findings/m.test(cb.out), 'area unknown: the check says positions were not checked and does not fail: ' + cb.out);
  // the last gate before a write: no file outside the mod folder
  const rp = { infos: [], info(...a) { this.infos.push(a); }, add() {} };
  let ge = null; try { const P0 = spmis.generate({ game: G, out: path.join(T, 'gate_mod'), specObj: Object.assign(JSON.parse(JSON.stringify(sb)), { name: 'gate' }), dryRun: true }, rp); ok(P0.files.every(f => !f.rel.split('/').includes('..')), 'gate: planned files carry no ..'); } catch (e) { ge = e; }
  ok(!ge, 'gate: a normal plan passes ' + (ge && ge.message));
}

fs.rmSync(T, { recursive: true, force: true });
console.log(`${passes} passed, ${fails} failed`);
console.log(fails ? 'FAIL' : 'PASS');
process.exitCode = fails ? 1 : 0;
