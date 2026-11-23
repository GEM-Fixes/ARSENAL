#!/usr/bin/env node
// golden: every tool on vanilla + a fixed mod set → finding counts by code (opt #32 = #8). diff mode (default) prints only
// what moved vs golden.json and exits 1 on any change; --update rewrites it. machine-local (needs the game): not in test-all.
//   node golden.js [--game dir] [--exe as64|mowas2|mowas_2|goh] [--update] [--only name,..] [--config f] [--out f] [-j N]
// config: runs.json {name: [tool, ...args]}; ${GAME} → game dir; ${EXE} → the vfs exe (as64 | mowas_2 | goh, lib/games; as64 when no
// --exe); tool = tools/<tool>/<tool>.js (or a .js path rel. to config). finding lines =
// `path[:line]: CODE msg` (lib/report contract); info lines and summaries are not counted
// --exe: the game whose counts are taken. as64 (or none): runs.json → golden.json, as before. mowas2: runs.mowas2.json → golden.mowas2.json
//   (the shared AS2 install read as mowas_2: no as64/core, lib/vfs.js picks as64 whenever as64.exe is there and no exe is named).
//   goh: runs.goh.json → golden.goh.json, game dir = --game, else the GoH install (lib/games install: GOH_GAME, as2.json "goh", Steam).
//   --config / --out still override the file names.
// Author: Imperator_Aug (ARSENAL, ia-8fe4e346)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), { spawn } = require('child_process'), { countOutput } = require('../lib/report');

const argv = process.argv.slice(2), o = { j: 3 };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--game') o.game = argv[++i];
  else if (a === '--update') o.update = true;
  else if (a === '--only') o.only = new Set(argv[++i].split(','));
  else if (a === '--config') o.config = argv[++i];
  else if (a === '--out') o.out = argv[++i];
  else if (a === '-j') o.j = +argv[++i];
  else if (a === '--exe') o.exe = argv[++i];
  else { console.error(`unknown arg ${a}`); process.exit(2); }
}
const games = require('../lib/games');
const G = o.exe === undefined ? null : games.get(o.exe);
if (o.exe !== undefined && !G) { console.error(`--exe must be one of as64, mowas2, mowas_2, goh (got ${o.exe})`); process.exit(2); }
const sfx = G && G.id !== games.DEFAULT ? '.' + G.id : '';   // as64 keeps runs.json / golden.json
const tools = path.join(__dirname, '..');
const game = o.game || (G && G.kind === 'goh' ? games.install('goh').dir : process.env.AS2_GAME || require('../lib/gamedir').resolve().dir);
if (!game && G && G.kind === 'goh') { console.error('golden: no Gates of Hell install found: name it with --game'); process.exit(2); }
const EXE = G ? G.exe : 'as64';
const cfg = o.config || path.join(__dirname, `runs${sfx}.json`), runs = JSON.parse(fs.readFileSync(cfg, 'utf8'));
const outF = o.out || path.join(__dirname, `golden${sfx}.json`);
const gold = fs.existsSync(outF) ? JSON.parse(fs.readFileSync(outF, 'utf8')) : {};

const count = text => { const { total, codes } = countOutput(text); return { total, codes }; };
function run(name, [tool, ...args]) {
  const script = tool.endsWith('.js') ? path.resolve(path.dirname(cfg), tool) : path.join(tools, tool, `${tool}.js`);
  const t0 = Date.now();
  return new Promise(res => {
    const p = spawn(process.execPath, [script, ...args.map(a => a.replace(/\$\{GAME\}/g, game).replace(/\$\{EXE\}/g, EXE))], { cwd: path.join(tools, '..') });
    let out = '', err = '';
    p.stdout.on('data', d => (out += d));
    p.stderr.on('data', d => (err += d));
    p.on('close', code => res({ name, ...count(out), sec: Math.round((Date.now() - t0) / 1000), err: code > 1 || (code && !out) ? `exit ${code}: ${err.trim().split('\n').pop()}` : null }));
  });
}

(async () => {
  const names = Object.keys(runs).filter(n => !o.only || o.only.has(n)), got = {}, queue = [...names];
  await Promise.all(Array.from({ length: Math.max(1, o.j) }, async () => {
    while (queue.length) { const n = queue.shift(); got[n] = await run(n, runs[n]); }
  }));
  let diffs = 0;
  for (const n of names) {
    const g = got[n], w = gold[n];
    if (g.err) { console.log(`${n}: ERROR ${g.err}`); diffs++; continue; }
    if (!w) { console.log(`${n}: new ${g.total} (${g.sec}s)`); diffs++; continue; }
    const moved = [...new Set([...Object.keys(g.codes), ...Object.keys(w.codes)])]
      .filter(c => (g.codes[c] || 0) !== (w.codes[c] || 0)).sort()
      .map(c => `${c} ${w.codes[c] || 0}→${g.codes[c] || 0}`);
    if (g.total !== w.total || moved.length) { console.log(`${n}: ${w.total}→${g.total} | ${moved.join(' ')}`); diffs++; }
    else console.log(`${n}: ${g.total} same (${g.sec}s)`);
  }
  if (o.update) {
    const next = { ...gold };
    for (const n of names) if (!got[n].err) next[n] = { total: got[n].total, codes: Object.fromEntries(Object.entries(got[n].codes).sort()) };
    fs.writeFileSync(outF, JSON.stringify(Object.fromEntries(Object.entries(next).sort()), null, 1) + '\n');
    console.log(`golden: ${names.length} runs written → ${path.relative(process.cwd(), outF)}`);
  } else if (diffs) { console.log(`${diffs} runs differ (check, then --update)`); process.exitCode = 1; }
})();
