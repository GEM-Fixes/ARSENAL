// REVHARNESS seeded tests, no game: rev-harness findings 1, 3, 4, 6, 7, 8, 16, the edctl owed conditional early re-issue, and reproof1 (a) (b) (c). node revharness-test.js
// Author: Imperator_Aug (ARSENAL, ia-4c0dae29)
const assert = require('assert');
const e = require('../edrun.js');
let n = 0; const fail = [];
const t = (name, f) => { try { f(); n++; } catch (x) { fail.push(name + ': ' + x.message); } };
const row = (m, name) => (m.split('\n').find(l => l.includes(`{"${name}" `)) || '');
const crew = ['mp/ger/tankman', 'mp/ger/tankman'];
const tank = { name: 'a', class: 'vehicle', shooter: 'pz6bh', crew, foe: 't34_0', foeCrew: crew };
const BLAST_ON = ['dbg_blast = 1'];

t('F1: proof and fireProof mix per cell, held-only kills apart', () => {
  const cs = e.cellSummary([
    { name: 'a', foe: 'x', verdict: 'PASS', counted: true, proof: 'muzzle', fireProof: 'muzzle' },
    { name: 'a', foe: 'x', verdict: 'PASS', counted: true, proof: 'hp', fireProof: 'held' },
    { name: 'a', foe: 'x', verdict: 'PASS', counted: false, proof: 'deathblast', fireProof: 'hit', killVerdict: 'KILL_UNPROVEN' },
    { name: 'a', foe: 'x', verdict: 'NOKILL', counted: false }]);
  assert.deepStrictEqual(cs[0].proof, { muzzle: 1, hp: 1, deathblast: 1 });
  assert.deepStrictEqual(cs[0].fire, { muzzle: 1, held: 1, hit: 1 });
  assert.strictEqual(cs[0].heldOnly, 1);
  const ls = e.summaryLines(cs);
  assert.ok(/heldOnly 1 .*proof \[muzzle 1, hp 1, deathblast 1\] fire \[muzzle 1, held 1, hit 1\]/.test(ls[0]), ls[0]);
  // seeded defect: the old summary printed none of it
  assert.ok(!/proof|heldOnly/.test('cell a: kills 2/4 wilson95 0.15-0.85 unproven 1'));
});
t('F3: edge cells and a total line with Wilson', () => {
  assert.strictEqual(e.edgeOf(2, 4), true, '2/4 passes, 1/4 fails');
  assert.strictEqual(e.edgeOf(1, 4), true, '1/4 fails, 2/4 passes');
  assert.strictEqual(e.edgeOf(6, 6), false); assert.strictEqual(e.edgeOf(0, 6), false);
  assert.strictEqual(e.edgeOf(3, 6), true, '3/6 passes, 3/7 fails'); assert.strictEqual(e.edgeOf(4, 6), false);
  const rs = (name, k, nn) => Array.from({ length: nn }, (_, i) => ({ name, foe: 'x', verdict: i < k ? 'PASS' : 'NOKILL', counted: i < k }));
  const cs = e.cellSummary([...rs('a', 3, 6), ...rs('b', 6, 6)]);
  assert.strictEqual(cs[0].edge, true); assert.strictEqual(cs[1].edge, undefined);
  const ls = e.summaryLines(cs), tot = e.totalOf(cs);
  assert.ok(/cell a: .* EDGE/.test(ls[0]) && !/EDGE/.test(ls[1]));
  assert.deepStrictEqual([tot.kills, tot.runs, tot.edge], [9, 12, 1]); assert.deepStrictEqual(tot.ci, e.wilson(9, 12));
  assert.ok(/^total: kills 9\/12 wilson95 [\d.]+-[\d.]+ cells 2 edge 1/.test(ls[2]), ls[2]);
});
t('F4: hitsLive leaves out death and own-ammo blast kinds', () => {
  const ch = { times: { start: 0, 'a order': 2 }, ticks: {}, logText: '', pipeLines: BLAST_ON };
  // no BLAST lines: hits 0, hitsLive 0
  const [r] = e.rowsOf([tank], ch, null, {});
  assert.strictEqual(r.hitsLive, 0);
  // seeded: hitKinds with a death kind and a blastwave kind; the old hits count adds both
  const live = Object.entries({ '3/3-8': 2, '10/7-8': 1, '1.2/1.35-2.7': 3 }).reduce((s, [k, v]) => s + (e.isDeathKind(k) ? 0 : v), 0);
  assert.strictEqual(live, 3);
});
t('F6: free-fire NOKILL with no shot, hit, part or HEALTH loss is void, not a run', () => {
  const ff = e.freeFireOf(tank);
  const ch = { times: { start: 0, 'a order': 2 }, ticks: {}, logText: '', pipeLines: BLAST_ON };
  const [r] = e.rowsOf([ff], ch, null, {});
  assert.strictEqual(r.verdict, 'NOKILL'); assert.strictEqual(r.shotsRead, true); assert.strictEqual(r.engaged, false);
  const cs = e.cellSummary([r, { ...r, engaged: undefined }]);
  assert.deepStrictEqual([cs[0].runs, cs[0].void], [1, 1]);
  // not measured (no cvar): cannot judge, stays a run
  const [u] = e.rowsOf([ff], { ...ch, pipeLines: [] }, null, {});
  assert.strictEqual(u.engaged, undefined);
  // under order (not free fire): a NOKILL is a fail as before
  const [o] = e.rowsOf([tank], ch, null, {});
  assert.strictEqual(o.engaged, undefined);
});
t('F7: an uncounted control PASS voids the game; unprovable (log off) is weak, not void', () => {
  const c = (o) => ({ name: 'ctl', control: true, class: 'vehicle', verdict: 'PASS', ...o });
  // seeded defect: old rule kept the game on any PASS
  const over = e.controlsOf([c({ counted: false, countReason: 'overcap', proofLogs: { blast: true, health: false } })]);
  assert.strictEqual(over.void, true, 'overcap control voids');
  assert.strictEqual(e.controlsOf([c({ counted: false, countReason: 'unproven: none', proofLogs: { blast: true, health: true } })]).void, true, 'unproven with blast on voids');
  const weak = e.controlsOf([c({ counted: false, countReason: 'unproven: none', proofLogs: { blast: false, health: false } })]);
  assert.deepStrictEqual([weak.void, weak.weak, weak.controls[0].weak], [false, true, true], 'blast off: weak');
  const inf = e.controlsOf([c({ class: 'infantry', counted: false, countReason: 'unproven: deathblast', proofLogs: { blast: true, health: false } })]);
  assert.deepStrictEqual([inf.void, inf.weak], [false, true], 'infantry control, dbg_health off: weak');
  const ok = e.controlsOf([c({ counted: true, proofLogs: { blast: true, health: true } }), c({ name: 'c2', counted: false, countReason: 'unproven: none', proofLogs: { blast: false } })]);
  assert.deepStrictEqual([ok.void, ok.weak], [false, undefined], 'one counted control: full');
  assert.strictEqual(e.controlsOf([c({})]).void, false, 'old row with no counted: verdict rule');
});
t('F7: rowsOf stamps proofLogs on control rows', () => {
  const ctl = { ...tank, control: true };
  const ch = { times: { start: 0, 'a order': 2 }, ticks: {}, logText: '', pipeLines: BLAST_ON };
  assert.deepStrictEqual(e.rowsOf([ctl], ch, null, { hpOn: true })[0].proofLogs, { blast: true, health: true });
  assert.strictEqual(e.rowsOf([tank], ch, null, {})[0].proofLogs, undefined);
});
t('F8: gun foe gets wrecked rows; row splits crew left from wrecked', () => {
  const gun = { name: 'g', class: 'vehicle', shooter: 'pz6bh', crew, foe: 'zis3', foeClass: 'gun', foeCrew: crew };
  const m = e.triggers([gun], 'rH');
  assert.ok(row(m, 'p_g_wk').includes('destroyed_components') && row(m, 'p_g_wk').includes('EDRUN rH g wrecked'));
  assert.ok(row(m, 'p_g_wd').includes('{tag g_f} {state dead}'));
  assert.ok(!row(e.triggers([tank], 'rH'), 'p_a_wk'), 'vehicle foe: no wrecked row');
  assert.ok(!row(e.triggers([{ ...gun, mark: 'dead' }], 'rH'), 'p_g_wk'), 'gun with its own mark: no wrecked row');
  const base = { times: { start: 0, 'g order': 2, 'g kill': 8 }, ticks: {}, logText: '', pipeLines: [] };
  assert.deepStrictEqual((r => [r.gunKill, r.foeWrecked])(e.rowsOf([gun], base, null, {})[0]), ['crew left', null]);
  assert.deepStrictEqual((r => [r.gunKill, r.foeWrecked])(e.rowsOf([gun], { ...base, times: { ...base.times, 'g wrecked': 9 } }, null, {})[0]), ['wrecked', 9]);
});
t('F16: rows in pairs-file order with the game index, held rows in their own slot', () => {
  const run = [{ name: 'a' }, { name: 'c' }], held = [{ name: 'b', held: true }];
  // seeded defect: the old order put held rows after the run rows
  assert.deepStrictEqual([...run, ...held].map(r => r.name), ['a', 'c', 'b']);
  const g = e.gameOrder([...run, ...held], ['a', 'b', 'c'], 2);
  assert.deepStrictEqual(g.map(r => r.name + r.game), ['a2', 'b2', 'c2']);
  assert.deepStrictEqual(e.gameOrder(held, ['b'], null).map(r => r.game), [null]);
});
t('edctl owed: earlyIf idle gates the early re-issue on no running attack order', () => {
  const inf = { name: 'i', class: 'infantry', shooter: 'mp/ger/rifle', foe: 'mp/rus/rifle' };
  const plain = e.triggers([inf], 'rH'), idle = e.triggers([{ ...inf, earlyIf: 'idle' }], 'rH');
  // default unchanged: early re-issue inside the order chain
  assert.ok(/\{"delay" \{time 5\}\} \{"con" \{text "EDRUN rH i reorder 0"\}\}/.test(row(plain, 'p_i')));
  assert.ok(!row(plain, 'p_i_er'));
  // idle: chain starts at 120, the early order sits in its own gated row
  assert.ok(!/reorder 0/.test(row(idle, 'p_i')), 'no ungated early order');
  assert.ok(/\{"delay" \{time 120\}\} \{"con" \{text "EDRUN rH i reorder 1"\}\}/.test(row(idle, 'p_i')));
  assert.ok(row(idle, 'p_i_ew').includes('{"delay" {time 5}} {"trigger" {name "p_i_et"} {on 1}}'));
  const er = row(idle, 'p_i_er');
  assert.ok(er.includes('{expression "1 & !2 & 3"}') && er.includes('{"2.trigger" {name "p_i_k"}}') && er.includes('{order "eAttackBySelector"}') && er.includes('{op "="} {value 0}'), er);
  assert.ok(er.includes('reorder 0') && er.includes('actor_fire'));
  // control and once pairs: no early at all, idle or not
  assert.ok(!row(e.triggers([{ ...inf, control: true, earlyIf: 'idle' }], 'rH'), 'p_i_er'));
  assert.ok(e.validate([{ ...inf, earlyIf: 'always' }]).some(s => /earlyIf/.test(s)), 'bad earlyIf value');
  assert.strictEqual(e.earlyIdleOf({ earlyIf: 'idle' }), true); assert.strictEqual(e.earlyIdleOf({}), false);
});

// reproof1 (a): a static move pair with a kill mark gets its own moved row and an arrived row on the order, not on the kill; a plain move pair keeps the old rows
t('reproof1 a: static move pair moved/arrived', () => {
  const p = { ...tank, name: 'm', foe: 'rp1_fence', foeCrew: undefined, static: true, mark: 'destroyed', move: { dy: 800 } };
  const m = e.triggers([p], 'rH');
  const mv = row(m, 'p_m_mv');
  assert.ok(mv.includes('EDRUN rH m moved') && !mv.includes(' kill"') && mv.includes('{near_to {tag m_m}}') && mv.includes('{expression "1 & 2 & !3"}'), mv);
  assert.ok(row(m, 'p_m_a').includes('{"1.trigger" {name "p_m"}}'), row(m, 'p_m_a'));
  assert.ok(row(m, 'p_m_k').includes('m kill'), 'the kill row stays');
  const plain = e.triggers([{ name: 'w', class: 'vehicle', shooter: 'pz6bh', crew, move: { dy: 800 } }], 'rH');
  assert.ok(!row(plain, 'p_w_mv') && row(plain, 'p_w_a').includes('{name "p_w_k"}'), 'moved-mark pair unchanged');
});
// reproof1 (a): the ground row drops the queued attack order, then aims the weapon direct; its waypoint stands GROUND_UP over the ground
t('reproof1 a: ground order drops the queue and aims direct', () => {
  const p = { ...tank, name: 'g', foe: 'rp1_shed', foeCrew: undefined, static: true, mark: 'destroyed', ground: 3 };
  const mm = e.buildMission([p], 'rH', {}), gr = row(mm, 'p_g_gr');
  assert.ok(/\{"actor_fire" \{selector \{tag g_s\}\} \{drop orders\} \{attack position\} \{waypoint "940"\}\}/.test(gr), gr);
  assert.ok(/\{only_weapon \{use 1\}\}/.test(gr), 'direct aim');
  assert.ok(/\{"940" \{position [-\d.]+ [-\d.]+ 0\} \{radius 20\}\}/.test(mm), 'REPROOF-4: no waypoint offset by default');
  assert.ok(/\{"940" \{position [-\d.]+ [-\d.]+ 0\} \{radius 20\} \{offset 20\}\}/.test(e.buildMission([p], 'rH', { wpOffset: true })), 'waypoint offset with --wp-offset');
  assert.strictEqual((mm.match(/\{/g) || []).length, (mm.match(/\}/g) || []).length, 'braces');
});
// reproof1 (c): --close on a move pair with a foe looks at the foe; a move pair with no foe still looks ahead on its path
t('reproof1 c: close view on the foe of a move pair', () => {
  const p = { ...tank, name: 'tc', foe: 'rp1_birch', foeCrew: undefined, static: true, mark: 'fallen', move: { dy: 800 } };
  const mm = e.buildMission([p], 'rH', { close: { name: 'tc', dist: 700 } }), L = e.layout(p, 0);
  const la = (mm.match(/\{look_at ([-\d.]+) ([-\d.]+) /) || []).slice(1).map(Number);
  assert.deepStrictEqual(la, [L.f.x, L.f.y], 'look_at ' + la + ' foe ' + L.f.x + ',' + L.f.y);
  const w = { name: 'w', class: 'vehicle', shooter: 'pz6bh', crew, move: { dy: 800 } }, s = e.layout(w, 0).s;
  const lw = (e.buildMission([w], 'rH', { close: { name: 'w', dist: 190 } }).match(/\{look_at ([-\d.]+) ([-\d.]+) /) || []).slice(1).map(Number);
  assert.deepStrictEqual(lw, [s.x, s.y + 150], 'no foe: 150 ahead');
});
// reproof1 (b): no reply to a --pipe command is named
t('reproof1 b: pipeMissedOf', () => {
  const r = id => JSON.stringify({ type: 'reply', id, ok: true, output: [] });
  assert.deepStrictEqual(e.pipeMissedOf(['dbg_blast 1', 'dbg_health 1'], [r(1), r(2), r(3)]), []);
  assert.deepStrictEqual(e.pipeMissedOf(['dbg_blast 1', 'dbg_health 1'], []), ['dbg_blast 1', 'dbg_health 1']);
  assert.deepStrictEqual(e.pipeMissedOf(['dbg_blast 1', 'dbg_health 1'], [r(1), r(3), 'junk']), ['dbg_blast 1']);
});

// reproof1 (b): the pipe opens late (a slow load). A fixed short cap (the old 60 s against a 64 s load, scaled down) gives up; the alive predicate keeps trying and gets the replies
// the pipe opens only after the capped try gave up (by the event, not a race against a timer); the alive predicate's 60 s and the reply wait
// are backstops (WAIT line, then the asserts report)
async function lateServer() {
  const net = require('net'), Wt = require('../../lib/test/wait'), name = '\\\\.\\pipe\\edrun-revharness-' + process.pid;
  let srv = null, open = null;
  const listen = () => {
    srv = net.createServer(c => {
      let b = '';
      c.on('data', d => { b += d; let i; while ((i = b.indexOf('\n')) >= 0) { const j = JSON.parse(b.slice(0, i)); b = b.slice(i + 1); c.write(JSON.stringify({ type: 'reply', id: j.id, ok: true, output: [j.cmd + ' = 1'] }) + '\n'); } });
    }).listen(name);
  };
  try {
    const capped = await e.pipeTalk(['s_version'], () => {}, 300, { name });
    assert.strictEqual(capped, null, 'seeded defect: the short cap gives up before the pipe opens');
    open = setTimeout(listen, 900);
    const lines = [], t0 = Date.now();
    const s = await e.pipeTalk(['s_version', 'dbg_blast 1'], l => lines.push(l), () => Date.now() - t0 < 60000 || (Wt.say('edrun revharness', 'late pipe connect', 60000), false), { name });
    assert.ok(s, 'alive predicate connects once the pipe opens');
    await Wt.until(() => lines.length >= 2, { who: 'edrun revharness', what: '2 pipe replies' });
    s.destroy();
    assert.deepStrictEqual(e.pipeMissedOf(['dbg_blast 1'], lines), [], lines.join('|'));
    n++;
  } catch (x) { fail.push('reproof1 b: late pipe: ' + x.message); }
  clearTimeout(open);
  if (srv) srv.close();
}

lateServer().then(() => {
  if (fail.length) { console.error('FAIL\n' + fail.join('\n')); process.exit(1); }
  console.log('PASS revharness ' + n);
});
