// macrostd step header: every top-level mod define in the edited text gets a header comment directly above it (comment-only, data
//   identical):
//     ; <name>: <what it makes>
//     ;   <param> - <meaning, unit>
//     ;   e.g. ("<name>" p(v) ...)
//   what it makes: generated from the body, no guessing: the top-level blocks it emits ({key "first string" {child keys}}), the
//     macros it calls, "buy-card fields" when it emits {charge}/{cp}/{score}/{cost}. An author comment at the end of the define's
//     first line is moved into the first header line (bytes as they are) and that line loses the comment; comment lines already
//     directly above the define stay where they are (the header goes between them and the define).
//   param meaning: the {key} the %param feeds (in a string: "text in {key}"; as a block name: "block name"); a param passed on to
//     another mod macro is followed into that macro's body (3 levels). Unit from UNITS by key, else [?].
//   e.g.: the most common literal call of the name in the mod (calls outside define bodies first; ties: shortest), comments stripped,
//     line breaks folded to one space.
//   Families: a run of >= GROUP_MIN consecutive defines in one file (no other define between them) whose names are equal with digit
//     runs masked AND whose bodies are equal with comments dropped, digit runs masked and the define's own name masked, get ONE
//     group header above the first: "; <first> .. <last> (<n> defines, same shape): <what>".
//   Left alone: a define that already has a header (a comment line directly above starting "; <name>:"), one covered by a group
//     header ("; a .. b" above it in the same file), a define inside another define's body, an unclosed define, a define that
//     does not start its line, defines outside the edited files. Written comment text is ASCII ('?' for any other byte).
// Author: Imperator_Aug (ARSENAL, ia-0fbb0796)
const { scan, lineEnds } = require('../scan');

const GROUP_MIN = 3;
const MAX_LINE = 160;
// unit by the key a param feeds (lowercase key). Sources: limits/modweb ("thickness mm", "{mass kg}", "range: metres",
// "speed km/h" for vehicle speeds, times in s); anything else [?].
const UNITS = [
  [/^thickness$/, 'mm'], [/^(mass|weight)$/, 'kg'], [/^(range|radius|distance|maxdist|max_dist\w*)$/, 'm'],
  [/kmh|km\/h/, 'km/h'], [/^(\w*time|delay|duration|period)$/, 's'],
];
const unitOf = key => { const k = key.toLowerCase(); for (const [re, u] of UNITS) if (re.test(k)) return u; return null; };
const BUY = new Set(['charge', 'cp', 'score', 'cost']);
const ascii = t => t.replace(/[^\x20-\x7e\t]/g, '?');
const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// tokens of an SDL text: { k: '{' '}' '(' ')' 'S' 'W' 'C'(comment), a, b, t }
function tokens(s) {
  const out = [], n = s.length;
  let j = 0;
  while (j < n) {
    const c = s[j];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '=') { j++; continue; }
    if (c === ';') { let q = j; while (q < n && s[q] !== '\r' && s[q] !== '\n') q++; out.push({ k: 'C', a: j, b: q, t: s.slice(j, q) }); j = q; continue; }
    if ('{}()'.includes(c)) { out.push({ k: c, a: j, b: j + 1, t: c }); j++; continue; }
    if (c === '"') {
      let q = j + 1;
      while (q < n && s[q] !== '"' && s[q] !== '\r' && s[q] !== '\n') q += s[q] === '\\' ? 2 : 1;
      if (s[q] === '"') q++;
      out.push({ k: 'S', a: j, b: q, t: s.slice(j, q) }); j = q; continue;
    }
    let q = j;
    while (q < n && !' \t\r\n=;"{}()'.includes(s[q])) q++;
    out.push({ k: 'W', a: j, b: q, t: s.slice(j, q) }); j = q;
  }
  return out;
}

// body shape for family grouping
function shape(d) {
  const own = new RegExp(esc(d.name), 'g');
  return tokens(d.body).filter(t => t.k !== 'C').map(t => t.t.replace(own, '\u0001').replace(/\d+/g, '#')).join(' ');
}

// what the body makes
function whatOf(body) {
  const tk = tokens(body).filter(t => t.k !== 'C');
  const tops = [], calls = [], mods = [];
  let values = 0, exprs = 0;
  let i = 0;
  // read a {block} starting at tk[i] = '{' -> { key, str, kids:[keys], end }
  function block(i0) {
    let i = i0 + 1;
    const key = tk[i] && (tk[i].k === 'W' || tk[i].k === 'S') ? tk[i].t : '?';
    i++;
    let str = null;
    if (tk[i] && tk[i].k === 'S') str = tk[i].t;
    const kids = [];
    let d = 1;
    for (; i < tk.length && d > 0; i++) {
      const t = tk[i];
      if (t.k === '{') { d++; if (d === 2 && tk[i + 1] && (tk[i + 1].k === 'W' || tk[i + 1].k === 'S') && !kids.includes(tk[i + 1].t)) kids.push(tk[i + 1].t); }
      else if (t.k === '}') d--;
    }
    return { key, str, kids, end: i };
  }
  function skipParen(i0) { let d = 0, i = i0; for (; i < tk.length; i++) { if (tk[i].k === '(') d++; else if (tk[i].k === ')' && --d === 0) return i + 1; } return i; }
  const walk = (a, b) => {
    for (i = a; i < b;) {
      const t = tk[i];
      if (t.k === '{') { const r = block(i); tops.push(r); i = r.end; continue; }
      if (t.k === '(') {
        const u = tk[i + 1];
        if (u && u.k === 'S') { const nm = u.t.slice(1, -1); if (!calls.includes(nm)) calls.push(nm); i = skipParen(i); continue; }
        if (u && u.k === 'W' && u.t === 'mod' && tk[i + 2] && tk[i + 2].k === 'S') {
          const e = skipParen(i); mods.push(tk[i + 2].t.slice(1, -1)); const save = e; walk(i + 3, e - 1); i = save; continue;
        }
        exprs++; i = skipParen(i); continue;
      }
      if (t.k === 'W' || t.k === 'S') values++;
      i++;
    }
  };
  walk(0, tk.length);
  const parts = [];
  if (tops.some(r => BUY.has(r.key.toLowerCase()))) parts.push('buy-card fields');
  const showKids = tops.length <= 2;
  const all = tops.map(r => '{' + r.key + (r.str ? ' ' + r.str : '') + (showKids && r.kids.length ? ' ' + r.kids.slice(0, 4).map(k => '{' + k + '}').join(' ') + (r.kids.length > 4 ? ' ..' : '') : '') + '}');
  const rend = [];   // equal neighbours folded: "{damage} x3"
  for (const x of all) { const p = rend[rend.length - 1]; if (p && p.t === x) p.n++; else rend.push({ t: x, n: 1 }); }
  if (tops.length) parts.push(rend.slice(0, 6).map(r => r.t + (r.n > 1 ? ' x' + r.n : '')).join(' ') + (rend.length > 6 ? ` +${rend.length - 6} more` : ''));
  if (calls.length) parts.push('calls ' + calls.slice(0, 4).map(c => '"' + c + '"').join(' ') + (calls.length > 4 ? ` +${calls.length - 4} more` : ''));
  if (mods.length) parts.push('per mod ' + mods.map(x => '"' + x + '"').join(' '));
  if (!tops.length && !calls.length) parts.push(exprs ? 'a value expression' : values ? (values === 1 ? 'one value' : values + ' values') : 'nothing (empty body)');
  return parts.join(', ');
}

// meanings of each param of define d -> Map param -> [text]
function meanings(m, d, depth, cache) {
  const ck = d.key + ':' + d.line;
  if (cache.has(ck)) return cache.get(ck);
  const res = new Map();
  cache.set(ck, res);
  const body = d.body, tk = tokens(body), sc = scan(body);
  const add = (p, t) => { if (!res.has(p)) res.set(p, []); const L = res.get(p); if (!L.includes(t)) L.push(t); };
  const stack = [];   // block keys
  const follow = (p, callName, sub) => {   // p passed to callName as sub (param name or %index)
    const x = m.byName.get(callName);
    const def = x && (x.defs.find(e => e.key === d.key && e.line < d.line) || x.defs.find(e => e.scope) || x.defs[0]);
    if (def && depth < 3) {
      const mm = meanings(m, def, depth + 1, cache).get(sub);
      if (mm && mm.length && !mm.every(t => t === '[?]')) { for (const t of mm) add(p, t.replace(/ via .*$/, '') + ` via "${callName}"`); return; }
    }
    add(p, `${/^\d+$/.test(sub) ? '%' + sub : sub + '()'} of "${callName}"`);
  };
  for (let i = 0; i < tk.length; i++) {
    const t = tk[i];
    if (t.k === 'C') continue;
    if (t.k === '{') { const u = tk[i + 1]; stack.push(u && (u.k === 'W' || u.k === 'S') ? u : null); continue; }
    if (t.k === '}') { stack.pop(); continue; }
    if (t.k !== 'W' && t.k !== 'S') continue;
    for (const mt of t.t.matchAll(/%(\w+)/g)) {
      const p = mt[1], pos = t.a + mt.index;
      const call = sc.calls.filter(c => c.span[0] <= pos && pos < c.span[1]).sort((x, y) => (y.span[0] - x.span[0]))[0];
      if (call) {
        if (call.nameSpan[0] <= pos && pos < call.nameSpan[1]) { add(p, 'part of the macro name called'); continue; }
        const pr = call.params.find(q => q.valSpan[0] <= pos && pos < q.valSpan[1]);
        if (pr) { if (!call.dynamic) follow(p, call.name, pr.name); else add(p, `${pr.name}() of a built macro name`); continue; }
        const ai = call.args.findIndex(a => a.span[0] <= pos && pos < a.span[1]);
        if (ai >= 0) { if (!call.dynamic) follow(p, call.name, String(ai)); else add(p, `%${ai} of a built macro name`); continue; }
      }
      const top = stack.length ? stack[stack.length - 1] : null;
      if (top === t) { add(p, 'block name'); continue; }
      if (!top) { add(p, t.k === 'S' ? 'text in a top-level string' : 'top-level text'); continue; }
      let key = top.t.replace(/^"|"$/g, '');
      if (/^-?[\d.]+$/.test(key)) { const up = stack.length > 1 ? stack[stack.length - 2] : null; key = (up ? up.t.replace(/^"|"$/g, '') : '') + ' row ' + key; }
      if (t.k === 'S' && tk[i - 1] === top && top.k === 'W' && t.t === '"%' + p + '"') add(p, `name of {${key}}`);
      else if (t.k === 'S') add(p, `text in {${key}}`);
      else {
        // unit: an author comment that is only a unit at the end of the same line wins over the table
        let u = null;
        const nx = tk.slice(i + 1).find(x => x.k === 'C' || /[\r\n]/.test(body.slice(t.b, x.a)));
        if (nx && nx.k === 'C' && !/[\r\n]/.test(body.slice(t.b, nx.a))) { const um = /^;+[ \t]*(km\/h|m\/s|mm|cm|m|sec|s|seconds|kg|deg|degrees)[ \t]*$/i.exec(nx.t); if (um) u = um[1]; }
        if (!u) u = unitOf(key);
        add(p, `{${key}}` + (u ? ', ' + u : ', [?]'));
      }
    }
  }
  return res;
}

// an example call of name
function example(m, name) {
  const x = m.byName.get(name);
  if (!x || !x.calls.length) return null;
  const cand = new Map();
  const pool = x.calls.some(c => !c.def) ? x.calls.filter(c => !c.def) : x.calls;
  for (const c of pool) {
    const F = m.files.get(c.key);
    if (!F) continue;
    const raw = F.s.slice(c.span[0], c.span[1]);
    const t = tokens(raw);
    let s = '', last = 0;
    for (const k of t) if (k.k === 'C') { s += raw.slice(last, k.a); last = k.b; }
    s = (s + raw.slice(last)).replace(/[ \t]*[\r\n]+[ \t]*/g, ' ').replace(/\t/g, ' ').replace(/[ \t]+\)$/, ')');
    cand.set(s, (cand.get(s) || 0) + 1);
  }
  const best = [...cand].sort((a, b) => (b[1] - a[1]) || (/[^\x20-\x7e\t]/.test(a[0]) - /[^\x20-\x7e\t]/.test(b[0])) || (a[0].length - b[0].length) || (a[0] < b[0] ? -1 : 1))[0];
  return best ? best[0] : null;
}

const hasHeader = d => d.header.some(h => new RegExp('^[ \\t]*;[ \\t]*' + esc(d.name) + '[ \\t]*:').test(h));

// classify every define in scope -> { todo:[d], groups:[[d..]], left: Map reason -> [d] }
function classify(m) {
  const left = new Map(), todo = [];
  const leave = (d, why) => { if (!left.has(why)) left.set(why, []); left.get(why).push(d); };
  const byFile = new Map();
  for (const d of m.defines) {
    if (!d.scope) continue;
    if (!byFile.has(d.key)) byFile.set(d.key, []);
    byFile.get(d.key).push(d);
  }
  const groups = [], shapes = new Map();
  const shp = d => { if (!shapes.has(d)) shapes.set(d, shape(d)); return shapes.get(d); };
  for (const [key, defs] of byFile) {
    const F = m.files.get(key), s = F.s, ls = F.scan.lineStarts;
    // group headers already in the file: "; a .. b" lines
    const covered = new Set();
    const lines = s.split(/\r\n|\n|\r/);
    lines.forEach((L, i) => {
      const g = /^[ \t]*;[ \t]*(\S+) \.\. (\S+?)[ :(]/.exec(L);
      if (!g) return;
      const startLine = i + 1;
      const first = defs.find(d => d.line > startLine);
      if (!first || first.name !== g[1]) return;
      const last = defs.find(d => d.line > startLine && d.name === g[2]);
      if (!last) return;
      for (const d of defs) if (d.line > startLine && d.line <= last.line) covered.add(d);
    });
    const cand = [];
    for (const d of defs) {
      if (covered.has(d)) { leave(d, 'in a group header'); continue; }
      if (hasHeader(d)) { leave(d, 'has a header'); continue; }
      if (d.inDefine >= 0) { leave(d, 'inside another define'); continue; }
      if (!d.closed) { leave(d, 'unclosed'); continue; }
      if (!/^[ \t]*$/.test(s.slice(ls[d.line - 1], d.span[0]))) { leave(d, 'does not start its line'); continue; }
      cand.push(d);
    }
    // families: consecutive in the file's define order
    const order = defs.filter(d => d.inDefine < 0);
    let run = [];
    const flush = () => { if (run.length >= GROUP_MIN) groups.push(run); else todo.push(...run); run = []; };
    for (const d of order) {
      if (!cand.includes(d)) { flush(); continue; }
      if (run.length) {
        const a = run[0];
        if (!run.some(r => r.name === d.name) && a.name.replace(/\d+/g, '#') === d.name.replace(/\d+/g, '#') && shp(a) === shp(d)) { run.push(d); continue; }
        flush();
      }
      run.push(d);
    }
    flush();
    for (const d of cand) if (!order.includes(d)) todo.push(d);
  }
  return { todo, groups, left };
}

// trailing author comment on the define's first line -> { a (start of the whitespace before ';'), b (line end), text } | null
function trailing(s, F, d) {
  const ls = F.scan.lineStarts, lineEnd = d.line < ls.length ? ls[d.line] : s.length;
  const L = s.slice(d.nameSpan[1] + 1, lineEnd).replace(/[\r\n]+$/, '');
  const off = d.nameSpan[1] + 1;
  const c = tokens(L).find(t => t.k === 'C');
  if (!c) return null;
  let a = off + c.a;
  while (a > off && (s[a - 1] === ' ' || s[a - 1] === '\t')) a--;
  const text = c.t.replace(/^;+[ \t]*/, '').replace(/[ \t]+$/, '');
  return { a, b: off + L.length, text };
}

function headerLines(m, d, cache, ind, opt) {
  const what = whatOf(d.body);
  const first = opt.group ? `; ${opt.group[0].name} .. ${opt.group[opt.group.length - 1].name} (${opt.group.length} defines, same shape): ${ascii(what)}`
    : opt.author ? `; ${d.name}: ${opt.author} (makes ${ascii(what)})` : `; ${d.name}: ${ascii(what)}`;
  const out = [first];
  const mm = meanings(m, d, 0, cache);
  for (const p of d.params.named.concat(d.params.positional)) {
    const L = (mm.get(p) || ['[?]']).slice(0, 3);
    out.push(ascii(`;   ${/^\d+$/.test(p) ? '%' + p : p} - ${L.join(', ')}`).slice(0, MAX_LINE));
  }
  let ex = null;
  if (opt.group) {
    const all = opt.group.map(g => example(m, g.name)).filter(Boolean);
    ex = all.sort((a, b) => (/[^\x20-\x7e\t]/.test(a) - /[^\x20-\x7e\t]/.test(b)) || (a.length - b.length) || (a < b ? -1 : 1))[0] || null;
  } else ex = example(m, d.name);
  if (!ex) ex = m.vanilla.called.has(d.name) ? 'none in the mod (called from vanilla files)' : m.dynMatch(d.name) ? 'none literal (built by "' + m.dynMatch(d.name).name + '")' : 'none (not called)';
  out.push(ascii(';   e.g. ' + ex));
  return out.map(x => ind + x);
}

module.exports = {
  id: 'header',
  title: 'header comment above every mod define (name, what it makes, params, example)',
  classify, whatOf, tokens,
  plan(ctx) {
    const m = ctx.model, changes = [], cases = [];
    const { todo, groups } = classify(m);
    const work = new Map();   // key -> [{ d, group }]
    for (const d of todo) { if (!work.has(d.key)) work.set(d.key, []); work.get(d.key).push({ d }); }
    for (const g of groups) { if (!work.has(g[0].key)) work.set(g[0].key, []); work.get(g[0].key).push({ d: g[0], group: g }); }
    const cache = new Map();
    for (const [key, items] of work) {
      const F = m.files.get(key);
      const s0 = ctx.read(F.rel).toString('latin1');
      if (s0 !== F.s) { cases.push({ id: 'header-stale', title: `${F.rel}: model out of date`, detail: 'file changed since the model was built' }); continue; }
      const ends = lineEnds(s0), eol = ends.length && ends.filter(e => e.len === 2).length * 2 < ends.length ? s0.slice(ends[0].pos, ends[0].pos + ends[0].len) : '\r\n';
      const eds = [], rows = [];
      for (const it of items) {
        const d = it.d, ls = F.scan.lineStarts, at = ls[d.line - 1];
        const ind = /^[ \t]*/.exec(s0.slice(at, d.span[0]))[0];
        let author = null;
        if (!it.group) {
          const tr = trailing(s0, F, d);
          if (tr && /[A-Za-z0-9]/.test(tr.text)) { author = tr.text; eds.push({ a: tr.a, b: tr.b, t: '' }); }
        }
        const H = headerLines(m, d, cache, ind, { group: it.group, author });
        eds.push({ a: at, b: at, t: H.join(eol) + eol });
        rows.push({ line: d.line, kind: it.group ? 'group_header' : author ? 'header_moved_comment' : 'header', before: it.group ? `${it.group.length} defines ${d.name} .. ${it.group[it.group.length - 1].name}` : d.name, after: H[0].trim(), note: H.slice(1).map(x => x.trim()).join(' | ') });
      }
      eds.sort((x, y) => (y.a - x.a) || (y.b - x.b));
      let s = s0;
      for (const e of eds) s = s.slice(0, e.a) + e.t + s.slice(e.b);
      changes.push({ file: F.rel, after: Buffer.from(s, 'latin1'), create: false, rows: rows.sort((x, y) => x.line - y.line) });
    }
    return { changes, cases };
  },
};
