// macrostd step names: mod-owned macro names with capitals or '-' become lowercase with '_' (define + every literal call, also calls
//   inside other macro bodies). Names are exact and case-sensitive (SDL-18), so every site is renamed in one go. A case instead when:
//   the new name already exists (defined or called in mod or vanilla), two names map to one, a dynamic call name ("x%0") could build
//   the old name, or the old name is used in a file outside the edited scope (map .mi etc.).
// Author: Imperator_Aug (ARSENAL, ia-05914309)
const newName = n => n.toLowerCase().replace(/-/g, '_');
const needs = n => /[A-Z-]/.test(n);

module.exports = {
  id: 'names',
  title: 'mod macro names to lowercase_with_underscores',
  newName, needs,
  plan(ctx) {
    const m = ctx.model, changes = [], cases = [];
    const cand = [...m.byName.keys()].filter(n => needs(n) && m.owner.get(n) === 'mod' && m.byName.get(n).defs.length).sort();
    const target = new Map();
    for (const n of cand) { const t = newName(n); if (!target.has(t)) target.set(t, []); target.get(t).push(n); }
    const ren = new Map();
    for (const n of cand) {
      const t = newName(n), x = m.byName.get(n);
      const why = [];
      if (m.byName.has(t) || m.vanilla.defined.has(t) || m.vanilla.called.has(t)) why.push(`"${t}" already exists`);
      if (target.get(t).length > 1) why.push(`${target.get(t).map(s => '"' + s + '"').join(' and ')} would all become "${t}"`);
      const dm = m.dynMatch(n); if (dm) why.push(`built dynamically by "${dm.name}" (${dm.key}${dm.line ? ':' + dm.line : ''})`);
      const out = [...x.defs, ...x.calls].find(s => !s.scope); if (out) why.push(`used in ${out.rel}:${out.line}, outside the edited files`);
      if (/[\\"%]/.test(n)) why.push('name holds an escape or %');
      if (why.length) { cases.push({ id: 'names-skip', title: `"${n}" not renamed`, detail: why.join('; ') }); continue; }
      ren.set(n, t);
    }
    const perFile = new Map();
    const add = (rel, span, line, kind, a, b) => { if (!perFile.has(rel)) perFile.set(rel, []); perFile.get(rel).push({ span, line, kind, a, b }); };
    for (const [n, t] of ren) {
      const x = m.byName.get(n);
      for (const d of x.defs) add(d.rel, d.nameSpan, d.line, 'define', n, t);
      for (const c of x.calls) add(c.rel, c.nameSpan, c.line, c.def ? 'call_in_macro' : 'call', n, t);
    }
    for (const [rel, eds] of perFile) {
      const F = m.files.get(rel.toLowerCase());
      let s = ctx.read(rel).toString('latin1');
      if (s !== F.s) throw new Error(`names: ${rel} changed since the model was built`);   // all sites of a name or none
      eds.sort((p, q) => q.span[0] - p.span[0]);
      for (const e of eds) { if (s.slice(e.span[0], e.span[1]) !== e.a) throw new Error(`names: span mismatch in ${rel}:${e.line}`); s = s.slice(0, e.span[0]) + e.b + s.slice(e.span[1]); }
      changes.push({ file: rel, after: Buffer.from(s, 'latin1'), create: false, rows: eds.reverse().map(e => ({ line: e.line, kind: e.kind, before: e.a, after: e.b, note: '' })) });
    }
    return { changes, cases };
  },
};
