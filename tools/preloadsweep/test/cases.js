// preloadsweep cases, see truth.md. fake game logs are built from each run.json, so markers match the plan
// Author: Imperator_Aug (ARSENAL, ia-88ec07d1)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const tool = path.join(__dirname, '..', 'preloadsweep.js');
const work = path.join(__dirname, 'work'), game = path.join(work, 'game'), mod = path.join(game, 'mods', 'target mod');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL: ' + m); } };
const sh = (...a) => { const r = cp.spawnSync(process.execPath, [tool, ...a], { encoding: 'utf8' }); return { out: r.stdout + r.stderr, code: r.status }; };
const LIST = 'alpha,bravo,charlie';
function plan(dir, names = LIST, extra = []) { const out = path.join(work, 'out', dir); return { r: sh('plan', mod, '--names', names, '--out', out, ...extra), out, file: path.join(out, 'run.json') }; }
const load = f => JSON.parse(fs.readFileSync(f, 'utf8'));

// log with the markers of `cur` in order. o.silent: names that stay quiet. o.crashAt: stop before that entity. o.cant: real names that log an error
function mklog(file, cur, o = {}) {
  const L = ['CMD: "F:\\Fixture\\' + (o.exe || 'as64.exe') + '" -control', 'Build: fixture', 'Starting "multi/x:combat"'];
  for (let i = 0; i < cur.order.length; i++) {
    const n = cur.order[i], k = cur.kinds[i];
    if (o.crashAt === n) { L.push('', '***************** Exception *****************', 'define not found (name "gun_x") (, 98) @ [main_loop]', '------', '> file "//target mod/resource/entity/b/' + n + '.def"'); break; }
    if (o.warnIn === n) L.push("[00:00:17] Bone gun not found in " + n + " (, 310) @ [main_loop]");
    const say = ['head', 'tail', 'cp', 'bad'].includes(k) ? !(o.silent || []).includes(n) : (o.cant || []).includes(n);
    if (say) L.push(`[00:00:17] Can't preload the '${n}' entity (, 316) @ [main_loop]`);
  }
  if (o.after) L.push(o.after);
  fs.writeFileSync(file, L.join('\r\n') + '\r\n');
  return file;
}
const logf = n => path.join(work, n + '.log');
const line = (out, re) => out.split(/\r?\n/).find(l => re.test(l)) || '';

// 1 plan writes the format
{
  const { r, out, file } = plan('fmt');
  ok(r.code === 0, '1 plan exit: ' + r.out);
  const info = fs.readFileSync(path.join(out, 'mod.info')), pre = fs.readFileSync(path.join(out, 'resource/set/multiplayer/preload'));
  const it = info.toString('latin1'), pt = pre.toString('latin1');
  ok(/\{Require "target mod"\}/.test(it), '1 Require lowercase target folder');
  ok(/\{MinGameVersion "3\.262"\}/.test(it) && /\{MaxGameVersion "3\.262"\}/.test(it), '1 range copied');
  ok(it.split('\n').every(l => l === '' || l.endsWith('\r')) && pt.split('\n').every(l => l === '' || l.endsWith('\r')), '1 CRLF');
  ok(/^entity\t"alpha"\r$/m.test(pt) && /^entity\t"charlie"\r$/m.test(pt), '1 entity lines');
  ok(/^entity\t"fx_dust"\r$/m.test(pt) && /^sound\t"boom"\r$/m.test(pt), '1 base list kept with keywords');
  const files = fs.readdirSync(out).sort().join();
  ok(files === 'mod.info,resource,run.json', '1 min files: ' + files);
  const run = load(file), c = run.current;
  ok(c.order[0] === c.head && c.order[c.order.length - 1] === c.tail, '1 head first, tail last');
  ok(c.order.indexOf('alpha') < c.order.indexOf(c.cps.alpha) && c.order.indexOf(c.cps.alpha) < c.order.indexOf('bravo'), '1 checkpoint between neighbours');
  ok(/sha256 [0-9a-f]{64}/.test(r.out), '1 prints exe sha');
  ok(/testrun\.js .*--mods '"target mod",fmt'/.test(r.out), '1 prints the L3 step: ' + line(r.out, /testrun/));
  ok(/^\d+ findings$/m.test(r.out), '1 report contract');
  ok(run.exe && run.exe.name === 'as64.exe', '1 exe in run.json');
}
// 1b all-defs: loose + pak, only the target's layers. unknown name warned
{
  const { r, file } = plan('all', '', []);
  ok(r.code !== 0, '1b empty names refused');
  const out = path.join(work, 'out', 'alldefs');
  const a = sh('plan', mod, '--all-defs', '--out', out);
  ok(a.code === 0, '1b all-defs: ' + a.out);
  ok(load(path.join(out, 'run.json')).names.sort().join() === 'alpha,bravo,charlie,looseone,uppername', '1b all-defs names: ' + load(path.join(out, 'run.json')).names);
  const u = plan('unk', 'alpha,nosuchdef');
  ok(/WARN_PLAN_NAME_UNKNOWN/.test(u.r.out), '1b unknown name warned');
  ok(sh('plan', mod, '--names', 'alpha', '--out', path.join(mod, 'x')).code !== 0, '1b --out in target refused');
  ok(sh('plan', mod, '--names', 'alpha', '--out', path.join(game, 'resource', 'x')).code !== 0, '1b --out in install refused');
  fs.mkdirSync(path.join(work, 'out', 'foreign'), { recursive: true }); fs.writeFileSync(path.join(work, 'out', 'foreign', 'mine.txt'), 'x');
  ok(sh('plan', mod, '--names', 'alpha', '--out', path.join(work, 'out', 'foreign')).code !== 0, '1b foreign --out refused');
  ok(plan('fmt').r.code === 0, '1b own --out can be redone');
  void file;
}
// 2 read: all markers, bad sentinel caught, one real failure
{
  const { file } = plan('good');
  const cur = load(file).current;
  const r = sh('read', mklog(logf('good'), cur, { cant: ['bravo'], warnIn: 'charlie' }), '--plan', file);
  ok(r.code === 0, '2 COMPLETE exit 0: ' + r.out);
  ok(/^VERDICT: COMPLETE/m.test(r.out), '2 verdict');
  ok(/^FAILED bravo/m.test(r.out) && /^NO_ERROR alpha/m.test(r.out) && /^NO_ERROR charlie.*1 log line/m.test(r.out), '2 per entity');
  ok(/bad .*: CAUGHT/.test(r.out), '2 sentinel caught');
  ok(/missing name only/.test(r.out), '2 says what a missing-name sentinel does not prove');
  ok(/sha256 [0-9a-f]{64}/.test(r.out), '2 names the exe sha');
  ok(/PRELOAD_FAILED/.test(r.out) && /not a pass/i.test(r.out), '2 codes, no pass wording');
  ok(/It is not a pass/.test(r.out), '2 NO_ERROR disclaimer');
}
// 2b known-bad real def gives an error: caught and calibrated on a real def
{
  const { file } = plan('realbad', LIST, ['--sentinels', 'fx_dust,charlie']);
  const cur = load(file).current;
  const r = sh('read', mklog(logf('realbad'), cur, { crashAt: 'charlie' }), '--plan', file);
  ok(/^VERDICT: CRASHED/m.test(r.out), '2b crash on sentinel: ' + line(r.out, /VERDICT/));
  ok(/bad charlie \(def\): CAUGHT.*calibrated on a real def/.test(r.out), '2b real-def calibration: ' + line(r.out, /sentinels/));
}
// 3 sentinel silent = NOT CALIBRATED
{
  const { file } = plan('silent', LIST, ['--sentinels', 'fx_dust,charlie']);
  const cur = load(file).current;
  const r = sh('read', mklog(logf('silent'), cur), '--plan', file);
  ok(r.code === 1, '3 exit 1');
  ok(/^VERDICT: NOT_CALIBRATED/m.test(r.out), '3 verdict: ' + line(r.out, /VERDICT/));
  ok(/NOT CALIBRATED, every NO_ERROR is meaningless/.test(r.out), '3 says it');
  ok(/PRELOAD_NOT_CALIBRATED/.test(r.out), '3 code');
  ok(!/^VERDICT: COMPLETE/m.test(r.out), '3 not complete');
}
// 3b sentinel behind a crash: not reached, still not calibrated
{
  const { file } = plan('unreached', LIST, ['--sentinels', 'fx_dust,charlie']);
  const cur = load(file).current;
  const r = sh('read', mklog(logf('unreached'), cur, { crashAt: 'alpha' }), '--plan', file);
  ok(/^VERDICT: NOT_CALIBRATED/m.test(r.out) && /was not reached/.test(r.out), '3b: ' + line(r.out, /VERDICT/));
}
// 4 no preload signal = INCONCLUSIVE, entities never NO_ERROR
{
  const { file } = plan('nosig');
  fs.writeFileSync(logf('nosig'), 'CMD: "F:\\Fixture\\as64.exe"\r\nStarting "multi/x:combat"\r\nGameThreadStart\r\n');
  const r = sh('read', logf('nosig'), '--plan', file);
  ok(r.code === 1 && /^VERDICT: INCONCLUSIVE/m.test(r.out), '4 verdict: ' + line(r.out, /VERDICT/));
  ok(!/^NO_ERROR/m.test(r.out), '4 no NO_ERROR rows');
  ok(/^NOT_REACHED alpha/m.test(r.out), '4 NOT_REACHED rows');
  ok(/counts: FAILED 0, NOT_REACHED 3, NO_ERROR 0/.test(r.out), '4 counts');
  ok(/good fx_dust: NOT_REACHED/.test(r.out), '4 good sentinel not claimed reached');
  // a stale log from another plan's run: its markers prove nothing here
  const other = plan('nosig2'), stale = mklog(logf('stale'), load(other.file).current);
  ok(/^VERDICT: INCONCLUSIVE/m.test(sh('read', stale, '--plan', file).out), '4 other run markers rejected');
  // crash before preload is not a crash in the list
  fs.writeFileSync(logf('early'), 'CMD: "x\\as64.exe"\r\n\r\n***************** Exception *****************\r\nboom (a.cpp, 1) @ [main_loop]\r\n');
  const e = sh('read', logf('early'), '--plan', file);
  ok(/^VERDICT: INCONCLUSIVE/m.test(e.out) && /before any marker/.test(e.out) && !/^FAILED/m.test(e.out), '4 early crash: ' + line(e.out, /VERDICT/));
}
// 5 crash mid list, window names the entity, rest NOT_REACHED; not_reached.txt written on request
{
  const { file } = plan('crash', 'alpha,bravo,charlie,uppername');
  const cur = load(file).current, outd = path.join(work, 'out', 'crash-next');
  const r = sh('read', mklog(logf('crash'), cur, { crashAt: 'bravo' }), '--plan', file, '--out', outd);
  ok(/^VERDICT: CRASHED/m.test(r.out), '5 verdict');
  ok(/^NO_ERROR alpha/m.test(r.out) && /^FAILED bravo: crash/m.test(r.out) && /^NOT_REACHED charlie/m.test(r.out), '5 positions: ' + r.out);
  ok(/in \/\/target mod\/resource\/entity\/b\/bravo\.def/.test(r.out), '5 exception file named');
  ok(fs.readFileSync(path.join(outd, 'not_reached.txt'), 'latin1').trim().split(/\r?\n/).join() === 'charlie,uppername', '5 not_reached.txt');
  // silent death: no block, --crashed from the watcher
  const s = sh('read', mklog(logf('crash2'), cur, { crashAt: 'zzz-never', silent: [cur.cps.bravo, cur.cps.charlie, cur.cps.uppername, cur.tail] }), '--plan', file);
  ok(/^VERDICT: INCOMPLETE/m.test(s.out), '5 cut log is INCOMPLETE: ' + line(s.out, /VERDICT/));
  const k = sh('read', logf('crash2'), '--plan', file, '--crashed');
  ok(/^VERDICT: CRASHED/m.test(k.out) && /^FAILED bravo/m.test(k.out), '5 --crashed: ' + line(k.out, /VERDICT/));
  // crash after the tail is not the list's
  const a = sh('read', mklog(logf('after'), cur, { after: '\r\n***************** Exception *****************\r\nlater (b.cpp, 2) @ [quant]' }), '--plan', file);
  ok(/^VERDICT: COMPLETE/m.test(a.out) && /crash after the tail/.test(a.out), '5 crash after tail: ' + line(a.out, /VERDICT/));
}
// 6 exe checks: other exe in the log, other sha on disk, no markers out of order
{
  const { file } = plan('exe');
  const cur = load(file).current;
  const r = sh('read', mklog(logf('exe'), cur, { exe: 'mowas_2.exe' }), '--plan', file);
  ok(/^VERDICT: INCONCLUSIVE/m.test(r.out) && /log ran mowas_2\.exe/.test(r.out), '6 other exe: ' + line(r.out, /VERDICT/));
  const other = path.join(work, 'other.exe'); fs.writeFileSync(other, 'different bytes');
  const r2 = sh('read', mklog(logf('exe2'), cur), '--plan', file, '--exe', other);
  ok(/^VERDICT: INCONCLUSIVE/m.test(r2.out) && /the plan was made for/.test(r2.out), '6 other sha: ' + line(r2.out, /VERDICT/));
  const t = fs.readFileSync(logf('exe2'), 'latin1').split('\r\n');
  const a = t.findIndex(l => l.includes(cur.cps.alpha)), b = t.findIndex(l => l.includes(cur.cps.bravo));
  [t[a], t[b]] = [t[b], t[a]];
  fs.writeFileSync(logf('swap'), t.join('\r\n'));
  ok(/^VERDICT: INCONCLUSIVE/m.test(sh('read', logf('swap'), '--plan', file).out), '6 out of order markers');
  // second load in a session: the last pass is judged
  const twice = mklog(logf('pass1'), cur, { cant: ['alpha'] }), body = fs.readFileSync(twice, 'latin1');
  mklog(logf('pass2'), cur);
  fs.writeFileSync(logf('twice'), body + fs.readFileSync(logf('pass2'), 'latin1'));
  ok(/^NO_ERROR alpha/m.test(sh('read', logf('twice'), '--plan', file).out), '6 last pass judged');
}
// 7 bisect narrows a 10-list to one
{
  const names = Array.from({ length: 10 }, (_, i) => 'unit' + i), crasher = 'unit7';
  const { r, file, out } = plan('bis', names.join(','));
  ok(r.code === 0, '7 plan');
  const first = sh('bisect', '--plan', file, '--crashed');
  ok(/split 10 -> A 5 .*B 5/.test(first.out), '7 first split: ' + first.out);
  ok(fs.existsSync(path.join(out, 'bisect/step-1-a.txt')) && fs.existsSync(path.join(out, 'bisect/step-1-b.txt')), '7 both lists written');
  const preA = fs.readFileSync(path.join(out, 'resource/set/multiplayer/preload'), 'latin1');
  ok(/"unit0"/.test(preA) && !/"unit9"/.test(preA) && /"fx_dust"/.test(preA), '7 list A loaded into the preload file, base kept');
  const m = /at most (\d+) if one crasher/.exec(first.out); ok(m, '7 prints runs remaining: ' + first.out);
  const budget = +m[1], worst = +/at most (\d+) if every/.exec(first.out)[1];
  ok(worst === 18, '7 worst case: ' + worst);
  let runs = 0, last = first.out;
  for (; runs < 30; runs++) {
    const run = load(file);
    if (!run.bisect.pending) break;
    const has = run.bisect.pending.names.includes(crasher);
    last = sh('bisect', '--plan', file, has ? '--crashed' : '--clean').out;
    ok(/runs remain:/.test(last), '7 remaining each step');
  }
  const end = load(file).bisect;
  ok(!end.pending, '7 finished');
  ok(end.crashers.length === 1 && end.crashers[0].name === crasher, '7 single crasher found: ' + JSON.stringify(end.crashers));
  ok(end.clean.length === 9, '7 rest cleared: ' + end.clean.length);
  ok(/runs remain: 0/.test(last), '7 ends at zero: ' + last);
  ok(runs <= budget, `7 ${runs} runs within the printed ${budget}`);
  ok(sh('bisect', '--plan', file, '--crashed').code !== 0, '7 refuses after the end');
  // every crasher at once: a full tree, each confirmed by its own run
  const all = plan('bisall', 'unit0,unit1,unit2,unit3').file;
  sh('bisect', '--plan', all, '--crashed');
  let n = 0;
  while (load(all).bisect.pending && n++ < 20) sh('bisect', '--plan', all, '--crashed');
  const ea = load(all).bisect;
  ok(ea.crashers.map(c => c.name).sort().join() === 'unit0,unit1,unit2,unit3', '7 all crashers: ' + JSON.stringify(ea.crashers));
  // sibling logic: A clean means B must hold it, no run spent on the whole of B
  const sib = plan('bissib', 'unit0,unit1').file;
  sh('bisect', '--plan', sib, '--crashed');
  const sr = sh('bisect', '--plan', sib, '--clean');
  ok(/crasher \(inferred/.test(sr.out) && load(sib).bisect.crashers[0].name === 'unit1', '7 inferred sibling: ' + sr.out);
}
// 8 bisect --log judges from the log and refuses a run that proves nothing
{
  const names = 'unit0,unit1,unit2,unit3';
  const { file } = plan('bislog', names);
  const c0 = load(file).current;
  const r = sh('bisect', '--plan', file, '--log', mklog(logf('bl1'), c0, { crashAt: 'unit1' }));
  ok(/log says: crashed/.test(r.out), '8 crash from log: ' + r.out);
  const c1 = load(file).current;
  ok(c1.id !== c0.id, '8 new run id per list');
  const stale = sh('bisect', '--plan', file, '--log', logf('bl1'));
  ok(stale.code !== 0 && /proves nothing/.test(stale.out), '8 old log refused: ' + stale.out);
  const clean = sh('bisect', '--plan', file, '--log', mklog(logf('bl2'), c1));
  ok(/log says: clean/.test(clean.out), '8 clean from log: ' + clean.out);
  // bad sentinel that is a real def stays out of the lists
  const rb = plan('bisbad', 'unit0,unit1,charlie', ['--sentinels', 'fx_dust,charlie']).file;
  const o = sh('bisect', '--plan', rb, '--crashed');
  ok(/left out of the lists/.test(o.out) && load(rb).current.bad.kind === 'missing' && !load(rb).current.names.includes('charlie'), '8 real bad left out: ' + o.out);
}
// 9 MoW:AS2 on the shared install: --exe mowas2 (word) -> mowas_2.exe, vfs mowas_2, no testrun line (TST-19), no as64+. as64 run.json has no gameId
{
  const { r, file } = plan('mow', LIST, ['--exe', 'mowas2']);
  ok(r.code === 0, '9 mowas2 plan exit: ' + r.out);
  const run = load(file);
  ok(run.gameId === 'mowas2' && run.exe && run.exe.name === 'mowas_2.exe', '9 mowas2 exe: ' + JSON.stringify(run.exe));
  ok(!/testrun\.js/.test(r.out) && /no -control and no -instance \(limits TST-19\)/.test(r.out), '9 mowas2 step: ' + line(r.out, /TST-19|testrun/));
  ok(/read: target mod and base through vfs/.test(r.out), '9 mowas2 vfs read');
  const p = plan('mowpath', LIST, ['--exe', path.join(game, 'mowas_2.exe')]);
  ok(p.r.code === 0 && load(p.file).gameId === 'mowas2', '9 mowas_2.exe path = same game');
  ok(load(path.join(work, 'out', 'fmt', 'run.json')).gameId === undefined, '9 as64 run.json unchanged (no gameId)');
}
// 10 GoH: exe path (no --game) -> GoH install; target outside the install, no bounds; base list from GoH resource/; GoH step lines
{
  const goh = path.join(work, 'goh'), gmod = path.join(work, 'gohmods', 'target_goh'), gexe = path.join(goh, 'binaries', 'x64', 'call_to_arms.exe');
  const out = path.join(work, 'out', 'gohrun');
  const r = sh('plan', gmod, '--names', 'tiger,panther', '--out', out, '--exe', gexe);
  ok(r.code === 0, '10 goh plan exit: ' + r.out);
  const run = load(path.join(out, 'run.json')), it = fs.readFileSync(path.join(out, 'mod.info'), 'latin1');
  const pt = fs.readFileSync(path.join(out, 'resource/set/multiplayer/preload'), 'latin1');
  ok(run.gameId === 'goh' && run.map === 'multi/2v2_gelid:battle_zones' && path.resolve(run.game) === path.resolve(goh), '10 goh run: ' + run.gameId + ' ' + run.map + ' ' + run.game);
  ok(!/GameVersion/.test(it) && /\{Require "target_goh"\}/.test(it), '10 goh mod.info open range: ' + it);
  ok(/^entity\t"conquest_blank"\r$/m.test(pt) && /^entity\t"tiger"\r$/m.test(pt), '10 goh base list + names');
  ok(!/WARN_PLAN_NAME_UNKNOWN/.test(r.out) && /2 in the target's layers/.test(r.out), '10 goh target defs found: ' + line(r.out, /^read:/));
  ok(!/testrun\.js/.test(r.out) && /modswitch\.js --game/.test(r.out) && /uidrive\.js play goh boot,skirmish/.test(r.out), '10 goh step lines');
  ok(/copy .*target_goh to <GoH>\/mods\/target_goh/.test(r.out) && /ARSENAL does not write into the GoH install/.test(r.out), '10 goh copy lines');
  // word + --game; --out inside the GoH install refused (writeguard); a folder name GoH skips refused
  const w = sh('plan', gmod, '--names', 'tiger', '--out', path.join(work, 'out', 'gohword'), '--exe', 'goh', '--game', goh);
  ok(w.code === 0 && load(path.join(work, 'out', 'gohword', 'run.json')).gameId === 'goh', '10 goh word: ' + w.out);
  // upper-case word, no --game, an AS2 install as the default: the GoH install is still used (lib/games install, not cli's AS2 default)
  const uc = cp.spawnSync(process.execPath, [tool, 'plan', gmod, '--names', 'tiger', '--out', path.join(work, 'out', 'gohupper'), '--exe', 'GOH'],
    { encoding: 'utf8', env: { ...process.env, AS2_GAME: game, GOH_GAME: goh } });
  ok(uc.status === 0 && path.resolve(load(path.join(work, 'out', 'gohupper', 'run.json')).game) === path.resolve(goh), '10 goh upper-case word picks the GoH install: ' + uc.stdout + uc.stderr);
  const inside = sh('plan', gmod, '--names', 'tiger', '--out', path.join(goh, 'resource', 'sweep'), '--exe', gexe);
  // the game's own files stay refused; a new folder under <GoH>/mods is allowed since 2026-11-15 (lib/writeguard)
  ok(inside.code !== 0 && !fs.existsSync(path.join(goh, 'resource', 'sweep')), '10 goh --out in the game files refused: ' + inside.out);
  const bad = sh('plan', gmod, '--names', 'tiger', '--out', path.join(work, 'out', 'goh-bad'), '--exe', gexe);
  ok(bad.code !== 0 && /never loads on GoH/.test(bad.out), '10 goh folder rule: ' + bad.out);
  // read a GoH-form log: every line stamped (GHLOG-07), `CMD = `, crash with a stamped `> file` line
  const cur = run.current, L = ['CMD = "x\\binaries\\x64\\call_to_arms.exe"'];
  for (let i = 0; i < cur.order.length; i++) {
    const n = cur.order[i], k = cur.kinds[i];
    if (n === 'tiger') { L.push('***************** Exception *****************', 'define not found @ [main_loop]', '> file "/entity/g/tiger.def"'); break; }
    if (['head', 'tail', 'cp', 'bad'].includes(k)) L.push(`Can't preload the '${n}' entity @ [main_loop]`);
  }
  const gl = logf('gohcrash'); fs.writeFileSync(gl, L.map(s => '[00:01:02] ' + s).join('\r\n') + '\r\n');
  const rd = sh('read', gl, '--plan', path.join(out, 'run.json'));
  ok(/^VERDICT: CRASHED/m.test(rd.out) && /^FAILED tiger: crash/m.test(rd.out) && /in \/entity\/g\/tiger\.def/.test(rd.out), '10 goh read: ' + rd.out);
}
console.log(fails ? `${fails} failed` : 'PASS');
process.exitCode = fails ? 1 : 0;
