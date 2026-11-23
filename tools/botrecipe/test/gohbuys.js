// gohbuys: the GoH purchase-list reader on made-up files in the vanilla forms (period rows priority/type, conquest rows availability/tags),
// the not-read list (file + line, never guessed), the lobby mode map, and luatable's Name["key"] = v statement with a seed.
// Author: Imperator_Aug (ARSENAL, ia-6b7883d3)
'use strict';
const G = require('../gohbuys'), L = require('../luatable');
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL ' + m); } };

// luatable: bracket keys on a statement, seed globals; AS2 forms unchanged
const t = L.parse('Purchases["a.b"] = { 1 }\r\nX = { y = 2 }\r\nX["z"] = 3\r\n', { Purchases: { $t: 'table', hash: {}, arr: [], line: 0, keyLine: {} } });
ok(t.globals.Purchases.hash['a.b'].arr[0] === 1 && t.globals.X.hash.z === 3, 'luatable: Name["key"] = v sets a field');
let e = null; try { L.parse('P["x"] = 1\r\n'); } catch (x) { e = x; } ok(e && /not a table/.test(e.message), 'luatable: no seed = P is not a table');
e = null; try { L.parse('P[k] = 1\r\n', { P: { $t: 'table', hash: {}, arr: [], keyLine: {} } }); } catch (x) { e = x; } ok(e && /LUA_UNSUPPORTED/.test(e.message), 'luatable: a key that is not a literal is refused');

ok(G.fileOf('script/multiplayer/units/ger/mid.ger.lua').list === 'mid' && G.fileOf('script/multiplayer/units/ger/mid.rus.lua') === null && G.fileOf('script/multiplayer/modes/utility.lua') === null, 'fileOf: army folder and file army agree');
const mid = 'Purchases["mid.ger"] = {\r\n\t{Repeat = 0,  --infinite\r\n\t\tUnits = {\r\n\t\t\t---[[\r\n\t\t\t{priority = 1.5, type = {"Class2", "Tank", "Medium",}, unit = "pz4(ger)"},\r\n\t\t\t--]]\r\n\t\t\t--[[\r\n\t\t\t{priority = 9, unit = "off(ger)"},\r\n\t\t\t--]]\r\n\t\t}\r\n\t},\r\n\t{Repeat = 2, Units = { {priority = 1, type = {"Class3", "Infantry"}, unit = "sq(ger)", count = 3}, {priority = Big, unit = "ref(ger)"}, {type = {"Tank"}} }},\r\n}\r\n';
const r = G.readList(mid, 'script/multiplayer/units/ger/mid.ger.lua');
ok(r.army === 'ger' && r.list === 'mid' && r.stages.length === 2 && r.stages[0].repeat === 0 && r.stages[1].repeat === 2, 'period list: stages and Repeat');
const u = r.stages[0].units;
ok(u.length === 1 && u[0].unit === 'pz4(ger)' && u[0].priority === 1.5 && u[0].cls === 'Tank' && u[0].tags.join() === 'Class2,Tank,Medium' && u[0].line === 5, 'period row: priority, kind, tags, line; a --[[ ]] block is off');
const nr = r.notRead.map(x => x.line + ':' + x.what);
ok(r.notRead.length === 3 && nr.some(x => /^12:.*key count/.test(x)) && nr.some(x => /^12:.*priority is not a number/.test(x)) && nr.some(x => /no unit name/.test(x)), 'not read: unknown key, a non-literal value, a row with no unit: ' + nr.join(' | '));
ok(r.stages[1].units.map(x => x.unit).join() === 'sq(ger),ref(ger)', 'a row with a not-read key keeps what was read');
const cq = G.readList('Purchases["conquest.rus"] = {\r\n\t{Repeat = 0, Units = {\r\n\t\t{availability = "1.3", base = { "Infantry", "Squad" }, class = {}, grade = "Grade4", posture = { "Flexible" }, roles = { "Line" }, effects = {}, identity = { "Guards" }, unit = "g(rus)"},\r\n\t}}\r\n}\r\n', 'script/multiplayer/units/rus/conquest.rus.lua');
const c = cq.stages[0].units[0];
ok(!cq.notRead.length && c.availability === 1.3 && c.priority === null && c.grade === 'Grade4' && c.cls === 'Infantry' && c.tags.join() === 'Infantry,Squad,Flexible,Line,Guards', 'conquest row: availability, grade, tags');
const w = G.readList('Purchases["early.ger"] = {}\r\nlocal x = 1\r\n', 'script/multiplayer/units/ger/mid.ger.lua');
ok(w.notRead.length === 1 && w.notRead[0].line === 2 && /LUA_UNSUPPORTED/.test(w.notRead[0].what) && !w.stages.length, 'code in a list file: the file is not read, with the line');
const k = G.readList('Purchases["early.ger"] = {}\r\n', 'script/multiplayer/units/ger/mid.ger.lua');
ok(k.notRead.some(x => /reads Purchases\["mid\.ger"\] only/.test(x.what)) && k.notRead.some(x => /no Purchases\["mid\.ger"\]/.test(x.what)), 'a key the bot does not read is listed');

const M = G.modesOf({
  'script/multiplayer/bot.main.lua': 'local function f()\r\n\tlocal gameModeMap = {\r\n\t\tcampaign_capture_the_flag = "conquest",\r\n\t\tbattle_zones = "battlezones", -- note\r\n\t\todd = pick(),\r\n\t}\r\nend\r\n',
  'script/multiplayer/modes/conquest.lua': 'function OnGameStart()\r\n\tOnGameStartUtility("conquest")\r\nend\r\n',
  'script/multiplayer/modes/battlezones.lua': 'x = 1\r\n\tOnGameStartUtility(BotApi.Instance.unitMode)\r\n',
});
ok(M.modes.length === 2 && M.modes[0].list === 'conquest' && M.modes[1].mode === 'battle_zones' && M.modes[1].list === 'period' && M.modes[1].line === 4, 'modes: lobby mode -> list');
ok(M.notRead.length === 1 && M.notRead[0].line === 5 && /odd/.test(M.notRead[0].what), 'modes: a value that is not a string is not read');
ok(G.sortLists(['late', 'zz', 'conquest', 'early']).join() === 'early,late,conquest,zz', 'list order');
console.log(bad ? bad + ' failures' : 'gohbuys PASS');
process.exit(bad ? 1 : 0);
