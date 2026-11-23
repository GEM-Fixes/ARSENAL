// armorsim: a mod given as a folder (--folder, the GUI's chosen mod, mods: []) reads its own paks over the game, in the
// engine's mount order; a HEAT shell of the mod pak is listed, resolved, kind heat, and its cumulative filling flies a jet.
// Synthetic only: a tiny fake game tree + a fake mod folder with resource/gamelogic.pak and resource/entity.pak (zips built
// here by tools/lib/zipwrite), no game text.   node modpak.test.js [scratchDir]   last line PASS on success
// Author: Imperator_Aug (ARSENAL, ia-edc4985d)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const sim = require('../sim'), after = require('../after'), ad = require('../armordata'), origin = require('../origin');
const { zip } = require('../../lib/zipwrite');
const sdlset = require('../../lib/sdlset');

let n = 0, fails = 0;
function ok(name, cond, info) { n++; if (!cond) { fails++; console.log('FAIL ' + name + (info !== undefined ? ': ' + JSON.stringify(info) : '')); } }
const eq = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

const base = process.argv[2] || process.env.ARMORSIM_SCRATCH || os.tmpdir();
fs.mkdirSync(base, { recursive: true });
const dir = fs.mkdtempSync(path.join(base, 'armorsim-modpak-'));
const game = path.join(dir, 'game'), mod = path.join(dir, 'game', 'mods', 'fakemod');
const crlf = t => Buffer.from(t.replace(/\r?\n/g, '\r\n'), 'latin1');
const W = (root, rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof text === 'string' ? crlf(text) : text); };
const PAK = (root, rel, files) => W(root, rel, zip(Object.entries(files).map(([k, t]) => [k, crlf(t), false])));

// ---------- the game: gun g75 loads "bullet75" (ap only), tank tk 30 mm all round ----------
W(game, 'mowas_2.exe', 'MZ');
W(game, 'resource/set/stuff/gun/g75', '{from "pattern gun"\n\t{filling "bullet75"}\n\t{projectileDamageTable {0 50} {1000 40}}\n}\n');
W(game, 'resource/set/stuff/gun/gun.pattern', '{weapon\n\t{range 1000 1000}\n}\n');
W(game, 'resource/set/stuff/shell/bullet75.ap.ammo', '{from "pattern shell"\n}\n');
W(game, 'resource/set/stuff/shell/shell.pattern', '{bullet\n\t{tag "ammo shell"}\n}\n');
W(game, 'resource/set/material.set', '{materials\n\t{"steel"\n\t\t{ricochet {chance {0 0}}}\n\t\t{steelEquivalent 1}\n\t}\n}\n');
W(game, 'resource/entity/vehicle/tk/tk.def', '{game_entity\n\t{props "steel tank"}\n\t{component "body"}\n\t{volume "body" {thickness 30}}\n\t{Extension "tk.mdl"}\n}\n');
W(game, 'resource/entity/vehicle/tk/tk.mdl', '{Skeleton\n\t{bone "basis"\n\t\t{bone "body"}\n\t}\n}\n{Volume "body" {Box 100 60 40} {Bone "body"} {Position 0 0 20}}\n');

// ---------- the mod: its gamelogic.pak replaces g75 (filling "bullet75 ger", params "heatb" flat 20 mm) and adds a HEAT shell ----------
W(mod, 'mod.info', '{Mod\n\t{Name "fake"}\n\t{MinGameVersion "3.262"}\n\t{MaxGameVersion "3.262"}\n}\n');
PAK(mod, 'resource/gamelogic.pak', {
  'set/stuff/gun/g75': '{from "pattern gun"\n\t{filling "bullet75 ger"}\n\t{projectileDamageTable {0 60} {1000 45}}\n\t{parameters "heatb"\n\t\t{projectileDamageTable {0 20} {200 20} {205 0}}\n\t}\n}\n',
  'set/stuff/shell/heat.pattern': '{bullet\n\t{tag "ammo shell no_ricochet heat_shell"}\n\t{cumulative 1}\n}\n',
  'set/stuff/shell/bullet75.ger.apcbc.ammo': '{from "pattern shell"\n}\n',
  'set/stuff/shell/bullet75.ger.heatb.ammo': '{from "pattern heat"\n\t{damage cumulative\n\t\t{damage 60}\n\t\t{distance 0.5}\n\t}\n}\n',
  'set/stuff/shell/bullet75.us.heat.ammo': '{from "pattern heat"\n}\n',
  'set/stuff/shell/bullet75.ger.order.ammo': '{from "pattern shell"\n\t{tag "frompak"}\n}\n',
});
// loose set/ sorts after gamelogic.pak: the loose copy wins
W(mod, 'resource/set/stuff/shell/bullet75.ger.order.ammo', '{from "pattern shell"\n\t{tag "fromloose"}\n}\n');
// entity.pak sorts after the loose entity/ dir: the pak wins; the pak's tk has 50 mm, the loose one 5 mm
PAK(mod, 'resource/entity.pak', { 'entity/vehicle/tk/tk.def': '{game_entity\n\t{props "steel tank"}\n\t{component "body"}\n\t{volume "body" {thickness 50}}\n\t{Extension "tk.mdl"}\n}\n' });
W(mod, 'resource/entity/vehicle/tk/tk.def', '{game_entity\n\t{props "steel tank"}\n\t{component "body"}\n\t{volume "body" {thickness 5}}\n\t{Extension "tk.mdl"}\n}\n');

const o = { game, mods: [], folder: mod };
const S = ad.openSource(o);

// ---------- mount order ----------
eq('winner: loose set/ file over gamelogic.pak', S.winner('resource/set/stuff/shell/bullet75.ger.order.ammo'), 'local');
eq('winner: entity.pak over the loose entity/ file', S.winner('resource/entity/vehicle/tk/tk.def'), 'pak');
eq('winner: the mod pak over the game', S.winner('resource/set/stuff/gun/g75'), 'pak');
eq('winner: a file only the game has', S.winner('resource/set/stuff/shell/bullet75.ap.ammo'), 'vfs');
ok('mods: ["fakemod"] (the folder mounted through the vfs): the folder\'s paks are not read twice',
  sdlset.createSource({ gameDir: game, mods: ['fakemod'], folder: mod, disableVersionControl: true }).packed().size === 0);
eq('entity.pak def read (50 mm), not the loose 5 mm, not the game 30 mm', ad.vehicleArmor('tk', o).volumes.body.own.front, 50);

// ---------- the weapon's loads list and the HEAT shell ----------
const first = ad.shell('g75', o);
eq('weapon loads = the mod pak filling (bullet75 ger)', first.candidates, ['bullet75.ger.apcbc.ammo', 'bullet75.ger.heatb.ammo', 'bullet75.ger.order.ammo']);
for (const asked of ['heatb', 'bullet75 ger heatb', 'bullet75.ger.heatb.ammo']) {
  const H = ad.shell({ weapon: 'g75', ammo: asked }, o);
  eq('"' + asked + '" resolves to the heatb shell, params heatb', [H.ammo, H.params, H.ammoNotLoaded, H.ammoFallback], ['bullet75.ger.heatb.ammo', 'heatb', null, null]);
}
const H = ad.shell({ weapon: 'g75', ammo: 'heatb' }, o);
eq('kind heat, cumulative reach 1 m from the pattern', [H.kind, H.cumulative], ['heat', 1]);
eq('cumulative filling read', H.damage, [{ type: 'cumulative', damage: 60, distance: 0.5 }]);
eq('HEAT pen from its own table: flat to 200 m', [require('../pen').penetrationAt(H, 10), require('../pen').penetrationAt(H, 190)], [20, 20]);
const st = origin.stamp(S, { file: H.ammoKey });
ok('origin: from mod, layer = the mod pak, rel = the entry', st.from === 'mod' && /\/resource\/gamelogic\.pak$/.test(st.layer) && st.rel === 'set/stuff/shell/bullet75.ger.heatb.ammo', st);
const so = origin.stamp(S, { file: ad.shell({ weapon: 'g75', ammo: 'order' }, o).ammoKey });
ok('origin: loose set/ file that beats the pak names the mod folder', so.from === 'mod' && so.rel === 'resource/set/stuff/shell/bullet75.ger.order.ammo', so);
ok('ammo tag from the loose copy', ad.shell({ weapon: 'g75', ammo: 'order' }, o).tags.includes('fromloose'));
const included = origin.originOf(S, 'resource/gamelogic.pak!set/stuff/shell/heat.pattern');
ok('origin of a "<pak>!<entry>" include name: the mod pak', included.from === 'mod' && /gamelogic\.pak$/.test(included.layer) && included.rel === 'set/stuff/shell/heat.pattern', included);
const NL = ad.shell({ weapon: 'g75', ammo: 'bullet75 heat' }, o);
ok('"bullet75 heat" on a "bullet75 ger" gun: the us heat shell, not loaded, near = the ger heatb', NL.ammo === 'bullet75.us.heat.ammo' && NL.ammoNotLoaded && JSON.stringify(NL.ammoNotLoaded.near) === '["bullet75.ger.heatb.ammo"]', NL.ammoNotLoaded);

// ---------- the shot: 20 mm HEAT fails on 50 mm, bursts, the 60 mm jet goes through ----------
const ctx = sim.open('tk', o);
ok('open', !ctx.error, ctx.error);
if (!ctx.error) {
  const shellObj = sim.shellFrom({ weapon: 'g75', ammo: 'heatb' }, o);
  ok('shellFrom', !shellObj.error && shellObj.kind === 'heat', shellObj.error);
  const r = after.run(ctx, shellObj, 100, sim.rayFrom(ctx, 0, 0, [0, 0, 20]), after.newState(ctx), {});
  ok('the shell fails on the 50 mm hull', r.end.result === 'no_penetration' && r.end.volume === 'body', r.end);
  const J = r.jet && r.jet[0];
  ok('one jet with damage 60, distance 0.5, point and dir', J && J.damage === 60 && J.distance === 0.5 && Array.isArray(J.point) && J.point.length === 3 && Array.isArray(J.dir), J && { damage: J.damage, distance: J.distance, point: J.point, dir: J.dir });
  ok('the jet pierces the hull', J && J.plates[0] && J.plates[0].volume === 'body' && J.plates[0].result === 'penetrate', J && J.plates);
}

console.log(`modpak.test: ${n - fails}/${n} ok`);
try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* temp */ }
if (fails) { console.log('FAIL'); process.exit(1); }
console.log('PASS');
