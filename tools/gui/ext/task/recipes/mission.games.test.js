// recipe "mission" games test: node mission.games.test.js <scratch>. A made-up Gates of Hell install (call_to_arms.exe, one map 2v2_zz
// with battle_zones and ammunition .info/.mi, three mode cards in the CRLF form of the game: battle_zones with {enableBots} and
// scoreFinal, ammunition without bots but with teams, alliances and preset rows, cooperative with {friendlyfire 1} and no scoreFinal):
// goh is in games with no na; on GoH the mode pick, a new mode, the card keys, teams, alliances, lobby money start and finish and the
// editor are asked, the other money keys and units stay AS2 only; values read the card; a change sets the keys the card has, adds the
// ones it lacks (every card is read with them) and adds or removes switches, written through lib/modwrite (restore point first) and
// read back; a mode the map lacks of the same class is copied (battle_zones from armored_warfare on a second map 2v2_yy); a new mode of
// your own is the copy of a mode the map has under a new name, with its lobby name; money start and finish go into the preset rows,
// alliances into the shared alliances file; one of another kind, a card without money rows and no GoH folder are refused; check reads
// the Missions page facts. The game files stay byte for byte. Nothing here runs the game: the effects in game are [T].
// Author: Imperator_Aug (ARSENAL, ia-goh-mission)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), crypto = require('crypto');
const base0 = process.env.ARSENAL_TMP || os.tmpdir();
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(base0, 'task-mission-games-')));
fs.mkdirSync(scratch, { recursive: true });
const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile');
const R = require('./mission.recipe'), L = require('./mission.lang'), MG = require('./mission.goh');
const MW = require('../../../../lib/modwrite');
const DASH = new RegExp('[' + String.fromCharCode(0x2010) + '-' + String.fromCharCode(0x2015) + ']');
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok ' + name); };
const v = x => ({ src: 'value', value: x });
const MAP = 'map/multi/2v2_zz', CARDS = 'resource/set/multiplayer/games/';
const BZ = '{game\r\n\t{order 0}\r\n\t{settings\r\n\t\t{fogOfWar\tfog_realistic}\r\n\t\t{impregnableTimeout\t10}\t; sec\r\n\t\t{floraRespawn\t0}\r\n\t\t{preparationTime\t15}\r\n\t\t{scoreFinal\t1000}\r\n\t\t{enableBots}\r\n\t\t{friendlyFire}\r\n\t\t{showPiercing}\r\n\t\t{showDamageReports}\r\n\t}\r\n\t{ranked {enabled} {order 5}}\r\n}\r\n';
const hashDir = d => { const h = crypto.createHash('sha1'); (function walk(x) { for (const e of fs.readdirSync(x, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) { const p = path.join(x, e.name); if (e.isDirectory()) walk(p); else h.update(p + '\0').update(fs.readFileSync(p)); } })(d); return h.digest('hex'); };

(async () => {
  const g = fs.mkdtempSync(path.join(scratch, 'goh-')), mod = path.join(scratch, 'mods', 'mission_goh');
  const G = (k, s) => w(path.join(g, ...k.split('/')), s);
  G('binaries/x64/call_to_arms.exe', 'x');
  G('resource/' + MAP + '/map.net', Buffer.from([0x05, 0x02, 0, 0]));
  for (const m of ['battle_zones', 'ammunition']) G('resource/' + MAP + '/' + m + '.info', '{game\r\n  {maxPlayers 4}\r\n  {texMod camo}\r\n}\r\n');
  G('resource/' + MAP + '/battle_zones.mi', '{mission\r\n {visor "MapPoint"}\r\n {visor "MapPoint"}\r\n}\r\n');
  G('resource/' + MAP + '/ammunition.mi', '{mission\r\n}\r\n');
  G(CARDS + 'battle_zones.set', BZ);
  G(CARDS + 'ammunition.set', '{game\r\n\t{order 10}\r\n\t{settings\r\n\t\t{fogOfWar\tfog_realistic}\r\n\t\t{scoreFinal 300}\r\n\t\t{preparationTime 15}\r\n\t}\r\n\t{teamSettings\r\n\t\t{teamsMode normal}\r\n\t\t{armySelectionMode alliance}\r\n\t\t{teams\r\n\t\t\t{"a"}\r\n\t\t\t{"b"}\r\n\t\t}\r\n\t\t{alliances\r\n\t\t\t(include "presets/alliances_generic.inc")\r\n\t\t}\r\n\t}\r\n\t(include "presets/presets_ammo.inc")\r\n}\r\n');
  G(CARDS + 'presets/presets_ammo.inc', '; made up\r\n(include "preset_x.inc")\r\n');
  G(CARDS + 'presets/preset_x.inc', '(define "standard_all"\r\n)\r\n{presets\r\n\t{"s:early_standard_100"\r\n\t\t("standard_all"\t\t\tstart(200) finish(4500) doctrine(200) cp(0:100,900:150))\r\n\t}\r\n\t;{"s:old" ("standard_all" start(1) finish(2))}\r\n\t{"c:early_custom_100"\r\n\t\t("custom_all"\t\t\tstart_a(500) finish_a(1800) start_b(500) finish_b(1800))\r\n\t}\r\n}\r\n');
  G(CARDS + 'presets/alliances_generic.inc', '{"Allies"\r\n\t{title "mp/alliance/allies"}\r\n\t{armies "rus"}\r\n\t{armies "usa"}\r\n\t{icon "/interface/pages/multi/flag_allies"}\r\n}\r\n{"Axis"\r\n\t{title "mp/alliance/axis"}\r\n\t{armies "ger"}\r\n\t{icon "/interface/pages/multi/flag_axis"}\r\n}');
  G(CARDS + 'cooperative.set', '{game\r\n\t{order 100}\r\n\t{settings\r\n\t\t{friendlyfire 1}\r\n\t\t{floraRespawn 0}\r\n\t}\r\n}\r\n');
  // a second map with armored_warfare only: battle_zones (same engine class) can be added to it as a copy
  G('resource/map/multi/2v2_yy/map.net', Buffer.from([0x05, 0x02, 0, 0]));
  G('resource/map/multi/2v2_yy/armored_warfare.info', '{game\r\n  {maxPlayers 6}\r\n}\r\n');
  G('resource/map/multi/2v2_yy/armored_warfare.mi', '{mission\r\n {visor "MapPoint"}\r\n}\r\n');
  w(path.join(mod, 'mod.info'), '{Mod {Name "m"}}\r\n');
  const gameHash = hashDir(g);
  const ctx = kit.ctxFor(scratch, { game: 'goh', gohDir: g });
  const lc = Object.assign({}, ctx, { mod, task: { id: 'goh', kind: 'goh', dir: g } });
  const mk = (answers, verb) => {
    const d = D.newId('mission'); fs.mkdirSync(D.stageDir(ctx, d), { recursive: true });
    return D.save(ctx, { id: d, recipe: 'mission', verb: verb || 'change', game: 'goh', mod, base: { id: MAP, name: 'ZZ' }, answers, kept: [], state: 'open' });
  };
  const run = d => CP.compile(ctx, d, { mission: R });
  const refusedK = async (d, key) => { let e = null; try { await run(d); } catch (x) { e = x; } assert.equal(e && e.key, key, e && e.message); return e; };

  await t('games: goh in, no na; GoH rows in four languages without dashes; GoH asks its own short list, AS2 keeps its questions', () => {
    assert.deepEqual(R.games, ['as64', 'mowas2', 'goh']); assert.ok(!R.na || !R.na.goh);
    assert.ok(!L.some(r => r[0] === 'task.mission.na.goh'));
    const keys = ['task.mission.q.goh_mode', 'task.mission.h.goh_mode', 'task.mission.q.goh_score', 'task.mission.h.goh_score', 'task.mission.q.goh_prep', 'task.mission.h.goh_prep',
      'task.mission.q.goh_duration', 'task.mission.h.goh_duration', 'task.mission.e.nogoh', 'task.mission.e.gohmode', 'task.mission.e.gohnew', 'task.mission.e.goheco'].concat(MG.CARDS.map(m => 'task.mission.v.goh_mode.' + m));
    for (const k of keys) { const row = L.find(r => r[0] === k); assert.ok(row && row.length === 5 && row.slice(1).every(s => s && !DASH.test(s) && !/\bdear(er)?\b/i.test(s)), k); }
    const Q = {}; for (const gr of R.groups) for (const q of gr.q) Q[q.id] = q;
    for (const id of ['goh_mode', 'goh_score', 'goh_prep', 'goh_duration']) assert.deepEqual(Q[id].when.$game, ['goh'], id);
    for (const id of ['bots', 'friendly', 'showhits', 'impregnable', 'flora', 'card_order', 'editor', 'newmode', 'with_mode', 'mode_title', 'fog', 'eco_on', 'eco_preset', 'money_start',
      'money_finish', 'team_a_title', 'team_b_ai', 'alliance_axis', 'alliance_allies', 'armies', 'teams_mode', 'equalize', 'card_ranked', 'card_minplayers', 'card_maxplayers',
      'unitlevel', 'lobby_options', 'veterancy', 'resource_amount']) assert.ok(!Q[id].when || !Q[id].when.$game, id);
    for (const id of ['from', 'to', 'from_mode', 'prep', 'score', 'duration', 'units', 'unitset', 'command_points', 'budget_mode', 'money_min', 'payback_cp']) assert.deepEqual(Q[id].when.$game, ['as64', 'mowas2'], id);
    // AS2 conditions kept beside the game
    assert.equal(Q.to.when.newmode, false); assert.deepEqual(Q.prep.when.to, ['combat', 'battle_zones']); assert.equal(Q.money_min.when.eco_preset, 'custom');
    assert.ok(typeof R.routes['POST /api/x/task/r/mission/goh'] === 'function');
  });
  await t('values read the GoH card of the first mode the map has', async () => {
    const vs = await R.values(lc, { id: MAP, name: 'ZZ' }, { game: 'goh', verb: 'change' });
    assert.equal(vs.goh_mode, 'battle_zones'); assert.equal(vs.goh_score, 1000); assert.equal(vs.goh_prep, 15); assert.equal(vs.impregnable, 10);
    assert.equal(vs.card_order, 0); assert.equal(vs.bots, true); assert.equal(vs.friendly, true); assert.equal(vs.showhits, true); assert.equal(vs.flora, false);
    const va = await R.values({ gameId: 'as64', game: () => null }, null, { verb: 'change' });
    assert.ok(!('goh_mode' in va), 'AS2 values have no GoH mode');
  });
  await t('change: rows only for keys the card has, switches under {settings}; written through modwrite with a restore point', async () => {
    const d = mk({ goh_mode: v('battle_zones'), goh_score: v(1500), goh_prep: v(30), bots: v(false), showhits: v(false), flora: v(true), impregnable: v(10) });
    const r = await run(d);
    assert.ok(!r.gen); assert.equal(r.calls.length, 1);
    assert.deepEqual(r.calls[0].body, { mode: 'battle_zones', rows: [
      { path: 'game/settings/scoreFinal', op: 'set', value: '1500' }, { path: 'game/settings/preparationTime', op: 'set', value: '30' },
      { path: 'game/settings/floraRespawn', op: 'set', value: '1' }, { path: 'game/settings/enableBots', op: 'del' },
      { path: 'game/settings/showPiercing', op: 'del' }, { path: 'game/settings/showDamageReports', op: 'del' }] });
    assert.equal(r.result, 'multi/2v2_zz:battle_zones');
    const p = await CP.write(ctx, d, { mission: R }); assert.ok(p.written, JSON.stringify(p.errors));
    const card = fs.readFileSync(path.join(mod, ...(CARDS + 'battle_zones.set').split('/')), 'latin1');
    assert.ok(/\{scoreFinal\t1500\}/.test(card) && /\{preparationTime\t30\}/.test(card) && /\{floraRespawn\t1\}/.test(card), card);
    assert.ok(!/enableBots|showPiercing|showDamageReports/.test(card) && /\{friendlyFire\}/.test(card) && /\{ranked \{enabled\} \{order 5\}\}/.test(card), card);
    assert.ok(!/\r(?!\n)|[^\r]\n/.test(card), 'CRLF kept');
    const cv = MG.cardVals(Buffer.from(card, 'latin1')); assert.equal(cv.goh_score, 1500); assert.equal(cv.bots, false); assert.equal(cv.card_order, 0);
    const rr = MW.restoreRoot(mod); assert.ok(fs.existsSync(rr) && fs.readdirSync(rr).length > 0, 'restore points made');
    assert.equal(hashDir(g), gameHash, 'the game files are unchanged');
  });
  await t('a key the card lacks is added (every card is read with it, a note says so); a switch it lacks is added; the lower case cooperative switch is read', async () => {
    const vs = MG.cardVals(fs.readFileSync(path.join(g, ...(CARDS + 'cooperative.set').split('/'))));
    assert.equal(vs.friendly, true); assert.equal(vs.goh_score, null);
    const r = await run(mk({ goh_mode: v('ammunition'), goh_score: v(500), impregnable: v(20), bots: v(true), friendly: v(true) }));
    assert.deepEqual(r.calls[0].body.rows, [{ path: 'game/settings/scoreFinal', op: 'set', value: '500' }, { path: 'game/settings/impregnableTimeout', op: 'add', value: '20' },
      { path: 'game/settings/enableBots', op: 'add', value: '' }, { path: 'game/settings/friendlyFire', op: 'add', value: '' }]);
    assert.ok(r.notes.some(x => /Added to the ammunition card.*impregnableTimeout/.test(x)), JSON.stringify(r.notes));
    const r2 = await run(mk({ goh_mode: v('ammunition'), goh_score: v(300) }));
    assert.equal(r2.calls.length, 0); assert.ok(r2.notes.some(x => /Nothing to change/.test(x)));
  });
  await t('refused on GoH: a mode the map lacks, a bad or taken new mode name, a card without money rows, no GoH folder; the route refuses keys and values it does not own', async () => {
    const e = await refusedK(mk({ goh_mode: v('frontlines') }), 'task.mission.e.gohmode');
    assert.equal(e.params.mode, 'frontlines'); assert.equal(e.params.modes, 'battle_zones, ammunition'); assert.ok(/frontlines/.test(e.params.why) && !/missions\.s\./.test(e.params.why), e.params.why);
    let e2 = await refusedK(mk({ goh_mode: v('battle_zones'), newmode: v(true), with_mode: v('Bad Name') }), 'task.mission.e.gohnew'); assert.ok(/small English letters/.test(e2.params.why));
    e2 = await refusedK(mk({ goh_mode: v('battle_zones'), newmode: v(true), with_mode: v('ammunition') }), 'task.mission.e.gohnew'); assert.ok(/already/.test(e2.params.why));
    e2 = await refusedK(mk({ goh_mode: v('battle_zones'), eco_on: v(true), money_start: v(300) }), 'task.mission.e.goheco'); assert.equal(e2.params.mode, 'battle_zones');
    await assert.rejects(run(mk({ goh_mode: v('ammunition'), goh_duration: v(33) })), /Match length/);
    await assert.rejects(run(mk({ goh_mode: v('ammunition'), lobby_options: v('friendlyFire nosuch') })), /nosuch is not a word/);
    let x = null; try { MG.compile({}, { gameDir: null, mod, base: { id: MAP }, value: () => null, answer: () => null }); } catch (y) { x = y; }
    assert.equal(x && x.key, 'task.mission.e.nogoh');
    const rt = R.routes['POST /api/x/task/r/mission/goh'], rc = Object.assign({}, ctx, { gohDir: () => g, curDir: () => g, gameId: () => 'goh' });
    await assert.rejects(rt(null, { mod, mode: 'battle_zones', rows: [{ path: 'game/parameters', op: 'set', value: '"x=1"' }], write: false }, rc), /Not a card setting/);
    await assert.rejects(rt(null, { mod, mode: 'battle_zones', rows: [{ path: 'game/settings/fogOfWar', op: 'set', value: 'fog_maybe' }], write: false }, rc), /Not a value for fogOfWar/);
    await assert.rejects(rt(null, { mod, mode: 'battle_zones', rows: [{ path: 'game/settings/gameDuration', op: 'add', value: '"33 min"' }], write: false }, rc), /Not a value for gameDuration/);
    await assert.rejects(rt(null, { mod, mode: 'combat', rows: [{ path: 'game/order', op: 'set', value: '1' }], write: false }, rc), /Not a Gates of Hell mode card/);
    const dry = await rt(null, { mod, mode: 'ammunition', rows: [{ path: 'game/order', op: 'set', value: '3' }], write: false }, rc);
    assert.deepEqual(dry.files, [CARDS + 'ammunition.set']); assert.ok(!fs.existsSync(path.join(mod, ...(CARDS + 'ammunition.set').split('/'))), 'a dry run writes nothing');
    assert.equal(hashDir(g), gameHash, 'the game files are unchanged');
  });
  await t('check reads the Missions page facts: map points and the card switches', async () => {
    const cards = await R.check({ mod, base: { id: MAP }, game: 'goh', answers: { goh_mode: v('battle_zones') } }, lc);
    assert.ok(/2 map points/.test(cards[0].lines[0]) && /4 players/.test(cards[0].lines[0]), JSON.stringify(cards));
    assert.ok(/bots off/.test(cards[0].lines[1]), 'the mod card (bots off) is read');
    const c2 = await R.check({ mod, base: { id: MAP }, game: 'goh', answers: { goh_mode: v('frontlines') } }, lc);
    assert.equal(c2[0].level, 'warn');
  });
  await t('a mode the map lacks of the same class: battle_zones added to 2v2_yy as a copy of armored_warfare, with the card change, one write', async () => {
    const id = D.newId('mission'); fs.mkdirSync(D.stageDir(ctx, id), { recursive: true });
    const d = D.save(ctx, { id, recipe: 'mission', verb: 'change', game: 'goh', mod, base: { id: 'map/multi/2v2_yy', name: 'YY' }, answers: { goh_mode: v('battle_zones'), goh_score: v(2000) }, kept: [], state: 'open' });
    const r = await run(d);
    const b = r.calls[0].body; assert.deepEqual(b.addMode, { to: 'battle_zones', from: 'armored_warfare' }); assert.equal(b.map, 'map/multi/2v2_yy');
    assert.ok(r.notes.some(x => /armored_warfare/.test(x)), JSON.stringify(r.notes));
    const p = await CP.write(ctx, d, { mission: R }); assert.ok(p.written, JSON.stringify(p.errors));
    const K = path.join(mod, 'resource', 'map', 'multi', '2v2_yy');
    assert.deepEqual(fs.readFileSync(path.join(K, 'battle_zones.mi')), fs.readFileSync(path.join(g, 'resource', 'map', 'multi', '2v2_yy', 'armored_warfare.mi')));
    assert.deepEqual(fs.readFileSync(path.join(K, 'battle_zones.info')), fs.readFileSync(path.join(g, 'resource', 'map', 'multi', '2v2_yy', 'armored_warfare.info')));
    assert.ok(/\{scoreFinal\t2000\}/.test(fs.readFileSync(path.join(mod, ...(CARDS + 'battle_zones.set').split('/')), 'latin1')), 'the card change is written too');
    const f = require('../../missions')._t.factsOf(g, mod, 'map/multi/2v2_yy', [], null, { id: 'goh', exe: 'goh', kind: 'goh', dir: g });
    assert.ok(f.modes.some(m => m.mode === 'battle_zones' && m.flags === 1), 'the Missions page reads it back');
    const rt = R.routes['POST /api/x/task/r/mission/goh'], rc = Object.assign({}, ctx, { gohDir: () => g, curDir: () => g, gameId: () => 'goh' });
    await assert.rejects(rt(null, { mod, mode: 'ammunition', map: 'map/multi/2v2_yy', addMode: { to: 'ammunition' }, write: false }, rc), (e) => e.key === 'task.mission.e.gohmode');
    await assert.rejects(rt(null, { mod, mode: 'ammunition', map: '../x', addMode: { to: 'ammunition' }, write: false }, rc), /Pick the Gates of Hell/);
    assert.equal(hashDir(g), gameHash, 'the game files are unchanged');
  });
  await t('card keys the card lacks, teams, alliances and lobby money: one write, CRLF kept, read back, the game unchanged', async () => {
    const vs = await R.values(lc, { id: MAP, name: 'ZZ' }, { game: 'goh', verb: 'change' });
    assert.deepEqual(vs.alliance_axis, ['ger']); assert.deepEqual(vs.alliance_allies, ['rus', 'usa']);
    const d = mk({ goh_mode: v('ammunition'), fog: v('fog_off'), goh_duration: v(30), lobby_options: v('friendlyFire fogOfWar gameDuration'), veterancy: v('veterans'),
      card_ranked: v(true), equalize: v(true), teams_mode: v('teammatch'), team_b_ai: v(4), team_a_title: v('mp/settings/team#defenders'), card_maxplayers: v(8),
      alliance_axis: v(['ger', 'fin']), eco_on: v(true), eco_preset: v('standard'), money_start: v(300), money_finish: v(5000) });
    const r = await run(d), b = r.calls[0].body, P = x => b.rows.find(y => y.path === x);
    assert.deepEqual(P('game/settings/fogOfWar'), { path: 'game/settings/fogOfWar', op: 'set', value: 'fog_off' });
    assert.deepEqual(P('game/settings/gameDuration'), { path: 'game/settings/gameDuration', op: 'add', value: '"30 min"' });
    assert.equal(P('game/teamSettings/teams/"b"/aiTeamPlayers').value, '4'); assert.equal(P('game/maxPlayers').op, 'add');
    assert.deepEqual(b.allies, { Axis: ['ger', 'fin'] }); assert.deepEqual(b.money, { which: 's', start: 300, finish: 5000, files: [CARDS + 'presets/preset_x.inc'] });
    const p = await CP.write(ctx, d, { mission: R }); assert.ok(p.written, JSON.stringify(p.errors));
    const rd = k => fs.readFileSync(path.join(mod, ...(CARDS + k).split('/')), 'latin1');
    const card = rd('ammunition.set');
    for (const re of [/\{fogOfWar\tfog_off\}/, /\{gameDuration "30 min"\}/, /\{optionsAdvanced friendlyFire fogOfWar gameDuration\}/, /\{veterancyMode veterans\}/, /\{ranked \{enabled\}\}/,
      /\{equalizeTeams\}/, /\{teamsMode teammatch\}/, /\{aiTeamPlayers 4\}/, /\{title "mp\/settings\/team#defenders"\}/, /\{maxPlayers 8\}/]) assert.ok(re.test(card), re + '\n' + card);
    assert.ok(!/\r(?!\n)|[^\r]\n/.test(card), 'CRLF kept');
    const cv = MG.cardVals(Buffer.from(card, 'latin1')); assert.equal(cv.fog, 'fog_off'); assert.equal(cv.duration, 30); assert.equal(cv.ranked, true); assert.equal(cv.team_b.ai, '4');
    const al = rd('presets/alliances_generic.inc'); assert.deepEqual(MG.alliesOf(Buffer.from(al, 'latin1')), { Allies: ['rus', 'usa'], Axis: ['ger', 'fin'] }); assert.ok(!/[^\r]\n/.test(al));
    const pr = rd('presets/preset_x.inc');
    assert.ok(/start\(300\) finish\(5000\) doctrine\(200\)/.test(pr) && /start\(1\) finish\(2\)/.test(pr) && /start_a\(500\) finish_a\(1800\)/.test(pr), pr);
    assert.equal(hashDir(g), gameHash, 'the game files are unchanged');
    const r2 = await run(mk({ goh_mode: v('ammunition'), eco_on: v(true), eco_preset: v('both'), money_start: v(250) }));
    assert.equal(r2.calls[0].body.money.which, 'both');
  });
  await t('a new mode of your own: the picked mode of the map under a new name, its card with the changes and its lobby name', async () => {
    const d = mk({ goh_mode: v('battle_zones'), newmode: v(true), with_mode: v('zz_rush'), mode_title: v('Rush zones'), goh_score: v(700) });
    const r = await run(d), b = r.calls[0].body;
    assert.equal(b.mode, 'zz_rush'); assert.deepEqual(b.addMode, { to: 'zz_rush', from: 'battle_zones', newMode: true }); assert.equal(b.title, 'Rush zones');
    const p = await CP.write(ctx, d, { mission: R }); assert.ok(p.written, JSON.stringify(p.errors));
    const K = path.join(mod, 'resource', 'map', 'multi', '2v2_zz');
    assert.deepEqual(fs.readFileSync(path.join(K, 'zz_rush.mi')), fs.readFileSync(path.join(g, 'resource', 'map', 'multi', '2v2_zz', 'battle_zones.mi')));
    assert.ok(fs.existsSync(path.join(K, 'zz_rush.info')));
    const card = fs.readFileSync(path.join(mod, ...(CARDS + 'zz_rush.set').split('/')), 'latin1'); assert.ok(/\{scoreFinal\t700\}/.test(card) && /^\{game\r\n\t\{class battle_zones\}\r\n\t\{order 0\}/.test(card), card);
    const pot = fs.readFileSync(path.join(mod, 'localizations', 'default', 'interface', 'text', 'mode_zz_rush.pot'), 'utf8');
    assert.ok(/msgctxt "mp\/game\/zz_rush"\r\nmsgid "Rush zones"\r\nmsgstr ""/.test(pot), pot);
    await refusedK(mk({ goh_mode: v('battle_zones'), newmode: v(true), with_mode: v('zz_rush') }), 'task.mission.e.gohnew');
    assert.equal(hashDir(g), gameHash, 'the game files are unchanged');
  });
  console.log('PASS ' + n);
})().catch(e => { console.error(e); process.exit(1); });
