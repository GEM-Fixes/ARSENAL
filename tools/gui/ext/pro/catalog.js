// pro ext: the tool catalogue for the "All tools" launcher (E-13). Source = tools/index/*.md (line form `name | run line | rows | what`)
// plus `- name — what` bullets in tools/INDEX.md. Inside the single exe the md files are absent: catalog.json (made by gen-catalog.js) is used.
// Author: Imperator_Aug (ARSENAL, ia-7e243562)
'use strict';
const fs = require('fs'), path = require('path');

const SPLIT = /\s\|\s/;   // " | " separates cells; " \| " inside a run line is an escaped pipe and stays

function parseLine(line, group, toolsDir) {
  if (!line.trim() || line.startsWith('#')) return null;
  const cells = line.split(SPLIT).map(s => s.trim());
  if (cells.length < 2) return null;
  const name = cells[0].replace(/`/g, '').trim();
  if (!name || /\s{2,}/.test(name) || name.length > 40) return null;
  const run = cells[1].replace(/`/g, '').replace(/\\\|/g, '|').trim();
  const what = cells.length > 2 ? cells[cells.length - 1].replace(/\\\|/g, '|').trim() : '';
  const m = /node\s+tools\/([\w./-]+?\.js)/.exec(cells[1]);
  const entry = m ? m[1] : null;
  const retired = /RETIRED/.test(cells[1]) || (entry && entry.startsWith('_retired/'));
  return { name, group, run: run.slice(0, 600), what: what.slice(0, 900), entry, retired: !!retired };
}

function parseAll(toolsDir) {
  const dir = path.join(toolsDir, 'index');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
  const out = [], seen = new Set();
  for (const f of files) {
    const group = f.replace(/\.md$/, '');
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/)) {
      const t = parseLine(line, group, toolsDir);
      if (t && !seen.has(t.name)) { seen.add(t.name); out.push(t); }
    }
  }
  // bullets in INDEX.md: "- gemindex — what"
  try {
    for (const line of fs.readFileSync(path.join(toolsDir, 'INDEX.md'), 'utf8').split(/\r?\n/)) {
      const m = /^- ([a-z][\w-]*) [—-]+ (.+)$/.exec(line);
      if (!m || seen.has(m[1])) continue;
      const e = m[1] + '/' + m[1] + '.js';
      seen.add(m[1]);
      out.push({ name: m[1], group: 'other', run: 'node tools/' + e, what: m[2].slice(0, 900), entry: fs.existsSync(path.join(toolsDir, e)) ? e : null, retired: false });
    }
  } catch (e) { /* no INDEX.md */ }
  return out;
}

// ---- maintainer-only tools (GT-24): marked dev:true, kept in the catalogue rows, never listed or run by the launcher.
//   1. every row of tools/index/dev.md (group 'dev': usage, wave, sessions, notes, brief, scaffold, ...)
//   2. tools the release exe leaves out as commands: RELEASE_DROP + MODULE_ONLY in tools/dist/zip.js (read-only; absent in the exe,
//      where catalog.json already carries the marks made by gen-catalog.js)
//   3. policy BLOCK reasons 'dev' (maintainer only) and 'nocli' (a library or a document, not a command)
//   4. DEV_EXTRA: release and build tooling for the maintainers
const DEV_EXTRA = ['dist', 'release-check', 'gui', 'scrub', 'relscrub', 'markcheck', 'credit', 'docgen', 'sessions', 'wave', 'notes', 'brief', 'scaffold', 'usage',
  'determ', 'helpcheck', 'limmap', 'exam', 'lib/model'];   // test harnesses, limits upkeep, the exam runner, a library
// releaseLeftOut reads text only (never runs zip.js). What it expects in tools/dist/zip.js: each of LEFT_KEYS is set by one
// statement `const NAME = <expr>;` (any layout, any line). Inside <expr> it takes every quoted string as a comma list of tool
// names (so 'a,b' + OTHER, ['a', 'b'] and 'a,' + 'b' all work), follows a bare reference to another LEFT_KEYS name, and for a
// require('../as2/as2.js').MODULE_ONLY it reads the MODULE_ONLY array of tools/as2/as2.js (the one list both files share).
// Anything else in the expression is ignored; a missing name gives no entries (and no error).
const LEFT_KEYS = ['FRONT_DOOR_DROP', 'MODULE_ONLY', 'RELEASE_DROP'];
const TOOL_NAME = /^[a-z][a-z0-9-]*$/;
function constExpr(txt, k) {
  const m = new RegExp('\\bconst\\s+' + k + '\\s*=\\s*([^;]*);').exec(txt);
  return m ? m[1].replace(/\/\/[^\n]*/g, '') : null;
}
function quotedNames(expr) {
  const out = [];
  for (const m of expr.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`$]*)`/g)) {
    const s = m[1] != null ? m[1] : m[2] != null ? m[2] : m[3];
    if (/[./\\]/.test(s)) continue;   // a path in a require(), not a tool list
    for (const n of s.split(',')) if (TOOL_NAME.test(n.trim())) out.push(n.trim());
  }
  return out;
}
function releaseLeftOut(toolsDir) {
  const out = new Set();
  let txt = ''; try { txt = fs.readFileSync(path.join(toolsDir, 'dist', 'zip.js'), 'utf8'); } catch (e) { return out; }
  let as2 = null;
  const as2Module = () => {
    if (as2 === null) { as2 = []; try { const e = constExpr(fs.readFileSync(path.join(toolsDir, 'as2', 'as2.js'), 'utf8'), 'MODULE_ONLY'); if (e) as2 = quotedNames(e); } catch (e) { /* no as2.js */ } }
    return as2;
  };
  const seen = new Set();
  const take = k => {
    if (seen.has(k)) return; seen.add(k);
    const e = constExpr(txt, k); if (e == null) return;
    for (const n of quotedNames(e)) out.add(n);
    if (/require\([^)]*as2(\.js)?['"]\)\s*\.\s*MODULE_ONLY/.test(e)) for (const n of as2Module()) out.add(n);
    for (const o of LEFT_KEYS) if (o !== k && new RegExp('\\b' + o + '\\b').test(e)) take(o);
  };
  for (const k of LEFT_KEYS) take(k);
  return out;
}
const baseName = n => String(n || '').split(/[ /]/)[0];
function isDev(t, left) {
  const P = require('./policy');
  const b = baseName(t.name);
  if (t.group === 'dev' || t.dev) return true;
  if (left.has(t.name) || left.has(b) || DEV_EXTRA.includes(t.name) || DEV_EXTRA.includes(b)) return true;
  const why = P.blockOf(t.name);   // a BLOCK row or a blocked family (policy BLOCK_FAMILY)
  return why === 'dev' || why === 'nocli';
}
// mark(tools, toolsDir) -> same rows, each with dev true|false
function mark(tools, toolsDir) {
  const left = releaseLeftOut(toolsDir);
  for (const t of tools) t.dev = isDev(t, left);
  return tools;
}

// load(toolsDir) -> {tools, from:'index'|'bundled'}; every row carries dev (maintainer-only: hidden by the launcher)
function load(toolsDir) {
  try { const t = parseAll(toolsDir); if (t.length) return { tools: mark(t, toolsDir), from: 'index' }; } catch (e) { /* exe or no index: bundled list */ }
  let t = [];
  try { t = require('./catalog.json').tools.map(x => Object.assign({}, x)) || []; } catch (e) { t = []; }
  return { tools: mark(t, toolsDir), from: 'bundled' };
}
// what the launcher lists and runs: the rows a user may see
function visible(tools) { return tools.filter(t => !t.dev); }

// first comment block of the tool's source file (its usage header); null when the file is absent (exe)
function header(toolsDir, entry, max) {
  if (!entry) return null;
  const f = path.join(toolsDir, entry);
  let txt; try { txt = fs.readFileSync(f, 'utf8'); } catch (e) { return null; }
  const lines = txt.split(/\r?\n/), out = [];
  let i = 0;
  if (lines[0] && lines[0].startsWith('#!')) i = 1;
  for (; i < lines.length && out.length < (max || 60); i++) {
    const l = lines[i];
    if (/^\s*\/\//.test(l)) out.push(l.replace(/^\s*\/\/ ?/, ''));
    else if (/^\s*'use strict'/.test(l) || (!l.trim() && !out.length)) continue;
    else break;
  }
  return out.filter(l => !/^Author: /.test(l)).join('\n');
}

module.exports = { load, parseAll, parseLine, header, mark, visible, releaseLeftOut, DEV_EXTRA };
