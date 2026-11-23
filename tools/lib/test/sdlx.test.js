// sdlx tests, loaded by test.js: (t, assert) => ...
// Author: Imperator_Aug (ARSENAL, ia-9628f72b)
const sdlx = require('../sdlx');
module.exports = (t, assert) => {
  const rd = (txt, o = {}) => {
    const e = [];
    const r = sdlx.read(Buffer.from(txt, 'latin1'), Object.assign({ file: 'x', key: 'resource/x.def', open: () => null, onError: (f, l, c) => e.push(l + c) }, o));
    r.e = e; return r;
  };
  t('sdlx tree + typed tokens', () => {
    const r = rd('{a 1 2.5 "s\\n" id {## b 0x10} (+ 1 2)}');
    const a = r.root.items[0];
    assert.deepEqual(a.items.map(i => i.k), ['IDENT', 'INTEGER', 'FLOAT', 'STRING', 'IDENT', 'BLOCK', 'FLOAT']);
    assert.equal(a.items[3].value, 's\n'); assert.ok(a.items[5].disabled);
    assert.equal(a.items[5].items[1].value, 16); assert.equal(a.items[6].value, 3);
    assert.deepEqual(r.e, []);
  });
  t('sdlx macros: reverse-order substitution + origin', () => {
    const r = rd('(define "m" {k %c %cp})\n("m" c(1) cp(2))');
    assert.deepEqual(r.root.items[0].items.map(i => i.text), ['k', '1', '2']);
    assert.equal(r.root.items[0].items[0].line, 1); assert.equal(r.root.items[0].items[0].via.line, 2);
  });
  t('sdlx lexer edge rules', () => {
    assert.deepEqual(rd('{a 0e5}').e, ['1NUMBER_EXP0']); assert.deepEqual(rd('{a -.5}').e, ['1LEADING_DOT']);
    assert.deepEqual(rd('{a x-y}').e, ['1IDENT_SPLIT']); assert.deepEqual(rd('{a 1e5 5. +3 -2.0e-3}').e, []);
  });
  t("sdlx SDL-56 param prefix overlap", () => {
    const d = '(define "m" {k %c %cw})\n';
    const r = rd(d + '("m" c(1))\n("m" c(1) cw(2))');
    assert.equal(r.overlaps.length, 1); assert.equal(r.overlaps[0].line, 2); assert.equal(r.overlaps[0].word, "cw"); assert.equal(r.overlaps[0].param, "c");
    assert.deepEqual(rd(d + '("m" c(1))').overlaps, []);   // cw never passed anywhere: not a param name
  });
};
