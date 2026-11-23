// Author: Imperator_Aug (ARSENAL, ia-0953383a)
'use strict';
// assetsame test: seeded fixtures built in code, no game data.
const path = require('path');
const A = require('./assetsame');
const { normalKind } = require('./compare');
let fails = 0, n = 0;
const ck = (c, m) => { n++; if (!c) { fails++; console.log('FAIL', m); } };
let seed = 20261107;
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// ---- DDS builders
function ddsHdr(w, h, mips, pfFlags, cc, bits, masks, caps2) {
  const b = Buffer.alloc(128);
  b.writeUInt32LE(0x20534444, 0); b.writeUInt32LE(124, 4); b.writeUInt32LE(0x1007, 8); b.writeUInt32LE(h, 12); b.writeUInt32LE(w, 16); b.writeUInt32LE(mips, 28);
  b.writeUInt32LE(32, 76); b.writeUInt32LE(pfFlags, 80); if (cc) b.write(cc, 84, 'latin1'); b.writeUInt32LE(bits || 0, 88);
  (masks || []).forEach((m, i) => b.writeUInt32LE(m >>> 0, 92 + i * 4)); b.writeUInt32LE(caps2 || 0, 112);
  return b;
}
const p565 = (r, g, b) => ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
function dxt1Solid(w, h, r, g, b) {
  const blocks = Math.ceil(w / 4) * Math.ceil(h / 4), d = Buffer.alloc(blocks * 8);
  for (let i = 0; i < blocks; i++) { d.writeUInt16LE(p565(r, g, b), i * 8); d.writeUInt16LE(p565(r, g, b), i * 8 + 2); }
  return Buffer.concat([ddsHdr(w, h, 1, 4, 'DXT1'), d]);
}
function dxt5Solid(w, h, r, g, b, a) {
  const blocks = Math.ceil(w / 4) * Math.ceil(h / 4), d = Buffer.alloc(blocks * 16);
  for (let i = 0; i < blocks; i++) { d[i * 16] = a; d[i * 16 + 1] = a; d.writeUInt16LE(p565(r, g, b), i * 16 + 8); d.writeUInt16LE(p565(r, g, b), i * 16 + 10); }
  return Buffer.concat([ddsHdr(w, h, 1, 4, 'DXT5'), d]);
}
const ati2 = (w, h) => Buffer.concat([ddsHdr(w, h, 3, 4, 'ATI2'), Buffer.alloc(Math.ceil(w / 4) * Math.ceil(h / 4) * 16)]);
const raw32 = (w, h, bgra) => { const d = Buffer.alloc(w * h * 4); for (let i = 0; i < w * h; i++) bgra.forEach((v, k) => d[i * 4 + k] = v); return Buffer.concat([ddsHdr(w, h, 1, 0x41, null, 32, [0xff0000, 0xff00, 0xff, 0xff000000]), d]); };

// ---- headers
let h = A.ddsHeader(dxt1Solid(8, 4, 255, 0, 0));
ck(h.fmt === 'DXT1' && h.w === 8 && h.h === 4 && h.mips === 1, 'dxt1 header');
h = A.ddsHeader(dxt5Solid(16, 16, 0, 128, 255, 128));
ck(h.fmt === 'DXT5' && h.alpha === true && h.channels === 'rgba', 'dxt5 header alpha');
h = A.ddsHeader(ati2(64, 32));
ck(h.fmt === 'ATI2' && h.mips === 3 && h.channels === 'rg', 'ati2 header');
h = A.ddsHeader(raw32(2, 2, [1, 2, 3, 4]));
ck(h.fmt === 'RAW32A-rgb' && h.alpha === true, 'raw32 header ' + h.fmt);
ck(A.ddsHeader(Buffer.alloc(200)).error === 'not dds', 'not dds');

// ---- decode
let img = A.decodeDds(dxt1Solid(8, 4, 255, 0, 0));
ck(img && img.w === 8 && img.rgba[0] === 255 && img.rgba[1] === 0 && img.rgba[3] === 255, 'dxt1 decode red');
img = A.decodeDds(dxt5Solid(4, 4, 0, 128, 255, 128));
ck(img && img.rgba[0] === 0 && Math.abs(img.rgba[1] - 130) < 3 && img.rgba[2] === 255 && img.rgba[3] === 128, 'dxt5 decode ' + (img && [...img.rgba.slice(0, 4)]));
img = A.decodeDds(raw32(2, 2, [10, 20, 30, 40]));   // B G R A bytes
ck(img && img.rgba[0] === 30 && img.rgba[1] === 20 && img.rgba[2] === 10 && img.rgba[3] === 40, 'raw32 decode order');
ck(A.decodeDds(ati2(8, 8)).rgba[2] === 0, 'ati2 decode: b is empty (z not stored)');
ck(normalKind(A.decodeDds(ati2(8, 8)), 'ATI2').startsWith('rg-two-channel'), 'ati2 normal kind');
ck(/^rgb-xyz/.test(normalKind({ w: 2, h: 2, rgba: Buffer.from([128, 128, 255, 255].concat([128, 128, 255, 255], [128, 128, 255, 255], [128, 128, 255, 255])) }, 'DXT1')), 'rgb xyz normal kind');
ck(/^other/.test(normalKind(A.decodeDds(dxt5Solid(4, 4, 0, 128, 248, 128)), 'DXT5')) , 'dxt5 R=0 swizzle is not plain xyz');

// ---- tga
function tga(w, h, type, bpp, px, rle) {
  const hd = Buffer.alloc(18); hd[2] = type; hd.writeUInt16LE(w, 12); hd.writeUInt16LE(h, 14); hd[16] = bpp; hd[17] = 0x20 | (bpp === 32 ? 8 : 0);
  const bp = bpp / 8; let body;
  if (!rle) body = Buffer.concat(px.map(p => Buffer.from(p)));
  else body = Buffer.concat([Buffer.from([0x80 | (w * h - 1)]), Buffer.from(px[0])]);   // one RLE run
  return Buffer.concat([hd, body]);
}
const t2 = tga(2, 1, 2, 32, [[1, 2, 3, 255], [4, 5, 6, 128]], false);
h = A.tgaHeader(t2);
ck(h.w === 2 && h.fmt === 'TGA2/32' && h.alpha && !h.rle && h.topDown, 'tga header');
img = A.decodeTga(t2);
ck(img.rgba[0] === 3 && img.rgba[2] === 1 && img.rgba[7] === 128, 'tga bgr->rgb');
const t10 = tga(2, 2, 10, 24, [[9, 8, 7]], true);
ck(A.tgaHeader(t10).rle, 'tga rle flag');
img = A.decodeTga(t10);
ck(img && img.rgba[12] === 7 && img.rgba[14] === 9, 'tga rle decode all 4 px');
ck(A.pngHeader(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]), Buffer.from([0, 0, 0, 5, 0, 0, 0, 7, 8, 6, 0, 0, 0])])).fmt === 'PNG8/ct6', 'png header');

// ---- pixel diff
const a = A.decodeDds(dxt1Solid(8, 8, 200, 100, 50)), b = A.decodeDds(dxt1Solid(16, 16, 200, 100, 50)), c = A.decodeDds(dxt1Solid(8, 8, 0, 0, 0));
ck(A.pixelDiff(a, b).mad.every(v => v === 0), 'same colour, different size: diff 0 after resample');
ck(A.pixelDiff(a, c).mad[0] > 150, 'different colour: diff large');

// ---- names and roles
ck(A.suffixOf('texture/common/_vehicle/usa/dd_skirt_bp') === '_bp', 'suffix _bp');
ck(A.suffixOf('texture/common/roof/roof_sh35#burned$') === '_sh35', 'suffix with variant ' + A.suffixOf('texture/common/roof/roof_sh35#burned$'));
ck(A.variantOf('a/b#winter') === '#winter', 'variant');
ck(A.baseStem('a/b_x#winter$') === 'a/b_x', 'baseStem');
ck(A.resolveTex('entity/a/b/m.mtl', '$/wall/w1')[0] === 'texture/common/wall/w1', '$/ -> texture/common');
ck(A.resolveTex('entity/a/b/m.mtl', 'loc.dds')[0] === 'entity/a/b/loc', 'relative to the mtl');
const m = A.parseMtl('{material bump\n\t{diffuse "$/x/y"}\n\t{bump "$/x/y_bp"}\n\t{color "230 230 230 80"}\n}');
ck(m.type === 'bump' && m.kv.length === 4 && m.kv[2][0] === 'bump', 'mtl parse');
ck(A.roleOf({ roles: ['bump.bump'], suffix: '_bp' }) === 'bump' && A.roleOf({ roles: [], suffix: '_sp' }) === 'unref:_sp', 'roleOf');
ck(A.familyOf('texture/common/_vehicle/usa/x.dds') === 'texture/common/_vehicle', 'family texture');
ck(A.familyOf('entity/-vehicle/usa/tank/t1/a.anm') === 'entity/-vehicle/usa', 'family vehicle');

// ---- anm fixtures
function anm(version, bones, frames) {   // frames: [{f, recs:[{bone, pos?, rot?}]}]
  const parts = [Buffer.from('EANM'), i32(version), Buffer.from('FRMS'), i32(frames.length ? frames[frames.length - 1].f + 1 : 0), Buffer.from('BMAP'), i32(bones.length)];
  for (const nm of bones) parts.push(i32(nm.length), Buffer.from(nm, 'latin1'));
  for (const fr of frames) {
    const hd = Buffer.alloc(7); hd.write('FRM2', 0, 'latin1'); const body = [hd.subarray(0, 4)];
    const u = Buffer.alloc(3); u.writeUInt16LE(fr.f, 0); u[2] = fr.recs.length; body.push(u);
    for (const r of fr.recs) {
      const fl = (r.pos ? 1 : 0) | (r.rot ? 2 : 0); const rh = Buffer.alloc(3); rh[0] = r.bone; rh.writeUInt16LE(fl, 1); body.push(rh);
      for (const v of (r.pos || []).concat(r.rot || [])) { const f = Buffer.alloc(4); f.writeFloatLE(v, 0); body.push(f); }
    }
    parts.push(...body);
  }
  return Buffer.concat(parts);
}
function i32(v) { const b = Buffer.alloc(4); b.writeInt32LE(v, 0); return b; }
const bonesA = ['root', 'arm', 'hand'];
const rp = () => +(rnd() * 20 - 10).toFixed(3);
const fr = [{ f: 0, recs: [{ bone: 0, pos: [rp(), rp(), rp()], rot: [0, 0, 0] }, { bone: 1, pos: [3, 4, 0], rot: [0.1, 0.2, 0.3] }] }, { f: 5, recs: [{ bone: 2, pos: [1, 1, 1] }] }];
const A1 = anm(0x60000, bonesA, fr), A2 = anm(0x60001, bonesA, fr);
let r = A.anmRow('entity/humanskin/x.anm', A1);
ck(r.version === 0x60000 && r.frames === 6 && r.bones === 3 && r.kinds.join() === 'frm2-posrot', 'anmRow ' + JSON.stringify(r.kinds));
ck(r.maxPos >= 5 && r.posRecs === 3 && r.rotRecs === 2, 'anm pos stats');
ck(A.anmClass(r).startsWith('v60000|frm2-posrot|bones<=10|'), 'anm class ' + A.anmClass(r));
ck(A.anmRow('k', A2).version === 0x60001, '0x60001 row');
ck(A.anmRow('k', Buffer.from('XXXX')).error, 'bad magic error');
let d = A.poseDiff(A1, A2);
ck(d.sharedBones === 3 && d.meanPosDiff === 0 && d.meanRotDiff === 0 && d.versionB === 0x60001, 'identical poses, different version');
const fr2 = JSON.parse(JSON.stringify(fr)); fr2[0].recs[1].pos = [6, 8, 0];   // 10 long instead of 5: scale x2
d = A.poseDiff(A1, anm(0x60000, bonesA, fr2));
ck(d.meanPosLenB > d.meanPosLenA && d.meanPosDiff > 1, 'scale difference seen');
d = A.poseDiff(A1, anm(0x60000, ['root', 'other'], [{ f: 0, recs: [{ bone: 0, pos: [1, 1, 1] }] }]));
ck(d.sharedBones === 1 && d.onlyA === 2 && d.onlyB === 1, 'bone-name set difference');
ck(A.anmRow('k', anm(0x60000, [], [])).bones === 0, 'header-only animation');

// ---- seeded determinism
seed = 7; const x1 = rnd(); seed = 7; ck(rnd() === x1, 'seeded rnd');

// ---- game parity: installs through lib/games, env override, no drive path in the code
{
  const src = require('fs').readFileSync(require('path').join(__dirname, 'assetsame.js'), 'utf8');
  ck(!/[A-Za-z]:[\\/]/.test(src.replace(/^\s*\/\/.*$/gm, '')), 'no drive path in assetsame.js code');
  const keep = process.env.ASSETSAME_AS2; process.env.ASSETSAME_AS2 = 'X/resource';
  ck(A.INSTALL.as2 === 'X/resource', 'ASSETSAME_AS2 overrides the AS2 resource folder');
  if (keep === undefined) delete process.env.ASSETSAME_AS2; else process.env.ASSETSAME_AS2 = keep;
  ck(Object.keys(A.INSTALL).join(',') === 'as2,goh', 'INSTALL keys as2, goh');
}

console.log(fails ? `FAIL ${fails}/${n}` : `PASS ${n}`);
process.exit(fails ? 1 : 0);
