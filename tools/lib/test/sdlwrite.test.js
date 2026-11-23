// sdlwrite tests, loaded by test.js: (t, assert) => ...   standalone: node sdlwrite.test.js  (vanilla sweep always)
// Author: Imperator_Aug (ARSENAL, ia-19c8c9c0)
const fs = require('fs'), path = require('path');
const w = require('../sdlwrite'), sdlx = require('../sdlx');
const GAME = process.env.AS2_DIR || require('../gamedir').resolve().dir || '';   // DOOR-A: AS2_DIR, then AS2_GAME, as2.json or Steam
const B = s => Buffer.from(s, 'latin1');
const rt = s => w.serialize(w.parse(B(s))).toString('latin1');
const errs = buf => { const e = []; sdlx.read(buf, { file: 'x', key: 'resource/x.def', open: () => null, onError: (f, l, c) => e.push(c) }); return e; };

function sweep() {
  const vfs = require('../vfs');
  const v = vfs.build({ gameDir: GAME, mods: [] });
  const t0 = Date.now(); let n = 0; const bad = [];
  for (const [k, rec] of v.files) {
    if (!/\.(def|set|mdl|mtl)$/.test(k)) continue;
    const buf = vfs.readRec(rec);
    let out; try { const tr = w.parse(buf); (function nop(nd) { for (const c of nd.items) { if (c.items) nop(c); else w.setValue(c, c.text); } })(tr.root); out = w.serialize(tr); } catch (e) { bad.push(k + ' ' + e.message); n++; continue; }
    n++; if (!out.equals(buf)) bad.push(k);
  }
  vfs.closeRecs();
  return { n, bad, ms: Date.now() - t0 };
}

module.exports = (t, assert) => {
  t('sdlwrite: fixtures round-trip byte-identical (rules 1-11)', () => {
    const cases = [
      '{a 1 2}\r\n{b 3}\r\n',                                  // CRLF
      '{a 1}\n{b 2}\r{c 3}\r\n{d 4}',                          // mixed EOLs, no final EOL
      '\xEF\xBB\xBF{a 1}\r\n',                                 // UTF-8 BOM
      '{\xCF\xF0\xE8\xE2\xE5\xF2 "\xCF\xF0\xE8"}\r\n',         // cp1251 bytes
      '{a ; c1\r\n  (; c2\r\n 1 ) 2} ; tail\r\n;only\r\n',     // comments incl. inside ( )
      '{a = 1 = 2}{b=3}\r\n',                                  // '=' whitespace
      '{a 0.50 5. 0x1F 1e-3 -2.0e-3 +3}\r\n',                  // number text
      '{a "x\\\\n \\q \\" ; not comment" "y"}\r\n',            // raw escapes, ; in string
      '(define "m" {k %c %cp ; %c in comment\r\n})\r\n("m" c(1) cp(2))\r\n(include "/a/b.inc" p(x))\r\n(mod "x" {a})\r\n',
      '{## off 1}\r\n{#tag-x 2}{+ a}\r\n',                     // disabled / tags
      '{a 1}}\r\n{b )) 2}\r\n',                                // stray closers
      '{a 1 {b 2\r\n',                                         // unclosed at EOF
      '{a "unterminated\r\n{b 1}\r\n',                         // string cut by EOL
      '',
    ];
    for (const c of cases) assert.equal(rt(c), c);
  });
  t('sdlwrite: UTF-16 BOM refused', () => {
    assert.throws(() => w.parse(Buffer.from([0xFF, 0xFE, 0x7B, 0])), /BOM/);
  });
  t('sdlwrite: find paths', () => {
    const tr = w.parse(B('{a 1 {b 2 {c 3}} {b 4 {c 5}}}\r\n{A 9}'));
    assert.equal(w.findAll(tr, 'a/b').length, 2);
    assert.equal(w.find(tr, 'a/b[1]/c').items[1].text, '5');
    assert.equal(w.find(tr, 'A/nope'), null);
    assert.equal(w.findAll(tr, 'a').length, 2);
  });
  t('sdlwrite: setValue keeps all else verbatim', () => {
    const src = '{a ; hdr\r\n  {size 0.50} ; t\r\n\t{name "x" = 7}\r\n}\r\n';
    const tr = w.parse(B(src));
    w.setValue(w.find(tr, 'a/size'), '1.25');
    w.setValue(w.find(tr, 'a/name'), '"y"');
    w.setValue(w.find(tr, 'a/name'), '"z"');           // re-edit replaces
    const out = w.serialize(tr);
    assert.equal(out.toString('latin1'), '{a ; hdr\r\n  {size 1.25} ; t\r\n\t{name "z" = 7}\r\n}\r\n');
    assert.deepEqual(errs(out), []);
  });
  t('sdlwrite: setValue on block without value appends', () => {
    const tr = w.parse(B('{a {k}}'));
    w.setValue(w.find(tr, 'a/k'), '5');
    assert.equal(w.serialize(tr).toString('latin1'), '{a {k 5}}');
  });
  t('sdlwrite: insertChild indent/eol/comments', () => {
    const src = '{a\r\n  {x 1}\r\n  ; about y\r\n  {y 2}\r\n}\r\n';
    let tr = w.parse(B(src));
    const a = w.find(tr, 'a');
    w.insertChild(a, 2, '{z 3}');                       // before {y}: above its comment (items: a, x, y)
    let o = w.serialize(tr);
    assert.equal(o.toString('latin1'), '{a\r\n  {x 1}\r\n  {z 3}\r\n  ; about y\r\n  {y 2}\r\n}\r\n');
    assert.deepEqual(errs(o), []);
    tr = w.parse(B(src)); w.insertChild(w.find(tr, 'a'), 99, '{end 1}');   // append
    o = w.serialize(tr);
    assert.equal(o.toString('latin1'), '{a\r\n  {x 1}\r\n  ; about y\r\n  {y 2}\r\n  {end 1}\r\n}\r\n');
    tr = w.parse(B('{a {x 1}}')); w.insertChild(w.find(tr, 'a'), 99, '{y 2}');  // inline
    assert.equal(w.serialize(tr).toString('latin1'), '{a {x 1} {y 2}}');
    tr = w.parse(B('{a\n\t{x 1}\n}\n')); w.insertChild(w.find(tr, 'a'), 2, '{y 2}');  // LF + tab indent
    assert.equal(w.serialize(tr).toString('latin1'), '{a\n\t{x 1}\n\t{y 2}\n}\n');
    tr = w.parse(B('{a}')); w.insertChild(w.find(tr, 'a'), 1, '{y 2}');
    assert.equal(w.serialize(tr).toString('latin1'), '{a {y 2}}');
    tr = w.parse(B('{a\r\n}\r\n')); w.insertChild(w.find(tr, 'a'), 1, '{y 2}');
    assert.equal(w.serialize(tr).toString('latin1'), '{a\r\n  {y 2}\r\n}\r\n');
  });
  t('sdlwrite: removeNode', () => {
    let tr = w.parse(B('{a\r\n  {x 1}\r\n  {y 2} ; c\r\n  {z 3}\r\n}\r\n'));
    w.removeNode(w.find(tr, 'a/x'));
    w.removeNode(w.find(tr, 'a/z'));
    let o = w.serialize(tr);
    assert.equal(o.toString('latin1'), '{a\r\n  {y 2} ; c\r\n}\r\n'); assert.deepEqual(errs(o), []);
    tr = w.parse(B('{a {x 1} {y 2}}')); w.removeNode(w.find(tr, 'a/x'));
    assert.equal(w.serialize(tr).toString('latin1'), '{a {y 2}}');
    tr = w.parse(B('{a {x 1}\r\n  {y 2}\r\n}')); w.removeNode(w.find(tr, 'a/y'));
    assert.equal(w.serialize(tr).toString('latin1'), '{a {x 1}\r\n}');
  });
  t('sdlwrite: vanilla def/set/mdl/mtl round-trip byte-identical', () => {
    if (!fs.existsSync(GAME)) return;
    const r = sweep();
    if (require.main === module || process.env.SDLW_VERBOSE) console.log(`  vanilla: ${r.n} files, ${r.bad.length} mismatches, ${r.ms} ms`);
    assert.deepEqual(r.bad.slice(0, 5), []);
    assert.ok(r.n > 100);
  });
};

if (require.main === module) {
  const assert = require('assert'); let fail = 0;
  module.exports((name, fn) => { try { fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n' + e.message); } }, assert);
  process.exit(fail ? 1 : 0);
}
