// Author: Imperator_Aug (ARSENAL, ia-34b2f6bd)
'use strict';
// VALOUR-K test on invented units (no mod read, no game). Run: node tools/valourk/test/test.js
const path = require('path'), assert = require('assert');
const TR = require('../../goh2as2/translate.js'), VK = require('../valourk.js');
const T = TR.loadTable(path.join(__dirname, 'table.json'));
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

const crew4 = '("crew_human" place(a))\n("crew_human" place(b))\n("crew_human" place(c))\n("crew_human" place(d))\n';
const crew3 = crew4.split('\n').slice(0, 3).join('\n') + '\n';
const bones = (a, b) => `{bone "turret" {limits ${a}}}\n{bone "gun_rot" {limits ${b}}}\n`;
const unit = (over) => Object.assign({
  stem: 'u1', gohKey: 'entity/-vehicle/ger/tank_medium/u1/u1.def', as2Key: 'entity/-vehicle/tank_medium/u1/u1.def',
  grec: { k: { speed: 30, mass: 20000, turn_time: 12, start_time: 10, fuel: 300 } },
  arec: { k: { speed: 30, mass: 21000, turn_time: 12, start_time: 10, fuel: 300 } },
  gohAll: crew4 + bones('-10 10', '-5 40'), as2All: crew4 + bones('-10 10', '-5 40'),
  gpen: { dir: 'gun', name: 'g', pen_a: 100, pen_c: 80, pen_e: 50 }, apen: { dir: 'gun', name: 'g', pen_a: 100, pen_c: 80, pen_e: 50 },
}, over);
const flagged = r => r.rows.filter(x => !x.ok).map(x => x.key);

// 1. a matching unit: nothing flags
const a = VK.compareUnit(unit({}), T);
ok(a.cls === 'tank_medium', 'class comes from translate');
ok(a.rows.length >= 9, 'speed turn start mass fuel crew limits pen compared: ' + a.rows.length);
ok(flagged(a).length === 0, 'matching unit flags nothing: ' + flagged(a));
ok(a.asked.length === 0, 'no prompt for in-range values');

// 2. seeded wrong values flag
const b = VK.compareUnit(unit({ arec: { k: { speed: 10, mass: 21000, turn_time: 12, start_time: 10, fuel: 300 } }, as2All: crew3 + bones('-10 10', '-5 90'), apen: { dir: 'gun', name: 'g', pen_a: 100, pen_c: 20, pen_e: 50 } }), T);
const fb = flagged(b);
ok(fb.includes('speed'), 'seeded wrong speed flags: ' + fb);
ok(fb.includes('crew'), 'crew 4 vs 3 flags: ' + fb);
ok(fb.includes('limits gun_rot') && !fb.includes('limits turret'), 'only the wrong limit flags: ' + fb);
ok(fb.includes('pen_c') && !fb.includes('pen_a'), 'seeded wrong penetration flags, right one does not: ' + fb);
ok(!fb.includes('mass'), 'mass 20000 vs 21000 is within 25%');

// 3. a prompt: fuel outside the AS2 range with asking off
const c = VK.compareUnit(unit({ grec: { k: { speed: 30, mass: 20000, turn_time: 12, start_time: 10, fuel: 5000 } } }), T);
ok(c.asked.length === 1 && /fuel/.test(c.asked[0]), 'out-of-range fuel is counted as a prompt: ' + c.asked);

// 4. summary: share, ranking, prompts
const s = VK.summarize([a, b, c].map((u, i) => Object.assign({ stem: 's' + i }, u)));
ok(s.by_class.tank_medium.units === 3, 'three units in the class');
ok(s.keys_ranked[0].flagged >= 1 && s.keys_ranked.some(k => k.key === 'speed' && k.flagged === 1), 'speed ranked with one flag');
ok(s.keys_ranked[0].flagged >= s.keys_ranked[s.keys_ranked.length - 1].flagged, 'ranked by flag count');
ok(s.prompts.units === 1 && s.prompts.by_key.fuel === 1, 'prompt count is 1 unit, key fuel');
ok(s.by_class.tank_medium.share_within25 > 0 && s.by_class.tank_medium.share_within25 < 1, 'share within 25% is a fraction');
ok(VK.within(10, 12) && !VK.within(10, 20) && VK.within(0, 0), 'within() at 25%');
// 5. main-gun pairing by slot (VALOUR-K row): a calibre-named MG first does not win, the same place name pairs
const gS = '{Weaponry\n{place "mgun1" {weapon "mg_13mm"}}\n{place "gun" {weapon "76mm_pak36"}}\n}';
const aS = '{Weaponry\n{place "gunner"}\n{place "gun" {weapon "np_76mm_pak36r"}}\n{place "mgun1" {weapon "zb53"}}\n}';
const gp = VK.gunPair(gS, aS);
ok(gp.goh === '76mm_pak36' && gp.as2 === 'np_76mm_pak36r' && gp.slot === 'gun', 'main slot pairs: ' + JSON.stringify(gp));
const gp2 = VK.gunPair('{weapon "75mm_kwk40"}', '{weapon "50mm_kwk38"}');
ok(gp2.goh === '75mm_kwk40' && gp2.as2 === '50mm_kwk38' && gp2.slot === null, 'no place: calibre fallback, no slot');
// game parity: installs come from lib/games (no drive path in the tool); a folder that is not there is one line, exit 2
{
  const fs = require('fs'), cp = require('child_process'), src = fs.readFileSync(path.join(__dirname, '..', 'valourk.js'), 'utf8');
  ok(!/[A-Za-z]:[\\/]/.test(src.replace(/^\s*\/\/.*$/gm, '')), 'no drive path in valourk.js code');
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'valourk.js'), '--goh', path.join(__dirname, 'no-such-goh'), '--as2', path.join(__dirname, 'no-such-as2'), '--goh-mod', __dirname, '--as2-mod', __dirname], { encoding: 'utf8' });
  ok(r.status === 2 && /^valourk: --goh not found/.test(r.stderr), 'a missing install: exit 2, one line: ' + r.status + ' ' + r.stderr);
}
console.log(`PASS ${n} checks`);
