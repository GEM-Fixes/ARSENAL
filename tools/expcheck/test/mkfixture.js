// builds test/fixture/game: empty base + mod m1 (loose files). one defect per truth.md line; ok.mdl is the clean control (255 skin/anm bones, convex vol, mirror matrix = info only)
// Author: Imperator_Aug (ARSENAL, ia-a0c3417f)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, 'fixture', 'game');
fs.rmSync(path.join(__dirname, 'fixture'), { recursive: true, force: true });
const w = (rel, data) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof data === 'string' ? Buffer.from(data, 'latin1') : data); };
const m = (rel, data) => w('mods/m1/resource/' + rel, data);
w('resource/.keep', '');
w('mods/m1/mod.info', '{Mod\r\n {Name "m1"}\r\n {MinGameVersion "3.262"}\r\n {MaxGameVersion "3.262"}\r\n}\r\n');

const i32 = n => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; };
const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const f32 = a => { const b = Buffer.alloc(4 * a.length); a.forEach((x, i) => b.writeFloatLE(x, i * 4)); return b; };
const T = s => Buffer.from(s, 'latin1');
const cs = s => Buffer.concat([Buffer.from([s.length]), T(s)]);
const cat = (...a) => Buffer.concat(a);
const skinPly = n => cat(T('EPLY'), T('SKIN'), i32(n), ...Array.from({ length: n }, (_, i) => cs('b' + i)));
const anm = n => cat(T('EANM'), i32(0x60000), T('FRMS'), i32(1), T('BMAP'), i32(n), ...Array.from({ length: n }, (_, i) => { const s = 'b' + i; return cat(i32(s.length), T(s)); }));
const vol = (verts, idx) => cat(T('EVLM'), T('VERT'), i32(verts.length / 3), f32(verts), T('INDX'), i32(idx.length), ...idx.map(u16));

m('t/skin.ply', skinPly(256)); m('t/skin_ok.ply', skinPly(255));
m('t/big.anm', anm(256)); m('t/small.anm', anm(255));
m('t/nc.vol', vol([0, 0, 0, 2, 0, 0, 2, 2, 0, 0, 2, 0, 1, 1, -1, 1, 1, 1], [0, 1, 2, 0, 2, 3, 4, 0, 1]));
const cube = vol([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]);
m('t/cube.vol', cube);

m('t/bad.mdl', [
  '{Skeleton',                                                                 // 1
  ' {bone "basis"',                                                            // 2
  '  {VolumeView "skin.ply"}',                                                 // 3
  '  {bone "a"}',                                                              // 4
  '  {bone "A"}',                                                              // 5  dup bone
  '  {bone "lodb" {LODView {VolumeView "x.ply"}} {bone "kid" {VolumeView "x.ply"}}}', // 6  info only
  '  {animation {sequence "big"}}',                                            // 7
  ' }',                                                                        // 8
  '}',                                                                         // 9
  '{Volume "v1" {Polyhedron "nc.vol"} {Bone "a"}}',                            // 10 nc.vol not convex
  '{Volume "V1" {Box 1 1 1} {Bone "a"}}',                                      // 11 dup volume
  '{Volume "v3" {Polyhedron "cube.vol"} {Bone "a"} {Matrix34 1 0 0 1 0 0 0 0 1 0 0 0}}', // 12 not orthogonal
  ''].join('\r\n'));
m('t/ok.mdl', [
  '{Skeleton', ' {bone "basis"', '  {VolumeView "skin_ok.ply"}', '  {bone "a"}', '  {bone "b"}', '  {animation {sequence "small"}}', ' }', '}',
  '{Volume "v1" {Polyhedron "cube.vol"} {Bone "a"}}',
  '{Volume "v2" {Polyhedron "cube.vol"} {Bone "a"} {Matrix34 1 0 0 0 1 0 0 0 -1 0 0 0}}',
  ''].join('\r\n'));
