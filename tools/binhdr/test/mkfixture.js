// builds test/fixture/game: empty base + mod m1 (loose files; one defect per file, plus clean controls) and a base-layer soft case. see truth.md
// Author: Imperator_Aug (ARSENAL, ia-f66b5a43)
const fs = require('fs'), path = require('path');
const root = path.join(process.env.TEST_WORK || __dirname, 'fixture', 'game');
fs.rmSync(path.join(process.env.TEST_WORK || __dirname, 'fixture'), { recursive: true, force: true });
const w = (rel, data) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof data === 'string' ? Buffer.from(data, 'latin1') : data); };
const m = (rel, data) => w('mods/m1/resource/' + rel, data);
w('mods/m1/mod.info', '{Mod\r\n {Name "m1"}\r\n {MinGameVersion "3.262"}\r\n {MaxGameVersion "3.262"}\r\n}\r\n');

const i32 = n => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; };
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const f32 = a => { const b = Buffer.alloc(4 * a.length); a.forEach((x, i) => b.writeFloatLE(x, i * 4)); return b; };
const u8 = (...a) => Buffer.from(a);
const T = s => Buffer.from(s, 'latin1');
const cs = s => Buffer.concat([u8(s.length), T(s)]);
const cat = (...a) => Buffer.concat(a);

// ---- ply
const bnds = cat(T('BNDS'), f32([-1, -1, -1, 1, 1, 1]));
const mesh = (flags, mtl, extra = Buffer.alloc(0), fvf = 0x112, faces = 1) => cat(T('MESH'), u32(fvf), i32(0), i32(faces), u32(flags), cs(mtl), extra);
const verts = (n, stride = 32) => cat(T('VERT'), i32(n), u16(stride), u16(7), Buffer.alloc(n * stride));
const indx = idx => cat(T('INDX'), i32(idx.length), cat(...idx.map(u16)));
const ply = (...chunks) => cat(T('EPLY'), ...chunks);
m('a/good.mtl', '{material simple {diffuse "x"}}');
m('map/good.mtl', '{material simple {diffuse "x"}}');
m('a/good.ply', ply(bnds, mesh(0x404, 'good.mtl'), verts(3), indx([0, 1, 2])));
m('a/ply_bad_magic.ply', cat(T('XPLY'), bnds));
m('a/ply_bad_chunk.ply', ply(bnds, mesh(0x404, 'good.mtl'), T('ZZZZ'), verts(3), indx([0, 1, 2])));
m('a/ply_truncated.ply', ply(bnds, mesh(0x404, 'good.mtl'), cat(T('VERT'), i32(1000), u16(32), u16(7), Buffer.alloc(64))));
m('a/ply_vert_limit.ply', ply(bnds, mesh(0x404, 'good.mtl'), verts(65536), indx([0, 1, 2])));
m('a/ply_bonemap.ply', ply(bnds, cat(T('SKIN'), i32(3), cs('a'), cs('b'), cs('c')),
  mesh(0x814 | 0x400 & 0x400, 'good.mtl', cat(u8(26), Buffer.alloc(26, 1))), verts(3, 40), indx([0, 1, 2])));
m('a/ply_mtl_missing.ply', ply(bnds, mesh(0x404, 'nope.mtl'), verts(3), indx([0, 1, 2])));
// folder-relative lookup: sib.mtl exists only in a sibling folder (map/), so a/ply_mtl_sibling.ply is still missing (pair-fit TF-4)
m('map/sib.mtl', '{material simple {diffuse "x"}}');
m('a/ply_mtl_sibling.ply', ply(bnds, mesh(0x404, 'sib.mtl'), verts(3), indx([0, 1, 2])));
// FMT-16: inline layered material (empty material string): 2 layers (simple 1 tex; bump 3 tex + 4B color + f32)
m('a/inl_ok.tga', 'tga');
m('a/inl_ok_nm.tga', 'tga');
const inl = (t2) => cat(i32(2), cs('simple'), u8(1), cs('diffuse'), cs('inl_ok'), cs('bump'), u8(3), cs('diffuse'), cs('inl_ok'), cs('normal'), t2, cs('specular'), cs(''), u32(0), f32([0.5]));
m('a/inl_ok.ply', ply(bnds, mesh(0x404, '', inl(cs('inl_ok_nm'))), verts(3), indx([0, 1, 2])));
m('a/inl_missing.ply', ply(bnds, mesh(0x404, '', inl(cs('inl_gone'))), verts(3), indx([0, 1, 2])));
m('a/ply_stride.ply', ply(bnds, mesh(0x404, 'good.mtl'), verts(3, 16), indx([0, 1, 2])));
m('a/ply_index_range.ply', ply(bnds, mesh(0x404, 'good.mtl'), verts(3), indx([0, 1, 9])));
m('a/ply_part_range.ply', ply(bnds, mesh(0x404, 'good.mtl', Buffer.alloc(0), 0x112, 5), verts(3), indx([0, 1, 2])));
// BPLY: SUBM decl pos f3 / normal f3 / texcoord f2 x N
const decl = n => cat(u8(0x02, 0, 0, 0x12, 0, 0), ...Array.from({ length: n }, (_, k) => u8(0x31, k, 0)), u8(0xff, 0xff));
const subm = n => cat(T('SUBM'), decl(n), i32(0), i32(1), i32(0), i32(3), u32(0x404), cs('good.mtl'));
const bas2 = (u, v) => cat(T('BAS2'), f32([0, 0, u, 0, 0, v, 0, 0, 1, 0, 0, 1]));
const bply = (n, basis) => cat(T('BPLY'), bnds, subm(n), basis, cat(T('VERT'), i32(3), i32(32), Buffer.alloc(96)), cat(T('IND4'), i32(3), u32(0), u32(1), u32(2)));
m('map/big_good.ply', bply(1, bas2(2, 2)));
m('map/big_uv2.ply', bply(2, bas2(2, 2)));
m('map/big_basis.ply', bply(1, bas2(10, 2)));

// ---- anm
const anm = ({ ver = 0x60000, frames = 2, bones = ['a', 'b'], body } = {}) => cat(T('EANM'), i32(ver), T('FRMS'), i32(frames), T('BMAP'), i32(bones.length), ...bones.map(b => cat(i32(b.length), T(b))),
  body === undefined ? cat(T('FRM2'), u16(0), u8(1), u8(0), u16(3), f32([0, 0, 0, 0, 0, 0])) : body);
m('anim/good.anm', anm());
m('anim/anm_version.anm', anm({ ver: 0x20000 }));
m('anim/anm_bone_limit.anm', anm({ bones: Array.from({ length: 256 }, (_, i) => 'b' + i), body: cat(T('FRM2'), u16(0), u8(0)) }));
m('anim/anm_no_frames.anm', anm({ body: Buffer.alloc(0) }));
m('anim/anm_bad_chunk.anm', anm({ body: cat(T('FRMX'), u16(0)) }));
m('anim/anm_bone_index.anm', anm({ body: cat(T('FRM2'), u16(0), u8(1), u8(7), u16(0)) }));
m('anim/anm_frame_index.anm', anm({ body: cat(T('FRM2'), u16(9), u8(0)) }));
m('anim/anm_truncated.anm', anm({ body: cat(T('FRM2'), u16(0), u8(1), u8(0), u16(3), f32([0, 0])) }));

// ---- vol
const vol = (...ch) => cat(T('EVLM'), ...ch);
const vv = cat(T('VERT'), i32(3), f32([0, 0, 0, 1, 0, 0, 0, 1, 0])), vi = cat(T('INDX'), i32(3), u16(0), u16(1), u16(2)), vs = cat(T('SIDE'), i32(1), u8(1));
m('vol/good.vol', vol(vv, vi, vs));
m('vol/vol_no_side.vol', vol(vv, vi));
m('vol/vol_bad_chunk.vol', vol(vv, vi, T('ZZZZ'), vs));
m('vol/vol_order.vol', vol(vi, vv, vs));
m('vol/vol_side_count.vol', vol(vv, vi, cat(T('SIDE'), i32(0))));

// ---- dds
const dds = ({ cc = 'DXT1', w = 64, h = 64, mips = 1, flags = 0x1007, pff = 4, bits = 0, caps2 = 0, masks = [0, 0, 0, 0] } = {}) => {
  const b = Buffer.alloc(128 + 64);
  b.write('DDS ', 0, 'latin1'); b.writeUInt32LE(124, 4); b.writeUInt32LE(flags, 8); b.writeUInt32LE(h, 12); b.writeUInt32LE(w, 16); b.writeUInt32LE(mips, 28);
  b.writeUInt32LE(32, 76); b.writeUInt32LE(pff, 80); b.write(cc, 84, 'latin1'); b.writeUInt32LE(bits, 88);
  masks.forEach((x, i) => b.writeUInt32LE(x, 92 + i * 4)); b.writeUInt32LE(caps2, 112);
  return b;
};
m('tex/good.dds', dds());
m('tex/good32.dds', dds({ pff: 0x41, bits: 32, masks: [0xff0000, 0xff00, 0xff, 0xff000000], cc: '' }));
m('tex/dds_dx10.dds', dds({ cc: 'DX10' }));
m('tex/dds_volume.dds', dds({ flags: 0x80100f }));
m('tex/dds_format.dds', dds({ cc: 'ATI2' }));
m('tex/dds_cube.dds', dds({ caps2: 0x200 | 0x400 }));
m('tex/dds_mips.dds', dds({ mips: 16 }));
m('tex/dds_size.dds', dds({ w: 9000 }));
m('tex/dds_short.dds', Buffer.alloc(100));
m('tex/shadow.dds', dds());
m('tex/shadow.tga', Buffer.alloc(32));
m('tex/ok.ebm', '{bitmap\r\n {Axis 0 0}\r\n}\r\n');
m('tex/ok_ref.ebm', '{reference "ok"}\r\n');
m('tex/ebm_notsdl.ebm', 'hello');
m('tex/ebm_sig.ebm', '{bimap}\r\n');
m('tex/ebm_mip.ebm', '{bitmap\r\n {Mipmap 3}\r\n}\r\n');

// ---- map.net: cell u8, ver u8, w i16, h i16, f32 f32, cells (v1: 4B)
const net = (w, h, cells, cell = 10) => cat(u8(cell, 1), Buffer.from([w & 255, w >> 8, h & 255, h >> 8]), f32([0, 0]), Buffer.alloc(cells * 4));
m('map/good/map.net', net(3, 2, 6));
m('map/net_size/map.net', net(3, 2, 5));
m('map/net_cell5/map.net', net(3, 2, 6, 5)); // GoH cell 5: NET_CELL (PORT-70)
m('map/net_neg/map.net', cat(u8(10, 1), Buffer.from([0, 0x80, 2, 0]), f32([0, 0]), Buffer.alloc(8)));

// ---- wav / mp3
const wav = cat(T('RIFF'), i32(4 + 24 + 8 + 4), T('WAVE'), T('fmt '), i32(16), Buffer.alloc(16), T('data'), i32(4), Buffer.alloc(4));
m('sound/s1/good.wav', wav);
m('sound/s1/wav_bad.wav', T('not a wave file at all'));
m('sound/s1/music.mp3', Buffer.alloc(8));

// ---- mdl / def
const mdl = (bones, extra = '') => `{Skeleton\r\n${bones}}\r\n${extra}`;
m('ent/good/good.mdl', mdl(' {bone "basis"\r\n  {bone revolute "gun"\r\n   {limits -5 20}\r\n   {speed 30}\r\n  }\r\n  {bone socket "mg"\r\n   {limits 1 2}\r\n  }\r\n }\r\n', ' {Volume "body"\r\n  {Box 1 1 1}\r\n  {Bone "basis"}\r\n }\r\n'));
m('ent/good/good.def', '{game_entity\r\n {Extension "good.mdl"}\r\n {Volume "body"\r\n  {Thickness 5}\r\n }\r\n}\r\n');
m('ent/badbone/mdl_param.mdl', mdl(' {bone "basis"\r\n  {bone "plain"\r\n   {limits -5 20}\r\n  }\r\n  {bone "plain2"\r\n   {speed 3}\r\n  }\r\n }\r\n'));
m('ent/badbone/mdl_zero.mdl', mdl(' {bone "basis"\r\n  {bone revolute "r"\r\n   {speed 0}\r\n  }\r\n }\r\n'));
m('ent/badbone/mdl_type.mdl', mdl(' {bone "basis"\r\n  {bone hinge "r"\r\n  }\r\n }\r\n'));
m('ent/vol/vol.mdl', mdl(' {bone "basis"\r\n }\r\n', ' {Volume "body"\r\n  {Box 1 1 1}\r\n  {Bone "ghost"}\r\n }\r\n {Volume "ok"\r\n  {Box 1 1 1}\r\n  {Bone "basis"}\r\n }\r\n'));
m('ent/vol/vol.def', '{game_entity\r\n {Extension "vol.mdl"}\r\n {Volume "ok"\r\n  {Thickness 5}\r\n }\r\n {Volume "noshape"\r\n  {Thickness 5}\r\n }\r\n}\r\n');
// FMT-03 reachability: def -> mdl -> ply (relative paths) reaches a mtl-less mesh = ERROR; ply_mtl_missing.ply above is unreached = info
m('ent/reach/reach_missing.ply', ply(bnds, mesh(0x404, 'nope.mtl'), verts(3), indx([0, 1, 2])));
m('ent/reach/reach.mdl', mdl(' {bone "basis"\r\n  {VolumeView "reach_missing.ply"}\r\n }\r\n'));
m('ent/reach/reach.def', '{game_entity\r\n {Extension "reach.mdl"}\r\n}\r\n');
m('ent/seq/seq.mdl', mdl(' {bone "basis"\r\n  {animation\r\n   {sequence "walk"}\r\n   {sequence "none"}\r\n  }\r\n }\r\n'));
m('ent/seq/walk.anm', anm({ bones: ['x', 'y'] }));
m('ent/seq/none.anm', anm({ bones: ['basis', 'y'] }));

// ---- base layer: tolerated defects are info only (vanilla bar)
w('resource/vanilla/tolerated.dds', dds({ cc: 'ATI2' }));
w('resource/vanilla/tolerated2.dds', dds());
w('resource/vanilla/tolerated2.tga', Buffer.alloc(32));
