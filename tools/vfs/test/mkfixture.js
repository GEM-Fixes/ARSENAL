// builds test/fixture/game: tiny game dir (paks via lib/zipwrite) + 9 mods. see truth.md
// Author: Imperator_Aug (ARSENAL, ia-1e1058f7)
const fs = require('fs'), path = require('path');
const { zip } = require('../../lib/zipwrite');
const root = path.join(__dirname, 'fixture', 'game');
fs.rmSync(path.join(__dirname, 'fixture'), { recursive: true, force: true });
const B = s => Buffer.from(s, 'latin1');
const w = (rel, data) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof data === 'string' ? B(data) : data); };
const info = (extra = '', min = '3.262', max = '3.262') => `{Mod\r\n {Name "x"}\r\n {MinGameVersion "${min}"}\r\n {MaxGameVersion "${max}"}\r\n${extra}}\r\n`;
const patch = body => `{Patch\r\n${body}}\r\n`;
const E = Buffer.alloc(0);

// ---- base
w('1.pat', zip([['1.patch', B(patch(' {id 1}\r\n'))]]));
w('localization.pak', zip([['desc.lng', B('base-desc')]]));
w('resource/a.pak', zip([
  ['set/x.set', B('a-x')], ['Set\\Y.set', B('a-y')], ['set/base_only.set', B('bo')], ['set/keep.set', B('k')],
  ['gone/1.x', B('1')], ['gone/2.x', B('2')], ['set/', E], ['dup/d.x', B('first')], ['DUP/D.X', B('second')],
]));
w('resource/entity/e1.pak', zip([['-vehicle/t.def', B('def')]]));
w('resource/set/x.set', 'loose-x');            // 'set' sorts after 'a.pak' -> loose wins over pak (order.md)
w('resource/set/rm.set', 'rm');
w('resource/set/ignored.txt', 'x');            // VFS-06 skipped
w('resource/set/ok.mtl', 'm');                 // exempt from skip
w('resource/.svn/z.set', 'svn');               // VFS-07
w('resource/set/.gitignore', 'g');

// ---- mods
const mod = (name, infoText, files = {}) => { w(`mods/${name}/mod.info`, infoText); for (const [k, v] of Object.entries(files)) w(`mods/${name}/${k}`, v); };
mod('moda', info(), {
  'resource.pak': zip([['set/x.set', B('moda-x')], ['gone/own.x', B('own')], ['set/only_a.set', B('oa')]]),
  '1.pat': zip([['m.patch', B(patch(' {id 1}\r\n {delete "set/y.set"}\r\n {delete "gone/"}\r\n {remap "set/rm.set" "set/rm2.set"}\r\n'))]]),
  '4.pat': zip([['m.patch', B(patch(' {id 4}\r\n'))]]),   // PAT_GAP
  '1.patch': patch(' {id 1}\r\n'),                          // info: editable source next to 1.pat
  'readme.md': 'hi',                                        // info: ignored root file
});
mod('modb', info(' {Require "moda"}\r\n {Delete "resource/set/base_only.set"}\r\n {Delete "set/keep.set"}\r\n'), {
  'resource/set/x.set': 'modb-x',                           // beats moda's pak copy
  'resource/readme.txt': 'skipped',
  '1.pat': zip([['1.patch', B(patch(' {id 1}\r\n'))]]),
  'localization/desc.lng': 'modb-desc',
});
mod('modc', info(), { 'x.patch': patch(' {id 1}\r\n'), 'resource/set/c.set': 'c' });                  // MOD_ROOT_PATCH (no N.pat)
mod('modd', info(' {Require "ghost"}\r\n'));                                                          // MOD_REQUIRE_MISSING
mod('mode', info('', '3.100', '3.200'));                                                             // MOD_VERSION
mod('modf', info(), { '1.pat': zip([['set/f.set', B('f')]]) });                                       // PATCH_NO_DOC
mod('modg', info(), { '1.pat': zip([['g.patch', B(patch(' {id 2}\r\n {delete "set/only_a.set"}\r\n'))]]) }); // PATCH_ID
mod('modh', info(), { '1.pat': zip([['h.patch', B(patch(' {id 1}\r\n {remap "set/nothere.set" "set/z.set"}\r\n'))]]) }); // PATCH_REMAP_MISSING
mod('modi', info(), { '1.pat': zip([['i.patch', B(patch(' {id 1}\r\n'))]]) });                        // list "modi:2" -> MOD_VER_GATE
mod('modx', info(' {Require "mody"}\r\n'));
mod('mody', info(' {Require "modx"}\r\n'));                                                           // cycle (separate list)
