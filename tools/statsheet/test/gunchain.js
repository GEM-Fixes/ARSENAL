// statsheet --units-json: a main gun whose file only inherits ({from "x"}) gets its numbers from the chain (units.js gunFromChain).
// synthetic folder in a temp dir: gun dir with a .presets file (the parse then starts with the .presets block, so the stuff
// index has no {from} for the gun and the weapon table has no row of its own), base gun with numbers, child that only inherits,
// grandchild that inherits and sets its own reload. Exit 1 on a miss.
// Author: Imperator_Aug (ARSENAL, ia-dcd84463)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssgun-'));
const put = (rel, lines) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, lines.join('\r\n') + '\r\n', 'latin1'); };
put('resource/set/stuff/gun/.presets', ['{curve "gun_std"}', '(define "range_x" {range 100 110})']);
put('resource/set/stuff/gun/gbase', ['{from "pattern gun"', '\t{rechargeTime 6}', '\t{projectileDamage 122}', '\t{projectileDamageTable {10 122} {100 85}}', '\t("range_x")', '}']);
put('resource/set/stuff/gun/gchild(l48)', ['{from "gbase"\t\t; only inherits', '}']);
put('resource/set/stuff/gun/ggrand', ['{from "gchild(l48)"', '\t{rechargeTime 4.5}', '\t{parameters "apcr"', '\t\t{projectileDamage 999}', '\t}', '}']);
const tank = (n, gun) => ['{game_entity', '\t{Weaponry', `\t\t{place "gun" {weapon "${gun}"}}`, '\t}', '}'];
put('resource/entity/t/tank_b.def', tank('tank_b', 'gbase'));
put('resource/entity/t/tank_c.def', tank('tank_c', 'gchild(l48)'));
put('resource/entity/t/tank_g.def', tank('tank_g', 'ggrand'));
put('resource/set/multiplayer/units/common.set', ['{units', '\t{"tank_b" {cost 100} {tags "ger"}}', '\t{"tank_c" {cost 110} {tags "ger"}}', '\t{"tank_g" {cost 120} {tags "ger"}}', '}']);
let bad = 0;
const r = cp.spawnSync('node', [path.join(__dirname, '..', 'statsheet.js'), '-', '--folder', dir, '--cache', path.join(dir, 'c.json'), '--units-json'], { encoding: 'utf8' });
let j = null; try { j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))); } catch (e) { console.log('FAIL gunchain: no JSON ' + r.stdout.slice(0, 300) + r.stderr.slice(0, 300)); bad++; }
if (j) {
  const u = n => (j.units || []).find(x => x.id === n) || {}, g = n => u(n).gun || {};
  const want = { tank_b: [6, 122], tank_c: [6, 122], tank_g: [4.5, 122] };
  for (const [n, [rc, dm]] of Object.entries(want)) {
    const x = g(n);
    if (Number(x.recharge) !== rc || Number(x.damage) !== dm || !x.pen) { console.log(`FAIL gunchain ${n}: ${JSON.stringify(x)} want reload ${rc} damage ${dm} with pen`); bad++; }
  }
}
fs.rmSync(dir, { recursive: true, force: true });
console.log(bad ? 'FAIL gunchain' : 'PASS gunchain');
process.exit(bad ? 1 : 0);
