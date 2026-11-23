// modmove live: boot each target exe twice (baseline, then with the mod staged), poll game.log until quiet, kill only our process tree.
// NO control pipe is used: this proves boot + mount only (canary on AS2, "Mod: activate mod" on GoH), not gameplay. GoH gameplay input: tools/uidrive.
// Safety: refuses when the exe (full path) already runs; kills only pids we spawned or that match the full exe path (Steam relaunch) and
//   did not exist before; profile options.set restored byte-identical after every run (error, SIGINT included); AS2 stage folders only
//   e2e_test / e2e_test2 and only when named by --stage; GoH stage: the approved test folder e2e_test is backed up and restored, any other must not pre-exist and is removed only if we created it.
// ENG-26: as64 + modern mod (Min >= 3.301) needs "as64+:0" first in {mods}; legacy mod none; mowas_2 never as64+ and the mod must be legacy.
// Author: Imperator_Aug (ARSENAL, ia-276fca5b)
const fs = require('fs'), path = require('path'), os = require('os');
const exever = require('../../lib/exever');
const cp = require('child_process');
const C = require('./common'), exestr = require('./exestr'), ud = require('../../lib/userdir');
const { createReport } = require('../../lib/report');
const gamewatch = require('../../lib/gamewatch');
const { parseModInfo, isModern } = require('./static');

const TF = require('../../lib/testfolders');
const STAGES_AS2 = new Set(TF.FOLDERS), STAGES_GOH = new Set(['e2e_test']);
const CANARY_FILE = 'localization/zz_modmove_canary.lng';
const CANARY_RE = /Localization key redefinition:[^\r\n]*zz_modmove_canary/i;   // "in <resource>" names the file, key spelling not needed
const CANARY_LNG = '{tags\r\n\t{"zz_modmove" {"canary" "a"} {"canary" "b"}}\r\n}\r\n';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stat = f => { try { return fs.statSync(f); } catch { return null; } };

function docsDirs() { const h = os.homedir(); return [path.join(h, 'Documents'), path.join(h, 'OneDrive', 'Documents'), path.join(h, 'OneDrive', 'Desktop', 'Documents')]; }
// GoH user dir seen live 2026-11-04 (log, profiles): not under my games
function gohDefaultUserDir() { return ud.gohUserDir(); }   // lib/userdir: %LOCALAPPDATA%\digitalmindsoft\gates of hell (Linux: its Proton prefix)
function profilesIn(userDir) {
  const p = path.join(userDir, 'profiles');
  if (!fs.existsSync(p)) return [];
  return fs.readdirSync(p).map(id => path.join(p, id, 'options.set')).filter(f => fs.existsSync(f));
}
function as2UserDir(target, o) {
  const n = target === 'as64' ? (o.as64Inst || 0) : 0;
  if (o.userDir) return n ? o.userDir + ' - instance ' + n : o.userDir;
  return ud.userDir(n, {});
}
function exceptionSigs(text) {
  const L = text.split(/\r?\n/), out = [];
  for (let i = 0; i < L.length; i++) if (/\*{5,} Exception \*{5,}/.test(L[i])) {
    const s = []; for (let j = i + 1; j < L.length && s.length < 2; j++) if (L[j].trim()) s.push(L[j].trim());
    out.push(s.join(' | ').replace(/0x[0-9a-f]+/gi, '0x'));
  }
  return out;
}
const norm = s => s.replace(/\d+/g, '#');

// ---- one launch
async function launch(ctx, label) {
  const { target, exe, o, inst, res } = ctx, isJs = /\.js$/i.test(exe);
  const match = C.matcherFor(exe);
  const adir = path.join(o.out, target, label);
  fs.mkdirSync(adir, { recursive: true });
  const R = { label, booted: false, exit: null, adopted: 0, exceptions: [], findings: [], canary: null, archive: adir, note: '' };
  const undo = [];   // sync restore steps, run LIFO exactly once
  let done = false;
  const runUndo = () => { if (done) return; done = true; while (undo.length) { const f = undo.pop(); try { f(); } catch (e) { R.restoreErr = (R.restoreErr || '') + e.message + '; '; } } };
  const unreg = C.onCleanup(runUndo);
  const pids = new Set();
  undo.push(() => { for (const p of pids) C.killTree(p); });
  try {
    // 1. profile + list (AS2)
    const stageName = label === 'mod' ? ctx.stage : null;
    let list = target === 'as64' ? ['as64+'] : [];   // testrun rule: empty list -> as64+:0 first
    if (label === 'mod') {
      const mi = parseModInfo(ctx.mod);
      const modern = isModern(mi);
      if (target === 'mowas2' && modern && !o.tryMismatch) { res.add(target, 0, 'MOVE_LIVE_MODE_MISMATCH', `mowas_2: fixture is modern (MinGameVersion ${mi.min} >= 3.301); retail needs a legacy mod and no as64+ in {mods} (ENG-26): launch refused`); R.note = 'refused: mode mismatch'; return R; }
      if (target === 'as64' && !modern && !mi) { /* no mod.info: nothing to list */ }
      const unknown = !mi;   // modern or no mod.info -> as64+ first; legacy (no MinGameVersion too, FitsMode) -> none
      list = target === 'as64' && (modern || unknown) ? ['as64+', stageName] : [stageName];
      if (o.with) list.splice(list.indexOf(stageName), 0, ...o.with.split(','));   // parent mods, loaded before the stage folder
    }
    let prof = null, origBytes = null;
    {
      const udir = ctx.userDir;
      const ps = udir ? profilesIn(udir) : [];
      if (ps.length !== 1) { res.add(target, 0, 'MOVE_LIVE_NO_PROFILE', `need exactly one profiles/*/options.set under ${udir || '(no user dir)'}, found ${ps.length}: launch refused`); R.note = 'refused: profile'; return R; }
      prof = ps[0]; origBytes = fs.readFileSync(prof);
      fs.writeFileSync(path.join(adir, 'options.set.orig'), origBytes);
      undo.push(() => { fs.writeFileSync(prof, origBytes); if (!fs.readFileSync(prof).equals(origBytes)) throw new Error('options.set not byte-identical after restore'); });
    }
    // 2. stage the mod copy
    if (label === 'mod') {
      const root = C.rootOf(target, inst), sdir = path.join(root, 'mods', stageName);
      if (target === 'goh' && !STAGES_GOH.has(stageName)) {
        if (fs.existsSync(sdir)) { res.add(target, 0, 'MOVE_LIVE_STAGE_EXISTS', `${sdir} already exists in GoH mods/: refused (never touch a pre-existing folder)`); R.note = 'refused: stage exists'; return R; }
        fs.mkdirSync(sdir, { recursive: true });
        undo.push(() => fs.rmSync(sdir, { recursive: true, force: true }));
      } else {
        const bak = path.join(o.backup, target + '-' + stageName);
        const existed = fs.existsSync(sdir), h0 = existed ? C.treeHash(sdir) : null;
        if (existed) { fs.rmSync(bak, { recursive: true, force: true }); C.copyDir(sdir, bak); fs.rmSync(sdir, { recursive: true, force: true }); }
        undo.push(() => {
          fs.rmSync(sdir, { recursive: true, force: true });
          if (existed) { C.copyDir(bak, sdir); if (C.treeHash(sdir) !== h0) throw new Error('stage folder ' + stageName + ' not identical after restore'); }
        });
      }
      C.copyDir(ctx.mod, sdir);
      if (o.canary !== false && target !== 'goh' && !fs.existsSync(path.join(sdir, CANARY_FILE))) {   // GoH proof = "Mod: activate mod", 0 .lng in GoH
        fs.mkdirSync(path.join(sdir, 'localization'), { recursive: true });
        fs.writeFileSync(path.join(sdir, CANARY_FILE), CANARY_LNG);
        R.canaryInjected = true;
      }
    }
    // 3. mod list through modswitch (same {mods} block on GoH, seen live)
    if (prof) {
      const args = ['--game', target === 'goh' ? inst.goh : inst.as2, '--profile', prof, '--set', list.join(','), '--write', '--bak', path.join(adir, 'modswitch.bak')];
      if (o.tryMismatch) args.push('--force');
      if (o.noProc) args.push('--no-proc');
      const r = C.runTool('modswitch', args);
      if (r.status !== 0) { res.add(target, 0, 'MOVE_LIVE_MODSWITCH', `modswitch failed (${r.status}): ${(r.out + r.err).trim().split('\n').slice(-2).join(' / ')}`); R.note = 'refused: modswitch'; return R; }
      // ENG-26 guard: re-read the written list and compare with the stage mod mode
      const written = require('../../lib/vfs').readModList(prof).mods.map(s => s.split(':')[0]);
      const hasPlus = written.includes('as64+');
      const mi2 = label === 'mod' ? parseModInfo(ctx.mod) : null;
      const modern = label === 'mod' ? (isModern(mi2) || !mi2) : true;
      const bad = target !== 'as64' ? hasPlus : hasPlus !== modern;
      if (bad) { res.add(target, 0, 'MOVE_LIVE_MODE_MISMATCH', `{mods} [${written.join(' ')}] vs mod mode (${modern ? 'modern' : 'legacy'}): as64 modern needs as64+ first, legacy none, mowas_2 never (ENG-26): launch refused`); R.note = 'refused: mode mismatch'; return R; }
      R.list = written;
    }
    // 4. launch
    const args = (o['args-' + target] ? String(o['args-' + target]).split(/\s+/).filter(Boolean) : []);
    if (target === 'as64' && o.as64Inst > 0) args.push('-instance', String(o.as64Inst));
    if (!isJs) { const ev = exever.check(exe); res.info(target, 0, 'MOVE_LIVE_EXE', `${ev.name} sha ${ev.short}${ev.known ? '' : ' NEW BUILD'}`); if (!ev.known) res.add(target, 0, 'WARN_EXE_NEW_BUILD', `${ev.name} sha ${ev.sha} not in modweb/porting/exe-versions.md: append a row, facts there may not hold`); }
    const t0 = Date.now();
    const logDir0 = ctx.userDir ? path.join(ctx.userDir, 'log') : null;
    const spawnArgs = isJs ? [exe, ...args] : args;
    const child = cp.spawn(isJs ? process.execPath : exe, spawnArgs, { cwd: path.dirname(exe), stdio: 'ignore', windowsHide: false, detached: false });
    pids.add(child.pid);
    let childExit = null;
    child.on('exit', (c, s) => { childExit = { code: c, signal: s, t: Date.now() }; });
    child.on('error', e => { childExit = { code: -1, err: e.message, t: Date.now() }; });
    // 5. poll
    let lastSig = '', lastChange = t0, logFile = null, fresh = false, sweepAt = 0, alive = true;
    const findLog = () => {
      if (target !== 'goh') return path.join(logDir0, 'game.log');
      if (ctx.userDir) return path.join(ctx.userDir, 'log', 'game.log');
      const cands = exestr.userDirCandidates(exe).concat(['Gates of Hell', 'Call to Arms - Gates of Hell']);
      for (const d of docsDirs()) {
        for (const c of cands) { const f = path.join(d, 'My Games', c, 'log', 'game.log'); const s = stat(f); if (s && s.mtimeMs >= t0 - 2000) return f; }
        const mg = path.join(d, 'My Games');
        if (fs.existsSync(mg)) for (const e of fs.readdirSync(mg)) { const f = path.join(mg, e, 'log', 'game.log'); const s = stat(f); if (s && s.mtimeMs >= t0 - 2000) return f; }
      }
      return null;
    };
    const gw = gamewatch.watch({ pid: () => [...pids].pop(), alive: () => alive, exit: () => childExit && !R.adopted ? { code: childExit.code } : null, logFile: () => logFile, startMs: t0, hangSec: o['hang-sec'] || 60, settleMs: Math.min(1500, (o.quiet || 20) * 1000) });
    for (;;) {
      await sleep(o.poll || 1000);
      const now = Date.now();
      if (!logFile || !fresh) { logFile = findLog(); }
      const s = logFile && stat(logFile);
      if (s && s.mtimeMs >= t0 - 2000 && s.size > 0) {
        fresh = true;
        const sg = s.size + ':' + s.mtimeMs;
        if (sg !== lastSig) { lastSig = sg; lastChange = now; }
      }
      if (childExit && alive) {
        // Steam may relaunch the game as a different process: look it up by full path, adopt only new matching pids
        if (now - childExit.t > (o.relaunchGrace || 15000) || sweepAt === 0) {
          sweepAt = now;
          const mine = C.listProcs().filter(match);
          for (const p of mine) if (!pids.has(p.pid)) { pids.add(p.pid); R.adopted++; }
          if (!mine.length) { if (now - childExit.t > (o.relaunchGrace || 15000) || fresh) alive = false; }
        }
      } else if (R.adopted && now - sweepAt > 5000) {
        sweepAt = now;
        if (!C.listProcs().filter(match).length) alive = false;
      }
      const gv = await gw.tick();
      if (gv) { R.watch = gv; break; }
      if (fresh && now - lastChange >= (o.quiet || 20) * 1000 && !gw.suspect()) break;
      if (now - t0 >= (o.wait || 240) * 1000) { R.timeout = true; break; }
    }
    R.exit = childExit;
    // 6. kill only ours
    for (const p of C.listProcs().filter(match)) pids.add(p.pid);
    for (const p of pids) C.killTree(p);
    R.alive = false;
    for (let i = 0; i < 10; i++) { const left = C.listProcs().filter(match); R.alive = left.length > 0; if (!R.alive) break; for (const p of left) C.killTree(p.pid); await sleep(500); }
    // 7. archive + read
    logFile = logFile || findLog();
    if (logFile && fs.existsSync(logFile)) {
      const ld = path.dirname(logFile);
      fs.copyFileSync(logFile, path.join(adir, 'game.log'));
      const prev = path.join(ld, 'game.prev.log'); if (fs.existsSync(prev)) fs.copyFileSync(prev, path.join(adir, 'game.prev.log'));
      const md = path.join(ld, 'minidumps');
      if (fs.existsSync(md)) for (const f of fs.readdirSync(md)) { const s = stat(path.join(md, f)); if (s && s.mtimeMs >= t0) { fs.mkdirSync(path.join(adir, 'minidumps'), { recursive: true }); fs.copyFileSync(path.join(md, f), path.join(adir, 'minidumps', f)); } }
      R.logFile = logFile; R.fresh = fresh;
      const text = fs.readFileSync(path.join(adir, 'game.log'), 'latin1');
      R.exceptions = exceptionSigs(text);
      R.canary = CANARY_RE.test(text);
      R.activated = !!stageName && text.toLowerCase().includes('mod: activate mod ' + stageName.toLowerCase());
      R.lines = text.split('\n').length;
      const tr = C.runTool('logtriage', [adir, '-q']);
      R.findings = C.parseFindings(tr.out).filter(f => !f.info).map(f => f.code + ' ' + norm(f.msg).slice(0, 160));
    } else { R.fresh = false; }
    if (R.fresh && !R.exceptions.length && !(childExit && childExit.code && !R.adopted) && !gamewatch.isFailure(R.watch)) R.booted = true; else R.booted = false;
    fs.writeFileSync(path.join(adir, 'run.json'), JSON.stringify({ target, label, exe, args, list, adopted: R.adopted, exit: childExit, timeout: !!R.timeout, logFile, exceptions: R.exceptions, canary: R.canary }, null, 1));
    return R;
  } finally {
    unreg();
    runUndo();
    if (R.restoreErr) res.add(target, 0, 'MOVE_LIVE_RESTORE_FAIL', `${label}: ${R.restoreErr.trim()} (profile/stage not verified identical: check by hand, backup in ${o.backup} and ${adir})`);
  }
}

async function live(o) {
  const res = createReport();
  const inst = C.installs(o);
  o.out = path.resolve(o.out || fs.mkdtempSync(path.join(os.tmpdir(), 'modmove-live-')));
  o.backup = path.resolve(o.backup || path.join(o.out, '_backup'));
  fs.mkdirSync(o.out, { recursive: true });
  const stages = {};
  for (const kv of String(o.stage || '').split(',').filter(Boolean)) { const [t, f] = kv.split('='); if (f) stages[t] = f; }
  const rows = [];
  const targets = String(o.targets || '').split(',').filter(Boolean);
  for (const t of targets) if (!C.TARGETS.includes(t)) throw new Error('unknown target ' + t);
  if (o.mod && !fs.existsSync(path.join(o.mod, 'mod.info'))) res.info('live', 0, 'MOVE_LIVE_NO_MODINFO', '--mod has no mod.info');
  res.info('live', 0, 'MOVE_LIVE_NO_PIPE', 'boot and mount only: no control pipe is used on any target (as64 pipe unused too); gameplay is not tested');
  for (const target of targets) {
    const exe = C.exeOf(target, inst, o);
    const row = { target, booted: '-', newErrors: '-', mounted: '-', archive: '-', notes: [] };
    rows.push(row);
    if (!exe || !fs.existsSync(exe)) { res.add(target, 0, 'MOVE_LIVE_NO_EXE', `exe not found: ${exe}`); row.notes.push('no exe'); continue; }
    // the game exe is started directly: Windows only (a .js stub, as the tests use, runs anywhere). modmove's cli.run prints it, exit 2
    if (!/\.js$/i.test(exe) && !require('../../lib/platform').isWin()) throw require('../../lib/platform').unsupported('booting the game (modmove live)');
    const match = C.matcherFor(exe);
    if (C.listProcs().some(match)) { res.add(target, 0, 'MOVE_LIVE_RUNNING', `${exe} is already running: refused (we never touch a process that existed before us)`); row.notes.push('running'); continue; }
    const stage = stages[target];
    if (stage && target !== 'goh' && !STAGES_AS2.has(stage)) { res.add(target, 0, 'MOVE_LIVE_STAGE_REFUSED', `AS2 stage folder "${stage}" refused: only ${TF.FOLDERS.join(", ")}`); row.notes.push('stage refused'); continue; }
    let userDir = target === 'goh' ? (o.gohUserDir || gohDefaultUserDir()) : as2UserDir(target, o);
    const ctx = { target, exe, o, inst, res, userDir, stage, mod: o.mod };
    const sigs = [];
    const results = {};
    const plan = ['base'];
    if (o.mod) {
      if (!stage) { res.add(target, 0, 'MOVE_LIVE_SKIPPED', `${target}: no stage folder named`); row.notes.push('mod run skipped: no stage'); }
      else plan.push('mod');
    }
    for (const label of plan) {
      let R;
      try { R = await launch(ctx, label); }
      catch (e) { res.add(target, 0, 'MOVE_LIVE_ERROR', `${label}: ${e.message}`); row.notes.push('error'); continue; }
      results[label] = R;
      sigs.push(R.exceptions[0] || '');
      if (sigs.length >= 2 && sigs[sigs.length - 1] && sigs[sigs.length - 1] === sigs[sigs.length - 2]) { res.add(target, 0, 'MOVE_LIVE_REPEAT_EXCEPTION', `${target}: 2 launches ended in the same exception (${sigs[0]}): stopped, no further launches`); results[label] = R; break; }
      if (R.exceptions.length) res.add(target + '/' + label, 0, 'MOVE_LIVE_CRASH', `${label} run logged ${R.exceptions.length} Exception block(s): ${R.exceptions[0]}`);
      if (R.logFile && target === 'goh' && !userDir) userDir = path.dirname(path.dirname(R.logFile));
      if (R.fresh === false && !R.note) res.add(target + '/' + label, 0, 'MOVE_LIVE_NO_LOG', `no fresh game.log appeared (${R.logFile || 'path unknown'}); exe exit ${R.exit ? JSON.stringify(R.exit) : 'still running'}`);
      if (R.exit && R.exit.code && !R.adopted) res.add(target + '/' + label, 0, 'MOVE_LIVE_EXIT', `${label}: exe exited with code ${R.exit.code} before we stopped it`);
      if (R.watch && R.watch.state === 'hung') res.add(target + '/' + label, 0, 'MOVE_LIVE_HANG', `${label}: ${R.watch.reason}`);
      if (R.watch && R.watch.state === 'crashed-silent') res.add(target + '/' + label, 0, 'MOVE_LIVE_SILENT_CRASH', `${label}: ${R.watch.reason}`);
      if (R.timeout) res.info(target + '/' + label, 0, 'MOVE_LIVE_TIMEOUT', `--wait elapsed before the log went quiet`);
      if (R.alive) res.add(target + '/' + label, 0, 'MOVE_LIVE_NOT_KILLED', `process for ${exe} still alive after kill attempts: close it by hand`);
    }
    const B = results.base, M = results.mod, V = M || B;
    if (V) {
      row.booted = V.fresh && V.booted ? 'yes' : (V.note ? 'refused' : 'NO');
      row.archive = path.join(o.out, target);
    }
    if (B && M) {
      const bc = new Map(); for (const f of B.findings) bc.set(f, (bc.get(f) || 0) + 1);
      const fresh = [];
      for (const f of M.findings) { const n = bc.get(f) || 0; if (n) bc.set(f, n - 1); else fresh.push(f); }
      const bsig = new Set(B.exceptions);
      const newEx = M.exceptions.filter(e => !bsig.has(e));
      row.newErrors = String(fresh.length + newEx.length);
      for (const f of fresh.slice(0, 20)) res.add(target + '/mod', 0, 'MOVE_LIVE_NEW_ERROR', f);
      if (target === 'goh') {
        row.mounted = M.activated ? 'yes (activate line)' : 'NO (no activate line)';
        if (!M.activated && !M.note && M.fresh) res.add(target + '/mod', 0, 'MOVE_LIVE_NOT_MOUNTED', `no "Mod: activate mod ${M.list ? M.list.join(',') : ''}" in the mod-run log: GoH refused it, check minGameVersion against the exe version`);
      } else {
        row.mounted = M.canary && !B.canary ? 'yes (canary)' : (M.canary === null ? '?' : 'NO (canary absent)');
        if (!(M.canary && !B.canary) && !M.note && M.fresh) res.add(target + '/mod', 0, 'MOVE_LIVE_NOT_MOUNTED', `canary line not in the mod-run log: mod folder not mounted or canary not loaded`);
      }
      if (M.restoreErr) row.notes.push('RESTORE FAILED');
    } else if (B) {
      row.newErrors = 'n/a'; row.mounted = 'n/a';
      row.newErrors = String(B.findings.length) + ' (baseline total)';
    }
    if (target === 'goh' && !userDir) row.notes.push('goh user dir not found');
  }
  // table
  const head = ['target', 'booted', 'new errors', 'mounted?', 'archive path'];
  const tab = [head, ...rows.map(r => [r.target, r.booted, r.newErrors, r.mounted, r.archive + (r.notes.length ? '  (' + r.notes.join('; ') + ')' : '')])];
  const w = head.map((_, i) => Math.max(...tab.map(r => String(r[i]).length)));
  const table = tab.map(r => r.map((c, i) => String(c).padEnd(w[i])).join(' | ')).join('\n');
  fs.writeFileSync(path.join(o.out, 'live-summary.json'), JSON.stringify({ rows, findings: res.toJSON({ tool: 'modmove-live' }).findings }, null, 1));
  return { res, table, rows };
}
module.exports = { live, CANARY_FILE, CANARY_RE, CANARY_LNG };
