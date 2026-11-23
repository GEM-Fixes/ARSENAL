// writeguard: one place that decides whether a tool may write to a path, whatever game folder the request names.
//   refuseWrite(target, {game, games, purpose, allowGameMods=true, raw}) -> null (ok) | plain reason (string)
//     refused: inside an AS2/as64 install other than <install>/mods/<name> (installs found by content walking up from the target:
//       as64.exe/mowas_2.exe/..._ed.exe + resource/ or *.pak or mods/; plus AS2_GAME, gamedir.resolve(), the request's game);
//       inside a Gates of Hell install (call_to_arms.exe walking up, a "Call to Arms"/"Gates of Hell" folder name, GOH_GAME, gamedir.goh(),
//       except <GoH>/mods/<name> (owner 2026-11-15): a folder ARSENAL made (it carries MARKER) or one that does not exist yet may be
//       written; an existing mod ARSENAL did not make only with Advanced on (opt.advanced, else env ARSENAL_ADVANCED=1: the app sets it
//       from the Advanced switch under Tools & Settings). The GoH game files and <GoH>/mods itself stay refused;
//       no drive path is written here: gamedir.goh() finds the install); any steamapps/ path other than an AS2 install's mods/<name> (Workshop content, other games),
//       except a Workshop item steamapps/workshop/content/<app>/<item>[/...] of any game (AS2, AS64, GoH) with Advanced on (owner 2026-11-15; opt.allowWorkshop false keeps it refused);
//       a resource/ folder holding .pak files outside a mod; a drive root; the user profile root; the tools repo itself (root, tools/, tools/<x>, .git);
//       reserved or odd names (CON AUX NUL PRN COM1-9 LPT1-9, trailing dot/space, '..', a name over 200 chars, a path over 240, line breaks, <>:"|?*).
//   canRemove(dir, opt) -> null | reason   safeRemove(dir, opt) -> null (removed, or nothing there) | reason (nothing removed)
//     only a folder that carries one of opt.markers (default MARKER) and passes refuseWrite; a junction/symlink is only unlinked (its target is untouched).
//   mark(dir, what) writes MARKER (JSON) into dir. detectInstall(p) -> {kind:'as2'|'goh', dir} | null (walking up). isGoh(dir), isAs2(dir).
// Author: Imperator_Aug (ARSENAL, ia-82fd08c3)
const fs = require('fs'), path = require('path'), os = require('os');

const MARKER = '.arsenal-made';
const AS2_EXES = ['as64.exe', 'mowas_2.exe', 'as64_ed.exe', 'mowas_2_ed.exe', 'mowas_2_workshop.exe'];
const GOH_EXES = ['call_to_arms.exe', 'call_to_arms_ed.exe', 'call_to_arms_server.exe'];
const GOH_NAME = /^(call[ _-]*to[ _-]*arms\b.*|.*\bgates[ _-]*of[ _-]*hell\b.*)$/i;
const REPO = path.resolve(__dirname, '..', '..'), TOOLS = path.resolve(__dirname, '..');
const RESERVED = /^(con|prn|aux|nul|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3])(\..*)?$/i;

const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };
const isFile = p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
function real(p) {
  const r = path.resolve(p);
  try { return fs.realpathSync.native(r); } catch (e) { /* missing */ }
  const up = path.dirname(r);
  return up === r ? r : path.join(real(up), path.basename(r));
}
const key = p => path.resolve(p).toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
const inside = (c, d) => { const a = key(c), b = key(d); return a === b || a.startsWith(b + '/'); };
const same = (a, b) => key(a) === key(b);
function hasPak(d) { try { return fs.readdirSync(d).some(n => /\.pak$/i.test(n)); } catch (e) { return false; } }

function isAs2(d) {
  if (!AS2_EXES.some(x => isFile(path.join(d, x)))) return false;
  return isDir(path.join(d, 'resource')) || isDir(path.join(d, 'mods')) || hasPak(d);
}
function isGoh(d) {
  if (GOH_EXES.some(x => isFile(path.join(d, 'binaries', 'x64', x)) || isFile(path.join(d, x)))) return true;
  if (GOH_NAME.test(path.basename(path.resolve(d)))) return true;
  return knownGames().goh.some(k => same(k, d));   // the GoH install gamedir finds (GOH_GAME, as2.json "goh", Steam 400750), whatever its folder holds
}
// nearest install walking up from p (GoH wins over AS2 at the same level)
function detectInstall(p) {
  let d = path.resolve(p);
  for (;;) {
    if (isGoh(d)) return { kind: 'goh', dir: d };
    if (isAs2(d)) return { kind: 'as2', dir: d };
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
}

let CAND = null, CAND_T = 0;
function knownGames() {   // env + gamedir candidates, cached 60 s (gamedir may ask the registry once)
  if (CAND && Date.now() - CAND_T < 60000) return CAND;
  const as2 = [], goh = [];
  if (process.env.AS2_GAME) as2.push(process.env.AS2_GAME);
  if (process.env.GOH_GAME) goh.push(process.env.GOH_GAME);
  try { const gd = require('./gamedir'), r = gd.resolve({}); if (r.dir) as2.push(r.dir); const g = gd.goh({}); if (g) goh.push(g); } catch (e) { /* none */ }
  CAND = { as2, goh }; CAND_T = Date.now();
  return CAND;
}
function plainRoot(d) { const r = path.resolve(d); return path.parse(r).root === r || same(r, os.homedir()) || (process.env.USERPROFILE && same(r, process.env.USERPROFILE)); }

const say = (purpose, t, why, instead) => `refused: ARSENAL will not ${purpose || 'write'} at ${t}: ${why}. ${instead || 'Pick a new folder of your own, for example on your Desktop or in Documents.'}`;
const NEW = 'Pick a new folder of your own, for example on your Desktop, or <game folder>\\mods\\<new mod name>.';

function nameProblem(seg) {
  if (seg === '..') return 'the path uses ".." (go up a folder); give the full folder path instead';
  if (RESERVED.test(seg)) return `"${seg}" is a name Windows keeps for itself (CON, AUX, NUL, PRN, COM1-9, LPT1-9) and cannot be a folder or file name`;
  if (/[\r\n\t\x00-\x1f]/.test(seg)) return 'the name holds a line break or another control character';
  if (/[<>:"|?*]/.test(seg)) return `the name "${seg}" holds a character Windows does not allow (< > : " | ? *)`;
  if (seg !== '.' && /[. ]$/.test(seg)) return `the name "${seg}" ends in a dot or a space, which Windows silently drops`;
  if (seg.length > 200) return `one folder name is ${seg.length} characters long (200 at most)`;
  return null;
}

function refuseWrite(target, opt = {}) {
  const purpose = opt.purpose;
  if (typeof target !== 'string' || !target.trim()) return say(purpose, '(nothing)', 'no folder was given', 'Pick a folder first.');
  if (target.includes('\0')) return say(purpose, '(bad path)', 'the path holds a NUL character');
  // names: every raw segment that does not exist yet, the last one always, '..' anywhere
  const rawSegs = String(target).split(/[\\/]+/).filter(Boolean);
  if (rawSegs.includes('..')) return say(purpose, target, nameProblem('..'));
  const abs = path.resolve(target);
  if (abs.length > 240) return say(purpose, abs.slice(0, 80) + '...', `the full path is ${abs.length} characters long; Windows and the game break on paths over about 250`, 'Pick a shorter folder path.');
  {
    let d = abs; const fresh = [];
    while (!fs.existsSync(d)) { fresh.push(path.basename(d)); const up = path.dirname(d); if (up === d) break; d = up; }
    if (!fresh.length) fresh.push(path.basename(abs));
    for (const s of fresh) { if (!s) continue; const p = nameProblem(s); if (p) return say(purpose, abs, p, 'Pick another name: letters, digits, - and _ are always safe.'); }
  }
  const ps = [abs]; const r = real(abs); if (!same(r, abs)) ps.push(r);
  for (const p of ps) {
    const why = refuseOne(p, opt);
    if (why) return say(purpose, abs, why[0], why[1]);
  }
  return null;
}
// <GoH>/mods/<name>[/...] (owner 2026-11-15) -> true (may be written) | [why, instead] (an existing mod, Advanced off) | null (not there)
const advOn = opt => (opt && typeof opt.advanced === 'boolean' ? opt.advanced : process.env.ARSENAL_ADVANCED === '1');
function gohMod(p, goh, opt) {
  const mods = path.join(goh, 'mods');
  if (opt.allowGameMods === false || !inside(p, mods) || same(p, mods)) return null;
  const mod = path.join(mods, path.relative(mods, path.resolve(p)).split(/[\\/]/)[0]);
  if (!fs.existsSync(mod) || isFile(path.join(mod, MARKER)) || advOn(opt)) return true;
  return [`${mod} is a Gates of Hell mod that ARSENAL did not make`, 'To write straight into it, switch on Advanced under Tools & Settings. Without it ARSENAL writes only into copies it made in that mods folder, or a folder outside the game.'];
}

// -> [why, instead] | null
function refuseOne(p, opt) {
  const allowMods = opt.allowGameMods !== false;
  if (path.parse(p).root === p) return ['that is a whole drive, not a folder', NEW];
  if (same(p, os.homedir()) || (process.env.USERPROFILE && same(p, process.env.USERPROFILE))) return ['that is your whole user folder, not a mod folder', NEW];
  const repoRoot = path.dirname(REPO);
  if (same(p, REPO) || same(p, TOOLS) || same(path.dirname(p), TOOLS) || inside(p, path.join(REPO, '.git')) || (isDir(path.join(repoRoot, '.git')) && (same(p, repoRoot) || inside(p, path.join(repoRoot, '.git')))))
    return ['that is the ARSENAL tools folder itself; writing there would mix your mod with the program', NEW];
  // installs by content
  const hit = detectInstall(p);
  const gameMsg = (kind, d) => kind === 'goh'
    ? [`it is inside the Gates of Hell folder ${d}. ARSENAL never writes into Gates of Hell (its files are not ours to change or share)`, NEW]
    : [`it is inside the game folder ${d}, outside its mods folder. The game's own files must stay untouched`, NEW];
  const okInMods = d => allowMods && inside(p, path.join(d, 'mods')) && !same(p, path.join(d, 'mods'));
  let gohOk = false;   // p is a writable <GoH>/mods/<name>: the GoH name, known-install and Steam library rules below do not apply
  const gm = (d) => { const r = gohMod(p, d, opt); if (r === true) gohOk = true; return r; };
  if (hit) {
    if (hit.kind === 'goh') { const r = gm(hit.dir); if (r !== true) return r || gameMsg('goh', hit.dir); }
    if (!okInMods(hit.dir)) return same(p, path.join(hit.dir, 'mods')) ? [`that is the whole mods folder of ${hit.dir}`, 'Pick one mod: <game folder>\\mods\\<new mod name>.'] : gameMsg('as2', hit.dir);
  }
  // known installs (env, gamedir, the request's own game)
  const k = knownGames(), gs = [...k.as2];
  for (const g of [opt.game, ...(opt.games || [])]) if (typeof g === 'string' && g.trim() && isDir(g) && !plainRoot(g)) gs.push(g);
  for (const g of k.goh) if (g && inside(p, g)) { const r = gm(g); if (r !== true) return r || gameMsg('goh', path.resolve(g)); }
  for (const g of gs) {
    if (!inside(p, g)) continue;
    if (isGoh(g)) { const r = gm(g); if (r !== true) return r || gameMsg('goh', path.resolve(g)); continue; }
    if (!okInMods(g)) return same(p, path.join(g, 'mods')) ? [`that is the whole mods folder of ${path.resolve(g)}`, 'Pick one mod: <game folder>\\mods\\<new mod name>.'] : gameMsg('as2', path.resolve(g));
  }
  // any path segment named like GoH (a renamed or copied GoH folder)
  const segs = p.split(/[\\/]+/).filter(Boolean);
  const gi = segs.findIndex(s => GOH_NAME.test(s));
  if (gi >= 0 && !gohOk) return [`it is inside a Gates of Hell folder (${segs.slice(0, gi + 1).join('/')}). ARSENAL never writes into Gates of Hell`, NEW];
  // Steam library: only an AS2 install's mods/<name> (found above) may be written
  const lo = key(p) + '/';
  if (/\/steamapps\//.test(lo) && !gohOk) {
    const inMods = (hit && hit.kind === 'as2' && okInMods(hit.dir)) || gs.some(g => okInMods(g) && inside(p, g));
    const ws = /\/steamapps\/workshop\//.test(lo), item = opt.allowWorkshop !== false && /\/steamapps\/workshop\/content\/[^/]+\/[^/]+\//.test(lo);   // one Workshop item, not the download folder itself
    if (!inMods && !(item && advOn(opt))) return [ws ? 'it is inside the Steam Workshop download folder; Steam replaces those files on its own and they belong to other authors' : 'it is inside the Steam library (game installs and Workshop downloads)',
      item ? 'To write straight into a Workshop item, switch on Advanced under Tools & Settings (Steam can replace your changes when the item updates). Without it, pick a new folder of your own, for example <game folder>\\mods\\<new mod name>.' : NEW];
  }
  // a vanilla resource/ copy: resource/ with .pak files and no mod.info next to it
  for (let d = p; ; ) {
    if (path.basename(d).toLowerCase() === 'resource' && hasPak(d) && !isFile(path.join(path.dirname(d), 'mod.info'))) return [`it is inside ${d}, a game data folder (it holds .pak files) that is not part of a mod`, NEW];
    const up = path.dirname(d); if (up === d) break; d = up;
  }
  return null;
}

function isLink(p) { try { return fs.lstatSync(p).isSymbolicLink(); } catch (e) { return false; } }
function canRemove(dir, opt = {}) {
  const purpose = opt.purpose || 'delete the folder';
  if (typeof dir !== 'string' || !dir.trim()) return say(purpose, '(nothing)', 'no folder was given');
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs) && !isLink(abs)) return null;
  if (isLink(abs)) {   // a junction: unlinking never touches the folder it points to
    const w = refuseWrite(abs, { ...opt, purpose });
    return w;
  }
  if (!isDir(abs)) return say(purpose, abs, 'it is a file, not a folder', 'Pick a folder.');
  const w = refuseWrite(abs, { ...opt, purpose });
  if (w) return w;
  const markers = opt.markers || [MARKER];
  if (!markers.some(m => fs.existsSync(path.join(abs, m))))
    return say(purpose, abs, 'ARSENAL did not make this folder (it has no ' + markers.join(' or ') + ' marker file), so it may hold your own work', 'Pick a new folder name, or delete or rename that folder yourself first.');
  return null;
}
function safeRemove(dir, opt = {}) {
  const why = canRemove(dir, opt);
  if (why) return why;
  const abs = path.resolve(dir);
  if (isLink(abs)) { try { fs.unlinkSync(abs); } catch (e) { fs.rmdirSync(abs); } return null; }
  if (fs.existsSync(abs)) fs.rmSync(abs, { recursive: true, force: true });
  return null;
}
function mark(dir, what) {
  fs.writeFileSync(path.join(dir, MARKER), JSON.stringify({ by: 'ARSENAL', what: what || '', time: new Date().toISOString() }) + '\n');
}
// a request's game folder: is it really AS2 (exe), and not Gates of Hell? -> null | plain reason
function badGame(dir) {
  if (typeof dir !== 'string' || !dir.trim()) return 'no game folder was given';
  if (!isDir(dir)) return 'the game folder ' + dir + ' does not exist or is not a folder';
  if (isGoh(dir)) return dir + ' is a Gates of Hell folder, not Men of War: Assault Squad 2. Pick the folder that holds as64.exe or mowas_2.exe';
  if (!AS2_EXES.some(x => isFile(path.join(dir, x)))) return dir + ' has no as64.exe or mowas_2.exe, so it is not the Men of War: Assault Squad 2 game folder. Pick the folder that holds the game exe';
  return null;
}
const _reset = () => { CAND = null; };   // tests: forget the cached candidates after changing env
module.exports = { refuseWrite, canRemove, safeRemove, mark, badGame, detectInstall, isGoh, isAs2, nameProblem, MARKER, AS2_EXES, GOH_EXES, _reset };
