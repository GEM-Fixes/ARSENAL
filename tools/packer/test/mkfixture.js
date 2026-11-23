// packer fixture: fixture/mod + truth.md. put(rel, bytes[, code, line]) seeds a defect → truth "rel:line: CODE"
// Author: Imperator_Aug (ARSENAL, ia-c20d7b30)
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'fixture');
fs.rmSync(dir, { recursive: true, force: true });
const truth = ['# file[:line]: CODE (seeded defects; diffed by run.sh)'];
const L = process.platform === 'win32' ? '\\\\?\\' : '';
function put(rel, data, ...defects) {
  const f = L + path.join(dir, 'mod', rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, Buffer.isBuffer(data) ? data : Buffer.from(data, 'latin1'));
  for (let i = 0; i < defects.length; i += 2) truth.push(`${rel}${defects[i + 1] ? ':' + defects[i + 1] : ''}: ${defects[i]}`);
}

put('mod.info', '{Mod\r\n\t{Name "fx"}\r\n\t{Delete "resource/set/gone.set"}\r\n}\r\n');
put('resource/set/clean.set', Buffer.concat([Buffer.from('{x 1}\r\n{y "'), Buffer.from('«ёлка»', 'utf8'), Buffer.from('"} ; \xCF\xF0\r\n', 'latin1')]));   // UTF-8 string, cp1251 comment, CRLF: clean
put('resource/set/lf.set', '{x 1}\n{y 2}\n', 'WARN_TEXT_NOT_CRLF', 1);
put('resource/set/utf.set', Buffer.concat([Buffer.from('{x 1}\r\n{y '), Buffer.from('éя', 'utf8'), Buffer.from('}\r\n')]), 'WARN_TEXT_NONASCII_IDENT', 2);   // non-ASCII outside a string
put('resource/set/cp.set', '{x 1}\r\n{x 2}\r\n{y "\xCF\xF0"}\r\n', 'WARN_STR_NOT_UTF8', 3);   // legacy cp1251 string
put('resource/set/bom16.set', Buffer.from([0xFF, 0xFE, 0x1F, 0x04, 0x40, 0x04]), 'WARN_TEXT_BOM', 1);
put('resource/properties/ok.lng', Buffer.from('{"a" "я"}\r\n', 'utf8'));
put('resource/properties/bad.lng', '{"a" "x"}\r\n{"b" "\xE9"}\r\n', 'LNG_NOT_UTF8', 2);
put('resource/entity/unit.def', '{x 1}\r\n');
put('resource/entity/.git/config', 'junk');                                              // excluded, silent
put('resource/entity/thumbs.db', 'junk');                                                // excluded, silent
put('resource/.arsenal-made', '{}');                                                    // toolkit marker: not packed, not reported (check.js)
put('resource/entity/.as2-installed', '{}');                                             // toolkit marker: not packed, not reported
put('resource/texture/pic.dds', Buffer.from([0, 1, 2, 0x0A, 0x0A]));                    // binary, no text check
put('resource/loose.txt', 'stays loose\n');                                              // not under a role folder
put('resource/shader/s.fx', '// fx\r\n');                    // shader goes to gamelogic.pak (as vanilla)
put('resource/difficulties/easy.dl', '{x 1}\r\n');           // GoH-style loose folder: --out copies it loose
put('resource/map/A.set', '{x 1}\r\n');   // (case-dup names cannot coexist on NTFS: WARN_PACK_DUP_NAME untested)
// loose overrides an entry of the mod's own existing pak
const { zip } = require('../../lib/zipwrite');
fs.writeFileSync(L + path.join(dir, 'mod', 'resource', 'sound.pak'), zip([['sound/old.set', Buffer.from('{x}\r\n')]]));
put('resource/sound/old.set', '{x 1}\r\n', 'WARN_LOOSE_SHADOWS_PAK', 0);
// entry name > 1023 bytes (VFS-04): 6 x 190-char dirs + file
const deep = 'resource/texture/' + Array.from({ length: 6 }, (_, i) => String(i).repeat(190)).join('/') + '/t.dds';
put(deep, Buffer.from([1]), 'ZIP_NAME_TOO_LONG', 0);

fs.writeFileSync(path.join(__dirname, 'truth.md'), truth.join('\n') + '\n');
