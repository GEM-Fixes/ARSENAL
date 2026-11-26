// GUI-EXT maps test. Arg: scratch dir. No game, no network: map-clone fixture game in the scratch dir.
// Author: Imperator_Aug (ARSENAL, ia-fea2be17)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'maps-')));
require('../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const X = require('./index');
const WT = require('../../../lib/test/wait');
require('../../../lib/modtree')._reset({ store: null });   // the shared walk keeps nothing outside this run (no write to the real store)
const T = path.join(__dirname, '..', '..', '..');
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL ' + m); } };
const r0 = cp.spawnSync(process.execPath, [path.join(T, 'map-clone', 'test', 'mkfixture.js')], { env: Object.assign({}, process.env, { TEST_WORK: work }), encoding: 'utf8' });
const game = path.join(work, 'fixture', 'game');
ok(fs.existsSync(game), 'fixture built ' + (r0.stderr || ''));
const mod = path.join(game, 'mods', 'my_mod'); fs.mkdirSync(mod, { recursive: true });
const ctx = {
  game: () => game, allowLaunch: false, gamedir: game, tools: T, tmpRoot: work,
  runTool: async (tool, entry, args) => { const r = cp.spawnSync(process.execPath, [path.join(T, entry)].concat(args), { encoding: 'utf8' }); return { code: r.status, stdout: r.stdout, stderr: r.stderr, timedOut: false }; },
};
const U = q => ({ searchParams: new URLSearchParams(q) });
const R = X.routes, t = X._t;
const fails = async (p, m) => { let e = null; try { await p(); } catch (x) { e = x; } ok(e && e.status === 400, m); };
// the list scan (a real mission-clone child): polled until it is not running, by time. Backup, never a hang: WAIT after 5 min, the last answer
const listDone = async l => (l.state !== 'running' ? l : (await WT.until(async () => { const x = await R['GET /api/x/maps/list'](U(''), null, ctx); return x.state !== 'running' ? x : null; }, { who: 'maps test', what: 'the map list scan', step: 30, ms: WT.CHILD_MS })) || R['GET /api/x/maps/list'](U(''), null, ctx));
// structure rules of tools/gui/test/blockcheck.js (checkScreen), for the state the page reaches after server replies
const BC = require(path.join(__dirname, '..', '..', 'test', 'blockcheck'));
const isB = e => !!(e && e.dataset && e.dataset.blk != null);
const checkScreen = sec => (sec.all().filter(isB).length < 10 ? ['fewer than 10 blocks'] : []).concat(BC.checkScreen(sec, 'maps'));

(async () => {
  ok(X.id === 'maps' && X.nav === 'maps.nav' && X.adv === false, 'shape');
  ok(!/`|\$\{/.test(X.script) && /EXT_SCREENS\.maps/.test(X.script), 'script rules');
  // units + parse helpers
  ok(t.UNITS_PER_M === 20, 'scale 20');
  ok(t.parseList('map/multi/a1: combat assault\nmap/multi/m9: combat [mod: mm_t]\nnoise').length === 2, 'parseList');
  const pf = t.parse('map/multi/x: MAPCLONE_NO_MAP no such map. Did you mean: map/multi/a1, map/multi/a2?\nmap/multi/x: WARN_MC_X note');
  ok(pf[0].code === 'MAPCLONE_NO_MAP' && pf[0].sev === 'error' && pf[1].sev === 'warn', 'parse sev');
  ok(t.suggest(pf).join() === 'map/multi/a1,map/multi/a2', 'suggest');
  // addBots
  const card = '{settings\r\n\t{x 1}\r\n}\r\n';
  const a1 = t.addBots(card);
  ok(a1.state === 'added' && /\{enableBots\}/.test(a1.text) && a1.text.includes('\r\n') && !/[^\r]\n/.test(a1.text), 'addBots CRLF');
  ok(t.addBots(a1.text).state === 'present', 'addBots idempotent');
  ok(t.addBots('{a 1}\r\n').state === 'added', 'addBots no settings');
  // shared with the Missions and Game Modes pages
  ok(['addMode', 'lintMod', 'botsFor', 'needGame', 'mapKeyOk'].every(k => typeof t[k] === 'function') && t.MIS_CODE.test('WARN_MI_SPAWN_COUNT') && t.MIS_CODE.test('MC_NEEDS_MANUAL') && !t.MIS_CODE.test('MAP_CAPTURE_CLIPS'), 'exports addMode, lintMod, botsFor; mission code filter');
  await fails(() => t.addMode(ctx, { game, mod, map: 'map/multi/a1', to: 'battle_zones', flags: '0', modes: ['combat'] }), 'addMode: flags out of range refused');
  { const r = await t.addMode(ctx, { game, mod, map: 'map/multi/a1', to: 'battle_zones', modes: [] }); ok(!r.ok && r.say[0].k === 'maps.s.nomodes', 'addMode: a map without modes says so'); }
  // safeMod
  ok(t.safeMod(mod, ctx) === path.resolve(mod) || t.safeMod(mod, ctx), 'safeMod accepts mods/<mod>');
  await fails(async () => t.safeMod(game, ctx), 'refuse game root');
  await fails(async () => t.safeMod(path.join(game, 'resource'), ctx), 'refuse game resource');
  await fails(async () => t.safeMod(path.join(work, 'nope'), ctx), 'refuse missing');
  await fails(async () => t.safeMod('', ctx), 'refuse empty');
  // picture + list need real data; list route works with a job
  let l = await listDone(await R['GET /api/x/maps/list'](U(''), null, ctx));
  ok(l.state === 'done' && l.maps.some(m => m.key === 'map/multi/a1' && m.players === 2 && m.modes.includes('combat')), 'list a1 players+modes');
  ok(l.maps.every(m => m.name), 'list names');
  // the place card's entity index: .def names of game + mod by folder
  { fs.mkdirSync(path.join(game, 'resource', 'entity', 'flora'), { recursive: true }); fs.writeFileSync(path.join(game, 'resource', 'entity', 'flora', 'tree_x.def'), '{}\r\n');
    fs.mkdirSync(path.join(mod, 'resource', 'entity', 'construction'), { recursive: true }); fs.writeFileSync(path.join(mod, 'resource', 'entity', 'construction', 'hut_m.def'), '{}\r\n');
    require('../../../lib/gameview').drop();   // the shared game view goes by the game stamp (paks, exe): a loose file put deep into the game just now is not in it
    const en = await R['GET /api/x/maps/entities'](new URL('http://x/?mod=' + encodeURIComponent(mod)), null, ctx);
    ok(en.entities.some(e => e.name === 'tree_x' && e.group === 'flora') && en.entities.some(e => e.name === 'hut_m' && e.group === 'construction'), 'entities: game and mod .def names with their folder ' + JSON.stringify(en).slice(0, 200));
    fs.rmSync(path.join(mod, 'resource'), { recursive: true, force: true }); }
  // clone preview then write
  await fails(() => R['POST /api/x/maps/clone'](null, { mod, map: 'map/multi/a1', name: 'bad name', write: false }, ctx), 'bad name refused');
  const body = { mod, map: 'map/multi/a1', name: 'my_arena', title: 'My Arena', mode: 'keep', bots: true };
  const pre = await R['POST /api/x/maps/clone'](null, Object.assign({}, body, { write: false }), ctx);
  ok(pre.ok && !fs.existsSync(path.join(mod, 'resource', 'map', 'multi', 'my_arena')), 'preview writes nothing ' + JSON.stringify(pre.findings));
  const wr = await R['POST /api/x/maps/clone'](null, Object.assign({}, body, { write: true }), ctx);
  ok(wr.ok && wr.newKey === 'map/multi/my_arena', 'clone ok ' + JSON.stringify(wr.findings));
  ok(fs.existsSync(path.join(mod, 'resource', 'map', 'multi', 'my_arena', 'map.net')), 'map copied');
  const lng = path.join(mod, 'localization', 'mission', 'multi', 'my_arena.lng');
  ok(fs.existsSync(lng) && /My Arena/.test(fs.readFileSync(lng, 'utf8')) && /name/.test(fs.readFileSync(lng, 'utf8')), 'lobby title lng written');
  ok(wr.needsTest === true && wr.check && wr.check.ran, 'milint ran + needs test');
  // did-you-mean on a wrong map
  const dm = await R['POST /api/x/maps/clone'](null, { mod, map: 'map/multi/aa1', name: 'zzz', write: false }, ctx);
  ok(!dm.ok && dm.suggest.includes('map/multi/a1'), 'did-you-mean ' + JSON.stringify(dm.suggest));
  // place: metres -> units
  const pp = await R['POST /api/x/maps/place'](null, { mod, map: 'map/multi/my_arena', entity: 'x', x: '10', y: '-2.5', write: false }, ctx);
  ok(pp && pp.units && pp.units[0] === 200 && pp.units[1] === -50, 'place converts metres to units (200,-50) ' + JSON.stringify(pp));
  ok(pp.findings.some(x => x.code === 'PLACE_ENTITY_UNKNOWN') && !pp.ok, 'place unknown entity reported');
  await fails(() => R['POST /api/x/maps/place'](null, { mod, map: 'map/multi/my_arena', entity: 'x', x: 'abc', y: '1' }, ctx), 'place bad number');
  const ck = await R['POST /api/x/maps/check'](null, { mod }, ctx);
  ok(ck && ck.check && ck.check.ran, 'check route ' + JSON.stringify(ck));

  // ---- JOBS: the list scan is a background job of the server's registry; a stop from the job list ends it with no list and no cache.
  // The fake runTool stands in for gui.js: the child belongs to the job in the options, cancelling that job kills it.
  {
    const JL = require(path.join(__dirname, '..', '..', 'joblist'));
    const reg = JL.create({ keepMs: 60000 }), kids = [], jroot = path.join(work, 'jobs-tmp');
    const pend = (tool, entry, args, opt) => new Promise(resolve => {
      const kid = { tool, args, opt, killed: false, finish: r => resolve(Object.assign({ stdout: '', stderr: '', timedOut: false, cancelled: false }, r)) };
      kids.push(kid);
      if (opt && opt.job) opt.job.onCancel(() => { kid.killed = true; resolve({ code: null, stdout: 'map/multi/a1: combat', stderr: '', timedOut: false, cancelled: true }); });
    });
    const reqJob = reg.add({ kind: 'req', canCancel: false });
    const jctx = Object.assign({}, ctx, { tmpRoot: jroot, jobs: reg, job: reqJob, runTool: pend });
    // the scan's end: its bg job no longer running (it ends last, after the list and the cache), by time with the 60 s backstop
    const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); await WT.until(() => !bgs().some(j => j.state === 'running'), { who: 'maps test', what: 'the list job to end' }); };
    // the list kept in the shared store of this scratch server (section maps.list), read from its files
    const caches = () => { const e = path.join(jroot, 'cache', 'store', 'e'); if (!fs.existsSync(e)) return []; return fs.readdirSync(e).filter(k => { try { return JSON.parse(fs.readFileSync(path.join(e, k, 'meta.json'), 'utf8')).section === 'maps.list'; } catch (x) { return false; } }); };
    const a1 = await R['GET /api/x/maps/list'](U('refresh=1'), null, jctx);
    reqJob.end('done');
    const bgs = () => reg.list().filter(j => j.kind === 'bg'), bg = bgs()[0];
    ok(a1.state === 'running' && bgs().length === 1 && bg.what === 'job.w.mapslist' && bg.page === 'maps' && bg.state === 'running' && bg.canCancel === true && bg.writes === false, 'jobs: the list scan is a bg job job.w.mapslist, page maps: ' + JSON.stringify(bg));
    ok(kids.length === 1 && kids[0].tool === 'mission-clone' && kids[0].opt.job === reg.get(bg.id) && kids[0].opt.job !== reqJob, 'jobs: the scan tool is handed to the bg job, not to the request');
    const a2 = await R['GET /api/x/maps/list'](U(''), null, jctx);
    ok(a2.state === 'running' && bgs().length === 1 && kids.length === 1 && !kids[0].killed, 'jobs: a repeat GET is a poll of the same scan (no second job, no second tool)');
    ok(reg.cancel(bg.id) === true && kids[0].killed, 'jobs: Cancel in the job list kills the scan tool');
    await settle();
    const a3 = await R['GET /api/x/maps/list'](U(''), null, jctx);
    ok(a3.state === 'error' && a3.stopped === true && a3.error === 'maps.e.stopped' && !a3.maps, 'jobs: a stopped scan answers stopped, no list: ' + JSON.stringify(a3));
    ok(reg.get(bg.id).state === 'cancelled' && kids.length === 1 && caches().length === 0, 'jobs: the job ended as cancelled, no new scan by itself, no cache written ' + caches().join());
    ok(['en', 'ru', 'uk', 'zh'].every(g => X.lang[g]['maps.e.stopped'] && X.lang[g]['maps.list.stopped']), 'stopped list wording in four languages');
    // Reload (refresh=1) reads again; a full scan ends its job as done and is cached
    const a4 = await R['GET /api/x/maps/list'](U('refresh=1'), null, jctx);
    ok(a4.state === 'running' && kids.length === 2 && bgs().filter(j => j.state === 'running').length === 1, 'jobs: refresh after a stop starts a new scan');
    kids[1].finish({ code: 0, stdout: 'map/multi/a1: combat assault\n' });
    await settle();
    const a5 = await R['GET /api/x/maps/list'](U(''), null, jctx);
    ok(a5.state === 'done' && a5.maps.some(m => m.key === 'map/multi/a1') && caches().length === 1 && !bgs().some(j => j.state === 'running') && bgs().some(j => j.state === 'done'), 'jobs: a finished scan is done, cached, its job ended: ' + JSON.stringify(a5).slice(0, 160));
    // a scan that throws ends its job as failed
    await R['GET /api/x/maps/list'](U('refresh=1'), null, Object.assign({}, jctx, { runTool: () => Promise.reject(new Error('spawn failed')) }));
    await settle();
    const a6 = await R['GET /api/x/maps/list'](U(''), null, Object.assign({}, jctx, { tmpRoot: path.join(work, 'jobs-tmp2') }));
    ok(a6.state === 'error' && !a6.stopped && bgs().some(j => j.state === 'failed') && !bgs().some(j => j.state === 'running'), 'jobs: a scan that crashes ends its job as failed: ' + JSON.stringify(a6));
    // the GoH walk (in process): the stop flag ends it between its steps
    let asked = 0;
    const g0 = await t.listGohJob(game, () => true), g1 = await t.listGohJob(game, () => ++asked > 1, { v: { files: new Map([['map/multi/x/map.net', {}]]) }, readRec: () => '' });
    ok(g0 === null && g1 === null && asked === 2, 'jobs: the GoH walk stops at its next step and gives no list');

    // ---- clone: writes is set on a write only; a stop returns early and says what is left; only what the request made is removed
    const mod5 = path.join(game, 'mods', 'stop_mod'); fs.mkdirSync(mod5, { recursive: true });
    const cb = { mod: mod5, map: 'map/multi/a1', name: 'st_arena', title: 'Stopped', mode: 'keep', bots: false };
    const dest = path.join(mod5, 'resource', 'map', 'multi', 'st_arena'), ttl = path.join(mod5, 'localization', 'mission', 'multi', 'st_arena.lng');
    const stat = async c => R['GET /api/x/maps/clone/status'](U('mod=' + encodeURIComponent(mod5)), null, c);
    ok((await stat(ctx)).state === 'none', 'clone/status: nothing stopped yet');
    // stopAfter(tool): the real tool runs, then the request is seen as stopped (the dispatcher's job flag)
    const sctx = tool => { const job = { cancelled: false, writes: false }, seen = []; return { job, seen, ctx: Object.assign({}, ctx, { job, runTool: async (tl, entry, args, opt) => { seen.push(tl); const r = await ctx.runTool(tl, entry, args, opt); if (tl === tool) job.cancelled = true; return r; } }) }; };
    const s0 = sctx('map-clone');
    const c0 = await R['POST /api/x/maps/clone'](null, Object.assign({}, cb, { write: false }), s0.ctx);
    ok(c0.cancelled === true && c0.ok === false && c0.stop.state === 'nothing' && s0.job.writes === false && s0.seen[s0.seen.length - 1] === 'map-clone' && !fs.existsSync(dest), 'clone preview stopped: early return, nothing on disk, not marked as writing: ' + JSON.stringify(c0.stop));
    const s1 = sctx('map-clone');
    const c1 = await R['POST /api/x/maps/clone'](null, Object.assign({}, cb, { write: true }), s1.ctx);
    ok(c1.cancelled === true && c1.ok === false && !c1.needsTest && s1.job.writes === true && s1.seen[s1.seen.length - 1] === 'map-clone' && !s1.seen.includes('lng-add') && !s1.seen.includes('milint'), 'clone write stopped after the copy: early return, no later step run: ' + s1.seen.join());
    ok(c1.stop.state === 'removed' && !fs.existsSync(dest) && !fs.existsSync(ttl) && (await stat(ctx)).state === 'removed' && (await stat(ctx)).newKey === 'map/multi/st_arena', 'clone write stopped: the new map folder and title are removed, status says removed: ' + JSON.stringify(c1.stop));
    // a title file that was there before the request is not this request's: it stays
    fs.mkdirSync(path.dirname(ttl), { recursive: true }); fs.writeFileSync(ttl, '{mission\r\n}\r\n');
    const s2 = sctx('lng-add');
    const c2 = await R['POST /api/x/maps/clone'](null, Object.assign({}, cb, { write: true }), s2.ctx);
    ok(c2.cancelled === true && c2.stop.state === 'removed' && !fs.existsSync(dest) && fs.existsSync(ttl), 'clone write stopped at the title: the folder it made is removed, a title file that was there before stays: ' + JSON.stringify(c2.stop));
    fs.rmSync(ttl, { force: true });
    // stopped in the final check: the copy is whole and stays
    const s3 = sctx('milint');
    const c3 = await R['POST /api/x/maps/clone'](null, Object.assign({}, cb, { write: true }), s3.ctx);
    ok(c3.cancelled === true && c3.stop.state === 'complete' && fs.existsSync(path.join(dest, 'map.net')) && fs.existsSync(ttl) && (await stat(ctx)).state === 'complete', 'clone stopped in the final check: the copy is whole and stays, status says complete: ' + JSON.stringify([c3.stop, s3.seen]));
    // a clone that runs through clears the stop record
    const c4 = await R['POST /api/x/maps/clone'](null, Object.assign({}, cb, { name: 'st_two', write: true }), ctx);
    ok(c4.ok && !c4.cancelled && (await stat(ctx)).state === 'none', 'clone/status: a later clone that ran through clears the record');
    // place, check, picture: early return on a stop
    const cancelTool = async () => ({ code: null, stdout: 'MILINT_X error', stderr: '', timedOut: false, cancelled: true });
    const pj = { cancelled: false, writes: false };
    const p1 = await R['POST /api/x/maps/place'](null, { mod: mod5, map: 'map/multi/st_two', entity: 'x', x: '1', y: '1', write: true }, Object.assign({}, ctx, { job: pj, runTool: cancelTool }));
    ok(p1.cancelled === true && p1.ok === false && !p1.check && !p1.needsTest && p1.say.length === 0 && pj.writes === true, 'place stopped: early return, no check, marked as writing: ' + JSON.stringify(p1));
    const pj2 = { cancelled: false, writes: false };
    await R['POST /api/x/maps/place'](null, { mod: mod5, map: 'map/multi/st_two', entity: 'x', x: '1', y: '1', write: false }, Object.assign({}, ctx, { job: pj2 }));
    ok(pj2.writes === false, 'place preview: not marked as writing');
    const k1 = await R['POST /api/x/maps/check'](null, { mod: mod5 }, Object.assign({}, ctx, { runTool: cancelTool }));
    ok(k1.check && k1.check.cancelled === true && k1.check.ran === false && k1.check.findings.length === 0, 'check stopped: early return, the half output is not read as findings: ' + JSON.stringify(k1));
    const proot = path.join(work, 'jobs-pic'), pics = () => (fs.existsSync(proot) ? fs.readdirSync(proot, { recursive: true }).map(String).filter(f => /\.svg$/.test(f)) : []);
    const halfPic = async (tl, entry, args) => { fs.writeFileSync(args[args.indexOf('--svg') + 1], '<svg half'); return { code: null, stdout: '', stderr: '', timedOut: false, cancelled: true }; };
    const v1 = await R['GET /api/x/maps/picture'](U('map=map/multi/a1'), null, Object.assign({}, ctx, { tmpRoot: proot, runTool: halfPic }));
    ok(v1.svg === null && v1.cancelled === true && pics().length === 0, 'picture stopped: no picture, the half file is not left in the cache: ' + JSON.stringify(v1) + ' ' + pics().join());
  }

  // ---- GT-07: maps from another mod. pk_t: a whole map only in the mod's pak (copyable with --mods); half_t: only a mode file,
  // no map.net (like gohfull_pak's frontlines maps), so it cannot be copied and the list says so.
  const zw = require(path.join(T, 'lib', 'zipwrite'));
  const mfiles = m => [['map.net', fs.readFileSync(path.join(game, 'resource', 'map', 'multi', 'a1', 'map.net'))], ['map.info', Buffer.from('{game\r\n  {maxPlayers 4}\r\n}\r\n')], ['combat.mi', Buffer.from('{mission\r\n}\r\n')]].map(([k, b]) => ['map/multi/' + m + '/' + k, b]);
  for (const [id, ents] of [['pk_t', mfiles('p7')], ['half_t', [['map/multi/f3/combat.mi', Buffer.from('{mission\r\n}\r\n')]]]]) {
    fs.mkdirSync(path.join(game, 'mods', id, 'resource'), { recursive: true });
    fs.writeFileSync(path.join(game, 'mods', id, 'mod.info'), '{Mod\r\n\t{Name "' + id + '"}\r\n}\r\n');
    zw.writeZip(path.join(game, 'mods', id, 'resource', 'map.pak'), ents);
  }
  l = await listDone(await R['GET /api/x/maps/list'](U('refresh=1'), null, ctx));
  const p7 = (l.maps || []).find(m => m.key === 'map/multi/p7'), f3 = (l.maps || []).find(m => m.key === 'map/multi/f3');
  ok(p7 && (p7.mods || []).join() === 'pk_t' && p7.copy === true, 'GT-07 list: mod map p7 carries its mod ' + JSON.stringify(p7));
  ok(f3 && f3.copy === false, 'GT-07 list: f3 (mode file only) marked as not copyable ' + JSON.stringify(f3));
  ok((l.maps || []).some(m => m.key === 'map/multi/a1' && m.copy === true), 'GT-07 list: vanilla a1 copyable');
  const pm = await R['POST /api/x/maps/clone'](null, { mod, map: 'map/multi/p7', name: 'my_p7', title: 'P7', mode: 'keep', write: false }, ctx);
  ok(pm.ok && (pm.mods || []).join() === 'pk_t', 'GT-07 preview of a map from another mod works ' + JSON.stringify(pm.findings));
  const pw = await R['POST /api/x/maps/clone'](null, { mod, map: 'map/multi/p7', name: 'my_p7', title: 'P7', mode: 'keep', write: true }, ctx);
  ok(pw.ok && fs.existsSync(path.join(mod, 'resource', 'map', 'multi', 'my_p7', 'map.net')), 'GT-07 copy of a map from another mod written ' + JSON.stringify(pw.findings));
  const fm = await R['POST /api/x/maps/clone'](null, { mod, map: 'map/multi/f3', name: 'my_f3', write: false }, ctx);
  ok(!fm.ok && fm.say && fm.say[0] && fm.say[0].k === 'maps.s.nocopy' && !fs.existsSync(path.join(mod, 'resource', 'map', 'multi', 'my_f3')), 'GT-07 map without map.net refused in plain words');
  ok(t.mapInfo && t.mapInfo({ tmpRoot: path.join(work, 'nocache') }, game, 'map/multi/zz', 'pk_t').mods.join() === 'pk_t', 'mapInfo: hint used without a list');
  await fails(async () => t.mapInfo && t.mapInfo({ tmpRoot: path.join(work, 'nocache') }, game, 'map/multi/zz', '../x'), 'mapInfo: bad mod hint refused');

  // ---- GT-34: server refusals are keys the page translates; every key in every language
  const L = X.lang;
  let ek = null; try { await R['POST /api/x/maps/clone'](null, { mod, map: 'map/multi/a1', name: 'bad name' }, ctx); } catch (e) { ek = e.message; }
  ok(ek === 'maps.e.name' && /[а-яі]/.test(L.uk[ek]), 'GT-34 bad name is a key with a uk text: ' + ek);
  const src = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8') + X.script;
  const used = [...new Set([...src.matchAll(/'(maps\.(?:e|s|c)\.[A-Za-z_.]+)'/g)].map(m => m[1]))];
  ok(used.every(k => ['en', 'ru', 'uk', 'zh'].every(g => L[g][k])), 'every maps.e/s/c key in 4 languages: ' + used.filter(k => !L.uk[k] || !L.zh[k] || !L.ru[k]).join());
  ok(['ru', 'uk', 'zh'].every(g => Object.keys(L[g]).length === Object.keys(L.en).length && Object.keys(L.en).every(k => g in L && k in L[g])), 'same keys in en ru uk zh');
  ok(!/bad\('[A-Z]/.test(fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8').replace(/needGame[^\n]*/, '')), 'no English refusal sentence left (except the game folder one, which the page translates)');

  // ---- page script in a fake DOM: GT-19, GT-32, GT-39, uk plural and date, translated errors
  const vm = require('vm');
  const { make } = require(path.join(__dirname, '..', '..', 'test', 'fakedom'));
  // the page's own h() and block helpers (blk, fld, card) from page.js via blockcheck.pageFns, so the screen builds its real blocks
  // o.poll: the page's real pause rule (pollLater, pollStop, pollWake of page.js) runs in the box, S.cur is this page and a wait of 1 s or more takes 5 ms
  const POLLSRC = 'var POLLS=[];\n' + ['pageHid', 'pollOn', 'pollLater', 'pollStop', 'pollWake'].map(BC.fnSrc).join('\n');
  const page = (lang, apiFn, o) => {
    const doc = make(), calls = [], setMods = [];
    const box = {
      document: doc, EXT_SCREENS: {}, S: { mod: mod }, window: { confirm: () => box.confirmAnswer }, confirmAnswer: false, calls, setMods,
      tx: (k, p) => { const s = L[lang][k] != null ? L[lang][k] : L.en[k]; return s == null ? k : s.replace(/\{(\w+)\}/g, (a, b) => (p && p[b] != null ? String(p[b]) : a)); },
      toast: () => {}, show: () => {}, pick: () => {}, setTimeout, clearTimeout, setMod: p => { setMods.push(p); box.S.mod = p; },
      api: (u, b, o) => { calls.push([u, b, o]); return apiFn(u, b, o); },
      LS: { m: {}, get(k, d) { return k in this.m ? this.m[k] : d; }, set(k, v) { this.m[k] = v; } },
    };
    const F = BC.pageFns(doc); for (const n of BC.NAMES) box[n] = F[n];
    if (o && o.poll) { box.S.cur = 'maps'; box.setTimeout = (f, ms) => setTimeout(f, ms >= 1000 ? 5 : ms); }
    vm.runInNewContext((o && o.poll ? POLLSRC + '\n' : '') + BC.kitSrc() + '\n' + X.script, box);   // the page's real searchKit (page.js)
    const rootEl = doc.createElement('section'); rootEl.setAttribute('data-id', 'maps');
    const scr = box.EXT_SCREENS.maps(rootEl);
    return { box, rootEl, scr, doc };
  };
  const tick = () => new Promise(r => setTimeout(r, 0));
  const all = (e, f, o = []) => { for (const c of e.children) { if (f(c)) o.push(c); all(c, f, o); } return o; };
  const tag = (e, tg) => all(e, c => c.tagName === tg);
  const LIST = { state: 'done', cached: true, at: Date.UTC(2026, 10, 10, 15, 30), maps: [
    { key: 'map/multi/2v2_castle', folder: '2v2_castle', name: 'Castle', players: 4, modes: ['battle_zones', 'combat'], mod: '', mods: [], copy: true },
    { key: 'map/multi/p7', folder: 'p7', name: 'Port', players: 2, modes: ['combat'], mod: 'pk_t', mods: ['pk_t'], copy: true },
    { key: 'map/multi/f3', folder: 'f3', name: 'Front', players: 2, modes: ['frontlines'], mod: 'half_t', mods: ['half_t'], copy: false }] };
  let cloneReply = () => Promise.resolve({ ok: true, write: false, say: [{ k: 'maps.s.willcopy', p: { files: 3, key: 'map/multi/my_castle' } }], findings: [] });
  const P = page('uk', (u, b) => u.startsWith('/api/x/maps/list') ? Promise.resolve(LIST) : u.startsWith('/api/x/maps/picture') ? Promise.resolve({ svg: null }) : u === '/api/x/maps/clone' ? cloneReply(b) : Promise.resolve({}));
  P.scr.focus(); await tick(); await tick();
  const inputs = tag(P.rootEl, 'INPUT'), filt = inputs[0], tbody = tag(P.rootEl, 'TBODY')[0];
  const opts = tag(tag(P.rootEl, 'SELECT')[0], 'OPTION').map(o => o.textContent);
  ok(opts[1] === '2 гравці' && opts[2] === '4 гравці' && opts[3] === '6 гравців', 'GT-34 uk plural of players: ' + opts.join(' / '));
  ok(P.rootEl.textContent.includes(new Date(LIST.at).toLocaleString('uk-UA')), 'GT-34 uk date form');
  ok(tbody.children[0].children[2].textContent === 'battle_zones combat', 'GT-39 mode badges apart: "' + tbody.children[0].children[2].textContent + '"');
  ok(/не можна скопіювати/.test(tbody.children[2].textContent), 'GT-07 row of a map that cannot be copied says so');
  // GT-32: type a filter, then the browser fires change on blur (the mousedown on a row); the row must survive so the click lands
  filt.value = 'castle'; filt.fire('input'); await tick();   // the table is drawn in the next frame
  const row = tbody.children[0];
  filt.fire('change');
  ok(tbody.children[0] === row, 'GT-32 change on blur does not rebuild the rows');
  row.click(); await tick();
  ok(P.rootEl.textContent.includes('Castle') && row.getAttribute('aria-selected') === 'true' && tbody.children[0] === row, 'GT-32 first click after filtering picks the map');
  ok(P.box.S.mapKey === 'map/multi/2v2_castle', 'the picked map is shared with the Missions page (S.mapKey)');
  // GT-19: preview, then Write and Cancel at the confirm: the preview stays, Write stays possible
  const btn = t0 => tag(P.rootEl, 'BUTTON').filter(b => b.textContent === L.uk[t0]).pop();   // the clone card's (the place card comes first)
  btn('maps.preview').click(); await tick(); await tick();
  const outHas = s => P.rootEl.textContent.includes(s);
  ok(outHas(L.uk['maps.planOk']) && !btn('maps.write').disabled, 'preview shown, Write on');
  P.box.confirmAnswer = false; btn('maps.write').click(); await tick();
  ok(outHas(L.uk['maps.planOk']) && !btn('maps.write').disabled && P.box.calls.filter(c => c[0] === '/api/x/maps/clone').length === 1, 'GT-19 Cancel keeps the preview');
  // a server refusal arrives as a key and is shown in uk
  cloneReply = () => Promise.reject(new Error('maps.e.name'));
  btn('maps.preview').click(); await tick(); await tick();
  ok(outHas(L.uk['maps.e.name']) && !outHas('maps.e.name'), 'GT-34 server refusal shown in uk');
  // a map from a mod sends its mod; a map that cannot be copied blocks Preview
  cloneReply = () => Promise.resolve({ ok: true, say: [], findings: [] });
  filt.value = ''; filt.fire('input'); await tick();
  tbody.children[1].click(); await tick();
  btn('maps.preview').click(); await tick();
  const last = P.box.calls.filter(c => c[0] === '/api/x/maps/clone').pop();
  ok(last && last[1].map === 'map/multi/p7' && (last[1].from || []).join() === 'pk_t', 'GT-07 page sends the mod of the map');
  ok(P.box.calls.some(c => /picture\?map=map%2Fmulti%2Fp7&from=pk_t/.test(c[0])), 'GT-07 picture asks with the mod');
  tbody.children[2].click(); await tick();
  ok(btn('maps.preview').disabled && outHas(L.uk['maps.s.nocopy']), 'GT-07 map without its map file: Preview off, reason shown');
  // a new map after a preview needs a new preview; the mod field is the shared mod (GT-15)
  ok(btn('maps.write').disabled, 'Write off after picking another map');
  // searchKit (owner 2026-11-19): the filter, the place map and the entity boxes have Browse, History and an index; no mod box of its
  // own (the header's mod is the page's mod)
  { const kits = all(P.rootEl, c => c.getAttribute && c.getAttribute('data-sk')).map(c => c.getAttribute('data-sk')).sort();
    ok(JSON.stringify(kits) === JSON.stringify(['maps.filter', 'maps.place.entity', 'maps.place.map']), 'searchKit on every search box, no mod box: ' + kits.join());
    // Browse = the file picker where the things live (seeded: each box's spec and what a pick puts in it)
    const specs = []; P.box.searchKit.picker = (spec, done) => specs.push({ spec, done });
    const skBrowse = key => all(P.rootEl, c => c.getAttribute && c.getAttribute('data-sk') === key)[0].querySelector('.sk-browse');
    skBrowse('maps.filter').click();
    const fs0 = specs.pop();
    ok(fs0 && fs0.spec.view === 'data' && fs0.spec.start === 'map' && fs0.spec.mode === 'dir', 'filter Browse: the picker in the game data at map/ ' + JSON.stringify(fs0 && fs0.spec));
    fs0.done('map/multi/p7/terrain', { view: 'data', path: 'map/multi/p7/terrain', name: 'terrain' }); await tick(); await tick();
    ok(filt.value === 'map/multi/p7' && P.box.S.mapKey === 'map/multi/p7', 'filter Browse pick: a folder inside a listed map gives its key and opens it');
    skBrowse('maps.place.map').click();
    const pm0 = specs.pop(); pm0.done('map/single/c9', { view: 'data', path: 'map/single/c9', name: 'c9' });
    const placeIn = inputs.find(i => i.getAttribute('aria-label') === L.uk['maps.place.map']);
    ok(pm0.spec.start === 'map' && placeIn.value === 'map/single/c9', 'place map Browse pick: a map not listed gives its own path ' + placeIn.value);
    skBrowse('maps.place.entity').click();
    const en0 = specs.pop();
    ok(en0 && en0.spec.view === 'data' && en0.spec.start === 'entity' && (en0.spec.exts || []).join() === 'def', 'entity Browse: data view at entity/, .def files ' + JSON.stringify(en0 && en0.spec));
    en0.done('entity/tank/t34_85.def', { view: 'data', path: 'entity/tank/t34_85.def', name: 't34_85.def' });
    const entIn0 = inputs.find(i => i.getAttribute('aria-label') === L.uk['maps.place.entity']);
    ok(entIn0.value === 't34_85', 'entity Browse pick gives the name without .def: ' + entIn0.value);
    placeIn.value = ''; entIn0.value = ''; filt.value = ''; filt.fire('input'); await tick(); delete P.box.searchKit.picker;
    filt.value = 'por'; filt.fire('input'); await tick(); await tick();
    const hit = all(P.rootEl, c => / sk-index/.test(' ' + c.className) && c.textContent.includes('Port'))[0];
    ok(!!hit, 'filter index: typing "por" offers the map Port');
    hit.parentNode.fire('click', { target: hit }); await tick(); await tick();
    ok(filt.value === 'map/multi/p7' && P.box.S.mapKey === 'map/multi/p7' && tbody.children.length === 1, 'a pick from the filter index filters to that map and opens it');
    ok(P.box.LS.m['sk.hist.maps.filter'] && P.box.LS.m['sk.hist.maps.filter'][0] === 'map/multi/p7', 'the pick is in the filter history');
    const ent = inputs.find(i => i.getAttribute('aria-label') === L.uk['maps.place.entity']);
    P.box.calls.length = 0; ent.value = 'tr'; ent.fire('input'); await tick(); ent.value = 'tre'; ent.fire('input'); await tick(); await tick();
    ok(P.box.calls.filter(c => /^\/api\/x\/maps\/entities/.test(c[0])).length === 1, 'the entity index is asked once while typing');
    filt.value = ''; filt.fire('input'); ent.value = ''; await tick(); }
  // rule 4 (owner 2026-11-19): no mod box on the page; the runs send the header's mod (S.mod)
  ok(!inputs.some(i => /mod/i.test(i.getAttribute('aria-label') || '')) && !P.box.setMods.length, 'no mod box on the page, the page never sets the mod');
  { const before = P.box.calls.length; tag(P.rootEl, 'BUTTON').find(b => b.textContent === L.uk['maps.check.run']).click(); await tick();
    const ck = P.box.calls.slice(before).find(c => c[0] === '/api/x/maps/check');
    ok(ck && ck[1].mod === mod, 'GT-15 the page sends the header mod: ' + JSON.stringify(ck && ck[1])); await tick(); }

  // ---- blocks: after a write with every kind of reply, a place and a check run, the screen still follows
  // the structure rules of tools/gui/test/test-blocks.js (results are refilled inside their leaf blocks)
  tbody.children[0].click(); await tick();
  cloneReply = () => Promise.resolve({ ok: true, say: [], findings: [] });
  btn('maps.preview').click(); await tick(); await tick();
  cloneReply = () => Promise.resolve({ ok: true, newKey: 'map/multi/my_castle', say: [{ k: 'maps.s.willcopy', p: { files: 3, key: 'k' } }], findings: [{ sev: 'warn', code: 'ZZ_RAW', msg: 'raw' }],
    suggest: ['map/multi/p7'], bots: [{ state: 'added', mode: 'combat' }], check: { ran: true, count: 1, findings: [{ sev: 'error', code: 'ZZ', msg: 'm', where: 'w' }] }, needsTest: true });
  P.box.confirmAnswer = true; btn('maps.write').click(); await tick(); await tick();
  ok(outHas(L.uk['maps.done']) && outHas(L.uk['maps.test.h']), 'write result shown (check, test hint)');
  tag(P.rootEl, 'BUTTON').filter(b => b.textContent === L.uk['maps.preview'])[0].click(); await tick(); await tick();
  tag(P.rootEl, 'BUTTON').find(b => b.textContent === L.uk['maps.check.run']).click(); await tick(); await tick();
  const blkOf = id => all(P.rootEl, c => c.dataset && c.dataset.blk === id)[0];
  ok(blkOf('clone.out').has(L.uk['maps.done']) && blkOf('place.out').textContent && blkOf('check.out').has(L.uk['maps.check.noRun']), 'results sit in their leaf blocks');
  ok(blkOf('main').classList.contains('box-cols') && blkOf('left').parentNode === blkOf('main') && blkOf('clone').parentNode === blkOf('right'), 'two wrapping columns: list, place, check | map, copy, editor');
  const pr = checkScreen(P.rootEl);
  ok(!pr.length, 'page blocks, loaded state:\n  ' + pr.slice(0, 20).join('\n  '));
  // pick(key, extra) from the Editor's file viewers (ext view kind map): the listed map selected, what the file holds under its picture;
  // a map not in the list (single player) from its key alone; on a fresh page the pick waits for the list
  P.scr.pick('map/multi/p7', { title: 'Grass XYZ', lines: ['grass_a, grass_b'] }); await tick();
  ok(tbody.children[1].getAttribute('aria-selected') === 'true' && blkOf('pic').textContent.includes('Grass XYZ') && blkOf('pic').textContent.includes('grass_a, grass_b'), 'pick: the listed map selected, the file card under its picture');
  P.scr.pick('map/single/c1/m9'); await tick();
  ok(blkOf('pic').textContent.includes('m9') && !blkOf('pic').textContent.includes('Grass XYZ'), 'pick: a map not in the list is shown from its key');
  const P2 = page('en', u => u.startsWith('/api/x/maps/list') ? Promise.resolve(LIST) : Promise.resolve({ svg: null }));
  P2.scr.pick('MAP/multi/2v2_castle/'); await tick(); await tick();
  ok(P2.rootEl.textContent.includes('Castle') && P2.box.calls.filter(c => c[0].startsWith('/api/x/maps/list')).length === 1, 'pick before the list: the list is asked once, then the map is selected');
  // ---- JOBS on the page: re-asks of the list are polls, a stopped list and stopped requests are plain lines (never red)
  {
    const stopErr = () => Promise.reject(Object.assign(new Error('Stopped'), { cancelled: true, key: 'job.cancelled', status: 499 }));
    const stoppedIn = (root, text) => all(root, c => c.getAttribute && c.getAttribute('data-stopped') === '1' && c.textContent === text).length === 1;
    const noErr = root => all(root, c => c.className === 'err' && c.textContent).length === 0;
    const E = L.en, fillK = (k, p) => E[k].replace(/\{(\w+)\}/g, (a, b) => (p && p[b] != null ? String(p[b]) : a));
    // the list: running, then stopped
    let nList = 0, status = { state: 'removed', newKey: 'map/multi/my_castle', left: [] }, mode = 'ok';
    const PJ = page('en', (u, b) => {
      if (u.startsWith('/api/x/maps/list')) { nList++; return Promise.resolve(nList === 1 ? { state: 'running', elapsed: 0 } : nList === 2 ? { state: 'error', error: 'maps.e.stopped', stopped: true, detail: '' } : LIST); }
      if (u.startsWith('/api/x/maps/clone/status')) return Promise.resolve(status);
      if (u.startsWith('/api/x/maps/picture')) return Promise.resolve({ svg: null });
      if (u === '/api/x/maps/clone') return mode === 'stop' ? stopErr() : Promise.resolve({ ok: true, write: !!b.write, say: [{ k: 'maps.s.willcopy', p: { files: 3, key: 'map/multi/my_castle' } }], findings: [] });
      if (u === '/api/x/maps/place' || u === '/api/x/maps/check') return stopErr();
      return Promise.resolve({});
    });
    const st0 = PJ.box.setTimeout; let again = null; PJ.box.setTimeout = (f, ms) => { if (ms >= 1000) { again = f; return 0; } return st0(f, ms); };
    PJ.scr.focus(); await tick(); await tick();
    const lc = () => PJ.box.calls.filter(c => c[0].startsWith('/api/x/maps/list'));
    ok(lc().length === 1 && lc()[0][2] && lc()[0][2].job !== false && lc()[0][2].what === 'job.w.mapslist', 'page: the first ask of the list is named for the job list: ' + JSON.stringify(lc().map(c => c[2])));
    ok(typeof again === 'function', 'page: a running list is asked again later');
    if (again) again(); await tick(); await tick();
    ok(lc().length === 2 && lc()[1][2] && lc()[1][2].job === false, 'page: the re-ask is a poll (job:false): ' + JSON.stringify(lc().map(c => c[2])));
    ok(stoppedIn(PJ.rootEl, fillK('maps.list.stopped', { b: E['maps.reload'] })) && noErr(PJ.rootEl), 'page: a stopped list is a plain line that names the reload button');
    PJ.box.setTimeout = st0;
    const bj = k => tag(PJ.rootEl, 'BUTTON').filter(x => x.textContent === E[k]).pop();
    bj('maps.reload').click(); await tick(); await tick(); await tick();
    ok(lc().length === 3 && /refresh=1/.test(lc()[2][0]) && PJ.rootEl.textContent.includes('Castle'), 'page: the reload button reads the list again after a stop');
    // copy: a stopped preview, then a stopped write with each outcome
    tag(PJ.rootEl, 'TBODY')[0].children[0].click(); await tick();
    mode = 'stop'; bj('maps.preview').click(); await tick(); await tick();
    const cc = PJ.box.calls.filter(c => c[0] === '/api/x/maps/clone').pop();
    ok(cc && cc[2] && cc[2].what === 'job.name' && cc[2].job !== false, 'page: Preview names its request (the shared key job.name, filled with the page and the button): ' + JSON.stringify(cc && cc[2]));
    ok(/jobWhat\('maps\.preview'\)|jobWhat\(write\?'maps\.write':'maps\.preview'\)/.test(X.script) || /jobWhat\(/.test(X.script), 'page: copy, place and check name their requests with jobWhat');
    ok(stoppedIn(PJ.rootEl, E['maps.stop.preview']) && noErr(PJ.rootEl), 'page: a stopped preview is a plain line');
    for (const [stt, key, p] of [['removed', 'maps.stop.removed', {}], ['complete', 'maps.stop.complete', { b: E['maps.check.run'] }], ['left', 'maps.stop.left', { list: 'resource/map/multi/x' }], ['nothing', 'maps.stop.nothing', {}]]) {
      mode = 'ok'; bj('maps.preview').click(); await tick(); await tick();
      mode = 'stop'; status = { state: stt, newKey: 'map/multi/my_castle', left: stt === 'left' ? ['resource/map/multi/x'] : [] };
      PJ.box.confirmAnswer = true; bj('maps.write').click(); await tick(); await tick(); await tick();
      const want = fillK(key, Object.assign({ key: 'map/multi/my_castle' }, p));
      ok(stoppedIn(PJ.rootEl, want) && noErr(PJ.rootEl) && !/\{\w+\}/.test(want), 'page: a stopped copy says what is on disk (' + stt + '): ' + want + ' | ' + all(PJ.rootEl, c => c.getAttribute && c.getAttribute('data-stopped') === '1').map(c => c.textContent).join(' / '));
    }
    ok(PJ.box.calls.filter(c => c[0].startsWith('/api/x/maps/clone/status?mod=')).length === 4, 'page: the stop outcome is asked from clone/status');
    // check: stopped
    bj('maps.check.run').click(); await tick(); await tick();
    ok(stoppedIn(PJ.rootEl, E['maps.stop.check']) && noErr(PJ.rootEl), 'page: a stopped check is a plain line');
    ok(['maps.stop.preview', 'maps.stop.asking', 'maps.stop.nothing', 'maps.stop.removed', 'maps.stop.left', 'maps.stop.complete', 'maps.stop.unknown', 'maps.stop.place', 'maps.stop.check'].every(k => ['ru', 'uk', 'zh'].every(g => L[g][k] && L[g][k] !== E[k])), 'stop wording in four languages');
    ok(checkScreen(PJ.rootEl).length === 0, 'page: block rules with the stopped lines ' + checkScreen(PJ.rootEl).slice(0, 4).join(' | '));
  }
  // ---- K5 (PERF.md): the 1.5 s re-ask of the list while the scan runs waits while the page or the window is hidden (pollLater,
  // page.js): no request then; shown again = one request at once and the list drawn as before; a game change drops the parked re-ask
  {
    const wait = ms => new Promise(r => setTimeout(r, ms)), prog = L.en['maps.progress'].replace('{s}', '7');
    for (const how of ['page', 'window']) {
      let done = false;
      const PP = page('en', u => Promise.resolve(u.startsWith('/api/x/maps/list') ? (done ? LIST : { state: 'running', elapsed: 7 }) : { svg: null }), { poll: true });
      const lc = () => PP.box.calls.filter(c => c[0].startsWith('/api/x/maps/list'));
      const hide = v => { if (how === 'page') PP.box.S.cur = v ? 'share' : 'maps'; else PP.doc.hidden = v; };
      PP.scr.focus(); await WT.until(() => lc().length >= 3 && PP.rootEl.textContent.includes(prog), { who: 'maps test', what: 'poll (' + how + '): the list asked three times' });
      ok(lc().length >= 3 && lc().slice(1).every(c => c[2] && c[2].job === false) && PP.rootEl.textContent.includes(prog), 'poll (' + how + '): on screen the running list is asked again and again: ' + lc().length);
      hide(true); await wait(40); const n1 = lc().length; await wait(120);
      ok(lc().length === n1, 'poll (' + how + ' hidden): no list request while the scan runs: ' + n1 + ' -> ' + lc().length);
      done = true; hide(false); PP.scr.refresh(); PP.box.pollWake(); await tick(); await tick();
      ok(lc().length === n1 + 1 && lc()[n1][2].job === false && PP.rootEl.textContent.includes('Castle') && !PP.rootEl.textContent.includes(prog), 'poll (' + how + ' shown again): one request at once and the list is drawn: ' + n1 + ' -> ' + lc().length);
      await wait(60);
      ok(lc().length === n1 + 1, 'poll (' + how + '): nothing more after the list came: ' + lc().length);
    }
    // a game change while the re-ask is parked: the parked re-ask is dropped (as clearTimeout did), the next focus reads the new game's list once
    const PG = page('en', u => Promise.resolve(u.startsWith('/api/x/maps/list') ? { state: 'running', elapsed: 7 } : { svg: null }), { poll: true });
    const gc = () => PG.box.calls.filter(c => c[0].startsWith('/api/x/maps/list'));
    PG.scr.focus(); await wait(40); PG.box.S.cur = 'share'; await wait(40); const g1 = gc().length;
    PG.box.curGame = () => ({ id: 'goh', kind: 'goh', target: 'goh' });
    PG.box.S.cur = 'maps'; PG.scr.refresh(); PG.box.pollWake(); await tick(); await tick();
    ok(gc().length === g1, 'poll: a game change while hidden drops the parked re-ask: ' + g1 + ' -> ' + gc().length);
    PG.box.S.cur = 'share'; PG.scr.focus(); await tick(); await tick();
    ok(gc().length === g1 + 1 && gc()[g1][2].job !== false, 'poll: the next focus asks the new game\'s list as a job of its own: ' + gc().length);
    await wait(60); ok(gc().length === g1 + 1, 'poll: and its re-ask waits while the page is hidden: ' + gc().length);
  }
  // ---- game parity (MoW:AS2, GoH): its own file, run here so the GUI suite (test-ext.js runs ext/<id>/test.js) covers it
  const rg = cp.spawnSync(process.execPath, [path.join(__dirname, 'test-games.js'), path.join(work, 'games')], { encoding: 'utf8' });
  ok(rg.status === 0 && /PASS\s*$/.test(rg.stdout), 'test-games.js (MoW:AS2 and GoH routes and page):\n' + String(rg.stdout + rg.stderr).split(/\r?\n/).filter(s => /FAIL/.test(s)).slice(0, 12).join('\n'));
  // ---- Open in Map Viewer (MV-PG2c): under the picture of the picked map, only when the Map Viewer page exists; the click opens
  // the same map there (S.mapKey, show, the screen's pick(key) when it has one); a key without map/ is refused (seeded defect)
  {
    const viewerBtn = Q => tag(Q.rootEl, 'BUTTON').filter(b => b.textContent === L.en['maps.toViewer']);
    const listA = () => Promise.resolve(LIST);
    const Q0 = page('en', u => u.startsWith('/api/x/maps/list') ? listA() : Promise.resolve({ svg: null }));
    Q0.scr.pick('map/multi/p7'); await tick(); await tick();
    ok(!viewerBtn(Q0).length, 'Open in Map Viewer absent without S.sec.mapviz');
    for (const s6 of [false, true]) {
      const Q = page('en', u => u.startsWith('/api/x/maps/list') ? listA() : Promise.resolve({ svg: null }));
      const shown = [], vp = [], toasts = [];
      // p7 lives in the mod pk_t: that mod is the open one here (a path that ends in its folder)
      let last = null; Q.box.S.mod = 'mods/pk_t';
      Q.box.S.sec = { maps: {}, mapviz: {} }; Q.box.S.screens = s6 ? { mapviz: { pick: k => { vp.push([k, Q.box.S.mapKey, shown.length]); last = k; }, V: { q: n => (n === 'map' ? last : null) } } } : {};
      Q.box.show = id => shown.push(id); Q.box.toast = t => toasts.push(t);
      Q.scr.pick('map/multi/p7'); await tick(); await tick();
      const b = viewerBtn(Q);
      const picBlk = all(Q.rootEl, c => c.dataset && c.dataset.blk === 'pic')[0];
      let up = b[0]; while (up && up !== picBlk) up = up.parentNode;
      const inPic = b.length === 1 && !!up;
      ok(inPic && b[0].getAttribute('title') === L.en['maps.toViewerT'], 'Open in Map Viewer under the picture with its title (S6 ' + s6 + ')');
      b[0].click();
      ok(shown.join() === 'mapviz' && Q.box.S.mapKey === 'map/multi/p7' && !toasts.length, 'click: S.mapKey kept, the Map Viewer shown (S6 ' + s6 + ')');
      // the pick goes before show() with S.mapKey blanked, so the shell's refresh does not open the map as no pick of the
      // user's (it would block the user's pick: fault of the 2026-11-14 check); a stub that holds the map: no second pick
      ok(s6 ? vp.length === 1 && vp[0][0] === 'multi/p7' && vp[0][1] === '' && vp[0][2] === 0 : !vp.length, 'click: the screen pick(key) without map/, before show, S.mapKey blanked (S6 ' + s6 + ') ' + JSON.stringify(vp));
      if (s6) {
        // a map that lives only in another mod: the Map Viewer reads the open mod only, so the button is off and says which mod
        const QM = page('en', u => u.startsWith('/api/x/maps/list') ? listA() : Promise.resolve({ svg: null }));
        const sm = [], tm = [], pm = [];
        QM.box.S.mod = 'mods/other'; QM.box.S.sec = { maps: {}, mapviz: {} }; QM.box.S.screens = { mapviz: { pick: k => pm.push(k) } };
        QM.box.show = id => sm.push(id); QM.box.toast = t => tm.push(t);
        QM.scr.pick('map/multi/p7'); await tick(); await tick();
        const bm = viewerBtn(QM);
        ok(bm.length === 1 && bm[0].getAttribute('disabled') !== null && bm[0].getAttribute('title') === L.en['maps.toViewerMod'].replace('{mod}', 'pk_t'), 'a map of another mod: the button is off, its title names the mod ' + (bm[0] && bm[0].getAttribute('title')));
        if (bm.length) bm[0].click();
        ok(!sm.length && !pm.length && (!tm.length || tm[0] === L.en['maps.toViewerMod'].replace('{mod}', 'pk_t')), 'a map of another mod: no jump ' + JSON.stringify([sm, pm, tm]));
        // a game map (no mod): on with any open mod
        QM.scr.pick('map/multi/2v2_castle'); await tick(); await tick();
        const bv = viewerBtn(QM);
        ok(bv.length === 1 && bv[0].getAttribute('disabled') === null && bv[0].getAttribute('title') === L.en['maps.toViewerT'], 'a game map: the button is on');
        bv[0].click();
        ok(sm.join() === 'mapviz' && pm[0] === 'multi/2v2_castle' && QM.box.S.mapKey === 'map/multi/2v2_castle', 'a game map: opened in the Map Viewer ' + JSON.stringify([sm, pm, QM.box.S.mapKey]));
      }
      if (!s6) {
        // seeded defect: a list row whose key lacks map/ -> refused, said, no jump
        const BAD = { state: 'done', cached: true, at: LIST.at, maps: [{ key: 'multi/odd', folder: 'odd', name: 'Odd', players: 2, modes: ['combat'], mod: '', mods: [], copy: true }] };
        const QB = page('en', u => u.startsWith('/api/x/maps/list') ? Promise.resolve(BAD) : Promise.resolve({ svg: null }));
        const sb = [], tb = [];
        QB.box.S.sec = { maps: {}, mapviz: {} }; QB.box.S.screens = {}; QB.box.show = id => sb.push(id); QB.box.toast = t => tb.push(t);
        QB.scr.focus(); await tick(); await tick();
        tag(QB.rootEl, 'TBODY')[0].children[0].click(); await tick();
        const bb = viewerBtn(QB); ok(bb.length === 1, 'button on the odd row');
        if (bb.length) bb[0].click();
        ok(!sb.length && tb.length === 1 && tb[0] === L.en['maps.toViewerBad'].replace('{key}', 'multi/odd') && QB.box.S.mapKey === 'multi/odd', 'a key without map/ is refused: said with the Maps page\'s own words, no jump ' + JSON.stringify([sb, tb]));
      }
    }
    ok(['en', 'ru', 'uk', 'zh'].every(g => ['maps.toViewer', 'maps.toViewerT', 'maps.toViewerBad', 'maps.toViewerMod'].every(k => L[g][k] && !/^TODO:/.test(L[g][k]))) && ['en', 'ru', 'uk', 'zh'].every(g => L[g]['maps.toViewerMod'].includes('{mod}') && L[g]['maps.toViewerBad'].includes('{key}')), 'Open in Map Viewer words in en, ru, uk, zh');
    ok(!/'view\.map\./.test(X.script), 'the Maps page uses no key of the view ext');
    // the real Map Viewer shell: the button opens the picked map as the user's pick, so a map not read yet starts the read
    // job (choose() already set S.mapKey: the shell's refresh must not open it as no pick first). Fault of the 2026-11-14 check
    {
      const SH = require('../mapviz/sub/shell.test.js').harness, SC = require('../mapviz/sub/shell.client'), SL = SH.mergeLang([require('../mapviz/sub/shell.lang.json')]);
      const PAL = require('../../../mapviz/palette.json'), calls = [];
      const routes = { 'GET /api/x/mapviz/palette': async () => PAL, 'GET /api/x/mapviz/cache': async () => ({ v: 1, root: '<cache>', bytes: 0, cap: 1, entries: 0, jobs: 0 }),
        'GET /api/x/mapviz/doc': async () => { throw Object.assign(new Error('MV_NOT_FOUND'), { status: 404, key: 'mapviz.err.MV_NOT_FOUND', params: { msg: 'x', need: { what: 'doc', args: {} } } }); },
        'POST /api/x/mapviz/job': async () => ({ id: 'j1', shared: false, state: 'queued', queue: 0 }),
        'GET /api/x/mapviz/job': async () => ({ id: 'j1', what: 'doc', state: 'done', stage: '', done: 1, total: 1, queue: 0 }) };
      const QR = page('en', u => u.startsWith('/api/x/maps/list') ? listA() : Promise.resolve({ svg: null }));
      const S = QR.box.S; S.gameId = 'as64'; S.gameOv = ''; S.cur = 'maps';
      const SPg = SH.mkPage({ scripts: [SC], lang: SL, S, canvas: true, api: SH.routeApi(routes, calls) });
      S.sec = { maps: QR.rootEl, mapviz: SPg.root }; S.screens = { mapviz: SPg.screen };
      S.cur = 'mapviz'; SPg.screen.refresh(); await SH.flush(); S.cur = 'maps';   // the Map Viewer was shown once before
      QR.box.show = id => { S.cur = id; const sc = S.screens[id]; if (sc && sc.refresh) sc.refresh(); };
      QR.scr.pick('map/multi/2v2_castle'); await tick(); await tick();
      const c0 = calls.length, br = viewerBtn(QR); if (br.length) br[0].click(); await SH.flush(60);
      const nj = calls.slice(c0).filter(c => c.method === 'POST' && c.path === '/api/x/mapviz/job').length;
      ok(br.length === 1 && S.cur === 'mapviz' && SPg.V.q('map') === 'multi/2v2_castle' && S.mapKey === 'map/multi/2v2_castle' && nj === 1, 'real shell: the button opens the map as the user\'s pick, the read job starts ' + JSON.stringify([S.cur, SPg.V.q('map'), S.mapKey, calls.slice(c0).map(c => c.method + ' ' + c.path)]));
    }
  }
  // ---- CACHE (gui README contract 1): the list, the pictures and the entity names live in the shared store under stamps
  {
    const MT = require('../../../lib/modtree'), GV = require('../../../lib/gameview');
    const croot = path.join(work, 'cache-tmp'), runs = [], touched = [];
    const cctx = Object.assign({}, ctx, { tmpRoot: croot, modtree: Object.assign({}, MT, { touch: d => { touched.push(d); MT.touch(d); } }),
      runTool: async (tool, entry, args, opt) => {
        runs.push(tool);
        if (tool === 'mapview') { fs.writeFileSync(args[args.indexOf('--svg') + 1], '<svg n="' + runs.filter(x => x === 'mapview').length + '"/>'); return { code: 0, stdout: '', stderr: '', timedOut: false }; }
        return ctx.runTool(tool, entry, args, opt);
      } });
    const S = t.storeOf(cctx), L = R['GET /api/x/maps/list'];
    const fresh = () => { t.drop(); GV.drop(); };            // forget the 5 s memories, as time passing does
    const list = async q => { const l = await L(U(q || ''), null, cctx); if (l.state !== 'running') return l;
      return (await WT.until(async () => { const x = await L(U(''), null, cctx); return x.state !== 'running' ? x : null; }, { who: 'maps test', what: 'the cached map list scan', step: 30, ms: WT.CHILD_MS })) || L(U(''), null, cctx); };
    const nList = () => runs.filter(x => x === 'mission-clone').length;
    const parts = t.listParts(cctx, game);
    t.JOBS.clear(); fresh();
    ok(S.state('maps.list', t.LIST_VER, parts, t.listStamps(cctx, game)).state === 'none' && X.prep[0].state(cctx, { mod, game: { id: 'as64', dir: game } }).state === 'none', 'cache: no list kept yet');
    const l1 = await list('');
    ok(l1.state === 'done' && nList() === 1 && S.state('maps.list', t.LIST_VER, parts, t.listStamps(cctx, game)).state === 'ready', 'cache: the scan puts the list in the store');
    ok(!fs.existsSync(path.join(croot, 'as2gui-maps')) || !fs.readdirSync(path.join(croot, 'as2gui-maps')).some(n => /^list2-/.test(n)), 'cache: no list file in the temp folder any more');
    // a new process: no job, no memory -> the store answers, no tool run
    t.JOBS.clear(); fresh();
    const l2 = await L(U(''), null, cctx);
    ok(l2.state === 'done' && l2.cached === true && nList() === 1 && JSON.stringify(l2.maps) === JSON.stringify(l1.maps) && l2.at === l1.at, 'cache: after a restart the kept list is served, equal to the scanned one, no tool run');
    // an unrelated edit inside an installed mod (a set file): not read by the list -> not rebuilt
    fs.mkdirSync(path.join(mod, 'resource', 'set'), { recursive: true }); fs.writeFileSync(path.join(mod, 'resource', 'set', 'x.set'), '{}\r\n');
    t.JOBS.clear(); fresh();
    const l3 = await L(U(''), null, cctx);
    ok(l3.state === 'done' && nList() === 1, 'cache: an edit in another area of a mod does not rebuild the list');
    // a map folder appears in an installed mod (what the list reads) -> the stamp moves, a new scan
    fs.mkdirSync(path.join(mod, 'resource', 'map', 'multi', 'zz_new'), { recursive: true }); fs.writeFileSync(path.join(mod, 'resource', 'map', 'multi', 'zz_new', 'map.net'), 'x');
    t.JOBS.clear(); fresh();
    ok(S.state('maps.list', t.LIST_VER, parts, t.listStamps(cctx, game)).state === 'stale', 'cache: a new map folder in an installed mod makes the kept list stale');
    const l4 = await list('');
    ok(l4.state === 'done' && nList() === 2, 'cache: the stale list is scanned again');
    // within one run a stamp that moved is not answered from the finished job either
    fs.writeFileSync(path.join(mod, 'resource', 'extra.pak'), 'PK'); fresh();
    const l5 = await L(U(''), null, cctx);
    ok(l5.state === 'running', 'cache: a pak added to an installed mod starts a new scan (no answer from the old job)');
    const l6 = await list('');
    ok(l6.state === 'done' && nList() === 3, 'cache: that scan ends');
    fs.rmSync(path.join(mod, 'resource', 'extra.pak'), { force: true });
    // refresh=1 forces
    const l7 = await list('refresh=1');
    ok(l7.state === 'done' && nList() === 4 && JSON.stringify(l7.maps) === JSON.stringify(l1.maps), 'cache: refresh=1 forces a scan; the list equals the first one');
    // Prepare section: the same code path, then ready
    ok(Array.isArray(X.prep) && X.prep[0].id === 'maps.list' && X.prep[0].needs.join() === 'game.view' && X.prep[0].areas.length === 0 && ['en', 'ru', 'uk', 'zh'].every(g => X.lang[g][X.prep[0].title]), 'prep: maps.list shape and title in four languages');
    t.JOBS.clear(); fresh(); S.clear('maps.list');
    const q = { mod, game: { id: 'as64', dir: game } }, sets = [];
    ok(X.prep[0].state(cctx, q).state === 'none', 'prep: none after a clear');
    const pr = await X.prep[0].run(cctx, q, { cancelled: false, set: o => sets.push(o) });
    ok(pr.maps === l1.maps.length && sets.length === 2 && sets[1].done === 1 && X.prep[0].state(cctx, q).state === 'ready', 'prep: run makes the list, then ready ' + JSON.stringify(pr));
    t.JOBS.clear(); fresh(); const n0 = nList();
    ok((await L(U(''), null, cctx)).cached === true && nList() === n0, 'prep: the page route then hits the store');

    // pictures: kept per map; a map read from a mod is rebuilt when a file of its folder there changes
    const P = R['GET /api/x/maps/picture'], nPic = () => runs.filter(x => x === 'mapview').length;
    const p1 = await P(U('map=map/multi/a1'), null, cctx), p2 = await P(U('map=map/multi/a1'), null, cctx);
    ok(p1.svg === '<svg n="1"/>' && p2.svg === p1.svg && nPic() === 1, 'picture: kept in the store, the second ask runs no tool');
    ok(!fs.readdirSync(path.join(croot, 'as2gui-maps')).some(n => /^pic-/.test(n)), 'picture: no picture file stays in the temp folder');
    const pm = 'map=map/multi/zz_new&from=my_mod';
    const p3 = await P(U(pm), null, cctx), p4 = await P(U(pm), null, cctx);
    ok(p3.svg === '<svg n="2"/>' && p4.svg === p3.svg && nPic() === 2, 'picture: a map of a mod is kept too');
    fs.writeFileSync(path.join(mod, 'resource', 'set', 'x.set'), '{ }\r\n');
    ok((await P(U(pm), null, cctx)).svg === p3.svg && nPic() === 2, 'picture: an edit elsewhere in that mod does not redraw it');
    fs.writeFileSync(path.join(mod, 'resource', 'map', 'multi', 'zz_new', 'map.net'), 'xyz');
    ok((await P(U(pm), null, cctx)).svg === '<svg n="3"/>' && nPic() === 3, 'picture: an edit of the map\'s own file redraws it');

    // entity names: kept under game + mod:entity/pak/other
    const E = R['GET /api/x/maps/entities'], EU = new URL('http://x/?mod=' + encodeURIComponent(mod));
    const estate = async () => S.state('maps.ents', t.ENTS_VER, { game: t.listParts(cctx, game).game, gid: 'as64', mod: path.resolve(mod).replace(/\\/g, '/').toLowerCase() },
      Object.assign({ game: GV.stamp({ gameDir: game, gid: 'as64' }) }, MT.stamps(await MT.ensure(mod), ['entity', 'pak', 'other'])));
    fs.mkdirSync(path.join(mod, 'resource', 'entity', 'construction'), { recursive: true }); fs.writeFileSync(path.join(mod, 'resource', 'entity', 'construction', 'hut_m.def'), '{}\r\n');
    MT.touch(mod);
    const e1 = await E(EU, null, cctx), s1 = await estate();
    const e2 = await E(EU, null, cctx);
    ok(s1.state === 'ready' && JSON.stringify(e1) === JSON.stringify(e2) && e1.entities.some(x => x.name === 'hut_m'), 'entities: kept in the store, the second answer equals the first');
    fs.writeFileSync(path.join(mod, 'resource', 'set', 'x.set'), '{  }\r\n'); MT.touch(mod);
    const s2 = await estate();
    ok(s2.state === 'ready' && s2.at === s1.at, 'entities: an edit of a set file leaves the kept names');
    fs.writeFileSync(path.join(mod, 'resource', 'entity', 'construction', 'hut_n.def'), '{}\r\n'); MT.touch(mod);
    ok((await estate()).state === 'stale', 'entities: a new .def makes them stale');
    const e3 = await E(EU, null, cctx);
    ok(e3.entities.some(x => x.name === 'hut_n') && (await estate()).state === 'ready', 'entities: rebuilt with the new name');
    const fresh3 = JSON.stringify(require('../../../lib/vfs').build({ gameDir: game, exe: 'as64', modDirs: [mod] }).files.size > 0) && JSON.stringify((await E(new URL('http://x/'), null, cctx)).entities.filter(x => x.name === 'hut_n'));
    ok(fresh3 === '[]', 'entities: without a mod the game\'s own names only');
    // Prepare section maps.ents: the route's own code, then ready; the page route then answers from the store
    const PE = X.prep[1], qe = { mod, game: { id: 'as64', dir: game } }, qg = { game: { id: 'as64', dir: game } }, esets = [];
    ok(PE && PE.id === 'maps.ents' && PE.needs.join() === 'game.view,mod.tree' && PE.areas.join() === 'entity,pak,other' && ['en', 'ru', 'uk', 'zh'].every(g => X.lang[g][PE.title]), 'prep: maps.ents shape and title in four languages');
    ok(PE.state(cctx, qe).state === 'ready', 'prep ents: ready while the route\'s entry stands');
    S.clear('maps.ents');
    ok(PE.state(cctx, qe).state === 'none' && PE.state(cctx, qg).state === 'none', 'prep ents: none after a clear (with a mod and without)');
    const per = await PE.run(cctx, qe, { cancelled: false, set: o => esets.push(o) });
    ok(per.entities === e3.entities.length && esets.length === 2 && esets[1].done === 1 && PE.state(cctx, qe).state === 'ready' && (await estate()).state === 'ready', 'prep ents: run makes the names, then ready ' + JSON.stringify(per));
    const sAt = (await estate()).at, e4 = await E(EU, null, cctx);
    ok(JSON.stringify(e4) === JSON.stringify(e3) && (await estate()).at === sAt, 'prep ents: the page route then answers the same names from the store');
    fs.writeFileSync(path.join(mod, 'resource', 'entity', 'construction', 'hut_o.def'), '{}\r\n'); MT.touch(mod); await MT.ensure(mod);
    ok(PE.state(cctx, qe).state === 'stale', 'prep ents: a new .def makes the section stale');
    const peg = await PE.run(cctx, qg, null);
    ok(peg.entities > 0 && PE.state(cctx, qg).state === 'ready' && PE.state(cctx, { mod: path.join(work, 'no such mod'), game: { id: 'as64', dir: game } }).state === 'ready', 'prep ents: no mod (or no such folder) = the game\'s own names');
    ok(PE.state({}, { game: { id: 'as64' } }).state === 'na', 'prep ents: no game folder = not applicable');

    // write routes tell the shared walk (modtree.touch) on every way out
    touched.length = 0;
    const cm = path.join(game, 'mods', 'touch_mod'); fs.mkdirSync(cm, { recursive: true });
    await R['POST /api/x/maps/clone'](null, { mod: cm, map: 'map/multi/a1', name: 't_prev', mode: 'keep' }, cctx);
    ok(touched.length === 0, 'touch: a preview touches nothing');
    await R['POST /api/x/maps/clone'](null, { mod: cm, map: 'map/multi/a1', name: 't_copy', mode: 'keep', write: true }, cctx);
    ok(touched.length === 1 && path.resolve(touched[0]) === path.resolve(cm) && fs.existsSync(path.join(cm, 'resource', 'map', 'multi', 't_copy')), 'touch: a written copy touches the mod');
    await R['POST /api/x/maps/place'](null, { mod: cm, map: 'map/multi/t_copy', entity: 'tree_x', x: 1, y: 1, write: true }, cctx).catch(() => null);
    ok(touched.length === 2, 'touch: a place write touches the mod');
    GV.drop();
  }
  console.log(bad ? 'FAIL ' + bad : 'PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crash ' + e.stack); process.exit(1); });
