// armorsim effects: cause groups, tag log and blasts on a synthetic game tree (no game data).
//   node groups.test.js [scratchDir]      last line PASS on success
// Author: Imperator_Aug (ARSENAL, ia-b3a014d1)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const sim = require('../sim'), fx = require('../effects'), after = require('../after');
const iasim = require('../../iasim/iasim');

let n = 0, fails = 0;
function ok(name, cond, info) { n++; if (!cond) { fails++; console.log('FAIL ' + name + (info !== undefined ? ': ' + JSON.stringify(info) : '')); } }
const eq = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

const base = process.argv[2] || process.env.ARMORSIM_SCRATCH || os.tmpdir();
fs.mkdirSync(base, { recursive: true });
const dir = fs.mkdtempSync(path.join(base, 'armorsim-groups-'));
const game = path.join(dir, 'game');
const W = (root, rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(text.replace(/\r?\n/g, '\r\n'), 'latin1')); };
W(game, 'mowas_2.exe', 'MZ');
W(game, 'resource/entity/vehicle/tk/tk.def', `{game_entity
	{props "steel tank"}
	{component "body" {tags "hull"}}
	{component "engine"}
	{component "turret"}
	{component "shield1" {tags "shield"}}
	{component "shield2" {tags "shield"}}
	{component "radio"}
	{volume "body" {thickness 30}}
	{volume "engine" {thickness 5}}
	{volume "turret" {thickness 40}}
	{Extension "tk.mdl"}
}
`);
W(game, 'resource/entity/vehicle/tk/tk.mdl', `{Skeleton
	{bone "basis"
		{bone "body"
			{bone "turret"
				{Position 0 0 40}
			}
		}
	}
}
{Volume "body"
	{Box 100 60 40}
	{Bone "body"}
	{Position 0 0 20}
}
{Volume "engine"
	{Box 20 40 20}
	{Bone "body"}
	{Position -30 0 20}
}
{Volume "turret"
	{Box 40 40 20}
	{Bone "turret"}
	{Position 0 0 10}
}
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
// line numbers matter below: pierce handler on line 3, break on line 11, "on_break" on line 15 (its call of "explode" on 17),
// "explode" on line 24. "cannot move" comes from the radio break (half the runs, at once) or from "explode" (2 s later).
W(game, 'resource/set/interaction_entity/entity.set', `{entities
	{"tank"
		{on pierce
			{if volume "body"
				{components "body" destroy}
				{if rand 0.5 {components "radio" break}}
				{tags remove "marked"}
				{blastwave c4 5 r0 4 r1 15 offset 0 0 10}
			}
		}
		{on break
			{if component "radio" {weapon_work "mg" 0} {chassis_work 0}}
			{call "on_break"}
		}
		{on "on_break"
			{if component "body"
				{delay 2 {call "explode"}}
				{delay 13
					{tags add "destroyed"}
					{blastwave c4 2 r0 1 r1 2 bone "turret" offset 0 0 5}
				}
			}
		}
		{on "explode"
			{components "shield" destroy}
			{chassis_work 0}
		}
		{on bullet_hit
			{tags add "marked"}
		}
		{on blast_hit
			{tags add "blasted"}
		}
	}
}
`);

const shell = { weapon: 'test', ammo: 'testshell', calibre: 75, table: [[0, 100], [5000, 100]], tags: ['shell_medium', 'ap'] };
const ctx = sim.open('tk', { game, mods: [] });
ok('open', !ctx.error, ctx.error);
if (ctx.error) { console.log('FAIL'); process.exit(1); }
const front = sim.rayFrom(ctx, 0, 0, sim.aimVolume(ctx, 'body'));
const lib = iasim.load(ctx.src, {});
const ent = iasim.entity(lib, { tags: ctx.armor.tags, name: 'tk' });

// ---------- iasim alone: triggers, causes, tag log, onBlast ----------
{
  const st = after.newState(ctx), blasts = [];
  const Wd = iasim.newWorld(ent, st, { rng: () => 0.1, ctx, onBlast: (w, b) => { blasts.push(Object.assign({ trig: w.cur && w.cur.kind, parent: w.cur && w.cur.parent, t: w.time }, b)); iasim.fire(w, 'blast_hit', { volume: 'body', value: b.energy }); } });
  iasim.fire(Wd, 'bullet_hit', { volume: 'body', part: 'body', bullet: true });
  iasim.trigger(Wd, 'shell', { event: 'pierce', volume: 'body' }, () => iasim.fire(Wd, 'pierce', { volume: 'body', part: 'body', bullet: true, position: [50, 0, 20] }));
  iasim.drain(Wd, 60);
  const T = Wd.triggers, kinds = T.map(t => t.kind + ':' + (t.event || '') + ':' + (t.part || t.volume || '') + ':' + (t.parent || 0));
  ok('bullet_hit outside a trigger opens a shell trigger', kinds[0] === 'shell:bullet_hit:body:0', kinds);
  const pierce = T.find(t => t.event === 'pierce'), bodyT = T.find(t => t.kind === 'part' && t.part === 'body');
  ok('script part change opens a child part trigger', bodyT && bodyT.parent === pierce.id && bodyT.fact === 'part:body destroyed', bodyT);
  const byId = id => T.find(t => t.id === id) || {};
  const exT = T.find(t => t.kind === 'script' && t.event === 'explode') || {}, obT = byId(exT.parent);
  ok('a named handler started by call (after a delay) opens a script trigger, by = the call site', exT.at === 2 && exT.by && exT.by.event === 'on_break' && exT.by.line === 17, exT);
  ok('its parent chain: on_break (script) -> body part -> pierce', obT.kind === 'script' && obT.event === 'on_break' && obT.parent === bodyT.id && byId(bodyT.parent) === pierce, [obT, bodyT]);
  const shieldT = T.filter(t => t.kind === 'part' && /^shield/.test(t.part));
  ok('shield triggers under the explode trigger', shieldT.length === 2 && shieldT.every(t => t.parent === exT.id), shieldT);
  const h = f => Wd.happened.find(x => x.fact === f) || {};
  eq('body destroyed noted in the pierce trigger, shields in the explode trigger', [h('part:body destroyed').cause, h('part:shield1 destroyed').cause, h('part:shield2 destroyed').cause], [pierce.id, exT.id, exT.id]);
  ok('note by = the handler block run', h('part:shield1 destroyed').by && h('part:shield1 destroyed').by.event === 'explode' && h('part:shield1 destroyed').by.line === 24, h('part:shield1 destroyed').by);
  const td = h('tag:destroyed');
  ok('delayed tag keeps the cause and handler of its scheduling (13 s later)', td.cause === obT.id && td.at === 13 && td.by && td.by.event === 'on_break', td);
  const radioT = T.find(t => t.kind === 'part' && t.part === 'radio') || {};
  ok('radio broken under rand 0.1 < 0.5; cannot move noted there first, not again by explode', st.parts.get('radio').damage === 1 && radioT.parent === pierce.id && h('cannot move').cause === radioT.id && Wd.happened.filter(x => x.fact === 'cannot move').length === 1);
  const tl = Wd.tagLog.map(x => x.op + ' ' + x.tag + '@' + x.at + '#' + x.cause);
  ok('tag log: every tag change with cause', tl.includes('add marked@0#1') && tl.includes('remove marked@0#' + pierce.id) && tl.includes('add destroyed@13#' + obT.id) && tl.includes('add blasted@0#' + T.find(t => t.kind === 'blast').id), tl);
  eq('onBlast: blastwave numbers in engine units, inside a blast trigger', blasts.map(b => [b.trig, b.energy, b.radius.inner, b.radius.outer, b.point, b.by && b.by.event, b.t]),
    [['blast', 5, 80, 300, [0, 0, 10], 'pierce', 0], ['blast', 2, 20, 40, [0, 0, 45], 'on_break', 13]]);
  const bT = T.filter(t => t.kind === 'blast');
  eq('blast triggers: parents pierce and on_break, by the calling handler', bT.map(t => [t.parent, t.by && t.by.line]), [[pierce.id, 3], [obT.id, 15]]);
  ok('blast_hit fired from onBlast belongs to the blast trigger', Wd.tagLog.find(x => x.tag === 'blasted').cause === bT[0].id);
}
// blastwave `position` uses the command's point; r1 below r0 is raised to r0; explode_inventory needs the amount
{
  const lib2 = { blocks: [{ tags: ['tank'], on: new Map() }] };
  const mk = text => { const sdlx = require('../../lib/sdlx'); const t = sdlx.read(Buffer.from(text), { file: 'x', key: 'x', onError: () => {} }); return t.root.items.find(x => x.k === 'BLOCK'); };
  lib2.blocks[0].on.set('pierce', { body: mk('{on pierce {blastwave c4 3 r0 4 r1 2 position} {explode_inventory {5 "a" 3} {30 "b" 5}}}'), overload: false, file: 'x', line: 1 });
  const got = [];
  const Wd = iasim.newWorld(iasim.entity(lib2, { tags: ['tank'] }), after.newState(ctx), { rng: () => 0.5, ctx, explosiveAmount: 20, onBlast: (w, b) => got.push([b.action, b.energy, b.radius.inner, b.radius.outer, b.point]) });
  iasim.fire(Wd, 'pierce', { volume: 'body', bullet: true, position: [1, 2, 3] });
  // amount 20 * 0.65 = 13 -> entry 30: (5 - 3) * 30 / 13 + 3 = 7.615..
  eq('blastwave position + r1 raised; explode_inventory radius by the engine rule', got.map(g => [g[0], g[1], Math.round(g[2] * 1000) / 1000, Math.round(g[3] * 1000) / 1000, g[4]]),
    [['blastwave', 3, 80, 80, [1, 2, 3]], ['explode_inventory', 13, 3.808, 7.615, [0, 0, 0]]]);
}

// ---------- effects: groups over runs ----------
const E = fx.effects(ctx, shell, 100, front, { samples: 400, seed: 5 });
if (process.env.GROUPS_DUMP) console.log(JSON.stringify({ facts: E.facts, groups: E.groups, tags: E.tags, blasts: E.blasts, notes: E.engine.notes }, null, 1));
const G = id => E.groups.find(g => g.id === id);
const gf = (g, f) => (g.facts || []).find(x => x.fact === f);
const gOf = f => E.groups.filter(g => gf(g, f));
ok('every fact is in its groups; facts[].group is the most likely of facts[].groups', E.facts.every(f => {
  const gs = gOf(f.fact).map(g => g.id).sort(), best = gOf(f.fact).sort((a, b) => gf(b, f.fact).chance - gf(a, f.fact).chance)[0];
  return gs.length >= 1 && JSON.stringify(gs) === JSON.stringify(f.groups.slice().sort()) && best && gf(best, f.fact).chance === gf(G(f.group), f.fact).chance;
}), E.facts.map(f => [f.fact, f.group, f.groups, gOf(f.fact).map(g => g.id)]));
ok('fact chances over its groups sum to its total', E.facts.every(f => Math.abs(gOf(f.fact).reduce((s, g) => s + gf(g, f.fact).chance, 0) - f.chance) < 0.003), E.facts);
ok('a fact in a group is never more likely than the group', E.groups.every(g => g.facts.every(x => x.chance <= g.chance + 1e-9)));
ok('a group is never more likely than its parent', E.groups.every(g => g.parent === null || g.chance <= G(g.parent).chance + 1e-9), E.groups.map(g => [g.id, g.parent, g.chance]));
const bodyG = gOf('part:body destroyed')[0] || {};
ok('body destroyed sits in the pierce group', bodyG.cause && bodyG.cause.kind === 'shell' && bodyG.cause.event === 'pierce' && bodyG.cause.line === 3 && bodyG.cause.from === 'vanilla', bodyG);
const sh = gOf('part:shield1 destroyed')[0] || {};
ok('shields sit in the named handler group "explode" (after 2 s)', sh.cause && sh.cause.kind === 'script' && sh.cause.event === 'explode' && sh.cause.line === 24 && sh.cause.by && sh.cause.by.line === 17 && gf(sh, 'part:shield2 destroyed') && sh.at.first === 2, sh);
const ob = G(sh.parent) || {};
ok('its parent chain: "on_break" -> the pierce group (empty body part group pruned)', ob.cause && ob.cause.kind === 'script' && ob.cause.event === 'on_break' && ob.parent === bodyG.id, ob);
ok('no group without facts or tags of its own except blast groups', E.groups.every(g => g.facts.length || g.tags.length || g.cause.kind === 'blast'), E.groups.map(g => [g.id, g.cause.kind, g.cause.event]));
ok('delayed tag in the on_break group with the delay time', gf(ob, 'tag:destroyed') && ob.tags.includes('destroyed') && gf(ob, 'tag:destroyed').at.first === 13, ob);
const tg = E.tags.find(t => t.tag === 'destroyed' && t.op === 'add') || {};
ok('tags list: chance, time, by with origin, group', tg.chance === 1 && tg.at && tg.at.first === 13 && tg.by && tg.by.event === 'on_break' && tg.by.line === 15 && tg.by.from === 'vanilla' && tg.group === ob.id, tg);
ok('tags list has every tag, removals too', E.tags.some(t => t.tag === 'marked' && t.op === 'add') && E.tags.some(t => t.tag === 'marked' && t.op === 'remove'), E.tags);
const radio = E.groups.find(g => g.cause.kind === 'part' && g.cause.part === 'radio') || {};
ok('rand 0.5 branch: group chance near 0.5', radio.chance > 0.4 && radio.chance < 0.6 && gf(radio, 'weapon:mg off') && radio.parent === bodyG.id, radio);
const wf = E.facts.find(f => f.fact === 'weapon:mg off') || {};
ok('fact chance follows its group', Math.abs(wf.chance - radio.chance) < 1e-9, [wf, radio.chance]);
const cm = E.facts.find(f => f.fact === 'cannot move') || {}, cmR = gf(radio, 'cannot move'), cmX = gf(sh, 'cannot move');
ok('a fact from two causes shows in both, chances summing to its total', cm.chance === 1 && cmR && cmX && Math.abs(cmR.chance + cmX.chance - 1) < 0.003 && cmR.at.first === 0 && cmX.at.first === 2 && cm.groups.length === 2, [cm, cmR, cmX]);
const sb = E.blasts.find(b => b.source === 'script' && b.energy === 5) || {};
ok('script blastwave listed with its numbers and caller', sb.chance === 1 && sb.radius && sb.radius.inner === 80 && sb.radius.outer === 300 && JSON.stringify(sb.point) === '[0,0,10]' && sb.at === 0 && sb.by && sb.by.event === 'pierce' && sb.by.from === 'vanilla', sb);
const bg = G(sb.group) || {};
ok('blast group: kind blast, under the pierce group', bg.cause && bg.cause.kind === 'blast' && bg.parent === bodyG.id, bg);
const sb2 = E.blasts.find(b => b.source === 'script' && b.energy === 2) || {};
ok('delayed blast: 13 s, bone point, group under the on_break group', sb2.at === 13 && JSON.stringify(sb2.point) === '[0,0,45]' && (G(sb2.group) || {}).parent === ob.id, sb2);
ok('blast hits carry chanceIfBlast', E.blasts.every(b => b.hits.every(x => typeof x.chanceIfBlast === 'number' && x.chanceIfBlast >= x.chance)), E.blasts);
ok('groups form a tree (parents listed before children)', E.groups.every((g, i) => g.parent === null || E.groups.findIndex(x => x.id === g.parent) < i));
ok('same seed, same groups', JSON.stringify(fx.effects(ctx, shell, 100, front, { samples: 400, seed: 5 }).groups) === JSON.stringify(E.groups));
// carried state: facts true before this shot sit in a 'before' group
const E2 = fx.effects(ctx, shell, 100, front, { samples: 20, seed: 5, state: E.next });
const bf = E2.groups.find(g => g.cause.kind === 'before') || {};
ok('facts from an earlier shot: before group', bf.facts && gf(bf, 'part:body destroyed') && E2.facts.every(f => typeof f.group === 'number'), E2.groups);

// ---------- causes: the short tree (helper steps folded, one cause however reached, exact chances) ----------
const causeChecks = (name, R) => {
  const C = id => R.causes.find(c => c.id === id);
  const cf = (c, f) => c.facts.find(x => x.fact === f);
  ok(name + ': every fact sits under at least one cause; facts[].cause is in facts[].causes', R.facts.every(f => R.causes.some(c => cf(c, f.fact)) && f.causes.includes(f.cause)), R.facts);
  ok(name + ': a fact\'s chances over the causes sum to its total', R.facts.every(f => Math.abs(R.causes.reduce((s, c) => s + (cf(c, f.fact) ? cf(c, f.fact).chance : 0), 0) - f.chance) < 0.003), R.facts);
  ok(name + ': causes form a tree, parent = a via entry', R.causes.every((c, i) => c.parent === null ? true : R.causes.findIndex(x => x.id === c.parent) < i && c.via.some(v => v.parent === c.parent)), R.causes);
  ok(name + ': no fact likelier than its cause', R.causes.every(c => c.facts.every(x => x.chance <= c.chance + 1e-9)));
  ok(name + ': every group is in at most one cause', (() => { const all = R.causes.flatMap(c => c.groups); return new Set(all).size === all.length; })());
  ok(name + ': no empty part cause', R.causes.every(c => c.cause.kind !== 'part' || c.facts.length || c.tags.length || R.causes.some(x => x.via.some(v => v.parent === c.id))));
  return C;
};
causeChecks('cromwell-like tree', E);
// causesOf on hand-made groups and runs: a cause reached by two paths in the same run counts once
{
  const g = (id, parent, kind, event, facts, tags) => ({ id, parent, cause: { kind, event, part: null, volume: null, fact: null, file: 'f.set', line: id, from: 'vanilla', mod: null, by: null }, chance: 0, facts: facts.map(f => ({ fact: f })), tags: tags || [] });
  const groups = [g(1, null, 'shell', 'pierce', ['a']), g(2, 1, 'script', 'check', ['m']), g(3, 1, 'part', 'break', []), g(4, 1, 'script', 'boom', ['x', 'y', 'z']),
    g(5, 3, 'script', 'boom', ['x', 'y', 'z']), g(6, 4, 'part', 'destroy', [])];
  const own = new Map([[1, 'P'], [2, 'CHK'], [3, 'R'], [4, 'B'], [5, 'B'], [6, 'E']]);
  const runs = [
    { g: [[1, 0], [2, 0], [4, 0], [6, 0]], f: [[1, 'a', 0], [2, 'm', 0], [4, 'x', 0], [4, 'y', 0], [4, 'z', 0]] },
    { g: [[1, 0], [3, 0], [5, 1]], f: [[1, 'a', 0], [5, 'x', 1], [5, 'y', 1], [5, 'z', 1]] },
    { g: [[1, 0], [3, 0], [4, 0], [5, 1]], f: [[1, 'a', 0], [4, 'x', 0], [5, 'y', 1]] },
    { g: [[1, 0]], f: [[1, 'a', 0]] }];
  const cs = fx.causesOf(groups, own, runs, 4), by = ev => cs.find(c => c.cause.event === ev) || {};
  const P = by('pierce'), B = by('boom'), R = by('break');
  eq('causesOf: helper folded, empty part dropped, boom merged', cs.map(c => [c.cause.event, c.parent, c.chance, c.groups]), [['pierce', null, 1, [1, 2]], ['boom', P.id, 0.75, [4, 5]], ['break', P.id, 0.5, [3]]]);
  eq('causesOf: helper fact moved up, listed as a step', [P.facts.map(x => [x.fact, x.chance]), P.steps.map(s => s.event + ':' + s.line)], [[['a', 1], ['m', 0.25]], ['check:2']]);
  eq('causesOf: merged chance exact (0.75, not 0.5 + 0.5), via both parents', [B.chance, B.via], [0.75, [{ parent: P.id, chance: 0.5 }, { parent: R.id, chance: 0.5 }]]);
  eq('causesOf: merged facts counted per run', B.facts.map(x => [x.fact, x.chance, x.at.first]), [['x', 0.75, 0], ['y', 0.75, 0], ['z', 0.5, 0]]);
}
// a mounted mod: interaction scripts from mods/mm; helper "check"; "boom" reached from the pierce (half the runs) or 1 s later
// through the radio part (the other half)
{
  const game2 = path.join(dir, 'game2');
  for (const rel of ['mowas_2.exe', 'resource/entity/vehicle/tk/tk.def', 'resource/entity/vehicle/tk/tk.mdl', 'resource/set/material.set']) {
    fs.mkdirSync(path.dirname(path.join(game2, rel)), { recursive: true }); fs.copyFileSync(path.join(game, rel), path.join(game2, rel));
  }
  W(game2, 'resource/set/interaction_entity/entity.set', '{entities\n}\n');
  W(game2, 'mods/mm/mod.info', '{Mod\n\t{Name "mm"}\n\t{MinGameVersion "3.000"}\n\t{MaxGameVersion "9.999"}\n}\n');
  W(game2, 'mods/mm/resource/set/interaction_entity/entity.set', `{entities
	{"tank"
		{on pierce
			{if volume "body"
				{if rand 0.5 {call "boom"} else {components "radio" break}}
			}
		}
		{on break
			{if component "radio" {tags add "radio_out"} {call "check"} {delay 1 {call "boom"}}}
		}
		{on "check"
			{weapon_work "mg" 0}
		}
		{on "boom"
			{components "shield" destroy}
			{chassis_work 0}
			{tags add "boomed"}
		}
		{on burn
			{tags add "on_fire"}
		}
		{inflammation_time 2}
	}
}
`);
  const ctx2 = sim.open('tk', { game: game2, mods: ['mm'] });
  ok('mod tree opens', !ctx2.error, ctx2.error);
  if (!ctx2.error) {
    const R = fx.effects(ctx2, shell, 100, sim.rayFrom(ctx2, 0, 0, sim.aimVolume(ctx2, 'body')), { samples: 400, seed: 3 });
    if (process.env.GROUPS_DUMP) console.log(JSON.stringify({ groups: R.groups, causes: R.causes }, null, 1));
    const C = causeChecks('mod tree', R);
    const boom = R.causes.filter(c => c.cause.kind === 'script' && c.cause.event === 'boom');
    const bg = R.groups.filter(g => g.cause.kind === 'script' && g.cause.event === 'boom');
    ok('two "boom" groups (two paths) become one cause', bg.length === 2 && boom.length === 1 && JSON.stringify(boom[0].groups) === JSON.stringify(bg.map(g => g.id).sort((a, b) => a - b)), [bg, boom]);
    const b = boom[0] || { via: [], facts: [] }, radio = R.causes.find(c => c.cause.kind === 'part' && c.cause.part === 'radio') || { steps: [], facts: [] };
    ok('boom: chance exact over runs (every run), via pierce and the radio part, near half each', b.chance === 1 && b.via.length === 2 && b.via.every(v => v.chance > 0.4 && v.chance < 0.6) &&
      Math.abs(b.via[0].chance + b.via[1].chance - 1) < 0.002 && b.via.some(v => v.parent === radio.id) && b.via[0].chance >= b.via[1].chance && b.parent === b.via[0].parent, b);
    ok('boom: facts merged with exact chances', ['part:shield1 destroyed', 'part:shield2 destroyed', 'cannot move'].every(f => (b.facts.find(x => x.fact === f) || {}).chance === 1) && b.tags.includes('boomed'), b.facts);
    ok('helper "check" folded into the radio part cause: fact and step', radio.facts.some(x => x.fact === 'weapon:mg off' && Math.abs(x.chance - radio.chance) < 1e-9) && radio.steps.some(s => s.event === 'check' && s.from === 'other mod' && s.mod === 'mm') &&
      !R.causes.some(c => c.cause.event === 'check'), radio);
    ok('mounted mod origin name: cause, handlers, files', b.cause && b.cause.from === 'other mod' && b.cause.mod === 'mm' && R.scripts.handlers.length && R.scripts.handlers.every(h => h.from === 'other mod' && h.mod === 'mm') &&
      R.scripts.files.every(f => f.mod === 'mm') && R.sources.def.from === 'vanilla' && R.sources.def.mod === null, [b.cause, R.scripts, R.sources]);
    ok('fact cause = its cause id', R.facts.every(f => C(f.cause)), R.facts);
    // the filling: a HEAT jet (RULES 44) and a fire (RULES 45) on the same tree; inflammation_time from the mod's script block
    const heat = { weapon: 'test', ammo: 'testheat', calibre: 75, table: [[0, 20], [5000, 20]], tags: ['shell_medium', 'heat'], detonationThickness: 5,
      damage: [{ type: 'cumulative', damage: 200, distance: 3 }, { type: 'fire', radius: 5, heating: 1, time: 10 }] };
    const H = fx.effects(ctx2, heat, 100, sim.rayFrom(ctx2, 0, 0, sim.aimVolume(ctx2, 'body')), { samples: 200, seed: 3 });
    if (process.env.GROUPS_DUMP) console.log(JSON.stringify({ engine: H.engine.events, jets: H.jets, fires: H.fires, causes: H.causes.map(c => [c.id, c.parent, c.cause.kind, c.cause.event, c.cause.volume, c.chance, c.facts.map(x => x.fact), c.tags]) }, null, 1));
    causeChecks('HEAT tree', H);
    const jc = H.causes.find(c => c.cause.kind === 'jet') || {}, jet = H.jets[0] || {};
    const jp = H.causes.find(c => c.cause.kind === 'shell' && c.cause.event === 'pierce' && c.parent === jc.id) || {};
    ok('jet listed: chance 1, pierced body, its cause is the jet cause', jet.chance === 1 && jet.damage === 200 && jet.distance === 3 && jet.cause === jc.id && jc.chance === 1 &&
      jet.hits.some(h => h.volume === 'body' && h.events.includes('pierce')), [jet, jc]);
    ok('the jet\'s pierce results sit under the jet cause', jp.id && H.causes.some(c => c.cause.event === 'boom' && H.causes.some(x => x.id === c.parent && (x.id === jp.id || x.parent === jp.id))), H.causes.map(c => [c.id, c.parent, c.cause.kind, c.cause.event]));
    ok('no shell-kind cause opened by the jet at the top', !H.causes.some(c => c.parent === null && c.cause.kind === 'shell' && c.cause.event === 'pierce'), H.causes.filter(c => c.parent === null));
    const fire = H.fires[0] || {}, fcz = H.causes.find(c => c.cause.kind === 'fire') || {};
    ok('fire listed: reaches, ignites after inflammation / heating = 2 s, inflammation from the mod block', fire.chance === 1 && fire.reaches === 1 && fire.ignites === 1 && fire.igniteAt && fire.igniteAt.first === 2 &&
      fire.inflammation === 2 && fire.inflammationAt && fire.inflammationAt.mod === 'mm' && fire.volumes.length >= 1 && fire.cause === fcz.id, fire);
    ok('a fire that ignites is a fire cause holding the burn handler\'s results, at the ignition time', fcz.cause && fcz.cause.event === 'burn' && fcz.tags.includes('on_fire') && fcz.at && fcz.at.first === 2 && fcz.cause.line > 0, fcz);
    ok('engine carries crewNote', typeof H.engine.crewNote === 'string' && /crew/.test(H.engine.crewNote));
    const H2 = fx.effects(ctx2, heat, 100, sim.rayFrom(ctx2, 0, 0, sim.aimVolume(ctx2, 'body')), { samples: 20, seed: 3, inflammationTime: 50 });
    ok('fire too weak for the unit (inflammation 50 s, 10 s of heat): listed, no fire cause', H2.fires[0] && H2.fires[0].reaches === 1 && H2.fires[0].ignites === 0 && H2.fires[0].cause === null && !H2.causes.some(c => c.cause.kind === 'fire'), H2.fires);
    eq('a shell without a filling: no jets, no fires', [E.jets, E.fires], [[], []]);
    // two equal jets (and two equal fires) in one filling: one cause per jet, each jet one entry over runs (chance 1)
    const heat2 = Object.assign({}, heat, { damage: [{ type: 'cumulative', damage: 200, distance: 3 }, { type: 'cumulative', damage: 200, distance: 3 },
      { type: 'fire', radius: 5, heating: 1, time: 10 }, { type: 'fire', radius: 5, heating: 1, time: 10 }] });
    const H3 = fx.effects(ctx2, heat2, 100, sim.rayFrom(ctx2, 0, 0, sim.aimVolume(ctx2, 'body')), { samples: 50, seed: 3 });
    const jcs = H3.causes.filter(c => c.cause.kind === 'jet');
    ok('two jets of one burst: two entries, distinct causes and groups, chance 1 each, start volume and index', H3.jets.length === 2 && H3.jets.every(j => j.chance === 1 && j.cause && j.group && j.start && j.start.volume === 'body') &&
      H3.jets[0].cause !== H3.jets[1].cause && H3.jets[0].group !== H3.jets[1].group && new Set(H3.jets.map(j => j.index)).size === 2 && jcs.length === 2 && jcs.every(c => c.chance === 1 && c.cause.volume === 'body' && c.cause.jet), [H3.jets.map(j => [j.index, j.key, j.cause, j.group]), jcs]);
    ok('the first jet\'s pierce sits under its own jet cause, the second jet lists its own hits', jcs.length === 2 && H3.causes.some(c => c.parent === jcs[0].id && c.cause.kind === 'shell') &&
      H3.jets[1].hits.length > 0, H3.causes.map(c => [c.id, c.parent, c.cause.kind, c.cause.event]));
    {
      const ray = sim.rayFrom(ctx2, 0, 0, sim.aimVolume(ctx2, 'body')), L = Math.hypot(...ray.dir), u = ray.dir.map(x => x / L), bp = H.engine.end.burst || [];
      const near = (a, b) => Array.isArray(a) && a.length === 3 && a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
      ok('jet point = the burst point (engine.end.burst, 0.3 units before end.point along the flight), dir = the unit flight vector', near(jet.point, bp) && near(jet.dir, u) &&
        Math.abs(Math.hypot(...jet.dir) - 1) < 1e-9 && near(jet.point, H.engine.end.point.map((x, i) => x - u[i] * 0.3)), [jet.point, jet.dir, bp, u]);
      ok('fire point = its centre (the burst point, same frame)', near(fire.point, bp), [fire.point, bp]);
      ok('two jets of one burst: both start at the burst point along the flight; both fires centred there', H3.jets.every(j => near(j.point, H3.engine.end.burst) && near(j.dir, u)) &&
        H3.fires.every(f => near(f.point, H3.engine.end.burst)), [H3.jets.map(j => [j.point, j.dir]), H3.fires.map(f => f.point)]);
      ok('jet / fire point and dir are copies, not the engine\'s arrays', jet.point !== bp && fire.point !== bp && jet.point !== fire.point);
      const blast = require('../blast');
      ok('fireOn with no point: point null', blast.fireOn(ctx2, after.newState(ctx2), { radius: 1, heating: 1, time: 1 }).point === null);
    }
    ok('two fires of one filling: two entries with their own key; a cause each only when it ignites, never shared', H3.fires.length === 2 && H3.fires[0].key !== H3.fires[1].key &&
      (H3.fires.filter(f => f.cause).length < 2 || H3.fires[0].cause !== H3.fires[1].cause), H3.fires.map(f => [f.key, f.ignites, f.cause, f.notes]));
    ok('mounted mod: cause layer = the mod\'s resource dir, rel inside it', b.cause && /\/mods\/mm\/resource$/.test(b.cause.layer) && fs.existsSync(path.join(b.cause.layer, b.cause.rel)), b.cause);
    ok('crewNotes keys: shot always, blast only when a blast ran', JSON.stringify(H.engine.crewNotes) === JSON.stringify([{ key: 'shot' }]) &&
      JSON.stringify(R.engine.crewNotes) === JSON.stringify(R.blasts.length ? [{ key: 'shot' }, { key: 'blast' }] : [{ key: 'shot' }]), [H.engine.crewNotes, R.engine.crewNotes, R.blasts.length]);
  }
}
// origin of a loose mod-folder file: the folder's base name
{
  const origin = require('../origin');
  const o = origin.originOf({ local: new Map([['resource/set/x.set', 'C:/m/My_Mod/resource/set/x.set']]), folder: 'C:/m/My_Mod/' }, 'resource/set/x.set');
  eq('mod folder origin: mod = folder name', [o.from, o.mod], ['mod', 'My_Mod']);
  eq('vanilla origin: no mod name', origin.originOf({ local: new Map(), v: { files: new Map([['resource/a.set', { layer: 'base' }]]) } }, 'resource/a.set').mod, null);
  eq('vanilla pak record: layer = the pak, rel = its entry', (({ layer, rel }) => [layer, rel])(origin.originOf({ local: new Map(), v: { files: new Map([['resource/a.set', { layer: 'base', source: 'pak', container: 'C:/g/resource.pak', entry: 'set/a.set' }]]) } }, 'resource/a.set')), ['C:/g/resource.pak', 'set/a.set']);
  eq('mod folder file: layer = the folder, rel inside it (case kept)', (({ layer, rel }) => [layer, rel])(origin.originOf({ local: new Map([['resource/set/x.set', 'C:\\m\\My_Mod\\resource\\set\\X.set']]), folder: 'C:\\m\\My_Mod' }, 'resource/set/x.set')), ['C:/m/My_Mod', 'resource/set/X.set']);
  eq('mounted mod patch layer: the mod name', origin.originOf({ local: new Map(), isModKey: () => true, v: { files: new Map([['resource/a.set', { layer: 'mm patch 2' }]]) } }, 'resource/a.set').mod, 'mm');
}

if (process.env.GROUPS_KEEP) console.log('kept ' + dir);
else try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* temp */ }
console.log(fails ? 'FAIL groups (' + fails + ' of ' + n + ')' : 'PASS groups (' + n + ')');
process.exit(fails ? 1 : 0);
