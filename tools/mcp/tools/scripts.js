// mcp tools, group `scripts`: interaction scripts (the `{on event}` language of set/interaction_entity and interaction_terrain),
// mission scripts and triggers (.mi), bot and other Lua, console commands.
// Contract: tools/mcp/README.md. Every tool takes game = as64 | mowas2 | goh and wraps the CLI tool or library that already does the
// job (named in each tool's `wraps`); nothing is decided here that a tool of the kit does not decide.
//   - all tools here read; a child tool gets its arguments as an argv array through ctx.run.
//   - word lists are the linters' own tables (ialint EVENTS, fxlint actions.json, milint micommands.json and the GoH deltas), each
//     with the limits row the table carries (a source-file line in a table is not passed on). What a word takes is not in those tables: explain adds
//     the knowledge-web lines (q.js), nothing is typed here.
//   - library answers (name usages, a mission's triggers, Lua structure) come from the child scripts/probe.js.
//   - a game a tool cannot serve answers { na: 'why' }; long lists are cut with a count and how to ask for more (limit, offset, q).
// Author: Imperator_Aug (ARSENAL, ia-53c69296)
'use strict';
const fs = require('fs'), path = require('path');
const U = require('./mod/util');

const GAMES = ['as64', 'mowas2', 'goh'];
const P = {
  game: { type: 'string', enum: GAMES, description: 'as64 (default), mowas2 or goh' },
  mod: { type: 'string', description: 'Full path of the mod folder' },
  modOpt: { type: 'string', description: 'Full path of a mod folder laid over the game; left out = the game alone' },
  mods: { type: 'array', items: { type: 'string' }, description: 'Mod folder names in <game>/mods, in load order' },
  limit: { type: 'integer', description: 'Most rows to answer' },
  offset: { type: 'integer', description: 'Rows to skip (the next page)' },
  q: { type: 'string', description: 'Part of a name to keep' },
};
const schema = (properties, required) => ({ type: 'object', properties: Object.assign({ game: P.game }, properties), required: required || [] });
const lines = a => a.filter(x => x != null && x !== '').join('\n');
const fwd = p => String(p).replace(/\\/g, '/');
const lc = s => String(s == null ? '' : s).toLowerCase();
const gameWord = g => (g.id === 'as64' ? 'AS64' : g.id === 'mowas2' ? 'MoW:AS2' : 'Gates of Hell');
const failed = (ctx, r, what) => (r.isError ? ctx.bad(what + (r.timedOut ? ' took too long and was stopped' : ' could not be run') + ': ' + U.tail(r.text, 3).join(' ')) : null);
const usage = (ctx, r, what) => (r.code === 2 ? ctx.bad(what + ': ' + U.tail(r.stderr || r.stdout, 3).join(' ')) : null);
const run = (ctx, tool, argv, opt) => ctx.run(tool, argv, Object.assign({ env: U.childEnv(), cwd: U.tmpDir() }, opt));
const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.floor(n))) : d; };
const page = (args, d, hi) => ({ limit: num(args.limit, d, 1, hi || 200), offset: num(args.offset, 0, 0, 1e6) });
const more = (total, pg, shown) => (total > pg.offset + shown ? '... ' + (total - pg.offset - shown) + ' more: pass offset: ' + (pg.offset + shown) + ' (or a larger limit, or q)' : null);
const modsArgv = (ctx, args) => { const m = U.names(ctx, args.mods, 'mods'); return m.length ? ['--mods', m.join(',')] : []; };
const modDir = (ctx, args) => (args.mod == null || args.mod === '' ? null : U.dirArg(ctx, args.mod, 'mod'));
const fileArg = (ctx, v, what) => {
  ctx.name(v, what);
  const s = v.trim();
  if (!path.isAbsolute(s)) throw ctx.refusal(what + ': give the full path, not a relative one: ' + s);
  if (!U.isFile(s)) throw ctx.refusal(what + ' was not found: ' + fwd(path.resolve(s)));
  return path.resolve(s);
};
const TOOLS = path.resolve(__dirname, '..', '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(TOOLS, rel), 'utf8'));

async function probe(ctx, cmd, o, timeout) {
  const r = await run(ctx, 'mcp', [cmd, JSON.stringify(o)], { script: 'tools/scripts/probe.js', timeout: timeout || 5 * 60 * 1000, max: 8 << 20 });
  if (r.isError) return { fail: ctx.bad('the ' + cmd + ' reader ' + (r.timedOut ? 'took too long and was stopped' : 'could not be run') + ': ' + U.tail(r.stderr, 2).join(' ')) };
  let j = null; try { j = JSON.parse(r.stdout); } catch (e) { j = null; }
  if (!j) return { fail: ctx.bad('the ' + cmd + ' reader gave no answer: ' + U.tail(r.text, 2).join(' ')) };
  return { j };
}
function reportLines(t, name, sum) {
  t.push(name + ': ' + (sum.total ? sum.total + ' finding(s)' + (Object.keys(sum.counts).length ? ' (' + Object.entries(sum.counts).map(([k, v]) => v + ' ' + k).join(', ') + ')' : '') : 'no findings'));
  for (const f of sum.findings) t.push('- ' + f.code + ' ' + f.file + (f.line ? ':' + f.line : '') + ': ' + f.msg);
  if (sum.more) t.push('... ' + sum.more + ' more: pass a larger limit');
}
// a lib/report JSON kept to the findings f() accepts -> the same summary shape
function sumOf(rep, keep, n) {
  const fsx = rep.findings.filter(keep), counts = {};
  for (const f of fsx) counts[f.code] = (counts[f.code] || 0) + 1;
  return U.sumReport({ findings: fsx, counts, total: fsx.length }, n);
}

// ---------- interaction scripts ----------
function iaWords(g) {
  const ia = require(path.join(TOOLS, 'ialint', 'ialint.js'));
  const goh = g.kind === 'goh', ac = readJson(goh ? 'fxlint/actions-goh.json' : 'fxlint/actions.json');
  const base = new Set(ia.EVENTS);
  return {
    events: [...(goh ? ia.EVENTS_GOH : ia.EVENTS)].map(w => ({ w, note: goh && !base.has(w) ? 'Gates of Hell only' : '' })),
    gohOnly: goh ? [] : [...ia.EVENTS_GOH].filter(w => !base.has(w)),
    actions: ac.actions.map(w => ({ w, note: ac.containers.includes(w) ? 'holds other actions' : '' })),
    containers: ac.containers, src: ac.src,
  };
}
async function scriptLint(args, ctx) {
  const g = ctx.game(args), dir = U.need(ctx, g), mod = modDir(ctx, args), n = num(args.limit, 12, 1, 100);
  const head = mod ? [mod, '--game', dir] : ['--vfs', '--game', dir];
  const tail = [...U.exe(g), '--format', 'json', '-q', ...(mod ? modsArgv(ctx, args) : [])];
  const [a, b] = await Promise.all([run(ctx, 'ialint', [...head, ...tail]), run(ctx, 'fxlint', [...head, ...tail])]);
  const bad = failed(ctx, a, 'ialint') || usage(ctx, a, 'ialint') || failed(ctx, b, 'fxlint') || usage(ctx, b, 'fxlint'); if (bad) return bad;
  const ra = U.reportOf(a.stdout), rb = U.reportOf(b.stdout);
  if (!ra) return ctx.bad('the interaction check gave no answer: ' + U.tail(a.text, 3).join(' '));
  const t = ['Interaction scripts ({on event} handlers of set/interaction_entity and set/interaction_terrain, includes expanded) of ' + (mod ? fwd(mod) : 'the game alone') + ' for ' + gameWord(g) + ':'];
  const sa = U.sumReport(ra, n); reportLines(t, 'ialint (events, calls, flags, delays: INT rows)', sa);
  let sb = null;
  if (rb) { sb = sumOf(rb, f => /^IA_/.test(f.code), n); reportLines(t, 'fxlint (action names the engine does not know: VIS-18)', sb); }
  if (!mod) t.push('The game alone was checked: a finding here is in the game\'s own files, not in a mod. Pass mod to check a mod.');
  t.push('Each code\'s rule: mow_limit with the row id in the message. Words the engine knows: mow_script_words.', g.kind === 'goh' ? 'Gates of Hell: its event set adds destroy, blast_wreaked, animation_event, hatch (GHINT-17, GHINT-45) and its own action list (GHINT-26).' : null);
  return { text: lines(t), data: { game: g.id, mod: mod ? fwd(mod) : null, ialint: sa, fxlint: sb } };
}

async function scriptWords(args, ctx) {
  const g = ctx.game(args), W = iaWords(g), kind = lc(args.kind || 'all'), q = lc(args.q || ''), pg = page(args, 60, 400);
  if (!['all', 'events', 'actions', 'containers'].includes(kind)) return ctx.bad('kind: use events, actions, containers or all');
  const pick = a => a.filter(x => !q || lc(x.w).includes(q));
  const ev = kind === 'all' || kind === 'events' ? pick(W.events) : [], ac = kind === 'all' || kind === 'actions' ? pick(W.actions) : [];
  const co = kind === 'containers' ? pick(W.containers.map(w => ({ w, note: '' }))) : [];
  const t = ['Interaction script words the ' + gameWord(g) + ' engine knows' + (q ? ' matching "' + q + '"' : '') + ':'];
  const sect = (title, arr, src) => { if (!arr.length) return; const rows = arr.slice(pg.offset, pg.offset + pg.limit); t.push(title + ' (' + arr.length + '; ' + src + '): ' + rows.map(x => x.w + (x.note ? ' [' + x.note + ']' : '')).join(', '), more(arr.length, pg, rows.length)); };
  sect('Events for {on <event>}', ev, g.kind === 'goh' ? 'INT-23, GHINT-17, GHINT-45' : 'INT-23');
  sect('Actions', ac, g.kind === 'goh' ? 'VIS-18, GHINT-26' : 'VIS-18');
  sect('Actions that hold other actions', co, 'fxlint containers');
  if (!ev.length && !ac.length && !co.length) t.push('No word matches. A quoted event name ({on "name"}) is a custom event, called with {call "name"}.');
  if (ev.length && g.kind !== 'goh' && W.gohOnly.some(w => !q || w.includes(q))) t.push('Gates of Hell only, an unknown event here (INT-23): ' + W.gohOnly.join(', ') + '.');
  if (kind !== 'containers') t.push('A word outside the event list makes the game refuse the file at load (INT-23); an unknown action is an error (VIS-18). Conditions (if ..) are not in these lists.');
  let web = null;
  if (args.explain === true && q) {
    ctx.name(args.q, 'q');
    const r = await ctx.q(g.kind === 'goh' ? ['gohweb', '-k', args.q.trim(), '-n', '8'] : ['-k', args.q.trim(), 'interaction', '-n', '8']);
    web = U.tail(r.stdout, 10).map(l => U.short(l, 400));
    t.push('What the knowledge web says about "' + args.q.trim() + '":', ...(web.length ? web.map(l => '  ' + l) : ['  (no row)']));
  } else t.push('What a word takes: explain: true with q: "<word>", or mow_lookup with the word. Where it is used: mow_script_find.');
  return { text: lines(t), data: { game: g.id, events: ev.map(x => x.w), actions: ac.map(x => x.w), containers: kind === 'containers' ? co.map(x => x.w) : W.containers, source: W.src, web } };
}

async function scriptFind(args, ctx) {
  const g = ctx.game(args), dir = U.need(ctx, g);
  ctx.name(args.name, 'name');
  const name = args.name.trim();
  if (/[\s"{}]/.test(name)) return ctx.bad('name: one word without spaces or quotes (an event, an action, a custom handler name, a flag or tag)');
  const md = modDir(ctx, args), mods = U.names(ctx, args.mods, 'mods'), scope = lc(args.scope || 'scripts');
  if (!['scripts', 'missions', 'all'].includes(scope)) return ctx.bad('scope: use scripts (interaction files), missions (.mi) or all');
  const o = { name, game: dir, exe: g.exe, mods, budgetMs: 25000 }; if (md) o.folder = md;
  const pr = await probe(ctx, 'refs', o); if (pr.fail) return pr.fail;
  const j = pr.j; if (j.error) return ctx.bad('the usage search failed: ' + j.error);
  const W = iaWords(g), low = lc(name);
  const what = W.events.some(x => x.w === low) ? 'an engine event' : W.actions.some(x => x.w === low) ? 'an engine action' : null;
  const inScope = h => (scope === 'all' ? true : scope === 'missions' ? /\.mi(:|$)/.test(h.at) : /\/interaction_/.test(h.at));
  const q = lc(args.q || ''), pg = page(args, 25, 200);
  const hits = j.hits.filter(h => inScope(h) && (!q || lc(h.at).includes(q))), rows = hits.slice(pg.offset, pg.offset + pg.limit);
  const perFile = {}; for (const h of hits) { const f = h.at.replace(/:\d+$/, ''); perFile[f] = (perFile[f] || 0) + 1; }
  const top = Object.entries(perFile).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([f, c]) => c + ' in ' + f.split('/').slice(-2).join('/'));
  return { text: lines(['"' + name + '"' + (what ? ' is ' + what + ' of ' + gameWord(g) : ' is not an engine event or action word (a custom name, flag, tag or entity)') + '.',
    hits.length + ' use(s) in ' + (scope === 'scripts' ? 'interaction scripts' : scope === 'missions' ? 'mission files' : 'all text data') + ' of ' + gameWord(g) + (md ? ' + ' + path.basename(md) : '') + (mods.length ? ' + ' + mods.join(', ') : '') + (j.hits.length !== hits.length ? ' (' + j.hits.length + ' in all text data: scope: "all")' : '') + (j.truncated ? '. The search stopped early (' + (j.why || 'time') + '): there may be more' : '') + '.',
    top.length ? 'Most: ' + top.join('; ') : null,
    ...rows.map(h => '- ' + h.at + '  ' + h.text + (h.where && h.where !== 'vanilla' ? '  [' + h.where + ']' : '')),
    more(hits.length, pg, rows.length),
    g.kind === 'goh' ? 'Gates of Hell: the first search builds an index of the install and can take long.' : null]),
    data: { game: g.id, name, word: what, scope, total: hits.length, everywhere: j.hits.length, truncated: j.truncated, rows } };
}

async function scriptCheck(args, ctx) {
  const g = ctx.game(args), file = fileArg(ctx, args.file, 'file');
  const view = [...U.exe(g)]; if (g.dir) view.push('--game', g.dir);
  const md = modDir(ctx, args); if (md) view.push('--mod', md);
  const jobs = [run(ctx, 'ide', ['check', file, ...view, '--json'])];
  if (args.outline === true) jobs.push(run(ctx, 'ide', ['symbols', file, '--json']));
  const [r, s] = await Promise.all(jobs);
  const bad = failed(ctx, r, 'ide check') || usage(ctx, r, 'ide check'); if (bad) return bad;
  let fsx = null; try { fsx = JSON.parse(r.stdout); } catch (e) { fsx = null; }
  if (!Array.isArray(fsx)) return ctx.bad('the file check gave no answer: ' + U.tail(r.text, 3).join(' '));
  const n = num(args.limit, 30, 1, 200), cnt = { error: 0, warn: 0, info: 0 }; for (const f of fsx) cnt[f.sev] = (cnt[f.sev] || 0) + 1;
  const t = [fwd(file) + ': ' + (fsx.length ? cnt.error + ' error(s), ' + cnt.warn + ' warning(s), ' + cnt.info + ' note(s)' : 'no findings') + ' (' + (/\.lua$/i.test(file) ? 'Lua structure only: strings, comments, brackets, blocks' : 'syntax' + (g.dir ? ', known keys' : '') + (/\.mi$/i.test(file) ? ', mission commands' : '')) + ').',
    ...fsx.slice(0, n).map(f => '- ' + f.line + ':' + f.col + ' ' + f.sev + ' ' + f.code + ': ' + U.short(f.msg, 260)),
    fsx.length > n ? '... ' + (fsx.length - n) + ' more: pass a larger limit' : null,
    g.dir ? null : 'No ' + gameWord(g) + ' install was found: text checks only, includes and key names were not checked.'];
  let outline = null;
  if (s) {
    try { outline = JSON.parse(s.stdout); } catch (e) { outline = null; }
    if (Array.isArray(outline)) { const top = outline.filter(x => x.depth <= 1); t.push('Outline (' + outline.length + ' blocks, two levels shown):', ...top.slice(0, 60).map(x => '  '.repeat(x.depth + 1) + x.name + '  ' + x.line + '-' + x.endLine), top.length > 60 ? '  ... ' + (top.length - 60) + ' more' : null); }
  }
  t.push('One file only: what other files call or include is not followed. A whole mod: mow_script_lint (interaction), mow_mission_lint (missions), mow_mod_check (everything).');
  return { text: lines(t), data: { game: g.id, file: fwd(file), counts: cnt, findings: fsx.slice(0, n).map(f => ({ line: f.line, col: f.col, sev: f.sev, code: f.code, msg: U.short(f.msg, 260), source: f.source })), outline: Array.isArray(outline) ? outline.slice(0, 200) : null } };
}

// ---------- missions ----------
async function missionLint(args, ctx) {
  const g = ctx.game(args), dir = U.need(ctx, g), mod = U.dirArg(ctx, args.mod, 'mod');
  const r = await run(ctx, 'milint', [mod, '--game', dir, ...U.exe(g), '--format', 'json', '-q', ...modsArgv(ctx, args)]);
  const bad = failed(ctx, r, 'milint') || usage(ctx, r, 'milint'); if (bad) return bad;
  const rep = U.reportOf(r.stdout);
  if (!rep) return ctx.bad('the mission check gave no answer: ' + U.tail(r.text, 3).join(' '));
  const q = lc(args.q || ''), sum = sumOf(rep, f => !q || lc(f.file).includes(q) || lc(f.code).includes(q), num(args.limit, 15, 1, 150));
  const t = ['Maps, missions and mode presets of ' + fwd(mod) + ' for ' + gameWord(g) + (q ? ' (kept: "' + q + '")' : '') + ':'];
  reportLines(t, 'milint (mission triggers and commands MIS rows, map files MAP rows, bot Lua orders)', sum);
  t.push('q keeps a map, a file or a code (q: "combat.mi", q: "MI_"). A mission\'s triggers laid out: mow_mission_triggers. Words the engine knows: mow_mission_words.',
    g.kind === 'goh' ? 'Gates of Hell: its own command and term additions are used, and its flags are map points with a zone (GHMAP-03).' : null);
  return { text: lines(t), data: { game: g.id, mod: fwd(mod), report: sum, all: rep.findings.length } };
}

function miWords(g) {
  const j = readJson('milint/micommands.json'), goh = g.kind === 'goh', d = goh ? readJson('milint/micommands-goh.json') : null;
  const rows = [];
  const add = (kind, o, tag) => { for (const [w, src] of Object.entries(o || {})) rows.push({ kind, w, src: /^[A-Z][A-Z0-9]*-\d+$/.test(String(src)) ? String(src) : '', note: tag || '' }); };   // keep a row id, never a source-file line
  add('command', j.commands); add('term', j.terms); add('statement', j.statements); add('statement', j.structural); add('trigger', j.triggerKeys); add('field', j.fields);
  if (d) { add('command', d.commands, 'Gates of Hell only'); add('term', d.terms, 'Gates of Hell only'); add('field', d.fields, 'Gates of Hell only'); }
  return { rows, gone: d && d.gone ? d.gone : {} };
}
async function missionWords(args, ctx) {
  const g = ctx.game(args), kind = lc(args.kind || 'commands'), q = lc(args.q || ''), pg = page(args, 80, 800);
  const KIND = { commands: 'command', terms: 'term', statements: 'statement', fields: 'field', trigger: 'trigger', all: null };
  if (!(kind in KIND)) return ctx.bad('kind: use commands, terms, statements, fields, trigger or all');
  const W = miWords(g);
  const hits = W.rows.filter(r => (KIND[kind] == null || r.kind === KIND[kind]) && (!q || lc(r.w).includes(q)));
  const rows = hits.slice(pg.offset, pg.offset + pg.limit), detail = !!q || rows.length <= 30;
  const t = ['Mission script (.mi) words the ' + gameWord(g) + ' reads: ' + hits.length + ' ' + (kind === 'all' ? 'word(s)' : kind) + (q ? ' matching "' + q + '"' : '') + (g.kind === 'goh' ? '. Gates of Hell additions carry their GH row' : '') + '.'];
  if (detail) t.push(...rows.map(r => '- ' + r.kind + ' ' + r.w + (r.src ? '  ' + r.src : '') + (r.note ? '  [' + r.note + ']' : '')));
  else t.push(rows.map(r => r.w + (r.note ? '*' : '')).join(', '), rows.some(r => r.note) ? '* = Gates of Hell only' : null, 'q: "<word>" lists each match on its own line.');
  t.push(more(hits.length, pg, rows.length));
  const gone = Object.entries(W.gone).filter(([c]) => !q || lc(c).includes(q));
  if (gone.length) t.push('Fields Gates of Hell dropped: ' + gone.map(([c, f]) => c + ': ' + [].concat(f).join(' ')).join('; ') + '.');
  t.push('kinds: commands (trigger actions), terms (condition parts), statements (if, while, delay ..), fields (keys inside a command or term; case matters, MIS-11), trigger (keys of a trigger block). An unknown command or term is logged and skipped. What a command takes: mow_lookup with the word.');
  return { text: lines(t), data: { game: g.id, kind, total: hits.length, rows: rows.map(r => ({ kind: r.kind, word: r.w, src: r.src, note: r.note || undefined })) } };
}

async function missionTriggers(args, ctx) {
  const g = ctx.game(args), o = { goh: g.kind === 'goh' };
  if (args.file != null && args.file !== '') o.file = fileArg(ctx, args.file, 'file');
  else {
    let key = null;
    if (args.key != null && args.key !== '') { ctx.name(args.key, 'key'); key = args.key.trim(); }
    else if (args.map != null && args.map !== '') {
      ctx.name(args.map, 'map');
      const mode = args.mode == null || args.mode === '' ? null : ctx.name(args.mode, 'mode').trim(), where = lc(args.where || 'multi');
      if (!['multi', 'single'].includes(where)) return ctx.bad('where: use multi or single');
      if (!mode) return ctx.bad('give mode: the mission file name without .mi (combat, battle_zones ..; single-player missions use 0). mow_mission_info lists a map\'s modes');
      key = 'map/' + where + '/' + args.map.trim().replace(/^\/+|\/+$/g, '') + '/' + mode.replace(/\.mi$/i, '') + '.mi';
    } else return ctx.bad('give file (a full disk path of a .mi), or map + mode (+ where: single), or key (a game path of a .mi)');
    if (path.isAbsolute(key) || key.includes('..')) return ctx.bad('key: a path as the game sees it (map/multi/<map>/<mode>.mi), not a disk path; use file for that');
    Object.assign(o, { key, game: U.need(ctx, g), exe: g.exe, mods: U.names(ctx, args.mods, 'mods'), modDir: modDir(ctx, args) || undefined });
  }
  const pr = await probe(ctx, 'triggers', o); if (pr.fail) return pr.fail;
  const j = pr.j;
  if (j.error) return ctx.bad(j.error + (j.near && j.near.length ? '. Mission files there: ' + j.near.map(k => path.posix.basename(k)).join(', ') : ''));
  const q = lc(args.q || ''), one = args.trigger != null && args.trigger !== '' ? String(args.trigger) : null, pg = page(args, 25, 200);
  let list = j.triggers;
  if (one) list = list.filter(t => t.name === one || lc(t.name) === lc(one));
  else if (q) list = list.filter(t => lc(t.name).includes(q) || t.actions.some(a => lc(a.cmd) === q) || t.terms.some(x => lc(x.kind) === q));
  const rows = list.slice(pg.offset, pg.offset + pg.limit), full = !!one || list.length <= 3;
  const cmds = {}; for (const t of j.triggers) for (const a of t.actions) if (a.what === 'command') cmds[a.cmd] = (cmds[a.cmd] || 0) + 1;
  const unknown = j.triggers.reduce((n, t) => n + t.unknown.length, 0);
  const flags = t => [t.disabled ? 'disabled' : null, t.autoreset ? 'autoreset' : null].filter(Boolean).join(', ');
  const when = t => (t.terms.length ? (t.expression ? 'when ' + t.expression + ' of ' : 'when ') + t.terms.map(x => (x.n != null ? x.n + '.' : '') + x.kind).join(', ') : 'no condition (runs at start' + (t.disabled ? ' once enabled' : '') + ')');
  const t = [j.file + ': ' + j.triggers.length + ' trigger(s)' + (j.helpers ? '; Helpers also define ' + j.defs.events + ' events, ' + j.defs.zones + ' zones, ' + j.defs.waypoints + ' waypoints, ' + j.defs.tasks + ' tasks, ' + j.defs.vars + ' vars' : '; the file has no Helpers block') + '.',
    Object.keys(cmds).length ? 'Commands used most: ' + Object.entries(cmds).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => v + ' ' + k).join(', ') + '.' : null,
    unknown ? unknown + ' word(s) the ' + gameWord(g) + ' engine does not know (logged and skipped; see the rows marked ?).' : null,
    (one || q) ? list.length + ' trigger(s) match.' : null];
  for (const r of rows) {
    if (!full) { t.push('- "' + r.name + '"' + (flags(r) ? ' [' + flags(r) + ']' : '') + ' line ' + r.line + ': ' + when(r) + ' -> ' + (r.actions.length ? r.actions.slice(0, 8).map(a => a.cmd).join(', ') + (r.actions.length > 8 ? ' ... ' + (r.actions.length - 8) + ' more' : '') : 'no actions') + (r.unknown.length ? '  ? ' + r.unknown.slice(0, 3).join(', ') : '')); continue; }
    t.push('Trigger "' + r.name + '"' + (flags(r) ? ' [' + flags(r) + ']' : '') + ', line ' + r.line + ': ' + when(r) + '.');
    for (const x of r.terms) t.push('  term ' + (x.n != null ? x.n + '.' : '') + x.kind + (x.known ? '' : ' ?') + '  ' + x.text);
    const al = r.actions.slice(0, 80);
    for (const a of al) t.push('  ' + '  '.repeat(a.depth) + (a.what === 'unknown' ? '? ' : '') + a.cmd + (a.text ? '  ' + a.text : ''));
    if (r.actions.length > al.length) t.push('  ... ' + (r.actions.length - al.length) + ' more action(s)');
  }
  t.push(more(list.length, pg, rows.length), full ? null : 'trigger: "<name>" lays one trigger out in full; q keeps names, or triggers that use a command or term (q: "reinforcement").',
    'The condition expression joins the numbered terms; with none every term must hold (inferred from the stock missions). Checks of these files: mow_mission_lint.',
    g.kind === 'goh' ? 'Gates of Hell: the same file form; its extra commands and terms are known here (GHMIS-29, 30, 32, 33).' : null);
  return { text: lines(t), data: { game: g.id, file: j.file, total: j.triggers.length, matched: list.length, defs: j.defs, commands: cmds, unknown, rows: rows.map(r => (full ? r : { name: r.name, line: r.line, disabled: r.disabled, autoreset: r.autoreset, expression: r.expression, terms: r.terms.map(x => x.kind), actions: r.actions.slice(0, 20).map(a => a.cmd), unknown: r.unknown })) } };
}

async function missionDiff(args, ctx) {
  const g = ctx.game(args);
  const side = (v, what) => { ctx.name(v, what); const s = v.trim(); if (!path.isAbsolute(s)) throw ctx.refusal(what + ': give the full path of a .mi file or of a map folder'); if (!fs.existsSync(s)) throw ctx.refusal(what + ' was not found: ' + fwd(s)); return path.resolve(s); };
  const a = side(args.a, 'a'), b = side(args.b, 'b');
  const r = await run(ctx, 'misdiff', [a, b, '--format', 'json']);   // no -q: it drops the change lines (info)
  const bad = failed(ctx, r, 'misdiff') || usage(ctx, r, 'misdiff'); if (bad) return bad;
  const rep = U.reportOf(r.stdout);
  if (!rep) return ctx.bad('the mission compare gave no answer: ' + U.tail(r.text, 3).join(' '));
  const ch = Array.isArray(rep.info) ? rep.info : [], q = lc(args.q || ''), pg = page(args, 30, 300);
  const keep = ch.filter(f => !q || lc(f.code).includes(q) || lc(f.msg).includes(q) || lc(f.file).includes(q)), rows = keep.slice(pg.offset, pg.offset + pg.limit);
  const cnt = {}; for (const f of ch) { const k = f.code.replace(/^MIS_DIFF_/, '').toLowerCase(); cnt[k] = (cnt[k] || 0) + 1; }
  const t = ['Mission compare, a = ' + fwd(a) + ', b = ' + fwd(b) + ': ' + (ch.length ? ch.length + ' change(s): ' + Object.entries(cnt).sort((x, y) => y[1] - x[1]).map(([k, v]) => v + ' ' + k).join(', ') : 'no difference in what the missions hold') + '.',
    ...rows.map(f => '- ' + f.file + (f.line ? ':' + f.line : '') + ' ' + f.code.replace(/^MIS_DIFF_/, '') + ': ' + U.short(f.msg, 220)),
    more(keep.length, pg, rows.length)];
  if (rep.findings.length) { t.push(rep.findings.length + ' warning(s) (the engine\'s reaction is not verified):'); for (const f of rep.findings.slice(0, 10)) t.push('- ' + f.code + ' ' + f.file + (f.line ? ':' + f.line : '') + ': ' + U.short(f.msg, 220)); }
  t.push('It compares what the files mean (entities by id, triggers, zones, events by name), not their text; lines are of b, of a for a removed thing. A mod\'s map against the game\'s own: mow_mission_info with mod.',
    g.kind === 'goh' ? 'Gates of Hell mission files are read by the same reader.' : null);
  return { text: lines(t), data: { game: g.id, a: fwd(a), b: fwd(b), changes: ch.length, counts: cnt, rows: rows.map(f => ({ file: f.file, line: f.line || 0, code: f.code, msg: U.short(f.msg, 220) })), warnings: rep.findings.length } };
}

// ---------- lua, console ----------
async function luaCheck(args, ctx) {
  const g = ctx.game(args), n = num(args.limit, 20, 1, 100);
  let o, mod = null;
  if (args.file != null && args.file !== '') o = { file: fileArg(ctx, args.file, 'file') };
  else if (args.mod != null && args.mod !== '') { mod = U.dirArg(ctx, args.mod, 'mod'); o = { dir: mod }; }
  else return ctx.bad('give file (a full path of a .lua) or mod (a mod folder: every .lua in it)');
  if (o.file && !/\.lua$/i.test(o.file)) return ctx.bad('file: a .lua file; other script files: mow_script_check');
  const jobs = [probe(ctx, 'lua', o)];
  if (mod && g.dir) jobs.push(run(ctx, 'milint', [mod, '--game', g.dir, ...U.exe(g), '--format', 'json', '-q']));
  const [pr, mr] = await Promise.all(jobs);
  if (pr.fail) return pr.fail;
  const j = pr.j; if (j.error) return ctx.bad(j.error);
  const badFiles = j.files.filter(f => f.error || (f.findings && f.findings.length)), all = [];
  for (const f of badFiles) for (const x of f.findings || [{ line: 0, code: 'LUA_UNREADABLE', msg: f.error }]) all.push({ file: mod ? fwd(path.relative(mod, f.file)) : f.file, line: x.line, code: x.code, msg: x.msg });
  const t = [(mod ? fwd(mod) + ': ' + j.files.length + ' .lua file(s)' + (j.cut ? ' (cut, the folder holds more)' : '') : j.files[0].file + ' (' + j.files[0].lines + ' lines)') + ': ' + (all.length ? all.length + ' structure error(s) in ' + badFiles.length + ' file(s); such a file does not load at all' : 'structure is sound (strings, comments, brackets and blocks all close)') + '.',
    ...all.slice(0, n).map(f => '- ' + f.code + ' ' + f.file + ':' + f.line + ': ' + U.short(f.msg, 220)),
    all.length > n ? '... ' + (all.length - n) + ' more: pass a larger limit' : null,
    'This is no Lua run: names, calls and types are not checked.'];
  let bot = null;
  if (mr) {
    const rep = mr.isError ? null : U.reportOf(mr.stdout);
    if (rep) { bot = sumOf(rep, f => /BOT/.test(f.code), n); reportLines(t, 'Bot script rules (milint: orders the bot API has, bot.data.lua entries)', bot); }
    else t.push('Bot script rules: the mission linter gave no answer.');
  } else if (mod) t.push('No ' + gameWord(g) + ' install was found: the bot script rules were not checked.');
  t.push(mod ? 'Why bots do not buy a unit: mow_bots_recipe.' : 'Bot order rules need the whole mod: pass mod.',
    g.kind === 'goh' ? 'Gates of Hell: bot scripts use another order set (GHMIS-54) and there is no bot.data.lua (GHMIS-66).' : null);
  return { text: lines(t), data: { game: g.id, mod: mod ? fwd(mod) : null, files: j.files.length, errors: all.slice(0, n), total: all.length, bot } };
}

async function consoleFind(args, ctx) {
  const g = ctx.game(args), n = String(num(args.limit, 12, 1, 40));
  const words = args.q == null || args.q === '' ? [] : ctx.name(args.q, 'q').trim().split(/\s+/);
  for (const w of words) ctx.name(w, 'q');
  const goh = g.kind === 'goh';
  const jobs = [ctx.q(goh ? ['gohweb', '-k', 'console', ...words, '-n', n] : ['-k', 'console', ...words, '-n', n])];
  if (!words.length && !goh) jobs.push(ctx.q(['-t', 'mission', 'console']));
  if (g.id === 'mowas2') jobs.push(ctx.q(['-l', 'ENG-19', 'TST-28']));
  const rs = await Promise.all(jobs);
  if (rs[0].isError) return failed(ctx, rs[0], 'the knowledge lookup');
  const rowsOf = r => String(r.stdout || '').split(/\r?\n/).map(l => l.trimEnd()).filter(Boolean).map(l => U.short(l, 600));
  const rows = rowsOf(rs[0]), topic = !words.length && !goh ? rowsOf(rs[1]).filter(l => /^- /.test(l)).slice(0, 8) : [], av = g.id === 'mowas2' ? rowsOf(rs[rs.length - 1]) : [];
  return { text: lines(['Console commands and variables, ' + gameWord(g) + (words.length ? ', rows with "' + words.join(' ') + '"' : '') + ' (knowledge web rows; [V] verified, [I] inferred, [T] needs a test in the game):',
    av.length ? 'Whether this game has a console at all:' : null, ...av.map(l => '  ' + l),
    topic.length ? 'Overview (modweb mission/console):' : null, ...topic.map(l => '  ' + l),
    rows.length ? 'Rows:' : 'No row matches. Try one word (a prefix such as mp_, dbg_, g_).', ...rows.map(l => '  ' + l),
    'q narrows (q: "mp_", q: "reload"); a full row: mow_limit with the id.',
    goh ? 'Gates of Hell rows are differences from AS64, not tested in game.' : null]),
    data: { game: g.id, q: words.join(' '), rows, overview: topic, availability: av } };
}

// ---------- the tools ----------
const READ = 'read';
const tools = [
  { name: 'mow_script_lint', title: 'Check interaction scripts', kind: READ, wraps: 'ialint, fxlint',
    description: 'Use when a unit does not react to hits, burns wrongly, or the game refuses an interaction file: checks the {on event} scripts of a mod (set/interaction_entity, set/interaction_terrain, includes expanded) for unknown events, twin handlers, calls to handlers that do not exist, lost context in delays, flag overflow and unknown actions. Without mod it checks the game alone. All three games; goh uses its own event and action sets.',
    inputSchema: schema({ mod: P.modOpt, mods: P.mods, limit: P.limit }), handler: scriptLint },
  { name: 'mow_script_words', title: 'Events and actions of interaction scripts', kind: READ, wraps: 'ialint EVENTS, fxlint actions.json',
    description: 'Use to see which words the engine knows in an interaction script: the events of {on <event>} and the action names, with the actions that hold other actions. q narrows; explain: true with q adds what the knowledge web says the word takes. Lists follow the game: goh adds events (GHINT-17, GHINT-45) and has its own action list (GHINT-26); as64 and mowas2 share one.',
    inputSchema: schema({ kind: { type: 'string', enum: ['all', 'events', 'actions', 'containers'] }, q: P.q, explain: { type: 'boolean', description: 'With q: add knowledge-web lines about the word' }, limit: P.limit, offset: P.offset }), handler: scriptWords },
  { name: 'mow_script_find', title: 'Where a script word or name is used', kind: READ, wraps: 'ide intel refs',
    description: 'Use to find every place an event, action, custom handler name, flag or tag is used: file, line and the line\'s text, in the game plus mod or mods. scope: scripts (interaction files, default), missions (.mi) or all text data. Says whether the name is an engine event or action. q narrows by path; limit and offset page. All three games; goh: the first search builds an index and can take long.',
    inputSchema: schema({ name: { type: 'string', description: 'One word, e.g. bullet_hit, blastwave, a handler name' }, scope: { type: 'string', enum: ['scripts', 'missions', 'all'] }, q: { type: 'string', description: 'Part of a path to keep' }, mod: P.modOpt, mods: P.mods, limit: P.limit, offset: P.offset }, ['name']), handler: scriptFind },
  { name: 'mow_script_check', title: 'Check one script or data file', kind: READ, wraps: 'ide check, ide symbols',
    description: 'Use to check a single file you are editing (.def .inc .set .ext .mi .lua .lng .po): syntax errors with line and column, unknown keys when the game is found, mission command checks for a .mi, structure errors for a .lua. outline: true adds the block outline. It does not follow other files. All three games; goh uses its own key and mission word lists.',
    inputSchema: schema({ file: { type: 'string', description: 'Full path of the file' }, mod: { type: 'string', description: 'Full path of the mod folder the file belongs to (default: the folder above its resource/)' }, outline: { type: 'boolean' }, limit: P.limit }, ['file']), handler: scriptCheck },
  { name: 'mow_mission_lint', title: 'Check missions and map scripts of a mod', kind: READ, wraps: 'milint',
    description: 'Use when a mission or map of a mod crashes at load, a trigger never fires or a map is missing from the lobby: checks every .mi (unknown commands and terms, wrong key case, names no Helpers block defines, empty actions), map files and mode presets, and bot Lua orders. q keeps one map, file or code. All three games; goh uses its own command additions and flag form (GHMAP-03).',
    inputSchema: schema({ mod: P.mod, q: { type: 'string', description: 'Part of a file path or of a code' }, mods: P.mods, limit: P.limit }, ['mod']), handler: missionLint },
  { name: 'mow_mission_words', title: 'Commands and terms of mission scripts', kind: READ, wraps: 'milint micommands.json',
    description: 'Use to see which words a mission file (.mi) may use: trigger commands, condition terms, statements (if, while, delay), the field keys inside them and the keys of a trigger block. q narrows. goh: adds its own commands, terms and fields with their GH row and names the fields it dropped; as64 and mowas2 share one list.',
    inputSchema: schema({ kind: { type: 'string', enum: ['commands', 'terms', 'statements', 'fields', 'trigger', 'all'], description: 'Default commands' }, q: P.q, limit: P.limit, offset: P.offset }), handler: missionWords },
  { name: 'mow_mission_triggers', title: 'Explain a mission\'s triggers', kind: READ, wraps: 'misdiff parseMi, milint vocab',
    description: 'Use to understand what a mission does: lists its triggers with when each fires (condition terms and expression) and what it does (commands in order), marks words the engine does not know, and counts events, zones, tasks. trigger: "<name>" lays one out in full; q keeps names or users of a command. Give file, or map + mode (where: single for single-player), or key. All three games; goh files read the same way.',
    inputSchema: schema({ file: { type: 'string', description: 'Full disk path of a .mi' }, map: { type: 'string', description: 'Map folder name, e.g. 1v1_argentan' }, mode: { type: 'string', description: 'Mission file name without .mi: combat, battle_zones, 0' }, where: { type: 'string', enum: ['multi', 'single'] }, key: { type: 'string', description: 'Game path of a .mi' }, trigger: { type: 'string', description: 'One trigger name, in full' }, q: P.q, mod: P.modOpt, mods: P.mods, limit: P.limit, offset: P.offset }), handler: missionTriggers },
  { name: 'mow_mission_diff', title: 'Compare two missions', kind: READ, wraps: 'misdiff',
    description: 'Use to see what changed between two versions of a mission: a and b are .mi files or map folders on disk. Answers entities added, removed, moved or changed (matched by id), triggers, zones, events, waypoints and tasks added, removed or changed, and warnings such as a removed thing still named by a trigger. Not a text diff. All three games; goh files use the same reader.',
    inputSchema: schema({ a: { type: 'string', description: 'Full path: the older .mi or map folder' }, b: { type: 'string', description: 'Full path: the newer .mi or map folder' }, q: { type: 'string', description: 'Keep changes with this text (trigger, entity, a name)' }, limit: P.limit, offset: P.offset }, ['a', 'b']), handler: missionDiff },
  { name: 'mow_lua_check', title: 'Check Lua scripts', kind: READ, wraps: 'ide intel lua, milint',
    description: 'Use when bots do nothing or a Lua script is ignored: finds structure errors that stop a .lua from loading (a string or comment that never ends, brackets or blocks without their end). With mod it checks every .lua in the folder and adds the bot script rules (orders the bot API has, bot.data.lua entries). It does not run Lua. goh: another bot order set (GHMIS-54), no bot.data.lua (GHMIS-66).',
    inputSchema: schema({ file: { type: 'string', description: 'Full path of one .lua' }, mod: P.mod, limit: P.limit }), handler: luaCheck },
  { name: 'mow_console_find', title: 'Console commands and variables', kind: READ, wraps: 'q.js (knowledge webs)',
    description: 'Use to find a console command or variable and whether the game can run it: answers the knowledge-web rows about the console (commands, debug variables such as dbg_ and g_, command-line switches), each with its id and a verified or inferred tag. q narrows. as64: reachable with -console; mowas2: the rows that say whether the retail game has a console come first; goh: rows are differences from AS64, untested.',
    inputSchema: schema({ q: { type: 'string', description: 'Words, e.g. mp_, reload, dbg_health' }, limit: P.limit }), handler: consoleFind },
];
for (const t of tools) t.games = GAMES;

module.exports = { group: 'scripts', tools };
