// Author: Imperator_Aug (ARSENAL, ia-5cfba572)
// SPEED-B3 seeded test, no game: per-pair give-up at the class cap, --auto-rerun void + split, --list jobs, --insts gate, preflight unit-fault HOLD, MG/noBlast fire evidence.
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
process.argv.push('--inst', '3');   // edrun reads --inst at load; never 0
const e = require('../edrun.js'), multi = require('../multi.js'), pf = require('../preflight.js');
const fail = [];
const t = (n, f) => { try { f(); } catch (err) { fail.push(n + ': ' + err.message); } };
const ta = async (n, f) => { try { await f(); } catch (err) { fail.push(n + ': ' + err.message); } };
const crew = ['mp/ger/tankman', 'mp/ger/tankman'];

// --- give-up at the class cap
const fire = { name: 'v1', class: 'vehicle', shooter: 'pz6bh', crew, foe: 't34_0', foeCrew: crew };
const clock = { 'clock 0': 10, 'clock 40': 30 };   // ratio 2: a 90 game s cap is 45 wall s
t('giveUp: vehicle past cap/ratio + margin gives up', () => {
  const times = { ...clock, 'v1 order': 20 };
  assert.strictEqual(e.giveUpOf(fire, times, null, 20 + 45 + e.GIVEUP_MARGIN - 1), false, 'inside margin');
  assert.strictEqual(e.giveUpOf(fire, times, null, 20 + 45 + e.GIVEUP_MARGIN + 1), true, 'past');
});
t('giveUp: no order, no speed, move, control, never, kill-cap none: never', () => {
  const late = 10000;
  assert.strictEqual(e.giveUpOf(fire, { ...clock }, null, late), false, 'no order mark');
  assert.strictEqual(e.giveUpOf(fire, { 'v1 order': 20 }, null, late), false, 'no clock: no ratio');
  assert.strictEqual(e.giveUpOf({ ...fire, control: true }, { ...clock, 'v1 order': 20 }, null, late), false, 'control holds the game');
  assert.strictEqual(e.giveUpOf({ ...fire, never: true }, { ...clock, 'v1 order': 20 }, null, late), false);
  assert.strictEqual(e.giveUpOf({ ...fire, move: { dy: 400 } }, { ...clock, 'v1 order': 20 }, null, late), false);
  assert.strictEqual(e.giveUpOf(fire, { ...clock, 'v1 order': 20 }, e.killCapOf('none'), late), false, 'cap none');
});
t('giveUp: infantry cap 20 game s', () => {
  const inf = { name: 'i1', class: 'infantry', shooter: 'mp/ger/rifle', foe: 'mp/rus/rifle', count: 3 };
  assert.strictEqual(e.giveUpOf(inf, { ...clock, 'i1 order': 20 }, null, 20 + 10 + e.GIVEUP_MARGIN + 0.5), true);
});
t('giveUp: rowsOf keeps the verdict, adds gaveUp + note', () => {
  const ch = { times: { start: 5, ...clock, 'v1 order': 20, 'v1 arm': 15 }, gaveUp: { v1: 75 }, speed: { ratio: 2 }, logText: '', pipeLines: [] };
  const [row] = e.rowsOf([fire], ch, {}, {});
  assert.strictEqual(row.verdict, 'NOKILL');
  assert.strictEqual(row.gaveUp, 70);
  assert.ok(/given up at class cap/.test(row.note), row.note);
});

// --- auto-rerun
t('voidOf: crash, never started, controls void, ok', () => {
  assert.strictEqual(e.voidOf({ crash: true, times: { start: 1 } }), 'crash');
  assert.strictEqual(e.voidOf({ times: {} }), 'never started');
  assert.strictEqual(e.voidOf({ times: {}, loadTimeout: true }), 'still loading');
  assert.strictEqual(e.voidOf({ times: { start: 1 } }, { void: true }), 'controls void');
  assert.strictEqual(e.voidOf({ times: { start: 1 } }, { void: false }), null);
});
t('splitOnVoid: control + 2-3 pairs a game', () => {
  const mk = n => [{ name: 'c', control: true }, ...Array.from({ length: n }, (_, i) => ({ name: 'p' + i }))];
  const sizes = n => e.splitOnVoid(mk(n)).map(g => g.filter(p => !p.control).length);
  assert.deepStrictEqual(sizes(3), [3], '3: no split');
  assert.deepStrictEqual(sizes(4), [2, 2]);
  assert.deepStrictEqual(sizes(7), [3, 2, 2]);
  assert.deepStrictEqual(sizes(8), [3, 3, 2]);
  assert.ok(e.splitOnVoid(mk(7)).every(g => g[0].control), 'every game keeps the control');
});

// --- --list jobs
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edrun-b3-'));
const pairsA = path.join(__dirname, 'pairs.json');
t('jobsOf: md run list, cli wins, per-line out, defaults', () => {
  const md = path.join(tmp, 'list.md');
  fs.writeFileSync(md, `## A\nnode tools/edrun/edrun.js --pairs ${pairsA} --out ${tmp}/o1 --secs 100 --mods as64+\n## B\n${pairsA.replace(/\\/g, '/')}\n`);
  const jobs = multi.jobsOf({ list: md, secs: '120', mods: 'as64+' }, e.KNOWN_ARGS.concat([]));
  assert.strictEqual(jobs.length, 2);
  assert.strictEqual(jobs[0].secs, '120', 'cli wins');
  assert.strictEqual(path.resolve(jobs[0].out), path.resolve(tmp, 'o1'));
  assert.strictEqual(path.basename(jobs[1].out), 'pairs', 'no --out: ../run/edrun/<pairs base>');
  assert.notStrictEqual(path.resolve(jobs[0].out), path.resolve(jobs[1].out));
});
t('jobsOf: mods differ -> error; same out twice -> error; unknown arg -> error', () => {
  const md = path.join(tmp, 'bad.md');
  fs.writeFileSync(md, `node tools/edrun/edrun.js --pairs ${pairsA} --mods as64+ --out ${tmp}/x1\nnode tools/edrun/edrun.js --pairs ${pairsA} --mods as64+,c39_rp3 --out ${tmp}/x2\n`);
  assert.throws(() => multi.jobsOf({ list: md }, e.KNOWN_ARGS), /differ in --mods/);
  fs.writeFileSync(md, `node tools/edrun/edrun.js --pairs ${pairsA} --out ${tmp}/x1\nnode tools/edrun/edrun.js --pairs ${pairsA} --out ${tmp}/x1\n`);
  assert.throws(() => multi.jobsOf({ list: md }, e.KNOWN_ARGS), /same --out/);
  fs.writeFileSync(md, `node tools/edrun/edrun.js --pairs ${pairsA} --bogus 1\n`);
  assert.throws(() => multi.jobsOf({ list: md }, e.KNOWN_ARGS), /unknown arg --bogus/);
});
t('instsOf: never 0, no twice', () => {
  assert.deepStrictEqual(multi.instsOf('1,2,3'), [1, 2, 3]);
  assert.strictEqual(typeof multi.instsOf('0,1'), 'string');
  assert.strictEqual(typeof multi.instsOf('2,2'), 'string');
  assert.strictEqual(typeof multi.instsOf(true), 'string');
});

// --- faults
const DEF_GUN2 = '{game_entity\n\t{Weaponry\n\t\t{place "gun"\n\t\t\t{weapon "goh_114mm_uk-bl" filled}\n\t\t\t{Barrels 2}\n\t\t}\n\t}\n\t{Extension "gun.mdl"}\n}\n';
const MDL_NO = '{Skeleton\n\t{bone "body"\n\t\t{bone "foresight1"}\n\t}\n}\n', MDL_OK = '{Skeleton {bone "shooter00"} {bone "shooter01"}}';
const DEF_LIGHT = '{game_entity\n\t{Weaponry\n\t\t{place "light" {foresight "foresight4"}\n\t\t\t{weapon "searchlight"}\n\t\t}\n\t}\n}\n';
const DEF_M20 = '{game_entity\n\t{extender "inventory"\n\t\t{box\n\t\t\t{item "browning" filled {user "mgun"}}\n\t\t}\n\t}\n\t{Weaponry\n\t\t{place "mgun"\n\t\t\t{type "mgun_main"}\n\t\t}\n\t}\n}\n';
const DEF_AMMO = '{game_entity\n\t{Weaponry\n\t\t{place "gun"\n\t\t\t{weapon "w57" filling "bullet57 ap" 1}\n\t\t}\n\t}\n}\n';
t('faults: g40 type, Barrels 2 with no shooter bones -> NOBONE', () => {
  const r = pf.faultsIn(DEF_GUN2, { readModel: n => (n === 'gun.mdl' ? MDL_NO : null) });
  assert.deepStrictEqual(r.faults.map(f => f.code), ['NOBONE']);
  assert.ok(/shooter00, shooter01/.test(r.faults[0].text));
  assert.strictEqual(pf.faultsIn(DEF_GUN2, { readModel: () => MDL_OK }).faults.length, 0, 'bones there');
  assert.strictEqual(pf.faultsIn(DEF_GUN2, {}).faults.length, 0, 'model not read: note only');
});
t('faults: g34 type, only a searchlight -> NOWEAPON', () => {
  const r = pf.faultsIn(DEF_LIGHT, {});
  assert.deepStrictEqual(r.faults.map(f => f.code), ['NOWEAPON']);
  assert.ok(/only searchlight/.test(r.faults[0].text));
});
t('faults: m20_fr type, crew item {user "mgun"} -> not held', () => {
  const r = pf.faultsIn(DEF_M20, {});
  assert.strictEqual(r.faults.length, 0, JSON.stringify(r));
  assert.ok(/crew carries it/.test(r.notes[0]));
});
t('faults: ammo calibre vs the weapon filling ({from} chain)', () => {
  const chain = own => () => ['{from "base" {rechargeTime 4}}', `{from "pattern gun" {filling "${own}"}}`];
  assert.strictEqual(pf.faultsIn(DEF_AMMO, { weaponChain: chain('bullet57') }).faults.length, 0, 'g19 type: same as vanilla mk6');
  assert.deepStrictEqual(pf.faultsIn(DEF_AMMO, { weaponChain: chain('bullet75') }).faults.map(f => f.code), ['AMMO']);
  assert.strictEqual(pf.calOf('ammo bullet75 ap'), 'bullet75');
});
t('faults: no Weaponry block (infantry) -> nothing', () => {
  assert.strictEqual(pf.faultsIn('{game_entity {props "human"}}', {}).faults.length, 0);
});
t('faultHold: prints HOLD, runs unless hold; hold moves to held FAULT', () => {
  const mk = () => ({ run: [{ ...fire, name: 'g34', shooter: 'lightmg' }, { ...fire }], held: [], res: { g34: { status: 'OK', warns: [], notes: [] }, v1: { status: 'OK', warns: [], notes: [] } } });
  const fo = d => (d === 'lightmg' ? pf.faultsIn(DEF_LIGHT, {}) : { faults: [], notes: [] });
  const logs = [], r1 = mk();
  e.faultHold(r1, fo, false, l => logs.push(l));
  assert.strictEqual(r1.run.length, 2, 'no --hold-faults: still runs');
  assert.ok(/^preflight HOLD g34: lightmg NOWEAPON/.test(logs[0]), logs[0]);
  const r2 = mk();
  e.faultHold(r2, fo, true, () => {});
  assert.deepStrictEqual(r2.run.map(p => p.name), ['v1']);
  assert.strictEqual(r2.held[0].r.status, 'FAULT');
});

// --- MG / noBlast
const mgP = { name: 'mg1', class: 'vehicle', shooter: 'type1_ho-ki_mg', crew, foe: 'gaz67b', foeCrew: crew };
const muz = d => (d === 'type1_ho-ki_mg' ? null : d === 'pz6bh' ? 'muzzle_large' : undefined);
t('MG: dbg_health added for a noBlast shooter, not twice, not for cannons', () => {
  assert.deepStrictEqual(e.pipeExtraOf('dbg_blast 1', [mgP], muz), ['dbg_blast 1', 'dbg_health 1']);
  assert.deepStrictEqual(e.pipeExtraOf('dbg_blast 1;dbg_health 1', [mgP], muz), ['dbg_blast 1', 'dbg_health 1']);
  assert.deepStrictEqual(e.pipeExtraOf('dbg_blast 1', [fire], muz), ['dbg_blast 1']);
  assert.deepStrictEqual(e.pipeExtraOf(undefined, [mgP], null), [], 'no reader: unchanged');
});
t('MG: preflight line for noBlast vs vehicle foe, none vs infantry foe', () => {
  assert.strictEqual(e.mgWarn([mgP], muz, '', () => {}).length, 1);
  assert.strictEqual(e.mgWarn([{ ...mgP, foe: 'mp/ger/rifle', foeClass: 'infantry', foeCrew: undefined }], muz, '', () => {}).length, 0);
  assert.strictEqual(e.mgWarn([fire], muz, '', () => {}).length, 0);
});
t('MG: NOKILL with no hit/HEALTH -> fireUnmeasured', () => {
  const ch = { times: { start: 5, ...clock, 'mg1 order': 20, 'mg1 arm': 15 }, speed: { ratio: 2 }, logText: '', pipeLines: ['{"type":"reply","id":2,"text":"dbg_blast = 1"}'] };
  const [row] = e.rowsOf([mgP], ch, {}, { muzzleOf: muz });
  assert.strictEqual(row.verdict, 'NOKILL');
  assert.strictEqual(row.fireUnmeasured, true, JSON.stringify(row));
  assert.ok(/no fire evidence/.test(row.note));
  const [r2] = e.rowsOf([fire], { ...ch, times: { ...ch.times, 'v1 order': 20 } }, {}, { muzzleOf: muz });
  assert.ok(!r2.fireUnmeasured, 'a cannon NOKILL is measured');
});

// --- CLI
const ed = path.join(__dirname, '..', 'edrun.js');
const run = args => cp.spawnSync(process.execPath, [ed, ...args], { encoding: 'utf8' });
t('cli: --insts 0 exits 2; --insts without --list exits 2; --list + --pairs exits 2', () => {
  const md = path.join(tmp, 'one.md');
  fs.writeFileSync(md, `node tools/edrun/edrun.js --pairs ${pairsA} --out ${tmp}/d1\n`);
  assert.strictEqual(run(['--list', md, '--insts', '0', '--game', tmp]).status, 2);
  assert.strictEqual(run(['--pairs', pairsA, '--insts', '1,2']).status, 2);
  assert.strictEqual(run(['--list', md, '--pairs', pairsA, '--inst', '3']).status, 2);
  assert.strictEqual(run(['--pairs', pairsA, '--inst', '3', '--auto-rerun', '12', '--dry', '--out', tmp + '/d0']).status, 2, '--auto-rerun over 9');
});
t('cli: --list --dry writes each job\'s missions', () => {
  const md = path.join(tmp, 'two.md');
  fs.writeFileSync(md, `node tools/edrun/edrun.js --pairs ${pairsA} --out ${tmp}/j1\nnode tools/edrun/edrun.js --pairs ${pairsA} --out ${tmp}/j2\n`);
  const r = run(['--list', md, '--dry', '--inst', '3']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(tmp, 'j1', 'combat0.mi')) && fs.existsSync(path.join(tmp, 'j2', 'combat0.mi')));
});
t('cli: a bad later list line stops the list before any job runs (exit 2)', () => {
  const bad = path.join(tmp, 'bad.json'), md = path.join(tmp, 'badlist.md');
  fs.writeFileSync(bad, JSON.stringify([{ name: 'x', class: 'vehicle', shooter: 'pz6bh', crew, foe: 't34_0' }]));   // no foeCrew: validate refuses
  fs.writeFileSync(md, `node tools/edrun/edrun.js --pairs ${pairsA} --out ${tmp}/k1\nnode tools/edrun/edrun.js --pairs ${bad} --out ${tmp}/k2\n`);
  const r = run(['--list', md, '--dry', '--inst', '3']);
  assert.strictEqual(r.status, 2, r.stdout + r.stderr);
  assert.ok(/list job 1/.test(r.stderr), r.stderr);
  assert.ok(!fs.existsSync(path.join(tmp, 'k1', 'combat0.mi')), 'job 0 not run');
});

(async () => {
  await ta('gate: stagger between starts, waits for free commit', async () => {
    let now = 0, free = 1000;
    const slept = [];
    const gate = multi.makeGate({ stagger: 12000, reserve: 1500, now: () => now, sleep: async ms => { slept.push(ms); now += ms; if (now > 5000) free = 4000; }, read: () => free, log: () => {} });
    await gate();
    assert.ok(now >= 5000, 'waited for commit: ' + now);
    const t1 = now;
    await gate();
    assert.ok(now - t1 >= 12000, 'stagger: ' + (now - t1));
    const g2 = multi.makeGate({ stagger: 0, reserve: 1500, now: () => 0, sleep: async () => {}, read: () => null, log: () => {} });
    await g2();   // unreadable commit: no gate, no hang
  });
  await ta('parallel: each job once, one at a time per instance, --inst n --worker passed, exits combined', async () => {
    const stub = path.join(tmp, 'stub.js');
    fs.writeFileSync(stub, `const m=require(${JSON.stringify(path.join(__dirname, '..', 'multi.js'))});const i=process.argv[process.argv.indexOf('--inst')+1];
(async()=>{let k;const got=[];while((k=await m.askJob())!==null)got.push(k);console.log('inst '+i+' jobs '+got.join(',')+' worker '+process.argv.includes('--worker')+' insts '+process.argv.includes('--insts'));process.exit(i==='2'?1:0)})();`);
    const out = [], w = process.stdout.write.bind(process.stdout);
    process.stdout.write = s => { out.push(String(s)); return true; };
    const log = console.log; console.log = s => out.push(String(s) + '\n');
    let code;
    try { code = await multi.parallel(stub, ['--list', 'x', '--insts', '1,2'], [1, 2], [{ pairs: 'a', out: 'A' }, { pairs: 'b', out: 'B' }, { pairs: 'c', out: 'C' }], { stagger: 0, reserve: 0 }); }
    finally { process.stdout.write = w; console.log = log; }
    const txt = out.join('');
    const got = [...txt.matchAll(/inst (\d) jobs ([\d,]*) worker true insts false/g)];
    assert.strictEqual(got.length, 2, txt);
    assert.deepStrictEqual(got.flatMap(m => m[2].split(',').filter(Boolean)).map(Number).sort(), [0, 1, 2], txt);
    assert.strictEqual(code, 1, 'one worker exit 1 -> 1');
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  if (fail.length) { console.log('FAIL speedb3 -- ' + fail.join('\n ')); process.exit(1); }
  console.log('speedb3: ok');
})();
