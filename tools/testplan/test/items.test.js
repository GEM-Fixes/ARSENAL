// Author: Imperator_Aug (ARSENAL, ia-d02e181a)
'use strict';
// testplan items part: node items.test.js [scratch dir]   (no game install; the index and the units list are hand-built and injected)
const fs = require('fs'), os = require('os'), path = require('path');
const items = require('../lib/items.js');

const scratch = process.argv[2] || path.join(os.tmpdir(), 'testplan-items');
fs.mkdirSync(scratch, { recursive: true });

let passed = 0, failed = 0;
function ok(cond, name, detail) {
  if (cond) passed++;
  else { failed++; console.log('FAIL ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : '')); }
}
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), name, { got: a, want: b });

// ---------- a small hand-built index (entityindex shape) ----------
const E = 'resource/entity/', S = 'resource/set/stuff/';
function ent(key, o) {
  return Object.assign({ key, name: key.slice(key.lastIndexOf('/') + 1, -4), layer: 'mod', source: 'mod', inherits: [], extenders: [], extl: [], etype: ['actor', key, 1], model: null, refs: [], deps: [key], dh: 'x' }, o || {});
}
function mkIndex() {
  const entities = {}, stuff = {}, models = {};
  const addE = r => { entities[r.key] = r; };
  addE(ent(E + '-vehicle/tank/t34/t34.def', { model: E + '-vehicle/tank/t34/t34.mdl', refs: [['weapon', '76mm_zis5', 't34.def', 10], ['weapon', 'dt', 't34.def', 11], ['ammo', 'bullet76 ap', 't34.def', 12]], deps: [E + '-vehicle/tank/t34/t34.def', 'resource/properties/tank.ext', E + '-vehicle/tank/t34/gun.inc'] }));
  addE(ent(E + '-vehicle/tank/t34_85/t34_85.def', { source: 'vanilla', model: E + '-vehicle/tank/t34_85/t34_85.mdl', inherits: [E + '-vehicle/tank/t34/t34.def'], refs: [['weapon', 'dt', 'x', 1]], deps: [E + '-vehicle/tank/t34_85/t34_85.def', E + '-vehicle/tank/t34/t34.def', 'resource/properties/tank.ext'] }));
  addE(ent(E + '-vehicle/cannon/zis3/zis3.def', { model: E + '-vehicle/cannon/zis3/zis3.mdl', refs: [['weapon', '76mm_zis5', 'zis3.def', 5]] }));
  addE(ent(E + 'humanskin/rus/rus_rifle/rus_rifle.def', { model: E + 'humanskin/rus/rus_rifle/rus_rifle.mdl' }));
  addE(ent(E + 'construction/house1/house1.def', { model: E + 'construction/house1/house1.mdl', etype: ['construction', 'x', 1] }));
  addE(ent(E + '-vehicle/tank/pz4/pz4.def', { model: E + '-vehicle/tank/pz4/pz4.mdl', refs: [['weapon', '75mm_kwk40', 'pz4.def', 3]] }));
  const addS = (k, name, tags) => { stuff[k] = { key: k, name, tags, from: null, refs: [], deps: [k], dh: 'x' }; };
  addS(S + 'gun/76mm_zis5.weapon', '76mm_zis5', ['76mm_zis5']);
  addS(S + 'gun/75mm_kwk40.weapon', '75mm_kwk40', ['75mm_kwk40']);
  addS(S + 'mgun/dt.weapon', 'dt', ['dt', 'mgun']);
  addS(S + 'rifle/mosin.weapon', 'mosin', ['mosin', 'rifle']);
  addS(S + 'ammo/bullet76.ammo', 'bullet76', ['bullet76']);
  addS(S + 'helmet/ssh40.item', 'ssh40', ['ssh40', 'helmet']);
  models[E + '-vehicle/tank/t34/t34.mdl'] = { key: E + '-vehicle/tank/t34/t34.mdl', refs: [['ply', 'body.ply', 'm', 1], ['vol', 'body.vol', 'm', 2], ['texture', 't34_body', 'm', 3], ['texture', '$/texture/common/track', 'm', 4]] };
  models[E + '-vehicle/tank/t34_85/t34_85.mdl'] = { key: E + '-vehicle/tank/t34_85/t34_85.mdl', refs: [['ply', 'body.ply', 'm', 1], ['texture', '$/texture/common/track', 'm', 4]] };
  models[E + '-vehicle/cannon/zis3/zis3.mdl'] = { key: E + '-vehicle/cannon/zis3/zis3.mdl', refs: [['texture', 'zis3', 'm', 1]] };
  models[E + 'humanskin/rus/rus_rifle/rus_rifle.mdl'] = { key: E + 'humanskin/rus/rus_rifle/rus_rifle.mdl', refs: [['texture', 'rus_rifle.dds', 'm', 1]] };
  models[E + 'construction/house1/house1.mdl'] = { key: E + 'construction/house1/house1.mdl', refs: [['texture', 'house1', 'm', 1]] };
  models[E + '-vehicle/tank/pz4/pz4.mdl'] = { key: E + '-vehicle/tank/pz4/pz4.mdl', refs: [['texture', 'pz4', 'm', 1]] };
  const idx = { meta: {}, entities, stuff, models, aux: {} };
  idx.byName = n => Object.values(entities).filter(r => r.name === String(n).toLowerCase());
  idx.usersOf = (kind, value) => { const out = []; for (const r of Object.values(entities)) for (const f of r.refs) if (f[0] === kind && f[1].toLowerCase() === String(value).toLowerCase()) out.push({ entity: r, ref: f }); return out; };
  idx.stuffFind = t => { const w = String(t).toLowerCase().split(/\s+/).filter(Boolean); return w.length ? Object.keys(stuff).filter(k => w.every(x => stuff[k].tags.includes(x))) : []; };
  const breedFiles = {
    'resource/set/breed/mp/rus/rifle.set': '{breed\r\n\t{skin "rus_rifle"}\r\n\t{inventory\r\n\t\t{item "mosin"}\r\n\t\t{item "ammo rifle" 60}\r\n\t\t{item "ssh40"}\r\n\t}\r\n}\r\n',
    'resource/set/breed/mp/rus/tankman.set': '{breed\r\n\t{skin "rus_tankman"} ; no such skin in the index\r\n\t{inventory {item "dt"}}\r\n}\r\n',
  };
  const keys = new Set([].concat(Object.keys(entities), Object.keys(stuff), Object.keys(models), Object.keys(breedFiles), ['resource/set/breed/.presets']));
  const src = { get: k => (breedFiles[k] === undefined ? null : Buffer.from(breedFiles[k], 'latin1')) };
  return { idx, keys, src };
}
const UNITS = [
  { id: 't34', kind: 'vehicle', army: 'rus', cost: 300, buyable: true, name: 'T-34', members: [{ breed: 'mp/rus/tankman', n: 4 }], crew: 4, def: E + '-vehicle/tank/t34/t34.def', defMod: true, tags: ['rus', 'tank'], content: '* ( mp/rus/tankman:4)', cardFile: 'resource/set/multiplayer/units/vehicles.set', cardLine: 4 },
  { id: 'zis3', kind: 'vehicle', army: 'rus', cost: 120, buyable: true, name: 'ZiS-3', members: [{ breed: 'mp/rus/tankman', n: 3 }], def: E + '-vehicle/cannon/zis3/zis3.def', tags: 'rus cannon', content: '* ( mp/rus/tankman:3)', cardFile: 'resource/set/multiplayer/units/vehicles.set' },
  { id: 'rus_rifles', kind: 'squad', army: 'rus', cost: 90, buyable: true, name: 'Riflemen', members: [{ breed: 'mp/rus/rifle', n: 5 }], tags: ['rus', 'infantry'], content: 'mp/rus/rifle:5', cardFile: 'resource/set/multiplayer/units/squads.set' },
  { id: 'rifle(rus)', kind: 'soldier', army: 'rus', cost: 15, buyable: false, name: 'Rifleman', members: [{ breed: 'mp/rus/rifle', n: 1 }], tags: ['rus', 'infantry'], content: 'mp/rus/rifle', cardFile: 'resource/set/multiplayer/units/squads.set' },
];
const stackAs = { gameDir: 'X:/nogame', exe: 'as64', gid: 'as64', kind: 'as2', mods: [], folder: scratch, name: 'fx' };
const F = (rel, state, area) => ({ rel, state: state || 'changed', area: area || undefined, size: 1, mtimeMs: 1 });
const get = (r, id) => r.items.find(i => i.id === id);
const ids = r => r.items.map(i => i.id);
const run = (files, opt, stack) => items.from(stack || stackAs, { since: 'last', files }, Object.assign({ index: mkIndex(), units: UNITS }, opt || {}));

(async () => {
  // ----- 1. every kind from a file list (no index, no game dir: file level only) -----
  {
    const list = [
      ['resource/entity/-vehicle/tank/T34/T34.def', 'entity:t34'],
      ['resource/entity/-vehicle/tank/t34/body.ply', 'model:entity/-vehicle/tank/t34/body.ply'],
      ['resource/texture/common/track.dds', 'model:texture/common/track.dds'],
      ['resource/set/stuff/gun/76mm_zis5.weapon', 'weapon:76mm_zis5'],
      ['resource/set/stuff/ammo/bullet76.ammo', 'ammo:bullet76'],
      ['resource/set/breed/mp/rus/rifle.set', 'breed:set/breed/mp/rus/rifle.set'],
      ['resource/set/squad/rus.set', 'squad:set/squad/rus.set'],
      ['resource/set/multiplayer/units/vehicles.set', 'card:set/multiplayer/units/vehicles.set'],
      ['resource/map/multi/2v2_test/map', 'mission:map/multi/2v2_test'],
      ['resource/map/single/m1/0.mi', 'mission:map/single/m1/0.mi'],
      ['localization/desc.lng', 'text:localization/desc.lng'],
      ['resource/localizations/default/interface/text/desc.pot', 'text:localizations/default/interface/text/desc.pot'],
      ['resource/interface/scene/icons/t34.dds', 'interface:interface/scene/icons/t34.dds'],
      ['resource/sound/weapon/zis5.wav', 'sound:sound/weapon/zis5.wav'],
      ['resource/script/multiplayer/bot.data.lua', 'script:script/multiplayer/bot.data.lua'],
      ['resource/entity/-vehicle/tank/t34/gun.inc', 'script:entity/-vehicle/tank/t34/gun.inc'],
      ['resource/properties/tank.ext', 'properties:properties/tank.ext'],
      ['gamelogic.pak!set/stuff/mgun/dt.weapon', 'weapon:dt'],
      ['mod.info', 'other:other'],
    ];
    const r = await items.from({ gameDir: '' }, { files: list.map(x => F(x[0])) }, {});
    for (const [rel, id] of list) ok(!!get(r, id), 'kind ' + id, ids(r));
    const kinds = new Set(r.items.map(i => i.kind));
    eq(items.KINDS.filter(k => !kinds.has(k)), [], 'every kind made');
    ok(r.needsGame === true, 'no game dir -> needsGame');
    eq(r.unmapped, ['mod.info'], 'unmapped list');
    eq(get(r, 'entity:t34').cls, 'vehicle', 'cls from the folder without an index');
    eq(get(r, 'entity:t34').why, [{ rel: 'resource/entity/-vehicle/tank/T34/T34.def', state: 'changed' }], 'why keeps the rel as given');
    ok(r.items.every(i => i.source === 'changed' && Array.isArray(i.via) && Array.isArray(i.weapons) && Array.isArray(i.carriers) && Array.isArray(i.cards) && i.id === i.kind + ':' + i.key), 'item shape');
  }

  // ----- 2. texture -> model -> entity -> card -----
  {
    const r = await run([F('resource/entity/-vehicle/tank/t34/t34_body.dds')]);
    const tex = get(r, 'model:entity/-vehicle/tank/t34/t34_body.dds'), mdl = get(r, 'model:entity/-vehicle/tank/t34/t34.mdl'), e = get(r, 'entity:t34'), c = get(r, 'card:t34');
    ok(tex && tex.source === 'changed', 'texture item changed');
    ok(mdl && mdl.source === 'depends' && mdl.via[0] === tex.id, 'model depends via texture', mdl);
    ok(e && e.source === 'depends' && e.via.includes(mdl.id), 'entity depends via model', e);
    ok(c && c.source === 'depends' && c.via.includes('entity:t34'), 'card depends via entity', c);
    eq(e.why, [{ rel: 'resource/entity/-vehicle/tank/t34/t34_body.dds', state: 'changed' }], 'why carried down');
    eq(c.cards, [{ card: 't34', army: 'rus', buyable: true }], 'card ref');
    ok(!get(r, 'entity:pz4') && !get(r, 'entity:zis3'), 'no unrelated entity pulled', ids(r));
    // a shared texture named with a rooted path reaches both models
    const s = await run([F('resource/texture/common/track.dds')]);
    ok(get(s, 'entity:t34') && get(s, 'entity:t34_85'), 'shared texture -> both tanks', ids(s));
    // a ply named by two models in their own folders reaches only the folder's model
    const p = await run([F('resource/entity/-vehicle/tank/t34/body.ply')]);
    ok(get(p, 'model:entity/-vehicle/tank/t34/t34.mdl') && !get(p, 'model:entity/-vehicle/tank/t34_85/t34_85.mdl'), 'ply -> its own model only', ids(p));
    // the .mdl itself
    const m = await run([F('resource/entity/construction/house1/house1.mdl')]);
    ok(get(m, 'entity:house1') && get(m, 'entity:house1').via[0] === 'model:entity/construction/house1/house1.mdl', 'mdl -> entity');
    // deps off
    const n = await run([F('resource/entity/-vehicle/tank/t34/t34_body.dds')], { deps: false });
    eq(ids(n), ['model:entity/-vehicle/tank/t34/t34_body.dds'], 'deps:false pulls nothing');
  }

  // ----- 3. weapon -> carriers, both ways -----
  {
    const r = await run([F('resource/set/stuff/gun/76mm_zis5.weapon')]);
    const w = get(r, 'weapon:76mm_zis5');
    eq(w.carriers, ['t34', 'zis3'], 'carriers of the weapon');
    const t = get(r, 'entity:t34'), z = get(r, 'entity:zis3');
    ok(t && t.source === 'depends' && t.via[0] === w.id, 'carrier t34 pulled');
    eq(t.weapons, ['76mm_zis5', 'dt'], 'weapons of t34');
    eq(z && z.weapons, ['76mm_zis5'], 'weapons of zis3');
    ok(get(r, 'card:t34') && get(r, 'card:zis3'), 'carrier cards pulled', ids(r));
    ok(!get(r, 'entity:pz4'), 'pz4 does not carry it');
    // a rifle: carried by a breed, so by the skin entity and the squad
    const h = await run([F('resource/set/stuff/rifle/mosin.weapon')]);
    eq(get(h, 'weapon:mosin').carriers, ['rus_rifle'], 'human carrier of the rifle');
    eq(get(h, 'entity:rus_rifle').weapons, ['mosin'], 'human weapons from the breed inventory (no ammo, no helmet)');
    ok(get(h, 'squad:rus_rifles') && get(h, 'card:rifle(rus)'), 'squad and soldier card pulled', ids(h));
    // ammo
    const a = await run([F('resource/set/stuff/ammo/bullet76.ammo')]);
    eq(get(a, 'ammo:bullet76').carriers, ['t34'], 'ammo carriers');
    ok(get(a, 'entity:t34') && get(a, 'entity:t34').via[0] === 'ammo:bullet76', 'ammo pulls the entity');
    // a stuff file that is no weapon: unmapped
    const x = await run([F('resource/set/stuff/helmet/ssh40.item', 'changed', 'set')]);
    eq(x.unmapped, ['resource/set/stuff/helmet/ssh40.item'], 'helmet unmapped');
    eq(ids(x), ['other:set'], 'one other item for the area');
  }

  // ----- 4. breed -> skin entity + squad card; changed entity -> cards and inheritors -----
  {
    const r = await run([F('resource/set/breed/mp/rus/rifle.set')]);
    const b = get(r, 'breed:set/breed/mp/rus/rifle.set');
    eq(b.name, 'mp/rus/rifle', 'breed name');
    eq(b.weapons, ['mosin'], 'breed weapons');
    ok(get(r, 'entity:rus_rifle') && get(r, 'entity:rus_rifle').via[0] === b.id, 'breed pulls its skin entity');
    ok(get(r, 'squad:rus_rifles') && get(r, 'squad:rus_rifles').via.includes(b.id), 'breed pulls the squad card', get(r, 'squad:rus_rifles'));
    const e = await run([F('resource/entity/-vehicle/tank/t34/t34.def')]);
    const t = get(e, 'entity:t34');
    ok(t.source === 'changed' && t.via.length === 0, 'changed entity');
    eq(t.name, 'T-34', 'entity name from the units list');
    eq(t.file, 'entity/-vehicle/tank/t34/t34.def', 'entity file');
    ok(get(e, 'card:t34') && get(e, 'card:t34').source === 'depends', 'changed entity pulls its card');
    ok(get(e, 'entity:t34_85') && get(e, 'entity:t34_85').via[0] === 'entity:t34', 'inheritor pulled', ids(e));
    // an .inc used by an entity, and a units file
    const i = await run([F('resource/entity/-vehicle/tank/t34/gun.inc')]);
    ok(get(i, 'script:entity/-vehicle/tank/t34/gun.inc') && get(i, 'entity:t34') && !get(i, 'entity:zis3'), '.inc pulls its users', ids(i));
    const u = await run([F('resource/set/multiplayer/units/squads.set')]);
    eq(get(u, 'card:set/multiplayer/units/squads.set').cards.map(c => c.card), ['rus_rifles', 'rifle(rus)'], 'cards of a units file');
    ok(get(u, 'squad:rus_rifles') && !get(u, 'card:t34'), 'rows of the file only', ids(u));
    // changed and depended: stays changed, once
    const two = await run([F('resource/set/stuff/gun/76mm_zis5.weapon'), F('resource/entity/-vehicle/cannon/zis3/zis3.def')]);
    ok(two.items.filter(x => x.id === 'entity:zis3').length === 1 && get(two, 'entity:zis3').source === 'changed' && get(two, 'entity:zis3').via.length === 0, 'changed wins over depends');
    // the cap
    const cap = await run([F('resource/properties/tank.ext')], { maxDeps: 1 });
    ok(cap.items.filter(x => x.kind === 'entity').length === 1 && get(cap, 'entity:t34') && cap.notes.some(n => /used by 2 entities/.test(n)), 'maxDeps cap: mod entity first, note', cap.notes);
  }

  // ----- 5. cls: vehicle gun human static -----
  {
    const r = await run([F('resource/entity/-vehicle/tank/t34/t34.def'), F('resource/entity/-vehicle/cannon/zis3/zis3.def'), F('resource/entity/humanskin/rus/rus_rifle/rus_rifle.def'), F('resource/entity/construction/house1/house1.def'), F('resource/entity/-vehicle/tank/pz4/pz4.def')]);
    eq(['t34', 'zis3', 'rus_rifle', 'house1', 'pz4'].map(n => get(r, 'entity:' + n).cls), ['vehicle', 'gun', 'human', 'static', 'vehicle'], 'cls of five entities');
    eq(get(r, 'entity:house1').cards, [], 'static has no card');
    eq(items.clsOf('', 'x', [], false, false), 'other', 'cls other without a key');
    ok(get(r, 'entity:t34').cls && items.CLS.includes(get(r, 'entity:t34').cls), 'cls word in CLS');
    // card class beats the folder: a gun card on an entity outside /cannon/
    eq(items.clsOf('resource/entity/-vehicle/tank/x/x.def', 'x', [{ id: 'x', tags: ['cannon'], content: '* ( a:1)' }], false, false), 'gun', 'card class gun');
  }

  // ----- 6. GoH-shaped card id: period in the id, vehicle = first word of {content} -----
  {
    const gu = [
      { id: 'mp/rus/mid/t34', kind: 'vehicle', army: 'rus', buyable: true, name: 'T-34 (mid)', members: [{ breed: 'mp/rus/tankman', n: 4 }], tags: ['mid'], content: 't34 ( mp/rus/tankman:4)', cardFile: 'resource/set/multiplayer/units/rus.set' },
      { id: 'mp/rus/early/rifle', kind: 'soldier', army: 'rus', buyable: true, name: 'Rifleman', members: [{ breed: 'mp/rus/rifle', n: 1 }], tags: ['early'], content: 'mp/rus/rifle', cardFile: 'resource/set/multiplayer/units/rus.set' },
    ];
    const gs = { gameDir: 'X:/nogoh', exe: 'goh', gid: 'goh', kind: 'goh', mods: [], folder: scratch };
    const r = await run([F('resource/entity/-vehicle/tank/t34/t34.def'), F('resource/set/breed/mp/rus/rifle.set')], { units: gu }, gs);
    eq(get(r, 'entity:t34').cards, [{ card: 'mp/rus/mid/t34', army: 'rus', buyable: true }], 'goh vehicle card by the first content word');
    ok(get(r, 'card:mp/rus/mid/t34') && get(r, 'card:mp/rus/mid/t34').via[0] === 'entity:t34', 'goh card item keeps the period id', ids(r));
    eq(get(r, 'entity:t34').cls, 'vehicle', 'goh cls from the folder');
    ok(get(r, 'card:mp/rus/early/rifle') && get(r, 'entity:rus_rifle') && get(r, 'entity:rus_rifle').cls === 'human', 'goh soldier card and human skin');
  }

  // ----- 7. the stack's own functions, failures, seeded defects -----
  {
    let calls = 0;
    const st = Object.assign({}, stackAs, { index: async s => { calls++; return mkIndex(); }, units: async s => { calls++; return UNITS; } });
    const r = await items.from(st, { files: [F('resource/entity/-vehicle/tank/t34/t34.def')] });
    ok(calls === 2 && get(r, 'card:t34') && r.needsGame === false, 'index and units through the stack functions');
    const bad = Object.assign({}, stackAs, { index: async () => { throw new Error('boom\nmore'); }, units: async () => [] });
    const b = await items.from(bad, { files: [F('resource/entity/-vehicle/tank/t34/t34.def')] });
    ok(b.needsGame === true && b.notes.some(n => /not built: boom$/.test(n)) && get(b, 'entity:t34'), 'index failure -> note, file-level item kept', b.notes);
    // seeded defect 1: a change row with no path must be caught (a note), never an item, never a throw
    const d1 = await run([{ state: 'changed' }, F(''), null, F('resource/set/stuff/mgun/dt.weapon')]);
    ok(d1.notes.filter(n => /no path/.test(n)).length === 3 && get(d1, 'weapon:dt') && d1.items.every(i => i.key), 'seeded: pathless change rows caught', d1.notes);
    // seeded defect 2: a file with the right folder but the wrong kind of content must not become a weapon or a model
    const d2 = await run([F('resource/set/stuff/gun/readme.txt.bak', 'added', 'set'), F('resource/entity/-vehicle/tank/t34/notes.txt', 'added', 'entity'), F('resource/entity/nowhere/notes.txt', 'added', 'entity')]);
    ok(get(d2, 'entity:t34') && get(d2, 'entity:t34').why[0].rel.endsWith('notes.txt'), 'a stray file of an entity folder goes to the entity');
    eq(d2.unmapped, ['resource/set/stuff/gun/readme.txt.bak', 'resource/entity/nowhere/notes.txt'], 'seeded: stray files are unmapped', ids(d2));
    ok(!d2.items.some(i => i.kind === 'weapon' || i.kind === 'model'), 'seeded: a stray file in a weapon folder is no weapon', ids(d2));
    // seeded defect 3: a removed weapon the index does not know keeps empty carriers and pulls nothing
    const d3 = await run([F('resource/set/stuff/gun/ghost.weapon', 'removed')]);
    eq([get(d3, 'weapon:ghost').carriers, d3.items.length], [[], 1], 'seeded: unknown weapon pulls nothing');
    // seeded defect 4: changes that are not a list
    const d4 = await items.from(stackAs, { files: 'x' }, { index: mkIndex(), units: [] });
    ok(d4.items.length === 0 && d4.notes.some(n => /not a list/.test(n)), 'seeded: bad changes object caught');
    // removed file keeps its state
    const rm = await run([F('resource/entity/-vehicle/tank/pz4/pz4.def', 'removed')]);
    eq(get(rm, 'entity:pz4').why[0].state, 'removed', 'removed state kept');
    eq(items.gameKey('Resource\\Entity\\A.DEF'), 'entity/a.def', 'gameKey');
    eq(items.gameKey('resource/x.pak!entity/a/a.def'), 'entity/a/a.def', 'gameKey of a pak entry');
  }

  console.log(passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('FAIL crash :: ' + (e && e.stack || e)); console.log(passed + ' passed, ' + (failed + 1) + ' failed'); process.exit(1); });
