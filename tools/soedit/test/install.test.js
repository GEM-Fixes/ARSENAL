// soedit install / start / wider locate: a fixture zip on a local server (never the real download place), a fixture home folder.
// No window is started (spawn is a stub), nothing is written outside a temp dir. Last line PASS on success.
// Author: Imperator_Aug (ARSENAL, ia-32da1ba6)
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), crypto = require('crypto'), assert = require('assert');
const L = require('../locate'), I = require('../install'), CLI = require('../soedit'), Z = require('../../lib/zipwrite');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'soedit-inst-'));
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };
const quiet = () => { const out = []; return { log: s => out.push(s), out }; };

(async () => {
  // ---- locate: a copy installed somewhere else
  const home = path.join(root, 'home'), tool = path.join(home, 'Desktop', 'tools', 'SOEdit');
  fs.mkdirSync(tool, { recursive: true }); fs.writeFileSync(path.join(tool, 'SOEdit.exe'), 'other build');
  fs.mkdirSync(path.join(home, 'Desktop', 'a', 'b', 'c'), { recursive: true }); fs.writeFileSync(path.join(home, 'Desktop', 'a', 'b', 'c', 'SOEdit.exe'), 'too deep');
  const base = { env: {}, execPath: 'C:/x/node.exe', repo: path.join(root, 'norepo') };
  let r = L.locate(Object.assign({ home }, base));
  assert.deepStrictEqual([r.source, r.ours, r.path], ['found', false, path.join(tool, 'SOEdit.exe')]); ok('locate finds a copy on the Desktop, two folders deep, and marks it as not the ARSENAL build');
  fs.rmSync(tool, { recursive: true, force: true });
  r = L.locate(Object.assign({ home }, base));
  assert.strictEqual(r.path, null); assert.ok(/soedit\.js install/.test(r.msg)); ok('a copy three folders deep is not searched for; the message names install');
  r = L.locate(base); assert.ok(r.path === null && !r.tried.some(t => t[0] === 'Desktop')); ok('a caller that passes its own env gets no search of the real home');
  const data = path.join(root, 'data'), dest = L.installDir({ LOCALAPPDATA: data });
  assert.strictEqual(dest, path.join(data, 'ARSENAL', 'soedit')); ok('install folder is under the user data folder');

  // ---- install from a local fixture server
  const zip = Z.zip([['soedit/SOEdit.exe', Buffer.from('fixture exe')], ['soedit/FreeImage.dll', Buffer.from('dll')], ['soedit/lang/ru.txt', Buffer.from('ru')]]);
  const sha = crypto.createHash('sha256').update(zip).digest('hex');
  const srv = http.createServer((q, s) => { if (q.url === '/hop') { s.writeHead(302, { location: '/soedit.zip' }); return s.end(); } if (q.url.startsWith('/soedit.zip')) { s.writeHead(200); return s.end(zip); } s.writeHead(404); s.end(); });
  await new Promise(res => srv.listen(0, '127.0.0.1', res));
  const url = 'http://127.0.0.1:' + srv.address().port, allow = /^http:\/\/127\.0\.0\.1:\d+\//;
  try {
    let q = quiet(), x = await I.install({ pin: {}, dest, log: q.log });
    assert.strictEqual(x.code, 3); assert.ok(!fs.existsSync(dest)); ok('no package named: plain refusal, nothing written');
    x = await I.install({ pin: { url: url + '/soedit.zip', sha256: sha, size: zip.length }, dest, log: q.log });
    assert.strictEqual(x.code, 2); assert.ok(/not a GitHub release/.test(x.msg)); ok('an address that is not a GitHub release file is refused');
    x = await I.install({ pin: { url: url + '/soedit.zip', sha256: 'ab'.repeat(32), size: zip.length }, dest, log: q.log, allow });
    assert.strictEqual(x.code, 2); assert.ok(/checksum/.test(x.msg) && !fs.existsSync(dest)); ok('wrong checksum: thrown away, nothing installed');
    x = await I.install({ pin: { url: url + '/soedit.zip', sha256: sha, size: zip.length + 5 }, dest, log: q.log, allow });
    assert.strictEqual(x.code, 2); ok('wrong size refused');
    x = await I.install({ pin: { url: url + '/missing.zip', sha256: sha, size: zip.length }, dest, log: q.log, allow });
    assert.strictEqual(x.code, 2); assert.ok(/404/.test(x.msg)); ok('a missing file is reported');
    x = await I.install({ pin: { url: url + '/hop', sha256: sha, size: zip.length }, dest, log: q.log, allow });
    assert.strictEqual(x.code, 0, x.msg); assert.strictEqual(fs.readFileSync(path.join(dest, 'SOEdit.exe'), 'utf8'), 'fixture exe'); assert.ok(fs.existsSync(path.join(dest, 'lang', 'ru.txt')));
    ok('download through a redirect, checksum ok, unpacked into the install folder');
    r = L.locate(Object.assign({}, base, { env: { LOCALAPPDATA: data } }));
    assert.deepStrictEqual([r.source, r.path], ['installed', path.join(dest, 'SOEdit.exe')]); ok('locate finds the installed copy');
    fs.writeFileSync(path.join(dest, 'old.txt'), 'x');
    x = await I.install({ pin: { url: url + '/soedit.zip', sha256: sha, size: zip.length }, dest, log: q.log, allow });
    assert.strictEqual(x.code, 0); assert.ok(!fs.existsSync(path.join(dest, 'old.txt'))); ok('installing again replaces the folder');
    // ---- the latest release of the pinned repository (owner 2026-11-15): GitHub's list is a fixture here, never the real one
    const rels = [
      { tag_name: '1.2', draft: false, prerelease: false, published_at: '2026-01-01T00:00:00Z', assets: [{ name: 'Release.zip', size: 5, browser_download_url: url + '/missing.zip' }] },
      { tag_name: '9.9', draft: true, published_at: '2026-09-01T00:00:00Z', assets: [{ name: 'Draft.zip', size: 5, browser_download_url: url + '/missing.zip' }] },
      { tag_name: '1.3', draft: false, prerelease: true, published_at: '2026-05-01T00:00:00Z', assets: [{ name: 'notes.txt', size: 1, browser_download_url: url + '/notes.txt' }, { name: 'Release.zip', size: zip.length, digest: 'sha256:' + sha, browser_download_url: url + '/soedit.zip' }] }];
    let asked = '';
    const api = async u => { asked = u; return rels; };
    let l = await I.latest('own/rep', { api, anyHost: true });
    assert.deepStrictEqual([l.tag, l.name, l.size, l.sha256, l.url], ['1.3', 'Release.zip', zip.length, sha, url + '/soedit.zip']);
    assert.strictEqual(asked, 'https://api.github.com/repos/own/rep/releases?per_page=20'); ok('latest: the newest published release, a pre-release counts, a draft does not; the package file, not the notes');
    await assert.rejects(I.latest('own/rep', { api }), /outside own\/rep/); ok('latest: a file address outside the repository is refused');
    await assert.rejects(I.latest('not a repo', { api }), /owner\/name/); await assert.rejects(I.latest('own/rep', { api: async () => [] }), /no published release/);
    await assert.rejects(I.latest('own/rep', { api: async () => [{ tag_name: 'x', assets: [{ name: 'a.txt' }] }] }), /no \.7z or \.zip/); ok('latest: a bad repository name, no release, no package file: plain errors');
    const dl = path.join(root, 'latest-dest');
    x = await I.install({ pin: { repo: 'own/rep' }, dest: dl, log: q.log, allow, api });
    assert.strictEqual(x.code, 0); assert.ok(fs.existsSync(path.join(dl, 'SOEdit.exe'))); ok('install: the latest release is downloaded, checksum from the release list checked');
    const bad = async () => [{ tag_name: '2.0', published_at: '2026-06-01T00:00:00Z', assets: [{ name: 'Release.zip', size: zip.length, digest: 'sha256:' + 'ab'.repeat(32), browser_download_url: url + '/soedit.zip' }] }];
    const d2 = path.join(root, 'latest-bad');
    x = await I.install({ pin: { repo: 'own/rep' }, dest: d2, log: q.log, allow, api: bad });
    assert.strictEqual(x.code, 2); assert.ok(/checksum/.test(x.msg) && !fs.existsSync(d2)); ok('install: a latest release that does not match its listed checksum is thrown away');
    const down = async () => { throw new Error('no network'); };
    x = await I.install({ pin: { repo: 'own/rep' }, dest: d2, log: q.log, allow, api: down });
    assert.strictEqual(x.code, 2); assert.ok(/could not be read from GitHub/.test(x.msg) && !fs.existsSync(d2)); ok('install: GitHub not reachable and no pinned package: plain line, nothing written');
    x = await I.install({ pin: { repo: 'own/rep', url: url + '/soedit.zip', sha256: sha, size: zip.length }, dest: d2, log: q.log, allow, api: down });
    assert.strictEqual(x.code, 0); assert.ok(fs.existsSync(path.join(d2, 'SOEdit.exe'))); ok('install: GitHub not reachable: the pinned package is taken, checksum checked');
    const real = I.readPin(); assert.ok(/^[\w.-]+\/[\w.-]+$/.test(real.repo) && real.url.indexOf('https://github.com/' + real.repo + '/releases/download/') === 0 && /^[0-9a-f]{64}$/.test(real.sha256)); ok('soedit-pin.json: a repository, and a fallback package of that same repository with its checksum');
    // a .7z package (the real one is): made here with 7-Zip when the computer has it; without an unpacker the refusal is plain
    const seven = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean).map(p => path.join(p, '7-Zip', '7z.exe')).find(p => fs.existsSync(p));
    const d7 = path.join(data, 'seven');
    x = await I.install({ pin: { url: url + '/soedit.zip?as=.7z', sha256: sha, size: zip.length }, dest: d7, log: q.log, allow, unpackers: [] });
    assert.strictEqual(x.code, 4); assert.ok(/7-Zip/.test(x.msg) && !fs.existsSync(d7)); ok('.7z with no unpacker on the computer: says to install 7-Zip, nothing installed');
    if (seven) {
      const src = path.join(root, 'pk', 'Release'); fs.mkdirSync(src, { recursive: true }); fs.writeFileSync(path.join(src, 'SOEdit.exe'), 'seven exe');
      const f7 = path.join(root, 'Release.7z');
      const mk = require('child_process').spawnSync(seven, ['a', '-y', f7, src], { stdio: 'ignore', windowsHide: true });
      assert.strictEqual(mk.status, 0); const b7 = fs.readFileSync(f7);
      srv.removeAllListeners('request'); srv.on('request', (rq, rs) => { rs.writeHead(200); rs.end(b7); });
      x = await I.install({ pin: { url: url + '/Release.7z', sha256: crypto.createHash('sha256').update(b7).digest('hex'), size: b7.length }, dest: d7, log: q.log, allow });
      assert.strictEqual(x.code, 0, x.msg); assert.strictEqual(fs.readFileSync(path.join(d7, 'SOEdit.exe'), 'utf8'), 'seven exe');
      r = L.locate(Object.assign({}, base, { env: { ARSENAL_HOME: path.join(data, 'h') } })); assert.strictEqual(r.path, null);
      fs.mkdirSync(path.join(data, 'h'), { recursive: true }); fs.cpSync(d7, path.join(data, 'h', 'soedit'), { recursive: true });
      r = L.locate(Object.assign({}, base, { env: { ARSENAL_HOME: path.join(data, 'h') } }));
      assert.deepStrictEqual([r.source, r.ours], ['installed', false]);
      ok('.7z package unpacked with 7-Zip (exe one folder deep); a downloaded copy without UPSTREAM.md is not the ARSENAL build');
    } else ok('.7z unpack: skipped, no 7-Zip on this computer');
  } finally { srv.close(); }
  assert.deepStrictEqual(I.readPin(), Object.assign(I.readPin(), { url: I.readPin().url || '' })); assert.ok(I.readPin().url === '' || I.ALLOW.test(I.readPin().url)); ok('the shipped pin is empty or a GitHub release file');

  // ---- start: the program alone
  const calls = [], spawn = (exe, args, opt) => { calls.push({ exe, args, opt }); return { pid: 7, unref() {}, on() {} }; };
  let q = quiet();
  assert.strictEqual(CLI.startBare({ lang: 'uk', log: q.log, spawn, locate: () => ({ path: 'X/SOEdit.exe', source: 'build', sha256: 'h' }) }), 0);
  assert.deepStrictEqual([calls[0].exe, calls[0].args, calls[0].opt.detached], ['X/SOEdit.exe', ['--lang', 'uk'], true]); ok('start: the ARSENAL build gets the page language');
  assert.strictEqual(CLI.startBare({ log: q.log, spawn, locate: () => ({ path: 'Y/SOEdit.exe', source: 'found', ours: false, sha256: 'h' }) }), 0);
  assert.deepStrictEqual(calls[1].args, []); ok('start: a copy from somewhere else gets no options');
  assert.strictEqual(CLI.startBare({ log: q.log, spawn, locate: () => ({ path: null, msg: 'SOEdit.exe was not found.' }) }), 2); assert.strictEqual(calls.length, 2); ok('start: not found is exit 2, nothing started');
  assert.strictEqual(CLI.startBare({ dry: true, log: q.log, spawn, locate: () => ({ path: 'X/SOEdit.exe', source: 'build' }) }), 0); assert.strictEqual(calls.length, 2); ok('start --dry starts nothing');
  console.log('PASS soedit install (' + n + ')');
})().catch(e => { console.error(e); console.log('FAIL'); process.exitCode = 1; }).finally(() => fs.rmSync(root, { recursive: true, force: true }));
