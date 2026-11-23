// the purchase stages of a bot.data.lua text by their place in the Purchases table, not by the stock "{--purchase N" comments (a mod's own
// list often has none): stagesOf(text) -> [{n, o, c, rep: [a, b] | null}] (o/c = the char index of the stage's { and }, rep = the char range of
// its Repeat number), or null when the text has no Purchases table it can read. The reading is the Bots page's stages part
// (gui/ext/bots/parts/stages/botdata.js parse, comments and strings blanked first), so the page and this tool count the same stages.
// Author: Imperator_Aug (ARSENAL, ia-6cbc170e)
'use strict';
let BD = null;
try { BD = require('../gui/ext/bots/parts/stages/botdata'); } catch (e) { BD = null; }

// the fallback when that part is missing: the stock comments
function byComments(t) {
  const out = [];
  for (let n = 1; ; n++) {
    const o = t.indexOf('{--purchase ' + n); if (o < 0) break;
    const nx = t.indexOf('{--purchase ' + (n + 1), o), seg = t.slice(o, nx < 0 ? t.length : nx), m = /\bRepeat\s*=\s*(\d+)/d.exec(seg);
    out.push({ n, o, c: (nx < 0 ? t.length : nx) - 1, rep: m ? [o + m.indices[1][0], o + m.indices[1][1]] : null });
  }
  return out.length ? out : null;
}
function stagesOf(text) {
  const t = String(text == null ? '' : text);
  if (!BD) return byComments(t);
  let R; try { R = BD.parse(t); } catch (e) { return byComments(t); }
  if (!R || !R.P) return byComments(t);
  return R.stages.map((S, i) => ({ n: i + 1, o: S.o, c: S.c, rep: S.rep && /^\d+$/.test(S.rep.v) ? [S.rep.a, S.rep.b] : null }));
}
// [s0, s1) of stage n (1-based) for a search, or null
function rangeOf(text, n) { const s = stagesOf(text), k = Number(n); return s && k >= 1 && k <= s.length ? [s[k - 1].o, s[k - 1].c + 1] : null; }
module.exports = { stagesOf, rangeOf };
