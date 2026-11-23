// armorsim after / effects / origin + tools/iasim on a synthetic game + mod tree (built here in a temp dir; no game data).
//   node after.test.js [scratchDir]      last line PASS on success
// Author: Imperator_Aug (ARSENAL, ia-5835e633)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const sim = require('../sim'), after = require('../after'), fx = require('../effects'), origin = require('../origin'), ad = require('../armordata');
const iasim = require('../../iasim/iasim');

let n = 0, fails = 0;
function ok(name, cond, info) { n++; if (!cond) { fails++; console.log('FAIL ' + name + (info !== undefined ? ': ' + JSON.stringify(info) : '')); } }
const eq = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

const base = process.argv[2] || process.env.ARMORSIM_SCRATCH || os.tmpdir();
fs.mkdirSync(base, { recursive: true });
const dir = fs.mkdtempSync(path.join(base, 'armorsim-after-'));
const game = path.join(dir, 'game'), mod = path.join(dir, 'mod');
const W = (root, rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(text.replace(/\r?\n/g, '\r\n'), 'latin1')); };
W(game, 'mowas_2.exe', 'MZ');
const DEF = `{game_entity
	{props "steel tank"}
	{component "body" {tags "hull"}}
	{component "engine" {repair_time 20}}
	{component "turret"}
	{volume "body" {thickness 30}}
	{volume "engine" {thickness 5}}
	{volume "motor2" {thickness 5} {component "engine"}}
	{volume "turret" {thickness 40}}
	{Extension "tk.mdl"}
}
`;
W(game, 'resource/entity/vehicle/tk/tk.def', DEF);
// hull x -50..50, y -30..30, z 0..40; engine inside it x -40..-20; turret on top
W(game, 'resource/entity/vehicle/tk/tk.mdl', `{Skeleton
	{bone "basis"
		{bone "body"
			{bone "turret"
				{Position 0 0 40}
			}
		}
	}
}
{Volume "body"
	{Box 100 60 40}
	{Bone "body"}
	{Position 0 0 20}
}
{Volume "engine"
	{Box 20 40 20}
	{Bone "body"}
	{Position -30 0 20}
}
{Volume "turret"
	{Box 40 40 20}
	{Bone "turret"}
	{Position 0 0 10}
}
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
W(game, 'resource/set/interaction_entity/entity.set', `{entities
	{"tank"
		{on pierce
			{if volume "engine"
				{components "engine" break}
				{chassis_work 0}
				{call "fire_start"}
			}
			{if volume "body"
				{if stuff "shell_medium"
					{if rand 0.5 {kill_crew "driver"}}
				}
			}
		}
		{on break
			{if component "engine" {set "engine_dead" 1}}
			{if component "hull" {tags add "hull_broken"}}
		}
		{on "fire_start"
			{delay 3 1
				{burn volume "engine"}
				{tags add "destroyed"}
			}
		}
		(include "tank/extra.inc")
	}
	{"tank steel"
		{on pierce overload
			{inherited}
			{weird_action 1}
			{if weird_condition {set "never"}}
		}
	}
	{"human"
		{on pierce {tags add "wrong_block"}}
	}
}
`);
W(game, 'resource/set/interaction_entity/tank/extra.inc', `{on bullet_hit
	{tags add "was_hit"}
}
`);
W(mod, 'resource/set/interaction_entity/tank/extra.inc', `{on bullet_hit
	{tags add "mod_hit"}
	{if hit_side front {set "front_hit"}}
	{if hit_side back {set "back_hit"}}
}
`);

const shell = (mm, tags) => ({ weapon: 'test', ammo: 'testshell', calibre: 75, table: [[0, mm], [5000, mm]], tags: tags || ['shell_medium', 'ap'] });
const ctx = sim.open('tk', { game, mods: [] });
ok('open', !ctx.error, ctx.error);
if (ctx.error) { console.log('FAIL'); process.exit(1); }
eq('def parts', ctx.armor.parts.map(p => p.name + ':' + p.tags.join('+') + ':' + p.repairTime), ['body:body+hull:0', 'engine:engine:20', 'turret:turret:0']);
ok('def tags', ctx.armor.tags.includes('tank') && ctx.armor.tags.includes('steel'), ctx.armor.tags);
eq('material wounds + radius (units)', [ctx.materials.steel.wounds, ctx.materials.steel.damageRadius], [1, 10]);
const front = sim.rayFrom(ctx, 0, 0, sim.aimVolume(ctx, 'body'));

// ---------- engine stage alone ----------
let st = after.newState(ctx);
eq('volume -> part by component', [after.partOf(ctx, st, 'motor2').name, after.partOf(ctx, st, 'body').name, after.partOf(ctx, st, 'nope')], ['engine', 'body', null]);
let seen = [];
let r = after.run(ctx, shell(100), 100, front, st, { fire: (ev, c) => seen.push(ev + ':' + (c.part || '-') + ':' + (c.sender || '-')) });
eq('engine events in order', r.events.map(e => e.event + ' ' + e.volume), ['bullet_hit body', 'pierce body', 'break_armor body', 'part broken body', 'pierce engine', 'break_armor engine', 'part broken engine']);
eq('hook calls: break follows the part change, sender pierce on break_armor', seen, ['bullet_hit:body:-', 'pierce:body:-', 'break_armor:body:pierce', 'break:body:pierce', 'pierce:engine:-', 'break_armor:engine:pierce', 'break:engine:pierce']);
eq('parts after', [...st.parts.values()].map(p => p.name + p.damage), ['body1', 'engine1', 'turret0']);
ok('shell passed on', r.end.result === 'passed' && r.end.energyLeft < 1, r.end);
ok('bullet_hit value is the side index (front 0)', r.events[0].value === 0, r.events[0]);

// wounds carried from shot to shot (rule 29): 25 mm against 30 mm fails, wounds half; the second shot at the same spot breaks
st = after.newState(ctx);
r = after.run(ctx, shell(25), 100, front, st, {});
eq('first weak shot: no break', [r.plates[0].result !== 'penetrate', r.plates[0].broken, st.wounds.length, st.wounds[0].damage], [true, false, 1, 0.5]);
r = after.run(ctx, shell(25), 100, front, st, {});
ok('second weak shot at the same spot breaks the area', r.plates[0].broken && r.plates[0].integrity === 0.5 && r.events.some(e => e.event === 'break_armor'), r);
eq('body broken by wear', st.parts.get('body').damage, 1);
r = after.run(ctx, shell(25), 100, front, st, {});
ok('third: break_armor_again (part already damaged), no second part change', r.events.some(e => e.event === 'break_armor_again') && !r.events.some(e => e.event === 'part broken'), r.events);
// a far spot has its own integrity
st = after.newState(ctx);
after.run(ctx, shell(25), 100, front, st, {});
const side = sim.rayFrom(ctx, 90, 0, sim.aimVolume(ctx, 'body'));
r = after.run(ctx, shell(25), 100, side, st, {});
eq('another spot starts whole', r.plates[0].integrity, 1);
// setDamage: destroyed from working passes through broken (rule 31)
st = after.newState(ctx); seen = [];
after.setDamage(st, st.parts.get('turret'), 2, {}, ev => seen.push(ev));
eq('destroy from working fires break twice', seen, ['break', 'break']);
after.setDamage(st, st.parts.get('turret'), 0, {}, ev => seen.push(ev));
eq('repair fires repair', seen[2], 'repair');

// ---------- scripts ----------
const lib = iasim.load(ctx.src, {});
eq('blocks read', lib.blocks.map(b => b.tags.join(' ')), ['tank', 'tank steel', 'human']);
const ent = iasim.entity(lib, { tags: ctx.armor.tags, name: 'tk' });
eq('blocks of the unit: every tag among the def tags', ent.levels.map(b => b.tags.join(' ')), ['tank', 'tank steel']);
ok('include read into the block', lib.blocks[0].on.has('bullet_hit'));

let E = fx.effects(ctx, shell(100), 100, front, { samples: 400, seed: 7 });
const fact = (R, f) => (R.facts.find(x => x.fact === f) || { chance: 0 });
eq('engine broken, cannot move: certain', [fact(E, 'part:engine broken').chance, fact(E, 'cannot move').chance, fact(E, 'part:body broken').chance], [1, 1, 1]);
ok('driver killed about half the time (rand 0.5)', fact(E, 'crew:driver dead').chance > 0.4 && fact(E, 'crew:driver dead').chance < 0.6, fact(E, 'crew:driver dead'));
ok('burns after the delay 3 +- 1', fact(E, 'burns').chance === 1 && fact(E, 'burns').at && fact(E, 'burns').at.first >= 2 && fact(E, 'burns').at.median <= 4, fact(E, 'burns'));
eq('whole tank', E.whole.filter(w => w.chance === 1).map(w => w.key), ['cannot move', 'burns', 'out of action']);
ok('same seed, same numbers', JSON.stringify(fx.effects(ctx, shell(100), 100, front, { samples: 400, seed: 7 }).facts) === JSON.stringify(E.facts));
eq('words without a rule are reported, not guessed', E.notFollowed.map(u => u.kind + ' ' + u.name).sort(), ['action weird_action', 'condition weird_condition']);
ok('unknown condition is false', !E.next.flags.has('never'));
ok('overload ran the lower level through {inherited}', E.next.flags.has('engine_dead') && E.next.tags.has('hull_broken'));
ok('the human block did not run', !E.next.tags.has('wrong_block'));
ok('vanilla include ran', E.next.tags.has('was_hit') && !E.next.tags.has('mod_hit'));
ok('handlers carry file, line and origin vanilla', E.scripts.handlers.length >= 4 && E.scripts.handlers.every(h => h.from === 'vanilla' && h.line > 0), E.scripts.handlers);
eq('def origin', E.sources.def.from, 'vanilla');
// other shell class: the stuff row does not match
E = fx.effects(ctx, shell(100, ['shell_small']), 100, front, { samples: 200, seed: 7 });
eq('shell class picks the row', fact(E, 'crew:driver dead').chance, 0);
// a shot that fails: only bullet_hit runs
E = fx.effects(ctx, shell(10), 100, front, { samples: 50 });
eq('failed shot: nothing behind', [E.engine.events.map(e => e.event), E.whole.filter(w => w.chance > 0).length, E.next.tags.has('was_hit')], [['bullet_hit'], 0, true]);
// carry state: the second shot starts from the first one's
E = fx.effects(ctx, shell(100), 100, front, { samples: 20, seed: 3 });
const E2 = fx.effects(ctx, shell(100), 100, front, { samples: 20, seed: 3, state: E.next });
ok('second shot on the broken tank: break_armor_again', E2.engine.events.some(e => e.event === 'break_armor_again'), E2.engine.events);

// ---------- mod first, vanilla as fallback ----------
const cm = sim.open('tk', { game, mods: [], folder: mod });
ok('open with mod folder', !cm.error, cm.error);
E = fx.effects(cm, shell(100), 100, front, { samples: 50, seed: 1 });
ok('the mod include wins, the vanilla copy is not read', E.next.tags.has('mod_hit') && !E.next.tags.has('was_hit'));
ok('hit_side by the face side of the bullet', E.next.flags.has('front_hit') && !E.next.flags.has('back_hit'));
const froms = {}; for (const h of E.scripts.handlers) froms[h.event] = h.from;
eq('origins per handler: mod include, vanilla entity.set', [froms.bullet_hit, froms.pierce, froms.break], ['mod', 'vanilla', 'vanilla']);
ok('files list names both origins', E.scripts.files.some(f => f.from === 'mod') && E.scripts.files.some(f => f.from === 'vanilla'), E.scripts.files);
// layer + rel = the exact file read (the page's Open): the mod folder for the mod include, the game's resource dir for vanilla
{
  const fw = p => path.resolve(p).replace(/\\/g, '/');
  const hm = E.scripts.handlers.find(h => h.from === 'mod'), hv = E.scripts.handlers.find(h => h.from === 'vanilla');
  ok('handler of the mod include: layer = the mod folder, rel inside it', hm && hm.layer === fw(mod) && fs.existsSync(path.join(hm.layer, hm.rel)) && /\.inc$/.test(hm.rel), hm);
  ok('vanilla handler: layer under the game, file there', hv && hv.layer.startsWith(fw(game)) && fs.existsSync(path.join(hv.layer, hv.rel)), hv);
  ok('every from object carries layer and rel', E.scripts.files.concat(E.scripts.handlers, E.groups.map(g => g.cause).filter(c => c.file), E.causes.map(c => c.cause).filter(c => c.file)).every(x => 'layer' in x && 'rel' in x && x.layer && x.rel), E.scripts.files);
  ok('sources: def stamped with layer + rel', E.sources.def && E.sources.def.layer && E.sources.def.rel && fs.existsSync(path.join(E.sources.def.layer, E.sources.def.rel)), E.sources.def);
}

// ---------- the open document on top ----------
const docDef = Buffer.from(DEF.replace('{volume "body" {thickness 30}}', '{volume "body" {thickness 300}}').replace(/\r?\n/g, '\r\n'), 'latin1');
const fake = { mod, files: new Map([['entity/vehicle/tk/tk.def', { rel: 'entity/vehicle/tk/tk.def', bytes: docDef, from: 'game', dirty: true }]]), scene: q => (q && q.raw ? ctx.scene : { volumes: [] }) };
const cd = sim.openDoc(fake, { unit: 'tk', game, mods: [], folder: mod });
ok('openDoc', !cd.error, cd.error);
eq('unsaved value is used', cd.armor.volumes.body.sides[0], 300);
eq('origin of the edited file', origin.originOf(cd.src, cd.armor.key).from, 'unsaved');
{ const u = origin.originOf(cd.src, cd.armor.key); eq('unsaved: layer = the document\'s mod folder, rel = its rel', [u.layer, u.rel], [path.resolve(mod).replace(/\\/g, '/'), 'entity/vehicle/tk/tk.def']); }
eq('base source untouched', ad.vehicleArmor('tk', { game, mods: [], folder: mod }).volumes.body.sides[0], 30);
E = fx.effects(cd, shell(100), 100, front, { samples: 20 });
eq('the edit changes the result', E.engine.events.map(e => e.event), ['bullet_hit']);
ok('openDoc needs the unit', !!sim.openDoc(fake, {}).error);

// ---------- CLI ----------
const cli = a => cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'armorsim.js')].concat(a), { encoding: 'utf8' });
const S = JSON.stringify(shell(100));
let c = cli(['effects', 'tk', '--game', game, '--folder', mod, '--shell', S, '--range', '100', '--from', '0,0', '--aim-volume', 'body', '--samples', '100', '--json']);
let J = null; try { J = JSON.parse(c.stdout); } catch (e) { J = null; }
ok('CLI effects --json', c.status === 0 && J && J.samples === 100 && J.whole.find(w => w.key === 'cannot move').chance === 1 && !('next' in J), c.stderr || c.stdout.slice(0, 300));
c = cli(['effects', 'tk', '--game', game, '--shell', S, '--range', '100', '--from', '0,0', '--aim-volume', 'body', '--samples', '50']);
ok('CLI effects text', c.status === 0 && /whole: cannot move 100%/.test(c.stdout) && /not followed: /.test(c.stdout) && /\[vanilla\]/.test(c.stdout), c.stdout);

try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* temp */ }
console.log(fails ? 'FAIL after (' + fails + ' of ' + n + ')' : 'PASS after (' + n + ')');
process.exit(fails ? 1 : 0);
