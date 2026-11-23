// ide/intel/check: findings for one editor buffer (part check of the ARSENAL Editor; contract tools/ide/README.md).
//   check(doc, ictx) -> [finding]   doc = { key, text, file? } (text = editor text, \n line ends), ictx = { gameDir?, mods?, folder? }
//     finding = { line, col, len, exact, code, msg, sev:'error'|'warn'|'info', source:'syntax'|'keys'|'mi'|'lng' }
//     sources: lib/sdlx.read on the buffer (logic of the retired lsp lintText; UNREPLACED_PARAM and ARITH_BAD on a "%param"
//     dropped). Includes resolve through the layered view (ictx.folder first, then ictx.vfs or a view of ictx.gameDir):
//     INCLUDE_MISSING and MACRO_UNDEFINED are kept only with a game view (a macro also not after a missing/unknown include, nor in
//     a fragment .inc/.ext); a lone buffer drops both. sdllint rawchecks.scan, unknown string escapes (WARN_ESCAPE),
//     keylint.lintBuffer (only with ictx.gameDir; a throw becomes one info WARN_KEYLINT_FAILED), milint/mi.js lintMi for .mi.
//     .lng: lnglint exports no text-taking function (only run(folder)), so no lng findings yet. refcheck and milint.check are
//     whole-index scripts with no text entry point: not run here.
//     text over 1 MB (ictx.maxChars overrides): one info CHECK_SKIPPED_BIG, nothing else.
//     de-duplicated (line + code + msg), sorted by line, cut to 500 (+1 info CHECK_CAPPED), then located and sorted by line, col.
//     Never throws (CRASH on line 1).
//   locate(f, lineText) -> { col, len, exact }   col = character index + 1 (a tab is one character)
//   kindOf(key|filename) -> 'sdl'|'lng'|'po'|'lua'|'log'|'text'   ('po' = .po / .pot, the GoH gettext text: intel/po.js poCheck,
//     findings with source 'lng'; GHLOC-01, GHLOC-06)
//   ictx.exe / ictx.game (intel/game.js) name the game: the include view built here is that game's (fixes viewOf), and keylint
//   gets exe when a game is named (MoW:AS2: no as64/core in its view; GoH: keylint takes vocab.goh.json for a GoH gameDir itself);
//   a .mi under GoH (named, or a GoH gameDir) goes to milint lintMi with game 'goh' (its GoH mission vocabulary).
// Author: Imperator_Aug (ARSENAL, ia-42cb0773)
const fs = require('fs'), path = require('path');
const sdlset = require('../../lib/sdlset'), sdlx = require('../../lib/sdlx'), sdl = require('../../lib/sdl');

const DROP = new Set(['INCLUDE_MISSING', 'MACRO_UNDEFINED', 'UNREPLACED_PARAM']);
const WARN = new Set(['PARAM_UNBALANCED', 'INT_RANGE', 'PAREN_STRAY']);   // as sdllint
const CAP = 500, BIG = 1 << 20;   // text over BIG chars: not checked (one CHECK_SKIPPED_BIG info); ictx.maxChars overrides

// unicode text -> cp1251-ish bytes, one byte per character (latin1 below 256, cyrillic mapped, else '?'): offsets never shift
function toBuf(text) {
  const b = Buffer.alloc(text.length);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    b[i] = c < 256 ? c : c >= 0x410 && c <= 0x44F ? c - 0x410 + 0xC0 : 63;
  }
  return b;
}

const baseOf = s => { const t = String(s || '').replace(/\\/g, '/'); return t.slice(t.lastIndexOf('/') + 1); };
const extOf = s => { const b = baseOf(s), i = b.lastIndexOf('.'); return i < 0 ? '' : b.slice(i + 1).toLowerCase(); };
function kindOf(name) {
  const n = String(name || '').replace(/\\/g, '/').toLowerCase(), e = extOf(n);
  if (e === 'lng') return 'lng';
  if (e === 'po' || e === 'pot') return 'po';
  if (e === 'lua') return 'lua';
  if (e === 'log') return 'log';
  if (n.startsWith('resource/')) return sdlset.isSdl(n) ? 'sdl' : 'text';
  if (/(^|\/)resource\/set\/stuff\//.test(n)) return 'sdl';
  return e && sdlset.SDL_EXT.has(e) ? 'sdl' : 'text';
}
const sevOf = code => code.startsWith('WARN_') ? 'warn' : 'error';

// ---- locate: column of a finding on its line
function toks(lineText) { try { return sdl.tokenize([lineText]); } catch (e) { return []; } }
// char positions of c outside strings and ; comments
function charsAt(L, ch) {
  const out = [];
  for (let i = 0; i < L.length; i++) {
    const c = L[i];
    if (c === ';') break;
    if (c === '"') { let j = i + 1; while (j < L.length && L[j] !== '"') j += L[j] === '\\' ? 2 : 1; i = j; continue; }
    if (c === ch) out.push(i);
  }
  return out;
}
function names(msg) {   // quoted names and {name} in a message, in order
  const out = [], re = /"([^"\n]+)"|'([^'\n]+)'|\{([^{}\s]+)\}/g;
  let m;
  while ((m = re.exec(String(msg || '')))) out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
  return out;
}
const strEnd = (L, t) => {   // index after the closing quote (or end of line) of the string token t
  let j = t.col; while (j < L.length && L[j] !== '"') j += L[j] === '\\' ? 2 : 1;
  return Math.min(L.length, j < L.length ? j + 1 : L.length);
};
const tokLen = (L, t) => t.t === 's' ? strEnd(L, t) - (t.col - 1) : t.t === 'w' ? t.v.length : 1;
const at = (col, len) => ({ col, len: Math.max(0, len), exact: true });
function fallback(L) {
  const m = /\S/.exec(L);
  if (!m) return { col: 1, len: 0, exact: false };
  return { col: m.index + 1, len: L.replace(/\s+$/, '').length - m.index, exact: false };
}
const BRACE = /^(WARN_)?(BLOCK_UNCLOSED|BLOCK_END_STRAY|BRACES|MOD_UNCLOSED)$/;
const STRING = /^(WARN_)?(STR_NEWLINE|STR_EOF|STRING_UNCLOSED|STR_ESCAPE_BS_N)$/;
const INCL = /INCLUDE|_REF$|REF_|MISSING_FILE|FILE_MISSING|PATH/;
const KEY = /UNKNOWN_KEY|KEY_UNKNOWN|KEY_CASE|KEY_FATAL|KEY_REPEAT|DEAD_KEY|MI_TRIGGER_KEY|HELPER_UNKNOWN/;
function locate(f, lineText) {
  const L = String(lineText == null ? '' : lineText).replace(/\r$/, '');
  try {
    const code = String(f && f.code || '').replace(/^WARN_/, ''), msg = String(f && f.msg || '');
    const T = () => toks(L);
    if (BRACE.test(f.code)) {
      if (/UNCLOSED/.test(code)) {
        if (code === 'MOD_UNCLOSED') { const i = L.indexOf('('); if (i >= 0) return at(i + 1, 1); }
        const st = []; for (const t of T()) { if (t.t === '{') st.push(t); else if (t.t === '}' && st.length) st.pop(); }
        if (st.length) return at(st[0].col, 1);
        const o = T().find(t => t.t === '{'); if (o) return at(o.col, 1);
      } else {
        let d = 0, last = null;
        for (const t of T()) { if (t.t === '{') d++; else if (t.t === '}') { last = t; if (--d < 0) return at(t.col, 1); } }
        if (last) return at(last.col, 1);
      }
    }
    if (code === 'PAREN_STRAY') { const p = charsAt(L, ')'); if (p.length) return at(p[p.length - 1] + 1, 1); }
    if (code === 'TAG_SWALLOWS') { const m = /\{#[A-Za-z0-9_]*/.exec(L); if (m) return at(m.index + 1, m[0].length); }
    if (code === 'ESCAPE') {   // the escape sequence itself
      const n = names(msg).find(x => /^\\./.test(x));
      for (const t of T()) if (t.t === 's') {
        const e = strEnd(L, t);
        for (let j = t.col; j < e - 1; j++) if (L[j] === '\\') { if (!n || L.slice(j, j + 2) === n) return at(j + 1, 2); j++; }
      }
    }
    if (STRING.test(f.code)) {
      const ss = T().filter(t => t.t === 's');
      const s = /NEWLINE|EOF|UNCLOSED/.test(code) ? ss[ss.length - 1] : ss.find(t => /\\\\n/.test(L.slice(t.col, strEnd(L, t)))) || ss[0];
      if (s) return at(s.col, (/NEWLINE|EOF|UNCLOSED/.test(code) ? L.replace(/\s+$/, '').length : strEnd(L, s)) - (s.col - 1));
    }
    const nm = names(msg);
    if (INCL.test(code)) {
      const ss = T().filter(t => t.t === 's');
      const s = ss.find(t => nm.some(n => n === t.v || n.toLowerCase().endsWith(t.v.toLowerCase().replace(/\\/g, '/')) && t.v)) || ss[0];
      if (s) return at(s.col, tokLen(L, s));
    }
    if (KEY.test(code)) {
      const ts = T();
      for (const n of nm) for (let i = 0; i < ts.length; i++) {
        const t = ts[i];
        if ((t.t === 'w' || t.t === 's') && t.v === n && (i === 0 || ts[i - 1].t === '{')) return at(t.col, tokLen(L, t));
      }
    }
    if (nm.length) {
      const ts = T().filter(t => t.t === 'w' || t.t === 's');
      for (const pass of [0, 1]) for (const n of nm) {
        const t = ts.find(x => pass ? x.v.toLowerCase() === n.toLowerCase() : x.v === n);
        if (t) return at(t.col, tokLen(L, t));
      }
    }
    const nums = msg.match(/-?\b(0x[0-9a-f]+|\d[\d.e+-]*)\b/gi);   // a number the message names (INT_RANGE ...)
    if (nums) for (const v of nums) { const t = T().find(x => x.t === 'w' && x.v === v); if (t) return at(t.col, t.v.length); }
  } catch (e) { /* fall through */ }
  return fallback(L);
}

// ---- sources
// include resolver through the layered view (open mod folder first, then ictx.vfs / the game). null view and no folder = every
// include is unknown: INCLUDE_MISSING / MACRO_UNDEFINED are dropped (lone buffer). With a folder but no game a vanilla include
// cannot be confirmed either, so both stay dropped; the folder still feeds defines from the mod's own include files.
const isFragment = k => /\.(inc|ext)$/.test(k) || k.startsWith('resource/set/multiplayer/units/');   // as sdllint
function resolver(ictx) {
  if (!ictx || !(ictx.gameDir || ictx.folder || 'vfs' in ictx)) return null;
  const L = require('./fixes')._layer;
  let v;
  const view = () => (v === undefined ? (v = L.viewOf(ictx)) : v);
  const st = { unsure: false, game: false };
  const read = key => L.readKey(ictx, key, view);
  const open = r => {
    if (r.kind === 'fs') {
      if (ictx.gameDir) { try { const p = path.join(String(ictx.gameDir), r.key); if (fs.statSync(p).isFile()) return { buf: fs.readFileSync(p), file: r.key, key: r.key }; } catch (e) { /* missing */ } }
      st.unsure = true; return { buf: Buffer.alloc(0), file: r.key, key: r.key };
    }
    if (r.kind !== 'virtual') { st.unsure = true; return { buf: Buffer.alloc(0), file: r.key, key: r.key }; }   // @user: not ours to see
    const b = read(r.key);
    return b ? { buf: b, file: r.key, key: r.key } : null;
  };
  //  ReadStuff includes the directory's .presets into every stuff file (as sdlset.preInclude)
  const pre = key => {
    if (!key.startsWith('resource/set/stuff/') || key.endsWith('/.presets') || extOf(key) === 'fsm') return [];
    const pk = key.slice(0, key.lastIndexOf('/') + 1) + '.presets';
    return read(pk) ? [pk] : [];
  };
  return { open, pre, st, hasGame: () => !!view() };
}
function syntax(key, text, buf, out, ictx) {
  let root = null;
  const R = resolver(ictx), held = [];
  try {
    root = sdlx.read(buf, { file: key, key, open: R ? R.open : () => null, preInclude: R ? R.pre(key) : [], onError: (file, line, code, msg, via) => {
      if (via || file !== key) return;
      if (code === 'INCLUDE_MISSING' || code === 'MACRO_UNDEFINED') { if (R) held.push({ line, code, msg }); return; }
      if (DROP.has(code)) return;
      if (code === 'ARITH_BAD' && /"%/.test(msg)) return;   // macro template param (.inc): includer supplies the value
      const c = (WARN.has(code) ? 'WARN_' : '') + code;
      out.push({ line, code: c, msg, sev: sevOf(c), source: 'syntax' });
    } }).root;
  } catch (e) { out.push({ line: 1, code: 'CRASH', msg: 'syntax: ' + e.message, sev: 'error', source: 'syntax' }); }
  // confirmed only through a game view: an include that resolves in the mod or the game is not reported (open found it);
  // a macro is kept only when no include was unknown or missing before it and the file is not a fragment its includer completes
  if (R && held.length && R.hasGame()) {
    const miss = held.filter(f => f.code === 'INCLUDE_MISSING');
    const firstMiss = miss.length ? Math.min(...miss.map(f => f.line)) : Infinity;
    for (const f of held) {
      if (f.code === 'MACRO_UNDEFINED' && (R.st.unsure || isFragment(key) || f.line >= firstMiss)) continue;
      out.push({ line: f.line, code: f.code, msg: f.msg, sev: 'error', source: 'syntax' });
    }
  }
  try {
    for (const x of require('../../sdllint/rawchecks').scan(key, buf)) out.push({ line: x.line, code: x.code, msg: x.msg, sev: sevOf(x.code), source: 'syntax' });
  } catch (e) { /* raw checks are extras */ }
  return root;
}
// unknown escapes inside strings: the engine decodes only \\ \" \n \r \t and keeps any other backslash as written.
// strings that look like a path (no spaces and a file extension, ..\, a leading $ or two backslashes) are skipped: vanilla
// writes Windows paths that way ("..\x\y.mdl", "$\entourage\wood")
const PATHLIKE = /^(?=[^ "]*\\)(?=.*(\.[A-Za-z0-9]{1,5}$|\.\.\\|\\$|^\$|\\.*\\))[^ "]+$/;
function escapes(lines, out) {
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (L.indexOf('\\') < 0) continue;
    for (const t of toks(L)) {
      if (t.t !== 's') continue;
      const e = strEnd(L, t), ce = e > t.col && L[e - 1] === '"' ? e - 1 : e;   // content end (before the closing quote)
      if (PATHLIKE.test(L.slice(t.col, ce))) continue;   // windows path ("..\x\y.mdl"): backslash kept is what the author meant
      for (let j = t.col; j < ce; j++) if (L[j] === '\\') {
        const c = L[j + 1];
        if (j + 1 < ce && '\\"nrt'.indexOf(c) < 0)
          out.push({ line: i + 1, code: 'WARN_ESCAPE', msg: `unknown escape "\\${c}": the engine keeps the backslash as written (known: \\" \\\\ \\n \\r \\t)`, sev: 'warn', source: 'syntax' });
        j++;
      }
    }
  }
}
function keys(key, text, ictx, out) {
  try {
    const { lintBuffer } = require('../../keylint/keylint');
    const G = require('./game').gameOf(ictx), named = G.exe ? { exe: G.exe } : {};   // nothing named: the argument object as before
    for (const f of lintBuffer(Object.assign({ key, text, gameDir: ictx.gameDir, mods: ictx.mods && ictx.mods.length ? ictx.mods : undefined, folder: ictx.folder || undefined }, named))) {
      if (f.code === 'CRASH') { out.push({ line: 1, code: 'WARN_KEYLINT_FAILED', msg: 'key check failed: ' + f.msg, sev: 'info', source: 'keys' }); continue; }
      out.push({ line: f.line, code: f.code, msg: f.msg, sev: f.sev || sevOf(f.code), source: 'keys' });
    }
  } catch (e) { out.push({ line: 1, code: 'WARN_KEYLINT_FAILED', msg: 'key check failed: ' + e.message, sev: 'info', source: 'keys' }); }
}
// light tree as milint.js lite(): {name, vals, kids, line, file, disabled}; MOD blocks flattened
function lite(b) {
  const o = { name: null, vals: [], kids: [], line: b.line, file: b.file, disabled: !!b.disabled };
  const walk = items => {
    for (const it of items) {
      if (it.k === 'BLOCK') o.kids.push(lite(it));
      else if (it.k === 'MOD') walk(it.items);
      else if (o.name === null && !o.named && (it.k === 'IDENT' || it.k === 'STRING')) { o.name = it.k === 'STRING' ? it.value : it.text; o.named = true; }
      else o.vals.push({ k: it.k, text: it.text, value: it.k === 'STRING' ? it.value : it.value !== undefined ? it.value : it.text });
    }
  };
  walk(b.items);
  return o;
}
// goh: lintMi is given game 'goh' (milint/mi.js: micommands.json + micommands-goh.json, GoH rules GHMIS-29/30/32/33, GHMAP-03),
// the same call milint.js makes under --exe goh; the findings keep their severity. AS2 games: no game word (the call as before).
function mi(key, root, out, goh) {
  try {
    const { lintMi } = require('../../milint/mi');
    const push = info => (k, line, code, msg) => { if (k === key || k == null) out.push({ line, code, msg, sev: info ? 'info' : sevOf(code), source: 'mi' }); };
    const t = lite(root);
    for (const top of t.kids) if (String(top.name || '').toLowerCase() === 'mission')
      lintMi(Object.assign({ k: key, top, add: push(false), hint: push(true), maxPlayers: null }, goh ? { game: 'goh' } : {}));
  } catch (e) { out.push({ line: 1, code: 'WARN_MILINT_FAILED', msg: 'mission check failed: ' + e.message, sev: 'info', source: 'mi' }); }
}

function check(doc, ictx) {
  ictx = ictx || {};
  let lines = [''];
  try {
    doc = doc || {};
    let text = String(doc.text == null ? '' : doc.text);
    const max = ictx.maxChars == null ? BIG : Number(ictx.maxChars);
    if (text.length > max) return [{ line: 1, col: 1, len: 0, exact: false, code: 'CHECK_SKIPPED_BIG', sev: 'info', source: 'syntax', msg: 'File is over 1 MB: checks are off for it (use Check whole mod).' }];
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    text = text.replace(/\r\n/g, '\n');
    lines = text.split('\n');
    const name = doc.key || doc.file || '', kind = kindOf(name);
    const key = doc.key ? String(doc.key).replace(/\\/g, '/').toLowerCase() : 'resource/' + baseOf(name).toLowerCase();
    const raw = sink(lines.length);
    if (kind === 'sdl') {
      const root = syntax(key, text, toBuf(text), raw, ictx);
      escapes(lines, raw);
      if (doc.key && ictx.gameDir && sdlset.isSdl(key)) keys(key, text, ictx, raw);
      if (extOf(key) === 'mi' && root) mi(key, root, raw, require('./game').gameOf(ictx).kind === 'goh');
    } else if (kind === 'lua') {
      for (const f of require('./lua').luaCheck(text)) raw.push({ line: f.line, code: f.code, msg: f.msg, sev: 'error', source: 'syntax' });
    } else if (kind === 'po') {
      for (const f of require('./po').poCheck(text)) raw.push({ line: f.line, code: f.code, msg: f.msg, sev: f.sev, source: 'lng' });
    } else if (kind === 'lng') {
      for (const f of require('../../lnglint/lnglint').lintBuffer(doc.key || doc.file || name, text))
        raw.push({ line: f.line, code: f.code, msg: f.msg, sev: f.info ? 'info' : sevOf(f.code), source: 'lng' });
    }
    return finish(raw, lines);
  } catch (e) {
    return [{ line: 1, col: 1, len: 0, exact: false, code: 'CRASH', msg: String(e && e.message || e), sev: 'error', source: 'syntax' }];
  }
}
// sort by line (stable: same-line findings keep their source order), de-duplicate (line + code + msg), keep the first `keep`
// -> { kept:[raw], dropped:n }   (seen: built only for a line with a second finding)
function firstUnique(list, keep) {
  list.sort((a, b) => a.line - b.line);
  const kept = [];
  let dropped = 0, cur = -1, first = null, seen = null;
  for (const f of list) {
    const k = f.code + '|' + f.msg;
    if (f.line !== cur) { cur = f.line; first = k; seen = null; }
    else {
      if (!seen) seen = new Set([first]);
      if (seen.has(k)) continue;
      seen.add(k);
    }
    if (kept.length >= keep) dropped++; else kept.push(f);
  }
  return { kept, dropped };
}
// raw finding list that stays small: past 4 x CAP entries it keeps the first CAP by line and from then on only counts findings
// on later lines (a buffer of 500k unclosed braces gives 500k raw findings: none of them is kept alive). The count of those
// is not de-duplicated, so CHECK_CAPPED's number can be a little high.
function sink(nLines) {
  const a = [], LIM = CAP * 4;
  let thr = Infinity;
  a.extra = 0;
  a.push = function (f) {
    f.line = Math.min(Math.max(1, Number(f.line) || 1), nLines);
    f.msg = String(f.msg);
    if (f.line > thr) { a.extra++; return a.length; }
    Array.prototype.push.call(a, f);
    if (a.length > LIM) {
      const r = firstUnique(a.splice(0, a.length), CAP);
      a.extra += r.dropped;
      for (const x of r.kept) Array.prototype.push.call(a, x);
      thr = r.kept[r.kept.length - 1].line;
    }
    return a.length;
  };
  return a;
}
// de-duplicate, sort by line, cut to CAP, then locate only the kept ones and sort by line, col
function finish(raw, lines) {
  const r = firstUnique(raw.slice(), CAP), cut = r.dropped + (raw.extra || 0);
  const out = r.kept.map(f => ({ line: f.line, col: 1, len: 0, exact: false, code: f.code, msg: f.msg, sev: f.sev, source: f.source }));
  for (const g of out) Object.assign(g, locate(g, lines[g.line - 1]));
  out.sort((a, b) => a.line - b.line || a.col - b.col);
  if (cut) out.push({ line: out[out.length - 1].line, col: 1, len: 0, exact: false, code: 'CHECK_CAPPED', msg: `${cut} more findings not shown (limit ${CAP})`, sev: 'info', source: 'syntax' });
  return out;
}

module.exports = { check, locate, kindOf, toBuf };
