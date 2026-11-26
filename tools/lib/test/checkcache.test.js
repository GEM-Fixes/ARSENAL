// lib/checkcache unit test (async: run as its own process by test.js). Scratch folders only; scratch store (cachestore test rule).
// Author: Imperator_Aug (ARSENAL, ia-7d630b9a)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const cc = require('../checkcache');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'checkcache-'));
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
let n = 0, bad = 0;
const t = async (name, fn) => { try { await fn(); n++; } catch (e) { bad++; console.log('FAIL ' + name + ': ' + (e && e.stack || e)); } };
(async () => {
  const G = path.join(tmp, 'game'), mod = path.join(tmp, 'outside', 'mymod'), dep = path.join(G, 'mods', 'dep'), lk = path.join(tmp, 'linked');
  w(path.join(G, 'mowas_2.exe'), 'x'); w(path.join(G, 'resource', 'set', 'a.set'), '{a}'); w(path.join(G, 'mods', 'other', 'mod.info'), '{Mod}');
  w(path.join(dep, 'mod.info'), '{Mod\r\n\t{Name "dep"}\r\n}\r\n'); w(path.join(dep, 'resource', 'set', 'deep', 'd.set'), '{d}');
  w(path.join(mod, 'mod.info'), '{Mod\r\n\t{Name "m"}\r\n\t{Require "dep"}\r\n}\r\n'); w(path.join(mod, 'resource', 'set', 'x.set'), '{x}');
  w(path.join(lk, 'y.set'), '{y}');
  let linked = true; try { fs.symlinkSync(lk, path.join(mod, 'resource', 'set', 'lk'), 'junction'); } catch (e) { linked = false; }
  const spec = { mod, games: [G], args: { a: 1, b: [2] } };
  const sig = () => cc.signature(spec);
  const s0 = await sig();
  const moved = async (what, change, key) => { const a = await sig(); change(); const b = await sig(); assert.notStrictEqual(a.stamps[key], b.stamps[key], what + ': ' + key + ' did not move'); assert.ok(!cc.same(a, b), what); };
  await t('same tree same signature', async () => { const s1 = await sig(); assert.ok(cc.same(s0, s1)); assert.deepStrictEqual(Object.keys(s1.stamps).sort(), ['deps', 'env', 'game', 'mod', 'tools', 'with']); assert.ok(s1.ms >= 0); });
  await t('args key order does not matter, values do', async () => {
    const a = await cc.signature({ ...spec, args: { b: [2], a: 1 } }); assert.ok(cc.same(s0, a));
    const b = await cc.signature({ ...spec, args: { a: 2, b: [2] } }); assert.ok(!cc.same(s0, b)); assert.strictEqual(canonEq(s0.stamps, b.stamps), true);
  });
  await t('mod content edit', () => moved('edit', () => fs.appendFileSync(path.join(mod, 'resource', 'set', 'x.set'), ' '), 'mod'));
  await t('mod mtime only', () => moved('mtime', () => { const d = new Date(Date.now() + 9000); fs.utimesSync(path.join(mod, 'resource', 'set', 'x.set'), d, d); }, 'mod'));
  await t('mod new file', () => moved('new', () => w(path.join(mod, 'resource', 'set', 'n.set'), '{n}'), 'mod'));
  await t('mod restore point', () => moved('undo', () => w(path.join(mod, '.arsenal-undo', '1', 'z'), 'z'), 'mod'));
  await t('mod .git folder (left out by modtree, read here)', () => moved('git', () => w(path.join(mod, '.git', 'HEAD'), 'z'), 'mod'));
  if (linked) await t('junction inside the mod followed', () => moved('link', () => fs.appendFileSync(path.join(lk, 'y.set'), ' '), 'mod'));
  await t('game file', () => moved('game', () => fs.appendFileSync(path.join(G, 'resource', 'set', 'a.set'), ' '), 'game'));
  await t('game exe', () => moved('exe', () => fs.appendFileSync(path.join(G, 'mowas_2.exe'), ' '), 'game'));
  await t('a mod.info in <game>/mods', () => moved('other', () => fs.appendFileSync(path.join(G, 'mods', 'other', 'mod.info'), ' '), 'game'));
  await t('a new entry in <game>/mods', () => moved('newmod', () => w(path.join(G, 'mods', 'new', 'mod.info'), '{Mod}'), 'game'));
  await t('deep file in a required mod', () => moved('dep', () => fs.appendFileSync(path.join(dep, 'resource', 'set', 'deep', 'd.set'), ' '), 'deps'));
  await t('deep file in a mod not required: no move', async () => {
    w(path.join(G, 'mods', 'other', 'resource', 'set', 'o.set'), '{o}');
    const a = await sig(); fs.appendFileSync(path.join(G, 'mods', 'other', 'resource', 'set', 'o.set'), ' '); const b = await sig();
    assert.strictEqual(a.stamps.deps, b.stamps.deps); assert.strictEqual(a.stamps.mod, b.stamps.mod);
  });
  await t('env of the family', async () => { const a = await sig(); process.env.ARSENAL_READ_WINDOW = '3'; const b = await sig(); delete process.env.ARSENAL_READ_WINDOW; assert.notStrictEqual(a.stamps.env, b.stamps.env); });
  await t('env ARSENAL_CACHE left out', async () => { const a = await sig(); const old = process.env.ARSENAL_CACHE; process.env.ARSENAL_CACHE = path.join(tmp, 'c2'); const b = await sig(); if (old === undefined) delete process.env.ARSENAL_CACHE; else process.env.ARSENAL_CACHE = old; assert.strictEqual(a.stamps.env, b.stamps.env); });
  await t('with folder', async () => { const p = path.join(tmp, 'patch'); w(path.join(p, 'resource', 'q.set'), '{q}'); const a = await cc.signature({ ...spec, with: p }); assert.ok(a.stamps.with); fs.appendFileSync(path.join(p, 'resource', 'q.set'), ' '); const b = await cc.signature({ ...spec, with: p }); assert.notStrictEqual(a.stamps.with, b.stamps.with); });
  await t('missing mod folder throws', async () => { await assert.rejects(cc.signature({ mod: path.join(tmp, 'nope'), games: [] })); });
  await t('get / put round trip, a moved stamp misses', async () => {
    const s = await sig();
    assert.strictEqual(cc.get(s), null);
    cc.put(s, { lines: ['a', 'b'], json: '{}', code: 1, ms: 5 });
    const r = cc.get(s); assert.deepStrictEqual(r.lines, ['a', 'b']); assert.strictEqual(r.code, 1); assert.strictEqual(r.json, '{}');
    assert.strictEqual(cc.get({ parts: s.parts, stamps: { ...s.stamps, mod: 'x' } }), null);
    assert.strictEqual(cc.get({ parts: { ...s.parts, args: '{}' }, stamps: s.stamps }), null);
  });
  await t('offWhy', () => {
    assert.strictEqual(cc.offWhy({ noReuse: true }), '--no-reuse');
    const e = process.env.ARSENAL_CHECK_REUSE, c = process.env.CHECK_TEST_ARGS;
    delete process.env.CHECK_TEST_ARGS; process.env.ARSENAL_CHECK_REUSE = '0'; assert.strictEqual(cc.offWhy({}), 'ARSENAL_CHECK_REUSE=0');
    delete process.env.ARSENAL_CHECK_REUSE; assert.strictEqual(cc.offWhy({}), null);
    process.env.CHECK_TEST_ARGS = 'x'; assert.strictEqual(cc.offWhy({}), 'CHECK_TEST_ARGS');
    if (e === undefined) delete process.env.ARSENAL_CHECK_REUSE; else process.env.ARSENAL_CHECK_REUSE = e;
    if (c === undefined) delete process.env.CHECK_TEST_ARGS; else process.env.CHECK_TEST_ARGS = c;
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(bad ? `checkcache: ${bad} FAILED` : `checkcache: ${n} passed`);
  process.exit(bad ? 1 : 0);
})();
function canonEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
