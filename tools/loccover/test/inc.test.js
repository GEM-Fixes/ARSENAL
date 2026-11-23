// loccover + (include "p") in a mod .lng (LOC-21, lib/lnginc): a split mod's keys count from its .inc parts.
// fixture (temp): game/ mini vanilla desc.lng (entity/oldtank, entity/keeptank) + game/mods/m: localization/desc.lng = parent with
//   includes only; parts desc/van.inc (both vanilla keys: no LOC_FILE_REPLACED), desc/a.inc + desc/b.inc (entity/newtank in both:
//   a duplicate across two parts, later wins, no finding), desc/gone.inc missing (seeded: LOC_INCLUDE_MISSING desc.lng:5; card
//   lost has its key only there: seeded LOC_NAME_MISSING common.set:5). Run mounted (game/mods/m) and as a loose folder (no game).
// Author: Imperator_Aug (ARSENAL, ia-a9c5a5e0)
const fs = require('fs'), path = require('path'), os = require('os');
const { check } = require('../loccover');
const W = fs.mkdtempSync(path.join(process.env.TEST_WORK || os.tmpdir(), 'lcinc-'));
const put = (rel, lines) => { const f = path.join(W, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, lines.join('\r\n') + '\r\n', 'latin1'); };
put('game/localization/desc.lng', ['{tags', '\t{"entity" {"oldtank" "Old"} {"keeptank" "Keep"}}', '}']);
put('game/resource/set/multiplayer/units/common.set', [';SDL', '{units', '\t{"keeptank" {tags "all"}}', '}']);
const M = 'game/mods/m/';
put(M + 'mod.info', ['{name "m"}']);
put(M + 'localization/desc.lng', ['{tags', '\t{"entity"', '\t\t(include "desc/van.inc") (include "desc/a.inc")', '\t\t(include "desc/b.inc")',
  '\t\t(include "desc/gone.inc")', '\t}', '}']);
put(M + 'localization/desc/van.inc', ['{"oldtank" "Old"}', '{"keeptank" "Keep"}']);
put(M + 'localization/desc/a.inc', ['{"newtank" "New A"}']);
put(M + 'localization/desc/b.inc', ['; later wins', '{"newtank" "New B"}']);
put(M + 'resource/set/multiplayer/units/common.set', [';SDL', '{units', '\t{"keeptank" {tags "all"}}', '\t{"newtank" {tags "all"}}', '\t{"lost" {tags "all"}}', '}']);

const want = ['localization/desc.lng:5 LOC_INCLUDE_MISSING', 'resource/set/multiplayer/units/common.set:5 LOC_NAME_MISSING'].join('|');
let bad = 0;
for (const [name, opts] of [['mounted', { folder: path.join(W, M) }], ['loose', { folder: path.join(W, M), gameDir: undefined, mods: [] }]]) {
  if (name === 'loose') fs.renameSync(path.join(W, M), path.join(W, 'loose')), opts.folder = path.join(W, 'loose');
  const { rep } = check({ ...opts, noStuff: true });
  const got = rep.toJSON({ tool: 'loccover' }).findings.map(f => `${f.file}:${f.line} ${f.code}`).sort().join('|');
  if (got !== want) { console.log(`FAIL inc ${name}: got ${got} want ${want}`); bad++; }
}
fs.rmSync(W, { recursive: true, force: true });
if (!bad) console.log('inc ok');
