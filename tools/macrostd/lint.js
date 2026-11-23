// macrostd/lint: macro findings of a mod (lib/report contract).
//   PARAM_PREFIX      one define uses %s and %sl (s a strict prefix, SDL-56): "(crash-risk)" finding when a call passes s(..) and not
//                     sl(..), so %sl expands to <s value>l; else "(review)" as info (not counted)
//   DEFINE_DUP_SAME   name defined in more than one mod file, same body (whitespace/comments ignored)
//   DEFINE_DUP_DIFF   same, other bodies: which one a reader sees depends on the include order (SDL-17, PORT-61)
//   DEFINE_DEAD       mod-owned define nothing calls (mod, vanilla, dynamic names) -> step dead
//   CALL_UNDEFINED    sdlx expansion of every root (mod + vanilla roots reaching mod files) says define not found (GPL-11, SDL-17):
//                     at the mod file; in a vanilla file only when pure vanilla expands that root without it (PORT-55). Info only
//                     when the root is not read on its own by the engine (see standalone below)
//   NAME_STYLE        mod-owned name with capitals or '-' -> step names (SDL-18: names are exact)
//   INCLUDE_MISSING   include resolves to no mod or vanilla file (TST-108: fatal File not found when read)
//   info DEFINE_NO_HEADER  mod-owned define without a comment line directly above it
// Author: Imperator_Aug (ARSENAL, ia-247c787a)
const path = require('path');
const { makeSide, expand } = require('./expand');
const dead = require('./steps/dead'), names = require('./steps/names');

const norm = b => b.replace(/"(?:[^"\\\r\n]|\\.)*"|;[^\r\n]*/g, x => x[0] === ';' ? ' ' : x).replace(/\s+/g, ' ').trim();
// roots the engine reads on their own whatever includes them: entity .def, set/stuff (stuffs), set/breed (TST-108). Other roots
// (orphan .inc/.ext, multiplayer units files nothing includes) may never be read: their CALL_UNDEFINED is info
const standalone = k => /\.def$/.test(k) || k.startsWith('resource/set/stuff/') || k.startsWith('resource/set/breed/');
const undefName = msg => { const r = /define not found: "([^"]*)"/.exec(msg); return r ? r[1] : '?'; };

function lint(m, rep, o = {}) {
  const scopeDefs = m.defines.filter(d => d.scope);
  // PARAM_PREFIX
  for (const d of scopeDefs) {
    const P = d.params.named;
    for (const s of P) for (const l of P) {
      if (l.length <= s.length || !l.startsWith(s)) continue;
      const x = m.byName.get(d.name);
      const bad = (x ? x.calls : []).find(c => c.params.some(p => p.name === s) && !c.params.some(p => p.name === l));
      (bad ? rep.add : rep.info)(d.rel, d.line, 'PARAM_PREFIX', bad
        ? `(crash-risk) "${d.name}": %${s} is a prefix of %${l}; ${bad.rel}:${bad.line} passes ${s}(..) without ${l}(..), so %${l} becomes <${s}>${l.slice(s.length)} (SDL-56)`
        : `(review) "${d.name}": %${s} is a prefix of %${l}; a call passing ${s}(..) without ${l}(..) would turn %${l} into <${s}>${l.slice(s.length)} (SDL-56)`);
    }
  }
  // DEFINE_DUP_*
  for (const [n, x] of m.byName) {
    const ds = x.defs.filter(d => d.scope);
    if (new Set(ds.map(d => d.key)).size < 2) continue;
    const first = ds[0];
    for (const d of ds.slice(1)) {
      if (d.key === first.key) continue;
      const same = norm(d.body) === norm(first.body);
      rep.add(d.rel, d.line, same ? 'DEFINE_DUP_SAME' : 'DEFINE_DUP_DIFF', `"${n}" also defined in ${first.rel}:${first.line}` + (same ? ' (same body)' : ' with another body: the reader keeps the last one it read'));
    }
  }
  for (const d of scopeDefs) {
    if (dead.isDead(m, d)) rep.add(d.rel, d.line, 'DEFINE_DEAD', `"${d.name}" (mod macro) is never called in mod or vanilla files`);
    if (d.owner === 'mod' && names.needs(d.name)) rep.add(d.rel, d.line, 'NAME_STYLE', `"${d.name}" has capitals or '-': standard is "${names.newName(d.name)}" (step names)`);
    if (d.owner === 'mod' && !d.header.length) rep.info(d.rel, d.line, 'DEFINE_NO_HEADER', `"${d.name}" has no comment line above it`);
  }
  for (const i of m.includes) if (i.where === 'missing' && m.files.get(i.key).scope) rep.add(i.rel, i.line, 'INCLUDE_MISSING', `include "${i.raw}" resolves to ${i.target}: no such file in the mod or vanilla`);
  // CALL_UNDEFINED through sdlx
  if (o.noExpand) return;
  const side = makeSide({ dir: path.resolve(m.modDir), vanilla: m.vanilla, gameDir: m.gameDir });
  let pure = null;
  const seen = new Set();
  const relOf = k => (m.files.get(k) || { rel: k }).rel;
  const roots = [...m.roots.mod, ...m.roots.vanilla];
  let n = 0;
  for (const k of roots) {
    if (o.progress && ++n % 1000 === 0) o.progress(`lint: ${n}/${roots.length} roots`);
    const r = expand(side, k, m.preInclude(k));
    if (!r) continue;
    const und = r.errs.filter(e => e.code === 'MACRO_UNDEFINED');
    if (!und.length) continue;
    let vErr = null;
    for (const e of und) {
      const name = undefName(e.msg);
      const key = String(e.file).toLowerCase();
      if (m.files.has(key)) {
        const id = key + ':' + e.line + ':' + name;
        if (seen.has(id)) continue; seen.add(id);
        (standalone(k) ? rep.add : rep.info)(relOf(key), e.line, 'CALL_UNDEFINED', `"${name}" is not defined in the include chain of ${relOf(k)} (mod or vanilla): fatal define not found when read (GPL-11)` +
          (standalone(k) ? '' : '; nothing includes that file and the engine may never read it on its own [I]'));
      } else {
        if (!vErr) { pure = pure || makeSide({ dir: path.join(path.resolve(m.modDir), '.macrostd-no-such-dir'), vanilla: m.vanilla, gameDir: m.gameDir }); const v = expand(pure, k, m.preInclude(k)); vErr = new Set((v ? v.errs : []).filter(x => x.code === 'MACRO_UNDEFINED').map(x => x.file + ':' + x.line + ':' + x.msg)); }
        if (vErr.has(e.file + ':' + e.line + ':' + e.msg)) continue;
        const id = key + ':' + e.line + ':' + name;
        if (seen.has(id)) continue; seen.add(id);
        rep.add(relOf(k), 0, 'CALL_UNDEFINED', `"${name}" called at ${e.file}:${e.line} is no longer defined once the mod's files are in (PORT-55/61)`);
      }
    }
  }
}

module.exports = { lint, norm };
