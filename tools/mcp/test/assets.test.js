// mcp assets test: every tool of tools/mcp/tools/assets.js, its handler called directly with a ctx (lib/ctx forCall), on the real
// installs read-only and on the repo's small fixtures. The one write tool (mow_model_stage) writes only into a scratch mod folder
// (env ARSENAL_TMP when set, else the os temp). Refusals: a relative path, a path starting with -, a missing folder, no write
// root, outside the write roots, a missing install, bad arguments; Gates of Hell answers of the tools that say "not served".
//   node tools/mcp/test/assets.test.js          MCP_ASSETS_SHOW=1 prints every answer; MCP_ASSETS_SLOW=1 adds the GoH model search
// An install that is not there skips its cases with a printed reason. Caches are kept in <ARSENAL_TMP or os temp>\arsenal-mcp-assets between runs.
// Author: Imperator_Aug (ARSENAL, ia-2f3db18a)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { T, scratch, tmpBase, gameDirs, rm, ROOT } = require('./rpc');
const t = T('assets');
const SHOW = process.env.MCP_ASSETS_SHOW === '1';

const { AS2, GOH: GOH0 } = gameDirs();
const GOH = GOH0;
const hasAs2 = fs.existsSync(path.join(AS2, 'resource')), hasGoh = fs.existsSync(path.join(GOH, 'resource'));
const keep = path.join(tmpBase(), 'arsenal-mcp-assets');
fs.mkdirSync(keep, { recursive: true });
const S = scratch('assetstest');
Object.assign(process.env, { ARSENAL_TMP: keep, ARSENAL_MCP_STORE: path.join(keep, 'store'), ARSENAL_CACHE: path.join(keep, 'cache'), ARSENAL_WRITE_ROOTS: S, ARSENAL_NO_STEAM: '1', ARSENAL_SETTINGS: path.join(S, 'no-settings.json') });
process.env.ARSENAL_AS2_DIR = hasAs2 ? AS2 : path.join(S, 'no-as2');
process.env.ARSENAL_GOH_DIR = hasGoh ? GOH : path.join(S, 'no-goh');

const ctxLib = require('../lib/ctx');
const M = require('../tools/assets');
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
const got = r => ' | got: ' + String(r && r.text).slice(0, 400).replace(/\n/g, ' / ');
const good = (r, what) => t.ok(r && !r.isError && !r.na && typeof r.text === 'string' && r.text.length > 0, what + (r && (r.isError || r.na) ? got(r) : ''));
const refused = (r, part, what) => t.ok(r && r.isError && !r.threw && String(r.text).includes(part), what + got(r));
const has = (r, re, what) => t.ok(r && !r.threw && re.test(String(r.text)), what + got(r));
const skip = (why, n) => console.log('assets: skipped ' + n + ' case(s): ' + why);
const FIX = path.join(ROOT, 'tools');
// the defcheck fixture is made by its own maker into a scratch folder of this run (it is not a tracked file)
const DEFBASE = require('../../lib/platform').tmpDir('mcp-test'); require('fs').mkdirSync(DEFBASE, { recursive: true });
const DEFWORK = require('fs').mkdtempSync(path.join(DEFBASE, 'defmod-'));
require('child_process').spawnSync(process.execPath, ['mkfixture.js'], { cwd: path.join(FIX, 'defcheck', 'test'), env: Object.assign({}, process.env, { TEST_WORK: DEFWORK }), stdio: 'ignore' });
process.on('exit', () => { try { require('fs').rmSync(DEFWORK, { recursive: true, force: true }); } catch (e) { /* scratch */ } });
const DEFMOD = path.join(DEFWORK, 'fixture', 'mod'), FXMOD = path.join(FIX, 'fxlint', 'test', 'fixture', 'mod');
// the fxlint fixture is made by its own maker when a copy does not carry it
if (!fs.existsSync(FXMOD)) require('child_process').spawnSync(process.execPath, ['mkfixture.js'], { cwd: path.join(FIX, 'fxlint', 'test'), stdio: 'ignore' });
const NAMES = ['mow_model_find', 'mow_model_info', 'mow_model_check', 'mow_model_stage', 'mow_model_edits', 'mow_asset_missing', 'mow_texture_info', 'mow_anim_list',
  'mow_sound_find', 'mow_sound_info', 'mow_sound_check', 'mow_fx_find', 'mow_fx_check', 'mow_icon_check'];

(async () => {
  try {
    // ----- the module itself -----
    t.ok(M.group === 'assets' && M.tools.length >= 8 && M.tools.length <= 14, 'module: group assets with 8 to 14 tools');
    t.ok(M.tools.every(x => /^mow_[a-z0-9]+(_[a-z0-9]+)*$/.test(x.name) && x.title && x.description.length > 80 && x.description.length < 900 && ['read', 'write'].includes(x.kind) && x.games.length === 3 && typeof x.handler === 'function' && x.inputSchema.type === 'object'), 'module: every tool has name, title, description, kind, games, schema, handler');
    t.ok(new Set(M.tools.map(x => x.name)).size === M.tools.length, 'module: no name twice');
    t.ok(M.tools.every(x => /goh|Gates of Hell|All three games/i.test(x.description)), 'module: every description says the per-game difference');
    t.ok(M.tools.every(x => !/\bdear(er)?\b/i.test(x.title + ' ' + x.description)), 'module: plain words in titles and descriptions');
    for (const n of NAMES) t.ok(!!tool(n), 'module: has ' + n);
    t.ok(M.tools.filter(x => x.kind === 'write').map(x => x.name).join() === 'mow_model_stage' && !!tool('mow_model_stage').inputSchema.properties.write, 'module: one write tool, with a write flag');
    { const others = []; for (const f of fs.readdirSync(path.join(__dirname, '..', 'tools'))) if (/\.js$/.test(f) && f !== 'assets.js') { try { for (const x of require('../tools/' + f).tools || []) others.push(x.name); } catch (e) { /* another builder's module, not ours to judge */ } }
      t.ok(M.tools.every(x => !others.includes(x.name)), 'module: no name another module has'); }

    // ----- refusals that need no install -----
    const m1 = path.join(S, 'm1');
    refused(await call('mow_model_check', { mod: 'relative\\mod' }), 'full path', 'model_check: a relative path is refused');
    refused(await call('mow_model_check', { mod: '-x' }), 'refused', 'model_check: a path starting with - is refused');
    refused(await call('mow_fx_check', { mod: path.join(S, 'nothere') }), 'not found', 'fx_check: a missing folder is refused');
    refused(await call('mow_icon_check', { mod: path.join(S, 'nothere') }), 'not found', 'icon_check: a missing folder is refused');
    refused(await call('mow_icon_check', { mod: 'x' }), 'full path', 'icon_check: a relative path is refused');
    refused(await call('mow_model_edits', { record: 'rel.stage.json' }), 'full path', 'model_edits: a relative record is refused');
    refused(await call('mow_model_edits', { record: path.join(S, 'none.stage.json') }), 'not found', 'model_edits: a missing record is refused');
    { const a = process.env.ARSENAL_AS2_DIR; process.env.ARSENAL_AS2_DIR = path.join(S, 'no-as2');
      for (const [n, args] of [['mow_model_find', { q: 'pz6e' }], ['mow_model_info', { model: 'pz6e' }], ['mow_anim_list', { model: 'pz6e' }], ['mow_texture_info', { key: 'texture/x' }], ['mow_sound_find', { name: 'weapon/shot/gun' }],
        ['mow_sound_info', { sound: 'weapon/shot/gun' }], ['mow_sound_check', {}], ['mow_fx_find', { name: 'ex_arm_big' }], ['mow_model_stage', { model: 'pz6e', mod: m1 }]])
        refused(await call(n, args), 'ARSENAL_AS2_DIR', n + ': no install is said with the variable to set');
      process.env.ARSENAL_AS2_DIR = a; }
    // Gates of Hell: said in plain words, not an error, not gone (needs no install)
    { const r = await call('mow_asset_missing', { game: 'goh', mod: DEFMOD });
      t.ok(r && r.na && !r.isError && /Gates of Hell/.test(r.na) && /mow_/.test(r.na), 'asset_missing goh: answers why it is not served and what to use' + got(r)); }
    refused(await call('mow_model_find', { q: 'x', game: 'quake' }), 'game', 'model_find: an unknown game is refused');

    if (!hasAs2) skip('no MoW:AS2 / AS64 install at ' + AS2 + ' (set ARSENAL_AS2_DIR)', 60);
    else {
      // ----- bad arguments -----
      refused(await call('mow_model_find', {}), 'q', 'model_find: no words is refused');
      refused(await call('mow_model_find', { q: '-rf' }), 'refused', 'model_find: words starting with - are refused');
      refused(await call('mow_model_find', { q: 'pz6e', kind: 'boat' }), 'kind', 'model_find: an unknown kind is refused');
      refused(await call('mow_model_info', { model: 'pz6e', show: ['everything'] }), 'show', 'model_info: an unknown list is refused');
      refused(await call('mow_model_info', { model: 'zz_no_such_model_zz' }), '', 'model_info: an unknown model is an error in plain words');
      refused(await call('mow_model_check', { mod: DEFMOD, checks: ['paint'] }), 'checks', 'model_check: an unknown check is refused');
      refused(await call('mow_model_stage', { model: 'pz6e', mod: m1, textures: 'cache' }), 'textures', 'model_stage: a texture mode that writes outside the mod is refused');
      refused(await call('mow_texture_info', {}), 'file', 'texture_info: neither file nor key is refused');
      refused(await call('mow_texture_info', { file: 'rel.dds' }), 'full path', 'texture_info: a relative file is refused');
      refused(await call('mow_texture_info', { key: 'texture/zz_no_such_zz' }), 'no such texture', 'texture_info: an unknown key is said');
      refused(await call('mow_sound_find', { name: '-x' }), 'refused', 'sound_find: a name starting with - is refused');
      refused(await call('mow_sound_info', { sound: 'zz/no_such_sound_zz' }), 'not found', 'sound_info: an unknown sound is said');
      refused(await call('mow_fx_find', { name: 'two words' }), 'name', 'fx_find: a name with a space is refused');
      refused(await call('mow_anim_list', { model: '' }), 'model', 'anim_list: an empty model is refused');

      // ----- models -----
      const mf = await call('mow_model_find', { q: 'pz6e', limit: 3 });
      good(mf, 'model_find'); has(mf, /pz6e\.mdl/, 'model_find: names the .mdl'); has(mf, /larger limit/, 'model_find: a cut list says how to get more');
      t.ok(mf.data && mf.data.total >= 3 && mf.data.rows.length === 3, 'model_find: data has total and the cut rows');
      good(await call('mow_model_find', { q: 'pz6e', game: 'mowas2', kind: 'vehicle', limit: 2 }), 'model_find mowas2');
      const mi = await call('mow_model_info', { model: 'pz6e' });
      good(mi, 'model_info'); has(mi, /bones/, 'model_info: counts bones'); has(mi, /Volumes: \d+/, 'model_info: counts volumes'); has(mi, /show:/, 'model_info: says how to ask for the lists');
      t.ok(String(mi.text).length < 1500, 'model_info: the short answer stays short');
      const mv = await call('mow_model_info', { model: 'pz6e', show: ['volumes', 'textures'], limit: 4 });
      good(mv, 'model_info with lists'); has(mv, /\.vol/, 'model_info: lists volume files'); has(mv, /\.dds/, 'model_info: lists textures'); has(mv, /offset: 4/, 'model_info: a cut list names the next offset');
      const mc = await call('mow_model_check', { mod: DEFMOD });
      good(mc, 'model_check'); has(mc, /DEF_BONE_NOT_IN_MDL/, 'model_check: finds the seeded bone that the model lacks'); has(mc, /PORT-\d+/, 'model_check: the finding carries its limits row');
      const mcb = await call('mow_model_check', { mod: DEFMOD, checks: ['binary'] });
      good(mcb, 'model_check binary only'); t.ok(!/def \(defcheck|expcheck/.test(mcb.text) && /binhdr/.test(mcb.text),'model_check: only the asked check runs');

      // ----- stage: preview, refusals, real write into scratch -----
      const pv = await call('mow_model_stage', { model: 'pz6e', mod: m1 });
      good(pv, 'model_stage preview'); has(pv, /Preview only/, 'model_stage preview: says nothing was written');
      t.ok(!fs.existsSync(m1), 'model_stage preview: writes nothing');
      { const w = process.env.ARSENAL_WRITE_ROOTS; delete process.env.ARSENAL_WRITE_ROOTS;
        refused(await call('mow_model_stage', { model: 'pz6e', mod: m1, write: true }), 'ARSENAL_WRITE_ROOTS', 'model_stage: no write root, the write is refused');
        const p = await call('mow_model_stage', { model: 'pz6e', mod: m1 });
        t.ok(!p.isError && /would be refused/.test(p.text), 'model_stage: the preview says the write would be refused' + got(p));
        t.ok(!fs.existsSync(m1), 'model_stage: nothing was made without a write root');
        process.env.ARSENAL_WRITE_ROOTS = w; }
      const outside = path.join(os.tmpdir(), 'mcp-assets-outside-root-zz');
      refused(await call('mow_model_stage', { model: 'pz6e', mod: outside, write: true }), 'outside', 'model_stage: a folder outside the write roots is refused');
      t.ok(!fs.existsSync(outside), 'model_stage: nothing was made outside the roots');
      refused(await call('mow_model_stage', { model: 'pz6e', mod: path.join(AS2, 'resource', 'zz_mcp_test'), write: true }), '', 'model_stage: the game folder is refused');
      const st = await call('mow_model_stage', { model: 'pz6e', mod: m1, write: true });
      good(st, 'model_stage write');
      const rec = path.join(m1, '.arsenal', 'soedit', 'pz6e.stage.json');
      t.ok(fs.existsSync(rec) && fs.existsSync(path.join(m1, 'resource', 'entity', '-vehicle', 'tank_heavy', 'pz6e', 'pz6e.mdl')), 'model_stage write: the record and the .mdl are in the scratch mod');
      t.ok(!fs.readdirSync(path.join(m1, 'resource', 'entity', '-vehicle', 'tank_heavy', 'pz6e')).some(f => /\.dds$/i.test(f)), 'model_stage write: textures are not copied by default');
      const ed = await call('mow_model_edits', { record: rec });
      good(ed, 'model_edits'); has(ed, /Nothing was lost/, 'model_edits: an untouched stage lost nothing');
      // the staged mod laid over the game: the model's files now come from the mod
      const ms = await call('mow_model_info', { model: 'pz6e', mod: m1 });
      good(ms, 'model_info with a mod'); has(ms, /mod/, 'model_info with a mod: says files come from the mod');

      // ----- missing assets, textures, animations -----
      const am = await call('mow_asset_missing', { mod: DEFMOD });
      good(am, 'asset_missing'); has(am, /portasset/, 'asset_missing: names the checker');
      good(await call('mow_asset_missing', { mod: m1, game: 'mowas2' }), 'asset_missing mowas2 on the staged mod');
      const tx = await call('mow_texture_info', { key: 'entity/-vehicle/tank_heavy/pz6e/pz6auste' });
      good(tx, 'texture_info by key'); has(tx, /\d+ x \d+/, 'texture_info: width and height'); has(tx, /pz6auste#/, 'texture_info: lists the # variants');
      t.ok(tx.data && tx.data.width > 0 && tx.data.kind === 'dds', 'texture_info: data has the size and kind');
      const an = await call('mow_anim_list', { model: 'pz6e', limit: 3 });
      good(an, 'anim_list'); has(an, /frames/, 'anim_list: frames per file'); has(an, /offset: 3/, 'anim_list: a cut list names the next offset');
      const aq = await call('mow_anim_list', { model: 'pz6e', q: 'fire' });
      good(aq, 'anim_list with q'); t.ok(!/- start:/.test(aq.text) && /fire/.test(aq.text), 'anim_list: q keeps only matching names' + got(aq));

      // ----- sound -----
      const sf = await call('mow_sound_find', { name: 'weapon/shot/gun', limit: 4 });
      good(sf, 'sound_find'); has(sf, /a folder, \d+ file/, 'sound_find: a folder name resolves to its files'); has(sf, /volume/, 'sound_find: folder settings');
      t.ok(String(sf.text).split('\n').filter(l => /\.wav$/.test(l)).length <= 4, 'sound_find: the file list is cut at limit');
      const sn = await call('mow_sound_find', { name: 'nope/zz' });
      t.ok(sn && !sn.threw && /nothing by that name/.test(sn.text), 'sound_find: an unknown name is said, not thrown' + got(sn));
      const si = await call('mow_sound_info', { sound: 'resource/sound/weapon/shot/gun/cannon.wav', distance: 100 });
      good(si, 'sound_info'); has(si, /\d+ Hz/, 'sound_info: the wav format'); has(si, /At 100 m/, 'sound_info: the gain at a distance');
      const sc = await call('mow_sound_check', { files: 200 });
      good(sc, 'sound_check'); has(sc, /200 wav file/, 'sound_check: stops after the asked number of files'); has(sc, /files: /, 'sound_check: says how the cut was asked');

      // ----- effects, icons -----
      const ff = await call('mow_fx_find', { name: 'ex_arm_big', limit: 3 });
      good(ff, 'fx_find'); has(ff, /ex_arm_big\.def/, 'fx_find: where it is defined'); has(ff, /\{spawn "ex_arm_big"\}/, 'fx_find: a use with its line text'); has(ff, /offset: 3/, 'fx_find: a cut list names the next offset');
      const fq = await call('mow_fx_find', { name: 'ex_arm_big', q: 'bridge' });
      good(fq, 'fx_find with q'); t.ok(!/grass\.inc/.test(fq.text) && /bridge\.inc/.test(fq.text), 'fx_find: q keeps only matching paths');
      const fn = await call('mow_fx_find', { name: 'zz_no_such_fx_zz' });
      t.ok(fn && !fn.threw && /no such entity|0 place|not defined|nothing/i.test(fn.text), 'fx_find: an unknown name is said' + got(fn));
      const fc = await call('mow_fx_check', { mod: FXMOD, limit: 3 });
      good(fc, 'fx_check'); has(fc, /FX_TRACER_UNLISTED/, 'fx_check: finds the seeded tracer'); has(fc, /VIS-19/, 'fx_check: the rule carries its limits row'); has(fc, /larger limit/, 'fx_check: a cut list says how to get more');
      const ic = await call('mow_icon_check', { mod: FXMOD });
      good(ic, 'icon_check'); has(ic, /UI-03/, 'icon_check: the rule carries its limits row');
    }

    // ----- Gates of Hell: the cheap reads -----
    if (!hasGoh) skip('no Gates of Hell install at ' + GOH + ' (set ARSENAL_GOH_DIR)', 5);
    else {
      const gc = await call('mow_model_check', { game: 'goh', mod: DEFMOD });
      t.ok(gc && !gc.threw && !gc.isError && /PORT-171/.test(gc.text), 'model_check goh: says why the def check is left out' + got(gc));
      const gf = await call('mow_fx_check', { game: 'goh', mod: FXMOD });
      t.ok(gf && !gf.threw && !gf.isError && /Gates of Hell/.test(gf.text), 'fx_check goh' + got(gf));
      const gs = await call('mow_sound_find', { game: 'goh', name: 'zz/none' });
      t.ok(gs && !gs.threw && /nothing by that name/.test(gs.text), 'sound_find goh: an unknown name is said' + got(gs));
      const gi = await call('mow_icon_check', { game: 'goh', mod: FXMOD });
      t.ok(gi && !gi.threw && !gi.isError, 'icon_check goh' + got(gi));
      if (process.env.MCP_ASSETS_SLOW === '1') {
        const gm = await call('mow_model_find', { game: 'goh', q: 'tiger', limit: 3 });
        good(gm, 'model_find goh'); has(gm, /tiger/, 'model_find goh: finds a Tiger');
      } else skip('the Gates of Hell model search (model_find, model_info, anim_list) runs only with MCP_ASSETS_SLOW=1: it takes about half a minute warm and far longer on its first index build', 2);
    }
    t.ok(!fs.existsSync(path.join(AS2, 'resource', 'zz_mcp_test')) && !fs.existsSync(path.join(GOH, 'resource', 'zz_mcp_test')), 'the game folders were not written');
  } catch (e) { t.ok(false, 'the test itself threw: ' + (e && e.stack || e)); }
  rm(S);
  t.done();
})();
