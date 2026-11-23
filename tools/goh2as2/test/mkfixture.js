// builds test/fixture/goh: fake GoH tree (loose + pak rooted at resource/entity). seeded defects listed in truth.md
// Author: Imperator_Aug (ARSENAL, ia-757f3cf0)
const fs = require('fs'), path = require('path');
const { writeZip } = require('../../lib/zipwrite');
const root = path.join(__dirname, 'fixture');
fs.rmSync(root, { recursive: true, force: true });
const put = (rel, txt) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, txt); };
const crlf = s => s.replace(/\n/g, '\r\n');
fs.mkdirSync(path.join(root, 'goh/resource/entity'), { recursive: true });
writeZip(path.join(root, 'goh/resource/entity/veh.pak'), [
  ['veh/tank.def', Buffer.from(crlf(`{game_entity "tank"
  {perks {component {health {hp 100} {hp_broken 50}}}}
  {armor_damage_modifier 2}
  {armor {setting {thickness 5} {threshold {pierce {koef 1.2}} {blast {koef 1}}}}}
  {locomotion {turnradius (* 2 3)} {starttime (/ 1 0)} {braketime (+ 1 (* 2 0.5))}}
  {mdl "tank.mdl"}
  {extension "/properties/stuff_weapon.ext"}
  {mat "tank.mtl"}
  {include "skip.materials"}
  {##place "a" {x 1}}
  {comment "Привет €"}
}
`))],
  ['veh/tank.ext', Buffer.from(crlf(`{entity "tank"
  {volume "v1"
    {thickness {top 5} {front 3}}
    {caststeel 1}
    {material "steel"}
    {able {nolook} {hole} {keep}}
    {contact}
  }
  {volume "v2" {material "fabric"} {able {nolook} {blockcamera}}}
}
`))],
  ['veh/tank.mdl', Buffer.from(crlf(`{model "tank"
  {sequence "run" {file "a.anm"} {events {#1 {sound "x"}}}}
  {sequence "fire" {speed 4}}
  {sequence "gone"}
}
`))],
  ['veh/tank.mtl', Buffer.from(crlf(`{material bump
  {diffuse "x"}
  {bump "$/_w/tank_bp"}
  {lightmap "l"}
  {glow 1}
}
`))],
  // seeded: a MESH chunk naming hullx.mtl (no def/mdl names it); hullx.mtl names texture hullx_d (no ext). check.js wants both pulled
  ['veh/tank.ply', Buffer.concat([Buffer.from('EPLY'), Buffer.from('MESH'), Buffer.from([0x12, 1, 0, 0]), Buffer.alloc(8), Buffer.from([0x04, 4, 0, 0]), Buffer.from([9]), Buffer.from('hullx.mtl')])],
  ['veh/hullx.mtl', Buffer.from(crlf(`{material
  {diffuse "hullx_d"}
}
`))],
  ['veh/hullx_d.dds', Buffer.from('DDS ')],
  ['veh/a.anm', Buffer.from('ANM\0')],
  ['veh/fire.anm', Buffer.from('ANM\0')],
  ['veh/skip.materials', Buffer.from('{materials}')],
]);
put('goh/resource/texture/common/_w/tank_bp.dds', 'DDS ');
put('goh/resource/properties/stuff_weapon.ext', crlf('{x}\n'));
put('goh/resource/set/stuff/w.weapon', crlf(`{from "x"
  {calibre 7}
  {overmatchslope 1}
  {parameters {rechargetime 2}}
  {spreading {radiustable 1}}
}
`));
put('goh/resource/set/stuff/m.mine', crlf(`{from "pattern ap"
  {entity "mine_x"}
  {inventory {size 1 2}}
  {mass 4.5}
  {damage blastwave {energy 1.0} {area 0.6 2} {ground_interaction_radius 0.1}}
}
`));
// ENCFIX: GoH bytes pass through; a cp1251 string (not UTF-8) and a non-ASCII identifier are flagged
put('goh/resource/set/enc_bad.set', Buffer.concat([Buffer.from('{text "'), Buffer.from([0xCF, 0xF0, 0xE8]), Buffer.from('"}\r\n{'), Buffer.from('ключ', 'utf8'), Buffer.from(' 1}\r\n{ok "«ёлка» №5"} ; коммент\r\n', 'utf8')]));
put('goh/resource/set/stuff/a.ammo', crlf(`{bullet "b"
  {possibledamageradius 3}
  {cumulative 1}
  {trace {view {scalex 2} {scaley 1}}}
  ; ✓ mark
}
`));
put('goh/resource/set/dynamic_campaign/x.set', crlf('{dc 1}\n'));
put('goh/resource/entity/z.html', '<html></html>');
put('goh/resource/set/interaction_entity.set', crlf(`{interaction "i"
  {play_sound "s"}
  {weapon_work 1}
  {tear {spawn 1}}
  {call_synced "x"}
}
`));
put('goh/resource/set/interaction_entity/h.inc', crlf(`{call_synced "y"}
{add_view 1}
`));
put('goh/resource/set/vision.set', crlf(`{vision
  {rules {human {firing {firing_rifle 1} {still 2}}} {vehicle_01 3}}
}
`));
put('goh/resource/mission/m.mi', crlf(`{mission
  {waypoints {w1 {commands {c1 {action {kind go}}}}}}
  {tag_add "t1"}
}
`));
// same GoH-only key outside .ammo: a .pattern and an .inc holding it at its root (found on as64: fatal unexpected token at boot)
put('goh/resource/set/stuff/p.pattern', crlf(`{from "x"
  {damage blastwave {energy 1.0} {area 0.6 2} {ground_interaction_radius 0.1}}
}
`));
put('goh/resource/set/stuff/blast.inc', crlf(`{energy 1.0}
{ground_interaction_radius 0.5}
`));
put('goh/resource/set/inc_out.inc', crlf(`(define "m"
  {recoil {shoot 1}}
  {spreading {radiustable 1}}
)
`));
put('goh/resource/set/stuff/u.weapon', crlf(`(include "\\set\\inc_out.inc")
{from "x"
  ("m")
}
`));
put('goh/resource/set/not_stuff.inc', crlf(`{recoil {shoot 1}}
`));
put('goh/resource/set/stuff/noext', crlf(`{from "x"
  {firingtimeout 1}
}
`));
// PORT-53, PORT-54
put('goh/resource/properties/flora.inc', crlf(`{props "tree"}
{TPC_ZClip 1}
{lodclass "decor"}
(define "durability"
  {perks
    {component "body" {health {hp 1}}}
  }
)
{Weaponry {ManualAccuracy 1} {ManualAccuracyZoom 1.25}}
`));
put('goh/resource/entity/fx/spark.def', crlf(`{fx
  {+ spriteview point
    {spinx 1}
    {layer debug}
    {scale 1 {linear {min 1}} {peak {min 2}}}
  }
  {#+ spriteview off}
}
`));
put('goh/resource/set/hash_#1.inc', crlf('{x 1}\n'));
put('keys.txt', 'set/hash_#1.inc   # a # in a name is not a comment\nproperties/flora.inc\nentity/fx/spark.def\nset/stuff/noext\nset/inc_out.inc\nset/not_stuff.inc\nset/stuff/u.weapon\nset/stuff/p.pattern\nset/stuff/blast.inc\nset/stuff/w.weapon\nset/stuff/m.mine\nset/stuff/a.ammo\nset/dynamic_campaign/x.set\nentity/z.html\nset/interaction_entity.set\nset/interaction_entity/h.inc\nset/vision.set\nmission/m.mi\nset/nothere.set\nset/enc_bad.set\n');
// quoted reference whose name starts with a digit and differs from the def's stem: the closure must follow it (found on as64: File not found at preload)
put('goh/resource/entity/dg/digitref.def', crlf(`{game_entity "digitref"
  {extension "105mm_gun.mdl"}
}
`));
put('goh/resource/entity/dg/105mm_gun.mdl', crlf(`{model
  {file "7_barrel.ply"}
}
`));
put('goh/resource/entity/dg/7_barrel.ply', 'EPLY');
// --game case (PORT_PROPS_COPIED): shared props absent from the fake AS2 are copied with their includes, present ones are not
put('goh/resource/entity/pc/pcopy.def', crlf(`{game_entity "pcopy"
  {extension "/properties/new_a.ext"}
  {extension "/properties/have.inc"}
  {extension "/properties/bad.inc"}
}
`));
put('goh/resource/properties/new_a.ext', crlf('{entity\n  {include "/properties/new_b.inc"}\n  {include "/properties/have.inc"}\n  {volume "v" {caststeel 1}}\n  {sensor {Visor "a" {vision "tank_range_200"}} {Visor "b" {vision "human"}}}\n}\n'));
put('goh/resource/properties/new_b.inc', crlf('{x 1}\n'));
put('goh/resource/properties/have.inc', crlf('{goh version}\n{include "have2.inc"}\n'));
put('goh/resource/properties/have2.inc', crlf('{include "have.inc"}\n{include "new_b.inc"}\n'));
put('goh/resource/properties/bad.inc', crlf('{y {NoVisibilityPatch 1}}\n'));
put('as2/resource/properties/have.inc', crlf('{as2 version}\n'));
put('as2/resource/properties/have2.inc', crlf('{as2 version}\n'));
put('as2/resource/properties/bad.inc', crlf('{as2 version}\n'));
// --base case (B8-T): the mod tree (goh2) holds only the unit def + mdl; start.anm, body.ply (nested mat/deep.mtl), a cross-folder anm and a second unit live in the base tree
put('goh2/resource/entity/bs/bsunit.def', crlf(`{game_entity "bsunit"
  {mdl "bsunit.mdl"}
}
`));
put('goh2/resource/entity/bs/bsunit.mdl', crlf(`{model "bsunit"
  {file "body.ply"}
  {sequence "start"}
  {sequence "ext" {file "../basefold/ext.anm"}}
  {sequence "nope" {file "nope.anm"}}
  {volume "v1" {polyhedron "v1.vol"}}
  {Volume "v2" {Polyhedron "v2.vol"}}
  {madeupkey "gone.vol"}
  {collider "tank.heavy"}
}
`));
put('base/resource/entity/bs/v1.vol', 'VOL\0');
put('base/resource/entity/bs/start.anm', 'ANM\0');
put('base/resource/entity/basefold/ext.anm', 'ANM\0');
put('base/resource/entity/bs/mat/deep.mtl', crlf('{material\n  {diffuse "$/bs/skin"}\n}\n'));
put('base/resource/texture/common/bs/skin.dds', 'DDS ');
const plyOf = n => Buffer.concat([Buffer.from('EPLY'), Buffer.from('MESH'), Buffer.from([0x12, 1, 0, 0]), Buffer.alloc(8), Buffer.from([0x04, 4, 0, 0]), Buffer.from([n.length]), Buffer.from(n)]);
fs.writeFileSync(path.join(root, 'base/resource/entity/bs/body.ply'), plyOf('mat/deep.mtl'));
put('base/resource/entity/bs/other.def', crlf('{game_entity "other"\n  {mdl "other.mdl"}\n}\n'));
fs.writeFileSync(path.join(root, 'base/resource/entity/bs/other.ply'), plyOf('other.mtl'));
put('base/resource/entity/bs/other.mtl', crlf('{material}\n'));
