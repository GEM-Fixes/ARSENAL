// portlint --exe (game parity): a made-up AS2 install (as64.exe + mowas_2.exe) whose child entity only as64/core holds, and a mod whose
// {place} names it. as64 (and no --exe) finds the child (quiet); mowas_2 has no as64/core (PORT_PLACE_CHILD_MISSING). --vfs takes --exe too.
// --exe goh: one plain refusal line, exit 2. Writes only to a temp folder. Last line PASS or FAIL.
// Author: c-port3 (game parity batch)
// Author: Imperator_Aug (ARSENAL, ia-95db1c1b)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const T = path.join(__dirname, '..', 'portlint.js');
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'portlint-exe-'));
let bad = 0;
const ok = (c, m, x) => { console.log((c ? 'ok   ' : 'FAIL ') + m + (c || !x ? '' : '  ' + String(x).slice(0, 400))); if (!c) bad++; };
const put = (rel, s) => { const f = path.join(W, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s.replace(/\n/g, '\r\n')); };
try {
  put('g/as64.exe', 'x'); put('g/mowas_2.exe', 'x');
  put('g/resource/entity/-vehicle/tank/base_t/base_t.def', '{game_entity}\n');
  put('g/as64/core/resource/entity/-vehicle/parts/core_child/core_child.def', '{game_entity}\n');
  put('mod/resource/entity/-vehicle/tank/p1/p1.def', '{game_entity\n\t{place "turret" "core_child"}\n}\n');
  const G = path.join(W, 'g'), M = path.join(W, 'mod');
  const run = (...a) => cp.spawnSync(process.execPath, [T, M, '--game', G, ...a], { encoding: 'utf8' });
  const has = r => /PORT_PLACE_CHILD_MISSING/.test(r.stdout);
  const none = run(), a64 = run('--exe', 'as64'), mow = run('--exe', 'mowas_2'), mow2 = run('--exe', 'mowas2');
  ok(!has(none) && none.status === 0, 'no --exe: as64 first, the as64/core child is vanilla (quiet)', none.stdout + none.stderr);
  ok(!has(a64) && a64.stdout === none.stdout, '--exe as64 = no --exe, same bytes', a64.stdout);
  ok(has(mow) && has(mow2), '--exe mowas_2 / mowas2: no as64/core, the child is missing (PORT_PLACE_CHILD_MISSING)', mow.stdout + mow.stderr);
  const v6 = cp.spawnSync(process.execPath, [T, '--vfs', '--game', G, '-q'], { encoding: 'utf8' }), vm = cp.spawnSync(process.execPath, [T, '--vfs', '--game', G, 'mowas_2', '-q'], { encoding: 'utf8' });
  const nf = r => +((/(\d+) files/.exec(r.stdout) || [])[1]);
  ok(nf(v6) === 2 && nf(vm) === 1, '--vfs: as64 mounts base + as64/core (2 files), mowas_2 base only (1)', v6.stdout + '|' + vm.stdout);
  const g = run('--exe', 'goh');
  ok(g.status === 2 && /^portlint: not available for GoH: .*\(plan\/reports\/game-parity\/t-port-b\.md: n\/a \(source game\)\)\s*$/.test(g.stderr), '--exe goh: one plain line, exit 2', g.status + ' ' + g.stderr);
  ok(run('--exe', 'as3').status === 2, '--exe bad value: exit 2');
} finally { fs.rmSync(W, { recursive: true, force: true }); }
console.log(bad ? 'FAIL' : 'PASS');
process.exitCode = bad ? 1 : 0;
