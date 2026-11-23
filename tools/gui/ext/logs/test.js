// logs ext test. Arg: scratch dir. Fixtures from tools/logtriage/test/mkfixture.js; no game, no network.
// Author: Imperator_Aug (ARSENAL, ia-9ab3ad33)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'logsx-')));
fs.mkdirSync(work, { recursive: true });
const TOOLS = path.join(__dirname, '..', '..', '..');
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL ' + m); } };

// fixture: home/<Documents>/my games/.../log + extra copy
const fxWork = path.join(work, 'lt');
fs.mkdirSync(fxWork, { recursive: true });
const mk = cp.spawnSync(process.execPath, [path.join(TOOLS, 'logtriage', 'test', 'mkfixture.js')], { env: Object.assign({}, process.env, { TEST_WORK: fxWork }), encoding: 'utf8' });
ok(mk.status === 0, 'mkfixture ' + (mk.stderr || '').slice(0, 200));
const fx = path.join(fxWork, 'fixture');
const home = path.join(work, 'home');
const ud = path.join(home, 'Documents', 'my games', 'men of war - assault squad 2');
fs.rmSync(home, { recursive: true, force: true });
fs.mkdirSync(ud, { recursive: true });
fs.cpSync(path.join(fx, 'log'), path.join(ud, 'log'), { recursive: true });
const ud1 = ud + ' - instance 1';
fs.mkdirSync(path.join(ud1, 'log'), { recursive: true });
fs.copyFileSync(path.join(fx, 'log', 'game.log'), path.join(ud1, 'log', 'game.log'));
// game dir with two mods + options.set
const game = path.join(work, 'game');
fs.rmSync(game, { recursive: true, force: true });
const wr = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
wr(path.join(game, 'mods', 'goodmod', 'mod.info'), '{Mod {Name "Good"} {Desc "x"} {MinGameVersion "3.262"} {MaxGameVersion "3.262.1"}}\r\n');
wr(path.join(game, 'mods', 'newmod', 'mod.info'), '{Mod {Name "New"} {MinGameVersion "3.301"}}\r\n');
wr(path.join(game, 'mods', 'nover', 'mod.info'), '{Mod {Name "NoVer"}}\r\n');
wr(path.join(game, 'resource', 'entity', 'a.def'), '{}\r\n');
wr(path.join(ud, 'profiles', 'p1', 'options.set'), '{options {mods "goodmod:1" "newmod:1" "ghost:1" "Caps:1"}}\r\n');
process.env.AS2_HOME = home;

const routes = require('./index').routes;
const ctx = {
  tools: TOOLS, tmpRoot: work, game: () => game, allowLaunch: false,
  runTool: (tool, entry, args, o = {}) => new Promise(res => {
    const r = cp.spawnSync(process.execPath, [path.join(TOOLS, entry), ...args], { encoding: 'utf8', timeout: o.timeoutMs || 60000, env: process.env, maxBuffer: 32 << 20 });
    res({ code: r.status, stdout: r.stdout || '', stderr: r.stderr || '', timedOut: !!r.error });
  }),
};
const U = q => new URL('http://x/api/x/logs/' + q);
const call = (m, n, q, body) => routes[m + ' /api/x/logs/' + n](U((q || n)), body || null, ctx);

(async () => {
  // find
  let f = await call('GET', 'find');
  ok(f.instances.length >= 2, 'find: two instances, got ' + f.instances.length);
  ok(f.instances[0].files.some(x => x.name === 'game.log'), 'find: game.log listed');
  ok(f.newest && /game\.log$/.test(f.newest.path), 'find: newest');
  ok(f.instances[0].dumps.length >= 1, 'find: dump listed');
  const sidecar = (f.instances[0].dumps.find(d => d.sidecar) || {}).sidecar;
  ok(!!sidecar, 'find: sidecar present');
  // explain newest, inst, all, file
  let e = await call('POST', 'explain', 'explain', {});
  ok(e.ok && e.results.length === 1 && e.results[0].cards.length > 0, 'explain: cards');
  ok(e.copyWarn === true, 'explain: copy warning flag');
  const codes = e.results[0].cards.map(c => c.code);
  ok(codes.includes('LOG_NO_STUFF') && codes.includes('LOG_CRASH'), 'explain: seeded codes ' + codes.join(','));
  ok(e.results[0].cards.every(c => c.title && c.what && c.fix), 'explain: every card has plain title/what/fix');
  ok(e.results[0].cards[0].level === 'stop' || e.results[0].cards[0].level === 'crash', 'explain: worst first');
  e = await call('POST', 'explain', 'explain', { all: true });
  ok(e.results.length === 2, 'explain all: 2 instances, got ' + e.results.length);
  e = await call('POST', 'explain', 'explain', { inst: 1 });
  ok(e.results[0].inst === 1, 'explain inst 1');
  e = await call('POST', 'explain', 'explain', { file: path.join(ud, 'log', 'game.log') });
  ok(e.results.length === 1, 'explain file');
  let t = false; try { await call('POST', 'explain', 'explain', { dir: 'relative' }); } catch (x) { t = x.status === 400; }
  ok(t, 'explain: relative path refused');
  // dump
  const d = await call('POST', 'dump', 'dump', { file: sidecar });
  ok(d.hasException && d.plain.length, 'dump: exception plain');
  // enabled
  const en = await call('GET', 'enabled', 'enabled');
  ok(en.mods.length === 4, 'enabled: 4 mods, got ' + en.mods.length);
  ok(en.warnings.some(w => w.code === 'DOC_MOD_NOT_INSTALLED' && w.mod === 'ghost'), 'enabled: unknown folder ghost');
  ok(en.warnings.some(w => w.code === 'DOC_CAPITALS'), 'enabled: capitals');
  ok(en.warnings.some(w => w.code === 'NO_AS64PLUS'), 'enabled: modern without as64+');
  // modwhy
  let w = await call('POST', 'modwhy', 'modwhy', { mod: path.join(game, 'mods', 'nover') });
  ok(w.reasons.some(r => r.level === 'stop'), 'modwhy: nover has a stopping reason: ' + JSON.stringify(w.reasons.map(r => r.code)));
  w = await call('POST', 'modwhy', 'modwhy', { mod: path.join(game, 'mods', 'goodmod') });
  ok(!w.reasons.some(r => r.level === 'stop'), 'modwhy: goodmod no stop ' + JSON.stringify(w.reasons.map(r => r.code)));
  w = await call('POST', 'modwhy', 'modwhy', { mod: path.join(work, 'elsewhere') }).catch(x => ({ err: x.status }));
  ok(w.err === 400, 'modwhy: missing folder refused');
  // no mod.info: the fix names the place that makes one for the page's game (the New mod card is on the AS64 Mods page only)
  fs.mkdirSync(path.join(game, 'mods', 'noinfo'), { recursive: true });
  const miFix = async target => { const r = await call('POST', 'modwhy', 'modwhy', { mod: path.join(game, 'mods', 'noinfo'), target }); const x = r.reasons.find(y => y.code === 'NO_MODINFO'); return x ? x.fix.join(' ') : ''; };
  const fa = await miFix('as64'), fm = await miFix('mowas2'), fn = await miFix(undefined);
  ok(/New mod card/.test(fa) && !/Generator/.test(fa), 'modwhy: no mod.info under AS64 points to the New mod card: ' + fa);
  ok(/Other Tools > Generator/.test(fm) && !/New mod card/.test(fm), 'modwhy: no mod.info under MoW:AS2 points to the Generator: ' + fm);
  ok(/Under AS64 .*New mod card.*under MoW:AS2 .*Generator/.test(fn), 'modwhy: no mod.info with no game named says both: ' + fn);
  // unit chain
  const mod = path.join(work, 'umod');
  fs.rmSync(mod, { recursive: true, force: true });
  wr(path.join(mod, 'mod.info'), '{Mod {Name "U"} {MinGameVersion "3.262"} {MaxGameVersion "3.262.1"}}\r\n');
  wr(path.join(mod, 'resource', 'entity', 'vehicle', 'tk1.def'), '{include "tk1.inc"}\r\n');
  wr(path.join(mod, 'resource', 'entity', 'vehicle', 'tk1.inc'), '{Extension "tk1.mdl"}\r\n');
  let u = await call('POST', 'unit', 'unit', { mod, unit: 'tk1', game: path.join(work, 'nogame') }).catch(x => ({ err: x.status }));
  ok(u.err === 400, 'unit: bad game refused');
  u = await call('POST', 'unit', 'unit', { mod, unit: 'tk1' });
  const st = Object.fromEntries(u.steps.map(s => [s.id, s.status]));
  ok(st.def === 'ok', 'unit: def ok ' + JSON.stringify(st));
  ok(st.model === 'broken', 'unit: missing model marked broken ' + JSON.stringify(st));
  ok(st.card === 'broken', 'unit: missing card broken');
  ok(u.firstBroken >= 0 && u.steps[u.firstBroken].id === 'model', 'unit: first broken is model');
  wr(path.join(mod, 'resource', 'entity', 'vehicle', 'tk1.mdl'), 'x');
  wr(path.join(mod, 'resource', 'set', 'multiplayer', 'units', 'vehicles_ger.set'), '{"tk1" ("vs" c(60) t(all) s(ger)) {level 2} {cost 80}}\r\n');
  u = await call('POST', 'unit', 'unit', { mod, unit: 'tk1' });
  const st2 = Object.fromEntries(u.steps.map(s => [s.id, s.status]));
  ok(st2.model === 'ok' && st2.card === 'ok', 'unit: found after fix ' + JSON.stringify(st2));
  t = false; try { await call('POST', 'unit', 'unit', { mod, unit: '../x' }); } catch (x) { t = x.status === 400; }
  ok(t, 'unit: bad name refused');
  // ticklist
  wr(path.join(mod, 'UPGRADE.md'), '# up\r\n- change x. test: buy the t34 and fire it\r\n');
  const tl = await call('GET', 'ticklist', 'ticklist?mod=' + encodeURIComponent(mod));
  ok(tl.items.some(i => /buy the t34/.test(i.text)), 'ticklist: reads UPGRADE.md test lines');
  ok(tl.items.length >= 3, 'ticklist: basics added');
  {   // unit names for the unit box's index (searchKit): the mod's .def files first, no repeats
    const um = path.join(work, 'unitmod');
    wr(path.join(um, 'resource', 'entity', 'vehicle', 'tank', 'zzt1.def'), '{x}'); wr(path.join(um, 'resource', 'entity', 'humanskin', 'zzs.def'), '{x}');
    const r = await call('GET', 'units', 'units?mod=' + encodeURIComponent(um));
    ok(r && Array.isArray(r.units) && r.units.some(u => u.n === 'zzt1' && u.src === 'mod' && u.dir === 'vehicle/tank') && r.units.some(u => u.n === 'zzs') && new Set(r.units.map(u => u.n)).size === r.units.length, 'units: entity names of the mod ' + JSON.stringify(r && r.units.slice(0, 3)));
  }
  // nothing was deleted from the logs
  ok(fs.existsSync(path.join(ud, 'log', 'game.log')) && fs.existsSync(path.join(ud, 'log', 'game.prev.log')), 'logs untouched');

  // blocks: the page in a stand-in browser with canned replies of every route; after each reply is drawn
  // every control and text sits in a leaf block (the result areas are leaves; the sections are card containers)
  {
    const FD = require('../units/fakedom'), X = require('./index'), now = Date.now(), KIT = require('../../test/blockcheck').kitSrc() + '\n';   // the page's searchKit (the unit box)
    const canned = {
      explain: { results: [{ label: 'game.log', header: ['head'], cards: [{ level: 'stop', title: 'T', count: 2, what: 'w', msg: 'm', fix: ['f'], hint: ['x'], file: 'a', line: 3, detail: 'd' }], more: 2, notes: [{ text: 'n' }], tests: ['t1'] }] },
      find: { instances: [{ inst: 0, exists: true, dir: 'D', files: [{ name: 'game.log', size: 10, mtimeMs: now, path: 'p' }], dumps: [{ name: 'x.dmp', mtimeMs: now, sidecar: 's' }, { name: 'y.dmp', mtimeMs: now }], oos: [{ name: 'oos1', mtimeMs: now, path: 'o' }] }] },
      dump: { name: 'x', hasException: true, exception: { kind: 'crash', fn: 'f', src: 's', address: '0x1' }, plain: ['p'], before: ['b'] },
      enabled: { options: 'o', mods: [{ name: 'a', raw: 'a', installed: false }, { name: 'b', raw: 'b 1', mode: 'mp', installed: true }], warnings: [{ level: 'warn', text: 'w' }] },
      modwhy: { facts: [{ k: 'a', v: 'b' }], reasons: [{ level: 'warn', what: 'w', fix: ['f'] }], verdict: { level: 'stop', text: 't', raw: 'r' } },
      unit: { firstBroken: 0, steps: [{ id: 'def', status: 'broken', note: 'n', fix: ['f'], where: 'w' }, { id: 'model', status: 'skip', note: 'n' }], deep: { lines: ['l'] } },
      ticklist: { items: [{ text: 'a' }, { text: 'b' }] },
      units: { units: [{ n: 'tk1', src: 'mod', dir: 'vehicle/tank' }, { n: 'tk2', src: 'game', dir: 'vehicle/tank' }, { n: 'gun9', src: 'game', dir: 'cannon' }] },
    };
    const route = u => canned[u.split('?')[0].split('/').pop()];
    const P = FD.runPage('logs', KIT + X.script, X.lang, { route, S: { mod: 'm' }, env: { fmtBytes: n => n + ' B', gameDir: () => '', curGame: () => ({}) } });
    const en = X.lang.en, btn = k => P.root.all(c => c.tagName === 'BUTTON' && c.textContent === en[k])[0], settle = async () => { for (let i = 0; i < 4; i++) await FD.settle(); };
    P.screen.focus(); await settle();
    for (const k of ['logs.btn.last', 'logs.btn.readcrash', 'logs.btn.check', 'logs.btn.why']) { const b = btn(k); ok(b, 'blocks: button ' + k); if (b) b.click(); await settle(); }
    P.root.all(c => c.tagName === 'INPUT' && c.getAttribute('aria-label') === en['logs.unit.ph'])[0].value = 'tk1'; btn('logs.btn.unit').click(); await settle();
    {   // searchKit on the unit box (owner 2026-11-19): Browse, History and an index of the unit names from GET /api/x/logs/units
      const wrap = P.root.all(c => c.className === 'sk' && c.dataset.sk === 'logs.unit')[0], uin = wrap && wrap.children[0];
      ok(wrap && wrap.children.map(c => c.tagName).join() === 'INPUT,BUTTON,BUTTON,DIV', 'unit box is a searchKit box (Browse, History, list)');
      uin.value = 'tk'; uin.selectionStart = 2; uin.fire('input'); await settle(); await new Promise(r => setTimeout(r, 20));
      const opts = wrap.children[3].children.filter(c => c.getAttribute('role') === 'option').map(c => c.textContent).join('|');
      ok(/tk1/.test(opts) && /tk2/.test(opts) && !/gun9/.test(opts) && P.sent.filter(x => /\/logs\/units/.test(x.url)).length === 1, 'unit box: the index offers the unit names that match, read once (' + opts + ')');
      const n0 = P.sent.filter(x => /\/logs\/unit$/.test(x.url)).length;
      const dd = wrap.children[3]; dd.fire('click', { target: dd.children.find(c => c.getAttribute('role') === 'option' && /tk2/.test(c.textContent)) }); await settle();
      ok(uin.value === 'tk2' && P.sent.filter(x => /\/logs\/unit$/.test(x.url)).length === n0 + 1, 'unit box: a pick checks that unit at once');
      // Browse = the file picker (owner 2026-11-19): the game data at entity/, .def only; a pick gives the base name and checks that unit
      const sent = []; P.picker((spec, done) => { sent.push(spec); done('entity/vehicle/tank/tk9/tk9.def', { view: 'data', name: 'tk9.def' }); });
      uin._sk.browseButton.click(); await settle();
      ok(sent.length === 1 && sent[0].view === 'data' && sent[0].start === 'entity' && sent[0].mode === 'file' && (sent[0].exts || []).join() === 'def', 'unit box: Browse opens the game data at entity/ ' + JSON.stringify(sent[0]));
      ok(uin.value === 'tk9' && P.sent.filter(x => /\/logs\/unit$/.test(x.url)).length === n0 + 2, 'unit box: a Browse pick puts the unit name and checks it');
    }
    const ids = P.root.all(c => c.dataset.blk != null).map(c => c.dataset.blk), pr = FD.checkBlocks(P.root);
    ok(!pr.length, 'blocks: every control and text of the drawn replies sits in a leaf block: ' + pr.slice(0, 8).join(' | '));
    const txt = i => (P.root.all(c => c.dataset.blk === i)[0] || { textContent: '' }).textContent;
    ok(/head/.test(txt('explain.res')) && /0x1/.test(txt('files.res')) && /^oa/.test(txt('enabled.res')) && /^a: b/.test(txt('modwhy.res')) && /\.def/.test(txt('unit.res')) && txt('ticks.res').length > 2, 'blocks: each reply was drawn in its result leaf ' + JSON.stringify(['explain.res', 'files.res', 'enabled.res', 'modwhy.res', 'unit.res', 'ticks.res'].map(txt)));
    ok(['explain', 'files.res', 'enabled.res', 'modwhy.res', 'unit.res', 'ticks.res'].every(i => ids.includes(i)) && /Read this crash|x\.dmp/.test(P.root.all(c => c.dataset.blk === 'files.res')[0].textContent), 'blocks: sections and result leaves ' + ids.join());
    // "Look again" reloads the Log files list, so it sits in that section (files.btns), not in the Explain box; it asks for the list again
    ok(ids.includes('files.btns') && /Look again/.test(txt('files.btns')) && !/Look again/.test(txt('explain.btns')) && txt('explain.btns').indexOf(en['logs.btn.last']) >= 0,'blocks: Look again is in the Log files section, not in Explain: ' + JSON.stringify([txt('explain.btns'), txt('files.btns')]));
    const nFind = () => P.sent.filter(x => /\/logs\/find$/.test(x.url)).length, before = nFind();
    btn('logs.btn.refresh').click(); await settle();
    ok(nFind() === before + 1 && /game\.log/.test(txt('files.res')), 'blocks: Look again asks for the log list again and redraws it');
    // the hint for no folders names the button of its own section
    const noFolders = FD.runPage('logs', KIT + X.script, X.lang, { route: u => (/find$/.test(u.split('?')[0]) ? { instances: [] } : canned[u.split('?')[0].split('/').pop()]), S: { mod: '' }, env: { fmtBytes: n => n + ' B', gameDir: () => '', curGame: () => ({}) } });
    noFolders.screen.focus(); for (let i = 0; i < 4; i++) await FD.settle();
    const fsec = noFolders.root.all(c => c.dataset.blk === 'files')[0];
    ok(fsec && fsec.textContent.indexOf(en['logs.nofolders']) >= 0 && fsec.textContent.indexOf(en['logs.btn.refresh']) >= 0, 'blocks: the no-folders hint and the Look again button are in one section');
  }
  // game parity (MoW:AS2 and GoH branches): its own file, own scratch folder
  {
    const g = cp.spawnSync(process.execPath, [path.join(__dirname, 'test-games.js'), path.join(work, 'games')], { encoding: 'utf8', timeout: 600000, maxBuffer: 32 << 20 });
    const out = String(g.stdout || '') + String(g.stderr || '');
    ok(g.status === 0 && /logs games PASS/.test(out), 'games: ' + out.trim().split(/\r?\n/).slice(-6).join(' | '));
  }
  // CACHE (gui README contract 1): the unit list takes the mod's files from the shared walk (lib/modtree) and the game's view from
  // lib/gameview: same keys in the same order as the folder walk; seen again after a touch; .git left out
  {
    const RT = require('./routes'), MT = require('../../../lib/modtree'), GV = require('../../../lib/gameview'); MT._reset({ store: null });
    const cm = path.join(work, 'cachemod'), gd = path.join(work, 'cachegame'), raw = (root, rel) => { const p = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, '{x}'); };
    for (const d of [cm, gd]) fs.rmSync(d, { recursive: true, force: true });   // a scratch folder used again starts clean (new.def below)
    ['mod.info', 'resource/entity/b/B.def', 'resource/entity/a_b/x.def', 'resource/entity/A/y.def', 'resource/entity/a.txt', 'resource/_x/q.png', 'resource/set/1.set', 'resource/set/10.set', 'resource/set/2.set', 'resource/.git/c', 'other/z.def'].forEach(r => raw(cm, r));
    raw(gd, 'resource/entity/g.def');
    const list = S => S.find(/./).filter(x => x.src === 'mod').map(x => x.key), keys = S => JSON.stringify(list(S));
    const vfs = require('../../../lib/vfs'), build0 = vfs.build; let builds = 0; vfs.build = o => { builds++; return build0(o); };
    const T = await MT.ensure(cm), a = RT.makeSource(cm, gd, undefined), b = RT.makeSource(cm, gd, undefined, T);
    ok(keys(a) === keys(b) && list(a).length === 8 && !list(a).some(k => /\.git|other/.test(k)), 'cache: the scan rows give the keys of the walk in the order of the walk: ' + keys(b));
    GV.get({ gameDir: gd }); vfs.build = build0;
    ok(builds === 1 && a.hasGame && b.hasGame && b.find(/g\.def$/).some(x => x.src === 'game'), 'cache: the game view is the shared lib/gameview one (built once for three asks)');
    raw(cm, 'resource/entity/new.def');
    ok(list(RT.makeSource(cm, gd, undefined, await MT.ensure(cm))).length === 8, 'cache: a young scan is used as it is');
    MT.touch(cm);
    ok(list(RT.makeSource(cm, gd, undefined, await MT.ensure(cm))).length === 9, 'cache: after a touch the folder is read again');
  }
  console.log(bad ? bad + ' failures' : 'logs ext PASS');
  process.exit(bad ? 1 : 0);
})().catch(x => { console.log('FAIL ' + (x.stack || x)); process.exit(1); });
