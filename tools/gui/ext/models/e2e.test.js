// models e2e: one modder's run through the built-in model editor, on the page's own routes (sub/file.server.js, sub/doc.server.js)
// in a temp mod next to an empty fake game folder: a new model from the vehicle template; a bone and a box volume; a made-up OBJ cube
// imported onto the bone with a material; a new animation with 2 keys and an interpolation, set as a sequence; save dry, then real;
// close and reopen from disk; the states match and the undo history is empty; every file parses with tools/lib/model; scene.build
// works on the files as written; and tools/soedit/check.js loss checks find nothing lost (template as made -> model as saved).
// No game, no browser. usage: node e2e.test.js <scratch dir>     last line: PASS models e2e (N)
// Author: Imperator_Aug (ARSENAL, ia-ae25fb12)
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const ext = require('./index');
const lib = p => require('../../../lib/model/' + p);
const mdlLib = lib('mdl'), plyLib = lib('ply'), volLib = lib('vol'), anmLib = lib('anm'), sceneLib = lib('scene');
const check = require('../../../soedit/check');

const scratch = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'models-e2e'));
require('../../../lib/testscratch').guard(scratch);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(scratch, { recursive: true, force: true }); fs.mkdirSync(scratch, { recursive: true });
const game = path.join(scratch, 'game'), mod = path.join(scratch, 'mymod');
for (const d of [path.join(game, 'resource'), path.join(game, 'mods'), mod]) fs.mkdirSync(d, { recursive: true });

const ctx = { game: () => game, tmpRoot: path.join(scratch, 'tmp'), allowLaunch: false,
  runTool: async () => { throw new Error('no tool runs in this test'); } };
const route = (url, body) => { const f = ext.routes['POST ' + url]; assert.ok(f, 'route ' + url); return Promise.resolve().then(() => f(url, body, ctx)); };
const doc = (verb, body) => route('/api/x/models/doc/' + verb, body);
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };

const DIR = 'resource/entity/tank/e2etank/', MDL = DIR + 'e2etank.mdl';
const disk = rel => path.join(mod, ...rel.split('/'));
// a unit cube, 8 corners, 12 triangles, one material group
const OBJ = ['o cube', 'mtllib cube.mtl', 'v 0 0 0', 'v 1 0 0', 'v 1 1 0', 'v 0 1 0', 'v 0 0 1', 'v 1 0 1', 'v 1 1 1', 'v 0 1 1', 'usemtl steel',
  'f 1 3 2', 'f 1 4 3', 'f 5 6 7', 'f 5 7 8', 'f 1 2 6', 'f 1 6 5', 'f 2 3 7', 'f 2 7 6', 'f 3 4 8', 'f 3 8 7', 'f 4 1 5', 'f 4 5 8', ''].join('\n');
const MTL = 'newmtl steel\nKd 0.5 0.5 0.5\nmap_Kd steel.dds\n';

(async () => {
  // ---------- new model from the vehicle template ----------
  const made = await route('/api/x/models/file/new', { mod, path: 'entity/tank/e2etank', template: 'vehicle', def: true });
  assert.strictEqual(made.mdl, MDL); assert.ok(fs.existsSync(disk(MDL)) && fs.existsSync(disk(DIR + 'e2etank.def')));
  const asMade = fs.readFileSync(disk(MDL));
  assert.ok(/\r\n/.test(asMade.toString('latin1')) && !/[^\r]\n/.test(asMade.toString('latin1')), 'CRLF');
  let j = await doc('open', { mod, mdl: MDL });
  const id = j.doc;
  assert.ok(id && j.mdl === MDL && !j.dirty && !j.canUndo);
  const bones0 = mdlLib.parse(asMade).bones.map(b => b.name);
  for (const b of ['basis', 'body', 'turret', 'gun_rot', 'gun']) assert.ok(bones0.includes(b), 'template bone ' + b);
  ok('new model from the vehicle template written into the mod (CRLF, .def beside it) and opened as a document');

  // ---------- a bone and a box volume ----------
  const op = async (name, args) => { const r = await doc('op', { doc: id, op: name, args }); assert.ok(r.dirty && r.canUndo, name); return r; };
  let r = await op('bone.add', { name: 'hatch', parent: 'turret', position: [5, 0, 15] });
  assert.ok(/turret\/hatch$/.test(r.info.bone), r.info.bone);
  r = await op('vol.add', { bone: 'hatch', name: 'hatch', kind: 'box', size: [10, 10, 2] });
  const vl = await doc('state', { doc: id, what: 'vol.list' });
  assert.ok(JSON.stringify(vl).includes('"hatch"'), 'the new volume is listed');
  ok('bone "hatch" under the turret, box volume on it');

  // ---------- a made-up OBJ cube on the bone, a material ----------
  r = await op('ply.import', { obj: OBJ, mtl: [{ name: 'cube.mtl', text: MTL }], name: 'hatch', bone: 'hatch', units: 'units' });
  assert.strictEqual(r.info.rel, DIR + 'hatch.ply'); assert.strictEqual(r.info.vertices > 0 && r.info.triangles, 12);
  r = await op('mat.set', { rel: DIR + 'hatch.ply', part: 'all', name: 'hatch_paint', create: true });
  assert.ok(r.files.some(f => f.rel === DIR + 'hatch_paint.mtl'), 'the material file joins the document');
  ok('OBJ cube imported onto the bone (12 triangles), material hatch_paint.mtl made and set');

  // ---------- a new animation: 2 keys, an interpolation, a sequence ----------
  const ANM = DIR + 'hatch_open.anm';
  await op('anm.new', { rel: ANM, frames: 10, sequence: true });
  await op('anm.key.set', { rel: ANM, bone: 'hatch', frame: 0, pos: [5, 0, 15], rot: [0, 0, 0] });
  await op('anm.key.set', { rel: ANM, bone: 'hatch', frame: 9, pos: [5, 0, 15], rot: [0, -80, 0] });
  await op('anm.interpolate', { rel: ANM, bone: 'hatch', from: 0, to: 9, ease: 'in' });
  await op('bone.seq.add', { bone: 'turret', name: 'hatch_swing', file: 'hatch_open.anm' });
  const seqs = JSON.stringify(await doc('state', { doc: id, what: 'tree.sequences' }));
  assert.ok(seqs.includes('hatch_open'), 'skeleton sequence listed');
  const tb = JSON.stringify(await doc('state', { doc: id, what: 'bone.get', query: { bone: 'turret' } }));
  assert.ok(tb.includes('hatch_swing'), 'turret sequence listed');
  ok('animation hatch_open.anm (10 frames, keys at 0 and 9, eased between) with a sequence on the skeleton and one on the turret');

  // ---------- save dry, then real ----------
  const before = fs.readFileSync(disk(MDL));
  const dry = await doc('save', { doc: id, dry: true });
  assert.ok(!dry.written && dry.refused.length === 0 && dry.dirty, 'dry run writes nothing');
  assert.ok(fs.readFileSync(disk(MDL)).equals(before) && !fs.existsSync(disk(ANM)), 'disk unchanged after the dry run');
  const rels = dry.writes.map(w => w.rel).sort();
  for (const f of [MDL, DIR + 'hatch.ply', DIR + 'hatch_paint.mtl', ANM]) assert.ok(rels.includes(f), 'dry run lists ' + f);
  const LOSS = /_LOST$|_DROPPED$|SUBM_TO_MESH|VERSION_CHANGED/;
  const lost = c => ((c && c.findings) || []).filter(f => LOSS.test(f.code));
  assert.deepStrictEqual(lost(dry.check), [], 'the save check finds nothing lost');
  const real = await doc('save', { doc: id, backup: true });
  assert.ok(real.written && !real.dirty && real.refused.length === 0);
  for (const f of rels) assert.ok(fs.existsSync(disk(f)), 'written ' + f);
  for (const f of rels.filter(x => /\.(mdl|mtl|def)$/.test(x))) assert.ok(!/[^\r]\n/.test(fs.readFileSync(disk(f), 'latin1')), 'CRLF ' + f);
  assert.ok(!fs.readdirSync(path.join(mod, ...DIR.split('/'))).some(f => /\.tmp|~$/.test(f)), 'no temp files left');
  ok('save dry (nothing on disk, ' + rels.length + ' files listed, no losses), then real (files written, CRLF text, no temp files)');

  // ---------- reopen from disk: same states, empty undo history ----------
  const STATES = ['tree.list', 'tree.sequences', 'vol.list', 'ply.list', 'mat.list', 'anm.list', 'file.list'];
  const strip = v => JSON.parse(JSON.stringify(v, (k, x) => (k === 'doc' || k === 'rev' || k === 'dirty' || k === 'from' || k === 'size' || k === 'was' ? undefined : x)));
  const snap = async d => { const o = {}; for (const s of STATES) o[s] = strip(await doc('state', { doc: d, what: s })); return o; };
  const A = await snap(id);
  const bytesA = {}; for (const f of rels) bytesA[f] = fs.readFileSync(disk(f));
  assert.deepStrictEqual(await doc('close', { doc: id }), { closed: true });
  j = await doc('open', { mod, mdl: MDL });
  const id2 = j.doc, d2has = rel => j.files.some(f => f.rel === rel);
  assert.ok(id2 && !j.dirty && !j.canUndo && !j.canRedo, 'reopened clean');
  const B = await snap(id2);
  // the import made steel.mtl for the OBJ's material; mat.set then pointed the mesh at hatch_paint.mtl. steel.mtl is still saved (a new
  // file of the document) but nothing names it, so a reopened document does not load it: the one expected difference
  const ORPHAN = DIR + 'steel.mtl';
  assert.ok(fs.existsSync(disk(ORPHAN)) && !d2has(ORPHAN), 'the unused material is on disk, not in the reopened document');
  const drop = v => JSON.parse(JSON.stringify(v), (k, x) => (Array.isArray(x) ? x.filter(e => !(e && (e.rel === ORPHAN || e.material === ORPHAN || e === ORPHAN))) : x));
  for (const s of STATES) A[s] = drop(A[s]);
  for (const s of STATES) assert.deepStrictEqual(B[s], A[s], 'state ' + s + ' after reopening');
  const core = require('../../../lib/model/edit/core'), d2 = core.get(id2);
  assert.deepStrictEqual(d2.history(), { undo: [], redo: [] }, 'undo history empty');
  for (const f of rels) if (d2.has(f)) assert.ok(d2.bytes(f).equals(bytesA[f]), 'same bytes ' + f);
  ok('closed and reopened from disk: ' + STATES.length + ' states match, the bytes match, undo history empty');

  // ---------- lib parsers on the files as written; scene.build ----------
  const m = mdlLib.parse(fs.readFileSync(disk(MDL)));
  assert.ok(!m.error, m.error);
  assert.ok(m.bones.some(b => b.name === 'hatch'), 'hatch bone parsed');
  assert.ok(m.volumes.some(v => v.name === 'hatch'), 'hatch volume parsed');
  const p = plyLib.parse(fs.readFileSync(disk(DIR + 'hatch.ply')));
  assert.ok(!p.error && p.parts.length === 1 && p.parts[0].material === 'hatch_paint.mtl', 'ply parsed with the material');
  const a = anmLib.parse(fs.readFileSync(disk(ANM)));
  assert.ok(!a.error && a.frames === 10 && a.bones.includes('hatch'), 'anm parsed');
  const mtl = mdlLib.parse(fs.readFileSync(disk(DIR + 'hatch_paint.mtl')));
  assert.ok(!mtl.error, 'mtl parsed');
  for (const f of rels.filter(x => x.endsWith('.vol'))) assert.ok(!volLib.parse(fs.readFileSync(disk(f))).error, 'vol ' + f);
  const files = { get: name => { const k = path.join(mod, ...DIR.split('/'), ...String(name).replace(/\\/g, '/').split('/')); return fs.existsSync(k) ? fs.readFileSync(k) : null; } };
  const sc = sceneLib.build(m, files);
  assert.ok(sc && !sc.error, 'scene built');
  const json = JSON.stringify(sceneLib.toJSON(sc));
  assert.ok(json.includes('hatch'), 'the scene has the hatch');
  const ds = await doc('scene', { doc: id2, anm: ANM, frame: 5 });
  assert.ok(ds && ds.frames === 10 && ds.frame === 5, 'document scene posed at frame 5');
  ok('mdl, ply, anm, mtl parse with tools/lib/model; scene.build and the posed document scene work');

  // ---------- tools/soedit/check.js loss checks ----------
  const finds = [], add = (line, code, msg) => finds.push(code + ' ' + msg);
  check.mdlLoss(asMade, fs.readFileSync(disk(MDL)), add);
  for (const f of rels) {
    const b = fs.readFileSync(disk(f)), k = path.extname(f).slice(1);
    if (k === 'mdl') check.mdlLoss(b, d2.bytes(f), add);
    if (k === 'ply') check.plyLoss(b, d2.bytes(f), add);
    if (k === 'anm') check.anmLoss(b, d2.bytes(f), add);
  }
  assert.deepStrictEqual(finds, [], 'loss checks');
  assert.ok(check.commentLines(fs.readFileSync(disk(MDL), 'latin1')) >= check.commentLines(asMade.toString('latin1')), 'comment lines kept');
  await doc('close', { doc: id2 });
  ok('tools/soedit/check.js mdlLoss, plyLoss, anmLoss: nothing lost from the template to the saved model or across reopening');

  console.log('PASS models e2e (' + n + ')');
})().catch(e => { console.error(e && e.stack || e); console.log('FAIL models e2e'); process.exit(1); });
