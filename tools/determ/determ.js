#!/usr/bin/env node
// Author: Imperator_Aug (ARSENAL, ia-af26567e)
'use strict';
// determ: "deterministic" as a measured number. Each command in commands.json runs twice as a child node process:
//   A: cwd = repo, TMP = rootA/tmp, TZ = UTC, no shim
//   B: cwd = rootB/c/wd, TMP = rootB/tmp, TZ = Pacific/Chatham, -r shim.js (Date +400 days, fs stat times +400 days, readdir reversed)
// Outputs (stdout, exit code, named files, named folders) are compared byte for byte after each run's temp root is replaced by <TMP>.
// A command that differs is re-run with one factor changed at a time (repeat, clock, order, tz, path); the first one that
// reproduces the difference is the cause. None alone: a guess from the differing line.
// Commands are static tools on fixtures inside the repo: nothing here starts a game or editor or needs G/H.
// usage: node tools/determ/determ.js [--only a,b] [--json f] [--commands f] [--work dir] [--keep] [-q]
// exit 0 all same, 1 any differ, 2 usage or setup failure
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');

const R = path.resolve(__dirname, '..', '..');
const SHIM = path.join(__dirname, 'shim.js');
const FORBID = /\b(prove|batch|uidrive|bootloop|testrun|edrun|inplay|gamewatch)[\\/]/;

function usage(m, rc = 2) {
  if (m) console.error('determ: ' + m);
  (rc ? console.error : console.log)('usage: node tools/determ/determ.js [--only a,b] [--json f] [--commands f] [--work dir] [--keep] [-q]\n  exit 0 all same, 1 any differ, 2 usage or setup failure');
  process.exit(rc);
}
function args(argv) {
  const o = { commands: path.join(__dirname, 'commands.json'), work: os.tmpdir(), only: null, json: null, keep: false, q: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => (i + 1 < argv.length ? argv[++i] : usage(a + ' needs a value'));
    if (a === '--only') o.only = v().split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--json') o.json = v();
    else if (a === '--commands') o.commands = v();
    else if (a === '--work') o.work = v();
    else if (a === '--keep') o.keep = true;
    else if (a === '-q') o.q = true;
    else if (a === '-h' || a === '--help') usage('', 0);
    else usage('unknown option ' + a);
  }
  o.work = path.resolve(o.work);
  return o;
}

const fwd = p => p.replace(/\\/g, '/');
function subst(s, root) { return s.replace(/\{R\}/g, fwd(R)).replace(/\{T\}/g, fwd(path.join(root, 't'))); }

// every spelling of a root a tool may print: native, forward slashes, JSON-escaped, realpath, lower-case drive
function rootForms(root) {
  const set = new Set();
  for (const r of [root, (() => { try { return fs.realpathSync.native(root); } catch { return root; } })()]) {
    for (const p of [r, fwd(r), r.replace(/\\/g, '\\\\')]) { set.add(p); set.add(p.replace(/^[A-Z]:/, d => d.toLowerCase())); set.add(p.replace(/^[a-z]:/, d => d.toUpperCase())); }
  }
  return [...set].sort((a, b) => b.length - a.length);
}
function norm(buf, root) {
  let s = buf.toString('latin1');   // byte-preserving: 1 char per byte, so the replace never re-encodes
  for (const f of rootForms(root)) s = s.split(Buffer.from(f, 'utf8').toString('latin1')).join('<TMP>');
  return s;
}

function dirText(dir, root) {
  if (!fs.existsSync(dir)) return '(no folder)\n';
  const files = [];
  (function walk(d, rel) {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).map(e => e.name).sort()) {
      const p = path.join(d, e), r = rel ? rel + '/' + e : e, st = fs.lstatSync(p);
      if (st.isDirectory()) { files.push('== ' + r + '/'); walk(p, r); } else files.push(r);
    }
  })(dir, '');
  let out = '';
  for (const f of files) {
    if (f.startsWith('== ')) { out += f + '\n'; continue; }
    const b = fs.readFileSync(path.join(dir, f));
    const bin = b.subarray(0, 4096).includes(0);
    if (bin) {
      // binary (paks, mdl): hash after the root replace is impossible, so hash raw bytes; first 64 differing bytes shown on mismatch
      out += '== ' + f + ' bin ' + b.length + ' sha1 ' + crypto.createHash('sha1').update(b).digest('hex') + '\n' + 'HEX ' + b.subarray(0, 512).toString('hex').replace(/(.{64})/g, '$1\nHEX ') + '\n';
    } else out += '== ' + f + '\n' + norm(b, root) + (b.length && b[b.length - 1] === 10 ? '' : '\n');
  }
  return out;
}

const VARIANTS = {
  A: { cwd: 'repo', tz: 'UTC', clock: 0, order: 0 },
  B: { cwd: 'other', tz: 'Pacific/Chatham', clock: 1, order: 1 },
  repeat: { cwd: 'repo', tz: 'UTC', clock: 0, order: 0 },
  clock: { cwd: 'repo', tz: 'UTC', clock: 1, order: 0 },
  order: { cwd: 'repo', tz: 'UTC', clock: 0, order: 1 },
  tz: { cwd: 'repo', tz: 'Pacific/Chatham', clock: 0, order: 0 },
  path: { cwd: 'other', tz: 'UTC', clock: 0, order: 0 },
};

let seq = 0;
function baseEnv(root) {
  const env = { ...process.env };
  for (const k of ['AS2_GAME', 'GOH_GAME', 'NODE_OPTIONS', 'DETERM_CLOCK', 'DETERM_ORDER', 'TEST_WORK']) delete env[k];
  env.AS2_NO_STEAM = '1'; env.GOH_NO_STEAM = '1';
  const tmp = path.join(root, 'tmp');
  env.TMP = env.TEMP = env.TMPDIR = tmp;
  return env;
}
function child(argv, opt) {
  return cp.spawnSync(process.execPath, argv, { maxBuffer: 1 << 28, windowsHide: true, timeout: opt.timeout || 300000, ...opt });
}

// one run of one command in a fresh root; returns { text: {label: string}, root, err }
function runOnce(c, vname, o, fixedRoot) {
  const v = VARIANTS[vname];
  // root names differ in length per variant on purpose: column padding that follows the folder shows up as a path cause.
  // fixedRoot: the ablation runs other than path re-create run A's exact root, so a cwd-relative path cannot pose as clock/order/tz/repeat
  let root;
  if (fixedRoot && !fs.existsSync(fixedRoot)) { fs.mkdirSync(fixedRoot); root = fixedRoot; }
  else root = fs.mkdtempSync(path.join(o.work, 'determ-' + vname + '-'.repeat(1 + (seq++ % 3)) + c.id.replace(/[^a-z0-9]/gi, '') + '-'));
  try {
    for (const k of ['t', 'tmp', path.join('c', 'wd')]) fs.mkdirSync(path.join(root, k), { recursive: true });
    const env0 = baseEnv(root);
    for (const st of c.setup || []) {
      if (st.copy) { fs.cpSync(subst(st.copy[0], root), subst(st.copy[1], root), { recursive: true }); continue; }
      const argv = (st.run || st).map(a => subst(a, root));
      if (argv[0] !== 'node') return { root, err: 'setup must be node: ' + argv.join(' ') };
      const env = { ...env0 }; for (const [k, val] of Object.entries(st.env || {})) env[k] = subst(val, root);
      const r = child(argv.slice(1), { cwd: root, env, encoding: 'buffer' });
      if (r.status !== 0) return { root, err: 'setup failed (' + r.status + '): ' + argv.slice(1).join(' ') + '\n' + String(r.stderr || '').slice(0, 400) };
    }
    const env = { ...env0, TZ: v.tz };
    for (const [k, val] of Object.entries(c.env || {})) env[k] = subst(val, root);
    let argv = c.args.map(a => subst(a, root));
    if (v.clock || v.order) {
      env.DETERM_CLOCK = v.clock ? '1' : '0'; env.DETERM_ORDER = v.order ? '1' : '0';
      env.NODE_OPTIONS = '--require "' + fwd(SHIM) + '"';   // grandchildren (tools that spawn tools) get the shim too
      argv = ['-r', SHIM, ...argv];
    }
    const cwd = v.cwd === 'repo' ? R : path.join(root, 'c', 'wd');
    const r = child(argv, { cwd, env, encoding: 'buffer', timeout: c.timeout || 300000 });
    const text = {};
    text.exit = String(r.error ? 'error ' + r.error.code : r.status) + '\n';
    for (const out of c.out || ['stdout']) {
      if (out === 'stdout') text.stdout = norm(r.stdout || Buffer.alloc(0), root);
      else if (out === 'stderr') text.stderr = norm(r.stderr || Buffer.alloc(0), root);
      else if (out.startsWith('file:')) { const f = path.join(root, 't', out.slice(5)); text[out] = fs.existsSync(f) ? norm(fs.readFileSync(f), root) : '(no file)\n'; }
      else if (out.startsWith('dir:')) text[out] = dirText(path.join(root, 't', out.slice(4)), root);
    }
    const raw = Buffer.concat([r.stdout || Buffer.alloc(0), r.stderr || Buffer.alloc(0)]).toString('latin1');
    const steam = /SteamLibrary/i.test(raw);
    return { root, text, steam, stderrTail: String(r.stderr || '').trim().split('\n').slice(-2).join(' | ').slice(0, 200) };
  } finally {
    if (!o.keep) try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* left for the OS */ }
  }
}

function firstDiff(a, b) {
  const labels = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  for (const l of labels) {
    const x = a[l] || '', y = b[l] || '';
    if (x === y) continue;
    const xs = x.split('\n'), ys = y.split('\n');
    let i = 0; while (i < xs.length && i < ys.length && xs[i] === ys[i]) i++;
    // long shared prefix: show from 16 chars before the first differing character
    let k = 0; const p = xs[i] || '', q = ys[i] || ''; while (k < p.length && k < q.length && p[k] === q[k]) k++;
    const from = k > 40 ? k - 16 : 0;
    const cut = s => { s = (from ? '...' : '') + Buffer.from((s || '').slice(from), 'latin1').toString('utf8').replace(/\r$/, ''); return s.length > 66 ? s.slice(0, 63) + '...' : s; };
    return { label: l, line: i + 1, a: xs[i], b: ys[i], first: (l + ':' + (i + 1) + ': ' + cut(xs[i]) + ' || ' + cut(ys[i])).slice(0, 160) };
  }
  return null;
}
const same = (a, b) => !firstDiff(a, b);

const ELAPSED = /\d(\.\d+)? ?(ms|s|sec|seconds?)\b|"(ms|elapsed|took|time|timings?|durations?)"/i;
// the two lines differ only in digits and one reads as a duration (a "ms" unit or a timing key)
const elapsed = d => (d.a || '').replace(/\d+/g, '#') === (d.b || '').replace(/\d+/g, '#') && ELAPSED.test(d.a + ' ' + d.b);
function guess(d) {
  const t = (d.a || '') + ' ' + (d.b || '');
  if (/\d{4}-\d\d-\d\d|\d\d:\d\d:\d\d|\b1[5-9]\d{11}\b|GMT[+-]\d{4}/.test(t)) return 'clock';
  if (/<TMP>|[\\/]/.test(t)) return 'path';
  return 'other';
}

function main() {
  const o = args(process.argv.slice(2));
  let list;
  try { list = JSON.parse(fs.readFileSync(o.commands, 'utf8')).commands; } catch (e) { usage('commands file: ' + e.message); }
  if (o.only) { const miss = o.only.filter(id => !list.some(c => c.id === id || c.tool === id)); if (miss.length) usage('unknown id: ' + miss.join(',')); list = list.filter(c => o.only.includes(c.id) || o.only.includes(c.tool)); }
  for (const c of list) if (FORBID.test(c.args.join(' '))) usage(c.id + ': a game or editor starter is not allowed here');
  if (!fs.existsSync(o.work)) usage('work folder not found: ' + o.work);
  list = list.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const res = []; let setupFail = 0;
  for (const c of list) {
    const A = runOnce(c, 'A', o), B = runOnce(c, 'B', o);
    const row = { id: c.id, tool: c.tool, same: true, first: '', cause: '' };
    if (A.err || B.err) { row.same = false; row.first = String(A.err || B.err).split('\n')[0].slice(0, 160); row.cause = 'other'; setupFail++; }
    else {
      const d = firstDiff(A.text, B.text);
      if (d) {
        row.same = false; row.first = d.first;
        for (const v of ['repeat', 'clock', 'order', 'tz', 'path']) {
          const X = runOnce(c, v, o, v === 'path' ? null : A.root);
          if (X.err) continue;
          // a plain repeat differs: elapsed time ("in 36 ms") is clock, anything else (random, races) other
          if (!same(A.text, X.text)) { row.cause = v !== 'repeat' ? v : elapsed(d) ? 'clock' : 'other'; break; }
        }
        if (!row.cause) row.cause = guess(d);
      }
      if (A.steam || B.steam) row.note = 'output names a SteamLibrary path: the command reached a real install';
      if (A.text.exit !== '0\n' && A.text.exit !== '1\n') row.note = (row.note ? row.note + '; ' : '') + 'exit ' + A.text.exit.trim() + ': ' + A.stderrTail;
    }
    res.push(row);
    if (!o.q) console.log((row.same ? 'SAME ' : 'DIFF ') + row.id.padEnd(18) + ' ' + (row.cause || '').padEnd(6) + ' ' + row.first + (row.note ? '  [' + row.note + ']' : ''));
  }
  const counts = { all: res.length, same: res.filter(r => r.same).length };
  console.log(`${counts.same} of ${counts.all} commands same bytes` + (setupFail ? `, ${setupFail} setup failures` : ''));
  if (o.json) {
    const j = { form: 'determ/1', commands: res.map(r => { const x = { id: r.id, tool: r.tool, same: r.same, first: r.first, cause: r.cause }; if (r.note) x.note = r.note; return x; }), counts };
    fs.writeFileSync(o.json, JSON.stringify(j, null, 1) + '\n');
  }
  return setupFail ? 2 : counts.same === counts.all ? 0 : 1;
}
module.exports = { firstDiff, norm, guess };
if (require.main === module) process.exitCode = main();
