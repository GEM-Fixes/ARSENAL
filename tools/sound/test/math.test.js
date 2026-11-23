// play.src.js maths: page-script rules, browser load (window.SNDMATH), gain curve, low pass, listener, pan, volume, rate, voice limit.
// node tools/sound/test/math.test.js [scratch]  -> PASS last. Author: Imperator_Aug (ARSENAL)
// Author: Imperator_Aug (ARSENAL, ia-c6de132a)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const M = require('../play.src');
let n = 0, bad = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { bad++; console.log('FAIL ' + name + ': ' + e.message); } };
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= (eps || 1e-9), (msg || '') + ' ' + a + ' != ' + b);

t('page-script rules: ES5, no require, no backtick, no dollar-brace, no innerHTML', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'play.src.js'), 'utf8');
  assert.ok(!src.includes('`'), 'backtick'); assert.ok(!src.includes('${'), 'dollar-brace');
  const code = src.replace(/\/\/[^\n]*/g, '');
  assert.ok(!/innerHTML/.test(code), 'innerHTML');
  assert.ok(!/\brequire\s*\(/.test(code), 'require'); assert.ok(!/(^|[^.\w])(let|const|class)\s/.test(code), 'let/const/class'); assert.ok(!code.includes('=>'), 'arrow');
  const win = {};
  vm.runInNewContext(src, { window: win, Math });
  assert.equal(typeof win.SNDMATH.gainAt, 'function'); assert.equal(win.SNDMATH.UNITS_PER_METER, 20);
  assert.equal(win.SNDMATH.gainAt(40, 20, 0, 1), M.gainAt(40, 20, 0, 1));
});
t('miles distances and gain curve', () => {
  assert.deepEqual(M.milesDistances(0, 0), { min: 1, max: 1e38 }); assert.deepEqual(M.milesDistances(-3, 400), { min: 1, max: 400 });
  assert.equal(M.gainAt(5, 10, 100, 1), 1); assert.equal(M.gainAt(10, 10, 100, 1), 1);
  near(M.gainAt(20, 10, 100, 1), 0.5); near(M.gainAt(40, 10, 100, 1), 0.25); near(M.gainAt(20, 10, 100, 2), 1 / 3);
  assert.equal(M.gainAt(101, 10, 100, 1), 0); assert.ok(M.gainAt(1e6, 10, 0, 1) > 0); assert.ok(M.gainAt(1e6, 10, 1e38, 1) > 0);
  assert.equal(M.gainAt(50, 10, 100, 0), 1);
  // monotone non-increasing
  let last = 2; for (let d = 0; d < 100; d += 0.5) { const g = M.gainAt(d, 3, 100, 1); assert.ok(g <= last); last = g; }
});
t('distance low pass', () => {
  assert.equal(M.lowPassCutoff(5, 10), 0.5); assert.equal(M.lowPassCutoff(5, 2), 1); assert.equal(M.lowPassCutoff(5, 0), 1);
  assert.equal(M.lowPassCutoff(0, 10), 0); assert.ok(Number.isNaN(M.lowPassCutoff(0, 0)));
  assert.equal(M.lowPassCoefs(1, 44100), null); assert.equal(M.lowPassCoefs(NaN, 44100), null);
  const c = M.lowPassCoefs(0.5, 44100); near(c.hz, 11025);
  near((c.b0 + c.b1 + c.b2) / (1 + c.a1 + c.a2), 1, 1e-9, 'DC gain');
  near(M.lowPassCoefs(0, 22050).hz, 10);
});
t('listener position, front, bearing, pan', () => {
  assert.equal(M.listenerAlong(0), 0.1); assert.equal(M.listenerAlong(-1), 0.1); assert.equal(M.listenerAlong(Math.PI / 2), 0.9); near(M.listenerAlong(Math.PI / 4), 0.5);
  const p = M.listenerPosition([0, 0, 10], [0, 0, 0], 0); near(p[2], 9); near(M.listenerPosition([0, 0, 10], [10, 0, 0], Math.PI / 2)[0], 9);
  assert.deepEqual(M.listenerFront([0, 0, -1]), [0, 0, 1]); const f = M.listenerFront([3, 4, -5]); near(f[0], 0.6); near(f[1], 0.8); assert.equal(f[2], 0);
  near(M.bearingDeg([0, 0, 0], [0, 1, 0], [1, 0, 0]), 90); near(M.bearingDeg([0, 0, 0], [0, 1, 0], [-1, 0, 0]), -90); near(M.bearingDeg([0, 0, 0], [0, 1, 0], [0, 5, 0]), 0);
  assert.equal(M.bearingDeg([1, 1, 0], [0, 1, 0], [1, 1, 7]), 0);
  near(M.pan(90), 1); near(M.pan(-90), -1); near(M.pan(0), 0); near(M.pan(180), 0, 1e-12);
  const c = M.panGains(0); near(c.left, 1, 1e-12); near(c.right, 1, 1e-12);
  const r = M.panGains(1); near(r.left, 0, 1e-12); near(r.right, 1, 1e-12);
  const h = M.panGains(0.5); assert.ok(h.right === 1 && h.left < 1 && h.left > 0);
  near(M.distance([0, 0, 0], [3, 4, 12]), 13);
});
t('volumes and rate', () => {
  assert.equal(M.groupVolume(100, 50), 0.5); near(M.groupVolume(80, 40), 0.32);
  assert.equal(M.channelVolume(3, 0.5), 1); assert.equal(M.channelVolume(0.5, 0.5), 0.25); assert.equal(M.channelVolume(1, 0.5, 1, 0), 0); assert.equal(M.channelVolume(-1, 0.5), 0);
  assert.equal(M.ambientVolume(0.5), 0.5); assert.equal(M.ambientVolume(2), 1);
  assert.equal(M.rateFactor(2000, 1), 2); assert.equal(M.rateFactor(2000, 0), 1); near(M.rateFactor(1500, 3), 0.5);
});
t('voice limit: weight, rank, compare, group budget, copies', () => {
  assert.equal(M.candidateWeight(1, 5), 1); near(M.candidateWeight(10, 5), 0.25); near(M.candidateWeight(5, 5), 0.5);
  near(M.playedFraction(500, 1000, 2), 1); assert.equal(M.playedFraction(10, 0, 2), 0); near(M.playedFraction(250, 1000), 0.25);
  assert.deepEqual(M.candidateRank(true, 0.7, 900, 4), { order: 0.7, priority: 4 });
  assert.deepEqual(M.candidateRank(false, 0, 0, 4), { order: 5e37, priority: 4 });
  assert.deepEqual(M.candidateRank(false, 0.6, 50, 4), { order: 0.6, priority: 0 });
  assert.deepEqual(M.candidateRank(false, 0.1, 300, 4), { order: 1e38, priority: 4 });
  assert.deepEqual(M.candidateRank(false, 0.1, 100, 4), { order: 0.1, priority: 4 });
  const C = (weight, priority, order, loop, serial) => ({ weight, priority, order, loop, serial });
  assert.equal(M.compareCandidates(C(1, 0, 0, false, 0), C(0.5, 9, 0, false, 1)), -1);
  assert.equal(M.compareCandidates(C(1, 0, 0, false, 0), C(1, 2, 0, false, 1)), 1);
  assert.equal(M.compareCandidates(C(1, 2, 0.1, false, 5), C(1, 2, 0.3, false, 1)), -1);
  assert.equal(M.compareCandidates(C(1, 2, 0.9, true, 1), C(1, 2, 0.1, false, 5)), -1);   // a loop involved: serial decides
  assert.equal(M.compareCandidates(C(1, 2, 0.1, false, 1), C(1, 2, 0.1, false, 5)), 0);
  assert.equal(M.groupFree(20, 0.2, 1000), 4); assert.equal(M.groupFree(2, 0.2, 1000), 1); assert.equal(M.groupFree(100, 0.5, 10), 10);
  assert.equal(M.groupFree(16, 0.15, 2), 2); assert.equal(M.groupFree(16, 0.1, 1), 1); assert.equal(M.groupFree(56, 0.45, 1000), 25);
  assert.deepEqual(M.copyAdmit([], 0), { ok: true, reason: null }); assert.equal(M.copyAdmit([0], 30).reason, 'anti-reverb');
  assert.equal(M.copyAdmit([0], 50).ok, true); assert.equal(M.copyAdmit([0, 100, 200], 400).reason, 'max-copies'); assert.equal(M.copyAdmit([0, 100], 400, 2).reason, 'max-copies');
});

console.log(`${n} ok, ${bad} failed`);
console.log(bad ? 'FAIL' : 'PASS');
if (bad) process.exitCode = 1;
