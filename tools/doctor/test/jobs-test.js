// MEM-PLAN (doctor/jobs.js): the RAM plan's pool with fake tools and fake estimates: the running estimates stay under the budget
// (one too big runs alone), biggest first, small ones fill in, -j cap, a held job (reuse miss) joins later; estimate from lib/registry mem.
// Author: Imperator_Aug (ARSENAL, ia-c1e1edd7)
const assert = require('assert'), J = require('../jobs'), reg = require('../../lib/registry');
const MB = 1048576, fails = [];
const t = (name, f) => f().then(() => console.log('ok   ' + name), e => { fails.push(name); console.log('FAIL ' + name + ': ' + (e && e.message)); });
// run a plan: each fake job takes `ms` (by name), log start/done, track the running sum
function sim(sizes, cap, budget, opt = {}) {
  const log = [], est = n => sizes[n] * MB;
  let used = 0, n = 0, maxUsed = 0, maxN = 0, over = [];
  const run = ([name]) => new Promise(res => {
    used += est(name); n++; maxN = Math.max(maxN, n); maxUsed = Math.max(maxUsed, used);
    if (n > 1 && used > budget) over.push(name);
    log.push('start ' + name);
    setTimeout(() => { used -= est(name); n--; log.push('done ' + name); res({ tool: name }); }, (opt.ms && opt.ms[name]) || 5);
  });
  const got = [], p = J.schedule(Object.keys(sizes).filter(k => !(opt.later || []).includes(k)).map(k => [k, []]), { cap, budget, est, run, onDone: r => got.push(r.tool) });
  for (const k of opt.later || []) { p.hold(); setTimeout(() => p.release([k, []]), 12); }
  return p.start().then(peak => ({ log, got, peak, maxN, maxUsed, over }));
}
(async () => {
  const S = { sdllint: 3300, milint: 2100, keylint: 2000, humlint: 1700, vfs: 650, uilint: 650, lnglint: 150, modinfo: 80 };
  await t('biggest first, never over budget beside another, all run', async () => {
    const r = await sim(S, 8, 3000 * MB);
    assert.equal(r.log[0], 'start sdllint');
    assert.deepEqual(r.over, [], 'over budget: ' + r.over);
    assert.equal(r.got.length, 8);
    assert.equal(r.log.indexOf('done sdllint') < r.log.indexOf('start milint'), true, 'sdllint (> budget) runs alone: ' + r.log);
  });
  await t('small ones fill in beside a big one', async () => {
    const r = await sim(S, 8, 3000 * MB, { ms: { milint: 40 } });
    const i = r.log.indexOf('start milint'), j = r.log.indexOf('done milint'), beside = r.log.slice(i, j).filter(l => l.startsWith('start '));
    assert(beside.includes('start vfs') && beside.includes('start lnglint'), 'fill-ins beside milint: ' + beside);
    assert(!beside.includes('start keylint'), 'keylint does not fit beside milint');
  });
  await t('plenty of RAM: -j caps', async () => {
    const r = await sim(S, 3, 1e6 * MB);
    assert.equal(r.maxN, 3); assert.equal(r.peak, 3);
    assert.deepEqual(r.log.slice(0, 3), ['start sdllint', 'start milint', 'start keylint']);
  });
  await t('tiny RAM: one at a time, biggest first', async () => {
    const r = await sim(S, 8, 1 * MB);
    assert.equal(r.maxN, 1);
    assert.deepEqual(r.log.filter(l => l.startsWith('start')).map(l => l.slice(6)), Object.keys(S));
  });
  await t('held job (reuse miss) joins the pool, pool waits for it', async () => {
    const r = await sim({ a: 100, b: 100, sdllint: 500 }, 2, 1e6 * MB, { later: ['sdllint'], ms: { a: 30 } });
    assert(r.got.includes('sdllint') && r.got.length === 3, r.got);
  });
  await t('describe: limited, most at once, list biggest first', async () => {
    const est = n => S[n] * MB, d = J.describe(Object.keys(S), est, 8, 3000 * MB);
    assert.equal(d.limited, true); assert(/^sdllint 3460, milint/.test(d.list), d.list);
    assert.equal(d.most, 4);   // 80 + 150 + 650 + 650 MB fit, + 1700 does not
    assert.equal(J.describe(Object.keys(S), est, 3, 1e6 * MB).limited, false);
  });
  await t('estimate: registry mem x 1.5 over text files; every doctor tool has a mem row', async () => {
    for (const e of reg.forDoctor()) assert(e.mem && e.mem.base > 0, 'mem of ' + e.name);
    const m = reg.byName('sdllint').mem, c = { all: 50000, text: 30000, bin: 20000 };
    assert.equal(J.estimate('sdllint', c), Math.round(1.5 * (m.base * MB + m.text * 1024 * 30000)));
    assert.equal(J.estimate('no-such-tool', c), 150e6 + 12288 * 50000);   // no row: the old guess
  });
  console.log(fails.length ? 'FAIL ' + fails.length : 'PASS');
})();
