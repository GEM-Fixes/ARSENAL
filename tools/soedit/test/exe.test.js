// soedit --exe test: AS64 and MoW:AS2 share one install; the fixture game holds as64.exe, mowas_2.exe and an as64/core tree with
// a model of its own (coretank) and a copy of tank1.def pointing at another model. With no exe (or exe as64) the as64/core files
// are seen, with exe mowas_2 / mowas2 they are not: stage.openSource, target.resolve, modelindex build / listFolder / sig /
// cacheFile, stage (record.exe, texture cache folder), check linters (--exe to expcheck only for a game other than AS64), the
// soedit command line (--exe, --exe goh taken), sceneload.load and edit/core open (lib/model).
// Synthetic files only (mkfixture.js), in a temp dir.
// Author: Imperator_Aug (ARSENAL, ia-cf66eacd)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const { make } = require('./mkfixture');
const S = require('../stage'), T = require('../target'), MI = require('../modelindex'), C = require('../check');
const sceneload = require('../../lib/model/sceneload'), core = require('../../lib/model/edit/core');

let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}\n  got  ${JSON.stringify(a)}\n  want ${JSON.stringify(b)}`);
const SOEDIT = path.join(__dirname, '..', 'soedit.js');
const cli = args => cp.spawnSync(process.execPath, [SOEDIT, ...args], { encoding: 'utf8', env: Object.assign({}, process.env, { AS2_NO_STEAM: '1' }) });
const crlf = s => Buffer.from(s.replace(/\r?\n/g, '\r\n'), 'latin1');
const quiet = () => { const out = []; return { log: s => out.push(s), out }; };

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'soedit-exe-test-'));
try {
  const fx = make(path.join(root, 'fx'));
  const put = (rel, buf) => { const p = path.join(fx.game, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); };
  put('as64.exe', Buffer.from('MZ fake'));
  const CT = 'resource/entity/vehicle/coretank/';
  put('as64/core/' + CT + 'coretank.def', crlf('{game_entity\n\t{Extension "coretank.mdl"}\n}\n'));
  put('as64/core/' + CT + 'coretank.mdl', crlf('{Skeleton\n\t{bone "basis"}\n}\n'));
  // as64/core overrides the vanilla tank1 def: as64 sees coretank.mdl as tank1's model, MoW:AS2 the vanilla one
  put('as64/core/' + fx.T + 'tank1.def', crlf('{game_entity\n\t{Extension "/entity/vehicle/coretank/coretank.mdl"}\n}\n'));

  // 1. openSource: the as64/core layer only for as64
  for (const [exe, want] of [[undefined, true], ['as64', true], ['mowas_2', false], ['mowas2', false]]) {
    const src = S.openSource({ game: fx.game, exe });
    eq([src.has(CT + 'coretank.mdl'), src.v.exe], [want, exe === 'mowas2' ? 'mowas_2' : exe || 'as64'], `openSource exe ${exe}: as64/core model seen ${want}`);
    src.close();
  }

  // 2. target.resolve: entity tank1 -> its model per game (the entity index too: one cache per exe)
  for (const [exe, want] of [[undefined, CT + 'coretank.mdl'], ['mowas_2', fx.T + 'tank1.mdl']]) {
    const t = T.resolve({ target: 'tank1', game: fx.game, exe });
    eq(t.mdlKey, want, `resolve tank1 with exe ${exe}`);
    if (t.src) t.src.close();
  }
  const tc = T.resolve({ target: 'coretank', game: fx.game, exe: 'mowas_2' });
  ok(tc.error && /No entity named "coretank"/.test(tc.error), 'resolve: an as64/core-only entity is not there for MoW:AS2: ' + tc.error);

  // 3. modelindex: rows, meta.exe, sig and cache file per exe (no exe and as64: the old answers)
  const a = MI.build({ game: fx.game }), m = MI.build({ game: fx.game, exe: 'mowas_2' });
  ok(a.rows.some(r => r.name === 'coretank') && !m.rows.some(r => r.name === 'coretank'), 'modelindex: coretank for as64 only');
  ok(a.meta.exe === undefined && m.meta.exe === 'mowas_2', 'modelindex meta.exe only when exe was given');
  eq(MI.sig(fx.game, null, []), MI.sig(fx.game, null, [], 'as64'), 'sig: exe as64 = no exe');
  ok(MI.sig(fx.game, null, []) !== MI.sig(fx.game, null, [], 'mowas_2') && MI.sig(fx.game, null, [], 'mowas2') === MI.sig(fx.game, null, [], 'mowas_2'), 'sig: mowas_2 differs, mowas2 = mowas_2');
  eq(MI.cacheFile(fx.game, null, []), MI.cacheFile(fx.game, null, [], 'as64'), 'cacheFile: exe as64 = no exe');
  ok(MI.cacheFile(fx.game, null, []) !== MI.cacheFile(fx.game, null, [], 'mowas_2'), 'cacheFile: mowas_2 has its own file');
  const fa = MI.listFolder({ path: path.join(fx.game, 'resource', 'entity', 'vehicle', 'tank1'), game: fx.game });
  const fm = MI.listFolder({ path: path.join(fx.game, 'resource', 'entity', 'vehicle', 'tank1'), game: fx.game, exe: 'mowas_2' });
  eq([fa.results.find(r => r.name === 'tank1').model, fm.results.find(r => r.name === 'tank1').model], [fx.T + 'tank1.mdl', fx.T + 'tank1.mdl'], 'listFolder: the def in the folder names its own model (both games)');

  // 4. stage: MoW:AS2 stages the vanilla tank1 file set, record.exe, its own texture cache folder
  let q = quiet();
  let r = S.stage({ target: 'tank1', out: fx.mod, game: fx.game, exe: 'mowas_2', dry: true, log: q.log });
  eq([r.code, r.record.model, r.record.exe], [0, fx.T + 'tank1.mdl', 'mowas_2'], 'stage --exe mowas_2: vanilla model, record.exe');
  q = quiet();
  r = S.stage({ target: 'tank1', out: fx.mod, game: fx.game, dry: true, log: q.log });
  eq([r.code, r.record.model, 'exe' in r.record], [0, CT + 'coretank.mdl', false], 'stage with no exe: as before (as64 view, no record.exe)');
  eq(S.defaultCache(fx.game, []), S.defaultCache(fx.game, [], 'as64'), 'defaultCache: as64 = no exe');
  ok(S.defaultCache(fx.game, []) !== S.defaultCache(fx.game, [], 'mowas_2'), 'defaultCache: mowas_2 has its own folder');

  // 5. check linters: --exe only for a game other than AS64
  const calls = [];
  const run = (script, args) => { calls.push([path.basename(script), args]); return { findings: [] }; };
  const rep = { info() {}, add() {} };
  C.linters(fx.mod, ['x'], fx.game, rep, run);
  C.linters(fx.mod, ['x'], fx.game, rep, run, 'as64');
  C.linters(fx.mod, ['x'], fx.game, rep, run, 'mowas2');
  const ex = calls.filter(c => c[0] === 'expcheck.js').map(c => c[1].slice(7));
  eq(ex, [[], [], ['--exe', 'mowas_2']], 'linters: expcheck gets --exe mowas_2 only for MoW:AS2');

  // 6. command line: --exe on index/find, --exe goh taken, a bad word refused
  const idx = path.join(root, 'ix.json');
  let c = cli(['index', '--game', fx.game, '--exe', 'mowas_2', '--out', idx]);
  ok(c.status === 0 && !JSON.parse(fs.readFileSync(idx, 'utf8')).rows.some(x => x.name === 'coretank'), 'cli index --exe mowas_2: ' + c.stdout + c.stderr);
  c = cli(['find', 'coretank', '--game', fx.game, '--exe', 'mowas_2']);
  ok(c.status === 0 && /^0 found/.test(c.stdout), 'cli find --exe mowas_2: no coretank: ' + c.stdout);
  c = cli(['find', 'coretank', '--game', fx.game]);
  ok(c.status === 0 && /^1 found/.test(c.stdout), 'cli find with no exe: coretank (as64 view): ' + c.stdout);
  c = cli(['stage', 'tank1', '--game', fx.game, '--out', fx.mod, '--exe', 'goh']);
  ok(!/not available for GoH/.test(c.stdout + c.stderr), 'cli stage --exe goh: not refused (SOEdit works with GoH, owner 2026-11-15): ' + c.stdout + c.stderr);
  c = cli(['ops', 'ply', 'info', 'x.ply', '--exe', 'goh']);
  ok(!/not available for GoH/.test(c.stdout + c.stderr), 'cli ops --exe goh: not refused: ' + c.stdout + c.stderr);
  c = cli(['index', '--game', fx.game, '--exe', 'mow3']);
  ok(c.status === 2 && /--exe must be/.test(c.stderr), 'cli --exe with a word that names no game: exit 2');

  // 7. lib/model: sceneload and the edit core read the named game's view
  let L = sceneload.load('tank1', { game: fx.game, exe: 'mowas_2', indexCache: path.join(root, 'ixc.json') });
  eq(L.key, fx.T + 'tank1.mdl', 'sceneload exe mowas_2: tank1 is the vanilla model'); if (L.files) L.files.close();
  L = sceneload.load('tank1', { game: fx.game, indexCache: path.join(root, 'ixc.json') });
  eq(L.key, CT + 'coretank.mdl', 'sceneload no exe: as before (as64 view)'); if (L.files) L.files.close();
  L = sceneload.load(CT + 'coretank.mdl', { game: fx.game, exe: 'mowas_2' });
  ok(L.error && !L.scene, 'sceneload exe mowas_2: an as64/core model is not there');
  const doc = core.open({ mod: fx.mod, target: 'tank1', game: fx.game, exe: 'mowas_2' });
  eq([doc.mdl, doc.exe], [fx.T + 'tank1.mdl', 'mowas_2'], 'edit core open exe mowas_2: vanilla model, doc.exe');
  core.close(doc.id);
  let err = null; try { core.open({ mod: fx.mod, target: 'tank1', game: fx.game, exe: 'goh' }); } catch (e) { err = e; }
  ok(!err || !/not available for GoH/.test(err.message), 'edit core open exe goh: not refused: ' + (err && err.message));
} finally {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { /* temp */ }
}
console.log(`soedit exe: ${n - fails}/${n} ok`);
if (fails) { console.log('FAIL'); process.exit(1); }
