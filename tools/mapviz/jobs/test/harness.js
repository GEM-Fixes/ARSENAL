// jobs test harness: scratch dir, ARSENAL_CACHE inside it, check counting, the PASS / FAIL last line (README 9.4).
// harness(name) -> {W, ok(cond, what), eq(a, b, what), throwsCode(fn, code, what), rejectsCode(promise, code, what), skip(what),
//   note(text), end(), sleep(ms), flush(), until(fn, ms) -> Promise<bool> (backstop at least 60 s, WAIT line on stderr)}
// Author: Imperator_Aug (ARSENAL, ia-c0e3e761)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

module.exports = function harness(name) {
  const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-' + name + '-')));
  fs.mkdirSync(W, { recursive: true });
  // README 9.4: the cache lives inside the scratch dir; an inherited ARSENAL_CACHE is kept only when it is inside W
  // (run.sh sets one per suite), never a real cache elsewhere (cache.test.js clears its root)
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W + path.sep) ? path.resolve(c) : path.join(W, 'cache');
  let pass = 0, fail = 0;
  const h = {
    W,
    ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz ' + name + ': ' + what); } return !!c; },
    eq(a, b, what) {
      const x = JSON.stringify(a), y = JSON.stringify(b);
      return h.ok(x === y, what + ' (got ' + (x && x.length > 300 ? x.slice(0, 300) + '...' : x) + ', want ' + y + ')');
    },
    throwsCode(fn, code, what) {
      try { fn(); } catch (e) { return h.ok(e && e.code === code, what + ' (threw ' + (e && e.code) + ': ' + (e && e.message) + ')'); }
      return h.ok(false, what + ' (did not throw)');
    },
    async rejectsCode(p, code, what) {
      try { await p; } catch (e) { return h.ok(e && e.code === code, what + ' (threw ' + (e && e.code) + ': ' + (e && e.message) + ')'); }
      return h.ok(false, what + ' (did not throw)');
    },
    skip(what) { console.log('skip ' + what); },
    note(t) { console.log(t); },
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    async flush() { for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r)); },
    // until: by time, backstop at least 60 s whatever ms the caller names (a busy PC); then a WAIT line and the caller's check
    // reports. Never a hang.
    async until(fn, ms) {
      const lim = Math.max(ms || 0, 60000), end = Date.now() + lim;
      while (Date.now() < end) { if (fn()) return true; await new Promise(r => setTimeout(r, 10)); }
      if (fn()) return true;
      process.stderr.write('WAIT mapviz ' + name + ': not met after ' + lim / 1000 + ' s: ' + String(fn).replace(/\s+/g, ' ').slice(0, 120) + '\n');
      return false;
    },
    end() {
      if (fail) { console.log('FAIL mapviz ' + name + ': ' + fail + ' of ' + (pass + fail) + ' checks failed'); process.exit(1); }
      console.log('PASS mapviz ' + name + ' (' + pass + ')');
    },
  };
  return h;
};
