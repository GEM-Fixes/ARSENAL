// roundtrip test fixtures: written fresh into ./fixture (CRLF, cp1251 bytes, comments, quoted strings, nested blocks)
// Author: Imperator_Aug (ARSENAL, ia-5006ccdd)
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'fixture');
fs.rmSync(dir, { recursive: true, force: true });
const W = (rel, content, enc = 'latin1') => {
  const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, Buffer.isBuffer(content) ? content : Buffer.from(content, enc));
};
const crlf = s => s.replace(/\r?\n/g, '\r\n');
const RU = Buffer.from([0xCF, 0xF0, 0xE8, 0xE2, 0xE5, 0xF2]);          // cp1251 "Привет"
const cp = (a, b) => Buffer.concat([Buffer.from(crlf(a), 'latin1'), RU, Buffer.from(crlf(b), 'latin1')]);

W('a.def', cp('; entity def, comment with cp1251 bytes: ', `
{entity
  {mass 12.5}
  ; inner comment { with brace
  {"name" "quoted \\"inner\\" value" "second"}
  {mdl {file "/entity/x.mdl"} {scale 1.0 1.0 1.0}}
  (include "base.ext")
}
`));
W('b.set', cp('{set\n  {"title" "', '"}\n  {items {a 1} {b 2} {c {d "e f"}}}\n}\n'));
W('c.mi', crlf('{mission\n  ; no trailing newline after the last brace\n  {"objective" "reach" {x 10} {y 20}}\n}'));
W('d.mdl', crlf('{model\n  {mesh "a.ply" {material "m"}}\n}\n'));
W('e.ext', crlf('{ext= {a=1} {b "two words"} }\n'));
W('f.inc', cp('; ', '\n{macro {x 1}}\n'));
W('g.mtl', Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(crlf('{material {diffuse "d.tga"} {layer {color 1 0 0}}}\n'))]));   // UTF-8 BOM kept
W('h.lng', Buffer.from(crlf('{tags {"hint_1" "Привет мир"}}\n'), 'utf8'));                           // UTF-8 text
W('i.info', crlf('{info {name "m"} {size 64 64}}\n'));
W('j.mod', crlf('{mod {name "x"} {version "1.0"}}\n'));
W('k.def', Buffer.from('{lf_only\n  {a 1}\n  {b 2}\n}\n', 'latin1'));                                            // LF endings
W('l.def', Buffer.from('{empty}\r\n; only comments after\r\n; ok\r\n', 'latin1'));
W('skip.txt', '{not a type');                                                                                    // other extension: not scanned
// parse fails
W('bad/unclosed.def', crlf('{a\n  {b 1}\n'));
W('bad/stray.set', crlf('{a 1}\n}\n'));
W('bad/str.mi', crlf('{a "never closed\n}\n'));
W('bad/utf16.inc', Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from('{a}', 'utf16le')]));
