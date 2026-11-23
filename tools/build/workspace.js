// build --workspace <dir>: dir holds several mod folders. Reads each mod.info {Require "name"} (name part before ':'; VFS-17),
// orders them topologically (requires first, ties alphabetical), builds each with build.js (same flags), reports
//   BUILD_REQUIRE_MISSING  require names no sibling folder (as64+ is built-in, VFS-47: not looked up) -> mod still built
//   BUILD_REQUIRE_CYCLE    mods in a require cycle -> not built
// output: per-mod build output, then `<mod>/mod.info:<line>: CODE msg` lines + `N findings`. exit 1 on any finding or failed build.
// Author: Imperator_Aug (ARSENAL, ia-42cc99f9)
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const BUILTIN = new Set(['as64+']);

function readRequires(mi) {
  const out = [];
  const lines = fs.readFileSync(mi).toString('latin1').split(/\r?\n/);
  lines.forEach((l, i) => { const re = /\{\s*Require\s+"((?:[^"\\]|\\.)*)"/gi; let m; while ((m = re.exec(l))) out.push({ name: m[1].split(':')[0].trim(), line: i + 1 }); });
  return out;
}

function plan(ws) {
  const mods = new Map(); // lc name -> {name, dir, req}
  for (const e of fs.readdirSync(ws, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const mi = path.join(ws, e.name, 'mod.info');
    if (fs.existsSync(mi)) mods.set(e.name.toLowerCase(), { name: e.name, dir: path.join(ws, e.name), req: readRequires(mi) });
  }
  const findings = [], order = [], state = new Map();
  const names = [...mods.values()].map(m => m.name).sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1);
  const cyc = new Set();
  const visit = (m, stack) => {
    const k = m.name.toLowerCase();
    if (state.get(k) === 2) return;
    if (state.get(k) === 1) {
      const cycle = stack.slice(stack.findIndex(x => x.toLowerCase() === k));
      for (const c of cycle) cyc.add(c.toLowerCase());
      const r = m.req.find(q => q.name.toLowerCase() === (stack[stack.indexOf(m.name) + 1] || cycle[0]).toLowerCase()) || m.req[0];
      findings.push({ file: m.name + '/mod.info', line: r ? r.line : 0, code: 'BUILD_REQUIRE_CYCLE', msg: `require cycle ${[...cycle, m.name].join(' -> ')}; these mods are not built` });
      return;
    }
    state.set(k, 1);
    for (const r of m.req) {
      const d = mods.get(r.name.toLowerCase());
      if (d) visit(d, [...stack, m.name]);
      else if (!BUILTIN.has(r.name.toLowerCase())) findings.push({ file: m.name + '/mod.info', line: r.line, code: 'BUILD_REQUIRE_MISSING', msg: `required mod "${r.name}" is not a folder in the workspace (engine skips it, VFS-17)` });
    }
    state.set(k, 2);
    order.push(m);
  };
  for (const n of names) visit(mods.get(n.toLowerCase()), []);
  return { order: order.filter(m => !cyc.has(m.name.toLowerCase())), findings, cyc };
}

function run(o, argv) {
  const ws = path.resolve(o.ws || '');
  if (!o.ws || !fs.existsSync(ws) || !fs.statSync(ws).isDirectory()) { console.error('usage: build.js --workspace <dir of mod folders> [build flags]'); process.exit(2); }
  const { order, findings, cyc } = plan(ws);
  const pass = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--workspace' || argv[i] === '--out') { i++; continue; }
    pass.push(argv[i]);
  }
  let failed = 0;
  console.log(`workspace ${ws}: build order ${order.map(m => m.name).join(', ') || '(none)'}`);
  for (const m of order) {
    console.log(`=== ${m.name}`);
    const a = [path.join(__dirname, 'build.js'), m.dir, ...pass];
    if (o.out) a.push('--out', path.join(path.resolve(o.out), m.name));
    const r = spawnSync(process.execPath, a, { stdio: 'inherit' });
    if (r.status !== 0) { failed++; console.log(`${m.name}: BUILD_FAILED exit ${r.status}`); }
  }
  for (const f of findings) console.log(`${f.file}:${f.line}: ${f.code} ${f.msg}`);
  console.log(`${findings.length} findings` + (failed ? ` (${failed} mod build${failed > 1 ? 's' : ''} failed)` : ''));
  process.exit(findings.length || failed ? 1 : 0);
}
module.exports = { run, plan };
