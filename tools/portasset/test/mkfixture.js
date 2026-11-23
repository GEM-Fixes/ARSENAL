// portasset fixture: fixture/game (fake vanilla: loose + one pak), fixture/bad (one seeded defect per code, truth.md), fixture/clean (twin, 0 findings)
// put(tree, rel, lines): line = text | [text, CODE...] -> truth "rel:line: CODE" (bad tree only). Binary files via bin().
// Author: Imperator_Aug (ARSENAL, ia-85d3335b)
const fs = require('fs'), path = require('path');
const { zip } = require('../../lib/zipwrite');
const dir = path.join(__dirname, 'fixture');
fs.rmSync(dir, { recursive: true, force: true });
const truth = ['# file:line: CODE (seeded defects in fixture/bad; diffed by run.sh). line 0 = whole file, printed without :line'];
function put(tree, rel, lines) {
  const f = path.join(dir, tree, 'resource', rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const text = lines.map((l, i) => {
    if (Array.isArray(l)) { for (const c of l.slice(1)) truth.push(`resource/${rel}:${i + 1}: ${c}`); return l[0]; }
    return l;
  });
  fs.writeFileSync(f, text.join('\r\n') + '\r\n', 'latin1');   // game text = cp1251 + CRLF
}
function bin(tree, rel, buf, code) {
  const f = path.join(dir, tree, 'resource', rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, buf);
  if (code) truth.push(`resource/${rel}: ${code}`);
}
const both = (rel, lines) => { put('bad', rel, lines.map(l => Array.isArray(l) ? l[0] : l)); put('clean', rel, lines.map(l => Array.isArray(l) ? l[0] : l)); };
// DDS header: magic, size 124, fourcc at 84
function dds(cc) { const b = Buffer.alloc(160); b.write('DDS ', 0, 'latin1'); b.writeUInt32LE(124, 4); b.writeUInt32LE(4, 80); b.write(cc, 84, 'latin1'); return b; }
// fake mesh: magic, filler, then length-prefixed material names
function ply(...names) { const parts = [Buffer.from('EPLY', 'latin1'), Buffer.from([1, 2, 3, 0, 0, 0])]; for (const n of names) parts.push(Buffer.from([n.length]), Buffer.from(n, 'latin1'), Buffer.from([0, 0])); return Buffer.concat(parts); }

// ---- fake vanilla game ----
put('game', 'set/environment/multi/multi_01.set', ['{haze}']);
put('game', 'shader/a.fx', ['// a']);
put('game', 'shader/b.fx', ['// b']);
bin('game', 'texture/common/van/tex1.dds', dds('DXT5'));
const deadMtl = Buffer.from('{material bump\r\n\t{diffuse "nothing_here"}\r\n}\r\n', 'latin1');   // vanilla dead ref: unused file
fs.writeFileSync(path.join(dir, 'game', 'resource', 'gamelogic.pak'), zip([['texture/common/van/clash.dds', Buffer.concat([dds('DXT1'), Buffer.from('A')])], ['entity/van/dead.mtl', deadMtl]]));

// ---- mod: shared lines, defects in bad, fixes in clean ----
// PORT-114/152/160: mtl texture with a space in its name
put('bad', 'entity/u/a.mtl', ['{material bump', ['\t{diffuse "$/model/u/sherman m4a3e8"}', 'PORTA_TEXTURE_MISSING'], '\t{bump "/texture/common/van/tex1"}', '}']);
put('clean', 'entity/u/a.mtl', ['{material bump', '\t{diffuse "$/model/u/sherman m4a3e8"}', '\t{bump "/texture/common/van/tex1"}', '}']);
bin('clean', 'texture/common/model/u/sherman m4a3e8.dds', dds('DXT5'));
// PORT-115/119/120: mdl refs (nested mtl path, start.anm, polyhedron key case)
put('bad', 'entity/u/u.mdl', ['{Skeleton', '\t{bone "body"', ['\t\t{sequence "start" {file "start.anm"}}', 'PORTA_MODEL_REF_MISSING'], '\t\t{VolumeView "body.ply"}', ['\t\t{Polyhedron "Body.vol"}', 'PORTA_VOL_MISSING'], ['\t\t{material "mat/n.mtl"}', 'WARN_PORTA_MTL_PATH'], '\t}', '}']);
put('clean', 'entity/u/u.mdl', ['{Skeleton', '\t{bone "body"', '\t\t{sequence "start" {file "start.anm"}}', '\t\t{VolumeView "body.ply"}', '\t\t{Polyhedron "Body.vol"}', '\t\t{material "mat/n.mtl"}', '\t}', '}']);
both('entity/u/n.mtl', ['{material bump', '\t{diffuse "/texture/common/van/tex1"}', '}']);
put('clean', 'entity/u/mat/n.mtl', ['{material bump', '\t{diffuse "/texture/common/van/tex1"}', '}']);
bin('clean', 'entity/u/start.anm', Buffer.from('anm'));
bin('clean', 'entity/u/body.vol', Buffer.from('vol'));
bin('bad', 'entity/u/body.ply', ply('a.mtl'));
bin('clean', 'entity/u/body.ply', ply('a.mtl'));
bin('bad', 'entity/u/gun.ply', ply('a.mtl', 'gone.mtl'), 'PORTA_MODEL_REF_MISSING');
bin('clean', 'entity/u/gun.ply', ply('a.mtl'));
// PORT-139/142: ebm Frame (relative missing; rooted vanilla one resolves)
put('bad', 'texture/fx/s.ebm', ['{bitmap', '\t{Axis 1 1}', ['\t{Frame "s1.dds"}', 'PORTA_EBM_FRAME_MISSING'], '\t{Frame "/texture/common/van/tex1.dds"}', '}']);
put('clean', 'texture/fx/s.ebm', ['{bitmap', '\t{Axis 1 1}', '\t{Frame "s1.dds"}', '\t{Frame "/texture/common/van/tex1.dds"}', '}']);
bin('clean', 'texture/fx/s1.dds', dds('DXT1'));
// PORT-143: ATI2 normal map
bin('bad', 'texture/common/model/u/nm.dds', dds('ATI2'), 'PORTA_DDS_FORMAT');
bin('clean', 'texture/common/model/u/nm.dds', dds('DXT5'));
// PORT-172: stamp/bush Sprite mtl
put('bad', 'entity/flora/bush/bush.def', ['{game_entity', ['\t{Sprite "leaf.mtl"}', 'WARN_PORTA_SPRITE_MTL_MISSING'], '}']);
put('clean', 'entity/flora/bush/bush.def', ['{game_entity', '\t{Sprite "leaf.mtl"}', '}']);
put('clean', 'entity/flora/bush/leaf.mtl', ['{material simple', '\t{diffuse "/texture/common/van/tex1"}', '}']);
// PORT-144/161: texture at a vanilla key (in a pak) with other bytes; clean carries the byte-equal one (skipped)
bin('bad', 'texture/common/van/clash.dds', Buffer.concat([dds('DXT1'), Buffer.from('B')]), 'WARN_PORTA_TEXTURE_CLASH');
bin('clean', 'texture/common/van/clash.dds', Buffer.concat([dds('DXT1'), Buffer.from('A')]));
// vanilla dead ref copied byte-equal: skipped by default, reported with --all
bin('clean', 'entity/van/dead.mtl', deadMtl);
// PORT-167: map environment preset
put('bad', 'map/m1/m1.mi', ['{mission', ['\t{Environment "goh/multi/x/var1"}', 'PORTA_MAP_ENV_MISSING'], '\t{Environment "multi/multi_01"}', '}']);
put('clean', 'map/m1/m1.mi', ['{mission', '\t{Environment "goh/multi/x/var1"}', '\t{Environment "multi/multi_01"}', '}']);
put('clean', 'set/environment/goh/multi/x/var1.set', ['{haze}']);
// PORT-163: partial shader folder (clean ships the whole folder)
put('bad', 'shader/a.fx', ['// goh a']);
truth.push('resource/shader: WARN_PORTA_SHADER_PARTIAL');
put('clean', 'shader/a.fx', ['// goh a']);
put('clean', 'shader/b.fx', ['// b']);
// PORT-164/168: map land textures and .materials -> mtlN.mtl
put('bad', 'map/m1/.materials', ['{materials', '\t{"mtl0"', '\t\t{layer bump {diffuse "/texture/land/goh/grass"}}', '\t}', ['\t{"mtl1"', 'PORTA_MAP_MTL_MISSING'], '\t\t{layer bump {diffuse "/texture/land/goh/grass"}}', '\t}', '}']);
put('clean', 'map/m1/.materials', ['{materials', '\t{"mtl0"', '\t\t{layer bump {diffuse "/texture/land/goh/grass"}}', '\t}', '\t{"mtl1"', '\t\t{layer bump {diffuse "/texture/land/goh/grass"}}', '\t}', '}']);
put('bad', 'map/m1/mtl0.mtl', ['{material', '\t{layer bump', ['\t\t{diffuse "/texture/land/goh/grass"}', 'PORTA_LAND_TEXTURE_MISSING'], '\t}', '}']);
put('clean', 'map/m1/mtl0.mtl', ['{material', '\t{layer bump', '\t\t{diffuse "/texture/land/goh/grass"}', '\t}', '}']);
put('clean', 'map/m1/mtl1.mtl', ['{material', '\t{layer bump', '\t\t{diffuse "/texture/land/goh/grass"}', '\t}', '}']);
bin('clean', 'texture/land/goh/grass.dds', dds('DXT1'));
// a.mtl is named by body.ply in both trees
both('entity/u/a2.mtl', ['; {diffuse "commented_out"}', '{material bump', '\t{diffuse "/texture/common/van/tex1"}', '}']);

fs.writeFileSync(path.join(__dirname, 'truth.md'), truth.join('\n') + '\n');
