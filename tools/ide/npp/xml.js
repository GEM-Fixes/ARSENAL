// npp/xml: small text-level XML helpers for the Notepad++ pack. No re-serialising: we find spots in the text and
// insert or drop whole lines, so every other byte of a user file stays as it was.
// Author: Imperator_Aug (ARSENAL, ia-6dc49456)
'use strict';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// [start,end) ranges of <!-- --> comments and <![CDATA[ ]]> sections, kept out of tag search. One left-to-right scan,
// so a <!-- inside CDATA (or a <![CDATA[ inside a comment) does not open anything.
function commentRanges(t) {
  const r = []; let i = 0;
  for (;;) {
    const c = t.indexOf('<!--', i), d = t.indexOf('<![CDATA[', i);
    if (c < 0 && d < 0) break;
    const isC = d < 0 || (c >= 0 && c < d), at = isC ? c : d;
    const e = isC ? t.indexOf('-->', at + 4) : t.indexOf(']]>', at + 9);
    const end = e < 0 ? t.length : e + 3;
    r.push([at, end]); i = end;
  }
  return r;
}
const inRanges = (rs, p) => rs.some(([a, b]) => p >= a && p < b);

// every match of re (global) whose start is outside comments
function findAll(t, re) {
  const rs = commentRanges(t), out = []; let m; re.lastIndex = 0;
  while ((m = re.exec(t))) { if (!inRanges(rs, m.index)) out.push(m); if (!m[0].length) re.lastIndex++; }
  return out;
}

const eolOf = t => (/\r\n/.test(t) ? '\r\n' : '\n');
const lineStart = (t, p) => t.lastIndexOf('\n', p - 1) + 1;

// Tiny well-formedness check: tags nest and close, attributes quoted, entities known, one root. Returns null or message.
function wellFormed(t) {
  let i = 0; const st = []; let roots = 0;
  if (t.charCodeAt(0) === 0xfeff) i = 1;
  const ent = /&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/y;
  const textOk = (s, at) => {
    for (let k = 0; k < s.length; k++) {
      if (s[k] === '<') return 'stray < at ' + (at + k);
      if (s[k] === '&') { ent.lastIndex = k; if (!ent.test(s)) return 'bad entity at ' + (at + k); }
    }
    return null;
  };
  while (i < t.length) {
    const lt = t.indexOf('<', i);
    const txt = t.slice(i, lt < 0 ? t.length : lt);
    const e = textOk(txt, i); if (e) return e;
    if (!st.length && txt.trim()) return 'text outside root at ' + i;
    if (lt < 0) break;
    if (t.startsWith('<!--', lt)) { const c = t.indexOf('-->', lt + 4); if (c < 0) return 'open comment'; if (t.slice(lt + 4, c).includes('--')) return '-- in comment at ' + lt; i = c + 3; continue; }
    if (t.startsWith('<?', lt)) { const c = t.indexOf('?>', lt); if (c < 0) return 'open PI'; i = c + 2; continue; }
    if (t.startsWith('<![CDATA[', lt)) { const c = t.indexOf(']]>', lt); if (c < 0) return 'open CDATA'; i = c + 3; continue; }
    if (t.startsWith('<!', lt)) { const c = t.indexOf('>', lt); i = c + 1; continue; }
    const gt = (() => { let q = null; for (let k = lt + 1; k < t.length; k++) { const ch = t[k]; if (q) { if (ch === q) q = null; } else if (ch === '"' || ch === "'") q = ch; else if (ch === '>') return k; else if (ch === '<') return -2; } return -1; })();
    if (gt < 0) return 'unclosed tag at ' + lt;
    const body = t.slice(lt + 1, gt);
    if (body[0] === '/') {
      const n = body.slice(1).trim(); const top = st.pop();
      if (top !== n) return 'close ' + n + ' does not match ' + top + ' at ' + lt;
    } else {
      const self = body.endsWith('/'); const b = self ? body.slice(0, -1) : body;
      const m = /^([A-Za-z_][\w.:\-]*)/.exec(b); if (!m) return 'bad tag name at ' + lt;
      let rest = b.slice(m[1].length); const seen = new Set();
      const ar = /\s+([A-Za-z_][\w.:\-]*)\s*=\s*("([^"]*)"|'([^']*)')/y; let p = 0;
      while (p < rest.length) {
        if (/^\s*$/.test(rest.slice(p))) break;
        ar.lastIndex = p; const a = ar.exec(rest); if (!a) return 'bad attribute in <' + m[1] + '> at ' + lt;
        if (seen.has(a[1])) return 'duplicate attribute ' + a[1]; seen.add(a[1]);
        const v = a[3] !== undefined ? a[3] : a[4]; if (v.includes('<')) return '< in attribute at ' + lt;
        const e2 = textOk(v.replace(/</g, ''), lt); if (e2) return e2;
        p = ar.lastIndex;
      }
      if (!st.length) { roots++; if (roots > 1) return 'two roots'; }
      if (!self) st.push(m[1]);
    }
    i = gt + 1;
  }
  if (st.length) return 'unclosed ' + st.join('>');
  if (!roots) return 'no root';
  return null;
}

module.exports = { esc, commentRanges, inRanges, findAll, eolOf, lineStart, wellFormed };
