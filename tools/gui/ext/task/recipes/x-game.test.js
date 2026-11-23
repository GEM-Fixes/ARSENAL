// game parity test of the make/change recipes vehicle, soldier, squad, sound, voice, text and x-thing: node x-game.test.js <scratch>.
// A made-up install (as64.exe, a base file, an as64/core file over it and one only as64/core has) shows each reader keeps the two
// views apart: the AS64 view (no game, or as64) sees as64/core as before, the MoW:AS2 view (mowas2) is the same folder without it.
// Then the game of a task (ctx.task, ctx.gameId as a string or a function, the given id), the plain Gates of Hell line of each recipe
// (na.goh, a row in 4 languages) and, read only, the real AS2 install of this PC (else a SKIP note). PASS is the last line.
// Author: Imperator_Aug (ARSENAL, ia-69145c92)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-x-game-')));
fs.mkdirSync(scratch, { recursive: true });
let p = 0, f = 0;
const ok = (c, m, x) => { if (c) p++; else { f++; console.log('FAIL ' + m + (x !== undefined ? '\n  ' + String(x).slice(0, 600) : '')); } };

// ---------- the made-up install
const fake = path.join(scratch, 'fakeas2');
fs.rmSync(fake, { recursive: true, force: true });
const put = (rel, s) => { const fp = path.join(fake, rel); fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, s); };
put('as64.exe', 'MZ');
put('resource/set/zz/both.set', 'base\r\n');
put('as64/core/resource/set/zz/both.set', 'core\r\n');
put('as64/core/resource/set/zz/only64.set', 'core only\r\n');
const KB = 'resource/set/zz/both.set', K64 = 'resource/set/zz/only64.set';
const vfs = require('../../../../lib/vfs');
const txt = r => (r ? String(vfs.readRec(r)).trim() : null);

// ---------- vehicle (shared with armour): readerFor(game, mod, exe)
const VL = require('./vehicle.recipe')._lib;
{
  const a = VL.readerFor(fake, null), a2 = VL.readerFor(fake, null, 'as64'), m = VL.readerFor(fake, null, 'mowas2'), m2 = VL.readerFor(fake, null, 'mowas_2');
  ok(a.exe === undefined && a2 === a, 'vehicle: no game and as64 are one reader, with no exe (as before)', a.exe);
  ok(a.has(K64) && String(a.read(KB)).trim() === 'core', 'vehicle: the AS64 view sees as64/core');
  ok(m.exe === 'mowas_2' && m2 === m, 'vehicle: mowas2 and mowas_2 are one reader with exe mowas_2', m.exe);
  ok(!m.has(K64) && String(m.read(KB)).trim() === 'base', 'vehicle: the MoW:AS2 view does not see as64/core');
  ok(VL.exeFor({}, undefined) === undefined && VL.exeFor({ task: { id: 'mowas2' } }) === 'mowas_2' && VL.exeFor({ gameId: 'mowas2' }) === 'mowas_2' && VL.exeFor({ gameId: () => 'mowas2' }) === 'mowas_2', 'vehicle: exeFor reads the given id, ctx.task, ctx.gameId (string or function)');
  ok(VL.gidOf({ task: { id: 'goh' } }, 'mowas2') === 'mowas2', 'vehicle: a given game id wins over ctx.task');
}

// ---------- soldier and squad: a game handle (folder, or folder|exe)
for (const id of ['soldier', 'squad']) {
  const L = require('./' + id + '.recipe')._lib;
  ok(L.handle(fake, 'as64') === fake && L.handle(fake) === fake, id + ': the AS64 handle is the plain folder (as before)');
  ok(L.handle(fake, 'mowas2') === fake + '|mowas_2', id + ': the MoW:AS2 handle names the exe', L.handle(fake, 'mowas2'));
  const u = L.unhandle(fake + '|mowas_2');
  ok(u.dir === fake && u.exe === 'mowas_2' && L.unhandle(fake).exe === undefined, id + ': unhandle splits the handle back');
  const va = L.vfsOf(fake), vm = L.vfsOf(L.handle(fake, 'mowas2'));
  ok(va && va.exe === 'as64' && va.files.has(K64) && txt(va.files.get(KB)) === 'core', id + ': the AS64 view sees as64/core', va && va.exe);
  ok(vm && vm.exe === 'mowas_2' && !vm.files.has(K64) && txt(vm.files.get(KB)) === 'base', id + ': the MoW:AS2 view does not see as64/core', vm && vm.exe);
  ok(L.gameOf({ gameDir: fake, task: { id: 'mowas2' } }) === fake + '|mowas_2', id + ': gameOf takes the game of the task');
  ok(L.gameOf({ game: () => fake, gameId: 'as64' }) === fake, id + ': gameOf under as64 is the folder');
  ok(L.gameOf({ game: () => fake, gameId: 'as64' }, 'mowas2') === fake + '|mowas_2', id + ': a given game id wins');
}

// ---------- sound and voice: the game as art/core takes it
{
  const SL = require('./sound.recipe')._lib;
  ok(SL.gameIn(fake, 'as64') === fake, 'sound: under as64 the game is the folder (as before)');
  const g = SL.gameIn(fake, 'mowas2');
  ok(g && g.dir === fake && g.exe === 'mowas_2' && g.kind === 'as2', 'sound: under mowas2 the game names the exe', JSON.stringify(g));
  ok(SL.gameIn(null, 'mowas2') === null, 'sound: no folder, no game');
  ok(SL.gameOf({ game: () => fake, gameId: () => 'mowas2' }).exe === 'mowas_2', 'sound: gameOf reads ctx.gameId as a function');
  ok(SL.gameOf({ game: () => fake, task: { id: 'as64' } }, undefined) === fake, 'sound: gameOf under as64 is the folder');
  const VS = fs.readFileSync(path.join(__dirname, 'voice.recipe.js'), 'utf8');
  ok(/L\(\)\.gameIn\(c\.gameDir, c\.game\)/.test(VS) && !/L\(\)\.gameOf\(ctx\)[^,]/.test(VS), 'voice: compile and lookups pass the game through sound\'s gameIn and gameOf');
}

// ---------- text: the game of the missing-lines route
{
  const T = require('./text.recipe')._t;
  const U = q => new URL('http://x/api/x/task/r/text/missing' + q);
  ok(T.gameQ(U('?game=mowas2'), {}) === 'mowas2', 'text: ?game= wins');
  ok(T.gameQ(U(''), { task: { id: 'mowas2' } }) === 'mowas2', 'text: else ctx.task');
  ok(T.gameQ(U(''), { gameId: () => 'mowas2' }) === 'mowas2', 'text: else ctx.gameId()');
  ok(T.gameQ(U(''), {}) === '', 'text: no game is nothing (the route then passes no exe, as before)');
  ok(T.exeQ(U(''), { gameId: () => 'as64' }) === '', 'text: the AS64 tab (ctx.gameId as64, no ?game=) passes no exe');
  ok(T.exeQ(U(''), { task: { id: 'as64' } }) === '', 'text: an as64 task passes no exe');
  ok(T.exeQ(U(''), { gameId: () => 'mowas2' }) === 'mowas_2', 'text: the MoW:AS2 tab passes exe mowas_2');
  ok(T.exeQ(U('?game=as64'), { gameId: () => 'mowas2' }) === 'as64', 'text: an explicit ?game=as64 keeps exe as64');
  ok(T.exeQ(U(''), {}) === '', 'text: no game passes no exe');
  const G = require('../../../../lib/games');
  ok(G.exeOf('mowas2') === 'mowas_2', 'text: mowas2 goes to loccover as exe mowas_2');
}

// ---------- x-thing: the map view keyed and built with the exe
{
  const XT = require('./x-thing.recipe')._t;
  const a = XT.mapView(fake, []), m = XT.mapView(fake, [], 'mowas_2');
  ok(a !== m, 'x-thing: the AS64 and MoW:AS2 map views are two cache rows');
  ok(a.exe === 'as64' && a.files.has(K64), 'x-thing: the AS64 view sees as64/core');
  ok(m.exe === 'mowas_2' && !m.files.has(K64), 'x-thing: the MoW:AS2 view does not see as64/core');
  ok(XT.exeFor({}, 'mowas2') === 'mowas_2' && XT.exeFor({}, '') === undefined && XT.exeFor({ gameId: 'mowas2' }) === 'mowas_2', 'x-thing: exeFor');
}

// ---------- offered on Gates of Hell (game parity 2026-11-23): goh in games, no na line
for (const id of ['vehicle', 'soldier', 'squad', 'sound', 'text', 'item', 'bots', 'prices']) {
  const R = require('./' + id + '.recipe');
  ok(R.games.indexOf('goh') >= 0 && R.games.indexOf('mowas2') >= 0 && !(R.na && R.na.goh), id + ': offered for as64, mowas2 and goh');
}
// ---------- the Gates of Hell line (na.goh) of each recipe that is not offered there
for (const id of ['x-thing']) {   // voice runs on GoH now (voice.games.test.js)
  const R = require('./' + id + '.recipe'), L = require('./' + id + '.lang');
  ok(R.games.indexOf('goh') < 0 && R.games.indexOf('mowas2') >= 0, id + ': offered for as64 and mowas2, not goh');
  const k = R.na && R.na.goh, row = L.filter(r => r[0] === k);
  ok(k === 'task.' + id + '.na.goh' && row.length === 1, id + ': na.goh names one lang row', k);
  ok(row[0] && row[0].length === 5 && row[0].slice(1).every(s => s && !/[`]|\$\{/.test(s)) && /^Not available in Gates of Hell: /.test(row[0][1]), id + ': the line is in 4 languages and plain');
}

// ---------- real AS2 install, read only
{
  let dir = null; try { dir = require('../../../../lib/games').install('mowas2'); } catch (e) { dir = null; }
  if (dir && typeof dir === 'object') dir = dir.dir || dir.path || null;
  if (!dir || !fs.existsSync(dir)) console.log('SKIP real install: no MoW:AS2 install found');
  else {
    const S = require('./soldier.recipe')._lib;
    const va = S.vfsOf(dir), vm = S.vfsOf(S.handle(dir, 'mowas2'));
    ok(vm && vm.exe === 'mowas_2', 'real: the MoW:AS2 view of this PC builds with exe mowas_2', vm && vm.exe);
    const core64 = va ? [...va.files.values()].filter(r => /as64\/core/i.test(String(r.layer || ''))).length : 0;
    const coreAs2 = vm ? [...vm.files.values()].filter(r => /as64\/core/i.test(String(r.layer || ''))).length : 0;
    ok(coreAs2 === 0, 'real: no as64/core file in the MoW:AS2 view', coreAs2);
    console.log('real install: AS64 view ' + (va ? va.exe + ', ' + va.files.size + ' files, ' + core64 + ' from as64/core' : 'none') + '; MoW:AS2 view ' + (vm ? vm.files.size + ' files' : 'none'));
  }
}

console.log(p + ' passed, ' + f + ' failed');
console.log(f ? 'FAIL' : 'PASS');
process.exitCode = f ? 1 : 0;
