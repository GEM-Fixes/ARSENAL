// output checks for as2togoh test: converted content, input untouched, modmove assetRules clean on output
// Author: Imperator_Aug (ARSENAL, ia-1fca88b6)
const fs = require('fs'), path = require('path');
const d = path.join(process.env.TEST_WORK || __dirname, 'fixture'), out = path.join(d, 'out'), mod = path.join(d, 'mod');
let bad = 0;
const rd = (r, e) => fs.readFileSync(path.join(out, r), e === undefined ? 'utf8' : e);
const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad = 1; } };
const W = 'resource/entity/-inventory/weapon/small_arms/smg/mp40/mp40';
ok(/stuff_weapon\.ext/.test(rd(W + '.def')), 'weapon include');
ok(/foresight11/.test(rd(W + '.mdl')) && !/foresight3/.test(rd(W + '.mdl')), 'smg foresight11');
ok(/"pattern heavy_headgear"/.test(rd('resource/set/stuff/head/m40')), 'heavy');
ok(/"pattern light_headgear"/.test(rd('resource/set/stuff/head/fieldcap')), 'light');
ok(rd('resource/set/stuff/head/m40').includes('шлем'), 'utf8 recode');
ok(rd('resource/set/stuff/head/m40', null).includes(Buffer.from('шлем', 'utf8')), 'utf8 bytes');
ok(/\r\n/.test(rd('resource/set/stuff/head/m40')), 'CRLF kept');
ok(/^\{game_entity/.test(rd('resource/entity/-inventory/equipment/body/coat/coat.def')), 'body root');
ok(/minGameVersion "1\.067"/.test(rd('mod.info')) && /maxGameVersion "1\.067"/.test(rd('mod.info')), 'version');
const v = rd('resource/entity/-vehicle/ger/tank_medium/pz4/pz4.def');
ok(/extension "pz4\.mdl"/.test(v) && /tank\.ext/.test(v) && !/t34\.ext/.test(v) && /mass 30000/.test(v) && !/tank_as2/.test(v), 'vehicle donor');
ok(/extension "kubel\.mdl"/.test(rd('resource/entity/-vehicle/ger/car/kubel/kubel.def')), 'no-donor vehicle kept');
ok(/foresight3/.test(fs.readFileSync(path.join(mod, W + '.mdl'), 'latin1')), 'input untouched');
// modmove assetRules on the output: none WARN_MOVE_GOH_* except VEHICLE_DEF (any vehicle def trips it)
const { check } = require('../../modmove/lib/static');
const r = check(out, 'as64', 'goh', { noLint: true });
for (const f of r.findings.filter(f => /^WARN_MOVE_GOH_/.test(f.code) && f.code !== 'WARN_MOVE_GOH_VEHICLE_DEF')) { console.log(`FAIL: modmove ${f.file}:${f.line} ${f.code}`); bad = 1; }
const c = check(mod, 'as64', 'goh', { noLint: true }).findings.filter(f => /^WARN_MOVE_GOH_(WEAPON_INCLUDE|FORESIGHT|HEAD_PATTERN)$/.test(f.code));
ok(c.length >= 3, 'modmove control fires on input (' + c.length + ')');
process.exit(bad);
