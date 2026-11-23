// soedit/locate: where SOEdit.exe is (README "locate").
//   locate({env, execPath, repo, isFile}) -> {path, source:'env'|'arsenal'|'build', sha256} | {path:null, tried:[[source, path]], msg}
//   order: ARSENAL_SOEDIT (file, or a folder holding SOEdit.exe), a `soedit` folder next to the running ARSENAL exe (only when
//   node runs as the packed exe, not as node.exe), tools/dist/out/soedit/ (a copy put there by hand), then a copy installed somewhere:
//   the folder "soedit install" downloads into (installDir), the installed ARSENAL (%LOCALAPPDATA%/Programs/ARSENAL/soedit), a
//   folder on PATH, and the user's Desktop, Downloads and Documents (two folders deep, at most 600 folders read).
//   source 'installed' = the copy ARSENAL downloaded, 'found' = a copy from somewhere else (it may be another build of SOEdit:
//   ours:false, so it is started without the options only a build with UPSTREAM.md beside it knows). The home search runs for the real
//   environment only (or with o.home); a test that passes its own env gets no search of the real home. every IO injectable for tests.
// Author: Imperator_Aug (ARSENAL, ia-8124333c)
const fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');

const REPO = path.resolve(__dirname, '..', '..');
const EXE = 'SOEdit.exe';
const defIsFile = p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
const defIsDir = p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };

function sha256File(f) { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); }

// where "soedit install" puts its download: a folder of the user, never the game and never the ARSENAL folder
function installDir(env, home) {
  env = env || process.env;
  const base = env.ARSENAL_HOME || (env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'ARSENAL') : path.join(home || os.homedir(), '.arsenal'));
  return path.join(base, 'soedit');
}
function locate(o = {}) {
  const env = o.env || process.env, execPath = o.execPath || process.execPath, repo = o.repo || REPO;
  const isFile = o.isFile || defIsFile, isDir = o.isDir || defIsDir;
  const tried = [];
  const hit = (p, source) => ({ path: path.resolve(p), source, sha256: (o.hash || sha256File)(p) });
  if (env.ARSENAL_SOEDIT) {
    let p = env.ARSENAL_SOEDIT;
    if (isDir(p)) p = path.join(p, EXE);
    tried.push(['ARSENAL_SOEDIT', p]);
    if (isFile(p)) return hit(p, 'env');
  }
  if (!/^node(\.exe)?$/i.test(path.basename(execPath))) {
    const p = path.join(path.dirname(execPath), 'soedit', EXE);
    tried.push(['next to ARSENAL', p]);
    if (isFile(p)) return hit(p, 'arsenal');
  }
  const b = path.join(repo, 'tools', 'dist', 'out', 'soedit', EXE);
  tried.push(['local build', b]);
  if (isFile(b)) return hit(b, 'build');
  const home = o.home !== undefined ? o.home : (o.env ? null : os.homedir());
  if (env.LOCALAPPDATA || env.ARSENAL_HOME || home) {
    const d = path.join(installDir(env, home), EXE);
    tried.push(['downloaded by ARSENAL', d]);
    // a copy with UPSTREAM.md beside the exe knows --respath and --lang; the downloaded upstream release does not, so it is started without them
    if (isFile(d)) return Object.assign(hit(d, 'installed'), isFile(path.join(path.dirname(d), 'UPSTREAM.md')) ? {} : { ours: false });
  }
  const other = p => Object.assign(hit(p, 'found'), { ours: false });
  if (env.LOCALAPPDATA) {
    const p = path.join(env.LOCALAPPDATA, 'Programs', 'ARSENAL', 'soedit', EXE);
    tried.push(['installed ARSENAL', p]);
    if (isFile(p)) return hit(p, 'arsenal');
  }
  if (home) {
    for (const d of String(env.PATH || env.Path || '').split(path.delimiter).filter(Boolean)) { const p = path.join(d, EXE); if (isFile(p)) { tried.push(['PATH', p]); return other(p); } }
    tried.push(['PATH', '(no folder on PATH has it)']);
    const list = o.listDir || (d => { try { return fs.readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch (e) { return []; } });
    let left = 600;
    for (const top of ['Desktop', 'Downloads', 'Documents']) {
      const queue = [[path.join(home, top), 0]];
      while (queue.length && left-- > 0) {
        const [d, depth] = queue.shift(), p = path.join(d, EXE);
        if (isFile(p)) { tried.push([top, p]); return other(p); }
        if (depth < 2) for (const n of list(d)) if (!/^(\.|node_modules$)/.test(n)) queue.push([path.join(d, n), depth + 1]);
      }
      tried.push([top, path.join(home, top) + ' (two folders deep)']);
    }
  }
  return {
    path: null, tried,
    msg: 'SOEdit.exe was not found. Get it with "node tools/soedit/soedit.js install", or set ARSENAL_SOEDIT to the path of SOEdit.exe. Looked in: ' +
      tried.map(t => `${t[0]} ${t[1]}`).join('; ') + '.',
  };
}

module.exports = { locate, installDir, sha256File, EXE };
