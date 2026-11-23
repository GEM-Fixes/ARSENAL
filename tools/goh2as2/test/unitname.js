// unitname stage: seeded GoH + AS2 tree under test/fixture/un (rewritten each run). prints PASS/FAIL lines; exit 1 on any fail
// Author: Imperator_Aug (ARSENAL, ia-bdf4af10)
const fs = require('fs'), path = require('path');
const { zip } = require('../../lib/zipwrite');
const U = require('../unitname');
const d = path.join(__dirname, 'fixture', 'un');
const W = (rel, data) => { const f = path.join(d, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
const pot = rows => '# test\r\nmsgid ""\r\nmsgstr ""\r\n\r\n' + rows.map(([k, t]) => `msgctxt "${k}"\r\nmsgid "${t}"\r\nmsgstr ""\r\n`).join('\r\n');

W('goh/localizations/default.pak', zip([['default/interface/text/desc/v.pot', Buffer.from(pot([
  ['desc/entity/tank_a', 'Tank A old'], ['desc/entity/vanunit', 'GoH Van'], ['info/tank_a', 'Long text A'],
  ['info/special/tank_a', '<c(ffffff)>Medium Tank</c>']]), 'utf8')]]));
W('gohmod/resource/x.pak', zip([['interface/text/desc/m.pot', Buffer.from(pot([
  ['desc/entity/tank_a', 'Tank “A” – Jäger'], ['desc/entity/gun_b', 'Gun B']]), 'utf8')]]));
W('gohmod/localizations/ru.pak', zip([['ru/interface/text/desc/m.po', Buffer.from(pot([['desc/entity/onlypo', 'PO']]), 'utf8')]]));
W('as2/localization.pak', zip([['desc.lng', Buffer.from('{tags\r\n\t{"entity"\r\n\t\t{"vanunit" "Van"}\r\n\t}\r\n}\r\n', 'utf8')]]));
const def = '{game_entity\r\n}\r\n';
for (const m of ['m', 'dm']) {
  for (const u of ['tank_a/tank_a.def', 'tank_a/tank_a.unfit.def', 'gun_b/gun_b.def', 'heavy_mg_gun_b/heavy_mg_gun_b.def', 'vanunit/vanunit.def',
    'onlypo/onlypo.def', '-vehicle/x/inc.def', 'modnamed/modnamed.def', 'old_mk_ii/mk_vi_0_3cal.def']) W(`as2/mods/${m}/resource/entity/${u}`, def);
  W(`as2/mods/${m}/localization/#own.lng`, '{tags\r\n\t{"desc" {"entity" {"modnamed" "Mine"}}}\r\n}\r\n');
}
const out = path.join(d, 'as2/mods/m/localization/#goh2as2_names.lng');
if (fs.existsSync(out)) fs.writeFileSync(out, '{tags\r\n}\r\n');   // stale own file must not count as a mod key

let ok = 1;
const chk = (name, c, extra) => { if (!c) { ok = 0; console.log('FAIL: ' + name + (extra ? ' | ' + extra : '')); } };
const o = { mod: path.join(d, 'as2/mods/m'), goh: path.join(d, 'goh'), gohMods: [path.join(d, 'gohmod')], game: path.join(d, 'as2') };
const r = U.run(o);
const buf = fs.readFileSync(out), txt = buf.toString('utf8');
const codes = r.rep.counts || {};
chk('no BOM, UTF-8, CRLF only', buf[0] !== 0xEF && !/[^\r]\n/.test(txt) && /\r\n/.test(txt));
chk('mod pot wins over H pot, marks to ASCII, umlaut kept', txt.includes('{"tank_a" "Tank \\"A\\" - Jäger"}'), txt);
chk('plain GoH name', txt.includes('{"gun_b" "Gun B"}'));
chk('near key heavy_mg_x -> x', txt.includes('{"heavy_mg_gun_b" "Gun B"}') && codes.UNIT_NAME_NEAR === 1);
chk('.po not read -> fallback', txt.includes('{"onlypo" "Onlypo"}') && !txt.includes('"PO"'));
chk('fallback name shape', txt.includes('{"mk_vi_0_3cal" "MK VI .3CAL"}'), txt);
chk('vanilla key never written', !/vanunit/.test(txt) && codes.UNIT_KEY_VANILLA === 1);
chk('mod key not shadowed', !/modnamed/.test(txt));
chk('side copy and - dir skipped', !/unfit|"inc"/.test(txt));
chk('info/entity from GoH info/<x>', txt.includes('{"entity"\r\n\t\t\t{"tank_a" "Long text A"}'), txt);
chk('info/special tags dropped', txt.includes('{"special"\r\n\t\t\t{"tank_a" "Medium Tank"}'));
chk('counts', r.counts.units === 7 && r.counts.goh === 2 && r.counts.near === 1 && r.counts.fallback === 2 && r.counts.vanilla === 1 && r.counts.mod === 1, JSON.stringify(r.counts));
chk('# file: desc/entity keys (title dropped, LOC-10)', /\{tags\r\n\t\{"desc"\r\n\t\t\{"entity"/.test(txt));
U.run(o); chk('rerun gives same bytes', Buffer.compare(fs.readFileSync(out), buf) === 0);
const dm = path.join(d, 'as2/mods/dm/localization/#goh2as2_names.lng');
U.run({ ...o, mod: path.join(d, 'as2/mods/dm'), dryRun: true }); chk('dry run writes nothing', !fs.existsSync(dm));
chk('titled file refused', U.run({ ...o, file: 'desc.lng', dryRun: true }).fail === 2);
console.log(ok ? 'UNITNAME-OK' : 'UNITNAME-FAIL');
process.exitCode = ok ? 0 : 1;
