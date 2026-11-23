// modinfotext: seeded LF / CR / mixed mod.info text comes out CRLF, CRLF input and cp1251 bytes unchanged (FIX-PORT, tools-other:70)
// Author: Imperator_Aug (ARSENAL, ia-3540bbc1)
const fs = require('fs'), os = require('os'), path = require('path');
module.exports = (t, assert) => {
  const { crlf, isCrlf, writeModInfo } = require('../modinfotext');
  t('modinfotext LF to CRLF', () => assert.strictEqual(crlf('{name "a"}\n{desc "b"}\n').toString('latin1'), '{name "a"}\r\n{desc "b"}\r\n'));
  t('modinfotext mixed and lone CR', () => assert.strictEqual(crlf('a\r\nb\nc\rd').toString('latin1'), 'a\r\nb\r\nc\r\nd'));
  t('modinfotext CRLF kept byte for byte', () => { const b = Buffer.from('{name "x"}\r\n', 'latin1'); assert.ok(crlf(b).equals(b)); });
  t('modinfotext cp1251 bytes kept', () => { const b = Buffer.from([0x7b, 0xc1, 0x7d, 0x0a]); assert.ok(crlf(b).equals(Buffer.from([0x7b, 0xc1, 0x7d, 0x0d, 0x0a]))); });
  t('modinfotext isCrlf', () => { assert.ok(isCrlf('a\r\nb')); assert.ok(!isCrlf('a\nb')); assert.ok(!isCrlf('\nb')); assert.ok(!isCrlf('a\rb')); });
  t('modinfotext writeModInfo', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mit-')), f = path.join(d, 'm', 'mod.info');
    writeModInfo(f, '{name "z"}\n');
    assert.strictEqual(fs.readFileSync(f, 'latin1'), '{name "z"}\r\n');
    fs.rmSync(d, { recursive: true, force: true });
  });
};
