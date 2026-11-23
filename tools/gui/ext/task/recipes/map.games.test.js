// recipe "map" games test: node map.games.test.js <scratch>. A made-up Gates of Hell install (call_to_arms.exe, one map 2v2_zz with
// map.net 05 02, battle_zones and ammunition .info/.mi in the CRLF form of the game, a DXT1 preview, the two mode cards, battle_zones
// with {enableBots}): goh is in games with no na; the AS2 only questions are hidden on GoH and asked as before on AS2; values read
// the GoH .info files and cards; a copy runs map-clone into a temp folder and writes every file into the mod through lib/modwrite
// (restore points), with players and season in each .info, the lobby name .pot (read back by the Maps page reader), bots in the card;
// a DXT1 picture goes in, a 32 bit DDS and a PNG are made DXT1 at the game's sizes, a file that is no picture is refused; armored_warfare
// is added as a copy of battle_zones (frontlines refused); objects are placed through place-entity; ranked goes into each .info; more
// players than start points are refused unless the user adds them in the editor; a taken name and no GoH folder are refused;
// the game files stay byte for byte. Nothing here runs the game: the effects in game are [T].
// Author: Imperator_Aug (ARSENAL, ia-goh-map)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert'), crypto = require('crypto');
const base0 = process.env.ARSENAL_TMP || os.tmpdir();
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(base0, 'task-map-games-')));
fs.mkdirSync(scratch, { recursive: true });
const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile');
const R = require('./map.recipe'), L = require('./map.lang'), G0 = require('./map.goh');
const MW = require('../../../../lib/modwrite');
const DASH = new RegExp('[' + String.fromCharCode(0x2010) + '-' + String.fromCharCode(0x2015) + ']');
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok ' + name); };
const v = x => ({ src: 'value', value: x });
const MAP = 'map/multi/2v2_zz';
// a GoH map.net head that lib/mapnet reads clean (the map-clone fixture's form): cell 5, version 2, then MAP0 MAP1 GRID
const NET = (() => { const h = Buffer.alloc(14); h[0] = 5; h[1] = 2; h.writeInt16LE(1, 2); h.writeInt16LE(1, 4); return Buffer.concat([h, Buffer.from('MAP0'), Buffer.from([0]), Buffer.from('MAP1'), Buffer.from([0]), Buffer.from('GRID'), Buffer.from([1, 0, 0, 0])]); })();
function dds(wd, ht, four) {
  const hd = Buffer.alloc(128); hd.write('DDS ', 0, 'latin1'); hd.writeUInt32LE(124, 4); hd.writeUInt32LE(0x1 | 0x2 | 0x4 | 0x1000 | 0x80000, 8);
  hd.writeUInt32LE(ht, 12); hd.writeUInt32LE(wd, 16); hd.writeUInt32LE(1, 28); hd.writeUInt32LE(32, 76);
  if (four) { hd.writeUInt32LE(0x4, 80); hd.write(four, 84, 'latin1'); return Buffer.concat([hd, Buffer.alloc(wd * ht / 2, 7)]); }
  hd.writeUInt32LE(0x41, 80); hd.writeUInt32LE(32, 88); hd.writeUInt32LE(0xff0000, 92); hd.writeUInt32LE(0xff00, 96); hd.writeUInt32LE(0xff, 100); hd.writeUInt32LE(0xff000000, 104); hd.writeUInt32LE(0x1000, 108);
  return Buffer.concat([hd, Buffer.alloc(wd * ht * 4, 9)]);
}
// a mode file with n SpawnPoint map points on team a and on team b (the game's form, tab indented, CRLF)
const sp = (u, team, o) => ['\t{Entity "map_point" 0x' + u.toString(16), '\t\t{Position 0 0 5}', '\t\t{Extender "map_point"', '\t\t\t{name ' + team + o + '}', '\t\t\t{team ' + team + '}', '\t\t\t{phase 0}', '\t\t\t{order ' + o + '}', '\t\t\t{visor SpawnPoint}', '\t\t}', '\t\t{Player 0}', '\t}'];
const mi = (flags, n) => ['{mission', ...Array(flags).fill(' {visor "MapPoint"}'), ...[...Array(n)].flatMap((x, i) => sp(0x9000 + i, 'a', i + 1).concat(sp(0x9100 + i, 'b', i + 1))), '}', ''].join('\r\n');
// a PNG of w x h, 8 bit RGBA, one colour
function png(wd, ht) {
  const zlib = require('zlib'), crc = b => { let c, k = -1; for (let i = 0; i < b.length; i++) { c = (k ^ b[i]) & 0xff; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; k = (k >>> 8) ^ c; } return (k ^ -1) >>> 0; };
  const ch = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(ty, 'latin1'), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(wd, 0); ih.writeUInt32BE(ht, 4); ih[8] = 8; ih[9] = 6;
  const raw = Buffer.alloc((wd * 4 + 1) * ht); for (let y = 0; y < ht; y++) for (let x = 0; x < wd; x++) raw.set([200, 100, 50, 255], y * (wd * 4 + 1) + 1 + x * 4);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), ch('IHDR', ih), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]);
}
const info = (mx, tex) => ';SDL\r\n{game\r\n  {maxPlayers ' + mx + '}\r\n  {texMod ' + tex + '}\r\n;  {ranked}\r\n  {mission_options {selects {"weather_options_choices" {options "a" "b"}{selected "a"}}}}\r\n}\r\n';
const hashDir = d => { const h = crypto.createHash('sha1'); (function walk(x) { for (const e of fs.readdirSync(x, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) { const p = path.join(x, e.name); if (e.isDirectory()) walk(p); else h.update(p + '\0').update(fs.readFileSync(p)); } })(d); return h.digest('hex'); };

(async () => {
  const g = fs.mkdtempSync(path.join(scratch, 'goh-')), mod = path.join(scratch, 'mods', 'map_goh');
  const G = (k, s) => w(path.join(g, ...k.split('/')), s);
  G('binaries/x64/call_to_arms.exe', 'x');
  G('resource/' + MAP + '/map.net', NET);
  G('resource/' + MAP + '/map', '{map\r\n {name "2v2_zz"}\r\n\t{Entity "box" 0x2\r\n\t\t{Position 0 0}\r\n\t}\r\n\t{Entity "box" 0x3\r\n\t\t{Position 100 100}\r\n\t}\r\n}\r\n');
  G('resource/entity/props/box/box.def', '{game_entity\r\n\t{Extension "box.mdl"}\r\n}\r\n');
  G('resource/' + MAP + '/.materials', '{materials}\r\n');
  G('resource/' + MAP + '/battle_zones.info', info(4, 'winter'));
  G('resource/' + MAP + '/battle_zones.mi', mi(2, 4));
  G('resource/' + MAP + '/ammunition.info', info(4, 'winter'));
  G('resource/' + MAP + '/ammunition.mi', mi(1, 4));
  G('resource/' + MAP + '/preview.dds', dds(64, 32, 'DXT1'));
  G('resource/' + MAP + '/minimap.dds', dds(32, 32, 'DXT1'));
  G('resource/map/multi/2v2_taken/map.net', NET);
  G('resource/set/multiplayer/games/battle_zones.set', '{game\r\n\t{order 0}\r\n\t{settings\r\n\t\t{fogOfWar\tfog_realistic}\r\n\t\t{enableBots}\r\n\t\t{scoreFinal 1000}\r\n\t}\r\n}\r\n');
  G('resource/set/multiplayer/games/ammunition.set', '{game\r\n\t{order 10}\r\n\t{settings\r\n\t\t{fogOfWar\tfog_realistic}\r\n\t\t{scoreFinal 300}\r\n\t}\r\n}\r\n');
  w(path.join(mod, 'mod.info'), '{Mod {Name "m"}}\r\n');
  const gameHash = hashDir(g);
  const ctx = kit.ctxFor(scratch, { game: 'goh', gohDir: g });
  const lc = Object.assign({}, ctx, { mod, task: { id: 'goh', kind: 'goh', dir: g } });
  const mk = (answers, files, verb) => {
    const d = D.newId('map'), st = D.stageDir(ctx, d); fs.mkdirSync(st, { recursive: true });
    for (const [k, b] of Object.entries(files || {})) fs.writeFileSync(path.join(st, k), b);
    return D.save(ctx, { id: d, recipe: 'map', verb: verb || 'make', game: 'goh', mod, base: { id: MAP, name: 'ZZ' }, answers, kept: [], state: 'open' });
  };
  const run = d => CP.compile(ctx, d, { map: R });
  const refusedK = async (d, key) => { let e = null; try { await run(d); } catch (x) { e = x; } assert.equal(e && e.key, key, e && e.message); return e; };

  await t('games: goh in, no na; GoH rows in four languages without dashes; AS2 only questions hidden on GoH', () => {
    assert.deepEqual(R.games, ['as64', 'mowas2', 'goh']); assert.ok(!R.na || !R.na.goh);
    assert.ok(!L.some(r => r[0] === 'task.map.na.goh'));
    for (const k of ['task.map.q.goh_texmod', 'task.map.h.goh_texmod', 'task.map.v.goh_texmod.camo', 'task.map.v.goh_texmod.winter', 'task.map.e.nogoh', 'task.map.e.gohmode', 'task.map.e.gohplace', 'task.map.e.gohpic', 'task.map.e.gohspawns']) {
      const row = L.find(r => r[0] === k); assert.ok(row && row.length === 5 && row.slice(1).every(s => s && !DASH.test(s) && !/\bdear(er)?\b/i.test(s)), k);
    }
    const Q = {}; for (const gr of R.groups) for (const q of gr.q) Q[q.id] = q;
    for (const id of ['mode', 'mi_on', 'season']) assert.deepEqual(Q[id].when.$game, ['as64', 'mowas2'], id);
    for (const id of ['ranked', 'preview_small', 'place_on', 'spawns_later']) assert.ok(!Q[id].when || !Q[id].when.$game, id + ' asked on GoH too');
    assert.deepEqual(Q.goh_texmod.when.$game, ['goh']);
    for (const id of ['copy', 'name', 'title', 'maxplayers', 'minplayers', 'bots', 'preview', 'minimap', 'ground']) assert.ok(!Q[id].when || !Q[id].when.$game, id);
    // AS2 conditions kept as they were
    assert.deepEqual(Q.flags.when, { mode: 'battle_zones' }); assert.deepEqual(Q.name.when, { copy: true }); assert.deepEqual(Q.mi_mode.when, { mi_on: true });
    assert.equal(Q.place_entity.when.place_on, true); assert.equal(R.routes['POST /api/x/task/r/map/goh'] != null, true);
  });
  await t('values read the GoH .info files and the cards: 4 players, winter, bots off (ammunition has none)', async () => {
    const vs = await R.values(lc, { id: MAP, name: 'ZZ' }, { game: 'goh', verb: 'make' });
    assert.equal(vs.maxplayers, 4); assert.equal(vs.minplayers, 1); assert.equal(vs.goh_texmod, 'winter'); assert.equal(vs.bots, false);
    assert.equal(vs.copy, true); assert.equal(vs.name, '2v2_zz_copy'); assert.equal(vs.title, 'ZZ (copy)');
    const va = await R.values({ gameId: 'as64', game: () => null }, null, { verb: 'make' });
    assert.ok(!('goh_texmod' in va), 'AS2 values have no GoH season'); assert.equal(va.season, '0');
  });
  await t('copy: map-clone into a temp folder, then the mod through modwrite; players, season, title and bots in the GoH forms', async () => {
    const d = mk({ copy: v(true), name: v('zz_copy'), title: v('ZZ Copy'), maxplayers: v(6), goh_texmod: v('camo'), bots: v(true) });
    const r = await run(d);
    assert.ok(!r.gen, 'no gen ops on GoH');
    assert.equal(r.calls.length, 1); const b = r.calls[0].body;
    assert.equal(r.calls[0].route, 'POST /api/x/task/r/map/goh');
    assert.equal(b.name, 'zz_copy'); assert.deepEqual(b.info, { maxPlayers: 6, texMod: 'camo' }); assert.equal(b.title, 'ZZ Copy');
    assert.deepEqual(b.bots, { on: true, modes: ['ammunition'] });
    assert.equal(r.result, 'map/multi/zz_copy');
    const p = await CP.write(ctx, d, { map: R });
    assert.ok(p.written, JSON.stringify(p.errors));
    const K = path.join(mod, 'resource', 'map', 'multi', 'zz_copy');
    assert.deepEqual(fs.readFileSync(path.join(K, 'map.net')), NET);
    assert.ok(/"zz_copy"/.test(fs.readFileSync(path.join(K, 'map'), 'latin1')), 'map-clone changed the name ref');
    for (const m of ['battle_zones', 'ammunition']) {
      const s = fs.readFileSync(path.join(K, m + '.info'), 'latin1');
      assert.ok(/\{maxPlayers 6\}\r\n/.test(s) && /\{texMod camo\}\r\n/.test(s) && !/\r(?!\n)|[^\r]\n/.test(s), m + ': ' + JSON.stringify(s));
      assert.ok(/;  \{ranked\}/.test(s) && /mission_options/.test(s), 'the rest of the .info kept');
    }
    const pot = fs.readFileSync(path.join(mod, 'localizations', 'default', 'interface', 'text', 'mission', 'multi', 'zz_copy.pot'), 'utf8');
    assert.deepEqual(require('../../maps')._t.potTitles(pot, {}), { 'map/multi/zz_copy': 'ZZ Copy' });
    assert.ok(/^msgid ""\r\nmsgstr ""\r\n/.test(pot), 'pot header, CRLF');
    const card = fs.readFileSync(path.join(mod, 'resource', 'set', 'multiplayer', 'games', 'ammunition.set'), 'latin1');
    assert.ok(G0.flagOn(card, 'enableBots') && /\{scoreFinal 300\}/.test(card), card);
    assert.ok(!fs.existsSync(path.join(mod, 'resource', 'set', 'multiplayer', 'games', 'battle_zones.set')), 'a card with bots on is not copied');
    const rr = MW.restoreRoot(mod); assert.ok(fs.existsSync(rr) && fs.readdirSync(rr).length > 0, 'restore points made');
    assert.equal(hashDir(g), gameHash, 'the game files are unchanged');
    // a second copy with the same name: the folder is in the mod now
    await assert.rejects(run(mk({ copy: v(true), name: v('zz_copy'), title: v('Again') })), /already there/);
  });
  await t('pictures: a DXT1 DDS goes in on a change; a 32 bit DDS and a PNG are made DXT1 with mipmaps at the game sizes; no picture refused', async () => {
    const d = mk({ copy: v(false), preview: { src: 'file', staged: ['p.dds'] } }, { 'p.dds': dds(128, 64, 'DXT1') }, 'change');
    const r = await run(d); assert.deepEqual(r.calls[0].body.pics.map(x => x.to), ['preview']);
    const p = await CP.write(ctx, d, { map: R }); assert.ok(p.written, JSON.stringify(p.errors));
    assert.deepEqual(fs.readFileSync(path.join(mod, 'resource', 'map', 'multi', '2v2_zz', 'preview.dds')), dds(128, 64, 'DXT1'));
    const d2 = mk({ copy: v(false), minimap: { src: 'file', staged: ['b.dds'] }, preview: { src: 'file', staged: ['p.png'] }, preview_small: { src: 'file', staged: ['s.png'] } }, { 'b.dds': dds(64, 32, null), 'p.png': png(16, 8), 's.png': png(30, 18) }, 'change');
    const r2 = await run(d2); assert.deepEqual(r2.calls[0].body.pics.map(x => x.to).sort(), ['minimap', 'preview', 'preview_small']);
    assert.ok(r2.notes.some(s => /made a DXT1 DDS with mipmaps at 1500x752/.test(s)) && r2.notes.some(s => /at 2560x1440/.test(s)), r2.notes.join('\n'));
    const p2 = await CP.write(ctx, d2, { map: R }); assert.ok(p2.written, JSON.stringify(p2.errors));
    const P = require('../../../../lib/model/picture');
    for (const [q, wd, ht] of [['minimap', 1500, 752], ['preview', 2560, 1440], ['preview_small', 32, 20]]) {
      const fx = P.facts('dds', fs.readFileSync(path.join(mod, 'resource', 'map', 'multi', '2v2_zz', q + '.dds')), { game: 'goh' });
      assert.ok(fx && fx.format === 'DXT1' && fx.width === wd && fx.height === ht && fx.mips > 1, q + ' ' + JSON.stringify([fx.format, fx.width, fx.height, fx.mips]));
    }
    for (const [nm, buf, re] of [['a.dds', dds(64, 64, 'DXT5'), /DXT5/], ['c.png', Buffer.from('89504e470d0a1a0a0000', 'hex'), /not a DDS, PNG/]]) {
      const e = await refusedK(mk({ copy: v(false), minimap: { src: 'file', staged: [nm] } }, { [nm]: buf }, 'change'), 'task.map.e.gohpic');
      assert.ok(re.test(e.params.why), e.params.why); assert.equal(e.params.q, 'minimap');
    }
    assert.equal(hashDir(g), gameHash, 'the game files are unchanged');
  });
  await t('refused on GoH: the AS2 mode question, an object the game lacks, more players than start points, a name the game has, no GoH folder', async () => {
    await refusedK(mk({ copy: v(true), name: v('zz_b'), title: v('B'), mode: v('battle_zones') }), 'task.map.e.gohmode');
    const rq = await run(mk({ copy: v(false), place_on: v(true), place_entity: v('nosuch'), place_x: v(10), place_y: v(10) }, null, 'change'));
    const rc0 = Object.assign({}, ctx, { gohDir: () => g, curDir: () => g, gameId: () => 'goh' });
    let ep = null; try { await R.routes['POST /api/x/task/r/map/goh'](null, Object.assign({}, rq.calls[0].body, { mod, write: false }), rc0); } catch (x) { ep = x; }
    assert.ok(ep && ep.key === 'task.map.e.gohplace' && /PLACE_ENTITY_UNKNOWN/.test(ep.params.why) && ep.params.entity === 'nosuch', ep && ep.message);
    const e8 = await refusedK(mk({ copy: v(false), maxplayers: v(10) }, null, 'change'), 'task.map.e.gohspawns');
    assert.ok(/battle_zones \(team a 4, team b 4\)/.test(e8.params.modes) && /ammunition/.test(e8.params.modes) && e8.params.side === 5, JSON.stringify(e8.params));
    const r8 = await run(mk({ copy: v(false), maxplayers: v(10), spawns_later: v(true) }, null, 'change'));
    assert.ok(r8.calls[0].body.info.maxPlayers === 10 && r8.notes.some(s => /call_to_arms_ed\.exe/.test(s)), r8.notes.join('\n'));
    await assert.rejects(run(mk({ copy: v(true), name: v('2v2_taken'), title: v('T') })), /already there/);
    let e = null; try { G0.compile({}, { gameDir: null, mod, base: { id: MAP } }, R._t); } catch (x) { e = x; }
    assert.equal(e && e.key, 'task.map.e.nogoh');
  });
  await t('the route refuses a picture from outside the task files and a mode card that is not GoH', async () => {
    const rt = R.routes['POST /api/x/task/r/map/goh'], rc = Object.assign({}, ctx, { gohDir: () => g, curDir: () => g, gameId: () => 'goh' });
    const out = path.join(scratch, 'outside.dds'); w(out, dds(64, 64, 'DXT1'));
    await assert.rejects(rt(null, { mod, map: MAP, pics: [{ file: out, to: 'preview' }], write: false }, rc), /own files/);
    await assert.rejects(rt(null, { mod, map: MAP, bots: { on: true, modes: ['combat'] }, write: false }, rc), /Not a Gates of Hell mode card/);
    const dry = await rt(null, { mod, map: MAP, info: { maxPlayers: 8 }, write: false }, rc);
    assert.deepEqual(dry.files, ['resource/map/multi/2v2_zz/ammunition.info', 'resource/map/multi/2v2_zz/battle_zones.info']); assert.equal(dry.wrote, false);
    assert.ok(!fs.existsSync(path.join(mod, 'resource', 'map', 'multi', '2v2_zz', 'ammunition.info')), 'a dry run writes nothing');
  });
  await t('add a mode the map lacks: armored_warfare as a byte copy of battle_zones (.mi, .info, card) with new players; other kinds refused', async () => {
    for (const k of ['task.map.q.goh_addmode', 'task.map.h.goh_addmode', 'task.map.q.goh_zones', 'task.map.h.goh_zones']) {
      const row = L.find(r => r[0] === k); assert.ok(row && row.length === 5 && row.slice(1).every(s => s && !DASH.test(s) && !/\bdear(er)?\b/i.test(s)), k);
    }
    const d = mk({ copy: v(false), goh_addmode: v('armored_warfare'), maxplayers: v(8) }, null, 'change');
    const r = await run(d); assert.deepEqual(r.calls[0].body.addMode, { to: 'armored_warfare', from: 'battle_zones', zones: '' });
    assert.ok(r.notes.some(s => /armored_warfare/.test(s)), r.notes.join('\n'));
    const p = await CP.write(ctx, d, { map: R }); assert.ok(p.written, JSON.stringify(p.errors));
    const K = (...a) => path.join(mod, 'resource', ...a), GK = (...a) => path.join(g, 'resource', ...a);
    assert.deepEqual(fs.readFileSync(K('map', 'multi', '2v2_zz', 'armored_warfare.mi')), fs.readFileSync(GK('map', 'multi', '2v2_zz', 'battle_zones.mi')));
    assert.ok(/\{maxPlayers 8\}\r\n/.test(fs.readFileSync(K('map', 'multi', '2v2_zz', 'armored_warfare.info'), 'latin1')), 'players set in the new .info');
    assert.deepEqual(fs.readFileSync(K('set', 'multiplayer', 'games', 'armored_warfare.set')), fs.readFileSync(GK('set', 'multiplayer', 'games', 'battle_zones.set')));
    const f = require('../../missions')._t.factsOf(g, mod, MAP, [], null, { id: 'goh', exe: 'goh', kind: 'goh', dir: g });
    const aw = f.modes.find(m => m.mode === 'armored_warfare'), bz = f.modes.find(m => m.mode === 'battle_zones');
    assert.ok(aw && bz && aw.flags === bz.flags, 'the Missions page reads the new mode back');
    for (const m of ['evacuation', 'frontlines']) {
      const e = await refusedK(mk({ copy: v(false), goh_addmode: v(m) }, null, 'change'), 'task.map.e.gohmode');
      assert.equal(e.params.mode, m); assert.ok(e.params.why && !/missions\.s\./.test(e.params.why), e.params.why);
    }
    assert.equal(hashDir(g), gameHash, 'the game files are unchanged');
  });
  await t('objects on the map and ranked: placed by place-entity after the copy, ranked in every .info, check counts start points', async () => {
    const d = mk({ copy: v(true), name: v('zz_p'), title: v('ZZ P'), place_on: v(true), place_entity: v('box'), place_near: v('box'), place_x: v(20), place_y: v(30), place_dir: v(90),
      place_more: v(['box 50 60']), ranked: v(true) });
    const r = await run(d), b = r.calls[0].body;
    assert.deepEqual(b.place, [{ entity: 'box', pos: '20,30', dir: '90' }, { entity: 'box', pos: '50,60' }]); assert.equal(b.ranked, true);
    assert.ok(r.notes.some(s => /card of battle_zones, ammunition has ranked off/.test(s)), r.notes.join('\n'));
    const p = await CP.write(ctx, d, { map: R }); assert.ok(p.written, JSON.stringify(p.errors));
    const K = path.join(mod, 'resource', 'map', 'multi', 'zz_p'), mt = fs.readFileSync(path.join(K, 'map'), 'latin1');
    assert.ok(/\{Entity "box" 0x4\r\n\t\t\{Position 20 30\}\r\n\t\t\{xform zl 90\}\r\n\t\}/.test(mt) && /\{Entity "box" 0x5\r\n\t\t\{Position 50 60\}\r\n\t\}/.test(mt) && /"zz_p"/.test(mt), mt);
    for (const m of ['battle_zones', 'ammunition']) {
      const s = fs.readFileSync(path.join(K, m + '.info'), 'latin1');
      assert.ok(/\t\{ranked\r\n\t\t\{enabled\}\r\n\t\}\r\n\}\r\n$/.test(s) && /;  \{ranked\}/.test(s) && !/[^\r]\n/.test(s), s);
    }
    const ck = await R.check({ mod, base: { id: MAP }, answers: { copy: v(true), name: v('zz_p') }, game: 'goh' }, lc);
    const all = JSON.stringify(ck);
    assert.ok(/battle_zones: 4 players[^"]*start points team a 4, team b 4, ranked on in the map, off in the card/.test(all) && !/"warn"/.test(all), all);
    // ranked off again on a change: the live block goes, the commented line stays
    const G2 = require('./map.goh'), s0 = info(4, 'winter').replace('}\r\n', '}\r\n'), on = G2._t.setRanked(s0, true);
    assert.ok(/\t\{ranked\r\n\t\t\{enabled\}\r\n\t\}\r\n\}\r\n$/.test(on) && G2._t.setRanked(on, false) === s0 && G2._t.setRanked(s0, false) === s0, on);
    assert.equal(hashDir(g), gameHash, 'the game files are unchanged');
  });
  console.log('PASS ' + n);
})().catch(e => { console.error(e); process.exit(1); });
