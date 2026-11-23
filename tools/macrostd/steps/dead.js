// macrostd step dead: a mod-owned define that nothing calls is cut from its place and re-added commented out ("; " per line) at the
//   end of the same file under the one heading line HEAD. "Nothing calls": no literal call in any mod or vanilla file (calls inside
//   other macro bodies count) and no dynamic call name ("gore_piece%0", any '%x' = any text) that could build it (model.dynMatch).
//   Whole lines move when the define has its lines to itself (its header comment goes with it when a blank line or the file start
//   is above that comment); otherwise only the define's own text moves. A define inside another define's body is a case.
// Author: Imperator_Aug (ARSENAL, ia-53020bc7)
const { lineEnds } = require('../scan');
const HEAD = '; ---- unused macros (macrostd): defined, never called ----';

function isDead(m, d) { return d.owner === 'mod' && m.callCount(d.name) === 0 && !m.dynMatch(d.name); }

function cutPlan(s, sc, defs) {
  const ls = sc.lineStarts, n = s.length;
  const lineStart = l => ls[l - 1];
  const lineEnd = l => (l < ls.length ? ls[l] : n);       // after the line's EOL
  const cuts = [];
  for (const d of defs) {
    const [a, b] = d.span;
    const pre = s.slice(lineStart(d.line), a);
    const endL = sc.lineOf(b - 1), post = s.slice(b, lineEnd(endL)).replace(/[\r\n]+$/, '');
    if (/^[ \t]*$/.test(pre) && /^[ \t]*(;.*)?$/.test(post)) {
      let first = d.line;
      if (d.header.length) {
        const h0 = d.line - d.header.length;
        if (h0 === 1 || /^[ \t]*$/.test(sc.lineText(h0 - 1))) first = h0;
      }
      cuts.push({ d, a: lineStart(first), b: lineEnd(endL), whole: true });
    } else cuts.push({ d, a, b, whole: false });
  }
  return cuts.sort((x, y) => x.a - y.a);
}

module.exports = {
  id: 'dead',
  title: 'unused mod macros commented out at the end of their file',
  HEAD, isDead,
  plan(ctx) {
    const m = ctx.model, changes = [], cases = [];
    const byFile = new Map();
    for (const d of m.defines) {
      if (!d.scope || !isDead(m, d)) continue;
      if (d.inDefine >= 0) { cases.push({ id: 'dead-nested', title: `${d.rel}:${d.line}: "${d.name}" defined inside another define`, detail: 'not moved' }); continue; }
      if (!d.closed) continue;
      if (!byFile.has(d.rel)) byFile.set(d.rel, []);
      byFile.get(d.rel).push(d);
    }
    for (const [rel, defs] of byFile) {
      const F = m.files.get(rel.toLowerCase());
      const s = ctx.read(rel).toString('latin1');
      if (s !== F.s) { cases.push({ id: 'dead-stale', title: `${rel}: model out of date`, detail: 'file changed since the model was built' }); continue; }
      const cuts = cutPlan(s, F.scan, defs);
      if (cuts.some((c, i) => i && c.a < cuts[i - 1].b)) { cases.push({ id: 'dead-overlap', title: `${rel}: overlapping defines`, detail: defs.map(d => d.name).join(', ') }); continue; }
      const ends = lineEnds(s), eol = ends.length && ends.filter(e => e.len === 2).length * 2 < ends.length ? s.slice(ends[0].pos, ends[0].pos + ends[0].len) : '\r\n';
      let body = '', last = 0;
      const moved = [];
      for (const c of cuts) { body += s.slice(last, c.a); last = c.b; moved.push(s.slice(c.a, c.b).replace(/(\r\n|\n|\r)$/, '')); }
      body += s.slice(last);
      if (body.length && !/[\r\n]$/.test(body)) body += eol;
      if (!body.includes(HEAD)) body += eol + HEAD + eol;
      for (const t of moved) for (const L of t.split(/\r\n|\n|\r/)) body += (L.length ? '; ' + L : ';') + eol;
      const rows = cuts.map(c => ({ line: c.d.line, kind: 'dead', before: c.d.name, after: 'commented out at end of file', note: `defined at lines ${c.d.line}-${c.d.endLine}, 0 calls in mod and vanilla` + (c.whole ? '' : ' (shared line: define text only)') }));
      changes.push({ file: rel, after: Buffer.from(body, 'latin1'), create: false, rows });
    }
    return { changes, cases };
  },
};
