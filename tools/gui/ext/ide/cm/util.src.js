// ide cm util: word under a position and a line diff for compare (served raw in ide.js; selfcheck.js tests them).
// ES5 only. Author: Imperator_Aug (ARSENAL)
// Author: Imperator_Aug (ARSENAL, ia-bf0ede0d)

// word at 0-based ch in one line of text -> { from, to, quoted } (0-based, `to` exclusive) or null.
// Inside a "string" the word is the whole string body (quoted:true). sdl: text after ';' (outside strings) is comment.
function ideWordRange(text, ch, sdl) {
  var n = text.length, i = 0, s = -1, c;
  while (i < n) {
    c = text.charAt(i);
    if (s < 0) {
      if (i > ch) break;
      if (sdl && c === ';') break;
      if (c === '"') s = i;
      i++;
      continue;
    }
    if (c === '\\') { i += 2; continue; }
    if (c === '"') {
      if (ch >= s && ch <= i) return i > s + 1 ? { from: s + 1, to: i, quoted: true } : null;
      s = -1;
    }
    i++;
  }
  if (s >= 0 && ch >= s) return n > s + 1 ? { from: s + 1, to: n, quoted: true } : null;
  var re = /[^\s{}"();,=]/, a = ch, b = ch;
  if (a > n) a = b = n;
  while (a > 0 && re.test(text.charAt(a - 1))) a--;
  while (b < n && re.test(text.charAt(b))) b++;
  if (a === b) return null;
  return { from: a, to: b, quoted: false };
}

// changed lines between two line arrays -> { left:[idx], right:[idx] } (0-based).
// Common head and tail are trimmed; the middle uses LCS when both sides are at most 5000 lines and the table stays
// under 4M cells, else a position compare (line i against line i).
function ideLineDiff(a, b) {
  var n = a.length, m = b.length, s = 0, ea = n, eb = m, left = [], right = [], i, j;
  while (s < n && s < m && a[s] === b[s]) s++;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  var A = ea - s, B = eb - s;
  if (A === 0 || B === 0) {
    for (i = 0; i < A; i++) left.push(s + i);
    for (j = 0; j < B; j++) right.push(s + j);
    return { left: left, right: right, exact: true };
  }
  if (A > 5000 || B > 5000 || A * B > 4000000) {
    var top = Math.max(A, B);
    for (i = 0; i < top; i++) {
      if (i >= A) right.push(s + i);
      else if (i >= B) left.push(s + i);
      else if (a[s + i] !== b[s + i]) { left.push(s + i); right.push(s + i); }
    }
    return { left: left, right: right, exact: false };
  }
  var W = B + 1, T = new Uint16Array((A + 1) * W);
  for (i = A - 1; i >= 0; i--) {
    for (j = B - 1; j >= 0; j--) {
      T[i * W + j] = a[s + i] === b[s + j] ? T[(i + 1) * W + j + 1] + 1 : Math.max(T[(i + 1) * W + j], T[i * W + j + 1]);
    }
  }
  i = 0; j = 0;
  while (i < A && j < B) {
    if (a[s + i] === b[s + j]) { i++; j++; }
    else if (T[(i + 1) * W + j] >= T[i * W + j + 1]) { left.push(s + i); i++; }
    else { right.push(s + j); j++; }
  }
  while (i < A) { left.push(s + i); i++; }
  while (j < B) { right.push(s + j); j++; }
  return { left: left, right: right, exact: true };
}
