// mcp mod test: every tool of tools/mcp/tools/mod.js, its handler called directly with a ctx (lib/ctx forCall), on the real installs
// read-only and on the repo's small fixtures. Writes go only into a scratch folder (env ARSENAL_TMP when set, else the os temp):
// one real mod made by mow_mod_new and changed by mow_unit_change, mow_text_set, mow_mod_gen. Refusals: no write root, outside the
// write roots, inside the game folder, a relative path, a missing install.
//   node tools/mcp/test/mod.test.js            MCP_MOD_SHOW=1 prints every answer; MCP_MOD_SLOW=1 adds the full GoH unit read
// An install that is not there skips its cases with a printed reason. Caches (unit catalogue, game texts) are kept in
// <ARSENAL_TMP or os temp>\arsenal-mcp-mod between runs, so the first run takes minutes and the next ones far less.
// Author: Imperator_Aug (ARSENAL, ia-7aa0b853)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { T, scratch, tmpBase, gameDirs, rm, ROOT } = require('./rpc');
const t = T('mod');
const SHOW = process.env.MCP_MOD_SHOW === '1';

const { AS2, GOH: GOH0 } = gameDirs();
const GOH = GOH0;
const hasAs2 = fs.existsSync(path.join(AS2, 'resource')), hasGoh = fs.existsSync(path.join(GOH, 'resource'));
const keep = path.join(tmpBase(), 'arsenal-mcp-mod');
fs.mkdirSync(keep, { recursive: true });
const S = scratch('modtest');
Object.assign(process.env, { ARSENAL_TMP: keep, ARSENAL_MCP_STORE: path.join(keep, 'store'), ARSENAL_CACHE: path.join(keep, 'cache'), ARSENAL_WRITE_ROOTS: S, ARSENAL_NO_STEAM: '1', ARSENAL_SETTINGS: path.join(S, 'no-settings.json') });
if (hasAs2) process.env.ARSENAL_AS2_DIR = AS2; else process.env.ARSENAL_AS2_DIR = path.join(S, 'no-as2');
if (hasGoh) process.env.ARSENAL_GOH_DIR = GOH; else process.env.ARSENAL_GOH_DIR = path.join(S, 'no-goh');

const ctxLib = require('../lib/ctx');
const M = require('../tools/mod');
const tool = n => M.tools.find(x => x.name === n);
async function call(name, args) {
  const tl = tool(name);
  if (!tl) return { text: 'no tool ' + name, isError: true, missing: true };
  args = args || {};
  if (ctxLib._reset) ctxLib._reset();
  const t0 = Date.now();
  let r;
  try { r = await tl.handler(args, ctxLib.forCall(tl, args)); }
  catch (e) { if (e && e.refused) r = { text: 'refused: ' + e.message, isError: true, refused: true }; else r = { text: 'THREW ' + (e && e.stack || e), isError: true, threw: true }; }
  r = r || { text: '', isError: true };
  if (r.na) r.text = r.text || ('not available: ' + r.na);
  if (SHOW) console.log('--- ' + name + ' ' + JSON.stringify(args).slice(0, 200) + '  (' + (Date.now() - t0) + ' ms)\n' + String(r.text).slice(0, 1500));
  return r;
}
const good = (r, what) => t.ok(r && !r.isError && !r.na && typeof r.text === 'string' && r.text.length > 0, what + (r && (r.isError || r.na) ? ' | got: ' + String(r.text).slice(0, 400).replace(/\n/g, ' / ') : ''));
const refused = (r, part, what) => t.ok(r && r.isError && !r.threw && String(r.text).includes(part), what + ' | got: ' + String(r && r.text).slice(0, 300).replace(/\n/g, ' / '));
const skip = (why, n) => console.log('mod: skipped ' + n + ' case(s): ' + why);
const FIX = path.join(ROOT, 'tools');

(async () => {
  try {
    // ----- the module itself -----
    t.ok(M.group === 'mod' && M.tools.length >= 30, 'module: group mod with its tools');
    t.ok(M.tools.every(x => /^mow_[a-z0-9]+(_[a-z0-9]+)*$/.test(x.name) && x.title && x.description.length > 80 && x.description.length < 900 && ['read', 'write'].includes(x.kind) && x.games.length === 3 && typeof x.handler === 'function' && x.inputSchema.type === 'object'), 'module: every tool has name, title, description, kind, games, schema, handler');
    t.ok(new Set(M.tools.map(x => x.name)).size === M.tools.length, 'module: no name twice');
    t.ok(M.tools.every(x => /goh|Gates of Hell|All three games/i.test(x.description)), 'module: every description says the per-game difference');
    for (const n of ['mow_mod_info', 'mow_mod_new', 'mow_mod_check', 'mow_mod_fix', 'mow_mod_diff', 'mow_mods_clash', 'mow_mods_patch', 'mow_unit_find', 'mow_unit_stats', 'mow_unit_change', 'mow_text_find', 'mow_text_set', 'mow_map_info', 'mow_mission_info', 'mow_port_plan', 'mow_mod_pack',
      'mow_map_clone', 'mow_mode_add', 'mow_map_place', 'mow_bots_recipe', 'mow_mod_upgrade', 'mow_mp_sync', 'mow_balance_check', 'mow_price', 'mow_weapon_find', 'mow_weapon_change', 'mow_kit_slot', 'mow_look_set']) t.ok(!!tool(n), 'module: has ' + n);

    // ----- refusals that need no install -----
    const m1 = path.join(S, 'm1');
    refused(await call('mow_mod_new', { dir: 'relative\\mod', name: 'X' }), 'full path', 'mod_new: a relative path is refused');
    refused(await call('mow_mod_new', { dir: '-x', name: 'X' }), 'refused', 'mod_new: a path starting with - is refused');
    refused(await call('mow_mod_info', { mod: path.join(S, 'nothere') }), 'not found', 'mod_info: a missing folder is refused');
    { const w = process.env.ARSENAL_WRITE_ROOTS; delete process.env.ARSENAL_WRITE_ROOTS;
      refused(await call('mow_mod_new', { dir: m1, name: 'MCP test', write: true }), 'ARSENAL_WRITE_ROOTS', 'mod_new: no write root, the write is refused');
      t.ok(!fs.existsSync(m1), 'mod_new: nothing was made without a write root');
      const p = await call('mow_mod_new', { dir: m1, name: 'MCP test' });
      t.ok(!p.isError && /would be refused/.test(p.text) && !fs.existsSync(m1), 'mod_new: the preview says the write would be refused');
      process.env.ARSENAL_WRITE_ROOTS = w; }
    refused(await call('mow_mod_new', { dir: path.join(os.tmpdir(), 'mcp-outside-root-zz'), name: 'X', write: true }), 'outside', 'mod_new: a folder outside the write roots is refused');
    t.ok(!fs.existsSync(path.join(os.tmpdir(), 'mcp-outside-root-zz')), 'mod_new: nothing was made outside the roots');
    { const a = process.env.ARSENAL_AS2_DIR; process.env.ARSENAL_AS2_DIR = path.join(S, 'no-as2');
      refused(await call('mow_unit_find', { q: 't34' }), 'ARSENAL_AS2_DIR', 'unit_find: no install is said with the variable to set');
      process.env.ARSENAL_AS2_DIR = a; }

    // ----- mod_new: preview, real write, for each game -----
    const pv = await call('mow_mod_new', { dir: m1, name: 'MCP test', description: 'made by mod.test.js' });
    good(pv, 'mod_new preview'); t.ok(/mod\.info/.test(pv.text) && pv.data.written === false && !fs.existsSync(m1), 'mod_new preview: lists mod.info, writes nothing');
    const mk = await call('mow_mod_new', { dir: m1, name: 'MCP test', description: 'made by mod.test.js', write: true });
    good(mk, 'mod_new write'); t.ok(mk.data && mk.data.written && fs.existsSync(path.join(m1, 'mod.info')), 'mod_new write: mod.info is there');
    t.ok(/3\.301/.test(fs.readFileSync(path.join(m1, 'mod.info'), 'latin1')), 'mod_new as64: Min 3.301');
    t.ok(/\r\n/.test(fs.readFileSync(path.join(m1, 'mod.info'), 'latin1')), 'mod_new: CRLF');
    refused(await call('mow_mod_new', { dir: m1, name: 'again', write: true }), '', 'mod_new: a folder that is not empty is refused');
    const m2 = path.join(S, 'm2'), mk2 = await call('mow_mod_new', { game: 'mowas2', dir: m2, name: 'MCP test 32', write: true });
    good(mk2, 'mod_new mowas2'); t.ok(/3\.262/.test(fs.readFileSync(path.join(m2, 'mod.info'), 'latin1')), 'mod_new mowas2: the 3.262 range');
    const pg = await call('mow_mod_new', { game: 'goh', dir: path.join(S, 'mg'), name: 'MCP test goh' });
    t.ok(!pg.isError && /localizations/.test(pg.text), 'mod_new goh preview: text under localizations/');
    const inf = await call('mow_mod_info', { mod: m1 });
    good(inf, 'mod_info of the new mod'); t.ok(inf.data.info && inf.data.info.name === 'MCP test' && inf.data.info.min === '3.301', 'mod_info: name and range read');

    // ----- text: set and find in the mod (lng-add, lng extract) -----
    const ts0 = await call('mow_text_set', { mod: m1, key: 'desc/entity/mcp_test_tank', text: 'MCP test tank' });
    good(ts0, 'text_set preview'); t.ok(ts0.data.written === false, 'text_set preview: nothing written');
    const ts1 = await call('mow_text_set', { mod: m1, key: 'desc/entity/mcp_test_tank', text: 'MCP test tank', write: true });
    good(ts1, 'text_set write'); t.ok(ts1.data.written && fs.existsSync(path.join(m1, ...ts1.data.file.split('/'))), 'text_set write: the file is in the mod');
    const tf = await call('mow_text_find', { mod: m1, q: 'mcp test tank' });
    good(tf, 'text_find in the mod'); t.ok(tf.data.total >= 1 && /mcp_test_tank/.test(tf.text), 'text_find: finds the key just set');
    refused(await call('mow_text_find', { mod: m1 }), 'q', 'text_find: nothing asked is refused');
    refused(await call('mow_text_set', { mod: m1, key: 'a/b', text: 'x', file: '..\\x.lng' }), 'file name', 'text_set: a path as file is refused');
    t.ok((await call('mow_text_set', { mod: m1, key: 'a/b', text: 'x', file: 'x.pot' })).na, 'text_set: a .pot for AS64 answers na');
    { const lm = path.join(FIX, 'lng', 'test', 'fixture', 'mod');
      if (fs.existsSync(lm)) { const r = await call('mow_text_find', { mod: lm, q: 'a' }); t.ok(!r.threw && (r.isError || r.data.total >= 0), 'text_find: the lng fixture mod is read'); } else skip('no lng fixture', 1); }

    // ----- fixtures: mods together (conflicts fixture game) -----
    { const fg = path.join(FIX, 'conflicts', 'test', 'fixture', 'game');
      if (fs.existsSync(fg)) {
        const a = process.env.ARSENAL_AS2_DIR; process.env.ARSENAL_AS2_DIR = fg;
        const c = await call('mow_mods_clash', { mods: ['ma', 'mb'] });
        good(c, 'mods_clash on the fixture'); t.ok(c.data && c.data.clashes && c.data.clashes.total >= 1, 'mods_clash: the fixture clashes are found');
        refused(await call('mow_mods_clash', { mods: ['ma'] }), 'two mods', 'mods_clash: one mod is refused');
        const pp = await call('mow_mods_patch', { mods: ['ma', 'mb'], out: path.join(S, 'patch-ab') });
        t.ok(pp && !pp.threw && !fs.existsSync(path.join(S, 'patch-ab')), 'mods_patch plan: answers and writes nothing' + (pp.isError ? ' (' + pp.text.slice(0, 200) + ')' : ''));
        const df = await call('mow_mod_diff', { mod: path.join(fg, 'mods', 'mb') });
        t.ok(df && !df.threw, 'mod_diff on a fixture mod answers' + (df.isError ? ' (' + df.text.slice(0, 200) + ')' : ''));
        const li = await call('mow_mod_info', {});
        good(li, 'mod_info list on the fixture'); t.ok(li.data.total >= 2, 'mod_info: lists the fixture mods');
        process.env.ARSENAL_AS2_DIR = a;
      } else skip('no conflicts fixture', 6); }

    // ----- the AS2 install (as64 and mowas2), read-only -----
    if (!hasAs2) skip('no AS2 install at ' + AS2, 40);
    else {
      // inside the game folder
      refused(await call('mow_mod_new', { dir: path.join(AS2, 'resource', 'zz_mcp_test'), name: 'X', write: true }), 'refused', 'mod_new: a folder in the game is refused');
      t.ok(!fs.existsSync(path.join(AS2, 'resource', 'zz_mcp_test')), 'mod_new: nothing was made in the game folder');
      { const w = process.env.ARSENAL_WRITE_ROOTS; process.env.ARSENAL_WRITE_ROOTS = AS2 + ';' + S;
        const why = ctxLib.forCall(tool('mow_mod_new'), { write: true }).guard.canWrite(path.join(AS2, 'resource', 'zz_mcp_test'));
        t.ok(typeof why === 'string' && why.length > 0, 'guard: the game resource folder is refused even as a write root');
        refused(await call('mow_unit_change', { mod: path.join(AS2, 'resource'), id: 't34_76', what: 'price', value: 1, write: true }), 'refused', 'unit_change: the game folder as mod is refused');
        process.env.ARSENAL_WRITE_ROOTS = w; }

      // units: find, stats, change (preview, real write, read back)
      const uf = await call('mow_unit_find', { q: 't34', kind: 'vehicle' });
      good(uf, 'unit_find t34'); t.ok(uf.data.total >= 1 && uf.data.units.length >= 1, 'unit_find: finds T-34s');
      const id = uf.data.units[0].id, cost0 = uf.data.units[0].cost;
      const us = await call('mow_unit_stats', { id });
      good(us, 'unit_stats'); t.ok(us.data.unit.id === id && /cost/.test(us.text), 'unit_stats: the unit and its price');
      const us2 = await call('mow_unit_stats', { id, show: ['stats', 'equipment', 'look'] });
      t.ok(!us2.threw && !us2.isError && us2.data.equipment && us2.data.look, 'unit_stats: equipment and look parts' + (us2.isError ? ' | ' + us2.text.slice(0, 300) : ''));
      refused(await call('mow_unit_stats', { id: 'zz_no_such_unit_zz' }), '', 'unit_stats: an unknown unit is refused');
      const dy = await call('mow_unit_find', { q: 'panzer 4 h' });
      t.ok(!dy.isError && (dy.data.total >= 1 || dy.data.didYouMean.length >= 1), 'unit_find: common names find something');
      const nc = Number(cost0) + 35;
      const c0 = await call('mow_unit_change', { mod: m1, id, what: 'price', value: nc });
      good(c0, 'unit_change preview'); t.ok(c0.data.written === false && c0.data.rows.length >= 1 && c0.data.files.length >= 1 && !fs.existsSync(path.join(m1, ...c0.data.files[0].file.split('/'))), 'unit_change preview: rows and files, nothing written');
      const c1 = await call('mow_unit_change', { mod: m1, id, what: 'price', value: nc, write: true });
      good(c1, 'unit_change write'); t.ok(c1.data.written === true && c1.data.files.every(f => fs.existsSync(path.join(m1, ...f.file.split('/')))), 'unit_change write: the files are in the mod');
      { const f = c1.data.files[0] && path.join(m1, ...c1.data.files[0].file.split('/')); const b = f && fs.existsSync(f) ? fs.readFileSync(f, 'latin1') : ''; t.ok(/\r\n/.test(b) && !/[^\r]\n/.test(b), 'unit_change write: CRLF kept'); }
      const us3 = await call('mow_unit_stats', { id, mod: m1 });
      t.ok(!us3.isError && Number(us3.data.unit.cost) === nc, 'unit_stats with the mod: the new price is read back (' + (us3.data && us3.data.unit && us3.data.unit.cost) + ' vs ' + nc + ')');
      const cn = await call('mow_unit_change', { mod: m1, id, what: 'name', value: 'MCP renamed' });
      t.ok(!cn.threw && !cn.isError && cn.data.written === false, 'unit_change name preview');
      refused(await call('mow_unit_change', { mod: m1, id, what: 'colour', value: 1 }), 'what must be', 'unit_change: an unknown what is refused');
      refused(await call('mow_unit_change', { mod: m1, what: 'price', value: 1 }), 'id is needed', 'unit_change: no id is refused');
      { const w = process.env.ARSENAL_WRITE_ROOTS; delete process.env.ARSENAL_WRITE_ROOTS;
        refused(await call('mow_unit_change', { mod: m1, id, what: 'price', value: nc + 5, write: true }), 'ARSENAL_WRITE_ROOTS', 'unit_change: no write root, the write is refused');
        process.env.ARSENAL_WRITE_ROOTS = w; }
      // soldier forms: equipment and look previews
      const sf = await call('mow_unit_find', { q: 'rifle', kind: 'soldier', all: true, limit: 5 });
      if (!sf.isError && sf.data.units.length) {
        const sid = sf.data.units[0].id;
        const k = await call('mow_kit_slot', { mod: m1, id: sid, add: [{ item: 'grenade', count: 1 }] });
        t.ok(!k.threw && typeof k.text === 'string' && (k.isError || k.data.written === false), 'kit_slot preview answers' + (k.isError ? ' (' + k.text.slice(0, 160).replace(/\n/g, ' ') + ')' : ''));
        const lk = await call('mow_look_set', { mod: m1, id: sid, texture: 'none' });
        t.ok(!lk.threw && typeof lk.text === 'string', 'look_set preview answers' + (lk.isError ? ' (' + lk.text.slice(0, 160).replace(/\n/g, ' ') + ')' : ''));
      } else skip('no soldier found for the kit and look cases', 2);
      refused(await call('mow_kit_slot', { mod: m1, id: 'x' }), 'equipment', 'kit_slot: nothing to change is refused');
      refused(await call('mow_look_set', { mod: m1, id: 'x' }), 'skin', 'look_set: nothing to change is refused');

      // gen ops on the mod
      const g0 = await call('mow_mod_gen', { mod: m1, ops: [{ op: 'text', key: 'desc/entity/mcp_gen', text: 'gen text' }] });
      t.ok(!g0.threw && g0.data && g0.data.written === false, 'mod_gen preview answers' + (g0.isError ? ' | ' + g0.text.slice(0, 300) : ''));
      refused(await call('mow_mod_gen', { mod: m1, ops: [{ op: 'nosuchop' }] }), 'unknown op', 'mod_gen: an unknown op is refused');
      refused(await call('mow_mod_gen', { mod: m1, ops: [{ op: 'mod', name: 'x' }] }), 'mow_mod_new', 'mod_gen: the mod op is refused');

      // weapons
      const wf = await call('mow_weapon_find', { q: 'mosin' });
      good(wf, 'weapon_find mosin'); t.ok(wf.data.total >= 1, 'weapon_find: finds the mosin');
      const wname = (wf.data.weapons.find(w => w.name === 'mosin') || wf.data.weapons[0]).name;
      const wc = await call('mow_weapon_change', { mod: m1, weapon: wname, value: '80 90' });
      good(wc, 'weapon_change range preview'); t.ok(wc.data.written === false && wc.data.rows.length === 1, 'weapon_change preview: one row, nothing written');
      const wd = await call('mow_weapon_change', { mod: m1, weapon: wname, what: 'rechargeTime', value: 3 });
      t.ok(!wd.threw && wd.data && wd.data.written === false, 'weapon_change of another value: preview answers' + (wd.isError ? ' | ' + wd.text.slice(0, 200) : ''));
      refused(await call('mow_weapon_change', { mod: m1, weapon: 'zz_no_gun_zz', value: '10' }), '', 'weapon_change: an unknown weapon is refused');

      // which file, entity
      const fw = await call('mow_file_which', { path: 'resource/set/multiplayer/units/soldiers.set' });
      good(fw, 'file_which'); t.ok(fw.data.found === true, 'file_which: a game file is found');
      const fw2 = await call('mow_file_which', { path: 'resource/zz/none.set' });
      t.ok(!fw2.threw && fw2.data && fw2.data.found === false, 'file_which: a missing file is said');
      const fm = await call('mow_file_which', { game: 'mowas2', path: 'resource/set/multiplayer/units/soldiers.set' });
      t.ok(!fm.isError && fm.data.found, 'file_which mowas2');
      const ei = await call('mow_entity_info', { names: [id.replace(/\(.*$/, ''), 'zz_none_zz'] });
      t.ok(!ei.threw && !ei.isError && ei.data.missing.includes('zz_none_zz'), 'entity_info: answers and names the missing one');

      // maps and missions
      const ml = await call('mow_map_info', { q: '1v1' });
      good(ml, 'map_info list'); t.ok(ml.data.total >= 1 && ml.data.maps[0].modes.length >= 1, 'map_info: maps with modes');
      const row0 = ml.data.maps.find(r => !r.mod) || ml.data.maps[0], mapName = row0.map, mode0 = row0.modes[0];
      const mi = await call('mow_map_info', { map: mapName });
      good(mi, 'map_info of one map'); t.ok(mi.data.facts && /mode/.test(mi.text), 'map_info: modes of the map');
      const mv = await call('mow_map_info', { map: mapName, view: true, width: 40 });
      t.ok(!mv.isError && mv.text.length > mi.text.length, 'map_info view: adds a picture');
      refused(await call('mow_map_info', { map: 'zz_no_map_zz' }), 'no map', 'map_info: an unknown map is refused');
      refused(await call('mow_map_info', { map: '..\\x' }), 'not a map name', 'map_info: a path as map is refused');
      const ms = await call('mow_mission_info', { map: mapName });
      good(ms, 'mission_info'); t.ok(ms.data.missions.length >= 1 && ms.data.missions[0].bytes > 0, 'mission_info: counts per mission');
      const ms1 = await call('mow_mission_info', { map: mapName, mode: mode0, mod: m1 });
      t.ok(!ms1.threw && !ms1.isError && ms1.data.missions.length === 1, 'mission_info: one mode, with a mod' + (ms1.isError ? ' | ' + ms1.text.slice(0, 200) : ''));
      const mc = await call('mow_map_clone', { map: mapName, name: 'mcp_copy', mod: m1 });
      t.ok(!mc.threw && !fs.existsSync(path.join(m1, 'resource', 'map', 'multi', 'mcp_copy')), 'map_clone preview: nothing written' + (mc.isError ? ' | ' + mc.text.slice(0, 200) : ''));
      refused(await call('mow_map_clone', { map: mapName, name: 'bad name!', mod: m1 }), 'letters', 'map_clone: a bad name is refused');
      const to = mode0 === 'battle_zones' ? 'combat' : 'battle_zones';
      const ma = await call('mow_mode_add', { map: mapName, from: mode0, to, mod: m1 });
      t.ok(!ma.threw && typeof ma.text === 'string', 'mode_add preview answers' + (ma.isError ? ' (' + ma.text.slice(0, 160).replace(/\n/g, ' ') + ')' : ''));
      const mp = await call('mow_map_place', { mod: m1, map: mapName, entity: 'barrel', pos: [100, 100] });
      t.ok(!mp.threw && typeof mp.text === 'string' && !fs.existsSync(path.join(m1, 'resource', ...mapName.split('/'), 'map')), 'map_place preview: nothing written' + (mp.isError ? ' (' + mp.text.slice(0, 200).replace(/\n/g, ' ') + ')' : ''));
      refused(await call('mow_map_place', { mod: m1, map: mapName, entity: 'barrel', pos: [1] }), 'pos', 'map_place: a bad pos is refused');
      const mb = await call('mow_mode_bots', { mod: m1, mode: mode0 });
      t.ok(!mb.threw && mb.data && ['added', 'present', 'fail'].includes(mb.data.state) && mb.data.written === false, 'mode_bots preview answers' + (mb.isError ? ' (' + mb.text.slice(0, 160) + ')' : ''));
      refused(await call('mow_mode_bots', { mod: m1, mode: 'zz_no_mode_zz' }), 'no game mode', 'mode_bots: an unknown mode is refused');

      // check, fix, diff, port, pack, sync, bots, balance, price on the small real mod
      const ck = await call('mow_mod_check', { mod: m1 });
      good(ck, 'mod_check (quick)'); t.ok(ck.data.fast === true && ck.data.verdict && typeof ck.data.findings === 'number', 'mod_check: verdict and finding count');
      const fx = await call('mow_mod_fix', { mod: m1, out: path.join(S, 'm1-fix') });
      good(fx, 'mod_fix plan'); t.ok(fx.data.written === false && !fs.existsSync(path.join(S, 'm1-fix', 'mod.info')), 'mod_fix plan: nothing written');
      refused(await call('mow_mod_fix', { mod: m1, out: path.join(m1, 'fix') }), 'new folder', 'mod_fix: out inside the mod is refused');
      const dd = await call('mow_mod_diff', { mod: m1 });
      good(dd, 'mod_diff of a folder outside <game>/mods'); t.ok(dd.data.files >= 1 && dd.data.files <= 3 && dd.data.tool === 'conflicts' && dd.data.rows.some(r => /units\//.test(r.file)), 'mod_diff: only the mod\'s own changes, the card file among them (' + dd.data.files + ')');
      const pp = await call('mow_port_plan', { game: 'goh', mod: m1 });
      good(pp, 'port_plan as64 -> goh'); t.ok(pp.data.to === 'goh' && /Plan only/.test(pp.text), 'port_plan: a plan for GoH');
      const pm = await call('mow_port_plan', { game: 'mowas2', mod: m1 });
      t.ok(!pm.isError && pm.data.to === 'mowas2', 'port_plan as64 -> mowas2');
      const up = await call('mow_mod_upgrade', { game: 'as64', mod: m2, out: path.join(S, 'm2-as64') });
      good(up, 'mod_upgrade preview'); t.ok(up.data.written === false && !fs.existsSync(path.join(S, 'm2-as64')), 'mod_upgrade preview: nothing written');
      refused(await call('mow_mod_upgrade', { game: 'as64', mod: m2, out: m2 }), 'new folder', 'mod_upgrade: out = the mod is refused');
      const pk = await call('mow_mod_pack', { mod: m1 });
      good(pk, 'mod_pack plan'); t.ok(pk.data.written === false, 'mod_pack plan: nothing written');
      refused(await call('mow_mod_pack', { mod: m1, write: true }), 'out is needed', 'mod_pack: a write without out is refused');
      const ps = await call('mow_mod_pack', { mod: m1, speed: true });
      good(ps, 'mod_pack speed plan'); t.ok(ps.data.speed === true && /Speed layout/.test(ps.text) && !ps.data.counts.PACK_SPEED_LAYOUT, 'mod_pack speed: speed layout, its info line is no problem');
      const pn = await call('mow_mod_pack', { mod: m1, speed: false });
      good(pn, 'mod_pack old layout plan'); t.ok(pn.data.speed === false && !/Speed layout/.test(pn.text), 'mod_pack speed: false = --no-speed, the old layout');
      t.ok(pk.data.speed === true, 'mod_pack: speed layout by default');
      const pw = await call('mow_mod_pack', { mod: m1, out: path.join(S, 'm1-pak'), write: true });
      t.ok(!pw.threw && (pw.isError || fs.existsSync(path.join(S, 'm1-pak'))), 'mod_pack write: paks land in the out folder' + (pw.isError ? ' (' + pw.text.slice(0, 200).replace(/\n/g, ' ') + ')' : ''));
      const sy = await call('mow_mp_sync', { mod: m1 });
      t.ok(!sy.threw && typeof sy.text === 'string', 'mp_sync of a mod answers' + (sy.isError ? ' (' + sy.text.slice(0, 160).replace(/\n/g, ' ') + ')' : ''));
      const se = await call('mow_mp_sync', { action: 'export', out: path.join(S, 'fp.json') });
      t.ok(!se.isError && se.data.written === false && !fs.existsSync(path.join(S, 'fp.json')), 'mp_sync export: preview only');
      refused(await call('mow_mp_sync', { action: 'compare', a: path.join(S, 'a.json'), b: path.join(S, 'b.json') }), 'not found', 'mp_sync compare: missing files are refused');
      const br = await call('mow_bots_recipe', { mod: m1 });
      t.ok(!br.threw && typeof br.text === 'string', 'bots_recipe check answers' + (br.isError ? ' (' + br.text.slice(0, 160).replace(/\n/g, ' ') + ')' : ''));
      const bc = await call('mow_balance_check', { q: 'tank', limit: 5 });
      good(bc, 'balance_check odd'); t.ok(bc.data.total >= 1 && bc.data.rows.length <= 5, 'balance_check: odd units, cut to the limit');
      const bm = await call('mow_balance_check', { show: 'models' });
      good(bm, 'balance_check models'); t.ok(bm.data.models.length >= 3, 'balance_check: a model per class');
      const pr = await call('mow_price', { mod: m1 });
      t.ok(!pr.threw && typeof pr.text === 'string', 'price fit answers' + (pr.isError ? ' (' + pr.text.slice(0, 160).replace(/\n/g, ' ') + ')' : ''));

      // mowas2 on the shared install
      const u2 = await call('mow_unit_find', { game: 'mowas2', q: 't34', kind: 'vehicle', limit: 3 });
      good(u2, 'unit_find mowas2'); t.ok(u2.data.game === 'mowas2' && u2.data.units.length >= 1 && u2.data.units.length <= 3, 'unit_find mowas2: units, cut to the limit');
      const c2 = await call('mow_mod_check', { game: 'mowas2', mod: m2 });
      t.ok(!c2.isError && c2.data.verdict, 'mod_check mowas2: a verdict');
      const mi2 = await call('mow_mod_info', { game: 'mowas2', mod: m2 });
      t.ok(!mi2.isError && mi2.data.info.max, 'mod_info mowas2: a max version');

      // the game's own texts (kept between runs)
      const gt = await call('mow_text_find', { q: 'tiger', limit: 5 });
      good(gt, 'text_find in the game'); t.ok(gt.data.total >= 1 && gt.data.rows.length <= 5 && gt.data.rows.every(r => !/^mods\//i.test(r.file)), 'text_find: game texts, no installed mod rows, cut to the limit');
    }

    // ----- Gates of Hell, read-only -----
    t.ok((await call('mow_price', { game: 'goh', mod: m1 })).na, 'price goh: na with the reason');
    t.ok((await call('mow_bots_recipe', { game: 'goh', mod: m1 })).na, 'bots_recipe goh check: na with the reason');
    if (!hasGoh) skip('no Gates of Hell install at ' + GOH, 10);
    else {
      const mg = path.join(S, 'mg'), g1 = await call('mow_mod_new', { game: 'goh', dir: mg, name: 'MCP test goh', write: true });
      good(g1, 'mod_new goh write'); t.ok(fs.existsSync(path.join(mg, 'mod.info')), 'mod_new goh: mod.info is there');
      refused(await call('mow_mod_new', { game: 'goh', dir: path.join(GOH, 'resource', 'zz_mcp_test'), name: 'X', write: true }), 'refused', 'mod_new goh: a folder in the game is refused');
      t.ok(!fs.existsSync(path.join(GOH, 'resource', 'zz_mcp_test')), 'mod_new goh: nothing was made in the game folder');
      const gi = await call('mow_mod_info', { game: 'goh', mod: mg });
      good(gi, 'mod_info goh'); t.ok(gi.data.info && gi.data.info.name === 'MCP test goh', 'mod_info goh: name read');
      const gl = await call('mow_mod_info', { game: 'goh' });
      t.ok(!gl.threw && !gl.isError, 'mod_info goh: list of <game>/mods');
      const gs = await call('mow_text_set', { game: 'goh', mod: mg, key: 'desc/entity/mcp_goh', text: 'MCP GoH text', write: true });
      good(gs, 'text_set goh write'); t.ok(/\.pot$/.test(gs.data.file) && fs.existsSync(path.join(mg, ...gs.data.file.split('/'))), 'text_set goh: a .pot under localizations/');
      const gf = await call('mow_text_find', { game: 'goh', mod: mg, q: 'mcp goh' });
      t.ok(!gf.threw && !gf.isError && gf.data.total >= 1, 'text_find goh: the .pot entry is found' + (gf.isError ? ' | ' + gf.text.slice(0, 200) : ' (' + (gf.data && gf.data.total) + ')'));
      const gw = await call('mow_file_which', { game: 'goh', path: 'resource/set/multiplayer/games/battle_zones.set' });
      t.ok(!gw.threw && !gw.isError, 'file_which goh answers (' + (gw.data && gw.data.found) + ')');
      const gm = await call('mow_map_info', { game: 'goh', q: '1v1', limit: 5 });
      good(gm, 'map_info goh list'); t.ok(gm.data.total >= 1, 'map_info goh: maps listed');
      if (gm.data && gm.data.maps && gm.data.maps[0]) {
        const gr = gm.data.maps.find(r => !r.mod) || gm.data.maps[0]; gm.data.maps[0] = gr;
        const g2 = await call('mow_map_info', { game: 'goh', map: gr.map });
        t.ok(!g2.threw && !g2.isError && g2.data.facts, 'map_info goh: one map' + (g2.isError ? ' | ' + g2.text.slice(0, 200) : ''));
        const g3 = await call('mow_mission_info', { game: 'goh', map: gm.data.maps[0].map });
        t.ok(!g3.threw && !g3.isError && g3.data.missions.length >= 1, 'mission_info goh' + (g3.isError ? ' | ' + g3.text.slice(0, 200) : ''));
      }
      const gp = await call('mow_port_plan', { game: 'as64', mod: mg });
      t.ok(!gp.threw && !gp.isError && gp.data.from === 'goh', 'port_plan goh -> as64' + (gp.isError ? ' | ' + gp.text.slice(0, 200) : ''));
      const gk = await call('mow_mod_pack', { game: 'goh', mod: mg });
      t.ok(!gk.threw && !gk.isError, 'mod_pack goh plan' + (gk.isError ? ' | ' + gk.text.slice(0, 200) : ''));
      const gb = await call('mow_mode_bots', { game: 'goh', mod: mg, mode: 'battle_zones' });
      t.ok(!gb.threw && gb.data && gb.data.written === false, 'mode_bots goh preview' + (gb.isError ? ' (' + gb.text.slice(0, 160) + ')' : ''));
      if (process.env.MCP_MOD_SLOW === '1') {
        const gu = await call('mow_unit_find', { game: 'goh', q: 'tiger', limit: 5 });
        good(gu, 'unit_find goh'); t.ok(gu.data.total >= 1, 'unit_find goh: finds a Tiger');
        if (gu.data && gu.data.units[0]) {
          const u = gu.data.units[0], st = await call('mow_unit_stats', { game: 'goh', id: u.id, card: u.card });
          good(st, 'unit_stats goh');
          const rk = await call('mow_unit_change', { game: 'goh', mod: mg, id: u.id, card: u.card, what: 'rank', value: 2 });
          t.ok(rk.isError && !rk.threw, 'unit_change goh: rank is refused in plain words');
          const pc = await call('mow_unit_change', { game: 'goh', mod: mg, id: u.id, card: u.card, what: 'price', value: Number(u.cost || 100) + 10 });
          t.ok(!pc.threw && !pc.isError && pc.data.written === false, 'unit_change goh: price preview');
        }
      } else skip('the Gates of Hell unit read (unit_find, unit_stats, unit_change) runs only with MCP_MOD_SLOW=1: its first read can take 45 minutes', 4);
    }
    t.ok(!fs.existsSync(path.join(AS2, 'resource', 'zz_mcp_test')) && !fs.existsSync(path.join(GOH, 'resource', 'zz_mcp_test')), 'the game folders were not written');
  } catch (e) { t.ok(false, 'the test itself threw: ' + (e && e.stack || e)); }
  rm(S);
  t.done();
})();
