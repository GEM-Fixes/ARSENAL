// helmetport --exe (game parity): a made-up AS2 install (as64.exe + mowas_2.exe) whose only stuff of the asked tags sits in as64/core,
// and a GoH set whose {from} names it. as64 (and no --exe) finds it there (HP_FROM_AS2); mowas_2 has no as64/core (WARN_HP_FROM_UNKNOWN).
// --exe goh: one plain refusal line, exit 2. Writes only to a temp folder. Last line PASS or FAIL.
// Author: c-port3 (game parity batch)
// Author: Imperator_Aug (ARSENAL, ia-ff0879d7)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const T = path.join(__dirname, '..', 'helmetport.js');
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'helmetport-exe-'));
let bad = 0;
const ok = (c, m, x) => { console.log((c ? 'ok   ' : 'FAIL ') + m + (c || !x ? '' : '  ' + String(x).slice(0, 400))); if (!c) bad++; };
const put = (rel, s) => { const f = path.join(W, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
try {
  put('as2/as64.exe', 'x'); put('as2/mowas_2.exe', 'x');
  put('as2/resource/set/stuff/head/headgear.pattern', '{item {tag "smallitemin1hand head"}}\r\n');
  put('as2/as64/core/resource/set/stuff/head/coreonly', '{from "pattern headgear" {entity "x"}}\r\n');
  put('goh/resource/set/stuff/head/kid', '{from "coreonly" {entity "kid"}}\n');
  const run = (...a) => cp.spawnSync(process.execPath, [T, '--goh', path.join(W, 'goh'), '--game', path.join(W, 'as2'), '--no-rc', '--no-model', '--dry-run', '--out', path.join(W, 'out'), '--item', 'kid', ...a], { encoding: 'utf8' });
  const codes = r => (r.stdout.match(/^\S+: [A-Z0-9_]+ /gm) || []).map(s => s.trim()).sort();
  const none = run(), a64 = run('--exe', 'as64'), mow = run('--exe', 'mowas_2'), mow2 = run('--exe', 'mowas2');
  ok(/HP_FROM_AS2/.test(none.stdout) && !/WARN_HP_FROM_UNKNOWN/.test(none.stdout), 'no --exe: as64 first, the as64/core stuff is found (HP_FROM_AS2)', none.stdout + none.stderr);
  ok(JSON.stringify(codes(a64)) === JSON.stringify(codes(none)) && /HP_FROM_AS2/.test(a64.stdout), '--exe as64 = no --exe', a64.stdout);
  ok(/WARN_HP_FROM_UNKNOWN/.test(mow.stdout) && !/HP_FROM_AS2/.test(mow.stdout), '--exe mowas_2: no as64/core, the from is unknown (WARN_HP_FROM_UNKNOWN)', mow.stdout + mow.stderr);
  ok(JSON.stringify(codes(mow2)) === JSON.stringify(codes(mow)), '--exe mowas2 = --exe mowas_2', mow2.stdout);
  const g = run('--exe', 'goh');
  ok(g.status === 2 && /^helmetport: not available for GoH: .*\(plan\/reports\/game-parity\/t-port-b\.md: n\/a \(source game\)\)\s*$/.test(g.stderr), '--exe goh: one plain line, exit 2', g.status + ' ' + g.stderr);
  ok(!fs.existsSync(path.join(W, 'out')), 'dry run wrote nothing');
  // model path: the goh2as2 child takes the same --exe (dry run; a missing entity def is fine, the child must not reject the flag)
  put('goh/resource/set/stuff/head/hm', '{from "pattern heavy_headgear" {tag "armor"}{entity "hm"}}\n');
  put('goh/resource/entity/inv/hm/hm.def', '{actor {extender "stuff" {item "hm"}}}\n');
  const m = cp.spawnSync(process.execPath, [T, '--goh', path.join(W, 'goh'), '--game', path.join(W, 'as2'), '--no-rc', '--dry-run', '--out', path.join(W, 'out'), '--item', 'hm', 'mowas_2'], { encoding: 'utf8' });
  ok(/HP_MODEL/.test(m.stdout) && !/HP_ERR_MODEL/.test(m.stdout), '--exe mowas_2 with a model: goh2as2 child takes --exe (HP_MODEL, no HP_ERR_MODEL)', m.stdout + m.stderr);
  // the child really gets the build: a stub goh2as2 logs its argv
  const AL = path.join(W, 'args.log'), stubRun = (...a) => { fs.writeFileSync(AL, ''); cp.spawnSync(process.execPath, [T, '--goh', path.join(W, 'goh'), '--game', path.join(W, 'as2'), '--no-rc', '--dry-run', '--out', path.join(W, 'out'), '--item', 'hm', ...a], { encoding: 'utf8', env: { ...process.env, HELMETPORT_GOH2AS2: path.join(__dirname, 'stub-goh2as2.js'), HELMETPORT_TEST_ARGS: AL } }); return fs.readFileSync(AL, 'utf8'); };
  const sm = stubRun('--exe', 'mowas_2'), sm2 = stubRun('--exe', 'mowas2'), sn = stubRun();
  ok(/ --exe mowas_2( |$)/m.test(sm) && / --exe mowas_2( |$)/m.test(sm2), '--exe mowas_2 / mowas2: the goh2as2 child is given --exe mowas_2', sm + sm2);
  ok(sn.trim() !== '' && !/--exe/.test(sn), 'no --exe: the goh2as2 child gets no --exe (args as before)', sn);
} finally { fs.rmSync(W, { recursive: true, force: true }); }
console.log(bad ? 'FAIL' : 'PASS');
process.exitCode = bad ? 1 : 0;
