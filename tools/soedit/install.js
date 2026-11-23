// soedit/install: get SOEdit when it is not on this computer. SOEdit is not part of ARSENAL and is not shipped with it (owner
// 2026-11-15): this downloads the latest release of the GitHub repository named in soedit-pin.json (pin.repo), checks its size and,
// when GitHub lists one, its SHA-256, unpacks it and puts it into the user's ARSENAL folder (locate.installDir), where locate finds it.
// When GitHub cannot be asked (no network, rate limit) the package pinned in the same file (url, sha256, size) is taken instead.
//   install({pin?, pinFile?, dest?, env?, log?, get?, allow?, api?}) -> Promise<{code, path?, msg}>
//   pin = {repo?, url?, sha256?, size?}. latest(repo, {api?}) -> {url, size, sha256, tag, name}: the first .7z or .zip file of the
//   newest published release (pre-releases included); its address must be a release file of that same repository. Every download address must be an https://github.com/
//   release file (opt.allow replaces the rule: tests use a local fixture server, never the real one). Nothing is run from the download
//   and nothing is kept unless size and checksum fit.
//   An empty pin (no package published yet) is a plain refusal, exit 3, with what to do instead.
// Author: Imperator_Aug (ARSENAL, ia-6ad137e5)
const fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');
const { installDir, EXE } = require('./locate');
const PIN = path.join(__dirname, 'soedit-pin.json');
const MAX = 300 * 1024 * 1024;
const ALLOW = /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\//;

const REPO_OK = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
// GET a small JSON answer of the GitHub API (no token, no user data sent)
function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = require('https').get(new URL(url), { headers: { 'user-agent': 'arsenal-soedit-install', accept: 'application/vnd.github+json' }, timeout: 20000 }, res => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('GitHub answered ' + res.statusCode)); }
      const bufs = []; let n = 0;
      res.on('data', d => { n += d.length; if (n > 4 * 1024 * 1024) req.destroy(new Error('the answer is too large')); else bufs.push(d); });
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(bufs).toString('utf8'))); } catch (e) { reject(new Error('GitHub sent an answer that is not JSON')); } });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('GitHub did not answer in time')));
    req.on('error', reject);
  });
}
// the package of the latest release of owner/name
async function latest(repo, o = {}) {
  if (!REPO_OK.test(String(repo || ''))) throw new Error('the repository name in soedit-pin.json is not owner/name');
  // the newest published release, pre-releases included (the owner's pick 1.3 is one; GitHub's own "latest" skips them); drafts never
  const list = await (o.api || getJson)('https://api.github.com/repos/' + repo + '/releases?per_page=20');
  const rel = (Array.isArray(list) ? list : []).filter(x => x && !x.draft).sort((x, y) => String(y.published_at || y.created_at || '').localeCompare(String(x.published_at || x.created_at || '')))[0];
  if (!rel) throw new Error(repo + ' has no published release');
  const assets = rel && Array.isArray(rel.assets) ? rel.assets : [];
  const a = assets.find(x => x && /\.7z$/i.test(x.name || '')) || assets.find(x => x && /\.zip$/i.test(x.name || ''));
  if (!a) throw new Error('the latest release of ' + repo + ' has no .7z or .zip file');
  const url = String(a.browser_download_url || ''), own = 'https://github.com/' + repo + '/releases/download/';
  if (!o.anyHost && url.toLowerCase().indexOf(own.toLowerCase()) !== 0) throw new Error('the latest release names a file outside ' + repo);
  const dg = /^sha256:([0-9a-f]{64})$/i.exec(String(a.digest || ''));
  return { url, size: Number(a.size) || 0, sha256: dg ? dg[1].toLowerCase() : '', tag: String(rel.tag_name || ''), name: String(a.name) };
}
function readPin(file) {
  let j = null; try { j = JSON.parse(fs.readFileSync(file || PIN, 'utf8')); } catch (e) { j = null; }
  return j && typeof j === 'object' ? j : {};
}
// GET with redirects (a GitHub release file answers with one); every hop must be https unless the first address is not
function get(url, file, o = {}) {
  return new Promise((resolve, reject) => {
    let hops = 0;
    const go = u => {
      const U = new URL(u), secure = U.protocol === 'https:';
      if (!secure && !o.plain) return reject(new Error('the download address is not https'));
      const req = (secure ? require('https') : require('http')).get(U, { headers: { 'user-agent': 'arsenal-soedit-install' }, timeout: 30000 }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); if (++hops > 5) return reject(new Error('too many redirects')); return go(new URL(res.headers.location, U).href); }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error('the server answered ' + res.statusCode)); }
        const out = fs.createWriteStream(file), h = crypto.createHash('sha256'); let n = 0;
        res.on('data', d => { n += d.length; h.update(d); if (n > (o.max || MAX)) { req.destroy(new Error('the download is larger than allowed')); } });
        res.pipe(out);
        out.on('finish', () => resolve({ size: n, sha256: h.digest('hex') }));
        out.on('error', reject); res.on('error', reject);
      });
      req.on('timeout', () => req.destroy(new Error('the download timed out')));
      req.on('error', reject);
    };
    go(url);
  });
}
// unpack the package into dir: a .zip with the built-in reader; a .7z with 7-Zip (PATH, then its usual folders) or the system tar
// (Windows 11 and Linux can read .7z with it). No unpacker for .7z on the computer -> code 4 with what to install.
function unpack(file, dir, kind, o = {}) {
  if (kind !== '7z') {
    const P = require('../lib/pak');
    for (const e of P.list(file)) if (/(^|\/)\.\.(\/|$)|^[/\\]|^[A-Za-z]:/.test(e.name)) throw new Error('the package has a file path that leaves its folder');
    P.extract(file, dir); return;
  }
  const run = o.spawnSync || require('child_process').spawnSync, env = o.env || process.env;
  const a7 = ['x', '-y', '-o' + dir, file], tries = o.unpackers || [['7z', a7], ['7za', a7], ['7zr', a7]];
  if (!o.unpackers) {
    for (const pf of [env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramW6432]) if (pf) tries.push([path.join(pf, '7-Zip', '7z.exe'), a7]);
    if (env.SystemRoot) tries.push([path.join(env.SystemRoot, 'System32', 'tar.exe'), ['-xf', file, '-C', dir]]);
    tries.push(['tar', ['-xf', file, '-C', dir]]);
  }
  for (const [exe, args] of tries) {
    if (path.isAbsolute(exe) && !fs.existsSync(exe)) continue;
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const r = run(exe, args, { stdio: 'ignore', windowsHide: true, timeout: 120000 });
    if (r && !r.error && r.status === 0 && fs.readdirSync(dir).length) return;
  }
  const e = new Error('the package is a .7z file and this computer has no program that can unpack it. Install 7-Zip (7-zip.org), then press the button again'); e.code4 = true; throw e;
}
function findExe(dir, depth) {
  if (fs.existsSync(path.join(dir, EXE))) return dir;
  if (depth > 1) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) { const r = findExe(path.join(dir, e.name), depth + 1); if (r) return r; }
  return null;
}
async function install(o = {}) {
  const log = o.log || (s => console.log(s)), allow = o.allow || ALLOW;
  let pin = o.pin || readPin(o.pinFile);
  const dest = o.dest || installDir(o.env);
  if (pin.repo) {
    try {
      const l = await latest(pin.repo, { api: o.api, anyHost: !!o.allow });
      log('The latest SOEdit release of ' + pin.repo + ' is ' + (l.tag || '(no tag)') + ': ' + l.name + '.');
      pin = { url: l.url, sha256: l.sha256, size: l.size, noSum: !l.sha256 };
    } catch (e) {
      if (!pin.url || !pin.sha256) { const msg = 'soedit install: the latest release could not be read from GitHub (' + e.message + '). Check the network and try again, or set ARSENAL_SOEDIT to the path of a SOEdit.exe you already have.'; log(msg); return { code: 2, msg }; }
      log('The latest release could not be read from GitHub (' + e.message + '); taking the pinned package instead.');
    }
  }
  if (!pin.url || (!pin.sha256 && !pin.noSum)) {
    const msg = 'There is no SOEdit download for this copy of ARSENAL yet. Set ARSENAL_SOEDIT to the path of a SOEdit.exe you already have.';
    log(msg); return { code: 3, msg };
  }
  if (!allow.test(pin.url)) { const msg = 'soedit install: the download address in soedit-pin.json is not a GitHub release file, so nothing was downloaded.'; log(msg); return { code: 2, msg }; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arsenal-soedit-')), zip = path.join(tmp, 'soedit.zip'), un = path.join(tmp, 'un');
  try {
    log('Downloading SOEdit from ' + pin.url + ' ...');
    const got = await (o.get || get)(pin.url, zip, { plain: !!o.allow, max: pin.size ? pin.size + 1 : MAX });
    if (pin.size && got.size !== pin.size) throw new Error('the download has ' + got.size + ' bytes, expected ' + pin.size);
    if (pin.sha256 && got.sha256.toLowerCase() !== String(pin.sha256).toLowerCase()) throw new Error('the download does not match the expected checksum, so it was thrown away');
    if (!pin.sha256) log('GitHub lists no checksum for this file; its size fits (' + got.size + ' bytes, sha256 ' + got.sha256 + ').');
    fs.mkdirSync(un, { recursive: true });
    unpack(zip, un, /\.7z(\?|$)/i.test(pin.url) ? '7z' : 'zip', o);
    const src = findExe(un, 0);
    if (!src) throw new Error('the package has no ' + EXE);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const old = dest + '.old-' + process.pid;
    if (fs.existsSync(dest)) fs.renameSync(dest, old);
    try { fs.cpSync(src, dest, { recursive: true }); } catch (e) { fs.rmSync(dest, { recursive: true, force: true }); if (fs.existsSync(old)) fs.renameSync(old, dest); throw e; }
    fs.rmSync(old, { recursive: true, force: true });
    const p = path.join(dest, EXE), msg = 'SOEdit was installed in ' + dest + '.';
    log(msg); return { code: 0, path: p, msg };
  } catch (e) {
    const msg = 'soedit install: ' + e.message + '.'; log(msg); return { code: e.code4 ? 4 : 2, msg };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
module.exports = { install, latest, readPin, get, unpack, PIN, ALLOW };
