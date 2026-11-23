// bots/buycheck server: "Check the bot buy list". Reads the effective script/multiplayer/bot.data.lua, bots_generic.inc and the MP presets
// (mod copy over the game's, through bots/lib effective + vfs) and lists every silent problem as a row with params the page words in 4 languages.
// Checks (limits rows) and the code reused:
//   1 MIS-32 unit with no buy card       botrecipe botcheck.cardNames (card names = {"name" lines + squad name(N) side(S)), as BOT_UNIT_NO_CARD / milint
//                                        MIS_BOT_UNIT_UNKNOWN; a card marked {not_for_sale} counts as none (milint rule: a later plain line keeps it)
//   2 MIS-09 army missing from a stage   milint botData rule (armies = those the list uses in any stage), MIS_BOT_ARMY_MISSING
//   3 AI-15/MIS-10 period/AttackBaseTime keylint luaPass BOT_DATA_UNUSED_KEY finds them; the fix is fix/lib/tidy stripBotKeys (same cuts,
//                                        checked equal) gated by tidy.check, refused when another Lua file of the mod names the key (fix botkeys)
//   4 MIS-84 stage shape, MIS-80 entry keys  botrecipe botcheck rules (Repeat whole >= 0, Units ["army"] lists, a Repeat 0 stage, entry keys
//                                        stock bot.lua reads = vanilla entry keys + min_income/min_team; a key the mod's own bot.lua names is fine)
//   5 MIS-02 balancing without chargeFactors  milint preset rule (teams/bots entries; bots_generic.inc entries count as bots entries)
//   6 MIS-05 budgets without "vehicle"   milint preset rule (common budgets)
//   7 AI-22 Subscribe before require     botrecipe botsub.check; plus keylint WARN_BOT_API_UNKNOWN on the mod's bot*.lua (AI-12)
// Buy cards: the game + the mods this mod is built on (deps.js: mod.info Require closure; with no Require and many unknown names, the
// sibling mod its title names, kept only when it really holds them) + the mod, each mounted with its paks (mount.js). A Require that is not
// installed skips check 1 with one plain line; many unknown names and no base found = one row, never hundreds of false ones.
// Many rows of one kind are one row: more than 8 unit rows = one "units" row with one fix; check 3 is always one row however many lines.
// GoH: no bot.data.lua (GHMIS-66): 1-4 and 7 are skipped with that reason; 5 and 6 run on the mod's own preset files, as info (AS2 rules,
// milint gohSoft). Fixes: edits on the original bytes (latin1 round trip); an inserted line takes the line ending of its neighbours; written
// only into <mod>/resource/<rel> after bots/lib checkWrite, the bytes before kept for Undo (undo.js, or the frame's lib.undo).
// Every refusal is {code, args} (the page words it); plain preview sentences {k, p} come first, the exact hunks after.
// Author: Imperator_Aug (ARSENAL, ia-f98cea06)
'use strict';
const fs = require('fs'), path = require('path');
const lib = require('../../lib');
const T = path.join(__dirname, '..', '..', '..', '..', '..');   // tools/
const { parse: luaParse } = require(path.join(T, 'botrecipe', 'luatable'));
const { cardNames } = require(path.join(T, 'botrecipe', 'botcheck'));
const botsub = require(path.join(T, 'botrecipe', 'botsub'));
const { luaPass, stripLua } = require(path.join(T, 'keylint', 'chkkey'));
const tidy = require(path.join(T, 'fix', 'lib', 'tidy'));
const S = require('./scan'), M = require('./mount'), DEP = require('./deps'), UNDO = require('./undo');

const BOTDATA = 'script/multiplayer/bot.data.lua', GAMES = 'set/multiplayer/games/';
const AS2_FILES = ['bots_generic.inc', 'presets_competitive.inc', 'presets_all.inc', 'presets_user.inc', 'presets_test.inc'];
const READ_KEYS = ['priority', 'class', 'unit', 'min_income', 'min_team'];   // stock bot.lua 3.262 reads these (botcheck header)
const NEED_KEYS = ['priority', 'class', 'unit'];
const DEAD = ['period', 'AttackBaseTime'];
const CARD = /^[A-Za-z0-9_().-]+$/;
const GROUP = 8, MANY = { n: 15, part: 0.25 }, LINES = 50;

const bad = (code, args, status) => Object.assign(new Error(code), { code, args: args || {}, status: status || 400 });
const modPath = (mod, rel) => path.join(mod, 'resource', ...rel.split('/'));
const eolOf = t => (/\r\n/.test(t) ? '\r\n' : '\n');
// the line ending of the line that holds offset i (else the one before it): a new line is written like its neighbours
function eolAt(t, i) { let e = t.indexOf('\n', i); if (e < 0) e = t.lastIndexOf('\n', i - 1); if (e < 0) return eolOf(t); return t[e - 1] === '\r' ? '\r\n' : '\n'; }
const withEol = (s, E) => s.replace(/\r?\n/g, E);
const read = p => fs.readFileSync(p, 'latin1');

// ---- the buy cards the game sees with this mod on: {set, nfs, list, names} from a mount view
// kept per view object (mount.view gives the same object while nothing it reads moved): one route asks several times, nobody changes it
const FROM = new WeakMap();
function cardsFrom(V) {
  const had = V && typeof V === 'object' ? FROM.get(V) : null;
  if (had) return had;
  const res = cardsFrom0(V);
  if (V && typeof V === 'object' && !V.error) FROM.set(V, res);
  return res;
}
function cardsFrom0(V) {
  const set = new Set(), nfs = new Set(), list = [], seen = new Set();
  for (const f of V.sets) {
    const am = /_([a-z0-9]+)\.(?:set|inc)$/i.exec(f.file);
    for (const n of cardNames([f.text])) {
      set.add(n);
      const side = /\(([^()]+)\)$/.exec(n), army = side ? side[1] : am ? am[1].toLowerCase() : '';
      if (!seen.has(n)) { seen.add(n); list.push({ unit: n, army, src: f.src, dep: f.dep }); }
    }
    // {not_for_sale} (milint): per card block; a later block with no children keeps the mark, one with children sets it again
    const tree = S.sdlTree(f.text);
    for (const u of tree.kids) if (S.lc(u.name) === 'units') for (const e of u.kids) if (e.name) {
      if (S.kid(e, 'not_for_sale')) nfs.add(e.name); else if (e.kids.length) nfs.delete(e.name);
    }
  }
  // by army (the stages card's rule: s(army), the file's _army suffix, '*' = any army): which list a card can be bought from
  let by = null;
  try { const m = new Map(); for (const f of V.sets) m.set(f.rel.toLowerCase(), { text: f.text, src: f.src }); by = require('../stages/cards').indexSets(m); } catch (e) { /* no index: no army check */ }
  return { set, nfs, list, lng: V.lng, by, armyNames: V.armyNames || {} };
}
const nameIn = (lng, u) => { const k = String(u).toLowerCase(), t = lng && (lng.get('desc/entity/' + k) || lng.get('desc/squad/' + k)); return t ? t.replace(/<[^<>]*>/g, '').replace(/\s+/g, ' ').trim() : ''; };
// {cards, base} or {why, p}: deps by Require; with none and many unknown names (wanted), the sibling mod the title names, when it holds them
function setup(ctx, mod, wanted) {
  const G = lib.gameOf(ctx);
  if (!G.dir) return { why: 'nocards' };
  const D = DEP.depsOf(ctx, mod);
  if (D.missing.length) return { why: 'depmissing', p: { names: D.missing.join(', ') } };
  let c = cardsFrom(M.view(ctx, mod, D.list)), base = D.list.length ? { how: 'require', title: D.list.map(d => d.title).join(', '), folder: D.list.map(d => path.basename(d.dir)).join(', ') } : null;
  const unknown = (wanted || []).filter(n => !c.set.has(n));
  if (!D.list.length && wanted && unknown.length >= MANY.n && unknown.length >= MANY.part * wanted.length) {
    for (const cand of DEP.guess(ctx, mod, D.info).slice(0, 2)) {
      const c2 = cardsFrom(M.view(ctx, mod, [cand])), found = unknown.filter(n => c2.set.has(n)).length;
      if (found >= 0.8 * unknown.length) { c = c2; base = { how: 'guess', title: cand.title, folder: path.basename(cand.dir) }; D.list = [cand]; break; }
    }
    if (!base) return { cards: c, deps: [], nobase: { n: unknown.length, total: wanted.length, names: unknown } };
  }
  return { cards: c, base, deps: D.list };
}

// the sibling mods setup() will mount to look for a base, [] when it will not look (same rule as setup): a route that can wait scans
// them first (stages/cards warm), so setup's mounts go by listing
function guessed(ctx, mod, wanted, D) {
  D = D || DEP.depsOf(ctx, mod);
  if (!lib.gameOf(ctx).dir || D.missing.length || D.list.length || !wanted) return [];
  const c = cardsFrom(M.view(ctx, mod, D.list)), unknown = wanted.filter(n => !c.set.has(n));
  return unknown.length >= MANY.n && unknown.length >= MANY.part * wanted.length ? DEP.guess(ctx, mod, D.info).slice(0, 2) : [];
}

// ---- 3: the cuts tidy.stripBotKeys makes, as edits (same rules; the result is checked equal to stripBotKeys before use)
function deadEdits(t) {
  const s = stripLua(t), edits = [], cant = [], VALUE = /^(?:"[^"\n]*"|'[^'\n]*'|-?[\d.]+|[A-Za-z_][\w.]*)/;
  const re = /(?<![\w.])(period|AttackBaseTime)\s*=(?!=)/g;
  let m, dp = 0, dpAt = 0;   // brace depth counted on from the last match (the same count tidy makes from the start each time)
  while ((m = re.exec(s))) {
    const at = m.index, line = S.lineOf(s, at), ls = S.lineStart(s, at), le = S.lineEnd(s, at);
    for (; dpAt < at; dpAt++) { const c = s.charCodeAt(dpAt); if (c === 123) dp++; else if (c === 125) dp--; }
    const depth = dp;
    if (depth === 0) {
      if (s.slice(ls, at).trim() !== '' || /[;{}]/.test(s.slice(at, le))) { cant.push(line); continue; }
      edits.push({ a: ls, b: le < t.length ? le + 1 : le, t: '' }); continue;
    }
    let p = at + m[0].length; while (s[p] === ' ' || s[p] === '\t') p++;
    const v = VALUE.exec(s.slice(p, le));
    if (!v) { cant.push(line); continue; }
    let q = p + v[0].length; while (s[q] === ' ' || s[q] === '\t') q++;
    if (s[q] === ',' || s[q] === ';') { q++; while (s[q] === ' ' || s[q] === '\t') q++; edits.push({ a: at, b: q, t: '' }); continue; }
    if (s[q] === '}') {
      let b = at; while (b > ls && (s[b - 1] === ' ' || s[b - 1] === '\t')) b--;
      if (s[b - 1] === ',' || s[b - 1] === ';') { edits.push({ a: b - 1, b: q, t: '' }); continue; }
      if (s[b - 1] === '{') { edits.push({ a: at, b: q, t: '' }); continue; }
    }
    cant.push(line);
  }
  const keep = [], pos = { v: 0 };
  for (const e of edits.sort((x, y) => x.a - y.a)) { if (e.a < pos.v) continue; keep.push(e); pos.v = e.b; }
  return { edits: keep, cant };
}

// ---- bot.data.lua: checks 1-4
function evalNum(txt) { try { const v = luaParse('X = ' + txt).globals.X; return typeof v === 'number' ? v : null; } catch (e) { return null; } }
function botData(ctx, mod, e, add, skipped, scripts, info) {
  const t = e.text, s = stripLua(t), file = BOTDATA, from = e.from;
  let parsedOk = true; try { luaParse(t); } catch (x) { parsedOk = false; }
  const gate = nt => { if (parsedOk) { try { luaParse(nt); } catch (x) { throw bad('unreadable', { m: x.message }, 409); } } };
  // a fix: mk(value) -> edits; plain(value) -> [{k, p}] the sentences of what changes in a match
  const fixOf = (mk, plain) => (value) => { const edits = mk(value); if (!edits.length) throw bad('nothingLeft', {}, 409); const nt = S.apply(t, edits); gate(nt); return { rel: file, from, text: t, edits, nt, plain: plain(value) }; };
  const at = (code, lim, check, line, extra) => Object.assign({ check, code, lim, file, from, line }, extra);

  // 3 first: it needs no parse. Always one row, whatever the count (9287 lines in a real mod [V])
  const dead = luaPass('resource/' + file, t).filter(f => f.code === 'BOT_DATA_UNUSED_KEY');
  if (dead.length) {
    const cnt = {}; dead.forEach(f => { const k = (/^"(\w+)"/.exec(f.msg) || [])[1] || '?'; cnt[k] = (cnt[k] || 0) + 1; });
    const readers = [];
    for (const sc of scripts) { const ss = stripLua(sc.text); for (const k of DEAD) if (cnt[k] && new RegExp('(?<![\\w])' + k + '(?![\\w])').test(ss)) readers.push({ key: k, file: 'resource/' + sc.rel }); }
    const de = deadEdits(t);
    const p = { n: dead.length, list: Object.keys(cnt).map(k => k + ' x' + cnt[k]).join(', ') };
    const row = at('BOT_DATA_UNUSED_KEY', 'AI-15 MIS-10', 3, dead[0].line, { id: 'dead', msg: 'dead', p, lines: dead.slice(0, LINES).map(f => f.line), nLines: dead.length, fixes: [] });
    if (readers.length) row.refused = { why: 'reads', p: { key: readers[0].key, file: readers[0].file } };
    else if (!de.edits.length) row.refused = { why: 'shape', p: { lines: de.cant.slice(0, 20).join(', ') || '?' } };
    else {
      row.fixes.push({ how: 'dead', p: { n: de.edits.length } });
      // at fix time (tidy is slow on a big list): the cuts must give exactly what fix botkeys gives, and pass its gate
      row._fix = { dead: fixOf(() => {
        const nt = S.apply(t, de.edits);
        if (nt !== tidy.stripBotKeys(t).text) throw bad('refusedCuts', {}, 409);
        const why = tidy.check({ kind: 'botkeys', key: 'resource/' + file, before: Buffer.from(t, 'latin1'), after: Buffer.from(nt, 'latin1') });
        if (why) throw bad('refusedTidy', { m: why }, 409);
        return de.edits; }, () => [{ k: 'dead', p: { n: de.edits.length } }]) };
      if (de.cant.length) row.p.cant = de.cant.slice(0, 20).join(', ') + (de.cant.length > 20 ? ', ...' : '');
    }
    add(row);
  }

  // the Purchases table: the last top-level Purchases = { ... } (Lua keeps the last)
  let pa = -1;
  for (const m of s.matchAll(/(^|[^\w.])Purchases[ \t\r\n]*=[ \t\r\n]*\{/g)) {
    const i = m.index + m[0].length - 1, d = (s.slice(0, i).match(/\{/g) || []).length - (s.slice(0, i).match(/\}/g) || []).length;
    if (d === 0) pa = i;
  }
  const noShape = why => { skipped.push({ check: 1, why }, { check: 2, why }, { check: 4, why }); };
  // the mod's own bot.lua that never names Purchases buys its own way (RobZ BotConfig): the stock list rules do not apply
  const own0 = scripts.find(x => x.rel.toLowerCase() === 'script/multiplayer/bot.lua');
  if (own0 && !/(?<![\w])Purchases(?![\w])/.test(stripLua(own0.text))) { noShape('ownbot'); return; }
  if (pa < 0) { add(at('BOT_STAGE_SHAPE', 'MIS-84', 4, 0, { id: 'nopurchases', msg: 'noPurchases', p: {}, fixes: [] })); noShape('nolist'); return; }
  let P;
  try { P = S.luaTable(s, pa); } catch (x) { add(at('BOT_LUA_PARSE', 'MIS-84', 4, S.lineOf(t, x.at || pa), { id: 'parse', msg: 'parse', p: { m: x.message }, fixes: [] })); noShape('parse'); return; }

  // vanilla facts (botcheck): entry keys stock bot.lua reads; the mod's own bot.lua may read more
  const readK = new Set(READ_KEYS);
  if (e.vanilla) try {
    const V = luaParse(e.vanilla).globals.Purchases;
    for (const st of (V && V.arr) || []) { const U = st && st.hash && st.hash.Units; if (!U || !U.hash) continue; for (const l of Object.values(U.hash)) for (const en of (l && l.arr) || []) if (en && en.hash) Object.keys(en.hash).forEach(k => readK.add(k)); }
  } catch (x) { /* vanilla unreadable: the fixed list */ }
  const own = scripts.find(x => x.rel.toLowerCase() === 'script/multiplayer/bot.lua'), ownS = own ? stripLua(own.text) : '';
  const ownReads = k => !!ownS && new RegExp('(?<![\\w])' + k + '(?![\\w])').test(ownS);

  const named = P.fields.filter(f => f.kind !== 'pos');
  if (named.length) add(at('BOT_STAGE_SHAPE', 'MIS-84', 4, S.lineOf(t, named[0].start), { id: 'named', msg: 'named', p: { keys: named.map(f => f.kind === 'br' ? S.brKey(t, f) : f.key).join(', ') }, fixes: [] }));
  const stages = P.fields.filter(f => f.kind === 'pos');
  if (!stages.length) add(at('BOT_STAGE_SHAPE', 'MIS-84', 4, S.lineOf(t, pa), { id: 'empty', msg: 'empty', p: {}, fixes: [] }));
  const used = [], units = new Map(), keys = new Map(), need = new Map(), st = [];
  let stay = false, lastRepeat = null;
  stages.forEach((f, i) => {
    const n = i + 1, line = S.lineOf(t, f.start);
    if (!f.sub) { add(at('BOT_STAGE_SHAPE', 'MIS-84', 4, line, { id: 'stage|' + n, msg: 'stageNotTable', p: { stage: n }, fixes: [] })); st.push(null); return; }
    const by = {}; f.sub.fields.forEach(x => { if (x.kind === 'name') by[x.key] = x; });
    const R = by.Repeat, rv = R ? evalNum(t.slice(R.vs, R.ve)) : null;
    lastRepeat = R || null;
    if (rv == null || rv < 0 || rv !== Math.floor(rv)) add(at('BOT_STAGE_SHAPE', 'MIS-84', 4, R ? S.lineOf(t, R.start) : line, { id: 'repeat|' + n, msg: 'repeat', p: { stage: n, v: R ? t.slice(R.vs, R.ve) : '-' }, fixes: [] }));
    else if (rv === 0) stay = true;
    const U = by.Units;
    if (!U || !U.sub) { add(at('BOT_STAGE_SHAPE', 'MIS-84', 4, U ? S.lineOf(t, U.start) : line, { id: 'units|' + n, msg: 'units', p: { stage: n }, fixes: [] })); st.push(null); return; }
    const pos = U.sub.fields.filter(x => x.kind !== 'br');
    if (pos.length) add(at('BOT_STAGE_SHAPE', 'MIS-84', 4, S.lineOf(t, pos[0].start), { id: 'unitsarr|' + n, msg: 'unitsArr', p: { stage: n, n: pos.length }, fixes: [] }));
    const armies = new Map();
    for (const af of U.sub.fields) {
      if (af.kind !== 'br') continue;
      const a = S.brKey(t, af); armies.set(a, af); if (!used.includes(a)) used.push(a);
      if (!af.sub) continue;
      for (const en of af.sub.fields) {
        if (en.kind !== 'pos' || !en.sub) continue;
        const ek = {}; en.sub.fields.forEach(x => { if (x.kind === 'name') ek[x.key] = x; });
        const u = ek.unit;
        if (u && /^"[^"]*"$/.test(t.slice(u.vs, u.ve))) {
          const name = t.slice(u.vs + 1, u.ve - 1);
          if (!units.has(name)) units.set(name, []);
          units.get(name).push({ stage: n, army: a, en, list: af.sub, val: u });
        }
        for (const [k, x] of Object.entries(ek)) if (!readK.has(k) && !DEAD.includes(k) && !ownReads(k)) { if (!keys.has(k)) keys.set(k, []); keys.get(k).push({ x, en }); }
        for (const k of NEED_KEYS) if (!ek[k] && !ownReads(k)) { if (!need.has(k)) need.set(k, []); need.get(k).push(S.lineOf(t, en.start)); }
      }
    }
    st.push({ n, f, U, armies, line });
  });
  if (stages.length && !stay) {
    const row = at('BOT_NO_STAY_STAGE', 'MIS-84', 4, lastRepeat ? S.lineOf(t, lastRepeat.start) : S.lineOf(t, pa), { id: 'nostay', msg: 'noStay', p: { n: stages.length }, fixes: [] });
    if (lastRepeat && stages[stages.length - 1].sub && stages[stages.length - 1].sub.fields.includes(lastRepeat)) {
      row.fixes.push({ how: 'stay', p: { stage: stages.length } });
      row._fix = { stay: fixOf(() => [{ a: lastRepeat.vs, b: lastRepeat.ve, t: '0' }], () => [{ k: 'stay', p: { stage: stages.length } }]) };
    }
    add(row);
  }

  // 1: unit names with no card (or a not_for_sale card)
  let cards1 = () => false;   // can army a buy card v (the replace fix of 1c)
  const C = setup(ctx, mod, [...units.keys()]);
  // 4: one unit listed more than once in the same army list of one stage. The game's own list never does that (AS2 gamelogic.pak
  // script/multiplayer/bot.data.lua: 8 stages, 48 lists, 818 rows, 0 repeats [V]), so a repeat is a slip, not a way to weight a purchase:
  // priority is the weight. What a repeat does in a match is [I] (most likely bought more often). Fix: the first line stays, the rest go.
  {
    const nm0 = u => C.cards && C.cards.lng ? nameIn(C.cards.lng, u) : '';
    for (const [name, occ] of units) {
      const by = new Map(); occ.forEach(o => { const k = o.stage + '|' + o.army; if (!by.has(k)) by.set(k, []); by.get(k).push(o); });
      for (const [k, os] of by) {
        if (os.length < 2) continue;
        const extra = os.slice(1), lines = os.map(o => S.lineOf(t, o.val.start)), p = { unit: name, name: nm0(name), stage: os[0].stage, army: os[0].army, n: os.length };
        add(at('BOT_UNIT_TWICE', 'MIS-84', 4, lines[0], { id: 'dup|' + k + '|' + name, msg: 'dup', p, lines, fixes: [{ how: 'dedupe', p: { n: extra.length } }],
          _fix: { dedupe: fixOf(() => extra.map(o => S.cutField(t, s, o.en)), () => [{ k: 'dedupe', p: { stage: p.stage, army: p.army, unit: name, name: p.name, n: extra.length } }]) } }));
      }
    }
  }
  if (C.why) skipped.push({ check: 1, why: C.why, p: C.p });
  else {
    info.base = C.base || null; info.armies = C.cards.armyNames || {};
    const BY = C.cards.by, inA = (a, v) => !!BY && ((BY.get(String(a).toLowerCase()) || new Set()).has(v) || (BY.get('*') || new Set()).has(v));
    cards1 = (v, a) => C.cards.set.has(v) && !C.cards.nfs.has(v) && (!BY || inA(a, v));
    const lng = C.cards.lng, nm = u => nameIn(lng, u);
    const cut = occ => occ.map(o => S.cutField(t, s, o.en));
    if (C.nobase) {
      add(at('BOT_UNIT_NO_CARD', 'MIS-32', 1, 0, { id: 'nobase', msg: 'noBase', p: { n: C.nobase.n, total: C.nobase.total }, names: C.nobase.names.slice(0, 300), fixes: [] }));
    } else {
      const bad1 = [...units].filter(([name]) => !C.cards.set.has(name) || C.cards.nfs.has(name));
      if (bad1.length > GROUP) {
        const occ = bad1.flatMap(([, o]) => o), nfs = bad1.filter(([n]) => C.cards.set.has(n)).length;
        add(at('BOT_UNIT_NO_CARD', 'MIS-32', 1, S.lineOf(t, occ[0].val.start), { id: 'units', msg: 'unitsMany', p: { n: bad1.length, places: occ.length, nfs }, names: bad1.map(([n]) => n).slice(0, 300),
          lines: occ.slice(0, LINES).map(o => S.lineOf(t, o.val.start)), nLines: occ.length, fixes: [{ how: 'removeAll', p: { n: occ.length } }],
          _fix: { removeAll: fixOf(() => cut(occ), () => [{ k: 'removeAll', p: { n: bad1.length, places: occ.length } }]) } }));
      } else for (const [name, occ] of bad1) {
        const lines = occ.map(o => S.lineOf(t, o.val.start)), isNfs = C.cards.set.has(name);
        add(at('BOT_UNIT_NO_CARD', 'MIS-32', 1, lines[0], { id: 'unit|' + name, msg: isNfs ? 'unitNfs' : 'unit', p: { unit: name, name: nm(name), n: occ.length, armies: [...new Set(occ.map(o => o.army))].join(', ') }, lines,
          fixes: [{ how: 'remove', p: { n: occ.length } }, { how: 'replace', p: { unit: name } }],
          _fix: {
            remove: fixOf(() => cut(occ), () => occ.map(o => ({ k: 'remove', p: { stage: o.stage, army: o.army, unit: name, name: nm(name) } }))),
            replace: fixOf(v => {
              v = String(v || '').trim();
              if (!CARD.test(v)) throw bad('badCard', { v });
              if (!C.cards.set.has(v) || C.cards.nfs.has(v)) throw bad('noCard', { v });
              return occ.map(o => ({ a: o.val.vs + 1, b: o.val.ve - 1, t: v }));
            }, v => { v = String(v || '').trim(); const n2 = nm(v); return occ.map(o => ({ k: 'replace', p: { stage: o.stage, army: o.army, unit: name, name: nm(name), now: n2 || v } })); }),
          } }));
      }
      mixCheck(C.cards, nm, C.cards.list);
    }
  }

  // 1b: a unit in the list of an army that has no buy card for it (pz6e, a German tank, in the Commonwealth list): that bot never gets
  // it (MIS-32). Only when the unit's card belongs to another army this list serves, so the fix knows where it goes: move it into that
  // army's list of the same stage (removed only, when that stage has no such list or already holds it), or remove it
  // 1c: a unit whose only buy card sits in a helper file (vehicles_x.set: hero cards, no price) or in an army this list does not serve and
  // that this army has no card for: no bot of this list can ever buy it. Same fixes as check 1 (remove, or put a buyable unit in its place)
  function mixCheck(cards, nm, list) {
    const by = cards.by; if (!by) return;
    const any = by.get('*') || new Set();
    const own = (a, u) => (by.get(String(a).toLowerCase()) || new Set()).has(u) || any.has(u);
    const mix = [], nobuy = [];
    const fileOf = u => { const c = (list || []).find(x => x.unit === u); return c ? String(c.army || '') : ''; };
    for (const [name, occ] of units) {
      if (!cards.set.has(name) || cards.nfs.has(name)) continue;   // check 1 has it
      if (any.has(name)) continue;
      const homes = used.filter(a => (by.get(String(a).toLowerCase()) || new Set()).has(name));
      const g = new Map();
      for (const o of occ) if (!own(o.army, name)) { if (!g.has(o.army)) g.set(o.army, []); g.get(o.army).push(o); }
      for (const [a, oo] of g) { if (homes.length) mix.push({ name, army: a, occ: oo, home: homes[0] }); else { const card = fileOf(name); let helper = false, ua = null;
        // a card with no real army (hero, off-map support): the frame's answer first (lib.unitArmy: the card's own s(<army>)), the file name only when the frame cannot say
        try { ua = typeof lib.unitArmy === 'function' ? lib.unitArmy(ctx, mod, name) : null; } catch (e) { ua = null; }
        if (ua && ua.card === true) helper = !ua.armies.length;
        else { try { helper = !!card && require('../stages/cards').pseudo(card); } catch (e) { /* no index */ } } nobuy.push({ name, army: a, occ: oo, card, helper }); } }
    }
    noBuyRows(nobuy, nm);
    if (!mix.length) return;
    // edits of one move: the cut, and the row added at the end of the home army's list of that stage
    const holds = (L, u) => L.fields.some(f => f.sub && f.sub.fields.some(x => x.kind === 'name' && x.key === 'unit' && t.slice(x.vs, x.ve) === '"' + u + '"'));
    const moveOf = (o, home, comma) => {
      const x = st[o.stage - 1], hf = x && x.armies.get(home), L = hf && hf.sub, out = [S.cutField(t, s, o.en)];
      if (!L || holds(L, o.name || '')) return { edits: out, plain: { k: 'remove', p: { stage: o.stage, army: o.army, unit: o.unitName, name: nm(o.unitName) } } };
      const last = L.fields[L.fields.length - 1], row = t.slice(o.en.start, o.en.ve);
      if (last && last.sep == null && !comma.has(L)) { out.push({ a: last.ve, b: last.ve, t: ',' }); comma.add(L); }
      const f0 = L.fields[0], ind = f0 && s.slice(S.lineStart(s, f0.start), f0.start).trim() === '' ? S.indentAt(t, f0.start) : S.indentAt(t, hf.start) + '\t';
      const ls = S.lineStart(s, L.b);
      if (s.slice(ls, L.b).trim() === '') { const E = eolAt(t, ls); out.push({ a: ls, b: ls, t: ind + row + ',' + E }); }
      else { const E = eolAt(t, L.b); out.push({ a: L.b, b: L.b, t: E + ind + row + ',' + E + S.indentAt(t, hf.start) }); }
      return { edits: out, plain: { k: 'move', p: { stage: o.stage, army: o.army, unit: o.unitName, name: nm(o.unitName), to: home } } };
    };
    const movesOf = list => { const comma = new Set(), edits = [], plain = []; for (const m of list) for (const o of m.occ) { const r = moveOf(Object.assign({ name: m.name, unitName: m.name }, o), m.home, comma); edits.push(...r.edits); plain.push(r.plain); } return { edits, plain }; };
    const cutsOf = list => list.flatMap(m => m.occ.map(o => S.cutField(t, s, o.en)));
    const cutPlain = list => list.flatMap(m => m.occ.map(o => ({ k: 'remove', p: { stage: o.stage, army: o.army, unit: m.name, name: nm(m.name) } })));
    if (mix.length > GROUP) {
      const occ = mix.flatMap(m => m.occ);
      add(at('BOT_UNIT_ARMY', 'MIS-32', 1, S.lineOf(t, occ[0].val.start), { id: 'mixes', msg: 'armyMixMany', p: { n: mix.length, places: occ.length },
        names: mix.map(m => m.name + ' (' + m.army + ')').slice(0, 300), lines: occ.slice(0, LINES).map(o => S.lineOf(t, o.val.start)), nLines: occ.length,
        fixes: [{ how: 'moveAll', p: { n: occ.length } }, { how: 'removeAll', p: { n: occ.length } }],
        _fix: { moveAll: fixOf(() => movesOf(mix).edits, () => movesOf(mix).plain), removeAll: fixOf(() => cutsOf(mix), () => cutPlain(mix)) } }));
      return;
    }
    for (const m of mix) {
      const lines = m.occ.map(o => S.lineOf(t, o.val.start));
      add(at('BOT_UNIT_ARMY', 'MIS-32', 1, lines[0], { id: 'mix|' + m.name + '|' + m.army, msg: 'armyMix', p: { unit: m.name, name: nm(m.name), army: m.army, home: m.home, n: m.occ.length }, lines,
        fixes: [{ how: 'move', p: { to: m.home, n: m.occ.length } }, { how: 'remove', p: { n: m.occ.length } }],
        _fix: { move: fixOf(() => movesOf([m]).edits, () => movesOf([m]).plain), remove: fixOf(() => cutsOf([m]), () => cutPlain([m])) } }));
    }
  }

  // rows of 1c: one per unit and army (more than 8 = one row with one fix)
  function noBuyRows(list, nm) {
    if (!list.length) return;
    const cutsOf = l => l.flatMap(m => m.occ.map(o => S.cutField(t, s, o.en)));
    const cutPlain = l => l.flatMap(m => m.occ.map(o => ({ k: 'remove', p: { stage: o.stage, army: o.army, unit: m.name, name: nm(m.name) } })));
    if (list.length > GROUP) {
      const occ = list.flatMap(m => m.occ);
      add(at('BOT_UNIT_NO_ARMY_CARD', 'MIS-32', 1, S.lineOf(t, occ[0].val.start), { id: 'nobuys', msg: 'noBuyMany', p: { n: list.length, places: occ.length },
        names: list.map(m => m.name + ' (' + m.army + ')').slice(0, 300), lines: occ.slice(0, LINES).map(o => S.lineOf(t, o.val.start)), nLines: occ.length,
        fixes: [{ how: 'removeAll', p: { n: occ.length } }], _fix: { removeAll: fixOf(() => cutsOf(list), () => cutPlain(list)) } }));
      return;
    }
    for (const m of list) {
      const lines = m.occ.map(o => S.lineOf(t, o.val.start));
      add(at('BOT_UNIT_NO_ARMY_CARD', 'MIS-32', 1, lines[0], { id: 'nobuy|' + m.name + '|' + m.army, msg: 'noBuy', p: { unit: m.name, name: nm(m.name), army: m.army, n: m.occ.length, card: m.card || '-', helper: m.helper }, lines,
        fixes: [{ how: 'remove', p: { n: m.occ.length } }, { how: 'replace', p: { unit: m.name } }],
        _fix: {
          remove: fixOf(() => cutsOf([m]), () => cutPlain([m])),
          replace: fixOf(v => {
            v = String(v || '').trim();
            if (!CARD.test(v)) throw bad('badCard', { v });
            if (!cards1(v, m.army)) throw bad('noArmyCard', { v, army: m.army });
            return m.occ.map(o => ({ a: o.val.vs + 1, b: o.val.ve - 1, t: v }));
          }, v => { v = String(v || '').trim(); const n2 = nm(v); return m.occ.map(o => ({ k: 'replace', p: { stage: o.stage, army: o.army, unit: m.name, name: nm(m.name), now: n2 || v } })); }),
        } }));
    }
  }
  // 2: an army some stage serves, missing from another stage
  for (const x of st) {
    if (!x) continue;
    for (const a of used) {
      if (x.armies.has(a)) continue;
      let src = null;
      for (let d = 1; d < st.length && !src; d++) for (const j of [x.n - 1 - d, x.n - 1 + d]) { const y = st[j]; if (y && y.armies.has(a) && y.armies.get(a).sub) { src = y; break; } }
      const row = at('MIS_BOT_ARMY_MISSING', 'MIS-09', 2, x.line, { id: 'army|' + x.n + '|' + a, msg: 'army', p: { army: a, stage: x.n }, fixes: [] });
      // insert a block before the closing brace of this stage's Units: every line ends like the lines around it
      const ins = block => {
        const U = x.U.sub, last = U.fields[U.fields.length - 1], out = [];
        if (last && last.sep == null) out.push({ a: last.ve, b: last.ve, t: ',' });
        const ls = S.lineStart(s, U.b);
        if (s.slice(ls, U.b).trim() === '') { const E = eolAt(t, ls); out.push({ a: ls, b: ls, t: withEol(block, E) + E }); }
        else { const E = eolAt(t, U.b); out.push({ a: U.b, b: U.b, t: E + withEol(block, E) + E + S.indentAt(t, x.U.start) }); }
        return out;
      };
      const ind = () => { const f0 = x.U.sub.fields[0]; return f0 && s.slice(S.lineStart(s, f0.start), f0.start).trim() === '' ? S.indentAt(t, f0.start) : S.indentAt(t, x.U.start) + '\t'; };
      if (src) {
        const af = src.armies.get(a), ls = S.lineStart(s, af.start), alone = s.slice(ls, af.start).trim() === '';
        const txt = (alone ? t.slice(ls, af.end) : ind() + t.slice(af.start, af.end)).replace(/[ \t]+$/, '') + (af.sep == null ? ',' : '');
        const nU = af.sub ? af.sub.fields.filter(f => f.kind === 'pos').length : 0;
        row.fixes.push({ how: 'copy', p: { from: src.n, army: a } });
        (row._fix = row._fix || {}).copy = fixOf(() => ins(txt), () => [{ k: 'copy', p: { stage: x.n, army: a, from: src.n, n: nU } }]);
      }
      row.fixes.push({ how: 'empty', p: { army: a } });
      (row._fix = row._fix || {}).empty = fixOf(() => ins(ind() + '["' + a + '"] = {},'), () => [{ k: 'empty', p: { stage: x.n, army: a } }]);
      add(row);
    }
  }

  // 4: entry keys bot.lua never reads (fix: remove them), keys it needs that are missing (report)
  for (const [k, occ] of keys) {
    const lines = occ.map(o => S.lineOf(t, o.x.start));
    add(at('BOT_ENTRY_KEY', 'MIS-80', 4, lines[0], { id: 'key|' + k, msg: 'key', p: { key: k, n: occ.length }, lines: lines.slice(0, LINES), nLines: lines.length, fixes: [{ how: 'key', p: { key: k, n: occ.length } }],
      _fix: { key: fixOf(() => occ.map(o => S.cutField(t, s, o.x)), () => [{ k: 'key', p: { key: k, n: occ.length } }]) } }));
  }
  for (const [k, lines] of need) add(at('BOT_ENTRY_KEY', 'MIS-80', 4, lines[0], { id: 'need|' + k, msg: 'need', p: { key: k, n: lines.length }, lines: lines.slice(0, LINES), nLines: lines.length, fixes: [] }));
}

// ---- presets: checks 5 and 6 (SDL text of one file)
function presets(ctx, mod, rel, from, t, goh, vanText, add) {
  const tree = S.sdlTree(t), file = rel, base = rel.split('/').pop().toLowerCase(), soft = goh ? 'info' : 'warn';
  const van = vanText ? S.sdlTree(vanText) : null;
  const entries = [], each = (n, f) => { f(n); n.kids.forEach(k => each(k, f)); };
  if (base === 'bots_generic.inc') tree.kids.forEach(k => entries.push({ e: k, in: 'bots' }));
  each(tree, n => { const nm = S.lc(n.name); if (nm === 'teams' || nm === 'bots') n.kids.forEach(k => entries.push({ e: k, in: nm })); });
  const cnt = {};
  const vanValue = (where, name) => {
    if (!van) return null;
    let v = null;
    const look = list => { for (const k of list) { if (S.lc(k.name) === S.lc(name) && S.kid(k, 'chargeFactors')) { v = S.str(S.kid(k, 'chargeFactors'), 'value'); if (v) return; } } };
    if (base === 'bots_generic.inc') look(van.kids);
    each(van, n => { if (!v && S.lc(n.name) === where) look(n.kids); });
    return v;
  };
  for (const { e, in: where } of entries) {
    const bf = S.kid(e, 'balancingFactorBonus');
    if (!bf) continue;
    const cf = S.kid(e, 'chargeFactors');
    if (cf && S.str(cf, 'value')) continue;
    const k = 'charge|' + rel + '|' + e.name; cnt[k] = (cnt[k] || 0) + 1;
    const row = { check: 5, code: 'MIS_BALANCE_NO_CHARGE', lim: 'MIS-02', sev: soft, file, from, line: e.line, id: k + '|' + cnt[k], msg: 'charge', p: { entry: e.name || '?', where }, fixes: [] };
    const val = vanValue(where, e.name) || '*=0', plain = () => [{ k: 'charge', p: { entry: e.name || '?', v: val } }];
    if (!cf) {
      const ind = S.indentAt(t, bf.a), E = eolAt(t, bf.b);
      const lead = t.slice(S.lineStart(t, bf.a), bf.a).trim() === '' ? ind : S.indentAt(t, e.a) + '\t';
      row.fixes.push({ how: 'charge', p: { v: val } });
      row._fix = { charge: () => { const edits = [{ a: bf.b + 1, b: bf.b + 1, t: E + lead + '{chargeFactors' + E + lead + '\t{value "' + val + '"}' + E + lead + '}' }]; return { rel, from, text: t, edits, nt: S.apply(t, edits), plain: plain() }; } };
    } else {
      const vk = S.kid(cf, 'value'), q = vk ? t.indexOf('"', vk.a) : -1;
      if (vk && q > 0 && q < vk.b && t.indexOf('"', q + 1) < vk.b) {
        const q2 = t.indexOf('"', q + 1);
        row.fixes.push({ how: 'charge', p: { v: val } });
        row._fix = { charge: () => { const edits = [{ a: q + 1, b: q2, t: val }]; return { rel, from, text: t, edits, nt: S.apply(t, edits), plain: plain() }; } };
      }
    }
    add(row);
  }
  let nb = 0;
  each(tree, n => {
    if (S.lc(n.name) !== 'common') return;
    const bg = S.kid(n, 'budgets');
    if (bg && bg.kids.length && !S.kid(bg, 'vehicle')) add({ check: 6, code: 'MIS_BUDGET_NO_VEHICLE', lim: 'MIS-05', sev: soft, file, from, line: bg.line, id: 'budget|' + rel + '|' + (++nb), msg: 'budget', p: { names: bg.kids.map(k => k.name).filter(Boolean).join(', ') }, fixes: [] });
  });
}

// ---- the whole check. -> {game, goh, from, rows (with _fix kept server side), skipped:[{check, why, p}], base}
function scan(ctx, mod) {
  const G = lib.gameOf(ctx), goh = G.kind === 'goh', rows = [], skipped = [], info = { base: null, armies: {} };
  const add = r => { r.sev = r.sev || 'warn'; if (goh && (r.check === 5 || r.check === 6)) r.soft = 'goh'; rows.push(r); };
  let from = null;
  // the mod's own Lua scripts (check 7, and who names a dead key / reads an entry key)
  const sd = modPath(mod, 'script'), scripts = M.walk(sd, /\.lua$/i).filter(r => !/(^|\/)bot\.data\.lua$/i.test(r)).map(r => ({ rel: 'script/' + r, text: read(path.join(sd, ...r.split('/'))) }));
  // GoH: no bot.data.lua (GHMIS-66): checks 2-4 and 7 do not apply; check 1 (unit names) runs async in run() against the GoH purchase lists (gohcards.js)
  if (goh) [2, 3, 4, 7].forEach(n => skipped.push({ check: n, why: 'goh' }));
  else {
    const e = lib.effective(ctx, mod, BOTDATA);
    from = e.from;
    if (e.text == null) [1, 2, 3, 4].forEach(n => skipped.push({ check: n, why: 'nolist' }));
    else botData(ctx, mod, e, add, skipped, scripts, info);
    for (const sc of scripts) {
      for (const f of botsub.check(sc.text)) {
        const ev = (/^(.*?) is subscribed/.exec(f.msg) || [])[1] || '?';
        add({ check: 7, code: f.code, lim: 'AI-22', file: sc.rel, from: 'mod', line: f.line, id: 'sub|' + sc.rel + '|' + f.line, msg: 'sub', p: { ev }, fixes: [] });
      }
      if (/^script\/multiplayer\/bot[^/]*\.lua$/i.test(sc.rel)) for (const f of luaPass('resource/' + sc.rel, sc.text)) if (f.code === 'WARN_BOT_API_UNKNOWN')
        add({ check: 7, code: f.code, lim: 'AI-12', file: sc.rel, from: 'mod', line: f.line, id: 'api|' + sc.rel + '|' + f.line, msg: 'api', p: { cmd: (/Commands:(\w+)/.exec(f.msg) || [])[1] || '?' }, fixes: [] });
    }
  }
  // presets: AS2 = the known files (mod copy, else the game's) + every other .set/.inc the mod has there; GoH = the mod's own files only
  const gd = modPath(mod, GAMES.replace(/\/$/, '')), seen = new Set(), list = [];
  if (!goh) for (const f of ((lib.FILES && lib.FILES.length) ? lib.FILES : AS2_FILES)) list.push(GAMES + f);
  for (const r of M.walk(gd, /\.(set|inc)$/i)) list.push(GAMES + r);
  for (const rel of list) {
    if (seen.has(rel.toLowerCase())) continue; seen.add(rel.toLowerCase());
    const e = lib.effective(ctx, mod, rel);
    if (e.text == null) continue;
    presets(ctx, mod, rel, e.from, e.text, goh, e.vanilla, add);
  }
  return { game: G.id, goh, from, rows, skipped, base: info.base, armies: info.armies };
}
const pub = r => { const o = Object.assign({}, r); delete o._fix; o.file = 'resource/' + r.file; return o; };
// AS2/AS64: sync, as before. GoH: a Promise (the card read is long and cached, gohcards.js); check 1 rows come first
function run(ctx, mod) {
  const r = scan(ctx, mod);
  const out = (rows, skipped, armies) => { const problems = rows.map(pub); return { ok: true, game: r.game, goh: r.goh, from: r.from, problems, skipped: skipped.sort((x, y) => x.check - y.check), base: r.base, armies: armies || {}, clean: !problems.length }; };
  if (!r.goh) return out(r.rows, r.skipped, r.armies);
  return require('./gohcards').check(ctx, mod).then(g => out(g.rows.concat(r.rows), g.skipped.concat(r.skipped), g.armies));
}
// a fix: preview (write false) or write. body {id, how, value, write} -> {plain: [{k, p}], hunks, more, file, copiesWholeFile, ...}
function fix(ctx, mod, body) {
  body = body || {};
  if (body.write) lib.checkWrite(ctx, mod);
  const r = scan(ctx, mod), row = r.rows.find(x => x.id === body.id);
  if (!row) throw bad('gone', {}, 409);
  const f = row._fix && row._fix[body.how];
  if (typeof f !== 'function') throw bad('noFix', {}, 400);
  const x = f(body.value);
  const all = S.hunks(x.text, x.edits), MAXH = 200;   // a mod with 9287 period keys ([V] valour): the page shows the first 200, counts the rest
  const out = { ok: true, id: row.id, how: body.how, rel: x.rel, file: 'resource/' + x.rel, from: x.from, copiesWholeFile: x.from === 'game', plain: x.plain || [], hunks: all.slice(0, MAXH), more: Math.max(0, all.length - MAXH) };
  if (!body.write) return out;
  lib.checkWrite(ctx, mod, [x.rel]);
  const p = modPath(mod, x.rel), tk = UNDO.pick().save(ctx, mod, x.rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, x.nt, 'latin1');
  tk.commit();
  out.written = true; out.target = p; out.undo = true;
  return out;
}
// Undo of the last write into one file: only the files this card writes
function undo(ctx, mod, body) {
  const rel = String((body && body.rel) || '');
  if (!(rel === BOTDATA || (rel.startsWith(GAMES) && /^[\w./ -]+\.(set|inc)$/i.test(rel) && !rel.split('/').includes('..')))) throw bad('badFile', { file: rel });
  lib.checkWrite(ctx, mod, [rel]);
  const r = UNDO.pick().restore(ctx, mod, rel);
  return Object.assign({ ok: true, rel, file: 'resource/' + rel }, r);
}
function cards(ctx, mod) {
  // GoH: every buy card of the game and the mod (pricecalc goh read, cached), with the in-game name from the .pot texts
  if (lib.gameOf(ctx).kind === 'goh') return require('./gohcards').cardList(ctx, mod).then(units => ({ ok: true, units, known: true, goh: true }), e => ({ ok: true, units: [], known: false, goh: true, why: e.why || 'nocards' }));
  let wanted = null;
  try { const e = lib.effective(ctx, mod, BOTDATA); if (e.text) wanted = [...new Set([...stripLua(e.text).matchAll(/unit\s*=\s*"/g)].map(m => (/^"([^"]*)"/.exec(e.text.slice(m.index + m[0].length - 1)) || [])[1]).filter(Boolean))]; } catch (x) { /* no list */ }
  const C = setup(ctx, mod, wanted);
  if (C.why) return { ok: true, units: [], known: false, why: C.why };
  const units = C.cards.list.filter(u => !C.cards.nfs.has(u.unit)).map(u => Object.assign({}, u, { name: nameIn(C.cards.lng, u.unit) }));
  return { ok: true, units, known: true, base: C.base || null };
}

module.exports = { run, fix, undo, cards, scan, deadEdits, eolAt, cardsFrom, setup, guessed, nameIn, BOTDATA };
