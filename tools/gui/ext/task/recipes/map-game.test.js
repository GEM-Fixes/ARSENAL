// game parity test of the "map" and "mission" recipes: node map-game.test.js [scratch]. A made-up AS2 install (as64.exe and mowas_2.exe
// side by side, an as64/core layer that changes a map) and a made-up GoH install: the readers take the task's game, so a MoW:AS2 task
// never sees as64/core; the editor hand-off names the editor of the game; GoH has the plain line (na) and the readers work on its view.
// No game, no real install. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-bb06572c)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const RC = require('../lib/recipe');
const map = require('./map.recipe'), mission = require('./mission.recipe'), M = map._t;
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-map-game-')));
let passes = 0, fails = 0;
const ok = (c, m, x) => { if (c) passes++; else { fails++; console.log('FAIL ' + m + (x !== undefined ? '\n  ' + String(x).slice(0, 800) : '')); } };
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };

// ---- the made-up installs
const as2 = path.join(scratch, 'as2_install'), goh = path.join(scratch, 'goh_install');
fs.rmSync(as2, { recursive: true, force: true }); fs.rmSync(goh, { recursive: true, force: true });
w(path.join(as2, 'as64.exe'), 'MZ'); w(path.join(as2, 'mowas_2.exe'), 'MZ');
const MP = 'resource/map/multi/fx_map/';
w(path.join(as2, ...(MP + 'map.info').split('/')), '{game\r\n\t{maxPlayers 4}\r\n\t{minPlayers 2}\r\n\t{texMod 1}\r\n}\r\n');
w(path.join(as2, ...(MP + 'combat.mi').split('/')), '{mission {visor "SpawnPoint"} {visor "SpawnPoint"}}\r\n');
w(path.join(as2, ...(MP + 'battle_zones.mi').split('/')), '{mission {"flag_point1"} {visor "SpawnPoint"}}\r\n');
w(path.join(as2, ...(MP + 'map').split('/')), '{Entity "bush8" 0x1 {Position 10 20}}\r\n{Entity "bush8" 0x2 {Position 30 40}}\r\n');
w(path.join(as2, 'resource', 'set', 'multiplayer', 'games', 'combat.set'), '{game {settings {enableBots}}}\r\n');
// as64/core changes the map for the 64 bit game only: more players and one more mode
w(path.join(as2, 'as64', 'core', ...(MP + 'map.info').split('/')), '{game\r\n\t{maxPlayers 8}\r\n\t{texMod 2}\r\n}\r\n');
w(path.join(as2, 'as64', 'core', ...(MP + 'captureflag.mi').split('/')), '{mission}\r\n');
w(path.join(as2, 'as64', 'core', 'resource', 'set', 'multiplayer', 'games', 'captureflag.set'), '{game {settings {enableBots}}}\r\n');
// section 9: one file per recipe that only as64/core has (or changes), so a reader handed the wrong game shows it
const ITEM = 'resource/set/stuff/grenade/xg.grenade', PRE = 'resource/set/multiplayer/games/presets_all.inc', MDL = 'resource/entity/-vehicle/zz_core/zz_core.mdl';
w(path.join(as2, ...ITEM.split('/')), '{item\r\n\t{mass 1}\r\n\t{throw {range 10}}\r\n}\r\n');
w(path.join(as2, 'as64', 'core', ...ITEM.split('/')), '{item\r\n\t{mass 2}\r\n\t{throw {range 30}}\r\n\t{inventory {fsm "belt"} {weight 50}}\r\n}\r\n');
w(path.join(as2, ...PRE.split('/')), '{presets {growTime 10}}\r\n');
w(path.join(as2, 'as64', 'core', ...PRE.split('/')), '{presets {growTime 99}}\r\n');
w(path.join(as2, 'as64', 'core', ...'resource/set/multiplayer/units/vehicles_ger.set'.split('/')), '{"pz1" (s(ger) b(tank)) {cost 100}}\r\n');
w(path.join(as2, ...'resource/entity/humanskin/zz_base/zz_base.def'.split('/')), '{entity}\r\n');
w(path.join(as2, 'as64', 'core', ...'resource/entity/humanskin/zz_core/zz_core.def'.split('/')), '{entity}\r\n');
w(path.join(as2, 'as64', 'core', ...MDL.split('/')), '{Skeleton}\r\n');
w(path.join(goh, 'binaries', 'x64', 'call_to_arms.exe'), 'MZ');
w(path.join(goh, ...'resource/map/multi/g_map/campaign_capture_the_flag.mi'.split('/')), '{mission {"zone1"}}\r\n');
w(path.join(goh, ...'resource/map/multi/g_map/campaign_capture_the_flag.info'.split('/')), '{game {maxPlayers 10}}\r\n');

const KEY = 'map/multi/fx_map', BASE = { id: KEY, name: 'fx_map (4)', ref: { key: 'resource/' + KEY + '/preview.dds', mods: [], modes: [] } };
const task = (id, dir) => ({ id, exe: { as64: 'as64', mowas2: 'mowas_2', goh: 'goh' }[id], kind: id === 'goh' ? 'goh' : 'as2', target: id, dir, as2Dir: as2, gohDir: goh });
// a values / check ctx as lib/compile.js gives it (gameId a string, task), and one with no task (wave 1 form)
const vctx = (id, extra) => Object.assign({ game: () => as2, gohDir: () => goh, gameId: id, task: task(id, id === 'goh' ? goh : as2), mod: path.join(scratch, 'none') }, extra || {});

(async () => {
  // 1 recipe rows: MoW:AS2 and GoH offered (GoH since 2026-11-23: map.goh.js, mission.goh.js; their own test is <id>.games.test.js)
  for (const [r, L] of [[map, require('./map.lang')], [mission, require('./mission.lang')]]) {
    ok(r.games.includes('as64') && r.games.includes('mowas2') && r.games.includes('goh'), r.id + ': games as64, mowas2 and goh', JSON.stringify(r.games));
    ok(!(r.na && r.na.goh) && !L.some(x => x[0] === 'task.' + r.id + '.na.goh'), r.id + ': GoH has no plain line any more', JSON.stringify(r.na));
    // the kinds the recipe's own .client.js declares count, as the server counts them (index.js): mission asks "misfrom"
    let ck = []; try { ck = require('./' + r.id + '.client').kinds || []; } catch (e) { /* no page side */ }
    const probs = RC.validate(r, null, { kinds: ck }).filter(p => p.level === 'error');
    ok(!probs.length, r.id + ': validates with na', JSON.stringify(probs));
  }

  // 2 readers: AS64 (a folder, as before) sees as64/core; MoW:AS2 ({dir, exe mowas_2}) does not
  const a64 = M.infoOf(M.readKey(as2, '', 'resource/' + KEY + '/map.info')), m2 = M.infoOf(M.readKey({ dir: as2, exe: 'mowas_2' }, '', 'resource/' + KEY + '/map.info'));
  ok(a64.maxPlayers === 8 && a64.texMod === '2', 'AS64 reads the as64/core map.info (as before)', JSON.stringify(a64));
  ok(m2.maxPlayers === 4 && m2.texMod === '1', 'MoW:AS2 reads the game map.info, no as64/core', JSON.stringify(m2));
  // the Maps page form: a plain folder with the exe as the 5th argument (undefined = as before)
  const p2 = M.infoOf(M.readKey(as2, '', 'resource/' + KEY + '/map.info', [], 'mowas_2')), p64 = M.infoOf(M.readKey(as2, '', 'resource/' + KEY + '/map.info', [], undefined));
  ok(p2.maxPlayers === 4 && p64.maxPlayers === 8, 'readKey(folder, mod, key, mods, exe): the exe argument picks the view', p2.maxPlayers + ' | ' + p64.maxPlayers);
  const md64 = M.modesOf(as2, '', KEY, [], BASE), md2 = M.modesOf({ dir: as2, exe: 'mowas_2' }, '', KEY, [], BASE);
  ok(md64.includes('captureflag') && !md2.includes('captureflag') && md2.includes('combat') && md2.includes('battle_zones'), 'modes: the as64/core mode only on AS64', md64 + ' | ' + md2);
  ok(M.vfsOf(as2, []) !== M.vfsOf({ dir: as2, exe: 'mowas_2' }, []), 'the vfs cache keeps one view per game');
  ok(M.vfsOf({ dir: as2, exe: 'mowas_2' }, []).exe === 'mowas_2' && M.vfsOf(as2, []).exe === 'as64', 'the views are of the named exe', M.vfsOf(as2, []).exe);

  // 3 game of a step: task, string id, route function, none
  ok(M.gidOf(vctx('mowas2')) === 'mowas2' && M.gidOf({ gameId: () => 'goh' }) === 'goh' && M.gidOf({}) === 'as64' && M.gidOf(null, 'mowas_2') === 'mowas2', 'the game id from task, gameId and exe words');
  const gv = M.gameView(vctx('goh'));
  ok(gv && gv.dir === goh && gv.exe === 'goh', 'GoH game view: the GoH install with exe goh', JSON.stringify(gv));
  ok(M.gameView({ game: () => as2 }) && M.gameView({ game: () => as2 }).exe === undefined, 'no game named: the AS2 folder and no exe (as before)');

  // 4 values: MoW:AS2 gets its own players and season
  const v64 = await map.values(vctx('as64'), BASE, { verb: 'make', game: 'as64' }), v2 = await map.values(vctx('mowas2'), BASE, { verb: 'make', game: 'mowas2' });
  ok(v64.maxplayers === 8 && v64.season === '2', 'map values on AS64: as64/core numbers', JSON.stringify([v64.maxplayers, v64.season]));
  ok(v2.maxplayers === 4 && v2.season === '1' && v2.minplayers === 2, 'map values on MoW:AS2: the game numbers', JSON.stringify([v2.maxplayers, v2.season, v2.minplayers]));
  const mv2 = await mission.values(vctx('mowas2'), BASE, { verb: 'make', game: 'mowas2' });
  ok(mv2.to === 'captureflag', 'mission values on MoW:AS2: captureflag is a mode the map lacks there', JSON.stringify(mv2.to));
  const mv64 = await mission.values(vctx('as64'), BASE, { verb: 'make', game: 'as64' });
  ok(mv64.to !== 'captureflag', 'mission values on AS64: the as64/core captureflag is there', JSON.stringify(mv64.to));

  // 5 compile: the editor of the game in the hand-off steps
  const cc = (r, game, ans, vals) => {
    const a = {}; for (const [k, x] of Object.entries(ans)) a[k] = x && x.src ? x : { src: 'value', value: x };
    return { game, gameDir: as2, target: game, exe: game === 'mowas2' ? 'mowas_2' : 'as64', task: task(game, as2), mod: path.join(scratch, 'none'), staging: path.join(scratch, 'stage'), values: vals || {}, verb: 'change', base: BASE,
      answer: id => a[id] || null, value: id => (a[id] ? a[id].value : (vals || {})[id]), kept: id => !a[id] };
  };
  for (const [game, ed] of [['as64', 'as64_ed.exe'], ['mowas2', 'mowas_2_ed.exe']]) {
    const r = map.compile({}, cc(map, game, { copy: false, ground: { src: 'ext', value: 'game-editor' } }, { maxplayers: 4, minplayers: 2 }));
    const n = (r.notes || []).join(' ');
    ok(n.includes(ed) && (game === 'as64' || !n.includes('as64_ed.exe')), 'map hand-off on ' + game + ' names ' + ed, n.slice(0, 300));
    let mr = null, e = null; try { mr = mission.compile({}, cc(mission, game, { from: 'combat', newmode: false, to: 'combat', editor: { src: 'ext', value: 'game-editor' } }, { from: 'combat', to: 'combat' })); } catch (x) { e = x; }
    const mn = mr ? (mr.notes || []).join(' ') : '';
    ok(mr && mn.includes(ed) && (game === 'as64' || !mn.includes('as64_ed.exe')), 'mission hand-off on ' + game + ' names ' + ed, e ? e.message : mn.slice(0, 300));
  }
  // MoW:AS2 compile reads its own view: start points of the game map (2 in combat), no as64/core captureflag
  { let e = null; try { map.compile({}, cc(map, 'mowas2', { copy: true, name: 'fx_copy', mode: 'captureflag' }, { maxplayers: 4, minplayers: 2 })); } catch (x) { e = x; }
    ok(e && /captureflag start areas/.test(e.message), 'MoW:AS2 compile: captureflag is added (the mode is not in its view) and refused for its missing areas', e && e.message); }
  { const r = map.compile({}, cc(map, 'as64', { copy: true, name: 'fx_copy', mode: 'captureflag' }, { maxplayers: 8, minplayers: 2 }));
    ok(!(r.gen && r.gen.ops || []).some(o => o.op === 'mission-clone'), 'AS64 compile: captureflag is there already (as64/core), nothing to add', JSON.stringify(r.gen)); }
  // the mission compile reads the step game's view too: the as64/core captureflag is a mode to start from on AS64 only
  { const mc = game => { try { return mission.compile({}, cc(mission, game, { from: 'captureflag', newmode: false, to: 'captureflag', editor: { src: 'ext', value: 'game-editor' } }, { from: 'captureflag', to: 'captureflag' })); } catch (x) { return x; } };
    const r64 = mc('as64'), r2 = mc('mowas2');
    ok(!(r64 instanceof Error) && (r64.notes || []).join(' ').includes('as64_ed.exe'), 'AS64 mission compile: the as64/core captureflag is a mode to start from', r64 instanceof Error ? r64.message : '');
    ok(r2 instanceof Error && /no captureflag mode to start from/.test(r2.message), 'MoW:AS2 mission compile: no captureflag in its view (as64/core not seen)', r2 instanceof Error ? r2.message : JSON.stringify(r2.gen)); }

  // 6 check on MoW:AS2: start points of its own view
  const ck = await map.check({ game: 'mowas2', mod: '', base: BASE, answers: { copy: { src: 'value', value: false } } }, vctx('mowas2'));
  ok(ck.length && ck[0].lines.some(l => /combat: 2 start points for 4 players/.test(l)) && !ck[0].lines.some(l => /^captureflag/.test(l)), 'check on MoW:AS2 reads its own view', JSON.stringify(ck));

  // mission check on its own view: the as64/core captureflag.mi is read on AS64 only
  { const mck = g => mission.check({ game: g, mod: '', base: BASE, answers: { to: { src: 'value', value: 'captureflag' } } }, vctx(g));
    const k64 = await mck('as64'), k2 = await mck('mowas2');
    ok(k64.length && k64[0].level === 'info' && /captureflag on/.test(k64[0].title), 'mission check on AS64 reads the as64/core captureflag.mi', JSON.stringify(k64));
    ok(k2.length && k2[0].level === 'warn' && /No captureflag\.mi/.test(k2[0].lines[0]), 'mission check on MoW:AS2: no captureflag.mi in its view', JSON.stringify(k2)); }

  // 7 GoH: the readers work on the GoH view (the Missions page reads the facts through them)
  const gk = M.keysUnder({ dir: goh, exe: 'goh' }, '', 'resource/map/multi/g_map/', []);
  ok(gk.includes('resource/map/multi/g_map/campaign_capture_the_flag.mi'), 'GoH view: keys of a GoH map', gk.join(' '));
  ok(M.modesOf({ dir: goh, exe: 'goh' }, '', 'map/multi/g_map', [], null).join() === 'campaign_capture_the_flag', 'GoH view: the modes of a GoH map');
  ok(M.infoOf(M.readKey({ dir: goh, exe: 'goh' }, '', 'resource/map/multi/g_map/campaign_capture_the_flag.info')).maxPlayers === 10, 'GoH view: a mode .info is read');

  // 8 the other AS2 recipes of this part: GoH has a plain line in four languages and validates; MoW:AS2 refuses an Enhanced range
  for (const id of ['item', 'skin', 'prices', 'model', 'release']) {
    const r = require('./' + id + '.recipe'), L = require('./' + id + '.lang'), k = r.na && r.na.goh, row = k && L.find(x => x[0] === k);
    // these recipes run on GoH now (their *.games.test.js cover it): no whole-recipe plain line is left
    ok(r.games.includes('goh') && !k && !row, id + ': runs on GoH, no plain line left', k);
    // ext kinds (gametex, mlist, rel-*) are registered by the GUI host, not in this bare check
    const probs = RC.validate(r, null, {}).filter(p => p.level === 'error' && !/ kind \S+ is not /.test(p.msg));
    ok(!probs.length, id + ': validates with na', JSON.stringify(probs));
  }
  const rel = require('./release.recipe');
  ok(/VFS-48/.test(rel.refuseRange({ range: 'enhanced' }, 'mowas2') || '') && rel.refuseRange({ range: 'enhanced' }, 'as64') === null && rel.refuseRange({ range: 'classic' }, 'mowas2') === null, 'release: Enhanced range refused on MoW:AS2 only');
  ok(rel.gidOf({ task: { id: 'mowas2' } }) === 'mowas2' && rel.gidOf({}) === 'as64', 'release: the game of the step');
  const sc = rel.shareCtx({ game: () => as2 }, 'mowas2');
  ok(sc && typeof sc.gameId === 'function' && sc.gameId() === 'mowas2', 'release: the share routes get the step game', sc && typeof sc.gameId);

  // 9 the recipes hand the step game to their readers: a file only as64/core has is seen on AS64 and not on MoW:AS2; GoH reads nothing
  { const MD = require('./model.recipe')._t;
    const vw = MD.viewOf(vctx('mowas2'));
    ok(MD.viewOf(vctx('as64')) === as2 && vw && vw.dir === as2 && vw.exe === 'mowas_2', 'model: the view is the folder on AS64 and {dir, exe mowas_2} on MoW:AS2', JSON.stringify(vw));
    ok(!!MD.gameBytes(MD.viewOf(vctx('as64')), MDL) && !MD.gameBytes(vw, MDL), 'model: the as64/core model is read on AS64 only');
    const nl = g => MD.nameLookup(vctx(g), 'zz_core', { in: 'resource/entity/-vehicle' }).exact;
    ok(nl('as64') === true && nl('mowas2') === false, 'model: the name lookup sees the as64/core folder on AS64 only'); }
  { const S = require('./skin.recipe'), hs = async g => (await S.lookups.humanskin(vctx(g), '', { game: g })).map(x => x.id).join();
    const h64 = await hs('as64'), h2 = await hs('mowas2'), hg = await hs('goh');
    ok(h64 === 'zz_base,zz_core' && h2 === 'zz_base', 'skin: the soldier looks of as64/core on AS64 only', h64 + ' | ' + h2);
    ok(hg === '', 'skin: GoH lists no AS2 soldier looks', hg);
    let e = null; try { S.compile({}, cc(S, 'goh', {})); } catch (x) { e = x; }
    ok(!e || !/not available/i.test(e.message), 'skin: a GoH compile is not refused as a whole', e && e.message); }
  { const I = require('./item.recipe'), B = { id: 'xg', ref: { key: ITEM } };
    const iv = async g => I.values(vctx(g), B, { verb: 'make', game: g });
    const i64 = await iv('as64'), i2 = await iv('mowas2');
    ok(i64.mass === 2 && i2.mass === 1, 'item: values of the step game (mass 2 from as64/core on AS64, 1 on MoW:AS2)', i64.mass + ' | ' + i2.mass);
    // compile with the same values on both games: the set row on inventory/fsm targets the line as64/core has ([0]) on AS64 only
    const fsm = g => { const c = cc(I, g, { id: 'xg2', weight: 90, hold: 'stuff' }); c.values = i2; c.value = id => (c.answer(id) ? c.answer(id).value : i2[id]); c.verb = 'make';
      const r = I.compile({}, c), s = (r.gen.ops.find(o => o.op === 'set') || { rows: [] }).rows.find(x => /inventory\/fsm/.test(x.path)); return s && s.path; };
    const f64 = fsm('as64'), f2 = fsm('mowas2');
    ok(f64 === 'item/inventory/fsm[0]' && f2 === 'item/inventory/fsm', 'item: compile reads the chain of the step game', f64 + ' | ' + f2); }
  { const P = require('./prices.recipe'), pc = async g => { try { await P.compile({}, { game: g, gameDir: as2, mod: '', base: { id: 'ger' }, values: {}, answer: () => null, value: () => undefined, kept: () => true }); return 'ok'; } catch (x) { return x.message; } };
    const g64 = (await P.values(vctx('as64'), null, { game: 'as64' })).growtime, g2 = (await P.values(vctx('mowas2'), null, { game: 'mowas2' })).growtime, gg = (await P.values(vctx('goh'), null, { game: 'goh' })).growtime;
    ok(g64 === 99 && g2 === 10 && gg === undefined, 'prices: values read the presets of the step game (99 as64/core, 10 MoW:AS2, none GoH)', [g64, g2, gg].join());
    const c64 = await pc('as64'), c2 = await pc('mowas2');
    ok(!/has no cards/.test(c64) && /has no cards/.test(c2), 'prices: compile reads the cards of the step game (the as64/core list on AS64 only)', c64 + ' | ' + c2); }

  console.log(passes + ' passed, ' + fails + ' failed');
  console.log(fails ? 'FAIL' : 'PASS');
  if (fails) process.exitCode = 1;
})().catch(e => { console.log('FAIL crashed: ' + (e.stack || e.message)); process.exitCode = 1; });
