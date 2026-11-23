// armorsim ground (RULES.md rule 49): `ray.ground` = z of a flat ground plane; a downward shell ends on it and bursts there.
// Synthetic game tree (temp dir, or $ARMORSIM_SCRATCH / argv[2]); no game data. Also the CLI --ground flag and the GUI routes'
// `ground` body field (argv built through a stub runTool, nothing run).
//   node ground.test.js [scratchDir]      last line PASS on success
// Author: Imperator_Aug (ARSENAL, ia-c819267a)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const sim = require('../sim'), after = require('../after');

let n = 0, fails = 0;
function ok(name, cond, info) { n++; if (!cond) { fails++; console.log('FAIL ' + name + (info !== undefined ? ': ' + JSON.stringify(info) : '')); } }
const eq = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), { got, want });
const near3 = (a, b) => Array.isArray(a) && a.every((x, i) => Math.abs(x - b[i]) < 1e-6);

const base = process.argv[2] || process.env.ARMORSIM_SCRATCH || os.tmpdir();
fs.mkdirSync(base, { recursive: true });
const dir = fs.mkdtempSync(path.join(base, 'armorsim-ground-'));
const game = path.join(dir, 'game');
const W = (root, rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(text.replace(/\r?\n/g, '\r\n'), 'latin1')); };
W(game, 'mowas_2.exe', 'MZ');
W(game, 'resource/entity/vehicle/bx/bx.def', `{game_entity
	{props "steel tank"}
	{component "body"}
	{component "engine"}
	{component "skirts"}
	{component "ammo"}
	{volume "body" {thickness 30}}
	{volume "engine" {thickness 5}}
	{volume "skirtl" {thickness 5} {component "skirts"}}
	{volume "skirtr" {thickness 5} {component "skirts"}}
	{volume "ammo" {thickness 200}}
	{Extension "bx.mdl"}
}
`);
// body x -50..50, y -30..30, z 0..40; engine x -40..-20 inside; ammo x 15..25 inside; skirts y 32..36 and -36..-32
W(game, 'resource/entity/vehicle/bx/bx.mdl', `{Skeleton
	{bone "basis"
		{bone "body"}
	}
}
{Volume "body" {Box 100 60 40} {Bone "body"} {Position 0 0 20}}
{Volume "engine" {Box 20 40 20} {Bone "body"} {Position -30 0 20}}
{Volume "ammo" {Box 10 20 20} {Bone "body"} {Position 20 0 20}}
{Volume "skirtl" {Box 100 4 20} {Bone "body"} {Position 0 34 20}}
{Volume "skirtr" {Box 100 4 20} {Bone "body"} {Position 0 -34 20}}
`);
W(game, 'resource/set/material.set', `{materials
	{"steel"
		{ricochet {chance {0 0}}}
		{steelEquivalent 1}
		{durability {pierce 1} {blast 1}}
		{damage {radius 0.5}}
		{wound {calibre 20}}
	}
}
`);

const ctx = sim.open('bx', { game, mods: [] });
ok('open', !ctx.error, ctx.error);
if (ctx.error) { console.log('FAIL'); process.exit(1); }

const he = { weapon: 'test', ammo: 'he', calibre: 75, table: [[0, 10], [5000, 10]], tags: ['shell_medium', 'fg'], noRicochet: true,
  damage: [{ type: 'blastwave', energy: 2, area: [0.5, 4] }, { type: 'cumulative', distance: 1, damage: 50 }] };
const big = Object.assign({}, he, { table: [[0, 1000], [5000, 1000]] });

// ---------- groundHit ----------
eq('groundHit: down ray meets z = 0', sim.groundHit({ origin: [80, 0, 40], dir: [-20, 0, -40], ground: 0 }).point, [60, 0, 0]);
eq('groundHit: no ground / level ray / up ray / start below = null', [sim.groundHit({ origin: [0, 0, 40], dir: [0, 0, -1] }), sim.groundHit({ origin: [0, 0, 40], dir: [1, 0, 0], ground: 0 }),
  sim.groundHit({ origin: [0, 0, 40], dir: [0, 0, 1], ground: 0 }), sim.groundHit({ origin: [0, 0, -5], dir: [0, 0, -1], ground: 0 })], [null, null, null, null]);

// ---------- 1: HE into the ground beside the unit: end ground, the blast reaches the hull ----------
const beside = { origin: [80, 0, 40], dir: [-20, 0, -40], ground: 0 };   // lands at x 60, 10 units off the front face (x 50)
let st = after.newState(ctx);
let r = after.run(ctx, he, 100, beside, st, {});
eq('beside: end ground, no volume, at the ground point', [r.end.result, r.end.volume, r.end.point], ['ground', null, [60, 0, 0]]);
ok('beside: fg shell bursts at the ground point itself', near3(r.end.burst, [60, 0, 0]), r.end);
ok('beside: no plate, no shell event', !r.plates.length && !r.events.some(e => e.event === 'bullet_hit' && !e.blast && !e.jet), r);
ok('beside: the blast reaches the hull (10 units off: inside r0 0.5 m)', r.blast && r.blast.hits.some(h => h.volume === 'body' && h.energy === 2), r.blast);
ok('beside: blast events appended', r.events.some(e => e.event === 'blast_hit' && e.blast), r.events);
ok('beside: the jet goes into the ground at once, ends ground, meets nothing', r.jet && r.jet[0].end.result === 'ground' && !r.jet[0].plates.length, r.jet);
ok('beside: notes say ground', r.notes.some(x => /ground/.test(x)) && r.notes.some(x => /bursts at the ground/.test(x)), r.notes);
// a shell that may ricochet: bursts 0.3 units up the ground normal, the bounce taken as none (noted)
st = after.newState(ctx);
r = after.run(ctx, Object.assign({}, he, { tags: ['shell_medium'], noRicochet: false }), 100, beside, st, {});
ok('ricochet-able shell: burst 0.3 units above the ground point', r.end.result === 'ground' && near3(r.end.burst, [60, 0, 0.3]) && r.notes.some(x => /ricochet off the ground/.test(x)), r);
// AP with no filling: ends on the ground, nothing bursts
st = after.newState(ctx);
r = after.run(ctx, Object.assign({}, he, { damage: [] }), 100, beside, st, {});
ok('no filling: ground end, no blast, noted', r.end.result === 'ground' && r.blast === null && r.jet === null && r.notes.some(x => /no blastwave, jet or fire/.test(x)), r);
// sim.shoot
let s = sim.shoot(ctx, he, 100, beside);
eq('shoot beside: verdict / outcome ground, groundPoint, no plates', [s.verdict, s.outcome, s.groundPoint, s.plates.length, s.r], ['ground', 'ground', [60, 0, 0], 0, 'G']);

// ---------- 2: volume hits past the ground point are dropped ----------
const under = { origin: [120, 0, 40], dir: [-1, 0, -0.5] };          // meets the front face (x 50) at z 5
st = after.newState(ctx);
r = after.run(ctx, he, 100, under, st, {});
eq('no ground: hits the hull front low, fails', [r.end.result, r.end.volume], ['no_penetration', 'body']);
st = after.newState(ctx);
r = after.run(ctx, he, 100, Object.assign({ ground: 10 }, under), st, {});
ok('ground at z 10: reached at x 60 before the hull face, the hull hit is dropped', r.end.result === 'ground' && r.end.volume === null && near3(r.end.point, [60, 0, 10]) && !r.plates.length, r.end);
s = sim.shoot(ctx, he, 100, Object.assign({ ground: 10 }, under));
eq('shoot: the hull hit past the ground is dropped', [s.verdict, s.groundPoint, s.plates.length], ['ground', [60, 0, 10], 0]);
eq('shoot without ground: unchanged', sim.shoot(ctx, he, 100, under).verdict, 'no_penetration');

// ---------- 3: no ground = unchanged (also a level ray with a ground) ----------
const front = sim.rayFrom(ctx, 0, 0, [0, 0, 20]);
const strip = x => JSON.parse(JSON.stringify(x));
const a1 = strip(after.run(ctx, he, 100, front, after.newState(ctx), {}));
const a2 = strip(after.run(ctx, he, 100, Object.assign({ ground: 0 }, front), after.newState(ctx), {}));
const a3 = strip(after.run(ctx, he, 100, Object.assign({ ground: undefined }, front), after.newState(ctx), {}));
eq('level ray with a ground: same as no ground', a2, a1);
eq('ground undefined: same as no ground', a3, a1);
eq('shoot: level ray with a ground = no ground', strip(sim.shoot(ctx, he, 100, Object.assign({ ground: 0 }, front))), strip(sim.shoot(ctx, he, 100, front)));
const miss = { origin: [200, 200, 40], dir: [0, 0, -1] };
eq('a downward miss without ground stays no_hit', [after.run(ctx, he, 100, miss, after.newState(ctx), {}).end.result, sim.shoot(ctx, he, 100, miss).verdict], ['no_hit', 'no_hit']);

// ---------- 4: through the unit, then the ground ----------
const through = { origin: [100, 0, 60], dir: [-1, 0, -0.3], ground: 0 };   // body top at x 33.3, engine, body rear, ground at x -100
st = after.newState(ctx);
r = after.run(ctx, big, 100, through, st, {});
ok('through: plates met before the ground', r.plates.length >= 3 && r.plates.every(p => p.result === 'penetrate') && r.plates.some(p => p.volume === 'engine'), r.plates);
eq('through: ends on the ground behind the unit', [r.end.result, r.end.volume, r.end.point], ['ground', null, [-100, 0, 0]]);
ok('through: the burst behind reaches the hull from behind', r.blast && r.blast.hits.some(h => h.volume === 'body'), r.blast);
st = after.newState(ctx);
eq('through without ground: passed, no blast (as before)', (r = after.run(ctx, big, 100, { origin: through.origin, dir: through.dir }, st, {}), [r.end.result, r.blast]), ['passed', null]);
s = sim.shoot(ctx, big, 100, through);
eq('shoot through: first plate penetrate, outcome ground, groundPoint, plates kept', [s.verdict, s.outcome, s.groundPoint, s.plates.length >= 3], ['penetrate', 'ground', [-100, 0, 0], true]);
// a spent shell keeps spent; a HEAT shell past its reach keeps its result
st = after.newState(ctx);
r = after.run(ctx, Object.assign({}, he, { table: [[0, 0], [5000, 0]] }), 100, through, st, {});
eq('spent shell keeps spent, no blast', [r.end.result, r.blast], ['spent', null]);
st = after.newState(ctx);
r = after.run(ctx, Object.assign({}, big, { cumulative: 1 }), 100, through, st, {});
eq('HEAT reach over before the ground: beyond_jet kept', r.end.result, 'beyond_jet');
// skirts only (no hull) passed, reach over before the ground: today's 'passed', noted
st = after.newState(ctx);
// skirt entered at 0 (y 36, z 18), left at 8.2 units (bottom, y 34), ground at 18.6 units (y 31.5, short of the hull's y 30)
const skirt = { origin: [0, 50, 74], dir: [0, -1, -4], ground: 0 };
r = after.run(ctx, Object.assign({}, big, { cumulative: 0.5 }), 100, skirt, st, {});
ok('HEAT: passed the skirt, ground past the 10-unit reach: passed kept, no burst, noted', r.end.result === 'passed' && r.end.volume === 'skirtl' && r.blast === null && r.notes.some(x => /past the HEAT reach/.test(x)), r);
st = after.newState(ctx);
r = after.run(ctx, big, 100, skirt, st, {});
ok('no HEAT reach: the same ray ends on the ground and bursts', r.end.result === 'ground' && r.plates.every(p => p.volume === 'skirtl') && r.blast, r.end);

// ---------- effects: the ground end counted like any other ----------
const FX = require('../effects');
const E = FX.effects(ctx, he, 100, beside, { samples: 4, seed: 1, until: 5 });
eq('effects: ends ground with its chance', E.ends, [{ result: 'ground', volume: null, chance: 1 }]);
eq('effects: engine.end ground', [E.engine.end.result, E.engine.end.point], ['ground', [60, 0, 0]]);
ok('effects: the shell blast listed', E.blasts && E.blasts.some(b => b.source === 'shell' && b.hits.some(h => h.volume === 'body')), E.blasts);

// ---------- CLI --ground ----------
const CLI = path.join(__dirname, '..', 'armorsim.js');
const sh = JSON.stringify(he);
const cli = extra => cp.spawnSync(process.execPath, [CLI, 'shot', 'bx', '--shell', sh, '--range', '100', '--origin', '80,0,40', '--dir', '-20,0,-40', '--game', game, '--json'].concat(extra), { encoding: 'utf8' });
let c = cli(['--ground', '0']);
let J = null; try { J = JSON.parse(c.stdout); } catch (e) { /* below */ }
ok('CLI shot --ground: verdict ground, groundPoint, ray.ground', c.status === 0 && J && J.verdict === 'ground' && J.outcome === 'ground' && JSON.stringify(J.groundPoint) === '[60,0,0]' && J.ray.ground === 0, { status: c.status, out: c.stdout.slice(0, 300), err: c.stderr.slice(0, 300) });
c = cli([]); J = null; try { J = JSON.parse(c.stdout); } catch (e) { /* below */ }
ok('CLI shot without --ground: no_hit, no groundPoint, ray without ground', c.status === 0 && J && J.verdict === 'no_hit' && !('groundPoint' in J) && !('ground' in J.ray), c.stdout.slice(0, 300));
eq('CLI --ground bad value: usage exit 2', [cli(['--ground', 'abc']).status, cli(['--ground', '20000']).status], [2, 2]);
c = cp.spawnSync(process.execPath, [CLI, 'effects', 'bx', '--shell', sh, '--range', '100', '--origin', '80,0,40', '--dir', '-20,0,-40', '--ground', '0', '--samples', '2', '--game', game, '--json'], { encoding: 'utf8' });
J = null; try { J = JSON.parse(c.stdout); } catch (e) { /* below */ }
ok('CLI effects --ground: ends ground', c.status === 0 && J && J.ends[0].result === 'ground' && J.engine.end.result === 'ground', { status: c.status, err: c.stderr.slice(0, 300) });

// ---------- GUI routes: `ground` passed on as --ground, checked like the other numbers ----------
(async () => {
  const S = require('../../gui/ext/models/sub/armor.server');
  const calls = [];
  const rctx = { game: () => game, runTool: async (tool, entry, args) => { calls.push(args); return { code: 0, stdout: '{"unit":"bx"}', stderr: '' }; } };
  const call = (verb, body) => S.routes['POST /api/x/models/armor/' + verb]('/api/x/models/armor/' + verb, body, rctx);
  const b = { target: 'bx', weapon: 'test', range: 100, origin: '80,0,40', dir: '-20,0,-40' };
  await call('shot', Object.assign({ ground: 0 }, b));
  let a = calls[calls.length - 1], i = a.indexOf('--ground');
  ok('route shot: --ground 0 passed', i > 0 && a[i + 1] === '0', a);
  await call('shot', Object.assign({ ground: '-12.5' }, b));
  a = calls[calls.length - 1]; i = a.indexOf('--ground');
  ok('route shot: string number accepted', i > 0 && a[i + 1] === '-12.5', a);
  await call('shot', b);
  ok('route shot: no ground, no flag', !calls[calls.length - 1].includes('--ground'), calls[calls.length - 1]);
  await call('effects', Object.assign({ ground: 3 }, b));
  a = calls[calls.length - 1]; i = a.indexOf('--ground');
  ok('route effects: --ground passed', a[0] === 'effects' && i > 0 && a[i + 1] === '3', a);
  for (const g of [20000, 'x', '1e3']) {
    let err = null;
    try { await call('shot', Object.assign({ ground: g }, b)); } catch (e) { err = e; }
    ok('route shot: ground ' + g + ' refused 400', err && err.status === 400 && /ground/.test(err.message), err && err.message);
  }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* temp */ }
  console.log(fails ? 'FAIL ground (' + fails + ' of ' + n + ')' : 'PASS ground (' + n + ')');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL ground: ' + (e && e.stack || e)); process.exit(1); });
