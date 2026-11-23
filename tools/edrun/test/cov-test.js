// Author: Imperator_Aug (ARSENAL, ia-7e606876)
'use strict';
// Seeded test for tools/edrun/cov.js. Synthetic folders in os.tmpdir; real-folder checks run only if present.
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os');
const cov = require('../cov.js');
const fail = [];
const t = (n, f) => { try { f(); } catch (x) { fail.push(n + ': ' + x.message); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cov-'));
const pr = (name, shooter, foe, verdict, cls) => ({ name, class: cls || 'vehicle', shooter, foe, order: 3, kill: verdict === 'PASS' ? 5 : null, verdict });
const mk = (dir, pairs, marks) => {
  fs.mkdirSync(path.join(tmp, dir));
  fs.writeFileSync(path.join(tmp, dir, 'report.json'), JSON.stringify({ games: [{ crash: false, marks: marks || {} }], pairs }));
  return path.join(tmp, dir);
};
const ctlOk = pr('ctl', 't34_0', 'gaz67b', 'PASS');
const good = mk('good', [ctlOk,
  pr('o_pz3', 'pz3', 'gaz67b', 'PASS'), pr('o_is2', 'is2', 'gaz67b', 'NOKILL'),
  pr('i_pz3', 't34_0', 'pz3', 'PASS'), pr('i_pak40', 't34_0', 'pak40', 'NOKILL'),
  pr('o_mg', 'mg34_stan', 'gaz67b', 'PASS', 'gun')]);
const badctl = mk('badctl', [pr('ctl', 't34_0', 'gaz67b', 'NOKILL'), pr('i_pz3', 't34_0', 'pz3', 'PASS')]);
const noctl = mk('noctl', [pr('o_pz3', 'pz3', 'gaz67b', 'PASS')]);
const arm = mk('arm', [ctlOk, pr('o_bt7a', 'bt7a', 'gaz67b', 'PASS'), pr('o_su76', 'su76', 'gaz67b', 'PASS')],
  { 'ctl arm': 1, 'o_bt7a arm': 1 }); // su76 never armed

t('good counts', () => {
  const r = cov.build([good], { sessions: tmp });
  assert.strictEqual(r.cells.tank_medium.fire.ok + '/' + r.cells.tank_medium.fire.n, '1/1');
  assert.strictEqual(r.cells.tank_medium.dmg.ok + '/' + r.cells.tank_medium.dmg.n, '1/1');
  assert.strictEqual(r.cells.tank_heavy.fire.ok + '/' + r.cells.tank_heavy.fire.n, '0/1');
  assert.strictEqual(r.cells.cannon.dmg.ok + '/' + r.cells.cannon.dmg.n, '0/1');
  assert.deepStrictEqual([...r.cells.tank_medium.fire.dirs], ['good']);
  assert.strictEqual(r.void.length, 0);
});
t('group of mg34_stan from reps file', () => {
  const rf = path.join(tmp, 'reps.md');
  fs.writeFileSync(rf, '## Guns\n| # | rep | army | group | size |\n|---|---|---|---|---|\n| 1 | zzgun | rus | cannon_mgun crew4 | 6 |\n| 2 | zzmort | usa | mortar crew4 | 6 |\n## Infantry\n| # | rep | army | class | n |\n|---|---|---|---|---|\n| 1 | smgs2(rus) | rus | smg | 43 |\n');
  const m = cov.loadReps(rf);
  assert.deepStrictEqual([m.zzgun, m.zzmort, m.smgs2], ['cannon_mgun', 'mortar', 'squad']);
});
t('void: failed control and absent control add nothing', () => {
  const r = cov.build([badctl, noctl], { sessions: tmp });
  assert.deepStrictEqual(Object.keys(r.cells), []);
  assert.strictEqual(r.void.length, 2);
  assert.ok(/control NOKILL/.test(r.void[0]) && /no control/.test(r.void[1]));
});
t('two controls: one pass counts, both missing voids, report game fields rule', () => {
  const two = (dir, ctl1, ctl2, isVoid) => {
    fs.mkdirSync(path.join(tmp, dir));
    const pairs = [pr('ctl', 't34_0', 'gaz67b', ctl1), pr('ctl2', 'pz6bh', 't34_0', ctl2), pr('o_pz3', 'pz3', 'gaz67b', 'PASS')];
    fs.writeFileSync(path.join(tmp, dir, 'report.json'), JSON.stringify({ games: [{ crash: false, marks: {}, controls: [{ name: 'ctl', verdict: ctl1 }, { name: 'ctl2', verdict: ctl2 }], void: isVoid }], pairs }));
    return path.join(tmp, dir);
  };
  const one = cov.build([two('c2ok', 'NOKILL', 'PASS', false)], { sessions: tmp });
  assert.strictEqual(one.void.length, 0); assert.strictEqual(one.cells.tank_medium.fire.ok, 1);
  assert.strictEqual(cov.build([two('c2bad', 'NOKILL', 'NOKILL', true)], { sessions: tmp }).void.length, 1);
});
t('mixed: void folder does not change counts', () => {
  const a = cov.build([good], { sessions: tmp }), b = cov.build([good, badctl, noctl], { sessions: tmp });
  assert.strictEqual(cov.render(a), cov.render(b));
});
t('spawn from arm marks', () => {
  const r = cov.build([arm], { sessions: tmp });
  assert.strictEqual(r.cells.tank_light.spawn.ok + '/' + r.cells.tank_light.spawn.n, '1/2');
  assert.strictEqual(r.cells.tank_light.fire.n, 1);
});
t('parent folder scan and unknown stem', () => {
  const r = cov.build([tmp], { sessions: tmp });
  assert.ok(r.cells.tank_medium);
  const u = mk('unk', [ctlOk, pr('o_x', 'qqq', 'gaz67b', 'PASS')]);
  assert.deepStrictEqual(cov.build([u], { sessions: tmp }).unknown, ['qqq']);
});
t('PLAN table parse', () => {
  const plan = '**V thing.** x\n| group | spawn | move | fire-out | damage-in | runs |\n|---|---|---|---|---|---|\n| tank_medium | 6/6 | - | 5/5 nm | 0/13, x | r |\n\nother\n';
  const p = cov.planTable(plan, 'V');
  assert.deepStrictEqual(p.tank_medium, { spawn: [6, 6], fire: [5, 5], dmg: [0, 13] });
  const r = cov.build([good], { sessions: tmp });
  const d = cov.diff(r, plan, ['V']);
  assert.ok(d.some((x) => /V tank_medium spawn: mine 2\/2, PLAN 6\/6/.test(x)), d.join('|'));
});

// Real checks (folders under ../run/sessions), skipped if absent.
const S = path.join(__dirname, '..', '..', '..', '..', 'run', 'sessions');
const fin1 = path.join(S, 'w8/T1c/fin1'), fin2 = path.join(S, 'w8/T1c/fin2'), b4 = path.join(S, 'w5/B4');
if (fs.existsSync(fin1) && fs.existsSync(fin2)) t('real T1c fin1+fin2: damage-in 5 of 7', () => {
  const r = cov.build([fin1, fin2], { sessions: S });
  let ok = 0, n = 0;
  for (const g of Object.values(r.cells)) if (g.dmg) { ok += g.dmg.ok; n += g.dmg.n; }
  assert.strictEqual(ok + '/' + n, '5/7');
  assert.ok(r.void.length === 1 && /fin1/.test(r.void[0]));
});
if (fs.existsSync(path.join(b4, 'r1'))) t('real B4: r2-r4 void', () => {
  const r = cov.build([b4], { sessions: S });
  assert.deepStrictEqual(r.void.map((v) => v.split(':')[0]), ['w5/B4/r2', 'w5/B4/r3', 'w5/B4/r4']);
  let n = 0; for (const g of Object.values(r.cells)) if (g.fire) n += g.fire.n;
  assert.strictEqual(n, 7); // r1 minus control
});

fs.rmSync(tmp, { recursive: true, force: true });
if (fail.length) { console.log('FAIL\n' + fail.join('\n')); process.exit(1); }
console.log('cov-test ok');
