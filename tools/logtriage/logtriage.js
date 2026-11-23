#!/usr/bin/env node
// logtriage: triage game.log / game.prev.log / minidump sidecars / oos dumps: phases, collapsed duplicates, cause + limits row per message.
// usage: node tools/logtriage/logtriage.js [logDir | game.log] [--mod <modDir>] [--game <dir>] [--mods a,b] [--json] [-q] [--summary] [--lua]
//   --lua: print only the [LUA] lines (+counts); LUA DBG: lines are noise elsewhere
//   logDir = folder with game.log (+ game.prev.log, minidumps/, oos/); a file = that log only
//   --since <ms|ISO>: skip minidumps / oos folders older than that (testrun passes spawn time: older ones are not this run's)
//   --mod: mark which logged data paths the mod folder supplies (loose files, + vfs layers when --game given)
//   --exe as64|mowas_2|mowas2|goh: the game whose log this is (default: as64, or read from the log). mowas_2: the mod probe has no
//     as64/core and a log written by another exe is named (AS64 and MoW:AS2 share one log folder, LOG-20). goh: the Gates of Hell log
//     form (below); no logDir given = <GoH user dir>/log (userdir.gohFind, LOG-22); --game defaults to the GoH install (games.install).
//   --goh: the same as --exe goh. A log is also read as GoH when its first lines carry the GoH marks (CMD call_to_arms.exe, Mount
//     package, Mod: activate mod, Steam app 400750), so a GoH log given by path needs no flag; AS2 logs never carry them.
//     --goh on a log whose CMD names an AS2 exe (as64.exe, mowas_2.exe) reads it in the AS2 form with a LOG_NOTE naming that exe.
//   GoH log form: every line stamped [hh:mm:ss] (GHLOG-07 [V]); the stamp is cut before every rule. Header CMD: / CMD =, Product:,
//     Build:; mods from "Mod: applying mods" .. "Mod: activate mod x" (GHLOG-16 [V]); "Mount package" lines counted; a line is a
//     message when it has "(file.cpp:line) @ [thread]" or "(path, n)", starts with "!!!" or matches a rule or an error word, else it
//     is a status line (counted only). Crash codes 0x0bad000N (GHLOG-10 [V]). OOS dump folders are counted, not read (GoH form differs).
//   --inst / --all-instances: AS2 only (GoH has one user dir, LOG-22).
// codes (findings): LOG_ERROR_MSG (LOG-06) LOG_SCRIPT_ERROR (LOG-06) LOG_MISSING_FILE LOG_NO_STUFF (LOG-07) LOG_LEVEL_PARAM (LOG-08)
//   LOG_PANEL_ITEM (LOG-09) LOG_WARN (actionable warning; LOG-05 runtime) LOG_CRASH (LOG-04; GoH codes GHLOG-10) LOG_OOS LOG_OOS_VERSION
//   LOG_MOD_MODE (ENG-26) LOG_MOD_INFO_ERROR (ENG-25) LOG_FALLBACK_FONT (ENG-26) LOG_MOD_LOAD (GoH mod scan warnings, GHLOG-16)
//   info (uncounted): LOG_LUA LOG_MOD_SHADOWED (LOG-17) LOG_PREV_LOST (LOG-19) LOG_EXE_SWITCH (LOG-20) LOG_BENIGN LOG_UNCLASSIFIED LOG_LOBBY_DUP (LOG-16) LOG_NOTE (LOG-01/02/03/04) LOG_PHASE LOG_DUMP LOG_SYNC
// Author: Imperator_Aug (ARSENAL, ia-10979b9a)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');
const { createReport } = require('../lib/report');

// ---- rules: first match wins. sev: 'f' finding | 'i' info (known noise). code per group
const SDL_ERR = /define not found|unexpected token|expected!|' required|Invalid block identifier|End of SDL file|signature mismatch|Not SDL file|Nested mods|Bone modifiers must/i;
const RULES = [
  { re: /^No Stuff found for tags/i, code: 'LOG_NO_STUFF', row: 'LOG-07', cause: 'nothing in set/stuff carries these tags; dummy_checker substituted, load looks fine, CRASH when item used (empty ammo, reload on dummy). Fix tag in breed/inventory/.def or add stuff' },
  { re: /^invalid level param/i, code: 'LOG_LEVEL_PARAM', row: 'LOG-08', cause: 'ability level name undefined for that ability: level null, ability silently treated as HIGHEST level' },
  { re: /^Unknown control panel item : "(trench_[a-z_]+|scrape)"/i, code: 'LOG_PANEL_ITEM', row: 'LOG-09', sev: 'i', cause: 'vanilla trench item in set/panel_control: known noise (warning only here; same text in gc mini map is fatal)' },
  { re: /^Unknown control panel item/i, code: 'LOG_PANEL_ITEM', row: 'LOG-09', cause: 'set/panel_control lists a button with no item definition; gc_cp_dummy substituted (warning in gc panel control, ERROR_MSG in gc mini map)' },
  { re: /^(Resource not found|File is not found|File not found|Resource file '.*' read error)/i, code: 'LOG_MISSING_FILE', row: 'VFS-35', cause: 'mesh/volume/animation/material/file named by a .def/.mdl is not in the vfs: check exact name + case, or a deleted base file', path: true },
  { re: /^unknown sound file '([^']*)'/i, code: 'LOG_MISSING_FILE', row: 'LOG-05', cause: 'sound folder missing or empty, no aliases: sound is silent. Add pak content or fix the name', rt: true, soundPath: true },
  { re: /^Join: accepted/i, code: 'LOG_BENIGN', sev: 'i', cause: 'lobby join notice: ignore' },
  { re: /^Media file ".*" not found/i, code: 'LOG_BENIGN', sev: 'i', cause: 'map has no voice-over story: ignore' },
  { re: /^MediaManager: can't open MSS media stream/i, code: 'LOG_BENIGN', sev: 'i', cause: 'music stream did not open: expected under -nosound (no driver); with sound on, check the file' },
  { re: /^No active entity!/i, code: 'LOG_BENIGN', sev: 'i', cause: 'manual-control command with no unit: dropped' },
  { re: /^Can't preload the/i, code: 'LOG_WARN', row: 'LOG-05', cause: 'lobby roster names a breed/entity that does not exist: unit loads on demand or is not buyable' },
  { re: /^Unread data detected/i, code: 'LOG_WARN', row: 'LOG-16', cause: 'MP unit value has trailing data (wrong separator/extra token); extra dropped. Lobby reads roster twice: counts double', lobby: true },
  { re: /^Unknown ability/i, code: 'LOG_WARN', cause: 'ability named in data with no base here: units lose it, no message in play' },
  { re: /^Unknown props : "crater big"/i, code: 'LOG_BENIGN', sev: 'i', cause: 'known noise' },
  { re: /^Unknown props/i, code: 'LOG_WARN', cause: 'props/tags no interaction script handles: leftover tags or typo' },
  { re: /^Bone .* not found in|^Can't find bone|bone '.*' has no broken view|no ".*" bones in|^component '.*' not found|^Can't find component|^Component ".*" not found/i, code: 'LOG_WARN', row: 'LOG-05', rt: true, cause: 'model lacks a bone/component the data names (common after model swap): modifier ignored / shots from origin / no wreck view' },
  { re: /^Undefined material/i, code: 'LOG_WARN', rt: true, cause: 'volume without armor material on a non-_x entity: no armor behaviour' },
  { re: /^Unknown material/i, code: 'LOG_WARN', cause: 'material not in set/material.set' },
  { re: /^Invalid ricochet angle/i, code: 'LOG_WARN', cause: 'ricochet {angle {in out}} with out > in; clamped, cosmetic: fix out <= in in set/material.set' },
  { re: /^unknown volume thickness/i, code: 'LOG_WARN', rt: true, cause: 'thickness trace found nothing (grazing/odd volume); falls back to volume {thickness}. Repeats for one unit: check its .vol' },
  { re: /^Incorrect thickness for volume/i, code: 'LOG_WARN', rt: true, cause: 'able bullet/blast volume with zero thickness on a side' },
  { re: /^Using bump material on non-bump geometry/i, code: 'LOG_WARN', cause: 'mesh lacks tangents but .mtl has bump: remove bump or re-export mesh (vanilla sdkfz251_d.mdl always logs it)', vanillaNoise: /sdkfz251_1/ },
  { re: /^Localization key redefinition/i, code: 'LOG_BENIGN', sev: 'i', cause: 'duplicate .lng key, later wins; #editor.lng gives ~5-10 always' },
  { re: /^Mission .* is skipped/i, code: 'LOG_BENIGN', sev: 'i', cause: 'mission title not a registered game type: not in lobby; lobby builds list twice', lobby: true },
  { re: /^Entity redefinition/i, code: 'LOG_BENIGN', sev: 'i', cause: 'two .def with one title; first wins' },
  { re: /^Automatic MIP generation not supported|No MIP levels/i, code: 'LOG_BENIGN', sev: 'i', cause: 'texture not pre-mipped: perf only' },
  { re: /^No obstacle ID/i, code: 'LOG_BENIGN', sev: 'i', cause: 'wreck/prop with obstacle but no id: ignore' },
  { re: /^unknown terrain_pp type/i, code: 'LOG_BENIGN', sev: 'i', cause: 'older vanilla pather.set type: ignore' },
  { re: /^'use_blend_tex' is not supported/i, code: 'LOG_BENIGN', sev: 'i', cause: 'removed key in construction interaction: ignore' },
];
// GoH only, checked before RULES (texts from gohweb [V] and a vanilla GoH game.log [V])
const GOH_RULES = [
  { re: /^Incorrect color definition/i, code: 'LOG_BENIGN', sev: 'i', cause: 'GoH baseline noise (LOG-22): ignore' },
  { re: /^Failed to delete .*previews\/.*error 3/i, code: 'LOG_BENIGN', sev: 'i', cause: 'GoH Workshop preview cleanup, baseline noise (LOG-22): ignore' },
  { re: /^Skipping broken shader cache file/i, code: 'LOG_BENIGN', sev: 'i', cause: 'GoH shader cache entry rebuilt: first start after an update, perf only' },
  { re: /^No valid ev\.actor in eGenericCombatGame::HandleStatsEvent/i, code: 'LOG_BENIGN', sev: 'i', cause: 'GoH stats event with no actor, logged on bot purchases in vanilla play: ignore' },
  { re: /^(Warning: invalid mod folder name|Warning: empty mod\.info file found|Warning: failed to load mod|Warning! Duplicate mod found)/i, code: 'LOG_MOD_LOAD', row: 'GHLOG-16', cause: 'GoH mod scan skipped or doubted a mod folder: fix the folder name (ASCII, no spaces), its mod.info, or remove the duplicate' },
  { re: /^Attempted to add task to null object/i, code: 'LOG_WARN', row: 'GHLOG-10', cause: 'GoH event scheduler got a null listener: a script or entity scheduled work on something already gone' },
];
// GoH LogError codes -> outcome (GHLOG-10 [V])
const GOH_CODES = { 1: 'APP_ERROR: raised, minidump + crash report', 2: 'exit at once, no box, no dump', 3: 'APP_SDL_ERROR: SDL parse error, minidump + crash report', 4: 'out of memory: Error box, exit 2, no dump', 5: 'signature check failed: Error box, exit 2, no dump', 6: 'APP_OOS_ERROR: out of sync, minidump + crash report', 7: 'DirectX error: exit at once, no box, no dump (silent exit without minidump = DirectX)' };
const GOH_CODE_RE = /0x0bad000([1-7])\b/i;
const GOH_STAMP = /^\[(\d\d:\d\d:\d\d)\] ?/;
const GOH_MARK = /^\[\d\d:\d\d:\d\d\] (?:CMD ?[:=] .*call_to_arms\.exe|Product: CALL TO ARMS|Mount package .* with \d+ entries|Mod: (?:applying mods|activate mod|disable mod)|Steam Application ID: 400750\b)/i;
// GoH log? first 150 lines (the marks sit at the top: Steam id, mod scan, Mount package)
function isGohLog(lines) { for (let i = 0; i < lines.length && i < 150; i++) if (GOH_MARK.test(lines[i])) return true; return false; }
const GOH_WORD = /\b(error|warning|failed|failure|not found|can't|cannot|unable|unknown|invalid|incorrect|missing|undefined)\b/i;
const FATAL_CAUSE = [
  [/define not found/i, 'call to ("name" ...) with no visible (define "name" ...): defines are scoped to the top-level file chain; add define / include its file / rename'],
  [/unexpected token/i, 'parser expected another token type: missing bone/volume after model swap, missing/extra } or ), number where string expected; diff vs working sibling'],
  [/signature mismatch|Not SDL file/i, 'SDL file outer block name must equal file title: stray/non-ASCII byte or wrong first block name at file start'],
  [/Nested mods/i, '(mod "mp" ...) inside another (mod ...)'],
  [/expected!|' required|Invalid block identifier|End of SDL file/i, 'malformed SDL (brace/paren/token type) near the file+line shown'],
  [/Bone modifiers must/i, '{bone "x"} block placed before {skeleton}/model line: move below'],
  [/pattern not found/i, '{from "pattern X"}: base pattern undefined (define in folder .presets or fix name)'],
  [/Unknown material/i, 'material not in set/material.set'],
  [/Resource not found|File is not found|File not found|read error/i, 'resource named by data missing in vfs: check name/case; deleted base file (VFS-35)'],
  [/Unknown control panel item/i, ' same text as the panel warning but fatal (LOG-09): remove the item from the minimap panel list'],
  [/Extender not found|collider .* not found|next state not found/i, 'entity/collider/FSM reference to something missing'],
  [/Invalid block in \.VOL|unknown chunk in animation|Unsupported animation version|At least one frame|Animated bones count|Zero speed in ik-bone|Not invertable volume|Unknown view|Invalid animation file/i, 'corrupt or wrong-format model/animation data'],
];
const CRASH_FN = [
  [/eCannonExtender/, 'towed-gun weapon/ammo: reload on null ammo/stuff (look for No Stuff / ammo-name mismatch on towed gun, howitzer shell)'],
  [/eAmmo::Reload/, 'reload on null ammo/stuff (No Stuff found above?)'],
  [/eActor::Quant/, 'human sensor/vision path: soldier with incomplete breed/vision data (buy squads one at a time to bisect)'],
  [/eChassis/, 'wheels/tracks data'],
  [/eGameEntityArmor/, 'damage/armor path'],
  [/eSDLReader/, 'SDL parse (see ERROR_MSG form)'],
];

const rel = (a, b) => path.relative(a, b).replace(/\\/g, '/');
const readLog = f => fs.readFileSync(f).toString('latin1').split(/\r?\n/);

// ---- log parser: one log file -> { lines, header, phases, events, exceptions }
// opt.goh: true = GoH form, false = AS2 form, undefined = from the log's own marks (isGohLog)
function parseLog(f, opt = {}) {
  const lines = readLog(f);
  if (opt.goh != null ? opt.goh : isGohLog(lines)) return parseGohLog(f, lines);
  const L = { file: f, lines, header: { mods: [] }, phases: [], events: [], exceptions: [], syncLines: 0, lua: [], shadowed: [], modMode: [] };
  let phase = 'startup', inExc = false;
  const TS = /\[(\d\d:\d\d:\d\d)\] /g;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i], n = i + 1;
    { const lm = ln.match(/(?:^|\] )\[LUA\] (.*)/); if (lm) { L.lua.push({ line: n, text: lm[1], dbg: /^DBG:/.test(lm[1]) }); continue; } }
    { const mm = ln.match(/made for (\w+) mode.*not applied/i); if (mm) { L.modMode.push({ line: n, mode: mm[1], text: ln.replace(/^.*?\] /, '').trim() }); continue; } }
    if (/is an old copy of a Workshop item/.test(ln)) {
      const sm = ln.match(/Mod '(.*?)'/);
      if (sm && !/^Mod '.*?' from/.test(ln)) L.shadowed.push({ line: n, name: sm[1] });
      else if (sm) { L.header.mods.push({ name: sm[1], from: ln }); L.shadowed.push({ line: n, name: sm[1] }); }
      else L.shadowed.push({ line: n, name: L.header.mods.length ? L.header.mods[L.header.mods.length - 1].name : '?' });
      continue;
    }
    if (/^(SyncFile |Result is :|Sync Done|Attempting to synchronize|Loading profile )/.test(ln)) { L.syncLines++; continue; }
    if (/\*{5,} Exception \*{5,}/.test(ln)) { i = parseException(L, lines, i); continue; }
    let m;
    if ((m = ln.match(/^Phase (.*?) took ([\d.]+)ms\./))) { L.phases.push({ name: m[1], ms: +m[2], line: n }); phase = m[1]; continue; }
    if ((m = ln.match(/^Product: (.*)/))) L.header.product = m[1];
    else if ((m = ln.match(/^Build: (.*)/))) L.header.build = m[1];
    else if ((m = ln.match(/Repository: (\d+) resources/))) L.header.repo = +m[1];
    else if ((m = ln.match(/^CMD: (.*)/))) L.header.cmd = m[1];
    else if ((m = ln.match(/^Mod '(.*?)' from (.*)/))) L.header.mods.push({ name: m[1], from: m[2].trim() });
    else if ((m = ln.match(/^(\d+) mods$/))) L.header.modCount = +m[1];
    // timestamped messages; chat/damage text may be glued in front or between ([hh:mm:ss] inside a line)
    TS.lastIndex = 0;
    const marks = []; let t;
    while ((t = TS.exec(ln))) marks.push({ at: t.index, end: TS.lastIndex, ts: t[1] });
    marks.forEach((mk, k) => {
      let msg = ln.slice(mk.end, k + 1 < marks.length ? marks[k + 1].at : ln.length).replace(/\s+$/, '');
      const ev = { line: n, ts: mk.ts, phase, msg, thread: null, where: null, glued: mk.at > 0 || k + 1 < marks.length };
      const w = msg.match(/^(.*?) \(([^()]*?), (\d+)\)(?: @ \[(\w+)\])?$/);
      if (w) { ev.msg = w[1]; ev.where = w[2]; ev.srcLine = +w[3]; ev.thread = w[4] || null; }
      else { const th = msg.match(/^(.*?) @ \[(\w+)\]$/); if (th) { ev.msg = th[1]; ev.thread = th[2]; } }
      ev.isEngine = !!ev.where && !ev.where.includes('/') && /\.(cpp|h|hpp|inl)$/i.test(ev.where);
      L.events.push(ev);
    });
  }
  return L;
}

// GoH: every line "[hh:mm:ss] text" (GHLOG-07). L.lines = the lines with the stamp cut (so line regexes work as on AS2), L.stamps = the stamps.
// L.goh = true, L.exe from CMD, L.header.mods = the mods of the last "Mod: applying mods" round (activate lines), header.applied = such a round
// was seen, header.disabled, header.packages (Mount package count), header.available (Found N available mods); L.status = status lines;
// L.evt = [EVT] lines; L.codes = [{line, n, text}] GoH LogError codes outside an Exception block.
function parseGohLog(f, raw) {
  const lines = [], stamps = [];
  for (const r of raw) { const m = GOH_STAMP.exec(r); stamps.push(m ? m[1] : null); lines.push(m ? r.slice(m[0].length) : r); }
  const L = { file: f, goh: true, lines, stamps, header: { mods: [], disabled: [], packages: 0, available: null, applied: false }, phases: [], events: [], exceptions: [], syncLines: 0, lua: [], shadowed: [], modMode: [], status: 0, evt: 0, codes: [] };
  let phase = 'startup';
  const isEnd = ln => /@ \[\w+\]\s*$/.test(ln) || /^(Phase |GameThread|GUI: |Mod: )/.test(ln);
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i], n = i + 1, ts = stamps[i];
    let m;
    if ((m = ln.match(/^\[LUA\] (.*)/))) { L.lua.push({ line: n, text: m[1], dbg: /^DBG:/.test(m[1]) }); continue; }
    if (/^\[EVT\] /.test(ln)) { L.evt++; continue; }
    if (/^(SyncFile[: ]|Result is :|Sync Done|Attempting to synchronize|Loading profile )/.test(ln)) { L.syncLines++; continue; }
    if (/\*{5,} Exception \*{5,}/.test(ln)) { i = parseException(L, lines, i, isEnd); continue; }
    if ((m = ln.match(/^Phase (?:<[^>]*>)*(.*?) took ([\d.]+)ms\./))) { L.phases.push({ name: m[1], ms: +m[2], line: n }); phase = m[1]; continue; }
    if ((m = ln.match(/^Product: (.*)/))) { L.header.product = m[1].trim(); continue; }
    if ((m = ln.match(/^Build: (.*)/))) { L.header.build = m[1].trim(); continue; }
    if ((m = ln.match(/^CMD ?[:=] (.*)/))) { L.header.cmd = m[1].trim(); continue; }
    if ((m = ln.match(/Repository: (\d+) resources/))) { L.header.repo = +m[1]; continue; }
    if ((m = ln.match(/^Mount package (.*) with (\d+) entries/))) { L.header.packages++; continue; }
    if ((m = ln.match(/^Found (\d+) available mods/))) { L.header.available = +m[1]; continue; }
    if (/^Mod: applying mods\s*$/.test(ln)) { L.header.applied = true; L.header.mods = []; L.header.disabled = []; continue; }
    if ((m = ln.match(/^Mod: activate mod (.+?)\s*$/))) { L.header.applied = true; L.header.mods.push({ name: m[1], from: 'Mod: activate mod', line: n }); continue; }
    if ((m = ln.match(/^Mod: disable mod (.+?)\s*$/))) { L.header.disabled.push(m[1]); continue; }
    if ((m = ln.match(GOH_CODE_RE))) { L.codes.push({ line: n, n: +m[1], text: ln.trim() }); continue; }
    let msg = ln.replace(/\s+$/, '');
    if (!ts || !msg.trim()) { L.status++; continue; }
    const bang = /^!!! ?/.test(msg);
    if (bang) msg = msg.replace(/^!!! ?(?:(?:WARNING|ERROR)!?:? )?/i, '');
    const w = msg.match(/^(.*?) \(([^()]*?)(?:, |:)(\d+)\)(?: @ \[(\w+)\])?$/);
    const th = !w && msg.match(/^(.*?) @ \[(\w+)\]$/);
    const ev = { line: n, ts, phase, msg, thread: null, where: null, glued: false, level: bang ? 'warning' : null };
    if (w) { ev.msg = w[1]; ev.where = w[2]; ev.srcLine = +w[3]; ev.thread = w[4] || null; }
    else if (th) { ev.msg = th[1]; ev.thread = th[2]; }
    if (!(w || th || bang || GOH_WORD.test(ev.msg) || classify(ev, true))) { L.status++; continue; }
    ev.isEngine = !!ev.where && !ev.where.includes('/') && (/\.(cpp|h|hpp|inl)$/i.test(ev.where) || /:\d+\)/.test(msg.slice(ev.msg.length)));
    L.events.push(ev);
  }
  const cmdExe = (L.header.cmd || '').match(/([\w.-]+)\.exe/i);
  L.exe = cmdExe ? cmdExe[1].toLowerCase() : null;
  return L;
}

function parseException(L, lines, i, isEnd) {
  const ex = { line: i + 1, msg: '', where: null, srcLine: 0, thread: null, kind: 'error', task: [], file: null, fileLine: null, stack: [], at: null, fn: null, code: null };
  let j = i + 1;
  while (j < lines.length && lines[j].trim() === '') j++;
  if (/^Program will be terminated/.test(lines[j] || '')) {
    ex.kind = 'crash'; j++;
    while (j < lines.length && lines[j].trim() === '') j++;
    ex.code = (lines[j] || '').trim(); j++;
    for (; j < lines.length && j < i + 12; j++) {
      const m = lines[j].match(/^At (\S+?) \((.*?)(?:\+0x[0-9a-f]+)?, ([^,)]+):(\d+)\)(?: \[(\w+)\])?/i);
      if (m) { ex.at = m[1]; ex.fn = m[2]; ex.where = m[3]; ex.srcLine = +m[4]; ex.thread = m[5] || null; break; }
    }
  } else {
    const m = (lines[j] || '').match(isEnd ? /^(.*?) \(([^()]*?)(?:, |:)(\d+)\)(?: @ \[(\w+)\])?\s*$/ : /^(.*?) \(([^()]*?), (\d+)\)(?: @ \[(\w+)\])?\s*$/);
    ex.msg = m ? m[1] : (lines[j] || '').trim();
    if (m) { ex.where = m[2]; ex.srcLine = +m[3]; ex.thread = m[4] || null; }
  }
  // scan the rest of the block (until next timestamped/phase line or end of call stack)
  let k = j, inStack = false;
  for (; k < lines.length; k++) {
    const ln = lines[k];
    if (isEnd ? (isEnd(ln) && k > j) || k - i > 400 : /^\[\d\d:\d\d:\d\d\] /.test(ln) || /^Phase /.test(ln)) break;
    let m;
    if (/^Call stack/.test(ln)) { inStack = true; continue; }
    if (inStack) { if ((m = ln.match(/^\s*#\d+ (\S+?)\+0x[0-9a-f]+ \((.*?)(?:\+0x[0-9a-f]+)?(?:, ([^,)]+):(\d+))?\)/))) ex.stack.push({ mod: m[1], fn: m[2], src: m[3] || null, line: m[4] ? +m[4] : 0 }); else if (ln.trim() === '') { if (ex.stack.length) break; } continue; }
    if (/^>{2,}/.test(ln) && ex.kind === 'crash') continue;
    if ((m = ln.match(/^> file "([^"]+)"/))) { ex.file = m[1]; const nx = (lines[k + 1] || '').match(/^(\d+):/); if (nx) ex.fileLine = +nx[1]; }
    else if (/^>>? /.test(ln)) ex.task.push(ln.replace(/^>+ /, ''));
  }
  ex.endLine = k;
  L.exceptions.push(ex);
  return k - 1;
}

// ---- classification
function classify(ev, goh) {
  if (goh) for (const r of GOH_RULES) if (r.re.test(ev.msg)) return r;
  for (const r of RULES) if (r.re.test(ev.msg)) return r;
  return null;
}
const dataPath = ev => {
  const w = ev.where && !ev.isEngine ? ev.where : null;
  if (w) return w;
  const m = ev.msg.match(/(?:not found|read error|is not found)\s*-?\s*(\/?[^\s'"]+\.\w+)/i);
  return m ? m[1] : null;
};
function toKey(p) {
  p = p.toLowerCase().replace(/\\/g, '/');
  const i = p.indexOf('/resource/');
  if (i >= 0) return p.slice(i + 1);
  return 'resource/' + p.replace(/^\/+/, '');
}

function makeModProbe(o) {
  if (!o.mod) return null;
  const sdlset = require('../lib/sdlset');
  let mods = o.mods;
  const src = sdlset.createSource({ gameDir: o.gameDir, mods, folder: o.mod, exe: o.exe });
  return key => {
    // data paths like /entity/x/y.def/y.mdl: try the key, then shorter prefixes
    const parts = key.split('/');
    for (let n = parts.length; n >= 2; n--) {
      const k = parts.slice(0, n).join('/');
      if (src.local.has(k)) return { hit: k, how: 'mod folder' };
      if (src.v && src.isModKey(k)) return { hit: k, how: 'mod layer ' + src.v.files.get(k).layer };
    }
    return null;
  };
}

function modNote(probe, p, wantMissing) {
  if (!probe || !p) return '';
  const key = toKey(p);
  const h = probe(key);
  if (h) return ` [mod supplies ${h.hit} via ${h.how}]`;
  return wantMissing ? ` [mod does NOT supply it: add <mod>/${key}]` : ' [path not in mod: vanilla/other mod]';
}

// ---- one log -> groups
function triage(L, label, rep, o, probe, sink) {
  const groups = new Map();
  const add = (key, ev, r) => {
    let g = groups.get(key);
    if (!g) groups.set(key, g = { key, r, n: 0, first: ev, last: ev, tsMin: ev.ts, tsMax: ev.ts, phases: new Set() });
    g.n++; g.last = ev; g.tsMax = ev.ts; g.phases.add(ev.phase);
    return g;
  };
  for (const ev of L.events) {
    const r = classify(ev, L.goh);
    if (!r) { add('U|' + ev.msg, ev, null); continue; }
    if (r.sev === 'i') add('B|' + r.code + '|' + r.re, ev, r);   // noise aggregates per rule
    else add('A|' + r.code + '|' + ev.msg + '|' + (ev.where || ''), ev, r);
  }
  const phaseInfo = L.phases.map(p => `${p.name} ${Math.round(p.ms)}ms`).join('; ');
  const h = L.header;
  const hdr = [];
  if (L.goh) {
    hdr.push(`${label}: Gates of Hell log, ${L.lines.length} lines (every line stamped [hh:mm:ss], stamp cut before the rules, GHLOG-07), ${L.events.length} messages, ${L.status} status lines not counted, ${L.syncLines} profile-sync lines filtered`);
    if (h.product) hdr.push(`  ${h.product} | build ${h.build || '?'}`);
    if (L.phases.length) hdr.push(`  phases: ${phaseInfo}`);
    hdr.push(`  mod scan: ${h.available == null ? '?' : h.available} available, ${h.packages} packages mounted (Mount package lines); ` + (h.mods.length ? `mods activated (${h.mods.length}): ${h.mods.map(m => m.name).join(', ')} (Mod: activate mod, GHLOG-16)` : h.applied ? 'no mod activated in the last "Mod: applying mods" round (GHLOG-16)' : 'no "Mod: applying mods" line: no mod identity in this log'));
    if (L.evt) hdr.push(`  ${L.evt} [EVT] event lines (kills, flags, zones) not counted`);
  } else {
  hdr.push(`${label}: ${L.lines.length} lines, ${L.events.length} timestamped messages, ${L.syncLines} profile-sync lines filtered (LOG-15)`);
  if (h.product) hdr.push(`  ${h.product} | build ${h.build || '?'} | Repository ${h.repo == null ? '?' : h.repo} resources`);
  if (L.phases.length) hdr.push(`  phases: ${phaseInfo}. Phase lines print after data-load warnings: warning position says nothing about vanilla vs mod, use the file path (LOG-03); phase time varies w/ cache, not a mod-count signal (LOG-18)`);
  if (h.mods.length) hdr.push(`  mods named in header (${h.mods.length}): ${h.mods.map(m => m.name).join(', ')}; the Mount phase line itself never names a mod (LOG-02)`);
  else hdr.push('  no mod identity in this log (LOG-02): judge a warning by the path in parentheses; verify mods via options.set {mods');
  }
  const nd = L.lua.filter(x => !x.dbg).length;
  if (L.lua.length) hdr.push(`  [LUA] section: ${L.lua.length} lines (${L.lua.length - nd} DBG: noise, ${nd} shown as LOG_LUA info); --lua prints them only`);
  sink.header.push(...hdr);
  for (const x of L.lua) sink.lua.push({ file: label, line: x.line, text: x.text, dbg: x.dbg });
  for (const x of L.lua) if (!x.dbg) rep.info(label, x.line, 'LOG_LUA', '[LUA] ' + x.text);
  // LOG-17: Workshop copies shadow local mod folders
  const shadowN = {}; for (const x of L.shadowed) shadowN[x.name] = (shadowN[x.name] || 0) + 1;
  for (const x of L.shadowed.filter((y, i, a) => a.findIndex(z => z.name === y.name) === i)) rep.info(label, x.line, 'LOG_MOD_SHADOWED', `mod '${x.name}'${shadowN[x.name] > 1 ? ' x' + shadowN[x.name] : ''}: local folder is an old copy of a Workshop item, the Workshop one is loaded instead; safe to delete the local copy (LOG-17)`);
  // ENG-26: mode-mismatch mods skipped at startup
  for (const x of L.modMode) rep.add(label, x.line, 'LOG_MOD_MODE', `${x.text}: listed mod fails FitsMode (legacy mod with as64+, modern without) and is NOT applied; if a fatal 'Unable to determine fallback font' follows, fix mod.info Min or drop it from the list (ENG-26)`);
  const cmdExe = (h.cmd || '').match(/([\w.-]+)\.exe/i);
  L.exe = cmdExe ? cmdExe[1].toLowerCase() : null;

  const noteLoc = (g) => g.first.line;
  const ordered = [...groups.values()].sort((a, b) => a.first.line - b.first.line);
  const byPhase = {};
  for (const g of ordered) {
    const r = g.r, ev = g.first;
    const cnt = g.n > 1 ? ` x${g.n}` : '';
    const when = g.n > 1 && g.tsMin !== g.tsMax ? ` [${g.tsMin}..${g.tsMax}]` : ` [${ev.ts}]`;
    const ph = [...g.phases].join('/');
    const p = dataPath(ev);
    if (!r) { rep.info(label, ev.line, 'LOG_UNCLASSIFIED', `${ev.msg}${ev.where ? ' (' + ev.where + ')' : ''}${cnt}${when} new/unknown message type: compare with baseline (new type = your latest change)`); continue; }
    sink.groups.push({ file: label, line: ev.line, code: r.code, count: g.n, msg: ev.msg, where: ev.where, row: r.row || null, phase: ph });
    if (r.sev === 'i') {
      const sub = [...new Set(L.events.filter(e => r.re.test(e.msg)).map(e => e.msg))].length;
      rep.info(label, ev.line, r.code, `${r.re.source.slice(0, 40)}...: ${g.n} lines (${sub} distinct)${when} ${r.cause}${r.lobby && g.n > 1 ? ' (lobby builds list twice: LOG-16)' : ''}`);
      continue;
    }
    if (r.vanillaNoise && r.vanillaNoise.test(ev.where || '')) { rep.info(label, ev.line, 'LOG_BENIGN', `${ev.msg} (${ev.where})${cnt}: vanilla noise`); continue; }
    let msg = `${ev.msg}${ev.where ? ' (' + ev.where + (ev.isEngine ? (L.goh ? ':' + ev.srcLine : '') : ', ' + ev.srcLine) + ')' : ''}${cnt}${when} ${r.cause}`;
    if (r.row) msg += ` (${r.row})`;
    if (ev.isEngine) msg += L.goh ? ` [engine emitter ${ev.where}:${ev.srcLine} of the GoH build${h.build ? ' ' + h.build.split(' - ')[0] : ''} (GHLOG-09)]` : ` [engine emitter ${ev.where}: line from 3.262 build, match by text (LOG-04)]`;
    if (r.rt || ev.thread === 'quant') msg += ' [runtime @ quant: no unit name, match timestamp to your action (LOG-05)]';
    let np = r.soundPath ? null : p;
    if (r.path || (np && probe)) msg += modNote(probe, np, !!r.path);
    if (r.lobby && g.n > 1) msg += ' [lobby duplicate: count doubles (LOG-16)]';
    rep.add(label, ev.line, r.code, msg);
    // pending LOG_PANEL_ITEM under minimap = fatal handled in exception
  }
  // lobby duplicate info (LOG-16): the Mission skipped group appears twice
  const ms = L.events.filter(e => /^Mission .* is skipped/.test(e.msg));
  if (ms.length) {
    const t = {}; for (const e of ms) t[e.msg] = (t[e.msg] || 0) + 1;
    const dup = Object.values(t).filter(c => c > 1).length;
    if (dup) rep.info(label, ms[0].line, 'LOG_LOBBY_DUP', `${dup} of ${Object.keys(t).length} Mission-skipped lines appear 2+ times: lobby builds the map list twice, halve counts (LOG-16)`);
  }
  // exceptions
  for (const ex of L.exceptions) emitException(L, ex, label, rep, o, probe, sink);
  // GoH LogError codes on a plain line (GHLOG-10)
  for (const c of L.codes || []) {
    rep.add(label, c.line, 'LOG_CRASH', `GoH error code 0x0bad000${c.n}: ${GOH_CODES[c.n]} (GHLOG-10). Line: ${c.text.slice(0, 200)}`);
    sink.groups.push({ file: label, line: c.line, code: 'LOG_CRASH', count: 1, msg: '0x0bad000' + c.n, row: 'GHLOG-10' });
  }
}

function recentWarnings(L, ex, rep) {
  // last actionable (non-noise) groups before the exception line, nearest first
  const seen = new Set(), out = [];
  for (let i = L.events.length - 1; i >= 0 && out.length < 3; i--) {
    const e = L.events[i];
    if (e.line > ex.line) continue;
    const r = classify(e, L.goh);
    if (!r || r.sev === 'i') continue;
    const k = r.code + e.msg;
    if (seen.has(k)) continue;
    seen.add(k); out.push(`${e.msg}${e.where && !e.isEngine ? ' (' + e.where + ')' : ''}`);
  }
  return out;
}

function emitException(L, ex, label, rep, o, probe, sink) {
  const emit = ex.stack.find(f => f.src && !/LogError|RaiseAppError|RaiseException/.test(f.fn));
  if (ex.kind === 'crash') {
    const cause = (CRASH_FN.find(([re]) => re.test(ex.fn || '')) || [null, 'faulting function names the subsystem; tiny address = null deref = a referenced thing does not exist'])[1];
    const addr = (ex.code.match(/0x0*([0-9a-f]+)/i) || [])[1];
    const nul = addr && parseInt(addr, 16) < 0x1000 ? ' (tiny address 0x' + addr + ' = null deref: something referenced does not exist)' : '';
    const rw = recentWarnings(L, ex);
    const gc = L.goh && GOH_CODE_RE.exec(ex.code || '');
    rep.add(label, ex.line, 'LOG_CRASH', `${ex.code}${gc ? ' (GoH 0x0bad000' + gc[1] + ': ' + GOH_CODES[gc[1]] + ', GHLOG-10)' : ''}${nul} at ${ex.fn} (${ex.where}:${ex.srcLine}, newer src build: name the function only, LOG-04) [${ex.thread || '?'}]; ${cause}. Last actionable warnings above: ${rw.length ? rw.join(' | ') : 'none'}. Sidecar .mdmp.log has the same text`);
    sink.groups.push({ file: label, line: ex.line, code: 'LOG_CRASH', count: 1, msg: ex.code, fn: ex.fn });
    return;
  }
  const sdl = SDL_ERR.test(ex.msg), missing = /Resource not found|File is not found|File not found|read error/i.test(ex.msg);
  const modInfo = /mod\.info/i.test(ex.file || '') && /Block terminator expected/i.test(ex.msg);
  const font = /Unable to determine fallback font/i.test(ex.msg);
  const code = modInfo ? 'LOG_MOD_INFO_ERROR' : font ? 'LOG_FALLBACK_FONT' : missing ? 'LOG_MISSING_FILE' : sdl ? 'LOG_SCRIPT_ERROR' : /Unknown control panel item/.test(ex.msg) ? 'LOG_PANEL_ITEM' : 'LOG_ERROR_MSG';
  const cause = modInfo ? 'mod.info has a malformed block (missing/extra brace or token): engine exits 1 before any pipe, testrun reports TESTRUN_ENGINE_EXCEPTION (ENG-25); fix the file named in the > file line' : font ? 'fatal at fonts load, no pipe reply; usually a mode-mismatch mod skipped just before (see LOG_MOD_MODE): fix mod.info Min or the list (ENG-26)' : (FATAL_CAUSE.find(([re]) => re.test(ex.msg)) || [null, 'non-continuable ERROR_MSG: parse/resource error cannot be skipped'])[1];
  const f = ex.file;
  let at = f ? ` in ${f}${ex.fileLine ? ' near line ' + ex.fileLine : ''}` : '';
  let note = f ? modNote(probe, f, false) : '';
  const rw = recentWarnings(L, ex);
  const mp = ex.msg.match(/(?:not found|read error|is not found)\s*-?\s*(\S+)/i);
  if (missing && mp && probe) note += modNote(probe, mp[1], true);
  rep.add(label, ex.line, code, `FATAL ERROR_MSG (game ends, LOG-06): ${ex.msg}${at}; emitter ${ex.where || '?'}${emit ? ' via ' + emit.fn : ''}${ex.task.length ? '; task ' + ex.task[0] : ''}. ${cause}${note}. Last actionable warnings above: ${rw.length ? rw.join(' | ') : 'none'}`);
  sink.groups.push({ file: label, line: ex.line, code, count: 1, msg: ex.msg, file2: f, row: 'LOG-06' });
}

// ---- dumps
const fmtTime = d => d.toISOString().replace('T', ' ').slice(0, 19);
function minidumps(dir, label, rep, mainLog, sink, o) {
  const md = path.join(dir, 'minidumps');
  if (!fs.existsSync(md)) return;
  const ents = fs.readdirSync(md).filter(n => /\.mdmp(\.log)?$/i.test(n)).map(n => ({ n, st: fs.statSync(path.join(md, n)) }));
  const dumps = ents.filter(e => /\.mdmp$/i.test(e.n) && !(o.since && e.st.mtimeMs < o.since)).sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
  if (!dumps.length) return;
  let mainText = null;
  try { mainText = fs.readFileSync(mainLog); } catch (e) { /* none */ }
  rep.info('minidumps', 0, 'LOG_DUMP', `${dumps.length} minidump(s); newest first (small dump: no heap/paths, read the .mdmp.log sidecar, LOG-10)`);
  for (const d of dumps.slice(0, o.keep)) {
    const side = ents.find(e => e.n === d.n + '.log');
    rep.info('minidumps/' + d.n, 0, 'LOG_DUMP', `${fmtTime(d.st.mtime)} ${(d.st.size / 1048576).toFixed(1)} MB${side ? ', sidecar ' + side.st.size + ' B' : ', no sidecar'}`);
    sink.dumps.push({ name: d.n, mtime: fmtTime(d.st.mtime), size: d.st.size, sidecar: !!side });
    if (!side) continue;
    const sp = path.join(md, side.n);
    if (mainText && fs.readFileSync(sp).equals(mainText)) { rep.info('minidumps/' + side.n, 0, 'LOG_NOTE', 'sidecar identical to game.log (same crash, already triaged above)'); continue; }
    const L = parseLog(sp, { goh: o.gohLog });
    for (const ex of L.exceptions) emitException(L, ex, 'minidumps/' + side.n, rep, o, null, sink);
    if (!L.exceptions.length) rep.info('minidumps/' + side.n, 0, 'LOG_NOTE', 'sidecar has no Exception block');
  }
}

function parseDate(s) { const m = s.match(/^(\d\d)\.(\d\d)\.(\d{4}) (\d\d)\.(\d\d)/); return m ? new Date(Date.UTC(+m[3], m[2] - 1, +m[1], +m[4], +m[5])).getTime() : 0; }
function oos(dir, rep, o, sink) {
  const od = path.join(dir, 'oos');
  if (!fs.existsSync(od)) return;
  if (o.gohLog) {   // GoH OOS dumps have their own form (gohweb "OOS dump"): counted, not read
    const n = fs.readdirSync(od, { withFileTypes: true }).filter(e => e.isDirectory() && !(o.since && fs.statSync(path.join(od, e.name)).mtimeMs < o.since)).length;
    if (n) rep.info('oos', 0, 'LOG_DUMP', `${n} GoH OOS folder(s): the GoH dump form differs from AS2 (source file by name, hex bytes per value), not read here; open the files by hand`);
    return;
  }
  const folders = fs.readdirSync(od, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => ({ n: e.name, t: parseDate(e.name) || fs.statSync(path.join(od, e.name)).mtimeMs })).filter(f => !(o.since && fs.statSync(path.join(od, f.n)).mtimeMs < o.since)).sort((a, b) => b.t - a.t);
  if (!folders.length) return;
  rep.info('oos', 0, 'LOG_DUMP', `${folders.length} OOS folder(s); only host, a desynced client or a flagged master writes, so missing files are normal (LOG-13); tiny files = checksums only, no diff possible (LOG-14)`);
  folders.forEach((f, idx) => {
    const fd = path.join(od, f.n), files = fs.readdirSync(fd).filter(n => fs.statSync(path.join(fd, n)).isFile());
    const rows = [];
    for (const n of files) {
      const p = path.join(fd, n), size = fs.statSync(p).size;
      const fdh = fs.openSync(p, 'r'), b = Buffer.alloc(Math.min(2048, size)); fs.readSync(fdh, b, 0, b.length, 0); fs.closeSync(fdh);
      const t = b.toString('latin1');
      const g = k => (t.match(k) || [])[1];
      rows.push({ n, size, name: g(/name:(.*)/) , ver: g(/, v\.([\d.]+),/), game: g(/, v\.[\d.]+, (\S+?),/), host: g(/, m:(\d)/), q: g(/, q:(\d+)/), crc: g(/\bcrc:\s*(-?\d+)/), crc2: g(/\bcrc2:\s*(-?\d+)/), full: size > 2048 });
    }
    if (!rows.length) return;
    const host = rows.find(r => r.host === '1'), cl = rows.filter(r => r.host === '0');
    let verdict;
    if (host && cl.length) {
      const dc = cl.filter(c => c.crc !== host.crc).length, dc2 = cl.filter(c => c.crc2 !== host.crc2).length;
      verdict = dc2 === 0 && dc ? 'crc2 equal, crc differs: scene diverged, not rules' : dc && dc2 ? 'crc and crc2 both differ' + (rows.every(r => !r.full) ? ' with checksum-only files: suspect mod/pak mismatch, compare Repository: N resources in each game.log header' : '') : 'host and client checksums equal';
      if (rows.some(r => r.full)) verdict += '; full snapshot present: text-diff host vs client, first differing line = diverged entity (compare XRnd Count = random draws, entities.size = one-sided spawn)';
    } else verdict = `no ${host ? 'client' : 'host'} file (normal, LOG-13)`;
    const vers = [...new Set(rows.map(r => r.ver).filter(Boolean))];
    const msg = `${f.n}: ${rows.length} file(s) [${rows.map(r => r.n + (r.host === '1' ? '=host' : r.host === '0' ? '' : '') + ' ' + r.size + 'B').join(', ')}] ${rows[0].game || '?'} q:${rows[0].q || '?'}: ${verdict}`;
    sink.oos.push({ folder: f.n, files: rows.length, verdict });
    if (idx < o.keep) {
      rep.add('oos/' + f.n, 0, 'LOG_OOS', msg + ' (NET-04: desynced clients are removed, snapshot is diagnosis only)');
      if (vers.length > 1) rep.add('oos/' + f.n, 0, 'LOG_OOS_VERSION', `players ran different game versions ${vers.join(' vs ')}: #2 cause of OOS`);
    } else rep.info('oos/' + f.n, 0, 'LOG_OOS', msg);
  });
}

// ---- main
function check(o) {
  const rep = createReport();
  const sink = { header: [], groups: [], dumps: [], oos: [], lua: [] };
  // in-process callers (GUI routes) may pass the game id ('mowas2') or the vfs exe ('mowas_2'): keep the vfs exe from here on
  if (o.exe) { const g = require('../lib/games').get(o.exe); if (g) o.exe = g.exe; }
  let dir, mainLog;
  const st = fs.statSync(o.target);
  if (st.isDirectory()) { dir = o.target; mainLog = path.join(dir, 'game.log'); } else { dir = path.dirname(o.target); mainLog = o.target; }
  const probe = makeModProbe(o);
  o.keep = o.keep || 3;
  const label = rel(dir, mainLog);
  const askGoh = o.gohLog == null && (o.goh || o.exe === 'goh');
  if (fs.existsSync(mainLog)) {
    // --goh / --exe goh: the GoH form unless the log carries an AS2 exe in its CMD line (then the AS2 form and a note, as LOG-20)
    let L = parseLog(mainLog, { goh: o.gohLog });
    const as2Exe = !L.goh && ((L.header.cmd || '').match(/([\w.-]+)\.exe/i) || [])[1];
    if (askGoh && !L.goh && !as2Exe) L = parseLog(mainLog, { goh: true });
    o.gohLog = !!L.goh;
    if (askGoh && !L.goh) rep.info(label, 0, 'LOG_NOTE', `this log was written by ${as2Exe.toLowerCase()}.exe, not call_to_arms.exe: read with the AS2 form`);
    triage(L, label, rep, o, probe, sink);
    sink.mainRepo = L.header.repo; sink.mainExe = L.exe; sink.mainMods = L.header.mods.map(m => m.name).sort();
    if (L.goh) { sink.game = 'goh'; sink.header.push('  GoH game.log is rewritten every launch (LOG-22): copy it before relaunch, or read new lines from an offset; engine (file.cpp:N) lines name the GoH build (GHLOG-09)'); }
    else sink.header.push('  game.log is overwritten every launch (LOG-01): copy it before relaunch; engine (file.cpp, N) lines come from the 3.262 build, match message text not line (LOG-04)');
    // AS64 and MoW:AS2 share one log folder (LOG-20): say when the log was written by the other exe than the one asked for
    if (!L.goh && o.exe && o.exe !== 'goh' && L.exe && L.exe !== o.exe) rep.info(label, 0, 'LOG_NOTE', `this log was written by ${L.exe}.exe, not ${o.exe}.exe: AS64 and MoW:AS2 share one log folder, the last game started wrote it (LOG-20)`);
    if (L.goh && o.exe && o.exe !== 'goh') rep.info(label, 0, 'LOG_NOTE', `this is a Gates of Hell log, not a ${o.exe}.exe one: read with the GoH form`);
  } else { rep.add(label, 0, 'LOG_NO_LOG', 'game.log missing'); if (askGoh) o.gohLog = true; }
  const prev = path.join(dir, 'game.prev.log');
  if (st.isDirectory() && fs.existsSync(prev)) {
    const P = parseLog(prev, { goh: o.gohLog });
    triage(P, 'game.prev.log', rep, o, probe, sink);
    const cm = sink.mainExe;
    if (cm && P.exe && cm !== P.exe) {
      const a = P.header.mods.map(m => m.name).sort().join(','), b = sink.mainMods.join(',');
      rep.info('game.prev.log', 0, 'LOG_EXE_SWITCH', `previous launch ran ${P.exe}.exe, this one ${cm}.exe: profile is shared, enabled-mod list persists across the switch${a === b ? ' (same mods named in both headers)' : ''} (LOG-20)`);
    }
    const cur = sink.mainRepo;
    if (cur != null && P.header.repo != null && cur !== P.header.repo) rep.info('game.prev.log', 0, 'LOG_NOTE', `Repository ${P.header.repo} resources vs ${cur} in game.log: different content/game build between launches`);
  }
  if (st.isDirectory() && !fs.existsSync(prev) && sink.mainExe === 'mowas_2') rep.info(label, 0, 'LOG_PREV_LOST', 'mowas_2.exe truncates game.log at start and writes no game.prev.log: a crash log from the previous run is gone unless copied first (LOG-19)');
  if (st.isDirectory()) { minidumps(dir, label, rep, mainLog, sink, o); oos(dir, rep, o, sink); }
  return { rep, sink };
}

// .lintrc + --format wiring (own arg parser): rc from --rc FILE, else nearest .lintrc walking up from `start`; --no-rc disables
const { rcPrint } = require('../lib/cli');
const userdir = require('../lib/userdir');
const games = require('../lib/games');
// instance 0 + every existing sibling " - instance N" with a log/ dir (userdir.userDir(0) is the base name)
function instanceLogDirs(opt) {
  const base = userdir.userDir(0, opt), out = [];
  if (!base) return out;
  const par = path.dirname(base), nm = path.basename(base);
  const l0 = path.join(base, 'log');
  if (fs.existsSync(l0)) out.push({ inst: 0, dir: l0 });
  const found = [];
  for (const d of fs.readdirSync(par)) {
    const m = d.startsWith(nm + ' - instance ') && /^[0-9]+$/.exec(d.slice((nm + ' - instance ').length));
    if (m && fs.existsSync(path.join(par, d, 'log'))) found.push({ inst: +m[0], dir: path.join(par, d, 'log') });
  }
  return out.concat(found.sort((a, b) => a.inst - b.inst));
}
if (require.main === module) {
  const args = process.argv.slice(2), o = {}, pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--mod') o.mod = args[++i]; else if (a === '--game') o.gameDir = args[++i]; else if (a === '--mods') o.mods = args[++i].split(',').filter(Boolean);
    else if (a === '--json') o.json = true; else if (a === '--rc') o.rcFile = args[++i]; else if (a === '--no-rc') o.noRc = true; else if (a === '--format') o.format = args[++i]; else if (a === '-o') o.output = args[++i]; else if (a === '-q') o.q = true; else if (a === '--summary') o.summary = true; else if (a === '--lua') o.lua = true; else if (a === '--inst') { o.inst = +args[++i]; if (!Number.isInteger(o.inst) || o.inst < 0) { console.error('--inst needs an instance number'); process.exit(2); } } else if (a === '--all-instances') o.allInst = true;
    else if (a === '--exe') { const g = games.get(args[++i]); if (!g) { console.error('--exe needs as64, mowas_2, mowas2 or goh'); process.exit(2); } o.exe = g.exe; }
    else if (a === '--goh') o.exe = 'goh';
    else if (a === '--keep') o.keep = +args[++i]; else if (a === '--since') { const v = args[++i]; o.since = Number.isFinite(+v) ? +v : Date.parse(v); } else pos.push(a);
  }
  o.target = pos[0];
  const udo = process.env.AS2_HOME ? { home: process.env.AS2_HOME, env: process.env } : {};
  const USAGE = 'usage: node tools/logtriage/logtriage.js [<logDir | game.log>] [--inst N | --all-instances] [--exe as64|mowas_2|mowas2|goh | --goh] [--mod <dir>] [--game <dir>] [--mods a,b] [--keep N] [--since ms|ISO] [--json] [-q] [--summary]';
  // numbered instances are AS64's: mowas_2.exe has no -instance (TST-19), GoH keeps one user dir (LOG-22)
  if ((o.allInst || o.inst > 0) && o.exe === 'mowas_2') games.refuse('logtriage', 'mowas2', 'mowas_2.exe has no -instance, so there is no instance log folder; read the main log folder (no --inst, or --inst 0)', 'TST-19');
  if ((o.allInst || o.inst != null) && o.exe === 'goh') games.refuse('logtriage', 'goh', 'Gates of Hell has one user folder and no instances; give no --inst', 'LOG-22');
  if (o.exe === 'goh') {
    if (!o.target) { const g = userdir.gohFind(Object.assign({}, udo)); if (!g.dir) { console.error('logtriage: ' + g.why); process.exit(2); } o.target = path.join(g.dir, 'log'); if (!fs.existsSync(o.target)) { console.error('logtriage: no log folder in the Gates of Hell user folder ' + g.dir + ' (start the game once)'); process.exit(2); } }
    if (o.mod && !o.gameDir) o.gameDir = games.install('goh').dir || undefined;
  }
  if (o.allInst) {   // TST-22: instance 0 + every existing " - instance N" user dir, one run, merged summary
    if (o.target) { console.error(USAGE); process.exit(2); }
    const list = instanceLogDirs(udo);
    if (!list.length) { console.error('no instance log dirs found (Documents/my games/men of war - assault squad 2 [- instance N]/log)'); process.exit(2); }
    const merged = {}, per = [], jsons = [];
    for (const it of list) {
      const oi = Object.assign({}, o, { target: it.dir });
      const { rep, sink } = check(oi);
      for (const [c, n] of Object.entries(rep.counts)) merged[c] = (merged[c] || 0) + n;
      per.push(`instance ${it.inst}: ${rep.count} findings`);
      if (o.json) { const real = console.log; const buf = []; console.log = x => buf.push(x); rep.print({ showInfo: true }); console.log = real; jsons.push({ instance: it.inst, dir: it.dir, header: sink.header, groups: sink.groups, dumps: sink.dumps, oos: sink.oos, lines: buf }); continue; }
      console.log(`=== instance ${it.inst}: ${it.dir} ===`);
      rcPrint(rep, o, it.dir, 'logtriage', { showInfo: !o.q, byCode: true, summary: o.summary });
    }
    if (o.json) console.log(JSON.stringify({ instances: jsons, merged }, null, 1));
    else {
      console.log(`=== merged: ${list.length} instance(s), ${Object.values(merged).reduce((a, b) => a + b, 0)} findings ===`);
      for (const p of per) console.log('  ' + p);
      console.log('by code: ' + JSON.stringify(merged));
    }
    process.exit(0);
  }
  if (!o.target && o.inst != null) { const d = userdir.logDir(o.inst, udo); o.target = d && fs.existsSync(d) ? d : undefined; if (!o.target) { console.error(`no log dir for instance ${o.inst}`); process.exit(2); } }
  if (!o.target || !fs.existsSync(o.target)) { console.error(USAGE); process.exit(2); }
  const { rep, sink } = check(o);
  if (o.lua) {
    if (!sink.lua.length) console.log('# no [LUA] lines');
    else { const nd = sink.lua.filter(x => x.dbg).length; console.log(`# ${sink.lua.length} [LUA] lines (${nd} DBG: noise)`); for (const x of sink.lua) console.log(`${x.file}:${x.line}: [LUA] ${x.text}`); }
    process.exit(0);
  }
  if (o.json) {
    const real = console.log; const buf = []; console.log = s => buf.push(s);
    rep.print({ showInfo: true });
    console.log = real;
    console.log(JSON.stringify(Object.assign(sink.game ? { game: sink.game } : {}, { header: sink.header, groups: sink.groups, dumps: sink.dumps, oos: sink.oos, lines: buf }), null, 1));
  } else {
    if (!o.q) { console.log('# log triage'); for (const h of sink.header) console.log('# ' + h); }
    rcPrint(rep, o, o.target, 'logtriage', { showInfo: !o.q, byCode: true, summary: o.summary });
  }
}
module.exports = { check, parseLog };
