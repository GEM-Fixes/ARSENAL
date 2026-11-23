// check-false D: never-loaded roots are info, %param lines and {## are not crashes
// MACRO_UNDEFINED after a missing include folds into it; true positives on entity defs stay errors
// Author: Imperator_Aug (ARSENAL, ia-b8937db0)
const fs = require('fs'), path = require('path'), os = require('os'), sdllint = require('../sdllint');
let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
const w = fs.mkdtempSync(path.join(os.tmpdir(), 'sdllint-false-'));
try {
  const put = (f, s) => { fs.mkdirSync(path.dirname(path.join(w, f)), { recursive: true }); fs.writeFileSync(path.join(w, f), s); };
  put('resource/texture/t/skin.def', '(include "missing.inc")\r\n("nodef" x(1))\r\n');
  put('resource/entity/a/a.def', '{game_entity\r\n\t(include "/properties/missing.inc")\r\n\t("nodef" x(1))\r\n\t("nodef2" x(1))\r\n}\r\n');
  put('resource/entity/a/b.def', '{game_entity\r\n\t{##on blast {x 1}}\r\n}\r\n');
  put('resource/entity/a/c.def', '{game_entity\r\n\t("nodef" x(1))\r\n}\r\n');
  put('resource/entity/a/gun.mtl', '# obj material\r\nnewmtl gun\r\nKd 1 1 1\r\n');
  put('resource/entity/a/used.mtl', '# obj material\r\nnewmtl used\r\nKd 1 1 1\r\n');
  put('resource/entity/a/a.ply', 'EPLYBNDS\0\0\0\0used.mtl\0');
  put('resource/properties/sel.inc', '{scale (* 0.50 %scalex)}\r\n');
  const j = sdllint.run({ folder: w }).toJSON({ tool: 'sdllint' });
  const list = [...j.findings, ...j.info], all = JSON.stringify(list);
  const at = (s, code) => list.filter(f => (f.file || '').replace(/\\/g, '/').includes(s) && f.code === code).length;
  const err = s => j.findings.filter(f => (f.file || '').replace(/\\/g, '/').includes(s)).map(f => f.code);
  ok(err('texture/').length === 0 && at('texture/t/skin.def', 'SDL_DEF_NOT_ENTITY') >= 1, 'texture def is info: ' + all);
  ok(at('a/a.def', 'INCLUDE_MISSING') === 1 && at('a/a.def', 'MACRO_UNDEFINED') === 0 && list.some(f => f.code === 'INCLUDE_MISSING' && /\+2 MACRO_UNDEFINED follow-ons/.test(f.msg)), 'follow-ons folded: ' + all);
  ok(err('a/b.def').length === 0 && at('a/b.def', 'SDL_DISABLED_TAG') === 1, '{## is disabled, not TAG_SWALLOWS: ' + all);
  ok(at('a/c.def', 'MACRO_UNDEFINED') === 1, 'real macro error kept: ' + all);
  ok(err('gun.mtl').length === 0 && at('gun.mtl', 'SDL_MTL_UNREFERENCED') >= 1, 'unreferenced OBJ mtl is info: ' + all);
  ok(err('used.mtl').length >= 1, 'mtl a ply names stays linted: ' + all);
  ok(err('sel.inc').length === 0 && at('sel.inc', 'SDL_FRAGMENT_MACRO') >= 1, 'standalone .inc %param is info: ' + all);
} finally { fs.rmSync(w, { recursive: true, force: true }); }
if (!bad) console.log('false ok');
process.exit(bad ? 1 : 0);
