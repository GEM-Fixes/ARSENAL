// gamedir: resolve the Men of War: Assault Squad 2 install dir.
// resolve({arg, env, cwd, noSteam, readReg, readFile, exists, platform, home, fs}) -> {dir, source, profile?} | {dir:null, source:null, tried:[..]}
//   order: arg (--game) > env AS2_GAME > as2.json (cwd upward; {"game": "...", "profile"?: "..."}) > steam
//   steam roots: Windows HKCU\Software\Valve\Steam SteamPath (read with `reg export`, lib/winreg: code-page safe);
//     Linux ~/.steam/steam, ~/.steam/root, ~/.local/share/Steam, Flatpak ~/.var/app/com.valvesoftware.Steam/.local/share/Steam;
//     macOS ~/Library/Application Support/Steam. No registry call on Linux or macOS.
//   then <root>/steamapps/libraryfolders.vdf "path" entries, appid 244450 (appmanifest installdir, else 'Men of War Assault Squad 2').
//   Linux/macOS: names under each library matched without regard to case (lib/cipath: SteamApps, a renamed game folder).
//   source: 'arg'|'env'|'as2.json'|'steam'
//   env AS2_NO_STEAM=1 skips the Steam probe (tests of the no-game path). every IO is injectable (tests use fakes or temp homes;
//   no registry in tests). opt.platform 'win32'|'linux'|'darwin' (default process.platform), opt.home (default os.homedir()),
//   opt.fs {readdirSync, statSync} for the case-insensitive lookups. Only dirs that exist are accepted for env/json/steam.
//   arg is returned as given (caller's explicit choice, not checked).
// libraries(opt) -> [{lib, apps}]   every Steam library found (apps = its real steamapps folder); roots(opt) -> Steam roots tried
// manifest(folder, opt) -> {appid, lib, apps, installdir} | null   the library whose appmanifest_<id>.acf names that game folder
// parseVdfPaths(text) -> [paths]   (exposed for tests)
// defaultReg() -> SteamPath | null   the real registry read, remembered for 5 s (defaultReg.forget() drops it); an injected
//   opt.readReg or defaultReg({run}) is never remembered
// T-SURFACE: a failed resolve also has looked:[[where, what]]; any result may have warn:[lines] (AS2_GAME set to a missing folder = ignored).
//   explain(r) -> plain text: where it looked + the three ways to set the game folder. require() prints warn lines on stderr.
// Author: Imperator_Aug (ARSENAL, ia-1fb3a97c)
const fs = require('fs'), path = require('path'), os = require('os');
const cipath = require('./cipath');
const APPID = '244450', FOLDER = 'Men of War Assault Squad 2';

function parseVdfPaths(text) {
  const out = [], re = /"path"\s+"([^"]*)"/g;
  let m;
  while ((m = re.exec(text))) out.push(m[1].replace(/\\\\/g, '\\'));
  return out;
}

// SteamPath via `reg export` (UTF-16LE file, lib/winreg): `reg query` prints in the OEM code page and broke non-ASCII Steam paths.
// opt.run = winreg's injectable runner (tests); readReg stays the injectable seam of resolve/goh/workshop.
// The plain call (no opt.run: the real registry) is remembered for REG_MEMO_MS: one reg.exe costs 80-230 ms and one GUI request
// asked dozens of times. Only the registry value is kept; the library and manifest files are read on every call as before.
const REG_MEMO_MS = 5000;
let regMemo = null;   // {at, v}
function defaultReg(opt) {
  const plain = !opt || !opt.run, now = Date.now();
  if (plain && regMemo && now >= regMemo.at && now - regMemo.at < REG_MEMO_MS) return regMemo.v;
  const v = require('./winreg').readValue('HKCU\\Software\\Valve\\Steam', 'SteamPath', opt || {});
  const out = v ? v.trim() : null;
  if (plain) regMemo = { at: Date.now(), v: out };
  return out;
}
defaultReg.forget = () => { regMemo = null; };   // tests
const defaultRead = f => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } };
const defaultExists = f => { try { return fs.statSync(f).isDirectory(); } catch (e) { return false; } };

// as2.json: nearest file walking up from cwd -> {game, profile, file} | null
function findJson(cwd, readFile) {
  let d = path.resolve(cwd);
  for (;;) {
    const f = path.join(d, 'as2.json'), t = readFile(f);
    if (t != null) {
      try { const j = JSON.parse(t); if (j && typeof j.game === 'string') return { game: path.resolve(d, j.game), profile: j.profile, file: f }; } catch (e) { /* bad json: keep walking */ }
    }
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
}

function mkOpts(opt = {}) {
  const platform = opt.platform || process.platform;
  return {
    env: opt.env || process.env, cwd: opt.cwd || process.cwd(), platform, home: opt.home || os.homedir(),
    readReg: opt.readReg || defaultReg, readFile: opt.readFile || defaultRead, exists: opt.exists || defaultExists,
    ci: { fs: opt.fs || fs, cache: new Map() },   // one listing cache per call: a later call sees folders made since
  };
}
const isWin = o => o.platform === 'win32';

// Steam roots to try, in order. Windows: the registry's SteamPath only (as before).
function roots(opt = {}) {
  const o = opt.ci ? opt : mkOpts(opt);
  if (isWin(o)) { const r = o.readReg(); return r ? [r] : []; }
  const h = o.home;
  if (o.platform === 'darwin') return [path.join(h, 'Library', 'Application Support', 'Steam')];
  return [path.join(h, '.steam', 'steam'), path.join(h, '.steam', 'root'), path.join(h, '.local', 'share', 'Steam'),
    path.join(h, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam')];
}
// rel under base: joined on Windows (as before), matched without case elsewhere; null when nothing is there (non-Windows)
function under(o, base, rel) {
  if (isWin(o)) return path.join(base, ...rel.split('/'));
  return cipath.resolve(base, rel, o.ci);
}
const realKey = (o, d) => { let r; try { r = fs.realpathSync(d); } catch (e) { r = path.resolve(d); } r = r.replace(/[\\/]+$/, ''); return isWin(o) ? r.toLowerCase() : r; };

// every library: the roots, then the "path" entries of each root's libraryfolders.vdf; duplicates (~/.steam/steam is
// usually a link to ~/.local/share/Steam) dropped by real path
function libraries(opt = {}) {
  const o = opt.ci ? opt : mkOpts(opt);
  const libs = [], seen = new Set();
  const add = l => { if (!l) return; const k = realKey(o, l); if (seen.has(k)) return; seen.add(k); libs.push(l); };
  for (const r of roots(o)) {
    if (!isWin(o) && !o.exists(r)) continue;
    add(r);
    const apps = under(o, r, 'steamapps');
    const vdf = apps && o.readFile(path.join(apps, 'libraryfolders.vdf'));
    if (vdf) parseVdfPaths(vdf).forEach(add);
  }
  const out = [];
  for (const l of libs) { const apps = under(o, l, 'steamapps'); if (apps) out.push({ lib: l, apps }); }
  return out;
}
const installdir = acf => { const m = acf && /"installdir"\s+"([^"]*)"/i.exec(acf); return m ? m[1] : null; };

// the library that holds a game folder, found by its appmanifest (no app id needed): installdir equals folder, case ignored
function manifest(folder, opt = {}) {
  const o = opt.ci ? opt : mkOpts(opt), want = String(folder).toLowerCase();
  for (const L of libraries(o)) {
    let names = [];
    try { names = (o.ci.fs.readdirSync(L.apps) || []).map(String); } catch (e) { names = []; }
    for (const n of names) {
      const m = /^appmanifest_(\d+)\.acf$/i.exec(n);
      if (!m) continue;
      const d = installdir(o.readFile(path.join(L.apps, n)));
      if (d && d.toLowerCase() === want) return { appid: m[1], lib: L.lib, apps: L.apps, installdir: d };
    }
  }
  return null;
}

function steamDir(o, appid = APPID, folder = FOLDER, workshopId = null) {
  for (const { apps } of libraries(o)) {
    if (workshopId) { const w = under(o, apps, 'workshop/content/' + appid + '/' + workshopId); if (w && o.exists(w)) return w; continue; }
    const acf = o.readFile(path.join(apps, 'appmanifest_' + appid + '.acf'));
    for (const name of [installdir(acf), folder].filter(Boolean)) {
      const d = under(o, apps, 'common/' + name);
      if (d && o.exists(d)) return d;
    }
  }
  return null;
}

// Other installs, same order (arg > env > as2.json key > steam). Returns a dir string or null (never throws).
//   goh(opt)            -> Gates of Hell install (env GOH_GAME, as2.json "goh", appid 400750)
//   workshop(appid,id,opt) -> workshop item dir (env AS2_WORKSHOP_<appid>_<id>, then steam libraries)
const GOH_APPID = '400750', GOH_FOLDER = 'Call to Arms - Gates of Hell';
function goh(opt = {}) {
  const o = mkOpts(opt);
  if (opt.arg) return opt.arg;
  if (o.env.GOH_GAME && o.exists(o.env.GOH_GAME)) return o.env.GOH_GAME;
  let d = path.resolve(o.cwd);
  for (;;) {
    const t = o.readFile(path.join(d, 'as2.json'));
    if (t != null) { try { const j = JSON.parse(t); if (j && typeof j.goh === 'string' && o.exists(path.resolve(d, j.goh))) return path.resolve(d, j.goh); } catch (e) { /* keep walking */ } }
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return opt.noSteam || o.env.AS2_NO_STEAM ? null : steamDir(o, GOH_APPID, GOH_FOLDER);
}
function workshop(appid, id, opt = {}) {
  const o = mkOpts(opt), k = 'AS2_WORKSHOP_' + appid + '_' + id;
  if (opt.arg) return opt.arg;
  if (o.env[k] && o.exists(o.env[k])) return o.env[k];
  return opt.noSteam || o.env.AS2_NO_STEAM ? null : steamDir(o, String(appid), '', String(id));
}

function resolve(opt = {}) {
  const o = mkOpts(opt);
  const tried = [], looked = [], warn = [];
  // T-SURFACE: looked = [[where, what was found]] for explain(); warn = plain lines for a source that was set but ignored (bad AS2_GAME)
  const done = r => (warn.length ? { ...r, warn } : r);
  if (opt.arg) return { dir: opt.arg, source: 'arg' };
  looked.push(['--game', 'not given']);
  if (o.env.AS2_GAME) {
    if (o.exists(o.env.AS2_GAME)) return { dir: o.env.AS2_GAME, source: 'env' };
    tried.push('AS2_GAME=' + o.env.AS2_GAME + ' (missing)');
    looked.push(['AS2_GAME', o.env.AS2_GAME + ' (ignored: no folder there)']);
    warn.push('warning: AS2_GAME=' + o.env.AS2_GAME + ' is ignored: no folder there. Fix or clear AS2_GAME.');
  } else looked.push(['AS2_GAME', 'not set']);
  const j = findJson(o.cwd, o.readFile);
  if (j) {
    if (o.exists(j.game)) return done({ dir: j.game, source: 'as2.json', profile: j.profile, file: j.file });
    tried.push(j.file + ' game=' + j.game + ' (missing)');
    looked.push(['as2.json', j.file + ' says ' + j.game + ' (no folder there)']);
  } else looked.push(['as2.json', 'none in ' + path.resolve(o.cwd) + ' or any folder above it']);
  if (!opt.noSteam && !o.env.AS2_NO_STEAM) {   // AS2_NO_STEAM=1: tests of the no-game path (DOOR-A) on a machine with Steam
    const s = steamDir(o);
    if (s) return done({ dir: s, source: 'steam' });
    tried.push('steam (not found)');
    if (isWin(o)) looked.push(['Steam', 'no ' + FOLDER + ' (app ' + APPID + ') in the Steam libraries']);
    else {
      const libs = libraries(o).map(L => L.lib);
      looked.push(['Steam', 'no ' + FOLDER + ' (app ' + APPID + ') in ' + (libs.length ? 'the Steam libraries ' + libs.join(', ') : 'any Steam folder')]);
      looked.push(['', 'Steam folders tried: ' + roots(o).join(', ')]);
    }
  } else looked.push(['Steam', 'skipped (AS2_NO_STEAM is set)']);
  return done({ dir: null, source: null, tried, looked, platform: o.platform });
}

// T-SURFACE: plain multi-line text for a failed resolve(): where it looked + the three ways to set the game folder (no "error:" prefix)
function explain(r) {
  const L = ['no game folder found. Looked at:'];
  for (const [k, v] of r.looked || []) L.push('  ' + k.padEnd(9) + ' ' + v);
  const p = r.platform || process.platform;
  const eg = p === 'win32' ? '...\\steamapps\\common\\' + FOLDER
    : p === 'darwin' ? '~/Library/Application Support/Steam/steamapps/common/' + FOLDER
      : '~/.local/share/Steam/steamapps/common/' + FOLDER;
  L.push('Set it one of three ways:',
    '  1. add --game "<game folder>" to the command',
    '  2. set the AS2_GAME environment variable to the game folder',
    '  3. put as2.json in your mod folder or above it: {"game": "<game folder>"}',
    '  (the game folder is the one holding as64.exe or mowas_2.exe, e.g. ' + eg + ')');
  return L.join('\n');
}

// DOOR-A: a tool that joins the game dir into paths calls require() instead of resolve().dir; no dir = one line on stderr, exit 2
// (never a null path, a TypeError or a silent "0 findings"). opt as resolve() plus what: tool name for the message, exit: injectable.
const NOGAME = 'no game dir found (--game G, AS2_GAME, as2.json, Steam)';
function missing(what, exit = process.exit) { console.error('error: ' + (what ? what + ': ' : '') + NOGAME); exit(2); }
function requireDir(opt = {}) {
  const r = resolve(opt);
  const w = () => { for (const l of r.warn || []) console.error(l); };   // bad AS2_GAME: said once, after the error line if there is one
  if (r.dir) { w(); return r.dir; }
  const exit = opt.exit || process.exit;
  missing(opt.what, () => {});
  w();
  exit(2);
  return null;
}

module.exports = { resolve, explain, goh, workshop, parseVdfPaths, findJson, defaultReg, roots, libraries, manifest,
  APPID, FOLDER, GOH_APPID, GOH_FOLDER, NOGAME, missing, require: requireDir };
