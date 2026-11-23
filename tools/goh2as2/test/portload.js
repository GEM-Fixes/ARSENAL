// T-PORTLOAD SEED test: names inside pulled GoH stuff and the ammo a def loads are checked against as64 before writing. Invented fixtures only. run via run.sh.
//  1 a pulled pattern's {curve} as64 lacks: mapped by CURVE_MAP (bullet_hmg -> bullet), unknown name dropped + WARN (G-PORT4 crash: Unknown curve at load)
//  2 a cursor as64 has is kept, one it lacks is dropped + WARN
//  3 def loads GoH ammo into a gun whose chain fills an as64 family: weaponry filling and box items mapped onto the as64 rounds
//    (shell type mapped apcbche -> ap, he -> fg), a type as64 lacks (heatc) dropped, the GoH rounds not pulled (preflight AMMO HOLD on panzer4j)
//  4 a gun whose own filling is the def's family is left alone
//  5 MG belt with no shell type -> bare family; 6 minWorkers dropped from seat lists
//  7 fireSound/reloadSound: as64 file or folder kept, GoH-only path dropped + WARN (t_pl_3 "unknown sound file" each shot)
//  8 ammo {view}/{tail}: top-level view entity as64 lacks -> block dropped (t_pl_3/t_pl_4 "SetSkeleton() failed" each shot);
//    {trace {view texture}} as64 lacks -> "/texture/fx/trace"; as64 view entity kept, tail entity as64 lacks dropped
// Author: Imperator_Aug (ARSENAL, ia-6b0c9fda)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const tool = path.join(__dirname, '..', 'goh2as2.js');
let fail = 0;
const t = (name, good, extra) => { console.log((good ? 'ok   ' : 'FAIL ') + 'portload: ' + name + (good || extra === undefined ? '' : '  ' + String(extra).slice(0, 900))); if (!good) fail++; };
const env = { ...process.env, AS2_NO_STEAM: '1', AS2_GAME: '' };
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'tportload-'));
const w = (rel, s) => { const p = path.join(W, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s.replace(/\r?\n/g, '\r\n'), 'latin1'); };
// as64 side
w('as2/resource/set/ballistics.set', '{curve "bullet" {0 1} {1 0.1}}\n{curve "gun_light" {0 1} {1 0.3}}\n');
w('as2/resource/set/stuff/gun/gun.pattern', '{weapon_bullet}\n');
w('as2/resource/set/stuff/shell/ap.pattern', '{shell}\n');
w('as2/resource/set/stuff/gun/gunas', '{from "pattern gun"\n  {filling "abul"}\n}\n');
w('as2/resource/set/stuff/shell/abul.ap.ammo', '{from "pattern ap"}\n');
w('as2/resource/set/stuff/shell/abul.fg.ammo', '{from "pattern ap"}\n');
w('as2/resource/interface/cursor/okcur.ebm', '{bitmap}\n');
w('as2/resource/entity/dummy/dummy.def', '{game_entity}\n');
w('as2/resource/sound/weapon/shot/okgun.wav', 'RIFF');
w('as2/resource/sound/weapon/reload/tank/r1.wav', 'RIFF');
// GoH side
w('goh/resource/entity/u2/u2.def', `{game_entity
  {Extension "u2.mdl"}
  {extender "inventory"
    {box
      {item "gbul apcbche" 3}
      {item "gbul he" 4}
      {item "gbul heatc" 2}
      {item "obul he" 5}
      {item "ammo gmg_rus dt" 500}
    }
  }
  {Weaponry
    {place "a" {weapon "gunk" filling "gbul apcbche" 1}}
    {place "b" {weapon "gunown" filling "obul he" 1}}
    {place "c" {weapon "mgx"}}
    {place "d" {weapon "mgk" filling "ammo gmg_rus dt" 100}}
    {place "e" {weapon "gunown"} {charger "charger charger2" minWorkers 1} {gunner "gunner"}}
  }
  {extender "cannon"
    {move {workers "driver1" "driver2" minWorkers 2} {obstacle "close"}}
    {attack {workers "gunner" "charger"} {obstacle "open"}}
  }
}
`);
w('goh/resource/entity/u2/u2.mdl', '{model "x"}\n');
w('goh/resource/set/stuff/gun/gunk', '{from "gunas"}\n');
w('goh/resource/set/stuff/gun/gunown', '{from "pattern gun"\n  {filling "obul" 10}\n}\n');
for (const s of ['apcbche', 'he', 'heatc']) w(`goh/resource/set/stuff/shell/gbul.${s}.ammo`, '{from "pattern ap"}\n');
w('goh/resource/set/stuff/shell/obul.he.ammo', '{from "pattern ap"\n\t{view "gohshell_88"\n\t\t{tail "oktail" "tail"}\n\t}\n\t{mass 2}\n\t{trace\n\t\t{view "/texture/fx/tracer_new/goh_red.mtl"\n\t\t\t{Light 1}\n\t\t}\n\t\t{length 3}\n\t}\n}\n');
w('goh/resource/set/stuff/shell/obul.ap.ammo', '{from "pattern ap"\n\t{view "okshell"\n\t\t{tail "oktail" "tail"}\n\t\t{tail "gohtail" "tail"}\n\t}\n}\n');
w('goh/resource/entity/u3/u3.def', '{game_entity\n  {Extension "u3.mdl"}\n  {Weaponry {place "a" {weapon "gunown" filling "obul ap" 1}}}\n}\n');
w('goh/resource/entity/u3/u3.mdl', '{model "x"}\n');
w('as2/resource/entity/fx/oktail.def', '{game_entity}\n');
w('as2/resource/entity/fx/okshell.def', '{game_entity}\n');
w('as2/resource/set/stuff/mgun/amg', '{from "pattern gun"\n  {filling "ammo amg"}\n}\n');
w('as2/resource/set/stuff/shell/amg.ammo', '{from "pattern ap"}\n');
w('goh/resource/set/stuff/mgun/mgk', '{from "amg"}\n');
w('goh/resource/set/stuff/shell/gmg_rus.dt.ammo', '{from "pattern ap"}\n');
w('goh/resource/set/stuff/mgun/mgx', '{from "pattern hmgx"}\n');
w('goh/resource/set/stuff/mgun/hmgx.pattern', '{from "pattern gun"\n\t{cursor "okcur"}\n\t{cursorReloading "gohcur"}\n\t{curve "bullet_hmg"}\n\t{fireSound "okgun"}\n\t{reloadSound "tank/"}\n\t{range 140 140}\n\t{parameters "y"\n\t\t{fireSound "cannon/s4/d1/Shared/Gohonly/"}\n\t}\n\t{parameters "x"\n\t\t{curve "weird_curve"}\n\t}\n}\n');
const out = path.join(W, 'out');
const r = cp.spawnSync(process.execPath, [tool, '--goh', path.join(W, 'goh'), '--game', path.join(W, 'as2'), '--entity', 'u2', '--entity', 'u3', '--out', out, '--no-keylint', '--no-rc', ...process.argv.slice(2)], { encoding: 'utf8', env });
const text = r.stdout + r.stderr, rd = p => { try { return fs.readFileSync(path.join(out, p), 'latin1'); } catch { return null; } }, has = p => fs.existsSync(path.join(out, p));
const S = 'resource/set/stuff/';
t('runs, exit 0', r.status === 0, text);
const pat = rd(S + 'mgun/hmgx.pattern') || '';
t('1 pattern pulled', has(S + 'mgun/hmgx.pattern'), text);
t('1 bullet_hmg -> bullet', /\{curve "bullet"\}/.test(pat) && !/bullet_hmg/.test(pat), pat);
t('1 unknown curve dropped', !/weird_curve/.test(pat) && /WARN_PORT_CURVE_DROPPED/.test(text), pat + text);
t('1 map reported', /PORT_CURVE_MAPPED/.test(text), text);
t('2 as64 cursor kept, GoH-only cursor dropped + WARN', /\{cursor "okcur"\}/.test(pat) && !/gohcur/.test(pat) && /WARN_PORT_CURSOR_DROPPED/.test(text), pat);
t('7 as64 sound file + folder kept, GoH-only sound folder dropped + WARN', /\{fireSound "okgun"\}/.test(pat) && /\{reloadSound "tank\/"\}/.test(pat) && !/Gohonly/.test(pat) && /WARN_PORT_SOUND_DROPPED/.test(text), pat + text);
const am = rd(S + 'shell/obul.he.ammo') || '';
t('8 top-level view entity as64 lacks: whole block dropped, rest kept', !/gohshell_88/.test(am) && !/oktail/.test(am) && /\{mass 2\}/.test(am) && /WARN_PORT_VIEW_DROPPED/.test(text), am + text);
t('8 trace view texture as64 lacks -> "/texture/fx/trace", block kept', /\{trace\s+\{view "\/texture\/fx\/trace"\s+\{Light 1\}/.test(am) && !/goh_red/.test(am) && /WARN_PORT_VIEW_MAPPED/.test(text), am);
const am2 = rd(S + 'shell/obul.ap.ammo') || '';
t('8 as64 view entity kept, its as64 tail kept, GoH-only tail dropped + WARN', /\{view "okshell"/.test(am2) && /\{tail "oktail" "tail"\}/.test(am2) && !/gohtail/.test(am2) && /WARN_PORT_TAIL_DROPPED/.test(text), am2 + text);
const def = rd('resource/entity/u2/u2.def') || '';
t('3 weaponry filling -> as64 family', /\{weapon "gunk" filling "abul ap" 1\}/.test(def), def);
t('3 box items mapped by shell type', /\{item "abul ap" 3\}/.test(def) && /\{item "abul fg" 4\}/.test(def), def);
t('3 type as64 lacks dropped', !/^\s*\{item "gbul heatc"/m.test(def) && /WARN_PORT_AMMO_ITEM_DROPPED/.test(text), def);
t('3 GoH rounds of the mapped family not pulled', !has(S + 'shell/gbul.apcbche.ammo') && !has(S + 'shell/gbul.he.ammo'), text);
t('3 the gun is still pulled', has(S + 'gun/gunk'), text);
t('4 gun with its own family untouched', /\{weapon "gunown" filling "obul he" 1\}/.test(def) && /\{item "obul he" 5\}/.test(def) && has(S + 'shell/obul.he.ammo'), def);
t('5 MG belt with no shell type -> the gun\'s bare family "ammo amg"', /\{weapon "mgk" filling "ammo amg" 100\}/.test(def) && /\{item "ammo amg" 500\}/.test(def) && !has(S + 'shell/gmg_rus.dt.ammo'), def);
t('6 minWorkers dropped from {workers} and {charger}, names kept', !/minWorkers/i.test(def) && /\{workers "driver1" "driver2"\} \{obstacle "close"\}/.test(def) && /\{charger "charger charger2"\}/.test(def) && /WARN_PORT_MINWORKERS/.test(text), def);
try { fs.rmSync(W, { recursive: true, force: true }); } catch {}
console.log(fail ? 'FAIL portload' : 'PASS portload');
process.exit(fail ? 1 : 0);
