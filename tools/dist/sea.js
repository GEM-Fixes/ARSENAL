#!/usr/bin/env node
// Build tools/dist/out/ARSENAL.exe (A.R.S.E.N.A.L; was as2.exe) = single-file ARSENAL via node SEA (`node --build-sea`, node >= 25/26; no postject).
// Design: ONE exe, no tools folder. tools/**/*.js (minus test/cache) + INDEX.md embedded as assets; sea-main.js runs the
// tool in-process through a mini module loader. Limits: dev tools needing webs (q, rows, ...) and mcp refuse; tools that
// read files next to their source at runtime only see embedded assets (js/json/INDEX.md).
// usage: node tools/dist/sea.js [--out dir] [--name ARSENAL] [--drop tool,tool] [--module-only tool,tool] [--manifest-only] | --help
//   --manifest-only: write <out>/manifest.json (the embedded files list) and stop, no exe (the small package's tools/ is this list)
// Author: Imperator_Aug (ARSENAL, ia-1914ead7)
require('../lib/help')(__filename); // --help / -h: this header, exit 0, nothing built (HELPFIX2)
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const TOOLS = path.join(__dirname, '..');
const SKIP = new Set(['test', 'cache', 'node_modules', 'dist', 'out', 'work', '_retired']);
const SKIPFILE = /^(package(-lock)?|REPORT(-[\w.-]+)?)\.json$/; // REPORT.json, REPORT-<part>.json = dev run logs with local paths/counts, not tool code
// test files that sit outside a test/ folder: any *.test.js (GUI ext sub-part tests, recipe tests, cards.test.js) and a GUI
// ext's own top-level test.js and its parts test-<name>.js (gui/ext/<id>/test.js, gui/ext/<id>/test-games.js: test.js runs them as
// child processes and they may require gui/test/ helpers, which are never embedded). Nothing requires them at run time; the exe never runs them.
const SKIPTEST = (rel, name) => /\.test\.js$/.test(name) || (/^test(-[\w.-]+)?\.js$/.test(name) && /^gui\/ext\/[^/]+\/$/.test(rel));

// BAK: backup copies (a `.bak` folder such as rows/.bak, any *.bak folder or file) are never shipped, in the exe nor the small package
const BAK = /\.bak$/i;
function collect(dir, rel, acc, DROP) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (BAK.test(e.name)) continue;
    if (e.isDirectory()) { if (!SKIP.has(e.name) && !(rel === '' && DROP.has(e.name))) collect(path.join(dir, e.name), rel + e.name + '/', acc, DROP); }
    else if (/\.(js|json|txt|yaml|md|set)$/.test(e.name) && !SKIPFILE.test(e.name) && !SKIPTEST(rel, e.name)) acc.push(rel + e.name); // GUI-4: tools read .txt/.yaml/.md data next to their source; L7-CLEAN: .set (prove --plan reads testrun/scenarios/mods/mis-08/.../combat.set)
  }
  return acc;
}
// manifestKeys(root, drop) -> the embedded files list (paths rel root, sorted). The exe embeds exactly these; zip.js --small ships them as tools/<key>.
function manifestKeys(root = TOOLS, drop = []) {
  const d = new Set(drop);
  return collect(root, '', [], d).concat('INDEX.md').concat(fs.existsSync(path.join(root, 'index')) ? fs.readdirSync(path.join(root, 'index')).filter(f => !BAK.test(f) && fs.statSync(path.join(root, 'index', f)).isFile()).map(f => 'index/' + f) : []).sort();
}
// the release version: src/package.json, else tools/package.json, else 'dev'
function buildVersion() {
  let v = 'dev';
  try { v = JSON.parse(fs.readFileSync(path.join(TOOLS, '..', 'package.json'), 'utf8')).version || v; } catch (e) { try { v = JSON.parse(fs.readFileSync(path.join(TOOLS, 'package.json'), 'utf8')).version || v; } catch (e2) { } }
  return v;
}

function main() {
  const oi = process.argv.indexOf('--out');
  const OUT = path.resolve(oi > 0 ? process.argv[oi + 1] : path.join(__dirname, 'out'));
  // --name: output file name (no .exe), default ARSENAL. One exe for commands and the window: any name opens the GUI when started with no
  // arguments (sea-main.js startMode); the release ships only ARSENAL.exe (zip.js), no second ARSENAL-gui.exe.
  const ni = process.argv.indexOf('--name');
  const NAME = ni > 0 ? process.argv[ni + 1] : 'ARSENAL';
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(NAME)) { console.error('error: --name must be letters, digits, - _'); process.exit(2); }
  // --drop a,b: leave these top-level tool folders out (L7ZIP: zip.js drops maintainer-only docgen,scrub from release exes)
  const di = process.argv.indexOf('--drop');
  const DROP = di > 0 ? String(process.argv[di + 1] || '').split(',').filter(Boolean) : [];
  // --module-only a,b: tools other shipped tools require. Their files stay embedded; sea-main refuses them as commands ("unknown tool").
  const mi = process.argv.indexOf('--module-only');
  const MODS = mi > 0 ? String(process.argv[mi + 1] || '').split(',').filter(Boolean) : [];
  fs.mkdirSync(OUT, { recursive: true });
  const keys = manifestKeys(TOOLS, DROP);
  const manifest = path.join(OUT, 'manifest.json'), main = path.join(OUT, 'sea-main.js'), cfg = path.join(OUT, 'sea-config.json');
  fs.writeFileSync(manifest, JSON.stringify(keys));
  if (process.argv.includes('--manifest-only')) { console.log(`wrote ${manifest} (${keys.length} files, no exe: --manifest-only)`); return; }
  fs.writeFileSync(main, fs.readFileSync(path.join(__dirname, 'sea-main.js'), 'utf8').replace('__ARSENAL_VERSION__', buildVersion()).replace('__ARSENAL_MODULES__', MODS.join(',')));
  const assets = { 'manifest.json': manifest };
  for (const k of keys) assets[k] = path.join(TOOLS, k);
  const exe = path.join(OUT, process.platform === 'win32' ? NAME + '.exe' : NAME);
  fs.writeFileSync(cfg, JSON.stringify({ main, output: exe, disableExperimentalSEAWarning: true, useCodeCache: false, assets }, null, 1));
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['--build-sea', cfg], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('error: --build-sea failed (node >= 25.5 required)'); process.exit(1); }
  console.log(`built ${exe} (${(fs.statSync(exe).size / 1048576).toFixed(1)} MB, ${keys.length} assets, ${Date.now() - t0} ms)`);
}
if (require.main === module) main();
module.exports = { manifestKeys, buildVersion, SKIP, SKIPFILE, SKIPTEST, BAK, TOOLS };
