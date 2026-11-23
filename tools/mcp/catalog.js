#!/usr/bin/env node
// mcp catalog: writes tools/mcp/CATALOG.md, one line for every tool of both MCP servers and every skill.
//   node tools/mcp/catalog.js            write CATALOG.md (prints what changed)
//   node tools/mcp/catalog.js --check    exit 1 when CATALOG.md is not what would be written now (tools/mcp/test/run.sh)
//   node tools/mcp/catalog.js --print    print it, write nothing
//   --out <file>     write (or --check) that file instead of CATALOG.md: a scratch copy, tests
//   --skills <dir>   read the skills from that folder instead of .claude/skills (tests)
// Sources, nothing typed by hand:
//   arsenal      the modules server.js loads (lib/registry.js), listed by tool group in the fixed order of the README (a tool's own
//                `group`, else its module's); a module that did not load is named
//   arsenal-gui  tools/mcp/gui.js when it is there: its exported `tools` list (array, or a function giving one) or `listTools()`,
//                read with require() when the file guards its start with require.main, else `node gui.js --list` printing JSON
//                (an array, or { tools: [...] }; each { name, title?, description, kind? }). No gui.js: the section says so.
//   skills       .claude/skills/*/SKILL.md frontmatter: name, description, and its line count; under it every other .md of the skill
//                folder (sub-folders too), one line each: its first heading, else its first line, and its line count
// Line limits (README "Pieces, groups and downloads"): SKILL.md at most 60 lines, a sub-file at most 80. Files over the limit are
// named on every run; --check fails on them only when env ARSENAL_SKILL_LIMITS=1 (set in tools/mcp/test/run.sh).
// No dates in the file, so --check only fails on a real change.
// Author: Imperator_Aug (ARSENAL, ia-7d815fcb)
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const registry = require('./lib/registry');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = path.join(__dirname, 'CATALOG.md'), GUI = path.join(__dirname, 'gui.js');

const one = (s, max) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > max ? s.slice(0, max - 3).replace(/\s+\S*$/, '') + '...' : s; };
const first = s => { s = String(s || '').replace(/\s+/g, ' ').trim(); const m = /^(.{20,}?[.!?])(\s|$)/.exec(s); return one(m ? m[1] : s, 220); };

function guiTools() {
  if (!fs.existsSync(GUI)) return { tools: null, why: 'tools/mcp/gui.js is not there yet' };
  let list = null, why = '';
  const norm = v => { if (typeof v === 'function') v = v(); if (v && !Array.isArray(v) && Array.isArray(v.tools)) v = v.tools; return Array.isArray(v) ? v : null; };
  let src = ''; try { src = fs.readFileSync(GUI, 'utf8'); } catch (e) { src = ''; }
  if (/require\.main/.test(src)) {
    try { const m = require(GUI); list = norm(m.tools) || (typeof m.listTools === 'function' ? norm(m.listTools()) : null); if (!list) why = 'gui.js exports no tools list'; }
    catch (e) { why = 'gui.js did not load: ' + String(e && e.message || e).split('\n')[0]; }
  }
  if (!list) {
    const r = spawnSync(process.execPath, [GUI, '--list'], { encoding: 'utf8', input: '', timeout: 30000, windowsHide: true, maxBuffer: 16 << 20 });
    try { list = norm(JSON.parse(r.stdout)); } catch (e) { list = null; }
    if (!list) why = why || 'gui.js --list printed no JSON tool list';
  }
  if (!list) return { tools: null, why };
  return { tools: list.filter(t => t && typeof t.name === 'string').map(t => ({ name: t.name, title: t.title || (t.annotations && t.annotations.title) || '', description: t.description || '', kind: t.kind || (t.annotations && t.annotations.readOnlyHint ? 'read' : '') })) };
}

const LIMIT = { skill: 60, sub: 80 };
const lineCount = text => { const l = String(text).replace(/\r\n/g, '\n').split('\n'); while (l.length && !l[l.length - 1].trim()) l.pop(); return l.length; };
// the first heading of a sub-file, else its first line that says something (frontmatter skipped)
function headOf(text) {
  const body = String(text).replace(/^﻿/, '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const h = /^#{1,6}\s+(.+?)\s*#*\s*$/m.exec(body);
  if (h) return h[1];
  const l = body.split(/\r?\n/).find(x => x.trim() && !/^(```|<!--)/.test(x.trim()));
  return l ? l.trim() : '';
}
function mdFiles(dir, rel) {   // every .md under a skill folder but its SKILL.md, as forward-slash paths
  const out = [];
  let ents = []; try { ents = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch (e) { return out; }
  for (const e of ents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) out.push(...mdFiles(dir, r)); }
    else if (/\.md$/i.test(e.name) && r !== 'SKILL.md') out.push(r);
  }
  return out;
}
function skills(dir) {
  dir = dir || path.join(ROOT, '.claude', 'skills');
  const out = [];
  let names = []; try { names = fs.readdirSync(dir).sort(); } catch (e) { return out; }
  for (const n of names) {
    let text; try { text = fs.readFileSync(path.join(dir, n, 'SKILL.md'), 'utf8'); } catch (e) { continue; }
    const fm = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(text), o = { name: n, description: '', lines: lineCount(text), files: [] };
    if (fm) {
      const lines = fm[1].split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const m = /^(name|description):\s*(.*)$/.exec(lines[i]);
        if (!m) continue;
        let v = m[2].trim();
        if (/^[>|][+-]?$/.test(v) || v === '') { v = ''; while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) v += ' ' + lines[++i].trim(); }
        o[m[1]] = v.replace(/^(["'])([\s\S]*)\1$/, '$2').trim();
      }
    }
    o.dir = n;
    for (const f of mdFiles(path.join(dir, n), '')) {
      let t = ''; try { t = fs.readFileSync(path.join(dir, n, f), 'utf8'); } catch (e) { continue; }
      o.files.push({ file: f, lines: lineCount(t), head: headOf(t) });
    }
    out.push(o);
  }
  return out;
}
// -> [{ file: '<skill>/<file>', lines, limit }] for every skill file over its line limit
function overLimit(sk) {
  const out = [];
  for (const s of sk) {
    if (s.lines > LIMIT.skill) out.push({ file: s.dir + '/SKILL.md', lines: s.lines, limit: LIMIT.skill });
    for (const f of s.files) if (f.lines > LIMIT.sub) out.push({ file: s.dir + '/' + f.file, lines: f.lines, limit: LIMIT.sub });
  }
  return out;
}

function build(opt) {
  const reg = registry.load(), L = [];
  L.push('# CATALOG: MCP tools and skills', '',
    'Generated by `node tools/mcp/catalog.js`. Do not edit: change the tool module, the GUI registry or the skill, then run it again.',
    'Contract: [README.md](README.md). Setup: [install.md](install.md).', '');
  L.push('## Server `arsenal` (' + reg.tools.length + ' tools, ' + reg.groups.all.length + ' groups)', '',
    'Every tool takes `game` = as64, mowas2 or goh. kind: read = changes nothing; write = a preview unless `write: true` and the folder is in ARSENAL_WRITE_ROOTS; launch = starts or drives the game, needs ARSENAL_ALLOW_LAUNCH=1.',
    'Listed by group. `node tools/mcp/server.js --groups a,b` (or env ARSENAL_MCP_GROUPS) serves only those groups plus `mow_tools`; no flag serves all ([install.md](install.md) "Load only what you need").', '');
  for (const g of reg.groups.all) {
    const ts = reg.tools.filter(x => x.group === g), files = [...new Set(ts.map(x => x.file))];
    L.push('### ' + g + ' (' + ts.length + (ts.length === 1 ? ' tool' : ' tools') + '; `--groups ' + g + '`; ' + files.map(f => '`tools/mcp/tools/' + f + '`').join(', ') + ')', '');
    for (const t of ts) L.push('- `' + t.name + '` [' + t.kind + (t.games.length < 3 ? '; ' + t.games.join(' ') + ' only' : '') + '] ' + one(t.title, 80) + ': ' + first(t.description));
    L.push('');
  }
  if (reg.errors.length) { L.push('### Not loaded', ''); for (const e of reg.errors) L.push('- `' + e.file + '`' + (e.tool ? ' `' + e.tool + '`' : '') + ': ' + one(e.error, 200)); L.push(''); }
  const g = guiTools();
  L.push('## Server `arsenal-gui`' + (g.tools ? ' (' + g.tools.length + ' tools)' : ''), '',
    'Talks to a running GUI (`node tools/gui/gui.js`). The route and page list behind `gui_routes` and `gui_pages` comes from the GUI\'s own registry.', '');
  if (g.tools) for (const t of g.tools) L.push('- `' + t.name + '`' + (t.kind ? ' [' + t.kind + ']' : '') + (t.title ? ' ' + one(t.title, 80) + ':' : '') + ' ' + first(t.description));
  else L.push('- (no tool list: ' + g.why + ')');
  L.push('');
  const sk = skills(opt && opt.skills);
  L.push('## Skills (' + sk.length + ', `.claude/skills/<name>/SKILL.md`)', '',
    'A skill is a short router (SKILL.md, at most ' + LIMIT.skill + ' lines) plus sub-files (at most ' + LIMIT.sub + ' lines each) that are read only when their sub-task comes up.', '');
  for (const s of sk) {
    L.push('- `' + s.name + '` (SKILL.md ' + s.lines + ' lines): ' + (first(s.description) || '(no description)'));
    for (const f of s.files) L.push('  - `' + f.file + '` (' + f.lines + ' lines): ' + (one(f.head, 160) || '(empty)'));
  }
  L.push('');
  return { text: L.join('\n'), reg, gui: g, skills: sk, over: overLimit(sk) };
}

if (require.main === module) {
  const a = process.argv.slice(2);
  const val = k => { const i = a.indexOf(k); return i >= 0 && a[i + 1] && !a[i + 1].startsWith('--') ? path.resolve(a[i + 1]) : null; };
  for (const k of ['--out', '--skills']) if (a.includes(k) && !val(k)) { console.error('catalog: ' + k + ' needs a path'); process.exit(2); }
  const out = val('--out') || OUT, b = build({ skills: val('--skills') });
  const shown = out === OUT ? 'tools/mcp/CATALOG.md' : out;
  let old = null; try { old = fs.readFileSync(out, 'utf8').replace(/\r\n/g, '\n'); } catch (e) { old = null; }
  const sum = b.reg.tools.length + ' arsenal tools in ' + b.reg.groups.all.length + ' groups, ' + (b.gui.tools ? b.gui.tools.length : 0) + ' arsenal-gui tools, ' + b.skills.length + ' skills';
  const strict = process.env.ARSENAL_SKILL_LIMITS === '1';
  const limits = () => {   // -> true when the run must fail on them
    if (!b.over.length) return false;
    console.error('catalog: ' + (strict ? '' : 'note: ') + b.over.length + ' skill file(s) over the line limit (SKILL.md ' + LIMIT.skill + ', a sub-file ' + LIMIT.sub + ')' +
      (strict ? '. Split them into sub-files.' : '; --check fails on this only with ARSENAL_SKILL_LIMITS=1.'));
    for (const o of b.over) console.error('  ' + o.file + ': ' + o.lines + ' lines (limit ' + o.limit + ')');
    return strict;
  };
  if (a.includes('--print')) process.stdout.write(b.text);
  else if (a.includes('--check')) {
    let bad = false;
    if (old === b.text) console.log('catalog: ' + path.basename(out) + ' is current (' + sum + ')');
    else {
      console.error('catalog: ' + path.basename(out) + ' is stale. Run: node tools/mcp/catalog.js');
      const o = new Set((old || '').split('\n')), n = new Set(b.text.split('\n'));
      for (const l of b.text.split('\n')) if (l && !o.has(l)) console.error('  + ' + one(l, 160));
      for (const l of (old || '').split('\n')) if (l && !n.has(l)) console.error('  - ' + one(l, 160));
      bad = true;
    }
    if (limits()) bad = true;
    if (bad) process.exit(1);
  } else {
    if (old === b.text) console.log('catalog: no change (' + sum + ')');
    else { fs.writeFileSync(out, b.text); console.log('catalog: wrote ' + shown + ' (' + sum + ')'); }
    for (const e of b.reg.errors) console.error('catalog: not loaded: ' + e.file + (e.tool ? ' ' + e.tool : '') + ': ' + e.error);
    limits();
  }
}
module.exports = { build, guiTools, skills, overLimit, LIMIT };
