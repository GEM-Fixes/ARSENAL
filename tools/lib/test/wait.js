// Waits for tests (owner rule 2026-11-25: any strict time limit in a test has backup handling; a test never fails only because
// the PC was slow or busy, and never hangs). Wait on the real event; keep one long backstop (60 s for a condition, 5 min for a
// child program); at the backstop say one line "WAIT <who>: <what> not done after N s" on stderr and take the backup path:
// a child program runs once more with twice the limit, a condition or a promise lets the assert after it report what is missing.
// Models: gui/ext/units/fakedom.js settle(), gui/ext/share/pagecheck.js settle(cond), gui/ext/missions/test.js until().
// Author: Imperator_Aug (ARSENAL, ia-c1c406d3)
'use strict';
const cp = require('child_process');
const COND_MS = 60000, CHILD_MS = 300000;
const say = (who, what, ms) => process.stderr.write('WAIT ' + (who || 'test') + ': ' + String(what || 'a step').replace(/\s+/g, ' ').slice(0, 160) + ' not done after ' + Math.round(ms / 1000) + ' s\n');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const nameOf = (file, args) => [require('path').basename(String(file))].concat((args || []).slice(0, 3).map(a => require('path').basename(String(a)))).join(' ');

// until(f, o): polls f (sync or async) every o.step ms (5) until it gives a truthy value and returns that value. Backstop o.ms
// (at least 60 s): says WAIT and returns f()'s last value, so the check after it reports what is missing. Never throws for time.
// A poll that never settles (an async f stuck on a request) counts as falsy once the backstop is over, so the wait still ends; a
// poll that throws counts as falsy and the WAIT line names the last error (a route that throws every time shows why).
async function until(f, o) {
  o = o || {}; const ms = Math.max(o.ms || 0, COND_MS), step = o.step || 5, t0 = Date.now(), STUCK = {};
  let lastErr = null;
  for (;;) {
    let v, tm = null;
    try {
      const left = Math.max(ms - (Date.now() - t0), 0) + step;
      v = await Promise.race([Promise.resolve().then(f), new Promise(r => { tm = setTimeout(() => r(STUCK), left); })]);
    } catch (e) { v = undefined; lastErr = e; } finally { clearTimeout(tm); }
    const stuck = v === STUCK; if (stuck) v = undefined;
    if (v) return v;
    if (stuck || Date.now() - t0 >= ms) { say(o.who, (o.what || String(f).slice(0, 120)) + (stuck ? ' (a poll never answered)' : lastErr ? ' (last poll threw: ' + (lastErr && lastErr.message || lastErr) + ')' : ''), ms); return v; }
    await sleep(step);
  }
}

// late(p, o): p, with a backstop of o.ms (at least 60 s) and once more as long after a WAIT line; still not settled then it
// resolves o.or (default undefined) so the assert after it reports. Never a hang, never a time-only throw.
function late(p, o) {
  o = o || {}; const ms = Math.max(o.ms || 0, COND_MS);
  return new Promise((res, rej) => {
    let done = false, t2 = null;
    const t1 = setTimeout(() => { say(o.who, o.what, ms); t2 = setTimeout(() => { if (!done) { done = true; say(o.who, o.what, 2 * ms); res(o.or); } }, ms); }, ms);
    Promise.resolve(p).then(v => { if (!done) { done = true; clearTimeout(t1); clearTimeout(t2); res(v); } }, e => { if (!done) { done = true; clearTimeout(t1); clearTimeout(t2); rej(e); } });
  });
}

const killedSync = r => !!(r && r.error && r.error.code === 'ETIMEDOUT');
// spawnSync(file, args, opt, who): child_process.spawnSync with a limit of at least 5 min (opt.timeout when longer). Killed
// by the limit: WAIT, then one more run with twice the limit. The result is spawnSync's.
function spawnSync(file, args, opt, who) {
  const ms = Math.max((opt && opt.timeout) || 0, CHILD_MS);
  let r = cp.spawnSync(file, args, Object.assign({}, opt, { timeout: ms }));
  if (killedSync(r)) { say(who, nameOf(file, args), ms); r = cp.spawnSync(file, args, Object.assign({}, opt, { timeout: 2 * ms })); if (killedSync(r)) say(who, nameOf(file, args) + ' (second run)', 2 * ms); }
  return r;
}
// execFileSync: the same backup for child_process.execFileSync (throws as execFileSync does once the second run is over too)
function execFileSync(file, args, opt, who) {
  const ms = Math.max((opt && opt.timeout) || 0, CHILD_MS);
  try { return cp.execFileSync(file, args, Object.assign({}, opt, { timeout: ms })); } catch (e) {
    if (!(e && e.code === 'ETIMEDOUT')) throw e;
    say(who, nameOf(file, args), ms); return cp.execFileSync(file, args, Object.assign({}, opt, { timeout: 2 * ms }));
  }
}
// execFile(file, args, opt, cb, who): child_process.execFile with the same backup; cb(err, stdout, stderr) as execFile's
function execFile(file, args, opt, cb, who) {
  const ms = Math.max((opt && opt.timeout) || 0, CHILD_MS);
  // only a child the limit killed runs again (it ran for the whole limit); one the caller killed itself (a cancel test) does not
  const go = (lim, again) => { const t0 = Date.now(); return cp.execFile(file, args, Object.assign({}, opt, { timeout: lim }), (err, so, se) => {
    if (err && err.killed && err.code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' && again && Date.now() - t0 >= lim - 50) { say(who, nameOf(file, args), lim); return go(2 * lim, false); }
    cb(err, so, se);
  }); };
  return go(ms, true);
}

// fast(fn, limitMs, o): a speed check that guards a real regression. Runs fn (sync or async) and times it; over the limit it
// runs once more (WAIT) and keeps the better time. Returns { ok, ms }; the caller asserts ok. o.who / o.what name it.
async function fast(fn, limitMs, o) {
  o = o || {}; let t0 = Date.now(); await fn(); let ms = Date.now() - t0;
  if (ms > limitMs) { say(o.who, (o.what || 'a timed step') + ' within ' + limitMs + ' ms (took ' + ms + ' ms; runs once more)', ms); t0 = Date.now(); await fn(); ms = Math.min(ms, Date.now() - t0); }
  return { ok: ms <= limitMs, ms };
}
// time(who, what, ms): the printed TIME line that stands in for a speed assert that guards nothing real
const time = (who, what, ms) => process.stderr.write('TIME ' + (who || 'test') + ': ' + what + ' ' + ms + ' ms\n');

module.exports = { COND_MS, CHILD_MS, say, sleep, until, late, spawnSync, execFileSync, execFile, fast, time, killedSync };
