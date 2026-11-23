#!/usr/bin/env node
// ARSENAL (A.R.S.E.N.A.L; old name as2, still works): one entry point for tools/. `ARSENAL <tool> args..` runs tools/<tool>/<tool>.js; `ARSENAL dev <tool>` for web/build-side tools.
// `ARSENAL` / `ARSENAL help` = the front door (menu.js DOOR: new gen check fix upgrade install uninstall play maps); `ARSENAL advanced` = hidden tools;
// every tool with usage in `ARSENAL --all`; stopped tools still run if named. `as2` is an alias of the same script.
// Author: Imperator_Aug (ARSENAL, ia-26d5d76e)
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const TOOLS = path.join(__dirname, '..');
// dev = maintain webs/tools, not mods
const DEV = new Set(['q', 'golden', 'libapi', 'scaffold', 'fieldtypes']);
const ENTRY = { fieldtypes: 'gen.js' };

function entry(name) {
  const f = path.join(TOOLS, name, ENTRY[name] || name + '.js');
  return /^[a-z][a-z0-9-]*$/.test(name) && name !== 'as2' && name !== 'lib' && fs.existsSync(f) ? f : null;
}
// Tools a shipped tool requires but that are no command in a release (tools/dist/zip.js takes this list for the exe and the
// launchers): covanm (assetsame), score (edrun), wpn (goh2as2), exever + upstreamscan (release-check spawns them).
// PKG = run from the release's plain files (the small package): tools/dist is never shipped, so its absence marks the package.
// There, as in the exe, they are not listed by help and answer "unknown tool".
const MODULE_ONLY = ['covanm', 'score', 'wpn', 'exever', 'shotcrop'];   // shotcrop: unitcard reads JPG pictures through its decoder
const PKG = !fs.existsSync(path.join(TOOLS, 'dist', 'sea.js'));
function list(pkg = PKG) { return fs.readdirSync(TOOLS).filter(n => entry(n) && !(pkg && MODULE_ONLY.includes(n))).sort(); }
function usageLines() {
  const m = {};
  try {
    // run column = 2nd ` | `-separated cell; may hold several `node tools/<n>/x.js args` joined by `;`
    const idx = path.join(TOOLS, 'index'), lines = fs.existsSync(idx) ? fs.readdirSync(idx).sort().flatMap(f => fs.readFileSync(path.join(idx, f), 'utf8').split(/\r?\n/)) : fs.readFileSync(path.join(TOOLS, 'INDEX.md'), 'utf8').split(/\r?\n/);
    for (const l of lines) {
      const run = (l.split(/\s\|\s/)[1] || '').replace(/`/g, '').replace(/\\\|/g, '|');
      for (const s of run.split(';')) {
        const r = /node tools\/([a-z0-9-]+)\/\S+\s*(.*)/.exec(s);
        if (r && !m[r[1]]) m[r[1]] = r[2].trim();
      }
    }
  } catch (e) { /* no INDEX → names only */ }
  return m;
}
const { STOPPED, MAIN, print } = require('./menu');
const help = all => print(list(), usageLines(), DEV, all);

function main(argv) {
  let a = argv.slice(), dev = false;
  if (a[0] === '--all') { help(true); return 0; }
  if (['--version', '-v', 'version'].includes(a[0])) { console.log(require('../lib/credit').line('as2/as2.js')); return 0; }
  if (!a.length || ['help', '-h', '--help'].includes(a[0])) { help(a[1] === '--all'); return 0; }
  if (a[0] === 'dev') { dev = true; a.shift(); if (!a.length) { help(); return 0; } }
  if (!dev && a[0] === 'status') return require('./status').main(a.slice(1));
  if (!dev) { const rc = require('./flow').main(a); if (rc != null) return rc; }
  const name = a.shift(), f = entry(name);
  if (!f || (PKG && MODULE_ONLY.includes(name))) { console.error(`error: unknown tool '${name}' (ARSENAL help)`); return 2; }
  if (DEV.has(name) !== dev) { console.error(`error: '${name}' is a ${dev ? 'mod' : 'dev'} tool: ARSENAL ${dev ? '' : 'dev '}${name}`); return 2; }
  const r = spawnSync(process.execPath, [f, ...a], { stdio: 'inherit' });
  if (r.error) { console.error('error: ' + r.error.message); return 2; }
  return r.status == null ? 1 : r.status;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
else module.exports = { entry, list, usageLines, DEV, STOPPED, MAIN, TOOLS, MODULE_ONLY, PKG };
