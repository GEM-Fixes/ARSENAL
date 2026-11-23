// units ext test: fixture game (fixture.js) -> every route: search (Tiger -> pz6e, T-34 -> t34_*, did you mean), stats,
// change (price preview/write, name into a mod copy of desc.lng, armour macro, refusals), add (vehicle clone + wreck + card + bots,
// squad copy), compare, army price, hints, recipes (squad size, rifle range). No game, no network.
// usage: node test.js <scratch dir>
// Author: Imperator_Aug (ARSENAL, ia-8315448f)
const fs = require('fs'), path = require('path'), cp = require('child_process'), assert = require('assert');
const ext = require('./index');
const fx = require('./fixture');
const TOOLS = path.resolve(__dirname, '..', '..', '..');
const scratch = path.resolve(process.argv[2] || path.join(__dirname, 'work'));
fs.mkdirSync(scratch, { recursive: true });
const { game, mod } = fx.make(scratch);
const tmpRoot = path.join(scratch, 'tmp'); fs.rmSync(tmpRoot, { recursive: true, force: true }); fs.mkdirSync(tmpRoot, { recursive: true });
const ctx = {
  gamedir: game, tools: TOOLS, tmpRoot, allowLaunch: false, modAgeMs: 0, game: () => game,
  runTool: async (tool, entry, args, o) => {
    const r = cp.spawnSync(process.execPath, [path.join(TOOLS, entry), ...args], { encoding: 'utf8', timeout: (o && o.timeoutMs) || 60000 });
    return { code: r.status, stdout: r.stdout, stderr: r.stderr, timedOut: !!(r.error && r.error.code === 'ETIMEDOUT') };
  },
};
const R = ext.routes;
const call = async (name, body) => R['POST /api/x/units/' + name]('/api/x/units/' + name, body, ctx);
const refuses = async (name, body, re) => { try { await call(name, body); } catch (e) { assert.strictEqual(e.status, 400, name + ': status ' + e.status + ' ' + e.message); if (re) assert.ok(re.test(e.message), name + ': ' + e.message); return e.message; } throw new Error(name + ': expected a refusal'); };
const rd = k => fs.readFileSync(path.join(mod, k), 'latin1');
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };

(async () => {
  // module shape + lang
  assert.strictEqual(ext.id, 'units'); assert.ok(/EXT_SCREENS\.units\s*=/.test(ext.script));
  assert.ok(!/[`]|\$\{|innerHTML|insertAdjacentHTML|document\.write/.test(ext.script), 'script rules');
  for (const l of ['ru', 'uk', 'zh']) for (const k of Object.keys(ext.lang.en)) assert.ok(ext.lang[l][k], l + ' missing ' + k);
  const used = [...ext.script.matchAll(/tx\('([^']+)'/g)].map(m => m[1]).filter(k => k.startsWith('units.'));
  for (const k of used) assert.ok(ext.lang.en[k], 'en missing ' + k);
  ok('module, script rules, lang keys');

  // search
  let s = await call('search', { q: 'Tiger' });
  assert.strictEqual(s.results[0].id, 'pz6e'); ok('Tiger -> pz6e');
  s = await call('search', { q: 'T-34' });
  assert.deepStrictEqual(s.results.map(r => r.id).sort(), ['t34_0', 't34_3']); ok('T-34 -> t34_0, t34_3');
  s = await call('search', { q: 'tigr' });
  assert.ok(s.didYouMean.some(d => d.id === 'pz6e'), JSON.stringify(s)); ok('did you mean tigr -> Tiger');
  s = await call('search', { q: '', army: 'rus', kind: 'squad' });
  assert.deepStrictEqual(s.results.map(r => r.id), ['riflemans(rus)']); ok('filter army + kind');
  const st = await R['GET /api/x/units/status']('/api/x/units/status?mod=' + encodeURIComponent(mod), null, ctx);
  assert.ok(st.modOk && st.hasModInfo); ok('status');

  // stats
  const t = await call('stats', { id: 't34_3' });
  assert.strictEqual(t.name, 'T-34/85'); assert.strictEqual(t.speed, 32); assert.strictEqual(t.gun.weapon, '85mm_zis_s53');
  assert.deepStrictEqual(t.armor, { front: 90, side: 75, rear: 52, top: 20 });
  assert.strictEqual(t.unlock.startWait, 60); assert.strictEqual(t.unlock.afterBuy, 120); assert.strictEqual(t.crew, 5);
  ok('stats t34_3 (name, speed, gun, armour, unlock 120 x (1-0.5) = 60 s, crew)');
  assert.strictEqual(t.unlock.res, 'mp'); assert.strictEqual(t.unlock.factor, 1);
  {
    // game mode presets: the v4 button is paid with special points and medium tanks wait half as long
    const d3 = path.join(scratch, 'eco'), f3 = fx.make(d3);
    fs.mkdirSync(path.join(f3.game, 'resource/set/multiplayer/games'), { recursive: true });
    fs.writeFileSync(path.join(f3.game, 'resource/set/multiplayer/games/presets.inc'), ['{budgets', '\t{vehicle {resource} {buttons "squad1 squad2"}}', '\t{hero {resource {start 10}} {buttons "v4"} {tag "special"}}', '}', '{chargeFactors {value "medium=0.5;*=2"}}', ''].join('\r\n'));
    const c3 = Object.assign({}, ctx, { gamedir: f3.game, game: () => f3.game, tmpRoot: path.join(d3, 'tmp') }); fs.mkdirSync(c3.tmpRoot, { recursive: true });
    const r3 = (name, body) => R['POST /api/x/units/' + name]('/api/x/units/' + name, body, c3);
    const e = await r3('stats', { id: 't34_3' });
    assert.deepStrictEqual([e.unlock.res, e.unlock.factor, e.unlock.startWait, e.unlock.afterBuy], ['sp', 0.5, 30, 60], JSON.stringify(e.unlock));
    const q = await r3('search', { q: '' });
    assert.strictEqual(q.results.find(x => x.id === 'riflemans(rus)').res, 'mp'); assert.strictEqual(q.results.find(x => x.id === 'pz6e').res, 'sp');
    ok('presets: price in special points for the hero budget buttons, wait = unlock x factor x (1 - head start) = 120 x 0.5 x 0.5 = 30 s, after a buy 60 s');
  }

  // guards
  await refuses('change', { id: 't34_0', field: 'cost', value: '400', mod: game }, /game install/);
  await refuses('change', { id: 't34_0', field: 'cost', value: '400' }, /mod folder/);
  await refuses('change', { id: 't34_0', field: 'level', value: '2.5', mod }, /whole number/);
  await refuses('change', { id: 't34_0', field: 'fore', value: '3', mod }, /between/);
  ok('refusals: game dir, no mod, level 2.5, fore 3');

  // change price: preview writes nothing, write edits the mod copy
  let c = await call('change', { id: 't34_0', field: 'cost', value: '400', mod });
  assert.ok(!c.written && !c.errors.length, JSON.stringify(c.errors)); assert.deepStrictEqual(c.rows[0], { field: 'cost', old: '350', new: '400' });
  assert.ok(!fs.existsSync(path.join(mod, 'resource'))); assert.ok(c.files[0].lines.some(l => /\{cost 400\}/.test(l)));
  c = await call('change', { id: 't34_0', field: 'cost', value: '400', mod, write: true });
  assert.ok(c.written); assert.ok(/"t34_0".*\{cost 400\}/.test(rd('resource/set/multiplayer/units/vehicles_rus.set')));
  assert.ok(/\r\n/.test(rd('resource/set/multiplayer/units/vehicles_rus.set')));
  ok('price preview then write (CRLF kept)');
  c = await call('change', { id: 't34_3', field: 'charge', value: '90', mod, write: true });
  assert.ok(c.written, JSON.stringify(c.errors)); assert.ok(/"t34_3".*c\(90\)/.test(rd('resource/set/multiplayer/units/vehicles_rus.set'))); ok('unlock time (charge in the "v" macro args)');
  c = await call('change', { id: 'riflemans(rus)', field: 'cost', value: '120', mod, write: true });
  assert.ok(c.written, JSON.stringify(c.errors)); assert.ok(/side\(rus\) name\(riflemans\).*cost\(120\)/.test(rd('resource/set/multiplayer/units/squads.set')));
  assert.ok(/side\(ger\) name\(riflemans\).*cost\(150\)/.test(rd('resource/set/multiplayer/units/squads.set'))); ok('squad price (other side untouched)');

  // name: a vanilla desc.lng key -> mod copy of desc.lng
  c = await call('change', { id: 'pz6e', field: 'name', value: 'Tiger I (mod)', mod, write: true });
  assert.ok(c.written && !c.errors.length, JSON.stringify(c.errors));
  const lng = fs.readFileSync(path.join(mod, 'localization/desc.lng'), 'utf8');
  assert.ok(/"pz6e" "Tiger I \(mod\)"/.test(lng) && /T-34\/76/.test(lng)); ok('name into localization/desc.lng (vanilla copy kept)');

  // armour macro form
  await refuses('change', { id: 'pz6e', field: 'armor', part: 'armor_heavy/turret', value: '120 80', mod }, /exactly 4/);
  c = await call('change', { id: 'pz6e', field: 'armor', part: 'armor_heavy/turret', value: '120 _ _ 30', mod });
  assert.ok(!c.errors.length, JSON.stringify(c.errors)); assert.strictEqual(c.rows[0].new, '120 80 80 30');
  c = await call('change', { id: 'pz6e', field: 'armor', part: 'armor_heavy/turret', value: '120 _ _ 30', mod, write: true });
  assert.ok(/turret\(120 80 80 30\)/.test(rd('resource/entity/-vehicle/tank_heavy/pz6e/pz6e.def'))); ok('armour macro (turret) preview + write');

  // catalogue sees the mod now
  const t2 = await call('stats', { id: 'pz6e', mod });
  assert.strictEqual(t2.name, 'Tiger I (mod)'); assert.strictEqual(t2.vanilla.name, 'PzKpfw VI Tiger'); assert.strictEqual(t2.armor.front, 120); ok('stats with mod vs vanilla');

  // add a vehicle: clone + wreck + card + bots
  await refuses('add', { like: 't34_0', id: 'T34 bad', mod }, /lower-case/);
  await refuses('add', { like: 't34_0', id: 't34_3', mod }, /already exists/);
  let a = await call('add', { like: 't34_0', id: 't34_custom', name: 'T-34 Custom', price: '380', bots: true, mod });
  assert.ok(!a.written && !a.errors.length, JSON.stringify(a.errors)); assert.ok(!fs.existsSync(path.join(mod, 'resource/entity/-vehicle/tank_medium')), 'dry run wrote files');
  a = await call('add', { like: 't34_0', id: 't34_custom', name: 'T-34 Custom', price: '380', bots: true, mod, write: true });
  assert.ok(a.written, JSON.stringify(a.errors));
  const vr = rd('resource/set/multiplayer/units/vehicles_rus.set');
  assert.ok(/"t34_custom".*\{cost 380\}/.test(vr) && /"t34_0".*\{cost 400\}/.test(vr), vr);
  const ents = fs.readdirSync(path.join(mod, 'resource/entity'), { recursive: true }).map(String).join('|').replace(/\\/g, '/');
  assert.ok(/t34_custom\/t34_custom\.def/.test(ents) && /t34_custom_x\/t34_custom_x\.def/.test(ents), ents);
  assert.ok(/unit = "t34_custom"/.test(rd('resource/script/multiplayer/bot.data.lua')));
  assert.strictEqual(a.bots.state, 'added');
  assert.ok(fs.readdirSync(path.join(mod, 'localization')).some(f => /^#/.test(f) && /T-34 Custom/.test(fs.readFileSync(path.join(mod, 'localization', f), 'utf8'))));
  ok('add vehicle: clone, _x wreck, card 380, bots row, name');
  // squad copy, bots not asked -> plain "missed"
  a = await call('add', { like: 'riflemans(rus)', id: 'guards', name: 'Guards', price: '200', mod, write: true });
  assert.ok(a.written, JSON.stringify(a.errors)); assert.strictEqual(a.bots.state, 'missed');
  assert.ok(/name\(guards\).*cost\(200\)/.test(rd('resource/set/multiplayer/units/squads.set'))); ok('add squad (bots missed warning)');
  // build a buy: a squad of picked soldiers stays a macro line; a group with vehicles is a card block that repeats "vehicle ( crew )"
  let by = await call('buy', { id: 'assault', name: 'Assault Team', army: 'rus', parts: [{ id: 'mp/rus/squadleader', n: 1 }, { id: 'mp/rus/rifle', n: 7 }], price: '180', level: '2', mod });
  assert.ok(!by.written && !by.errors.length, JSON.stringify(by.errors)); assert.strictEqual(by.buy.men, 8); assert.strictEqual(by.buy.placedLike.id, 'guards(rus)');   // the army's squad with the nearest price (200)
  assert.ok(by.files.some(f => f.lines.some(l => /name\(assault\).*c1\(squadleader:1\) c2\(rifle:7\).*level\(2\) cost\(180\)/.test(l)))); assert.ok(!rd('resource/set/multiplayer/units/squads.set').includes('assault'));
  ok('buy: squad preview (macro line, price, rank, nothing written)');
  by = await call('buy', { id: 'tank_pair', name: 'Tank Pair', army: 'rus', parts: [{ id: 't34_0', n: 2 }, { id: 'mp/rus/rifle', n: 4 }], price: '800', bots: true, mod, write: true });
  assert.ok(by.written, JSON.stringify(by.errors)); assert.strictEqual(by.buy.vehicles, 2); assert.strictEqual(by.buy.sum, 2 * (await call('search', { q: 't34_0', mod })).results.find(u => u.id === 't34_0').cost); assert.strictEqual(by.buy.seat.id, 't34_0');
  const bq = rd('resource/set/multiplayer/units/squads.set');
  assert.ok(bq.includes('{content "mp/rus/rifle:4 t34_0 ( mp/rus/tankman:3 mp/rus/tankman2:1 ) t34_0 ( mp/rus/tankman:3 mp/rus/tankman2:1 )"}'), bq);
  assert.ok(/\{"tank_pair\(rus\)"[\s\S]*\{tags "all medium rus"\}[\s\S]*\{button "v4"\}[\s\S]*\{cost 800\}/.test(bq), bq);
  assert.ok((await call('search', { q: 'tank_pair', mod })).results.some(u => u.id === 'tank_pair(rus)' && u.cost === 800));
  ok('buy: vehicle group written (crew per vehicle, sits with the vehicle, found again)');
  await refuses('buy', { id: 'x1', army: 'rus', parts: [{ id: 'riflemans(rus)', n: 1 }], mod }, /is a squad/);
  await refuses('buy', { id: 'x1', army: 'rus', parts: [], mod }, /at least one/);
  await refuses('buy', { id: 'tank_pair', army: 'rus', parts: [{ id: 'mp/rus/rifle', n: 2 }], mod }, /already exists/);
  await refuses('buy', { id: 'x1', army: 'rus', parts: [{ id: 'mp/rus/rifle', n: 99 }], mod }, /between 1 and 30/);
  await refuses('buy', { id: 'x1', army: 'rus', like: 'riflemans(ger)', parts: [{ id: 'mp/rus/rifle', n: 2 }], mod }, /same army/);
  ok('buy: refusals (squad as a part, empty, id taken, count, squad of another army)');
  // the models of a buy (3D line-up): once each with its count, vehicles first; soldiers as breed: targets
  let lk = await call('models', { id: 'tank_pair(rus)', mod });
  assert.deepStrictEqual(lk.models.map(m => m.target + ' x' + m.n), ['t34_0 x2', 'breed:mp/rus/rifle x4', 'breed:mp/rus/tankman x6', 'breed:mp/rus/tankman2 x2']); assert.strictEqual(lk.vehicles, 2); assert.strictEqual(lk.men, 12);
  lk = await call('models', { id: 'pz6e', mod });
  assert.deepStrictEqual(lk.models.map(m => m.target + ' x' + m.n), ['pz6e x1', 'breed:mp/ger/tankman x4', 'breed:mp/ger/tankman2 x1']);
  lk = await call('models', { id: 'riflemans(ger)', mod });
  assert.deepStrictEqual(lk.models.map(m => m.kind + ' ' + m.target), ['soldier breed:mp/ger/squadleader', 'soldier breed:mp/ger/rifle']);
  lk = await call('models', { army: 'rus', parts: [{ id: 't34_0', n: 1 }, { id: 'mp/rus/rifle', n: 3 }], mod });
  assert.deepStrictEqual(lk.models.map(m => m.target + ' x' + m.n), ['t34_0 x1', 'breed:mp/rus/tankman x3', 'breed:mp/rus/tankman2 x1', 'breed:mp/rus/rifle x3']);
  ok('models of a buy: a written group, a vehicle with its crew, a squad, the buy being built');

  // balance
  const cmp = await call('compare', { mod });
  const ids = cmp.rows.map(r => r.id + ':' + r.status);
  for (const x of ['t34_0:changed', 't34_custom:new', 'guards(rus):new', 'pz6e:changed']) assert.ok(ids.includes(x), ids.join(' '));
  ok('compare vanilla vs mod');
  let ap = await call('armyprice', { army: 'rus', kind: 'vehicle', percent: 10, mod });
  assert.ok(ap.rows.length === 3 && !ap.written, JSON.stringify(ap.rows));
  assert.deepStrictEqual(ap.rows.find(r => r.id === 't34_0'), { id: 't34_0', name: 'T-34/76', kind: 'vehicle', res: 'mp', old: 400, new: 440 });
  await refuses('armyprice', { army: 'rus', percent: 0, mod }, /percent/);
  ap = await call('armyprice', { army: 'rus', kind: 'vehicle', percent: 10, mod, write: true });
  assert.ok(/"t34_0".*\{cost 440\}/.test(rd('resource/set/multiplayer/units/vehicles_rus.set'))); ok('whole-army price +10%');
  const h = await call('hints', { id: 't34_custom', mod });
  assert.ok(h.similar.length >= 2 && h.median > 0, JSON.stringify(h)); ok('price hints');

  // recipes
  let rc = await call('recipe', { recipe: 'squad', id: 'riflemans(ger)', breed: 'rifle', count: 7, mod });
  assert.deepStrictEqual(rc.rows[0].old + '>' + rc.rows[0].new, '5>7');
  rc = await call('recipe', { recipe: 'squad', id: 'riflemans(ger)', breed: 'rifle', count: 7, mod, write: true });
  assert.ok(/side\(ger\) name\(riflemans\).*c2\(rifle:7\)/.test(rd('resource/set/multiplayer/units/squads.set'))); ok('bigger squad');
  rc = await call('recipe', { recipe: 'range', weapon: 'mosin', range: '80 90', mod });
  assert.ok(!rc.errors.length, JSON.stringify(rc.errors)); assert.strictEqual(rc.rows[0].old, '65 70'); assert.ok(/rifle\.pattern/.test(rc.inheritedFrom));
  rc = await call('recipe', { recipe: 'range', weapon: 'mosin', range: '80 90', mod, write: true });
  assert.ok(/\{range 80 90\}/.test(rd('resource/set/stuff/rifle/mosin'))); ok('longer rifle range (inherited from the pattern)');

  // describe a new unit in words: preview (plan + trial run), write only the previewed spec, refusals
  await refuses('describe', { text: 'purple monkey dishwasher', mod }, /Nothing in that description/);
  await refuses('describe', { text: 'soviet tank', id: 'Bad Id', mod }, /new id/);
  let ds = await call('describe', { text: 'soviet rifle squad, cost 150, called Guards Rifles', mod });
  assert.ok(!ds.errors.length, JSON.stringify(ds.errors)); assert.strictEqual(ds.unit.kind, 'squad'); assert.strictEqual(ds.described.by, 'offline');
  assert.ok(ds.described.understood.some(x => /Soviet/.test(x)) && ds.rows.some(r => r.field === 'cost' && String(r.new) === '150'), JSON.stringify(ds.rows));
  assert.ok(!ds.written && ds.spec && ds.spec.ops.some(o => o.op === 'squad')); ok('describe: squad preview (understood, price row, spec returned, nothing written)');
  const dsw = await call('describe', { text: 'as previewed', mod, write: true, spec: ds.spec });
  assert.ok(dsw.written, JSON.stringify(dsw.errors)); assert.ok(rd('resource/set/multiplayer/units/squads.set').includes('name(' + ds.unit.id.split('(')[0] + ')')); ok('describe: write runs the previewed spec');
  await refuses('describe', { text: 'as previewed', mod, write: true, spec: { target: 'as64', ops: [{ op: 'mod', name: 'evil' }] } }, /Preview again/);
  await refuses('describe', { text: 'as previewed', mod, write: true, spec: { target: 'as64', ops: [{ op: 'clone', entity: 'no_such_unit', as: 'zz_new' }] } }, /Preview again/);
  ok('describe: a spec with other ops or unknown units is refused at write');
  // a late refusal (the fixture T-34 has no model to join a turret to) shows in the preview and leaves no half-made unit in the mod
  ds = await call('describe', { text: 'T-34 hull with the turret of the Tiger', mod });
  assert.ok(ds.errors.some(e => e.code === 'GEN_KITBASH_NO_MODEL'), JSON.stringify(ds.errors)); assert.ok(ds.described.kitbash && ds.rehearsed);
  const dk = await call('describe', { text: 'as previewed', mod, write: true, spec: ds.spec });
  assert.ok(!dk.written && !fs.existsSync(path.join(mod, 'resource/entity/-vehicle/tank_medium/' + ds.unit.id))); ok('describe: late refusal seen in preview, nothing half-written');
  const stt = await R['GET /api/x/units/status']('/api/x/units/status?mod=', null, ctx);
  assert.strictEqual(typeof stt.ai.ok, 'boolean'); ok('status reports whether AI reading is available');

  // equipment (owner 2026-11-22): a soldier's inventory as the game's grid. Own fixture: a 4 x 3 box, sized items, a held rifle
  {
    const K0 = require('./kit'), dk2 = path.join(scratch, 'kitfx'); fs.rmSync(dk2, { recursive: true, force: true });
    const fk = fx.make(dk2), putk = (k, t) => { const f = path.join(fk.game, k); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t.replace(/\n/g, '\r\n'), 'latin1'); };
    putk('resource/properties/human.ext', '{extender "inventory"\n\t{box\n\t\t{Size 4 3}\n\t\t{Weight 100}\n\t}\n}\n');
    putk('resource/set/stuff/rifle/mosin', '{from "pattern rifle"\n\t{filling "rifle" 5}\n\t{entity "mosin"}\n\t{inventory {size 3 1}{weight 4}}\n}\n');
    putk('resource/set/stuff/rifle/big_gun', '{from "pattern rifle"\n\t{inventory {size 4 3}{weight 9}}\n}\n');
    putk('resource/set/stuff/ammo/rifle.ammo', '{ammo\n\t{inventory {size 1 1}{weight 0.5}}\n}\n');
    putk('resource/set/stuff/grenade/f1', '{grenade\n\t{inventory {size 1 1}{weight 50}}\n}\n');
    putk('resource/set/stuff/misc/medkit', '{item\n}\n');
    // every item line form the engine reads (owner 2026-11-22, the Gates of Hell paratrooper): named ammunition loaded, counts with a spread
    putk('resource/set/stuff/smg/sten', `{from "pattern smg"
	{filling "smg ammo" 32}
	{inventory {size 2 1}{weight 3}}
}
`);
    putk('resource/set/stuff/smg/thompson', `{from "pattern smg"
	{desc "desc/weapon/tommy"}
	{filling "smg ammo" 30}
	{inventory {size 2 1}{weight 3}}
}
`);
    putk('resource/set/stuff/ammo/smg.ammo', `{ammo
	{inventory {size 1 1}{weight 0.5}}
}
`);
    putk('resource/set/stuff/grenade/no69.grenade', `{grenade
	{inventory {size 1 1}{weight 50}}
}
`);
    putk('resource/set/breed/mp/rus/para.set', `{breed
	{inventory
		{item "sten" filling "smg ammo" 32} ; loaded
		{item "smg ammo" 160}
		{item "f1" 1.25 0.5}
		{item "no69 grenade" 0.5 0.5}
		{item "thompson" filled 60}
		{in_hands 0}
	}
}
`);
    putk('resource/interface/text/desc.lng', `{weapon
	{sten "Sten Mk II"}
	{tommy "Thompson M1"}
	{f1 "F-1 grenade"}
}
{stuff
	{no69 "No. 69 grenade"}
}
{ammo
	{smg "9 mm rounds"}
}
`);
    putk('resource/set/breed/mp/rus/rifle.set', '{breed\n\t{behaviour soldier}\n\t{inventory\n\t\t{item "mosin" filled}\n\t\t{item "rifle ammo" 30}\n\t\t{in_hands 0}\n\t}\n}\n');
    const ck = Object.assign({}, ctx, { gamedir: fk.game, game: () => fk.game, tmpRoot: path.join(dk2, 'tmp') }); fs.mkdirSync(ck.tmpRoot, { recursive: true });
    const kc = (name, body) => R['POST /api/x/units/' + name]('/api/x/units/' + name, Object.assign({ mod: fk.mod }, body), ck);
    const kno = async (name, body, re) => { try { await kc(name, body); } catch (e) { assert.strictEqual(e.status, 400, name + ': status ' + e.status + ' ' + e.message); assert.ok(re.test(e.message), name + ': ' + e.message); return; } throw new Error(name + ': expected a refusal'); };
    const brf = 'resource/set/breed/mp/rus/rifle.set';
    let k = await kc('kit', { breed: 'rus/rifle' });
    assert.deepStrictEqual([k.grid.w, k.grid.h, k.from, k.file, k.pictures], [4, 3, 'game', brf, 'model']);
    assert.deepStrictEqual(k.items.map(i => [i.item, i.count, i.w, i.h, i.x, i.y, i.kind, i.inHands, i.rounds].join(' ')), ['mosin 1 3 1 0 0 weapon true 5', 'rifle ammo 30 1 1 3 0 ammo false ']);
    assert.deepStrictEqual(k.pieces.map(p => [p.x, p.y, p.w, p.h, p.count].join(' ')), ['0 0 3 1 1', '3 0 1 1 30']); assert.strictEqual(k.notFit.length, 0);
    assert.strictEqual((await kc('kit', { id: 'mp/rus/rifle' })).breed, 'rus/rifle');
    ok('kit: the grid of human.ext (4 x 3), each item with its cells, kind, rounds and the held one; by soldier id or file');
    k = await kc('kit', { id: 'riflemans(rus)' });
    assert.deepStrictEqual([k.unit.kind, k.soldiers.map(s => s.id + ' x' + s.n).join(), k.grid], ['squad', 'mp/rus/squadleader x1,mp/rus/rifle x5', undefined]);
    k = await kc('kit', { id: 't34_0' }); assert.deepStrictEqual(k.soldiers.map(s => s.id).sort(), ['mp/rus/tankman', 'mp/rus/tankman2']);
    ok('kit: a squad or a vehicle answers with its soldiers');
    // an edit not saved yet (pending) is laid out by the same rule: f1 weighs 50, two per cell; the medkit has no size (2 x 2)
    k = await kc('kit', { breed: 'rus/rifle', pending: { add: [{ item: 'f1', count: 3 }, { item: 'medkit', count: 1 }], del: [] } });
    assert.ok(k.pending && k.items[2].isNew && k.items[2].perStack === 2 && k.items[2].cells.length === 2 && !k.items[3].sized && k.items[3].w === 2, JSON.stringify(k.items.slice(2)));
    k = await kc('kit', { breed: 'rus/rifle', pending: { add: [{ item: 'big_gun', count: 1 }], del: [] } });
    assert.deepStrictEqual(k.notFit, [{ index: 2, item: 'big_gun', name: '', count: 1 }]);
    ok('kit: pending edits are laid out too (stacks by weight, default size 2 x 2, what does not fit)');
    const ki = await kc('kit/items', {});
    assert.deepStrictEqual(ki.items.map(i => i.item + ':' + i.kind).sort(), ['big_gun:weapon', 'f1:grenade', 'medkit:other', 'mosin:weapon', 'no69 grenade:grenade', 'rifle ammo:ammo', 'smg ammo:ammo', 'sten:weapon', 'thompson:weapon']);
    ok('kit/items: what a soldier can carry, with its kind (no pattern files)');
    // the equipment browser's data (owner 2026-11-22): headings from the folders and kinds, with counts, in page order; per item
    // the heading, the file, the model its picture is drawn from and the ammunition a weapon loads
    assert.deepStrictEqual(ki.groups, [{ id: 'rifle', n: 2 }, { id: 'smg', n: 2 }, { id: 'grenade', n: 2 }, { id: 'ammo', n: 2 }, { id: 'other', n: 1 }]);
    assert.strictEqual(ki.groups.reduce((a, g) => a + g.n, 0), ki.items.length, 'every item stands under one heading');
    const kby = n => ki.items.find(i => i.item === n);
    assert.deepStrictEqual([kby('mosin').heading, kby('mosin').group, kby('mosin').file, kby('mosin').model, kby('mosin').ammo, kby('mosin').mag], ['rifle', 'rifle', 'set/stuff/rifle/mosin', 'mosin', 'rifle ammo', 5]);
    assert.deepStrictEqual([kby('sten').heading, kby('sten').ammo, kby('sten').ammoName, kby('sten').mag, kby('sten').model], ['smg', 'smg ammo', '9 mm rounds', 32, null]);
    assert.deepStrictEqual([kby('f1').heading, kby('rifle ammo').heading, kby('medkit').heading, kby('medkit').ammo, kby('no69 grenade').heading], ['grenade', 'ammo', 'other', '', 'grenade']);
    assert.deepStrictEqual(K0.HEADINGS.filter(h => !ext.lang.en['units.kit.br.g.' + h]), [], 'every heading has its words');
    assert.deepStrictEqual(['rifle', 'smg', 'mgun', 'pistol', 'bazooka', 'flame', 'mortar', 'reactive', 'melee', 'explosive', 'med', 'special', 'head', 'body', 'capacity', 'my_mod_folder'].map(t => K0.headingOf({ top: t, kind: 'other', all: [] })),
      ['rifle', 'smg', 'mgun', 'pistol', 'antitank', 'flame', 'heavy', 'heavy', 'melee', 'explosive', 'medical', 'tools', 'headgear', 'gear', 'container', 'other']);
    assert.deepStrictEqual([K0.headingOf({ top: 'x', kind: 'weapon', all: ['a', 'smg'] }), K0.headingOf({ top: 'x', kind: 'weapon', all: [] }), K0.headingOf({ top: 'rifle', kind: 'ammo', all: [] })], ['smg', 'weapon', 'ammo']);
    ok('kit/items: headings with counts (folders and kinds of the game data), file, picture model and the ammunition a weapon loads');
    // sameness: asked again = the same answer; a new item file in the mod is seen at once; an unrelated mod file changes nothing
    assert.deepStrictEqual(await kc('kit/items', {}), ki);
    const kmf = path.join(fk.mod, 'resource/set/stuff/med/bandage'); fs.mkdirSync(path.dirname(kmf), { recursive: true }); fs.writeFileSync(kmf, '{item\r\n\t{inventory {size 1 1}{weight 1}}\r\n}\r\n', 'latin1');
    // (the page's read-only lists take the last walk of the mod while a new one runs: the request after it sees the edit)
    let ki2 = null; for (let i = 0; i < 50 && !(ki2 && ki2.items.some(x => x.item === 'bandage')); i++) { ki2 = await kc('kit/items', {}); await new Promise(r => setTimeout(r, 20)); }
    assert.deepStrictEqual([ki2.items.length, ki2.groups.find(g => g.id === 'medical'), ki2.items.find(i => i.item === 'bandage').file], [ki.items.length + 1, { id: 'medical', n: 1 }, 'set/stuff/med/bandage']);
    fs.rmSync(path.join(fk.mod, 'resource/set/stuff'), { recursive: true, force: true });
    for (let i = 0; i < 50 && (await kc('kit/items', {})).items.length !== ki.items.length; i++) await new Promise(r => setTimeout(r, 20));
    const kuf = path.join(fk.mod, 'resource/map/x.txt'); fs.mkdirSync(path.dirname(kuf), { recursive: true }); fs.writeFileSync(kuf, 'x');
    assert.deepStrictEqual(await kc('kit/items', {}), ki); fs.rmSync(path.join(fk.mod, 'resource/map'), { recursive: true, force: true });
    ok('kit/items: the same answer when asked again, rebuilt when the mod gets an item file, unchanged by an unrelated mod file');
    await kno('kit/set', { breed: 'rus/rifle', add: [{ item: 'nope', count: 1 }] }, /no item named "nope"/);
    await kno('kit/set', { breed: 'rus/rifle', add: [{ item: 'big_gun', count: 1 }] }, /does not fit/);
    await kno('kit/set', { breed: 'rus/rifle' }, /Nothing to change/);
    await kno('kit/set', { id: 'riflemans(rus)', add: [{ item: 'f1', count: 1 }] }, /not one soldier/);
    await kno('kit/set', { breed: 'rus/rifle', mod: '', add: [{ item: 'f1', count: 1 }] }, /mod folder/);
    await kno('kit', { breed: 'rus/no_such' }, /No soldier file/);
    ok('kit/set refuses in plain words: unknown item, does not fit, nothing to change, a squad, no mod');
    let ks = await kc('kit/set', { breed: 'rus/rifle', add: [{ item: 'f1', count: 2 }, { item: 'mosin', filled: false }], inHands: 'f1' });
    assert.deepStrictEqual(ks.rows.map(r => [r.field, r.part || '', r.old, r.new].join(' ')), ['item f1 0 2', 'loaded mosin 5 0', 'hands  mosin f1']);
    assert.ok(!ks.written && !ks.errors.length && !fs.existsSync(path.join(fk.mod, brf)) && ks.kit.items.some(i => i.item === 'f1' && i.inHands), JSON.stringify(ks.errors));
    ok('kit/set preview: rows (count, loaded, in the hands), the grid after the change, nothing written');
    ks = await kc('kit/set', { breed: 'rus/rifle', write: true, add: [{ item: 'f1', count: 2 }, { item: 'rifle ammo', count: 12 }] });
    assert.ok(ks.written, JSON.stringify(ks.errors));
    const kt = fs.readFileSync(path.join(fk.mod, brf), 'latin1');
    assert.ok(kt.includes('{item "rifle ammo" 12}') && kt.includes('{item "f1" 2}') && kt.includes('{in_hands 0}') && !/[^\r]\n/.test(kt), JSON.stringify(kt));
    assert.ok(fs.readFileSync(path.join(fk.game, brf), 'latin1').includes('{item "rifle ammo" 30}'), 'the game file is untouched');
    k = await kc('kit', { breed: 'rus/rifle' });
    assert.deepStrictEqual([k.from, k.items.map(i => i.item + ' ' + i.count).join()], ['mod', 'mosin 1,rifle ammo 12,f1 2']);
    ok('kit/set write: the soldier file copied into the mod with the change (CRLF kept), the game file untouched, the next read is the mod');
    // every line form: read as it is, shown truthfully (a count the game rolls is a range), named as the game names it
    const prf = 'resource/set/breed/mp/rus/para.set', rdp = () => fs.readFileSync(path.join(fk.mod, prf), 'latin1');
    k = await kc('kit', { breed: 'rus/para' });
    assert.deepStrictEqual(k.items.map(i => [i.item, i.name, i.n, i.spread, i.min, i.max, i.varies, i.loaded, i.ammo, i.rounds, i.inHands].join('|')), [
      'sten|Sten Mk II|1|0|1|1|false|ammo|smg ammo|32|true', 'smg ammo|9 mm rounds|160|0|160|160|false||||false', 'f1|F-1 grenade|1.25|0.5|1|2|true||||false',
      'no69 grenade|No. 69 grenade|0.5|0.5|0|1|true||||false', 'thompson|Thompson M1|1|0|1|1|false|own||60|false']);
    assert.deepStrictEqual([k.nameLang, k.items[0].ammoName, k.items[4].own, k.items[4].ownName, k.items[4].roundsSet, k.notFit.length], ['game', '9 mm rounds', 'smg ammo', '9 mm rounds', 60, 0]);
    assert.deepStrictEqual((await kc('kit/items', {})).items.filter(i => /sten|thompson|medkit/.test(i.item)).map(i => i.item + '=' + i.name).sort(), ['medkit=', 'sten=Sten Mk II', 'thompson=Thompson M1']);
    ok('kit: count + spread and filling lines read (least and most the game can give, ammunition, rounds); names from the game text, {desc} key first, none = empty');
    k = await kc('kit', { breed: 'rus/para', pending: { add: [{ item: 'no69 grenade', count: 1.5 }, { item: 'sten', filled: true }], del: [] } });
    assert.deepStrictEqual([k.items[3].n, k.items[3].spread, k.items[3].min, k.items[3].max, k.items[0].loaded, k.items[0].rounds, k.items[0].inHands], [1.5, 0.5, 1, 2, 'own', 32, true]);
    await kno('kit', { breed: 'rus/para', pending: { add: [{ item: 'f1', spread: 0 }] } }, /whole number from 1 up/);
    await kno('kit/set', { breed: 'rus/para', add: [{ item: 'sten', filling: 'laser ammo', rounds: 5 }] }, /no ammunition named/);
    ok('kit: a pending edit of such a line keeps its other parts; a fraction without a spread and unknown ammunition are refused in plain words');
    // edited, put in the hands and written: the parts not named stay as they were, with the line's comment
    ks = await kc('kit/set', { breed: 'rus/para', write: true, showNames: true, add: [{ item: 'no69 grenade', count: 2 }, { item: 'sten', rounds: 20 }, { item: 'f1', spread: 1 }], inHands: 'no69 grenade' });
    assert.ok(ks.written, JSON.stringify(ks.errors));
    assert.deepStrictEqual(ks.rows.map(r => [r.field, r.part || '', r.old, r.new].join('|')), ['item|No. 69 grenade|0 - 1|2', 'loaded|Sten Mk II|32 x 9 mm rounds|20 x 9 mm rounds', 'item|F-1 grenade|1 - 2|0 - 2', 'spread|F-1 grenade|0.5|1', 'hands||Sten Mk II|No. 69 grenade']);
    let pt = rdp();
    for (const l of ['{item "sten" filling "smg ammo" 20} ; loaded', '{item "smg ammo" 160}', '{item "f1" 1.25 1}', '{item "no69 grenade" 2 0.5}', '{item "thompson" filled 60}', '{in_hands 3}']) assert.ok(pt.includes(l), l + ' in ' + JSON.stringify(pt));
    assert.ok(!/[^\r]\n/.test(pt), 'CRLF kept');
    ok('kit/set write: a spread line and a filling line edited and put in the hands, the rest of each line kept, {in_hands} on the right line');
    ks = await kc('kit/set', { breed: 'rus/para', write: true, inHands: 'sten' });
    assert.ok(ks.written && rdp().includes('{in_hands 0}') && rdp().includes('{item "sten" filling "smg ammo" 20} ; loaded'), rdp());
    ok('kit/set write: a weapon with named ammunition goes into the hands without its line being rewritten');
    // the held weapon removed: the next weapon in the list is held, the index is right in the file
    k = await kc('kit', { breed: 'rus/para', pending: { del: ['sten'] } });
    assert.deepStrictEqual([k.handover, k.items.filter(i => i.inHands).map(i => i.item).join()], [{ from: 'sten', fromName: 'Sten Mk II', to: 'thompson', toName: 'Thompson M1' }, 'thompson']);
    ks = await kc('kit/set', { breed: 'rus/para', write: true, del: ['sten'] });
    assert.ok(ks.written, JSON.stringify(ks.errors));
    assert.deepStrictEqual([ks.rows.map(r => [r.field, r.part || '', r.old, r.new].join('|')), ks.handover.to], [['item|sten|1|0', 'handover||sten|thompson'], 'thompson']);
    pt = rdp(); assert.ok(!pt.includes('"sten"') && pt.includes('{in_hands 3}') && /\{item "thompson" filled 60\}\s*\{in_hands 3\}/.test(pt), pt);
    ok('kit/set write: removing the held weapon hands over to the next weapon, {in_hands} points at it');
    ks = await kc('kit/set', { breed: 'rus/para', write: true, del: ['thompson'] });
    pt = rdp(); assert.ok(ks.written && ks.handover.to === null && !pt.includes('in_hands') && pt.includes('{item "no69 grenade" 2 0.5}'), pt);
    k = await kc('kit', { breed: 'rus/para' }); assert.ok(!k.items.some(i => i.inHands));
    await kno('kit/set', { breed: 'rus/para', inHands: false }, /Nothing to change/);
    ks = await kc('kit/set', { breed: 'rus/para', write: true, inHands: 'f1' }); assert.ok(ks.written && rdp().includes('{in_hands 1}'), rdp());
    ks = await kc('kit/set', { breed: 'rus/para', write: true, inHands: false }); assert.ok(ks.written && !rdp().includes('in_hands'), rdp());
    ok('kit/set write: no weapon left = nothing held (the {in_hands} line goes); hands set again and emptied on request');
    // a vehicle (owner 2026-11-22: "Equipment should also be shown for vehicles including weapons that can be masked into a slot"):
    // its own box as the grid, its weapon slots, what each slot takes by its mask, a slot change previewed and written
    {
      const vdef = 'resource/entity/-vehicle/tank_medium/t34_3/t34_3.def';
      putk('resource/properties/tank.ext', '{extender "inventory"\n\t{box\n\t\t{Size 5 4}\n\t\t{Weight 1000}\n\t\t{item "repair_kit" 2}\n\t}\n}\n');
      putk('resource/properties/human.ext', '{extender "inventory"\n\t{box\n\t\t{Size 4 3}\n\t\t{Weight 100}\n\t}\n\t{hand_left}\n\t{armor "head"\n\t\t{mask "head"}\n\t}\n}\n');
      putk('resource/set/stuff/misc/repair_kit', '{item\n\t{inventory {size 1 1}{weight 10}}\n}\n');
      putk('resource/set/stuff/gun/dt', '{weapon\n\t{tag "weapon mgun"}\n\t{filling "mgun ammo" 63}\n\t{entity "dt"}\n\t{inventory {size 2 1}{weight 10}}\n}\n');
      putk('resource/set/stuff/gun/dshk', '{weapon\n\t{tag "weapon mgun"}\n\t{filling "mgun ammo" 50}\n\t{entity "dshk"}\n\t{inventory {size 3 1}{weight 30}}\n}\n');
      putk('resource/set/stuff/gun/85mm_zis_s53', '{weapon\n\t{filling "bullet85 ammo" 1}\n}\n');
      putk('resource/set/stuff/shell/bullet85.ammo', '{ammo\n\t{inventory {size 1 1}{weight 20}}\n}\n');
      putk('resource/set/stuff/ammo/mgun.ammo', '{ammo\n\t{inventory {size 1 1}{weight 1}}\n}\n');
      putk(vdef, '{game_entity\n\t(include "/properties/tank.ext")\n\t("armor_medium" turret(90 75 52 20) body(45 45 45 22))\n\t("crew_4_human_extended")\n\t{Locomotion\n\t\t{MaxSpeed 32}\n\t}\n' +
        '\t{extender "inventory"\n\t\t{weapon "mgun"\n\t\t\t{mask "weapon mgun"}\n\t\t}\n\t\t{weapon "spare"\n\t\t\t{mask "weapon mgun"}\n\t\t}\n\t\t{box\n\t\t\t{item "bullet85 ammo" 20}\n\t\t\t{item "dt" filled {user "mgun"}} ; on the roof\n\t\t}\n\t}\n' +
        '\t{Weaponry\n\t\t{place "gun"\n\t\t\t{weapon "85mm_zis_s53" filling "bullet85 ammo" 1}\n\t\t}\n\t\t{place "mgun"\n\t\t\t{type "mgun_aa"}\n\t\t}\n\t\t{place "mgun2"\n\t\t\t{weapon "dt" filled}\n\t\t}\n\t}\n\t{Volume "Gun"\n\t\t{thickness 30}\n\t}\n}\n');
      const gameDef = fs.readFileSync(path.join(fk.game, vdef), 'latin1'), rdv = () => fs.readFileSync(path.join(fk.mod, vdef), 'latin1');
      const V0 = K0.readVehicle(key => { try { return fs.readFileSync(path.join(fk.game, key)); } catch (e) { return null; } }, vdef);
      assert.deepStrictEqual([V0.box.w, V0.box.h, V0.box.weight, V0.box.file, V0.items.map(i => [i.item, i.count, i.user, i.own].join(' ')), V0.holders.map(h => [h.type, h.name, h.mask.join('+')].join(' ')), V0.places.map(p => [p.name, p.type, p.weapon ? p.weapon.item : '-'].join(' '))],
        [5, 4, 1000, 'resource/properties/tank.ext', ['repair_kit 2  false', 'bullet85 ammo 20  true', 'dt 1 mgun true'], ['weapon mgun weapon+mgun', 'weapon spare weapon+mgun'], ['gun  85mm_zis_s53', 'mgun mgun_aa -', 'mgun2  dt']]);
      const T = [{ all: ['dt', 'weapon', 'mgun'] }, { all: ['mosin', 'weapon'] }, { all: ['x', 'weapon', 'mgun'], pattern: true }];
      assert.deepStrictEqual([T.map(s => K0.maskTakes(['weapon', 'mgun'], s)), K0.maskTakes([], T[0]), K0.maskTakes(['mgun'], null)], [[true, false, false], false, false]);
      ok('kit.readVehicle: the box of the included file, own and shared lines, holders with their masks, weapon places; a mask takes an item that has every tag, an empty mask nothing');
      let v = await kc('kit', { id: 't34_3' });
      assert.deepStrictEqual([v.kind, v.entity, v.file, v.from, v.grid.w, v.grid.h, v.soldiers.map(s => s.id).sort().join()], ['vehicle', 't34_3', vdef, 'game', 5, 4, 'mp/rus/tankman,mp/rus/tankman2']);
      assert.deepStrictEqual(v.items.map(i => [i.item, i.count, i.w + 'x' + i.h, i.slot, i.own, i.loaded, i.rounds].join(' ')), ['repair_kit 2 1x1  false  ', 'bullet85 ammo 20 1x1  true  ', 'dt 1 2x1 mgun true own 63']);
      assert.deepStrictEqual(v.slots.map(s => [s.name, s.type, s.kind, s.mask.join('+'), s.weapon ? s.weapon.item : '-', s.accepts, s.canChange, s.why].join(' ')),
        ['gun  fixed  85mm_zis_s53 7 true ', 'mgun mgun_aa mask weapon+mgun dt 2 true ', 'mgun2  fixed  dt 7 true ', 'spare  closed weapon+mgun - 0 false noplace']);
      assert.deepStrictEqual([v.slots[0].weapon.ammo, v.slots[0].weapon.rounds, v.slots[1].weapon.model, v.slots[1].weapon.ammo, v.slots[1].weapon.rounds, v.notFit.length], ['bullet85 ammo', 1, 'dt', 'mgun ammo', 63, 0]);
      assert.strictEqual((await kc('kit', { entity: 't34_3' })).unit.kind, 'vehicle');
      ok('kit: a vehicle answers its own box as the grid (size of its files, shells with counts, shared lines marked), its weapon slots with the weapon, what it loads and how many items each takes, and its crew');
      let sl = await kc('kit/slot', { id: 't34_3', slot: 'mgun' });
      assert.deepStrictEqual([sl.slot.kind, sl.items.map(i => i.item + ':' + i.model + ':' + i.ammo + ':' + i.mag).sort()], ['mask', ['dshk:dshk:mgun ammo:50', 'dt:dt:mgun ammo:63']]);
      sl = await kc('kit/slot', { entity: 't34_3', slot: 'mgun2' });
      assert.ok(sl.slot.kind === 'fixed' && sl.items.length === 7 && sl.items.some(i => i.item === 'mosin') && !sl.items.some(i => i.kind === 'ammo'), sl.items.map(i => i.item).join());
      await kno('kit/slot', { id: 't34_3', slot: 'nope' }, /no slot named "nope"/);
      sl = await kc('kit/slot', { breed: 'rus/rifle', slot: 'head' });
      assert.deepStrictEqual([sl.slot.mask, sl.items.length, (await kc('kit', { breed: 'rus/rifle' })).slots.map(s => [s.name, s.holder, s.mask.join(), s.canChange, s.why].join(' '))], [['head'], 0, ['head armor head false soldier']]);
      ok('kit/slot: a masked slot lists the items that have every tag of its mask, a fixed place every weapon; a soldier answers its masked slots (head), hands have none');
      const vi = await kc('kit/items', { vehicle: true });
      assert.ok(vi.items.some(i => i.item === 'dshk' && i.heading === 'gun') && vi.items.some(i => i.item === 'bullet85 ammo' && i.heading === 'ammo') && vi.groups.some(g => g.id === 'gun'), JSON.stringify(vi.groups));
      assert.ok(!(await kc('kit/items', {})).items.some(i => i.item === 'dshk'), 'a soldier list has no vehicle guns');
      ok('kit/items for a vehicle: vehicle guns and shells are in the list (not in a soldier\'s)');
      v = await kc('kit', { id: 't34_3', pending: { add: [{ item: 'bullet85 ammo', count: 30 }, { item: 'f1', count: 4 }], slots: { mgun: 'dshk' } } });
      assert.deepStrictEqual([v.pending, v.items.map(i => [i.item, i.count, i.slot, !!i.isNew].join(' ')), v.slots[1].weapon.item],
        [true, ['repair_kit 2  false', 'bullet85 ammo 30  false', 'dt 1  false', 'f1 4  true', 'dshk 1 mgun true'], 'dshk']);
      ok('kit: a vehicle\'s pending edit (count, a new item, another weapon in a slot) is laid out by the same rule');
      await kno('kit/set', { id: 't34_3', slots: { mgun: 'mosin' } }, /does not go into the slot "mgun".*weapon \+ mgun.*not marked weapon, mgun/);
      await kno('kit/set', { id: 't34_3', slots: { mgun2: 'f1' } }, /not a weapon/);
      await kno('kit/set', { id: 't34_3', slots: { mgun2: false } }, /fixed in the vehicle file/);
      await kno('kit/set', { id: 't34_3', slots: { spare: 'dt' } }, /no weapon place named "spare"/);
      await kno('kit/set', { id: 't34_3', slots: { nope: 'dt' } }, /no weapon slot named "nope"/);
      await kno('kit/set', { id: 't34_3', del: ['repair_kit'] }, /properties\/tank\.ext, which other vehicles share/);
      await kno('kit/set', { id: 't34_3', add: [{ item: 'f1', count: 2, spread: 1 }] }, /no spread/);
      await kno('kit/set', { id: 't34_3', add: [{ item: 'nope', count: 1 }] }, /no item named "nope"/);
      await kno('kit/set', { id: 't34_3', add: [{ item: 'big_gun', count: 300 }] }, /does not fit/);
      await kno('kit/set', { id: 't34_3', slots: { mgun: 'dt' } }, /Nothing to change/);
      await kno('kit/set', { id: 't34_0', add: [{ item: 'f1', count: 1 }] }, /has no inventory/);
      ok('kit/set on a vehicle refuses in plain words: an item the slot\'s mask does not take, no weapon, emptying a fixed slot, a slot with no weapon place, an unknown slot, a shared line, a spread, an unknown item, no room, nothing to change, a vehicle with no box');
      let vs = await kc('kit/set', { id: 't34_3', add: [{ item: 'bullet85 ammo', count: 30 }], slots: { mgun: 'dshk', mgun2: 'dshk' } });
      assert.deepStrictEqual([vs.written, vs.errors, vs.rows.map(r => [r.field, r.part, r.old, r.new].join('|'))], [false, [], ['item|bullet85 ammo|20|30', 'slot|mgun|dt|dshk', 'slot|mgun2|dt|dshk']]);
      assert.ok(!fs.existsSync(path.join(fk.mod, vdef)), 'a preview writes nothing');
      ok('kit/set preview on a vehicle: rows for the count and for each slot, nothing written');
      vs = await kc('kit/set', { id: 't34_3', write: true, add: [{ item: 'bullet85 ammo', count: 30 }], slots: { mgun: 'dshk', mgun2: 'dshk' } });
      assert.ok(vs.written, JSON.stringify(vs.errors));
      let vt = rdv();
      assert.ok(vt.includes('{item "bullet85 ammo" 30}') && vt.includes('{item "dt" filled} ; on the roof') && vt.includes('{item "dshk" filled {user "mgun"}}') && /\{place "mgun2"\s*\{weapon "dshk" filled\}/.test(vt) && vt.includes('{weapon "85mm_zis_s53" filling "bullet85 ammo" 1}'), vt);
      assert.ok(!/[^\r]\n/.test(vt) && fs.readFileSync(path.join(fk.game, vdef), 'latin1') === gameDef, 'CRLF kept, the game file untouched');
      v = await kc('kit', { id: 't34_3' });
      assert.deepStrictEqual([v.from, v.slots.map(s => s.name + '=' + (s.weapon ? s.weapon.item : '-')).join(' '), v.items.find(i => i.item === 'dt').slot], ['mod', 'gun=85mm_zis_s53 mgun=dshk mgun2=dshk spare=-', '']);
      ok('kit/set write on a vehicle: the vehicle file copied into the mod, the count changed, the mounted weapon swapped (the old one stays in the box), the fixed weapon of a place swapped; the next read is the mod');
      vs = await kc('kit/set', { entity: 't34_3', write: true, slots: { mgun: false }, del: ['dt'] });
      vt = rdv(); assert.ok(vs.written && vt.includes('{item "dshk" filled}') && !vt.includes('{user') && !vt.includes('"dt" filled}'), vt);
      vs = await kc('kit/set', { entity: 't34_3', write: true, slots: { mgun: 'dshk' } });
      assert.ok(vs.written && rdv().includes('{item "dshk" filled {user "mgun"}}') && (rdv().match(/"dshk" filled/g) || []).length === 2, rdv());
      ok('kit/set write on a vehicle: a weapon taken out of its slot stays in the box, an item removed, the weapon of the box put back into the slot (no second line)');
    }
    // the line-up of a buy: the answer of ./lineup (its own test covers the picture), or one plain line where it is not built
    try { const lu = await kc('lineup', { id: 'riflemans(rus)' }); assert.ok(Array.isArray(lu.figures) && Array.isArray(lu.notes) && lu.men === 6, JSON.stringify(lu).slice(0, 300)); }
    catch (e) { assert.ok(e.status === 400 && /picture of the whole buy/.test(e.message), String(e && e.stack || e)); }
    ok('lineup: same body as models, answers {scene, figures, notes, vehicles, men}');
  }

  // the look (owner 2026-11-22): the skin a soldier wears and the texture variant a model shows. Own fixture: two skins of one
  // model (plain and camo), a skin with no twin, a vehicle whose textures have a winter file
  {
    const dl = path.join(scratch, 'lookfx'); fs.rmSync(dl, { recursive: true, force: true });
    const fl = fx.make(dl), putl = (k, t) => { const f = path.join(fl.game, k); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t.replace(/\n/g, '\r\n'), 'latin1'); };
    const model = (dir, name, vars) => {
      putl(dir + '/' + name + '.mdl', '{skeleton\n\t{bone "body"\n\t\t{VolumeView "' + name + '.ply"}\n\t}\n}\n');
      putl(dir + '/' + name + '.ply', 'EPLYBNDS\x01\x02\x0b' + name + '.mtl\x01\x02');
      putl(dir + '/' + name + '.mtl', '{material simple\n\t{diffuse "' + name + '"}\n}\n');
      for (const v of [''].concat(vars)) putl(dir + '/' + name + (v ? '#' + v : '') + '.dds', 'DDS ');
    };
    const hs = 'resource/entity/humanskin/';
    model(hs + 'rus_inf', 'rus_inf', ['camo', 'd']);
    putl(hs + 'rus_inf/rus_inf.def', '{game_entity\n\t{Extension "rus_inf.mdl"}\n}\n');
    putl(hs + 'rus_inf/rus2_inf.def', '{game_entity\n\t{Extension "rus_inf.mdl"}\n\t{texmod "camo"}\n}\n');
    model(hs + 'rus_off', 'rus_off', ['camo']);
    putl(hs + 'rus_off/rus_off.def', '{game_entity\n\t{Extension "rus_off.mdl"}\n}\n');
    putl(hs + 'skeleton/skeleton.def', '{game_entity\n\t{Extension "skeleton.mdl"}\n}\n');
    const bd = 'resource/set/breed/mp/rus/';
    putl(bd + 'look1.set', '{breed\n\t{skin "rus_inf"} ; summer\n\t{inventory\n\t\t{in_hands 0}\n\t}\n}\n');
    putl(bd + 'look2.set', '{breed\n\t{skin "rus_off"}\n}\n');
    putl(bd + 'look3.set', '{breed\n\t("soldier_base")\n}\n');
    const vd = 'resource/entity/-vehicle/tank_heavy/kv1/';
    model(vd.slice(0, -1), 'kv1', ['winter']);
    putl(vd + 'kv1.def', '{game_entity\n\t{Extension "kv1.mdl"}\n\t{TexMods\n\t\t{"snow" "winter"}\n\t}\n\t{Locomotion\n\t\t{MaxSpeed 30}\n\t}\n}\n');
    const cl = Object.assign({}, ctx, { gamedir: fl.game, game: () => fl.game, tmpRoot: path.join(dl, 'tmp') }); fs.mkdirSync(cl.tmpRoot, { recursive: true });
    const lk = (name, body) => R['POST /api/x/units/' + name]('/api/x/units/' + name, Object.assign({ mod: fl.mod }, body), cl);
    const lno = async (name, body, re) => { try { await lk(name, body); } catch (e) { assert.strictEqual(e.status, 400, name + ': status ' + e.status + ' ' + e.message); assert.ok(re.test(e.message), name + ': ' + e.message); return; } throw new Error(name + ': expected a refusal'); };
    const rdm = k => fs.readFileSync(path.join(fl.mod, k), 'latin1'), inMod = k => fs.existsSync(path.join(fl.mod, k));

    let s = await lk('look', { breed: 'rus/look1' });
    assert.deepStrictEqual([s.kind, s.breed, s.file, s.from, s.target, s.skin.name, s.skin.known, s.skin.group, s.skin.sub, s.skin.wornBy, s.skin.canChange],
      ['soldier', 'rus/look1', bd + 'look1.set', 'game', 'breed:mp/rus/look1', 'rus_inf', true, 'rus', 'rus_inf', 1, true]);
    assert.deepStrictEqual([s.texmod.supported, s.texmod.current, s.texmod.canChange, s.texmod.textures, s.texmod.variants.map(v => v.name + ':' + v.textures).join(' ')], [true, '', true, 1, 'camo:1 d:1'], JSON.stringify(s.texmod));
    ok('look of a soldier: the skin of his file, where it is listed, how many soldiers wear it, the texture variants his skin\'s model has files for');
    s = await lk('look', { breed: 'rus/look3' });
    assert.deepStrictEqual([s.skin.name, s.skin.canChange, s.skin.why, s.texmod.canChange, s.texmod.why], ['', false, 'inherited', false, 'noskin']);
    ok('look of a soldier whose file only takes lines from another file: no skin line of his own, said so');
    let v = await lk('look', { entity: 'kv1' });
    assert.deepStrictEqual([v.kind, v.entity, v.file, v.from, v.texmod.current, v.texmod.hasLine, v.texmod.canChange, v.texmod.aliases, v.texmod.variants.map(x => x.name)], ['vehicle', 'kv1', vd + 'kv1.def', 'game', '', false, true, [['snow', 'winter']], ['winter']]);
    ok('look of a vehicle: no skin, its texture variant line, the names a map can ask for, the variants its textures have');
    const sq = await lk('look', { id: 'riflemans(rus)' });
    assert.ok(!sq.kind && Array.isArray(sq.soldiers) && sq.soldiers.length && sq.soldiers[0].id, JSON.stringify(sq).slice(0, 300));
    ok('look of a squad: its soldiers to pick one from');

    const ls = await lk('look/skins', {});
    assert.deepStrictEqual(ls.skins.filter(x => /^rus2?_(inf|off)$/.test(x.skin)).map(x => [x.skin, x.group, x.sub, x.texmod, x.worn, x.by.map(b => b.id).join()].join('|')),
      ['rus2_inf|rus|rus_inf|camo|0|', 'rus_inf|rus|rus_inf||1|rus/look1', 'rus_off|rus|rus_off||1|rus/look2']);
    assert.ok(!ls.skins.some(x => x.skin === 'skeleton') && ls.total === ls.skins.length && ls.groups.some(g => g.group === 'rus' && g.n >= 3), JSON.stringify(ls.groups));
    ok('look/skins: every wearable skin with its group, folder, texture variant and the soldiers that wear it; the bare skeleton is not one');
    {
      // the reading shared with the Models page (./texvar): the same functions as ./look hands out, and the variants of a model file
      const T = require('./texvar'), LK = require('./look'), sv = require('./server').lib;
      for (const k of ['skinList', 'skinKey', 'skinUsers', 'defLook', 'mdlOf', 'variantsOf', 'variantsOfMdl']) assert.ok(typeof T[k] === 'function' && LK[k] === T[k], 'texvar.' + k);
      assert.ok(typeof LK.breedSkin === 'function' && typeof LK.freeName === 'function' && sv.texvar() === T);
      const { cur } = await sv.both(cl, fl.game, fl.mod, true), c = sv.kitCtx(cur, cl, fl.game, fl.mod, 'as64');
      const vm = T.variantsOfMdl(c, 'resource/entity/-vehicle/tank_heavy/kv1/kv1.mdl', false), vd = T.variantsOf(c, 'resource/entity/-vehicle/tank_heavy/kv1/kv1.def', false);
      assert.deepStrictEqual([vm.mdl, vm.textures, vm.variants], ['resource/entity/-vehicle/tank_heavy/kv1/kv1.mdl', 1, [{ name: 'winter', textures: 1, meshes: 0 }]], JSON.stringify(vm));
      assert.deepStrictEqual(vd, vm, 'by def = by its model file');
      assert.deepStrictEqual(T.variantsOfMdl(c, null, false), { mdl: null, textures: 0, variants: [] });
      ok('texvar: the variant reading split out of look for the Models page, by def or by model file');
    }

    await lno('look/set', { breed: 'rus/look1' }, /Nothing to change/);
    await lno('look/set', { breed: 'rus/look1', skin: 'nope' }, /no skin named "nope"/);
    await lno('look/set', { breed: 'rus/look1', skin: 'rus_inf' }, /Nothing to change/);
    await lno('look/set', { breed: 'rus/look1', texmod: 'winter' }, /no texture files for "winter".*It has: camo, d/);
    await lno('look/set', { breed: 'rus/look3', skin: 'rus_off' }, /takes its lines from another file/);
    await lno('look/set', { id: 'riflemans(rus)', skin: 'rus_off' }, /not one soldier/);
    await lno('look/set', { entity: 'kv1', skin: 'rus_off' }, /A vehicle wears no skin/);
    await lno('look/set', { entity: 'kv1', texmod: 'camo' }, /no texture files for "camo".*It has: winter/);
    await lno('look/set', { entity: 'kv1', texmod: false }, /Nothing to change/);
    ok('look/set refuses in plain words: nothing asked, an unknown skin, the same skin, a variant with no texture files, an inherited skin line, a squad, a skin for a vehicle');

    let r = await lk('look/set', { breed: 'rus/look1', skin: 'rus_off' });
    assert.deepStrictEqual([r.written, r.errors, r.rows, r.look, r.newDef], [false, [], [{ field: 'skin', old: 'rus_inf', new: 'rus_off' }], { skin: 'rus_off', texmod: undefined }, null]);
    assert.ok(!inMod(bd + 'look1.set'), 'a preview writes nothing');
    ok('look/set preview of another skin: one row, nothing written');
    r = await lk('look/set', { breed: 'rus/look1', skin: 'rus_off', write: true });
    let bt = rdm(bd + 'look1.set');
    assert.ok(r.written && bt.includes('{skin "rus_off"} ; summer') && !/[^\r]\n/.test(bt) && fs.readFileSync(path.join(fl.game, bd + 'look1.set'), 'latin1').includes('"rus_inf"'), bt);
    s = await lk('look', { breed: 'rus/look1' });
    assert.deepStrictEqual([s.from, s.skin.name, s.texmod.variants.map(x => x.name)], ['mod', 'rus_off', ['camo']]);
    ok('look/set write of another skin: the soldier file copied into the mod, the skin line changed, its comment and CRLF kept, the game file untouched; the next read is the mod');
    // a variant: the skin's def is shared, so it is never edited. rus_off has no twin: a new def beside it
    r = await lk('look/set', { breed: 'rus/look1', texmod: 'camo', write: true });
    assert.deepStrictEqual([r.written, r.rows, r.look, r.newDef], [true, [{ field: 'skin', old: 'rus_off', new: 'rus_off_camo' }, { field: 'texmod', old: '-', new: 'camo' }], { skin: 'rus_off_camo', texmod: 'camo' }, 'rus_off_camo'], JSON.stringify(r.errors));
    const nd = rdm(hs + 'rus_off/rus_off_camo.def');
    assert.ok(/\{Extension "rus_off\.mdl"\}\r\n\t\{texmod "camo"\}/.test(nd) && !/[^\r]\n/.test(nd) && !inMod(hs + 'rus_off/rus_off.def') && rdm(bd + 'look1.set').includes('{skin "rus_off_camo"}'), nd);
    s = await lk('look', { breed: 'rus/look1' });
    assert.deepStrictEqual([s.skin.name, s.skin.known, s.texmod.current, s.texmod.known], ['rus_off_camo', true, 'camo', true]);
    ok('look/set write of a texture variant on a soldier: a new skin file beside the old one with the variant line after the model line, the soldier pointed to it, the shared skin file not touched');
    // rus_inf has a twin that shows camo (as vanilla ger2_officer beside ger_officer): the soldier is pointed to it, no new file
    r = await lk('look/set', { breed: 'rus/look1', skin: 'rus_inf', texmod: 'camo', write: true });
    assert.deepStrictEqual([r.written, r.rows, r.newDef], [true, [{ field: 'skin', old: 'rus_off_camo', new: 'rus2_inf' }, { field: 'texmod', old: '-', new: 'camo' }], null], JSON.stringify(r.errors));
    assert.ok(rdm(bd + 'look1.set').includes('{skin "rus2_inf"}') && !inMod(hs + 'rus_inf/rus_inf_camo.def'));
    r = await lk('look/set', { breed: 'rus/look1', texmod: false, write: true });
    assert.ok(r.written && r.look.skin === 'rus_inf' && rdm(bd + 'look1.set').includes('{skin "rus_inf"}'), JSON.stringify(r.rows));
    ok('look/set on a soldier whose skin has a twin of the same model: the twin is used (camo and back to plain), no new file');
    // a vehicle: the line goes into its own def
    r = await lk('look/set', { entity: 'kv1', texmod: 'winter' });
    assert.deepStrictEqual([r.written, r.rows, r.look], [false, [{ field: 'texmod', old: '-', new: 'winter' }], { texmod: 'winter' }]); assert.ok(!inMod(vd + 'kv1.def'));
    r = await lk('look/set', { entity: 'kv1', texmod: 'winter', write: true });
    const vt2 = rdm(vd + 'kv1.def');
    assert.ok(r.written && /\{Extension "kv1\.mdl"\}\r\n\t\{texmod "winter"\}\r\n\t\{TexMods/.test(vt2) && !/[^\r]\n/.test(vt2), vt2);
    v = await lk('look', { entity: 'kv1' });
    assert.deepStrictEqual([v.from, v.texmod.current, v.texmod.hasLine], ['mod', 'winter', true]);
    r = await lk('look/set', { entity: 'kv1', texmod: '', write: true });
    assert.ok(r.written && !/texmod "/i.test(rdm(vd + 'kv1.def')) && rdm(vd + 'kv1.def').includes('{"snow" "winter"}'), rdm(vd + 'kv1.def'));
    ok('look/set on a vehicle: preview writes nothing; write puts the variant line after the model line of a mod copy, CRLF kept; taking it out leaves the names a map can ask for');
  }

  // nothing written outside the mod
  assert.ok(!/80 90/.test(fs.readFileSync(path.join(game, 'resource/set/stuff/rifle/mosin'), 'latin1'))); ok('game files untouched');

  // GT-12: common names. The real game calls pz4h "PzKpfw IV Ausf.H"; players type "Panzer IV H" or "Panzer 4 H"
  const cat = { units: [['pz4h', 'PzKpfw IV Ausf.H'], ['pz4g', 'PzKpfw IV Ausf.G'], ['jagdpanzer_iv', 'Jagdpanzer IV'], ['pz3', 'PzKpfw III Ausf.J'], ['ba64', 'BA-64 Armoured car']]
    .map(([id, name]) => ({ id, name, army: 'ger', kind: 'vehicle', buyable: true, cost: 500 })) };
  const S12 = q => ext._t.search(cat, q, {}).results.map(r => r.id);
  assert.strictEqual(S12('Panzer IV H')[0], 'pz4h', S12('Panzer IV H').join());
  assert.strictEqual(S12('panzer 4 h')[0], 'pz4h'); assert.strictEqual(S12('Pz IV Ausf. H')[0], 'pz4h');
  assert.deepStrictEqual(S12('Panzer IV').slice(0, 2).sort(), ['pz4g', 'pz4h'], S12('Panzer IV').join());
  assert.ok(S12('Panzer IV').includes('jagdpanzer_iv') && S12('Panzer III')[0] === 'pz3');
  assert.deepStrictEqual(S12('armored car'), ['ba64']); assert.deepStrictEqual(S12('armoured'), ['ba64']);
  ok('GT-12 search by common name (Panzer IV H, panzer 4 h, Panzer IV) and armor = armour');

  // ---------- the page script itself, in a stand-in browser, on a fresh fixture ----------
  const FD = require('./fakedom');
  const f2 = fx.make(path.join(scratch, 'client'));
  // GT-13 data: a gun whose file only inherits ({from ..}), like 75mm_kwk40(L48) in the game: the catalogue has no numbers for it
  const put = (k, t) => { const f = path.join(f2.game, k); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t.replace(/\n/g, '\r\n'), 'latin1'); };
  put('resource/set/stuff/gun/76mm_f34', '{from "76mm_base"}\n');
  // Equipment card data: a 4 x 3 inventory box and a grenade
  put('resource/properties/human.ext', '{extender "inventory"\n\t{box\n\t\t{Size 4 3}\n\t\t{Weight 100}\n\t}\n}\n');
  put('resource/set/stuff/grenade/f1', '{grenade\n\t{inventory {size 1 1}{weight 50}}\n}\n');
  // Equipment card data for a vehicle: t34_3 with its own box, a masked slot (mgun) holding a dt, two weapons the mask takes
  put('resource/properties/tank.ext', '{extender "inventory"\n\t{box\n\t\t{Size 5 4}\n\t\t{Weight 1000}\n\t}\n}\n');
  put('resource/set/stuff/gun/dt', '{weapon\n\t{tag "weapon mgun"}\n\t{filling "mgun ammo" 63}\n\t{entity "dt"}\n\t{inventory {size 2 1}{weight 10}}\n}\n');
  put('resource/set/stuff/gun/dshk', '{weapon\n\t{tag "weapon mgun"}\n\t{filling "mgun ammo" 50}\n\t{entity "dshk"}\n\t{inventory {size 3 1}{weight 30}}\n}\n');
  put('resource/set/stuff/shell/mgun.ammo', '{ammo\n\t{inventory {size 1 1}{weight 1}}\n}\n');
  put('resource/entity/-vehicle/tank_medium/t34_3/t34_3.def', '{game_entity\n\t(include "/properties/tank.ext")\n\t("armor_medium" turret(90 75 52 20) body(45 45 45 22))\n\t("crew_4_human_extended")\n\t{Locomotion\n\t\t{MaxSpeed 32}\n\t}\n' +
    '\t{extender "inventory"\n\t\t{weapon "mgun"\n\t\t\t{mask "weapon mgun"}\n\t\t}\n\t\t{box\n\t\t\t{item "mgun ammo" 500}\n\t\t\t{item "dt" filled {user "mgun"}}\n\t\t}\n\t}\n' +
    '\t{Weaponry\n\t\t{place "gun"\n\t\t\t{weapon "85mm_zis_s53"}\n\t\t}\n\t\t{place "mgun"\n\t\t\t{type "mgun_aa"}\n\t\t}\n\t\t{place "mgun2"\n\t\t\t{weapon "dt"}\n\t\t}\n\t}\n\t{Volume "Gun"\n\t\t{thickness 30}\n\t}\n}\n');
  // a group buy: two tanks with their crews and six riflemen on one card
  { const vf = path.join(f2.game, 'resource/set/multiplayer/units/vehicles_rus.set');
    fs.writeFileSync(vf, fs.readFileSync(vf, 'latin1') + '{"strike_group(rus)" ("generic_v" c(0) sc(40) t(all medium rus) g(e2) b(v5) cw(0) cp(30)) {content "t34_0 ( mp/rus/tankman:3 mp/rus/tankman2:1 ) t34_0 ( mp/rus/tankman:3 mp/rus/tankman2:1 ) mp/rus/rifle:6"} {level 1} {cost 900} {fore 1.0}}\r\n', 'latin1'); }
  // equipment browser data: a long group (45 caps, more than one page of rows)
  for (let i = 1; i <= 45; i++) put('resource/set/stuff/head/cap_' + String(i).padStart(2, '0'), '{item\n\t{inventory {size 2 2}{weight 1}}\n}\n');
  { const lf = path.join(f2.game, 'resource/interface/text/desc.lng'), lt = fs.readFileSync(lf, 'utf8'), at = lt.lastIndexOf('}');
    fs.writeFileSync(lf, lt.slice(0, at) + '\t{"weapon"\r\n\t\t{"mosin" "Mosin rifle"}\r\n\t\t{"f1" "F-1 grenade"}\r\n\t}\r\n' + lt.slice(at), 'utf8'); }
  // skin and texture variant data: two skins of one model (plain, camo), one more skin, a soldier that wears the plain one
  for (const n of ['rus_inf', 'rus_off']) {
    const d = 'resource/entity/humanskin/' + n + '/' + n;
    put(d + '.mdl', '{skeleton\n\t{bone "body"\n\t\t{VolumeView "' + n + '.ply"}\n\t}\n}\n'); put(d + '.ply', 'EPLYBNDS\x01\x02\x0b' + n + '.mtl\x01\x02');
    put(d + '.mtl', '{material simple\n\t{diffuse "' + n + '"}\n}\n'); put(d + '.dds', 'DDS '); put(d + '#camo.dds', 'DDS ');
    put(d + '.def', '{game_entity\n\t{Extension "' + n + '.mdl"}\n}\n');
  }
  put('resource/entity/humanskin/rus_inf/rus2_inf.def', '{game_entity\n\t{Extension "rus_inf.mdl"}\n\t{texmod "camo"}\n}\n');
  put('resource/set/breed/mp/rus/look1.set', '{breed\n\t{skin "rus_inf"}\n\t{inventory\n\t\t{in_hands 0}\n\t}\n}\n');
  put('resource/set/stuff/gun/76mm_base','{from "pattern gun"\n\t{rechargeTime 6}\n\t{projectileDamage 122}\n\t("damage" a(122) b(111) c(98) d(85) e(74))\n}\n');
  const ctx2 = Object.assign({}, ctx, { gamedir: f2.game, game: () => f2.game, tmpRoot: path.join(scratch, 'client-tmp') });
  fs.rmSync(ctx2.tmpRoot, { recursive: true, force: true }); fs.mkdirSync(ctx2.tmpRoot, { recursive: true });
  const route = (url, body) => { const k = (body === undefined ? 'GET ' : 'POST ') + url.split('?')[0]; return R[k](url, body === undefined ? null : body, ctx2); };
  const g13 = await route('/api/x/units/stats', { id: 't34_0', mod: f2.mod });
  assert.deepStrictEqual([g13.gun.pen, g13.gun.damage, g13.gun.reload], [85, 122, 6], JSON.stringify(g13.gun));
  ok('GT-13 gun numbers for an inherited gun file: penetration at 100 m 85, damage 122, reload 6 (as Balance)');
  {
    // owner 2026-11-22: a group buy (a vehicle card that brings more than its one vehicle) lists what it brings; its armour is N/A
    const gs = await route('/api/x/units/stats', { id: 'strike_group(rus)', mod: f2.mod });
    assert.ok(gs.many === 1 && gs.brings, JSON.stringify([gs.kind, gs.content, gs.many]));
    assert.deepStrictEqual(gs.brings.parts.map(p => [p.kind, p.id, p.n, (p.crew || []).map(c => tail(c.id) + ':' + c.n).join(' ')]),
      [['vehicle', 't34_0', 2, 'tankman:3 tankman2:1'], ['soldier', 'mp/rus/rifle', 6, '']], JSON.stringify(gs.brings));
    assert.ok(gs.brings.parts[0].name === 'T-34/76' && gs.brings.vehicles === 2 && gs.brings.men === 14, JSON.stringify(gs.brings));
    const one = await route('/api/x/units/stats', { id: 't34_0', mod: f2.mod });
    assert.ok(!one.many && !one.brings, 'one vehicle with its crew is not a group');
    const sr = await route('/api/x/units/search', { q: 'strike', mod: f2.mod });
    assert.ok(sr.results[0].id === 'strike_group(rus)' && sr.results[0].many === 1 && sr.results[0].brings.vehicles === 2, JSON.stringify(sr.results[0]));
    ok('a group buy answers what it brings: 2 x T-34/76 each with its crew, 6 x rifle, 2 vehicles and 14 soldiers in all; search rows carry it; a single tank does not');
    function tail(x) { return String(x).split('/').pop(); }
  }

  const P = FD.runPage('units', ext.script, ext.lang, { route, S: { mod: f2.mod } });
  const en = ext.lang.en, root = P.root, doc = P.doc;
  const inputBy = k => root.all(c => c.tagName === 'INPUT' && c.getAttribute('aria-label') === en[k])[0];
  // the heading sits in its own block: climb from it to the card
  const cardBy = k => { let e = root.all(c => c.tagName === 'H3' && c.textContent === en[k])[0]; while (e && !e.classList.contains('card')) e = e.parentNode; return e; };
  const blocksOk = (when) => { const pr = FD.checkBlocks(root); assert.ok(!pr.length, when + ':\n  ' + pr.slice(0, 20).join('\n  ')); };
  blocksOk('first build'); ok('blocks: every control and text of the first build sits in a leaf block, ids unique');
  const btnIn = (card, k) => card.all(c => c.tagName === 'BUTTON' && c.textContent === en[k])[0];
  P.screen.focus(); await FD.settle();
  // rule 4 (owner 2026-11-19): no mod folder box on the page, the header has it; the page works on the shared mod and follows it
  assert.ok(!inputBy('units.mod') && !root.all(c => c.attrs && c.attrs['data-sk'] === 'units.mod').length, 'no mod folder box');
  const stat = m => P.sent.filter(x => x.url === '/api/x/units/status?mod=' + encodeURIComponent(m)).length;
  assert.ok(stat(f2.mod) >= 1, 'the shared mod is checked');
  // GT-15: another page (the header) sets the shared mod; this page follows (the old page kept its own first value)
  P.S.mod = mod; P.screen.refresh(); assert.ok(stat(mod) === 1, 'the new shared mod is checked');
  P.S.mod = f2.mod; P.screen.refresh();
  ok('GT-15 no mod box of its own: the page follows the shared mod of the header');

  // searchKit (owner 2026-11-19: every search box has Browse, History and an index): the unit search, the mod folder and the weapon
  const kits = root.all(c => c.attrs && c.attrs['data-sk']).map(c => c.attrs['data-sk']).sort();
  assert.deepStrictEqual(kits, ['units.by.add', 'units.by.like', 'units.card.img', 'units.kit.add', 'units.kit.find', 'units.kit.skin', 'units.kit.slot', 'units.kit.unit', 'units.rc.weapon', 'units.search']);
  assert.ok(root.all(c => c.attrs && c.attrs['data-sk']).every(k => k.all(b => b.tagName === 'BUTTON').length >= 2), 'Browse and History buttons');
  const uix = await route('/api/x/units/index', { mod: f2.mod }), wix = await route('/api/x/units/weapons', { mod: f2.mod });
  assert.ok(uix.units.some(u => u.id === 't34_0' && u.buyable) && uix.armies.length, JSON.stringify(uix).slice(0, 300));
  assert.ok(wix.weapons.some(w => w.name === '76mm_f34' && w.group === 'gun') && !wix.weapons.some(w => /\.pattern$/.test(w.name)), JSON.stringify(wix).slice(0, 300));
  FD.type(doc, inputBy('units.search'), 't-34');
  let skRows = []; for (let i = 0; i < 100 && !skRows.length; i++) { await FD.settle(); skRows = root.all(c => / sk-index/.test(' ' + c.className)); }
  assert.ok(skRows.some(o => /T-34\/76/.test(o.textContent) && /t34_0/.test(o.textContent)), skRows.map(o => o.textContent).join(' | '));
  assert.strictEqual(P.sent.filter(s => s.url === '/api/x/units/index').length, 1, 'the index is asked once');
  FD.type(doc, inputBy('units.search'), 't-3'); await FD.settle(); await FD.settle();
  assert.strictEqual(P.sent.filter(s => s.url === '/api/x/units/index').length, 1, 'typing on asks no new index');
  FD.type(doc, inputBy('units.rc.weapon'), '76mm_f');
  skRows = []; for (let i = 0; i < 100 && !skRows.length; i++) { await FD.settle(); skRows = root.all(c => / sk-index/.test(' ' + c.className) && /76mm_f34/.test(c.textContent)); }
  assert.ok(skRows.length, 'weapon index hit');
  inputBy('units.search').value = ''; inputBy('units.rc.weapon').value = '';
  ok('searchKit: search and weapon boxes have Browse, History and an index (units once per data load, weapon files of game + mod)');
  {   // Browse = the file picker (owner 2026-11-19), on the game data where the box's things live; a pick puts what the box takes
    const sent = []; let ans = ''; P.picker((spec, done) => { sent.push(spec); done(ans, { view: 'data' }); });
    ans = 'entity/vehicle/tank/t34_0/t34_0.def'; inputBy('units.search')._sk.browseButton.click(); await FD.settle();
    assert.ok(sent[0].view === 'data' && sent[0].start === 'entity' && sent[0].mode === 'file' && sent[0].exts.join() === 'def' && inputBy('units.search').value === 't34_0', 'search Browse ' + JSON.stringify(sent[0]));
    ans = 'set/stuff/gun/76mm_f34'; inputBy('units.rc.weapon')._sk.browseButton.click();
    assert.ok(sent[1].view === 'data' && sent[1].start === 'set/stuff' && inputBy('units.rc.weapon').value === '76mm_f34', 'weapon Browse ' + JSON.stringify(sent[1]));
    inputBy('units.search').value = ''; inputBy('units.rc.weapon').value = '';
  }
  ok('searchKit Browse: unit search at entity/ (.def, the file name), weapon at set/stuff (the file name)');

  // Equipment card (owner 2026-11-22): pick a soldier, the grid and the list show its items, add one, preview, write
  {
    const kc = cardBy('units.kit.h'), until = async f => { let v = null; for (let i = 0; i < 200 && !(v = f()); i++) await FD.settle(); return v; };
    const tile = name => kc.all(c => c.tagName === 'BUTTON' && c.attrs && c.attrs['data-kit'] === name)[0];
    // equipment browser (owner 2026-11-22), on its own: no soldier picked. Closed at first, nothing asked or built until opened
    const kbHead = id => kc.all(c => c.tagName === 'BUTTON' && c.attrs && c.attrs['data-kbg'] === id)[0];
    const kbRow = name => kc.all(c => c.tagName === 'LI' && c.attrs && c.attrs['data-kbi'] === name)[0];
    const kbRows = () => kc.all(c => c.tagName === 'LI');
    const kbBtn = (name, a) => kbRow(name).all(c => c.tagName === 'BUTTON' && c.attrs && c.attrs[a] === name)[0];
    const kbBody = kc.all(c => c.attrs && c.attrs['data-blk'] === 'kit.browse.list')[0], kbItems = () => P.sent.filter(x => x.url === '/api/x/units/kit/items').length;
    const kbSel = kc.all(c => c.tagName === 'SELECT' && c.getAttribute('aria-label') === en['units.kit.br.group'])[0];
    {
      const tog = btnIn(kc, 'units.kit.br.open');
      assert.ok(tog && tog.getAttribute('aria-expanded') === 'false' && kbBody && kbBody.hidden === true && !kbRows().length && kbItems() === 0, 'closed: nothing asked, nothing built');
      tog.click(); await until(() => kbHead('rifle'));
      assert.ok(kbBody.hidden === false && tog.getAttribute('aria-expanded') === 'true' && tog.textContent === en['units.kit.br.close'] && kbItems() === 1, 'opened: one request');
      assert.deepStrictEqual(kc.all(c => c.tagName === 'BUTTON' && c.attrs && c.attrs['data-kbg']).map(b => b.attrs['data-kbg'] + ' ' + b.getAttribute('aria-expanded') + ' ' + b.getAttribute('aria-label')),
        ['rifle false Rifles, 1 items', 'grenade false Grenades, 1 items', 'headgear false Caps and helmets, 45 items']);
      assert.deepStrictEqual(kbSel.options.map(o => o.value + '=' + o.textContent), ['=All groups (47)', 'rifle=Rifles (1)', 'grenade=Grenades (1)', 'headgear=Caps and helmets (45)']);
      assert.ok(!kbRows().length && kc.textContent.includes(en['units.kit.br.count'].replace('{n}', 47).replace('{g}', 3)), 'groups closed: no row is built');
      kbHead('rifle').click();
      assert.ok(kbHead('rifle').getAttribute('aria-expanded') === 'true' && kbRows().length === 1 && kbRow('mosin'), 'a click opens the group');
      const t = kbRow('mosin').textContent;
      assert.ok(t.includes('Mosin rifle') && t.includes('mosin') && t.includes(en['units.kit.kind.weapon']) && t.includes('2 x 2 cells') && t.includes(en['units.kit.br.loads'].replace('{a}', 'rifle')), t);
      const add = kbBtn('mosin', 'data-kba');
      assert.ok(add.disabled === true && add.title === en['units.kit.br.addNo'] && kc.textContent.includes(en['units.kit.br.addNo']) && add.getAttribute('aria-label') === en['units.kit.br.addTo'] + ': Mosin rifle', 'no soldier: Add is off and the card says why');
      kbBtn('mosin', 'data-kbc').click();
      assert.ok(kc.textContent.includes(en['units.kit.br.copied'].replace('{t}', 'mosin')) || kc.textContent.includes(en['units.kit.br.copyNo'].replace('{t}', 'mosin')), 'Copy file name says what it did');
      // a long group: one page of rows, the rest on request, appended in place
      kbHead('headgear').click(); assert.strictEqual(kbRows().length, 1 + 40);
      const more = kc.all(c => c.tagName === 'BUTTON' && c.attrs && c.attrs['data-kbmore'] === 'headgear')[0];
      assert.strictEqual(more.textContent, en['units.kit.br.more'].replace('{n}', 5).replace('{left}', 5)); more.click();
      assert.ok(kbRows().length === 1 + 45 && more.hidden === true && kbRow('cap_45'), 'Show more appends the rest');
      // the group filter
      kbSel.value = 'grenade'; kbSel.fire('change'); await until(() => kbRow('f1') && !kbHead('rifle'));
      assert.ok(kbRows().length === 1 && kc.textContent.includes(en['units.kit.br.found'].replace('{n}', 1).replace('{t}', 47)), 'the group filter shows that group, open');
      kbSel.value = ''; kbSel.fire('change'); await until(() => kbHead('rifle') && !kbRows().length);
      blocksOk('equipment browser open'); assert.strictEqual(kbItems(), 1, 'no second request');
      ok('Equipment browser on its own: closed until asked, groups with counts, a group opens on click, long groups by pages, the group filter, Add off without a soldier, Copy file name');
    }
    const sent = []; let ans = 'set/breed/mp/rus/rifle.set'; P.picker((spec, done) => { sent.push(spec); done(ans, { view: 'data' }); });
    inputBy('units.kit.unit')._sk.browseButton.click();
    assert.ok(sent[0].start === 'set/breed' && sent[0].exts.join() === 'set', JSON.stringify(sent[0]));
    const t0 = await until(() => tile('mosin')); assert.ok(t0, 'the grid shows the rifle: ' + kc.textContent.slice(0, 400));
    assert.ok(/grid-column:1 \/ span 2;grid-row:1 \/ span 2/.test(t0.attrs.style) && /Mosin rifle/.test(t0.getAttribute('aria-label')), t0.attrs.style);
    const grid = kc.all(c => c.getAttribute && c.getAttribute('role') === 'group' && c.getAttribute('aria-label') === en['units.kit.gridAria'].replace('{w}', 4).replace('{h}', 3))[0];
    assert.ok(grid && grid.childNodes.length === 1 + 8, 'one tile and 8 free cells'); assert.ok(kc.textContent.includes(en['units.kit.fits'].replace('{used}', 4).replace('{total}', 12)), kc.textContent.slice(0, 600));
    assert.ok(kc.all(c => c.tagName === 'BUTTON' && c.attrs && c.attrs['data-kitl'] === 'mosin').length === 1, 'the same item in the list');
    ok('Equipment: Browse picks a soldier file, the grid shows each item over its cells, the list beside it has the same items');
    ans = 'set/stuff/grenade/f1'; inputBy('units.kit.add')._sk.browseButton.click();
    const t1 = await until(() => tile('f1')); assert.ok(t1 && /grid-column:3 \/ span 1;grid-row:1 \/ span 1/.test(t1.attrs.style), t1 && t1.attrs.style);
    assert.ok(kc.textContent.includes(en['units.kit.pend'].replace('{n}', 1)) && kc.textContent.includes(en['units.kit.st.new']), 'the edit is marked as not saved');
    const nk = P.sent.length; btnIn(kc, 'units.preview').click();
    await until(() => P.sent.slice(nk).some(s => s.url === '/api/x/units/kit/set' && !s.body.write) && kc.textContent.includes(en['units.f.item']));
    const pv = P.sent.slice(nk).filter(s => s.url === '/api/x/units/kit/set')[0];
    assert.deepStrictEqual([pv.body.id, pv.body.add, pv.body.del], ['mp/rus/rifle', [{ item: 'f1', count: 1 }], []], JSON.stringify(pv.body));
    FD.userClick(doc, btnIn(kc, 'units.write'));
    const kf = path.join(f2.mod, 'resource/set/breed/mp/rus/rifle.set');
    await until(() => fs.existsSync(kf) && /\{item "f1" 1\}/.test(fs.readFileSync(kf, 'latin1')));
    assert.ok(/\{item "mosin"\}/.test(fs.readFileSync(kf, 'latin1')) && /\{item "f1" 1\}/.test(fs.readFileSync(kf, 'latin1')), 'written into the mod');
    await until(() => kc.textContent.includes(en['units.kit.from.mod'].replace('{f}', 'resource/set/breed/mp/rus/rifle.set')) && !kc.textContent.includes(en['units.kit.st.new']));
    blocksOk('after an equipment edit');
    ok('Equipment: Add an item puts it in the next free cell, Preview sends the edit, Write saves the soldier file into the mod');
    // titles, game names and the names switch (owner 2026-11-22)
    {
      const listBtn = name => kc.all(c => c.tagName === 'BUTTON' && c.attrs && c.attrs['data-kitl'] === name)[0];
      const sw = kc.all(c => c.tagName === 'INPUT' && c.getAttribute('type') === 'checkbox')[0];
      assert.ok(sw && sw.checked === true && kc.textContent.includes(en['units.kit.names']), 'the names switch is there and on');
      assert.ok(kc.all(c => c.tagName === 'H4' && /: Inventory$/.test(c.textContent)).length === 1 && kc.textContent.includes(en['units.kit.listTitle']), 'a title over the grid and over the list');
      assert.ok(/Mosin rifle/.test(tile('mosin').getAttribute('aria-label')) && /Mosin rifle/.test(tile('mosin').getAttribute('title')) && /\(mosin\)/.test(tile('mosin').getAttribute('title')), tile('mosin').getAttribute('title'));
      assert.ok(listBtn('mosin').textContent === 'Mosin rifle' && listBtn('f1').textContent === 'F-1 grenade', listBtn('mosin').textContent);
      assert.ok(P.sent.filter(s => s.url === '/api/x/units/kit').every(s => s.body.lang === 'en'), 'the page language goes with every read');
      sw.checked = false; sw.fire('change');
      assert.ok(/^mosin,/.test(tile('mosin').getAttribute('aria-label')) && listBtn('mosin').textContent === 'mosin' && listBtn('f1').textContent === 'f1', 'off = file names: ' + tile('mosin').getAttribute('aria-label'));
      sw.checked = true; sw.fire('change');
      assert.ok(listBtn('mosin').textContent === 'Mosin rifle', 'on again = game names');
      // the list: three columns, headers that do not break inside a word
      const ths = kc.all(c => c.tagName === 'TH');
      assert.ok(ths.length === 3 && ths.every(t => /white-space:nowrap/.test(t.attrs.style) && /word-break:normal/.test(t.attrs.style)), 'list headers: ' + ths.map(t => t.textContent).join('|'));
      ok('Equipment: a title over the grid and the list, game names in tiles and list, the switch turns them into file names and back, list headers never break in a word');

      // a count with a spread: set in the panel, shown as a range, sent as count + spread
      const numBy = (k, lab) => kc.all(c => c.tagName === 'INPUT' && c.getAttribute('aria-label') === en[k] + ' ' + lab)[0];
      tile('f1').click();
      const sp = await until(() => numBy('units.kit.spreadBy', 'F-1 grenade')); assert.ok(sp && numBy('units.by.count', 'F-1 grenade'), 'the panel has a count and a spread box');
      numBy('units.by.count', 'F-1 grenade').value = '2'; numBy('units.by.count', 'F-1 grenade').fire('change');
      await until(() => kc.textContent.includes(en['units.kit.pend'].replace('{n}', 1)));
      const sp2 = await until(() => numBy('units.kit.spreadBy', 'F-1 grenade')); sp2.value = '1'; sp2.fire('change');
      const vary = en['units.kit.varies'].replace('{a}', 1).replace('{b}', 3);
      await until(() => kc.textContent.includes(vary));
      assert.ok(kc.textContent.includes(vary) && /1-3/.test(tile('f1').textContent) && tile('f1').getAttribute('aria-label').includes(vary), 'a varying count is shown as its range: ' + tile('f1').getAttribute('aria-label'));
      // the held weapon: put in the hands, written; then removed = the hands are emptied, said before Preview
      tile('mosin').click();
      const hold = await until(() => btnIn(kc, 'units.kit.hold')); assert.ok(hold, 'Put in the hands'); hold.click();
      await until(() => btnIn(kc, 'units.kit.unhold'));
      let n2 = P.sent.length; btnIn(kc, 'units.preview').click();
      await until(() => P.sent.slice(n2).some(s => s.url === '/api/x/units/kit/set' && !s.body.write) && kc.textContent.includes(en['units.f.spread']));
      let p2 = P.sent.slice(n2).filter(s => s.url === '/api/x/units/kit/set')[0];
      assert.deepStrictEqual([p2.body.add, p2.body.del, p2.body.inHands, p2.body.lang, p2.body.showNames], [[{ item: 'f1', count: 2, spread: 1 }], [], 'mosin', 'en', true], JSON.stringify(p2.body));
      assert.ok(kc.textContent.includes(en['units.f.hands']), 'the preview has an In the hands line');
      FD.userClick(doc, btnIn(kc, 'units.write'));
      await until(() => /\{item "f1" 2 1\}/.test(fs.readFileSync(kf, 'latin1')) && /\{in_hands 0\}/.test(fs.readFileSync(kf, 'latin1')));
      assert.ok(/\{item "f1" 2 1\}/.test(fs.readFileSync(kf, 'latin1')) && /\{in_hands 0\}/.test(fs.readFileSync(kf, 'latin1')), fs.readFileSync(kf, 'latin1'));
      await until(() => !kc.textContent.includes(en['units.kit.pend'].replace('{n}', 2)) && tile('mosin') && /2px solid/.test(tile('mosin').attrs.style));
      ok('Equipment: count and spread set in the panel show as a range and are written as "2 1"; Put in the hands writes {in_hands}');
      tile('mosin').click();
      const rm = await until(() => btnIn(kc, 'units.by.remove')); rm.click();
      const gone = en['units.kit.handover.none'].replace('{a}', 'Mosin rifle');
      await until(() => kc.textContent.includes(gone));
      assert.ok(kc.textContent.includes(gone) && !tile('mosin'), 'removing the held weapon is allowed and the hand-over is said: ' + kc.textContent.slice(0, 300));
      n2 = P.sent.length; btnIn(kc, 'units.preview').click();
      await until(() => P.sent.slice(n2).some(s => s.url === '/api/x/units/kit/set' && !s.body.write) && kc.textContent.includes(en['units.f.handover']));
      p2 = P.sent.slice(n2).filter(s => s.url === '/api/x/units/kit/set')[0];
      assert.deepStrictEqual([p2.body.add, p2.body.del, p2.body.inHands], [[], ['mosin'], undefined], JSON.stringify(p2.body));
      assert.ok(kc.textContent.includes(en['units.f.handover']), 'the preview names the hand-over');
      FD.userClick(doc, btnIn(kc, 'units.write'));
      await until(() => !/mosin/.test(fs.readFileSync(kf, 'latin1')));
      assert.ok(!/mosin|in_hands/.test(fs.readFileSync(kf, 'latin1')) && /\{item "f1" 2 1\}/.test(fs.readFileSync(kf, 'latin1')), fs.readFileSync(kf, 'latin1'));
      await until(() => !kc.textContent.includes(en['units.kit.pend'].replace('{n}', 1)));
      blocksOk('after the held weapon is removed');
      ok('Equipment: the held weapon can be removed; no weapon left = nothing held, the {in_hands} line goes, said before Preview and in it');
    }
    // equipment browser with a soldier open: search by game name and by file name, pictures, the 3D model, add to the soldier
    {
      const find = inputBy('units.kit.find'), sw = kc.all(c => c.tagName === 'INPUT' && c.getAttribute('type') === 'checkbox')[0], n0 = kbItems();
      const asked = [], picked = [];
      P.env.EXT_SCREENS.models = { parts: { viewer: Object.assign(() => null, { pictures: () => ({ get(t, w, h, cb) { asked.push([t, w, h].join(' ')); cb('data:image/png;base64,AA'); } }) }) } };
      P.S.screens.models = { pick: m => picked.push(m) };
      FD.type(doc, find, 'Mosin R'); await until(() => kbRow('mosin') && !kbRow('f1'));
      assert.ok(kbHead('rifle').getAttribute('aria-expanded') === 'true' && kbRows().length === 1 && kc.textContent.includes(en['units.kit.br.found'].replace('{n}', 1).replace('{t}', 47)), 'by game name: the groups with a match are open');
      assert.ok(kbRow('mosin').all(c => c.tagName === 'B')[0].textContent === 'Mosin rifle', 'the game name is the row name, the file name the second line');
      assert.deepStrictEqual(asked, ['mosin 152 152'], 'the picture of a row with a model is asked from the 3D view, at the grid size');
      assert.ok(kbRow('mosin').all(c => c.tagName === 'IMG').length === 1 && kbRow('mosin').all(c => c.tagName === 'IMG')[0].getAttribute('alt') === '', 'the picture is set in the row');
      FD.type(doc, find, 'f1'); await until(() => kbRow('f1') && !kbRow('mosin'));
      assert.ok(kbRow('f1').all(c => c.tagName === 'B')[0].textContent === 'F-1 grenade' && !kbRow('f1').all(c => c.tagName === 'IMG').length, 'by file name while game names are shown; no model = no picture box');
      sw.checked = false; sw.fire('change'); await until(() => kbRow('f1') && kbRow('f1').all(c => c.tagName === 'B')[0].textContent === 'f1');
      FD.type(doc, find, 'f-1 gren'); await until(() => kbRow('f1') && kbRows().length === 1);
      assert.ok(kbRow('f1').all(c => c.tagName === 'B')[0].textContent === 'f1', 'by game name while file names are shown');
      FD.type(doc, find, 'cap_ 1'); await until(() => kbRows().length === 12 && !kbRow('f1'));
      assert.ok(kc.textContent.includes(en['units.kit.br.found'].replace('{n}', 14).replace('{t}', 47)) && kc.textContent.includes(en['units.kit.br.more'].replace('{n}', 2).replace('{left}', 2)), 'every word must match; a search shows 12 rows of a group first');
      FD.type(doc, find, 'zzz'); await until(() => kc.textContent.includes(en['units.kit.br.none'])); assert.ok(!kbRows().length);
      sw.checked = true; sw.fire('change');
      FD.type(doc, find, 'mosin'); await until(() => kbRow('mosin'));
      const m3 = kbRow('mosin').all(c => c.tagName === 'BUTTON' && c.textContent === en['units.kit.model'])[0]; assert.ok(m3, 'See its 3D model'); m3.click();
      assert.deepStrictEqual(picked, ['mosin'], 'the Models page is opened on the item');
      // add to the soldier: the Add box's way, the grid's fits line said again beside the list
      const add = kbBtn('mosin', 'data-kba'); assert.ok(add.disabled === false && !add.title, 'a soldier is open: Add is on');
      const ns = P.sent.length; add.click(); await until(() => tile('mosin') && kbRow('mosin') && !kbBtn('mosin', 'data-kba').disabled);
      const pb = P.sent.slice(ns).filter(x => x.url === '/api/x/units/kit')[0];
      assert.deepStrictEqual(pb.body.pending.add.filter(a => a.item === 'mosin'), [{ item: 'mosin', filled: true }], JSON.stringify(pb.body.pending));
      const fits = kc.all(c => c.getAttribute && c.getAttribute('role') === 'status').map(c => c.textContent);
      assert.ok(fits.some(x => /^Mosin rifle: /.test(x) && x.includes(en['units.kit.fits'].replace('{used}', 6).replace('{total}', 12))), fits.join(' | '));
      kbBtn('mosin', 'data-kba').click();
      assert.ok(kc.all(c => c.getAttribute && c.getAttribute('role') === 'status').some(c => c.textContent === 'Mosin rifle: ' + en['units.kit.already'].replace('{n}', 'Mosin rifle')), 'a second add says the soldier has it');
      btnIn(kc, 'units.kit.undo').click(); await until(() => !tile('mosin'));
      assert.strictEqual(kbItems(), n0, 'searching and adding ask no new list');
      // Browse of the search box: the item files of the game data; the picked file's name is the search
      const bs = []; P.picker((spec, done) => { bs.push(spec); done('set/stuff/grenade/f1', { view: 'data' }); });
      find._sk.browseButton.click(); await until(() => kbRow('f1') && !kbRow('mosin'));
      assert.ok(bs[0].view === 'data' && bs[0].start === 'set/stuff' && find.value === 'f1', JSON.stringify(bs[0]));
      FD.type(doc, find, ''); await until(() => kbHead('headgear') && !kbRows().length);
      delete P.env.EXT_SCREENS.models; delete P.S.screens.models;
      blocksOk('after the equipment browser');
      ok('Equipment browser with a soldier: search by game name and by file name whatever the switch shows, pictures from the 3D view, See its 3D model, Add to this soldier with the fits line, Browse');
    }
    // a vehicle (owner 2026-11-22): its box as the grid, its weapon slots, what a slot takes, another weapon put into the slot
    {
      let vrow = null; for (let i = 0; i < 100 && !vrow; i++) { await FD.settle(); vrow = root.all(c => c.tagName === 'TR' && /T-34\/85/.test(c.textContent))[0]; }
      assert.ok(vrow, 'search list has the T-34/85'); vrow.fire('click');
      await until(() => root.all(c => c.tagName === 'H3' && /t34_3/.test(c.textContent)).length);
      const slotBox = n => kc.all(c => c.attrs && c.attrs['data-kslotbox'] === n)[0], slBtn = n => kc.all(c => c.tagName === 'BUTTON' && c.attrs && c.attrs['data-kslot'] === n)[0];
      const slRow = n => kc.all(c => c.tagName === 'LI' && c.attrs && c.attrs['data-ksli'] === n)[0], slAsked = () => P.sent.filter(x => x.url === '/api/x/units/kit/slot').length;
      const blkOf = id => kc.all(c => c.attrs && c.attrs['data-blk'] === id)[0];
      btnIn(kc, 'units.kit.fromOpen').click();
      await until(() => slotBox('mgun') && tile('dt'));
      const vb = kc.all(c => c.tagName === 'BUTTON' && c.attrs && c.attrs['data-kitveh'])[0];
      assert.ok(vb && vb.getAttribute('aria-pressed') === 'true' && kc.all(c => c.tagName === 'BUTTON' && c.attrs && c.attrs.title === 'mp/rus/tankman').length === 1, 'the Vehicle button is on, the crew are buttons beside it');
      assert.ok(kc.all(c => c.getAttribute && c.getAttribute('role') === 'group' && c.getAttribute('aria-label') === en['units.kit.gridAria'].replace('{w}', 5).replace('{h}', 4)).length === 1, 'the grid is the vehicle\'s own box, 5 x 4');
      assert.ok(tile('dt').textContent.includes('mgun') && /in the slot mgun/.test(tile('dt').getAttribute('aria-label')) && tile('mgun ammo').textContent.includes('500'), tile('dt').getAttribute('aria-label'));
      assert.ok(blkOf('kit.slots-title').hidden === false && blkOf('kit.slots-title').textContent === en['units.kit.sl.h'] && blkOf('kit.slot-list').hidden === true, 'the slots have their own titled section; the list is closed');
      assert.deepStrictEqual(['gun', 'mgun', 'mgun2'].map(n => slotBox(n).getAttribute('aria-label')), ['Slot gun: 85mm_zis_s53', 'Slot mgun: dt', 'Slot mgun2: dt']);
      assert.ok(slotBox('mgun').textContent.includes(en['units.kit.sl.mask'].replace('{t}', 'weapon + mgun').replace('{n}', 2)) && slotBox('gun').textContent.includes(en['units.kit.sl.fixed'].replace('{n}', 5)), slotBox('gun').textContent);
      assert.strictEqual(slAsked(), 0, 'nothing is asked until a slot is opened');
      slBtn('mgun').click(); await until(() => slRow('dshk') && slRow('dt'));
      assert.ok(slAsked() === 1 && blkOf('kit.slot-list').hidden === false && slBtn('mgun').getAttribute('aria-expanded') === 'true' && kc.textContent.includes(en['units.kit.sl.list'].replace('{s}', 'mgun')), 'the list of the open slot');
      assert.ok(slRow('dt').textContent.includes(en['units.kit.sl.now']) && !slRow('dt').all(c => c.attrs && c.attrs['data-kslput']).length && slRow('dshk').textContent.includes(en['units.kit.br.loadsN'].replace('{a}', 'mgun ammo').replace('{n}', 50)), slRow('dshk').textContent);
      FD.type(doc, inputBy('units.kit.sl.find'), 'dsh'); await until(() => slRow('dshk') && !slRow('dt'));
      assert.ok(kc.textContent.includes(en['units.kit.sl.count'].replace('{n}', 1).replace('{t}', 2)) && slAsked() === 1, 'typing narrows the list and asks nothing');
      const ns = P.sent.length; slRow('dshk').all(c => c.tagName === 'BUTTON' && c.attrs && c.attrs['data-kslput'] === 'dshk')[0].click();
      await until(() => slotBox('mgun') && slotBox('mgun').getAttribute('aria-label') === 'Slot mgun: dshk' && tile('dshk'));
      assert.deepStrictEqual(P.sent.slice(ns).filter(x => x.url === '/api/x/units/kit')[0].body.pending.slots, { mgun: 'dshk' });
      assert.ok(kc.textContent.includes(en['units.kit.pend'].replace('{n}', 1)) && tile('dshk').textContent.includes('mgun') && !tile('dt').textContent.includes('mgun'), 'the change is pending; the grid shows the new weapon mounted, the old one stays in the box');
      const np = P.sent.length; btnIn(kc, 'units.preview').click();
      await until(() => P.sent.slice(np).some(s => s.url === '/api/x/units/kit/set' && !s.body.write) && blkOf('kit.res').textContent.includes(en['units.f.slot'] + ' (mgun)'));
      assert.deepStrictEqual(P.sent.slice(np).filter(s => s.url === '/api/x/units/kit/set')[0].body.slots, { mgun: 'dshk' });
      const vf = path.join(f2.mod, 'resource/entity/-vehicle/tank_medium/t34_3/t34_3.def'), vtxt = () => { try { return fs.readFileSync(vf, 'latin1'); } catch (e) { return ''; } };
      FD.userClick(doc, btnIn(kc, 'units.write'));
      await until(() => /\{item "dshk" filled \{user "mgun"\}\}/.test(vtxt()));
      assert.ok(vtxt().includes('{item "dt" filled}') && !/[^\r]\n/.test(vtxt()), vtxt());
      await until(() => !kc.textContent.includes(en['units.kit.pend'].replace('{n}', 1)) && slotBox('mgun') && slotBox('mgun').getAttribute('aria-label') === 'Slot mgun: dshk');
      blocksOk('after a vehicle slot change');
      ok('Equipment of a vehicle: its box as the grid with the mounted weapon marked, a titled slots section, the list of what a slot takes (searchable), Put into this slot, Preview and Write into the mod');
      kc.all(c => c.tagName === 'BUTTON' && c.attrs && c.attrs.title === 'mp/rus/tankman')[0].click();
      await until(() => kc.textContent.includes(en['units.kit.empty']) || kc.textContent.includes('No soldier file'));
      const vb2 = kc.all(c => c.tagName === 'BUTTON' && c.attrs && c.attrs['data-kitveh'])[0];
      assert.ok(vb2 && vb2.getAttribute('aria-pressed') === 'false' && blkOf('kit.slots').hidden === true, 'a crew soldier is open: the Vehicle button stays to go back');
      vb2.click(); await until(() => slotBox('mgun'));
      ok('Equipment of a vehicle: the crew soldiers are buttons beside the Vehicle button, both ways');
    }
    // skin and texture variant (owner 2026-11-22): the part under the equipment of the open soldier or vehicle
    {
      const wait = async f => { let v = null; for (let i = 0; i < 2000 && !(v = f()); i++) { await FD.settle(); await new Promise(r => setTimeout(r, 2)); } return v; };
      const blkOf = id => kc.all(c => c.attrs && c.attrs['data-blk'] === id)[0], sk = blkOf('kit.skin');
      const texSel = () => sk.all(c => c.tagName === 'SELECT' && c.getAttribute('aria-label') === en['units.sk.tex'])[0];
      // the vehicle is open: no skin, the variant select, no skin search
      await wait(() => sk.hidden === false && sk.textContent.includes(en['units.sk.vehNoSkin']));
      assert.ok(blkOf('kit.skin.find').hidden === true && texSel() && sk.textContent.includes(en['units.sk.texNoFiles']), sk.textContent.slice(0, 600));
      ok('Skin and texture variant of a vehicle: one line that a vehicle wears no skin, the variant select, no skin search');
      // a stand-in for the Models page (its 3D viewer and its pick), for the picture of the block below
      const scenes = [], picks = [], vsel = () => sk.all(c => c.tagName === 'SELECT' && c.getAttribute('aria-label') === en['units.sk.viewSel'])[0];
      const view = (c, o) => { const e = P.env.h('div', { text: '3D' }); e.setScene = s => scenes.push(s); scenes.push(o.scene); view.opts = o; return e; };
      P.env.EXT_SCREENS.models = { parts: { viewer: view } }; P.S.screens.models = { pick: (n, o) => picks.push([n, o]) };
      P.picker((spec, done) => done('set/breed/mp/rus/look1.set', { view: 'data' })); inputBy('units.kit.unit')._sk.browseButton.click();
      await wait(() => sk.textContent.includes(en['units.sk.now'].replace('{s}', 'rus_inf')));
      assert.ok(blkOf('kit.skin.find').hidden === false && sk.textContent.includes(en['units.sk.pickNone']) && sk.textContent.includes(en['units.sk.texSoldier']), sk.textContent.slice(0, 900));
      assert.deepStrictEqual(texSel().options.map(o => o.value + '=' + o.textContent), ['=' + en['units.sk.texNone'], 'camo=camo  (1 of 1 textures)']);
      // the picture of the block: its own select shows a variant without picking one to write; "Open in Models" takes it along
      {
        assert.ok(blkOf('kit.skin.view') && blkOf('kit.skin.view.pick') && blkOf('kit.skin.view.pic'), 'the picture blocks');
        assert.deepStrictEqual(vsel().options.map(o => o.value), ['', 'camo']); assert.ok(sk.textContent.includes(en['units.sk.viewHint']));
        const nSet = () => P.sent.filter(x => x.url === '/api/x/units/look/set').length, s0 = nSet();
        vsel().value = 'camo'; vsel().fire('change');
        assert.ok(scenes.length >= 1, 'the picture is drawn'); const sc = scenes[scenes.length - 1];
        assert.deepStrictEqual([sc.url, sc.body.look, sc.body.id, sc.body.mod], ['/api/x/units/lineup', { of: 'breed:mp/rus/look1', only: true, kind: 'soldier', variant: 'camo' }, 'mp/rus/look1', f2.mod], JSON.stringify(sc));
        assert.ok(view.opts.blk === 'kit.skin.view.v' && view.opts.doc === false, 'one small viewer in the block');
        assert.ok(sk.textContent.includes(en['units.sk.pickNone']) && texSel().value === '' && nSet() === s0, 'the picture select picks nothing to write');
        vsel().value = ''; vsel().fire('change');
        assert.deepStrictEqual(scenes[scenes.length - 1].body.look, { of: 'breed:mp/rus/look1', only: true, kind: 'soldier', variant: false }, 'None: the plain textures whatever the file says');
        vsel().value = 'camo'; vsel().fire('change');
        const om = btnIn(sk, 'units.sk.inModels'); assert.ok(om, 'Open in Models button'); om.click();
        assert.deepStrictEqual(picks, [['rus_inf', { variant: 'camo' }]]);
        vsel().value = ''; vsel().fire('change');
        const lu = await route('/api/x/units/lineup', Object.assign({}, sc.body, { brief: true }));
        assert.ok(Array.isArray(lu.figures) && lu.figures.length <= 1 && Array.isArray(lu.notes) && lu.men === 1 && lu.vehicles === 0, JSON.stringify(lu).slice(0, 300));
        delete P.env.EXT_SCREENS.models; delete P.S.screens.models;
        blocksOk('with the picture of the skin block');
        ok('Skin block picture: the open soldier alone (look {of, only}), its select redraws it with a variant or none and writes nothing, Open in Models passes the skin and the variant; the line-up answers for a soldier that is no card of the buy lists');
      }
      const body = blkOf('kit.skin.list'), tog = btnIn(sk, 'units.sk.open'), nSk = () => P.sent.filter(x => x.url === '/api/x/units/look/skins').length;
      assert.ok(body.hidden === true && tog.getAttribute('aria-expanded') === 'false' && nSk() === 0, 'the list is closed and not asked for');
      tog.click(); const row = n => sk.all(c => c.tagName === 'LI' && c.attrs && c.attrs['data-ski'] === n)[0], use = n => sk.all(c => c.tagName === 'BUTTON' && c.attrs && c.attrs['data-sku'] === n)[0];
      await wait(() => row('rus_off'));
      assert.ok(body.hidden === false && nSk() === 1 && sk.all(c => c.tagName === 'LI').length === 3 && sk.textContent.includes(en['units.sk.count'].replace('{n}', 3).replace('{g}', 1)), sk.textContent.slice(0, 900));
      assert.ok(row('rus_inf').textContent.includes(en['units.sk.cur']) && use('rus_inf').disabled === true && row('rus2_inf').textContent.includes(en['units.sk.rowTex'].replace('{v}', 'camo')) && row('rus_off').textContent.includes(en['units.sk.wornNone']), row('rus2_inf').textContent);
      FD.type(doc, inputBy('units.sk.find'), 'off'); await wait(() => sk.all(c => c.tagName === 'LI').length === 1 && row('rus_off'));
      assert.ok(sk.textContent.includes(en['units.sk.found'].replace('{n}', 1).replace('{t}', 3)), 'typing narrows the list');
      use('rus_off').click();
      assert.ok(sk.textContent.includes(en['units.sk.pickSkin'].replace('{s}', 'rus_off')) && texSel().disabled === true && sk.textContent.includes(en['units.sk.texAfterSkin']), sk.textContent.slice(0, 900));
      const n0 = P.sent.length; btnIn(sk, 'units.preview').click();
      await wait(() => P.sent.slice(n0).some(s => s.url === '/api/x/units/look/set' && !s.body.write) && blkOf('kit.skin.res').textContent.includes(en['units.f.skin']));
      assert.deepStrictEqual([P.sent.slice(n0).filter(s => s.url === '/api/x/units/look/set')[0].body.skin, P.sent.slice(n0).filter(s => s.url === '/api/x/units/look/set')[0].body.breed], ['rus_off', 'mp/rus/look1']);
      const bf = path.join(f2.mod, 'resource/set/breed/mp/rus/look1.set'), btxt = () => { try { return fs.readFileSync(bf, 'latin1'); } catch (e) { return ''; } };
      assert.strictEqual(btxt(), '', 'a preview writes nothing');
      FD.userClick(doc, btnIn(sk, 'units.write'));
      await wait(() => btxt().includes('{skin "rus_off"}') && sk.textContent.includes(en['units.sk.now'].replace('{s}', 'rus_off')) && sk.textContent.includes(en['units.sk.pickNone']));
      assert.ok(!/[^\r]\n/.test(btxt()), 'CRLF kept');
      // the texture variant of the new skin: the select, then Preview
      await wait(() => texSel().disabled === false);
      texSel().value = 'camo'; texSel().fire('change');
      assert.ok(sk.textContent.includes(en['units.sk.pickTex'].replace('{v}', 'camo')));
      const n1 = P.sent.length; btnIn(sk, 'units.preview').click();
      await wait(() => P.sent.slice(n1).some(s => s.url === '/api/x/units/look/set' && s.body.texmod === 'camo') && blkOf('kit.skin.res').textContent.includes(en['units.f.texmod']));
      btnIn(sk, 'units.kit.undo').click(); assert.ok(sk.textContent.includes(en['units.sk.pickNone']) && texSel().value === '');
      blocksOk('after a skin change');
      ok('Skin and texture variant of a soldier: the skin worn now, the list closed until asked (one request), rows with who wears a skin, typing narrows it, Use this skin, Preview, Write into the mod, then the texture variant select and Undo');
    }
  }

  // open t34_0 from the search list
  let row = null; for (let i = 0; i < 100 && !row; i++) { await FD.settle(); row = root.all(c => c.tagName === 'TR' && /T-34\/76/.test(c.textContent))[0]; }
  assert.ok(row, 'search list'); row.fire('click');
  let gunTxt = ''; for (let i = 0; i < 100 && !gunTxt; i++) { await FD.settle(); const l = root.all(c => c.tagName === 'DIV' && c.textContent.startsWith(en['units.s.gun']))[0]; gunTxt = l ? l.textContent : ''; }
  assert.ok(/penetration at 100 m 85/.test(gunTxt) && !/\?/.test(gunTxt), gunTxt); ok('GT-13 the stats card shows the gun numbers, no "?"');
  {
    // owner 2026-11-22: rank hidden until "Show rank" is on; infantry armour reads N/A; the stats show the unlock time, no head start line
    const sc = cardBy('units.search.h'), rankTh = () => sc.all(c => c.tagName === 'TH' && c.textContent === en['units.col.rank'])[0];
    const rankBox = sc.all(c => c.tagName === 'LABEL' && c.textContent.trim() === en['units.rank.show'])[0].all(c => c.tagName === 'INPUT')[0];
    const statTxt = () => root.all(c => c.attrs && c.attrs['data-blk'] === 'stats')[0];
    const rankLine = () => statTxt().all(c => c.tagName === 'DIV' && c.textContent.startsWith(en['units.s.rank']))[0];
    assert.ok(rankBox.checked === false && rankTh().hidden === true && rankLine() && rankLine().hidden === true, 'rank is hidden at first: no column, no line');
    assert.ok(statTxt().textContent.includes(en['units.s.charge']) && !statTxt().all(c => c.tagName === 'DIV' && c.classList.contains('row') && c.textContent.startsWith(en['units.s.fore'])).length, 'the unlock time is a line, the head start is not');
    const sq = root.all(c => c.tagName === 'TR' && /Regular infantry/.test(c.textContent))[0], tk = root.all(c => c.tagName === 'TR' && /T-34\/76/.test(c.textContent))[0];
    const cells = tr => tr.all(c => c.tagName === 'TD');
    assert.ok(sq && cells(sq)[4].textContent === en['units.na'] && cells(sq)[3].hidden === true && /\d+ \/ \d+/.test(cells(tk)[4].textContent), sq && sq.textContent + ' | ' + tk.textContent);
    rankBox.checked = true; rankBox.fire('change');
    assert.ok(rankTh().hidden === false && cells(sq)[3].hidden === false && rankLine().hidden === false, 'the switch shows the column and the line in place');
    rankBox.checked = false; rankBox.fire('change');
    assert.ok(rankTh().hidden === true && cells(tk)[3].hidden === true, 'and hides them again');
    ok('Show rank is off at first (no Rank column, no Rank needed line) and switches both in place; a squad\'s armour reads N/A; the stats list the unlock time and no head start line');
  }
  {
    // owner 2026-11-22: "Show game names" on the Find a unit card: off = the id first and no game name; one state with the Equipment card
    const sc = cardBy('units.search.h'), kc = cardBy('units.kit.h');
    const boxIn = card => card.all(c => c.tagName === 'LABEL' && c.textContent.trim() === en['units.kit.names'])[0].all(c => c.tagName === 'INPUT')[0];
    const sw = boxIn(sc), ksw = boxIn(kc), stat = () => root.all(c => c.attrs && c.attrs['data-blk'] === 'stats')[0];
    const firstB = re => { const tr = sc.all(c => c.tagName === 'TR' && re.test(c.textContent))[0]; return tr ? [tr.all(c => c.tagName === 'B')[0].textContent, tr.all(c => c.tagName === 'DIV')[0].textContent] : null; };
    assert.ok(sw.checked === true && ksw.checked === true, 'on at first');
    assert.deepStrictEqual(firstB(/t34_0/), ['T-34/76', 't34_0'], JSON.stringify(firstB(/t34_0/)));
    assert.ok(/^T-34\/76 \(t34_0\)$/.test(stat().all(c => c.tagName === 'H3')[0].textContent), stat().all(c => c.tagName === 'H3')[0].textContent);
    sw.checked = false; sw.fire('change');
    assert.deepStrictEqual(firstB(/t34_0/), ['t34_0', ''], JSON.stringify(firstB(/t34_0/)));
    assert.ok(stat().all(c => c.tagName === 'H3')[0].textContent === 't34_0' && ksw.checked === false, 'the stats title is the id; the Equipment card switch follows');
    ksw.checked = true; ksw.fire('change');
    assert.ok(sw.checked === true && firstB(/t34_0/)[0] === 'T-34/76', 'and back from the Equipment card switch');
    ok('Show game names on the Find a unit card: off lists ids only (rows, stats title), on lists game names with the id under; one state with the Equipment card switch');
  }
  {
    // owner 2026-11-22: a group buy lists what it brings and has no armour of its own
    const sc = cardBy('units.search.h'), q = inputBy('units.search'), stat = () => root.all(c => c.attrs && c.attrs['data-blk'] === 'stats')[0];
    FD.type(doc, q, 'strike'); let tr = null;
    for (let i = 0; i < 100 && !tr; i++) { await FD.settle(); tr = sc.all(c => c.tagName === 'TR' && /strike_group/.test(c.textContent))[0]; }
    assert.ok(tr, 'the group is found');
    assert.ok(tr.all(c => c.tagName === 'TD')[4].textContent === en['units.na'] && /2 x T-34\/76, 6 x /.test(tr.textContent), tr.textContent);
    tr.fire('click'); let line = null;
    for (let i = 0; i < 100 && !line; i++) { await FD.settle(); line = stat().all(c => c.tagName === 'DIV' && c.classList.contains('row') && c.textContent.startsWith(en['units.s.brings']))[0]; }
    assert.ok(line && /2 x T-34\/76 \(crew: 3 x .*, 1 x .*\), 6 x /.test(line.textContent), line && line.textContent);
    assert.ok(stat().textContent.includes('In all: 2 vehicles and 14 soldiers') && stat().textContent.includes(en['units.s.armor'] + en['units.na']), stat().textContent.slice(0, 600));
    // back to t34_0 for the tests below
    FD.type(doc, q, 't34'); let t0 = null;
    for (let i = 0; i < 100 && !t0; i++) { await FD.settle(); t0 = sc.all(c => c.tagName === 'TR' && /t34_0/.test(c.textContent) && !/strike/.test(c.textContent))[0]; }
    t0.fire('click'); for (let i = 0; i < 100 && !/t34_0/.test((stat().all(c => c.tagName === 'H3')[0] || {}).textContent || ''); i++) await FD.settle();
    ok('a group buy on the page: the search row and the stats list "2 x T-34/76 (crew ..), 6 x rifle", the totals, and armour N/A');
  }
  {
    // owner 2026-11-22: no item in both places. Units (make view) = the name and what a unit is made of; Balance quick changes = numbers
    const mk = cardBy('units.ch.h'), nm = cardBy('units.num.h'), rc = cardBy('units.rc.range.h');
    const blks = card => card.all(c => c.attrs && c.attrs['data-blk']).map(c => c.attrs['data-blk']);
    assert.ok(mk && blks(mk).includes('change.name') && blks(mk).includes('change.squad') && !mk.all(c => c.tagName === 'SELECT' && c.getAttribute('aria-label') === en['units.ch.field']).length, 'make view card: name + squad size, no number field');
    const fs2 = nm.all(c => c.tagName === 'SELECT' && c.getAttribute('aria-label') === en['units.ch.field'])[0];
    assert.deepStrictEqual(fs2.all(c => c.tagName === 'OPTION').map(o => o.value), ['cost', 'armor', 'charge', 'level', 'fore']);
    assert.ok(rc && !blks(rc).some(b => /squad/.test(b)) && blks(rc).includes('recipe.range'), 'the range card has no squad recipe');
    const tune = root.all(c => c.attrs && c.attrs['data-blk'] === 'tune')[0];
    assert.deepStrictEqual(tune.children.map(c => c.attrs['data-blk']), ['tune.bal', 'tune.num', 'tune.rec']);
    const tabs = root.all(c => c.tagName === 'BUTTON' && c.getAttribute('role') === 'tab').map(b => b.textContent);
    assert.ok(tabs.length === 8, 'the make view keeps its eight tool tabs (Unit card is the seventh): ' + tabs.join('|'));
    // rename through the make view card
    const rn = inputBy('units.ch.name'); assert.ok(rn.value === 'T-34/76', rn.value);
    FD.type(doc, rn, 'T-34 early'); const n1 = P.sent.length;
    btnIn(blkIn(mk, 'change.name'), 'units.preview').click();
    for (let i = 0; i < 100 && !P.sent.slice(n1).some(x => /units\/change$/.test(x.url)); i++) await FD.settle();
    const sentCh = P.sent.slice(n1).find(x => /units\/change$/.test(x.url));
    assert.ok(sentCh && sentCh.body.field === 'name' && sentCh.body.value === 'T-34 early' && !sentCh.body.write, JSON.stringify(sentCh && sentCh.body));
    ok('the split: Units keeps Rename + Bigger squad in one tab; the number change card (price, armour, unlock time, rank, head start) sits in the Balance quick changes with the range card; Rename previews through /change');
    function blkIn(card, id) { return card.all(c => c.attrs && c.attrs['data-blk'] === id)[0]; }
  }

  // GT-33: a real click on Write after a preview. The value field was edited and kept the focus; the preview was started by a
  // script click (no focus move). The mouse click on Write first blurs the field: its change event used to grey Write, and the
  // greyed button swallowed the click without a word (the page's own mod box, the field of the first report, is gone: rule 4)
  const ch = cardBy('units.num.h'), val = inputBy('units.ch.value');
  FD.type(doc, val, '410');
  btnIn(ch, 'units.preview').click(); await FD.settle(); await FD.settle();
  const n0 = P.sent.length;
  FD.userClick(doc, btnIn(ch, 'units.write'));
  for (let i = 0; i < 100 && !/410/.test(rd2()); i++) await FD.settle();
  function rd2() { try { return fs.readFileSync(path.join(f2.mod, 'resource/set/multiplayer/units/vehicles_rus.set'), 'latin1'); } catch (e) { return ''; } }
  assert.ok(P.sent.slice(n0).some(s => s.body && s.body.write === true), 'no write request sent');
  assert.ok(/"t34_0".*\{cost 410\}/.test(rd2())); ok('GT-33 Write by mouse click after a preview sends the write');
  // GT-30: a plain price change says so in one line; no "looks the same as the copy", no bot buy list note
  await FD.settle();
  const said = ch.textContent;
  assert.ok(said.includes('Price changed from 350 to 410.'), said);
  assert.ok(!said.includes(en['units.same3d']) && !said.includes(en['units.info.GEN_ROSTER_REPLACES']), said);
  assert.ok(said.includes(en['units.info.fileCopy'].replace('{f}', 'vehicles_rus.set')), said);
  ok('GT-30 price change result: "Price changed from 350 to 410.", the file copy named, no 3D or bot notes');
  blocksOk('after search, stats and a write'); ok('blocks: the search list, the stats and the change result stay inside their leaf blocks');
  // a click on Write with no fresh preview says why instead of doing nothing
  P.toasts.length = 0; const n1 = P.sent.length; FD.userClick(doc, btnIn(ch, 'units.write'));
  assert.strictEqual(P.sent.length, n1); assert.ok(P.toasts.includes(en['units.previewFirst'])); ok('GT-33 Write without a fresh preview says "Press Preview first"');
  // units.next: applying the mods again is enough, no restart
  const noRestart = { en: 'no need to restart the game', ru: 'перезапускать игру не нужно', uk: 'перезапускати гру не потрібно', zh: '无需重启游戏' };
  for (const l of Object.keys(noRestart)) assert.ok(ext.lang[l]['units.next'].includes(noRestart[l]) && !/restart the game\)|перезапустите игру\)|перезапустіть гру\)|重启游戏）/.test(ext.lang[l]['units.next']), l);
  ok('units.next does not ask for a game restart');
  // CACHE (gui README, contract 1): the catalogue is kept in the shared store. One statsheet run for the game and one for the mod;
  // after a restart (memory empty) both come from the store and equal the read ones; the game's catalogue is shared by every mod;
  // a file in an area the catalogue does not read (a map, a file outside resource/) keeps it, a card file edit reads the mod again
  {
    const dc = path.join(scratch, 'cachefx'); fs.rmSync(dc, { recursive: true, force: true });
    const fc = fx.make(dc), L = require('./server').lib; let runs = 0;
    const cc = Object.assign({}, ctx, { gamedir: fc.game, game: () => fc.game, tmpRoot: path.join(dc, 'tmp'),
      runTool: async (tool, entry, args, o) => { if (tool === 'statsheet') runs++; return ctx.runTool(tool, entry, args, o); } });
    fs.mkdirSync(cc.tmpRoot, { recursive: true });
    const plain = c => JSON.stringify(c.units);
    const b1 = await L.both(cc, fc.game, fc.mod); assert.strictEqual(runs, 2, 'game + mod read');
    const v1 = JSON.stringify(b1.van.units), c1 = plain(b1.cur);
    ext._t._forget(); const b2 = await L.both(cc, fc.game, fc.mod);
    assert.strictEqual(runs, 2, 'after a restart: from the store'); assert.strictEqual(JSON.stringify(b2.van.units), v1); assert.strictEqual(plain(b2.cur), c1);
    assert.ok(!fs.readdirSync(path.join(cc.tmpRoot, 'units')).some(f => /^cat-/.test(f)), 'no catalogue file left in the temp folder');
    const far = [path.join(fc.mod, 'resource', 'map', 'm1', 'note.txt'), path.join(fc.mod, 'readme.txt')];
    for (const p of far) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, 'x'); }
    ext._t._forget(); await L.both(cc, fc.game, fc.mod); assert.strictEqual(runs, 2, 'a map file and a root file: not read again');
    const PC = ext.prep.find(p => p.id === 'units.catalogue'), q = { mod: fc.mod, game: { id: 'as64', dir: fc.game } };
    assert.deepStrictEqual([PC.needs, typeof ext.lang.en[PC.title]], [['game.view', 'mod.tree'], 'string']);
    assert.strictEqual(PC.state(cc, q).state, 'ready', JSON.stringify(PC.state(cc, q)));
    assert.strictEqual(PC.state(cc, { mod: path.join(dc, 'nomod'), game: q.game }).state, 'none');
    const note = path.join(fc.mod, 'resource', 'set', 'note.txt'); fs.mkdirSync(path.dirname(note), { recursive: true }); fs.writeFileSync(note, 'x');
    await require('../../../lib/modtree').ensure(fc.mod, { maxAgeMs: 0 });
    let ps = PC.state(cc, q); assert.deepStrictEqual([ps.state, ps.why], ['stale', ['mod']], JSON.stringify(ps));
    const seen = []; await PC.run(cc, q, { set: o => seen.push(o.stage), cancelled: false });
    assert.strictEqual(runs, 3, 'a file under resource/set: the mod is read again, the game is not'); assert.deepStrictEqual(seen, ['game', 'mod', 'done']);
    assert.strictEqual(PC.state(cc, q).state, 'ready'); await L.both(cc, fc.game, fc.mod); assert.strictEqual(runs, 3, 'the page hits what Prepare made');
    const mod2 = path.join(fc.game, 'mods', 'second'); fs.mkdirSync(path.join(mod2, 'resource', 'set'), { recursive: true }); fs.writeFileSync(path.join(mod2, 'mod.info'), '{mod}');
    ext._t._forget(); await L.both(cc, fc.game, mod2); assert.strictEqual(runs, 4, 'another mod: its own read, the game catalogue shared');
    ok('CACHE: catalogue in the shared store (restart, shared game catalogue, narrow areas), Prepare section units.catalogue');
  }

  {
    // tool "Unit card" (card.js, tools/unitcard): its routes, the kinds of each game (GoH: shop, no scheme, with the reason), a make
    // without a picture is refused, the tool card is one of the tool tabs and the card's own picture work is tested in tools/unitcard
    const C = ['kinds', 'current', 'styles', 'scene', 'plan', 'make', 'load', 'images', 'gimp', 'cutouts', 'openxcf', 'fidelity'].map(k => 'POST /api/x/units/card/' + k);
    assert.ok(C.every(k => typeof R[k] === 'function'), 'card routes');
    const kA = await R['POST /api/x/units/card/kinds']('', { gid: 'as64' }, ctx2), kG = await R['POST /api/x/units/card/kinds']('', { gid: 'goh' }, ctx2);
    assert.ok(kA.kinds.some(k => k.id === 'scheme') && !kG.kinds.some(k => k.id === 'scheme') && kG.na.some(n => n.id === 'scheme' && n.why) && kG.kinds.some(k => k.id === 'shop'), 'kinds per game');
    await assert.rejects(R['POST /api/x/units/card/make']('', { id: 't34_0', mod: f2.mod }, ctx2), /picture/);
    await assert.rejects(R['POST /api/x/units/card/load']('', {}, ctx2), /picture/);
    assert.ok(ext.script.indexOf('//@unitcard') < 0 && ext.script.indexOf("blk:'ucard'") > 0, 'the card client sits inside the Units screen');
    // owner 2026-11-22 "render it without the crew": the scene of a vehicle card asks the line-up for the vehicle alone (look.only) and
    // drops any other figure that still comes (crew, passengers); the camera fit (bounds) is the vehicle's box. A soldier card keeps him
    const SL = require('./server').lib, real = SL.lineupOf, asked = [];
    const box = (a, b) => ({ min: a, max: b });
    SL.lineupOf = async (c, body) => { asked.push(body); return { scene: { format: 'scene/1', bounds: box([-5, -5, 0], [40, 5, 3]), bones: [], volumes: [],
      meshes: [{ file: 'hull.ply', world: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], figure: 0 }, { file: 'man.ply', world: [1, 0, 0, 0, 1, 0, 0, 0, 1, 30, 0, 0], figure: 1 }, { file: 'man.ply', world: [1, 0, 0, 0, 1, 0, 0, 0, 1, 35, 0, 0], figure: 2 }] },
      figures: [{ index: 0, kind: 'vehicle', id: 't34_0', box: box([-5, -2, 0], [5, 2, 3]) }, { index: 1, kind: 'soldier', id: 'mp/rus/tankman', box: box([29, -1, 0], [31, 1, 2]) }, { index: 2, kind: 'soldier', id: 'mp/rus/tankman', box: box([34, -1, 0], [36, 1, 2]) }] }; };
    try {
      const sv = await R['POST /api/x/units/card/scene']('', { id: 't34_0', kind: 'card', group: 'vehicle', mod: f2.mod }, ctx2);
      assert.ok(asked[0].look && asked[0].look.only === true && asked[0].look.of === 't34_0' && asked[0].look.kind === 'vehicle', 'vehicle alone asked: ' + JSON.stringify(asked[0].look));
      assert.ok(sv.scene.meshes.length === 1 && sv.scene.meshes[0].file === 'hull.ply' && sv.dropped === 2 && sv.figures.every(f => f.kind !== 'soldier'), 'no crew in the vehicle card scene');
      const bx = sv.scene.bounds; assert.ok(bx.max[0] - bx.min[0] < 15 && bx.max[1] - bx.min[1] < 15, 'camera fit on the vehicle box alone: ' + JSON.stringify(bx));
      const ss = await R['POST /api/x/units/card/scene']('', { id: 'riflemans(rus)', kind: 'portrait', group: 'infantry', breed: 'mp/rus/rifle', mod: f2.mod }, ctx2);
      assert.ok(asked[1].look.of === 'breed:mp/rus/rifle' && ss.scene.meshes.length === 3, 'a soldier card keeps the soldier');
    } finally { SL.lineupOf = real; }
    ok('Unit card: routes, kinds per game with the GoH reasons, a make needs a picture, client in the screen, vehicle render without the crew (fit on the vehicle box), soldier card keeps the soldier');
  }

  // game parity: MoW:AS2 on the shared install, Gates of Hell on its own install (testgames.js)
  await require('./testgames').run({ scratch: path.join(scratch, 'games'), ok, TOOLS, fx });
  console.log('PASS units ext (' + n + ')');
})().catch(e => { console.error(e && e.stack || e); console.log('FAIL units ext'); process.exit(1); });
