// models ext test: module shape, script rules (page.js), the same lang keys in en ru uk zh, a text for every tx key and loss code;
// then every route with a stubbed runTool: the argv is exactly tools/soedit/README.md's (locate --json, stage ... --dry --json f,
// open ... --anm f --lang L [--dry], check ... --game G --json f), the file set grouped with "already in the mod", and the refusals
// (no mod, the game install as mod, a name starting with "-", open before staging, a path outside the mod). No game, no SOEdit.
// usage: node test.js <scratch dir>
// Author: Imperator_Aug (ARSENAL, ia-b58621aa)
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ext = require('./index');
const scratch = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'models-test'));
require('../../../lib/testscratch').guard(scratch);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(scratch, { recursive: true, force: true }); fs.mkdirSync(scratch, { recursive: true });
const game = path.join(scratch, 'game'), mod = path.join(scratch, 'mymod');
fs.mkdirSync(path.join(game, 'resource'), { recursive: true }); fs.mkdirSync(path.join(game, 'mods'), { recursive: true });
fs.mkdirSync(path.join(mod, 'resource', 'entity', 'tank', 't34'), { recursive: true });
fs.writeFileSync(path.join(mod, 'resource', 'entity', 'tank', 't34', 'body.ply'), 'x');   // one file of the set is already in the mod

let calls = [], reply = null;
const ctx = {
  gamedir: game, tools: path.resolve(__dirname, '..', '..', '..'), tmpRoot: path.join(scratch, 'tmp'), allowLaunch: false, game: () => game,
  runTool: async (tool, entry, args, o) => { calls.push({ tool, entry, args }); return reply(args); },
};
const last = () => calls[calls.length - 1];
const call = async (verb, body) => verb === 'locate' ? ext.routes['GET /api/x/models/locate'](new URL('http://127.0.0.1/api/x/models/locate'), null, ctx) : ext.routes['POST /api/x/models/' + verb]('/api/x/models/' + verb, body, ctx);
const refuses = async (verb, body, re) => { try { await call(verb, body); } catch (e) { assert.strictEqual(e.status, 400, verb + ': status ' + e.status + ' ' + e.message); assert.ok(re.test(e.message), verb + ': ' + e.message); return; } assert.fail(verb + ' was not refused'); };
const jsonArg = a => a[a.indexOf('--json') + 1];
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };
const SET = ['resource/entity/tank/t34/t34.mdl', 'resource/entity/tank/t34/body.ply', 'resource/entity/tank/t34/body.vol', 'resource/entity/tank/t34/t34.mtl',
  'resource/entity/tank/t34/t34.dds', 'resource/entity/tank/t34/move.anm', 'resource/entity/tank/t34/fire.anm'];

(async () => {
  // ---------- shape, script, languages ----------
  assert.strictEqual(ext.id, 'models'); assert.strictEqual(ext.nav, 'models.nav'); assert.ok(/EXT_SCREENS\.models\s*=/.test(ext.script));
  assert.ok(!/[`]|\$\{|innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(ext.script), 'script rules');
  assert.ok(!/(^|[^\w])[A-Za-z]:[\\/]|https?:\/\//.test(ext.script), 'no fixed drive path or address in the script');
  new vm.Script(ext.script, { filename: 'models:script' });
  const en = Object.keys(ext.lang.en).sort();
  for (const l of ['ru', 'uk', 'zh']) { assert.deepStrictEqual(Object.keys(ext.lang[l]).sort(), en, 'same keys in ' + l); for (const k of en) assert.ok(ext.lang[l][k], l + ' ' + k); }
  for (const l of ['en', 'ru', 'uk', 'zh']) for (const k of en) assert.deepStrictEqual((ext.lang[l][k].match(/\{\w+\}/g) || []).sort(), (ext.lang.en[k].match(/\{\w+\}/g) || []).sort(), 'slots ' + l + ' ' + k);
  for (const m of ext.script.matchAll(/\btx\('([a-zA-Z0-9_.]+)'/g)) assert.ok(ext.lang.en[m[1]], 'tx key ' + m[1]);
  for (const m of ext.script.matchAll(/k2\('([a-z.]+)',/g)) assert.ok(en.some(k => k.startsWith(m[1] + '.')), 'k2 prefix ' + m[1]);
  const known = JSON.parse(/var KNOWN=(\[[^\]]*\])/.exec(ext.script)[1].replace(/'/g, '"'));
  for (const c of known) assert.ok(ext.lang.en['models.code.' + c], 'text for ' + c);
  for (const g of require('./server')._t.GROUPS) assert.ok(ext.lang.en['models.g.' + g], 'group ' + g);
  for (const s of ['model', 'anim']) assert.ok(ext.lang.en['models.sub.' + s]);
  assert.ok(/SUB-PARTS/.test(ext.script) && /EXT_SCREENS\.models\.subs=\{\}/.test(ext.script) && /XP\.viewer/.test(ext.script), 'sub-parts hook: sub-tabs and the viewer come from sub/ files');
  for (const s of Object.keys(ext.lang.en).filter(k => /^models\.sub\./.test(k))) for (const c of ['ru', 'uk', 'zh']) assert.ok(ext.lang[c][s], c + ' ' + s);
  for (const c of ['en', 'ru', 'uk', 'zh']) assert.ok(!('models.credit' in ext.lang[c]) && !/Brian|TonaTor|Frostyy/.test(JSON.stringify(ext.lang[c])), 'no SOEdit author credit in the page texts (owner 2026-11-15): ' + c);
  ok('module shape, script rules, same keys and slots in 4 languages, a text for every key, loss code, group and sub-tab');

  const C = ext.commands;
  assert.deepStrictEqual(Object.keys(C), ['soeditlocate', 'soeditstage', 'soeditopen', 'soeditcheck']);
  for (const k of Object.keys(C)) { assert.strictEqual(C[k].entry, 'soedit/soedit.js'); assert.strictEqual(C[k].tool, 'soedit'); assert.ok(Array.isArray(C[k].fields) && C[k].summary); }
  assert.deepStrictEqual(Object.keys(C).map(k => C[k].lead[0]), ['locate', 'stage', 'open', 'check']);
  const contract = require('../../contract');
  assert.deepStrictEqual(contract.buildArgv('soeditstage', { target: 't34', out: mod, dry: true }).args, ['stage', 't34', '--out', mod, '--dry']);
  assert.deepStrictEqual(contract.buildArgv('soeditopen', { model: path.join(mod, 'a.mdl'), lang: 'uk' }).args, ['open', path.join(mod, 'a.mdl'), '--lang', 'uk']);
  ok('commands: the five soedit verbs in the contract shape, merged, argv as the README');

  // ---------- locate ----------
  reply = () => ({ code: 0, stdout: JSON.stringify({ path: 'X/soedit/SOEdit.exe', source: 'local build', hash: 'abc123' }), stderr: '' });
  let r = await call('locate');
  assert.deepStrictEqual(last().args, ['locate', '--json']); assert.strictEqual(last().entry, 'soedit/soedit.js');
  assert.ok(r.found && r.path === 'X/soedit/SOEdit.exe' && r.hash === 'abc123' && r.source === 'local build');
  reply = () => ({ code: 2, stdout: '', stderr: 'SOEdit.exe was not found. Build it with soedit build.\n' });
  r = await call('locate'); assert.ok(!r.found && /not found/.test(r.message));
  reply = () => ({ code: 1, stdout: '', stderr: "Error: Cannot find module 'C/tools/soedit/soedit.js'" });
  r = await call('locate'); assert.ok(!r.found && /not part of this copy/.test(r.message));
  ok('locate: found with path and hash, not found with the plain sentence, helper missing');

  // ---------- start: the program alone; not on the computer -> install, then start ----------
  {
    const found = JSON.stringify({ path: 'X/soedit/SOEdit.exe', source: 'build', sha256: 'h' });
    let c0 = calls.length;
    reply = a => a[0] === 'locate' ? { code: 0, stdout: found, stderr: '' } : { code: 0, stdout: 'SOEdit started (pid 1)\n', stderr: '' };
    r = await call('start', { lang: 'uk' });
    assert.deepStrictEqual(calls.slice(c0).map(c => c.args), [['locate', '--json'], ['start', '--lang', 'uk']]); assert.ok(r.ok && !r.installed);
    let have = false; c0 = calls.length;
    reply = a => a[0] === 'locate' ? (have ? { code: 0, stdout: found, stderr: '' } : { code: 2, stdout: '', stderr: 'SOEdit.exe was not found.\n' })
      : a[0] === 'install' ? (have = true, { code: 0, stdout: 'SOEdit was installed in D.\n', stderr: '' }) : { code: 0, stdout: 'SOEdit started\n', stderr: '' };
    r = await call('start', {});
    assert.deepStrictEqual(calls.slice(c0).map(c => c.args[0]), ['locate', 'install', 'locate', 'start']); assert.ok(r.ok && r.installed);
    c0 = calls.length;
    reply = a => a[0] === 'locate' ? { code: 2, stdout: '', stderr: 'SOEdit.exe was not found.\n' } : { code: 3, stdout: 'There is no SOEdit download for this copy of ARSENAL yet.\n', stderr: '' };
    r = await call('start', {});
    assert.deepStrictEqual(calls.slice(c0).map(c => c.args[0]), ['locate', 'install']); assert.ok(!r.ok && r.noDownload && /no SOEdit download/.test(r.message));
    ok('start: found -> started; not found -> install, then started; no download published -> said plainly, nothing started');
  }

  // ---------- build: gone with SOEdit's source (owner 2026-11-15) ----------
  assert.ok(!ext.routes['POST /api/x/models/build'] && !C.soeditbuild); ok('build: no route and no command');

  // ---------- stage ----------
  reply = a => { fs.writeFileSync(jsonArg(a), JSON.stringify({ record: path.join(mod, 'soedit-stage.json'), files: SET.map((p, i) => i === 1 ? { rel: p, from: 'game' } : { path: p.replace(/\//g, '\\'), from: 'pak:resource.pak', size: 10 }) })); return { code: 0, stdout: 'staged 7 files (dry)', stderr: '' }; };
  r = await call('stage', { target: 't34', mod, dry: true });
  let a = last().args;
  assert.deepStrictEqual(a.slice(0, -1), ['stage', 't34', '--out', mod, '--game', game, '--dry', '--json']); assert.ok(a[a.length - 1].startsWith(ctx.tmpRoot));
  assert.ok(!fs.existsSync(a[a.length - 1]), 'temp json removed');
  assert.deepStrictEqual(Object.keys(r.groups), ['model', 'meshes', 'volumes', 'animations', 'materials', 'textures', 'other']);
  assert.deepStrictEqual(['model', 'meshes', 'volumes', 'animations', 'materials', 'textures'].map(g => r.groups[g].length), [1, 1, 1, 2, 1, 1]);
  assert.ok(r.groups.meshes[0].inMod && !r.groups.model[0].inMod && r.mdl === SET[0] && !r.staged && r.dry && r.ok);
  assert.ok(r.files.every(f => !/\\/.test(f.rel)), 'paths with forward slashes');
  ok('stage --dry: argv with --game and --json, file set grouped, "already in the mod" per file, nothing staged yet');

  await refuses('stage', { target: 't34', dry: true }, /mod folder/i);
  await refuses('stage', { target: 't34', mod: game, dry: true }, /game install/);
  await refuses('stage', { target: '-rf', mod, dry: true }, /cannot start/);
  await refuses('stage', { target: 'a*b', mod, dry: true }, /letters/);
  await refuses('stage', { target: '', mod }, /unit name/);
  ok('stage: refusals (no mod, the game as mod, "-" name, odd name, empty)');

  // every target form of tools/soedit/target.js passes unchanged (canonical); a breed's set keeps the picked model first
  {
    const tg = require('./server')._t.target;
    const pakT = 'pak:' + path.resolve(game, 'resource/entity/e1.pak') + '!-vehicle/t34/t34.def';
    assert.deepStrictEqual(['plates 2', 'lci(l)', 'breed:mp/ger/admiral', 'Breed:/set/breed/mp/ger/admiral.set', 'entity/-vehicle/t34/t34.def', pakT].map(t => tg({ target: t })),
      ['plates 2', 'lci(l)', 'breed:mp/ger/admiral', 'breed:mp/ger/admiral', 'entity/-vehicle/t34/t34.def', pakT]);
    reply = a => { fs.writeFileSync(jsonArg(a), JSON.stringify({ model: 'resource/entity/humanskin/ger_officer/ger_officer.mdl', breed: 'resource/set/breed/mp/ger/admiral.set', human: true, files: [
      { rel: 'resource/entity/humanskin/human/human.mdl', where: 'mod', pakName: 'entity.pak', shared: true },
      { rel: 'resource/entity/humanskin/ger_officer/ger_officer.mdl', where: 'game', pakName: 'e1.pak' },
      { rel: 'resource/entity/humanskin/ger_officer/skin.ply', where: 'game', pakName: 'e1.pak' }] })); return { code: 0, stdout: 'dry', stderr: '' }; };
    r = await call('stage', { target: 'breed:mp/ger/admiral', mod, dry: true });
    assert.strictEqual(last().args[1], 'breed:mp/ger/admiral');
    assert.ok(r.mdl === 'resource/entity/humanskin/ger_officer/ger_officer.mdl' && r.human && r.breed, 'the picked model first ' + JSON.stringify(r.groups.model));
    assert.deepStrictEqual(r.groups.model.map(f => [f.where, f.pak, f.shared]), [['game', 'e1.pak', false], ['mod', 'entity.pak', true]]);
    ok('stage: every target form passes (names with spaces and brackets, breed:, a .def key, pak:<pak>!<entry>); a breed\'s set keeps the skin first, files carry where, pak, shared');
  }

  // write: the stub copies the set into the mod
  reply = a => { for (const p of SET) { const f = path.join(mod, p); fs.mkdirSync(path.dirname(f), { recursive: true }); if (!fs.existsSync(f)) fs.writeFileSync(f, 'x'); }
    fs.writeFileSync(jsonArg(a), JSON.stringify({ files: SET.map(p => ({ rel: p })) })); return { code: 0, stdout: 'staged', stderr: '' }; };
  const mdlPath = path.join(mod, 'resource/entity/tank/t34/t34.mdl');
  r = await call('stage', { target: mdlPath, mod });
  assert.deepStrictEqual(last().args.slice(0, -1), ['stage', path.resolve(mdlPath), '--out', mod, '--game', game, '--json']);
  assert.ok(r.staged && r.files.every(f => f.inMod) && r.anm.length === 2);
  ok('stage: a .mdl path, no --dry, every file now in the mod');

  // ---------- open ----------
  reply = () => ({ code: 0, stdout: 'SOEdit started', stderr: '' });
  await call('open', { mod, mdl: SET[0], lang: 'ru' });
  assert.deepStrictEqual(last().args, ['open', path.resolve(mod, SET[0]), '--lang', 'ru']);
  await call('open', { mod, mdl: SET[0], anm: SET[5], lang: 'zh', dry: true });
  assert.deepStrictEqual(last().args, ['open', path.resolve(mod, SET[0]), '--anm', path.resolve(mod, SET[5]), '--lang', 'zh', '--dry']);
  await call('open', { mod, mdl: SET[0], lang: 'xx' }); assert.deepStrictEqual(last().args.slice(-2), ['--lang', 'en']);
  const nc = calls.length;
  await refuses('open', { mod, mdl: '../outside.mdl', lang: 'en' }, /inside your mod/);
  await refuses('open', { mod, mdl: 'resource/entity/none.mdl', lang: 'en' }, /not in your mod/);
  await refuses('open', { mod, mdl: SET[1], lang: 'en' }, /\.mdl file/);
  await refuses('open', { mod, mdl: SET[0], anm: '../../x.anm', lang: 'en' }, /inside your mod/);
  await refuses('open', { mod, lang: 'en' }, /Copy the model/);
  assert.strictEqual(calls.length, nc, 'a refusal starts nothing');
  reply = () => ({ code: 2, stdout: '', stderr: 'SOEdit.exe was not found.' });
  await refuses('open', { mod, mdl: SET[0], lang: 'en' }, /not found/);
  ok('open: argv with the staged mdl, --anm, --lang (en for an unknown one), --dry; refusals start nothing');

  // ---------- check ----------
  reply = a => { fs.writeFileSync(jsonArg(a), JSON.stringify({ tool: 'soedit', files: [{ rel: SET[0], state: 'changed' }, { rel: SET[5], state: 'changed' }, { rel: SET[1], state: 'unchanged' }],
    findings: [{ file: SET[5], line: null, code: 'WARN_ANM_VERSION_CHANGED', msg: 'version 0x60001 -> 0x40000' }, { file: SET[0], line: 12, code: 'MDL_KEYWORD_LOST', msg: 'bone "turret": planarsocket' }] })); return { code: 1, stdout: '2 findings', stderr: '' }; };
  r = await call('check', { mod, mdl: SET[0] });
  a = last().args; assert.deepStrictEqual(a.slice(0, -1), ['check', path.resolve(mod, SET[0]), '--game', game, '--json']);
  assert.ok(r.total === 2 && r.findings[1].code === 'MDL_KEYWORD_LOST' && r.findings[1].line === 12 && r.files.length === 3 && r.raw === '2 findings');
  reply = () => ({ code: 2, stdout: '', stderr: 'no stage record next to the model' });
  await refuses('check', { mod, mdl: SET[0] }, /stage record/);
  ok('check: argv with --game and --json, files and findings read, a failure without JSON refused with its message');

  // the shape check.js really writes (lib/report toJSON): no `files`, one FILE_* code per file, FILE_UNCHANGED under info
  reply = a => { fs.writeFileSync(jsonArg(a), JSON.stringify({ tool: 'soedit', version: 1,
    findings: [{ file: SET[0], line: 0, code: 'FILE_CHANGED', msg: '10 -> 12 bytes' }, { file: SET[0], line: 12, code: 'MDL_KEYWORD_LOST', msg: 'bone "turret": planarsocket' }, { file: 'x/new.anm', line: 0, code: 'FILE_NEW', msg: 'not in the stage record' }],
    info: [{ file: SET[1], line: 0, code: 'FILE_UNCHANGED', msg: 'same bytes as staged' }, { file: SET[5], line: 0, code: 'FILE_UNCHANGED', msg: 'same bytes as staged' }, { file: '', line: 0, code: 'LINTER_RAN', msg: 'binhdr: 0 findings' }] })); return { code: 1, stdout: '', stderr: '' }; };
  r = await call('check', { mod, mdl: SET[0] });
  const st = s => r.files.filter(f => f.state === s).length;
  assert.ok(st('changed') === 1 && st('new') === 1 && st('unchanged') === 2 && r.files.length === 4, 'file states from FILE_* codes');
  assert.ok(r.total === 1 && r.findings[0].code === 'MDL_KEYWORD_LOST', 'changed and new files are counted, not listed as losses');
  ok('check: the report shape of check.js gives changed, new and unchanged counts; only losses are listed');

  // ---------- the page in a stub browser: one stage request per pick, no stale unit, one 3D view per pick (report section 6) ----------
  {
    const mk = tag => ({ tag, kids: [], a: {}, className: '', textContent: '', disabled: false, isConnected: true,
      get firstChild() { return this.kids[0] || null; }, appendChild(c) { if (c && typeof c === 'object') this.kids.push(c); return c; },
      removeChild(c) { this.kids.splice(this.kids.indexOf(c), 1); if (c) c.isConnected = false; return c; }, setAttribute() {}, addEventListener() {}, focus() {} });
    const hh = (tag, a, kids) => { const e = mk(tag); Object.assign(e, a || {}); if (a && a.text != null) e.textContent = a.text; (kids || []).forEach(k => e.appendChild(k)); return e; };
    const pend = []; const api = (url, body) => new Promise((res, rej) => pend.push({ url, body, res, rej }));
    const store = { 'models.target': 't34' }, LS = { get: (k, d) => k in store ? store[k] : d, set: (k, v) => { store[k] = v; } };
    const Sg = { cur: 'models', mod }, EXT = {};
    new Function('EXT_SCREENS', 'h', 'tx', 'LS', 'api', 'S', 'pick', 'toast', 'LANG', require('./client'))(EXT, hh, k => k, LS, api, Sg, () => {}, () => {}, 'en');
    let views = 0, vopts = null; EXT.models.parts.viewer = (c, o) => { views++; vopts = o; return mk('div'); };
    const got = []; EXT.models.subs.model = c => { c.onPick(x => got.push(x)); };
    const page = EXT.models(mk('div'));
    const stages = () => pend.filter(p => /\/stage$/.test(p.url));
    page.refresh();                 // show('models'): stages the remembered unit t34
    page.pick('t34');               // the Units page's "Open model" for the same unit right after show()
    assert.strictEqual(stages().length, 1, 'show() then pick() of the same unit: one /stage request, not two');
    page.pick('pz4h');
    assert.strictEqual(stages().length, 2);
    const flush = () => new Promise(r => setImmediate(r));
    stages()[1].res({ ok: true, target: 'pz4h', files: [], groups: {}, order: [] }); await flush();
    stages()[0].res({ ok: true, target: 't34', files: [], groups: {}, order: [] }); await flush();   // the older reply arrives last
    assert.strictEqual(views, 1, 'one 3D view after the pick (the late t34 reply is dropped)');
    pend.find(p => /\/locate$/.test(p.url)).res({ found: true, path: 'x' }); await flush();
    assert.strictEqual(views, 1, 'SOEdit found: the Open button is updated in place, the 3D view is not built again');
    assert.strictEqual(store['models.target'], 'pz4h');
    // clicks of the Model sub-tab's view reach parts through ctx.onPick; the view keeps its own onPick unset (pose following, readout)
    assert.ok(vopts && typeof vopts.onHit === 'function' && !vopts.onPick, 'the Model view passes its clicks on through onHit');
    const hit = { volume: 'body/hull', side: 0, point: [1, 2, 3], origin: [9, 0, 0], dir: [-1, 0, 0], bone: null };
    vopts.onHit(hit); assert.deepStrictEqual(got, [hit], 'a part joined through ctx.onPick gets the hit once');
    ok('page: show + pick of the same unit sends one /stage, a stale reply does not replace the newer unit, locate does not rebuild the 3D view; view clicks reach ctx.onPick');
  }

  // the built-in editor: doc routes merged, the SOEdit program behind an optional fold, its absence not shown as an error
  {
    for (const v of ['open', 'op', 'undo', 'redo', 'state', 'scene', 'save', 'close']) assert.ok(ext.routes['POST /api/x/models/doc/' + v], 'doc route ' + v);
    assert.ok(/EXT_SCREENS\.models\.doc=D/.test(ext.script) && ext.script.indexOf('EXT_SCREENS.models.doc=D') < ext.script.indexOf('EXT_SCREENS.models.subs.anim='), 'doc part loads before the others');
    const mk = tag => ({ tag, kids: [], className: '', textContent: '', isConnected: true, get firstChild() { return this.kids[0] || null; }, appendChild(c) { if (c && typeof c === 'object') this.kids.push(c); return c; },
      removeChild(c) { this.kids.splice(this.kids.indexOf(c), 1); return c; }, setAttribute() {}, addEventListener() {}, focus() {} });
    const hh = (tag, a, kids) => { const e = mk(tag); Object.assign(e, a || {}); if (a && a.text != null) e.textContent = a.text; (kids || []).forEach(k => e.appendChild(k)); return e; };
    const pend = [], EXT = {};
    new Function('EXT_SCREENS', 'h', 'tx', 'LS', 'api', 'S', 'pick', 'toast', 'LANG', require('./client'))(EXT, hh, k => k, { get: (k, d) => d, set() {} }, (url) => new Promise((res, rej) => pend.push({ url, res, rej })), { cur: 'models', mod: '' }, () => {}, () => {}, 'en');
    const rootEl = mk('div'), page = EXT.models(rootEl); page.refresh();
    pend.find(p => /\/locate$/.test(p.url)).rej(new Error('SOEdit.exe was not found.')); await new Promise(r => setImmediate(r));
    const all = []; (function w(x) { if (!x) return; all.push(x); (x.kids || []).forEach(w); })(rootEl);
    const fold = all.find(x => x.tag === 'details' && x.kids.some(k => k.textContent === 'models.ext.title'));
    assert.ok(fold && !fold.open, 'SOEdit card is a closed fold');
    assert.ok(!all.some(x => /\berr\b/.test(x.className || '')), 'no error shown for a missing SOEdit.exe');
    ok('built-in editor: doc routes merged, doc part first, SOEdit behind a closed optional fold, no error when it is missing');
  }

  // a child test: limit at least 10 min, killed by it -> WAIT and one rerun with twice the limit (lib/test/wait); its WAIT lines shown
  const child = args => { const r = require('../../../lib/test/wait').spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 600000 }, 'models test');
    String(r.stderr || '').split(/\r?\n/).filter(s => /^WAIT /.test(s)).forEach(s => process.stderr.write(s + '\n')); return r; };
  // sub-part tests (sub/<name>.test.js): each runs alone and ends PASS; run here so the GUI suite covers them
  for (const f of fs.readdirSync(path.join(__dirname, 'sub')).filter(x => x.endsWith('.test.js')).sort()) {
    const r = child([path.join(__dirname, 'sub', f), path.join(scratch, 'sub-' + f.slice(0, -8))]);
    assert.ok(r.status === 0 && /^PASS /m.test(r.stdout), f + '\n' + String(r.stdout + r.stderr).split('\n').slice(-10).join('\n'));
    ok('part test ' + f);
  }
  // the end-to-end run through the editor (e2e.test.js: new model, bone, volume, mesh, material, animation, save, reopen, loss checks)
  {
    const r = child([path.join(__dirname, 'e2e.test.js'), path.join(scratch, 'e2e')]);
    assert.ok(r.status === 0 && /^PASS models e2e /m.test(r.stdout), 'e2e.test.js\n' + String(r.stdout + r.stderr).split('\n').slice(-10).join('\n'));
    ok('end-to-end test e2e.test.js');
  }
  // the page on blocks (blocks.test.js: the whole page in the fake DOM, a model picked, every sub-tab drawn through the block rules)
  {
    const r = child([path.join(__dirname, 'blocks.test.js'), path.join(scratch, 'blocks')]);
    assert.ok(r.status === 0 && /^PASS models blocks /m.test(r.stdout), 'blocks.test.js\n' + String(r.stdout + r.stderr).split('\n').slice(-12).join('\n'));
    ok('blocks test blocks.test.js');
  }

  console.log('PASS models ext (' + n + ')');
})().catch(e => { console.error(e && e.stack || e); console.log('FAIL models ext'); process.exit(1); });
