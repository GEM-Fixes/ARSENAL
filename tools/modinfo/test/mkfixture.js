// regenerates fixture/mods (CRLF, latin1 bytes)
// Author: Imperator_Aug (ARSENAL, ia-64f8b45a)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, 'fixture', 'mods');
const V = '{MinGameVersion "3.262"}\r\n{MaxGameVersion "3.262"}\r\n';
const m = (n, b) => { fs.mkdirSync(path.join(root, n), { recursive: true }); fs.writeFileSync(path.join(root, n, 'mod.info'), b, 'latin1'); };
const h = n => `{Mod\r\n{Name "${n}"}\r\n`;
m('ok', h('ok') + V + '{FileId "123"}\r\n}\r\n');
m('syn_unbalanced', h('syn_unbalanced') + V);
m('syn_string', h('syn_string') + '{Desc "abc\r\n}\r\n' + V + '}\r\n');
m('syn_noroot', '{Foo\r\n{Name "x"}\r\n}\r\n');
m('unk_key', h('unk_key') + '{Desk "x"}\r\n' + V + '}\r\n');
m('dup_key', h('dup_key') + '{Name "dup_key"}\r\n' + V + '}\r\n');
m('ver_missing', h('ver_missing') + '{MinGameVersion "3.262"}\r\n}\r\n');
m('ver_range', h('ver_range') + '{MinGameVersion "3.263"}\r\n{MaxGameVersion "3.265"}\r\n}\r\n');
m('ver_old', h('ver_old') + '{MinGameVersion "3.200"}\r\n{MaxGameVersion "3.250"}\r\n}\r\n');
m('ver_order', h('ver_order') + '{MinGameVersion "3.265"}\r\n{MaxGameVersion "3.260"}\r\n}\r\n');
m('req_missing', h('req_missing') + '{Require "ok:1.0"}\r\n{Require "nothere"}\r\n' + V + '}\r\n');
m('delete_prefix', h('delete_prefix') + '{Delete "resource/set/a"}\r\n{Delete "resource/set/"}\r\n{Delete "set/x"}\r\n' + V + '}\r\n');
m('bad_fileid', h('bad_fileid') + '{FileId "12ab"}\r\n' + V + '}\r\n');
m('parse_quote', h('parse_quote') + '{Desc "Module request: on with AS64+ s "double", made for it."}\r\n' + V + '}\r\n');
m('parse_bare', h('parse_bare') + '{MinGameVersion 3.262}\r\n{MaxGameVersion "3.262"}\r\n}\r\n');
m('modern_ok', h('modern_ok') + '{Require "as64+"}\r\n{Desc "esc \\"q\\" ok"}\r\n{MinGameVersion "3.301"}\r\n}\r\n');
m('modern_future', h('modern_future') + '{Require "as64+"}\r\n{MinGameVersion "3.302"}\r\n}\r\n');   // VFS-59 seeded: Min above the build
m('enc_bom', '\xff\xfe{\x00M\x00');
fs.mkdirSync(path.join(root, 'not_mod'), { recursive: true });
