// tools/lib/model/edit/file.js tests: synthetic fixtures and temp mod folders only. Run inside tools/lib/test/test.js as
// require('./model-edit-file.test')(t, assert), or alone: node tools/lib/test/model-edit-file.test.js (last line "N passed").
// Each test drives the ops through a document: the real core (tools/lib/model/edit/core.js) when it is there and opens a
// document from a temp mod folder, else a small stand-in with the contract's shape (README "The document").
// Author: Imperator_Aug (ARSENAL, ia-032123af)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const F = require('../model/edit/file'), mdl = require('../model/mdl'), scene = require('../model/scene'), ply = require('../model/ply'), vol = require('../model/vol');
const { zip } = require('../zipwrite'), pak = require('../pak');

// ---- stand-in core (contract shape) ----
function standIn(mod, files, mdlRel) {
  const doc = { id: 'stand-in', rev: 0, mod, mdl: mdlRel, files: new Map(), undos: [] };
  for (const [rel, b] of Object.entries(files)) doc.files.set(rel, { rel, kind: F.kindOf(rel), bytes: b, bytes0: b, from: 'mod', dirty: false });
  doc.apply = (name, args) => {
    const op = F.ops[name]; if (!op) throw new Error('no op ' + name);
    const why = op.check ? op.check(doc, args) : null; if (why) throw new Error(why);
    const r = op.apply(doc, args), undo = { mdl: doc.mdl, files: [] };
    for (const [rel, b] of Object.entries(r.files)) {
      const old = doc.files.get(rel); undo.files.push([rel, old ? Object.assign({}, old) : null]);
      if (b === null) doc.files.delete(rel);
      else if (old) { old.bytes = b; old.dirty = !(old.bytes0 && old.bytes0.equals(b)); }
      else doc.files.set(rel, { rel, kind: F.kindOf(rel), bytes: b, bytes0: null, from: 'new', dirty: true });
    }
    if (r.info && r.info.mdl) doc.mdl = r.info.mdl;
    doc.rev++; doc.undos.push(undo);
    return { rev: doc.rev, changed: Object.keys(r.files), info: r.info || {} };
  };
  doc.undo = () => { const u = doc.undos.pop(); for (const [rel, old] of u.files) { if (old) doc.files.set(rel, old); else doc.files.delete(rel); } doc.mdl = u.mdl; doc.rev++; };
  doc.state = (what, q) => F.state[what](doc, q);
  return doc;
}
const B = s => Buffer.from(s, 'latin1');
const MDL = ['; comment before', ';Model created by: Someone', '{Skeleton', '\t{bone "basis"', '\t\t{Position 0\t0\t5}', '\t\t{bone "tank"',
  '\t\t\t{VolumeView "tank.ply"}', '\t\t\t{Weird 1 2}', '\t\t\t{bone "turret"', '\t\t\t\t{Orientation', '\t\t\t\t\t0\t1\t0', '\t\t\t\t\t-1\t0\t0', '\t\t\t\t\t0\t0\t1', '\t\t\t\t}',
  '\t\t\t\t{VolumeView "turret.ply"}', '\t\t\t}', '\t\t}', '\t\t{animation {sequence "fire"}}', '\t}', '}', '{Volume "hull"', '\t{Polyhedron "tank__hull.vol"}', '\t{Bone "tank"}', '}',
  '{Volume "shared"', '\t{Polyhedron "../common/box.vol"}', '\t{Bone "tank"}', '}', ''].join('\r\n');
const DIR = 'resource/entity/-vehicle/test/tank/';
function onePly() {   // a tiny valid ply: BNDS + MESH + VERT + INDX (as tools/gui/ext/models/sub/viewer.test.js builds one)
  const f32 = (...a) => Buffer.concat(a.map(v => { const b = Buffer.alloc(4); b.writeFloatLE(v); return b; }));
  const i32 = (...a) => Buffer.concat(a.map(v => { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; }));
  const u16 = (...a) => Buffer.concat(a.map(v => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; }));
  const u32 = v => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; };
  const s8 = x => Buffer.concat([Buffer.from([x.length]), B(x)]);
  const v = (x, y, z) => f32(x, y, z, 0, 0, 1, 0, 0);
  return Buffer.concat([B('EPLY'), B('BNDS'), f32(0, 0, 0, 1, 1, 1), B('MESH'), u32(0x112), i32(0, 1), u32(0x004), s8('a.mtl'),
    B('VERT'), i32(3), u16(32, 7), v(0, 0, 0), v(1, 0, 0), v(0, 1, 0), B('INDX'), i32(3), u16(0, 1, 2)]);
}
function oneVol() { return vol.write(vol.fromBox ? vol.fromBox([2, 2, 2]) : vol.parse(Buffer.alloc(0))); }
function fixture() {
  const files = {};
  files[DIR + 'tank.mdl'] = B(MDL);
  files[DIR + 'tank.def'] = B('{game_entity\r\n\t{Extension "tank.mdl"}\r\n}\r\n');
  files[DIR + 'tank.ply'] = onePly();
  files[DIR + 'turret.ply'] = onePly();
  files[DIR + 'tank__hull.vol'] = oneVol();
  files[DIR + 'a.mtl'] = B('{material\r\n\t{diffuse "a"}\r\n}\r\n');
  files[DIR + 'fire.anm'] = B('EANM');
  files['resource/entity/-vehicle/test/common/box.vol'] = oneVol();
  return files;
}
const tmpMod = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-file-')); fs.mkdirSync(path.join(d, 'resource'), { recursive: true }); return d; };

// the real core, when it exists: open a document from files written into a temp mod
function realCore() { try { return require('../model/edit/core'); } catch (e) { if (e.code === 'MODULE_NOT_FOUND' && /edit[\\/]core/.test(e.message)) return null; throw e; } }

module.exports = function (t, assert) {
  t('edit/file: templates parse with mdl.js and build a scene', () => {
    for (const id of Object.keys(F.TEMPLATES)) {
      const b = F.blank({ path: 'entity/props/my' + id, template: id, def: true, author: 'Tester', date: '1 May 2026' });
      assert.equal(b.mdl, 'resource/entity/props/my' + id + '/my' + id + '.mdl');
      assert.equal(b.def, 'resource/entity/props/my' + id + '/my' + id + '.def');
      const buf = b.files[b.mdl], m = mdl.parse(buf);
      assert.equal(m.error, null, id + ': ' + m.error);
      assert.ok(/\r\n/.test(buf.toString('latin1')) && !/[^\r]\n/.test(buf.toString('latin1')), id + ' CRLF');
      assert.deepEqual(m.bones.map(x => x.name), F.TEMPLATES[id].bones, id + ' bones');
      assert.deepEqual(m.volumes.map(x => x.name), F.TEMPLATES[id].volumes, id + ' volumes');
      assert.ok(m.volumes.every(v => !v.orphan), id + ' volumes on bones');
      assert.equal(m.bones[0].name, 'basis');
      const sc = scene.build(m, { get: () => null });
      assert.equal(sc.bones.length, m.bones.length, id + ' scene bones');
      assert.equal(sc.volumes.length, m.volumes.length, id + ' scene volumes');
      assert.match(b.files[b.def].toString('latin1'), /\{Extension "my\w+\.mdl"\}/);
      assert.equal(F.headerInfo(buf).fields.createdBy, 'Tester');
    }
    const v = mdl.parse(F.blank({ path: 'entity/-vehicle/x', template: 'vehicle' }).files['resource/entity/-vehicle/x/x.mdl']);
    assert.equal(mdl.findBone(v, 'turret').type, 'revolute'); assert.deepEqual(mdl.findBone(v, 'gun_rot').limits, [-5, 20]);
    assert.equal(mdl.findBone(v, 'gun').path, 'basis/body/turret/gun_rot/gun');
  });

  t('edit/file: new model paths and refusals', () => {
    assert.equal(F.blank({ path: '/entity/props/box.mdl' }).mdl, 'resource/entity/props/box.mdl');
    assert.equal(F.blank({ path: 'resource\\entity\\Props\\Box\\' }).mdl, 'resource/entity/props/box/box.mdl');
    assert.throws(() => F.blank({ path: '' }), /Type where/);
    assert.throws(() => F.blank({ path: 'C:/x/entity/a' }), /not a full disk path/);
    assert.throws(() => F.blank({ path: 'entity/../../a' }), /"\.\."/);
    assert.throws(() => F.blank({ path: 'set/a' }), /under entity/);
    assert.throws(() => F.blank({ path: 'entity/props/моя' }), /character/);
    assert.throws(() => F.blank({ path: 'entity/props/con' }), /cannot be used/);
    assert.throws(() => F.blank({ path: 'entity/x', template: 'boat' }), /no template/);
    const mod = tmpMod();
    try {
      const doc = standIn(mod, fixture(), DIR + 'tank.mdl');
      fs.mkdirSync(path.join(mod, 'resource', 'entity', 'props', 'box'), { recursive: true });
      fs.writeFileSync(path.join(mod, 'resource', 'entity', 'props', 'box', 'box.mdl'), 'x');
      assert.throws(() => doc.apply('file.new', { path: 'entity/props/box' }), /already in your mod/);
      const r = doc.apply('file.new', { path: 'entity/props/crate', template: 'prop', def: true });
      assert.equal(doc.mdl, 'resource/entity/props/crate/crate.mdl');
      assert.equal(r.info.mdl, doc.mdl);
      assert.deepEqual([...doc.files.keys()].sort(), ['resource/entity/props/crate/crate.def', 'resource/entity/props/crate/crate.mdl']);
      assert.ok([...doc.files.values()].every(f => f.from === 'new' && f.dirty));
      doc.undo(); assert.equal(doc.mdl, DIR + 'tank.mdl'); assert.equal(doc.files.size, 8);
    } finally { fs.rmSync(mod, { recursive: true, force: true }); }
  });

  t('edit/file: save as renames files and the names inside', () => {
    const doc = standIn(null, fixture(), DIR + 'tank.mdl');
    const r = doc.apply('file.saveAs', { name: 'Tank2' });
    const ND = 'resource/entity/-vehicle/test/tank2/';
    assert.equal(doc.mdl, ND + 'tank2.mdl');
    assert.deepEqual([...doc.files.keys()].sort(), [ND + 'a.mtl', ND + 'fire.anm', ND + 'tank2.def', ND + 'tank2.mdl', ND + 'tank2.ply', ND + 'tank2__hull.vol', ND + 'turret.ply', 'resource/entity/-vehicle/test/common/box.vol'].sort());
    const text = doc.files.get(ND + 'tank2.mdl').bytes.toString('latin1');
    assert.match(text, /\{VolumeView "tank2\.ply"\}/); assert.match(text, /\{VolumeView "turret\.ply"\}/);
    assert.match(text, /\{Polyhedron "tank2__hull\.vol"\}/);
    assert.match(text, /\{Polyhedron "\.\.\/common\/box\.vol"\}/, 'same depth: relative name to a shared file still resolves, kept');
    assert.match(text, /\{Weird 1 2\}/); assert.match(text, /^; comment before\r\n;Model created by: Someone\r\n/);
    assert.match(doc.files.get(ND + 'tank2.def').bytes.toString('latin1'), /\{Extension "tank2\.mdl"\}/);
    assert.ok(doc.files.get(ND + 'tank2.ply').bytes.equals(onePly()), 'binary files carried byte for byte');
    assert.equal(r.info.renamed.length, 7);
    const m = mdl.parse(doc.files.get(ND + 'tank2.mdl').bytes); assert.equal(m.error, null);
    // into a deeper folder: the shared file is named from the resource root
    const doc2 = standIn(null, fixture(), DIR + 'tank.mdl');
    doc2.apply('file.saveAs', { name: 'tank3', folder: 'entity/-vehicle/mine/deep/tank3' });
    const t3 = doc2.files.get('resource/entity/-vehicle/mine/deep/tank3/tank3.mdl').bytes.toString('latin1');
    assert.match(t3, /\{Polyhedron "\/entity\/-vehicle\/test\/common\/box\.vol"\}/);
    assert.match(t3, /\{VolumeView "tank3\.ply"\}/);
    // copy plan: same result, document unchanged
    const doc3 = standIn(null, fixture(), DIR + 'tank.mdl');
    const plan = doc3.state('file.copyPlan', { name: 'copy1' });
    assert.equal(plan.mdl, 'resource/entity/-vehicle/test/copy1/copy1.mdl');
    assert.equal(doc3.mdl, DIR + 'tank.mdl'); assert.equal(doc3.rev, 0);
    assert.match(Buffer.from(plan.files.find(f => f.rel.endsWith('copy1.mdl')).data, 'base64').toString('latin1'), /"copy1\.ply"/);
  });

  t('edit/file: save as refusals', () => {
    const mod = tmpMod();
    try {
      const doc = standIn(mod, fixture(), DIR + 'tank.mdl');
      assert.throws(() => doc.apply('file.saveAs', { name: '' }), /Type the new name/);
      assert.throws(() => doc.apply('file.saveAs', { name: 'tank' }), /it has now/);
      assert.throws(() => doc.apply('file.saveAs', { name: 'a b' }), /latin letters/);
      assert.throws(() => doc.apply('file.saveAs', { name: 'x', folder: '../../outside' }), /"\.\."/);
      assert.throws(() => doc.apply('file.saveAs', { name: 'x', folder: 'D:/elsewhere' }), /not a full disk path|character/);
      const d = path.join(mod, 'resource', 'entity', '-vehicle', 'test', 'taken'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'taken.mdl'), 'x');
      assert.throws(() => doc.apply('file.saveAs', { name: 'taken' }), /already has/);
      // clash inside the document: a file of the target name that is not moving
      const files = fixture(); files['resource/entity/-vehicle/test/other/other.mdl'] = B('{Skeleton {bone "a"}}');
      const doc2 = standIn(null, files, DIR + 'tank.mdl');
      assert.throws(() => doc2.apply('file.saveAs', { name: 'other' }), /already has a file/);
      assert.equal(doc.rev, 0);
    } finally { fs.rmSync(mod, { recursive: true, force: true }); }
  });

  t('edit/file: import, remove, revert', () => {
    const doc = standIn(null, fixture(), DIR + 'tank.mdl');
    const r = doc.apply('file.import', { rel: 'entity/-vehicle/test/tank/gun.ply', data: onePly().toString('base64') });
    assert.equal(r.info.ref, 'gun.ply'); assert.equal(doc.files.get(DIR + 'gun.ply').from, 'new');
    assert.throws(() => doc.apply('file.import', { rel: DIR + 'gun.ply', data: onePly().toString('base64') }), /replace/);
    doc.apply('file.import', { rel: DIR + 'gun.ply', bytes: onePly(), replace: true });
    assert.throws(() => doc.apply('file.import', { rel: DIR + 'bad.ply', bytes: B('NOPE') }), /cannot be read/);
    assert.throws(() => doc.apply('file.import', { rel: DIR + 'x.dds', bytes: B('DDS ') }), /Only \.ply/);
    assert.throws(() => doc.apply('file.import', { rel: '../x.ply', bytes: onePly() }), /"\.\."/);
    assert.equal(doc.apply('file.import', { rel: 'entity/shared/w.mtl', bytes: B('{material}') }).info.ref, '/entity/shared/w.mtl');
    const rm = doc.apply('file.remove', { rel: DIR + 'turret.ply' });
    assert.deepEqual(rm.info.refs, [15]); assert.ok(!doc.files.has(DIR + 'turret.ply'));
    assert.throws(() => doc.apply('file.remove', { rel: DIR + 'tank.mdl' }), /cannot be removed/);
    assert.throws(() => doc.apply('file.remove', { rel: DIR + 'nope.ply' }), /not part/);
    const list = doc.state('file.list');
    assert.equal(list.files[0].kind, 'mdl');
    assert.deepEqual(list.files.filter(f => f.from === 'new').map(f => f.rel).sort(), [DIR + 'gun.ply', 'resource/entity/shared/w.mtl']);
    assert.ok(list.files.find(f => f.rel === DIR + 'tank.ply').named && !list.files.find(f => f.rel === DIR + 'gun.ply').named);
    // revert: change the mdl, then revert everything: new files leave, the mdl comes back
    doc.apply('file.stamp', { author: 'Me', date: 'today' });
    assert.ok(doc.files.get(DIR + 'tank.mdl').dirty);
    doc.apply('file.revert', {});
    assert.ok(!doc.files.get(DIR + 'tank.mdl').dirty); assert.ok(!doc.files.has(DIR + 'gun.ply'));
    assert.throws(() => doc.apply('file.revert', {}), /Nothing has changed/);
  });

  t('edit/file: header stamp keeps other comments; text view; info', () => {
    const doc = standIn(null, fixture(), DIR + 'tank.mdl');
    assert.throws(() => doc.apply('file.stamp', { author: '' }), /nickname/);
    doc.apply('file.stamp', { author: 'Новик', date: 'Monday 1 June 2026 10:00:00' });
    doc.apply('file.stamp', { author: 'Новик', date: 'Tuesday 2 June 2026 10:00:00' });
    const buf = doc.files.get(DIR + 'tank.mdl').bytes, s = buf.toString('utf8');
    assert.ok(s.startsWith('; comment before\r\n;Model created by: Someone\r\n;Model create/rebuild by: Новик\r\n;Last build date: Tuesday 2 June 2026 10:00:00\r\n{Skeleton'), s.slice(0, 160));
    assert.ok(buf.subarray(buf.indexOf('{Skeleton')).equals(B(MDL).subarray(B(MDL).indexOf('{Skeleton'))), 'body untouched');
    const info = doc.state('file.info');
    assert.equal(info.fields.createdBy, 'Someone'); assert.equal(info.fields.rebuildBy, 'Новик'); assert.equal(info.fields.lastBuild, 'Tuesday 2 June 2026 10:00:00');
    const tx = doc.state('file.text', { bone: 'turret' });
    assert.equal(tx.line, 11); assert.equal(tx.text.split(/\r?\n/)[tx.line - 1].trim(), '{bone "turret"');
    assert.equal(doc.state('file.text', { volume: 'basis/tank/hull' }).line, 23);
    assert.throws(() => doc.state('file.text', { rel: DIR + 'tank.ply' }), /not text/);
    // a cp1251 comment shows as Cyrillic in the text view, bytes kept
    const cp = Buffer.concat([B(';'), Buffer.from([0xCF, 0xF0, 0xE8]), B('\r\n{Skeleton {bone "a"}}\r\n')]);
    const d2 = standIn(null, { 'resource/entity/a/a.mdl': cp }, 'resource/entity/a/a.mdl');
    assert.ok(d2.state('file.text', {}).text.startsWith(';При'));
    d2.apply('file.stamp', { author: 'x', date: 'd' });
    assert.ok(d2.files.get('resource/entity/a/a.mdl').bytes.subarray(0, 6).equals(cp.subarray(0, 6)), 'cp1251 comment bytes kept');
  });

  t('edit/file: unknown keywords survive every op (FILE-13)', () => {
    const doc = standIn(null, fixture(), DIR + 'tank.mdl');
    doc.apply('file.stamp', { author: 'a', date: 'b' });
    doc.apply('file.fullMatrices', {});
    doc.apply('file.saveAs', { name: 'kept' });
    const s = doc.files.get('resource/entity/-vehicle/test/kept/kept.mdl').bytes.toString('latin1');
    assert.match(s, /\{Weird 1 2\}/); assert.match(s, /\{animation \{sequence "fire"\}\}/);
  });

  t('edit/file: full matrices (GEMI)', () => {
    const doc = standIn(null, fixture(), DIR + 'tank.mdl');
    const before = mdl.parse(doc.files.get(DIR + 'tank.mdl').bytes);
    const r = doc.apply('file.fullMatrices', {});
    const after = mdl.parse(doc.files.get(DIR + 'tank.mdl').bytes);
    assert.equal(after.error, null);
    for (const b of after.bones) { assert.deepEqual(b.form, ['Matrix34'], b.path); assert.deepEqual(b.matrix.map(Math.fround), mdl.findBone(before, b.path).matrix.map(Math.fround), b.path); }
    for (const v of after.volumes) assert.deepEqual(v.form, ['Matrix34'], v.id);
    assert.equal(r.info.done.length, before.bones.length + before.volumes.length);
    assert.deepEqual(doc.apply('file.fullMatrices', {}).changed, [], 'second run changes nothing');
  });

  t('edit/file: bone clipboard copy, paste with renames, cut', () => {
    const doc = standIn(null, fixture(), DIR + 'tank.mdl');
    const c = doc.state('file.clipCopy', { bone: 'turret' });
    assert.ok(c.text.startsWith('{bone "turret"') && c.text.endsWith('}')); assert.deepEqual(c.names, ['turret']);
    const p = doc.apply('file.clipPaste', { parent: 'basis', text: c.text });
    assert.deepEqual(p.info.renamed, [['turret', 'turret_2']]);
    let m = mdl.parse(doc.files.get(DIR + 'tank.mdl').bytes);
    assert.equal(m.error, null); assert.ok(mdl.findBone(m, 'basis/turret_2'), 'pasted under basis');
    assert.deepEqual(mdl.findBone(m, 'basis/turret_2').matrix, mdl.findBone(m, 'basis/tank/turret').matrix);
    assert.throws(() => doc.apply('file.clipPaste', { parent: 'basis', text: '{Volume "x"}' }), /one bone/);
    assert.throws(() => doc.apply('file.clipPaste', { parent: 'nobone', text: c.text }), /Pick the bone/);
    const cut = doc.apply('file.clipCut', { bone: 'tank' });
    assert.deepEqual(cut.info.orphans.sort(), ['basis/tank/hull', 'basis/tank/shared']);
    m = mdl.parse(doc.files.get(DIR + 'tank.mdl').bytes);
    assert.ok(!mdl.findBone(m, 'tank') && mdl.findBone(m, 'turret_2'));
    assert.throws(() => doc.apply('file.clipCut', { bone: 'basis' }), /root bone/);
    // paste into an empty bone (a new model)
    const d2 = standIn(null, F.blank({ path: 'entity/a' }).files, 'resource/entity/a/a.mdl');
    d2.apply('file.clipPaste', { parent: 'basis', text: cut.info.text });
    const m2 = mdl.parse(d2.files.get('resource/entity/a/a.mdl').bytes);
    assert.equal(m2.error, null); assert.deepEqual(m2.bones.map(b => b.path), ['basis', 'basis/tank', 'basis/tank/turret']);
  });

  t('edit/file: check before save names losses and broken names', () => {
    const files = fixture();
    const doc = standIn(null, files, DIR + 'tank.mdl');
    assert.deepEqual(doc.state('file.check').findings.map(f => f.code), ['ANM_ERROR'], 'fixture: only the 4-byte anm');
    const f = doc.files.get(DIR + 'tank.mdl');
    f.bytes = B(MDL.replace('\t\t\t{Weird 1 2}\r\n', '').replace('{VolumeView "turret.ply"}', '{VolumeView "C:/models/turret.ply"}').replace('; comment before\r\n', '')
      .replace('{Bone "tank"}\r\n}\r\n{Volume "shared"', '{Bone "nobody"}\r\n}\r\n{Volume "shared"')); f.dirty = true;
    const codes = doc.state('file.check').findings.map(x => x.code).sort();
    for (const c of ['MDL_KEYWORD_LOST', 'MDL_COMMENTS_DROPPED', 'REF_DISK_PATH', 'VOLUME_NO_BONE']) assert.ok(codes.includes(c), c + ' in ' + codes);
    const refs = doc.state('file.refs').refs;
    assert.ok(refs.find(r => r.implicit && r.text === 'fire.anm' && r.inDoc));
  });

  t('edit/file: pack, templates, list from', () => {
    const doc = standIn(null, fixture(), DIR + 'tank.mdl');
    const p = doc.state('file.pack', {});
    assert.equal(p.files.length, 8); assert.ok(Buffer.from(p.files[0].data, 'base64').length > 0);
    assert.equal(doc.state('file.pack', { changed: true }).files.length, 0);
    assert.deepEqual(doc.state('file.templates').map(x => x.id), ['empty', 'prop', 'vehicle']);
    // zip of a pack lists the right files (the export route writes the same list)
    const z = path.join(os.tmpdir(), 'edit-file-' + process.pid + '.zip');
    try { fs.writeFileSync(z, zip(p.files.map(x => [x.rel, Buffer.from(x.data, 'base64'), true]))); assert.deepEqual(pak.list(z).map(e => e.name).sort(), p.files.map(x => x.rel).sort()); }
    finally { fs.rmSync(z, { force: true }); }
  });

  // the real core, when it is there: the same op through core.open on a temp mod (contract fit)
  const core = realCore();
  if (core) t('edit/file: through the real core (tools/lib/model/edit/core.js)', () => {
    const mod = tmpMod();
    try {
      for (const [rel, b] of Object.entries(fixture())) { const p = path.join(mod, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, b); }
      const doc = core.open({ mod, mdl: path.join(mod, ...(DIR + 'tank.mdl').split('/')) });
      assert.ok(doc && doc.files instanceof Map, 'core.open gives a document');
      const r = doc.apply('file.stamp', { author: 'Core', date: 'd' });
      assert.ok(r.changed.length === 1 && /tank\.mdl$/.test(r.changed[0]), JSON.stringify(r.changed));
      assert.match(doc.files.get(r.changed[0]).bytes.toString('latin1'), /;Model create\/rebuild by: Core/);
      doc.undo();
      assert.doesNotMatch(doc.files.get(r.changed[0]).bytes.toString('latin1'), /rebuild by: Core/);
      if (core.close) core.close(doc.id);
    } finally { fs.rmSync(mod, { recursive: true, force: true }); }
  });
};

if (require.main === module) {
  const assert = require('assert'); let n = 0;
  const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL ' + name + ': ' + (e && e.stack || e)); process.exitCode = 1; } };
  module.exports(t, assert);
  console.log(`${n} passed`);
}
