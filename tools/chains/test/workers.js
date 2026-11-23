// --workers test: stubbed step runner; two chains must never share a mod folder, testrun steps get --inst <worker>,
// a failing chain does not stop the others, merged report + separate step logs.
// Author: Imperator_Aug (ARSENAL, ia-8d22d47a)
const fs = require('fs'), path = require('path');
const { run } = require('../chains');
const F = path.join(__dirname, 'fixture');
const bad = m => { console.error('FAIL: ' + m); process.exit(1); };
fs.mkdirSync(path.join(F, 'game/mods/e2e_test2'), { recursive: true });
fs.writeFileSync(path.join(F, 'game/mods/e2e_test2/mod.info'), '{Mod}\n');
const pc = path.join(F, 'parchains');
fs.rmSync(pc, { recursive: true, force: true }); fs.mkdirSync(pc, { recursive: true });
const mk = (n, steps) => fs.writeFileSync(path.join(pc, n + '.json'), JSON.stringify({ name: n, steps }));
const tr = ['--scenario', 'x.json', '--mods', '$MODNAME'];
mk('p1', [{ tool: 'echo', argv: ['$MOD'] }, { tool: 'testrun', argv: tr }]);
mk('p2', [{ tool: 'echo', argv: ['$MOD'] }, { tool: 'boom', argv: [] }, { tool: 'testrun', argv: tr }]);
mk('p3', [{ tool: 'echo', argv: ['$MOD'] }, { tool: 'testrun', argv: tr }]);
mk('p4', [{ tool: 'echo', argv: ['$MOD'] }, { tool: 'testrun', argv: tr }]);
mk('p5', [{ tool: 'echo', argv: ['$MOD'] }]);

const busy = {}, calls = [];
let clash = null;
const stub = async (step, argv, o, vars) => {
  calls.push({ chain: step.tool, mod: vars.MODNAME, w: vars.WORKER, argv });
  if (busy[vars.MOD] && busy[vars.MOD] !== vars.WORKER) clash = vars.MOD;
  busy[vars.MOD] = vars.WORKER;
  await new Promise(r => setTimeout(r, 15));
  if (busy[vars.MOD] !== vars.WORKER) clash = vars.MOD;
  const r = step.tool === 'boom' ? { exit: 3, out: 'boom' } : { exit: 0, out: 'ok ' + step.tool };
  return r;
};
(async () => {
  const base = ['--all', '--chains-dir', pc, '--tools-dir', path.join(F, 'tools'), '--game', path.join(F, 'game')];
  const out = path.join(__dirname, 'wrep.json'), logs = path.join(__dirname, 'wlogs');
  fs.rmSync(logs, { recursive: true, force: true });
  // chains of one worker run serially; track mod ownership per worker across chains
  const code = await run(base.concat(['--workers', '2', '--out', out, '--log-dir', logs, '-q']), { runStep: stub });
  if (clash) bad('two workers shared folder ' + clash);
  if (code !== 1) bad('exit must be 1 (p2 fails), got ' + code);
  const rep = JSON.parse(fs.readFileSync(out, 'utf8'));
  const by = n => rep.chains.find(c => c.name === n);
  const modOf = { p1: 'e2e_test', p2: 'e2e_test2', p3: 'e2e_test', p4: 'e2e_test2', p5: 'e2e_test' };
  for (const [n, m] of Object.entries(modOf)) if (by(n).mod !== m) bad(n + ' on ' + by(n).mod);
  if (by('p2').status !== 'fail' || by('p2').failedStep !== 2) bad('p2 should fail at step 2');
  if (by('p4').status !== 'pass' || by('p5').status !== 'pass' || by('p3').status !== 'pass') bad('failing chain stopped the others');
  const trs = calls.filter(c => c.chain === 'testrun');
  if (trs.length !== 3) bad('testrun calls ' + trs.length);
  for (const t of trs) { const i = t.argv.indexOf('--inst'); if (i < 0 || +t.argv[i + 1] !== t.w) bad('testrun without matching --inst: ' + t.argv.join(' ')); }
  if (!fs.existsSync(path.join(logs, 'p1.log')) || !fs.existsSync(path.join(logs, 'p2.log'))) bad('per-chain step logs');
  if (/### step 1/.test(fs.readFileSync(path.join(logs, 'p1.log'), 'utf8')) === false) bad('log content');
  if (fs.readFileSync(path.join(logs, 'p1.log'), 'utf8').includes('boom')) bad('logs mixed');
  // serial default: --inst 1 (never instance 0: the player's own mod list, ENG-26), one folder
  calls.length = 0;
  const c2 = await run(base.concat(['--mod', 'e2e_test', '-q']), { runStep: stub });
  if (c2 !== 1 || calls.some(c => c.tool === 'testrun' && c.argv.join(' ').indexOf('--inst 1') < 0)) bad('serial testrun must run on instance 1');
  if (calls.some(c => c.mod !== 'e2e_test')) bad('serial run used another folder');
  // 5 workers: each chain has its own folder e2e_test..e2e_test5 and instance 1..5
  calls.length = 0; clash = null; for (const k of Object.keys(busy)) delete busy[k];
  fs.writeFileSync(path.join(pc, "p5.json"), JSON.stringify({ name: "p5", steps: [{ tool: "echo", argv: ["$MOD"] }, { tool: "testrun", argv: tr }] }));
  const out5 = path.join(__dirname, "wrep5.json");
  await run(base.concat(["--workers", "5", "--out", out5, "--log-dir", logs, "-q"]), { runStep: stub });
  if (clash) bad("5 workers shared a folder " + clash);
  const r5 = JSON.parse(fs.readFileSync(out5, "utf8"));
  r5.chains.forEach((c, i) => { if (c.mod !== (i ? "e2e_test" + (i + 1) : "e2e_test") || c.worker !== i + 1) bad("5 workers: " + c.name + " on " + c.mod + " w" + c.worker); });
  for (const t of calls.filter(c => c.chain === "testrun")) { const i = t.argv.indexOf("--inst"); if (+t.argv[i + 1] !== t.w || t.w < 1) bad("5 workers --inst"); }
  fs.rmSync(out5, { force: true });
  // bad worker count
  console.log('workers OK');
})().catch(e => bad(e.stack));
