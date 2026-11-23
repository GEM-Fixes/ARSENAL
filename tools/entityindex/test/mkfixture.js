// entityindex fixture: loose folder test/fx/resource/... built from a.def b.def + generated files. usage: node mkfixture.js [edit]
// Author: Imperator_Aug (ARSENAL, ia-4b50d44f)
const fs = require('fs'), path = require('path');
const fx = process.env.EI_FX || path.join(__dirname, 'fx'), put = (k, t) => { const p = path.join(fx, k); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); };
if (process.argv[2] === 'edit') {   // touch an include: a.def depends on it, b.def does not
  put('resource/properties/p.ext', '{boarder {anm "d" {forward {begin "anm_p"}}}}\n{boarder {anm "e" {forward {begin "anm_q"}}}}\n');
  process.exit(0);
}
fs.rmSync(fx, { recursive: true, force: true });
for (const f of ['a.def', 'b.def']) put('resource/entity/' + f, fs.readFileSync(path.join(__dirname, f), 'utf8'));
put('resource/properties/p.ext', '{boarder {anm "d" {forward {begin "anm_p"}}}}\n');
// seeded refusal case: fake game dir whose mod 'oldmod' needs game 99.0 (MOD_VERSION) and 'nomod' does not exist (MOD_UNKNOWN)
fs.rmSync(path.join(path.dirname(fx), 'game'), { recursive: true, force: true });
{ const g = path.join(path.dirname(fx), 'game', 'mods', 'oldmod', 'mod.info'); fs.mkdirSync(path.dirname(g), { recursive: true }); fs.writeFileSync(g, '{Mod {Name "oldmod"} {MinGameVersion "99.0"} {MaxGameVersion "99.1"}}\r\n'); }
put('resource/entity/a.mdl', '{Skeleton {bone "x" {VolumeView "m.ply"}}}\n');
put('resource/set/stuff/gun/w1', '{from "pattern base" {entity "a"}}\n');
put('resource/set/stuff/gun/base.pattern', '{weapon_bullet {tag "stackable bullet"}}\n');
// X3: stuff dir whose .presets holds a block and a stuff file that starts with an include: own {from} block is not the first block
put('resource/set/stuff/cannon/.presets', '{presetblock {tag "fromprsets"} {entity "presetent"}}\n');
put('resource/properties/stuffinc.ext', '{incblock {tag "frominclude"}}\n');
put('resource/set/stuff/cannon/c1', '(include "/properties/stuffinc.ext")\n{from "pattern base" {tag "own"} {entity "b"}}\n');
