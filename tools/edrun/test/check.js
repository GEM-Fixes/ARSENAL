// edrun seeded test: no game. mission text, log parsing, false-kill case, usage.
// Author: Imperator_Aug (ARSENAL, ia-3c9a0117)
const assert = require('assert'), fs = require('fs'), path = require('path');
const e = require('../edrun.js');
const fail = [];
const t = (name, f) => { try { f(); } catch (x) { fail.push(name + ': ' + x.message); } };

const pairs = [
  { name: 'tank', class: 'vehicle', shooter: 't34_0', crew: ['mp/rus/tankman', 'mp/rus/tankman', 'mp/rus/tankman', 'mp/rus/tankman'], foe: 'gaz67b', foeCrew: ['mp/ger/rifle'] },
  { name: 'gun', class: 'gun', shooter: 'zis2', crew: ['mp/rus/rifle', 'mp/rus/rifle', 'mp/rus/rifle'], foe: 'gaz67b', foeCrew: ['mp/ger/rifle'] },
  { name: 'inf', class: 'infantry', shooter: 'mp/rus/rifle', foe: 'mp/ger/rifle' },
];
const m = e.buildMission(pairs, 'rX', { speed: 'very_fast' });

t('matrix size and values', () => {
  const b = m.match(/\{diplomacy\n([\s\S]*?)\n\t\t\}/)[1].trim().split('\n').map(r => r.trim().split(/\s+/).map(Number));
  assert.strictEqual(b.length, 17);
  for (const r of b) assert.strictEqual(r.length, 17);
  for (let a = 0; a < 17; a++) for (let c = 0; c < 17; c++) {
    assert.strictEqual(b[a][c], b[c][a], 'symmetric');
    const want = a === c ? 2 : [[1, 2], [3, 4], [5, 6]].some(([s, f]) => (a === s && c === f) || (a === f && c === s)) ? 1 : 0;
    assert.strictEqual(b[a][c], want, `side ${a} to ${c}`);
  }
});
t('one Players block, count 17, base unit gone', () => {
  assert.strictEqual(m.match(/\{Players/g).length, 1);
  assert.ok(m.includes('{count 17}'));
  assert.ok(!m.includes('0xe2e0'), 'fixture gaz67b left in');
  assert.ok(!m.includes('pv_clk'), 'fixture triggers left in');
  assert.strictEqual((m.match(/map_point/g) || []).length > 0, true);
});
t('each pair on its own two sides', () => {
  const ent = [...m.matchAll(/\{(?:Entity|Human) "([^"]+)" (0x[0-9a-f]+)\n\t\t\{Position (-?[\d.]+) (-?[\d.]+)\}\n(?:\t\t\{xform zl -?[\d.]+\}\n)?\t\t\{Player (\d+)\}/g)];
  const tags = Object.fromEntries([...m.matchAll(/\{Tags "([^"]+)" (0x[0-9a-f]+)\}/g)].map(x => [x[2], x[1]]));
  const side = {};
  for (const x of ent) { const tag = tags[x[2]]; assert.ok(tag, 'untagged ' + x[1]); (side[tag] = side[tag] || new Set()).add(Number(x[5])); }
  assert.deepStrictEqual([...side.tank_s], [1]); assert.deepStrictEqual([...side.tank_c], [1]);
  assert.deepStrictEqual([...side.tank_f], [2]); assert.deepStrictEqual([...side.tank_fc], [2]);
  assert.deepStrictEqual([...side.gun_s], [3]); assert.deepStrictEqual([...side.gun_f], [4]);
  assert.deepStrictEqual([...side.inf_s], [5]); assert.deepStrictEqual([...side.inf_f], [6]);
  const ids = ent.map(x => x[2]); assert.strictEqual(new Set(ids).size, ids.length);
});
t('own space: no two pairs within 500', () => {
  const eight = [...Array(8).keys()].map(i => ({ name: 'p' + i, class: 'infantry', shooter: 'a/b', foe: 'c/d' }));
  const pos = [...e.entities(eight).matchAll(/Position (-?[\d.]+) (-?[\d.]+)\}\n(?:\t\t\{xform zl -?[\d.]+\}\n)?\t\t\{Player (\d+)/g)].map(x => ({ x: +x[1], y: +x[2], pair: Math.ceil(x[3] / 2) }));
  for (const a of pos) { assert.ok(Math.abs(a.x) <= 1800 && Math.abs(a.y) <= 1800, 'inside pather'); for (const b of pos) if (a.pair !== b.pair) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 500, `${a.pair}/${b.pair}`); }
});
t('pilot forms kept', () => {
  assert.ok(/\{"ed_boot" \{condition\} \{actions/.test(m), 'empty condition at start');
  assert.ok(!/1\.event/.test(m), 'no start event term');
  const ln = n => m.split('\n').find(l => l.includes(`{"${n}" `));
  assert.ok(/\{tag tank_f\} \{state moveable\}/.test(ln('p_tank')), 'vehicle order gated on foe moveable');
  assert.ok(/\{"2\.trigger" \{name "p_tank"\}\}/.test(ln('p_tank_k')), 'kill gated on the order');
  assert.ok(/\{select \{tag \{tag "tank_f"\}\}\} \{include \{destroyed_components \{masks "body"\}\}\}/.test(ln('p_tank_k')), 'vehicle kill default is a red hull');
  assert.ok(/\{tag inf_f\} \{state operatable\}/.test(ln('p_inf')), 'human gate');
  assert.ok(/\{tag inf_f\} \{state dead\}/.test(ln('p_inf_k')), 'human kill');
  assert.ok(/\{"game_speed" \{mode very_fast\}\}/.test(m), 'speed action');
  assert.ok(!e.buildMission(pairs, 'rX', { speed: 'normal' }).includes('game_speed'), 'normal adds nothing');
  assert.ok(e.buildMission(pairs, 'rX', { fog: 0 }).includes('{Fog 0}'), 'fog override');
  assert.ok(ln('p_inf').includes('{time 120}'), 'default order time');
  assert.ok(e.buildMission([{ ...pairs[2], orderTime: 5 }], 'rX', {}).includes('{time 5}'), 'orderTime');
  assert.ok(!e.buildMission([{ ...pairs[2], noorder: true }], 'rX', {}).includes('actor_fire'), 'noorder');
  assert.ok(/\{tag inf_f\}\} \{fire_mode hold\}/.test(m), 'foe holds by default');
  assert.ok(!/\{tag inf_f\}\} \{fire_mode hold\}/.test(e.buildMission([{ ...pairs[2], foeFire: true }], 'rX', {})), 'foeFire');
  const open = (m.match(/\{/g) || []).length, close = (m.match(/\}/g) || []).length;
  assert.strictEqual(open, close, 'braces balance');
});
t('ratio: Quant block, no game_speed, default unchanged', () => {
  const r = e.buildMission(pairs, 'rX', { speed: 'very_fast', ratio: 10 });
  assert.ok(r.startsWith('{mission\n\t{Quant {speed 0.1}}\n'), 'Quant first in the mission');
  assert.ok(!r.includes('game_speed'), 'action dropped: same requester would replace the block');
  assert.ok(/\{Quant \{speed 0\.5\}\}/.test(e.buildMission(pairs, 'rX', { ratio: 2 })), '2x');
  assert.ok(!m.includes('{Quant'), 'no ratio, no block');
  assert.strictEqual((r.match(/\{/g) || []).length, (r.match(/\}/g) || []).length, 'braces balance');
  assert.strictEqual(r.replace('\t{Quant {speed 0.1}}\n', '').replace(/\{"ed_boot" .*\n/, ''), m.replace(/\{"ed_boot" .*\n/, ''), 'rest of the mission identical');
});
t('validate refuses', () => {
  assert.ok(e.validate([]).length);
  assert.ok(e.validate([{ name: 'A b', class: 'gun' }]).length);
  assert.ok(e.validate([{ name: 'a', class: 'vehicle', shooter: 'x', foe: 'y', foeCrew: ['z'] }]).some(s => /needs crew/.test(s)), 'empty shooter');
  assert.ok(e.validate([{ name: 'a', class: 'vehicle', shooter: 'x', crew: ['c'], foe: 'y' }]).some(s => /false kill/.test(s)), 'empty foe');
  assert.ok(e.validate([{ name: 'a', class: 'infantry', shooter: 'x/y', foe: 'p/q', x: 2000 }]).some(s => /outside/.test(s)), 'off map');
  assert.deepStrictEqual(e.validate(pairs), []);
});
t('marks: other runs and other text ignored', () => {
  const log = 'EDRUN rOLD tank kill\r\nnoise\r\nEDRUN rX start\r\nEDRUN rX tank order\r\n[00:00:29] EDRUN rX tank kill\r\nEDRUN rX tank kill\r\n';
  assert.deepStrictEqual(e.parseMarks(log, 'rX'), ['start', 'tank order', 'tank kill']);
});
t('verdicts', () => {
  assert.strictEqual(e.verdictOf({ order: 5, kill: 9 }).verdict, 'PASS');
  assert.strictEqual(e.verdictOf({ kill: 1 }).verdict, 'FALSEKILL');
  assert.strictEqual(e.verdictOf({ order: 5, kill: 1 }).verdict, 'FALSEKILL');
  assert.strictEqual(e.verdictOf({}).verdict, 'NOORDER');
  assert.strictEqual(e.verdictOf({ order: 5 }).verdict, 'NOKILL');
  assert.strictEqual(e.verdictOf({ order: 5, shooterdied: 6, gone: 7 }).verdict, 'SHOOTERLOST');
  assert.strictEqual(e.verdictOf({ order: 5, gone: 7, kill: 9 }).verdict, 'SHOOTERLOST');
  const died = e.verdictOf({ order: 5, shooterdied: 6, kill: 9 });
  assert.strictEqual(died.verdict, 'PASS'); assert.strictEqual(died.shooterDied, true);
});
t('mark and never', () => {
  const v = { name: 'm', class: 'vehicle', shooter: 'a', crew: ['c'], foe: 'b', foeCrew: ['d'] };
  const plain = e.buildMission([v], 'rX', {});
  assert.strictEqual(e.buildMission([{ ...v, mark: undefined }], 'rX', {}), plain, 'no mark = unchanged');
  assert.ok(plain.includes('{destroyed_components {masks "body"}}'), 'default kill');
  const mk = e.buildMission([{ ...v, mark: 'not chassis_work' }], 'rX', {});
  assert.ok(mk.includes('{state "not chassis_work"}') && !mk.includes('{state "not moveable"}'), 'mark replaces kill');
  assert.ok(mk.includes('{state moveable}'), 'ready stays');
  assert.ok(e.buildMission([{ ...v, mark: 'inhabited' }], 'rX', {}).includes('{state inhabited}'), 'bare state');
  assert.deepStrictEqual(e.validate([{ ...v, mark: 'dead' }, { ...v, name: 'n', mark: 'not inhabited', never: true }]), []);
  const dc = e.buildMission([{ ...v, mark: 'destroyed_components' }], 'rX', {});
  assert.ok(dc.includes('{destroyed_components {masks "*"}}') && !dc.includes('{state "not moveable"}'), 'components term');
  assert.ok(dc.includes('{source advanced} {group {select {tag {tag ""}}} {include {destroyed_components {masks "*"}}}}'), 'components term needs the advanced selector');
  assert.ok(!dc.includes('{tag} {destroyed_components'), 'never inside a standard selector');
  assert.ok(e.buildMission([{ ...v, mark: 'broken_components:eng*' }], 'rX', {}).includes('{broken_components {masks "eng*"}}'), 'mask');
  assert.deepStrictEqual(e.validate([{ ...v, mark: 'broken_components:eng*' }]), []);
  assert.ok(e.validate([{ ...v, mark: 'broken' }]).some(s => /mark/.test(s)), 'unknown state');
  assert.ok(e.validate([{ ...v, never: true }]).some(s => /never needs/.test(s)), 'never without mark');
  assert.strictEqual(e.verdictOf({ order: 5 }, true).verdict, 'PASS', 'never: no mark passes');
  assert.strictEqual(e.verdictOf({ order: 5, kill: 9 }, true).verdict, 'MARKED', 'never: mark fails');
  assert.strictEqual(e.verdictOf({}, true).verdict, 'NOORDER');
  assert.strictEqual(e.verdictOf({ order: 5, gone: 7 }, true).verdict, 'SHOOTERLOST');
  assert.strictEqual(e.verdictOf({ kill: 1 }, true).verdict, 'FALSEKILL');
  assert.strictEqual(e.verdictOf({ order: 5 }).verdict, 'NOKILL', 'default unchanged');
});
t('move: order, waypoint, markers, moved mark', () => {
  const mv = [
    { name: 'mt', class: 'vehicle', shooter: 't34_0', crew: ['mp/rus/tankman'], move: { dy: 300 } },
    { name: 'mi', class: 'infantry', shooter: 'mp/rus/rifle', move: { x: 450, y: 800 } },
    { name: 'ms', class: 'infantry', shooter: 'mp/rus/rifle', foe: 'mp/ger/rifle', mark: 'moved', never: true },
  ];
  assert.deepStrictEqual(e.validate(mv), []);
  const x = e.buildMission(mv, 'rX', {}), ln = n => x.split('\n').find(l => l.includes(`{"${n}" `));
  // vehicle: offset from its start (cell 0: x -450, shooter y -900-200 = -1100), +300 along y
  assert.ok(x.includes('{"920" {position -450.00 -800.00 0} {radius 20}}'), 'offset goal waypoint');
  assert.ok(x.includes('{"921" {position 450.00 800.00 0} {radius 20}}'), 'absolute goal waypoint');
  assert.ok(!x.includes('{"922"'), 'no waypoint without a move');
  assert.ok(x.includes('{waypoint "900"}') || x.includes('{"900" {position'), 'base waypoints kept');
  assert.ok(/\{"actor_to_waypoint" \{selector \{tag mt_s\}\} \{drop orders\} \{waypoint "920"\}\}/.test(ln('p_mt')), 'order on the shooter entity, not the crew');
  assert.ok(!/actor_fire/.test(ln('p_mt')) && !/actor_fire/.test(ln('p_mi')), 'no fire order on a move pair');
  assert.ok(!/_f\b/.test(ln('p_mt')), 'no foe term on a foe-less pair');
  assert.ok(/\{state operatable\}/.test(ln('p_mt')) && /\{"1\.entities"/.test(ln('p_mt')), 'gate on the shooter alone');
  assert.ok(/EDRUN rX mt moved/.test(ln('p_mt_k')) && /EDRUN rX mt kill/.test(ln('p_mt_k')), 'moved line also ends the pair');
  assert.ok(/\{expression "1 & 2 & !3"\}/.test(ln('p_mt_k')) && /"3\.near" \{units \{tag mt_s\} \{state "not dead"\}\} \{near_to \{tag mt_m\}\}/.test(ln('p_mt_k')), 'moved = left the start marker');
  assert.ok(/near_to \{tag mt_a\}/.test(ln('p_mt_a')) && /mt arrived/.test(ln('p_mt_a')), 'arrived row');
  const tags = [...x.matchAll(/\{Tags "([^"]+)"/g)].map(m => m[1]);
  for (const g of ['mt_m', 'mt_a', 'mi_m', 'mi_a', 'ms_m']) assert.ok(tags.includes(g), 'marker ' + g);
  assert.ok(!tags.includes('ms_a') && !ln('p_ms_a'), 'no goal marker without a move');
  // the foe pair with mark moved and never but no move: still fires, the moved line is its kill
  assert.ok(/actor_fire/.test(ln('p_ms')) && !/actor_to_waypoint/.test(ln('p_ms')), 'no move order, still fires');
  assert.ok(/EDRUN rX ms moved/.test(ln('p_ms_k')), 'moved kill row');
  const side0 = [...x.matchAll(/\{Human "mp\/rus\/rifle" 0x[0-9a-f]+\n\t\t\{Position [^}]+\}\n\t\t\{Player 0\}/g)].length;
  assert.strictEqual(side0, 5, 'markers are neutral side 0');
  assert.strictEqual((x.match(/\{/g) || []).length, (x.match(/\}/g) || []).length, 'braces balance');
  // the verdict of a never pair: the mark never coming passes; coming fails
  assert.strictEqual(e.verdictOf({ order: 5 }, true).verdict, 'PASS');
  assert.strictEqual(e.verdictOf({ order: 5, kill: 9 }, true).verdict, 'MARKED');
  assert.strictEqual(e.verdictOf({ order: 5, kill: 9 }).verdict, 'PASS', 'move-only pair passes on moved');
  // refusals
  const base = { name: 'a', class: 'infantry', shooter: 'x/y' };
  assert.ok(e.validate([{ ...base, move: { x: 1, dx: 2 } }]).some(s => /move/.test(s)), 'abs and rel');
  assert.ok(e.validate([{ ...base, move: [1, 2] }]).some(s => /move/.test(s)), 'array');
  assert.ok(e.validate([{ ...base, move: { dy: 'a' } }]).some(s => /move/.test(s)), 'non-number');
  assert.ok(e.validate([base]).some(s => /foe/.test(s)), 'no foe and no move');
  assert.ok(e.validate([{ ...base, move: { dy: 5 }, mark: 'dead' }]).some(s => /moved/.test(s)), 'foe-less other mark');
  // pairs without move are untouched: same text with or without the field named but absent
  assert.strictEqual(e.buildMission(pairs, 'rX', {}), e.buildMission(pairs.map(p => ({ ...p, move: undefined })), 'rX', {}), 'no move = unchanged');
});
t('speed from clock', () => {
  assert.deepStrictEqual(e.speedOf({ 'clock 0': 10, 'clock 40': 22 }), { ratio: 3.33, wall: 12 });
  assert.deepStrictEqual(e.speedOf({ 'clock 0': 10, 'clock 20': 20 }), { ratio: 2, wall: 10 });
  assert.strictEqual(e.speedOf({}), null);
});
t('table', () => {
  const s = e.table([{ name: 'tank', class: 'vehicle', order: 1.5, kill: 3, shooterDied: false, verdict: 'PASS' }], '3.3x');
  assert.ok(/tank\s+vehicle\s+1\.5\s+3\.0\s+no\s+PASS/.test(s), s);
  assert.ok(s.includes('speed measured 3.3x'));
});
t('crash block as the game writes it', () => {
  const real = 'x\r\n***************** Exception *****************\r\nProgram will be terminated.\r\nEXCEPTION_ACCESS_VIOLATION read at 0x78\r\n\r\nAt as64_ed.exe+0x682d0b (+0x3ab) [q]\r\nRAX=0\r\n';
  const c = e.crashOf(real);
  assert.ok(c, 'real line seen');
  assert.ok(c.why.startsWith('EXCEPTION_ACCESS_VIOLATION'));
  assert.ok(c.at.includes(''));
  assert.strictEqual(e.crashOf('EDRUN r1 tank kill\r\nCaught Exception in lua\r\n'), null);
});
t('data error block: fault text not empty, last entity before it (MAPR-G r1 shape)', () => {
  const log = 'x\r\n/entity/-flora/waterrun/waterrun.def\r\n/entity/-vehicle/tank/pz4h/pz4h.def\r\n***************** Exception *****************\r\nBlock terminator expected! (, 459) @ [main_loop]\r\n------------------------------------------------------------------\r\n> file "/set/material.set"\r\n\r\n41:  {stage x}\r\n/entity/after/crash.def\r\n';
  const c = e.crashOf(log);
  assert.ok(c.why.startsWith('Block terminator expected!'), c.why);
  assert.strictEqual(c.at, '> file "/set/material.set"');
  const le = e.lastEntityOf(log);
  assert.strictEqual(le.name, 'pz4h', 'last entity before the Exception block, not after');
  assert.strictEqual(le.line, 3);
  assert.strictEqual(e.lastEntityOf('no entity here\r\n***************** Exception *****************\r\nEXCEPTION_ACCESS_VIOLATION\r\n'), null);
});
t('own window row reads or is absent, never throws', () => { const w = e.windowOf(process.pid); assert.ok(w === null || typeof w.title === 'string'); });
t('reorder and ammo (AMMO-1)', () => {
  const box = ['ammo bullet76 ap', 'ammo bullet76 fg', 'ammo bullet76 apcr'];
  const v = { name: 'ra', class: 'vehicle', shooter: 't34_0', crew: ['mp/rus/tankman'], foe: 'mp/ger/rifle', reorder: 10, ammo: 'fg', ammoBox: box };
  assert.deepStrictEqual(e.validate([v]), []);
  const mm = e.buildMission([v], 'rX', {}), ln = n => mm.split('\n').find(l => l.includes('{"' + n + '" '));
  assert.strictEqual((ln('p_ra').match(/"actor_fire"/g) || []).length, 41, 'order + 40 repeats');
  assert.strictEqual((ln('p_ra').match(/\{"delay" \{time 10\}\}/g) || []).length, 40, 'a delay before each repeat');
  const arm = ln('p_ra_arm');
  assert.ok(/\{item "ammo bullet76 ap"\}/.test(arm) && /\{item "ammo bullet76 apcr"\}/.test(arm) && !/\{item "ammo bullet76 fg"\}/.test(arm), 'others removed, wanted kept');
  assert.ok(/\{action remove\}/.test(arm));
  const old = e.buildMission([{ ...v, reorder: undefined, ammo: undefined, ammoBox: undefined }], 'rX', {});
  assert.strictEqual((old.match(/"actor_fire"/g) || []).length, 6, 'no field: order + 5 re-issues every ORDER_TIME (KILLPROOF: orders last the run)');
  assert.strictEqual((old.match(/{"delay" {time 120}}/g) || []).length, 5, 'KILLPROOF: re-issue delay = ORDER_TIME');
  assert.strictEqual(e.orderLifeOf({ ...v, reorder: undefined }), 720, 'KILLPROOF: order life covers the 700 tick marks');
  assert.ok(!old.includes('action remove'), 'no field: no remove');
  assert.ok(e.validate([{ ...v, reorder: 0 }]).some(s => /reorder/.test(s)), 'reorder 0');
  assert.ok(e.validate([{ ...v, noorder: true }]).some(s => /reorder/.test(s)), 'reorder with noorder');
  assert.ok(e.validate([{ ...v, ammoBox: undefined }]).some(s => /ammoBox/.test(s)), 'ammo without box');
  assert.ok(e.validate([{ ...v, ammo: 'he' }]).some(s => /no item/.test(s)), 'ammo not in box');
  assert.ok(e.validate([{ ...v, class: 'infantry' }]).some(s => /vehicle and gun/.test(s)), 'ammo on infantry');
});
const veh = (name, shooter, foe, x = {}) => ({ name, class: 'vehicle', shooter, crew: ['mp/rus/tankman', 'mp/rus/tankman2'], foe, foeCrew: ['mp/ger/rifle'], ...x });
t('entity numbers follow mission order', () => {
  const ids = e.entityIds([veh('a', 't34_0', 'gaz67b'), { name: 'i', class: 'infantry', shooter: 'mp/rus/rifle', count: 2, foe: 'mp/ger/rifle' }, veh('b', 'Pz3', 'gaz67b')]);
  assert.deepStrictEqual([ids[1].name, ids[1].role, ids[1].pair], ['t34_0', 's', 'a']);
  assert.deepStrictEqual([ids[4].name, ids[4].role], ['gaz67b', 'f']);
  assert.deepStrictEqual([ids[5].role, ids[5].human], ['fc', true]);
  assert.deepStrictEqual([ids[6].pair, ids[6].role, ids[6].name], ['i', 's', 'human']);
  assert.deepStrictEqual([ids[8].pair, ids[8].role], ['i', 'f']);
  assert.deepStrictEqual([ids[9].name, ids[9].pair], ['pz3', 'b'], 'name lowercased as a log compare key');
});
t('shots and hits from BLAST lines', () => {
  const two = [veh('a', 't34_0', 'gaz67b'), veh('b', 't34_0', 'gaz67b')];
  // shooter a is 1, its foe 4; shooter b is 6, its foe 9
  const log = [
    'blastwave [c4 = 0.2, r0 = 20, r1 = 30]', 'BLAST[0.2/1-1.5]: t34_0[1]/{gun} (0.2) 35->35', 'BLAST[0.2/1-1.5]: t34_0[1]/{gun} (0.2) 35->35',
    '[00:00:22] BLAST[0.2/1-1.5]: t34_0[1]/{gun} (0.2) 35->35',
    'BLAST[3/3-8]: gaz67b[4]/{engine} (3) 8.66667->0', 'BLAST[3/3-8]: gaz67b[4]/{body} (3) 8->0',
    'BLAST[3.5/4-5]: gaz67b[4]/{body} (3) 8->0', 'BLAST[3.5/4-5]: gaz67b[4]/{body} (3) 8->0',
    'BLAST[0.2/1-1.5]: gaz67b[4]/{body} (0.2) 8->8',                 // a muzzle blast on the foe is no hit
    'BLAST[1.2/4.4-7.48]: ds39{0x8008}/body (1) 0->0',               // base map object, no number
    'BLAST[3/3-8]: human[5:mp ger/rifle]/body (1) 0->0',             // foe's crew, not the foe
    "[00:00:22] UpdateComponentView(): bone 'fuel' has no broken view in gaz67b[9] (, 240) @ [quant]",
    "[00:00:24] UpdateComponentView(): bone 'fuel' has no broken view in gaz67b[9] (, 240) @ [quant]",
  ].join('\r\n');
  const r = e.shotsOf(log, two, true);
  assert.deepStrictEqual(r.bad, []);
  assert.strictEqual(r.rows.a.shots, 3); assert.strictEqual(r.rows.a.hits, 3);
  assert.deepStrictEqual(r.rows.a.hitKinds, { '3/3-8': 1, '3.5/4-5': 2 });
  assert.strictEqual(r.rows.b.shots, null, 'foe part broke with no muzzle line: a muzzle with no blast, like t34_1, not a real 0'); assert.strictEqual(r.rows.b.hits, 0);
  assert.deepStrictEqual(r.rows.b.parts, ['fuel'], 'parts once each, no cvar needed');
  assert.strictEqual(e.shotsOf('', two, true).rows.b.shots, 0, 'nothing on the foe and no muzzle line reads 0');
  const off = e.shotsOf(log, two, false);
  assert.strictEqual(off.rows.a.shots, null, 'no cvar, not measured'); assert.strictEqual(off.rows.a.hits, null);
  assert.deepStrictEqual(off.rows.b.parts, ['fuel']);
  const wrong = e.shotsOf('BLAST[0.2/1-1.5]: is2[1]/{gun} (0.2) 35->35', two, true);
  assert.strictEqual(wrong.rows.a.shots, null, 'number on the wrong name: not trusted'); assert.ok(wrong.bad.length);
  const inf = e.shotsOf('', [{ name: 'i', class: 'infantry', shooter: 'mp/rus/rifle', foe: 'mp/ger/rifle' }], true);
  assert.strictEqual(inf.rows.i.shots, null, 'rifles have no muzzle blast'); assert.strictEqual(inf.rows.i.hits, 0);
});
t('table shows shots, hits, parts only when known', () => {
  const s = e.table([{ name: 'tank', class: 'vehicle', order: 1.5, kill: null, shooterDied: false, verdict: 'NOKILL', shots: 9, hits: 0, parts: ['fuel'] }]);
  assert.ok(/NOKILL shots 9 hits 0 parts fuel/.test(s), s);
  assert.ok(!/shots/.test(e.table([{ name: 't', class: 'vehicle', order: 1, kill: 2, shooterDied: false, verdict: 'PASS', shots: null, hits: null, parts: [] }])));
});
t('watch row', () => {
  const v = veh('a', 't34_0', 'gaz67b', { watch: true });
  assert.deepStrictEqual(e.validate([v]), []);
  const mm = e.buildMission([v], 'rX', {});
  assert.ok(/"p_a_w".*\{broken_components \{masks "\*"\}\}.*a damaged/.test(mm), 'watch row, advanced selector');
  assert.ok(/"p_a_w".*\{source advanced\}/.test(mm));
  assert.strictEqual((mm.match(/\{/g) || []).length, (mm.match(/\}/g) || []).length, 'braces balance');
  assert.ok(!e.buildMission([veh('a', 't34_0', 'gaz67b')], 'rX', {}).includes('"p_a_w"'), 'no field, no row');
  assert.ok(e.validate([{ ...v, watch: 1 }]).some(s => /watch/.test(s)));
});
t('sx moves the shooter and crew, not the foe', () => {
  const pos = q => [...e.entities(q).matchAll(/\{(?:Entity|Human) "([^"]+)" 0x[0-9a-f]+\n\t\t\{Position (-?[\d.]+) (-?[\d.]+)\}/g)].map(x => [x[1], +x[2], +x[3]]);
  const a = pos([veh('a', 't34_0', 'gaz67b')]), b = pos([veh('a', 't34_0', 'gaz67b', { sx: 300 })]);
  assert.strictEqual(b[0][1], a[0][1] + 300, 'shooter'); assert.strictEqual(b[1][1], a[1][1] + 300, 'crew 1'); assert.strictEqual(b[2][1], a[2][1] + 300, 'crew 2');
  assert.deepStrictEqual(b[3], a[3], 'foe stays'); assert.deepStrictEqual(b[4], a[4], 'foe crew stays');
  assert.strictEqual(b[0][2], a[0][2], 'shooter y stays');
  assert.strictEqual(e.buildMission([veh('a', 't34_0', 'gaz67b', { sx: 0 })], 'rX', {}), e.buildMission([veh('a', 't34_0', 'gaz67b')], 'rX', {}), 'sx 0 = none');
  const inf = pos([{ name: 'i', class: 'infantry', shooter: 'mp/rus/rifle', count: 1, foe: 'mp/ger/rifle', sx: -100 }]);
  assert.strictEqual(inf[0][1], -550, 'infantry too');
  assert.deepStrictEqual(e.validate([veh('a', 't34_0', 'gaz67b', { sx: 300 })]), []);
  assert.ok(e.validate([veh('a', 't34_0', 'gaz67b', { sx: 'x' })]).some(s => /sx/.test(s)), 'non-number');
  assert.ok(e.validate([veh('a', 't34_0', 'gaz67b', { sx: 500 })]).some(s => /next pair/.test(s)), 'too far');
  assert.ok(e.validate([veh('a', 't34_0', 'gaz67b', { x: 1600, sx: 200 })]).some(s => /outside/.test(s)), 'off map');
  assert.ok(e.validate([{ name: 'm', class: 'infantry', shooter: 'a/b', move: { dy: 300 }, sx: 10 }]).some(s => /sx/.test(s)), 'with a move');
});
t('void only if every control missed', () => {
  const r = (n, v, c = true) => ({ name: n, verdict: v, control: c || undefined });
  assert.deepStrictEqual(e.controlsOf([r('ctl', 'NOKILL'), r('ctl2', 'PASS'), r('x', 'NOKILL', false)]), { controls: [{ name: 'ctl', verdict: 'NOKILL' }, { name: 'ctl2', verdict: 'PASS' }], void: false });
  assert.strictEqual(e.controlsOf([r('ctl', 'NOKILL'), r('ctl2', 'NOKILL')]).void, true);
  assert.deepStrictEqual(e.controlsOf([r('x', 'PASS', false)]), { controls: [], void: null }, 'no control marked: not judged');
});
// ---- EDRUN-2: distance defaults, rear, ground backup, isolate, preflight ----
const pos2 = q => [...e.entities(q).matchAll(/\{(?:Entity|Human) "([^"]+)" (0x[0-9a-f]+)\n\t\t\{Position (-?[\d.]+) (-?[\d.]+)\}(\n\t\t\{xform zl (-?[\d.]+)\})?/g)].map(x => ({ d: x[1], x: +x[3], y: +x[4], zl: x[6] === undefined ? null : +x[6] }));
t('distance defaults, dist still wins', () => {
  assert.deepStrictEqual(e.DIST, { vehicle: 300, gun: 300, infantry: 30 });
  const fp = c => ({ name: 'a', class: c, shooter: 'x/y', crew: ['c'], foe: 'f', foeCrew: ['d'], count: 1 });
  for (const [c, d] of [['vehicle', 300], ['gun', 300], ['infantry', 30]]) {
    const L = e.layout(fp(c), 0); assert.strictEqual(L.f.y - L.s.y, d, c);
  }
  assert.strictEqual(e.layout({ ...fp('vehicle'), dist: 400 }, 0).f.y - e.layout({ ...fp('vehicle'), dist: 400 }, 0).s.y, 400, 'explicit dist wins');
  // move pairs and no-foe pairs keep the old spacing, so their goal markers do not move
  assert.strictEqual(e.distOf({ class: 'vehicle', move: { dy: 1 }, foe: 'f' }), 400);
  assert.strictEqual(e.distOf({ class: 'infantry' }), 80);
  // entities: the old spacing of the first foe-fire layout is still dist/2 each way from the cell
  const p = pos2([fp('gun')]); assert.strictEqual(p[0].y, -900 - 150); assert.strictEqual(p[2].y, -900 + 150);
});
t('fire pairs hold both sides unless free', () => {
  const v = { name: 'h', class: 'vehicle', shooter: 't34_0', crew: ['c1', 'c2'], foe: 'gaz67b', foeCrew: ['d1'] };
  assert.ok(e.buildMission([v], 'rX', {}).includes('{move_mode hold}'), 'held by default');
  assert.ok(!e.buildMission([{ ...v, free: true }], 'rX', {}).includes('{move_mode hold}'), 'free keeps them moving');
  assert.ok(e.validate([{ ...v, free: 'yes' }]).some(s => /free must be/.test(s)), 'free is a boolean');
});
t('rear: shooter behind the foe on its heading, same heading', () => {
  const v = { name: 'r', class: 'vehicle', shooter: 't34_0', crew: ['c1', 'c2'], foe: 'gaz67b', foeCrew: ['d1'], rear: true };
  assert.deepStrictEqual(e.validate([v]), []);
  const L = e.layout(v, 0);
  assert.deepStrictEqual([L.s.x, L.s.y, L.f.x, L.f.y], [-450 - 300, -900, -450, -900], 'default heading 0 = +x: shooter at -x of the foe');
  const q = pos2([v]), mm = e.buildMission([v], 'rX', {});
  assert.deepStrictEqual([q[0].x, q[0].y, q[0].zl], [-750, -900, null], 'no heading line at the default');
  assert.ok(q[1].x < q[0].x && q[2].x < q[0].x, 'crew behind the shooter, away from the foe');
  assert.deepStrictEqual([q[3].x, q[3].y], [-450, -900], 'foe');
  assert.ok(q[4].x > q[3].x, 'foe crew in front of the foe, away from the shooter');
  assert.ok(!e.entities([v]).includes('xform'), 'default heading writes nothing');
  assert.strictEqual((mm.match(/\{/g) || []).length, (mm.match(/\}/g) || []).length, 'braces');
  const v90 = { ...v, face: 90, dist: 100 }, L9 = e.layout(v90, 0), q9 = pos2([v90]);
  assert.ok(Math.abs(L9.s.x - -450) < 1e-9 && Math.abs(L9.s.y - (-900 - 100)) < 1e-9, 'heading +y: shooter at -y of the foe');
  assert.deepStrictEqual([q9[0].zl, q9[3].zl], [90, 90], 'both carry {xform zl 90}');
  const inf = pos2([{ name: 'i', class: 'infantry', shooter: 'a/b', foe: 'c/d', rear: true, count: 3 }]);
  assert.strictEqual(inf.length, 4); assert.ok(inf[0].x < inf[3].x && inf[1].x < inf[3].x, 'infantry behind too');
  assert.ok(e.validate([{ ...v, move: { dy: 5 } }]).some(s => /rear/.test(s)), 'rear with a move');
  assert.ok(e.validate([{ ...v, face: 'x' }]).some(s => /face/.test(s)), 'bad face');
  assert.ok(e.validate([{ ...v, rear: undefined, face: 90 }]).some(s => /face/.test(s)), 'face without rear');
  assert.ok(e.validate([{ ...v, x: -1650 }]).some(s => /outside/.test(s)), 'rear shooter off the map');
  // a non-rear pair is byte-identical with the field named false
  assert.strictEqual(e.buildMission([{ ...v, rear: false }], 'rX', {}), e.buildMission([{ ...v, rear: undefined }], 'rX', {}));
});
t('ground backup: waiter, never-true gate, order on a waypoint beside the foe', () => {
  const v = veh('g', 't34_0', 'gaz67b', { ground: 20 });
  assert.deepStrictEqual(e.validate([v]), []);
  const mm = e.buildMission([v], 'rX', {}), ln = n => mm.split('\n').find(l => l.includes(`{"${n}" `));
  assert.ok(/\{"delay" \{time 20\}\} \{"trigger" \{name "p_g_gt"\} \{on 1\}\}/.test(ln('p_g_gw')), 'waiter delays then switches the gate on');
  assert.ok(/"1\.trigger" \{name "p_g"\}/.test(ln('p_g_gw')), 'waiter starts at the attack order');
  assert.ok(/p_g_never/.test(ln('p_g_gt')), 'gate cannot fire by itself');
  assert.ok(/\{expression "1 & !2 & !3"\}/.test(ln('p_g_gr')) && /name "p_g_k"/.test(ln('p_g_gr')) && /name "p_g_w"/.test(ln('p_g_gr')), 'not killed, not damaged');
  assert.ok(/\{"actor_fire" \{selector \{tag g_s\}\} \{drop orders\} \{attack position\} \{waypoint "940"\}\}/.test(ln('p_g_gr')), 'ground order on the shooter entity, queue dropped (REVHARNESS)');
  assert.ok(/\{"actor_fire" \{selector \{tag g_s\}\} \{attack position\} \{waypoint "940"\} \{only_weapon \{use 1\}\}\}/.test(ln('p_g_gr')), 'direct weapon aim as well (REVHARNESS)');
  assert.ok(ln('p_g_w'), 'damage watch row is added');
  assert.ok(/\{"940" \{position -442\.00 -750\.00 0\} \{radius 20\}\}/.test(mm), 'REPROOF-4: no {offset} by default, the installed exe rejects it');
  const mmo = e.buildMission([v], 'rX', { wpOffset: true });
  assert.ok(/\{"940" \{position -442\.00 -750\.00 0\} \{radius 20\} \{offset 20\}\}/.test(mmo), '--wp-offset: waypoint 8 units beside, 20 up the foe: ' + (mm.match(/\{"940"[^\n]*/) || [''])[0]);
  assert.strictEqual((ln('p_g').match(/"actor_fire"/g) || []).length, 6, 'attack order unchanged (order + 5 KILLPROOF re-issues)');
  assert.strictEqual((mm.match(/\{/g) || []).length, (mm.match(/\}/g) || []).length, 'braces');
  const plain = e.buildMission([veh('g', 't34_0', 'gaz67b')], 'rX', {});
  assert.ok(!/_gw|_gr|"940"/.test(plain), 'no field, no rows');
  assert.ok(e.validate([{ ...v, ground: 0 }]).some(s => /ground/.test(s)), 'ground 0');
  assert.ok(e.validate([{ ...v, reorder: 10 }]).some(s => /reorder/.test(s)), 'with reorder');
  assert.ok(e.validate([{ ...v, noorder: true }]).some(s => /ground/.test(s)), 'with noorder');
});
t('isolate: sx past 440 only with the flag, inside the map', () => {
  const v = veh('m', 't34_0', 'gaz67b', { sx: 800 });
  assert.ok(e.validate([v]).some(s => /isolate/.test(s)), 'refused without the flag');
  assert.deepStrictEqual(e.validate([{ ...v, isolate: true }]), []);
  assert.ok(e.validate([{ ...v, isolate: true, sx: 2200 }]).some(s => /outside/.test(s)), 'map edge still holds: -450 + 2200 = 1750');
  assert.ok(e.validate([{ ...v, isolate: true, x: 900, sx: 900 }]).some(s => /outside/.test(s)), 'past +-1700');
  assert.ok(e.validate([veh('m', 't34_0', 'gaz67b', { isolate: 1 })]).some(s => /isolate/.test(s)), 'not a boolean');
});
t('preflight: range, line, isolate, unknown data warns', () => {
  const pf = require('../preflight');
  const mk = (n, x, y, o = {}) => veh(n, 't34_0', 'gaz67b', { x, y, ...o });
  const rangeOf = d => d === 't34_0' ? { weapon: '76mm_f34', aim: 4.5, max: 6.5 } : { unknown: 'def not in the index' };
  // range in metres: aim 4.5 m = 90 units, max 6.5 m = 130 units. inside aim range: OK
  let r = pf.check([mk('a', -450, -900, { dist: 80 })], e.layout, { rangeOf });
  assert.strictEqual(r.a.status, 'OK'); assert.strictEqual(r.a.dist, 80);
  assert.ok(r.a.warns.some(w => /line: no terrain data/.test(w)), 'the line check says what it did not check');
  // between aim and max: OK with a warning; over max: OUTOFRANGE
  r = pf.check([mk('a', -450, -900, { dist: 110 })], e.layout, { rangeOf });
  assert.strictEqual(r.a.status, 'OK'); assert.ok(r.a.warns.some(w => /over aim range 4.5 m/.test(w)));
  r = pf.check([mk('a', -450, -900, { dist: 140 })], e.layout, { rangeOf });
  assert.strictEqual(r.a.status, 'OUTOFRANGE'); assert.ok(/over max range 6.5 m/.test(r.a.notes[0]));
  // VOL-nH: range is metres, dist units (x20): 300 units = 15 m is far inside a 190 m gun
  r = pf.check([mk('a', -450, -900, { dist: 300 })], e.layout, { rangeOf: () => ({ weapon: 'g', aim: 190, max: 190 }) });
  assert.strictEqual(r.a.status, 'OK'); assert.ok(!r.a.warns.some(w => /over aim/.test(w)));
  // unknown range: a warning, not a silent pass
  r = pf.check([{ ...mk('a', -450, -900, { dist: 140 }), shooter: 'zzz' }], e.layout, { rangeOf });
  assert.strictEqual(r.a.status, 'OK'); assert.ok(r.a.warns.some(w => /range unknown: def not in the index/.test(w)));
  r = pf.check([mk('a', -450, -900, { dist: 140 })], e.layout, {});
  assert.ok(r.a.warns.some(w => /range not checked/.test(w)), 'no reader = warning');
  assert.ok(pf.check([{ name: 'i', class: 'infantry', shooter: 'a/b', foe: 'c/d' }], e.layout, { rangeOf }).i.warns.some(w => /infantry/.test(w)), 'infantry weapon not read');
  // clear line: another pair's unit on the segment blocks; a unit 100 m off does not
  const blk = pf.check([mk('a', -450, -900, { dist: 100 }), mk('b', -450, -900 - 50 + 100, { dist: 100 })], (p, i) => e.layout(p, 0), { rangeOf });
  assert.strictEqual(blk.a.status, 'BLOCKED'); assert.ok(/b\/s|b\/f/.test(blk.a.notes[0]));
  const off = pf.check([mk('a', -450, -900, { dist: 100 }), mk('b', -300, -900, { dist: 100 })], (p, i) => e.layout(p, 0), { rangeOf });
  assert.strictEqual(off.a.status, 'OK');
  // isolate: another placement within 300 of the shooter or foe -> CROWDED, 900 apart cells -> OK
  const two = [mk('a', -450, -900, { dist: 100, isolate: true }), mk('b', 450, -900, { dist: 100 })];
  assert.strictEqual(pf.check(two, e.layout, { rangeOf }).a.status, 'OK');
  const near = [mk('a', -450, -900, { dist: 100, isolate: true }), mk('b', -250, -900, { dist: 100 })];
  assert.strictEqual(pf.check(near, e.layout, { rangeOf }).a.status, 'CROWDED');
  // edrun.preflightChunk holds the failed pair and re-checks the rest
  const ch = e.preflightChunk([mk('a', -450, -900, { dist: 140 }), mk('b', 450, -900, { dist: 60 })], { rangeOf });
  assert.deepStrictEqual(ch.run.map(p => p.name), ['b']); assert.deepStrictEqual(ch.held.map(h => [h.p.name, h.r.status]), [['a', 'OUTOFRANGE']]);
  // a fire pair with no dist takes its gun's minimum x preflight.MARGINAL (1.25 since SILENT-1F), floored; set dist, control, unknown min and no reader keep their old distance (TST-100)
  const minOf = s => s === 'nomin' ? { unknown: 'x' } : { min: s === 'low' ? 10 : 200, by: 'test', reach: 1, ground: 1, D: 1 };
  const af = (x, o) => e.preflightChunk([mk('a', -450, -900, { dist: undefined, ...x })], o).run[0];
  const wide = () => ({ weapon: 'w', aim: 900, max: 900 });
  assert.strictEqual(af({ shooter: 'gun' }, { minOf, rangeOf: wide }).dist, 250);
  assert.strictEqual(af({ shooter: 'gun' }, { minOf, rangeOf: wide }).distAuto, true);
  assert.strictEqual(af({ shooter: 'low' }, { minOf, rangeOf: wide }).dist, 120);
  assert.strictEqual(af({ shooter: 'nomin' }, { minOf, rangeOf: wide }).dist, undefined);
  assert.strictEqual(af({ shooter: 'gun', control: true }, { minOf, rangeOf: wide }).dist, undefined);
  assert.strictEqual(af({ shooter: 'gun', dist: 333 }, { minOf, rangeOf: wide }).dist, 333);
  assert.strictEqual(af({ shooter: 'gun' }, { rangeOf: wide }).dist, undefined);
  // no-foe pairs are not checked
  assert.strictEqual(pf.check([{ name: 'm', class: 'vehicle', shooter: 't34_0', crew: ['c'], move: { dy: 5 } }], e.layout, { rangeOf }).m.status, 'OK');
});
t('preflight: real weapon range of pz6bh (skipped when the game is not installed)', () => {
  const G = require('../../lib/gamedir').resolve().dir;
  if (!G || !fs.existsSync(path.join(G, 'resource'))) return;
  const w = require('../preflight').makeRangeReader(G, ['as64+'])('pz6bh');
  assert.ok(w.unknown || (w.aim > 0 && w.weapon), JSON.stringify(w));
});
if (!fs.existsSync(path.join(e.FIX, 'combat.mi'))) fail.push('base map gone (prove1 pv_tiny or the generated one): ' + e.FIX);
// VOL-N150: stale restore. snapshot holding our own entry is cleaned once; GAME_RUNNING from another instance's game restores with --no-proc
t('stale restore: own entry cleared, other instance game does not block', () => {
  const os = require('os'), d = fs.mkdtempSync(path.join(os.tmpdir(), 'edrun-stale-')), P = path.join(d, 'options.set'), S = P + '.edrun', M = e.MOD;
  const list = extra => `{options\r\n\t{mods\r\n\t\t"as64+:0"\r\n\t\t"vol3_t:0"${extra}\r\n\t}\r\n}\r\n`;
  const dirty = list(`\r\n\t\t"${M}:0"`), clean = list('');
  const calls = [], spawn = seq => (exe, args) => { calls.push(args.slice(-4).join(' ')); const r = seq[Math.min(calls.length - 1, seq.length - 1)]; if (r.status === 0) fs.copyFileSync(S, P); return r; };
  const busy = { status: 1, stdout: 'ERROR GAME_RUNNING as64_ed.exe: game rewrites options.set; close it first', stderr: '' }, ok = { status: 0, stdout: '', stderr: '' };
  fs.writeFileSync(P, dirty, 'latin1'); fs.writeFileSync(S, dirty, 'latin1');
  e.markGameEnd(0);
  assert.strictEqual(e.staleRestore('G', P, S, { spawn: spawn([busy, ok]), own: () => 'no' }), null, 'restored');
  assert.strictEqual(fs.readFileSync(S, 'latin1'), clean, 'snapshot cleaned, other bytes kept');
  assert.strictEqual(fs.readFileSync(P, 'latin1'), clean, 'live list clean');
  assert.ok(/--no-proc/.test(calls[1]) && calls.length === 2, 'second call skips the global check');
  calls.length = 0;
  assert.strictEqual(e.staleRestore('G', P, S, { spawn: spawn([busy]), own: () => 'no' }), null, 'clean list: no stale path');
  assert.strictEqual(calls.length, 0, 'no modswitch call once clean');
  fs.writeFileSync(P, dirty, 'latin1');
  assert.ok(/stale restore failed/.test(e.staleRestore('G', P, S, { spawn: spawn([busy]), own: () => 'yes' })), 'own instance running: fails');
  assert.strictEqual(calls.length, 1, 'no --no-proc when our instance runs');
  calls.length = 0;
  assert.ok(e.staleRestore('G', P, S, { spawn: spawn([busy]), own: () => 'unknown' }), 'unknown: fails');
  fs.rmSync(d, { recursive: true });
});

if (fail.length) { console.error(fail.join('\n')); process.exit(1); }
console.log('check ok');

// useStackCache: each stack keeps its own cache, nothing is lost, repeat run does nothing
{
  const os = require('os'), d = fs.mkdtempSync(path.join(os.tmpdir(), 'edrun-cache-'));
  const live = path.join(d, 'shader_cache');
  fs.mkdirSync(live); fs.writeFileSync(path.join(live, 'old'), 'o');
  const a = e.useStackCache(d, ['as64+']);
  assert(a.swapped && !fs.existsSync(live), 'unknown cache moved aside');
  assert(fs.readdirSync(d).some(n => n.startsWith('shader_cache.unknown-')), 'unknown cache kept');
  fs.mkdirSync(live); fs.writeFileSync(path.join(live, 'a'), 'a');
  assert(!e.useStackCache(d, ['as64+']).swapped && fs.existsSync(path.join(live, 'a')), 'same stack keeps its cache');
  const b = e.useStackCache(d, ['as64+', 't']);
  assert(b.key !== a.key && !fs.existsSync(path.join(live, 'a')), 'other stack starts clean');
  fs.mkdirSync(live); fs.writeFileSync(path.join(live, 'b'), 'b');
  e.useStackCache(d, ['AS64+']);
  assert(fs.existsSync(path.join(live, 'a')), 'first stack gets its cache back, case ignored');
  assert(fs.existsSync(path.join(d, 'shader_cache.stack-' + b.key, 'b')), 'second stack kept');
  // --fresh-cache: the live cache of this stack moves aside, kept, none live after
  const f = e.useStackCache(d, ['as64+'], { fresh: true });
  assert(f.fresh && f.key === a.key && !fs.existsSync(live), 'fresh: no live cache');
  assert(fs.readdirSync(d).some(n => n.startsWith('shader_cache.fresh-') && fs.existsSync(path.join(d, n, 'a'))), 'fresh: old cache kept aside');
  assert(!e.useStackCache(d, ['as64+']).swapped, 'fresh leaves the stack the owner');
  fs.rmSync(d, { recursive: true });
}
console.log('useStackCache ok');
