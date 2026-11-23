#!/usr/bin/env node
// Author: Imperator_Aug (ARSENAL, ia-1bd39e4c)
'use strict';
// ttest.js: runs each repo test listed in tools/score/caps.json once and records the result for board row T "How we prove it").
//   node tools/score/ttest.js [--caps caps.json] [--out last.json] [--root DIR] [--only id,id] [--dry]
// One run per test, no reruns. A run.sh runs under sh, a .js under node, from --root (default the repo, src/). Pass = exit 0 and the last output
// line is not FAIL. A listed test whose file is not there is recorded as missing, never failed; a cap with test null runs nothing.
// Writes --out (default ../run/tests/last.json): { date, root, tests: { <test path>: { result pass|fail|missing, src, sha, date, ms, tail } } }.
// sha = git blob sha1 of the tool's main source (caps.json src, else tools/<dir>/<dir>.js beside the test); score.js marks a result stale when it changed.
// --only runs the listed cap ids and keeps the other entries of an existing last.json. --dry prints what would run, writes nothing.
require('../lib/help')(__filename);
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const HERE = __dirname;
const SRC = path.resolve(HERE, '..', '..');
const DEF_CAPS = path.join(HERE, 'caps.json');
const DEF_OUT = path.resolve(SRC, '..', 'run', 'tests', 'last.json');

const list = x => (x == null ? [] : Array.isArray(x) ? x : [x]);
function readCaps(f) {
  const j = JSON.parse(fs.readFileSync(f || DEF_CAPS, 'utf8'));
  return Array.isArray(j) ? j : (j.caps || []);
}
// the main source of the tool a test belongs to: caps src (same index as the test), else tools/<dir>/<dir>.js, else the test file itself
function srcOf(cap, i, root) {
  const s = list(cap.src);
  if (s[i] || (s.length === 1 && list(cap.test).length === 1)) return s[i] || s[0];
  const t = list(cap.test)[i];
  const m = /^tools\/([^/]+)\//.exec(String(t || '').replace(/\\/g, '/'));
  if (m) { const p = 'tools/' + m[1] + '/' + m[1] + '.js'; if (fs.existsSync(path.resolve(root, p))) return p; }
  return t;
}
// git blob sha1 (same as `git hash-object`), null when the file is not there
function shaOf(file) {
  let b; try { b = fs.readFileSync(file); } catch (e) { return null; }
  return crypto.createHash('sha1').update('blob ' + b.length + '\0').update(b).digest('hex');
}
function runOne(test, root) {
  const f = path.resolve(root, test);
  const t0 = Date.now();
  const r = /\.js$/i.test(test)
    ? cp.spawnSync(process.execPath, [f], { cwd: root, encoding: 'utf8', timeout: 900000, maxBuffer: 64 << 20 })
    : cp.spawnSync('sh', [f], { cwd: root, encoding: 'utf8', timeout: 900000, maxBuffer: 64 << 20 });
  const out = String(r.stdout || '') + String(r.stderr || '');
  const lines = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const last = lines[lines.length - 1] || '';
  const pass = !r.error && r.status === 0 && !/^FAIL\b/.test(last);
  return { result: pass ? 'pass' : 'fail', ms: Date.now() - t0, tail: r.error ? String(r.error.message || r.error) : last.slice(0, 200) };
}

function run(o) {
  o = o || {};
  const root = o.root || SRC, caps = readCaps(o.caps);
  const only = o.only ? new Set(o.only) : null;
  const prev = only ? (() => { try { return JSON.parse(fs.readFileSync(o.out || DEF_OUT, 'utf8')); } catch (e) { return null; } })() : null;
  const date = o.date || new Date().toISOString();
  const tests = Object.assign({}, prev && prev.tests);
  const plan = [];
  for (const c of caps) {
    if (only && !only.has(c.id)) continue;
    list(c.test).forEach((t, i) => plan.push({ cap: c.id, test: t, src: srcOf(c, i, root) }));
  }
  const seen = new Set();
  for (const p of plan) {
    if (seen.has(p.test)) continue; seen.add(p.test);   // a test listed by two caps runs once
    if (o.dry) { console.log('would run ' + p.test + ' (' + p.cap + ', src ' + p.src + ')'); continue; }
    const e = { src: p.src, sha: shaOf(path.resolve(root, p.src)), date };
    if (!fs.existsSync(path.resolve(root, p.test))) Object.assign(e, { result: 'missing', ms: 0, tail: 'test file not found' });
    else Object.assign(e, runOne(p.test, root));
    tests[p.test] = e;
    console.log(e.result.toUpperCase().padEnd(8) + p.test + ' (' + p.cap + ', ' + e.ms + ' ms)' + (e.result === 'fail' ? ': ' + e.tail : ''));
  }
  if (o.dry) return null;
  const res = { date, root: path.relative(path.dirname(path.resolve(o.out || DEF_OUT)), root).replace(/\\/g, '/') || '.', tests };
  const outF = o.out || DEF_OUT;
  fs.mkdirSync(path.dirname(outF), { recursive: true });
  fs.writeFileSync(outF, JSON.stringify(res, null, 1) + '\n');
  const v = Object.values(tests);
  console.log(v.filter(x => x.result === 'pass').length + ' pass, ' + v.filter(x => x.result === 'fail').length + ' fail, ' + v.filter(x => x.result === 'missing').length + ' missing -> ' + outF);
  return res;
}

// ---------- read side, used by score.js row T (reads files only, runs nothing) ----------
// per cap: missing (test null, a test file not there, or recorded missing) | not run (no entry) | stale (source sha changed) | fail | pass
function scoreT(o) {
  o = o || {};
  const root = o.root || SRC;
  let caps;
  try { caps = readCaps(o.caps); } catch (e) { return { measured: false, text: 'not measured (no tools/score/caps.json)' }; }
  let last = null; try { last = JSON.parse(fs.readFileSync(o.last || DEF_OUT, 'utf8')); } catch (e) { /* none yet */ }
  const T = (last && last.tests) || {};
  const per = caps.map(c => {
    const ts = list(c.test);
    if (!ts.length) return { id: c.id, state: 'missing', why: 'no test yet' };
    const st = ts.map((t, i) => {
      if (!fs.existsSync(path.resolve(root, t))) return 'missing';
      const e = T[t];
      if (!e) return 'not run';
      if (e.result === 'missing') return 'missing';
      const sha = shaOf(path.resolve(root, srcOf(c, i, root)));
      if (!e.sha || sha !== e.sha) return 'stale';
      return e.result === 'pass' ? 'pass' : 'fail';
    });
    const order = ['missing', 'not run', 'stale', 'fail', 'pass'];
    return { id: c.id, state: order.find(s => st.includes(s)), tests: ts.map((t, i) => t + ' ' + st[i]) };
  });
  const by = s => per.filter(p => p.state === s).map(p => p.id);
  const pass = by('pass'), miss = by('missing'), stale = by('stale'), fail = by('fail'), notRun = by('not run');
  const text = pass.length + ' of ' + caps.length + ' capabilities pass (' + miss.length + ' missing, ' + stale.length + ' stale)' +
    (fail.length ? '; fail: ' + fail.join(' ') : '') + (notRun.length ? '; not run: ' + notRun.length + (last ? '' : ' (no ../run/tests/last.json: run tools/score/ttest.js)') : '') +
    (miss.length ? '; no test: ' + miss.join(' ') : '');
  return { measured: true, n: pass.length, of: caps.length, pass, missing: miss, stale, fail, notRun, per, date: last && last.date, text };
}

function main() {
  const a = process.argv.slice(2), o = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--caps') o.caps = a[++i]; else if (a[i] === '--out') o.out = a[++i]; else if (a[i] === '--root') o.root = path.resolve(a[++i]);
    else if (a[i] === '--only') o.only = String(a[++i]).split(','); else if (a[i] === '--dry') o.dry = true;
    else { console.error('ttest: unknown argument ' + a[i]); return 2; }
  }
  const r = run(o);
  return r && Object.values(r.tests).some(x => x.result === 'fail') ? 1 : 0;
}
module.exports = { readCaps, srcOf, shaOf, run, scoreT, DEF_OUT, DEF_CAPS };
if (require.main === module) { const rc = main(); if (rc) process.exitCode = rc; }
