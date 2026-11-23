// ide/intel/po: checks of one gettext text file (.pot / .po), the GoH text form (GHLOC-01 [V]: default language .pot, selected
// language .po/.mo, under localizations/<code>/interface/text/; the game view keys them at resource/interface/text/).
//   poCheck(text) -> [{ line, code, msg, sev }]   text = editor text (\n line ends). Never throws (a crash: one PO_CRASH info).
// What the game does with an entry (GHLOC-06 [V], ; gohweb localization/goh-gettext-po-mo-export): the key is
// msgctxt (lower case); an entry with no msgctxt or flagged fuzzy is dropped; an empty msgstr shows the msgid; a second entry
// with the same key in one file: the first wins (GHLOC-08 [V]); a header charset= is converted to UTF-8; a UTF-8 BOM is skipped.
// The reader's tokenizer is not noted, and vanilla GoH .pot files hold strings that run over several lines, `;` lines and
// `msgstr """"`, and still load: so the reading here is lenient (a string may span lines; strings next to each other join) and a
// line it cannot read is only an info.
// codes: WARN_PO_NO_CTXT (no msgctxt: dropped), WARN_PO_FUZZY (fuzzy: dropped; not the header entry msgid ""),
//   WARN_PO_DUP_CTXT (the same key again in this file: the first one wins), WARN_PO_NO_MSGSTR (an entry that ends with no
//   msgstr [I]), WARN_PO_STRING (a string still open at the end of the file), PO_CTXT_CASE info (upper case in msgctxt: the game
//   keys it in lower case), PO_UNREAD info (a line that is no keyword, string or # comment [I]).
// Author: Imperator_Aug (ARSENAL, ia-b171583c)
'use strict';

const KW = /^(msgctxt|msgid_plural|msgid|msgstr(?:\[\d+\])?)(?=\s|"|$)/;
function poCheck(text) {
  const out = [];
  try {
    let t = String(text == null ? '' : text);
    if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
    const lines = t.replace(/\r\n/g, '\n').split('\n');
    const add = (line, code, msg) => out.push({ line, code, msg, sev: code.startsWith('WARN_') ? 'warn' : 'info' });
    const keys = new Map();
    let e = null, fuzzy = false, field = null;   // e = current entry; field = the keyword the next strings belong to
    const close = () => {
      if (e && (e.id != null || e.ctxt != null)) {
        const header = e.id === '' && e.ctxt == null;
        if (!e.hasStr) add(e.line, 'WARN_PO_NO_MSGSTR', 'this entry has no msgstr: write msgstr "" (an empty msgstr shows the msgid)');
        if (!header && e.ctxt == null) add(e.line, 'WARN_PO_NO_CTXT', 'no msgctxt: GoH keys a text by its msgctxt, so this entry gives no text in game (GHLOC-06)');
        if (!header && e.fuzzy) add(e.line, 'WARN_PO_FUZZY', 'flagged fuzzy: GoH drops fuzzy entries, so this one gives no text in game (GHLOC-06)');
        if (e.ctxt != null) {
          const k = e.ctxt.toLowerCase(), was = keys.get(k);
          if (was) add(e.ctxtLine, 'WARN_PO_DUP_CTXT', 'msgctxt "' + e.ctxt + '" is given again (first on line ' + was + '): the game keeps the first one (GHLOC-08)');
          else keys.set(k, e.ctxtLine);
          if (e.ctxt !== k) add(e.ctxtLine, 'PO_CTXT_CASE', 'msgctxt "' + e.ctxt + '": the game keys texts in lower case ("' + k + '")');
        }
      }
      e = null; field = null;
    };
    // a string from line i, column c (at the opening quote) -> { value, line, col } after the closing quote, or null (no close)
    const readStr = (i, c) => {
      let v = '';
      for (let li = i, col = c + 1; li < lines.length; li++, col = 0) {
        const L = lines[li];
        for (let j = col; j < L.length; j++) {
          const ch = L[j];
          if (ch === '\\') { const n = L[j + 1]; v += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : n === undefined ? '' : n; j++; continue; }
          if (ch === '"') return { value: v, line: li, col: j + 1 };
          v += ch;
        }
        v += '\n';
      }
      return null;
    };
    let i = 0;
    while (i < lines.length) {
      const L = lines[i], n = i + 1, T = L.trim();
      if (!T) { close(); fuzzy = false; i++; continue; }
      if (T[0] === '#') {
        if (e && e.hasStr) close();
        if (/^#,.*\bfuzzy\b/.test(T)) fuzzy = true;
        i++; continue;
      }
      let c = L.length - L.trimStart().length;
      const m = KW.exec(T);
      if (m) {
        const kw = m[1].replace(/\[\d+\]$/, '[]');
        if (kw === 'msgctxt' || ((kw === 'msgid') && e && (e.hasStr || e.id != null))) close();
        if (!e) { e = { line: n, id: null, ctxt: null, hasStr: false, fuzzy }; fuzzy = false; }
        if (kw === 'msgctxt') { e.ctxt = ''; e.ctxtLine = n; field = 'ctxt'; }
        else if (kw === 'msgid') { e.id = ''; field = 'id'; }
        else if (kw === 'msgid_plural') field = null;
        else { e.hasStr = true; field = null; }
        c += m[1].length;
      } else if (T[0] !== '"') { add(n, 'PO_UNREAD', 'not a gettext line (msgctxt, msgid, msgstr, a "string" or a # comment): ' + T.slice(0, 40)); i++; continue; }
      // the strings of this keyword: next to each other, over lines, until a line that starts otherwise
      let li = i, col = c, any = false;
      for (;;) {
        const R = lines[li];
        while (col < R.length && /\s/.test(R[col])) col++;
        if (col < R.length && R[col] === '"') {
          const s = readStr(li, col);
          if (!s) { add(li + 1, 'WARN_PO_STRING', 'this string is still open at the end of the file'); li = lines.length - 1; col = Infinity; break; }
          any = true;
          if (e && field === 'ctxt') e.ctxt += s.value; else if (e && field === 'id') e.id += s.value;
          li = s.line; col = s.col; continue;
        }
        if (col < R.length) { add(li + 1, 'PO_UNREAD', 'text after the string is not read: ' + R.slice(col).trim().slice(0, 40)); break; }
        // end of this line: go on when the next line starts with a string
        if (li + 1 < lines.length && lines[li + 1].trim()[0] === '"') { li++; col = 0; continue; }
        break;
      }
      if (!m && !e && any) add(n, 'PO_UNREAD', 'a string with no msgctxt, msgid or msgstr before it');
      i = li + 1;
    }
    close();
  } catch (x) { out.push({ line: 1, code: 'PO_CRASH', msg: 'text check failed: ' + (x && x.message || x), sev: 'info' }); }
  return out;
}

module.exports = { poCheck };
