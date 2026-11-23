// mcp ctx: what every tool handler of the `arsenal` MCP server gets as its second argument (tools/mcp/README.md, frozen names).
//   ctx.game(args) -> { id, exe, dir, profile, kind, name, file, source }
//       id      'as64' | 'mowas2' | 'goh'  (args.game, else env ARSENAL_GAME, else 'as64'; 'mowas_2' is taken as 'mowas2')
//       exe     the word the CLI tools take after --exe: 'as64' | 'mowas_2' | 'goh'  (lib/games)
//       dir     the install folder or null. Order: env ARSENAL_AS2_DIR (as64 and mowas2 share it) / ARSENAL_GOH_DIR, else the GUI
//               settings file (tools/gui/settings.js defaultFile(), keys as2gui.games.<id>.dir and as2gui.game; env ARSENAL_SETTINGS
//               names another file), else lib/gamedir (AS2_GAME / GOH_GAME, as2.json, Steam libraries). Found once per process.
//       source  'env' | 'settings' | 'arg' | 'as2.json' | 'steam' | 'goh' | null
//       profile tools/gameprofile/games/<exe>.json: { game, title, facts: { key: { v, src, tag } } }  (read on first use)
//       kind    'as2' | 'goh';  name = shown name;  file = the exe file under dir
//       An unknown game throws a refusal (the server answers it in plain words).
//   await ctx.run(tool, argv, opt) -> { text, stdout, stderr, code, isError, timedOut }
//       spawns `node tools/<tool>/<tool>.js ...argv` (entry file from tools/as2 entry(); opt.script = another file in tools/<tool>/),
//       argv is an array of strings, no shell. opt: timeout ms (default 10 min), cwd, env (added to the server's), max (output cut,
//       default 40000 chars), input (stdin text). text = stdout + stderr (+ "[exit N]" when N != 0), cut. isError only when the
//       tool could not be started or timed out: a checker that exits 1 because it found something is not an error, read `code`.
//   await ctx.q(args) -> the same shape; runs tools/q/q.js with that argv array (e.g. ['-k', 'armor', 'thickness']).
//   ctx.guard.write(path) -> the absolute path when this call may write there, else it throws a refusal. Allowed only when the tool is
//       kind 'write', the call passed write: true, the path is inside a folder of env ARSENAL_WRITE_ROOTS (';' separated), not inside
//       a game's own resource or packages folder, and tools/lib/writeguard has no objection. Call it for EVERY path you write.
//   ctx.guard.canWrite(path) -> null when guard.write would pass, else the plain reason (for a preview: "this would be refused").
//   ctx.guard.writing -> true when this call passed write: true (answer a preview when false).
//   ctx.guard.roots() -> the write roots as absolute paths.
//   ctx.guard.launch() -> true, or throws a refusal unless env ARSENAL_ALLOW_LAUNCH=1 and the tool is kind 'launch'.
//   ctx.bad(msg) -> { text: 'refused: ' + msg, isError: true }   return it from a handler. `throw ctx.refusal(msg)` gives the same answer.
//   ctx.name(v, what) -> v, or throws a refusal when v is not a non-empty string or starts with '-' (paths, names, ids given to a child tool).
//   ctx.cut(text, max) -> text cut to max chars (default 40000) with a "... [cut: N more chars]" line.
//   ctx.ROOT repo root, ctx.TOOLS tools folder, ctx.GAMES ['as64','mowas2','goh'], ctx.registry() -> what the server loaded
//       ({ tools, modules, errors, groups }; empty lists when a module is used outside the server). Each tool has `group` and
//       `served` (false = its group was left out by --groups); groups = { all, served, off, unknown, limited } (lib/registry.js).
// The server makes one ctx per call with forCall(tool, args); a handler never builds its own.
// Author: Imperator_Aug (ARSENAL, ia-8f5931dd)
'use strict';
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const games = require('../../lib/games');

const TOOLS = path.resolve(__dirname, '..', '..'), ROOT = path.resolve(TOOLS, '..');
const MAXOUT = 40000, TIMEOUT = 10 * 60 * 1000;
const GAMES = games.GAMES.map(g => g.id);

function refusal(msg) { const e = new Error(String(msg)); e.refused = true; return e; }
const bad = msg => ({ text: 'refused: ' + msg, isError: true });
function cut(s, max) {
  s = String(s == null ? '' : s); max = max > 0 ? max : MAXOUT;
  return s.length > max ? s.slice(0, max) + '\n... [cut: ' + (s.length - max) + ' more chars]' : s;
}
function name(v, what) {
  what = what || 'value';
  if (typeof v !== 'string' || !v.trim()) throw refusal(what + ' must be a non-empty text');
  if (v.trim().startsWith('-')) throw refusal(what + ' may not start with "-": ' + v.slice(0, 60));
  if (/[\0\r\n]/.test(v)) throw refusal(what + ' may not hold a line break');
  return v;
}

// ---- game ----
const dirMemo = new Map();
function settingsDirs() {
  let file = process.env.ARSENAL_SETTINGS || '';
  if (!file) { try { file = require('../../gui/settings').defaultFile(); } catch (e) { return {}; } }
  let j; try { j = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch (e) { return {}; }
  if (!j || typeof j !== 'object') return {};
  const gs = j['as2gui.games'] && typeof j['as2gui.games'] === 'object' ? j['as2gui.games'] : {};
  const d = id => (gs[id] && typeof gs[id].dir === 'string' && gs[id].dir) || '';
  return { as2: d('as64') || d('mowas2') || (typeof j['as2gui.game'] === 'string' ? j['as2gui.game'] : ''), goh: d('goh') };
}
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };
function findDir(kind) {
  const env = process.env, ev = kind === 'goh' ? env.ARSENAL_GOH_DIR : env.ARSENAL_AS2_DIR;
  const key = kind + '|' + (ev || '') + '|' + (env.ARSENAL_SETTINGS || '');
  if (dirMemo.has(key)) return dirMemo.get(key);
  let r = { dir: null, source: null };
  if (ev && isDir(ev)) r = { dir: path.resolve(ev), source: 'env' };
  if (!r.dir) { const s = settingsDirs()[kind]; if (s && isDir(s)) r = { dir: path.resolve(s), source: 'settings' }; }
  if (!r.dir) {
    try {
      const o = env.ARSENAL_NO_STEAM === '1' ? { noSteam: true } : {};
      const x = games.install(kind === 'goh' ? 'goh' : 'as64', o);
      if (x && x.dir && isDir(x.dir)) r = { dir: path.resolve(x.dir), source: x.source || 'steam' };
    } catch (e) { /* none found */ }
  }
  dirMemo.set(key, r);
  return r;
}
const profMemo = new Map();
function profileOf(exe) {
  if (!profMemo.has(exe)) {
    let p = null;
    try { p = JSON.parse(fs.readFileSync(path.join(TOOLS, 'gameprofile', 'games', exe + '.json'), 'utf8')); } catch (e) { p = null; }
    profMemo.set(exe, p);
  }
  return profMemo.get(exe);
}
function game(args) {
  const want = (args && args.game != null ? args.game : null) || process.env.ARSENAL_GAME || games.DEFAULT;
  const g = typeof want === 'string' ? games.get(want.trim()) : null;
  if (!g) throw refusal('unknown game "' + String(want).slice(0, 40) + '": use as64, mowas2 or goh');
  const f = findDir(g.kind);
  const out = { id: g.id, exe: g.exe, dir: f.dir, source: f.source, kind: g.kind, name: g.name, file: g.file };
  Object.defineProperty(out, 'profile', { enumerable: true, get: () => profileOf(g.exe) });
  return out;
}

// ---- run ----
function entryOf(tool, script) {
  if (typeof tool !== 'string' || !/^[a-z][a-z0-9-]*$/.test(tool)) throw refusal('not a tool name: ' + String(tool).slice(0, 40));
  let f;
  if (script) {
    if (typeof script !== 'string' || !/^[A-Za-z0-9_.\/-]+\.js$/.test(script) || script.includes('..')) throw refusal('not a script of ' + tool + ': ' + script);
    f = path.join(TOOLS, tool, script);
  } else {
    try { f = require('../../as2/as2.js').entry(tool); } catch (e) { f = null; }
    if (!f) f = path.join(TOOLS, tool, tool + '.js');
  }
  if (!fs.existsSync(f)) throw refusal('no such tool: ' + tool + (script ? '/' + script : ''));
  return f;
}
function run(tool, argv, opt) {
  opt = opt || {};
  let f;
  try { f = entryOf(tool, opt.script); } catch (e) { return Promise.reject(e); }
  argv = argv == null ? [] : argv;
  if (!Array.isArray(argv) || !argv.every(x => typeof x === 'string' && !x.includes('\0'))) return Promise.reject(refusal('arguments must be a list of texts'));
  const max = opt.max > 0 ? opt.max : MAXOUT, timeout = opt.timeout > 0 ? opt.timeout : TIMEOUT, KEEP = Math.max(max * 4, 1 << 20);
  return new Promise(resolve => {
    let out = '', err = '', done = false, timedOut = false, timer = null;
    const fin = (code, signal, failure) => {
      if (done) return; done = true; clearTimeout(timer);
      let text = out + (err ? (out ? '\n' : '') + err : '');
      if (failure) text += (text ? '\n' : '') + 'error: ' + failure;
      else if (timedOut) text += (text ? '\n' : '') + '[stopped: no answer after ' + Math.round(timeout / 1000) + ' s]';
      else if (code !== 0) text += (text && !text.endsWith('\n') ? '\n' : '') + '[exit ' + (code == null ? 'signal ' + signal : code) + ']';
      resolve({ text: cut(text, max), stdout: out, stderr: err, code: code == null ? null : code, isError: !!failure || timedOut, timedOut });
    };
    let c;
    try {
      c = spawn(process.execPath, [f, ...argv], { cwd: opt.cwd || ROOT, env: opt.env ? Object.assign({}, process.env, opt.env) : process.env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) { return fin(null, null, e.message); }
    timer = setTimeout(() => { timedOut = true; try { c.kill(); } catch (e) { /* gone */ } }, timeout);
    c.stdout.setEncoding('utf8'); c.stderr.setEncoding('utf8');
    c.stdout.on('data', d => { if (out.length < KEEP) out += d; });
    c.stderr.on('data', d => { if (err.length < KEEP) err += d; });
    c.on('error', e => fin(null, null, e.message));
    c.on('close', (code, signal) => fin(code, signal, null));
    c.stdin.on('error', () => { /* the tool does not read stdin */ });
    c.stdin.end(typeof opt.input === 'string' ? opt.input : '');
  });
}
// q: the note lookups. A copy without the lookup tool, or without the internal notes a mode needs (the game,, answers
// a plain "not part of this copy" instead of an error
const NOTE_DIRS = { codemap: 'codemap', gohweb: 'gohweb' };
function notInCopy(what) { const t = 'This lookup is not part of this copy of ARSENAL (' + what + ' is not here). Use the guide and the skills instead.'; return { text: t, stdout: t, stderr: '', isError: false, code: 0, notInCopy: true }; }
async function q(args, opt) {
  if (!fs.existsSync(path.join(TOOLS, 'q', 'q.js'))) return notInCopy('the note lookup tool');
  const a = Array.isArray(args) ? args : [];
  if (a[0] === 'gohweb' && !fs.existsSync(path.join(ROOT, NOTE_DIRS.gohweb))) return notInCopy('the Gates of Hell notes');
  const r = await run('q', args, opt);
  if (r && (r.isError || r.code) && !fs.existsSync(path.join(ROOT, NOTE_DIRS.codemap)) && (a.includes('-g') || a.includes('-r') || /codemap|no such|ENOENT/i.test(String(r.stderr || '') + String(r.text || '')))) return notInCopy('the internal notes this mode reads');
  return r;
}

// ---- guards ----
const lc = p => (process.platform === 'win32' ? p.toLowerCase() : p);
// the real path of p: the deepest folder that exists resolved through links, the missing rest kept as written
function real(p) {
  let cur = path.resolve(p); const rest = [];
  for (;;) {
    try { return path.join(fs.realpathSync.native(cur), ...rest.reverse()); } catch (e) { /* missing: go up */ }
    const up = path.dirname(cur);
    if (up === cur) return path.resolve(p);
    rest.push(path.basename(cur)); cur = up;
  }
}
function inside(p, dir) { const r = path.relative(lc(dir), lc(p)); return r === '' || (!!r && !r.startsWith('..') && !path.isAbsolute(r)); }
function roots() {
  return String(process.env.ARSENAL_WRITE_ROOTS || '').split(';').map(s => s.trim()).filter(s => s && path.isAbsolute(s)).map(real);
}
function gameOwn(p) {   // -> reason when p is the game's own data, else null
  const dirs = [];
  for (const k of ['as2', 'goh']) { const d = findDir(k).dir; if (d) dirs.push(real(d)); }
  try { const det = require('../../lib/writeguard').detectInstall(p); if (det && det.dir) dirs.push(real(det.dir)); } catch (e) { /* no install above */ }
  for (const d of dirs) {
    if (!inside(p, d)) continue;
    const first = lc(path.relative(d, p).split(/[\\/]/)[0] || '');
    if (first === '') return 'that is the game folder itself';
    if (first === 'resource' || first === 'packages') return 'that is inside the game\'s own ' + first + ' folder, which is read-only';
    if (first !== 'mods') return 'that is inside the game install; only a mod folder under mods may be written';
  }
  return null;
}
function canWrite(target, tool, args) {
  if (typeof target !== 'string' || !target.trim()) return 'no path given';
  if (target.trim().startsWith('-')) return 'a path may not start with "-"';
  if (!path.isAbsolute(target)) return 'give the full path, not a relative one: ' + target;
  if (!tool || tool.kind !== 'write') return 'this tool is not a write tool';
  const rs = roots();
  if (!rs.length) return 'writing is off. Set the environment variable ARSENAL_WRITE_ROOTS to the folders that may be written (";" between them) and start the server again';
  const p = real(target);
  if (!rs.some(r => inside(p, r))) return 'that path is outside the folders that may be written (ARSENAL_WRITE_ROOTS): ' + p;
  const own = gameOwn(p);
  if (own) return own + ': ' + p;
  try {
    const why = require('../../lib/writeguard').refuseWrite(p, {});
    if (why) return String(why);
  } catch (e) { /* the guard itself failed: the checks above stand */ }
  if (!args || args.write !== true) return 'preview only: pass write: true to change files';
  return null;
}
function launchWhy(tool) {
  if (!tool || tool.kind !== 'launch') return 'this tool does not start or drive the game';
  if (process.env.ARSENAL_ALLOW_LAUNCH !== '1') return 'starting or driving the game is off. Set the environment variable ARSENAL_ALLOW_LAUNCH=1 and start the server again';
  return null;
}

let registry = () => ({ tools: [], modules: [], errors: [], groups: { all: [], served: [], off: [], unknown: [], limited: false } });
const base = { game, run, q, bad, refusal, name, cut, ROOT, TOOLS, GAMES, MAXOUT, registry: () => registry() };

// one ctx per call: the guards know the tool and its arguments
function forCall(tool, args) {
  const ctx = Object.create(base);
  ctx.tool = tool || null;
  ctx.guard = {
    writing: !!(args && args.write === true),
    roots,
    canWrite: p => canWrite(p, tool, args),
    write(p) { const why = canWrite(p, tool, args); if (why) throw refusal(why); return real(p); },
    launchWhy: () => launchWhy(tool),
    launch() { const why = launchWhy(tool); if (why) throw refusal(why); return true; },
  };
  return ctx;
}

module.exports = Object.assign(forCall(null, null), { forCall, setRegistry(f) { registry = f; }, _reset() { dirMemo.clear(); profMemo.clear(); }, _real: real, _inside: inside });
