// enc: SDL strings UTF-8, idents ASCII
// Author: Imperator_Aug (ARSENAL, ia-0808e11b)
const fs = require('fs');
// write: encodeText (UTF-8). read for round-trip: latin1 bytes (sdlx/sdlwrite). cp1251 kept only as a DECODER to repair legacy mods.

// BOM kind|null (UTF-16/32 fatal)
function bomKind(b) {
  // 'utf8' | 'utf16le' | 'utf16be' | 'utf32le' | 'utf32be'; engine rejects UTF-16/32 (lim LOC-05)
  if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return 'utf8';
  if (b[0] === 0xFF && b[1] === 0xFE) return b[2] === 0 && b[3] === 0 ? 'utf32le' : 'utf16le';
  if (b[0] === 0xFE && b[1] === 0xFF) return 'utf16be';
  if (b[0] === 0 && b[1] === 0 && b[2] === 0xFE && b[3] === 0xFF) return 'utf32be';
  return null;
}

// enc utf8|cp1251 → {text, lines, bom, fatal, badLines}
function readText(file, enc = 'cp1251') {
  // 'utf8' strict per line; 'cp1251' for structure reads (keys/idents ASCII). lines without CR; badLines = invalid UTF-8 line numbers
  const buf = Buffer.isBuffer(file) ? file : fs.readFileSync(file);
  const bom = bomKind(buf);
  if (bom && bom !== 'utf8') return { text: '', lines: [], bom, fatal: `${bom} BOM; engine rejects file (resave as UTF-8)`, badLines: [] };
  const off = bom === 'utf8' ? 3 : 0;
  const lines = [], badLines = [];
  if (enc === 'utf8') {
    const strict = new TextDecoder('utf-8', { fatal: true }), lax = new TextDecoder('utf-8');
    let s = off;
    for (let i = off; i <= buf.length; i++) {
      if (i < buf.length && buf[i] !== 0x0A) continue;
      const sl = buf.subarray(s, i);
      try { lines.push(strict.decode(sl)); } catch { badLines.push(lines.length + 1); lines.push(lax.decode(sl)); }
      s = i + 1;
    }
  } else {
    lines.push(...new TextDecoder('windows-1251').decode(buf.subarray(off)).split('\n'));
  }
  for (let i = 0; i < lines.length; i++) if (lines[i].endsWith('\r')) lines[i] = lines[i].slice(0, -1);
  return { text: lines.join('\n'), lines, bom, fatal: null, badLines };
}

// str -> UTF-8 Buffer
function encodeText(str) {
  // as64 string form: unicode utils Utf8ToUnicode, ToWide CP_UTF8, tag Utf8ToLower
  return Buffer.from(String(str), 'utf8'); }

const UTF8 = new TextDecoder('utf-8', { fatal: true });
function isUtf8(buf) { try { UTF8.decode(buf); return true; } catch { return false; } }

// full-table cp1251 decoder (0x98 undefined -> U+FFFD). for repair of legacy mods only: cp1251 string -> UTF-8
const CP = new TextDecoder('windows-1251');
function decodeCp1251(buf) { return CP.decode(buf); }

// → {badStr, outside}
function sdlScan(buf, max = 50) {
  // badStr: [{line,bytes}] non-UTF-8 strings; outside: [{line,byte}] non-ASCII bytes outside strings/comments
  // lexing as lib/sdlx: ; comment to line end, "string" with \x escapes, never spans lines. cp1251 strings show U+FFFD;
  // identifiers must be ASCII. vanilla non-ASCII is only ; comments (cp1251/cp866, ignored)
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf), 'latin1');
  const out = { badStr: [], outside: [] };
  let i = bomKind(b) === 'utf8' ? 3 : 0, line = 1;
  const n = b.length;
  while (i < n) {
    const c = b[i];
    if (c === 10) { line++; i++; }
    else if (c === 59) { while (i < n && b[i] !== 10 && b[i] !== 13) i++; }
    else if (c === 34) {
      let j = i + 1, hi = false;
      while (j < n && b[j] !== 34 && b[j] !== 10 && b[j] !== 13) { if (b[j] === 92 && j + 1 < n && b[j + 1] !== 10) { j += 2; continue; } if (b[j] >= 0x80) hi = true; j++; }
      if (hi && out.badStr.length < max) { const s = b.subarray(i + 1, j); if (!isUtf8(s)) out.badStr.push({ line, bytes: s }); }
      i = b[j] === 34 ? j + 1 : j;
    } else { if (c >= 0x80 && out.outside.length < max && !(out.outside.length && out.outside[out.outside.length - 1].line === line)) out.outside.push({ line, byte: c }); i++; }
  }
  return out;
}

// → {buf, fixed}
function cp1251StringsToUtf8(buf) {
  // legacy repair: non-UTF-8 strings cp1251 -> UTF-8; only string values that are not valid UTF-8 change; comments and the rest stay bytes
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf), 'latin1');
  const parts = []; let last = 0, fixed = 0, i = 0;
  const n = b.length;
  while (i < n) {
    const c = b[i];
    if (c === 59) { while (i < n && b[i] !== 10 && b[i] !== 13) i++; }
    else if (c === 34) {
      let j = i + 1, hi = false;
      while (j < n && b[j] !== 34 && b[j] !== 10 && b[j] !== 13) { if (b[j] === 92 && j + 1 < n && b[j + 1] !== 10) { j += 2; continue; } if (b[j] >= 0x80) hi = true; j++; }
      const s = b.subarray(i + 1, j);
      if (hi && !isUtf8(s)) { parts.push(b.subarray(last, i + 1), Buffer.from(decodeCp1251(s), 'utf8')); last = j; fixed++; }
      i = b[j] === 34 ? j + 1 : j;
    } else i++;
  }
  parts.push(b.subarray(last));
  return { buf: Buffer.concat(parts), fixed };
}

// DEPRECATED
function encodeCp1251(str) {
  // use encodeText. str -> cp1251 Buffer (.lost)
  // wrong target: as64 shows cp1251 string bytes as U+FFFD, and this table only maps А-я Ёё
  // (« » № – — become '?'). kept for old callers listed
  const out = Buffer.alloc(str.length), lost = [];
  let n = 0;
  for (const ch of str) {
    const c = ch.codePointAt(0);
    let b;
    if (c < 0x80) b = c; else if (c >= 0x410 && c <= 0x44F) b = c - 0x410 + 0xC0; else if (c === 0x401) b = 0xA8; else if (c === 0x451) b = 0xB8;
    else { b = 0x3F; lost.push(ch); }
    out[n++] = b;
  }
  const buf = out.subarray(0, n); buf.lost = lost;
  return buf;
}

module.exports = { bomKind, readText, encodeText, isUtf8, decodeCp1251, sdlScan, cp1251StringsToUtf8, encodeCp1251 };
