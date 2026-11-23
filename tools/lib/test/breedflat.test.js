// breedflat: a soldier file with includes and macro calls written out, and the readers that depend on it (the skin lookup of the
// 3D views, the Equipment card's reader and its edit guard). run: node tools/lib/test/breedflat.test.js
// Author: Imperator_Aug (ARSENAL, ia-783fbadf)
const assert = require('assert');
const { flat } = require('../breedflat');
const T = require('../../soedit/target');
const K = require('../../gui/ext/units/kit');
let n = 0, failed = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { failed++; console.log('FAIL ' + name + ': ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | ')); } };

const FILES = {
  'resource/set/breed/macros.inc': '(include "kit.inc")\r\n(define "look"\r\n\t{skin "%skin"}\r\n\t{portrait "%p"}\r\n)\r\n(define "armor"\r\n\t{armors\r\n\t\t{head "%head"}\r\n\t}\r\n)\r\n',
  'resource/set/breed/kit.inc': '(define "pistol_a"\r\n\t{item "valter" filled}\r\n\t{item "ammo valter" 32}\r\n)\r\n',
  'resource/set/breed/mp/ger/crew.set': '(include "/set/breed/macros.inc")\r\n{breed\r\n\t("look" skin(ger_crew) p(x))\r\n\t("armor" head(cap))\r\n\t{inventory\r\n\t\t("pistol_a")\r\n\t\t{item "bandage" 3} ; own line\r\n\t\t{in_hands 0}\r\n\t}\r\n}\r\n',
  'resource/set/breed/mp/ger/plain.set': '{breed\r\n\t{skin "ger_plain"}\r\n\t{inventory\r\n\t\t{item "mp40" filled}\r\n\t\t{in_hands 0}\r\n\t}\r\n}\r\n',
  'resource/set/breed/mp/ger/lost.set': '(include "/set/breed/nothere.inc")\r\n{breed\r\n\t("nomacro")\r\n\t{inventory\r\n\t\t{item "mp40"}\r\n\t}\r\n}\r\n',
};
const rd = k => (FILES[k] ? Buffer.from(FILES[k], 'latin1') : null);
const CREW = 'resource/set/breed/mp/ger/crew.set', PLAIN = 'resource/set/breed/mp/ger/plain.set', LOST = 'resource/set/breed/mp/ger/lost.set';

t('a file without ( ) lines is given back as it is', () => {
  const b = rd(PLAIN), r = flat(b, PLAIN, rd);
  assert.strictEqual(r.expanded, false); assert.strictEqual(r.text, b); assert.strictEqual(r.partial, false);
});
t('includes and macro calls are written out; a string in gives a string out', () => {
  const r = flat(rd(CREW), CREW, rd), s = r.text.toString('latin1');
  assert.ok(r.expanded && !r.partial && Buffer.isBuffer(r.text));
  assert.ok(/\{\s*skin\s+"ger_crew"/.test(s) && /\{\s*head\s+"cap"/.test(s) && /\{\s*item\s+"valter"\s+filled/.test(s) && !s.includes('('), s);
  assert.strictEqual(typeof flat(FILES[CREW], CREW, rd).text, 'string');
});
t('a missing include or macro is said, the own lines stay', () => {
  const r = flat(rd(LOST), LOST, rd);
  assert.ok(r.expanded && r.partial); assert.ok(/\{\s*item\s+"mp40"/.test(r.text.toString('latin1')));
});
t('skin lookup: own line, macro line, none', () => {
  assert.strictEqual(T.skinOfKey(rd(PLAIN), PLAIN, rd), 'ger_plain');
  assert.strictEqual(T.skinOf(rd(CREW)), null);
  assert.strictEqual(T.skinOfKey(rd(CREW), CREW, rd), 'ger_crew');
  assert.strictEqual(T.skinOfKey(rd(LOST), LOST, rd), null);
});
t('equipment reader: macro items first and marked, the held index counts them', () => {
  const br = K.readBreed(flat(FILES[CREW], CREW, rd, { mark: true }).text);
  assert.deepStrictEqual(br.items.map(x => [x.item, !!x.macro, x.count]), [['valter', true, 1], ['ammo valter', true, 32], ['bandage', false, 3]]);
  assert.strictEqual(br.inHands, 0); assert.strictEqual(br.calls, false);
  const raw = K.readBreed(FILES[CREW]);
  assert.strictEqual(raw.calls, true); assert.deepStrictEqual(raw.items.map(x => x.item), ['bandage']);
});
t('edit guard: add is taken; removing, changing a macro item or the held item is refused in plain words', () => {
  const br = K.readBreed(flat(FILES[CREW], CREW, rd, { mark: true }).text), kind = () => 'weapon';
  const add = K.applyPending(br, { add: [{ item: 'grenade', count: 2 }] }, kind);
  assert.strictEqual(add.why, null); assert.deepStrictEqual(add.spec.add.map(a => a.item), ['grenade']); assert.strictEqual(add.spec.in_hands, undefined);
  assert.strictEqual(K.applyPending(br, { add: [{ item: 'bandage', count: 5 }] }, kind).why, null);
  for (const p of [{ del: ['bandage'] }, { del: ['valter'] }, { add: [{ item: 'ammo valter', count: 64 }] }, { inHands: 'bandage' }, { inHands: false }]) {
    const r = K.applyPending(br, p, kind);
    assert.ok(r.why && /shared line/.test(r.why), JSON.stringify(p) + ' -> ' + r.why);
  }
  // a plain file is edited as before
  const pl = K.readBreed(FILES[PLAIN]);
  assert.strictEqual(K.applyPending(pl, { add: [{ item: 'grenade' }], inHands: false }, kind).why, null);
});

console.log(failed ? `${failed} FAILED, ${n} passed` : `${n} passed`);
if (failed) process.exitCode = 1;
