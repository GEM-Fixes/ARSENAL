// lng fixture: fixture/mod (loose CRLF .lng, BOM '#' file, packed .lng, GoH .pot, GoH translated .po in a lang pak (Valour ru.pak layout), cp1251 bad file)
// Author: Imperator_Aug (ARSENAL, ia-f86bf4dd)
const fs = require('fs'), path = require('path'), zw = require('../../lib/zipwrite');
const dir = path.join(process.env.TEST_WORK || __dirname, 'fixture');
fs.rmSync(dir, { recursive: true, force: true });
const put = (rel, buf) => { const f = path.join(dir, 'mod', rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); };
put('localization/desc.lng', Buffer.from('{tags\r\n\t{"entity"\r\n\t\t{"foo" "Fox <c(ff0000)>red</c> %s"}\r\n\t\t{"bar" "Line\\none \\"q\\""}\r\n\t}\r\n\t; comment\r\n\t{"info" {"squad" {"s1" "Squad {0} x"}}}\r\n}\r\n'));
put('localization/#my.lng', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{tags\n\t{"hello" "Привет"}\n\t{"hello" "dup"}\n}\n', 'utf8')]));
// cp1251 bytes in a .lng: invalid UTF-8 (LOC-05)
put('localization/bad.lng', Buffer.from([0x7b, 0x74, 0x61, 0x67, 0x73, 0x20, 0x7b, 0x22, 0x6b, 0x22, 0x20, 0x22, 0xcf, 0xf0, 0x22, 0x7d, 0x7d]));
put('localizations/default/interface/text/desc/desc_x.pot', Buffer.from('#, fuzzy\nmsgid ""\nmsgstr ""\n"Language: en\\n"\n\n#. note for translator\nmsgctxt "desc/squad/sq(ger)"\nmsgid "Squad %d"\nmsgstr ""\n\nmsgctxt "desc/squad/long"\nmsgid ""\n"A "\n"B"\nmsgstr "Old"\n'));
// translated .po in localizations/ru.pak, entry path starts with the language (no localizations/ prefix)
zw.writeZip(path.join(dir, 'mod/localizations/ru.pak'), [['ru/interface/text/desc/y.po', Buffer.from('msgid ""\nmsgstr ""\n"Language: ru\\n"\n\nmsgctxt "desc/weapon/w1"\nmsgid "Rifle"\nmsgstr "Vintovka"\n')]]);
fs.mkdirSync(path.join(dir, 'mod/resource'), { recursive: true });
zw.writeZip(path.join(dir, 'mod/resource/game.pak'), [['interface/text/packed.lng', Buffer.from('{tags {"p" {"q" "Packed text"}}}\r\n')]]);
// FIX-PORT (tools-mod:30, tools-other:70): a LF mod.info; merge into a new --out copies it CRLF
put('mod.info', Buffer.from('{name "lng fixture"}\n{desc "x"}\n'));
