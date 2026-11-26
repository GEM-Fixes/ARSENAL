// sdlx: STRICT SDL lexer + reader (engine emulation) →{lexer,reader,macros,strings-tags}
// lib/sdl.js is the lenient .lng tokenizer; this is for def/ext/set/mdl/mi/inc/info... (cp1251 bytes, latin1 strings here).
//
//   const r = read(buf, { file, key, open, defines?, onError })
//     buf     Buffer of the root file; file = display name; key = virtual key (lowercase, '/'), used for relative include
//     preInclude: [key] files the loader includes implicitly before the root (stuff dir `.presets`)
//     open(key, fromKey) → { buf, file, key } | null   include resolver (key already normalized by resolveInclude)
//     onError(file, line, code, msg, via)               never throws; codes below
//   → { root, defines, overlaps }   overlaps = [{file,line,via,word,param}] SDL-56: a macro/include call site whose body uses `%word`,
//     the call passes `param` (a strict prefix of word) but not `word`, and some call in the file passes `word` (so `%word` becomes <param>rest)
//   root = BLOCK { k:'BLOCK', tag:null, items, file, line }
//   node kinds (all carry file,line,via; via = call-site chain {file,line,via} when produced by macro/include):
//     BLOCK  { tag, disabled(tag has '#'), collapsed('+'), items, endLine }   tag = text after first '#'; '' for plain {x}
//     MOD    { name, not, items }                                             (mod "name" ...) content kept inline
//     IDENT  { text }   STRING { text(raw), value(escapes decoded) }   INTEGER { text, value }   FLOAT { text, value, expr? }
//   the first item of a block is its name by convention (consumer decides). bytes are 1:1 in strings (latin1).
// error codes: BOM_UTF16 BAD_BYTE HASH_COMMENT INVALID_CHAR LEADING_DOT IDENT_SPLIT STRAY_OPERATOR NUMBER_GLUED NUMBER_EXP0
//   NEG_HEX NUMBER_SUFFIX INT_RANGE STR_NEWLINE STR_EOF TAG_SWALLOWS BLOCK_UNCLOSED BLOCK_END_STRAY PAREN_STRAY MOD_UNCLOSED
//   CONTROL_BAD DEFINE_UNCLOSED MACRO_UNDEFINED PARAM_SPACE PARAM_PAREN PARAM_BAD ARGS_CASE UNREPLACED_PARAM PARAM_UNBALANCED
//   INCLUDE_MISSING INCLUDE_CYCLE MACRO_CYCLE MOD_NESTED MOD_NAME ARITH_BAD
// Author: Imperator_Aug (ARSENAL, ia-a1c554ae)
const { bomKind } = require('./enc');

const MAX_DEPTH = 64;
// token factory (module level: no per-lex closure). key order k,text,file,line,via,...extra
function tokP(p, k, text, extra) {
  p.lastEnd = p.i; p.lastKind = k;
  const t = { k, text, file: p.file, line: p.line, via: p.via };
  return extra === undefined ? t : Object.assign(t, extra);
}
const isDigit = c => c >= 48 && c <= 57;
const isLetter = c => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c >= 0xC0;
const isWord = c => isLetter(c) || isDigit(c);
const isHex = c => isDigit(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);

// engine ConvertEscapes: sequential whole-string replace in this order
function convertEscapes(s) {
  if (s.indexOf('\\') < 0) return s;
  return s.split('\\\\').join('\\').split('\\"').join('"').split('\\n').join('\n').split('\\r').join('\r').split('\\t').join('\t');
}

// normalize an include path like resource name; → { kind:'fs'|'user'|'virtual', key }
function resolveInclude(p, fromKey) {
  let s = p.toLowerCase().replace(/\\/g, '/');
  if (s.startsWith('//')) return { kind: 'fs', key: s.slice(2) };
  if (s.startsWith('@')) return { kind: 'user', key: s.slice(1) };
  if (s.startsWith('/')) s = 'resource/' + s.slice(1);
  else {
    const base = (fromKey || 'resource/x').split('/'); base.pop();
    s = base.concat(s.split('/')).join('/');
  }
  const out = [];
  for (const seg of s.split('/')) { if (seg === '..') out.pop(); else if (seg !== '.' && seg !== '') out.push(seg); }
  return { kind: 'virtual', key: out.join('/') };
}

const progress = require('./progress');
function read(buf, opt) {
  if (progress.on) progress.file(opt && (opt.key || opt.file), buf && buf.length);   // names the file to a parent tool before the parse (lib/progress.js)
  const defines = opt.defines || new Map();
  const errSeen = new Set();
  const passed = new Set(), cands = [];   // SDL-56: param names passed by any call / `%word` that only a shorter passed name prefixes
  const err = (file, line, code, msg, via) => {
    const k = file + ':' + line + ':' + code + ':' + msg;
    if (errSeen.has(k)) return; errSeen.add(k);
    opt.onError(file, line, code, msg, via);
  };
  const stack = [];                       // parsers: root file, includes, macro bodies
  let inMod = false;

  function mkParser(src, o) { return { src, i: 0, line: o.line || 1, file: o.file, key: o.key || null, macro: o.macro || null, via: o.via || null, lastEnd: -1, lastKind: null }; }
  function open(b, o) {
    const bk = bomKind(b);
    if (bk && bk !== 'utf8') { err(o.file, 1, 'BOM_UTF16', `${bk} BOM: engine aborts ("resave file in UTF8 encoding")`, o.via); return null; }
    return mkParser(b.toString('latin1', bk === 'utf8' ? 3 : 0), o);
  }
  const loc = p => ({ file: p.file, line: p.line, via: p.via });
  const E = (p, line, code, msg) => err(p.file, line, code, msg, p.via);

  // ---- lexer: one token from parser p. kinds: IDENT STRING INTEGER FLOAT OPERATOR INVALID BLOCK_START BLOCK_END LIST_START LIST_END EOF
  function lex(p) {
    const s = p.src, n = s.length;
    for (;;) {
      const c = s.charCodeAt(p.i);
      if (p.i >= n) return { k: 'EOF', file: p.file, line: p.line, via: p.via };
      if (c === 10) { p.line++; p.i++; } else if (c === 32 || c === 9 || c === 13 || c === 61) p.i++;
      else if (c === 59) { while (p.i < n && s.charCodeAt(p.i) !== 10 && s.charCodeAt(p.i) !== 13) p.i++; }
      else break;
    }
    const start = p.i, c = s.charCodeAt(start), adj = start === p.lastEnd;
    const prevIdent = adj && p.lastKind === 'IDENT';
    if (isLetter(c) || c === 37) {   // hot path: no closure/Object.assign (same shape as tok)
      let j = start + 1; while (j < n && isWord(s.charCodeAt(j))) j++;
      p.i = j; p.lastEnd = j; p.lastKind = 'IDENT';
      return { k: 'IDENT', text: s.slice(start, j), file: p.file, line: p.line, via: p.via };
    }
    if (c === 40) { p.i++; return tokP(p, 'LIST_START', '('); }
    if (c === 41) { p.i++; return tokP(p, 'LIST_END', ')'); }
    if (c === 125) { p.i++; return tokP(p, 'BLOCK_END', '}'); }
    if (c === 123) {
      p.i++;
      let tag = '';
      if (s.charCodeAt(p.i) === 35) {
        const t0 = p.i; p.i++;
        while (p.i < n) { const d = s.charCodeAt(p.i); if (d === 35 || d === 45 || d === 43 || isWord(d)) p.i++; else break; }
        tag = s.slice(t0 + 1, p.i);
      }
      p.lastEnd = p.i; p.lastKind = 'BLOCK_START';   // = tokP(p, 'BLOCK_START', '{', { tag }), built in one literal (hot path)
      return { k: 'BLOCK_START', text: '{', file: p.file, line: p.line, via: p.via, tag };
    }
    if (c === 34) {
      let j = start + 1, line0 = p.line;
      for (;;) {
        if (j >= n) { E(p, line0, 'STR_EOF', 'end of file inside string'); p.i = j; return tokP(p, 'EOF', ''); }
        const d = s.charCodeAt(j);
        if (d === 92) { if (s.charCodeAt(j + 1) === 10) p.line++; j += 2; continue; }
        if (d === 13 || d === 10) { E(p, p.line, 'STR_NEWLINE', 'string not closed before line end (strings never span lines)'); p.i = j; return tokP(p, 'INVALID', '"'); }
        if (d === 34) break;
        j++;
      }
      p.i = j + 1;
      const raw = s.slice(start + 1, j);
      p.lastEnd = p.i; p.lastKind = 'STRING';   // = tokP(p, 'STRING', raw, { value }) with line = line0, in one literal (hot path)
      return { k: 'STRING', text: raw, file: p.file, line: line0, via: p.via, value: convertEscapes(raw) };
    }
    const sign = c === 45 || c === 43;
    if (isDigit(c) || (sign && isDigit(s.charCodeAt(start + 1)))) {
      let j = start + (sign ? 1 : 0), kind = 'INTEGER', hex = false;
      if (!sign && c === 48 && (s.charCodeAt(j + 1) | 32) === 120 && isHex(s.charCodeAt(j + 2))) {
        hex = true; j += 2; while (isHex(s.charCodeAt(j))) j++;
      } else {
        const d0 = j;
        while (isDigit(s.charCodeAt(j))) j++;
        const zero = j - d0 === 1 && s.charCodeAt(d0) === 48;
        let frac = false;
        if (s.charCodeAt(j) === 46) { kind = 'FLOAT'; frac = true; j++; while (isDigit(s.charCodeAt(j))) j++; }
        if ((s.charCodeAt(j) | 32) === 101 && (frac || !zero)) {
          let k2 = j + 1; if (s.charCodeAt(k2) === 43 || s.charCodeAt(k2) === 45) k2++;
          kind = 'FLOAT'; j = k2; while (isDigit(s.charCodeAt(j))) j++;
        }
      }
      let text = s.slice(start, j), value;
      if (hex) { const h = text.slice(2); value = parseInt(h, 16); if (h.replace(/^0+/, '').length > 8) E(p, p.line, 'INT_RANGE', `hex ${text} exceeds 32 bits: engine wraps`); text = String(value); }
      else if (kind === 'INTEGER') { value = Number(text); if (value > 2147483647 || value < -2147483648) E(p, p.line, 'INT_RANGE', `integer ${text} outside int32: engine wraps/clamps (atoi)`); }
      else value = Number(text);
      p.i = j;
      p.lastEnd = j; p.lastKind = kind;   // = tokP(p, kind, text, { value }), in one literal (hot path)
      const t = { k: kind, text, file: p.file, line: p.line, via: p.via, value };
      const nx = s.charCodeAt(j);
      if (isLetter(nx) && !p.noGlue) {
        const w = s.slice(j, j + 8).match(/^[A-Za-z0-9_]*/)[0];
        if (/^-0$/.test(text) && w[0] === 'x') E(p, p.line, 'NEG_HEX', `negative hex not lexable: "${text}${w}" = INTEGER -0 + ident ${w}`);
        else if (text === '0' && (w[0] | 0) === 0 && /^[eE]\d*/.test(w)) E(p, p.line, 'NUMBER_EXP0', `"${text}${w}" lexes INTEGER 0 + ident ${w} (exponent needs nonzero first digit or fraction)`);
        else if (/^[fF]$/.test(w)) E(p, p.line, 'NUMBER_SUFFIX', `"${text}${w}": no 'f' suffix; lexes number + ident ${w}`);
        else E(p, p.line, 'NUMBER_GLUED', `"${text}${w}" lexes number ${text} + ident ${w}`);
      }
      if (prevIdent && sign) E(p, p.line, 'IDENT_SPLIT', `signed number "${text}" glued to preceding identifier (identifiers end at '-'; paths need strings)`);
      return t;
    }
    if (c === 45 || c === 43 || c === 42 || c === 47) {
      p.i++;
      const nx = s.charCodeAt(p.i);
      return tokP(p, 'OPERATOR', s[start], { split: prevIdent, dotNext: nx === 46 });
    }
    // INVALID char (consumed here to keep going)
    p.i++;
    const ch = s[start];
    let code = 'INVALID_CHAR', msg = `invalid character '${ch}' (0x${c.toString(16)})`;
    if (c === 35) { code = 'HASH_COMMENT'; msg = "'#' is not a comment (only ';')"; }
    else if (c >= 0x80 && c <= 0xBF) { code = 'BAD_BYTE'; msg = `byte 0x${c.toString(16)} invalid outside strings/comments (UTF-8 text?)`; }
    else if (c === 46 && isDigit(s.charCodeAt(p.i))) { code = 'LEADING_DOT'; msg = "number with leading '.' (write 0.5)"; }
    else if (prevIdent && (c === 46 || c === 58)) { code = 'IDENT_SPLIT'; msg = `'${ch}' ends the identifier (paths/punctuation need strings)`; }
    E(p, p.line, code, msg);
    return tokP(p, 'INVALID', ch);
  }

  // token from the parser stack: pops finished include/macro parsers
  function lexTop() {
    for (;;) {
      const p = stack[stack.length - 1];
      const t = lex(p);
      if (t.k === 'EOF' && stack.length > 1) { stack.pop(); continue; }
      return t;
    }
  }

  // skip to the ')' matching an already-consumed '(' (lexed, so strings/comments are respected)
  function skipClose(p) {
    for (let d = 1; ;) {
      const t = lex(p);
      if (t.k === 'LIST_START') d++; else if (t.k === 'LIST_END') { if (--d === 0) return true; } else if (t.k === 'EOF') return false;
    }
  }

  // ReadParameters: raw. → Map name→value | null (error reported, list skipped)
  function readParams(p, what) {
    const params = new Map();
    for (;;) {
      const t = lex(p);
      if (t.k === 'LIST_END') return params;
      if (t.k === 'EOF') { E(p, t.line, 'PARAM_BAD', `end of file in ${what} parameter list`); return null; }
      if (t.k !== 'IDENT') { E(p, t.line, 'PARAM_BAD', `parameter name expected in ${what}, got ${t.k} "${t.text}"`); skipClose(p); return null; }
      if (t.text === 'args' && p.src.charCodeAt(p.i) !== 40) {   // real data: `args(1.0)` = NAMED param "args"
        let idx = 0; p.noGlue = true;
        for (;;) {
          const a = lex(p);
          if (a.k === 'LIST_END') { p.noGlue = false; return params; }
          if (a.k === 'STRING') params.set(String(idx++), '"' + a.text + '"');
          else if (a.k === 'IDENT' || a.k === 'INTEGER' || a.k === 'FLOAT') params.set(String(idx++), a.text);
          else if (a.k === 'LIST_START') {   // real data: args (* %0 6) = balanced raw group, one value
            const st = p.i - 1;
            if (!skipClose(p)) { E(p, a.line, 'PARAM_BAD', "')' required after args"); return null; }
            params.set(String(idx++), p.src.slice(st, p.i));
          }
          else { E(p, a.line, 'PARAM_BAD', a.k === 'EOF' ? "')' required after args" : `unexpected ${a.k} "${a.text}" in args list`); if (a.k !== 'EOF') skipClose(p); return null; }
        }
      }
      if (t.text !== 'args' && t.text.toLowerCase() === 'args') E(p, t.line, 'ARGS_CASE', `"${t.text}" is a parameter NAME (only lowercase 'args' is positional)`);
      if (p.src.charCodeAt(p.i) !== 40) {
        const sp = /^[ \t]*\(/.test(p.src.slice(p.i, p.i + 80));
        E(p, t.line, sp ? 'PARAM_SPACE' : 'PARAM_PAREN', `"'(' required" after parameter name "${t.text}"` + (sp ? ' (no space allowed: p(x))' : ''));
        skipClose(p); return null;
      }
      const e = p.src.indexOf(')', p.i + 1);
      if (e < 0) { E(p, t.line, 'PARAM_BAD', `"')' required" for parameter ${t.text}`); p.i = p.src.length; return null; }
      const val = p.src.slice(p.i + 1, e);
      for (const ch of val) if (ch === '\n') p.line++;
      if (val.includes('(')) E(p, t.line, 'PARAM_UNBALANCED', `parameter ${t.text} value contains '(' but ends at the FIRST ')': "${val.slice(0, 30)}"`);
      params.set(t.text, val); passed.add(t.text);
      p.i = e + 1; p.lastEnd = -1;
    }
  }

  function subst(text, params, site) {
    if (site) for (const m of text.matchAll(/%(\w+)/g)) {
      const w = m[1]; if (params.has(w)) continue;
      let pre = null; for (const n of params.keys()) if (w.length > n.length && w.startsWith(n) && (!pre || n.length > pre.length)) pre = n;
      if (pre) cands.push({ file: site.file, line: site.line, via: site.via, word: w, param: pre });
    }
    for (const name of [...params.keys()].sort().reverse()) {
      const from = '%' + name, to = params.get(name);
      let pos = 0, out = '';
      for (;;) {
        const f = text.indexOf(from, pos);
        if (f < 0) break;
        out += text.slice(pos, f) + to; pos = f + from.length;
      }
      text = out + text.slice(pos);
    }
    return text;
  }

  function guard(p, name, key) {
    if (stack.length >= MAX_DEPTH) { E(p, p.line, 'MACRO_CYCLE', `parser stack > ${MAX_DEPTH} deep (no engine guard; recursion kills the process)`); return false; }
    return true;
  }

  const KNOWN_MODS = /^(mp|coop|game:.+|dl_.+)$/;

  // after '(' consumed from top parser. → token to return (arith / MOD_START) or null (pushed parser / nothing)
  function handleList() {
    const p = stack[stack.length - 1];
    const t = lexTop(), cp = stack[stack.length - 1];
    if (t.k === 'STRING') {
      const name = t.value, def = defines.get(name);
      const params = readParams(cp, `macro "${name}"`);
      if (!def) { err(t.file, t.line, 'MACRO_UNDEFINED', `define not found: "${name}" (defines are per top-level file, after the definition)`, t.via); return null; }
      if (!params) return null;
      if (stack.some(x => x.macro === name)) { err(t.file, t.line, 'MACRO_CYCLE', `macro "${name}" calls itself (no engine guard; process dies)`, t.via); return null; }
      if (!guard(cp)) return null;
      stack.push(mkParser(subst(def.text, params, t), { file: def.file, line: def.line, key: null, macro: name, via: { file: t.file, line: t.line, via: t.via } }));
      return null;
    }
    if (t.k === 'OPERATOR') return arith(t);
    if (t.k !== 'IDENT') {
      err(t.file, t.line, 'CONTROL_BAD', `"Identifier expected!" after '(' (got ${t.k})`, t.via);
      if (t.k !== 'LIST_END') skipClose(cp);
      return null;
    }
    const w = t.text.toLowerCase();
    if (w === 'include') {
      const pt = lexTop();
      if (pt.k !== 'STRING') { err(pt.file, pt.line, 'CONTROL_BAD', '"String expected!" after include', pt.via); if (pt.k !== 'LIST_END') skipClose(stack[stack.length - 1]); return null; }
      const ip = stack[stack.length - 1];
      const params = readParams(ip, `include "${pt.value}"`);
      if (!params) return null;
      let from = null;
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i].key) { from = stack[i].key; break; }
      const r = resolveInclude(pt.value, from);
      if (stack.some(x => x.key && x.key === r.key)) { err(pt.file, pt.line, 'INCLUDE_CYCLE', `include of "${pt.value}" while it is already being read (no engine guard; process dies)`, pt.via); return null; }
      if (!guard(ip)) return null;
      const f = opt.open(r, from);
      if (!f) { err(pt.file, pt.line, 'INCLUDE_MISSING', `include "${pt.value}" not found (resolved ${r.kind}:${r.key})`, pt.via); return null; }
      const np = open(f.buf, { file: f.file, key: f.key, via: { file: pt.file, line: pt.line, via: pt.via } });
      if (!np) return null;
      np.src = subst(np.src, params, pt);
      stack.push(np);
      return null;
    }
    if (w === 'define') {
      const nt = lexTop(), dp = stack[stack.length - 1];
      if (nt.k !== 'STRING') { err(nt.file, nt.line, 'CONTROL_BAD', '"String expected!" after define', nt.via); if (nt.k !== 'LIST_END') skipClose(dp); return null; }
      const bodyStart = dp.i, bodyLine = dp.line;
      for (let d = 1; ;) {
        const bt = lex(dp);
        if (bt.k === 'LIST_START') d++;
        else if (bt.k === 'LIST_END') { if (--d === 0) { defines.set(nt.value, { text: dp.src.slice(bodyStart, dp.i - 1), file: dp.file, line: bodyLine }); return null; } }
        else if (bt.k === 'EOF' || bt.k === 'INVALID') { err(bt.file, bt.line, 'DEFINE_UNCLOSED', `"Block terminator expected!" in define "${nt.value}" (${bt.k === 'EOF' ? 'end of file' : 'invalid token'})`, bt.via); if (bt.k === 'EOF') return null; }
      }
    }
    if (w === 'mod') {
      let nt = lexTop(), not = false;
      if (nt.k === 'IDENT' && nt.text === 'not') { not = true; nt = lexTop(); }
      if (nt.k !== 'STRING') { err(nt.file, nt.line, 'CONTROL_BAD', '"String expected!" after mod', nt.via); if (nt.k !== 'LIST_END') skipClose(stack[stack.length - 1]); return null; }
      if (inMod) err(t.file, t.line, 'MOD_NESTED', 'Nested mods not supported (use sibling (mod ...) forms)', t.via);
      inMod = true;
      if (!KNOWN_MODS.test(nt.value)) err(nt.file, nt.line, 'MOD_NAME', `unknown mod name "${nt.value}": engine sets only mp, coop, game:<map>, dl_<difficulty> (exact, case-sensitive)`, nt.via);
      return { k: 'MOD_START', name: nt.value, not, file: t.file, line: t.line, via: t.via };
    }
    err(t.file, t.line, 'CONTROL_BAD', `"Invalid control block!" ("${t.text}"; only include, define, mod, "macro", arithmetic)`, t.via);
    skipClose(stack[stack.length - 1]);
    return null;
  }

  function arith(opTok) {
    const vals = [];
    for (;;) {
      const t = lexTop();
      if (t.k === 'LIST_END') break;
      if (t.k === 'INTEGER' || t.k === 'FLOAT') vals.push(t.value);
      else if (t.k === 'LIST_START') {
        const r = handleList();
        if (r && r.k === 'FLOAT') vals.push(r.value);
        else { err(t.file, t.line, 'ARITH_BAD', 'arithmetic operand must be a number or nested arithmetic', t.via); }
      } else {
        err(t.file, t.line, 'ARITH_BAD', `arithmetic operand expected, got ${t.k} "${t.text}"`, t.via);
        if (t.k === 'EOF') break;
        if (t.k === 'IDENT' && t.text[0] === '%') err(t.file, t.line, 'UNREPLACED_PARAM', `unreplaced parameter ${t.text}`, t.via);
      }
    }
    if (!vals.length) vals.push(0);
    let acc = vals[0];
    for (const v of vals.slice(1)) acc = opTok.text === '+' ? acc + v : opTok.text === '-' ? acc - v : opTok.text === '*' ? acc * v : acc / v;
    return { k: 'FLOAT', text: String(acc), value: acc, expr: true, file: opTok.file, line: opTok.line, via: opTok.via };
  }

  // Next(): directives resolved; LIST_END returned (stray unless it closes a MOD)
  function next() {
    for (;;) {
      const t = lexTop();
      if (t.k === 'LIST_START') { const r = handleList(); if (r) return r; continue; }
      return t;
    }
  }

  // ---- tree builder
  const root = { k: 'BLOCK', tag: null, items: [], file: opt.file, line: 1, via: null };
  const open0 = open(buf, { file: opt.file, key: opt.key });
  const overlaps = () => { const seen = new Set(), out = []; for (const c of cands) { const k = c.file + ":" + c.line + ":" + c.word; if (passed.has(c.word) && !seen.has(k)) { seen.add(k); out.push(c); } } return out; };
  if (!open0) return { root, defines, overlaps: [] };
  stack.push(open0);
  for (const pk of (opt.preInclude || []).slice().reverse()) {      // loader-implicit includes (e.g. stuff dir .presets), read first
    const f = opt.open({ kind: 'virtual', key: pk }, null);
    const np = f && open(f.buf, { file: f.file, key: f.key });
    if (np) stack.push(np);
  }
  const cont = [root];
  const top = () => cont[cont.length - 1];
  let prevTok = null;
  for (;;) {
    const t = next();
    const cur = top();
    if (t.k === 'EOF') break;
    if (t.k === 'BLOCK_START') {
      if (t.tag !== '' && /[A-Za-z0-9]/.test(t.tag)) err(t.file, t.line, 'TAG_SWALLOWS', `"{#${t.tag}" is block tag "${t.tag}" and swallows the block name (write "{# ${t.tag}" / "{##" for disabled)`, t.via);
      const b = { k: 'BLOCK', tag: t.tag, disabled: t.tag.includes('#'), collapsed: t.tag.includes('+'), items: [], file: t.file, line: t.line, via: t.via, endLine: 0 };
      cur.items.push(b); cont.push(b);
    } else if (t.k === 'BLOCK_END') {
      while (cont.length > 1 && top().k === 'MOD') { const m = cont.pop(); err(m.file, m.line, 'MOD_UNCLOSED', "(mod ...) not closed before '}'", m.via); inMod = false; }
      if (cont.length === 1) err(t.file, t.line, 'BLOCK_END_STRAY', "'}' without open block (engine: End of SDL file expected / mis-nesting)", t.via);
      else { cont.pop().endLine = t.line; }
    } else if (t.k === 'MOD_START') {
      const m = { k: 'MOD', name: t.name, not: t.not, items: [], file: t.file, line: t.line, via: t.via };
      cur.items.push(m); cont.push(m);
    } else if (t.k === 'LIST_END') {
      inMod = false;
      if (cur.k === 'MOD') cont.pop();
      else err(t.file, t.line, 'PAREN_STRAY', "stray ')' silently dropped by the engine (hides mis-nesting)", t.via);
    } else if (t.k === 'OPERATOR') {
      if (!t.dotNext) err(t.file, t.line, t.split ? 'IDENT_SPLIT' : 'STRAY_OPERATOR', t.split ? `'${t.text}' ends the preceding identifier (paths/punctuation need strings)` : `operator '${t.text}' outside arithmetic (unexpected token)`, t.via);
    } else if (t.k === 'INVALID') { /* reported by lexer */ }
    else {
      if (t.k === 'IDENT' && t.text[0] === '%') err(t.file, t.line, 'UNREPLACED_PARAM', `unreplaced parameter ${t.text} stays an identifier (no such macro/include parameter)`, t.via);
      cur.items.push(t);
    }
    prevTok = t;
  }
  while (cont.length > 1) {
    const b = cont.pop();
    err(b.file, b.line, b.k === 'MOD' ? 'MOD_UNCLOSED' : 'BLOCK_UNCLOSED', b.k === 'MOD' ? '(mod ...) never closed' : '"Block terminator expected!" block never closed', b.via);
  }
  return { root, defines, overlaps: overlaps() };
}

module.exports = { read, resolveInclude, convertEscapes };
