// mcp scripts test: every tool of tools/mcp/tools/scripts.js, its handler called directly with a ctx (lib/ctx forCall), on the real
// installs read-only and on the repo's small fixtures. Every tool of the group reads; the test writes only its own scratch files
// (a broken .lua, two .mi) into env ARSENAL_TMP when set, else the os temp. Refusals: a relative path, a path starting with -,
// a missing file or folder, a missing install, bad arguments.
//   node tools/mcp/test/scripts.test.js         MCP_SCRIPTS_SHOW=1 prints every answer
// An install that is not there skips its cases with a printed reason. Caches are kept in <ARSENAL_TMP or os temp>\arsenal-mcp-scripts between runs.
// Author: Imperator_Aug (ARSENAL, ia-1e898227)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { T, scratch, tmpBase, gameDirs, rm, ROOT, NOTES } = require('./rpc');
const t = T('scripts');
const SHOW = process.env.MCP_SCRIPTS_SHOW === '1';

const { AS2, GOH: GOH0 } = gameDirs();
const GOH = GOH0;
const hasAs2 = fs.existsSync(path.join(AS2, 'resource')), hasGoh = fs.existsSync(path.join(GOH, 'resource'));
const keep = path.join(tmpBase(), 'arsenal-mcp-scripts');
fs.mkdirSync(keep, { recursive: true });
const S = scratch('scriptstest');
Object.assign(process.env, { ARSENAL_TMP: keep, ARSENAL_MCP_STORE: path.join(keep, 'store'), ARSENAL_CACHE: path.join(keep, 'cache'), ARSENAL_WRITE_ROOTS: S, ARSENAL_NO_STEAM: '1', ARSENAL_SETTINGS: path.join(S, 'no-settings.json') });
process.env.ARSENAL_AS2_DIR = hasAs2 ? AS2 : path.join(S, 'no-as2');
process.env.ARSENAL_GOH_DIR = hasGoh ? GOH : path.join(S, 'no-goh');

const ctxLib = require('../lib/ctx');
const M = require('../tools/scripts');
const tool = n => M.tools.find(x => x.name === n);
async function call(name, args) {
  const tl = tool(name);
  if (!tl) return { text: 'no tool ' + name, isError: true, missing: true };
  args = args || {};
  if (ctxLib._reset) ctxLib._reset();
  const t0 = Date.now();
  let r;
  try { r = await tl.handler(args, ctxLib.forCall(tl, args)); }
  catch (e) { if (e && e.refused) r = { text: 'refused: ' + e.message, isError: true, refused: true }; else r = { text: 'THREW ' + (e && e.stack || e), isError: true, threw: true }; }
  r = r || { text: '', isError: true };
  if (r.na) r.text = r.text || ('not available: ' + r.na);
  if (SHOW) console.log('--- ' + name + ' ' + JSON.stringify(args).slice(0, 200) + '  (' + (Date.now() - t0) + ' ms)\n' + String(r.text).slice(0, 1500));
  return r;
}
const got = r => ' | got: ' + String(r && r.text).slice(0, 400).replace(/\n/g, ' / ');
const good = (r, what) => t.ok(r && !r.isError && !r.na && typeof r.text === 'string' && r.text.length > 0, what + (r && (r.isError || r.na) ? got(r) : ''));
const refused = (r, part, what) => t.ok(r && r.isError && !r.threw && String(r.text).includes(part), what + got(r));
const has = (r, re, what) => t.ok(r && !r.threw && re.test(String(r.text)), what + got(r));
const skip = (why, n) => console.log('scripts: skipped ' + n + ' case(s): ' + why);
const FIX = path.join(ROOT, 'tools');
const IABAD = path.join(FIX, 'ialint', 'test', 'bad'), IAGOH = path.join(FIX, 'ialint', 'test', 'goh'), MIMOD = path.join(FIX, 'milint', 'test', 'fixture', 'mod');
const M6 = path.join(MIMOD, 'resource', 'map', 'multi', 'm6', 'combat.mi'), BOT = path.join(MIMOD, 'resource', 'script', 'multiplayer', 'bot.lua');
const NAMES = ['mow_script_lint', 'mow_script_words', 'mow_script_find', 'mow_script_check', 'mow_mission_lint', 'mow_mission_words', 'mow_mission_triggers', 'mow_mission_diff', 'mow_lua_check', 'mow_console_find'];

// two small missions that differ, and a .lua that can not load (text data: CRLF)
const MI = (zone, extra) => ['{mission', '\t{Helpers', '\t\t{zones', '\t\t\t{"zA" {Radius ' + zone + '} {Position 1 1}}', '\t\t}', '\t\t{triggers',
  '\t\t\t{"t_keep"', '\t\t\t\t{condition', '\t\t\t\t\t{terms', '\t\t\t\t\t\t{"1.event" {name "go"}}', '\t\t\t\t\t}', '\t\t\t\t}',
  '\t\t\t\t{actions', '\t\t\t\t\t{"delay" {time 2}', '\t\t\t\t\t\t{"con" {cmd "x"}}', '\t\t\t\t\t}', '\t\t\t\t\t{"zz_no_cmd" {a 1}}', '\t\t\t\t}', '\t\t\t}', extra || '', '\t\t}', '\t}', '}', ''].filter(l => l !== '').join('\r\n') + '\r\n';
const miA = path.join(S, 'a.mi'), miB = path.join(S, 'b.mi'), badLua = path.join(S, 'bad.lua'), luaMod = path.join(S, 'luamod');
fs.writeFileSync(miA, MI(10));
fs.writeFileSync(miB, MI(25, '\t\t\t{"t_new" {actions {"con" {cmd "y"}}}}'));
fs.writeFileSync(badLua, 'function a()\r\n  local s = "x\r\n  if x then\r\nend\r\n');
fs.mkdirSync(path.join(luaMod, 'resource', 'script'), { recursive: true });
fs.copyFileSync(badLua, path.join(luaMod, 'resource', 'script', 'bad.lua'));
fs.writeFileSync(path.join(luaMod, 'resource', 'script', 'ok.lua'), 'local a = 1\r\nfunction f() return a end\r\n');

(async () => {
  try {
    // ----- the module itself -----
    t.ok(M.group === 'scripts' && M.tools.length >= 6 && M.tools.length <= 12, 'module: group scripts with 6 to 12 tools');
    t.ok(M.tools.every(x => /^mow_[a-z0-9]+(_[a-z0-9]+)*$/.test(x.name) && x.title && x.description.length > 80 && x.description.length < 900 && ['read', 'write'].includes(x.kind) && x.games.length === 3 && typeof x.handler === 'function' && x.inputSchema.type === 'object'), 'module: every tool has name, title, description, kind, games, schema, handler');
    t.ok(new Set(M.tools.map(x => x.name)).size === M.tools.length, 'module: no name twice');
    t.ok(M.tools.every(x => /goh|Gates of Hell|All three games/i.test(x.description)), 'module: every description says the per-game difference');
    t.ok(M.tools.every(x => !/\bdear(er)?\b/i.test(x.title + ' ' + x.description)), 'module: plain words in titles and descriptions');
    t.ok(M.tools.every(x => x.kind === 'read'), 'module: every tool reads');
    for (const n of NAMES) t.ok(!!tool(n), 'module: has ' + n);
    { const others = []; for (const f of fs.readdirSync(path.join(__dirname, '..', 'tools'))) if (/\.js$/.test(f) && f !== 'scripts.js') { try { for (const x of require('../tools/' + f).tools || []) others.push(x.name); } catch (e) { /* another builder's module, not ours to judge */ } }
      t.ok(M.tools.every(x => !others.includes(x.name)), 'module: no name another module has'); }

    // ----- refusals and bad arguments that need no install -----
    refused(await call('mow_mission_lint', { mod: 'relative\\mod' }), 'full path', 'mission_lint: a relative path is refused');
    refused(await call('mow_script_check', { file: 'rel.set' }), 'full path', 'script_check: a relative file is refused');
    refused(await call('mow_script_check', { file: '-x' }), 'refused', 'script_check: a path starting with - is refused');
    refused(await call('mow_script_check', { file: path.join(S, 'none.set') }), 'not found', 'script_check: a missing file is refused');
    refused(await call('mow_script_check', {}), 'file', 'script_check: no file is refused');
    refused(await call('mow_mission_diff', { a: 'rel.mi', b: miB }), 'full path', 'mission_diff: a relative path is refused');
    refused(await call('mow_mission_diff', { a: miA, b: path.join(S, 'none.mi') }), 'not found', 'mission_diff: a missing side is refused');
    refused(await call('mow_mission_diff', { a: miA }), 'b', 'mission_diff: one side only is refused');
    refused(await call('mow_lua_check', {}), 'file', 'lua_check: neither file nor mod is refused');
    refused(await call('mow_lua_check', { file: miA }), '.lua', 'lua_check: a file that is no .lua is refused');
    refused(await call('mow_lua_check', { mod: path.join(S, 'nothere') }), 'not found', 'lua_check: a missing folder is refused');
    refused(await call('mow_mission_triggers', {}), 'file', 'mission_triggers: no file, map or key is refused');
    refused(await call('mow_mission_triggers', { file: path.join(S, 'none.mi') }), 'not found', 'mission_triggers: a missing file is refused');
    refused(await call('mow_mission_triggers', { map: '1v1_x' }), 'mode', 'mission_triggers: a map without a mode is refused');
    refused(await call('mow_mission_triggers', { map: '1v1_x', mode: 'combat', where: 'moon' }), 'where', 'mission_triggers: an unknown place is refused');
    refused(await call('mow_script_words', { kind: 'verbs' }), 'kind', 'script_words: an unknown kind is refused');
    refused(await call('mow_mission_words', { kind: 'verbs' }), 'kind', 'mission_words: an unknown kind is refused');
    refused(await call('mow_script_words', { game: 'quake' }), 'game', 'script_words: an unknown game is refused');
    refused(await call('mow_console_find', { q: '-x' }), 'refused', 'console_find: words starting with - are refused');
    { const a = process.env.ARSENAL_AS2_DIR; process.env.ARSENAL_AS2_DIR = path.join(S, 'no-as2');
      for (const [n, args] of [['mow_script_lint', { mod: IABAD }], ['mow_script_find', { name: 'bullet_hit' }], ['mow_mission_lint', { mod: MIMOD }], ['mow_mission_triggers', { map: '1v1_argentan', mode: 'combat' }]])
        refused(await call(n, args), 'ARSENAL_AS2_DIR', n + ': no install is said with the variable to set');
      // tools that need no install still answer without one
      const lw = await call('mow_lua_check', { mod: luaMod });
      t.ok(lw && !lw.threw && !lw.isError && /were not checked/.test(lw.text), 'lua_check: without an install the structure is still checked and the gap is said' + got(lw));
      const cw = await call('mow_script_check', { file: BOT });
      t.ok(cw && !cw.threw && !cw.isError && /text checks only/.test(cw.text), 'script_check: without an install it says what was not checked' + got(cw));
      process.env.ARSENAL_AS2_DIR = a; }

    // ----- word lists: the linters' own tables (no install needed) -----
    const sw = await call('mow_script_words', {});
    good(sw, 'script_words'); has(sw, /bullet_hit/, 'script_words: lists events'); has(sw, /blastwave/, 'script_words: lists actions'); has(sw, /INT-23/, 'script_words: events carry their limits row'); has(sw, /VIS-18/, 'script_words: actions carry their limits row');
    t.ok(sw.data.events.length === require('../../ialint/ialint.js').EVENTS.size, 'script_words: the event list is the linter\'s own table');
    t.ok(!sw.data.events.includes('destroy'), 'script_words as64: no Gates of Hell event');
    const sq = await call('mow_script_words', { q: 'blast' });
    good(sq, 'script_words with q'); t.ok(sq.data.events.every(w => w.includes('blast')) && sq.data.actions.every(w => w.includes('blast')) && sq.data.events.length >= 2, 'script_words: q keeps matching words');
    has(sq, /Gates of Hell only/, 'script_words: names the events only Gates of Hell has');
    const sp = await call('mow_script_words', { kind: 'actions', limit: 5 });
    good(sp, 'script_words paged'); has(sp, /offset: 5/, 'script_words: a cut list names the next offset');
    good(await call('mow_script_words', { kind: 'containers' }), 'script_words containers');
    const sg = await call('mow_script_words', { game: 'goh', kind: 'events' });
    good(sg, 'script_words goh'); has(sg, /blast_wreaked \[Gates of Hell only\]/, 'script_words goh: its added events are marked'); has(sg, /GHINT-17/, 'script_words goh: carries the GoH row');
    const sm = await call('mow_script_words', { game: 'mowas2', kind: 'events' });
    t.ok(sm.data && sm.data.events.join() === sw.data.events.join(), 'script_words mowas2: the same events as as64');
    const mw = await call('mow_mission_words', {});
    good(mw, 'mission_words'); has(mw, /reinforcement/, 'mission_words: lists commands'); t.ok(mw.data.total >= 60, 'mission_words: all commands counted');
    const mq = await call('mow_mission_words', { q: 'reinf', kind: 'all' });
    good(mq, 'mission_words with q'); has(mq, /- command reinforcement/, 'mission_words: a match on its own line'); t.ok(!/\.cpp\b/.test(mq.text) && mq.data.rows.every(r => !/\.cpp\b/.test(r.src)), 'mission_words: no source-file lines');
    const mp = await call('mow_mission_words', { kind: 'fields', limit: 10 });
    good(mp, 'mission_words fields'); has(mp, /offset: 10/, 'mission_words: a cut list names the next offset'); has(mp, /MIS-11/, 'mission_words: the key case rule carries its row');
    const mg = await call('mow_mission_words', { game: 'goh', kind: 'terms' });
    good(mg, 'mission_words goh'); has(mg, /Gates of Hell only/, 'mission_words goh: its added terms are marked'); t.ok(mg.data.total > (await call('mow_mission_words', { kind: 'terms' })).data.total, 'mission_words goh: more terms than as64');
    good(await call('mow_mission_words', { kind: 'statements' }), 'mission_words statements');
    good(await call('mow_mission_words', { kind: 'trigger' }), 'mission_words trigger keys');

    // ----- one file: lua, triggers, diff (no install needed) -----
    const lb = await call('mow_lua_check', { file: badLua });
    good(lb, 'lua_check bad file'); has(lb, /LUA_STRING_OPEN/, 'lua_check: finds the open string'); has(lb, /LUA_BLOCK_OPEN/, 'lua_check: finds the open block'); has(lb, /no Lua run/, 'lua_check: says what it does not check');
    const lo = await call('mow_lua_check', { file: BOT });
    good(lo, 'lua_check sound file'); has(lo, /structure is sound/, 'lua_check: a sound file is said sound');
    const tf = await call('mow_mission_triggers', { file: miB });
    good(tf, 'mission_triggers by file'); has(tf, /2 trigger/, 'mission_triggers: counts the triggers'); has(tf, /"t_keep"/, 'mission_triggers: names a trigger'); has(tf, /1 zones/, 'mission_triggers: counts zones');
    has(tf, /does not know/, 'mission_triggers: says a word the engine does not know'); t.ok(tf.data.unknown === 1, 'mission_triggers: one unknown word in the seeded file');
    const t1 = await call('mow_mission_triggers', { file: miB, trigger: 't_keep' });
    good(t1, 'mission_triggers one trigger'); has(t1, /term 1\.event/, 'mission_triggers: the term laid out'); has(t1, /\? zz_no_cmd/, 'mission_triggers: the unknown command is marked'); has(t1, /delay[\s\S]*\n\s+con/, 'mission_triggers: a command inside a delay is nested');
    const t0 = await call('mow_mission_triggers', { file: miB, q: 'zz_none' });
    t.ok(t0 && !t0.isError && /0 trigger\(s\) match/.test(t0.text), 'mission_triggers: q with no match says so' + got(t0));
    good(await call('mow_mission_triggers', { file: M6 }), 'mission_triggers on the milint fixture');
    const tg = await call('mow_mission_triggers', { game: 'goh', file: miB });
    good(tg, 'mission_triggers goh by file'); has(tg, /GHMIS-/, 'mission_triggers goh: carries the GoH rows');
    const df = await call('mow_mission_diff', { a: miA, b: miB });
    good(df, 'mission_diff'); has(df, /TRIGGER_ADDED/, 'mission_diff: the added trigger'); has(df, /ZONE_CHANGED/, 'mission_diff: the changed zone'); t.ok(df.data.changes >= 2, 'mission_diff: counts the changes');
    const dq = await call('mow_mission_diff', { a: miA, b: miB, q: 'zone' });
    good(dq, 'mission_diff with q'); t.ok(!/TRIGGER_ADDED/.test(dq.text) && /ZONE_CHANGED/.test(dq.text), 'mission_diff: q keeps matching changes');
    const ds = await call('mow_mission_diff', { a: miA, b: miA });
    good(ds, 'mission_diff same file'); has(ds, /no difference/, 'mission_diff: equal files are said equal');
    good(await call('mow_mission_diff', { game: 'goh', a: miA, b: miB }), 'mission_diff goh');

    // ----- console: knowledge web rows (no install needed) -----
    const cf = await call('mow_console_find', {});
    good(cf, 'console_find'); if (NOTES) has(cf, /Overview/, 'console_find: the overview comes first without words'); if (NOTES) has(cf, /[A-Z]{2,5}-\d+/, 'console_find: rows carry their ids');
    const cq = await call('mow_console_find', { q: 'reload', limit: 5 });
    good(cq, 'console_find with q'); if (NOTES) has(cq, /ed_reloadInteractions/, 'console_find: finds the reload command');
    const cm = await call('mow_console_find', { game: 'mowas2' });
    good(cm, 'console_find mowas2'); if (NOTES) has(cm, /ENG-19/, 'console_find mowas2: says first whether the retail game has a console'); if (NOTES) has(cm, /TST-28/, 'console_find mowas2: names the commands only as64 has');
    const cg = await call('mow_console_find', { game: 'goh' });
    good(cg, 'console_find goh'); if (NOTES) has(cg, /GH[A-Z]+-\d+/, 'console_find goh: rows are GoH difference rows'); if (NOTES) has(cg, /not tested in game/, 'console_find goh: says the rows are untested');

    if (!hasAs2) skip('no MoW:AS2 / AS64 install at ' + AS2 + ' (set ARSENAL_AS2_DIR)', 40);
    else {
      // ----- interaction scripts -----
      const sl = await call('mow_script_lint', { mod: IABAD, limit: 5 });
      good(sl, 'script_lint'); has(sl, /INT_EVENT_UNKNOWN/, 'script_lint: finds the seeded unknown event'); has(sl, /INT_EVENT_DUP/, 'script_lint: finds the seeded twin handler'); has(sl, /larger limit/, 'script_lint: a cut list says how to get more');
      t.ok(sl.data.ialint.total >= 10 && sl.data.ialint.findings.length === 5, 'script_lint: data has the total and the cut findings');
      const sv = await call('mow_script_lint', {});
      good(sv, 'script_lint game alone'); has(sv, /the game alone/, 'script_lint: without mod it says what was checked');
      refused(await call('mow_script_lint', { mod: 'x' }), 'full path', 'script_lint: a relative path is refused');
      refused(await call('mow_script_lint', { mod: path.join(S, 'nothere') }), 'not found', 'script_lint: a missing folder is refused');
      const se = await call('mow_script_words', { q: 'blastwave', explain: true });
      good(se, 'script_words explain'); has(se, /knowledge web says/, 'script_words: explain adds knowledge-web lines');
      const sf = await call('mow_script_find', { name: 'bullet_hit', limit: 4 });
      good(sf, 'script_find'); has(sf, /is an engine event/, 'script_find: says the word is an engine event'); has(sf, /interaction_entity\/\S+:\d+ {2}\{on bullet_hit/, 'script_find: file, line and the line text'); has(sf, /offset: 4/, 'script_find: a cut list names the next offset');
      t.ok(sf.data.total > 4 && sf.data.rows.length === 4, 'script_find: data has the total and the cut rows');
      const sa = await call('mow_script_find', { name: 'blastwave', game: 'mowas2', scope: 'all', q: 'cannon', limit: 3 });
      good(sa, 'script_find mowas2, all text data'); has(sa, /is an engine action/, 'script_find: says the word is an engine action'); t.ok(sa.data.rows.every(r => /cannon/.test(r.at)), 'script_find: q keeps matching paths');
      const sn = await call('mow_script_find', { name: 'zz_no_such_word_zz' });
      t.ok(sn && !sn.threw && !sn.isError && /0 use\(s\)/.test(sn.text) && /not an engine event or action/.test(sn.text), 'script_find: an unknown word has no uses, said plainly' + got(sn));
      refused(await call('mow_script_find', { name: 'two words' }), 'name', 'script_find: a name with a space is refused');
      refused(await call('mow_script_find', { name: 'bullet_hit', scope: 'moon' }), 'scope', 'script_find: an unknown scope is refused');
      refused(await call('mow_script_find', {}), 'name', 'script_find: no name is refused');
      const sc = await call('mow_script_check', { file: path.join(IABAD, 'set', 'interaction_entity', 'entity.set'), outline: true });
      good(sc, 'script_check'); has(sc, /Outline/, 'script_check: outline: true adds the outline'); has(sc, /One file only/, 'script_check: says what it does not follow');
      const sb = await call('mow_script_check', { file: badLua });
      good(sb, 'script_check lua'); has(sb, /2 error/, 'script_check: counts the errors of a broken .lua'); has(sb, /\d+:\d+ error LUA_/, 'script_check: line, column and code');
      good(await call('mow_script_check', { file: M6, limit: 5 }), 'script_check on a .mi');

      // ----- missions, bot lua -----
      const ml = await call('mow_mission_lint', { mod: MIMOD, limit: 5 });
      good(ml, 'mission_lint'); has(ml, /MI_CMD_UNKNOWN/, 'mission_lint: counts the seeded unknown command'); has(ml, /larger limit/, 'mission_lint: a cut list says how to get more');
      const mq2 = await call('mow_mission_lint', { mod: MIMOD, q: 'm6/' });
      good(mq2, 'mission_lint with q'); t.ok(mq2.data.report.findings.every(f => /m6\//.test(f.file)) && mq2.data.report.total < mq2.data.all, 'mission_lint: q keeps one map');
      refused(await call('mow_mission_lint', { mod: path.join(S, 'nothere') }), 'not found', 'mission_lint: a missing folder is refused');
      refused(await call('mow_mission_lint', {}), 'mod', 'mission_lint: no mod is refused');
      const tr = await call('mow_mission_triggers', { map: '1v1_argentan', mode: 'combat' });
      good(tr, 'mission_triggers by map and mode'); has(tr, /combat\.mi: \d+ trigger/, 'mission_triggers: reads the game\'s own mission'); t.ok(tr.data.unknown === 0, 'mission_triggers: a stock mission has no unknown word');
      const tb = await call('mow_mission_triggers', { map: '01_usa-skirmish/01_usa-overlord', mode: '0', where: 'single', limit: 4 });
      good(tb, 'mission_triggers single-player'); has(tb, /offset: 4/, 'mission_triggers: a cut list names the next offset'); t.ok(tb.data.total > 100 && tb.data.rows.length === 4 && String(tb.text).length < 4000, 'mission_triggers: a big mission stays short');
      const tq = await call('mow_mission_triggers', { key: 'map/single/01_usa-skirmish/01_usa-overlord/0.mi', q: 'reinforcement', limit: 3 });
      good(tq, 'mission_triggers by key with q'); t.ok(tq.data.matched < tq.data.total && tq.data.matched > 0, 'mission_triggers: q keeps the triggers that use a command');
      refused(await call('mow_mission_triggers', { map: '1v1_argentan', mode: 'nope' }), 'Mission files there', 'mission_triggers: an unknown mode names the ones that exist');
      refused(await call('mow_mission_triggers', { key: 'C:\\x\\y.mi' }), 'key', 'mission_triggers: a disk path as key is refused');
      const lm = await call('mow_lua_check', { mod: MIMOD });
      good(lm, 'lua_check mod'); has(lm, /2 \.lua file/, 'lua_check: reads every .lua of the mod'); has(lm, /WARN_MIS_BOT_ORDER/, 'lua_check: adds the bot order rule'); has(lm, /MIS_BOT_UNIT_UNKNOWN/, 'lua_check: adds the bot.data.lua rule');
      const lx = await call('mow_lua_check', { mod: luaMod });
      good(lx, 'lua_check mod with a broken file'); has(lx, /2 structure error\(s\) in 1 file/, 'lua_check: counts errors and files'); has(lx, /resource\/script\/bad\.lua:\d+/, 'lua_check: the path is inside the mod');
    }

    // ----- Gates of Hell: the cheap reads on fixtures -----
    if (!hasGoh) skip('no Gates of Hell install at ' + GOH + ' (set ARSENAL_GOH_DIR)', 4);
    else {
      const gl = await call('mow_script_lint', { game: 'goh', mod: IAGOH });
      t.ok(gl && !gl.threw && !gl.isError && /GHINT-17/.test(gl.text) && !/INT_EVENT_UNKNOWN/.test(gl.text), 'script_lint goh: its own events are known' + got(gl));
      const gm = await call('mow_mission_lint', { game: 'goh', mod: MIMOD, limit: 3 });
      t.ok(gm && !gm.threw && !gm.isError && /GHMAP-03/.test(gm.text), 'mission_lint goh' + got(gm));
      const gu = await call('mow_lua_check', { game: 'goh', mod: luaMod });
      t.ok(gu && !gu.threw && !gu.isError && /GHMIS-54/.test(gu.text), 'lua_check goh: names its own bot order set' + got(gu));
      const gc = await call('mow_script_check', { game: 'goh', file: badLua });
      t.ok(gc && !gc.threw && !gc.isError && /LUA_/.test(gc.text), 'script_check goh' + got(gc));
      skip('the Gates of Hell usage search (script_find) and a stock GoH mission by key build an index of the install on first use; not run here', 2);
    }
    t.ok(!fs.existsSync(path.join(AS2, 'resource', 'zz_mcp_test')) && !fs.existsSync(path.join(GOH, 'resource', 'zz_mcp_test')), 'the game folders were not written');
  } catch (e) { t.ok(false, 'the test itself threw: ' + (e && e.stack || e)); }
  rm(S);
  t.done();
})();
