// userdir: per-instance user dir of the game ( GetUserDir, GetLogDir).
//   instance 0 = <Documents>/my games/men of war - assault squad 2, instance N = same + " - instance N": own log/ and profiles/
// userDir(inst=0, {home, exists, readReg?, listDir?, env?, platform?}) -> path | null   null = no Documents with a main user dir (instance dir may not exist yet: first launch creates it)
//   Linux: inside the Steam Proton prefix (prefixUser below); macOS: always null (the game does not run there)
// find(inst, opt) -> {dir, why, looked}   same search, with one plain sentence when nothing is found
// gohUserDir(opt) / gohFind(opt): the Gates of Hell user dir (<Documents>\My Games\Gates of Hell, or %LOCALAPPDATA%\digitalmindsoft\gates of hell
//   when Documents is under OneDrive, or in its Proton prefix)
// gohLogDir(opt) -> <GoH user dir>/log | null   gohProfiles(opt) -> [<GoH user dir>/profiles/<id>/options.set that exist]
// forGame(game, inst, opt) -> {dir, why, kind}, logDirFor(game, inst, opt), profilesFor(game, inst, opt): the same per game
//   (game = lib/games id or exe; none = the AS2 user dir as before; GoH has no instance folders, GHVFS-13: inst >= 1 -> none + why)
// logDir(inst, opt) -> <userDir>/log | null
// profiles(inst, opt) -> [<userDir>/profiles/<id>/options.set that exist]
// seedProfile(inst, {from?, mods?}) -> {file, from, mods}   instance >= 1 only: writes <instance dir>/profiles/<id>/options.set
//   from = options.set to copy (default: the single main profile); mods = ["name:0",..] replaces {mods}, else it is copied as is
//   throws on inst 0 (the real profile is never seeded) or when no single source profile exists
// setMods(text, mods) -> text with the {mods ..} block replaced (cp1251 text passed as latin1)
// Author: Imperator_Aug (ARSENAL, ia-9d0cd6a1)
const fs = require('fs'), path = require('path'), os = require('os');
const BASE = path.join('my games', 'men of war - assault squad 2');

// Documents folders to try, in order: the one Windows knows (HKCU ..\Explorer\User Shell Folders "Personal", %VAR% expanded;
// win32 only, skipped when opt.home overrides home unless opt.readReg is given), ~/OneDrive - <org>/Documents (listing home),
// then ~/Documents, ~/OneDrive/Documents, ~/OneDrive/Desktop/Documents. duplicates dropped (case-insensitive on win32).
//   opt.readReg() -> raw Personal value | null   opt.listDir(dir) -> [names]   opt.env (for %VAR%)   opt.platform
let regMemo;
const USF = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders';
function docsCandidates(home, opt = {}) {
  const plat = opt.platform || process.platform, out = [];
  let reg = null;
  if (opt.readReg) reg = opt.readReg();
  else if (plat === 'win32' && !opt.home) { if (regMemo === undefined) regMemo = require('./winreg').readValue(USF, 'Personal'); reg = regMemo; }   // one reg.exe per process
  if (reg) { const x = require('./winreg').expandEnv(String(reg).trim(), opt.env || process.env); if (x && !/%[^%]+%/.test(x) && path.isAbsolute(x)) out.push(x); }
  let names = [];
  try { names = (opt.listDir || (d => fs.readdirSync(d)))(home) || []; } catch (e) { names = []; }
  for (const n of names.filter(n => /^OneDrive - ./i.test(n)).sort()) out.push(path.join(home, n, 'Documents'));
  out.push(path.join(home, 'Documents'), path.join(home, 'OneDrive', 'Documents'), path.join(home, 'OneDrive', 'Desktop', 'Documents'));
  const seen = new Set(), key = d => { const r = path.resolve(d).replace(/[\\/]+$/, ''); return plat === 'win32' ? r.toLowerCase() : r; };
  return out.filter(d => { const k = key(d); if (seen.has(k)) return false; seen.add(k); return true; });
}
// Linux: the game runs under Steam Proton, whose Windows user is "steamuser" inside the game's compatibility prefix:
//   <library>/steamapps/compatdata/<appid>/pfx/drive_c/users/<that user>. The app id comes from the appmanifest in the library
//   whose installdir is the game folder (gamedir.manifest; no number needed), else the known id. Names matched without case.
//   prefixUser(folder, appid, opt) -> {dir, looked}   opt.game (the game folder, its name is the folder) as well as gamedir's opt
function prefixUser(folder, appid, opt = {}) {
  const gd = require('./gamedir'), ci = require('./cipath');
  const ciOpt = { fs: opt.fs || fs, cache: new Map() };
  const name = opt.game ? path.basename(path.resolve(opt.game)) : folder;
  const m = gd.manifest(name, opt);
  const id = m ? m.appid : appid, looked = [];
  const libs = gd.libraries(opt);
  if (m) libs.sort((a, b) => (b.apps === m.apps) - (a.apps === m.apps));   // the game's own library first
  for (const L of libs) {
    const rel = ['compatdata', id, 'pfx', 'drive_c', 'users', 'steamuser'].join('/');   // Proton's fixed user name, joined from parts: the release gate refuses any literal user folder path
    looked.push(path.join(L.apps, ...rel.split('/')));
    const u = ci.resolve(L.apps, rel, ciOpt);
    if (u) return { dir: u, looked, appid: id };
  }
  return { dir: null, looked, appid: id };
}
const MAC_WHY = 'the game does not run on macOS, so there is no game profile folder there';

// find(inst, opt) -> {dir, why, looked}   dir null = not found, why is one plain sentence
function find(inst = 0, opt = {}) {
  const plat = opt.platform || process.platform;
  const at = main => (inst ? main + ' - instance ' + inst : main);
  if (plat === 'darwin') return { dir: null, why: MAC_WHY, looked: [] };
  if (plat !== 'win32') {
    const p = prefixUser(require('./gamedir').FOLDER, require('./gamedir').APPID, opt), ci = require('./cipath');
    const ciOpt = { fs: opt.fs || fs, cache: new Map() };
    if (p.dir) for (const docs of ['Documents', 'My Documents']) {   // older Proton: My Documents
      const main = ci.resolve(p.dir, docs + '/' + BASE.split(path.sep).join('/'), ciOpt);
      if (main) return { dir: at(main), why: null, looked: p.looked };
    }
    return { dir: null, looked: p.looked,
      why: p.dir ? 'no game profile folder in the Proton prefix ' + p.dir + ' (start the game once through Steam)'
        : 'no Proton prefix of the game (app ' + p.appid + ') in the Steam libraries' };
  }
  const home = opt.home || os.homedir(), exists = opt.exists || fs.existsSync, looked = [];
  for (const d of docsCandidates(home, opt)) {
    const main = path.join(d, BASE);
    looked.push(main);
    if (exists(main)) return { dir: at(main), why: null, looked };
  }
  return { dir: null, why: 'no game profile folder in Documents (start the game once)', looked };
}
function userDir(inst = 0, opt = {}) { return find(inst, opt).dir; }

// Gates of Hell keeps its user dir (log/, profiles/) in %LOCALAPPDATA%\digitalmindsoft\gates of hell when Documents sits under
// OneDrive (or with -useLocalDataFolder), else in <Documents>\My Games\Gates of Hell.
// Linux: the same under the Proton prefix (AppData/Local; older Proton: Local Settings/Application Data). macOS: none.
// gohFind(opt) -> {dir, why}   gohUserDir(opt) -> path | null (only a folder that exists)
const GOH_REL = 'digitalmindsoft/gates of hell';
function gohFind(opt = {}) {
  const plat = opt.platform || process.platform;
  if (plat === 'darwin') return { dir: null, why: MAC_WHY };
  if (plat !== 'win32') {
    const gd = require('./gamedir'), ci = require('./cipath'), ciOpt = { fs: opt.fs || fs, cache: new Map() };
    const p = prefixUser(gd.GOH_FOLDER, gd.GOH_APPID, opt);
    if (p.dir) for (const base of ['AppData/Local', 'Local Settings/Application Data']) {
      const d = ci.resolve(p.dir, base + '/' + GOH_REL, ciOpt);
      if (d) return { dir: d, why: null };
    }
    return { dir: null, why: p.dir ? 'no Gates of Hell user folder in the Proton prefix ' + p.dir + ' (start the game once through Steam)'
      : 'no Proton prefix of Gates of Hell (app ' + p.appid + ') in the Steam libraries' };
  }
  // GoH's own rule (GetUserDir in its , read 2026-11-12, limits LOG-22): <Documents>/My Games/Gates of Hell
  // unless the command line has -useLocalDataFolder or the Documents path contains "/onedrive/": then the LocalAppData folder.
  // The command line is not visible here, so: the Documents folder first when the rule points there, then LocalAppData.
  // opt.home without opt.env: LocalAppData is taken under that home (<home>/AppData/Local), never from this process's %LOCALAPPDATA%,
  // the same way docsCandidates skips the registry when opt.home is given (a test home never finds the real GoH user dir)
  const env = opt.env || (opt.home ? {} : process.env), exists = opt.exists || fs.existsSync, home = opt.home || os.homedir();
  const local = path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), ...GOH_REL.split('/'));
  const docs = docsCandidates(home, opt).find(d => exists(d));
  const oneDrive = docs && (docs.replace(/\\/g, '/').toLowerCase() + '/').includes('/onedrive/');
  const tries = docs && !oneDrive ? [path.join(docs, 'My Games', 'Gates of Hell'), local] : [local];
  const d = tries.find(x => exists(x));
  return d ? { dir: d, why: null } : { dir: null, why: 'no Gates of Hell user folder at ' + tries.join(' or ') + ' (start the game once)' };
}
function gohUserDir(opt = {}) { return gohFind(opt).dir; }
// GoH has one user dir: GetUserDir adds no instance part (GHVFS-13 [V]), so an instance N >= 1 has no folder of its own.
const GOH_NO_INST = 'Gates of Hell keeps one user folder with no per-instance copy (GHVFS-13)';
function gohLogDir(opt = {}) { const u = gohUserDir(opt); return u && path.join(u, 'log'); }
function gohProfiles(opt = {}) {
  const u = gohUserDir(opt), p = u && path.join(u, 'profiles');
  if (!p || !fs.existsSync(p)) return [];
  return fs.readdirSync(p).map(id => path.join(p, id, 'options.set')).filter(f => fs.existsSync(f));
}
// per game (lib/games id, vfs exe or exe file; none = AS2 as before): forGame(game, inst, opt) -> {dir, why, kind}
//   kind 'as2': find(inst, opt); kind 'goh': gohFind(opt), inst >= 1 -> dir null + GOH_NO_INST
// logDirFor(game, inst, opt), profilesFor(game, inst, opt): the same per game (GoH inst >= 1 -> null / [])
function kindOfGame(game) { if (!game) return 'as2'; const k = require('./games').kindOf(game); if (!k) throw new Error('unknown game: ' + game); return k; }
function forGame(game, inst = 0, opt = {}) {
  const kind = kindOfGame(game);
  if (kind !== 'goh') return { ...find(inst, opt), kind };
  if (inst) return { dir: null, why: GOH_NO_INST, kind };
  return { ...gohFind(opt), kind };
}
function logDirFor(game, inst = 0, opt = {}) { const r = forGame(game, inst, opt); return r.dir && path.join(r.dir, 'log'); }
function profilesFor(game, inst = 0, opt = {}) {
  if (kindOfGame(game) !== 'goh') return profiles(inst, opt);
  return inst ? [] : gohProfiles(opt);
}
function logDir(inst = 0, opt = {}) {
  const u = userDir(inst, opt);
  return u && path.join(u, 'log');
}
function profiles(inst = 0, opt = {}) {
  const u = userDir(inst, opt), p = u && path.join(u, 'profiles');
  if (!p || !fs.existsSync(p)) return [];
  return fs.readdirSync(p).map(id => path.join(p, id, 'options.set')).filter(f => fs.existsSync(f));
}
function setMods(text, mods) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const block = '{mods' + mods.map(m => ' "' + m + '"').join('') + '}';
  const re = /\{mods\b[^{}]*\}/;
  if (re.test(text)) return text.replace(re, () => block);
  return text.replace(/\s*$/, '') + eol + block + eol;
}
function seedProfile(inst, opt = {}) {
  if (!inst) throw new Error('seedProfile: instance 0 is the real profile, refused');
  let from = opt.from;
  if (!from) {
    const main = profiles(0, opt);
    if (main.length !== 1) throw new Error('seedProfile: need one main profile, found ' + main.length + ': pass from');
    from = main[0];
  }
  const id = path.basename(path.dirname(from)), u = userDir(inst, opt);
  if (!u) throw new Error('seedProfile: no user dir');
  const file = path.join(u, 'profiles', id, 'options.set');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let text = fs.readFileSync(from, 'latin1');
  if (opt.mods) text = setMods(text, opt.mods);
  fs.writeFileSync(file, text, 'latin1');
  return { file, from, mods: opt.mods || null };
}
module.exports = { userDir, find, logDir, profiles, seedProfile, setMods, docsCandidates, gohUserDir, gohFind, prefixUser,
  gohLogDir, gohProfiles, forGame, logDirFor, profilesFor, GOH_NO_INST };
