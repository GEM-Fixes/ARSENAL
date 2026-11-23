// PORTREV2: seeded tests for rev-port leftovers in goh2as2: #6 macro-arg scaling (stuffport expandScaled), #10 GoH key shadows a vanilla AS2
// key (goh2as2 WARN_PORT_SHADOWS_VANILLA). Invented fixtures; each check has a seeded-defect twin. run via run.sh.
// Author: Imperator_Aug (ARSENAL, ia-caca82d9)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const S = require('../stuffport.js');
let fail = 0;
const t = (name, good, extra) => { console.log((good ? 'ok   ' : 'FAIL ') + 'portrev2: ' + name + (good || extra === undefined ? '' : '  ' + String(extra).slice(0, 400))); if (!good) fail++; };

// ---- #6 macro part: ("x" speed(900)) kept as a call must be scaled through its AS2 body
const TAB = { classes: { gun: { keys: { speed: { scale: 0.5, apply: true }, range: { scale: 0.6, apply: true } } } } };
const defs = S.parseDefines('(define "speed"\r\n\t{speed (* 0.5 %s)}\r\n)\r\n(define "x"\r\n\t{speed %speed}\r\n)\r\n(define "acc"\r\n\t{accuracy {a 1}}\r\n)\r\n(define "nest"\r\n\t("speed" s(%0))\r\n)\r\n');
const GUN = '{weapon\r\n\t("x" speed(900))\r\n\t("speed" s(800))\r\n\t("acc")\r\n\t{parameters "ap"\r\n\t\t("nest" args 600)\r\n\t}\r\n\t{recoil ("speed" s(100))}\r\n\t("unknownmacro" 5)\r\n}\r\n';
let log = [], o = S.scaleDamage(GUN, TAB, 'gun', log, {}, defs);
t('named-arg call ("x" speed(900)) -> {speed 450}', o.includes('{speed 450}'), o);
t('AS2 ("speed" s(800)) -> {speed (0.5*800)*0.5} = {speed 200}', o.includes('{speed 200}'), o);
t('nested call in {parameters} -> {speed 150}', o.includes('{speed 150}'), o);
t('call with no scaled key kept as a call', o.includes('("acc")'), o);
t('call inside {recoil} (not a scaled position) kept', o.includes('{recoil ("speed" s(100))}'), o);
t('SP_SCALE_EXPAND logged 3 times', log.filter(l => l.code === 'SP_SCALE_EXPAND').length === 3, JSON.stringify(log));
t('unknown call at a scaled position -> WARN_SP_SCALE_MACRO', log.some(l => l.code === 'WARN_SP_SCALE_MACRO' && /unknownmacro/.test(l.msg)), JSON.stringify(log));
// seeded defect: no defs (the old behaviour) -> the call keeps 900 unscaled
log = []; o = S.scaleDamage(GUN, TAB, 'gun', log, {});
t('seeded defect: without defs the call stays ("x" speed(900)), nothing scaled', o.includes('("x" speed(900))') && !/\{speed \d/.test(o), o);
// a call whose arg cannot be resolved is left alone (no half-expanded %speed in the output)
log = []; o = S.scaleDamage('{weapon\r\n\t("x" other(1))\r\n}', TAB, 'gun', log, {}, defs);
t('unresolved arg: call left as is', o.includes('("x" other(1))') && !o.includes('%speed'), o);
t('topKeys: depth-0 names only', JSON.stringify(S.topKeys('{speed 1} {a {range 2}} ;{range 3}\n"{x}"')) === '["speed","a"]');

// ---- #10 vanilla key shadow: goh2as2 --game run where the GoH closure holds a set/stuff key AS2 also has, with other bytes
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'portrev2-'));
try {
  const w = (rel, s) => { const f = path.join(W, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
  const GOH = 'goh/resource/', AS = 'as2/resource/';
  w(GOH + 'entity/-vehicle/tank/shd/shd.def', '{game_entity\r\n\t(include "/properties/tank.ext")\r\n\t(include "shd.inc")\r\n}\r\n');
  w(GOH + 'entity/-vehicle/tank/shd/shd.inc', '{props "x"}\r\n');
  w(GOH + 'properties/tank.ext', '{props "tank"}\r\n');
  w(AS + 'properties/tank.ext', '{props "tank"}\r\n');            // same bytes: no warning
  w(AS + 'entity/-vehicle/tank/shd/shd.inc', '{props "vanilla"}\r\n');   // seeded: other bytes at the same key -> warning
  w('as2/mods/.keep', '');
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'goh2as2.js'), '--goh', path.join(W, 'goh'), '--game', path.join(W, 'as2'), '--entity', 'shd', '--out', path.join(W, 'out'), '--no-keylint', '--no-rc'], { encoding: 'utf8', env: { ...process.env, AS2_NO_STEAM: '1', AS2_GAME: '' } });
  const rep = r.stdout + r.stderr;
  const hits = rep.split('\n').filter(l => /WARN_PORT_SHADOWS_VANILLA/.test(l));
  t('shadow: shd.inc (other bytes) warned', hits.some(l => /shd\.inc/.test(l)), rep.slice(-1500));
  t('seeded defect guard: tank.ext (same bytes) not warned', !hits.some(l => /tank\.ext/.test(l)), hits.join('\n'));
  t('summary line counts the shadowed keys', /PORT_SHADOWS_VANILLA 1 /.test(rep) || /shadow(s|ed)? vanilla[^\n]*\b1\b/i.test(rep), rep.slice(-800));
} finally { fs.rmSync(W, { recursive: true, force: true }); }

console.log(fail ? `portrev2 FAIL ${fail}` : 'portrev2 PASS');
process.exit(fail ? 1 : 0);
