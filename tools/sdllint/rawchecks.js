// sdllint raw-text checks (CHK-SDL): rows MAP-29 SDL-57 TST-104 SDL-09 SDL-11 SDL-18 SDL-28 (SDL-20 never).
// scan(key, buf) -> [{line, code, msg}], no lib parse: strings and ; comments are blanked by one small state machine.
// key = vfs-style lower-case path (resource/set/stuff/x, resource/map/.../mtl0.mtl). Own files only.
// Author: Imperator_Aug (ARSENAL, ia-7ffcea2f)
const base = k => k.slice(k.lastIndexOf('/') + 1);

// -> { code: text with comments+strings blanked (newlines kept), nocom: comments blanked only, strs: [{line, text, at}] }
// (speed: one pass over byte copies, no per-character string concatenation; a blanked run never holds \r or \n, so code and nocom
// keep the length and the line breaks of s. Same output as the old char-by-char version.)
function split(s) {
  const n = s.length, code = Buffer.from(s, 'latin1'), nocom = Buffer.from(code), strs = [];
  let line = 1;
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    if (c === 34) {   // "
      let j = i + 1;
      while (j < n) { const d = s.charCodeAt(j); if (d === 34 || d === 10 || d === 13) break; j++; }
      const closed = j < n && s.charCodeAt(j) === 34;
      strs.push({ line, text: s.slice(i + 1, j), at: i });
      code.fill(32, i, closed ? j + 1 : j);
      i = closed ? j : j - 1;
    } else if (c === 59) {   // ;
      let j = i; while (j < n) { const d = s.charCodeAt(j); if (d === 10 || d === 13) break; j++; }
      code.fill(32, i, j); nocom.fill(32, i, j);
      i = j - 1;
    } else if (c === 10) line++;
  }
  return { code: code.toString('latin1'), nocom: nocom.toString('latin1'), strs };
}
// line of index i (s, code and nocom share their line breaks): line starts made once per text, then a binary search
function lineIndex(s) { const a = [0]; for (let k = s.indexOf('\n'); k >= 0; k = s.indexOf('\n', k + 1)) a.push(k + 1); return a; }
function lineAtOf(s) { let idx = null; return (t, i) => { if (!idx) idx = lineIndex(s); let lo = 0, hi = idx.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (idx[m] <= i) lo = m; else hi = m - 1; } return lo + 1; }; }
// index of the paren matching the "(" at i in text where strings are blanked or skipped
function closeParen(s, i) {
  let d = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '"') { while (++k < s.length && s[k] !== '"' && s[k] !== '\n'); }
    else if (c === '(') d++;
    else if (c === ')' && --d === 0) return k;
  }
  return -1;
}

function scan(key, buf) {
  const out = [], add = (line, code, msg) => out.push({ line, code, msg });
  if (!buf || buf.includes(0)) return out;
  const s = buf.toString('latin1'), { code, nocom, strs } = split(s);
  const isStuff = key.startsWith('resource/set/stuff/'), lineAt = lineAtOf(s);   // one index serves s, code and nocom (same line breaks)

  // MAP-29: terrain material (map folder mtlN.mtl) needs exactly 2 {layer} blocks
  if (/\.mtl$/.test(key) && /(^|\/)map\//.test(key) && /\{\s*material\b/.test(code)) {
    const m = code.match(/\{\s*layer\b/g) || [];
    if (m.length !== 2) add(lineAt(code, code.search(/\{\s*material\b/)), 'MAP_MTL_LAYER_COUNT', `terrain material has ${m.length} {layer} blocks, the engine reads exactly 2 (a map with one crashes at the first crater). change: give this material two {layer} blocks`);
  }

  // SDL-57: stuff {from "tags"} whose tags the file's own name already carries, file sorting before the base: finds itself, crash at load
  if (isStuff) {
    const own = base(key).split('.'), re = /\{\s*from\s+"([^"]*)"/g; let m;
    while ((m = re.exec(nocom))) {
      const q = m[1].trim().split(/\s+/).filter(Boolean);
      if (!q.length || q.join('.') === base(key)) continue;
      if (q.every(t => own.includes(t)) && base(key) < q.join('.')) add(lineAt(nocom, m.index), 'STUFF_FROM_SELF', `{from "${m[1]}"} names tags this file's own name carries and the file sorts before its base: it finds itself, as64 exits at load. change: name {from} by tags only the base file carries; do not name a clone <x>.<base>`);
    }
  }

  // TST-104: damage <number> in set/stuff: fatal, damage takes an effect type
  if (isStuff) {
    // only a direct child of the stuff root: nested {special {damage 2.5}} / {damage cumulative {damage 75}} are other keys (vanilla)
    const re = /\{\s*damage[ \t]+[-+]?\.?\d/g; let m;
    // matches come in rising order: the depth is carried on from the last match, not counted from 0 each time
    let dk = 0, dd = 0;
    const depthAt = i => { for (; dk < i; dk++) { const c = code.charCodeAt(dk); if (c === 123) dd++; else if (c === 125) dd--; } return dd; };
    while ((m = re.exec(code))) if (depthAt(m.index) === 1) add(lineAt(code, m.index), 'STUFF_DAMAGE_NUMBER', 'damage is followed by a number: damage takes an effect type (damage blastwave) and a number is a fatal load error. change: use the projectile keys for numbers');
  }

  // SDL-09: backslash-backslash-n in a string decodes to LF, a literal backslash-n cannot be written
  for (const st of strs) if (/\\\\n/.test(st.text)) add(st.line, 'STR_ESCAPE_BS_N', 'string holds \\\\n: the decoder turns it into a line feed, not a literal backslash-n. change: write \\n if a line feed is meant; a literal backslash-n cannot be written');

  // SDL-11: {## in the DDA files multiplayer.set / breed.set is flagged, not removed
  if (base(key) === 'multiplayer.set' || base(key) === 'breed.set') {
    const re = /\{##/g; let m;
    while ((m = re.exec(code))) add(lineAt(code, m.index), 'DDA_DISABLED_BLOCK', `{## block in ${base(key)}: DDA readers flag it instead of skipping it. change: delete the block, or comment it out with ;`);
  }

  // SDL-18: macro called with a case other than its define
  const defs = new Set(); let m; const dre = /\(\s*define\s+"([^"]*)"/g;
  while ((m = dre.exec(nocom))) defs.add(m[1]);
  if (defs.size) {
    const lower = new Map(); for (const d of defs) lower.set(d.toLowerCase(), (lower.get(d.toLowerCase()) || []).concat(d));
    const cre = /\(\s*"([^"]*)"/g;
    while ((m = cre.exec(nocom))) {
      if (defs.has(m[1])) continue;
      const alt = lower.get(m[1].toLowerCase());
      if (alt) add(lineAt(nocom, m.index), 'MACRO_CASE_MISMATCH', `macro "${m[1]}" is used but only "${alt[0]}" is defined; names are case-sensitive. change: write "${alt[0]}"`);
    }
  }

  // SDL-20: textual param substitution: one name prefixing another in a call or define body; %x inside a define's string
  // NOT BUILT (never): vanilla passes body/body2 params in 497 calls and puts %x in strings in 664 places on purpose,
  // both fired as false positives; substitution runs in descending name order so a prefixing pair is safe

  // SDL-28: (/ a 0): divisor literal zero, result inf
  const re28 = /\(\s*\/(?=[\s(\d.+-])/g;
  while ((m = re28.exec(code))) {
    const e = closeParen(code, m.index); if (e < 0) continue;
    const body = code.slice(m.index + m[0].length, e);
    // depth-0 atoms; a nested expression counts as one non-zero atom
    const atoms = []; let d = 0, tok = '';
    for (const c of body + ' ') {
      if (c === '(') { if (d === 0 && tok) { atoms.push(tok); tok = ''; } if (d === 0) atoms.push('(...)'); d++; continue; }
      if (c === ')') { d--; continue; }
      if (d > 0) continue;
      if (/\s/.test(c)) { if (tok) atoms.push(tok); tok = ''; } else tok += c;
    }
    if (atoms.slice(1).some(a => /^[-+]?0+(\.0*)?$/.test(a))) add(lineAt(code, m.index), 'ARITH_DIV_ZERO', 'division by a literal 0: unchecked, the result is inf. change: use a nonzero divisor');
  }
  return out;
}
module.exports = { scan };
