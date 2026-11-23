// Bots part recipes test ("Teach the bot new habits"). Arg: scratch dir. No game, no network: a seeded AS64 install (bot.main.lua and two
// units sets, loose files read through the vfs) with a mod in <game>/mods, a stock-shaped bot.lua written here (the same globals and
// Subscribe pattern as the game's, own code) on the stock bot.data.lua fixture of tools/botrecipe.
//   contract and strings; luamini (Lua 5.2 syntax check: the generated files, the stock data, broken cases; the small interpreter);
//   gen (settings round trip, warnings, CRLF, the entry line in and out); behaviour in the fake host (fakebot.js): all habits off = the
//   stock bot exactly, then each habit, a habit error, a wrong load order, no settings file; the routes (preview writes nothing, write
//   CRLF, remove restores, a foreign file kept, refusals as worded codes, undo exact bytes and its refusal); the client in the page fake
//   DOM with the page's own h() and fld() (block rules, tick rows with numbers hidden until ticked, in-game unit names, preview sentences,
//   done box, undo, reset, the bot log, GoH greyed with IDs only in Details).
// Not covered here (needs a real match, [T]): see the "[T]" list in index.js / the hand-back.
// Author: Imperator_Aug (ARSENAL, ia-03629347)
'use strict';
const fs = require('fs'), path = require('path');
const modInfo = d => { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'mod.info'), '{mod\r\n\t{name "test"}\r\n}\r\n'); return d; };   // a real mod folder holds mod.info (the write guard asks for it)
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'recipes-')));
require('../../../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const T = path.join(__dirname, '..', '..', '..', '..', '..');   // tools/
const P = require('./index'), check = require('../index').check;
const L = require('./luamini'), gen = require('./gen'), F = require('./fakebot');
const BC = require(path.join(T, 'gui', 'test', 'blockcheck')), FD = require(path.join(T, 'gui', 'test', 'fakedom'));
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };

// ---- a stock-shaped bot.lua: same globals, same flow (buy list iterator, weighted random flag pick, one order timer per squad)
const BOT = [
  'require([[/script/multiplayer/bot.data]])',
  'local Context = { Purchase = nil, SpawnInfo = nil, SquadTimers = {} }',
  'local Iter = {}',
  'Iter.__index = Iter',
  'function Iter:new(list) local o = setmetatable({ list = list }, self) o:step() return o end',
  'function Iter:step() self.idx = next(self.list, self.idx) if self.idx then self.left = self.list[self.idx].Repeat else self.left = nil end end',
  'function Iter:units() if self.idx then return self.list[self.idx].Units end end',
  'function Iter:advance() if not self.left or self.left == 0 then return end self.left = self.left - 1 if self.left == 0 then self:step() end end',
  'function GetRandomItem(items, rate)',
  '  local all, sum = {}, 0',
  '  for _, it in pairs(items) do local r = rate(it) sum = sum + r table.insert(all, { it, r }) end',
  '  local x, acc = math.random(), 0',
  '  for _, p in ipairs(all) do acc = acc + p[2] if x < acc / sum then return p[1] end end',
  'end',
  'function GetFlagPriority(flag)',
  '  if flag.occupant == BotApi.Instance.team then return FlagPriority.Captured',
  '  elseif flag.occupant == BotApi.Instance.enemyTeam then return FlagPriority.Enemy end',
  '  return FlagPriority.Neutral',
  'end',
  'function GetFlagToCapture(flags, prio)',
  '  local l = {}',
  '  for _, f in pairs(flags) do table.insert(l, { name = f.name, k = prio(f) }) end',
  '  return GetRandomItem(l, function(f) return f.k end)',
  'end',
  'function GetUnitToSpawn(units)',
  '  if not units then return nil end',
  '  local inc, l = BotApi.Commands:Income(BotApi.Instance.playerId), {}',
  '  for _, u in pairs(units) do if inc >= (u.min_income or -1) and BotApi.Instance.teamSize >= (u.min_team or 0) then table.insert(l, u) end end',
  '  if #l == 0 then return nil end',
  '  return GetRandomItem(l, function(u) return u.priority end)',
  'end',
  'local function nextUnit()',
  '  local u = Context.Purchase:units()',
  '  if not u then return nil end',
  '  local x = GetUnitToSpawn(u[BotApi.Instance.army])',
  '  Context.Purchase:advance()',
  '  return x',
  'end',
  'function OnGameStart() math.randomseed(os.time() * BotApi.Instance.hostId) Context.Purchase = Iter:new(Purchases) Context.SpawnInfo = nextUnit() end',
  'function OnGameStop() for _, t in pairs(Context.SquadTimers) do if t then BotApi.Events:KillQuantTimer(t) end end end',
  'function OnGameQuant()',
  '  if not Context.SpawnInfo or BotApi.Commands:Spawn(Context.SpawnInfo.unit, MaxSquadSize) then Context.SpawnInfo = nextUnit() end',
  '  for _, s in pairs(BotApi.Scene.Squads) do if not Context.SquadTimers[s] then SetSquadOrder(CaptureFlag, s, OrderRotationPeriod) end end',
  'end',
  'function CaptureFlag(squad) local f = GetFlagToCapture(BotApi.Scene.Flags, GetFlagPriority) if f then BotApi.Commands:CaptureFlag(squad, f.name) end end',
  'function SetSquadOrder(order, squad, delay)',
  '  order(squad)',
  '  local function again()',
  '    Context.SquadTimers[squad] = BotApi.Events:SetQuantTimer(function()',
  '      order(squad) Context.SquadTimers[squad] = nil',
  '      if BotApi.Scene:IsSquadExists(squad) then again() end',
  '    end, delay)',
  '  end',
  '  again()',
  'end',
  'function OnGameSpawn(a) SetSquadOrder(CaptureFlag, a.squadId, OrderRotationPeriod) end',
  'BotApi.Events:Subscribe(BotApi.Events.GameStart, OnGameStart)',
  'BotApi.Events:Subscribe(BotApi.Events.GameEnd, OnGameStop)',
  'BotApi.Events:Subscribe(BotApi.Events.Quant, OnGameQuant)',
  'BotApi.Events:Subscribe(BotApi.Events.GameSpawn, OnGameSpawn)',
].join('\r\n') + '\r\n';
const DATA = fs.readFileSync(path.join(T, 'botrecipe', 'test', 'chainn3', 'stock', 'script', 'multiplayer', 'bot.data.lua'), 'latin1');

(async () => {
  // ================= contract and strings
  ok(check('recipes', P) === '', 'contract: ' + check('recipes', P));
  ok(P.group === 'B' && P.order === 10, 'group B, order 10');
  const keys = new Set(P.lang.map(r => r[0]));
  ok(keys.size === P.lang.length, 'lang: no duplicate keys');
  const ph = s => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const r of P.lang) {
    ok(r.length === 5 && r.every(s => typeof s === 'string' && s.trim()), 'lang: four languages, none empty: ' + r[0]);
    ok(ph(r[2]) === ph(r[1]) && ph(r[3]) === ph(r[1]) && ph(r[4]) === ph(r[1]), 'lang: same placeholders: ' + r[0]);
    ok(r[0] === 'bots.recipes.log.file' || r[4] !== r[1], 'lang: zh translated: ' + r[0]);
  }
  const LABEL = /^bots\.recipes\.(h\.\w+\.t|n\.|u\.\w+$|r\.|b\.)/;
  ok(P.lang.filter(r => LABEL.test(r[0])).every(r => !/\b(lua|pcall|function|table|nil|require|BotApi|Subscribe)\b/i.test(r[1])), 'lang: no Lua words in labels');
  const EN = {}; P.lang.forEach(r => { EN[r[0]] = r[1]; });

  // ================= luamini: the syntax check (Lua 5.2)
  ok(L.check(DATA, 'bot.data.lua') === null, 'luamini: the stock bot.data.lua fixture parses');
  ok(L.check(BOT, 'bot.lua') === null, 'luamini: the stock-shaped bot.lua parses');
  ok(L.check(gen.runLua(), 'run') === null, 'luamini: the runner parses: ' + JSON.stringify(L.check(gen.runLua(), 'run')));
  const broken = [
    ['local x = 1\nif x then\n  x = 2\n', 'missing end'],
    ['while true do end\nbreak\n', 'break outside a loop'],
    ['return 1\nlocal y = 2\n', 'return not last'],
    ['local s = "open\n', 'string not closed'],
    ['local t = {1, 2\n', 'table not closed'],
    ['function f() return ... end\n', 'vararg outside a vararg function'],
    ['x = = 1\n', 'bad expression'],
    ['goto\n', 'goto without a label name'],
  ];
  for (const [src, what] of broken) { const e = L.check(src, 't'); ok(e && e.line >= 1 && e.msg, 'luamini: ' + what + ' is an error: ' + JSON.stringify(e)); }
  ok(L.check('goto done\n::done::\nlocal a = [==[x]]y]==]\nlocal b = 0x1F + 1e3 + #"ab" .. "" == nil\n', 't') === null, 'luamini: goto, labels, long strings, numbers parse');
  ok(L.check('local a <const> = 1\n', 't') !== null, 'luamini: Lua 5.4 attributes are refused (5.2)');
  {
    const out = [];
    const R = L.run('local t = {} for i = 1, 3 do t[#t + 1] = i * 2 end\nprint(table.concat(t, ","), string.format("%05.1f|%s|%d", 3.14159, "a", 7))\n' +
      'local ok, e = pcall(function() error("boom") end) print(ok, e)\nprint(select("#", 1, 2, 3), ("x"):rep(3), string.gsub("a.b.c", "%.", "/"))\n' +
      'local s = 0 for k, v in pairs({a = 1, b = 2}) do s = s + v end print(s)\nprint(string.match("map_02 [snow]", "(%w+)_(%d+)"))\n', { print: s => out.push(s) });
    ok(R && out[0] === '2,4,6\t003.1|a|7' && /^false\t.*boom$/.test(out[1]) && out[2] === '3\txxx\ta/b/c\t2' && out[3] === '3' && out[4] === 'map\t02', 'luamini: interpreter basics ' + JSON.stringify(out));
    let threw = ''; try { L.run('os.execute("dir")', { print: () => {} }); } catch (e) { threw = String(e.message || e); }
    ok(/execute/.test(threw), 'luamini: os.execute refuses');
  }

  // ================= gen
  const d0 = gen.defaults();
  ok(gen.HABITS.length === 9 && gen.HABITS.every(H => d0[H.id] && d0[H.id].on === false), 'gen: nine habits, all off by default');
  const rich = gen.normalize({
    attack: { on: true, size: '3', wait: 99 }, tanks: { on: true, units: [{ unit: 'pak40(ger)', army: 'ger' }, { unit: 'bad name!', army: 'ger' }, { unit: 'ghost', army: 'ger' }, { unit: 't34(rus)', army: 'ger' }] },
    save: { on: true, units: [] }, phases: { on: true, rules: [{ name: 'Зима', map: 'зимняя карта', difficulty: 'hard', from: 10, to: 5, units: [{ unit: 'pak40(ger)', army: '' }] }] }, log: { on: true },
  }, new Map([['pak40(ger)', ['ger']], ['t34(rus)', ['rus']]]));
  const S1 = rich.settings, W = rich.warn.map(w => w.code + '|' + (w.unit || '') + '|' + (w.where || ''));
  ok(S1.attack.size === 3 && S1.attack.wait === 30, 'gen: numbers read and clamped ' + JSON.stringify(S1.attack));
  ok(W.includes('badName|bad name!|tanks') && W.includes('unknown|ghost|tanks') && W.includes('otherArmy|t34(rus)|tanks') && W.includes('noUnits||save') && W.some(w => /^badTime||phases:1/.test(w)), 'gen: warnings ' + W.join(' '));
  ok(S1.tanks.units.length === 3 && !S1.tanks.units.some(u => u.unit === 'bad name!'), 'gen: a bad unit name is left out, the others kept');
  ok(S1.phases.rules[0].units.length === 1 && S1.phases.rules[0].units[0].army === 'ger', 'gen: a unit with no army gets one row per army that has the card');
  const dl = gen.dataLua(S1);
  ok(dl.startsWith(gen.DATA_MARK) && !/[^\r]\n/.test(dl) && L.check(dl, 'data') === null, 'gen: the settings file is CRLF, marked and parses');
  ok(!/\bfunction\b|\brequire\b|\bos\.|\bio\./.test(dl.replace(/^--.*$/gm, '')), 'gen: the settings file is data only');
  const back = gen.normalize(gen.readData(Buffer.from(dl, 'latin1').toString('latin1'))).settings;
  ok(JSON.stringify(back) === JSON.stringify(S1), 'gen: settings round trip (Cyrillic kept)');
  ok(JSON.stringify(gen.normalize(gen.readData(gen.dataLua(d0))).settings) === JSON.stringify(d0), 'gen: defaults round trip');
  const base = 'require([[/script/multiplayer/bot]])\r\n-- my line\r\n';
  const hooked = gen.mainWith(base);
  ok(gen.hasHook(hooked) && !gen.hasHook(base) && gen.loadsBot(hooked) && gen.mainWith(hooked) === hooked, 'gen: the entry line added once');
  ok(hooked.indexOf('bot]])') < hooked.indexOf('bot.habits.run'), 'gen: the runner loads after bot.lua');
  const un = gen.mainWithout(hooked, base);
  ok(un.text === base && un.same === true && gen.mainWithout(gen.mainWith(base + 'x = 1\r\n'), base).same === false, 'gen: the entry line taken out again');
  ok(gen.diff('a\r\nb\r\n', 'a\r\nc\r\n').some(d => d.t === '-' && d.s === 'b') && gen.diff('a\r\nb\r\n', 'a\r\nc\r\n').some(d => d.t === '+' && d.s === 'c'), 'gen: diff');
  ok(!/os\.execute|loadstring|dofile|\bload\(/.test(gen.runLua()), 'runner: no os.execute, no code loading');

  // ================= behaviour in the fake host
  const FL = () => [{ name: 'a', occupant: 1 }, { name: 'b', occupant: 0 }, { name: 'c', occupant: 2 }, { name: 'd', occupant: 2 }];
  const files = s => ({ '/script/multiplayer/bot.main': gen.mainWith(gen.STOCK_MAIN), '/script/multiplayer/bot': BOT, '/script/multiplayer/bot.data': DATA,
    '/script/multiplayer/bot.habits.run': gen.runLua(), '/script/multiplayer/bot.habits': s == null ? undefined : gen.dataLua(gen.normalize(s).settings) });
  const mk = (s, o) => F.sim(Object.assign({ files: files(s), money: 500, income: 3, flags: FL() }, o || {}));
  const logOf = S => [...S.files.values()].join('');
  const lines = (S, re) => logOf(S).split('\n').filter(l => re.test(l));
  const A = F.sim({ files: { '/script/multiplayer/bot': BOT, '/script/multiplayer/bot.data': DATA }, money: 500, income: 3, flags: FL() }); A.start(); A.seconds(400);
  const B = mk({}); B.start(); B.seconds(400);
  ok(A.buys.length > 5 && A.orders.length > 5 && JSON.stringify(A.buys) === JSON.stringify(B.buys) && JSON.stringify(A.orders) === JSON.stringify(B.orders), 'behaviour: all habits off = the stock bot exactly (' + A.buys.length + ' buys, ' + A.orders.length + ' orders)');
  ok(B.prints.includes('bot habits: on'), 'behaviour: the runner installs ' + JSON.stringify(B.prints));
  let S = mk({ attack: { on: true, size: 2 }, log: { on: true } }); S.start(); S.seconds(30);
  ok(lines(S, /group of 2 squads attacks flag [cd]/).length >= 1, 'attack together: a group of 2 goes to an enemy flag ' + JSON.stringify(lines(S, /group/)));
  ok(lines(S, /match start: map test map, difficulty normal, army ger, habits: attack log/).length === 1, 'match log: the start line names the habits');
  S = mk({ replace: { on: true, confirm: 4, max: 2 }, log: { on: true } }); S.start(); S.seconds(10);
  const ids = [...S.squads.keys()]; const before = S.buys.length; ids.slice(0, 3).forEach(id => S.kill(id)); S.seconds(30);
  ok(lines(S, /lost: buying it again/).length === 2 && lines(S, /no re-buys left/).length === 1 && S.buys.length > before, 'replace losses: two re-buys, then the limit ' + JSON.stringify(lines(S, /lost/)));
  // one buy, two squads (smgs(ger) in the game check): the card is bought again once, when both squads are gone, not once per squad
  S = mk({ replace: { on: true, confirm: 4, max: 10 }, log: { on: true } }, { squadsPer: 2 }); S.start(); S.seconds(4);
  { const ids2 = [...S.squads.keys()].slice(0, 2), b0 = S.buys.length;
    ok(ids2.length === 2 && S.squads.get(ids2[0]) === S.squads.get(ids2[1]), 'replace, two squads per buy: the sim gives one buy two squads');
    S.kill(ids2[0]); S.seconds(10);
    ok(lines(S, /lost: buying it again/).length === 0 && lines(S, /1 more squad\(s\) of that buy still out/).length === 1, 'replace, two squads per buy: the first loss waits for the other squad ' + JSON.stringify(lines(S, /lost/)));
    S.kill(ids2[1]); S.seconds(40);
    ok(lines(S, /lost: buying it again/).length === 1 && lines(S, /replaces a lost squad/).length === 1, 'replace, two squads per buy: both gone, bought again once ' + JSON.stringify(lines(S, /lost|replaces/)) + ' buys ' + (S.buys.length - b0));
    ok(!lines(S, /Lua call failed|habits off/).length && !S.prints.some(p => /error|stopped/i.test(p)), 'replace, two squads per buy: no Lua error ' + JSON.stringify(S.prints)); }
  S = mk({ replace: { on: true, confirm: 20, max: 5 }, log: { on: true } }); S.start(); S.seconds(10);
  { const id = [...S.squads.keys()][0]; S.board(id, true); S.seconds(6); S.board(id, false); S.seconds(30); ok(lines(S, /lost/).length === 0, 'replace losses: a short ride in a vehicle is not a loss'); }
  S = mk({ fallback: { on: true, every: 1, hold: 30 }, log: { on: true } }); S.start(); S.seconds(20); S.flag('b', 2); S.seconds(70);
  ok(lines(S, /fall back/).length >= 1, 'fall back: squads pull back ' + JSON.stringify(lines(S, /fall back/).slice(0, 2)));
  S = mk({ save: { on: true, income: 2, every: 1, wait: 600, units: [{ unit: 'tiger1', army: 'ger' }] }, log: { on: true } }, { cost: { tiger1: 400 } }); S.start(); S.seconds(260);
  ok(S.buys.some(b => b.unit === 'tiger1') && lines(S, /saving up for tiger1/).length >= 1, 'save for a big unit: tiger1 bought ' + JSON.stringify(lines(S, /sav|tiger/)));
  S = mk({ phases: { on: true, share: 100, rules: [{ map: 'other', units: [{ unit: 'x1', army: 'ger' }] }, { map: 'TEST', difficulty: 'normal', from: 1, units: [{ unit: 'late1', army: 'ger' }, { unit: 'eng1', army: 'eng' }] }] } }); S.start(); S.seconds(100);
  ok(S.buys.some(b => b.unit === 'late1' && b.t >= 60000) && !S.buys.some(b => b.unit === 'late1' && b.t < 60000) && !S.buys.some(b => b.unit === 'x1' || b.unit === 'eng1'), 'units per map / time: the rule after minute 1, map and army filters ' + S.buys.map(b => b.unit + '@' + (b.t / 1000 | 0)).join(' '));
  S = mk({ front: { on: true, any: 0 } }); S.start(); S.seconds(20);
  ok(S.orders.length > 0 && S.orders.every(o => o.flag === 'b'), 'front line: orders to the flag next to ours ' + S.orders.map(o => o.flag).join(''));
  S = mk({ cap: { on: true, max: 3 } }); S.start(); S.seconds(90);
  ok(S.squads.size === 3, 'squad cap: 3 squads at most ' + S.squads.size);
  S = mk({ tanks: { on: true, every: 1, units: [{ unit: 'pak40(ger)', army: 'ger' }] } }, { tanks: true }); S.start(); S.seconds(40);
  ok(S.buys.length > 1 && S.buys.every(b => b.unit === 'pak40(ger)'), 'answer tanks: the anti-tank list while the enemy has tanks ' + S.buys.map(b => b.unit).join(' '));
  S = mk({ tanks: { on: true, every: 1, units: [{ unit: 'pak40(ger)', army: 'ger' }] } }, { tanks: false }); S.start(); S.seconds(40);
  ok(!S.buys.some(b => b.unit === 'pak40(ger)'), 'answer tanks: nothing changes without enemy tanks');
  S = mk({ attack: { on: true } }); S.lua.exec('BotHabitsState.choose = function() error("boom") end'); S.start(); S.seconds(30);
  ok(S.prints.some(p => /habits stopped/.test(p)) && S.prints.filter(p => /habits stopped/.test(p)).length === 1 && S.buys.length > 2 && S.orders.length > 2, 'a habit error: habits off, said once, the stock bot goes on ' + JSON.stringify(S.prints));
  S = F.sim({ files: Object.assign(files({ attack: { on: true } }), { '/script/multiplayer/bot.main': 'require([[/script/multiplayer/bot.habits.run]])\r\nrequire([[/script/multiplayer/bot]])\r\n' }), money: 500, income: 3, flags: FL() });
  S.start(); S.seconds(20);
  ok(!S.prints.includes('bot habits: on') && S.buys.length > 0, 'runner before bot.lua: habits off, stock still buys ' + JSON.stringify(S.prints));
  S = mk(null); S.start(); S.seconds(20);
  ok(S.prints.some(p => /could not be read/.test(p)) && S.buys.length > 0, 'no settings file: habits off, stock buys');
  S = mk({ log: { on: true } }, { canOpen: () => false }); S.start(); S.seconds(5);
  ok(S.prints.some(p => /log folder was not found/.test(p)) && S.buys.length > 0, 'match log: no folder -> said once, the bot plays');

  // ================= GoH: its own runner on a stock-shaped mode script (bot.main.lua picks modes/<mode>, events by GoH numbers) [T in game]
  {
    const GR = gen.runLua('goh');
    ok(L.check(GR, 'goh run') === null && GR !== gen.runLua() && gen.runVersion(GR) === 2 && !/[^\r]\n/.test(GR), 'goh runner: parses, its own file, marked v2, CRLF ' + JSON.stringify(L.check(GR, 'goh run')));
    ok(!/os\.execute|loadstring|dofile|\bload\(|EnemyHasTanks/.test(GR.replace(/--[^\r\n]*/g, '')) && /IsUnitAvailable/.test(GR) && /campaign_capture_the_flag/.test(GR), 'goh runner: no code loading, no EnemyHasTanks, asks IsUnitAvailable, conquest named');
    const GMAIN = ['local function initializeBotAI()', '  local m = {campaign_capture_the_flag = "conquest", battle_zones = "battlezones", ammunition = "battlezones", evacuation = "laststand", frontlines = "frontlines"}',
      '  require("/script/multiplayer/modes/" .. m[BotApi.Instance.gameMode])', '  if initialize then initialize() end', 'end', 'initializeBotAI()'].join('\r\n') + '\r\n';
    const GMODE = ['Context = {SquadTimers = {}}', 'MaxSquadSize = 2', 'team = BotApi.Instance.team', 'enemyTeam = BotApi.Instance.enemyTeam',
      'local list = {"smg(ger)", "mg(ger)"}', 'local cool = nil',
      'function SetSpawnCooldownTimer() cool = BotApi.Events:SetQuantTimer(function() cool = nil end, 1000) end',
      'function TrySpawnUnit()', '  if cool then return end', '  if not BotApi.Commands:CanSpawn() then return end', '  local u = list[math.random(#list)]',
      '  if not BotApi.Commands:IsUnitAvailable(u) then return end', '  if BotApi.Commands:Spawn(u, MaxSquadSize) then SetSpawnCooldownTimer() end', 'end',
      'function CaptureFlag(squad)', '  if BotApi.Scene:IsSquadTagged(squad, "_lua_mi") then return end',
      '  for k, f in pairs(BotApi.Scene.Flags) do if f.occupant ~= team then return BotApi.Commands:CaptureFlag(squad, f.name) end end', 'end',
      'function SetSquadOrder(order, squad, delay)', '  order(squad)', '  Context.SquadTimers[squad] = BotApi.Events:SetQuantTimer(function() Context.SquadTimers[squad] = nil end, delay)', 'end',
      'function OnGameStart() end', 'function OnGameStop() end',
      'function OnGameQuant()', '  TrySpawnUnit()', '  if #BotApi.Scene.Waypoints == 0 then', '    for i, squad in pairs(BotApi.Scene.Squads) do',
      '      if not Context.SquadTimers[squad] then SetSquadOrder(CaptureFlag, squad, 150000) end', '    end', '  end', 'end',
      'function OnGameSpawn(args) SetSquadOrder(CaptureFlag, args.squadId, 150000) end',
      'BotApi.Events:Subscribe(BotApi.Events.GameStart, OnGameStart)', 'BotApi.Events:Subscribe(BotApi.Events.GameEnd, OnGameStop)',
      'BotApi.Events:Subscribe(BotApi.Events.Quant, OnGameQuant)', 'BotApi.Events:Subscribe(BotApi.Events.GameSpawn, OnGameSpawn)'].join('\r\n') + '\r\n';
    ok(gen.loadsBot(GMAIN, 'goh') && !gen.loadsBot(GMAIN) && !gen.loadsBot('print(1)', 'goh'), 'gen: a GoH entry starts the bot through its mode script');
    const gfiles = sx => { const o = { '/script/multiplayer/bot.main': gen.mainWith(GMAIN), '/script/multiplayer/bot.habits.run': GR };
      for (const m of ['battlezones', 'frontlines', 'conquest', 'laststand']) o['/script/multiplayer/modes/' + m] = GMODE;
      if (sx != null) o['/script/multiplayer/bot.habits'] = gen.dataLua(gen.normalize(sx).settings, 'goh'); return o; };
    const GFL = () => [{ name: 'f1', occupant: 1 }, { name: 'f2', occupant: 0 }, { name: 'f3', occupant: 2 }, { name: 'f4', occupant: 2 }];
    const gknown = new Set(['smg(ger)', 'mg(ger)', 'pak40(ger)', 'tiger(ger)']);
    const gmk = (sx, o) => F.sim(Object.assign({ goh: true, files: gfiles(sx), money: 2000, income: 5, flags: GFL(), known: gknown, countdown: 1500 }, o || {}));
    const logOf = G => [...G.files.values()].map(v => String((v && v.text) || v)).join('\n');
    let G = gmk({}); G.start(); G.seconds(20);
    ok(G.prints.includes('bot habits: on (battle_zones)') && G.buys.length > 3 && G.orders.length > 3 && !G.crashes.length, 'goh: all habits off, the mode buys and orders as before ' + JSON.stringify(G.prints));
    G = gmk({ attack: { on: true } }, { mode: 'campaign_capture_the_flag' }); G.start(); G.seconds(10);
    ok(G.prints.some(p => /off in conquest/.test(p)) && G.buys.length > 0 && G.handlers.size === 4, 'goh conquest: habits off, the mode plays with its own handlers');
    G = gmk(null); G.start(); G.seconds(10);
    ok(G.prints.some(p => /could not be read/.test(p)) && G.buys.length > 0, 'goh: no settings file, habits off, the mode buys');
    G = gmk({ tanks: { on: true, every: 1, units: [{ unit: 'ghost', army: 'ger' }, { unit: 'pak40(ger)', army: 'ger' }] }, log: { on: true } }, { tanks: true }); G.start(); G.seconds(20);
    ok(G.buys.length > 3 && G.buys.every(b => b.unit === 'pak40(ger)') && !G.crashes.length && /answer tanks, instead of/.test(logOf(G)), 'goh tanks: enemy armour seen (QueryScene) -> the anti-tank list; a unit the game does not know is never bought (no crash)');
    ok([...G.files.keys()].some(k => /Documents\\My Games\\Gates of Hell\\log\\bot_habits_3\.log$/.test(k)) && /mode battle_zones \(order habits on\)/.test(logOf(G)), 'goh log: in the Gates of Hell log folder, says the mode');
    G = gmk({ tanks: { on: true, every: 1, units: [{ unit: 'pak40(ger)', army: 'ger' }] } }, { tanks: false }); G.start(); G.seconds(10);
    ok(G.buys.length > 0 && !G.buys.some(b => b.unit === 'pak40(ger)'), 'goh tanks: no enemy armour, the mode\'s own buys');
    G = gmk({ cap: { on: true, max: 2 } }); G.start(); G.seconds(30);
    ok(G.squads.size === 2 && G.buys.length === 2, 'goh cap: no buys while 2 squads are alive (the mode\'s TrySpawnUnit held) ' + G.buys.length);
    G = gmk({ attack: { on: true, size: 2, wait: 5 }, log: { on: true } }); G.start(); G.seconds(12);
    ok(/group of 2 squads attacks flag f3/.test(logOf(G)) && G.orders.some(o => o.flag === 'f3') && G.orders.some(o => o.flag === 'f1'), 'goh battle zones: attack together (wait at our flag, then one enemy flag)');
    G = gmk({ attack: { on: true, size: 2, wait: 5 }, log: { on: true } }, { mode: 'frontlines' }); G.start(); G.seconds(12);
    ok(G.orders.length > 0 && G.orders.every(o => o.flag === 'f2') && /order habits off in this mode/.test(logOf(G)), 'goh frontlines: order habits off, the mode\'s own orders');
    G = gmk({ attack: { on: true, size: 2, wait: 5 } }, { waypoints: ['w1'] }); G.start(); G.seconds(6);
    ok(G.prints.some(p => /waypoints/.test(p)) && !G.orders.some(o => o.flag === 'f3'), 'goh: a map with waypoints keeps the order habits off');
    G = gmk({ front: { on: true, any: 0 } }); G.start(); G.tag(101, '_lua_mi'); G.seconds(6);
    ok(!G.orders.some(o => o.squad === 101) && G.orders.some(o => o.squad === 102 && o.flag === 'f2'), 'goh: a squad the map script holds (_lua_mi) is left alone; others get the front line ' + JSON.stringify(G.orders.slice(0, 4)));
    G = gmk({ replace: { on: true, confirm: 4, max: 3 }, log: { on: true } }, { income: 0, money: 400 }); G.start(); G.seconds(8);
    const g1 = [...G.squads.keys()][0]; G.money = 1000; G.kill(g1); G.seconds(12);
    ok(/lost: buying it again/.test(logOf(G)) && /replaces a lost squad/.test(logOf(G)), 'goh replace: a lost squad is bought again');
    // the habit code fails AFTER the real Spawn went through: the buy is not made a second time; extra arguments reach the game
    G = gmk({}); G.start();
    G.lua.exec('BotHabitsState.bought = function() error("after the buy") end; local r = BotHabitsState.spawnProxy(nil, "smg(ger)", 2, "more") ; print("spawn said " .. tostring(r))');
    ok(G.spawnCalls.length === 1 && G.spawnCalls[0].more[0] === 'more' && G.buys.length === 1 && G.prints.includes('spawn said true') && G.prints.some(p => /habits stopped/.test(p)),
      'goh buy: an error after the real Spawn never calls Spawn again (one buy, its answer kept), extra arguments forwarded ' + JSON.stringify(G.spawnCalls) + JSON.stringify(G.prints));
    // the habit code fails BEFORE Spawn: the mode's own buy still goes, once
    G = gmk({}); G.start();
    G.lua.exec('BotHabitsState.decide = function() error("before the buy") end; local r = BotHabitsState.spawnProxy(nil, "smg(ger)", 2) ; print("spawn said " .. tostring(r))');
    ok(G.spawnCalls.length === 1 && G.buys.length === 1 && G.prints.includes('spawn said true'), 'goh buy: an error before Spawn: the mode\'s buy goes through once');
    // the mode's own order runs with the proxy and the BotApi that was there before comes back (not always the real one)
    G = gmk({}); G.start();
    G.lua.exec('local mine = setmetatable({}, {__index = BotApi}); local was = BotApi; BotApi = mine; BotHabitsState.off = true; BotHabitsState.order(102, "x"); print("prev kept " .. tostring(BotApi == mine)); BotApi = was');
    G.lua.exec('BotHabitsState.captureProxy(nil, 102, "f3", "more")');
    ok(G.prints.includes('prev kept true') && G.orders.some(o => o.squad === 102 && o.flag === 'f3'), 'goh order: asMode puts back the BotApi it found ' + JSON.stringify(G.prints));
    ok(!/function\(self, a, b, c, d\)/.test(GR) && /function\(self, \.\.\.\) return v\(realApi\.Commands, \.\.\.\) end/.test(GR) && /function H\.order\(squad, \.\.\.\)/.test(GR), 'goh runner: every proxied command and the order forward all arguments');
    // the entry line: pcall(require, ...) so a missing runner never stops the bot; an old require line is still found, upgraded and removed
    const oldMain = GMAIN + 'require([[/script/multiplayer/bot.habits.run]]) -- ARSENAL bot habits: old\r\n';
    ok(/^pcall\(require, \[\[\/script\/multiplayer\/bot\.habits\.run\]\]\)/.test(gen.HOOK) && gen.hasHook(oldMain) && gen.hasHook(gen.mainWith(GMAIN))
      && gen.mainWith(oldMain) === GMAIN + gen.HOOK + '\r\n' && gen.mainWithout(oldMain, GMAIN).same && gen.mainWithout(gen.mainWith(GMAIN), GMAIN).same && !gen.hasHook('-- a note about bot.habits.run\r\n'),
      'hook: pcall(require, [[...]]); old and new lines detected and removed, an old line upgraded in place');
    G = F.sim({ goh: true, files: { '/script/multiplayer/bot.main': gen.mainWith(GMAIN), '/script/multiplayer/modes/battlezones': GMODE }, money: 2000, income: 5, flags: GFL(), known: gknown, countdown: 1500 });
    G.start(); G.seconds(10);
    ok(G.buys.length > 0 && !G.crashes.length && !G.prints.includes('bot habits: on (battle_zones)'), 'goh hook: the runner file missing, the pcall line lets the mode play on ' + JSON.stringify(G.prints));
  }

  // ================= routes with a seeded game and mod
  const txt = a => a.join('\r\n') + '\r\n';
  const put = (root, rel, t) => { const f = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t, 'latin1'); };
  const game = path.join(work, 'game'), mod = path.join(game, 'mods', 'my_mod'); modInfo(mod);
  fs.writeFileSync((fs.mkdirSync(game, { recursive: true }), path.join(game, 'as64.exe')), '');
  put(game, 'resource/script/multiplayer/bot.main.lua', 'require([[/script/multiplayer/bot]])\r\n');
  put(game, 'resource/set/multiplayer/units/units_ger.set', txt(['{"pak40(ger)" (cost 300)}', '{"tiger1" (cost 900)}']));
  put(game, 'resource/set/multiplayer/units/units_rus.set', txt(['{"t34(rus)" (cost 400)}']));
  fs.mkdirSync(mod, { recursive: true });
  const ctx = { game: () => game, gameId: () => 'as64', kind: () => 'as2', allowLaunch: false, gamedir: game, tools: T, tmpRoot: work, runTool: async () => { throw new Error('no tool runs here'); } };
  const U = q => ({ searchParams: new URLSearchParams(q || '') });
  const Rt = P.routes, mf = rel => path.join(mod, 'resource', ...rel.split('/'));
  const st0 = await Rt['GET /api/x/bots/recipes/state'](U('mod=' + encodeURIComponent(mod)), null, ctx);
  ok(!st0.goh && !st0.installed && st0.from === 'default' && st0.settings.attack.on === false && !st0.warn.includes('mis33'), 'state: nothing in the mod yet ' + JSON.stringify(st0.warn));
  const un0 = await Rt['GET /api/x/bots/recipes/units'](U('mod=' + encodeURIComponent(mod)), null, ctx);
  ok(un0.units.some(u => u.unit === 'pak40(ger)' && u.army === 'ger') && un0.units.some(u => u.unit === 't34(rus)' && u.army === 'rus'), 'units: the game\'s buy cards by army');
  const want = { attack: { on: true, size: 3 }, tanks: { on: true, units: [{ unit: 'pak40(ger)', army: 'ger' }, { unit: 'ghost', army: 'ger' }] } };
  const pv = await Rt['POST /api/x/bots/recipes/preview'](null, { mod, settings: want }, ctx);
  ok(pv.files.length === 3 && pv.files.every(f => f.action === 'new') && !Object.values(gen.REL).some(r => fs.existsSync(mf(r))), 'preview: three new files, nothing written');
  ok(pv.warn.some(w => w.code === 'unknown' && w.unit === 'ghost') && pv.warn.some(w => w.code === 'mainCopy'), 'preview: unknown unit and the copied entry named ' + JSON.stringify(pv.warn));
  const wr = await Rt['POST /api/x/bots/recipes/write'](null, { mod, settings: want }, ctx);
  const wt = Object.values(gen.REL).map(r => (fs.existsSync(mf(r)) ? fs.readFileSync(mf(r), 'latin1') : ''));
  ok(wr.written && wt.every(t => t && !/[^\r]\n/.test(t)), 'write: three files, CRLF');
  ok(gen.hasHook(wt[2]) && wt[2].startsWith('require([[/script/multiplayer/bot]])') && wt[1] === gen.runLua() && L.check(wt[0], 'd') === null && L.check(wt[2], 'm') === null, 'write: entry hooked after the game\'s line, runner as the template, all parse');
  const st1 = await Rt['GET /api/x/bots/recipes/state'](U('mod=' + encodeURIComponent(mod)), null, ctx);
  ok(st1.installed && st1.from === 'mod' && st1.settings.attack.on && st1.settings.attack.size === 3 && st1.files.run.current, 'state: the habits read back from the mod');
  const pv2 = await Rt['POST /api/x/bots/recipes/preview'](null, { mod, settings: st1.settings }, ctx);
  ok(pv2.files.every(f => f.action === 'same'), 'preview after write: no change');
  {   // the written mod runs in the fake host: the files as the engine would load them
    const S2 = F.sim({ files: { '/script/multiplayer/bot.main': wt[2], '/script/multiplayer/bot': BOT, '/script/multiplayer/bot.data': DATA, '/script/multiplayer/bot.habits.run': wt[1], '/script/multiplayer/bot.habits': wt[0] }, money: 500, income: 3, flags: FL() });
    S2.start(); S2.seconds(30);
    ok(S2.prints.includes('bot habits: on') && S2.buys.length > 0, 'the written files run in the fake host');
  }
  const rm0 = await Rt['POST /api/x/bots/recipes/remove'](null, { mod, write: false }, ctx);
  ok(rm0.files.length === 3 && !rm0.removed && fs.existsSync(mf(gen.REL.run)), 'remove preview: three files named, nothing removed');
  const rm1 = await Rt['POST /api/x/bots/recipes/remove'](null, { mod, write: true }, ctx);
  ok(rm1.removed && !Object.values(gen.REL).some(r => fs.existsSync(mf(r))) && rm1.files.find(f => f.key === 'main').action === 'delete', 'remove: the mod copy of the entry deleted (only the stock line was left), runner and settings gone');
  // the mod's own entry with an extra line: the line stays, only ours goes; a foreign settings file stays
  put(mod, 'resource/' + gen.REL.main, txt(['require([[/script/multiplayer/bot]])', 'print("mine")']));
  await Rt['POST /api/x/bots/recipes/write'](null, { mod, settings: want }, ctx);
  put(mod, 'resource/' + gen.REL.data, txt(['BotHabits = {}']));
  const rm2 = await Rt['POST /api/x/bots/recipes/remove'](null, { mod, write: true }, ctx);
  const m2 = fs.readFileSync(mf(gen.REL.main), 'latin1');
  ok(!gen.hasHook(m2) && /print\("mine"\)/.test(m2) && fs.existsSync(mf(gen.REL.data)) && rm2.keep.includes(gen.REL.data) && !fs.existsSync(mf(gen.REL.run)), 'remove: the mod\'s own entry kept without our line, a foreign settings file kept');
  // MoW:AS2 still flags MIS-33 in the state (the page says it once in Details), GoH refuses with a code
  const stm = await Rt['GET /api/x/bots/recipes/state'](U('mod=' + encodeURIComponent(mod) + '&game=mowas2'), null, ctx);
  ok(stm.warn.includes('mis33'), 'mowas2: the MIS-33 flag in the state');
  let e = null;
  // GoH: a seeded GoH install (its bot.main.lua picks a mode script) and a mod outside it; the GoH runner, CRLF, Undo; the install refused
  const ggame = path.join(work, 'goh'), gmod = modInfo(path.join(work, 'outside', 'goh_mod'));
  put(ggame, 'binaries/x64/call_to_arms.exe', '');
  const GSTOCK = txt(['local function initializeBotAI()', '  require("resource/script/multiplayer/modes/battlezones")', 'end', 'initializeBotAI()']);
  put(ggame, 'resource/script/multiplayer/bot.main.lua', GSTOCK);
  const gctx = Object.assign({}, ctx, { game: () => null, gameId: () => 'goh', curDir: () => ggame, gohDir: () => ggame, kind: () => 'goh', gamedir: ggame });
  const gf = rel => path.join(gmod, 'resource', ...rel.split('/')), gq = U('mod=' + encodeURIComponent(gmod) + '&game=goh');
  const stg = await Rt['GET /api/x/bots/recipes/state'](gq, null, gctx);
  ok(stg.goh === true && /GHMIS-66/.test(stg.plain) && stg.settings && stg.meta.goh.attack === 'bz' && stg.meta.goh.cap === 'all' && stg.proof.proven === false && !stg.warn.includes('mainNoBot') && !stg.warn.includes('mis33'), 'goh state: the card works, per-habit notes, not proven there ' + JSON.stringify(stg.warn));
  const gpv = await Rt['POST /api/x/bots/recipes/preview'](null, { mod: gmod, game: 'goh', settings: want }, gctx);
  ok(gpv.files.length === 3 && gpv.files.every(f => f.action === 'new') && !fs.existsSync(gf(gen.REL.run)) && gpv.warn.some(w => w.code === 'mainCopy') && !gpv.warn.some(w => w.code === 'mainNoBot'), 'goh preview: three new files, nothing written ' + JSON.stringify(gpv.warn));
  const gwr = await Rt['POST /api/x/bots/recipes/write'](null, { mod: gmod, game: 'goh', settings: want }, gctx);
  const gwt = Object.values(gen.REL).map(r => (fs.existsSync(gf(r)) ? fs.readFileSync(gf(r), 'latin1') : ''));
  ok(gwr.written && gwr.undo && gwt.every(t => t && !/[^\r]\n/.test(t)) && gwt[1] === gen.runLua('goh') && gwt[2].startsWith(GSTOCK) && gen.hasHook(gwt[2]) && /battle zones and ammunition only/.test(gwt[0]) && /Gates of Hell log folder/.test(gwt[0]), 'goh write: GoH runner, the game\'s entry + our line, GoH notes in the settings, CRLF');
  const stg1 = await Rt['GET /api/x/bots/recipes/state'](gq, null, gctx);
  ok(stg1.installed && stg1.files.run.current && stg1.settings.attack.size === 3, 'goh state: read back, the runner current');
  const gu = await Rt['POST /api/x/bots/recipes/undo'](null, { mod: gmod, game: 'goh' }, gctx);
  ok(gu.undone && !Object.values(gen.REL).some(r => fs.existsSync(gf(r))), 'goh undo: the new files gone');
  await Rt['POST /api/x/bots/recipes/write'](null, { mod: gmod, game: 'goh', settings: want }, gctx);
  const grm = await Rt['POST /api/x/bots/recipes/remove'](null, { mod: gmod, game: 'goh', write: true }, gctx);
  ok(grm.removed && grm.files.find(f => f.key === 'main').action === 'delete' && !Object.values(gen.REL).some(r => fs.existsSync(gf(r))), 'goh remove: the entry copy (game\'s + our line) deleted, runner and settings gone');
  e = null; try { await Rt['POST /api/x/bots/recipes/write'](null, { mod: path.join(ggame, 'resource'), game: 'goh', settings: want }, gctx); } catch (x) { e = x; }
  ok(e && /^bots\.recipes\.e\.(inGame|guard)\b/.test(e.message) && !fs.existsSync(path.join(ggame, 'resource', ...gen.REL.run.split('/'))), 'goh: a write into the game install refused ' + (e && e.message));
  { const gm2 = modInfo(path.join(ggame, 'mods', 'not_ours'));
    e = null; try { await Rt['POST /api/x/bots/recipes/write'](null, { mod: gm2, game: 'goh', settings: want }, gctx); } catch (x) { e = x; }
    ok(e && /^bots\.recipes\.e\.guard\b/.test(e.message) && !fs.existsSync(path.join(gm2, 'resource')), 'goh: a GoH mod ARSENAL did not make refused without Advanced ' + (e && e.message.slice(0, 40))); }
  { const gempty = path.join(work, 'goh_empty'); put(gempty, 'binaries/x64/call_to_arms.exe', ''); const ectx = Object.assign({}, gctx, { curDir: () => gempty, gohDir: () => gempty, gamedir: gempty });
    const gm3 = modInfo(path.join(work, 'outside', 'goh_mod3'));
    e = null; try { await Rt['POST /api/x/bots/recipes/preview'](null, { mod: gm3, game: 'goh', settings: want }, ectx); } catch (x) { e = x; }
    ok(e && e.message.split(' ')[0] === 'bots.recipes.e.gohNoMain' && EN['bots.recipes.e.gohNoMain'], 'goh: no bot.main.lua anywhere -> refused with a worded code, never the AS2 stock line ' + (e && e.message)); }
  const glg = await Rt['GET /api/x/bots/recipes/log'](gq, null, gctx);
  ok(glg && Array.isArray(glg.files), 'goh log route answers');
  e = null; try { await Rt['POST /api/x/bots/recipes/write'](null, { mod: path.join(game, 'resource'), settings: want }, ctx); } catch (x) { e = x; }
  ok(e && e.message === 'bots.recipes.e.inGame' && EN[e.message], 'write into the game install refused with a worded code ' + (e && e.message));
  e = null; try { await Rt['POST /api/x/bots/recipes/write'](null, { mod: '', settings: want }, ctx); } catch (x) { e = x; }
  ok(e && /^bots\.recipes\.e\.\w+/.test(e.message) && EN[e.message.split(' ')[0]], 'no mod: a worded code ' + (e && e.message));
  const lg = await Rt['GET /api/x/bots/recipes/log'](U(''), null, ctx);
  ok(lg && Array.isArray(lg.files), 'log route answers');
  { const pf = P._.proof(), pj = JSON.parse(fs.readFileSync(path.join(__dirname, 'proof.json'), 'utf8'));
    // the run reports are left out of the public copy on purpose: there only the path is checked, the file itself in the source tree
    const root = path.join(__dirname, '..', '..', '..', '..', '..', '..'), hasPlan = fs.existsSync(path.join(root, 'plan'));
    if (!hasPlan) console.log('skip proof.json report file: plan/ is not in this copy (the run reports are left out of the public copy on purpose)');
    ok(pf.proven === true && (hasPlan ? pj.report === 'plan/reports/ai-pages-game-checks.md' && fs.existsSync(path.join(root, pj.report)) : typeof pj.report === 'string' && pj.report.trim() !== ''), 'proof.json: proven in the game, with the report path ' + pj.report);
    ok(JSON.stringify(pf.untried) === JSON.stringify(['fallback', 'front', 'tanks', 'save', 'phases', 'cap']) && !pf.untried.some(x => ['attack', 'replace', 'log'].includes(x)), 'proof.json: not yet tried = only the habits that match did not have on ' + JSON.stringify(pf.untried)); }

  // ================= undo on the routes: exact bytes back, refused after a change by hand
  {
    const mu = path.join(game, 'mods', 'mod_undo'), own = txt(['require([[/script/multiplayer/bot]])', '-- mine \xe9']); modInfo(mu);
    put(mu, 'resource/' + gen.REL.main, own);
    const before = fs.readFileSync(path.join(mu, 'resource', ...gen.REL.main.split('/')));
    const w1 = await Rt['POST /api/x/bots/recipes/write'](null, { mod: mu, settings: want }, ctx);
    ok(w1.undo === true, 'undo: write offers Undo');
    const u1 = await Rt['POST /api/x/bots/recipes/undo'](null, { mod: mu }, ctx);
    const after = fs.readFileSync(path.join(mu, 'resource', ...gen.REL.main.split('/')));
    ok(u1.undone && Buffer.compare(before, after) === 0 && !fs.existsSync(path.join(mu, 'resource', ...gen.REL.run.split('/'))) && !fs.existsSync(path.join(mu, 'resource', ...gen.REL.data.split('/'))), 'undo: exact bytes of the entry back, new files gone ' + JSON.stringify(u1.files));
    e = null; try { await Rt['POST /api/x/bots/recipes/undo'](null, { mod: mu }, ctx); } catch (x) { e = x; }
    ok(e && e.message === 'bots.recipes.e.noUndo', 'undo twice: nothing to undo ' + (e && e.message));
    await Rt['POST /api/x/bots/recipes/write'](null, { mod: mu, settings: want }, ctx);
    put(mu, 'resource/' + gen.REL.data, txt(['-- changed by hand']));
    e = null; try { await Rt['POST /api/x/bots/recipes/undo'](null, { mod: mu }, ctx); } catch (x) { e = x; }
    ok(e && /^bots\.recipes\.e\.changed /.test(e.message) && fs.readFileSync(path.join(mu, 'resource', ...gen.REL.data.split('/')), 'latin1') === txt(['-- changed by hand']) && gen.hasHook(fs.readFileSync(path.join(mu, 'resource', ...gen.REL.main.split('/')), 'latin1')), 'undo after a change by hand: refused, nothing touched ' + (e && e.message));
  }

  // ================= the client in the page fake DOM
  const mod2 = path.join(game, 'mods', 'mod_two'); fs.mkdirSync(mod2, { recursive: true }); modInfo(mod2);
  put(mod2, 'resource/localization/desc.lng', txt(['{tags', ' {entity', '  {"pak40(ger)" "Pak 40 gun"}', ' }', '}']));
  const doc = FD.make(), pf = BC.pageFns(doc), h = pf.h;
  const missing = new Set();
  // the frame's shared keys (bots.btn.*, bots.details, bots.kind.*) may be absent here: the part falls back to its own words
  const tx = (k, p) => { if (!(k in EN)) { if (k.startsWith('bots.recipes.') && !/\.(one|few|many|other)$/.test(k)) missing.add(k); return k; } return EN[k].replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? String(p[x]) : m)); };
  const kits = [], parts = [], pend = [], calls = [], asks = [], gone = [], changedN = [];
  const searchKit = (inp, o) => { kits.push({ inp, o, inPage: !!inp.parentNode }); };
  const askDo = o => { asks.push(o); return { then: (y) => y(true) }; };
  const LOG = { dir: 'X:\\log', files: [{ name: 'bot_habits_3.log', path: 'X:\\log\\bot_habits_3.log', mtime: 0, lines: ['match start: map a', 'bought smgs(ger) (stock)'], more: 0 }] };
  const MAPS = { state: 'done', maps: [{ key: 'map/multi/2x2_argentan', name: 'Argentan 2x2', players: 4 }] };
  const env = (gid, mod) => ({
    mod, gid, reload() {}, go: id => gone.push(id),
    api(method, p, data, cb) {
      calls.push(method + ' ' + p);
      if (p === 'recipes/log') { pend.push(Promise.resolve().then(() => cb(null, LOG))); return; }
      if (p === 'botmatch/maps') { pend.push(Promise.resolve().then(() => cb(null, MAPS))); return; }
      const key = method + ' /api/x/bots/' + p;
      const pr = Promise.resolve().then(() => (method === 'GET' ? Rt[key](U('mod=' + encodeURIComponent(mod) + '&game=' + gid), null, ctx) : Rt[key](null, Object.assign({ mod, game: gid }, data || {}), ctx))).then(j => cb(null, j), x => cb(x.message));
      pend.push(pr);
    },
    kit: {
      leaf: (id, kids, name) => h('div', name ? { blk: id, 'data-blkname': name } : { blk: id }, kids),
      hint: (id, t) => h('div', { blk: id }, [h('div', { class: 'hint', text: t })]),
      section: (id, title, kids) => h('div', { class: 'card', blk: id, box: 'col', 'data-blkname': title }, [h('div', { blk: id + '.title' }, [h('h3', { text: title })])].concat(kids)),
      errBox: m => h('div', { class: 'err', text: m }),
      qs: o => new URLSearchParams(o).toString(),
      hitsOf: (items, s, done) => { s = String(s || '').toLowerCase(); const a = items.filter(it => it.lo.indexOf(s) >= 0); done(a.slice(0, 30), Math.max(0, a.length - 30)); },
      editor: () => ({ el: h('div'), load() {} }),
    },
  });
  const flush = async () => { for (let k = 0; k < 8; k++) { while (pend.length) await pend.shift(); await new Promise(r => setImmediate(r)); } };
  const BOTS_UI = { changed: w => changedN.push(w) };
  new Function('BOTS_PARTS', 'h', 'tx', 'searchKit', 'askDo', 'fld', 'confirm', 'document', 'BOTS_UI', P.script)(parts, h, tx, searchKit, askDo, pf.fld, () => true, doc, BOTS_UI);
  ok(parts.length === 1 && parts[0].id === 'recipes' && parts[0].group === 'B' && parts[0].title() === EN['bots.recipes.title'], 'client: one part pushed');
  const outside = (el, re) => { const all = el.all(); return all.filter(x => x.tagName === 'DIV' || x.tagName === 'SPAN').some(x => re.test(x.textContent) && !x.all().some(y => y.tagName === 'DIV') && !(function up(n) { for (; n; n = n.parentNode) if (n.tagName === 'DETAILS') return true; return false; })(x)); };
  const root = doc.createElement('div'); root.setAttribute('data-blkroot', 'bots');
  parts[0].draw(env('as64', mod2)).forEach(el => root.appendChild(el));
  await flush();
  const probs = BC.checkScreen(root, 'bots');
  ok(probs.length === 0, 'client: block rules ' + probs.slice(0, 6).join(' | '));
  const bids = root.all().map(x => x.getAttribute && x.getAttribute('data-blk')).filter(Boolean);
  ok(bids.every(i => i.startsWith('bots.recipes')) && gen.HABITS.every(H => bids.includes('bots.recipes.h.' + H.id) && bids.includes('bots.recipes.h.' + H.id + '.on')), 'client: a block per habit ' + bids.length);
  ok(root.has(EN['bots.recipes.status.off']) && root.has(EN['bots.recipes.proven']) && !root.has(EN['bots.recipes.untested']) && root.has(EN['bots.recipes.where']), 'client: status, the tried-in-game line, where map timing lives');
  { const un = id => root.all().find(x => x.getAttribute && x.getAttribute('data-untried') === id);
    ok(un('fallback').textContent.includes(EN['bots.recipes.untried']) && un('attack').textContent === '' && un('replace').textContent === '' && un('log').textContent === '', 'client: not yet tried said on the untried habits only'); }
  ok(kits.every(k => k.inPage), 'client: every searchKit box was in its row when the kit was attached');
  const blkOf = id => root.all().find(x => x.getAttribute && x.getAttribute('data-blk') === id);
  ok(!outside(root, /MIS-33/) && blkOf('bots.recipes.details').has(EN['bots.recipes.safe']), 'client: the MoW:AS2 match-end note said once, in Details');
  const btn = t => root.all().find(x => x.tagName === 'BUTTON' && x.textContent === t);
  btn(EN['bots.recipes.where.go']).click();
  ok(gone[0] === 'group.E', 'client: the Map Scripts link goes to group E');
  const cbOf = id => doc.getElementById('bots-recipes-' + id);
  const bPrev = btn(EN['bots.recipes.b.preview']), bWrite = btn(EN['bots.recipes.b.write']), bRm = btn(EN['bots.recipes.b.remove']), bUndo = btn(EN['bots.recipes.b.undo']);
  ok(cbOf('attack') && cbOf('attack').checked === false && !bPrev.disabled && bWrite.disabled && bRm.disabled && bUndo.disabled && !bUndo.hidden, 'client: loaded, all off, Write and Reset off, Undo greyed (nothing to undo yet)');
  const optsOf = id => blkOf('bots.recipes.h.' + id + '.opts');
  ok(gen.HABITS.filter(H => optsOf(H.id)).every(H => optsOf(H.id).hidden) && blkOf('bots.recipes.h.attack.on').has(EN['bots.recipes.h.attack.d']), 'client: nine tick rows with one line each, numbers hidden until ticked');
  const inOf = id => blkOf(id).all().find(x => x.tagName === 'INPUT');
  ok(inOf('bots.recipes.h.attack.n.size').value === '4' && inOf('bots.recipes.h.save.n.wait').value === '120' && blkOf('bots.recipes.h.attack.n.size').has('suggested 4, 1 to 30'), 'client: number boxes show the suggested values and range');
  cbOf('attack').checked = true; cbOf('attack').fire('change');
  ok(!optsOf('attack').hidden && optsOf('tanks').hidden, 'client: ticking a habit shows its numbers only');
  const sz = inOf('bots.recipes.h.attack.n.size'); sz.value = '6'; sz.fire('input');
  cbOf('tanks').checked = true; cbOf('tanks').fire('change');
  const tk = kits.find(k => k.o.key === 'bots.recipes.tanks');
  ok(tk && tk.o.browse && tk.o.browse.start === 'entity' && typeof tk.o.index === 'function' && kits.some(k => k.o.key === 'bots.recipes.save'), 'client: unit boxes are searchKit boxes with history keys, index and Browse');
  let hits = null; tk.o.index('pak 40', a => { hits = a; }); await flush();
  ok(hits && hits.length === 1 && hits[0].value === 'pak40(ger)' && hits[0].label === 'Pak 40 gun' && /pak40\(ger\)/.test(hits[0].hint) && hits.every(x => typeof x.lo === 'string'), 'client: unit index finds the in-game name ' + JSON.stringify(hits));
  tk.o.onPick('pak40(ger)', hits[0], 'list');
  ok(blkOf('bots.recipes.h.tanks.units').has('Pak 40 gun'), 'client: the picked unit shown by its in-game name');
  bPrev.click(); await flush();
  const res = blkOf('bots.recipes.res');
  ok(!bWrite.disabled && res.has(EN['bots.recipes.will']) && res.has('New squads wait until 6 are ready') && res.has('one of: Pak 40 gun') && !fs.existsSync(path.join(mod2, 'resource', ...gen.REL.data.split('/'))), 'client: preview leads with what the bot will do, nothing written');
  const fold1 = res.all().find(x => x.tagName === 'DETAILS');
  ok(fold1 && fold1.has(gen.REL.data + ': ' + EN['bots.recipes.act.new']) && !fold1.open, 'client: the exact file change is folded');
  ok(res.has(EN['bots.recipes.tipLog']), 'client: the preview suggests Match log when it is off');
  sz.value = '7'; sz.fire('input');
  ok(bWrite.disabled && root.has(EN['bots.recipes.changed'].replace('{preview}', 'Preview')), 'client: a change after the preview turns Write off');
  bPrev.click(); await flush();
  bWrite.click(); await flush();
  const dpath = path.join(mod2, 'resource', ...gen.REL.data.split('/'));
  const got = fs.existsSync(dpath) ? gen.normalize(gen.readData(fs.readFileSync(dpath, 'latin1'))).settings : null;
  ok(asks.length === 1 && asks[0].danger && asks[0].lines.some(l => /until 7 are ready/.test(l)) && got && got.attack.on && got.attack.size === 7 && got.tanks.units.some(u => u.unit === 'pak40(ger)'), 'client: Write asks with the same sentences, then writes what the boxes say');
  ok(res.has('Done: the bot has 2 new habits in your mod.') && res.has(EN['bots.recipes.seeH'] + ' ' + EN['bots.recipes.done.see']) && !res.has(EN['bots.recipes.done.log']) && root.has(EN['bots.recipes.status.on']) && !bRm.disabled && !bUndo.disabled && changedN.includes('recipes'), 'client: done box without the log line (log off), status on, Undo shown, frame told');
  btn(EN['bots.recipes.done.next']).click();
  ok(gone.includes('bots.botmatch'), 'client: next step goes to Try a bot match');
  bUndo.click(); await flush();
  ok(!fs.existsSync(dpath) && !fs.existsSync(path.join(mod2, 'resource', ...gen.REL.main.split('/'))) && res.has(EN['bots.recipes.undo.done']) && bUndo.disabled && !res.all().some(x => x.getAttribute && x.getAttribute('data-done')), 'client: Undo puts the mod back (new files gone)');
  // the log habit on: the done box says where to read the log
  cbOf('log').checked = true; cbOf('log').fire('change');
  bPrev.click(); await flush(); bWrite.click(); await flush();
  ok(res.has(EN['bots.recipes.done.log']) && !res.has(EN['bots.recipes.tipLog']), 'client: with Match log on, the done box says where to read it');
  put(mod2, 'resource/' + gen.REL.data, txt(['-- by hand']));
  bUndo.click(); await flush();
  ok(res.has('was changed after the write, so Undo left everything as it is') && fs.existsSync(dpath), 'client: Undo after a change by hand refused in plain words');
  bRm.click(); await flush();
  ok(asks.length === 3 && !fs.existsSync(path.join(mod2, 'resource', ...gen.REL.run.split('/'))) && res.has(EN['bots.recipes.rm.done']), 'client: Reset asks, then takes the habits out');
  btn(EN['bots.recipes.b.log']).click(); await flush();
  ok(root.has('bought smgs(ger) (stock)') && root.has('bot_habits_3.log'), 'client: Show the last bot log (under More options)');
  // the rule map box: game map names, the folder name as the value
  cbOf('phases').checked = true; cbOf('phases').fire('change');
  btn(EN['bots.recipes.r.add']).click();
  const rk = kits.filter(k => k.o.key === 'bots.recipes.rulemap').pop();
  let mh = null; rk.o.index('argentan', a => { mh = a; }); await flush();
  ok(mh && mh.length === 1 && mh[0].label === 'Argentan 2x2' && mh[0].value === '2x2_argentan' && rk.inPage, 'client: rule map box lists the game map names ' + JSON.stringify(mh));
  // MoW:AS2: no MIS-33 warning up front
  const rw2 = doc.createElement('div'); parts[0].draw(env('mowas2', mod2)).forEach(el => rw2.appendChild(el)); await flush();
  ok(!outside(rw2, /MIS-33|ends the whole match/), 'client mowas2: the match-end note only in Details');
  const r3 = doc.createElement('div'); parts[0].draw(env('as64', '')).forEach(el => r3.appendChild(el));
  ok(r3.has(EN['bots.recipes.needmod']), 'client: no mod, the hint');
  // per-game wording: the MoW:AS2 tab says where it was tried and where not (kit.game when the frame has it, else the same names here)
  { const mro = doc.createElement('div'); parts[0].draw(env('mowas2', mod2)).forEach(el => mro.appendChild(el)); await flush();
    ok(mro.has('Tried in AS64; not yet tried in MoW:AS2.') && !mro.has(EN['bots.recipes.proven']) && mro.has('None of the habits has been tried in MoW:AS2 yet.'), 'client MoW:AS2: tried in AS64, not yet in MoW:AS2');
    const un2 = mro.all().find(x => x.getAttribute && x.getAttribute('data-untried') === 'fallback');
    ok(un2 && un2.textContent.includes(EN['bots.recipes.untried.other']), 'client MoW:AS2: an untried habit says no game yet');
    const e3 = env('mowas2', mod2); e3.kit.game = g => (g === 'mowas2' ? 'Assault Squad 2' : g === 'as64' ? 'AS64' : g);
    const m3 = doc.createElement('div'); parts[0].draw(e3).forEach(el => m3.appendChild(el)); await flush();
    ok(m3.has('Tried in AS64; not yet tried in Assault Squad 2.'), 'client: the game name comes from kit.game when the frame has it');
  }
  // GoH: the same card (GoH game from the frame, the GoH fixture), the lead line, a note under each ticked habit, no bot match next step
  {
    const genv = (gid, m) => { const e0 = env(gid, m); const api0 = e0.api; e0.api = (method, p, data, cb) => {
      if (p === 'mission/maps') { calls.push(method + ' ' + p); pend.push(Promise.resolve().then(() => cb(null, MAPS))); return; }
      if (p.startsWith('recipes/') && p !== 'recipes/log') { calls.push(method + ' ' + p); const key = method + ' /api/x/bots/' + p;
        pend.push(Promise.resolve().then(() => (method === 'GET' ? Rt[key](U('mod=' + encodeURIComponent(m) + '&game=goh'), null, gctx) : Rt[key](null, Object.assign({ mod: m, game: 'goh' }, data || {}), gctx))).then(j => cb(null, j), x => cb(x.message))); return; }
      api0(method, p, data, cb); }; return e0; };
    const gmod2 = modInfo(path.join(work, 'outside', 'goh_mod2'));
    const gro = doc.createElement('div'); gro.setAttribute('data-blkroot', 'bots'); parts[0].draw(genv('goh', gmod2)).forEach(el => gro.appendChild(el)); await flush();
    const gp = BC.checkScreen(gro, 'bots');
    ok(gp.length === 0, 'client GoH: block rules ' + gp.slice(0, 6).join(' | '));
    const gb = id => gro.all().find(x => x.getAttribute && x.getAttribute('data-blk') === id), gcb = id => gro.all().find(x => x.tagName === 'INPUT' && x.getAttribute('id') === 'bots-recipes-' + id);
    ok(gb('bots.recipes.goh') && gb('bots.recipes.goh').has(EN['bots.recipes.goh']) && gro.has(EN['bots.recipes.untested']) && gro.has(EN['bots.recipes.status.off']) && gcb('attack'), 'client GoH: the card works, the lead says where, not yet tried');
    ok(gb('bots.recipes.h.attack.goh').has(EN['bots.recipes.goh.n.bz']) && gb('bots.recipes.h.cap.goh').has(EN['bots.recipes.goh.n.all']) && gb('bots.recipes.h.tanks.goh').has(EN['bots.recipes.goh.n.tanks']) && gb('bots.recipes.h.log.goh').has(EN['bots.recipes.goh.n.log']), 'client GoH: a note under each habit');
    ok(gb('bots.recipes.details').has(EN['bots.recipes.goh.safe']) && gb('bots.recipes.details').has(EN['bots.recipes.goh.files']) && !gb('bots.recipes.details').has(EN['bots.recipes.safe']) && !outside(gro, /GHMIS-66/), 'client GoH: GoH safety and files in Details, the ID only there');
    const gbt = t => gro.all().find(x => x.tagName === 'BUTTON' && x.textContent === t);
    const c1 = gcb('cap'); c1.checked = true; c1.fire('change');
    gbt(EN['bots.recipes.b.preview']).click(); await flush();
    const na0 = asks.length; gbt(EN['bots.recipes.b.write']).click(); await flush();
    const gd = gro.all().find(x => x.getAttribute && x.getAttribute('data-done'));
    ok(asks.length === na0 + 1 && fs.existsSync(path.join(gmod2, 'resource', ...gen.REL.run.split('/'))) && fs.readFileSync(path.join(gmod2, 'resource', ...gen.REL.run.split('/')), 'latin1') === gen.runLua('goh') && gd && gd.has(EN['bots.recipes.goh.see']) && !gro.all().some(x => x.tagName === 'BUTTON' && x.textContent === EN['bots.recipes.done.next']), 'client GoH: Write asks, writes the GoH runner, the done box says how to see it in GoH, no bot match button');
    gcb('phases').checked = true; gcb('phases').fire('change'); gbt(EN['bots.recipes.r.add']).click();
    const grk = kits.filter(k => k.o.key === 'bots.recipes.rulemap').pop(); let gmh = null; grk.o.index('argentan', a => { gmh = a; }); await flush();
    ok(gmh && gmh.length === 1 && calls.includes('GET mission/maps') && !calls.slice(-6).includes('GET botmatch/maps'), 'client GoH: the rule map box reads mission/maps');
    gbt(EN['bots.recipes.b.undo']).click(); await flush();
    ok(!fs.existsSync(path.join(gmod2, 'resource', ...gen.REL.run.split('/'))), 'client GoH: Undo puts the mod back');
  }
  // ---- round 2: one Undo (greyed until there is something to undo, the done box goes after it), plurals, folder names, plain refusals
  {
    const mod3 = path.join(game, 'mods', 'mod_three'); fs.mkdirSync(mod3, { recursive: true }); modInfo(mod3);
    const r4 = doc.createElement('div'); r4.setAttribute('data-blkroot', 'bots'); parts[0].draw(env('as64', mod3)).forEach(el => r4.appendChild(el)); await flush();
    const undos = el => el.all().filter(x => x.tagName === 'BUTTON' && x.textContent === EN['bots.recipes.b.undo']);
    const b4 = t => r4.all().find(x => x.tagName === 'BUTTON' && x.textContent === t), cb4 = id => r4.all().find(x => x.tagName === 'INPUT' && x.getAttribute('id') === 'bots-recipes-' + id);
    const u0 = undos(r4)[0];
    ok(undos(r4).length === 1 && u0.disabled && u0.getAttribute('title') === EN['bots.recipes.b.undoNone'], 'client: one Undo, greyed with the reason while there is nothing to undo');
    ok(r4.has(EN['bots.recipes.lead'].replace('{preview}', 'Preview').replace('{write}', 'Write into my mod')), 'client: the lead names the buttons by their words');
    const c4 = cb4('cap'); c4.checked = true; c4.fire('change');
    const capIn = r4.all().find(x => x.getAttribute && x.getAttribute('data-blk') === 'bots.recipes.h.cap.n.max').all().find(x => x.tagName === 'INPUT');
    capIn.value = '1'; capIn.fire('input');
    b4(EN['bots.recipes.b.preview']).click(); await flush();
    const n0 = asks.length; b4(EN['bots.recipes.b.write']).click(); await flush();
    const a4 = asks[n0];
    ok(a4 && a4.lines[0] === 'Your mod "mod_three" gets 1 habit. In a match the bot will:' && a4.where === 'mod_three' && a4.lines.includes('The bot buys nothing while it has 1 squad on the map.'), 'client: Write asks with the folder name and singular forms: ' + JSON.stringify(a4 && a4.lines) + ' ' + (a4 && a4.where));
    const done = r4.all().find(x => x.getAttribute && x.getAttribute('data-done'));
    ok(done && !/\[object|HTML|,\s*$/.test(done.textContent) && done.all().some(x => x.tagName === 'LI' && x.textContent === 'The bot buys nothing while it has 1 squad on the map.') && done.has('Done: the bot has 1 new habit in your mod.'), 'client: the green box reads as sentences: ' + (done && done.textContent));
    ok(undos(r4).length === 1 && !undos(r4)[0].disabled && undos(r4)[0].getAttribute('title') === EN['bots.recipes.b.undoT'], 'client: still one Undo after Write, now usable ' + undos(r4).length + ' ' + undos(r4).map(x => x.disabled + '/' + x.getAttribute('title')).join(';'));
    // a fresh draw after a write knows Undo is possible (state canUndo)
    const r5 = doc.createElement('div'); parts[0].draw(env('as64', mod3)).forEach(el => r5.appendChild(el)); await flush();
    ok(undos(r5).length === 1 && !undos(r5)[0].disabled, 'client: a card drawn again after the write offers Undo');
    const st0 = calls.filter(c => c === 'GET recipes/state').length;
    undos(r4)[0].click(); await flush();
    ok(!r4.all().some(x => x.getAttribute && x.getAttribute('data-done')) && r4.has(EN['bots.recipes.undo.done']) && undos(r4)[0].disabled && calls.filter(c => c === 'GET recipes/state').length > st0, 'client: after Undo the done box goes, Undo greys, the state is read again');
    // refusals: the code as the third value (the frame translated the first) -> the sentence and its next step; anything else -> what to do
    const shown = [];
    const pr = [];
    const ru = {}; P.lang.forEach(r => { ru[r[0]] = r[2]; });
    const txr = (k, p) => { const s = ru[k] != null ? ru[k] : k; return p ? s.replace(/\{(\w+)\}/g, (m, n) => (p[n] == null ? m : String(p[n]))) : s; };
    new Function('BOTS_PARTS', 'h', 'tx', 'searchKit', 'askDo', 'fld', 'confirm', 'document', 'BOTS_UI', 'show', 'LANG', P.script)(pr, h, txr, searchKit, askDo, pf.fld, () => true, doc, BOTS_UI, id => shown.push(id), 'ru');
    const errEnv = (third, first) => Object.assign(env('as64', mod3), { api: (m, p, d, cb) => { if (p === 'recipes/state') cb(first, null, third); } });
    const re1 = doc.createElement('div'); pr[0].draw(errEnv({ key: 'bots.recipes.e.needmod', params: {}, message: 'bots.recipes.e.needmod' }, 'Сначала выберите папку мода')).forEach(el => re1.appendChild(el));
    const goM = re1.all().find(x => x.tagName === 'BUTTON' && x.getAttribute('data-next') === 'mods');
    ok(re1.has(ru['bots.recipes.e.needmod']) && goM && goM.textContent === ru['bots.recipes.go.mods'], 'client ru: a coded refusal (third value) says what to do, with the Mods page button');
    if (goM) goM.click();
    ok(shown.includes('mods'), 'client: the button opens the Mods page');
    const re2 = doc.createElement('div'); pr[0].draw(errEnv({ message: 'ECONNRESET socket hang up' }, 'ECONNRESET socket hang up')).forEach(el => re2.appendChild(el));
    ok(re2.has(ru['bots.recipes.e.other']) && re2.all().some(x => x.tagName === 'BUTTON' && x.textContent === ru['bots.recipes.b.again']) && !/^That did not work/.test(EN['bots.recipes.e.other']), 'client: an unknown failure says what to do and offers Read again');
    const re3 = doc.createElement('div'); pr[0].draw(errEnv({ key: 'bots.recipes.e.changed', params: { rel: 'resource/script/multiplayer/bot.habits.lua' } }, 'x')).forEach(el => re3.appendChild(el));
    ok(re3.has(ru['bots.recipes.e.changed']) && !outside(re3, /bot\.habits\.lua/) && re3.has('bot.habits.lua'), 'client: the file of a refusal only in Details');
    // ru plural forms through the real routes: 1, 3, 5, 21 squads; 1 and 5 times
    const r6 = doc.createElement('div'); pr[0].draw(env('as64', mod3)).forEach(el => r6.appendChild(el)); await flush();
    const in6 = (hid, n) => r6.all().find(x => x.getAttribute && x.getAttribute('data-blk') === 'bots.recipes.h.' + hid + '.n.' + n).all().find(x => x.tagName === 'INPUT');
    const tick6 = id => { const c = r6.all().find(x => x.tagName === 'INPUT' && x.getAttribute('id') === 'bots-recipes-' + id); if (!c.checked) { c.checked = true; c.fire('change'); } };
    tick6('cap'); tick6('replace');
    const say6 = async (cap, rep) => { in6('cap', 'max').value = String(cap); in6('cap', 'max').fire('input'); in6('replace', 'max').value = String(rep); in6('replace', 'max').fire('input');
      r6.all().find(x => x.tagName === 'BUTTON' && x.textContent === ru['bots.recipes.b.preview']).click(); await flush(); return r6.textContent; };
    const s1 = await say6(1, 1), s3 = await say6(3, 3), s5 = await say6(5, 5), s21 = await say6(21, 21);
    ok(/на карте 1 отряд\./.test(s1) && /не больше 1 раза за матч/.test(s1) && /на карте 3 отряда\./.test(s3) && /не больше 3 раз за матч/.test(s3) && /на карте 5 отрядов\./.test(s5) && /на карте 21 отряд\./.test(s21) && /не больше 21 раза/.test(s21), 'client ru: plural forms for 1, 3, 5, 21');
    ok(r6.all().some(x => x.tagName === 'BUTTON' && x.textContent === 'Предпросмотр') && r6.has(ru['bots.recipes.lead'].replace('{preview}', 'Предпросмотр').replace('{write}', 'Записать в мой мод')), 'client ru: the buttons and the lead use the same words');
    // Payback explained where the replace habit talks about lost squads
    const pb = r6.all().find(x => x.getAttribute && x.getAttribute('data-term') === 'payback');
    ok(pb && pb.getAttribute('title') === ru['bots.recipes.payback'] && pb.textContent === ru['bots.recipes.paybackWord'], 'client: Payback has its hover text');
    // round 3: the word after a number box follows the number typed (S20), in ru and uk
    const uOf = (hid, n) => r6.all().find(x => x.getAttribute && x.getAttribute('data-blk') === 'bots.recipes.h.' + hid + '.n.' + n).all().find(x => x.getAttribute && x.getAttribute('data-unit'));
    const typ = (hid, n, v) => { const i = in6(hid, n); i.value = String(v); i.fire('input'); return uOf(hid, n).textContent.trim(); };
    ok(typ('cap', 'max', 1) === 'отряд' && typ('cap', 'max', 3) === 'отряда' && typ('cap', 'max', 5) === 'отрядов' && typ('cap', 'max', 22) === 'отряда' && typ('replace', 'max', 3) === 'раза за матч' && typ('replace', 'confirm', 21) === 'секунду',
      'client ru: the word after a number box follows the number typed');
    tick6('fallback');
    ok(typ('fallback', 'every', 3) === 'минуты' && typ('fallback', 'every', 5) === 'минут' && typ('fallback', 'every', 1) === 'минуту', 'client ru: "каждые 3 минуты", "5 минут", "1 минуту"');
    { const uk = {}; P.lang.forEach(r => { uk[r[0]] = r[3]; }); const pu = [];
      new Function('BOTS_PARTS', 'h', 'tx', 'searchKit', 'askDo', 'fld', 'confirm', 'document', 'BOTS_UI', 'show', 'LANG', P.script)(pu, h, (k, p) => { const v = uk[k] != null ? uk[k] : k; return p ? v.replace(/\{(\w+)\}/g, (m, n) => (p[n] == null ? m : String(p[n]))) : v; }, searchKit, askDo, pf.fld, () => true, doc, BOTS_UI, () => {}, 'uk');
      const r7 = doc.createElement('div'); pu[0].draw(env('as64', mod3)).forEach(el => r7.appendChild(el)); await flush();
      const i7 = r7.all().find(x => x.getAttribute && x.getAttribute('data-blk') === 'bots.recipes.h.fallback.n.every'), inp = i7.all().find(x => x.tagName === 'INPUT'), uw = i7.all().find(x => x.getAttribute && x.getAttribute('data-unit'));
      inp.value = '3'; inp.fire('input'); const a3 = uw.textContent.trim(); inp.value = '5'; inp.fire('input');
      ok(a3 === 'хвилини' && uw.textContent.trim() === 'хвилин', 'client uk: "кожні 3 хвилини", "5 хвилин": ' + a3);
      ok(!/\[(V|T|I)\]/.test(r7.textContent) && r7.has(uk['bots.recipes.proofUntried'].split('{list}')[0]) && !r7.has('instance 5'), 'client uk: the in-game check note in the page language, marks in words'); }
    // the done box: Done pattern, To see it once, the log link opens the log (log on)
    { const mod4 = path.join(game, 'mods', 'mod_four'); fs.mkdirSync(mod4, { recursive: true }); modInfo(mod4);
      const r8 = doc.createElement('div'); parts[0].draw(env('as64', mod4)).forEach(el => r8.appendChild(el)); await flush();
      const c8 = r8.all().find(x => x.tagName === 'INPUT' && x.getAttribute('id') === 'bots-recipes-log'); c8.checked = true; c8.fire('change');
      const b8 = t => r8.all().find(x => x.tagName === 'BUTTON' && x.textContent === t);
      b8(EN['bots.recipes.b.preview']).click(); await flush(); b8(EN['bots.recipes.b.write']).click(); await flush();
      const d8 = r8.all().find(x => x.getAttribute && x.getAttribute('data-done'));
      const lb = d8 && d8.all().find(x => x.tagName === 'BUTTON' && x.getAttribute('data-log'));
      ok(d8 && /^Done: /.test(d8.textContent) && d8.textContent.split(EN['bots.recipes.seeH']).length === 2 && /try a bot match/.test(d8.textContent) && /Only the bots change/.test(d8.textContent) && lb && lb.textContent === EN['bots.recipes.b.log'], 'client: done box "Done: ..." + "To see it: try a bot match" once + the log link: ' + (d8 && d8.textContent));
      const c0 = calls.filter(c => c === 'GET recipes/log').length; if (lb) lb.click(); await flush();
      ok(calls.filter(c => c === 'GET recipes/log').length === c0 + 1 && r8.all().find(x => x.tagName === 'DETAILS' && x.getAttribute('data-blk') === 'bots.recipes.more').open, 'client: the log link opens More options and reads the log'); }
    // every sentence filled with real values, four columns: no {slot} left
    const vals = { list: 'Group attack, Replace losses', preview: 'Preview', write: 'Write into my mod', r: 'bot_habits.log', m: 'boom', name: 'Hold the line', d: 4, a: 1, b: 30, size: 4, wait: 5, every: 4, hold: 60, any: 20, confirm: 20, max: 10, units: 'Tiger I', income: 3, share: 100, n: 2, map: 'Argentan 2x2', diff: 'hard', from: 0, to: 10, unit: 'Tiger I', rel: 'x.lua', p: 'mod_three', when: '20.11.2026', where: 'Save for a big unit', army: 'Germans', armies: 'Germans, USSR', game: 'MoW:AS2', tried: 'AS64' };
    for (const r of P.lang) for (let c = 1; c < 5; c++) { const out = r[c].replace(/\{(\w+)\}/g, (m, k) => (vals[k] != null ? String(vals[k]) : m)); ok(!/\{\w+\}/.test(out), 'sentence ' + r[0] + ' [' + c + '] filled: ' + out); }
    // S14: the words of other buttons and pages, exact in every language; S15 lines
    const FR = require('../../lang'), fr = k => (FR.en && FR.en[k] != null ? [k, FR.en[k], FR.ru[k], FR.uk[k], FR.zh[k]] : null), mine = k => P.lang.find(r => r[0] === k);
    for (let c = 1; c < 5; c++) {
      ok(mine('bots.recipes.done.log')[c].includes(mine('bots.recipes.b.log')[c]), 'done.log names the log button exactly, column ' + c);
      ok(/^(Done|Готово|完成)/.test(mine('bots.recipes.done.head')[c]) && /^(Done|Готово|完成)/.test(mine('bots.recipes.rm.done')[c]) && /^(Done|Готово|完成)/.test(mine('bots.recipes.done.headNone')[c]), 'one done pattern "Done: <what>." column ' + c);
      ok(/Battle zones/.test(mine('bots.recipes.goh')[c]) && /Conquest/.test(mine('bots.recipes.goh')[c]) && /Conquest/.test(mine('bots.recipes.goh.n.all')[c]), 'the GoH lines name the modes the same way, column ' + c);
      if (fr('bots.btn.preview')) ok(mine('bots.recipes.b.preview')[c] === fr('bots.btn.preview')[c] && mine('bots.recipes.btns.h')[c].startsWith(fr('bots.btn.preview')[c]), 'Preview is the frame word, column ' + c);
      ok(mine('bots.recipes.e.other')[c].includes(mine('bots.recipes.b.again')[c]), 'e.other names Read again exactly, column ' + c);
    }
    ok(/^Gates of Hell: .+Battle zones and Ammunition.+Conquest/.test(EN['bots.recipes.goh']) && !('bots.recipes.e.goh' in EN), 'S15: the GoH line says where the habits work; no GoH refusal left');
  }
  ok(missing.size === 0, 'client: every string it asks for exists: ' + [...missing].join(' '));
  const used = new Set(), src = P.script;
  for (const m of src.matchAll(/[^a-z]t\('([a-zA-Z.]+)'/g)) used.add('bots.recipes.' + m[1]);
  ok([...used].every(k => k.endsWith('.') || k in EN), 'client: literal keys exist ' + [...used].filter(k => !k.endsWith('.') && !(k in EN)).join(' '));

  console.log(bad ? bad + ' failures of ' + n : 'bots part recipes PASS (' + n + ' checks)');
  process.exit(bad ? 1 : 0);
})().catch(x => { console.log('FAIL crash ' + (x && x.stack || x)); process.exit(1); });
