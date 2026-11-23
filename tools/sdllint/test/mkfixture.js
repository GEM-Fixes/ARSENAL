// odd-byte fixtures: UTF-16 BOM (f.def) and a raw 0x90 byte outside strings (g.def); 0x90 inside a string is fine
// Author: Imperator_Aug (ARSENAL, ia-a36b815a)
const fs = require('fs'), path = require('path');
const d = path.join(__dirname, 'bad');
fs.writeFileSync(path.join(d, 'f.def'), Buffer.from([0xFF, 0xFE, 0x7B, 0, 0x61, 0, 0x7D, 0]));
fs.writeFileSync(path.join(d, 'g.def'), Buffer.concat([Buffer.from('{g1 "ok\x90str"}\r\n{g2 '), Buffer.from([0x90]), Buffer.from('}\r\n', 'latin1')]));
// ENCFIX: string values must be UTF-8 (as64 shows cp1251 as U+FFFD): h.def has a cp1251 string (warned) and a cp1251 comment (not);
// ok/u.def has UTF-8 strings and a cp1251 comment (clean)
fs.writeFileSync(path.join(d, 'h.def'), Buffer.concat([Buffer.from('{h1 "'), Buffer.from([0xCF, 0xF0, 0xE8, 0xE2, 0xE5, 0xF2]), Buffer.from('"} ; '), Buffer.from([0xEA, 0xEE, 0xEC]), Buffer.from([13, 10])]));
fs.writeFileSync(path.join(__dirname, 'ok', 'u.def'), Buffer.concat([Buffer.from('{u1 "Привет «ёлка» №5"} ; ', 'utf8'), Buffer.from([0xEA, 0xEE, 0xEC]), Buffer.from([13, 10])]));
