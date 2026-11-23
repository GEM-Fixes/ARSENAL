#!/usr/bin/env node
// tools/soedit/ops/test/ply.test.js: synthetic meshes only (built here), no game data. Last line `PASS ply ops (N)`.
// Author: Imperator_Aug (ARSENAL, ia-fcdcf1b7)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const P = require('../../../lib/model/ply');
const M = require('../../../lib/model/mdl');
const O = require('../plyops');

let n = 0, failed = 0;
function ok(c, msg) { n++; if (!c) { failed++; console.log('FAIL ' + msg); } }
function throwsLike(fn, re, msg) { try { fn(); ok(false, msg + ' (no throw)'); } catch (e) { ok(re.test(e.message), `${msg}: ${e.message}`); } }
const near = (a, b, e = 1e-4) => Math.abs(a - b) <= e;

// ---------- synthetic ply builder (bytes from the lib's documented layout) ----------
const i32 = x => { const b = Buffer.alloc(4); b.writeInt32LE(x); return b; };
const u32 = x => { const b = Buffer.alloc(4); b.writeUInt32LE(x >>> 0); return b; };
const u16 = x => { const b = Buffer.alloc(2); b.writeUInt16LE(x); return b; };
const f32 = a => { const b = Buffer.alloc(4 * a.length); a.forEach((x, i) => b.writeFloatLE(x, 4 * i)); return b; };
const str = s => Buffer.concat([Buffer.from([s.length]), Buffer.from(s, 'latin1')]);
// fmt: { normal, color, uvs (count), skinned }; verts: [{ p, n, uv: [[u,v]..], color: [b,g,r,a], w, bi: [4] }]
function makePly({ fmt, verts, indices, parts, skin, vflags = 0 }) {
  const chunks = [Buffer.from('EPLY')];
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const v of verts) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], v.p[c]); mx[c] = Math.max(mx[c], v.p[c]); }
  chunks.push(Buffer.from('BNDS'), f32([...mn, ...mx]));
  if (skin) chunks.push(Buffer.from('SKIN'), i32(skin.length), ...skin.map(str));
  const fvf = 0x2 | (fmt.normal ? 0x10 : 0) | (fmt.color ? 0x40 : 0) | ((fmt.uvs || 0) << 8);
  for (const p of parts) {
    const flags = (p.flags || 0) | (fmt.skinned ? 0x10 : 0);
    const tex = (p.textures || []).map(str);
    if (p.tag === 'SUBM') {
      const d = [0x02, 0, 0];
      if (fmt.skinned) d.push(0x40, 0, 0, 0x55, 0, 0);
      if (fmt.normal) d.push(0x12, 0, 0);
      if (fmt.color) d.push(0x26, 0, 0);
      for (let i = 0; i < (fmt.uvs || 0); i++) d.push(0x31, i, 0);
      d.push(0xff, 0xff);
      chunks.push(Buffer.from('SUBM'), Buffer.from(d), i32(p.first), i32(p.count), i32(0), i32(verts.length), u32(flags), ...tex);
    } else chunks.push(Buffer.from('MESH'), u32(fvf), i32(p.first), i32(p.count), u32(flags), ...tex);
  }
  const vb = verts.map(v => Buffer.concat([f32(v.p), fmt.skinned ? Buffer.concat([f32([v.w ?? 1]), Buffer.from(v.bi || [0, 0, 0, 0])]) : Buffer.alloc(0),
    fmt.normal ? f32(v.n) : Buffer.alloc(0), fmt.color ? Buffer.from(v.color || [10, 20, 30, 255]) : Buffer.alloc(0),
    ...Array.from({ length: fmt.uvs || 0 }, (_, i) => f32((v.uv && v.uv[i]) || [0, 0]))]));
  const stride = vb[0].length;
  chunks.push(Buffer.from('VERT'), i32(verts.length), u16(stride), u16(vflags), ...vb);
  chunks.push(Buffer.from('INDX'), i32(indices.length), Buffer.concat(indices.map(u16)));
  return Buffer.concat(chunks);
}
// axis-aligned box, 24 vertices (flat normals), 12 triangles, centre c, half size h
function boxGeom(c = [0, 0, 0], h = 1) {
  const verts = [], idx = [];
  for (let a = 0; a < 3; a++) for (const s of [1, -1]) {
    const u = (a + 1) % 3, w = (a + 2) % 3, base = verts.length;
    for (const [du, dw] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = [0, 0, 0], nn = [0, 0, 0]; p[a] = c[a] + s * h; p[u] = c[u] + du * h; p[w] = c[w] + dw * h; nn[a] = s;
      verts.push({ p, n: nn, uv: [[(du + 1) / 2, (dw + 1) / 2]] });
    }
    if (s > 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3); else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  return { verts, idx };
}
// two boxes as two parts (part 0 = box at origin, part 1 = box at (5,0,0))
function twoPartBox(opts = {}) {
  const g1 = boxGeom([0, 0, 0], 1), g2 = boxGeom([5, 0, 0], 0.5);
  const verts = g1.verts.concat(g2.verts), indices = g1.idx.concat(g2.idx.map(i => i + 24));
  return makePly({ fmt: opts.fmt || { normal: true, uvs: 1 }, verts, indices, vflags: 1,
    parts: [{ tag: opts.tag0 || 'MESH', first: 0, count: 12, textures: ['hull'] }, { tag: opts.tag1 || 'MESH', first: 12, count: 12, textures: ['wheel'] }] });
}
const boxPly = (c, h, fmt = { normal: true, uvs: 1 }, tex = 'box', extra = {}) => { const g = boxGeom(c, h); return makePly({ fmt, verts: g.verts.map(v => ({ ...v, ...extra })), indices: g.idx, parts: [{ first: 0, count: 12, textures: [tex] }], skin: fmt.skinned ? ['root'] : undefined }); };
function triSet(ply) {
  const pos = ply.vertices.position, out = [];
  for (let i = 0; i < ply.parts.length; i++) {
    const t = P.partTriangles(ply, i);
    for (let k = 0; k + 2 < t.length; k += 3) out.push([t[k], t[k + 1], t[k + 2]].map(v => [0, 1, 2].map(c => pos[v * 3 + c].toFixed(4)).join(',')).join(';'));
  }
  return out.sort().join('\n');
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plyops-test-'));
const SO = path.resolve(__dirname, '..', '..', 'soedit.js');
// soedit.js's own parser wants a value after a trailing --json (reported): the dispatch test puts --json first, the rest run ops/<x>.js directly
const cli = (...args) => { const r = cp.spawnSync(process.execPath, [path.join(__dirname, '..', args[0] + '.js'), ...args.slice(1)], { encoding: 'utf8' }); return { code: r.status, out: r.stdout + r.stderr }; };

try {
  // builder sanity: the lib parses the bytes and writes them back unchanged
  const bufA = boxPly([0, 0, 0], 1), A = P.parse(bufA);
  ok(!A.error && A.vertices.count === 24 && A.parts.length === 1, 'builder: lib parses box ' + A.error);
  ok(P.write(A).equals(bufA), 'builder: byte-identical round trip');
  const two = P.parse(twoPartBox({ tag1: 'SUBM' }));
  ok(!two.error && two.parts[1].tag === 'SUBM' && P.write(two).equals(twoPartBox({ tag1: 'SUBM' })), 'builder: SUBM part parses and round-trips ' + two.error);

  // merge with translation
  const B = P.parse(boxPly([0, 0, 0], 1, undefined, 'other'));
  const m1 = O.merge(A, B, { matrixB: [1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 0, 0] }).ply;
  ok(m1.vertices.count === 48 && m1.indices.length / 3 === 24 && m1.parts.length === 2, 'merge: counts');
  ok(near(m1.vertices.position[24 * 3], B.vertices.position[0] + 10) && near(m1.vertices.position[24 * 3 + 1], B.vertices.position[1]), 'merge: b moved by +10 x');
  ok([-1, -1, -1, 11, 1, 1].every((x, i) => near(m1.bounds[i], x)), 'merge: bounds ' + Array.from(m1.bounds));
  ok(m1.parts[1].textures[0] === 'other' && m1.parts[0].textures[0] === 'box', 'merge: materials kept separate');
  const re1 = P.parse(P.write(m1));
  ok(!re1.error && re1.vertices.count === 48, 'merge: written mesh parses ' + re1.error);

  // rotation + scale: normals unit length
  const c45 = Math.SQRT1_2, rot = [2 * c45, 2 * c45, 0, -2 * c45, 2 * c45, 0, 0, 0, 2, 0, 0, 5];
  const m2 = O.merge(A, B, { matrixB: rot }).ply;
  let unit = true;
  for (let k = 24; k < 48; k++) { const x = m2.vertices.normal[k * 3], y = m2.vertices.normal[k * 3 + 1], z = m2.vertices.normal[k * 3 + 2]; if (!near(Math.hypot(x, y, z), 1, 1e-5)) unit = false; }
  ok(unit, 'merge: normals unit length after rotation + scale');
  ok(near(m2.vertices.normal[24 * 3], c45, 1e-5) && near(m2.vertices.normal[24 * 3 + 1], c45, 1e-5), 'merge: +x normal rotated 45 degrees');

  // format reconcile (base has colour, append has none) and refusals
  const Ac = P.parse(boxPly([0, 0, 0], 1, { normal: true, color: true, uvs: 1 }));
  const mc = O.merge(Ac, B, {});
  const rc = P.parse(P.write(mc.ply));
  ok(!rc.error && rc.parts[1].fvf === rc.parts[0].fvf, 'reconcile: append fvf rewritten to the base layout ' + rc.error);
  ok(rc.vertices.color[24 * 4] === 255 && rc.vertices.color[0] === 10, 'reconcile: missing colour = white');
  ok(near(rc.vertices.uv0[24 * 2 + 1], B.vertices.uv0[1]) && near(rc.vertices.uv0[25 * 2], B.vertices.uv0[2]), 'reconcile: append uv kept');
  const S = P.parse(boxPly([0, 0, 0], 1, { normal: true, uvs: 1, skinned: true }));
  ok(!S.error, 'builder: skinned box ' + S.error);
  throwsLike(() => O.merge(A, S, {}), /skinned/, 'merge refuses unskinned + skinned');
  const S2 = { ...S, vertices: { ...S.vertices, layout: S.vertices.layout.map(e => (e.usage === 4 ? { ...e, comps: 2 } : e)) } };
  throwsLike(() => O.merge(S, S2, {}), /weight counts/, 'merge refuses different weight counts');
  const big = { ...B, magic: 'BPLY' };
  throwsLike(() => O.merge(A, big, {}), /BPLY/, 'merge refuses EPLY + BPLY');

  // demerge then merge back: same triangle set
  const T2 = P.parse(twoPartBox());
  const parts = O.demerge(T2, 'parts');
  ok(parts.length === 2 && parts[0].ply.vertices.count === 24 && parts[1].ply.vertices.count === 24, 'demerge: 2 meshes of 24 vertices');
  ok([4.5, -0.5, -0.5, 5.5, 0.5, 0.5].every((x, i) => near(parts[1].ply.bounds[i], x)), 'demerge: own bounds ' + Array.from(parts[1].ply.bounds));
  const back = O.merge(parts[0].ply, parts[1].ply, {}).ply;
  ok(triSet(back) === triSet(T2), 'demerge + merge: same triangle set');
  const byMat = O.demerge(T2, 'material');
  ok(byMat.length === 2 && byMat[1].key === 'wheel', 'demerge by material');
  const rc2 = O.demerge(T2, [[1]], { recentre: true })[0];
  ok(near(rc2.offset[9], 5) && near(rc2.ply.bounds[0], -0.5) && near(rc2.ply.bounds[3], 0.5), 'demerge recentre: offset matrix + centred bounds');
  const rcBack = O.merge(T2, rc2.ply, { matrixB: rc2.offset }).ply;
  ok(near(rcBack.vertices.position[48 * 3], T2.vertices.position[24 * 3]), 'recentred part + offset lands where it was');

  // tweak: only named flags, only named parts, SUBM stays SUBM, vertex flags separate
  const TS = P.parse(twoPartBox({ tag1: 'SUBM' }));
  const tw = O.tweak(TS, { meshFlagsSet: 'two_sided', parts: [1], vertexFlagsClear: 1 }).ply;
  ok(tw.parts[1].flags === 1 && tw.parts[0].flags === 0, 'tweak: flag only on part 1');
  ok(tw.vertices.flags === 0 && TS.vertices.flags === 1, 'tweak: VERT flags cleared, source untouched');
  const twr = P.parse(P.write(tw));
  ok(!twr.error && twr.parts[1].tag === 'SUBM' && twr.parts[0].tag === 'MESH' && twr.parts[1].flags === 1, 'tweak: SUBM stays SUBM after write');
  ok(P.write(O.tweak(TS, {}).ply).equals(P.write(TS)), 'tweak: no change = same bytes');
  throwsLike(() => O.tweak(TS, { meshFlagsSet: 'skinned' }), /skinned/, 'tweak refuses layout flag 0x10');
  const tm = O.tweak(TS, { material: { from: 'WHEEL', to: 'tyre' } }).ply;
  ok(tm.parts[1].textures[0] === 'tyre' && tm.parts[0].textures[0] === 'hull', 'tweak: texture rename');
  throwsLike(() => O.tweak(TS, { material: { from: 'nope', to: 'x' } }), /not found/, 'tweak: unknown material refused');

  // fit
  const fb = O.fitBox([[0, 0, 0], [2, 4, 6], [1, -2, 3]]);
  ok(fb.size.join() === '2,6,6' && fb.matrix.slice(9).join() === '1,1,3', 'fitBox size + centre ' + JSON.stringify(fb));
  const fv = O.fitVolumeToMesh(T2, { kind: 'box' });
  ok(near(fv.size[0], 6.5) && near(fv.matrix[9], 2.25), 'fitVolumeToMesh box');
  const fc = O.fitVolumeToMesh(A, { kind: 'cylinder' });
  ok(near(fc.radius, Math.SQRT2) && near(fc.length, 2), 'fitVolumeToMesh cylinder');
  ok(O.round([0.26, -0.74, 1.24], 0.5).join() === '0.5,-0.5,1', 'round to step');
  const rv = O.roundVolume({ size: [1.1, 2, 3], matrix: [0.999, 0.01, 0, -0.01, 0.999, 0, 0, 0, 1, 0.3, 0, 0] }, 0.5);
  ok(rv.change.matrix && rv.change.matrix.slice(0, 9).join() === '1,0,0,0,1,0,0,0,1' && rv.change.matrix[9] === 0.5 && rv.change.size[0] === 1, 'roundVolume near-axis');
  const r45 = O.roundVolume({ matrix: [c45, c45, 0, -c45, c45, 0, 0, 0, 1, 0, 0, 0] }, 1);
  ok(!r45.change.matrix && r45.notes.length, 'roundVolume leaves a 45 degree rotation');

  // CLI: info --json, --dry, .bak, writeguard
  const f1 = path.join(tmp, 'two.ply'); fs.writeFileSync(f1, twoPartBox({ tag1: 'SUBM' }));
  const orig = fs.readFileSync(f1);
  let r = cp.spawnSync(process.execPath, [SO, 'ops', 'ply', 'info', '--json', f1], { encoding: 'utf8' }), j = null;
  r = { code: r.status, out: r.stdout + r.stderr };
  try { j = JSON.parse(r.out); } catch (e) { /* checked below */ }
  ok(r.code === 0 && j && j.ok && j.parts === 2 && j.triangles === 24 && j.info.parts[1].kind === 'SUBM', 'cli info --json ' + r.out.slice(0, 200));
  r = cli('ply', 'tweak', f1, '--set-flag', '0x1', '--dry');
  ok(r.code === 0 && fs.readFileSync(f1).equals(orig) && !fs.existsSync(f1 + '.bak'), '--dry leaves bytes alone ' + r.out);
  r = cli('ply', 'tweak', f1, '--set-flag', 'two_sided', '--parts', '0');
  const after = P.parse(fs.readFileSync(f1));
  ok(r.code === 0 && after.parts[0].flags === 1 && fs.readFileSync(f1 + '.bak').equals(orig), 'tweak in place + .bak ' + r.out);
  r = cli('ply', 'tweak', f1, '--clear-flag', 'two_sided');
  ok(r.code === 0 && fs.readFileSync(f1 + '.bak').equals(orig), 'existing .bak not overwritten');
  const game = path.join(tmp, 'fakegame'); fs.mkdirSync(path.join(game, 'resource'), { recursive: true }); fs.writeFileSync(path.join(game, 'mowas_2.exe'), '');
  const inGame = path.join(game, 'resource', 'x.ply');
  r = cli('ply', 'tweak', f1, '--set-flag', '1', '--out', inGame, '--json');
  ok(r.code === 1 && !fs.existsSync(inGame) && /refused/.test(r.out), 'write into a game install refused ' + r.out.slice(0, 200));
  r = cli('ply', 'bogus', f1);
  ok(r.code === 2, 'unknown operation = exit 2');
  const fa = path.join(tmp, 'a.ply'), fbp = path.join(tmp, 'b.ply'), fm = path.join(tmp, 'm.ply');
  fs.writeFileSync(fa, bufA); fs.writeFileSync(fbp, boxPly([0, 0, 0], 1, undefined, 'other'));
  r = cli('ply', 'merge', fa, fbp, '--out', fm, '--matrix', '1 0 0 0 1 0 0 0 1 10 0 0', '--json');
  ok(r.code === 0 && P.parse(fs.readFileSync(fm)).vertices.count === 48, 'cli merge ' + r.out.slice(0, 200));
  r = cli('ply', 'demerge', f1, '--parts', '1', '--out', path.join(tmp, 'd.ply'), '--rest', path.join(tmp, 'rest.ply'));
  ok(r.code === 0 && P.parse(fs.readFileSync(path.join(tmp, 'd.ply'))).parts[0].tag === 'SUBM' && P.parse(fs.readFileSync(path.join(tmp, 'rest.ply'))).parts.length === 1, 'cli demerge + rest ' + r.out);

  // merge-child + vol fit/round on a synthetic mdl
  const md = path.join(tmp, 'mdl'); fs.mkdirSync(md);
  fs.writeFileSync(path.join(md, 'body.ply'), boxPly([0, 0, 0], 2, undefined, 'hull'));
  fs.writeFileSync(path.join(md, 'turret.ply'), boxPly([0, 0, 0], 1, undefined, 'turret'));
  const mdlText = ['{Skeleton', '\t{bone "body"', '\t\t{VolumeView "body.ply"}', '\t\t{bone "turret"', '\t\t\t{Position 0 0 5}', '\t\t\t{VolumeView "turret.ply"}', '\t\t}', '\t}', '}',
    '{Volume "hull"', '\t{Box 1 1 1}', '\t{Bone "body"}', '\t{Position 0.26 0 0}', '}', ''].join('\r\n');
  const mf = path.join(md, 'tank.mdl'); fs.writeFileSync(mf, mdlText);
  const vid = M.parse(fs.readFileSync(mf)).volumes[0].id;
  r = cli('vol', 'fit', mf, '--volume', vid, '--json'); j = JSON.parse(r.out);
  ok(r.code === 0 && j.mdlChanges[0].size.join() === '4,4,4' && fs.readFileSync(mf, 'utf8') === mdlText, 'vol fit prints, mdl untouched ' + r.out.slice(0, 300));
  r = cli('vol', 'round', mf, '--step', '0.5', '--apply');
  const mv = M.parse(fs.readFileSync(mf)).volumes[0];
  ok(r.code === 0 && near(mv.matrix[9], 0.5) && fs.existsSync(mf + '.bak'), 'vol round --apply ' + r.out);
  r = cli('vol', 'fit', mf, '--volume', vid, '--apply');
  const mv2 = M.parse(fs.readFileSync(mf)).volumes[0];
  ok(r.code === 0 && mv2.size.join() === '4,4,4' && near(mv2.matrix[9], 0), 'vol fit --apply ' + r.out);
  r = cli('ply', 'merge-child', mf, '--bone', 'turret', '--apply', '--json'); j = JSON.parse(r.out);
  const merged = P.parse(fs.readFileSync(path.join(md, 'body.ply'))), mm = M.parse(fs.readFileSync(mf));
  ok(r.code === 0 && merged.vertices.count === 48 && near(merged.bounds[5], 6), 'merge-child: parent ply holds both, child at z+5 ' + r.out.slice(0, 300));
  const tb = mm.bones.find(b => b.name === 'turret');
  ok(tb && !(tb.views || []).length && fs.existsSync(path.join(md, 'body.ply.bak')), 'merge-child --apply: child view removed, parent .bak kept');
} catch (e) {
  failed++; console.log('FAIL exception ' + (e.stack || e));
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* left in temp */ }
}
if (failed) { console.log(`FAIL ply ops (${failed} of ${n})`); process.exitCode = 1; } else console.log(`PASS ply ops (${n})`);
