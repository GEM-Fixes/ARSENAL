// goh2as2 infantry + plain-bone (FMT-05, was PORT-127) tests on an invented GoH tree (PORT-124/125/126). run via run.sh. nothing here is GoH data.
// Author: Imperator_Aug (ARSENAL, ia-f7767d9a)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, 'fixture', 'inf');
fs.rmSync(root, { recursive: true, force: true });
const put = (rel, txt) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, txt.replace(/\r?\n/g, '\r\n')); };
// GoH side
put('goh/resource/entity/humanskin/mp/man-x/man-x.def', '{game_entity\n  {Extension "man-x.mdl"}\n}\n');
put('goh/resource/entity/humanskin/mp/man-x/man-x.mdl', '{model "man-x"}\n');
put('goh/resource/entity/inventory/-weapon/-small_arms/rifle-x/rifle-x.def', '{actor\n  (include "/properties/stuff_small.ext")\n  {extension "rifle.mdl"}\n  {extender "stuff"\n    {item "rifle-x"}\n  }\n}\n');
put('goh/resource/entity/inventory/-weapon/-small_arms/rifle-x/rifle.mdl', '{model "rifle"}\n');
put('goh/resource/set/stuff/rifle/rifle-x', '{from "someotherrifle"\n  {entity "rifle-x"}\n}\n');
put('goh/resource/properties/stuff_small.ext', '{lodclass "stuff_small"}\n(include "stuff.ext")\n');
put('goh/resource/properties/stuff.ext', '{NoVisibilityPatch}\n');
// FMT-05: mdl bones basis, mount = plain; gun_rot, turret = revolute (turret also appears untyped inside a {Volume}, which must not change its type)
put('goh/resource/entity/-vehicle/germany/cannon/gun-x/gun-x.def', '{game_entity\n  {PatherID "cannon.small"}\n  {Extension "gun-x.mdl"}\n  {bone "gun_rot"\n    {limits -3 85}\n    {speed 0.001}\n  }\n  {bone "basis"\n    {limits}\n    {speed 0.005}\n  }\n  {bone "turret"\n    {limits}\n    {speed 0.002}\n  }\n  {bone "mount"\n    {speed 0.1}\n    {param 1}\n  }\n}\n');
put('goh/resource/entity/-vehicle/germany/cannon/gun-x/gun-x.mdl', '{model "gun-x"\n  {bone "basis"\n    {bone revolute "gun_rot"}\n    {bone revolute "turret"}\n    {bone "mount"}\n  }\n  {Volume "v1"\n    {Bone "turret"}\n  }\n}\n');
// not a gun and the bone is "basis": the rule is by mdl bone type, not by name or def kind. "ghost" is not in the mdl: kept (donorfit's job)
put('goh/resource/entity/-vehicle/tankish/tk/tk.def', '{game_entity\n  {Extension "tk.mdl"}\n  {bone "basis"\n    {speed 0.005}\n  }\n  {bone "ghost"\n    {speed 0.1}\n  }\n}\n');
put('goh/resource/entity/-vehicle/tankish/tk/tk.mdl', '{model "tk"\n  {bone "basis"}\n}\n');
// AS2 side (vanilla stand-in)
put('as2/resource/properties/stuff_small.ext', '{x}\n');
put('as2/resource/properties/stuff.ext', '{y}\n');
put('as2/resource/set/breed/mp/ger/veterancy_generic.inc', '{v}\n');
put('as2/resource/set/stuff/rifle/mauzer', '{from "pattern rifle"\n\t{filling "ammo rifle" 5}\n\t{entity "mauzer"}\n\t{fireSound "rifle/mauzer_shot"}\n\t{reloadSound "rifle_bolt_five"}\n\n\t("speed" s(755))\n}\n');
put('as2/resource/set/stuff/rifle/rifle.pattern', '{x}\n');

const tool = path.join(__dirname, '..', 'goh2as2.js');
const run = (args) => cp.spawnSync(process.execPath, [tool, '--goh', path.join(root, 'goh'), '--game', path.join(root, 'as2'), '--no-keylint', '--no-rc', ...args], { encoding: 'utf8' });
let fail = 0;
const t = (name, good, extra) => { console.log((good ? 'ok   ' : 'FAIL ') + name + (good || !extra ? '' : '  ' + extra)); if (!good) fail++; };
const rd = p => { try { return fs.readFileSync(path.join(root, p), 'latin1'); } catch { return null; } };

// 1. man + weapon + stuff.ext stub
const outA = path.join(root, 'outA');
const rA = run(['--entity', 'man-x', '--entity', 'rifle-x', '--out', outA]);
const breed = rd('outA/resource/set/breed/mp/goh/man-x.set'), wbreed = rd('outA/resource/set/breed/mp/goh/w_rifle-x.set');
const stuff = rd('outA/resource/set/stuff/rifle/rifle-x'), stub = rd('outA/resource/properties/goh/stuff.ext');
t('breed written', !!breed && /\{skin "man-x"\}/.test(breed) && /\{inventory/.test(breed) && /\{item "mauzer" filled\}/.test(breed), rA.stdout + rA.stderr);
t('breed: absolute veterancy include (PORT-125)', !!breed && breed.includes('(include "/set/breed/mp/ger/veterancy_generic.inc")') && !/\(include "veterancy_generic\.inc"\)/.test(breed));
t('breed: CRLF only', !!breed && !/[^\r]\n/.test(breed) && breed.includes('\r\n'));
t('weapon breed carries the item', !!wbreed && /\{item "rifle-x" filled\}/.test(wbreed) && /\{item "ammo rifle" 100\}/.test(wbreed));
t('stuff entry: from pattern + entity (PORT-124)', !!stuff && /\{from "pattern rifle"/.test(stuff) && /\{entity "rifle-x"\}/.test(stuff) && /\{fireSound "rifle\/mauzer_shot"\}/.test(stuff) && !/entity "mauzer"/.test(stuff), String(stuff));
t('stuff entry: CRLF only', !!stuff && !/[^\r]\n/.test(stuff));
t('stub stuff.ext (PORT-126)', !!stub && stub.includes('(include "/properties/stuff.ext")') && !/[^\r]\n/.test(stub), String(stub));
t('stub only when stuff_small.ext shadowed: PORT_STUB_WRITTEN info', /PORT_STUB_WRITTEN/.test(rA.stdout));
// 2. no stub when the closure has no stuff_small.ext
const rB = run(['--entity', 'man-x', '--out', path.join(root, 'outB')]);
t('no weapon: no stub, no stuff entry, breed still written', rd('outB/resource/properties/goh/stuff.ext') === null && rd('outB/resource/set/stuff/rifle/rifle-x') === null && rd('outB/resource/set/breed/mp/goh/man-x.set') !== null, rB.stdout);
// 3. dry-run writes nothing
run(['--entity', 'man-x', '--entity', 'rifle-x', '--out', path.join(root, 'outC'), '--dry-run']);
t('dry-run writes nothing', !fs.existsSync(path.join(root, 'outC')));
// 4. FMT-05: {limits}/{speed} removed only under plain mdl bones, any name; typed bones keep them, even a bare {limits}
const rG = run(['--entity', 'gun-x', '--out', path.join(root, 'outG')]);
const gdef = rd('outG/resource/entity/-vehicle/germany/cannon/gun-x/gun-x.def') || '';
t('plain bone "basis": whole block removed (both children were plain-bone fields)', gdef && !/"basis"/i.test(gdef), gdef);
t('revolute bones keep their blocks: {limits -3 85}, bare {limits}, speeds', /\{limits -3 85\}/.test(gdef) && /\{speed 0\.001\}/.test(gdef) && /\{bone "turret"\s*\{limits\}\s*\{speed 0\.002\}/.test(gdef), gdef);
t('plain bone "mount": {speed} removed, other child {param 1} kept with the bone', /\{bone "mount"\s*\{param 1\}\s*\}/.test(gdef) && !/0\.1/.test(gdef), gdef);
const nPlain = (rG.stdout.match(/WARN_PORT_PLAIN_BONE/g) || []).length;
t('WARN_PORT_PLAIN_BONE x3 (basis limits+speed, mount speed); old codes gone', nPlain === 3 && !/WARN_PORT_BONE_BASIS|WARN_PORT_EMPTY_LIMITS/.test(rG.stdout), rG.stdout);
const rT = run(['--entity', 'tk', '--out', path.join(root, 'outT')]);
const tdef = rd('outT/resource/entity/-vehicle/tankish/tk/tk.def') || '';
t('non-gun def: plain "basis" speed removed too', !/"basis"/i.test(tdef) && /WARN_PORT_PLAIN_BONE/.test(rT.stdout), tdef);
t('bone the mdl lacks ("ghost") is left alone', /\{bone "ghost"\s*\{speed 0\.1\}/.test(tdef), tdef);
console.log(fail ? `${fail} FAILED (inf)` : 'inf: all ok');
process.exit(fail ? 1 : 0);
