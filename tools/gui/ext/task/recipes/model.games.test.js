// recipe "model" games test: node model.games.test.js <scratch>. A made-up Gates of Hell install (call_to_arms.exe, a tank model folder
// zzt with zzt.mdl, body.ply, material.mtl, zzt.def and a broken view x/zzt_x): goh is in games with no na; the model volume thickness
// is asked on every tab; in a GoH draft its lines go into the {volume} blocks of the def (own route gohvol, planned on the game def
// until the copy lands, written after it; no def: refused); values read the GoH install (the file set, the def, the wreck); a make copies
// the folder under a new name; a def volume line is a gen set row on the copied def; Write puts the copy into the mod, runs the model
// edit through the GoH reader and leaves a lib/modwrite restore point for the edited file; the game stays as it was.
// Synthetic fixtures only; nothing here is tested in game [T].
// Author: Imperator_Aug (ARSENAL, ia-goh-model)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-model-games-')));
fs.mkdirSync(scratch, { recursive: true });
const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile');
const R = require('./model.recipe'), L = require('./model.lang');
const MW = require('../../../../lib/modwrite');
const w = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok ' + name); };
const v = x => ({ src: 'value', value: x });
const WHERE = 'resource/entity/-vehicle/germany/tank_medium', DIR = WHERE + '/zzt/', MDL = DIR + 'zzt.mdl';

(async () => {
  const g = fs.mkdtempSync(path.join(scratch, 'goh-')), mods = fs.mkdtempSync(path.join(scratch, 'mods-')), mod = path.join(mods, 'model_goh');
  const G = (k, s) => w(path.join(g, ...k.split('/')), s);
  G('binaries/x64/call_to_arms.exe', 'x');
  G(MDL, '{Skeleton\r\n\t{bone "basis"\r\n\t\t{VolumeView "body.ply"}\r\n\t}\r\n}\r\n');
  G(DIR + 'body.ply', Buffer.from('EPLY\0\0material.mtl\0\0', 'latin1'));
  G(DIR + 'material.mtl', '{material bump\r\n\t{diffuse "$/model/zzt"}\r\n}\r\n');
  G(DIR + 'zzt.def', '{game_entity\r\n\t{extension "zzt.mdl"}\r\n\t{volume "body1"\r\n\t\t{thickness 30}\r\n\t}\r\n}\r\n');
  G(WHERE + '/x/zzt_x/zzt_x.mdl', '{Skeleton\r\n\t{bone "basis"\r\n\t\t{VolumeView "body.ply"}\r\n\t}\r\n}\r\n');
  G(WHERE + '/x/zzt_x/body.ply', Buffer.from('EPLY\0\0material.mtl\0\0', 'latin1'));
  w(path.join(mod, 'mod.info'), '{Mod {Name "m"}}\r\n');
  const ctx = kit.ctxFor(scratch, { game: 'goh', gohDir: g });
  const base = { id: MDL, ref: { key: MDL } };
  const mk = (answers, verb) => D.save(ctx, { id: D.newId('model'), recipe: 'model', verb: verb || 'make', game: 'goh', mod, base, answers, kept: [], state: 'open' });
  const run = d => CP.compile(ctx, d, { model: R });

  await t('games: goh in, no na row; the model volume thickness is asked on every tab', () => {
    assert.deepEqual(R.games, ['as64', 'mowas2', 'goh']); assert.ok(!R.na || !R.na.goh);
    assert.ok(!L.some(r => r[0] === 'task.model.na.goh'));
    const q = [].concat(...R.groups.map(x => x.q)).find(x => x.id === 'vol_thick');
    assert.ok(q && !(q.when && q.when.$game), JSON.stringify(q && q.when));
  });
  await t('values read the GoH install: the file set, the def and the broken view', async () => {
    const x = await R.values(Object.assign({}, ctx, { mod, task: { id: 'goh', kind: 'goh', dir: g } }), base, { game: 'goh', verb: 'make' });
    assert.equal(x.source, 'copy'); assert.equal(x.where, WHERE); assert.equal(x.name, 'zzt_new'); assert.equal(x.purpose, 'vehicle');
    const keys = x._set.files.map(f => f.key).sort();
    assert.ok(keys.includes(MDL) && keys.includes(DIR + 'body.ply'), JSON.stringify(keys));
    assert.equal(x._def, DIR + 'zzt.def'); assert.ok(x.wreck && x._wreck.length === 1, JSON.stringify(x._wreck));
  });
  await t('make: the folder copied under the new name; a def volume line is a gen set row on the copied def', async () => {
    const r = await run(mk({ def_copy: v(true), def_volume: v(['body1 thickness = 60']) }));
    const to = r.copies.map(c => c.to).sort();
    assert.ok(to.includes(WHERE + '/zzt_new/zzt.mdl') && to.includes(WHERE + '/zzt_new/body.ply') && to.includes(WHERE + '/zzt_new/zzt_new.def'), JSON.stringify(to));
    const rows = r.gen.ops[0].rows;
    assert.ok(rows.some(x => x.entity === 'file:' + WHERE + '/zzt_new/zzt_new.def' && /thickness$/.test(x.path) && x.value === '60'), JSON.stringify(rows));
    assert.ok(r.copiesFirst);
  });
  await t('GoH: a model volume thickness line is an armour call on the copied def; its dry run plans on the game def; no def: refused', async () => {
    const r = await run(mk({ def_copy: v(true), vol_thick: v(['body1 = 40', 'body1 = front 80']) }));
    const cl = r.calls.find(x => x.route === 'POST /api/x/task/r/model/gohvol');
    assert.ok(cl && cl.dryFlag === 'write', JSON.stringify(r.calls));
    assert.deepEqual(cl.body, { def: WHERE + '/zzt_new/zzt_new.def', from: DIR + 'zzt.def', change: { set: [{ part: 'body1', side: 'all', mm: 40 }, { part: 'body1', side: 'front', mm: 80 }] } });
    assert.ok(!r.calls.some(x => x.body && JSON.stringify(x.body.ops || []).includes('setThickness')), 'no model thickness op');
    const dry = await R.routes['POST /api/x/task/r/model/gohvol'](null, Object.assign({ mod }, cl.body), ctx);
    assert.deepEqual(dry.files, [WHERE + '/zzt_new/zzt_new.def']); assert.ok(!fs.existsSync(path.join(mod, 'resource')));
    let e = null; try { await run(mk({ def_copy: v(false), name: v('zzt_none'), vol_thick: v(['body1 = 40']) })); } catch (x) { e = x; }
    assert.ok(e && /no thickness of its own.*has none yet/.test(e.message), e && e.message);
    e = null; try { await run(mk({ def_copy: v(true), vol_thick: v(['body1 = sideways 40']) })); } catch (x) { e = x; }
    assert.ok(e && /names no side/.test(e.message), e && e.message);
  });
  await t('write: the copy lands in the mod, the bone edit runs through the GoH reader with a lib/modwrite restore point; the game is untouched', async () => {
    const before = fs.readFileSync(path.join(g, ...MDL.split('/')), 'latin1');
    const r = await CP.write(ctx, mk({ name: v('zzt_w'), bone_position: v(['basis = 0 0 1']), def_copy: v(true), def_volume: v(['body1 thickness = 60']) }), { model: R });
    assert.ok(r.written, JSON.stringify(r.errors));
    const def = fs.readFileSync(path.join(mod, ...(WHERE + '/zzt_w/zzt_w.def').split('/')), 'latin1');
    assert.ok(/\{thickness 60\}/.test(def) && /\{extension "zzt\.mdl"\}/.test(def) && !/(^|[^\r])\n/.test(def), def);
    const out = path.join(mod, ...(WHERE + '/zzt_w/zzt.mdl').split('/'));
    const text = fs.readFileSync(out, 'latin1');
    assert.ok(/Position/i.test(text) && text !== before, text);
    assert.ok(fs.existsSync(path.join(mod, ...(WHERE + '/zzt_w/body.ply').split('/'))));
    assert.equal(fs.readFileSync(path.join(g, ...MDL.split('/')), 'latin1'), before);
    const root = MW.restoreRoot(mod), pts = fs.readdirSync(root).map(id => JSON.parse(fs.readFileSync(path.join(root, id, 'restore-point.json'), 'utf8')));
    assert.ok(pts.some(p => p.action === 'task-model-goh' && p.rel === WHERE + '/zzt_w/zzt.mdl' && p.existed), JSON.stringify(pts.map(p => p.action + ':' + p.rel)));
  });
  await t('write: a volume thickness line lands in the copied def (sides kept CRLF), the game def untouched', async () => {
    const before = fs.readFileSync(path.join(g, ...(DIR + 'zzt.def').split('/')), 'latin1');
    const r = await CP.write(ctx, mk({ name: v('zzt_v'), def_copy: v(true), vol_thick: v(['body1 = all 45 front 90']) }), { model: R });
    assert.ok(r.written, JSON.stringify(r.errors));
    const def = fs.readFileSync(path.join(mod, ...(WHERE + '/zzt_v/zzt_v.def').split('/')), 'latin1');
    assert.ok(/thickness 45/.test(def) && /front 90/.test(def) && !/thickness 30/.test(def) && !/(^|[^\r])\n/.test(def), def);
    assert.equal(fs.readFileSync(path.join(g, ...(DIR + 'zzt.def').split('/')), 'latin1'), before);
  });
  fs.rmSync(g, { recursive: true, force: true });
  console.log(n + ' passed, 0 failed');
  console.log('PASS');
})().catch(e => { console.error(e); console.log('FAIL'); process.exit(1); });
