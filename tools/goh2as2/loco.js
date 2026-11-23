// Author: Imperator_Aug (ARSENAL, ia-5ecbb9fb)
'use strict';
// LOCO_GOH (shared by goh2as2 and mapport/units --fix-mod): GoH puts {Slow n}{Normal n}{Fast n} in a vehicle {Locomotion} block
// (properties/goh/railway.ext: (define "locomotion" ...)). AS2 declares those keywords for vehicles but 's
// Locomotion switch has no case for them: "unexpected token (380)", a fatal error that ends the map load [V dcgdefs inst 2, drg_class75].
// Strips them inside each (define "locomotion" ...) and {Locomotion ...} span; everything else byte-identical (latin1 round trip).
// A {speed {Slow n}} block outside those spans (vanilla foot/vehicle speed) stays.
// GOHFIX: the value may be a number, a %macro or an expression like (* %speed 0.6) (GoH properties/mobility.inc, ammo_trailer
// fatal [V gohfix inst 3]), so each {Slow|Normal|Fast ...} block is cut at its own matching brace; a line left holding only
// blanks and a ; comment goes too.
function stripGohLoco(text) {
  const spans = [];
  for (const m of text.matchAll(/\(\s*define\s+"locomotion"|\{\s*locomotion\b/gi)) {
    const open = m[0][0], close = open === '(' ? ')' : '}';
    let d = 0, i = m.index;
    for (; i < text.length; i++) { const c = text[i]; if (c === open) d++; else if (c === close && --d === 0) break; }
    spans.push([m.index, i + 1]);
  }
  if (!spans.length) return { text, n: 0 };
  let out = '', last = 0, n = 0;
  const cut = s => {
    let r = '', i = 0;
    for (const m of s.matchAll(/\{\s*(?:slow|normal|fast)\b/gi)) {
      if (m.index < i) continue;
      let d = 0, j = m.index;
      for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) break; }
      if (j >= s.length) break;
      let a = m.index, b = j + 1;
      const ls = s.lastIndexOf('\n', a - 1) + 1, le = s.indexOf('\n', b);
      const rest = s.slice(b, le < 0 ? s.length : le).replace(/\r$/, '');
      if (le >= 0 && /^[ \t]*$/.test(s.slice(ls, a)) && /^[ \t]*(?:;.*)?$/.test(rest)) { a = ls; b = le + 1; }
      r += s.slice(i, a); i = b; n++;
    }
    return r + s.slice(i);
  };
  for (const [a, b] of spans) {
    if (a < last) continue;   // nested span: the outer one covers it
    out += text.slice(last, a) + cut(text.slice(a, b)); last = b;
  }
  return { text: out + text.slice(last), n };
}
module.exports = { stripGohLoco };
