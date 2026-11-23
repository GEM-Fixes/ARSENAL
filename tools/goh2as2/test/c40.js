// Author: Imperator_Aug (ARSENAL, ia-a33632d0)
// COV-C40 seeded test: (1) skipSetKind skips the GoH-only top-level sets and keeps the AS2-read ones;
// (2) regression: no engine .cpp opens a skipped set by name (fails when an AS2 reader appears, so the PORT-33 skip must be revisited);
// (3) the AS2-read sets (grass.set, level_of_detail*.set, the 3 LOD files) still have their reader, so they must not be skipped;
// (4) mapTargetSelector: every GoH targetSelector type AS2 lacks maps to a type AS2 select.set defines (shape check on the vanilla text below).
const fs = require('fs'), path = require('path');
const g = require('../goh2as2'), tr = require('../translate');
let ok = true, n = 0; const t = (c, m) => { n++; if (!c) { console.log('FAIL c40: ' + m); ok = false; } };

// (1) skip list
for (const f of g.SKIP_TOP_SETS) t(/PORT-33/.test(g.skipSetKind('set/' + f) || ''), 'skips set/' + f);
t(g.skipSetKind('set/dynamic_campaign/x.set'), 'dynamic_campaign still skipped');
for (const k of ['set/grass.set', 'set/level_of_detail.set', 'set/level_of_detail_zoom.set', 'set/target/select.set', 'set/stuff/rifle/mosin', 'set/squads/x.set'])
  t(g.skipSetKind(k) === null, 'kept ' + k);

// (2)+(3) engine grep: the readers. SRC = repo src root (the game lives under game/ and gem/)
const SRC = path.resolve(__dirname, '../../..');
const cpp = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(cpp|h)$/.test(e.name)) cpp.push(p); } })(path.join(SRC, 'game'));
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(cpp|h)$/.test(e.name)) cpp.push(p); } })(path.join(SRC, 'gem'));
const text = cpp.map(p => fs.readFileSync(p, 'latin1')).join('\n');
t(cpp.length > 500, 'source tree found (' + cpp.length + ' files)');
for (const f of g.SKIP_TOP_SETS) {
  const read = text.includes('"/set/' + f + '"') || text.includes('"set/' + f + '"');
  if (f === 'market.set') t(read, 'market.set reader still the Steam store one; recheck if it moved');
  else t(!read, 'no engine reader for set/' + f + ' (if this fails, AS2 reads it now: drop it from SKIP_TOP_SETS)');
}
for (const f of ['grass.set', 'level_of_detail.set', 'level_of_detail_manual.set', 'level_of_detail_zoom.set', 'target/select.set'])
  t(text.includes('"/set/' + f + '"'), 'AS2 reader present for set/' + f);

// (4) target selector map against the vanilla AS2 select.set types (copied 2026-11-09 from as64+ set/target/select.set)
const AS2_TYPES = tr.AS2_TARGET_TYPES;
t(Array.isArray(AS2_TYPES) && AS2_TYPES.length > 0, 'AS2 selector types listed');
for (const [goh, as2] of Object.entries(tr.TARGET_SEL_MAP)) t(AS2_TYPES.includes(as2), `map ${goh} -> ${as2}: target is an AS2 type`);
let r = tr.mapTargetSelector('{targetSelector "tank_heavy"}');
t(r.changes.length === 1 && /\{targetSelector "tank"\}/i.test(r.text), 'tank_heavy -> tank: ' + r.text);
r = tr.mapTargetSelector('{targetSelector "tank"}');
t(r.changes.length === 0 && r.text === '{targetSelector "tank"}', 'AS2 type kept');
r = tr.mapTargetSelector('{TargetSelector "no_such_sel"}');
t(r.unknown.length === 1, 'unknown type reported');
r = tr.mapTargetSelector('{targetSelector "human_bullet"}\r\n{targetSelector "Cannon_Howitzer"}');
t(r.changes.length === 1 && r.unknown.length === 0 && /"human_bullet"/.test(r.text) && /"cannon_shell"/.test(r.text), 'human* kept, case-insensitive map (c39_rp3 22cm_mortier case)');
// shape: the map covers exactly the GoH set/target types AS2 lacks (GoH list from the cov-l8m key dump, 2026-11-09)
const GOH_TYPES = ['airborne_bullet', 'cannon_aa', 'cannon_big', 'cannon_bullet', 'cannon_howitzer', 'cannon_small', 'cannon_zenite', 'car_bullet', 'rocket', 'searchlight', 'supergun', 'tank_bullet', 'tank_heavy', 'tank_light', 'tank_medium', 'tank_spg', 'tank_zenite'];
for (const ty of GOH_TYPES) t(AS2_TYPES.includes(ty) || tr.TARGET_SEL_MAP[ty], 'GoH type covered: ' + ty);
t(Object.keys(tr.TARGET_SEL_MAP).length >= 10, 'every GoH-only selector of the survey mapped');

if (ok) console.log(`c40 ok (${n} checks)`); process.exit(ok ? 0 : 1);
