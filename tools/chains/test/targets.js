// --target test (game parity): $EXE/$TARGET/$EXEFILE/$BUILTIN vars, $EXEOPT/$TARGETOPT expand to nothing under as64, testrun n/a with
// the plain line on mowas2 (TST-19) and goh, chain games filter, GoH --mod rules (folder path outside the GoH install). stubbed runner.
// Author: Imperator_Aug (ARSENAL, ia-fec2409d)
const fs = require('fs'), path = require('path');
const { run, subst, expandOpts, gameVars } = require('../chains');
const F = path.join(__dirname, 'fixture');
const bad = m => { console.error('FAIL: ' + m); process.exit(1); };
const tc = path.join(F, 'tgtchains');
fs.rmSync(tc, { recursive: true, force: true }); fs.mkdirSync(tc, { recursive: true });
const mk = (n, o) => fs.writeFileSync(path.join(tc, n + '.json'), JSON.stringify(Object.assign({ name: n }, o)));
mk('t_as2', { steps: [
  { tool: 'echo', argv: ['$MOD', '--game', '$GAME', '$EXEOPT'] },
  { tool: 'echo', argv: ['$MOD', '$TARGETOPT', '--mods', '$BUILTIN$MODNAME'] },
  { tool: 'testrun', argv: ['--exe', '$GAME/$EXEFILE', '--mods', '$MODNAME'] },
  { tool: 'echo', argv: ['only-as64'], games: ['as64'], row: 'ROW-1' },
] });
mk('t_goh', { games: ['goh'], steps: [{ tool: 'echo', argv: ['$MOD', '--exe', '$EXE', '--target', '$TARGET', '--goh', '$GOH'] }] });
// a fake GoH install (outside the fake AS2 game)
fs.mkdirSync(path.join(F, 'gohgame/binaries/x64'), { recursive: true });
fs.writeFileSync(path.join(F, 'gohgame/binaries/x64/call_to_arms.exe'), 'MZ');
const free = path.join(__dirname, 'free_goh_mod');

// unit: vars and option tokens
const v64 = gameVars(), vm = gameVars('mowas2'), vg = gameVars('goh');
if (v64.EXE !== 'as64' || v64.EXEFILE !== 'as64.exe' || v64.BUILTIN !== 'as64+,') bad('as64 vars ' + JSON.stringify(v64));
if (vm.EXE !== 'mowas_2' || vm.TARGET !== 'mowas2' || vm.EXEFILE !== 'mowas_2.exe' || vm.BUILTIN !== '') bad('mowas2 vars ' + JSON.stringify(vm));
if (vg.EXE !== 'goh' || vg.EXEFILE !== 'binaries/x64/call_to_arms.exe') bad('goh vars');
if (expandOpts(['a', '$EXEOPT', '$TARGETOPT'], v64).join(' ') !== 'a') bad('as64 tokens must expand to nothing');
if (expandOpts(['a', '$EXEOPT', '$TARGETOPT'], vm).join(' ') !== 'a --exe $EXE --target $TARGET') bad('mowas2 tokens');
if (subst('$BUILTIN$MODNAME', Object.assign({ MODNAME: 'm' }, vm)) !== 'm' || subst('$BUILTIN$MODNAME', Object.assign({ MODNAME: 'm' }, v64)) !== 'as64+,m') bad('$BUILTIN');
if (subst('$GAME/$EXEFILE', Object.assign({ GAME: 'G' }, vm)) !== 'G/mowas_2.exe') bad('$EXEFILE');

const calls = [];
const stub = async (step, argv) => { calls.push({ tool: step.tool, argv: argv.join(' ') }); return { exit: 0, out: 'ok' }; };
(async () => {
  const base = ['--all', '--chains-dir', tc, '--tools-dir', path.join(F, 'tools'), '--game', path.join(F, 'game'), '--goh', path.join(F, 'gohgame'), '--mod', 'e2e_test'];
  const quiet = async (args) => { const l = console.log; const out = []; console.log = s => out.push(String(s)); try { return { code: await run(args, { runStep: stub }), out: out.join('\n') }; } finally { console.log = l; } };

  // as64 (default): argv as before, testrun runs (--inst 1), goh chain N/A
  let r = await quiet(base.concat(['--out', path.join(F, 'trep64.json')]));
  if (r.code !== 0) bad('as64 exit ' + r.code + '\n' + r.out);
  const c64 = calls.map(c => c.tool + ' ' + c.argv);
  if (!c64.some(s => /^echo \S+e2e_test --game \S+game$/.test(s))) bad('as64 $EXEOPT must add nothing: ' + c64.join(' | '));
  if (!c64.some(s => /--mods as64\+,e2e_test$/.test(s))) bad('as64 $BUILTIN');
  if (!c64.some(s => /^testrun --exe \S+as64\.exe --mods e2e_test --inst 1$/.test(s))) bad('as64 testrun argv');
  if (!c64.includes('echo only-as64')) bad('as64-only step must run on as64');
  if (!/chain t_goh: N\/A - chains: not available for AS64: chain t_goh is made for GoH/.test(r.out)) bad('goh chain on as64 must be N/A:\n' + r.out);
  if (JSON.parse(fs.readFileSync(path.join(F, 'trep64.json'), 'utf8')).target !== 'as64') bad('report target');
  fs.rmSync(path.join(F, 'trep64.json'), { force: true });

  // mowas2: --exe mowas_2 / --target mowas2 added, testrun n/a (TST-19), as64-only step n/a, exit 0
  calls.length = 0;
  r = await quiet(base.concat(['--target', 'mowas2']));
  if (r.code !== 0) bad('mowas2 exit ' + r.code + '\n' + r.out);
  const cm = calls.map(c => c.tool + ' ' + c.argv);
  if (!cm.some(s => /--game \S+game --exe mowas_2$/.test(s))) bad('mowas2 $EXEOPT: ' + cm.join(' | '));
  if (!cm.some(s => /--target mowas2 --mods e2e_test$/.test(s))) bad('mowas2 $TARGETOPT/$BUILTIN: ' + cm.join(' | '));
  if (cm.some(s => /^testrun/.test(s)) || cm.includes('echo only-as64')) bad('mowas2 ran an n/a step');
  if (!/N\/A testrun: not available for MoW:AS2: needs the control pipe and -instance, which mowas_2\.exe does not have \(TST-19\)/.test(r.out)) bad('mowas2 testrun line:\n' + r.out);
  if (!/N\/A echo: not available for MoW:AS2: this step of the chain is made for AS64 \(ROW-1\)/.test(r.out)) bad('games step line');
  if (!/chain t_as2: PASS 4\/4 steps \(2 n\/a on MoW:AS2\)/.test(r.out)) bad('mowas2 summary:\n' + r.out);

  // goh: only the goh chain runs; --mod bare name refused, inside GoH refused, outside both allowed
  const sp = require('child_process').spawnSync, C = path.join(__dirname, '..', 'chains.js');
  const g = (extra) => sp(process.execPath, [C, '--all', '--chains-dir', tc, '--tools-dir', path.join(F, 'tools'), '--game', path.join(F, 'game'), '--goh', path.join(F, 'gohgame'), '--target', 'goh', '-q'].concat(extra), { encoding: 'utf8' });
  let s = g(['--mod', 'e2e_test']);
  if (s.status !== 2 || !/must be a folder path outside the GoH install/.test(s.stderr)) bad('goh bare --mod must exit 2: ' + s.status + s.stderr);
  s = g(['--mod', path.join(F, 'gohgame', 'mods', 'x')]);
  if (s.status !== 2 || !/chains: not available for GoH: refusing --mod .* inside the GoH install.*\(lib\/writeguard\)/.test(s.stderr)) bad('goh --mod inside GoH must be refused: ' + s.stderr);
  s = g(['--mod', free, '--workers', '2']);
  if (s.status !== 2 || !/--workers must be 1/.test(s.stderr)) bad('goh --workers 2 must exit 2');
  calls.length = 0;
  r = await quiet(['--all', '--chains-dir', tc, '--tools-dir', path.join(F, 'tools'), '--goh', path.join(F, 'gohgame'), '--target', 'goh', '--mod', free]);
  if (r.code !== 0) bad('goh exit ' + r.code + '\n' + r.out);
  if (calls.length !== 1 || !/^echo \S+free_goh_mod --exe goh --target goh --goh \S+gohgame$/.test(calls[0].tool + ' ' + calls[0].argv)) bad('goh chain argv: ' + JSON.stringify(calls));
  if (!/chain t_as2: N\/A - chains: not available for GoH: chain t_as2 is made for AS64 and MoW:AS2; the GoH chain is goh-mod/.test(r.out)) bad('as2 chain on goh must be N/A:\n' + r.out);
  // dry on mowas2 lists the expanded flags (validation sees --exe)
  r = await quiet(base.concat(['--target', 'mowas2', '--dry']));
  if (!/echo\.js \S+e2e_test --game \S+game --exe mowas_2/.test(r.out) || !/CHAIN_FLAG_UNKNOWN step 1: echo source has no flag --exe/.test(r.out)) bad('mowas2 dry must show and check --exe:\n' + r.out);
  fs.rmSync(free, { recursive: true, force: true });
  console.log('targets PASS');
})().catch(e => bad(e.stack));
