// X3: winreg (reg export parsing, non-ASCII), gamedir.defaultReg through winreg's run seam, userdir Documents candidates,
// cachewrite degrade. No real registry: every reg read goes through an injected run/readReg.
// Author: Imperator_Aug (ARSENAL, ia-b78cf8c8)
const path = require('path'), fs = require('fs'), os = require('os');
module.exports = (t, assert) => {
  const w = require('../winreg');
  // a .reg file as `reg export` writes it: UTF-16LE with BOM, CRLF, long hex(2) values wrapped with "\"
  const hex2 = s => Buffer.from(s + '\0', 'utf16le').toString('hex').match(/../g).join(',');
  const wrap = h => { const p = h.split(','), out = []; for (let i = 0; i < p.length; i += 20) out.push(p.slice(i, i + 20).join(',')); return out.join(',\\\r\n  '); };
  const regFile = body => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Windows Registry Editor Version 5.00\r\n\r\n' + body + '\r\n', 'utf16le')]);
  const STEAM = 'D:\\Spiele\\Größe Привет\\Steam';
  const steamReg = regFile('[HKEY_CURRENT_USER\\Software\\Valve\\Steam]\r\n"Language"="german"\r\n"SteamPath"="' + STEAM.replace(/\\/g, '\\\\') + '"\r\n\r\n' +
    '[HKEY_CURRENT_USER\\Software\\Valve\\Steam\\Apps]\r\n"SteamPath"="wrong section"\r\n');
  t('winreg parse non-ASCII REG_SZ (reg export UTF-16LE)', () => {
    assert.equal(w.parseExport(steamReg, 'HKCU\\Software\\Valve\\Steam', 'SteamPath'), STEAM);
    assert.equal(w.parseExport(steamReg, 'HKCU\\Software\\Valve\\Steam', 'steampath'), STEAM);
    assert.equal(w.parseExport(steamReg, 'HKCU\\Software\\Valve\\Steam', 'Nope'), null);
    assert.equal(w.parseExport(steamReg, 'HKCU\\Software\\Valve\\Other', 'SteamPath'), null);
    assert.equal(w.parseExport(regFile('[HKEY_CURRENT_USER\\K]\r\n"Q"="a \\"b\\" c\\\\"\r\n'), 'HKCU\\K', 'Q'), 'a "b" c\\');
    assert.equal(w.parseExport(regFile('[HKEY_CURRENT_USER\\K]\r\n"N"=dword:00000001\r\n'), 'HKCU\\K', 'N'), null);
  });
  t('gamedir.defaultReg decodes a non-ASCII SteamPath (run seam, no registry)', () => {
    const gd = require('../gamedir');
    let args = null;
    assert.equal(gd.defaultReg({ run: a => { args = a; return steamReg; } }), STEAM);
    assert.deepEqual(args, ['export', 'HKCU\\Software\\Valve\\Steam']);
    assert.equal(gd.defaultReg({ run: () => null }), null);
    assert.equal(gd.defaultReg({ run: () => { throw new Error('x'); } }), null);
    // the old `reg query` + utf8 decode: OEM bytes (cp850 'ö' = 0x94) became U+FFFD; the export path never sees console bytes
    assert.notEqual(Buffer.from([0x94]).toString('utf8'), 'ö');
  });
  const USF = '[HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders]';
  t('winreg hex(2) REG_EXPAND_SZ wrapped + expandEnv', () => {
    const v = '%USERPROFILE%\\Dokumente Ä';
    const b = regFile(USF + '\r\n"AppData"=hex(2):' + wrap(hex2('%USERPROFILE%\\AppData\\Roaming')) + '\r\n"Personal"=hex(2):' + wrap(hex2(v)) + '\r\n');
    const raw = w.readValue('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders', 'Personal', { run: () => b });
    assert.equal(raw, v);
    assert.equal(w.expandEnv(raw, { UserProfile: 'C:\\Users\\Jörg' }), 'C:\\Users\\Jörg\\Dokumente Ä');
    assert.equal(w.expandEnv('%NOPE%\\x', {}), '%NOPE%\\x');
  });
  t('userdir Documents candidates: registry first, OneDrive - org, old order, no duplicates', () => {
    const u = require('../userdir');
    const home = path.resolve('/h/me'), J = (...a) => path.join(home, ...a);
    const old = [J('Documents'), J('OneDrive', 'Documents'), J('OneDrive', 'Desktop', 'Documents')];
    const none = { readReg: () => null, listDir: () => [] };
    assert.deepEqual(u.docsCandidates(home, none), old);
    const moved = path.resolve('/d/Docs');
    const c = u.docsCandidates(home, { readReg: () => '%MYD%\\Docs', env: { MYD: path.resolve('/d') }, listDir: () => ['OneDrive - Contoso', 'OneDrive', 'Music'] });
    assert.deepEqual(c, [moved, J('OneDrive - Contoso', 'Documents'), ...old]);
    // registry pointing at ~/Documents (the usual case): kept once, first
    assert.deepEqual(u.docsCandidates(home, { readReg: () => J('Documents'), listDir: () => [], platform: 'win32' }), old);
    // unexpandable %VAR% or a relative value is not a candidate
    assert.deepEqual(u.docsCandidates(home, { readReg: () => '%NOPE%\\Docs', env: {}, listDir: () => [] }), old);
    // userDir picks the moved folder when the game's dir is there; old behaviour when only ~/Documents has it
    const base = p => path.join(p, 'my games', 'men of war - assault squad 2');
    const opt = { home, readReg: () => moved, listDir: () => [], exists: p => p === base(moved) || p === base(J('Documents')) };
    assert.equal(u.userDir(0, opt), base(moved));
    assert.equal(u.userDir(2, opt), base(moved) + ' - instance 2');
    assert.equal(u.userDir(0, { home, readReg: () => null, listDir: () => [], exists: p => p === base(J('Documents')) }), base(J('Documents')));
    assert.equal(u.userDir(0, { home, readReg: () => null, listDir: () => ['OneDrive - X'], exists: p => p === base(J('OneDrive - X', 'Documents')) }), base(J('OneDrive - X', 'Documents')));
    assert.equal(u.userDir(0, { home, exists: () => false }), null);   // opt.home without readReg: no registry read
  });
  // P5: Linux profile under Steam Proton, found through the appmanifest (no app id needed), GoH user dir, macOS none
  const same = (a, b) => (process.platform === 'win32' || process.platform === 'darwin' ? String(a).toLowerCase() === String(b).toLowerCase() : a === b);
  const md = (...a) => { const d = path.join(...a); fs.mkdirSync(d, { recursive: true }); return d; };
  const lx = (home, extra = {}) => ({ platform: 'linux', home, env: {}, cwd: home, readReg: () => { throw new Error('registry read off Windows'); }, ...extra });
  t('userdir linux: Proton prefix through the appmanifest, instance suffix, older My Documents', () => {
    const u = require('../userdir'), h = fs.mkdtempSync(path.join(os.tmpdir(), 'ud-home-'));
    try {
      const apps = md(h, '.local', 'share', 'Steam', 'steamapps');
      md(apps, 'common', 'Men of War Assault Squad 2');
      fs.writeFileSync(path.join(apps, 'appmanifest_7654321.acf'), '"AppState"\n{\n "appid" "7654321"\n "installdir" "Men of War Assault Squad 2"\n}\n');
      const users = md(apps, 'compatdata', '7654321', 'pfx', 'drive_c', 'users', 'steamuser');
      assert.equal(u.userDir(0, lx(h)), null);
      assert.ok(/Proton prefix/.test(u.find(0, lx(h)).why), u.find(0, lx(h)).why);
      const main = md(users, 'Documents', 'My Games', 'Men of War - Assault Squad 2');
      assert.ok(same(u.userDir(0, lx(h)), main), u.userDir(0, lx(h)));
      assert.ok(same(u.userDir(3, lx(h)), main + ' - instance 3'));
      assert.ok(same(u.logDir(0, lx(h)), path.join(main, 'log')));
      fs.rmSync(path.join(users, 'Documents'), { recursive: true, force: true });
      const old = md(users, 'My Documents', 'my games', 'men of war - assault squad 2');
      assert.ok(same(u.userDir(0, lx(h)), old));
      // no prefix at all: null and a plain reason
      const h2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ud-home-'));
      const f = u.find(0, lx(h2));
      assert.equal(f.dir, null); assert.ok(/no Proton prefix of the game/.test(f.why), f.why);
      fs.rmSync(h2, { recursive: true, force: true });
    } finally { fs.rmSync(h, { recursive: true, force: true }); }
  });
  t('userdir GoH user dir: Windows LOCALAPPDATA, Linux Proton prefix, macOS none', () => {
    const u = require('../userdir'), h = fs.mkdtempSync(path.join(os.tmpdir(), 'ud-goh-'));
    try {
      const la = md(h, 'la'), g = md(la, 'digitalmindsoft', 'gates of hell');
      assert.equal(u.gohUserDir({ platform: 'win32', env: { LOCALAPPDATA: la }, home: h }), g);
      assert.equal(u.gohUserDir({ platform: 'win32', env: {}, home: h }), null);
      assert.ok(/no Gates of Hell user folder at /.test(u.gohFind({ platform: 'win32', env: {}, home: h }).why));
      // GoH's rule: Documents under OneDrive -> LocalAppData; plain Documents -> <Documents>/My Games/Gates of Hell, LocalAppData second
      const od = md(h, 'OneDrive', 'Documents'); md(od, 'My Games', 'Gates of Hell');
      assert.equal(u.gohUserDir({ platform: 'win32', env: { LOCALAPPDATA: la }, home: h }), g, 'OneDrive Documents: LocalAppData');
      const dg = md(h, 'Documents', 'My Games', 'Gates of Hell');
      assert.equal(u.gohUserDir({ platform: 'win32', env: { LOCALAPPDATA: la }, home: h }), dg, 'plain Documents: under My Games');
      fs.rmSync(dg, { recursive: true, force: true });
      assert.equal(u.gohUserDir({ platform: 'win32', env: { LOCALAPPDATA: la }, home: h }), g, 'plain Documents without the folder: LocalAppData');
      fs.rmSync(path.join(h, 'Documents'), { recursive: true, force: true }); fs.rmSync(path.join(h, 'OneDrive'), { recursive: true, force: true });
      const lib = md(h, '.steam', 'steam');
      const apps = md(lib, 'steamapps');
      md(apps, 'common', 'Call to Arms - Gates of Hell');
      fs.writeFileSync(path.join(apps, 'appmanifest_400750.acf'), '"AppState" { "appid" "400750" "installdir" "Call to Arms - Gates of Hell" }');
      const pg = md(apps, 'compatdata', '400750', 'pfx', 'drive_c', 'users', 'steamuser', 'AppData', 'Local', 'DigitalMindSoft', 'Gates of Hell');
      assert.ok(same(u.gohUserDir(lx(h)), pg), String(u.gohUserDir(lx(h))));
      const mac = u.gohFind({ platform: 'darwin', home: h });
      assert.equal(mac.dir, null); assert.ok(/macOS/.test(mac.why));
      const m0 = u.find(0, { platform: 'darwin', home: h });
      assert.equal(m0.dir, null); assert.ok(/does not run on macOS/.test(m0.why));
      assert.equal(u.userDir(0, { platform: 'darwin', home: h }), null);
    } finally { fs.rmSync(h, { recursive: true, force: true }); }
  });
  t('toolcache: per-user folder, an old cache in the tools folder copied over once, --cache elsewhere kept', () => {
    const tc = require('../toolcache'), d = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-'));
    try {
      const env = { ARSENAL_CACHE: path.join(d, 'user') }, legacy = md(d, 'tools', 'x', 'cache');
      assert.equal(tc.dir('x', { env }), path.join(d, 'user', 'x'));
      fs.writeFileSync(path.join(legacy, 'old.json'), '{"o":1}');
      const f = tc.file('x', 'old.json', legacy, { env });
      assert.equal(f, path.join(d, 'user', 'x', 'old.json'));
      assert.equal(fs.readFileSync(f, 'utf8'), '{"o":1}');
      assert.equal(tc.file('x', 'new.json', legacy, { env }), path.join(d, 'user', 'x', 'new.json'));
      assert.equal(tc.redirect('x', path.join(legacy, 'old.json'), legacy, { env }), f);
      assert.equal(tc.redirect('x', path.join(d, 'mine.json'), legacy, { env }), path.join(d, 'mine.json'));
      // Windows default: %LOCALAPPDATA%\ARSENAL\cache\<tool>; Linux XDG cache
      assert.equal(tc.dir('gen', { platform: 'win32', env: { LOCALAPPDATA: 'C:\\L' } }), path.win32.join('C:\\L', 'ARSENAL', 'cache', 'gen'));
      assert.ok(/arsenal[\\/]gen$/.test(tc.dir('gen', { platform: 'linux', env: {}, home: '/home/u' })));
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
  });
  t('cachewrite: unwritable path warns once, never throws; writable path writes', () => {
    const cw = require('../cachewrite');
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-')), file = path.join(d, 'f');
    fs.writeFileSync(file, 'x');
    const errs = [], ce = console.error; console.error = m => errs.push(String(m));
    cw._reset();
    try {
      assert.equal(cw.write(path.join(file, 'sub', 'c.json'), '{}'), false);
      assert.equal(cw.mkdir(path.join(file, 'sub2')), false);
      assert.equal(cw.write(path.join(d, 'ok', 'c.json'), '{"a":1}'), true);
    } finally { console.error = ce; cw._reset(); }
    assert.equal(errs.length, 1);
    assert.ok(/^cache not written \([A-Z]+\): /.test(errs[0]), errs[0]);
    assert.equal(fs.readFileSync(path.join(d, 'ok', 'c.json'), 'utf8'), '{"a":1}');
    fs.rmSync(d, { recursive: true, force: true });
  });
};
