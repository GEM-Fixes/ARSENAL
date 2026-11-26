// doctor read once phase 2, lib/modset): the shared pass gives the same report, per-tool output files
// --locs-json as every linter as its own program (--no-read-once); ARSENAL_READ_ONCE=0 = off; a forced failure in the pass
// (DOCTOR_TEST_RO_FAIL: throw, out of memory, an output cut short, the whole pass) reruns that linter as a program with a
// READ_ONCE fallback note and the same findings. Also: each module form (ctx.js) vs its CLI on the linter's own fixture.
//   node readonce-test.js <mod folder under <game>/mods> <work dir>   (run.sh passes the binhdr fixture mod)
// Author: Imperator_Aug (ARSENAL, ia-a071bd4a)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const [mod, work] = process.argv.slice(2), DOC = path.join(__dirname, '..', 'doctor.js'), TOOLS = path.join(__dirname, '..', '..');
let bad = 0;
const fail = m => { console.log('FAIL: read-once ' + m); bad++; };
const doc = (tag, args, env) => {
  const out = path.join(work, 'ro-' + tag);
  fs.rmSync(out, { recursive: true, force: true });
  const r = cp.spawnSync(process.execPath, [DOC, mod, '--locs', '5', '--locs-json', out + '.json', '--out', out, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  const files = {};
  for (const f of fs.readdirSync(out)) if (f.endsWith('.txt')) files[f] = fs.readFileSync(path.join(out, f), 'utf8');
  const lj = JSON.parse(fs.readFileSync(out + '.json', 'utf8')); delete lj.j;
  return { report: r.stdout, files, lj, err: r.stderr };
};
// the report without what may differ by the way it ran: seconds, the READ_ONCE notes, the notes count, the RAM plan line
const norm = s => s.split('\n').filter(l => !/^(READ_ONCE|JOBS) /.test(l)).map(l => l.replace(/\(\d+s\)$/, '').replace(/\d+ notes · full outputs: .*$/, 'N notes')).join('\n');
const same = (a, b, what, loose) => {
  const L = x => JSON.stringify(x.lj, (k, v) => (loose && k === 'reran' ? undefined : v));   // an out-of-memory fallback is a rerun alone
  if (norm(a.report) !== norm(b.report)) fail(what + ': report differs:\n' + a.report + '\n---\n' + b.report);
  if (JSON.stringify(a.files) !== JSON.stringify(b.files)) fail(what + ': per-tool output files differ: ' + Object.keys(a.files).filter(k => a.files[k] !== b.files[k]).join(', '));
  if (L(a) !== L(b)) fail(what + ': --locs-json differs');
};
const old = doc('old', ['--no-read-once']), ro = doc('on', []);
if (!/^READ_ONCE on: (?=.*\bmilint\b)(?=.*\bhumlint\b).* in one pass; others as programs$/m.test(ro.report)) fail('no READ_ONCE on note: ' + ro.report);
if (!/^READ_ONCE off \(--no-read-once\): every linter ran as its own program$/m.test(old.report)) fail('no READ_ONCE off note: ' + old.report);
if (!/^milint +\d/m.test(ro.report) || !/^humlint +\d/m.test(ro.report)) fail('no milint / humlint line: ' + ro.report);
same(ro, old, 'on vs --no-read-once');
const env0 = doc('env0', [], { ARSENAL_READ_ONCE: '0' });
if (!/^READ_ONCE off \(ARSENAL_READ_ONCE=0\)/m.test(env0.report)) fail('ARSENAL_READ_ONCE=0: ' + env0.report);
// forced failures: fallback note, same findings
for (const [hook, want] of [['milint', /^READ_ONCE fallback milint: forced failure \(test hook\); ran alone as its own program$/m],
  ['humlint:oom', /^READ_ONCE fallback humlint: out of memory; ran alone as its own program$/m],
  ['milint:partial', /^READ_ONCE fallback milint: incomplete output \(no "N findings" line\)/m],
  ['*', /^READ_ONCE fallback humlint: the shared pass failed/m]]) {
  const f = doc('fail-' + hook.replace(/\W/g, '_'), [], { DOCTOR_TEST_RO_FAIL: hook });
  if (!want.test(f.report)) fail(`${hook}: no fallback note: ` + f.report);
  same(f, old, 'fallback ' + hook, true);
}
// the module form vs the CLI on each linter's own fixture (stdout and stderr byte for byte)
const modset = require('../../lib/modset');
const fx = [['milint', () => { cp.execFileSync(process.execPath, ['mkfixture.js'], { cwd: path.join(TOOLS, 'milint', 'test'), env: { ...process.env, TEST_WORK: work } }); return path.join(work, 'fixture', 'mod'); }],
  ['humlint', () => { cp.execFileSync(process.execPath, ['mkfixture.js'], { cwd: path.join(TOOLS, 'humlint', 'test') }); return path.join(TOOLS, 'humlint', 'test', 'fixture', 'mod'); }]];
(async () => {
  // the load check's listing (wouldload --keep-out writes D/listing.json; tools/check): doctor --reuse-dir D hands it to the pass
  // (stats listing handed); none by END, or "null" = the pass lists the mod itself (scanned). Same outputs either way
  const T = await require('../../lib/modtree').scan(path.resolve(mod)), only = ['--only', 'milint,humlint'];
  const rdir = (name, body) => { const d = path.join(work, 'rd-' + name); fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); if (body !== undefined) fs.writeFileSync(path.join(d, 'listing.json'), body); fs.writeFileSync(path.join(d, 'END'), ''); return d; };
  const base = doc('only-old', [...only, '--no-read-once']);
  for (const [name, body, want] of [['handed', JSON.stringify(T), 'handed'], ['none', undefined, 'scanned'], ['null', 'null', 'scanned'], ['other', JSON.stringify({ ...T, dir: work }), 'scanned']]) {
    const r = doc('reuse-' + name, [...only, '--reuse-dir', rdir(name, body)], { DOCTOR_RO_STATS: '1' });
    if (!new RegExp(`"listing":"${want}"`).test(r.err)) fail(`--reuse-dir listing ${name}: not ${want}: ${r.err}`);
    same(r, base, '--reuse-dir listing ' + name);
  }
  for (const [tool, make] of fx) {
    const m = make();
    for (const argv of [[m, '-q'], [m]]) {
      const c = cp.spawnSync(process.execPath, [path.join(TOOLS, tool, tool + '.js'), ...argv], { encoding: 'utf8' });
      const p = modset.pass({ folder: m }), r = await p.run({ tool, file: modset.formOf(tool), argv });
      p.close();
      if (!r.ok) fail(`${tool} ${argv.join(' ')}: pass run failed: ${r.why}`);
      else if (r.out !== c.stdout || r.err !== c.stderr) fail(`${tool} ${argv.join(' ')}: module form output differs from the CLI:\n${r.out}\n---\n${c.stdout}`);
      else if (!/^[1-9]\d* findings$/m.test(r.out)) fail(`${tool}: fixture gave no findings`);
    }
  }
  console.log(bad ? 'FAIL' : 'PASS');
  process.exitCode = bad ? 1 : 0;
})();
