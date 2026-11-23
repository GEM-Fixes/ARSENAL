// Author: Imperator_Aug (ARSENAL, ia-bc4e79f5)
// COV-C06 seeded test, no game: task pairs repair, tow, aiuse (validate, mission text, rowsOf verdicts and step fields).
const assert = require('assert');
process.argv.push('--inst', '3');   // edrun reads --inst at load; never 0
const e = require('../edrun.js');
const fail = [];
const t = (n, f) => { try { f(); } catch (err) { fail.push(n + ': ' + err.message); } };
const tk = ['mp/ger/tankman', 'mp/ger/tankman'];
const rep = { name: 'rp', class: 'vehicle', shooter: 'pz6bh', crew: tk, task: 'repair', x: -1350, y: 1200 };
const tow = { name: 'tw', class: 'gun', shooter: 'lefh18', task: 'tow', tower: 'blitz3_6f', towerCrew: tk, x: -450, y: 1200 };
const ai = { name: 'ai', class: 'gun', shooter: 'm3cannon', crew: tk, foe: 'm8grayhound', foeCrew: tk, task: 'aiuse', dist: 600, x: 1350, y: 1200 };
const errs = ps => e.validate(ps, false).join(' | ');

t('validate: good task pairs pass', () => assert.strictEqual(errs([rep, tow, ai]), ''));
t('validate: seeded faults', () => {
  assert.ok(/task must be one of/.test(errs([{ ...rep, task: 'fix' }])));
  assert.ok(/takes no foe/.test(errs([{ ...rep, foe: 't34_0' }])), 'repair with a foe');
  assert.ok(/for a vehicle shooter/.test(errs([{ ...rep, class: 'gun' }])));
  assert.ok(/damage is/.test(errs([{ ...rep, damage: { component: 'eng ine' } }])), 'bad component name');
  assert.ok(/damage is/.test(errs([{ ...rep, damage: { component: 'engine', state: 'dead' } }])), 'bad state');
  assert.strictEqual(errs([{ ...rep, damage: { component: ['engine', 'track_l'], state: 'destroyed' } }]), '', 'a list of parts is fine');
  assert.ok(/repairer is a list/.test(errs([{ ...rep, repairer: 'mp/rus/tankman' }])));
  assert.ok(/needs tower/.test(errs([{ ...tow, tower: undefined }])));
  assert.ok(/towerCrew/.test(errs([{ ...tow, towerCrew: [] }])));
  assert.ok(/towBy/.test(errs([{ ...tow, towBy: 'rope' }])));
  assert.ok(/towDy/.test(errs([{ ...tow, towDy: 50 }])));
  assert.ok(/for a gun shooter/.test(errs([{ ...tow, class: 'vehicle', crew: tk }])));
  assert.ok(/needs a foe/.test(errs([{ ...ai, foe: undefined, foeCrew: undefined }])));
  assert.ok(/needs task "tow"/.test(errs([{ ...rep, task: undefined, tower: 'x' }])), 'task field without a task');
  assert.ok(/selfMan/.test(errs([{ ...rep, selfMan: true }])), 'selfMan is aiuse only');
  assert.ok(/needs shooter and foe/.test(errs([{ ...tow, task: undefined, tower: undefined, towerCrew: undefined }])), 'a plain foeless gun still needs a foe');
});

const m = e.buildMission([rep, tow, { ...tow, name: 'tl', towBy: 'linker', x: 450 }, ai], 'rX', {});
const line = k => m.split('\n').find(l => l.includes(`{"${k}" `)) || '';
t('mission: repair breaks parts, then orders repair', () => {
  assert.ok(/\{"actor_component" \{selector \{tag rp_s\}\} \{component "engine"\} \{state broken\}\}/.test(line('p_rp')), 'default engine');
  assert.ok(/component "fuel"/.test(line('p_rp')), 'default fuel');
  assert.strictEqual((line('p_rp_ro').match(/\{action "repair"\} \{target \{tag rp_s\}\}/g) || []).length, 5, '5 repair orders');
  assert.ok(/!4 & !5/.test(line('p_rp_k')) && /rp repaired/.test(line('p_rp_k')) && /rp kill/.test(line('p_rp_k')));
  assert.ok(/\{"board" \{selector \{tag rp_c\}\}/.test(line('p_rp_arm')), 'crew boarded');
  assert.ok(!/actor_fire/.test(line('p_rp')), 'no fire order');
});
t('mission: tow attaches (or links), then drives to its own waypoint', () => {
  assert.ok(/\{action "attach"\} \{target \{tag tw_s\}\}/.test(line('p_tw')));
  assert.ok(/\{"linker" \{selector \{tag tl_t\}\} \{action link\} \{entities \{tag tl_s\}\} \{place \{type trailer\}\}\}/.test(line('p_tl')));
  assert.ok(/\{state linked\}/.test(line('p_tw_l')) && /waypoint "981"/.test(line('p_tw_l')) && /waypoint "982"/.test(line('p_tl_l')));
  const g = /\{"981" \{position -450\.00 (-?[\d.]+) 0\}/.exec(m), s = /\{Entity "lefh18" \w+\s*\{Position -450 (-?\d+)\}/.exec(e.entities([tow]));
  assert.ok(g && s, 'goal waypoint 981 at the gun x, gun placed');
  assert.strictEqual(+g[1], +s[1] + 1000, 'goal = gun start y + towDy');
  assert.ok(/\{Entity "blitz3_6f" \w+\s*\{Position -450 (-?\d+)\}/.exec(e.entities([tow]))[1] < +s[1], 'truck behind the gun');
  assert.ok(/tw gunmoved/.test(line('p_tw_mv')) && /tw towed/.test(line('p_tw_k')));
  assert.ok(/\{"board" \{selector \{tag tw_tc\}\} \{vehicle \{tag tw_t\}\}\}/.test(line('p_tw_arm')));
});
t('mission: aiuse boards the crew, gives no fire order', () => {
  assert.ok(/\{"board" \{selector \{tag ai_c\}\}/.test(line('p_ai_arm')));
  assert.ok(!/actor_fire/.test(line('p_ai')), 'no actor_fire');
  const self = e.buildMission([{ ...ai, selfMan: true }], 'rX', {});
  assert.ok(!/\{"board" \{selector \{tag ai_c\}\}/.test(self), 'selfMan: no board');
});
t('entities: repairers, truck, its crew and both markers are placed', () => {
  const tags = JSON.stringify(e.entities([rep, tow]));
  for (const g of ['rp_r', 'tw_t', 'tw_tc', 'tw_m', 'tw_a']) assert.ok(tags.includes(g), g);
  assert.ok(!tags.includes('tw_c'), 'no gun crew given, none placed');
});

const ch = times => ({ runId: 'rX', times: { start: 1, ...times }, logText: '', ticks: {}, speed: null });
t('rowsOf: repair done = PASS, not counted as a kill', () => {
  const [r] = e.rowsOf([rep], ch({ 'rp order': 5, 'rp damaged': 8, 'rp repairorder 0': 8, 'rp repaired': 40, 'rp kill': 40 }), {}, {});
  assert.strictEqual(r.verdict, 'PASS'); assert.strictEqual(r.counted, null);
  assert.deepStrictEqual([r.damaged, r.repairOrder, r.repaired], [7, 7, 39]);
});
t('controls: a task control done keeps the game, one not done voids it; giveUp never cuts a task pair', () => {
  const done = e.rowsOf([{ ...rep, control: true }], ch({ 'rp order': 5, 'rp damaged': 8, 'rp repaired': 40, 'rp kill': 40 }), {}, {});
  assert.strictEqual(e.controlsOf(done).void, false);
  const not = e.rowsOf([{ ...rep, control: true }], ch({ 'rp order': 5, 'rp damaged': 8 }), {}, {});
  assert.strictEqual(e.controlsOf(not).void, true);
  assert.strictEqual(e.giveUpOf(rep, { 'rp order': 1, 'clock 0': 0, 'clock 40': 20 }, null, 1e6), false);
  assert.strictEqual(e.giveUpOf(tow, { 'tw order': 1, 'clock 0': 0, 'clock 40': 20 }, null, 1e6), false);
});
t('rowsOf: repair faults are named', () => {
  const [a] = e.rowsOf([rep], ch({ 'rp order': 5 }), {}, {});
  assert.notStrictEqual(a.verdict, 'PASS'); assert.ok(/damage not applied/.test(a.note));
  const [b] = e.rowsOf([rep], ch({ 'rp order': 5, 'rp damaged': 8 }), {}, {});
  assert.ok(/never repaired/.test(b.note));
});
t('rowsOf: tow steps', () => {
  const [r] = e.rowsOf([tow], ch({ 'tw order': 5, 'tw linked': 20, 'tw gunmoved': 30, 'tw towed': 70, 'tw kill': 70 }), {}, {});
  assert.strictEqual(r.verdict, 'PASS'); assert.deepStrictEqual([r.linked, r.gunMoved, r.towed], [19, 29, 69]);
  const [n] = e.rowsOf([tow], ch({ 'tw order': 5 }), {}, {});
  assert.ok(/never linked/.test(n.note));
  const [s] = e.rowsOf([tow], ch({ 'tw order': 5, 'tw linked': 20 }), {}, {});
  assert.ok(/gun never moved/.test(s.note));
});
t('rowsOf: aiuse manned and fired', () => {
  const blast = 'BLAST shooter fired';   // no muzzle lines read here: shotsRead false, so aiFired null
  const [r] = e.rowsOf([ai], ch({ 'ai shooterready': 3, 'ai order': 4 }), {}, {});
  assert.strictEqual(r.manned, 2); assert.strictEqual(r.aiFired, null, blast);
  const [n] = e.rowsOf([{ ...ai, selfMan: true }], ch({ 'ai order': 4 }), {}, {});
  assert.strictEqual(n.manned, null); assert.ok(/never manned/.test(n.note));
});
t('rowsOf: aiuse fire evidence from foe blasts when the gun logs no muzzle line', () => {
  // shooter 1, crew 2-3, foe 4 (entity numbers as in check.js)
  const v = { name: 'av', class: 'vehicle', shooter: 't34_0', crew: ['mp/rus/tankman', 'mp/rus/tankman2'], foe: 'gaz67b', foeCrew: ['mp/ger/rifle'], task: 'aiuse' };
  const lc = (log, times) => ({ ...ch(times), logText: log.join('\r\n'), pipeLines: ['dbg_blast = 1'] });
  const [h] = e.rowsOf([v], lc(['BLAST[3/3-8]: gaz67b[4]/{body} (3) 8->0'], { 'av shooterready': 3, 'av order': 4 }), {}, {});
  assert.strictEqual(h.aiFired, true); assert.strictEqual(h.aiFireBy, 'foe blast');
  const [m] = e.rowsOf([v], lc(['BLAST[0.2/1-1.5]: t34_0[1]/{gun} (0.2) 35->35'], { 'av shooterready': 3, 'av order': 4 }), {}, {});
  assert.strictEqual(m.aiFireBy, 'muzzle');
  const [z] = e.rowsOf([v], lc(['BLAST[0.2/1-1.5]: t34_0[9]/{gun} (0.2) 35->35'], { 'av shooterready': 3, 'av order': 4 }), {}, {});
  assert.strictEqual(z.aiFired, false, 'muzzle lines read, none of its own, no hit: never fired'); assert.ok(/never fired/.test(z.note));
});

if (fail.length) { console.error(fail.join('\n')); process.exit(1); }
console.log('covc06 PASS');
