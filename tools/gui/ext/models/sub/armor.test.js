// models armor part test: the four languages have the same keys and slots (models.armor.* + models.sub.armor); the client string
// obeys the page rules, parses and runs with stub globals; every route builds exactly the expected argv through a stub runTool
// (table; shot by --from/--aim, --aim-volume and by --origin/--dir; map with a view and a grid; edit with and without --shared and
// --dry); refusals (edit without a mod, mm out of range, a side not in the list, a weapon starting with "-", grid too large, range
// too far, a lone origin); the map cache answers a second identical call without the tool, and an edit drops it; the pure client
// helpers (cell -> ray, mm -> colour, result -> lang key, penetration at range). Synthetic folders only; no game, no armorsim run.
// usage: node armor.test.js <scratch dir>
// Author: Imperator_Aug (ARSENAL, ia-834c4e8e)
const fs = require('fs'), path = require('path'), assert = require('assert');
const scratch = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'models-armor-test'));
require('../../../../lib/testscratch').guard(scratch);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(scratch, { recursive: true, force: true }); fs.mkdirSync(scratch, { recursive: true });
const S = require('./armor.server'), script = require('./armor.client'), L = require('./armor.lang.json');
const game = path.join(scratch, 'game'), mod = path.join(scratch, 'mymod');
fs.mkdirSync(path.join(game, 'mods'), { recursive: true }); fs.mkdirSync(mod, { recursive: true });
const DEF = 'resource/entity/-vehicle/tank/t34/t34.def';

const TABLE = { unit: 't34', key: DEF, rows: [{ name: 'body', id: 'basis/body', sides: [{ side: 'front', mm: 45, rule: 'own', at: DEF + ':3' }], flags: [] }], summary: {} };
let calls = [], reply = args => ({ code: 0, stdout: JSON.stringify(args[0] === 'table' ? TABLE : args[0] === 'edit' ? { ok: true, changes: [{ key: DEF, line: 3, before: '45', after: '60' }] } : { unit: 't34', grid: { w: 4, h: 4 }, cells: [] }), stderr: '' });
const ctx = { game: () => game, tmpRoot: path.join(scratch, 'tmp'), runTool: async (tool, entry, args, o) => { calls.push({ tool, entry, args, o }); return reply(args); } };
const last = () => calls[calls.length - 1];
const call = (verb, body) => S.routes['POST /api/x/models/armor/' + verb]('/api/x/models/armor/' + verb, body, ctx);
const refuses = async (verb, body, re) => { const before = calls.length; try { await call(verb, body); } catch (e) { assert.strictEqual(e.status, 400, verb + ': ' + e.message); assert.ok(re.test(e.message), verb + ': ' + e.message); assert.strictEqual(calls.length, before, 'tool not called'); return; } assert.fail(verb + ' was not refused: ' + JSON.stringify(body)); };
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };
const G = ['--game', game], F = ['--folder', mod];

(async () => {
  // ---------- languages ----------
  const en = Object.keys(L.en).sort();
  assert.deepStrictEqual(Object.keys(L).sort(), ['en', 'ru', 'uk', 'zh']);
  for (const l of ['ru', 'uk', 'zh']) assert.deepStrictEqual(Object.keys(L[l]).sort(), en, 'same keys in ' + l);
  for (const l of Object.keys(L)) for (const k of en) {
    assert.ok(k.startsWith('models.armor.') || k === 'models.sub.armor', k); assert.ok(L[l][k] && L[l][k].trim(), l + ' ' + k);
    assert.deepStrictEqual((L[l][k].match(/\{\w+\}/g) || []).sort(), (L.en[k].match(/\{\w+\}/g) || []).sort(), 'slots ' + l + ' ' + k);
    assert.ok(!/ [–—-] /.test(L[l][k]), 'no dash as punctuation ' + l + ' ' + k);
  }
  const need = [];
  for (const s of ['front', 'top', 'left', 'right', 'rear', 'bottom', 'all']) need.push('models.armor.side.' + s);
  for (const v of S._t.VIEWS) need.push('models.armor.view.' + v);
  for (const c of 'PRNDMJOX') need.push('models.armor.res.' + c);
  for (const c of 'PRNDMJOG') need.push('models.armor.v.' + c, 'models.armor.res.' + c);
  for (const k of ['ap', 'apcr', 'he', 'heat', 'smoke', 'other']) need.push('models.armor.kind.' + k);
  for (const k of ['through', 'bounce', 'stop', 'none']) need.push('models.armor.cat.' + k);
  for (const k of ['area', 'notInModel', 'noArmor', 'modelOnly']) need.push('models.armor.flag.' + k);
  for (const k of ['volume', 'side', 'nominal', 'angle', 'effective', 'left', 'what']) need.push('models.armor.col.' + k);
  for (const g of S._t.GUN_DIRS) need.push('models.armor.grp.' + g.replace('/', '_'));
  for (const k of need) assert.ok(L.en[k], 'dynamic key ' + k);
  const base = require('../lang.json').en;
  for (const k of en) assert.ok(!(k in base), 'no clash with ../lang.json ' + k);
  ok('4 languages, ' + en.length + ' keys each, same slots, every side/view/result/kind/group key present');

  // ---------- client string ----------
  assert.strictEqual(typeof script, 'string');
  assert.ok(!/[`]|\$\{|innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(script), 'page rules');
  assert.ok(/^\s*\(function\(\)\{/.test(script) && /\}\)\(\);\s*$/.test(script), 'one function, no new global names');
  for (const m of script.matchAll(/\btx\('([a-zA-Z0-9_.]+)'/g)) if (!m[1].endsWith('.')) assert.ok(L.en[m[1]], 'tx key ' + m[1]);
  for (const m of script.matchAll(/\btx\(\w+\?'([a-zA-Z0-9_.]+)':'([a-zA-Z0-9_.]+)'/g)) { assert.ok(L.en[m[1]], m[1]); assert.ok(L.en[m[2]], m[2]); }
  for (const m of script.matchAll(/\b(?:tk|k2)\('([a-z.]+)',/g)) assert.ok(en.some(k => k.startsWith(m[1] + '.')), 'tk prefix ' + m[1]);
  for (const m of script.matchAll(/\btx\(\['([a-z.]+)',/g)) assert.ok(en.some(k => k.startsWith(m[1] + '.')), 'tx join prefix ' + m[1]);
  assert.ok(!/\btx\('[a-zA-Z0-9_.]*\.'/.test(script), 'no tx(prefix + x): ../test.js reads every tx literal as a whole key');
  const EXT = { models: { subs: {}, parts: {} } }, store = {};
  new Function('EXT_SCREENS', 'LS', 'tx', 'api', 'S', 'h', script)(EXT, { get: (k, d) => k in store ? store[k] : d, set: (k, v) => { store[k] = v; } }, k => k, () => Promise.resolve({}), { cur: 'models' }, () => ({}));
  assert.strictEqual(typeof EXT.models.subs.armor, 'function');
  const fakeEl = (tag, a, kids) => ({ tag, a: a || {}, kids: kids || [], appendChild(c) { this.kids.push(c); return c; } });
  const texts = o => [o.a && o.a.text].concat((o.kids || []).flatMap(c => typeof c === 'object' ? texts(c) : [c])).filter(Boolean);
  let body = fakeEl('div');
  EXT.models.subs.armor({ body, set: { target: 't34' }, mod: null, el: fakeEl, clear() {}, say() {}, k2: (a, b) => a + '.' + b });
  assert.ok(texts(body).includes('models.armor.needMod'), 'no mod: one sentence');
  body = fakeEl('div');
  EXT.models.subs.armor({ body, set: {}, mod, el: fakeEl, clear() {}, say() {}, k2: (a, b) => a + '.' + b });
  assert.ok(texts(body).includes('models.armor.needUnit'), 'no unit: one sentence');
  ok('client string: page rules, every tx key exists, runs with stub globals, no-mod and no-unit sentences');

  // ---------- pure helpers ----------
  const T = EXT.models.subs.armor._t;
  const grid = { w: 64, h: 48, origin: [5.1, -39.8, 53.4], right: [0, 1, 0], up: [0, 0, 1], cell: 1.25 };
  const r = T.cellRay(grid, 0, 0, 100);
  assert.deepStrictEqual(r.dir.map(x => x + 0), [-1, 0, 0], 'front view looks along -X');
  assert.deepStrictEqual(r.centre.map(x => Math.round(x * 1000) / 1000), [5.1, -39.175, 52.775]);
  assert.deepStrictEqual(r.origin.map(x => Math.round(x * 1000) / 1000), [105.1, -39.175, 52.775]);
  const r2 = T.cellRay(grid, 10, 20, 0);
  assert.deepStrictEqual(r2.centre.map(x => Math.round(x * 1000) / 1000), [5.1, -39.8 + 10.5 * 1.25, 53.4 - 20.5 * 1.25].map(x => Math.round(x * 1000) / 1000));
  assert.strictEqual(T.mmColor(0, 100), '#e8eef5'); assert.strictEqual(T.mmColor(100, 100), '#162e54'); assert.strictEqual(T.mmColor(500, 100), '#162e54');
  assert.ok(/^#[0-9a-f]{6}$/.test(T.mmColor(37, 100)) && T.mmColor(37, 100) !== T.mmColor(38.5, 100), 'graded');
  assert.strictEqual(T.resKey('P'), 'models.armor.res.P'); assert.strictEqual(T.resKey('ricochet'), 'models.armor.res.R');
  assert.strictEqual(T.resKey('no_penetration'), 'models.armor.res.N'); assert.strictEqual(T.resKey('no hit'), 'models.armor.res.X');
  assert.strictEqual(T.resKey('weird'), 'models.armor.res.unknown');
  assert.strictEqual(T.catOf('D'), 'stop'); assert.strictEqual(T.catOf('penetrate'), 'through'); assert.strictEqual(T.catOf('O'), 'none');
  const pen = [[10, 122], [50, 111], [100, 85], [175, 0]];
  assert.strictEqual(T.penAt(pen, 0), 122); assert.strictEqual(T.penAt(pen, 75), 98); assert.strictEqual(T.penAt(pen, 500), 0); assert.strictEqual(T.penAt([], 5), null);
  ok('helpers: cell -> ray (centre, -(right x up), pulled back), mm -> colour, result -> key, penetration at range');

  // ---------- GT-25: no engine cite, plain part names (real pz4h table flags, 2026-11-10) ----------
  const RAM = 'not hit by shells (ram volume: ables cleared at spawn (foo.cpp:633-637))';
  assert.strictEqual(T.flagKey(RAM), 'notHitRam'); assert.strictEqual(T.flagText(RAM, ''), 'models.armor.flag.notHitRam');
  assert.strictEqual(T.flagKey('not hit by shells ({disabled} at resource/entity/x.def:4)'), 'notHit');
  assert.strictEqual(T.flagKey('no shape (bone or .vol missing)'), 'noShape'); assert.strictEqual(T.flagKey('ray_cast_thickness'), 'rayCast');
  assert.strictEqual(T.flagKey('model only'), 'modelOnly');
  for (const k of ['notHit', 'notHitRam', 'noShape', 'rayCast']) assert.ok(L.en['models.armor.flag.' + k], 'flag key ' + k);
  assert.ok(!/\.cpp/.test(T.flagText('some new flag (why: foo.cpp:1-2)', '')), 'an unknown flag loses its engine cite');
  assert.strictEqual(T.plain('ram: ' + RAM), 'ram: not hit by shells (ram volume: ables cleared at spawn)');
  // a click meant as a shot: past the volumes shells never hit (an outer ram box around the hull), at the first one they do
  const NS = T.noShell({ join: { notHit: [{ id: 'basis/ram', name: 'ram', why: 'ram volume' }] }, rows: [{ name: 'skirt', id: 'basis/skirt', flags: ['not hit by shells ({disabled} at x.def:4)'] }, { name: 'body', id: 'basis/body', flags: [] }] });
  assert.deepStrictEqual(Object.keys(NS).sort(), ['i:basis/ram', 'i:basis/skirt', 'n:ram', 'n:skirt'], 'not hit: from join.notHit and the flagged rows');
  const HITS = { volume: 'basis/ram', point: [50, 0, 10], hits: [{ volume: 'basis/ram', name: 'ram', side: 0, point: [50, 0, 10], aim: [49.75, 0, 10] },
    { volume: 'basis/skirt', name: 'skirt', side: 0, point: [30, 0, 10], aim: [29.9, 0, 10] }, { volume: 'basis/body', name: 'body', side: 1, point: [20, 0, 10], aim: [19.75, 0, 10] }] };
  assert.deepStrictEqual(T.shellHit(HITS, NS), { volume: 'basis/body', side: 1, point: [19.75, 0, 10] }, 'click through the ram box and the skirt: the body, just inside its face');
  assert.strictEqual(T.shellHit({ volume: 'basis/ram', point: [50, 0, 10], hits: HITS.hits.slice(0, 2) }, NS), null, 'only volumes shells never hit: nothing');
  assert.strictEqual(T.shellHit({ volume: null, point: null, hits: [] }, NS), null, 'empty space: nothing');
  assert.deepStrictEqual(T.shellHit(HITS, {}).volume, 'basis/ram', 'no table yet: the first volume');
  assert.deepStrictEqual(T.shellHit({ volume: 'v', point: [1, 2, 3] }, NS), { volume: 'v', side: undefined, point: [1, 2, 3] }, 'a view without hits: its own point');
  assert.ok(['en', 'ru', 'uk', 'zh'].every(c => L[c]['models.armor.noShellHit'] && !/ [-–—] /.test(L[c]['models.armor.noShellHit'])), 'the nothing-hit message in every language');
  assert.strictEqual(T.plain('see foo.cpp:843-847 here'), 'see here');
  assert.strictEqual(T.partKey('mantled'), 'mantlet'); assert.strictEqual(T.partKey('body1'), 'hull'); assert.strictEqual(T.partKey('shieldl61'), 'shield');
  assert.strictEqual(T.partKey('ram'), 'ram'); assert.strictEqual(T.partKey('inventory'), null); assert.strictEqual(T.partWords('mantled'), 'models.armor.part.mantlet');
  for (const l of Object.keys(L)) for (const k of Object.keys(L[l])) assert.ok(!/\.(cpp|h):\d/.test(L[l][k]) && !/\bmantled\b/.test(L[l][k]), 'no engine cite or raw part name in ' + l + ' ' + k);
  ok('GT-25: flags in plain words (ram, switched off, no shape, path thickness), engine cites stripped, part names explained');

  // ---------- argv ----------
  let j = await call('table', { mod, target: 't34' });
  assert.deepStrictEqual(last().args, ['table', 't34', ...G, ...F, '--json']);
  assert.strictEqual(last().tool, 'armorsim'); assert.strictEqual(last().entry, 'armorsim/armorsim.js');
  assert.ok(j.raw && j.rows.length === 1 && j.cached === false);
  j = await call('table', { target: 't34' });
  assert.deepStrictEqual(last().args, ['table', 't34', ...G, '--json'], 'no mod: no --folder');
  const W = ['--weapon', '75mm_kwk40(l48)', '--ammo', 'bullet75.ap.ammo'];
  await call('shot', { mod, target: 't34', weapon: '75mm_kwk40(l48)', ammo: 'bullet75.ap.ammo', range: 100, az: 90, el: 10, aim: [1, 2.5, 3] });
  assert.deepStrictEqual(last().args, ['shot', 't34', ...W, '--range', '100', '--from', '90,10', '--aim', '1,2.5,3', ...G, ...F, '--json']);
  await call('shot', { mod, target: 't34', weapon: '75mm_kwk40(l48)', ammo: 'bullet75.ap.ammo', range: '250', aimVolume: 'basis/body' });
  assert.deepStrictEqual(last().args, ['shot', 't34', ...W, '--range', '250', '--from', '0,0', '--aim-volume', 'basis/body', ...G, ...F, '--json']);
  await call('shot', { mod, target: 't34', weapon: '75mm_kwk40(l48)', ammo: 'bullet75.ap.ammo', range: 100, origin: [105.1, -39.175, 52.775], dir: [-1, 0, 0] });
  assert.deepStrictEqual(last().args, ['shot', 't34', ...W, '--range', '100', '--origin', '105.1,-39.175,52.775', '--dir', '-1,0,0', ...G, ...F, '--json']);
  await call('map', { mod, target: 't34', weapon: '75mm_kwk40(l48)', ammo: 'bullet75.ap.ammo', range: 100, view: 'left', grid: '80x60' });
  assert.deepStrictEqual(last().args, ['map', 't34', ...W, '--range', '100', '--view', 'left', '--grid', '80x60', ...G, ...F, '--json']);
  await call('map', { mod, target: 't34', weapon: '75mm_kwk40(l48)', range: 100, view: '30, 15', grid: { w: 160, h: 120 } });
  assert.deepStrictEqual(last().args, ['map', 't34', '--weapon', '75mm_kwk40(l48)', '--range', '100', '--view', '30,15', '--grid', '160x120', ...G, ...F, '--json']);
  await call('edit', { mod, target: 't34', volume: 'basis/body', side: 'front', mm: 60, dry: true });
  assert.deepStrictEqual(last().args, ['edit', 't34', '--volume', 'basis/body', '--side', 'front', '--mm', '60', '--out', mod, ...G, ...F, '--dry', '--json']);
  j = await call('edit', { mod, target: 't34', volume: 'basis/body', side: 'ALL', mm: 60.5, shared: true });
  assert.deepStrictEqual(last().args, ['edit', 't34', '--volume', 'basis/body', '--side', 'all', '--mm', '60.5', '--out', mod, ...G, ...F, '--shared', '--json']);
  assert.ok(j.ok && j.dry === false && j.mod === mod);
  ok('argv: table, shot (--from/--aim, --aim-volume, --origin/--dir), map (view + grid, az,el view), edit (--dry, --shared)');

  // ---------- refusals ----------
  await refuses('edit', { target: 't34', volume: 'basis/body', side: 'front', mm: 60 }, /mod folder/i);
  await refuses('edit', { mod, target: 't34', volume: 'basis/body', side: 'front', mm: 1001 }, /mm/);
  await refuses('edit', { mod, target: 't34', volume: 'basis/body', side: 'front', mm: 'abc' }, /number/);
  await refuses('edit', { mod, target: 't34', volume: 'basis/body', side: 'side', mm: 60 }, /side/i);
  await refuses('edit', { mod, target: 't34', volume: '-x', side: 'front', mm: 60 }, /cannot start/);
  await refuses('shot', { mod, target: 't34', weapon: '--game', range: 100 }, /cannot start/);
  await refuses('shot', { mod, target: 't34', weapon: 'gun\nx', range: 100 }, /control/);
  await refuses('shot', { mod, target: 't34', weapon: 'g', range: 5001 }, /range/);
  await refuses('shot', { mod, target: 't34', weapon: 'g', range: 100, el: 91 }, /el/);
  await refuses('shot', { mod, target: 't34', weapon: 'g', range: 100, origin: [1, 2, 3] }, /both/);
  await refuses('shot', { mod, target: 't34', weapon: 'g', range: 100, origin: [1, 2, 3], dir: [0, 0, 0] }, /zero/);
  await refuses('shot', { mod, target: 't34', weapon: 'g', range: 100, aim: [1, 2] }, /three/);
  await refuses('map', { mod, target: 't34', weapon: 'g', range: 100, grid: '161x48' }, /grid width/);
  await refuses('map', { mod, target: 't34', weapon: 'g', range: 100, grid: '64x121' }, /grid height/);
  await refuses('map', { mod, target: 't34', weapon: 'g', range: 100, view: 'below' }, /view/);
  await refuses('table', { mod, target: '-x' }, /cannot start/);
  await refuses('table', { mod: game, target: 't34' }, /game install/);
  ok('refusals: no mod, mm range and type, side list, leading "-", control chars, range, el, lone origin, zero dir, grid, view, game folder');

  // ---------- cache ----------
  const defPath = path.join(mod, DEF); fs.mkdirSync(path.dirname(defPath), { recursive: true }); fs.writeFileSync(defPath, '{}');
  await call('table', { mod, target: 't34' });                       // learns the def key and its mtime
  const mb = { mod, target: 't34', weapon: '75mm_kwk40(l48)', ammo: 'bullet75.ap.ammo', range: 100, view: 'front', grid: '64x48' };
  let before = calls.length;
  const m1 = await call('map', mb); assert.strictEqual(calls.length, before + 1); assert.strictEqual(m1.cached, false);
  const m2 = await call('map', mb); assert.strictEqual(calls.length, before + 1, 'second identical map: no tool call'); assert.strictEqual(m2.cached, true);
  await call('map', Object.assign({}, mb, { range: 200 })); assert.strictEqual(calls.length, before + 2, 'other inputs: tool called');
  await call('edit', Object.assign({}, mb, { volume: 'basis/body', side: 'front', mm: 60, dry: true }));
  before = calls.length; await call('map', mb); assert.strictEqual(calls.length, before, 'a dry edit keeps the cache');
  await call('edit', Object.assign({}, mb, { volume: 'basis/body', side: 'front', mm: 60 }));
  before = calls.length; const m3 = await call('map', mb); assert.strictEqual(calls.length, before + 1, 'after an edit the map is read again'); assert.strictEqual(m3.cached, false);
  await call('map', mb); assert.strictEqual(calls.length, before + 1);
  const t = new Date(Date.now() + 5000); fs.utimesSync(defPath, t, t);
  await call('map', mb); assert.strictEqual(calls.length, before + 2, 'def changed on disk: read again');
  // CACHE: after a restart (memory empty) the map comes from the shared store, equal to the worked-out one, no tool call;
  // an edit and a def change still read again
  const m4 = await call('map', mb), forget = () => { S._t.CACHE.clear(); S._t.DEFKEY.clear(); S._t.REV.clear(); };
  forget(); before = calls.length; const m5 = await call('map', mb);
  assert.strictEqual(calls.length, before, 'after a restart: from the store, no tool call'); assert.deepStrictEqual(m5, m4, 'stored map = worked-out map');
  forget(); await call('edit', Object.assign({}, mb, { volume: 'basis/body', side: 'front', mm: 61 }));
  forget(); before = calls.length; assert.strictEqual((await call('map', mb)).cached, false); assert.strictEqual(calls.length, before + 1, 'after an edit and a restart: read again');
  forget(); const t2 = new Date(Date.now() + 9000); fs.utimesSync(defPath, t2, t2);
  before = calls.length; await call('map', mb); assert.strictEqual(calls.length, before + 1, 'def changed on disk, after a restart: read again');
  forget(); before = calls.length; await call('map', mb); assert.strictEqual(calls.length, before, 'and kept again');
  ok('cache: second identical map answered from memory, dropped after an edit and when the def in the mod changes; after a restart the shared store answers, with the same rules');

  // ---------- effects: the shot followed behind the armour ----------
  {
    const before = calls.length;
    await call('effects', { mod, target: 't34', weapon: 'gun76', ammo: 'ap', range: 300, az: 90, el: 5, aimVolume: 'body', samples: 50, seed: 7, explosive: 2 });
    assert.deepStrictEqual(last().args, ['effects', 't34', '--weapon', 'gun76', '--ammo', 'ap', '--range', '300', '--from', '90,5', '--aim-volume', 'body'].concat(G, F, ['--samples', '50', '--seed', '7', '--explosive', '2', '--json']));
    await call('effects', { mod, target: 't34', weapon: 'gun76', range: 300, origin: '1,2,3', dir: [0, 1, 0] });
    assert.deepStrictEqual(last().args, ['effects', 't34', '--weapon', 'gun76', '--range', '300', '--origin', '1,2,3', '--dir', '0,1,0'].concat(G, F, ['--samples', '400', '--json']));
    let rv = await call('effects', { mod, target: 't34', weapon: 'gun76', range: 300, vanilla: true, doc: 'd1' });
    assert.ok(rv.vanilla === true && !last().args.includes('--folder'), 'without the mod: no --folder, no document');
    await refuses('effects', { mod, target: 't34', weapon: 'gun76', range: 300, samples: 99999 }, /samples/);
    // until: seconds to follow, 1 to 600, both paths; empty = the tool's own default
    await call('effects', { mod, target: 't34', weapon: 'gun76', range: 300, az: 0, until: 30, seed: 2 });
    assert.deepStrictEqual(last().args.slice(-7), ['--samples', '400', '--seed', '2', '--until', '30', '--json']);
    await call('effects', { mod, target: 't34', weapon: 'gun76', range: 300, until: '' });
    assert.ok(!last().args.includes('--until'), 'empty until: no flag');
    await refuses('effects', { mod, target: 't34', weapon: 'gun76', range: 300, until: 0 }, /until/);
    await refuses('effects', { mod, target: 't34', weapon: 'gun76', range: 300, until: 601 }, /until/);
    await refuses('effects', { mod, target: 't34', weapon: 'gun76', range: 300, until: 'x' }, /until/);
    {
      const T4 = EXT.models.subs.armor._t;
      assert.deepStrictEqual(T4.fxBody({ a: 1 }, 'd', { until: '45' }), { a: 1, samples: 400, until: 45, doc: 'd' });
      assert.deepStrictEqual(T4.fxBody({ a: 1 }, null, { until: '', vanilla: true }), { a: 1, samples: 400, vanilla: true }, 'empty until: not sent');
      assert.ok(!('until' in T4.fxBody({}, null, { until: 9999 })), 'out of range: not sent');
      assert.ok(T4.untilOk('') && T4.untilOk(1) && T4.untilOk('600') && !T4.untilOk(0) && !T4.untilOk('601') && !T4.untilOk('x'));
    }
    {
      const T2 = EXT.models.subs.armor._t;
      assert.deepStrictEqual(T2.factKey('part:engine broken'), { k: 'partBroken', x: 'engine' });
      assert.deepStrictEqual(T2.factKey('part:left track destroyed'), { k: 'partDestroyed', x: 'left track' });
      assert.deepStrictEqual(T2.factKey('crew:all dead'), { k: 'crewAllDead', x: '' });
      assert.deepStrictEqual(T2.factKey('crew:driver dead'), { k: 'crewDead', x: 'driver' });
      assert.deepStrictEqual(T2.factKey('weapon:gun off'), { k: 'weaponOff', x: 'gun' });
      assert.deepStrictEqual(T2.factKey('tag:destroyed'), { k: 'tag', x: 'destroyed' });
      assert.deepStrictEqual(T2.factKey('something new'), { k: 'other', x: 'something new' });
      for (const s of ['part:a broken', 'part:a destroyed', 'crew:all dead', 'crew:x dead', 'crew leaves', 'cannot move', 'weapon:x off', 'aim:x frozen', 'crew stunned', 'burns', 'fire area', 'explodes', 'torn off: x', 'removed from the map', 'tag:x', 'cannot be selected', 'zz'])
        assert.ok(L.en['models.armor.fxf.' + T2.factKey(s).k], 'text for fact ' + s);
      for (const k of require('../../../../armorsim/effects').whole(['cannot move', 'weapon:x off', 'crew leaves', 'crew:all dead', 'burns', 'explodes'])) assert.ok(L.en['models.armor.fxw.' + T2.FX_WHOLE[k]], 'text for whole ' + k);
      for (const s of ['unsaved', 'mod', 'other mod', 'vanilla', 'unknown', 'x']) assert.ok(L.en['models.armor.fxfrom.' + T2.fromKey(s)], 'origin ' + s);
      for (const s of ['passed', 'spent', 'detonate', 'no_penetration', 'ricochet', 'beyond_jet', 'no_hit', 'zz']) assert.ok(L.en['models.armor.fxend.' + T2.endKey(s)], 'end ' + s);
      assert.deepStrictEqual([T2.pct(0), T2.pct(0.001), T2.pct(0.5), T2.pct(0.999), T2.pct(1)], ['0%', '<1%', '50%', '>99%', '100%']);
      assert.deepStrictEqual([T2.wholeClass(0), T2.wholeClass(0.2), T2.wholeClass(0.5)], ['badge', 'badge review', 'badge badx']);
      assert.deepStrictEqual(T2.fxBody({ target: 't' }, 'd1', { carry: true, reset: true }), { target: 't', samples: 400, doc: 'd1', carry: true, reset: true });
      assert.deepStrictEqual(T2.fxBody({ target: 't' }, null, { carry: true }), { target: 't', samples: 400 });
      assert.deepStrictEqual(T2.fxBody({ target: 't' }, 'd1', { carry: true, vanilla: true }), { target: 't', samples: 400, vanilla: true });
    }
    await refuses('effects', { mod, target: 't34', weapon: 'gun76', range: 300, doc: 'nope' }, /no longer open/);
    // with an open document: in process, on the document; the stages themselves are tested in tools/armorsim/test/after.test.js
    const core = require('../../../../lib/model/edit/core'), sim = require('../../../../armorsim/sim'), FX = require('../../../../armorsim/effects');
    const keep = { get: core.get, openDoc: sim.openDoc, shellFrom: sim.shellFrom, rayFrom: sim.rayFrom, effects: FX.effects };
    const doc = { rev: 4 }, seen = [];
    core.get = id => (id === 'd1' ? doc : null);
    sim.openDoc = (d, o) => { seen.push(['open', d === doc, o.unit, o.folder]); return { unit: o.unit, opts: {} }; };
    sim.shellFrom = a => ({ weapon: a.weapon, ammo: a.ammo });
    sim.rayFrom = (c, az, el, aim) => ({ origin: [az, el, 0], dir: [1, 0, 0], aim });
    FX.effects = (c, sh, range, ray, o) => { seen.push(['fx', sh.weapon, range, o.samples, o.seed, o.state || null, o.until]); return { samples: o.samples, facts: [], next: { n: (o.state ? o.state.n : 0) + 1 } }; };
    try {
      const n0 = calls.length;
      let r = await call('effects', { mod, target: 't34', weapon: 'gun76', range: 300, az: 90, doc: 'd1', samples: 10, carry: true });
      assert.strictEqual(calls.length, n0, 'no tool run for an open document');
      assert.deepStrictEqual(seen[0], ['open', true, 't34', mod]);
      assert.deepStrictEqual(seen[1], ['fx', 'gun76', 300, 10, 1, null, undefined]);
      assert.ok(r.rev === 4 && r.unit === 't34' && r.carried === true && !('next' in r) && r.ray.origin[0] === 90, 'answer carries the document revision and the ray, not the state');
      await call('effects', { mod, target: 't34', weapon: 'gun76', range: 300, doc: 'd1', carry: true });
      assert.deepStrictEqual(seen[3][5], { n: 1 }, 'the second shot starts from the state the first left');
      await call('effects', { mod, target: 't34', weapon: 'gun76', range: 300, doc: 'd1', carry: true, reset: true });
      assert.strictEqual(seen[5][5], null, 'reset drops the carried state');
      await call('effects', { mod, target: 't34', weapon: 'gun76', range: 300, doc: 'd1' });
      assert.strictEqual(seen[7][5], null, 'without carry every shot is on a fresh unit');
      await call('effects', { mod, target: 't34', weapon: 'gun76', range: 300, doc: 'd1', until: 45 });
      assert.strictEqual(seen[9][6], 45, 'in process: until passed on');
      await assert.rejects(call('effects', { mod, target: 't34', weapon: 'gun76', range: 300, doc: 'd1', until: 700 }), e => e.status === 400 && /until/.test(e.message));
      // the volumes shells never hit, for a click meant as a shot: from the open document's join, kept per revision
      let opened = 0;
      sim.openDoc = (d, o) => { opened++; return { unit: o.unit, opts: {}, join: { notHit: [{ id: 'basis/ram', name: 'ram', why: 'ram volume: ables cleared at spawn', extra: 1 }] } }; };
      let nh = await call('nothit', { mod, target: 't34', doc: 'd1' });
      assert.deepStrictEqual(nh, { notHit: [{ id: 'basis/ram', name: 'ram', why: 'ram volume: ables cleared at spawn' }], rev: 4 }, 'nothit from the document');
      await call('nothit', { mod, target: 't34', doc: 'd1' }); assert.strictEqual(opened, 1, 'same revision: kept');
      doc.rev = 5; await call('nothit', { mod, target: 't34', doc: 'd1' }); assert.strictEqual(opened, 2, 'an edit: read again'); doc.rev = 4;
      await assert.rejects(call('nothit', { mod, target: 't34', doc: 'gone' }), e => e.status === 400 && /no longer open/.test(e.message));
      S._t.NOTHIT.clear();
      sim.openDoc = () => ({ error: 'No vehicle def named "t34".' });
      await assert.rejects(call('effects', { mod, target: 't34', weapon: 'gun76', range: 300, doc: 'd1' }), e => e.status === 400 && /No vehicle def/.test(e.message));
      await assert.rejects(call('nothit', { mod, target: 't34', doc: 'd1' }), e => e.status === 400 && /No vehicle def/.test(e.message));
    } finally { Object.assign(core, { get: keep.get }); Object.assign(sim, { openDoc: keep.openDoc, shellFrom: keep.shellFrom, rayFrom: keep.rayFrom }); FX.effects = keep.effects; S._t.CARRY.clear(); }
    assert.ok(calls.length > before);
    ok('effects: argv by angle and by origin, refusals, open document runs in process with carry and reset');
  }

  // ---------- behind the armour by cause: groups, tags, blasts (hand-made results in the shape of ----------
  {
    const T3 = EXT.models.subs.armor._t;
    const keysIn = o => { const out = []; const walk = x => { if (!x || typeof x !== 'object') return; for (const v of [x.a && x.a.text, x.a && x.a.title]) if (v) out.push(String(v)); (x.kids || []).forEach(walk); }; [].concat(o).forEach(walk); return out.join('\n'); };
    const usedKeys = s => [...s.matchAll(/models\.armor\.[A-Za-z0-9_.]*[A-Za-z0-9_]/g)].map(m => m[0]);
    const GR = [
      { id: 'c', cause: { kind: 'script', event: 'on_fire', file: 'x.ext', line: 4, from: 'mod' }, parent: 'zz', chance: 0.3, at: { first: 5, median: 6 }, facts: ['burns', 'tag:burning'], tags: ['burning'] },
      { id: 'd', cause: { kind: 'blast', file: 'y.ext', line: 2, from: 'vanilla' }, parent: 'b', chance: 0.2, at: { first: 1, median: 1 }, facts: ['explodes'], tags: [] },
      { id: 'b', cause: { kind: 'part', event: 'break', part: 'body', fact: 'part:body destroyed' }, parent: 'a', chance: 0.5, at: { first: 0, median: 0 },
        facts: ['part:shieldl1 destroyed', 'part:shieldl2 destroyed', 'crew:driver dead', 'part:shieldl3 destroyed', 'part:gun destroyed'], tags: ['destroyed'] },
      { id: 'e', cause: { kind: 'blast' }, parent: null, chance: 0.9, at: { first: 0, median: 0 }, facts: [], tags: [] },
      { id: 'a', cause: { kind: 'shell', event: 'pierce', volume: 'basis/engine' }, parent: null, chance: 1, at: { first: 0, median: 0 }, facts: ['part:engine broken'], tags: [] },
    ];
    // tree: parent / child / grandchild, an unknown parent id is a root, roots by time then chance
    assert.deepStrictEqual(T3.flatGroups(GR).map(n => n.g.id + n.depth), ['a0', 'b1', 'd2', 'e0', 'c0']);
    const tree = T3.groupTree(GR);
    assert.deepStrictEqual(tree.map(n => n.g.id), ['a', 'e', 'c']); assert.strictEqual(tree[0].kids[0].kids[0].g.id, 'd');
    assert.deepStrictEqual(T3.flatGroups([{ id: 1, parent: 2, at: { first: 3 } }, { id: 2, parent: 1, at: { first: 1 } }]).map(n => n.g.id + ':' + n.depth), ['2:0', '1:1'], 'a loop of parents is cut at its earliest group');
    assert.deepStrictEqual(T3.flatGroups([{ id: 's', parent: 's' }, null, { parent: null }]).map(n => n.g.id), ['s'], 'own id as parent: root; no id: left out');
    assert.deepStrictEqual(T3.flatGroups(undefined), []);
    // folding: three or more of one kind make one line, the names listed; fewer stay one line each
    const ten = Array.from({ length: 10 }, (_, i) => 'part:p' + i + ' destroyed'), ch = {}; ten.forEach((f, i) => { ch[f] = i / 10; });
    let fl = T3.foldFacts(ten.concat(['burns']), ch);
    assert.strictEqual(fl.length, 2); assert.ok(fl[0].fold && fl[0].k === 'partDestroyed' && fl[0].names.length === 10 && fl[0].names[3] === 'p3' && fl[0].lo === 0 && fl[0].hi === 0.9);
    assert.ok(!fl[1].fold && fl[1].k === 'burns' && fl[1].lo === null, 'a fact with no chance in facts: no chance');
    fl = T3.foldFacts(['part:a destroyed', 'part:b destroyed'], {}); assert.deepStrictEqual(fl.map(l => [l.fold, l.x]), [[false, 'a'], [false, 'b']]);
    fl = T3.groupLines(GR[2], {}); assert.deepStrictEqual(fl.map(l => l.k + (l.fold ? '*' + l.names.join(',') : '')), ['partDestroyed*shieldl1,shieldl2,shieldl3,gun', 'crewDead']);
    assert.deepStrictEqual(T3.groupLines(GR[0], {}).map(l => l.k), ['burns'], 'a tag shown as the group badge is not listed again');
    for (const f of ['part:x destroyed', 'part:x broken', 'crew:x dead', 'weapon:x off', 'aim:x frozen', 'torn off: x', 'tag:x']) {
      const l = T3.foldFacts([0, 1, 2].map(i => f.replace('x', 'x' + i)), {})[0]; assert.ok(l.fold, 'folds ' + f); assert.ok(L.en['models.armor.fxfold.' + l.k], 'fold text ' + l.k);
    }
    // cause -> text key + slots, every kind
    const CK = [[{ kind: 'shell', event: 'pierce', volume: 'basis/engine' }, 'shellPierce', 'engine'], [{ kind: 'shell', event: 'bullet_hit', volume: 'body' }, 'shellHit', 'body'],
      [{ kind: 'shell', event: 'break_armor_again', volume: 'body' }, 'shellBreak', 'body'], [{ kind: 'shell', event: 'odd', part: 'turret' }, 'shellOther', 'turret'], [{ kind: 'shell' }, 'shell', '?'],
      [{ kind: 'blast' }, 'blastShell', '?'], [{ kind: 'blast', file: 'a.ext', line: 3 }, 'blastScript', '?'], [{ kind: 'part', event: 'break', part: 'body', fact: 'part:body broken' }, 'partBroken', 'body'],
      [{ kind: 'part', event: 'break', part: 'body', fact: 'part:body destroyed' }, 'partDestroyed', 'body'], [{ kind: 'part', event: 'repair', part: 'body' }, 'partRepaired', 'body'],
      [{ kind: 'script', event: 'on_x' }, 'script', '?'], [{ kind: 'script' }, 'scriptAny', '?'], [{ kind: 'weird', event: 'z' }, 'other', 'weird z'], [null, 'other', '?'],
      [{ kind: 'before' }, 'before', '?'], [{ kind: 'jet', event: 'jet' }, 'jet', '?'], [{ kind: 'fire', event: 'burn' }, 'fire', '?'], [{ kind: 'script', event: '_explosion' }, 'scriptExplodes', '?'], [{ kind: 'script', event: 'explosion_blastwave' }, 'scriptExplodes', '?'],
      [{ kind: 'script', event: 'explosion' }, 'scriptExplodes', '?'], [{ kind: 'script', event: 'fire_start' }, 'scriptFire', '?'], [{ kind: 'script', event: 'burn' }, 'scriptFire', '?'],
      [{ kind: 'script', event: 'crew_emit' }, 'scriptBail', '?'], [{ kind: 'script', event: 'crew_bail' }, 'scriptBail', '?'],
      [{ kind: 'part', event: 'break', part: null, volume: null, fact: 'part:turret destroyed' }, 'partDestroyed', 'turret'], [{ kind: 'part', event: 'repair', fact: 'part:body repaired' }, 'partRepaired', 'body']];
    for (const k of Object.values(T3.SCRIPT_WORDS)) assert.ok(L.en['models.armor.fxc.' + k], 'script words ' + k);
    assert.strictEqual(T3.causeKey({ kind: 'script', event: '_explosion' }).code, '_explosion', 'a script step shows its name as code');
    assert.strictEqual(T3.causeKey({ kind: 'part', part: 'body' }).code, '');
    for (const [c, k, x] of CK) { const r = T3.causeKey(c); assert.strictEqual(r.k, k, JSON.stringify(c)); assert.strictEqual(r.s.x, x, JSON.stringify(c)); assert.ok(L.en['models.armor.fxc.' + k], 'cause text ' + k); }
    assert.strictEqual(T3.causeKey({ kind: 'script', event: 'on_x' }).s.e, 'on_x');
    assert.strictEqual(T3.causeSig({ kind: 'part', event: 'break', part: 'body', file: 'f', line: 2 }), 'part|break|body||f|2');
    // result words, blast sources, tags, loose facts, gone, limits hint
    for (const r of ['pierced', 'damaged', 'held', 'zz', undefined]) assert.ok(L.en['models.armor.fxhitby.' + T3.hitKey(r)], 'hit word ' + r);
    assert.deepStrictEqual(['pierced', 'damaged', 'held', 'zz'].map(T3.hitKey), ['pierced', 'damaged', 'held', 'unknown']);
    for (const b of [{ source: 'shell' }, { source: 'script', by: { event: 'on_x' } }, {}, null]) assert.ok(L.en['models.armor.fxblast.' + T3.blastWho(b).k], 'blast source ' + JSON.stringify(b));
    assert.deepStrictEqual(T3.blastWho({ source: 'script', by: { event: 'on_x' } }), { k: 'script', s: { e: 'on_x' } });
    const TG = [{ tag: 'late', op: 'add', chance: 1, at: { first: 9, median: 9 } }, { tag: 'gone', op: 'remove', chance: 0.5, at: { first: 1 } }, { tag: 'early', op: 'add', chance: 0.4, at: { first: 0, median: 0 }, by: { event: 'on_x', file: 'f.ext', line: 7, from: 'mod' } }];
    const tr = T3.tagRows(TG); assert.deepStrictEqual([tr.add.map(t => t.tag), tr.remove.map(t => t.tag)], [['early', 'late'], ['gone']]);
    const FACTS = ['part:engine broken', 'part:shieldl1 destroyed', 'part:shieldl2 destroyed', 'crew:driver dead', 'part:shieldl3 destroyed', 'part:gun destroyed', 'burns', 'tag:burning', 'explodes', 'cannot move']
      .map((f, i) => ({ fact: f, chance: 1 - i / 20, at: { first: 0, median: i } }));
    const BL = [{ source: 'script', by: { event: 'on_fire', file: 'x.ext', line: 9, from: 'unsaved' }, at: 4, point: null, energy: 120, radius: 3, chance: 0.3, hits: [] },
      { source: 'shell', by: null, at: 0, point: [0, 0, 1], energy: 400, radius: 2.5, chance: 0.8, hits: [{ volume: 'basis/engine', part: 'engine', result: 'pierced', chance: 0.4 }, { volume: 'turret', part: 'turret', result: 'held', chance: 0.8 }] }];
    const J = { samples: 400, facts: FACTS, groups: GR, tags: TG, blasts: BL };
    assert.deepStrictEqual(T3.looseFacts(J), ['cannot move']);
    const PREV = { facts: FACTS.slice(0, 3), groups: [GR[4], { id: 'old', cause: { kind: 'script', event: 'on_gone', file: 'g.ext', line: 1 }, parent: null, chance: 0.6, facts: [] }] };
    assert.deepStrictEqual(T3.gone(J, PREV).groups.map(g => g.id), ['old']);
    assert.deepStrictEqual(T3.gone({ facts: [] }, { facts: [{ fact: 'burns', chance: 1 }] }).facts.map(x => x.fact), ['burns'], 'no groups: gone facts');
    assert.strictEqual(T3.limitsKey(J), 'models.armor.fx.limitsBlast'); assert.strictEqual(T3.limitsKey({ blasts: [] }), 'models.armor.fx.limitsBlast');
    assert.strictEqual(T3.limitsKey({ facts: [] }), 'models.armor.fx.limits'); assert.ok(L.en['models.armor.fx.limitsBlast'] && !/blast/i.test(L.en['models.armor.fx.limitsBlast']), 'with blasts the hint no longer says the blast is not followed');
    // drawing with a stub el: groups path (with a result before the edit), tags, blasts; every key it uses exists
    const nodes = T3.fxMain(fakeEl, J, PREV), s = keysIn(nodes);
    assert.strictEqual(nodes.length, 4, 'per part summary, groups, tags, blasts');
    for (const k of ['fx.byCause', 'fxc.shellPierce', 'fxc.partDestroyed', 'fxc.blastScript', 'fxc.blastShell', 'fxc.script', 'fx.leadsTo', 'fxfold.partDestroyed', 'fxf.crewDead', 'fx.before', 'fx.ungrouped', 'fx.gone', 'fx.tagHere',
      'fx.tags', 'fx.tagsRemoved', 'fx.byGame', 'fx.blasts', 'fxblast.shell', 'fxblast.script', 'fx.blastNothing', 'fxhitby.pierced', 'fxhitby.held', 'fx.blastCharge', 'fxfrom.mod', 'fxfrom.unsaved'])
      assert.ok(s.includes('models.armor.' + k), 'drawn: ' + k);
    assert.ok(!keysIn(nodes[1]).includes('models.armor.fx.colWhat'), 'no flat table when groups are there');
    assert.ok(s.includes('x.ext:4') && s.includes('f.ext:7') && s.includes('x.ext:9'), 'file:line of the scripts in the titles');
    assert.ok(/shieldl1 \d+%, shieldl2 \d+%, shieldl3 \d+%, gun \d+%/.test(s), 'folded line: each name with its chance in the title (the names are in the text slot)');
    assert.ok(s.indexOf('models.armor.fxc.shellPierce') < s.indexOf('models.armor.fxc.partDestroyed') && s.indexOf('models.armor.fxc.partDestroyed') < s.indexOf('models.armor.fxc.blastShell'), 'child under its parent, before the next root');
    for (const k of usedKeys(s)) assert.ok(L.en[k], 'drawn key exists ' + k);
    const empty = keysIn(T3.fxMain(fakeEl, { facts: [], groups: [] }, null)); assert.ok(empty.includes('models.armor.fx.nothing'));
    // fallback: no groups -> the flat table as before (with the before column when there is a previous result)
    const flat = T3.fxMain(fakeEl, { facts: FACTS.slice(0, 2) }, { facts: [{ fact: 'burns', chance: 0.5 }] }), fs2 = keysIn(flat);
    assert.strictEqual(flat.length, 2); assert.strictEqual(flat[1].kids[0].kids[0].tag, 'table');
    for (const k of ['fx.colWhat', 'fx.colChance', 'fx.colBefore', 'fx.colWhen', 'fxf.partBroken', 'fxf.burns']) assert.ok(fs2.includes('models.armor.' + k), 'flat: ' + k);
    assert.ok(!fs2.includes('models.armor.fx.byCause'));
    assert.ok(keysIn(T3.fxMain(fakeEl, { facts: [] }, null)).includes('models.armor.fx.nothing'));
    // final shapes of workers A and B: group facts as objects (chance under this cause), cause.by, kind before / script, tags[].group,
    // blasts with charge, radius {inner, outer} + radiusM, hits with chanceIfBlast; optional fields missing must not crash
    const AT0 = { first: 0, median: 0 }, VAN = 'resource/set/interaction_entity/entity.set';
    const RG = [
      { id: 1, cause: { kind: 'before', event: null, part: null, volume: null, fact: null, file: null, line: null, from: null, by: null }, parent: null, chance: 1, at: null, facts: [{ fact: 'part:engine broken', chance: 1, at: null }], tags: [] },
      { id: 2, cause: { kind: 'shell', event: 'pierce', part: 'body', volume: 'basis/body3', fact: null, file: null, line: null, from: null, by: null }, parent: null, chance: 1, at: AT0, facts: [], tags: [] },
      { id: 5, cause: { kind: 'part', event: 'break', part: 'body', volume: null, fact: 'part:body destroyed', file: VAN, line: 11, from: 'vanilla', by: { event: 'pierce', file: VAN, line: 3, from: 'vanilla' } }, parent: 2, chance: 1, at: AT0,
        facts: ['shieldl1', 'shieldl2', 'shieldr1', 'shieldr2'].map((p, i) => ({ fact: 'part:' + p + ' destroyed', chance: 1 - i / 10, at: AT0 })).concat([{ fact: 'tag:destroyed', chance: 1, at: AT0 }, { fact: 'burns', chance: 0.25, at: { first: 3, median: 4 } }]), tags: ['destroyed'] },
      { id: 6, cause: { kind: 'script', event: '_explosion', part: null, volume: null, fact: null, file: VAN, line: 40, from: 'vanilla', by: { event: 'break', file: VAN, line: 11, from: 'vanilla' } }, parent: 5, chance: 0.4, at: { first: 2, median: 5 }, facts: [{ fact: 'explodes', chance: 0.4, at: { first: 2, median: 5 } }], tags: [] },
      { id: 7, cause: { kind: 'script', event: 'my_step', file: 'x.ext', line: 2, from: 'mod', by: null }, parent: 6, chance: 0.1, facts: [{ fact: 'burns', chance: 0.1 }], tags: [] },
    ];
    const RF = [{ fact: 'part:engine broken', chance: 1, at: AT0 }, { fact: 'part:shieldl1 destroyed', chance: 1, at: AT0 }, { fact: 'burns', chance: 0.35, at: { first: 3, median: 4 } }, { fact: 'explodes', chance: 0.4, at: { first: 2, median: 5 } }];
    const RB = [{ source: 'shell', by: null, at: 0, point: [1, 2, 3], energy: 2.5, radius: { inner: 20, outer: 60 }, radiusM: { inner: 1, outer: 3 }, chance: 0.9, group: 2,
      hits: [{ volume: 'basis/body3', part: 'body', result: 'pierced', chance: 0.5, chanceIfBlast: 0.55 }, { volume: 'trackleft', part: 'trackleft', result: 'pierced', chance: 0.2 }, { volume: 'engine', part: 'engine', result: 'held', chance: 0.9, chanceIfBlast: 1 }, { volume: 'shieldr1', part: 'shieldr1', result: 'held', chance: 0.9 }] },
    { source: 'script', by: { event: '_explosion', file: VAN, line: 41, from: 'vanilla' }, at: null, point: null, energy: null, radius: 5, chance: 0.4, group: 6, hits: [] }];
    const RJ = { samples: 400, facts: RF, groups: RG, tags: [{ tag: 'destroyed', op: 'add', chance: 1, at: AT0, by: { event: 'break', file: VAN, line: 12, from: 'vanilla' }, group: 5 }, { tag: 'x', op: 'add', chance: 0.5, at: null, by: null, group: null }], blasts: RB };
    assert.strictEqual(T3.factOf({ fact: 'burns', chance: 1 }), 'burns'); assert.strictEqual(T3.factOf('burns'), 'burns');
    fl = T3.groupLines(RG[2], {});
    assert.deepStrictEqual(fl.map(l => [l.k, l.fold, l.lo, l.hi, l.at]), [['partDestroyed', true, 0.7, 1, 0], ['burns', false, 0.25, 0.25, 4]], 'object facts: chance and time under this cause, folded, the badge tag left out');
    assert.deepStrictEqual(T3.groupLines({ facts: ['burns'] }, { burns: 0.35 }).map(l => l.lo), [0.35], 'string facts: chance from the result');
    assert.deepStrictEqual(T3.looseFacts(RJ), [], 'object facts count as listed');
    assert.deepStrictEqual(T3.groupFactChances({ facts: RF, groups: [RG[2], { cause: RG[2].cause, facts: ['part:shieldl1 destroyed'] }] })[T3.causeSig(RG[2].cause)]['part:shieldl1 destroyed'], 2, 'the same cause twice adds up');
    assert.deepStrictEqual(T3.flatGroups(RG).map(n => n.g.id + ':' + n.depth), ['2:0', '5:1', '6:2', '7:3', '1:0'], 'no time (damage from before) sorts last');
    assert.deepStrictEqual(T3.hitGroups(RB[0].hits).map(g => [g.k, g.items.map(i => i.name + ' ' + i.chance).join(',')]), [['pierced', 'body3 0.55,trackleft 0.2'], ['held', 'engine 1,shieldr1 0.9']], 'hits by result word, chanceIfBlast first');
    assert.deepStrictEqual(T3.hitGroups([]), []); assert.deepStrictEqual(T3.hitGroups(undefined), []);
    assert.deepStrictEqual(T3.blastM(RB[0]), { i: 1, o: 3 }); assert.strictEqual(T3.blastM(RB[1]), null, 'numeric radius, no radiusM: nothing in metres');
    const rn = T3.fxMain(fakeEl, RJ, { facts: RF.slice(0, 2), groups: RG.slice(0, 3) }), rs = keysIn(rn);
    for (const k of ['fxc.before', 'fxc.shellPierce', 'fxc.partDestroyed', 'fxc.scriptExplodes', 'fxc.script', 'fx.setOffBy', 'fxfold.partDestroyed', 'fxf.burns', 'fx.blastCharge', 'fx.blastRadius', 'fxhitby.pierced', 'fxhitby.held', 'fx.blastNothing', 'fxfrom.vanilla', 'fx.byGame'])
      assert.ok(rs.includes('models.armor.' + k), 'real shapes drawn: ' + k);
    assert.ok(rs.includes('_explosion') && rs.includes('my_step'), 'script step names shown as code');
    assert.ok(rs.includes(VAN + ':11'), 'file:line of the handler in the badge title');
    assert.ok(!rs.includes('models.armor.fxf.tag'), 'the tag of the group is a badge, not a line');
    for (const k of usedKeys(rs)) assert.ok(L.en[k], 'drawn key exists ' + k);
    assert.strictEqual(T3.fxMain(fakeEl, { facts: [], groups: [{ id: 1, cause: null, parent: null, chance: null, at: null, facts: null, tags: null }], tags: [{ tag: 't', op: 'add' }], blasts: [{ source: 'shell', hits: null }, null] }, { facts: null, groups: [{ cause: null }] }).length, 3, 'missing optional fields do not crash');
    ok('behind the armour by cause: tree (parent, child, orphan, loop), order, folding, every cause kind / fold kind / result word / blast source has a text, tags, blasts, gone, limits hint, flat fallback');
  }

  // ---------- tidy tree (causes with via and steps), per part summary, origin badges, 3D colours (hand-made results) ----------
  {
    const T5 = EXT.models.subs.armor._t;
    const keysIn = o => { const out = []; const walk = x => { if (!x || typeof x !== 'object') return; for (const v of [x.a && x.a.text, x.a && x.a.title]) if (v) out.push(String(v)); (x.kids || []).forEach(walk); }; [].concat(o).forEach(walk); return out.join('\n'); };
    const find = (o, pred) => { let r = null; const walk = x => { if (r || !x || typeof x !== 'object') return; if (pred(x)) { r = x; return; } (x.kids || []).forEach(walk); }; [].concat(o).forEach(walk); return r; };
    const VAN = 'resource/set/interaction_entity/entity.set', AT0 = { first: 0, median: 0 };
    const CA = [
      { id: 'p', cause: { kind: 'shell', event: 'pierce', volume: 'basis/body3' }, parent: null, chance: 1, at: AT0, facts: [{ fact: 'part:engine broken', chance: 0.6, at: AT0 }], tags: [], via: [{ parent: null, chance: 1 }], steps: [], groups: [1] },
      { id: 'q', cause: { kind: 'part', event: 'break', part: 'body', fact: 'part:body destroyed', file: VAN, line: 11, from: 'other mod', mod: 'bigmod' }, parent: 'p', chance: 0.7, at: AT0,
        facts: [{ fact: 'crew:driver dead', chance: 0.3, at: { first: 1, median: 2 } }], tags: ['destroyed'],
        via: [{ parent: 'p', chance: 0.5 }, { parent: 'r', chance: 0.2 }, { parent: null, chance: 0.05 }],
        steps: [{ event: 'break', file: VAN, line: 11, from: 'other mod', mod: 'bigmod' }, { event: 'my_call', file: 'mine.ext', line: 4, from: 'mod', mod: 'mymod' }], groups: [2, 3] },
      { id: 'r', cause: { kind: 'blast', file: 'x.ext', line: 2, from: 'vanilla' }, parent: null, chance: 0.2, at: { first: 3, median: 3 }, facts: [], tags: [], via: [{ parent: null, chance: 0.2 }], steps: [], groups: [4] },
    ];
    const GG = [{ id: 1, cause: { kind: 'shell', event: 'pierce', volume: 'basis/body3' }, parent: null, chance: 1, at: AT0, facts: [], tags: [] }, { id: 2, cause: { kind: 'script', event: 'deep_step', file: VAN, line: 30, from: 'vanilla' }, parent: 1, chance: 0.7, at: AT0, facts: [], tags: [] }];
    const FA = [{ fact: 'part:engine broken', chance: 0.6, at: AT0 }, { fact: 'crew:driver dead', chance: 0.3, at: { first: 1, median: 2 } }];
    // fallback order: causes -> groups -> flat; the switch picks groups only when both are there
    assert.strictEqual(T5.mainKind({ causes: CA, groups: GG }, false), 'causes'); assert.strictEqual(T5.mainKind({ causes: CA, groups: GG }, true), 'groups');
    assert.strictEqual(T5.mainKind({ causes: CA }, true), 'causes', 'no groups: the switch has nothing to show');
    assert.strictEqual(T5.mainKind({ groups: GG }, false), 'groups'); assert.strictEqual(T5.mainKind({ facts: [] }, false), 'flat'); assert.strictEqual(T5.mainKind(null, false), 'flat');
    // via: the drawn parent left out, other parents with their chance; the hit itself as parent null; fewer than two ways: nothing
    const by = {}; CA.forEach(c => { by[c.id] = c; });
    const av = T5.alsoVia(CA[1], by);
    assert.deepStrictEqual(av.map(v => [v.parent, v.chance, v.cause && v.cause.kind]), [['r', 0.2, 'blast'], [null, 0.05, null]]);
    assert.deepStrictEqual(T5.alsoVia(CA[0], by), []); assert.deepStrictEqual(T5.alsoVia({ via: [{ parent: 'zz', chance: 0.1 }, { parent: 'yy' }], parent: 'zz' }, by), [{ parent: 'yy', chance: null, cause: null }]);
    assert.deepStrictEqual(T5.alsoVia(null, by), []);
    // drawing: tidy tree with via line and closed script steps; the switch redraws from groups in place
    const J = { samples: 400, facts: FA, causes: CA, groups: GG };
    const nodes = T5.fxMain(fakeEl, J, null), s = keysIn(nodes);
    for (const k of ['fx.subs', 'fx.colPart', 'sub.engine', 'sub.crew', 'subst.broken', 'subst.dead', 'fx.allSteps', 'fx.byCause', 'fxc.shellPierce', 'fxc.partDestroyed', 'fx.also', 'fx.steps', 'fxfrom.otherModNamed', 'fx.inMod', 'fx.open', 'fx.openTip'])
      assert.ok(s.includes('models.armor.' + k), 'tidy tree drawn: ' + k);
    assert.ok(s.includes('my_call') && s.includes('mine.ext:4'), 'script steps: event and file:line');
    assert.ok(!s.includes('deep_step'), 'the full tree is not drawn while the switch is off');
    const det = find(nodes, x => x.tag === 'details' && x.kids[0] && /fx\.steps/.test(x.kids[0].a.text)); assert.ok(det && !det.a.open, 'script steps in a closed details element');
    const cb = find(nodes, x => x.tag === 'input' && x.a.type === 'checkbox');
    assert.ok(cb && !cb.checked); cb.checked = true; cb.a.onchange();
    assert.ok(keysIn(nodes).includes('deep_step'), 'switch on: the full tree from groups');
    const again = keysIn(T5.fxMain(fakeEl, J, null)); assert.ok(again.includes('deep_step') && !again.includes('models.armor.fx.steps'), 'the switch is remembered in the part state');
    const cb2 = find(T5.fxMain(fakeEl, J, null), x => x.tag === 'input' && x.a.type === 'checkbox'); assert.ok(cb2.checked); cb2.checked = false; cb2.a.onchange();
    assert.ok(!keysIn(T5.fxMain(fakeEl, { facts: [], causes: CA }, null)).includes('models.armor.fx.allSteps'), 'no groups: no switch');
    assert.ok(keysIn(T5.fxMain(fakeEl, J, { facts: [], causes: [CA[2]] })).includes('models.armor.fx.before'), 'before the edit compared cause by cause');
    // per part summary from facts: worst state with any chance, its chance and time; fixed order, crew places, unknown names on their own
    assert.deepStrictEqual(['body1', 'turret', 'gun_mantlet', 'engine', 'trackleft', 'track_r', 'track', 'wheel3', 'fueltank', 'ammo_rack', 'shieldl1', 'radio'].map(T5.subOfPart),
      ['hull', 'turret', 'gun', 'engine', 'trackLeft', 'trackRight', 'tracks', 'wheels', 'fuel', 'ammo', null, null]);
    const SF = [{ fact: 'part:radio broken', chance: 0.4 }, { fact: 'crew:gunner dead', chance: 0.2 }, { fact: 'part:body1 broken', chance: 0.9, at: { first: 0, median: 0 } },
      { fact: 'part:body1 destroyed', chance: 0.1, at: { first: 4, median: 5 } }, { fact: 'part:body2 destroyed', chance: 0.3, at: { first: 6, median: 6 } }, { fact: 'cannot move', chance: 0.5 },
      { fact: 'weapon:kwk40 off', chance: 0.6 }, { fact: 'aim:turret frozen', chance: 0.3 }, { fact: 'part:trackleft repaired', chance: 0.2 }, { fact: 'crew:driver dead', chance: 0 },
      { fact: 'burns', chance: 1 }, { fact: 'crew:all dead', chance: 0.1 }, { fact: 'part:shieldl1 destroyed', chance: 0.5 }, { fact: 'part:fuel damaged', chance: 0.25 }];
    const rows = T5.subsystems(SF);
    assert.deepStrictEqual(rows.map(r => [r.id, r.state, r.chance]), [['hull', 'destroyed', 0.3], ['turret', 'off', 0.3], ['trackLeft', 'works', 0.2], ['fuel', 'damaged', 0.25], ['move', 'off', 0.5], ['crewAll', 'dead', 0.1],
      ['crew:gunner', 'dead', 0.2], ['part:radio', 'broken', 0.4], ['weapon:kwk40', 'off', 0.6], ['part:shieldl1', 'destroyed', 0.5]]);
    assert.deepStrictEqual(rows[0].at, { first: 6, median: 6 }); assert.strictEqual(rows[0].facts.length, 3, 'all facts of the row kept for the tooltip');
    assert.deepStrictEqual(T5.subsystems(undefined), []); assert.strictEqual(T5.fxSubs(fakeEl, { facts: [{ fact: 'burns', chance: 1 }] }), null, 'no part result: no table');
    const L5 = require('./armor.lang.json').en;
    for (const r of rows) { assert.ok(L5['models.armor.sub.' + r.k], 'row text ' + r.k); assert.ok(L5['models.armor.subst.' + r.state], 'state text ' + r.state); }
    for (const k of T5.SUB_ORDER) assert.ok(L5['models.armor.sub.' + k], 'row text ' + k);
    const st = keysIn(T5.fxSubs(fakeEl, { facts: SF })); assert.ok(st.includes('models.armor.part.shield') && st.includes('models.armor.sub.part') && rows[7].x === 'radio', 'unknown names on their own row, known extra parts with the page wording');
    // badges: the mod name for another mod in the words, for the picked mod in the tooltip; Open with a file
    assert.deepStrictEqual(T5.badgeInfo('other mod', 't', 'bigmod'), { cls: 'badge info', text: 'models.armor.fxfrom.otherModNamed', title: 't' });
    assert.deepStrictEqual(T5.badgeInfo('other mod', '', null).text, 'models.armor.fxfrom.otherMod');
    assert.deepStrictEqual(T5.badgeInfo('mod', 'f.ext:2', 'mymod'), { cls: 'badge info', text: 'models.armor.fxfrom.mod', title: 'models.armor.fx.inMod; f.ext:2' });
    assert.deepStrictEqual(T5.badgeInfo('vanilla', '', 'x'), { cls: 'badge', text: 'models.armor.fxfrom.vanilla', title: '' });
    assert.strictEqual(T5.fileLink(VAN, 11), 'key:' + VAN + ':11'); assert.strictEqual(T5.fileLink('a.ext', null), 'key:a.ext'); assert.strictEqual(T5.fileLink(null, 3), null);
    const bd = T5.badgeFrom(fakeEl, 'mod', 't', { file: 'a.ext', line: 3, mod: 'mymod' }), btn = find(bd, x => x.tag === 'button');
    assert.ok(btn && btn.a.text === 'models.armor.fx.open' && typeof btn.a.onclick === 'function'); btn.a.onclick();
    assert.strictEqual(T5.badgeFrom(fakeEl, 'mod', 't', null).tag, 'span'); assert.ok(!find(T5.badgeFrom(fakeEl, 'vanilla', '', { line: 3 }), x => x.tag === 'button'), 'no file: no Open');
    // batch 4: Open goes to the exact copy (layer + rel); a pak copy keeps the load order winner and names the pak; old results as before
    assert.deepStrictEqual(T5.exactOf({ layer: '/g/mods/m/', rel: '/resource/set/a.inc' }), { path: '/g/mods/m/resource/set/a.inc' });
    assert.deepStrictEqual(T5.exactOf({ layer: 'X:\\g\\mods\\m', rel: 'resource/set/a.inc' }), { path: 'X:\\g\\mods\\m\\resource\\set\\a.inc' }, 'backslash layer');
    assert.deepStrictEqual(T5.exactOf({ from: { layer: '/g/resource/set.pak', rel: 'set/a.inc' } }), { pak: '/g/resource/set.pak', rel: 'set/a.inc' }, 'pak on an object from');
    assert.strictEqual(T5.exactOf({ file: 'a.inc', from: 'mod' }), null, 'old result: no layer');
    const opened = [], W0 = global.window; global.window = { IDE: { open(ref, line) { opened.push([ref, line]); return Promise.resolve(null); } } };
    try {
      const bx = T5.badgeFrom(fakeEl, 'vanilla', '', { file: VAN, line: 7, layer: '/g', rel: VAN }), b1 = find(bx, x => x.tag === 'button');
      assert.ok(b1 && b1.a.title === 'models.armor.fx.openFileTip'); b1.a.onclick();
      assert.deepStrictEqual(opened, [[{ mod: null, path: '/g/' + VAN }, 7]], 'the exact file through the Editor by its full path');
      const bp = find(T5.badgeFrom(fakeEl, 'vanilla', '', { file: VAN, line: 7, layer: '/g/resource/x.pak', rel: VAN }), x => x.tag === 'button');
      assert.ok(bp && bp.a.title === 'models.armor.fx.openPakTip'); bp.a.onclick(); assert.strictEqual(opened.length, 1, 'a pak copy: not by path');
      assert.ok(find(T5.badgeFrom(fakeEl, 'mod', '', { layer: '/m', rel: 'set/a.inc' }), x => x.tag === 'button'), 'layer and rel without file: Open');
    } finally { if (W0 === undefined) delete global.window; else global.window = W0; }
    // a shell the gun does not load; crew notes in the page words, English note as the fallback
    assert.strictEqual(T5.notLoadedText({ asked: 'he', weapon: 'kwk', loads: ['ap', 'apcr'] }), 'models.armor.fx.notLoaded');
    assert.strictEqual(T5.notLoadedText({ asked: 'he', weapon: 'kwk', loads: [] }), 'models.armor.fx.notLoadedNone'); assert.strictEqual(T5.notLoadedText(null), '');
    assert.deepStrictEqual(T5.crewLines({ engine: { crewNotes: [{ key: 'shot' }, { key: 'blast' }], crewNote: 'E' } }), ['models.armor.crew.shot', 'models.armor.crew.blast']);
    assert.deepStrictEqual(T5.crewLines({ engine: { crewNotes: [{ key: 'shot' }, { key: 'odd' }], crewNote: 'E' } }), ['models.armor.crew.shot', 'E'], 'unknown key: the English note too');
    assert.deepStrictEqual(T5.crewLines({ engine: { crewNote: 'E' } }), ['E']); assert.deepStrictEqual(T5.crewLines({}), []);
    const L4 = require('./armor.lang.json');
    for (const c of ['en', 'ru', 'uk', 'zh']) for (const k of ['crew.shot', 'crew.blast', 'fx.notLoaded', 'fx.notLoadedNone', 'fx.openFileTip', 'fx.openPakTip']) assert.ok(L4[c]['models.armor.' + k], c + ' ' + k);
    // 3D colours: plates by result, blast reached volumes, a plate's result wins; short names to view ids through the table rows
    const RES = { engine: { plates: [{ volume: 'body3', result: 'penetrate' }, { volume: 'engine', result: 'no_penetration' }, { volume: 'x', result: 'no_armor' }], end: { result: 'no_penetration', point: [1, 2, 3] } },
      blasts: [{ hits: [{ volume: 'engine', result: 'held', chance: 0.5 }, { volume: 'trackleft', result: 'damaged', chance: 0.2 }, { volume: 'gun', result: 'held', chance: 0, chanceIfBlast: 0 }] }, { hits: null }], ray: { origin: [10, 0, 0], dir: [-1, 0, 0] } };
    const ROWS = [{ name: 'body3', id: 'basis/body3' }, { name: 'engine', id: 'basis/engine' }, { name: 'trackleft', id: 'basis/trl/trackleft' }];
    assert.deepStrictEqual(T5.fxVolCats(RES, null, ROWS), { 'basis/engine': 'stop', 'basis/trl/trackleft': 'blast', 'basis/body3': 'through' });
    assert.deepStrictEqual(T5.fxVolCats({ blasts: [] }, { plates: [{ volume: 'a/b', result: 'ricochet' }] }, []), { 'a/b': 'bounce' }, 'no engine plates: the shot plates');
    assert.deepStrictEqual(T5.fxVolCats(null, null, null), {});
    assert.deepStrictEqual(T5.fxLine(RES, null), { from: [10, 0, 0], to: [1, 2, 3] });
    assert.deepStrictEqual(T5.fxLine({ engine: { end: { point: [1, 2, 3] } } }, { ray: { origin: [5, 5, 5] } }), { from: [5, 5, 5], to: [1, 2, 3] }, 'ray of the shot when the result has none');
    assert.strictEqual(T5.fxLine({ engine: { end: { point: null } }, ray: RES.ray }, null), null);
    ok('tidy tree (via, closed script steps, switch to every step), fallback causes > groups > flat, per part summary, badges with mod name and Open, 3D colours and line');
    // jets and fires beside the blasts, in order summary, tree, tags, blasts, jets, fires; empty lists left out
    const JETS = [{ damage: 120.44, distance: 1.5, at: 0, chance: 0.8, group: 1, cause: 'p', ends: [{ result: 'spent', volume: 'basis/engine', chance: 0.6 }],
      hits: [{ volume: 'basis/engine', part: 'engine', events: ['pierce', 'break'], chance: 0.6, chanceIfJet: 0.75 }, { volume: 'ammo', events: null, chance: 0.1 }] }];
    const FIRES = [{ radius: 3, heating: 40, time: 20, inflammation: 7, inflammationAt: { file: VAN, line: 5, from: 'mod', mod: 'mymod' }, distance: 1, chance: 0.9, reaches: 0.7, ignites: 0.4,
      igniteAt: { first: 6, median: 7.25 }, group: 2, cause: 'q', volumes: [{ volume: 'basis/body3', chance: 0.7 }], notes: ['heat sums over time (foo.cpp:10)'] }];
    assert.deepStrictEqual(T5.jetHits(JETS[0].hits), [{ name: 'engine', chance: 0.75, events: 'pierce, break' }, { name: 'ammo', chance: 0.1, events: '' }]);
    assert.deepStrictEqual(T5.fireSay(FIRES[0]), { k: 'catchesAfter', s: { p: '40%', t: 7.3 } });
    assert.deepStrictEqual(T5.fireSay({ ignites: 0.2, igniteAt: null }), { k: 'catches', s: { p: '20%', t: '' } });
    assert.deepStrictEqual(T5.fireSay({ ignites: 0.2, inflammation: 5 }).s.t, 5, 'no time it caught: the unit inflammation time');
    assert.strictEqual(T5.fireSay({ reaches: 0.3, ignites: 0 }).k, 'reachesNoCatch'); assert.strictEqual(T5.fireSay({}).k, 'never'); assert.strictEqual(T5.fireSay(null).k, 'never');
    for (const f of [FIRES[0], { ignites: 0.2 }, { reaches: 0.3 }, {}]) assert.ok(L5['models.armor.fxfire.' + T5.fireSay(f).k], 'fire words ' + T5.fireSay(f).k);
    const JF = { facts: FA, causes: CA, groups: GG, tags: [], blasts: [{ source: 'shell', hits: [] }], jets: JETS, fires: FIRES };
    const jn = T5.fxMain(fakeEl, JF, null), js = keysIn(jn);
    assert.strictEqual(jn.length, 5, 'summary, tree, blasts, jets, fires (no tags)');
    assert.ok(keysIn(jn[3]).includes('models.armor.fx.jets') && keysIn(jn[4]).includes('models.armor.fx.fires'), 'jets then fires, after the blasts');
    for (const k of ['fx.jetLine', 'fx.ends', 'fxend.spent', 'fx.reached', 'fxfire.catchesAfter', 'fx.fireBurst', 'fx.fireSize', 'fx.fireInfl', 'fxfrom.mod', 'fx.open']) assert.ok(js.includes('models.armor.' + k), 'jets / fires drawn: ' + k);
    assert.ok(js.includes('engine: pierce, break') && js.includes('heat sums over time') && !js.includes('foo.cpp'), 'jet events in the title, fire notes plain');
    assert.strictEqual(T5.fxMain(fakeEl, { facts: [], jets: [], fires: [] }, null).length, 1, 'empty jets and fires left out');
    for (const k of ['jet', 'fire']) assert.ok(L5['models.armor.fxc.' + k], 'cause heading ' + k);
    // a shaped charge (HEAT) shell: its kind named in plain words, never blank or dropped; its result shows the jet section and the jet
    // cause heading (synthetic result: heat shell, two blasts at one point, a jet, a fire)
    const KW = 'models.armor.kind.';
    for (const k of ['heat', 'HEAT', 'Cumulative', 'shaped_charge']) assert.strictEqual(T5.kindWord(k), KW + 'heat', 'heat word for ' + k);
    assert.strictEqual(T5.kindWord('heat', 1), KW + 'heat', 'a heat shell is not named twice');
    assert.strictEqual(T5.kindWord('he', 2), KW + 'he, ' + KW + 'heat', 'a shaped charge in another kind is named too');
    assert.strictEqual(T5.kindWord('thermobaric'), 'thermobaric', 'an unknown kind shows its own word');
    for (const k of ['', null, undefined, 'other']) assert.strictEqual(T5.kindWord(k), KW + 'other', 'no kind: other, never blank');
    const LA = require('./armor.lang.json'); for (const c of ['en', 'ru', 'uk', 'zh']) assert.ok(/HEAT/.test(LA[c][KW + 'heat']), c + ' heat word names HEAT');
    assert.ok(/shaped charge/.test(LA.en[KW + 'heat']), 'en: shaped charge');
    const HEAT = { shell: { kind: 'heat' }, facts: [{ fact: 'part:engine broken', chance: 0.7, cause: 'j' }], tags: [],
      groups: [{ id: 1, cause: { kind: 'jet', event: 'jet', volume: 'basis/engine' }, parent: null, chance: 0.9, at: { first: 0, median: 0 }, facts: [{ fact: 'part:engine broken', chance: 0.7, at: { first: 0, median: 0 } }], tags: [] }],
      causes: [{ id: 'j', cause: { kind: 'jet', event: 'jet', volume: 'basis/engine' }, parent: null, chance: 0.9, at: { first: 0, median: 0 }, facts: [{ fact: 'part:engine broken', chance: 0.7, at: { first: 0, median: 0 } }], tags: [], via: [], steps: [], groups: [1] }],
      blasts: [{ source: 'shell', by: null, point: [2, 0, 4], energy: 120, radius: { inner: 20, outer: 70 }, chance: 1, hits: [{ volume: 'basis/engine', result: 'held', chance: 1 }] },
        { source: 'script', by: { event: 'on_ammo_explode' }, point: [2, 0, 4], energy: 40, radius: { outer: 34 }, chance: 0.4, hits: [] }],
      jets: [{ damage: 300, distance: 1.5, point: [2, 0, 4], dir: [-1, 0, 0], at: 0, chance: 0.9, group: 1, cause: 'j', ends: [{ result: 'spent', volume: 'basis/engine', chance: 0.9 }],
        hits: [{ volume: 'basis/engine', part: 'engine', events: ['pierce'], chance: 0.9, chanceIfJet: 1 }] }],
      fires: [{ radius: 2, heating: 7.5, time: 12, chance: 1, point: [0, 0, 0], volumes: [] }] };
    const hn = T5.fxMain(fakeEl, HEAT, null), hk = keysIn(hn);
    for (const k of ['fx.jets', 'fx.jetLine', 'fxc.jet', 'fx.blasts', 'fx.fires']) assert.ok(hk.includes('models.armor.' + k), 'heat shell result: ' + k);
    // gun, shell and range are read again from localStorage each time the part is drawn (a choice made in the Shot tool)
    {
      const st2 = { 'models.armor.gun': 'gunA', 'models.armor.ammo': 'shA', 'models.armor.range': 300 }, E2 = { models: { subs: {}, parts: {} } }, asked = [];
      new Function('EXT_SCREENS', 'LS', 'tx', 'api', 'S', 'h', script)(E2, { get: (k, d) => k in st2 ? st2[k] : d, set: (k, v) => { st2[k] = v; } }, k => k, (u, b) => { asked.push([u, b]); return new Promise(() => {}); }, { cur: 'models' }, () => ({}));
      const el2 = (tag, a, kids) => Object.assign(fakeEl(tag, a, kids), { addEventListener() {}, value: '', style: {} });
      const draw = () => E2.models.subs.armor({ body: el2('div'), set: { target: 't34' }, mod, el: el2, clear() {}, say() {}, k2: (a, b) => a + '.' + b });
      draw(); assert.ok(asked.some(a => /shells$/.test(a[0]) && a[1].weapon === 'gunA'), 'first draw: gun from storage');
      st2['models.armor.gun'] = 'gunB'; st2['models.armor.range'] = 450; asked.length = 0; draw();
      assert.ok(asked.some(a => /shells$/.test(a[0]) && a[1].weapon === 'gunB'), 'next draw: the gun picked elsewhere');
    }
    // the shell list shows every shell the route sends, heat ones named, an unknown kind by its own word
    {
      const st4 = { 'models.armor.gun': 'g', 'models.armor.ammo': '', 'models.armor.range': 100 }, E4 = { models: { subs: {}, parts: {} } };
      const SH = [{ ammo: 'pzgr', kind: 'ap', calibre: 75 }, { ammo: 'gr38hl', kind: 'heat', calibre: 75, cumulative: 1 }, { ammo: 'sprgr', kind: 'he', cumulative: 1 }, { ammo: 'odd', kind: 'thermobaric' }, { ammo: 'nokind' }];
      const api4 = u => Promise.resolve(/shells$/.test(u) ? { shells: SH } : {});
      new Function('EXT_SCREENS', 'LS', 'tx', 'api', 'S', 'h', script)(E4, { get: (k, d) => k in st4 ? st4[k] : d, set: (k, v) => { st4[k] = v; } }, k => k, api4, { cur: 'models' }, () => ({}));
      const made = [], el4 = (tag, a, kids) => { const x = Object.assign(fakeEl(tag, a, kids), { addEventListener() {}, value: '', style: {}, isConnected: true }); made.push(x); return x; };
      E4.models.subs.armor({ body: el4('div'), set: { target: 't34' }, mod, el: el4, clear(n) { if (n && n.kids) n.kids.length = 0; }, say() {}, k2: (a, b) => a + '.' + b });
      for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r));
      const sel = made.find(x => x.tag === 'select' && x.a['aria-label'] === 'models.armor.shell'), op = (sel && sel.kids || []).filter(x => x.tag === 'option');
      assert.deepStrictEqual(op.map(o => o.a.value), SH.map(s => s.ammo), 'every shell listed ' + op.map(o => o.a.value));
      const ot = op.map(o => o.a.text);
      assert.ok(ot[1].includes('models.armor.kind.heat') && !ot[1].includes('kind.heat, ') && ot[2].includes('models.armor.kind.he, models.armor.kind.heat') && ot[3].includes('thermobaric') && ot[4].includes('models.armor.kind.other'), 'kinds named: ' + ot.join(' | '));
    }
    // a 3D click runs the shot: the view's overlay is cleared at the start and shows the effects result; the panel warns about a
    // shell the gun does not load and gives the crew notes in the page words
    {
      const st3 = { 'models.armor.gun': 'g', 'models.armor.ammo': 'a1', 'models.armor.range': 100 }, E3 = { models: { subs: {}, parts: {} } }, asked = [], V3 = { shown: [], cleared: 0, pick: null };
      const FX = { ammoNotLoaded: { asked: 'a1', weapon: 'g', loads: ['b1'] }, engine: { crewNotes: [{ key: 'blast' }], crewNote: 'E', plates: [], events: [] }, facts: [], whole: [], samples: 400 };
      const el3 = (tag, a, kids) => Object.assign(fakeEl(tag, a, kids), { addEventListener() {}, value: '', style: {} });
      E3.models.parts.viewer = (c, o) => { const v = el3('div'); Object.assign(v, { setColors() {}, addLine() {}, clearLines() {}, highlight() {}, showShot(j) { V3.shown.push(j); return { missing: [] }; }, clearShot() { V3.cleared++; } }); V3.pick = o.onPick; return v; };
      const shotBodies = [], api3 = (u, b) => { asked.push(u); if (/shot$/.test(u)) shotBodies.push(b); if (/shells$/.test(u)) return Promise.resolve({ shells: [{ ammo: 'a1', kind: 'ap', penetration: [[0, 100]] }] });
        if (/shot$/.test(u)) return Promise.resolve({ plates: [], verdict: 'no_hit', ray: { origin: [0, 0, 0], dir: [1, 0, 0] } }); if (/effects$/.test(u)) return Promise.resolve(FX);
        if (/table$/.test(u)) return Promise.resolve({ unit: 't34', rows: [{ name: 'ram', id: 'ram', flags: ['not hit by shells (ram volume)'], sides: [] }], join: { notHit: [{ id: 'ram', name: 'ram', why: 'ram volume' }] } });
        return new Promise(() => {}); };
      new Function('EXT_SCREENS', 'LS', 'tx', 'api', 'S', 'h', script)(E3, { get: (k, d) => k in st3 ? st3[k] : d, set() {} }, k => k, api3, { cur: 'models' }, () => ({}));
      const body3 = el3('div'), tk3 = () => new Promise(r => setTimeout(r, 5));
      E3.models.subs.armor({ body: body3, set: { target: 't34' }, mod, el: el3, clear(x) { x.kids.length = 0; }, say() {}, k2: (a, b) => a + '.' + b });
      await tk3(); assert.ok(typeof V3.pick === 'function', 'the 3D view is made with onPick');
      const c0 = V3.cleared; V3.pick({ point: [1, 2, 3], volume: 'v' }); assert.ok(V3.cleared > c0, 'a new run clears the overlay');
      await tk3(); await tk3();
      assert.ok(asked.some(u => /effects$/.test(u)) && V3.shown[V3.shown.length - 1] === FX, 'the effects result goes to showShot');
      const s3 = keysIn(body3); assert.ok(s3.includes('models.armor.fx.notLoaded') && s3.includes('models.armor.crew.blast') && !s3.includes('\nE\n'), 'warning and crew note drawn ' + s3.slice(0, 200));
      // an outer ram box around an inner volume: the click goes through the box, the shot aims inside the inner one, which is selected
      const nShot = shotBodies.length, ramH = { volume: 'ram', side: 0, point: [40, 0, 0], aim: [39.75, 0, 0] }, innH = { volume: 'inner', side: 0, point: [10, 0, 0], aim: [9.75, 0, 0] };
      const ans = V3.pick({ volume: 'ram', side: 0, point: [40, 0, 0], origin: [100, 0, 0], dir: [-1, 0, 0], hits: [ramH, innH] });
      assert.deepStrictEqual(ans, { volume: 'inner' }, 'the view is told to select the inner volume');
      assert.ok(shotBodies.length === nShot + 1 && JSON.stringify(shotBodies[nShot].aim) === '[9.75,0,0]', 'the shot aims through the inner volume ' + JSON.stringify(shotBodies[nShot]));
      await tk3(); await tk3();
      const nOnly = shotBodies.length, ans2 = V3.pick({ volume: 'ram', side: 0, point: [40, 0, 0], origin: [100, 0, 0], dir: [-1, 0, 0], hits: [ramH] });
      assert.ok(shotBodies.length === nOnly && ans2 && ans2.volume === null, 'only the ram box under the click: no shot, nothing selected');
    }
    ok('jets and fires beside the blasts (fire catches, after how long, inflammation badge), jet and fire cause headings, gun / shell / range re-read on each draw');

    // the 3D view's Shoot from (the camera, first and default, or the side chosen below) and the ground beside the model, with the
    // Shot part on the page (its helpers aeFromDir, frameOf, aeWords) as index.js joins every sub file
    {
      const TG = EXT.models.subs.armor._t;
      assert.ok(TG.codeOf('ground') === 'G' && TG.catOf('ground') === 'stop' && TG.resKey('ground') === 'models.armor.res.G' && TG.endKey('ground') === 'ground', 'ground: code G, a stop-type end, its own words');
      assert.deepStrictEqual(TG.groundOf({ verdict: 'penetrate', outcome: 'ground', groundPoint: [5, 6, 0] }), [5, 6, 0], 'groundOf: through a plate, then the ground');
      assert.deepStrictEqual(TG.groundOf({ engine: { end: { result: 'ground', point: [1, 2, 0] } } }), [1, 2, 0]); assert.strictEqual(TG.groundOf({ verdict: 'penetrate', outcome: 'penetrate' }), null);
      assert.deepStrictEqual(TG.fxLine({ ray: { origin: [9, 9, 9] }, engine: { end: { result: 'ground', point: [1, 2, 0] } } }), { from: [9, 9, 9], to: [1, 2, 0] }, 'the line ends at the ground point');
      const LL = Object.assign({}, require('./shot.lang.json').en, require('./armor.lang.json').en), txG = (k, p) => (LL[k] || k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? String(p[x]) : m));
      const stG = { 'models.armor.gun': 'g', 'models.armor.ammo': 'a1', 'models.armor.range': 100 }, EG = { models: { subs: {}, parts: {} } }, VG = { pick: null, lines: [], tools: [], cam: null }, msgs = [];
      const made = [], elG = (tag, a, kids) => { const x = Object.assign(fakeEl(tag, a, kids), { ls: {}, addEventListener(k, f) { this.ls[k] = f; }, value: '', style: {} });
        if (tag === 'canvas') Object.assign(x, { width: 640, height: 480, getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }) }); made.push(x); return x; };
      const MIR = [1, 0, 0, 0, -1, 0, 0, 0, 1, 0, 0, 0], nv = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
      EG.models.parts.viewer = (c, o) => { const v = elG('div'); Object.assign(v, { setColors() {}, addLine(a, b) { VG.lines.push([a, b]); }, clearLines() { VG.lines.length = 0; }, highlight() {}, showShot() { return { missing: [] }; }, clearShot() {},
        addTool(t) { VG.tools.push(t); return t; }, camera() { return VG.cam; }, sceneInfo() { return { world: MIR, middle: [20, 0, 30], radius: 60, ctr: { 'basis/turret': [10, 0, 60] } }; } }); VG.pick = o.onPick; return v; };
      const B = { shot: [], effects: [] }; let shotReply = { plates: [], verdict: 'no_hit', ray: { origin: [0, 0, 0], dir: [1, 0, 0] } }, fxReply = { engine: { plates: [], events: [] }, facts: [], whole: [], samples: 400 };
      const GRIDG = { w: 4, h: 4, cell: 10, origin: [100, -20, 40], right: [0, 1, 0], up: [0, 0, 1] };
      const apiG = (u, b) => { const k = (u.match(/armor\/(\w+)$/) || [])[1]; if (B[k]) B[k].push(JSON.parse(JSON.stringify(b)));
        if (k === 'shells') return Promise.resolve({ shells: [{ ammo: 'a1', kind: 'ap', penetration: [[0, 100]] }] }); if (k === 'shot') return Promise.resolve(shotReply); if (k === 'effects') return Promise.resolve(fxReply);
        if (k === 'table') return Promise.resolve({ unit: 't34', rows: [], join: { notHit: [] } }); if (k === 'map') return Promise.resolve({ unit: 't34', grid: GRIDG, cells: [] }); return new Promise(() => {}); };
      const LSG = { get: (k, d) => k in stG ? stG[k] : d, set: (k, v) => { stG[k] = v; } };
      new Function('EXT_SCREENS', 'LS', 'tx', 'api', 'h', 'cssv', 'window', 'document', require('./shot.client'))(EG, LSG, txG, apiG, elG, () => '', {}, {});
      new Function('EXT_SCREENS', 'LS', 'tx', 'api', 'S', 'h', script)(EG, LSG, txG, apiG, { cur: 'models' }, () => ({}));
      const SH = EG.models.subs.model._shot, FM = SH.frameOf(MIR), tk5 = () => new Promise(r => setTimeout(r, 5));
      const bodyG = elG('div'); EG.models.subs.armor({ body: bodyG, set: { target: 't34' }, mod, el: elG, clear(x) { x.kids.length = 0; }, say(x, c, t) { if (t) msgs.push(t); }, k2: (a, b) => a + '.' + b });
      await tk5(); await tk5();
      const texts2 = o => [o.a && o.a.text].concat((o.kids || []).flatMap(c => typeof c === 'object' ? texts2(c) : [c])).filter(Boolean);
      const fromS = made.find(x => x.tag === 'select' && x.a['aria-label'] === LL['models.armor.from3d']);
      assert.ok(VG.tools.map(t => t.a.blk).join() === 'armor.map.v3.shot,armor.map.v3.from', 'Shot button and Shoot from in the view\'s tool row ' + VG.tools.map(t => t.a.blk));
      assert.ok(fromS && fromS.value === 'camera' && fromS.kids.map(o => o.a.value).join() === 'camera,side', 'Shoot from: the camera first and the default');
      // the camera: a click on a part shoots along the click ray at the clicked point
      const dC = nv([-0.7, 0.5, -0.4]), aeC = SH.aeFromDir(dC, FM), turH = { volume: 'basis/turret', name: 'turret', side: 0, point: [10, 0, 60], aim: [9.8, 0, 60] };
      const ans = VG.pick({ volume: 'basis/turret', side: 0, point: [10, 0, 60], origin: [300, -200, 200], dir: dC, hits: [turH], ground: null });
      assert.deepStrictEqual(ans, { volume: 'basis/turret' });
      assert.deepStrictEqual(B.shot.pop(), { mod, target: 't34', weapon: 'g', ammo: 'a1', range: 100, az: aeC[0], el: aeC[1], aim: [9.8, 0, 60], ground: 0 }, 'camera click: az / el from the click ray, aim at the point, ground: 0');
      await tk5(); await tk5();
      assert.ok(B.effects.length && B.effects[B.effects.length - 1].ground === 0 && B.effects[B.effects.length - 1].az === aeC[0], 'effects get the same shot with ground: 0');
      assert.ok(texts2(bodyG).includes('Shot at turret from the camera, ' + SH.aeWords(aeC[0], aeC[1])), 'title: where it came from in words ' + texts2(bodyG).slice(0, 12).join(' | '));
      // the Shot button: the active pane's camera towards the part clicked last
      const shotBtn = made.find(x => x.tag === 'button' && x.a.text === LL['models.armor.shotBtn']);
      VG.cam = { eye: [240, 100, 120], dir: nv([-1, 0, -0.2]), ortho: false }; shotBtn.a.onclick();
      const aeB = SH.aeFromDir(nv([10 - 240, 0 - 100, 60 - 120]), FM), b1 = B.shot.pop();
      assert.deepStrictEqual([b1.az, b1.el, b1.aimVolume, b1.aim, b1.ground], [aeB[0], aeB[1], 'basis/turret', undefined, 0], 'Shot button: the camera\'s eye to the part clicked last');
      await tk5(); await tk5();
      // a click on the ground beside the model (nothing shells hit under it): a shot at the ground point
      const gD = nv([-1, 0, -1]), G0 = [100, 0, 0], aeG = SH.aeFromDir(gD, FM);
      shotReply = { plates: [], verdict: 'ground', outcome: 'ground', groundPoint: [100, 0, 0], r: 'G', o: 'G', decisive: -1, ray: { origin: [400, 0, 300], dir: gD, ground: 0 } };
      fxReply = { ends: [{ result: 'ground', volume: null, chance: 1 }], engine: { plates: [], events: [], end: { result: 'ground', volume: null, point: [100, 0, 0], energyLeft: 1, burst: [100, 0, 0.3] } }, facts: [], whole: [], samples: 400, ray: { origin: [400, 0, 300], dir: gD, ground: 0 } };
      const ansG = VG.pick({ volume: null, side: -1, point: null, origin: [300, 0, 200], dir: gD, hits: [], ground: G0 });
      assert.deepStrictEqual(ansG, { volume: null }, 'nothing selected');
      assert.deepStrictEqual(B.shot.pop(), { mod, target: 't34', weapon: 'g', ammo: 'a1', range: 100, az: aeG[0], el: aeG[1], aim: G0, ground: 0 }, 'ground click: along the click ray at the ground point');
      await tk5(); await tk5();
      const tg = texts2(bodyG).join('\n');
      assert.ok(tg.includes('Shot at the ground at 100, 0, 0 from the camera') && tg.includes(txG('models.armor.v.G', { p: '100, 0, 0' })) && tg.includes(LL['models.armor.fxend.ground'] + ' 100%'), 'ground: title, verdict and end in words');
      assert.deepStrictEqual(VG.lines[0], [[400, 0, 300], [100, 0, 0]], 'the line ends at the ground point'); assert.strictEqual(VG.lines.length, 3, 'a cross marks it');
      // the ground nearer along the ray than the part under the click wins
      shotReply = { plates: [], verdict: 'no_hit', ray: { origin: [0, 0, 0], dir: [1, 0, 0] } };
      VG.pick({ volume: 'basis/body', side: 5, point: [50, 0, -50], origin: [300, 0, 200], dir: gD, hits: [{ volume: 'basis/body', side: 5, point: [50, 0, -50], aim: [49.8, 0, -50.2] }], ground: G0 });
      assert.deepStrictEqual(B.shot.pop().aim, G0, 'ground nearer than the part: the ground');
      shotBtn.a.onclick(); const b2 = B.shot.pop(), aeM = SH.aeFromDir(nv([20 - 240, 0 - 100, 30 - 120]), FM);
      assert.deepStrictEqual([b2.az, b2.el, b2.aimVolume], [aeM[0], aeM[1], undefined], 'Shot button with no part clicked last: towards the middle of the unit');
      await tk5(); await tk5();
      // the side chosen below: remembered; a level side cannot reach the ground; Top can
      fromS.value = 'side'; fromS.ls.change(); assert.strictEqual(stG['models.armor.from3d'], 'side', 'remembered in models.armor.from3d');
      const nS = B.shot.length; VG.pick({ volume: null, side: -1, point: null, origin: [300, 0, 200], dir: gD, hits: [], ground: G0 });
      assert.strictEqual(B.shot.length, nS, 'level side at the ground: nothing sent'); assert.ok(msgs.includes(LL['models.armor.groundLevel']), 'and says why');
      VG.pick({ volume: 'basis/turret', side: 0, point: [10, 0, 60], origin: [300, -200, 200], dir: dC, hits: [turH], ground: null });
      assert.deepStrictEqual([B.shot[B.shot.length - 1].az, B.shot[B.shot.length - 1].el, B.shot.pop().aim], [0, 0, [9.8, 0, 60]], 'side: from the front at the clicked point');
      await tk5(); await tk5(); assert.ok(texts2(bodyG).includes('Shot at turret from the front'), 'title names the side');
      made.find(x => x.tag === 'button' && x.a.text === 'Top').a.onclick(); await tk5(); await tk5();
      VG.pick({ volume: null, side: -1, point: null, origin: [300, 0, 200], dir: gD, hits: [], ground: G0 });
      assert.deepStrictEqual(((b) => [b.az, b.el, b.aim, b.ground])(B.shot.pop()), [0, 90, G0, 0], 'Top: from above at the ground point');
      await tk5(); await tk5();
      // a map click (origin / dir ray) sends ground: 0 too
      const cvs = made.find(x => x.tag === 'canvas'); cvs.ls.click({ clientX: 4, clientY: 4 });
      const bm = B.shot.pop(); assert.ok(bm && bm.origin && bm.dir && bm.ground === 0 && bm.az === undefined, 'map click: origin / dir with ground: 0 ' + JSON.stringify(bm));
      await tk5(); await tk5();
      // without the Shot part's helpers the camera falls back to the side (the earlier test page has no Shot part)
      assert.strictEqual(EXT.models.subs.armor._t.shotT(), null);
      assert.deepStrictEqual(TG.wayOf('camera', dC, null, MIR, [90, 0]), { cam: false, ae: [90, 0] }, 'no helpers: the side');
    }
    ok('3D Shoot from: the camera (default, click ray, Shot button from camera()) or the side (remembered); the ground beside the model with ground: 0 in every body, nearer ground wins, level side cannot reach; G end words, line and cross');
  }

  // ---------- tool output ----------
  reply = () => ({ code: 1, stdout: JSON.stringify({ ok: false, refused: true, reason: 'This value is shared', shared: { volumes: ['body2'] }, changes: [] }), stderr: '' });
  j = await call('edit', { mod, target: 't34', volume: 'basis/body', side: 'front', mm: 60, dry: true });
  assert.ok(j.ok === false && j.refused && j.shared.volumes[0] === 'body2' && j.code === 1, 'a refusal comes back as data');
  reply = () => ({ code: 2, stdout: '', stderr: 'usage: armorsim ...' });
  await assert.rejects(call('table', { mod, target: 'x1' }), e => e.status === 400 && /usage/.test(e.message));
  reply = () => ({ code: 1, stdout: 'not json', stderr: 'Error: Cannot find module tools/armorsim/armorsim.js' });
  await assert.rejects(call('table', { mod, target: 'x2' }), e => /not part of this copy/.test(e.message));
  ok('tool output: a refusal is data (exit 1 + JSON), usage errors and a missing tool become a plain 400');

  // mm on the slope below plain geometry: the share of the slope the game counted, worked back from nominal, angle, effective
  {
    const j = S.slopeInfo({ shell: { calibre: 88 }, decisive: 0, plates: [
      { nominal: 45, angle: 60.3, effective: 80.9 }, { nominal: 80, angle: 60.3, effective: 161.5 }, { nominal: 45, angle: 60.3, effective: 45 }, { nominal: 30, angle: 0, effective: 30 }, { nominal: 0, angle: 30, effective: 0 }] });
    const s = j.plates.map(p => p.slope);
    assert.deepStrictEqual(s[0], { geo: 90.8, share: 0.78, how: 'part' }, JSON.stringify(s[0]));
    assert.strictEqual(s[1].how, 'full'); assert.strictEqual(s[2].how, 'none'); assert.strictEqual(s[3].how, 'flat'); assert.strictEqual(s[4], undefined);
    for (const l of ['en', 'ru', 'uk', 'zh']) for (const k of ['rule', 'part', 'partNoCal', 'full', 'none', 'flat']) assert.ok(L[l]['models.armor.slope.' + k], l + ' ' + k);
    assert.ok(/thin against the shell's calibre/.test(L.en['models.armor.slope.rule']) && /\{p\}% of the slope/.test(L.en['models.armor.slope.part']));
    assert.ok(/slopeText\(p,j\)/.test(script) && /models\.armor\.slope\.rule/.test(script), 'the page shows the slope note on the cell, under the header and in Details');
    reply = () => ({ code: 0, stdout: JSON.stringify({ unit: 't34', shell: { calibre: 88 }, decisive: 0, plates: [{ nominal: 45, angle: 60.3, effective: 80.9 }] }), stderr: '' });
    const r = await call('shot', { mod, target: 't34', weapon: 'w', ammo: 'a', range: 100, az: 0, el: 0 });
    assert.strictEqual(r.plates[0].slope.share, 0.78, JSON.stringify(r.plates[0]));
    ok('shot: each plate says how much of the slope counted (45 mm at 60.3 deg against 88 mm: 78%, geometry 90.8)');
  }

  console.log('PASS models armor (' + n + ')');
})().catch(e => { console.error(e); process.exit(1); });
