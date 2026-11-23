// covcheck test: invented data only, no game, no installs.
// Core claim: a folder or type the matrix has no row for is reported, never silently counted.
// Author: Imperator_Aug (ARSENAL, ia-b1a2c3e1)
const assert = require('assert');
const path = require('path');
const C = require('../covcheck.js');
let n = 0;
const ok = (c, m) => { n++; if (!c) { console.error('FAIL: ' + m); process.exitCode = 1; } };
const e = (key) => ({ key, name: key, size: 1 });

// 1. seeded unknown folder is caught
const invented = [
  e('entity/-vehicle/t34/t34.def'), e('set/stuff/rifle.ammo'), e('map/single/m1/map.mi'),
  e('zzz_unknown/thing.bin'), e('zzz_unknown/other.bin'), e('texture/common/a.dds'),
];
const r = C.tally({ invented });
ok(r.unmapped.length > 0, 'seeded unknown folder reported');
ok(r.unmapped.some(u => u.group === 'zzz_unknown'), 'unmapped names the folder zzz_unknown');
ok(r.unmapped.find(u => u.group === 'zzz_unknown').files === 2, 'unmapped counts its 2 files');
ok(!r.unmapped.some(u => /t34|rifle|texture/.test(u.group)), 'known folders are not reported');
ok(r.byRow.C01.invented === 1 && r.byRow.C04.invented === 1 && r.byRow.C23.invented === 1, 'known files land on C01, C04, C23');
ok(r.ok === false, 'result flags not ok when something is unmapped');

// 2. a known type in an unknown folder, and a known folder with an unknown type, are both caught
const r2 = C.tally({ invented: [e('zzz_unknown/a.def'), e('sound/weapon/x.qqq'), e('shader/cache/y.mkv'), e('set/newfolder/z.set')] });
ok(r2.unmapped.some(u => u.group === 'zzz_unknown'), 'unknown folder with a known extension (.def) still caught');
ok(r2.unmapped.some(u => u.group === 'sound/weapon/*.qqq'), 'known sound folder, unknown type caught');
ok(r2.unmapped.some(u => u.group === 'shader/cache/*.mkv'), 'known shader folder, unknown type caught');
ok(r2.unmapped.some(u => u.group === 'set/newfolder/*.set'), 'new subfolder under set/ caught');
ok(r2.ok === false, 'not ok');

// 3. clean data passes
const r3 = C.tally({ invented: [e('entity/-vehicle/a.def'), e('set/stuff/b.set')] });
ok(r3.ok === true && r3.unmapped.length === 0, 'clean invented data passes');

// 4. the typeless row assignments are fixed (who reads them, game/)
ok(C.classify('set/difficulty/easy.dl') === 'C20', '.dl -> C20');
ok(C.classify('set/stuff/x.presets') === 'C04', '.presets -> C04');
ok(C.classify('set/stuff/x.pattern') === 'C04', '.pattern -> C04');
ok(C.classify('interface/scene/vehicle_view/t/part.ebm') === 'C31', '.ebm vehicle_view -> C31');
ok(C.classify('interface/cursor/c.ebm') === 'C32', '.ebm in interface/cursor follows its folder -> C32');
ok(C.classify('texture/common/a.ebm') === 'C23', '.ebm in texture -> C23');
ok(C.classify('map/single/m/map.grs') === 'C10', '.grs -> C10');
ok(C.classify('resource/map/multi/m/map.grs') === 'C10', 'resource/ prefix is stripped');

// 5. every matrix row has a letter and an id C01..C43
ok(C.ROWS.length === 43 && C.ROWS.every(x => /^C\d\d$/.test(x.id) && /^[GFSRNL]$/.test(x.now)), '43 rows with a now letter');

// 6. GoH rules (--exe goh): GoH folders land on rows, the AS2 rules alone leave them unmapped, AS2 answers unchanged
const GR = C.GOH_RULES.concat(C.RULES);
const goh = [e('sound/talk/cannon/fin/v1/a.wav'), e('default/interface/text/units.pot'), e('default/localization.info'), e('interface/layout/gui.xml'),
  e('set/dynamic_campaign/values.set'), e('set/curves/tonemapping/default.bzc'), e('set/tp_control.set'), e('shader/cache/dx11.0/x.dso'),
  e('difficulties/easy.dl'), e('sound/mission/bonus/license'), e('entity/misc/ruler_10m/ruler.def')];
const g1 = C.tally({ goh }, GR);
ok(g1.ok, 'GoH fixture: every file lands with GOH_RULES: ' + JSON.stringify(g1.unmapped.map(u => u.group)));
ok(C.tally({ goh }).unmapped.length > 0, 'AS2 rules alone leave GoH folders unmapped');
ok(C.classify('default/interface/text/units.pot', GR) === 'C35' && C.classify('sound/talk/x/a.ogg', GR) === 'C29', 'GoH .pot -> C35, talk -> C29');
ok(C.classify('set/stuff/x.pattern', GR) === 'C04' && C.classify('entity/-vehicle/a.def', GR) === 'C01', 'AS2 rules still apply under GoH');
ok(C.classify('set/dynamic_campaign/values.set') === null, 'AS2 rules unchanged: GoH folder not known without --exe goh');
// 7. GoH roots: install from games.install, mods from the GoH workshop app, a missing mod is left out with a note
const fakeGd = { workshop: (app, id) => (app === 400750 && id === 2537987794 ? '/w/val' : null) };
const fakeGames = { install: () => ({ dir: '/goh' }), notFor: (t, g, w) => t + ': not available for GoH: ' + w };
let gr = C.gohRoots(['--mod', '/m/my_mod/'], { gamedir: fakeGd, games: fakeGames });
ok(gr.roots.vanilla.dir === '/goh/resource' && gr.roots['vanilla+loc'].dir === '/goh/localizations', 'GoH vanilla = install resource + localizations');
ok(gr.roots.valour.dir === '/w/val/resource' && gr.roots['valour+loc'].dir === '/w/val/localizations', 'GoH Valour from workshop app 400750');
ok(!gr.roots.mace && gr.notes.some(x => /^mace: not found/.test(x)), 'missing MACE noted, left out');
ok(gr.roots.my_mod.dir === '/m/my_mod/resource', '--mod folder by name');
gr = C.gohRoots([], { gamedir: fakeGd, games: { install: () => ({ dir: null }), notFor: fakeGames.notFor } });
ok(gr.error && /not available for GoH/.test(gr.error), 'no GoH install: one plain line');
// 8. unknown --exe: exit 2
{ const err = console.error; console.error = () => {}; try { ok(C.main(['--exe', 'nosuch', '--no-write']) === 2, 'unknown --exe exit 2'); } finally { console.error = err; } }

console.log(n + ' checks' + (process.exitCode ? ', FAILED' : ', ok'));
