#!/usr/bin/env node
// doctor (L5): one mod → every applicable tool with its Require deps mounted (transitive, from mods/*/mod.info), one
// compact report: per tool total + codes, first finding per code. full outputs → --out dir (default os tmp), never the mod.
//   node doctor.js <mod folder> [--game dir] [--only t1,t2] [--out dir] [-j N]
//   -q: hide info (release summaries) in this report; sub-tools always run with -q (info never counted)
//   --options FILE | --mods-list a,b: also check the active list for unknown folders (DOC_MOD_NOT_INSTALLED, VFS-13)
//   envcheck (always, in-process): map mod/ overlays vs own files (DOC_MAPMOD_SHADOWS, VFS-33), loose map vs pak (info, MAP-27)
//   --release: ship checklist instead (release.js: REL_* stray files, pak/loose dups, NET-01 size-only summary, size)
//   game dir defaults to the folder's grandparent when it sits in <game>/mods; without a game only folder tools run.
//   binhdr + refcheck scope = all mounted mods (deps included); folder tools see the mod folder only.
//   --locs N: run linters without --summary and keep up to N {file,line,msg} per code (GUI-LOC); --locs-json FILE writes them
//     as {tools:{tool:{root,samples:{CODE:[..]}}}}. --progress: PROGRESS start|done <tool> lines on stderr while running.
//   -j N = at most N tools at once (default 3); within it a RAM plan (jobs.js, lib/registry mem): the running tools' estimates stay under 80%
//     of free RAM, biggest first, small ones fill in (JOBS note when RAM holds it below -j); a tool that died out of memory (exit 134) reruns alone once (RERAN note).
//   --exe as64|mowas_2|mowas2|goh: the game the mod is for (lib/games). none = the game the folder holds (as64.exe first, as before).
//     mowas_2: no as64+ (not added, a Require on it is DEP_MISSING), the Min+Max gate (PORT-48), and every linter that takes --exe gets
//     --exe mowas_2 (no as64/core in its vfs view); one that does not yet is named in an EXE_NOT_PASSED note (it reads the shared install as AS64).
//     goh: the GoH install (--goh H, else --game, else <game> above mods/, else lib/games install('goh')); gate = the exe's PE version inside
//     Min..Max, "any" open, each bound optional (none = open), tag develop = any version (GHVFS-26, GHVFS-02 [V], lib/vfs.js GoH gate);
//     --exe goh is passed on to every linter that takes it (registry exe, its own '--exe' or cli.parse), with no EXE_NOT_PASSED note for goh;
//     every linter runs on GoH (uilint with its GoH tables, binhdr with GoH map.net cell 5); a linter whose lib/registry entry names
//     games without this one (none today) is left out with one GAME_SKIP note. --goh H alone means --exe goh.
//   linters run = lib/registry forDoctor(game); --exe goes to each one whose registry entry has exe: true (or that parses --exe itself)
//   version gate (every game, same as lib/vfs.js build): as64 first applies the mode rule (MOD_MODE: Min >= 3.301 needs as64+ in the list,
//     a Classic mod needs it absent); a mod whose bounds are missing or whose range misses the game version gets one
//     NOT_MOUNTED note, is left out of the linters' --mods and the header's mounted list, binhdr + refcheck read it with --folder,
//     mpsync is skipped (named in that note), and expcheck reads it with --folder too (its folder layer works inside <game>/mods as well)
//   --cache-dir D: refcheck keeps its entity index cache at D/refcheck.json instead of the shared cache folder (tools/check gives a temp
//     folder for an overlay game dir, which is new each run: its cache would never be read again)
//   --restore-points: also read restore points kept inside the mod (<mod>/.arsenal-undo; left out by default, 1B):
//     passed to sdllint and refcheck, and to any other linter whose source takes '--restore-points' (none else today)
//   --release with goh (named, or the mod sits in <GoH>/mods): localizations/ is mounted (GHLOC-01), not a stray folder
//   --reuse-dir D (tools/check, wave 2a of: sdllint and refcheck are not run when wouldload (--keep-out D, beside
//     doctor) ran them for this game with the SAME arguments: doctor waits for D/<game id>.<tool>.json and parses its output exactly as
//     its own run's (counts, first lines, --locs samples). Same = same positional paths, --game, --mods (same order), --folder, --scope,
//     --exe, --restore-points, --summary and the same .lintrc (none found = --no-rc); -q and --cache (a cache file only) not compared.
//     Anything else (no file and D/END written, a pass that did not finish, other arguments): doctor runs the tool itself as before,
//     note REUSE_MISS. One note REUSED names the tools whose findings came from the load check's run. The read-once pass takes the
//     load check's listing of the mod from D/listing.json (wouldload --keep-out) instead of listing it again (none by END: lists it).
//   read once phase 2, lib/modset, tools/lib/MODSET.md): a linter with a module form (tools/<t>/ctx.js) runs
//     ONE shared pass inside doctor (one listing of the mod, each text file read once and handed to every such linter, each linter in its
//     own worker thread); the others stay child programs. Same outputs, files and --locs-json. Each member is its own job of the RAM
//     plan (its mem row without the margin: measured in the pass, RO-E); the pass opens with the first, closes after the last; binhdr
//     starts first. Note READ_ONCE on: <tools> in one pass. --no-read-once (or env ARSENAL_READ_ONCE=0): every
//     linter as its own program, as before (note READ_ONCE off). A linter whose in-pass run throws, exits, runs out of memory or gives an
//     output without its "N findings" line reruns alone as a program after the pool: note READ_ONCE fallback <tool>: <reason>.
//     Test hook DOCTOR_TEST_RO_FAIL=t1[:throw|oom|partial],..|* (* = the whole pass fails). DOCTOR_RO_STATS=1: pass stats on stderr
//     (=<file>: a JSON profile there: per member CPU / idle / waits / heap, this thread's load, peak RSS, busy cores, job times).
// Author: Imperator_Aug (ARSENAL, ia-127ff0de)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
// read once: the pass and every linter thread in it share this process's libuv pool (async file reads); the default 4 threads queue
// them (RO-E: 63 ms per read on RobZ). More threads here, set before the first async call; child programs get the env as it was
const UV0 = process.env.UV_THREADPOOL_SIZE;
if (UV0 === undefined && !process.argv.includes('--no-read-once') && process.env.ARSENAL_READ_ONCE !== '0') process.env.UV_THREADPOOL_SIZE = '16';
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const { countOutput } = require('../lib/report'), { discover } = require('../lib/vfs'), names = require('../lib/names');

// .lintrc + --format wiring (own arg parser): rc from --rc FILE, else nearest .lintrc walking up from `start`; --no-rc disables
const { rcPrint } = require('../lib/cli'), registry = require('../lib/registry'), C = require('../modmove/lib/common');
const argv = process.argv.slice(2), o = { j: 3 }, pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--game') o.game = argv[++i];
  else if (a === '--only') o.only = new Set(argv[++i].split(','));
  else if (a === '--out') o.out = argv[++i];
  else if (a === '-j') o.j = +argv[++i];
  else if (a === '--locs') o.locs = +argv[++i]; else if (a === '--locs-json') o.locsJson = argv[++i]; else if (a === '--progress') o.progress = true;
  else if (a === '--rc') o.rcFile = argv[++i]; else if (a === '--no-rc') o.noRc = true; else if (a === '--format') o.format = argv[++i]; else if (a === '-o') o.output = argv[++i]; else if (a === '-q') o.q = true;
  else if (a === '--release') o.release = true;
  else if (a === '--big') o.big = +argv[++i];
  else if (a === '--options') o.options = argv[++i]; else if (a === '--mods-list') o.modsList = argv[++i].split(',').filter(Boolean);
  else if (a === '--exe') o.exe = argv[++i]; else if (a === '--goh') o.goh = argv[++i];
  else if (a === '--cache-dir') o.cacheDir = argv[++i];
  else if (a === '--restore-points') o.restorePoints = true;
  else if (a === '--reuse-dir') o.reuseDir = argv[++i];
  else if (a === '--no-read-once') o.noReadOnce = true;
  else pos.push(a);
}
const USAGE = 'usage: doctor.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh] [--goh dir] [--cache-dir dir] [--restore-points] [--reuse-dir dir] [--no-read-once] [--only t1,t2] [--out dir] [-j N] [--release [--big MB]] [--options options.set | --mods-list a,b] [-q]';
if (pos.length !== 1 || !fs.existsSync(pos[0])) { console.error(USAGE); process.exit(2); }
const games = require('../lib/games');
if (o.exe !== undefined && !games.get(o.exe)) { console.error(`doctor: --exe must be as64, mowas_2, mowas2 or goh (got "${o.exe}")`); process.exit(2); }
if (o.goh && !o.exe) o.exe = 'goh';
const gEnt = o.exe ? games.get(o.exe) : null, isGohArg = !!(gEnt && gEnt.kind === 'goh');
if (gEnt && !isGohArg && o.goh) { console.error(`doctor: --goh is the GoH install; it does not go with --exe ${o.exe}`); process.exit(2); }
const folder = path.resolve(pos[0]), modName = path.basename(folder);
const above = path.basename(path.dirname(folder)).toLowerCase() === 'mods' ? path.dirname(path.dirname(folder)) : null;
if (o.release) {
  // no --exe: only a GoH install above mods/ names the game (an AS2 folder stays as before)
  const gid = gEnt ? gEnt.id : above && games.detect(above) === 'goh' ? 'goh' : null;
  const r = require('./release').release(folder, { bigMb: o.big || 50, game: gid });
  console.log('# doctor --release: ' + modName + (gid ? ` (${games.get(gid).name})` : '')); rcPrint(r, o, folder, 'doctor', { showInfo: !o.q }); process.exit(0);
}
// the game folder: AS2 as before (--game, else <game> above mods/, else none); GoH: --goh, --game, <game> above mods/, else the GoH install
let game = o.game ? path.resolve(o.game) : above;
if (isGohArg) { const g = o.goh || o.game || above || games.install('goh').dir; game = g ? path.resolve(g) : null; }
// game id: named by --exe, else from the folder's exe files (lib/games detect = lib/vfs order: as64.exe, call_to_arms.exe, else mowas2)
const gameId = gEnt ? gEnt.id : game ? games.detect(game) : null;
const isAs64 = gameId === 'as64', isGoh = gameId === 'goh';
const outDir = path.resolve(o.out || path.join(os.tmpdir(), 'as2-doctor', modName.replace(/[^\w.-]+/g, '_')));
fs.mkdirSync(outDir, { recursive: true });

// mods to mount: Require closure, deps first (vfs re-sorts; it skips a mod whose Require is not in the list, VFS-17)
const notes = [];
let mods = null;
if (game) {
  const found = discover(game, [], { items: isGoh }), order = [], seen = new Set();
  const visit = (id, from) => {
    if (seen.has(id)) return;
    seen.add(id);
    const m = found.get(id);
    // COV-MIX4: as64+ is the built-in mod at <game>/as64/plus, not a mods/ folder (lib/vfs.js:9); a Require on it is met, not DEP_MISSING
    if (!m && id === 'as64+' && isAs64 && fs.existsSync(path.join(game, 'as64', 'plus'))) { order.push('as64+'); return; }
    if (!m && id === 'as64+' && !isAs64 && fs.existsSync(path.join(game, 'as64', 'plus'))) { notes.push(`DEP_MISSING ${from} requires "as64+": the built-in mod of AS64 only; ${games.get(gameId).name} has none → mod is skipped by the engine (VFS-17)`); return; }
    if (!m) { notes.push(`DEP_MISSING ${from} requires "${id}": not in ${path.join(game, 'mods')} → mod is skipped by the engine (VFS-17)`); return; }
    for (const r of m.requires) visit(r, m.folder);
    order.push(m.folder);
  };
  visit(names.normalize(modName), modName);
  // L7-CLEAN: a modern mod (Min >= 3.301) on as64 only mounts with as64+ in the list (vfs MOD_MODE); without it refcheck/binhdr
  // got MOD_NOT_MOUNTED and refcheck exited 3. Same rule as wouldload.js:98
  const self = found.get(names.normalize(modName));
  const v = self ? C.verParse(self.min) : [];
  if (v.length && C.verCmp(v, C.MODERN_MIN) >= 0 && isAs64 && fs.existsSync(path.join(game, 'as64', 'plus', 'mod.info')) && !order.includes('as64+')) order.unshift('as64+');
  mods = order;
}

const has = rel => fs.existsSync(path.join(folder, rel));
// mounted = the mod itself is in the mount list (needs mod.info under <game>/mods). a bare folder or one outside mods/ is not: binhdr/refcheck then read the loose folder (--folder) instead of
// checking vanilla (empty --mods = vanilla scope = 0 findings), mpsync (reads a mounted mod only) gets one note instead of a stack
// T-CRASH: a mod.info with no Min or no Max is dropped by the version gate on as64 and mowas_2 (PORT-48, 477 / 341): the mount
// list would not hold it and binhdr/refcheck/mpsync saw nothing (a cell-5 map.net went unseen). read it as a folder instead
// GT-01: a modern mod (Min >= 3.301) on as64.exe needs Min only (lib/vfs.js as64 branch): no Max is fine there, so it is not dropped
const selfInfo = game && discover(game, [], { items: isGoh }).get(names.normalize(modName));
// game: as64 = --exe as64, or as64.exe in the folder with no --exe (as before); mowas_2 named on the shared install is not as64 (PORT-48)
const as64Game = !!(game && isAs64);
// version gate, the same one lib/vfs.js build applies (bounds present AND the game version inside them): a dropped mod is read as a folder.
// as64 / mowas_2: game version 3.262.1, a modern mod on as64 compares Min with 3.301.1 (vfs plain version); GoH: the exe's PE version
// (a.b.c.d = a.bcd), "any" is open, each bound optional (none = open), tag develop = any version (GHVFS-26, GHVFS-02 [V], lib/vfs.js GoH gate)
function verDrop(info) {
  if (!info || info.builtIn) return null;
  const mn = C.verParse(info.min), mx = C.verParse(info.max), cmp = C.verCmp;
  if (isGoh) {
    const anyMn = /^any$/i.test(info.min || ''), anyMx = /^any$/i.test(info.max || '');
    if ((info.tags || []).some(t => t.toLowerCase() === 'develop')) return null;
    const pe = require('../lib/gamever').peVersion(path.join(game, 'binaries', 'x64', 'call_to_arms.exe')), g = pe && /^(\d+)\.(\d)\.(\d)\.(\d)/.exec(pe);
    const gvs = g ? g[1] + '.' + g[2] + g[3] + g[4] : '1.067', gv = C.verParse(gvs);
    if (mn.length && !anyMn && cmp(gv, mn) < 0) return `GoH ${gvs} is below its MinGameVersion ${info.min}, so GoH drops it (PORT-46)`;
    if (mx.length && !anyMx && cmp(gv, mx) > 0) return `GoH ${gvs} is above its MaxGameVersion ${info.max}, so GoH drops it (PORT-46)`;
    return null;
  }
  // as64 mode rule first, as lib/vfs.js (MOD_MODE): modern (Min >= 3.301) needs as64+ in the list (Enhanced), a Classic mod
  // needs it absent. mods = the final Require closure here, with the as64+ unshift counted
  if (as64Game) {
    const modern = mn.length > 0 && cmp(mn, C.MODERN_MIN) >= 0, enhanced = !!(mods && mods.includes('as64+'));
    if (modern !== enhanced) return `it is made for ${modern ? 'Enhanced' : 'Classic'} mode and the mod list ${enhanced ? 'has as64+ (a Require brings it in)' : 'lacks as64+ (no as64/plus/mod.info in the game)'}, so AS64 does not apply it (MOD_MODE)`;
  }
  if (as64Game && mn.length && cmp(mn, C.MODERN_MIN) >= 0) return cmp([3, 301, 1], mn) < 0 ? `AS64 3.301.1 is below its MinGameVersion ${info.min}, so the game drops it ("Unsupported game version", )` : null;
  if (!mn.length || !mx.length) return `no ${!mn.length ? 'MinGameVersion' : 'MaxGameVersion'} in its mod.info, so the game drops it ("Unsupported game version", PORT-48)`;
  const gv = [3, 262, 1];
  if (cmp(gv, mn) < 0) return `the game version 3.262.1 is below its MinGameVersion ${info.min}, so the game drops it ("Unsupported game version", PORT-48)`;
  if (cmp(gv, mx) > 0) return `the game version 3.262.1 is above its MaxGameVersion ${info.max}, so the game drops it ("Unsupported game version", PORT-48)`;
  return null;
}
const dropWhy = game ? verDrop(selfInfo) : null, gateDrop = !!dropWhy;
if (gateDrop) notes.push(`NOT_MOUNTED "${modName}": ${dropWhy}; its files are still checked as a folder, mpsync skipped (it reads a mounted mod only)`);
// a dropped mod is not in the linters' --mods (its own files come from the folder argument) nor in the header's mounted list
const modsAll = mods;
if (gateDrop && mods) mods = mods.filter(m => names.normalize(m) !== names.normalize(modName));
const mounted = !gateDrop && !!(mods && mods.some(m => names.normalize(m) === names.normalize(modName)));
if (game && !mounted && !gateDrop) notes.push(`NOT_MOUNTED "${modName}" is not mounted under ${path.join(game, 'mods')} (no mod.info there?): binhdr + refcheck read the folder loose (--folder), mpsync skipped`);
const hasRes = has('resource');
if (o.cacheDir) fs.mkdirSync(path.resolve(o.cacheDir), { recursive: true });
const RCACHE = o.cacheDir ? ['--cache', path.join(path.resolve(o.cacheDir), 'refcheck.json')] : [];
const G = game ? ['--game', game, ...(mods && mods.length ? ['--mods', mods.join(',')] : [])] : [];
const plan = {
  modinfo: has('mod.info') && [folder, ...(isGoh && game ? ['--game', game] : [])],   // GoH: modinfo takes the GoH rules from the install (tags key, one-bound gate)
  lnglint: (has('localization') || fs.readdirSync(folder).some(f => f.endsWith('.lng'))) && [has('localization') ? path.join(folder, 'localization') : folder],
  vfs: game && [game, '--mods', modsAll.join(','), '-q'],   // the full list: vfs itself reports the drop (MOD_VERSION)
  sdllint: [folder, ...G, '--summary'],
  keylint: [folder, ...G, '--summary'],
  ialint: [folder, ...G, '--summary'],
  uilint: [folder, ...G, '--summary'],
  milint: [folder, ...G],
  binhdr: game && (mounted ? [game, '--mods', mods.join(','), '--summary'] : hasRes && [game, '--folder', folder, '--summary']),
  refcheck: game && (mounted ? [game, '--mods', mods.join(','), '--scope', 'mod', '--summary', ...RCACHE] : hasRes && [game, '--folder', folder, '--scope', 'mod', '--summary', ...RCACHE]),
  // added with the registry (R3.11): other folder linters + load-order/lobby checks
  strlint: [folder, ...G, '--summary'],
  humlint: [folder, ...G, '--summary'],
  movlint: [folder, ...G, '--summary'],
  fxlint: [folder, ...G, '--summary'],
  // a dropped mod: expcheck reads it as a folder layer (--folder works inside <game>/mods too: only that layer's .mdl are checked, the deps mount for the lookups)
  expcheck: game && (gateDrop ? hasRes && ['--folder', folder, ...G, '--summary'] : [folder, ...G, '--summary']),
  conflicts: game && mods.length > 1 && ['--game', game, '--mods', mods.join(','), '--summary'],
  mpsync: game && mounted && ['--mod', folder, '--game', game],
};
for (const t of Object.keys(plan)) if (!registry.byName(t) || !registry.byName(t).doctor) delete plan[t]; // registry = which tools doctor runs
// game filter (registry games, forDoctor(game)): a linter whose rules are written for other games is left out, with one plain note
// no registry entry has a games limit today (uilint has GoH tables, binhdr takes GoH cell 5); a reason for a future limit goes here
const GAME_SKIP_WHY = {};
if (gameId) {
  const ok = new Set(registry.forDoctor(gameId).map(t => t.name));
  for (const t of Object.keys(plan)) if (!ok.has(t)) {
    if (plan[t] && (!o.only || o.only.has(t))) notes.push(`GAME_SKIP ${games.notFor(t, gameId, GAME_SKIP_WHY[t] || 'its rules are written for ' + registry.byName(t).games.map(g => games.get(g).name).join(', ') + ' only', 'lib/registry games')}`);
    delete plan[t];
  }
}
// --exe to the linters (non-default game on the shared install): the vfs exe, to every tool that takes it (registry exe, or its own
// parser lists --exe, or lib/cli parse, which takes the common --exe). goh (named or detected) goes to them too; a GoH tool without
// --exe still reads the GoH folder it is given, where each vfs picks goh itself (lib/vfs.js), so it needs no note.
const fwdExe = gEnt ? gEnt.exe : isGoh ? 'goh' : null, noExe = [];
const takesExe = t => { const r = registry.byName(t); if (r && r.exe) return true; let s = ''; try { s = fs.readFileSync(path.join(__dirname, '..', t, t + '.js'), 'utf8'); } catch { return false; } return /'--exe'|cli\.parse\(/.test(s); };
if (fwdExe) for (const t of Object.keys(plan)) if (plan[t]) { if (takesExe(t)) plan[t] = [...plan[t], '--exe', fwdExe]; else if (!o.only || o.only.has(t)) noExe.push(t); }
if (noExe.length && fwdExe === 'mowas_2') notes.push(`EXE_NOT_PASSED ${noExe.join(', ')}: no --exe in these tools yet, so they read the shared install as AS64 (as64/core mounted), not ${gEnt.name} [I]`);
// --restore-points: sdllint + refcheck (they walk the mod folder themselves), and every other linter whose source takes the flag
const takesRp = t => { if (t === 'sdllint' || t === 'refcheck') return true; let s = ''; try { s = fs.readFileSync(path.join(__dirname, '..', t, t + '.js'), 'utf8'); } catch { return false; } return s.includes("'--restore-points'"); };
if (o.restorePoints) for (const t of Object.keys(plan)) if (plan[t] && takesRp(t)) plan[t] = [...plan[t], '--restore-points'];
if (o.locsJson && !o.locs) o.locs = 50;
if (o.locs) for (const t of Object.keys(plan)) if (plan[t]) plan[t] = plan[t].filter(a => a !== '--summary'); // full lines carry file:line
const jobs = Object.entries(plan).filter(([t, a]) => a && (!o.only || o.only.has(t)));
const toolRoot = { lnglint: plan.lnglint && plan.lnglint[0], vfs: game, binhdr: game, refcheck: game, conflicts: game };

// RAM plan (GUI-LOC, MEM-PLAN): RobZ (~80k files) at -j 8 with 3 GB free → 4 tools OOM (exit 134, OBS-I2b). Before: one guess for
// every tool (150 MB + 12 KB per file) and a fixed -j from it. Now each tool has its own estimate (lib/registry mem x 1.5, doctor/jobs.js)
// from the mod's text files; the sum of the running tools' estimates stays under 80% of free RAM, biggest first, small ones fill in,
// at most -j at once. DOCTOR_TEST_FREEMEM=<MB> fakes the free RAM (test hook, doctor/test/run.sh)
const J = require('./jobs');
const askedJ = Math.max(1, o.j || 1), counts = J.countMod(folder, { restorePoints: o.restorePoints });
const freeMem = process.env.DOCTOR_TEST_FREEMEM ? +process.env.DOCTOR_TEST_FREEMEM * 1048576 : os.freemem(), budget = freeMem * 0.8;
const estOf = new Map(jobs.map(([t]) => [t, J.estimate(t, counts)])), est = t => estOf.get(t);
// read once: the linters with a module form (tools/<t>/ctx.js) run in one shared pass (lib/modset), each still its own job of the
// RAM plan (its mem row, as a program): the pass starts with the first of them and ends with the last (RO-E: as ONE job of 11, RobZ
// estimate 13.8 GB, it ran alone by RAM beside wouldload and thrashed: 177 s against 91 s alone, binhdr only after it)
const modset = require('../lib/modset');
// inside the single-file ARSENAL.exe a worker thread has no loader for the embedded tools (new Worker(<embedded file>) = Cannot find
// module), so every member fell back to its own program with a module error in the report: off there until the exe loader serves workers
const inExe = (() => { try { return require('node:sea').isSea(); } catch { return false; } })();
const roOff = o.noReadOnce ? '--no-read-once' : process.env.ARSENAL_READ_ONCE === '0' ? 'ARSENAL_READ_ONCE=0' : inExe ? 'single-file exe' : null;
const roAble = jobs.filter(([t]) => modset.formOf(t)), members = roOff ? [] : roAble;
if (roAble.length) notes.push(roOff ? `READ_ONCE off (${roOff}): every linter ran as its own program` : `READ_ONCE on: ${members.map(j => j[0]).join(', ')} in one pass; others as programs`);
const poolJobs = jobs;
// a member's estimate: its mem row without the margin (the row is the program's measured peak RSS; in the pass it shares node, the
// listing and the read store). RO-E, RobZ, peak heap in the pass against the row: keylint 1218/1344, milint 853/1437, ialint 1374/1237,
// humlint 914/1149, strlint 896/1032, fxlint 484/742, movlint 329/450, uilint 331/449, vfs 361/447, expcheck 325/397 MB
for (const [t] of members) estOf.set(t, Math.round(est(t) / J.MARGIN));
const jplan = J.describe(poolJobs.map(j => j[0]), est, askedJ, budget);
if (jplan.limited) notes.push(`JOBS up to ${jplan.most} at once by RAM (asked -j ${askedJ}; free RAM ${(freeMem / 1e9).toFixed(1)} GB, budget ${(budget / 1e9).toFixed(1)} GB; ${counts.text} text files; MB per tool: ${jplan.list}; biggest first, small ones fill in)`);
// DOCTOR_RO_STATS=1 (stderr) or =<file> (JSON): the pass's read stats and where the time went (per linter CPU, idle, waits on the
// reader; this thread's load; doctor's peak RSS; the machine's busy cores; each job's start and end)
const PROF = process.env.DOCTOR_RO_STATS ? (() => {
  const T0 = Date.now(), cpuT = () => os.cpus().reduce((s, c) => { const t = c.times; s.busy += t.user + t.nice + t.sys + t.irq; s.all += t.user + t.nice + t.sys + t.irq + t.idle; return s; }, { busy: 0, all: 0 });
  const P = { jobs: [], samples: [], rssPeak: 0, freeMin: os.freemem(), cores: os.cpus().length };
  let last = cpuT();
  const tick = () => { const m = process.memoryUsage().rss, now = cpuT(), f = os.freemem(); if (m > P.rssPeak) P.rssPeak = m; if (f < P.freeMin) P.freeMin = f;
    P.samples.push([Date.now() - T0, +((now.busy - last.busy) / Math.max(1, now.all - last.all) * P.cores).toFixed(1), Math.round(m / 1048576)]); last = now; };
  const iv = setInterval(tick, 1000); iv.unref();
  P.at = () => Date.now() - T0;
  P.write = extra => { tick(); clearInterval(iv); const s = JSON.stringify({ ...P, ...extra, rssPeakMB: Math.round(P.rssPeak / 1048576), freeMinMB: Math.round(P.freeMin / 1048576), wall: Date.now() - T0 });
    if (process.env.DOCTOR_RO_STATS === '1') process.stderr.write(`doctor-prof ${s}\n`); else fs.writeFileSync(process.env.DOCTOR_RO_STATS, s); };
  return P;
})() : null;
const OOM = (code, err) => code === 134 || /out of memory|heap limit|Allocation failed/i.test(err || '');
const prog = s => { if (o.progress) process.stderr.write(`PROGRESS ${s}\n`); };

// full finding lines -> per-code counts + samples. `rel[:line]: CODE msg`; a capped hint (`... N more X hidden`) adds N, never a sample
function sampleOutput(text, cap) {
  const samples = {}, codes = {};
  for (const l of text.split(/\r?\n/)) {
    if (l.startsWith('info:')) continue;
    if (l.startsWith('--- stderr')) break;
    const m = l.match(/^(\S.*?)(?::(\d+))?: ([A-Z][A-Z0-9_]+) (.*)$/);
    if (!m) continue;
    const [, file, line, code, msg] = m, more = msg.match(/^\.\.\. (\d+) more /);
    codes[code] = (codes[code] || 0) + (more ? +more[1] : 1);
    if (more) continue;
    const a = samples[code] || (samples[code] = []);
    if (a.length < cap) a.push({ file: file.replace(/\\/g, '/'), line: line ? +line : null, msg: msg.slice(0, 300) });
  }
  return { samples, codes };
}

const RC = o.noRc ? ['--no-rc'] : o.rcFile ? ['--rc', o.rcFile] : [], RC_TOOLS = registry.rcTools(); // tools that parse --rc (lib/cli); modinfo vfs do not
// the argument list a tool gets (without the script path): its plan + the rc arguments + one -q
const argsOf = (tool, args) => [...args, ...(RC_TOOLS.includes(tool) ? RC : []), '-q'].filter((a, i, all) => a !== '-q' || all.indexOf('-q') === i);
// one tool's output -> its result row (counts, first line per code, --locs samples, err/oom); the same for a reused output (--reuse-dir)
function finish(tool, out, err, code, t0, tail = '') {
  fs.writeFileSync(path.join(outDir, `${tool}.txt`), out + (err ? `\n--- stderr\n${err}` : ''));
  // --summary prints `CODE n | subjects | dirs` lines instead of findings: take counts from those
  const c = countOutput(out);
  for (const l of out.split(/\r?\n/)) { const m = l.match(/^([A-Z][A-Z0-9_]+) (\d+)(?: \(tops of \d+ shown\))? \| (.*)$/); if (m) { c.codes[m[1]] = +m[2]; c.first[m[1]] = c.first[m[1]] || m[3]; } }
  let samples = null;
  if (o.locs) { const s = sampleOutput(out, o.locs); samples = s.samples; for (const [k, n] of Object.entries(s.codes)) if (n > (c.codes[k] || 0)) c.codes[k] = n; }
  const r = { tool, ...c, samples, code, sec: ((Date.now() - t0) / 1000).toFixed(0), err: code > 1 || (code && !out.trim()) ? `exit ${code}: ${err.trim().split('\n').pop()}` : null };
  r.oom = !!r.err && OOM(code, err);
  if (r.oom) r.err = `exit ${code}: out of memory (${err.trim().split('\n').filter(Boolean).pop() || 'no stderr'})`;
  prog(`done ${tool} ${r.sec}s ${r.err ? 'ERROR ' + r.err.slice(0, 120) : r.total + ' findings'}${tail}`);
  return r;
}
// --reuse-dir: the load check's listing of the mod (wouldload --keep-out writes D/listing.json, temp + rename, right after its scan),
// so the pass does not list the mod again (one listing per check). null (none by END, unreadable, of another folder: lib/modset
// checks) = the pass lists the mod itself, as before
async function handedListing() {
  const f = path.join(o.reuseDir, 'listing.json'), end = path.join(o.reuseDir, 'END');
  while (!fs.existsSync(f)) { if (fs.existsSync(end)) { if (fs.existsSync(f)) break; return null; } await sleep(200); }
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; }
}
// the shared pass (one modset): made when the first member starts, closed when the last one has ended. A member runs in its own
// worker thread over it; -> its result row, or {tool, roFail} when the in-pass run did not give a whole output (rerun as a program
// after the pool)
const roFk = new Map((process.env.DOCTOR_TEST_RO_FAIL || '').split(',').filter(Boolean).map(s => { const [t, k] = s.split(':'); return [t, k || 'throw']; }));
let roPass = null, roLeft = members.length;
async function runMember([tool, args]) {
  const t0 = Date.now();
  prog(`start ${tool}`);
  if (!roPass) {
    roPass = { t0 };
    try {
      if (roFk.has('*')) throw new Error('the shared pass failed (DOCTOR_TEST_RO_FAIL=*)');
      roPass.p = modset.pass({ folder, listing: o.restorePoints ? false : o.reuseDir ? handedListing() : true, prof: !!PROF });
    } catch (e) { roPass.err = e.message; }
  }
  const S = roPass;
  let row;
  if (S.err) { prog(`done ${tool} read-once failed: ${S.err}`); row = { tool, roFail: S.err }; } else {
    const argv = argsOf(tool, args);
    if (process.env.DOCTOR_TEST_ARGS) fs.writeFileSync(path.join(outDir, `${tool}.args`), JSON.stringify(argv));
    let r;
    try { r = await S.p.run({ tool, file: modset.formOf(tool), argv, fail: roFk.get(tool) }); } catch (e) { r = { ok: false, why: e.message }; }
    if (PROF) PROF.jobs.push({ tool, pass: true, start: t0 - (Date.now() - PROF.at()), end: PROF.at(), ...(r.prof || {}) });
    const why = !r.ok ? (r.oom ? 'out of memory' : r.why || 'failed') : !/^\d+ findings$/m.test(r.out) ? 'incomplete output (no "N findings" line)' : null;
    if (why) { prog(`done ${tool} read-once failed: ${why}`); row = { tool, roFail: why }; } else row = finish(tool, r.out, r.err, r.code, t0);
  }
  if (--roLeft === 0 && S.p) {
    if (process.env.DOCTOR_RO_STATS) process.stderr.write(`read-once ${((Date.now() - S.t0) / 1000).toFixed(0)}s ${JSON.stringify(S.p.stats)}\n`);
    if (PROF) PROF.pass = { start: S.t0 - (Date.now() - PROF.at()), end: PROF.at(), stats: S.p.stats, main: S.p.prof() };
    S.p.close();
  }
  return row;
}
function run(job, asProgram) {   // asProgram: a read-once member run alone as its own program (the fallback)
  if (!asProgram && members.includes(job)) return runMember(job);
  const [tool, args] = job, t0 = Date.now();
  prog(`start ${tool}`);
  return new Promise(res => {
    const argl = [path.join(__dirname, '..', tool, `${tool}.js`), ...argsOf(tool, args)];
    if (process.env.DOCTOR_TEST_ARGS) fs.writeFileSync(path.join(outDir, `${tool}.args`), JSON.stringify(argl.slice(1)));   // test hook (doctor/test/games-test.js): the argument list each tool got
    const p = spawn(process.execPath, argl, UV0 === undefined && process.env.UV_THREADPOOL_SIZE ? { env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'UV_THREADPOOL_SIZE')) } : {});
    let out = '', err = '';
    // utf8 decoder per stream: a character split across two chunks stays whole (before: each chunk decoded alone)
    p.stdout.setEncoding('utf8'); p.stderr.setEncoding('utf8');
    p.stdout.on('data', d => (out += d));
    p.stderr.on('data', d => (err += d));
    p.on('close', code => {
      // test hook (doctor/test/run.sh): DOCTOR_TEST_OOM=t1,t2 fakes exit 134 on those tools' first run (=t1! on every run)
      const fk = (process.env.DOCTOR_TEST_OOM || '').split(',');
      if (fk.includes(tool + '!') || (fk.includes(tool) && !run.faked.has(tool))) { run.faked.add(tool); code = 134; out = ''; err += '\nFATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory (DOCTOR_TEST_OOM)'; }
      if (PROF) PROF.jobs.push({ tool, start: t0 - (Date.now() - PROF.at()), end: PROF.at() });
      res(finish(tool, out, err, code, t0));
    });
  });
}

// --reuse-dir: the output of wouldload's sdllint / refcheck run for this game, when its arguments are the ones doctor would pass
const REUSABLE = ['sdllint', 'refcheck'], reused = [];
const VALUE_OPTS = new Set(['--game', '--mods', '--mod', '--folder', '--scope', '--exe', '--cache', '--rc', '--format', '-o', '--game-version']);
// canonical form of an argument list: paths resolved (case folded, Windows), --mods as an ordered lower-case list, --exe as the vfs name,
// -q / --cache dropped (output and a cache file only), the .lintrc the tool would load (--no-rc = none; none given = the nearest one)
function canonArgs(tool, args) {
  const pos = [], opt = {}, P = p => path.resolve(p).toLowerCase();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (VALUE_OPTS.has(a)) opt[a === '--mod' ? '--mods' : a] = args[++i];
    else if (a[0] === '-' && a !== '-') opt[a] = true;
    else pos.push(a);
  }
  delete opt['-q']; delete opt['--cache'];
  if (opt['--game']) opt['--game'] = P(opt['--game']);
  if (opt['--folder']) opt['--folder'] = P(opt['--folder']);
  if (opt['--mods']) opt['--mods'] = opt['--mods'].split(',').map(s => s.trim().toLowerCase()).filter(Boolean).join(',');
  if (opt['--exe']) { const g = games.get(opt['--exe']); opt['--exe'] = g ? g.exe : opt['--exe']; }
  const start = tool === 'refcheck' ? (opt['--folder'] || pos[0]) : pos[0];
  const rcf = opt['--no-rc'] ? null : opt['--rc'] ? path.resolve(opt['--rc']) : start && start !== '-' ? require('../lib/lintrc').find(start) : null;
  delete opt['--no-rc']; delete opt['--rc'];
  return JSON.stringify({ pos: pos.map(p => p === '-' ? p : P(p)), opt: Object.keys(opt).sort().map(k => [k, opt[k]]), rc: rcf ? P(rcf) : null });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
// -> the result row, or {miss: why} (doctor then runs the tool itself)
async function reuse([tool, args]) {
  const t0 = Date.now(), f = path.join(o.reuseDir, `${gameId}.${tool}.json`), end = path.join(o.reuseDir, 'END');
  prog(`start ${tool}`);
  // wouldload writes the file (temp + rename) when its pass ends; tools/check writes END when wouldload has exited
  while (!fs.existsSync(f)) { if (fs.existsSync(end)) { if (fs.existsSync(f)) break; return { miss: `the load check ran no ${gameId} pass` }; } await sleep(300); }
  let k;
  try { k = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return { miss: 'its output file does not read: ' + e.message }; }
  if (!k.ok) return { miss: `the load check's run did not finish (${k.why || 'no findings line'})` };
  if (canonArgs(tool, argsOf(tool, args)) !== canonArgs(tool, k.args || [])) return { miss: 'the load check ran it with other arguments' };
  reused.push(tool);
  return finish(tool, k.out, k.err || '', k.code, t0, ' (from the load check)');
}

run.faked = new Set();
(async () => {
  const later = o.reuseDir && gameId ? jobs.filter(j => REUSABLE.includes(j[0])) : [];
  const got = [], misses = [];
  // the RAM plan's pool (jobs.js schedule); a reused tool waits outside it (hold), a miss joins the pool (release with the job)
  // binhdr first (RO-E): on RobZ it reads the headers of 60k binaries for 70-170 s with 1-2 cores busy; by size it started late and
  // was the last job running alone, in both ways
  const pool = J.schedule(poolJobs.filter(j => !later.includes(j)), { cap: askedJ, budget, est, run, first: ['binhdr'], onDone: r => { if (Array.isArray(r)) got.push(...r); else got.push(r); } });
  for (const job of later) {
    pool.hold();
    reuse(job).then(r => {
      if (!r.miss) { got.push(r); pool.release(); return; }
      misses.push(`${job[0]}: ${r.miss}`);
      pool.release(job);
    });
  }
  o.j = Math.max(1, await pool.start());   // the most tools that ran at once (--locs-json j)
  got.sort((a, b) => jobs.findIndex(j => j[0] === a.tool) - jobs.findIndex(j => j[0] === b.tool));   // RERAN notes in tool order, not finish order
  reused.sort((a, b) => REUSABLE.indexOf(a) - REUSABLE.indexOf(b)); misses.sort();   // DET: finish order is a race
  if (reused.length) notes.push(`REUSED ${reused.join(', ')}: findings from the load check's run (wouldload ${gameId} pass, the same arguments), not run again here`);
  for (const m of misses) notes.push(`REUSE_MISS ${m}; run here instead`);
  // OOM rerun: alone, once, after the pool (other tools' memory is free now); a read-once member that failed in the pass the same way
  for (let i = 0; i < got.length; i++) {
    if (got[i].roFail) {
      const job = jobs.find(j => j[0] === got[i].tool), why = got[i].roFail, r = await run(job, true);
      notes.push(`READ_ONCE fallback ${job[0]}: ${why}; ran alone as its own program${r.err ? ' (failed there too)' : ''}`);
      if (r.err && r.oom) r.err = `out of memory also when run alone (${r.err})`;
      if (/out of memory/.test(why)) r.reran = true;
      got[i] = r; continue;
    }
    if (!got[i].oom) continue;
    const job = jobs.find(j => j[0] === got[i].tool), r = await run(job);
    notes.push(`RERAN ${job[0]} alone after exit ${got[i].code} (out of memory): ${r.err ? 'failed again' : 'ok'}`);
    if (r.err && r.oom) r.err = `out of memory also when run alone (${r.err})`;
    r.reran = true; got[i] = r;
  }
  if (!o.only || o.only.has('envcheck')) { const t0 = Date.now(), rep = require('./envcheck').envcheck(folder, game, { ...o, deps: mods, gameId }), j = rep.toJSON({ tool: 'envcheck' }); fs.writeFileSync(path.join(outDir, 'envcheck.txt'), j.findings.concat(j.info).map(f => `${f.file}: ${f.code} ${f.msg}`).join('\n')); got.push({ tool: 'envcheck', total: j.total, codes: j.counts, first: Object.fromEntries(j.findings.map(f => [f.code, `${f.file}: ${f.msg}`])), infos: j.info, samples: o.locs ? j.findings.reduce((s, f) => { const a = s[f.code] || (s[f.code] = []); if (a.length < o.locs) a.push({ file: f.file, line: f.line || null, msg: String(f.msg).slice(0, 300) }); return s; }, {}) : null, sec: ((Date.now() - t0) / 1000).toFixed(0) }); jobs.push(['envcheck']); }
  got.sort((a, b) => jobs.findIndex(j => j[0] === a.tool) - jobs.findIndex(j => j[0] === b.tool));
  console.log(`# doctor: ${modName}${game ? `  (game ${game}; ${gEnt || isGoh ? `exe ${games.exeOf(gameId)}; ` : ''}mounted: ${mods.join(', ')})` : '  (no game: folder tools only)'}`);
  for (const n of notes) console.log(n);
  // what to fix first, across every tool
  const bySev = { crash: [], silent: [], review: [], cosmetic: [] };
  for (const r of got) if (!r.err) for (const [c, n] of Object.entries(r.codes)) bySev[registry.severity(c)].push(`${r.tool}:${c}×${n}`);
  for (const s of ['crash', 'silent', 'review', 'cosmetic']) if (bySev[s].length) console.log(`${s.padEnd(9)}${String(bySev[s].length).padStart(5)} codes  ${bySev[s].slice(0, 12).join(' ')}${bySev[s].length > 12 ? ' ...' : ''}`);
  let total = 0, warn = 0;
  for (const r of got) {
    if (r.err) { console.log(`${r.tool.padEnd(9)} ERROR ${r.err}`); continue; }
    const codes = Object.entries(r.codes).sort((a, b) => b[1] - a[1]);
    total += r.total; warn += codes.filter(([c]) => c.startsWith('WARN_')).reduce((s, [, n]) => s + n, 0);
    console.log(`${r.tool.padEnd(9)} ${String(r.total).padStart(5)}  ${codes.map(([c, n]) => `${c}×${n}`).join(' ') || 'ok'}  (${r.sec}s)`);
    for (const [c] of codes.slice(0, 5)) console.log(`          ${c}: ${(r.first[c] || '').slice(0, 170)}`);
    if (!o.q) for (const f of (r.infos || []).slice(0, 5)) console.log(`          info ${f.code}: ${f.file}: ${f.msg}`.slice(0, 200));
  }
  if (o.locsJson) fs.writeFileSync(o.locsJson, JSON.stringify({ locs: o.locs, j: o.j, tools: Object.fromEntries(got.map(r => [r.tool, { root: toolRoot[r.tool] || folder, samples: r.samples || {}, reran: !!r.reran, err: r.err || null, oom: !!r.oom }])) }));
  console.log(`${total} findings (${warn} WARN_) · ${notes.length} notes · full outputs: ${outDir}`);
  process.exitCode = got.some(r => r.err) ? 2 : 0;
  if (PROF) PROF.write({ readOnce: !!members.length, j: o.j });
})();
