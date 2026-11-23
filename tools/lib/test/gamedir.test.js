// gamedir.resolve: fake env / registry / vdf, no real IO
// Author: Imperator_Aug (ARSENAL, ia-46b4b4c3)
const path = require('path');
module.exports = (t, assert) => {
  const { resolve, parseVdfPaths } = require('../gamedir');
  const files = {}, dirs = new Set();
  const base = { cwd: path.resolve('/w/a/b'), env: {}, readReg: () => null, readFile: f => files[path.resolve(f)] ?? null, exists: d => dirs.has(path.resolve(d)) };
  const P = (...a) => path.resolve(...a);
  t('gamedir order', () => {
    assert.deepEqual(resolve({ ...base, arg: 'X' }), { dir: 'X', source: 'arg' });
    dirs.add(P('/g/env'));
    assert.equal(resolve({ ...base, env: { AS2_GAME: P('/g/env') } }).source, 'env');
    assert.equal(resolve({ ...base, env: { AS2_GAME: P('/g/none') }, noSteam: true }).dir, null);
    files[P('/w/as2.json')] = '{"game":"/g/js","profile":"p.set"}'; dirs.add(P('/g/js'));
    const j = resolve({ ...base });
    assert.equal(j.source, 'as2.json'); assert.equal(j.dir, P('/g/js')); assert.equal(j.profile, 'p.set');
    assert.equal(resolve({ ...base, env: { AS2_GAME: P('/g/env') } }).source, 'env');
    delete files[P('/w/as2.json')];
  });
  t('gamedir steam', () => {
    const vdf = '"libraryfolders"\n{\n "0" { "path" "C:\\\\Steam" }\n "1" { "path" "D:\\\\SteamLibrary" "apps" { "244450" "1" } }\n}';
    assert.deepEqual(parseVdfPaths(vdf), ['C:\\Steam', 'D:\\SteamLibrary']);
    files[P('/st/steamapps/libraryfolders.vdf')] = '"x" { "0" { "path" "' + P('/lib2').replace(/\\/g, '\\\\') + '" } }';
    dirs.add(P('/lib2/steamapps/common/Men of War Assault Squad 2'));
    const r = resolve({ ...base, readReg: () => P('/st') });
    assert.equal(r.source, 'steam'); assert.equal(r.dir, P('/lib2/steamapps/common/Men of War Assault Squad 2'));
    files[P('/st/steamapps/appmanifest_244450.acf')] = '"AppState" { "installdir" "Custom AS2" }';
    dirs.add(P('/st/steamapps/common/Custom AS2'));
    assert.equal(resolve({ ...base, readReg: () => P('/st') }).dir, P('/st/steamapps/common/Custom AS2'));
    const none = resolve({ ...base });
    assert.equal(none.dir, null); assert.ok(none.tried.length);
  });
  t('gamedir goh + workshop', () => {
    const { goh, workshop } = require('../gamedir');
    assert.equal(goh({ ...base, arg: 'Y' }), 'Y');
    assert.equal(goh({ ...base, noSteam: true }), null);
    dirs.add(P('/g/goh'));
    assert.equal(goh({ ...base, env: { GOH_GAME: P('/g/goh') } }), P('/g/goh'));
    files[P('/w/as2.json')] = '{"game":"/g/js","goh":"/g/goh"}';
    assert.equal(goh({ ...base }), P('/g/goh'));
    delete files[P('/w/as2.json')];
    dirs.add(P('/lib3/steamapps/common/Call to Arms - Gates of Hell')); dirs.add(P('/lib3/steamapps/workshop/content/244450/77'));
    files[P('/st3/steamapps/libraryfolders.vdf')] = '"x" { "0" { "path" "' + P('/lib3').replace(/\\/g, '\\\\') + '" } }';
    const o3 = { ...base, readReg: () => P('/st3') };
    assert.equal(goh(o3), P('/lib3/steamapps/common/Call to Arms - Gates of Hell'));
    assert.equal(workshop(244450, 77, o3), P('/lib3/steamapps/workshop/content/244450/77'));
    assert.equal(workshop(244450, 78, o3), null);
    assert.equal(workshop(244450, 77, { ...base, noSteam: true }), null);
    // AS2_NO_STEAM env = noSteam for all three (DOOR-A tests on a machine with Steam)
    const ns = { ...o3, env: { AS2_NO_STEAM: '1' } };
    assert.equal(goh(ns), null); assert.equal(workshop(244450, 77, ns), null);
  });
  t('gamedir require (DOOR-A)', () => {
    const gd = require('../gamedir');
    dirs.add(P('/g/env'));
    assert.equal(gd.require({ ...base, env: { AS2_GAME: P('/g/env') } }), P('/g/env'));
    assert.equal(gd.resolve({ ...base, readReg: () => P('/st'), env: { AS2_NO_STEAM: '1' } }).dir, null);
    let rc = null; const err = console.error, msgs = []; console.error = m => msgs.push(m);
    try { assert.equal(gd.require({ ...base, noSteam: true, what: 'refcheck', exit: c => { rc = c; } }), null); } finally { console.error = err; }
    assert.equal(rc, 2);
    assert.equal(msgs[0], 'error: refcheck: ' + gd.NOGAME);
    assert.ok(/no game dir found/.test(gd.NOGAME));
  });

  // P5: Linux and macOS Steam roots, real temp folders as fake homes; no registry call off Windows
  const fs = require('fs'), os = require('os');
  const G = 'Men of War Assault Squad 2';
  const tmpHome = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gd-home-'));
  const md = (...a) => { const d = path.join(...a); fs.mkdirSync(d, { recursive: true }); return d; };
  // this host's file system may ignore case (Windows): the real-case answer is only checked exactly on a case-sensitive one
  const same = (a, b) => (process.platform === 'win32' || process.platform === 'darwin' ? String(a).toLowerCase() === String(b).toLowerCase() : a === b);
  const noReg = () => { throw new Error('registry read off Windows'); };
  const unix = (home, platform = 'linux', extra = {}) => ({ platform, home, env: {}, cwd: home, readReg: noReg, ...extra });
  const vdfOf = libs => '"libraryfolders"\n{\n' + libs.map((l, i) => ' "' + i + '"\n {\n  "path"  "' + l.replace(/\\/g, '\\\\') + '"\n }\n').join('') + '}\n';
  t('gamedir linux: native root ~/.local/share/Steam, then ~/.steam/steam', () => {
    const gd = require('../gamedir'), h = tmpHome();
    try {
      const g = md(h, '.local', 'share', 'Steam', 'steamapps', 'common', G);
      const r = gd.resolve(unix(h));
      assert.equal(r.source, 'steam'); assert.equal(r.dir, g);
      const h2 = tmpHome(), g2 = md(h2, '.steam', 'steam', 'steamapps', 'common', G);
      assert.equal(gd.resolve(unix(h2)).dir, g2);
      fs.rmSync(h2, { recursive: true, force: true });
    } finally { fs.rmSync(h, { recursive: true, force: true }); }
  });
  t('gamedir linux: Flatpak root', () => {
    const gd = require('../gamedir'), h = tmpHome();
    try {
      const g = md(h, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam', 'steamapps', 'common', G);
      assert.equal(gd.resolve(unix(h)).dir, g);
    } finally { fs.rmSync(h, { recursive: true, force: true }); }
  });
  t('gamedir linux: second library from libraryfolders.vdf, game folder in other case, SteamApps', () => {
    const gd = require('../gamedir'), h = tmpHome();
    try {
      const apps = md(h, '.local', 'share', 'Steam', 'steamapps'), lib2 = md(h, 'games', 'lib2');
      fs.writeFileSync(path.join(apps, 'libraryfolders.vdf'), vdfOf([path.join(h, '.local', 'share', 'Steam'), lib2]));
      const g = md(lib2, 'SteamApps', 'common', 'men of war assault squad 2');   // old Steam case + a folder renamed in lower case
      const r = gd.resolve(unix(h));
      assert.equal(r.source, 'steam'); assert.ok(same(r.dir, g), r.dir);
      assert.deepEqual(gd.libraries(unix(h)).map(L => L.lib), [path.join(h, '.local', 'share', 'Steam'), lib2]);
      // appmanifest installdir wins over the default name, matched without case
      fs.writeFileSync(path.join(lib2, 'SteamApps', 'appmanifest_244450.acf'), '"AppState"\n{\n "appid" "244450"\n "installdir" "AS2 Custom"\n}\n');
      const g2 = md(lib2, 'SteamApps', 'common', 'as2 custom');
      assert.ok(same(gd.resolve(unix(h)).dir, g2));
      const m = gd.manifest('AS2 CUSTOM', unix(h));
      assert.equal(m.appid, '244450'); assert.equal(m.lib, lib2);
      // the overrides stay in front
      const own = md(h, 'mine'); fs.writeFileSync(path.join(h, 'as2.json'), JSON.stringify({ game: own }));
      assert.equal(gd.resolve(unix(h)).source, 'as2.json');
      assert.equal(gd.resolve(unix(h, 'linux', { arg: 'X' })).source, 'arg');
    } finally { fs.rmSync(h, { recursive: true, force: true }); }
  });
  t('gamedir macOS root ~/Library/Application Support/Steam', () => {
    const gd = require('../gamedir'), h = tmpHome();
    try {
      const g = md(h, 'Library', 'Application Support', 'Steam', 'steamapps', 'common', G);
      assert.equal(gd.resolve(unix(h, 'darwin')).dir, g);
      const gohDir = md(h, 'Library', 'Application Support', 'Steam', 'steamapps', 'common', 'Call to Arms - Gates of Hell');
      assert.equal(gd.goh(unix(h, 'darwin')), gohDir);
    } finally { fs.rmSync(h, { recursive: true, force: true }); }
  });
  t('gamedir linux nothing found: plain message naming the places looked at and --game', () => {
    const gd = require('../gamedir'), h = tmpHome();
    try {
      const r = gd.resolve(unix(h));
      assert.equal(r.dir, null);
      const x = gd.explain(r);
      assert.ok(/no game folder found/.test(x) && /--game/.test(x) && /AS2_GAME/.test(x), x);
      for (const p of [path.join(h, '.steam', 'steam'), path.join(h, '.local', 'share', 'Steam'), path.join(h, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam')]) assert.ok(x.includes(p), 'names ' + p + '\n' + x);
      assert.ok(x.includes('~/.local/share/Steam/steamapps/common/'), x);
      assert.ok(/Library\/Application Support\/Steam/.test(gd.explain(gd.resolve(unix(h, 'darwin')))));
    } finally { fs.rmSync(h, { recursive: true, force: true }); }
  });
};
