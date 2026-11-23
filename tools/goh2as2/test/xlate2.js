// XLATE-2 tests. Part 1: units on invented data (no game data). Part 2: the 26 regression reps through --donor (needs the GoH and AS2 installs; SKIP when absent).
//   node tools/goh2as2/test/xlate2.js [--no-reps] [--out <dir>]    out: <dir>/<rep>/ and <rep>.json; default a per-run temp dir, removed at exit (parallel runs never share it)
// Author: Imperator_Aug (ARSENAL, ia-9cf60471)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const TR = require('../translate');
const oi = process.argv.indexOf('--out'), keep = oi > 0 && !!process.argv[oi + 1];
const tool = path.join(__dirname, '..', 'goh2as2.js'), out = keep ? path.resolve(process.argv[oi + 1]) : fs.mkdtempSync(path.join(require('os').tmpdir(), 'xlate2-'));
if (!keep) process.on('exit', () => { try { fs.rmSync(out, { recursive: true, force: true }); } catch { /* temp */ } });
let fail = 0;
const t = (name, good, extra) => { console.log((good ? 'ok   ' : 'FAIL ') + 'xlate2: ' + name + (good || !extra ? '' : '  ' + String(extra).slice(0, 400))); if (!good) fail++; };

// ---- part 1: units
const A = 'x\r\n{game_entity\r\n\t{mass 100}\r\n\t{Chassis\r\n\t\t{Locomotion ("locomotion")\r\n\t\t\t{MaxSpeed 20}\r\n\t\t\t{TurnTime 5}\r\n\t\t}\r\n\t\t{fuelbag {volume 50}}\r\n\t}\r\n\t{Other {mass 7}}\r\n}\r\n';
let r = TR.setKey(A, 'Locomotion', 'MaxSpeed', 33);
t('setKey replaces in the parent block', !!r && /\{MaxSpeed 33\}/.test(r.text) && r.old === 20 && !r.added);
r = TR.setKey(A, 'Locomotion', 'StartTime', 4);
t('setKey adds before the closing brace (CRLF)', !!r && r.added && /\t\t\t\{StartTime 4\}\r\n\t\t\}/.test(r.text), r && r.text);
r = TR.setKey(A, null, 'mass', 250);
t('setKey top level takes depth 1 only (not the nested mass 7)', !!r && /\{mass 250\}/.test(r.text) && /\{mass 7\}/.test(r.text) && r.old === 100);
t('setKey: no such parent -> null', TR.setKey(A, 'Nope', 'x', 1) === null);
const sm = { min: 0, p5: 10, p25: 20, p50: 30, p75: 40, p95: 50, max: 60 }, am = { min: 0, p5: 5, p25: 10, p50: 15, p75: 20, p95: 25, max: 30 };
t('qmap: median to median, above the sample to the AS2 max, inside is linear', TR.qmap(30, sm, am) === 15 && TR.qmap(99, sm, am) === 30 && TR.qmap(25, sm, am) === 12.5);
t('crewCount: crew_3_human + two crew_human', TR.crewCount('("crew_3_human") ("crew_human") ("crew_human_visible")') === 5);
const F = { armor_body_front_max: { mode: 'copy', factor: 1, chosen: false, train_err: { copy: .3 }, as2_p5: 1, as2_p95: 99 }, armor_body_front_med: { mode: 'factor', factor: .5, chosen: true, train_err: { factor: .2 }, as2_p5: 1, as2_p95: 99 } };
const ar = TR.armourRule({ armor_body_front_max: 100, armor_body_front_med: 60 }, F);
t('armourRule: aggregation by the table\'s chosen flag, predictor by mode (med 60 x 0.5 = 30)', ar.faces.body.front && ar.faces.body.front.agg === 'med' && ar.faces.body.front.v === 30, JSON.stringify(ar));
// XLATE-3: GL-3 rule through the rep's own volumes
const vtxt = '{game_entity\r\n{volume "body" {thickness 10 {front 40}{left 30}{right 30}{rear 20}{top 10}}}\r\n{volume "body1" {thickness 10 {front 40}{left 30}{right 25}{rear 20}{top 10}}}\r\n{volume "body2" {thickness 10 {front 60}{left 30}{right 30}{rear 20}{top 10}}}\r\n{volume "turret" {thickness 5 {front 70}{left 50}{right 50}{rear 45}{top 20}}}\r\n{volume "trackleft" {thickness 20}}\r\n}\r\n';
const gv = TR.repVolumes(vtxt), g3 = TR.glRule('tank_medium', vtxt);
t('repVolumes reads the rep\'s volumes (5) from its text', gv.length === 5, JSON.stringify(gv.map(v => v.name)));
t('glRule: mode of body volumes (front 40, side 30, rear 20, top 10), turret front 70, via rule.js armourRule', !!g3 && g3.r.body.front === 40 && g3.r.body.side === 30 && g3.r.body.rear === 20 && g3.r.body.top === 10 && g3.r.turret.front === 70 && g3.r.how.body.front === 'mode', JSON.stringify(g3));
t('glRule: no volumes -> null, so translate() falls back to the old rule and says so', TR.glRule('tank_medium', '{game_entity {mass 5}}') === null);
// read-back: the engine area must not be read as the hull. donor-less check on invented text with the macro already expanded
const areaTxt = '{game_entity {armor {setting "engine" {thickness 5 10 10 6} {volumes "engine*"}} {setting "body" {thickness 13 10 10 6} {volumes "body*"}} {setting "turret" {thickness 15} {volumes "turret*"}}} {volume "engine" {thickness 1}}}';
const rb = TR.armourRead(areaTxt, 'entity/-vehicle/tank_light/x/x.def', { files: new Map() }, { readRec: () => Buffer.alloc(0) });
t('armourRead: hull from the body area, not the engine area (13 10 10 6); turret 1 arg = all faces 15', rb.armor_body_front === 13 && rb.armor_body_side === 10 && rb.armor_body_top === 6 && rb.armor_turret_rear === 15, JSON.stringify(rb));
// asking: answers file mode, rest of class
const ask = TR.makeAsker({ ask: 'answers', answers: { 'u:speed': { choice: 'translated', rest: true } } });
const q1 = ask.ask({ id: 'u:speed', class: 'c', stage: 'scale', key: 'speed', default: 'scale' }), q2 = ask.ask({ id: 'u:mass', class: 'c', stage: 'scale', key: 'mass', default: 'scale' }), q3 = ask.ask({ id: 'u:mass', class: 'c', stage: 'engine', key: 'mass', default: 'scale' });
t('asker: answered, then "rest of this class" applies to the same class and stage only, other stage gets the default', q1.choice === 'translated' && q2.choice === 'translated' && /rest of class/.test(q2.how) && q3.choice === 'scale', JSON.stringify([q1, q2, q3]));
t('asker: asking off -> default (AS2 scale)', TR.makeAsker({ ask: 'off' }).ask({ id: 'a', class: 'c', stage: 'scale', key: 'k', default: 'scale' }).choice === 'scale');

// ---- part 2
if (!process.argv.includes('--no-reps')) {
  const GD = require('../../lib/gamedir'), V = GD.workshop('400750', '2537987794') || '', H = GD.goh() || '', G = GD.resolve().dir || '';   // GOH_GAME / AS2_GAME / AS2_WORKSHOP_400750_2537987794, as2.json, Steam
  if (![V, H, G].every(d => d && fs.existsSync(d))) console.log('SKIP xlate2: the 26-rep run needs the GoH, GoH Valour and AS2 installs');
  else {
    // donors: from the b8r outputs (rebuild-1); the five unseen reps' donors are not recorded, a plausible stem per rep is used [I]
    const D = { '105mm_lefh18m': 'm2a1l', '120mm_wz1878': 'd1', '128mm_pak44': 'sfh18', '15cm_43m': 'type4_200mm', '8cm_bofors_29m': 'qf17', obice_7513: 'm8_howitzer', cckw_m33: 'isuzutx40_aa', fiat626_breda: 'isuzutx40_aa', su57: 'sdkfz234', 'uk-aec_mk3': 'sdkfz234_3', 'uk-universal_carrierqf6': 'type93scout', 'us-m8_grayhound_2': 'm8grayhound', m18_superhellcat: 'm18', m4a1e8_fr: 'm4a3e8', p2640: 'pz4h', tiger1e_early: 'pz6e', 'type5_chi-ri': 'churchill_crocodile', type97_shinhoto_120mm: 'stuh42', 'uk-matilda_mkii_cs': 'cromwell_mk_vii', 'uk-mkvic': 'pz1b', 'us-m2a1_lt': 'm5a1', pz4f_hun: 'pz4h', 'uk-75_mm_m1a1': 'm2a1l', 'uk-qf17pdr': 'qf17', 'uk-staghound': 'm8grayhound', 'us-m4a3_76': 'm4a3e8' };
    const reps = require('../../score/state.json').B.reps.filter(x => D[x]);
    const sum = [];
    for (const rp of reps) {
      const o = path.join(out, rp), js = path.join(out, rp + '.json');
      fs.rmSync(o, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
      const p = cp.spawnSync(process.execPath, [tool, '--goh', V, '--base', H, '--game', G, '--entity', rp, '--donor', D[rp], '--rep-key', '--pull-props', '--mtl-fallback', '--match-weapon', '--no-keylint', '--no-rc', '--no-ask', '--out', o, '--xlate-json', js], { encoding: 'utf8', maxBuffer: 1 << 26 });
      let j = null; try { j = JSON.parse(fs.readFileSync(js, 'utf8')); } catch { /* shown below */ }
      if (!j) { sum.push({ rp, err: (p.stderr || p.stdout || '').split('\n').slice(-3).join(' ') }); continue; }
      const T = TR.loadTable(), F2 = T.factors[j.cls] || {}, arm = j.wrote.filter(w => /^armor_/.test(w.key));
      // XLATE-3: armour comes from the GL-3 rule (notes say so) unless the rep has no volumes (then the old table rule, and the record says FALLBACK)
      const fb = (j.skipped || []).some(s => /OLD AGGREGATE FALLBACK/.test(s)), gl3 = (j.skipped || []).some(s => /armour rule: GL-3/.test(s));
      let bad = 0;
      for (const w of arm) {
        if (!fb) { if (!/GL-3 rule/.test(w.note || '') || !(w.value > 0)) bad++; continue; }
        const f = F2[w.key]; if (!f) { bad++; continue; } const exp = f.mode === 'const' ? f.value : f.mode === 'factor' ? w.goh * f.factor : w.goh; const lo = f.as2_p5, hi = f.as2_p95; if (!(Math.abs(w.value - exp) <= 1 || exp < lo || exp > hi)) bad++;
      }
      // read-back by the fixed reader (translate.armourRead: the part's own area): the macro args written must come back unchanged
      const back = j.armourWritten || {}, mism = arm.filter(w => /^armor_(body|turret)_(front|side|rear|top)$/.test(w.key) && back[w.key] !== undefined && back[w.key] !== w.value).length, unread = arm.filter(w => /^armor_(body|turret)_(front|side|rear|top)$/.test(w.key) && back[w.key] === undefined).length;
      sum.push({ rp, cls: j.cls, wrote: j.wrote.length, arm: arm.length, rule: fb ? 'FALLBACK' : gl3 ? 'GL-3' : '?', armBad: bad, armReadBackDiff: mism, armUnread: unread, asked: j.asked.length, nativeMiss: j.native.misses.length, misses: j.native.misses.slice(0, 6), front: (arm.find(w => w.key === 'armor_body_front' || w.key === 'armor_body_front_max' || w.key === 'armor_body_front_med') || {}).value, crew: j.crew && j.crew.rep + '/' + j.crew.donor, listed: j.listed.length });
    }
    for (const s of sum) console.log(JSON.stringify(s));
    t('all reps built and wrote a record', sum.every(s => !s.err), sum.filter(s => s.err).map(s => s.rp + ': ' + s.err).join(' | '));
    t('written armour is the GL-3 rule\'s on every rep (old-table check only on a fallback rep)', sum.every(s => s.armBad === 0), sum.filter(s => s.armBad).map(s => s.rp).join(','));
    t('armour read back from the written def equals what was written (fixed reader)', sum.every(s => s.armReadBackDiff === 0), sum.filter(s => s.armReadBackDiff).map(s => s.rp + ':' + s.armReadBackDiff).join(','));
    console.log('armour rule per rep: ' + sum.map(s => s.rp + '=' + s.rule).join(' '));
    const withFront = sum.filter(s => s.front !== undefined).sort((a, b) => a.front - b.front);
    if (withFront.length >= 2) console.log(`thin ${withFront[0].rp} front ${withFront[0].front}; thick ${withFront[withFront.length - 1].rp} front ${withFront[withFront.length - 1].front}`);
    const nat = sum.filter(s => s.nativeMiss);
    console.log(`native check: ${sum.length - nat.length} of ${sum.length} pass; misses listed: ${nat.map(s => s.rp + '(' + s.nativeMiss + ')').join(' ')}`);
    // protocol: one rep that asked, rerun with --ask-json and "translated" answers on stdin
    const q = sum.find(s => s.asked);
    if (q) {
      const j0 = JSON.parse(fs.readFileSync(path.join(out, q.rp + '.json'), 'utf8')), lines = j0.asked.map(a => JSON.stringify({ id: a.split(' ')[0], choice: 'translated', rest: false }));
      const o = path.join(out, q.rp + '_ask'); fs.rmSync(o, { recursive: true, force: true });
      const p = cp.spawnSync(process.execPath, [tool, '--goh', V, '--base', H, '--game', G, '--entity', q.rp, '--donor', D[q.rp], '--rep-key', '--no-keylint', '--no-rc', '-q', '--ask-json', '--out', o, '--xlate-json', path.join(out, q.rp + '_ask.json')], { encoding: 'utf8', input: lines.join('\n') + '\n', maxBuffer: 1 << 26 });
      const qs = p.stdout.split('\n').filter(l => l.startsWith('{"xlate":"question"')).map(l => JSON.parse(l));
      let j1 = null; try { j1 = JSON.parse(fs.readFileSync(path.join(out, q.rp + '_ask.json'), 'utf8')); } catch { /* below */ }
      t(`ask-json protocol on ${q.rp}: ${j0.asked.length} question(s) out as JSON, answers in, choice recorded`, qs.length === j0.asked.length && !!j1 && j1.answers.every(a => a.choice === 'translated' && a.how === 'asked'), p.stdout.slice(0, 300) + p.stderr);
    } else console.log('no rep asked a question: protocol not exercised on real data');
  }
}
console.log(fail ? `${fail} FAILED (xlate2)` : 'xlate2: all ok');
process.exit(fail ? 1 : 0);
