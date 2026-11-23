// mcp tools, group knowledge: what is known about the games, read-only. README "Planned tools".
//   mow_lookup     the knowledge webs through tools/q/q.js: engine name, words, limit id, cites, topic, GoH difference
//   mow_limit      known limitations by id or by words (limits/, gohweb rows)
//   mow_game_diff  tools/gameprofile: the facts of one game, or what differs between two
//   mow_tools      what this server loaded (and what failed to load), and the CLI tools with their usage line
//   mow_guide      guide/*.md chapters: list, read one, search
// Author: Imperator_Aug (ARSENAL, ia-04fa54da)
'use strict';
const fs = require('fs'), path = require('path');
const registry = require('../lib/registry');
const GAMES = ['as64', 'mowas2', 'goh'];
const ID = /^[A-Z][A-Z0-9]*-\d+$/;

const words = v => (Array.isArray(v) ? v : String(v == null ? '' : v).split(/[\s,]+/)).map(s => String(s).trim()).filter(Boolean);
function terms(ctx, v, what) {
  const t = words(v);
  if (!t.length) throw ctx.refusal(what + ' is empty');
  if (t.length > 40) throw ctx.refusal(what + ': at most 40 words');
  t.forEach(x => ctx.name(x, what));
  return t;
}
const num = (v, lo, hi, def) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : def);

// ---- mow_lookup ----
const MODES = ['auto', 'name', 'words', 'limit', 'cite', 'topic', 'diff'];
async function lookup(args, ctx) {
  const g = ctx.game(args), t = terms(ctx, args.query, 'query');
  let mode = args.mode || 'auto';
  if (mode === 'auto') mode = t.every(x => ID.test(x)) ? 'limit' : (t.length === 1 && (/::/.test(t[0]) || /^[A-Za-z_]\w*[A-Z]\w*$/.test(t[0]))) ? 'name' : 'words';
  const web = args.web || (mode === 'limit' ? (t.every(x => /^GH/.test(x)) ? 'goh' : 'main') : g.id === 'goh' ? 'goh' : 'main');
  const root = web === 'goh' ? ['gohweb'] : [], n = num(args.max, 1, 100, 0), cap = n ? ['-n', String(n)] : [];
  let argv, note = '';
  if (mode === 'diff') {
    if (g.id === 'mowas2') return { na: 'the GoH against AS64 exe match has no MoW:AS2 side (the shipped mowas_2.exe can not be read that way). Use game as64 or goh, or mow_game_diff for MoW:AS2 against AS64.' };
    argv = ['-g', ...t, '--exe', g.exe];
  } else if (mode === 'name') argv = [...root, ...t];
  else if (mode === 'words') argv = [...root, '-k', ...t, ...cap];
  else if (mode === 'limit') { t.forEach(x => { if (!ID.test(x)) throw ctx.refusal('not a limit id (like VFS-01 or GHVIS-29): ' + x); }); argv = [...root, '-l', ...t]; }
  else if (mode === 'cite') { if (web === 'goh') return { na: 'cites with source snippets are kept for the AS64 web only; use mode limit for a GoH row.' }; argv = ['-r', ...t]; }
  else argv = [...root, '-t', ...t];
  const r = await ctx.q(argv, { timeout: 120000 });
  if (web === 'main' && g.id === 'goh') note = '\n[note: this is the AS64 web. GoH differences: mode words/limit/topic with web goh, or mow_game_diff.]';
  if (web === 'main' && g.id === 'mowas2') note = '\n[note: the web is written from AS64; MoW:AS2 shares it unless a row says as64 only. Differences: mow_game_diff.]';
  if (web === 'goh') note = '\n[note: GoH web rows are differences from AS64, not tested in game.]';
  const empty = !r.stdout.split(/\r?\n/).some(l => l.trim() && !/: not found$/.test(l.trim()));
  return { text: (empty && !r.isError ? 'nothing found for: ' + t.join(' ') + ' (mode ' + mode + ', web ' + web + '). Try other words, mode words, or the other web.' + (r.stderr ? '\n' + r.stderr.trim() : '') : r.text) + note, isError: r.isError,
    data: { mode, web, game: g.id, found: !empty } };
}

// ---- mow_limit ----
async function limit(args, ctx) {
  const g = ctx.game(args);
  if (args.ids != null && words(args.ids).length) {
    const ids = terms(ctx, args.ids, 'ids').map(s => s.toUpperCase());
    ids.forEach(x => { if (!ID.test(x)) throw ctx.refusal('not a limit id (like VFS-01 or GHVIS-29): ' + x); });
    const main = ids.filter(x => !/^GH/.test(x)), goh = ids.filter(x => /^GH/.test(x)), parts = [];
    let err = false;
    if (main.length) { const r = await ctx.q([args.cites ? '-r' : '-l', ...main], { timeout: 120000 }); parts.push(r.text.trim()); err = err || r.isError; }
    if (goh.length) { const r = await ctx.q(['gohweb', '-l', ...goh], { timeout: 120000 }); parts.push(r.text.trim()); err = err || r.isError; }
    const text = parts.filter(Boolean).join('\n');
    return { text: text || 'no such row: ' + ids.join(' '), isError: err, data: { ids, found: /^[A-Z][A-Z0-9]*-\d+ \|/m.test(text) } };
  }
  if (args.words == null || !words(args.words).length) return ctx.bad('give ids (like VFS-01) or words to search the limitations');
  const t = terms(ctx, args.words, 'words'), n = num(args.max, 1, 100, 25);
  const r = await ctx.q([...(g.id === 'goh' ? ['gohweb'] : []), '-k', ...t, '-n', String(n)], { timeout: 120000 });
  const rows = r.stdout.split(/\r?\n/).filter(l => /^[A-Z][A-Z0-9]*-\d+ \|/.test(l));
  const more = r.stdout.split(/\r?\n/).filter(l => /^limits: \+\d+ more/.test(l));
  return { text: rows.length ? rows.concat(more).join('\n') + '\n[row form: id | subject | limit | what it means for a mod | [V] verified [I] inferred [T] needs a test]'
    : 'no known limitation matches: ' + t.join(' ') + (g.id === 'goh' ? ' (GoH web). The AS64 rows may still apply: ask with game as64.' : ''), isError: r.isError, data: { count: rows.length, game: g.id } };
}

// ---- mow_game_diff ----
const show = v => (typeof v === 'string' ? v : JSON.stringify(v));
function gameDiff(args, ctx) {
  const a = ctx.game(args), key = args.key == null ? '' : ctx.name(String(args.key), 'key');
  const pa = a.profile;
  if (!pa) return { text: 'error: no profile data for ' + a.name, isError: true };
  const hit = k => !key || k === key || k.startsWith(key);
  if (args.other == null) {
    const ks = Object.keys(pa.facts).filter(hit).sort();
    if (!ks.length) return { text: 'no fact of ' + a.name + ' starts with "' + key + '". Keys: ' + [...new Set(Object.keys(pa.facts).map(k => k.split('.')[0]))].sort().join(', ') };
    return { text: a.name + ': ' + pa.title + '\n' + ks.map(k => k + ' = ' + show(pa.facts[k].v) + '  [' + pa.facts[k].tag + '] ' + (pa.facts[k].src || []).join(' ')).join('\n') + '\n[V] verified [I] inferred [T] needs a test',
      data: { game: a.id, count: ks.length } };
  }
  const b = ctx.game({ game: args.other }), pb = b.profile;
  if (!pb) return { text: 'error: no profile data for ' + b.name, isError: true };
  if (a.id === b.id) return ctx.bad('game and other are the same game');
  const rows = [], same = [];
  for (const k of [...new Set([...Object.keys(pa.facts), ...Object.keys(pb.facts)])].sort()) {
    if (!hit(k)) continue;
    const fa = pa.facts[k], fb = pb.facts[k];
    if (fa && fb && show(fa.v) === show(fb.v)) { same.push(k); continue; }
    rows.push({ key: k, a: fa ? show(fa.v) + ' [' + fa.tag + ']' : '(not recorded)', b: fb ? show(fb.v) + ' [' + fb.tag + ']' : '(not recorded)' });
  }
  const head = a.name + ' against ' + b.name + ': ' + rows.length + ' facts differ, ' + same.length + ' are the same' + (key ? ' (keys starting with "' + key + '")' : '');
  const text = [head].concat(rows.map(r => r.key + '\n  ' + a.name + ': ' + r.a + '\n  ' + b.name + ': ' + r.b));
  if (args.same && same.length) text.push('same in both: ' + same.join(', '));
  text.push('[V] verified [I] inferred [T] needs a test. "(not recorded)" = no fact written down for that game, not proof of absence. More: mow_lookup.');
  return { text: text.join('\n'), data: { a: a.id, b: b.id, differ: rows.length, same: same.length } };
}

// ---- mow_tools ----
function indexRows(ctx) {
  const dir = path.join(ctx.TOOLS, 'index'), m = new Map();
  let files = []; try { files = fs.readdirSync(dir).filter(n => n.endsWith('.md')).sort(); } catch (e) { /* none */ }
  for (const f of files) {
    for (const l of fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/)) {
      const r = /^([a-z][a-z0-9-]*)\s+\|\s(.*)$/.exec(l);
      if (!r || m.has(r[1])) continue;
      const row = l.replace(/\\\|/g, '|'), cell = (row.split(/\s\|\s/)[1] || '').replace(/`/g, '').trim();
      m.set(r[1], { file: 'tools/index/' + f, row, usage: /^node tools\//.test(cell) ? cell.replace(/^node tools\/\S+\s*/, '') : '' });
    }
  }
  return m;
}
function toolsInfo(args, ctx) {
  const what = args.what || 'mcp', reg = ctx.registry(), out = [];
  let as2 = null; try { as2 = require('../../as2/as2.js'); } catch (e) { as2 = null; }
  const usage = as2 ? as2.usageLines() : {}, names = as2 ? as2.list(false) : [], idx = indexRows(ctx);
  for (const [n, r] of idx) if (r.usage) usage[n] = r.usage;   // the tool's own row wins over a mention in another row
  const G = Object.assign({ all: [], served: [], off: [], unknown: [], limited: false }, reg.groups || {});
  // the line that turns groups on beside the ones served now
  const onLine = more => { const l = registry.sortGroups(G.served.concat(more)).join(','); return 'To turn a group on, start the server with its name added: node tools/mcp/server.js --groups ' + l + ' (or ARSENAL_MCP_GROUPS=' + l + ').'; };
  if (args.tool != null) {
    const n = ctx.name(String(args.tool), 'tool');
    const t = reg.tools.find(x => x.name === n);
    if (t) return { text: t.name + ' (' + t.group + ', ' + t.kind + ', games: ' + t.games.join(' ') + ')\n' + t.title + '\n' + t.description + '\narguments: ' + JSON.stringify(t.inputSchema.properties || {}, null, 1) + (t.inputSchema.required && t.inputSchema.required.length ? '\nneeded: ' + t.inputSchema.required.join(', ') : '') +
      (t.served === false ? '\nNOT LOADED NOW: group "' + t.group + '" is off. ' + onLine([t.group]) : ''), data: { found: true, group: t.group, served: t.served !== false } };
    const row = idx.get(n);
    if (!names.includes(n) && !row) return { text: 'no tool named "' + n + '". Ask mow_tools with find: <words>.', data: { found: false } };
    return { text: n + '\nrun: node tools/' + n + '/' + n + '.js ' + (usage[n] || '') + (row ? '\n' + row.file + ':\n' + row.row : '') + '\n[index row form: name | how to run | limits rows | what it does]', data: { found: true } };
  }
  const find = args.find == null ? [] : terms(ctx, args.find, 'find').map(s => s.toLowerCase());
  const has = s => find.every(w => s.toLowerCase().includes(w));
  if (what === 'mcp' || what === 'all') {
    const hit = reg.tools.filter(t => has(t.name + ' ' + t.title + ' ' + t.description + ' ' + t.group));
    const ts = hit.filter(t => t.served !== false), offHit = hit.filter(t => t.served === false);
    out.push('MCP tools of this server (' + ts.length + (find.length ? ' match' : '') + '), by group. kind: read = changes nothing, write = preview unless write: true, launch = starts or drives the game.');
    for (const grp of registry.sortGroups(ts.map(t => t.group))) {
      out.push(grp + ':');
      for (const t of ts.filter(x => x.group === grp)) out.push('  ' + t.name + ' [' + t.kind + (t.games.length < GAMES.length ? ', ' + t.games.join(' ') + ' only' : '') + '] ' + t.title);
    }
    if (G.limited) {
      const n = g => reg.tools.filter(t => t.group === g && t.served === false).length;
      out.push('groups served: ' + (G.served.join(', ') || 'none') + ' (mow_tools is always here).');
      if (G.off.length) out.push('groups that exist but are off: ' + G.off.map(g => g + ' (' + n(g) + ')').join(', ') + '. ' + onLine(G.off.slice(0, 1)) + ' Every group: start it without --groups.');
      if (G.unknown.length) out.push('asked for, but no tool has this group: ' + G.unknown.join(', ') + '.');
      if (find.length && offHit.length) out.push('matches in groups that are off: ' + offHit.map(t => t.name + ' (' + t.group + ')').join(', '));
    } else if (G.all.length) out.push('groups served: all (' + G.all.join(', ') + '). Fewer tool schemas: start the server with --groups <names> (mow_tools always stays).');
    if (reg.errors.length) { out.push('NOT LOADED (' + reg.errors.length + '):'); for (const e of reg.errors) out.push('  ' + e.file + (e.tool ? ' ' + e.tool : '') + ': ' + e.error); }
    out.push('writes: ' + (ctx.guard.roots().length ? 'allowed inside ' + ctx.guard.roots().length + ' folder(s) of ARSENAL_WRITE_ROOTS' : 'off (ARSENAL_WRITE_ROOTS not set)') + '; launches: ' + (process.env.ARSENAL_ALLOW_LAUNCH === '1' ? 'allowed' : 'off (ARSENAL_ALLOW_LAUNCH not 1)') + '; default game: ' + ctx.game({}).id);
  }
  if (what === 'cli' || what === 'all' || (find.length && what === 'mcp')) {
    const rows = find.length ? idx : null;
    const cs = names.filter(n => has(n + ' ' + (usage[n] || '') + ' ' + ((rows && rows.get(n)) || { row: '' }).row));
    if (what !== 'mcp' || cs.length) {
      out.push('CLI tools (' + cs.length + (find.length ? ' match' : '') + '), run as: node tools/<name>/<name>.js <usage>. One tool in full: mow_tools with tool: <name>.');
      for (const n of cs) out.push('  ' + n + '  ' + ctx.cut(usage[n] || '', 200).split('\n')[0]);
    }
  } else out.push('CLI tools: ' + names.length + ' (list: what "cli"; search: find "<words>"; one in full: tool "<name>").');
  return { text: out.join('\n'), data: { mcp: reg.tools.filter(t => t.served !== false).length, cli: names.length, errors: reg.errors, groups: { served: G.served, off: G.off, unknown: G.unknown } } };
}

// ---- mow_guide ----
const CHAP = /^(p?\d\d)-(.+)\.md$/;
function chapters(ctx, lang) {
  const base = path.join(ctx.ROOT, 'guide'), out = [];
  let files = []; try { files = fs.readdirSync(base).filter(n => CHAP.test(n)).sort(); } catch (e) { return out; }
  for (const f of files) {
    const id = CHAP.exec(f)[1];
    let file = path.join(base, f), used = 'en';
    if (lang && lang !== 'en') { const t = path.join(base, 'i18n', lang, f); if (fs.existsSync(t)) { file = t; used = lang; } }
    let title = f; try { const m = /^#\s+(.+)$/m.exec(fs.readFileSync(file, 'utf8').slice(0, 2000)); if (m) title = m[1].trim(); } catch (e) { /* keep the name */ }
    out.push({ id, name: f.replace(/\.md$/, ''), file, title, lang: used });
  }
  return out;
}
function guide(args, ctx) {
  const lang = args.lang == null ? 'en' : String(args.lang).toLowerCase();
  if (!/^[a-z]{2}(-[a-z]{2})?$/.test(lang)) return ctx.bad('lang is a two-letter code such as en, ru, uk, zh');
  const ch = chapters(ctx, lang);
  if (!ch.length) return { text: 'error: no guide chapters found in guide/', isError: true };
  const g = ctx.game(args);
  const note = g.id === 'as64' ? '' : '\n[note: the guide is written for MoW:AS2 and AS64. ' + (g.id === 'goh' ? 'For Gates of Hell see chapter p12 and mow_game_diff.' : 'Parts marked AS64 do not apply to plain MoW:AS2.') + ']';
  if (args.search != null && words(args.search).length) {
    const t = terms(ctx, args.search, 'search').map(s => s.toLowerCase()), max = num(args.max, 1, 200, 40), hits = [];
    let total = 0;
    const only = args.chapter != null ? pick(ctx, ch, args.chapter) : null;
    for (const c of only ? [only] : ch) {
      const lines = fs.readFileSync(c.file, 'utf8').split(/\r?\n/);
      lines.forEach((l, i) => { const s = l.toLowerCase(); if (t.every(w => s.includes(w))) { total++; if (hits.length < max) hits.push(c.id + ':' + (i + 1) + ' ' + ctx.cut(l.trim(), 240).split('\n')[0]); } });
    }
    return { text: (hits.length ? hits.join('\n') + (total > hits.length ? '\n+' + (total - hits.length) + ' more lines' : '') + '\n[chapter:line. Read around a hit: mow_guide with chapter and from.]' : 'no guide line holds all of: ' + t.join(' ')) + note, data: { hits: total } };
  }
  if (args.chapter == null) {
    return { text: 'Guide chapters (read one: chapter "07" or "p03"; search: search "<words>"). 01-22 explain, p01-p12 are step by step.\n' + ch.map(c => c.id + '  ' + c.title).join('\n') + note, data: { chapters: ch.map(c => ({ id: c.id, title: c.title })) } };
  }
  const c = pick(ctx, ch, args.chapter);
  const lines = fs.readFileSync(c.file, 'utf8').split(/\r?\n/), from = num(args.from, 1, Math.max(1, lines.length), 1), want = num(args.lines, 1, 2000, 400);
  let end = Math.min(lines.length, from + want - 1), body = lines.slice(from - 1, end).join('\n');
  while (body.length > 36000 && end > from) { end = from + Math.floor((end - from) / 2); body = lines.slice(from - 1, end).join('\n'); }
  return { text: 'guide/' + c.name + '.md (' + c.lang + '), lines ' + from + '-' + end + ' of ' + lines.length + (end < lines.length ? '. Next part: from ' + (end + 1) : '') + '\n' + body + note,
    data: { chapter: c.id, from, to: end, total: lines.length, lang: c.lang } };
}
function pick(ctx, ch, v) {
  const s = ctx.name(String(v), 'chapter').toLowerCase().replace(/\.md$/, '');
  const id = /^\d$/.test(s) ? '0' + s : /^p\d$/.test(s) ? 'p0' + s[1] : s;
  const c = ch.find(x => x.id === id || x.name === s) || ch.find(x => x.name.includes(s));
  if (!c) throw ctx.refusal('no guide chapter "' + s + '". Chapters: ' + ch.map(x => x.id).join(' '));
  return c;
}

const game = { type: 'string', enum: GAMES, description: 'as64 (default), mowas2 or goh.' };
module.exports = { group: 'knowledge', tools: [
  { name: 'mow_lookup', title: 'Look up how the game behaves', kind: 'read', games: GAMES,
    description: 'Search the knowledge webs (modding facts, known limitations, and internal notes when present) of MoW:AS2, AS64 and Gates of Hell. Use it before guessing how a data key, script or game rule works. ' +
      'mode: auto (default: ids -> limit, one CamelCase or  word -> name, else words), name (a function or class name; reads internal notes when present), words (all words must match; limits rows and modding notes), ' +
      'limit (rows by id such as VFS-01), cite (a row plus the internal notes behind it when present; AS64 web), topic (a topic word such as vfs, damage, then narrowing words), diff (GoH against AS64 for a key, function or class; reads internal notes when present). ' +
      'web: main = the AS64 / MoW:AS2 web, goh = Gates of Hell as differences from AS64 (default for game goh). Answers are short lines with [V] verified, [I] inferred, [T] needs an in-game test.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'A name, words, ids or a topic. Words are separated by spaces.' }, mode: { type: 'string', enum: MODES }, web: { type: 'string', enum: ['main', 'goh'] },
      max: { type: 'integer', description: 'Most lines for mode words (default 15).' }, game }, required: ['query'] },
    handler: lookup },
  { name: 'mow_limit', title: 'Known limitation: can the game do X', kind: 'read', games: GAMES,
    description: 'Known limitations of the engine and data ("can X be done", "why does X fail silently, crash or desync"). Give ids (VFS-01, GHVIS-29) for the full rows, with cites: true to add the internal notes behind them when present (AS64 rows), ' +
      'or give words to find rows. For game goh the words search the Gates of Hell rows (differences from AS64). Rows are tagged [V] verified, [I] inferred, [T] needs an in-game test.',
    inputSchema: { type: 'object', properties: { ids: { type: ['string', 'array'], items: { type: 'string' }, description: 'One or more row ids.' }, words: { type: 'string', description: 'Words that must all be in a row.' },
      cites: { type: 'boolean', description: 'With ids: add the internal notes behind each row, when present.' }, max: { type: 'integer', description: 'Most rows for a word search (default 25).' }, game } },
    handler: limit },
  { name: 'mow_game_diff', title: 'What differs between two of the games', kind: 'read', games: GAMES,
    description: 'Facts about one game (folders, exe names, mod.info version range, text format, entity paths ...) or, with other, only the facts that differ between two games. ' +
      'Use it when porting, or when advice written for one game must be checked for another. key narrows to facts whose name starts with it (for example exe, entity, mod). Each fact carries its source and a [V]/[I]/[T] tag.',
    inputSchema: { type: 'object', properties: { game, other: { type: 'string', enum: GAMES, description: 'The second game. Left out: list the facts of game.' }, key: { type: 'string', description: 'Fact name or its start.' },
      same: { type: 'boolean', description: 'Also name the facts that are the same.' } } },
    handler: async (a, ctx) => gameDiff(a, ctx) },
  { name: 'mow_tools', title: 'What tools are here', kind: 'read', games: GAMES,
    description: 'Lists the tools of this MCP server by group with their kind (read, write, launch), names any tool module that failed to load, says which tool groups are served and which exist but are off (with the line that turns them on), and whether writes and launches are allowed. ' +
      'what: mcp (default), cli (the command-line tools under tools/ with a usage line), all. find: words to search both lists. tool: one MCP or CLI tool in full (arguments, usage, index row).',
    inputSchema: { type: 'object', properties: { what: { type: 'string', enum: ['mcp', 'cli', 'all'] }, find: { type: 'string' }, tool: { type: 'string' }, game } },
    handler: async (a, ctx) => toolsInfo(a, ctx) },
  { name: 'mow_guide', title: 'Read the modding guide', kind: 'read', games: GAMES,
    description: 'The modding guide (22 chapters that explain, 12 step-by-step chapters p01-p12). No arguments: the chapter list. chapter: read one ("07", "p03" or part of its name), in parts with from and lines. ' +
      'search: words that must all be on one line, answers chapter:line hits (chapter narrows it). lang: en (default), or ru, uk, zh where a chapter is translated. Written for MoW:AS2 and AS64; p12 covers units from Gates of Hell.',
    inputSchema: { type: 'object', properties: { chapter: { type: 'string' }, search: { type: 'string' }, from: { type: 'integer', description: 'First line to read (default 1).' }, lines: { type: 'integer', description: 'How many lines (default 400).' },
      max: { type: 'integer', description: 'Most search hits (default 40).' }, lang: { type: 'string' }, game } },
    handler: async (a, ctx) => guide(a, ctx) },
] };
