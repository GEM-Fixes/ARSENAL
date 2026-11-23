#!/usr/bin/env node
// sp-pilot: does `<exe>_ed.exe -game` run tagged vanilla pairs at once? Writes mods/pilot_sp, sets instance mods, runs, polls game.log.
//   node tools/testrun/scenarios/sp-pilot.js --game <G> [--root <exe dir>] [--exe as64_ed.exe] [--inst 1] [--secs 240] [--keep]
// restores options.set after. mod folder stays unless removed by hand (game folder deletes are the user's). exit 0 all pairs killed, 1 not, 2 usage
// Author: Imperator_Aug (ARSENAL, ia-145eaef5)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const args = {}; for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) args[a.slice(2)] = (process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) ? process.argv[++i] : true; }
const G = args.game, ROOT = args.root || G, EXE = args.exe || 'as64_ed.exe', INST = Number(args.inst || 1), SECS = Number(args.secs || 240);
if (!G || !(INST >= 1 && INST <= 9)) { console.error('usage: sp-pilot.js --game <G> [--root dir] [--exe as64_ed.exe] [--inst 1..9] [--secs 240]'); process.exit(2); }
const platform = require('../../lib/platform');
platform.requireWin('the editor pilot run (sp-pilot)');   // starts the editor exe directly
const R = path.join(__dirname, '../../..'), MOD = 'pilot_sp', SD = path.join(G, 'mods', MOD), MAP = 'multi/pilot_sp';
const FIX = path.join(__dirname, 'mods/prove1/resource/map/multi/pv_tiny');
const USER = path.join(process.env.USERPROFILE, `OneDrive/Documents/my games/men of war - assault squad 2 - instance ${INST}`);
const prof = fs.readdirSync(path.join(USER, 'profiles'))[0], PROF = path.join(USER, 'profiles', prof, 'options.set'), LOG = path.join(USER, 'log/game.log');
const sleep = ms => new Promise(r => setTimeout(r, ms)), crlf = s => s.replace(/\r?\n/g, '\r\n');

// pairs: shooter, its crew, foe, foe crew, kill state. id space 0xe200+
let id = 0xe200; const nid = () => '0x' + (id++).toString(16);
const ent = (d, x, y, p, tag) => { const i = nid(); return { body: `\t{Entity "${d}" ${i}\n\t\t{Position ${x} ${y}}\n\t\t{Player ${p}}\n\t}\n`, tags: `\t{Tags "${tag}" ${i}}\n` }; };
const hum = (b, x, y, p, tag) => { const i = nid(); return { body: `\t{Human "${b}" ${i}\n\t\t{Position ${x} ${y}}\n\t\t{Player ${p}}\n\t\t{FsmState "stand"}\n\t}\n`, tags: `\t{Tags "${tag}" ${i}}\n` }; };
const PAIRS = [
  { n: 'tank', x: -900, make: x => [ent('t34_0', x, -200, 1, 'tank_s'), hum('mp/rus/tankman', x + 40, -240, 1, 'tank_c'), hum('mp/rus/tankman', x + 80, -240, 1, 'tank_c'), hum('mp/rus/tankman', x - 40, -240, 1, 'tank_c'), hum('mp/rus/tankman', x - 80, -240, 1, 'tank_c'), ent('gaz67b', x, 200, 2, 'tank_f'), hum('mp/ger/rifle', x + 40, 240, 2, 'tank_fc')], veh: 'tank', kill: '"not moveable"' },
  { n: 'gun', x: 0, make: x => [ent('zis2', x, -200, 3, 'gun_s'), hum('mp/rus/rifle', x + 40, -240, 3, 'gun_c'), hum('mp/rus/rifle', x - 40, -240, 3, 'gun_c'), hum('mp/rus/rifle', x, -260, 3, 'gun_c'), ent('gaz67b', x, 200, 4, 'gun_f'), hum('mp/ger/rifle', x + 40, 240, 4, 'gun_fc')], veh: 'gun', kill: '"not moveable"' },
  { n: 'inf', x: 900, make: x => [hum('mp/rus/rifle', x - 30, -150, 5, 'inf_s'), hum('mp/rus/rifle', x, -150, 5, 'inf_s'), hum('mp/rus/rifle', x + 30, -150, 5, 'inf_s'), hum('mp/ger/rifle', x, 150, 6, 'inf_f')], kill: 'dead' },
  // infantry variants: no order, only fire_mode open; ordered at closer range
  { n: 'infb', x: 450, noorder: true, make: x => [hum('mp/rus/rifle', x - 30, -150, 7, 'infb_s'), hum('mp/rus/rifle', x, -150, 7, 'infb_s'), hum('mp/rus/rifle', x + 30, -150, 7, 'infb_s'), hum('mp/ger/rifle', x, 150, 8, 'infb_f')], kill: 'dead' },
  { n: 'infc', x: -450, make: x => [hum('mp/rus/rifle', x - 30, -40, 9, 'infc_s'), hum('mp/rus/rifle', x, -40, 9, 'infc_s'), hum('mp/rus/rifle', x + 30, -40, 9, 'infc_s'), hum('mp/ger/rifle', x, 40, 10, 'infc_f')], kill: 'dead' },
];
function trig() {
  const rows = [`{"p_boot" {condition} {actions {"con" {text "PILOT start"}}}}`];
  for (const p of PAIRS) {
    const n = p.n, cnt = (sel, op, v) => `{selector ${sel}} {count {op "${op}"} {value ${v}}}`, order = `{"con" {text "PILOT ${n} order"}} {"actor_state" {selector {tag ${n}_s}} {fire_mode open}} ${p.noorder ? "" : `{"actor_fire" {selector {tag ${n}_s}} {attack enemies} {enemies {tag ${n}_f}} {time 120}}`}`;
    // an empty or half-boarded vehicle reads "not moveable", so the order and the kill wait until the foe has been seen moveable
    if (p.veh) {
      rows.push(`{"p_${n}_arm" {condition} {actions {"board" {selector {tag ${n}_c}} {vehicle {tag ${n}_s}}} {"board" {selector {tag ${n}_fc}} {vehicle {tag ${n}_f}}}}}`);
      rows.push(`{"p_${n}" {condition {expression "1 & 2"} {terms {"1.entities" ${cnt(`{tag ${n}_f} {state moveable}`, '>', 0)}} {"2.entities" ${cnt(`{tag ${n}_s} {state operatable}`, '>', 0)}}}} {actions ${order}}}`);
    } else rows.push(`{"p_${n}" {condition} {actions ${order}}}`);
    rows.push(`{"p_${n}_k" {condition {expression "1 & 2"} {terms {"1.entities" ${cnt(`{tag ${n}_f} {state ${p.kill}}`, '>', 0)}} {"2.trigger" {name "p_${n}"}}}} {actions {"con" {text "PILOT ${n} kill"}}}}`);
    rows.push(`{"p_${n}_d" {condition {expression "1 & 2"} {terms {"1.entities" ${cnt(`{tag ${n}_f} {state "not dead"}`, '=', 0)}} {"2.trigger" {name "p_${n}"}}}} {actions {"con" {text "PILOT ${n} nonealive"}}}}`);
    rows.push(`{"p_${n}_x" {condition {terms {"1.entities" ${cnt(`{tag ${n}_s} {state dead}`, '>', 0)}}}} {actions {"con" {text "PILOT ${n} shooterdied"}}}}`);
  }
  return rows.map(r => '\t\t\t' + r + '\n').join('');
}
function mission() {
  let s = fs.readFileSync(path.join(FIX, 'combat.mi'), 'latin1').replace(/\r\n/g, '\n');
  const ents = PAIRS.flatMap(p => p.make(p.x));
  s = s.replace(/\{mission\n[\s\S]*?(\t\{Entity "map_point")/, (_, m) => '{mission\n' + ents.map(e => e.body).join('') + ents.map(e => e.tags).join('') + m);
  s = s.replace(/\{triggers\n[\s\S]*?\n\t\t\}\n/, '{triggers\n' + trig() + '\t\t}\n');
  return s;
}
function stage() {
  const d = path.join(SD, 'resource/map', MAP);
  fs.mkdirSync(d, { recursive: true });
  for (const f of fs.readdirSync(FIX)) if (f !== 'combat.mi') fs.copyFileSync(path.join(FIX, f), path.join(d, f));
  fs.writeFileSync(path.join(d, 'combat.mi'), crlf(mission()), 'latin1');
  fs.writeFileSync(path.join(SD, 'mod.info'), crlf('{Mod\n {Name "pilot_sp"}\n {MinGameVersion "3.301"}\n}\n'));
}
(async () => {
  stage();
  const sw = cp.spawnSync(process.execPath, [path.join(R, 'tools/modswitch/modswitch.js'), '--game', G, '--inst', String(INST), '--set', 'as64+,' + MOD, '--write', '--force'], { encoding: 'utf8' });
  const saved = PROF + '.pilot';
  if (sw.status !== 0) { console.error('modswitch', sw.stdout, sw.stderr); process.exit(1); }
  const before = fs.existsSync(LOG) ? fs.statSync(LOG).mtimeMs : 0;
  const t0 = Date.now(), marks = {};
  const p = cp.spawn(path.join(ROOT, EXE), ['-game', `${MAP}:combat`, '-instance', String(INST)], { cwd: ROOT, detached: true, stdio: 'ignore' });
  let died = null; p.on('exit', c => { died = c; }); p.on('error', e => { died = String(e); });
  const want = PAIRS.map(x => `PILOT ${x.n} kill`);
  let done = false;
  while (Date.now() - t0 < SECS * 1000 && died === null && !done) {
    await sleep(1000);
    if (!fs.existsSync(LOG) || fs.statSync(LOG).mtimeMs === before) continue;
    let t; try { t = fs.readFileSync(LOG, 'latin1'); } catch { continue; }
    for (const m of t.match(/PILOT [a-z]+ [a-z]+|PILOT start/g) || []) if (!(m in marks)) { marks[m] = (Date.now() - t0) / 1000; console.log(`${marks[m].toFixed(0)}s  ${m}`); }
    done = want.every(w => w in marks);
  }
  await sleep(3000);
  if (died === null) platform.killPid(p.pid);
  await sleep(3000);
  const rs = cp.spawnSync(process.execPath, [path.join(R, 'tools/modswitch/modswitch.js'), '--game', G, '--inst', String(INST), '--restore', '--write', '--force'], { encoding: 'utf8' });
  console.log('restore status', rs.status, (rs.stdout || '').trim().split('\n').slice(-1)[0]);
  console.log('died', died, 'done', done, 'secs', ((Date.now() - t0) / 1000).toFixed(0));
  process.exit(done ? 0 : 1);
})();
