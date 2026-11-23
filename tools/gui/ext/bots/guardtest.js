// GUI-EXT bots: the write guard held against every POST route of /api/x/bots (frame and parts; ext/unitai and ext/mapai have no routes).
// Table driven: each route x each bad mod folder (a ".." path to a plain folder, a plain folder, the sibling <mod>2, the game folder,
// its resource and its mods root) must refuse and leave the whole fixture tree byte for byte; each route that takes a file name is also
// fed names that climb out of the mod. Routes with a body that really writes (CONTROL) prove it on the good mod first, so a refusal is
// the guard's work and not a body the route would never have written. Called from test.js: run(work, ok) -> number of checks.
// Author: Imperator_Aug (ARSENAL, ia-3e4aa8ef)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');

module.exports = async function run(work, ok) {
  const X = require('./index'), lib = require('./lib'), R = X.routes;
  const T = path.join(__dirname, '..', '..', '..'), FX = path.join(T, 'botrecipe', 'test', 'chainn3');
  const W = (p, t) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t, 'latin1'); };
  const root = path.join(work, 'guard'), tree = path.join(root, 'tree'), keep = path.join(root, 'keep');
  const game = path.join(tree, 'game'), plain = path.join(tree, 'plain'), good = path.join(plain, 'mods', 'mod'), sib = good + '2';
  let n = 0; const t = (c, m) => { n++; ok(c, 'guard: ' + m); };

  // one mod's files: the chainn3 mod, the stock bot list, a difficulty file
  const fill = d => {
    fs.cpSync(path.join(FX, 'mod'), d, { recursive: true });
    fs.cpSync(path.join(FX, 'stock', 'script'), path.join(d, 'resource', 'script'), { recursive: true });
    fs.rmSync(path.join(d, 'resource', 'script', 'multiplayer', 'bot.lua'), { force: true });
    W(path.join(d, 'resource', 'set', 'multiplayer', 'games', 'bots_generic.inc'), '{easy\r\n\t{balancingFactorBonus {cp 0.75} {mp 0.75} {payback 0.75} }\r\n}\r\n{normal\r\n\t{balancingFactorBonus {cp 1.00} {mp 1.00} {payback 1.00} }\r\n}\r\n');
    W(path.join(d, 'resource', 'set', 'multiplayer', 'games', 'frontlines.set'), '{game\r\n\t{name "frontlines"}\r\n}\r\n');
  };
  fs.rmSync(root, { recursive: true, force: true });
  fill(plain); fill(good); fill(sib);                       // plain and <mod>2 hold no mod.info
  W(path.join(good, 'mod.info'), '{mod\r\n\t{name "good"}\r\n}\r\n');
  fs.mkdirSync(path.join(game, 'resource'), { recursive: true }); fs.writeFileSync(path.join(game, 'as64.exe'), '');
  fill(path.join(game, 'mods', 'real')); W(path.join(game, 'mods', 'real', 'mod.info'), '{mod\r\n}\r\n');
  fs.cpSync(tree, keep, { recursive: true });
  const fresh = () => { fs.rmSync(tree, { recursive: true, force: true }); fs.cpSync(keep, tree, { recursive: true }); };

  const snap = () => {
    const out = [];
    const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) { const p = path.join(d, e.name); if (e.isSymbolicLink()) out.push('l ' + p); else if (e.isDirectory()) { out.push('d ' + p); walk(p); } else out.push('f ' + p + ' ' + crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex')); } };
    walk(tree); return out.join('\n');
  };
  const ctx = {
    game: () => game, allowLaunch: false, gamedir: null, tools: T, tmpRoot: path.join(root, 'tmp'),
    runTool: async (tool, entry, args) => { const r = cp.spawnSync(process.execPath, [path.join(T, entry)].concat(args), { encoding: 'utf8' }); return { code: r.status, stdout: r.stdout, stderr: r.stderr, timedOut: false }; },
  };
  const U = q => ({ searchParams: new URLSearchParams(q) });
  // -> {refused, res}: a throw with a 4xx status, or an answer that says ok:false (the parts that never throw)
  const call = async (key, body) => {
    try { const res = await R[key](key.startsWith('GET') ? U(body) : null, key.startsWith('GET') ? null : body, ctx); return { refused: !!res && res.ok === false && !res.written && !res.wrote, res }; }
    catch (e) { return { refused: (e.status || 400) >= 400 && (e.status || 400) < 500, err: e }; }
  };

  const GEN = 'set/multiplayer/games/bots_generic.inc', BOT = 'script/multiplayer/bot.data.lua';
  const tb = await R['GET /api/x/bots/table'](U('mod=' + encodeURIComponent(good) + '&file=bots_generic.inc'), null, ctx);
  const editId = ((tb.rows || []).find(r => /cp/.test(r.id)) || (tb.rows || [])[0] || {}).id;
  const st = await R['GET /api/x/bots/stages/read'](U('mod=' + encodeURIComponent(good)), null, ctx);
  t(!!editId && st && st.ok, 'the fixture reads (a difficulty row, the stage list)');

  // route -> the body that writes (mod filled in per case). CONTROL = proved to write on the good mod. before(mod) = a write the body needs first
  const BODY = {
    'POST /api/x/bots/edit': m => ({ mod: m, file: 'bots_generic.inc', changes: { [editId]: '0.5' }, write: true }),
    'POST /api/x/bots/reset': m => ({ mod: m, file: 'bots_generic.inc', write: true }),
    'POST /api/x/bots/buyfirst': m => ({ mod: m, unit: 'bedford_art', cls: 'Vehicle', first: true, write: true }),
    'POST /api/x/bots/undo': m => ({ mod: m, undo: [{ rel: GEN }] }),
    'POST /api/x/bots/stages/write': m => ({ mod: m, ops: [{ op: 'squad', value: '6' }] }),
    'POST /api/x/bots/stages/undo': m => ({ mod: m }),
    'POST /api/x/bots/recipes/write': m => ({ mod: m, settings: { attack: { on: true, size: 3 } } }),
    'POST /api/x/bots/recipes/remove': m => ({ mod: m, write: true }),
    'POST /api/x/bots/recipes/undo': m => ({ mod: m }),
    'POST /api/x/bots/buycheck/fix': m => ({ mod: m, id: 'x', how: 'remove', write: true }),
    'POST /api/x/bots/buycheck/undo': m => ({ mod: m, rel: BOT }),
    'POST /api/x/bots/targets/change': m => ({ mod: m, file: 'ammo.set', actions: [{ op: 'preset', id: 'mgTank' }], write: true }),
    'POST /api/x/bots/targets/reset': m => ({ mod: m, file: 'ammo.set', write: true }),
    'POST /api/x/bots/brain/edit': m => ({ mod: m, changes: { 'recognize-time': '0.25' }, write: true }),
    'POST /api/x/bots/brain/reset': m => ({ mod: m, ids: null, write: true }),
    'POST /api/x/bots/modeready/allow': m => ({ mod: m, mode: 'frontlines', write: true }),
    'POST /api/x/bots/modeready/undo': m => ({ mod: m, mode: 'frontlines' }),
    'POST /api/x/bots/mission/add': m => ({ mod: m, map: 'multi/1v1_x', mode: 'frontlines', items: [{ recipe: 'd', p: { minute: 2, at: { kind: 'xy', x: '10', y: '40' } } }], write: true }),
    'POST /api/x/bots/mission/remove': m => ({ mod: m, map: 'multi/1v1_x', mode: 'frontlines', id: 'd1', write: true }),
    'POST /api/x/bots/mission/undo': m => ({ mod: m, map: 'multi/1v1_x', mode: 'frontlines', undo: { ids: ['d1'], after: 'a'.repeat(40), before: 'b'.repeat(40) } }),
  };
  const BEFORE = {
    'POST /api/x/bots/undo': m => R['POST /api/x/bots/edit'](null, BODY['POST /api/x/bots/edit'](m), ctx),
    'POST /api/x/bots/stages/undo': m => R['POST /api/x/bots/stages/write'](null, BODY['POST /api/x/bots/stages/write'](m), ctx),
    'POST /api/x/bots/recipes/remove': m => R['POST /api/x/bots/recipes/write'](null, BODY['POST /api/x/bots/recipes/write'](m), ctx),
    'POST /api/x/bots/recipes/undo': m => R['POST /api/x/bots/recipes/write'](null, BODY['POST /api/x/bots/recipes/write'](m), ctx),
  };
  const CONTROL = ['POST /api/x/bots/edit', 'POST /api/x/bots/reset', 'POST /api/x/bots/buyfirst', 'POST /api/x/bots/undo', 'POST /api/x/bots/stages/write',
    'POST /api/x/bots/stages/undo', 'POST /api/x/bots/recipes/write', 'POST /api/x/bots/recipes/remove', 'POST /api/x/bots/recipes/undo'];
  // routes that write nothing into a mod: previews, plans, the bot match (its scenario goes to the temp folder; the launch is off)
  const NOWRITE = ['POST /api/x/bots/stages/preview', 'POST /api/x/bots/recipes/preview', 'POST /api/x/bots/botmatch/plan', 'POST /api/x/bots/botmatch/start',
    'POST /api/x/bots/botmatch/stop'];   // stop: the registry cancel of the running match, no file touched

  const posts = Object.keys(R).filter(k => k.startsWith('POST '));
  t(posts.every(k => BODY[k] || NOWRITE.includes(k)), 'every POST route is in the table: ' + posts.filter(k => !BODY[k] && !NOWRITE.includes(k)).join(' '));
  t(Object.keys(BODY).concat(NOWRITE).every(k => R[k]), 'the table names real routes: ' + Object.keys(BODY).concat(NOWRITE).filter(k => !R[k]).join(' '));
  for (const id of ['unitai', 'mapai']) t(Object.keys(require('../' + id).routes || {}).length === 0, id + ' has no routes of its own');

  const BADMODS = [
    ['a ".." path to a plain folder', good + '/../..'],
    ['the same with backslashes', good + '\\..\\..'],
    ['a plain folder (no mod.info)', plain],
    ['the sibling <mod>2', sib],
    ['the game folder', game],
    ['the game resource folder', path.join(game, 'resource')],
    ['the game mods root', path.join(game, 'mods')],
    ['a ".." path to the game folder', path.join(game, 'mods', 'real') + '/../..'],
    ['a ".." path to the game resource', path.join(game, 'mods', 'real') + '/../../resource'],
  ];
  const audit = [];
  for (const key of posts) {
    const body = BODY[key] || (m => ({ mod: m, write: true }));
    // control: the body writes on the good mod
    let control = false;
    if (CONTROL.includes(key)) {
      fresh(); if (BEFORE[key]) await BEFORE[key](good);
      const s0 = snap(), r = await call(key, body(good));
      control = snap() !== s0;
      t(control && !r.refused, key + ' control: the body writes on a real mod ' + ((r.err && r.err.message) || JSON.stringify(r.res || '').slice(0, 200)));
    }
    fresh();
    for (const [what, m] of BADMODS) {
      // the write a later step needs is tried on the bad folder too (it is refused, or the route under test is)
      if (BEFORE[key]) { try { await BEFORE[key](m); } catch (e) { /* refused */ } }
      const s0 = snap(), r = await call(key, body(m)), same = snap() === s0;
      t(same, key + ' wrote with ' + what);
      if (BODY[key]) t(r.refused, key + ' not refused with ' + what + ': ' + JSON.stringify(r.res || '').slice(0, 160));
      if (!same) fresh();
    }
    audit.push(key + (control ? ' (control)' : ''));
  }

  // file names that climb out of the mod, on the good mod: refused, nothing touched (the sibling holds the very file each would hit)
  fresh();
  const up = '../../mod2/resource/';
  const RELS = ['../../../' + '../../mod2/resource/set/multiplayer/games/bots_generic.inc', '..\\..\\..\\..\\..\\mod2\\resource\\set\\multiplayer\\games\\bots_generic.inc', path.join(sib, 'resource', GEN), '/x.inc', '../bots_generic.inc'];
  const RELROUTES = [
    ['POST /api/x/bots/edit', f => ({ mod: good, file: f, changes: {}, write: true })],
    ['POST /api/x/bots/reset', f => ({ mod: good, file: f, write: true })],
    ['POST /api/x/bots/undo', f => ({ mod: good, undo: [{ rel: f }] })],
    ['GET /api/x/bots/undo', f => 'mod=' + encodeURIComponent(good) + '&rel=' + encodeURIComponent(f)],
    ['POST /api/x/bots/targets/change', f => ({ mod: good, file: f, actions: [], write: true })],
    ['POST /api/x/bots/targets/reset', f => ({ mod: good, file: f, write: true })],
    ['POST /api/x/bots/buycheck/undo', f => ({ mod: good, rel: f })],
    ['POST /api/x/bots/modeready/allow', f => ({ mod: good, mode: f, write: true })],
    ['POST /api/x/bots/modeready/undo', f => ({ mod: good, mode: f })],
    ['POST /api/x/bots/mission/add', f => ({ mod: good, map: f, mode: 'frontlines', items: [{ recipe: 'd', p: {} }], write: true })],
    ['POST /api/x/bots/mission/remove', f => ({ mod: good, map: f, mode: 'frontlines', id: 'd1', write: true })],
    ['POST /api/x/bots/mission/undo', f => ({ mod: good, map: 'multi/x', mode: f, undo: { ids: ['d1'], after: 'a'.repeat(40), before: 'b'.repeat(40) } })],
  ];
  for (const [key, mk] of RELROUTES) for (const f of RELS.concat([up + GEN])) {
    const s0 = snap(), r = await call(key, mk(f));
    t(snap() === s0, key + ' touched a file with the name ' + f);
    t(r.refused, key + ' took the file name ' + f + ': ' + JSON.stringify(r.res || '').slice(0, 160));
  }

  // the guard itself
  const thrown = fn => { try { fn(); return ''; } catch (e) { return e.key || 'threw'; } };
  for (const r of ['../x.set', 'a/../../x.set', 'C:/x.set', '/x.set', 'a//b', './a', '', 'a\\..\\..\\b']) t(thrown(() => lib.safeRel(r)) === 'bots.e.badPath', 'safeRel refuses ' + JSON.stringify(r));
  t(lib.safeRel('set\\multiplayer\\games\\a.set') === 'set/multiplayer/games/a.set', 'safeRel keeps a plain path');
  t(lib.safeFile(good, GEN) === path.join(good, 'resource', ...GEN.split('/')), 'safeFile gives the file inside the mod');
  t(thrown(() => lib.guardFile(good, path.join(sib, 'resource', 'x.set'))) === 'bots.e.outside', 'guardFile: <mod>2 is not inside <mod>');
  t(thrown(() => lib.guardFile(good, good)) === 'bots.e.outside', 'guardFile: the mod folder itself is no file inside it');
  t(thrown(() => lib.modPath(good, '../../mod2/resource/x.set')) === 'bots.e.badPath', 'modPath refuses a name that climbs out');
  t(thrown(() => lib.checkWrite(ctx, good + '/../..')) === 'bots.e.notMod', 'checkWrite: a ".." path is judged as the folder it is (no mod.info)');
  t(thrown(() => lib.checkWrite(ctx, sib)) === 'bots.e.notMod', 'checkWrite: <mod>2 without mod.info');
  t(lib.checkWrite(ctx, good + '/../mod') === good && lib.checkWrite(ctx, good, [GEN, BOT]) === good, 'checkWrite: the real mod passes and comes back normalised');
  t(thrown(() => lib.checkWrite(ctx, good, ['../../x'])) === 'bots.e.badPath', 'checkWrite holds its file list to the mod');
  // a link inside the mod that leads out of it
  let linked = false;
  try { fs.symlinkSync(path.join(sib, 'resource', 'set'), path.join(good, 'resource', 'out'), 'junction'); linked = true; } catch (e) { /* links not allowed here */ }
  if (linked) {
    t(thrown(() => lib.safeFile(good, 'out/multiplayer/games/bots_generic.inc')) === 'bots.e.outside', 'safeFile follows a link that leaves the mod');
    const s0 = snap(); let e = null;
    try { lib.undo.save(ctx, good, 'out/multiplayer/games/bots_generic.inc'); } catch (x) { e = x; }
    t(e && e.key === 'bots.e.outside' && snap() === s0, 'undo.save refuses a file behind such a link');
    fs.rmSync(path.join(good, 'resource', 'out'), { force: true });
  }
  fs.rmSync(root, { recursive: true, force: true });
  return { n, audit };
};
