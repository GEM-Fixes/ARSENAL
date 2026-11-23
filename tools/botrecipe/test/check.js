// botrecipe --check (COV-C13 c): luatable reader + botcheck shape rules on vanilla bot.data.lua (chainn3/stock) and seeded defects.
// Each seeded copy must raise its code; vanilla and the chainn3 buy-first output must be clean.
// Author: Imperator_Aug (ARSENAL, ia-054a475a)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { parse } = require('../luatable'), { check, cardNames } = require('../botcheck');
const here = __dirname, van = fs.readFileSync(path.join(here, 'chainn3/stock/script/multiplayer/bot.data.lua'), 'latin1');
let bad = 0; const fail = m => { console.log('FAIL: ' + m); bad++; };
const codes = (txt, cards, opt) => check(txt, van, cards, opt).filter(x => x.sev !== 'info').map(x => x.sev + ' ' + x.code);
const has = (txt, want, cards, opt) => { const c = codes(txt, cards, opt); if (!c.includes(want)) fail(`seeded ${want}: got [${c.join(', ')}]`); };
const once = (from, to) => { if (!van.includes(from)) throw new Error('seed anchor missing: ' + from); return van.replace(from, to); };

// reader
const p = parse(van);
if (p.globals.OrderRotationPeriod !== 180000) fail('3 * 60 * 1000 not 180000');
if (p.globals.Purchases.arr.length !== 8 || p.globals.Purchases.arr[7].hash.Repeat !== 0) fail('Purchases stages / last Repeat 0');
if (p.globals.UnitClass.hash.ATTank !== 'at-tank') fail('UnitClass.ATTank');
const q = parse('A = { x = 1, --[[ long\r\n comment ]] y = -2.5, [ "k" ] = "v\\"q"; 7, }\r\nA.z = UnitClass.Tank\r\nA.x = 3 -- dup\r\n');
if (q.globals.A.hash.y !== -2.5 || q.globals.A.hash.k !== 'v"q' || q.globals.A.arr[0] !== 7 || q.globals.A.hash.z.ref !== 'UnitClass.Tank' || q.dupes.length !== 1 || q.globals.A.hash.x !== 3) fail('reader subset');
for (const [src, re] of [['A = function() end', /LUA_UNSUPPORTED/], ['local A = 1', /LUA_UNSUPPORTED/], ['A = f(1)', /LUA_UNSUPPORTED/], ['A = { 1, 2', /LUA_PARSE/], ['A = "x', /LUA_PARSE/]]) {
  try { parse(src); fail('reader took: ' + src); } catch (e) { if (!re.test(e.message)) fail(`reader ${src}: ${e.message}`); }
}

// clean: vanilla against itself, and the chainn3 buy-first output (botrecipe data mode, one inserted line)
if (codes(van).length) fail('vanilla not clean: ' + codes(van).join(', '));
const want = fs.readFileSync(path.join(here, 'chainn3/want/resource/script/multiplayer/bot.data.lua'), 'latin1');
if (check(want, van).some(x => x.sev !== 'info')) fail('chainn3 want not clean');

// seeded defects
has(once('class = UnitClass.Tank, unit = "mk7"', 'class = UnitClass.Tnk, unit = "mk7"'), 'error BOT_ENTRY_CLASS');
has(once('class = UnitClass.Tank, unit = "mk7"', 'class = UnitClass.Tank, unti = "mk7"'), 'error BOT_ENTRY_KEY');
has(once('class = UnitClass.Tank, unit = "mk7"', 'class = UnitClass.Tank, unti = "mk7"'), 'warn BOT_ENTRY_KEY');
has(once('{priority = 3.0, class = UnitClass.Infantry, unit = "smgs(eng)"}', '{priority = "3.0", class = UnitClass.Infantry, unit = "smgs(eng)"}'), 'error BOT_ENTRY_TYPE');
has(once('class = UnitClass.Tank, unit = "mk7"', 'class = "tank", unit = "mk7"'), 'error BOT_ENTRY_TYPE');
has(once('Repeat = 1,', 'Repeat = -1,'), 'error BOT_STAGE_SHAPE');
has(once('Repeat = 0,', 'Repeat = 2,'), 'warn BOT_NO_STAY_STAGE');
has(once('MaxSquadSize = 5', 'MaxSquadSiz = 5'), 'error BOT_KEY_MISSING');
has(once('Neutral = 3', 'Neutrl = 3'), 'error BOT_KEY_MISSING');
has(once('\tATTank = "at-tank",', '\tATTank = "at-tank",\r\n\tATTank = "at-tank",'), 'warn BOT_DUP_KEY');
has(once('["eng"] = {--Commonwealth', '["en"] = {--Commonwealth'), 'warn BOT_ARMY_UNKNOWN');
has(once('["eng"] = {--Commonwealth', '["en"] = {--Commonwealth'), 'warn BOT_ARMY_MISSING');
has(van.replace('OrderRotationPeriod = 3 * 60 * 1000', 'OrderRotationPeriod = {}'), 'error BOT_KEY_TYPE');
has(van.replace(/\}\s*$/, ''), 'error BOT_LUA_PARSE');   // last } cut: unclosed table
has(van + '\r\nfunction X() end\r\n', 'error BOT_LUA_UNSUPPORTED');
// a key the mod's own bot.lua reads is info, not a typo warning; without one it warns
const per = once('class = UnitClass.Tank, unit = "mk7"', 'class = UnitClass.Tank, period = "44", unit = "mk7"');
has(per, 'warn BOT_ENTRY_KEY');
if (codes(per, null, { ownBot: 'if unit.period then end' }).length) fail('own bot.lua naming period still warns');
// cards: the Spawn name must exist as a {"name" card or a squad macro name(N) side(S) -> N(S)
const cards = cardNames(['{"mk7" ...}\r\n', '("squad_with3types" side(eng) name(smgs) c(30))\r\n']);
if (!cards.has('mk7') || !cards.has('smgs(eng)')) fail('cardNames');
const small = 'MaxSquadSize = 5\r\nOrderRotationPeriod = 1\r\nFlagPriority = { Captured = 1, Enemy = 2, Neutral = 3 }\r\nUnitClass = ' + /UnitClass = (\{[^}]*\})/.exec(van)[1] + '\r\nPurchases = { { Repeat = 0, Units = { ["eng"] = { {priority = 1.0, class = UnitClass.Tank, unit = "mk7"}, {priority = 1.0, class = UnitClass.Infantry, unit = "smgs(eng)"} } } } }\r\n';
const sc = check(small, van, cards).filter(x => x.sev === 'error');
if (sc.length) fail('small with cards: ' + sc.map(x => x.code).join(','));
has(small.replace('unit = "mk7"', 'unit = "mk7x"'), 'error BOT_UNIT_NO_CARD', cards);

// AI-22 (botsub): Subscribe before the require of bot.lua without calling the On* global is flagged; the clean twins are not
{
  const { check: sub } = require('../botsub');
  const REQ = 'require([[/script/multiplayer/bot]])\r\n';
  const seeded = 'BotApi.Events:Subscribe(BotApi.Events.Quant, function()\r\n\tprint("tick")\r\nend)\r\n' + REQ;
  const s1 = sub(seeded);
  if (s1.length !== 1 || s1[0].code !== 'BOT_SUBSCRIBE_BEFORE_REQUIRE' || s1[0].line !== 1) fail('AI-22 seeded: ' + JSON.stringify(s1));
  const twins = {
    'calls On* global': 'BotApi.Events:Subscribe(BotApi.Events.Quant, function()\r\n\tOnGameQuant()\r\nend)\r\n' + REQ,
    'after the require': REQ + 'BotApi.Events:Subscribe(BotApi.Events.Quant, function() print("t") end)\r\n',
    'unsubscribe after': 'BotApi.Events:Subscribe(BotApi.Events.Quant, function() print("t") end)\r\n' + REQ + 'BotApi.Events:Unsubscribe(BotApi.Events.Quant)\r\n',
    'no require of bot': 'BotApi.Events:Subscribe(BotApi.Events.Quant, function() print("t") end)\r\nrequire("other")\r\n',
    'commented Subscribe': '-- BotApi.Events:Subscribe(BotApi.Events.Quant, function() end)\r\n' + REQ,
    'named handler calls On*': 'local function H()\r\n\tOnGameQuant()\r\nend\r\nBotApi.Events:Subscribe(BotApi.Events.Quant, H)\r\n' + REQ,
  };
  for (const [n, t] of Object.entries(twins)) if (sub(t).length) fail('AI-22 clean twin fired: ' + n);
  if (sub('local function H()\r\n\tprint(1)\r\nend\r\nBotApi.Events:Subscribe(BotApi.Events.Quant, H)\r\n' + REQ).length !== 1) fail('AI-22 named handler without On* not flagged');
  if (sub(fs.readFileSync(path.join(here, 'chainn3/bot.main.lua'), 'latin1')).length) fail('AI-22 chainn3 bot.main.lua (calls On*) fired');
  // CLI: loose script in a mod, reported with file:line, counted as a warning
  const F2 = path.join(here, 'fixture/ai22');
  fs.mkdirSync(path.join(F2, 'resource/script/multiplayer'), { recursive: true });
  fs.writeFileSync(path.join(F2, 'resource/script/multiplayer/bot.data.lua'), want, 'latin1');
  fs.writeFileSync(path.join(F2, 'resource/script/multiplayer/bot.main.lua'), seeded, 'latin1');
  const r2 = cp.spawnSync(process.execPath, [path.join(here, '../botrecipe.js'), F2, '--check', '--stock', path.join(here, 'chainn3/stock')], { encoding: 'utf8' });
  if (r2.status !== 0 || !/warn BOT_SUBSCRIBE_BEFORE_REQUIRE .*bot\.main\.lua:1 /.test(r2.stdout) || !/0 errors, 1 warnings/.test(r2.stdout)) fail('AI-22 CLI: ' + r2.status + ' ' + r2.stdout + r2.stderr);
  fs.writeFileSync(path.join(F2, 'resource/script/multiplayer/bot.main.lua'), twins['calls On* global'], 'latin1');
  const r3 = cp.spawnSync(process.execPath, [path.join(here, '../botrecipe.js'), F2, '--check', '--stock', path.join(here, 'chainn3/stock')], { encoding: 'utf8' });
  if (r3.status !== 0 || /BOT_SUBSCRIBE/.test(r3.stdout) || !/0 errors, 0 warnings/.test(r3.stdout)) fail('AI-22 CLI clean twin: ' + r3.stdout + r3.stderr);
  fs.rmSync(F2, { recursive: true, force: true });
}

// CLI: exit 0 clean, 1 on errors, 2 without a vanilla source; read-only (no --out)
const B = path.join(here, '../botrecipe.js'), F = path.join(here, 'fixture/chk');
fs.mkdirSync(path.join(F, 'resource/script/multiplayer'), { recursive: true });
const run = (...a) => cp.spawnSync(process.execPath, [B, F, '--check', ...a], { encoding: 'utf8' });
fs.writeFileSync(path.join(F, 'resource/script/multiplayer/bot.data.lua'), want, 'latin1');
let r = run('--stock', path.join(here, 'chainn3/stock'));
if (r.status !== 0 || !/0 errors, 0 warnings/.test(r.stdout)) fail('CLI clean: ' + r.status + ' ' + r.stdout + r.stderr);
fs.writeFileSync(path.join(F, 'resource/script/multiplayer/bot.data.lua'), once('class = UnitClass.Tank, unit = "mk7"', 'class = UnitClass.Tnk, unit = "mk7"'), 'latin1');
r = run('--stock', path.join(here, 'chainn3/stock'));
if (r.status !== 1 || !/BOT_ENTRY_CLASS .*bot\.data\.lua:\d+/.test(r.stdout)) fail('CLI seeded: ' + r.status + ' ' + r.stdout);
if (run().status !== 2) fail('CLI without --game/--stock not refused');
fs.rmSync(F, { recursive: true, force: true });
console.log(bad ? `${bad} FAILED` : 'check PASS');
process.exit(bad ? 1 : 0);
