// recipe "skin" games test: node skin.games.test.js <scratch>. A made-up Gates of Hell install (call_to_arms.exe, a tank zzt whose material
// names "$/model/zzt" in resource/texture/common, a #1 picture, a #win .ebm wrapper, seasons.inc Winter -> win): goh is in games with no
// na; the variant lookup lists 1 and win; compile without a GoH folder and a new soldier look refuse with their keys; a PNG camouflage on
// Winter is made a DXT1 DDS and copied to zzt#win.dds with no def line (seasons.inc maps it); a DDS on V3 named task3 adds the camo-write
// route; a see through or odd sized PNG refuses with its key; replace takes DDS only; fixed is a gen set row {texmod "1"}; the write puts
// the pictures and the def lines into the mod (the GoH def gets its TexMods line) and leaves restore points.
// Author: Imperator_Aug (ARSENAL, ia-goh-skin)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-skin-games-')));
fs.mkdirSync(scratch, { recursive: true });
const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile');
const A = require('../../../../artport/artport');
const R = require('./skin.recipe'), L = require('./skin.lang');
const DASH = new RegExp('[' + String.fromCharCode(0x2010) + '-' + String.fromCharCode(0x2015) + ']');
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok ' + name); };
function dds(wd, h) {
  const b = Buffer.alloc(128 + wd * h * 4); b.write('DDS ', 0, 'latin1'); b.writeUInt32LE(124, 4); b.writeUInt32LE(0x100F, 8); b.writeUInt32LE(h, 12); b.writeUInt32LE(wd, 16);
  b.writeUInt32LE(wd * 4, 20); b.writeUInt32LE(32, 76); b.writeUInt32LE(0x41, 80); b.writeUInt32LE(32, 88);
  b.writeUInt32LE(0xFF0000, 92); b.writeUInt32LE(0xFF00, 96); b.writeUInt32LE(0xFF, 100); b.writeUInt32LE(0xFF000000, 104); b.writeUInt32LE(0x1000, 108); return b;
}
const png = (wd, h, a) => { const rgba = Buffer.alloc(wd * h * 4, 200); for (let p = 3; p < rgba.length; p += 4) rgba[p] = a; return A.encodePng({ w: wd, h, rgba }); };
const v = x => ({ src: 'value', value: x });
const DIR = 'resource/entity/-vehicle/zz/zzt/', TEX = 'resource/texture/common/model/zzt';

(async () => {
  const g = fs.mkdtempSync(path.join(scratch, 'goh-')), mods = path.join(scratch, 'mods'), mod = path.join(mods, 'skin_goh');
  const G = (k, s) => w(path.join(g, ...k.split('/')), s);
  G('binaries/x64/call_to_arms.exe', 'x');
  G(DIR + 'zzt.def', '{game_entity\r\n\t{extension "zzt.mdl"}\r\n\t{targetclass "tank_medium"}\r\n}\r\n');
  G(DIR + 'zzt.mdl', '{Skeleton\r\n\t{bone "basis"\r\n\t\t{VolumeView "body.ply"}\r\n\t}\r\n}\r\n');
  G(DIR + 'body.ply', Buffer.from('EPLY\0\0material.mtl\0\0', 'latin1'));
  G(DIR + 'material.mtl', '{material bump\r\n\t{diffuse "$/model/zzt"}\r\n}\r\n');
  G(TEX + '.dds', dds(64, 64)); G(TEX + '#1.dds', dds(64, 64)); G(TEX + '#win.ebm', '{bitmap\r\n\t{reference "zzt#1"}\r\n}\r\n');
  G('resource/properties/seasons.inc', '{TexMods\r\n\t{"Winter" "win"}\r\n\t{"Autumn" "aut"}\r\n}\r\n');
  // a soldier look: folder [ger]/look1 with two looks, a model whose parts are in [src] and in its own folder, two materials, a breed
  const HSD = 'resource/entity/humanskin/[ger]/look1/', UT = 'resource/texture/common/_hum/u/';
  G(HSD + 'look1_a.def', '{game_entity\r\n\t{extension "look1_a.mdl"}{RimLight}\r\n}\r\n');
  G(HSD + 'look1_b.def', '{game_entity\r\n\t{extension "look1_b.mdl"}\r\n}\r\n');
  G(HSD + 'look1_a.mdl', '{skeleton\r\n\t{bone "body"\r\n\t\t{VolumeView "../[src]/body.ply"}\r\n\t\t{VolumeView "heads/h1.ply"}\r\n\t}\r\n}\r\n');
  G(HSD + 'look1_b.mdl', '{skeleton\r\n\t{bone "body"\r\n\t\t{VolumeView "../[src]/body.ply"}\r\n\t}\r\n}\r\n');
  G(HSD + 'ger_uniform.mtl', '{material bump\r\n\t{diffuse "$/_hum/u/unif"}\r\n\t{bump "$/_hum/u/unif_bp"}\r\n\t{color "230 230 230 25"}\r\n}\r\n');
  G(HSD + 'ger_pack.mtl', '{material bump\r\n\t{diffuse "$/_hum/u/pack"}\r\n}\r\n');
  G('resource/entity/humanskin/[ger]/[src]/body.ply', Buffer.from('EPLY\0\0ger_uniform.mtl\0\0', 'latin1'));
  G(UT + 'unif.dds', dds(64, 64)); G(UT + 'unif_bp.dds', dds(64, 64)); G(UT + 'pack.dds', dds(64, 64));
  G('resource/set/breed/mp/ger/early/at_1.set', '{breed\r\n\t{behaviour soldier}\r\n\t{skin "look1_a"}\r\n\t{icon "atrifle"}\r\n}\r\n');
  G('resource/set/breed/mp/ger/early/rifle.set', '{breed\r\n\t{skin "look1_b"}\r\n}\r\n');
  w(path.join(mod, 'mod.info'), '{Mod {Name "m"}}\r\n');
  const ctx = kit.ctxFor(scratch, { game: 'goh', gohDir: g });
  const mk = (answers, files, verb) => {
    const d = D.newId('skin'), st = D.stageDir(ctx, d); fs.mkdirSync(st, { recursive: true });
    for (const [k, b] of Object.entries(files || {})) fs.writeFileSync(path.join(st, k), b);
    return D.save(ctx, { id: d, recipe: 'skin', verb: verb || 'change', game: 'goh', mod, base: { id: 'zzt' }, answers, kept: [], state: 'open' });
  };
  const run = d => CP.compile(ctx, d, { skin: R });
  const refused = async (d, key) => { let e = null; try { await run(d); } catch (x) { e = x; } assert.ok(e, 'no refusal'); assert.equal(e.key, key, e.message); return e; };

  await t('games: goh in, no na; the GoH keys are in four languages without dashes', () => {
    assert.deepEqual(R.games, ['as64', 'mowas2', 'goh']); assert.ok(!R.na || !R.na.goh);
    for (const k of ['task.skin.e.nogoh', 'task.skin.e.gohsize', 'task.skin.e.gohalpha', 'task.skin.q.look_breed', 'task.skin.h.look_breed']) {
      const row = L.find(r => r[0] === k); assert.ok(row && row.length === 5 && row.slice(1).every(s => s && !DASH.test(s)), k);
    }
  });
  await t('lookup: the variants of zzt are 1 and the win wrapper', async () => {
    const r = await R.lookups.variant(ctx, '', { game: 'goh', in: 'zzt', mod });
    const ids = (r.results || []).map(x => x.id); assert.ok(ids.includes('1') && ids.includes('win'), JSON.stringify(r));
  });
  await t('no GoH folder refuses with its key; the breed question is asked on GoH only', async () => {
    let e = null; try { R.compile({ game: 'goh' }, { game: 'goh', gameDir: null, mod, value: () => undefined, answer: () => undefined, values: {} }); } catch (x) { e = x; }
    assert.ok(e && e.key === 'task.skin.e.nogoh', e && e.message);
    const q = R.groups[0].q.find(x => x.id === 'look_breed'); assert.deepEqual(q.when, { kind: ['soldier'], $game: ['goh'] });
  });
  await t('soldier look lookups: every GoH look by its def name; the breeds that wear the picked one', async () => {
    const r = await R.lookups.humanskin(ctx, 'look1', { game: 'goh', mod });
    assert.deepEqual(r.map(x => x.id + '@' + x.sub), ['look1_a@[ger]/look1', 'look1_b@[ger]/look1']);
    const d = mk({ kind: v('soldier'), look: { src: 'exist', value: 'look1_a' } });
    const b = await R.lookups.gohbreed(ctx, '', { game: 'goh', mod, draft: d.id });
    assert.deepEqual(b.map(x => x.id), ['resource/set/breed/mp/ger/early/at_1.set']);
  });
  await t('soldier look: a sibling folder with def, model (own folder parts made ../look1/..), materials; a PNG uniform made DDS; the breed', async () => {
    const r = await run(mk({ kind: v('soldier'), look: { src: 'exist', value: 'look1_a' }, look_id: v('look1_new'), look_breed: v(['resource/set/breed/mp/ger/early/at_1.set']),
      image_look: { src: 'file', staged: ['paint.png'] } }, { 'paint.png': png(64, 64, 255) }));
    const ND = 'resource/entity/humanskin/[ger]/look1_new/';
    const to = r.copies.map(x => x.to).sort();
    assert.deepEqual(to, [ND + 'ger_pack.mtl', ND + 'ger_uniform.mtl', ND + 'look1_new.def', ND + 'look1_new.mdl', 'resource/set/breed/mp/ger/early/at_1.set', 'resource/texture/common/_hum/arsenal_look1_new/unif.dds'].sort());
    assert.deepEqual(r.copies.find(x => x.to === ND + 'ger_pack.mtl'), { key: HSD + 'ger_pack.mtl', to: ND + 'ger_pack.mtl' });
    assert.equal(r.result, 'look1_new');
    assert.ok(r.notes.some(n => /1 part paths of look1_a\.mdl/.test(n)), JSON.stringify(r.notes));
  });
  await t('soldier look: a taken name, a picture named after nothing and no look refuse', async () => {
    for (const [ans, re] of [[{ look_id: v('look1_b') }, /already there/], [{ look_id: v('zz_new'), image_look: { src: 'file', staged: ['a.dds', 'nothing.dds'] } }, /name the picture after/], [{ look: { src: 'exist', value: 'nolook' }, look_id: v('x1') }, /Pick the soldier look/]]) {
      let e = null; try { await run(mk(Object.assign({ kind: v('soldier'), look: { src: 'exist', value: 'look1_a' } }, ans), { 'a.dds': dds(64, 64), 'nothing.dds': dds(64, 64) })); } catch (x) { e = x; }
      assert.ok(e && re.test(e.message), e && e.message);
    }
  });
  await t('soldier look write: the new folder, the rewritten uniform material, the DDS and the breed land in the mod, CRLF kept', async () => {
    const r = await CP.write(ctx, mk({ kind: v('soldier'), look: { src: 'exist', value: 'look1_a' }, look_id: v('look1_w'), look_breed: v(['resource/set/breed/mp/ger/early/at_1.set']),
      image_look: { src: 'file', staged: ['unif_bp.dds'] } }, { 'unif_bp.dds': dds(64, 64) }), { skin: R });
    assert.ok(r.written, JSON.stringify(r.errors));
    const M = k => fs.readFileSync(path.join(mod, ...k.split('/')), 'latin1'), ND = 'resource/entity/humanskin/[ger]/look1_w/';
    assert.ok(/\{extension "look1_w\.mdl"\}\{RimLight\}\r\n/.test(M(ND + 'look1_w.def')), M(ND + 'look1_w.def'));
    const mdl = M(ND + 'look1_w.mdl'); assert.ok(/"\.\.\/\[src\]\/body\.ply"/.test(mdl) && /"\.\.\/look1\/heads\/h1\.ply"/.test(mdl), mdl);
    const mt = M(ND + 'ger_uniform.mtl'); assert.ok(/\{diffuse "\$\/_hum\/u\/unif"\}/.test(mt) && /\{bump "\$\/_hum\/arsenal_look1_w\/unif_bp"\}/.test(mt) && !/(^|[^\r])\n/.test(mt), mt);
    assert.equal(M('resource/texture/common/_hum/arsenal_look1_w/unif_bp.dds').slice(0, 4), 'DDS ');
    assert.ok(/\{skin "look1_w"\}/.test(M('resource/set/breed/mp/ger/early/at_1.set')));
    assert.ok(/\{skin "look1_a"\}/.test(fs.readFileSync(path.join(g, 'resource', 'set', 'breed', 'mp', 'ger', 'early', 'at_1.set'), 'latin1')));
    assert.ok(r.restore.length > 0);
  });
  await t('camo PNG on Winter: DXT1 made here, copied to zzt#win.dds, no def line (seasons.inc maps it)', async () => {
    const r = await run(mk({ kind: v('camo'), option: v('Winter'), image: { src: 'file', staged: ['snow.png'] } }, { 'snow.png': png(64, 64, 255) }));
    assert.equal(r.copies.length, 1); assert.equal(r.copies[0].to, TEX + '#win.dds'); assert.equal(r.copies[0].staged, 'dds/snow.dds');
    assert.equal(r.calls.length, 0, JSON.stringify(r.calls)); assert.equal(r.result, 'win');
    assert.ok(r.notes.some(x => /shared texture folder/.test(x)) && r.notes.some(x => /\.ebm is a wrapper/.test(x)) && r.notes.some(x => /maps Winter to win/.test(x)), JSON.stringify(r.notes));
  });
  await t('camo PNG: see through and odd sides refuse with their keys', async () => {
    const a = await refused(mk({ kind: v('camo'), image: { src: 'file', staged: ['a.png'] } }, { 'a.png': png(64, 64, 128) }), 'task.skin.e.gohalpha');
    assert.deepEqual(a.params, { n: 'a.png' });
    const s = await refused(mk({ kind: v('camo'), image: { src: 'file', staged: ['s.png'] } }, { 's.png': png(62, 64, 255) }), 'task.skin.e.gohsize');
    assert.deepEqual(s.params, { n: 's.png', w: 62, h: 64 });
  });
  await t('camo DDS on V3 named task3: copy plus the camo-write route', async () => {
    const r = await run(mk({ kind: v('camo'), option: v('V3'), variant: v('task3'), image: { src: 'file', staged: ['c.dds'] } }, { 'c.dds': dds(64, 64) }));
    assert.equal(r.copies[0].to, TEX + '#task3.dds'); assert.equal(r.copies[0].staged, 'c.dds');
    assert.deepEqual(r.calls.map(c => [c.route, c.body.name, c.body.option, c.body.variant]), [['POST /api/x/art/camo-write', 'zzt', 'V3', 'task3']]);
  });
  await t('replace: DDS over zzt.dds; a PNG refuses', async () => {
    const r = await run(mk({ kind: v('replace'), texture: v(TEX + '.dds'), image_dds: { src: 'file', staged: ['m.dds'] } }, { 'm.dds': dds(64, 64) }));
    assert.deepEqual(r.copies, [{ staged: 'm.dds', to: TEX + '.dds' }]);
    let e = null; try { await run(mk({ kind: v('replace'), texture: v(TEX + '.dds'), image_dds: { src: 'file', staged: ['m.png'] } }, { 'm.png': png(64, 64, 255) })); } catch (x) { e = x; }
    assert.ok(e && /not a DDS/.test(e.message), e && e.message);
  });
  await t('fixed: a gen set row {texmod "1"}; an unknown scheme with no picture refuses', async () => {
    const r = await run(mk({ kind: v('fixed'), wear: { src: 'exist', value: '1' } }));
    assert.deepEqual(r.gen.ops, [{ op: 'set', rows: [{ entity: 'file:' + DIR + 'zzt.def', path: 'game_entity/texmod', value: '"1"', op: 'add' }] }]);
    let e = null; try { await run(mk({ kind: v('fixed'), wear: v('nosuch') })); } catch (x) { e = x; }
    assert.ok(e && /no paint scheme nosuch yet/.test(e.message), e && e.message);
  });
  await t('write: camo on V3 and fixed 1 land in the mod with restore points; the game stays as it was', async () => {
    const before = fs.readFileSync(path.join(g, ...(DIR + 'zzt.def').split('/')), 'utf8');
    const a = await CP.write(ctx, mk({ kind: v('camo'), option: v('V3'), variant: v('task3'), image: { src: 'file', staged: ['c.png'] } }, { 'c.png': png(64, 64, 255) }), { skin: R });
    assert.ok(a.written, JSON.stringify(a.errors));
    const pic = fs.readFileSync(path.join(mod, ...(TEX + '#task3.dds').split('/')));
    assert.equal(pic.toString('latin1', 0, 4), 'DDS '); assert.equal(pic.toString('latin1', 84, 88), 'DXT1');
    const def = fs.readFileSync(path.join(mod, ...(DIR + 'zzt.def').split('/')), 'utf8');
    assert.ok(/TexMods/.test(def) && /"V3"\s+"task3"/.test(def), def); assert.ok(!/(^|[^\r])\n/.test(def), 'def CRLF');
    assert.ok(a.restore.length > 0);
    const b = await CP.write(ctx, mk({ kind: v('fixed'), wear: { src: 'exist', value: '1' } }), { skin: R });
    assert.ok(b.written, JSON.stringify(b.errors));
    const def2 = fs.readFileSync(path.join(mod, ...(DIR + 'zzt.def').split('/')), 'utf8');
    assert.ok(/\{texmod "1"\}/.test(def2) && /"V3"\s+"task3"/.test(def2), def2);
    assert.equal(fs.readFileSync(path.join(g, ...(DIR + 'zzt.def').split('/')), 'utf8'), before);
  });
  fs.rmSync(g, { recursive: true, force: true });
  console.log(n + ' passed, 0 failed');
  console.log('PASS');
})().catch(e => { console.error(e); console.log('FAIL'); process.exit(1); });
