// CHK-SDL seeded: MAP_MTL_LAYER_COUNT STUFF_FROM_SELF STUFF_DAMAGE_NUMBER STR_ESCAPE_BS_N DDA_DISABLED_BLOCK MACRO_CASE_MISMATCH ARITH_DIV_ZERO
// each code fires on its defect file and stays quiet on the clean twin
// Author: Imperator_Aug (ARSENAL, ia-ab82fc77)
const fs = require('fs'), path = require('path'), os = require('os'), sdllint = require('../sdllint');
let bad = 0; const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
const w = fs.mkdtempSync(path.join(os.tmpdir(), 'sdllint-chk-'));
const NEW = new Set(['MAP_MTL_LAYER_COUNT', 'STUFF_FROM_SELF', 'STUFF_DAMAGE_NUMBER', 'STR_ESCAPE_BS_N', 'DDA_DISABLED_BLOCK', 'MACRO_CASE_MISMATCH', 'ARITH_DIV_ZERO']);
try {
  const put = (f, s) => { fs.mkdirSync(path.dirname(path.join(w, f)), { recursive: true }); fs.writeFileSync(path.join(w, f), s.replace(/\n/g, '\r\n')); };
  put('resource/map/m/mtl0.mtl', '{material\n\t{layer bump {diffuse "a.dds"}}\n}\n');
  put('resource/map/m/mtl1.mtl', '{material\n\t{layer bump {diffuse "a.dds"}}\n\t{layer detail {diffuse "b.dds"}}\n}\n');
  put('resource/set/stuff/chain.g43', '{from "g43"\n\t{tag "x"}\n}\n');
  put('resource/set/stuff/zeta.mg', '{from "g43"\n\t{tag "x"}\n}\n');
  put('resource/set/stuff/dmg.gun', '{from "pattern gun"\n\t{damage 40}\n}\n');
  put('resource/set/stuff/ok.gun', '{from "pattern gun"\n\t{damage blastwave {energy 1}}\n\t{special {damage 2.5}}\n}\n');
  put('resource/entity/a/esc.def', '{game_entity\n\t{name "a\\\\nb"}\n}\n');
  put('resource/entity/a/esc_ok.def', '{game_entity\n\t{name "a\\nb"}\n}\n');
  put('resource/set/multiplayer/multiplayer.set', '{x\n\t{##y 1}\n}\n');
  put('resource/set/multiplayer/other.set', '{x\n\t{##y 1}\n}\n');
  put('resource/entity/a/case.def', '(define "armor" {a 1})\n{game_entity\n\t("Armor")\n}\n');
  put('resource/entity/a/case_ok.def', '(define "armor" {a 1})\n{game_entity\n\t("armor")\n}\n');
  put('resource/entity/a/div.def', '{game_entity\n\t{v (/ 10 0)}\n}\n');
  put('resource/entity/a/div_ok.def', '{game_entity\n\t{v (/ 10 2)}\n\t{w (/ 0 4)}\n}\n');
  const j = sdllint.run({ folder: w }).toJSON({ tool: 'sdllint' });
  const got = [...j.findings, ...j.info].filter(f => NEW.has(f.code)).map(f => f.file.replace(/\\/g, '/').split('/').pop() + ':' + f.line + ':' + f.code).sort().join(' ');
  const want = ['mtl0.mtl:1:MAP_MTL_LAYER_COUNT', 'chain.g43:1:STUFF_FROM_SELF', 'dmg.gun:2:STUFF_DAMAGE_NUMBER', 'esc.def:2:STR_ESCAPE_BS_N',
    'multiplayer.set:2:DDA_DISABLED_BLOCK', 'case.def:3:MACRO_CASE_MISMATCH', 'div.def:2:ARITH_DIV_ZERO'].sort().join(' ');
  ok(got === want, 'new codes\n got  ' + got + '\n want ' + want);
} finally { fs.rmSync(w, { recursive: true, force: true }); }
if (!bad) console.log('chk ok');
process.exit(bad ? 1 : 0);
