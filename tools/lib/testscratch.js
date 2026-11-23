// testscratch: the guard a test calls right before it wipes its scratch folder (fs.rmSync(dir, {recursive:true})).
//   guard(dir) -> dir, or prints one plain line on stderr and exits 2, deleting nothing, when dir is a folder no test may wipe:
//     a drive root, the ARSENAL_TMP root, the OS temp root, the user's home, the repo (or the folder of the running test), a folder that
//     holds one of those, a game install or anything in or above one (as64.exe, mowas_2.exe, binaries/x64/call_to_arms.exe, the found
//     installs, a steamapps folder), a git repository or a folder in one with files kept in git, or (outside the temp roots and the
//     repo) a mod folder (mod.info in it or above it) or a folder that holds a mod
//   why(dir) -> the reason text, or '' when the folder may be wiped (no exit)
//   First an allow list (allowed below): only a folder strictly inside ARSENAL_TMP or a system temp root, or a test work folder of the
//   repo (below a test/ or tests/ folder), links followed; then the refusals above still apply inside those.
// A test gets a fresh subfolder: <ARSENAL_TMP>/<test>-<pid>. Why: a test given the shared scratch root deleted other sessions' work.
// Author: Imperator_Aug (ARSENAL, ia-23d9403d)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const REPO = path.resolve(__dirname, '..', '..');
const win = process.platform === 'win32';
const norm = p => { let s = path.resolve(String(p)).replace(/[\\/]+$/, ''); if (!s) s = path.sep; if (/^[A-Za-z]:$/.test(s)) s += path.sep; return win ? s.toLowerCase() : s; };
const within = (a, b) => { const r = path.relative(b, a); return r === '' || (!!r && !r.startsWith('..') && !path.isAbsolute(r)); };   // a equal to or inside b
const isFile = p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
// The OS temp roots no test may wipe: the system ones, and os.tmpdir() unless a runner pointed TEMP/TMP at a scratch subfolder (a
// folder strictly inside ARSENAL_TMP or a system temp root, e.g. bots/test.js gives each part TEMP=<scratch>/parts/<id>): that
// subfolder is the child's own scratch, the real roots above it stay refused.
function tempRoots() {
  const env = process.env, sys = win ? [env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Temp'), env.SystemRoot && path.join(env.SystemRoot, 'Temp')] : ['/tmp', '/var/tmp'];
  const real = sys.filter(Boolean), t = os.tmpdir(), nt = norm(t);
  const inside = [env.ARSENAL_TMP].concat(real).filter(Boolean).some(r => { const n = norm(r); return nt !== n && within(nt, n); });
  return inside ? real : real.concat([t]);
}
const EXES = ['as64.exe', 'mowas_2.exe', path.join('binaries', 'x64', 'call_to_arms.exe')];

function installs() {
  const out = [];
  for (const id of ['as64', 'goh']) { try { const d = require('./games').install(id).dir; if (d) out.push(d); } catch (e) { /* none found */ } }
  for (const k of ['AS2_GAME', 'GOH_GAME']) if (process.env[k]) out.push(process.env[k]);
  return out;
}

// the path with links followed for the part that exists (the rest kept as written), so a junction cannot carry a wipe elsewhere
function realOf(p) {
  let d = path.resolve(String(p)); const tail = [];
  for (;;) {
    try { return path.join(fs.realpathSync.native(d), ...tail); } catch (e) { /* missing: one up */ }
    const up = path.dirname(d); if (up === d) return path.resolve(String(p));
    tail.unshift(path.basename(d)); d = up;
  }
}
const strictly = (a, b) => { const r = path.relative(b, a); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
// Allow list: a test may wipe only a folder strictly inside ARSENAL_TMP or a system temp root (os.tmpdir() counts when a runner pointed
// TEMP at a subfolder of those: it is then inside them), or one of the repo's own test work folders (strictly below a test/ or tests/
// folder of the repo, e.g. tools/check/test/cr). Both sides are compared with links followed. Everything else is refused.
function allowRoots() {
  const env = process.env, sys = win ? [env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Temp'), env.SystemRoot && path.join(env.SystemRoot, 'Temp')] : ['/tmp', '/var/tmp'];
  return [env.ARSENAL_TMP].concat(sys).filter(Boolean).filter(r => path.isAbsolute(r)).map(r => norm(realOf(r)));
}
function allowed(dir) {
  const d = norm(realOf(dir));
  if (allowRoots().some(r => strictly(d, r))) return '';
  const repo = norm(realOf(REPO));
  if (strictly(d, repo)) {
    const segs = path.relative(repo, d).split(/[\\/]+/), i = segs.findIndex(s => s === 'test' || s === 'tests');
    if (i >= 0 && i < segs.length - 1) return '';
  }
  return 'not a scratch folder (only a folder strictly inside ARSENAL_TMP, a system temp folder or a test work folder of the repo may be wiped)';
}

function why(dir) {
  if (typeof dir !== 'string' || !dir.trim()) return 'no folder given';
  const d = norm(dir);
  if (d === norm(path.parse(d).root)) return 'a drive root';
  const na = allowed(dir); if (na) return na;
  const roots = [['the ARSENAL_TMP root', process.env.ARSENAL_TMP], ...tempRoots().map(t => ['the OS temp root', t]), ['the home folder', os.homedir()], ['the repo', REPO]];
  if (require.main && require.main.filename) roots.push(['the folder of the running test', path.dirname(require.main.filename)]);
  for (const [name, r] of roots) {
    if (!r) continue;
    const n = norm(r);
    if (d === n) return name + ' (' + r + ')';
    if (within(n, d)) return 'a folder that holds ' + name + ' (' + r + ')';
  }
  if (d.split(/[\\/]/).includes('steamapps')) return 'a Steam game or Workshop folder';
  for (let p = d; ; p = path.dirname(p)) {
    for (const e of EXES) if (isFile(path.join(p, e))) return 'a game install or a folder in it (' + path.join(p, e) + ')';
    if (path.dirname(p) === p) break;
  }
  for (const g of installs()) { const n = norm(g); if (within(d, n) || within(n, d)) return 'a game install, in one or above one (' + g + ')'; }
  // a git repository, or a folder in one that holds files kept in git (a code folder of this repo, a mod kept in git)
  for (let p = d; ; p = path.dirname(p)) {
    if (fs.existsSync(path.join(p, '.git'))) {
      if (p === d) return 'a git repository (' + dir + ')';
      // in this repo only code counts (a test fixture kept in git, e.g. tools/fix/test/fx, is remade by its own mkfixture.js)
      const rel = path.relative(p, d).replace(/\\/g, '/'), ic = win ? ':(icase)' : '', spec = (within(d, norm(REPO)) ? [rel + '/*.js', rel + '/*.md'] : [rel]).map(s => ic + s);
      let kept = '';
      try { kept = require('child_process').execFileSync('git', ['-C', p, 'ls-files', '--'].concat(spec), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, maxBuffer: 64 << 20 }); } catch (e) { kept = ''; }
      if (kept.trim()) return 'a folder with files kept in git (' + p + ')';
      break;
    }
    if (path.dirname(p) === p) break;
  }
  const temps = [process.env.ARSENAL_TMP, os.tmpdir(), REPO].filter(Boolean).map(norm);
  if (!temps.some(t => within(d, t))) {
    for (let p = d; ; p = path.dirname(p)) {
      if (isFile(path.join(p, 'mod.info'))) return 'a mod folder or a folder in one (' + path.join(p, 'mod.info') + ')';
      if (path.dirname(p) === p) break;
    }
    let kids = []; try { kids = fs.readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory()); } catch (e) { /* missing: nothing to wipe */ }
    for (const k of kids) if (isFile(path.join(d, k.name, 'mod.info'))) return 'a folder that holds a mod (' + path.join(d, k.name) + ')';
  }
  return '';
}

function guard(dir) {
  const w = why(dir);
  if (!w) return dir;
  const tmp = process.env.ARSENAL_TMP || os.tmpdir(), name = require.main && require.main.filename ? path.basename(require.main.filename, '.js') : 'test';
  console.error('refused: will not wipe ' + dir + ': it is ' + w + '. Give the test a fresh subfolder, for example ' + path.join(tmp, name + '-' + process.pid) + '. Nothing was deleted.');
  process.exit(2);
}

module.exports = { guard, why, allowed };
