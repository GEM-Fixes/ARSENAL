// ARSENAL workflow subcommands: game, install, uninstall, probe, e2e, dev-loop (+ door.js: new, maps, play, advanced). Called from as2.js (main(argv) -> exit code | null if not ours).
// every child step prints its exact command ("$ node tools/<n>/<n>.js args"); --dry prints the chain only, runs nothing.
// install marker: <game>/mods/<name>/.as2-installed (JSON). uninstall/overwrite only touch folders with the marker (a --link install is a junction, no marker: only the link is removed).
// game parity (game.js): every command takes --target as64|mowas2|goh; play/probe/e2e/dev-loop also take --exe as a game word or an exe file
//   (any exe file is kept as the exe, its game from the file name), else the game comes from the mod's mod.info range (MaxGameVersion 3.262.x =
//   mowas_2.exe), else as before (as64.exe, then mowas_2.exe). game, install, uninstall take --exe as a game word only (unknown word = error).
//   game --kind as2|goh (or --target goh, --exe goh): goh prints the Gates of Hell install (games.install('goh'): --game, GOH_GAME, as2.json "goh", Steam).
//   MoW:AS2: mowas_2.exe has no -control/-instance (TST-19): play/probe/e2e/dev-loop run --dry only (the chain with mowas_2.exe, --exe mowas_2 on
//     modinfo, build, modswitch, logtriage and bootcheck, the main user folder in place of a numbered instance (--inst N >= 1 refused), and for play
//     bootcheck --options <options.set> and the base <map>.mowas2.json, bootcheck's base/<map>.<game id>.json); a real run is refused, exit 2. install/uninstall: the shared mods folder.
//   GoH: install/uninstall refused (writeguard: no write into the GoH install), play/probe/e2e/dev-loop refused (no control pipe, goh-drive.md), exit 2.
// Author: Imperator_Aug (ARSENAL, ia-71076c46)
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const gamedir = require('../lib/gamedir'), userdir = require('../lib/userdir'), dirlike = require('../lib/dirlike');
const G = require('./game'), games = require('../lib/games');
const TOOLS = path.join(__dirname, '..');
const MARK = '.as2-installed';
const door = require('./door');
const CMDS = new Set(['game', 'install', 'uninstall', 'probe', 'e2e', 'dev-loop', ...door.CMDS]);
// DOOR-B5: commands that are pure fs (no spawn of node or the game): the single exe runs these itself (sea-main.js: EXE_OK.has(cmd) -> flow.main). the rest spawn tool scripts + the game and stay repo-only
// T-SURFACE: door.js commands (new, maps, play, advanced) also run in the exe; new/maps spawn tool scripts by path, which the exe serves itself (sea-main GUI-4) [I]
const EXE_OK = new Set(['game', 'install', 'uninstall', ...door.CMDS]);
const BOOL = new Set(['--link', '--force', '--yes', '--dry']);
const VAL = new Set(['--name', '--map', '--game', '--logdir', '--exe', '--profile', '--players', '--inst', '--target', '--kind']);

function parse(argv) {
  const o = { pos: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (BOOL.has(a)) o[a.slice(2)] = true;
    else if (VAL.has(a)) { if (i + 1 >= argv.length) throw new Error(a + ' needs a value'); o[a.slice(2)] = argv[++i]; }
    else if (a.startsWith('--')) throw new Error('unknown option ' + a);
    else o.pos.push(a);
  }
  return o;
}
const q = s => (/[\s"]/.test(s) ? '"' + s + '"' : s);
const out = s => process.stdout.write(s + '\n');

// ---- child steps
function step(tool, args, o, { capture = false } = {}) {
  out('$ node tools/' + tool + '/' + tool + '.js ' + args.map(q).join(' '));
  if (o.dry) return { status: 0, text: '' };
  const r = spawnSync(process.execPath, [path.join(TOOLS, tool, tool + '.js'), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
  const text = (r.stdout || '') + (r.stderr || '');
  if (text) process.stdout.write(text.endsWith('\n') ? text : text + '\n');
  return { status: r.error ? 2 : r.status == null ? 1 : r.status, text };
}

function need(o) {
  // T-INSTALL: a --game that is not a folder used to be taken as given, and install then created <it>/mods/<name>
  if (o.game && !(fs.existsSync(o.game) && fs.statSync(o.game).isDirectory())) throw new Error('--game: not a folder: ' + o.game);
  const g = gamedir.resolve({ arg: o.game });
  for (const l of g.warn || []) console.error(l);
  if (g.dir) return g;
  if (o.dry) return { dir: '<game>', source: 'dry-placeholder' };
  throw new Error(gamedir.explain(g));
}
function detectExe(dir) {
  // the AS2 games' exe files in the games table order (as64.exe, then mowas_2.exe), as the vfs picks them
  for (const n of games.GAMES.filter(x => x.kind === 'as2').map(x => x.file)) if (fs.existsSync(path.join(dir, n))) return path.join(dir, n);
  return null;
}
// the run's game: --target, then --exe (game word or exe file), then the mod.info range; {id|null, file|null, from}
function gameOf(o, mod) {
  let id = o.target ? G.word(o.target) : null, file = null;
  if (o.exe) {
    const e = G.fromExe(o.exe);
    if (e.id && id && e.id !== id) throw new Error('--exe ' + o.exe + ' is ' + G.name(e.id) + ' but --target is ' + G.name(id));
    id = id || e.id; file = e.file;
  }
  if (id) return { id, file, from: 'option' };
  const m = mod ? G.fromModInfo(mod) : null;
  return { id: m, file, from: m ? 'mod.info' : null };   // an --exe file of no known name (custom.exe) stays the exe
}
// install, uninstall, game: the game word only (--target, then --exe as a game word or a game exe file); an unknown --exe is an error, not a file
function wordOf(o) {
  if (o.exe && !G.fromExe(o.exe).id) throw new Error('--exe ' + o.exe + ': unknown game (as64, mowas2, goh)');
  return gameOf(o, null);
}
// MoW:AS2 chain steps: the tools that read game data get --exe mowas_2 (none for AS64: its argument lists stay as they were)
const exeArg = gm => (gm.id === 'mowas2' ? ['--exe', 'mowas_2'] : []);
// exe file for testrun: given file > the game's exe in the install (named game; a mod.info guess only when that exe is there) > detectExe
function exeFor(gm, dir) {
  if (gm.file) return gm.file;
  if (gm.id) {
    const f = path.join(dir, ...games.get(gm.id).file.split('/'));
    if (gm.from === 'option' || fs.existsSync(f)) return f;
  }
  return detectExe(dir);
}
// the plain refusals at the start of a run command: GoH always (cmd 'install'/'uninstall' cite the write guard, the rest the missing pipe);
// MoW:AS2 runs unless --dry. -> exit code | 0 (go on)
function runGate(cmd, gm, o) {
  if (gm.id === 'goh') {
    if (cmd === 'install' || cmd === 'uninstall') return G.no(cmd, 'goh', 'mods are not copied into the Gates of Hell install', G.ROW.gohWrite);
    if (cmd === 'probe') return G.no(cmd, 'goh', 'probe starts the game exe to read its flags; ARSENAL does not start Gates of Hell', G.ROW.gohPipe);
    return G.no(cmd, 'goh', 'this command installs the mod and starts the game through its control pipe; ARSENAL neither writes into nor starts Gates of Hell', G.ROW.gohPipe);
  }
  if (gm.id === 'mowas2' && cmd !== 'install' && cmd !== 'uninstall') {
    if (!o.dry) return G.no(cmd, 'mowas2', 'the run needs the control pipe and a numbered instance; use --dry for the plan' + (gm.from === 'mod.info' ? ' (the mod.info range is 3.262, so the game is MoW:AS2; --target as64 runs it on AS64)' : ''), G.ROW.pipe);
    if (o.inst != null && instOf(o) > 0) return G.no(cmd, 'mowas2', 'mowas_2.exe has no -instance, so the plan uses the main user folder; give no --inst', G.ROW.pipe);
    out('MoW:AS2 (' + (gm.from === 'mod.info' ? 'from the mod.info range' : 'named') + '): mowas_2.exe has no control pipe and no -instance (TST-19), so this chain is a plan only; a real run is refused');
  }
  return 0;
}
// TST-22: -instance N has its own user dir + log/. AS2_HOME overrides the home dir (tests)
function instOf(o) {
  if (o.inst == null) return 0;
  if (!/^[0-9]+$/.test(o.inst)) throw new Error('--inst needs a number');
  return Number(o.inst);
}
// the log folder per game: userdir.logDirFor (AS64 and MoW:AS2 share the AS2 user dir, the same as userdir.logDir; GoH: its own user dir)
function defaultLogDir(inst = 0, game = null) {
  const home = process.env.AS2_HOME || os.homedir(), d = userdir.logDirFor(game, inst, { home });
  if (d) return d;
  return path.join(home, 'Documents', 'my games', 'men of war - assault squad 2' + (inst ? ' - instance ' + inst : ''), 'log');
}

// VFS-48 (same rule as modswitch isModern): MinGameVersion >= 3.301 = Enhanced-only
function isModern(dir) {
  try {
    const t = fs.readFileSync(path.join(dir, 'mod.info'), 'latin1'), r = /[{]\s*MinGameVersion\s+"([^"]*)"/i.exec(t);
    if (!r) return false;
    const v = r[1].replace(/[^0-9.]/g, '').split('.').filter(x => x !== '').map(Number);
    return v.length > 0 && (v[0] > 3 || (v[0] === 3 && (v[1] || 0) >= 301));
  } catch { return false; }
}

// ---- install / uninstall
function rmLink(p) { try { fs.unlinkSync(p); } catch (e) { fs.rmdirSync(p); } } // junction: remove the link only, never the target
function isLink(p) { try { return fs.lstatSync(p).isSymbolicLink(); } catch (e) { return false; } }
function safeName(n) { if (!n || !/^[^\\/:*?"<>|]+$/.test(n) || n === '.' || n === '..') throw new Error('bad mod name: ' + n); return n; }
const WG = require('../lib/writeguard');
// T-INSTALL: the game lowercases the mod folder name and matches the {mods} line exactly (VFS-12 [V]); a name with capitals never matches. spaces: no mod_set,
// only the options seed mounts it (testing/in-play) [V], so new installs refuse both. uninstall still accepts them (an old folder must stay removable)
function installName(n) {
  safeName(n);
  if (n !== n.toLowerCase()) throw new Error('mod folder name "' + n + '" has capital letters; the game matches the mod list in lowercase. Use --name ' + n.toLowerCase().replace(/\s+/g, '_'));
  if (/\s/.test(n)) throw new Error('mod folder name "' + n + '" has spaces; mod_set cannot list it. Use --name ' + n.replace(/\s+/g, '_'));
  // I-15/I-17: over-long and Windows device names
  if (n.length > 100) throw new Error('mod folder name is ' + n.length + ' characters long; keep it to 100 or less. Use a short --name, e.g. mymod');
  const np = WG.nameProblem(n); if (np) throw new Error('mod folder name "' + n + '": ' + np + '. Use another --name, e.g. mymod');
  return n;
}

function install(o) {
  { const rc = runGate('install', wordOf(o), o); if (rc) return rc; }
  const src = o.pos[0];
  if (!src || !fs.existsSync(src) || !fs.statSync(src).isDirectory()) throw new Error('usage: ARSENAL install <modFolder> [--name n] [--link] [--force] [--game G]');
  if (!fs.existsSync(path.join(src, 'mod.info'))) throw new Error(src + ' has no mod.info, so it is not a mod folder. Make one with: ARSENAL new <folder>');
  const name = installName(o.name || path.basename(path.resolve(src))), g = need(o);
  // I-8: the game folder must be AS2 (holds the exe), never Gates of Hell; a random folder never gets a mods/ made in it
  if (g.source !== 'dry-placeholder' && !o.dry) { const bg = WG.badGame(g.dir); if (bg) { console.error('error: refusing to install: ' + bg + '.'); return 2; } }
  const dest = path.join(g.dir, 'mods', name);
  if (g.source !== 'dry-placeholder') { const why = WG.refuseWrite(dest, { game: g.dir, purpose: 'install the mod' }); if (why) { console.error('error: ' + why); return 2; } }
  out('install: ' + src + ' -> ' + dest + (o.link ? ' (junction)' : ' (copy)'));
  // REV-TOOLS 1: src == dest (mod already in mods/) or one inside the other: the overwrite would delete the source. compared after realpath,
  // case-insensitive; dest itself is not followed (a junction at dest is only unlinked), src is compared both as given and resolved
  const lex = p => path.join(dirlike.real(path.dirname(path.resolve(p))), path.basename(path.resolve(p)));
  for (const s of [lex(src), dirlike.real(src)]) {
    const ov = dirlike.overlap(s, lex(dest));
    if (ov === 'same') { out("already in the game's mods folder, nothing to copy: " + dest); return 0; }   // GX first-mod G2: no marker written, so uninstall still refuses it
    if (ov) { console.error('error: refusing to install: source ' + s + (ov === 'same' ? ' is the destination ' : ov === 'a-in-b' ? ' is inside the destination ' : ' contains the destination ') + dest + ' (overwriting it would delete the source)'); return 2; }
  }
  if (o.dry) return 0;
  const exists = fs.existsSync(dest) || isLink(dest);
  // I-10: an existing folder is only replaced when ARSENAL installed it (marker); --force never deletes a hand-made folder. a junction is only unlinked (its target is untouched)
  if (exists && !isLink(dest)) {
    const why = WG.canRemove(dest, { markers: [MARK, WG.MARKER], purpose: 'replace the installed folder', game: g.dir });
    if (why) { console.error('error: ' + dest + ' exists and was not made by ARSENAL install, so it may hold your own work; refusing to replace it' + (o.force ? ' (--force only replaces a folder ARSENAL installed)' : '') + '. Rename or remove it yourself, or install under another --name.'); return 2; }
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const meta = JSON.stringify({ source: path.resolve(src), link: !!o.link, time: new Date().toISOString() });
  // copy: built in a temp sibling first, the old install is replaced only once the copy is complete
  let tmp = null;
  if (!o.link) {
    tmp = dest + '.as2tmp-' + process.pid;
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.cpSync(src, tmp, { recursive: true });
      fs.writeFileSync(path.join(tmp, MARK), meta);
    } catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); throw e; }
  }
  if (exists) { if (isLink(dest)) rmLink(dest); else fs.rmSync(dest, { recursive: true, force: true }); }
  if (o.link) {
    fs.symlinkSync(path.resolve(src), dest, 'junction');   // I-10: no marker: it would land in the SOURCE folder; a junction is recognised as a link instead
  } else fs.renameSync(tmp, dest);
  out('installed ' + name);
  return 0;
}

function uninstall(o) {
  { const rc = runGate('uninstall', wordOf(o), o); if (rc) return rc; }
  const name = safeName(o.pos[0]), g = need(o), dest = path.join(g.dir, 'mods', name);
  if (!fs.existsSync(dest) && !isLink(dest)) { console.error('error: not installed: ' + dest); return 2; }
  if (!isLink(dest) && !fs.existsSync(path.join(dest, MARK))) { console.error('error: ' + dest + ' has no ' + MARK + ' marker (not created by ARSENAL install); refusing'); return 2; }
  const what = isLink(dest) ? ' (junction only; target untouched)' : ' (folder and contents)';
  if (!o.yes) { out('would remove: ' + dest + what); out('re-run with --yes to remove'); return 1; }
  if (isLink(dest)) { try { if (JSON.parse(fs.readFileSync(path.join(dest, MARK), 'utf8')).link) fs.unlinkSync(path.join(dest, MARK)); } catch (e) { /* none: new link installs write no marker */ } rmLink(dest); } else fs.rmSync(dest, { recursive: true, force: true });
  out('removed: ' + dest + what);
  out('removed ' + name);
  return 0;
}

// ---- flows
function probe(o) {
  const gm = gameOf(o, null);
  { const rc = runGate('probe', gm, o); if (rc) return rc; }
  const g = need(o), exe = exeFor(gm, g.dir), a = [];
  if (exe) a.push('--exe', exe);
  a.push('--probe');
  if (instOf(o)) a.push('--inst', String(instOf(o)));
  if (o.logdir) a.push('--logdir', o.logdir);
  const r = step('testrun', a, o);
  if (r.status === 2 && /TESTRUN_BAD_ARGS/.test(r.text)) { out('ARSENAL:this testrun does not support --probe yet (TESTRUN_BAD_ARGS)'); return 2; }
  return r.status;
}

function e2e(o, { skipModinfo = false, skipBuild = false, skipInstall = false } = {}) {
  const mod = o.pos[0];
  if (!mod) throw new Error('usage: ARSENAL e2e <modFolder> --map <map> [--name n] [--game G] [--logdir D] [--exe X] [--dry]');
  if (!o.map) throw new Error('ARSENAL e2e needs --map <map>');
  const gm = gameOf(o, mod);
  if (!skipModinfo) { const rc = runGate('e2e', gm, o); if (rc) return rc; }   // dev-loop gated already
  const g = need(o), name = safeName(o.name || path.basename(path.resolve(mod)));
  const exe = exeFor(gm, g.dir), inst = instOf(o), logdir = o.logdir || defaultLogDir(inst, gm.id), X = exeArg(gm);
  const profile = o.profile || g.profile;
  const sw = extra => ['--game', g.dir, ...X, ...(profile ? ['--profile', profile] : inst ? ['--inst', String(inst)] : []), ...extra];
  // per-run snapshot: --restore must return the list from just before this run, not modswitch's keep-first .bak
  const snap = 'options.set.as2-e2e'; // modswitch resolves it in the profile dir
  let rc = 0;
  const fail = (what, r) => { console.error('ARSENAL:' + what + ' failed (exit ' + r.status + '), aborting'); return r.status || 1; };
  let r;
  if (!skipModinfo) { r = step('modinfo', [mod, ...X], o); if (r.status) return fail('modinfo', r); }
  if (!skipBuild) { r = step('build', [mod, '--game', g.dir, ...X], o); if (r.status) return fail('build', r); }
  if (!skipInstall) {
    const ia = ['install', mod, '--name', name, '--game', g.dir];
    out('$ ARSENAL ' + ia.map(q).join(' '));
    const c = install({ pos: [mod], name, game: g.dir, dry: o.dry, force: o.force, link: o.link });
    if (c) return c;
  }
  r = step('modswitch', sw(['--set', (isModern(mod) && gm.id !== 'mowas2' ? 'as64+,' : '') + name, '--write', '--bak', snap]), o); // VFS-48: modern mod needs as64+ listed (an as64 mod; MoW:AS2 has no as64+)
  if (r.status) return fail('modswitch --set', r);
  try {
    const ta = ['--map', o.map, ...(exe ? ['--exe', exe] : []), '--logdir', logdir];
    if (o.players) ta.push('--players', o.players);
    if (inst) ta.push('--inst', String(inst));
    const since = o.dry ? '<testrun-start>' : String(Date.now()); // logtriage --since: older dumps/oos are not this run's
    r = step('testrun', ta, o);
    if (r.status) { rc = r.status; if (/TESTRUN_BAD_ARGS/.test(r.text)) out('ARSENAL:testrun rejected its arguments (TESTRUN_BAD_ARGS)'); }
    const t = step('logtriage', [logdir, '--mod', mod, '--game', g.dir, '--since', since, ...X], o);
    if (!rc && t.status) rc = t.status;
  } finally {
    const b = step('modswitch', sw(['--restore', '--write', '--bak', snap]), o);
    if (b.status) { console.error('ARSENAL:modswitch --restore failed (exit ' + b.status + '): options.set may still list ' + name); rc = rc || b.status; }
  }
  return rc;
}

function devLoop(o) {
  const mod = o.pos[0];
  if (!mod) throw new Error('usage: ARSENAL dev-loop <modFolder> --map <map> [...]');
  const gm = gameOf(o, mod), X = exeArg(gm);
  { const rc = runGate('dev-loop', gm, o); if (rc) return rc; }
  const g = need(o), name = safeName(o.name || path.basename(path.resolve(mod)));
  // modinfo before build/install: a bad mod.info must not reach the game folder (ENG-26 crash)
  let r = step('modinfo', [mod, ...X], o);
  if (r.status) { console.error('ARSENAL:modinfo failed, aborting'); return r.status; }
  r = step('build', [mod, '--game', g.dir, ...X], o);
  if (r.status) { console.error('ARSENAL:build failed, aborting'); return r.status; }
  out('$ ARSENAL install ' + [mod, '--name', name, '--game', g.dir].map(q).join(' '));
  const c = install({ pos: [mod], name, game: g.dir, dry: o.dry, force: o.force, link: o.link });
  if (c) return c;
  return e2e(o, { skipModinfo: true, skipBuild: true, skipInstall: true }); // modinfo + build + install already done above
}

// T-PLAY: play = modinfo + install + modswitch (own instance) + testrun on the test map + modswitch --restore + bootcheck verdict from the game log.
// never instance 0 (the user's own settings and log). --dry prints every step and writes nothing. the real start is untried [T] (wave 3 G-BOOT)
const PLAY_MAP = 'multi/1v1_reloading_point:combat'; // T-DOORFIX: the map that has a shipped bootcheck baseline (tools/bootcheck/base/1v1_reloading_point.json, G-BASE map B). [T] the :combat suffix and a testrun start on it are untried
const mapKey = m => m.replace(/:.*$/, '').replace(/^multi\//, '').replace(/[^A-Za-z0-9_.-]+/g, '_');
function play(o) {
  const mod = o.pos[0];
  if (!mod || o.pos.length > 1) throw new Error('usage: ARSENAL play <mod folder> [--map m] [--inst N] [--dry]');
  // T-PLAYFIX: a bare name (no path) that is no folder here but is a mod already in <game>/mods = play it in place, no install step
  let placed = null;
  if (!fs.existsSync(mod) || !fs.statSync(mod).isDirectory()) {
    if (/^[^\\/:]+$/.test(mod) && mod !== '.' && mod !== '..') {
      const g0 = gamedir.resolve({ arg: o.game }), d0 = g0.dir && path.join(g0.dir, 'mods', mod);
      if (d0 && fs.existsSync(path.join(d0, 'mod.info'))) placed = d0;
    }
    if (!placed) throw new Error('not a mod folder: ' + mod);
  }
  const gm = gameOf(o, placed || mod), mow = gm.id === 'mowas2', X = exeArg(gm);
  if (!mow && o.inst != null && instOf(o) === 0) throw new Error('play never uses instance 0 (that is your own game settings and log). Use --inst 1 or higher');
  { const rc = runGate('play', gm, o); if (rc) return rc; }
  // MoW:AS2 (TST-19): no -instance, so the plan lists the mod in the main user folder (its list is saved with --bak and restored after)
  const inst = mow ? 0 : o.inst == null ? 1 : instOf(o), map = o.map || PLAY_MAP;
  const where = mow ? 'the main user folder' : 'instance ' + inst;
  const g = gamedir.resolve({ arg: o.game }); // no dry placeholder: the missing-game text is the same with and without --dry
  for (const l of g.warn || []) console.error(l);
  if (!g.dir) throw new Error(gamedir.explain(g));
  const name = safeName(placed ? mod : o.name || path.basename(path.resolve(mod))), exe = exeFor(gm, g.dir), logdir = o.logdir || defaultLogDir(inst, gm.id);
  // a BOOT baseline is per game: the as64 one keeps its old name, the others <map>.<game id>.json, the name bootcheck's own hint gives
  //   (MoW:AS2: <map>.mowas2.json, none recorded yet: needs a game run)
  const baseName = mapKey(map) + (gm.id && gm.id !== 'as64' ? '.' + gm.id : '') + '.json';
  const profile = o.profile || g.profile, base = 'tools/bootcheck/base/' + baseName;
  const baseAbs = path.join(TOOLS, 'bootcheck', 'base', baseName);
  const sw = extra => ['--game', g.dir, ...X, ...(profile ? ['--profile', profile] : inst ? ['--inst', String(inst)] : []), ...extra];
  const snap = 'options.set.as2-play';
  out('play: ' + name + '  map ' + map + '  ' + where + (o.dry ? '  (dry: nothing is written or started)' : ''));
  out('1. check mod.info   2. install   3. list the mod for ' + where + '   4. start the game on the map   5. restore the list   6. BOOT verdict from game.log');
  const fail = (what, r) => { console.error('ARSENAL:' + what + ' failed (exit ' + r.status + '), aborting'); return r.status || 1; };
  // GX first-mod G2: a folder that already is <game>/mods/<name> is played in place (no copy)
  if (!placed) {
    const lx = p => path.join(dirlike.real(path.dirname(path.resolve(p))), path.basename(path.resolve(p)));
    if (dirlike.overlap(lx(mod), lx(path.join(g.dir, 'mods', name))) === 'same') placed = path.resolve(mod);
  }
  const modDir = placed || mod;
  let r = step('modinfo', [modDir, ...X], o);
  if (r.status) return fail('modinfo', r);
  if (placed) out('already installed: ' + placed + ' (played in place, no install step)');
  else out('$ ARSENAL install ' + [mod, '--name', name, '--game', g.dir, ...(o.link ? ['--link'] : []), ...(o.force ? ['--force'] : [])].map(q).join(' '));
  const c = placed ? 0 : install({ pos: [mod], name, game: g.dir, dry: o.dry, force: o.force, link: o.link });
  if (c) return c;
  r = step('modswitch', sw(['--set', (isModern(modDir) && gm.id !== 'mowas2' ? 'as64+,' : '') + name, '--write', '--bak', snap]), o);
  if (r.status) return fail('modswitch --set', r);
  let rc = 0, since = o.dry ? '<testrun-start>' : String(Date.now());
  try {
    const ta = ['--map', map, ...(exe ? ['--exe', exe] : []), '--logdir', logdir, ...(inst ? ['--inst', String(inst)] : [])];
    if (o.players) ta.push('--players', o.players);
    r = step('testrun', ta, o);
    if (r.status) { rc = r.status; if (/TESTRUN_BAD_ARGS/.test(r.text)) out('ARSENAL:testrun rejected its arguments (TESTRUN_BAD_ARGS)'); }
  } finally {
    const b = step('modswitch', sw(['--restore', '--write', '--bak', snap]), o);
    if (b.status) { console.error('ARSENAL:modswitch --restore failed (exit ' + b.status + '): the mod list of ' + where + ' may still list ' + name); rc = rc || b.status; }
  }
  if (rc) { out('BOOT: not decided, the game run itself failed (exit ' + rc + '). Read the log: ARSENAL logtriage ' + q(logdir)); return rc; }
  const log = path.join(logdir, 'game.log');
  if (!o.dry && !fs.existsSync(baseAbs)) {
    out('no baseline for this map yet (' + base + '): the BOOT verdict needs one recorded run of the game without the mod' + (gm.id && gm.id !== 'as64' ? ' (bootcheck base <game.log> --exe ' + gm.id + ' --to-clock -o ' + base + ')' : ''));
    r = step('logtriage', [logdir, '--mod', modDir, '--game', g.dir, '--since', since, ...X], o);
    out('BOOT: not decided (no baseline). logtriage exit ' + r.status);
    return r.status;
  }
  if (o.dry) out('(if ' + base + ' is missing, the real run runs logtriage instead and says BOOT is not decided)');
  // a base for a game other than AS64 is recorded with that game's --exe (bootcheck base reads the log in that game's form)
  if (o.dry && gm.id && gm.id !== 'as64') out('(record it from a run without the mod: node tools/bootcheck/bootcheck.js base <game.log> --exe ' + gm.id + ' --to-clock -o ' + base + ')');
  // MoW:AS2 (ENG-19): no control pipe, so its log has no "control> mod_set" line: the mod list is read from the instance's options.set
  const opts = gm.id !== 'mowas2' ? [] : ['--options', profile || userdir.profilesFor(gm.id, inst, process.env.AS2_HOME ? { home: process.env.AS2_HOME } : {})[0] || '<options.set of ' + where + '>'];
  r = step('bootcheck', ['mod', log, '--base', o.dry ? base : baseAbs, '--to-clock', '--mod', name, ...opts, ...X], o);
  if (o.dry) { out('BOOT verdict printed here after a real run: PASS (exit 0) = no new error line vs the baseline, the clock reached, the mod active; FAIL (exit 1)'); return 0; }
  out('BOOT: ' + (r.status === 0 ? 'PASS' : r.status === 1 ? 'FAIL' : 'not decided (bootcheck exit ' + r.status + ')') + '. This is "loads without new errors", not "works": play it.');
  return r.status;
}

// HELPFIX: `ARSENAL <cmd> --help` = usage + exit 0 (probe, e2e, dev-loop are repo-only: node tools/as2/as2.js <cmd>; game, install, uninstall run in the exe)
const TGT = '\n  --target as64|mowas2|goh = the game (default as64; ',
  RUNT = TGT + '--exe also takes a game word or an exe file; no game named: the mod.info range, 3.262 = MoW:AS2).\n  MoW:AS2 runs --dry only (mowas_2.exe has no control pipe, TST-19); Gates of Hell is refused (no control pipe, no write into its install).';
const USAGE = {
  game: 'usage: ARSENAL game [--game G] [--kind as2|goh | --target as64|mowas2|goh | --exe as64|mowas_2|goh]   (prints the game folder found and how: arg, env, as2.json, steam)\n' +
    '  as2 (default; AS64 and MoW:AS2 share one install) | goh = the Gates of Hell install (--game, GOH_GAME, as2.json "goh", Steam)',
  install: 'usage: ARSENAL install <modFolder> [--name n] [--link] [--force] [--game G] [--target T | --exe T] [--dry]' + TGT + 'AS64 and MoW:AS2 share one mods folder; Gates of Hell is refused: ARSENAL does not write into its install)',
  uninstall: 'usage: ARSENAL uninstall <name> --yes [--game G] [--target T | --exe T] [--dry]   (only folders made by ARSENAL install)' + TGT + 'Gates of Hell is refused)',
  probe: 'usage: ARSENAL probe [--game G] [--exe X] [--target T] [--logdir D] [--inst N] [--dry]' + RUNT,
  e2e: 'usage: ARSENAL e2e <modFolder> --map <map> [--name n] [--game G] [--logdir D] [--exe X] [--target T] [--players n] [--profile p] [--inst N] [--dry]' + RUNT,
  'dev-loop': 'usage: ARSENAL dev-loop <modFolder> --map <map> [--name n] [--link] [--force] [--game G] [--logdir D] [--exe X] [--target T] [--players n] [--profile p] [--inst N] [--dry]' + RUNT,
};
function main(argv) {
  if (!argv.length || !CMDS.has(argv[0])) return null;
  if (door.CMDS.has(argv[0])) return door.main(argv);
  if (argv.includes('--help') || argv.includes('-h')) { out(USAGE[argv[0]] + (EXE_OK.has(argv[0]) ? '' : '\n  repo only: node tools/as2/as2.js ' + argv[0] + ' (not in ARSENAL.exe)')); return 0; }
  try {
    const cmd = argv[0], o = parse(argv.slice(1));
    switch (cmd) {
      case 'game': {
        if (o.game && !(fs.existsSync(o.game) && fs.statSync(o.game).isDirectory())) { console.error('error: --game: not a folder: ' + o.game); return 2; }
        if (o.kind && !['as2', 'goh'].includes(o.kind)) { console.error('error: --kind ' + o.kind + ': as2 or goh'); return 2; }
        const tg = wordOf(o).id;   // --target, then --exe (a game word or a game exe file)
        const kind = o.kind || (tg ? games.kindOf(tg) : 'as2');
        if (o.kind && tg && games.kindOf(tg) !== o.kind) { console.error('error: ' + (o.target ? '--target ' + o.target : '--exe ' + o.exe) + ' is not of --kind ' + o.kind); return 2; }
        if (kind === 'goh') {
          const r = games.install('goh', { arg: o.game });
          if (!r.dir) { console.error('error: no Gates of Hell folder found. Set it one of three ways: --game "<GoH folder>" with --kind goh, the GOH_GAME environment variable, or as2.json {"goh": "<GoH folder>"} (Steam app 400750 is looked up too)'); return 2; }
          out(r.dir + '  (' + r.source + ')'); return 0;
        }
        const g = gamedir.resolve({ arg: o.game });
        for (const l of g.warn || []) console.error(l);
        if (!g.dir) { console.error('error: ' + gamedir.explain(g)); return 2; }
        out(g.dir + '  (' + g.source + ')'); return 0; }
      case 'install': return install(o);
      case 'uninstall': return uninstall(o);
      case 'probe': return probe(o);
      case 'e2e': return e2e(o);
      case 'dev-loop': return devLoop(o);
    }
  } catch (e) { console.error('error: ' + e.message); return 2; }
  return null;
}
module.exports = { main, parse, install, uninstall, play, PLAY_MAP, CMDS, MARK, EXE_OK };
