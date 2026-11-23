// GUI-EXT missions test. Arg: scratch dir. No game, no network: a seeded game folder in the scratch dir (mode cards, three maps).
// Author: Imperator_Aug (ARSENAL, ia-df15f9ef)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'missions-')));
require('../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const X = require('./index'), MP = require('../maps');
const MT = require('../../../lib/modtree'); MT._reset({ store: null });   // the shared walk keeps nothing outside this run
const T = path.join(__dirname, '..', '..', '..');
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL ' + m); } };

// ---- seeded game: cards combat (bots on), battle_zones, captureflag; m1 combat only (2 start points, 4 players, capture clips),
// m2 battle_zones (3 flags, no capture clips), m3 combat + battle_zones
const game = path.join(work, 'game');
const put = (rel, lines) => { const f = path.join(game, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, lines.join('\r\n') + '\r\n', 'latin1'); };
put('resource/set/multiplayer/games/combat.set', ['{game', '\t{settings', '\t\t{enableBots}', '\t}', '}']);
for (const m of ['battle_zones', 'captureflag']) put('resource/set/multiplayer/games/' + m + '.set', ['{game', '\t{teammatch}', '}']);
const pt = (uid, nm, team, x, y, mid) => [`\t{Entity "map_point" ${uid}`, `\t\t{Position ${x} ${y}}`, '\t\t{Extender "map_point"', `\t\t\t{name ${nm}}`, `\t\t\t{team ${team}}`, '\t\t\t{phase 0}', '\t\t\t{order 1}', '\t\t\t{visor SpawnPoint}', '\t\t}', '\t\t{Player 0}', `\t\t{MID ${mid}}`, '\t}'];
const flag = (uid, n, x, y, mid) => [`\t{Entity "flag_point_${n}" ${uid}`, `\t\t{Position ${x} ${y}}`, '\t\t{Extender "map_point"', `\t\t\t{name f${n}}`, '\t\t\t{zoneA 12}', '\t\t\t{zoneB 12}', '\t\t\t{phase 0}', `\t\t\t{order ${n}}`, '\t\t\t{show All}', '\t\t\t{visor MapPoint}', '\t\t}', '\t\t{Player 0}', `\t\t{MID ${mid}}`, '\t}'];
const tail = ['\t{Players', '\t\t{count 3}', '\t}', '}'];
const base = ['{mission', ...pt('0xc000', 'a1', 'a', -1000, 0, 1), ...pt('0xc001', 'b1', 'b', 1000, 200, 2)];
const clips = n => ['{Clips', ...n.flatMap(c => ['\t{"' + c + '"', '\t\t{world -2000 -2000 2000 2000}', '\t}']), '}'];
put('resource/map/multi/m1/combat.mi', [...base, ...tail]);
put('resource/map/multi/m1/map.info', [';SDL', '{game {maxPlayers 4}}']);
put('resource/map/multi/m1/map', clips(['[auto]', 'captureflaga', 'captureflagb']));
put('resource/map/multi/m2/battle_zones.mi', [...base, ...flag('0x8010', 1, 0, 100, 3), ...flag('0x8011', 2, -500, 50, 4), ...flag('0x8012', 3, 500, 150, 5), ...tail]);
put('resource/map/multi/m2/map.info', [';SDL', '{game {maxPlayers 2}}']);
put('resource/map/multi/m2/map', clips(['[auto]']));
put('resource/map/multi/m3/combat.mi', [...base, ...tail]);
put('resource/map/multi/m3/battle_zones.mi', [...base, ...flag('0x8010', 1, 0, 100, 3), ...tail]);
put('resource/map/multi/m3/map.info', [';SDL', '{game {maxPlayers 2}}']);
const mod = path.join(game, 'mods', 'my_mod'); fs.mkdirSync(mod, { recursive: true });
// a version range the game takes, or the vfs (and so misdiff) skips the mod
fs.writeFileSync(path.join(mod, 'mod.info'), '{Mod\r\n\t{Name "my_mod"}\r\n\t{MinGameVersion "3.262.0"}\r\n\t{MaxGameVersion "3.262.1"}\r\n}\r\n');
const away = path.join(work, 'away_mod'); fs.mkdirSync(away, { recursive: true });

const ctx = {
  game: () => game, allowLaunch: false, gamedir: game, tools: T, tmpRoot: work,
  runTool: async (tool, entry, args) => { const r = cp.spawnSync(process.execPath, [path.join(T, entry)].concat(args), { encoding: 'utf8' }); return { code: r.status, stdout: r.stdout, stderr: r.stderr, timedOut: false }; },
};
const U = q => ({ searchParams: new URLSearchParams(q) });
const R = X.routes;
const fails = async (p, m) => { let e = null; try { await p(); } catch (x) { e = x; } ok(e && e.status === 400, m + ' ' + (e && e.message)); };
const BC = require(path.join(__dirname, '..', '..', 'test', 'blockcheck'));
const isB = e => !!(e && e.dataset && e.dataset.blk != null);
const checkScreen = sec => (sec.all().filter(isB).length < 10 ? ['fewer than 10 blocks'] : []).concat(BC.checkScreen(sec, 'missions'));

(async () => {
  ok(X.id === 'missions' && X.nav === 'missions.nav' && X.adv === false && X.after === 'maps', 'shape: id, nav, not Advanced, after maps');
  ok(!/`|\$\{/.test(X.script) && /EXT_SCREENS\.missions/.test(X.script), 'script rules');
  ok(require('../index').some(x => x.id === 'missions'), 'registered in ext/index.js');
  // the Maps page exports what Missions and Game Modes use
  ok(['addMode', 'lintMod', 'botsFor', 'addBots', 'safeMod', 'mapKeyOk', 'needGame'].every(k => typeof MP._t[k] === 'function'), 'maps _t exports addMode, lintMod, botsFor, addBots and the guards');

  // ---- facts: flags, start points, bots per mode; MAP-23 and MIS-65 warnings; capture clips
  const f1 = await R['GET /api/x/missions/facts'](U('map=map/multi/m1&mod=' + encodeURIComponent(mod)), null, ctx);
  const c1 = f1.modes.find(m => m.mode === 'combat');
  ok(f1.players === 4 && c1 && c1.flags === 0 && c1.spawns === 2 && c1.bots === true && c1.own === false, 'facts m1 combat: 0 flags, 2 start points, bots on ' + JSON.stringify(f1));
  ok(f1.warn.some(w => w.k === 'missions.w.spawns' && w.p.n === 2 && w.p.players === 4), 'MAP-23 fewer start points than players');
  ok(f1.warn.some(w => w.k === 'missions.w.botsflags' && w.p.mode === 'combat'), 'MIS-65 bots on, no flags');
  ok(f1.clips === true, 'm1 has the capture clips');
  const f2 = await R['GET /api/x/missions/facts'](U('map=map/multi/m2'), null, ctx);
  const b2 = f2.modes.find(m => m.mode === 'battle_zones');
  ok(b2 && b2.flags === 3 && b2.spawns === 2 && b2.bots === false && !f2.warn.length && f2.clips === false, 'facts m2 battle_zones: 3 flags, bots off, no clips ' + JSON.stringify(f2));
  const fw = await R['GET /api/x/missions/facts'](U('map=map/multi/m2&mod=' + encodeURIComponent(game)), null, ctx);
  ok(fw.modWhy === 'maps.e.gameroot' && fw.modes.length === 1, 'a refused mod folder: facts of the game, with the reason');
  await fails(() => R['GET /api/x/missions/facts'](U('map=../x'), null, ctx), 'bad map key refused');

  // ---- add a mode: refusals, preview writes nothing, write + milint
  await fails(() => R['POST /api/x/missions/add'](null, { mod, map: 'map/multi/m1', to: 'assault' }, ctx), 'unknown mode refused');
  await fails(() => R['POST /api/x/missions/add'](null, { mod: game, map: 'map/multi/m1', to: 'battle_zones' }, ctx), 'game root as mod refused');
  await fails(() => R['POST /api/x/missions/add'](null, { mod, map: 'map/multi/m1', from: 'battle_zones', to: 'captureflag' }, ctx), 'a from mode the map lacks refused');
  await fails(() => R['POST /api/x/missions/add'](null, { mod, map: 'map/multi/m1', to: 'battle_zones', flags: '99' }, ctx), 'flags out of range refused');
  const has = await R['POST /api/x/missions/add'](null, { mod, map: 'map/multi/m1', to: 'combat' }, ctx);
  ok(!has.ok && has.say[0].k === 'missions.s.hasmode', 'a mode the map has is refused in plain words');
  const cf = await R['POST /api/x/missions/add'](null, { mod, map: 'map/multi/m2', to: 'captureflag', write: true }, ctx);
  ok(!cf.ok && cf.findings.some(x => x.code === 'MC_NO_CAPTURE_CLIPS') && !fs.existsSync(path.join(mod, 'resource', 'map', 'multi', 'm2')), 'MIS-62 captureflag without clips refused, nothing written ' + JSON.stringify(cf));
  const pre = await R['POST /api/x/missions/add'](null, { mod, map: 'map/multi/m1', from: 'combat', to: 'battle_zones', write: false }, ctx);
  ok(pre.ok && pre.from === 'combat' && pre.say.some(s => s.k === 'maps.s.willmode') && !fs.existsSync(path.join(mod, 'resource', 'map')), 'preview: plan only, nothing written ' + JSON.stringify(pre));
  const wr = await R['POST /api/x/missions/add'](null, { mod, map: 'map/multi/m1', from: 'combat', to: 'battle_zones', flags: '3', write: true }, ctx);
  const bz = path.join(mod, 'resource', 'map', 'multi', 'm1', 'battle_zones.mi');
  ok(wr.ok && fs.existsSync(bz) && wr.say.some(s => s.k === 'maps.s.modemade'), 'write: battle_zones.mi in the mod ' + JSON.stringify(wr));
  ok(wr.needsTest === true && wr.check && wr.check.ran && wr.check.findings.every(x => MP._t.MIS_CODE.test(x.code)), 'milint ran after the write, mission codes only ' + JSON.stringify(wr.check));
  ok(fs.readFileSync(bz, 'latin1').includes('\r\n'), 'the mode file is CRLF');
  const f1b = await R['GET /api/x/missions/facts'](U('map=map/multi/m1&mod=' + encodeURIComponent(mod)), null, ctx);
  const nb = f1b.modes.find(m => m.mode === 'battle_zones');
  ok(nb && nb.own === true && nb.flags === 3, 'facts after the write: battle_zones in my mod, 3 flags ' + JSON.stringify(nb));
  // the map recipe's check counts the same start points (one reader for both)
  const RC = require('../task/recipes/map.recipe');
  const rc = await RC.check({ mod, base: { id: 'map/multi/m1' }, answers: { copy: { src: 'value', value: false } } }, ctx);
  ok(rc.some(c => c.lines.some(l => /combat: 2 start points for 4 players/.test(l))), 'same count as the map recipe check ' + JSON.stringify(rc));

  // ---- the check route keeps only the mission codes
  const ck = await MP.routes['POST /api/x/maps/check'](null, { mod, only: 'missions' }, ctx);
  ok(ck.check.ran && ck.check.findings.every(x => MP._t.MIS_CODE.test(x.code)), 'maps check, only missions: MI_, MIS_, MC_ codes ' + JSON.stringify(ck.check.findings.map(x => x.code)));

  // ---- mine: loose maps of my mod
  const mn = await R['GET /api/x/missions/mine'](U('mod=' + encodeURIComponent(mod)), null, ctx);
  ok(mn.maps.some(m => m.key === 'map/multi/m1' && m.mine && m.modes.includes('battle_zones')), 'mine lists the loose map of my mod ' + JSON.stringify(mn));
  ok((await R['GET /api/x/missions/mine'](U(''), null, ctx)).maps.length === 0, 'mine without a mod: none');

  // ---- what my mod changed (misdiff, read only); a mod outside <game>/mods is not compared
  const df = await R['POST /api/x/missions/diff'](null, { mod, map: 'map/multi/m1' }, ctx);
  ok(df.ok && df.name === 'my_mod' && df.rows.some(r => r.code === 'MIS_DIFF_MODE_ADDED' && r.file === 'battle_zones.mi' && r.thing === 'mode' && r.act === 'added'), 'misdiff: battle_zones added by my_mod ' + JSON.stringify(df));
  const d2 = await R['POST /api/x/missions/diff'](null, { mod, map: 'map/multi/m3' }, ctx);
  ok(d2.ok && !d2.rows.length && !d2.findings.length, 'misdiff: a map the mod leaves alone has no changes ' + JSON.stringify(d2));
  const da = await R['POST /api/x/missions/diff'](null, { mod: away, map: 'map/multi/m1' }, ctx);
  ok(!da.ok && da.installed === false && da.say[0].k === 'missions.s.notinstalled', 'a mod outside <game>/mods: say install it first');
  ok(X._t.ROW.exec('MIS_DIFF_ENTITY_DEF_CHANGED')[2] === 'DEF_CHANGED' && X._t.ROW.exec('MIS_DIFF_SPAWN_COUNT')[1] === 'SPAWN', 'diff code split into thing and change');

  // ---- a phone (LAN Remote): facts and mine ask ctx.pathOk about the mod folders; one diff at a time for remote devices
  const blocked = path.join(mod, 'resource', 'map').toLowerCase();
  const pctx = Object.assign({}, ctx, { session: { remote: true }, pathOk: p => !path.resolve(p).toLowerCase().startsWith(blocked) });
  const pf = await R['GET /api/x/missions/facts'](U('map=map/multi/m1&mod=' + encodeURIComponent(mod)), null, pctx);
  ok(pf.modWhy === 'missions.e.phone' && pf.modes.length === 1 && pf.modes[0].mode === 'combat' && !pf.modes[0].own, 'phone: a mod map folder ctx.pathOk refuses gives the game\'s facts alone, with the reason ' + JSON.stringify(pf));
  const pm = await R['GET /api/x/missions/mine'](U('mod=' + encodeURIComponent(mod)), null, pctx);
  ok(pm.maps.length === 0, 'phone: mine skips a folder ctx.pathOk refuses ' + JSON.stringify(pm));
  const yes = Object.assign({}, pctx, { pathOk: p => typeof p === 'string' && path.isAbsolute(p) });
  ok((await R['GET /api/x/missions/mine'](U('mod=' + encodeURIComponent(mod)), null, yes)).maps.some(m => m.key === 'map/multi/m1') && (await R['GET /api/x/missions/facts'](U('map=map/multi/m1&mod=' + encodeURIComponent(mod)), null, yes)).modes.some(m => m.mode === 'battle_zones' && m.own), 'phone: folders ctx.pathOk passes are read as on the PC');
  let release = null;
  const slow = Object.assign({}, yes, { runTool: (...a) => new Promise(res => { release = () => res(ctx.runTool(...a)); }) });
  const dSlow = R['POST /api/x/missions/diff'](null, { mod, map: 'map/multi/m1' }, slow);
  let busy = null; try { await R['POST /api/x/missions/diff'](null, { mod, map: 'map/multi/m1' }, yes); } catch (e) { busy = e; }
  ok(busy && busy.status === 429 && busy.message === 'missions.e.busy', 'phone: a second diff while one runs is refused (busy) ' + (busy && busy.message));
  ok((await R['POST /api/x/missions/diff'](null, { mod, map: 'map/multi/m3' }, ctx)).ok, 'the PC is not limited while a phone diff runs');
  release(); ok((await dSlow).ok, 'the first phone diff ends normally');
  ok((await R['POST /api/x/missions/diff'](null, { mod, map: 'map/multi/m1' }, yes)).ok, 'phone: the next diff runs once the first has ended');

  // ---- game parity: MoW:AS2 (the shared AS2 folder, vfs exe mowas_2: no as64/core) and GoH (its own folder and file forms)
  // made-up AS2 folder with as64.exe: p1 battle_zones has 3 flags in the base data, 1 in as64/core (the AS64 view only)
  const g2 = path.join(work, 'game2'), put2 = (rel, lines) => { const f = path.join(g2, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, lines.join('\r\n') + '\r\n', 'latin1'); };
  put2('as64.exe', []);
  put2('resource/set/multiplayer/games/battle_zones.set', ['{game', '\t{settings', '\t\t{enableBots}', '\t}', '}']);
  put2('resource/map/multi/p1/battle_zones.mi', [...base, ...flag('0x8010', 1, 0, 100, 3), ...flag('0x8011', 2, -500, 50, 4), ...flag('0x8012', 3, 500, 150, 5), ...tail]);
  put2('resource/map/multi/p1/map.info', [';SDL', '{game {maxPlayers 2}}']);
  put2('as64/core/resource/map/multi/p1/battle_zones.mi', [...base, ...flag('0x8010', 1, 0, 100, 3), ...tail]);
  const m2mod = path.join(g2, 'mods', 'My_Mod2'); fs.mkdirSync(m2mod, { recursive: true });
  fs.writeFileSync(path.join(m2mod, 'mod.info'), '{Mod\r\n\t{Name "my_mod2"}\r\n\t{MinGameVersion "3.262.0"}\r\n\t{MaxGameVersion "3.262.1"}\r\n}\r\n');
  const gctx = (id, dir, extra) => Object.assign({}, ctx, { game: () => g2, gameId: () => id, exe: () => require('../../../lib/games').exeOf(id), kind: () => require('../../../lib/games').kindOf(id), curDir: () => dir || g2, gohDir: () => dir || null }, extra || {});
  const fa = await R['GET /api/x/missions/facts'](U('map=map/multi/p1'), null, gctx('as64'));
  const fm = await R['GET /api/x/missions/facts'](U('map=map/multi/p1'), null, gctx('mowas2'));
  ok(fa.game === 'as64' && fa.modes[0].flags === 1 && fm.game === 'mowas2' && fm.modes[0].flags === 3 && fm.modes[0].bots === true && fm.players === 2,
    'mowas2: the facts read the mowas_2 view (no as64/core: 3 flags), as64 the as64 view (1 flag) ' + JSON.stringify([fa.modes, fm.modes]));
  ok(JSON.stringify(fa.warn) === JSON.stringify(fm.warn) && fm.clips === null, 'mowas2: the AS2 warnings and clips as in AS64');
  // a stand-in tool runner: the args each route hands the tools
  const seen = [], stub = (out) => async (tool, entry, args) => { seen.push([tool, args]); return { code: 0, stdout: out || JSON.stringify({ info: [], findings: [] }), stderr: '', timedOut: false }; };
  const dm = await R['POST /api/x/missions/diff'](null, { mod: m2mod, map: 'map/multi/p1' }, gctx('mowas2', null, { runTool: stub() }));
  const dmA = seen.pop()[1];
  ok(dm.ok && dmA.join(' ').endsWith('--exe mowas_2') && dmA[dmA.indexOf('--mods') + 1] === 'my_mod2', 'mowas2 diff: misdiff --exe mowas_2, the mod named in lower case (VFS-12) ' + dmA.join(' '));
  // the drop line of misdiff: a findings entry WARN_MISDIFF_MOD_DROPPED (not counted in total, not a change)
  const drop = (n, file) => ({ file: file || 'mods', line: 0, code: 'WARN_MISDIFF_MOD_DROPPED', msg: 'MOD_VERSION mod "' + n + '" unsupported on 3.262 (Min "3.301" Max ""); skipped', severity: 'warn' });
  const dd = await R['POST /api/x/missions/diff'](null, { mod: m2mod, map: 'map/multi/p1' }, gctx('mowas2', null, { runTool: stub(JSON.stringify({ info: [], findings: [drop('my_mod2')], total: 1 })) }));
  seen.pop();
  ok(!dd.ok && dd.installed && dd.say[0].k === 'missions.s.dropped' && /my_mod2/.test(dd.say[0].p.why) && !dd.rows, 'mowas2 diff: my own mod left out by the game is said in plain words, no rows ' + JSON.stringify(dd));
  const do2 = await R['POST /api/x/missions/diff'](null, { mod: m2mod, map: 'map/multi/p1' }, gctx('mowas2', null, { runTool: stub(JSON.stringify({ info: [{ file: 'combat.mi', line: 3, code: 'MIS_DIFF_FLAG_ADDED', msg: 'flag f1' }], findings: [drop('other'), drop('other', 'mods-a'), { file: 'combat.mi', line: 4, code: 'WARN_MISDIFF_UID_COLLISION', msg: 'uid 0x1' }], total: 3 })) }));
  seen.pop();
  ok(do2.ok && do2.total === 1 && do2.rows.length === 1 && do2.rows.every(r => !/DROPPED/.test(r.code)) && do2.dropped.length === 1 && do2.findings.length === 1 && do2.findings[0].code === 'WARN_MISDIFF_UID_COLLISION', 'mowas2 diff: another mod left out is one plain line, not a change and not a warning ' + JSON.stringify(do2));
  const dq = await R['POST /api/x/missions/diff'](null, { mod: m2mod, map: 'map/multi/p1' }, gctx('mowas2', null, { runTool: stub(JSON.stringify({ info: [], findings: [{ file: 'mods', code: 'WARN_MISDIFF_MOD_DROPPED', msg: "MOD_UNKNOWN Mod 'My_Mod2' was disabled: Not installed" }] })) }));
  seen.pop();
  ok(!dq.ok && dq.say[0].k === 'missions.s.dropped', 'mowas2 diff: the Not installed drop (Mod \'x\') of my own mod is found too ' + JSON.stringify(dq));
  const stubErr = msg => async (tool, entry, args) => { seen.push([tool, args]); return { code: 1, stdout: '', stderr: msg, timedOut: false }; };
  const de = await R['POST /api/x/missions/diff'](null, { mod: m2mod, map: 'map/multi/p9' }, gctx('mowas2', null, { runTool: stubErr('error: map multi/p9: no files under resource/map/multi|single; MOD_VERSION mod "my_mod2" unsupported on 3.262.1 (Min "3.301" Max ""); skipped') }));
  const deo = await R['POST /api/x/missions/diff'](null, { mod: m2mod, map: 'map/multi/p9' }, gctx('mowas2', null, { runTool: stubErr('error: map multi/p9: no files under resource/map/multi|single; MOD_VERSION mod "other" unsupported on 3.262.1 (Min "3.301" Max ""); skipped') }));
  const vd = n => 'MOD_VERSION mod "' + n + '" unsupported on 3.262.1 (Min "3.301" Max ""); skipped';
  const de3 = await R['POST /api/x/missions/diff'](null, { mod: m2mod, map: 'map/multi/p9' }, gctx('mowas2', null, { runTool: stubErr('error: map multi/p9: no files under resource/map/multi|single; ' + ['ai3_t', 'aim2_t', 'army_t', 'my_mod2'].map(vd).join('; ')) }));
  seen.pop(); seen.pop(); seen.pop();
  ok(!de3.ok && de3.say[0].k === 'missions.s.dropped' && /^MOD_VERSION mod "my_mod2"/.test(de3.say[0].p.why) && de3.detail.length <= 300,
    'mowas2 diff: my drop after three other drops in the stop line (past the 300-character cut) is still found ' + JSON.stringify(de3));
  ok(!de.ok && de.say[0].k === 'missions.s.dropped' && /^MOD_VERSION mod "my_mod2"/.test(de.say[0].p.why) && deo.say[0].k === 'missions.s.difffail' && deo.detail,
    'mowas2 diff: a map only my left-out mod holds (misdiff stops) says the drop; another mod\'s drop stays the plain failure with its detail ' + JSON.stringify([de, deo]));
  ok(['en', 'ru', 'uk', 'zh'].every(g => X.lang[g]['missions.s.dropped'] && X.lang[g]['missions.diff.dropped'] && X.lang[g]['missions.diff.dropped'].includes('{why}') && X.lang[g]['missions.s.dropped'].includes('{why}')), 'the drop lines are in 4 languages');
  await R['POST /api/x/missions/diff'](null, { mod, map: 'map/multi/m1' }, Object.assign({}, ctx, { runTool: stub() }));
  ok(!seen.pop()[1].includes('--exe'), 'as64 diff: the argument list has no --exe, as before');
  const pm2 = await R['POST /api/x/missions/add'](null, { mod: m2mod, map: 'map/multi/p1', to: 'combat' }, gctx('mowas2', null, { runTool: stub('') }));
  ok(pm2.say.length && seen.length && seen[seen.length - 1][0] === 'mission-clone', 'mowas2 add: the mode maker runs for MoW:AS2 as for AS64 ' + JSON.stringify(pm2.say));

  // made-up GoH folder: no map.info, a <mode>.info per mode; flags = map points shown as MapPoint (zoneId, GHMAP-03); start points SpawnPoint
  const g3 = path.join(work, 'goh'), put3 = (root, rel, lines) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, lines.join('\r\n') + '\r\n', 'latin1'); };
  const zp = (uid, nm, zone, visor, mid) => [`\t{Entity "${nm}" ${uid}`, '\t\t{Position 10 20}', '\t\t{Extender "map_point"', `\t\t\t{name ${nm}}`, '\t\t\t{zone', '\t\t\t\t{radius 0}', `\t\t\t\t{zoneId "${zone}"}`, '\t\t\t}', '\t\t\t{allow', '\t\t\t\t{enableCapture}', '\t\t\t}', `\t\t\t{visor ${visor}}`, '\t\t}', '\t\t{Player 0}', `\t\t{MID ${mid}}`, '\t}'];
  put3(g3, 'binaries/x64/call_to_arms.exe', []);
  put3(g3, 'resource/set/multiplayer/games/battle_zones.set', ['{game', '\t{settings', '\t\t{options enableBots}', '\t\t{enableBots}', '\t}', '}']);
  put3(g3, 'resource/set/multiplayer/games/ammunition.set', ['{game', '\t{order 10}', '}']);
  put3(g3, 'resource/map/multi/g1/battle_zones.mi', ['{mission', ...zp('0x8001', 'flag_point_1', 'z1', 'MapPoint', 1), ...zp('0x8002', 'point_b', 'z2', 'MapPoint', 2),
    ...zp('0x8003', 's1', 'sa', 'SpawnPoint', 3), ...zp('0x8004', 's2', 'sb', 'SpawnPoint', 4), ...zp('0x8005', 's3', 'sc', 'SpawnPoint', 5), '\t{Tags "flag" 0x8001}', '\t{Tags "flag" 0x8002}',
    // the zone polygon of z1 in the game's form (gohmode.js: {position}{Name}{Point x y} relative to position); the flag at 10 20 is inside
    '\t{Helpers', '\t\t(include "../bz_events.inc")', '\t\t{zone "poly"', '\t\t\t{position 10 20 0}', '\t\t\t{Name "z1"}', '\t\t\t{Point -5 -5}', '\t\t\t{Point 5 -5}', '\t\t\t{Point 5 5}', '\t\t\t{Point -5 5}', '\t\t}', '\t}', '}']);
  put3(g3, 'resource/map/multi/g1/battle_zones.info', [';SDL', '{game', '\t{maxPlayers 4}', '}']);
  put3(g3, 'resource/map/multi/g1/ammunition.mi', ['{mission', ...zp('0x8001', 'a_point', 'z1', 'MapPoint', 1), ...zp('0x8003', 's1', 'sa', 'SpawnPoint', 3), '}']);
  put3(g3, 'resource/map/multi/g1/ammunition.info', [';SDL', '{game', '\t{maxPlayers 6}', '}']);
  put3(g3, 'resource/map/multi/g1/map', ['{Clips}']);
  const gohIn = path.join(g3, 'mods', 'goh_mod'), gohOut = path.join(work, 'goh_mods', 'away_goh');
  put3(gohIn, 'mod.info', ['{mod', '\t{name "goh_mod"}', '\t{minGameVersion "1.0"}', '\t{maxGameVersion "9.0"}', '}']);
  put3(gohOut, 'resource/map/multi/g1/battle_zones.mi', ['{mission', ...zp('0x8001', 'f1', 'z1', 'MapPoint', 1), ...zp('0x8002', 'f2', 'z2', 'MapPoint', 2), ...zp('0x8006', 'f3', 'z3', 'MapPoint', 6), ...zp('0x8007', 'f4', 'z4', 'MapPoint', 7), '}']);
  put3(gohOut, 'resource/map/multi/g2/battle_zones.mi', ['{mission', '}']);
  const hctx = extra => gctx('goh', g3, extra);
  const fg = await R['GET /api/x/missions/facts'](U('map=map/multi/g1'), null, hctx());
  const gbz = fg.modes.find(m => m.mode === 'battle_zones'), gam = fg.modes.find(m => m.mode === 'ammunition');
  ok(fg.game === 'goh' && fg.players === 6 && fg.modes.map(m => m.mode).join() === 'battle_zones,ammunition' && gbz.flags === 2 && gbz.spawns === 3 && gbz.players === 4 && gbz.bots === true
    && gam.flags === 1 && gam.players === 6 && gam.bots === false && fg.clips === null && !fg.warn.length,
    'goh facts: players per mode from <mode>.info, map points as flags, GoH mode order, no AS2 warnings ' + JSON.stringify(fg));
  const fgm = await R['GET /api/x/missions/facts'](U('map=map/multi/g1&mod=' + encodeURIComponent(gohOut)), null, hctx());
  ok(!fgm.modWhy && fgm.modes.find(m => m.mode === 'battle_zones').flags === 4 && fgm.modes.find(m => m.mode === 'battle_zones').own, 'goh facts: a GoH mod folder outside the install counts first ' + JSON.stringify(fgm.modes));
  const fr = await R['GET /api/x/missions/facts'](U('map=map/multi/g1&mod=' + encodeURIComponent(g3)), null, hctx());
  const fres = await R['GET /api/x/missions/facts'](U('map=map/multi/g1&mod=' + encodeURIComponent(path.join(g3, 'resource'))), null, hctx());
  const fin = await R['GET /api/x/missions/facts'](U('map=map/multi/g1&mod=' + encodeURIComponent(gohIn)), null, hctx());
  ok(fr.modWhy === 'maps.e.gameroot' && fres.modWhy === 'missions.e.gohmod' && !fin.modWhy, 'goh mod folder: the GoH root and a data folder refused, <GoH>/mods/<mod> read');
  const mg = await R['GET /api/x/missions/mine'](U('mod=' + encodeURIComponent(gohOut)), null, hctx());
  ok(mg.maps.map(m => m.key).join() === 'map/multi/g1,map/multi/g2', 'goh mine: the loose maps of a GoH mod ' + JSON.stringify(mg.maps.map(m => m.key)));
  // GoH add (gohmode.js): a mode of the same engine class is the source mode byte for byte, with its card when the view has none;
  // other kinds are refused with what their mission holds; zones re-shaped by numbers; written through lib/modwrite, read back
  const gohW = path.join(work, 'goh_mods', 'w_goh'); put3(gohW, 'mod.info', ['{mod', '\t{name "w_goh"}', '}']);
  const snap = d => { const o = {}; (function walk(x) { for (const e of fs.readdirSync(x, { withFileTypes: true })) { const p = path.join(x, e.name); if (e.isDirectory()) walk(p); else o[p] = fs.readFileSync(p).toString('base64'); } })(d); return JSON.stringify(o); };
  const g3Snap = snap(g3), add = b => R['POST /api/x/missions/add'](null, Object.assign({ mod: gohW, map: 'map/multi/g1' }, b), hctx());
  const G1 = path.join(gohW, 'resource', 'map', 'multi', 'g1'), gf = rel => fs.readFileSync(path.join(g3, ...rel.split('/')));
  const ga = await add({ to: 'armored_warfare' });
  ok(ga.ok && !ga.write && ga.from === 'battle_zones' && ga.files.join() === 'resource/map/multi/g1/armored_warfare.mi,resource/map/multi/g1/armored_warfare.info,resource/set/multiplayer/games/armored_warfare.set'
    && ga.say.map(s => s.k).join() === 'missions.s.gohcopy,missions.s.gohcard,missions.s.gohtest' && !fs.existsSync(G1), 'goh add preview: armored_warfare from battle_zones, card too, nothing written ' + JSON.stringify(ga));
  const gw = await add({ to: 'armored_warfare', write: true });
  ok(gw.ok && gw.back && gf('resource/map/multi/g1/battle_zones.mi').equals(fs.readFileSync(path.join(G1, 'armored_warfare.mi'))) && gf('resource/map/multi/g1/battle_zones.info').equals(fs.readFileSync(path.join(G1, 'armored_warfare.info')))
    && gf('resource/set/multiplayer/games/battle_zones.set').equals(fs.readFileSync(path.join(gohW, 'resource', 'set', 'multiplayer', 'games', 'armored_warfare.set'))) && gw.say.some(s => s.k === 'missions.s.gohback')
    && fs.existsSync(require('../../../lib/modwrite').restoreRoot(gohW)), 'goh add write: the files byte for byte, restore points, read back as the mode it came from ' + JSON.stringify(gw));
  const fwG = await R['GET /api/x/missions/facts'](U('map=map/multi/g1&mod=' + encodeURIComponent(gohW)), null, hctx()), awr = fwG.modes.find(m => m.mode === 'armored_warfare');
  ok(awr && awr.own && awr.flags === 2 && awr.spawns === 3 && awr.players === 4, 'goh add: the Missions page reads the new mode back ' + JSON.stringify(fwG.modes));
  const gz = await add({ to: 'heroes', zones: 'z1: 0 10, 20 10, 20 30, 0 30', write: true });
  const hz = fs.readFileSync(path.join(G1, 'heroes.mi'), 'latin1'), card2 = await add({ to: 'combined_arms' });
  ok(gz.ok && /\{Name "z1"\}\r\n\t\t\t\{Point -10 -10\}\r\n\t\t\t\{Point 10 -10\}\r\n\t\t\t\{Point 10 10\}\r\n\t\t\t\{Point -10 10\}\r\n\t\t\}/.test(hz) && !/[^\r]\n/.test(hz) && !/Point -5 -5/.test(hz)
    && hz.replace(/\t\t\t\{Point[^\r]*\r\n/g, '') === gf('resource/map/multi/g1/battle_zones.mi').toString('latin1').replace(/\t\t\t\{Point[^\r]*\r\n/g, '') && gz.say.some(s => s.k === 'missions.s.gohzone' && s.p.n === 4),
    'goh add zones: z1 re-shaped in the game form (relative points, CRLF), the rest of the mission as is ' + JSON.stringify(gz.say));
  ok(card2.ok && card2.files.length === 3 && card2.from === 'battle_zones', 'goh add: another family name from the same source ' + JSON.stringify(card2.files));
  const r1 = await add({ to: 'evacuation' }), r2 = await add({ to: 'nonsense' }), r3 = await add({ to: 'ammunition' }), r4 = await add({ to: 'cooperative' }), r5 = await add({ to: 'combined_arms', from: 'ammunition' });
  const z1 = await add({ to: 'combined_arms', zones: 'z1: 100 100, 120 100, 120 120, 100 120' }), z2 = await add({ to: 'combined_arms', zones: 'z9: 0 0, 1 0, 1 1, 0 1' }), z3 = await add({ to: 'combined_arms', zones: 'z1: 0 0, 30 0, 30 30' }), z4 = await add({ to: 'combined_arms', zones: 'z1 0 0' });
  ok(!r1.ok && r1.say[0].k === 'missions.s.gohbase' && !r2.ok && r2.say[0].k === 'missions.s.gohname' && !r3.ok && r3.say[0].k === 'missions.s.hasmode' && r4.say[0].k === 'missions.s.gohneed.coop' && r5.say[0].k === 'missions.s.gohneed.bz'
    && z1.say[0].k === 'missions.s.gohzout' && z1.say[0].p.point === 'flag_point_1' && z2.say[0].k === 'missions.s.gohznone' && z3.say[0].k === 'missions.s.gohzpts' && z4.say[0].k === 'missions.s.gohzbad'
    && [r1, r2, r3, r4, r5, z1, z2, z3, z4].every(r => !r.ok && r.say.length === 1) && !fs.existsSync(path.join(G1, 'evacuation.mi')) && !fs.existsSync(path.join(G1, 'combined_arms.mi')),
    'goh add refused with one plain line each: evacuation with no base, cooperative (what it lacks), a name GoH lacks, a mode the map has, zones outside, unknown, too few corners, unreadable ' + JSON.stringify([r1, r2, r3, r4, r5, z1, z2, z3, z4].map(r => r.say)));
  const gk = await add({ to: 'koth', write: true });
  ok(gk.ok && gk.back && gk.say[0].k === 'missions.s.gohbuild.koth' && gf('resource/map/multi/g1/battle_zones.mi').equals(fs.readFileSync(path.join(G1, 'koth.mi')))
    && gf('resource/set/multiplayer/games/battle_zones.set').equals(fs.readFileSync(path.join(gohW, 'resource', 'set', 'multiplayer', 'games', 'koth.set'))), 'goh add: koth is a copy of a battle zones mode with its card, read back ' + JSON.stringify(gk.say));
  const ge = await add({ to: 'battle_zones', edit: true, zones: 'z5 @ 30 30: 20 20, 40 20, 40 40, 20 40', write: true }), geT = fs.readFileSync(path.join(G1, 'battle_zones.mi'), 'latin1');
  ok(ge.ok && ge.back && ge.files.join() === 'resource/map/multi/g1/battle_zones.mi' && /\{Entity "flag_point_2" 0x8000\r\n\t\t\{Position 30 30\}/.test(geT) && /\{Name "z5"\}\r\n\t\t\t\{Point -10 -10\}/.test(geT)
    && /\{Tags "flag" 0x8000\}/.test(geT) && !/[^\r]\n/.test(geT) && ge.say.some(s => s.k === 'missions.s.gohflag'), 'goh add in place: a new flag on the ground with its zone and tag, the next free uid and flag entity ' + JSON.stringify(ge.say));
  ok(snap(g3) === g3Snap, 'goh add: the game folder is unchanged');
  {
    // the builders on a synthetic battle zones mission in the game's forms (gohmode.js header): flags tagged, a supply child, includes
    const GM = require('./gohmode');
    const fl = (u, n, z, o, x, y, mid, fort) => [`\t{Entity "flag_point_${n}" ${u}`, `\t\t{Position ${x} ${y}}`, '\t\t{Extender "map_point"', `\t\t\t{name c${n}}`, '\t\t\t{zone', '\t\t\t\t{radius 0}', `\t\t\t\t{zoneId "${z}"}`, '\t\t\t}', '\t\t\t{phase 0}', `\t\t\t{order ${o}}`, '\t\t\t{show All}', '\t\t\t{visor MapPoint}', '\t\t\t{allow', '\t\t\t\t{enableCapture}', '\t\t\t\t{enableRelease}', '\t\t\t}', '\t\t}']
      .concat(fort ? ['\t\t{Extender "fortification"', '\t\t\t{level', '\t\t\t\t{steps 2}', '\t\t\t\t{radius 5}', '\t\t\t\t{entity "sandbag_a"}', '\t\t\t\t{manual', '\t\t\t\t\t{0 1 0 0 1 0 0 0 0 1 3 4 0 }', '\t\t\t\t}', '\t\t\t}', '\t\t}'] : [], ['\t\t{Player 0}', `\t\t{MID ${mid}}`, '\t}']);
    const sp = (u, team, o, mid) => [`\t{Entity "map_point" ${u}`, '\t\t{Position 0 0 5}', '\t\t{Extender "map_point"', `\t\t\t{name ${team}${o}}`, `\t\t\t{team ${team}}`, '\t\t\t{phase 0}', `\t\t\t{order ${o}}`, '\t\t\t{visor SpawnPoint}', '\t\t}', '\t\t{Player 0}', `\t\t{MID ${mid}}`, '\t}'];
    const zn = (n, x, y) => ['\t\t{zone "poly"', `\t\t\t{position ${x} ${y} 0}`, `\t\t\t{Name "${n}"}`, '\t\t\t{Point -50 -50}', '\t\t\t{Point 50 -50}', '\t\t\t{Point 50 50}', '\t\t\t{Point -50 50}', '\t\t}'];
    const mi = spawns => ['{mission', ...fl('0x8001', 1, 'f1', 1, 100, 100, 1, true), ...fl('0x8002', 2, 'f2', 2, 300, 100, 2, false), '\t{Entity "flagpoint_ammo" 0x8003', '\t\t{Extender "supply_zone"', '\t\t\t{enabled}', '\t\t\t{current 0}', '\t\t}', '\t}',
      ...spawns, '\t{Link 0x8003 {0x8001 "ammo"}}', '\t{Tags "flag" 0x8001}', '\t{Tags "flag" 0x8002}', '\t{Environment "e"}', '\t{Helpers', '\t\t(include "../bz_events.inc")', ...zn('f1', 100, 100), ...zn('f2', 300, 100), ...zn('global', 0, 0),
      '\t\t{vars', '\t\t\t(include "../bz_vars.inc")', '\t\t}', '\t\t{triggers', '\t\t\t(include "../bz_triggers.inc")', '\t\t}', '\t}', '}'].join('\r\n') + '\r\n';
    const four = [1, 2, 3, 4].flatMap(o => sp('0x80' + (o + 3).toString(16).padStart(2, '0'), 'a', o, 10 + o)).concat([1, 2, 3, 4].flatMap(o => sp('0x80' + (o + 7).toString(16).padStart(2, '0'), 'b', o, 20 + o)));
    const files = spawns => ({ 'resource/map/multi/s/battle_zones.mi': Buffer.from(mi(spawns), 'latin1'), 'resource/map/multi/s/battle_zones.info': Buffer.from(';SDL\r\n{game\r\n\t{maxPlayers 8}\r\n}\r\n', 'latin1'),
      'resource/map/multi/s/map': Buffer.from('{Entity "tree" 0x800c}\r\n{MID 30}\r\n', 'latin1'), 'resource/set/multiplayer/games/battle_zones.set': Buffer.from('{game}\r\n', 'latin1') });
    const P = (to, zones, spawns, extra) => { const fsx = files(spawns || four); return GM.plan(Object.assign({ read: r => fsx[r] || null, srcKey: 'map/multi/s', modes: ['battle_zones'], to, zones }, extra)); };
    const am = P('ammunition', 'base_a @ 0 0: -10 -10, 10 -10, 10 10, -10 10 | base_b = f2'), amT = am.ok && am.files[0][1].toString('latin1');
    const mids = amT ? [...amT.matchAll(/\{MID (\d+)\}/g)].map(m => m[1]) : [];
    ok(am.ok && /\{Entity "ammo_point" 0x8001\r\n\t\t\{Position 100 100\}\r\n\t\t\{Extender "map_point"/.test(amT) && /\{order 0\}/.test(amT) && !/\{entity "sandbag_a"\}/.test(amT)
      && /\{Entity "ammo2" 0x8003/.test(amT) && /\{Link 0x8003 \{0x8001 "ammo"\}\}/.test(amT) && !/0x8002/.test(amT) && (amT.match(/\{Entity "flag_point_base" /g) || []).length === 2
      && /\{name base_flag_a\}/.test(amT) && /\{name base_flag_b\}/.test(amT) && /\{entity "flagpoint_ammo"\}/.test(amT) && /\{Name "base_a"\}/.test(amT) && /\{Name "base_b"\}\r\n\t\t\t\{Point -50 -50\}/.test(amT)
      && /am_events\.inc[\s\S]*am_vars\.inc[\s\S]*am_triggers\.inc/.test(amT) && !/bz_/.test(amT) && !/[^\r]\n/.test(amT) && !/ 0x800c\b/.test(amT) && !mids.includes('30') && new Set(mids).size === mids.length
      && am.files.length === 3 && am.files[2][0].endsWith('ammunition.set') && am.say[0].k === 'missions.s.gohbuild.am' && am.say[0].p.b === 'f2',
      'goh build ammunition: flags to ammo points with their supply, bases at numbers and at a flag, am includes, free uid and MID ' + JSON.stringify(am.say || am.why));
    const ev = P('evacuation', 'base_a @ 200 200: 190 190, 210 190, 210 210, 190 210'), evT = ev.ok && ev.files[0][1].toString('latin1'), evI = ev.ok && ev.files[1][1].toString('latin1');
    ok(ev.ok && (evT.match(/\{Entity "ammo_point"/g) || []).length === 2 && /\{Placer\r\n\t\t\t\{State "ammo" \{Unlinked\}\}\r\n\t\t\}\r\n\t\t\{Extender "map_point"/.test(evT) && !/\{Link /.test(evT) && !/flagpoint_ammo" 0x/.test(evT)
      && /\{Entity "evacuation_point" (0x[0-9a-f]+)[\s\S]*\{Tags "flag" \1\}/.test(evT) && /ev_triggers\.inc/.test(evT) && /\{minPlayers 8\}\r\n\t\{maxPlayers 8\}/.test(evI) && (evT.match(/\{visor MapPoint\}/g) || []).length === 1 && ev.expect.flags === 1,
      'goh build evacuation: ammo points in order with Placer, no links, the evacuation point tagged, 8 players in .info ' + JSON.stringify(ev.say || ev.why));
    const evNo = P('evacuation', 'base_a = f1', four.slice(0, 12 * 2)), amNo = P('ammunition', 'base_a = f1'), amRef = P('ammunition', 'base_a = f9 | base_b = f2'), koB = P('koth', 'base_a = f1');
    const gu = P('guerrilla', ''), guT = gu.ok && gu.files[0][1].toString('latin1'), cf = P('captureflag', ''), fl2 = P('frontlines', ''), dc = P('campaign_capture_the_flag', '');
    ok(!evNo.ok && evNo.why.k === 'missions.s.gohevspawn' && !amNo.ok && amNo.why.k === 'missions.s.gohbase' && amNo.why.p.need === 'base_b' && amRef.why.k === 'missions.s.gohbaseref' && koB.why.k === 'missions.s.gohbasenot'
      && gu.ok && !/Tags "flag"/.test(guT) && !/flag_point_|flagpoint_ammo|\{Link /.test(guT) && /\{Name "f1"\}/.test(guT) && gu.expect.flags === 0 && cf.ok && cf.files[0][1].equals(files(four)['resource/map/multi/s/battle_zones.mi'])
      && fl2.why.k === 'missions.s.gohneed.fl' && dc.why.k === 'missions.s.gohneed.dcg', 'goh build: refusals (start points, bases), guerrilla without flags, captureflag a copy, frontlines and campaign refused');
    const ed = P('battle_zones', 'f3 @ 500 500: 450 450, 550 450, 550 550, 450 550', null, { edit: true }), edT = ed.ok && ed.files[0][1].toString('latin1');
    const has = P('battle_zones', 'f1 @ 100 100: 50 50, 150 50, 150 150, 50 150', null, { edit: true }), out = P('battle_zones', 'f3 @ 0 0: 450 450, 550 450, 550 550, 450 550', null, { edit: true });
    const amEd = P('ammunition', 'f3 @ 500 500: 450 450, 550 450, 550 550, 450 550', null, { edit: true, modes: ['battle_zones', 'ammunition'] });
    ok(ed.ok && ed.files.length === 1 && /\{Entity "flag_point_3" 0x[0-9a-f]+\r\n\t\t\{Position 500 500\}[\s\S]*?\{order 3\}[\s\S]*?\{Extender "fortification"\r\n\t\t\t\{level\r\n\t\t\t\t\{steps 2\}\r\n\t\t\t\t\{radius 5\}\r\n\t\t\t\t\{entity "sandbag_a"\}\r\n\t\t\t\}/.test(edT)
      && (edT.match(/\{Entity "flagpoint_ammo"/g) || []).length === 2 && (edT.match(/\{Link /g) || []).length === 2 && (edT.match(/\{Tags "flag"/g) || []).length === 3 && /\{position 500 500 0\}\r\n\t\t\t\{Name "f3"\}/.test(edT)
      && (edT.match(/\{manual/g) || []).length === 1 && ed.expect.flags === 3 && has.why.k === 'missions.s.gohzhas' && out.why.k === 'missions.s.gohzout' && amEd.why.k === 'missions.s.gohedit',
      'goh new flag: the next flag entity on the ground, order after the last, fortification without manual placement, supply child, tag, zone; refused for a zone the mode has, a flag outside its zone, an ammunition mode ' + JSON.stringify(ed.say || ed.why));
  }
  ok(['en', 'ru', 'uk', 'zh'].every(l => ['missions.add.goh', 'missions.zones', 'missions.zones.hint', 'missions.b.zones', 'missions.s.gohcopy', 'missions.s.gohcard', 'missions.s.gohnotitle', 'missions.s.gohzone', 'missions.s.gohtest', 'missions.s.gohback', 'missions.s.gohbackbad',
    'missions.s.gohname', 'missions.s.gohnofrom', 'missions.s.gohnofile', 'missions.s.gohnocard', 'missions.s.gohneed.bz', 'missions.s.gohneed.bzsrc', 'missions.s.gohneed.coop', 'missions.s.gohneed.fl', 'missions.s.gohneed.dcg', 'missions.edit.opt', 'missions.s.gohback2', 'missions.s.gohflag',
    'missions.s.gohbuild.am', 'missions.s.gohbuild.ev', 'missions.s.gohbuild.koth', 'missions.s.gohbuild.captureflag', 'missions.s.gohbuild.guerrilla', 'missions.s.gohzhas', 'missions.s.gohzmax', 'missions.s.gohbase',
    'missions.s.gohbasenot', 'missions.s.gohbaseref', 'missions.s.gohinc', 'missions.s.gohevspawn', 'missions.s.gohnoflags', 'missions.s.gohedit', 'missions.s.gohform',
    'missions.s.gohzbad', 'missions.s.gohznone', 'missions.s.gohzform', 'missions.s.gohzpts', 'missions.s.gohzout'].every(k => X.lang[l][k] && !/\bdear(er)?\b/i.test(X.lang[l][k]))), 'goh add strings in 4 languages');
  const dg = await R['POST /api/x/missions/diff'](null, { mod: gohIn, map: 'map/multi/g1' }, hctx({ runTool: stub() }));
  const dgA = seen.pop()[1];
  ok(dg.ok && dgA[dgA.indexOf('--game') + 1] === g3 && dgA.join(' ').endsWith('--exe goh'), 'goh diff: misdiff on the GoH folder with --exe goh ' + dgA.join(' '));
  const dgo = await R['POST /api/x/missions/diff'](null, { mod: gohOut, map: 'map/multi/g1' }, hctx({ runTool: stub() }));
  ok(dgo.ok && seen.pop()[1].join(' ').includes('--mod-dir ' + gohOut), 'goh diff: a GoH mod folder outside the install is compared by its path (misdiff --mod-dir) ' + JSON.stringify(dgo));
  const before = seen.length, tout = async (tool, entry, args) => { seen.push([tool, args]); return { code: null, stdout: '', stderr: '', timedOut: true }; };
  const dgt = await R['POST /api/x/missions/diff'](null, { mod: gohIn, map: 'map/multi/g1' }, hctx({ runTool: tout }));
  ok(!dgt.ok && dgt.timedOut && dgt.say[0].k === 'missions.s.difftimeout' && dgt.say[0].p.s === 600 && seen.length === before + 1, 'goh diff: a run stopped at the time limit says so with the seconds (missions.s.difftimeout) ' + JSON.stringify(dgt));
  seen.length = before;
  const comma = path.join(path.dirname(gohOut), 'a,b'); fs.mkdirSync(comma, { recursive: true });
  let ce = null; try { await R['POST /api/x/missions/diff'](null, { mod: comma, map: 'map/multi/g1' }, hctx({ runTool: stub() })); } catch (e) { ce = e; }
  ok(ce && ce.status === 400 && ce.message === 'missions.e.comma' && seen.length === before, 'goh diff: a mod folder path with a comma is refused before misdiff runs (it splits --mod-dir on commas)');
  const XT = X._t, gg = XT.gameOf(hctx());
  // the readers are the map recipe's (p-rec2): one view per game, the recipe's cache keyed by exe, so the games never share a view
  const RT = RC._t, g2a = XT.gameOf(gctx('as64')), g2m = XT.gameOf(gctx('mowas2'));
  ok(XT.viewOf(g2a) === g2 && XT.viewOf(g2m).exe === 'mowas_2' && XT.viewOf(gg).exe === 'goh' && XT.viewOf(gg).dir === g3, 'game views: AS64 the folder alone (as before), MoW:AS2 and GoH {dir, exe} ' + JSON.stringify([XT.viewOf(g2a), XT.viewOf(g2m), XT.viewOf(gg)]));
  const va = XT.vfsOf(g2a, []), vw = XT.vfsOf(g2m, []);
  ok(va && vw && va !== vw && va === RT.vfsOf(g2, []) && vw === RT.vfsOf({ dir: g2, exe: 'mowas_2' }, []) && va.files.has('resource/map/multi/p1/battle_zones.mi'), 'game views: the missions page and the map recipe share one cache, AS64 and MoW:AS2 apart');
  let gn = null; try { await R['GET /api/x/missions/facts'](U('map=map/multi/g1'), null, Object.assign({}, hctx(), { curDir: () => null, gohDir: () => null })); } catch (e) { gn = e; }
  ok(gn && gn.message === 'missions.e.nogoh', 'goh: no GoH folder set is said');

  // ---- strings: same keys in 4 languages, every key the code names, every refusal key
  const L = X.lang, src = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8') + X.script;
  ok(['ru', 'uk', 'zh'].every(g => Object.keys(L[g]).length === Object.keys(L.en).length && Object.keys(L.en).every(k => L[g][k])), 'same keys in en ru uk zh');
  const used = [...new Set([...src.matchAll(/'(missions\.[A-Za-z0-9_.]+)'/g)].map(m => m[1]))];
  ok(used.every(k => ['en', 'ru', 'uk', 'zh'].every(g => L[g][k])), 'every missions key the code names, in 4 languages: ' + used.filter(k => !L.en[k] || !L.uk[k]).join());
  const things = ['mode', 'mapinfo', 'entity', 'trigger', 'zone', 'event', 'waypoint', 'task', 'var', 'link', 'helper', 'block', 'spawn'], acts = ['added', 'removed', 'moved', 'def_changed', 'changed', 'count'];
  ok(things.every(t => L.en['missions.thing.' + t]) && acts.every(a => L.en['missions.act.' + a]), 'every misdiff thing and change has a word');
  ok(/<game>\/mods/.test(L.en['missions.diff.limit']) && ['ru', 'uk', 'zh'].every(g => L[g]['missions.diff.limit'].includes('<game>/mods')), 'the misdiff limit is stated on the page in 4 languages');
  ok(!Object.values(L).some(t => Object.values(t).some(s => /(?<![\w.\/\\#+$'"`-])as64(?![\w+\/\\'"`]|\.\w)/.test(s))), 'no bare as64 in the strings');

  // ---- page script in a fake DOM
  const vm = require('vm');
  const { make } = require(path.join(__dirname, '..', '..', 'test', 'fakedom'));
  const ML = MP.lang;
  // the page's mod is one with no maps yet, so the facts are the game's
  let FOLD = false;
  // POLL: the page's real pause rule (pollLater, pollStop, pollWake of page.js) runs in the box
  let POLL = false;
  const POLLSRC = 'var POLLS=[];\n' + ['pageHid', 'pollOn', 'pollLater', 'pollStop', 'pollWake'].map(BC.fnSrc).join('\n');
  const page = (lang, apiFn, S0, extra) => {
    const doc = make(), calls = [], shows = [], opened = [];
    const box = {
      document: doc, EXT_SCREENS: {}, S: Object.assign({ mod: away }, S0 || {}), window: { confirm: () => box.confirmAnswer }, confirmAnswer: false, calls, shows, opened,
      tx: (k, p) => { const s = L[lang][k] != null ? L[lang][k] : ML[lang][k] != null ? ML[lang][k] : L.en[k] != null ? L.en[k] : ML.en[k]; return s == null ? k : s.replace(/\{(\w+)\}/g, (a, b) => (p && p[b] != null ? String(p[b]) : a)); },
      LANGS: { en: Object.assign({}, ML.en, L.en) },
      toast: () => {}, show: (id, a) => { shows.push(id); box.showArg = a; }, pick: () => {}, setTimeout, clearTimeout, setMod: p => { box.S.mod = p; }, encodeURIComponent,
      TASK: { open: (rid, verb, o) => { opened.push([rid, verb, o]); return Promise.resolve(null); } },
      api: (u, b, o) => { calls.push([u, b, o]); return apiFn(u, b); },
    };
    const F = BC.pageFns(doc); for (const n of BC.NAMES) box[n] = F[n];
    box.LS = { m: {}, get(k, d) { return k in this.m ? this.m[k] : d; }, set(k, v) { this.m[k] = v; } };
    Object.assign(box, extra || {});
    vm.runInNewContext((POLL ? POLLSRC + '\n' : '') + BC.kitSrc() + '\n' + X.script, box);   // the page's real searchKit (page.js)
    const rootEl = doc.createElement('section'); rootEl.setAttribute('data-id', 'missions');
    const scr = box.EXT_SCREENS.missions(rootEl);
    // the older tests read every unit row's controls and the full summary: all open, unless a test asks for the folded page (FOLD)
    if (!FOLD && scr && scr.sp && scr.sp._t && scr.sp._t.full) scr.sp._t.full(true);
    return { box, rootEl, scr, doc };
  };
  const tick = () => new Promise(r => setTimeout(r, 0));
  const all = (e, f, o = []) => { for (const c of e.children) { if (f(c)) o.push(c); all(c, f, o); } return o; };
  const tag = (e, tg) => all(e, c => c.tagName === tg);
  const LIST = { state: 'done', cached: true, at: Date.UTC(2026, 10, 10), maps: [
    { key: 'map/multi/m1', folder: 'm1', name: 'Mill', players: 4, modes: ['combat'], mod: '', mods: [], copy: true },
    { key: 'map/multi/m2', folder: 'm2', name: 'Ridge', players: 2, modes: ['battle_zones'], mod: '', mods: [], copy: true }] };
  let addReply = () => Promise.resolve({ ok: true, write: false, from: 'combat', say: [{ k: 'maps.s.willmode', p: { mode: 'battle_zones', from: 'combat' } }], findings: [] });
  let diffReply = () => Promise.resolve({ ok: true, installed: true, name: 'my_mod', rows: [{ file: 'battle_zones.mi', code: 'MIS_DIFF_MODE_ADDED', thing: 'mode', act: 'added', n: 1 }], details: [{ file: 'battle_zones.mi', code: 'MIS_DIFF_MODE_ADDED', msg: 'x' }], findings: [{ sev: 'warn', code: 'WARN_MISDIFF_UID_COLLISION', file: 'combat.mi', msg: 'raw' }], total: 1 });
  const api = (u, b) => u.startsWith('/api/x/maps/list') ? Promise.resolve(LIST)
    : u.startsWith('/api/x/missions/mine') ? Promise.resolve({ maps: [{ key: 'map/multi/my_copy', folder: 'my_copy', name: 'my_copy', players: 0, modes: ['combat'], mod: '', mods: [], copy: true, mine: true }] })
    : u.startsWith('/api/x/missions/facts') ? R['GET /api/x/missions/facts'](U(u.split('?')[1]), null, ctx)
    : u === '/api/x/missions/add' ? addReply(b) : u === '/api/x/missions/diff' ? diffReply(b)
    : u === '/api/x/maps/check' ? checkReply() : Promise.resolve({});
  let checkReply = () => Promise.resolve({ check: { ran: true, count: 1, findings: [{ sev: 'warn', code: 'MIS_BOT_NO_FLAGS', msg: 'm', where: 'w' }] } });
  const P = page('uk', api);
  P.scr.focus(); await tick(); await tick(); await tick();
  const sel = tag(P.rootEl, 'SELECT')[0];
  const optT = tag(sel, 'OPTION').map(o => o.textContent);
  ok(optT.length === 4 && optT.some(t => /Mill \(m1\)/.test(t)) && optT.some(t => t.includes(L.uk['missions.mine'])), 'map select: the list plus my mod\'s loose map ' + optT.join(' / '));
  ok(P.box.calls.filter(c => c[0].startsWith('/api/x/maps/list')).length === 1, 'the Maps list job is asked once');
  // searchKit (owner 2026-11-19): the map filter has Browse, History and an index; no mod box (the header's mod)
  { const kits = all(P.rootEl, c => c.getAttribute && c.getAttribute('data-sk')).map(c => c.getAttribute('data-sk')).sort();
    ok(JSON.stringify(kits) === JSON.stringify(['missions.filter']), 'searchKit on every search box, no mod box: ' + kits.join());
    const filt = all(all(P.rootEl, c => c.getAttribute && c.getAttribute('data-sk') === 'missions.filter')[0], c => c.tagName === 'INPUT')[0];
    filt.value = 'rid'; filt.fire('input'); await tick(); await tick();
    const hit = all(P.rootEl, c => / sk-index/.test(' ' + c.className) && c.textContent.includes('Ridge'))[0];
    ok(!!hit, 'filter index: typing "rid" offers the map Ridge');
    // Browse = the picker in the game data at map/ (folders); a folder inside a listed map gives its key and picks it (seeded)
    const specs = []; P.box.searchKit.picker = (spec, done) => specs.push({ spec, done });
    all(P.rootEl, c => c.getAttribute && c.getAttribute('data-sk') === 'missions.filter')[0].querySelector('.sk-browse').click();
    const b0 = specs.pop();
    ok(b0 && b0.spec.view === 'data' && b0.spec.start === 'map' && b0.spec.mode === 'dir', 'filter Browse: the picker in the game data at map/ ' + JSON.stringify(b0 && b0.spec));
    b0.done('map/multi/my_copy/missions', { view: 'data', path: 'map/multi/my_copy/missions', name: 'missions' }); await tick(); await tick();
    ok(filt.value === 'map/multi/my_copy' && P.box.S.mapKey === 'map/multi/my_copy', 'filter Browse pick: the key of the map in my mod, and it is picked: ' + filt.value);
    delete P.box.searchKit.picker;
    filt.value = ''; filt.fire('input'); await tick(); }
  sel.value = 'map/multi/m1'; sel.fire('change'); await tick(); await tick(); await tick();
  ok(P.box.S.mapKey === 'map/multi/m1', 'the picked map is shared (S.mapKey)');
  const blkOf = id => all(P.rootEl, c => c.dataset && c.dataset.blk === id)[0];
  const rowsT = tag(blkOf('facts.table'), 'TR').map(r => r.textContent);
  ok(rowsT.some(t => t.startsWith('combat') && t.includes('02') && t.includes(L.uk['missions.bots.on'])), 'facts table in uk: combat, 0 flags, 2 start points, bots on: ' + rowsT.join(' / '));
  ok(blkOf('facts.warn').textContent.includes('combat') && blkOf('facts.warn').textContent.includes(L.uk['missions.warn']), 'warnings shown');
  const fromSel = tag(blkOf('add.from'), 'SELECT')[0], toSel = tag(blkOf('add.to'), 'SELECT')[0];
  ok(fromSel.value === 'combat' && tag(toSel, 'OPTION').map(o => o.value).join() === 'battle_zones,captureflag', 'add: from the map\'s modes, to the modes it lacks');
  ok(blkOf('add.flags').hidden === false, 'flags field shown for battle_zones');
  toSel.value = 'captureflag'; toSel.fire('change');
  ok(blkOf('add.flags').hidden === true && blkOf('add.tohelp').textContent.includes(L.uk['missions.clips.yes']), 'captureflag: flags hidden, clips found');
  toSel.value = 'battle_zones'; toSel.fire('change');
  const btn = k => tag(P.rootEl, 'BUTTON').find(b => b.textContent === L.uk[k]);
  ok(btn('missions.write').disabled, 'Write off before a preview');
  btn('missions.preview').click(); await tick(); await tick();
  ok(blkOf('add.out').textContent.includes(L.uk['missions.planOk']) && !btn('missions.write').disabled, 'preview shown, Write on');
  const lastAdd = P.box.calls.filter(c => c[0] === '/api/x/missions/add').pop();
  ok(lastAdd && lastAdd[1].map === 'map/multi/m1' && lastAdd[1].to === 'battle_zones' && lastAdd[1].from === 'combat' && lastAdd[1].write === false && lastAdd[1].mod === away, 'preview body ' + JSON.stringify(lastAdd));
  P.box.confirmAnswer = false; btn('missions.write').click(); await tick();
  ok(P.box.calls.filter(c => c[0] === '/api/x/missions/add').length === 1 && !btn('missions.write').disabled, 'Cancel at the confirm writes nothing, the preview stays');
  addReply = () => Promise.resolve({ ok: true, write: true, say: [{ k: 'maps.s.modemade', p: { mode: 'battle_zones', from: 'combat' } }], findings: [{ sev: 'warn', code: 'WARN_MC_FLAGS_AUTOPLACED', msg: 'm' }, { sev: 'warn', code: 'ZZ_RAW', msg: 'raw words' }], check: { ran: true, count: 0, findings: [] }, needsTest: true });
  P.box.confirmAnswer = true; btn('missions.write').click(); await tick(); await tick(); await tick();
  ok(blkOf('add.out').textContent.includes(L.uk['missions.done']) && blkOf('add.out').textContent.includes(L.uk['missions.test.h']) && btn('missions.write').disabled, 'write result: done, test hint, Write off again');
  ok(blkOf('add.out').textContent.includes(ML.uk['maps.c.WARN_MC_FLAGS_AUTOPLACED']) && blkOf('add.out').textContent.includes('raw words'), 'tool codes in uk words, an unknown one with its raw words');
  // misdiff + limit + check + guided
  ok(blkOf('diff.limit').textContent === L.uk['missions.diff.limit'], 'the misdiff limit is stated on the page');
  btn('missions.diff.run').click(); await tick(); await tick();
  ok(blkOf('diff.out').textContent.includes(L.uk['missions.thing.mode']) && blkOf('diff.out').textContent.includes(L.uk['missions.act.added']) && blkOf('diff.out').textContent.includes(L.uk['missions.c.WARN_MISDIFF_UID_COLLISION']), 'diff table and finding in uk');
  diffReply = () => Promise.resolve({ ok: false, installed: false, say: [{ k: 'missions.s.notinstalled' }] });
  btn('missions.diff.run').click(); await tick(); await tick();
  ok(blkOf('diff.out').textContent.includes(L.uk['missions.s.notinstalled']) && tag(blkOf('diff.out'), 'BUTTON').length === 1, 'not installed: said, with a button to Play');
  tag(blkOf('diff.out'), 'BUTTON')[0].click(); ok(P.box.shows.pop() === 'play', 'the button opens Play');
  btn('missions.check.run').click(); await tick(); await tick();
  const lastCk = P.box.calls.filter(c => c[0] === '/api/x/maps/check').pop();
  ok(lastCk && lastCk[1].only === 'missions' && blkOf('check.out').textContent.includes(L.uk['missions.c.MIS_BOT_NO_FLAGS']), 'check asks the Maps check for mission codes, shows them in uk');
  // milint refuses the game (maps lintMod check.na, games.refuse exit 2): its one plain line, not 'could not run'
  const naL = 'milint: not available for Made Up: no such files (ZZ-01)';
  checkReply = () => Promise.resolve({ check: { ran: false, na: naL, count: 0, findings: [] } });
  btn('missions.check.run').click(); await tick(); await tick();
  ok(blkOf('check.out').textContent.includes(naL) && !blkOf('check.out').textContent.includes(L.uk['missions.check.noRun']), 'check: a game milint refuses shows its plain line ' + blkOf('check.out').textContent);
  checkReply = () => Promise.resolve({ check: { ran: true, count: 1, findings: [{ sev: 'warn', code: 'MIS_BOT_NO_FLAGS', msg: 'm', where: 'w' }] } });
  btn('missions.task.mission').click(); btn('missions.task.map').click();
  ok(P.box.opened.length === 2 && P.box.opened[0][0] === 'mission' && P.box.opened[0][1] === 'change' && P.box.opened[0][2].base.id === 'map/multi/m1' && P.box.opened[1][0] === 'map', 'guided buttons open the mission and map tasks on this map');
  const nFacts = P.box.calls.filter(c => c[0].startsWith('/api/x/missions/facts')).length;
  btn('missions.ed.count').click(); await tick(); await tick();
  ok(P.box.calls.filter(c => c[0].startsWith('/api/x/missions/facts')).length === nFacts + 1, 'Count again asks the facts again');
  // a mod picked elsewhere after a preview: the preview is stale, Write off until a new Preview, and a Write never goes to the new mod
  addReply = () => Promise.resolve({ ok: true, write: false, from: 'combat', say: [{ k: 'maps.s.willmode', p: { mode: 'battle_zones', from: 'combat' } }], findings: [] });
  // rule 4 (owner 2026-11-19): no mod box on the page; the page follows the header's mod (S.mod), which modIn stands for below
  ok(!blkOf('add.mod') && !all(P.rootEl, c => c.getAttribute && c.getAttribute('data-sk') === 'missions.mod').length, 'no mod box on the page');
  const modIn = { get value() { return P.box.S.mod; } }, nAdd = () => P.box.calls.filter(c => c[0] === '/api/x/missions/add').length;
  btn('missions.preview').click(); await tick(); await tick();
  ok(!btn('missions.write').disabled && modIn.value === away, 'preview for the first mod, Write on');
  P.box.S.mod = mod; P.scr.focus(); await tick();
  ok(modIn.value === mod && btn('missions.write').disabled && blkOf('add.out').textContent.includes(L.uk['missions.restale'].split('{mod}')[0]), 'another mod on focus (header): Write off, the preview is called stale');
  btn('missions.preview').click(); await tick(); await tick();
  ok(!btn('missions.write').disabled && P.box.calls.filter(c => c[0] === '/api/x/missions/add').pop()[1].mod === mod, 'a new Preview for the new mod turns Write on');
  const n0 = nAdd(); P.box.S.mod = away; P.box.confirmAnswer = true; btn('missions.write').click(); await tick(); await tick();
  ok(nAdd() === n0 && btn('missions.write').disabled && modIn.value === away && blkOf('add.out').textContent.includes(L.uk['missions.restale'].split('{mod}')[0]), 'Write after the mod changed (no focus between): nothing sent, Write off, stale said');
  P.scr.refresh(); ok(btn('missions.write').disabled, 'refresh keeps Write off');
  // a Preview reply that arrives after the mod changed never turns Write on, and Write sends nothing for the new mod
  const outT = () => blkOf('add.out').textContent, staleT = L.uk['missions.restale'].split('{mod}')[0], noteT = L.uk['missions.planNote'].split('{mod}')[0];
  let rel = null; addReply = () => new Promise(res => { rel = () => res({ ok: true, write: false, from: 'combat', say: [], findings: [] }); });
  btn('missions.preview').click(); await tick();
  ok(P.box.calls.filter(c => c[0] === '/api/x/missions/add').pop()[1].mod === away && btn('missions.write').disabled && typeof rel === 'function', 'deferred Preview sent for the first mod, Write off meanwhile');
  P.box.S.mod = mod; P.scr.refresh(); await tick(); rel(); await tick(); await tick();
  ok(btn('missions.write').disabled && modIn.value === mod && outT().includes(staleT) && !outT().includes(noteT), 'a late Preview reply for the old mod: Write stays off, the preview is called stale ' + outT());
  let n1 = nAdd(); P.box.confirmAnswer = true; btn('missions.write').click(); await tick(); await tick();
  ok(nAdd() === n1 && btn('missions.write').disabled, 'and a Write after it sends nothing for the new mod');
  // the same for a map picked while the Preview runs: Write stays off, the choices are called changed
  rel = null; btn('missions.preview').click(); await tick();
  sel.value = 'map/multi/m2'; sel.fire('change'); await tick(); await tick(); rel(); await tick(); await tick();
  ok(btn('missions.write').disabled && outT().includes(L.uk['missions.reform']) && !outT().includes(noteT), 'a late Preview reply for the old map: Write stays off, the choices are called changed ' + outT());
  n1 = nAdd(); btn('missions.write').click(); await tick(); ok(nAdd() === n1, 'and Write sends nothing');
  // the mod changes while the Write question is open: answering yes sends nothing (with a refresh between, and without one)
  addReply = () => Promise.resolve({ ok: true, write: false, from: 'battle_zones', say: [], findings: [] });
  let pend = null; P.box.askDo = () => ({ then: cb => { pend = cb; } });
  btn('missions.preview').click(); await tick(); await tick();
  ok(!btn('missions.write').disabled && outT().includes(noteT), 'Preview for the map m2, Write on');
  n1 = nAdd(); btn('missions.write').click(); await tick();
  ok(typeof pend === 'function' && nAdd() === n1, 'Write asks first');
  P.box.S.mod = away; P.scr.refresh(); await tick(); pend(true); await tick(); await tick();
  ok(nAdd() === n1 && btn('missions.write').disabled && modIn.value === away && outT().includes(staleT), 'mod changed and page refreshed while the question was open: yes sends nothing, stale said ' + outT());
  btn('missions.preview').click(); await tick(); await tick();
  ok(!btn('missions.write').disabled, 'a new Preview for that mod turns Write on');
  pend = null; n1 = nAdd(); btn('missions.write').click(); await tick();
  P.box.S.mod = mod; pend(true); await tick(); await tick();
  ok(nAdd() === n1 && btn('missions.write').disabled && modIn.value === mod && outT().includes(staleT), 'mod changed (no refresh) while the question was open: yes sends nothing, stale said ' + outT());
  delete P.box.askDo;
  // a late facts reply for the old mod never replaces the new mod's facts (fSeq): pick a map (facts for mod A in flight), the mod
  // changes and the page refreshes (facts for mod B), B's reply comes first, then A's
  {
    const held = [];
    const apiF = (u, b) => u.startsWith('/api/x/missions/facts')
      ? new Promise((res, rej) => { const q = u.split('?')[1]; held.push({ mod: new URLSearchParams(q).get('mod'), go: () => R['GET /api/x/missions/facts'](U(q), null, ctx).then(res, rej) }); })
      : api(u, b);
    const P4 = page('en', apiF);
    P4.scr.focus(); await tick(); await tick(); await tick();
    const b4 = id => all(P4.rootEl, c => c.dataset && c.dataset.blk === id)[0];
    const s4 = tag(P4.rootEl, 'SELECT')[0]; s4.value = 'map/multi/m1'; s4.fire('change'); await tick();
    const hA = held.find(x => x.mod === away);
    P4.box.S.mod = mod; P4.scr.refresh(); await tick();
    const hB = held.filter(x => x.mod === mod).pop();
    ok(hA && hB && hA !== hB, 'two facts requests held: mod A, then mod B ' + JSON.stringify(held.map(x => x.mod)));
    await hB.go(); await tick(); await tick();
    await hA.go(); await tick(); await tick();
    const rows4 = tag(b4('facts.table'), 'TR').map(r => r.textContent), from4 = tag(tag(b4('add.from'), 'SELECT')[0], 'OPTION').map(o => o.value);
    ok(rows4.some(t => t.startsWith('battle_zones') && t.includes(L.en['missions.own.yes'])) && from4.includes('battle_zones'),
      'a late facts reply for the old mod is dropped: the own column and the from list still show the new mod ' + rows4.join(' / ') + ' | ' + from4.join());
    // Preview replies are sequenced (aSeq): Preview for mod B in flight, the mod changes, a new Preview for mod A answers first and
    // turns Write on; the late reply for mod B is dropped and leaves the good preview as it is
    const adds = []; addReply = () => new Promise(res => adds.push(() => res({ ok: true, write: false, from: 'combat', say: [], findings: [] })));
    const btn4 = k => tag(P4.rootEl, 'BUTTON').find(x => x.textContent === L.en[k]), out4 = () => b4('add.out').textContent;
    btn4('missions.preview').click(); await tick();
    P4.box.S.mod = away; P4.scr.refresh(); await tick(); await held[held.length - 1].go(); await tick(); await tick();
    ok(!btn4('missions.preview').disabled && adds.length === 1, 'Preview usable again for the new mod while the first one runs');
    btn4('missions.preview').click(); await tick();
    adds[1](); await tick(); await tick();
    ok(!btn4('missions.write').disabled && out4().includes(L.en['missions.planNote'].split('{mod}')[0]), 'the newer Preview turns Write on ' + out4());
    adds[0](); await tick(); await tick();
    ok(!btn4('missions.write').disabled && out4().includes(L.en['missions.planNote'].split('{mod}')[0]) && !out4().includes(L.en['missions.restale'].split('{mod}')[0]),
      'a late reply for the older Preview is dropped: Write stays on, no stale note ' + out4());
  }
  // a phone (RMT): the Check button is off and says why (maps/check is closed to remote devices)
  {
    const P5 = page('en', api, null, { RMT: true });
    const ck = tag(P5.rootEl, 'BUTTON').find(x => x.textContent === L.en['missions.check.run']);
    ok(ck && ck.disabled && all(P5.rootEl, c => c.dataset && c.dataset.blk === 'check.out')[0].textContent === L.en['missions.check.phone'], 'phone: Check my missions is off, with the reason');
    const P6 = page('en', api);
    ok(!tag(P6.rootEl, 'BUTTON').find(x => x.textContent === L.en['missions.check.run']).disabled, 'PC: Check my missions is on');
  }
  ok(blkOf('pick.limits').textContent === L.uk['missions.pick.limits'] && /resource\/map\/multi/.test(L.en['missions.pick.limits']) && /\b200\b/.test(L.en['missions.pick.limits']) && /\b300\b/.test(L.en['missions.pick.limits']), 'the loose map and list limits are stated on the page');
  btn('missions.toMaps').click(); ok(P.box.shows.pop() === 'maps', 'Open Maps');
  const pr = checkScreen(P.rootEl);
  ok(!pr.length, 'page blocks, loaded state:\n  ' + pr.slice(0, 20).join('\n  '));
  { const ids = [].slice.call(blkOf('main').children).map(c => c.dataset && c.dataset.blk);
    ok(blkOf('more').tagName === 'DETAILS' && blkOf('main').parentNode === blkOf('more') && ids.indexOf('pick') < ids.indexOf('facts') && ids.indexOf('facts') < ids.indexOf('add') && ids.indexOf('add') < ids.indexOf('diff') && ids.indexOf('pick') === 0,
      'the other cards: folded under the single-player card, in number order ' + ids.join()); }
  // a map picked on the Maps page is picked here when the page opens
  const P2 = page('en', api, { mapKey: 'map/multi/m2' });
  P2.scr.focus(); await tick(); await tick(); await tick();
  ok(tag(P2.rootEl, 'SELECT')[0].value === 'map/multi/m2' && P2.box.calls.some(c => /facts\?map=map%2Fmulti%2Fm2/.test(c[0])), 'S.mapKey from Maps picks the map here');
  // Count again with no map picked: the message goes to the editor card, not to the facts card
  const P3 = page('en', api); P3.scr.focus(); await tick(); await tick();
  const blk3 = id => all(P3.rootEl, c => c.dataset && c.dataset.blk === id)[0];
  tag(P3.rootEl, 'BUTTON').find(b => b.textContent === L.en['missions.ed.count']).click();
  ok(blk3('editor.state').textContent === L.en['missions.needMap'] && blk3('facts.state').textContent === L.en['missions.pickfirst'] && !P3.box.calls.some(c => c[0].startsWith('/api/x/missions/facts')), 'Count again with no map: Pick a map first in its own card, facts card unchanged');

  // ---- K5 (PERF.md): the 1.5 s re-ask of the map list while the scan runs waits while the page or the window is hidden (pollLater,
  // page.js): no request then; shown again = one request at once and the maps drawn as before; a game change drops the parked re-ask.
  // S.cur is this page and a wait of 1 s or more takes 5 ms
  {
    const wait = ms => new Promise(r => setTimeout(r, ms)), prog = L.en['missions.progress'].replace('{s}', '7'), fast = { setTimeout: (f, ms) => setTimeout(f, ms >= 1000 ? 5 : ms) };
    POLL = true;
    for (const how of ['page', 'window']) {
      let done = false;
      const PP = page('en', (u, b) => u.startsWith('/api/x/maps/list') ? Promise.resolve(done ? LIST : { state: 'running', elapsed: 7 }) : api(u, b), { cur: 'missions' }, fast);
      const lc = () => PP.box.calls.filter(c => c[0].startsWith('/api/x/maps/list'));
      const hide = v => { if (how === 'page') PP.box.S.cur = v ? 'share' : 'missions'; else PP.doc.hidden = v; };
      const mill = () => tag(PP.rootEl, 'OPTION').some(o => /Mill \(m1\)/.test(o.textContent));
      PP.scr.focus(); await wait(80);
      ok(lc().length >= 3 && lc().slice(1).every(c => c[2] && c[2].job === false) && PP.rootEl.textContent.includes(prog) && !mill(), 'poll (' + how + '): on screen the running list is asked again and again: ' + lc().length);
      hide(true); await wait(40); const n1 = lc().length; await wait(120);
      ok(lc().length === n1, 'poll (' + how + ' hidden): no list request while the scan runs: ' + n1 + ' -> ' + lc().length);
      done = true; hide(false); PP.scr.refresh(); PP.box.pollWake(); await tick(); await tick(); await tick();
      ok(lc().length === n1 + 1 && lc()[n1][2].job === false && mill(), 'poll (' + how + ' shown again): one request at once and the maps are drawn: ' + n1 + ' -> ' + lc().length);
      await wait(60);
      ok(lc().length === n1 + 1, 'poll (' + how + '): nothing more after the list came: ' + lc().length);
    }
    const PG = page('en', (u, b) => u.startsWith('/api/x/maps/list') ? Promise.resolve({ state: 'running', elapsed: 7 }) : api(u, b), { cur: 'missions' }, fast);
    const gc = () => PG.box.calls.filter(c => c[0].startsWith('/api/x/maps/list'));
    PG.scr.focus(); await wait(40); PG.box.S.cur = 'share'; await wait(40); const g1 = gc().length;
    PG.box.curGame = () => ({ id: 'goh', kind: 'goh', name: 'GoH' });
    PG.box.S.cur = 'missions'; PG.scr.refresh(); PG.box.pollWake(); await tick(); await tick();
    ok(gc().length === g1, 'poll: a game change while hidden drops the parked re-ask: ' + g1 + ' -> ' + gc().length);
    PG.box.S.cur = 'share'; PG.scr.focus(); await tick(); await tick();
    ok(gc().length === g1 + 1 && gc()[g1][2].job !== false, 'poll: the next focus asks the new game\'s list as a job of its own: ' + gc().length);
    await wait(60); ok(gc().length === g1 + 1, 'poll: and its re-ask waits while the page is hidden: ' + gc().length);
    POLL = false;
  }
  // ---- game parity on the page: texts per game (gk), the GoH add card line, the Players column, a game switch redraws
  let GAME = { id: 'mowas2', kind: 'as2', name: 'MoW:AS2' };
  const curGame = () => GAME;
  const PW = page('en', api, {}, { curGame }); PW.scr.focus(); await tick(); await tick();
  const blkW = id => all(PW.rootEl, c => c.dataset && c.dataset.blk === id)[0];
  const stepsW = () => tag(blkW('editor.steps'), 'LI').map(l => l.textContent);
  ok(stepsW()[0] === L.en['missions.ed.s1.mowas2'] && /mowas_2_ed\.exe/.test(stepsW()[0]) && stepsW()[1] === L.en['missions.ed.s2'] && blkW('editor.note').textContent === L.en['missions.ed.note.mowas2'],
    'mowas2 page: the editor step names mowas_2_ed.exe, the test run note cites TST-19 ' + stepsW()[0]);
  ok(blkW('add.from').hidden === false && blkW('add.btns').hidden === false && blkW('diff.limit').textContent === L.en['missions.diff.limit'], 'mowas2 page: add a mode and the diff as on AS64');
  const fgReply = Object.assign({}, fg, { mods: [], modWhy: null });
  const apiG = (u, b) => u.startsWith('/api/x/maps/list') ? Promise.resolve({ state: 'done', maps: [{ key: 'map/multi/g1', folder: 'g1', name: 'G1', players: 6, modes: ['battle_zones', 'ammunition'], mod: '', mods: [], copy: true }] })
    : u.startsWith('/api/x/missions/facts') ? Promise.resolve(fgReply) : api(u, b);
  GAME = { id: 'goh', kind: 'goh', name: 'GoH' };
  const PG = page('en', apiG, {}, { curGame }); PG.scr.focus(); await tick(); await tick();
  const blkG = id => all(PG.rootEl, c => c.dataset && c.dataset.blk === id)[0];
  const selG = tag(PG.rootEl, 'SELECT')[0]; selG.value = 'map/multi/g1'; selG.fire('change'); await tick(); await tick(); await tick();
  const ths = tag(blkG('facts.table'), 'TH'), rowsG = tag(blkG('facts.table'), 'TR').slice(1).map(r => tag(r, 'TD').map(d => d.textContent));
  ok(!ths[1].hidden && ths[1].textContent === L.en['missions.col.players'] && ths[2].textContent === L.en['missions.col.flags.goh'] && rowsG[0].join('|') === 'battle_zones|4|2|3|' + L.en['missions.bots.on'] + '|'
    && blkG('facts.intro').textContent === L.en['missions.facts.intro.goh'], 'goh page: Players and Map points columns, rows ' + JSON.stringify(rowsG));
  ok(tag(blkG('editor.steps'), 'LI')[0].textContent === L.en['missions.ed.s1.goh'] && /call_to_arms_ed\.exe/.test(L.en['missions.ed.s1.goh']) && tag(blkG('editor.steps'), 'LI')[2].textContent === L.en['missions.ed.s3.goh']
    && blkG('editor.note').textContent === L.en['missions.ed.note.goh'], 'goh page: the GoH editor steps (launcher page, map points) and note');
  const toG = tag(blkG('add.to'), 'OPTION').map(o => o.value);
  ok(!blkG('add.from').hidden && !blkG('add.btns').hidden && !blkG('add.zones').hidden && !blkG('add.zoneshint').hidden && blkG('add.flags').hidden && blkG('add.flagshint').hidden && !blkG('add.mod')
    && blkG('add.intro').textContent.includes(L.en['missions.add.goh']) && blkG('add.intro').textContent.includes(L.en['missions.na.add.goh'])
    && toG.includes('armored_warfare') && toG.includes('evacuation') && toG.filter(v => v === 'battle_zones').length === 1 && toG.indexOf('battle_zones') === toG.length - 1 && tag(blkG('add.to'), 'OPTION').pop().textContent === 'battle_zones (' + L.en['missions.edit.opt'] + ')' && !toG.includes('ammunition') && !toG.includes('combat')
    && blkG('about.modes').textContent.includes(L.en['missions.add.goh']) && blkG('about.safe').textContent === L.en['missions.safe.goh'] && blkG('diff.limit').textContent === L.en['missions.diff.limit.goh'],
    'goh page: the add form with the GoH mode names the map lacks and its battle zones mode marked change, zone outlines instead of flags, the plain line of what stays refused; no mod box; safe and diff texts for GoH ' + JSON.stringify(toG));
  // Preview sends the zones text with the request
  const zta = tag(blkG('add.zones'), 'TEXTAREA')[0]; zta.value = 'z1: 0 10, 20 10, 20 30, 0 30';
  const toSelG = tag(blkG('add.to'), 'SELECT')[0]; toSelG.value = 'heroes'; toSelG.fire('change');
  const nAddG = PG.box.calls.filter(c => c[0] === '/api/x/missions/add').length;
  tag(blkG('add.btns'), 'BUTTON')[0].fire('click'); await tick(); await tick();
  const addCall = PG.box.calls.filter(c => c[0] === '/api/x/missions/add')[nAddG];
  ok(addCall && addCall[1].to === 'heroes' && addCall[1].zones === 'z1: 0 10, 20 10, 20 30, 0 30' && !addCall[1].write, 'goh page: Preview sends the mode and the zone outlines ' + JSON.stringify(addCall && addCall[1]));
  // a game switch (screens are built once): the next focus draws the other game's texts and asks for its list again
  const nList = () => PW.box.calls.filter(c => c[0].startsWith('/api/x/maps/list')).length, n0l = nList();
  PW.scr.focus(); await tick(); await tick();
  ok(nList() === n0l + 1 && tag(blkW('editor.steps'), 'LI')[0].textContent === L.en['missions.ed.s1.goh'] && !blkW('add.zones').hidden && blkW('add.flagshint').hidden && tag(PW.rootEl, 'SELECT')[0].value === '',
    'game switch: texts redrawn for GoH, the pick cleared, the map list asked again');
  GAME = { id: 'as64', kind: 'as2', name: 'AS64' }; PW.scr.focus(); await tick(); await tick();
  ok(tag(blkW('editor.steps'), 'LI')[0].textContent === L.en['missions.ed.s1'] && !blkW('add.from').hidden && blkW('editor.note').textContent === L.en['missions.ed.note'], 'switch back to AS64: the AS64 texts and form');
  const prG = checkScreen(PG.rootEl);
  ok(!prG.length, 'goh page blocks:\n  ' + prG.slice(0, 20).join('\n  '));

  // ---- the Maps page shares the pick and links here
  const mp = (() => { const doc = make(), shows = [], box = { document: doc, EXT_SCREENS: {}, S: { mod, mapKey: 'map/multi/m2' }, window: {}, tx: k => (ML.en[k] != null ? ML.en[k] : k), toast: () => {}, show: id => shows.push(id), pick: () => {}, setTimeout, clearTimeout, setMod: () => {}, api: u => Promise.resolve(u.startsWith('/api/x/maps/list') ? LIST : { svg: null }) };
    const F = BC.pageFns(doc); for (const n of BC.NAMES) box[n] = F[n];
    box.LS = { m: {}, get(k, d) { return k in this.m ? this.m[k] : d; }, set(k, v) { this.m[k] = v; } }; vm.runInNewContext(BC.kitSrc() + '\n' + MP.script, box);
    const r = doc.createElement('section'); r.setAttribute('data-id', 'maps'); return { box, r, scr: box.EXT_SCREENS.maps(r), shows }; })();
  mp.scr.focus(); await tick(); await tick(); await tick();
  ok(tag(mp.r, 'TR').some(t => t.getAttribute('aria-selected') === 'true' && t.textContent.includes('Ridge')), 'Maps selects the map picked on Missions');
  tag(mp.r, 'BUTTON').find(b => b.textContent === ML.en['maps.toMissions']).click();
  ok(mp.shows.pop() === 'missions', 'Maps editor card opens Missions');

  // ---- CACHE (gui README contract 1): mine takes the mod's file rows from the shared walk (lib/modtree), no folder walk of its own
  {
    const cm = path.join(path.dirname(mod), 'mine_mod'), mk = rel => { const f = path.join(cm, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'x'); };
    ['mod.info', 'resource/map/multi/b_map/map.net', 'resource/map/multi/A_map/combat.mi', 'resource/map/multi/A_map/Battle_Zones.mi', 'resource/map/multi/pack/in1/map',
      'resource/map/multi/pack/In0/frontline.mi', 'resource/map/multi/pack/in2/deep/map.info', 'resource/map/multi/_x/map.info', 'resource/map/multi/a_map2/sub/combat.mi',
      'resource/map/multi/loose.mi', 'resource/map/multi/1v1_z/readme.txt', 'resource/map/single/c/m/0.mi', 'resource/set/x.set'].forEach(mk);
    // the folder walk the route did before (the reference the rows must give again, order included)
    const walkRef = m => { const out = [], root = path.join(m, 'resource', 'map', 'multi');
      (function walk(d, rel, depth) {
        let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
        const modes = es.filter(e => e.isFile() && /\.mi$/i.test(e.name)).map(e => e.name.slice(0, -3).toLowerCase());
        if (rel && (modes.length || es.some(e => e.isFile() && /^map(\.info|\.net)?$/i.test(e.name)))) {
          const key = ('map/multi/' + rel).toLowerCase();
          if (/^map\/multi\/[a-z0-9_\-./]+$/.test(key)) out.push({ key, folder: rel.split('/').pop().toLowerCase(), name: rel.split('/').pop(), players: 0, modes: modes.sort(), mod: '', mods: [], copy: true, mine: true });
          return;
        }
        if (depth < 2) for (const e of es) if (e.isDirectory()) walk(path.join(d, e.name), rel ? rel + '/' + e.name : e.name, depth + 1);
      })(root, '', 0);
      return out.slice(0, 200); };
    const scans = [], mctx = Object.assign({}, ctx, { modtree: Object.assign({}, MT, { ensure: (d, o) => { scans.push(d); return MT.ensure(d, o); } }) });
    const mine = async () => (await R['GET /api/x/missions/mine'](U('mod=' + encodeURIComponent(cm)), null, mctx)).maps;
    const m1 = await mine(), ref1 = walkRef(cm);
    ok(JSON.stringify(m1) === JSON.stringify(ref1) && m1.length === 6 && m1.map(x => x.key).join() === 'map/multi/a_map,map/multi/a_map2/sub,map/multi/b_map,map/multi/pack/in0,map/multi/pack/in1,map/multi/_x' && scans.length === 1,
      'mine: the rows of the shared walk give the list of the folder walk, same order: ' + JSON.stringify(m1.map(x => x.key)));
    const sigMap = MT.stamps(MT.last(cm), ['map'])['mod:map'], all1 = MT.last(cm).all;
    ok(JSON.stringify(await mine()) === JSON.stringify(m1) && MT.last(cm).all === all1, 'mine: asked again, the same answer from the same scan');
    // an edit in another area: the map signature stays, the answer stays
    fs.writeFileSync(path.join(cm, 'resource', 'set', 'x.set'), 'xy'); MT.touch(cm);
    const m2 = await mine();
    ok(JSON.stringify(m2) === JSON.stringify(m1) && MT.stamps(MT.last(cm), ['map'])['mod:map'] === sigMap && MT.last(cm).all !== all1, 'mine: an edit of a set file changes neither the map signature nor the list');
    // a new map (a write route touches the walk): listed, and equal to a fresh folder walk
    mk('resource/map/multi/c_new/map'); MT.touch(cm);
    const m3 = await mine();
    ok(m3.some(x => x.key === 'map/multi/c_new') && JSON.stringify(m3) === JSON.stringify(walkRef(cm)) && MT.stamps(MT.last(cm), ['map'])['mod:map'] !== sigMap, 'mine: a new map folder is listed after the walk was touched');
    // a phone (ctx.pathOk): a folder outside the shown roots is skipped, as before
    const no = Object.assign({}, mctx, { pathOk: d => !/pack/.test(String(d)) });
    const m4 = (await R['GET /api/x/missions/mine'](U('mod=' + encodeURIComponent(cm)), null, no)).maps;
    ok(m4.length === m3.length - 2 && !m4.some(x => /pack/.test(x.key)), 'mine: a folder the phone may not read lists nothing');
    // the write routes tell the shared walk
    const tch = [], tctx = Object.assign({}, ctx, { modtree: Object.assign({}, MT, { touch: d => { tch.push(d); MT.touch(d); } }) });
    await R['POST /api/x/missions/add'](null, { mod, map: 'map/multi/m1', to: 'captureflag', write: false }, tctx).catch(() => null);
    ok(tch.length === 0, 'touch: a preview of Add mode touches nothing');
  }
  await spTests();
  console.log(bad ? 'FAIL ' + bad : 'PASS');

  // ---- the card "Make a single-player mission" (sp.js + spcard.js; the spmis tool as a library). A made-up game holds the base map the
  // spmis templates name (map/single/01_usa-skirmish/01_usa-overlord, zones of the template names), breeds, two entity defs, the
  // multiplayer vehicle cards and a desc.lng with in-game names. The mod is <game>/mods/sp_mod with a mod.info.
  async function spTests() {
    const SPG = path.join(work, 'spgame'), MAP = 'resource/map/single/01_usa-skirmish/01_usa-overlord';
    const w = (rel, text) => { const f = path.join(SPG, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
    const zones = { flag_playerbase: [0, 4000], flag_a01: [-1000, 2000], flag_a02: [0, 2000], flag_a03: [1000, 2000], flag_b01: [-1000, 0], flag_b02: [0, 0], flag_b03: [1000, 0], flag_c02: [0, -2000], far_hill: [-2000, -2000] };
    w(MAP + '/map', '{map\r\n\t{Clips\r\n\t\t{"[auto]"\r\n\t\t\t{world -6000 -6000 6000 6000}\r\n\t\t\t{pather -5800 -5800 5800 5800}\r\n\t\t}\r\n\t}\r\n}\r\n');
    w(MAP + '/map.net', Buffer.from([0x0a, 0x02, 0, 0, 1])); w(MAP + '/map.ply', 'BPLY'); w(MAP + '/mtl0.mtl', '{material}\r\n'); w(MAP + '/minimap.dds', 'DDS ');
    w(MAP + '/interface.set', '{location\r\n\t{level 0}\r\n\t{level_set 1}\r\n}\r\n');
    w(MAP + '/0.mi', '{mission\r\n\t{Environment "skirmish/usa-omaha"}\r\n\t{Helpers\r\n' + Object.entries(zones).map(([n, p]) => `\t\t{zone "circle"\r\n\t\t\t{position ${p[0]} ${p[1]} 0}\r\n\t\t\t{Name "${n}"}\r\n\t\t\t{Radius 240}\r\n\t\t}\r\n`).join('')
      + '\t\t{waypoints "player"\r\n\t\t\t{"0"\r\n\t\t\t\t{position 0 4200 0}\r\n\t\t\t}\r\n\t\t}\r\n\t}\r\n}\r\n');
    // a second map with other place names (the wizard moves the places a map lacks)
    const MAP2 = 'resource/map/single/02_other/02_ridge';
    w(MAP2 + '/map', '{map\r\n\t{Clips\r\n\t\t{"[auto]"\r\n\t\t\t{world -6000 -6000 6000 6000}\r\n\t\t\t{pather -5800 -5800 5800 5800}\r\n\t\t}\r\n\t}\r\n}\r\n');
    w(MAP2 + '/0.mi', '{mission\r\n\t{Helpers\r\n' + ['ridge_base', 'ridge_top', 'ridge_road'].map((n, i) => `\t\t{zone "circle"\r\n\t\t\t{position ${i * 900} ${i * 700} 0}\r\n\t\t\t{Name "${n}"}\r\n\t\t\t{Radius 240}\r\n\t\t}\r\n`).join('') + '\t}\r\n}\r\n');
    // where units can walk: a map whose pather box (-1500..1500) leaves named places outside (seeded), and one with no pather box
    const EDGE = 'map/single/03_edge/03_marsh', BLIND = 'map/single/03_edge/04_quarry', EBOX = [-1500, -1500, 1500, 1500];
    const ezones = { flag_playerbase: [0, -1300], flag_a02: [0, 800], flag_b02: [4000, 0] };
    for (const [k, clip] of [[EDGE, '\t\t\t{pather -1500 -1500 1500 1500}\r\n'], [BLIND, '']]) {
      w('resource/' + k + '/map', '{map\r\n\t{Clips\r\n\t\t{"[auto]"\r\n\t\t\t{world -6000 -6000 6000 6000}\r\n' + clip + '\t\t}\r\n\t}\r\n}\r\n');
      w('resource/' + k + '/map.net', Buffer.from([0x0a, 0x02, 0, 0, 1])); w('resource/' + k + '/map.ply', 'BPLY');
      w('resource/' + k + '/0.mi', '{mission\r\n\t{Helpers\r\n' + Object.entries(ezones).map(([n, p]) => `\t\t{zone "circle"\r\n\t\t\t{position ${p[0]} ${p[1]} 0}\r\n\t\t\t{Name "${n}"}\r\n\t\t\t{Radius 240}\r\n\t\t}\r\n`).join('') + '\t}\r\n}\r\n');
    }
    for (const b of ['mp/usa/squadleader2', 'mp/usa/rifle', 'mp/usa/mgun', 'mp/usa/bazooker', 'mp/usa/smg', 'mp/usa/tankman2', 'mp/ger/rifle', 'mp/ger/mgun', 'mp/ger/smg'])
      w(`resource/set/breed/${b}.set`, '{breed\r\n\t{nationality x}\r\n}\r\n');
    w('resource/entity/-vehicle/tank_medium/m4a3e8/m4a3e8.def', '{game_entity}\r\n');
    w('resource/entity/-vehicle/cannon/pak40/pak40.def', '{game_entity}\r\n');
    w('resource/entity/-vehicle/armored_car/kfz222/kfz222.def', '{game_entity}\r\n'); w('resource/entity/-vehicle/tank_medium/pz4/pz4.def', '{game_entity}\r\n');
    w('resource/set/multiplayer/units/vehicles_usa.set', '{"m4a3e8"   ("v" c(0) t(all) s(usa) n1(3) n2(1) g(t1)) {level 1}}\r\n');
    w('resource/set/multiplayer/units/vehicles_ger.set', '{"kfz222"   ("v" c(0) t(all) s(ger) n1(3) n2(1) g(t1)) {level 1}}\r\n{"pz4"   ("v" c(0) t(all) s(ger) n1(3) n2(1) g(t1)) {level 1}}\r\n{"pak40"    ("vs" c(300) t(all cannon mediumcan) s(ger) n(2) g(c5)) {level 1}}\r\n');
    w('resource/interface/text/desc.lng', '{tags\r\n\t{"human"\r\n\t\t{"mp"\r\n\t\t\t{"usa"\r\n\t\t\t\t{"rifle" "<c(c3baae)>Rifleman"}\r\n\t\t\t\t{"squadleader2" "Officer"}\r\n\t\t\t\t{"tankman2" "Tank crew"}\r\n\t\t\t}\r\n\t\t}\r\n\t}\r\n\t{"entity"\r\n\t\t{"m4a3e8" "Sherman M4A3E8"}\r\n\t\t{"pak40" "PaK 40"}\r\n\t\t{"pz4" "Panzer IV"}\r\n\t\t{"kfz222" "Kfz 222"}\r\n\t}\r\n}\r\n');
    const spMod = path.join(SPG, 'mods', 'sp_mod'); fs.mkdirSync(spMod, { recursive: true });
    fs.writeFileSync(path.join(spMod, 'mod.info'), '{Mod\r\n\t{Name "sp_mod"}\r\n}\r\n');
    const bare = path.join(SPG, 'mods', 'bare_mod'); fs.mkdirSync(bare, { recursive: true });
    const sctx = Object.assign({}, ctx, { game: () => SPG, gamedir: SPG });
    const snap = root => { const o = {}; (function wk(d, rel) { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) { o[r + '/'] = ''; wk(path.join(d, e.name), r); } else o[r] = fs.readFileSync(path.join(d, e.name)).toString('base64'); } })(root, ''); return JSON.stringify(o); };
    const Q = q => U(q);
    const SP = require('../../../spmis/spmis');

    // -- server: start, maps, places, units
    const st = await R['GET /api/x/missions/sp/start'](Q(''), null, sctx);
    ok(!st.goh && st.templates.map(t => t.name).join() === 'assault,breakthrough,defence,destroy,escort' && st.types.join() === SP.OBJ_TYPES.join(), 'sp start: five templates (escort too) and the six goal types ' + JSON.stringify(st.templates.map(t => t.name)));
    const mp1 = await R['GET /api/x/missions/sp/maps'](Q('mod=' + encodeURIComponent(spMod)), null, sctx);
    ok(mp1.maps.some(m => m.key === 'map/single/01_usa-skirmish/01_usa-overlord' && m.kind === 'single' && m.group === '01_usa-skirmish') && mp1.maps.some(m => m.key === 'map/single/02_other/02_ridge'), 'sp maps: the game\'s single-player maps ' + JSON.stringify(mp1.maps));
    const pl = await R['GET /api/x/missions/sp/places'](Q('map=map/single/01_usa-skirmish/01_usa-overlord'), null, sctx);
    ok(Object.keys(zones).every(z => pl.places.some(p => p.name === z && p.kind === 'zone')) && pl.places.some(p => p.name === 'player/0' && p.kind === 'path'), 'sp places: the zones and the waypoint block/id of the map ' + JSON.stringify(pl.places.map(p => p.name)));
    await fails(() => R['GET /api/x/missions/sp/places'](Q('map=../x'), null, sctx), 'sp places: a bad map key refused');
    const uu = await R['GET /api/x/missions/sp/units'](Q('army=usa'), null, sctx), ug = await R['GET /api/x/missions/sp/units'](Q('army=ger'), null, sctx);
    const rif = uu.soldiers.find(s => s.def === 'mp/usa/rifle'), sh = uu.vehicles.find(v => v.def === 'm4a3e8'), pak = ug.vehicles.find(v => v.def === 'pak40');
    ok(rif && rif.name === 'Rifleman' && sh && sh.name === 'Sherman M4A3E8' && sh.kind === 'vehicle' && sh.crew && sh.crew.def === 'mp/usa/tankman2' && sh.crew.count === 3, 'sp units: in-game names (desc.lng, tags stripped), a vehicle with a tank crew ' + JSON.stringify([rif, sh]));
    ok(pak && pak.kind === 'gun' && pak.crew && pak.crew.def === 'mp/ger/rifle' && pak.crew.count === 2 && uu.soldiers.find(s => s.def === 'mp/usa/mgun').name === 'mgun', 'sp units: a gun with a crew of two, a soldier with no name uses its file name ' + JSON.stringify(pak));
    await fails(() => R['GET /api/x/missions/sp/units'](Q('army=x/../y'), null, sctx), 'sp units: a bad army refused');

    // -- every template previews clean on the made-up game (the five-Next path for each kind)
    for (const t of st.templates) {
      const r = await R['POST /api/x/missions/sp/preview'](null, { mod: spMod, spec: t.spec }, sctx);
      ok(r.ok && r.files.some(f => /\/0\.mi$/.test(f.rel)) && r.modInfo && !fs.existsSync(path.join(spMod, 'resource')), 'sp preview ' + t.name + ': accepted, nothing written ' + JSON.stringify(r.refusal || ''));
    }
    // -- refusals carry the field to mark
    const bad1 = JSON.parse(JSON.stringify(st.templates[0].spec)); bad1.player.units[1].at = 'nowhere';
    const r1 = await R['POST /api/x/missions/sp/preview'](null, { mod: spMod, spec: bad1 }, sctx);
    ok(!r1.ok && r1.refusal.code === 'SPMIS_POINT' && r1.refusal.field === 'pu.1' && r1.refusal.sub === 'at', 'sp refusal: a place not on the map names the unit row ' + JSON.stringify(r1.refusal));
    const bad2 = JSON.parse(JSON.stringify(st.templates[0].spec)); bad2.lose = { allDead: false };
    const r2 = await R['POST /api/x/missions/sp/preview'](null, { mod: spMod, spec: bad2 }, sctx);
    ok(!r2.ok && r2.refusal.code === 'SPMIS_NO_LOSE' && r2.refusal.field === 'lose', 'sp refusal: no way to lose names the lose block ' + JSON.stringify(r2.refusal));
    const bad3 = JSON.parse(JSON.stringify(st.templates[4].spec)); bad3.objectives[0].to = 'nowhere';
    ok((await R['POST /api/x/missions/sp/preview'](null, { mod: spMod, spec: bad3 }, sctx)).refusal.field === 'ob.0', 'sp refusal: a goal place names the goal row');
    const XS = X._t.sp;
    ok(XS.fieldOf(null, 'enemy.patrols[2].route[1]: x').f === 'ep.2' && XS.fieldOf(null, 'enemy.waves[0].time: x').f === 'ew.0' && XS.fieldOf(null, 'player.reinforcements[0]: x').f === 'rf.0'
      && XS.fieldOf({ objectives: [{ id: 'a' }, { id: 'b' }] }, 'objective b: minutes').f === 'ob.1' && XS.fieldOf(null, 'name "x y": letters').f === 'name' && XS.fieldOf(null, 'player.start: "q"').f === 'start', 'sp refusal fields: patrol, wave, help, goal by id, name, start');
    const rnm = await R['POST /api/x/missions/sp/preview'](null, { mod: bare, spec: st.templates[0].spec }, sctx);
    ok(rnm.ok && rnm.modInfo === false, 'sp preview: a mod folder with no mod.info is said (modInfo false)');
    await fails(() => R['POST /api/x/missions/sp/preview'](null, { mod: SPG, spec: st.templates[0].spec }, sctx), 'sp preview: the game folder as mod refused');
    await fails(() => R['POST /api/x/missions/sp/preview'](null, { mod: spMod, spec: 'x' }, sctx), 'sp preview: a spec that is no object refused');
    let ph = null; try { await R['POST /api/x/missions/sp/write'](null, { mod: spMod, spec: st.templates[0].spec }, Object.assign({}, sctx, { session: { remote: true } })); } catch (e) { ph = e; }
    ok(ph && ph.message === 'missions.e.spphone' && !fs.existsSync(path.join(spMod, 'resource')), 'sp write: refused from a phone');

    // -- JOBS: the worker calls can be stopped from the job list (README.md JOBS); a stopped Write leaves the mod as it was
    {
      const JL = require('../../joblist').create({ keepMs: 0 }), XJ = X._t.sp;
      const jctx = (base, extra) => { const job = JL.add({ kind: 'req', canCancel: false, keepMs: 0 }); return Object.assign({}, base, { job, jobs: JL }, extra || {}); };
      const errOf = async p => { try { await p; return null; } catch (e) { return e; } };
      const viewsBefore = (await XJ.heavy('stats', {})).views;
      const cA = jctx(sctx), cB = jctx(sctx), cC = jctx(sctx), t0 = Date.now();
      const pA = errOf(XJ.heavy('nap', { ms: 30000 }, cA)), pB = XJ.heavy('stats', {}, cB), pC = errOf(XJ.heavy('nap', { ms: 30000 }, cC));
      ok(cA.job.canCancel && cB.job.canCancel && cC.job.canCancel && XJ.queue().running === 'nap' && XJ.queue().waiting === 2, 'jobs: a call on the worker and the calls waiting for it can be stopped ' + JSON.stringify(XJ.queue()));
      ok(JL.cancel(cC.job.id), 'jobs: cancel of a waiting call is taken');
      const eC = await pC;
      ok(eC && eC.cancelled === true && XJ.queue().waiting === 1 && XJ.queue().running === 'nap' && !cC.job.canCancel, 'jobs: a waiting call that is stopped leaves the queue at once, the running one goes on ' + JSON.stringify(XJ.queue()));
      JL.cancel(cA.job.id);
      const eA = await pA, sB = await pB;
      ok(eA && eA.cancelled === true && sB && sB.views === 0 && viewsBefore > 0 && Date.now() - t0 < 20000 && !cA.job.canCancel && !cB.job.canCancel,
        'jobs: the running call that is stopped ends with its worker; the call behind it runs on a fresh worker ' + JSON.stringify([eA && eA.message, sB, viewsBefore, Date.now() - t0]));
      ok(!(await errOf(XJ.heavy('nap', { ms: 1 }, cA))) === false, 'jobs: a stopped request starts no further worker call');
      const tree0 = JSON.stringify(snap(spMod)), undo0 = XJ.UNDO.size, wBody = () => ({ mod: spMod, spec: JSON.parse(JSON.stringify(st.templates[0].spec)) });
      // a Preview behind another call: stopped while it waits
      const napP = XJ.heavy('nap', { ms: 400 }), cP = jctx(sctx), pP = errOf(R['POST /api/x/missions/sp/preview'](null, wBody(), cP));
      await new Promise(r => setTimeout(r, 20));
      ok(cP.job.canCancel && cP.job.what === 'job.w.spmis' && !cP.job.writes, 'jobs: a Preview is named and can be stopped while it waits');
      JL.cancel(cP.job.id); const eP = await pP;
      ok(eP && eP.cancelled === true, 'jobs: a stopped Preview ends as stopped'); await napP;
      // a Write stopped before its first file (the plan waits behind another call)
      const napW = XJ.heavy('nap', { ms: 400 }), cW = jctx(sctx), pW = errOf(R['POST /api/x/missions/sp/write'](null, wBody(), cW));
      await new Promise(r => setTimeout(r, 20));
      ok(cW.job.canCancel && cW.job.writes === true && cW.job.what === 'job.w.spmis', 'jobs: a Write is named, marked as writing, and can be stopped');
      JL.cancel(cW.job.id); const eW = await pW; await napW;
      ok(eW && eW.cancelled === true && JSON.stringify(snap(spMod)) === tree0 && XJ.UNDO.size === undo0, 'jobs: a Write stopped before its first file wrote nothing');
      // a Write stopped after its files were written (during the check of the mod, milint): every file is put back, no Undo is kept
      let lintRuns = 0, wroteAtLint = false;
      const cL = jctx(sctx, { runTool: async () => { lintRuns++; wroteAtLint = fs.existsSync(path.join(spMod, 'resource')); JL.cancel(cL.job.id); return { code: null, stdout: '', stderr: '', timedOut: false, cancelled: true }; } });
      const eL = await errOf(R['POST /api/x/missions/sp/write'](null, wBody(), cL));
      ok(lintRuns === 1 && wroteAtLint && eL && eL.cancelled === true && JSON.stringify(snap(spMod)) === tree0 && XJ.UNDO.size === undo0,
        'jobs: a Write stopped after its files were written is put back whole (files and new folders gone), and ends as stopped ' + JSON.stringify([lintRuns, wroteAtLint, eL && eL.message, XJ.UNDO.size - undo0]));
      // a Write stopped the moment its first file shows (the write call or the check on the worker): put back whole all the same
      const cR = jctx(sctx); let hit = false;
      const iv = setInterval(() => { if (!hit && fs.existsSync(path.join(spMod, 'resource'))) { hit = true; JL.cancel(cR.job.id); } }, 1);
      const rR = await R['POST /api/x/missions/sp/write'](null, wBody(), cR).then(j => ({ j }), e => ({ e }));
      clearInterval(iv);
      if (rR.e) ok(rR.e.cancelled === true && JSON.stringify(snap(spMod)) === tree0 && XJ.UNDO.size === undo0, 'jobs: a Write stopped while its files are written is put back whole ' + rR.e.message);
      else { console.log('note: the Write ended before the stop landed (stop seen: ' + hit + '); undone by its token'); await R['POST /api/x/missions/sp/undo'](null, { mod: spMod, token: rR.j.undo }, sctx); ok(JSON.stringify(snap(spMod)) === tree0, 'jobs: the Write that was not stopped is undone whole'); }
      ok((await XJ.heavy('stats', {})).views >= 0 && XJ.queue().waiting === 0 && XJ.queue().running === '', 'jobs: the worker answers again after the stops, nothing left in the queue');

      // missions/diff and missions/add
      const cD = jctx(ctx, { runTool: async () => ({ code: null, stdout: '', stderr: '', timedOut: false, cancelled: true }) });
      const dj = await R['POST /api/x/missions/diff'](null, { mod, map: 'map/multi/m3' }, cD);
      ok(dj.ok === false && dj.cancelled === true && !dj.say.length, 'jobs: a stopped comparison answers as stopped, not as a failed tool ' + JSON.stringify(dj));
      const mf = path.join(mod, 'resource', 'map', 'multi', 'm3', 'captureflag.mi'), addBody = { mod, map: 'map/multi/m3', from: 'combat', to: 'captureflag', write: true };
      ok(!fs.existsSync(mf), 'jobs: (the seeded map m3 has no captureflag mode in the mod)');
      let addRuns = 0;
      const cAd = jctx(ctx, { runTool: async () => { addRuns++; fs.mkdirSync(path.dirname(mf), { recursive: true }); fs.writeFileSync(mf, '{mission'); cAd.job.cancelled = true; return { code: null, stdout: '', stderr: '', timedOut: false, cancelled: true }; } });
      const aj = await R['POST /api/x/missions/add'](null, addBody, cAd);
      ok(aj.ok === false && aj.cancelled === true && addRuns === 1 && cAd.job.writes === true && !fs.existsSync(mf) && !aj.check, 'jobs: a stopped Add mode write: marked as writing, the cut-off mode file is gone, no check run after it ' + JSON.stringify([aj.ok, aj.cancelled, addRuns]));
      const cAe = jctx(ctx, { runTool: async () => { addRuns++; return { code: 0, stdout: '', stderr: '', timedOut: false }; } }); cAe.job.cancelled = true;
      const aj2 = await R['POST /api/x/missions/add'](null, addBody, cAe);
      ok(aj2.cancelled === true && addRuns === 1, 'jobs: Add mode after a stop runs no tool');
      const cAp = jctx(ctx, { runTool: async () => ({ code: 0, stdout: '', stderr: '', timedOut: false }) });
      await R['POST /api/x/missions/add'](null, Object.assign({}, addBody, { write: false }), cAp);
      ok(cAp.job.writes !== true, 'jobs: an Add mode preview is not marked as writing');
      try { fs.rmdirSync(path.dirname(mf)); } catch (e) { /* the folder held more */ }
      ok(['en', 'ru', 'uk', 'zh'].every(g => Object.keys(L.en).filter(k => /^missions\.(job\.|stopped|add\.stopped|sp\.stopped|sp\.read\.(stopped|again))/.test(k)).every(k => L[g][k])), 'jobs: the job names and stopped lines in en ru uk zh');
    }

    // -- every spmis code has a plain sentence in 4 languages (the codes listed in spmis.js)
    const codes = [...new Set(fs.readFileSync(path.join(T, 'spmis', 'spmis.js'), 'utf8').match(/SPMIS_[A-Z_]+/g))];
    const noSent = codes.filter(c => !['en', 'ru', 'uk', 'zh'].every(g => L[g]['missions.sp.c.' + c]));
    ok(codes.length >= 30 && !noSent.length, 'every SPMIS code has a sentence in en ru uk zh (' + codes.length + ' codes); missing: ' + noSent.join());
    ok(st.templates.every(t => ['en', 'ru', 'uk', 'zh'].every(g => L[g]['missions.sp.kt.' + t.name] && L[g]['missions.sp.k.' + t.name])) && SP.OBJ_TYPES.every(t => ['en', 'ru', 'uk', 'zh'].every(g => L[g]['missions.sp.gt.' + t] && L[g]['missions.sp.t.' + t])),
      'every template has a title and a one-sentence story, every goal type its words, in 4 languages');
    ok(!Object.keys(L.en).filter(k => /^missions\.sp\./.test(k)).some(k => /\btrigger|\.mi\b/i.test(L.en[k])), 'sp strings: no trigger or .mi words');

    // -- the page: five Nexts, Preview, Write, Undo, check, reopen, rewrite, Undo, remove
    const spApi = c => (u, b) => { const [p, q] = u.split('?'); const k = (b === undefined ? 'GET ' : 'POST ') + p; return R[k](U(q || ''), b, c); };
    const apiS = (u, b) => (u.startsWith('/api/x/missions/sp/') ? spApi(sctx)(u, b) : api(u, b));
    const until = async (f, n = 400) => { for (let i = 0; i < n && !f(); i++) await new Promise(r => setTimeout(r, 5)); return f(); };
    const shaB = b => require('crypto').createHash('sha1').update(b).digest('hex');
    const before = snap(spMod);
    const PS = page('en', apiS, { mod: spMod }, { newModAt: p => PS.box.newMod.push(p), newMod: [] });
    PS.scr.focus();
    const bS = id => all(PS.rootEl, c => c.dataset && c.dataset.blk === id)[0];
    const btnS = k => tag(PS.rootEl, 'BUTTON').find(b => b.textContent === L.en[k]);
    const outS = () => bS('sp.chk.out').textContent;
    const head = k => L.en[k].split(/[“"{]/)[0];
    ok(PS.rootEl.children[1] && PS.rootEl.children[1].dataset.blk === 'sp', 'the single-player card is the first card');
    await until(() => bS('sp.kind.assault'));
    ok(bS('sp.kind.assault') && bS('sp.kind.escort') && bS('sp.kind.escort').textContent.includes(L.en['missions.sp.k.escort']), 'step 1: the kinds as cards with their one-sentence story');
    ok(bS('sp.sum').textContent.includes(L.en['missions.sp.sum.kind'].replace('{k}', L.en['missions.sp.kt.assault'])), 'side panel: the plain summary names the kind');
    ok(!bS('sp.mine').hidden && bS('sp.mine').tagName === 'DETAILS' && bS('sp').textContent.indexOf(L.en['missions.sp.mine.h']) < bS('sp').textContent.indexOf(L.en['missions.sp.s.kind']), 'My generated missions: a folded box at the top of the card');
    await until(() => PS.box.calls.some(c => /sp\/units\?army=ger/.test(c[0])));
    // difficulty per group: picked in step 3, shown in the summary, the same in the written spec and the mission file
    PS.scr.sp._t.setOpen('ed'); PS.scr.sp._t.go(2); await until(() => bS('sp.ed.0'));
    ok(bS('sp.ed').open === true && bS('sp.pu').open === false, 'step 3: one group open at a time');
    const lvSel = tag(bS('sp.ed.0'), 'SELECT').find(s => tag(s, 'OPTION').some(o => o.value === 'heroic'));
    lvSel.value = 'normal'; lvSel.fire('change'); await tick();
    const dName = PS.scr.sp._t.spec().enemy.defenders[0].name;
    ok(PS.scr.sp._t.spec().enemy.defenders[0].difficulty === 'normal' && bS('sp.sum').textContent.includes('(' + L.en['missions.sp.lv.normal'] + ')'), 'difficulty: set per group, shown in the summary ' + bS('sp.sum').textContent);
    PS.scr.sp._t.go(0); await tick();
    for (let i = 0; i < 4; i++) { btnS('missions.sp.next').click(); await tick(); await tick(); }
    btnS('missions.sp.tocheck').click(); await tick();
    ok(PS.scr.sp._t.step() === 5 && btnS('missions.sp.preview') && btnS('missions.sp.write').disabled, 'five Nexts: the check step, Write off before a Preview');
    btnS('missions.sp.preview').click();
    await until(() => outS().includes(head('missions.sp.ready')));
    const pv = PS.box.calls.filter(c => c[0] === '/api/x/missions/sp/preview').pop(), FN = 'assault_on_the_crossroads';
    ok(pv && pv[1].mod === spMod && pv[1].spec.name === FN && outS().includes(head('missions.sp.ready')), 'five Nexts and Preview: the template spec is accepted by spmis ' + outS());
    ok(!fs.existsSync(path.join(spMod, 'resource')) && !btnS('missions.sp.write').disabled, 'Preview wrote nothing, Write on');
    await until(() => bS('sp.sum').hidden === true && PS.scr.sp._t.lines().every(x => outS().includes(x.t))).catch(() => {});   // the card fills in after the ready line
    const sumLines = PS.scr.sp._t.lines().map(x => x.t);
    ok(sumLines.every(t => outS().includes(t)) && outS().includes(L.en['missions.sp.pv.h']) && bS('sp.sum').hidden === true, 'Preview: plain sentences first, the same lines as the summary (the side summary hidden, not said twice)', JSON.stringify([sumLines.filter(t => !outS().includes(t)), bS('sp.sum').hidden]));
    ok(all(bS('sp.chk.out'), c => c.tagName === 'SUMMARY').some(s => s.textContent.startsWith(L.en['missions.sp.files'].split('(')[0])), 'Preview: the exact file change folded under its own summary');
    ok(outS().includes(L.en['missions.sp.tried'].split('(')[0].replace('{exe}', 'AS64')) && outS().includes(L.en['missions.sp.nt.menu']) && !outS().includes(L.en['missions.sp.nt.patrol']), 'Preview: assault was tried in the game; what was not (menu) is said in words, a patrol only when the mission has one');
    const pvRes = await R['POST /api/x/missions/sp/preview'](null, { mod: spMod, spec: pv[1].spec }, sctx);
    PS.box.confirmAnswer = true; btnS('missions.sp.write').click();
    await until(() => outS().includes(L.en['missions.sp.play.h']), 2000);
    const mdir = path.join(spMod, 'resource', 'map', 'single', 'spmis_examples', FN);
    ok(fs.existsSync(path.join(mdir, '0.mi')) && fs.existsSync(path.join(mdir, 'spmis.json')), 'Write: the mission and its spmis.json in the mod');
    ok(pvRes.files.filter(f => !f.record && f.state !== 'kept').every(f => fs.existsSync(path.join(spMod, f.rel)) && shaB(fs.readFileSync(path.join(spMod, f.rel))) === f.sha)
      && pvRes.files.some(f => /campaign\.lng$/.test(f.rel)) && pvRes.files.some(f => /^sound\/.+\/story\.wav$/.test(f.rel) && f.voice), 'preview equals write: every previewed file (campaign.lng and the silent voices too) written with the previewed bytes ' + JSON.stringify(pvRes.files.filter(f => !f.record && f.state !== 'kept' && !(fs.existsSync(path.join(spMod, f.rel)) && shaB(fs.readFileSync(path.join(spMod, f.rel))) === f.sha)).map(f => [f.rel, f.state, f.sha])));
    const wr = PS.box.calls.filter(c => c[0] === '/api/x/missions/sp/write').pop();
    ok(JSON.stringify(wr[1].spec) === JSON.stringify(pv[1].spec), 'Write sends the spec the Preview checked');
    const man0 = SP.readManifest(mdir), mi0 = fs.readFileSync(path.join(mdir, '0.mi'), 'latin1');
    ok(man0.spec.enemy.defenders[0].difficulty === 'normal' && mi0.includes(`"spmis:difficulty/${dName}"`) && mi0.includes('{level easy}'), 'difficulty: the written spec and the mission file match the summary');
    const outT = outS();
    ok(outT.includes(L.en['missions.sp.check.allok']) && !outT.includes(L.en['missions.sp.check.ok']) && !outT.includes(L.en['missions.sp.lint.ok']) && outT.includes(L.en['missions.sp.play.3'].split('“')[0]) && bS('sp.chk.out').querySelector('.wzstat.ok')
      && outT.includes(L.en['missions.sp.seeit.nt'])
      && outT.includes(L.en['missions.sp.seeit'].split('“')[0]), 'after Write: a green box, how to see it, the check in plain words and How to play it ' + outT);
    const attrIn = (e, a, v) => all(e, c => c.getAttribute && c.getAttribute(a) != null && (v == null || c.getAttribute(a) === v));
    ok(bS('sp.editing').hidden && PS.scr.sp._t.editing() === null && PS.scr.sp._t.lock().mission === FN && attrIn(bS('sp.chk.out'), 'data-ingame').length === 1
      && attrIn(bS('sp.chk.out'), 'data-ingame')[0].textContent.includes('Assault on the crossroads') && !attrIn(bS('sp.chk.out'), 'data-tried').length
      && outS().split(L.en['missions.sp.nt.menu']).length <= 2 && !/test runner/i.test(outS()),
      'after the first Write: no "is open again" line, one line on what the player sees in the game, the untried menu path said at most once ' + outS());
    const link = all(bS('sp.chk.out'), c => c.tagName === 'A')[0];
    ok(link && link.getAttribute('href') === '#go=' + encodeURIComponent('ide:resource/map/single/spmis_examples/' + FN + '/0.mi'), 'after Write: a #go= link opens the mission file in the Editor ' + (link && link.getAttribute('href')));
    ok(PS.box.calls.filter(c => c[0] === '/api/x/missions/sp/write').length === 1, 'one Write sent');
    // Undo after a write: the mod byte for byte as before; My generated missions counts again at once; the files said removed
    await until(() => bS('sp.mine').textContent.includes(FN));
    const mineN0 = bS('sp.mine').querySelector('summary').textContent;
    tag(bS('sp.chk.out'), 'BUTTON').find(b => b.textContent === L.en['missions.sp.undo']).click();
    await until(() => outS().includes(head('missions.sp.undone')), 2000);
    ok(snap(spMod) === before && outS().includes(head('missions.sp.undone')), 'Undo after a write: the mod is byte-identical to before ' + outS());
    ok(/\(1\)/.test(mineN0) && !bS('sp.mine').textContent.includes(FN) && bS('sp.mine').querySelector('summary').textContent === L.en['missions.sp.mine.h'],
      'Undo: My generated missions re-counted right away ' + mineN0 + ' -> ' + bS('sp.mine').querySelector('summary').textContent);
    ok(attrIn(bS('sp.chk.out'), 'data-undone', 'removed').length === 1 && / removed/.test(outS()) && !/put back/.test(outS()), 'Undo of a new mission: says the files were removed, not put back ' + outS());
    btnS('missions.sp.preview').click(); await until(() => !btnS('missions.sp.write').disabled);
    btnS('missions.sp.write').click(); await until(() => outS().includes(L.en['missions.sp.play.h']), 2000);
    const s1 = snap(spMod);
    await until(() => bS('sp.mine').textContent.includes(FN));
    ok(bS('sp.mine').textContent.includes(FN), 'My generated missions lists it');
    // reopen: Change this mission (from the list) loads the saved spec; a change, Preview (replace said), Write with replace
    tag(bS('sp.mine'), 'BUTTON').find(b => b.textContent === L.en['missions.sp.change']).click(); await tick(); await tick();
    ok(PS.scr.sp._t.step() === 1 && PS.scr.sp._t.spec().name === FN && !bS('sp.editing').hidden && bS('sp.editing').textContent.includes('Assault on the crossroads'), 'Change this mission: the saved spec, back at the map step, the reopened line stays visible');
    PS.scr.sp._t.go(4); await tick();
    const titleIn = tag(bS('sp.st.title'), 'INPUT')[0]; titleIn.value = 'Crossroads again'; titleIn.fire('input');
    ok(PS.scr.sp._t.spec().name === FN, 'a reopened mission keeps its folder name when the title changes');
    PS.scr.sp._t.go(5); await tick(); btnS('missions.sp.preview').click();
    await until(() => outS().includes(L.en['missions.sp.replace']));
    ok(outS().includes(L.en['missions.sp.replace']), 'Preview of a mission made before: says Write replaces it');
    btnS('missions.sp.write').click();
    await until(() => outS().includes(L.en['missions.sp.play.h']), 2000);
    const man = SP.readManifest(mdir);
    ok(man && man.spec.title === 'Crossroads again' && PS.box.calls.filter(c => c[0] === '/api/x/missions/sp/write').pop()[1].replace === true, 'regenerated with replace: the manifest holds the changed spec');
    // Undo after a rewrite: the first write's bytes come back
    tag(bS('sp.chk.out'), 'BUTTON').find(b => b.textContent === L.en['missions.sp.undo']).click();
    await until(() => outS().includes(head('missions.sp.undone')), 2000);
    ok(snap(spMod) === s1 && SP.readManifest(mdir).spec.title === 'Assault on the crossroads', 'Undo after a rewrite: the mod is byte-identical to after the first write');
    ok(attrIn(bS('sp.chk.out'), 'data-undone').some(e => /back|both/.test(e.getAttribute('data-undone'))) && /put back/.test(outS()), 'Undo of a rewrite: says the files were put back ' + outS());
    // write again, then remove from the list: the Written box gives way to Removed, the mod as it was
    btnS('missions.sp.preview').click(); await until(() => !btnS('missions.sp.write').disabled);
    btnS('missions.sp.write').click(); await until(() => outS().includes(L.en['missions.sp.play.h']), 2000);
    await until(() => bS('sp.mine').textContent.includes('Crossroads again'));
    tag(bS('sp.mine'), 'BUTTON').find(b => b.textContent === L.en['missions.sp.rm']).click();
    await until(() => bS('sp.msg').textContent.includes(head('missions.sp.rm.done')));
    ok(snap(spMod) === before, 'write, undo, write, reopen, rewrite, undo, write, remove: the mod is byte-identical to before');
    ok(!outS().includes(L.en['missions.sp.play.h']) && outS().includes(head('missions.sp.removed')) && /folder/.test(outS()), 'Remove clears the Written box and says Removed with files and folders ' + outS());
    await until(() => bS('sp.mine').textContent.includes(L.en['missions.sp.mine.none']));
    ok(bS('sp.mine').textContent.includes(L.en['missions.sp.mine.none']), 'My generated missions: none left');

    // -- steps: map kit with Browse and history, places as dropdowns, unit kits with in-game names, a refusal marks its field
    PS.scr.sp._t.go(1); await until(() => PS.box.calls.some(c => c[0].startsWith('/api/x/missions/sp/maps')));
    await until(() => all(PS.rootEl, c => c.getAttribute && c.getAttribute('data-sk') === 'missions.sp.map').length);
    await until(() => PS.scr.sp._t.mapHits('').labels.length || PS.scr.sp._t.mapHits('overlord').labels.length);
    const mh = PS.scr.sp._t.mapHits('оверлорд'), mz = PS.scr.sp._t.mapHits('zzqq');
    ok(mh.labels.some(l => /Overlord/.test(l)) && mh.labels.every(l => !/\(/.test(l)) && !mz.labels.length && mz.note === L.en['missions.sp.nohit'].replace('{q}', 'zzqq'), 'map search: Cyrillic finds the Latin name, maps by name only (no folder in the main text), Nothing found said ' + JSON.stringify([mh, mz]));
    const mk = all(PS.rootEl, c => c.getAttribute && c.getAttribute('data-sk') === 'missions.sp.map')[0];
    ok(mk && mk.querySelector('.sk-browse'), 'step 2: the map box is a searchKit with Browse');
    const specs = []; PS.box.searchKit.picker = (spec, done) => specs.push({ spec, done });
    mk.querySelector('.sk-browse').click(); const pk = specs.pop();
    ok(pk && pk.spec.view === 'data' && pk.spec.mode === 'dir' && /^map/.test(pk.spec.start), 'map Browse: the folder picker in the game data at map/ ' + JSON.stringify(pk && pk.spec));
    pk.done('map/single/02_other/02_ridge', { view: 'data', path: 'map/single/02_other/02_ridge' });
    const movedT = L.en['missions.sp.map.placed'].split('{p}')[0];
    await until(() => bS('sp.map.state') && bS('sp.map.state').textContent.includes(movedT));
    const dots = () => all(bS('sp.map.names'), c => c.getAttribute && c.getAttribute('data-place')).map(c => c.getAttribute('data-place'));
    await until(() => dots().includes('ridge_top'));
    ok(PS.scr.sp._t.spec().map === 'map/single/02_other/02_ridge' && /^ridge_/.test(PS.scr.sp._t.spec().player.start) && bS('sp.map.state').textContent.includes(movedT) && dots().includes('ridge_top'),
      'Browse pick: the map is set, the places it lacks moved to its places (said), its places drawn as dots ' + JSON.stringify(PS.scr.sp._t.spec().player.start));
    delete PS.box.searchKit.picker;
    bS('sp.map.view').querySelector('button').click();
    ok(PS.box.shows.pop() === 'mapviz' && PS.box.S.mapKey === 'map/single/02_other/02_ridge' && PS.box.showArg === 'page:mapviz/as64~single/02_other/02_ridge~', 'See it in the Map Viewer: the mapviz deep link on this map ' + PS.box.showArg);
    PS.scr.sp._t.setOpen('pu'); PS.scr.sp._t.go(2); await until(() => bS('sp.pu.0'));
    const ukits = all(PS.rootEl, c => c.getAttribute && c.getAttribute('data-sk') === 'missions.sp.unit');
    const stOpts = tag(tag(bS('sp.start'), 'SELECT')[0], 'OPTION');
    ok(ukits.length >= 3 && stOpts.some(o => o.value === 'ridge_top' && o.textContent === 'Ridge top'), 'step 3: unit boxes are searchKits, the start is a dropdown of the map\'s places by readable label');
    // the sketch: a click on a place field, then a dot, puts that place in
    tag(bS('sp.start'), 'SELECT')[0].fire('focus');
    PS.scr.sp._t.go(1); await tick();
    all(bS('sp.map.names'), c => c.getAttribute && c.getAttribute('data-place') === 'ridge_road')[0].click(); await tick();
    ok(PS.scr.sp._t.spec().player.start === 'ridge_road', 'sketch: a dot fills the place field last used');
    PS.scr.sp._t.go(2); await until(() => bS('sp.pu.0'));
    const uin = tag(bS('sp.pu.0'), 'INPUT')[0];
    ok(uin.value === 'Rifleman' || uin.value === 'Officer' || uin.value === 'mgun', 'unit boxes show the in-game name ' + uin.value);
    const uh = PS.scr.sp._t.unitHits('usa', 'шерман');
    ok(uh.labels.includes('Sherman M4A3E8'), 'unit search: Cyrillic finds the in-game name ' + JSON.stringify(uh));
    const sn = PS.scr.sp._t.unitHits('usa', 'снайпер'), mgR = PS.scr.sp._t.unitHits('usa', 'пулемётчик');
    ok(!sn.labels.length && sn.note === L.en['missions.sp.nohit.en'].replace('{q}', 'снайпер') && PS.scr.sp._t.roleWords('пулемётчик').includes('mgun') && mgR.labels.length >= 1,
      'unit search in Russian: role words find the English names; nothing found says the names are English, for example sniper ' + JSON.stringify([sn, mgR]));
    uin.value = 'sherman m4a3e8'; uin.fire('change');
    const g0 = PS.scr.sp._t.spec().player.units[0];
    ok(g0.def === 'm4a3e8' && g0.crew && g0.crew.def === 'mp/usa/tankman2' && uin.value === 'Sherman M4A3E8', 'typing a vehicle\'s in-game name picks it and gives it a crew ' + JSON.stringify(g0));
    const cnB = tag(bS('sp.pu.0'), 'INPUT').find(i => i.getAttribute('type') === 'number');
    ok(g0.count === 1 && cnB && cnB.value === '1' && !tag(bS('sp.pu.0'), 'SELECT').some(s => tag(s, 'OPTION').length >= 60), 'a vehicle picked in place of soldiers: the count goes to 1, shown in a small number box (no 60-line list) ' + g0.count);
    const gv = { def: 'mp/usa/rifle', count: 6 }; PS.scr.sp._t.setDef(gv, 'm4a3e8'); const c1 = gv.count; gv.count = 3; PS.scr.sp._t.setDef(gv, 'm4a3e8'); const c2 = gv.count; PS.scr.sp._t.setDef(gv, 'mp/usa/rifle');
    ok(c1 === 1 && c2 === 3 && gv.count === 3 && !gv.crew, 'setDef: soldiers to a vehicle resets the count to 1; a vehicle to a vehicle or back to soldiers keeps the typed count ' + JSON.stringify([c1, c2, gv]));
    const tk = PS.scr.sp._t.unitHits('usa', 'tank'), tkR = PS.scr.sp._t.unitHits('usa', 'танк');
    ok(tk.labels.includes('Sherman M4A3E8') && tkR.labels.includes('Sherman M4A3E8'), 'unit search: tank and танк list the tanks, not only their crews ' + JSON.stringify([tk.labels, tkR.labels]));
    ok(PS.scr.sp._t.loose(PS.scr.sp._t.translit('бокаж'), 'bocage') && !PS.scr.sp._t.loose(PS.scr.sp._t.translit('бокаж'), 'bridge'), 'map search by sound: бокаж finds Bocage');
    const uin1 = tag(bS('sp.pu.1'), 'INPUT')[0], def1 = PS.scr.sp._t.spec().player.units[1].def; uin1.value = 'flying saucer'; uin1.fire('change');
    ok(PS.scr.sp._t.spec().player.units[1].def === def1 && bS('sp.pu.1').textContent.includes(L.en['missions.sp.unit.kept'].split('{u}')[1].slice(0, 12)), 'an unknown typed unit: the old one kept, said');
    // army switch: units mapped to the new army, each change said
    PS.scr.sp._t.setOpen('pu'); let parmy = tag(bS('sp.parmy'), 'SELECT')[0]; parmy.value = 'ger'; parmy.fire('change');
    await until(() => bS('sp.armynote'));
    const pun = PS.scr.sp._t.spec().player.units, aw = L.en['missions.sp.arm.became'].replace('{a}', 'Sherman M4A3E8').replace('{b}', 'Panzer IV');
    ok(pun[0].def === 'pz4' && pun.every(u => /^mp\/ger\//.test(u.def) || u.def === 'pz4') && bS('sp.armynote').textContent.includes(aw) && bS('sp.armynote').textContent.split(aw).length === 2,
      'army switch: the Sherman becomes the German medium tank (same class), not the armoured car listed first; said once, with why ' + JSON.stringify(pun.map(u => u.def)) + ' ' + bS('sp.armynote').textContent);
    const sameN = pun.filter(u => /^mp\/ger\//.test(u.def)).map(u => PS.scr.sp._t.unitName(u.def));
    ok(sameN.length && PS.scr.sp._t.notes().every(t => !sameN.some(nm => t === L.en['missions.sp.arm.became'].replace('{a}', nm).replace('{b}', nm))) && !/(\b[A-Z][\w ]+) became \1\b/.test(bS('sp.armynote').textContent),
      'army switch: a soldier whose name stays the same gets no "X became X" line ' + JSON.stringify([sameN, PS.scr.sp._t.notes()]));
    PS.scr.sp._t.go(1); await tick(); PS.scr.sp._t.go(2); await tick();
    ok(!bS('sp.armynote'), 'army switch: the change lines go once you leave the step');
    parmy = tag(bS('sp.parmy'), 'SELECT')[0]; parmy.value = 'usa'; parmy.fire('change'); await until(() => PS.scr.sp._t.spec().player.units.every(u => /^mp\/usa\//.test(u.def) || u.def === 'm4a3e8'));
    const g0b = PS.scr.sp._t.spec().player.units[0];
    // every refusal marks its field and Fix goes to its step
    const refuse = async (mut, field, stepN, id) => {
      const s = PS.scr.sp._t.spec(), keep = JSON.stringify(s); mut(s); PS.scr.sp._t.go(5); await tick(); btnS('missions.sp.preview').click();
      await until(() => tag(bS('sp.chk.out'), 'BUTTON').some(b => b.textContent.startsWith('Fix on step')));
      const fixB = tag(bS('sp.chk.out'), 'BUTTON').find(b => b.textContent.startsWith('Fix on step'));
      ok(fixB && fixB.textContent.startsWith('Fix on step ' + (stepN + 1)), field + ': a refusal offers Fix on its step ' + outS());
      if (fixB) fixB.click(); await tick();
      const e = bS(id);
      ok(PS.scr.sp._t.step() === stepN && e && e.classList.contains('bad'), field + ': Fix goes to the step and marks the field');
      Object.assign(s, JSON.parse(keep));
    };
    await refuse(s => { s.player.units[0].at = 'nowhere'; }, 'unit place', 2, 'sp.pu.0');
    await refuse(s => { s.lose = { allDead: false }; }, 'no way to lose', 3, 'sp.lose');
    await refuse(s => { s.objectives[0].zone = 'nowhere'; }, 'goal place', 3, 'sp.ob.0');
    await refuse(s => { s.name = 'bad name'; }, 'folder name', 4, 'sp.st.name');
    ok(bS('sp.st.more').open === true, 'a refused field under More options is opened');
    // a destroy goal with no enemy group: said, with the way to add one
    const s9 = PS.scr.sp._t.spec(), keep9 = JSON.stringify(s9); s9.enemy.defenders = []; s9.enemy.patrols = []; s9.enemy.waves = []; s9.objectives = [{ id: 'kill', type: 'destroy' }];
    PS.scr.sp._t.go(3); await tick();
    ok(bS('sp.ob.0').textContent.includes(L.en['missions.sp.goal.noenemy']) && tag(bS('sp.ob.0'), 'BUTTON').some(b => b.textContent === L.en['missions.sp.goal.toenemy']), 'a destroy goal with no enemies: Add an enemy group first, with a button');
    Object.assign(s9, JSON.parse(keep9));
    // a mod with no mod.info: said, with the new-mod route
    PS.box.S.mod = bare; PS.scr.refresh(); PS.scr.sp._t.go(5); await tick();
    btnS('missions.sp.preview').click();
    await until(() => outS().includes(L.en['missions.sp.nomodinfo'].slice(0, 30)));
    ok(outS().includes(L.en['missions.sp.nomodinfo'].slice(0, 30)), 'no mod.info: said in plain words ' + outS());
    btnS('missions.sp.newmod').click(); ok(PS.box.newMod.length === 1 && PS.box.newMod[0] === '', 'Make a new mod: the new-mod route');
    // no mod at all: the mod picker in the card, the game's mods listed
    PS.box.S.mod = ''; PS.scr.refresh(); PS.scr.sp._t.go(5); await until(() => tag(bS('sp.chk.mod'), 'OPTION').some(o => o.value === spMod));
    ok(bS('sp.chk.mod').textContent.includes(L.en['missions.sp.nomod']) && btnS('missions.sp.mod.use') && btnS('missions.sp.newmod'), 'no mod: picked in the card, or Make a new mod');
    const msel = tag(bS('sp.chk.mod'), 'SELECT')[0]; msel.value = spMod; btnS('missions.sp.mod.use').click(); await tick();
    ok(PS.box.S.mod === spMod && !btnS('missions.sp.preview').disabled, 'Use this mod: the mod is set, Preview on');
    const prS = checkScreen(PS.rootEl);
    ok(!prS.length, 'page blocks with the single-player card:\n  ' + prS.slice(0, 20).join('\n  '));
    // every step's blocks, with a patrol, a wave, help and each goal type drawn
    const sp0 = PS.scr.sp._t.spec(); sp0.enemy.waves = [{ name: 'w1', def: 'mp/ger/rifle', count: 3, from: 'ridge_top', to: 'start', time: 200 }];
    sp0.enemy.patrols = [{ name: 'p1', def: 'mp/ger/smg', count: 2, route: ['ridge_top', 'ridge_road'] }];
    sp0.objectives = SP.OBJ_TYPES.map((t, i) => ({ id: 'g' + i, type: t, zone: 'ridge_top', to: 'ridge_top', unit: sp0.player.units[1].name, target: [sp0.enemy.defenders.concat(sp0.enemy.patrols)[0].name], minutes: 3 }));
    sp0.objectives[2].after = 'g1';
    for (let i = 0; i < 6; i++) {
      PS.scr.sp._t.go(i); await tick(); await tick();
      const pr = checkScreen(PS.rootEl);
      ok(!pr.length, 'step ' + (i + 1) + ' blocks:\n  ' + pr.slice(0, 10).join('\n  '));
      if (i === 2) for (const g of ['ed', 'ep', 'ew']) { PS.scr.sp._t.setOpen(g); PS.scr.sp._t.go(2); await tick(); const pg = checkScreen(PS.rootEl); ok(!pg.length, 'step 3 with ' + g + ' open, blocks:\n  ' + pg.slice(0, 10).join('\n  ')); }
    }
    PS.scr.sp._t.go(3); await tick();
    ok(tag(bS('sp.ob.5'), 'SELECT').length === 5 && tag(bS('sp.ob.2'), 'SELECT').length === 5 && tag(bS('sp.ob.4'), 'SELECT').length === 4, 'goals: escort has who and where, hold where and minutes, survive minutes only (each with starts and must-win)');
    ok(['sp.ob.0', 'sp.ob.1', 'sp.ob.2', 'sp.ob.3', 'sp.ob.4', 'sp.ob.5', 'sp.lose.all', 'sp.lose.unit', 'sp.lose.time', 'sp.rf.0'].every(id => bS(id)), 'step 4: six goal rows, the three ways to lose, help that arrives later');
    ok(bS('sp.ob.2.t').textContent.includes(L.en['missions.sp.goal.timer'].replace('{n}', '2')) && PS.scr.sp._t.lines().some(x => x.t.startsWith('3. ') && x.t.includes(L.en['missions.sp.sum.after'].replace('{n}', '2')) && x.t.includes(L.en['missions.sp.sum.timer'])),
      'goal order: the hold goal after goal 2, numbered in the summary, its timer starts when it shows');
    ok(PS.scr.sp._t.spec().objectives[2].text === 'Hold Ridge top for 3 minutes' && PS.scr.sp._t.lines().some(x => x.t === 'comes from Ridge top toward at the start at 3:20' || /at 3:20/.test(x.t)), 'texts follow the fields (goal text from place and minutes), times exact (3:20) ' + PS.scr.sp._t.spec().objectives[2].text);
    // a typed goal text is kept and flagged once its fields change
    const gt = tag(bS('sp.ob.2.t'), 'INPUT')[0]; gt.value = 'Keep the hill'; gt.fire('input');
    PS.scr.sp._t.spec().objectives[2].minutes = 4; PS.scr.sp._t.go(3); await tick();
    ok(PS.scr.sp._t.spec().objectives[2].text === 'Keep the hill' && bS('sp.ob.2.t').textContent.includes(L.en['missions.sp.own.warn'].slice(0, 30)), 'a typed text is kept, and flagged when its fields change');
    tag(bS('sp.ob.2.t'), 'BUTTON').find(b => b.textContent === L.en['missions.sp.own.use']).click(); await tick();
    ok(PS.scr.sp._t.spec().objectives[2].text === 'Hold Ridge top for 4 minutes', 'Use the made text: the text follows the fields again');
    // the old kit list: the map filter is still there
    ok(all(PS.rootEl, c => c.getAttribute && c.getAttribute('data-sk') === 'missions.filter').length === 1, 'the old map filter kit is still there');

    // -- JOBS, the page: a stopped Preview, Write, read, Add mode and comparison is a plain stopped line (never the red failure)
    {
      const stopE = () => Object.assign(new Error('Stopped'), { cancelled: true, key: 'job.cancelled', status: 499, text: 'Stopped' });
      let stopOn = '';
      const apiJ = (u, b) => (stopOn && u.split('?')[0].endsWith(stopOn) ? Promise.reject(stopE()) : apiS(u, b));
      const PJ = page('en', apiJ, { mod: spMod }); PJ.scr.focus();
      const bJ = id => all(PJ.rootEl, c => c.dataset && c.dataset.blk === id)[0], btnJ = k => tag(PJ.rootEl, 'BUTTON').find(b => b.textContent === L.en[k]);
      const outJ = () => bJ('sp.chk.out'), errsJ = () => all(outJ(), c => /(^| )err( |$)/.test(c.className || '')).length;
      await until(() => bJ('sp.kind.assault'));
      await until(() => PJ.box.calls.some(c => /sp\/units\?army=ger/.test(c[0])));
      PJ.scr.sp._t.go(5); await tick();
      stopOn = '/sp/preview'; btnJ('missions.sp.preview').click();
      await until(() => attrIn(outJ(), 'data-stopped', 'pv').length === 1);
      ok(attrIn(outJ(), 'data-stopped', 'pv').length === 1 && outJ().textContent.includes(L.en['missions.sp.stopped.pv'].split('{pv}')[0]) && !errsJ() && !outJ().textContent.includes(L.en['missions.sp.err.again'])
        && !btnJ('missions.sp.preview').disabled && btnJ('missions.sp.write').disabled, 'page: a stopped Preview is one plain line, no red error, Preview usable again ' + outJ().textContent);
      stopOn = ''; btnJ('missions.sp.preview').click();
      await until(() => !btnJ('missions.sp.write').disabled, 2000);
      ok(!btnJ('missions.sp.write').disabled && !attrIn(outJ(), 'data-stopped').length, 'page: Preview after a stop works, the stopped line is gone ' + outJ().textContent.slice(0, 200));
      const treeJ = JSON.stringify(snap(spMod));
      stopOn = '/sp/write'; PJ.box.confirmAnswer = true; btnJ('missions.sp.write').click();
      await until(() => attrIn(outJ(), 'data-stopped', 'wr').length === 1);
      ok(attrIn(outJ(), 'data-stopped', 'wr').length === 1 && outJ().textContent.includes(L.en['missions.sp.stopped.wr']) && !errsJ() && !outJ().textContent.includes(L.en['missions.sp.play.h'])
        && !btnJ('missions.sp.write').disabled && !btnJ('missions.sp.preview').disabled && JSON.stringify(snap(spMod)) === treeJ, 'page: a stopped Write is one plain line, not shown as written, Preview and Write usable again ' + outJ().textContent.slice(0, 200));
      const wj = PJ.box.calls.filter(c => c[0] === '/api/x/missions/sp/write').pop(), pj = PJ.box.calls.filter(c => c[0] === '/api/x/missions/sp/preview').pop();
      ok(wj && wj[2] && /^Single-player mission: writing /.test(wj[2].what) && pj[2] && /^Single-player mission: preview of /.test(pj[2].what)
        && PJ.box.calls.filter(c => /\/sp\/(start|maps|places|units|mine|mods)/.test(c[0])).every(c => c[2] && /^Single-player mission: reading /.test(c[2].what)), 'page: every call of the card carries its job name ' + JSON.stringify(wj && wj[2]));
      // a read stopped from the job list: a plain line with Read again
      const PK2 = page('en', (u, b) => (/\/sp\/maps/.test(u) && stopOn === 'maps' ? Promise.reject(stopE()) : apiS(u, b)), { mod: spMod }); stopOn = 'maps'; PK2.scr.focus();
      const rfK = () => all(PK2.rootEl, c => c.dataset && c.dataset.blk === 'sp.readfail')[0];
      await until(() => all(PK2.rootEl, c => c.dataset && c.dataset.blk === 'sp.kind.assault')[0]);
      PK2.scr.sp._t.go(1); await until(() => rfK()); await new Promise(r => setTimeout(r, 30));   // the second ask of the maps (go) has answered too
      ok(rfK() && attrIn(rfK(), 'data-readstop').length === 1 && !attrIn(rfK(), 'data-readfail').length && rfK().textContent.includes(L.en['missions.sp.read.w.maps'])
        && tag(rfK(), 'BUTTON').some(b => b.textContent === L.en['missions.sp.read.again']) && !tag(rfK(), 'BUTTON').some(b => b.textContent === L.en['missions.sp.retry']), 'page: a stopped read is a plain line with Read again, not the red failure ' + (rfK() && rfK().textContent));
      stopOn = ''; tag(rfK(), 'BUTTON').find(b => b.textContent === L.en['missions.sp.read.again']).click();
      await until(() => !rfK());
      ok(!rfK(), 'page: Read again after a stopped read reads it ' + (rfK() && rfK().textContent) + JSON.stringify(PK2.box.calls.slice(-4).map(c => c[0])));
    }

    // -- Cyrillic title: the folder name in Latin letters; Russian page words
    ok(PS.scr.sp._t.slug('Штурм высоты 112') === 'shturm_vysoty_112' && PS.scr.sp._t.slug('Їжак і ґанок') === 'yizhak_i_ganok', 'transliteration: Cyrillic titles give Latin folder names');
    const PR = page('ru', apiS, { mod: spMod }); PR.scr.focus();
    const bR = id => all(PR.rootEl, c => c.dataset && c.dataset.blk === id)[0];
    await until(() => bR('sp.kind.assault'));
    ok(PR.scr.sp._t.spec().title === L.ru['missions.sp.tpl.assault.title'] && PR.scr.sp._t.spec().objectives[0].text === L.ru['missions.sp.tg.assault.take_crossroads'] && bR('sp.steps').textContent.includes('Тип миссии'), 'ru page: texts made in Russian, step "Тип миссии"');
    PR.scr.sp._t.go(4); await tick();
    const tR = tag(bR('sp.st.title'), 'INPUT')[0]; tR.value = 'Штурм высоты'; tR.fire('input');
    ok(PR.scr.sp._t.spec().name === 'shturm_vysoty' && PR.scr.sp._t.spec().title === 'Штурм высоты', 'a Cyrillic title on a new mission: folder name shturm_vysoty ' + PR.scr.sp._t.spec().name);
    const prR = checkScreen(PR.rootEl); ok(!prR.length, 'ru page blocks:\n  ' + prR.slice(0, 10).join('\n  '));

    // -- GoH: read and Preview on a made-up GoH folder (loose files, no paks: a multi map with map points and zones, a single map, breeds
    // per period, unit cards "vehicle" and "vehicle2", .pot names); Write (the GoH form, spgoh.js), Undo and Remove; the card shows the form and the GoH line
    const SPH = path.join(work, 'spgoh'), wh = (rel, text) => { const f = path.join(SPH, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
    const box4 = '{map\r\n\t{Clips\r\n\t\t{"[auto]"\r\n\t\t\t{world -5000 -5000 5000 5000}\r\n\t\t\t{pather -4800 -4800 4800 4800}\r\n\t\t}\r\n\t}\r\n}\r\n';
    const gz = { f1: [0, 0], f2: [-1500, 0], f3: [1500, 0] };
    wh('resource/map/multi/1v1_crossing/map', box4);
    wh('resource/map/multi/1v1_crossing/battle_zones.mi', ['{mission', ...pt('0xc000', 'a1', 'a', -3000, -3000, 1), ...pt('0xc001', 'b1', 'b', 3000, 3000, 2), '\t{Helpers',
      ...Object.entries(gz).flatMap(([n, p]) => ['\t\t{zone "circle"', `\t\t\t{position ${p[0]} ${p[1]} 0}`, `\t\t\t{Name "${n}"}`, '\t\t\t{Radius 300}', '\t\t}']), '\t}', '}'].join('\r\n') + '\r\n');
    wh('resource/map/single/c1/m1/map', box4); wh('resource/map/single/c1/m1/0.mi', '{mission\r\n}\r\n');
    for (const b of ['usa/late/officer', 'usa/late/rifle', 'usa/late/mg_crew', 'usa/late/antitank_m1a1', 'usa/late/tankman', 'usa/mid/rifle', 'ger/late/rifleman_1', 'ger/late/mgun_1', 'ger/late/smg_1', 'ger/late/officer', 'ger/late/artilleryman', 'fin/late/rifle'])
      wh('resource/set/breed/mp/' + b + '.set', '{breed\r\n}\r\n');
    wh('resource/entity/-vehicle/tank_medium/m4a1/m4a1.def', '{game_entity}\r\n'); wh('resource/entity/-vehicle/cannon/pak40/pak40.def', '{game_entity}\r\n');
    wh('resource/set/multiplayer/units/late/units_usa.set', '{"m4a1"\r\n\t("vehicle2" period(late) cd(600) t(medium) side(usa) crew1(tankman:4) crew2(tank_com:1) cost(500))\r\n}\r\n');
    wh('resource/set/multiplayer/units/late/units_ger.set', '{"pak40" ("vehicle" period(late) t(cannon mediumcan) side(ger) crew(artilleryman:4) cost(300)) }\r\n{"no_def" ("vehicle" period(late) t(medium) side(ger) cost(1)) }\r\n');
    wh('resource/interface/text/desc_vehicles.pot', 'msgctxt "desc/entity/m4a1"\r\nmsgid "Sherman M4A1"\r\nmsgstr ""\r\n\r\nmsgctxt "desc/human/mp/usa/late/rifle"\r\nmsgid "Rifleman"\r\nmsgstr ""\r\n');
    wh('resource/interface/text/mission.pot', 'msgctxt "mission/multi/1v1_crossing/name"\r\nmsgid "Crossing"\r\nmsgstr ""\r\n');
    wh('resource/set/environment/multi/multi_01.set', '{environment\r\n}\r\n'); wh('resource/entity/service/pointer/pointer.def', '{game_entity}\r\n');   // the light set and the GoH goal marker the writer needs
    // the GoH light sets (the default and a winter one), the usa campaign theme, the usa menu picture and army name text
    wh('resource/set/environment/goh/multi/west/summer/day_1.set', '{environment\r\n}\r\n'); wh('resource/set/environment/goh/multi/west/winter/day_1.set', '{environment\r\n}\r\n');
    wh('resource/music/usa_orchestra.ogg', 'OggS'); wh('resource/interface/skin/game/button/faction/usa.png', 'png'); wh('resource/interface/text/mp_army.pot', 'msgctxt "mp/army/usa"\r\nmsgid "USA"\r\nmsgstr ""\r\n');
    const gohSp = path.join(SPH, 'mods', 'goh_sp'); fs.mkdirSync(gohSp, { recursive: true });
    fs.writeFileSync(path.join(gohSp, 'mod.info'), '{mod\r\n\t{name "goh_sp"}\r\n}\r\n');
    const gohCtx = Object.assign({}, sctx, { gameId: () => 'goh', curDir: () => SPH, gohDir: () => SPH });
    const gst = await R['GET /api/x/missions/sp/start'](Q(''), null, gohCtx);
    const gt0 = gst.templates && gst.templates[0];
    ok(gst.goh === true && gst.write === true && gst.tested === false && gst.armies.join() === 'ger,rus,usa,eng,fin' && gst.templates.length === st.templates.length && gst.templates.every(t => t.spec.map === 'map/multi/1v1_crossing'),
      'GoH start: the kinds on a GoH map, the GoH armies, Write on (not tried in game) ' + JSON.stringify([gst.goh, gst.write, gst.armies]));
    const gu0 = gt0.spec.player.units, gtank = gu0.find(x => x.crew);
    ok(gu0.some(x => x.def === 'mp/usa/late/officer') && gu0.some(x => x.def === 'mp/usa/late/rifle') && gtank && gtank.def === 'm4a1' && gtank.crew.def === 'mp/usa/late/tankman' && gtank.crew.count === 4
      && gt0.spec.enemy.defenders.every(x => /^mp\/ger\/late\//.test(x.def)), 'GoH start: each group gets a GoH unit of its role, the tank its own crew (crew1) ' + JSON.stringify(gt0.spec.player.units));
    const gmp = await R['GET /api/x/missions/sp/maps'](Q('mod=' + encodeURIComponent(gohSp)), null, gohCtx);
    ok(gmp.game === 'goh' && gmp.maps.some(m => m.key === 'map/multi/1v1_crossing' && m.name === 'Crossing') && gmp.maps.some(m => m.key === 'map/single/c1/m1'), 'GoH maps: multi and single maps, names from mission.pot ' + JSON.stringify(gmp.maps));
    ok(['multi/multi_01', 'goh/multi/west/summer/day_1'].every(e => (gmp.envs || []).includes(e)) && (gmp.music || []).join() === 'usa_orchestra' && (gmp.armies || []).includes('eng'), 'GoH maps: the light sets, the music and the armies of game + mod ' + JSON.stringify([gmp.envs, gmp.music, gmp.armies]));
    const gpl = await R['GET /api/x/missions/sp/places'](Q('map=map/multi/1v1_crossing'), null, gohCtx);
    const pf1 = gpl.places.find(p => p.name === 'f1'), pa1 = gpl.places.find(p => p.name === 'a1');
    ok(pf1 && pf1.kind === 'zone' && pf1.lab.k === 'flag' && pa1 && pa1.kind === 'point' && gpl.bounds, 'GoH places: zones f1..f3 as flags, the map points ' + JSON.stringify(gpl.places));
    const guu = await R['GET /api/x/missions/sp/units'](Q('army=usa'), null, gohCtx), gug = await R['GET /api/x/missions/sp/units'](Q('army=ger'), null, gohCtx);
    const grif = guu.soldiers.find(s => s.def === 'mp/usa/late/rifle'), gsh = guu.vehicles.find(v => v.def === 'm4a1'), gpak = gug.vehicles.find(v => v.def === 'pak40');
    ok(grif && grif.name === 'Rifleman (late)' && gsh && gsh.name === 'Sherman M4A1' && gsh.kind === 'vehicle' && gpak && gpak.kind === 'gun' && gpak.crew.def === 'mp/ger/late/artilleryman' && !gug.vehicles.some(v => v.def === 'no_def'),
      'GoH units: names from .pot with the period, a card with no entity left out, a gun with its crew ' + JSON.stringify([grif, gsh, gpak]));
    ok((await R['GET /api/x/missions/sp/units'](Q('army=fin'), null, gohCtx)).soldiers.length === 1, 'GoH units: Finland is an army');
    await fails(() => R['GET /api/x/missions/sp/units'](Q('army=jap'), null, gohCtx), 'GoH units: an army GoH has no unit set for refused');
    // the template's places set on the map (the page does this with fixPlaces)
    const onMap = s => { const nm = ['a1', 'f1', 'f2', 'f3', 'b1'], m = {}; let i = 0; const p = x => (typeof x !== 'string' || x === 'start' || x === 'auto' ? x : (m[x] = m[x] || nm[i++ % nm.length]));
      (function wk(o) { if (Array.isArray(o)) { o.forEach(wk); return; } if (!o || typeof o !== 'object') return; for (const k of Object.keys(o)) { if (['at', 'start', 'zone', 'to', 'from'].includes(k)) o[k] = p(o[k]); else if (k === 'route' && Array.isArray(o[k])) o[k] = o[k].map(p); else wk(o[k]); } })(s); return s; };
    const gsnap = snap(gohSp), gspec = onMap(JSON.parse(JSON.stringify(gt0.spec)));
    const gpv = await R['POST /api/x/missions/sp/preview'](null, { mod: gohSp, spec: gspec }, gohCtx);
    const GD = `resource/map/single/${gpv.campaign}/${gpv.mission}`, GT = `localizations/default/interface/text/mission/single/${gpv.campaign}`;
    const gwant = [`${GD}/map`, `${GD}/header_interface.png`, `${GD}/0.mi`, `${GD}/interface.set`, `resource/map/single/${gpv.campaign}/interface.set`, `${GT}/campaign.pot`, `${GT}/${gpv.mission}.pot`, `${GD}/spmis.json`];
    ok(gpv.ok && gpv.goh === true && gpv.write === true && gpv.tested === false && gwant.every(r => gpv.files.some(f => f.rel === r && f.state === 'new')) && !gpv.files.some(f => /^(sound|localization)\//.test(f.rel))
      && gpv.plan.groups === gspec.player.units.length + gspec.enemy.defenders.length + (gspec.enemy.waves || []).length + (gspec.reinforcements || []).length
      && /not tested in game \[T\]/.test(gpv.text) && /\r\n/.test(gpv.text) && /group tank1 .*def m4a1 .*crew mp\/usa\/late\/tankman x4/.test(gpv.text) && snap(gohSp) === gsnap,
      'GoH preview: the plan as data and CRLF text, [T] said, the files the GoH writer puts down, nothing written ' + JSON.stringify(gpv.refusal || gpv.files) + '\n' + gpv.text);
    const gpvC = (gpv.notes || []).map(n => n.code), gpvE = (gpv.notes || []).find(n => n.code === 'SPGOH_ENV_MAPPED');
    ok(gpvC.includes('SPGOH_BANNER_PLAIN') && gpvE && gpvE.p.to === 'goh/multi/west/summer/day_1' && !gpvC.some(c => /^SPGOH_(SIDE_ART|SIDE_TEXT|MUSIC_NONE)$/.test(c)) && /^environment goh\/multi\/west\/summer\/day_1\r\nmusic usa_orchestra\r$/m.test(gpv.text),
      'GoH preview: no light set on the base map gives the GoH default (said), the usa theme, a plain banner said ' + JSON.stringify(gpv.notes));
    const gbad = JSON.parse(JSON.stringify(gspec)); gbad.player.units[1].at = 'nowhere';
    const gr1 = await R['POST /api/x/missions/sp/preview'](null, { mod: gohSp, spec: gbad }, gohCtx);
    ok(!gr1.ok && gr1.goh && gr1.refusal.code === 'SPMIS_POINT' && gr1.refusal.field === 'pu.1', 'GoH preview: a place not on the map is refused with the field ' + JSON.stringify(gr1.refusal));
    await fails(() => R['POST /api/x/missions/sp/preview'](null, { mod: SPH, spec: gspec }, gohCtx), 'GoH preview: the GoH folder as mod refused');
    // GoH: any army word plays (eng has no stock campaign side: its missing menu picture, name text and theme are said), a word that is no
    // army word refused; a light set the game has not is mapped and said; music the game has not refused; the user's banner read as a PNG
    const gx = o => Object.assign(JSON.parse(JSON.stringify(gspec)), o), gpost = s => R['POST /api/x/missions/sp/preview'](null, { mod: gohSp, spec: s }, gohCtx);
    const gEng = gx({}); gEng.player.army = 'eng';
    const gre = await gpost(gEng), greC = (gre.notes || []).map(n => n.code);
    ok(gre.ok && ['SPGOH_SIDE_ART', 'SPGOH_SIDE_TEXT', 'SPGOH_MUSIC_NONE'].every(c => greC.includes(c)) && gre.notes.find(n => n.code === 'SPGOH_SIDE_ART').p.army === 'eng' && !/\r\nmusic /.test(gre.text) && snap(gohSp) === gsnap,
      'GoH preview: player army eng plans; its missing menu picture, name text and music said ' + JSON.stringify(gre.refusal || gre.notes));
    const gBad = gx({}); gBad.player.army = 'Bad Army';
    const grb = await gpost(gBad);
    ok(!grb.ok && /^(SPGOH_SIDE|SPMIS_SPEC)$/.test(grb.refusal.code) && grb.refusal.field === 'parmy' && snap(gohSp) === gsnap, 'GoH preview: an army that is no army word refused ' + JSON.stringify(grb.refusal));
    const grv = await gpost(gx({ environment: 'multi/multi_05_winter' })), gnm = (grv.notes || []).find(n => n.code === 'SPGOH_ENV_MAPPED');
    ok(grv.ok && gnm && gnm.p.from === 'multi/multi_05_winter' && gnm.p.to === 'goh/multi/west/winter/day_1' && /^environment goh\/multi\/west\/winter\/day_1\r$/m.test(grv.text) && snap(gohSp) === gsnap,
      'GoH preview: an AS2 winter light set mapped to the GoH winter one, said ' + JSON.stringify(grv.refusal || grv.notes));
    const grv2 = await gpost(gx({ environment: 'multi/multi_01' }));
    ok(grv2.ok && !grv2.notes.some(n => n.code === 'SPGOH_ENV_MAPPED') && /^environment multi\/multi_01\r$/m.test(grv2.text), 'GoH preview: a light set the game has is taken as is ' + JSON.stringify(grv2.refusal || grv2.notes));
    const gmu = await gpost(gx({ music: 'nope' }));
    ok(!gmu.ok && gmu.refusal.code === 'SPGOH_MUSIC' && gmu.refusal.field === 'map', 'GoH preview: music the game has not refused ' + JSON.stringify(gmu.refusal));
    const bpng = path.join(work, 'spgoh-banner.png'); fs.writeFileSync(bpng, require('./spgoh').plainBanner([1, 2, 3, 255], 64, 32));
    const gbn = await gpost(gx({ banner: bpng })), gbz = (gbn.notes || []).find(n => n.code === 'SPGOH_BANNER_SIZE');
    ok(gbn.ok && gbz && gbz.p.w === 64 && gbz.p.h === 32 && !gbn.notes.some(n => n.code === 'SPGOH_BANNER_PLAIN') && gbn.files.some(f => f.rel === `${GD}/header_interface.png` && f.bytes === fs.statSync(bpng).size),
      'GoH preview: the user banner taken as is, its size said ' + JSON.stringify(gbn.refusal || gbn.notes));
    const gbr = await gpost(gx({ banner: 'banner.png' }));
    ok(!gbr.ok && gbr.refusal.code === 'SPGOH_BANNER' && gbr.refusal.field === 'map', 'GoH preview: a banner that is no full .png path refused ' + JSON.stringify(gbr.refusal));
    // GoH: a vehicle group as the lose-if-destroyed unit and as the escort plans (the stock "not operatable" / "operatable" tests); the shared planner still refuses it without the GoH flag
    const gvn = gspec.player.units.find(u => u.crew), gVeh = gx({ lose: { allDead: true, unit: gvn.name } });
    gVeh.objectives = gVeh.objectives.concat([{ id: 'veh_esc', type: 'escort', unit: gvn.name, to: 'f2', primary: false }]);
    const gvp = await gpost(gVeh), SPL = require('../../../spmis/spmis'), gvV = SPL.openGame({ game: SPH, exe: 'goh' }, gohSp);
    let gvMi = '', gvNo = null; try { gvMi = SPL.missionText(SPL.plan(JSON.parse(JSON.stringify(gVeh)), gvV, { vehOut: true })); SPL.plan(JSON.parse(JSON.stringify(gVeh)), gvV); } catch (e) { gvNo = e; }
    ok(gvp.ok && snap(gohSp) === gsnap && /{state "not operatable"}/.test(gvMi) && /{state "operatable"}/.test(gvMi) && gvNo && gvNo.code === 'SPMIS_UNCONFIRMED',
      'GoH preview: a vehicle group as lose unit and escort plans with the stock vehicle tests; refused without the GoH flag ' + JSON.stringify([gvp.refusal, gvNo && (gvNo.code || gvNo.message)]));
    const GCODES = ['SPGOH_SIDE', 'SPGOH_ENV', 'SPGOH_READBACK', 'SPGOH_SIDE_ART', 'SPGOH_SIDE_TEXT', 'SPGOH_ENV_MAPPED', 'SPGOH_MUSIC', 'SPGOH_MUSIC_NONE', 'SPGOH_BANNER', 'SPGOH_BANNER_SIZE', 'SPGOH_BANNER_PLAIN', 'SPGOH_CAMP_SIDE'];
    ok(GCODES.every(c => ['en', 'ru', 'uk', 'zh'].every(g => L[g]['missions.sp.c.' + c])), 'GoH refusal and note codes said in 4 languages');
    // GoH Write: the stock GoH forms, byte for byte where stock is one form; restore points first; read back clean
    const GOHW = require('./spgoh'), MWR = require('../../../lib/modwrite'), gf = rel => fs.readFileSync(path.join(gohSp, ...rel.split('/')));
    const gw = await R['POST /api/x/missions/sp/write'](null, { mod: gohSp, spec: gspec }, gohCtx);
    ok(gw.ok && gw.goh && gw.tested === false && gw.undo && gw.check.count === 0 && gw.lint && !gw.lint.goh && Array.isArray(gw.lint.findings) && gw.points === gwant.length && gwant.every(r => fs.existsSync(path.join(gohSp, ...r.split('/')))),
      'GoH write: the files written, read back with no finding, a restore point per file, milint run ' + JSON.stringify([gw.refusal, gw.check, gw.points, gw.lint]));
    const gbs = require('./spgoh').pngSize(fs.readFileSync(path.join(gohSp, ...`${GD}/header_interface.png`.split('/'))));
    ok(gbs && gbs.w === 1024 && gbs.h === 600 && gw.notes.some(n => n.code === 'SPGOH_BANNER_PLAIN'), 'GoH write: a plain 1024x600 PNG banner, said ' + JSON.stringify([gbs, gw.notes]));
    const gmi = gf(`${GD}/0.mi`).toString('utf8'), gnp = gspec.player.units.reduce((n, u) => n + (u.count || 1) * (1 + (u.crew ? u.crew.count || 0 : 0)), 0);
    ok(!/[^\r]\n/.test(gmi) && gmi.endsWith('\t{Players\r\n\t\t{user 0}\r\n\t\t{alias 0 "player"}\r\n\t\t{alias 1 "playerAlly"}\r\n\t\t{alias 2 "enemyAI"}\r\n\t\t{alias 3 "neutral"}\r\n\t\t{diplomacy\r\n\t\t\t1 2 1 0 1 1 1 1\r\n\t\t\t2 1 1 0 1 1 1 1\r\n\t\t\t1 1 1 0 1 1 1 1\r\n\t\t\t0 0 0 1 1 1 1 1\r\n'
      + '\t\t\t1 1 1 1 1 1 1 1\r\n'.repeat(4) + '\t\t}\r\n\t}\r\n\t{Fog 0}\r\n\t{EntityManager {Enabled}\r\n\t}\r\n}\r\n') && !/\{Fog 1\}|skirmish_pointer|"allied"/.test(gmi)
      && (gmi.match(/^\t\t\{Player 1\}\r$/gm) || []).length >= gnp && /\{Player 2\}/.test(gmi) && !/^\t\t\{Player 0\}/m.test(gmi)
      && /\t\t\t\{control user\}\r\n\t\t\t\{move_mode hold\}\r\n\t\t\t\{advance_ratio 0\.5\}\r\n\t\t\t\{retreat_ratio 4\}\r\n\t\t\}/.test(gmi)
      && /(\t+)\{control user\}\r\n\1\{fire_mode open\}\r\n\1\{move_mode hold\}\r\n\1\{weapon_prepare on\}\r\n\1\{ai_move\r\n\1\t\{mode enable\}\r\n\1\}\r\n\1\{movement\r\n\1\t\{speed normal\}\r\n\1\}/.test(gmi)
      && (!gspec.objectives.some(o => o.type === 'capture') || (/\{player "2"\}/.test(gmi) && !/\{player "1"\}/.test(gmi))) && /\{Entity "pointer" 0x/.test(gmi) && !require('../../../spmis/spmis').unconfirmed(gmi, GOHW.MODEL).length,
      'GoH write: 0.mi in CRLF, the stock Players block (playerAlly the player, enemyAI the enemy), Fog 0, Brain and actor_state stock forms, goal markers "pointer", every form in the GoH model');
    ok(gf(`${GD}/interface.set`).toString('latin1') === '{location\r\n\t{level 0}\r\n\t{level_set 1}\r\n}' && gf(`resource/map/single/${gpv.campaign}/interface.set`).toString('latin1') === `{location\r\n\t{side ${gspec.player.army}}\r\n\t{enableProgression 0}\r\n\t{background\r\n\t\t{media ""\r\n\t\t\t{file "/music/usa_orchestra" loop}\r\n\t\t}\r\n\t}\r\n}`,
      'GoH write: mission and campaign interface.set in the stock form, the side theme as campaign music (no CRLF at the end)');
    const gpot = gf(`${GT}/${gpv.mission}.pot`).toString('utf8'), gcpot = gf(`${GT}/campaign.pot`).toString('utf8');
    ok(!/\r/.test(gpot) && gpot.startsWith('#, fuzzy\nmsgid ""\nmsgstr ""\n"Project-Id-Version: ARSENAL (' + gpv.mission + ')\\n"\n"POT-Creation-Date: \\n"\n') && gpot.includes('"Plural-Forms: nplurals=INTEGER; plural=EXPRESSION;\\n"\n\nmsgctxt')
      && gpot.includes(`msgctxt "mission/single/${gpv.campaign}/${gpv.mission}/name"\nmsgid "${gspec.title}"\nmsgstr ""\n`) && ['name_big', 'date', 'place', 'story', 'start', 'outro_completed', 'outro_failed', ...gspec.objectives.map((o, i) => o.id || 'obj_' + (i + 1))].every(k => gpot.includes(`/${gpv.mission}/${k}"\n`))
      && gcpot.includes(`msgctxt "mission/single/${gpv.campaign}/campaign/title"\nmsgid ""\nmsgstr ""\n`) && gcpot.includes(`msgctxt "mission/single/${gpv.campaign}/campaign/name"\n`) && gpot.charCodeAt(0) !== 0xfeff,
      'GoH write: the .pot texts under localizations/default (LF, no BOM, the stock header and entries)\n' + gpot.slice(0, 600));
    const gman = JSON.parse(gf(`${GD}/spmis.json`).toString('utf8'));
    ok(gman.exe === 'goh' && gman.created.includes(`${GT}/${gpv.mission}.pot`) && !fs.existsSync(path.join(gohSp, 'sound')) && !fs.existsSync(path.join(gohSp, 'localization')), 'GoH write: the manifest (exe goh, the texts in it), no voice files, no AS2 .lng folder');
    const grp = path.join(MWR.restoreRoot(gohSp)), gpts = fs.readdirSync(grp).map(d => JSON.parse(fs.readFileSync(path.join(grp, d, 'restore-point.json'), 'utf8')));
    ok(gpts.length === gw.points && gpts.every(p => p.existed === false && p.action === 'spmis goh write') && gwant.every(r => gpts.some(p => p.rel === r)), 'GoH write: a restore point per file, beside the mod ' + JSON.stringify(gpts.map(p => p.rel)));
    const gmine = await R['GET /api/x/missions/sp/mine'](Q('mod=' + encodeURIComponent(gohSp)), null, gohCtx);
    ok(gmine.missions.length === 1 && gmine.missions[0].mission === gpv.mission, 'GoH mine: the written mission listed ' + JSON.stringify(gmine.missions.map(x => x.mission)));
    const gpv2 = await R['POST /api/x/missions/sp/preview'](null, { mod: gohSp, spec: gspec }, gohCtx);
    ok(gpv2.ok && gpv2.exists && gpv2.generated && gpv2.files.filter(f => !f.record).every(f => f.state === 'same'), 'GoH preview after the write: every file the same ' + JSON.stringify(gpv2.files.map(f => f.state)));
    const gOth = gx({ name: gpv.mission + '_b' }); gOth.player.army = 'eng';
    const gpv3 = await gpost(gOth), gcs = (gpv3.notes || []).find(n => n.code === 'SPGOH_CAMP_SIDE');
    ok(gpv3.ok && gcs && gcs.p.side === gspec.player.army && gcs.p.army === 'eng' && gpv3.files.some(f => /\/interface\.set$/.test(f.rel) && f.state === 'kept'), 'GoH preview: a kept campaign file on another side said before the write ' + JSON.stringify(gpv3.refusal || gpv3.notes));
    // Undo: the mod as before the write (files and folders)
    const gu = await R['POST /api/x/missions/sp/undo'](null, { mod: gohSp, token: gw.undo }, gohCtx);
    ok(gu.ok && gu.removed === gwant.length && snap(gohSp) === gsnap, 'GoH undo: every file it made removed, the mod as before ' + JSON.stringify(gu));
    // Remove: a second write, then Remove takes away only what the manifest names (restore points first), a second Remove says gone
    const gw2 = await R['POST /api/x/missions/sp/write'](null, { mod: gohSp, spec: gspec }, gohCtx);
    const grm = await R['POST /api/x/missions/sp/remove'](null, { mod: gohSp, mission: gpv.mission }, gohCtx);
    ok(gw2.ok && grm.ok && grm.files === gwant.length && snap(gohSp) === gsnap, 'GoH remove: the files of the manifest (the .pot texts too) and the folders it made ' + JSON.stringify(grm));
    const grm2 = await R['POST /api/x/missions/sp/remove'](null, { mod: gohSp, mission: gpv.mission }, gohCtx);
    ok(!grm2.ok && grm2.refusal.code === 'SP_GONE', 'GoH remove again: gone ' + JSON.stringify(grm2.refusal));
    // a folder of that name the card did not make: refused
    fs.mkdirSync(path.join(gohSp, ...GD.split('/')), { recursive: true });
    const gex = await R['POST /api/x/missions/sp/write'](null, { mod: gohSp, spec: gspec }, gohCtx);
    ok(!gex.ok && gex.refusal.code === 'SPMIS_EXISTS', 'GoH write: a folder the card did not make refused ' + JSON.stringify(gex.refusal));
    fs.rmSync(path.join(gohSp, 'resource'), { recursive: true, force: true }); fs.rmSync(grp, { recursive: true, force: true });
    ok(snap(gohSp) === gsnap, 'GoH: the test mod clean again');
    ok(['en', 'ru', 'uk', 'zh'].every(g => ['missions.e.spgoh', 'missions.sp.goh', 'missions.sp.goh.why', 'missions.sp.goh.pv', 'missions.sp.goh.text', 'missions.sp.goh.look', 'missions.sp.goh.environment', 'missions.sp.goh.environment.def', 'missions.sp.goh.music', 'missions.sp.goh.music.def', 'missions.sp.goh.banner', 'missions.sp.goh.banner.def', 'missions.sp.goh.clear', ...GCODES.map(c => 'missions.sp.c.' + c)].every(k => L[g][k] && !/[‐-―]/.test(L[g][k]) && !/(^|\s)-(\s|$)/.test(L[g][k]) && !/\bdear/i.test(L[g][k])))
      && !['en', 'ru', 'uk', 'zh'].some(g => L[g]['missions.sp.goh.nolint']) && ['missions.sp.goh', 'missions.sp.goh.pv', 'missions.e.spgoh'].every(k => ['en', 'ru', 'uk', 'zh'].every(g => L[g][k].includes('[T]'))), 'GoH strings: 4 languages, no dash, [T] said');
    // the card on the GoH tab: the form loads with the GoH kinds, the GoH line above it, Preview shows the plan, Write stays off
    const apiG = (u, b) => (u.startsWith('/api/x/missions/sp/') ? spApi(gohCtx)(u, b) : api(u, b));
    const PGo = page('en', apiG, { mod: gohSp }, { curGame: () => ({ id: 'goh', kind: 'goh', name: 'GoH' }) });
    PGo.scr.focus();
    const bH = id => all(PGo.rootEl, c => c.dataset && c.dataset.blk === id)[0], btnH = k => tag(PGo.rootEl, 'BUTTON').find(b => b.textContent === L.en[k]);
    await until(() => bH('sp.kind.assault'));
    const na = bH('sp.na'), body = bH('sp.body'), intro = bH('sp.intro');
    ok(na && !na.hidden && na.textContent.includes(L.en['missions.sp.goh']) && body && !body.hidden && intro.hidden && PGo.scr.sp._t.spec().map === 'map/multi/1v1_crossing', 'GoH card: the GoH line, the form with the GoH kinds, no AS2 intro');
    tag(na, 'BUTTON')[0].click(); ok(PGo.box.shows.pop() === 'goh', 'GoH: the button opens the GoH page');
    await until(() => PGo.box.calls.some(c => /sp\/places\?map=map%2Fmulti%2F1v1_crossing/.test(c[0])) && PGo.box.calls.some(c => /sp\/units\?army=ger/.test(c[0])));
    await until(() => ['a1', 'b1', 'f1', 'f2', 'f3'].includes(PGo.scr.sp._t.spec().player.start));
    ok(['a1', 'b1', 'f1', 'f2', 'f3'].includes(PGo.scr.sp._t.spec().player.start), 'GoH card: the template places set on the GoH map ' + PGo.scr.sp._t.spec().player.start);
    PGo.scr.sp._t.go(5); await tick(); await tick();
    ok(btnH('missions.sp.write') && btnH('missions.sp.write').disabled && btnH('missions.sp.write').getAttribute('title') === L.en['missions.e.spgoh'], 'GoH card: Write off before a Preview, its title says the GoH form, not tried in game');
    btnH('missions.sp.preview').click();
    await until(() => attrIn(bH('sp.chk.out'), 'data-gohpv').length);
    const gOut = bH('sp.chk.out').textContent;
    ok(attrIn(bH('sp.chk.out'), 'data-gohpv').length === 1 && attrIn(bH('sp.chk.out'), 'data-gohtext').length === 1 && gOut.includes('[T]') && gOut.includes(L.en['missions.sp.pv.h']) && !btnH('missions.sp.write').disabled
      && !PGo.box.calls.some(c => /sp\/(write|undo|remove)/.test(c[0])), 'GoH card: Preview shows the plan line, the summary, the plan text and the files; Write is on ' + gOut);
    ok(attrIn(bH('sp.chk.out'), 'data-note').some(e => e.dataset.note === 'SPGOH_BANNER_PLAIN') && !/\{\w+\}/.test(gOut), 'GoH card: the GoH notes after Preview, values filled ' + gOut);
    const prGoC = checkScreen(PGo.rootEl);
    ok(!prGoC.length, 'GoH page blocks with the check step:\n  ' + prGoC.slice(0, 20).join('\n  '));
    PGo.scr.sp._t.go(1); await tick(); await tick();
    ok(['environment', 'music', 'banner'].every(x => bH('sp.goh.' + x) && tag(bH('sp.goh.' + x), 'INPUT').length === 1) && bH('sp.goh.look'), 'GoH card: the light set, music and banner boxes on the map step');
    const prGo = checkScreen(PGo.rootEl);
    ok(!prGo.length, 'GoH page blocks with the card:\n  ' + prGo.slice(0, 20).join('\n  '));
    // a switch from the GoH tab to AS2 loads the card (no stuck "Loading…"); the MoW:AS2 line says it works the same
    let GX = { id: 'goh', kind: 'goh', name: 'GoH' };
    const PX = page('en', apiS, { mod: spMod }, { curGame: () => GX }); PX.scr.focus(); await tick(); await tick();
    const bX = id => all(PX.rootEl, c => c.dataset && c.dataset.blk === id)[0];
    GX = { id: 'mowas2', kind: 'as2', name: 'MoW:AS2' }; PX.scr.refresh();
    await until(() => bX('sp.kind.assault'));
    ok(bX('sp.kind.assault') && !bX('sp.body').hidden && bX('sp.na').hidden && !bX('sp.form').textContent.includes(L.en['missions.sp.wait.start']) && bX('sp.intro').textContent.includes(L.en['missions.sp.as2']),
      'GoH to MoW:AS2: the card loads its kinds, no stuck wait, one line that it works the same');
    // tried on AS64 only: under MoW:AS2 the Preview says so, not "tried in the game"
    const pvX = XS.proven();
    ok(pvX.kindsOn && pvX.kindsOn.assault && pvX.kindsOn.assault.includes('as64') && pvX.tries.every(t => t.exe && t.how && t.date) && pvX.menuTried === false, 'proven: each try names its exe and how it started ' + JSON.stringify(pvX.kindsOn));
    PX.scr.sp._t.go(5); await tick(); tag(PX.rootEl, 'BUTTON').find(b => b.textContent === L.en['missions.sp.preview']).click();
    await until(() => bX('sp.chk.out').textContent.includes(head('missions.sp.ready')));
    const prf = attrIn(bX('sp.chk.out'), 'data-proof')[0];
    ok(prf && prf.getAttribute('data-proof') === 'other' && prf.textContent.includes(L.en['missions.sp.nt.as2'].split('(')[0].replace('{exe}', 'AS64')) && !prf.textContent.includes(L.en['missions.sp.tried'].split('{exe}')[0]),
      'MoW:AS2 Preview: tried on AS64, not yet tried in MoW:AS2 ' + (prf && prf.textContent));

    // -- 1. an auto-moved start never shares a place with enemies (a multiplayer map: points a1 a2 b1 b2, no zones)
    const PTS = { key: 'map/single/03_mp/03_cross', places: [['a1', 0, 0], ['a2', 400, 0], ['b1', 0, 3000], ['b2', 400, 3000], ['captureflag', 200, 1500]].map(([n, x, y]) => ({ name: n, kind: 'point', x, y, lab: XS.labelOf(n, 'point') })) };
    const apiP = (u, b) => (u.startsWith('/api/x/missions/sp/places') && u.includes('03_cross') ? Promise.resolve(PTS) : apiS(u, b));
    const P1 = page('en', apiP, { mod: spMod }); P1.scr.focus(); const b1 = id => all(P1.rootEl, c => c.dataset && c.dataset.blk === id)[0];
    await until(() => b1('sp.kind.destroy')); tag(b1('sp.kind.destroy'), 'BUTTON')[0].click(); await tick();
    const ds = JSON.parse(JSON.stringify(P1.scr.sp._t.spec())); ds.map = PTS.key;
    P1.scr.sp._t.reopen({ spec: ds, mission: 'cross_test', title: ds.title, campaign: ds.campaign }); await until(() => PTS.places.some(p => p.name === P1.scr.sp._t.spec().player.start));
    const d1 = P1.scr.sp._t.spec(), enemyAt = (d1.enemy.defenders || []).map(g => g.at).concat(...(d1.enemy.patrols || []).map(g => g.route), (d1.enemy.waves || []).map(g => g.from));
    ok(d1.player.start === 'a1' && !enemyAt.includes('a1') && !P1.scr.sp._t.startFoes().length, 'fixPlaces: the start goes to start point A1, no enemy group at it ' + JSON.stringify([d1.player.start, enemyAt]));
    ok(XS.labelOf('a1', 'point').k === 'mpstart' && XS.labelOf('captureflag', 'point').k === 'cflag' && XS.labelOf('flag_aibase', 'zone').k === 'ebase' && XS.labelOf('gamezone_defense', 'zone').k === 'gz' && XS.labelOf('paradrop_player', 'zone').k === 'drop'
      && P1.scr.sp._t.labOf(PTS.places[0]) === 'start point A1', 'labels: aibase is the enemy base, play area, paradrop, multiplayer start points and capture flag in words ' + P1.scr.sp._t.labOf(PTS.places[0]));
    d1.enemy.defenders[0].at = d1.player.start; P1.scr.sp._t.go(2); await tick();
    ok(P1.scr.sp._t.startFoes().length === 1 && b1('sp.start.clash') && b1('sp.start.clash').textContent.includes(head('missions.sp.start.clash')), 'step 3: an enemy group at your start is said');
    // roles on a multiplayer map: the goal on a flag, the defenders on the goal's place, waves and patrols from the other side's start points
    const PTF = { key: 'map/single/03_mp/03_flags', places: [['a1', 0, 0], ['a2', 400, 0], ['b1', 0, 3000], ['b2', 400, 3000], ['f1', 200, 500], ['f2', 200, 1500], ['f3', 200, 2500]].map(([n, x, y]) => ({ name: n, kind: 'point', x, y, lab: XS.labelOf(n, 'point') })) };
    const apiF = (u, b) => (u.startsWith('/api/x/missions/sp/places') && u.includes('03_flags') ? Promise.resolve(PTF) : apiP(u, b));
    const roles = async kind => {
      const PF = page('en', apiF, { mod: spMod }); PF.scr.focus(); const bF = id => all(PF.rootEl, c => c.dataset && c.dataset.blk === id)[0];
      await until(() => bF('sp.kind.' + kind)); tag(bF('sp.kind.' + kind), 'BUTTON')[0].click(); await tick();
      const T = PF.scr.sp._t, read = () => { const s = T.spec(), e = s.enemy; return { start: s.player.start, goals: s.objectives.map(o => o.zone || o.to).filter(v => v != null), def: (e.defenders || []).map(g => g.at), pat: (e.patrols || []).map(g => g.route), wav: (e.waves || []).map(g => g.from), foes: T.startFoes().length, next: T.goalPlace() }; };
      T.setMap(PTF.key); await until(() => T.spec().player.start === 'a1'); await tick(); const f = read();
      T.setMap(PTS.key); await until(() => read().goals.every(g => !/^f\d$/.test(g)) && read().def.every(g => !/^f\d$/.test(g))); await tick(); const c = read();
      return { f, c };
    };
    const rA = await roles('assault'), rD = await roles('defence'), isB = v => v === 'b1' || v === 'b2', isF = v => /^f[123]$/.test(v);
    ok(rA.f.start === 'a1' && rA.f.goals.length && rA.f.goals[0] === 'f2' && rA.f.goals.every(isF) && rA.f.def.length && rA.f.def.every(v => rA.f.goals.includes(v)) && !rA.f.foes
      && rA.f.pat.every(r => r.every(v => v !== 'a1' && v !== 'a2') && isB(r[0])) && rA.f.wav.every(isB) && isF(rA.f.next) && !rA.f.goals.includes(rA.f.next),
      'fixPlaces on a multiplayer map: the goal goes on a flag (the middle one first), the defenders stand on the goal\'s place, patrols start at the other side\'s start points, a new goal starts on the first flag no goal uses ' + JSON.stringify(rA.f));
    ok(rA.c.start === 'a1' && rA.c.goals[0] === 'captureflag' && rA.c.def.every(v => rA.c.goals.includes(v)) && !rA.c.foes && rA.c.pat.every(r => isB(r[0])) && rA.c.wav.every(isB),
      'fixPlaces after a map change: the same roles on the new map (goal on its capture flag, defenders on it) ' + JSON.stringify(rA.c));
    ok(rD.f.start === 'a1' && rD.f.wav.length && rD.f.wav.every(isB) && !rD.f.foes && rD.c.wav.every(isB) && !rD.c.foes, 'fixPlaces, defence: the waves come from the other side\'s start points, on both maps ' + JSON.stringify(rD));
    // Pick on the map: beside the place field when the picker is there; a pick fills the field
    let picked = null; const P2 = page('en', apiP, { mod: spMod }, { MAPVIZ_PICK: { open: o => { picked = o; o.onPick({ x: 410, y: 2990, place: { id: 'b2' } }); }, close() {}, isOpen: () => false } });
    P2.scr.focus(); const b2 = id => all(P2.rootEl, c => c.dataset && c.dataset.blk === id)[0];
    await until(() => b2('sp.kind.assault')); await until(() => { P2.scr.sp._t.go(2); return b2('sp.start') && tag(b2('sp.start'), 'OPTION').length > 3; });
    const pmB = attrIn(b2('sp.start'), 'data-pickmap')[0];
    ok(pmB && tag(pmB, 'BUTTON')[0].textContent === L.en['missions.sp.pickmap'] && !attrIn(b1('sp.start'), 'data-pickmap').length, 'Pick on the map: a button beside the place field, none when the picker is not loaded');
    tag(pmB, 'BUTTON')[0].click(); await tick();
    ok(picked && picked.target === 'as64' && picked.map === P2.scr.sp._t.spec().map && picked.places.length > 3 && P2.scr.sp._t.spec().player.start === 'b2', 'Pick on the map: opens with the card\'s places, the pick fills the field ' + JSON.stringify(picked && picked.places.slice(0, 2)));
    P2.scr.sp._t.go(2); await until(() => b2('sp.start')); tag(attrIn(b2('sp.start'), 'data-pickmap')[0], 'BUTTON')[0].click();
    picked.onPick({ x: 812.4, y: -95.6, place: null }); await tick();
    ok(JSON.stringify(P2.scr.sp._t.spec().player.start) === '[812,-96]' && P2.scr.sp._t.lines().some(x => x.t.includes('spot on the map (41 m east, 5 m south of the middle)')) && P2.scr.sp._t.spotT([-40, 60]) === 'spot on the map (2 m west, 3 m north of the middle)', 'Pick on the map: a spot off the places is kept as x,y, said in metres east or west and north or south, never negative ' + JSON.stringify(P2.scr.sp._t.lines()[2]));
    P2.scr.sp._t.go(2); await until(() => b2('sp.start')); tag(attrIn(b2('sp.start'), 'data-pickmap')[0], 'BUTTON')[0].click();
    const st14 = JSON.stringify(P2.scr.sp._t.spec().player.start); picked.onPick({ x: 9000, y: 0, place: null }); await tick();
    ok(JSON.stringify(P2.scr.sp._t.spec().player.start) === st14 && b2('sp.msg').textContent.includes(L.en['missions.sp.pick.out'].split('{f}')[0]), 'Pick on the map: a spot outside the playable area refused at once, said ' + b2('sp.msg').textContent);

    // Mission map: with the picker's inline form (MAPVIZ_PICK.embed) the Map Viewer's map stands in place of the sketch
    {
      let PM = null; const EMB = [];
      const embed = o => { const hd = { o, ups: [], closed: 0, el: PM.doc.createElement('div'), update(u) { hd.ups.push(u); hd.o = Object.assign({}, hd.o, u); }, fit() {}, close() { hd.closed++; }, state: () => ({}) }; hd.el.setAttribute('data-fakemap', '1'); EMB.push(hd); return hd; };
      const PTFB = Object.assign({}, PTF, { bounds: [-100, -100, 500, 3100] });
      const apiM = (u, b) => (u.startsWith('/api/x/missions/sp/places') && u.includes('03_flags') ? Promise.resolve(PTFB) : apiP(u, b));
      PM = page('en', apiM, { mod: spMod }, { MAPVIZ_PICK: { open() {}, close() {}, isOpen: () => false, embed } });
      PM.scr.focus(); const bM = id => all(PM.rootEl, c => c.dataset && c.dataset.blk === id)[0], TM = PM.scr.sp._t;
      await until(() => bM('sp.kind.assault')); if (TM.spec().map !== PTS.key) TM.setMap(PTS.key);
      await until(() => TM.placesKey() === PTS.key); await tick();
      ok(!EMB.length && !bM('sp.mm'), 'Mission map: none on the kind step');
      const sm = TM.spec();
      sm.player.start = 'a1';
      sm.player.units = [{ name: 'u1', def: 'mp/usa/rifle', count: 4, at: 'start' }, { name: 'u2', def: 'mp/usa/smg', count: 2, at: 'a2' }];
      sm.reinforcements = [];
      sm.enemy.defenders = [{ name: 'd1', def: 'mp/ger/rifle', count: 5, at: 'captureflag' }];
      sm.enemy.patrols = [{ name: 'p1', def: 'mp/ger/smg', count: 3, route: ['b1', 'nowhere', 'b2'] }];
      sm.enemy.waves = [{ name: 'w1', def: 'mp/ger/rifle', count: 6, from: 'b2', to: 'start', time: 300 }, { name: 'w2', def: 'mp/ger/rifle', count: 6, from: 'ghost', to: 'start', time: 60 }];
      sm.objectives = [{ id: 'goal_1', type: 'capture', zone: 'captureflag' }, { id: 'goal_2', type: 'reach', zone: [300, 2000] }, { id: 'goal_3', type: 'hold', zone: 'gone', minutes: 5 }];
      TM.go(2); await tick();
      const H0 = EMB[0], o0 = H0 && H0.o;
      ok(EMB.length === 1 && o0.target === 'as64' && o0.map === PTS.key && o0.height === 380 && typeof o0.onPick === 'function' && o0.places.length === 5
        && o0.places.find(p => p.id === 'b2' && p.x === 400 && p.y === 3000 && p.kind === 'point' && p.label) && o0.places.find(p => p.id === 'captureflag').kind === 'flag'
        && o0.legend.length === 4 && o0.legend[0].side === 'player' && o0.legend[0].text === L.en['missions.sp.you'] && o0.legend[1].side === 'enemy' && o0.legend[3].text === L.en['missions.sp.map.live.routes'],
        'Mission map: embedded once with the game, the map, its places in world units and the legend ' + JSON.stringify(o0 && [o0.target, o0.map, o0.height, o0.places, o0.legend]));
      ok(bM('sp.mm') && H0.el.parentNode && H0.el.parentNode.dataset.blk === 'sp.mm.map' && bM('sp.mm.wrap') && bM('sp.mm.fields') && all(bM('sp.mm.fields'), c => c.dataset && c.dataset.blk === 'sp.start').length === 1
        && !bM('sp.sk3') && bM('sp.mm.line').textContent === L.en['missions.sp.map.live.hint'], 'Mission map: open on the sides step beside its fields, no sketch fold, the line says what a click does');
      const M0 = o0.marks, ty = (t, sd) => M0.filter(m => m.type === t && (sd == null || m.side === sd)), J = JSON.stringify;
      const pu = ty('unit', 'player'), eu = ty('unit', 'enemy'), rt = ty('route', 'enemy'), gl = ty('goal'), pr = ty('route', 'player');
      ok(M0.length === 9 && ty('start').length === 1 && ty('start')[0].x === 0 && ty('start')[0].y === 0 && ty('start')[0].label === L.en['missions.sp.map.live.start'], 'Mission map marks: your start at its place ' + J(ty('start')) + ' of ' + M0.length);
      ok(pu.length === 2 && pu[0].x === 0 && pu[0].y === 0 && pu[0].n === 4 && pu[0].label === TM.unitName('mp/usa/rifle') && pu[1].x === 400 && pu[1].y === 0 && pu[1].n === 2 && pu[1].label.includes(TM.unitName('mp/usa/smg')),
        'Mission map marks: each of your groups at its place (at the start: your start), the count in the badge, the in-game name in the label ' + J(pu));
      ok(eu.length === 1 && eu[0].x === 200 && eu[0].y === 1500 && eu[0].n === 5 && eu[0].label === TM.unitName('mp/ger/rifle'), 'Mission map marks: the defenders at their place ' + J(eu));
      ok(rt.length === 2 && J(rt[0].pts) === '[[0,3000],[400,3000]]' && !rt[0].dashed && rt[0].label.includes(TM.unitName('mp/ger/smg'))
        && J(rt[1].pts) === '[[400,3000],[0,0]]' && rt[1].dashed === true && rt[1].arrow === true, 'Mission map marks: a patrol is a route through its stops (a stop this map lacks is left out), a wave a dashed arrow from where it comes to where it goes; a wave from an unknown place is left out ' + J(rt));
      ok(gl.length === 2 && gl[0].n === 1 && gl[0].x === 200 && gl[0].y === 1500 && gl[0].label === sm.objectives[0].text && gl[0].label && gl[1].n === 2 && gl[1].x === 300 && gl[1].y === 2000
        && pr.length === 1 && J(pr[0].pts) === '[[0,0],[300,2000]]' && pr[0].arrow === true, 'Mission map marks: goals numbered in their order with their own line, a spot [x, y] as it is, a reach goal with an arrow to its place, a goal on an unknown place left out ' + J(gl.concat(pr)));
      // redraws and other steps: the same handle, updated; its element moves into the new page
      TM.draw(); TM.go(3); await tick(); const on3 = !!bM('sp.mm') && !bM('sp.sk4') && H0.el.parentNode && H0.el.parentNode.dataset.blk === 'sp.mm.map';
      TM.go(4); await tick(); const on4 = !!bM('sp.mm');
      TM.go(5); await tick(); const on5 = !!bM('sp.mm') && H0.o.height === 460 && bM('sp.mm.line').textContent === L.en['missions.sp.map.live.look'];
      TM.go(1); await tick(); const on1 = !!bM('sp.mm') && H0.o.height === 380 && !bM('sp.map.names');
      ok(EMB.length === 1 && H0.ups.length >= 4 && !H0.closed && on3 && !on4 && on5 && on1 && H0.el.parentNode.dataset.blk === 'sp.mm.map',
        'Mission map: one embed for the card across redraws and steps (update, not embed again); shown on map, sides, goals and check (taller there), not on the story step ' + J([EMB.length, H0.ups.length, H0.closed, on3, on4, on5, on1]));
      // two groups of one side on one spot: one mark, both names, the men added up
      sm.player.units[1].at = 'start'; TM.go(2); await tick();
      const pu2 = H0.o.marks.filter(m => m.type === 'unit' && m.side === 'player');
      ok(pu2.length === 1 && pu2[0].n === 6 && pu2[0].label.includes(' + ') && pu2[0].label.includes('\u00d74'), 'Mission map marks: two groups on one spot are one mark ' + J(pu2));
      // a click: with no field in use it only names the place; with a field in use a place fills it, a spot goes in as [x, y]
      TM.field(null); const st0 = J(sm.player.start); H0.o.onPick({ x: 400, y: 3000, m: { x: 20, y: 150 }, place: { id: 'b2', label: 'b2' }, inside: true }); await tick();
      ok(J(sm.player.start) === st0 && bM('sp.msg').textContent.includes(L.en['missions.sp.map.live.first'].split('{p}')[1]), 'Mission map click: with no field in use it only says which place it is ' + bM('sp.msg').textContent);
      tag(bM('sp.start'), 'SELECT')[0].fire('focus');
      ok(bM('sp.mm.line').textContent === L.en['missions.sp.map.live.target'].replace('{f}', L.en['missions.sp.start']), 'Mission map: the line names the field a click fills ' + bM('sp.mm.line').textContent);
      H0.o.onPick({ x: 400, y: 3000, m: { x: 20, y: 150 }, place: { id: 'b2', label: 'b2' }, inside: true }); await tick();
      ok(sm.player.start === 'b2' && H0.o.marks.find(m => m.type === 'start').x === 400 && bM('sp.msg').textContent.includes(L.en['missions.sp.start']), 'Mission map click: a place fills the field last used, the marks follow ' + J(sm.player.start));
      H0.o.onPick({ x: 123.6, y: 456.4, m: { x: 6, y: 23 }, place: null, inside: true }); await tick();
      ok(J(sm.player.start) === '[124,456]' && H0.o.marks.find(m => m.type === 'start').y === 456, 'Mission map click: a spot goes into the field last used as [x, y] ' + J(sm.player.start));
      // on the map step (no place fields) a click only names
      TM.go(1); await tick(); H0.o.onPick({ x: 0, y: 3000, place: { id: 'b1' }, inside: true }); await tick();
      ok(J(sm.player.start) === '[124,456]' && bM('sp.msg').textContent.includes(L.en['missions.sp.map.live.is'].split('{p}')[0]), 'Mission map click: on the map step it only names the place ' + bM('sp.msg').textContent);
      // another map: the old handle is closed, a new one is made for the new map; outside its playable area a spot is refused
      TM.setMap(PTF.key); await until(() => TM.placesKey() === PTF.key); TM.go(2); await tick();
      const H1 = EMB[1];
      ok(EMB.length === 2 && H0.closed === 1 && H1 && !H1.closed && H1.o.map === PTF.key && H1.o.places.length === 7 && H1.el.parentNode && H1.el.parentNode.dataset.blk === 'sp.mm.map' && !H0.el.parentNode,
        'Mission map: a map change closes the old handle and makes a new one ' + J([EMB.length, H0.closed, H1 && H1.o.map]));
      tag(bM('sp.start'), 'SELECT')[0].fire('focus'); const st1 = J(TM.spec().player.start);
      H1.o.onPick({ x: 9000, y: 0, place: null, inside: null }); await tick();
      const refused = J(TM.spec().player.start) === st1 && bM('sp.msg').textContent.includes(L.en['missions.sp.pick.out'].split('{f}')[0]);
      H1.o.onPick({ x: 250.2, y: 249.6, place: null, inside: true }); await tick();
      ok(refused && J(TM.spec().player.start) === '[250,250]' && bM('sp.msg').textContent.includes(L.en['missions.sp.start']), 'Mission map click: a spot outside the playable area is refused and said, one inside is set ' + J(TM.spec().player.start));
      PM.scr.sp.close();
      ok(H1.closed === 1 && !TM.mm(), 'Mission map: the card\'s close() closes the handle');
      // without the inline form: the sketch as before, no mission map
      P2.scr.sp._t.go(2); await tick(); const sk3 = b2('sp.sk3'); P2.scr.sp._t.go(1); await tick();
      ok(sk3 && attrIn(sk3, 'data-place').length > 3 && !b2('sp.mm') && b2('sp.map.names') && !P2.scr.sp._t.mm(), 'Mission map: without MAPVIZ_PICK.embed the old sketch is drawn');
    }

    // -- 2. a second mission of the same kind gets its own folder; a folder of another mission is said before Write
    const P3s = page('en', apiS, { mod: spMod }); P3s.scr.focus(); const b3 = id => all(P3s.rootEl, c => c.dataset && c.dataset.blk === id)[0];
    const out3 = () => b3('sp.chk.out').textContent, btn3 = k => tag(P3s.rootEl, 'BUTTON').find(b => b.textContent === L.en[k]);
    await until(() => b3('sp.kind.assault')); P3s.box.confirmAnswer = true;
    P3s.scr.sp._t.go(5); await tick(); btn3('missions.sp.preview').click(); await until(() => !btn3('missions.sp.write').disabled);
    btn3('missions.sp.write').click(); await until(() => out3().includes(L.en['missions.sp.play.h']), 2000);
    await until(() => b3('sp.mine').textContent.includes(FN));
    P3s.scr.sp._t.go(0); await tick(); tag(b3('sp.kind.assault'), 'BUTTON')[0].click(); await tick();
    // the kind of a written mission clicked again: asked first (Change starts a new mission of that kind)
    ok(b3('sp.kind.ask') && P3s.scr.sp._t.lock(), 'a kind clicked on a written mission asks before it starts a new one');
    tag(b3('sp.kind.ask'), 'BUTTON').find(b => b.textContent === L.en['missions.sp.kind.change']).click(); await tick();
    P3s.scr.sp._t.go(5); await tick();
    ok(P3s.scr.sp._t.spec().name === FN + '_2' && !P3s.scr.sp._t.lock(), 'a second assault mission: its own folder ' + P3s.scr.sp._t.spec().name);
    btn3('missions.sp.preview').click(); await until(() => attrIn(b3('sp.chk.out'), 'data-duptitle').length);
    const dt = attrIn(b3('sp.chk.out'), 'data-duptitle')[0];
    ok(dt && dt.textContent.includes(L.en['missions.sp.duptitle'].split('{title}')[0]) && tag(dt, 'BUTTON')[0].textContent === L.en['missions.sp.duptitle.go'], 'a _2 folder: Preview warns the menu title is the same as another mission, with Change the title');
    tag(dt, 'BUTTON')[0].click(); await tick(); ok(P3s.scr.sp._t.step() === 4, 'Change the title: the texts step');
    P3s.scr.sp._t.go(4); await tick(); const nmIn = tag(b3('sp.st.name'), 'INPUT')[0]; nmIn.value = FN; nmIn.fire('input'); nmIn.fire('change');
    P3s.scr.sp._t.go(5); await tick(); btn3('missions.sp.preview').click(); await until(() => attrIn(b3('sp.chk.out'), 'data-replace').length);
    const rpl = attrIn(b3('sp.chk.out'), 'data-replace')[0];
    ok(rpl.getAttribute('data-replace') === 'other' && rpl.textContent.includes(L.en['missions.sp.replace.other'].replace('{title}', 'Assault on the crossroads').slice(0, 40)) && tag(rpl, 'BUTTON')[0].textContent === L.en['missions.sp.newname'],
      'the folder of another mission: Preview says Write replaces it, with a new folder name button ' + rpl.textContent);
    tag(rpl, 'BUTTON')[0].click(); await tick();
    ok(P3s.scr.sp._t.spec().name === FN + '_2', 'Use a new folder name: the next free name ' + P3s.scr.sp._t.spec().name);
    // the undo token: the server says when it is gone (a restart), the button greys with the sentence
    const tok = P3s.box.calls.filter(c => c[0] === '/api/x/missions/sp/write').length && [...XS.UNDO.keys()].pop();
    ok((await R['GET /api/x/missions/sp/undo-ok'](Q('token=' + encodeURIComponent(tok)), null, sctx)).ok === true && (await R['GET /api/x/missions/sp/undo-ok'](Q('token=zz'), null, sctx)).ok === false, 'undo-ok: a live token yes, an unknown one no');
    await until(() => b3('sp.mine').textContent.includes(FN)); tag(b3('sp.mine'), 'BUTTON').find(b => b.textContent === L.en['missions.sp.rm']).click();
    await until(() => b3('sp.msg').textContent.includes(head('missions.sp.rm.done')));
    ok(snap(spMod) === before, 'second-mission test: removed, the mod as before');

    // -- 3. Change this mission in another window language: the texts stay as typed, each says so
    const es = JSON.parse(JSON.stringify(PS.scr.sp._t.spec())); es.card.lang = 'en'; es.title = 'Assault on the crossroads'; es.card.own = { briefing: true }; es.card.base = { briefing: 'an older made text' };
    const PR2 = page('ru', apiS, { mod: spMod }); PR2.scr.focus(); const bR2 = id => all(PR2.rootEl, c => c.dataset && c.dataset.blk === id)[0];
    await until(() => bR2('sp.kind.assault'));
    PR2.scr.sp._t.reopen({ spec: es, mission: es.name, title: es.title, campaign: es.campaign }); await tick(); await tick();
    await until(() => /[а-яё]/i.test(PR2.scr.sp._t.spec().objectives[0].text), 2000);
    PR2.scr.sp._t.go(3); await tick(); PR2.scr.sp._t.go(4); await tick();
    const r2s = PR2.scr.sp._t.spec();
    ok(r2s.title === 'Assault on the crossroads' && r2s.briefing === es.briefing && bR2('sp.st.title.own') && bR2('sp.st.title.own').textContent.includes(L.ru['missions.sp.own.lang'].replace('{lang}', L.ru['missions.sp.ln.en']).replace('{use}', L.ru['missions.sp.own.use'])),
      'Change this mission in Russian: the typed English title and story kept, said ' + JSON.stringify([r2s.title, r2s.briefing]));
    ok(r2s.objectives.length && r2s.objectives.every((o, i) => o.text !== es.objectives[i].text && /[а-яё]/i.test(o.text) && !r2s.card.own['goal:' + o.id]) && r2s.objectives[0].text.startsWith(L.ru['missions.sp.gt.capture'].split('{')[0]) && !PR2.scr.sp._t.staleTexts(),
      'Change this mission in Russian: the goal texts that were still the made ones are made again in Russian (no case ending needed), not marked kept ' + JSON.stringify(r2s.objectives.map(o => o.text)));
    // a kept text whose values change is flagged: the goal typed in English, then its place changed
    const es7 = JSON.parse(JSON.stringify(es)); es7.objectives[0].text = 'Take the hill, lads'; es7.card.own['goal:' + es7.objectives[0].id] = true; es7.card.base['goal:' + es7.objectives[0].id] = es.objectives[0].text;
    const PR7 = page('ru', apiS, { mod: spMod }); PR7.scr.focus(); await until(() => all(PR7.rootEl, c => c.dataset && c.dataset.blk === 'sp.kind.assault')[0]);
    PR7.scr.sp._t.reopen({ spec: es7, mission: es7.name, title: es7.title, campaign: es7.campaign }); await tick(); await tick();
    await until(() => PR7.scr.sp._t.spec().objectives.slice(1).every(o => /[а-яё]/i.test(o.text)));
    const s7 = PR7.scr.sp._t.spec(), o7 = s7.objectives[0], st0 = PR7.scr.sp._t.staleTexts();
    PR7.scr.sp._t.go(3); await tick(); const own7a = attrIn(PR7.rootEl, 'data-own').map(e => e.getAttribute('data-own'));
    const k7 = o7.zone != null ? 'zone' : 'to', other7 = PR7.scr.sp._t.placeRoles().goal.concat(PR7.scr.sp._t.placeRoles().foe).find(n => n !== o7[k7]);
    o7[k7] = other7; PR7.scr.sp._t.fixPlaces(false); PR7.scr.sp._t.go(3); await tick();
    const mv7 = attrIn(PR7.rootEl, 'data-own', 'moved');
    ok(o7.text === 'Take the hill, lads' && st0 === 0 && own7a.includes('lang') && !own7a.includes('moved') && other7 && mv7.length === 1 && mv7[0].getAttribute('data-ownlang') === 'en'
      && mv7[0].textContent.includes(L.ru['missions.sp.own.langwarn'].split('{lang}')[0]) && PR7.scr.sp._t.staleTexts() >= 1,
      'a text kept in English: once a value it was made from changes it says "no longer matches" ' + JSON.stringify([o7.text, st0, own7a, other7, mv7.length, PR7.scr.sp._t.staleTexts()]));
    for (const lg of ['ru', 'uk']) {
      const PX2 = lg === 'ru' ? PR2 : page('uk', apiS, { mod: spMod }); if (lg === 'uk') { PX2.scr.focus(); await until(() => all(PX2.rootEl, c => c.dataset && c.dataset.blk === 'sp.kind.assault')[0]); PX2.scr.sp._t.reopen({ spec: JSON.parse(JSON.stringify(es)), mission: es.name, title: es.title, campaign: es.campaign }); await tick(); await tick(); await until(() => /[а-яіїє]/i.test(PX2.scr.sp._t.spec().objectives[0].text), 2000); }
      const own = [];
      for (const st of [3, 4]) { PX2.scr.sp._t.go(st); await tick(); own.push(...attrIn(PX2.rootEl, 'data-own').map(e => e.getAttribute('data-own') + ':' + e.textContent)); }
      ok(own.length >= 2 && own.every(x => x.startsWith('lang:')) && !own.some(x => x.includes(L[lg]['missions.sp.own.mine'].slice(0, 20)) || x.includes(L[lg]['missions.sp.own.warn'].slice(0, 20))),
        'Change this mission in ' + lg + ': every kept text says only the language it was made in (no "you typed", no "changed since") ' + own.slice(0, 3).join(' | '));
    }

    // -- 4. a Chinese window: the question-mark warning shows on the texts step, outside any fold
    const PZ = page('zh', apiS, { mod: spMod }); PZ.scr.focus(); await until(() => all(PZ.rootEl, c => c.dataset && c.dataset.blk === 'sp.kind.assault')[0]);
    PZ.scr.sp._t.go(4); await tick();
    const zw = attrIn(PZ.rootEl, 'data-zhwarn')[0];
    ok(zw && zw.textContent === L.zh['missions.sp.story.zh'] && !all(PZ.rootEl, c => c.tagName === 'DETAILS').some(d => all(d, c => c === zw).length), 'zh window: the question-mark warning out of the fold');
    ok(PZ.scr.sp._t.spec().title === L.en['missions.sp.tpl.assault.title'] && PZ.scr.sp._t.spec().card.lang === 'en' && PZ.scr.sp._t.spec().objectives[0].text === L.en['missions.sp.tg.assault.take_crossroads'],
      'zh window: the mission texts made in English (the warning says why) ' + PZ.scr.sp._t.spec().title);
    ok(['en', 'ru', 'uk', 'zh'].every(g => !/LOC-/.test(L[g]['missions.sp.story.zh']) && !/LOC-/.test(L[g]['missions.sp.story.lang'] || '')) && ['en', 'ru', 'uk', 'zh'].every(g => /LOC-14/.test(L[g]['missions.sp.story.zhwhy'])), 'LOC-14 only in the Details line');

    // -- 9. each refusal its own sentence and field; no goals said live on step 4
    ok(XS.whyOf('SPMIS_SPEC', 'objectives: at least one objective') === 'nogoals' && XS.whyOf('SPMIS_SPEC', 'player.units: at least one group') === 'nounits' && XS.whyOf('SPMIS_NO_LOSE', 'objectives: at least one') === ''
      && XS.WHY.every(([k]) => ['en', 'ru', 'uk', 'zh'].every(g => L[g]['missions.sp.c.spec.' + k])), 'whyOf: the kind of a spec refusal; every kind has a sentence in 4 languages');
    const refs = [
      ['no goals', s => { s.objectives = []; }, 'nogoals', 'ob'],
      ['no units', s => { s.player.units = []; }, 'nounits', 'pu'],
      ['goal with no place', s => { s.objectives[0].zone = 'auto'; }, 'noplace', 'ob.0'],
      ['vehicles only', s => { s.player.units = s.player.units.filter(u => u.crew).map(u => { delete u.crew; return u; }); s.reinforcements = []; }, 'nohuman', 'lose'],
    ];
    for (const [nm, mut, why, fld] of refs) {
      const s = JSON.parse(JSON.stringify(st.templates[0].spec)); mut(s);
      const rr = await R['POST /api/x/missions/sp/preview'](null, { mod: spMod, spec: s }, sctx);
      ok(!rr.ok && rr.refusal.why === why && rr.refusal.field === fld, 'refusal ' + nm + ': why ' + why + ', field ' + fld + ' ' + JSON.stringify(rr.refusal));
    }
    const PE = page('en', apiS, { mod: spMod }); PE.scr.focus(); const bE = id => all(PE.rootEl, c => c.dataset && c.dataset.blk === id)[0];
    await until(() => bE('sp.kind.assault')); PE.scr.sp._t.spec().objectives = []; PE.scr.sp._t.go(3); await tick();
    ok(bE('sp.ob.none') && bE('sp.ob.none').textContent === L.en['missions.sp.goals.none'], 'step 4: no goal said at once');
    PE.scr.sp._t.go(5); await tick(); tag(PE.rootEl, 'BUTTON').find(b => b.textContent === L.en['missions.sp.preview']).click();
    await until(() => bE('sp.chk.out').textContent.includes(L.en['missions.sp.c.spec.nogoals']));
    ok(bE('sp.chk.out').textContent.includes(L.en['missions.sp.c.spec.nogoals']), 'Preview with no goal: its own sentence ' + bE('sp.chk.out').textContent.slice(0, 200));
    const PE2 = page('en', apiS, { mod: spMod }); PE2.scr.focus(); const bE2 = id => all(PE2.rootEl, c => c.dataset && c.dataset.blk === id)[0];
    await until(() => bE2('sp.kind.assault')); const sv = PE2.scr.sp._t.spec(); sv.player.units = sv.player.units.filter(u => u.crew); const lh0 = !bE2('sp.lose.nohuman'); PE2.scr.sp._t.go(3); await tick(); const lh1 = !bE2('sp.lose.nohuman'); sv.player.units.forEach(u => { delete u.crew; }); PE2.scr.sp._t.go(3); await tick();
    ok(lh0 && lh1 && bE2('sp.lose.nohuman') && bE2('sp.lose.nohuman').textContent === L.en['missions.sp.lose.nohuman'], 'step 4: no soldiers (a crewed tank counts as soldiers) with "all soldiers dead" is said at once');
    // undo after a restart: the button greys with the plain sentence (the token gone from the server)
    const PU = page('en', apiS, { mod: spMod }); PU.scr.focus(); const bU = id => all(PU.rootEl, c => c.dataset && c.dataset.blk === id)[0];
    const btnU = k => tag(PU.rootEl, 'BUTTON').find(b => b.textContent === L.en[k]);
    await until(() => bU('sp.kind.assault')); PU.box.confirmAnswer = true; PU.scr.sp._t.go(5); await tick();
    btnU('missions.sp.preview').click(); await until(() => !btnU('missions.sp.write').disabled);
    btnU('missions.sp.write').click(); await until(() => bU('sp.chk.out').textContent.includes(L.en['missions.sp.play.h']), 2000);
    XS.UNDO.clear(); PU.scr.sp._t.prev().done.undoAt = 0; PU.scr.sp._t.go(5); await tick();
    await until(() => attrIn(bU('sp.chk.out'), 'data-undo', 'gone').length);
    const ubtn = tag(bU('sp.chk.out'), 'BUTTON').find(b => b.textContent === L.en['missions.sp.undo']);
    ok(ubtn && ubtn.disabled && attrIn(bU('sp.chk.out'), 'data-undo', 'gone')[0].textContent === L.en['missions.sp.undo.gone'].replace('{rm}', L.en['missions.sp.rm']).replace('{box}', L.en['missions.sp.mine.h']),
      'undo after a restart: the button greyed, the plain sentence names Remove and its box');
    await until(() => bU('sp.mine').textContent.includes(FN)); tag(bU('sp.mine'), 'BUTTON').find(b => b.textContent === L.en['missions.sp.rm']).click();
    await until(() => bU('sp.msg').textContent.includes(head('missions.sp.rm.done')));
    ok(snap(spMod) === before, 'undo-gone test: removed, the mod as before');
    // ---- card fixes: failed reads, the kind click, the new goal's place, no mod.info, the second Remove, the escort route
    {
      const pg = (apiFn, S0) => { const P = page('en', apiFn, S0 || { mod: spMod }); P.scr.focus(); P.b = id => all(P.rootEl, c => c.dataset && c.dataset.blk === id)[0]; P.btn = k => tag(P.rootEl, 'BUTTON').find(b => b.textContent === L.en[k]); P.T = P.scr.sp._t; return P; };
      // 1. the kinds cannot be read: one plain line with Try again, Back and Next off; Try again reads them
      let down = true, startAsked = 0;
      const P0 = pg((u, b) => { if (u.startsWith('/api/x/missions/sp/start')) { startAsked++; if (down) return Promise.reject(new Error('boom')); } return apiS(u, b); });
      await until(() => P0.b('sp.readfail'));
      ok(P0.b('sp.readfail') && P0.b('sp.readfail').textContent.includes(L.en['missions.sp.read.fail'].replace('{what}', L.en['missions.sp.read.w.start'])) && !P0.b('sp.kind.assault') && tag(P0.b('sp.nav'), 'BUTTON').every(b => b.disabled),
        'the kinds not read: one plain line, no step, Back and Next off ' + (P0.b('sp.readfail') || {}).textContent);
      down = false; P0.btn('missions.sp.retry').click(); await until(() => P0.b('sp.kind.assault'));
      ok(P0.b('sp.kind.assault') && !P0.b('sp.readfail') && startAsked === 2 && tag(P0.b('sp.nav'), 'BUTTON').some(b => !b.disabled), 'Try again: the kinds are read again, the line gone, Next on ' + startAsked);
      // 1. a failed read of the maps is not kept as an answer: said once, asked again by Try again
      let mapsDown = true, mapsAsked = 0;
      const P1m = pg((u, b) => { if (u.startsWith('/api/x/missions/sp/maps')) { mapsAsked++; if (mapsDown) return Promise.reject(new Error('boom')); } return apiS(u, b); });
      await until(() => P1m.b('sp.readfail'));
      const rf = () => all(P1m.rootEl, c => c.dataset && c.dataset.blk === 'sp.readfail');
      ok(rf().length === 1 && attrIn(rf()[0], 'data-readfail')[0].getAttribute('data-readfail').split(' ').includes('maps') && rf()[0].textContent.includes(L.en['missions.sp.read.w.maps']) && mapsAsked === 1 && P1m.T.err().maps,
        'the maps not read: one line that names the maps, with Try again ' + (rf()[0] || {}).textContent);
      P1m.T.go(1); await tick(); ok(rf().length === 1, 'the line is said once on the next step too');
      const asked1 = mapsAsked; mapsDown = false; P1m.btn('missions.sp.retry').click(); await until(() => !P1m.b('sp.readfail') && mapsAsked > asked1);
      ok(!P1m.b('sp.readfail') && mapsAsked === asked1 + 1 && !P1m.T.err().maps, 'Try again: the maps are asked again (the failure was not kept), the line gone ' + mapsAsked);

      // 2. the kind already picked: a click does nothing; another kind after a change asks in the page; Keep leaves all, Change keeps map and armies
      const P2 = pg(apiF); await until(() => P2.b('sp.kind.assault')); await until(() => P2.box.calls.some(c => /sp\/units\?army=ger/.test(c[0])));
      const kb = k => tag(P2.b('sp.kind.' + k), 'BUTTON')[0];
      kb('escort').click(); await tick();
      ok(P2.T.spec().card.kind === 'escort' && !P2.b('sp.kind.ask'), 'nothing changed yet: another kind is taken at once');
      P2.T.setMap(PTF.key); await until(() => P2.T.placesKey() === PTF.key && P2.T.spec().player.start === 'a1'); await tick();
      // the texts of the mission name its units and places: both reads have landed before the mission is compared with itself
      await until(() => P2.T.unitsIn(P2.T.spec().player.army) && P2.T.unitsIn(P2.T.spec().enemy.army)); await tick();
      P2.T.spec().player.units[0].count = 7; P2.T.spec().title = 'My own title'; P2.T.touch();
      const sig2 = JSON.stringify(P2.T.spec());
      kb('escort').click(); await tick();
      ok(JSON.stringify(P2.T.spec()) === sig2 && !P2.b('sp.kind.ask'), 'the kind already picked: a click does nothing, nothing asked, nothing lost');
      kb('defence').click(); await tick();
      ok(P2.b('sp.kind.ask') && JSON.stringify(P2.T.spec()) === sig2 && P2.b('sp.kind.ask').textContent.includes(L.en['missions.sp.kt.defence']) && tag(P2.b('sp.kind.ask'), 'BUTTON').map(b => b.textContent).join('|') === L.en['missions.sp.kind.change'] + '|' + L.en['missions.sp.kind.keep'],
        'another kind after a change: asked in the page (Change / Keep), nothing changed yet');
      tag(P2.b('sp.kind.ask'), 'BUTTON')[1].click(); await tick();
      ok(!P2.b('sp.kind.ask') && JSON.stringify(P2.T.spec()) === sig2, 'Keep: the mission stays as it was');
      const p0 = P2.T.spec().player.army, e0 = P2.T.spec().enemy.army;
      kb('defence').click(); await tick(); tag(P2.b('sp.kind.ask'), 'BUTTON')[0].click(); await tick();
      await until(() => P2.T.spec().card.kind === 'defence' && P2.T.spec().player.start === 'a1');
      ok(P2.T.spec().card.kind === 'defence' && P2.T.spec().map === PTF.key && P2.T.spec().player.army === p0 && P2.T.spec().enemy.army === e0 && !P2.b('sp.kind.ask') && P2.T.spec().title !== 'My own title',
        'Change: the new kind on the same map with the same armies ' + JSON.stringify([P2.T.spec().card.kind, P2.T.spec().map, P2.T.spec().player.army, P2.T.spec().enemy.army]));

      // 3. a new goal goes after the last must-win goal, before the bonus goals
      const P3g = pg(apiS); await until(() => P3g.b('sp.kind.assault')); P3g.T.go(3); await until(() => P3g.b('sp.ob.add'));
      const o3 = P3g.T.spec().objectives; o3.push({ id: 'bonus_x', type: 'survive', minutes: 2, primary: false, text: 'Bonus' });
      const n3 = o3.length, ids3 = o3.map(o => o.id), lastP = o3.map(o => o.primary !== false).lastIndexOf(true), lastId = o3[lastP].id;
      tag(P3g.b('sp.ob.add'), 'BUTTON')[0].click(); await tick();
      const o3b = P3g.T.spec().objectives, ni = o3b.findIndex(o => !ids3.includes(o.id));
      ok(o3b.length === n3 + 1 && ni === lastP + 1 && o3b[ni].after === lastId && o3b[ni].primary !== false && o3b[o3b.length - 1].id === 'bonus_x',
        'a new goal: after the last must-win goal (starts after it), before the bonus goal ' + JSON.stringify(o3b.map(o => [o.id, o.after || '', o.primary === false ? 'bonus' : 'must'])));

      // 5. a mod with no mod.info: a warning (Ready, with 1 warning) that says what to do, not a refusal
      const P5 = pg(apiS, { mod: bare }); await until(() => P5.b('sp.kind.assault')); await until(() => P5.box.calls.some(c => /sp\/units\?army=ger/.test(c[0])));
      P5.T.go(5); await tick(); P5.btn('missions.sp.preview').click();
      await until(() => attrIn(P5.b('sp.chk.out'), 'data-ready').length);
      const rd = attrIn(P5.b('sp.chk.out'), 'data-ready')[0], nm = attrIn(P5.b('sp.chk.out'), 'data-nomodinfo')[0];
      ok(rd && rd.getAttribute('data-ready') === '1' && rd.className !== 'ok' && /Ready, with 1 warning/.test(rd.textContent) && nm && nm.textContent.includes(L.en['missions.sp.nomodinfo']) && nm.textContent.includes(L.en['missions.sp.newmod'])
        && tag(nm, 'BUTTON').length === 1 && !P5.btn('missions.sp.write').disabled,
        'no mod.info: "Ready, with 1 warning", the warning says what to do (Make a new mod), Write stays on ' + (rd || {}).textContent + ' | ' + (nm || {}).textContent);

      // 7. Remove on a mission that is already removed (a list read before): "already removed", the row goes, nothing touched
      const b7 = snap(spMod), P7 = pg(apiS); await until(() => P7.b('sp.kind.assault')); await until(() => P7.box.calls.some(c => /sp\/units\?army=ger/.test(c[0])));
      P7.T.go(5); await tick();
      P7.btn('missions.sp.preview').click(); await until(() => P7.btn('missions.sp.write') && !P7.btn('missions.sp.write').disabled);
      P7.box.confirmAnswer = true; P7.btn('missions.sp.write').click(); await until(() => P7.b('sp.chk.out').textContent.includes(L.en['missions.sp.play.h']), 2000);
      const rm7 = P => tag(P.b('sp.mine'), 'BUTTON').find(b => b.textContent === L.en['missions.sp.rm']);
      await until(() => rm7(P7));
      const P7b = pg(apiS); P7b.box.confirmAnswer = true; await until(() => P7b.b('sp.mine') && rm7(P7b));
      rm7(P7).click(); await until(() => P7.b('sp.msg').textContent.includes(head('missions.sp.rm.done')));
      const a7 = snap(spMod); rm7(P7b).click(); await until(() => P7b.b('sp.msg').textContent.includes(L.en['missions.sp.c.SP_GONE']));
      ok(a7 === b7 && snap(spMod) === b7 && P7b.b('sp.msg').textContent.includes(L.en['missions.sp.c.SP_GONE']) && !/SPMIS_|SP_GONE/.test(P7b.b('sp.msg').textContent), 'the second Remove: "already removed" in plain words, the mod untouched ' + P7b.b('sp.msg').textContent);
      await until(() => !rm7(P7b));
      ok(!rm7(P7b) && P7b.b('sp.mine').textContent.includes(L.en['missions.sp.mine.none']), 'the second Remove: the row leaves the list');
      const g7 = await R['POST /api/x/missions/sp/remove'](null, { mod: spMod, mission: 'never_was_there' }, sctx);
      ok(g7 && !g7.ok && g7.refusal && g7.refusal.code === 'SP_GONE', 'sp remove: a mission with no folder in the mod is SP_GONE ' + JSON.stringify(g7 && g7.refusal));

      // 9. escort: the enemy patrols and ambush are on the way between your start and the destination, never behind either end
      const PTE = { key: 'map/single/03_mp/03_road', places: [['a1', 0, 0], ['a2', 400, 0], ['behind', 0, -1500], ['near', 100, 700], ['mid', -100, 1500], ['late', 50, 2300], ['b1', 0, 3000], ['b2', 400, 3000], ['beyond', 0, 4200], ['far', 100, 5400], ['aside', 2600, 1500]].map(([n, x, y]) => ({ name: n, kind: 'point', x, y, lab: XS.labelOf(n, 'point') })) };
      const P9 = pg((u, b) => (u.startsWith('/api/x/missions/sp/places') && u.includes('03_road') ? Promise.resolve(PTE) : apiS(u, b)));
      await until(() => P9.b('sp.kind.escort')); await until(() => P9.box.calls.some(c => /sp\/units\?army=ger/.test(c[0])));
      tag(P9.b('sp.kind.escort'), 'BUTTON')[0].click(); await tick();
      P9.T.setMap(PTE.key); await until(() => P9.T.spec().player.start === 'a1' && P9.T.escortLine()); await tick();
      const s9e = P9.T.spec(), to9 = s9e.objectives.find(o => o.type === 'escort').to;
      const stops = () => [].concat(...(s9e.enemy.patrols || []).map(g => g.route), (s9e.enemy.defenders || []).map(g => g.at), s9e.objectives.filter(o => o.type !== 'escort').map(o => o.zone).filter(v => v != null));
      const offWay = () => stops().filter(v => { const r = P9.T.routeT(v); return !r || r.t < 0 || r.t > 1.02 || r.off > 0.5; });
      ok(to9 !== 'a1' && to9 !== 'a2' && (s9e.enemy.patrols || []).length && !offWay().length && !stops().some(v => ['behind', 'beyond', 'far', 'aside', 'a1', 'a2'].includes(v)),
        'escort on another map: every patrol stop, ambush and side goal lies between the start and the destination ' + JSON.stringify([s9e.player.start, to9, stops(), offWay()]));
      P9.T.go(2); await until(() => P9.b('sp.ep.add')); const np = s9e.enemy.patrols.length;
      tag(P9.b('sp.ep.add'), 'BUTTON')[0].click(); await tick();
      const add9 = s9e.enemy.patrols[np];
      ok(s9e.enemy.patrols.length === np + 1 && add9.route.length === 2 && add9.route.every(v => { const r = P9.T.routeT(v); return r && r.t > 0 && r.t <= 1.02 && r.off <= 0.5; }) && !offWay().length,
        'escort: an added patrol walks the way between the start and the destination, not beyond ' + JSON.stringify(add9 && add9.route));
      const far9 = P9.T.routeT('beyond'), back9 = P9.T.routeT('behind');
      ok(far9 && far9.t > 1.02 && back9 && back9.t < 0, 'the route measure: "beyond" is past the destination, "behind" is before the start ' + JSON.stringify([far9, back9]));

      // 13. the folded page: one line per group, the open one with its controls; the short summary with Show all
      FOLD = true; const PFo = pg(apiS); FOLD = false; await until(() => PFo.b('sp.kind.assault')); await until(() => PFo.box.calls.some(c => /sp\/units\?army=ger/.test(c[0])));
      PFo.T.go(2); await until(() => PFo.b('sp.ed.0'));
      const sumN = () => all(PFo.b('sp.sum'), c => c.tagName === 'LI').length;
      const short13 = sumN(), sa = attrIn(PFo.b('sp.sum'), 'data-sumall')[0];
      ok(sa && sa.getAttribute('data-sumall') === '0' && sa.textContent === L.en['missions.sp.sum.all'], 'side summary: short, with Show all ' + short13);
      sa.click(); await tick();
      ok(attrIn(PFo.b('sp.sum'), 'data-sumall')[0].getAttribute('data-sumall') === '1' && PFo.b('sp.sum').textContent.length > 0, 'Show all: the full summary');
      const nD = PFo.T.spec().enemy.defenders.length;
      if (nD > 1) {
        const r1 = PFo.b('sp.ed.1');
        ok(attrIn(r1, 'data-fold').length === 1 && !tag(r1, 'SELECT').length && tag(r1, 'BUTTON').some(b => b.textContent === L.en['missions.sp.rowopen']) && tag(PFo.b('sp.ed.0'), 'SELECT').length && attrIn(PFo.b('sp.ed.0'), 'data-range').length === 1,
          'unit rows: the open one has its controls and the count range, the others are one line with Open');
        tag(r1, 'BUTTON').find(b => b.textContent === L.en['missions.sp.rowopen']).click(); await tick();
        ok(tag(PFo.b('sp.ed.1'), 'SELECT').length && attrIn(PFo.b('sp.ed.0'), 'data-fold').length === 1, 'Open: that row opens, the other folds');
      }
    }
    // no game folder yet: nothing that needs it is asked; the plain line with its button; set later, the card reads then
    const SGm = { game: {} }, PN = page('en', apiS, { mod: spMod, game: SGm.game }); PN.scr.focus(); const bN = id => all(PN.rootEl, c => c.dataset && c.dataset.blk === id)[0];
    await until(() => bN('sp.kind.assault')); await tick(); await tick();
    const needG = () => PN.box.calls.filter(c => /\/sp\/(maps|places|units|mods)\b/.test(c[0])).length;
    ok(needG() === 0 && !bN('sp.nogame'), 'the game folder not heard of yet: kinds shown, no maps, places or units asked');
    PN.box.S.game = { dir: '', tried: [] }; PN.scr.refresh(); await tick();
    const nrT = L.en['missions.sp.noread'], cntNR = () => PN.rootEl.textContent.split(nrT.slice(1)).length - 1;
    ok(needG() === 0 && bN('sp.nogame') && bN('sp.nogame').textContent.toLowerCase().includes(nrT) && tag(bN('sp.nogame'), 'BUTTON')[0].textContent === L.en['missions.sp.nogame.go'], 'no game folder: the plain line and Open Settings, nothing asked that would be refused');
    ok(cntNR() === 1 && !bN('sp.kind.assault') && !bN('sp.reading') && bN('sp.sum').hidden && !PN.rootEl.textContent.includes(L.en['missions.sp.wait.places'].slice(0, 20)) && tag(bN('sp.nav'), 'BUTTON').every(b => b.disabled),
      'no game folder: "not read: game folder not set" is said once, no step, no summary, no "Reading the places", Back and Next off ' + cntNR());
    tag(bN('sp.nogame'), 'BUTTON')[0].click(); ok(PN.box.shows.pop() === 'settings', 'Open Settings opens Settings');
    PN.box.S.game = { dir: SPG }; PN.scr.refresh(); await until(() => needG() >= 3);
    ok(PN.box.calls.some(c => c[0].startsWith('/api/x/missions/sp/maps')) && PN.box.calls.some(c => c[0].startsWith('/api/x/missions/sp/units')) && !bN('sp.nogame'), 'the game folder set: the maps and units are read then, the line gone');
    // the kinds are asked once (focus and refresh together), step 1 does not wait for units or places that never answer
    const slowApi = (u, b) => (/\/sp\/(units|places|maps)\b/.test(u) ? new Promise(() => {}) : apiS(u, b));
    const PK = page('en', slowApi, { mod: spMod }); PK.scr.focus(); PK.scr.refresh(); PK.scr.refresh(); const bK = id => all(PK.rootEl, c => c.dataset && c.dataset.blk === id)[0];
    await until(() => bK('sp.kind.assault'));
    ok(bK('sp.kind.assault') && PK.box.calls.filter(c => c[0] === '/api/x/missions/sp/start').length <= 1 && PK.box.calls.filter(c => /\/sp\/units\?army=usa/.test(c[0])).length === 1, 'step 1 shows while units and places are still read; the kinds and each army asked once');
    PK.scr.sp._t.go(2); await tick();
    ok(bK('sp.reading') && bK('sp.reading').textContent === L.en['missions.sp.wait.read'], 'step 3 while the units are read: says what is read and that a large mod takes up to a minute');
    // the units of an army are read once per game folder and mod
    const nU = (await XS.heavy('stats', {})).units, u1 = await R['GET /api/x/missions/sp/units'](Q('army=usa&mod=' + encodeURIComponent(spMod)), null, sctx), u2 = await R['GET /api/x/missions/sp/units'](Q('army=usa&mod=' + encodeURIComponent(spMod)), null, sctx);
    ok(u1.soldiers.length && JSON.stringify(u1) === JSON.stringify(u2) && (await XS.heavy('stats', {})).units === nU, 'units: kept per game folder and mod (in the reader thread)');
    // -- item 1: sp/start answers from the game alone, never after the mine scan or a whole-mod read
    { let mapsDone = false; const mp = R['GET /api/x/missions/sp/maps'](Q('mod=' + encodeURIComponent(spMod)), null, sctx).then(() => { mapsDone = true; });
      const st1 = await R['GET /api/x/missions/sp/start'](Q(''), null, sctx); const early = !mapsDone; await mp;
      ok(st1.templates && st1.templates.length && early, 'sp/start answers while the maps are still read (in the reader thread)'); }
    const mineHang = (u, b) => (/\/sp\/mine\b/.test(u) ? new Promise(() => {}) : apiS(u, b));
    const PM = page('en', mineHang, { mod: spMod }); PM.scr.focus(); const bM = id => all(PM.rootEl, c => c.dataset && c.dataset.blk === id)[0];
    await until(() => bM('sp.kind.assault')); await tick();
    const ci = k => PM.box.calls.findIndex(c => c[0].startsWith('/api/x/missions/sp/' + k));
    ok(bM('sp.kind.assault') && ci('start') >= 0 && ci('mine') > ci('start') && attrIn(bM('sp.mine'), 'data-minewait').length === 1 && bM('sp.mine').textContent.includes(L.en['missions.sp.wait.mine']),
      'first open: the kinds show while My generated missions is still read (asked after sp/start), with its own wait line');
    ok(/minute/.test(L.en['missions.sp.wait.read']) && !/half a minute/.test(L.en['missions.sp.wait.read']), 'the read wait line gives a true estimate (up to a minute on a large mod)');
    // -- item 2: no units at the start said at once; a missing mod folder its own sentence, step 6 says it before Preview
    PM.scr.sp._t.spec().player.units = []; PM.scr.sp._t.go(2); await tick();
    ok(bM('sp.pu.none') && bM('sp.pu.none').textContent === L.en['missions.sp.pu.none'], 'step 3: no units said at once');
    const goneDir = path.join(SPG, 'mods', 'gone_mod');
    const PG = page('en', apiS, { mod: goneDir }); PG.scr.focus(); const bG = id => all(PG.rootEl, c => c.dataset && c.dataset.blk === id)[0];
    await until(() => bG('sp.kind.assault')); PG.scr.sp._t.go(2); await until(() => bG('sp.modgone'));
    const gT = L.en['missions.sp.modgone'].replace('{name}', 'gone_mod');
    ok(bG('sp.modgone') && bG('sp.modgone').textContent.includes(gT) && bG('sp.modgone').textContent.includes(L.en['missions.sp.modgone.next']) && !bG('sp.modgone').textContent.includes(L.en['missions.sp.err.next']),
      'a missing mod folder: its own sentence and next step on the steps, not Check the game folder ' + (bG('sp.modgone') && bG('sp.modgone').textContent));
    PG.scr.sp._t.go(5); await tick();
    const pvG = tag(PG.rootEl, 'BUTTON').find(b => b.textContent === L.en['missions.sp.preview']);
    ok(!bG('sp.modgone') && bG('sp.chk.mod') && bG('sp.chk.mod').textContent.includes(gT) && pvG && pvG.disabled, 'step 6: the missing mod folder said before Preview, Preview off');
    // -- where units can walk (spmis: the pather box of the map's default clip). A named place outside it is moved inside and said;
    // a map whose box cannot be read keeps the places and the Preview carries the plain warning; the check after a Write is clean
    {
      const edgeMod = path.join(SPG, 'mods', 'edge_mod'); fs.mkdirSync(edgeMod, { recursive: true }); fs.writeFileSync(path.join(edgeMod, 'mod.info'), '{Mod\r\n\t{Name "edge_mod"}\r\n}\r\n');
      const sE = JSON.parse(JSON.stringify(st.templates[0].spec)); sE.map = EDGE; sE.name = 'edge_assault';
      const pe = await R['POST /api/x/missions/sp/preview'](null, { mod: edgeMod, spec: sE }, sctx), codesE = (pe.notes || []).map(n => n.code);
      ok(pe.ok && codesE.includes('SPMIS_MOVED') && codesE.includes('SPMIS_UNIT_MOVED') && !codesE.includes('SPMIS_AREA_UNKNOWN') && pe.notes.some(n => n.code === 'SPMIS_MOVED' && /"flag_b02" 4000,0 .*moved to 1400,0/.test(n.msg)),
        'walkable area: a named place outside it is moved inside, said in the Preview notes ' + JSON.stringify(pe.refusal || pe.notes));
      const we = await R['POST /api/x/missions/sp/write'](null, { mod: edgeMod, spec: sE }, sctx);
      const miE = we.ok ? fs.readFileSync(path.join(edgeMod, 'resource', 'map', 'single', we.campaign, we.mission, '0.mi'), 'latin1') : '';
      const posE = [...miE.matchAll(/\{Position (-?[\d.]+) (-?[\d.]+)\}/g)].map(m => [+m[1], +m[2]]), outE = posE.filter(p => p[0] < EBOX[0] || p[0] > EBOX[2] || p[1] < EBOX[1] || p[1] > EBOX[3]);
      const twins = posE.filter((p, i) => posE.some((q, j) => j < i && q[0] === p[0] && q[1] === p[1]));
      ok(we.ok && we.check.count === 0 && posE.length >= 25 && !outE.length && !twins.length, 'walkable area: after Write every unit stands inside it, none on another, the check is clean ' + JSON.stringify([we.refusal || we.check, outE, twins]));
      // seeded: a unit put outside by hand: the check of the card's mission fails it, with a plain sentence in 4 languages
      const miP = path.join(edgeMod, 'resource', 'map', 'single', we.campaign, we.mission, '0.mi');
      fs.writeFileSync(miP, miE.replace(/\{Position (-?[\d.]+) (-?[\d.]+)\}/, '{Position 2600 0}'), 'latin1');
      const chk = await XS.heavy('check', { g: { dir: SPG, exe: 'as64' }, mod: edgeMod, m: we.mission });
      ok(chk.list.length === 1 && chk.list[0].code === 'SPMIS_OUTSIDE' && ['en', 'ru', 'uk', 'zh'].every(g => L[g]['missions.sp.c.SPMIS_OUTSIDE'] && L[g]['missions.sp.c.SPMIS_MOVED'] && L[g]['missions.sp.c.SPMIS_UNIT_MOVED'] && L[g]['missions.sp.c.SPMIS_AREA_UNKNOWN']),
        'seeded unit outside the walkable area: the check fails the mission (SPMIS_OUTSIDE) ' + JSON.stringify(chk.list));
      const sB = JSON.parse(JSON.stringify(st.templates[0].spec)); sB.map = BLIND; sB.name = 'blind_assault';
      const pb = await R['POST /api/x/missions/sp/preview'](null, { mod: edgeMod, spec: sB }, sctx);
      ok(pb.ok && pb.notes.some(n => n.code === 'SPMIS_AREA_UNKNOWN' && n.msg.includes(SP.AREA_UNKNOWN)) && !pb.notes.some(n => /MOVED/.test(n.code)), 'walkable area not readable: Preview accepted, the warning is in its notes ' + JSON.stringify(pb.refusal || pb.notes));
      // the page: the warning on the Preview in each language, the Ready line counts it
      for (const lg of ['en', 'ru', 'uk', 'zh']) {
        const PB = page(lg, apiS, { mod: edgeMod }); PB.scr.focus(); const bB = id => all(PB.rootEl, c => c.dataset && c.dataset.blk === id)[0];
        await until(() => bB('sp.kind.assault')); PB.scr.sp._t.setMap(BLIND);
        await until(() => PB.box.calls.some(c => c[0].startsWith('/api/x/missions/sp/places') && c[0].includes('04_quarry'))); await tick(); await tick();
        PB.scr.sp._t.go(5); await tick();
        tag(PB.rootEl, 'BUTTON').find(b => b.textContent === L[lg]['missions.sp.preview']).click();
        await until(() => bB('sp.chk.out') && attrIn(bB('sp.chk.out'), 'data-ready').length);
        const nt = attrIn(bB('sp.chk.out'), 'data-note').filter(e => e.getAttribute('data-note') === 'SPMIS_AREA_UNKNOWN'), rd = attrIn(bB('sp.chk.out'), 'data-ready')[0];
        ok(nt.length === 1 && nt[0].textContent === L[lg]['missions.sp.c.SPMIS_AREA_UNKNOWN'] && rd && +rd.getAttribute('data-ready') >= 1 && (lg !== 'en' || /could not read where units can walk on this map; positions were not checked/i.test(nt[0].textContent)),
          'Preview (' + lg + '): the walkable-area warning shown once, counted on the Ready line ' + (bB('sp.chk.out') && bB('sp.chk.out').textContent.slice(0, 200)));
        if (lg === 'en') { const eB = checkScreen(PB.rootEl); ok(!eB.length, 'blocks with the walkable-area warning:\n  ' + eB.slice(0, 6).join('\n  ')); }
      }
      // -- a mod path that climbs with "..", or a target outside the mod: refused on every route of this page
      const climb = spMod + path.sep + '..' + path.sep + 'bare_mod', climb2 = spMod + '/../..';
      const refused = async (f, m) => { let e = null, r = null; try { r = await f(); } catch (x) { e = x; } ok(e && e.status === 400 && e.message === 'missions.e.modpath', m + ' ' + (e ? e.message : JSON.stringify(r).slice(0, 200))); };
      const beforeB = snap(bare), beforeG = fs.readdirSync(SPG).sort().join();
      for (const mp of [climb, climb2]) {
        await refused(() => R['POST /api/x/missions/sp/preview'](null, { mod: mp, spec: st.templates[0].spec }, sctx), 'sp preview: a mod path with .. refused');
        await refused(() => R['POST /api/x/missions/sp/write'](null, { mod: mp, spec: st.templates[0].spec }, sctx), 'sp write: a mod path with .. refused');
        await refused(() => R['POST /api/x/missions/sp/remove'](null, { mod: mp, mission: 'x' }, sctx), 'sp remove: a mod path with .. refused');
        await refused(() => R['POST /api/x/missions/add'](null, { mod: mp, map: 'map/multi/m1', to: 'battle_zones', write: true }, sctx), 'add a mode: a mod path with .. refused');
        await refused(() => R['POST /api/x/missions/diff'](null, { mod: mp, map: 'map/multi/m1' }, sctx), 'diff: a mod path with .. refused');
        const mn = await R['GET /api/x/missions/sp/mine'](Q('mod=' + encodeURIComponent(mp)), null, sctx), m2 = await R['GET /api/x/missions/mine'](Q('mod=' + encodeURIComponent(mp)), null, sctx);
        ok(mn.missions.length === 0 && m2.maps.length === 0, 'the read routes take a mod path with .. as no mod');
      }
      // an Undo token is tied to its mod: the same token with a climbing path is refused too
      await refused(() => R['POST /api/x/missions/sp/undo'](null, { mod: climb, token: we.undo }, sctx), 'sp undo: a mod path with .. refused');
      ok(snap(bare) === beforeB && fs.readdirSync(SPG).sort().join() === beforeG, 'a mod path with ..: nothing written in the folder it points at');
      ok(XS.inMod(spMod, 'resource/map/a.mi') && !XS.inMod(spMod, '../sp_mod2/a.mi') && !XS.inMod(spMod, '..') && !XS.inMod(spMod, 'resource/../../x') && !XS.inMod(spMod, path.resolve(spMod, 'x')) && !XS.inMod(spMod, '') && !XS.inMod(spMod, '.')
        && !XS.inMod(spMod, '../sp_mod_other') && XS.inMod(spMod + path.sep, 'a'), 'inMod: the resolved file path must start with the mod folder and a separator (a sibling folder with the same prefix is outside)');
      ok(['en', 'ru', 'uk', 'zh'].every(g => L[g]['missions.e.modpath'] && L[g]['missions.sp.c.SP_OUTSIDE_MOD'] && L[g]['missions.sp.map.several']), 'the new refusals and the several-maps line in 4 languages');

      // -- the map box: a typed name with Enter or on leaving the box
      const PE = page('en', apiS, { mod: edgeMod }); PE.scr.focus(); const bE = id => all(PE.rootEl, c => c.dataset && c.dataset.blk === id)[0];
      await until(() => bE('sp.kind.assault')); PE.scr.sp._t.go(1);
      await until(() => PE.scr.sp._t.mapHits('ridge').labels.length);
      const mapInp = () => all(PE.rootEl, c => c.getAttribute && c.getAttribute('data-sk') === 'missions.sp.map')[0].querySelector('input');
      const noteE = () => bE('sp.map.find').textContent, map0 = PE.scr.sp._t.spec().map;
      let i1 = mapInp(); i1.value = 'zzqq'; i1.fire('keydown', { key: 'Enter' }); await tick(); await until(() => noteE().includes(L.en['missions.sp.nohit'].replace('{q}', 'zzqq')), 60);
      ok(PE.scr.sp._t.spec().map === map0 && noteE().includes(L.en['missions.sp.nohit'].replace('{q}', 'zzqq')), 'map box, Enter with no match: the no-hit line, the map stays ' + noteE());
      i1 = mapInp(); i1.value = 'r'; i1.fire('keydown', { key: 'Enter' }); i1._sk.flush(); await tick();
      ok(PE.scr.sp._t.mapTyped('r').length > 1 && PE.scr.sp._t.spec().map === map0 && noteE().includes(L.en['missions.sp.map.several'].replace('{q}', 'r')) && i1._sk.isOpen() && i1._sk.items().some(x => x.k === 'index'),
        'map box, Enter with several matches: the list opens and says so, the map stays ' + JSON.stringify([PE.scr.sp._t.mapTyped('r'), noteE(), i1._sk.isOpen()]));
      i1 = mapInp(); i1.value = 'Ridge'; i1.fire('keydown', { key: 'Enter' }); await tick();
      ok(PE.scr.sp._t.spec().map === 'map/single/02_other/02_ridge' && mapInp().value === '' && bE('sp.map.cur').textContent.includes('Ridge'), 'map box, Enter with an exact name: that map is selected ' + PE.scr.sp._t.spec().map);
      i1 = mapInp(); i1.value = 'quar'; i1.fire('blur'); await tick();
      ok(PE.scr.sp._t.spec().map === BLIND, 'map box, leaving it with a single match: that map is selected ' + PE.scr.sp._t.spec().map);
      i1 = mapInp(); i1.value = '03_marsh'; i1.fire('keydown', { key: 'Enter' }); await tick();
      ok(PE.scr.sp._t.spec().map === EDGE, 'map box, Enter with the exact folder name: that map is selected ' + PE.scr.sp._t.spec().map);
      i1 = mapInp(); i1.value = 'r'; i1.fire('blur'); await tick(); await until(() => noteE().includes(L.en['missions.sp.map.several'].replace('{q}', 'r')), 60);
      ok(PE.scr.sp._t.spec().map === EDGE && noteE().includes(L.en['missions.sp.map.several'].replace('{q}', 'r')), 'map box, leaving it with several matches: said, the map stays ' + JSON.stringify([PE.scr.sp._t.spec().map, noteE(), PE.scr.sp._t.mapTyped('r')]));
      // a read that lands while the box is in use (places, units, the picture, my missions, mods) draws the step again: the box, the
      // text being typed and its note stay; the maps landing drops the note only (it was about the old list); a draw the user causes makes a new box
      const several = L.en['missions.sp.map.several'].replace('{q}', 'r'), boxA = mapInp(); boxA.value = 'ri'; const pageA = bE('sp.map.cur').textContent;
      PE.scr.sp._t.rdraw(); await tick();
      ok(mapInp() === boxA && boxA.value === 'ri' && noteE().includes(several) && bE('sp.map.cur').textContent === pageA && bE('sp.map.find').all().includes(boxA), 'map box, a read lands: the box, the typed text and the note stay ' + JSON.stringify([mapInp() === boxA, boxA.value, noteE()]));
      boxA.value = 'zzqq'; boxA.fire('keydown', { key: 'Enter' }); await tick(); await until(() => noteE().includes(L.en['missions.sp.nohit'].replace('{q}', 'zzqq')), 60);
      ok(noteE().includes(L.en['missions.sp.nohit'].replace('{q}', 'zzqq')) && PE.scr.sp._t.spec().map === EDGE, 'map box, the kept box still works: Enter with no match says so ' + noteE());
      PE.scr.sp._t.rdraw(true); await tick();
      ok(mapInp() === boxA && boxA.value === 'zzqq' && !noteE().includes('zzqq'), 'map box, the maps land: the typed text stays, the note about the old list goes ' + noteE());
      PE.scr.sp._t.go(1); await tick();
      ok(mapInp() !== boxA && mapInp().value === '', 'map box, a draw the user causes: a new empty box, as before');
      // the same over a real late read: the places of a newly picked map land after the next text is typed
      { let rel = null; const PL = page('en', (u, b) => (u.startsWith('/api/x/missions/sp/places') && u.includes('02_ridge') ? new Promise(r => { rel = r; }).then(() => apiS(u, b)) : apiS(u, b)), { mod: edgeMod }); PL.scr.focus();
        const bL = id => all(PL.rootEl, c => c.dataset && c.dataset.blk === id)[0], inL = () => all(PL.rootEl, c => c.getAttribute && c.getAttribute('data-sk') === 'missions.sp.map')[0].querySelector('input');
        await until(() => bL('sp.kind.assault')); PL.scr.sp._t.go(1); await until(() => PL.scr.sp._t.mapHits('ridge').labels.length);
        if (PL.scr.sp._t.spec().map === 'map/single/02_other/02_ridge') { PL.scr.sp._t.setMap(EDGE); await until(() => PL.scr.sp._t.placesKey() === EDGE); rel = null; }
        let iL = inL(); iL.value = 'Ridge'; iL.fire('keydown', { key: 'Enter' }); await tick(); await until(() => !!rel, 200);
        iL = inL(); iL.value = 'r'; iL.fire('blur'); await tick();
        const had = bL('sp.map.find').textContent.includes(several); rel(); await until(() => PL.scr.sp._t.placesKey() === 'map/single/02_other/02_ridge'); await tick();
        ok(had && inL() === iL && iL.value === 'r' && bL('sp.map.find').textContent.includes(several) && PL.scr.sp._t.spec().map === 'map/single/02_other/02_ridge', 'map box, the places of the picked map land late: the next text and its note are still there ' + JSON.stringify([had, inL() === iL, iL.value, bL('sp.map.find').textContent])); }
      i1 = mapInp(); i1.value = ''; i1.fire('keydown', { key: 'Enter' }); i1.fire('blur'); await tick();
      ok(PE.scr.sp._t.spec().map === EDGE, 'map box, Enter on an empty box: nothing happens');
      const eE = checkScreen(PE.rootEl); ok(!eE.length, 'blocks with the map box notes:\n  ' + eE.slice(0, 6).join('\n  '));
    }
    const prE = checkScreen(P2.rootEl).concat(checkScreen(PM.rootEl), checkScreen(PG.rootEl), checkScreen(PZ.rootEl), checkScreen(PU.rootEl), checkScreen(PN.rootEl), checkScreen(PK.rootEl));
    ok(!prE.length, 'blocks with Pick on the map, zh and undo gone:\n  ' + prE.slice(0, 10).join('\n  '));
  }
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crash ' + e.stack); process.exit(1); });
