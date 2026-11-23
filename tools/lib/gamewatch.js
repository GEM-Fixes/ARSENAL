// gamewatch: one launch -> crashed / hung / ok, from process + game.log.
// Why not just wait for exit: after an Exception the engine writes the log + dump, then blocks in MessageBox("Exception") until someone clicks OK
// (then TerminateProcess). A logged crash therefore looks like a live, silent game until a timeout ends the run.
//   states: crashed-logged  Exception block in this launch's log, log settled (dialog up or process gone)
//           crashed-dialog  "Exception" dialog up, no Exception block in the log
//           crashed-silent process gone by itself, no Exception block, exit code not 0 (stack overflow skips the box)
//           exited          process gone with code 0 or after expectExit
//           hung            alive, log quiet hangSec, window not responding (or no window) over the last hangSec/2
//   a game idling in a menu is quiet but responding: running, never hung. Deaf spot: another dialog on a live message loop reads as responding [I].
// watch({ pid: () => pid, alive: () => bool, exit: () => {code}|null, logFile: () => path|null, startMs, hangSec = 60, settleMs = 1500, dialogWaitMs = 15000, expectExit: () => bool })
//   .tick() async -> verdict|null, one check; .run(cb, ms) polls until a verdict; .stop(); .suspect() window seen unresponsive now; .maxQuietMs
// verdict: { state, reason, quietMs, title, responding, exitCode, ms }
// Author: Imperator_Aug (ARSENAL, ia-1313a8c8)
const fs = require('fs'), cp = require('child_process'), platform = require('./platform');

const MARK = /^(?:\[[^\]]*\]\s*)?\*{5,} Exception \*{5,}\s*$/m;
const DIALOG = /^Exception$/;
const isFailure = v => !!v && /^(crashed|hung)/.test(v.state);
const hexCode = c => c === null || c === undefined ? 'unknown' : c < 0 || c > 255 ? '0x' + (c >>> 0).toString(16).toUpperCase() : String(c);

// window state of a live pid; null = no answer (gone, or not Windows)
function probe(pid) {
  return new Promise(res => {
    if (!platform.isWin() || !pid) return res(null);   // window state through PowerShell: Windows only
    const ps = `$p=Get-Process -Id ${+pid} -ErrorAction Stop; @{r=$p.Responding;t=$p.MainWindowTitle;h=[int64]$p.MainWindowHandle;c=$p.TotalProcessorTime.TotalSeconds}|ConvertTo-Json -Compress`;
    cp.execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 8000, windowsHide: true }, (e, out) => {
      try { const j = JSON.parse(out); res({ responding: !!j.r, title: j.t || '', hasWindow: !!j.h, cpu: j.c }); } catch (x) { res(null); }
    });
  });
}

function watch(o) {
  const hangMs = (o.hangSec || 60) * 1000, settleMs = o.settleMs === undefined ? 1500 : o.settleMs, dialogWaitMs = o.dialogWaitMs === undefined ? 15000 : o.dialogWaitMs;
  const probeAfter = Math.min(10000, hangMs / 4), probeEvery = Math.min(5000, hangMs / 4);
  const startMs = o.startMs || Date.now();
  let off = 0, tail = '', marked = false, lastGrowth = startMs, lastSize = -1, lastProbe = 0, badSince = 0, last = null, stopped = false, done = null;
  const api = { maxQuietMs: 0 };
  const expect = () => !!(o.expectExit && o.expectExit());

  function readLog() {
    const f = o.logFile && o.logFile();
    if (!f) return;
    let st; try { st = fs.statSync(f); } catch (e) { return; }
    if (st.mtimeMs < startMs - 2000) return;   // the previous run's log: the exe rewrites it at start
    if (st.size !== lastSize) { lastSize = st.size; lastGrowth = Date.now(); }
    if (st.size < off) { off = 0; tail = ''; }
    if (st.size === off) return;
    const b = Buffer.alloc(st.size - off), fd = fs.openSync(f, 'r');
    try { fs.readSync(fd, b, 0, b.length, off); } finally { fs.closeSync(fd); }
    off = st.size;
    const text = tail + b.toString('latin1');
    if (MARK.test(text)) marked = true;
    tail = text.slice(-80);
  }
  const verdict = (state, reason, extra) => (done = Object.assign({ state, reason, quietMs: Date.now() - lastGrowth, title: last ? last.title : null, responding: last ? last.responding : null, exitCode: null, ms: Date.now() - startMs }, extra));

  api.tick = async () => {
    if (done) return done;
    readLog();
    const now = Date.now(), quiet = now - lastGrowth;
    if (quiet > api.maxQuietMs) api.maxQuietMs = quiet;
    if (!o.alive()) {
      const ex = o.exit && o.exit(), code = ex ? ex.code : null;
      if (marked) return verdict('crashed-logged', `Exception in game.log, process gone (exit ${hexCode(code)})`, { exitCode: code });
      if (expect() || code === 0) return verdict('exited', `process exited (exit ${hexCode(code)})`, { exitCode: code });
      return verdict('crashed-silent', `process died with no Exception in game.log (exit ${hexCode(code)}), ${Math.round((now - startMs) / 1000)} s after launch`, { exitCode: code });
    }
    if (marked && quiet >= settleMs) {   // the box goes up once log + dump are written; a log that keeps growing was not fatal
      last = await probe(o.pid()) || last;
      if (last && DIALOG.test(last.title)) return verdict('crashed-logged', 'Exception in game.log, game waiting on its Exception dialog');
      if (quiet >= dialogWaitMs) return verdict('crashed-logged', `Exception in game.log, log quiet ${Math.round(quiet / 1000)} s, no dialog seen`);
      return null;
    }
    if (marked || expect() || quiet < probeAfter || now - lastProbe < probeEvery) return null;
    lastProbe = now;
    const p = await probe(o.pid());
    if (!p) return null;
    last = p;
    if (DIALOG.test(p.title)) return verdict('crashed-dialog', 'game waiting on an Exception dialog, no Exception in game.log');
    if (p.responding && p.hasWindow) { badSince = 0; return null; }
    if (!badSince) badSince = now;
    if (quiet >= hangMs && now - badSince >= hangMs / 2) return verdict('hung', `alive, game.log quiet ${Math.round(quiet / 1000)} s, ${p.hasWindow ? 'window not responding' : 'no window'}, cpu ${Math.round(p.cpu)} s`);
    return null;
  };
  api.suspect = () => !!badSince;
  api.verdict = () => done;
  api.stop = () => { stopped = true; };
  api.run = async (cb, ms) => {
    while (!stopped && !done) {
      const v = await api.tick();
      if (v) { if (!stopped) await cb(v); return; }
      await new Promise(r => setTimeout(r, ms || 500));
    }
  };
  return api;
}

function killTree(pid) {
  if (platform.isWin()) platform.killPid(pid);
  else { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
}

module.exports = { watch, probe, killTree, isFailure, hexCode, MARK };
