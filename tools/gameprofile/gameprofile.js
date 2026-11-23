#!/usr/bin/env node
// gameprofile: the three games (as64, mowas_2, goh) as data. Read-only.
//   gameprofile.js show <game> [key]        facts of one game (key = exact or prefix)
//   gameprofile.js diff <a> <b>             facts that differ, as a table
//   gameprofile.js check                    form of games/*.json, every src resolves
//   gameprofile.js wired [--json]           hard-wired game facts per tool in tools/**/*.js
// A fact: { v, src: [limits row ID | path], tag: V|I|T }.
// Author: Imperator_Aug (ARSENAL, ia-8a695e9e)
'use strict';
require('../lib/help')(__filename);
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const GAMES_DIR = path.join(__dirname, 'games');
const GAMES = ['as64', 'mowas_2', 'goh'];
const TAGS = ['V', 'I', 'T'];

function load(game) {
  const f = path.join(GAMES_DIR, game + '.json');
  if (!fs.existsSync(f)) throw new Error('unknown game "' + game + '" (' + GAMES.join(', ') + ')');
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

function limitIds() {
  const ids = new Set();
  const dir = path.join(ROOT, 'limits');
  if (!fs.existsSync(dir)) return null;   // a copy without the note folders: sources are not checked
  for (const n of fs.readdirSync(dir)) {
    if (!n.endsWith('.md')) continue;
    for (const line of fs.readFileSync(path.join(dir, n), 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z][A-Z0-9]*-\d+) \|/.exec(line);
      if (m) ids.add(m[1]);
    }
  }
  return ids;
}

const show1 = v => (typeof v === 'string' ? v : JSON.stringify(v));

function cmdShow(game, key) {
  const p = load(game);
  console.log(p.game + ': ' + p.title);
  let n = 0;
  for (const k of Object.keys(p.facts).sort()) {
    if (key && k !== key && !k.startsWith(key + '.') && !k.startsWith(key)) continue;
    const f = p.facts[k]; n++;
    console.log('  ' + k + ' = ' + show1(f.v) + '  [' + f.tag + '] ' + f.src.join(' '));
  }
  if (!n) { console.log('  (no fact matches "' + key + '")'); return 1; }
  return 0;
}

function diffRows(a, b) {
  const pa = load(a), pb = load(b), rows = [];
  const keys = new Set([...Object.keys(pa.facts), ...Object.keys(pb.facts)]);
  for (const k of [...keys].sort()) {
    const fa = pa.facts[k], fb = pb.facts[k];
    if (fa && fb && show1(fa.v) === show1(fb.v)) continue;
    rows.push({ key: k, a: fa ? show1(fa.v) + ' [' + fa.tag + ']' : '(not sourced)', b: fb ? show1(fb.v) + ' [' + fb.tag + ']' : '(not sourced)' });
  }
  return rows;
}

function table(rows, cols) {
  const w = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c]).length)));
  const line = r => cols.map((c, i) => String(r[c]).padEnd(w[i])).join(' | ');
  console.log(line(Object.fromEntries(cols.map(c => [c, c]))));
  console.log(w.map(n => '-'.repeat(n)).join('-+-'));
  for (const r of rows) console.log(line(r));
}

function cmdDiff(a, b) {
  const rows = diffRows(a, b);
  table(rows, ['key', 'a', 'b']);
  console.log('\n' + rows.length + ' differing or one-sided facts (a = ' + a + ', b = ' + b + ')');
  return 0;
}

function cmdCheck() {
  const errs = [];
  const ids = limitIds();
  for (const g of GAMES) {
    const f = path.join(GAMES_DIR, g + '.json');
    let p;
    try { p = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { errs.push(g + ': ' + e.message); continue; }
    if (p.game !== g) errs.push(g + ': "game" is "' + p.game + '"');
    if (typeof p.title !== 'string') errs.push(g + ': no title');
    if (!p.facts || typeof p.facts !== 'object') { errs.push(g + ': no facts'); continue; }
    for (const [k, f1] of Object.entries(p.facts)) {
      const w = g + ' ' + k;
      if (!/^[a-z_0-9]+(\.[a-z_0-9]+)+$/.test(k)) errs.push(w + ': key form');
      if (!f1 || typeof f1 !== 'object') { errs.push(w + ': not an object'); continue; }
      if (!('v' in f1)) errs.push(w + ': no v');
      if (!TAGS.includes(f1.tag)) errs.push(w + ': tag "' + f1.tag + '" not V, I or T');
      if (!Array.isArray(f1.src) || !f1.src.length) { errs.push(w + ': no src'); continue; }
      for (const s of f1.src) {
        if (/^[A-Z][A-Z0-9]*-\d+$/.test(s)) { if (ids && !ids.has(s)) errs.push(w + ': row ' + s + ' does not exist'); }
        else if (s.startsWith('modweb/')) { if (ids && !fs.existsSync(path.join(ROOT, s))) errs.push(w + ': file ' + s + ' does not exist'); }
        else if (ids) errs.push(w + ': src "' + s + '" is neither a limits row ID nor a modweb/ path');
      }
    }
  }
  if (errs.length) { for (const e of errs) console.log('FAIL ' + e); console.log(errs.length + ' problem(s)'); return 1; }
  const n = GAMES.reduce((s, g) => s + Object.keys(load(g).facts).length, 0);
  console.log('ok: ' + GAMES.length + ' profiles, ' + n + ' facts, all src resolve');
  return 0;
}

// ---- wired: hard-wired game facts in tools/**/*.js ----
const SKIP_DIRS = new Set(['node_modules', '.git', 'gameprofile']);
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out); }
    else if (e.name.endsWith('.js')) out.push(path.join(dir, e.name));
  }
  return out;
}
const PATS = {
  exe: /\b(as64|mowas_2|call_to_arms)(_ed|_server|_workshop)?\.exe\b/g,
  branch: /(?:[=!]==?\s*|\bcase\s+|includes\(\s*)['"](?:mowas_2|as64|goh)['"]|['"](?:mowas_2|as64|goh)['"]\s*[=!]==?|\bis(?:Goh|As64|Mowas2)\b/g,
  version: /(?<![\w.])(?:3\.262|3\.265|3\.2\.6\.2|1\.067|1\.0\.6\.7)(?![\d])/g
};
function countFile(file) {
  const c = { exe: 0, branch: 0, version: 0 };
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue;
    for (const k of Object.keys(PATS)) { const m = line.match(PATS[k]); if (m) c[k] += m.length; }
  }
  return c;
}
function wired() {
  const tools = path.join(ROOT, 'tools');
  const by = {};
  for (const f of walk(tools, [])) {
    const rel = path.relative(tools, f).split(path.sep);
    if (rel.includes('test') || rel.includes('fixtures') || rel.includes('fx')) continue;   // production code only
    const tool = rel.length > 1 ? rel[0] : '(root)';
    const c = countFile(f);
    const t = by[tool] || (by[tool] = { tool, exe: 0, branch: 0, version: 0, total: 0, files: 0 });
    t.exe += c.exe; t.branch += c.branch; t.version += c.version;
    const s = c.exe + c.branch + c.version;
    t.total += s; if (s) t.files++;
  }
  return Object.values(by).filter(t => t.total).sort((a, b) => b.total - a.total || a.tool.localeCompare(b.tool));
}
function cmdWired(json) {
  const rows = wired();
  const total = rows.reduce((s, r) => s + r.total, 0);
  if (json) { console.log(JSON.stringify({ total, tools: rows }, null, 1)); return 0; }
  table(rows, ['tool', 'total', 'exe', 'branch', 'version', 'files']);
  console.log('\n' + rows.length + ' tools with hard-wired facts, ' + total + ' in all (non-test .js, comment lines skipped)');
  return 0;
}

function main(argv) {
  const [cmd, ...r] = argv;
  try {
    if (cmd === 'show' && r[0]) return cmdShow(r[0], r[1]);
    if (cmd === 'diff' && r[0] && r[1]) { load(r[0]); load(r[1]); return cmdDiff(r[0], r[1]); }
    if (cmd === 'check') return cmdCheck();
    if (cmd === 'wired') return cmdWired(r.includes('--json'));
  } catch (e) { console.error('error: ' + e.message); return 2; }
  console.error('usage: gameprofile.js show <game> [key] | diff <a> <b> | check | wired [--json]   games: ' + GAMES.join(' '));
  return 2;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { countFile, load, diffRows, wired, limitIds, GAMES };
