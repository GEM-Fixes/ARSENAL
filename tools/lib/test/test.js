// lib unit tests: node test.js (exit 1 on failure)
// Author: Imperator_Aug (ARSENAL, ia-c6b11800)
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib'), assert = require('assert');
const { bomKind, readText } = require('../enc'), sdl = require('../sdl'), pak = require('../pak'), { createReport } = require('../report'), { zip } = require('../zipwrite'), names = require('../names');
let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL ' + name + ': ' + e.message); process.exitCode = 1; } };
const errs = () => { const a = []; const f = (line, code, msg) => a.push([line, code]); f.a = a; return f; };

// enc
t('bom kinds', () => {
  assert.equal(bomKind(Buffer.from([0xEF, 0xBB, 0xBF, 0x41])), 'utf8');
  assert.equal(bomKind(Buffer.from([0xFF, 0xFE, 0x41, 0])), 'utf16le');
  assert.equal(bomKind(Buffer.from([0xFF, 0xFE, 0, 0])), 'utf32le');
  assert.equal(bomKind(Buffer.from([0x41, 0x42])), null);
});
t('utf8 strict per line', () => {
  const r = readText(Buffer.concat([Buffer.from('ok\r\n'), Buffer.from([0xCF, 0xF0]), Buffer.from('\r\n\xE9', 'utf8')]), 'utf8');
  assert.deepEqual(r.badLines, [2]); assert.equal(r.lines[0], 'ok'); assert.equal(r.lines[2], 'é');
});
t('cp1251 decode', () => assert.equal(readText(Buffer.from([0xCF, 0xF0, 0x0D, 0x0A]), 'cp1251').lines[0], 'Пр'));
t('utf16 fatal', () => assert.match(readText(Buffer.from([0xFF, 0xFE, 0x41, 0]), 'utf8').fatal, /utf16le/));

// sdl
t('tree + names', () => {
  const r = sdl.parseLines(['{tags', ' {"a" "x" "y"} ; c {', ' {b {c "z"}}', '}']);
  assert.equal(r.kids[0].name, 'tags'); assert.equal(r.kids[0].kids[0].vals.length, 2);
  assert.equal(sdl.kids(r.kids[0], 'B')[0].kids[0].vals[0].v, 'z');
});
t('escapes', () => {
  const e = errs(); const tk = sdl.tokenize(['"a\\"b\\\\\\n\\q"'], e);
  assert.equal(tk[0].v, 'a"b\\\nq'); assert.deepEqual(e.a, [[1, 'WARN_ESCAPE']]);
});
t('unclosed string eol', () => {
  const e = errs(); sdl.parseLines(['{a "x', '}'], e); assert.deepEqual(e.a, [[1, 'STR_NEWLINE']]);
});
t('unclosed string nextQuote: one report', () => {
  const e = errs(); const r = sdl.parseLines(['{a "x', ' y"}', '}'], e, { resync: 'nextQuote' });
  assert.deepEqual(e.a, [[1, 'STR_NEWLINE'], [3, 'BRACES']]);
  assert.equal(r.kids[0].name, 'a');
});
t('braces', () => {
  const e = errs(); sdl.parseLines(['{a {b}', '}}'], e); assert.deepEqual(e.a, [[2, 'BRACES']]);
  const e2 = errs(); sdl.parseLines(['{a {b}'], e2); assert.deepEqual(e2.a, [[1, 'BRACES']]);
});

// report
t('report format', () => {
  const r = createReport(); r.add('a.lng', 3, 'X', 'm'); r.add('dir', 0, 'Y', 'n'); r.info('a.lng', 1, 'Z', 'i');
  assert.equal(r.count, 2); assert.deepEqual(r.counts, { X: 1, Y: 1 });
});

// pak: build a zip (stored + deflated) and read it back
t('pak list/read/extract', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'paktest-')), f = path.join(d, 't.pak');
  fs.writeFileSync(f, zip([['interface/text/a.lng', Buffer.from('{tags}'), false], ['set/b.set', Buffer.from('x'.repeat(500)), true]]));
  const ents = pak.list(f);
  assert.deepEqual(ents.map(e => e.name), ['interface/text/a.lng', 'set/b.set']);
  assert.equal(pak.read(ents, ents[1]).length, 500);
  assert.equal(pak.extract(f, path.join(d, 'out'), /\.lng$/), 1);
  assert.equal(fs.readFileSync(path.join(d, 'out', 'interface', 'text', 'a.lng'), 'utf8'), '{tags}');
  fs.rmSync(d, { recursive: true });
});
const realGame = require('../gamedir').resolve().dir, real = realGame ? path.join(realGame, 'localization.pak') : '';
if (!real || !fs.existsSync(real)) console.log('skip real localization.pak: no AS2 install found (set AS2_GAME)');
else t('real localization.pak', () => {
  const ents = pak.list(real); const lng = ents.filter(e => e.name.endsWith('.lng'));
  assert.ok(lng.length >= 80); assert.match(pak.read(ents, lng[0]).toString('utf8'), /\{/);
});

// names
t('normalize', () => {
  assert.equal(names.normalize('Resource\\Entity\\АB.PAK'), 'resource/entity/аb.pak');
  assert.equal(names.zipEntryName('A'.repeat(2000)).length, 1023);
});
t('name forms', () => {
  assert.deepEqual(names.resolve('/A/b.ext'), { kind: 'resource', key: 'resource/a/b.ext' });
  assert.deepEqual(names.resolve('//a/b.ext'), { kind: 'game', key: 'a/b.ext' });
  assert.deepEqual(names.resolve('@a/b.ext'), { kind: 'user', key: 'a/b.ext' });
  assert.equal(names.resolve('x.inc', 'resource/entity/-vehicle/').key, 'resource/entity/-vehicle/x.inc');
  assert.equal(names.resolve('../x.inc', 'resource/entity/-vehicle/').key, 'resource/entity/x.inc');
  assert.equal(names.ext('a/gun42.tif.bmp'), '.bmp'); assert.equal(names.title('a/gun42.tif.bmp'), 'gun42');
  assert.equal(names.ext('a.b/weapon'), '');
});
t('name validation', () => {
  const c = n => names.validate(n).map(p => p.code);
  assert.deepEqual(c('resource/a [b]/(c)_d-e+f.g@h$i%j^k!'), []);
  assert.deepEqual(c('a*b'), ['NAME_BAD_CHAR']);
  assert.deepEqual(c(' a'), ['NAME_SPACE_EDGE']);
  assert.deepEqual(c('a'.repeat(4097)), ['NAME_TOO_LONG']);
  assert.deepEqual(c('пр'), ['WARN_NAME_NONASCII']);
});
t('pak list reads only directory (offset zip)', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'paktest-')), f = path.join(d, 'p.pak');
  const big = Buffer.alloc(3 * 1024 * 1024, 7);
  fs.writeFileSync(f, zip([['a/big.bin', big, false], ['a\\b.txt', Buffer.from('hi'), true]]));
  const ents = pak.list(f);
  assert.deepEqual(ents.map(e => e.name), ['a/big.bin', 'a/b.txt']);
  assert.equal(pak.read(ents, ents[0]).length, big.length); assert.equal(pak.read(ents, ents[1]).toString(), 'hi');
  fs.rmSync(d, { recursive: true });
});

t('pak zip64 (EOCD64 + extra field, GoH style)', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'paktest-')), f = path.join(d, 'z.pak');
  const name = Buffer.from('a/x.ply'), data = Buffer.from('EPLYdata'), M = 0xFFFFFFFF;
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt32LE(M, 18); lh.writeUInt32LE(M, 22); lh.writeUInt16LE(name.length, 26);
  const cdOff = 30 + name.length + data.length;
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt32LE(M, 20); ch.writeUInt32LE(M, 24); ch.writeUInt32LE(M, 42);
  ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(28, 30);
  const x = Buffer.alloc(28); x.writeUInt16LE(1, 0); x.writeUInt16LE(24, 2);
  x.writeBigUInt64LE(BigInt(data.length), 4); x.writeBigUInt64LE(BigInt(data.length), 12); x.writeBigUInt64LE(0n, 20);
  const cd = Buffer.concat([ch, name, x]);
  const e64 = Buffer.alloc(56); e64.writeUInt32LE(0x06064b50, 0); e64.writeBigUInt64LE(44n, 4);
  e64.writeBigUInt64LE(1n, 24); e64.writeBigUInt64LE(1n, 32); e64.writeBigUInt64LE(BigInt(cd.length), 40); e64.writeBigUInt64LE(BigInt(cdOff), 48);
  const loc = Buffer.alloc(20); loc.writeUInt32LE(0x07064b50, 0); loc.writeBigUInt64LE(BigInt(cdOff + cd.length), 8); loc.writeUInt32LE(1, 16);
  const eo = Buffer.alloc(22); eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(0xFFFF, 8); eo.writeUInt16LE(0xFFFF, 10); eo.writeUInt32LE(M, 12); eo.writeUInt32LE(M, 16);
  fs.writeFileSync(f, Buffer.concat([lh, name, data, cd, e64, loc, eo]));
  const ents = pak.list(f);
  assert.deepEqual([ents[0].name, ents[0].size, ents[0].off], ['a/x.ply', 8, 0]);
  assert.equal(pak.read(ents, ents[0]).toString(), 'EPLYdata');
  fs.rmSync(d, { recursive: true });
});

t('zipwrite crc + forced zip64 + writeZip stream (VFS-39/40)', () => {
  const { writeZip } = require('../zipwrite');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'zwtest-')), a = Buffer.from('{set\r\n}\r\n'), b = Buffer.alloc(5000, 'x');
  const files = [['set/a.set', a, true], ['tex/', Buffer.alloc(0)], ['tex/b.bin', () => b]];
  for (const z64 of [false, true]) {
    const f = path.join(d, `z${z64}.pak`); fs.writeFileSync(f, zip(files, { zip64: z64 }));
    const g = path.join(d, `w${z64}.pak`); writeZip(g, files, { zip64: z64 });
    assert.ok(fs.readFileSync(f).equals(fs.readFileSync(g)), 'zip == writeZip bytes');
    const ents = pak.list(g);
    assert.deepEqual(ents.map(e => e.name), ['set/a.set', 'tex/', 'tex/b.bin']);
    assert.ok(pak.read(ents, ents[0]).equals(a)); assert.ok(pak.read(ents, ents[2]).equals(b));
    assert.equal(ents[0].crc, zlib.crc32(a)); assert.equal(ents[2].crc, zlib.crc32(b));
    if (z64) assert.equal(fs.readFileSync(g).readUInt32LE(fs.statSync(g).size - 22 - 20), 0x07064b50, 'EOCD64 locator');
    // DOS date/time: default 1980-01-01 00:00 (date 0x21, never month 0) in local +10/+12 and central +12/+14
    for (const e of ents) { assert.equal(e.time, 0x00210000, 'default DOS date ' + e.name); assert.equal(fs.readFileSync(g).readUInt32LE(e.off + 10), 0x00210000, 'local header date ' + e.name); }
  }
  // a caller's date: every entry carries it, zip == writeZip, same input = same bytes
  const when = new Date(2026, 10, 10, 14, 30, 8), ds = require('../zipwrite').dosStamp(when), stamp = (ds.date << 16 | ds.time) >>> 0;
  const gz = path.join(d, 'dated.pak'); writeZip(gz, files, { date: when });
  assert.ok(fs.readFileSync(gz).equals(zip(files, { date: when })), 'dated zip == writeZip');
  assert.ok(zip(files).equals(zip(files)), 'default date repeatable');
  assert.deepEqual(pak.list(gz).map(e => e.time >>> 0), [stamp, stamp, stamp]);
  assert.equal(ds.date, (46 << 9) | (11 << 5) | 10); assert.equal(ds.time, (14 << 11) | (30 << 5) | 4);
  fs.rmSync(d, { recursive: true });
});

// sdlset: file selection + folder source (no game dir)
t('sdlset isSdl/extOf', () => {
  const s = require('../sdlset');
  assert.ok(s.isSdl('resource/entity/a.def')); assert.ok(s.isSdl('resource/set/stuff/gun/.presets')); assert.ok(!s.isSdl('resource/shader/x.inc'));
  assert.ok(!s.isSdl('resource/texture/a.dds')); assert.ok(!s.isSdl('resource/map/multi/pattern.info')); assert.equal(s.extOf('a/b.DEF'), 'def');
});
t('sdlset folder source: local files, includes, fragments', () => {
  const s = require('../sdlset');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlset-'));
  fs.mkdirSync(path.join(d, 'resource', 'entity'), { recursive: true });
  fs.writeFileSync(path.join(d, 'resource', 'entity', 'a.def'), '{e (include "b.ext")}');
  fs.writeFileSync(path.join(d, 'resource', 'entity', 'b.ext'), '{mass 5}');
  fs.writeFileSync(path.join(d, 'resource', 'entity', 'p.ply'), 'x');
  const src = s.createSource({ folder: d });
  const items = src.folderItems();
  assert.deepEqual(items.map(i => i.key).sort(), ['resource/entity/a.def', 'resource/entity/b.ext']);
  const r = src.read(items.find(i => i.key.endsWith('a.def')), () => {});
  assert.equal(r.root.items[0].items.length, 2);
  assert.ok(src.included.has('resource/entity/b.ext'));
  fs.rmSync(d, { recursive: true });
});
t('sdlset folder paks: read with mods [] too, engine mount order vs loose files, nested pak root', () => {
  const s = require('../sdlset'), { zip } = require('../zipwrite');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlset-pak-'));
  const w = (rel, b) => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), b); };
  w('resource/gamelogic.pak', zip([['set/a.set', Buffer.from('{pak}'), false], ['set/only.set', Buffer.from('{onlypak}'), false]]));
  w('resource/set/a.set', '{loose}');                                  // set/ sorts after gamelogic.pak: loose wins
  w('resource/entity.pak', zip([['entity/e.def', Buffer.from('{pak}'), false]]));
  w('resource/entity/e.def', '{loose}');                               // entity.pak sorts after entity/: pak wins
  w('resource/map/m.pak', zip([['x.set', Buffer.from('{nested}'), false]]));   // keyed at its own folder
  const src = s.createSource({ folder: d, mods: [] });
  assert.equal(String(src.get('resource/set/a.set')), '{loose}');
  assert.equal(String(src.get('resource/set/only.set')), '{onlypak}');
  assert.equal(String(src.get('resource/entity/e.def')), '{pak}');
  assert.equal(String(src.get('resource/map/x.set')), '{nested}');
  assert.equal(src.winner('resource/entity/e.def'), 'pak');
  assert.equal(src.open({ key: 'resource/set/only.set', kind: 'vfs' }).file, 'resource/gamelogic.pak!set/only.set');
  for (const k of src.packed().keys()) { const r = src.packed().get(k); try { fs.closeSync(r.l.fd); } catch (e) { /* shared fd */ } }
  fs.rmSync(d, { recursive: true });
});

t('report summary', () => {
  const r = createReport(), log = console.log, got = [];
  r.add('a/b/c/x.def', 1, 'K', '{foo} bad'); r.add('a/b/c/y.def', 2, 'K', '{foo} bad'); r.add('a/z.def', 3, 'K', '"bar" bad');
  r.info('a/x.def', 1, 'H', '{h} hint'); r.info('keylint', 0, 'H', '... 9 more H hints hidden (10 total)');
  console.log = l => got.push(l); try { r.print({ summary: true }); } finally { console.log = log; }
  assert.deepEqual(got, ['K 3 | foo×2 bar×1 | a/b/c×2 a×1', 'info: H 10 (tops of 1 shown) | h×1 | a×1', '3 findings']);
});

// bin
{
  const { Reader, BinError, chunks } = require('../bin');
  t('bin reader scalars', () => {
    const b = Buffer.alloc(24); b.writeUInt8(7, 0); b.writeUInt16LE(513, 1); b.writeInt32LE(-5, 3); b.writeFloatLE(1.5, 7); b.write('abc ', 11, 'latin1'); b.write('EPLY', 15, 'latin1');
    const r = new Reader(b);
    assert.equal(r.u8(), 7); assert.equal(r.u16(), 513); assert.equal(r.i32(), -5); assert.equal(r.f32(), 1.5);
    assert.equal(r.cstr(), 'abc'); assert.equal(r.peekTag(), 'EPLY'); assert.equal(r.tag(), 'EPLY'); assert.equal(r.left, 5);
  });
  t('bin bounds', () => {
    const r = new Reader(Buffer.alloc(3));
    assert.throws(() => r.u32(), BinError); assert.equal(r.pos, 0);
    assert.throws(() => r.skip(-1), BinError); assert.throws(() => new Reader(Buffer.from('ABC')).cstr(), BinError);
    assert.equal(new Reader(Buffer.from([2, 0, 0, 0, 65, 66]), 0).lstr(4), 'AB');
    assert.throws(() => new Reader(Buffer.from([9, 65])).lstr(1), BinError);
  });
  t('bin sub + chunks', () => {
    const b = Buffer.concat([Buffer.from('AAAA'), Buffer.from([2, 0, 0, 0, 1, 2]), Buffer.from('BBBB'), Buffer.from([0, 0, 0, 0])]);
    const c = chunks(b);
    assert.deepEqual(c.map(x => [x.id, x.start, x.size]), [['AAAA', 8, 2], ['BBBB', 18, 0]]);
    assert.throws(() => chunks(b.subarray(0, 9)), BinError);
    const r = new Reader(b, 8); const s = r.sub(2); assert.equal(s.u8(), 1); assert.equal(s.left, 1); assert.equal(r.pos, 10);
  });
}
t('pakset open/sample/read/close', () => {
  const ps = require('../pakset');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pakset-'));
  try {
    fs.mkdirSync(path.join(d, 'sub', 'deep'), { recursive: true });
    const B = s => Buffer.from(s);
    const many = []; for (let i = 0; i < 10; i++) many.push(['Dir\\F' + i + '.DDS', B('d' + i), i % 2 === 0]);
    fs.writeFileSync(path.join(d, 'a.pak'), zip([['dir/', Buffer.alloc(0)], ['Dir/a.ply', B('PLY')], ...many]));
    fs.writeFileSync(path.join(d, 'sub', 'deep', 'b.PAK'), zip([['x/b.anm', B('ANM')]]));
    fs.writeFileSync(path.join(d, 'sub', 'note.txt'), 'x');
    const s = ps.open(d, {});
    assert.equal(s.entries.length, 12);
    assert.ok(s.entries.every(e => e.name === e.name.toLowerCase() && !e.name.includes('\\')));
    assert.equal(ps.read(s.entries.find(e => e.name === 'x/b.anm')).toString(), 'ANM');
    assert.equal(ps.read(s.entries.find(e => e.name === 'dir/f4.dds')).toString(), 'd4');
    assert.equal(ps.read(s.entries.find(e => e.name === 'dir/f3.dds')).toString(), 'd3');
    assert.equal(new Set(s.entries.map(e => e.pak)).size, 2);
    const fdl = s.entries[0].L;
    assert.ok(fdl.fd !== undefined);
    s.close(); assert.equal(fdl.fd, undefined); s.close();
    const f = ps.open(d, { ext: new Set(['.dds']) });
    assert.equal(f.entries.length, 10); f.close();
    const sm = ps.sample(f.entries, 3).map(e => e.name);
    assert.deepEqual(sm, ['dir/f0.dds', 'dir/f3.dds', 'dir/f6.dds']);
    assert.deepEqual(ps.sample(f.entries, 3).map(e => e.name), sm);
    assert.equal(ps.sample(f.entries, 10).length, 10); assert.equal(ps.sample(f.entries, 99).length, 10);
    assert.equal(ps.sample(s.entries, 1).length, 3);
    assert.equal(ps.open(path.join(d, 'nope'), {}).entries.length, 0);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
t('encodeCp1251', () => {
  const b = require('../enc').encodeCp1251('aПрё☃');
  assert.deepEqual([...b], [0x61, 0xCF, 0xF0, 0xB8, 0x3F]); assert.deepEqual(b.lost, ['☃']);
});
t('testfolders', () => {
  const tf = require('../testfolders');
  assert.equal(tf.FOLDERS.length, 8); assert.equal(tf.FOLDERS[7], 'e2e_test8'); assert.equal(tf.forWorker(1), 'e2e_test'); assert.equal(tf.forWorker(3), 'e2e_test3');
  assert.ok(tf.isApproved('e2e_test') && tf.isApproved('e2e_test8')); assert.ok(!tf.isApproved('e2e_test9') && !tf.isApproved('e2e_test1') && !tf.isApproved('as64+') && !tf.isApproved('../e2e_test'));
  assert.deepEqual(tf.pool(3), ['e2e_test', 'e2e_test2', 'e2e_test3']);
  assert.equal(tf.instFor(1, 0), 1); assert.equal(tf.instFor(2, 3), 4); assert.equal(tf.instFor(3, 8), null); assert.equal(tf.instFor(9, 1), 9); assert.equal(tf.instFor(10, 1), null);
  assert.match(tf.refusal('e2e_test,mymod'), /mymod/); assert.equal(tf.refusal(['e2e_test4']), null);
  // per game (TST-19: mowas_2.exe has no -instance; GoH has no control pipe): only as64 (and no game named) numbers instances
  assert.equal(tf.hasInstances(), true); assert.equal(tf.hasInstances('as64'), true);
  for (const g of ['mowas2', 'mowas_2', 'goh']) { assert.equal(tf.hasInstances(g), false, g); assert.equal(tf.instFor(1, 1, g), null, g); }
  assert.equal(tf.instFor(2, 1, 'as64'), 2); assert.equal(tf.instFor(2, 3, 'as64'), 4); assert.equal(tf.instFor(9, 2, 'as64'), null);
});
require('./sdlx.test')(t, assert);
require('./sdlwrite.test')(t, assert);
require('./mapnet.test')(t, assert);
require('./report.test')(t, assert);
require('./lintrc.test')(t, assert);
require('./sdldiff.test')(t, assert);
require('./plyanm.test')(t, assert);
require('./vfsas64.test')(t, assert);
require('./registry.test')(t, assert); require('./registry.test').severity(t, assert);
require('./gamedir.test')(t, assert);
require('./games.test')(t, assert);
require('./wav.test')(t, assert);
require('./writeguard.test')(t, assert);
require('./modinfotext.test')(t, assert);
require('./limmap.test')(t, assert);
require('./model-vol.test')(t, assert);
require('./model-trace.test')(t, assert);
require('./model-anm.test')(t, assert);
require('./model-ply.test')(t, assert);
require('./model-mdl.test')(t, assert);
require('./model-scene.test')(t, assert);
require('./model-edit-core.test')(t, assert);
require('./model-edit-tree.test')(t, assert);
require('./model-edit-vol.test')(t, assert);
require('./model-edit-ply.test')(t, assert);
require('./model-edit-anm.test')(t, assert);
require('./model-edit-file.test')(t, assert);
require('./model-obj.test')(t, assert);
require('./model-dds.test')(t, assert);
require('./model-dds-bc5.test')(t, assert);
require('./model-ddsenc.test')(t, assert);
require('./model-scenecache.test')(t, assert);
require('./userdir.test')(t, assert);
console.log(`${n} passed`);
