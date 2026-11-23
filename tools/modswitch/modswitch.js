#!/usr/bin/env node
// modswitch: show / set the active mod list in profiles/<id>/options.set {mods}, testing/launch).
//   node tools/modswitch/modswitch.js --game <dir> [--exe as64|mowas_2|goh] [--profile <options.set>] [--set a,b | --restore] [--write] [-q]
//   --bak <file> (relative = profile dir): snapshot instead of the keep-first .modswitch.bak (--set overwrites it, --restore reads it)
//   --json: show only, one JSON line {profile, game, active: [{entry, folder, installed}], problems: [{code, level, msg}]} (a folder name
//     with a space stays one entry); refused with --set, --restore, --export, --import. --export <file> / --import <file>: list as JSON file
//   --inst N: the -instance N profile; --seed N [--mods a:0,b:0]: copy the main profile to instance N; --force: write a mode-mismatched set
// mode-mismatched set (legacy mod + as64+, modern mod w/o as64+) = startup crash (ENG-26): --write refused unless --force
// default = dry run (prints plan). --write edits options.set (outside mod folder: only on user ask), keeps first
// original as options.set.modswitch.bak. refuses while game runs (game rewrites options.set on Apply/exit).
// lines written lowercase "folder:patchcount" (list text compared exactly vs lowercased folder, ApplyMods).
//   --exe as64|mowas_2|mowas2|goh: the game (lib/games). none = as before: GoH when the --game folder holds
//     binaries/x64/call_to_arms.exe, else the AS2 rules with as64 modes. --exe goh without --game: the GoH install (lib/games install).
//   GoH: profile from the GoH user dir (lib/userdir gohProfiles, GHVFS-13), running check call_to_arms.exe / call_to_arms_ed.exe,
//     launch line Steam app 400750, list wipe by the GoH version (lastGameVersion), no as64+ and no modes, folder names checked
//     (MOD_NAME_GOH: space, byte >= 0x80 or one of <>+()[]{}!@#$%^&*-=;:\|'" = the game skips the folder, GHVFS-27).
//     --inst N >= 1 and --seed refused: GoH has one user folder, no per-instance copy (GHVFS-13).
//   mowas_2: no as64+ and no modes (VFS-47, VFS-48 are as64.exe only): WARN_MOWAS2_NO_PLUS, WARN_MOWAS2_VERSION (Min above 3.262,
//     mowas_2.exe skips the mod [I]); --inst N >= 1 and --seed refused: mowas_2.exe has no -instance (TST-19).
// Author: Imperator_Aug (ARSENAL, ia-b79b9e6a)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const crypto = require('crypto'), fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { readModList, discover } = require('../lib/vfs');
const userdir = require('../lib/userdir');
const platform = require('../lib/platform');

const games = require('../lib/games');
const EXES_AS2 = ['as64.exe', 'mowas_2.exe', 'as64_ed.exe', 'mowas_2_ed.exe', 'mowas_2_workshop.exe'];
const GOH_EXES = ['call_to_arms.exe', 'call_to_arms_ed.exe'];
const LAUNCH = 'Start-Process "steam://rungameid/244450"   (Play; verify: modswitch again, list unchanged by game)';
const GOH_LAUNCH = 'Start-Process "steam://rungameid/400750"   (Play; verify: modswitch again, list unchanged by game)';
// GHVFS-27 (GoH IsValidModName): such a mods/ folder is skipped
const GOH_BAD_NAME = /[\u0080-￿<>+()[\]{}!@#$%^&*\-=;:\\|'" ]/;

function instArg(v, a) {
  if (!/^[0-9]+$/.test(v || '')) { console.error(a + ' needs an instance number'); process.exit(2); }
  return Number(v);
}
function args(argv) {
  const o = { write: false, q: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--game') o.game = argv[++i];
    else if (a === '--profile') o.profile = argv[++i];
    else if (a === '--set') o.set = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--export') o.export = argv[++i];
    else if (a === '--import') o.import = argv[++i];
    else if (a === '--restore') o.restore = true;
    else if (a === '--bak') o.bak = argv[++i];      // per-run snapshot: --set always rewrites it, --restore reads it
    else if (a === '--inst') o.inst = instArg(argv[++i], a);
    else if (a === '--seed') o.seed = instArg(argv[++i], a);   // copy main profile to instance N (never instance 0)
    else if (a === '--mods') o.mods = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--write') o.write = true;
    else if (a === '--no-proc') o.noProc = true;   // tests: skip running-game check
    else if (a === '--force') o.force = true;      // write a mode-mismatched set anyway (ENG-26 crash)
    else if (a === '--exe') { const g = games.get(argv[++i]); if (!g) { console.error('--exe must be as64, mowas_2 (mowas2) or goh'); process.exit(2); } o.exe = g.exe; }
    else if (a === '-q') o.q = true;
    else if (a === '--json') o.json = true;
    else { console.error('unknown arg ' + a); process.exit(2); }
  }
  return o;
}

// profiles/*/options.set under Documents (may be OneDrive-redirected, testing/env)
// inst = -instance N user dir (TST-22; lib/userdir). AS2_HOME overrides the home dir (tests). --inst N never falls back to instance 0.
// GoH under AS2_HOME (tests): %LOCALAPPDATA% is taken under that home too, so a test never finds the real GoH user dir
function homeOpt() { return process.env.AS2_HOME ? { home: process.env.AS2_HOME, env: { LOCALAPPDATA: path.join(process.env.AS2_HOME, 'AppData', 'Local') } } : {}; }
function findProfiles(inst = 0, goh = false) { return goh ? userdir.gohProfiles(homeOpt()) : userdir.profiles(inst, homeOpt()); }

// instance of a game command line: -instance n, none = 0
function instOf(cmd) { const m = /(?:^|\s)-instance\s+(\d+)/i.exec(cmd || ''); return m ? +m[1] : 0; }
// options.set is per instance, so only a game on the same instance blocks. command lines unreadable: any running exe blocks
function gameRunning(inst = 0, goh = false) {
  const EXES = goh ? GOH_EXES : EXES_AS2;
  if (!platform.isWin()) {
    // Linux (game under Proton) / macOS: ps command lines; unreadable = no check, as before [I: Proton process names untested]
    const procs = platform.commandLines();
    if (!procs) return [];
    return [...new Set(procs.filter(p => EXES.includes(p.name.toLowerCase()) && instOf(p.cmd) === inst).map(p => p.name.toLowerCase()))];
  }
  let t = '';
  try { t = cp.execSync('tasklist /FO CSV /NH', { encoding: 'latin1', stdio: ['ignore', 'pipe', 'ignore'] }).toLowerCase(); } catch { return []; }
  const names = EXES.filter(e => t.includes('"' + e + '"'));
  if (!names.length) return [];
  // a game starting or closing shows no command line for a moment (a side-by-side session's game refused a run this way): look again before blocking
  const ps = "Get-CimInstance Win32_Process | Where-Object { @('" + names.join("','") + "') -contains $_.Name.ToLower() } | Select-Object Name,CommandLine | ConvertTo-Json -Compress";
  for (let tries = 0; ; tries++) {
    let procs = null;
    try {
      procs = [].concat(JSON.parse(cp.execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20000 })));
    } catch { /* unreadable this time */ }
    if (procs && !procs.some(p => !p.CommandLine)) return [...new Set(procs.filter(p => instOf(p.CommandLine) === inst).map(p => p.Name.toLowerCase()))];
    if (tries >= 4) return names;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
  }
}

// replace {mods ...} block text; insert before options' closing brace if absent. keeps all other bytes
const MODS_RE = /([ \t]*)\{mods((?:\s+"[^"\r\n]*")*)\s*\}/i;
function rewrite(text, list) {
  const m = MODS_RE.exec(text);
  const ind = m ? m[1] : '\t';
  const block = `${ind}{mods\r\n${list.map(s => `${ind}\t"${s}"\r\n`).join('')}${ind}}`;
  if (m) return text.slice(0, m.index) + block + text.slice(m.index + m[0].length);
  const end = text.lastIndexOf('}');
  if (end < 0) throw new Error('options.set: no closing brace');
  return text.slice(0, end) + block.replace(/^\t?/, '\t') + '\r\n' + text.slice(end);
}

// mod.info facts for export/import: version ({Version "x"} / {ModVersion "x"}) + sha1 of file bytes
function infoOf(m) {
  if (!m) return { version: null, sha1: null };
  const b = fs.readFileSync(path.join(m.dir, 'mod.info'));
  const v = /\{\s*(?:Mod)?Version\s+"([^"]*)"/i.exec(b.toString('latin1'));
  return { version: v ? v[1] : null, sha1: crypto.createHash('sha1').update(b).digest('hex') };
}
// VFS-48: mod applies iff built-in or modern (MinGameVersion >= 3.301) == Enhanced (as64+ listed)
function isModern(m) {
  try {
    const t = fs.readFileSync(path.join(m.dir, 'mod.info'), 'latin1'), r = /[{]\s*MinGameVersion\s+"([^"]*)"/i.exec(t);
    if (!r) return false;
    const v = r[1].replace(/[^0-9.]/g, '').split('.').filter(x => x !== '').map(Number);
    return v.length > 0 && (v[0] > 3 || (v[0] === 3 && (v[1] || 0) >= 301));
  } catch { return false; }
}
function modeWarns(names, mods) {
  const ids = names.map(n => n.split(':')[0].toLowerCase()), enh = ids.includes('as64+'), out = [];
  for (const id of ids) {
    const m = id === 'as64+' ? null : mods.get(id);
    if (!m) continue;
    if (isModern(m) !== enh) out.push(isModern(m)
      ? `MOD_MODE_CLASSIC "${id}": modern mod (MinGameVersion >= 3.301) listed without as64+ (Classic): game crashes at startup (ENG-26)`
      : `MOD_MODE_LEGACY "${id}": legacy mod (Min < 3.301) listed with as64+ (Enhanced): game crashes at startup (ENG-26)`);
  }
  return out;
}
function gameVersion(prof) {
  try { const m = /lastGameVersion\s+"([^"]*)"/i.exec(fs.readFileSync(path.join(path.dirname(prof), 'settings.set'), 'latin1')); return m ? m[1] : null; } catch { return null; }
}

function main() {
  const o = args(process.argv.slice(2));
  if (o.exe === 'goh' && !o.game) {
    const r = games.install('goh');
    if (!r.dir) { console.error('no Gates of Hell install found: pass --game <GoH folder>'); process.exit(2); }
    o.game = r.dir;
  }
  // the game: --exe, else GoH when the folder holds call_to_arms.exe (as before), else the AS2 rules (as64 modes)
  const isGoh = o.exe ? o.exe === 'goh' : !!(o.game && fs.existsSync(path.join(o.game, 'binaries/x64/call_to_arms.exe')));
  const isMow = o.exe === 'mowas_2';
  // per game: as64 modes (VFS-48) only on the AS2 rules without --exe mowas_2; mowas_2 3.262 skips a mod whose Min is above it [I]
  const gameWarns = list => isGoh ? [] : !isMow ? modeWarns(list, mods) : list.map(s => s.split(':')[0].toLowerCase())
    .filter(id => mods.get(id) && isModern(mods.get(id)))
    .map(id => `WARN_MOWAS2_VERSION "${id}": MinGameVersion 3.301 or newer: mowas_2.exe (3.262) skips this mod [I]`);
  let mods;
  if ((isGoh || isMow) && (o.seed != null || o.inst)) {
    games.refuse('modswitch', isGoh ? 'goh' : 'mowas2', isGoh ? 'a test game copy (--inst, --seed) needs a numbered user folder; ' + userdir.GOH_NO_INST.replace(/ \(GHVFS-13\)$/, '')
      : 'a test game copy (--inst, --seed) needs -instance, which mowas_2.exe does not have', isGoh ? 'GHVFS-13' : 'TST-19');
  }
  if (o.seed != null) {
    if (!o.seed) { console.error('--seed 0 refused: instance 0 is the real profile'); process.exit(2); }
    try {
      const r = userdir.seedProfile(o.seed, { ...homeOpt(), mods: o.mods });
      console.log(`seeded ${r.file} from ${r.from}${r.mods ? ' mods ' + r.mods.join(' ') : ''}`);
    } catch (e) { console.error('error: ' + e.message); process.exit(2); }
    return;
  }
  if (!o.game) { console.error('usage: modswitch --game <dir> [--exe as64|mowas_2|goh] [--inst N] [--profile options.set] [--set a,b | --restore] [--write]  |  --seed N [--mods a:0,b:0]'); process.exit(2); }
  let prof = o.profile;
  if (!prof) {
    const inst = o.inst || 0, ps = findProfiles(inst, isGoh);
    if (ps.length !== 1) { console.error(ps.length ? 'several profiles, pick --profile:\n  ' + ps.join('\n  ') : 'no profile found' + (inst ? ` for instance ${inst}; run --seed ${inst} first` : isGoh ? ' in the Gates of Hell user folder; pass --profile' : '; pass --profile')); process.exit(2); }
    prof = ps[0];
  }
  const problems = [], err = [];
  mods = discover(o.game, problems);
  // GoH: readModList's default is the AS2 version, so its version wipe would read an empty list. wipe rule on GoH [T]
  const gohVer = isGoh ? gameVersion(prof) || undefined : undefined;
  const cur = readModList(prof, gohVer);
  problems.push(...cur.problems);
  if (o.json) {   // --json (show only): one JSON line, one list entry per mod, so a name with a space stays one entry
    if (o.set || o.restore || o.export || o.import) { console.error('--json only shows the active list (no --set, --restore, --export, --import)'); process.exit(2); }
    for (const s of cur.mods) {
      const name = s.split(':')[0];
      if (name === 'as64+' && isMow) problems.push({ code: 'WARN_MOWAS2_NO_PLUS', msg: `"${s}": mowas_2.exe has no built-in as64+ (as64.exe only, VFS-47); it skips this line`, level: 'warn' });
      else if (name === 'as64+' && !isGoh && fs.existsSync(path.join(o.game, 'as64', 'plus', 'mod.info'))) continue;
      else if (!mods.has(name) || name !== name.toLowerCase()) problems.push({ code: 'MOD_NOT_INSTALLED', msg: `"${s}": engine skips it (no mods/${name}/mod.info, or capitals)`, level: 'warn' });
      else if (isGoh && GOH_BAD_NAME.test(name)) problems.push({ code: 'MOD_NAME_GOH', msg: `"${s}": Gates of Hell skips a mod folder whose name has a space, a non-ASCII letter or one of <>+()[]{}!@#$%^&*-=;:\\|'" (GHVFS-27); rename the folder`, level: 'warn' });
    }
    for (const w of gameWarns(cur.mods)) { const sp = w.indexOf(' '); problems.push({ code: w.slice(0, sp), msg: w.slice(sp + 1), level: 'warn' }); }
    const game = isGoh ? 'goh' : isMow ? 'mowas2' : 'as64';
    console.log(JSON.stringify({ profile: prof, game, active: cur.mods.map(s => { const id = s.split(':')[0]; return { entry: s, folder: id, installed: id === 'as64+' ? !isGoh && !isMow && fs.existsSync(path.join(o.game, 'as64', 'plus', 'mod.info')) : mods.has(id) && id === id.toLowerCase() && !(isGoh && GOH_BAD_NAME.test(id)) }; }),
      problems: problems.map(p => ({ code: p.code, level: p.level || 'warn', msg: p.msg })) }));
    return;
  }
  console.log(`profile: ${prof}`);
  console.log(`active:  ${cur.mods.length ? cur.mods.join(' ') : '(none)'}`);
  for (const s of cur.mods) {
    const name = s.split(':')[0];
    if (name === 'as64+' && isMow) { problems.push({ code: 'WARN_MOWAS2_NO_PLUS', msg: `"${s}": mowas_2.exe has no built-in as64+ (as64.exe only, VFS-47); it skips this line`, level: 'warn' }); continue; }
    if (name === 'as64+' && !isGoh && fs.existsSync(path.join(o.game, 'as64', 'plus', 'mod.info'))) continue; // built-in plus mod
    if (!mods.has(name) || name !== name.toLowerCase()) problems.push({ code: 'MOD_NOT_INSTALLED', msg: `"${s}": engine skips it (no mods/${name}/mod.info, or capitals)`, level: 'warn' });
    else if (isGoh && GOH_BAD_NAME.test(name)) problems.push({ code: 'MOD_NAME_GOH', msg: `"${s}": Gates of Hell skips a mod folder whose name has a space, a non-ASCII letter or one of <>+()[]{}!@#$%^&*-=;:\\|'" (GHVFS-27); rename the folder`, level: 'warn' });
  }
  for (const w of gameWarns(cur.mods)) console.log(w);
  for (const p of problems) console.log(`${p.level === 'error' ? 'ERROR' : 'WARN'} ${p.code} ${p.msg}`);

  if (o.export) {   // read-only on game + profile; writes only the json
    const list = cur.mods.map((s, i) => {
      const name = s.split(':')[0], m = mods.get(name), inf = infoOf(m);
      return { name, order: i, enabled: true, version: inf.version, sha1: inf.sha1, present: !!m };
    });
    fs.writeFileSync(o.export, JSON.stringify({ gameVersion: gameVersion(prof), mods: list }, null, 2) + '\n');
    console.log(`exported ${list.length} mods to ${o.export}`);
    return;
  }
  let importMissing = 0;
  if (o.import) {
    let j;
    try { j = JSON.parse(fs.readFileSync(o.import, 'utf8')); if (!j || !Array.isArray(j.mods)) throw new Error('no mods array'); }
    catch (e) { console.error('bad import file: ' + e.message); process.exit(2); }
    o.set = [];
    for (const e of j.mods.filter(e => e && e.enabled !== false).sort((a, b) => (a.order || 0) - (b.order || 0))) {
      const name = String(e.name || '').split(':')[0], m = mods.get(name.toLowerCase());
      if (!m) { console.log(`MODSW_MISSING_MOD "${name}": not installed (no mods/<folder>/mod.info)`); importMissing++; continue; }
      // real mod.info carries no version key (only Min/MaxGameVersion) → fall back to mod.info sha1
      const inf = infoOf(m);
      if (e.version != null && inf.version !== e.version) console.log(`WARN_MODSW_VERSION_DIFF "${name}": file ${e.version}, installed ${inf.version}`);
      else if (e.version == null && e.sha1 && inf.sha1 !== e.sha1) console.log(`WARN_MODSW_INFO_DIFF "${name}": mod.info differs from exported (sha1)`);
      o.set.push(name);
    }
  }
  const launch = isGoh ? GOH_LAUNCH : LAUNCH;
  const bak = o.bak ? path.resolve(path.dirname(prof), o.bak) : prof + '.modswitch.bak';
  let next = null;
  if (o.restore) {
    if (!fs.existsSync(bak)) { console.error('no backup ' + bak); process.exit(1); }
  } else if (o.set) {
    next = [];
    for (const n of o.set) {
      const id = n.split(':')[0].toLowerCase(), m = mods.get(id);
      if (id === 'as64+' && isMow) { err.push(`MOD_NOT_INSTALLED "${n}": mowas_2.exe has no built-in as64+ (as64.exe only, VFS-47)`); continue; }
      if (id === 'as64+' && !isGoh) { next.push('as64+:0'); continue; }   // built-in (VFS-47); a mods/as64+ folder would be dropped by the engine
      if (!m) { err.push(`MOD_NOT_INSTALLED "${n}": no mods/<folder>/mod.info named so`); continue; }
      if (isGoh && GOH_BAD_NAME.test(id)) { err.push(`MOD_NAME_GOH "${n}": Gates of Hell skips a mod folder whose name has a space, a non-ASCII letter or one of <>+()[]{}!@#$%^&*-=;:\\|'" (GHVFS-27); rename the folder`); continue; }
      next.push(`${id}:${m.patches}`);
    }
    if (importMissing) { console.log(`plan:    ${next.join(' ') || '(none)'}`); console.log(`not applied: ${importMissing} mod(s) missing`); process.exit(1); }
    if (err.length) { for (const e of err) console.log('ERROR ' + e); process.exit(1); }
    console.log(`plan:    ${next.length ? next.join(' ') : '(none)'}   (earlier = overridden by later)`);
    var bad = isGoh || isMow ? [] : modeWarns(next, mods);
    for (const w of bad) console.log(w);
    if (isMow) for (const w of gameWarns(next)) console.log(w);
  } else { if (!o.q) console.log('launch:  ' + launch); return; }

  if (!o.write) { console.log('dry run: add --write to apply (edits options.set outside mod folder)'); return; }
  if (bad && bad.length && !o.force) { console.log(`ERROR MOD_MODE ${bad.length} mismatched: not written; fix mod.info MinGameVersion or the list, or --force`); process.exit(1); }
  const run = o.noProc ? [] : gameRunning(o.inst || 0, isGoh);
  if (run.length) { console.log(`ERROR GAME_RUNNING ${run.join(',')}: game rewrites options.set; close it first`); process.exit(1); }
  if (o.restore) { fs.copyFileSync(bak, prof); console.log('restored ' + prof + ' from backup'); }
  else {
    const buf = fs.readFileSync(prof, 'latin1');   // byte-preserving round trip (cp1251 text)
    if (o.bak || !fs.existsSync(bak)) fs.writeFileSync(bak, buf, 'latin1');
    fs.writeFileSync(prof, rewrite(buf, next), 'latin1');
    const chk = readModList(prof, gohVer).mods;
    if (chk.join() !== next.join()) { console.log('ERROR WRITE_MISMATCH reread ' + chk.join(' ')); process.exit(1); }
    console.log(`wrote ${prof} (backup ${path.basename(bak)})`);
  }
  console.log('launch:  ' + launch);
}

if (require.main === module) main();
module.exports = { rewrite, GOH_BAD_NAME };
