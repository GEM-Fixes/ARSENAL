// recipe "a model" test: node model.test.js <scratch>. Needs the game folder (AS2_GAME or the saved one); without it the copy runs SKIP.
// 1 copy t34m into a new folder t34m_task with its wreck views and its def, plus model edits through the own route (a bone renamed
// with its tracks, a visibility, a volume added, a thickness, a sequence added) and def entries (lodclass, a volume thickness, the
// {Extension} the renamed folder needs), written for real into a scratch mod; seeded defects: an unknown bone is a plan error, a
// speed of 0 is refused; 2 bring a folder (multi upload, sub-paths) with a small .mdl, two .ply and a .vol, edited at Write; the
// unnamed _lod1.ply is noted, a .txt is refused; 3 routes and the Check step (recipe.check: Models stage and check, node tools only,
// SOEdit itself is never started). Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-db88f70a)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile');
const R = require('./model.recipe'), L = require('./model.lang');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-model-')));
const mod = path.join(scratch, 'mods', 'model_test');
fs.rmSync(mod, { recursive: true, force: true }); fs.mkdirSync(mod, { recursive: true });   // a bare folder is a mod (README Changes 37)
const T34 = 'resource/entity/-vehicle/tank_medium/t34m/t34m.mdl';
const NEW = 'resource/entity/-vehicle/tank_medium/t34m_task';
const at = rel => path.join(mod, ...rel.split('/'));
const rd = rel => { try { return fs.readFileSync(at(rel), 'latin1'); } catch (e) { return ''; } };

(async () => {
  let fails = 0;
  const gameDir = kit.findGame({});
  let n = 0, f = 0;
  const ok = (c, m, x) => { if (c) n++; else { f++; console.log('FAIL ' + m + (x !== undefined ? '\n  ' + String(x).slice(0, 900) : '')); } };

  // the census: every variable is a question or a kept row with its reason class
  const qs = R.groups.reduce((a, g) => a.concat(g.q), []);
  ok(qs.length >= 40 && R.kept.length === 6 && R.kept.every(r => /\[I\]|no tool step/.test(r[1])), 'every model variable is asked; kept holds only [I] meanings and the named gap', qs.length + ' questions, kept ' + R.kept.map(r => r[0]).join(' '));
  ok(Object.keys(R.routes).every(k => /^GET /.test(k) || k === 'POST /api/x/task/r/model/edit' || k === 'POST /api/x/task/r/model/gohvol'), 'routes: the read only set, the edit call and the GoH def thickness call only');
  ok(qs.find(q => q.id === 'upload').multi === true, 'the upload is the core multi file source');
  // novice fixes: what a first time user meets
  const MC = require('./model.client');
  ok(MC.kinds.join() === 'mlist' && (() => { try { new Function(MC.script); return true; } catch (e) { return false; } })() && !/innerHTML|=>|\$\{|`/.test(MC.script), 'model.client.js adds the kind mlist, parses, and keeps the page rules');
  const lists = qs.filter(q => q.kind === 'mlist');
  ok(lists.length >= 20 && lists.filter(q => q.names).length >= 20 && ['bone_speed', 'vol_thick', 'seq_options', 'def_bone', 'mesh_material'].every(id => qs.find(q => q.id === id).names), 'hazard: every list that needs a bone, volume, mesh or sequence name shows the model\'s names beside it', lists.length + ' lists');
  const ids = qs.map(q => q.id);
  ok(ids.indexOf('source') < ids.indexOf('purpose') && JSON.stringify(qs.find(q => q.id === 'purpose').when) === JSON.stringify({ source: ['bring', 'outside'] }), 'hazard: what it is for is asked only when starting from nothing, after how to start');
  ok(R.groups.find(g => g.id === 'expert').q.map(q => q.id).join() === 'bone_matrix,bone_params' && !R.groups.find(g => g.id === 'expert').essential, 'hazard: matrix and parameters sit in a group for experts');
  ok(['bone_uv', 'bone_ext', 'edit'].every(id => qs.find(q => q.id === id).picker.sources[0] === 'keep') && ['h.bone_uv', 'h.bone_ext', 'h.edit'].every(k => /After Write, open this task again from Continue/.test((L.find(r => r[0] === 'task.model.' + k) || [])[1])), 'hazard: the outside program hand offs can be left as they are and say how to come back after Write');
  // last adoption: the file checks at upload (picker.check), a title per verb, the Test step words
  const Qm = id => qs.find(q => q.id === id), skel = Buffer.from('{Skeleton\r\n\t{bone "basis"}\r\n}\r\n');
  ok(['upload', 'program', 'bone_uv', 'bone_ext', 'edit'].every(id => typeof Qm(id).picker.check === 'function'), 'every question that takes a file checks it at upload');
  const pu = Qm('upload').picker.check, pv = Qm('bone_uv').picker.check, pe = Qm('edit').picker.check;
  ok(pu({ name: 'T34M.mdl', bytes: skel }) === null && pu({ name: 'body.ply', bytes: Buffer.alloc(8) }) === null && pe({ name: 'body.ply', bytes: Buffer.alloc(8) }) === null, 'a good .mdl and a .ply are taken at upload');
  const bads = [pu({ name: 'readme.txt', bytes: Buffer.from('x') }), pu({ name: 'my body.ply', bytes: Buffer.alloc(8) }), pu({ name: 't34m.mdl', bytes: Buffer.from('{Skeleton {bone "a"') }), pv({ name: 'body.ply', bytes: Buffer.alloc(8) })];
  ok(bads.map(x => x && x.key).join() === 'task.model.e.type,task.model.e.name,task.model.e.mdl,task.model.e.type' && bads.every(x => L.some(r => r[0] === x.key && r.slice(1).every(Boolean))), 'hazard: a wrong type, a name the game cannot read and a broken .mdl are refused at upload in 4 languages, not at Write', JSON.stringify(bads).slice(0, 400));
  ok(R.title.make === 'task.model.t' && R.title.change === 'task.model.tc' && R.test === 'task.model.test' && /wreck/.test(L.find(r => r[0] === 'task.model.test')[1]), 'a title per verb, and the Test step says where to see the model and what to check');
  ok(!L.some(r => /(^|[^А-Яа-яІіЇїЄєҐґ])[Мм]ода([^А-Яа-яІіЇїЄєҐґ]|$)/.test(r[3])), 'uk rows say моду, not мода');
  ok(/2865 gives degrees a second/.test(L.find(r => r[0] === 'task.model.h.bone_speed')[1]) && !/turret = 30/.test(L.find(r => r[0] === 'task.model.h.bone_speed')[1]), 'hazard: the bone speed help gives the unit (no example 100 times too fast)');
  ok(R.groups.filter(g => g.essential).map(g => g.id).join() === 'what,files', 'Quick: the essential groups are what and files only');
  ok(qs.find(q => q.id === 'name').unique && qs.find(q => q.id === 'name').unique.lookup === 'modelname', 'hazard: the model name is checked against the game folders as it is typed');

  // 1 copy a game model into a new folder, with its wreck, its def and edits
  if (!gameDir) console.log('note: SKIP the copy run: no game folder found (set AS2_GAME)');
  else {
    const copyId = D.newId('model');
    const r1 = await kit.run(R, L, {
      id: copyId, mod, write: true, gameDir, validate: { kinds: ['mlist'] },
      base: { id: T34, name: 't34m', ref: { key: T34 } },
      answers: {
        name: 't34m_task', wreck: true,
        bone_name: ['seat01 = seat01b'], bone_visibility: ['turret = 0'], vol_add: ['basis / testbox = box 20 10 5'],
        vol_thick: ['body1 = front 45 top 20'], seq_model: ['spin = open.anm'], seq_options: ['open = speed 0.6 -resume'],
        def_lodclass: 'vehicle', def_volume: ['body1 thickness = 60', 'newvol component = "hull"'],
      },
      planFiles: [NEW + '/t34m.mdl', NEW + '/t34m_task.def', 'resource/entity/-vehicle/tank_medium/x/t34m_task_x/t34m_task_x.def', 'resource/entity/-vehicle/tank_medium/x/t34m_task_xx/t34m_task_xx.mdl'],
      after: (m, res, ok2) => {
        const names = fs.readdirSync(at(NEW));
        ok2(names.some(x => /\.ply$/.test(x)) && names.some(x => /\.vol$/.test(x)) && names.some(x => /\.anm$/.test(x)) && names.some(x => /\.dds$/.test(x)), 'the model, its meshes, volumes, animations and textures are in the new folder', names.join(' '));
        const t = rd(NEW + '/t34m.mdl');
        ok2(/"seat01b"/.test(t) && !/"seat01"/.test(t), 'bone_name: the bone is renamed in the model');
        ok2((require('../../../../lib/model/mdl').parse(Buffer.from(t, 'latin1')).bones.find(b => b.name === 'turret') || {}).visibility === 0, 'bone_visibility: the turret gets {Visibility 0}');
        ok2(/\{Volume "testbox"[^}]*\{Box 20 10 5\}/i.test(t), 'vol_add: the box volume is there', t.slice(t.indexOf('testbox') - 20, t.indexOf('testbox') + 120));
        ok2(/\{Volume "body1"[^]*?\{Thickness[^}]*\{front 45\}/i.test(t), 'vol_thick: body1 has its front thickness');
        ok2(/\{sequence "spin"[^}]*open\.anm/i.test(t), 'seq_model: the sequence is added');
        const so = (t.match(/\{sequence "open"[^\n]*/i) || [''])[0];
        ok2(/\{speed 0\.6\}/i.test(so) && !/\{resume\}/i.test(so), 'seq_options: a vanilla speed set, resume removed', so);
        ok2(!(res.copies || []).some(c => /m-def-t34m_task\.def/.test(JSON.stringify(c))), 'the def entries come from gen set rows, not a staged patched copy');
        const def = rd(NEW + '/t34m_task.def');
        ok2(/\{Extension "t34m\.mdl"\}/i.test(def) && /\{lodclass "vehicle"\}/i.test(def), 'the def is copied with {Extension} for the kept model name and the lodclass', def.slice(-300));
        // body1's own entry (up to the next {volume): its thickness may be a plain value or a block with per-side entries (a mod in the
        // game's profile can bring such a def; the key copy takes the def as the game plays it)
        const b1 = (/\{volume "body1"[^]*?(?=\{volume\b|$)/i.exec(def) || [''])[0];
        ok2(/\{thickness 60[\s}]/i.test(b1) &&/\{volume "newvol"\s*\{component "hull"\}/i.test(def), 'def_volume: an entry set and a new volume entry made', def.slice(def.indexOf('body1') - 10, def.indexOf('body1') + 140));
        const xdef = rd('resource/entity/-vehicle/tank_medium/x/t34m_task_x/t34m_task_x.def');
        ok2(/t34m_task_x/.test(xdef) && !/\bt34m_x\b/i.test(xdef), 'the broken view def is renamed inside', xdef.slice(0, 200));
        ok2(fs.existsSync(at('resource/entity/-vehicle/tank_medium/x/t34m_task_xx/t34m_task_xx.mdl')), 'the destroyed view mdl takes the new name');
        ok2((res.restore || []).length > 0, 'a restore point is taken');
      },
    }, scratch);
    fails += r1.fails;
    const ctx = kit.ctxFor(scratch, { gameDir });
    // the Check step: Models stage records the copy for SOEdit, the Models check reads it
    try {
      const cards = await R.check(D.load(ctx, copyId), Object.assign({}, ctx, { mod, gameId: 'as64' }));
      ok(cards.length === 2 && cards[0].title === 'SOEdit stage' && cards[0].level === 'ok' && cards[1].title === 'Models check' && ['ok', 'warn', 'error'].includes(cards[1].level), 'recipe.check stages the copy and runs the Models check', JSON.stringify(cards).slice(0, 700));
      ok(fs.existsSync(at(NEW + '/t34m.mdl')) && /"seat01b"/.test(rd(NEW + '/t34m.mdl')), 'staging keeps the written and edited model');
    } catch (e) { ok(false, 'recipe.check crashed', e.stack); }
    // the same folder for make is refused (a new model needs its own folder); change in place is allowed
    const d = { id: D.newId('model'), recipe: 'model', verb: 'make', game: 'as64', mod, base: { id: T34, ref: { key: T34 } }, answers: {}, kept: [], state: 'open' };
    D.save(ctx, d);
    const vctx = Object.assign({}, ctx, { mod, gameId: 'as64' });
    const vm = await R.values(vctx, d.base, { draft: d, verb: 'make' }), vc = await R.values(vctx, d.base, { draft: d, verb: 'change' });
    ok(vm.name === 't34m_new' && vc.name === 't34m', 'hazard: make starts with a free name (t34m_new), change with the model\'s own', vm.name + ' ' + vc.name);
    const cm = await CP.compile(ctx, d, { model: R });
    ok(cm.copies.length && cm.copies.every(x => x.to.startsWith('resource/entity/-vehicle/tank_medium/t34m_new/') || /\/x\/t34m_new_x+\//.test(x.to)), 'hazard: a make left on every default writes only into the new folder, no game model is replaced', JSON.stringify(cm.copies.slice(0, 3)));
    const mine = cm.copies.find(x => /\.mdl$/.test(x.to)).to;
    fs.mkdirSync(path.dirname(at(mine)), { recursive: true }); fs.writeFileSync(at(mine), 'edited in SOEdit');
    const cm2 = await CP.compile(ctx, d, { model: R });
    ok(!cm2.copies.some(x => x.to === mine) && cm2.copies.length === cm.copies.length - 1 && (cm2.notes || []).some(x => /already in your mod are kept/.test(x)), 'hazard: a second Write does not copy the game model over the one an outside program changed in the mod', JSON.stringify((cm2.notes || []).slice(0, 4)));
    fs.rmSync(path.join(mod, 'resource', 'entity', '-vehicle', 'tank_medium', 't34m_new'), { recursive: true, force: true });
    const lk1 = await R.lookups.modelname(vctx, 't34m', { in: 'resource/entity/-vehicle/tank_medium' }), lk2 = await R.lookups.modelname(vctx, 't34m_new', { in: 'resource/entity/-vehicle/tank_medium' });
    ok(lk1.exact === true && lk2.exact === false, 'the name lookup marks a game model folder as taken and a free one as free', JSON.stringify([lk1, lk2]));
    d.answers = { name: { src: 'value', value: 'hetzer' } }; D.save(ctx, d);
    let why = ''; try { await CP.compile(ctx, d, { model: R }); } catch (e) { why = e.message; }
    ok(/already has a model folder/.test(why) && /t34m|hetzer_new/.test(why), 'seeded defect: make onto another game model\'s folder is refused with a free name offered', why);
    d.answers = { name: { src: 'value', value: 't34m' } }; D.save(ctx, d);
    why = ''; try { await CP.compile(ctx, d, { model: R }); } catch (e) { why = e.message; }
    ok(/own folder/.test(why), 'make with the same folder as the copied model is refused', why);
    const nm = await R.routes['GET /api/x/task/r/model/names'](new URL('http://x/a?draft=' + d.id), null, ctx);
    ok(nm.from === 'game' && nm.bones.some(b => b.name === 'turret' && b.type === 'revolute') && nm.volumes.includes('body1') && nm.meshes.length && nm.sequences.length, 'the names route lists the copied model\'s bones (with type), volumes, meshes and sequences', JSON.stringify(nm).slice(0, 300));
    d.verb = 'change'; d.answers = { textures: { src: 'value', value: false }, anims: { src: 'value', value: false }, wreck: { src: 'value', value: false }, def_copy: { src: 'value', value: false } }; D.save(ctx, d);
    const c = await CP.compile(ctx, d, { model: R });
    ok(c.copies.length > 0 && c.copies.every(x => x.to.startsWith('resource/entity/-vehicle/tank_medium/t34m/')) && !c.copies.some(x => /\.(dds|anm|def)$/.test(x.to)) && !c.calls.length, 'change in place copies the model without textures, animations and def when told so', JSON.stringify(c.copies.slice(0, 5)));
    // seeded defect: a bone the model lacks is a plan error from the edit route (dry, on the game model)
    d.answers.bone_visibility = { src: 'value', value: ['nosuchbone = 0'] }; D.save(ctx, d);
    const p = await CP.plan(ctx, d, { model: R });
    ok(p.errors.length && /nosuchbone/.test(JSON.stringify(p.errors)), 'seeded defect: an unknown bone is a plan error', JSON.stringify(p.errors).slice(0, 400));
    d.answers.bone_visibility = { src: 'value', value: ['turret = 0'] }; D.save(ctx, d);
    const p2 = await CP.plan(ctx, d, { model: R });
    ok(!p2.errors.length && p2.files.some(x => x.rel === 'resource/entity/-vehicle/tank_medium/t34m/t34m.mdl'), 'a good edit plans clean and names the model file', JSON.stringify(p2.errors).slice(0, 400));
    d.answers.bone_speed = { src: 'value', value: ['turret = 0'] }; D.save(ctx, d);
    why = ''; try { await CP.compile(ctx, d, { model: R }); } catch (e) { why = e.message; }
    ok(/other than 0/.test(why), 'a speed of 0 is refused before anything runs', why);
    d.answers.bone_speed = { src: 'value', value: [] }; d.answers.seq_options = { src: 'value', value: ['open = dynamicspeed'] }; D.save(ctx, d);
    why = ''; try { await CP.compile(ctx, d, { model: R }); } catch (e) { why = e.message; }
    ok(/no vanilla model uses/.test(why), 'seeded defect: a sequence option no vanilla model uses is refused ([I] key kept to the seen values)', why);
    d.answers.seq_options = { src: 'value', value: ['open = speed 40'] }; D.save(ctx, d);
    why = ''; try { await CP.compile(ctx, d, { model: R }); } catch (e) { why = e.message; }
    ok(/value no vanilla model uses/.test(why), 'a speed outside 0.05 to 10 is refused', why);
    d.answers.seq_options = { src: 'value', value: [] }; d.answers.bone_visibility = { src: 'value', value: ['turret = 1'] }; D.save(ctx, d);
    why = ''; try { await CP.compile(ctx, d, { model: R }); } catch (e) { why = e.message; }
    ok(/takes 0 or none/.test(why), 'hazard: a visibility vanilla models never use is refused, not written untested', why);
    delete d.answers.seq_options; d.answers.bone_visibility = { src: 'value', value: ['turret = 0'] }; D.save(ctx, d);
    // the edit route on its own: a plan on the game model maps the files to the target folder; a foreign op is refused
    const ER = R.routes['POST /api/x/task/r/model/edit'];
    const er = await ER(null, { mod, mdl: 'resource/entity/-vehicle/tank_medium/t34m_route/t34m.mdl', from: T34, write: false, dry: true, ops: [{ op: 'vol.setThickness', args: { volume: 'crew', all: 15 } }] }, ctx);
    ok(er.ok && er.files.includes('resource/entity/-vehicle/tank_medium/t34m_route/t34m.mdl') && !fs.existsSync(at('resource/entity/-vehicle/tank_medium/t34m_route')), 'the edit route plans on the game model, names the target file and writes nothing', JSON.stringify(er));
    let refused = ''; try { await ER(null, { mod, mdl: T34, ops: [{ op: 'file.remove', args: {} }] }, ctx); } catch (e) { refused = e.message; }
    ok(/Not a model edit/.test(refused), 'the edit route refuses an op the task does not make', refused);
  }

  // 2 bring a folder: staged in the draft first (the core upload keeps sub-paths)
  {
    const ctx = kit.ctxFor(scratch, { gameDir });
    const pre = D.newId('model');
    const st = D.stageDir(ctx, pre); fs.mkdirSync(path.join(st, 'boxdir'), { recursive: true });
    fs.writeFileSync(path.join(st, 'boxdir', 'box.mdl'), '{Skeleton\r\n\t{bone "body"\r\n\t\t{VolumeView "box.ply"}\r\n\t}\r\n}\r\n{Volume "hull"\r\n\t{Box 20 10 5}\r\n\t{Bone "body"}\r\n}\r\n{Volume "shell"\r\n\t{Polyhedron "box.vol"}\r\n\t{Bone "body"}\r\n}\r\n');
    fs.writeFileSync(path.join(st, 'boxdir', 'box.ply'), Buffer.from('EPLYBNDS fake mesh'));
    fs.writeFileSync(path.join(st, 'boxdir', 'box_lod1.ply'), Buffer.from('EPLYBNDS fake lod'));
    fs.writeFileSync(path.join(st, 'boxdir', 'box.vol'), Buffer.from('EVLM fake volume'));
    const staged = ['boxdir/box.mdl', 'boxdir/box.ply', 'boxdir/box_lod1.ply', 'boxdir/box.vol'];
    const FOLD = 'resource/entity/-vehicle/test/tasktest_box';
    const r2 = await kit.run(R, L, {
      id: pre, mod, write: true, gameDir, validate: { kinds: ['mlist'] },
      answers: { source: 'bring', where: 'resource/entity/-vehicle/test', name: 'tasktest_box', upload: { src: 'file', staged }, bone_visibility: ['body = 0'], vol_thick: ['hull = 30'] },
      planFiles: [FOLD + '/box.mdl', FOLD + '/box.vol'],
      after: (m, res, ok2) => {
        ok2(['box.mdl', 'box.ply', 'box_lod1.ply', 'box.vol'].every(s => fs.existsSync(at(FOLD + '/' + s))), 'every brought file is written into the model folder (the picked folder name dropped)');
        const t = rd(FOLD + '/box.mdl');
        ok2(/\{visibility 0\}/i.test(t) && /\{Volume "hull"[^]*?\{Thickness 30\}/i.test(t), 'the brought model is edited at Write after the copies', t);
      },
    }, scratch);
    fails += r2.fails;
    const d = D.load(ctx, pre);
    const c = await CP.compile(ctx, d, { model: R });
    ok(c.notes.some(x => /box_lod1\.ply is not named/.test(x)) && !c.notes.some(x => /box\.ply is not named|box\.vol is not named/.test(x)), 'a brought _lod1.ply no model names is noted, the named ones are not', JSON.stringify(c.notes));
    ok(c.result && c.result.mdl === FOLD + '/box.mdl', 'the result names the model for a unit task', JSON.stringify(c.result));
    fs.writeFileSync(path.join(st, 'boxdir', 'readme.txt'), 'x');
    d.answers.upload = { src: 'file', staged: staged.concat('boxdir/readme.txt') }; D.save(ctx, d);
    let why = ''; try { await CP.compile(ctx, d, { model: R }); } catch (e) { why = e.message; }
    ok(/not a model file/.test(why), 'seeded defect: a file that is no model file is refused', why);
    d.answers = { source: { src: 'value', value: 'bring' }, name: { src: 'value', value: 'Bad Name' } }; D.save(ctx, d);
    why = ''; try { await CP.compile(ctx, d, { model: R }); } catch (e) { why = e.message; }
    ok(/folder name/.test(why), 'a folder name with capitals and a space is refused', why);
  }

  // 3 read only routes
  if (gameDir) {
    const ctx = kit.ctxFor(scratch, { gameDir });
    try {
      const s = await R.routes['GET /api/x/task/r/model/set'](new URL('http://x/a?key=' + encodeURIComponent(T34)), null, ctx);
      ok(s.files.length > 10 && s.files.some(x => x.kind === 'vol') && s.wrecks.length === 2, 'the set route lists the files and both wreck views', JSON.stringify({ n: s.files.length, w: s.wrecks }));
      const lk = await R.lookups.mdl(Object.assign({}, ctx, { mod }), 't34m', { mod });
      ok(lk.some(x => x.id === T34), 'the base lookup finds t34m.mdl', JSON.stringify(lk.slice(0, 3)));
    } catch (e) { ok(false, 'routes crashed', e.stack); }
  }
  console.log(n + ' passed, ' + f + ' failed (model)');
  fails += f;
  console.log(fails ? 'FAIL' : 'PASS');
  if (fails) process.exitCode = 1;
})();
