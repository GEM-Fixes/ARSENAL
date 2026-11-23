#!/usr/bin/env node
// workshop: the Steam Workshop uploader of ARSENAL (workshop_gui.exe, owner 2026-11-11: "This is now the default workshop
// uploader tool"; "usable on AS64, AS2 and GoH ... they need to be placed in the game directory"; "If using it on GoH, don't
// overwrite the steam_api64.dll already present in the game folder").
//   node tools/workshop/workshop.js status  <game folder> [--json]   is the uploader in the game folder, and what install would do
//   node tools/workshop/workshop.js install <game folder> [--dry] [--json]   copy it there
//   node tools/workshop/workshop.js start   <game folder> [--dry]    start it (Steam must be running)
// The package is three files: workshop_gui.exe, steam_api64.dll, steam_appid.txt (third_party/workshop_gui, or the workshop_gui
// folder beside ARSENAL.exe, or the folder named in ARSENAL_WORKSHOP_GUI).
// Where they go: beside the game's own programs. Assault Squad 2 and the 64-bit build: the game folder. Gates of Hell:
// <game>/binaries/x64. These three files are the only thing this tool ever writes into a game folder, and only on install:
//   workshop_gui.exe   copied; a different copy already there is replaced (it is this tool's own file)
//   steam_api64.dll    copied only when the folder has none. One that is there is NEVER overwritten (any game, not only GoH)
//   steam_appid.txt    written only when the folder has none, with the Steam id of that game (244450, GoH 400750)
// exit 0 ok, 2 refused / not found. No game file is read beyond the names checked here.
// Author: Imperator_Aug (ARSENAL, ia-d0a91f32)
const fs = require('fs'), path = require('path'), crypto = require('crypto'), cp = require('child_process');
const REPO = path.resolve(__dirname, '..', '..');
const EXE = 'workshop_gui.exe', DLL = 'steam_api64.dll', APPID = 'steam_appid.txt';
const isFile = p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

// the folder that holds the package, or null
function packageDir(o = {}) {
  const env = o.env || process.env, execPath = o.execPath || process.execPath, tried = [];
  const c = [];
  if (env.ARSENAL_WORKSHOP_GUI) c.push(env.ARSENAL_WORKSHOP_GUI);
  if (!/^node(\.exe)?$/i.test(path.basename(execPath))) c.push(path.join(path.dirname(execPath), 'workshop_gui'));
  c.push(path.join(o.repo || REPO, 'third_party', 'workshop_gui'), path.join(o.repo || REPO, 'workshop_gui'));   // source tree; the small package
  for (const d of c) { tried.push(d); if (isFile(path.join(d, EXE))) return { dir: path.resolve(d), tried }; }
  return { dir: null, tried };
}
// which game a folder is, and the folder its programs are in
function target(game) {
  if (!game) return { err: 'Name the game folder.' };
  const g = path.resolve(game);
  const goh = path.join(g, 'binaries', 'x64');
  if (isFile(path.join(goh, 'call_to_arms.exe'))) return { kind: 'goh', name: 'Gates of Hell', dir: goh, appid: '400750' };
  if (isFile(path.join(g, 'call_to_arms.exe'))) return { kind: 'goh', name: 'Gates of Hell', dir: g, appid: '400750' };
  if (isFile(path.join(g, 'as64.exe'))) return { kind: 'as64', name: 'Assault Squad 2 (64-bit build)', dir: g, appid: '244450' };
  if (isFile(path.join(g, 'mowas_2.exe'))) return { kind: 'as2', name: 'Assault Squad 2', dir: g, appid: '244450' };
  return { err: 'This is not a game folder of Assault Squad 2 or Gates of Hell (no as64.exe, mowas_2.exe or call_to_arms.exe in it): ' + g };
}
// what install would do, file by file: [{file, to, action: 'copy'|'replace'|'keep'|'write', why}]
function plan(game, o = {}) {
  const t = target(game); if (t.err) return { code: 2, msg: t.err };
  const pk = packageDir(o);
  const steps = [], at = n => path.join(t.dir, n);
  const have = isFile(at(EXE)), same = have && pk.dir && sha(at(EXE)) === sha(path.join(pk.dir, EXE));
  steps.push({ file: EXE, to: at(EXE), action: !have ? 'copy' : same ? 'keep' : 'replace', why: !have ? 'not in the game folder yet' : same ? 'already there, the same file' : 'an older or different copy is there' });
  steps.push(isFile(at(DLL)) ? { file: DLL, to: at(DLL), action: 'keep', why: 'the game folder already has one; it is never overwritten' }
    : { file: DLL, to: at(DLL), action: 'copy', why: 'the game folder has none' });
  steps.push(isFile(at(APPID)) ? { file: APPID, to: at(APPID), action: 'keep', why: 'the game folder already has one' }
    : { file: APPID, to: at(APPID), action: 'write', why: 'the game folder has none; it gets the Steam id of this game, ' + t.appid });
  const installed = isFile(at(EXE)) && isFile(at(DLL));
  return { code: 0, game: t.kind, gameName: t.name, dir: t.dir, appid: t.appid, installed, upToDate: installed && (same || !pk.dir), package: pk.dir, steps, todo: steps.filter(s => s.action !== 'keep').length };
}
function install(game, o = {}) {
  const p = plan(game, o); if (p.code) return p;
  if (!p.package) return { code: 2, msg: 'The uploader package (workshop_gui.exe) is not part of this copy of ARSENAL. Looked in: ' + packageDir(o).tried.join('; ') + '.' };
  if (o.dry) return Object.assign(p, { written: false });
  const done = [];
  try {
    for (const s of p.steps) {
      if (s.action === 'keep') continue;
      if (s.file === DLL && isFile(s.to)) continue;                      // checked again at the moment of writing: never overwritten
      if (s.file === APPID) { if (isFile(s.to)) continue; fs.writeFileSync(s.to, p.appid, { flag: 'wx' }); }
      else if (s.file === DLL) fs.copyFileSync(path.join(p.package, s.file), s.to, fs.constants.COPYFILE_EXCL);
      else fs.copyFileSync(path.join(p.package, s.file), s.to);
      done.push(s.file);
    }
  } catch (e) {
    return { code: 2, msg: 'Could not copy into ' + p.dir + ': ' + e.message + (/EPERM|EACCES|EBUSY/.test(e.code || '') ? ' Close the uploader and the game, and check that the folder is not read-only.' : ''), done };
  }
  return Object.assign(plan(game, o), { written: true, done });
}
function start(game, o = {}) {
  const p = plan(game, o); if (p.code) return p;
  const exe = path.join(p.dir, EXE);
  if (!isFile(exe)) return { code: 2, msg: 'The uploader is not in the game folder yet. Install it first: node tools/workshop/workshop.js install "' + path.resolve(game) + '"' };
  if (!isFile(path.join(p.dir, DLL))) return { code: 2, msg: 'steam_api64.dll is missing beside the uploader in ' + p.dir + '. Run install again.' };
  if (o.dry) return { code: 0, exe, cwd: p.dir, started: false };
  const ch = (o.spawn || cp.spawn)(exe, [], { cwd: p.dir, detached: true, stdio: 'ignore', windowsHide: false });
  if (ch && ch.on) ch.on('error', () => {});
  if (ch && ch.unref) ch.unref();
  return { code: 0, exe, cwd: p.dir, started: true, pid: ch && ch.pid };
}
const say = { copy: 'copy', replace: 'replace', keep: 'keep', write: 'write' };
function text(r, verb) {
  if (r.msg) return r.msg;
  if (verb === 'start') return r.started ? 'The Workshop uploader was started: ' + r.exe + '\nSteam must be running and signed in.' : 'would start: ' + r.exe;
  const L = [r.gameName + ': ' + r.dir, r.installed ? (r.upToDate ? 'The Workshop uploader is installed.' : 'The Workshop uploader is installed; a newer copy can replace it.') : 'The Workshop uploader is not installed here yet.'];
  for (const s of r.steps) L.push('  ' + say[s.action].padEnd(8) + s.file + '  (' + s.why + ')');
  if (verb === 'install') L.push(r.written ? (r.done.length ? 'Done: ' + r.done.join(', ') + '.' : 'Nothing to do: everything was already in place.') : 'dry run: nothing was written');
  return L.join('\n');
}
function main(argv) {
  const verb = argv[0], pos = argv.slice(1).filter(a => !a.startsWith('--')), json = argv.includes('--json'), dry = argv.includes('--dry');
  if (!['status', 'install', 'start'].includes(verb) || argv.includes('--help')) { console.log('usage: node tools/workshop/workshop.js status|install|start <game folder> [--dry] [--json]'); return verb ? 0 : 2; }
  const r = verb === 'status' ? plan(pos[0]) : verb === 'install' ? install(pos[0], { dry }) : start(pos[0], { dry });
  console.log(json ? JSON.stringify(r, null, 1) : text(r, verb));
  return r.code;
}
module.exports = { main, plan, install, start, target, packageDir, text, EXE, DLL, APPID };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
