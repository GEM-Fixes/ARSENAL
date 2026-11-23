// map-clone fixture: fixture/game (AS2: loose map a1, packed map a2 in map.pak) + fixture/goh (GoH net 05 02)
// Author: Imperator_Aug (ARSENAL, ia-91857ec0)
const fs = require('fs'), path = require('path'), zw = require('../../lib/zipwrite');
const dir = path.join(process.env.TEST_WORK || __dirname, 'fixture');
fs.rmSync(dir, { recursive: true, force: true });
const net = cell => { const h = Buffer.alloc(14); h[0] = cell; h[1] = 2; h.writeInt16LE(1, 2); h.writeInt16LE(1, 4); return Buffer.concat([h, Buffer.from('MAP0'), Buffer.from([0]), Buffer.from('MAP1'), Buffer.from([0]), Buffer.from('GRID'), Buffer.from([1, 0, 0, 0])]); };
const files = (m, cell) => [
  ['map.net', Buffer.concat([net(cell)])],
  ['map.info', Buffer.from(';SDL\r\n{game\r\n  {maxPlayers 2}\r\n}\r\n')],
  ['combat.mi', Buffer.from(`{mission\r\n\t; ${m}\r\n\t{Entity "x" 0xc000\r\n\t\t{Ref "map/multi/${m}/combat"}\r\n\t\t{Same "${m}"}\r\n\t\t{Other "${m}_b"}\r\n\t}\r\n}\r\n`)],
  ['map.ply', Buffer.concat([Buffer.from('PLY'), Buffer.from(m), Buffer.from([0, 1, 2])])],
];
const put = (root, rel, buf) => { const f = path.join(dir, root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); };
for (const [k, b] of files('a1', 0x0a)) put('game', 'resource/map/multi/a1/' + k, b);
zw.writeZip(path.join(dir, 'game/resource/map.pak'), files('a2', 0x0a).map(([k, b]) => ['map/multi/a2/' + k, b]));
for (const [k, b] of files('g1', 0x05)) put('goh', 'resource/map/multi/g1/' + k, b);
// game parity (GoH branch): a made-up GoH install marker (empty exe: version unreadable) and localizations/default.pak with the
// vanilla mission.pot form naming g1 (msgctxt "mission/multi/g1/name", a continued msgid with an escaped quote)
put('goh', 'binaries/x64/call_to_arms.exe', Buffer.alloc(0));
fs.mkdirSync(path.join(dir, 'goh/localizations'), { recursive: true });
zw.writeZip(path.join(dir, 'goh/localizations/default.pak'), [['default/interface/text/mission.pot', Buffer.from('﻿msgid ""\r\nmsgstr ""\r\n\r\nmsgctxt "mission/multi/other/name"\r\nmsgid "Other"\r\nmsgstr ""\r\n\r\nmsgctxt "mission/multi/g1/name"\r\nmsgid "G \\"One\\""\r\n" Field"\r\nmsgstr ""\r\n', 'utf8')]]);
// goh2: a second made-up GoH install whose call_to_arms.exe is a tiny PE with ProductVersion 1.0.6.7-test (mod.info Min = Max = 1.067
// with no --game-version) and whose g1 name holds an escaped tab and line break (the clone's .pot must keep them escaped)
function pe(v) {   // minimal PE32, one resource section: RT_VERSION / 1 / 0x409 whose block carries ProductVersion = v (as tools/lib/test/games.test.js)
  const b = Buffer.alloc(0x400);
  b.write('MZ', 0, 'latin1'); b.writeUInt32LE(0x40, 0x3C);
  const P = 0x40; b.write('PE\0\0', P, 'latin1');
  b.writeUInt16LE(1, P + 6); b.writeUInt16LE(0xE0, P + 20);
  const opt = P + 24; b.writeUInt16LE(0x10B, opt); b.writeUInt32LE(0x1000, opt + 96 + 16);
  const sec = opt + 0xE0; b.writeUInt32LE(0x200, sec + 8); b.writeUInt32LE(0x1000, sec + 12); b.writeUInt32LE(0x200, sec + 16); b.writeUInt32LE(0x200, sec + 20);
  const R = 0x200, d = (off, id, target) => { b.writeUInt16LE(1, R + off + 14); b.writeUInt32LE(id, R + off + 16); b.writeUInt32LE(target, R + off + 20); };
  d(0x00, 16, (0x80000000 | 0x18) >>> 0); d(0x18, 1, (0x80000000 | 0x30) >>> 0); d(0x30, 0x409, 0x48);
  const blk = Buffer.concat([Buffer.from('ProductVersion\0', 'utf16le'), Buffer.alloc(2), Buffer.from(v + '\0', 'utf16le')]);
  b.writeUInt32LE(0x1000 + 0x60, R + 0x48); b.writeUInt32LE(blk.length, R + 0x4C); blk.copy(b, R + 0x60);
  return b;
}
for (const [k, b] of files('g1', 0x05)) put('goh2', 'resource/map/multi/g1/' + k, b);
put('goh2', 'binaries/x64/call_to_arms.exe', pe('1.0.6.7-test'));
fs.mkdirSync(path.join(dir, 'goh2/localizations'), { recursive: true });
zw.writeZip(path.join(dir, 'goh2/localizations/default.pak'), [['default/interface/text/mission.pot', Buffer.from('msgid ""\r\nmsgstr ""\r\n\r\nmsgctxt "mission/multi/g1/name"\r\nmsgid "A\\tB\\nC"\r\nmsgstr ""\r\n', 'utf8')]]);
// chain-n: map that lives only in a mod (B9 maps in mods/b9m_t): --mods <id> via lib/vfs, --mod <dir> for any folder
for (const [k, b] of files('m9', 0x0a)) put('game', 'mods/mm_t/resource/map/multi/m9/' + k, b);
put('game', 'mods/mm_t/mod.info', Buffer.from('{Mod\r\n\t{Name "mm_t"}\r\n\t{MinGameVersion "3.262.0"}\r\n\t{MaxGameVersion "3.262.1"}\r\n}\r\n'));
for (const [k, b] of files('d9', 0x0a)) put('loose_mod', 'resource/map/multi/d9/' + k, b);
// sub-folder map (map/single/sub/s1): loc file goes to localization/mission/single/sub/<new>.lng, 0 findings
for (const [k, b] of files('s1', 0x0a)) put('game', 'resource/map/single/sub/s1/' + k.replace('map/multi/', 'map/single/sub/'), k === 'combat.mi' ? Buffer.from(b.toString('latin1').replace('map/multi/', 'map/single/sub/'), 'latin1') : b);
// C2c (CHAIN-T): map i1 with 2 modes: combat.mi includes ../shared.inc (game has it), assault.mi includes ../gone.inc (nowhere)
for (const [k, b] of files('i1', 0x0a)) put('game', 'resource/map/multi/i1/' + k, k === 'combat.mi' ? Buffer.from(b.toString('latin1').replace('{mission\r\n', '{mission\r\n\t(include "../shared.inc")\r\n'), 'latin1') : b);
put('game', 'resource/map/multi/shared.inc', Buffer.from('{x}\r\n'));
put('game', 'resource/map/multi/i1/assault.mi', Buffer.from('{mission\r\n\t\t(include "../gone.inc")\r\n}\r\n'));
put('game', 'resource/map/multi/i1/assault.info', Buffer.from('{game}\r\n'));
