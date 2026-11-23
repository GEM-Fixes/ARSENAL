// armorsim test: pen.js against hand-computed engine formulas; armordata on a synthetic loose folder (written to a temp dir).
// node test.js [--real <gameDir>]  (--real prints one vanilla tank + one AP shell, nothing stored)
// Author: Imperator_Aug (ARSENAL, ia-6297ef43)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const pen = require('../pen'), ad = require('../armordata');

let fails = 0, n = 0;
const near = (a, b, e = 0.01) => Math.abs(a - b) <= e;
function eq(name, got, want) {
  n++;
  const ok = typeof want === 'number' ? typeof got === 'number' && near(got, want) : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log('FAIL ' + name + ': got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); }
}

if (process.argv[2] === '--real') { real(process.argv[3]); process.exit(0); }

// ---------- pen.js ----------
const AP = { calibre: 75, table: [[10, 122], [50, 111], [75, 98], [100, 85], [125, 74], [175, 0]], projectileDamageThreshold: 1.15,
  overmatchDamping: [[0, 1], [30, 1.1], [55, 1.15], [60, 1.45], [70, 4], [90, 6]] };
eq('tableGet clamp low', pen.tableGet(AP.table, 0), 122);
eq('tableGet interp', pen.tableGet(AP.table, 30), 116.5);
eq('tableGet clamp high', pen.tableGet(AP.table, 500), 0);
eq('strict past last', pen.tableGetStrict([[0, 1], [30, 2]], 40), null);
eq('penetrationAt 50', pen.penetrationAt(AP, 50), 111);
eq('slope cap', pen.slope(89.9).damageScale, 10);
eq('side names', [pen.sideIndex('rear'), pen.sideIndex(-1), pen.sideIndex('back')], [4, 0, 4]);

// flat hit: 80 mm at 0 deg, 122 pen -> passes, energy 1 - 80/122
let v = pen.plate({ energy: 122, shell: AP }, { thickness: 80, angleDeg: 0 });
eq('flat result', v.result, 'penetrate'); eq('flat eff', v.effective, 80); eq('flat scale', v.energyScale, 1 - 80 / 122); eq('flat residual', v.residual, 42);
eq('flat threshold', v.threshold, 80 / 1.15); eq('flat pierce event', v.pierceEvent, true);
// angled: 50 mm at 60 deg, slope 2, overmatch 50/75*1.45 = 0.9667 -> eff = (1*0.9667+1)*50 = 98.33
v = pen.plate({ energy: 111, shell: AP }, { thickness: 50, angleDeg: 60 });
eq('angled eff', v.effective, 98.333); eq('angled result', v.result, 'penetrate');
v = pen.plate({ energy: 85, shell: AP }, { thickness: 50, angleDeg: 60 });
eq('angled fail', v.result, 'ricochet'); eq('angled fail chance unknown', v.chance, null);
// overmatch: 20 mm at 60 deg: 20/75*1.45 = 0.3867 -> eff 27.73; 5 mm: clamp 0.2 -> eff 6
eq('overmatch partial', pen.plate({ energy: 50, shell: AP }, { thickness: 20, angleDeg: 60 }).effective, 27.733);
eq('overmatch floor', pen.plate({ energy: 50, shell: AP }, { thickness: 5, angleDeg: 60 }).effective, 6);
// ricochet chance from a material: 70 deg from normal = 20 grazing -> 1 + (20-15)/(30-15)*(0.6-1) = 0.8667
const steel = { durabilityPierce: 1, ricochet: { chance: [[0, 1], [15, 1], [30, 0.6], [45, 0.3], [75, 0], [90, 0]] } };
v = pen.plate({ energy: 50, shell: AP }, { thickness: 80, angleDeg: 70, material: steel });
eq('ricochet chance', v.chance, 0.8667, 0.001);
v = pen.plate({ energy: 50, shell: AP, ricochets: 2 }, { thickness: 80, angleDeg: 70, material: steel });
eq('ricochet limit', v.result, 'no_penetration');
// HE: detonationThickness 2, no ricochet (fg)
const HE = { calibre: 75, table: [[0, 30]], detonationThickness: 2, noRicochet: true };
eq('he passes then fuze', pen.plate({ energy: 30, shell: HE }, { thickness: 20, angleDeg: 0 }).result, 'detonate');
v = pen.plate({ energy: 30, shell: HE }, { thickness: 40, angleDeg: 0 });
eq('he stopped', v.result, 'no_penetration'); eq('he no ricochet', v.chance, 0);
// HEAT: curve linear x projectileDamage, reach 0.7 m past the first hit
const HEAT = { calibre: 50, projectileDamage: 200, aimRange: 30, curve: { name: 'linear', points: [[0, 1], [1, 1], [1.01, 0]] }, cumulative: 0.7, noRicochet: true };
eq('heat pen 20m', pen.penetrationAt(HEAT, 20), 200); eq('heat pen 40m', pen.penetrationAt(HEAT, 40), 0);
let r = pen.resolveShot(HEAT, 20, [{ volumeId: 'a', thickness: 80, angleDeg: 0, distanceM: 10 }, { volumeId: 'b', thickness: 10, angleDeg: 0, distanceM: 11 }]);
eq('heat beyond jet', r.verdicts.map(x => x.result), ['penetrate', 'beyond_jet']);
// APCR: same rules, its own table (selected in armordata); flat 100 mm vs 150
eq('apcr flat', pen.plate({ energy: 150, shell: { calibre: 75, table: [[0, 150]] } }, { thickness: 100, angleDeg: 0 }).result, 'penetrate');
// two plates, second pass: energy -= absorbed / damage (damage already scaled): 1-40/122, then -30/82
r = pen.resolveShot(AP, 10, [{ volumeId: 'p1', thickness: 40, angleDeg: 0 }, { volumeId: 'p2', thickness: 30, angleDeg: 0 }]);
eq('two plates pass', r.outcome, 'passed_all'); eq('two plates scale', r.energyScale, (1 - 40 / 122) - 30 / (122 * (1 - 40 / 122)), 1e-6);
// stops in the second plate: 122 -> 42 left, 50 mm flat, steel at 0 deg (90 grazing) chance 0 -> detonates there
r = pen.resolveShot(AP, 10, [{ volumeId: 'p1', thickness: 80, angleDeg: 0 }, { volumeId: 'x/p2', thickness: 50, angleDeg: 0, material: steel }]);
eq('stop second', [r.stoppedAt, r.outcome, Math.round(r.verdicts[1].penetration)], [1, 'no_penetration', 42]);
// exit face: no energy loss
v = pen.plate({ energy: 100, energyScale: 1, shell: AP }, { thickness: 30, angleDeg: 0, enter: false });
eq('exit no loss', [v.result, v.energyScale], ['penetrate', 1]);
// area override: own 30 all, area front 80 side 0 -> front 80, left 30, bottom = area top
const area = { name: 'body', thickness: { front: 80, side: 0, rear: 25, top: 20 } };
eq('area sides', [0, 2, 4, 5].map(s => pen.nominalThickness({ own: [30, 30, 30, 30, 30, 30], area, side: s })), [80, 30, 25, 20]);
// armour damage: threshold koef 0.5, durability koef 999 -> min share
v = pen.plate({ energy: 122, shell: AP }, { thickness: 80, angleDeg: 0, area: Object.assign({ threshold: { pierce: { koef: 0.5 } }, durability: { pierce: { koef: 999 } } }, { thickness: { front: 0, side: 0, rear: 0, top: 0 } }) });
eq('armor damage', v.armorDamage, Math.max((80 - 40) * 80 / 40, 0.5 * 80) / (999 * 80), 1e-9);

// ---------- armordata on a synthetic folder ----------
const fx = fs.mkdtempSync(path.join(os.tmpdir(), 'armorsim-'));
const W = (rel, text) => { const f = path.join(fx, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text.replace(/\n/g, '\r\n'), 'latin1'); };
W('resource/properties/tkarmor.inc', `(define "armor_t"
\t{armor
\t\t{setting "body"
\t\t\t{thickness %bod}
\t\t\t{volumes "body*"}
\t\t\t{threshold {pierce {koef 0.5}}}
\t\t\t{durability {pierce {koef 999}}}
\t\t}
\t}
)
`);
W('resource/entity/vehicle/tk/tk.def', `{game_entity
\t(include "/properties/tkarmor.inc")
\t{props "steel"}
\t{volume "body1"
\t\t{tags "body"}
\t\t{thickness 30 {front 60} {top 15}}
\t}
\t{volume "hatch"
\t\t{thickness 10}
\t}
\t("armor_t" bod(80 0 25 20))
\t{Extension "tk.mdl"}
}
`);
W('resource/entity/vehicle/tk/tk.mdl', `{Skeleton
\t{bone "basis"}
}
{Volume "body1"
\t{Box 1 2 3}
\t{Bone "body"}
}
{Volume "mantle"
\t{Box 1 1 1}
\t{Bone "gun"}
}
`);
W('resource/set/stuff/gun/gun.pattern', `{weapon_bullet
\t{tag "weapon gun"}
\t{range 100 110}
\t{projectileDamageThreshold 1.15}
\t{OvermatchDamping {0 1} {90 6}}
\t{parameters "apcr"
\t\t{range 90 100}
\t}
}
`);
W('resource/set/stuff/gun/tg75', `{from "pattern gun"
\t{filling "bullet75"}
\t{projectileDamageTable {10 120} {100 80}}
\t{parameters "apcr"
\t\t{projectileDamageTable {10 150} {100 90}}
\t}
}
`);
W('resource/set/stuff/shell/ap.pattern', `{bullet
\t{tag "ammo shell ap"}
}
`);
W('resource/set/stuff/shell/bullet75.ap.ammo', `{from "pattern ap"
\t{tag "pierce"}
}
`);
W('resource/set/stuff/shell/bullet100.ap.ammo', `{from "pattern ap"
}
`);   // another calibre, sorts first (GT fix: --ammo ap)
W('resource/set/stuff/shell/bullet75.apcr.ammo', `{bullet
\t{tag "ammo shell apcr"}
}
`);
W('resource/set/stuff/shell/bullet75.fg.ammo', `{bullet
\t{tag "ammo shell fg"}
\t{detonationThickness 2}
\t{damage blastwave {energy 5} {area 0.2 0.5}}
\t{damage add blastwave {energy 1} {area 3 5}}
}
`);
W('resource/set/material.set', `{materials
\t{"steel"
\t\t{ricochet {chance {0 1} {30 0.6} {90 0}} {velocityDumping 0.9}}
\t\t{steelEquivalent 0.1}
\t\t{durability {pierce 1} {blast 1}}
\t}
}
`);
// vanilla spelling (15 vanilla defs, all `defaultmaterial`; engine keyword DefaultMaterial)
W('resource/entity/construction/bg/bg.def', `{game_entity
	{props "steel"}
	{volume defaultmaterial "sand"}
	{volume "body"
		{thickness 5}
	}
}
`);
W('resource/entity/construction/bh/bh.def', `{game_entity
	{props "steel"}
	{volume default_material "sand"}
}
`);
const o = { folder: fx };
const A = ad.vehicleArmor('tk', o);
eq('def found', A && A.key, 'resource/entity/vehicle/tk/tk.def');
const b1 = A.volumes.body1;
eq('body1 own', b1.own, { front: 60, top: 15, left: 30, right: 30, rear: 30, bottom: 30 });
eq('body1 area', b1.area, 'body');
eq('body1 thickness', b1.thickness, { front: 80, top: 20, left: 30, right: 30, rear: 25, bottom: 20 });
eq('body1 area source in include', b1.source.area[0].file, 'resource/properties/tkarmor.inc');
eq('body1 area edit site = macro call', b1.source.area[0].site, { file: 'resource/entity/vehicle/tk/tk.def', line: 11 });
eq('body1 own front source', b1.source.own[0].line, 6);
eq('hatch no area', [A.volumes.hatch.area, A.volumes.hatch.thickness.rear], [null, 10]);
eq('model volume', [A.volumes.mantle.inModel, A.volumes.mantle.inDef, A.volumes.mantle.bone, A.volumes.body1.bone], [true, false, 'gun', 'body']);
eq('default material', A.defaultMaterial, 'steel');
eq('vanilla defaultmaterial read', (ad.vehicleArmor('bg', o) || {}).defaultMaterial, 'sand');
eq('default_material is not an engine key', (ad.vehicleArmor('bh', o) || {}).defaultMaterial, 'steel');
eq('area threshold', A.areas[0].threshold.pierce.koef, 0.5);
const M = ad.materials(o);
eq('material chance', M.steel.ricochet.chance, [[0, 1], [30, 0.6], [90, 0]]);
const S = ad.shell({ weapon: 'tg75', ammo: 'bullet75 ap' }, o);
eq('ap shell', S && [S.kind, S.calibre, S.params, S.aimRange, S.projectileDamageThreshold], ['ap', 75, '(default)', 100, 1.15]);
eq('ap table', S.table, [[10, 120], [100, 80]]);
eq('ap tags', S.tags.slice().sort(), ['ammo', 'ap', 'bullet75', 'pierce', 'shell']);
const C = ad.shell({ weapon: 'tg75', ammo: 'bullet75 apcr' }, o);
eq('apcr shell', [C.kind, C.params, C.aimRange, C.table], ['apcr', 'apcr', 90, [[10, 150], [100, 90]]]);
const H = ad.shell({ weapon: 'tg75', ammo: 'bullet75 fg' }, o);
eq('he shell', [H.kind, H.detonationThickness, H.noRicochet, H.damage.length], ['he', 2, true, 2]);
const G = ad.shell('tg75', o);
eq('weapon only picks ap', G.ammo, 'bullet75.ap.ammo');
const K = ad.shell({ weapon: 'tg75', ammo: 'ap' }, o);   // a kind word only: the ammo the weapon loads, not bullet100
eq('kind word names the weapon ammo', K && [K.ammo, K.kind], ['bullet75.ap.ammo', 'ap']);
// an ammo name that resolves to nothing: flagged in the shell, refused by sim.shellFrom (never the AP shell silently)
const XHE = ad.shell({ weapon: 'tg75', ammo: 'bullet75 he' }, o);
eq('unresolved ammo: fallback flagged', XHE && XHE.ammoFallback && [XHE.ammo, XHE.ammoFallback.asked, XHE.ammoFallback.used, XHE.ammoFallback.loads.includes('bullet75.fg.ammo')], ['bullet75.ap.ammo', 'bullet75 he', 'bullet75.ap.ammo', true]);
eq('resolved ammo: no fallback', [S.ammoFallback, H.ammoFallback], [null, null]);
const simx = require('../sim');
const HEs = simx.shellFrom({ weapon: 'tg75', ammo: 'bullet75 he' }, o);
eq('sim.shellFrom: unresolved ammo is an error naming what the weapon loads', [/No ammo "bullet75 he"/.test(HEs.error || ''), /bullet75\.fg\.ammo/.test(HEs.error || ''), !HEs.table], [true, true, true]);
eq('sim.shellFrom: allowFallback keeps the flagged default', simx.shellFrom({ weapon: 'tg75', ammo: 'bullet75 he', allowFallback: true }, o).ammoFallback.used, 'bullet75.ap.ammo');
// a real ammo the weapon does not load (bullet100 for the 75 mm gun): fired, flagged ammoNotLoaded (shell, sim.shoot); loaded: null
const NL = simx.shellFrom({ weapon: 'tg75', ammo: 'bullet100.ap.ammo' }, o);
eq('ammo the weapon does not load: run, flagged with what it loads', NL && [!NL.error, NL.ammo, NL.ammoNotLoaded && NL.ammoNotLoaded.asked, NL.ammoNotLoaded && NL.ammoNotLoaded.weapon,
  NL.ammoNotLoaded && NL.ammoNotLoaded.loads.includes('bullet75.ap.ammo'), NL.ammoNotLoaded && NL.ammoNotLoaded.loads.includes('bullet100.ap.ammo'), NL.ammoFallback],
  [true, 'bullet100.ap.ammo', 'bullet100.ap.ammo', 'tg75', true, false, null]);
eq('ammo the weapon loads: ammoNotLoaded null', [S.ammoNotLoaded, H.ammoNotLoaded, K.ammoNotLoaded], [null, null, null]);
eq('sim.shoot carries ammoNotLoaded (also on a miss)', [simx.shoot({ scene: {}, shapes: [] }, NL, 100, { origin: [0, 0, 0], dir: [1, 0, 0] }).ammoNotLoaded, simx.shoot({ scene: {}, shapes: [] }, S, 100, { origin: [0, 0, 0], dir: [1, 0, 0] }).ammoNotLoaded],
  [NL.ammoNotLoaded, null]);
eq('sim.shellFrom: the file name form resolves', simx.shellFrom({ weapon: 'tg75', ammo: 'bullet75.fg.ammo' }, o).ammo, 'bullet75.fg.ammo');
// a rocket: weapon and ammo share the name (rk.weapon / rk.ammo); no damage table, no curve -> the engine's unnamed default curve
W('resource/set/stuff/reactive/rk.weapon', `{weapon_bullet
\t{tag "gun"}
\t{filling "ammo rk" 4}
\t{range 190 200}
}
`);
W('resource/set/stuff/reactive/rk.ammo', `{bullet
\t{tag "big shell fg bomb"}
\t{detonationThickness 1}
\t{damage blastwave {energy 8} {area 1 2}}
\t{damage fire {radius 5} {heating 0.8} {time 3}}
}
`);
const RK = ad.shell({ weapon: 'rk', ammo: 'rk.ammo' }, { src: require('../../lib/sdlset').createSource({ folder: fx }) });
eq('rocket: the weapon is rk.weapon, not rk.ammo', RK && [RK.weaponKey, RK.ammo], ['resource/set/stuff/reactive/rk.weapon', 'rk.ammo']);
eq('rocket: no curve named -> engine default curve', RK && [RK.curve.engineDefault, RK.curve.points], [true, [[0, 1.2], [0.5, 0.9], [1, 0.7], [2, 0]]]);
eq('rocket: damage at 95 m of aim 190 = default curve at 0.5', RK && pen.penetrationAt(RK, 95), 0.9, 1e-9);
eq('rocket: fire filling read with its source', RK && [RK.damage[1], RK.source.damage[1].fields.heating.line], [{ type: 'fire', radius: 5, heating: 0.8, time: 3 }, 5]);
// end to end: the synthetic shell through the synthetic hull front at 10 m, 30 deg
r = pen.resolveShot(S, 10, [{ volumeId: 'basis/body/body1', side: 'front', angleDeg: 60 }], { armor: A, materials: M });
const effWant = ((2 - 1) * 1 + 1) * 80;   // 60 deg: slope 2, overmatch 80/75*4.33 clamps to 1 -> 160 > 120
eq('e2e eff', r.verdicts[0].effective, effWant); eq('e2e result', r.verdicts[0].result, 'ricochet'); eq('e2e chance', r.verdicts[0].chance, 0.6, 0.001);   // grazing 30 on steel
fs.rmSync(fx, { recursive: true, force: true });

console.log(n + ' checks, ' + fails + ' failed');
console.log(fails ? 'FAIL' : 'PASS');
process.exit(fails ? 1 : 0);

function real(game) {
  const o = { game };
  const t0 = Date.now();
  const A = ad.vehicleArmor('pz4h', o);
  console.log('pz4h', A.key, 'model', A.model, 'material', A.defaultMaterial);
  for (const v of Object.values(A.volumes)) console.log('  ' + v.name.padEnd(12), 'area', String(v.area).padEnd(8), 'f/t/l/r/rear/b', v.effectiveSides.join('/'), v.inModel ? '' : '(def only)');
  const S = ad.shell({ weapon: '75mm_kwk40(L48)', ammo: 'bullet75 ap' }, o);
  console.log('shell', S.weapon, S.ammo, S.kind, 'calibre', S.calibre, 'params', S.params, 'threshold', S.projectileDamageThreshold);
  console.log('  pen', JSON.stringify(S.penetration), 'overmatch', JSON.stringify(S.overmatchDamping));
  const r = pen.resolveShot(S, 50, [{ volumeId: 'body1', side: 'front', angleDeg: 20 }], { armor: A, materials: ad.materials(o) });
  console.log('  50 m vs body1 front at 20 deg:', JSON.stringify(r.verdicts.map(x => [x.result, Math.round(x.effective * 10) / 10, x.penetration, x.chance])));
  console.log('ms', Date.now() - t0);
}
