// fake GoH + AS2 trees for helmetport (loose files only; GoH loose resource/ is read like its paks). one seeded defect per set.
// Author: Imperator_Aug (ARSENAL, ia-ba8a2aa0)
'use strict';
const fs = require('fs'), path = require('path');
const W = path.join(__dirname, 'work');
fs.rmSync(W, { recursive: true, force: true });
const put = (rel, data) => { const f = path.join(W, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
const ply = n => Buffer.concat([Buffer.from('EPLY'), Buffer.from('MESH'), Buffer.from([0x12, 1, 0, 0]), Buffer.alloc(8), Buffer.from([0x04, 4, 0, 0]), Buffer.from([n.length]), Buffer.from(n)]);
const G = 'goh/resource/', A = 'as2/resource/';
// GoH sets
put(G + 'set/stuff/head/hv/helm_a', '{from "pattern heavy_headgear" {tag "armor"}{entity "helm_a"}{bogus_key 1}}\n');    // HEAVY + KEY_DROP
put(G + 'set/stuff/head/hv/helm_b', '{from "pattern heavy_headgear"\n\t{tag "armor"}\n\t{entity "helm_b"}\n}\n');         // mtl in neither folder
put(G + 'set/stuff/head/lt/cap_a', '{from "pattern light_headgear" {tag "armor"}{entity "cap_a"}}\n');                    // LIGHT_ARMOR + NO_ENTITY (no def)
put(G + 'set/stuff/head/mask_x', '{item {tag "smallitemin1hand"}{mass 0.5}}\n');                                          // NO_HEAD_TAG + NO_ENTITY + DUP_NAME
put(G + 'set/stuff/head/old/mask_x', '{item {tag "smallitemin1hand head"}{mass 0.5}}\n');
put(G + 'set/stuff/head/chain_b', '{from "helm_a" {entity "helm_a"}}\n');                                                  // FROM_CHAIN
put(G + 'set/stuff/head/bad_from', '{from "nothing_here" {entity "helm_a"}}\n');                                           // FROM_UNKNOWN
put(G + 'set/stuff/head/clash1', '{from "pattern heavy_headgear" {tag "armor"}{entity "helm_a"}}\n');                    // NAME_CLASH
put(G + 'set/stuff/head/macro_m', '{from "pattern heavy_headgear" {entity "helm_a"} ("somedef")}\n');                     // MACRO
put(G + 'set/stuff/body/armor_v', '{item {tag "smallitemin1hand armor"}{mass 12.0}{inventory {fsm "stuff"}{size 3 6}}{entity "armor_v"}}\n');  // BODY_OVERCOAT + NO_ENTITY
put(G + 'set/stuff/body/radio_p', '{item {tag "itemin1hand"}{entity "helm_a"}}\n');                                       // BODY_NOT_WORN
put(G + 'set/stuff/head/heavy_headgear.pattern', '{item {tag "smallitemin1hand head armor"}}\n');
put(G + 'set/breed/goh/sold.set', '{breed\n\t{armors {head mask_x}{body armor_v}}\n}\n');                                  // SLOT_MASK (mask_x has no head tag)
// GoH model: shared ply folder, mtl beside the mdl
put(G + 'entity/inv/head/helm_a/helm_a.def', '{actor (include "/properties/stuff_small.ext") {extender "stuff" {item "helm_a"}} {Extension "helm_a.mdl"}}\n');
put(G + 'entity/inv/head/helm_a/helm_a.mdl', '{Skeleton\n\t{bone "basis"\n\t\t{VolumeView "../src/helm.ply"}\n\t}\n}\n');
put(G + 'entity/inv/head/helm_a/helm.mtl', '{material "bump"\n\t{diffuse "$/_hum/helm"}\n}\n');
put(G + 'entity/inv/head/src/helm.ply', ply('helm.mtl'));
put(G + 'entity/inv/head/helm_b/helm_b.def', '{actor {extender "stuff" {item "helm_b"}} {Extension "helm_b.mdl"}}\n');
put(G + 'entity/inv/head/helm_b/helm_b.mdl', '{Skeleton {bone "basis" {VolumeView "../src/helmb.ply"}}}\n');
put(G + 'entity/inv/head/src/helmb.ply', ply('gone.mtl'));
put(G + 'texture/common/_hum/helm.dds', Buffer.from('DDS fake'));
put(G + 'properties/stuff_small.ext', '{extender "stuff"}\n');
// AS2
put(A + 'set/stuff/head/helmet.pattern', '{from "pattern headgear" {tag "armor"}{mass 0.8}}\n');
put(A + 'set/stuff/head/headgear.pattern', '{item {tag "smallitemin1hand head"}{mass 0.3}}\n');
put(A + 'set/stuff/body/overcoat.pattern', '{item {tag "smallitemin1hand body"}{mass 12.0}}\n');
put(A + 'set/stuff/head/other/clash1', '{from "helmet pattern" {entity "x"}}\n');
put(A + 'set/breed/mp/ger/rifle.set', '{breed\r\n\t{skin "ger"}\r\n\t(include "veterancy_generic.inc")\r\n\t{veterancy 1}\r\n\t{inventory {weapon "kar98k"}}\r\n}\r\n');
put(A + 'set/breed/mp/ger/veterancy_generic.inc', '');
put(A + 'set/breed/mp/ger/at.set', '{breed\r\n\t{skin "ger"}\r\n\t{armors {head helmet1_ger}}\r\n\t{veterancy 1}\r\n}\r\n');
put(G + 'set/breed/goh/hel.set', '{breed {armors {head helm_a}}}\n');
put(A + 'properties/stuff_small.ext', '{extender "stuff"}\n');
// fit/tone: reference plys with vertices (AS2 = GoH + 0.5 0 0.3), reference + item diffuse as solid DXT1 4x4 (AS2 grey 100, GoH 50 -> k 2)
const vply = (V, d = [0, 0, 0]) => { const b = Buffer.alloc(16 + V.length * 12); b.write('EPLYVERT', 0, 'latin1'); b.writeUInt32LE(V.length, 8); b.writeUInt16LE(12, 12); V.forEach((v, i) => v.forEach((x, k) => b.writeFloatLE(x + d[k], 16 + i * 12 + k * 4))); return b; };
const dome = [[-1, -1, 0], [1, 1, 0], [-1, 1, 2], [1, -0.5, 2.2], [0.2, 0, 3]];
const dxt1 = (g, gg = g, gb = g) => { const h = Buffer.alloc(128 + 8); h.write('DDS ', 0, 'latin1'); h.writeUInt32LE(124, 4); h.writeUInt32LE(0x81007, 8); h.writeUInt32LE(4, 12); h.writeUInt32LE(4, 16); h.writeUInt32LE(8, 20); h.writeUInt32LE(1, 28); h.writeUInt32LE(32, 76); h.writeUInt32LE(4, 80); h.write('DXT1', 84, 'latin1'); h.writeUInt32LE(0x1000, 108); const c = (g >> 3) << 11 | (gg >> 2) << 5 | gb >> 3; h.writeUInt16LE(c, 128); h.writeUInt16LE(c, 130); return h; };
put(G + 'entity/inventory/-gear_wearable/head/[germany]/ger_headwear_source/ger_stalhelm/ger_helm_m39.ply', vply(dome));
put(A + 'entity/inventory/-equipment/head/helmet1_ger/helmet.ply', vply(dome, [0.5, 0, 0.3]));
put(A + 'entity/inventory/-equipment/head/helmet1_ger/helmet m40.dds', dxt1(100));
put(G + 'texture/common/_hum/ger_headwear/heer/ger_helm_39.dds', dxt1(50, 50, 40));   // bluer AS2 ref: per-channel k ~2.02 2.1 2.41
// cap (light) shape: own ply (MESH + VERT) vs AS2 fieldcap1_ger/cap.ply = GoH cap * 1.1 + (0.2 0 0.1) -> scale 1.1, offset 0.2 0 0.1;
// cap tone refs equal grey 60 -> k 1 (the cap must not take the helmet k)
const cap = [[-1, -1, 2], [1, 1, 2], [-1, 1, 3], [1, -1, 3], [0.5, 0, 4]];
put(A + 'entity/inventory/-equipment/head/fieldcap1_ger/cap.ply', vply(cap.map(v => v.map(x => x * 1.1)), [0.2, 0, 0.1]));
put(A + 'entity/inventory/-equipment/head/fieldcap1_ger/fieldcap_ger.dds', dxt1(60));
put(G + 'texture/common/_hum/ger_headwear/heer/ger_cap_fieldcap_43.dds', dxt1(60));
put(G + 'set/stuff/head/lt/cap_c', '{from "pattern light_headgear" {entity "cap_c"}}\n');
put(G + 'entity/inv/head/cap_c/cap_c.def', '{actor {extender "stuff" {item "cap_c"}} {Extension "cap_c.mdl"}}\n');
put(G + 'entity/inv/head/cap_c/cap_c.mdl', '{Skeleton\n\t{bone "basis"\n\t\t{bone "cw"\n\t\t\t{VolumeView "capc.ply"}\n\t\t}\n\t}\n}\n');
put(G + 'entity/inv/head/cap_c/capc.ply', Buffer.concat([ply('capc.mtl'), vply(cap).subarray(4)]));
put(G + 'entity/inv/head/cap_c/capc.mtl', '{material "bump"\n\t{diffuse "$/_hum/capc"}\n\t{specular "$/_hum/null_sp"}\n\t{color "230 230 230 25"}\n}\n');
put(G + 'texture/common/_hum/null_sp.dds', dxt1(0));
// --cap-spec ref: vanilla fieldcap1_ger base.mtl spec (relative name -> absolute ref) + power 76 (run 9); no --game -> default + WARN (run 10)
put(A + 'entity/inventory/-equipment/head/fieldcap1_ger/base.mtl', '{material bump\n\t{diffuse "fieldcap_ger"}\n\t{specular "fieldcap_ger_sp"}\n\t{color "229 229 229 76"}\n}\n');
put(A + 'entity/inventory/-equipment/head/fieldcap1_ger/fieldcap_ger_sp.dds', dxt1(8));
put(G + 'texture/common/_hum/capc.dds', dxt1(50));
put(G + 'set/stuff/head/hv/helm_c', '{from "pattern heavy_headgear" {tag "armor"}{entity "helm_c"}}\n');                 // fit on a child bone + tone
put(G + 'entity/inv/head/helm_c/helm_c.def', '{actor {extender "stuff" {item "helm_c"}} {Extension "helm_c.mdl"}}\n');
put(G + 'entity/inv/head/helm_c/helm_c.mdl', '{Skeleton\n\t{bone "basis"\n\t\t{orientation\n\t\t\t1 0 0\n\t\t\t0 -1 0\n\t\t\t0 0 1\n\t\t}\n\t\t{bone "hw"\n\t\t\t{VolumeView "helmc.ply"}\n\t\t}\n\t}\n}\n');
put(G + 'entity/inv/head/helm_c/helmc.ply', ply('helmc.mtl'));
put(G + 'entity/inv/head/helm_c/helmc.mtl', '{material "bump"\n\t{diffuse "$/_hum/helmc"}\n}\n');
put(G + 'texture/common/_hum/helmc.dds', dxt1(50));
