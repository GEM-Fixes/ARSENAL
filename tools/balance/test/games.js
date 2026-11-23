// game parity tests for balance (--exe / --target): the shared AS2 install as AS64 and as MoW:AS2, and a made-up Gates of Hell install
// (summary, sheet, economy, refusals, bulk change into a mod folder outside the install). Usage: node games.js <work dir>
// Author: Imperator_Aug (ARSENAL, ia-7390e9c0)
const fs = require('fs'), path = require('path'), cp = require('child_process'), FX = require('../../statsheet/test/gamefx'), B = require('../lib');
const W = path.resolve(process.argv[2] || 'work-games'); fs.mkdirSync(W, { recursive: true });
const BAL = path.join(__dirname, '..', 'balance.js'), T = path.join(W, 'btmp');
let bad = 0;
const ok = (c, m) => { if (c) console.log('OK ' + m); else { bad++; console.log('FAIL ' + m); } };
const run = (a, tmp) => { const r = cp.spawnSync(process.execPath, [BAL, ...a, '--tmp', tmp || T], { encoding: 'utf8', maxBuffer: 1 << 28 }); r.all = r.stdout + r.stderr; return r; };
const csv = (a, id) => (run(a.concat(['--sheet', 'csv', '--cols', 'id,cost,reload,wait,again,rank'])).stdout.split(/\r?\n/).find(l => l.toLowerCase().startsWith(id + ',')) || '');

// shared install: AS64 sees as64/core (t34_3 999), MoW:AS2 does not (450)
const sh = FX.shared(path.join(W, 'sh'));
ok(/^t34_3,999,/.test(csv([sh.game], 't34_3')), 'as64 default: t34_3 cost 999');
ok(/^t34_3,450,/.test(csv([sh.game, '--exe', 'mowas_2'], 't34_3')), '--exe mowas_2: t34_3 cost 450');
ok(/^t34_3,450,/.test(csv([sh.game, '--target', 'mowas2'], 't34_3')), '--target mowas2: same as --exe mowas_2');
ok(run([sh.game, '--exe', 'mowas_2.exe']).status !== 0, 'an .exe file name is not a game id');
const m2 = run([sh.game, '--exe', 'mowas_2', '--folder', sh.mod, '--where', 'id=t34_3', '--change', 'cost pct 10']);
const mf = path.join(sh.mod, 'resource/set/multiplayer/units/vehicles_rus.set');
ok(m2.status === 0 && fs.existsSync(mf) && /"t34_3".*\{cost 495\}/.test(fs.readFileSync(mf, 'latin1')), 'mowas_2 --change: t34_3 450 -> 495 in the mod');

// a card kept in an army list of another name (side ger, list vehicles_ger2.set, as the real pz3m_ger2): the change finds that list
const A = require('../apply');
ok(A.listArmy({ id: 'pz3m_ger2', kind: 'vehicle', army: 'ger', cardFile: 'resource/set/multiplayer/units/vehicles_ger2.set' }).army === 'ger2', 'listArmy: vehicles_ger2.set card -> army ger2');
ok(A.listArmy({ id: 't34_3', kind: 'vehicle', army: 'rus', cardFile: 'resource/set/multiplayer/units/vehicles_rus.set' }).army === 'rus' && A.listArmy({ id: 'x', kind: 'vehicle', army: 'ger', cardFile: 'resource/set/multiplayer/units/vehicles.set' }).army === 'ger', 'listArmy: own list and vehicles.set keep the army');
const s2 = FX.shared(path.join(W, 'sh2')), UV = 'resource/set/multiplayer/units/';
FX.put(s2.game, UV + 'vehicles.set', fs.readFileSync(path.join(s2.game, UV + 'vehicles.set'), 'latin1') + '\t(include "vehicles_ger2.set")\n');
FX.put(s2.game, UV + 'vehicles_ger2.set', '{"pz3m_ger2"         ("v" c(60) t(all medium) \t\t\ts(ger) n1(4) n2(1) g(e3) sc(30.00) b(v4) cw(0) cp(20)) {level 1} {cost 400} {fore 1.0}}\n');
const T3 = path.join(W, 'btmp3');
for (const ex of [[], ['--exe', 'mowas_2']]) {
  const r = run([s2.game, ...ex, '--folder', s2.mod, '--where', 'id~^pz3m', '--change', 'cost add 10', '--plan'], T3 + ex.length);
  ok(r.status === 0 && /pz3m_ger2 cost: 400 -> 410/.test(r.all) && !/ERROR/.test(r.all), (ex[1] || 'as64') + ' --change on a vehicles_ger2.set card: 400 -> 410, no card error');
}

// lib: GoH economy and plan refusals
const eco = B.economy(new Map([['resource/set/multiplayer/games/presets/preset_early.inc', '("standard_all" start(200) finish(2650) doctrine(150))']]), { game: 'goh' });
ok(eco.game === 'goh', 'economy goh');
const g = FX.goh(path.join(W, 'g'));
const sum = run([g.game, '--exe', 'goh']);
ok(sum.status === 0 && /dp \| td +1 +price 20 \.\. 20 \.\. 20 +wait at start 300/.test(sum.all) && /mp \| squad +1 +price 47 /.test(sum.all) && /mp \| td +1 +price 325 .* wait at start 60 /.test(sum.all), 'goh summary: dp 20 (wait 300), squad 47, td 325 (wait 60)');
ok(/mp = buttons [^;]*starts with 200\); dp = buttons doctrine \(starts with 150\)/.test(sum.all) && /\(\*=1\)/.test(sum.all),'goh summary: budgets mp start 200, dp start 150 (bot preset left out)');
ok(/^pz4,325,5,60,120,$/.test(csv([g.game, '--exe', 'goh'], 'pz4')), 'goh sheet: pz4 325, reload 5, wait 60, again 120, no rank');
const T0 = path.join(W, 'btmp0'); fs.rmSync(T0, { recursive: true, force: true });
const rk = run([g.game, '--exe', 'goh', '--folder', g.mod, '--change', 'rank set 2'], T0);
ok(rk.status === 2 && /^balance --change rank: not available for GoH: .*\(gohweb gameplay\/goh-unit-card-cost\)\s*$/.test(rk.all) && !fs.existsSync(T0), 'goh --change rank refused at the start: exit 2, one line, cited row, no catalogue read');
// speed and armour (gohbody.js -> lib/goharmour): the def copied into the mod, the numbers spliced; the doctrine card buys the same pz4
const pzd = path.join(g.mod, 'resource/entity/-vehicle/germany/tank_medium/pz4/pz4.def'), rdd = () => fs.existsSync(pzd) ? fs.readFileSync(pzd, 'latin1') : '';
const sp = run([g.game, '--exe', 'goh', '--folder', g.mod, '--where', 'id=pz4', '--change', 'speed set 50']);
ok(sp.status === 0 && /\{MaxSpeed 50\}/.test(rdd()) && /pz4 speed: 40 -> 50/.test(sp.all) && /also changes for doctrine_pz4_early/.test(sp.all), 'goh speed: MaxSpeed 40 -> 50 in the mod copy of pz4.def, the doctrine card named [' + sp.all.slice(-400) + ']');
const ar = run([g.game, '--exe', 'goh', '--folder', g.mod, '--change', 'armor pct 20']);
ok(ar.status === 0 && /\{thickness 60/.test(rdd()) && /\{rear 24\}/.test(rdd()) && /\{left 36\}/.test(rdd()) && /\{top 18\}/.test(rdd()) && /\{MaxSpeed 50\}/.test(rdd()), 'goh armour pct 20: every number of the body x1.2, speed kept');
ok((ar.all.match(/pz4 armor:/g) || []).length === 1 && /one edit for doctrine_pz4_early too/.test(ar.all) && /skipped squad_rifle_early\(ger\).*armour front/.test(ar.all), 'goh armour: one edit per def (doctrine card named), the squad skipped [' + ar.all.slice(-500) + ']');
const spz = run([g.game, '--exe', 'goh', '--folder', g.mod, '--where', 'id=pz4', '--change', 'speed set 500']);
ok(spz.status === 0 && /\{MaxSpeed 200\}/.test(rdd()), 'goh speed: clamped to the column limit (200)');
// gohbody on a mini ctx: a CRLF include shared with a sibling def is copied next to the def; a def without a speed is refused with the reason
{
  const GB = require('../gohbody'), D = 'resource/entity/-vehicle/x/t1/', files = new Map([
    [D + 't1.def', '{game_entity\r\n\t(include "hull.ext")\r\n\t{Locomotion\r\n\t\t{MaxSpeed 30}\r\n\t}\r\n}\r\n'],
    [D + 't2.def', '{game_entity\r\n\t(include "hull.ext")\r\n}\r\n'],
    [D + 'hull.ext', '{Volume "body"\r\n\t{thickness 40\r\n\t\t{front 80}\r\n\t}\r\n}\r\n']]);
  const dirty = new Map(), cx = { read: k => dirty.get(k) || (files.has(k) ? Buffer.from(files.get(k), 'latin1') : null), keys: re => [...new Set([...files.keys(), ...dirty.keys()])].filter(k => re.test(k)).sort(), inMod: k => dirty.has(k), write: (k, b) => dirty.set(k, b) };
  const cat = { units: [{ id: 't1', kind: 'vehicle', buyable: true, def: D + 't1.def' }, { id: 't2', kind: 'vehicle', buyable: true, def: D + 't2.def' }, { id: 't1_late', kind: 'vehicle', buyable: true, def: D + 't1.def' }] };
  const o = { rows: [], skipped: [] }, done = new Map();
  GB.row(cx, cat.units[0], { field: 'armor', old: '80', new: '100', factor: 1.25 }, done, o);
  GB.row(cx, cat.units[2], { field: 'armor', old: '80', new: '100', factor: 1.25 }, done, o);
  GB.notes(cx, cat, done);
  const copy = dirty.get(D + 't1_hull.ext'), def = dirty.get(D + 't1.def');
  ok(o.rows.length === 1 && copy && /thickness 50\r\n\t\t\{front 100\}\r\n/.test(copy.toString('latin1')) && def && /\(include "t1_hull\.ext"\)\r\n/.test(def.toString('latin1')) && !dirty.has(D + 'hull.ext'), 'gohbody armour: the shared hull.ext copied as t1_hull.ext, CRLF kept, the include repointed, the shared file untouched');
  ok(/shared with other units/.test(o.rows[0].note || '') && /one edit for t1_late too/.test(o.rows[0].note || '') && !/t2/.test((o.rows[0].note || '').replace(/t1_hull|other units/g, '')), 'gohbody armour: notes name the shared copy and the card of the same def [' + o.rows[0].note + ']');
  const o2 = { rows: [], skipped: [] };
  GB.row(cx, cat.units[1], { field: 'speed', old: null, new: 40 }, new Map(), o2);
  ok(!o2.rows.length && o2.skipped.length === 1 && /No top speed of its own/.test(o2.skipped[0].why), 'gohbody speed: a def without a speed of its own is refused with goharmour\'s reason');
  const o3 = { rows: [], skipped: [] };
  GB.row(cx, { id: 'sq', kind: 'squad' }, { field: 'speed', new: 40 }, new Map(), o3);
  ok(o3.skipped.length === 1 && /not a vehicle/.test(o3.skipped[0].why), 'gohbody: a squad is refused (not a vehicle)');
}
const units = path.join(g.mod, 'resource/set/multiplayer/units/early/units_ger.set');
const c1 = run([g.game, '--exe', 'goh', '--folder', g.mod, '--where', 'res=mp', '--change', 'cost add 10']);
ok(c1.status === 0 && /pz4 cost: 325 -> 335 +\(own cost 300 -> 310\)/.test(c1.all) && /skipped squad_rifle_early\(ger\).*GHGPL-10/.test(c1.all), 'goh cost: own cost moves by the delta, squad skipped');
run([g.game, '--exe', 'goh', '--folder', g.mod, '--change', 'charge mul 2']);
run([g.game, '--exe', 'goh', '--folder', g.mod, '--change', 'wait set 45']);
const t = fs.existsSync(units) ? fs.readFileSync(units, 'latin1') : '';
ok(/cd\(45\) ci\(240\) cost\(310\)/.test(t) && /cool\(360\)/.test(t) && t.includes('\r\n'), 'goh card edits: cd 45, ci 240, cost 310, cool 360, CRLF kept');
// reload (gohreload.js): a gun with its own {rechargeTime n} gets a set row in the mod copy of the gun file
const rl = run([g.game, '--exe', 'goh', '--folder', g.mod, '--where', 'id=pz4', '--change', 'reload set 4']);
const gk = path.join(g.mod, 'resource/set/stuff/gun/75mm_kwk37'), gt = fs.existsSync(gk) ? fs.readFileSync(gk, 'latin1') : '';
ok(rl.status === 0 && /\{rechargeTime 4\}/.test(gt) && !/rechargeTime 5/.test(gt), 'goh reload: the gun file copied into the mod, {rechargeTime 4} [' + rl.all.slice(-300) + ']');
ok(!fs.existsSync(path.join(g.game, 'mods')) || !fs.readdirSync(path.join(g.game, 'mods')).length, 'nothing written into the install');
fs.mkdirSync(path.join(g.game, 'mods', 'x'), { recursive: true });
const ins = run([g.game, '--exe', 'goh', '--folder', path.join(g.game, 'mods', 'x'), '--change', 'cost add 1']);
ok(ins.status !== 0 && /refused/.test(ins.all) && !fs.readdirSync(path.join(g.game, 'mods', 'x')).length, 'goh: a mod folder inside the install is refused');

// one id in two period files at two prices: each period's card gets its own change (pz4 early 325 / own 300, mid 275 / own 250)
const g2 = FX.goh(path.join(W, 'g2')), UD = 'resource/set/multiplayer/units/';
FX.put(g2.game, UD + 'common.set', ';SDL\n{units\n\t(include "settings.set")\n\t(include "early/inf_ger.set")\n\t(include "early/units_ger.set")\n\t(include "mid/inf_ger.set")\n\t(include "mid/units_ger.set")\n}\n');
FX.put(g2.game, UD + 'mid/inf_ger.set', ';SDL\n{"mp/ger/mid/tankman"\t\t("inf_tankman" side(ger) period(mid) cost(5.0))}\n{"mp/ger/mid/tank_commander"\t("inf_tankman" side(ger) period(mid) cost(7.0))}\n');
FX.put(g2.game, UD + 'mid/units_ger.set', ';SDL\n{"pz4"\n\t("vehicle2" side(ger) period(mid) t(medium) g(tank) b(tanks) cd(30) ci(90) cost(250) crew1(tankman:3) crew2(tank_commander:1))\n}\n');
const T2 = path.join(W, 'btmp2'); fs.rmSync(T2, { recursive: true, force: true });
const pc = run([g2.game, '--exe', 'goh', '--folder', g2.mod, '--where', 'id=pz4', '--change', 'cost add 10'], T2);
ok(pc.status === 0 && /pz4 cost: 325 -> 335 +\(own cost 300 -> 310\)/.test(pc.all) && /pz4 cost: 275 -> 285 +\(own cost 250 -> 260\)/.test(pc.all), 'goh period copies: each row reports its own card (325 -> 335 own 310, 275 -> 285 own 260)');
const rd = k => { const f = path.join(g2.mod, UD + k); return fs.existsSync(f) ? fs.readFileSync(f, 'latin1') : ''; };
ok(/period\(early\)[^\n]*cost\(310\)/.test(rd('early/units_ger.set')) && /period\(mid\)[^\n]*cost\(260\)/.test(rd('mid/units_ger.set')), 'goh period copies: early card cost(310), mid card cost(260)');
run([g2.game, '--exe', 'goh', '--folder', g2.mod, '--where', 'id=pz4', '--change', 'wait set 45'], T2);
ok(/cd\(45\)/.test(rd('early/units_ger.set')) && /cd\(45\)/.test(rd('mid/units_ger.set')), 'goh period copies: wait set 45 reaches both cards');
// reload on a GoH macro form gun (its own ("reload time" seconds(n)), the mod's own copy): the call's argument, one edit for both cards
FX.put(g2.mod, 'resource/set/stuff/gun/75mm_kwk37', '{from "pattern gun"\r\n\t("reload time" seconds(5))\r\n\t{projectileDamage 100}\r\n}\r\n');
const rm = run([g2.game, '--exe', 'goh', '--folder', g2.mod, '--where', 'id=pz4', '--change', 'reload set 3.5'], T2);
const gm = fs.readFileSync(path.join(g2.mod, 'resource/set/stuff/gun/75mm_kwk37'), 'latin1');
ok(rm.status === 0 && gm.includes('("reload time" seconds(3.5))') && !/rechargeTime/.test(gm) && gm.includes('\r\n'), 'goh reload: the own "reload time" call gets seconds(3.5), CRLF kept [' + rm.all.slice(-300) + gm + ']');
// a GoH write leaves a restore point (Files page form) for the file it changed
{
  const MW = require('../../lib/modwrite'), ur = MW.restoreRoot(g2.mod);
  const pts = fs.existsSync(ur) ? fs.readdirSync(ur).map(d => { try { return JSON.parse(fs.readFileSync(path.join(ur, d, 'restore-point.json'), 'utf8')); } catch (e) { return null; } }).filter(Boolean) : [];
  ok(pts.some(p => p.rel === 'resource/set/stuff/gun/75mm_kwk37' && p.existed && p.action === 'units-goh'), 'goh write: a restore point of the gun file before the reload change [' + ur + ' ' + pts.length + ']');
}
// two own "reload time" calls: refused with a plain reason, nothing written
const two = '{from "pattern gun"\r\n\t("reload time" seconds(5))\r\n\t("reload time" seconds(6))\r\n}\r\n';
FX.put(g2.mod, 'resource/set/stuff/gun/75mm_kwk37', two);
const r2c = run([g2.game, '--exe', 'goh', '--folder', g2.mod, '--where', 'id=pz4', '--change', 'reload set 3'], T2);
ok(/skipped pz4: gun file "75mm_kwk37" sets its reload time 2 times; change it by hand/.test(r2c.all) && fs.readFileSync(path.join(g2.mod, 'resource/set/stuff/gun/75mm_kwk37'), 'latin1') === two, 'goh reload: two own reload time calls refused with the reason, the file untouched [' + r2c.all.slice(-300) + ']');
// no own reload time (inherited only): written as a rechargeTime of its own, the row carries a visible [T] note
FX.put(g2.mod, 'resource/set/stuff/gun/75mm_kwk37', '{from "pattern gun"\r\n\t{projectileDamage 100}\r\n}\r\n');
const rin = run([g2.game, '--exe', 'goh', '--folder', g2.mod, '--where', 'id=pz4', '--change', 'reload set 3'], T2);
ok(/75mm_kwk37 reload: [^\n]*\(\[T\] the gun only inherits its reload time/.test(rin.all) && /rechargeTime 3/.test(fs.readFileSync(path.join(g2.mod, 'resource/set/stuff/gun/75mm_kwk37'), 'latin1')), 'goh reload: an inherited reload time is written with a [T] note on the row [' + rin.all.slice(-400) + ']');
console.log(bad ? 'FAIL ' + bad : 'PASS');
process.exit(bad ? 1 : 0);
