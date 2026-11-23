// Bots part "targets": reader and surgical editor of set/target/*.inc (target selectors) and set/target/ammo.set (ammo choice).
// Forms follow how the game reads them: selectors (selector/type/unit/group/select/ignore/sort),
// terms (in_range is read in metres and multiplied by 20 there, so the file holds metres),
// ammo choice (select_ammo: class [in_bush|in_cover] {"tags" {option value}...}).
// Text is latin1 (bytes kept, cp1251 comments survive), offsets are char offsets of the file text; comments are blanked by live() so
// they never match. Every action edits only the bytes it names: moved lines keep their own text, inserted lines take the neighbour's
// indent and the file's line end (CRLF in stock). Untouched text stays byte-identical.
// Author: Imperator_Aug (ARSENAL, ia-22d80a2b)
'use strict';

// key/params: the page words the error in its language (S6, lang bots.targets.e.*); msg = the English text
const bad = (msg, status, key, params) => Object.assign(new Error(msg), { status: status || 400, key: key ? 'bots.targets.e.' + key : undefined, params: params || {} });

// comments (; to line end, outside quotes) blanked to spaces: offsets stay those of the text (same rule as bots/lib.js live)
function live(s) {
  let o = '', q = false;
  for (let j = 0; j < s.length; j++) {
    const c = s[j];
    if (q) { if (c === '"' || c === '\n') q = false; o += c; continue; }
    if (c === '"') { q = true; o += c; continue; }
    if (c === ';') { while (j < s.length && s[j] !== '\n' && s[j] !== '\r') { o += ' '; j++; } j--; continue; }
    o += c;
  }
  return o;
}
function lex(t) {
  const toks = [], n = t.length;
  let i = 0;
  while (i < n) {
    const c = t[i];
    if (c === '{' || c === '}' || c === '(' || c === ')') { toks.push({ t: c, a: i, b: i + 1 }); i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\v' || c === '\f') { i++; continue; }
    if (c === '"') { let j = i + 1; while (j < n && t[j] !== '"' && t[j] !== '\n') j++; toks.push({ t: 's', v: t.slice(i + 1, j), a: i, b: Math.min(j + 1, n) }); i = j + 1; continue; }
    let j = i; while (j < n && !/[\s{}()"]/.test(t[j])) j++;
    toks.push({ t: 'w', v: t.slice(i, j), a: i, b: j }); i = j;
  }
  return toks;
}
// brace tree: node {a, b (after the closing brace), kids, toks (own tokens; a child shows as {t:'node'})}
function tree(text) {
  const root = { a: 0, b: text.length, kids: [], toks: [] }, st = [root];
  for (const k of lex(live(text))) {
    const top = st[st.length - 1];
    if (k.t === '{') { const nd = { a: k.a, b: -1, kids: [], toks: [] }; top.kids.push(nd); top.toks.push({ t: 'node', node: nd }); st.push(nd); }
    else if (k.t === '}') { if (st.length === 1) throw bad('The file has a } with no { before it (offset ' + k.a + ').', 400, 'braces', { at: k.a }); st.pop().b = k.b; }
    else top.toks.push(k);
  }
  if (st.length !== 1) throw bad('The file has a { that is never closed.', 400, 'braces', { at: '-' });
  return root;
}
const head = nd => { const k = nd.toks[0]; return k && (k.t === 'w' || k.t === 's') ? k.v : ''; };
const words = nd => nd.toks.filter(k => k.t === 'w' || k.t === 's');

// ---------- selectors (set/target/*.inc) ----------
function termOf(nd) {
  const w = words(nd); let i = 0, not = false;
  if (w[0] && w[0].t === 'w' && w[0].v.toLowerCase() === 'not') { not = true; i = 1; }
  const k = w[i] ? w[i].v : '', arg = w[i + 1];
  return { not, k, v: arg ? arg.v : null, at: arg ? [arg.a, arg.b] : null, a: nd.a, b: nd.b };
}
function groupOf(g, text) {
  const G = { a: g.a, b: g.b, select: [], ignore: [], sort: [], key: null, ranges: [], raw: '' };
  for (const k of g.kids) {
    const h = head(k).toLowerCase();
    if (h === 'select' || h === 'ignore') G[h].push(k.kids.map(termOf));
    else if (h === 'sort') { if (k.kids.length) G.sort.push(k.kids.map(termOf)); const w = words(k).slice(1).filter(x => x.t === 'w'); if (w.length) G.key = w[w.length - 1].v; }
  }
  for (const where of ['select', 'ignore', 'sort']) for (const set of G[where]) for (const t of set) if (t.k.toLowerCase() === 'in_range' && t.at) G.ranges.push({ where, v: t.v, at: t.at });
  G.ranges.sort((x, y) => x.at[0] - y.at[0]);
  G.raw = live(text.slice(g.a, g.b)).replace(/\s+/g, ' ').trim();
  return G;
}
function selectors(text) {
  const out = [];
  for (const nd of tree(text).kids) {
    if (head(nd).toLowerCase() !== 'selector') continue;
    const s = { idx: out.length, a: nd.a, b: nd.b, type: null, unit: null, weapon: null, groups: [] };
    for (const k of nd.kids) {
      const h = head(k).toLowerCase(), w = words(k).slice(1);
      if (h === 'type') s.type = w[0] ? w[0].v : null;
      else if (h === 'unit') { s.unit = w[0] ? w[0].v : null; s.weapon = w[1] ? w[1].v : null; }
      else if (h === 'group') s.groups.push(groupOf(k, text));
    }
    out.push(s);
  }
  return out;
}
// select.set: the include list in read order (pushed in read order; the first selector that fits wins)
function includes(text) {
  const t = live(text), out = [];
  for (const m of t.matchAll(/\(\s*include\s+"([^"]+)"\s*\)/g)) out.push(m[1]);
  return out;
}

// ---------- ammo choice (set/target/ammo.set) ----------
const OFF = v => v.length > 0 && (v[0] === '0' || /^false$/i.test(v[0]));
function ruleOf(r, j, text) {
  const s = r.toks.find(x => x.t === 's');
  const opts = r.kids.map(o => { const w = words(o); return { k: w[0] ? w[0].v : '', v: w.slice(1).map(x => x.v), vt: w[1] ? [w[1].a, w[1].b] : null, a: o.a, b: o.b }; });
  const dis = opts.some(o => o.k === 'disable'), off = k => opts.some(o => o.k === k && OFF(o.v));
  return { j, tags: s ? s.v : '', a: r.a, b: r.b, tagEnd: s ? s.b : r.a + 1, opts, disable: dis,
    ai: !dis && !off('enable_for_ai'), user: !dis && !off('enable_for_user'), human: !dis && !off('enable_for_human_user'),
    raw: live(text.slice(r.a, r.b)).replace(/\s+/g, ' ').trim() };
}
function ammo(text) {
  const sa = tree(text).kids.find(n => head(n).toLowerCase() === 'select_ammo');
  if (!sa) throw bad('This ammo.set has no {select_ammo ...} block.', 400, 'noAmmo', {});
  return sa.kids.map((b, i) => {
    const w = words(b);
    return { i, cls: w[0] ? w[0].v : '', cond: w[1] ? w[1].v : null, a: b.a, b: b.b, rules: b.kids.map((r, j) => ruleOf(r, j, text)) };
  });
}

// ---------- text units ----------
const eolOf = t => (t.indexOf('\r\n') >= 0 ? '\r\n' : '\n');
// the whole line(s) of [a,b) when only blanks sit before a on its line and only blanks or a comment after b; else just [a,b)
function unit(text, a, b) {
  let s = a; while (s > 0 && (text[s - 1] === ' ' || text[s - 1] === '\t')) s--;
  const atStart = s === 0 || text[s - 1] === '\n';
  let e = b; while (e < text.length && (text[e] === ' ' || text[e] === '\t')) e++;
  if (text[e] === ';') while (e < text.length && text[e] !== '\r' && text[e] !== '\n') e++;
  let eol = false;
  if (text[e] === '\r' && text[e + 1] === '\n') { e += 2; eol = true; } else if (text[e] === '\n') { e++; eol = true; }
  return atStart && eol ? { a: s, b: e, line: true, indent: text.slice(s, a) } : { a, b, line: false, indent: text.slice(s, a) };
}
function swap(text, r1, r2) {   // r1 before r2, both {a,b}
  if (r1.b > r2.a) throw bad('Internal: ranges overlap.');
  return text.slice(0, r1.a) + text.slice(r2.a, r2.b) + text.slice(r1.b, r2.a) + text.slice(r1.a, r1.b) + text.slice(r2.b);
}
function swapUnits(text, x, y) {   // x before y: whole lines when both are whole lines, else the brace blocks alone
  const ux = unit(text, x.a, x.b), uy = unit(text, y.a, y.b);
  return ux.line && uy.line ? swap(text, ux, uy) : swap(text, { a: x.a, b: x.b }, { a: y.a, b: y.b });
}
function cut(text, x) {
  const u = unit(text, x.a, x.b);
  if (u.line) return text.slice(0, u.a) + text.slice(u.b);
  let s = x.a; while (s > 0 && (text[s - 1] === ' ' || text[s - 1] === '\t')) s--;
  return text.slice(0, s) + text.slice(x.b);
}
// put the lines `body` (array, first line without indent) before or after the unit of block x, in x's indent
function putBy(text, x, body, before, inner) {
  const u = unit(text, x.a, x.b), E = eolOf(text);
  if (u.line) {
    const lines = body.map((l, i) => (i === 0 || i === body.length - 1 ? u.indent : inner) + l);
    const blk = lines.join(E) + E;
    return before ? text.slice(0, u.a) + blk + text.slice(u.a) : text.slice(0, u.b) + blk + text.slice(u.b);
  }
  const one = body.length === 1 ? body[0] : body[0] + ' ' + body.slice(1, -1).join(' ') + body[body.length - 1];
  return before ? text.slice(0, x.a) + one + ' ' + text.slice(x.a) : text.slice(0, x.b) + ' ' + one + text.slice(x.b);
}
// the indent of a group's own lines (its first child on a line of its own), else one step deeper than the group
function innerIndent(text, g, outer) {
  const seg = text.slice(g.a, g.b), m = /\r?\n([ \t]*)\{/.exec(seg);
  if (m) return m[1];
  return outer + (outer.indexOf(' ') >= 0 && outer.indexOf('\t') < 0 ? '  ' : '\t');
}

// ---------- actions ----------
const NUM = /^\d+(\.\d+)?$/;
const ID = /^[A-Za-z0-9_]+$/, TAGS = /^[A-Za-z0-9_]+( [A-Za-z0-9_]+)*$/;
const SW = ['enable_for_ai', 'enable_for_user', 'enable_for_human_user'];
const ix = (n, len, what) => { const i = Number(n); if (!Number.isInteger(i) || i < 0 || i >= len) throw bad('No ' + what + ' number ' + n + ' here.'); return i; };
function metres(v) {
  const s = String(v == null ? '' : v).trim();
  if (!NUM.test(s) || Number(s) <= 0 || Number(s) > 10000) throw bad('Range: a number of metres above 0 and up to 10000, for example 150.', 400, 'metres', { v: s });
  return String(Number(s));
}
function clsList(c, info) {
  const list = (Array.isArray(c) ? c : [c]).map(x => String(x || '').trim());
  if (!list.length) throw bad('Pick a target class.');
  for (const x of list) {
    if (!ID.test(x)) throw bad('A target class is one word, for example tank.');
    if (info && info.classes && !info.classes.includes(x)) throw bad('Unknown target class "' + x + '": use one the game files use (' + info.classes.join(', ') + ').', 400, 'class', { c: x });
  }
  return list;
}
function selAt(text, n) { const S = selectors(text); return { S, s: S[ix(n, S.length, 'shooter list')] }; }

// a group's lines: {group, {select {class X} [{in_range N}]} per class, }
function groupLines(cls, range) { return ['{group'].concat(cls.map(c => '{select {class ' + c + '}' + (range ? ' {in_range ' + range + '}' : '') + '}'), ['}']); }

function apply1(kind, text, a, info) {
  const op = a && a.op;
  if (op === 'preset') return preset(kind, text, a, info);
  if (kind === 'sel') {
    const { s } = selAt(text, a.sel), G = s.groups, who = s.type || [s.unit, s.weapon].filter(Boolean).join(' ');
    if (op === 'moveGroup') {
      const i = ix(a.group, G.length, 'group'), d = Number(a.dir) < 0 ? -1 : 1, j = i + d;
      if (j < 0 || j >= G.length) throw bad(d < 0 ? 'That group is already first.' : 'That group is already last.');
      const x = G[Math.min(i, j)], y = G[Math.max(i, j)];
      return { text: swapUnits(text, x, y), did: [{ k: d < 0 ? 'bots.targets.do.up' : 'bots.targets.do.down', p: { n: i + 1, who } }] };
    }
    if (op === 'setRange') {
      const g = G[ix(a.group, G.length, 'group')], r = g.ranges[ix(a.term, g.ranges.length, 'range')], v = metres(a.value);
      if (r.v === v) return { text, did: [] };
      return { text: text.slice(0, r.at[0]) + v + text.slice(r.at[1]), did: [{ k: 'bots.targets.do.range', p: { n: Number(a.group) + 1, who, a: r.v, b: v } }] };
    }
    if (op === 'addGroup') {
      const cls = clsList(a.cls, info), range = a.range == null || String(a.range).trim() === '' ? null : metres(a.range);
      if (!G.length) throw bad('This shooter list has no group to place the new one by.');
      const at = a.at == null || a.at === '' || Number(a.at) >= G.length ? G.length : ix(a.at, G.length, 'place');
      const ref = at < G.length ? G[at] : G[G.length - 1], before = at < G.length;
      const outer = unit(text, ref.a, ref.b).indent, inner = innerIndent(text, ref, outer);
      return { text: putBy(text, ref, groupLines(cls, range), before, inner), did: [{ k: range ? 'bots.targets.do.addR' : 'bots.targets.do.add', p: { n: at + 1, who, c: cls.join(', '), r: range } }] };
    }
    if (op === 'removeGroup') {
      const i = ix(a.group, G.length, 'group');
      if (G.length < 2) throw bad('Refused: a shooter list needs at least one group, or it attacks nothing.', 400, 'lastGroup', {});
      return { text: cut(text, G[i]), did: [{ k: 'bots.targets.do.remove', p: { n: i + 1, who } }] };
    }
    throw bad('Unknown change "' + op + '" for a shooter list.');
  }
  if (kind === 'ammo') {
    const B = ammo(text), blk = op ? B[ix(a.block, B.length, 'target block')] : null;
    if (!blk) throw bad('Unknown change.');
    const R = blk.rules, cls = blk.cls + (blk.cond ? ' ' + blk.cond : '');
    if (op === 'moveRule') {
      const i = ix(a.rule, R.length, 'rule'), d = Number(a.dir) < 0 ? -1 : 1, j = i + d;
      if (j < 0 || j >= R.length) throw bad(d < 0 ? 'That rule is already first.' : 'That rule is already last.');
      return { text: swapUnits(text, R[Math.min(i, j)], R[Math.max(i, j)]), did: [{ k: d < 0 ? 'bots.targets.do.rUp' : 'bots.targets.do.rDown', p: { n: i + 1, t: R[i].tags, c: cls } }] };
    }
    if (op === 'switch') {
      const r = R[ix(a.rule, R.length, 'rule')], key = String(a.key || '');
      if (!SW.includes(key)) throw bad('Unknown switch "' + key + '": use ' + SW.join(', ') + '.');
      if (r.disable) throw bad('Refused: this rule is switched off for everyone ({disable}); remove the rule instead.', 400, 'disabled', {});
      const on = !!a.on, o = r.opts.find(x => x.k === key), now = !o || !OFF(o.v);
      if (now === on) return { text, did: [] };
      const did = [{ k: on ? 'bots.targets.do.on' : 'bots.targets.do.off', p: { s: key, t: r.tags, c: cls } }];
      if (on) {   // back to the default (on): the {key 0} option goes, as in the stock rules that lack it
        let s0 = o.a; while (s0 > 0 && (text[s0 - 1] === ' ' || text[s0 - 1] === '\t')) s0--;
        return { text: text.slice(0, s0) + text.slice(o.b), did };
      }
      if (o) return { text: text.slice(0, o.vt[0]) + '0' + text.slice(o.vt[1]), did };
      const at = r.opts.length ? r.opts[r.opts.length - 1].b : r.tagEnd;
      return { text: text.slice(0, at) + ' {' + key + ' 0}' + text.slice(at), did };
    }
    if (op === 'addRule') {
      const tags = String(a.tags || '').trim().replace(/\s+/g, ' ');
      if (!TAGS.test(tags)) throw bad('Ammo tags are words separated by spaces, for example bullet or "shell ap".');
      if (info && info.tags && !info.tags.includes(tags)) throw bad('Unknown ammo tags "' + tags + '": use tags the game\'s own rules use.', 400, 'tags', { t: tags });
      if (!R.length) throw bad('This target block has no rule to place the new one by.');
      const at = a.at == null || a.at === '' || Number(a.at) >= R.length ? R.length : ix(a.at, R.length, 'place');
      const ref = at < R.length ? R[at] : R[R.length - 1];
      return { text: putBy(text, ref, ['{"' + tags + '"}'], at < R.length, ''), did: [{ k: 'bots.targets.do.addRule', p: { n: at + 1, t: tags, c: cls } }] };
    }
    if (op === 'removeRule') {
      const i = ix(a.rule, R.length, 'rule');
      return { text: cut(text, R[i]), did: [{ k: 'bots.targets.do.rRemove', p: { n: i + 1, t: R[i].tags, c: cls } }] };
    }
    throw bad('Unknown change "' + op + '" for the ammo list.');
  }
  throw bad('Unknown file kind.');
}

// ---------- presets: each a fixed list of the actions above, worked out on the current text ----------
const LAUNCH = ['ap', 'rocketlauncher', 'at_rifle'];
const TANKCLS = c => /(^|_)tank($|_)/.test(c);
// launchers: soldier lists keyed by an anti-tank weapon tag; tank lists: type tank or tank_light/medium/heavy
const isLauncher = s => !!s.unit && !!s.weapon && s.weapon.split(/\s+/).some(w => LAUNCH.includes(w));
const isTankList = s => !!s.type && /^tank(_light|_medium|_heavy)?$/.test(s.type);
// what a preset would do here: list of actions (empty = nothing to fix in this file)
function presetPlan(kind, text, id, info) {
  const acts = [];
  if (id === 'mgTank' && kind === 'ammo') {
    const tag = info && info.bulletTag; if (!tag) return acts;
    ammo(text).forEach(b => { if (!b.cond && (info.tankClasses || []).includes(b.cls) && b.rules.length && !b.rules.some(r => r.tags === tag)) acts.push({ op: 'addRule', block: b.i, tags: tag }); });
  } else if (id === 'mgTankOff' && kind === 'ammo') {
    // the other direction: machine guns and rifles waste their fire on tanks = a bullet rule in a tank block (stock AS2 has none): it goes
    const tag = info && info.bulletTag; if (!tag) return acts;
    ammo(text).forEach(b => { if (b.cond || !(info.tankClasses || []).includes(b.cls)) return; for (let j = b.rules.length - 1; j >= 0; j--) if (b.rules[j].tags === tag) acts.push({ op: 'removeRule', block: b.i, rule: j }); });
  } else if (id === 'rocketInf' && kind === 'ammo') {
    ammo(text).forEach(b => { if (b.cls !== 'human') return; b.rules.forEach(r => { if (r.tags.split(' ').includes('rocketlauncher') && !r.disable && !r.user) acts.push({ op: 'switch', block: b.i, rule: r.j, key: 'enable_for_user', on: true }); }); });
  } else if (id === 'farTanks' && kind === 'sel') {
    const cls = (info && info.tankClasses || []).filter(c => !info.classes || info.classes.includes(c));
    if (cls.length) selectors(text).forEach(s => { if (isLauncher(s) && s.groups.length && s.groups.every(g => g.select.length)) acts.push({ op: 'addGroup', sel: s.idx, cls }); });
  } else if (id === 'closeInf' && kind === 'sel') {
    selectors(text).forEach(s => {
      const g0 = s.groups[0];
      const done = g0 && g0.select.length && g0.select.every(set => set.some(t => t.k === 'class' && t.v === 'human') && set.some(t => t.k === 'in_range'));
      if (isTankList(s) && s.groups.length && !done) acts.push({ op: 'addGroup', sel: s.idx, cls: ['human'], range: '30', at: 0 });
    });
  } else if (!PRESETS[id]) throw bad('Unknown preset "' + id + '".');
  return acts;
}
// later actions see the text the earlier ones made; a plan from the start text stays valid: additions go to other blocks, or to the
// top of a list (index 0 of its own selector), switches change one rule each (the rule numbers do not move), and removals run from the
// last rule of a block up (the numbers of the rules still to go do not move)
function preset(kind, text, a, info) {
  const P = PRESETS[a.id]; if (!P) throw bad('Unknown preset "' + a.id + '".');
  if (P.kind !== kind) throw bad('The preset "' + a.id + '" belongs to ' + (P.kind === 'ammo' ? 'ammo.set' : 'a shooter list file') + '.');
  const acts = presetPlan(kind, text, a.id, info);
  if (!acts.length) throw bad('Nothing to fix here: this file already has the fixed form.', 409, 'presetNone', {});
  let t = text; const did = [];
  for (const x of acts) { const r = apply1(kind, t, x, info); t = r.text; did.push(...r.did); }
  return { text: t, did };
}
const PRESETS = { mgTank: { kind: 'ammo' }, mgTankOff: { kind: 'ammo' }, rocketInf: { kind: 'ammo' }, farTanks: { kind: 'sel' }, closeInf: { kind: 'sel' } };

function applyAll(kind, text, actions, info) {
  if (!Array.isArray(actions) || !actions.length) throw bad('No change to make.');
  if (actions.length > 200) throw bad('Too many changes at once (200 at most).');
  let t = text; const did = [];
  for (const a of actions) { const r = apply1(kind, t, a, info); t = r.text; did.push(...r.did); }
  return { text: t, did };
}

// ---------- line diff (LCS on the part that differs, 2 lines of context) ----------
function diff(a, b) {
  const A = a.split(/\r?\n/), B = b.split(/\r?\n/);
  let p = 0; while (p < A.length && p < B.length && A[p] === B[p]) p++;
  let s = 0; while (s < A.length - p && s < B.length - p && A[A.length - 1 - s] === B[B.length - 1 - s]) s++;
  const x = A.slice(p, A.length - s), y = B.slice(p, B.length - s), n = x.length, m = y.length;
  const ops = [];
  if (n * m > 4e6) { x.forEach(l => ops.push(['-', l])); y.forEach(l => ops.push(['+', l])); }
  else {
    const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && x[i] === y[j]) { ops.push([' ', x[i]]); i++; j++; }
      // on a tie the removed line goes first: a changed line reads "- old" then "+ new"
      else if (i < n && (j >= m || L[i + 1][j] >= L[i][j + 1])) { ops.push(['-', x[i]]); i++; }
      else { ops.push(['+', y[j]]); j++; }
    }
  }
  const all = A.slice(0, p).map(l => [' ', l]).concat(ops, A.slice(A.length - s).map(l => [' ', l])), out = [];
  const keep = all.map((o, i) => o[0] !== ' ' || all.slice(Math.max(0, i - 2), i + 3).some(q => q[0] !== ' '));
  let gap = false;
  all.forEach((o, i) => { if (keep[i]) { if (gap && out.length) out.push({ t: '@', s: '...' }); gap = false; out.push({ t: o[0], s: o[1] }); } else gap = true; });
  return out;
}

module.exports = { live, tree, selectors, includes, ammo, unit, applyAll, apply1, presetPlan, PRESETS, diff, isLauncher, isTankList, TANKCLS, SW, metres, bad };
