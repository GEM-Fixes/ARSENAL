#!/usr/bin/env node
// Rebuilds the generated blocks of the page files of this skill from tools/mcp/gui/registry.json.
// One file per top tab, so Claude reads only the tab it needs:
//   pages.md          the index: which file holds which tab (generated block: tabs, their pages, the file)
//   pages-top.md      what sits above the tabs: core routes, the file viewers, the guided task, /api/run commands
//   pages-<tab>.md    one top tab: its sub-tabs and pages, every route of its pages
// In each file only the text between the two gen:pages marker lines is written; the hand-written rows above it stay.
// A tab with no file yet gets one (heading + empty row table + block).
//   node .claude/skills/arsenal-gui-use/refresh-pages.js            write the files (prints what it did)
//   node .claude/skills/arsenal-gui-use/refresh-pages.js --check    exit 1 when any block is not what would be written now;
//                                                                   also lists pages and routes no hand-written row names
// exit 2 = a file lost its marker lines. Make the registry first when the GUI changed: node tools/mcp/gui.js --gen
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const REG = path.join(ROOT, 'tools', 'mcp', 'gui', 'registry.json');
const OPEN = '<!-- gen:pages -->', CLOSE = '<!-- /gen:pages -->';
const LEGEND = '`/api/x/<id>/` + name. G = GET, P = POST. After a name: `+write` (or another word) = previews unless that body field is true; `+dry` = writes unless `dry` is true; `!` = always writes; `^` = starts the game; `#` = refused; `?` = the scan could not tell, read the route with `gui_routes` first.';
const HOW = 'Row: I want to -> page ref (`gui_open`, `#go=page:<ref>`) > card -> route (`units/search` = `/api/x/units/search`; `run <cmd>` = `POST /api/run {cmd, input}`) -> CLI (`<t>` = `node tools/<t>/<t>.js`, `as2 <word>` = `node tools/as2/as2.js <word>`). Read the fields with `gui_routes` before a write.';

const R = JSON.parse(fs.readFileSync(REG, 'utf8'));
const goh = R.games.find(g => g.id === 'goh') || R.games[R.games.length - 1], base = R.games.find(g => g.id === R.defaultGame) || R.games[0];
const basePages = new Set(base.tabs.flatMap(t => t.subs.flatMap(s => s.pages.map(p => p.page))));
const pagesAll = Array.isArray(R.pages) ? R.pages : Object.values(R.pages);
const by = {};
for (const x of R.routes) (by[x.page] = by[x.page] || []).push(x);
const mark = x => x.writes === 'flag' ? '+' + x.flag : x.writes === 'dry' ? '+dry' : ({ always: '!', launch: '^', blocked: '#', unknown: '?' })[x.writes] || '';
function routeLine(id) {
  const f = m => by[id].filter(x => x.method === m).map(x => (id === 'core' ? x.path : x.path.replace('/api/x/' + id + '/', '')) + mark(x)).join(' ');
  const g = f('GET'), p = f('POST');
  return '- `' + id + '`: ' + (g ? 'G ' + g : '') + (g && p ? ' · ' : '') + (p ? 'P ' + p : '');
}
// a route id belongs to the first tab that lists its page; ids no tab lists (core, view, task) go to pages-top.md
const owner = {};
for (const t of goh.tabs) for (const s of t.subs) for (const p of s.pages) if (!(p.page in owner)) owner[p.page] = t.id;
const fileOf = t => 'pages-' + t + '.md';
const head = 'registry sig ' + R.sig + ' · ' + R.counts.pages + ' pages · ' + R.counts.routes + ' routes · ' + R.counts.commands + ' commands';

function tabBlock(t) {
  const out = [head, '', '### Sub-tabs and pages (same in MoW:AS2, AS64, GoH; GoH adds what is marked)', '**' + t.name + '** (tab `' + t.id + '`, Alt+' + t.key + ')'];
  for (const s of t.subs) out.push('- ' + s.name + ' (sub `' + s.id + '`): ' + s.pages.map(p => '`' + p.ref + '` ' + p.name + (!basePages.has(p.page) ? ' [GoH only]' : p.adv ? ' [Advanced]' : '')).join(' · '));
  const ids = [...new Set(t.subs.flatMap(s => s.pages.map(p => p.page)))].filter(id => owner[id] === t.id);
  out.push('', '### Routes by page id', LEGEND);
  for (const id of ids) if (by[id]) out.push(routeLine(id));
  const none = ids.filter(id => !by[id]);
  if (none.length) out.push('- no routes of their own: ' + none.map(id => '`' + id + '`').join(' '));
  return out;
}
function topBlock() {
  const out = [head, '', '### Routes of what sits above the tabs', LEGEND];
  for (const id of Object.keys(by)) if (!owner[id]) out.push(routeLine(id));
  out.push('- `/api/run` commands: ' + R.commands.map(c => c.id + (c.launches ? '^' : '')).join(' '));
  return out;
}
function indexBlock() {
  const out = [head, '', '### Tab -> file (read only the file of the tab the task is in)', '- above the tabs (guided task, file viewers, jobs, core routes, `/api/run` commands) -> `pages-top.md`'];
  for (const t of goh.tabs) out.push('- **' + t.name + '** (tab `' + t.id + '`, Alt+' + t.key + ') -> `' + fileOf(t.id) + '`: ' +
    t.subs.flatMap(s => s.pages.map(p => '`' + p.ref + '`' + (!basePages.has(p.page) ? ' [GoH only]' : p.adv ? ' [Advanced]' : ''))).join(' '));
  return out;
}
const fresh = (title, rows) => ['# arsenal-gui-use: ' + title, HOW, '', '| I want to | where | route | CLI |', '|---|---|---|---|'].concat(rows || [], ['', '## Pages and routes (generated)', OPEN, CLOSE, '']).join('\n');

const want = [{ file: 'pages.md', block: indexBlock(), title: 'page index' }, { file: 'pages-top.md', block: topBlock(), title: 'above the tabs' }]
  .concat(goh.tabs.map(t => ({ file: fileOf(t.id), block: tabBlock(t), title: 'pages of tab ' + t.name + ' (`' + t.id + '`)' })));
const check = process.argv.includes('--check');
let stale = 0, hand = '';
for (const w of want) {
  const p = path.join(__dirname, w.file), have = fs.existsSync(p);
  const src = have ? fs.readFileSync(p, 'utf8') : fresh(w.title), lines = src.split('\n');
  const a = lines.findIndex(l => l.trim() === OPEN), b = lines.findIndex(l => l.trim() === CLOSE);
  if (a < 0 || b < a) { console.error(w.file + ': the two gen:pages marker lines are missing or out of order'); process.exit(2); }
  hand += lines.slice(0, a).join('\n') + '\n';
  const next = lines.slice(0, a + 1).concat(w.block, lines.slice(b)).join('\n');
  if (have && next === src) continue;
  stale++;
  if (check) console.log(w.file + ': ' + (have ? 'the generated block is stale' : 'missing') + ' (run without --check)');
  else { fs.writeFileSync(p, next); console.log(w.file + ': ' + (have ? 'generated block rewritten' : 'made')); }
}
// hints, never a failure: pages and routes no hand-written row names, files of a tab that left, files the router does not name
const miss = [];
for (const p of pagesAll) if (p.tab !== false && !new RegExp('`' + p.id + '(/[a-z]+)?`').test(hand)) miss.push('page ' + p.id);
const ext = {};
for (const x of R.routes) if (x.page !== 'core') (ext[x.page] = ext[x.page] || []).push(x.path.replace('/api/x/', ''));
for (const id of Object.keys(ext)) if (!ext[id].some(r => hand.includes('`' + r + '`'))) miss.push('routes of ' + id);
if (miss.length) console.log('no hand-written row names: ' + miss.join(', '));
const names = new Set(want.map(w => w.file)), skill = fs.existsSync(path.join(__dirname, 'SKILL.md')) ? fs.readFileSync(path.join(__dirname, 'SKILL.md'), 'utf8') : '';
for (const f of fs.readdirSync(__dirname)) if (/^pages-.*\.md$/.test(f) && !names.has(f)) console.log(f + ': no such tab now (move its rows, then delete it)');
for (const w of want) if (skill && !skill.includes('`' + w.file + '`')) console.log('SKILL.md does not name ' + w.file);
if (check) {
  if (stale) process.exit(1);
  console.log('pages: ' + want.length + ' files up to date (registry sig ' + R.sig + ')');
} else if (!stale) console.log('pages: nothing to change');
else console.log('pages: ' + stale + ' of ' + want.length + ' files written (registry sig ' + R.sig + ')');
