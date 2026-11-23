// GEN-DESCRIBE test: words -> spec. Catalogue from the units fixture game (statsheet --units-json); the built-in reader, the spec
// vet (allowed ops, real ids, schema), and the AI path against a local stand-in server (no network, no real key):
// good answer, bad answer then corrected answer, refusal, key refused, no key.
// usage: node describe.js <scratch dir>
// Author: Imperator_Aug (ARSENAL, ia-b0ae91f4)
const fs = require('fs'), path = require('path'), cp = require('child_process'), http = require('http'), assert = require('assert');
const TOOLS = path.resolve(__dirname, '..', '..');
const scratch = path.resolve(process.argv[2] || path.join(__dirname, 'work'), 'describe');
fs.rmSync(scratch, { recursive: true, force: true }); fs.mkdirSync(scratch, { recursive: true });
const { describe } = require('../lib/describe'), ai = require('../lib/ai'), schema = require('../gen').schema();
const { game } = require('../../gui/ext/units/fixture').make(scratch);
let n = 0; const ok = m => { n++; console.log('OK ' + n + ' ' + m); };

(async () => {
  const file = path.join(scratch, 'cat.json');
  const r = cp.spawnSync(process.execPath, [path.join(TOOLS, 'statsheet/statsheet.js'), game, '--units-json', '-o', file, '-q'], { encoding: 'utf8' });
  assert.ok(fs.existsSync(file), 'catalogue: ' + r.stderr);
  const cat = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ops = s => s.ops.map(o => o.op).join(' ');

  // built-in reader
  let d = describe('fast soviet tank, cost 500, called Molot', cat, {});
  assert.ok(d.ok, d.error); assert.strictEqual(d.plan.id, 'molot'); assert.strictEqual(d.plan.base.army, 'rus'); assert.strictEqual(d.plan.cost, 500);
  assert.ok(/^clone .*roster$/.test(ops(d.spec)), ops(d.spec)); assert.ok(d.understood.length >= 3);
  assert.deepStrictEqual(ai.vet(d.spec, cat, schema, 'as64'), []); ok('reader: nation, kind, price, name -> clone .. roster, passes the vet');
  d = describe('soviet tank', cat, { id: 'my_tank' }); assert.strictEqual(d.plan.id, 'my_tank'); ok('reader: id option');
  d = describe('T-34 hull with the turret of the Tiger', cat, {});
  assert.ok(d.ok && d.spec.ops.some(o => o.op === 'kitbash' && o.turret_from === 'pz6e'), JSON.stringify(d.spec)); ok('reader: hull of one, turret of another -> kitbash');
  d = describe('german rifle squad of 6 men', cat, {});
  assert.ok(d.ok && ops(d.spec) === 'squad' && d.plan.kind === 'squad', JSON.stringify(d.spec)); ok('reader: squad');
  assert.ok(!describe('purple monkey dishwasher', cat, {}).ok); assert.ok(!describe('a', cat, {}).ok); ok('reader: nothing recognised is refused');
  {
    // GoH mode over a made-up GoH catalogue row shape (statsheet gohUnits): one card copy; gun/turret refused, armour/speed on the op; Finland known
    const gc = { units: [
      { id: 'pz4h', kind: 'vehicle', army: 'ger', period: 'late', cost: 340, ownCost: 300, buyable: true, def: 'resource/entity/-vehicle/tank_medium/pz4h/pz4h.def', gun: { weapon: '75mm_kwk40' }, tags: 'tank ger late' },
      { id: 'bt42', kind: 'vehicle', army: 'fin', period: 'mid', cost: 200, ownCost: 180, buyable: true, def: 'resource/entity/-vehicle/tank_light/bt42/bt42.def', gun: { weapon: '114mm_h' }, tags: 'tank fin mid' },
      { id: 'rifles(fin)', kind: 'squad', army: 'fin', period: 'mid', cost: 60, ownCost: 10, buyable: true, members: [{ breed: 'fin/mid/leader', n: 1 }, { breed: 'fin/mid/rifleman', n: 4 }] },
      { id: 'single(fin)', kind: 'squad', army: 'fin', period: 'mid', cost: 12, ownCost: null, buyable: true, members: [{ breed: 'fin/mid/rifleman', n: 1 }] }] };
    let g = describe('fast german tank with thick armour, a bigger gun and the turret of the bt42, cost 400', gc, { goh: true });
    assert.ok(g.ok && g.spec.goh && ops(g.spec) === 'gohcard' && g.spec.ops[0].like === 'pz4h' && g.spec.ops[0].price === 360, JSON.stringify(g));
    assert.deepStrictEqual(g.refused.map(x => x.piece).sort(), ['gun', 'turret']);
    assert.ok(g.spec.ops[0].armor && g.spec.ops[0].armor.k > 1 && g.spec.ops[0].speed && g.spec.ops[0].speed.k > 1, 'armour and speed ride on the card op: ' + JSON.stringify(g.spec.ops[0]));
    g = describe('german tank pz4h with 100mm armour and 50 km/h', gc, { goh: true });
    assert.deepStrictEqual([g.spec.ops[0].armor, g.spec.ops[0].speed], [{ front: 100 }, { kmh: 50 }], JSON.stringify(g.spec.ops[0]));
    g = describe('finnish rifles squad of 10 men, cost 120', gc, { goh: true });
    assert.ok(g.ok && g.plan.base.id === 'rifles(fin)' && g.plan.id === g.spec.ops[0].id + '(fin)', JSON.stringify(g.plan));
    assert.deepStrictEqual([g.spec.ops[0].members, g.spec.ops[0].price, g.spec.ops[0].period], [['leader:2', 'rifleman:8'], 20, 'mid']);   // 120 - 50 x 2
    g = describe('finnish single squad, cost 30', gc, { goh: true });
    assert.ok(g.ok && g.spec.ops[0].price === null && g.refused.some(x => x.piece === 'price'), JSON.stringify(g));
    // GoH gun words with the gun read (lib/describe-gohgun.js): a gun op on the card op, b of the main pen row = 100 m, range one step of 10
    const gf = n => n === '75mm_kwk40' ? { found: true, recharge: 6, pen: [120, 110, 100, 90, 80], range: '200', accuracy: 'direct' } : null;
    g = describe('german tank pz4h with a stronger gun, long range, accurate, reload 5 s', gc, { goh: true, gunFacts: gf });
    const gg = g.spec.ops[0].gun;
    assert.ok(gg && gg.like === '75mm_kwk40' && gg.name === '75mm_' + g.spec.ops[0].id && gg.recharge === 5 && gg.pen_scale === 1.25 && gg.range === '210' && gg.place === 'gun' && !g.refused.length && g.assumed.some(x => /accuracy words/.test(x)), JSON.stringify(g));
    g = describe('german tank pz4h with a 100mm gun', gc, { goh: true, gunFacts: gf });
    assert.ok(!g.spec.ops[0].gun && g.refused.some(x => x.piece === 'gun') === false, JSON.stringify(g));
    g = describe('finnish tank bt42 with a stronger gun', gc, { goh: true, gunFacts: gf });
    assert.ok(!g.spec.ops[0].gun && g.refused.some(x => x.piece === 'gun'), 'a gun gohgun cannot read is refused: ' + JSON.stringify(g));
    ok('reader GoH mode: gun words as a gun op on the card op, accuracy said, unread gun refused');
    assert.ok(!describe('finnish tank', cat, {}).understood.some(x => /Finnish/.test(x)), 'AS2: the nation list is unchanged');
    ok('reader GoH mode: one card copy, own price = total - members, men counts, refused pieces, Finland (GoH only)');
  }

  // vet
  const good = describe('soviet tank called Vet', cat, {}).spec;
  const bad = (spec, re) => { const w = ai.vet(spec, cat, schema, 'as64'); assert.ok(w.length && re.test(w.join('|')), JSON.stringify(w)); };
  bad({ ops: [{ op: 'mod', name: 'x' }] }, /mod/);
  bad({ ops: [{ op: 'clone', entity: 'no_such', as: 'zz_new' }] }, /no_such/);
  bad({ ops: [{ op: 'clone', entity: 't34_0', as: 'Bad Id' }] }, /Bad Id/);
  bad({ ops: good.ops.concat([{ op: 'set', entity: 't34_0', values: { 'game_entity/mass': 1 } }]) }, /t34_0/);
  bad(null, /./); ok('vet: other ops, unknown unit, bad id, edits on a game unit, no spec');

  // AI path against a local stand-in for the Messages API
  const answers = [], seen = [];
  const srv = http.createServer((q, s) => { let b = ''; q.on('data', c => b += c); q.on('end', () => {
    seen.push({ url: q.url, key: q.headers['x-api-key'], body: JSON.parse(b) });
    const a = answers.shift() || { status: 500, j: { error: { message: 'no answer queued' } } };
    s.writeHead(a.status || 200, { 'content-type': 'application/json' }); s.end(JSON.stringify(a.j));
  }); });
  await new Promise(res => srv.listen(0, '127.0.0.1', res));
  const env = Object.assign({}, process.env);
  process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:' + srv.address().port; process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
  const msg = (obj, stop) => ({ status: 200, j: { model: 'stand-in', stop_reason: stop || 'end_turn', content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] } });
  try {
    assert.ok(ai.available().ok);
    answers.push(msg({ spec: good, understood: ['Soviet tank'], assumed: ['name Vet'] }));
    let a = await ai.aiDescribe('soviet tank called Vet', cat, { schema, target: 'as64' });
    assert.ok(a.ok, a.error); assert.strictEqual(a.plan.id, 'vet'); assert.deepStrictEqual(a.understood, ['Soviet tank']);
    assert.strictEqual(seen[0].url, '/v1/messages'); assert.strictEqual(seen[0].key, 'test-key-not-real');
    assert.ok(/Catalogue:/.test(seen[0].body.system[0].text) && /t34_0/.test(seen[0].body.system[0].text) && seen[0].body.system[0].cache_control);
    assert.ok(/soviet tank called Vet/.test(seen[0].body.messages[0].content)); ok('ai: good answer -> vetted spec + plan; catalogue in the cached system prompt');

    seen.length = 0;
    answers.push(msg({ spec: { ops: [{ op: 'clone', entity: 'no_such', as: 'zz_new' }] } }), msg('```json\n' + JSON.stringify({ spec: good }) + '\n```'));
    a = await ai.aiDescribe('soviet tank called Vet', cat, { schema, target: 'as64' });
    assert.ok(a.ok, a.error); assert.strictEqual(seen.length, 2); assert.strictEqual(seen[1].body.messages.length, 3);
    assert.ok(/no_such/.test(seen[1].body.messages[2].content)); ok('ai: refused spec goes back once with the findings, corrected answer accepted');

    answers.push(msg({ spec: { ops: [{ op: 'mod', name: 'x' }] } }), msg({ spec: { ops: [{ op: 'mod', name: 'x' }] } }));
    a = await ai.aiDescribe('x y z', cat, { schema, target: 'as64' }); assert.ok(!a.ok && /checks/.test(a.error), a.error); ok('ai: two bad specs -> not used');
    answers.push(msg('', 'refusal')); a = await ai.aiDescribe('x y z', cat, { schema }); assert.ok(!a.ok && /declined/.test(a.error)); ok('ai: refusal reported');
    answers.push({ status: 401, j: { error: { message: 'invalid x-api-key' } } }); a = await ai.aiDescribe('x y z', cat, { schema }); assert.ok(!a.ok && /key was refused/.test(a.error)); ok('ai: key refused');
    answers.push({ status: 400, j: { error: { message: 'unknown field fallbacks' } } }, msg({ spec: good }));
    seen.length = 0; a = await ai.aiDescribe('soviet tank called Vet', cat, { schema }); assert.ok(a.ok, a.error); assert.ok(seen[0].body.fallbacks && !seen[1].body.fallbacks); ok('ai: endpoint without the fallback field gets the plain request');
    delete process.env.ANTHROPIC_API_KEY; process.env.ARSENAL_AI_KEY_FILE = path.join(scratch, 'none.key'); process.env.USERPROFILE = scratch; process.env.HOME = scratch;
    a = await ai.aiDescribe('soviet tank', cat, { schema }); assert.ok(!a.ok && /No API key/.test(a.error), a.error); ok('ai: no key -> plain message, nothing sent');
  } finally { srv.close(); for (const k of ['ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY', 'ARSENAL_AI_KEY_FILE', 'USERPROFILE', 'HOME']) { if (env[k] == null) delete process.env[k]; else process.env[k] = env[k]; } }
  console.log('PASS describe (' + n + ')');
})().catch(e => { console.error(e && e.stack || e); console.log('FAIL describe'); process.exit(1); });
