// recipe "icon" games test: node icon.games.test.js <scratch>. A made-up AS2 install (as64.exe, a stock icon and one that only
// as64/core has): the as64 view (art core, as before) has both, the mowas2 view (exe mowas_2) has the stock one only; a mod's own
// picture is seen first in the mowas2 view. GoH (a made-up install: call_to_arms.exe, a 144x72 buy card in TGA, a shop card in PNG, a
// shop card that is an .ebm): goh is in games with no na; the name lookup lists the shop names; a brought PNG becomes 8 TGA frames at
// 144x72 and 112x48; a shop card the game has in PNG is written as PNG at the game's size; a name with a game .ebm gets its own .ebm;
// a picked game card is read and copied frame by frame; a missing GoH folder refuses with its key; the damage scheme is the vehicle
// view (vehicle_view/zz_tank: body.ebm naming body.tga 40x80, a part mask, a turret sprite): a picture replaces body.tga at its size, a
// new name copies a picked view's folder; the write puts every file into the mod.
// Author: Imperator_Aug (ARSENAL, ia-cf95e747)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-icon-games-')));
fs.mkdirSync(scratch, { recursive: true });
const R = require('./icon.recipe'), L = require('./icon.lang');
const DASH = new RegExp('[' + String.fromCharCode(0x2010) + '-' + String.fromCharCode(0x2015) + ']');
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok ' + name); };
const IC = 'resource/interface/scene/unit_icon/';

(async () => {
  const g = fs.mkdtempSync(path.join(scratch, 'as2-')), mod = fs.mkdtempSync(path.join(scratch, 'mod-'));
  w(path.join(g, 'as64.exe'), 'x');
  w(path.join(g, ...(IC + 'zz_stock_00.tga').split('/')), 'stock');
  w(path.join(g, 'as64', 'core', ...(IC + 'zz_core_00.tga').split('/')), 'core');
  w(path.join(mod, 'mod.info'), '{Mod {Name "m"}}\r\n');
  w(path.join(mod, ...(IC + 'zz_stock_00.tga').split('/')), 'own');
  await t('gidOf: function, word, none', () => {
    assert.equal(R.gidOf({ gameId: () => 'mowas2' }), 'mowas2');
    assert.equal(R.gidOf({ gameId: 'goh' }), 'goh');
    assert.equal(R.gidOf({}), 'as64');
  });
  await t('view: as64 has as64/core, mowas2 does not, the mod first', () => {
    const a = R.viewOf(g, null, 'as64'), m = R.viewOf(g, mod, 'mowas2');
    assert.ok(a.has(IC + 'zz_core_00.tga') && a.has(IC + 'zz_stock_00.tga'));
    assert.ok(!m.has(IC + 'zz_core_00.tga') && m.has(IC + 'zz_stock_00.tga'));
    assert.equal(m.readAny(m.get(IC + 'zz_stock_00.tga')).toString(), 'own');
    assert.ok([...m.keys()].every(k => k !== IC + 'zz_core_00.tga'));
  });
  await t('view: mowas2 shares the Art page cache (folder and exe), apart from as64', () => {
    const C = require('../../art/core'), m = R.viewOf(g, null, 'mowas2'), a = R.viewOf(g, null, 'as64');
    assert.strictEqual(m.g, C.game({ dir: g, exe: 'mowas_2', kind: 'as2' }).files);
    assert.notStrictEqual(m.g, a.g);
  });
  // ---- Gates of Hell ----
  const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile'), I = require('../../../../unitcard/lib/img'), A = require('../../../../artport/artport');
  const gh = fs.mkdtempSync(path.join(scratch, 'goh-')), gmod = path.join(scratch, 'mods', 'icon_goh');
  const G = (k, b) => w(path.join(gh, ...k.split('/')), b), SP = 'resource/interface/scene/portrait_squad/';
  G('binaries/x64/call_to_arms.exe', 'x');
  for (let i = 0; i < 4; i++) {
    G(IC + 'zz_tank_0' + i + '.tga', I.tga(I.blank(144, 72, [10 * i, 0, 0, 255])));
    G(SP + 'zz_tank_0' + i + '.png', I.png(I.blank(100, 120, [0, 10 * i, 0, 255])));
    G(SP + 'eng_man_0' + i + '.tga', I.tga(I.blank(112, 140, [0, 0, 9, 255])));
  }
  const VV = 'resource/interface/scene/vehicle_view/';
  G(VV + 'zz_tank/body.ebm', '{bitmap\r\n\t{Axis 20 40}\r\n\t{Frame "body.tga" 100}\r\n}');
  G(VV + 'zz_tank/body.tga', I.tga(I.blank(40, 80, [200, 200, 200, 255])));
  G(VV + 'zz_tank/damage/body.ebm', '{bitmap\r\n\t{Axis 20 40}\r\n\t{Frame "body.tga" 100}\r\n}');
  G(VV + 'zz_tank/damage/body.tga', I.tga(I.blank(40, 80, [255, 255, 255, 255])));
  G(VV + 'zz_tank/turret.ebm', '{bitmap\r\n\t{Frame "/interface/scene/vehicle_view/fov_turret.tga" 100}\r\n}');
  G(SP + 'single_man(eng).ebm', '{bitmap\r\n    {frame "eng_man_00.tga"}\r\n    {frame "eng_man_01.tga"}\r\n    {frame "eng_man_02.tga"}\r\n    {frame "eng_man_03.tga"}\r\n}\r\n');
  w(path.join(gmod, 'mod.info'), '{Mod {Name "m"}}\r\n');
  const ctx = kit.ctxFor(scratch, { game: 'goh', gohDir: gh });
  const v = x => ({ src: 'value', value: x });
  const mk = (answers, files, verb) => {
    const d = D.newId('icon'), st = D.stageDir(ctx, d); fs.mkdirSync(st, { recursive: true });
    for (const [k, b] of Object.entries(files || {})) fs.writeFileSync(path.join(st, k), b);
    return D.save(ctx, { id: d, recipe: 'icon', verb: verb || 'make', game: 'goh', mod: gmod, base: { id: 'zz_tank' }, answers, kept: [], state: 'open' });
  };
  const run = d => CP.compile(ctx, d, { icon: R });
  const pic = A.encodePng({ w: 300, h: 150, rgba: Buffer.alloc(300 * 150 * 4, 255) });
  await t('GoH: in games, no na; kind_goh and name_goh asked on GoH only; the new rows in four languages', () => {
    assert.deepEqual(R.games, ['as64', 'mowas2', 'goh']); assert.ok(!R.na || !R.na.goh);
    const Q = {}; for (const gr of R.groups) for (const q of gr.q) Q[q.id] = q;
    assert.deepEqual(Q.kind.when.$game, ['as64', 'mowas2']); assert.equal(Q.kind_goh.when.$game, 'goh');
    assert.deepEqual(Q.kind_goh.limits.values, ['icon', 'shop', 'portrait', 'squad', 'scheme']); assert.equal(Q.name_goh.picker.in, 'kind_goh');
    for (const k of ['task.icon.h.kindgoh', 'task.icon.v.kind_goh.shop', 'task.icon.v.kind_goh.scheme', 'task.icon.e.nogoh']) {
      const row = L.find(r => r[0] === k); assert.ok(row && row.length === 5 && row.slice(1).every(s => s && !DASH.test(s)), k);
    }
  });
  await t('GoH: values and lookups', async () => {
    const vs = await R.values(ctx, { id: 'zz_tank' }, { verb: 'change' });
    assert.equal(vs.kind_goh, 'icon'); assert.equal(vs.name_goh, 'zz_tank');
    const nm = await R.lookups.iconname(ctx, '', { in: 'shop', mod: gmod });
    assert.deepEqual(nm.results.map(x => x.id).sort(), ['eng_man', 'single_man(eng)', 'zz_tank']);
    const ic = await R.lookups.icon(ctx, 'zz_tank', { mod: gmod });
    assert.deepEqual(ic.map(x => x.where).sort(), ['portrait_squad', 'unit_icon', 'vehicle_view']);
    const sv = await R.lookups.iconname(ctx, '', { in: 'scheme', mod: gmod });
    assert.deepEqual(sv.results.map(x => x.id), ['zz_tank']);
  });
  await t('GoH: a brought PNG on a new name: 4 TGA frames at 144x72 and 4 at 112x48', async () => {
    const r = await run(mk({ kind_goh: v('icon'), name_goh: v('zz_new'), image: { src: 'file', staged: ['p.png'] } }, { 'p.png': pic }));
    assert.equal(r.copies.length, 8); assert.ok(r.copies.every(c => /\.tga$/.test(c.to)));
    assert.ok(r.copies.some(c => c.to === 'resource/interface/scene/unit_icon_small/zz_new_03.tga'));
    assert.ok(r.notes.some(x => /unit_icon 144x72, unit_icon_small 112x48/.test(x)), JSON.stringify(r.notes));
    assert.ok(r.notes.some(x => /no icon picture named zz_new/.test(x)));
  });
  await t('GoH: a shop card the game has in PNG is written as PNG at its size; a game .ebm gets the mod its own', async () => {
    const r = await run(mk({ kind_goh: v('shop'), name_goh: v('zz_tank'), image: { src: 'file', staged: ['p.png'] } }, { 'p.png': pic }));
    assert.deepEqual(r.copies.map(c => c.to), [0, 1, 2, 3].map(i => SP + 'zz_tank_0' + i + '.png'));
    assert.ok(r.notes.some(x => /portrait_squad 100x120/.test(x)), JSON.stringify(r.notes));
    const e = await run(mk({ kind_goh: v('shop'), name_goh: v('single_man(eng)'), image: { src: 'file', staged: ['p.png'] } }, { 'p.png': pic }));
    assert.deepEqual(e.copies.map(c => c.to), [0, 1, 2, 3].map(i => SP + 'single_man(eng)_0' + i + '.tga').concat([SP + 'single_man(eng).ebm']));
    assert.ok(e.notes.some(x => /own \.ebm/.test(x)));
  });
  await t('GoH damage view: a picture replaces body.tga at its size; a new name copies a picked view; no view to copy refuses', async () => {
    const r = await run(mk({ kind_goh: v('scheme'), name_goh: v('zz_tank'), newimage: { src: 'file', staged: ['p.png'] } }, { 'p.png': pic }, 'change'));
    assert.deepEqual(r.copies, [{ staged: 'icon/vehicle_view/zz_tank/body.tga', to: VV + 'zz_tank/body.tga' }]);
    assert.ok(r.notes.some(x => /scaled to 40x80/.test(x)), JSON.stringify(r.notes));
    const c = await run(mk({ kind_goh: v('scheme'), name_goh: v('zz_new'), image: { src: 'exist', value: VV + 'zz_tank/body.ebm' } }));
    assert.deepEqual(c.copies.map(x => x.key + '>' + x.to).sort(), ['body.ebm', 'body.tga', 'damage/body.ebm', 'damage/body.tga', 'turret.ebm'].map(f => VV + 'zz_tank/' + f + '>' + VV + 'zz_new/' + f).sort());
    const b = await run(mk({ kind_goh: v('scheme'), name_goh: v('zz_new'), image: { src: 'file', staged: ['p.png'] } }, { 'p.png': pic }));
    assert.equal(b.copies.length, 5); assert.deepEqual(b.copies.find(x => x.to === VV + 'zz_new/body.tga'), { staged: 'icon/vehicle_view/zz_new/body.tga', to: VV + 'zz_new/body.tga' });
    const d = D.save(ctx, Object.assign(D.load(ctx, mk({ kind_goh: v('scheme'), name_goh: v('zz_other'), image: { src: 'file', staged: ['p.png'] } }, { 'p.png': pic }).id), { base: { id: 'nothing' } }));
    let e = null; try { await run(d); } catch (x) { e = x; } assert.ok(e && /no damage view named zz_other/.test(e.message), e && e.message);
  });
  await t('GoH: a picked game card is copied frame by frame; no folder refuses with its key', async () => {
    const r = await run(mk({ kind_goh: v('icon'), name_goh: v('zz_copy'), image: { src: 'exist', value: IC + 'zz_tank_00.tga' } }));
    assert.deepEqual(r.copies.map(c => c.to), [0, 1, 2, 3].map(i => IC + 'zz_copy_0' + i + '.tga'));
    assert.ok(r.notes.some(x => /unit_icon_small\/zz_copy_00\.tga in the game: it is left out/.test(x)), JSON.stringify(r.notes));
    let e = null; try { R.compile({ game: 'goh' }, { game: 'goh', gameDir: null, mod: gmod, value: () => undefined, answer: () => undefined, values: {} }); } catch (x) { e = x; }
    assert.equal(e && e.key, 'task.icon.e.nogoh');
  });
  await t('GoH: the write puts the frames and the .ebm into the mod, the game stays', async () => {
    const r = await CP.write(ctx, mk({ kind_goh: v('shop'), name_goh: v('single_man(eng)'), image: { src: 'file', staged: ['p.png'] } }, { 'p.png': pic }), { icon: R });
    assert.ok(r.written, JSON.stringify(r.errors));
    const f0 = path.join(gmod, ...(SP + 'single_man(eng)_00.tga').split('/')), t0 = I.decode(fs.readFileSync(f0), f0);
    assert.equal(t0.w + 'x' + t0.h, '112x140');
    const ebm = fs.readFileSync(path.join(gmod, ...(SP + 'single_man(eng).ebm').split('/')), 'latin1');
    assert.ok(/\{frame "single_man\(eng\)_03\.tga"\}/.test(ebm) && !/(^|[^\r])\n/.test(ebm), ebm);
    assert.ok(r.restore.length > 0);
    assert.ok(/eng_man_00/.test(fs.readFileSync(path.join(gh, ...(SP + 'single_man(eng).ebm').split('/')), 'latin1')));
    const s = await CP.write(ctx, mk({ kind_goh: v('scheme'), name_goh: v('zz_tank'), newimage: { src: 'file', staged: ['p.png'] } }, { 'p.png': pic }, 'change'), { icon: R });
    assert.ok(s.written, JSON.stringify(s.errors));
    const bf = path.join(gmod, ...(VV + 'zz_tank/body.tga').split('/')), bt = I.decode(fs.readFileSync(bf), bf);
    assert.equal(bt.w + 'x' + bt.h, '40x80'); assert.ok(s.restore.length > 0);
  });
  fs.rmSync(gh, { recursive: true, force: true });
  fs.rmSync(g, { recursive: true, force: true }); fs.rmSync(mod, { recursive: true, force: true });
  console.log(n + ' passed, 0 failed');
  console.log('PASS');
})().catch(e => { console.error(e); console.log('FAIL'); process.exit(1); });
