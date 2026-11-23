// armorsim sim/edit/CLI test on a synthetic game + mod tree (built here, in the scratch/temp dir; no game data).
//   node sim.test.js [scratchDir]
// Author: Imperator_Aug (ARSENAL, ia-afe5f58e)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const sim = require('../sim'), ed = require('../edit'), pen = require('../pen'), ad = require('../armordata');

let n = 0, fails = 0;
function ok(name, cond, info) { n++; if (!cond) { fails++; console.log('FAIL ' + name + (info !== undefined ? ': ' + JSON.stringify(info) : '')); } }
function eq(name, got, want, tol) {
  const same = tol !== undefined ? Math.abs(got - want) <= tol : JSON.stringify(got) === JSON.stringify(want);
  ok(name, same, { got, want });
}

const base = process.argv[2] || process.env.ARMORSIM_SCRATCH || os.tmpdir();
fs.mkdirSync(base, { recursive: true });
const fx = fs.mkdtempSync(path.join(base, 'armorsim-sim-'));
const game = path.join(fx, 'game'), mod = path.join(fx, 'mod');
const W = (root, rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(text.replace(/\r?\n/g, '\r\n'), 'latin1')); };
fs.mkdirSync(mod, { recursive: true });
W(game, 'mowas_2.exe', 'MZ');
W(game, 'resource/properties/tkarmor.inc', `(define "armor_t"
\t{armor
\t\t{setting "body"
\t\t\t{thickness %bod}
\t\t\t{volumes "body*"}
\t\t}
\t}
)
`);
const DEF = `{game_entity
\t(include "/properties/tkarmor.inc")
\t{props "steel"}
\t{volume "body"
\t\t{tags "body"}
\t\t{thickness 30 {front 60} {top 15}}   ; hull é
\t}
\t{volume "turret"
\t\t{thickness 40 {front 50}}
\t}
\t{volume "shield1" {thickness 10}}
\t{volume "decoy" {thickness 500} {able {Bullet 0}}}
\t("armor_t" bod(80 0 25 20))
\t{Extension "tk.mdl"}
}
`;
W(game, 'resource/entity/vehicle/tk/tk.def', DEF);
// world: hull x -50..50, y -30..30, z 0..40; turret x -20..20, y -20..20, z 40..60; hatch x -45..-35, y -5..5, z 40..44
W(game, 'resource/entity/vehicle/tk/tk.mdl', `{Skeleton
\t{bone "basis"
\t\t{bone "body"
\t\t\t{bone "turret"
\t\t\t\t{Position 0 0 40}
\t\t\t}
\t\t}
\t}
}
{Volume "body"
\t{Box 100 60 40}
\t{Bone "body"}
\t{Position 0 0 20}
}
{Volume "turret"
\t{Box 40 40 20}
\t{Bone "turret"}
\t{Position 0 0 10}
}
{Volume "ram"
	{Box 10 60 40}
	{Bone "body"}
	{Position 60 0 20}
}
{Volume "decoy"
	{Box 2 60 40}
	{Bone "body"}
	{Position 71 0 20}
}
{Volume "shield1"
	{Box 80 4 30}
	{Bone "body"}
	{Position 0 -36 20}
}
{Volume "body_hatch"
\t{Box 10 10 4}
\t{Bone "body"}
\t{Position -40 0 42}
}
`);
W(game, 'resource/set/material.set', `{materials
\t{"steel"
\t\t{ricochet {chance {0 1} {30 0.6} {90 0}} {velocityDumping 0.9}}
\t\t{steelEquivalent 1}
\t\t{durability {pierce 1} {blast 1}}
\t}
}
`);
const o = { game, mods: [] };

// ---------- open + table ----------
const ctx = sim.open('tk', o);
ok('open', !ctx.error, ctx.error);
if (ctx.error) { console.log('FAIL'); process.exit(1); }
eq('join ids', ctx.vols.map(v => v.id).sort(), ['basis/body/body', 'basis/body/body_hatch', 'basis/body/shield1', 'basis/body/turret/turret']);
eq('not hit by shells: ram + able bullet 0', ctx.join.notHit.map(x => x.name).sort(), ['decoy', 'ram']);
eq('join notInModel', ctx.join.notInModel, []);
const T = sim.table(ctx);
ok('table flag not hit', T.rows.find(r => r.name === 'ram').flags.some(f => /not hit by shells/.test(f)));
const row = nm => T.rows.find(r => r.name === nm);
eq('table body mm', row('body').sides.map(s => s.mm), [80, 20, 30, 30, 25, 20]);
eq('table body rules', row('body').sides.map(s => s.rule), ['area body', 'area body', 'own', 'own', 'area body', 'area body']);
eq('table body front at = inc, macro = def:13', [row('body').sides[0].at, row('body').sides[0].macro], ['resource/properties/tkarmor.inc:4', 'resource/entity/vehicle/tk/tk.def:13']);
eq('table body left at def:6', row('body').sides[2].at, 'resource/entity/vehicle/tk/tk.def:6');
eq('table turret mm', row('turret').sides.map(s => s.mm), [50, 40, 40, 40, 40, 40]);
eq('table turret front at def:9', row('turret').sides[0].at, 'resource/entity/vehicle/tk/tk.def:9');
ok('table flags', row('body').flags.includes('area override') && row('body_hatch').flags.includes('model only'), [row('body').flags, row('body_hatch').flags]);
eq('summary hull', T.summary.hull, { volume: 'body', front: 80, side: 30, rear: 25, top: 20 });
eq('summary turret', T.summary.turret, { volume: 'turret', front: 50, side: 40, rear: 40, top: 40 });

// ---------- shots ----------
const shellOf = mm => ({ weapon: 'test', calibre: 75, table: [[0, mm], [5000, mm]] });
let r = sim.shoot(ctx, shellOf(100), 100, sim.rayFrom(ctx, 0, 0));
eq('az0 first plate', [r.plates[0].volume, r.plates[0].side, r.plates[0].nominal, r.plates[0].angle], ['basis/body/body', 'front', 80, 0]);
eq('az0 verdict', r.verdict, 'penetrate');
r = sim.shoot(ctx, shellOf(100), 100, sim.rayFrom(ctx, 90, 0));
eq('az90 left side', [r.plates[0].volume, r.plates[0].side, r.plates[0].nominal, r.plates[0].angle], ['basis/body/body', 'left', 30, 0]);
r = sim.shoot(ctx, shellOf(500), 100, sim.rayFrom(ctx, 60, 0, [50, 0, 20]));
const v60 = r.verdicts[0], sl = pen.slope(60);
const effWant = pen.effectiveThickness(80, { calibre: 75, damageScale: sl.damageScale, overmatchScale: pen.overmatchScale(shellOf(500), sl.cosine) });
eq('az60 front face angle', [r.plates[0].side, r.plates[0].angle], ['front', 60]);
eq('az60 effective = rule 11', v60.effective, effWant, 1e-6);
ok('az60 sloped thicker', v60.effective > 80, v60.effective);
const under = sim.shoot(ctx, shellOf(79), 100, sim.rayFrom(ctx, 0, 0)), over = sim.shoot(ctx, shellOf(81), 100, sim.rayFrom(ctx, 0, 0));
ok('pen 79 vs 80 fails', under.verdict !== 'penetrate', under.verdict);
eq('pen 81 vs 80 passes', over.verdict, 'penetrate');
eq('ricochet chance square-on 0', under.verdict === 'ricochet' ? under.chance : 0, 0);
r = sim.shoot(ctx, shellOf(100), 100, { origin: [0, 0, 500], dir: [0, 0, -1] });
eq('origin/dir from above hits turret top', [r.plates[0].volume, r.plates[0].side, r.plates[0].nominal], ['basis/body/turret/turret', 'top', 40]);
eq('miss', sim.shoot(ctx, shellOf(100), 100, { origin: [0, 500, 500], dir: [1, 0, 0] }).verdict, 'no_hit');
eq('aim-volume turret', sim.aimVolume(ctx, 'turret'), [0, 0, 50]);

// ---------- map ----------
const t0 = Date.now();
const M = sim.map(ctx, shellOf(70), 100, sim.parseView('front'), { w: 32, h: 24 });
const ms = Date.now() - t0;
ok('map: no ram/decoy', !M.volumes.some(id => /ram|decoy/.test(id)));
// thin shield before a thick hull: 20 mm shell passes 10 mm shield, stops in the 30 mm hull side
r = sim.shoot(ctx, shellOf(20), 100, sim.rayFrom(ctx, 270, 0, [0, 0, 20]));
ok('shield first then hull', r.plates[0].volume === 'basis/body/shield1' && r.plates.some(p => p.volume === 'basis/body/body' && p.side === 'right'), r.plates);
ok('shield r=P o!=P', r.r === 'P' && r.o !== 'P' && r.o !== 'O' && r.lastVolume === 'basis/body/body', [r.r, r.o, r.lastVolume]);
const MR = sim.map(ctx, shellOf(20), 100, sim.parseView('right'), { w: 32, h: 24 });
const shC = MR.cells.filter(c => c && MR.volumes[c.v] === 'basis/body/shield1' && MR.volumes[c.last] === 'basis/body/body');
ok('map shield cells r P o N/R', shC.length > 20 && shC.every(c => c.r === 'P' && c.o !== 'P'), shC.slice(0, 2));
ok('map shares', MR.shareFirst > MR.share, [MR.shareFirst, MR.share]);
const bodyIx = M.volumes.indexOf('basis/body/body'), turIx = M.volumes.indexOf('basis/body/turret/turret');
const hull = M.cells.filter(c => c && c.v === bodyIx), tur = M.cells.filter(c => c && c.v === turIx);
ok('map hull cells', hull.length > 50 && hull.every(c => c.s === 0 && c.n === 80 && c.r !== 'P'), hull.slice(0, 3));
ok('map turret cells', tur.length > 5 && tur.every(c => c.s === 0 && c.n === 50 && c.r === 'P'), tur.slice(0, 3));
eq('map corner empty', [M.cells[0], M.cells[M.grid.w - 1]], [null, null]);
eq('map grid', [M.grid.w, M.grid.h, M.cells.length], [32, 24, 768]);
ok('map fast', ms < 2000, ms);
const M2 = sim.map(ctx, shellOf(90), 100, sim.parseView('front'), { w: 32, h: 24 });
ok('map flips with pen', M2.cells.filter(c => c && c.v === bodyIx).every(c => c.r === 'P') && M2.cells.filter(c => c && c.v === bodyIx).every(c => c.o === 'P') && Math.abs(M.share - M.cells.filter(c => c && c.o === 'P').length / M.hitCells) < 1e-9, [M.share, M2.share]);

// ---------- edit ----------
const gameDef = path.join(game, 'resource/entity/vehicle/tk/tk.def'), modDef = path.join(mod, 'resource/entity/vehicle/tk/tk.def');
const gameBytes = fs.readFileSync(gameDef);
let e = ed.edit('tk', { volume: 'turret', side: 'rear', mm: 33, out: mod, dry: true, game });
ok('dry ok', e.ok && !fs.existsSync(modDef), e);
e = ed.edit('tk', { volume: 'turret', side: 'front', mm: 70, out: mod, game });
ok('turret front ok', e.ok, e);
const after = fs.existsSync(modDef) ? fs.readFileSync(modDef) : Buffer.alloc(0);
const wantBytes = Buffer.from(gameBytes.toString('latin1').replace('{front 50}', '{front 70}'), 'latin1');
ok('one number changed, every other byte kept', after.equals(wantBytes), after.toString('latin1'));
eq('CRLF kept', (after.toString('latin1').match(/\r\n/g) || []).length, (gameBytes.toString('latin1').match(/\n/g) || []).length);
eq('game def untouched', fs.readFileSync(gameDef).equals(gameBytes), true);
eq('edit at def:9', [e.changes[0].line, e.changes[0].before, e.changes[0].after, e.changes[0].created], [9, '50', '70', true]);
const snap = fs.readFileSync(modDef);
e = ed.edit('tk', { volume: 'turret', side: 'rear', mm: 33, out: mod, dry: true, game });
ok('dry writes nothing', e.ok && fs.readFileSync(modDef).equals(snap), e);
e = ed.edit('tk', { volume: 'body', side: 'front', mm: 90, out: mod, game });
ok('shared area refused', !e.ok && e.refused && /body_hatch/.test(e.reason) && fs.readFileSync(modDef).equals(snap), e);
e = ed.edit('tk', { volume: 'body', side: 'left', mm: 45, out: mod, game });
ok('own side added', e.ok && /\{thickness 30 \{front 60\} \{top 15\} \{left 45\}\}   ; hull/.test(fs.readFileSync(modDef, 'latin1')), [e, fs.readFileSync(modDef, 'latin1')]);
e = ed.edit('tk', { volume: 'body', side: 'front', mm: 90, out: mod, shared: true, game });
ok('shared with --shared edits the macro call', e.ok && /\("armor_t" bod\(90 0 25 20\)\)/.test(fs.readFileSync(modDef, 'latin1')), e);
const B = ad.vehicleArmor('tk', { game, folder: mod, src: require('../../lib/sdlset').createSource({ gameDir: game, folder: mod }) });
eq('reader sees edits', [B.volumes.body.thickness.front, B.volumes.body.thickness.left, B.volumes.body.thickness.right, B.volumes.turret.thickness.front, B.volumes.body_hatch.thickness.front], [90, 45, 30, 70, 90]);
ok('comment and high byte kept', fs.readFileSync(modDef, 'latin1').includes('; hull é\r\n'));
e = ed.edit('tk', { volume: 'turret', side: 'front', mm: 60, out: game, game });
ok('game folder refused', !e.ok && e.refused && fs.readFileSync(gameDef).equals(gameBytes), e);

// ---------- CLI ----------
const cli = (args) => cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'armorsim.js'), ...args], { encoding: 'utf8' });
let c = cli(['--help']);
ok('cli help', c.status === 0 && /table/.test(c.stdout) && /edit/.test(c.stdout), c.status);
eq('cli usage exit 2', cli(['bogus']).status, 2);
c = cli(['table', 'tk', '--game', game, '--json']);
ok('cli table json', c.status === 0 && JSON.parse(c.stdout).summary.hull.front === 80, c.stderr);
c = cli(['shot', 'tk', '--game', game, '--folder', mod, '--shell', JSON.stringify(shellOf(100)), '--range', '100', '--from', '0,0', '--json']);
let J = c.status === 0 ? JSON.parse(c.stdout) : {};
ok('cli shot json (mod folder: front 90)', J.verdict === 'penetrate' && J.plates[0].nominal === 90 && J.ray && J.ray.dir[0] === -1, [c.status, c.stderr, J.plates && J.plates[0]]);
c = cli(['map', 'tk', '--game', game, '--shell', JSON.stringify(shellOf(100)), '--range', '100', '--view', 'top', '--grid', '16x12', '--json']);
J = c.status === 0 ? JSON.parse(c.stdout) : {};
ok('cli map json top', J.cells && J.cells.length === 192 && J.cells.some(x => x && x.s === 1), [c.status, c.stderr]);
// an ammo the weapon does not load: the shot runs, one note line, JSON field ammoNotLoaded; the gun/ammo source carries layer + rel
W(game, 'resource/set/stuff/gun/g75.weapon', '{weapon_bullet\n\t{filling "s75"}\n\t{projectileDamageTable {10 120} {100 80}}\n}\n');
W(game, 'resource/set/stuff/shell/s75.ap.ammo', '{bullet\n\t{tag "s75 ap shell"}\n}\n');
W(game, 'resource/set/stuff/shell/s99.ap.ammo', '{bullet\n\t{tag "s99 ap shell"}\n}\n');
c = cli(['shot', 'tk', '--game', game, '--weapon', 'g75.weapon', '--ammo', 's99.ap.ammo', '--range', '100', '--from', '0,0']);
ok('cli shot: ammo not loaded = one note line, the shot still runs', c.status === 0 && (c.stdout.match(/^note: the weapon g75\.weapon does not load the ammo "s99\.ap\.ammo"; fired anyway \(it loads: s75\.ap\.ammo\)$/mg) || []).length === 1 && /first plate: /.test(c.stdout), [c.status, c.stderr, c.stdout]);
c = cli(['shot', 'tk', '--game', game, '--weapon', 'g75.weapon', '--ammo', 's99.ap.ammo', '--range', '100', '--from', '0,0', '--json']);
J = c.status === 0 ? JSON.parse(c.stdout) : {};
eq('cli shot json: ammoNotLoaded', J.ammoNotLoaded, { asked: 's99.ap.ammo', weapon: 'g75.weapon', loads: ['s75.ap.ammo'] });
const gs = J.shell && J.shell.source || {}, gameFwd = path.resolve(game).replace(/\\/g, '/');
eq('cli shot json: gun and ammo source with layer (the game folder) and rel', [gs.weapon && [gs.weapon.from, gs.weapon.layer, gs.weapon.rel], gs.ammo && gs.ammo.rel],
  [['vanilla', gameFwd + '/resource', 'set/stuff/gun/g75.weapon'], 'set/stuff/shell/s99.ap.ammo']);
c = cli(['shot', 'tk', '--game', game, '--weapon', 'g75.weapon', '--ammo', 's75.ap.ammo', '--range', '100', '--from', '0,0']);
ok('cli shot: loaded ammo, no note', c.status === 0 && !/does not load/.test(c.stdout), [c.status, c.stderr]);
c = cli(['edit', 'tk', '--game', game, '--volume', 'body', '--side', 'rear', '--mm', '1', '--out', mod]);
eq('cli shared refused exit 1', c.status, 1);
c = cli(['map', 'tk', '--game', game, '--shell', JSON.stringify(shellOf(100)), '--range', '100', '--view', 'front', '--grid', '24x12']);
ok('cli map text', c.status === 0 && /penetrated: /.test(c.stdout), c.stderr);

fs.rmSync(fx, { recursive: true, force: true });
console.log(n + ' checks, ' + fails + ' failed');
console.log(fails ? 'FAIL' : 'PASS');
process.exit(fails ? 1 : 0);
