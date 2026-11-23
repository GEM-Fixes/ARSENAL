// sdldiff + vfs.sameRec + gamever tests, loaded by test.js: (t, assert) => ...
// Author: Imperator_Aug (ARSENAL, ia-a55afbc8)
module.exports = function (t, assert) {
  const fs = require('fs'), os = require('os'), path = require('path');
  const sd = require('../sdldiff'), vfs = require('../vfs'), gv = require('../gamever'), pak = require('../pak'), { zip } = require('../zipwrite');

  t('sdldiff flatten semantic', () => {
    const A = sd.parse('{e1\r\n {sp 1.4}\r\n {nm "a b"}\r\n {i 5}\r\n}\r\n{e1 {k 1}}\r\n');
    const B = sd.parse('{e1 {sp 1.40}   {nm  "a b"} {i 5.0}}\r\n{e1 {k 1}}');
    assert.deepEqual([...A.keys()], ['e1', 'e1/sp', 'e1/nm', 'e1/i', 'e1[2]', 'e1[2]/k']);
    assert.ok(sd.sameValue(A.get('e1/sp'), B.get('e1/sp')));          // 1.4 == 1.40
    assert.ok(sd.sameValue(A.get('e1/nm'), B.get('e1/nm')));          // whitespace-insensitive
    assert.ok(sd.sameValue(A.get('e1/i'), B.get('e1/i')));            // 5 == 5.0
    assert.equal(A.get('e1/sp').val, '1.4'); assert.equal(B.get('e1/sp').val, '1.40');   // val keeps display text
    assert.equal(A.get('e1/sp').line, 2);
  });
  t('sdldiff differs + absent', () => {
    const A = sd.parse('{e {a 1} {s "x"}}'), B = sd.parse('{e {a 2} {s "y"}}');
    assert.ok(!sd.sameValue(A.get('e/a'), B.get('e/a'))); assert.ok(!sd.sameValue(A.get('e/s'), B.get('e/s')));
    assert.ok(!sd.sameValue(A.get('e/a'), undefined)); assert.ok(sd.sameValue(undefined, undefined));
    assert.ok(!sd.sameValue(sd.parse('{e {s "1"}}').get('e/s'), sd.parse('{e {s 1}}').get('e/s')));   // string vs number
  });
  t('sdldiff parse keeps unresolved (list) directives (COV-REPLAY)', () => {
    const A = sd.parse('{e 1 (include "x.inc")}'), B = sd.parse('{e 1 (include "y.inc")}'), C = sd.parse('{e ("m" 3)}');
    const ka = [...A.keys()].find(k => k.startsWith('(unresolved)/include')), kb = [...B.keys()].find(k => k.startsWith('(unresolved)/include'));
    assert.ok(ka && kb && ka !== kb, 'include paths kept apart');
    assert.ok(C.has('(unresolved)/macro m'));
    assert.ok(!sd.parse('{e 1}').has('(unresolved)/include'));
  });
  t('sdldiff flatten(tree) = flatten(text)', () => {
    const sdlx = require('../sdlx'), txt = '{a {b 1.5}}';
    const root = sdlx.read(Buffer.from(txt), { file: 'x', key: 'resource/x.def', open: () => null, onError: () => {} }).root;
    assert.deepEqual([...sd.flatten(root)], [...sd.flatten(txt)]);
  });

  t('vfs.sameRec', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-'));
    try {
      const f = path.join(d, 'a.pak');
      fs.writeFileSync(f, zip([['x', Buffer.from('hello'), false], ['y', Buffer.from('hello'), true], ['z', Buffer.from('hellp'), false], ['w', Buffer.from('hello!'), false]]));
      const ents = new Map(pak.list(f).map(e => [e.name, e]));
      const R = n => ({ source: 'pak', container: f, entry: n, ent: ents.get(n) });
      assert.ok(vfs.sameRec(R('x'), R('y')));                      // same size+crc, different compression
      assert.ok(!vfs.sameRec(R('x'), R('z')));                     // same size, crc differs
      assert.ok(!vfs.sameRec(R('x'), R('w')));                     // size differs
      fs.writeFileSync(path.join(d, 'l1'), 'hello'); fs.writeFileSync(path.join(d, 'l2'), 'hello'); fs.writeFileSync(path.join(d, 'l3'), 'hellp');
      const L = n => ({ source: 'loose', container: d, entry: n });
      assert.ok(vfs.sameRec(L('l1'), L('l2'))); assert.ok(!vfs.sameRec(L('l1'), L('l3')));
      assert.ok(vfs.sameRec(L('l1'), R('x'))); assert.ok(!vfs.sameRec(R('z'), L('l1')));   // mixed: byte compare
      // short-circuit: a bogus container is never read when size+crc equal
      assert.ok(vfs.sameRec({ source: 'pak', container: path.join(d, 'gone'), ent: { size: 5, crc: 7 } }, { source: 'pak', container: path.join(d, 'gone2'), ent: { size: 5, crc: 7 } }));
    } finally { vfs.closeRecs(); fs.rmSync(d, { recursive: true, force: true }); }
  });

  t('gamever pe + file', () => {
    // synthetic PE: one .rsrc section with RT_VERSION -> VS_VERSION_INFO (FILEVERSION 1.2.3.4, ProductVersion "9.8.7")
    const u = s => Buffer.from(s + '\0', 'utf16le'), pad4 = b => Buffer.concat([b, Buffer.alloc((4 - b.length % 4) % 4)]);
    const ffi = Buffer.alloc(52); ffi.writeUInt32LE(0xFEEF04BD, 0); ffi.writeUInt32LE(0x10000, 4); ffi.writeUInt32LE(0x00010002, 8); ffi.writeUInt32LE(0x00030004, 12);
    const hdr = (len, vlen, type, key) => { const h = Buffer.alloc(6); h.writeUInt16LE(len, 0); h.writeUInt16LE(vlen, 2); h.writeUInt16LE(type, 4); return pad4(Buffer.concat([h, u(key)])); };
    const val = '9.8.7', sv = pad4(Buffer.concat([hdr(0, val.length + 1, 1, 'ProductVersion'), u(val)]));
    const vi = pad4(Buffer.concat([hdr(0, 52, 0, 'VS_VERSION_INFO'), ffi, sv]));
    const RAW = 0x400, VA = 0x1000, dirs = Buffer.alloc(16 * 3 + 8 * 3 + 16);       // 3 tables + 3 entries + data entry
    const tbl = (o, id, sub, tgt) => { dirs.writeUInt16LE(1, o + 14); dirs.writeUInt32LE(id, o + 16); dirs.writeUInt32LE(sub ? (0x80000000 | tgt) >>> 0 : tgt, o + 20); };
    tbl(0, 16, true, 24); tbl(24, 1, true, 48); tbl(48, 0x409, false, 72);
    const dataOff = 88; dirs.writeUInt32LE(VA + dataOff, 72); dirs.writeUInt32LE(vi.length, 76);
    const rsrc = Buffer.concat([dirs.subarray(0, 88), vi]);
    const buf = Buffer.alloc(RAW + rsrc.length);
    buf.writeUInt16LE(0x5A4D, 0); buf.writeUInt32LE(0x80, 0x3C); buf.write('PE\0\0', 0x80, 'latin1');
    buf.writeUInt16LE(1, 0x80 + 6); buf.writeUInt16LE(0xE0, 0x80 + 20);
    const opt = 0x80 + 24; buf.writeUInt16LE(0x10B, opt); buf.writeUInt32LE(VA, opt + 96 + 16);   // data dir[2] = resource
    const sec = opt + 0xE0; buf.writeUInt32LE(rsrc.length, sec + 8); buf.writeUInt32LE(VA, sec + 12); buf.writeUInt32LE(rsrc.length, sec + 16); buf.writeUInt32LE(RAW, sec + 20);
    rsrc.copy(buf, RAW);
    assert.equal(gv.peVersionBuf(buf), '9.8.7');
    // no ProductVersion string -> FILEVERSION
    const nostr = Buffer.from(buf); nostr.write('XXXXXXXXXXXXXX', nostr.indexOf(Buffer.from('ProductVersion', 'utf16le')), 'utf16le');
    assert.equal(gv.peVersionBuf(nostr), '1.2.3.4');
    assert.equal(gv.peVersionBuf(Buffer.from('garbage')), null);
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-'));
    try {
      assert.equal(gv.read(d), null);
      fs.writeFileSync(path.join(d, 'version.txt'), '1.2.3\r\nmore'); assert.equal(gv.read(d), '1.2.3');
      fs.writeFileSync(path.join(d, 'mowas_2.exe'), buf); assert.equal(gv.read(d), '9.8.7');   // exe wins over file
      fs.writeFileSync(path.join(d, 'as64.exe'), nostr); assert.equal(gv.read(d), '1.2.3.4'); // as64.exe first
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
    const G = process.env.AS2_DIR || require('../gamedir').resolve().dir || '';   // DOOR-A: no fixed drive letter
    if (fs.existsSync(path.join(G, 'as64.exe'))) assert.match(gv.read(G), /^\d+\.\d+\.\d+/);
  });
};
