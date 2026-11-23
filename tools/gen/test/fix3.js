// GEN-FIX3: seeded-defect tests of the gen fixes on an own fixture (no game): text key of #dlg_mp.lng goes into a mod copy of that
// file (#1), preset add of a key the reader takes / refusal of others (#2), card edits on a vehicle and a soldier card + tags/flags,
// roster tags (#4), squad change (#5), veterancy macro rename against set/breed/**/*.inc (#6), mission-clone and map-clone files in
// --plan seen by a later set row (#11). Elsewhere: #3 quoted set paths = patch-entity test/add-test.js, #7 kit count = ops-unit.js
// (damage_edit by layer = fix2.js #5), #8 = gui/ext/bots/test.js, #10 army bots block = fix2.js #1.
// node fix3.js <work dir>   prints "OK name" / "FAIL name: why", exit 1 on a FAIL.
// Author: Imperator_Aug (ARSENAL, ia-d5c8cac3)
const fs = require('fs'), path = require('path');
const W = path.resolve(process.argv[2] || path.join(__dirname, 'work'), 'fix3'); fs.rmSync(W, { recursive: true, force: true }); fs.mkdirSync(W, { recursive: true });
const { Ctx } = require('../lib/ctx'), O = require('../lib/ops'), genMain = require('../gen');
let bad = 0;
const ok = (name, c, why) => { console.log(c ? 'OK ' + name : 'FAIL ' + name + ': ' + (why || '')); if (!c) bad++; };
const put = (root, key, data) => { const f = path.join(root, key); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.isBuffer(data) ? data : Buffer.from(data.replace(/\r?\n/g, '\r\n'), 'latin1')); };

// ---- fixture game
const G = path.join(W, 'as2'), g = (k, d) => put(G, k, d), U = 'resource/set/multiplayer/units/';
g('resource/interface/text/#dlg_mp.lng', '{tags\n\t{mp\n\t\t{army\n\t\t\t{rus "Russia"}\n\t\t}\n\t}\n}\n');
g(U + 'common.set', ';SDL\n{units\n\t(include "soldiers.set")\n\t(include "squads.set")\n\t(include "vehicles.set")\n}\n');
g(U + 'vehicles.set', '(define "v" {tags "%t %s"})\n(include "vehicles_rus.set")\n');
g(U + 'vehicles_rus.set', '{"tank_t"\t("v" t(medium) s(rus) cp(15)) {level 1} {cost 350} {fore 1.0}}\n');
g(U + 'soldiers.set', '(define "rifle"\n\t{tags "rifle %side infantry man"}\n\t{cp 2.5}\n\t{score 0.50}\n\t{basic}\n\t{breed}\n)\n{"mp/rus/rifle" ("rifle" side(rus))}\n');
const SQ = n => `(define "squad_with${n}types"\n\t{"%name(%side)" {charge %c} {content "${Array.from({ length: n }, (_, i) => 'mp/%side/%c' + (i + 1)).join(' ')}"} {tags "infantry %side %t"} {level %level} {cost %cost}}\n)\n`;
g(U + 'squads.set', SQ(2) + SQ(3) + '("squad_with3types" side(rus) name(riflemans) c(30) c1(squadleader:1) c2(rifle:4) c3(mg:1) t(all) level(1) cost(60))\n("squad_with2types" side(rus) name(smgs) c(30) c1(squadleader:1) c2(rifle:3) t(all) level(1) cost(70))\n');
g('resource/set/breed/mp/rus/veterancy_generic.inc', '(define "veterancy_1"\n\t{veterancy {x 1}}\n)\n');
for (const b of ['squadleader', 'rifle', 'mg']) g(`resource/set/breed/mp/rus/${b}.set`, '{breed\n\t(include "veterancy_generic.inc")\n\t("veterancy_1")\n\t{inventory\n\t\t{item "mosin" filled}\n\t}\n}\n');
g('resource/set/multiplayer/games/presets_all.inc', '(define "standard_all"\n\t{common\n\t\t{unitLimits "rifle=3"}\n\t\t{budgets\n\t\t\t{vehicle\n\t\t\t\t{resource {start 100} {finish 100}}\n\t\t\t}\n\t\t}\n\t}\n)\n');
g('resource/set/multiplayer/games/combat.set', '{mode\n\t{order 1}\n}\n');
// GEN-FIX4 #1: bot.data.lua in the vanilla form: the last row of each ["army"] list has no comma, the last list closes with } (bot.data.lua:24,64)
for (const n of ['tank_t', 'tank_f']) g(`resource/entity/-vehicle/${n}/${n}.def`, '{game_entity\n\t{mass 30000}\n}\n');
g('resource/set/multiplayer/armies/rus.set','{army\n\t{id 2}\n\t{title "mp/army/rus"}\n}\n');
g('resource/set/multiplayer/games/preset_alliances.inc', '{"allies"\n\t{armies "rus"}\n}\n');
g('resource/script/multiplayer/bot.data.lua', 'Purchases = {\n\t{--purchase 1\n\t\tRepeat = 1,\n\t\tUnits = {\n\t\t\t["rus"] = {--Russia\n\t\t\t\t{priority = 1.0, class = UnitClass.Tank, unit = "tank_t"}\n\t\t\t}\n\t\t}\n\t},\n}\n');

const ctxOf = (plan, out) => new Ctx({ target: 'as64', game: G, out: out || path.join(W, 'out'), plan: !!plan });
const codes = c => { const j = c.rep.toJSON({ tool: 'gen' }); return j.findings.map(f => f.code).concat(j.info.map(x => x.code)); };
const has = (c, code) => codes(c).includes(code);
const errs = c => Object.entries(c.rep.counts).filter(([k]) => !/^WARN_/.test(k)).reduce((a, [, n]) => a + n, 0);
const str = (c, k) => { const b = c.dirty.get(k); return b ? b.toString('latin1') : ''; };
const crlf = s => !/[^\r]\n/.test(s);
const run = (fn, spec, plan) => { const c = ctxOf(plan === undefined ? true : plan); O[fn](c, spec); return c; };
const refused = (name, fn, spec, code) => { const c = run(fn, spec); ok(name + ' -> ' + code, has(c, code) && c.dirty.size === 0, codes(c).join(' ') + ' dirty ' + [...c.dirty.keys()].join(' ')); };

// #1 a key #dlg_mp.lng defines (mp/army/rus) goes into a mod copy of #dlg_mp.lng, not the mod's own '#<slug>.lng' (where it loses, LOC-19)
{ const out = path.join(W, 'out1'), c = ctxOf(false, out);
  c.texts.push({ key: 'mp/army/rus', text: 'Soviet Union', file: '' }, { key: 'mp/army/fin', text: 'Finland', file: '' });
  genMain.finishText(c, 'mod3');
  const dlg = path.join(out, 'localization', '#dlg_mp.lng'), own = path.join(out, 'localization', '#mod3.lng');
  const d = fs.existsSync(dlg) ? fs.readFileSync(dlg, 'utf8') : '', o = fs.existsSync(own) ? fs.readFileSync(own, 'utf8') : '';
  ok('#1 text mp/army/rus -> mod copy of #dlg_mp.lng (GEN_TEXT_VANILLA_FILE)', has(c, 'GEN_TEXT_VANILLA_FILE') && /Soviet Union/.test(d) && !/Russia/.test(d) && !/Soviet/.test(o), codes(c).join(' ') + ' | ' + d + ' | ' + o);
  ok('#1 text mp/army/fin (no vanilla key, seeded) stays in #mod3.lng', /Finland/.test(o) && !/Finland/.test(d), o); }
{ const c = ctxOf(true); c.texts.push({ key: 'mp/army/rus', text: 'Soviet Union', file: '' }); genMain.finishText(c, 'mod3');
  ok('#1 text --plan names #dlg_mp.lng', JSON.stringify(c.rep.toJSON({ tool: 'gen' })).includes('localization/#dlg_mp.lng'), codes(c).join(' ')); }

// #2 preset add of a key the preset reader takes; refusal of a name it skips
{ const c = run('opPreset', { file: 'presets_all.inc', name: 'standard_all', set: { 'budgets/vehicle/resource/growtime': 60, 'common/chargeFactors': 'rifle=0.5' } });
  const t = str(c, 'resource/set/multiplayer/games/presets_all.inc');
  ok('#2 preset add: {growTime 60} under resource (canonical case), {chargeFactors {value ..}} under common', errs(c) === 0 && has(c, 'GEN_PRESET_KEY_ADDED') && /\{growTime 60\}/.test(t) && /\{chargeFactors \{value "rifle=0\.5"\}\}/.test(t) && crlf(t), codes(c).join(' ') + ' ' + t); }
refused('#2 preset add of a name the reader skips (seeded: nokey)', 'opPreset', { file: 'presets_all.inc', name: 'standard_all', set: { 'common/nokey': 1 } }, 'GEN_PRESET_KEY_UNKNOWN');
refused('#2 preset add under a missing parent', 'opPreset', { file: 'presets_all.inc', name: 'standard_all', set: { 'teams/a/unitLimits': 'rifle=1' } }, 'GEN_PRESET_KEY_MISSING');

// #4 card edits
{ const c = run('opCard', { unit: 'tank_t', army: 'rus', price: 200, cp: 10, tags: ['fast', '-medium'], not_for_sale: true });
  const t = str(c, U + 'vehicles_rus.set');
  ok('#4 vehicle card: cost 200, cp(10), t(fast), +{not_for_sale}, line kept as a macro call', errs(c) === 0 && /\("v" t\(fast\) s\(rus\) cp\(10\)\) \{level 1\} \{cost 200\} \{fore 1\.0\}/.test(t) && /\{not_for_sale\}/.test(t) && has(c, 'GEN_CARD_EDIT') && crlf(t), codes(c).join(' ') + ' ' + t); }
{ const c = run('opCard', { unit: 'mp/rus/rifle', army: 'rus', cp: 3, tags: ['-man', 'elite'], basic: false });
  const t = str(c, U + 'soldiers.set');
  ok('#4 soldier card (was GEN_CARD_UNKNOWN): expanded, {cp 3}, tags -man +elite, -{basic}', errs(c) === 0 && has(c, 'GEN_CARD_EXPANDED') && /\{"mp\/rus\/rifle"[\s\S]*\{cp 3\}/.test(t) && /\{tags "rifle rus infantry elite"\}/.test(t) && !/\{"mp\/rus\/rifle"[\s\S]*\{basic\}/.test(t) && crlf(t), codes(c).join(' ') + ' ' + t); }
{ const c = run('opCard', { unit: 'tank_t', army: 'rus', info: 'Fast tank' });
  ok('#4 vehicle info -> text info/entity/tank_t', c.texts.some(x => x.key === 'info/entity/tank_t' && x.text === 'Fast tank'), JSON.stringify(c.texts)); }
refused('#4 card: side tag comes from the macro (seeded -rus)', 'opCard', { unit: 'tank_t', army: 'rus', tags: ['-rus'] }, 'GEN_CARD_TAG_ABSENT');
refused('#4 card: tag with a space', 'opCard', { unit: 'tank_t', army: 'rus', tags: ['bad tag'] }, 'GEN_CARD_TAGS_BAD');
refused('#4 card: flag not a boolean', 'opCard', { unit: 'tank_t', army: 'rus', not_for_sale: 'maybe' }, 'GEN_CARD_FLAG_BAD');
refused('#4 card: info on a soldier card', 'opCard', { unit: 'mp/rus/rifle', army: 'rus', info: 'x' }, 'GEN_CARD_INFO_SOLDIER');
refused('#4 card: unknown unit', 'opCard', { unit: 'tank_zz', army: 'rus', cp: 3 }, 'GEN_CARD_UNKNOWN');
{ const c = run('opRoster', { unit: 'tank_n', like: 'tank_t', army: 'rus', tags: ['-medium', 'heavy'] });
  const t = str(c, U + 'vehicles_rus.set');
  ok('#4 roster tags: new card tank_n with t(heavy), tank_t untouched', errs(c) === 0 && /\{"tank_n"[^\r\n]*t\(heavy\)/.test(t) && /\{"tank_t"\t\("v" t\(medium\)/.test(t), codes(c).join(' ') + ' ' + t); }

// #5 squad change
{ const c = run('opSquad', { name: 'riflemans', army: 'rus', change: true, members: ['-mg'], fields: { cost: 130 } });
  const t = str(c, U + 'squads.set');
  ok('#5 squad change -mg: squad_with2types c1 c2, cost 130, one line', errs(c) === 0 && /\("squad_with2types" side\(rus\) name\(riflemans\) c\(30\) c1\(squadleader:1\) c2\(rifle:4\) t\(all\) level\(1\) cost\(130\)\)/.test(t) && !/mg:1/.test(t) && crlf(t), codes(c).join(' ') + ' ' + t); }
{ const c = run('opSquad', { name: 'smgs', army: 'rus', change: true, members: ['squadleader:1', 'rifle:2', 'mg:2'], order: 'first' });
  const t = str(c, U + 'squads.set');
  ok('#5 squad change members: squad_with3types, moved first', errs(c) === 0 && /\("squad_with3types" side\(rus\) name\(smgs\) c\(30\) c1\(squadleader:1\) c2\(rifle:2\) c3\(mg:2\)/.test(t) && t.indexOf('name(smgs)') < t.indexOf('name(riflemans)'), codes(c).join(' ') + ' ' + t); }
{ const c = run('opSquad', { name: 'riflemans', army: 'rus', change: true, not_for_sale: true });
  const t = str(c, U + 'squads.set');
  ok('#5 squad change not_for_sale: expanded into a block with {not_for_sale}', errs(c) === 0 && /\{"riflemans\(rus\)"[\s\S]*\{not_for_sale\}/.test(t) && !/name\(riflemans\)/.test(t) && crlf(t), codes(c).join(' ') + ' ' + t); }
refused('#5 squad change: member not in the squad (seeded -at)', 'opSquad', { name: 'riflemans', army: 'rus', change: true, members: ['-at'] }, 'GEN_SQUAD_MEMBER_ABSENT');
refused('#5 squad change: unknown squad', 'opSquad', { name: 'nope', army: 'rus', change: true, members: ['-mg'] }, 'GEN_SQUAD_CHANGE_UNKNOWN');
refused('#5 squad change: -x and x:n mixed', 'opSquad', { name: 'riflemans', army: 'rus', change: true, members: ['-mg', 'rifle:2'] }, 'GEN_SQUAD_ARGS');
refused('#5 squad change: breed with no breed file', 'opSquad', { name: 'riflemans', army: 'rus', change: true, members: ['nobody:1'] }, 'GEN_SQUAD_BREED_UNKNOWN');
refused('#5 squad change: nothing to change', 'opSquad', { name: 'riflemans', army: 'rus', change: true }, 'GEN_SQUAD_ARGS');

// #6 veterancy rename: veterancy_2 must be defined in the file, its includes, properties/** or set/breed/**/*.inc
const BR = 'file:resource/set/breed/mp/rus/rifle.set';
{ const c = run('opMacro', { entity: BR, macro: 'veterancy_1', rename: 'veterancy_2' });
  const msg = JSON.stringify(c.rep.toJSON({ tool: 'gen' }));
  ok('#6 rename to an undefined veterancy_2 refused, names veterancy_1 and its file', has(c, 'GEN_MACRO_UNDEFINED') && c.dirty.size === 0 && /veterancy_1 \(resource\/set\/breed\/mp\/rus\/veterancy_generic\.inc\)/.test(msg), msg); }
{ const c = ctxOf(true); c.write('resource/set/breed/mp/rus/veterancy_mod.inc', Buffer.from('(define "veterancy_2"\r\n\t{veterancy {x 2}}\r\n)\r\n', 'latin1'));
  O.opMacro(c, { entity: BR, macro: 'veterancy_1', rename: 'veterancy_2' });
  const t = str(c, 'resource/set/breed/mp/rus/rifle.set');
  ok('#6 rename with veterancy_2 in a mod set/breed .inc: ("veterancy_2")', errs(c) === 0 && /\("veterancy_2"\)/.test(t) && !/veterancy_1/.test(t) && crlf(t), codes(c).join(' ') + ' ' + t); }
refused('#6 rename to the same macro', 'opMacro', { entity: BR, macro: 'veterancy_1', rename: 'veterancy_1' }, 'GEN_MACRO_ARGS');

// #11 mission-clone / map-clone in --plan: their files are held in ctx.dirty / ctx.virt so a later set row sees them.
// The tool is stubbed: it writes into its --out folder like the real one (a mod.info, a mode card, a binary).
const GK = 'resource/set/multiplayer/games/x11.set';
const stub = (c, files) => { c.tool = function (tool, a) { this.flush(); const o = a[a.indexOf('--out') + 1]; this.calls = (this.calls || []).concat([[tool, o]]);
  if (!a.includes('--dry-run')) { put(o, 'mod.info', '{name "x"}\n'); for (const [k, d] of Object.entries(files)) put(o, k, d); }
  this.diskKeys = null; return { status: 0, out: '', err: '' }; }; return c; };
const MODE = { [GK]: '{mode\n\t{order 3}\n}\n' };
const setOrder = c => O.opSet(c, { rows: [{ entity: 'file:' + GK, path: 'mode/order', value: '7', op: 'set' }] }, G);
{ const c = stub(ctxOf(true), MODE);
  O.opMissionClone(c, { map: 'map/multi/m1', from: 'combat', to: 'x11', with_mode: 'x11' }); setOrder(c);
  ok('#11 mission-clone --plan, then set on games/x11.set: applied ({order 7})', errs(c) === 0 && /\{order 7\}/.test(str(c, GK)), codes(c).join(' ') + ' ' + str(c, GK));
  ok('#11 --plan: the tool ran into a temp folder (removed), not the mod; mod.info not held', c.calls.length === 1 && path.resolve(c.calls[0][1]) !== c.out && !fs.existsSync(c.calls[0][1]) && !c.dirty.has('mod.info') && !fs.existsSync(path.join(c.out, GK)), JSON.stringify(c.calls)); }
{ const c = ctxOf(true); setOrder(c);
  ok('#11 seeded: set on games/x11.set with no mission-clone before it -> GEN_SET_ENTITY_UNKNOWN', has(c, 'GEN_SET_ENTITY_UNKNOWN') && c.dirty.size === 0, codes(c).join(' ')); }
{ const out = path.join(W, 'out11'), c = stub(ctxOf(false, out), MODE);
  O.opMissionClone(c, { map: 'map/multi/m1', from: 'combat', to: 'x11', with_mode: 'x11' }); setOrder(c); c.flush();
  const f = path.join(out, GK), t = fs.existsSync(f) ? fs.readFileSync(f, 'latin1') : '';
  ok('#11 mission-clone write, then set: the mod file holds {order 7}', errs(c) === 0 && /\{order 7\}/.test(t), codes(c).join(' ') + ' ' + t); }
{ const bin = Buffer.from([1, 0, 2, 0, 3]), c = stub(ctxOf(true), { 'resource/map/multi/m2/map.info': '{map\n\t{size 512}\n}\n', 'resource/map/multi/m2/terrain.bin': bin });
  O.opMapClone(c, { map: 'map/multi/m1', name: 'm2' });
  O.opSet(c, { rows: [{ entity: 'file:resource/map/multi/m2/map.info', path: 'map/size', value: '1024', op: 'set' }] }, G);
  ok('#11 map-clone --plan: map.info in the overlay (set applied), the binary a name in ctx.virt', errs(c) === 0 && /\{size 1024\}/.test(str(c, 'resource/map/multi/m2/map.info')) && c.virt.has('resource/map/multi/m2/terrain.bin') && !c.dirty.has('resource/map/multi/m2/terrain.bin'), codes(c).join(' ') + ' ' + str(c, 'resource/map/multi/m2/map.info')); }

// GEN-FIX4 #1: new army + one card -> the ["fin"] block (last row without a comma, as vanilla), then a botrecipe buy-first on it.
// Old botrecipe anchored only on rows ending in ',' -> BOT_ANCHOR_MISSING for a one-row list (the guided army task).
{ const out = path.join(W, 'out4'), c = ctxOf(false, out);
  O.opArmy(c, { tag: 'fin', like: 'rus', alliance: 'allies' }); O.opRoster(c, { unit: 'tank_f', like: 'tank_t', army: 'fin' }); O.armyBots(c); c.flush();
  const BL = path.join(out, 'resource/script/multiplayer/bot.data.lua'), b0 = fs.existsSync(BL) ? fs.readFileSync(BL, 'latin1') : '';
  ok('FIX4 #1 army bots block: one row, no comma on it (vanilla last-row form), block closes with },', /\["fin"\] = \{[^\r\n]*\r\n\t+\{priority = 1\.0, class = UnitClass\.Tank, unit = "tank_f"\}\r\n\t+\},\r\n\t+\["rus"\]/.test(b0), b0);
  const cp = require('child_process'), BR = path.join(__dirname, '..', '..', 'botrecipe', 'botrecipe.js');
  const br = (...a) => cp.spawnSync(process.execPath, [BR, out, ...a], { encoding: 'utf8' });
  // The unit bought is tank_g, not the list's own tank_f: botrecipe answers 'already' for a unit the army's list holds at any
  // priority (botrecipe/test/run.sh "already in place"), so buying tank_f again adds no row.
  let r = br('--out', out, '--buy-first', 'tank_g', '--class', 'Tank', '--priority', '1000.0', '--army', 'fin', '--dry-run');
  ok('FIX4 #1 buy-first plan on the one-row ["fin"] list: exit 0 (was BOT_ANCHOR_MISSING)', r.status === 0 && /buy-first tank_g after tank_f/.test(r.stdout) && fs.readFileSync(BL, 'latin1') === b0, r.status + ' ' + r.stdout + r.stderr);
  const o2 = path.join(W, 'out4b'); r = br('--out', o2, '--buy-first', 'tank_g', '--class', 'Tank', '--priority', '1000.0', '--army', 'fin');
  const b1 = fs.existsSync(path.join(o2, 'resource/script/multiplayer/bot.data.lua')) ? fs.readFileSync(path.join(o2, 'resource/script/multiplayer/bot.data.lua'), 'latin1') : '';
  ok('FIX4 #1 buy-first write: the old last row gets the comma, the new row is the comma-less last one, CRLF', r.status === 0 && /unit = "tank_f"\},\r\n\t+\{priority = 1000\.0, class = UnitClass\.Tank, unit = "tank_g"\}\r\n\t+\},/.test(b1) && crlf(b1), r.stderr + b1);
  r = br('--out', o2, '--buy-first', 'tank_g', '--class', 'Tank', '--priority', '1000.0', '--army', 'fin', '--stock', o2);
  ok('FIX4 #1 buy-first again on its own output: already (no second row)', r.status === 0 && /tank_g: already/.test(r.stdout), r.stdout + r.stderr);
  r = br('--out', o2, '--buy-first', 'tank_f', '--class', 'Tank', '--army', 'ger', '--dry-run');
  ok('FIX4 #1 seeded: an army with no list still BOT_ANCHOR_MISSING', r.status !== 0 && /BOT_ANCHOR_MISSING/.test(r.stderr + r.stdout), r.stdout + r.stderr); }

console.log(bad ? `fix3: ${bad} FAIL` : 'fix3: all ok');
process.exit(bad ? 1 : 0);
