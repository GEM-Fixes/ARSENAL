// ext task: recipe checks. validate(recipe, census, opt) -> [problems]; coverage(recipe, census) -> {ok, missing, unknown, ...};
// steps(recipe, draft, vals) -> the flat step list the window walks. steps() is ES5 with no outside names: the page gets the same
// function through steps.toString() (client.js), so the server, the tests and the window agree on the step order.
// Contract: ../README.md. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-9ffb63b7)
'use strict';
const fs = require('fs'), path = require('path');

const VERBS = ['make', 'change', 'explore'];
const GAMES = ['as64', 'mowas2', 'goh'];
const NEEDS = ['mod', 'picked', 'game'];
const KINDS = ['text', 'id', 'number', 'choice', 'yesno', 'list', 'thing', 'file', 'handoff'];
const SOURCES = ['keep', 'exist', 'branch', 'file', 'ext'];
const BUILTIN_STEPS = ['mod', 'base', 'review', 'write', 'check', 'test', 'checklist', 'done', 'back'];
const WHEN_KEYS = ['$verb', '$game', '$copy'];   // reserved keys a `when` may test besides earlier questions
const CENSUS_DIR = path.join(__dirname, '..', 'census');

// ES5, self contained (no names from this module): it is shipped to the page as text.
function steps(recipe, draft, vals) {
  recipe = recipe || {}; draft = draft || {}; vals = vals || {};
  var out = [], ans = draft.answers || {}, kept = draft.kept || [], child = !!draft.parent, verbs = recipe.verbs || [];
  var verb = draft.verb || verbs[0] || 'make', needs = recipe.needs || [], i, j;
  // explore writes nothing: the draft's verb, or a recipe that only explores (a branch draft is saved as make) never gets the
  // built-in review, write, check or test steps
  var onlyEx = verbs.length > 0; for (i = 0; i < verbs.length; i++) if (verbs[i] !== 'explore') onlyEx = false;
  var explore = verb === 'explore' || onlyEx;
  function isArr(x) { return Object.prototype.toString.call(x) === '[object Array]'; }
  // reserved when keys: $verb (make | change | explore), $game (as64 | mowas2 | goh; a draft with no game is as64) and $copy: 'id' (or a list of ids) is true when
  // the recipe's values gave that id a value (what the copy has), {id, is} when that value is is (or one of a list)
  function val(k) { if (k === '$verb') return verb; if (k === '$game') return draft.game || 'as64'; var a = ans[k]; if (a && (a.src === 'value' || a.src === 'exist')) return a.value; return vals[k]; }
  function has(id) { var x = vals[id]; return x !== undefined && x !== null && x !== ''; }
  function copy(c) {
    if (typeof c === 'string') return has(c);
    if (isArr(c)) { for (var n = 0; n < c.length; n++) if (!has(c[n])) return false; return c.length > 0; }
    if (c && typeof c === 'object' && typeof c.id === 'string') return isArr(c.is) ? c.is.indexOf(vals[c.id]) >= 0 : vals[c.id] === c.is;
    return false;
  }
  function match(w) {
    if (!w) return true;
    for (var k in w) {
      if (!Object.prototype.hasOwnProperty.call(w, k)) continue;
      if (k === '$copy') { if (!copy(w[k])) return false; continue; }
      var want = w[k], v = val(k);
      if (isArr(want)) { if (want.indexOf(v) < 0) return false; } else if (v !== want) return false;
    }
    return true;
  }
  // indented (a follow-up): the question's when names the question of the same group just before it, or the lead of a run of
  // questions just before it that all name that lead. A gate is not a lead: a question every later question of the group names
  // (two or more, a "remove it?" first answer). indent: true always indents, indent: false never
  function names(x, k) { return !!(x && x.when && Object.prototype.hasOwnProperty.call(x.when, k)); }
  function gate(qs, p) { var k = qs[p].id, n = 0; for (var x = p + 1; x < qs.length; x++) { if (!names(qs[x], k)) return false; n++; } return n >= 2; }
  function follow(qs, j) {
    var q = qs[j];
    if (!q || !q.when || q.indent === false) return false;
    if (q.indent === true) return true;
    for (var p = j - 1; p >= 0; p--) {
      if (!qs[p]) return false;
      if (names(q, qs[p].id)) return !gate(qs, p);
      var lead = null;
      for (var r = p - 1; r >= 0 && !lead; r--) if (qs[r] && names(q, qs[r].id) && names(qs[p], qs[r].id)) lead = qs[r].id;
      if (!lead) return false;
    }
    return false;
  }
  if (!child && needs.indexOf('mod') >= 0) out.push({ id: 'mod', kind: 'mod', depth: 0 });
  if (recipe.base) out.push({ id: 'base', kind: 'base', depth: 0 });
  // Quick or Everything (draft.mode): a task that copies something and writes asks it right after "What to copy". Quick keeps every
  // group that is not essential as copied: one 'group' step (count: its values) until "Ask these" puts the group in draft.asked
  // (draft.kept takes it out again). A required question, or one already answered, stays a step of its own
  var modes = !!recipe.base && !explore, quick = modes && draft.mode === 'quick', asked = draft.asked || [];
  if (modes) out.push({ id: 'mode', kind: 'mode', depth: 0 });
  var gs = (recipe.groups || []).slice(), ess = [], rest = [];
  for (i = 0; i < gs.length; i++) (gs[i] && gs[i].essential ? ess : rest).push(gs[i]);
  gs = ess.concat(rest);
  for (i = 0; i < gs.length; i++) {
    var g = gs[i], qs = (g && g.q) || [], isKept = kept.indexOf(g.id) >= 0, fold = quick && !g.essential && (isKept || asked.indexOf(g.id) < 0), folded = [];
    for (j = 0; j < qs.length; j++) {
      var q = qs[j];
      if (!q || !match(q.when)) continue;
      var a = ans[q.id];
      if (fold && !q.required && !(a && a.src !== 'keep')) { folded.push(q.id); continue; }
      out.push({ id: 'q:' + q.id, kind: 'q', q: q.id, group: g.id, essential: !!g.essential, depth: follow(qs, j) ? 1 : 0, kept: fold ? false : isKept });
    }
    if (folded.length) out.push({ id: 'g:' + g.id, kind: 'group', group: g.id, count: folded.length, qs: folded, essential: false, depth: 0, kept: true });
  }
  if (child && explore) out.push({ id: 'back', kind: 'back', depth: 0 });
  else if (child) { out.push({ id: 'review', kind: 'review', depth: 0 }); out.push({ id: 'back', kind: 'back', depth: 0 }); }
  else if (explore) out.push({ id: 'done', kind: 'done', depth: 0 });
  else {
    out.push({ id: 'review', kind: 'review', depth: 0 });
    out.push({ id: 'write', kind: 'write', depth: 0 });
    out.push({ id: 'check', kind: 'check', depth: 0 });
    out.push({ id: 'test', kind: 'test', depth: 0 });
    if ((recipe.checklist || []).length) out.push({ id: 'checklist', kind: 'checklist', depth: 0 });
    out.push({ id: 'done', kind: 'done', depth: 0 });
  }
  for (i = 0; i < out.length; i++) out[i].n = i + 1;
  return out;
}

// census/<name>.json: an array of keys, or {keys: [...]}; a key is a string or {key}. null when the file is not there yet.
function loadCensus(name, dir) {
  const names = Array.isArray(name) ? name : name ? [name] : [];
  if (!names.length) return { keys: [], files: [], missing: [] };
  const keys = [], files = [], missing = [];
  for (const n of names) {
    if (!/^[a-z][a-z0-9-]*$/.test(String(n))) { missing.push(String(n)); continue; }
    const f = path.join(dir || CENSUS_DIR, n + '.json');
    let j; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { if (e.code === 'ENOENT') { missing.push(n); continue; } throw new Error('census ' + n + ': ' + e.message); }
    const arr = Array.isArray(j) ? j : (j && (j.keys || j.vars)) || [];
    for (const k of arr) { const s = typeof k === 'string' ? k : k && k.key; if (s && !keys.includes(String(s))) keys.push(String(s)); }
    files.push(f);
  }
  return { keys, files, missing };
}

function allQ(recipe) { const a = []; for (const g of recipe.groups || []) for (const q of (g && g.q) || []) a.push({ g, q }); return a; }

// every census key must be in a question's covers or in kept (with a reason)
function coverage(recipe, census) {
  const keys = Array.isArray(census) ? census : census && census.keys ? census.keys : null;
  const asked = new Set(), keptK = new Set();
  for (const { q } of allQ(recipe)) for (const k of q.covers || []) asked.add(String(k));
  for (const r of recipe.kept || []) if (Array.isArray(r) && r[0]) keptK.add(String(r[0]));
  if (!keys) return { ok: true, noCensus: true, total: 0, asked: asked.size, kept: keptK.size, missing: [], unknown: [] };
  const all = new Set(keys);
  const missing = keys.filter(k => !asked.has(k) && !keptK.has(k));
  const unknown = [...asked, ...keptK].filter(k => !all.has(k));
  return { ok: !missing.length, total: keys.length, asked: keys.filter(k => asked.has(k)).length, kept: keys.filter(k => !asked.has(k) && keptK.has(k)).length, missing, unknown };
}

// picker.branch: one recipe id or a list of them -> [ids] (empty: the question opens no branch)
function branchIds(P) { const b = P && P.branch; return Array.isArray(b) ? b.filter(x => typeof x === 'string' && x) : typeof b === 'string' && b ? [b] : []; }

const isFn = f => typeof f === 'function';
const isStr = s => typeof s === 'string' && s.length > 0;

// opt: {kinds: own question kinds the recipe's .client.js adds, ids: recipe ids a branch may name, censusDir}
// -> [{level: 'error'|'warn', msg}]
function validate(recipe, census, opt) {
  opt = opt || {};
  const out = [], err = m => out.push({ level: 'error', msg: m }), warn = m => out.push({ level: 'warn', msg: m });
  if (!recipe || typeof recipe !== 'object') { err('a recipe must be an object'); return out; }
  const id = recipe.id;
  if (!/^[a-z][a-z0-9-]*$/.test(String(id || ''))) err('id must be [a-z][a-z0-9-]*: ' + id);
  const pre = 'task.' + id + '.';
  if (!Array.isArray(recipe.verbs) || !recipe.verbs.length || recipe.verbs.some(v => !VERBS.includes(v))) err('verbs must be a list of ' + VERBS.join(', '));
  if (!Array.isArray(recipe.games) || !recipe.games.length || recipe.games.some(g => !GAMES.includes(g))) err('games must be a list of ' + GAMES.join(', '));
  // na (game parity): {<game left out of games>: why}, the plain line the greyed row shows on that game's tab ("not available in this
  // game, because ..." with its limits or gohweb row): a lang key under the recipe's prefix, or plain words
  if (recipe.na != null) {
    if (typeof recipe.na !== 'object' || Array.isArray(recipe.na)) err('na must be {game: lang key or words}');
    else for (const [g, w] of Object.entries(recipe.na)) {
      if (!GAMES.includes(g)) err('na: ' + g + ' is not a game (' + GAMES.join(', ') + ')');
      else if (Array.isArray(recipe.games) && recipe.games.includes(g)) err('na: ' + g + ' is in games; na is only for a game the task leaves out');
      if (!isStr(w) || !w.trim()) err('na.' + g + ' must be a lang key or words');
      else if (/^task\./.test(w) && !w.startsWith(pre)) err('na.' + g + ' must be a lang key starting with ' + pre);
    }
  }
  if (recipe.needs != null && (!Array.isArray(recipe.needs) || recipe.needs.some(n => !NEEDS.includes(n)))) err('needs must be a list of ' + NEEDS.join(', '));
  if (recipe.order != null && typeof recipe.order !== 'number') err('order must be a number');
  // title: one lang key, or one per verb ({make, change, explore}: the row and the window head say the one of the verb)
  const tOk = t => isStr(t) && t.startsWith(pre);
  if (recipe.title && typeof recipe.title === 'object' && !Array.isArray(recipe.title)) {
    const tk = Object.keys(recipe.title);
    if (!tk.length || tk.some(k => !VERBS.includes(k) || !tOk(recipe.title[k]))) err('title must be a lang key starting with ' + pre + ', or {make, change, explore} of them');
  } else if (!tOk(recipe.title)) err('title must be a lang key starting with ' + pre);
  if (recipe.base != null && (typeof recipe.base !== 'object' || !isStr(recipe.base.lookup))) err('base must be {lookup: kind}');
  if (!Array.isArray(recipe.groups)) err('groups must be a list');
  const kinds = KINDS.concat(opt.kinds || []), qids = new Set(), gids = new Set(), seen = [];
  for (const g of recipe.groups || []) {
    if (!g || !/^[a-z][a-z0-9-]*$/.test(String(g.id || ''))) { err('group id must be [a-z][a-z0-9-]*: ' + (g && g.id)); continue; }
    if (gids.has(g.id)) err('group ' + g.id + ' twice'); gids.add(g.id);
    if (!isStr(g.title) || !g.title.startsWith(pre)) err('group ' + g.id + ': title must be a lang key starting with ' + pre);
    if (!Array.isArray(g.q) || !g.q.length) err('group ' + g.id + ': q must be a list of questions');
    for (const q of g.q || []) {
      const w = 'question ' + (q && q.id) + ': ';
      if (!q || !/^[a-z][a-z0-9_]*$/.test(String(q.id || ''))) { err('question id must be [a-z][a-z0-9_]*: ' + (q && q.id)); continue; }
      if (qids.has(q.id) || BUILTIN_STEPS.includes(q.id)) err(w + 'id used twice or a built-in step name'); qids.add(q.id);
      if (!kinds.includes(q.kind)) err(w + 'kind ' + q.kind + ' is not ' + kinds.join(' | '));
      if (!isStr(q.ask) || !q.ask.startsWith(pre)) err(w + 'ask must be a lang key starting with ' + pre);
      if (q.help != null && (!isStr(q.help) || !q.help.startsWith(pre))) err(w + 'help must be a lang key starting with ' + pre);
      if (q.covers != null && (!Array.isArray(q.covers) || q.covers.some(k => !isStr(k)))) err(w + 'covers must be a list of census keys');
      const L = q.limits;
      if (L != null) {
        if (typeof L !== 'object') err(w + 'limits must be an object');
        else {
          for (const k of ['min', 'max', 'step']) if (L[k] != null && typeof L[k] !== 'number') err(w + 'limits.' + k + ' must be a number');
          if (L.min != null && L.max != null && L.min > L.max) err(w + 'limits.min is above limits.max');
          if (L.values != null && (!Array.isArray(L.values) || !L.values.length)) err(w + 'limits.values must be a list');
          if (L.re != null) { try { new RegExp(L.re); } catch (e) { err(w + 'limits.re is not a regular expression'); } }
          if (L.limit != null && !/^[A-Z][A-Z0-9]*-\d+[a-z]?$/.test(String(L.limit))) warn(w + 'limits.limit should be a limits ID like WPN-12: ' + L.limit);
        }
      }
      if (q.kind === 'choice' && !(L && Array.isArray(L.values) && L.values.length)) err(w + 'a choice needs limits.values');
      const P = q.picker;
      // a list question's lines may also be typed (value): the list picker offers it on every line anyway
      const srcOk = q.kind === 'list' ? SOURCES.concat(['value']) : SOURCES;
      if (P != null) {
        if (typeof P !== 'object' || !Array.isArray(P.sources) || !P.sources.length || P.sources.some(s => !srcOk.includes(s))) err(w + 'picker.sources must be a list of ' + srcOk.join(', '));
        else {
          if (P.sources.includes('exist') && !isStr(P.lookup)) err(w + 'picker source exist needs picker.lookup');
          if (P.sources.includes('branch')) {
            // one recipe id, or a list of them (the user picks the kind of task before Start)
            if (Array.isArray(P.branch)) {
              if (!P.branch.length || P.branch.some(x => !/^[a-z][a-z0-9-]*$/.test(String(x)))) err(w + 'picker.branch must be a recipe id or a list of recipe ids');
              else if (new Set(P.branch).size !== P.branch.length) err(w + 'picker.branch names a recipe twice');
            } else if (!isStr(P.branch)) err(w + 'picker source branch needs picker.branch (a recipe id or a list of them)');
            if (opt.ids) for (const b of branchIds(P)) if (!opt.ids.includes(b)) warn(w + 'picker.branch ' + b + ' is not in the recipe list');
          }
          if (P.sources.includes('file') && (!Array.isArray(P.kinds) || !P.kinds.length)) err(w + 'picker source file needs picker.kinds');
        }
      }
      if ((q.kind === 'thing' || q.kind === 'file') && !P) err(w + 'a ' + q.kind + ' question needs a picker');
      if (q.unique != null && (typeof q.unique !== 'object' || !isStr(q.unique.lookup) || (q.unique.in != null && !seen.includes(q.unique.in)))) err(w + 'unique must be {lookup, in} where in names a question asked before it');
      if (q.unique != null && q.kind !== 'id') err(w + 'unique is for id questions');
      if (q.optional != null && typeof q.optional !== 'boolean') err(w + 'optional must be true or false');
      const U = q.limits && q.limits.usual;
      if (U != null) {
        if (q.kind !== 'number' || !Array.isArray(U) || U.length !== 2 || !U.every(x => typeof x === 'number' && isFinite(x)) || U[0] > U[1]) err(w + 'limits.usual must be [lo, hi] numbers on a number question (what the game uses; outside it is a warning, not a refusal)');
        else if ((q.limits.min != null && U[0] < q.limits.min) || (q.limits.max != null && U[1] > q.limits.max)) err(w + 'limits.usual must sit inside min and max');
      }
      if (q.required != null && typeof q.required !== 'boolean') err(w + 'required must be true or false (true: Quick asks it too, the copy gives no answer)');
      if (q.required && q.optional) err(w + 'required and optional both');
      if (q.when != null) {
        if (typeof q.when !== 'object') err(w + 'when must be {questionId: value}');
        else for (const k of Object.keys(q.when)) if (!seen.includes(k) && !WHEN_KEYS.includes(k)) err(w + 'when names ' + k + ', which is not asked before it' + (/^\$/.test(k) ? ' (reserved keys: ' + WHEN_KEYS.join(', ') + ')' : ''));
        const c = q.when && typeof q.when === 'object' ? q.when.$copy : undefined;
        if (c !== undefined && !(isStr(c) || (Array.isArray(c) && c.length && c.every(isStr)) || (c && typeof c === 'object' && !Array.isArray(c) && isStr(c.id) && 'is' in c)))
          err(w + 'when $copy must be a value id, a list of ids, or {id, is} (true when the recipe values gave that id a value, or that value)');
      }
      if (q.indent != null && typeof q.indent !== 'boolean') err(w + 'indent must be true or false (true: always indented, false: never)');
      // suggest: {from, slug}: an empty text or id box starts with the answer of an earlier question (slug: lowercase a to z, 0 to 9 and _)
      if (q.suggest != null && (typeof q.suggest !== 'object' || !isStr(q.suggest.from) || !seen.includes(q.suggest.from) || (q.suggest.slug != null && typeof q.suggest.slug !== 'boolean'))) err(w + 'suggest must be {from: an earlier question id, slug: true or false}');
      if (q.multi != null && typeof q.multi !== 'boolean') err(w + 'multi must be true or false');
      if (q.multi && !(P && Array.isArray(P.sources) && P.sources.includes('file'))) err(w + 'multi is for a question with the file source');
      if (P && typeof P === 'object') {
        if (P.order != null && P.order !== '' && !['before', 'after'].includes(P.order)) err(w + 'picker.order must be before or after');
        if (P.pass != null && (typeof P.pass !== 'object' || Array.isArray(P.pass))) err(w + 'picker.pass must be {for, keys, base, answers}');
        else if (P.pass && P.pass.by != null) {
          // by: what goes to one kind of branch only, {recipeId: {for, keys, base, answers}}; every key is a recipe of picker.branch
          const by = P.pass.by, ids = branchIds(P);
          if (typeof by !== 'object' || Array.isArray(by) || Object.keys(by).some(k => !ids.includes(k) || !by[k] || typeof by[k] !== 'object' || Array.isArray(by[k]))) err(w + 'picker.pass.by must be {recipeId: {...}} for recipes of picker.branch');
        }
        if (P.filter != null && (typeof P.filter !== 'object' || Array.isArray(P.filter))) err(w + 'picker.filter must be an object');
        if (P.in != null && typeof P.in !== 'string') err(w + 'picker.in must be a question asked before it, or a word the lookup reads');
      }
      seen.push(q.id);
    }
  }
  if (recipe.kept != null) {
    if (!Array.isArray(recipe.kept)) err('kept must be a list of [key, reason]');
    else for (const r of recipe.kept) if (!Array.isArray(r) || !isStr(r[0]) || !isStr(r[1])) err('kept rows are [key, reason], both filled: ' + JSON.stringify(r));
  }
  if (recipe.checklist != null && (!Array.isArray(recipe.checklist) || recipe.checklist.some(k => !isStr(k) || !k.startsWith(pre)))) err('checklist must be lang keys starting with ' + pre);
  if (recipe.test != null && (!isStr(recipe.test) || !recipe.test.startsWith(pre))) err('test must be a lang key starting with ' + pre + ' (where the new thing is in a test match)');
  for (const g of recipe.groups || []) for (const q of (g && g.q) || []) {
    if (!q) continue;
    const L = q.limits, P = q.picker;
    if (L && typeof L === 'object' && L.reHint != null && (!isStr(L.reHint) || !L.reHint.startsWith(pre))) err('question ' + q.id + ': limits.reHint must be a lang key starting with ' + pre + ' (an example of the form)');
    if (P && typeof P === 'object' && P.target != null && (!isStr(P.target) || path.isAbsolute(P.target) || /(^|[\\/])\.\.([\\/]|$)/.test(P.target))) err('question ' + q.id + ': picker.target must be a path inside the mod (the file the outside program saves)');
    if (P && typeof P === 'object' && P.check != null && typeof P.check !== 'function') err('question ' + q.id + ': picker.check must be a function (file) that gives nothing when the file is fine, else a reason');
  }
  if (recipe.lookups != null) {
    if (typeof recipe.lookups !== 'object') err('lookups must be {kind: fn}');
    else for (const [k, f] of Object.entries(recipe.lookups)) { if (!/^[a-z][a-z0-9-]*$/.test(k)) err('lookup kind ' + k + ' must be [a-z][a-z0-9-]*'); if (!isFn(f)) err('lookup ' + k + ' must be a function'); }
  }
  if (recipe.values != null && !isFn(recipe.values)) err('values must be a function (ctx, base) -> {questionId: value}');
  if (recipe.next != null && (!Array.isArray(recipe.next) || recipe.next.some(x => !x || typeof x !== 'object' || !isStr(x.recipe) || (x.verb != null && !VERBS.includes(x.verb)) || (x.label != null && !isStr(x.label))))) err('next must be a list of {recipe, verb, label} (the Done step buttons)');
  if (recipe.check != null && !isFn(recipe.check)) err('check must be a function (draft, ctx) -> {cards: [...]}');
  if (recipe.pass != null && !isFn(recipe.pass)) err('pass must be a function (draft, qid, ctx, {line}) -> {for, keys, base, answers}');
  if (recipe.genGame != null && typeof recipe.genGame !== 'function') err('genGame must be a function (draft) -> the game id the task writes for');
  if (recipe.copiesFirst != null && typeof recipe.copiesFirst !== 'boolean') err('copiesFirst must be true or false (true: copies go before the gen steps at Write)');
  if (recipe.base && typeof recipe.base === 'object' && recipe.base.filter != null && (typeof recipe.base.filter !== 'object' || Array.isArray(recipe.base.filter))) err('base.filter must be an object');
  const writes = (recipe.verbs || []).some(v => v !== 'explore');
  if (writes && !isFn(recipe.compile)) err('compile(draft, ctx) is needed for make and change');
  if (recipe.census) {
    const c = census || loadCensus(recipe.census, opt.censusDir);
    if (c.missing && c.missing.length) warn('census file not there yet: ' + c.missing.join(', ') + ' (coverage not checked)');
    else {
      const cv = coverage(recipe, c);
      if (!cv.ok) err('census keys neither asked nor kept: ' + cv.missing.slice(0, 20).join(', ') + (cv.missing.length > 20 ? ' ...' : ''));
      if (cv.unknown.length) warn('covers or kept names keys the census does not have: ' + cv.unknown.slice(0, 10).join(', '));
    }
  }
  return out;
}

// every lang key a recipe names: title, group titles, ask, help, checklist, choice values (task.<id>.v.<q>.<value>)
function keysOf(recipe) {
  const k = new Set();
  if (isStr(recipe.title)) k.add(recipe.title);
  else if (recipe.title && typeof recipe.title === 'object') for (const t of Object.values(recipe.title)) if (isStr(t)) k.add(t);
  for (const g of recipe.groups || []) {
    if (isStr(g.title)) k.add(g.title);
    for (const q of g.q || []) {
      if (isStr(q.ask)) k.add(q.ask);
      if (isStr(q.help)) k.add(q.help);
      if (q.kind === 'choice' && q.limits && Array.isArray(q.limits.values)) for (const v of q.limits.values) k.add('task.' + recipe.id + '.v.' + q.id + '.' + v);
      if (q.limits && isStr(q.limits.reHint)) k.add(q.limits.reHint);
    }
  }
  for (const c of recipe.checklist || []) k.add(c);
  if (isStr(recipe.test)) k.add(recipe.test);
  if (recipe.na && typeof recipe.na === 'object') for (const w of Object.values(recipe.na)) if (isStr(w) && /^task\.[\w-]+(\.[\w-]+)+$/.test(w)) k.add(w);
  return [...k];
}

// the title's lang key for a verb: a string title is the same for every verb; an object {make, change, explore} gives the verb's
// key, else make's, else its first. titles(recipe) -> the object, or null for a string title (the page gets title and titles)
function titleKey(recipe, verb) {
  const t = recipe && recipe.title;
  if (!t || typeof t !== 'object') return typeof t === 'string' ? t : '';
  return (verb && isStr(t[verb]) && t[verb]) || (isStr(t.make) && t.make) || Object.values(t).find(isStr) || '';
}
function titles(recipe) { const t = recipe && recipe.title; return t && typeof t === 'object' && !Array.isArray(t) ? Object.assign({}, t) : null; }

// what the page needs of a recipe (no functions)
function forPage(recipe) {
  return {
    id: recipe.id, verbs: recipe.verbs, games: recipe.games, needs: recipe.needs || [], order: recipe.order || 0, title: titleKey(recipe), titles: titles(recipe),
    base: recipe.base || null, groups: recipe.groups || [], checklist: recipe.checklist || [], kept: (recipe.kept || []).length,
    values: isFn(recipe.values), lookups: Object.keys(recipe.lookups || {}), check: isFn(recipe.check), next: Array.isArray(recipe.next) ? recipe.next : null, test: isStr(recipe.test) ? recipe.test : null,
    na: recipe.na && typeof recipe.na === 'object' ? Object.assign({}, recipe.na) : null,
    writes: writesOf(recipe),
  };
}
// writes: {game: the game the task writes for} for each game of the recipe where recipe.genGame (lib/compile.js writeDraft) names
// another known game (gohunit: goh -> as64, the unit goes into an AS2 mod); null when none. The page's mod step lists and makes the
// mods of that game
function writesOf(recipe) {
  if (!isFn(recipe.genGame)) return null;
  const out = {};
  for (const g of recipe.games || []) {
    let w = null; try { w = recipe.genGame({ recipe: recipe.id, game: g }); } catch { w = null; }
    if (GAMES.includes(w) && w !== g) out[g] = w;
  }
  return Object.keys(out).length ? out : null;
}

module.exports = { validate, coverage, steps, loadCensus, keysOf, forPage, branchIds, titleKey, titles, VERBS, GAMES, NEEDS, KINDS, SOURCES, BUILTIN_STEPS, WHEN_KEYS, CENSUS_DIR };
