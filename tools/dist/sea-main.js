// SEA entry for ARSENAL.exe (old name as2.exe): tool sources are embedded assets (key = path rel tools/, e.g. "sdllint/sdllint.js").
// Runs the tool IN-PROCESS with a mini CommonJS loader over the assets (no child spawn, no tools folder needed).
// Virtual root VROOT stands in for tools/; fs.readFileSync/existsSync of VROOT paths are served from assets.
// Author: Imperator_Aug (ARSENAL, ia-4d54a935)
const sea = require('node:sea'), path = require('path'), fs = require('fs');
const VROOT = path.join(path.dirname(process.execPath), '__as2_sea__', 'tools');
const keys = JSON.parse(sea.getAsset('manifest.json', 'utf8'));
const KEYSET = new Set(keys);
// T-ZIP: embedded only because a shipped tool requires them (sea.js --module-only); not commands
const MODULE_ONLY = new Set('__ARSENAL_MODULES__'.split(',').filter(x => x && !/^__/.test(x)));
const DEV = new Set(['q', 'usage', 'webcheck', 'srcdrift', 'rows', 'golden', 'spotsheet', 'libapi', 'brief', 'scaffold', 'buildlog', 'fieldtypes']);
const ENTRY = { fieldtypes: 'gen.js' };
// tools needing the src tree (webs/limits) cannot run standalone
const FLOW = new Set(['game', 'install', 'uninstall', 'probe', 'e2e', 'dev-loop']);
const NEEDS_SRC =new Set(['q', 'usage', 'webcheck', 'srcdrift', 'rows', 'golden', 'spotsheet', 'libapi', 'brief', 'scaffold', 'buildlog', 'mcp']);

const keyOf = p => { const r = path.relative(VROOT, p); return r.startsWith('..') || path.isAbsolute(r) ? null : r.split(path.sep).join('/'); };
const asset = k => Buffer.from(sea.getRawAsset(k));

const rfs = fs.readFileSync, rex = fs.existsSync;
fs.readFileSync = function (p, o) {
  const k = typeof p === 'string' ? keyOf(p) : null;
  if (k !== null && KEYSET.has(k)) { const b = asset(k); const enc = typeof o === 'string' ? o : o && o.encoding; return enc ? b.toString(enc === 'cp1251' ? 'latin1' : enc) : b; }
  return rfs.apply(this, arguments);
};
// virtual folders (every parent of an embedded file): existsSync(dir) true, readdirSync(dir) lists the embedded children
// (soedit ops lists tools/soedit/ops/*.js). A folder that also exists on disk is read from disk.
const DIRS = new Map();
for (const k of keys) { const p = k.split('/'); for (let i = 1; i < p.length; i++) { const d = p.slice(0, i).join('/'); if (!DIRS.has(d)) DIRS.set(d, new Set()); DIRS.get(d).add(p[i]); } }
fs.existsSync = function (p) { const k = typeof p === 'string' ? keyOf(p) : null; return k !== null && (KEYSET.has(k) || DIRS.has(k)) ? true : rex.apply(this, arguments); };
const rdir = fs.readdirSync;
fs.readdirSync = function (p, o) {
  const k = typeof p === 'string' ? keyOf(p) : null;
  if (k === null || !DIRS.has(k) || rex(p)) return rdir.apply(this, arguments);
  const names = [...DIRS.get(k)].sort();
  if (!(o && o.withFileTypes)) return names;
  return names.map(n => { const dir = DIRS.has(k + '/' + n); return { name: n, parentPath: p, path: p, isDirectory: () => dir, isFile: () => !dir, isSymbolicLink: () => false }; });
};

const cache = new Map();
function resolveVirtual(from, req) {
  const base = path.resolve(path.dirname(from), req);
  for (const c of [base, base + '.js', base + '.json', path.join(base, 'index.js')]) { const k = keyOf(c); if (k !== null && KEYSET.has(k)) return k; }
  return null;
}
function load(key, main) {
  if (cache.has(key)) return cache.get(key).exports;
  const file = path.join(VROOT, key), m = { exports: {}, id: file, filename: file, loaded: false };
  cache.set(key, m);
  if (key.endsWith('.json')) { m.exports = JSON.parse(asset(key).toString('utf8')); return m.exports; }
  const req = r => {
    if (r.startsWith('.') || path.isAbsolute(r)) {
      const k = resolveVirtual(file, r);
      if (k) return load(k, main || m); // children see the entry as require.main (their `require.main === module` stays false)
      // a relative require inside the embedded tree that is not embedded: throw what node throws (code MODULE_NOT_FOUND), so an
      // optional part (gui/ext/models/index.js `opt(() => require('./sub/armor.client'))`) is skipped as it is under node.
      // (the SEA's own require only loads built-in modules and would throw a different error)
      if (keyOf(path.resolve(path.dirname(file), r)) !== null) throw Object.assign(new Error(`Cannot find module '${r}'`), { code: 'MODULE_NOT_FOUND' });
    }
    return require(r);
  };
  req.main = main || m; req.resolve = r => r; req.cache = {};
  let src = asset(key).toString('utf8');
  if (src.startsWith('#!')) src = '//' + src;
  new Function('exports', 'require', 'module', '__filename', '__dirname', src)(m.exports, req, m, file, path.dirname(file));
  m.loaded = true;
  return m.exports;
}

function help(all) {
  const idx = keys.filter(k => k === 'INDEX.md' || /^index\/.*\.md$/.test(k)).map(k => asset(k).toString('utf8')).join('\n');
  const u = {};
  for (const l of idx.split(/\r?\n/)) {
    const run = (l.split(/\s\|\s/)[1] || '').replace(/`/g, '').replace(/\\\|/g, '|');
    for (const s of run.split(';')) { const r = /node tools\/([a-z0-9-]+)\/\S+\s*(.*)/.exec(s); if (r && !u[r[1]]) u[r[1]] = r[2].trim(); }
  }
  const names = [...new Set(keys.map(k => k.split('/')).filter(p => p.length === 2 && p[1] === (ENTRY[p[0]] || p[0] + '.js')).map(p => p[0]))]
    .filter(n => n !== 'as2' && n !== 'lib' && !MODULE_ONLY.has(n)).sort();
  load('as2/menu.js', null).print(names, u, DEV, all);
}

// ONE exe (W6 U1, owner 2026-11-10 "a unified exe"): ARSENAL.exe started with no arguments opens the window, with arguments it runs
// the command. Rule for "double click": no arguments is enough. Explorer passes none, and a typed `ARSENAL.exe` with nothing after it
// also gets the window plus one line (when the output is a console) saying how to list the commands. `ARSENAL gui` opens the browser
// too unless --no-open is given. The GUI's contract tools run as `ARSENAL.exe <tool> ...` children of the same exe (gui.js childCmd),
// always with arguments, so they never take the window path. The zip's ARSENAL-gui.cmd is `ARSENAL.exe gui` (tools/dist/launch.js).
// START-MODE (tools/dist/test/startmode.js evaluates this block on its own: keep it free of other names)
const START_NOTE = 'ARSENAL: opening the window in your browser (keep this console open while you use it). For the command list: ARSENAL help';
function startMode(argv, tty) {
  const a = argv.slice();
  if (!a.length) return { argv: ['gui', '--open'], note: tty ? START_NOTE : null };
  if (a[0] === 'gui' && !a.some(x => x === '--open' || x === '--no-open' || x === '--help' || x === '-h')) return { argv: [...a, '--open'], note: null };
  return { argv: a, note: null };
}
// END START-MODE
// package.json is not embedded: sea.js writes the version into this placeholder at build time; lib/credit version() reads the env.
const BUILD_VERSION = '__ARSENAL_VERSION__';
if (!/^__/.test(BUILD_VERSION)) process.env.ARSENAL_VERSION = BUILD_VERSION;

function main(argv) {
  const sm = startMode(argv, !!process.stdout.isTTY), a = sm.argv; let dev = false;
  if (sm.note) console.log(sm.note);
  if (a[0] === '--all') { help(true); return 0; }
  if (['--version', '-v', 'version'].includes(a[0])) { console.log(`ARSENAL ${process.env.ARSENAL_VERSION || 'dev'} - author Imperator_Aug - build exe`); return 0; }
  if (['help', '-h', '--help'].includes(a[0])) { help(a[1] === '--all'); return 0; }
  if (a[0] === 'dev') { dev = true; a.shift(); if (!a.length) { help(); return 0; } }
  // status reads (maintainers' folder, absent in the exe): same module as node as2, says so and exits 1
  if (!dev && a[0] === 'status') return load('as2/status.js', null).main(a.slice(1));
  // L7-CLEAN: `as2 game` only prints where the game was found (no spawn), so the exe runs it: the one way to see "finds the game" before a tool needs it
  // SPEED-B5: install/uninstall are filesystem only, so the exe runs them too (flow.js EXE_OK)
  { const fl = load('as2/flow.js', null); if (!dev && fl.EXE_OK && fl.EXE_OK.has(a[0])) return fl.main(a); }
  // as2/flow.js workflow spawns node + the game: not in the exe (help kept identical to node as2)
  if (!dev && FLOW.has(a[0]) && (a.includes('--help') || a.includes('-h'))) return load('as2/flow.js', null).main(a);   // HELPFIX: usage, exit 0
  if (!dev && FLOW.has(a[0])) { console.error(`error: '${a[0]}' is a workflow command: run it with node tools/as2/as2.js ${a[0]}`); return 2; }
  // GUI-4: a tool spawning `process.execPath <tools>/<t>/<t>.js args` (check -> wouldload, doctor ...) runs that embedded script
  const sk = /\.js$/.test(a[0]) ? keyOf(path.resolve(a[0])) : null;
  if (sk && KEYSET.has(sk)) { process.argv = [process.execPath, path.join(VROOT, sk), ...a.slice(1)]; load(sk, null); return process.exitCode; }
  const name = a.shift(), key = name + '/' + (ENTRY[name] || name + '.js');
  if (!/^[a-z][a-z0-9-]*$/.test(name) || name === 'as2' || name === 'lib' || !KEYSET.has(key) || MODULE_ONLY.has(name)) { console.error(`error: unknown tool '${name}' (ARSENAL help)`); return 2; }
  if (DEV.has(name) !== dev) { console.error(`error: '${name}' is a ${dev ? 'mod' : 'dev'} tool: as2 ${dev ? '' : 'dev '}${name}`); return 2; }
  if (NEEDS_SRC.has(name)) { console.error(`error: '${name}' needs the source tree (webs); run it with node tools/as2/as2.js`); return 2; }
  // SOEdit is not part of the release (owner 2026-11-15): soedit install downloads it, so there is nothing to build here
  if (name === 'soedit' && a[0] === 'build') { console.error('soedit build: SOEdit is not part of ARSENAL. ARSENAL soedit install, or the Open SOEdit button on the Models page, downloads it.'); return 2; }
  process.argv = [process.execPath, path.join(VROOT, key), ...a];
  const entry = { exports: {} };
  load(key, null);
  return process.exitCode;
}
// DOOR-CLEAN: an error a tool does not catch = one line `error: <tool>: msg`, exit 2. no stack (it would name the build machine's
// paths and the virtual __as2_sea__ tree); AS2_DEBUG=1 keeps the stack.
const TOOL = (process.argv[2] || '').replace(/[^\w.-]/g, '');
function die(e) {
  if (process.env.AS2_DEBUG) console.error(e && e.stack || e);
  const msg = String(e && e.message || e).split(/\r?\n/)[0].split(VROOT + path.sep).join('').split(VROOT).join('');
  console.error(`error: ${TOOL ? TOOL + ': ' : ''}${msg}${process.env.AS2_DEBUG ? '' : ' (AS2_DEBUG=1 for details)'}`);
  process.exit(2);
}
process.on('uncaughtException', die);
process.on('unhandledRejection', die);
// the entry module must see require.main === module: load() with main=null makes m the main
try { process.exitCode = main(process.argv.slice(2)); } catch (e) { die(e); }
