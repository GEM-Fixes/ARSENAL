// lnglayout regression: fixture game + a clean split mod (0 findings) + a bad copy with one seeded defect per code (truth.md).
// fixtures written to test/tmp (CRLF, UTF-8). prints PASS on success.
// Author: Imperator_Aug (ARSENAL, ia-da1847a2)
const fs = require('fs'), path = require('path'), cp = require('child_process'), assert = require('assert');
const T = path.join(__dirname, 'tmp'), TOOL = path.join(__dirname, '..', 'lnglayout.js');
const lay = require('../lnglayout');
fs.rmSync(T, { recursive: true, force: true });
const W = (rel, lines) => { const f = path.join(T, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Array.isArray(lines) ? lines.join('\r\n') + '\r\n' : lines); };

// ---- vanilla game ----
W('game/localization/desc.lng', ['{tags', '\t{human {mp {ger', '\t\t{"rifle" "Rifleman"}', '\t\t{"mg" "MG"}', '\t\t{"medic" "Medic"}', '\t}}}',
  '\t{squad {"van_card" "Vanilla van"}}', '\t{entity {"tank_a" "Tank A"}}', '}']);
W('game/localization/info.lng', ['{tags', '\t{squad {"van_card" "Van info"}}', '}']);
W('game/resource/entity/-vehicle/tank_medium/tank_a/tank_a.def', ['{game_entity}']);
W('game/resource/set/breed/mp/ger/rifle.set', ['{breed}']);

// ---- clean split mod ----
const mod = (d, extra = {}) => {
  const L = `${d}/localization/`;
  W(L + 'desc.lng', extra.desc || ['; desc.lng: group skeleton and includes only', '{tags', '\t{"human"', '\t\t{"mp"', '\t\t\t{"ger"',
    '\t\t\t\t(include "desc/vanilla/human/mp/ger.inc")', '\t\t\t\t(include "desc/mod/human/ger.inc")', '\t\t\t}', '\t\t}', '\t}',
    '\t{"squad"', '\t\t(include "desc/vanilla/squad.inc")', '\t\t(include "desc/mod/squad/ger/squad1.inc")', '\t}',
    '\t{"entity"', '\t\t(include "desc/vanilla/entity.inc")', '\t}', '}']);
  W(L + 'desc/vanilla/human/mp/ger.inc', ['; desc/human/mp/ger/* : keys identical to vanilla', '; vanilla part: do not edit', '{"rifle" "Rifleman"}']);
  W(L + 'desc/mod/human/ger.inc', extra.human || ['; desc/human/mp/ger/* : keys this mod changed or added', '; mod part', '; changed from vanilla',
    '; [changed] first in card "inf_a(ger)" ger/squad1 cost 80', '{"mg" "MG gunner"}', '; new', '; [new] not in any buy-list card', '{"sniper" "Sniper"}']);
  W(L + 'desc/vanilla/squad.inc', ['; vanilla part', '{"van_card" "Vanilla van"}']);
  W(L + 'desc/mod/squad/ger/squad1.inc', extra.squad || ['; desc.lng mod part: infantry cards, side ger, button squad1', '; -- group squad_1 --',
    '; [new] card "inf_a(ger)" cost 80 lvl 1 | soldiers rifle x4 | units/units_44-45.set:2', '{"inf_a(ger)" "Inf A"}']);
  W(L + 'desc/vanilla/entity.inc', extra.entity || ['; vanilla part', '{"tank_a" "Tank A"}']);
  W(L + 'info.lng', extra.info || ['; info.lng', '{tags', '\t{"squad"', '\t\t(include "info/vanilla/squad.inc")', '\t\t(include "info/mod/squad/ger/squad1.inc")', '\t}', '}']);
  W(L + 'info/vanilla/squad.inc', ['; vanilla part', '{"van_card" "Van info"}']);
  W(L + 'info/mod/squad/ger/squad1.inc', ['; mod part', '; [new] card "inf_a(ger)" cost 80', '{"inf_a(ger)" "Inf A info"}']);
  W(L + '#dlg.lng', ['{tags', '\t{mp {"title" "T"}}', '}']);                          // no include: not a parent
  W(L + 'mission/single/a/b.lng', ['{tags {"name" "B"}}']);
  W(L + '_dropped/desc.inc', ['; parked', '{"weapon"', '{"w_dead" "Dead"}', '}']);
  W(`${d}/resource/set/multiplayer/games/frontline.set`, ['{buttons "squad1 v1 v2"}']);
  W(`${d}/resource/set/multiplayer/units/units_44-45.set`, ['{units',
    '\t{"inf_a(ger)" {button squad1} {group squad_1} {cost 80} {content "mp/ger/rifle:4"} {tags "infantry 44"}}',
    '\t{"tank_a" {button v2} {group t1} {cost 300} {content "tank_a ( mp/ger/rifle:2 )"} {tags "ger 44"}}',
    '\t{"van_card" {button squad1} {group b5} {content "mp/ger/rifle"} {tags "ger"}}',
    ...(extra.cards || []), '}']);
};
mod('clean');
const cleanEp = new Map([['desc/human/mp/ger/rifle', 'desc/vanilla/human/mp/ger.inc'], ['desc/human/mp/ger/mg', 'desc/mod/human/ger.inc'],
  ['desc/human/mp/ger/sniper', 'desc/mod/human/ger.inc'], ['desc/squad/inf_a(ger)', 'desc/mod/squad/ger/squad1.inc'],
  ['info/squad/inf_a(ger)', 'info/mod/squad/ger/squad1.inc'], ['desc/entity/tank_a', 'desc/vanilla/entity.inc']].map(([k, p]) => [k, { part: p, kind: p.includes('/mod/') ? 'mod' : 'vanilla' }]));

// ---- bad mod: one defect per code (truth.md) ----
mod('bad', {
  desc: ['; desc.lng', '{tags', '\t(include "_dropped/desc.inc")', '\t{"human"', '\t\t{"mp"', '\t\t\t{"ger"',
    '\t\t\t\t(include "desc/vanilla/human/mp/ger.inc")', '\t\t\t\t(include "desc/mod/human/ger.inc")', '\t\t\t}', '\t\t}', '\t}',
    '\t{"squad"', '\t\t(include "desc/vanilla/squad.inc")', '\t\t(include "desc/mod/squad/ger/squad1.inc")', '\t\t{"stray" "Stray"}', '\t}',
    '\t{"entity"', '\t\t(include "desc/mod/entity/ger/v2.inc")', '\t\t(include "desc/vanilla/entity.inc")', '\t\t(include "desc/mod/missing.inc")', '\t}', '}'],
  human: ['; mod part', '; changed from vanilla', '{"mg" "MG gunner"}', '{"rifle" "Rifle man"}', '; new', '{"sniper" "Sniper"}', '{"medic" "Medic"}',
    '{"Sniper2" "S2"}', '{"sniper3" "S3"} '],
  squad: ['; mod part', '; [new] card "inf_a(ger)" cost 80', '{"inf_a(ger)" "Inf A"}', '{"Inf_A(ger)" "Inf A2"}',
    '; [new] card "gone(ger)" cost 90', '{"inf_d(ger)" "Inf D"}'],
  entity: ['; vanilla part', '{"tank_a" "Tank A!"}'],
  info: ['; info.lng', '{tags', '\t{"squad"', '\t\t(include "info/vanilla/squad.inc")', '\t\t(include "info/mod/squad/ger/squad1.inc")', '\t}',
    '\t{"squad"', '\t\t(include "info/mod/squad/ger/squad2.inc")', '\t}', '}'],
  cards: ['\t{"inf_c(ger)" {button squad1} {group c} {info "inf_a(ger)"} {content "mp/ger/rifle"} {tags "ger"}}',
    '\t{"inf_d(ger)" {button squad1} {group d} {content "mp/ger/rifle"} {tags "ger"}}'],
});
W('bad/localization/desc/mod/entity/ger/v2.inc', ['; mod part', '{"tank_b" "Tank B"}']);
W('bad/localization/info/mod/squad/ger/squad2.inc', ['; mod part', '{"inf_b(ger)" "Inf B info"}']);
W('bad/localization/desc/mod/extra.lng', ['{tags}']);
W('bad/localization/desc/mod/orphan.inc', ['{"x" "X"}']);
const badEp = new Map([...cleanEp, ['desc/human/mp/ger/sniper', { part: 'desc/mod/human/other.inc', kind: 'mod' }]]);

let n = 0, fail = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { fail++; console.log('FAIL ' + name + ': ' + e.message); } };
const G = path.join(T, 'game');
const counts = rep => { const j = lay.toJSON(rep), c = {}; for (const f of [...j.findings, ...j.info]) c[f.code] = (c[f.code] || 0) + 1; return { c, j }; };

t('clean folder: 0 findings, only the card summary info', () => {
  const { c, j } = counts(lay.run({ modDir: path.join(T, 'clean'), gameDir: G, expectedParts: () => cleanEp }));
  assert.equal(j.total, 0, JSON.stringify(j.findings));
  assert.deepEqual(c, { LAY_CARD_SUMMARY: 1 });
});
const want = ['LAY_PARENT_TEXT', 'LAY_GROUP_TWICE', 'LAY_PART_LNG', 'LAY_INC_UNUSED', 'LAY_DROPPED_INCLUDED', 'LAY_INCLUDE_ORDER', 'LAY_KEY_BOTH',
  'LAY_KEY_DUP', 'LAY_VANILLA_EDITED', 'LAY_MOD_SAME', 'LAY_KEY_CASE', 'LAY_FORMAT', 'LAY_WRONG_PART', 'LAY_CARD_NO_NAME', 'LAY_CARD_NO_INFO',
  'LAY_CONTEXT_STALE', 'LAY_INCLUDE_MISSING'];
let bad;
t('bad folder: each seeded defect once', () => {
  bad = counts(lay.run({ modDir: path.join(T, 'bad'), gameDir: G, expectedParts: () => badEp }));
  const c = { ...bad.c }; delete c.LAY_CARD_SUMMARY;
  assert.deepEqual(Object.keys(c).sort(), [...want].sort(), JSON.stringify(bad.c));
  for (const k of want) assert.equal(c[k], 1, k + ' ' + c[k]);
});
t('bad folder: places and levels', () => {
  const at = code => [...bad.j.findings, ...bad.j.info].find(f => f.code === code);
  assert.equal(at('LAY_PARENT_TEXT').file, 'localization/desc.lng'); assert.equal(at('LAY_PARENT_TEXT').line, 15);
  assert.equal(at('LAY_GROUP_TWICE').file, 'localization/info.lng'); assert.equal(at('LAY_GROUP_TWICE').line, 7);
  assert.equal(at('LAY_INCLUDE_ORDER').line, 18);
  assert.match(at('LAY_KEY_DUP').msg, /case-only/);
  assert.equal(at('LAY_KEY_BOTH').file, 'localization/desc/mod/human/ger.inc'); assert.equal(at('LAY_KEY_BOTH').line, 4);
  assert.match(at('LAY_FORMAT').msg, /trailing spaces: 1 line/);
  assert.match(at('LAY_WRONG_PART').msg, /desc\/mod\/human\/other\.inc/);
  assert.match(at('LAY_CARD_NO_NAME').msg, /inf_c\(ger\)/); assert.match(at('LAY_CARD_NO_NAME').file, /units_44-45\.set$/);
  assert.match(at('LAY_CARD_NO_INFO').msg, /info\/squad\/inf_d\(ger\)/);
  assert.match(at('LAY_CONTEXT_STALE').msg, /gone\(ger\)/);
  assert.equal(at('LAY_VANILLA_EDITED').severity, 'error'); assert.equal(at('LAY_KEY_CASE').severity, 'warning'); assert.equal(at('LAY_MOD_SAME').severity, 'note');
});
t('no expectedParts: one skip info', () => {
  const { c } = counts(lay.run({ modDir: path.join(T, 'clean'), gameDir: G, expectedParts: null }));
  assert.equal(c.LAY_WRONG_PART_SKIPPED, 1); assert.equal(c.LAY_WRONG_PART, undefined);
});
t('unit: partKind, formatScan', () => {
  assert.equal(lay.partKind('desc/vanilla/a.inc'), 'vanilla'); assert.equal(lay.partKind('desc_parts/mod/x/a.inc'), 'mod');
  assert.equal(lay.partKind('_dropped/desc.inc'), 'dropped'); assert.equal(lay.partKind('mission/single/a/b.lng'), null);
  const r = lay.formatScan(Buffer.from('﻿; café\n {"a" "b;é"}  \r\n', 'utf8'), true);
  assert.deepEqual(Object.keys(r).sort(), ['BOM', 'LF-only line end', 'indented line', 'non-ASCII in a ; comment', 'trailing spaces']);
});
const cli = args => { const r = cp.spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' }); return { rc: r.status, out: r.stdout + r.stderr }; };
t('CLI: --only, exit code, --json', () => {
  const j = path.join(T, 'out.json');
  const a = cli([path.join(T, 'bad'), '--game', G, '--only', 'LAY_PART_LNG', '--json', j]);
  assert.equal(a.rc, 1, a.out); assert.match(a.out, /1 findings/);
  assert.equal(JSON.parse(fs.readFileSync(j, 'utf8')).findings[0].code, 'LAY_PART_LNG');
  const b = cli([path.join(T, 'bad'), '--game', G, '--only', 'LAY_KEY_CASE', '-q']);
  assert.equal(b.rc, 0, b.out); assert.match(b.out, /1 findings/);
});
console.log(`${n} ok, ${fail} failed`);
if (!fail) console.log('PASS');
