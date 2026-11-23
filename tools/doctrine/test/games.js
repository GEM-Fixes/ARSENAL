// doctrine, the three games (game parity): GoH profile conquest on a made-up ConquestConfig file (the shape of the GoH Conquest
// settings file modes/conquest/runtime_config.lua), and --exe on a made-up AS2 install with as64.exe and mowas_2.exe (as64/core holds a
// different bot.data.lua: --exe mowas_2 must not read it). No game, no real install. Exit 1 on the first failure.
// Author: Imperator_Aug (ARSENAL, ia-c008df2e)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const D = path.join(__dirname, '..', 'doctrine.js'), W = path.join(__dirname, 'work-games');
const L = require('../lib');
let n = 0;
const fail = m => { console.log('FAIL: ' + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); n++; };
const run = (...a) => { const r = cp.spawnSync(process.execPath, [D, ...a], { encoding: 'latin1' }); return { code: r.status, out: r.stdout, err: r.stderr }; };
const put = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s, 'latin1'); };
const CQ = 'resource/script/multiplayer/modes/conquest/runtime_config.lua', BD = 'resource/script/multiplayer/bot.data.lua';

// the GoH file shape: X = X or {}, dotted table assignments, nested tables, number expressions, trailing comments, CRLF
const conquest = [
  '-- made-up ConquestConfig in the shape of the GoH Conquest settings file',
  'ConquestConfig = ConquestConfig or {}',
  '',
  'ConquestConfig.AttackerWaves = {',
  '\tMaxWavesMin = 4,',
  '\tMinUnits = 5,',
  '\tMaxUnits = 6,',
  '\tPattern = "escalating",',
  '}',
  'ConquestConfig.AttackerDynamicWaveOff = {',
  '\tFirstCheckSeconds = 120, -- earliest check',
  '\tRepeatPollIntervalSeconds = 30, --  poll',
  '\tForceReleaseSeconds = 300, -- hard maximum',
  '\tWaveOffSecondsByAttackerState = {',
  '\t\tdegraded = 135,',
  '\t},',
  '}',
  'ConquestConfig.DefenderCounterattack = {',
  '\tMinUnits = 3,',
  '\tConfirmDelay = 50 * 1000,',
  '\tResponseChance = 0.75,',
  '\tMaxTotal = 3,',
  '}',
  'ConquestConfig.PurchaseScoring = {',
  '\tAvailabilityWeight = { ["0.9"] = 2.00, ["1.0"] = 1.70 },',
  '\tCPLimitStages = { { band = "Stage1", max = 60 }, { band = "Stage5", max = nil } },',
  '}',
  'ConquestConfig.OrderRotationPeriod = 2.5 * 60000 -- 2:30 min (ms)',
  'ConquestConfig.AttackerFailure = {',
  '\tNoProgress = {',
  '\t\tPlayerDefenseRatio = 0.30,',
  '\t\tMinBar = 12,',
  '\t},',
  '}',
  ''].join('\r\n');

fs.rmSync(W, { recursive: true, force: true });
put(path.join(W, 'base', CQ), conquest);
fs.mkdirSync(path.join(W, 'm1'), { recursive: true });

// luatable reads the GoH form; `or` anywhere else still refuses
const lt = require('../../botrecipe/luatable');
const t = lt.parse(conquest);
ok(L.kindOf(t) === 'conquest', 'kind conquest');
ok(t.globals.ConquestConfig.hash.OrderRotationPeriod === 150000, 'OrderRotationPeriod expression read');
ok(t.globals.ConquestConfig.hash.AttackerFailure.hash.NoProgress.hash.PlayerDefenseRatio === 0.3, 'nested key read');
for (const bad of ['A = B or {}', 'A = 1\r\nA.x = A or 2', 'A = { x = 1 or 2 }']) { let e = null; try { lt.parse(bad); } catch (x) { e = x; } ok(e, 'or refused in: ' + bad); }

// plan: gold values (persona su-1941-rifle: aggression 0.9, initiative 0.2, caution 0.1), expressions kept in [doctrine was]
const p = L.plan(conquest, 'su-1941-rifle', 'auto', 1);
ok(p.profile === 'conquest' && p.kind === 'conquest', 'auto profile = conquest');
const now = Object.fromEntries(p.changes.map(c => [c.key, c.now]));
const want = { 'AttackerWaves.MinUnits': '6', 'AttackerWaves.MaxUnits': '7', 'AttackerDynamicWaveOff.ForceReleaseSeconds': '228', 'AttackerDynamicWaveOff.FirstCheckSeconds': '149',
  'AttackerDynamicWaveOff.RepeatPollIntervalSeconds': '37', 'DefenderCounterattack.ResponseChance': '0.57', 'DefenderCounterattack.ConfirmDelay': '38000',
  'DefenderCounterattack.MaxTotal': '4', 'AttackerFailure.NoProgress.PlayerDefenseRatio': '0.23', OrderRotationPeriod: '198000' };
for (const [k, v] of Object.entries(want)) ok(now[k] === v, 'gold ' + k + ' = ' + v + ' (got ' + now[k] + ')');
ok(p.changes.length === 10 && !p.skipped.length, 'ten changes, none skipped');
ok(/\tMinUnits = 3,/.test(p.text), 'DefenderCounterattack.MinUnits (same name, other table) left alone');
ok(p.text.includes('ConfirmDelay = 38000, -- [doctrine was DefenderCounterattack.ConfirmDelay=50 * 1000]'), 'expression kept in the was tag');
ok(p.text.includes('ConquestConfig.OrderRotationPeriod = 198000 -- 2:30 min (ms) -- [doctrine was OrderRotationPeriod=2.5 * 60000]'), 'top-level dotted key, comment kept');
ok(!/(^|[^\r])\n/.test(p.text), 'CRLF kept');
ok(L.check(p.text, 'auto').problems.every(x => x.level !== 'error'), 'generated file checks clean');
// CLI: gen from --base, check, universal restores the base byte for byte, the right path in the mod
let r = run('gen', '--persona', 'su-1941-rifle', '--base', path.join(W, 'base'), '--out', path.join(W, 'm1'), '--exe', 'goh');
ok(r.code === 0 && fs.existsSync(path.join(W, 'm1', CQ)) && !fs.existsSync(path.join(W, 'm1', BD)), 'gen --exe goh writes modes/conquest/runtime_config.lua (' + r.err + ')');
r = run('check', path.join(W, 'm1'), '--exe', 'goh');
ok(r.code === 0 && /as conquest/.test(r.out) && /DOC_CONQUEST_ONLY/.test(r.out), 'check a GoH mod folder');
r = run('gen', '--persona', 'universal', '--out', path.join(W, 'm1'), '--exe', 'goh');
ok(r.code === 0 && fs.readFileSync(path.join(W, 'm1', CQ), 'latin1') === conquest, 'universal restores the base');
// the GoH file inside a pak of the base folder (GoH ships it in gamelogic.pak)
fs.mkdirSync(path.join(W, 'packed', 'resource'), { recursive: true });
require('../../lib/zipwrite').writeZip(path.join(W, 'packed', 'resource', 'gamelogic.pak'), [[CQ.replace(/^resource\//, ''), Buffer.from(conquest, 'latin1')]]);
r = run('gen', '--persona', 'su-1941-rifle', '--base', path.join(W, 'packed'), '--plan', '--json', '--exe', 'goh');
ok(r.code === 0 && JSON.parse(r.out).base.from === 'pak' && JSON.parse(r.out).changes.length === 10, 'GoH base from a pak');
// profile mismatches refuse, check finds range errors
ok(run('gen', '--persona', 'su-1941-rifle', '--base', path.join(W, 'base', CQ), '--profile', 'vanilla', '--plan').err.includes('Only the conquest profile'), 'vanilla on a conquest file refused');
const V = path.join(__dirname, '..', '..', 'botrecipe', 'test', 'chainn3', 'stock', 'script', 'multiplayer', 'bot.data.lua');
ok(run('gen', '--persona', 'su-1941-rifle', '--base', V, '--profile', 'conquest', '--plan').err.includes('no ConquestConfig table'), 'conquest on a bot.data.lua refused');
put(path.join(W, 'bad.lua'), conquest.replace('MaxUnits = 6', 'MaxUnits = 2').replace('ResponseChance = 0.75', 'ResponseChance = 1.5'));
r = run('check', path.join(W, 'bad.lua'));
ok(r.code === 1 && /DOC_RANGE: AttackerWaves.MinUnits = 5 is above MaxUnits = 2/.test(r.out) && /DOC_RANGE: DefenderCounterattack.ResponseChance = 1.5/.test(r.out), 'check range errors');
r = run('profile', 'conquest');
ok(r.code === 0 && /ForceReleaseSeconds/.test(r.out) && /GHMIS-66/.test(r.out), 'profile conquest');
// a GoH folder is still refused for writing (writeguard)
fs.mkdirSync(path.join(W, 'goh', 'binaries', 'x64'), { recursive: true }); fs.mkdirSync(path.join(W, 'goh', 'mods', 'g1'), { recursive: true });
fs.writeFileSync(path.join(W, 'goh', 'binaries', 'x64', 'call_to_arms.exe'), '');
r = run('gen', '--persona', 'su-1941-rifle', '--base', path.join(W, 'base'), '--out', path.join(W, 'goh', 'mods', 'g1'), '--exe', 'goh');
ok(r.code === 2 && !fs.existsSync(path.join(W, 'goh', 'mods', 'g1', 'resource')), 'GoH install write refused');
// --exe: bad value; as64 vs mowas_2 on a shared made-up AS2 install (as64/core overrides bot.data.lua for as64 only)
ok(run('gen', '--persona', 'universal', '--plan', '--exe', 'nosuch').code === 2, 'bad --exe exit 2');
const G = path.join(W, 'game'), van = fs.readFileSync(V, 'latin1');
put(path.join(G, 'as64.exe'), ''); put(path.join(G, 'mowas_2.exe'), '');
put(path.join(G, BD), van); put(path.join(G, 'as64', 'core', BD), van.replace(/MaxSquadSize = \d+/, 'MaxSquadSize = 9'));
const base = (...x) => JSON.parse(run('gen', '--persona', 'jp-1942-infantry', '--game', G, '--plan', '--json', ...x).out);
const sq = b => (b.changes.find(c => c.key === 'MaxSquadSize') || {}).was;
ok(sq(base()) === '9' && sq(base('--exe', 'as64')) === '9', 'no --exe and --exe as64: the as64/core copy');
ok(sq(base('--exe', 'mowas_2')) !== '9' && sq(base('--exe', 'mowas2')) !== '9', '--exe mowas_2 / mowas2: the base game copy, not as64/core');
// writeMod takes the profile; a GoH write must be a Conquest config; GoH takes a restore point; a link out of the mod is refused
{
  const gh = path.join(W, 'gohgame'), gm = path.join(gh, 'mods', 'wm');
  put(path.join(gh, 'binaries', 'x64', 'call_to_arms.exe'), 'MZ'); put(path.join(gm, '.arsenal-made'), '{}');
  const vt = fs.readFileSync(V, 'latin1');
  let e = null; try { L.writeMod(gm, vt, gh, { profile: 'vanilla' }); } catch (x) { e = x; }
  ok(e && e.code === 'DOC_GOH_NOT_CONQUEST' && !fs.existsSync(path.join(gm, BD)), 'writeMod: a bot.data.lua text into a GoH mod refused, nothing written');
  e = null; try { L.writeMod(path.join(W, 'm2'), vt, undefined, { profile: 'conquest' }); } catch (x) { e = x; }
  ok(e && e.code === 'DOC_GOH_NOT_CONQUEST', 'writeMod: profile conquest with a text that is not ConquestConfig refused');
  put(path.join(gm, CQ), conquest);
  const pq = L.plan(conquest, 'su-1941-rifle', 'auto', 1);
  const f = L.writeMod(gm, pq.text, gh, { profile: pq.profile });
  const ur = path.join(gm, '.arsenal', 'undo'), ids = fs.existsSync(ur) ? fs.readdirSync(ur) : [];
  const pt = ids.length ? JSON.parse(fs.readFileSync(path.join(ur, ids[0], 'restore-point.json'), 'utf8')) : {};
  ok(f === path.join(gm, CQ) && fs.readFileSync(f, 'latin1') === pq.text && ids.length === 1 && pt.rel === CQ && pt.existed && fs.readFileSync(path.join(ur, ids[0], 'files', ...CQ.split('/')), 'latin1') === conquest && !fs.existsSync(path.join(gh, 'mods', 'wm.arsenal-undo')),
    'writeMod GoH: profile conquest -> runtime_config.lua, a restore point of the old file inside the mod (.arsenal/undo), none in the game\'s mods folder');
  // AS2: no profile, a bot.data.lua text -> bot.data.lua, as before (no restore point)
  fs.mkdirSync(path.join(W, 'm3'), { recursive: true });
  ok(L.writeMod(path.join(W, 'm3'), vt, undefined, { profile: 'vanilla' }) === path.join(W, 'm3', BD) && !fs.existsSync(path.join(W, 'm3.arsenal-undo')), 'writeMod AS2: vanilla profile -> bot.data.lua, no restore point (as before)');
  // a junction inside the mod that leads out of it (an empty throw-away folder as target): refused before anything is written
  const away = path.join(W, 'away'), m4 = path.join(W, 'm4'); fs.mkdirSync(away, { recursive: true }); fs.mkdirSync(m4, { recursive: true });
  let linked = true; try { fs.symlinkSync(away, path.join(m4, 'resource'), 'junction'); } catch (x) { linked = false; }
  if (linked) {
    e = null; try { L.writeMod(m4, vt, undefined, { profile: 'vanilla' }); } catch (x) { e = x; }
    ok(e && /leads out of the mod/.test(e.message) && fs.readdirSync(away).length === 0, 'writeMod: a junction in the mod that leads out refused, nothing written through it');
    fs.unlinkSync(path.join(m4, 'resource'));
  }
}
fs.rmSync(W, { recursive: true, force: true });
console.log('PASS games (' + n + ' checks)');
