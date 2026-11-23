// yaml.js: hand parser for the YAML subset gen specs use. maps, lists, scalars (all kept as strings except true/false/null),
// flow [a, b] and {k: v}, "double" / 'single' quotes, # comments. no anchors, no block scalars, no tabs for indent.
//   parse(text) -> value      JSON text (starts with { or [ and parses as JSON) goes through JSON.parse
// Author: Imperator_Aug (ARSENAL, ia-041982ef)
function stripComment(s) {
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\' && q === '"') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { if (i === 0 || /[\s\[{,:]/.test(s[i - 1])) q = c; continue; }
    if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i);
  }
  return s;
}
function unq(s) {
  if (s[0] === '"') { try { return JSON.parse(s); } catch (e) { return s.slice(1, -1); } }
  if (s[0] === "'") return s.slice(1, -1).replace(/''/g, "'");
  return null;
}
function scalar(s) {
  s = s.trim();
  if (s === '') return null;
  if (s[0] === '"' || s[0] === "'") { const e = s.lastIndexOf(s[0]); if (e > 0) return unq(s.slice(0, e + 1)); }
  if (s[0] === '[' || s[0] === '{') return flow(s);
  if (s === 'true') return true; if (s === 'false') return false; if (s === 'null' || s === '~') return null;
  return s;
}
// flow collections: recursive descent over one string
function flow(s) {
  let i = 0;
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  function val() {
    ws();
    if (s[i] === '[') {
      i++; const a = []; ws();
      while (i < s.length && s[i] !== ']') { a.push(val()); ws(); if (s[i] === ',') i++; ws(); }
      i++; return a;
    }
    if (s[i] === '{') {
      i++; const o = {}; ws();
      while (i < s.length && s[i] !== '}') {
        ws(); const k = str(':'); ws(); if (s[i] === ':') i++;
        o[k] = val(); ws(); if (s[i] === ',') i++; ws();
      }
      i++; return o;
    }
    if (s[i] === '"' || s[i] === "'") { const q = s[i]; let j = i + 1; while (j < s.length && s[j] !== q) { if (s[j] === '\\' && q === '"') j++; j++; } const t = s.slice(i, j + 1); i = j + 1; return unq(t); }
    const t = str(',]}'); return scalar(t);
  }
  function str(stops) {
    ws();
    if (s[i] === '"' || s[i] === "'") return val();
    const st = i;
    while (i < s.length && !stops.includes(s[i])) i++;
    return s.slice(st, i).trim();
  }
  return val();
}
const KEY = /^((?:"[^"]*"|'[^']*'|[^\s"'\[{#\-][^:]*?|-[^\s:][^:]*?)):(?:\s+(.*)|$)/;

function parse(text) {
  const t0 = text.replace(/^﻿/, '');
  if (/^\s*[\[{]/.test(t0)) { try { return JSON.parse(t0); } catch (e) { /* fall through to yaml flow */ } }
  const L = [];
  t0.split(/\r?\n/).forEach((raw, n) => {
    if (/^\t/.test(raw)) throw new Error(`line ${n + 1}: tab indent`);
    const body = stripComment(raw).replace(/\s+$/, '');
    if (!body.trim() || /^---\s*$/.test(body)) return;
    L.push({ ind: body.length - body.trimStart().length, text: body.trimStart(), n: n + 1 });
  });
  let p = 0;
  function node(ind) {
    if (p >= L.length) return null;
    if (L[p].text.startsWith('- ') || L[p].text === '-') return list(L[p].ind);
    return map(L[p].ind);
  }
  function list(ind) {
    const out = [];
    while (p < L.length && L[p].ind === ind && (L[p].text.startsWith('- ') || L[p].text === '-')) {
      const l = L[p], rest = l.text.slice(1).trimStart();
      if (!rest) { p++; out.push(p < L.length && L[p].ind > ind ? node(L[p].ind) : null); continue; }
      if (KEY.test(rest) && rest[0] !== '[' && rest[0] !== '{' && rest[0] !== '"' || /^("[^"]*"|'[^']*'):(\s|$)/.test(rest)) {
        // map item: first key sits at column ind+2 (or wherever the text starts)
        const col = ind + (l.text.length - rest.length);
        L[p] = { ind: col, text: rest, n: l.n };
        out.push(map(col));
      } else { p++; out.push(scalar(rest)); }
    }
    return out;
  }
  function map(ind) {
    const o = {};
    while (p < L.length && L[p].ind === ind && !(L[p].text.startsWith('- ') || L[p].text === '-')) {
      const l = L[p], m = KEY.exec(l.text);
      if (!m) throw new Error(`line ${l.n}: expected "key: value", got "${l.text.slice(0, 40)}"`);
      let k = m[1]; if (k[0] === '"' || k[0] === "'") k = unq(k);
      const rest = (m[2] || '').trim();
      p++;
      if (rest) o[k] = scalar(rest);
      else if (p < L.length && L[p].ind > ind) o[k] = node(L[p].ind);
      else if (p < L.length && L[p].ind === ind && L[p].text.startsWith('- ')) o[k] = list(ind);
      else o[k] = null;
    }
    if (p < L.length && L[p].ind > ind) throw new Error(`line ${L[p].n}: unexpected indent`);
    return o;
  }
  const v = node(L.length ? L[0].ind : 0);
  if (p < L.length) throw new Error(`line ${L[p].n}: cannot parse "${L[p].text.slice(0, 40)}"`);
  return v;
}
module.exports = { parse };
