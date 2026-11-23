// portasset --exe (game parity): a made-up AS2 install (as64.exe + mowas_2.exe) whose texture only as64/core holds, and a mod .mtl that
// names it. as64 (and no --exe: as64.exe is there) resolves it; mowas_2 has no as64 layer (PORTA_TEXTURE_MISSING). A folder with no as64.exe
// and no --exe follows the vfs rule (mowas_2). --exe goh: one plain refusal line, exit 2. Writes only to a temp folder. Last line PASS or FAIL.
// Author: c-port3 (game parity batch)
// Author: Imperator_Aug (ARSENAL, ia-a0d3ab4c)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const T = path.join(__dirname, '..', 'portasset.js');
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'portasset-exe-'));
let bad = 0;
const ok = (c, m, x) => { console.log((c ? 'ok   ' : 'FAIL ') + m + (c || !x ? '' : '  ' + String(x).slice(0, 400))); if (!c) bad++; };
const put = (rel, s) => { const f = path.join(W, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
try {
  for (const g of ['g', 'g2']) { put(g + '/mowas_2.exe', 'x'); put(g + '/resource/texture/common/base.dds', 'DDS base'); put(g + '/as64/core/resource/texture/common/coretex.dds', 'DDS core'); }
  put('g/as64.exe', 'x');   // g = AS2 install with AS64; g2 = MoW:AS2 only (no as64.exe; as64 folder left over)
  put('mod/resource/entity/u/u.mtl', '{material "bump"\r\n\t{diffuse "$/coretex"}\r\n\t{bump "$/base"}\r\n}\r\n');
  const M = path.join(W, 'mod');
  const run = (g, ...a) => cp.spawnSync(process.execPath, [T, M, '--game', path.join(W, g), '-q', ...a], { encoding: 'utf8' });
  const miss = r => /PORTA_TEXTURE_MISSING/.test(r.stdout) && /coretex/.test(r.stdout);
  const none = run('g'), a64 = run('g', '--exe', 'as64'), mow = run('g', '--exe', 'mowas_2'), mow2 = run('g', '--exe', 'mowas2'), g2 = run('g2'), g2a = run('g2', '--exe', 'as64');
  ok(!miss(none) && none.status === 0, 'no --exe, as64.exe in the folder: as64 layers read, the core texture resolves', none.stdout + none.stderr);
  ok(a64.stdout === none.stdout, '--exe as64 = no --exe, same bytes', a64.stdout);
  ok(miss(mow) && mow.status === 1 && mow2.stdout === mow.stdout, '--exe mowas_2 / mowas2: no as64 layer, the core texture is a miss', mow.stdout + mow.stderr);
  ok(miss(g2) && !miss(g2a), 'no as64.exe and no --exe: the vfs rule (mowas_2); --exe as64 there reads the as64 layers', g2.stdout + '|' + g2a.stdout);
  ok(!/base/.test(mow.stdout), 'the base texture resolves for every build');
  const gr = run('g', '--exe', 'goh');
  ok(gr.status === 2 && /^portasset: not available for GoH: .*\(plan\/reports\/game-parity\/t-port-b\.md: n\/a \(source game\)\)\s*$/.test(gr.stderr), '--exe goh: one plain line, exit 2', gr.status + ' ' + gr.stderr);
  ok(run('g', '--exe', 'as3').status === 2, '--exe bad value: exit 2');
} finally { fs.rmSync(W, { recursive: true, force: true }); }
console.log(bad ? 'FAIL' : 'PASS');
process.exitCode = bad ? 1 : 0;
