// ide lua check: structure errors of a Lua 5.1 text that stop the whole file from loading, found without running it:
// a string or long comment that never ends, brackets that do not pair, and blocks (function / if / do / repeat) without their
// `end` or `until`. It does not check names, calls or types. One pass over the text; never throws.
//   luaCheck(text) -> [{ line, code, msg }]   codes: LUA_STRING_OPEN, LUA_COMMENT_OPEN, LUA_BRACKET, LUA_BLOCK_OPEN, LUA_END_EXTRA
// Author: Imperator_Aug (ARSENAL, ia-b9c2b1e5)
const OPEN = { '(': ')', '[': ']', '{': '}' }, CLOSE = { ')': '(', ']': '[', '}': '{' };
const MAX = 60;

function luaCheck(text) {
  const out = [], s = String(text == null ? '' : text), n = s.length;
  const add = (line, code, msg) => { if (out.length < MAX) out.push({ line, code, msg }); };
  const br = [], bl = [];   // open brackets, open blocks: { v, line }
  let i = 0, line = 1;
  // long bracket at i ("[[", "[=[" ...) -> level, or -1
  const longAt = p => { if (s[p] !== '[') return -1; let q = p + 1; while (s[q] === '=') q++; return s[q] === '[' ? q - p - 1 : -1; };
  // skip a long string/comment that opens at p with the given level -> index after its end, or -1 when it never ends
  const skipLong = (p, lvl) => {
    const close = ']' + '='.repeat(lvl) + ']', e = s.indexOf(close, p + lvl + 2);
    const end = e < 0 ? n : e + close.length;
    for (let k = p; k < end; k++) if (s[k] === '\n') line++;
    return e < 0 ? -1 : end;
  };
  while (i < n) {
    const c = s[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '-' && s[i + 1] === '-') {
      const lvl = longAt(i + 2), at = line;
      if (lvl >= 0) { const e = skipLong(i + 2, lvl); if (e < 0) { add(at, 'LUA_COMMENT_OPEN', 'This long comment never ends: "]' + '='.repeat(lvl) + ']" is missing.'); break; } i = e; continue; }
      while (i < n && s[i] !== '\n') i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const at = line; let k = i + 1, ok = false;
      while (k < n) {
        if (s[k] === '\\') { if (s[k + 1] === '\n') line++; k += 2; continue; }
        if (s[k] === '\n') break;
        if (s[k] === c) { ok = true; break; }
        k++;
      }
      if (!ok) add(at, 'LUA_STRING_OPEN', 'This text is not closed: the ' + c + ' at the end is missing.');
      i = ok ? k + 1 : k;
      continue;
    }
    if (c === '[') {
      const lvl = longAt(i), at = line;
      if (lvl >= 0) { const e = skipLong(i, lvl); if (e < 0) { add(at, 'LUA_STRING_OPEN', 'This long text never ends: "]' + '='.repeat(lvl) + ']" is missing.'); break; } i = e; continue; }
    }
    if (OPEN[c]) { br.push({ v: c, line }); i++; continue; }
    if (CLOSE[c]) {
      const top = br[br.length - 1];
      if (!top) add(line, 'LUA_BRACKET', '"' + c + '" has no "' + CLOSE[c] + '" before it.');
      else if (top.v !== CLOSE[c]) { add(line, 'LUA_BRACKET', '"' + c + '" closes the "' + top.v + '" opened on line ' + top.line + ': "' + OPEN[top.v] + '" was expected.'); br.pop(); if (br.length && br[br.length - 1].v === CLOSE[c]) br.pop(); }
      else br.pop();
      i++; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let k = i + 1; while (k < n && /[A-Za-z0-9_]/.test(s[k])) k++;
      const w = s.slice(i, k), top = bl[bl.length - 1];
      if (w === 'function' || w === 'if' || w === 'do' || w === 'repeat') bl.push({ v: w, line });
      else if (w === 'end') {
        if (!top) add(line, 'LUA_END_EXTRA', '"end" closes nothing: there is no function, if or do open here.');
        else if (top.v === 'repeat') { add(line, 'LUA_END_EXTRA', '"end" where "until" was expected: the "repeat" on line ' + top.line + ' is still open.'); bl.pop(); }
        else bl.pop();
      } else if (w === 'until') {
        if (!top || top.v !== 'repeat') add(line, 'LUA_END_EXTRA', '"until" without a "repeat" open before it.');
        else bl.pop();
      } else if (w === 'elseif' || w === 'else') {
        if (!top || top.v !== 'if') add(line, 'LUA_END_EXTRA', '"' + w + '" without an "if" open before it.');
      }
      i = k; continue;
    }
    if (/[0-9]/.test(c)) { let k = i + 1; while (k < n && /[0-9A-Za-z_.]/.test(s[k])) k++; i = k; continue; }
    i++;
  }
  for (const b of br) add(b.line, 'LUA_BRACKET', '"' + b.v + '" is never closed: "' + OPEN[b.v] + '" is missing.');
  for (const b of bl) add(b.line, 'LUA_BLOCK_OPEN', '"' + b.v + '" is never closed: its "' + (b.v === 'repeat' ? 'until' : 'end') + '" is missing.');
  return out;
}
module.exports = { luaCheck };
