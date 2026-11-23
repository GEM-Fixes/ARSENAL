// lib/model/edit/core.js unit tests: a synthetic model in a fake game folder (mdl, ply, vol, anm in resource/entity/et/) with one file
// already in a temp mod folder; fake ops registered here. open, read cache, apply, undo, redo, untouched files byte-identical, a failed
// or bad op changes nothing, scene from the current bytes, save dry, save for real (a game file lands in the mod at the same rel path,
// the game is never written), file creation and removal, refusals (mod = the game, outside the mod, changed on disk), loss check,
// registry cap, domain module problems. Run alone: node tools/lib/test/model-edit-core.test.js (or from test.js: require(..)(t, assert)).
// Author: Imperator_Aug (ARSENAL, ia-c602ad0a)
'use strict';
module.exports = (t, assert) => {
  const fs = require('fs'), path = require('path'), os = require('os');
  const core = require('../model/edit/core'), mdlLib = require('../model/mdl'), volLib = require('../model/vol');
  const R = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-core-'));
  const game = path.join(R, 'game'), mod = path.join(R, 'mymod'), gdir = path.join(game, 'resource', 'entity', 'et');
  fs.mkdirSync(gdir, { recursive: true }); fs.mkdirSync(path.join(game, 'mods'), { recursive: true });
  fs.mkdirSync(path.join(mod, 'resource', 'entity', 'et'), { recursive: true });
  const B = (...a) => Buffer.concat(a.map(x => (Buffer.isBuffer(x) ? x : Buffer.from(x, 'latin1'))));
  const i32 = (...a) => Buffer.concat(a.map(v => { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; }));
  const u32 = v => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; };
  const u16 = (...a) => Buffer.concat(a.map(v => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; }));
  const f32 = (...a) => Buffer.concat(a.map(v => { const b = Buffer.alloc(4); b.writeFloatLE(v); return b; }));
  const s8 = x => B(Buffer.from([x.length]), x);
  const v112 = (x, y, z, u, v) => f32(x, y, z, 0, 0, 1, u, v);
  const PLY = B('EPLY', 'BNDS', f32(0, 0, 0, 20, 40, 10), 'MESH', u32(0x112), i32(0, 2), u32(0x004), s8('tex/a.dds'),
    'VERT', i32(4), u16(32, 7), v112(0, 0, 0, 0, 0), v112(20, 0, 0, 1, 0), v112(20, 40, 0, 1, 1), v112(0, 40, 10, 0, 1), 'INDX', i32(6), u16(0, 1, 2, 0, 2, 3));
  const mat = z => B('MATR', f32(1, 0, 0, 0, 1, 0, 0, 0, 1, 20, 0, z));
  const ANM = B('EANM', i32(6), 'FRMS', i32(3), 'BMAP', i32(1), i32(6), 'turret', 'FRMN', i32(0), 'BONE', i32(0), mat(5), 'FRMN', i32(2), 'BONE', i32(0), mat(25));
  const VOL = volLib.write(volLib.fromBox([4, 4, 4]));
  const MDL = Buffer.from(['; test model, comment kept', '{Skeleton', '\t{bone "body"', '\t\t{Position 0\t0\t10}', '\t\t{VolumeView "body.ply"}', '\t\t{bone "turret"',
    '\t\t\t{Position 20\t0\t5}', '\t\t}', '\t}', '\t{animation {sequence "turn" {file "turn.anm"}}}', '}', '{Volume "armor"', '\t{Box 10 6 4}', '\t{Bone "turret"}', '}',
    '{Volume "hull"', '\t{Polyhedron "hull.vol"}', '\t{Bone "body"}', '}', ''].join('\r\n'), 'latin1');
  const MODPLY = B(PLY);   // the mod's own copy of body.ply (same bytes, but it is the mod's)
  fs.writeFileSync(path.join(gdir, 'et.mdl'), MDL); fs.writeFileSync(path.join(gdir, 'body.ply'), PLY);
  fs.writeFileSync(path.join(gdir, 'turn.anm'), ANM); fs.writeFileSync(path.join(gdir, 'hull.vol'), VOL);
  const modPly = path.join(mod, 'resource', 'entity', 'et', 'body.ply'); fs.writeFileSync(modPly, MODPLY);
  const K = 'resource/entity/et/', MK = K + 'et.mdl';
  const gameSnap = () => fs.readdirSync(game, { recursive: true }).sort().map(f => { const p = path.join(game, f); return fs.statSync(p).isFile() ? f + ':' + fs.readFileSync(p).toString('hex') : f; }).join('|');
  const G0 = gameSnap();

  // fake domain ops
  core.register('test.size', { apply(doc, a) { return { files: { [doc.mdl]: mdlLib.edit(doc.read(doc.mdl), [{ op: 'setVolume', volume: 'armor', size: a.size }]) }, info: { size: a.size } }; },
    check(doc, a) { return Array.isArray(a.size) && a.size.length === 3 ? null : 'Give the box three sizes.'; } });
  core.register('test.add', { apply(doc, a) { return { files: { [K + a.name]: Buffer.from(a.text || 'new') } }; } });
  core.register('test.remove', { apply(doc, a) { return { files: { [a.rel]: null } }; } });
  core.register('test.fail', { apply(doc) { doc.read(doc.mdl); throw new Error('The bone "nobody" is not in this model.'); } });
  core.register('test.half', { apply(doc) { return { files: { [doc.mdl]: Buffer.from('x'), [K + 'body.ply']: 'not a buffer' } }; } });
  core.register('test.outside', { apply() { return { files: { '../../evil.mdl': Buffer.from('x') } }; } });
  core.register('test.same', { apply(doc) { return { files: { [doc.mdl]: Buffer.from(doc.bytes(doc.mdl)) } }; } });
  core.register('test.nocomment', { apply(doc) { return { files: { [doc.mdl]: Buffer.from(doc.bytes(doc.mdl).toString('latin1').replace(/^;[^\n]*\n/, ''), 'latin1') } }; } });
  core.registerState('test.count', doc => ({ files: doc.files.size, rev: doc.rev }));

  let doc;
  t('edit core: open collects the mdl and every file it uses, mod over game', () => {
    doc = core.open({ mod, mdl: MK, game });
    assert.strictEqual(doc.mdl, MK);
    const kinds = {}; for (const e of doc.files.values()) kinds[e.rel] = e.kind + ':' + e.from;
    assert.deepStrictEqual(kinds, { [MK]: 'mdl:game', [K + 'body.ply']: 'ply:mod', [K + 'turn.anm']: 'anm:game', [K + 'hull.vol']: 'vol:game' });
    assert.ok(doc.files.get(K + 'body.ply').bytes.equals(MODPLY) && !doc.dirty() && !doc.canUndo && !doc.canRedo && doc.rev === 0);
    assert.strictEqual(core.get(doc.id), doc);
    assert.ok(core.ops().includes('test.size') && core.states().includes('test.count'));
    assert.deepStrictEqual(doc.state('test.count'), { files: 4, rev: 0 });
  });
  t('edit core: read gives the lib parse, cached until the bytes change', () => {
    const m = doc.read(MK);
    assert.ok(m.volumes.find(v => v.name === 'armor') && m === doc.read(MK) && m === doc.read(MK.toUpperCase()));
    assert.ok(doc.read(K + 'turn.anm').frames === 3 && doc.read(K + 'hull.vol').vertices.length > 0 && doc.read(K + 'body.ply').parts);
    assert.strictEqual(doc.read(K + 'none.ply'), null);
  });
  t('edit core: apply one op = one step, untouched files stay byte-identical', () => {
    const before = new Map([...doc.files].map(([k, e]) => [k, e.bytes]));
    const r = doc.apply('test.size', { size: [12, 6, 4] });
    assert.deepStrictEqual(r.changed, [MK]); assert.strictEqual(r.rev, 1); assert.deepStrictEqual(r.info, { size: [12, 6, 4] });
    assert.deepStrictEqual(doc.read(MK).volumes.find(v => v.name === 'armor').size, [12, 6, 4]);
    for (const [k, b] of before) if (k !== MK) assert.ok(doc.files.get(k).bytes === b && !doc.files.get(k).dirty, k);
    assert.ok(doc.files.get(MK).dirty && doc.dirty() && doc.canUndo && !doc.canRedo);
    assert.ok(doc.files.get(MK).bytes.toString('latin1').startsWith('; test model, comment kept'), 'comment kept by the splice');
  });
  t('edit core: scene is built from the current bytes', () => {
    const s = doc.scene({});
    assert.strictEqual(s.format, 'scene/1'); assert.strictEqual(s.rev, 1);
    assert.deepStrictEqual(s.volumes.find(v => v.name === 'armor').size, [12, 6, 4]);
    assert.ok(s.volumes.find(v => v.name === 'hull').triangleCount > 0 && s.meshes.length === 1 && s.meshes[0].parts.length === 1);
    const p = doc.scene({ anm: 'turn.anm', frame: 1, meshes: false });
    assert.ok(p.frames === 3 && p.frame === 1 && p.anm === K + 'turn.anm' && p.meshes[0].parts.length === 0);
    assert.throws(() => doc.scene({ anm: 'nope.anm' }), /not part of this model/);
  });
  t('edit core: undo and redo', () => {
    let r = doc.undo();
    assert.deepStrictEqual(r.changed, [MK]); assert.strictEqual(r.rev, 2);
    assert.ok(doc.files.get(MK).bytes.equals(MDL) && !doc.dirty() && doc.canRedo && !doc.canUndo);
    assert.deepStrictEqual(doc.scene({}).volumes.find(v => v.name === 'armor').size, [10, 6, 4]);
    r = doc.redo(); assert.strictEqual(r.rev, 3);
    assert.deepStrictEqual(doc.read(MK).volumes.find(v => v.name === 'armor').size, [12, 6, 4]);
    assert.ok(doc.dirty() && !doc.canRedo && doc.canUndo);
    assert.deepStrictEqual(doc.history(), { undo: ['test.size'], redo: [] });
    assert.deepStrictEqual(doc.undo().rev, 4); assert.deepStrictEqual(doc.redo().rev, 5);
  });
  t('edit core: a failing, refused, bad or unknown op changes nothing', () => {
    const snap = () => [doc.rev, doc.canUndo, doc.canRedo, doc.history().undo.length, [...doc.files].map(([k, e]) => k + e.bytes.toString('hex')).join()].join('|');
    const s0 = snap();
    assert.throws(() => doc.apply('test.fail', {}), /The bone "nobody" is not in this model\./);
    assert.throws(() => doc.apply('test.size', { size: [1] }), e => /Give the box three sizes/.test(e.message) && e.code === 'CHECK');
    assert.throws(() => doc.apply('test.half', {}), /not file bytes/);
    assert.throws(() => doc.apply('test.outside', {}), /outside the mod folder/);
    assert.throws(() => doc.apply('no.such', {}), e => /no edit called "no\.such"/.test(e.message) && e.code === 'UNKNOWN_OP');
    assert.throws(() => doc.state('no.view'), /no view called "no\.view"/);
    assert.deepStrictEqual(doc.apply('test.same', {}).changed, []);
    assert.strictEqual(snap(), s0);
  });
  t('edit core: file creation and removal, with undo', () => {
    let r = doc.apply('test.add', { name: 'extra.anm', text: 'EANM' });
    assert.deepStrictEqual(r.changed, [K + 'extra.anm']);
    const e = doc.files.get(K + 'extra.anm'); assert.ok(e.from === 'new' && e.kind === 'anm' && e.dirty);
    doc.undo(); assert.ok(!doc.has(K + 'extra.anm')); doc.redo(); assert.ok(doc.has(K + 'extra.anm'));
    r = doc.apply('test.remove', { rel: K + 'hull.vol' });
    assert.ok(!doc.has(K + 'hull.vol') && doc.removed.has(K + 'hull.vol'));
    doc.undo(); assert.ok(doc.has(K + 'hull.vol') && !doc.removed.has(K + 'hull.vol') && doc.files.get(K + 'hull.vol').bytes.equals(VOL));
    doc.apply('test.remove', { rel: K + 'extra.anm' }); assert.ok(!doc.has(K + 'extra.anm') && !doc.removed.has(K + 'extra.anm'), 'a new file removed is simply gone');
    doc.undo();
    assert.ok(doc.summary().files.some(f => f.rel === K + 'extra.anm' && f.from === 'new'));
  });
  t('edit core: save dry writes nothing and lists the files', () => {
    const r = doc.save({ dry: true });
    assert.deepStrictEqual(r.writes.map(w => [w.rel, w.was]).sort(), [[K + 'et.mdl', 'new'], [K + 'extra.anm', 'new']]);
    assert.ok(!r.written && r.refused.length === 0 && r.check && Array.isArray(r.check.findings));
    assert.ok(!fs.existsSync(path.join(mod, 'resource/entity/et/et.mdl')) && !fs.existsSync(path.join(mod, 'resource/entity/et/extra.anm')));
  });
  t('edit core: save refuses a mod folder that is the game and writes nothing', () => {
    const keepMod = doc.mod; doc.mod = game;
    const r = doc.save({});
    doc.mod = keepMod;
    assert.ok(!r.written && r.refused.length >= 1 && r.refused.every(x => x.reason), JSON.stringify(r.refused));
    assert.strictEqual(gameSnap(), G0, 'game untouched');
    assert.throws(() => core.open({ mod: game, mdl: MK, game }), /game/i);
  });
  t('edit core: save for real: the game file lands in the mod at the same rel path, the rest untouched', () => {
    const plyStat = fs.statSync(modPly).mtimeMs;
    const r = doc.save({});
    assert.ok(r.written && !r.refused.length, JSON.stringify(r.refused));
    const onDisk = fs.readFileSync(path.join(mod, 'resource/entity/et/et.mdl'));
    assert.ok(onDisk.equals(doc.files.get(MK).bytes) && mdlLib.parse(onDisk).volumes.find(v => v.name === 'armor').size[0] === 12);
    assert.ok(fs.readFileSync(path.join(mod, 'resource/entity/et/extra.anm')).equals(Buffer.from('EANM')));
    assert.ok(fs.readFileSync(modPly).equals(MODPLY) && fs.statSync(modPly).mtimeMs === plyStat, 'untouched mod file not rewritten');
    assert.ok(!fs.existsSync(path.join(mod, 'resource/entity/et/turn.anm')), 'unchanged game files are not copied');
    assert.ok(!fs.readdirSync(path.join(mod, 'resource/entity/et')).some(f => /arsenal-tmp/.test(f)), 'no temp left');
    assert.strictEqual(gameSnap(), G0, 'game untouched');
    assert.ok(!doc.dirty() && doc.files.get(MK).from === 'mod');
    assert.strictEqual(doc.save({}).writes.length, 0);
  });
  t('edit core: removing a mod file moves it aside on save; a game file stays (a note)', () => {
    doc.apply('test.remove', { rel: K + 'body.ply' }); doc.apply('test.remove', { rel: K + 'turn.anm' });
    const r = doc.save({});
    assert.ok(r.written && r.removes.length === 1 && r.notes.length === 1 && /only in the game/.test(r.notes[0]));
    assert.ok(!fs.existsSync(modPly) && fs.readFileSync(path.join(mod, ...r.removes[0].to.split('/'))).equals(MODPLY));
    assert.strictEqual(gameSnap(), G0);
  });
  t('edit core: a mod file changed on disk by another program is refused unless force', () => {
    doc.apply('test.size', { size: [14, 6, 4] });
    const f = path.join(mod, 'resource/entity/et/et.mdl'), other = Buffer.from('changed elsewhere');
    fs.writeFileSync(f, other);
    let r = doc.save({});
    assert.ok(!r.written && /changed by another program/.test(r.refused[0].reason) && fs.readFileSync(f).equals(other));
    r = doc.save({ force: true }); assert.ok(r.written && fs.readFileSync(f).equals(doc.files.get(MK).bytes));
  });
  t('edit core: the save check reports what an edit lost (soedit check logic)', () => {
    doc.apply('test.nocomment', {});
    const r = doc.save({ dry: true });
    assert.ok(r.check.findings.some(x => x.code === 'MDL_COMMENTS_DROPPED' && x.file === MK), JSON.stringify(r.check));
    doc.undo();
    assert.strictEqual(doc.save({ dry: true }).writes.length, 0);
  });
  t('edit core: open by a .mdl path on disk, by an unknown model, without a mod', () => {
    const d2 = core.open({ mod, mdl: path.join(gdir, 'et.mdl'), game });
    assert.ok(d2.files.has(MK) && d2.files.get(MK).from === 'mod');
    assert.throws(() => core.open({ mod, mdl: K + 'none.mdl', game }), /not in the mod folder, the mods or the game/);
    assert.throws(() => core.open({ mdl: MK, game }), /mod folder/);
    assert.throws(() => core.open({ mod, game }), /Pick a model/);
    assert.ok(core.close(d2.id) && !core.get(d2.id));
  });
  t('edit core: registry keeps at most MAX documents, never drops unsaved work', () => {
    const ids = [];
    for (let i = 0; i < core.MAX + 2; i++) ids.push(core.open({ mod, mdl: MK, game }).id);
    assert.ok(core.list().length <= core.MAX && core.get(ids[ids.length - 1]));
    assert.ok(core.get(doc.id) || !doc.dirty(), 'a document with unsaved changes is kept');
    for (const id of ids) core.close(id);
  });
  t('edit core: domain modules load; problems are kept, not thrown', () => {
    assert.ok(Array.isArray(core.problems()));
    for (const p of core.problems()) assert.ok(p.file && p.error);
    assert.strictEqual(core.normRel('resource\\a\\..\\b.mdl'), 'resource/b.mdl');
    assert.throws(() => core.normRel('../x'), /outside/); assert.throws(() => core.normRel('C:/x'), /not a file name/);
    assert.strictEqual(core.kindOf('a/B.PLY'), 'ply'); assert.strictEqual(core.kindOf('a/b.dds'), 'other');
  });
  core.close(doc && doc.id);
  try { fs.rmSync(R, { recursive: true, force: true }); } catch (e) { /* temp */ }
};

if (require.main === module) {
  const assert = require('assert');
  let n = 0, bad = 0;
  module.exports((name, fn) => { try { fn(); n++; } catch (e) { bad++; console.log('FAIL ' + name + ': ' + (e && e.stack || e)); } }, assert);
  console.log(bad ? `${bad} failed, ${n} passed` : `${n} passed`);
  if (bad) process.exitCode = 1;
}
