// covreplay test: invented SDL pairs only (no game, no mod files). node tools/covreplay/test/test.js
// Author: Imperator_Aug (ARSENAL, ia-a3e84138)
const assert = require('assert');
const { planEdits, applyAll, compare, stripComments } = require('../covreplay');
const B = s => Buffer.from(s, 'latin1');
let n = 0;
function replay(v, m) {
  const p = planEdits(B(v), B(m)), a = applyAll(B(v), p.edits);
  return { p, a, c: a.buf ? compare(a.buf, B(m)) : null };
}
const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

t('scalar change inside a nested block', () => {
  const r = replay('{from\r\n\t{mass 4}\r\n\t{throw {range 20}}\r\n}\r\n', '{from\r\n\t{mass 5.5}\r\n\t{throw {range 31}}\r\n}\r\n');
  assert.strictEqual(r.p.gaps.size, 0); assert.strictEqual(r.p.edits.length, 2);
  assert(r.c.byte && r.c.ordered && r.c.unord && r.c.flat);
});
t('number spelling and comments differ, bytes may differ, trees equal', () => {
  const r = replay('{a {x 1.50} ; old\n}\n', '{a {x 1.5}\n}\n');
  assert(r.c.flat);
});
t('add a new block with nested blocks (name keeps its spelling)', () => {
  const r = replay('{a\n\t{x 1}\n}\n', '{a\n\t{x 1}\n\t{SpecialMode {mode aim} {time 2.5} ; trailing comment\n\t}\n}\n');
  assert.strictEqual(r.p.gaps.size, 0);
  assert.strictEqual(r.p.edits[0].path, 'a[0]/SpecialMode');
  assert(r.c.ordered && r.c.flat);
});
t('delete a block and a second same-name sibling', () => {
  const r = replay('{a {x 1} {y 2} {y 3} {z 4}}\n', '{a {x 1} {y 2} {z 4}}\n');
  assert.deepStrictEqual(r.p.edits.map(e => e.op + ' ' + e.path), ['del a[0]/y[1]']);
  assert(r.c.ordered);
});
t('appended value item', () => {
  const r = replay('{a {range 10}}\n', '{a {range 10 20}}\n');
  assert.deepStrictEqual(r.p.edits[0], { op: 'set', path: 'a[0]/range[0]#2', value: '20' });
  assert(r.c.ordered);
});
t('GAP ADD_SAME_NAME: second block of an existing name cannot be created', () => {
  const r = replay('{a {slot 1}}\n', '{a {slot 1} {slot 2}}\n');
  assert(r.p.gaps.has('ADD_SAME_NAME')); assert(!r.c.unord);
});
t('GAP ADD_LIST: new (list) cannot be created', () => {
  const r = replay('{a {x 1}}\n', '{a {x 1} (speed 82)}\n');
  assert(r.p.gaps.has('ADD_LIST')); assert(!r.c.unord);
});
t('GAP SCALAR_DELETE: fewer value items', () => {
  const r = replay('{a {range 10 20}}\n', '{a {range 10}}\n');
  assert(r.p.gaps.has('SCALAR_DELETE')); assert(!r.c.unord);
});
t('GAP CONTAINER_KIND: (speed 1) became {speed 1}', () => {
  const r = replay('{a (speed 1)}\n', '{a {speed 1}}\n');
  assert(r.p.gaps.has('CONTAINER_KIND')); assert(!r.c.ordered);
});
t('GAP NAME_UNADDRESSABLE: name with a slash', () => {
  const r = replay('{t {"/tex/a.tga" 0 0 8 8}}\n', '{t {"/tex/b.tga" 0 0 8 8}}\n');
  assert(r.p.gaps.has('NAME_UNADDRESSABLE'));
});
t('GAP BOM_CHANGE', () => {
  const r = replay('{a 1}\n', '\xef\xbb\xbf{a 1}\n');
  assert(r.p.gaps.has('BOM_CHANGE'));
});
t('UTF-8 text survives the round trip (bytes above 0x7f)', () => {
  const U = s => Buffer.from(s, 'utf8').toString('latin1');
  const v = U('{a {name "Привет"}}\r\n'), m = U('{a {name "Война «ж»"} {note "да"}}\r\n');
  const r = replay(v, m);
  assert(r.a.buf, JSON.stringify(r.a)); assert(r.c.byte || r.c.ordered, 'UTF-8 bytes not preserved');
});
t('legacy cp1251 mod string is written back as UTF-8 (ENCFIX)', () => {
  const v = '{a {name "\xcf\xf0\xe8\xe2\xe5\xf2"}}\r\n', m = '{a {name "\xc2\xee\xe9\xed\xe0"}}\r\n';
  const r = replay(v, m);
  assert(r.a.buf, JSON.stringify(r.a)); assert(r.a.buf.includes(Buffer.from('"Война"', 'utf8')), r.a.buf.toString('latin1'));
});
t('stripComments keeps ; inside strings', () => {
  assert.strictEqual(stripComments('{a "x;y"} ; gone\n{b 1}'), '{a "x;y"} \n{b 1}');
});
t('identical files plan no edit', () => {
  const r = replay('{a {x 1}}\n', '{a {x 1}}\n');
  assert.strictEqual(r.p.edits.length, 0); assert(r.c.byte);
});
// ---- games: mod names per game, mod folders, loose GoH files, the gate's exe (made-up folders in a temp dir)
const CR = require('../covreplay'), fs = require('fs'), os = require('os'), path = require('path');
t('mod names: AS2 val/jab, GoH val/mace (workshop app 400750), folders as given', () => {
  const gd = { workshop: (app, id) => app + '/' + id };
  assert.strictEqual(CR.modRoot('val', 'goh', '/g', gd), '400750/2537987794');
  assert.strictEqual(CR.modRoot('mace', 'goh', '/g', gd), '400750/2905667604');
  assert.strictEqual(CR.modRoot('jab', 'goh', '/g', gd), null, 'jaben is an AS2 mod');
  assert.strictEqual(CR.modRoot('jab', 'as2', '/g', gd), '/g/mods/jaben mod v6.25');
  assert.strictEqual(CR.modRoot('/x/my_mod', 'goh', '/g', gd), path.resolve('/x/my_mod'));
});
t('GoH: loose mod file over a loose vanilla file becomes a candidate and is read', () => {
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'crp-'));
  try {
    const put = (rel, s) => { const p = path.join(T, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
    put('goh/resource/set/stuff/a.set', '{a {x 1}}\r\n'); put('mod/resource/set/stuff/a.set', '{a {x 2}}\r\n'); put('mod/resource/set/stuff/new.set', '{n}');
    const van = CR.loadVanilla(path.join(T, 'goh'), true);
    const c = CR.candidates(van, path.join(T, 'mod'), true);
    assert.deepStrictEqual(c.out.map(x => x.key), ['resource/set/stuff/a.set']);
    const r = replay(fs.readFileSync(c.out[0].v.file, 'latin1'), fs.readFileSync(c.out[0].e.file, 'latin1'));
    assert(r.c.byte, 'loose pair replays');
    assert.strictEqual(CR.candidates(CR.loadVanilla(path.join(T, 'goh')), path.join(T, 'mod')).out.length, 0, 'AS2 rules unchanged: paks only');
    c.mod.close(); van.close();
  } finally { fs.rmSync(T, { recursive: true, force: true }); }
});
t('gate: named game passes its vfs exe to patch-entity, none passes none', () => {
  const r = { key: 'resource/set/a.set', edits: [] };
  assert.strictEqual(CR.gateOpts({ game: '/g', exe: 'goh' }, '/o', r).exe, 'goh');
  assert.strictEqual(CR.gateOpts({ game: '/g', exe: 'mowas2' }, '/o', r).exe, 'mowas_2');
  assert.ok(!('exe' in CR.gateOpts({ game: '/g', exe: null }, '/o', r)));
});
console.log(n + ' passed');
