#!/usr/bin/env node
// bootcheck: the deterministic in-game verdicts BOOT and SPAWN, from recorded logs only. No game start, no clock, no random.
// usage:
//   node tools/bootcheck/bootcheck.js base <game.log> [--to-clock] [-o base.json]
//     error + warning lines of a vanilla run, normalized, counted by key
//   node tools/bootcheck/bootcheck.js mod <game.log> --base base.json [--to-clock] [--mod name] [--options options.set] [-o report.json]
//     PASS = 0 new error lines vs the base + the run reached the clock (+ the mod is active when --mod is given)
//   --to-clock: count only lines before the clock (play after it varies: AI buys); Exception blocks count anywhere. Same on base and mod
//   node tools/bootcheck/bootcheck.js spawn <game.log | edrun report.json> --list units.txt [-o report.json]
//     one spawn line per listed unit; PASS = N of N, names the missing
// error line: an Exception block (fatal ERROR_MSG or crash) or a timestamped line logtriage counts as a finding (not info).
//   warning line: any other timestamped line. [LUA] lines and untimed lines are neither.
// key: message + data path, numbers / 0x addresses / disk paths / times replaced by #, <path>; the engine's (file, line) line dropped.
//   vfs paths (/entity/...) stay: they name the content.
// clock: a line "GameThreadStart" (MP game thread) or "EDRUN <id> start" (edrun's first mission trigger).
// mod active: --options options.set lists --mod in {mods}; without --options the last "control> mod_set ..." line of the log;
//   edrun runs have neither: then --report <report.json> (or the report.json beside the log) "mods" list.
// spawn lines: MP mp_state roster "  human[N:<breed>] u:<unit>"; edrun "EDRUN <id> <pair> foeready|shooterready" (log: names
//   <pair>/foe, <pair>/shooter; report.json: the pair's foe / shooter entity). "can't spawn entity X" is quoted as the reason.
// game: from --exe as64|mowas_2|mowas2|goh; else goh for a log in the GoH form, else as64 (as before: a mowas_2.exe log needs
//   --exe mowas2, the CMD line exe is not read for the game).
//   A base of a game other than AS64 carries "game"; a base without it is AS64's. mod: base game != run game -> FAIL (each game
//   needs its own base: other exe, other mods and data, other warnings). Base files: base/<map>.json (AS64), base/<map>.<game id>.json.
//   MoW:AS2: no control pipe, so no "control> mod_set" line (ENG-19): the mod list comes from --options <the options.set the run used>.
//   GoH: the log is read in the GoH form (logtriage: [hh:mm:ss] stamp cut, GHLOG-07); clock GameThreadStart; mod active from the
//     "Mod: activate mod x" lines of the last "Mod: applying mods" round (GHLOG-16 [V]).
//   spawn under MoW:AS2: refused (no mp_state roster: no console or pipe in retail 3.262, ENG-19, MIS-12; no edrun EDRUN lines).
//   spawn under GoH: bot purchases only, "dbg: player#N spawned <unit>(<nation>) with cost" ([V] vanilla GoH game.log; [I] for
//     player-bought and mission units, which write no such line); "can't spawn entity X" as before.
// output: JSON, sorted keys, 1-space indent, LF. exit 0 PASS / base written, 1 FAIL, 2 usage or unreadable input or a game refused.
// Author: Imperator_Aug (ARSENAL, ia-26a78596)
require('../lib/help')(__filename);
const fs = require('fs'), path = require('path');
const { check, parseLog } = require('../logtriage/logtriage');
const games = require('../lib/games');
// game id the log itself gives: 'goh' for a log in the GoH form; an AS2-form log gives none, so with no --exe it is AS64, as before
const logGame = L => (L && L.goh ? 'goh' : null);

// ---- normalize: same text for the same message in any run
function norm(s) {
  return String(s == null ? '' : s)
    .replace(/[a-z]:[\\/][^\s"'()]*/gi, '<path>')
    .replace(/\\\\\.\\[^\s"'()]*/g, '<path>')
    .replace(/0x[0-9a-f]+/gi, '#')
    .replace(/\b\d+(?:\.\d+)?\b/g, '#')
    .replace(/\s+/g, ' ').trim();
}
const evKey = ev => norm(ev.msg) + (ev.where && !ev.isEngine ? ' @ ' + norm(ev.where) : '');
const exKey = ex => ex.kind === 'crash'
  ? 'CRASH|' + norm(ex.code) + ' at ' + norm(String(ex.fn || '?').replace(/\+0x[0-9a-f]+$/i, ''))
  : 'ERROR|' + norm(ex.msg) + (ex.file ? ' @ ' + norm(ex.file) : '');

// ---- one log -> counted error / warning keys + clock
function scan(file, toClock) {
  const L = parseLog(file);
  let clock = null, modSet = null, crash = false;
  L.lines.forEach((ln, i) => {
    if (clock == null && /^(GameThreadStart|EDRUN \S+ start)\s*$/.test(ln)) clock = i + 1;
    const m = /^control> mod_set (.*?)\s*$/.exec(ln);
    if (m) modSet = m[1].split(/\s+/).filter(Boolean);
  });
  // GoH: the mods of the last "Mod: applying mods" round (GHLOG-16); the stamp is already cut by parseLog
  const gohMods = L.goh && L.header.applied ? L.header.mods.map(x => x.name) : null;
  // --to-clock: lines after the clock depend on play (AI buys, combat); only Exception blocks count there
  if (toClock && clock != null) { L.events = L.events.filter(e => e.line < clock); L.modMode = L.modMode.filter(e => e.line < clock); }
  // logtriage findings (not info) mark which messages are errors: a group's finding sits on its first line
  const { rep } = check({ target: file });
  const findings = rep.toJSON({ tool: 'logtriage' }).findings;
  const exLines = new Set(L.exceptions.map(e => e.line));
  const byLine = new Map();
  for (const ev of L.events) { if (!byLine.has(ev.line)) byLine.set(ev.line, []); byLine.get(ev.line).push(ev); }
  const errKeys = new Set();
  const mode = new Map(L.modMode.map(m => [m.line, m]));
  for (const f of findings) {
    if (exLines.has(f.line)) continue;
    if (mode.has(f.line)) { errKeys.add('MODMODE|' + norm(mode.get(f.line).text)); continue; }
    for (const ev of byLine.get(f.line) || []) if (String(f.msg).startsWith(ev.msg)) errKeys.add(evKey(ev));
  }
  const errors = {}, warnings = {}, first = {};
  const bump = (o, k, line) => { o[k] = (o[k] || 0) + 1; if (!(k in first)) first[k] = line; };
  for (const m of L.modMode) bump(errors, 'MODMODE|' + norm(m.text), m.line);
  for (const ev of L.events) { const k = evKey(ev); if (errKeys.has(k)) bump(errors, k, ev.line); else bump(warnings, k, ev.line); }
  for (const ex of L.exceptions) bump(errors, exKey(ex), ex.line);
  for (const ex of L.exceptions) if (ex.kind === 'crash') crash = true;
  return { errors, warnings, first, clock, modSet, gohMods, crash, fatal: L.exceptions.length, game: logGame(L), goh: !!L.goh };
}

const sorted = o => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
const out = (o, file) => { const s = JSON.stringify(o, null, 1) + '\n'; if (file) fs.writeFileSync(file, s); else process.stdout.write(s); };

function base(file, o = {}) {
  const s = scan(file, o.toClock);
  const game = o.game || s.game;   // AS64 bases keep their old shape (no "game" key)
  return { tool: 'bootcheck', version: 1, kind: 'base', ...(game && game !== 'as64' ? { game } : {}), window: o.toClock ? 'to-clock' : 'all', reachedClock: s.clock != null, errorLines: sum(s.errors), warningLines: sum(s.warnings), errors: sorted(s.errors), warnings: sorted(s.warnings) };
}

// {mods "a" "b"} in options.set; a ":<id>" suffix (Workshop) dropped
function optionsMods(file) {
  const t = fs.readFileSync(file).toString('latin1');
  const m = /\{\s*mods((?:\s+"[^"\r\n]*")*)\s*\}/i.exec(t);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"\r\n]*)"/g)].map(x => x[1].replace(/:\d+$/, ''));
}

// edrun report.json "mods": ["as64+", "x"] (a ":<id>" suffix dropped); null when missing / unreadable / no list
function reportMods(file) {
  try {
    const r = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(r.mods) ? r.mods.map(m => String(m).replace(/:\d+$/, '')) : null;
  } catch (e) { return null; }
}

function mod(file, b, o) {
  const s = scan(file, o.toClock);
  const diff = (run, bas) => Object.keys(run).sort().filter(k => run[k] > (bas[k] || 0))
    .map(k => ({ key: k, base: bas[k] || 0, run: run[k], new: run[k] - (bas[k] || 0), line: s.first[k] }));
  const newErrors = diff(s.errors, b.errors || {}), newWarnings = diff(s.warnings, b.warnings || {});
  let modActive = null, modSource = null;
  if (o.mod) {
    const want = o.mod.toLowerCase();
    if (o.options) { modSource = 'options.set'; modActive = optionsMods(o.options).some(m => m.toLowerCase() === want); }
    else if (s.modSet) { modSource = 'log mod_set'; modActive = s.modSet.some(m => m.toLowerCase() === want); }
    else if (s.gohMods) { modSource = 'log Mod: activate mod'; modActive = s.gohMods.some(m => m.toLowerCase() === want); }
    // edrun mounts mods by its own route (no options.set, no mod_set line): its report.json "mods" lists the stack. --report, else report.json beside the log
    if (modActive == null) {
      const rep = o.report || path.join(path.dirname(file), 'report.json');
      const list = reportMods(rep);
      if (list) { modSource = 'edrun report.json'; modActive = list.some(m => m.toLowerCase() === want); }
    }
  }
  const reasons = [];
  const runGame = o.game || s.game || 'as64', baseGame = b.game || 'as64';
  if (b.kind !== 'base') reasons.push('--base is not a bootcheck base file');
  else if (runGame && runGame !== baseGame) reasons.push(`base recorded on ${games.get(baseGame) ? games.get(baseGame).name : baseGame}, run on ${games.get(runGame).name}: record a base for this game (bootcheck base <vanilla game.log> -o base/<map>.${runGame}.json)`);
  else if ((b.window || 'all') !== (o.toClock ? 'to-clock' : 'all')) reasons.push(`base window ${b.window || 'all'} vs run ${o.toClock ? 'to-clock' : 'all'}: use the same --to-clock on both`);
  if (newErrors.length) reasons.push(`${newErrors.reduce((a, e) => a + e.new, 0)} new error line(s) in ${newErrors.length} key(s)`);
  if (s.clock == null) reasons.push(s.fatal ? 'stopped before the clock: Exception block' : 'no clock line (GameThreadStart / EDRUN start)');
  if (o.mod && modActive !== true) reasons.push(modActive === false ? `mod '${o.mod}' not active (${modSource})` : runGame === 'mowas2' ? `mod '${o.mod}': MoW:AS2 has no control pipe, so the log has no mod_set line (ENG-19): pass --options <the options.set the run used>` : `mod '${o.mod}': no options.set and no mod_set line`);
  return {
    verdict: reasons.length ? 'FAIL' : 'PASS', newErrors, reachedClock: s.clock != null, modActive,
    mod: o.mod || null, modSource, clockLine: s.clock, crash: s.crash, reasons,
    newWarnings: newWarnings.length, newWarningLines: newWarnings.reduce((a, e) => a + e.new, 0), newWarningKeys: newWarnings.map(e => e.key),
  };
}

// ---- spawn
function readList(file) {
  return fs.readFileSync(file).toString('utf8').split(/\r?\n/).map(l => l.replace(/#.*/, '').trim()).filter(Boolean);
}
// -> { seen: Map(lowerName -> evidence), gone: Map(lowerName -> reason) }
function spawnEvidence(file, o = {}) {
  const seen = new Map(), gone = new Map();
  const see = (n, ev) => { const k = String(n).toLowerCase(); if (!seen.has(k)) seen.set(k, ev); };
  const lose = (n, why) => { const k = String(n).toLowerCase(); if (!gone.has(k)) gone.set(k, why); };
  const cant = (t, where) => { for (const m of String(t).matchAll(/can't spawn entity (\S+)/g)) lose(m[1].split('/').pop(), `${where}: can't spawn entity ${m[1]}`); };
  if (/\.json$/i.test(file)) {
    const r = JSON.parse(fs.readFileSync(file, 'utf8'));
    const games = r.games || [];
    games.forEach((g, gi) => (g.errors || []).forEach(e => cant(e, `game ${gi} error`)));
    for (const p of r.pairs || []) {
      const marks = (games[p.game || 0] || {}).marks || {};
      for (const [role, ent] of [['foe', p.foe], ['shooter', p.shooter]]) {
        const k = `${p.name} ${role}ready`;
        if (k in marks) { const ev = `report: pair ${p.name} ${role}ready at ${marks[k]} s`; see(`${p.name}/${role}`, ev); if (ent) see(ent, ev); }
      }
      if (p.verdict === 'NOSPAWN' && p.countReason) lose(p.name, `pair ${p.name}: ${p.countReason}`);
    }
    return { seen, gone };
  }
  const L = o.goh ? parseLog(file, { goh: true }) : null;
  const lines = L ? L.lines : fs.readFileSync(file).toString('latin1').split(/\r?\n/);
  lines.forEach((ln, i) => {
    const at = `log:${i + 1}`;
    if (L) {   // GoH bot purchase line (stamp cut): "dbg: player#2 spawned single_rifle(fin) with cost 10. ..."
      const g = /^dbg: player#\d+ spawned (\S+?)\((\w+)\) with cost/.exec(ln);
      if (g) see(g[1], `${at}: bot spawned ${g[1]}(${g[2]})`);
      if (/can't spawn entity/.test(ln)) cant(ln, at);
      return;
    }
    let m = /^\s+(\w+)\[\d+:([^\]]+)\]\s+u:(\S+)/.exec(ln);
    if (m) { const ev = `${at}: ${m[1]} ${m[2]} u:${m[3]}`; for (const n of [m[2], m[2].split('/').pop(), m[3], m[3].split('/').pop()]) see(n, ev); }
    m = /^EDRUN \S+ (\S+) (foe|shooter)ready\s*$/.exec(ln);
    if (m) see(`${m[1]}/${m[2]}`, `${at}: EDRUN ${m[1]} ${m[2]}ready`);
    if (/can't spawn entity/.test(ln)) cant(ln, at);
  });
  return { seen, gone };
}

function spawn(file, list, o = {}) {
  const { seen, gone } = spawnEvidence(file, o);
  const units = list.map(name => {
    const k = name.toLowerCase();
    return seen.has(k) ? { name, spawned: true, line: seen.get(k) } : { name, spawned: false, line: null, reason: gone.get(k) || 'no spawn line' };
  });
  const n = units.filter(u => u.spawned).length;
  return { verdict: list.length && n === list.length ? 'PASS' : 'FAIL', spawned: n, of: list.length, missing: units.filter(u => !u.spawned).map(u => u.name), units };
}

// ---- cli
if (require.main === module) {
  const args = process.argv.slice(2), o = {}, pos = [];
  const USAGE = 'usage: bootcheck [--exe as64|mowas_2|mowas2|goh] base <game.log> [--to-clock] [-o base.json] | mod <game.log> --base base.json [--to-clock] [--mod name] [--options options.set] [--report report.json] [-o out.json] | spawn <game.log|report.json> --list units.txt [-o out.json]';
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-o') o.output = args[++i]; else if (a === '--base') o.base = args[++i]; else if (a === '--mod') o.mod = args[++i];
    else if (a === '--exe') { const g = games.get(args[++i]); if (!g) { console.error('bootcheck: --exe needs as64, mowas_2, mowas2 or goh'); process.exit(2); } o.game = g.id; }
    else if (a === '--options') o.options = args[++i]; else if (a === '--report') o.report = args[++i]; else if (a === '--to-clock') o.toClock = true; else if (a === '--list') o.list = args[++i]; else pos.push(a);
  }
  const [cmd, file] = pos;
  const bad = msg => { console.error(msg ? 'bootcheck: ' + msg : USAGE); process.exit(2); };
  if (!cmd || !file || pos.length > 2) bad();
  if (!fs.existsSync(file)) bad('no such input: ' + path.basename(file));
  try {
    if (cmd === 'base') { out(base(file, o), o.output); process.exit(0); }
    if (cmd === 'mod') {
      if (!o.base) bad('mod needs --base base.json');
      if (o.options && !fs.existsSync(o.options)) bad('no such options.set');
      if (o.report && !fs.existsSync(o.report)) bad('no such report.json');
      const r = mod(file, JSON.parse(fs.readFileSync(o.base, 'utf8')), o);
      out(r, o.output); process.exit(r.verdict === 'PASS' ? 0 : 1);
    }
    if (cmd === 'spawn') {
      if (!o.list) bad('spawn needs --list units.txt');
      const L = /\.json$/i.test(file) ? null : parseLog(file);
      const game = o.game || (L && logGame(L));
      if (game === 'mowas2') games.refuse('bootcheck spawn', 'mowas2', 'spawn lines come from the mp_state roster (console or control pipe) or edrun EDRUN lines; retail mowas_2.exe has neither', 'ENG-19, MIS-12');
      const r = spawn(file, readList(o.list), { goh: game === 'goh' || !!(L && L.goh) });
      out(r, o.output); process.exit(r.verdict === 'PASS' ? 0 : 1);
    }
  } catch (e) { bad(e.message); }
  bad();
}
module.exports = { norm, scan, base, mod, spawn, spawnEvidence, optionsMods, readList, logGame };
