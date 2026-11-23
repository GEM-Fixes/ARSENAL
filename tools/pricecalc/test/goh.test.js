// pricecalc/goh regression: a made-up Gates of Hell install (no game files) + a mod over it. The fit recovers known constants, the
// main weapon / MG / veterancy / extra kit are read from the breed files, cards are priced by GHGPL-10 (own cost + members x
// squad_cost_factor, rounded up) with game and fair member prices, the mod's row wins, names come from the .pot. Prints PASS.
// Author: Imperator_Aug (ARSENAL, ia-goh-price1)
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert');
const G = require('../goh');
const tmp = path.join(process.env.ARSENAL_TMP || os.tmpdir(), 'pricecalc-goh-' + process.pid);
fs.rmSync(tmp, { recursive: true, force: true });
const put = (root, key, text) => { const f = path.join(root, key); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text.replace(/\r?\n/g, '\r\n')); };
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };

// ---- 1. the fit alone: rows made from known terms come back exact
{
  const W = { k98: 8, mp40: 10, mg34: 35 }, T = { tier1: -1, tier2: 0, tier3: 5, 'tier1/mg': -10, 'tier2/mg': 0, 'tier3/mg': 10 }, V = { 0: 0, 3: 2 };
  const rows = [];
  for (const w of Object.keys(W)) for (const t of ['tier1', 'tier2', 'tier3']) for (const v of [0, 3]) {
    const tk = t + (w === 'mg34' ? '/mg' : '');
    rows.push({ cost: W[w] + T[tk] + V[v], special: false, cls: 'inf_' + t, weapon: w, tierKey: tk, vet: v, extras: [] });
  }
  rows.push({ cost: 125, special: true, cls: 'inf_officer', weapon: 'p08', tierKey: null, vet: 0, extras: [] }, { cost: 135, special: true, cls: 'inf_officer', weapon: 'p08', tierKey: null, vet: 0, extras: [] });
  const m = G.fitModel(rows);
  assert.ok(rows.filter(r => !r.special).every(r => Math.abs(r.fair - r.cost) < 1e-9), 'every regular row exact');
  assert.deepStrictEqual(m.tiers.find(x => x.key === 'tier3/mg').price, 10);
  assert.deepStrictEqual(m.weapons.find(x => x.key === 'mg34').price, 35);
  assert.deepStrictEqual(m.vets.find(x => x.key === 3).price, 2);
  assert.deepStrictEqual(m.specials, [{ key: 'inf_officer', price: 130, rows: 2 }]);
  const q = G.quality(rows.filter(r => !r.special).map(r => ({ fair: r.fair, game: r.cost })));
  assert.ok(q.r2 === 1 && q.within10 === 100 && q.meanAbs === 0, JSON.stringify(q));
  ok('fit: weapon + tier (MG apart) + veterancy recovered exactly; fixed-price class = its median; quality R2 1');
}

// ---- 2. the reader on a made-up install
const game = path.join(tmp, 'goh'), mod = path.join(tmp, 'mymod');
const U = 'resource/set/multiplayer/units/';
put(game, 'binaries/x64/call_to_arms.exe', '');
put(game, U + 'only_roster_early.set', ';SDL\n{units\n\t(include "roster_early.set")\n}\n');
put(game, U + 'roster_early.set', ';SDL\n(include "settings.set")\n(include "settings_inf.set")\n(include "early/inf_ger.set")\n(include "early/units_ger.set")\n');
put(game, U + 'settings_inf.set', ';SDL\n(define "inf_g"\n\t{basic}\n\t{breed}\n\t{cost %cost}\n)\n' +
  ['inf_tier1', 'inf_tier2', 'inf_tier3', 'inf_officer'].map(c => '(define "' + c + '"\n\t("inf_g" cost(%cost))\n\t{tags "%period %side infantry"}\n\t{cp 3}\n\t{cw 1}\n)\n').join(''));
put(game, U + 'settings.set', ';SDL\n(define "squad2"\n\t{content "mp/%side/%period/%c1 mp/%side/%period/%c2"}\n\t{button "inf"}\n\t{squad_cost_factor 1}\n\t{round_multiple 5.0}\n)\n' +
  '(define "doc"\n\t{content "%vehicle (mp/%side/%period/%crew)"}\n\t{button "doctrine"}\n\t{squad_cost_factor 0}\n\t{cost %cost}\n)\n' +
  '(define "tank"\n\t{content "* (mp/%side/%period/%crew)"}\n\t{button "tank"}\n\t{squad_cost_factor 1}\n\t{cost %cost}\n)\n');
const rowsTxt = [['rifle_1', 'inf_tier1', 7, 'k98'], ['rifle_2', 'inf_tier2', 8, 'k98'], ['rifle_3', 'inf_tier3', 13, 'k98'], ['smg_2', 'inf_tier2', 10, 'mp40'], ['smg_3', 'inf_tier3', 15, 'mp40'],
  ['mg_2', 'inf_tier2', 35, 'mg34'], ['mg_3', 'inf_tier3', 45, 'mg34'], ['at_2', 'inf_tier2', 40, 'shreck'], ['vet_2', 'inf_tier2', 10, 'k98 vet'], ['officer', 'inf_officer', 125, 'p08'], ['tankman', 'inf_officer', 125, 'p08']];
put(game, U + 'early/inf_ger.set', ';SDL\n' + rowsTxt.map(r => '{"mp/ger/early/' + r[0] + '"\t("' + r[1] + '" side(ger) period(early) cost(' + r[2] + '.0))} ; ' + r[3]).join('\n') + '\n');
put(game, U + 'early/units_ger.set', ';SDL\n{"rifles(ger)"\n\t("squad2" side(ger) period(early) c1(smg_2:1) c2(rifle_2:4))\n\t{cost 10}\n}\n' +
  '{"doctrine_pz2"\n\t("doc" side(ger) period(early) vehicle(pz2) crew(tankman:2) cost(20))\n}\n' +
  '{"pz2"\n\t("tank" side(ger) period(early) crew(tankman:2) cost(100))\n}\n');
const breed = (items, hands, vet) => '{breed\n\t{veterancy\n\t\t("veterancy_lvl_' + vet + '")\n\t}\n\t{inventory\n' + items.map(i => '\t\t{item "' + i + '" 1}\n').join('') + (hands != null ? '\t\t{in_hands ' + hands + '}\n' : '') + '\t}\n}\n';
const B = 'resource/set/breed/mp/ger/early/';
for (const [id, items, hands, vet] of [['rifle_1', ['k98', 'k98 ammo', 'm24 grenade'], 0, 0], ['rifle_2', ['k98'], 0, 0], ['rifle_3', ['k98'], 0, 0], ['smg_2', ['mp40'], 0, 0], ['smg_3', ['mp40'], 0, 0],
  ['mg_2', ['p08', 'mg34', 'mgun_ger mg34 ammo'], 0, 0], ['mg_3', ['mg34'], 0, 0], ['at_2', ['p08', 'panzerschreck_43', 'panzerfaust_30'], 0, 0], ['vet_2', ['k98'], 0, 3], ['officer', ['p08'], 0, 0]])
  put(game, B + id + '.set', breed(items, hands, vet));
for (const k of ['rifle/k98', 'smg/mp40', 'mgun/mg34', 'mgun/mgun_ger.mg34.ammo', 'pistol/p08', 'bazooka/panzerschreck_43.weapon', 'bazooka/panzerfaust_30.weapon', 'grenade/m24.grenade', 'rifle/k98.ammo'])
  put(game, 'resource/set/stuff/' + k, '{x}\n');
put(game, 'resource/localizations/default/interface/text/units.pot', 'msgctxt "desc/squad/rifles(ger)"\nmsgid "Rifle squad"\nmsgstr ""\n\nmsgctxt "desc/human/mp/ger/early/mg_2"\nmsgid "Machine gunner"\nmsgstr ""\n');
fs.mkdirSync(mod, { recursive: true });

let S = G.open({ game, mod }), r = G.result(S);
const br = id => r.breeds.find(b => b.id === 'mp/ger/early/' + id);
assert.strictEqual(r.goh, true); assert.strictEqual(r.breeds.length, 11, 'eleven breed rows (one without a breed file)');
assert.deepStrictEqual([br('rifle_1').item, br('mg_2').item, br('mg_2').tier, br('at_2').item, br('at_2').extras, br('vet_2').vetStart], ['k98', 'mg34', 'tier2/mg', 'panzerschreck_43', ['faust'], 3],
  'main weapon: rifle, the MG over the pistol in hands, the bazooka over the pistol (faust = extra kit), ammo and grenades skipped, veterancy level');
assert.ok(br('tankman').rule === 'special' && r.counts.NO_BREED_FILE === 1, 'a row with no breed file is said');
assert.deepStrictEqual([br('rifle_2').calc.mp, br('rifle_2').mod.mp, br('rifle_2').fit], [8, 8, 'exact']);
assert.deepStrictEqual([br('officer').calc.mp, br('officer').mod.cp], [125, 3], 'fixed-price class: median; CP as read');
const sq = r.cards.find(c => c.name === 'rifles(ger)'), doc = r.cards.find(c => c.name === 'doctrine_pz2'), tank = r.cards.find(c => c.name === 'pz2');
// game: 10 + 10 + 4 x 8 = 52 -> rounded up to 55
assert.deepStrictEqual([sq.rule, sq.cost, sq.calc, sq.fit, sq.list], ['squad', 55, 55, 'exact', [{ who: 'ger/early/smg_2', count: 1 }, { who: 'ger/early/rifle_2', count: 4 }]], JSON.stringify(sq));
assert.deepStrictEqual([doc.rule, doc.cost, doc.unit, doc.fit], ['hand', 20, 'dp', 'n/a'], 'doctrine card: squad_cost_factor 0 = its own number, paid in DP');
assert.deepStrictEqual([tank.rule, tank.cost], ['squad', 350], 'crew priced by the card (100 + 2 x 125)');
assert.ok(r.quality.breeds.n === 9 && r.quality.breeds.r2 != null && r.gohModel.weapons.length >= 4, JSON.stringify(r.quality.breeds));
ok('reader: breed rows, main weapon, MG, veterancy, extra kit, cards by GHGPL-10 (round up, doctrine by hand), fit quality');

const nm = G.names(S);
assert.deepStrictEqual([nm.cards['rifles(ger)'], nm.breeds['ger/early/mg_2']], ['Rifle squad', 'Machine gunner']);
ok('names: the .pot texts of the default language');

// the mod's own row wins over the game's (rifle_2 dearer): the squad's game price moves, the fair one follows the fit
put(mod, U + 'early/inf_ger.set', fs.readFileSync(path.join(game, U + 'early/inf_ger.set'), 'latin1').replace('rifle_2"\t("inf_tier2" side(ger) period(early) cost(8.0))', 'rifle_2"\t("inf_tier2" side(ger) period(early) cost(20.0))'));
S = G.open({ game, mod }); r = G.result(S);
assert.strictEqual(r.breeds.find(b => b.id === 'mp/ger/early/rifle_2').mod.mp, 20);
assert.strictEqual(r.cards.find(c => c.name === 'rifles(ger)').cost, 100, '10 + 10 + 4 x 20 = 100');
assert.ok(r.rowsInMod, 'rows read from the mod');
ok('a mod row wins; the card price follows it');

// ---- 3. check / plan / write against the model fitted on the game alone (the game read through an empty folder)
{
  const empty = path.join(tmp, 'empty'); fs.mkdirSync(empty, { recursive: true });
  const gf = G.gameFit({ game, empty });
  assert.strictEqual(gf.prices['mp/ger/early/rifle_2'], 8, 'game price of a breed');
  // a second far-off row: its row runs over two lines (its one cost(N) is found in the row's block)
  const mf = path.join(mod, U + 'early/inf_ger.set');
  fs.writeFileSync(mf, fs.readFileSync(mf, 'latin1').replace('{"mp/ger/early/mg_3"\t("inf_tier3" side(ger) period(early) cost(45.0))}', '{"mp/ger/early/mg_3"\t("inf_tier3" side(ger) period(early) cost(90.0))\r\n}'), 'latin1');
  const gameBytes = fs.readFileSync(path.join(game, U + 'early/inf_ger.set')), modBefore = fs.readFileSync(mf);
  S = G.open({ game, mod }); r = G.result(S);
  const ck = G.check(S, r, gf, {});
  const far = ck.findings.filter(f => f.code === 'GOH_PRICE_FAR').map(f => f.msg.split(':')[0]).sort();
  assert.deepStrictEqual(far, ['mp/ger/early/mg_3', 'mp/ger/early/rifle_2'], JSON.stringify(ck.findings));
  assert.ok(ck.count === 2 && ck.tol === 0.2 && ck.findings.some(f => f.code === 'GOH_CHECKED'), 'check: the far-off rows of the mod, as warnings');
  assert.strictEqual(G.check(S, r, gf, { tol: 1 }).count, 1, 'a wider bound lists fewer rows (rifle_2 +150% stays, mg_3 +100% goes)');
  const pl = G.plan(S, r, gf, {});
  assert.deepStrictEqual(pl.rows.map(x => [x.id, x.old, x.new]), [['mp/ger/early/rifle_2', 20, 8], ['mp/ger/early/mg_3', 90, 45]], JSON.stringify(pl));
  assert.ok(!pl.refused.length && /2 lines/.test(pl.rows[1].via), JSON.stringify(pl.refused));
  assert.ok(pl.files.length === 1 && pl.files[0].preview[0].text.includes('cost(8.0)') && pl.files[0].rewritten === 2, JSON.stringify(pl.files));
  assert.ok(fs.readFileSync(mf).equals(modBefore), 'plan writes nothing');
  ok('check lists the mod rows far from the game fit; plan proposes the fitted price, keeps the number form, finds the price of a two-line row');
  // the line form: no cost on the line, cost twice, a number that is not the price read
  const x = { id: 'mp/a', mod: 5 };
  assert.ok(/not a cost\(N\)/.test(G.spliceLine('{"mp/a" ("inf_tier2")}', x, 7).why));
  assert.ok(/2 times/.test(G.spliceLine('{"mp/a" ("inf_tier2" cost(5) cost(5))}', x, 7).why));
  assert.ok(/not the price read/.test(G.spliceLine('{"mp/a" ("inf_tier2" cost(6))}', x, 7).why));
  assert.strictEqual(G.spliceLine('{"mp/a"\t("inf_tier2" cost( 5 ))} ; cost(5) note\r', x, 7).line, '{"mp/a"\t("inf_tier2" cost( 7 ))} ; cost(5) note\r', 'only the number; comment and CR kept');
  ok('the line splice: refused where its form is not understood, else only the number changes');
  // write: restore point first, only the number, CRLF kept, game untouched; verify on a fresh read
  const ap = G.apply(S, r, gf, {});
  const after = fs.readFileSync(mf, 'latin1');
  assert.ok(ap.changed.length === 1 && ap.points.length === 1 && after.includes('rifle_2"\t("inf_tier2" side(ger) period(early) cost(8.0))') && !/[^\r]\n/.test(after), 'written, CRLF kept');
  assert.strictEqual(after.length, modBefore.length - 1, 'one character less (20.0 -> 8.0), nothing else');
  assert.ok(fs.readFileSync(path.join(game, U + 'early/inf_ger.set')).equals(gameBytes), 'the game file is untouched');
  const MW = require('../../lib/modwrite'), rp = path.join(MW.restoreRoot(mod), ap.points[0]);
  const man = JSON.parse(fs.readFileSync(path.join(rp, 'restore-point.json'), 'utf8'));
  assert.ok(man.existed && man.rel === 'resource/set/multiplayer/units/early/inf_ger.set' && fs.readFileSync(path.join(rp, 'files', ...man.rel.split('/'))).equals(modBefore), 'restore point holds the file as it was');
  const S2 = G.open({ game, mod }), v = G.verify(S2, G.result(S2), gf, ap.edits, {});
  assert.strictEqual(v.count, 0, JSON.stringify(v.findings)); assert.ok(v.findings.some(f => f.code === 'CHECK_OK'));
  assert.ok(G.apply(S2, G.result(S2), gf, {}).nothing, 'a second write changes nothing');
  // a tampered file is caught by the check
  fs.writeFileSync(mf, after.replace('smg_2', 'smg_9'), 'latin1');
  const S3 = G.open({ game, mod }), v3 = G.verify(S3, G.result(S3), gf, ap.edits, {});
  assert.ok(v3.findings.some(f => f.code === 'CHECK_DATA_CHANGED'), JSON.stringify(v3.findings));
  ok('write: restore point, only the price number, CRLF and the game kept; the check reads it back and catches other changes');
}
// ---- 4. the price forms: a row over several lines with {cost N}, a define of the mod used by one row, a define two rows share
{
  const lines = ['{"mp/a"', '\t("inf_tier2" side(ger))', '\t{cost 30}', '}'], gl = () => lines;
  const e = G.spliceRow({ keys: [], s: { winner: () => 'local' } }, gl, { file: 'f', line: 1, id: 'mp/a', mod: 30 }, 9);
  assert.ok(e.edits && e.edits.length === 1 && e.edits[0].i === 2 && e.edits[0].line === '\t{cost 9}' && /2 lines|4 lines/.test(e.via), JSON.stringify(e));
  const two = G.spliceRow({ keys: [], s: { winner: () => 'local' } }, () => ['{"mp/a" ("inf_tier2" cost(5))', '\t{cost 5}', '}'], { file: 'f', line: 1, id: 'mp/a', mod: 5 }, 9);
  assert.ok(/2 times/.test(two.why), JSON.stringify(two));
  const m2 = path.join(tmp, 'mod2');
  const inf = fs.readFileSync(path.join(game, U + 'settings_inf.set'), 'latin1') +
    '(define "inf_tier2_mine"\r\n\t("inf_g" cost(20.0))\r\n\t{tags "%period %side infantry"}\r\n\t{cp 3}\r\n\t{cw 1}\r\n)\r\n' +
    '(define "inf_tier3_sh"\r\n\t("inf_g" cost(40.0))\r\n\t{tags "%period %side infantry"}\r\n\t{cp 3}\r\n\t{cw 1}\r\n)\r\n';
  put(m2, U + 'settings_inf.set', inf);
  put(m2, U + 'early/inf_ger.set', fs.readFileSync(path.join(game, U + 'early/inf_ger.set'), 'latin1')
    .replace('rifle_2"\t("inf_tier2" side(ger) period(early) cost(8.0))', 'rifle_2"\t("inf_tier2_mine" side(ger) period(early))')
    .replace('rifle_3"\t("inf_tier3" side(ger) period(early) cost(13.0))', 'rifle_3"\t("inf_tier3_sh" side(ger) period(early))')
    .replace('smg_3"\t("inf_tier3" side(ger) period(early) cost(15.0))', 'smg_3"\t("inf_tier3_sh" side(ger) period(early))'));
  const empty = path.join(tmp, 'empty'), gf = G.gameFit({ game, empty });
  const S4 = G.open({ game, mod: m2 }), r4 = G.result(S4);
  assert.deepStrictEqual(['rifle_2', 'rifle_3', 'smg_3'].map(id => r4.breeds.find(b => b.id === 'mp/ger/early/' + id).mod.mp), [20, 40, 40], 'prices read through the defines');
  const p4 = G.plan(S4, r4, gf, {});
  assert.deepStrictEqual(p4.rows.map(x => [x.id, x.old, x.new]), [['mp/ger/early/rifle_2', 20, 8]], JSON.stringify(p4));
  assert.ok(/define "inf_tier2_mine"/.test(p4.rows[0].via) && p4.files.length === 1 && p4.files[0].rel === U + 'settings_inf.set' && p4.files[0].preview[0].text === '\t("inf_g" cost(8.0))', JSON.stringify(p4.files));
  assert.ok(p4.refused.length === 2 && p4.refused.every(x => /define "inf_tier3_sh", which 2 rows use/.test(x.why)), JSON.stringify(p4.refused));
  const a4 = G.apply(S4, r4, gf, {}), S5 = G.open({ game, mod: m2 });
  assert.ok(a4.changed.length === 1 && G.result(S5).breeds.find(b => b.id === 'mp/ger/early/rifle_2').mod.mp === 8 && G.verify(S5, G.result(S5), gf, a4.edits, {}).count === 0, 'the define written and read back');
  ok('price forms: {cost N} in a row over lines, a define the row alone uses; a define two rows share is refused with its reason');
}
// ---- 5. the saved model: text form, edits in place, save (restore point), measure on it, game rows copied on opt-in, Undo
{
  const m3 = path.join(tmp, 'mod3'); fs.mkdirSync(m3, { recursive: true });
  const empty = path.join(tmp, 'empty'), gf = G.gameFit({ game, empty });
  let S6 = G.open({ game, mod: m3 }), r6 = G.result(S6);
  assert.ok(r6.modelFrom === 'fit' && r6.model.rel === G.MODEL_KEY && !r6.model.file && /\{goh_price_model\r\n/.test(r6.model.text), 'no saved model: the fit, its text offered');
  const rd = G.readModel(r6.model.text);
  assert.ok(!rd.errs.length && rd.model.weapons.find(x => x.key === 'k98').price === 8 && rd.model.vets.find(x => x.key === '3').price === 2, JSON.stringify(rd));
  const ed = G.editModel(r6.model.text, [{ op: 'term', group: 'weapons', key: 'k98', price: 20 }, { op: 'term', group: 'extras', key: 'mine', price: 3 }, { op: 'term', group: 'specials', key: 'inf_officer', price: null }, { op: 'term', group: 'nope', key: 'x', price: 1 }]);
  assert.ok(ed.done === 3 && ed.errs.length === 1 && /\t\{weapon "k98" 20\}\r\n/.test(ed.text) && /\{kit "mine" 3\}\r\n\}/.test(ed.text) && !/inf_officer/.test(ed.text) && /^; price_model/.test(ed.text), ed.text);
  const tr = G.result(S6, G.readModel(ed.text).model);
  assert.ok(tr.modelFrom === 'try' && tr.breeds.find(b => b.id === 'mp/ger/early/rifle_2').calc.mp === 20 && tr.breeds.find(b => b.id === 'mp/ger/early/officer').calc.mp === null, 'try: priced on the given model');
  assert.throws(() => G.saveModel(S6, '{goh_price_model\r\n\t{weapon k98 8}\r\n}\r\n'), /does not read: line 2/);
  const sv = G.saveModel(S6, ed.text), mf = path.join(m3, ...G.MODEL_KEY.split('/'));
  assert.ok(fs.readFileSync(mf, 'latin1') === ed.text && sv.points.length === 1, 'saved as given, CRLF');
  S6 = G.open({ game, mod: m3 }); r6 = G.result(S6);
  assert.ok(r6.modelFrom === 'saved' && r6.model.file === mf && r6.gohModel.weapons.find(x => x.key === 'k98').price === 20, 'the saved model is the measure');
  const ck = G.check(S6, r6, gf, {});
  assert.ok(ck.count === 0 && ck.fromGame === 4 && ck.findings.some(f => f.code === 'GOH_GAME_ROWS_FAR') && /saved model/.test(ck.by), JSON.stringify(ck.findings));
  const pn = G.plan(S6, r6, gf, {});
  assert.ok(!pn.rows.length && pn.fromGame === 4, 'no opt-in: game rows only counted');
  const pc = G.plan(S6, r6, gf, { copyGame: true });
  assert.ok(pc.rows.length === 4 && pc.copied.length === 1 && pc.copied[0] === U + 'early/inf_ger.set' && pc.rows.every(x => x.copied), JSON.stringify(pc.rows));
  const ac = G.apply(S6, r6, gf, { copyGame: true }), cf = path.join(m3, ...(U + 'early/inf_ger.set').split('/'));
  const gameTxt = fs.readFileSync(path.join(game, U + 'early/inf_ger.set'), 'latin1');
  assert.ok(ac.created.length === 1 && fs.existsSync(cf) && fs.readFileSync(cf, 'latin1').length === gameTxt.length + 2 && fs.readFileSync(cf, 'latin1').includes('rifle_1"\t("inf_tier1" side(ger) period(early) cost(19.0))'), 'game file copied into the mod, then its far-off prices changed');
  const S7 = G.open({ game, mod: m3 }); assert.strictEqual(G.verify(S7, G.result(S7), gf, ac.edits, { copyGame: true }).count, 0, 'read back');
  const u1 = G.undoLast(S7);
  assert.ok(!fs.existsSync(cf) && u1.created.length === 1 && fs.existsSync(mf), 'Undo: the copied game file goes, the model stays');
  const u2 = G.undoLast(G.open({ game, mod: m3 }));
  assert.ok(!fs.existsSync(mf) && u2.created[0] === G.MODEL_KEY, 'Undo again: the model save taken back');
  assert.throws(() => G.undoLast(G.open({ game, mod: m3 })), /Nothing to undo/);
  ok('saved model: text, edits in place, save with a restore point, measure on it; game rows copied only on opt-in; Undo takes each write back');
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('PASS');
