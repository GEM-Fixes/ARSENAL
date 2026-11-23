// mapviz: the Map Viewer command line. One entry for every mapviz part; each part is a folder with its own cli.js.
// usage: node tools/mapviz/mapviz.js <part> <command> [flags]      (in the exe: ARSENAL.exe mapviz <part> <command> [flags])
//   node tools/mapviz/mapviz.js                   this help, with the parts built so far
//   node tools/mapviz/mapviz.js parts [--json]    the parts table: name, id, wave, folder, built or not
//   node tools/mapviz/mapviz.js <part> --help     that part's commands (only when the part is built)
// common flags (tools/mapviz/README.md section 2):
//   --target as64|mowas2|goh  --game <folder>  --mods a,b  --mod-dir <folder>  --map <key>  --mode <id>  --phase <n>
//   --side a|b|both  --kind inf|mg|at|tank  --out <folder>  --in <folder>  --json  --progress <file>  --cancel-flag <file>
// exit codes: 0 ok, 1 done with findings, 2 usage or fault, 3 not found, 4 not built, 5 cancelled, 6 refused, 7 busy.
// A part that is not built yet answers "mapviz <part>: not built" and exits 4. The editor shot entry (edshot) is a
// separate program and is never loaded from here.
// Author: Imperator_Aug (ARSENAL, ia-d1b6d69e)
'use strict';
const fs = require('fs'), path = require('path');

const CONTRACT = 4;   // waves C and D (README Changes); every cache key changes once with it (README 8.2)
const EXIT = { OK: 0, FINDINGS: 1, USAGE: 2, NOT_FOUND: 3, NOT_BUILT: 4, CANCELLED: 5, REFUSED: 6, BUSY: 7 };
// error code (JSON answers, route answers) -> exit code
const CODES = { MV_USAGE: 2, MV_FAULT: 2, MV_NOT_FOUND: 3, MV_NOT_BUILT: 4, MV_CANCELLED: 5, MV_REFUSED: 6, MV_BUSY: 7 };
// page and CLI game id -> the exe id vfs is given. Never guessed from the folder.
const TARGETS = { as64: 'as64', mowas2: 'mowas_2', goh: 'goh' };
const SIDES = ['a', 'b', 'both'];
const KINDS = ['inf', 'mg', 'at', 'tank'];

class MvError extends Error {
  constructor(code, msg, detail) {
    super(msg);
    this.code = CODES[code] !== undefined ? code : 'MV_FAULT';
    this.exit = CODES[this.code];
    if (detail !== undefined) this.detail = detail;
  }
}

// opt: load a part's cli. null only when the missing module is that cli itself; any other missing module is a fault.
// spec = the literal string given to require; from = the file that holds that require (this file for the table below).
function opt(load, spec, from) {
  try { return load(); } catch (e) {
    if (!e || e.code !== 'MODULE_NOT_FOUND') throw e;
    const first = String(e.message || '').split('\n')[0];
    const named = first.indexOf("'" + spec + "'") >= 0;
    const stack = Array.isArray(e.requireStack) ? e.requireStack : null;   // node gives it, the SEA exe does not
    const byUs = !stack || !stack.length || path.resolve(stack[0]) === path.resolve(from || __filename);
    if (named && byUs) return null;
    throw e;
  }
}

// The parts table. Literal: every entry names its folder and its require, so the exe embeds them and a test reads them.
// bc1 and scenecache (tools/lib/model) are libraries with no command; edshot is its own entry; page parts live in the GUI.
const PARTS = [
  { part: 'mapkit', id: 'MV-KIT', wave: 'A', dir: 'lib/mapkit', load: () => opt(() => require('./lib/mapkit/cli'), './lib/mapkit/cli') },
  { part: 'raster', id: 'MV-RAS', wave: 'A', dir: 'lib/raster', load: () => opt(() => require('./lib/raster/cli'), './lib/raster/cli') },
  { part: 'jobs', id: 'MV-JOB', wave: 'A', dir: 'jobs', load: () => opt(() => require('./jobs/cli'), './jobs/cli') },
  { part: 'work', id: 'MV-JOB', wave: 'A', dir: 'jobs', lead: 'work', load: () => opt(() => require('./jobs/cli'), './jobs/cli') },
  { part: 'entcat', id: 'MV-ENT', wave: 'B', dir: 'entcat', load: () => opt(() => require('./entcat/cli'), './entcat/cli') },
  { part: 'water', id: 'MV-WAT', wave: 'B', dir: 'rules/water', load: () => opt(() => require('./rules/water/cli'), './rules/water/cli') },
  { part: 'pass', id: 'MV-WAT', wave: 'B', dir: 'rules/pass', load: () => opt(() => require('./rules/pass/cli'), './rules/pass/cli') },
  { part: 'render', id: 'MV-R1', wave: 'B', dir: 'render', load: () => opt(() => require('./render/cli'), './render/cli') },
  { part: 'sight', id: 'MV-SIG', wave: 'C', dir: 'rules/sight', load: () => opt(() => require('./rules/sight/cli'), './rules/sight/cli') },
  { part: 'cover', id: 'MV-COV', wave: 'C', dir: 'rules/cover', load: () => opt(() => require('./rules/cover/cli'), './rules/cover/cli') },
  { part: 'paint', id: 'MV-PNT1', wave: 'C', dir: 'paint', load: () => opt(() => require('./paint/cli'), './paint/cli') },
  { part: 'previews', id: 'MV-PRV', wave: 'C', dir: 'previews', load: () => opt(() => require('./previews/cli'), './previews/cli') },
  { part: 'strong', id: 'MV-STR', wave: 'D', dir: 'strong', load: () => opt(() => require('./strong/cli'), './strong/cli') },
];

function findPart(name, parts) { return (parts || PARTS).find(p => p.part === name) || null; }

// state of one part: 'built' | 'not built' | 'broken' (its cli loads but fails, or lacks run or an integer version)
function partState(p) {
  try {
    const c = p.load();
    return !c ? 'not built' : (typeof c.run === 'function' && Number.isInteger(c.version) ? 'built' : 'broken');
  } catch (e) { return 'broken'; }
}

function headerText() {
  let src = '';
  try { src = fs.readFileSync(__filename, 'latin1'); } catch (e) { return 'mapviz: the Map Viewer command line'; }
  const out = [];
  for (const l of src.split(/\r?\n/)) { if (!/^\/\//.test(l)) break; out.push(l.replace(/^\/\/ ?/, '')); }
  return out.join('\n');
}

function usage(parts) {
  const rows = (parts || PARTS).map(p => '  ' + (p.part + '          ').slice(0, 10) + (p.id + '         ').slice(0, 9) + 'wave ' + p.wave + '  ' + partState(p));
  return headerText() + '\nparts:\n' + rows.join('\n');
}

function footer() {
  try { const credit = require('../lib/credit'); return '\n' + credit.line(credit.relOf(__filename)); } catch (e) { return ''; }
}

// ---- common flags (README section 2) ----
// spec: { name: 'str' | 'num' | 'bool' | 'multi' } for a part's own flags (name without the leading dashes).
const COMMON = {
  target: 'str', game: 'str', mods: 'str', 'mod-dir': 'multi', map: 'str', mode: 'str', phase: 'num', side: 'str', kind: 'str',
  out: 'str', in: 'multi', json: 'bool', progress: 'str', 'cancel-flag': 'str', size: 'num', seed: 'num', q: 'bool',
};

function camel(s) { return s.replace(/-([a-z])/g, (m, c) => c.toUpperCase()); }

function parseArgs(argv, spec) {
  const kinds = Object.assign({}, COMMON, spec || {});
  const o = { pos: [], modDirs: [], in: [], json: false, q: false, side: 'both', kind: 'inf', seed: 1, extra: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i]);
    if (!/^--?[a-z]/i.test(a)) { o.pos.push(a); continue; }
    const name = a.replace(/^--?/, ''), k = kinds[name];
    if (!k) throw new MvError('MV_USAGE', 'flag ' + a + ' is not known here');
    const own = !(name in COMMON), key = name === 'mod-dir' ? 'modDirs' : camel(name);
    if (k === 'bool') { if (own) o.extra[key] = true; else o[key] = true; continue; }
    const v = argv[++i];
    if (v === undefined || /^--/.test(String(v))) throw new MvError('MV_USAGE', 'flag ' + a + ' needs a value');
    let val = String(v);
    if (k === 'num') { val = Number(v); if (!Number.isFinite(val)) throw new MvError('MV_USAGE', 'flag ' + a + ' needs a number, got ' + v); }
    if (k === 'multi') { const t = own ? (o.extra[key] = o.extra[key] || []) : o[key]; t.push(val); continue; }
    if (own) o.extra[key] = val; else o[key] = val;
  }
  if (o.target !== undefined) {
    if (!TARGETS[o.target]) throw new MvError('MV_USAGE', '--target must be as64, mowas2 or goh, got ' + o.target);
    o.exe = TARGETS[o.target];
  }
  if (!SIDES.includes(o.side)) throw new MvError('MV_USAGE', '--side must be a, b or both, got ' + o.side);
  if (!KINDS.includes(o.kind)) throw new MvError('MV_USAGE', '--kind must be inf, mg, at or tank, got ' + o.kind);
  o.mods = o.mods === undefined ? [] : String(o.mods).split(',').map(s => s.trim()).filter(Boolean);
  return o;
}

// gameFolder(o): --game, else the default install of the target (README section 2). Throws MV_NOT_FOUND when none.
function gameFolder(o) {
  if (!o.target) throw new MvError('MV_USAGE', '--target as64|mowas2|goh is needed to read a game');
  if (o.game) return path.resolve(o.game);
  const gd = require('../lib/gamedir');
  const dir = o.target === 'goh' ? gd.goh() : (gd.resolve({}) || {}).dir;
  if (!dir) throw new MvError('MV_NOT_FOUND', 'no ' + o.target + ' install found; give --game <folder>');
  return dir;
}

// checkOut(dir, o): refuse an --out folder inside any game install (the cache and temp folders pass). Throws MV_REFUSED.
// The game folder given to writeguard: o.gameDir, else o.game (--game), else the target's default install.
function checkOut(dir, o) {
  if (!dir) throw new MvError('MV_USAGE', '--out <folder> is needed for this command');
  let game = o && (o.gameDir || o.game) ? path.resolve(o.gameDir || o.game) : null;
  if (!game && o && o.target) { try { game = gameFolder(o); } catch (e) { game = null; } }
  const why = require('../lib/writeguard').refuseWrite(path.resolve(dir), { game: game || undefined, allowGameMods: false, purpose: 'mapviz output' });
  if (why) throw new MvError('MV_REFUSED', why);
  return path.resolve(dir);
}

// writeAtomic(file, data): tmp name in the same folder, then rename. A reader never sees half a file.
function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp' + process.pid;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
  return file;
}

// findIn(dirs, name): the first dirs[i]/name that exists, else null (product search over --in folders).
function findIn(dirs, name) {
  for (const d of dirs || []) { const f = path.join(d, name); if (fs.existsSync(f)) return f; }
  return null;
}

// progress(o, now): reporter for --progress / --cancel-flag (README section 7). now() is for tests.
function progress(o, now) {
  const clock = now || Date.now, t0 = clock();
  const file = o && o.progress, flag = o && o.cancelFlag;
  let stage = '', done = 0, total = 0, last = -1e9;
  function line(rec) { if (file) fs.appendFileSync(file, JSON.stringify(Object.assign({ t: clock() - t0 }, rec)) + '\n'); }
  function emit(force) {
    const t = clock();
    if (!force && t - last < 250) return;
    last = t; line({ stage, done, total });
  }
  function check() {
    const t = clock();
    if (t - last >= 2000) emit(true);
    if (flag && fs.existsSync(flag)) throw new MvError('MV_CANCELLED', 'cancelled at stage ' + (stage || 'start'));
  }
  return {
    stage(name, n) { stage = String(name); done = 0; total = n || 0; emit(true); check(); },
    step(n) { done += n === undefined ? 1 : n; emit(false); check(); },
    set(d, n) { done = d; if (n !== undefined) total = n; emit(false); check(); },
    check,
  };
}

function endLine(file, state, code, t0) {
  if (!file) return;
  try { fs.appendFileSync(file, JSON.stringify({ t: Date.now() - t0, end: state, code }) + '\n'); } catch (e) { /* the runner sees the exit code */ }
}

function flagValue(argv, name) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; }

function say(part, e, json) {
  const code = e instanceof MvError ? e.code : 'MV_FAULT';
  const msg = e instanceof MvError ? e.message : 'fault: ' + (e && e.message ? e.message : String(e));
  process.stderr.write('mapviz ' + part + ': ' + msg + '\n');
  if (process.env.MAPVIZ_DEBUG && e && e.stack) process.stderr.write(e.stack + '\n');
  if (json) {
    const err = { code, msg, part };
    if (e && e.detail !== undefined) err.detail = e.detail;
    process.stdout.write(JSON.stringify({ v: 1, error: err }) + '\n');
  }
  return CODES[code];
}

function partHelp(p, cli) {
  const cmds = cli.commands || {};
  const rows = Object.keys(cmds).map(k => '  ' + (p.lead ? '' : k + ' ') + (cmds[k].args || '') + (cmds[k].summary ? '   ' + cmds[k].summary : ''));
  const head = 'mapviz ' + p.part + ' (' + p.id + ', wave ' + p.wave + ')' + (cli.summary ? ': ' + cli.summary : '');
  return head + '\nusage: node tools/mapviz/mapviz.js ' + p.part + (p.lead ? ' ' : ' <command> ') + '[flags]\n' + rows.join('\n');
}

// dispatch(argv, parts) -> Promise<exit code>. Writes the progress end line when --progress is given.
async function dispatch(argv, parts) {
  const table = parts || PARTS;
  const json = argv.includes('--json');
  const name = argv[0];
  if (name === 'parts') {
    const rows = table.map(p => ({ part: p.part, id: p.id, wave: p.wave, dir: p.dir, state: partState(p) }));
    if (json) process.stdout.write(JSON.stringify({ v: 1, contract: CONTRACT, parts: rows }) + '\n');
    else for (const r of rows) process.stdout.write(r.part + '\t' + r.id + '\twave ' + r.wave + '\t' + r.dir + '\t' + r.state + '\n');
    return EXIT.OK;
  }
  const p = findPart(name, table);
  if (!p) return say(String(name), new MvError('MV_USAGE', 'no part named ' + name + '; run with no arguments for the list'), json);
  const rest = argv.slice(1);
  const pfile = flagValue(rest, '--progress'), t0 = Date.now();
  let cli;
  try { cli = p.load(); } catch (e) { return say(p.part, e, json); }
  if (!cli) {
    const code = say(p.part, new MvError('MV_NOT_BUILT', 'not built (' + p.id + ', wave ' + p.wave + ')', { id: p.id, wave: p.wave }), json);
    endLine(pfile, 'failed', code, t0);
    return code;
  }
  if (rest.includes('--help') || rest.includes('-h')) { process.stdout.write(partHelp(p, cli) + '\n'); return EXIT.OK; }
  const args = p.lead ? [p.lead].concat(rest) : rest;
  let code;
  try {
    if (!p.lead && !args.length) throw new MvError('MV_USAGE', 'give a command: ' + Object.keys(cli.commands || {}).join(', '));
    if (cli.commands && !cli.commands[args[0]]) throw new MvError('MV_USAGE', 'no command ' + args[0] + ' in ' + p.part + '; commands: ' + Object.keys(cli.commands).join(', '));
    const r = await cli.run(args);
    code = Number.isInteger(r) ? r : EXIT.OK;
  } catch (e) { code = say(p.part, e, json); }
  endLine(pfile, code === EXIT.OK || code === EXIT.FINDINGS ? 'done' : code === EXIT.CANCELLED ? 'cancelled' : 'failed', code, t0);
  return code;
}

module.exports = {
  CONTRACT, EXIT, CODES, TARGETS, SIDES, KINDS, PARTS, MvError,
  opt, findPart, partState, usage, parseArgs, gameFolder, checkOut, writeAtomic, findIn, progress, dispatch,
};

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (!argv.length || /^(-h|--help|--version)$/.test(argv[0])) {
    if (argv[0] === '--version') { process.stdout.write(footer().trim() + '\n'); process.exit(0); }
    process.stdout.write(usage() + footer() + '\n');
    process.exit(0);
  }
  dispatch(argv).then(c => { process.exitCode = c; }, e => { process.exitCode = say(argv[0], e, argv.includes('--json')); });
}
