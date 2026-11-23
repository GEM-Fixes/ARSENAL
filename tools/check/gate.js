// check/gate: reach gate + cross-linter dedupe of doctor rows goals A + E). pure, no I/O.
//   gate (A): a crash-severity sample whose root file the engine never loads drops to 'review', code kept, gated:true + note:
//     - .def under resource/entity/ that wouldload --reach-all marks ORPHAN: "nothing in the mod uses this unit"
//     - .def outside resource/entity/: the engine indexes only /entity/**/*.def [V]
//     - entity .mdl/.ply nothing names (reachAll.unrefFiles), or any file of an entity folder whose defs are all ORPHAN
//     - .def that an ENTITY_REDEFINITION row marks "is ignored" (another def of that name mounts first and wins, ENG-04 [I]), or any file of a
//       folder whose mod defs are all such losers (folder rule needs reach info to list the folder's defs): "another def with this name wins" (check-false R3)
//     everything else (maps, sets, interaction, ui, reachable or unknown defs) stays crash. no reach info (not mounted, REFUSED) = only the R3 def rule.
//     root = the last [via file:line] of the message (the file the engine opens first), else the sample file.
//   dedupe (E): same file:line + same code from several tools -> one item, stronger tool kept, others in `also`;
//     known same-meaning code pairs (OVERRIDE) -> winner kept, loser named in `also`; identical code+file+line repeats -> one item with
//     `repeat` (msgs joined); MACRO_UNDEFINED / STR_MACRO_UNDEFINED after an INCLUDE_MISSING of the same file fold into it ("+N ...").
//   counts are rebuilt from the deduped items; doctor counts above the sample list (hidden lines) stay on the original row.
// Author: Imperator_Aug (ARSENAL, ia-9233440d)
const RANK = { crash: 0, silent: 1, review: 2, cosmetic: 3 };
const TOOL_PREF = ['sdllint', 'refcheck', 'wouldload', 'binhdr', 'strlint', 'milint'];   // same code on one line: first listed wins
// [winner, loser]: one line, one meaning, two codes (check-false.md dedupe rules 3-8)
const OVERRIDE = [['DISABLED_ON', 'TAG_SWALLOWS'], ['SDL_DISABLED_TAG', 'TAG_SWALLOWS'], ['HASH_COMMENT', 'IDENT_SPLIT'], ['HASH_COMMENT', 'NUMBER_GLUED'],
  ['MACRO_UNDEFINED', 'STR_MACRO_UNDEFINED'], ['MIS_BOT_UNIT_UNKNOWN', 'MIS_BOT_DEAD_KEY']];
const ORPHAN_NOTE = 'nothing in the mod uses this unit';
const REDEF_NOTE = 'another def with this name wins';
// ENTITY_REDEFINITION samples of the rows -> Set of ignored def keys (only the "this file ... is ignored" wording: the loser)
function ignoredDefs(rows) {
  const out = new Set();
  for (const r of rows) if (r.code === 'ENTITY_REDEFINITION' && r.samples) for (const s of r.samples) if (/this file \[[^\]]*\] is ignored/.test(String(s.msg || ''))) out.add(keyOf(s.file));
  return out;
}

// sample file -> vfs-like key: forward slashes, lowercase, pak entry -> resource/<entry>
function keyOf(f) {
  let k = String(f || '').replace(/\\/g, '/').toLowerCase();
  const b = k.indexOf('.pak!') >= 0 ? k.indexOf('.pak!') + 5 : k.indexOf('.pat!') >= 0 ? k.indexOf('.pat!') + 5 : -1;
  if (b >= 0) k = 'resource/' + k.slice(b);
  const r = k.indexOf('resource/'); if (r > 0) k = k.slice(r);
  return k;
}
function rootOf(s) {
  const all = [...String(s.msg || '').matchAll(/\[via ([^\]]+?):\d+\]/g)];
  return keyOf(all.length ? all[all.length - 1][1] : s.file);
}
// reach = wouldload exes[t].reachAll {defs, unrefFiles} -> fn(sample) -> note | null
// ignored: Set of def keys ENTITY_REDEFINITION marks as losers (R3; works without reach for the def itself)
// never: Set of keys the engine never opens for another reason (check/incscan: an .inc nothing includes)
const MPMI_NOTE = 'not a multiplayer mission: under map/multi the game lists a .mi only when its name is a game mode and skips the others';
const INC_NOTE = 'no file includes this .inc, so the game never reads it';
function gateFor(reach, ignored = new Set(), never = null) {
  const inner = gateFor0(reach, ignored);
  return s => { const k = rootOf(s);
    if (/^resource\/map\/multi\/.*\/\d+\.mi$/.test(k)) return MPMI_NOTE;
    if (never && never.has(k)) return INC_NOTE;
    return inner(s); };
}
// crash rows whose root file is an .inc: the keys check.js asks incscan about
function incRoots(rows) { const out = new Set(); for (const r of rows) if (r.sev === 'crash' && r.samples) for (const s of r.samples) { const k = rootOf(s); if (/\.inc$/.test(k)) out.add(k); } return [...out]; }
function gateFor0(reach, ignored = new Set()) {
  const hasReach = !!(reach && reach.defs);
  if (!hasReach && !ignored.size) return () => null;
  const unref = new Set(hasReach ? reach.unrefFiles || [] : []), dirs = new Map();
  if (hasReach) for (const [k, r] of Object.entries(reach.defs)) { const d = k.slice(0, k.lastIndexOf('/')); const a = dirs.get(d) || { n: 0, orph: 0, lost: 0 }; a.n++; if (r === 'ORPHAN') a.orph++; if (ignored.has(k)) a.lost++; dirs.set(d, a); }
  return s => {
    const k = rootOf(s);
    if (!k.startsWith('resource/')) return null;
    if (ignored.has(k)) return REDEF_NOTE;
    if (k.startsWith('resource/entity/') && !k.endsWith('.def')) { const d = dirs.get(k.slice(0, k.lastIndexOf('/'))); if (d && d.n && d.lost === d.n) return REDEF_NOTE + ' (every def in this folder is a losing duplicate)'; }
    if (!hasReach) return null;
    if (k.endsWith('.def')) {
      if (!k.startsWith('resource/entity/')) return 'not an entity def: the engine indexes only resource/entity/**/*.def';
      return reach.defs[k] === 'ORPHAN' ? ORPHAN_NOTE : null;
    }
    if (!k.startsWith('resource/entity/')) return null;
    if (unref.has(k)) return 'nothing in the mod names this file';
    const d = dirs.get(k.slice(0, k.lastIndexOf('/')));
    return d && d.n && d.orph === d.n ? ORPHAN_NOTE + ' (every def in this folder is unused)' : null;
  };
}
const toolRank = t => { const i = TOOL_PREF.indexOf(t); return i < 0 ? TOOL_PREF.length : i; };
const better = (a, b) => RANK[a.sev] !== RANK[b.sev] ? RANK[a.sev] < RANK[b.sev] : toolRank(a.tool) <= toolRank(b.tool);

// rows: [{tool, code, n, sev, samples?}] (samples = every location doctor gave). opt: {reach, cap, severity(code)}
// -> {rows, gated, merged}
function apply(rows, opt = {}) {
  const gate = gateFor(opt.reach, ignoredDefs(rows), opt.never), out = [], items = [];
  let gated = 0, merged = 0;
  for (const r of rows) {
    if (!r.samples || !r.samples.length || r.tool === 'preflight') { out.push(r); continue; }
    const rest = Math.max(0, r.n - r.samples.length);
    if (rest) out.push({ tool: r.tool, code: r.code, n: rest, sev: r.sev, rest: true });
    for (const s of r.samples) {
      const it = { tool: r.tool, code: r.code, sev: r.sev, s: { ...s }, also: [], repeat: 1 };
      if (it.sev === 'crash') { const note = gate(s); if (note) { it.sev = 'review'; it.gated = true; it.note = note; gated++; } }
      items.push(it);
    }
  }
  // dedupe on file:line (null line: file + code only)
  const groups = new Map();
  for (const it of items) {
    const k = keyOf(it.s.file) + ':' + (it.s.line == null ? '-' + it.code : it.s.line);
    let g = groups.get(k); if (!g) groups.set(k, g = []);
    let hit = g.find(x => x.code === it.code);
    if (hit) {
      merged++;
      if (hit.tool === it.tool) { hit.repeat++; if (it.s.msg && !String(hit.s.msg).includes(it.s.msg) && hit.repeat <= 5) hit.s.msg += ' | ' + it.s.msg; continue; }
      if (better(it, hit)) { it.also.push(hit.tool, ...hit.also); it.repeat = hit.repeat; g[g.indexOf(hit)] = it; } else if (!hit.also.includes(it.tool)) hit.also.push(it.tool);
      continue;
    }
    const ov = OVERRIDE.find(([w, l]) => g.some(x => x.code === w) && it.code === l || g.some(x => x.code === l) && it.code === w);
    if (ov) {
      merged++;
      const lo = it.code === ov[1] ? it : g.find(x => x.code === ov[1]), wi = lo === it ? g.find(x => x.code === ov[0]) : it;
      wi.also.push(`${lo.code} [${lo.tool}]`, ...lo.also);
      if (lo !== it) g[g.indexOf(lo)] = wi;
      continue;
    }
    g.push(it);
  }
  let all = [...groups.values()].flat();
  // macro follow-ons of a missing include in the same file (any tool): fold into the first INCLUDE_MISSING
  const inc = new Map();
  for (const it of all) if (it.code === 'INCLUDE_MISSING') { const f = keyOf(it.s.file), o = inc.get(f); if (!o || (it.s.line || 0) < (o.s.line || 0)) inc.set(f, it); }
  if (inc.size) {
    const fold = new Map();
    all = all.filter(it => {
      if (!/^(STR_)?MACRO_UNDEFINED$/.test(it.code)) return true;
      const h = inc.get(keyOf(it.s.file));
      if (!h || (it.s.line || 0) <= (h.s.line || 0)) return true;
      fold.set(h, (fold.get(h) || 0) + it.repeat); merged++; return false;
    });
    for (const [h, k] of fold) h.note = (h.note ? h.note + '; ' : '') + `+${k} macro${k > 1 ? 's' : ''} from the missing include (follow-ons, not counted)`;
  }
  // rebuild rows: tool + code + sev (+ gated)
  const byRow = new Map();
  for (const it of all) {
    const k = [it.tool, it.code, it.sev, it.gated ? 'g' : ''].join('|');
    let r = byRow.get(k); if (!r) byRow.set(k, r = { tool: it.tool, code: it.code, n: 0, sev: it.sev, samples: [], ...(it.gated ? { gated: true, note: it.note } : {}) });
    r.n++;
    const s = it.s;
    if (it.also.length) s.also = [...new Set(it.also)];
    if (it.repeat > 1) s.repeat = it.repeat;
    if (it.note) s.note = it.note;
    r.samples.push(s);
  }
  for (const r of byRow.values()) {
    const rest = out.find(x => x.rest && x.tool === r.tool && x.code === r.code && x.sev === r.sev && !r.gated);
    if (rest) { r.n += rest.n; out.splice(out.indexOf(rest), 1); }
    if (opt.cap != null) r.samples = opt.cap ? r.samples.slice(0, opt.cap) : undefined;
    if (r.gated) { const notes = new Set(r.samples ? r.samples.map(s => s.note) : []); if (notes.size > 1) r.note = [...notes].join('; '); }
    out.push(r);
  }
  for (const r of out) delete r.rest;
  return { rows: out, gated, merged };
}
// the reach info for the gate: the TARGET build's wouldload --reach-all only (W = wouldload --json). No other game's reach stands in
// when the target has none (c-port3: overlapping runs, a target pass with no reach, another game's ORPHAN gated real crash rows)
function reachFor(W, target) { const e = W && W.exes && W.exes[target], a = e && e.reachAll; return a && a.defs ? a : null; }
module.exports = { apply, gateFor, reachFor, incRoots, MPMI_NOTE, INC_NOTE, keyOf, rootOf, ignoredDefs, ORPHAN_NOTE, REDEF_NOTE };
