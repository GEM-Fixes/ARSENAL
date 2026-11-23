// lib/model/edit/ply.js unit tests: every ply.* and mat.* op and state on a stand-in document (the contract shape of
// tools/lib/model/edit/README.md) built from synthetic files: a cube mesh written through ply.js, a skinned mesh, a .mdl, a .mtl.
// After each op every returned .ply and .mdl is parsed again; files an op does not return stay byte-identical.
// Run inside tools/lib/test/test.js or alone: node tools/lib/test/model-edit-ply.test.js (last line PASS)
// Author: Imperator_Aug (ARSENAL, ia-3d3e2c6a)
'use strict';
module.exports = (t, assert) => {
  const P = require('../model/ply'), M = require('../model/mdl'), OBJ = require('../model/obj'), E = require('../model/edit/ply');
  const B = (...a) => Buffer.concat(a.map(x => (Buffer.isBuffer(x) ? x : Buffer.from(x, 'latin1'))));
  const i32 = (...a) => Buffer.concat(a.map(n => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; }));
  const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
  const u16 = (...a) => Buffer.concat(a.map(n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }));
  const f32 = (...a) => Buffer.concat(a.map(n => { const b = Buffer.alloc(4); b.writeFloatLE(n); return b; }));
  const s = x => B(Buffer.from([x.length]), x);
  const near = (a, b, m, e = 1e-4) => { assert.equal(a.length, b.length, m); for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) < e, `${m} [${i}] ${a[i]} vs ${b[i]}`); };
  const D = 'resource/entity/t/', MDL = D + 't.mdl';

  // ---- fixtures ----
  // cube of half size h, per-face vertices (24), engine winding (clockwise against the right-handed cross), 2 parts
  function cube(h, tangents, mats) {
    const faces = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, -1, 0], [0, 0, 1]], [[0, 1, 0], [-1, 0, 0], [0, 0, 1]],
      [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [0, 1, 0], [-1, 0, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]]];
    const pos = [], nrm = [], uv = [], idx = [];
    for (const [n, u, v] of faces) {
      const base = pos.length / 3;
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { for (let c = 0; c < 3; c++) pos.push((n[c] + a * u[c] + b * v[c]) * h); nrm.push(...n); uv.push((a + 1) / 2, (1 - b) / 2); }
      // u x v = n (counter-clockwise seen from outside) -> engine order swaps two corners
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    return E._t.buildPly({ positions: Float32Array.from(pos), normals: Float32Array.from(nrm), uvs: Float32Array.from(uv), indices: Uint32Array.from(idx),
      groups: [{ material: mats[0], firstFace: 0, faceCount: 8 }, { material: mats[1], firstFace: 8, faceCount: 4 }] }, { tangents });
  }
  const sv = (x, w, b0) => B(f32(x, 0, 0, w), Buffer.from([b0, 1, 0, 0]), f32(0, 0, 1, 0, 0));
  const skinned = B('EPLY', 'BNDS', f32(0, 0, 0, 2, 0, 0), 'SKIN', i32(2), s('root'), s('arm'),
    'MESH', u32(0x1118), i32(0, 1), u32(0xc14), s('soldier.mtl'), Buffer.from([2, 1, 2]),
    'VERT', i32(3), u16(40, 0), sv(0, 1, 0), sv(1, 1.5, 1), sv(2, 0, 1), 'INDX', i32(3), u16(0, 1, 2));
  const mdlText = ['{Skeleton', '\t{bone "body"', '\t\t{VolumeView "body.ply"}', '\t\t{bone "turret"', '\t\t\t{Position 0\t0\t20}', '\t\t\t{VolumeView "turret.ply"}',
    '\t\t}', '\t\t{bone "gun"', '\t\t\t{Position 10\t0\t0}', '\t\t}', '\t}', '}', ''].join('\r\n');
  const mtlText = ['{material bump', '\t{diffuse "body"}', '\t{bump "$/model/body_bp"}', '\t{blend none}', '}', ''].join('\r\n');
  const cubeObj = [
    'mtllib cube.mtl', 'o Cube', 'v -0.5 -0.5 0.5', 'v 0.5 -0.5 0.5', 'v -0.5 0.5 0.5', 'v 0.5 0.5 0.5', 'v -0.5 0.5 -0.5', 'v 0.5 0.5 -0.5', 'v -0.5 -0.5 -0.5', 'v 0.5 -0.5 -0.5',
    'vt 0 0', 'vt 1 0', 'vt 0 1', 'vt 1 1', 'vn 0 0 1', 'vn 0 1 0', 'vn 0 0 -1', 'vn 0 -1 0', 'vn 1 0 0', 'vn -1 0 0',
    'usemtl hull', 'f 1/1/1 2/2/1 4/4/1 3/3/1', 'f 3/1/2 4/2/2 6/4/2 5/3/2', 'f 5/1/3 6/2/3 8/4/3 7/3/3', 'f 7/1/4 8/2/4 2/4/4 1/3/4',
    'usemtl tracks', 'f 2/1/5 8/2/5 6/4/5 4/3/5', 'f 7/1/6 1/2/6 3/4/6 5/3/6', ''].join('\n');
  const cubeMtl = 'newmtl hull\nKd 1 1 1\nmap_Kd textures\\hull_paint.png\nnewmtl tracks\nmap_Kd tracks.dds\n';

  function makeDoc(extra) {
    const kindOf = rel => (/\.mdl$/i.test(rel) ? 'mdl' : /\.ply$/i.test(rel) ? 'ply' : /\.mtl$/i.test(rel) ? 'mtl' : 'other');
    const doc = { id: 'stand-in', rev: 0, mod: 'M', mdl: MDL, files: new Map(), steps: [] };
    const files = Object.assign({ [MDL]: Buffer.from(mdlText, 'latin1'), [D + 'body.ply']: cube(10, true, ['body.mtl', 'track.mtl']), [D + 'turret.ply']: cube(4, false, ['body.mtl', 'body.mtl']),
      [D + 'body.mtl']: Buffer.from(mtlText, 'latin1'), [D + 'body.dds']: Buffer.from('DDS stand-in'), [D + 'skin.ply']: skinned }, extra || {});
    for (const [rel, b] of Object.entries(files)) doc.files.set(rel, { rel, kind: kindOf(rel), bytes: b, bytes0: b, from: 'mod', dirty: false });
    const cache = new Map();
    doc.read = rel => {
      const f = doc.files.get(rel), key = rel + '@' + doc.rev;
      if (!cache.has(key)) cache.set(key, f.kind === 'mdl' ? M.parse(f.bytes) : f.kind === 'ply' ? P.parse(f.bytes) : f.bytes);
      return cache.get(key);
    };
    doc.apply = (name, args) => {
      const o = E.ops[name]; if (!o) throw new Error('no op ' + name);
      const before = new Map([...doc.files].map(([k, f]) => [k, f.bytes]));
      const r = o.apply(doc, args);
      const changed = Object.keys(r.files);
      for (const [rel, b] of Object.entries(r.files)) {
        if (b === null) { doc.files.delete(rel); continue; }
        assert.ok(Buffer.isBuffer(b), name + ': ' + rel + ' is a Buffer');
        const kind = kindOf(rel);
        if (kind === 'ply') assert.equal(P.parse(b).error, null, name + ': ' + rel + ' parses');
        if (kind === 'mdl') { const m = M.parse(b); assert.equal(m.error, null, name + ': mdl parses'); }
        if (kind === 'mtl') assert.ok(!/[^\r]\n/.test(b.toString('latin1')), name + ': ' + rel + ' CRLF');
        const f = doc.files.get(rel);
        if (f) Object.assign(f, { bytes: b, dirty: true }); else doc.files.set(rel, { rel, kind, bytes: b, bytes0: null, from: 'new', dirty: true });
      }
      for (const [k, b] of before) if (!changed.includes(k) && doc.files.has(k)) assert.ok(doc.files.get(k).bytes === b, name + ': untouched ' + k);
      doc.rev++; doc.steps.push(name);
      return { rev: doc.rev, changed, info: r.info };
    };
    doc.state = (what, q) => JSON.parse(JSON.stringify(E.state[what](doc, q)));
    return doc;
  }
  const bytes = (doc, rel) => doc.files.get(rel).bytes;
  const ply = (doc, rel) => P.parse(bytes(doc, rel));
  const mdl = doc => M.parse(bytes(doc, MDL));
  const viewsOf = (doc, name) => M.findBone(mdl(doc), name).views.map(v => v.kind + ':' + (v.lods ? v.lods.map(l => l.file).join('|') : v.file));
  const refuses = (fn, re, m) => assert.throws(fn, e => re.test(e.message) && !/\n\s+at /.test(e.message), m);
  const fr = (n, i) => Array.from(n.subarray(i * 3, i * 3 + 3));
  // every triangle's cross (c-a) x (b-a) points along its stored normals (engine clockwise front)
  const windingOk = o => { const p = o.vertices.position, n = o.vertices.normal, ix = o.indices; for (let i = 0; i < ix.length; i += 3) {
    const [a, b, c] = [ix[i], ix[i + 1], ix[i + 2]], e1 = [0, 1, 2].map(q => p[c * 3 + q] - p[a * 3 + q]), e2 = [0, 1, 2].map(q => p[b * 3 + q] - p[a * 3 + q]);
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (cr[0] * n[a * 3] + cr[1] * n[a * 3 + 1] + cr[2] * n[a * 3 + 2] <= 0) return false; } return true; };

  t('edit/ply fixture: built cube parses, writes back byte-identical, engine winding', () => {
    const b = cube(10, true, ['body.mtl', 'track.mtl']), o = P.parse(b);
    assert.equal(o.error, null);
    assert.equal(Buffer.compare(P.write(o), b), 0);
    assert.deepEqual([o.vertices.count, o.indices.length / 3, o.parts.length, o.vertices.stride], [24, 12, 2, 48]);
    assert.ok(o.vertices.tangent, 'tangent decoded');
    assert.deepEqual(Array.from(o.bounds), [-10, -10, -10, 10, 10, 10]);
    assert.ok(windingOk(o));
  });

  t('edit/ply states: ply.list, ply.get, mat.list, mat.get', () => {
    const doc = makeDoc();
    const L = doc.state('ply.list');
    assert.deepEqual(L.meshes.map(m => [m.boneName, m.rel, m.exists, m.triangles]), [['body', D + 'body.ply', true, 12], ['turret', D + 'turret.ply', true, 12]]);
    assert.deepEqual(L.meshes[0].parts.map(p => [p.material, p.materialFound]), [['body.mtl', true], ['track.mtl', false]]);
    assert.deepEqual(L.loose.map(x => x.rel), [D + 'skin.ply']);
    assert.equal(L.loose[0].skinned, true);
    const G = doc.state('ply.get', { rel: D + 'body.ply' });
    assert.ok(G.hasTangents && G.hasNormals && G.canNormals && G.uvCount === 1);
    assert.deepEqual(G.usedBy.map(u => u.bone), ['body']);
    const ML = doc.state('mat.list');
    const body = ML.materials.find(m => m.rel === D + 'body.mtl');
    assert.equal(body.type, 'bump');
    assert.deepEqual(body.textures.map(x => [x.key, x.found]), [['diffuse', true], ['bump', false]]);
    assert.deepEqual(ML.missing.map(x => x.rel), ['resource/texture/common/model/body_bp']);
    assert.deepEqual(ML.missingMaterials.map(x => x.rel), [D + 'track.mtl', D + 'soldier.mtl']);
    // with the core's lookup the game texture is found
    doc.exists = rel => rel === 'resource/texture/common/model/body_bp.dds';
    assert.equal(doc.state('mat.list').missing.length, 0);
    const MG = doc.state('mat.get', { rel: D + 'body.mtl' });
    assert.ok(MG.exists && MG.text === mtlText && MG.keys.some(k => k.key === 'blend' && k.args[0] === 'none'));
    refuses(() => doc.state('ply.get', { rel: D + 'none.ply' }), /not in this model/);
  });

  t('edit/ply transform, scale, mirror, flip: geometry and winding', () => {
    const doc = makeDoc(), rel = D + 'body.ply';
    const o0 = ply(doc, rel), b0 = bytes(doc, rel);
    doc.apply('ply.transform', { rel, move: [10, 0, 0] });
    near(Array.from(ply(doc, rel).bounds), [0, -10, -10, 20, 10, 10], 'moved');
    doc.apply('ply.transform', { rel, move: [-10, 0, 0] });
    doc.apply('ply.transform', { rel, turn: [0, 0, 90] });
    const o1 = ply(doc, rel); near(fr(o1.vertices.normal, 0), [0, 1, 0], 'turned +X face normal -> +Y');
    assert.ok(windingOk(o1), 'winding after turn');
    doc.apply('ply.scale', { rel, factor: 2 });
    near(Array.from(ply(doc, rel).bounds), [-20, -20, -20, 20, 20, 20], 'scaled');
    const doc2 = makeDoc();
    doc2.apply('ply.mirror', { rel, axis: 'y' });
    const m = ply(doc2, rel);
    assert.ok(windingOk(m), 'mirror keeps outward winding'); near(fr(m.vertices.normal, 8), [0, -1, 0], 'mirrored +Y face normal');
    assert.equal(m.vertices.tangent[3], -o0.vertices.tangent[3], 'tangent w flips');
    const doc3 = makeDoc();
    doc3.apply('ply.flip', { rel });
    const f = ply(doc3, rel);
    assert.ok(windingOk(f) && f.indices[1] === o0.indices[2], 'corners swapped, normals follow'); near(fr(f.vertices.normal, 0), [-1, 0, 0], 'normal flipped');
    doc3.apply('ply.flip', { rel });
    assert.equal(Buffer.compare(bytes(doc3, rel), b0), 0, 'flip twice = original bytes');
    refuses(() => doc.apply('ply.transform', { rel }), /does nothing/);
    refuses(() => doc.apply('ply.scale', { rel, factor: 0 }), /none of them 0/);
    refuses(() => doc.apply('ply.mirror', { rel, axis: 'w' }), /x, y or z/);
    refuses(() => doc.apply('ply.flip', { rel, parts: [7] }), /no part 7/);
  });

  t('edit/ply normals, tangents, weld, bounds', () => {
    const doc = makeDoc(), rel = D + 'body.ply', b0 = bytes(doc, rel);
    // spoil the normals, rebuild them
    const o = ply(doc, rel), bad = { ...o, vertices: { ...o.vertices, normal: new Float32Array(o.vertices.normal.length).fill(0.5) } };
    doc.files.get(rel).bytes = P.write(bad);
    doc.apply('ply.normals', { rel });
    const n = ply(doc, rel);
    near(Array.from(n.vertices.normal), Array.from(o.vertices.normal), 'normals rebuilt');
    near(Array.from(n.vertices.tangent), Array.from(o.vertices.tangent), 'tangents rebuilt');
    doc.apply('ply.tangents', { rel });
    assert.ok(Buffer.compare(bytes(doc, rel), b0) === 0 || P.parse(bytes(doc, rel)).error === null);
    refuses(() => doc.apply('ply.tangents', { rel: D + 'turret.ply' }), /no tangents/);
    // weld: the cube's corners differ in normal -> nothing; a quad of 6 equal-attribute vertices -> 4
    const r = doc.apply('ply.weld', { rel: D + 'turret.ply' });
    assert.deepEqual(r.changed, []);
    const q = E._t.buildPly({ positions: Float32Array.from([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0]), normals: null, uvs: null,
      indices: Uint32Array.from([0, 2, 1, 3, 5, 4]), groups: [{ material: 'body.mtl', firstFace: 0, faceCount: 2 }] }, { tangents: false });
    const d2 = makeDoc({ [D + 'quad.ply']: q });
    const w = d2.apply('ply.weld', { rel: D + 'quad.ply' });
    assert.deepEqual([w.info.before, w.info.after, ply(d2, D + 'quad.ply').vertices.count], [6, 4, 4]);
    // bounds
    const sp = ply(d2, D + 'quad.ply'); d2.files.get(D + 'quad.ply').bytes = P.write({ ...sp, bounds: Float32Array.from([0, 0, 0, 0, 0, 0]) });
    d2.apply('ply.bounds', { rel: D + 'quad.ply' });
    near(Array.from(ply(d2, D + 'quad.ply').bounds), [0, 0, 0, 1, 1, 0], 'bounds');
    assert.deepEqual(d2.apply('ply.bounds', { rel: D + 'quad.ply' }).changed, [], 'bounds already right: no change');
  });

  t('edit/ply attach, detach, replace, rename, lods', () => {
    const doc = makeDoc();
    doc.apply('ply.attach', { bone: 'gun', data: cube(2, false, ['body.mtl', 'body.mtl']).toString('base64'), name: 'barrel' });
    assert.deepEqual(viewsOf(doc, 'gun'), ['VolumeView:barrel.ply']);
    assert.ok(doc.files.has(D + 'barrel.ply'));
    refuses(() => doc.apply('ply.attach', { bone: 'gun', data: cube(2, false, ['a.mtl', 'a.mtl']).toString('base64'), name: 'barrel' }), /already in this model/);
    refuses(() => doc.apply('ply.attach', { bone: 'gun', data: Buffer.from('nope').toString('base64'), name: 'x' }), /not a mesh file/);
    refuses(() => doc.apply('ply.attach', { bone: 'nobody', rel: D + 'body.ply' }), /no bone called nobody/);
    doc.apply('ply.attach', { bone: 'gun', rel: D + 'turret.ply' });
    assert.deepEqual(viewsOf(doc, 'gun'), ['VolumeView:turret.ply']);
    doc.apply('ply.detach', { bone: 'gun', drop: true });
    assert.deepEqual(viewsOf(doc, 'gun'), []);
    assert.ok(doc.files.has(D + 'turret.ply'), 'still used by turret: kept');
    refuses(() => doc.apply('ply.detach', { bone: 'gun' }), /has no mesh/);
    doc.apply('ply.replace', { rel: D + 'turret.ply', from: D + 'body.ply' });
    assert.equal(Buffer.compare(bytes(doc, D + 'turret.ply'), bytes(doc, D + 'body.ply')), 0);
    const rr = doc.apply('ply.rename', { rel: D + 'turret.ply', to: 'tower' });
    assert.ok(!doc.files.has(D + 'turret.ply') && doc.files.has(D + 'tower.ply') && rr.info.views === 1);
    assert.deepEqual(viewsOf(doc, 'turret'), ['VolumeView:tower.ply']);
    refuses(() => doc.apply('ply.rename', { rel: D + 'tower.ply', to: 'body.ply' }), /already in this model/);
    refuses(() => doc.apply('ply.rename', { rel: D + 'tower.ply', to: 'bär' }), /plain latin/);
    doc.apply('ply.lods', { bone: 'body', files: [D + 'body.ply', D + 'tower.ply'] });
    assert.deepEqual(viewsOf(doc, 'body'), ['LODView:body.ply|tower.ply']);
    assert.deepEqual(doc.state('ply.list').meshes.filter(m => m.bone === 'body').map(m => m.lod), [0, 1]);
    doc.apply('ply.lods', { bone: 'body', files: [D + 'body.ply'] });
    assert.deepEqual(viewsOf(doc, 'body'), ['VolumeView:body.ply']);
    refuses(() => doc.apply('ply.lods', { bone: 'body', files: [] }), /at least one/);
  });

  t('edit/ply skin, tweak', () => {
    const doc = makeDoc(), rel = D + 'skin.ply';
    doc.apply('ply.skin', { rel, rename: { from: 'arm', to: 'hand' } });
    assert.deepEqual(ply(doc, rel).skin, ['root', 'hand']);
    doc.apply('ply.skin', { rel, rename: { from: 'hand', to: 'root' } });
    assert.deepEqual(ply(doc, rel).parts[0].boneMap, [1, 1], 'bone map points at the existing name');
    doc.apply('ply.skin', { rel, clamp: true });
    assert.deepEqual(Array.from(ply(doc, rel).vertices.weight), [1, 1, 0]);
    refuses(() => doc.apply('ply.skin', { rel: D + 'body.ply', rename: { from: 'a', to: 'b' } }), /not skinned/);
    refuses(() => doc.apply('ply.skin', { rel }), /Say what/);
    doc.apply('ply.tweak', { rel: D + 'body.ply', set: 'two_sided', parts: [1] });
    assert.deepEqual(ply(doc, D + 'body.ply').parts.map(p => p.flags & 1), [0, 1]);
    doc.apply('ply.tweak', { rel: D + 'body.ply', vset: '1' });
    assert.equal(ply(doc, D + 'body.ply').vertices.flags, 7, 'already set: VERT flags stay');
    doc.apply('ply.tweak', { rel: D + 'body.ply', vclear: '1' });
    assert.equal(ply(doc, D + 'body.ply').vertices.flags, 6);
    refuses(() => doc.apply('ply.tweak', { rel: D + 'body.ply', set: 'skinned', parts: [0] }), /skinned/);
  });

  t('edit/ply merge, mergeChild, demerge', () => {
    const doc = makeDoc();
    doc.apply('ply.merge', { rel: D + 'body.ply', from: D + 'turret.ply', out: 'both', matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 20] });
    const both = ply(doc, D + 'both.ply');
    assert.deepEqual([both.parts.length, both.vertices.count], [4, 48]);
    near(Array.from(both.bounds), [-10, -10, -10, 10, 10, 24], 'merged bounds');
    refuses(() => doc.apply('ply.merge', { rel: D + 'body.ply', from: D + 'skin.ply' }), /skinned/);
    const d2 = makeDoc();
    d2.apply('ply.mergeChild', { bone: 'turret' });
    assert.equal(ply(d2, D + 'body.ply').parts.length, 4);
    assert.deepEqual(viewsOf(d2, 'turret'), []);
    refuses(() => d2.apply('ply.mergeChild', { bone: 'body' }), /no parent/);
    refuses(() => d2.apply('ply.mergeChild', { bone: 'gun' }), /no mesh/);
    const d3 = makeDoc();
    const r = d3.apply('ply.demerge', { bone: 'body', by: 'parts', recentre: true });
    assert.deepEqual(r.info.pieces.map(p => p.bone), ['body_part_001', 'body_part_002']);
    assert.deepEqual(viewsOf(d3, 'body'), []);
    assert.deepEqual(viewsOf(d3, 'body_part_001'), ['VolumeView:body_demerge_001.ply']);
    const p1 = ply(d3, D + 'body_demerge_001.ply');
    assert.deepEqual([p1.parts.length, p1.indices.length / 3], [1, 8]);
    near(Array.from(p1.bounds), [-10, -10, -10, 10, 10, 10], 'own bounds');
    const d4 = makeDoc();
    const ri = d4.apply('ply.demerge', { bone: 'body', by: 'islands', recentre: true });
    assert.equal(ri.info.pieces.length, 6, 'six separate cube faces');
    near(Array.from(ply(d4, D + 'body_demerge_001.ply').bounds), [0, -10, -10, 0, 10, 10], 'own bounds, centred (stale-bounds bug of SOEdit not repeated)');
    near(M.findBone(mdl(d4), 'body_part_001').matrix.slice(9), [10, 0, 0], 'offset on the new bone');
    assert.equal(makeDoc().apply('ply.demerge', { bone: 'body', by: 'material' }).info.pieces.length, 2);
    refuses(() => makeDoc().apply('ply.demerge', { bone: 'turret', by: 'material' }), /only one piece/);
  });

  t('edit/ply import OBJ, export OBJ round trip', () => {
    const doc = makeDoc();
    const r = doc.apply('ply.import', { obj: cubeObj, mtl: [{ name: 'cube.mtl', text: cubeMtl }], name: 'box', bone: 'gun' });
    assert.deepEqual(r.changed.sort(), [D + 'box.ply', D + 'hull.mtl', D + 't.mdl', D + 'tracks.mtl'].sort());
    assert.deepEqual(viewsOf(doc, 'gun'), ['VolumeView:box.ply']);
    assert.ok(/\{diffuse "hull_paint"\}/.test(bytes(doc, D + 'hull.mtl').toString('latin1')), 'diffuse from map_Kd');
    const o = ply(doc, D + 'box.ply');
    assert.deepEqual([o.vertices.count, o.indices.length / 3, o.parts.map(p => p.material).join()], [24, 12, 'hull.mtl,tracks.mtl']);
    near(Array.from(o.bounds), [-10, -10, -10, 10, 10, 10], '1 m cube = 20 units');
    assert.ok(windingOk(o), 'clockwise front after import');
    // OBJ +Y face -> game +Z; OBJ +X face (right) -> game -Y (right)
    const P0 = o.vertices.position, N0 = o.vertices.normal;
    const at = (x, y, z) => { for (let i = 0; i < o.vertices.count; i++) if (Math.abs(P0[i * 3] - x) < 1e-4 && Math.abs(P0[i * 3 + 1] - y) < 1e-4 && Math.abs(P0[i * 3 + 2] - z) < 1e-4) return i; return -1; };
    assert.ok(at(10, -10, 10) >= 0, 'OBJ (0.5, 0.5, -0.5) -> game (10, -10, 10)');
    const top = [...Array(o.vertices.count).keys()].filter(i => Math.abs(N0[i * 3 + 2] - 1) < 1e-6);
    assert.ok(top.length === 4 && top.every(i => Math.abs(P0[i * 3 + 2] - 10) < 1e-4), 'up face on top');
    assert.ok(o.vertices.tangent, 'tangents made');
    // export and compare triangles (corner order kept up to rotation)
    const X = doc.state('ply.export', { rel: D + 'box.ply' });
    assert.ok(/^mtllib box\.mtl$/m.test(X.obj) && /newmtl hull/.test(X.mtl) && X.triangles === 12);
    const tri = text => { const m = OBJ.toMesh(OBJ.parse(text)); const out = [];
      for (let i = 0; i < m.indices.length; i += 3) { const c = [0, 1, 2].map(k => Array.from(m.positions.subarray(m.indices[i + k] * 3, m.indices[i + k] * 3 + 3)).map(x => Math.round(x * 1e4) / 1e4 + 0).join(','));
        const r0 = c.indexOf([...c].sort()[0]); out.push([0, 1, 2].map(k => c[(r0 + k) % 3]).join(' ')); }
      return out.sort(); };
    assert.deepEqual(tri(X.obj), tri(cubeObj), 'same triangles, same winding');
    const uvs = OBJ.parse(X.obj).vt; assert.ok(uvs.length && uvs.every(x => x >= 0 && x <= 1));
    // z-up and units
    const d2 = makeDoc();
    d2.apply('ply.import', { obj: cubeObj, name: 'raw', axis: 'z-up', units: 'units', tangents: false });
    near(Array.from(ply(d2, D + 'raw.ply').bounds), [-0.5, -0.5, -0.5, 0.5, 0.5, 0.5], 'units as is');
    assert.equal(ply(d2, D + 'raw.ply').vertices.stride, 32, 'no tangents');
    // no normals, no uvs: normals made
    const d3 = makeDoc(), ri = d3.apply('ply.import', { obj: 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n', name: 'tri' });
    assert.ok(ri.info.normalsMade && ri.info.uvsMissing);
    // counter-clockwise in OBJ faces OBJ +Z, which is game -X (y-up: (x, y, z) -> (-z, -x, y))
    near(fr(ply(d3, D + 'tri.ply').vertices.normal, 0), [-1, 0, 0], 'made normal faces the OBJ front');
    refuses(() => d3.apply('ply.import', { obj: 'v 0 0 0\n', name: 'x' }), /no faces/);
    refuses(() => d3.apply('ply.import', { obj: cubeObj, name: 'tri' }), /already in this model/);
    refuses(() => d3.apply('ply.import', { obj: cubeObj, name: 'q', units: -1 }), /Units must/);
  });

  t('edit/ply mat.set, mat.textures, mat.edit, mat.create', () => {
    const doc = makeDoc();
    doc.apply('mat.set', { rel: D + 'body.ply', part: 1, name: 'tracks', create: true });
    assert.equal(ply(doc, D + 'body.ply').parts[1].material, 'tracks.mtl');
    assert.ok(/^\{material simple\r\n\t\{diffuse "tracks"\}\r\n\}\r\n$/.test(bytes(doc, D + 'tracks.mtl').toString('latin1')));
    // a part with texture names instead of a material
    const t0 = ply(doc, D + 'turret.ply'), parts = t0.parts.map(p => ({ ...p, flags: p.flags & ~0x400, material: null, textures: ['old'] }));
    const d2 = makeDoc({ [D + 'tex.ply']: P.write({ ...t0, parts }) });
    d2.apply('mat.textures', { rel: D + 'tex.ply', part: 0, textures: ['body'] });
    assert.deepEqual(ply(d2, D + 'tex.ply').parts.map(p => p.textures[0]), ['body', 'old']);
    refuses(() => d2.apply('mat.textures', { rel: D + 'tex.ply', part: 0, textures: ['a', 'b'] }), /room for 1 texture/);
    refuses(() => d2.apply('mat.textures', { rel: D + 'body.ply', part: 0, textures: ['a'] }), /uses a material file/);
    // .mtl text
    const rel = D + 'body.mtl';
    assert.deepEqual(doc.apply('mat.edit', { rel, set: { diffuse: 'body' } }).changed, [], 'same value: no change');
    doc.apply('mat.edit', { rel, type: 'simple', set: { diffuse: 'body2', specular: '$/model/body_sp', blend: 'test', color: [200, 200, 200, 25], bump: null }, flags: { glow: true } });
    const txt = bytes(doc, rel).toString('latin1');
    assert.ok(/^\{material simple\r\n/.test(txt) && /\{diffuse "body2"\}/.test(txt) && !/\{bump/.test(txt) && /\{blend test\}/.test(txt) && /\{color "200 200 200 25"\}/.test(txt) && /\{glow\}/.test(txt), txt);
    const g = doc.state('mat.get', { rel });
    assert.deepEqual([g.type, g.flags], ['simple', ['glow']]);
    doc.apply('mat.edit', { rel, flags: { glow: false } });
    assert.ok(!/glow/.test(bytes(doc, rel).toString('latin1')));
    refuses(() => doc.apply('mat.edit', { rel, set: { blend: 'mix' } }), /Blend must/);
    refuses(() => doc.apply('mat.edit', { rel, flags: { shiny: true } }), /not a material switch/);
    refuses(() => doc.apply('mat.edit', { rel, set: { color: '1 2' } }), /three or four/);
    refuses(() => doc.apply('mat.edit', { rel: D + 'no.mtl', set: { diffuse: 'x' } }), /not in this model/);
    doc.apply('mat.create', { name: 'glass', type: 'bump', set: { diffuse: 'glass', blend: 'blend' }, flags: { nolight: true } });
    const gl = doc.state('mat.get', { rel: D + 'glass.mtl' });
    assert.deepEqual([gl.type, gl.flags, gl.keys.map(k => k.key).join()], ['bump', ['nolight'], 'diffuse,blend']);
    refuses(() => doc.apply('mat.create', { name: 'glass' }), /already in this model/);
  });
};

if (require.main === module) {
  const assert = require('assert');
  let n = 0, bad = 0;
  const t = (name, fn) => { try { fn(); n++; } catch (e) { bad++; console.log('FAIL ' + name + ': ' + (e.stack || e.message)); } };
  module.exports(t, assert);
  console.log(`${n} passed, ${bad} failed`);
  console.log(bad ? 'FAIL' : 'PASS');
  if (bad) process.exitCode = 1;
}
