// recipe "armour" games test: node armour.games.test.js <scratch>. A made-up Gates of Hell install (call_to_arms.exe, a tank zzt whose
// def includes zzt.ext {volume "body1" {thickness 30 {front 80}}} + ("shield" args "mantlet" 50) and a track file shared from another
// folder, a wreck view x/zzt_x): goh is in games with no na; the GoH keys are in four languages without dashes; the lookup lists zzt
// and not its wreck; values give one line per part; compile turns changed lines into goharmour set rows (base and sides, a removed side
// back to the base, a percent as a scale, a side kept at the old base while the base changes), the armour class, repair times, volume
// keys and hull material; refuses a side of a macro line, an unknown part, another family's class, an AS2 answer and no GoH folder;
// Write changes only the mod (CRLF kept, the game untouched) with a lib/modwrite restore point per file, and a shared file is copied
// next to the unit with its include pointed there. Synthetic fixtures only; nothing here is tested in game [T].
// Author: Imperator_Aug (ARSENAL, ia-goh-armour)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-armour-games-')));
fs.mkdirSync(scratch, { recursive: true });
const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile');
const R = require('./armour.recipe'), L = require('./armour.lang'), GH = require('./armour.goh');
const MW = require('../../../../lib/modwrite');
const DASH = new RegExp('[' + String.fromCharCode(0x2010) + '-' + String.fromCharCode(0x2015) + ']');
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok ' + name); };
const v = x => ({ src: 'value', value: x });
const DIR = 'resource/entity/-vehicle/germany/tank_medium/zzt/', DEF = DIR + 'zzt.def', TRK = 'resource/entity/-vehicle/germany/common/track.ext';

(async () => {
  const g = fs.mkdtempSync(path.join(scratch, 'goh-')), mods = fs.mkdtempSync(path.join(scratch, 'mods-')), mod = path.join(mods, 'armour_goh');
  const G = (k, s) => w(path.join(g, ...k.split('/')), s);
  G('binaries/x64/call_to_arms.exe', 'x');
  G(DEF, '{game_entity\r\n\t(include "zzt.ext")\r\n\t(include "/entity/-vehicle/germany/common/track.ext")\r\n\t("tank_medium_tier1")\r\n\t{Chassis ("mobility_tank" speed(38) reverse(9))}\r\n}\r\n');
  G(DIR + 'zzt.ext', '{volume "body1"\r\n\t{thickness 30 {front 80}}\r\n\t{CastSteel 0.8}\r\n}\r\n("shield" args "mantlet" 50)\r\n');
  G('resource/properties/armor.ext', '(define "tank_medium_tier1"\r\n\t("general_durability" body(300))\r\n)\r\n(define "tank_heavy_tier1"\r\n\t("general_durability" body(450))\r\n)\r\n(define "armor_light_cannon"\r\n\t("cannon_durability" body(150))\r\n)\r\n');
  G(TRK, '("tracks" repair(30) thickness(20))\r\n');
  G('resource/entity/-vehicle/germany/tank_medium/x/zzt_x/zzt_x.def', '{game_entity\r\n}\r\n');
  w(path.join(mod, 'mod.info'), '{Mod {Name "m"}}\r\n');
  const ctx = kit.ctxFor(scratch, { game: 'goh', gohDir: g });
  const base = { id: 'zzt', ref: { key: DEF } };
  const mk = answers => D.save(ctx, { id: D.newId('armour'), recipe: 'armour', verb: 'change', game: 'goh', mod, base, answers, kept: [], state: 'open' });
  const run = d => CP.compile(ctx, d, { armour: R });
  const refused = async (d, re) => { let e = null; try { await run(d); } catch (x) { e = x; } assert.ok(e && re.test(e.message), e ? e.message : 'no refusal'); return e; };
  const M = k => fs.readFileSync(path.join(mod, ...k.split('/')), 'latin1');

  await t('games: goh in, no na; the GoH keys are in four languages without dashes; AS2 questions on the AS2 tabs only', () => {
    assert.deepEqual(R.games, ['as64', 'mowas2', 'goh']); assert.ok(!R.na || !R.na.goh);
    for (const k of ['task.armour.g.goh', 'task.armour.q.gohpct', 'task.armour.h.gohpct', 'task.armour.q.gohparts', 'task.armour.h.gohparts', 'task.armour.e.nogoh',
      'task.armour.g.gohmore', 'task.armour.q.gohpreset', 'task.armour.h.gohpreset', 'task.armour.q.gohrepair', 'task.armour.h.gohrepair', 'task.armour.q.gohvolx',
      'task.armour.h.gohvolx', 'task.armour.q.gohmaterial', 'task.armour.h.gohmaterial', 'task.armour.v.gohmaterial.steel', 'task.armour.v.gohmaterial.wood']) {
      const row = L.find(r => r[0] === k); assert.ok(row && row.length === 5 && row.slice(1).every(s => s && !DASH.test(s)), k);
    }
    const qs = [].concat(...R.groups.map(x => x.q));
    for (const q of qs) assert.deepEqual(q.when.$game, /^goh/.test(q.id) ? ['goh'] : ['as64', 'mowas2'], q.id);
    assert.equal(R.groups[0].id, 'goh'); assert.ok(R.groups[0].essential);
  });
  await t('lookup: the GoH vehicle defs, not the wreck view', async () => {
    const r = await R.lookups.vehicle(ctx, 'zzt', { game: 'goh', mod });
    assert.deepEqual(r.map(x => x.id + '@' + x.ref.key), ['zzt@' + DEF]);
  });
  await t('values: one line per part (base, then the sides that differ)', async () => {
    const x = await R.values(Object.assign({}, ctx, { mod }), base, { game: 'goh' });
    assert.deepEqual(x.gohparts.slice().sort(), ['(tracks) 20', 'body1 30, front 80', 'mantlet 50']);
    assert.equal(x.gohpct, 100); assert.equal(x._goh.def, DEF); assert.equal(x._goh.unit, 'zzt');
    assert.ok(x._goh.parts.find(p => p.name === '(tracks)').shared);
    assert.deepEqual(x.gohrepair, ['tracks 30']); assert.deepEqual(x.gohvolx, ['body1 caststeel 0.8']);
    assert.equal(x.gohpreset, 'tank_medium_tier1'); assert.deepEqual(x._goh.presets.slice().sort(), ['tank_heavy_tier1', 'tank_medium_tier1']);
  });
  await t('compile: changed lines become set rows; a removed side goes back to the base; one call to the own route', async () => {
    const r = await run(mk({ gohparts: v(['body1 40, top 15', 'mantlet 50', '(tracks) 20']) }));
    assert.equal(r.calls.length, 1); assert.equal(r.calls[0].route, 'POST /api/x/task/r/armour/goh'); assert.equal(r.calls[0].dryFlag, 'write');
    assert.equal(r.calls[0].body.def, DEF);
    assert.deepEqual(r.calls[0].body.change, { set: [{ part: 'body1', side: 'base', mm: 40 }, { part: 'body1', side: 'front', mm: 40 }, { part: 'body1', side: 'top', mm: 15 }] });
    assert.equal(r.result, 'zzt');
  });
  await t('compile: a percent is a scale; nothing changed writes nothing', async () => {
    const r = await run(mk({ gohpct: v(150) }));
    assert.deepEqual(r.calls[0].body.change, { scale: 1.5 });
    const z = await run(mk({}));
    assert.equal(z.calls.length, 0); assert.ok(z.notes.some(x => /nothing to write/.test(x)), JSON.stringify(z.notes));
  });
  await t('compile: a base change that keeps a side at the old base is one run; class, repair, volume keys and hull become their rows', async () => {
    const r = await run(mk({ gohparts: v(['body1 40, front 80, top 30']) }));
    assert.deepEqual(r.calls[0].body.change, { set: [{ part: 'body1', side: 'base', mm: 40 }, { part: 'body1', side: 'top', mm: 30 }] });
    const m = await run(mk({ gohpreset: v('tank_heavy_tier1'), gohrepair: v(['tracks 45']), gohvolx: v(['body1 caststeel 0.7', 'body1 highhardness yes']), gohmaterial: v('wood') }));
    assert.deepEqual(m.calls[0].body.change, { repair: [{ part: 'tracks', s: 45 }], volx: [{ part: 'body1', key: 'caststeel', value: '0.7' }, { part: 'body1', key: 'highhardness', value: 'yes' }], preset: 'tank_heavy_tier1', material: 'wood' });
    const gone = await run(mk({ gohvolx: v([]) }));
    assert.deepEqual(gone.calls[0].body.change, { volx: [{ part: 'body1', key: 'caststeel', value: 'none' }] });
  });
  await t('compile refuses: a side of a macro line, an unknown part, another family\'s class, a repair of a part with none, an AS2 answer', async () => {
    await refused(mk({ gohparts: v(['mantlet front 60']) }), /one number for every side/);
    await refused(mk({ gohparts: v(['hull9 30']) }), /not an armoured part of zzt/);
    await refused(mk({ gohpreset: v('armor_light_cannon') }), /not an armour class of the same kind as tank_medium_tier1/);
    await refused(mk({ gohrepair: v(['turret 20']) }), /no repair time of its own/);
    await refused(mk({ gohvolx: v(['hull9 caststeel 0.5']) }), /not a volume written/);
    await refused(mk({ preset: v('armor_heavy') }), /^Not available in GoH.*\[preset\]/);
  });
  await t('no GoH folder: compile and the route refuse with the key', async () => {
    let e = null; try { await R.compile({ game: 'goh' }, { game: 'goh', gameDir: null, mod, values: {}, value: () => undefined, answer: () => undefined, kept: () => false }); } catch (x) { e = x; }
    assert.ok(e && e.key === 'task.armour.e.nogoh', e && e.message);
    const none = { gohDir: () => null, game: () => null, gameId: () => 'goh', task: { kind: 'goh', dir: null } };
    // gohDirOf falls back to the found install; a route ctx with none and no install on this machine refuses; with one it reads
    let r = null; e = null; try { r = await GH.gohRoute(null, { mod, def: '../x.def', change: { scale: 2 } }, Object.assign({}, ctx, none)); } catch (x) { e = x; }
    assert.ok(e && !r, 'refused');
  });
  await t('route: a def path out of resource/entity is refused; the dry run names the files and writes nothing', async () => {
    let e = null; try { await GH.gohRoute(null, { mod, def: 'resource/entity/../../x.def', change: { scale: 2 } }, ctx); } catch (x) { e = x; }
    assert.ok(e && /unit file as written/.test(e.message), e && e.message);
    const r = await GH.gohRoute(null, { mod, def: DEF, change: { set: [{ part: 'body1', side: 'all', mm: 45 }] } }, ctx);
    assert.deepEqual(r.files, [DIR + 'zzt.ext']); assert.ok(!fs.existsSync(path.join(mod, 'resource')));
  });
  await t('write: only the mod changes (CRLF kept), a lib/modwrite restore point per file, the game untouched', async () => {
    const before = fs.readFileSync(path.join(g, ...(DIR + 'zzt.ext').split('/')), 'latin1');
    const r = await CP.write(ctx, mk({ gohparts: v(['body1 40, front 90, top 15', 'mantlet 55', '(tracks) 20']) }), { armour: R });
    assert.ok(r.written, JSON.stringify(r.errors));
    const ext = M(DIR + 'zzt.ext');
    assert.ok(ext.includes('{thickness 40 {front 90} {top 15}}') && ext.includes('"mantlet" 55') && !/(^|[^\r])\n/.test(ext), ext);
    assert.equal(fs.readFileSync(path.join(g, ...(DIR + 'zzt.ext').split('/')), 'latin1'), before);
    const root = MW.restoreRoot(mod), pts = fs.readdirSync(root).map(id => JSON.parse(fs.readFileSync(path.join(root, id, 'restore-point.json'), 'utf8')));
    assert.ok(pts.some(p => p.action === 'task-armour-goh' && p.rel === DIR + 'zzt.ext' && !p.existed), JSON.stringify(pts.map(p => p.action + ':' + p.rel)));
  });
  await t('write: a part in a file shared from another folder is copied next to the unit, the include points there', async () => {
    const r = await CP.write(ctx, mk({ gohparts: v(['(tracks) 25']) }), { armour: R });
    assert.ok(r.written, JSON.stringify(r.errors));
    assert.ok(/\(include "zzt_track\.ext"\)/.test(M(DEF)) && /\(include "zzt\.ext"\)/.test(M(DEF)), M(DEF));
    assert.ok(M(DIR + 'zzt_track.ext').includes('thickness(25)'));
    assert.ok(!fs.existsSync(path.join(mod, ...TRK.split('/'))) && fs.readFileSync(path.join(g, ...TRK.split('/')), 'latin1').includes('thickness(20)'));
    assert.ok(r.notes.some(x => /shared with other units/.test(x)), JSON.stringify(r.notes));
  });
  await t('write: class, volume key and a kept side in one run land in the mod (CRLF kept)', async () => {
    const r = await CP.write(ctx, mk({ gohparts: v(['body1 50, front 80, top 30']), gohpreset: v('tank_heavy_tier1'), gohvolx: v(['body1 caststeel 0.75']) }), { armour: R });
    assert.ok(r.written, JSON.stringify(r.errors));
    const ext = M(DIR + 'zzt.ext'), def = M(DEF);
    assert.ok(/thickness 50/.test(ext) && /\{top 30\}/.test(ext) && /\{CastSteel 0\.75\}/.test(ext) && !/(^|[^\r])\n/.test(ext), ext);
    assert.ok(/\("tank_heavy_tier1"\)/.test(def) && !/tank_medium_tier1/.test(def) && !/(^|[^\r])\n/.test(def), def);
  });
  fs.rmSync(g, { recursive: true, force: true });
  console.log(n + ' passed, 0 failed');
  console.log('PASS');
})().catch(e => { console.error(e); console.log('FAIL'); process.exit(1); });
