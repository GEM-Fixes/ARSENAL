// arsenal-gui registry: which fields a GUI route handler reads from its body and its URL (node tools/mcp/gui.js --gen).
// A static scan of the handler's own source text (fn.toString()). Most handlers are thin wrappers (`wrap(look)`, `(u, b, ctx) =>
// fn(ctx, b || {})`), so a call that passes the body or the URL on whole is followed: the callee is looked up in the handler's own
// scopes through node's built-in inspector (closure and module variables, no code of the GUI is run), and its source is scanned the
// same way with the parameter that takes the value. Nothing is called; a callee that cannot be found marks the route `partial`.
//   scanRoutes([{key, fn}]) -> Map key -> {body: [{name, type?}], query: [{name}], read: 'full'|'partial'|'none', writesMark: bool, notes: []}
//   scanText(src, roles) -> the same for one source text (no following): used for the core routes of gui.js and by the tests
// Author: Imperator_Aug (ARSENAL, ia-ae74dcaf)
'use strict';

const MAX_DEPTH = 6, MAX_FNS = 80;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ref = x => '(?<![\\w$.])' + esc(x) + '(?![\\w$])';
const IDENT = /^[A-Za-z_$][\w$]*$/;
// callees that take the value but read no field a caller could set
const SKIP = /^(JSON\.stringify|JSON\.parse|String|Boolean|Number|Array\.isArray|Array\.from|Object\.(freeze|keys|entries|values|assign|prototype\.hasOwnProperty\.call)|console\.\w+|Promise\.resolve|[\w$.]*\.(push|has|get|set|includes|indexOf|add|then|catch|test)|encodeURIComponent|require|Error|Buffer\.from)$/;

// source without comments; strings and regex literals stay (field names are string literals), template text stays
function strip(src) {
  let out = '', i = 0; const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; out += ' '; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1; while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; }
      out += src.slice(i, j + 1); i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
}

// split at top-level commas
function splitTop(s) {
  const out = []; let depth = 0, cur = '', q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === '\\') { cur += s[++i] || ''; } else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; cur += c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    if (c === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += c;
  }
  if (cur.trim() !== '' || out.length) out.push(cur);
  return out.map(x => x.trim());
}
function matchParen(s, open) {
  const o = s[open], cl = o === '(' ? ')' : o === '{' ? '}' : ']'; let depth = 0, q = null;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === o) depth++; else if (c === cl) { if (--depth === 0) return i; }
  }
  return -1;
}

// parameters of a function source -> [{name}|{rest}|{pattern: [keys]}|{}]; null when the head is not understood
function params(src) {
  let s = src.replace(/^\s*(?:async\s+)?/, '');
  let list = null;
  const one = /^([A-Za-z_$][\w$]*)\s*=>/.exec(s);
  if (one) list = one[1];
  else {
    const p = s.indexOf('(');
    if (p < 0 || !/^(?:function\b\s*\*?\s*[\w$]*\s*|[\w$]*\s*|get\s+[\w$]+\s*|\*\s*[\w$]+\s*)$/.test(s.slice(0, p))) return null;
    const e = matchParen(s, p); if (e < 0) return null;
    list = s.slice(p + 1, e);
  }
  return splitTop(list).filter(x => x !== '').map(x => {
    if (x.startsWith('...')) return { rest: x.slice(3).trim() };
    if (x.startsWith('{')) { const e = matchParen(x, 0); return { pattern: patternKeys(x.slice(1, e < 0 ? x.length : e)) }; }
    const m = /^([A-Za-z_$][\w$]*)/.exec(x); return m ? { name: m[1] } : {};
  });
}
// keys of an object pattern body: `a, b: c, d = 1, ...rest` -> [{key:'a', as:'a'}, {key:'b', as:'c'}, {key:'d', as:'d'}]
function patternKeys(inner) {
  const out = [];
  for (const part of splitTop(inner)) {
    if (!part || part.startsWith('...')) continue;
    const m = /^(?:([A-Za-z_$][\w$]*)|'([^']+)'|"([^"]+)")\s*(?::\s*([A-Za-z_$][\w$]*))?/.exec(part);
    if (m) out.push({ key: m[1] || m[2] || m[3], as: m[4] || m[1] || null });
  }
  return out;
}

const TYPE_HINTS = [
  [x => new RegExp('typeof\\s+' + x + '\\s*[!=]==\\s*[\'"]string[\'"]|String\\(\\s*' + x + '\\b'), 'string'],
  [x => new RegExp('Array\\.isArray\\(\\s*' + x + '\\s*\\)'), 'list'],
  [x => new RegExp('typeof\\s+' + x + '\\s*[!=]==\\s*[\'"]number[\'"]|(?:Number|parseInt|parseFloat)\\(\\s*' + x + '\\b|\\+' + x + '\\b'), 'number'],
  [x => new RegExp(x + '\\s*[!=]==\\s*(?:true|false)\\b|typeof\\s+' + x + '\\s*[!=]==\\s*[\'"]boolean[\'"]|!!\\s*' + x + '(?![\\w$.])'), 'true/false'],
  [x => new RegExp('typeof\\s+' + x + '\\s*[!=]==\\s*[\'"]object[\'"]'), 'object'],
];

// one source text. roles = {body: [exprs], url: [exprs]} (expressions that hold the value: a name, `a[1]`).
// -> {body: Map name->type|'', query: Set, calls: [{callee, argIndex, role, spread}], dynamic: bool, patterns: {...}}
function scanText(src, roles) {
  const s = strip(src);
  const R = { body: new Map(), query: new Map(), calls: [], dynamic: false, writesMark: /\.writes\s*=\s*true\b/.test(s) };
  const names = { body: (roles.body || []).slice(), url: (roles.url || []).slice(), q: (roles.q || []).slice(), sp: [] };
  // aliases, to a fixed point (three rounds are plenty)
  for (let round = 0; round < 3; round++) {
    for (const b of names.body.slice()) {
      const B = ref(b);
      const re = new RegExp('(?:(?:const|let|var)\\s+)?([A-Za-z_$][\\w$]*)\\s*=\\s*\\(?\\s*(?:' + B + '\\s*(?:\\|\\||\\?\\?)\\s*\\{\\s*\\}|' + B + '\\s*&&\\s*typeof\\s+' + B + '\\s*===\\s*[\'"]object[\'"]\\s*(?:&&\\s*!Array\\.isArray\\(' + B + '\\)\\s*)?\\?\\s*' + B + '\\s*:\\s*\\{\\s*\\}|Object\\.assign\\(\\s*\\{\\s*\\}\\s*,\\s*' + B + '\\s*(?:\\|\\|\\s*\\{\\s*\\}\\s*)?\\)|' + B + ')\\s*\\)?\\s*[;,\\n]', 'g');
      let m; while ((m = re.exec(s))) if (!names.body.includes(m[1])) names.body.push(m[1]);
    }
    for (const u of names.url.slice()) {
      const U = ref(u);
      let re = new RegExp('(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:' + U + '\\s*&&\\s*)?' + U + '\\.searchParams\\s*[;,\\n]', 'g'), m;
      while ((m = re.exec(s))) if (!names.sp.includes(m[1])) names.sp.push(m[1]);
      re = new RegExp('(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*Object\\.fromEntries\\(\\s*' + U + '\\.searchParams', 'g');
      while ((m = re.exec(s))) if (!names.q.includes(m[1])) names.q.push(m[1]);
      re = new RegExp('(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*[A-Za-z_$][\\w$.]*\\(\\s*' + U + '\\s*\\)\\s*[;,\\n]', 'g');   // const q = Q(url)
      while ((m = re.exec(s))) if (!names.q.includes(m[1])) names.q.push(m[1]);
    }
  }
  const typeOf = x => { for (const [mk, t] of TYPE_HINTS) if (mk(x).test(s)) return t; return ''; };
  const addBody = (k, expr) => { if (!k || k === 'constructor' || k === 'hasOwnProperty') return; const t = expr ? typeOf(expr) : ''; if (!R.body.has(k) || (!R.body.get(k) && t)) R.body.set(k, t); };
  const addQ = k => { if (k && !R.query.has(k)) R.query.set(k, ''); };
  for (const b of names.body) {
    const B = ref(b);
    let re = new RegExp('(?:' + B + '|\\(\\s*' + B + '\\s*(?:\\|\\||\\?\\?)\\s*\\{\\s*\\}\\s*\\))\\s*\\??\\.\\s*([A-Za-z_$][\\w$]*)', 'g'), m;
    while ((m = re.exec(s))) addBody(m[1], esc(b) + '\\??\\.' + esc(m[1]));
    re = new RegExp(B + '\\s*\\[\\s*([\'"])([^\'"]+)\\1\\s*\\]', 'g');
    while ((m = re.exec(s))) addBody(m[2]);
    // const { a, b: c } = body [|| {}]
    re = new RegExp('\\{([^{}=]*(?:=[^{},]*)?(?:,[^{}]*)?)\\}\\s*=\\s*\\(?\\s*' + B + '(?![\\w$.(\\[])', 'g');
    while ((m = re.exec(s))) for (const k of patternKeys(m[1])) addBody(k.key, k.as ? esc(k.as) : null);
    // body used in a way a text scan cannot read: body[k], Object.keys(body), for..in, JSON.stringify(body), spread
    if (new RegExp(B + '\\s*\\[\\s*[A-Za-z_$]|Object\\.(?:keys|entries|values)\\(\\s*' + B + '\\s*\\)|\\bin\\s+' + B + '\\s*\\)|\\.\\.\\.\\s*' + B + '(?![\\w$.])').test(s)) R.dynamic = true;
  }
  for (const u of names.url) {
    const U = ref(u);
    let re = new RegExp(U + '\\s*\\??\\.\\s*searchParams\\s*\\??\\.\\s*(?:get|getAll|has)\\(\\s*([\'"])([^\'"]+)\\1', 'g'), m;
    while ((m = re.exec(s))) addQ(m[2]);
    re = new RegExp('[A-Za-z_$][\\w$.]*\\(\\s*' + U + '\\s*,\\s*([\'"])([A-Za-z_][\\w.-]{0,40})\\1\\s*[,)]', 'g');   // q(u, 'draft')
    while ((m = re.exec(s))) addQ(m[2]);
    re = new RegExp('[A-Za-z_$][\\w$.]*\\(\\s*' + U + '\\s*\\)\\s*\\.\\s*([A-Za-z_$][\\w$]*)', 'g');   // Q(url).mod
    while ((m = re.exec(s))) addQ(m[1]);
  }
  for (const p of names.sp) { const re = new RegExp(ref(p) + '\\s*\\??\\.\\s*(?:get|getAll|has)\\(\\s*([\'"])([^\'"]+)\\1', 'g'); let m; while ((m = re.exec(s))) addQ(m[2]); }
  for (const q of names.q) {
    let re = new RegExp(ref(q) + '\\s*\\??\\.\\s*([A-Za-z_$][\\w$]*)', 'g'), m; while ((m = re.exec(s))) if (!/^(get|has|getAll|forEach|keys|entries|values|toString)$/.test(m[1])) addQ(m[1]);
    re = new RegExp('\\{([^{}]*)\\}\\s*=\\s*' + ref(q) + '(?![\\w$.(\\[])', 'g'); while ((m = re.exec(s))) for (const k of patternKeys(m[1])) addQ(k.key);
  }
  // calls that pass the value on whole: f(.., body, ..), f(.., body || {}, ..), f(...a), f.apply(this, arguments)
  const pass = (expr, role) => {
    const re = new RegExp('([(,])\\s*(\\.\\.\\.\\s*)?' + ref(expr) + '\\s*(?:(?:\\|\\||\\?\\?)\\s*(?:\\{\\s*\\}|null|\'\'|""))?\\s*(?=[,)])', 'g'); let m;
    while ((m = re.exec(s))) {
      // the open paren of the call this argument sits in, and its index
      let i = m.index, depth = 0, idx = 0, q = null;
      if (s[i] === ',') {
        for (i = i - 1; i >= 0; i--) {
          const c = s[i];
          if (c === ')' || c === ']' || c === '}') depth++;
          else if (c === '(' || c === '[' || c === '{') { if (depth === 0) break; depth--; }
          else if (c === ',' && depth === 0) idx++;
        }
        idx++;
        if (i < 0 || s[i] !== '(') continue;
      }
      // a parameter list, not a call: `function f(body) {`, `(url, body) => ..`, `name(body) {`
      { const e = matchParen(s, i), after = e < 0 ? '' : s.slice(e + 1, e + 12).trimStart(); if (e < 0 || after[0] === '{' || after.startsWith('=>')) continue; }
      const head = /([A-Za-z_$][\w$]*(?:\s*\??\.\s*[A-Za-z_$][\w$]*)*)\s*$/.exec(s.slice(Math.max(0, i - 200), i));
      if (!head) { R.calls.push({ callee: null, role }); continue; }
      const callee = head[1].replace(/\s+/g, '').replace(/\?\./g, '.');
      if (/^(if|for|while|switch|return|typeof|catch|function|await|new|async|void|delete|yield|throw|else|do|in|of)$/.test(callee)) continue;
      R.calls.push({ callee, argIndex: idx, role, spread: !!m[2] });
      void q;
    }
  };
  for (const b of names.body) pass(b, 'body');
  for (const u of names.url) pass(u, 'url');
  if (/(?<![\w$.])arguments(?![\w$])/.test(s)) pass('arguments', 'all');
  return R;
}

// a function declared inside src under this name -> its source text, or null
function findLocal(src, name) {
  const s = strip(src), N = esc(name);
  let m = new RegExp('(?:async\\s+)?function\\s*\\*?\\s*' + N + '\\s*\\(').exec(s);
  if (m && m.index > 0) {
    const p = s.indexOf('(', m.index), e = matchParen(s, p), b = e < 0 ? -1 : s.indexOf('{', e), be = b < 0 ? -1 : matchParen(s, b);
    if (be > 0) return s.slice(m.index, be + 1);
  }
  m = new RegExp('(?:const|let|var)\\s+' + N + '\\s*=\\s*((?:async\\s+)?(?:function\\b[^(]*)?(?:\\(|[A-Za-z_$][\\w$]*\\s*=>))').exec(s);
  if (!m) return null;
  const st = m.index + m[0].length - m[1].length;
  let i = st + m[1].length;
  if (m[1].endsWith('(')) { const e = matchParen(s, i - 1); if (e < 0) return null; i = e + 1; i += /^\s*(=>)?\s*/.exec(s.slice(i))[0].length; }
  else i += /^\s*/.exec(s.slice(i))[0].length;
  if (s[i] === '{') { const be = matchParen(s, i); return be < 0 ? null : s.slice(st, be + 1); }
  // an expression body: to the end of the statement at depth 0
  let depth = 0, j = i, q = null;
  for (; j < s.length; j++) {
    const c = s[j];
    if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; }
    else if ((c === ';' || c === ',' || c === '\n') && depth === 0) break;
  }
  return s.slice(st, j);
}

// ---- following calls through the inspector
function openSession() {
  const inspector = require('inspector'), S = new inspector.Session(); S.connect();
  const post = (method, p) => { let out, err, got = false; S.post(method, p || {}, (e, r) => { got = true; err = e; out = r; }); if (!got) throw new Error('inspector: no synchronous answer to ' + method); if (err) throw new Error('inspector ' + method + ': ' + (err.message || JSON.stringify(err))); return out; };
  return { post, close() { try { post('Runtime.releaseObjectGroup', { objectGroup: 'mcpgen' }); } catch (e) { /* closing */ } S.disconnect(); } };
}

function scanRoutes(list) {
  const I = openSession(), out = new Map();
  const G = '__arsenalMcpGen' + process.pid;
  globalThis[G] = list.map(x => x.fn);
  const props = id => I.post('Runtime.getProperties', { objectId: id, ownProperties: true, generatePreview: false });
  // a function object -> {src, loc, scopes: [objectId]}
  const info = id => {
    const p = props(id), ip = p.internalProperties || [];
    const locP = ip.find(x => x.name === '[[FunctionLocation]]'), sc = ip.find(x => x.name === '[[Scopes]]');
    const loc = locP && locP.value && locP.value.value ? locP.value.value.scriptId + ':' + locP.value.value.lineNumber + ':' + locP.value.value.columnNumber : null;
    let scopes = [];
    if (sc && sc.value && sc.value.objectId) scopes = (props(sc.value.objectId).result || []).filter(x => x.value && x.value.objectId && !/^Global/.test(x.value.description || '')).map(x => x.value.objectId);
    // a bound function: follow its target
    const tgt = ip.find(x => x.name === '[[TargetFunction]]');
    return { loc, scopes, target: tgt && tgt.value ? tgt.value : null };
  };
  const scopeVars = new Map();   // scope objectId -> Map name -> RemoteObject
  const lookup = (scopes, name) => {
    for (const sid of scopes) {
      let m = scopeVars.get(sid);
      if (!m) { m = new Map(); for (const x of props(sid).result || []) if (x.value) m.set(x.name, x.value); scopeVars.set(sid, m); }
      if (m.has(name)) return m.get(name);
    }
    return null;
  };
  const resolve = (scopes, chain) => {
    const parts = chain.split('.');
    if (parts[0] === 'this') return null;
    let cur = lookup(scopes, parts[0]);
    for (let i = 1; cur && i < parts.length; i++) {
      // f.apply / f.call / f.bind: the function itself
      if (cur.type === 'function' && /^(apply|call|bind)$/.test(parts[i]) && i === parts.length - 1) return { fn: cur, via: parts[i] };
      if (!cur.objectId) return null;
      const p = (props(cur.objectId).result || []).find(x => x.name === parts[i]);
      cur = p && p.value ? p.value : (p && p.get && p.get.objectId ? null : null);
    }
    return cur && cur.type === 'function' ? { fn: cur, via: null } : null;
  };
  try {
    list.forEach((item, n) => {
      const r = { body: new Map(), query: new Map(), read: 'full', writesMark: false, notes: [], fns: 0 };
      const seen = new Set();
      const miss = c => { if (r.read === 'full') r.read = 'partial'; const note = 'callee not found: ' + c; if (r.notes.length < 6 && !r.notes.includes(note)) r.notes.push(note); };
      // fnObj: RemoteObject of a function; roleAt: Map argument index -> 'body'|'url'
      const visit = (fnObj, roleAt, depth) => {
        const src = fnObj.description || '';
        if (/\{\s*\[native code\]\s*\}\s*$/.test(src)) {
          const inf0 = info(fnObj.objectId);
          if (inf0.target && inf0.target.type === 'function') return visit(inf0.target, roleAt, depth);
          return;
        }
        const inf = info(fnObj.objectId);
        walk(src, inf.scopes, inf.loc, roleAt, depth);
      };
      // a callee name -> {fn} (found in the scopes), {local: source text} (declared inside src) or null
      const find = (src, scopes, chain) => {
        if (IDENT.test(chain)) { const l = findLocal(src, chain); if (l && l !== src) return { local: l }; }
        return resolve(scopes, chain);
      };
      const go = (t, src, scopes, loc, next, depth) => { if (t.local) walk(t.local, scopes, loc + '>' + t.local.length + ':' + t.local.slice(0, 40), next, depth + 1, src); else visit(t.fn, next, depth + 1); };
      const walk = (src, scopes, loc, roleAt, depth, outer) => {
        const key = loc + '|' + [...roleAt].map(x => x.join('=')).sort().join(',');
        if (seen.has(key)) return; seen.add(key);
        if (++r.fns > MAX_FNS || depth > MAX_DEPTH) { r.read = 'partial'; r.notes.push('call chain cut at ' + (depth > MAX_DEPTH ? 'depth ' + MAX_DEPTH : MAX_FNS + ' functions')); return; }
        const ps = params(src), roles = { body: [], url: [] };
        if (!ps) { r.read = 'partial'; r.notes.push('a function head was not understood'); return; }
        for (const [idx, role] of roleAt) {
          const p = ps[idx];
          if (p && p.name) roles[role].push(p.name);
          else if (p && p.pattern && role === 'body') { for (const k of p.pattern) if (!r.body.has(k.key)) r.body.set(k.key, ''); }
          else if (!p) {
            const rest = ps.findIndex(x => x.rest);
            if (rest >= 0 && rest <= idx) roles[role].push(ps[rest].rest + '[' + (idx - rest) + ']');
            else roles[role].push('arguments[' + idx + ']');
          }
        }
        const restP = ps.find(x => x.rest), restAt = ps.findIndex(x => x.rest);
        const T = scanText(src, roles), home = outer || src;
        for (const [k, t] of T.body) if (!r.body.has(k) || (!r.body.get(k) && t)) r.body.set(k, t);
        for (const [k] of T.query) if (!r.query.has(k)) r.query.set(k, '');
        if (T.writesMark) r.writesMark = true;
        if (T.dynamic) { if (r.read === 'full') r.read = 'partial'; if (!r.notes.includes('the body is also read by computed key')) r.notes.push('the body is also read by computed key'); }
        // spread of the rest parameter: every role goes on, shifted by where the spread sits
        if (restP) {
          const re = new RegExp('([A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*)\\s*\\(([^()]*)\\.\\.\\.\\s*' + esc(restP.rest) + '\\s*\\)', 'g'), s = strip(src); let m;
          while ((m = re.exec(s))) {
            if (/^(async|function|if|for|while|switch|return|await|new|catch)$/.test(m[1])) continue;
            const t = find(home, scopes, m[1]); if (!t) { miss(m[1]); continue; }
            const lead = splitTop(m[2]).filter(x => x !== '').length, next = new Map();
            for (const [idx, role] of roleAt) if (idx >= restAt) next.set(idx - restAt + lead, role);
            if (next.size) go(t, home, scopes, loc, next, depth);
          }
        }
        for (const c of T.calls) {
          if (c.role === 'all') {
            // f.apply(this, arguments) | f(...arguments): the same roles at the same places
            if (!c.callee || /^(Array|Object|console|JSON|Math|String|Number)\b/.test(c.callee)) continue;
            const t = find(home, scopes, c.callee); if (!t) { miss(c.callee); continue; }
            if (t.via === 'apply' || c.spread) go(t, home, scopes, loc, new Map(roleAt), depth);
            continue;
          }
          if (!c.callee) { if (r.read === 'full') r.read = 'partial'; continue; }
          if (SKIP.test(c.callee)) continue;
          const t = find(home, scopes, c.callee); if (!t) { miss(c.callee); continue; }
          let idx = c.argIndex; if (t.via === 'call' || t.via === 'bind') idx -= 1; else if (t.via === 'apply') continue;
          if (idx < 0) continue;
          go(t, home, scopes, loc, new Map([[idx, c.role]]), depth);
        }
      };
      try {
        const o = I.post('Runtime.evaluate', { expression: 'globalThis[' + JSON.stringify(G) + '][' + n + ']', objectGroup: 'mcpgen' }).result;
        if (!o || o.type !== 'function') { r.read = 'none'; r.notes.push('not a function'); }
        else visit(o, new Map([[0, 'url'], [1, 'body']]), 0);
      } catch (e) { r.read = 'none'; r.notes.push('scan failed: ' + e.message); }
      out.set(item.key, r);
    });
  } finally { delete globalThis[G]; I.close(); }
  return out;
}

module.exports = { scanRoutes, scanText, params, strip, findLocal, matchParen };
