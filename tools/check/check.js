#!/usr/bin/env node
// check: ONE report for a mod = tools/wouldload (version gate + verdict per exe + what was read) + tools/doctor (every applicable linter),
// findings sorted crash / silent / review / cosmetic by lib/registry severity(code). thin wrapper: both run side by side as child processes.
//   node tools/check/check.js <mod> [--exe as64,mowas2,goh] [--target as64|mowas2|goh] [--game G] [--goh H] [--json f] [-q] [--plain [--raw]]
// --plain (GT-18): plain-words lines only (plain.js), --raw adds the full report after them; --json always carries overall + plain
// first line = the verdict in words ("No known crash pattern. This does not mean it works: play it." / "Known crash pattern found: ..."), then
// states what was read (files + paks, from wouldload) and ends with one VERDICT line per exe. bad paths, a missing --game, a non-mod folder
// or a mod folder with capitals stop with one plain line (exit 2). static only: never 'pass', 'LOADS_STATIC' = not run.
// mod under <game>/mods: checked in place. any other folder (or --with <patch>): an overlay game dir in temp (see overlay()), the line "MODE ..." says which. --with = source + fix patch merged, so a fix can be re-checked. --timing prints doctor per-tool seconds. --fast: verdict (wouldload, which runs sdllint + refcheck itself) + the cheap linters only; one SKIPPED line per skipped tool (FAST_SKIP). -j default 8 (doctor's own default is 3).
// --locs N (default 50): up to N {file,line,msg,path} samples per code from every doctor linter in --json `samples` (path = the file on
// disk or the virtual path inside a pak, lib/locate.js); PROGRESS start|done <tool> lines stream while doctor runs. a wouldload pass that
// ended without its findings line (OOM next to doctor, timeout) reruns wouldload alone once before the verdict says "did not finish".
// --fast on GoH with the mod outside <GoH>/mods: wouldload reads the mod folder against the GoH install itself (direct, its own files; no
// reach gate, NOTE FAST_DIRECT), the overlay is for doctor only. An overlay run keeps wouldload's and doctor's refcheck caches in the
// overlay's temp folder (deleted at the end): a new game folder per run, so a shared cache file for it would never be read again.
// The reach gate takes the target build's reach only. doctor writes its full outputs to a temp folder of this run.
// game (lib/games): the target build (--target; else the one --exe; else a mod in <GoH>/mods = goh; else mod.info: every bound "any" or below 2 = goh,
// MaxGameVersion < 3.3 = mowas2, else as64) is the game doctor lints for: mowas2 = doctor --exe mowas_2 on the AS2 install; goh = doctor
// --exe goh --game <GoH install> (--goh, else the install above mods/, else lib/games install('goh')), and a GoH mod outside <GoH>/mods
// gets an overlay of the GoH install. as64: doctor's arguments as before.
// check-false (gate.js): crash rows on files the engine never loads (wouldload --reach-all: unused unit, .def outside resource/entity/, unnamed mesh) list under REVIEW with a note; same file:line meanings from several linters merge into one row (also: ...)
// Author: Imperator_Aug (ARSENAL, ia-0d7daa76)
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const registry = require('../lib/registry'), C = require('../modmove/lib/common'), { isDirLike } = require('../lib/dirlike');

function usage(m, rc = 2) { (rc ? console.error : console.log)((m ? m + '\n' : '') + 'usage: ARSENAL check <mod folder, anywhere> [--with <fix/upgrade patch folder>] [--exe as64,mowas2,goh] [--target as64|mowas2|goh] [--game G] [--goh H] [--json f] [--only tool,tool] [--fast] [-j N] [--locs N] [--timing] [--pass-limit sec] [-q] [--plain [--raw]]\n  no time limit: a big mod runs as long as it needs. --pass-limit sec stops one wouldload pass (sdllint, refcheck) after sec seconds; callers with a time limit of their own use it.\n  --plain: the result in plain words only. Line 1 = the overall result for the target build ("Looks good for ...", "Not ready for ...: N problems that can crash the game", "... will not load this mod: ...", "The check did not finish ..."); then one line per finding ("Can crash the game: <what> (N places, first: file:line)."; other labels: Silently ignored by the game, Can split a multiplayer match, Worth a look, Looks or reads wrong); then one line per other build ("Other game, <name>: ..."); last, with --fast, a "Quick check" line. No rule codes, no limit ids. --raw (with --plain): the full report follows after a line "--- full report ---".\n  --json always holds overall {target, verdict: ok|crash|refused|unfinished, crash, silent, text} and plain (the same lines as --plain)\n  exit follows the TARGET build (--target; else the one --exe; else goh for a mod in <GoH>/mods or with mod.info bounds below 2, mowas2 if MaxGameVersion < 3.3, else as64; the other builds print as info; doctor lints for the target game): 0 = LOADS_STATIC (static, not run), 1 = LIKELY_CRASH or REFUSED, 2 = usage, a tool failed, no verdict or UNKNOWN'); process.exit(rc); }
const o = { exe: null, locs: 50 }, pos = [], argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i], nx = () => { if (i + 1 >= argv.length) usage(a + ' needs a value'); return argv[++i]; };
  if (a === '--help' || a === '-h') usage('', 0);
  else if (a === '--exe') o.exe = nx(); else if (a === '--target') o.target = nx(); else if (a === '--game') o.game = nx(); else if (a === '--goh') o.goh = nx(); else if (a === '--json') o.json = nx();
  else if (a === '--with') o.with = nx(); else if (a === '-j') o.j = +nx(); else if (a === '--only') o.only = nx(); else if (a === '--timing') o.timing = true; else if (a === '--fast') o.fast = true; else if (a === '--locs') o.locs = Math.max(0, +nx() || 0);
  else if (a === '--pass-limit') { const v = nx(); if (!/^\d+(\.\d+)?$/.test(v)) usage('--pass-limit needs seconds (0 = none)'); o.passLimit = +v; }
  else if (a === '-q') o.q = true; else if (a === '--plain') o.plain = true; else if (a === '--raw') o.raw = true; else if (a[0] === '-') usage('unknown option ' + a); else pos.push(a);
}
if (pos.length !== 1) usage();
// T-CRASH: plain one-line errors at the known edges (hl-gaps gap 9), no usage dump, no stack. exit 2
const plain = m => { console.error(m); process.exit(2); };
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const MODHINT = 'Give the mod folder (the one with mod.info, or with resource/ inside).';
if (!fs.existsSync(pos[0])) plain(`Not found: ${pos[0]}. ${MODHINT}`);
if (!isDir(pos[0])) plain(`${pos[0]} is a file, not a mod folder. ${MODHINT}`);
if (!fs.readdirSync(pos[0]).some(f => /^(mod\.info|resource|localization)$/i.test(f) || /\.(pak|pat)$/i.test(f))) plain(`${pos[0]} is not a mod folder: no mod.info, resource/, localization/ or .pak inside. ${MODHINT}`);
for (const [k, v] of [['--game', o.game], ['--goh', o.goh]]) if (v && !isDir(v)) plain(`Game folder not found: ${v}. Give ${k} the folder that holds the game exe (${k === '--goh' ? 'call_to_arms.exe' : 'mowas_2.exe or as64.exe'}).`);
if (o.with && !isDir(o.with)) plain(`Patch folder not found: ${o.with}. Give --with the folder a fix or upgrade wrote.`);
const games = require('../lib/games');
if (o.target && !games.get(o.target)) plain(`Unknown --target ${o.target}: give as64, mowas2 or goh.`);
if (o.exe) for (const x of o.exe.split(',').map(s => s.trim()).filter(Boolean)) if (!games.get(x)) plain(`Unknown --exe ${x}: give as64, mowas2 or goh (comma separated).`);
if (o.target) o.target = games.idOf(o.target);
{ const b = path.basename(path.resolve(pos[0])); if (b !== b.toLowerCase()) plain(`The mod folder "${b}" has capital letters. The game reads mod folder names in lowercase and does not load this one (VFS-12): rename it to "${b.toLowerCase()}" and run check again.`); }
// the report is held back and printed after the verdict in words (first line); PROGRESS lines stream live (GUI)
const util = require('util'), realLog = console.log.bind(console), held = [];
let flushed = false;
console.log = (...a) => { const s = util.format(...a); if (/^PROGRESS /.test(s)) console.error(s);   // DET-FIX: live progress is a race (finish order) and carries seconds: stderr only, never in the report
  else if (flushed) realLog(s); else held.push(s); };
const flush = (first = []) => { if (flushed) return; flushed = true; for (const l of [...first, ...held]) realLog(l); };
process.on('exit', () => flush());
let mod = path.resolve(pos[0]);
const srcMod = mod, same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const cleanup = [];
// the patch is a later mod: it beats the source's loose files and N.pat (VFS order), its mod.info Delete hits the source (VFS-22).
// in one folder only a further N.pat keeps that order: resource/ files + {delete} rows go there, other folders (localization) are copied.
function stagePatch(pr, dst) {
  const { writeZip } = require('../lib/zipwrite');
  let n = 1; while (fs.existsSync(path.join(dst, n + '.pat'))) n++;
  const entries = [], walk = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name), r = rel ? rel + '/' + e.name : e.name; if (isDirLike(e, d)) walk(f, r); else entries.push([r, () => fs.readFileSync(f), true]); } };
  if (fs.existsSync(path.join(pr, 'resource'))) walk(path.join(pr, 'resource'), '');
  const files = entries.length, info = path.join(pr, 'mod.info');
  // VFS-21: mod.info paths carry resource/, .patch paths are relative to it; anything else matches nothing in the engine either
  const dels = fs.existsSync(info) ? [...fs.readFileSync(info, 'latin1').matchAll(/\{\s*Delete\s+"([^"]*)"\s*\}/gi)].map(m => m[1].replace(/\\/g, '/')).filter(p => /^resource\//i.test(p)).map(p => p.slice(9)) : [];
  const doc = ['{Patch', `\t{id ${n}}`, ...dels.map(p => `\t{delete "${p}"}`), '}', ''].join('\r\n');
  entries.push(['.patch', Buffer.from(doc, 'latin1'), true]);
  writeZip(path.join(dst, n + '.pat'), entries);
  fs.cpSync(pr, dst, { recursive: true, force: true, filter: f => { const r = path.relative(pr, f).split(path.sep)[0].toLowerCase(); return r !== 'mod.info' && r !== 'resource'; } });
  return { files, pat: n + '.pat', deletes: dels.length };
}
// ---- where does the mod sit? under <game>/mods it is checked in place; anywhere else (or with --with) an overlay game dir is built in temp:
// game root files copied (exes, paks, pats), game dirs + every real mod as junctions, the mod (or source+patch merged copy) at mods/<name>.
const bareSrc = () => !fs.existsSync(path.join(srcMod, 'mod.info'));
const SYNTH = '{Mod\r\n\t{Name "bare folder, synthetic mod.info by tools/check"}\r\n\t{MinGameVersion "0.0"}\r\n\t{MaxGameVersion "9999.0"}\r\n}\r\n';
function overlay() {
  // goh target: the overlay is built on the GoH install (its binaries/, resource/, localizations/ linked; nothing written there)
  const gd = require('../lib/gamedir'), g = tGoh ? games.install('goh', { goh: o.goh }) : gd.resolve({ arg: o.game });
  if (!g.dir && tGoh) plain('No Gates of Hell install found for a GoH check: give --goh <the folder that holds binaries/x64/call_to_arms.exe>.');
  if (!g.dir) gd.missing('check (mod is outside <game>/mods)');
  const real = path.resolve(g.dir), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'check-ov-')), ov = path.join(tmp, 'game');
  cleanup.push(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.mkdirSync(path.join(ov, 'mods'), { recursive: true });
  const links = [];
  const junction = (t, l) => { fs.symlinkSync(t, l, 'junction'); links.push(l); };
  cleanup.unshift(() => { for (const l of links) { try { fs.rmdirSync(l); } catch { /* already gone */ } } });
  const name = path.basename(mod);
  for (const e of fs.readdirSync(real, { withFileTypes: true })) {
    if (e.name.toLowerCase() === 'mods') continue;
    const p = path.join(real, e.name);
    if (isDirLike(e, real)) junction(p, path.join(ov, e.name));   // junctioned game dirs too (REV-TOOLS 3)
    else if (/\.(exe|pak|pat|info|txt)$/i.test(e.name) && !/_ed\.exe$/i.test(e.name)) fs.copyFileSync(p, path.join(ov, e.name));
  }
  const rm = path.join(real, 'mods');
  if (fs.existsSync(rm)) for (const e of fs.readdirSync(rm, { withFileTypes: true })) if (isDirLike(e, rm) && e.name.toLowerCase() !== name.toLowerCase()) junction(path.join(rm, e.name), path.join(ov, 'mods', e.name));
  const dst = path.join(ov, 'mods', name);
  let how;
  if (o.with) {
    const t0 = Date.now();
    fs.cpSync(srcMod, dst, { recursive: true });
    const pr = path.resolve(o.with), n = stagePatch(pr, dst);
    how = `source + patch merged in the overlay (${n.files} patch files staged as ${n.pat} so they win over the source's own N.pat, its ${n.deletes} mod.info Delete rows applied by that patch); source ${C.fwd(srcMod)}, patch ${C.fwd(pr)}`;
  } else if (bareSrc()) {
    // bare folder (no mod.info): wouldload refuses it and doctor cannot mount it. mods/<name> = real dir: each top-level dir of the source linked, files copied, plus a synthetic mod.info
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(srcMod, { withFileTypes: true })) { const p = path.join(srcMod, e.name); if (isDirLike(e, srcMod)) junction(p, path.join(dst, e.name)); else fs.copyFileSync(p, path.join(dst, e.name)); }
    how = `BARE folder ${C.fwd(srcMod)} (no mod.info) linked as mods/${name} with a SYNTHETIC mod.info (Min 0.0 Max 9999.0, so the version gate always passes and is NOT judged)`;
  } else { junction(srcMod, dst); how = `mod at ${C.fwd(srcMod)} linked as mods/${name}`; }
  if (bareSrc()) { fs.writeFileSync(path.join(dst, 'mod.info'), SYNTH); if (o.with) how += '; BARE source, synthetic mod.info (version gate not judged)'; }
  console.log(`MODE outside-mods: overlay game dir built from base ${C.fwd(real)} (${g.source}); ${how}. The base game and the mod are only read.`);
  return { ov, dst, real };
}
let OV = null, TARGET = null, tGoh = false;
// the target build: --target; else the one game --exe names; else (no --exe, or goh among them) a mod in <GoH>/mods or a mod.info whose
// bounds are all below 2 (GoH versions are 1.x, PORT-46) = goh; else MaxGameVersion < 3.3 = mowas2; else as64 (T-DOORFIX, as before)
const exeIds = o.exe ? [...new Set(o.exe.split(',').map(s => games.idOf(s.trim())).filter(Boolean))] : [];
function targetOf(inGohMods) {
  if (o.target) return o.target;
  if (exeIds.length === 1) return exeIds[0];
  let t = ''; try { t = fs.readFileSync(path.join(srcMod, 'mod.info'), 'latin1'); } catch { /* bare folder: no mod.info */ }
  const num = k => { const m = new RegExp('\\{\\s*' + k + '\\s+"?([\\d.]+)"?\\s*\\}', 'i').exec(t); return m ? parseFloat(m[1]) : null; };
  // "any" (the GoH open bound, PORT-46) counts as a GoH bound (taken as 0 here): a mod.info whose bounds are all "any" or below 2 is a GoH mod
  const any = k => new RegExp('\\{\\s*' + k + '\\s+"?any"?\\s*\\}', 'i').test(t);
  const mx0 = num('MaxGameVersion'), mn = any('MinGameVersion') ? 0 : num('MinGameVersion'), mx = any('MaxGameVersion') ? 0 : mx0, gohOk = !exeIds.length || exeIds.includes('goh');
  if (gohOk && (inGohMods || ((mn !== null || mx !== null) && [mn, mx].every(v => v === null || v < 2)))) return 'goh';
  return mx0 !== null && mx0 < 3.3 ? 'mowas2' : 'as64';
}
{
  // GT-01: a folder named "mods" is the game's mods folder only when --game says so or the folder above it holds a game exe. Before, any
  // ".../mods/<mod>" without --game was checked in place against that parent: no game data (false FONT_MAIN10_MISSING), no exe (judged as
  // mowas_2 3.262.1), while wouldload resolved the real game, so Check (no --game) and Ready to share (--game) disagreed. In place, the game
  // folder is now always passed on, so wouldload and doctor read the same game.
  // --game (AS2) and --goh (GoH) both name a game whose mods/ folder counts; a mod under <GoH>/mods sets --goh (in place) and the target goh
  const g0s = [o.game, o.goh].filter(Boolean).map(p => path.resolve(p)), par = path.dirname(mod);
  const isGame = d => ['as64.exe', 'mowas_2.exe', path.join('binaries', 'x64', 'call_to_arms.exe')].some(e => fs.existsSync(path.join(d, e)));
  // --goh alone does not hide an AS2 parent: without --game the folder above mods/ is still tested for a game exe (as before --goh)
  const inMods = path.basename(par).toLowerCase() === 'mods' && (g0s.some(g0 => same(par, path.join(g0, 'mods'))) || (!o.game && isGame(path.dirname(par))));
  const gohHere = inMods && fs.existsSync(path.join(path.dirname(par), 'binaries', 'x64', 'call_to_arms.exe'));
  if (inMods && !o.game && ['as64.exe', 'mowas_2.exe'].some(e => fs.existsSync(path.join(path.dirname(par), e)))) o.game = path.dirname(par);
  if (gohHere && !o.goh) o.goh = path.dirname(par);
  TARGET = targetOf(gohHere); tGoh = TARGET === 'goh';
  // the mod is read in place only under the target game's own mods/ (an AS2 target in <GoH>/mods, or goh in <AS2>/mods: overlay of the target)
  if (o.with || !inMods || bareSrc() || tGoh !== gohHere) { OV = overlay(); mod = OV.dst; if (tGoh) o.goh = OV.ov; else o.game = OV.ov; }
  else console.log(`MODE in-place: mod sits under ${C.fwd(par)}`);
  // FileId of mod.info = a Workshop item id. an installed Workshop copy can be what the engine mounts (as64, VFS-51), not this folder: warn, naming both
  const fid = !bareSrc() && /\{\s*FileId\s+"?(\d+)"?\s*\}/i.exec(fs.readFileSync(path.join(srcMod, 'mod.info'), 'latin1'));
  const gdir = OV ? OV.real : inMods ? path.dirname(par) : null;
  if (fid && gdir) {
    const idf = path.join(gdir, 'steam_appid.txt'), app = fs.existsSync(idf) ? fs.readFileSync(idf, 'latin1').trim() : games.detect(gdir) === 'goh' ? '400750' : '244450';
    const ws = path.resolve(gdir, '..', '..', 'workshop', 'content', app, fid[1]);
    if (fs.existsSync(ws) && !same(ws, srcMod)) console.log(`WARN WORKSHOP_COPY: mod.info FileId ${fid[1]} is installed from the Workshop at ${C.fwd(ws)}; the folder checked is ${C.fwd(srcMod)}. This run mounts the folder given; as64 may load the Workshop copy instead (VFS-51) [I], so a verdict here may not describe what the game runs`);
  }
}

const FAST_SKIP = {
  keylint: 'slow (~120 s on a big mod), not part of the verdict',
  milint: 'slow (~95 s on a big mod), not part of the verdict',
  binhdr: 'slow (~80 s on a big mod), not part of the verdict',
  humlint: 'slow (~50 s on a big mod), not part of the verdict',
  expcheck: 'slow (~25 s on a big mod), not part of the verdict',
  sdllint: 'wouldload already ran it for the verdict; its per-code counts are not listed in --fast',
  refcheck: 'wouldload already ran it for the verdict; its per-code counts are not listed in --fast',
};
const FAST_RUN = ['modinfo', 'lnglint', 'vfs', 'ialint', 'uilint', 'strlint', 'movlint', 'fxlint', 'conflicts', 'mpsync', 'envcheck'];
// no time limit (owner 2026-11-17: a big mod needs far longer than the old 900 s); CHECK_TOOL_TIMEOUT_MS sets one (test hook)
// (a value above what a timer can hold, 2^31-1 ms, also means none)
const TOOL_MS = (n => (n > 0 && n <= 2147483647 ? n : 0))(+(process.env.CHECK_TOOL_TIMEOUT_MS || 0));
const spawnTool = (tool, args) => new Promise(resolve => {
  const t0 = Date.now(), chunks = [];
  const p = cp.spawn(process.execPath, [path.join(C.TOOLS, tool, tool + '.js'), ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let part = '';   // doctor --progress lines go to stderr: echo them live (GUI streams them), keep the rest
  p.stdout.on('data', d => chunks.push(d));
  p.stderr.on('data', d => {
    part += d; const ls = part.split('\n'); part = ls.pop();
    for (const l of ls) { if (/^PROGRESS /.test(l)) console.log(l.trimEnd()); else chunks.push(Buffer.from(l + '\n')); }
  });
  p.on('close', () => { if (part) chunks.push(Buffer.from(part)); });
  let timedOut = false;   // killed by the timer (only when CHECK_TOOL_TIMEOUT_MS sets one): the caller says so instead of an empty "gave no report"
  const timer = TOOL_MS > 0 ? setTimeout(() => { timedOut = true; C.killTree(p.pid); }, TOOL_MS) : null;
  p.on('error', e => { clearTimeout(timer); resolve({ out: '', err: e.message, ms: Date.now() - t0 }); });
  p.on('close', code => { clearTimeout(timer); resolve({ out: timedOut ? '' : Buffer.concat(chunks).toString('utf8'), code, ms: Date.now() - t0, timedOut }); });
});

(async () => {
  const jf = path.join(os.tmpdir(), `check-wl-${process.pid}.json`);
  const lj = path.join(os.tmpdir(), `check-locs-${process.pid}.json`);
  // doctor's full outputs go to a folder of this run (its default <tmp>/as2-doctor/<mod> is shared by every run on the same mod name)
  const dOut = fs.mkdtempSync(path.join(os.tmpdir(), 'check-doc-'));
  cleanup.push(() => fs.rmSync(dOut, { recursive: true, force: true }));
  // wouldload's passes: no time limit unless --pass-limit names one (the GUI pages that give check a time limit of their own pass 600)
  const wl = ['--json', jf, '--reach-all', '--timeout', String(o.passLimit || 0)], dc = ['-q', '--progress', '--out', dOut];
  // every location (not --locs N): the reach gate + dedupe (gate.js) work per location; samples are capped to --locs after them
  dc.push('--locs', '1000000', '--locs-json', lj);
  if (o.exe) wl.push('--exe', o.exe);
  dc.push('-j', String(o.j || 8));
  const skipped = [];
  if (o.fast) {
    // keylint/milint/binhdr/humlint/expcheck took 123/96/80/50/23 s on the godny robz mod (--timing); sdllint/refcheck are what the verdict is built from, wouldload runs them itself
    const only = (o.only ? o.only.split(',') : FAST_RUN.concat(Object.keys(FAST_SKIP)));
    for (const t of only) if (FAST_SKIP[t]) skipped.push([t, FAST_SKIP[t]]);
    dc.push('--only', only.filter(t => !FAST_SKIP[t]).join(',') || 'modinfo');
  } else if (o.only) dc.push('--only', o.only);
  // --fast on GoH, mod outside <GoH>/mods (no --with, not bare): wouldload reads the mod folder itself against the real GoH install
  // (its direct mode: sdllint on the folder and its paks, refcheck --folder = the mod's own files), not the overlay: an overlay is a new
  // game folder each run, so refcheck rebuilt the whole GoH entity index every time (about 1236 s, p-rec1). No reach info then (not mounted):
  // crash rows are not gated in that run (one NOTE says so)
  const wlDirect = !!(o.fast && tGoh && OV && !o.with && !bareSrc());
  if (o.game) wl.push('--game', o.game);
  if (o.goh) wl.push('--goh', wlDirect ? OV.real : o.goh);
  // an overlay game folder is new each run: wouldload's refcheck cache for it (50-75 MB, keyed by the game folder) would never be read
  // again, so it goes in the overlay's temp folder and is deleted with it, not in the shared cache folder; doctor's refcheck the same
  if (OV && !wlDirect) wl.push('--cache-dir', path.join(path.dirname(OV.ov), 'wl-cache'));
  if (OV) dc.push('--cache-dir', path.join(path.dirname(OV.ov), 'doc-cache'));
  // doctor lints for the target game: AS64 as before; mowas2 = --exe mowas_2 on the AS2 install; goh = --exe goh on the GoH install
  if (o.game && !tGoh) dc.push('--game', o.game);
  if (TARGET === 'mowas2') dc.push('--exe', 'mowas_2');
  if (tGoh) { const gh = o.goh || games.install('goh').dir; dc.push('--exe', 'goh', ...(gh ? ['--game', gh] : [])); }
  console.log('PROGRESS start wouldload');
  const wMod = wlDirect ? srcMod : mod;
  const R0notes = [];
  if (wlDirect) R0notes.push(`FAST_DIRECT wouldload read the mod folder ${C.fwd(srcMod)} against the GoH install ${C.fwd(OV.real)} (not mounted, its own files only), so no reach gate: crash rows on units nothing uses stay crash`);
  const wP = spawnTool('wouldload', [wMod, ...wl]).then(r => { console.log(`PROGRESS done wouldload ${(r.ms / 1000).toFixed(0)}s`); return r; });
  const [w0, d] = await Promise.all([wP, spawnTool('doctor', [mod, ...dc])]);
  let w = w0, W = null;
  const readW = () => { try { return JSON.parse(fs.readFileSync(jf, 'utf8')); } catch { return null; /* wouldload failed */ } finally { fs.rmSync(jf, { force: true }); } };
  W = readW();
  let L = null;
  try { L = JSON.parse(fs.readFileSync(lj, 'utf8')); } catch { /* no --locs or doctor failed */ } finally { fs.rmSync(lj, { force: true }); }
  const R = { mod, read: {}, verdicts: {}, findings: [], errors: [], notes: [...R0notes], toolIssues: [], locs: o.locs, fast: !!o.fast };
  // a wouldload pass (sdllint/refcheck) that ran out of memory or time beside doctor: rerun wouldload alone once (GUI-LOC item 4)
  const failedIn = X => X ? Object.values(X.exes || {}).flatMap(e => e.toolFailed || []) : [];
  if (failedIn(W).length) {
    const before = failedIn(W);
    console.log('PROGRESS start wouldload (rerun alone)');
    w = await spawnTool('wouldload', [wMod, ...wl]);
    const W2 = readW();
    if (W2) W = W2;
    const after = failedIn(W);
    R.notes.push(`RERAN wouldload alone: its first run beside doctor said "${before[0]}"; alone: ${after.length ? 'still ' + after[0] : 'finished'}`);
    console.log(`PROGRESS done wouldload (rerun alone) ${(w.ms / 1000).toFixed(0)}s`);
  }
  // doctor notes: JOBS (-j capped by RAM), RERAN (a tool rerun alone after running out of memory), DEP_MISSING, NOT_MOUNTED
  for (const l of d.out.split(/\r?\n/)) if (/^(JOBS|RERAN|DEP_MISSING|NOT_MOUNTED|GAME_SKIP|EXE_NOT_PASSED) /.test(l) && (o.timing || !/^JOBS /.test(l))) R.notes.push(l);   // DET-FIX: JOBS carries free RAM, a machine reading: only with --timing
  if (L) for (const [t, x] of Object.entries(L.tools || {})) {
    if (x.reran && !x.err) R.toolIssues.push({ tool: t, kind: 'reran', text: `${t} ran out of memory beside other tools; reran alone: ok` });
    else if (x.err && x.oom) R.toolIssues.push({ tool: t, kind: 'oom', text: `${t} ran out of memory, also when run alone: ${x.err}` });
    else if (x.err) R.toolIssues.push({ tool: t, kind: 'error', text: `${t}: ${x.err}` });
  }
  // samples: {file, line, msg, path}. path = where to open it: a loose file or the virtual path of a pak entry (lib/locate.js)
  const curGame = tGoh ? o.goh || games.install('goh').dir : o.game;   // the target game's folder (GoH install under goh)
  const locate = require('../lib/locate'), gameDir = curGame ? path.resolve(curGame) : path.dirname(path.dirname(mod));
  const sampleOf = (x, root) => {
    // preflight samples are free text that starts with a path (`resource/set/a.set:3`, `pw/tank: mg_nofill has no filling`): keep it as text
    const sm = typeof x === 'string' ? /^(\S+?)(?::(\d+))?:?(?:\s+(.*))?$/.exec(x) : null;
    const file = sm ? sm[1] : x.file, line = sm ? (sm[2] ? +sm[2] : null) : x.line, msg = sm ? sm[3] || '' : x.msg || '';
    const hit = file ? locate.resolve(file, [root, mod, gameDir]) : null;
    // an overlay (mod outside <game>/mods) is a temp dir deleted at exit: point at the real mod / game instead
    const real = p => { if (!p || !OV) return p; const P = C.fwd(p), d = C.fwd(OV.dst), g = C.fwd(OV.ov), lc = P.toLowerCase();
      return lc.startsWith(d.toLowerCase() + '/') ? C.fwd(srcMod) + P.slice(d.length) : lc.startsWith(g.toLowerCase() + '/') ? C.fwd(OV.real) + P.slice(g.length) : P; };
    return { file, line, msg, text: sm ? x : undefined, path: hit ? real(C.fwd(hit.path)) : null, pak: hit && hit.pak ? real(C.fwd(hit.pak)) : undefined };
  };
  const sampleStr = x => typeof x === 'string' ? x : (x.text || x.file + (x.line ? ':' + x.line : '')) + (x.repeat ? ' x' + x.repeat : '') + (x.also ? ' (also ' + x.also.join(', ') + ')' : '');
  console.log(`check ${C.fwd(srcMod)}${o.with ? ' + ' + C.fwd(path.resolve(o.with)) : ''}`);
  if (!W) { R.errors.push(w.timedOut ? `wouldload was stopped after ${TOOL_MS / 1000} s (timeout), so it gave no result` : 'wouldload gave no result: ' + w.out.split('\n').slice(-3).join(' ').slice(0, 200)); console.log('wouldload: NO RESULT (' + R.errors[0] + ')'); }
  else {
    const mi = W.modInfo || {};
    console.log(`mod.info: Min "${mi.min}" Max "${mi.max}" (${tGoh ? 'GoH range' : mi.modern ? 'modern' : 'legacy'})${mi.requires && mi.requires.length ? ' Require ' + mi.requires.join(',') : ''}`);
    for (const [k, e] of Object.entries(W.exes)) {
      const r = e.read || {};
      R.read[k] = { files: r.files, paks: r.paks, paksRead: r.paksRead, lintFiles: r.lintFiles, mounted: r.mounted };
      console.log(`READ ${k}: ${r.files} mod files + ${r.paks} paks (${r.paksRead === undefined ? '?' : r.paksRead} read)${r.lintFiles ? `, linters read ${r.lintFiles} SDL files` : ''}${r.mounted ? '' : ', NOT mounted' + (r.why ? ': ' + r.why : '')}${r.note ? ' | ' + r.note.slice(0, 120) : ''}`);
    }
  }
  // doctor: per tool lines `tool   N  CODE×n ...  (Ns)` | `tool ERROR ...`
  const rows = [];
  for (const l of d.out.split(/\r?\n/)) {
    const m = /^([a-z0-9]+)\s+(\d+)\s+((?:\S+×\d+\s*)+|ok)\s+\(\d+s\)$/.exec(l);
    if (m && m[3] !== 'ok') for (const x of m[3].trim().split(/\s+/)) { const [code, n] = x.split('×'); rows.push({ tool: m[1], code, n: +n, sev: registry.severity(code) }); }
    const er = /^([a-z0-9]+)\s+ERROR (.*)$/.exec(l);
    if (er) R.errors.push(`${er[1]}: ${er[2]}`);
  }
  if (L) for (const r of rows) { const t = L.tools[r.tool], ss = t && t.samples && t.samples[r.code]; if (ss && ss.length) r.samples = ss.map(x => sampleOf(x, t.root)); }
  if (!/^# doctor:/m.test(d.out)) R.errors.push(d.timedOut ? `doctor was stopped after ${TOOL_MS / 1000} s (timeout), so it gave no report` : 'doctor gave no report: ' + d.out.split('\n').slice(-2).join(' ').slice(0, 200));
  // preflight.js: our own extra warnings, review severity (codes not in registry), never part of a verdict. static file reads only; skipped in --fast
  if (!o.fast) {
    try {
      const pre = require('./preflight'), pr = o.with ? path.resolve(o.with) : null;
      const gdir = curGame || require('../lib/gamedir').resolve({ arg: o.game }).dir;
      for (const r of [...pre.run({ mod: srcMod, game: gdir, modId: path.basename(mod), exe: TARGET === 'as64' ? undefined : games.exeOf(TARGET) }),...(pr ? pre.run({ mod: pr, patch: pr }) : [])]) {
        const old = rows.find(x => x.tool === 'preflight' && x.code === r.code);
        const ss = r.samples.map(x => sampleOf(x, srcMod));
        if (old) { old.n += r.n; old.samples.push(...ss); } else rows.push({ tool: 'preflight', code: r.code, n: r.n, sev: registry.severity(r.code), samples: ss });
      }
    } catch (e) { R.errors.push('preflight: ' + e.message); }
  }
  // check-false A + E (gate.js): crash rows on files the engine never loads -> review; one row per file:line meaning; counts rebuilt
  // the reach of the TARGET build only (c-port3): before, with no --exe the first exe that had a reach was taken, and when the target's
  // pass came back without one (slow or out of memory beside other check runs) another game's reach gated the crash rows, so overlapping
  // runs gave other findings than one run alone. no target reach = no gate (crash rows stay crash)
  const GATE = require('./gate'), incKeys = GATE.incRoots(rows), reachOf = () => GATE.reachFor(W, TARGET);
  let never = null;
  if (incKeys.length) { try { never = require('./incscan').unincluded(incKeys, [srcMod, o.with], curGame ? path.resolve(curGame) : null); } catch (e) { R.errors.push('incscan: ' + e.message); } }
  const G = GATE.apply(rows, { reach: reachOf(), cap: o.locs, never });
  rows.length = 0; rows.push(...G.rows);
  const rd = /^# doctor: .*mounted: (.*)\)$/m.exec(d.out);
  console.log(`DOCTOR: ${rd ? 'mounted ' + rd[1] : d.timedOut ? `stopped after ${TOOL_MS / 1000} s (timeout), no report` : 'no game: folder tools only'}; ${new Set(rows.map(r => r.tool)).size} tools reported findings${o.timing ? `; doctor ${(d.ms / 1000).toFixed(0)}s, wouldload ${(w.ms / 1000).toFixed(0)}s` : ''}`);
  const tm = [];
  for (const l of d.out.split(/\r?\n/)) { const m = /^([a-z0-9]+)\s.*\((\d+)s\)\s*$/.exec(l); if (m) tm.push([m[1], +m[2]]); }
  tm.sort((a, b) => b[1] - a[1]);
  if (o.timing && tm.length && d.ms > 20000) console.log(`TIME doctor ${(d.ms / 1000).toFixed(0)}s wall, slowest: ${tm.slice(0, 4).map(x => x[0] + ' ' + x[1] + 's').join(', ')} (skip with --only tool,tool; all: --timing)`);
  if (o.timing) for (const [t, s] of tm) console.log(`TIMING ${t} ${s}s`);
  for (const [t, why] of skipped) console.log(`SKIPPED ${t}: ${why}`);
  for (const n of R.notes) console.log('NOTE ' + n);
  for (const x of R.toolIssues) console.log(`TOOL ${x.kind.toUpperCase()} ${x.text}`);
  if (o.fast) console.log(`MODE fast: ${skipped.length} tools skipped (SKIPPED lines above); counts below are NOT a full check, run without --fast for those`);
  let total = 0;
  for (const sev of ['crash', 'silent', 'review', 'cosmetic']) {
    const g = rows.filter(r => r.sev === sev).sort((a, b) => b.n - a.n);
    if (!g.length) continue;
    console.log(`${sev.toUpperCase()} (${g.reduce((s, r) => s + r.n, 0)} findings, ${g.length} codes)`);
    for (const r of g) { total += r.n; console.log(`  ${r.code} x${r.n}  [${r.tool}]${r.gated ? ' (crash code, not loaded: ' + r.note + ')' : ''}${r.samples ? ' e.g. ' + r.samples.slice(0, 3).map(sampleStr).join(', ') : ''}`); R.findings.push(r); }
  }
  for (const e of R.errors) console.log('ERROR: ' + e);
  if (W) for (const [k, e] of Object.entries(W.exes)) { R.verdicts[k] = { verdict: e.verdict, text: e.text }; console.log(`VERDICT ${k}: ${e.verdict}: ${e.text}`); }
  // T-DOORFIX: the exit code follows the mod's OWN target build (--target; else the one build named by --exe; else mod.info: MaxGameVersion < 3.3 = mowas2, else as64).
  // the other builds' verdicts stay printed as info. no verdict for the target (build not read) = fall back to all verdicts
  const target = TARGET;   // targetOf(): --target, the one --exe, goh (in <GoH>/mods or bounds below 2), mowas2 (Max < 3.3), else as64
  const tv = R.verdicts[target] ? { [target]: R.verdicts[target] } : R.verdicts;
  const vs = Object.values(tv).map(v => v.verdict);
  const others = Object.entries(R.verdicts).filter(([k]) => tv[k] === undefined);
  if (others.length) console.log(`NOTE: exit code follows the target build ${target}; ${others.map(([k, v]) => `${k} ${v.verdict}`).join(', ')} shown as info only (--target <build> to change)`);
  const crashN = rows.filter(r => r.sev === 'crash').reduce((s, r) => s + r.n, 0);
  if (G.gated) console.log(`NOTE: ${G.gated} crash-code finding${G.gated === 1 ? '' : 's'} listed under REVIEW: the file is never loaded (an unused unit, a .def outside resource/entity/, a mesh nothing names; wouldload --reach-all) [I]`);
  if (G.merged) console.log(`NOTE: ${G.merged} repeated finding${G.merged === 1 ? '' : 's'} merged (same file:line from several linters, repeats, macros after a missing include)`);
  R.gated = G.gated; R.merged = G.merged;
  if (crashN && W && Object.values(W.exes).some(e => e.verdict === 'LOADS_STATIC')) console.log(`NOTE: ${crashN} crash-severity findings above, yet a verdict says LOADS_STATIC: wouldload counts only fatal codes on an entity or set root (table + source cites: tools/wouldload/classes.js); read the CRASH list before trusting it`);
  console.log('NOTE: static only, nothing was run in a game. LOADS_STATIC = no crash class found, not "works"; details per code: as2 doctor <mod> (full outputs in its --out dir)');
  console.log(`${total} findings`);
  // exit: 1 = a verdict says the mod crashes or the game drops it (LIKELY_CRASH, REFUSED); else 2 = no verdict, a tool failed or a verdict is UNKNOWN; else 0
  // T-CRASH: verdict in words = first line of the report (hl-need deliverable 5, hl-gaps step 5)
  const silentN = rows.filter(r => r.sev === 'silent').reduce((s, r) => s + r.n, 0);
  const refused = W ? Object.entries(W.exes).filter(([k, e]) => e.verdict === 'REFUSED' && tv[k] !== undefined) : [];
  const bad = [];
  if (crashN || vs.includes('LIKELY_CRASH')) bad.push(`Known crash pattern found: ${crashN} crash finding${crashN === 1 ? '' : 's'} (CRASH below). Fix ${crashN === 1 ? 'it' : 'them'} before you play.`);
  if (refused.length) bad.push(`The game will not load this mod (${refused.map(([k, e]) => `${k}: ${e.text}`).join('; ')}).`);
  if (R.errors.length || !vs.length || vs.includes('UNKNOWN')) bad.push(`${bad.length ? 'Also, the' : 'No verdict: the'} check did not finish (ERROR lines below); run it again once that is fixed.`);
  R.words = [bad.length ? bad.join(' ') : o.fast ? `No known crash pattern in the fast check (${skipped.length} tools skipped; run without --fast for all). This does not mean it works: play it.` : 'No known crash pattern. This does not mean it works: play it.'];
  if (silentN) R.words.push(`${silentN} finding${silentN === 1 ? '' : 's'} can silently disable or desync part of the mod (SILENT below).`);
  // GT-02/GT-18: one overall result for the target (crash rows count even when the wouldload verdict says LOADS_STATIC) and the plain lines
  const P = require('./plain');
  R.target = target; R.overall = P.overall(R, target); R.plain = P.lines(R, target, { fast: o.fast });
  if (o.json) fs.writeFileSync(o.json, JSON.stringify(R, null, 1));
  if (o.plain) { const raw = held.splice(0); if (o.raw) held.push('--- full report ---', ...R.words, ...raw); flush(R.plain); }
  else flush(R.words);
  process.exitCode = vs.some(v => v === 'LIKELY_CRASH' || v === 'REFUSED') ? 1 : !vs.length || R.errors.length || vs.some(v => v === 'UNKNOWN') ? 2 : 0;
})().catch(e => { console.error('check failed: ' + e.stack); process.exitCode = 2; }).finally(() => { for (const f of cleanup) { try { f(); } catch { /* temp only */ } } });
