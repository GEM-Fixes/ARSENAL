// BALANCE test: lib on a made-up catalogue (resources from preset text, wait at start from cooldown and fore, price model on
// manpower prices only, seeded units that do not fit, selection, groups, pivot, change plans) and the CLI on the units fixture
// game (summary, sheet, a price change and a wait change written into the fixture mod). No game, no network.
// usage: node test.js <scratch dir>
// Author: Imperator_Aug (ARSENAL, ia-1b0ab069)
const fs = require('fs'), path = require('path'), cp = require('child_process'), assert = require('assert');
const B = require('../lib');
const TOOLS = path.resolve(__dirname, '..', '..');
const scratch = path.resolve(process.argv[2] || path.join(__dirname, 'work'), 'balance');
fs.rmSync(scratch, { recursive: true, force: true }); fs.mkdirSync(scratch, { recursive: true });
let n = 0; const ok = m => { n++; console.log('OK ' + n + ' ' + m); };

// ---- economy
const PRESET = '(define "standard_all"\r\n {common\r\n  {chargeFactors\r\n   {value "hero=1.5;*=1.0;"} ; comment with ; inside\r\n  }\r\n  {budgets\r\n   {vehicle\r\n    {mode "standard"}\r\n    {resource {start %start} {finish %finish} }\r\n    {buttons "squad1 v1 v2"}\r\n   }\r\n   {hero\r\n    {resource\r\n     {start 10}\r\n    }\r\n    {buttons "hero"}\r\n    {tag "special"}\r\n   }\r\n  }\r\n }\r\n)\r\n';
const eco = B.economy([PRESET, PRESET, '{x {chargeFactors {value "*=2"}}}']);
assert.deepStrictEqual(eco.budgets.map(b => b.res + ':' + b.buttons.join(',')), ['mp:squad1,v1,v2', 'sp:hero']);
assert.strictEqual(eco.budgets[1].start, 10); assert.strictEqual(eco.factors, 'hero=1.5;*=1'); assert.deepStrictEqual(eco.factorSets, ['hero=1.5;*=1', '*=2']);
ok('economy: budgets and their buttons, start budget, the most used cooldown factors; a ; inside a string is not a comment');
assert.strictEqual(B.resOf({ button: 'hero' }, eco), 'sp'); assert.strictEqual(B.resOf({ button: 'v1' }, eco), 'mp');
assert.strictEqual(B.resOf({ button: 'hero' }, null), 'sp'); assert.strictEqual(B.resOf({ button: 'x', tags: 'all hero' }, null), 'sp'); assert.strictEqual(B.resOf({ button: 'v9' }, null), 'mp');
assert.strictEqual(B.economy(['{budgets {vehicle {resource {start 1}} {buttons "v1"}} {doctrine {resource {start 5}} {buttons "dp1 dp2"}}}']).budgets[1].res, 'doctrine');
ok('resource of a unit: by the budget of its button; a mod budget keeps its own name; hero button or tag without presets');
assert.strictEqual(B.factorOf({ tags: 'all hero' }, eco), 1.5); assert.strictEqual(B.factorOf({ tags: 'all medium' }, eco), 1); assert.strictEqual(B.factorOf({ tags: 'x' }, null), 1);
assert.strictEqual(B.waitOf(120, -0.5, 1), 180); assert.strictEqual(B.waitOf(300, 0.5, 1), 150); assert.strictEqual(B.waitOf(60, 1, 1), 0); assert.strictEqual(B.waitOf(100, 0, 2), 200); assert.strictEqual(B.waitOf(null, 0, 1), null);
ok('wait at start = cooldown x factor x (1 - fore)');

// ---- made-up catalogue: 24 cars priced by a rule, plus seeded odd ones and heroes
const units = [];
const car = (id, army, a, pen, speed, cost, o) => units.push(Object.assign({ id, name: 'Car ' + id, kind: 'vehicle', army, buyable: true, cost, level: 1, charge: 120, fore: 0.5, button: 'v1', tags: 'all light', group: 'g' + id, crew: 3, cp: 5,
  def: 'resource/entity/-vehicle/car/' + id + '/' + id + '.def', speed, gun: { weapon: '37mm_' + id, range: '100/120', recharge: 4, damage: 100 + pen, pen: '10m:' + (pen + 9) + ' 100m:' + pen },
  armorMacro: [{ macro: 'armor_light', parts: [{ name: 'body', values: [a, a - 2, a - 4, 5] }] }] }, o || {}));
for (let i = 0; i < 24; i++) { const a = 10 + i * 2, pen = 30 + (i % 6) * 8, sp = 40 + (i % 5) * 5; car('c' + i, i % 2 ? 'ger' : 'rus', a, pen, sp, Math.round((60 + a * 6 + pen * 2 + sp) / 5) * 5); }
car('dear', 'ger', 20, 46, 50, 900);                       // priced far above the rule
car('nop', 'rus', 22, 46, 50, 0);                          // no price
car('early', 'ger', 70, 70, 60, 1000, { charge: 0, fore: 1 });   // the dearest, ready at once
const hero = (id, cost, o) => units.push(Object.assign({ id, name: 'Hero ' + id, kind: 'squad', army: 'ger', buyable: true, cost, level: 1, charge: 120, fore: -0.5, button: 'hero', tags: 'all hero', group: 'h1', members: [{ breed: 'x', n: 4 }] }, o || {}));
hero('h1', 1); hero('h2', 2); hero('h3', 3); hero('h4', 2); hero('hbig', 300); hero('hover', 12);
units.push({ id: 'sold', kind: 'soldier', army: 'ger', buyable: true, cost: 5 }, { id: 'hidden', kind: 'vehicle', army: 'ger', buyable: false, cost: 5 });
const cat = { units, byId: new Map(units.map(u => [u.id, u])) };
const d = B.build(cat, null, { economy: eco });
assert.strictEqual(d.rows.length, 33); const row = id => d.rows.find(r => r.id === id);
assert.strictEqual(row('c0').res, 'mp'); assert.strictEqual(row('h1').res, 'sp'); assert.strictEqual(row('c0').wait, 60); assert.strictEqual(row('c0').again, 120);
assert.strictEqual(row('h1').wait, 270); assert.strictEqual(row('h1').again, 180); assert.strictEqual(row('early').wait, 0); assert.strictEqual(row('c3').pen, 54);
ok('rows: buy-panel units only, resource, wait at start (hero factor 1.5), wait after buy, penetration at 100 m');
assert.ok(d.models.car && !d.models.car.weak && d.models.car.r2 > 0.8, JSON.stringify(d.models)); assert.ok(!d.models.squad && !d.models.other);
assert.ok(row('c5').fit != null && Math.abs(row('c5').off) < 15); assert.strictEqual(row('h1').fit, null);
ok('price model: fitted on manpower prices of one class; special-point prices get no model price');
const codes = id => d.odd.filter(o => o.id === id).map(o => o.code).sort().join(' ');
assert.ok(/PRICE_HIGH/.test(codes('dear')), codes('dear')); assert.ok(/NO_PRICE/.test(codes('nop')), codes('nop'));
assert.ok(/RES_SCALE/.test(codes('hbig')), codes('hbig')); assert.ok(/OVER_BUDGET/.test(codes('hover')), codes('hover')); assert.ok(/READY_EARLY/.test(codes('early')), codes('early'));
assert.strictEqual(codes('h1'), ''); assert.ok(!d.odd.some(o => /PRICE_/.test(o.code) && o.id[0] === 'h')); assert.ok(row('dear').odd >= 1);
ok('odd ones: price off the model, no price, special-point price on the manpower scale, price above the budget, dearest unit ready at once');

// ---- selection, groups, pivot, sheet
assert.strictEqual(B.select(d.rows, B.parseWhere('army=ger res=mp cost>300')).every(r => r.army === 'ger' && r.res === 'mp' && r.cost > 300), true);
assert.strictEqual(B.select(d.rows, B.parseWhere('id~^h res=sp')).length, 6); assert.strictEqual(B.select(d.rows, B.parseWhere('army=ger,rus')).length, 33); assert.strictEqual(B.select(d.rows, [], ['c1', 'C2']).length, 2);
assert.throws(() => B.parseWhere('nosuch=1'), /no column/); assert.throws(() => B.parseWhere('justtext'), /column=value/);
const g = B.groupBy(d.rows, ['res', 'army'], ['cost', 'wait']); assert.deepStrictEqual(g.map(x => x.key), ['mp | ger', 'mp | rus', 'sp | ger']); assert.strictEqual(g[2].n, 6); assert.strictEqual(g[2].wait.median, 270);
const pv = B.pivot(d.rows, 'res', 'army', 'cost', 'count'); assert.deepStrictEqual(pv.cols, ['ger', 'rus']); assert.deepStrictEqual(pv.cells, [[14, 13], [6, 0]]);
assert.ok(/^id,res,cost\r\nc0,mp,/.test(B.toCsv(d.rows, ['id', 'res', 'cost']))); assert.strictEqual(B.sortRows(d.rows, '-cost')[0].id, 'early');
ok('selection by any column, groups with statistics, pivot, sheet, order');

// ---- change plans
const mp = B.select(d.rows, B.parseWhere('res=mp id~^c[0-3]$'));
let p = B.planChange(mp, { field: 'cost', op: 'pct', value: 10 }); assert.strictEqual(p.rows.length, 4); assert.strictEqual(p.rows[0].new, Math.round(mp[0].cost * 1.1 / 5) * 5);
assert.throws(() => B.planChange(d.rows, { field: 'cost', op: 'pct', value: 10 }), /different resources \(mp, sp\)/);
p = B.planChange(B.select(d.rows, B.parseWhere('res=sp')), { field: 'cost', op: 'add', value: 1, step: 1 }); assert.strictEqual(p.rows.find(r => r.id === 'h1').new, 2);
p = B.planChange(d.rows, { field: 'cost', op: 'fit' }); assert.ok(p.skipped.some(s => s.id === 'h1' && /manpower/.test(s.why))); assert.ok(p.rows.some(r => r.id === 'dear' && r.new < 500));
p = B.planChange(mp, { field: 'wait', op: 'set', value: 30 }); assert.deepStrictEqual(p.rows.map(r => [r.field, r.new, r.waitOld, r.waitNew]), mp.map(() => ['fore', 0.75, 60, 30]));
p = B.planChange([row('h1')], { field: 'wait', op: 'set', value: 90 }); assert.strictEqual(p.rows[0].new, 0.5); assert.strictEqual(p.rows[0].waitNew, 90);
p = B.planChange([row('early')], { field: 'wait', op: 'set', value: 90 }); assert.ok(!p.rows.length && /no cooldown/.test(p.skipped[0].why));
p = B.planChange(mp, { field: 'charge', op: 'mul', value: 2 }); assert.strictEqual(p.rows[0].new, 240); assert.strictEqual(p.rows[0].waitNew, 120);
p = B.planChange(mp, { field: 'fore', op: 'set', value: 1 }); assert.strictEqual(p.rows[0].waitNew, 0);
p = B.planChange(mp, { field: 'armor', op: 'pct', value: 50 }); assert.strictEqual(p.rows[0].factor, 1.5); assert.strictEqual(p.rows[0].new, '15 12 9 8');
assert.throws(() => B.planChange(mp, { field: 'name', op: 'set', value: 1 }), /cannot be changed/); assert.throws(() => B.planChange(mp, { field: 'speed', op: 'fit' }), /price only/);
ok('change plans: percent, mixed resources refused, special points on their own, fit skips other resources, wait at start through fore, cooldown and fore show the new wait, armour factor');

// ---- CLI on the units fixture game
const { game, mod } = require('../../gui/ext/units/fixture').make(scratch);
const run = (...a) => require('../../lib/test/wait').spawnSync(process.execPath, [path.join(TOOLS, 'balance/balance.js'), game, '--tmp', path.join(scratch, 'tmp'), ...a], { encoding: 'utf8' }, 'balance test');
let r = run(); assert.strictEqual(r.status, 0, r.stderr); assert.ok(/unit\(s\) in the buy panel/.test(r.stdout) && /wait at start = cooldown x factor/.test(r.stdout), r.stdout);
r = run('--sheet', 'csv', '--cols', 'id,res,cost,charge,fore,wait', '--where', 'id=t34_3'); assert.ok(/t34_3,mp,450,120,0.5,60/.test(r.stdout), r.stdout + r.stderr);
r = run('--where', 'nosuch=1'); assert.strictEqual(r.status, 2);
r = run('--change', 'cost pct 10'); assert.strictEqual(r.status, 2); ok('cli: summary, sheet with the wait at start, bad filter, change without a mod folder refused');
r = run('--folder', mod, '--where', 'army=rus kind=vehicle', '--change', 'cost pct 10', '--plan'); assert.strictEqual(r.status, 0, r.stdout + r.stderr); assert.ok(/plan \(nothing written\): 2 change/.test(r.stdout), r.stdout);
assert.ok(!fs.existsSync(path.join(mod, 'resource')), 'plan wrote files');
r = run('--folder', mod, '--where', 'army=rus kind=vehicle', '--change', 'cost pct 10'); assert.strictEqual(r.status, 0, r.stdout + r.stderr);
let card = fs.readFileSync(path.join(mod, 'resource/set/multiplayer/units/vehicles_rus.set'), 'latin1'); assert.ok(/"t34_0"[^\n]*\{cost 385\}/.test(card) && /"t34_3"[^\n]*\{cost 495\}/.test(card) && /\r\n/.test(card), card);
r = run('--folder', mod, '--where', 'id=t34_3', '--change', 'wait set 30'); assert.strictEqual(r.status, 0, r.stdout + r.stderr); assert.ok(/wait at start 60 s -> 30 s/.test(r.stdout), r.stdout);
card = fs.readFileSync(path.join(mod, 'resource/set/multiplayer/units/vehicles_rus.set'), 'latin1'); assert.ok(/"t34_3"[^\n]*\{fore 0\.75\}/.test(card), card);
r = run('--folder', mod, '--sheet', 'csv', '--cols', 'id,src,cost,dcost,wait', '--where', 'id=t34_3'); assert.ok(/t34_3,mod,495,45,30/.test(r.stdout), r.stdout);
r = run('--folder', mod, '--html', path.join(scratch, 'r.html'), '-q'); assert.strictEqual(r.status, 0, r.stderr); const html = fs.readFileSync(path.join(scratch, 'r.html'), 'utf8'); assert.ok(/<svg/.test(html) && /Wait at start/.test(html));
ok('cli: plan writes nothing; price +10% and a 30 s wait at start land in the mod card (CRLF kept); the mod shows against the game; HTML report');
console.log('PASS balance (' + n + ')');
