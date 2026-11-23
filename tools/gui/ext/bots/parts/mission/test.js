// bots part "mission" test. Arg: scratch dir. No game, no network: a made-up AS2 folder in the scratch dir with one 4-player map whose
// combat.mi has the stock layout (CRLF, tabs, map_point start and flag entities, {Environment}, Helpers {zone} {waypoints} {triggers} with a
// stock-style trigger, a cp1251 comment byte) and a map.net (ground 111). Checks: the part contract and four languages; places and start
// areas; each recipe's exact added text, written out here by hand from the in-game proof's forms "Exact
// trigger text": side detection, advanced selector, `$` vars, board, spawn + player, placed Entity + Tags); the result reads with the
// repo's .mi reader (tools/lib/sdlx) with no new complaints; Remove gives the very bytes back; the routes: map list filter, preview writes
// nothing, write copies then adds, milint (run for real) finds nothing, Undo gives the bytes and folders back (and refuses a changed file),
// Remove of the last addition deletes the copy; proof.json switches; GoH read only (writes refused); the client in tools/gui/test/fakedom.js: searchKit only
// on inputs already in the page, map typed by its game name, both cards, recipes, rotation link, preview, write, the green box, Undo.
// FAIL lines, exit 1.
// Author: Imperator_Aug (ARSENAL, ia-256b4ece)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const modInfo = d => { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'mod.info'), '{mod\r\n\t{name "test"}\r\n}\r\n'); return d; };   // a real mod folder holds mod.info (the write guard asks for it)
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'bots-mission-')));
require('../../../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const X = require('./index'), MI = require('./mi'), check = require('../index').check;
const T = path.join(__dirname, '..', '..', '..', '..', '..');   // tools/
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '\n   got  ' + JSON.stringify(a) + '\n   want ' + JSON.stringify(b));
const W = (p, t) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t, typeof t === 'string' ? 'latin1' : undefined); };
const crlf = a => a.join('\r\n') + '\r\n';
const R = X.routes, U = q => ({ searchParams: new URLSearchParams(q) });
// a refusal is "key" or "key {params}": the key is compared
const throwsMsg = async (f, msg, m) => { let e = null; try { await f(); } catch (x) { e = x; } ok(e && String(e.message).split(' ')[0] === msg, m + ' (got ' + (e ? e.message : 'no error') + ')'); };
const thr = (f, msg, m) => { let e = null; try { f(); } catch (x) { e = x; } ok(e && String(e.message).split(' ')[0] === msg, m + ' (got ' + (e ? e.message : 'none') + ')'); };

// ---- contract and languages
ok(check('mission', X) === '', 'contract: ' + check('mission', X));
ok(X.group === 'E' && X.order === 10 && Object.keys(X.routes).length === 6, 'group E, order 10, six routes');
const ph = s => (s.match(/\{[a-z]+\}/gi) || []).sort().join();
for (const r of X.lang) ok(r.length === 5 && r.slice(1).every(s => typeof s === 'string' && s.trim()) && r.slice(2).every(s => ph(s) === ph(r[1])), 'four languages, same placeholders: ' + r[0]);
ok(new Set(X.lang.map(r => r[0])).size === X.lang.length, 'no lang key twice');
const EN = {}; X.lang.forEach(r => { EN[r[0]] = r[1]; });
for (const k of ['a.title', 'b.title', 'c.title', 'd.title', 'e.title', 'teams.lead', 'orders.lead'].map(k => 'bots.mission.' + k))
  ok(!/\b(trigger|selector|\.mi|player number)\b/i.test(EN[k]), 'plain words, no tech terms: ' + k);
for (const r of 'abcde') ok(/^Example: /.test(EN['bots.mission.' + r + '.ex']) && EN['bots.mission.' + r + '.does'] && !/\b(trigger|selector|\.mi)\b/i.test(EN['bots.mission.' + r + '.does']), 'a one-line example and one plain sentence of effect: ' + r);
// S14: plurals in all four forms; button names come from their own keys, never written into a sentence by hand
for (const w of ['players', 'changes', 'things', 'maps', 'shells', 'men', 'soldiers']) ok(['one', 'few', 'many', 'other'].every(f => EN['bots.mission.n.' + w + '.' + f]), 'plural forms: ' + w);
ok(!X.lang.some(r => /(^|[^А-Яа-яІіЇїЄєҐґ])[Мм]ап(а|и|і|у|ою|ам|ами|ах)?(?![А-Яа-яІіЇїЄєҐґ])/.test(r[3])), 'S20: uk says карта, never мапа');
for (const w of ['sec', 'men', 'soldiers', 'shells']) ok(['one', 'few', 'many', 'other'].every(f => EN['bots.mission.u.' + w + '.' + f]), 'S20: the word after a number box in all forms: ' + w);
ok(!X.lang.some(r => r.slice(1).some(x => /\(s\)|«Просмотр»|«Перегляд»|Ещё настройки|Ще налаштування|“详情”/.test(x))), 'no (s) plurals and no wrong button names in ru/uk/zh');
// the crew: the vehicle's buy card first, else its army's basic infantry (soldiers.set breeds), never another army's men
{
  const R5 = require('./recipes'), known = new Set();
  for (const a of ['eng', 'ger', 'jap', 'rus', 'usa']) for (const b of ['tankman', 'tankman2', 'vehicle_supporter', 'rifle', 'rifle2']) known.add('mp/' + a + '/' + b);
  eq(R5.crewOfCard('{"pz4h" ("v" 2 2) s(ger)}', ''), { army: 'ger', breed: 'mp/ger/tankman' }, 'crewOfCard: the v macro, side from s()');
  eq(R5.crewOfCard('{"cromwell" {content "* ( mp/%s/tankman:2 mp/%s/tankman2:2)"}}', 'eng'), { army: 'eng', breed: 'mp/eng/tankman' }, 'crewOfCard: a content line, side from the file');
  const cases = [['pz4h', ['{"pz4h" ("v" 2 2) s(ger)}'], [], 'mp/ger/tankman ger'], ['t34', ['{"t34" ("v" 2 2) s(rus)}'], [], 'mp/rus/tankman rus'],
    ['cromwell', [{ norm: '{"cromwell" ("vs" 2)}', army: 'eng' }], [], 'mp/eng/vehicle_supporter eng'], ['m8', ['{"m8" s(usa)}'], [], 'mp/usa/rifle usa'], ['chiha', [], ['jap'], 'mp/jap/rifle jap']];
  for (const [u, lines, armies, want] of cases) { const c = R5.crewPick(u, lines, armies, known); ok(c && c.breed + ' ' + c.army === want, 'crewPick ' + u + ': ' + want + ' (got ' + JSON.stringify(c) + ')'); }
  ok(R5.crewPick('nocard', [], [], known) === null, 'crewPick: no army known = no crew (refused, not another army\'s men)');
  ok(!/usa\/rifle2/.test(fs.readFileSync(path.join(__dirname, 'recipes.js'), 'utf8')), 'no fixed USA crew left in recipes.js');
}

// ---- fixture: the stock layout of a multiplayer <mode>.mi (2v2_farmstead form)
const ent = (cls, uid, x, y, ext, mid) => [`\t{Entity "${cls}" ${uid}`, `\t\t{Position ${x} ${y}}`, '\t\t{Extender "map_point"'].concat(ext.map(l => '\t\t\t' + l), ['\t\t}', '\t\t{Player 0}', `\t\t{MID ${mid}}`, '\t}']);
const start = (uid, nm, team, order, x, y, mid) => ent('map_point', uid, x, y, [`{name ${nm}}`, `{team ${team}}`, '{phase 0}', `{order ${order}}`, '{visor SpawnPoint}'], mid);
const MIL = ['{mission'].concat(
  start('0x802a', 'a1', 'a', 1, -2000, -2000, 41), start('0x802b', 'a2', 'a', 2, -2400, -1800, 42), start('0x802c', 'b1', 'b', 1, 3100, 3400, 43), start('0x802d', 'b2', 'b', 2, 2900, 3600, 44),
  ent('flag_point_1', '0x802e', '1123.87', '-1699.98', ['{name f1}', '{zoneA 12}', '{zoneB 12}', '{phase 0}', '{order 1}', '{show All}', '{visor MapPoint}'], 45),
  ['\t{Environment "multi/multi_01"}', '\t; \xe4\xee\xf0\xee\xe3\xe0 cp1251 comment', '\t{Helpers', '\t\t{reinforcements', '\t\t\t{scoreTotal 0}', '\t\t\t{scoreCurrent 0}', '\t\t}',
    '\t\t{zone "circle"', '\t\t\t{position 0 0 0}', '\t\t\t{Name "zone_mid"}', '\t\t\t{Radius 500}', '\t\t}',
    '\t\t{waypoints "grp"', '\t\t\t{"5"', '\t\t\t\t{position -300 400 0}', '\t\t\t\t{radius 80}', '\t\t\t}', '\t\t}',
    '\t\t{triggers', '\t\t\t{"music"', '\t\t\t\t{condition', '\t\t\t\t}', '\t\t\t\t{actions', '\t\t\t\t\t{"delay"', '\t\t\t\t\t\t{time 3}', '\t\t\t\t\t}', '\t\t\t\t}', '\t\t\t}', '\t\t}', '\t}',
    '\t{Players', '\t\t{count 3}', '\t}', '\t{Fog 1}', '}']);
const FIX = crlf(MIL);
// map.net v1: cell 100, 100 x 100 cells, offset 5000 5000, every cell 111 high
const NET = (() => { const b = Buffer.alloc(14 + 100 * 100 * 4); b.writeUInt8(100, 0); b.writeUInt8(1, 1); b.writeInt16LE(100, 2); b.writeInt16LE(100, 4); b.writeFloatLE(5000, 6); b.writeFloatLE(5000, 10);
  for (let i = 0; i < 10000; i++) b.writeInt16LE(111, 14 + i * 4); return b; })();
const GROUND = () => 111;

// ---- the expected text, written out from the report's forms (m6, side 3), names swapped. One line per item.
const MK = '; ARSENAL bots.mission ';
const SIDES = Array.from({ length: 16 }, (_, i) => i + 1);
// btp_t1_3 condition + set_i: the side detection
const FIND = (id, t, z, v) => SIDES.map(s => `{"arsenal:${id}:find${t}${s}" {condition {expression "1 & 2"} {terms {"1.entities" {selector {source advanced} {group {select {zone {zone "${z}"}}} {include {player {player "${s}"}} {prop {prop human}}} {exclude {state {state dead}}}}} {count {op ">"} {value 0}}} {"2.cmp_i" {var "${v}$"} {op "=="} {value 0}}}} {actions {"set_i" {var "${v}$"} {op "="} {value ${s}}}}}`);
// btp_t1_3 actor_to_waypoint
const MOVE = (z, s, w) => `{"actor_to_waypoint" {selector {source advanced} {group {select {zone {zone "${z}"}}} {include {player {player "${s}"}}} {exclude {state {state dead}}}}} {drop orders} {waypoint "${w}"}}`;
const HUMSEL = (z, s) => `{selector {source advanced} {group {select {zone {zone "${z}"}}} {include {player {player "${s}"}} {prop {prop human}}} {exclude {state {state dead}}}}}`;
// btp_t2_3 condition
const ON = (v, s) => `{condition {expression "1"} {terms {"1.cmp_i" {var "${v}$"} {op "=="} {value ${s}}}}}`;
const part = (pre, id, key, name, lines, sum) => [pre + MK + 'begin ' + id + ' ' + key + ' ' + name + (sum ? ' | ' + sum : '')].concat(lines.map(l => pre + l), [pre + MK + 'end ' + id + ' ' + name]).join('\r\n') + '\r\n';
const H = '\t\t', TR = '\t\t\t', EP = '\t';
const ZA = '{zone "circle" {position -2200 -1900 111} {Name "%"} {Radius 900}}', ZB = '{zone "circle" {position 3000 3500 111} {Name "%"} {Radius 900}}';
const ALL = '{zone "circle" {position 0 0 0} {Name "%"} {Radius 12000}}';
const zn = (f, nm) => f.replace('%', nm);
const WANT = {
  a: {
    p: { who: 'b', minute: 1, to: { kind: 'mappoint', name: 'f1' }, every: 30, until: 2 },
    text: part(H, 'a1', 'send', 'helpers', [zn(ZB, 'arsenal_a1_startb'), zn(ALL, 'arsenal_a1_all'), '{waypoints "arsenal_a1" {"9101" {position 1123.87 -1699.98 111} {radius 100}}}', '{vars {"arsenal_a1_teamb"}}']) +
      part(TR, 'a1', 'send', 'triggers', FIND('a1', 'b', 'arsenal_a1_startb', 'arsenal_a1_teamb').concat(SIDES.map(s => `{"arsenal:a1:b${s}" ${ON('arsenal_a1_teamb', s)} {actions {"delay" {time 60}} ${MOVE('arsenal_a1_all', s, '9101')} {"delay" {time 30}} ${MOVE('arsenal_a1_all', s, '9101')} {"delay" {time 30}} ${MOVE('arsenal_a1_all', s, '9101')}}}`)),
      'who=b;min=1;to=mappoint:f1;every=30;until=2'),
  },
  b: {
    p: { who: 'a', zone: { kind: 'zone', name: 'zone_mid' }, seconds: 90 },
    text: part(H, 'b1', 'hold', 'helpers', [zn(ZA, 'arsenal_b1_starta'), '{vars {"arsenal_b1_teama"}}']) +
      part(TR, 'b1', 'hold', 'triggers', FIND('b1', 'a', 'arsenal_b1_starta', 'arsenal_b1_teama').concat(SIDES.map(s => `{"arsenal:b1:a${s}" {condition {expression "1 & 2"} {terms {"1.entities" ${HUMSEL('zone_mid', s)} {count {op ">"} {value 0}}} {"2.cmp_i" {var "arsenal_b1_teama$"} {op "=="} {value ${s}}}}} {actions {"actor_state" ${HUMSEL('zone_mid', s)} {move_mode hold} {fire_mode open}} {"delay" {time 90}} {"actor_state" ${HUMSEL('zone_mid', s)} {move_mode free}}}}`)),
      'who=a;at=zone:zone_mid;sec=90'),
  },
  c: {
    p: { who: 'b', minute: 2, at: { kind: 'waypoint', name: '5' }, units: [{ unit: 'pz4h', n: 2 }], crew: false, then: { kind: 'mappoint', name: 'f1' } },
    // btp_t3 (spawn + set_i) and btp_t3_3 (player on {type vehicle}, keyed on side and spawned$)
    text: part(H, 'c1', 'reinf', 'helpers', [zn(ZB, 'arsenal_c1_startb'), '{zone "circle" {position -300 400 111} {Name "arsenal_c1_drop"} {Radius 200}}',
      '{waypoints "arsenal_c1" {"9101" {position -300 400 115} {radius 100}} {"9102" {position 1123.87 -1699.98 111} {radius 100}}}', '{vars {"arsenal_c1_teamb"} {"arsenal_c1_spawned"}}']) +
      part(TR, 'c1', 'reinf', 'triggers', FIND('c1', 'b', 'arsenal_c1_startb', 'arsenal_c1_teamb').concat(
        ['{"arsenal:c1" {condition} {actions {"delay" {time 120}} {"spawn" {entity "pz4h"} {waypoint "9101"}} {"spawn" {entity "pz4h"} {waypoint "9101"}} {"set_i" {var "arsenal_c1_spawned$"} {op "="} {value 1}}}}'],
        SIDES.map(s => `{"arsenal:c1:b${s}" {condition {expression "1 & 2"} {terms {"1.cmp_i" {var "arsenal_c1_teamb$"} {op "=="} {value ${s}}} {"2.cmp_i" {var "arsenal_c1_spawned$"} {op "=="} {value 1}}}} {actions {"delay" {time 3}} {"player" {selector {zone "arsenal_c1_drop"} {type vehicle}} {player "${s}"}} {"delay" {time 2}} ${MOVE('arsenal_c1_drop', s, '9102')}}}`)),
      'who=b;min=2;units=2x pz4h;at=waypoint:5;then=mappoint:f1'),
  },
  d: {
    p: { minute: 1.5, at: { kind: 'mappoint', name: 'f1' }, shells: 2, spread: 150 },
    text: part(H, 'd1', 'arty', 'helpers', ['{waypoints "arsenal_d1" {"9101" {position 1123.87 -1699.98 111} {radius 150}}}']) +
      part(TR, 'd1', 'arty', 'triggers', ['{"arsenal:d1" {condition} {actions {"delay" {time 90}} {"spawn" {entity "artillery_explosion"} {waypoint "9101"}} {"delay" {time 0.5}} {"spawn" {entity "artillery_explosion"} {waypoint "9101"}}}}'], 'min=1.5;shells=2;at=mappoint:f1'),
  },
  e: {
    p: { who: 'b', unit: 'gaz67b', at: { kind: 'xy', x: 3500, y: 1800 }, minute: 4, amount: 3 },
    // report "Placed" + btp_t2_3 board
    text: part(EP, 'e1', 'board', 'entities', ['{Entity "gaz67b" 0xe2e0 {Position 3500 1800} {Player 0}}', '{Tags "arsenal_e1_veh" 0xe2e0}']) +
      part(H, 'e1', 'board', 'helpers', [zn(ZB, 'arsenal_e1_startb'), zn(ALL, 'arsenal_e1_all'), '{vars {"arsenal_e1_teamb"}}']) +
      part(TR, 'e1', 'board', 'triggers', FIND('e1', 'b', 'arsenal_e1_startb', 'arsenal_e1_teamb').concat(SIDES.map(s => `{"arsenal:e1:b${s}" ${ON('arsenal_e1_teamb', s)} {actions {"delay" {time 240}} {"board" {selector {source advanced} {group {select {zone {zone "arsenal_e1_all"}}} {include {player {player "${s}"}} {prop {prop human}}} {exclude {state {state dead}} {state {state linked}}}} {amount 3}} {vehicle {tag arsenal_e1_veh}}}}}`)),
      'who=b;min=4;n=3;unit=gaz67b;at=xy:3500 1800'),
  },
};

// ---- text work (mi.js)
const plOf = t => Object.assign(MI.placesOf(Buffer.from(t, 'latin1')), { ground: GROUND });
const pl = plOf(FIX);
eq(pl.mapPoints.map(p => p.kind + ':' + p.name + ':' + p.team), ['start:a1:a', 'start:a2:a', 'start:b1:b', 'start:b2:b', 'flag:f1:'], 'places: start points and the flag');
eq([pl.zones.map(z => z.name + ' ' + z.r), pl.waypoints.map(w => w.group + '/' + w.name + ' ' + w.r)], [['zone_mid 500'], ['grp/5 80']], 'places: zones and waypoints');
eq(MI.startAreas(pl, GROUND), { a: { x: -2200, y: -1900, names: ['a1', 'a2'], r: 900, z: 111 }, b: { x: 3000, y: 3500, names: ['b1', 'b2'], r: 900, z: 111 } }, 'start areas: centre of each team\'s start points, radius, ground height');
const errs0 = MI.parse(FIX).errors.length;
ok(errs0 === 0 && MI.spots(FIX).ok && MI.spots(FIX).eol === '\r\n', 'fixture reads clean, the page can add to it (CRLF)');
for (const r of 'abcde') {
  const b = MI.build(r, WANT[r].p, pl, FIX), ins = MI.insert(FIX, b);
  ok(ins.added === WANT[r].text, 'recipe ' + r + ': exact added text (report forms)' + (ins.added === WANT[r].text ? '' : '\n--- got\n' + ins.added.slice(0, 1500) + '\n--- want\n' + WANT[r].text.slice(0, 1500)));
  ok(!/[^\r]\n/.test(ins.text) && /\xe4\xee\xf0\xee\xe3\xe0/.test(ins.text), 'recipe ' + r + ': CRLF only, cp1251 bytes kept');
  ok(ins.added.split('\n').filter(l => /\{player "\d+"\}/.test(l)).every(l => /\{"arsenal:\w+:(find)?[ab]\d+"/.test(l)), 'recipe ' + r + ': a side number only in the per-side copies keyed on the detected side');
  const p = MI.parse(ins.text);
  ok(p.top && p.errors.length === errs0, 'recipe ' + r + ': the result reads with the .mi reader, no new complaints ' + JSON.stringify(p.errors.slice(0, 2)));
  const hel = p.top && p.top.kids.find(k => k.name === 'Helpers'), trg = hel && hel.kids.find(k => k.name === 'triggers');
  ok(trg && trg.kids[0].name === 'music' && trg.kids.length === 1 + b.triggers.length, 'recipe ' + r + ': its triggers sit after the stock one inside {triggers}');
  const pl2 = MI.placesOf(Buffer.from(ins.text, 'latin1'));
  ok(b.made.zones.every(z => pl2.zones.some(x => x.name === z)) && b.made.waypoints.every(w => pl2.waypoints.some(x => x.name === w)), 'recipe ' + r + ': its new zones and waypoints read back as places');
  eq(MI.added(ins.text).map(a => [a.id, a.key, a.parts.join('+')]), [[b.id, b.key, (b.entities.length ? 'entities+' : '') + (b.helpers.length ? 'helpers+' : '') + 'triggers']], 'recipe ' + r + ': listed as this page\'s addition');
  ok(MI.remove(ins.text, b.id).text === FIX, 'recipe ' + r + ': remove gives the very bytes back');
}
// c with a crew: placed men (report T3c), made inactive, copied next to each vehicle, given to the side, then in
{
  const p = { who: 'b', minute: 2, at: { kind: 'mappoint', name: 'f1' }, units: [{ unit: 'pz4h', n: 2 }], crewN: 3 };
  const CO = { crewOf: u => (u === 'pz4h' ? { breed: 'mp/ger/tankman', army: 'ger' } : u === 't34' ? { breed: 'mp/rus/tankman', army: 'rus' } : null) };
  const b = MI.build('c', p, pl, FIX, CO), t = MI.insert(FIX, b).added;
  eq(b.entities.filter(l => /^\{Human /.test(l)), ['{Human "mp/ger/tankman" 0xe2e0 {Position 1123.87 -1699.98} {Player 0}}', '{Human "mp/ger/tankman" 0xe2e1 {Position 1123.87 -1699.98} {Player 0}}', '{Human "mp/ger/tankman" 0xe2e2 {Position 1123.87 -1699.98} {Player 0}}'], 'c crew: three placed men of the tank\'s own army (report Placed form)');
  eq(b.crew, [{ breed: 'mp/ger/tankman', army: 'ger', units: ['pz4h'] }], 'c crew: the crew said back (breed, army, vehicles)');
  thr(() => MI.build('c', p, pl, FIX), 'bots.mission.e.nocrew', 'c crew: no crew table, no crew: refused, never another army\'s men');
  thr(() => MI.build('c', Object.assign({}, p, { units: [{ unit: 'nocard', n: 1 }] }), pl, FIX, CO), 'bots.mission.e.nocrew', 'c crew: a vehicle with no known army is refused');
  const mx = MI.build('c', Object.assign({}, p, { units: [{ unit: 'pz4h', n: 1 }, { unit: 't34', n: 1 }] }), pl, FIX, CO), mxt = MI.insert(FIX, mx);
  eq(mx.crew.map(g => g.breed + ' ' + g.army), ['mp/ger/tankman ger', 'mp/rus/tankman rus'], 'c crew: two armies, two crews');
  ok(mx.entities.some(l => /^\{Tags "arsenal_c1_crew2" /.test(l)) && /arsenal_c1_crew2\}\} \{inactive on\}/.test(mxt.added), 'c crew: each crew its own tag, both made inactive ' + mxt.added.slice(0, 0));
  ok(MI.parse(mxt.text).errors.length === errs0 && MI.remove(mxt.text, 'c1').text === FIX, 'c crew: two crews read clean and remove to the very bytes');
  ok(b.entities.filter(l => l === '{Tags "arsenal_c1_crew" 0xe2e0}' || l === '{Tags "arsenal_c1_crew" 0xe2e1}' || l === '{Tags "arsenal_c1_crew" 0xe2e2}').length === 3, 'c crew: each man tagged');
  ok(t.includes('{"arsenal:c1:crew" {condition} {actions {"entity_state" {selector {tag arsenal_c1_crew}} {inactive on}}}}'), 'c crew: inactive at the start (report btp_tpl)');
  ok(t.includes('{"waypoint" {who {type actor} {actors {tag arsenal_c1_crew}}} {action {type start} {waypoint "9101"} {clone} {make_squad} {approach "safe teleport & rotate"}}}'), 'c crew: the report T3c clone form');
  ok(t.includes('{"player" {selector {zone "arsenal_c1_v1"} {type human}} {player "3"}}') && t.includes('{"player" {selector {zone "arsenal_c1_v2"} {type vehicle}} {player "3"}}'), 'c crew: each vehicle and its men to the side (btp_t3_3 form)');
  ok(t.includes('{"board" {selector {zone "arsenal_c1_v1"} {type human}} {vehicle {zone "arsenal_c1_v1"} {type vehicle}}}'), 'c crew: the men get in their own vehicle');
  ok(t.includes('{"spawn" {entity "pz4h"} {waypoint "9101"}} {"spawn" {entity "pz4h"} {waypoint "9102"}}'), 'c crew: one spawn point per vehicle');
  ok(b.p.crew === '3' && MI.remove(MI.insert(FIX, b).text, 'c1').text === FIX && MI.parse(MI.insert(FIX, b).text).errors.length === errs0, 'c crew: summary, reads clean, removes to the very bytes');
  thr(() => MI.build('c', Object.assign({}, p, { units: [{ unit: 'pz4h', n: 11 }] }), pl, FIX, CO), 'bots.mission.e.units', 'c crew: over 10 vehicles refused');
  ok(MI.build('c', Object.assign({}, p, { crew: false, units: [{ unit: 'pz4h', n: 20 }, { unit: 'tiger', n: 20 }] }), pl, FIX).id === 'c1', 'c without a crew: 40 allowed');
}
// all five in one file, then out again in another order; ids go on per letter
let all = FIX; const SEQ = {};   // one after the other in one file: waypoint names go on (9101, 9102..)
for (const r of 'abcde') { const i = MI.insert(all, MI.build(r, WANT[r].p, plOf(all), all)); SEQ[r] = i.added; all = i.text; }
ok(SEQ.a === WANT.a.text && SEQ.b === WANT.b.text && SEQ.e === WANT.e.text, 'in one file: a, b and e add the same text as alone');
const b2 = MI.build('a', WANT.a.p, plOf(all), all); ok(b2.id === 'a2' && b2.made.zones[0] === 'arsenal_a2_startb', 'a second send gets id a2 and its own zones');
ok(MI.parse(all).errors.length === errs0, 'five additions read clean');
const wpNames = MI.placesOf(Buffer.from(all, 'latin1')).waypoints.map(w => w.name);
ok(new Set(wpNames).size === wpNames.length, 'no waypoint name twice across additions ' + wpNames.join(','));
let back = all; for (const id of ['b1', 'e1', 'd1', 'a1', 'c1']) back = MI.remove(back, id).text;
ok(back === FIX, 'removing all five out of order gives the very bytes back');
ok(MI.remove(all, 'a9').removed === 0, 'remove of an unknown id removes nothing');
thr(() => MI.remove(all.replace(MK + 'end b1 triggers', '; edited'), 'b1'), 'bots.mission.e.markbroken', 'a hand-edited end marker is refused');
// input checks
thr(() => MI.build('a', Object.assign({}, WANT.a.p, { who: 'x' }), pl, FIX), 'bots.mission.e.who', 'a: an unknown team refused');
thr(() => MI.build('c', Object.assign({}, WANT.c.p, { who: 'ab' }), pl, FIX), 'bots.mission.e.who', 'c: both teams refused (one bot gets the vehicles)');
thr(() => MI.build('a', Object.assign({}, WANT.a.p, { until: 1 }), pl, FIX), 'bots.mission.e.until', 'a: stop before the first order refused');
thr(() => MI.build('b', Object.assign({}, WANT.b.p, { zone: { kind: 'zone', name: 'nope' } }), pl, FIX), 'bots.mission.e.noplace', 'b: unknown zone refused');
thr(() => MI.build('c', Object.assign({}, WANT.c.p, { units: [{ unit: 'pz"4', n: 1 }] }), pl, FIX), 'bots.mission.e.unit', 'c: a quote in a unit name refused');
thr(() => MI.build('e', Object.assign({}, WANT.e.p, { unit: '' }), pl, FIX), 'bots.mission.e.novehicle', 'e: no vehicle refused');
thr(() => MI.build('b', Object.assign({}, WANT.b.p, { seconds: 'x' }), pl, FIX), 'bots.mission.e.range', 'b: a bad number refused');
const noB = FIX.replace('{team b}', '{team c}').replace('{team b}', '{team c}');
thr(() => MI.build('a', WANT.a.p, plOf(noB), noB), 'bots.mission.e.nostartB', 'a: no team b start points refused');
thr(() => MI.insert(FIX.replace('\t\t{triggers', '\t\t{tr1ggers'), MI.build('b', WANT.b.p, pl, FIX)), 'bots.mission.e.notriggers', 'no {triggers}: refused');
thr(() => MI.insert(FIX.replace('\t\t{triggers\r\n', '\t\t{reinf2} {triggers\r\n'), MI.build('b', WANT.b.p, pl, FIX)), 'bots.mission.e.layout', '{triggers not on its own line: refused');

// ---- routes on a made-up AS2 folder (milint runs for real through runTool)
const game = path.join(work, 'game'), GR = (...p) => path.join(game, 'resource', ...p);
W(path.join(game, 'as64.exe'), '');
W(GR('map', 'multi', 'tm', 'combat.mi'), FIX);
W(GR('map', 'multi', 'tm', 'map.net'), NET);
W(GR('map', 'multi', 'tm', 'map.info'), crlf([';SDL', '{game {maxPlayers 4}}']));
W(GR('map', 'multi', 'tm', 'battle_zones.mi'), FIX);   // a mode bots can play (flags); combat has none (MIS-65)
W(GR('set', 'multiplayer', 'games', 'combat.set'), crlf(['{game', '\t{settings', '\t\t{enableBots}', '\t}', '}']));
W(GR('set', 'multiplayer', 'games', 'battle_zones.set'), crlf(['{game', '\t{settings', '\t\t{enableBots}', '\t}', '}']));
W(GR('script', 'multiplayer', 'bot.data.lua'), crlf(['MaxSquadSize = 5', 'OrderRotationPeriod = 3 * 60 * 1000 -- 3min (ms)']));
// buy cards and soldiers of five armies (stock forms: the v / vs crew macros, a content line, a card with no crew named)
W(GR('set', 'multiplayer', 'units', 'vehicles_ger.set'), crlf(['{"pz4h" ("v" 2 2) s(ger)}']));
W(GR('set', 'multiplayer', 'units', 'vehicles_rus.set'), crlf(['{"t34" ("v" 2 2) s(rus)}', '{"gaz67b" ("v" 1 0) s(rus)}']));
W(GR('set', 'multiplayer', 'units', 'vehicles_eng.set'), crlf(['{"cromwell" {content "* ( mp/%s/tankman:2 mp/%s/tankman2:2)"}}']));   // army from the file name
W(GR('set', 'multiplayer', 'units', 'vehicles_usa.set'), crlf(['{"m8" s(usa)}']));   // no crew named: the army's rifleman
W(GR('set', 'multiplayer', 'units', 'vehicles_jap.set'), crlf(['{"chiha" ("vs" 2)}']));
W(GR('set', 'multiplayer', 'units', 'units_x.set'), crlf(['{"helper_tank" ("v" 1 1) s(ger)}']));   // a helper file (x), no army
W(GR('set', 'multiplayer', 'units', 'soldiers.set'), crlf([].concat(...['eng', 'ger', 'jap', 'rus', 'usa'].map(a => ['tankman', 'tankman2', 'vehicle_supporter', 'rifle', 'rifle2'].map(b => '{"mp/' + a + '/' + b + '" ("i" 1)}')))));
const mod = path.join(game, 'mods', 'my_mod'); modInfo(mod);
W(path.join(mod, 'mod.info'), crlf(['{Mod', '\t{Name "my_mod"}', '\t{MinGameVersion "3.262.0"}', '\t{MaxGameVersion "3.400.0"}', '}']));
const runTool = async (tool, entry, args) => { const r = cp.spawnSync(process.execPath, [path.join(T, entry)].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env, { TEMP: work, TMP: work, TMPDIR: work }) }); return { code: r.status, stdout: r.stdout, stderr: r.stderr, timedOut: false }; };
const ctx = { game: () => game, gamedir: game, allowLaunch: false, tools: T, tmpRoot: work, runTool };
const modMi = path.join(mod, 'resource', 'map', 'multi', 'tm', 'battle_zones.mi'), modRes = path.join(mod, 'resource');
const proofF = path.join(work, 'proof.json');
const setProof = o => W(proofF, JSON.stringify(o));
const B = { mod, map: 'map/multi/tm', mode: 'battle_zones' };

(async () => {
  X._t.proofAt(proofF); setProof({ proven: true, scriptPlacedOnly: false, note: 'plan/reports/bot-trigger-proof.md' });
  // the map list: the Maps page's list (stubbed here, it needs mission-clone) + the mod's maps; only maps with a mission, the game's names
  const MAPS = require(path.join(T, 'gui', 'ext', 'maps')), MISS = require(path.join(T, 'gui', 'ext', 'missions'));
  const keep = [MAPS.routes['GET /api/x/maps/list'], MISS.routes['GET /api/x/missions/mine']];
  MAPS.routes['GET /api/x/maps/list'] = async () => ({ state: 'done', maps: [{ key: 'map/multi/tm', folder: 'tm', name: 'Test Map 2x2', modes: ['battle_zones', 'combat'], players: 4, mods: [] }, { key: 'map/multi/nomi', folder: 'nomi', name: 'No Mission', modes: [], players: 2, mods: [] },
    { key: 'map/multi/2v2_kursk_a', folder: '2v2_kursk_a', name: '2v2 Kursk A', modes: ['battle_zones'], players: 4, mods: ['my_mod'] }, { key: 'map/multi/om', folder: 'om', name: 'Other Mod Map', modes: ['battle_zones'], players: 2, mods: ['other mod'] },
    { key: 'map/multi/1v1_sp ace', folder: '1v1_sp ace', name: 'Space', modes: ['battle_zones'], players: 2, mods: [] }] });
  W(path.join(mod, 'resource', 'interface', 'text', 'mission.lng'), crlf(['{"2v2_kursk_a" {"name" "Prokhorovka"}}']));   // the mod names its own map
  MISS.routes['GET /api/x/missions/mine'] = async () => ({ maps: [{ key: 'map/multi/tm', folder: 'tm', name: 'tm', modes: ['combat'], mine: true }] });
  const ml0 = await R['GET /api/x/bots/mission/maps'](U({ mod }), null, ctx);
  eq(ml0.maps.map(m => [m.key, m.name, m.folder, m.modes.join()]), [['map/multi/tm', 'Test Map 2x2', 'tm', 'battle_zones,combat'], ['map/multi/2v2_kursk_a', 'Prokhorovka', '2v2_kursk_a', 'battle_zones']],
    'maps: only maps with a mission, of the game, the picked mod (and the mods it requires); the name the game or the mod gives');
  ok(ml0.other === 1 && /prokhorovka/.test(ml0.maps[1].words) && /kursk/.test(ml0.maps[1].words) && /2v2 kursk a/.test(ml0.maps[1].words), 'maps: a map of another mod is left out and counted; the name and folder are searched ' + JSON.stringify([ml0.other, ml0.maps[1] && ml0.maps[1].words]));
  fs.rmSync(modRes, { recursive: true, force: true });
  [MAPS.routes['GET /api/x/maps/list'], MISS.routes['GET /api/x/missions/mine']] = keep;

  // S16: the page opens on a mode bots can play; combat (no flags) is marked and refused
  const f0 = await R['GET /api/x/bots/mission/facts'](U({ mod, map: 'map/multi/tm' }), null, ctx);
  ok(f0.mode === 'battle_zones' && f0.modes.slice().sort().join() === 'battle_zones,combat', 'facts: the default mode is one bots can play ' + JSON.stringify([f0.mode, f0.modes]));
  eq(Object.fromEntries(Object.entries(f0.modeInfo).sort()), { battle_zones: { join: true, why: 'ok' }, combat: { join: false, why: 'combat' } }, 'facts: which modes bots can join');
  ok(X._t.firstMode(['combat', 'battle_zones'], f0.modeInfo) === 'battle_zones', 'firstMode skips combat');
  await throwsMsg(() => R['POST /api/x/bots/mission/add'](null, Object.assign({ items: [{ recipe: 'd', p: WANT.d.p }], write: false }, B, { mode: 'combat' }), ctx), 'bots.mission.e.combat', 'add: a combat match (no flags) is refused before anything is built');
  // the crew of the vehicle's own army, for each of five armies (the buy cards and soldiers of the made-up game)
  const ct = X._t.crewTable(ctx, mod);
  for (const [u, want] of [['pz4h', 'mp/ger/tankman ger'], ['t34', 'mp/rus/tankman rus'], ['cromwell', 'mp/eng/tankman eng'], ['m8', 'mp/usa/rifle usa'], ['chiha', 'mp/jap/vehicle_supporter jap']]) {
    const c = ct(u); ok(c && c.breed + ' ' + c.army === want, 'crew table ' + u + ': ' + want + ' (got ' + JSON.stringify(c) + ')');
  }
  ok(ct('nocard') === null, 'crew table: a unit with no card has no crew');
  const cv = await R['POST /api/x/bots/mission/add'](null, Object.assign({ items: [{ recipe: 'c', p: { who: 'b', at: { kind: 'mappoint', name: 'f1' }, units: [{ unit: 'pz4h', n: 1 }, { unit: 't34', n: 1 }, { unit: 'chiha', n: 1 }], crewN: 2 } }], write: false }, B), ctx);
  eq(cv.items[0].crew.map(g => g.breed), ['mp/ger/tankman', 'mp/rus/tankman', 'mp/jap/vehicle_supporter'], 'add: each vehicle gets a crew of its own army (ger, rus, jap)');
  ok(!/usa\/rifle2/.test(cv.items[0].text) && cv.join && cv.join.join === true, 'add: no USA men in a German tank; the mode answer rides along');
  await throwsMsg(() => R['POST /api/x/bots/mission/add'](null, Object.assign({ items: [{ recipe: 'c', p: { who: 'b', at: { kind: 'mappoint', name: 'f1' }, units: [{ unit: 'nocard', n: 1 }] } }], write: false }, B), ctx), 'bots.mission.e.nocard', 'add: a vehicle with no buy card is refused at Preview (S17)');
  ok(cv.items[0].crew[0].armyName === 'Germany', 'add: the crew says its army by name ' + JSON.stringify(cv.items[0].crew[0]));
  const un0 = await R['GET /api/x/bots/mission/units'](U({ mod }), null, ctx), pzU = un0.units.find(u => u.unit === 'pz4h');
  ok(!un0.units.some(u => u.unit === 'helper_tank') && pzU && pzU.armyNames.join() === 'Germany' && !un0.units.some(u => u.armies.some(a => /^x/.test(a))), 'units: helper files (x) are no army; armies by name ' + JSON.stringify(pzU));
  await throwsMsg(() => R['POST /api/x/bots/mission/add'](null, Object.assign({ items: [{ recipe: 'd', p: { minute: 2, at: { kind: 'xy', x: '', y: '40' } } }], write: false }, B), ctx), 'bots.mission.e.noxy', 'add: empty coordinates have their own refusal');
  await throwsMsg(() => R['POST /api/x/bots/mission/add'](null, Object.assign({ items: [{ recipe: 'd', p: { minute: 999, at: { kind: 'mappoint', name: 'f1' } } }], write: false }, B), ctx), 'bots.mission.e.range', 'add: a number out of range names its field');

  const f = await R['GET /api/x/bots/mission/facts'](U(B), null, ctx);
  ok(f.mode === 'battle_zones' && f.players === 4 && f.own === false && f.file === 'resource/map/multi/tm/battle_zones.mi' && f.canAdd === '', 'facts: mode, players, the game\'s file, can add ' + JSON.stringify([f.mode, f.players, f.own, f.file, f.canAdd, f.none]));
  ok(f.ground === true && f.areas.a.z === 111 && f.areas.b.r === 900, 'facts: start areas with the ground from map.net ' + JSON.stringify(f.areas));
  eq((f.recipes || []).map(r => r.id + (r.off ? '-' : '+') + (r.move ? 'm' : '') + (r.bot ? 'b' : '')), ['a+mb', 'b+mb', 'c+', 'd+', 'e+b'], 'facts: five recipes on; a, b move');
  ok(f.recipes.every(r => /\[V/.test(r.src)), 'facts: each recipe names its source and tag');
  ok(f.rotation && f.rotation.ms === 180000 && f.rotation.from === 'game', 'facts: OrderRotationPeriod from the game, 3 min ' + JSON.stringify(f.rotation));
  ok(f.proof.proven === true, 'facts: proof read');
  // preview writes nothing; the text is the same as the hand-written one (ground from map.net)
  const items = 'abcde'.split('').map(r => ({ recipe: r, p: WANT[r].p }));
  const pv = await R['POST /api/x/bots/mission/add'](null, Object.assign({ items, write: false }, B), ctx);
  ok(pv.ok && pv.copies === true && pv.items.length === 5 && !fs.existsSync(modMi), 'preview: five items, will copy, nothing written');
  'abcde'.split('').forEach((r, i) => { const a = pv.items[i].text, w = SEQ[r]; let k = 0; while (k < a.length && a[k] === w[k]) k++;
    ok(a === w, 'preview ' + r + ': the exact text (ground from map.net); first difference: ' + JSON.stringify(a.slice(Math.max(0, k - 60), k + 60)) + ' want ' + JSON.stringify(w.slice(Math.max(0, k - 60), k + 60))); });
  await throwsMsg(() => R['POST /api/x/bots/mission/add'](null, Object.assign({ items: [items[0], items[0]], write: false }, B), ctx), 'bots.mission.e.recipe', 'the same recipe twice is refused');
  await throwsMsg(() => R['POST /api/x/bots/mission/add'](null, Object.assign({ items: [], write: false }, B), ctx), 'bots.mission.e.none', 'nothing ticked is refused');
  // write: copy + add, milint for real
  ok(!fs.existsSync(modRes), 'the mod has no resource folder yet');
  const wr = await R['POST /api/x/bots/mission/add'](null, Object.assign({ items, write: true }, B), ctx);
  const got = fs.existsSync(modMi) ? fs.readFileSync(modMi) : Buffer.alloc(0);
  ok(wr.ok && got.toString('latin1') === all, 'write: the mod copy = the game\'s file + the five additions, byte for byte');
  ok(wr.undo && wr.undo.copied === true && wr.undo.made === 'resource' && wr.undo.ids.join() === 'a1,b1,c1,d1,e1', 'write: an undo token (copied, the folders it made) ' + JSON.stringify(wr.undo));
  ok(wr.lint && wr.lint.ran === true && !wr.lint.na, 'write: milint ran ' + JSON.stringify(wr.lint && { ran: wr.lint.ran, na: wr.lint.na, why: wr.lint.why }));
  ok(wr.lint && wr.lint.findings.length === 0, 'write: milint finds nothing in the file ' + JSON.stringify(wr.lint && wr.lint.findings.slice(0, 4)));
  const mlo = await runTool('milint', 'milint/milint.js', [mod, '--game', game]);
  const mlines = String(mlo.stdout || '').split(/\r?\n/).filter(l => /battle_zones\.mi/i.test(l) && /\b(WARN_)?(MI|MIS|MC)_/.test(l));
  ok(mlines.length === 0, 'milint over the mod: no mission line for battle_zones.mi ' + mlines.slice(0, 3).join(' | '));
  W(modMi, all.replace('{waypoint "9101"}', '{waypoint "nope"}'));   // milint is not blind to this file: a seeded bad waypoint is found
  ok(/battle_zones\.mi:\d+: WARN_MI_WAYPOINT_REF/.test((await runTool('milint', 'milint/milint.js', [mod, '--game', game])).stdout), 'milint sees a seeded bad waypoint in the file');
  // the crewed c (placed men, entity_state, clone, board by zone) reads clean with milint too
  const crewText = MI.insert(FIX, MI.build('c', { who: 'b', at: { kind: 'mappoint', name: 'f1' }, units: [{ unit: 'pz4h', n: 2 }], crewN: 3 }, pl, FIX, { crewOf: u => (u === 'pz4h' ? { breed: 'mp/ger/tankman', army: 'ger' } : null) })).text;
  W(modMi, crewText);
  const mlc = String((await runTool('milint', 'milint/milint.js', [mod, '--game', game])).stdout || '').split(/\r?\n/).filter(l => /battle_zones\.mi/i.test(l) && /\b(WARN_)?(MI|MIS|MC)_/.test(l));
  ok(mlc.length === 0, 'milint: the crewed reinforcement form is clean ' + mlc.slice(0, 3).join(' | '));
  // Undo refuses a file changed since the write, then gives back the bytes and folders from before
  await throwsMsg(() => R['POST /api/x/bots/mission/undo'](null, Object.assign({ undo: wr.undo }, B), ctx), 'bots.mission.e.changed', 'undo: a file changed since the write is refused');
  W(modMi, all);
  const un = await R['POST /api/x/bots/mission/undo'](null, Object.assign({ undo: wr.undo }, B), ctx);
  ok(un.ok && un.deleted === true && !fs.existsSync(modMi) && !fs.existsSync(modRes), 'undo after a copy: the copy and the folders it made are gone ' + JSON.stringify(un));
  await throwsMsg(() => R['POST /api/x/bots/mission/undo'](null, Object.assign({ undo: wr.undo }, B), ctx), 'bots.mission.e.changed', 'undo twice is refused');
  await throwsMsg(() => R['POST /api/x/bots/mission/undo'](null, Object.assign({ undo: { ids: ['../x'] } }, B), ctx), 'bots.mission.e.noundo', 'a bad undo token is refused');
  // the mod has its own copy (with a byte of its own): a write and its undo give the very bytes back
  const own = Buffer.from(FIX.replace('{Fog 1}', '{Fog 2}'), 'latin1'); W(modMi, own);
  const w2 = await R['POST /api/x/bots/mission/add'](null, Object.assign({ items: [items[1], items[4]], write: true }, B), ctx);
  ok(w2.copies === false && w2.undo.copied === false && w2.undo.made === '', 'write into the own copy: no copy, no new folder');
  const un2 = await R['POST /api/x/bots/mission/undo'](null, Object.assign({ undo: w2.undo }, B), ctx);
  ok(un2.deleted === false && fs.readFileSync(modMi).equals(own), 'undo on the own copy: the very bytes from before');
  // remove one by one: the last one deletes the copy (the game's bytes again)
  fs.rmSync(modRes, { recursive: true, force: true });
  await R['POST /api/x/bots/mission/add'](null, Object.assign({ items, write: true }, B), ctx);
  const f2 = await R['GET /api/x/bots/mission/facts'](U(B), null, ctx);
  eq((f2.added || []).map(a => a.id), ['a1', 'b1', 'c1', 'd1', 'e1'], 'facts after write: own copy lists the five additions');
  const wr2 = await R['POST /api/x/bots/mission/add'](null, Object.assign({ items: [items[1]], write: false }, B), ctx);
  ok(wr2.copies === false && wr2.items[0].id === 'b2', 'second preview: into the own copy, id b2');
  let last = null;
  for (const id of ['c1', 'a1', 'e1', 'd1']) { last = await R['POST /api/x/bots/mission/remove'](null, Object.assign({ id, write: true }, B), ctx); ok(last.deleted === false && /begin \w+ \w+ triggers/.test(last.removed), 'remove ' + id + ': the copy stays, the removed lines come back'); }
  last = await R['POST /api/x/bots/mission/remove'](null, Object.assign({ id: 'b1', write: true }, B), ctx);
  ok(last.sameAsGame === true && last.deleted === true && !fs.existsSync(modMi), 'remove the last: the copy is the game\'s file again and is deleted');
  await throwsMsg(() => R['POST /api/x/bots/mission/remove'](null, Object.assign({ id: 'a1', write: true }, B), ctx), 'bots.mission.e.noid', 'remove of a gone addition is refused');
  await throwsMsg(() => R['POST /api/x/bots/mission/remove'](null, Object.assign({ id: '../x', write: true }, B), ctx), 'bots.mission.e.noid', 'a bad id is refused');
  // proof.json switches
  setProof({ proven: true, scriptPlacedOnly: true, note: 'only placed' });
  const f3 = await R['GET /api/x/bots/mission/facts'](U(B), null, ctx);
  eq(f3.recipes.map(r => r.id + (r.off ? '-' : '+')), ['a-', 'b-', 'c+', 'd+', 'e-'], 'proof scriptPlacedOnly: only c and d are offered');
  ok(f3.proof.note === 'only placed', 'proof: the note reaches the page');
  await throwsMsg(() => R['POST /api/x/bots/mission/add'](null, Object.assign({ items: [items[0]], write: false }, B), ctx), 'bots.mission.offScript', 'proof scriptPlacedOnly: a move recipe is refused');
  setProof({ proven: false, scriptPlacedOnly: false, note: '' });
  ok(X._t.proof().proven === false, 'proof off');
  fs.rmSync(proofF); ok(X._t.proof().proven === false, 'no proof file: not proven');
  const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, 'proof.json'), 'utf8'));
  // the run reports are left out of the public copy on purpose and the note naming one is replaced there: the name is checked in the source tree
  const hasPlan = fs.existsSync(path.join(__dirname, '..', '..', '..', '..', '..', '..', 'plan'));
  if (!hasPlan) console.log('skip shipped proof.json report name: the run reports are not in this copy (left out of the public copy on purpose)');
  ok(shipped.proven === true && shipped.scriptPlacedOnly === false && (hasPlan ? /bot-trigger-proof/.test(shipped.note) : typeof shipped.note === 'string' && shipped.note.trim() !== ''), 'shipped proof.json: proven by plan/reports/bot-trigger-proof.md ' + shipped.note);
  setProof(shipped);
  // a missing mode file; a bad map key
  // GoH: read only. Facts read on (readOnly set), every write route is refused with its line before anything is read or written
  {
    const gctx = Object.assign({}, ctx, { gameId: () => 'goh', curDir: () => game });
    let fg = null, fe = null; try { fg = await R['GET /api/x/bots/mission/facts'](U(B), null, gctx); } catch (e) { fe = e; }
    ok(!fe || String(fe.message).split(' ')[0] !== 'bots.mission.e.goh', 'GoH: facts are not refused as a game (' + (fe ? fe.message : 'ok') + ')');
    if (fg) ok(fg.readOnly === true && fg.game === 'goh', 'GoH: facts say read only');
    ok(fs.existsSync(gctx.curDir()), 'GoH ctx has a folder');
    await throwsMsg(() => R['POST /api/x/bots/mission/add'](null, Object.assign({ items: [items[0]], write: false }, B), gctx), 'bots.mission.e.goh', 'GoH: preview refused');
    await throwsMsg(() => R['POST /api/x/bots/mission/add'](null, Object.assign({ items: [items[0]], write: true }, B), gctx), 'bots.mission.e.goh', 'GoH: write refused');
    await throwsMsg(() => R['POST /api/x/bots/mission/remove'](null, Object.assign({ id: 'a1', write: true }, B), gctx), 'bots.mission.e.goh', 'GoH: remove refused');
    await throwsMsg(() => R['POST /api/x/bots/mission/undo'](null, Object.assign({ undo: { ids: ['a1'], after: 'a'.repeat(40), before: 'b'.repeat(40) } }, B), gctx), 'bots.mission.e.goh', 'GoH: undo refused');
  }
  const fn = await R['GET /api/x/bots/mission/facts'](U({ mod, map: 'map/multi/tm', mode: 'frontline' }), null, ctx);
  ok(fn.none === 'bots.mission.e.nomi', 'a mode with no .mi says so');
  await throwsMsg(() => R['GET /api/x/bots/mission/facts'](U({ mod, map: '../x', mode: 'combat' }), null, ctx), 'maps.e.pickmap', 'a bad map key is refused');
  W(path.join(mod, 'resource', 'script', 'multiplayer', 'bot.data.lua'), crlf(['OrderRotationPeriod = 10 * 60 * 1000']));
  const rm = X._t.rotation(ctx, mod); ok(rm.ms === 600000 && rm.from === 'mod', 'rotation: the mod\'s value ' + JSON.stringify(rm));
  fs.rmSync(modRes, { recursive: true, force: true });

  // ---- the client in the fake DOM
  const fakedom = require(path.join(T, 'gui', 'test', 'fakedom')), doc = fakedom.make();
  const hs = /^function h\(.*(?:\n .*)*/m.exec(fs.readFileSync(path.join(T, 'gui', 'page.js'), 'utf8'))[0], h = new Function('document', hs + '\nreturn h;')(doc);
  const missing = new Set(), P = 'bots.mission.';
  const tx = (k, p) => { if (!(k in EN)) { if (/^bots\.mission\./.test(k)) missing.add(k); return k; } return EN[k].replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? String(p[x]) : m)); };
  // the page's own text: button and block names filled in from their keys (the test's tx gives a key it does not know back as is)
  const AUTO = { prev: 'bots.btn.preview', write: 'bots.btn.write', undo: 'bots.btn.undo', more: 'bots.more', details: 'bots.details', remove: EN[P + 'mine.rm'], added: EN[P + 'mine.blk'],
    onmap: EN[P + 'place.onMap'], modeready: 'bots.modeready.title', botmatch: EN[P + 'done.try'], crew: EN[P + 'c.crew'], etitle: EN[P + 'e.title'],
    orders: EN[P + 'orders.h'], goh: 'Gates of Hell', as2: 'Men of War: Assault Squad 2', g64: 'AS64' };
  const tt = (k, p) => tx(P + k, Object.assign({}, AUTO, p || {}));
  const kits = [], pend = [], went = [], shown = [], orphans = [], asks = [], picks = [], changes = [];
  const S = { screens: { mapviz: { pick: k => shown.push('pick:' + k) } } };
  const FAKEPICK = { open: o => picks.push(o) };   // the Map Viewer's place picker (tools/gui/ext/mapviz): records what the page asks
  const sb = { BOTS_PARTS: [], h, tx, S, document: doc, console, MAPVIZ_PICK: FAKEPICK, setTimeout: (fn2) => { pend.push(Promise.resolve().then(fn2)); return 0; },
    // like the real kit: it puts its Browse button next to the input, so the input must already sit in the page
    searchKit: (inp, o) => { if (!inp.parentNode) orphans.push(o.key); kits.push({ inp, o }); }, askDo: o => { asks.push(o); return { then: cb => cb(true) }; },
    show: (id, a) => shown.push(id + (a ? '|' + a : '')), confirm: () => true };
  const vm = require('vm'); vm.createContext(sb); vm.runInContext(X.script, sb, { filename: 'mission/client.js' });
  ok(sb.BOTS_PARTS.length === 1 && sb.BOTS_PARTS[0].id === 'mission' && sb.BOTS_PARTS[0].group === 'E' && sb.BOTS_PARTS[0].title() === EN['bots.mission.title'], 'client: one part, id, group, title');
  // the Bots page's answer which modes bots can play (GET modeready/botmodes, the shape the route gives)
  const BM_OK = { gid: 'as64', kind: 'as2', modes: [{ mode: 'battle_zones', name: 'Battle Zones', bots: true, orders: true }, { mode: 'combat', name: 'Combat', bots: true, orders: false }], play: ['battle_zones'], best: 'battle_zones' };
  const BM_OFF = { gid: 'as64', kind: 'as2', modes: [{ mode: 'battle_zones', name: 'Battle Zones', bots: false, orders: true }, { mode: 'combat', name: 'Combat', bots: true, orders: false }], play: [], best: '' };
  let BMV = BM_OK, factsN = 0, EMPTY = false;
  const kitStub = () => ({
    leaf: (id, kids, name) => h('div', name ? { blk: id, 'data-blkname': name } : { blk: id }, kids),
    hint: (id, t) => h('div', { blk: id }, [h('div', { class: 'hint', text: t })]),
    section: (id, title, kids) => h('div', { class: 'card', blk: id, box: 'col', 'data-blkname': title }, [h('div', { blk: id + '.title' }, [h('h3', { text: title })])].concat(kids)),
    errBox: msg => h('div', { class: 'err', text: msg }),
    qs: o => new URLSearchParams(o).toString(),
    hitsOf: (list, s, done) => { s = String(s || '').toLowerCase(); const a = list.filter(it => it.lo.indexOf(s) >= 0); done(a.slice(0, 30), Math.max(0, a.length - 30)); },
    editor: () => ({ el: h('div'), load() {} }),
    details: (id, kids) => h('details', { blk: id }, [h('summary', { text: 'bots.details' })].concat(kids)),
    more: (id, kids) => h('details', { blk: id }, [h('summary', { text: 'bots.more' })].concat(kids)),
    na: (id, o) => h('div', { blk: id, class: 'na', text: typeof o === 'object' ? 'NA ' + o.game + ': ' + o.why + '. USE: ' + o.use : String(o) }),
    changed: (what, from) => { changes.push(what + '|' + (from && typeof from === 'object' ? 'el' : from)); return 0; },
    // the kit's green box: title, lines, how to see it, next steps, Undo (box goes, then onUndo)
    done: (id, o) => { const box = h('div', { class: 'ok', blk: id }, [h('b', { text: o.title }), h('ul', {}, o.lines.map(s => h('li', { text: s }))), h('div', { class: 'see', text: o.see })]);
      (o.next || []).forEach(nx => box.appendChild(h('button', { type: 'button', text: nx.text, onclick: () => went.push(nx.go) })));
      box.appendChild(h('button', { type: 'button', text: 'bots.btn.undo', onclick: () => o.undo().then(r => { box.remove(); if (o.onUndo) o.onUndo(r); changes.push('undo|el'); }, e => box.appendChild(h('div', { class: 'err', text: e.message }))) }));
      return box; },
  });
  const env = (gid, m, c) => ({
    mod: m, gid, reload() {}, go: id => went.push(id),
    api(method, p, data, cb) {
      if (p === 'mission/units') { pend.push(Promise.resolve().then(() => cb(null, { units: [{ unit: 'gaz67b', name: 'GAZ-67B', armies: ['rus'], armyNames: ['Russia'] }, { unit: 'pz4h', name: 'Pz.Kpfw. IV H', armies: ['ger'], armyNames: ['Germany'] }] }))); return; }
      if (p === 'mission/maps') { pend.push(Promise.resolve().then(() => cb(null, ml0))); return; }
      if (p === 'modeready/botmodes') { const v = BMV; pend.push(Promise.resolve().then(() => (v ? cb(null, v) : cb('bots.e.noroute')))); return; }
      const key = method + ' /api/x/bots/' + p.split('?')[0];
      if (!R[key]) { pend.push(Promise.resolve().then(() => cb('bots.e.noroute'))); return; }
      if (p === 'mission/facts') factsN++;
      const emptied = j => (p === 'mission/facts' && EMPTY ? Object.assign({}, j, { places: {} }) : j);
      pend.push((method === 'GET' ? R[key](U(Object.assign({ mod: m }, data || {})), null, c) : R[key](null, Object.assign({ mod: m }, data || {}), c)).then(j => cb(null, emptied(j)), e => cb(e.message)));
    },
    kit: kitStub(),
  });
  const settle = async () => { for (let i = 0; i < 60 && pend.length; i++) { const p = pend.splice(0); await Promise.allSettled(p); await new Promise(r => setImmediate(r)); } };
  const C1 = 'bots.mission.teams', C2 = 'bots.mission.orders';
  let root = h('div', {}, sb.BOTS_PARTS[0].draw(env('as64', mod, ctx)));
  const blk = id => root.all().find(e => e.dataset && e.dataset.blk === id);
  const recipeIds = () => root.all().filter(e => e.dataset && /^bots\.mission\.r\.[a-e]$/.test(e.dataset.blk)).map(e => e.dataset.blk.slice(-1)).join('');
  await settle();
  // layout (S4, S9): the orders card first, the teams card last with its technical text folded into Details
  ok(root.children[0].dataset.blk === C2 && root.children[1].dataset.blk === C1, 'client: orders card first, teams card last');
  ok(blk(C1 + '.details') && blk(C1 + '.details').tagName === 'DETAILS' && blk(C1 + '.details').all().some(e => e.dataset && e.dataset.blk === C1 + '.areas'), 'client: the start areas sit in the teams card\'s Details');
  ok(blk(C1 + '.areas').textContent.includes(tt('teams.pick')) && blk(C1 + '.result').textContent === tt('teams.pick') && !blk(C1 + '.details').all().includes(blk(C1 + '.result')), 'client: card 1 asks for a map first, in its main text');
  // before a map: the recipes' titles, each with one plain sentence of what it does, in the order c a b e d
  const r2 = blk(C2 + '.recipes').textContent;
  ok(r2.includes(EN[P + 'pick.first']) && 'cabed'.split('').every(r => r2.includes(EN[P + r + '.does'])), 'client: before a map the five recipes say what each does');
  ok(r2.indexOf(EN[P + 'c.title']) < r2.indexOf(EN[P + 'a.title']) && r2.indexOf(EN[P + 'e.title']) < r2.indexOf(EN[P + 'd.title']), 'client: extra vehicles listed first');
  const outside = e => (e.tagName === 'DETAILS' ? '' : e.tagName === '#TEXT' ? e.textContent : (e.children || []).map(outside).join(''));
  ok(!/player/i.test(outside(root)), 'client: no player number on the page outside the Details folds');
  ok(kits.length === 1 && kits[0].o.key === 'bots.mission.map' && kits[0].o.browse && kits[0].o.browse.mode === 'file', 'client: the map box uses searchKit with Browse');
  // the map box: the list has the game's names; a name that is not there says so; the game's name (any case) picks the map
  const mapInp = kits[0].inp, note = () => blk(C2 + '.pick').textContent;
  let hits = null; kits[0].o.index('test', (a) => { hits = a; }); await settle();
  ok(hits && hits.length === 1 && hits[0].label === 'Test Map 2x2' && /tm/.test(hits[0].hint) && /Battle Zones/.test(hits[0].hint), 'client: the list shows the game\'s map name, the folder small, the modes by name ' + JSON.stringify(hits));
  mapInp.value = 'Abbey'; mapInp.fire('change'); await settle();
  ok(note().includes(tx('bots.mission.pick.noHit', { v: 'Abbey' })), 'client: an unknown name says no map name or folder has it and what to try ' + note().slice(0, 200));
  // search (item 2): by the name the game or mod gives and by folder words, any order; nothing found says what to try and that other mods' maps are hidden
  let kh = null; kits[0].o.index('prokh', a => { kh = a; }); await settle();
  ok(kh && kh.length === 1 && kh[0].label === 'Prokhorovka' && /2v2_kursk_a/.test(kh[0].hint), 'client: search finds a map by its in-game name ' + JSON.stringify(kh));
  kh = null; kits[0].o.index('kursk', a => { kh = a; }); await settle();
  ok(kh && kh.length === 1 && kh[0].label === 'Prokhorovka', 'client: search finds a map by a folder word ' + JSON.stringify(kh));
  kh = null; kits[0].o.index('kursk 2v2', a => { kh = a; }); await settle();
  ok(kh && kh.length === 1, 'client: the typed words match in any order');
  kh = null; kits[0].o.index('stalingrad', a => { kh = a; }); await settle();
  ok(kh && kh.length === 0 && note().includes(tx('bots.mission.pick.noHit', { v: 'stalingrad' })) && note().includes(tx('bots.mission.pick.otherMods', { maps: tt('n.maps.one', { n: 1 }) })), 'client: no hit says what to try and how many maps of other mods are hidden ' + note().slice(0, 300));
  mapInp.value = 'test map 2X2'; mapInp.fire('change'); await settle();
  ok(mapInp.value === 'Test Map 2x2' && note().includes(tx('bots.mission.pick.folder', { f: 'multi/tm' })), 'client: the typed game name picks the map; the folder shows small');
  ok(blk(C2 + '.pick').all().some(e => e.tagName === 'DETAILS' && e.textContent.includes('multi/tm')), 'S11: the map folder sits folded under Details');
  ok(blk(C1 + '.areas').textContent.includes(tx('bots.mission.teams.area', { team: 'B', names: 'b1, b2' })), 'client: card 1 names the start areas');
  // S16: the mode bots can play is chosen (botmodes best); combat is marked
  const modeSel = blk(C2 + '.pick').all().find(e => e.tagName === 'SELECT'), opt = (s, v) => s.all().find(o => o.tagName === 'OPTION' && o.value === v);
  ok(modeSel.value === 'battle_zones' && opt(modeSel, 'battle_zones').textContent === 'Battle Zones', 'client: opens on Battle Zones, a mode bots can play ' + modeSel.value);
  ok(opt(modeSel, 'combat').textContent === tt('mode.marked', { m: 'Combat', mark: EN[P + 'mode.mark.no'] }), 'client: combat is marked "bots cannot play" ' + opt(modeSel, 'combat').textContent);
  ok(blk(C2 + '.mode').textContent === '', 'client: no mode warning for a mode bots play');
  ok(recipeIds() === 'cabed', 'client: recipes in the order c a b e d (' + recipeIds() + ')');
  for (const r of 'abcde') ok(blk('bots.mission.r.' + r).textContent.includes(EN['bots.mission.' + r + '.ex']) && blk('bots.mission.r.' + r).textContent.includes(EN[P + r + '.does']), 'client: recipe ' + r + ' with its effect line and example');
  for (const r of 'abce') ok(blk('bots.mission.r.' + r).textContent.includes(EN['bots.mission.' + r + '.untried']), 'client: recipe ' + r + ' says what is not yet tried');
  ok(!root.textContent.includes(EN['bots.mission.proof.mark']) && !blk('bots.mission.proof'), 'client: proven: no not-proven marks');
  ok(orphans.length === 0 && kits.length === 1 + 3 + 1, 'client: every searchKit input sat in the page when attached (' + orphans.join() + '), map + 3 units + 1 vehicle');
  // places: readable labels with where they lie; defaults that work; no typed-coordinates entry in the list
  const sels = r => blk('bots.mission.r.' + r).all().filter(e => e.tagName === 'SELECT' && ['to', 'at', 'then'].some(x => e.attrs['aria-label'] === EN[P + r + '.' + x]));
  const cAt = sels('c')[0], dirs = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw', 'c'].map(d => EN[P + 'dir.' + d]);
  const f1Label = opt(cAt, 'mappoint|f1').textContent;
  ok(dirs.some(d => f1Label === tt('place.withDir', { p: tt('place.flag', { n: '1' }), d })) && /^Flag 1, /.test(f1Label) && !/f1|\(/.test(f1Label), 'client: a flag reads "Flag 1, <side>" with no code ' + f1Label);
  ok(opt(cAt, 'mappoint|f1').getAttribute('title') === tt('place.code', { n: 'f1' }) && /^Start point B1, team B, /.test(opt(cAt, 'mappoint|b1').textContent), 'client: the code is the hover text; a start point reads "Start point B1, team B, <side>" ' + opt(cAt, 'mappoint|b1').textContent);
  // team A = your side beside every "Whose units" list
  ok(['a', 'b', 'c', 'e'].every(r => blk('bots.mission.r.' + r).all().some(e => e.getAttribute && e.getAttribute('data-yours') === '1' && e.textContent.trim() === EN[P + 'who.yours'])), 'client: "Team A is your side" beside the team lists');
  // the teams card: the result in the main text, the proof (numbers) under Details
  const resT = blk(C1 + '.result').textContent;
  ok(resT.includes(tt('teams.resH', { map: 'Test Map 2x2', mode: 'Battle Zones' })) && /Team A \(your side in a test match\) starts at: Start point A1, [^;]+; Start point A2, /.test(resT) && /Team B \(the other side\) starts at: Start point B1, /.test(resT) && !/radius|centre/.test(resT)
    && blk(C1 + '.areas').textContent.includes(EN[P + 'teams.proofH']) && /radius/.test(blk(C1 + '.areas').textContent), 'client: card 1 says in its main text where each team starts; numbers stay under Details ' + resT);
  // Details: the proof line of an order is in the page language, not the server's English note
  ok(blk('bots.mission.r.c.details').textContent.includes(tt('src', { s: EN[P + 'c.src'] })) && !/\[V|btp_/.test(blk('bots.mission.r.c.details').textContent), 'client: the proof line of an order is worded by the page');
  // the additions block is headed with the words the done text points to
  ok(blk(C2 + '.mine').textContent.startsWith(EN[P + 'mine.blk'] + ':') && tt('done.remove').includes('"' + EN[P + 'mine.blk'] + '"'), 'client: the block the done text names is headed with the same words');
  ok(dirs.some(d => opt(cAt, 'zone|zone_mid').textContent === tt('place.withDir', { p: tt('place.zone', { n: 'mid' }), d })), 'client: a zone with its direction ' + opt(cAt, 'zone|zone_mid').textContent);
  ok(!cAt.all().some(o => o.tagName === 'OPTION' && /^xy\|/.test(o.value)), 'client: typed coordinates are not a list entry');
  ok(/^mappoint\|b\d$/.test(cAt.value), 'client: extra vehicles default to team B\'s own start point ' + cAt.value);
  ok(sels('a')[0].value === 'mappoint|f1' && /^zone\|zone_mid$/.test(sels('b')[0].value) && sels('d')[0].value === 'mappoint|f1', 'client: Send and Artillery default to the first flag, Hold to the first zone ' + [sels('a')[0].value, sels('b')[0].value, sels('d')[0].value]);
  ok(blk('bots.mission.r.c.more') && blk('bots.mission.r.c.more').all().some(e => e.tagName === 'INPUT' && e.attrs['aria-label'] === EN[P + 'place.x']) &&
    !blk('bots.mission.r.c').all().filter(e => e.tagName === 'INPUT' && e.attrs['aria-label'] === EN[P + 'place.x']).some(e => !blk('bots.mission.r.c.more').all().includes(e)), 'client: typed x/y only under More options');
  // Pick on the map: MAPVIZ_PICK.open with this map, mode and the places; a mark picks the place, any other click a spot
  const onMapBtn = blk('bots.mission.r.c').all().find(e => e.tagName === 'BUTTON' && e.textContent === EN[P + 'place.onMap']);
  ok(onMapBtn, 'client: "Pick on the map" beside the place list when the Map Viewer is loaded');
  onMapBtn.click();
  const pk = picks[0] || {};
  ok(pk.map === 'multi/tm' && pk.mission === 'battle_zones' && pk.gameId === 'as64' && pk.mod === mod && typeof pk.onPick === 'function' && (pk.places || []).some(p => p.id === 'mappoint|f1' && p.label === f1Label && isFinite(p.x)), 'client: the picker opens on this map and mode with the places ' + JSON.stringify(Object.assign({}, pk, { places: (pk.places || []).length, onPick: typeof pk.onPick })));
  pk.onPick({ place: { id: 'zone|zone_mid' } });
  ok(cAt.value === 'zone|zone_mid', 'client: a place picked on the map is chosen in the list');
  pk.onPick({ x: 2000, y: -1000 });
  ok(cAt.value === 'xy|2000 -1000' && opt(cAt, 'xy|2000 -1000').textContent === tt('place.xyw', { x: '100', y: '-50' }), 'client: a spot picked on the map is listed in metres ' + cAt.value);
  // item 6: the picker answers null (closed, or a spot outside the playable area it refused) or inside:false: the list stays, one plain line says so
  const pnOf = () => blk('bots.mission.r.c').all().find(e => e.attrs && e.attrs.role === 'status');
  pk.onPick(null);
  ok(cAt.value === 'xy|2000 -1000' && pnOf() && pnOf().hidden === false && pnOf().textContent === EN[P + 'place.notPicked'], 'client: a null pick keeps the place and says nothing was picked');
  pk.onPick({ x: 9e6, y: 0, inside: false });
  ok(cAt.value === 'xy|2000 -1000', 'client: a spot outside the playable area is not taken');
  pk.onPick({ x: 100, y: 200, inside: true });
  ok(cAt.value === 'xy|100 200' && pnOf().hidden === true, 'client: an inside spot is taken and the line goes ' + cAt.value);
  // the Map Viewer deep link: page:mapviz/<game>~<map key without map/>~<mode>
  blk(C2 + '.pick').all().find(e => e.tagName === 'BUTTON' && e.textContent === EN[P + 'place.viewer']).click();
  ok(shown.pop() === 'mapviz|page:mapviz/as64~multi/tm~battle_zones', 'client: the Map Viewer opens on this map and mode');
  // the rotation note and its link
  const rot = blk('bots.mission.rot').children[0], tick = r => blk('bots.mission.r.' + r).all().find(e => e.tagName === 'INPUT' && e.attrs.id === 'bots-mission-' + r);
  ok(rot.hidden === true, 'client: rotation note hidden with nothing ticked');
  const ta = tick('a'); ta.checked = true; ta.fire('change');
  ok(rot.hidden === false && rot.textContent.includes(tx('bots.mission.rot.game', { s: 180 })), 'client: ticking Send shows the bot\'s 180 s');
  rot.all().find(e => e.tagName === 'BUTTON').click(); ok(went.pop() === 'bots.stages.move.rotation', 'client: the rotation link');
  ok(blk('bots.mission.r.a').all().some(e => e.tagName === 'INPUT' && e.attrs['aria-label'] === EN['bots.mission.rep.every'] && e.value === '170'), 'client: repeat every defaults just under 180 s');
  // S20: the word after a number box follows the number typed
  const bSec = blk('bots.mission.r.b').all().find(e => e.tagName === 'INPUT' && e.attrs['aria-label'] === EN[P + 'b.seconds']);
  const wordOf = inp => inp.parentNode.children.filter(e => e !== inp).map(e => e.textContent).join('');
  bSec.value = '1'; bSec.fire('input');
  ok(wordOf(bSec) === ' ' + EN[P + 'u.sec.one'], 'client: "1 second" ' + JSON.stringify(wordOf(bSec)));
  bSec.value = '30'; bSec.fire('input');
  ok(wordOf(bSec) === ' ' + EN[P + 'u.sec.other'], 'client: "30 seconds" ' + JSON.stringify(wordOf(bSec)));
  ta.checked = false; ta.fire('change');
  // S12: errors name the field by its label
  const btn = k => blk(C2 + '.btns').all().find(e => e.tagName === 'BUTTON' && e.textContent === k);
  const res = () => blk(C2 + '.res').textContent;
  const td = tick('d'); td.checked = true; td.fire('change');
  const dAt = sels('d')[0], dIn = l => blk('bots.mission.r.d').all().find(e => e.tagName === 'INPUT' && e.attrs['aria-label'] === EN[P + l]);
  dAt.value = ''; dAt.fire('change'); btn('bots.btn.preview').click(); await settle();
  ok(res().includes(tt('errIn', { r: EN[P + 'd.title'], m: tt('e.noplace', { f: EN[P + 'd.at'] }) })), 'client: no place says which field ' + res().slice(0, 200));
  dIn('place.x').value = '5'; dIn('place.x').fire('input'); btn('bots.btn.preview').click(); await settle();
  ok(res().includes(tt('e.noxy', { f: EN[P + 'd.at'] })), 'client: one empty coordinate has its own plain error ' + res().slice(0, 200));
  dIn('place.x').value = ''; dIn('place.x').fire('input'); dAt.value = 'mappoint|f1'; dAt.fire('change');
  dIn('minute').value = '999'; dIn('minute').fire('input'); btn('bots.btn.preview').click(); await settle();
  ok(res().includes(tt('e.range', { f: EN[P + 'minute'], lo: 0, hi: 180 })) && btn('bots.btn.write').disabled === true, 'client: an out-of-range number names the field and its range ' + res().slice(0, 200));
  td.checked = false; td.fire('change');
  // T6 with no typing: extra tanks for team B at minute 5 (vehicle picked from the list by name, its crew of its own army)
  ok(btn('bots.btn.undo').disabled === true && btn('bots.btn.undo').title === tt('undo.nothing'), 'client: Undo greyed before anything was written');
  const tc = tick('c'); tc.checked = true; tc.fire('change');
  pk.onPick({ place: { id: 'mappoint|b1' } });
  const uk = kits.filter(k => k.o.key === 'bots.mission.unit')[0];
  let uh = null; uk.o.index('pz', a => { uh = a; }); await settle();
  ok(uh && uh[0] && uh[0].label === 'Pz.Kpfw. IV H', 'client: vehicles listed by their in-game names');
  uk.o.onPick('pz4h', uh[0], 'index');
  btn('bots.btn.preview').click(); await settle();
  ok(res().includes(tt('add.prevH', { map: 'Test Map 2x2', mode: 'Battle Zones' })) && res().includes(tt('c.sayCrewOf', { units: 'Pz.Kpfw. IV H', men: tt('n.men.other', { n: 4 }), army: EN[P + 'army.ger'] })), 'client: the preview says the crew of its own army ' + res().slice(0, 400));
  ok(btn('bots.btn.write').disabled === false && !fs.existsSync(modMi), 'client: write on after preview, nothing written yet');
  btn('bots.btn.write').click(); await settle();
  ok(asks.length && asks[asks.length - 1].lines[0] === tt('add.ask', { changes: tt('n.changes.one', { n: 1 }), map: 'Test Map 2x2' }), 'client: the write question counts "1 change" ' + JSON.stringify(asks[asks.length - 1] && asks[asks.length - 1].lines[0]));
  ok(fs.existsSync(modMi) && MI.added(fs.readFileSync(modMi, 'latin1')).map(a => a.id).join() === 'c1' && /mp\/ger\/tankman/.test(fs.readFileSync(modMi, 'latin1')), 'client: write adds c1 with German tank men');
  let done = blk('bots.mission.done');
  ok(done && done.textContent.startsWith(tt('done.what', { changes: tt('n.changes.one', { n: 1 }), map: 'Test Map 2x2' })), 'client: the box says "Done: <what>." ' + (done && done.textContent.slice(0, 120)));
  const see = tt('done.see', { mode: 'Battle Zones', map: 'Test Map 2x2', team: EN[P + 'team.b'], min: 5 });
  ok(done && done.textContent.includes(see) && done.textContent.includes(tt('done.remove')), 'client: the green box says which mode and map to start and from which minute ' + (done && done.textContent.slice(0, 400)));
  ok(res().includes(EN['bots.mission.lint.clean']), 'client: milint clean shown ' + res().slice(0, 400));
  done.all().find(e => e.tagName === 'BUTTON' && e.textContent === EN['bots.mission.done.try']).click(); ok(went.pop() === 'bots.botmatch', 'client: Try a bot match goes to the bot match card');
  ok(!blk(C2 + '.mine').textContent.includes('(c1)') && blk(C2 + '.mine').all().some(e => e.getAttribute && e.getAttribute('data-added') === 'c1') && changes.pop() === 'mission|el', 'client: the additions list holds c1 as a hover code, not in the sentence (S20); the other parts are told');
  ok(btn('bots.btn.undo').disabled === false, 'client: Undo on after a write');
  // S13: Undo in the green box: the box goes, Undo greyed, every list read again
  const fBefore = factsN;
  done.all().find(e => e.tagName === 'BUTTON' && e.textContent === 'bots.btn.undo').click(); await settle();
  ok(!fs.existsSync(modMi) && !fs.existsSync(modRes), 'client: Undo deletes the copy the write made');
  ok(!blk('bots.mission.done') && btn('bots.btn.undo').disabled === true && factsN > fBefore && !blk(C2 + '.mine').all().some(e => e.getAttribute && e.getAttribute('data-added') === 'c1'), 'client: after Undo the box is gone, Undo greyed, the map read again ' + [!!blk('bots.mission.done'), btn('bots.btn.undo').disabled, factsN - fBefore]);
  // e: the vehicle from the list, the place from the dropdown, preview, write, the row's Undo
  const te = tick('e'); te.checked = true; te.fire('change');
  const vk = kits.filter(k => k.o.key === 'bots.mission.vehicle').pop();
  let vh = null; vk.o.index('gaz', a => { vh = a; }); await settle();
  ok(vh[0].label === 'GAZ-67B' && /^Russia/.test(vh[0].hint) && !/\brus\b/.test(vh[0].hint), 'client: units by in-game name, the army by name ' + JSON.stringify(vh[0]));
  vk.o.onPick('gaz67b', vh[0], 'index');
  const eAt = sels('e')[0]; eAt.value = 'mappoint|f1'; eAt.fire('change');
  btn('bots.btn.preview').click(); await settle();
  const sayE = tt('e.say', { who: EN['bots.mission.who.b'], min: 4, men: tt('n.soldiers.other', { n: 3 }), unit: 'GAZ-67B', at: f1Label });
  ok(res().includes(sayE) && res().includes(EN['bots.mission.add.exact']), 'client: the preview in plain words, the exact change folded ' + res().slice(0, 300));
  const diffPre = blk('bots.mission.prev.change').all().filter(e => e.tagName === 'PRE');
  ok(diffPre.length === 1 && /^\+ /.test(diffPre[0].textContent) && blk('bots.mission.prev.change').textContent.indexOf(EN['bots.mission.diff.removed']) < blk('bots.mission.prev.change').textContent.indexOf(EN['bots.mission.diff.added']), 'client: the diff lists removed lines first, then + added');
  btn('bots.btn.write').click(); await settle();
  ok(fs.existsSync(modMi) && MI.added(fs.readFileSync(modMi, 'latin1')).map(a => a.id).join() === 'e1' && blk('bots.mission.done'), 'client: write adds e1');
  btn('bots.btn.undo').click(); await settle();
  ok(!fs.existsSync(modMi) && res().includes(EN['bots.mission.undo.deleted']) && btn('bots.btn.undo').disabled === true && !blk('bots.mission.done') && changes.pop() === 'undo|el', 'client: the row\'s Undo deletes the copy, says so, greys out, tells the other parts ' + res().slice(0, 200));
  // combat picked by hand: refused with its reason, no recipes
  modeSel.value = 'combat'; modeSel.fire('change'); await settle();
  ok(blk(C2 + '.mode').textContent.includes(tt('mode.combatNo', { mode: 'Combat' })) && recipeIds() === '', 'client: combat is refused, no recipes drawn ' + recipeIds());
  // bots switched off for the mode: marked, warned with the card that turns them on, said in the preview
  BMV = BM_OFF; kits.length = 0;
  root = h('div', {}, sb.BOTS_PARTS[0].draw(env('as64', mod, ctx))); await settle();
  const ms2 = blk(C2 + '.pick').all().find(e => e.tagName === 'SELECT');
  ms2.value = 'battle_zones'; ms2.fire('change'); await settle();
  ok(opt(ms2, 'battle_zones').textContent === tt('mode.marked', { m: 'Battle Zones', mark: EN[P + 'mode.mark.off'] }) && blk(C2 + '.mode').textContent.includes(tt('mode.offWarn', { mode: 'Battle Zones' })), 'client: bots off: marked and warned ' + blk(C2 + '.mode').textContent);
  blk(C2 + '.mode').all().find(e => e.tagName === 'BUTTON').click(); ok(went.pop() === 'bots.modeready', 'client: the warning links to the card that turns bots on');
  const td2 = tick('d'); td2.checked = true; td2.fire('change'); btn('bots.btn.preview').click(); await settle();
  ok(res().includes(tt('mode.prevOff', { mode: 'Battle Zones' })), 'client: the preview says it is not seen until bots are on');
  // no Map Viewer loaded: no "Pick on the map", the list and the viewer link still there; the map is kept across the redraw
  BMV = BM_OK; delete sb.MAPVIZ_PICK; kits.length = 0;
  root = h('div', {}, sb.BOTS_PARTS[0].draw(env('as64', mod, ctx))); await settle();
  ok(kits[0] && kits[0].inp.value === 'Test Map 2x2' && blk('bots.mission.r.c') && !root.all().some(e => e.tagName === 'BUTTON' && e.textContent === EN[P + 'place.onMap']) &&
    blk('bots.mission.r.c').textContent.includes(EN[P + 'place.viewerHint']), 'client: without MAPVIZ_PICK the list and typed coordinates stay, no picker button');
  // item 1: a map whose mission names no place for this mode: no empty dropdown, one plain line (typed spot here, the picker when the viewer is there)
  EMPTY = true; kits.length = 0;
  root = h('div', {}, sb.BOTS_PARTS[0].draw(env('as64', mod, ctx))); await settle();
  let cSel = sels('c')[0];
  ok(cSel && cSel.hidden === true && blk('bots.mission.r.c').textContent.includes(tt('place.noneTyped', { mode: 'Battle Zones', map: 'Test Map 2x2' })), 'client: no places: the dropdown is hidden and one line says to type a spot ' + blk('bots.mission.r.c').textContent.slice(0, 300));
  sb.MAPVIZ_PICK = { open: o => picks.push(o) }; picks.length = 0; kits.length = 0;
  root = h('div', {}, sb.BOTS_PARTS[0].draw(env('as64', mod, ctx))); await settle();
  cSel = sels('c')[0];
  ok(cSel.hidden === true && blk('bots.mission.r.c').textContent.includes(tt('place.noneOnMap', { mode: 'Battle Zones', map: 'Test Map 2x2' })), 'client: no places with the viewer: the line says to pick on the map');
  blk('bots.mission.r.c').all().find(e => e.tagName === 'BUTTON' && e.textContent === EN[P + 'place.onMap']).click();
  picks[0].onPick({ x: 100, y: 200, inside: true });
  ok(cSel.hidden === false && cSel.value === 'xy|100 200', 'client: a spot picked on the map shows the dropdown with it ' + cSel.value);
  EMPTY = false;
  ok(missing.size === 0, 'client: every string has a lang row: ' + [...missing].join(', '));
  // GoH and no mod
  // GoH: read only. The map box (searchKit), the mode, the teams card with its start areas and the additions list are there; the recipes,
  // the Preview / Write / Undo row and the Remove buttons give way to one kit.na line with why and what to use
  kits.length = 0;
  root = h('div', {}, sb.BOTS_PARTS[0].draw(env('goh', mod, ctx))); await settle();
  const g = root;
  const naB = g.all().filter(e => e.dataset && /^bots\.mission\.(teams|orders)\.goh$/.test(e.dataset.blk));
  ok(naB.length === 1 && naB[0].dataset.blk === C2 + '.goh' && naB[0].textContent === 'NA Gates of Hell: ' + tt('goh.why') + '. USE: ' + tt('goh.use') && !/\{\w+\}/.test(g.textContent), 'client GoH: one kit.na line with why and what to use in the orders card ' + g.textContent.slice(0, 300));
  ok(kits.length > 0 && kits[0].o.key === 'bots.mission.map' && recipeIds() === '' && blk(C2 + '.btns').hidden === true, 'client GoH: the map box is a searchKit, no recipes, the button row hidden');
  ok(blk(C1 + '.result') && blk(C1 + '.result').textContent.includes(tt('teams.resH', { map: 'Test Map 2x2', mode: 'Battle Zones' }).slice(0, 12)) && !blk(C1 + '.goh'), 'client GoH: the teams card reads the start areas ' + (blk(C1 + '.result') || { textContent: '' }).textContent.slice(0, 200));
  ok(!blk(C2 + '.mine').all().some(e => e.tagName === 'BUTTON' && e.textContent === EN[P + 'mine.rm']), 'client GoH: no Remove buttons');
  // the frame's names and lines when it has them: kit.game, kit.army, kit.undone, kit.none, bots.showChange
  { const e2 = env('goh', mod, ctx); e2.kit.game = id => 'GAME<' + id + '>';
    const g2 = h('div', {}, sb.BOTS_PARTS[0].draw(e2)); root = g2; await settle();
    ok(g2.textContent.includes('NA GAME<goh>: ') && g2.textContent.includes('GAME<mowas2>') && g2.textContent.includes('GAME<as64>'), 'client: game names come from kit.game ' + g2.textContent.slice(0, 300));
    ok(/K\.army\(/.test(X.script) && /K\.undone\(/.test(X.script) && /K\.none\(/.test(X.script) && /tx\('bots\.showChange'\)/.test(X.script), 'client: kit.army, kit.undone, kit.none and bots.showChange are used when there'); }
  const nm = h('div', {}, sb.BOTS_PARTS[0].draw(env('as64', '', ctx)));
  ok(nm.textContent.includes(EN['bots.mission.needmod']), 'client without a mod: pick a mod first');
  console.log(bad ? bad + ' of ' + n + ' failed' : 'bots part mission PASS (' + n + ' checks)');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
