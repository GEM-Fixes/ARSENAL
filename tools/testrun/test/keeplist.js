// Author: Imperator_Aug (ARSENAL, ia-a4e6a775)
// FIX-EDRUN item 8 seeded test, no game: a scenario with no "mods" field keeps the instance's own mod list (was reseeded to as64+ alone). node keeplist.js
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os');
const t = require('../testrun.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keeplist-'));
const fail = [];
const it = (n, f) => { try { f(); } catch (e) { fail.push(n + ': ' + e.message); } };
try {
  const w = (n, o) => { const f = path.join(dir, n); fs.writeFileSync(f, JSON.stringify(o)); return f; };
  const noMods = t.loadScenario(w('a.json', { name: 'a', mode: 'menu', rows: [] }), {}).sc;
  const withMods = t.loadScenario(w('b.json', { name: 'b', mode: 'menu', rows: [], mods: ['robz'] }), {}).sc;
  const emptyMods = t.loadScenario(w('c.json', { name: 'c', mode: 'menu', rows: [], mods: [] }), {}).sc;
  it('seeded defect: the old path seeds as64+ alone for an empty list', () => assert.deepStrictEqual(t.seedList([], null), ['as64+:0']));
  it('no mods field -> kept', () => { assert.strictEqual(noMods.modsGiven, false); assert.strictEqual(t.keepsList({}, noMods, []), true); });
  it('mods field -> seeded', () => assert.strictEqual(t.keepsList({}, withMods, []), false));
  it('explicit "mods": [] -> seeded (the user asked for an empty list)', () => assert.strictEqual(t.keepsList({}, emptyMods, []), false));
  it('--mods given -> seeded', () => assert.strictEqual(t.keepsList({ mods: ['x'] }, noMods, []), false));
  it('matrix mod set -> seeded', () => assert.strictEqual(t.keepsList({ runMods: ['x'] }, noMods, []), false));
  it('staged folder -> seeded', () => assert.strictEqual(t.keepsList({}, noMods, ['e2e_test']), false));
  it('plain run (no scenario) keeps the old rule', () => assert.strictEqual(t.keepsList({}, null, []), false));
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
if (fail.length) { console.log('FAIL keeplist -- ' + fail.join('\n ')); process.exit(1); }
console.log('PASS keeplist');
