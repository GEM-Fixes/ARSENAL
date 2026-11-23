// Author: Imperator_Aug (ARSENAL, ia-dcf15a4d)
'use strict';
// FXE-1 cause 2: a def whose {Extension "x.mdl"} sits in an included .inc (GoH mortars: (include "81mm_mortar.inc")) names its model through the include.
const fs = require('fs'), path = require('path');
const g = require('../goh2as2.js');
const root = path.join(__dirname, 'fixture', 'mdlkey');
const dir = path.join(root, 'entity', 'mort');
fs.mkdirSync(dir, { recursive: true });
const w = (n, t) => fs.writeFileSync(path.join(dir, n), t);
w('mort_a.def', '{game_entity\r\n\t(include "mort.inc")\r\n\t{props "mortar"}\r\n}\r\n');
w('mort_b.def', '{game_entity\r\n\t(include "mort.inc")\r\n}\r\n');
w('mort_c.def', '{game_entity\r\n\t{Extension "own.mdl"}\r\n\t(include "mort.inc")\r\n}\r\n');
w('mort_d.def', '{game_entity\r\n\t(include "nowhere.inc")\r\n}\r\n');
w('mort_e.def', '{game_entity\r\n\t(include "loop1.inc")\r\n}\r\n');
w('mort.inc', '{Extension "shared.mdl"}\r\n');
w('loop1.inc', '(include "loop2.inc")\r\n');
w('loop2.inc', '(include "loop1.inc")\r\n');
w('shared.mdl', '{mdl}'); w('own.mdl', '{mdl}');
const map = new Map();
for (const f of fs.readdirSync(dir)) map.set('entity/mort/' + f, { path: path.join(dir, f) });
const idx = { map };
let bad = 0;
const t = (n, want) => {
  const k = 'entity/mort/mort_' + n + '.def';
  const got = g.mdlKeyOf(k, g.decodeText(fs.readFileSync(path.join(dir, 'mort_' + n + '.def'))).src, idx);
  if (got !== want) { console.log(`FAIL mdlkey ${n}: got ${got} want ${want}`); bad++; }
};
t('a', 'entity/mort/shared.mdl');   // via include
t('b', 'entity/mort/shared.mdl');
t('c', 'entity/mort/own.mdl');      // the def's own Extension still wins (old rule kept); includes are only the fallback
t('d', null);                       // include names no file: still null
t('e', null);                       // include loop: terminates
if (bad) process.exit(1);
console.log('mdlkey ok');
