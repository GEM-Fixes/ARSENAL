// pricecalc regression: builds a fixture mod + sheet TSVs + hand model in a temp dir, checks findings against truth.md,
// prices, seed (no overwrite, --merge), apply idempotence, CRLF, undo byte-exact, retail safety (check), --set-prices.
// Author: Imperator_Aug (ARSENAL, ia-5bae2365)
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync, spawnSync } = require('child_process');
const M = require('../mod');

const TOOL = path.join(__dirname, '..', 'pricecalc.js');
const base = process.env.PRICECALC_TMP || require('../../lib/platform').tmpDir('pricecalc/t');
fs.rmSync(base, { recursive: true, force: true });
const mod = path.join(base, 'mod');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL ' + m); } };
const crlf = s => s.replace(/\r?\n/g, '\r\n');
const W = (rel, text, raw) => { const f = path.join(mod, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, raw ? text : crlf(text), 'latin1'); };
const run = (args, expectFail) => {
  const r = spawnSync(process.execPath, [TOOL, ...args], { encoding: 'latin1', env: Object.assign({}, process.env, { AS2_GAME: '' }) });
  if (!expectFail && r.status !== 0 && r.status !== 1) console.log('exit ' + r.status + ' ' + r.stderr);
  return r;
};

// ---- fixture mod ----
W('resource/set/breed/breed_macros.inc', `(define "breed_vet"
	{veterancy
		(include "veterancy_generic.inc")
		("vet_start_%start" table(%table))
	}
)
(define "soldier_rifle_3"
	{"health" "150%"}
	{"rifle" lvl_3}
	{"smg" lvl_2}
	{"rocketlauncher" lvl_%rocket}
)
(define "give" {item "%item" %count})
(define "give_chance_25" {item "%item" 0 1})
(define "rifle_mauzer" {item "mauzer" filled} {item "ammo mauser_clip" 10})
`);
W('resource/set/breed/mp/ger/veterancy_generic.inc', `(define "vet_start_1" ("vet_%table"))
(define "vet_start_2" ("vet_from2_%table"))
(define "vet_standard" {"lvl_1" 24} {"lvl_2" 60} {"lvl_3" 108} {"lvl_4" 168} {"lvl_5" 240})
(define "vet_from2_standard" {"lvl_1" -1} {"lvl_2" 0} {"lvl_3" 48} {"lvl_4" 120} {"lvl_5" 192})
`);
const breed = (perks, vet, inv, extra = '') => `(include "/set/breed/breed_macros.inc")
{breed
	{armors {head "helmet_ger_m40"}}
	{perks
${perks}
	}
	${vet}
	{inventory
${inv}
	}${extra}
}
`;
W('resource/set/breed/mp/ger/rifle.set', breed('\t\t("soldier_rifle_3" rocket(1))', '("breed_vet" table(standard) start(1))',
  '\t\t("rifle_mauzer")\n\t\t("give" item(grenade m24) count(2))\n\t\t("give_chance_25" item(smoke grenade))'));
W('resource/set/breed/mp/ger/smg.set', breed('\t\t{"smg" lvl_4}\n\t\t{"health" "200%"}', '("breed_vet" table(standard) start(2))', '\t\t{item "mp40" filled}\n\t\t{item "ammo mp40_mag" 6}'));
W('resource/set/breed/mp/ger/badvet.set', breed('\t\t{"smg" lvl_4}', '("breed_vet" table(crew) start(2))', '\t\t{item "mp40" filled}'));
W('resource/set/breed/mp/ger/weird.set', breed('\t\t{"smg" lvl_3}', '("breed_vet" table(standard) start(1))', '\t\t{item "zk383" filled}\n\t\t{item "unobtainium" 1}'));
for (const s of ['rifle/mauzer', 'smg/mp40', 'smg/zk383', 'grenade/01 grenade_ap/m24.grenade', 'grenade/00 grenade_smoke/smoke.grenade']) W('resource/set/stuff/' + s, '{stuff}\n');
W('resource/set/ability/veterancy.set', [1, 1, 2, 2, 3].map((w, i) => `{"lvl_${i + 1}" from veterancy\n\t{"health" ${(i + 1) / 10}}\n\t{"weapon_skill" ${w}}\n}`).join('\n') + '\n');
const lvl = (n, cp, sc) => `(define "level_${n}"\n\t{tags   "level_${n} %side soldier"}\n\t{cp     ${cp}}\n\t{score  ${sc}}\n\t{basic}\n\t{breed}\n\t{cw ${cp}}\n)\n`;
W('resource/set/multiplayer/units/soldiers.set', ';fixture price rows\n' + lvl(1, 0.6, '10.0') + lvl(2, 1.44, '14.0') +
  '{"mp/ger/rifle" ("level_1" side(ger))}\n{"mp/ger/smg" ("level_2" side(ger))}\n{"mp/ger/badvet" ("level_1" side(ger))}\n{"mp/ger/weird" ("level_1" side(ger))}\n{"mp/ger/ghost" ("level_1" side(ger))}\n' +
  // officer (fixed price, negative CP) and radioman (priced solely on his call-in item)
  '(define "level_0_v2"\n\t{tags   "level_0 %side soldier"}\n\t{cp     -10.0}\n\t{score  1000.0}\n\t{basic}\n\t{breed}\n\t{cw 100.0}\n)\n' +
  '(define "level_radio"\n\t{tags   "level_r %side soldier"}\n\t{cp     5}\n\t{score  200}\n\t{basic}\n\t{breed}\n\t{cw 5}\n)\n' +
  '{"mp/ger/officer" ("level_0_v2" side(ger))}\n{"mp/ger/radioman" ("level_radio" side(ger))}\n' +
  '(define "level_k"\n\t{tags   "level_k %side soldier"}\n\t{cp     0.5}\n\t{score  50}\n\t{basic}\n\t{breed}\n\t{cw 0.5}\n)\n' +
  '{"mp/ger/kami" ("level_k" side(ger))}\n{"mp/ger/grenadier" ("level_1" side(ger))}\n');
// kamikaze: dummy weapon -> special by function; grenadier: launcher tier by carried ammo, computed throwable tier, other spellings
W('resource/set/breed/mp/ger/kami.set', breed('\t\t{"smg" lvl_3}', '("breed_vet" table(standard) start(1))', '\t\t{item "throwable_gun" 1}\n\t\t{item "tt33" 1}\n\t\t{item "thompson" 1}'));
W('resource/set/breed/mp/ger/grenadier.set', breed('\t\t("soldier_rifle_3" rocket(1))', '("breed_vet" table(standard) start(1))',
  '\t\t{item "garand_grenade" filled}\n\t\t{item "m1garand_grenade wp" 2}\n\t\t{item "m24 grenade" 1}\n\t\t{item "rpg43 grenade" 1}'));
for (const s of ['grenade/throwable_gun.weapon', 'pistol/tt33', 'smg/thompson', 'rifle/garand_grenade', 'ammo/m1garand_grenade.ammo']) W('resource/set/stuff/' + s, '{stuff}\n');
W('resource/set/stuff/grenade/02 grenade_at/rpg43.grenade', '{item\n\t{throw {range 15}}\n\t{damage blastwave {energy 1}}\n\t{damage cumulative {damage 50}}\n}\n');
W('resource/set/breed/mp/ger/officer.set', breed('\t\t{"smg" lvl_6}', '("breed_vet" table(standard) start(1))', '\t\t{item "mp40" filled}'));
W('resource/set/breed/mp/ger/radioman.set', breed('\t\t("soldier_rifle_3" rocket(1))', '("breed_vet" table(standard) start(2))',
  '\t\t("rifle_mauzer")\n\t\t{item "mortar_81_flaregun" 1}\n\t\t("give" item(grenade m24) count(2))'));
const card = (nm, content, extra = '') => `(define "${nm}"\n\t{"%name(%side)"\n\t\t{charge %charge}\n\t\t{content "${content}"}\n\t\t{tags "%tags"}\n\t\t{group "%group"}\n\t\t{button "%button"}\n\t\t{level %level}\n\t\t{cost %cost}\n\t\t{fore %fore}${extra}\n\t}\n)\n`;
W('resource/set/multiplayer/units/_macros.inc', card('squad_1', 'mp/%side/%member1') + card('squad_2', 'mp/%side/%member1 mp/%side/%member2') +
  card('squad_1_x4_sequence', 'mp/%side/%member1 mp/%side/%member1', '\n\t\t{icon %icon}') + card('unit_tank', '* ( mp/%side/%breed:%crew )') +
  card('squad_1_seq_noicon', 'mp/%side/%member1'));
const T = 'charge(30) tags(all) group(g) button(b) level(1)';
W('resource/set/multiplayer/units/ger/squads.set', `;cards
("squad_2" side(ger) name(mixed) member1(rifle:2) member2(smg:1) ${T} cost(40) fore(1.0))
("squad_1" side(ger) name(smg_single) member1(smg:1) ${T} cost(16) fore(1.0))
("squad_2" side(ger) name(norow) member1(rifle:1) member2(nobody:1) ${T} cost(20) fore(1.0))
("squad_1_x4_sequence" side(ger) name(officers) member1(officer:1) ${T} icon(1) cost(0) fore(1.0))
("unit_tank" side(ger) name(pz4) breed(rifle) crew(3) ${T} cost(300) fore(1.0))
("squad_1_x4_sequence" side(ger) name(seq_a) member1(rifle:1) ${T} icon(2) cost(27) fore(1.0))
("squad_1_x4_sequence" side(ger) name(seq_b) member1(rifle:1) ${T} icon(2) cost(24) fore(1.0))
("squad_1_x4_sequence" side(ger) name(seq_c) member1(rifle:1) ${T} icon(2) cost(20) fore(1.0))
("squad_1_seq_noicon" side(ger) name(noicon) member1(rifle:1) ${T} cost(10) fore(1.0))
("squad_2" side(ger) name(phantom) member1(rifle:1) member2(302:1) ${T} cost(13) fore(1.0))
`);
// hand-written model (fit / calc / apply use it; seed is tested separately)
const MODEL = `{price_model
	{rounding {mp 0.01} {cp 0.01} {cost 1}}
	{veterancy {apply_skill_bonus 1} {max_skill 10} {stat_bonus 1}}
	{main_priority "smg" "rifles"}
	{skill_from_item 1}
	{cw_factor 1}
	{weapon_group "rifles" {label "Rifles"} {skill "rifle"}
		{tier "low" {mp 7 8 9 10 11 12 13 14 15 16} {cp 0.4 0.4 0.6 0.97 1.34 1.73 2.14 2.55 2.97 3.4}
			{items
				"mauzer"
			}
		}
	}
	{weapon_group "smg" {label "SMG"} {skill "smg"}
		{tier "medium" {mp 7 9 12 12 14 16 18 20 22 24} {cp 0.4 0.4 0.58 0.97 1.44 1.93 2.44 2.97 3.52 4.09}
			{items
				"mp40"
				"thompson"
			}
		}
		{tier "undetermined" {as "medium"}
			{items
				"zk383"
			}
		}
	}
	{group "frag_grenade" {label "frag"}
		{tier "medium" {price 2}
			{items
				"grenade m24"
			}
		}
	}
	{group "smoke_grenade" {price 1}
		{items
			"smoke grenade"
		}
	}
	{group "helmet" {price 0}
		{items
			"helmet_ger_m40"
		}
	}
	{group "ammo_small_arms" {price 0}
		{items
			"ammo mauser_clip"
			"ammo mp40_mag"
			"m1garand_grenade wp"
		}
	}
	{weapon_group "radio" {label "Radio"} {skill "rifle"} {sole 1}
		{tier "81" {mp 200 200 200 200 200 200 200 200 200 200} {cp 5 5 5 5 5 5 5 5 5 5}
			{items
				"mortar_81_flaregun"
			}
		}
	}
	{special "officer_1000" {mp 1000} {cp -10} {cw 100} {card_mp 0}
		{breeds
			"ger/officer"
		}
	}
	{special "kamikaze_50" {mp 50} {cp 0.5} {cw 0.5}
		{breeds
			"ger/kami"
		}
	}
	{weapon_group "rifle_grenades" {skill "rifle"}
		{tier "medium" {mp 1 1 1 1 1 1 1 1 1 1} {cp 0.1 0.1 0.1 0.1 0.1 0.1 0.1 0.1 0.1 0.1}
			{items
				"garand_grenade"
			}
		}
		{tier "high" {mp 5 5 5 5 5 5 5 5 5 5} {cp 0.5 0.5 0.5 0.5 0.5 0.5 0.5 0.5 0.5 0.5}
			{when_carried "garand_grenade" "m1garand_grenade wp"}
			{items
			}
		}
	}
	{weapon_group "pistol" {skill "pistol"}
		{tier "flat" {mp 0 0 0 0 0 0 0 0 0 0} {cp 0 0 0 0 0 0 0 0 0 0}
			{items
				"tt33"
			}
		}
	}
	{group "dummy_weapon" {price 0}
		{items
			"throwable_gun"
		}
	}
	{group "at_grenade" {price 3}
		{items
			"grenade rpg43"
		}
	}
	{throwable_score {groups "at_grenade"} {energy 5} {penetration 0.1} {fire_radius 1} {range 0.2} {fuse -0.5} {cuts 5 10 20 40 80}}
	{throwable_price {mp_per_tier 0.05} {cp_per_tier 0.05}}
	{alias "grenade m24" "m24 grenade"}
	{stat "health" {weight 0} {base 1}}
	{squad
		{addon "truck" {price 16} {match "truck"}}
		{single "regular" {classes "*"} {mult 1.15}}
		{sequence "inf" {sides "ger"} {percent 100 90 80}}
	}
}
`;
const modelFile = path.join(base, 'model.inc');
fs.writeFileSync(modelFile, crlf(MODEL));
// sheet TSVs (cell \t value)
const mpT = ['A5\tRifles', ...'CDEFGHIJKL'.split('').map((c, i) => `${c}5\tlevel ${i + 1}`), 'A6\tlow', 'B6\tkar98', ...'CDEFGHIJKL'.split('').map((c, i) => `${c}6\t${7 + i}.0`),
  'A8\tSMG', 'C8\tlevel 1', 'A9\tmedium', 'B9\tmp40/28/41', ...'CDEFGHIJKL'.split('').map((c, i) => `${c}9\t${[7, 9, 12, 12, 14, 16, 18, 20, 22, 24][i]}.0`),
  'A10\tlow', 'B10\tsten', ...'CDEFGHIJKL'.split('').map((c, i) => `${c}10\t${7 + i}.0`), 'A11\tShovel', 'C12\t8.0', 'P1\tTruck', 'P2\t16.0', 'AD1\tSingle Buy Regular', 'AD2\t1.15', 'N5\tGER', 'O5\tmixed', 'R5\t41'];
const cpT = ['A20\tCP (Stand In)', 'A21\tRifles', 'B21\tlevel 1', 'A22\tlow', ...'BCDEFGHIJK'.split('').map((c, i) => `${c}22\t${[0.4, 0.4, 0.6, 0.97, 1.34, 1.73, 2.14, 2.55, 2.97, 3.4][i]}`),
  'A24\tSMG', 'B24\tlevel 1', 'A25\tmedium', ...'BCDEFGHIJK'.split('').map((c, i) => `${c}25\t${[0.4, 0.4, 0.58, 0.97, 1.44, 1.93, 2.44, 2.97, 3.52, 4.09][i]}`),
  'A27\tsingles', 'C27\tnot singles', 'A28\tminer', 'B28\t0.5', 'C28\t0.0',
  'N3\tger', 'O3\trifle', 'P3\t9', 'Q3\t0.6',
  'N4\tger', 'O4\tsmg', 'P4\t#N/A', 'Q4\t#N/A',
  'N5\tger', 'O5\tweird', 'P5\t25.0', 'Q5\t25.0'];
const mpS = path.join(base, 'MP.tsv'), cpS = path.join(base, 'CP.tsv');
fs.writeFileSync(mpS, mpT.join('\n') + '\n'); fs.writeFileSync(cpS, cpT.join('\n') + '\n');
const SH = ['--sheet-mp', mpS, '--sheet-cp', cpS];

// ---- 1. findings vs truth.md ----
const fit = run(['fit', mod, '--model', modelFile, ...SH]);
const got = new Set(), re = /^(.+?)(?::(\d+))?: ([A-Z_]+) /;
for (const l of fit.stdout.split(/\r?\n/)) { const m = re.exec(l); if (m && !l.startsWith('info:') && !l.startsWith('  ')) got.add(`${path.basename(m[1])}:${m[2] || 0}: ${m[3]}`); }
const truth = new Set(fs.readFileSync(path.join(__dirname, 'truth.md'), 'utf8').split(/\r?\n/).filter(l => /^- /.test(l)).map(l => l.slice(2).trim()));
for (const t of truth) ok(got.has(t), 'missing finding ' + t);
for (const g of got) ok(truth.has(g), 'unexpected finding ' + g);
ok(/CARD_HAND_PRICED/.test(fit.stdout), 'hand-priced card listed (info)');
ok(/veterancy weapon_skill by rank: 1=1 2=1 3=2 4=2 5=3/.test(fit.stdout), 'vet bonus read from veterancy.set');

// ---- 2. prices ----
const j = JSON.parse(run(['calc', mod, '--model', modelFile, ...SH, '--json']).stdout);
const B = n => j.breeds.find(b => b.breed === n), Cd = n => j.cards.find(c => c.name.startsWith(n + '('));
ok(B('rifle').calc.mp === 13.25 && B('rifle').calc.cp === 0.6, 'rifle mp 9 + 2x2 frag + 0.25 smoke = 13.25, cp 0.6: ' + JSON.stringify(B('rifle').calc));
ok(B('rifle').skillEff === 3 && B('rifle').vetStart === 1, 'rifle skill_eff 3 vet_start 1');
ok(B('smg').skillEff === 5 && B('smg').vetStart === 2 && B('smg').calc.mp === 14 && B('smg').fit === 'exact', 'smg: lvl 4 + rank 2 bonus 1 = 5 -> 14 exact');
ok(B('smg').sheet === null || B('smg').sheet.mp === null, 'smg sheet #N/A -> no sheet value');
ok(B('rifle').sheet && B('rifle').sheet.mp === 9, 'sheet mp joined');
ok(B('weird').unpriced.includes('unobtainium') && B('weird').undetermined.includes('zk383'), 'weird: unpriced + undetermined listed');
ok(Cd('mixed').calc === 41 && Cd('mixed').rule === 'squad' && Cd('mixed').members === 40.5, 'squad cost 2x13.25 + 14 = 40.5 -> 41');
ok(Cd('smg_single').calc === 16 && Cd('smg_single').rule === 'single' && Cd('smg_single').fit === 'exact', 'single 14 x 1.15 = 16.1 -> 16');
ok(Cd('pz4').rule === 'hand' && Cd('pz4').calc === null, 'unit_tank hand-priced');
ok(Cd('officers').rule === 'sequence' && Cd('officers').calc === 0 && Cd('officers').fit === 'exact', 'officer sequence card: card_mp 0 -> 0 exact');
ok(B('officer').rule === 'special' && B('officer').calc.mp === 1000 && B('officer').calc.cp === -10 && B('officer').calc.cw === 100 && B('officer').fit === 'exact', 'officer special exact');
ok(B('radioman').rule === 'sole' && B('radioman').calc.mp === 200 && B('radioman').calc.cp === 5 && B('radioman').fit === 'exact', 'radioman sole: only the radio tier: ' + JSON.stringify(B('radioman').calc));
const sa = Cd('seq_a'), sb = Cd('seq_b'), sc = Cd('seq_c');
ok(sa.seq.step === 1 && sb.seq.step === 2 && sc.seq.step === 3 && sc.seq.size === 3, 'sequence steps by file order within icon');
ok(sa.calc === 27 && sb.calc === 24 && sc.calc === 21 && sa.fit === 'exact' && sb.fit === 'exact' && sc.fit === 'off', 'steps 26.5 x 100/90/80 %: 27 24 21 vs 27 24 20');
ok(sa.seq.avgCalc === 24 && sa.seq.avgCost === 23.67 && sc.seq.pattern === 'differs' && sb.seq.pattern === 'match', 'sequence average + pattern');
const gr = B('grenadier');
ok(gr.cls === 'rifle_grenades' && gr.tier === 'high' && gr.calc.mp === 10.15 && gr.calc.cp === 0.65 && !gr.unpriced.length,
  'grenadier: launcher high (WP carried) 5 + m24 alias 2 + rpg43 by stuff file 3 + throwable tier 3 x 0.05 on mp and cp: ' + JSON.stringify(gr.calc) + ' ' + gr.tier + ' ' + gr.unpriced);
ok(B('kami').rule === 'special' && B('kami').fit === 'exact', 'kamikaze (dummy weapon) special exact');
const rg = run(['calc', mod, '--model', modelFile, ...SH, '--review', 'grenades']).stdout;
ok(/^rpg43 grenade\tat_grenade\tgrenade\/02 grenade_at\/rpg43.grenade\t1\t1\t50\t0\t15\timpact\tgeneral\t13\t3\t1$/m.test(rg), 'grenade review row: ' + rg);
ok(Cd('noicon').rule === 'sequence' && Cd('noicon').ambiguous, 'sequence without icon: ambiguous');
ok(Cd('phantom').members === 13.25 && /CARD_PHANTOM_MEMBER/.test(fit.stdout), 'phantom member 302 skipped (info)');
ok(Math.abs(M.expectedCount(0, 1) - 0.25) < 1e-9 && Math.abs(M.expectedCount(0.25, 1) - 0.375) < 1e-9 && Math.abs(M.expectedCount(0.5, 0.5) - 0.5) < 1e-9
  && Math.abs(M.expectedCount(1.5, 0.5) - 1.5) < 1e-9 && Math.abs(M.expectedCount(-1, 2) - 0.125) < 1e-9 && M.expectedCount(3, 0) === 3, 'expected counts 25/37/50/1-or-2/12 %');

// ---- 3. seed with the RobZ rules file: never overwrites, --force, --merge, groups ----
const RULES = path.join(__dirname, '..', 'rules', 'robz.rules.inc'), RU = ['--rules', RULES];
const seedOut = path.join(base, 'seed.inc');
// pristine copy of the fixture for the layout cases (section 6), before apply touches it
fs.cpSync(path.join(mod, 'resource'), path.join(base, 'mod2', 'resource'), { recursive: true });
fs.rmSync(path.join(base, 'mod2', 'resource', 'set', 'multiplayer', 'units'), { recursive: true, force: true });
ok(run(['seed', mod, ...SH, ...RU, '-o', seedOut]).status === 0 && fs.existsSync(seedOut), 'seed writes -o');
const st = fs.readFileSync(seedOut, 'latin1');
ok(/\{weapon_group "rifles"[\s\S]*?\{tier "low"[\s\S]*?"mauzer"/.test(st), 'seed: mauzer in rifles low (sheet kar98)');
ok(/\{group "frag_grenade" \{label "[^"]*"\} \{price 0\}\r\n\t\t\{items\r\n\t\t\t"grenade m24"/.test(st) && /\{alias "grenade m24" "m24 grenade"\}/.test(st), 'seed: frag grenade group flat, two m24 spellings = one entry + alias');
ok(/\{throwable_score \{groups [^}]*"frag_grenade"[^\n]*\{cuts 10 20 40 80\}\}/.test(st) && /\{throwable_score \{groups "at_grenade" "bundle_charge"\} \{mode "armor"\} \{energy 5\} \{penetration 1\} \{cuts 30 60 100\}\}/.test(st) && require('../grenade').scoreThrowable({ energy: 7, energyParts: [5, 2], pen: 75, fire: 0, range: 14, fuse: 'impact' }, { mode: 'armor', energy: 5, penetration: 1, cuts: [30, 60, 100] }).tier === 3 && require('../grenade').scoreThrowable({ energy: 21, energyParts: [20, 1], pen: 0, fire: 0, range: 12, fuse: 10 }, { mode: 'armor', energy: 5, penetration: 1, cuts: [30, 60, 100] }).tier === 4 &&/\{throwable_price \{mp_per_tier 0.05\} \{cp_per_tier 0.01\}\}/.test(st), 'seed: throwable score + price blocks');
ok(/\{special "officer_1000" [^\n]*\{mp 1000\} \{cp -10\} \{cw 100\} \{card_mp 0\}/.test(st) && /\{weapon_group "radio" [^\n]*\{sole 1\}/.test(st), 'seed: officer special (card_mp 0) + radio sole');
ok(/\{special "kamikaze_50" [^\n]*\{mp 50\}[\s\S]*?"ger\/kami"/.test(st) && /\{group "dummy_weapon"[\s\S]*?"throwable_gun"/.test(st), 'seed: dummy weapon group + kamikaze special by function');
ok(/\{weapon_group "pistol"[^\n]*\r\n\t\t\{tier "flat"[\s\S]*?"tt33"/.test(st) && !/\{weapon_group "pistol"[^\n]*\r\n(\t\t[^\n]*\r\n)*?\t\t\{tier "undetermined"[^\n]*\r\n\t\t\t\{items\r\n\t\t\t\t"tt33/.test(st), 'seed: pistol flat');
ok(/\{tier "high"[^\n]*\r\n[^\n]*\r\n[^\n]*\r\n\t\t\t\{when_carried "garand_grenade" "m1garand_grenade wp"\}/.test(st) && /"thompson"\t; owner rule/.test(st), 'seed: launcher high when WP carried, thompson medium');
ok(/\{group "smoke_grenade" \{label "[^"]*"\} \{price 0\}/.test(st), 'seed: flat smoke group');
ok(/\{group "shovel" [^\n]*\{price 8\}/.test(st), 'seed: shovel price from the sheet');
ok(/\{addon "truck" \{price 16\}/.test(st) && /\{single "regular" \{classes "\*"\} \{mult 1.15\}/.test(st), 'seed: squad rules from the sheet');
ok(/\{tier "undetermined" \{as "medium"\}\r\n\t\t\t\{items\r\n\t\t\t\t"zk383"/.test(st), 'seed: zk383 undetermined in smg, one item per line, CRLF');
const st2 = run(['seed', mod, ...SH, ...RU, '-o', seedOut], true);
ok(st2.status !== 0 && /never overwrites/.test(st2.stderr), 'seed refuses to overwrite');
// hand edit + merge: drop zk383, change a price; merge re-adds zk383 as undetermined and keeps the edit
fs.writeFileSync(seedOut, st.replace(/\t+"zk383"[^\n]*\n/, '').replace('{group "smoke_grenade" {label "smoke grenade"} {price 0}', '{group "smoke_grenade" {label "smoke grenade"} {price 3}'), 'latin1');
ok(run(['seed', mod, ...SH, ...RU, '-o', seedOut, '--merge']).status === 0, 'seed --merge runs');
const st3 = fs.readFileSync(seedOut, 'latin1');
ok(/\{price 3\}/.test(st3) && /"zk383"\t; [^\n]*added by seed --merge/.test(st3) && (st3.match(/"zk383"/g) || []).length === 1, 'merge: hand edit kept, zk383 back once');
ok(/smg[\s\S]*?\{tier "undetermined"[^\n]*\n\t\t\t\{items\n?[\s\S]*?"zk383"/.test(st3), 'merge: zk383 into the smg undetermined tier');
ok(/added by seed --merge/.test(st3) && /no new items/.test(run(['seed', mod, ...SH, ...RU, '-o', seedOut, '--merge']).stdout), 'merge idempotent');
const rv = run(['calc', mod, '--model', modelFile, ...SH, '--review', 'tiers']).stdout;
ok(/^group\titem/.test(rv.replace('\tkind', '')) && /\bsmg\tweapon\tzk383\t1\t1\tger\tundetermined\t/.test(rv), 'review table row for zk383');

// ---- 4. apply (comments only), idempotence, CRLF, check, undo ----
const snap = d => { const o = new Map(); for (const f of require('../../lib/report').walkFiles(d, /./)) if (!f.includes('.arsenal-undo')) o.set(path.relative(d, f), fs.readFileSync(f)); return o; };
const before = snap(mod);
const ap = run(['apply', mod, '--model', modelFile, ...SH, '--undo', 't1']);
ok(ap.status === 0 && /2 file\(s\) changed/.test(ap.stdout), 'apply changes soldiers.set + squads.set: ' + ap.stdout);
const sol = fs.readFileSync(path.join(mod, 'resource/set/multiplayer/units/soldiers.set'), 'latin1');
ok(sol.includes('\r\n;{price {class "rifles"} {tier "low"} {item "mauzer"} {skill 3} {vet_start 1} {skill_eff 3} {weapon 9} {addon 0} {kit 4.25} {extras 0} {mp 13.25} {cp 0.6} {cw 0.6}}\r\n{"mp/ger/rifle"'), 'breed comment above row, CRLF');
ok(!/[^\r]\n/.test(sol), 'CRLF kept everywhere');
ok(sol.split('\n').length === before.get(path.join('resource', 'set', 'multiplayer', 'units', 'soldiers.set')).toString('latin1').split('\n').length + 8, 'only comment lines added (8 priced rows)');
ok(sol.includes(';{price {rule special} {special "officer_1000"} {mp 1000} {cp -10} {cw 100}}\r\n{"mp/ger/officer"') &&
  sol.includes(';{price {rule sole} {class "radio"} {tier "81"} {item "mortar_81_flaregun"} {mp 200} {cp 5} {cw 5}}\r\n{"mp/ger/radioman"'), 'special + sole comments');
const sq = fs.readFileSync(path.join(mod, 'resource/set/multiplayer/units/ger/squads.set'), 'latin1');
ok(sq.includes(';{price {rule squad} {members 40.5} {cost 41}}\r\n("squad_2" side(ger) name(mixed)') && sq.includes('{rule single} {members 14} {mult 1.15} {cost 16}}')
  && sq.includes(';{price {rule sequence} {members 26.5} {step 2} {of 3} {percent 90} {base 26.5} {cost 24} {avg 24}}\r\n("squad_1_x4_sequence" side(ger) name(seq_b)'), 'card comments');
ok(!/name\(pz4\)[^\n]*\n;\{price[^\n]*\n[^\n]*name\(pz4\)/.test(sq) && !/\{price[^\n]*\n[^\n]*name\(pz4\)/.test(sq), 'hand-priced card untouched');
ok(/cost\(40\)/.test(sq) && /\{"mp\/ger\/rifle" \("level_1" side\(ger\)\)\}/.test(sol), 'no price changed without --set-prices');
ok(/nothing to change/.test(run(['apply', mod, '--model', modelFile, ...SH, '--undo', 't1']).stdout), 'second apply changes nothing');
// a stale comment is rewritten in place, not stacked
fs.writeFileSync(path.join(mod, 'resource/set/multiplayer/units/soldiers.set'), sol.replace('{mp 13.25}', '{mp 99}'), 'latin1');
run(['apply', mod, '--model', modelFile, ...SH, '--undo', 't1']);
const sol2 = fs.readFileSync(path.join(mod, 'resource/set/multiplayer/units/soldiers.set'), 'latin1');
ok(sol2 === sol, 'stale comment rewritten in place');
const ck = run(['check', mod, '--model', modelFile, ...SH, '--undo', 't1']);
ok(ck.status === 0 && /0 findings/.test(ck.stdout) && /CHECK_OK/.test(ck.stdout), 'check: data unchanged, idempotent: ' + ck.stdout);
// tamper: a data change is caught
fs.writeFileSync(path.join(mod, 'resource/set/multiplayer/units/soldiers.set'), sol.replace('{"mp/ger/smg" ("level_2"', '{"mp/ger/smg" ("level_1"'), 'latin1');
ok(/CHECK_DATA_CHANGED/.test(run(['check', mod, '--model', modelFile, ...SH, '--undo', 't1']).stdout), 'check catches a data change');
ok(run(['undo', mod, '--undo', 't1']).status === 0, 'undo runs');
const after = snap(mod);
ok([...before].every(([k, b]) => after.has(k) && after.get(k).equals(b)) && after.size === before.size, 'undo restores bytes exactly');

// ---- 5. model created when absent; --set-prices ----
const ap2 = run(['apply', mod, ...SH, '--undo', 't2']);
ok(fs.existsSync(path.join(mod, 'resource/set/multiplayer/units/price_model.inc')) && /model file created/.test(ap2.stdout), 'apply creates the model when absent');
ok(!/price_model/.test(fs.readFileSync(path.join(mod, 'resource/set/multiplayer/units/soldiers.set'), 'latin1')), 'model included by nothing');
run(['undo', mod, '--undo', 't2']);
ok(!fs.existsSync(path.join(mod, 'resource/set/multiplayer/units/price_model.inc')), 'undo removes the created model');
const ap3 = run(['apply', mod, '--model', modelFile, ...SH, '--undo', 't3', '--set-prices']);
const sol3 = fs.readFileSync(path.join(mod, 'resource/set/multiplayer/units/soldiers.set'), 'latin1');
const sq3 = fs.readFileSync(path.join(mod, 'resource/set/multiplayer/units/ger/squads.set'), 'latin1');
ok(/\(define "level_3"\r\n\t\{tags   "level_3 %side soldier"\}\r\n\t\{cp     0.6\}\r\n\t\{score  13.25\}/.test(sol3) && /\{"mp\/ger\/rifle" \("level_3" side\(ger\)\)\}/.test(sol3), 'set-prices: new level_3 for rifle');
ok(/\{"mp\/ger\/smg" \("level_2" side\(ger\)\)\}/.test(sol3), 'set-prices: smg keeps level_2 (same cp/score/cw)');
ok(/name\(mixed\)[^\n]*cost\(41\)/.test(sq3) && /name\(pz4\)[^\n]*cost\(300\)/.test(sq3), 'set-prices: card cost(41), hand card untouched');
ok(/nothing to change/.test(run(['apply', mod, '--model', modelFile, ...SH, '--undo', 't3', '--set-prices']).stdout), 'set-prices idempotent');
run(['undo', mod, '--undo', 't3']);
const after3 = snap(mod);
ok([...before].every(([k, b]) => after3.has(k) && after3.get(k).equals(b)), 'undo after set-prices restores bytes');
// undo copies sit beside the mod (<mod>.arsenal-undo/<tag>), never inside it; an old one inside the mod (older versions) is still undone
ok(['t1', 't2', 't3'].every(t => fs.existsSync(path.join(mod + '.arsenal-undo', t, 'manifest.json'))) && !fs.existsSync(path.join(mod, '.arsenal-undo')), 'undo copies beside the mod, nothing inside it');
run(['apply', mod, '--model', modelFile, ...SH, '--undo', 't4']);
fs.mkdirSync(path.join(mod, '.arsenal-undo'), { recursive: true }); fs.renameSync(path.join(mod + '.arsenal-undo', 't4'), path.join(mod, '.arsenal-undo', 't4'));
ok(run(['check', mod, '--model', modelFile, ...SH]).status === 0, 'check finds the newest apply in the old inside place');
const ou4 = run(['undo', mod]);
const after4 = snap(mod);
ok(ou4.status === 0 && /undo t4/.test(ou4.stdout) && [...before].every(([k, b]) => after4.has(k) && after4.get(k).equals(b)) && after4.size === before.size, 'undo without a tag takes the old inside restore point back byte for byte');
const r4 = run(['apply', mod, '--model', modelFile, ...SH, '--undo', 't4'], true);
ok(r4.status !== 0 && /older undo copy inside the mod/.test(r4.stderr) && [...before].every(([k, b]) => snap(mod).get(k).equals(b)), 'a write never reuses a tag only an old inside copy holds (refused, nothing written)');
fs.rmSync(path.join(mod, '.arsenal-undo'), { recursive: true, force: true });

// ---- 6. rules file, no-sheet seed, vanilla layout, unknown layout ----
const RL = require('../rules');
ok(RL.readRules(fs.readFileSync(RULES), RULES).errs.length === 0, 'robz.rules.inc reads without errors');
const badRules = path.join(base, 'bad.rules.inc');
fs.writeFileSync(badRules, '{price_rules\r\n\t{bogus 1}\r\n\t{main_priority "nogroup"}\r\n}\r\n', 'latin1');
const br = RL.readRules(fs.readFileSync(badRules), badRules);
ok(br.errs.some(e => e.code === 'RULES_UNKNOWN' && /bogus/.test(e.msg)) && br.errs.some(e => e.code === 'RULES_UNKNOWN' && /nogroup/.test(e.msg)), 'bad rules: unknown block + undeclared main_priority group named');
const bs = run(['seed', mod, ...SH, '--rules', badRules]);
ok(bs.status === 0 && /RULES_UNKNOWN/.test(bs.stderr) && /\{price_model/.test(bs.stdout), 'seed with bad rules: warns on stderr, still seeds');
// no sheet, no rules: generic groups, tables fitted from the mod's own price rows
const ns = run(['seed', mod]);
ok(ns.status === 0 && /\{source "no sheet: tables fitted from the mod's price rows \[I\] \(\d+ of \d+ rows used\)"\}/.test(ns.stdout), 'no-sheet seed: source says fitted from the price rows');
ok(/\{weapon_group "smg" \{label "SMG \(stuff smg\)"\}[^\n]*\r\n\t\t\{tier "medium" \{label "\[I\] fitted from 4 mod price rows: median per effective skill level \(level:rows 3:2 4:1 5:1\); levels 1 2 6 7 8 9 10 interpolated"\}\r\n\t\t\t\{mp 30 30 30 10 14 14 14 14 14 14\}/.test(ns.stdout), 'no-sheet seed: smg medium = median per level (3: weird 10 + kami 50), ends flat: ' + (/\{weapon_group "smg"[^\n]*\r\n[^\n]*\r\n[^\n]*/.exec(ns.stdout) || [''])[0]);
ok(!/radio|owner rule|kamikaze/.test((ns.stdout.split('\r\n{price_model\r\n')[1] || 'none')), 'no-sheet seed without rules: no RobZ pick (radio, owner rules, kamikaze)');
const nsFile = path.join(base, 'noseed.inc');
fs.writeFileSync(nsFile, ns.stdout, 'latin1');
const nf = run(['fit', mod, '--model', nsFile]);
ok((nf.status === 0 || nf.status === 1) && /^breeds: \d+ rows: exact [1-9]/m.test(nf.stdout), 'fit runs on the no-sheet seed: ' + nf.stdout.split('\n')[2]);
// vanilla layout: soldiers.set rows use named defines, cards in top-level squads.set reached from common.set, card name without (side)
const m2 = path.join(base, 'mod2');
const W2 = (rel, text) => { const f = path.join(m2, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, crlf(text), 'latin1'); };
W2('resource/set/multiplayer/units/common.set', ';SDL\n{units\n\t(include "soldiers.set")\n\t(include "squads.set")\n}\n');
W2('resource/set/multiplayer/units/soldiers.set', '(define "rifleman" {tags "rifleman %side soldier"} {cp 0.6} {score 10} {basic} {breed} {cw 0.6})\n' +
  '(define "smgman"\n\t{tags "smgman %side soldier"}\n\t{cp 1.44}\n\t{score 14}\n\t{basic}\n\t{breed}\n\t{cw 1.44}\n)\n' +
  '{"mp/ger/rifle" ("rifleman" side(ger))}\n{"mp/ger/smg" ("smgman" side(ger))}\n');
W2('resource/set/multiplayer/units/squads.set', '(define "squad_with2types"\n\t{"%name(%side)"\n\t\t{content "mp/%side/%c1 mp/%side/%c2"}\n\t\t{cost %cost}\n\t}\n)\n' +
  '(define "vb3"\n\t{content "%c ( mp/%s/%c1:%n1 )"}\n)\n' +
  '("squad_with2types" side(ger) name(home_guards) c1(rifle:2) c2(smg:1) cost(40))\n' +
  '{"storm_mech_ger" ("vb3" c(sdkfz251_1) c1(rifle) s(ger) n1(2)) {cost 100}}\n');
const pr2 = M.readPriceRows(M.createModSource({ modDir: m2 }));
ok(pr2 && pr2.rows.length === 2 && pr2.rows[1].level === 'smgman' && pr2.levels.get('smgman') && pr2.levels.get('smgman').score === 14, 'vanilla layout: rows with named defines, levels read');
const v2 = run(['calc', m2, '--json']);
const j2 = JSON.parse(v2.stdout);
const hg = j2.cards.find(c => c.name === 'home_guards(ger)'), sm = j2.cards.find(c => c.name === 'storm_mech_ger');
ok(j2.breeds.length === 2 && j2.cards.length === 2 && !j2.findings.some(f => f.code === 'LAYOUT_UNKNOWN'), 'vanilla layout: 2 rows, 2 cards, no LAYOUT_UNKNOWN: ' + JSON.stringify(j2.findings.map(f => f.code)));
ok(hg && hg.side === 'ger' && hg.file === 'resource/set/multiplayer/units/squads.set' && hg.rule === 'squad', 'vanilla layout: squads.set card read once, side from the name');
ok(sm && sm.side === 'ger' && sm.rule === 'hand', 'vanilla layout: vehicle card without (side): side from its members, hand-priced');
// unknown layout: findings name file + line, nothing crashes
const m3 = path.join(base, 'mod3');
fs.mkdirSync(path.join(m3, 'resource/set/multiplayer/units/ger'), { recursive: true });
fs.writeFileSync(path.join(m3, 'resource/set/multiplayer/units/soldiers.set'), ';rows\r\n{price_table {ger_rifle 6 1.0}}\r\n', 'latin1');
fs.writeFileSync(path.join(m3, 'resource/set/multiplayer/units/ger/cards.set'), '{card_x {members "rifle"}}\r\n', 'latin1');
const u3 = run(['fit', m3]);
ok((u3.status === 0 || u3.status === 1) && /soldiers\.set:2: LAYOUT_UNKNOWN [^\n]*"price_table"/.test(u3.stdout) && /ger\/cards\.set:1: LAYOUT_UNKNOWN [^\n]*"card_x"/.test(u3.stdout), 'unknown layout: LAYOUT_UNKNOWN with file + line: ' + u3.stdout + u3.stderr);
const m4 = path.join(base, 'mod4');
fs.mkdirSync(m4, { recursive: true });
const u4 = run(['fit', m4]);
ok((u4.status === 0 || u4.status === 1) && /NO_PRICE_ROWS/.test(u4.stdout) && /LAYOUT_UNKNOWN [^\n]*no card file/.test(u4.stdout), 'empty mod: NO_PRICE_ROWS + no card file named: ' + u4.stdout + u4.stderr);

// ---- hero button cards (button + budget resource), {point_value} read / write, in-game names ----
const MD = require('../model'), ED = require('../edit');
const m5 = path.join(base, 'mod5');
const W5 = (rel, text, enc) => { const f = path.join(m5, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, crlf(text), enc || 'latin1'); };
fs.cpSync(m2, m5, { recursive: true });
W5('resource/set/multiplayer/units/squads.set', fs.readFileSync(path.join(m2, 'resource/set/multiplayer/units/squads.set'), 'latin1').replace(/\r\n/g, '\n') +
  '("squad_with2types" side(ger) name(snipers_home) c1(rifle:1) c2(smg:1) cost(3))\n');
// the macro has no {button}/{tags}/{fore}: a second macro that has them, used by the hero card
W5('resource/set/multiplayer/units/ger/heroes.set', '(define "hero2"\n\t{"%name(%side)"\n\t\t{content "mp/%side/%c1"}\n\t\t{tags "infantry %side %t"}\n\t\t{button "%b"}\n\t\t{cost %cost}\n\t\t{fore %f}\n\t}\n)\n' +
  '("hero2" side(ger) name(hero_sniper) c1(rifle:1) t(all hero 44) b(hero) cost(2) f(-0.5))\n' +
  '("hero2" side(ger) name(moto_guards) c1(rifle:2) t(all hero 44) b(squad1) cost(30) f(0))\n');
W5('resource/set/multiplayer/games/presets.inc', '{budgets\n\t{vehicle {resource {start 500}} {buttons "squad1 squad2"}}\n\t{hero {resource {start 20}} {buttons "hero"} {tag "special"}}\n}\n');
W5('localization/desc.lng', '{tags\n\t{"squad"\n\t\t{"hero_sniper(ger)" "<c(c3baae)>Der Scharfschütze"}\n\t}\n\t{"human"\n\t\t{"mp"\n\t\t\t{"ger"\n\t\t\t\t{"rifle" "Schütze"}\n\t\t\t}\n\t\t}\n\t}\n}\n', 'utf8');
const rc5 = M.readCards(M.createModSource({ modDir: m5 }));
const hs = rc5.find(c => c.name === 'hero_sniper(ger)'), mg = rc5.find(c => c.name === 'moto_guards(ger)');
ok(hs && hs.button === 'hero' && hs.tags.join(' ') === 'infantry ger all hero 44' && hs.fore === -0.5 && hs.cost === 2, 'readCards: button, tags, fore ' + JSON.stringify(hs && [hs.button, hs.tags, hs.fore]));
const eco5 = M.readEconomy(M.createModSource({ modDir: m5 }));
ok(M.resOf(hs, eco5) === 'sp' && M.resOf(mg, eco5) === 'mp' && M.resOf({ button: 'hero', tags: [] }, { budgets: [] }) === 'sp', 'resource: hero budget = sp; tag hero on a squad1 card stays mp; no presets: button hero = sp');
const j5 = JSON.parse(run(['calc', m5, '--json']).stdout);
const h5 = j5.cards.find(c => c.name === 'hero_sniper(ger)'), g5 = j5.cards.find(c => c.name === 'moto_guards(ger)'), hg5 = j5.cards.find(c => c.name === 'home_guards(ger)');
ok(h5 && h5.hero && h5.unit === 'sp' && h5.fit === 'n/a' && h5.costMp === null && h5.pointValue === null && h5.calc !== null, 'calc --json: hero card in sp, not compared, no MP worth while not set ' + JSON.stringify(h5));
ok(g5 && !g5.hero && g5.unit === 'mp' && g5.costMp === 30 && hg5 && hg5.costMp === 40 && hg5.pointValue === 1 && hg5.fit !== 'n/a', 'calc --json: manpower cards keep their fit, costMp = cost');
ok(j5.pointValue === null && j5.economy.budgets.length === 2 && j5.economy.budgets[1].res === 'sp' && j5.economy.budgets[1].start === 20, 'calc --json: pointValue null (no block), economy budgets');
ok(['tool', 'version', 'mod', 'model', 'vet', 'breeds', 'cards', 'findings', 'counts'].every(k => k in j5) && j5.version === 1, 'calc --json: earlier fields kept');
const f5 = run(['fit', m5]).stdout;
ok(/paid with another resource \(hero button, not compared\) 1: sp/.test(f5) && !/hero_sniper/.test(f5.split('biggest card gaps')[1].split('\n').slice(0, 4).join('\n')), 'fit: hero card counted apart, not among the gaps');
// {point_value}: absent = null; seed writes it only as a comment; edit op adds / changes / removes in place; reader round trip
const seed5 = run(['seed', m5]).stdout;
ok(/^\t; \{point_value \{sp N\} \{dp M\}\}/m.test(seed5) && MD.readModel(Buffer.from(seed5, 'latin1'), 's').pointValue === null, 'seed: point_value only as a comment, reads as not set');
ok(/\{point_value \{sp 12\.5\}\}/.test(MD.writeModel(Object.assign(MD.buildSeed({ items: new Map(), sources: [] }), { pointValue: { sp: 12.5 } }))), 'writeModel: a seed with point values writes the block');
let pt = ED.applyOps(seed5, [{ op: 'point', kind: 'sp', value: 40 }]);
ok(pt.done === 1 && !pt.errs.length && /\r\n\t\{point_value \{sp 40\}\}\r\n\}\r\n$/.test(pt.text), 'point op: block added on its own line before the closing brace (CRLF)');
let pm = MD.readModel(Buffer.from(pt.text, 'latin1'), 'm');
ok(pm.pointValue && pm.pointValue.sp === 40 && pm.pointValue.dp === null && !pm.errs.length, 'reader: sp set, dp not set');
pt = ED.applyOps(pt.text, [{ op: 'point', kind: 'dp', value: 3 }, { op: 'point', kind: 'sp', value: 45 }]);
pm = MD.readModel(Buffer.from(pt.text, 'latin1'), 'm');
ok(pt.done === 2 && /\{point_value \{sp 45\} \{dp 3\}\}/.test(pt.text) && pm.pointValue.sp === 45 && pm.pointValue.dp === 3, 'point op: second kind added, first changed in place; round trip');
const kept = pt.text;
pt = ED.applyOps(pt.text, [{ op: 'point', kind: 'sp', value: null }, { op: 'point', kind: 'zz', value: 1 }, { op: 'point', kind: 'dp', value: -1 }]);
ok(/\{point_value \{dp 3\}\}/.test(pt.text) && MD.readModel(Buffer.from(pt.text, 'latin1'), 'm').pointValue.sp === null && pt.errs.length === 2 && pt.done === 1, 'point op: null removes a kind; unknown kind and negative value refused');
ok(ED.applyOps(seed5, [{ op: 'point', kind: 'sp', value: null }]).done === 0, 'point op: removing an absent kind changes nothing');
ok(MD.readModel(Buffer.from(seed5.replace('\r\n{price_model\r\n', '\r\n{price_model\r\n\t{point_value {sp "x"}}\r\n'), 'latin1'), 'm').errs.some(e => e.code === 'MODEL_POINT_VALUE'), 'reader: a non-number point value is a model error');
// the model file in the mod: costMp follows the point value; the old model text (no block) still reads the same
fs.writeFileSync(path.join(m5, 'resource/set/multiplayer/units/price_model.inc'), kept, 'latin1');
const j6 = JSON.parse(run(['calc', m5, '--json']).stdout);
ok(j6.pointValue && j6.pointValue.sp === 45 && j6.cards.find(c => c.name === 'hero_sniper(ger)').costMp === 90 && j6.cards.find(c => c.name === 'hero_sniper(ger)').pointValue === 45, 'model with point_value: hero cost x 45 = 90 MP');
const P5 = require('../pricecalc').lib, s5 = P5.open({ mod: m5 }), n5 = P5.names(s5);
ok(n5.cards['hero_sniper(ger)'] === 'Der Scharfschütze' && n5.breeds['ger/rifle'] === 'Schütze' && !n5.cards['home_guards(ger)'] && P5.names(s5) === n5, 'names: card + breed text from localization/ (UTF-8, colour tag dropped), none for a card without text, read once');
const r5 = P5.result(s5, P5.model(s5, null));
ok(r5.fit.hero === 1 && r5.pointValue.sp === 45 && r5.economy.budgets.length === 2, 'lib result: hero count apart, pointValue, economy');

// ---- apply above hero cards (owner 2026-11-19): never a computed-MP line; with {point_value}: SP cost + MP worth, as the GUI shows ----
const m6 = path.join(base, 'mod6');
fs.cpSync(m5, m6, { recursive: true });
const H6 = path.join(m6, 'resource/set/multiplayer/units/ger/heroes.set'), MOD6 = path.join(m6, 'resource/set/multiplayer/units/price_model.inc');
const above = (txt, re) => { const L = txt.split('\r\n'), i = L.findIndex(l => re.test(l)); return i > 0 ? L[i - 1] : null; };
// seeded defect: a stale computed-MP line (an earlier apply) above the hero card; the model has no point value
fs.writeFileSync(H6, fs.readFileSync(H6, 'latin1').replace('("hero2" side(ger) name(hero_sniper)', ';{price {rule single} {members 1} {cost 99}}\r\n("hero2" side(ger) name(hero_sniper)'), 'latin1');
fs.writeFileSync(MOD6, seed5, 'latin1');
const p6 = run(['plan', m6]).stdout;
ok(/heroes\.set: \+1 comment line\(s\), 0 rewritten, 1 removed \(hero card, no point value\)/.test(p6), 'plan: hero card stale line counted as removed ' + p6);
run(['apply', m6, '--undo', 'hero-a', '--set-prices']);
let h6 = fs.readFileSync(H6, 'latin1');
ok(!/^;\{price/.test(above(h6, /name\(hero_sniper\)/) || '') && !/\{cost 99\}/.test(h6), 'apply: no price line above a hero card without a point value (stale one removed) ' + above(h6, /name\(hero_sniper\)/));
ok(/^;\{price \{rule (single|squad)\} [^\n]*\{cost [0-9.]+\}\}$/.test(above(h6, /name\(moto_guards\)/) || ''), 'apply: a manpower card keeps its computed line ' + above(h6, /name\(moto_guards\)/));
ok(/name\(hero_sniper\) [^\n]*cost\(2\)/.test(h6), 'apply --set-prices: a hero card cost(N) (SP) is never rewritten with the MP calc');
ok(/0 file\(s\) would change/.test(run(['plan', m6]).stdout), 'apply: a second apply changes nothing (hero card, no point value)');
ok(run(['check', m6, '--undo', 'hero-a']).status === 0, 'check: data unchanged by the hero edit (comments only) ' + run(['check', m6, '--undo', 'hero-a']).stdout);
// with {point_value {sp 45}}: the SP cost and its MP worth, never members / a computed cost
fs.writeFileSync(MOD6, kept, 'latin1');
run(['apply', m6, '--undo', 'hero-b']);
h6 = fs.readFileSync(H6, 'latin1');
ok(above(h6, /name\(hero_sniper\)/) === ';{price {rule hero} {paid "sp"} {cost 2} {point_value 45} {mp_worth 90}}', 'apply: hero card line = SP cost + MP worth with a point value ' + above(h6, /name\(hero_sniper\)/));
ok(/0 file\(s\) would change/.test(run(['plan', m6]).stdout), 'apply: a second apply changes nothing (hero card with point value)');
fs.writeFileSync(MOD6, seed5, 'latin1');
run(['apply', m6, '--undo', 'hero-c']);
ok(!/^;\{price/.test(above(fs.readFileSync(H6, 'latin1'), /name\(hero_sniper\)/) || ''), 'apply: point value removed again -> the hero line goes too');

if (fails) { console.log(fails + ' failure(s)'); process.exit(1); }
console.log('PASS');
