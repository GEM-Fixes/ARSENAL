// armorsim blast.js (+ the shell's own burst in after.js) on a synthetic game tree (built here in a temp dir; no game data).
//   node blast.test.js [scratchDir]      last line PASS on success
// Author: Imperator_Aug (ARSENAL, ia-9099bb2b)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const sim = require('../sim'), after = require('../after'), blast = require('../blast');

let n = 0, fails = 0;
function ok(name, cond, info) { n++; if (!cond) { fails++; console.log('FAIL ' + name + (info !== undefined ? ': ' + JSON.stringify(info) : '')); } }
const eq = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), { got, want });
const near = (name, got, want, tol = 0.01) => ok(name, Math.abs(got - want) <= tol, { got, want });

const base = process.argv[2] || process.env.ARMORSIM_SCRATCH || os.tmpdir();
fs.mkdirSync(base, { recursive: true });
const dir = fs.mkdtempSync(path.join(base, 'armorsim-blast-'));
const game = path.join(dir, 'game');
const W = (root, rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(text.replace(/\r?\n/g, '\r\n'), 'latin1')); };
W(game, 'mowas_2.exe', 'MZ');
W(game, 'resource/entity/vehicle/bx/bx.def', `{game_entity
	{props "steel tank"}
	{component "body"}
	{component "engine"}
	{component "skirts"}
	{component "ammo"}
	{volume "body" {thickness 30}}
	{volume "engine" {thickness 5}}
	{volume "skirtl" {thickness 5} {component "skirts"}}
	{volume "skirtr" {thickness 5} {component "skirts"}}
	{volume "ammo" {thickness 200}}
	{volume "far" {thickness 5} {able {blast 0}}}
	{Extension "bx.mdl"}
}
`);
// body x -50..50, y -30..30, z 0..40; engine x -40..-20 inside; ammo x 15..25 inside; skirts y 32..36 and -36..-32; far 20 m off
W(game, 'resource/entity/vehicle/bx/bx.mdl', `{Skeleton
	{bone "basis"
		{bone "body"}
	}
}
{Volume "body" {Box 100 60 40} {Bone "body"} {Position 0 0 20}}
{Volume "engine" {Box 20 40 20} {Bone "body"} {Position -30 0 20}}
{Volume "ammo" {Box 10 20 20} {Bone "body"} {Position 20 0 20}}
{Volume "skirtl" {Box 100 4 20} {Bone "body"} {Position 0 34 20}}
{Volume "skirtr" {Box 100 4 20} {Bone "body"} {Position 0 -34 20}}
{Volume "far" {Box 10 10 10} {Bone "body"} {Position 400 0 20}}
`);
W(game, 'resource/set/material.set', `{materials
	{"steel"
		{ricochet {chance {0 0}}}
		{steelEquivalent 1}
		{durability {pierce 1} {blast 1}}
		{damage {radius 0.5}}
		{wound {calibre 20}}
	}
}
`);

const ctx = sim.open('bx', { game, mods: [] });
ok('open', !ctx.error, ctx.error);
if (ctx.error) { console.log('FAIL'); process.exit(1); }

// ---------- the filling ----------
const he = { weapon: 'test', ammo: 'he', calibre: 75, table: [[0, 10], [5000, 10]], tags: ['shell_medium', 'fg'], noRicochet: true,
  damage: [{ type: 'blastwave', energy: 2, area: [0.5, 4] }, { type: 'cumulative', distance: 1, damage: 50 }] };
eq('ofShell: c4, r1, r0 from {Damage blastwave {energy} {area r0 r1}}', (({ energy, radius, inner }) => ({ energy, radius, inner }))(blast.ofShell(he)), { energy: 2, radius: 4, inner: 0.5 });
eq('ofShell: no blastwave = null', blast.ofShell({ damage: [{ type: 'cumulative' }] }), null);
eq('ofShell: Damage Add keeps both', blast.ofShell({ damage: [{ type: 'blastwave', energy: 1, area: [0, 1] }, { type: 'blastwave', energy: 3, area: [1, 2] }] }).all.length, 2);

// ---------- energy fall-off, out of radius, once per part, blast_hit once ----------
let st = after.newState(ctx), seen = [];
let R = blast.apply(ctx, st, { point: [-80, 5, 20], energy: 2, radius: 4, inner: 0.5, source: 'shell' }, { fire: (ev, c) => seen.push(ev + ':' + (c.volume || '-') + ':' + (c.part || '-') + ':' + (c.sender || '-')) });
eq('hits in arrival order', R.hits.map(h => h.volume + ' ' + h.result), ['body held', 'skirtl pierced']);
near('energy at 30 units, linear between r0 10 and r1 80 units', R.hits[0].energy, (30 - 80) * 2 / (10 - 80));
near('energy at the skirt\'s nearest point (40.36 units)', R.hits[1].energy, (Math.hypot(30, 27) - 80) * 2 / (10 - 80));
ok('volume past r1 untouched', !R.hits.some(h => h.volume === 'far' || h.volume === 'skirtr' && h.result !== 'held'), R.hits);
ok('engine behind the holding hull plate not reached', !R.hits.some(h => h.volume === 'engine'), R.hits);
ok('second volume of the same part skipped', R.skipped.some(s => s.volume === 'skirtr' && /already hit/.test(s.why)), R.skipped);
ok('blast able 0 in the def: skipped with the reason', R.skipped.some(s => s.volume === 'far' && /blast 0/.test(s.why)), R.skipped);
eq('events: blast_hit once, blast per hit, break_armor sender blast, then break', seen,
  ['blast_hit:body:body:-', 'blast:body:body:-', 'blast:skirtl:skirts:-', 'break_armor:skirtl:skirts:blast', 'break:skirtl:skirts:blast']);
near('blast value = energy at the target (charge units)', R.events[0].value, 1.43);
eq('part broken by the blast, wound kept', [st.parts.get('skirts').damage, st.wounds.map(w => w.volume + ':' + w.damage)], [1, ['skirtl:1']]);
near('hit delay = distance / 15 m/s', R.hits[0].delay, 30 / 20 / 15, 0.001);

// ---------- wound then break by wear; inside r0 = full charge ----------
st = after.newState(ctx);
R = blast.apply(ctx, st, { point: [-80, 5, 20], energy: 5, radius: [2, 4], source: 'script' }, {});
eq('inside r0: full charge', R.hits[0].energy, 5);
eq('5 x E = 25 >= threshold 20 (2/3 of 30), damage 25/30 under 1: damaged', [R.hits[0].result, R.hits[0].threshold, R.hits[0].armorDamage], ['damaged', 20, 0.833]);
eq('body wound kept, part intact', [st.wounds.find(w => w.volume === 'body').damage.toFixed(3), st.parts.get('body').damage], ['0.833', 0]);
R = blast.apply(ctx, st, { point: [-80, 5, 20], energy: 5, radius: [2, 4], source: 'script' }, {});
ok('second blast at the worn spot breaks the hull', R.hits[0].result === 'pierced' && st.parts.get('body').damage === 1 && R.events.some(e => e.event === 'break_armor' && e.sender === 'blast'), R);
R = blast.apply(ctx, st, { point: [-80, 5, 20], energy: 5, radius: [2, 4], source: 'script' }, {});
ok('third: break_armor_again, no second part change', R.events.some(e => e.event === 'break_armor_again') && !R.events.some(e => e.event === 'part broken' && e.part === 'body'), R.events);

// ---------- a thick plate holds; friendly blast ----------
st = after.newState(ctx);
R = blast.apply(ctx, st, { point: [20, 0, 20], energy: 20, radius: 0.5, inner: 0.5 }, {});
const ammo = R.hits.find(h => h.volume === 'ammo');
ok('200 mm volume holds a 20 c4 blast at its face', ammo && ammo.result === 'held' && st.parts.get('ammo').damage === 0, R.hits);
st = after.newState(ctx);
R = blast.apply(ctx, st, { point: [-80, 5, 20], energy: 5, radius: [2, 4] }, { harmful: false });
ok('friendly blast: events, no wound, no break', R.events.some(e => e.event === 'blast') && !st.wounds.length && [...st.parts.values()].every(p => !p.damage), R);

// a blast_hit script turns the skirt's blast able off before the front reaches it
st = after.newState(ctx);
R = blast.apply(ctx, st, { point: [-80, 5, 20], energy: 2, radius: 4, inner: 0.5 }, { fire: ev => { if (ev === 'blast_hit') st.volOff.set('skirtl', new Set(['blast'])); } });
ok('able turned off by a handler: skipped at arrival', !R.hits.some(h => h.volume === 'skirtl') && R.skipped.some(s => s.volume === 'skirtl' && /before the front/.test(s.why)), R);

// ---------- the shell's own burst: on the plate vs inside ----------
const front = sim.rayFrom(ctx, 0, 0, [0, 0, 20]);
st = after.newState(ctx);
let r = after.run(ctx, he, 100, front, st, {});
ok('fails on the hull: bursts outside, 0.3 units before the face', r.end.result === 'no_penetration' && r.blast && Math.abs(r.end.burst[0] - 50.3) < 1e-6, r.end);   // front = +X: face at x 50
ok('burst on the plate: hull hit, engine inside not reached', r.blast.hits.some(h => h.volume === 'body') && !r.blast.hits.some(h => h.volume === 'engine'), r.blast.hits);
ok('blast events appended to the shot events', r.events.some(e => e.event === 'blast_hit' && e.blast), r.events);
ok('no "not applied" note', !r.notes.some(x => /not applied/.test(x)), r.notes);
// the shell passes the rear plate (shot from behind: x- to x+) and the engine, the ammo volume stops it: the burst is inside the hull
const ap = Object.assign({}, he, { table: [[0, 100], [5000, 100]] });
const rear = sim.rayFrom(ctx, 180, 0, [0, 0, 20]);
st = after.newState(ctx);
r = after.run(ctx, ap, 100, rear, st, {});
ok('passes the hull, stops on the 200 mm ammo volume', r.end.result === 'no_penetration' && r.end.volume === 'ammo', r.end);
ok('burst inside: the hull is hit from inside, the engine is reached', r.blast && r.blast.hits.some(h => h.volume === 'body') && r.blast.hits.some(h => h.volume === 'engine'), r.blast && r.blast.hits);
// a shell that passes everything flies on: no blast
st = after.newState(ctx);
const big = Object.assign({}, he, { table: [[0, 1000], [5000, 1000]] });
r = after.run(ctx, big, 100, front, st, {});
eq('passed: no burst on this unit', [r.end.result, r.blast], ['passed', null]);

// ---------- hooks.trigger groups the causes ----------
st = after.newState(ctx);
const stack = [], trig = [], fired = [];
let id = 0;
const hooks = {
  trigger: (kind, info, fn) => { const t = { id: ++id, kind, event: info.event, parent: stack.length ? stack[stack.length - 1].id : null }; trig.push(t); stack.push(t); try { fn(); } finally { stack.pop(); } },
  fire: (ev) => fired.push(ev + '@' + (stack.length ? stack[stack.length - 1].kind + ':' + stack[stack.length - 1].event : 'none')),
};
r = after.run(ctx, he, 100, front, st, hooks);
ok('every hook call ran inside a trigger', fired.length > 0 && fired.every(f => !/@none$/.test(f)), fired);
ok('bullet_hit in a shell trigger, blast events in the blast trigger', fired[0] === 'bullet_hit@shell:bullet_hit' && fired.includes('blast_hit@blast:blast'), fired);
const bt = trig.find(t => t.kind === 'blast' && t.event === 'blast'), ba = trig.find(t => t.event === 'break_armor' && t.kind === 'blast'), pb = trig.find(t => t.kind === 'part');
ok('blast break_armor nested in the blast, the part change nested in break_armor', bt && ba && pb && ba.parent === bt.id && pb.parent === ba.id, trig);

// ---------- the cumulative jet of the filling (RULES 44) ----------
const heat = { weapon: 'test', ammo: 'heat', calibre: 75, table: [[0, 10], [5000, 10]], tags: ['shell_heat'], noRicochet: true,
  damage: [{ type: 'cumulative', distance: 1, damage: 50 }] };
st = after.newState(ctx);
const jf = [];
r = after.run(ctx, heat, 100, front, st, { fire: (ev, c) => jf.push(ev + ':' + c.volume + ':' + [...c.source.tags].join(',')) });
ok('jet: the shell fails on the hull, a jet is flown from the burst point', r.end.result === 'no_penetration' && r.jet && r.jet.length === 1, r);
const J = r.jet && r.jet[0];
ok('jet pierces the 30 mm hull with 50', J && J.plates[0].volume === 'body' && J.plates[0].result === 'penetrate', J && J.plates);
ok('jet reach 1 m: the ammo volume 1.27 m on is not reached', J && !J.plates.some(p => p.volume === 'ammo'), J && J.plates);
ok('jet events carry jet: true and the cumulative_charge stuff', r.events.some(e => e.jet && e.event === 'bullet_hit') && jf.includes('bullet_hit:body:cumulative_charge'), { ev: r.events, jf });
eq('jet blast field null (no blastwave in the filling)', [r.blast, r.fire], [null, null]);
st = after.newState(ctx);
r = after.run(ctx, Object.assign({}, heat, { damage: [{ type: 'cumulative', distance: 2, damage: 50 }] }), 100, front, st, {});
ok('jet reach 2 m: the ammo volume is reached', r.jet[0].plates.some(p => p.volume === 'ammo'), r.jet[0].plates);
st = after.newState(ctx);
r = after.run(ctx, big, 100, front, st, {});
eq('a shell that passes flies on: no jet', r.jet, null);
ok('crew note on both results', /engine itself hurts no crew/.test(r.crewNote) && /RULES 43/.test(blast.apply(ctx, after.newState(ctx), { point: [0, 0, 100], energy: 1, radius: 1 }).crewNote));

// ---------- fire of the filling (RULES 45) ----------
st = after.newState(ctx);
const ff = [];
let F = blast.fireOn(ctx, st, { point: [-60, 0, 20], radius: 1, heating: 1, time: 3, inflammation: 2 }, { fire: (ev, c) => ff.push(ev + ':' + (c.volume || '-')) });
ok('fire 10 units off the hull, 1 m radius: reaches', F.reaches && F.distance === 0.5, F);
eq('ignites after inflammation / heating = 2 s', F.igniteAt, 2);
eq('burn, then burn_volume for each volume the sphere meets (engine 20 units off: on the rim; skirts 33.5: out)', ff, ['burn:-', 'burn_volume:body', 'burn_volume:engine']);
F = blast.fireOn(ctx, after.newState(ctx), { point: [-60, 0, 20], radius: 1, heating: 1, time: 1, inflammation: 2 }, {});
ok('too short a fire: no ignition, no event', F.igniteAt === null && !F.events.length && /no fire/.test(F.notes.join()), F);
F = blast.fireOn(ctx, after.newState(ctx), { point: [-60, 0, 20], radius: 1, heating: 1, time: 3, inflammation: 2, ally: true }, {});
eq('ally fire: 0.2 heat, 10 s needed', F.igniteAt, null);
F = blast.fireOn(ctx, after.newState(ctx), { point: [-200, 0, 20], radius: 1, heating: 1, time: 3, inflammation: 2 }, {});
ok('fire out of reach', !F.reaches && !F.events.length, F);
F = blast.fireOn(ctx, after.newState(ctx), { point: [-60, 0, 20], radius: 1, heating: 1, time: 3 }, {});
ok('inflammation_time unknown: not judged, noted', F.reaches && F.igniteAt === null && /not judged/.test(F.notes.join()), F);
F = blast.fireOn(ctx, Object.assign(after.newState(ctx), { burning: [{ at: 0 }] }), { point: [-60, 0, 20], radius: 1, heating: 1, time: 3, inflammation: 2 }, {});
ok('already burning: no heat', F.igniteAt === null && /already burning/.test(F.notes.join()), F);
F = blast.fireOn(ctx, after.newState(ctx), { point: [-60, 0, 20] }, {});
ok('fire values missing: not applied, noted', !F.reaches && /not read/.test(F.notes.join()), F);
st = after.newState(ctx);
r = after.run(ctx, Object.assign({}, he, { damage: [{ type: 'fire', radius: 5, heating: 1, time: 3 }] }), 100, front, st, { inflammationTime: 1 });
ok('after.run: fire of the filling at the burst point, events with fire: true', r.fire && r.fire[0].igniteAt === 1 && r.events.some(e => e.fire && e.event === 'burn'), r.fire);

try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* temp */ }
console.log(fails ? 'FAIL blast (' + fails + ' of ' + n + ')' : 'PASS blast (' + n + ')');
process.exit(fails ? 1 : 0);
