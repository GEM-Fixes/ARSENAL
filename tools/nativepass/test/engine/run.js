// nativepass test runner: engine cases (test/engine/cases.json), then rule cases (test/rules/<name>.json against rules/<name>.json).
//   node run.js [name]   name = only test/rules/<name>.json (engine cases still run). Writes nothing. Last line PASS or FAIL.
// engine case: {name, class, def, files?{rel:text}, vanilla?{key:text}, rules:[row], expect, expectFiles?{rel:text},
//   applied?:n, skipped?:[why substring], crlf?:true (def/files/expect get \r\n, compared as bytes), raw?:true (text is latin1 bytes)}
// rule case:   {name, class, def, expect}  LF-normalised exact compare of the unit def after the pass.
// Author: Imperator_Aug (ARSENAL, ia-d7a124cb)
'use strict';
const fs = require('fs'), path = require('path');
const NP = require('../../nativepass.js');
const HERE = __dirname, ROOT = path.join(HERE, '..', '..');
const only = process.argv[2];
let fails = 0, n = 0;
const fail = (c, m) => { fails++; console.log('FAIL ' + c + ': ' + m); };
const B = (s, crlf) => Buffer.from(crlf ? s.replace(/\r?\n/g, '\r\n') : s, 'latin1');
const lf = b => b.toString('latin1').replace(/\r\n/g, '\n');

function runCase(c, rules, crlf) {
  const stem = 'u_' + String(c.name).replace(/[^a-z0-9_]/gi, '_').toLowerCase();
  const rel = 'resource/entity/-vehicle/' + c.class + '/' + stem + '/' + stem + '.def';
  const files = new Map([[rel, B(c.def, crlf)]]);
  for (const [k, v] of Object.entries(c.files || {})) files.set(k, B(v, crlf));
  const van = new Map(Object.entries(c.vanilla || {}).map(([k, v]) => [k, B(v, crlf)]));
  const res = NP.core(files, { rules: [{ file: 'case.json', rows: rules }], classOf: () => c.class, vanilla: k => van.get(k) || null });
  return { rel, res };
}

// engine
const cases = JSON.parse(fs.readFileSync(path.join(HERE, 'cases.json'), 'utf8'));
for (const c of cases) {
  n++;
  try {
    const { rel, res } = runCase(c, c.rules, c.crlf);
    const got = res.out.get(rel), u = res.record.units[0];
    if (c.expect !== undefined) {
      const ok = c.crlf ? got.equals(B(c.expect, true)) : lf(got) === c.expect.replace(/\r\n/g, '\n');
      if (!ok) { fail(c.name, 'def differs\n--- got\n' + lf(got) + '\n--- want\n' + c.expect); continue; }
    }
    let bad = false;
    for (const [k, v] of Object.entries(c.expectFiles || {})) {
      const g = res.out.get(k);
      if (!g || (c.crlf ? !g.equals(B(v, true)) : lf(g) !== v)) { fail(c.name, k + ' differs\n--- got\n' + (g ? lf(g) : '(none)') + '\n--- want\n' + v); bad = true; }
    }
    if (bad) continue;
    if (c.applied !== undefined && u.applied.length !== c.applied) { fail(c.name, 'applied ' + u.applied.length + ' want ' + c.applied + ' ' + JSON.stringify(u)); continue; }
    const whys = u.skipped.map(s => s.why).join(' | ');
    const miss = (c.skipped || []).filter(w => !whys.includes(w));
    if (miss.length) { fail(c.name, 'skip why missing: ' + miss.join(', ') + ' (got: ' + whys + ')'); continue; }
    if (c.twice) {   // two runs give equal bytes
      const b = runCase(c, c.rules, c.crlf).res;
      if (JSON.stringify(b.record) !== JSON.stringify(res.record) || [...b.out].some(([k, v]) => !v.equals(res.out.get(k)))) { fail(c.name, 'two runs differ'); continue; }
    }
    console.log('ok   ' + c.name);
  } catch (e) { fail(c.name, e.stack); }
}

// rule cases
const RT = path.join(HERE, '..', 'rules'), RD = path.join(ROOT, 'rules');
const names = fs.existsSync(RT) ? fs.readdirSync(RT).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort() : [];
if (only && !names.includes(only)) fail(only, 'no test/rules/' + only + '.json');
for (const nm of names) {
  if (only && nm !== only) continue;
  const rf = path.join(RD, nm + '.json');
  if (!fs.existsSync(rf)) { fail(nm, 'no rules/' + nm + '.json'); continue; }
  let rules, list;
  try { rules = NP.loadRules(rf); list = JSON.parse(fs.readFileSync(path.join(RT, nm + '.json'), 'utf8')); } catch (e) { fail(nm, 'unreadable: ' + e.message); continue; }
  const chk = NP.checkRules(rules);
  if (chk.bad.length) fail(nm, 'bad rows: ' + JSON.stringify(chk.bad));
  for (const c of list) {
    n++;
    try {
      const stem = 'u_' + String(c.name).replace(/[^a-z0-9_]/gi, '_').toLowerCase();
      const rel = 'resource/entity/-vehicle/' + c.class + '/' + stem + '/' + stem + '.def';
      const res = NP.core(new Map([[rel, Buffer.from(c.def, 'latin1')]]), { rules, classOf: () => c.class });
      const got = lf(res.out.get(rel)), want = c.expect.replace(/\r\n/g, '\n');
      if (got !== want) { fail(nm + '/' + c.name, 'def differs\n--- got\n' + got + '\n--- want\n' + want + '\n--- record ' + JSON.stringify(res.record.units[0])); continue; }
      console.log('ok   ' + nm + '/' + c.name);
    } catch (e) { fail(nm + '/' + c.name, e.stack); }
  }
}
// game parity: --exe. a made-up AS2 install (as64.exe + mowas_2.exe) whose include only as64/core holds; the CLI refuses goh
if (!only) {
  const os = require('os'), cp = require('child_process'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nativepass-exe-'));
  const put = (rel, s) => { const f = path.join(tmp, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s.replace(/\n/g, '\r\n'), 'latin1'); };
  try {
    put('game/as64.exe', 'x'); put('game/mowas_2.exe', 'x');
    put('game/resource/entity/inc/base.inc', '{base}\n'); put('game/as64/core/resource/entity/inc/core.inc', '{core}\n');
    const g = path.join(tmp, 'game'), K = 'resource/entity/inc/core.inc', B0 = 'resource/entity/inc/base.inc';
    const rd = NP.vanillaReader(g), r6 = NP.vanillaReader(g, 'as64'), rm = NP.vanillaReader(g, 'mowas_2');
    n++; if (rd(K) && r6(K) && rd(B0)) console.log('ok   exe: no --exe and --exe as64 read the as64/core include as vanilla'); else fail('exe as64', 'core include not read');
    n++; if (!rm(K) && rm(B0)) console.log('ok   exe: --exe mowas_2 reads base only (no as64/core in MoW:AS2)'); else fail('exe mowas_2', 'core include read or base missing');
    put('mod/resource/entity/-vehicle/tank/u/u.def', '{game_entity}\n');
    const run = args => cp.spawnSync('node', [path.join(ROOT, 'nativepass.js'), path.join(tmp, 'mod'), '--dry', ...args], { encoding: 'utf8' });
    const gr = run(['--exe', 'goh']);
    n++; if (gr.status === 2 && /^nativepass: not available for GoH: .*\(plan\/reports\/game-parity\/t-port-b\.md: n\/a \(source game\)\)/m.test(gr.stderr)) console.log('ok   exe: --exe goh refused, one plain line, exit 2'); else fail('exe goh', gr.status + ' ' + gr.stderr);
    const bad = run(['--exe', 'as3']);
    n++; if (bad.status === 2) console.log('ok   exe: a bad --exe value exits 2'); else fail('exe bad', String(bad.status));
    const mr = run(['--exe', 'mowas2', '--game', g]);
    n++; if (mr.status === 0 && /nativepass: 1 units/.test(mr.stderr)) console.log('ok   exe: --exe mowas2 --game runs dry'); else fail('exe mowas2 run', mr.status + ' ' + mr.stderr);
    // CLI path --exe -> vanillaReader: a unit includes the core-only include; a rule drops its key. as64: skipped as vanilla; mowas_2: not vanilla
    for (const p of ['p1', 'p2', 'p3']) put('game/resource/entity/-vehicle/tank_medium/' + p + '/' + p + '.def', '{game_entity\n\t{mass 1}\n}\n');   // 3 vanilla peers: the class is known
    put('mod2/resource/entity/-vehicle/tank_medium/w/w.def', '{game_entity\n\t(include "/entity/inc/core.inc")\n}\n');
    put('rules2.json', '{"form":"nativerules/1","rules":[{"id":"x-01","key":"entity/core","class":"*","act":"drop","why":"t","src":"test","tag":"I"}]}\n');
    const skips = args => { const r = cp.spawnSync('node', [path.join(ROOT, 'nativepass.js'), path.join(tmp, 'mod2'), '--dry', '--game', g, '--rules', path.join(tmp, 'rules2.json'), ...args], { encoding: 'utf8' });
      if (r.status !== 0) return 'exit ' + r.status + ' ' + r.stderr; return JSON.parse(r.stdout).units.flatMap(u => u.skipped.map(s => s.why)).join(' | '); };
    const sn = skips([]), s6 = skips(['--exe', 'as64']), sm = skips(['--exe', 'mowas_2']);
    n++; if (/vanilla include/.test(sn) && /vanilla include/.test(s6) && !/vanilla include/.test(sm)) console.log('ok   exe: CLI --exe reaches the vanilla reader (core include vanilla under as64 and no --exe, not under mowas_2)'); else fail('exe cli vanilla', JSON.stringify([sn, s6, sm]));
  } catch (e) { fail('exe', e.stack); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
console.log(n + ' cases, ' + fails + ' failed');
console.log(fails ? 'FAIL' : 'PASS');
process.exitCode = fails ? 1 : 0;
