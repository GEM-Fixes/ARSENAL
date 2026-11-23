// SILENT-1F seeded tests, no game: muzzle lines are cannon shots, no-blast muzzles read null, NOORDER names the false term, the marginal band.
// The BLAST lines are real, from the SILENT-1 g1 game (dbg_blast 1, as64_ed), entity numbers as that game's pair list gives them.
// Author: Imperator_Aug (ARSENAL, ia-97cba208)
const assert = require('assert');
const e = require('../edrun.js');
const pf = require('../preflight.js');
let n = 0, bad = 0;
const t = (name, f) => { try { f(); n++; } catch (err) { bad++; console.error('FAIL silent1f: ' + name + '\n  ' + (err && err.message)); } };
const crew = c => Array(c).fill('mp/ger/tankman');
const veh = (name, shooter, foe, x = {}) => ({ name, class: 'vehicle', shooter, crew: crew(5), foe, foeCrew: crew(4), ...x });
// g1 order: ids 1 pz6bh, 7 t34_0, 12 tiger_p, 18 t34_0, 23 pz6e, 29 t34_0, 34 kv1, 40 t34_0, 45 cometa34, 51 t34_0, 56 tiger_p
const G1 = [veh('ctlpz', 'pz6bh', 't34_0', { control: true }), veh('a_tiger', 'tiger_p', 't34_0'), veh('a_pz6e', 'pz6e', 't34_0'), veh('a_kv1', 'kv1_l11_40', 't34_0'), veh('a_comet', 'cometa34', 't34_0'), veh('a_tiger_g', 'tiger_p', 'gaz67b')];
const rep = (line, k) => Array(k).fill(line);
const LOG = [
  ...rep('BLAST[0.2/1-2]: pz6bh[1]/{gun} (0.2) 45->45', 14),
  ...rep('BLAST[0.2/1-2]: tiger_p[12]/{gun} (0.2) 45->45', 2),
  'BLAST[0.2/1-2]: t34_0[18]/{body} (0.00283199) 45->45',
  ...rep('BLAST[0.2/1-2]: pz6e[23]/{gun} (0.2) 45->45', 11),
  ...rep('BLAST[0.2/1-2]: cometa34[45]/{gun} (0.2) 35->35', 16),
  'BLAST[3/3-8]: cometa34[45]/{body} (3) 8->0',
  'BLAST[0.2/1-2]: t34_0[51]/{body} (0.0197869) 45->45',
  'BLAST[0.2/1-2]: t34_0[51]/{trackright} (0.031544) 6->6',
  'BLAST[0.2/1-2]: t34_0[51]/{trackleft} (0.0114321) 6->6',
  'BLAST[0.2/1-2]: tiger_p[56]/{gun} (0.2) 45->45',
].join('\r\n');

// ---- fix 1: every 0.2/ line is a cannon shot ----
t('r1 2.0 (muzzle_large) lines are cannon shots, no MG count is made up', () => {
  const r = e.shotsOf(LOG, G1, true);
  assert.deepStrictEqual(r.bad, []);
  assert.strictEqual(r.rows.ctlpz.shots, 14); assert.strictEqual(r.rows.ctlpz.cannonShots, 14, 'pz6bh is muzzle_large: its 0.2/1-2 lines are the 88');
  assert.strictEqual(r.rows.ctlpz.mgShots, null, 'an MG logs no muzzle line');
  assert.strictEqual(r.rows.a_pz6e.cannonShots, 11); assert.strictEqual(r.rows.a_tiger.cannonShots, 2);
});
t('r1 1.5, 2.0, 2.5 all count the same', () => {
  const p = [veh('a', 'x', 'gaz67b')];
  for (const r1 of ['1.5', '2', '2.5']) {
    const r = e.shotsOf(`BLAST[0.2/1-${r1}]: x[1]/{gun} (0.2) 1->1\nBLAST[0.2/1-${r1}]: x[1]/{gun} (0.2) 1->1`, p, true).rows.a;
    assert.strictEqual(r.shots, 2, 'r1 ' + r1); assert.strictEqual(r.cannonShots, 2, 'r1 ' + r1);
  }
});
t('a blast on the shooter is not a second shot beside its muzzle line', () => {
  const r = e.shotsOf(LOG, G1, true).rows.a_comet;
  assert.strictEqual(r.shots, 16, 'the old split gave 17: 16 "MG" + 1 cannon');
  assert.strictEqual(r.cannonShots, 16);
  assert.strictEqual(r.cannonBlasts, 1);
});
t('foe muzzle-size lines still are not hits', () => {
  assert.strictEqual(e.shotsOf(LOG, G1, true).rows.a_comet.hits, 0);
});
const MUZZLE = { pz6bh: 'muzzle_large', x_med: 'muzzle_medium', x_max: 'muzzle_maximum', x_zen: 'muzzle_zenite', x_min: 'muzzle_minimum', x_sml: 'muzzle_small', x_none: null };
const muzzleOf = d => MUZZLE[d];   // undefined for a def the reader could not read
t('zenite, minimum, small, no prop: shots null with the reason, never 0', () => {
  for (const [def, why] of [['x_zen', 'muzzle_zenite'], ['x_min', 'muzzle_minimum'], ['x_sml', 'muzzle_small'], ['x_none', 'no muzzle prop']]) {
    const r = e.shotsOf('', [veh('a', def, 'gaz67b')], true, { muzzleOf }).rows.a;
    assert.strictEqual(r.shots, null, def); assert.strictEqual(r.cannonShots, null, def); assert.strictEqual(r.noBlast, why, def);
  }
});
t('medium, large, maximum: 0 lines stay a real 0', () => {
  for (const def of ['x_med', 'pz6bh', 'x_max']) {
    const r = e.shotsOf('', [veh('a', def, 'gaz67b')], true, { muzzleOf }).rows.a;
    assert.strictEqual(r.shots, 0, def); assert.strictEqual(r.noBlast, undefined, def);
  }
});
t('a def the reader cannot read: 0 lines is unknown, null', () => {
  const r = e.shotsOf('', [veh('a', 'x_unread', 'gaz67b')], true, { muzzleOf }).rows.a;
  assert.strictEqual(r.shots, null); assert.strictEqual(r.noBlast, 'muzzle prop not read');
});
t('a reader that throws is the same as unread', () => {
  const r = e.shotsOf('', [veh('a', 'x', 'gaz67b')], true, { muzzleOf: () => { throw new Error('no index'); } }).rows.a;
  assert.strictEqual(r.shots, null);
});
t('muzzle lines win over the prop: a counted line is a counted shot', () => {
  const r = e.shotsOf('BLAST[0.2/1-1.5]: x_zen[1]/{gun} (0.2) 1->1', [veh('a', 'x_zen', 'gaz67b')], true, { muzzleOf }).rows.a;
  assert.strictEqual(r.shots, 1); assert.strictEqual(r.noBlast, undefined);
});
t('no-blast gun: foe hits still count, shots stay null', () => {
  const r = e.shotsOf('BLAST[3/3-8]: gaz67b[7]/{body} (3) 8->0', [veh('a', 'x_zen', 'gaz67b')], true, { muzzleOf }).rows.a;
  assert.strictEqual(r.shots, null); assert.strictEqual(r.hits, 1);
});
t('table says why shots are unknown', () => {
  const s = e.table([{ name: 'm8', class: 'vehicle', order: 1, kill: null, shooterDied: false, verdict: 'NOKILL', shots: null, noBlast: 'muzzle_minimum', hits: 0, parts: [] }]);
  assert.ok(/shots \? \(muzzle_minimum\)/.test(s), s);
});
t('the reader reads the prop from a def text, and null when there is none', () => {
  const texts = { a: '{from "x"\n {props "medium" "muzzle_zenite"}\n}', b: '{from "x"\n {props "medium"}\n}' };
  const built = { indexed: true, idx: { stuff: {}, byName: () => [] }, src: {} };
  const rr = pf.makeRangeReader('nogame', [], { built, scan: (kind, def) => texts[def] || null });
  assert.strictEqual(rr.muzzleOf('a'), 'muzzle_zenite'); assert.strictEqual(rr.muzzleOf('b'), null); assert.strictEqual(rr.muzzleOf('c'), undefined);
});

// ---- fix 4: NOORDER names the false term ----
const gun = { name: 'g', class: 'gun', shooter: 'bl45_pol', crew: crew(4), foe: 'gaz67b', foeCrew: crew(3), dist: 141 };
t('the mission carries one marker per term of the order row', () => {
  const m = e.buildMission([gun], 'rX', {});
  const row = k => m.split(/\r?\n/).find(l => l.includes(`"p_g_${k}"`)) || '';
  assert.ok(/EDRUN rX g foeready/.test(row('fr')), 'foe marker');
  assert.ok(/\{tag g_f\} \{state moveable\}/.test(row('fr')), row('fr'));
  assert.ok(/EDRUN rX g shooterready/.test(row('sr')), 'shooter marker');
  assert.ok(/\{tag g_s\} \{state operatable\}/.test(row('sr')), row('sr'));
});
const ch = times => ({ pipeLines: [], logText: '', times: { start: 10, ...times } });
const term = times => e.rowsOf([gun], ch(times))[0];
t('NOORDER: the term that never came is named', () => {
  const a = term({ 'g foeready': 12 });
  assert.strictEqual(a.verdict, 'NOORDER'); assert.strictEqual(a.noOrder.falseTerm, 'shooter operatable'); assert.strictEqual(a.noOrder.foeReady, 2); assert.strictEqual(a.noOrder.shooterReady, null);
  assert.ok(/false at the end: shooter operatable/.test(a.note), a.note);
  assert.strictEqual(term({ 'g shooterready': 15 }).noOrder.falseTerm, 'foe moveable');
  assert.strictEqual(term({}).noOrder.falseTerm, 'foe moveable, shooter operatable');
  assert.strictEqual(term({ 'g foeready': 12, 'g shooterready': 15 }).noOrder.falseTerm, 'none always false: each was true once, not together');
});
t('a pair with an order has no noOrder field', () => {
  const a = term({ 'g foeready': 12, 'g shooterready': 12, 'g order': 12 });
  assert.strictEqual(a.verdict, 'NOKILL'); assert.strictEqual(a.noOrder, undefined);
});

// ---- fix 5: the marginal band, tiger_p vs t34_0, min 182.3 (SILENT-1: 210 barely fires, 230 8 shots, 260 11) ----
const marg = d => pf.check([veh('p', 'tiger_p', 't34_0', { dist: d })], e.layout, { minOf: () => ({ min: 182.3, by: 'depression', reach: 100, ground: 182.3, D: 7 }), rangeOf: () => ({ unknown: 'x' }) }).p.warns.some(w => /marginal/.test(w));
t('marginal warns at 210, not at 230 or 260', () => {
  assert.strictEqual(marg(210), true, '210 barely fires'); assert.strictEqual(marg(230), false, '230 fires'); assert.strictEqual(marg(260), false, '260 fires');
});
t('the default dist stays inside the gun range', () => {
  const opt = { minOf: () => ({ min: 145.4 }), rangeOf: Object.assign(() => ({ weapon: 'w', aim: 8, max: 8 })   /* metres: 8 m = 160 units */, {}) };
  const r = e.preflightChunk([{ name: 'p', class: 'vehicle', shooter: 'x', crew: crew(4), foe: 'gaz67b', foeCrew: crew(3) }], opt);
  assert.strictEqual(r.run.length, 1, 'held: ' + JSON.stringify(r.held.map(h => h.r.notes)));
  assert.strictEqual(r.run[0].dist, 160);
  // a 160 m gun does not cap the 181-unit default (VOL-nH units vs metres)
  const o2 = { minOf: () => ({ min: 145.4 }), rangeOf: () => ({ weapon: 'w', aim: 160, max: 160 }) };
  assert.strictEqual(e.preflightChunk([{ name: 'p', class: 'vehicle', shooter: 'x', crew: crew(4), foe: 'gaz67b', foeCrew: crew(3) }], o2).run[0].dist, 182);
});

if (bad) { console.error(`silent1f: ${bad} failed, ${n} passed`); process.exit(1); }
console.log(`silent1f: ${n} passed`);
