// botsub: AI-22. A mod bot script that Subscribes a bot event textually BEFORE it requires script/multiplayer/bot.lua takes the one
// handler slot per event (first Subscribe stays), so bot.lua's own handler is dropped and the bot never spawns.
// Fine when that handler itself calls the bot.lua On* global (OnGameQuant(..)) or the file Unsubscribes after the require.
// check(text) -> [{sev:'warn', code:'BOT_SUBSCRIBE_BEFORE_REQUIRE', line, msg}]   text-level scan, no Lua run [I: no handler body resolution beyond one named function]
// Author: Imperator_Aug (ARSENAL, ia-416773c8)
'use strict';

// blank comments with spaces (newlines kept, so offsets and lines stay); strings stay as they are
function blankComments(s) {
  let o = '', i = 0;
  const n = s.length, blank = t => t.replace(/[^\r\n]/g, ' ');
  while (i < n) {
    const c = s[i];
    if (c === '-' && s[i + 1] === '-') {
      const m = /^--\[(=*)\[/.exec(s.slice(i, i + 40));
      let end;
      if (m) { const e = s.indexOf(']' + m[1] + ']', i + m[0].length); end = e < 0 ? n : e + m[1].length + 2; }
      else { const e = s.indexOf('\n', i); end = e < 0 ? n : e; }
      o += blank(s.slice(i, end)); i = end;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && s[j] !== c && s[j] !== '\n') { if (s[j] === '\\') j++; j++; }
      o += s.slice(i, j + 1); i = j + 1;
    } else if (c === '[' && /^\[=*\[/.test(s.slice(i, i + 40))) {
      const m = /^\[(=*)\[/.exec(s.slice(i, i + 40)), e = s.indexOf(']' + m[1] + ']', i + m[0].length), end = e < 0 ? n : e + m[1].length + 2;
      o += s.slice(i, end); i = end;
    } else { o += c; i++; }
  }
  return o;
}

// text of the balanced ( ... ) starting at the "(" at index p; null when unbalanced
function args(s, p) {
  let d = 0, q = null;
  for (let i = p; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === '(') d++;
    else if (c === ')' && --d === 0) return s.slice(p + 1, i);
  }
  return null;
}

const lineOf = (s, i) => s.slice(0, i).split('\n').length;
const CALLS_ON = /\bOn[A-Z]\w*\s*\(/;

function check(text) {
  const s = blankComments(text), out = [];
  let req = -1;
  for (const m of s.matchAll(/\brequire\s*\(?\s*(?:\[=*\[|["'])([^\]"']*)/g)) {
    if (/(^|[\/\\])bot(\.lua)?$/i.test(m[1].trim())) { req = m.index; break; }
  }
  if (req < 0) return out;
  const after = s.slice(req);
  if (/[:.]\s*Unsubscribe\s*\(/.test(after)) return out;   // wrapped after the require: Unsubscribe + Subscribe
  for (const m of s.slice(0, req).matchAll(/[:.]\s*Subscribe\s*\(/g)) {
    const p = m.index + m[0].length - 1, a = args(s, p);
    if (a == null) continue;
    const comma = a.indexOf(','), ev = (comma < 0 ? a : a.slice(0, comma)).trim(), h = comma < 0 ? '' : a.slice(comma + 1);
    let body = h;
    const id = /^\s*([\w.]+)\s*$/.exec(h);
    if (id) {   // named handler: look at its function body (to the next line that starts with end)
      const f = new RegExp('function\\s+' + id[1].replace(/\./g, '\\.') + '\\s*\\(').exec(s);
      if (f) { const e = s.slice(f.index).search(/\r?\nend\b/); body = s.slice(f.index, e < 0 ? undefined : f.index + e); }
    }
    if (CALLS_ON.test(body)) continue;
    out.push({ sev: 'warn', code: 'BOT_SUBSCRIBE_BEFORE_REQUIRE', line: lineOf(s, m.index), msg: `${ev} is subscribed before require of bot.lua (line ${lineOf(s, req)}): the engine keeps the first handler per event, so bot.lua's own handler is dropped and the bot never spawns; move the Subscribe after the require (Unsubscribe first), or call the On* global from your handler (AI-22)` });
  }
  return out;
}
module.exports = { check, blankComments };
