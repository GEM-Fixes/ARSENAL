// ext task test: node test.js <scratch>. No game, no browser, no server: the routes run in process, the page script in the fake DOM.
// Seeded defects: a bad recipe is refused, an upload outside staging is refused, a write outside the mod is refused, a POST from
// LAN Remote is refused. Writes only under the scratch folder. Last line PASS. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-69063d7d)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-ext-')));
fs.mkdirSync(scratch, { recursive: true });
process.env.AS2_TASK_DIR = path.join(scratch, 'tasks');   // nothing reaches the user's own task folder

const EXT = require('./index'), S = require('./server'), RC = require('./lib/recipe'), D = require('./lib/draft'), CP = require('./lib/compile');
const kit = require('./lib/testkit'), wav = require('../../../lib/wav');
const GUI = path.resolve(__dirname, '..', '..');

let fails = 0, passes = 0;
const ok = (c, m, extra) => { if (c) passes++; else { fails++; console.log('FAIL ' + m + (extra !== undefined ? '\n  ' + String(extra).slice(0, 1500) : '')); } };
const errs = list => list.filter(x => x.level === 'error').map(x => x.msg);
const throwsAsync = async (fn, re, status) => { try { await fn(); return 'no refusal'; } catch (e) { if (re && !re.test(e.message)) return 'wrong message: ' + e.message; if (status && e.status !== status) return 'status ' + e.status + ' not ' + status; return ''; } };
const tick = () => new Promise(r => setImmediate(r));
// the page waits: ticks(n) is n turns, then on while a route call the page made has no answer yet (a busy PC: file reads, children),
// then n turns more; tickUntil(f) polls f by time. Backup, never a hang: at 60 s a WAIT line and the check after it reports
const W = require('../../../lib/test/wait');
let inflight = 0;
const counted = p => { inflight++; return Promise.resolve(p).finally(() => { inflight--; }); };
const ticks = async n => { for (let i = 0; i < n; i++) await tick(); if (!inflight) return; await W.until(() => !inflight, { who: 'task page test', what: 'a route call answered', step: 1 }); for (let i = 0; i < n; i++) await tick(); };
const tickUntil = f => W.until(f, { who: 'task page test', what: String(f).slice(0, 100), step: 1 });
const clone = o => JSON.parse(JSON.stringify(o));

(async () => {
  const ctx = kit.ctxFor(scratch, {}), rctx = kit.ctxFor(scratch, { remote: true });
  const R = EXT.routes, call = (k, u, b, c) => R[k](new URL('http://127.0.0.1' + u), b, c || ctx);

  // ---------- 1. the extension and its recipes
  ok(EXT.id === 'task' && EXT.tab === false && typeof EXT.script === 'string', 'the ext is task, no tab, with a script');
  ok(EXT.IDS.length === 27 && EXT.IDS.includes('mod') && EXT.IDS.includes('x-limits'), '27 recipe ids in the literal list', EXT.IDS);
  ok(EXT.remote.length && EXT.remote.every(r => /^GET \/api\/x\/task\//.test(r)), 'remote lists GET task routes only', EXT.remote);
  const mod = S.recipes().mod;
  ok(!!mod, 'the mod recipe is loaded');
  ok(!errs(RC.validate(mod, null, { ids: EXT.IDS })).length, 'the mod recipe validates', errs(RC.validate(mod, null, { ids: EXT.IDS })));

  // seeded defect: bad recipes are refused
  const bad = over => Object.assign(clone(Object.assign({}, mod, { values: undefined, compile: undefined })), { compile: mod.compile, values: mod.values }, over);
  const refuses = (r, re, m, census) => { const e = errs(RC.validate(r, census || [], {})); ok(e.some(x => re.test(x)), 'refused: ' + m, e.join(' | ')); };
  refuses(bad({ id: 'Bad Id' }), /^id must be/, 'a bad id');
  refuses(bad({ compile: undefined }), /compile/, 'make without compile');
  refuses(bad({ verbs: ['build'] }), /verbs/, 'an unknown verb');
  refuses(bad({ games: ['coh'] }), /games/, 'an unknown game');
  refuses(bad({ title: 'task.other.t' }), /title/, 'a title outside task.<id>.');
  refuses(bad({ groups: [{ id: 'a', title: 'task.mod.g.place', q: [{ id: 'x', kind: 'text', ask: 'task.mod.q.where', when: { y: 1 } }, { id: 'y', kind: 'text', ask: 'task.mod.q.where' }] }] }), /when names y/, 'a when naming a later question');
  refuses(bad({ groups: [{ id: 'a', title: 'task.mod.g.place', q: [{ id: 'x', kind: 'choice', ask: 'task.mod.q.where' }] }] }), /choice needs/, 'a choice without values');
  refuses(bad({ groups: [{ id: 'a', title: 'task.mod.g.place', q: [{ id: 'x', kind: 'text', ask: 'task.mod.q.where', unique: { lookup: 'modfolder' } }] }] }), /unique is for id/, 'unique on a text question');
  refuses(bad({ groups: [{ id: 'a', title: 'task.mod.g.place', q: [{ id: 'review', kind: 'text', ask: 'task.mod.q.where' }] }] }), /built-in/, 'a question named like a built-in step');
  refuses(bad({ groups: [{ id: 'a', title: 'task.mod.g.place', q: [{ id: 'x', kind: 'file', ask: 'task.mod.q.where' }] }] }), /needs a picker/, 'a file question without a picker');
  refuses(bad({ groups: [{ id: 'a', title: 'task.mod.g.place', q: [{ id: 'x', kind: 'number', ask: 'task.mod.q.where', limits: { min: 5, max: 1 } }] }] }), /min is above/, 'min above max');
  refuses(bad({ kept: [['new.target', '']] }), /kept rows/, 'a kept row without a reason');
  // coverage: a census key nobody covers is an error; a missing census file only a warning
  refuses(bad({}), /neither asked nor kept: zz\.extra/, 'a census key neither asked nor kept', [].concat(...mod.groups.map(g => [].concat(...g.q.map(x => x.covers || []))), mod.kept.map(k => k[0]), ['zz.extra']));
  const cv = RC.coverage(mod, ['new.dir', 'zz.extra']);
  ok(!cv.ok && cv.missing.includes('zz.extra'), 'coverage names the missing key', JSON.stringify(cv));
  const noC = RC.validate(Object.assign({}, mod, { census: 'no-such-census-file' }), null, {});
  ok(!errs(noC).length && noC.some(x => x.level === 'warn' && /census file not there yet/.test(x.msg)), 'a missing census file is a warning', JSON.stringify(noC));

  // steps order
  const st = RC.steps(mod, { answers: {}, kept: [] }, {}).map(s => s.id);
  ok(st.join(',') === 'q:title,q:place,q:folder,q:desc,q:deps,review,write,check,test,checklist,done', 'mod steps in order (title first; where only for another folder)', st.join(','));
  const stO = RC.steps(mod, { answers: { place: { src: 'value', value: 'other' } }, kept: [] }, {}).map(s => s.id).join(',');
  ok(/q:place,q:where,q:folder/.test(stO), 'Another folder asks where', stO);
  const fake = { id: 'zz', verbs: ['change'], games: ['as64'], needs: ['mod'], base: { lookup: 'entity' }, title: 'task.zz.t', groups: [{ id: 'g', title: 'task.zz.g', q: [{ id: 'a', kind: 'yesno', ask: 'task.zz.q' }, { id: 'b', kind: 'text', ask: 'task.zz.q', when: { a: true } }] }], compile: () => ({}) };
  const st2 = RC.steps(fake, { answers: {}, kept: [] }, {}).map(s => s.id).join(',');
  ok(st2 === 'mod,base,mode,q:a,review,write,check,test,done', 'a when hides its question until answered', st2);
  const st3 = RC.steps(fake, { answers: { a: { src: 'value', value: true } }, kept: [] }, {}).map(s => s.id).join(',');
  ok(st3 === 'mod,base,mode,q:a,q:b,review,write,check,test,done', 'a when shows its question once answered', st3);
  const st4 = RC.steps(fake, { answers: {}, kept: [], parent: { draft: 'p', q: 'x' } }, {}).map(s => s.id).join(',');
  ok(/review,back$/.test(st4) && !/^mod/.test(st4), 'a branch ends with review and back, no mod step', st4);

  // ---------- 2. drafts
  const dn = await call('POST /api/x/task/draft/new', '/api/x/task/draft/new', { recipe: 'mod', verb: 'make', game: 'as64' });
  ok(dn.draft && D.ID_RE.test(dn.draft.id) && dn.draft.recipe === 'mod', 'a new draft is saved', JSON.stringify(dn));
  const id = dn.draft.id;
  dn.draft.answers.title = { src: 'value', value: 'Saved title' };
  await call('POST /api/x/task/draft/save', '/api/x/task/draft/save', { draft: dn.draft });
  ok(D.load(ctx, id).answers.title.value === 'Saved title', 'an answer survives a reload from disk (a GUI restart)');
  const ls = await call('GET /api/x/task/drafts', '/api/x/task/drafts');
  ok(ls.drafts.length === 1 && ls.drafts[0].id === id, 'drafts lists it', JSON.stringify(ls));
  ok(await throwsAsync(() => D.load(ctx, '../evil'), /not a task id/) === '', 'a bad draft id is refused');
  ok(await throwsAsync(() => call('POST /api/x/task/draft/save', '/x', { draft: Object.assign({}, dn.draft, { answers: { title: { src: 'nope' } } }) }), /needs src/) === '', 'an answer with an unknown source is refused');
  ok(await throwsAsync(() => call('POST /api/x/task/draft/new', '/x', { recipe: 'zz-never-built' }), /not built yet/, 404) === '', 'a task not built yet cannot start (an id that never exists: all 27 recipes are built)');

  // a fake recipe with a file question, a branch and a free copy target (the seeded defects below)
  const zz = {
    id: 'zz', verbs: ['make'], games: ['as64'], needs: [], title: 'task.zz.t',
    groups: [{ id: 'g', title: 'task.zz.g', essential: true, q: [
      { id: 'snd', kind: 'file', ask: 'task.zz.q', picker: { sources: ['file', 'branch'], kinds: ['sound'], branch: 'mod' } },
      { id: 'to', kind: 'text', ask: 'task.zz.q' },
      { id: 'cmd', kind: 'text', ask: 'task.zz.q', optional: true },
      { id: 'many', kind: 'file', ask: 'task.zz.q', multi: true, picker: { sources: ['file'], kinds: ['sound', '.vol'] } },
    ] }],
    compile: (d, c) => {
      const a = c.answer('snd'), out = { copies: [], calls: [] };
      if (a && a.src === 'file') out.copies.push({ staged: a.staged[0], to: c.value('to') });
      if (c.value('cmd') === 'other') out.calls.push({ cmd: 'new', input: { dir: path.join(scratch, 'elsewhere'), name: 'x' } });
      if (c.value('cmd') === 'tool') out.calls.push({ tool: 'rm', args: [d.mod] });
      if (c.value('cmd') === 'self') out.calls.push({ route: 'POST /api/x/task/write', body: {} });
      return out;
    },
  };
  S.setRecipes(Object.values(S.recipes()).concat([zz]));
  const zd = (await call('POST /api/x/task/draft/new', '/x', { recipe: 'zz', game: 'as64', mod: path.join(scratch, 'mods', 'zzmod') })).draft;
  const kid = await call('POST /api/x/task/draft/child', '/x', { parent: zd.id, q: 'snd' });
  ok(kid.draft && kid.draft.parent && kid.draft.parent.draft === zd.id && kid.draft.recipe === 'mod', 'a branch opens a child task', JSON.stringify(kid));
  const got = await call('GET /api/x/task/draft', '/api/x/task/draft?id=' + zd.id);
  ok(got.children.length === 1 && got.children[0].id === kid.draft.id, 'the parent knows its branch');
  ok((await call('GET /api/x/task/drafts', '/x')).drafts.every(d => d.id !== kid.draft.id), 'a branch is not listed on its own under Continue');

  // ---------- 3. upload (chunked JSON), type from the bytes
  const pcm = new Int16Array(800); for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round(Math.sin(i / 8) * 8000);
  const wavBuf = wav.encodePcm16({ rate: 8000, channels: 1, pcm: [pcm] });
  const up = (b, c) => call('POST /api/x/task/upload', '/api/x/task/upload', Object.assign({ draft: zd.id, q: 'snd' }, b), c);
  const half = Math.floor(wavBuf.length / 2);
  const u1 = await up({ name: 'beep.wav', off: 0, b64: wavBuf.subarray(0, half).toString('base64'), last: false });
  ok(u1.done === false && u1.got === half, 'the first chunk is staged', JSON.stringify(u1));
  ok(await throwsAsync(() => up({ name: 'beep.wav', off: half + 5, b64: wavBuf.subarray(half).toString('base64'), last: true }), /lost its place/, 409) === '', 'a chunk at the wrong offset is refused');
  const u2 = await up({ name: 'beep.wav', off: half, b64: wavBuf.subarray(half).toString('base64'), last: true });
  ok(u2.done && u2.ok && u2.type === 'wav' && u2.facts && u2.facts.rate === 8000, 'a wav is staged and read', JSON.stringify(u2));
  ok(fs.existsSync(D.stagedPath(ctx, zd.id, 'beep.wav')), 'the staged file is in the draft staging folder');
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
  const u3 = await up({ name: 'fake.wav', off: 0, b64: png.toString('base64'), last: true });
  ok(u3.done && !u3.ok && u3.type !== 'wav' && !fs.existsSync(D.stagedPath(ctx, zd.id, 'fake.wav')), 'a file whose bytes are not a sound is refused and deleted', JSON.stringify(u3));
  // seeded defect: an upload outside staging
  for (const n of ['../escape.wav', '..\\escape.wav', 'C:evil.wav', '..', 'a/../../x.wav', '/abs.wav', 'a/./b.wav'])
    ok(await throwsAsync(() => up({ name: n, off: 0, b64: wavBuf.toString('base64'), last: true }), /cannot be staged|leaves the staging/) === '', 'an upload named ' + n + ' is refused (outside staging)');
  for (const q of ['snd', 'many']) ok(await throwsAsync(() => up({ q, name: '../../escape.wav', off: 0, b64: wavBuf.toString('base64'), last: true }), /cannot be staged|leaves the staging/) === '', 'a multi question still refuses ../ (' + q + ')');
  ok(!fs.existsSync(path.join(D.stageRoot(ctx), 'escape.wav')) && !fs.existsSync(path.join(scratch, 'escape.wav')) && !fs.existsSync(path.join(D.stageRoot(ctx), 'x.wav')), 'nothing landed outside staging');
  // a sub-path stays inside staging: refused for a one-file question, taken when the question says multi (several files, a folder)
  ok(await throwsAsync(() => up({ name: 'a/b.wav', off: 0, b64: wavBuf.toString('base64'), last: true }), /one file, not a folder/) === '', 'a one-file question refuses a sub-path');
  const um = await up({ q: 'many', name: 'pack\\sub/b.wav', off: 0, b64: wavBuf.toString('base64'), last: true });
  ok(um.done && um.ok && um.name === 'pack/sub/b.wav' && fs.existsSync(path.join(D.stageDir(ctx, zd.id), 'pack', 'sub', 'b.wav')), 'a multi question takes a file of a folder, inside staging', JSON.stringify(um));
  const vol = Buffer.concat([Buffer.from([1, 0, 2, 0]), Buffer.alloc(60)]);
  const uv = await up({ q: 'many', name: 'pack/hull.vol', off: 0, b64: vol.toString('base64'), last: true });
  ok(uv.done && uv.ok && uv.type === 'data', 'a question naming .vol takes a volume by its extension (the bytes read as data)', JSON.stringify(uv));
  const ux = await up({ q: 'many', name: 'pack/hull.ply', off: 0, b64: vol.toString('base64'), last: true });
  ok(ux.done && !ux.ok, 'a file of another extension whose bytes say nothing is still refused', JSON.stringify(ux));
  ok(S.sniff(vol, 'hull.vol', ['model']).ok && !S.sniff(vol, 'hull.vol', ['sound']).ok, 'a model question takes a .vol whose bytes read as data');
  ok(await throwsAsync(() => up({ name: 'big.wav', off: S.UPLOAD_MAX - 10, b64: Buffer.alloc(20).toString('base64'), last: true }), /over 64 MB/, 413) === '', 'a file over 64 MB is refused');
  ok(await throwsAsync(() => call('POST /api/x/task/upload', '/x', { draft: zd.id, q: 'to', name: 'a.wav', off: 0, b64: '', last: true }), /takes no file/) === '', 'a question without a file source takes no upload');

  // ---------- 4. compile, plan, write: only into the picked mod
  ok(await throwsAsync(() => CP.inMod(path.join(scratch, 'm'), '../x'), /only inside the picked mod/, 403) === '', 'inMod refuses ../x');
  ok(await throwsAsync(() => CP.inMod(path.join(scratch, 'm'), path.join(scratch, 'x')), /only inside/, 403) === '', 'inMod refuses an absolute path');
  ok(await throwsAsync(() => CP.inMod(path.join(scratch, 'm'), 'C:x'), /only inside/, 403) === '', 'inMod refuses a drive path');
  ok(CP.inMod(path.join(scratch, 'm'), 'sound/a.wav') === path.join(scratch, 'm', 'sound', 'a.wav'), 'inMod takes a path inside');
  const zmod = path.join(scratch, 'mods', 'zzmod'); fs.mkdirSync(zmod, { recursive: true });
  const setA = async a => { const d = D.load(ctx, zd.id); Object.assign(d.answers, a); return (await call('POST /api/x/task/draft/save', '/x', { draft: d })).draft; };
  // seeded defect: a write outside the mod
  await setA({ snd: { src: 'file', staged: ['beep.wav'] }, to: { src: 'value', value: '../outside.wav' } });
  ok(await throwsAsync(() => call('POST /api/x/task/write', '/x', { draft: zd.id }), /only inside the picked mod/, 403) === '', 'a copy to ../ is refused');
  ok(!fs.existsSync(path.join(scratch, 'mods', 'outside.wav')), 'nothing was written outside the mod');
  await setA({ to: { src: 'value', value: 'sound/beep.wav' }, cmd: { src: 'value', value: 'other' } });
  ok(await throwsAsync(() => call('POST /api/x/task/plan', '/x', { draft: zd.id }), /must name the picked mod/, 403) === '', 'a new command on another folder is refused');
  await setA({ cmd: { src: 'value', value: 'tool' } });
  ok(await throwsAsync(() => call('POST /api/x/task/plan', '/x', { draft: zd.id }), /only these tools/, 403) === '', 'an unknown tool is refused');
  await setA({ cmd: { src: 'value', value: 'self' } });
  ok(await throwsAsync(() => call('POST /api/x/task/plan', '/x', { draft: zd.id }), /another page/, 403) === '', 'a task route calling the task routes is refused');
  ok(!fs.existsSync(path.join(scratch, 'elsewhere')), 'the refused command made nothing');
  await setA({ cmd: { src: 'value', value: '' } });
  const d0 = D.load(ctx, zd.id); d0.mod = path.join(scratch, 'mods', 'other');
  ok(await throwsAsync(() => CP.write(ctx, d0, Object.assign({}, S.recipes(), { zz: Object.assign({}, zz, { compile: () => ({ mod: zmod }) }) })), /mod you picked/, 403) === '', 'a recipe naming another mod than the picked one is refused');
  const pl = await call('POST /api/x/task/plan', '/x', { draft: zd.id });
  ok(!pl.errors.length && pl.files.length === 1 && pl.files[0].rel === 'sound/beep.wav' && pl.files[0].action === 'new', 'the plan lists one new file', JSON.stringify(pl));
  ok(!fs.existsSync(path.join(zmod, 'sound', 'beep.wav')), 'the plan writes nothing');
  fs.mkdirSync(path.join(zmod, 'sound'), { recursive: true }); fs.writeFileSync(path.join(zmod, 'sound', 'beep.wav'), 'old bytes');
  const wr = await call('POST /api/x/task/write', '/x', { draft: zd.id });
  ok(wr.written && wr.restore.length === 1, 'write writes and takes a restore point', JSON.stringify(wr));
  ok(fs.readFileSync(path.join(zmod, 'sound', 'beep.wav')).equals(wavBuf), 'the staged file is in the mod');
  const rp = path.join(scratch, 'mods', 'zzmod.arsenal-undo', wr.restore[0]);
  let man = null; try { man = JSON.parse(fs.readFileSync(path.join(rp, 'restore-point.json'), 'utf8')); } catch { /* checked below */ }
  ok(man && man.rel === 'sound/beep.wav' && man.existed && fs.readFileSync(path.join(rp, 'files', 'sound', 'beep.wav'), 'utf8') === 'old bytes', 'the restore point keeps the old file', JSON.stringify(man));
  const zd2 = D.load(ctx, zd.id);
  ok(zd2.state === 'written' && zd2.restore.includes(wr.restore[0]), 'the draft remembers the write and its restore point');

  // ---------- 5. LAN Remote: every POST refused, GETs allowed
  for (const k of Object.keys(R).filter(k => /^POST /.test(k)))
    ok(await throwsAsync(() => R[k](new URL('http://x/'), { draft: zd.id, recipe: 'mod', id: zd.id, parent: zd.id, q: 'snd', name: 'a.wav', b64: '' }, rctx), /view only/, 403) === '', 'remote ' + k + ' refused');
  ok(await throwsAsync(() => CP.write(rctx, zd.id, S.recipes()), /view only/, 403) === '', 'compile.write refuses a remote session');
  const RM = require('../../remote');
  ok(!RM.allowed('POST', '/api/x/task/write') && !RM.allowed('POST', '/api/x/task/upload') && !RM.allowed('POST', '/api/x/task/draft/new'), 'remote.js does not allow task POSTs');
  ok(RM.allowed('GET', '/api/x/task/catalogue') && RM.allowed('GET', '/api/x/task/drafts'), 'remote.js allows the task GETs');
  const rcat = await call('GET /api/x/task/catalogue', '/api/x/task/catalogue', null, rctx);
  ok(rcat.recipes.length >= 27, 'a remote device reads the catalogue');

  // ---------- 6. catalogue and delete
  S.setRecipes(Object.values(S.recipes()).filter(r => r.id !== 'zz'));
  const cat = await call('GET /api/x/task/catalogue', '/api/x/task/catalogue?game=goh');
  ok(cat.recipes.length === 28, '28 rows in the catalogue (27 planned, the single-player mission page row)', cat.recipes.length);
  { const sp = cat.recipes.find(r => r.id === 'spmission'), i = cat.recipes.findIndex(r => r.id === 'mission');
    ok(sp && sp.built && sp.page && sp.page.tab === 'missions' && sp.page.flag === 'missionsSp' && sp.verbs.join() === 'make' && sp.forGame === false && cat.recipes[i + 1] === sp,
      'a single-player mission: its own make row right after the mission task, a page row, not for GoH', JSON.stringify(sp)); }
  const built = cat.recipes.filter(r => r.built && !r.page).map(r => r.id);
  ok(built.includes('mod') && built.every(b => EXT.IDS.includes(b)), 'the mod row is built', built.join(','));
  ok(cat.recipes.find(r => r.id === 'x-thing').forGame === false && cat.recipes.find(r => r.id === 'mod').forGame === true, 'forGame follows the game');
  // recipe na: the plain line a greyed row shows on the tab of a game the task leaves out (client.js tkWhyT); none for a game it has
  const naMap = cat.recipes.find(r => r.id === 'x-thing').na, naMod = cat.recipes.find(r => r.id === 'mod').na;
  ok(naMap && naMap.goh === 'task.x-thing.na.goh' && naMod === undefined && naMap !== S.recipes()['x-thing'].na, 'catalogue rows carry the recipe na line (a copy), and none for a recipe with no na', JSON.stringify([naMap, naMod]));
  const cat2 =await call('GET /api/x/task/catalogue', '/api/x/task/catalogue?game=mowas2');
  ok(cat2.recipes.find(r => r.id === 'map').forGame === true && cat2.recipes.find(r => r.id === 'mission').forGame === true, 'map and mission are for MoW:AS2');
  // a draft with no game is as64: the mod recipe asks where (its AS2 questions), a goh draft asks the GoH folder
  const stG = RC.steps(mod, { answers: {}, kept: [], game: 'goh' }, {}).map(s => s.id).join(',');
  ok(!/q:place/.test(stG) && /q:where_goh/.test(stG), 'a goh draft skips the AS2 place question', stG);
  // no game key at all (undefined): only the 'as64' default in when makes the AS2 place question show
  const stE = RC.steps(mod, { answers: {}, kept: [] }, {}).map(s => s.id).join(',');
  ok(/q:place/.test(stE), 'a draft with no game is as64 in when', stE);
  S.setRecipes(Object.values(S.recipes()).concat([zz]));
  const gone = await call('POST /api/x/task/draft/delete', '/x', { id: zd.id });
  ok(gone.gone.includes(zd.id) && gone.gone.includes(kid.draft.id) && !fs.existsSync(D.stageDir(ctx, zd.id)), 'delete takes the branch and the staging folder too', JSON.stringify(gone));
  S.setRecipes(Object.values(S.recipes()).filter(r => r.id !== 'zz'));
  await call('POST /api/x/task/draft/delete', '/x', { id });
  ok(!(await call('GET /api/x/task/drafts', '/x')).drafts.length, 'no drafts left');

  // ---------- 7. outside programs (external.js): registry, list, open (plan, then the confirm token), refusals
  await externalTest(ctx, rctx, call);
  // ---------- 8. explore recipes write nothing; the maps lookup reads the real list shape; the plan's order; route restore points
  await coreFixes(ctx, call);
  // ---------- 8b. README Changes 22 and on: failure rules, commands, own routes, branches at depth, faults, the card name in a .lng
  await coreFixes2(ctx, rctx, call);
  // ---------- 8c. README Changes 38 to 40: a call's own ok over ok:false, runCmd's temp root, picker.branch as a list, the gen plan sees copies
  await coreFixes3(ctx, call);
  // ---------- 8d. README Changes 41 and on: Quick or Everything, names from the game texts, a title per verb
  await coreFixes4(ctx, call);
  // ---------- 8e. README Changes 45 and on: the write gate, the guard, upload content, list sources, $copy, usual, keys
  await coreFixes5(ctx, call);
  // ---------- 8f. README Changes 55 and on: the Review list says copy of a game file, the window layout rules
  await coreFixes6(ctx, call);
  // ---------- 8g. JOBS (tools/gui/README.md): the request's name and progress, a stop between steps, what a stopped write leaves
  await jobsFixes(ctx, call);
  for (const d of (await call('GET /api/x/task/drafts', '/x')).drafts) await call('POST /api/x/task/draft/delete', '/x', { id: d.id });
  ok(!(await call('GET /api/x/task/drafts', '/x')).drafts.length, 'no drafts left after the core checks');

  // ---------- 9. the page: the row and the window in the fake DOM
  await pageTest(ctx);

  console.log('ext task: ' + passes + ' passed, ' + fails + ' failed');
  console.log(fails ? 'FAIL' : 'PASS');
  if (fails) process.exitCode = 1;
})().catch(e => { console.log('FAIL crash ' + (e.stack || e)); console.log('FAIL'); process.exitCode = 1; });

// fake programs under the scratch folder; nothing on this PC is searched (fake env, no registry) and nothing is started (fake spawn)
const E = require('./external'), STARTS = [];
function externalHooks() {
  const pf = path.join(scratch, 'pf'), game = path.join(scratch, 'game');
  for (const f of [path.join(pf, 'Audacity', 'Audacity.exe'), path.join(pf, 'Dummy', 'dummy.exe'), path.join(game, 'as64_ed.exe')]) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'MZ fake'); }
  E._reset();
  E._hooks({ platform: 'win32', env: { ProgramFiles: pf, PATH: '' }, reg: () => [], soedit: () => null, game,
    spawn: (file, args, so) => { STARTS.push({ file, args, so }); return { pid: 1, on() {}, unref() {} }; } });
  return { pf, game };
}
async function externalTest(ctx, rctx, call) {
  const T = path.join(__dirname, 'lang'), rows = require(T), by = { en: {}, ru: {}, uk: {}, zh: {} };
  for (const r of rows) ['en', 'ru', 'uk', 'zh'].forEach((l, i) => { by[l][r[0]] = r[i + 1]; });
  const DASH = /[‒–—―]| - /;
  // registry: every entry complete, in 4 languages, one per census row
  const census = JSON.parse(fs.readFileSync(path.join(__dirname, 'census', 'external.json'), 'utf8'));
  ok(census.every(c => E.byId(c.id)), 'every outside program of census/external.json has a registry entry', census.filter(c => !E.byId(c.id)).map(c => c.id).join(','));
  ok(new Set(E.PROGRAMS.map(p => p.id)).size === E.PROGRAMS.length, 'registry ids are unique');
  for (const p of E.PROGRAMS) {
    const pr = E.checkEntry(p);
    ok(!pr.length, 'registry entry ' + p.id + ' is complete', pr.join('; '));
    for (const k of E.keysOf(p)) for (const l of ['en', 'ru', 'uk', 'zh']) {
      ok(typeof by[l][k] === 'string' && by[l][k].trim() !== '', 'lang ' + l + ' has ' + k);
      ok(!DASH.test(by[l][k] || ''), 'lang ' + l + ' ' + k + ' has no dash', by[l][k]);
    }
  }
  for (const k of rows.map(r => r[0]).filter(k => /^task\.ho\./.test(k))) for (const l of ['en', 'ru', 'uk', 'zh']) ok(!DASH.test(by[l][k] || ''), 'lang ' + l + ' ' + k + ' has no dash');
  ok(E.checkEntry({ id: 'x', name: 'X', for: ['sound'], open: 'exe', find: {}, steps: ['task.other.s1'], back: { kinds: [] } }).length > 0, 'seeded defect: an entry with steps outside task.prog.<id>. is refused');
  ok(E.checkEntry({ id: 'x', name: 'X', for: ['sound'], open: 'default', find: {}, steps: ['task.prog.x.s1'], back: { kinds: [] } }).some(m => /assoc/.test(m)), 'seeded defect: open default without find.assoc is refused');

  const { game } = externalHooks();
  // a dummy entry added in the test shows in the list
  E._add({ id: 'zz-prog', name: 'Dummy program', for: ['sound'], open: 'exe', find: { paths: ['%ProgramFiles%\\Dummy\\dummy.exe'] }, steps: ['task.prog.zz-prog.s1'], back: { kinds: ['sound'], inMod: false } });
  const L = await call('GET /api/x/task/external', '/api/x/task/external');
  ok(L.programs.length === E.PROGRAMS.length + 1 && L.programs.some(p => p.id === 'zz-prog' && p.found && /dummy\.exe$/i.test(p.path)), 'a dummy entry added in the test shows in the list, found', JSON.stringify(L.programs.map(p => p.id)));
  const aud = L.programs.find(p => p.id === 'audacity'), ge = L.programs.find(p => p.id === 'game-editor'), bl = L.programs.find(p => p.id === 'blender-gem2');
  ok(aud && aud.found && aud.can.start && aud.can.file, 'Audacity is found in the fake Program Files and can open', JSON.stringify(aud));
  ok(ge && ge.found && ge.path === path.join(game, 'as64_ed.exe') && !ge.can.start && !ge.can.file && ge.can.reveal, 'the game editor is found in the game folder, only Show in folder', JSON.stringify(ge));
  ok(bl && !bl.found && bl.path === null && bl.guide, 'a program that is not there says not found and names its Guides words', JSON.stringify(bl));
  const Ls = await call('GET /api/x/task/external', '/api/x/task/external?for=sound');
  ok(Ls.programs.length && Ls.programs.every(p => p.for.includes('sound')), 'for=sound lists the sound programs only', Ls.programs.map(p => p.id).join(','));
  const Li = await call('GET /api/x/task/external', '/api/x/task/external?ids=notepadpp,audacity');
  ok(Li.programs[0].id === 'notepadpp' && Li.programs[1].id === 'audacity', 'ids keep their order', Li.programs.map(p => p.id).join(','));
  const Lr = await call('GET /api/x/task/external', '/api/x/task/external', null, rctx);
  ok(Lr.programs.every(p => p.path === null && !p.can.start && !p.can.folder), 'a phone gets the list with no paths and no buttons');
  // PERF A11: the route looks the programs up with awaited registry queries; same queries, same order, same answer as the blocking list
  { const asked = [], rec = (k, v, s) => { asked.push([k, v, !!s].join('|')); return []; };
    E._hooks({ reg: rec }); const sync = E.listRoute(new URL('http://127.0.0.1/api/x/task/external'), null, ctx), qs = asked.splice(0);
    E._hooks({ reg: rec }); const viaRoute = await call('GET /api/x/task/external', '/api/x/task/external'), qa = asked.splice(0);
    const again = await call('GET /api/x/task/external', '/api/x/task/external');
    ok(qs.length > 0 && JSON.stringify(qs) === JSON.stringify(qa) && JSON.stringify(sync) === JSON.stringify(viaRoute), 'the awaited list asks the registry the same questions in the same order and answers the same', qs.length + ' / ' + qa.length);
    ok(!asked.length && JSON.stringify(again) === JSON.stringify(viaRoute), 'a second list within a minute asks the registry nothing', asked.length);
    E._hooks({ reg: () => [] }); }

  // open: a draft with a picked mod and a staged file
  const emod = path.join(scratch, 'mods', 'extmod'); fs.mkdirSync(path.join(emod, 'sound'), { recursive: true }); fs.writeFileSync(path.join(emod, 'sound', 'a.wav'), 'x');
  const d = D.save(ctx, { id: D.newId('mod'), recipe: 'mod', verb: 'make', game: 'as64', mod: emod, answers: {}, kept: [], state: 'open' });
  const sf = D.stagedPath(ctx, d.id, 'take.wav'); fs.mkdirSync(path.dirname(sf), { recursive: true }); fs.writeFileSync(sf, 'x');
  const open = (b, c) => call('POST /api/x/task/external/open', '/api/x/task/external/open', Object.assign({ draft: d.id }, b), c);
  STARTS.length = 0;
  ok(await throwsAsync(() => open({ id: 'audacity', action: 'start', plan: true }, rctx), /view only/, 403) === '', 'open is refused from the phone view');
  ok(await throwsAsync(() => open({ id: 'audacity', action: 'file', path: path.join(scratch, 'pf', 'Audacity', 'Audacity.exe'), plan: true }), /staging folder or in the picked mod/, 403) === '', 'open is refused for a path outside the staging folder and the mod');
  ok(await throwsAsync(() => open({ id: 'audacity', action: 'file', rel: '../other/x.wav', plan: true }), /only inside the picked mod/, 403) === '', 'open is refused for ../ out of the mod');
  ok(await throwsAsync(() => open({ id: 'audacity', action: 'file', staged: '../x.wav', plan: true }), /cannot be staged|leaves the staging/) === '', 'open is refused for a staged name that leaves staging');
  ok(await throwsAsync(() => open({ id: 'audacity', action: 'start' }), /Ask first/, 409) === '', 'open without the plan and confirm flow is refused');
  ok(await throwsAsync(() => open({ id: 'audacity', action: 'start', token: 'made-up' }), /Ask first/, 409) === '', 'open with a made up token is refused');
  ok(await throwsAsync(() => open({ id: 'game-editor', action: 'start', plan: true }), /only through ARSENAL/, 403) === '', 'the game editor is never started from here');
  ok(await throwsAsync(() => open({ id: 'blender-gem2', action: 'start', plan: true }), /not on this PC/, 404) === '', 'a program that is not there does not open');
  ok(await throwsAsync(() => open({ id: 'nope', action: 'start', plan: true }), /No outside program/, 404) === '', 'an id not in the registry is refused');
  ok(!STARTS.length, 'nothing was started by the refusals');
  const pl = await open({ id: 'audacity', action: 'file', staged: 'take.wav', plan: true });
  ok(pl.plan && pl.token && pl.target === sf && /Audacity\.exe$/.test(pl.program) && !STARTS.length, 'plan says what would open, gives a token and starts nothing', JSON.stringify(pl));
  ok(await throwsAsync(() => open({ id: 'audacity', action: 'file', staged: 'other.wav', token: pl.token }), /Ask first|cannot|gone/) === '', 'the token does not open another file');
  const pl2 = await open({ id: 'audacity', action: 'file', staged: 'take.wav', plan: true });
  const r = await open({ id: 'audacity', action: 'file', staged: 'take.wav', token: pl2.token });
  ok(r.ok && STARTS.length === 1 && /Audacity\.exe$/.test(STARTS[0].file) && STARTS[0].args[0] === sf && STARTS[0].so.shell === false, 'after the confirm the program gets the staged file as one argument, no shell', JSON.stringify(STARTS));
  ok(await throwsAsync(() => open({ id: 'audacity', action: 'file', staged: 'take.wav', token: pl2.token }), /Ask first/, 409) === '', 'a token works once');
  const pm = await open({ id: 'audacity', action: 'file', rel: 'sound/a.wav', plan: true });
  ok(pm.target === path.join(emod, 'sound', 'a.wav'), 'a file of the picked mod may open', pm.target);
  const fo = await open({ id: 'audacity', action: 'folder' });
  ok(fo.target === emod && STARTS.length === 2 && /explorer/i.test(STARTS[1].file) && STARTS[1].args[0] === emod, 'the folder button opens the picked mod folder', JSON.stringify(STARTS[1]));
  const rv = await open({ id: 'game-editor', action: 'reveal' });
  ok(rv.target === path.join(game, 'as64_ed.exe') && STARTS.length === 3 && /^\/select,/.test(STARTS[2].args[0]), 'Show in folder shows the editor, never starts it', JSON.stringify(STARTS[2]));
  ok(!STARTS.some(s => /as64_ed\.exe$/i.test(s.file)), 'the game editor was never the started program');
  E._reset();
}

async function coreFixes(ctx, call) {
  // explore: no review, write, check or test, as a top task, as a branch, and for a recipe that only explores
  const ex = { id: 'zx', verbs: ['explore'], games: ['as64'], needs: ['mod'], title: 'task.zx.t', checklist: ['task.zx.c'], groups: [{ id: 'g', title: 'task.zx.g', q: [{ id: 'a', kind: 'text', ask: 'task.zx.q' }] }] };
  const W = ['review', 'write', 'check', 'test', 'checklist'];
  const s1 = RC.steps(ex, { verb: 'explore', answers: {} }, {}), s2 = RC.steps(ex, { verb: 'make', answers: {} }, {}), s3 = RC.steps(ex, { verb: 'make', answers: {}, parent: { draft: 'p', q: 'x' } }, {});
  ok(!s1.concat(s2, s3).some(s => W.includes(s.kind)), 'explore recipes get no review, write, check or test steps', [s1, s2, s3].map(a => a.map(s => s.id).join(',')).join(' | '));
  ok(s1[s1.length - 1].kind === 'done' && s3[s3.length - 1].kind === 'back', 'explore ends with done, an explore branch with back');
  const mixed = { id: 'zm', verbs: ['make', 'explore'], games: ['as64'], title: 'task.zm.t', groups: [], compile: () => ({}) };
  ok(!RC.steps(mixed, { verb: 'explore', answers: {} }, {}).some(s => W.includes(s.kind)) && RC.steps(mixed, { verb: 'make', answers: {} }, {}).some(s => s.kind === 'write'), 'a make and explore recipe writes only when made');
  for (const r of Object.values(S.recipes()).filter(r => r.verbs.includes('explore'))) ok(!RC.steps(r, { verb: 'explore', answers: {} }, {}).some(s => W.includes(s.kind)), 'loaded explore recipe ' + r.id + ' has no write steps');
  S.setRecipes(Object.values(S.recipes()).concat([mixed]));
  const xd = D.save(ctx, { id: D.newId('zm'), recipe: 'zm', verb: 'explore', game: 'as64', mod: path.join(scratch, 'mods', 'zzmod'), answers: {}, kept: [], state: 'open' });
  ok(await throwsAsync(() => call('POST /api/x/task/plan', '/x', { draft: xd.id }), /explore task writes nothing/, 400) === '', 'plan refuses an explore draft');
  ok(await throwsAsync(() => call('POST /api/x/task/write', '/x', { draft: xd.id }), /explore task writes nothing/, 400) === '', 'write refuses an explore draft');
  D.remove(ctx, xd.id);
  S.setRecipes(Object.values(S.recipes()).filter(r => r.id !== 'zm'));

  // maps lookup over the real GET /api/x/maps/list shape (state, maps[{key, modes, mod, folder, name, players, mods, copy}])
  const M = require('../maps'), real = M.routes['GET /api/x/maps/list'];
  try {
    M.routes['GET /api/x/maps/list'] = async () => ({ state: 'done', cached: true, at: 1, maps: [
      { key: 'map/multi/2v2_bastogne', modes: ['battle_zones', 'combat'], mod: '', folder: '2v2_bastogne', name: 'Bastogne', players: 4, mods: [], copy: true },
      { key: 'map/multi/0_frontlines/1v1_cobra', modes: ['frontlines'], mod: 'gohfull_pak', folder: '1v1_cobra', name: 'Cobra', players: 2, mods: ['gohfull_pak'], copy: false }] });
    const a = await call('GET /api/x/task/lookup', '/api/x/task/lookup?kind=map&q=bastogne');
    ok(a.state === 'done' && a.results.length === 1 && a.results[0].id === 'map/multi/2v2_bastogne' && a.results[0].name === 'Bastogne' && a.results[0].where === 'game' && /4p/.test(a.results[0].sub), 'the map lookup reads key, title, folder, modes and players', JSON.stringify(a));
    const b = await call('GET /api/x/task/lookup', '/api/x/task/lookup?kind=map&q=cobra');
    ok(b.results.length === 1 && b.results[0].where === 'gohfull_pak' && b.results[0].copy === false, 'a map in a mod pak names the mod and cannot be copied', JSON.stringify(b.results));
    const c = await call('GET /api/x/task/lookup', '/api/x/task/lookup?kind=map&q=2v2_bastogne');
    ok(c.exact === true, 'the folder name is an exact match');
    M.routes['GET /api/x/maps/list'] = async () => ({ state: 'running', elapsed: 3 });
    ok((await call('GET /api/x/task/lookup', '/api/x/task/lookup?kind=map&q=x')).state === 'running', 'a list that is still building says running');
    M.routes['GET /api/x/maps/list'] = async () => ({ state: 'error', error: 'maps.e.nomaps' });
    ok((await call('GET /api/x/task/lookup', '/api/x/task/lookup?kind=map&q=x')).state === 'error', 'a list that failed says error, not running');
    M.routes['GET /api/x/maps/list'] = async () => { throw new Error('no game folder'); };
    ok((await call('GET /api/x/task/lookup', '/api/x/task/lookup?kind=map&q=x')).state === 'nogame', 'no game folder says nogame');
  } finally { M.routes['GET /api/x/maps/list'] = real; }

  // the drop-down keeps the plan's order and shows a loaded recipe as built
  const keep = S.recipes();
  S.setRecipes(Object.values(keep).map(r => r.id === 'mod' ? Object.assign({}, r, { order: 9999 }) : r));
  const cat = await call('GET /api/x/task/catalogue', '/api/x/task/catalogue');
  ok(cat.recipes[0].id === 'mod' && cat.recipes[0].built && cat.recipes.filter(r => !r.page).slice(0, 27).map(r => r.id).join(',') === S.PLANNED.map(p => p.id).join(','), 'the catalogue keeps the plan order whatever order a recipe says', cat.recipes.map(r => r.id).join(','));
  ok(cat.recipes.filter(r => S.recipes()[r.id]).every(r => r.built), 'every loaded recipe is built in the catalogue');
  S.setRecipes(Object.values(keep));

  // a route call: the files its dry run names get a restore point first; files it writes without naming them are listed plainly
  const exts = require('../index'), rmod = path.join(scratch, 'mods', 'routemod'); fs.mkdirSync(rmod, { recursive: true });
  fs.writeFileSync(path.join(rmod, 'named.txt'), 'old named');
  const fake = { id: 'zzfake', routes: { 'POST /api/x/zzfake/do': async (u, b) => {
    if (b.write) { fs.writeFileSync(path.join(b.mod, 'named.txt'), 'new named'); fs.writeFileSync(path.join(b.mod, 'quiet.txt'), 'not named'); }
    return { files: [{ file: 'named.txt' }], written: !!b.write };
  } } };
  exts.push(fake);
  // the fake route reads write (false: its dry run): the call says so with dryFlag (a route in neither ROUTE_DRY nor dryFlag is not called in plan)
  const zr = { id: 'zr', verbs: ['make'], games: ['as64'], title: 'task.zr.t', groups: [], compile: () => ({ calls: [{ route: 'POST /api/x/zzfake/do', body: {}, dryFlag: 'write' }] }) };
  S.setRecipes(Object.values(S.recipes()).concat([zr]));
  try {
    const rd = D.save(ctx, { id: D.newId('zr'), recipe: 'zr', verb: 'make', game: 'as64', mod: rmod, answers: {}, kept: [], state: 'open' });
    const p = await call('POST /api/x/task/plan', '/x', { draft: rd.id });
    ok(p.files.some(f => f.rel === 'named.txt' && f.action === 'change') && fs.readFileSync(path.join(rmod, 'named.txt'), 'utf8') === 'old named', 'the plan lists the files a route names and writes nothing', JSON.stringify(p.files));
    const w = await call('POST /api/x/task/write', '/x', { draft: rd.id });
    ok(w.written && w.restore.length === 2, 'the route call wrote, with a restore point for its named file and one for the file it did not name', JSON.stringify({ restore: w.restore, errors: w.errors }));
    const mans = w.restore.map(id => JSON.parse(fs.readFileSync(path.join(scratch, 'mods', 'routemod.arsenal-undo', id, 'restore-point.json'), 'utf8')));
    const man = mans.find(m => m.rel === 'named.txt'), mq = mans.find(m => m.rel === 'quiet.txt');
    ok(man && fs.readFileSync(path.join(scratch, 'mods', 'routemod.arsenal-undo', man.id, 'files', 'named.txt'), 'utf8') === 'old named', 'the restore point keeps the old bytes of the named file');
    ok(mq && mq.existed === false, 'the file the route wrote without naming it gets a restore point too (it was new)', JSON.stringify(mans));
    ok(Array.isArray(w.unguarded) && w.unguarded.length === 0, 'no file is left without a restore point', JSON.stringify(w.unguarded));
    D.remove(ctx, rd.id);
    // a route with no dry run: not called in plan (listed as running at Write), its files guarded by the listing at Write
    fs.writeFileSync(path.join(rmod, 'named.txt'), 'old named');
    S.setRecipes(Object.values(S.recipes()).filter(r => r.id !== 'zr').concat([Object.assign({}, zr, { compile: () => ({ calls: [{ route: 'POST /api/x/zzfake/do', body: {} }] }) })]));
    const rd2 = D.save(ctx, { id: D.newId('zr'), recipe: 'zr', verb: 'make', game: 'as64', mod: rmod, answers: {}, kept: [], state: 'open' });
    const p2 = await call('POST /api/x/task/plan', '/x', { draft: rd2.id });
    ok(p2.calls.length === 1 && p2.calls[0].later && p2.notes.some(n => /no dry run/.test(n)) && fs.readFileSync(path.join(rmod, 'named.txt'), 'utf8') === 'old named', 'a route with no dry run is not called in plan; the plan says it runs at Write', JSON.stringify(p2.calls));
    const w2 = await call('POST /api/x/task/write', '/x', { draft: rd2.id });
    ok(w2.written && w2.restore.length === 2 && !w2.unguarded.length, 'at Write its files get restore points from the listing', JSON.stringify({ r: w2.restore, u: w2.unguarded }));
    D.remove(ctx, rd2.id);
  } finally { exts.splice(exts.indexOf(fake), 1); S.setRecipes(Object.values(S.recipes()).filter(r => r.id !== 'zr')); }
}

async function pageTest(ctx) {
  const fakedom = require(path.join(GUI, 'test', 'fakedom')), contract = require(path.join(GUI, 'contract')), html = require(path.join(GUI, 'page.js'));
  const BC = require(path.join(GUI, 'test', 'blockcheck'));
  const doc = fakedom.make(), store = new Map(), sstore = new Map(), posts = [], toasts = [];
  const row = doc.createElement('div'); row.setAttribute('id', 'taskrow'); doc.body.insertBefore(row, doc.getElementById('nav'));
  const where = path.join(scratch, 'pagemods'); fs.mkdirSync(where, { recursive: true });
  const resp = (o, status) => Promise.resolve({ ok: !status, status: status || 200, json: () => Promise.resolve(clone(o)), body: null });
  const routes = EXT.routes, VROUTES = require('../view').routes;
  // every planned recipe is built now: a seeded fault on one row gives the drop-down a greyed task (a recipe that failed to load)
  const keepR = S.recipes();
  S.setRecipes(Object.values(keepR).filter(r => r.id !== 'release'), [{ id: 'release', error: 'seeded fault' }]);
  const w = {
    document: doc, console, TextDecoder, atob: x => Buffer.from(String(x), 'base64').toString('latin1'), setTimeout: pageTimeout, clearTimeout: pageClear, setInterval: () => 0,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    sessionStorage: { getItem: k => (sstore.has(k) ? sstore.get(k) : null), setItem: (k, v) => sstore.set(k, String(v)), removeItem: k => sstore.delete(k) },
    confirm: () => true,
    fetch: (u, o) => {
      const m = (o && o.method) || 'GET', url = new URL(String(u), 'http://127.0.0.1'), p = url.pathname;
      if (fetchHook) { const hr = fetchHook(m + ' ' + p, url, o); if (hr) return hr; }   // JOBS: pageJobs answers the task's plan and write itself
      if (p === '/api/health') return resp({ ok: true, allowLaunch: false, version: 'test' });
      if (p === '/api/commands') return resp({ commands: contract.describe() });
      if (p === '/api/settings') return resp(m === 'GET' ? { settings: {}, empty: true, file: '' } : { ok: true });
      if (p === '/api/game') return resp({ dir: '', tried: [], ok: false, codes: ['none'] });
      if (p === '/api/mods') return resp({ mods: [], roots: [] });
      // the view routes too (the look pane reads files through them)
      const fn = routes[m + ' ' + p] || VROUTES[m + ' ' + p];
      if (fn) {
        if (m === 'POST') posts.push(p);
        return counted(Promise.resolve().then(() => fn(url, o && o.body ? JSON.parse(o.body) : null, ctx)).then(r => resp(r), e => resp({ error: e.message }, e.status || 500)));
      }
      return new Promise(() => {});
    },
  };
  w.window = w; vm.createContext(w);
  try { vm.runInContext(/<script>([\s\S]*)<\/script>/.exec(html)[1], w, { filename: 'page.js:script' }); }
  catch (e) { ok(false, 'the page script runs', e.stack); return; }
  await tickUntil(() => w.__as2gui);
  ok(!!w.__as2gui, 'the page finished building', doc.getElementById('main').textContent.slice(0, 300));
  ok(!!w.TASK && typeof w.TASK.open === 'function', 'window.TASK is there');
  await tickUntil(() => row.querySelector('button[data-task-start]'));
  const start = row.querySelector('button[data-task-start]'), rs = row.querySelector('select[data-task-recipe]'), vs = row.querySelector('select[data-task-verb]');
  ok(!!start && !!rs && !!vs && !!row.querySelector('input[data-task-filter]'), 'the row has the verb, the filter, the task list and Start', row.textContent);
  ok(row.querySelector('span.tk-lbl') && row.querySelector('span.tk-lbl').textContent.length > 0, 'the row has its label');
  { const kids = row.children, li = kids.findIndex(k => k.classList && k.classList.contains('tk-lbl')), dash = kids[li + 1];
    ok(dash && dash.classList.contains('tk-dash') && dash.textContent === '-' && dash.attrs['aria-hidden'] === 'true' && row.querySelectorAll('span.tk-dash').length === 1, 'the loaded row: a "-" mark right after the label, hidden from screen readers, not part of the lang string'); }
  const opts = rs ? rs.querySelectorAll('option') : [];
  ok(opts.length > 5 && opts.some(o => o.attrs.value === 'mod' && !o.disabled), 'the make list has the mod task enabled', opts.map(o => o.attrs.value + (o.disabled ? '*' : '')).join(','));
  const grey = opts.filter(o => o.disabled);
  ok(grey.length && grey.every(o => o.dataset.why && /\(/.test(o.textContent)), 'greyed tasks show their reason', grey.slice(0, 3).map(o => o.textContent).join(' | '));
  ok(grey.some(o => o.attrs.value === 'release' && /seeded fault/.test(o.textContent)), 'a recipe with a fault shows greyed with its error', grey.map(o => o.attrs.value + ': ' + o.textContent).join(' | '));
  S.setRecipes(Object.values(keepR));
  ok(rs && rs.value === 'mod' && start && !start.disabled, 'the first task that can start is picked', rs && rs.value);
  ok(!row.querySelector('button[data-task-continue]'), 'no Continue without drafts');
  // the single-player mission row: Start opens the Missions page at the card (no task window)
  { const o = rs.querySelectorAll('option').find(x => x.attrs.value === 'spmission');
    ok(o && !o.disabled && o.textContent.indexOf('a single-player mission') >= 0, 'the make list has "a single-player mission"', o && o.textContent);
    rs.value = 'spmission'; rs.fire ? rs.fire('change') : 0; start.click(); await ticks(20);
    const tw = doc.getElementById('taskwin');
    const scr = [...store.entries()].filter(([k]) => /screen/.test(k)).map(([k, v]) => k + '=' + v);
    ok(scr.some(x => /missions/.test(x)) && (!tw || tw.hidden), 'Start on it: the Missions page (the single-player card), no task window', scr.join());
    rs.value = 'mod'; }

  // open the mod task: the window, the body class, the steps
  await w.TASK.open('mod', 'make');
  await ticks(50);
  const win = doc.getElementById('taskwin');
  ok(!!win && !win.hidden, 'the task window opens');
  ok(doc.body.classList.contains('task-open'), 'the body has task-open (tabs and pages hidden)');
  const steps = win ? win.querySelectorAll('button.tk-step') : [];
  ok(steps.length === 11 && steps[0].dataset.step === 'q:title', 'the step list has the 11 steps of the mod task', steps.map(s => s.dataset.step).join(','));
  ok(steps.length && steps[0].classList.contains('tk-cur'), 'the first step is current');
  const cnt = win.querySelector('span[data-task-count]');
  ok(cnt && /1/.test(cnt.textContent) && /11/.test(cnt.textContent), 'the title shows step 1 of 11', cnt && cnt.textContent);
  const probs = BC.checkScreen(win, 'task');
  ok(!probs.length, 'the task window follows the blocks contract', probs.slice(0, 5).join(' | '));
  const st0 = w.TASK.state();
  ok(st0.draft && st0.draft.recipe === 'mod' && posts.includes('/api/x/task/draft/new'), 'a draft was made for the task');
  // title first; Next moves on and saves
  let inp = win.querySelector('input[data-task-input]');
  ok(!!inp, 'the title question has an input');
  inp.value = 'Page Mod 2!';
  w.TASK.next(); await ticks(30);
  ok(w.TASK.state().at === 1, 'Next goes to the place question', w.TASK.state().at);
  ok(D.load(ctx, st0.draft.id).answers.title.value === 'Page Mod 2!', 'the answer is saved in the draft');
  // place: a choice, the game's mods folder picked; Another folder adds the where question
  const pl = win.querySelectorAll('input[name=tkq]');
  ok(pl.length === 2 && pl[0].checked && pl[0].attrs.value === 'game', 'the place is a choice with the game mods folder picked', pl.map(p => p.attrs.value + (p.checked ? '*' : '')).join(','));
  pl[1].checked = true; pl[1].fire('change');
  w.TASK.next(); await ticks(30);
  ok(w.TASK.state().steps[w.TASK.state().at].id === 'q:where', 'Another folder goes to the where question', JSON.stringify(w.TASK.state().steps[w.TASK.state().at]));
  inp = win.querySelector('input[data-task-input]'); inp.value = where;
  w.TASK.next(); await ticks(30);
  ok(w.TASK.state().at === 3, 'Next goes to the folder question', w.TASK.state().at);
  // folder: suggested from the title (seeded: no suggestion would leave it empty)
  inp = win.querySelector('input[data-task-input]');
  ok(inp && inp.value === 'page_mod_2', 'the folder name is suggested from the title', inp && inp.value);
  // a bad name is refused with a message and the example of the form, a good one goes on
  inp.value = 'Bad Name';
  w.TASK.next(); await ticks(30);
  const rf = win.querySelector('div[data-task-refuse]');
  ok(w.TASK.state().at === 3 && !!rf && /my_first_mod/.test(rf.textContent), 'a folder name that breaks the rule is refused with an example', rf && rf.textContent);
  fs.mkdirSync(path.join(where, 'taken'), { recursive: true });
  inp = win.querySelector('input[data-task-input]'); inp.value = 'taken';
  w.TASK.next(); await ticks(30);
  ok(w.TASK.state().at === 3, 'a folder that is already there is refused', w.TASK.state().at);
  inp = win.querySelector('input[data-task-input]'); inp.value = 'pagemod';
  w.TASK.next(); await ticks(30);
  ok(w.TASK.state().at === 4, 'a free folder name goes on');
  w.TASK.back(); await ticks(10);
  ok(w.TASK.state().at === 3, 'Back goes one step back');
  const sofar = win.querySelector('div[data-task-sofar]');
  ok(sofar && /pagemod/.test(sofar.textContent), 'So far shows the answers', sofar && sofar.textContent);
  // Esc closes: the window hides, the body class goes, the draft is under Continue
  win.fire('keydown', { key: 'Escape', target: win });
  await ticks(40);
  ok(win.hidden && !doc.body.classList.contains('task-open'), 'Esc closes the window');
  await tickUntil(() => row.querySelector('button[data-task-continue]'));
  ok(!!row.querySelector('button[data-task-continue]') && !!row.querySelector('button[data-task-del]'), 'Continue and Delete show once a draft exists');
  await w.TASK.resume(st0.draft.id); await ticks(30);
  ok(!win.hidden && w.TASK.state().at === 3, 'Continue opens the draft where it was left', w.TASK.state().at);
  await w.TASK.close(); await ticks(30);
  ok(!fs.existsSync(path.join(where, 'pagemod')), 'the page wrote nothing on its own');

  // the hand-off card: programs, found or not, steps, Open it through the confirm box, the folder, I am done
  externalHooks(); STARTS.length = 0;
  const zh = { id: 'zh', verbs: ['make'], games: ['as64', 'mowas2'], needs: [], title: 'task.zh.t', groups: [{ id: 'g', title: 'task.zh.g', essential: true, q: [
    { id: 'snd', kind: 'handoff', ask: 'task.zh.q', picker: { sources: ['ext', 'file'], kinds: ['sound'], ext: ['audacity', 'blender-gem2'] } }] }], compile: () => ({}) };
  const keep = S.recipes(); S.setRecipes(Object.values(keep).concat([zh]));
  try {
    await w.TASK.open('zh', 'make'); await ticks(60);
    const card = win.querySelector('div[data-task-hocard]');
    ok(!!card, 'the hand-off question shows the program card', win.querySelector('div[data-task-q]') && win.querySelector('div[data-task-q]').textContent.slice(0, 300));
    const progs = win.querySelectorAll('input[data-task-prog]');
    ok(progs.length === 2 && progs[0].attrs.value === 'audacity', 'the card lists the programs the question names, in order', progs.map(p => p.attrs.value).join(','));
    ok(card && /Audacity/.test(card.querySelector('b[data-task-progname]').textContent) && card.querySelector('div[data-task-found]').dataset['task-found'] === '1', 'Audacity shows as found on this PC');
    ok(card && card.querySelectorAll('div[data-task-hostep]').length === 3, 'the numbered steps are on the card');
    ok(card && !!card.querySelector('button[data-task-hofolder]') && !!card.querySelector('button[data-task-hodone]'), 'the card has the folder button and I am done');
    const ob = card && card.querySelector('button[data-task-hoopen]');
    ok(!!ob, 'the card has Open it');
    if (ob) { ob.click(); await ticks(60); }
    ok(STARTS.length === 1 && /Audacity\.exe$/.test(STARTS[0].file) && STARTS[0].so.shell === false, 'Open it plans, asks (the confirm box) and only then starts the fake program', JSON.stringify(STARTS));
    progs[1].checked = true; progs[1].fire('change'); await ticks(10);
    const c2 = win.querySelector('div[data-task-hocard]');
    ok(c2 && c2.querySelector('div[data-task-found]').dataset['task-found'] === '0' && !!c2.querySelector('button[data-task-guides]') && !c2.querySelector('button[data-task-hoopen]'), 'a program not on this PC says so, points at Guides & External Tools and has no Open it', c2 && c2.textContent.slice(0, 300));
    c2.querySelector('button[data-task-hodone]').click(); await ticks(10);
    ok(!!win.querySelector('input[data-task-file]'), 'I am done goes to the upload source');
    const probs = BC.checkScreen(win, 'task');
    ok(!probs.length, 'the hand-off card follows the blocks contract', probs.slice(0, 5).join(' | '));
    await w.TASK.close(); await ticks(30);
  } finally { S.setRecipes(Object.values(keep)); E._reset(); }

  // picker.branch as a list: the "what kind" choice before Start, the child is that recipe, So far names the kind
  const keep2 = S.recipes(); S.setRecipes(Object.values(keep2).concat([zka, zkb, zkkOf(null)]));
  const toReturn = async () => { for (let i = 0; i < 12 && !win.querySelector('button[data-task-return]'); i++) { w.TASK.next(); await ticks(20); } return win.querySelector('button[data-task-return]'); };
  try {
    await w.TASK.open('zkk', 'make'); await ticks(40);
    const pid = w.TASK.state().draft.id, kinds = win.querySelectorAll('input[data-task-kind]');
    ok(kinds.length === 2 && kinds[0].attrs.value === 'zka' && kinds[1].attrs.value === 'zkb', 'a question with several recipes shows the kind choice', kinds.map(k => k.attrs.value).join(','));
    // seeded defect: Start with no kind picked is refused on the page, no child made
    win.querySelector('button[data-task-branch]').click(); await ticks(20);
    ok(!!win.querySelector('div[data-task-refuse]') && !D.childrenOf(ctx, pid).length && w.TASK.state().stack === 0, 'Start with no kind picked is refused');
    kinds[1].checked = true; kinds[1].fire('change'); await ticks(5);
    win.querySelector('button[data-task-branch]').click(); await ticks(40);
    ok(w.TASK.state().draft.recipe === 'zkb' && w.TASK.state().stack === 1, 'Start opens a child of the kind picked', JSON.stringify({ r: w.TASK.state().draft.recipe, s: w.TASK.state().stack }));
    let back = await toReturn();
    ok(!!back, 'the child task has its way back');
    if (back) { back.click(); await ticks(40); }
    const pa = D.load(ctx, pid).answers.one;
    ok(w.TASK.state().draft.id === pid && pa && pa.src === 'branch' && pa.recipe === 'zkb' && !!pa.child, 'back in the parent, the answer keeps the kind', JSON.stringify(pa));
    const sf1 = win.querySelector('div[data-task-sofar]');
    ok(sf1 && /zkb/.test(sf1.textContent), 'So far names the kind', sf1 && sf1.textContent);
    // the list question: each line picks its kind
    w.TASK.next(); await ticks(30);
    win.querySelector('button[data-task-addline]').click(); await ticks(5);
    const ls = win.querySelector('select[data-task-linesrc]'); ls.value = 'branch'; ls.fire('change'); await ticks(5);
    const lk = win.querySelector('select[data-task-linekind]');
    ok(!!lk && lk.querySelectorAll('option').length === 3, 'a branch line has its own kind choice', lk && lk.textContent);
    win.querySelector('button[data-task-linebranch]').click(); await ticks(20);
    ok(!!win.querySelector('div[data-task-refuse]') && w.TASK.state().stack === 0, 'a line with no kind picked is refused');
    const lk2 = win.querySelector('select[data-task-linekind]'); lk2.value = 'zka'; lk2.fire('change'); await ticks(5);
    win.querySelector('button[data-task-linebranch]').click(); await ticks(40);
    ok(w.TASK.state().draft.recipe === 'zka' && w.TASK.state().draft.parent.line === 0, 'the line opens a child of its kind', JSON.stringify(w.TASK.state().draft.parent));
    back = await toReturn(); if (back) { back.click(); await ticks(40); }
    const la = D.load(ctx, pid).answers.many;
    ok(la && la.src === 'list' && la.items[0] && la.items[0].recipe === 'zka' && !!la.items[0].child, 'the list line keeps its kind', JSON.stringify(la));
    const sf2 = win.querySelector('div[data-task-sofar]');
    ok(sf2 && /zka/.test(sf2.textContent), 'So far names the kind of a list line', sf2 && sf2.textContent);
    const probs = BC.checkScreen(win, 'task');
    ok(!probs.length, 'the kind choice follows the blocks contract', probs.slice(0, 5).join(' | '));
    await w.TASK.close(); await ticks(30);
    D.remove(ctx, pid);
  } finally { S.setRecipes(Object.values(keep2)); }
  await pageCore3(w, doc, win, sstore, ctx, html, BC);
  await pageCore4(w, doc, win, sstore, ctx, BC);
  await pageCore5(w, doc, win, sstore, ctx, BC);
  await pageJobs(w, doc, win, sstore, ctx);
}

// the core fixes of README Changes 22 and on: own routes, failure rules, branches (staging at depth, pass, order, list lines),
// values' third argument, $verb, the recipe check, faults, commands, gen text keys in a .lng after Write
async function coreFixes2(ctx, rctx, call) {
  const keep = S.recipes(), all = () => Object.values(keep);
  // failure rules of a call
  ok(CP.failsOf({ ok: false, why: 'nope' }).length === 1 && CP.failsOf({ status: 500 }).length === 1 && CP.failsOf({ error: 'x' }).length === 1 && CP.failsOf({ errors: 2 }).length === 1 && CP.failsOf({ errors: ['a', 'b'] }).length === 2, 'ok false, a status outside 2xx, an error field and an errors count all fail a call');
  ok(!CP.failsOf({ ok: true, errors: [], errors2: 1 }).length && !CP.failsOf({ errors: 0 }).length && !CP.failsOf(null).length, 'a clean result passes');
  ok(CP.failsOf({ n: 1 }, null, { ok: r => r.n === 2 }).length === 1 && !CP.failsOf({ n: 2 }, null, { ok: r => r.n === 2 }).length, "a call's own ok(result) decides too");
  ok(CP.failsOf(null, new Error('boom')).join('') === 'boom', 'a throw fails the call');
  // which calls a task may make
  const m0 = path.join(scratch, 'mods', 'callmod'); fs.mkdirSync(m0, { recursive: true });
  const allow = c => { try { CP.checkCall(ctx, m0, c); return ''; } catch (e) { return e.message; } };
  const own = { route: 'POST /api/x/task/r/zp/go', body: {} }; Object.defineProperty(own, '_recipe', { value: 'zp' });
  const other = { route: 'POST /api/x/task/r/zp/go', body: {} }; Object.defineProperty(other, '_recipe', { value: 'zq' });
  ok(allow(own) === '' && /only its own routes/.test(allow(other)), "a recipe may call its own routes only, not another recipe's");
  ok(/never calls/.test(allow({ route: 'POST /api/x/share/uploader', body: {} })), 'the uploader route (starts a program) is refused');
  ok(/dryFlag/.test(allow({ route: 'POST /api/x/units/change', body: {}, dryFlag: 'maybe' })) && /ok must be a function/.test(allow({ route: 'POST /api/x/units/change', body: {}, ok: 1 })), 'a bad dryFlag or ok is refused');
  ok(CP.dryOf({ route: 'POST /api/x/models/stage' }) === 'dry' && CP.dryOf({ route: 'POST /api/x/models/anim/run' }) === 'dry' && CP.dryOf({ route: 'POST /api/x/share/package' }) === 'write' && CP.dryOf({ route: 'POST /api/x/share/gate' }) === 'read' && CP.dryOf({ route: 'POST /api/x/zz/unknown' }) === 'none', 'the dry flag table knows models, share and says none for an unknown route');
  ok(allow({ cmd: 'upgrade', input: { mod: path.join(scratch, 'src'), to: 'as64', out: m0 } }) === '' && /must write into the picked mod/.test(allow({ cmd: 'upgrade', input: { mod: m0, to: 'as64', out: path.join(scratch, 'x') } })), 'upgrade may write into the picked mod only');
  ok(allow({ cmd: 'fix', input: { mod: path.join(scratch, 'src'), mode: 'plan', out: path.join(m0, 'patch') } }) === '' && allow({ cmd: 'check', input: { mod: m0 } }) === '' && allow({ cmd: 'goh2as2', input: { out: m0 } }) === '', 'fix (into the mod), check (reads) and goh2as2 (gohport) are allowed');
  ok(/only these commands/.test(allow({ cmd: 'play', input: {} })) && /only these commands/.test(allow({ cmd: 'game', input: {} })), 'commands that start the game are refused');
  // a command: plan sets its dry field, exit 3 is done with notes, another code fails
  const runs = [], fctx = Object.assign({}, ctx, { runTool: async (tool, entry, args) => {
    runs.push(args); const j = args.indexOf('--json'); if (j >= 0) fs.writeFileSync(args[j + 1], JSON.stringify({ partial: ['GEN_X: one thing left'] }));
    return { code: args.includes('--plan') ? 0 : 3, stdout: '', stderr: '', timedOut: false };
  } });
  const up = { cmd: 'upgrade', input: { mod: path.join(scratch, 'src'), to: 'as64', out: m0 } };
  const rp = await CP.runCmd(fctx, up, false), rw = await CP.runCmd(fctx, up, true);
  ok(rp.ok && runs[0].includes('--plan') && !runs[0].includes('--out'), 'upgrade in plan runs with --plan and no --out', JSON.stringify(runs[0]));
  ok(rw.ok && rw.partial && rw.notes.some(n => /one thing left/.test(n)) && !runs[1].includes('--plan') && runs[1].includes('--out'), 'exit 3 is done with notes, the findings kept', JSON.stringify(rw));
  const bad3 = await CP.runCmd(Object.assign({}, fctx, { runTool: async () => ({ code: 1, stdout: '', stderr: 'it broke', timedOut: false }) }), { cmd: 'check', input: { mod: m0 } }, true);
  ok(!bad3.ok && /crash/.test(bad3.errors.join(' ')), 'a check that finds crash problems fails with plain words', JSON.stringify(bad3.errors));
  const fx = await CP.runCmd(fctx, { cmd: 'fix', input: { game: path.join(scratch, 'g0'), mod: path.join(scratch, 'src'), mode: 'apply', out: path.join(m0, 'p') } }, false);
  const gx = await CP.runCmd(Object.assign({}, fctx, { game: () => path.join(scratch, 'g0') }), { cmd: 'fix', input: { mod: path.join(scratch, 'src'), mode: 'plan' } }, false);
  ok(gx.args.includes(path.join(scratch, 'g0')), 'a command that needs the game folder gets the GUI one', JSON.stringify(gx.args));
  ok(runs[runs.length - 1].includes('plan') && !runs[runs.length - 1].includes('apply'), 'fix runs as plan in plan', JSON.stringify(runs[runs.length - 1]) + JSON.stringify(fx.args));

  // recipe routes: under its id only (else a fault, not a crash), POST ones refuse LAN Remote
  const zq = { id: 'zq', verbs: ['make'], games: ['as64'], title: 'task.zq.t', groups: [], compile: () => ({}), routes: { 'POST /api/x/task/r/zq/go': async () => ({ ran: true }), 'GET /api/x/task/r/zq/see': async () => ({ seen: true }) } };
  const zbad = { id: 'zbad', verbs: ['make'], games: ['as64'], title: 'task.zbad.t', groups: [], compile: () => ({}), routes: { 'POST /api/x/task/r/other/go': async () => ({}) } };
  const fl = S.setRecipes(all().concat([zq, zbad]));
  ok(fl.includes('zbad') && !S.recipes().zbad && S.faults().zbad, 'a recipe with a route outside its id is skipped as a fault, the rest load', JSON.stringify(S.faults()));
  const RR = S.recipeRoutes();
  ok((await RR['POST /api/x/task/r/zq/go'](new URL('http://x/'), {}, ctx)).ran && (await RR['GET /api/x/task/r/zq/see'](new URL('http://x/'), null, rctx)).seen, 'own routes run; a GET is open to a phone');
  ok(await throwsAsync(() => RR['POST /api/x/task/r/zq/go'](new URL('http://x/'), {}, rctx), /view only/, 403) === '', "a recipe's POST route refuses LAN Remote");
  const cat = await call('GET /api/x/task/catalogue', '/api/x/task/catalogue');
  ok(cat.recipes.some(r => r.id === 'zbad' && r.fault && !r.built), 'the catalogue lists the faulty recipe with its fault');
  ok(await throwsAsync(() => call('POST /api/x/task/draft/new', '/x', { recipe: 'zbad' }), /has a fault/, 404) === '', 'a recipe with a fault cannot start');
  ok(Array.isArray(EXT.FAULTS) && EXT.FAULTS.length === 0, 'every recipe in ./recipes loads with no fault', JSON.stringify(EXT.FAULTS));

  // branches: staging at any depth, pass, order after, list lines, values' third argument, $verb, own check
  const seen = {};
  const zg = { id: 'zg', verbs: ['make'], games: ['as64'], title: 'task.zg.t', groups: [], compile: (d, c) => ({ copies: [{ staged: 'deep/g.txt', to: 'out/deep.txt' }], notes: ['zg'] }) };
  const zc = { id: 'zc', verbs: ['make', 'change'], games: ['as64'], title: 'task.zc.t',
    groups: [{ id: 'g', title: 'task.zc.g', essential: true, q: [
      { id: 'deep', kind: 'thing', ask: 'task.zc.q', picker: { sources: ['branch'], branch: 'zg' } },
      { id: 'later', kind: 'text', ask: 'task.zc.q', when: { $verb: 'change' } }] }],
    values: (lctx, base, o) => { seen[o.draft.id] = { verb: o.verb, parent: o.parent && o.parent.id, pass: o.pass, line: o.draft.parent && o.draft.parent.line }; return { tag: o.pass && o.pass.for }; },
    compile: (d, c) => ({ copies: [{ staged: 'c.txt', to: 'out/' + (c.value('tag') || 'none') + (d.parent && d.parent.line != null ? '-' + d.parent.line : '') + '.txt' }], notes: ['zc'] }) };
  const zp = { id: 'zp', verbs: ['make'], games: ['as64'], title: 'task.zp.t',
    groups: [{ id: 'g', title: 'task.zp.g', essential: true, q: [
      { id: 'one', kind: 'thing', ask: 'task.zp.q', picker: { sources: ['branch'], branch: 'zc', order: 'after', pass: { for: 'one' } } },
      { id: 'many', kind: 'list', ask: 'task.zp.q', picker: { sources: ['exist', 'branch'], lookup: 'entity', branch: 'zc' } }] }],
    pass: (pd, qid, lctx, o) => (qid === 'many' ? { for: 'line', answers: { later: 'preset' } } : null),
    check: d => [{ title: 'zp says', lines: ['looked at ' + d.id], level: 'warn' }],
    compile: () => ({ notes: ['zp'] }) };
  ok(!errs(RC.validate(zc, null, { ids: ['zg'] })).length && !errs(RC.validate(zp, null, { ids: ['zc'] })).length, 'branch, list, order, pass and $verb recipes validate', JSON.stringify(errs(RC.validate(zp, null, { ids: ['zc'] })).concat(errs(RC.validate(zc, null, { ids: ['zg'] })))));
  ok(errs(RC.validate(Object.assign({}, zp, { groups: [{ id: 'g', title: 'task.zp.g', q: [{ id: 'a', kind: 'text', ask: 'task.zp.q', when: { $mood: 1 } }] }] }), null, {})).some(m => /reserved keys/.test(m)), 'an unknown $ key in when is refused');
  ok(RC.steps(zc, { verb: 'make', answers: {} }, {}).every(s => s.id !== 'q:later') && RC.steps(zc, { verb: 'change', answers: {} }, {}).some(s => s.id === 'q:later'), 'when $verb shows a question only for that verb');
  S.setRecipes(all().concat([zg, zc, zp]));
  const pm = path.join(scratch, 'mods', 'branchmod'); fs.mkdirSync(pm, { recursive: true });
  const pd = (await call('POST /api/x/task/draft/new', '/x', { recipe: 'zp', game: 'as64', mod: pm })).draft;
  const c1 = (await call('POST /api/x/task/draft/child', '/x', { parent: pd.id, q: 'one' })).draft;
  const c2 = (await call('POST /api/x/task/draft/child', '/x', { parent: pd.id, q: 'many', line: 1, pass: { base: { id: 'b1', name: 'B one' }, verb: 'change' } })).draft;
  ok(c1.pass && c1.pass.for === 'one' && c2.pass.for === 'line' && c2.parent.line === 1 && c2.verb === 'change' && c2.base.id === 'b1' && c2.answers.later.value === 'preset', 'draft/child passes for, base, verb and preset answers; the line is kept', JSON.stringify([c1.pass, c2]));
  const g1 = (await call('POST /api/x/task/draft/child', '/x', { parent: c1.id, q: 'deep' })).draft, g2 = (await call('POST /api/x/task/draft/child', '/x', { parent: c2.id, q: 'deep' })).draft;
  const stage = (id, n, t) => { const f = D.stagedPath(ctx, id, n); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
  stage(c1.id, 'c.txt', 'child one'); stage(c2.id, 'c.txt', 'child line'); stage(g1.id, 'deep/g.txt', 'grand one'); stage(g2.id, 'deep/g.txt', 'grand line');
  const setP = a => { const d = D.load(ctx, pd.id); Object.assign(d.answers, a); D.save(ctx, d); };
  const setC = (id, a) => { const d = D.load(ctx, id); Object.assign(d.answers, a); D.save(ctx, d); };
  setC(c1.id, { deep: { src: 'branch', child: g1.id } }); setC(c2.id, { deep: { src: 'branch', child: g2.id } });
  setP({ one: { src: 'branch', child: c1.id }, many: { src: 'list', items: [{ src: 'exist', value: 'plain' }, { src: 'branch', child: c2.id }] } });
  const comp = await CP.compile(ctx, pd.id, S.recipes());
  ok(comp.notes.join(',') === 'zg,zc,zp,zg,zc', 'children of a list line go before, a branch with order after goes after its parent', comp.notes.join(','));
  ok(seen[c2.id] && seen[c2.id].verb === 'change' && seen[c2.id].parent === pd.id && seen[c2.id].pass.for === 'line' && seen[c2.id].line === 1, "values() gets (ctx, base, {draft, verb, parent, pass})", JSON.stringify(seen[c2.id]));
  const wr = await call('POST /api/x/task/write', '/x', { draft: pd.id });
  ok(wr.written && fs.readFileSync(path.join(pm, 'out', 'one.txt'), 'utf8') === 'child one' && fs.readFileSync(path.join(pm, 'out', 'line-1.txt'), 'utf8') === 'child line', "each child's staged file comes from its own staging", JSON.stringify(wr.errors));
  ok(wr.written && fs.readFileSync(path.join(pm, 'out', 'deep.txt'), 'utf8') === 'grand one', 'a grandchild reads its own staging (depth 2); the later copy to the same place wins', fs.existsSync(path.join(pm, 'out', 'deep.txt')) && fs.readFileSync(path.join(pm, 'out', 'deep.txt'), 'utf8'));
  ok(await throwsAsync(() => call('POST /api/x/task/draft/save', '/x', { draft: Object.assign(D.load(ctx, pd.id), { answers: { many: { src: 'list', items: [{ src: 'list', items: [] }] } } }) }), /needs src/) === '', 'a list line cannot be a list');
  const ck = await call('POST /api/x/task/check', '/x', { draft: pd.id });
  ok(ck.cards.length === 1 && ck.cards[0].level === 'warn' && /looked at/.test(ck.cards[0].lines[0]), "the recipe's own check gives its cards", JSON.stringify(ck));
  ok((await call('POST /api/x/task/check', '/x', { draft: c1.id })).none === true, 'a recipe without check gives no cards');
  ok(RC.forPage(zp).check === true && RC.forPage(zc).check === false, 'the page knows which recipe checks');
  D.remove(ctx, pd.id);

  // a lookup of a recipe gets in and filter and may say it is still reading
  const zl = { id: 'zl', verbs: ['make'], games: ['as64'], title: 'task.zl.t', groups: [], compile: () => ({}), lookups: { thing: async (lctx, words, o) => (o.filter && o.filter.slow ? { state: 'running', results: [] } : [{ id: words + ':' + o.in + ':' + (o.filter && o.filter.k) }]) } };
  S.setRecipes(all().concat([zl]));
  const lk = await call('GET /api/x/task/lookup', '/api/x/task/lookup?recipe=zl&kind=thing&q=w&in=army&filter=' + encodeURIComponent(JSON.stringify({ k: 'v' })));
  ok(lk.results[0].id === 'w:army:v', 'a recipe lookup gets in and filter', JSON.stringify(lk));
  const lr = await call('GET /api/x/task/lookup', '/api/x/task/lookup?recipe=zl&kind=thing&q=w&filter=' + encodeURIComponent(JSON.stringify({ slow: 1 })));
  ok(lr.state === 'running', 'a recipe lookup keeps state running (the page waits and asks again)', JSON.stringify(lr));

  // depsOf: the mod's Require list, deps first
  const gdir = path.join(scratch, 'fakegame'), mk = (n, req) => { fs.mkdirSync(path.join(gdir, 'mods', n, 'resource'), { recursive: true }); fs.writeFileSync(path.join(gdir, 'mods', n, 'mod.info'), '{mod "' + n + '"\r\n' + (req ? '\t{Require "' + req + '"}\r\n' : '') + '}\r\n'); };
  mk('dep_b', ''); mk('dep_a', 'dep_b'); mk('mine', 'dep_a');
  const dl = CP.depsOf(gdir, path.join(gdir, 'mods', 'mine'));
  ok(Array.isArray(dl) && (dl.length === 0 || (dl.map(x => path.basename(String(x))).join(',') === 'dep_b,dep_a')), 'depsOf reads Require from mod.info, deps first (or none when the folder is not a game)', JSON.stringify(dl));
  ok(CP.depsOf(gdir, path.join(gdir, 'mods', 'dep_b')).length === 0, 'a mod with no Require has no deps');

  // copies first (a recipe may say so); a staged copy streams
  ok(!errs(RC.validate(Object.assign({}, zg, { copiesFirst: true }), null, {})).length && errs(RC.validate(Object.assign({}, zg, { copiesFirst: 'yes' }), null, {})).length, 'copiesFirst is true or false');
  S.setRecipes(all().concat([Object.assign({}, zg, { copiesFirst: true })]));
  const cfd = D.save(ctx, { id: D.newId('zg'), recipe: 'zg', verb: 'make', game: 'as64', mod: pm, answers: {}, kept: [], state: 'open' });
  ok((await CP.compile(ctx, cfd.id, S.recipes())).copiesFirst === true, 'the compile carries copiesFirst');
  D.remove(ctx, cfd.id);

  // a name written by a card op reaches a .lng file after Write (needs a game folder)
  const game = kit.findGame({});
  if (!game) console.log('note: SKIP the card name in a .lng: no game folder found');
  else {
    const lm = path.join(scratch, 'mods', 'lngmod'); fs.mkdirSync(lm, { recursive: true });
    fs.writeFileSync(path.join(lm, 'mod.info'), '{mod "lngmod"\r\n\t{Name "lngmod"}\r\n}\r\n');
    const zt = { id: 'zt', verbs: ['make'], games: ['as64'], title: 'task.zt.t', groups: [], compile: () => ({ gen: { ops: [{ op: 'card', unit: 'zz_task_unit', army: 'rus', name: 'Zz Task Card Name' }] } }) };
    S.setRecipes(all().concat([zt]));
    const gctx = Object.assign({}, ctx, { game: () => game });
    const td = D.save(gctx, { id: D.newId('zt'), recipe: 'zt', verb: 'make', game: 'as64', mod: lm, answers: {}, kept: [], state: 'open' });
    const tp = await CP.plan(gctx, td.id, S.recipes());
    ok(!tp.errors.length && tp.files.some(f => /^localization\/.+\.lng$/i.test(f.rel)), 'the plan lists the .lng the card name goes into', JSON.stringify({ e: tp.errors, f: tp.files }));
    const tw = await CP.write(gctx, td.id, S.recipes());
    const lngs = []; const walk = d => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.lng$/i.test(e.name)) lngs.push(f); } };
    walk(path.join(lm, 'localization'));
    const has = lngs.some(f => { const b = fs.readFileSync(f); return b.toString('utf8').includes('Zz Task Card Name') || b.toString('utf16le').includes('Zz Task Card Name'); });
    ok(tw.written && has, 'a name written through a card op is in a .lng file after Write', JSON.stringify({ e: tw.errors, lngs }));
    ok(tw.restore.length >= 1 && !tw.unguarded.length, 'the .lng write has a restore point', JSON.stringify({ r: tw.restore, u: tw.unguarded }));
    D.remove(ctx, td.id);
  }
  S.setRecipes(all());
}

// README Changes 38 (a call's own ok decides over ok:false), 39 (runCmd makes ctx.tmpRoot), 40 (picker.branch as a list of recipes),
// and the gen plan of a copiesFirst task seeing the planned copies
const zka = { id: 'zka', verbs: ['make'], games: ['as64'], title: 'task.zka.t', groups: [], compile: d => ({ notes: ['zka:' + (d.pass && d.pass.recipe)] }) };
const zkb = { id: 'zkb', verbs: ['make'], games: ['as64'], title: 'task.zkb.t', groups: [], compile: d => ({ notes: ['zkb:' + (d.pass && d.pass.extra)] }) };
// JOBS: three steps of another page (routes a, b, c, each with a dry run), run through the task's write with a ctx that carries a
// real job handle (tools/gui/joblist.js) the way the dispatcher's does. stopAt '<step>:dry|write' presses Cancel while that step runs.
let fetchHook = null;
// the page's timers in this test: a short one runs at once (setImmediate) and a cleared one never runs. A long one (1 s and more) is
// a real timer that does not hold the process: the footer job list's 1 s clock (page.js jobTickOn) and its 20 s "ask again" poll
// re-arm themselves for as long as a request is listed, and run at once they spin for ever, so the test never ended after its last line
function pageTimeout(f, ms) {
  const t = { off: false, h: null };
  if (ms >= 1000) { t.h = setTimeout(() => { if (!t.off) f(); }, ms); t.h.unref(); } else setImmediate(() => { if (!t.off) f(); });
  return t;
}
function pageClear(t) { if (t && typeof t === 'object') { t.off = true; if (t.h) clearTimeout(t.h); } }
function jobKit(ctx, modName) {
  const exts = require('../index'), JL = require('../../joblist');
  const mod = path.join(scratch, 'mods', modName); fs.mkdirSync(mod, { recursive: true });
  const k = { mod, stopAt: '', seen: [], J: null, job: null, jctx: null };
  k.fresh = () => { k.J = JL.create({ keepMs: 0 }); k.job = k.J.add({ kind: 'req', canCancel: false }); k.jctx = Object.assign({}, ctx, { jobs: k.J, job: k.job }); k.stopAt = ''; k.seen = [];
    for (const n of ['b', 'c']) fs.rmSync(path.join(mod, n + '.txt'), { force: true });
    fs.writeFileSync(path.join(mod, 'a.txt'), 'old a'); };
  const step = n => async (u, b, c) => {
    k.seen.push({ n, write: !!b.write, same: c.job === k.job && c.jobs === k.J && c.runTool === k.jctx.runTool, prog: [k.job.done, k.job.total, k.job.stage].join('/'), can: k.job.canCancel });
    if (b.write) fs.writeFileSync(path.join(b.mod, n + '.txt'), 'new ' + n);
    if (k.stopAt === n + (b.write ? ':write' : ':dry')) k.J.cancel(k.job.id);
    return { files: [n + '.txt'], written: !!b.write };
  };
  const fake = { id: 'zzjob', routes: { 'POST /api/x/zzjob/a': step('a'), 'POST /api/x/zzjob/b': step('b'), 'POST /api/x/zzjob/c': step('c') } };
  exts.push(fake);
  k.recipe = { id: 'zj', verbs: ['make'], games: ['as64'], title: 'task.zj.t', groups: [], compile: () => ({ calls: ['a', 'b', 'c'].map(n => ({ route: 'POST /api/x/zzjob/' + n, body: {}, dryFlag: 'write' })) }) };
  k.done = () => { exts.splice(exts.indexOf(fake), 1); };
  k.fresh();
  return k;
}
async function jobsFixes(ctx, call) {
  const keep = S.recipes(), k = jobKit(ctx, 'jobmod'), mod = k.mod, has = n => fs.existsSync(path.join(mod, n + '.txt')), txt = n => fs.readFileSync(path.join(mod, n + '.txt'), 'utf8');
  const states = w => (w.steps || []).map(s => s.name + ':' + s.state).join(' ');
  const zt = { id: 'zt', verbs: ['make'], games: ['as64'], title: 'task.zt.t', groups: [], compile: d => ({ calls: [{ tool: 'newmod', args: [d.mod] }], copies: [{ staged: 's.txt', to: 'copied.txt' }] }) };
  S.setRecipes(Object.values(keep).concat([k.recipe, zt]));
  const ids = [];
  try {
    const mk = (recipe, m) => { const d = D.save(ctx, { id: D.newId(recipe), recipe, verb: 'make', game: 'as64', mod: m || mod, title: 'My job task', answers: {}, kept: [], state: 'open' }); ids.push(d.id); return d; };
    const d1 = mk('zj');
    // a stop while step 2 of 3 writes: step 3 never starts, the answer and the draft say which steps were done
    k.stopAt = 'b:write';
    const w = await call('POST /api/x/task/write', '/x', { draft: d1.id }, k.jctx);
    ok(w.stopped === true && w.written === false && w.partial === true && states(w) === 'zzjob/a:done zzjob/b:stopped zzjob/c:left', 'a write stopped in step 2 of 3 says stopped, with each step\'s outcome', JSON.stringify({ s: w.stopped, wr: w.written, steps: states(w) }));
    ok(txt('a') === 'new a' && has('b') && !has('c') && !k.seen.some(x => x.n === 'c' && x.write), 'after the stop no further step starts and nothing more is written (seeded: step c writes)', JSON.stringify(k.seen.map(x => x.n + (x.write ? 'W' : 'd'))));
    const mans = (w.restore || []).map(id => JSON.parse(fs.readFileSync(path.join(scratch, 'mods', 'jobmod.arsenal-undo', id, 'restore-point.json'), 'utf8')));
    const ma = mans.find(m => m.rel === 'a.txt'), mb = mans.find(m => m.rel === 'b.txt');
    ok(mans.length === 2 && ma && ma.existed && fs.readFileSync(path.join(scratch, 'mods', 'jobmod.arsenal-undo', ma.id, 'files', 'a.txt'), 'utf8') === 'old a' && mb && mb.existed === false && !(w.unguarded || []).length,
      'the undo still works after a stop: a restore point for each file the done steps changed (the old bytes of a.txt, b.txt was new)', JSON.stringify(mans));
    const ds = D.load(ctx, d1.id);
    ok(ds.state === 'open' && ds.stopped && ds.stopped.changed === true && ds.stopped.points === 2 && ds.stopped.steps.map(s => s.name + ':' + s.kind + ':' + s.state).join(' ') === 'zzjob/a:route:done zzjob/b:route:stopped zzjob/c:route:left' && w.restore.every(id => ds.restore.includes(id)),
      'the saved task keeps what the stopped write did (the page reads it there: the answer itself is 499)', JSON.stringify(ds.stopped));
    ok(k.job.writes === true && k.job.what === 'job.w.task' && k.job.whatP && k.job.whatP.name === 'My job task', 'the request is named after the task and marked as a write', JSON.stringify([k.job.writes, k.job.what, k.job.whatP]));
    ok(k.job.total === 6 && k.job.done === 4 && k.job.stage === 'zzjob/b', 'progress per step: 3 plan steps and 3 write steps, stopped while the fifth ran', [k.job.done, k.job.total, k.job.stage].join('/'));
    ok(k.seen.length === 5 && k.seen.every(x => x.same) && k.seen.every(x => x.can === true), 'a route called in process gets the request\'s own job, registry and runTool (its children are this request\'s), and Cancel can be pressed during each step', JSON.stringify(k.seen));
    ok(k.seen.map(x => x.prog).join(' ') === '0/6/zzjob/a 1/6/zzjob/b 2/6/zzjob/c 3/6/zzjob/a 4/6/zzjob/b', 'the footer counts the plan half, then the write half', k.seen.map(x => x.prog).join(' '));
    // a draft the page saves back keeps the stop; odd values are cleaned
    const rs = D.clean(Object.assign({}, ds, { stopped: { steps: [{ name: 'x', kind: 'evil', state: '??' }], points: -1, changed: 1, unguarded: [3, 'u.txt'] } })).stopped;
    ok(rs.steps[0].kind === 'tool' && rs.steps[0].state === 'left' && rs.points === 0 && rs.changed === true && rs.unguarded.join() === 'u.txt' && D.clean(Object.assign({}, ds, { stopped: null })).stopped === undefined, 'draft.stopped is kept and cleaned by the draft contract', JSON.stringify(rs));
    // a stop while the plan half runs: nothing is written, no step started
    k.fresh(); k.stopAt = 'b:dry';
    const w2 = await call('POST /api/x/task/write', '/x', { draft: d1.id }, k.jctx);
    ok(w2.stopped && !w2.written && w2.partial === false && !w2.restore.length && states(w2) === 'zzjob/a:left zzjob/b:left zzjob/c:left' && txt('a') === 'old a' && !has('b') && k.seen.every(x => !x.write) && k.seen.length === 2 && k.job.writes === false,
      'a write stopped in its plan half writes nothing and starts no step', JSON.stringify({ steps: states(w2), seen: k.seen.length, writes: k.job.writes }));
    const ds2 = D.load(ctx, d1.id);
    ok(ds2.stopped && ds2.stopped.changed === false && ds2.stopped.points === 0, 'the saved task says nothing was changed', JSON.stringify(ds2.stopped));
    k.fresh(); k.stopAt = 'a:dry';
    const p3 = await call('POST /api/x/task/plan', '/x', { draft: d1.id }, k.jctx);
    ok(p3.stopped === true && k.seen.length === 1 && !p3.errors.length && k.job.what === 'job.w.task' && k.job.total === 3, 'a stopped plan starts no further step and is no error; the plan request has its name and its own count', JSON.stringify({ st: p3.stopped, seen: k.seen.length, e: p3.errors, t: k.job.total }));
    // a stop that comes while the last step runs leaves nothing undone: the write is whole
    k.fresh(); k.stopAt = 'c:write';
    const w4 = await call('POST /api/x/task/write', '/x', { draft: d1.id }, k.jctx), ds4 = D.load(ctx, d1.id);
    ok(w4.written && !w4.stopped && has('c') && ds4.state === 'written' && ds4.stopped === undefined && states(w4) === 'zzjob/a:done zzjob/b:done zzjob/c:done', 'a stop during the last step: every step is done, the task is written and the old stop note is gone', JSON.stringify({ wr: w4.written, steps: states(w4), st: ds4.stopped }));
    // no stop: as before, plus the steps
    k.fresh();
    const d5 = mk('zj'), w5 = await call('POST /api/x/task/write', '/x', { draft: d5.id }, k.jctx);
    ok(w5.written && !w5.stopped && states(w5) === 'zzjob/a:done zzjob/b:done zzjob/c:done' && k.job.done === 6 && k.job.total === 6 && k.job.cancelled === false, 'a write nobody stops is whole: 6 of 6', JSON.stringify({ steps: states(w5), d: k.job.done }));
    const w6 = await call('POST /api/x/task/write', '/x', { draft: mk('zj').id });
    ok(w6.written && states(w6).split(' ').length === 3, 'a ctx with no job (a test, an older caller) writes as before');
    // a tool child killed by the stop (ctx.runTool answers cancelled): the copies after it never run
    const tmod = path.join(scratch, 'mods', 'jobtool'); fs.mkdirSync(tmod, { recursive: true }); fs.writeFileSync(path.join(tmod, 'mod.info'), '{mod}');
    const dt = mk('zt', tmod); fs.mkdirSync(D.stageDir(ctx, dt.id), { recursive: true }); fs.writeFileSync(D.stagedPath(ctx, dt.id, 's.txt'), 'staged');
    k.fresh(); const runs = [];
    k.jctx.runTool = async (tool, entry, args) => { const dry = args.includes('--dry-run'); runs.push(dry ? 'dry' : 'real'); if (dry) return { code: 0, stdout: '', stderr: '', timedOut: false, cancelled: false }; k.J.cancel(k.job.id); return { code: null, stdout: '', stderr: '', timedOut: false, cancelled: true }; };
    const wt = await call('POST /api/x/task/write', '/x', { draft: dt.id }, k.jctx);
    ok(wt.stopped && !wt.written && states(wt) === 'newmod:stopped copies:left' && !fs.existsSync(path.join(tmod, 'copied.txt')) && runs.join() === 'dry,real' && !(wt.errors || []).length,
      'a tool killed by the stop is "stopped", not a failed step; the copy step after it never runs', JSON.stringify({ steps: states(wt), runs, e: wt.errors }));
    k.fresh(); k.jctx.runTool = async () => { k.J.cancel(k.job.id); return { code: null, stdout: '', stderr: '', timedOut: false, cancelled: true }; };
    const rc = await CP.runCall(k.jctx, tmod, { tool: 'newmod', args: [tmod] }, false, S.recipes(), null);
    ok(rc.cancelled === true && rc.ok === false, 'runCall marks a killed tool as cancelled', JSON.stringify(rc).slice(0, 200));
  } finally { k.done(); for (const id of ids) try { D.remove(ctx, id); } catch (e) { /* gone */ } S.setRecipes(Object.values(keep)); }
}
// JOBS, the page: a write stopped from the footer's job list (the answer is 499) says plainly what was done and what was not, read
// from the saved task; Continue shows it again; a stopped plan is a plain line; nothing is a red error or an error toast
async function pageJobs(w, doc, win, sstore, ctx) {
  const keep = S.recipes(), k = jobKit(ctx, 'pagejobmod');
  S.setRecipes(Object.values(keep).concat([k.recipe]));
  const settle = n => ticks(n || 40);
  const q = s => win.querySelector(s), qa = s => win.querySelectorAll(s);
  const go = async st => { const b = qa('button.tk-step').find(e => e.dataset.step === st); if (b) b.click(); await settle(60); return !!b; };
  const toastEl = doc.getElementById('toast'), names = [];
  // the dispatcher's part: the route runs with the request's job; a cancelled job is answered 499 {key: job.cancelled} whatever it returned
  const resp = (o, status) => Promise.resolve({ ok: !status, status: status || 200, json: () => Promise.resolve(clone(o)), body: null });
  fetchHook = (key, url, o) => {
    if (key !== 'POST /api/x/task/write' && key !== 'POST /api/x/task/plan') return null;
    const stopAt = (key.endsWith('/plan') ? k.nextPlan : k.nextWrite) || ''; k.fresh(); k.stopAt = stopAt;
    return counted(Promise.resolve().then(() => EXT.routes[key](url, JSON.parse(o.body), k.jctx)).then(r => (k.job.cancelled ? resp({ error: 'cancelled', key: 'job.cancelled' }, 499) : resp(r)), e => resp({ error: e.message }, e.status || 500))
      .then(async r => { for (let i = 0; i < 6; i++) await tick(); return r; }));   // long enough for the footer to list the request
  };
  let id = null;
  try {
    if (w.JOBS && w.JOBS.on) w.JOBS.on(() => { for (const j of w.JOBS.list()) if (j.name && !names.includes(j.name)) names.push(j.name); });
    id = D.save(ctx, { id: D.newId('zj'), recipe: 'zj', verb: 'make', game: 'as64', mod: k.mod, title: 'Stop me', answers: {}, kept: [], state: 'open' }).id;
    // a stopped plan on Review: a plain line
    k.nextPlan = 'a:dry';
    await w.TASK.resume(id); await settle(60); await go('review');
    const pb = q('div[data-task-plan]');
    ok(pb && pb.querySelector('div[data-task-stopped]') && /Nothing was written/.test(pb.textContent) && !pb.querySelector('div.tk-refuse'), 'a plan stopped from the job list is a plain line on Review, not a red error', pb && pb.textContent);
    // a write stopped in step 2 of 3
    k.nextPlan = '';
    await go('write');
    if (toastEl) toastEl.textContent = '';
    k.nextWrite = 'b:write';
    q('button[data-task-write]').click(); await settle(120);
    const card = q('div[data-task-stopcard]'), line = a => { const e = card && card.querySelector('div[data-task-stop=' + a + ']'); return e ? e.textContent : ''; };
    ok(!!card && /Done and written: zzjob\/a$/.test(line('done')) && /zzjob\/b$/.test(line('mid')) && /Not done, nothing written: zzjob\/c$/.test(line('left')) && /^2 restore points/.test(line('points')) && !line('none'),
      'a stopped write says which steps were done and written, which one was stopped part way and which were not done', card ? card.textContent : 'no card: ' + q('div[data-task-wrote]').textContent);
    ok(card && !!card.querySelector('button[data-task-undo]') && !q('div[data-task-wrote]').querySelector('div.tk-bad') && !q('div[data-task-wrote]').querySelector('div[data-task-err]') && !(toastEl && /Stopped|cancel/i.test(toastEl.textContent)),
      'the stopped state is no error: no red card, no error toast, and the restore points are one click away', toastEl && toastEl.textContent);
    const nx = q('button[data-task-next]');
    ok(nx && nx.disabled && w.TASK.state().draft.state === 'open' && !!w.TASK.state().draft.stopped, 'the task is not written: Next stays off, the page holds the saved stop');
    ok(names.some(n => /^Guided task: /.test(n) && /Stop me|zj/.test(n)), 'the task\'s requests are named in the job list', names.join(' | '));
    // Continue later shows it again
    await w.TASK.close(); await settle(30);
    ok(!!D.load(ctx, id).stopped, 'the stop is still in the saved task after the page saved it');
    await w.TASK.resume(id); await settle(60); await go('write');
    ok(!!q('div[data-task-stopcard]') && /zzjob\/c/.test(q('div[data-task-stopcard]').textContent), 'Continue shows what the stopped write did again');
    // a stop that comes when the last step is done: the write is whole, said plainly
    k.nextWrite = 'c:write';
    q('button[data-task-write]').click(); await settle(120);
    ok(!!q('div[data-task-stopwhole]') && !q('div[data-task-stopcard]') && D.load(ctx, id).state === 'written' && q('button[data-task-next]') && !q('button[data-task-next]').disabled, 'a stop after the last step: everything was written, Next goes on', q('div[data-task-wrote]').textContent);
  } finally { fetchHook = null; k.done(); if (id) try { D.remove(ctx, id); } catch (e) { /* gone */ } S.setRecipes(Object.values(keep)); sstore.delete('task.open'); }
}
function zkkOf(seen) {
  return { id: 'zkk', verbs: ['make'], games: ['as64'], title: 'task.zkk.t',
    groups: [{ id: 'g', title: 'task.zkk.g', essential: true, q: [
      { id: 'one', kind: 'thing', ask: 'task.zkk.q', picker: { sources: ['branch'], branch: ['zka', 'zkb'], pass: { for: 'one', by: { zkb: { extra: 'b' } } } } },
      { id: 'many', kind: 'list', ask: 'task.zkk.q', picker: { sources: ['branch'], branch: ['zka', 'zkb'] } },
      { id: 'solo', kind: 'thing', ask: 'task.zkk.q', optional: true, picker: { sources: ['keep', 'branch'], branch: 'zka' } }] }],
    pass: (pd, qid, lctx, o) => { if (seen) seen.push(qid + ':' + o.recipe); return null; },
    compile: () => ({ notes: ['zkk'] }) };
}
async function coreFixes3(ctx, call) {
  const keep = S.recipes(), all = () => Object.values(keep);
  // 38: failsOf with the call's own ok
  const okT = { ok: () => true }, okF = { ok: () => false };
  ok(!CP.failsOf({ ok: false, why: 'stereo' }, null, okT).length, 'ok:false with the call\'s own ok saying yes passes (ok decides alone)');
  ok(CP.failsOf({ ok: false, why: 'stereo' }).length === 1 && CP.failsOf({ ok: false, why: 'stereo' }, null, {}).length === 1, 'ok:false with no ok of its own still fails');
  ok(CP.failsOf({ ok: false }, null, okF).length === 1, 'ok:false and the own ok saying no fails');
  ok(CP.failsOf(null, new Error('boom'), okT).join('') === 'boom', 'a throw fails even when the own ok would say yes');
  ok(CP.failsOf({ ok: false, status: 500 }, null, okT).some(m => /status 500/.test(m)) && CP.failsOf({ status: 404 }, null, okT).length === 1, 'a status outside 2xx fails even when the own ok says yes');
  ok(CP.failsOf({ ok: false, errors: ['bad'] }, null, okT).includes('bad'), 'an errors list still fails with an own ok');
  // 39: runCmd makes ctx.tmpRoot when it is not there yet
  const tr = path.join(scratch, 'no-tmp-yet', 'deeper'); fs.rmSync(path.join(scratch, 'no-tmp-yet'), { recursive: true, force: true });
  const m0 = path.join(scratch, 'mods', 'callmod'); fs.mkdirSync(m0, { recursive: true });
  const tctx = Object.assign({}, ctx, { tmpRoot: tr, runTool: async (tool, entry, args) => { const j = args.indexOf('--json'); if (j >= 0) fs.writeFileSync(args[j + 1], JSON.stringify({ partial: ['GEN_T: from the new temp root'] })); return { code: 3, stdout: '', stderr: '', timedOut: false }; } });
  let rt = null, rtErr = '';
  try { rt = await CP.runCmd(tctx, { cmd: 'upgrade', input: { mod: path.join(scratch, 'src'), to: 'as64', out: m0 } }, true); } catch (e) { rtErr = e.message; }
  ok(rt && rt.ok && rt.notes.some(n => /new temp root/.test(n)) && fs.existsSync(tr), 'runCmd makes a missing ctx.tmpRoot and reads the result file from it', rtErr || JSON.stringify(rt));
  ok(fs.existsSync(tr) && !fs.readdirSync(tr).length, 'runCmd leaves no temp folder behind');

  // 40: picker.branch as a list of recipe ids
  const seen = [], zkk = zkkOf(seen);
  ok(!errs(RC.validate(zkk, null, { ids: ['zka', 'zkb'] })).length, 'a picker.branch list, pass.by and a single id validate', JSON.stringify(errs(RC.validate(zkk, null, { ids: ['zka', 'zkb'] }))));
  const vw = RC.validate(zkk, null, { ids: ['zka'] });
  ok(!errs(vw).length && vw.some(x => x.level !== 'error' && /zkb is not in the recipe list/.test(x.msg)), 'a listed id that is no recipe is a warning', JSON.stringify(vw));
  const withP = P => Object.assign({}, zkk, { groups: [{ id: 'g', title: 'task.zkk.g', essential: true, q: [{ id: 'one', kind: 'thing', ask: 'task.zkk.q', picker: Object.assign({ sources: ['branch'] }, P) }] }] });
  ok(errs(RC.validate(withP({ branch: [] }), null, {})).some(m => /recipe id or a list/.test(m)), 'an empty picker.branch list is refused');
  ok(errs(RC.validate(withP({ branch: ['zka', 'zka'] }), null, {})).some(m => /twice/.test(m)), 'a recipe named twice is refused');
  ok(errs(RC.validate(withP({ branch: ['zka', 'Bad Id'] }), null, {})).length > 0, 'a list entry that is not a recipe id is refused');
  ok(errs(RC.validate(withP({ branch: ['zka', 'zkb'], pass: { by: { zzz: {} } } }), null, {})).some(m => /pass\.by/.test(m)), 'pass.by for a recipe outside the list is refused');
  S.setRecipes(all().concat([zka, zkb, zkk]));
  const pm = path.join(scratch, 'mods', 'kindmod'); fs.mkdirSync(pm, { recursive: true });
  const pd = (await call('POST /api/x/task/draft/new', '/x', { recipe: 'zkk', game: 'as64', mod: pm })).draft;
  const cb = (await call('POST /api/x/task/draft/child', '/x', { parent: pd.id, q: 'one', recipe: 'zkb' })).draft;
  ok(cb.recipe === 'zkb' && cb.parent.q === 'one' && cb.pass.for === 'one' && cb.pass.extra === 'b' && cb.pass.recipe === 'zkb', 'a branch of a listed recipe opens as that recipe; pass, pass.by[kind] and pass.recipe reach it', JSON.stringify(cb.pass));
  ok(seen.includes('one:zkb'), 'recipe.pass gets the chosen recipe as opt.recipe', JSON.stringify(seen));
  // seeded defect: a recipe outside the list is refused and no draft is made
  const kids = () => D.childrenOf(ctx, pd.id).length, k0 = kids();
  ok(await throwsAsync(() => call('POST /api/x/task/draft/child', '/x', { parent: pd.id, q: 'one', recipe: 'mod' }), /does not open a mod task/, 400) === '' && kids() === k0, 'a recipe outside picker.branch is refused and no draft is made');
  ok(await throwsAsync(() => call('POST /api/x/task/draft/child', '/x', { parent: pd.id, q: 'one' }), /Pick what kind/, 400) === '' && kids() === k0, 'no kind with several recipes is refused');
  const cs = (await call('POST /api/x/task/draft/child', '/x', { parent: pd.id, q: 'solo' })).draft;
  ok(cs.recipe === 'zka' && !(cs.pass && cs.pass.recipe), 'one id works as before (no recipe in the body, no pass.recipe)', JSON.stringify(cs.pass));
  ok(await throwsAsync(() => call('POST /api/x/task/draft/child', '/x', { parent: pd.id, q: 'solo', recipe: 'zkb' }), /does not open a zkb task/, 400) === '', 'one id refuses another recipe too');
  const cl = (await call('POST /api/x/task/draft/child', '/x', { parent: pd.id, q: 'many', line: 0, recipe: 'zka' })).draft;
  ok(cl.recipe === 'zka' && cl.parent.line === 0 && cl.pass.recipe === 'zka', 'a list line opens the kind it picked', JSON.stringify(cl));
  const setP = a => { const d = D.load(ctx, pd.id); Object.assign(d.answers, a); D.save(ctx, d); };
  setP({ one: { src: 'branch', child: cb.id, recipe: 'zkb' }, many: { src: 'list', items: [{ src: 'branch', child: cl.id, recipe: 'zka' }] }, solo: { src: 'branch', child: cs.id } });
  ok(D.load(ctx, pd.id).answers.one.recipe === 'zkb', 'the branch answer keeps which recipe the child is');
  const comp = await CP.compile(ctx, pd.id, S.recipes());
  ok(comp.notes.join(',') === 'zkb:b,zka:zka,zka:null,zkk', 'compile runs each child with its own recipe', comp.notes.join(','));
  // a child changed by hand to a recipe the question does not take is refused at compile
  const cbd = D.load(ctx, cb.id); D.save(ctx, Object.assign(cbd, { recipe: 'mod' }));
  ok(await throwsAsync(() => CP.compile(ctx, pd.id, S.recipes()), /a mod task, which this question does not take/) === '', 'a child whose recipe is outside picker.branch is refused at compile');
  D.save(ctx, Object.assign(cbd, { recipe: 'zkb' }));
  ok(await throwsAsync(() => call('POST /api/x/task/draft/save', '/x', { draft: Object.assign(D.load(ctx, pd.id), { answers: { one: { src: 'branch', child: cb.id, recipe: 'Not An Id' } } }) }), /recipe must be a recipe id/) === '', 'a branch answer with a bad recipe is refused');
  D.remove(ctx, pd.id);

  // the gen plan of a copiesFirst task sees the planned copies (an overlay); without copiesFirst it does not (seeded defect)
  const og = path.join(scratch, 'ovgame'); fs.mkdirSync(path.join(og, 'resource'), { recursive: true });
  const om = path.join(og, 'mods', 'ovmod'); fs.mkdirSync(om, { recursive: true });
  const gctx = Object.assign({}, ctx, { game: () => og });
  const planOf = async (first, onDisk) => {
    const zo = { id: 'zo', verbs: ['make'], games: ['as64'], title: 'task.zo.t', groups: [], copiesFirst: first, compile: () => ({ copies: [{ staged: 'o.set', to: 'resource/set/zz_overlay.set' }], gen: { ops: [{ op: 'set', rows: [{ file: 'set/zz_overlay', path: 'speed', value: '9' }] }] } }) };
    const f = path.join(om, 'resource', 'set', 'zz_overlay.set'); fs.rmSync(f, { force: true }); if (onDisk) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, '{speed 2}\r\n'); }
    const d = D.save(gctx, { id: D.newId('zo'), recipe: 'zo', verb: 'make', game: 'as64', mod: om, answers: {}, kept: [], state: 'open' });
    const sf = D.stagedPath(gctx, d.id, 'o.set'); fs.mkdirSync(path.dirname(sf), { recursive: true }); fs.writeFileSync(sf, '{speed 1}\r\n');
    try { return await CP.plan(gctx, d.id, { zo }); } finally { D.remove(gctx, d.id); }
  };
  const pf = await planOf(true, false), pn = await planOf(false, false);
  ok(!pf.errors.length && pf.genFiles.includes('resource/set/zz_overlay.set') && pf.notes.some(n => /sees the planned copies \(1\)/.test(n)), 'copies first: the gen plan reads the planned copy and edits it', JSON.stringify({ e: pf.errors, n: pf.notes, g: pf.genFiles }));
  ok(pn.errors.some(e => e.code === 'GEN_SET_ENTITY_UNKNOWN'), 'without copies first the gen plan does not see the copy (it goes after)', JSON.stringify(pn.errors));
  ok(!fs.existsSync(path.join(om, 'resource', 'set', 'zz_overlay.set')), 'the plan wrote nothing into the mod');
  const pr = await planOf(false, true);
  ok(!pr.errors.length && pr.notes.some(n => /replaces what they write/.test(n)), 'without copies first, a copy over a file the gen steps write says it replaces their work', JSON.stringify({ e: pr.errors, n: pr.notes }));
  S.setRecipes(all());
}

// a recipe with a base, an essential group and two that Quick folds (one with a required question, one with a when); a title per
// verb; lookups: thing (names given), bare (ids only: the core names them from the game texts)
function zqOf() {
  const BARE = [{ id: 'zz_tank', where: 'game' }, { id: 'odd', text: 'desc/squad/odd(ger)' }, { id: 'other' }];
  return { id: 'zq', verbs: ['make', 'change', 'explore'], games: ['as64', 'mowas2'], needs: [], base: { lookup: 'thing' }, title: { make: 'task.zq.tm', change: 'task.zq.tc' },
    groups: [
      { id: 'main', title: 'task.zq.g.main', essential: true, q: [{ id: 'name', kind: 'text', ask: 'task.zq.q.name' }] },
      { id: 'adv', title: 'task.zq.g.adv', q: [{ id: 'a1', kind: 'number', ask: 'task.zq.q.a1' }, { id: 'a2', kind: 'number', ask: 'task.zq.q.a2' }, { id: 'a3', kind: 'text', ask: 'task.zq.q.a3', required: true }] },
      { id: 'more', title: 'task.zq.g.more', q: [{ id: 'm1', kind: 'yesno', ask: 'task.zq.q.m1' }, { id: 'm2', kind: 'text', ask: 'task.zq.q.m2', when: { m1: true } }] }],
    lookups: {
      thing: async (c, words) => [{ id: 't1', name: 'Tiger One', where: 'game', sub: 'set/t1' }, { id: 't2' }].filter(x => !words || x.id.includes(words) || String(x.name || '').toLowerCase().includes(words.toLowerCase())),
      bare: async (c, words) => BARE.filter(x => !words || x.id.includes(words.toLowerCase())).map(x => Object.assign({}, x)),
    },
    values: () => ({ a1: 5, a2: 7, m1: true }),
    compile: () => ({}) };
}

// README Changes 41 to 44: steps() in Quick and Everything, required, the draft fields, a title per verb, names from the game texts
async function coreFixes4(ctx, call) {
  const keep = S.recipes(), all = () => Object.values(keep), zq = zqOf();
  ok(!errs(RC.validate(zq, null, {})).length, 'a recipe with a title per verb and a required question validates', JSON.stringify(errs(RC.validate(zq, null, {}))));
  const ids = d => RC.steps(zq, Object.assign({ answers: {}, kept: [], verb: 'make' }, d), { a1: 5, a2: 7, m1: true }).map(s => s.id + (s.kind === 'group' ? '(' + s.count + ')' : '')).join(',');
  const tail = ',review,write,check,test,done';
  ok(ids({ mode: 'quick' }) === 'base,mode,q:name,q:a3,g:adv(2),g:more(2)' + tail, 'Quick: the essential group asked, the others one line each with their count; a required question is asked', ids({ mode: 'quick' }));
  ok(ids({ mode: 'all' }) === 'base,mode,q:name,q:a1,q:a2,q:a3,q:m1,q:m2' + tail, 'Everything: every question is a step', ids({ mode: 'all' }));
  ok(ids({}) === ids({ mode: 'all' }), 'a draft with no mode (from before) is Everything');
  ok(ids({ mode: 'quick', asked: ['adv'] }) === 'base,mode,q:name,q:a1,q:a2,q:a3,g:more(2)' + tail, 'Ask these opens just that group', ids({ mode: 'quick', asked: ['adv'] }));
  ok(ids({ mode: 'quick', asked: ['adv'], kept: ['adv'] }) === ids({ mode: 'quick' }), 'Keep the whole group folds an asked group again');
  ok(ids({ mode: 'quick', answers: { a1: { src: 'value', value: 9 } } }) === 'base,mode,q:name,q:a1,q:a3,g:adv(1),g:more(2)' + tail, 'a value already answered stays a step of its own, the count drops', ids({ mode: 'quick', answers: { a1: { src: 'value', value: 9 } } }));
  const gs = RC.steps(zq, { answers: {}, kept: [], mode: 'quick' }, { m1: true }).find(s => s.id === 'g:more');
  ok(gs && gs.kept === true && gs.qs.join(',') === 'm1,m2', 'a folded group step lists its questions and counts as kept', JSON.stringify(gs));
  ok(!/mode|g:/.test(ids({ mode: 'quick', verb: 'explore' })), 'explore has no mode step and folds nothing', ids({ mode: 'quick', verb: 'explore' }));
  const nb = Object.assign({}, zq, { base: undefined });
  ok(!RC.steps(nb, { answers: {}, kept: [], mode: 'quick' }, {}).some(s => s.kind === 'mode' || s.kind === 'group'), 'a task that copies nothing has no mode step and folds nothing');
  // seeded defects: required that is not a boolean, required and optional, a title per verb with an unknown verb or a foreign key
  const zqW = (over, q) => Object.assign({}, zq, over, q ? { groups: [{ id: 'main', title: 'task.zq.g.main', essential: true, q: [Object.assign({ id: 'name', kind: 'text', ask: 'task.zq.q.name' }, q)] }] } : {});
  ok(errs(RC.validate(zqW({}, { required: 'yes' }), null, {})).some(m => /required must be true or false/.test(m)), 'required that is not true or false is refused');
  ok(errs(RC.validate(zqW({}, { required: true, optional: true }), null, {})).some(m => /required and optional/.test(m)), 'required and optional together are refused');
  ok(errs(RC.validate(zqW({ title: { make: 'task.zq.tm', build: 'task.zq.tb' } }), null, {})).some(m => /title/.test(m)), 'a title for an unknown verb is refused');
  ok(errs(RC.validate(zqW({ title: { make: 'task.other.t' } }), null, {})).some(m => /title/.test(m)), 'a title per verb outside task.<id>. is refused');
  ok(errs(RC.validate(zqW({ title: {} }), null, {})).some(m => /title/.test(m)), 'an empty title object is refused');
  ok(RC.titleKey(zq, 'change') === 'task.zq.tc' && RC.titleKey(zq, 'explore') === 'task.zq.tm' && RC.titleKey(zq) === 'task.zq.tm' && RC.titleKey(S.recipes().mod, 'change') === S.recipes().mod.title, 'titleKey: the verb, else make; a string title for every verb');
  ok(RC.keysOf(zq).includes('task.zq.tm') && RC.keysOf(zq).includes('task.zq.tc'), 'keysOf names every title of a title per verb');
  const fp = RC.forPage(zq);
  ok(fp.title === 'task.zq.tm' && fp.titles && fp.titles.change === 'task.zq.tc' && RC.forPage(S.recipes().mod).titles === null, 'the page gets title (a string) and titles (per verb, or null)', JSON.stringify([fp.title, fp.titles]));
  S.setRecipes(all().concat([zq]));
  try {
    const cat = await call('GET /api/x/task/catalogue', '/x');
    const zr = cat.recipes.find(r => r.id === 'zq');
    ok(zr && zr.title === 'task.zq.tm' && zr.titles.change === 'task.zq.tc', 'the catalogue row keeps a string title and adds titles', JSON.stringify(zr));
    // the draft: a new one is Quick, the fields survive a save, a bad mode reads as Everything, a branch keeps its parent's mode
    const dq = (await call('POST /api/x/task/draft/new', '/x', { recipe: 'zq', verb: 'make', game: 'as64' })).draft;
    ok(dq.mode === 'quick' && Array.isArray(dq.asked) && !dq.asked.length, 'a new draft starts in Quick', JSON.stringify(dq));
    const da = (await call('POST /api/x/task/draft/new', '/x', { recipe: 'zq', verb: 'make', game: 'as64', mode: 'all' })).draft;
    ok(da.mode === 'all', 'draft/new takes mode all');
    await call('POST /api/x/task/draft/save', '/x', { draft: Object.assign({}, dq, { asked: ['adv', 7] }) });
    ok(D.load(ctx, dq.id).asked.join(',') === 'adv' && D.load(ctx, dq.id).mode === 'quick', 'asked is saved (ids only)', JSON.stringify(D.load(ctx, dq.id)));
    await call('POST /api/x/task/draft/save', '/x', { draft: Object.assign({}, dq, { mode: 'fast' }) });
    ok(D.load(ctx, dq.id).mode === 'all', 'seeded defect: an unknown mode is saved as Everything');
    const kid = D.child(ctx, dq.id, 'name', 'zq');
    ok(kid.mode === 'all' && D.child(ctx, da.id, 'name', 'zq').mode === 'all', 'a branch takes the mode of its parent');
    await call('POST /api/x/task/draft/save', '/x', { draft: Object.assign(D.load(ctx, dq.id), { mode: 'quick' }) });
    ok(D.child(ctx, dq.id, 'name', 'zq').mode === 'quick', 'a branch of a Quick task is Quick');
    D.remove(ctx, dq.id); D.remove(ctx, da.id);

    // names from the game texts for a recipe lookup that gives ids only
    const tg = path.join(scratch, 'textgame');
    fs.mkdirSync(path.join(tg, 'resource', 'interface', 'text'), { recursive: true });
    fs.writeFileSync(path.join(tg, 'resource', 'interface', 'text', 'desc.lng'), '{tags\r\n\t{"entity"\r\n\t\t{"zz_tank" "<c(ffff00)>Panzer Zett"}\r\n\t}\r\n\t{"squad"\r\n\t\t{"odd(ger)" "Odd squad"}\r\n\t}\r\n}\r\n');
    const tctx = Object.assign({}, ctx, { game: () => tg });
    const lk = async (w, c) => (await call('GET /api/x/task/lookup', '/api/x/task/lookup?' + new URLSearchParams({ kind: 'bare', recipe: 'zq', q: w }), null, c || tctx)).results;
    const r0 = await lk('');
    const nm = id => (r0.find(x => x.id === id) || {}).name;
    ok(nm('zz_tank') === 'Panzer Zett' && nm('odd') === 'Odd squad' && nm('other') == null, 'an id only result gets the name from desc/entity/<id>, or from its own text key; one with no text keeps its id alone', JSON.stringify(r0));
    const r1 = await lk('panzer');
    ok(r1.length === 1 && r1[0].id === 'zz_tank' && r1[0].name === 'Panzer Zett', 'the search words match the name from the texts too', JSON.stringify(r1));
    const r2 = await lk('odd');
    ok(r2.length === 1 && r2[0].name === 'Odd squad', 'words that match the id still find it, named', JSON.stringify(r2));
    // seeded defect: no game folder, no names, and the name words find nothing
    const r3 = await lk('panzer', ctx), r4 = await lk('', ctx);
    ok(!r3.length && r4.every(x => x.name == null), 'with no game texts the ids stay as they are', JSON.stringify([r3, r4]));
    const th = (await call('GET /api/x/task/lookup', '/api/x/task/lookup?kind=thing&recipe=zq&q=', null, tctx)).results;
    ok(th[0].name === 'Tiger One' && th[1].name == null, 'a result with a name keeps it', JSON.stringify(th));
  } finally { S.setRecipes(all()); }
}

// README Changes 41 to 44 on the page: Quick or Everything (the mode step, the head switch, folded group lines, Ask these, the head
// count, Review per kept group), lookup results name first, a reload opens the task again, a title per verb in the row and the head
async function pageCore3(w, doc, win, sstore, ctx, html, BC) {
  const fakedom = require(path.join(GUI, 'test', 'fakedom'));
  const keep = S.recipes(); S.setRecipes(Object.values(keep).concat([zqOf()]));
  const settle = n => ticks(n || 40);
  const q = s => win.querySelector(s), qa = s => win.querySelectorAll(s);
  const by = (s, k, v) => qa(s).find(e => e.dataset[k] === v);
  const stepIds = () => qa('button.tk-step').map(b => b.dataset.step).join(',');
  const cur = () => { const s = w.TASK.state(); return s.steps[s.at] && s.steps[s.at].id; };
  // a second page on the same session (a reload): the same fetch and storages, a fresh DOM
  const mkPage = async () => {
    const d2 = fakedom.make(), r2 = d2.createElement('div'); r2.setAttribute('id', 'taskrow'); d2.body.insertBefore(r2, d2.getElementById('nav'));
    const w2 = { document: d2, console, TextDecoder, setTimeout: pageTimeout, clearTimeout: pageClear, setInterval: () => 0,
      localStorage: w.localStorage, sessionStorage: w.sessionStorage, confirm: () => true, fetch: w.fetch };
    w2.window = w2; vm.createContext(w2);
    vm.runInContext(/<script>([\s\S]*)<\/script>/.exec(html)[1], w2, { filename: 'page.js:reload' });
    await tickUntil(() => w2.__as2gui);
    await tickUntil(() => r2.querySelector('button[data-task-start]'));
    return { w: w2, doc: d2, row: r2 };
  };
  let id = null;
  try {
    await w.TASK.open('zq', 'make'); await settle(60);
    const d0 = w.TASK.state().draft; id = d0 && d0.id;
    ok(d0 && d0.recipe === 'zq' && d0.mode === 'quick', 'a new task opens in Quick', JSON.stringify(d0 && d0.mode));
    ok(stepIds() === 'base,mode,q:name,q:a3,g:adv,g:more,review,write,check,test,done', 'Quick: one line per kept group, the required question stays a step', stepIds());
    const cnt = q('span[data-task-count]');
    ok(cnt && /Step 1 of 11/.test(cnt.textContent) && /\(4 more kept as copied\)/.test(cnt.textContent), 'the head says the step and how many more stay as copied', cnt && cnt.textContent);
    const tt = q('span[data-task-title]');
    ok(tt && /task\.zq\.tm/.test(tt.textContent) && !/task\.zq\.tc/.test(tt.textContent), 'the head names the make title of a title per verb', tt && tt.textContent);
    const sw = q('select[data-task-modesw]');
    ok(sw && !sw.hidden && sw.value === 'quick', 'the head has the Quick or Everything switch, on Quick', sw && sw.value);
    const fa = by('div[data-task-fold]', 'task-fold', 'adv');
    ok(fa && /task\.zq\.g\.adv: 2 values kept as copied/.test(fa.textContent) && !!fa.querySelector('button[data-task-askgroup]'), 'a folded group line says its count and has Ask these', fa && fa.textContent);
    // lookup results: the name first, the id and place as smaller text; no name: the id alone
    await settle(20);
    const rn = qa('b[data-task-rname]').map(b => b.textContent), ri = qa('span[data-task-rid]').map(s => s.textContent);
    ok(rn.join('|') === 'Tiger One|t2' && ri.length === 1 && /t1/.test(ri[0]) && /game/.test(ri[0]), 'a result shows the name first and the id and place under it; one with no name shows its id alone', JSON.stringify([rn, ri]));
    by('button[data-id]', 'id', 't1').click(); await settle(10);
    w.TASK.next(); await settle(40);
    ok(cur() === 'mode', 'after What to copy comes the Quick or Everything step', cur());
    const ms = qa('input[data-task-mode]');
    ok(ms.length === 2 && ms[0].checked && ms[0].attrs.value === 'quick', 'the mode step offers Quick (picked) and Everything', ms.map(m => m.attrs.value + (m.checked ? '*' : '')).join(','));
    ms[1].checked = true; ms[1].fire('change'); w.TASK.next(); await settle(40);
    ok(cur() === 'q:name' && D.load(ctx, id).mode === 'all' && /q:a1,q:a2,q:a3,q:m1,q:m2/.test(stepIds()) && !/g:/.test(stepIds()), 'Everything: every question is a step, the choice is saved', stepIds());
    ok(q('select[data-task-modesw]').value === 'all' && !/more kept/.test(q('span[data-task-count]').textContent), 'the switch follows, the head counts no folded values');
    // the head switch, any time: back to Quick, the window stays on its step
    const sw2 = q('select[data-task-modesw]'); sw2.value = 'quick'; sw2.fire('change'); await settle(30);
    ok(cur() === 'q:name' && D.load(ctx, id).mode === 'quick' && /g:adv/.test(stepIds()), 'the head switch folds again and stays on the step', cur() + ' ' + stepIds());
    // Ask these opens only that group, at its first question
    by('button[data-task-askgroup]', 'task-askgroup', 'adv').click(); await settle(30);
    ok(cur() === 'q:a1' && D.load(ctx, id).asked.join(',') === 'adv' && /g:more/.test(stepIds()) && !/g:adv/.test(stepIds()), 'Ask these opens just that group, at its first question', cur() + ' ' + stepIds());
    ok(/\(2 more kept as copied\)/.test(q('span[data-task-count]').textContent), 'the head count drops', q('span[data-task-count]').textContent);
    // the per group keep button still folds it again
    const kb = q('button[data-task-keepgroup]');
    ok(!!kb, 'a question of an opened group keeps its Keep the whole group button');
    if (kb) { kb.click(); await settle(30); }
    ok(/g:adv/.test(stepIds()) && !D.load(ctx, id).asked.includes('adv'), 'Keep the whole group folds it again', stepIds());
    // the folded group step lists what stays and has Ask these
    by('button.tk-step', 'step', 'g:more').click(); await settle(20);
    const fl = q('div[data-task-foldlist]');
    ok(fl && fl.querySelectorAll('tr').length === 2 && !!q('div[data-task-q]').querySelector('button[data-task-askgroup]'), 'a folded group step lists each value as copied and has Ask these', fl && fl.textContent);
    // Review: how many values stay as copied, per kept group
    by('button.tk-step', 'step', 'review').click(); await settle(40);
    const kg = qa('div[data-task-keptg]');
    ok(kg.length === 2 && kg.every(x => /2 values stay as copied/.test(x.textContent)), 'Review lists each kept group with how many values stay as copied', kg.map(x => x.textContent).join(' | '));
    const probs = BC.checkScreen(win, 'task');
    ok(!probs.length, 'the switch and the folded lines follow the blocks contract', probs.slice(0, 5).join(' | '));
    // a reload opens the task again at its step; the row names the title of each verb
    const saved = JSON.parse(sstore.get('task.open') || '{}');
    ok(saved.id === id && saved.step === 'review', 'sessionStorage holds the open task and its step', JSON.stringify(saved));
    const p2 = await mkPage();
    await tickUntil(() => p2.w.TASK.state().draft);
    await settle(20);
    const s2 = p2.w.TASK.state(), win2 = p2.doc.getElementById('taskwin');
    ok(s2.draft && s2.draft.id === id && s2.steps[s2.at].id === 'review' && win2 && !win2.hidden, 'after a reload the task opens again at its step', JSON.stringify({ d: s2.draft && s2.draft.id, at: s2.steps[s2.at] && s2.steps[s2.at].id }));
    const opt = v => p2.row.querySelectorAll('option').find(o => o.attrs.value === v);
    ok(opt('zq') && opt('zq').textContent === 'task.zq.tm', 'the row names the make title', opt('zq') && opt('zq').textContent);
    const vs2 = p2.row.querySelector('select[data-task-verb]'); vs2.value = 'change'; vs2.fire('change'); await settle(5);
    ok(opt('zq') && opt('zq').textContent === 'task.zq.tc', 'the row names the change title for change', opt('zq') && opt('zq').textContent);
    await p2.w.TASK.close(); await settle(30);
    ok(!sstore.has('task.open'), 'closing the task clears what a reload would open');
    await p2.w.TASK.open('zq', 'change'); await settle(60);
    const t2 = p2.doc.getElementById('taskwin').querySelector('span[data-task-title]');
    ok(t2 && /task\.zq\.tc/.test(t2.textContent), 'the head names the change title', t2 && t2.textContent);
    const cid = p2.w.TASK.state().draft.id;
    await p2.w.TASK.close(); await settle(30); D.remove(ctx, cid);
    // seeded defect: a stored task that is gone opens nothing and is cleared
    sstore.set('task.open', JSON.stringify({ id: 'zq-00000000-gone', step: 'review', stack: [] }));
    const p3 = await mkPage(); await settle(60);
    ok(!p3.w.TASK.state().draft && !sstore.has('task.open'), 'a stored task that is gone opens nothing and is cleared', JSON.stringify([p3.w.TASK.state().draft, sstore.get('task.open')]));
    await w.TASK.close(); await settle(30);
  } finally { if (id) try { D.remove(ctx, id); } catch (e) { /* gone */ } S.setRecipes(Object.values(keep)); sstore.delete('task.open'); }
}

// README Changes 45 and on: the write gate, the outside-program guard, words per verb, upload content checks, list sources, lookups
// that say why, a suggested answer, limits.usual, when $copy, the indent rule, every core key has a row
async function coreFixes5(ctx, call) {
  const keep = S.recipes(), all = () => Object.values(keep);
  // every tx('task.x') / tkVk('task.x') key the core page script names has a row (seeded: a made up key is caught)
  const rows = new Set(require('./lang').map(r => r[0])), src = fs.readFileSync(path.join(__dirname, 'client.js'), 'utf8');
  const used = k => [...k.matchAll(/(?:tx|tkVk)\('(task\.[A-Za-z0-9_.-]+)'/g)].map(m => m[1]).filter(x => !/\.$/.test(x));
  const miss = [...new Set(used(src))].filter(k => !rows.has(k));
  ok(!miss.length, 'every task key the page script names has a row in lang.js', miss.join(', '));
  ok(used("tx('task.zz.madeUp')").filter(k => !rows.has(k)).length === 1, 'seeded: a key with no row is caught');
  ok(rows.has('task.w.saved'), 'task.w.saved has its row');
  // the indent rule: a gate every later question names is no lead; a real follow-up is indented; indent false wins
  const gq = qs => ({ id: 'zi', verbs: ['make'], games: ['as64'], needs: [], title: 'task.zi.t', groups: [{ id: 'g', title: 'task.zi.g', essential: true, q: qs }], compile: () => ({}) });
  const dep = (r, a) => RC.steps(r, { answers: a || {}, kept: [] }, {}).filter(s => s.kind === 'q').map(s => s.q + s.depth).join(',');
  const yes = { src: 'value', value: true }, no = { src: 'value', value: false };
  const gate = gq([{ id: 'remove', kind: 'yesno', ask: 'k' }, { id: 'a', kind: 'yesno', ask: 'k', when: { remove: false } }, { id: 'b', kind: 'text', ask: 'k', when: { remove: false, a: true } },
    { id: 'c', kind: 'text', ask: 'k', when: { remove: false, a: true } }, { id: 'd', kind: 'text', ask: 'k', when: { remove: false } }]);
  ok(dep(gate, { remove: no, a: yes }) === 'remove0,a0,b1,c1,d0', 'a remove gate indents nothing; the follow-ups of a are indented', dep(gate, { remove: no, a: yes }));
  const fol = gq([{ id: 'x', kind: 'yesno', ask: 'k' }, { id: 'y', kind: 'text', ask: 'k', when: { x: true } }, { id: 'z', kind: 'text', ask: 'k', when: { x: true }, indent: false }, { id: 'v', kind: 'text', ask: 'k' }]);
  ok(dep(fol, { x: yes }) === 'x0,y1,z0,v0', 'a real follow-up is indented, indent: false is not', dep(fol, { x: yes }));
  ok(errs(RC.validate(gq([{ id: 'x', kind: 'text', ask: 'task.zi.k', indent: 'yes' }]), null, {})).some(m => /indent must be/.test(m)), 'indent must be true or false');
  // when $copy: a question only where the copy has that value
  const cp = gq([{ id: 'n', kind: 'text', ask: 'task.zi.k' }, { id: 'arm', kind: 'number', ask: 'task.zi.k', when: { $copy: 'armor' } },
    { id: 'kind', kind: 'text', ask: 'task.zi.k', when: { $copy: { id: 'type', is: ['tank', 'car'] } } }]);
  ok(!errs(RC.validate(cp, null, {})).length, 'when $copy validates', JSON.stringify(errs(RC.validate(cp, null, {}))));
  const qsOf = v => RC.steps(cp, { answers: {}, kept: [] }, v).filter(s => s.kind === 'q').map(s => s.q).join(',');
  ok(qsOf({ armor: 20, type: 'tank' }) === 'n,arm,kind' && qsOf({ type: 'gun' }) === 'n' && qsOf({ armor: '', type: 'car' }) === 'n,kind', '$copy asks a question only where the copy has that value', [qsOf({ armor: 20, type: 'tank' }), qsOf({ type: 'gun' }), qsOf({ armor: '', type: 'car' })].join(' | '));
  ok(errs(RC.validate(gq([{ id: 'n', kind: 'text', ask: 'task.zi.k', when: { $copy: 5 } }]), null, {})).some(m => /\$copy must be/.test(m)), 'a bad $copy is refused');
  // limits.usual, suggest and picker.check are checked
  ok(errs(RC.validate(gq([{ id: 'n', kind: 'number', ask: 'task.zi.k', limits: { min: 0, max: 10, usual: [2, 20] } }]), null, {})).some(m => /inside min and max/.test(m)), 'limits.usual outside min and max is refused');
  ok(errs(RC.validate(gq([{ id: 'n', kind: 'text', ask: 'task.zi.k', limits: { usual: [1, 2] } }]), null, {})).some(m => /number question/.test(m)), 'limits.usual on a text question is refused');
  ok(errs(RC.validate(gq([{ id: 'f', kind: 'id', ask: 'task.zi.k', suggest: { from: 't' } }, { id: 't', kind: 'text', ask: 'task.zi.k' }]), null, {})).some(m => /suggest must be/.test(m)), 'suggest from a later question is refused');
  ok(errs(RC.validate(gq([{ id: 'f', kind: 'file', ask: 'task.zi.k', picker: { sources: ['file'], kinds: ['sound'], check: 'no' } }]), null, {})).some(m => /picker.check must be/.test(m)), 'picker.check must be a function');
  // upload: the bytes must be what the name says (seeded: an MP3 renamed .wav); a recipe adds its own check
  const zu = { id: 'zu', verbs: ['make'], games: ['as64'], needs: ['mod'], title: 'task.zu.t', groups: [{ id: 'g', title: 'task.zu.g', essential: true, q: [
    { id: 'snd', kind: 'file', ask: 'task.zu.q', picker: { sources: ['file'], kinds: ['.wav'] } },
    { id: 'any', kind: 'file', ask: 'task.zu.q', picker: { sources: ['file'], kinds: ['sound'] } },
    { id: 'own', kind: 'file', ask: 'task.zu.q', picker: { sources: ['file'], kinds: ['any'], check: f => (/bad/.test(f.name) ? 'task.zu.bad' : f.size < 4 ? 'too short' : null) } },
    { id: 'ls', kind: 'list', ask: 'task.zu.q', picker: { sources: ['exist'], lookup: 'file' } }] }], compile: () => ({ notes: ['zu'] }) };
  S.setRecipes(all().concat([zu]));
  try {
    const um = path.join(scratch, 'mods', 'zumod'); fs.mkdirSync(um, { recursive: true });
    const zd = D.save(ctx, { id: D.newId('zu'), recipe: 'zu', verb: 'make', game: 'as64', mod: um, answers: {}, kept: [], state: 'open' });
    const up = (q, name, buf) => call('POST /api/x/task/upload', '/x', { draft: zd.id, q, name, off: 0, b64: buf.toString('base64'), last: true });
    const id3 = Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0, 0, 0, 0, 0]), Buffer.alloc(200, 1)]);
    const raw = Buffer.concat([Buffer.from([0xFF, 0xFB, 0x90, 0x64]), Buffer.alloc(200, 1)]);
    const ogg = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(200, 1)]);
    const pcm = new Int16Array(100); const good = wav.encodePcm16({ rate: 8000, channels: 1, pcm: [pcm] });
    const r1 = await up('snd', 'song.wav', id3);
    ok(r1.done && !r1.ok && r1.whyKey === 'task.up.really' && r1.whyParams.t === 'mp3' && r1.whyParams.e === 'wav' && r1.whyParams.d === 'task.up.do.wav' && !fs.existsSync(D.stagedPath(ctx, zd.id, 'song.wav')), 'seeded: an MP3 renamed to .wav is refused at upload and deleted', JSON.stringify(r1));
    const r2 = await up('snd', 'song2.wav', raw);
    ok(!r2.ok && r2.whyParams && r2.whyParams.t === 'mp3', 'an MP3 with no tag renamed .wav is refused too', JSON.stringify(r2));
    const r3 = await up('any', 'loop.wav', ogg);
    ok(!r3.ok && r3.whyParams && r3.whyParams.t === 'ogg', 'an OGG renamed .wav is refused even where sounds are taken', JSON.stringify(r3));
    const r4 = await up('snd', 'beep.wav', good);
    ok(r4.ok && r4.type === 'wav', 'a real wav is taken', JSON.stringify(r4));
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
    ok(!(await up('own', 'pic.dds', png)).ok && (await up('own', 'pic.png', png)).ok, 'a PNG named .dds is refused; named .png it is taken');
    const r5 = await up('own', 'bad.bin', Buffer.from('xxxxxxxx'));
    ok(!r5.ok && r5.whyKey === 'task.zu.bad', 'the recipe check refuses with its own key', JSON.stringify(r5));
    const r6 = await up('own', 'a.bin', Buffer.from('xy'));
    ok(!r6.ok && r6.why === 'too short' && !r6.whyKey, 'the recipe check refuses in its own words', JSON.stringify(r6));
    ok(['task.up.really', 'task.up.notKind', 'task.up.do.wav', 'task.up.do.sound', 'task.up.do.pic', 'task.up.do.dds', 'task.up.do.video', 'task.up.t.mp3', 'task.up.t.ogg'].every(k => rows.has(k)), 'the upload refusals have their rows');
    // a list line answered by a source the question does not name is refused by the plan (seeded: a typed line on an exist list)
    D.save(ctx, Object.assign(D.load(ctx, zd.id), { answers: { ls: { src: 'list', items: [{ src: 'value', value: 'typed' }] } } }));
    const pl = await call('POST /api/x/task/plan', '/x', { draft: zd.id });
    ok(pl.errors.some(e => e.code === 'TASK_LINE_SRC'), 'a typed line on a list that takes only exist is refused', JSON.stringify(pl.errors));
    D.save(ctx, Object.assign(D.load(ctx, zd.id), { answers: { ls: { src: 'list', items: [{ src: 'exist', value: 'a.wav' }] } } }));
    ok(!(await call('POST /api/x/task/plan', '/x', { draft: zd.id })).errors.some(e => e.code === 'TASK_LINE_SRC'), 'a line from a named source passes');
    D.remove(ctx, zd.id);
  } finally { S.setRecipes(all()); }
  // the outside-program guard: a program that saves into the mod; I am done (or Throw away) gives each changed file a restore point
  externalHooks();
  try {
    const gm = path.join(scratch, 'mods', 'guardmod'); fs.mkdirSync(path.join(gm, 'set'), { recursive: true }); fs.writeFileSync(path.join(gm, 'set', 'a.txt'), 'old');
    const gd = D.save(ctx, { id: D.newId('mod'), recipe: 'mod', verb: 'make', game: 'as64', mod: gm, answers: {}, kept: [], state: 'open' });
    const open = b => call('POST /api/x/task/external/open', '/x', Object.assign({ draft: gd.id }, b));
    const rv = await open({ id: 'game-editor', action: 'reveal' });
    ok(rv.inMod === true && rv.guard && rv.guard.open, 'a program that saves into the mod opens the guard', JSON.stringify(rv));
    fs.writeFileSync(path.join(gm, 'set', 'a.txt'), 'changed by the program'); fs.writeFileSync(path.join(gm, 'set', 'b.txt'), 'new');
    const bk = await call('POST /api/x/task/external/back', '/x', { draft: gd.id });
    ok(bk.closed && bk.restore.length >= 2, 'I am done gives each changed or new file a restore point', JSON.stringify(bk));
    const bk2 = await call('POST /api/x/task/external/back', '/x', { draft: gd.id });
    ok(!bk2.closed && !bk2.restore.length, 'the guard closes once (seeded: a second I am done finds nothing)', JSON.stringify(bk2));
    await open({ id: 'game-editor', action: 'reveal' });
    fs.writeFileSync(path.join(gm, 'set', 'a.txt'), 'again');
    const del = await call('POST /api/x/task/draft/delete', '/x', { id: gd.id });
    ok(del.restore && del.restore.length === 1, 'Throw away closes the guard with restore points', JSON.stringify(del));
    ok(!fs.existsSync(path.join(D.stageRoot(ctx), gd.id + '.extguard.json')), 'no guard file is left');
  } finally { E._reset(); }
}

// the page side of Changes 45 and on: the write gate, words for a task with no copy and for change, the usual range warning, list
// lines only from named sources, a lookup that says why
async function pageCore4(w, doc, win, sstore, ctx, BC) {
  const keep = S.recipes();
  const zw = { id: 'zw', verbs: ['make'], games: ['as64', 'mowas2'], needs: [], title: 'task.zw.t', groups: [{ id: 'g', title: 'task.zw.g', essential: true, q: [
    { id: 'name', kind: 'text', ask: 'task.zw.q.name' },
    { id: 'n1', kind: 'number', ask: 'task.zw.q.n1', limits: { min: 0, max: 100, usual: [1, 10] } },
    { id: 'lines', kind: 'list', ask: 'task.zw.q.lines', optional: true, picker: { sources: ['exist'], lookup: 'why' } }] }],
    lookups: { why: async () => ({ results: [], why: 'No folder is set here.', do: 'Pick it first.' }) },
    values: () => ({ n1: 7 }), compile: () => ({ notes: ['zw'] }) };
  S.setRecipes(Object.values(keep).concat([zqOf(), zw]));
  const settle = n => ticks(n || 40);
  const q = s => win.querySelector(s), qa = s => win.querySelectorAll(s);
  const go = async st => { const b = qa('button.tk-step').find(e => e.dataset.step === st); if (b) b.click(); await settle(40); return !!b; };
  const cur = () => { const s = w.TASK.state(); return s.steps[s.at] && s.steps[s.at].id; };
  let id = null;
  try {
    await w.TASK.open('zw', 'make'); await settle(60);
    id = w.TASK.state().draft.id;
    // no copy: Suggested, Use the suggestion, never a copy word
    await go('q:n1');
    const bv = q('div[data-task-basev]'), kb = q('button[data-task-keep]');
    ok(bv && /^Suggested: 7/.test(bv.textContent) && kb && kb.textContent === 'Use the suggestion' && !/cop(y|ied)/i.test(q('div[data-task-q]').textContent), 'a task with no copy says Suggested and Use the suggestion, no copy words (seeded: The copy has)', [bv && bv.textContent, kb && kb.textContent].join(' | '));
    // the usual range: a warning, not a refusal
    const inp = q('input[data-task-input]'), uw = q('div[data-task-usual]');
    ok(uw && uw.hidden, 'inside the usual range no warning shows');
    inp.value = '50'; inp.fire('input'); await settle(5);
    ok(uw && !uw.hidden && /1 to 10/.test(uw.textContent) && /go on/.test(uw.textContent), 'outside the usual range a plain warning shows', uw && uw.textContent);
    w.TASK.next(); await settle(40);
    ok(cur() === 'q:lines' && D.load(ctx, id).answers.n1.value === 50, 'the warning never refuses: Next goes on', cur());
    // a list line offers only the named sources (seeded: a typed line) and a lookup with nothing says why
    q('button[data-task-addline]').click(); await settle(10);
    const opts = q('select[data-task-linesrc]').querySelectorAll('option').map(o => o.attrs.value);
    ok(opts.join(',') === 'exist', 'a list line offers only the sources the recipe names (no typed line)', opts.join(','));
    q('button[data-task-find]').click(); await settle(30);
    const lw = q('div[data-task-lookwhy]'), ld = q('div[data-task-lookdo]');
    ok(lw && lw.textContent === 'No folder is set here.' && ld && ld.textContent === 'Pick it first.', 'a lookup with nothing to pick says why and what to do', [lw && lw.textContent, ld && ld.textContent].join(' | '));
    await w.TASK.close(); await settle(30);
    const dl = D.load(ctx, id); dl.answers.lines = { src: 'list', items: [{ src: 'value', value: 'typed' }] }; D.save(ctx, dl);
    await w.TASK.resume(id); await settle(40); await go('q:lines');
    w.TASK.next(); await settle(30);
    const rf = q('div[data-task-refuse]');
    ok(cur() === 'q:lines' && rf && /Line 1/.test(rf.textContent), 'a stored typed line on a list that takes none is refused', rf && rf.textContent);
    // the write gate: Next is off on Write, Enter refuses, Check, Test and Done say nothing is written yet
    await go('write');
    const nx = q('button[data-task-next]');
    ok(cur() === 'write' && nx && nx.disabled && !!q('button[data-task-nowrite]'), 'on Write, Next is off and Do not write now is offered (seeded: Next on)', nx && String(nx.disabled));
    w.TASK.next(); await settle(20);
    ok(cur() === 'write' && /Press Write first/.test((q('div[data-task-refuse]') || {}).textContent || ''), 'Next by key is refused with what to do', cur());
    for (const st of ['check', 'test', 'done']) {
      await go(st);
      ok(cur() === st && !!q('div[data-task-unwritten]') && !q('button[data-task-next]') && !q('button[data-task-play]'), st + ' of a task not written says so and offers Go to Write', q('div[data-task-q]').textContent.slice(0, 200));
    }
    q('button[data-task-gowrite]').click(); await settle(30);
    ok(cur() === 'write', 'Go to Write goes to Write');
    const probs = BC.checkScreen(win, 'task');
    ok(!probs.length, 'the gated steps follow the blocks contract', probs.slice(0, 5).join(' | '));
    q('button[data-task-nowrite]').click(); await settle(40);
    ok(win.hidden && D.load(ctx, id).state !== 'written', 'Do not write now saves and closes, nothing written');
    // change: Now and Leave as it is
    await w.TASK.open('zq', 'change'); await settle(60);
    const cid = w.TASK.state().draft.id;
    const sw = q('select[data-task-modesw]'); if (sw) { sw.value = 'all'; sw.fire('change'); await settle(30); }
    await go('q:a1');
    const cb = q('div[data-task-basev]'), ck = q('button[data-task-keep]');
    ok(cb && /^Now: 5/.test(cb.textContent) && ck && ck.textContent === 'Leave as it is', 'a change task says Now and Leave as it is', [cb && cb.textContent, ck && ck.textContent].join(' | '));
    await w.TASK.close(); await settle(30); D.remove(ctx, cid);
  } finally { if (id) try { D.remove(ctx, id); } catch (e) { /* gone */ } S.setRecipes(Object.values(keep)); sstore.delete('task.open'); }
}

// README Changes 55 and on (server side and the page's own rules): a game file the mod gets its own copy of is "copy", the three
// columns and their stacking order, the look pane's cap, the 3D view asked with doc false
async function coreFixes6(ctx, call) {
  const keep = S.recipes();
  const cg = path.join(scratch, 'cpgame'); fs.mkdirSync(path.join(cg, 'resource', 'set'), { recursive: true });
  fs.writeFileSync(path.join(cg, 'resource', 'set', 'zz_game.set'), '{a 1}\r\n');
  const cm = path.join(cg, 'mods', 'cpmod'); fs.mkdirSync(path.join(cm, 'resource', 'set'), { recursive: true });
  fs.writeFileSync(path.join(cm, 'resource', 'set', 'zz_mine.set'), '{b 1}\r\n');
  const gctx = Object.assign({}, ctx, { game: () => cg });
  const tos = ['resource/set/zz_game.set', 'resource/set/zz_mine.set', 'resource/set/zz_fresh.set'];
  const zc = { id: 'zc', verbs: ['make'], games: ['as64'], title: 'task.zc.t', groups: [], compile: () => ({ copies: tos.map(to => ({ staged: 'a.set', to })) }) };
  S.setRecipes(Object.values(keep).concat([zc]));
  let id = null;
  try {
    const d = D.save(gctx, { id: D.newId('zc'), recipe: 'zc', verb: 'make', game: 'as64', mod: cm, answers: {}, kept: [], state: 'open' }); id = d.id;
    const sf = D.stagedPath(gctx, d.id, 'a.set'); fs.mkdirSync(path.dirname(sf), { recursive: true }); fs.writeFileSync(sf, '{c 1}\r\n');
    const p = await CP.plan(gctx, d.id, S.recipes());
    const act = r => (p.files.find(x => x.rel === r) || {}).action;
    ok(act(tos[0]) === 'copy', 'a game file the mod gets its own changed copy of is "copy" (seeded: new)', JSON.stringify(p.files));
    ok(act(tos[1]) === 'change' && act(tos[2]) === 'new', 'a file the mod has is change, a file that is nowhere yet is new', JSON.stringify(p.files));
    const L = new Map(require('./lang').map(r => [r[0], r]));
    ok(L.has('task.rev.copy') && L.get('task.rev.copy')[1] === 'copy of a game file, changed' && L.get('task.rev.copy').slice(1).every(Boolean), 'the Review list words copy in the four languages');
    ok(L.has('task.lk.noPreview') && L.get('task.lk.noPreview')[1] === 'No preview for this file', 'an unknown binary says No preview for this file');
  } finally { if (id) D.remove(gctx, id); S.setRecipes(Object.values(keep)); }
  // the layout: three columns down to 820 px, below that question, look, steps; the look pane capped with its own scroll
  const css = require('./client').css;
  ok(/\[data-blk="task\.body"\]\{display:grid;grid-template-columns:minmax\(9em,13em\) minmax\(0,1fr\) minmax\(14em,24em\)/.test(css), 'the window body is three grid columns (steps, question, look)');
  ok(/\[data-blk="task\.body"\]>\.blk\{min-width:0\}/.test(css), 'no column grows to its widest content (a long line wraps or scrolls inside)');
  const mq = /@media \(max-width:819px\)\{([^\n]*)\}/.exec(css);
  ok(mq && /task\.main"\]\{order:1\}/.test(mq[1]) && /task\.side"\]\{order:2\}/.test(mq[1]) && /task\.steps"\]\{order:3\}/.test(mq[1]) && /grid-template-columns:minmax\(0,1fr\)/.test(mq[1]), 'below 820 px the columns stack: question, look, steps', mq && mq[1]);
  ok(/\.tk-look\{[^}]*max-height:60vh;overflow:auto/.test(css) && !/@media[^{]*\{[^}]*\.tk-look\{/.test(css), 'the look pane is capped with its own scroll at every width');
  const src = fs.readFileSync(path.join(__dirname, 'client.js'), 'utf8');
  ok(/doc:false/.test(src) && !/kind:'hex'/.test(src), 'the look pane asks the 3D view with doc false and never asks for a hex view');
  const vsrc = fs.readFileSync(path.join(__dirname, '..', 'models', 'sub', 'viewer.client.js'), 'utf8');
  ok((vsrc.match(/opts\.doc===false(\|\|SCN)?\?null:EXT_SCREENS\.models\.doc/g) || []).length === 3 && /opts\.doc!==false&&(!SCN&&)?EXT_SCREENS\.models\.parts/.test(vsrc), 'the 3D view with doc false never reads the open model, its hidden parts or its gizmo');
}

// README Changes 55 and on, in the page: values after the base is saved, the look pane, search as you type, Enter, refusals,
// Suggested, capital titles and draft names, an empty task leaves nothing
async function pageCore5(w, doc, win, sstore, ctx, BC) {
  const keep = S.recipes();
  const tdir = path.join(scratch, 'lookfiles'); fs.mkdirSync(tdir, { recursive: true });
  const tfile = path.join(tdir, 'zz_lines.set'), bfile = path.join(tdir, 'zz_blob.vol');
  fs.writeFileSync(tfile, Array.from({ length: 60 }, (x, i) => '{line_' + (i + 1) + '}').join('\r\n'));
  fs.writeFileSync(bfile, Buffer.from([0, 1, 2, 3, 0, 5]));
  let finds = 0;
  const zv = { id: 'zv', verbs: ['make'], games: ['as64', 'mowas2'], needs: [], base: { lookup: 'thing' }, title: 'task.zv.t',
    groups: [{ id: 'g', title: 'task.zv.g', essential: true, q: [
      { id: 'newid', kind: 'id', ask: 'task.zv.q.newid' },
      { id: 'sell', kind: 'yesno', ask: 'task.zv.q.sell' },
      { id: 'pic', kind: 'thing', ask: 'task.zv.q.pic', picker: { sources: ['keep', 'exist'], lookup: 'pics' } },
      { id: 'n1', kind: 'number', ask: 'task.zv.q.n1' }] }],
    lookups: {
      thing: async (c, words) => { finds++; return [{ id: 'tk1', name: 'Tank One', where: 'game', ref: { key: 'resource/entity/-vehicle/zz/tk1/tk1.mdl' } }].filter(x => !words || x.id.includes(words) || /tank/i.test(words)); },
      pics: async () => [{ id: 'p1', name: 'p1.dds', ref: { key: 'resource/entity/-vehicle/zz/tk1/p1.dds' } }, { id: 's1', name: 's1.wav', ref: { key: 'resource/sound/s1.wav' } },
        { id: 't1', name: 'zz_lines.set', ref: { path: tfile } }, { id: 'b1', name: 'zz_blob.vol', ref: { path: bfile } }, { id: 'u1', name: 'Unit One', ref: { entity: 'zz_unit' } }],
    },
    // the values read the saved draft: no base saved yet, nothing to say (the old order asked before the save)
    values: (c, base) => (base && base.id ? { newid: base.id + '_m2', sell: true, n1: 3 } : {}),
    compile: () => ({}) };
  S.setRecipes(Object.values(keep).concat([zv]));
  const settle = n => ticks(n || 40);
  const q = s => win.querySelector(s), qa = s => win.querySelectorAll(s);
  const go = async st => { const b = qa('button.tk-step').find(e => e.dataset.step === st); if (b) b.click(); await settle(40); return !!b; };
  const cur = () => { const s = w.TASK.state(); return s.steps[s.at] && s.steps[s.at].id; };
  const look = () => q('div[data-task-look]');
  const toastEl = doc.getElementById('toast');
  let id = null, id2 = null;
  try {
    // an empty task: opened and closed with nothing given leaves no draft and says nothing (seeded: Saved and a draft)
    if (toastEl) toastEl.textContent = '';
    await w.TASK.open('zv', 'make'); await settle(60);
    const eid = w.TASK.state().draft.id;
    await w.TASK.close(); await settle(40);
    let gone = false; try { D.load(ctx, eid); } catch (e) { gone = true; }
    ok(gone && !(toastEl && /Saved/.test(toastEl.textContent)), 'a task opened and closed with no answer leaves no draft and no Saved toast', toastEl && toastEl.textContent);
    // the title starts with a capital letter
    await w.TASK.open('zv', 'make'); await settle(60);
    id = w.TASK.state().draft.id;
    const tt = q('span[data-task-title]');
    ok(tt && /^Make /.test(tt.textContent), 'the window title starts with a capital letter', tt && tt.textContent);
    const f0 = finds;
    ok(cur() === 'base' && f0 >= 1, 'the base step asks the lookup when it opens', cur() + ' ' + finds);
    // the 3D view as the page makes it (the Models part needs WebGL, which the fake page has not): what it is asked for
    const v3calls = []; w.TASK.look3d = (c, o) => { v3calls.push({ c, o }); const e = doc.createElement('div'); ['task.look.v3.bar', 'task.look.v3.canvas', 'task.look.v3.keys'].forEach(b => { const k = doc.createElement('div'); k.setAttribute('data-blk', b); e.appendChild(k); }); return e; };
    // search as the user types, after a short pause (seeded: only Enter and Find)
    const si = q('input[data-task-search]'); si.value = 'tank'; si.fire('input'); await settle(30);
    ok(finds === f0 + 1 && !!q('button[data-id=tk1]'), 'the lookup runs again as the user types', finds - f0);
    q('button[data-id=tk1]').click(); await settle(20);
    // the base's model: a small 3D view in the look pane, never a hex dump
    const v3 = q('div[data-task-look3d]');
    ok(v3 && v3.getAttribute('data-task-look3d') === 'resource/entity/-vehicle/zz/tk1/tk1.mdl' && !look().querySelector('div.vw-host[data-kind=hex]'), 'a picked model shows in a 3D view (the .mdl key as its target), no hex', look().textContent.slice(0, 200));
    const vc = v3calls[0], kids = v3 ? v3.querySelector('div').children : [];
    ok(v3calls.length === 1 && vc.o.doc === false && vc.c.set.target === 'resource/entity/-vehicle/zz/tk1/tk1.mdl' && vc.o.height <= 300, 'the 3D view is asked read only (doc false) for the .mdl, small', JSON.stringify(v3calls.map(x => x.o)));
    ok(kids.length === 3 && kids.map(k => k.style.display === 'none' ? 0 : 1).join('') === '010' && kids.every(k => k.getAttribute('data-blk') == null), 'only its canvas shows (one pane, no bars) and it holds no blocks of its own', kids.map(k => k.getAttribute('data-blk') + ':' + k.style.display).join());
    // Browse (seeded): the lookup box's Browse reaches the file picker at the kind's folder (thing: set/stuff in the game data); the
    // picked file's base name goes into the box and is looked up (a name with no result: the base picked above stays)
    {
      const keepP = w.searchKit.picker, specs = [], f1 = finds;
      w.searchKit.picker = (b, cb) => { specs.push(b); cb('set/stuff/zz/nothing_here.set', { view: 'data', path: 'set/stuff/zz/nothing_here.set', key: 'resource/set/stuff/zz/nothing_here.set', name: 'nothing_here.set' }); };
      try { si._sk.browseButton.click(); await settle(30); } finally { w.searchKit.picker = keepP; }
      ok(specs.length === 1 && specs[0].view === 'data' && specs[0].start === 'set/stuff' && specs[0].mode === 'file' && si.value === 'nothing_here' && finds === f1 + 1, 'the lookup box\'s Browse opens the file picker at the kind\'s folder; the base name of the pick is looked up', JSON.stringify(specs) + ' ' + si.value + ' ' + (finds - f1));
    }
    // values after the base is saved: the id is prefilled and said to be a suggestion, the yes or no is set (seeded: the old order)
    w.TASK.next(); await settle(60);
    if (cur() === 'mode') { w.TASK.next(); await settle(40); }
    let inp = q('input[data-task-input]');
    const bv = q('div[data-task-basev]'), kb = q('button[data-task-keep]');
    ok(cur() === 'q:newid' && inp && inp.value === 'tk1_m2', 'after the base and Next the id question is prefilled from the values (seeded: values before the save)', cur() + ' ' + (inp && inp.value));
    ok(bv && bv.textContent === 'Suggested: tk1_m2' && kb && kb.textContent === 'Use the suggestion', 'a free id the recipe found says Suggested, not The copy has', [bv && bv.textContent, kb && kb.textContent].join(' | '));
    ok(q('div[data-task-look3d]') === v3, 'the thing being copied stays in the look pane on the next step (the same 3D view)');
    ok(!look().querySelector('div[data-task-looknone]'), 'the look pane never falls back to Pick something');
    // Enter in the box is Next
    inp.fire('keydown', { key: 'Enter' }); await settle(40);
    ok(cur() === 'q:sell' && D.load(ctx, id).answers.newid.value === 'tk1_m2', 'Enter in a text box is Next', cur());
    const rs = qa('input[name=tkq]');
    ok(rs.length === 2 && rs[0].checked && rs[0].attrs.value === 'true', 'the yes or no is set from the values', rs.map(r => r.attrs.value + (r.checked ? '*' : '')).join(','));
    // the draft is named after the new thing, the copied one only as from ...
    ok(tt && /^Make /.test(tt.textContent) && /tk1_m2  from Tank One/.test(tt.textContent), 'the draft is named after the new thing, the copy as from', tt && tt.textContent);
    // the picture question: each picked file shows as what it is
    w.TASK.next(); await settle(40);
    ok(cur() === 'q:pic', 'on to the picture question', cur());
    const ex = qa('input[data-task-src]').find(r => r.attrs.value === 'exist'); ex.checked = true; ex.fire('change'); await settle(30);
    const pick = async idv => { const b = q('button[data-id=' + idv + ']'); if (b) b.click(); await settle(30); return !!b; };
    ok(await pick('p1') && !!look().querySelector('div.vw-host[data-kind=picture]'), 'a picked picture shows as a picture', look().textContent.slice(0, 200));
    ok(await pick('s1') && !!look().querySelector('div.vw-host[data-kind=sound]'), 'a picked sound shows as a player', look().textContent.slice(0, 200));
    await pick('t1'); await settle(30);
    const pre = look().querySelector('pre[data-task-lktext]');
    ok(pre && /^\{line_1\}\n\{line_2\}/.test(pre.textContent) && pre.textContent.split('\n').length === 40 && !!look().querySelector('div[data-task-lkmore]'), 'a text file shows its first 40 lines as text', pre ? pre.textContent.slice(0, 80) : look().textContent.slice(0, 300));
    await pick('b1'); await settle(30);
    const nb = look().querySelector('div[data-task-lknone]'), sz = look().querySelector('div[data-task-lksize]');
    ok(nb && /No preview for this file/.test(nb.textContent) && nb.textContent.includes(bfile) && sz && /6/.test(sz.textContent) && !look().querySelector('div.vw-host[data-kind=hex]'), 'an unknown binary says No preview, with its size and path, never hex', nb && nb.textContent);
    await pick('u1');
    ok(v3calls.length === 2 && v3calls[1].c.set.target === 'zz_unit' && v3calls[1].o.doc === false && !!q('div[data-task-look3d]'), 'a unit picked by name (the entity lookup) shows its model in the 3D view', JSON.stringify(v3calls.map(x => x.c.set)));
    w.TASK.next(); await settle(40);
    // a question with no thing of its own shows the thing being copied again
    ok(cur() === 'q:n1' && !!q('div[data-task-look3d]') && !look().querySelector('div[data-task-looknone]'), 'a question with no thing of its own shows the thing being copied', look().textContent.slice(0, 120));
    // a refusal clears when the user types, and never carries to the next question
    inp = q('input[data-task-input]'); inp.value = 'abc'; inp.fire('keydown', { key: 'Enter' }); await settle(30);
    ok(cur() === 'q:n1' && !!q('div[data-task-refuse]'), 'a bad number is refused');
    inp.value = '4'; inp.fire('input'); await settle(5);
    ok(!q('div[data-task-refuse]'), 'typing clears the refusal (seeded: it stays)');
    inp.value = 'x'; w.TASK.next(); await settle(30);
    ok(!!q('div[data-task-refuse]'), 'refused again');
    await go('q:sell');
    ok(cur() === 'q:sell' && !q('div[data-task-refuse]'), 'the refusal does not carry over to the next question');
    // Enter on Write is not Next and says nothing (Write has its own button)
    await go('write');
    win.fire('keydown', { key: 'Enter', target: win }); await settle(20);
    ok(cur() === 'write' && !q('div[data-task-refuse]'), 'Enter on Write does nothing (seeded: Next by key)', cur());
    const probs = BC.checkScreen(win, 'task');
    ok(!probs.length, 'the new look pane follows the blocks contract', probs.slice(0, 5).join(' | '));
    // the drafts list names it after the new thing too, with a capital letter
    if (toastEl) toastEl.textContent = '';
    await w.TASK.close(); await settle(40);
    ok(toastEl && /Saved/.test(toastEl.textContent) && !!D.load(ctx, id), 'a task with answers is saved on close and says so');
    const row = doc.getElementById('taskrow'), ds = row && row.querySelector('select[data-task-drafts]');
    const opt = ds && ds.querySelectorAll('option').find(o => o.attrs.value === id);
    ok(opt && /^Make /.test(opt.textContent) && /tk1_m2  from Tank One/.test(opt.textContent), 'the Continue list names the draft after the new thing, from the copy', opt && opt.textContent);
    // a draft resumed and closed with nothing new stays (only a task opened here and left empty goes)
    await w.TASK.resume(id); await settle(40); await w.TASK.close(); await settle(30);
    ok(!!D.load(ctx, id), 'a resumed draft stays when closed');
    // explore a thing: looked at and closed leaves nothing
    S.setRecipes(Object.values(keep).concat([zqOf()]));
    if (toastEl) toastEl.textContent = '';
    await w.TASK.open('zq', 'explore'); await settle(60); id2 = w.TASK.state().draft.id;
    await w.TASK.close(); await settle(40);
    let gone2 = false; try { D.load(ctx, id2); } catch (e) { gone2 = true; }
    ok(gone2 && !(toastEl && /Saved/.test(toastEl.textContent)), 'an explore task looked at and closed leaves no draft and no toast');
  } finally {
    for (const x of [id, id2]) if (x) try { D.remove(ctx, x); } catch (e) { /* gone */ }
    delete w.TASK.look3d; S.setRecipes(Object.values(keep)); sstore.delete('task.open');
  }
}
