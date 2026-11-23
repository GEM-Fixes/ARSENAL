#!/usr/bin/env node
// pack: rep list + mod stack -> edrun game files (g1.json, g2.json ...), each 7 pairs plus the control.
//   node tools/edrun/pack.js --game G --reps reps.md --out dir [--mods as64+] [--control t34_0:gaz67b] [--di-inf rifle:5:30]
//        [--di-shooter stem] [--tank-human] [--backfill pairs.json] [--per-game 7] [--seed n] [--rifle-guns] [--no-fo] [--no-di] [--neg] [--soft-ref] [--dry]
//        [--exe as64|mowas_2|mowas2|<exe file>]
// --exe (game parity): the game whose cards are read. none or as64 = as before (mods default as64+); mowas_2 / mowas2 / mowas_2_ed.exe = the MoW:AS2
//   vfs view (no as64/core), mods default none; goh refused, exit 2 (edrun cannot run on GoH:
// controls (PK-1): default is ONE, pz6bh on t34_0 (TST-55). With one control a game is void if it misses. t34_0 on gaz67b is no longer a default control
//   (reassess-6 s3). No pz6bh card on the stack: warn, fall back to t34_0:gaz67b:600 so small stacks still pack. --control shooter:foe[:dist] (repeatable) works as before,
//   void only if every control missed.
//   --neg: once per session (game 1) the report-only pair neg_t34pz6, t34_0 on pz6bh, expected NOKILL, not control; a KILL there means the penetration test is broken.
//   --soft-ref: once per session the report-only pair ref_pz6gaz, pz6bh on gaz67b, not control. Both only take a pair slot; they never void a game.
//   damage-in shooter default is its own constant t34_0 (DI_SHOOTER), not the control; with an explicit --control it is that control's shooter, as before.
// reps: a markdown table (rows "| n | rep | army | ..."; rep is name or name(army)) or plain lines "name(army) [breed=x] [foe=inf|veh]"
// foe by role (TST-62): a light car (group car / armored car or such a name; weapon 20 mm or less where readable) gets ONE rifle at 100 m, mark dead, not gaz67b
// per rep: fire-out fo_<rep> and damage-in di_<rep>. infantry di = di-inf (default 5 rifles at 30 m shooting the rep);
//   damage-in shooter (TST-47: a kill test needs a shooter of the foe's class or above): by the rep's class group (folder after -vehicle/ in its def key):
//   heavy/super groups -> pz6bh (the Tiger 2); every other group -> the control shooter. A rep that is pz6bh gets is2 (no self-shooting). crew from the
//   shooter's own card. --di-shooter stem overrides it for the run, rep option dishooter=stem for one rep. Card/crew missing on the stack -> the control
//   shooter and a warning. The control pair itself never changes.
//   --tank-human also adds tk_<rep>: the control tank on the lone human (RT-1 is still finding out why those fail, so off by default)
// rules (checked in test/pack-test.js): crew read from the card content "( breed:n ... )"; vehicle/gun shooters are bare basenames;
//   pair names lowercase a-z0-9_; controls `ctl`, `ctl2` = per-stack, --control shooter:foe[:dist] may repeat, default pz6bh:t34_0 (TST-47, TST-55),
//   crew from their own cards, `control:true` on each so edrun reports which passed; foe + distance by class (CLASS);
//   max 8 pairs a game (controls + the rest); short games top up from --backfill; a game with no control is never written. A game is void only if every control missed (one control: if it misses).
// reads cards only (unitgroups.readCards on the stack). writes only --out. no game, no editor.
// Author: Imperator_Aug (ARSENAL, ia-f25e24c9)
const fs = require('fs'), path = require('path');
const ARMIES = ['rus', 'ger2', 'ger', 'usa', 'eng', 'jap', 'ost', 'ita', 'fin', 'hun', 'rom', 'pol', 'fra', 'axis', 'allies'];
const MAX_PAIRS = 8;
// shooter class -> foe kind and distance. dist 0 = edrun's own default for the class (vehicle 400, gun 400, infantry 80)
const CLASS = {
  vehicle: { foe: 'veh', dist: 0 }, gun: { foe: 'veh', dist: 0 },
  mortar: { foe: 'inf', dist: 0 }, mg: { foe: 'inf', dist: 0 }, infantry: { foe: 'inf', dist: 0 },
};
const MORTAR = /mortar|^type94|^sgrw|^granatwerfer/, MGUN = /_stan$/;
const FOE_VEH = 'gaz67b', FOE_INF = 'mp/ger/rifle';
// damage-in shooter by the rep's class group (folder after -vehicle/ in its def key): armour above medium -> pz6bh (TST-47), else the control
const HEAVY = /heavy|super/, HEAVY_SHOOTER = 'pz6bh', HEAVY_ALT = 'is2';
const groupOfKey = key => { const m = /\/-vehicle\/([^\/]+)\//.exec(String(key || '')); return m ? m[1] : null; };

// PK-1 (reassess-6 s3, TST-55): one default control, pz6bh on t34_0. t34_0 on gaz67b is no longer a control (changed a void ruling in 1 of 60 games).
// No pz6bh card on the stack: warn and fall back to the old t34_0 on gaz67b, so small test stacks still pack.
const DEFAULT_CONTROLS = ['pz6bh:t34_0'], FALLBACK_CONTROL = 't34_0:gaz67b:600';
// the damage-in shooter for every non-heavy group. Its own constant: it was "the first control" and must not follow the control change.
// An explicit --control still makes its first shooter the damage-in shooter, as before.
const DI_SHOOTER = 't34_0';
// report-only pairs, one per session (--neg, --soft-ref): not controls, never void a game
const NEG_PAIR = { name: 'neg_t34pz6', shooter: 't34_0', foe: 'pz6bh', expected: 'NOKILL' };   // a kill here means the penetration test is broken
const SOFT_REF_PAIR = { name: 'ref_pz6gaz', shooter: 'pz6bh', foe: 'gaz67b' };
const lcName = s => String(s).toLowerCase().replace(/[^a-z0-9_]/g, '_');
const baseName = s => String(s).split('/').pop().replace(/\(.*$/, '').replace(/\.\w+$/, '');
const armyOf = c => c.tags.find(t => ARMIES.includes(t));

function parseReps(text, isMd) {
  const reps = [], errs = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    let rep, army, opts = {};
    if (line[0] === '|') {
      const c = line.split('|').map(s => s.replace(/`/g, '').trim());
      if (!/^\d+$/.test(c[1] || '')) continue;
      rep = c[2]; if (ARMIES.includes(c[3])) army = c[3];
    } else if (isMd) continue;
    else {
      const w = line.split(/\s+/); rep = w[0];
      for (const t of w.slice(1)) { const m = /^(\w+)=(\S+)$/.exec(t); if (m) opts[m[1]] = m[2]; else if (ARMIES.includes(t)) army = t; }
    }
    const m = /^([A-Za-z0-9_\-]+)(?:\(([a-z0-9]+)\))?$/.exec(rep || '');
    if (!m) { errs.push(`rep line not understood: ${line.slice(0, 60)}`); continue; }
    reps.push({ name: m[1], army: m[2] || army, opts });
  }
  return { reps, errs };
}

function findCard(cards, name, army) {
  const hit = cards.filter(c => (army ? (c.card === `${name}(${army})` || (c.card === name && c.tags.includes(army))) : (baseName(c.card) === name)));
  return hit.length === 1 || (hit.length && army) ? hit[0] : null;
}
// "* ( mp/rus/tankman:3 mp/rus/tankman2:1)" -> breed list, null when the card has no crew
function crewOf(card) {
  const m = /\(([^)]*)\)/.exec(card.content);
  if (!m) return null;
  const out = [];
  for (const t of m[1].trim().split(/\s+/).filter(Boolean)) { const [b, n] = t.split(':'); for (let i = 0; i < (+n || 1); i++) out.push(b); }
  return out.length ? out : null;
}
// soldier breeds of a squad card; first one that is not a squad leader stands for the squad
function squadBreed(card) {
  const bs = String(card.content).split(/\s+/).filter(Boolean).map(t => t.split(':')[0]).filter(b => /^mp\//.test(b));
  return bs.find(b => !/\/squadleader/.test(b)) || bs[0] || null;
}
function classOf(card, name, opts) {
  if (card.tags.includes('infantry') || (!/\*/.test(card.content) && squadBreed(card))) return 'infantry';
  let c = card.tags.includes('cannon') ? 'gun' : 'vehicle';
  if (c === 'gun') c = MORTAR.test(name) ? 'mortar' : MGUN.test(name) ? 'mg' : 'gun';
  return c;
}
// TST-62 [V car-2]: a light car's soft foe is ONE rifleman at 100 m, mark dead; gaz67b at 80 is NOKILL for the same car.
// Light car = the def's group (folder after -vehicle/) says car / armored car, or the name does; group "btr" (armored cars and APCs share it) only when a weapon
// calibre is readable and is 20 mm or less. A readable weapon over 20 mm is never a light car. mm null = not readable.
const CAR_GROUP = /^(car|cars|armou?red[_\-]?cars?|armou?red)$|^car[_\-]/i, CAR_NAME = /(^|[_\-])(armou?red[_\-]?)?car($|[_\-\d])/i;
const LIGHT_CAR_MM = 20, LIGHT_FOE = { dist: 100, mark: 'dead' };
function isLightCar(name, group, mm) {
  if (mm !== null && mm !== undefined && mm > LIGHT_CAR_MM) return false;
  if (group && CAR_GROUP.test(group)) return true;
  if (group === 'btr') return mm !== null && mm !== undefined;
  return CAR_NAME.test(String(name || ''));
}
const poolClass = c => (c === 'vehicle' || c === 'infantry' ? c : 'gun');   // edrun pair class

function parseSpec(s, what) {
  const m = /^([a-z0-9_\/]+):(\d+):(\d+)$/.exec(s);
  if (!m) throw new Error(`${what} must be breed:count:dist, got ${s}`);
  return { breed: m[1], count: +m[2], dist: +m[3] };
}

// -> { pairs: [{kind:'fo'|'di'|'tk', pair}], ctl, errs }
function buildPairs(reps, cards, o = {}) {
  const errs = [], warns = [], items = [];
  // the first control is the slot other code calls "the control shooter". default two, lim TST-47, TST-48: a game is void only if both miss
  const explicit = !(o.control === undefined || o.control === true);
  let given = explicit ? [].concat(o.control).map(String) : DEFAULT_CONTROLS;
  if (!explicit && !findCard(cards, baseName(DEFAULT_CONTROLS[0].split(':')[0]), null)) {
    warns.push(`no ${DEFAULT_CONTROLS[0].split(':')[0]} card on this stack: falling back to the old control ${FALLBACK_CONTROL}`);
    given = [FALLBACK_CONTROL];
  }
  const specs = given.map(s => { const [cs, cf = FOE_VEH, d] = s.split(':'); return { cs, cf, dist: d === undefined ? 0 : +d }; });
  const ctls = [];
  specs.forEach((sp, k) => {
    const cc = findCard(cards, sp.cs, null), fc = findCard(cards, sp.cf, null), ctlCrew = cc && crewOf(cc);
    const foeCrew = sp.cf === FOE_VEH ? [FOE_INF] : fc && crewOf(fc);
    if (!cc || !ctlCrew || !fc || !foeCrew) {
      const why = `control ${sp.cs} vs ${sp.cf} not usable on this stack (card ${cc ? 'ok' : 'missing'}, crew ${ctlCrew ? 'ok' : 'missing'}, foe card ${fc ? 'ok' : 'missing'})`;
      // the first slot is required; a later default control may be missing on a small stack, the game keeps the one it has
      (k === 0 || explicit ? errs : warns).push(why);
      return;
    }
    if (k > 0 && !ctls.length) return;
    const c = { name: ctls.length ? `ctl${ctls.length + 1}` : 'ctl', class: 'vehicle', shooter: baseName(sp.cs), crew: ctlCrew, foe: baseName(sp.cf), foeCrew, control: true };
    if (sp.dist) c.dist = sp.dist;
    ctls.push(c);
  });
  const ctl = ctls[0] || null;
  const di = parseSpec(o.diInf || 'rifle:5:30', '--di-inf');
  const seen = new Map();
  for (const r of reps) seen.set(r.name, (seen.get(r.name) || 0) + 1);
  for (const r of reps) {
    const card = findCard(cards, r.name, r.army);
    if (!card) { errs.push(`rep ${r.name}${r.army ? '(' + r.army + ')' : ''}: no card on this stack`); continue; }
    const army = r.army || armyOf(card), tag = lcName(r.name) + (seen.get(r.name) > 1 ? '_' + army : '');
    const cl = classOf(card, r.name, r.opts), pc = poolClass(cl);
    const mk = (kind, pair) => items.push({ kind, rep: r.name, pair });
    if (cl === 'infantry') {
      const breed = r.opts.breed ? `mp/${army}/${r.opts.breed}` : squadBreed(card);
      if (!breed) { errs.push(`rep ${r.name}: squad has no soldier breed`); continue; }
      const fo = { name: 'fo_' + tag, class: 'infantry', shooter: breed, count: 3, foe: FOE_INF };
      if (CLASS.infantry.dist) fo.dist = CLASS.infantry.dist;
      if (!o.noFo) mk('fo', fo);
      if (!o.noDi) {
        const sh = /\//.test(di.breed) ? di.breed : `mp/${army === 'ger' ? 'rus' : 'ger'}/${di.breed}`;
        mk('di', { name: 'di_' + tag, class: 'infantry', shooter: sh, count: di.count, foe: breed, dist: di.dist });
      }
      if (o.tankHuman && ctl) mk('tk', { name: 'tk_' + tag, class: 'vehicle', shooter: ctl.shooter, crew: ctl.crew, foe: breed });
      continue;
    }
    let crew = crewOf(card);
    if (!crew) { errs.push(`rep ${r.name}: card has no crew in its content`); continue; }
    if (o.rifleGuns && pc === 'gun') crew = crew.map(() => `mp/${army}/rifle`);
    const sh = baseName(r.name);
    const lightCar = cl === 'vehicle' && isLightCar(r.name, o.groupOf ? o.groupOf(r.name) : null, o.weaponMm ? o.weaponMm(r.name) : null);
    const infFoe = r.opts.foe ? r.opts.foe === 'inf' : (CLASS[cl].foe === 'inf' || lightCar);
    if (!o.noFo) {
      const fo = { name: 'fo_' + tag, class: pc, shooter: sh, crew };
      if (infFoe) fo.foe = FOE_INF; else { fo.foe = FOE_VEH; fo.foeCrew = [FOE_INF]; }
      if (CLASS[cl].dist) fo.dist = CLASS[cl].dist;
      if (infFoe && lightCar) Object.assign(fo, LIGHT_FOE);   // one rifle (edrun's infantry foe is one man), 100 m, mark dead
      mk('fo', fo);
    }
    if (!o.noDi && ctl) {
      const grp = o.groupOf ? o.groupOf(r.name) : null;
      const diBase = explicit ? ctl.shooter : DI_SHOOTER;   // default: t34_0 whatever the control is
      let want = r.opts.dishooter || o.diShooter || (grp && HEAVY.test(grp) ? HEAVY_SHOOTER : null);
      if (want && baseName(want).toLowerCase() === sh.toLowerCase()) want = sh.toLowerCase() === HEAVY_SHOOTER ? HEAVY_ALT : null;   // the rep can't shoot itself
      if (!want) want = diBase;
      let ds = { shooter: ctl.shooter, crew: ctl.crew };
      if (want && baseName(want).toLowerCase() !== ctl.shooter.toLowerCase()) {
        const wc = findCard(cards, baseName(want), null), wcrew = wc && crewOf(wc);
        if (wcrew) ds = { shooter: baseName(want), crew: wcrew };
        else warns.push(`rep ${r.name}: damage-in shooter ${want} has no usable card/crew on this stack, using control ${ctl.shooter}`);
      }
      const d = { name: 'di_' + tag, class: 'vehicle', shooter: ds.shooter, crew: ds.crew, foe: sh, foeCrew: crew };
      if (pc === 'gun') d.foeClass = 'gun';
      mk('di', d);
    }
  }
  // report-only pairs, once per session. a missing card is a warning, the session still packs
  const extras = [];
  const extra = (spec, flag) => {
    const sc = findCard(cards, spec.shooter, null), fc = findCard(cards, spec.foe, null), screw = sc && crewOf(sc);
    const fcrew = spec.foe === FOE_VEH ? [FOE_INF] : fc && crewOf(fc);
    if (!sc || !screw || !fc || !fcrew) { warns.push(`${flag}: ${spec.shooter} on ${spec.foe} not usable on this stack (card or crew missing), pair left out`); return; }
    const p = { name: spec.name, class: 'vehicle', shooter: spec.shooter, crew: screw, foe: spec.foe, foeCrew: fcrew };
    if (spec.expected) p.expected = spec.expected;
    extras.push({ kind: 'extra', rep: null, pair: p });
  };
  if (o.neg) extra(NEG_PAIR, '--neg');
  if (o.softRef) extra(SOFT_REF_PAIR, '--soft-ref');
  return { items, ctl, ctls, extras, errs, warns };
}

// deal items over games of `per` pairs + control, round robin so fire-out and damage-in mix; top up short games from backfill
function packGames(items, ctl, o = {}) {
  const ctls = Array.isArray(ctl) ? ctl : ctl ? [ctl] : [], room = MAX_PAIRS - ctls.length;
  const per = Math.min(o.perGame || room, room), warns = [];
  if (!ctls.length) throw new Error('no control: refusing to write games');
  let list = items.map(i => i.pair);
  if (o.seed !== undefined) { let s = (+o.seed) >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } }
  // report-only extras go in once per session, ahead of the dealt pairs (game 1, then game 2), after the shuffle so --seed keeps them first
  list = [...(o.extras || []).map(i => i.pair || i), ...list];
  const n = Math.ceil(list.length / per), games = Array.from({ length: n }, () => [...ctls]);
  list.forEach((p, i) => games[i % n].push(p));
  const back = (o.backfill || []).filter(p => p && !/^ctl\d*$/.test(p.name)).slice();
  for (const g of games) {
    while (g.length < MAX_PAIRS && back.length) {
      const k = back.findIndex(p => !g.some(q => q.name === p.name));
      if (k < 0) break;
      const p = back.splice(k, 1)[0]; p.name = lcName(p.name); g.push(p);
    }
    if (g.length < MAX_PAIRS) warns.push(`game ${games.indexOf(g) + 1} has ${g.length} pairs (backfill ran out)`);
  }
  for (const g of games) if (!g.some(p => p.name === 'ctl') || g.length > MAX_PAIRS) throw new Error('game without control or over 8 pairs');
  return { games, warns };
}

function loadCards(game, mods, exe) {
  const ug = require('../unitgroups/unitgroups.js'), ix = require('../entityindex/index.js');
  const { src, idx } = ix.build(exe ? { gameDir: game, mods, exe } : { gameDir: game, mods });
  // weaponMm: largest NNmm in the weapon names of the rep's def refs (entityindex refs [kind, value]); null when the index lists none
  const weaponMm = n => { const r = idx.byName(n); if (!r || !r.length) return null; let mm = null; for (const f of r[0].refs || []) if (f[0] === 'weapon') { const m = /(\d+(?:\.\d+)?)\s*mm/i.exec(f[1]); if (m) mm = Math.max(mm || 0, parseFloat(m[1])); } return mm; };
  return { cards: ug.readCards(src, ix), weaponMm, groupOf: n => { const r = idx.byName(n); return r && r.length ? groupOfKey(r[0].key) : null; } };
}
function parseArgs(argv) {
  const a = {}, flags = new Set(['tank-human', 'rifle-guns', 'no-fo', 'no-di', 'dry', 'neg', 'soft-ref']);
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    if (flags.has(k)) a[k] = true;
    else if (k === 'control') (a.control = a.control || []).push(argv[++i]);   // may repeat
    else a[k] = argv[++i];
  }
  return a;
}
function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.game || !a.reps || (!a.out && !a.dry)) { console.error('usage: pack.js --game G --reps file --out dir [--mods as64+] [--control t34_0:gaz67b] [--di-inf rifle:5:30] [--di-shooter stem] [--tank-human] [--backfill pairs.json] [--per-game 7] [--seed n] [--rifle-guns] [--no-fo] [--no-di] [--neg] [--soft-ref] [--dry] [--exe as64|mowas_2]'); process.exit(2); }
  const md = require('./mindist.js'), GAME = md.gameOfExe(a.exe);
  if (!GAME) { console.error('pack: unknown --exe ' + a.exe + ' (as64, mowas_2, mowas2, goh or an exe file name)'); process.exit(2); }
  if (GAME === 'goh') require('../lib/games').refuse('pack', 'goh', ...md.GOH_WHY);
  const { reps, errs: pe } = parseReps(fs.readFileSync(a.reps, 'latin1'), /\.md$/i.test(a.reps));
  const { cards, groupOf, weaponMm } = loadCards(a.game, String(a.mods !== undefined ? a.mods : GAME === 'as64' ? 'as64+' : '').split(',').filter(Boolean), md.vfsExeOf(GAME));
  const b = buildPairs(reps, cards, { groupOf, weaponMm, diShooter: a['di-shooter'], control: a.control, diInf: a['di-inf'], tankHuman: a['tank-human'], rifleGuns: a['rifle-guns'], noFo: a['no-fo'], noDi: a['no-di'], neg: a.neg, softRef: a['soft-ref'] });
  const errs = [...pe, ...b.errs];
  errs.forEach(e => console.error('warn: ' + e));
  b.warns.forEach(e => console.error('warn: ' + e));
  if (!b.ctl) { console.error('BLOCKED: no control on this stack, nothing written'); process.exit(3); }
  const backfill = a.backfill ? JSON.parse(fs.readFileSync(a.backfill, 'utf8')) : [];
  const { games, warns } = packGames(b.items, b.ctls, { perGame: a['per-game'] && +a['per-game'], seed: a.seed, backfill, extras: b.extras });
  warns.forEach(w => console.error('warn: ' + w));
  console.log('controls: ' + b.ctls.map(c => `${c.name} ${c.shooter} on ${c.foe}${c.dist ? ' at ' + c.dist : ''}`).join('; ') + '; edrun report games[].controls says which passed, a game is void only if none did (one control: void if it misses)');
  if (!a.dry) { fs.mkdirSync(a.out, { recursive: true }); games.forEach((g, i) => fs.writeFileSync(path.join(a.out, `g${i + 1}.json`), JSON.stringify(g, null, 1) + '\n')); }
  games.forEach((g, i) => console.log(`g${i + 1} ${g.length}: ${g.map(p => p.name).join(' ')}`));
  process.exit(errs.length ? 1 : 0);
}
if (require.main === module) main();
module.exports = { loadCards, parseReps, findCard, crewOf, squadBreed, classOf, isLightCar, buildPairs, packGames, lcName, baseName, groupOfKey, CLASS, MAX_PAIRS };
