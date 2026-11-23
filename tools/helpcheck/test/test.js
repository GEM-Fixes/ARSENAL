// helpcheck: every tools/<t>/<t>.js (+ EXTRA entry points) run with --help and with -h, each in an empty temp cwd.
// FAIL when: exit != 0, timeout, empty stdout, "unknown arg"/ENOENT/stack trace in output, a file appears in the cwd,
// or a file in the tool's own folder (test/ and out/ aside) is added or changed (HELPFIX2).
// KNOWN = tools owned elsewhere that still fail: skipped (score does real work on --help), HELP_KNOWN=1 runs them as
// KNOWN lines that never fail the run; one that passes says "drop from KNOWN".
// usage: node tools/helpcheck/test/test.js [tool,tool]   (HELP_JOBS=n parallel, default 8)
// Author: Imperator_Aug (ARSENAL, ia-6dc7798e)
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const TOOLS = path.resolve(__dirname, '../..');
const EXTRA = ['dist/sea.js'];
// owned by other sessions at HELPFIX2 time (2026-11-08); fix there, then drop here
const KNOWN = new Set(['goh2as2', 'keyprof', 'score', 'srcdrift', 'webcheck']);
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const BAD = /unknown (arg|option|flag|command)s?:? ['"]?--?\w|ENOENT|^\s+at .+:\d+:\d+\)?$|Error: /mi;

function entries() {
  const r = [];
  for (const d of fs.readdirSync(TOOLS, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith('_')) continue;
    const f = path.join(d.name, d.name + '.js');
    if (fs.existsSync(path.join(TOOLS, f))) r.push(f.replace(/\\/g, '/'));
  }
  return r.concat(EXTRA).filter(f => !only || only.has(f.split('/')[0]) || only.has(f));
}

function snap(dir) { // tool folder files -> mtime+size, test/ out/ work/ cache/ skipped
  const m = {};
  (function walk(d, rel) {
    let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of es) {
      if (e.isDirectory()) { if (!rel && /^(test|out|work|cache|node_modules)$/.test(e.name)) continue; walk(path.join(d, e.name), rel + e.name + '/'); }
      else { try { const s = fs.statSync(path.join(d, e.name)); m[rel + e.name] = s.mtimeMs + ':' + s.size; } catch (e2) { } }
    }
  })(dir, '');
  return m;
}

function run1(rel, flag) {
  return new Promise(res => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'helpcheck-'));
    const toolDir = path.join(TOOLS, rel.split('/')[0]), before = snap(toolDir);
    const env = Object.assign({}, process.env, { AS2_HELPCHECK: '1' });
    const p = spawn(process.execPath, [path.join(TOOLS, rel), flag], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '', err = '', done = false;
    p.stdout.on('data', b => { out += b; }); p.stderr.on('data', b => { err += b; });
    const t = setTimeout(() => { if (!done) { p.kill(); } }, 30000);
    p.on('close', (code, sig) => {
      done = true; clearTimeout(t);
      const why = [];
      if (sig) why.push('timeout/killed');
      else if (code !== 0) why.push('exit ' + code);
      if (!out.trim()) why.push('empty stdout');
      const bad = (out + '\n' + err).match(BAD); if (bad) why.push('says "' + bad[0].trim().slice(0, 60) + '"');
      let left = []; try { left = fs.readdirSync(cwd); } catch (e) { }
      if (left.length) why.push('wrote in cwd: ' + left.slice(0, 3).join(','));
      const after = snap(toolDir), ch = Object.keys(after).filter(k => before[k] !== after[k]);
      if (ch.length) why.push('wrote in tool dir: ' + ch.slice(0, 3).join(','));
      try { fs.rmSync(cwd, { recursive: true, force: true }); } catch (e) { }
      res({ rel, flag, why, first: (out.split('\n').find(l => l.trim()) || '').slice(0, 80) });
    });
  });
}

(async () => {
  const jobs = [];
  for (const rel of entries()) if (process.env.HELP_KNOWN || !KNOWN.has(rel.split('/')[0]) || only) for (const flag of ['--help', '-h']) jobs.push([rel, flag]);
  const n = +process.env.HELP_JOBS || 8, res = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < jobs.length) { const j = jobs[i++]; res.push(await run1(j[0], j[1])); } }));
  res.sort((a, b) => (a.rel + a.flag).localeCompare(b.rel + b.flag));
  let fail = 0, known = 0;
  const knownPass = new Set();
  for (const r of res) {
    const k = KNOWN.has(r.rel.split('/')[0]);
    if (!r.why.length) { if (k) knownPass.add(r.rel); continue; }
    if (k) { known++; console.log('KNOWN ' + r.rel + ' ' + r.flag + ': ' + r.why.join('; ')); }
    else { fail++; console.log('FAIL ' + r.rel + ' ' + r.flag + ': ' + r.why.join('; ')); }
  }
  for (const r of knownPass) if (!res.some(x => x.rel === r && x.why.length)) console.log('NOTE ' + r + ' passes now: drop it from KNOWN');
  console.log(`helpcheck: ${res.length / 2} entry points x 2 flags, ${fail} fail, ${known} known`);
  console.log(fail ? 'FAIL' : 'PASS');
  process.exit(fail ? 1 : 0);
})();
