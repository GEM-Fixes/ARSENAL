// botrecipe, the three games (game parity). Made-up fixtures only, no game, no real install:
//  GoH: buy lists script/multiplayer/units/<army>/<stage>.<army>.lua in both vanilla row forms (priority/type and availability/base),
//   with switched-off rows (--[[ ]] blocks, -- lines, ---[[ toggles); --buy-first copies the anchor row; fix mode, --check, --card-like,
//   --cheap and --target refuse with one line (exit 2); --team-mode on a GoH game set; no mod.info for GoH.
//  MoW:AS2: a shared install with as64.exe and mowas_2.exe whose as64/core holds another bot.data.lua: --exe mowas_2 (and --target mowas2)
//   read the base game, --exe as64 and no --exe read as64/core; --exe mowas_2 picks the 3.262 mod.info range.
// Author: Imperator_Aug (ARSENAL, ia-ac235873)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const B = path.join(__dirname, '..', 'botrecipe.js'), W = path.join(__dirname, 'work-games');
let n = 0;
const fail = m => { console.log('FAIL: ' + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); n++; };
const run = (...a) => { const r = cp.spawnSync(process.execPath, [B, ...a], { encoding: 'latin1' }); return { code: r.status, out: r.stdout, err: r.stderr }; };
const put = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s, 'latin1'); };
const rd = p => fs.readFileSync(p, 'latin1');
const J = (...l) => l.join('\r\n') + '\r\n';
fs.rmSync(W, { recursive: true, force: true });

// ---- GoH ----
const U = 'script/multiplayer/units/';
const mid = J(
  'Purchases["mid.ger"] = {',
  '\t{Repeat = 0,  --infinite',
  '\t\tUnits = {',
  '\t\t\t---[====[',
  '\t\t\t\t--[[',
  '\t\t\t\t{priority = 1.0, type = {"Class3", "Tank", "Light",}, unit = "old_tank(ger)"},',
  '\t\t\t\t--]]',
  '\t\t\t\t--{priority = 1.0, type = {"Class2", "Tank", "Medium",}, unit = "off_tank"},',
  '\t\t\t\t{priority = 1.0, type = {"Class2", "Infantry", "Squad",}, unit = "squad_a(ger)"}, -- "Tank" in a comment',
  '\t\t\t\t---[[',
  '\t\t\t\t{priority = 2.0, type = {"Class3", "Tank", "Light",}, unit = "pz_light"},',
  '\t\t\t\t{priority = 1.0, type = {"Class2", "Tank", "Medium",}, unit = "pz_medium"}',
  '\t\t\t\t--]]',
  '\t\t},',
  '\t},',
  '}');
const conq = J(
  'Purchases["conquest.ger"] = {',
  '\t{Repeat = 0, --infinite',
  '\t\tUnits = {',
  '\t\t\t\t--{availability = "1.4", base = { "Infantry", "Single" }, class = {}, grade = "Grade1", unit = "officer(ger)"},',
  '\t\t\t\t{availability = "1.3", base = { "Infantry", "Squad" }, class = {}, grade = "Grade1", posture = { "Defensive" }, roles = { "Line" }, effects = {}, unit = "squad_c(ger)"},',
  '\t\t\t\t{availability = "1.0", base = { "Tank" }, class = { "Light" }, grade = "Grade1", posture = { "Flexible" }, roles = { "MG" }, effects = { "VsInfantry" }, unit = "tank_c"},',
  '\t\t},',
  '\t},',
  '}');
const S = path.join(W, 'stock');
put(path.join(S, U, 'ger', 'mid.ger.lua'), mid); put(path.join(S, U, 'ger', 'conquest.ger.lua'), conq);
put(path.join(S, U, 'rus', 'mid.rus.lua'), mid.replace('mid.ger', 'mid.rus').replace('pz_light', 't26'));
fs.mkdirSync(path.join(W, 'mod'), { recursive: true });
const M = path.join(W, 'mod'), OUT = p => path.join(W, p, 'resource', ...U.split('/'));

// default anchor: first ACTIVE row naming "Tank" (commented old_tank, off_tank and the comment of squad_a skipped)
let r = run(M, '--out', path.join(W, 'o1'), '--exe', 'goh', '--stock', S, '--buy-first', 'new_tank', '--army', 'ger', '--stage', 'mid');
ok(r.code === 0 && /after pz_light in script\/multiplayer\/units\/ger\/mid\.ger\.lua/.test(r.out), 'GoH anchor = first active Tank row (' + r.out + r.err + ')');
let o = rd(path.join(OUT('o1'), 'ger', 'mid.ger.lua'));
ok(o === mid.replace('unit = "pz_light"},\r\n', 'unit = "pz_light"},\r\n\t\t\t\t{priority = 2.0, type = {"Class3", "Tank", "Light",}, unit = "new_tank"},\r\n'), 'GoH row copied in the legacy form, CRLF');
ok(/mod\.info: not written for GoH/.test(r.out) && !fs.existsSync(path.join(W, 'o1', 'mod.info')), 'no mod.info for GoH');
// rerun in place on the output: already
r = run(path.join(W, 'o1'), '--out', path.join(W, 'o1'), '--exe', 'goh', '--buy-first', 'new_tank', '--army', 'ger', '--stage', 'mid');
ok(r.code === 0 && /already/.test(r.out) && rd(path.join(OUT('o1'), 'ger', 'mid.ger.lua')) === o, 'GoH rerun: already, same bytes');
// --after the last row (no comma): it gets the comma, the new row is the last one; --priority on the legacy form
r = run(M, '--out', path.join(W, 'o2'), '--exe', 'goh', '--stock', S, '--buy-first', 'x2', '--army', 'ger', '--stage', 'mid', '--after', 'pz_medium', '--priority', '5.0');
o = rd(path.join(OUT('o2'), 'ger', 'mid.ger.lua'));
ok(r.code === 0 && o.includes('unit = "pz_medium"},\r\n\t\t\t\t{priority = 5.0, type = {"Class2", "Tank", "Medium",}, unit = "x2"}\r\n\t\t\t\t--]]'), 'GoH last row: comma moved, priority set');
// conquest form, file found by --after alone (only one roster holds tank_c); --priority = availability
r = run(M, '--out', path.join(W, 'o3'), '--exe', 'goh', '--stock', S, '--game', path.join(W, 'nogame'), '--buy-first', 'y3', '--after', 'tank_c', '--priority', '0.9');
o = rd(path.join(OUT('o3'), 'ger', 'conquest.ger.lua'));
ok(r.code === 0 && o.includes('unit = "tank_c"},\r\n\t\t\t\t{availability = "0.9", base = { "Tank" }, class = { "Light" }, grade = "Grade1", posture = { "Flexible" }, roles = { "MG" }, effects = { "VsInfantry" }, unit = "y3"},\r\n'), 'GoH conquest row copied, availability set');
// (--game names a made-up folder wherever the GoH install would be read: the test never reads a real install)
// refusals: --after in two rosters, a commented unit, no roster named, a missing roster
r = run(M, '--out', path.join(W, 'o4'), '--exe', 'goh', '--stock', S, '--game', path.join(W, 'nogame'), '--buy-first', 'z', '--after', 'pz_medium');
ok(r.code === 2 && /in 2 GoH rosters/.test(r.err) && !fs.existsSync(path.join(W, 'o4')), 'GoH --after in two rosters refused');
r = run(M, '--out', path.join(W, 'o4'), '--exe', 'goh', '--stock', S, '--buy-first', 'z', '--army', 'ger', '--stage', 'mid', '--after', 'off_tank');
ok(r.code === 2 && /BOT_ANCHOR_MISSING/.test(r.err) && !fs.existsSync(path.join(W, 'o4')), 'GoH switched-off row is no anchor');
r = run(M, '--out', path.join(W, 'o4'), '--exe', 'goh', '--stock', S, '--buy-first', 'z');
ok(r.code === 2 && /BOT_NO_ROSTER/.test(r.err) && /in plain words/.test(r.err), 'GoH no roster named: plain line');
r = run(M, '--out', path.join(W, 'o4'), '--exe', 'goh', '--stock', S, '--buy-first', 'z', '--army', 'usa', '--stage', 'early', '--game', path.join(W, 'nogame'));
ok(r.code === 2 && /BOT_NO_ROSTER: no script\/multiplayer\/units\/usa\/early\.usa\.lua/.test(r.err), 'GoH missing roster refused');
// game read through the vfs with exe goh (made-up GoH install: binaries/x64/call_to_arms.exe, loose resource/)
const GG = path.join(W, 'gohgame');
put(path.join(GG, 'binaries', 'x64', 'call_to_arms.exe'), ''); put(path.join(GG, 'resource', U, 'ger', 'conquest.ger.lua'), conq);
r = run(M, '--out', path.join(W, 'o5'), '--exe', 'goh', '--game', GG, '--buy-first', 'g5', '--army', 'ger', '--stage', 'conquest');
ok(r.code === 0 && /after tank_c/.test(r.out) && rd(path.join(OUT('o5'), 'ger', 'conquest.ger.lua')).includes('unit = "g5"'), 'GoH roster from --game through the vfs');
// --team-mode on a GoH game set (same {armySelectionMode alliance} line as AS2), --bot-main copied
put(path.join(M, 'resource', 'set', 'multiplayer', 'games', 'frontlines.set'), J('{gameMode', '\t{armySelectionMode alliance}', '}'));
put(path.join(W, 'main.lua'), 'x = 1\n');
r = run(M, '--out', path.join(W, 'o6'), '--exe', 'goh', '--team-mode', 'frontlines', '--bot-main', path.join(W, 'main.lua'));
ok(r.code === 0 && rd(path.join(W, 'o6', 'resource', 'set', 'multiplayer', 'games', 'frontlines.set')).includes('{armySelectionMode team}') && rd(path.join(W, 'o6', 'resource', 'script', 'multiplayer', 'bot.main.lua')) === 'x = 1\r\n', 'GoH --team-mode and --bot-main');
// plain refusals (exit 2, one line naming GoH and the row)
const ref = (re, ...a) => { const x = run(...a); ok(x.code === 2 && re.test(x.err) && /not available for GoH/.test(x.err), 'GoH refusal: ' + a.join(' ') + ' -> ' + x.err); };
ref(/GHMIS-66/, M, '--out', path.join(W, 'o7'), '--exe', 'goh');
ref(/GHMIS-66/, M, '--check', '--exe', 'goh');
ref(/macro entries/, M, '--out', path.join(W, 'o7'), '--exe', 'goh', '--buy-first', 'a', '--army', 'ger', '--stage', 'mid', '--stock', S, '--cheap');
ref(/macro entries/, M, '--out', path.join(W, 'o7'), '--exe', 'goh', '--buy-first', 'a', '--card-like', 'b');
ok(!fs.existsSync(path.join(W, 'o7')), 'nothing written on a GoH refusal');
r = run(M, '--out', path.join(W, 'o7'), '--exe', 'goh', '--target', 'as64', '--buy-first', 'a', '--army', 'ger', '--stage', 'mid');
ok(r.code === 2 && /not with --exe goh/.test(r.err), '--target with --exe goh refused');
ok(run(M, '--out', path.join(W, 'o7'), '--exe', 'nosuch', '--copy').code === 2, 'bad --exe exit 2');
// --out in the game files of the (made-up) GoH install (a new folder in <GoH>/mods may be written, owner 2026-11-15): the write guard's plain line, exit 2, nothing written, also with --dry-run
for (const dry of [[], ['--dry-run']]) {
  r = run(M, '--out', path.join(GG, 'resource', 'x'), '--exe', 'goh', '--game', GG, '--buy-first', 'g8', '--army', 'ger', '--stage', 'conquest', ...dry);
  ok(r.code === 2 && /ARSENAL will not write/.test(r.err) && !/after tank_c/.test(r.out) && !fs.existsSync(path.join(GG, 'resource', 'x')), 'GoH --out in the game files refused ' + dry.join(' ') + ' -> ' + r.out + r.err);
}

// ---- MoW:AS2 on the shared install ----
const C = path.join(__dirname, 'chainn3'), BD = ['script', 'multiplayer', 'bot.data.lua'];
const van = rd(path.join(C, 'stock', ...BD)), G = path.join(W, 'as2');
put(path.join(G, 'as64.exe'), ''); put(path.join(G, 'mowas_2.exe'), '');
put(path.join(G, 'resource', ...BD), van);
// fix mode, --out inside the AS2 install but not under mods/<name>: refused by the write guard, nothing written
r = run(M, '--out', path.join(G, 'resource', 'zz'));
ok(r.code === 2 && /ARSENAL will not write/.test(r.err) && !fs.existsSync(path.join(G, 'resource', 'zz')), 'fix mode --out inside the AS2 install refused -> ' + r.err);
put(path.join(G, 'as64', 'core', 'resource', ...BD), van.replace('unit = "mk7"}', 'unit = "mk7"},\r\n\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "core_only"}') + 'CoreOnly = 1\r\n');
const E = path.join(W, 'empty'); fs.mkdirSync(E, { recursive: true });
const bf = (out, ...x) => run(E, '--out', path.join(W, out), '--buy-first', 'q_tank', '--after', 'core_only', '--game', G, ...x);
ok(bf('a1').code === 0 && bf('a2', '--exe', 'as64').code === 0, 'no --exe and --exe as64 read as64/core (core_only anchor found)');
r = bf('a3', '--exe', 'mowas_2');
ok(r.code === 2 && /BOT_ANCHOR_MISSING/.test(r.err) && !fs.existsSync(path.join(W, 'a3')), '--exe mowas_2 reads the base game, not as64/core');
ok(bf('a4', '--exe', 'mowas2').code === 2 && bf('a5', '--target', 'mowas2').code === 2, '--exe mowas2 and --target mowas2 the same');
ok(rd(path.join(W, 'a1', 'resource', ...BD)) === rd(path.join(W, 'a2', 'resource', ...BD)), 'no --exe = --exe as64, same bytes');
r = run(E, '--out', path.join(W, 'a6'), '--buy-first', 'q_tank', '--after', 'mk7', '--game', G, '--exe', 'mowas_2');
ok(r.code === 0 && /mod\.info mowas2 \(--exe\)/.test(r.out) && /MinGameVersion "3\.262\.0"/.test(rd(path.join(W, 'a6', 'mod.info'))), '--exe mowas_2: mod.info range 3.262');
r = run(E, '--out', path.join(W, 'a7'), '--buy-first', 'q_tank', '--after', 'mk7', '--game', G, '--exe', 'as64');
ok(r.code === 0 && /mod\.info as64 \(--exe\)/.test(r.out), '--exe as64: mod.info range as64');
// --check: the vanilla copy comes from the named game's view (mowas_2: base; as64: as64/core with core_only)
const mod = path.join(W, 'cm'); put(path.join(mod, 'resource', ...BD), van);
const c1 = run(mod, '--check', '--game', G, '--exe', 'mowas_2'), c2 = run(mod, '--check', '--game', G, '--exe', 'as64');
ok(!/CoreOnly/.test(c1.out) && /BOT_KEY_MISSING.*global CoreOnly missing/.test(c2.out), '--check reads the named game\'s vanilla list (' + c1.out.split('\n').slice(-2).join(' ') + ' | ' + c2.out.split('\n').slice(-2).join(' ') + ')');
// --stock with --exe mowas_2 (p-rec1): accepted, the --stock list is the source (no --game), mod.info range 3.262; --check the same
const ST = path.join(C, 'stock');
r = run(E, '--out', path.join(W, 's1'), '--buy-first', 'q_tank', '--after', 'mk7', '--stock', ST, '--exe', 'mowas_2');
ok(r.code === 0 && /q_tank/.test(rd(path.join(W, 's1', 'resource', ...BD))) && /MinGameVersion "3\.262\.0"/.test(rd(path.join(W, 's1', 'mod.info'))), '--stock --exe mowas_2 buy-first -> ' + r.err);
r = run(E, '--out', path.join(W, 's2'), '--buy-first', 'q_tank', '--after', 'mk7', '--stock', ST, '--exe', 'mowas2');
ok(r.code === 0 && rd(path.join(W, 's2', 'resource', ...BD)) === rd(path.join(W, 's1', 'resource', ...BD)), '--stock --exe mowas2 = mowas_2');
r = run(mod, '--check', '--stock', ST, '--exe', 'mowas_2');
ok(r.code === 0 && !/BOT_NO_VANILLA/.test(r.err), '--check --stock --exe mowas_2 -> ' + r.out.split('\n').slice(-2).join(' ') + r.err);
fs.rmSync(W, { recursive: true, force: true });
console.log('PASS games (' + n + ' checks)');
