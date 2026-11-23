// macrostd step params: parameter names with no prefix clashes (A3, SDL-56). A define whose named parameters include one that is a
//   strict prefix of another (%c and %cw) gets whole-word names, in the body (%x) and at every call site that reaches it (x(..)).
//   Buy-list macros (defines in set/multiplayer/units/*.set) are step buylist's job and left alone (case params-buylist): buylist
//   flattens the cards into unit_* macros with whole-word names, and renamed old parameters cost it most of its conversions. With
//   env MACROSTD_PARAMS_UNITS=1 (and no buylist in the run / no unit_* in units/_macros.inc) they take the fixed map below:
//   c charge, sc score, cw weight, cp points, t tags, s side, g group, b button, f fore, n crew, nN crewN, cN memberN, i icon (N any
//   number; a family with a member >= 10 is zero-padded, crew01..crew12, so crew1 is no prefix of crew10).
//   Other defines: only the short parameter of a clash is renamed: <p>_main when <p><digits> exists (body, body2 -> body_main), else
//   the word the value feeds: {thickness %t} inside {setting "turret"} -> turret_mm; {key %p} -> key ({parameters "x"} adds x_);
//   q(%p) -> q.
//   Call sites come from the same root-by-root resolution as step share (steps/share.js resolveAll). Left alone (case when the
//   define has a clash): a define whose name a live vanilla file calls (PORT-55/61), a define reached by a call in a vanilla file,
//   outside the edited files, or with a built name, a define holding another define, a parameter pair a call passes only the short
//   one of while the body uses the long one (sdlx pastes <short value><rest> there today: renaming would change the data), a call
//   that reaches 2 defines whose new names differ for a passed parameter. Positional macros (%0, args) are never touched.
//   Proof: every root touching a changed file expands to the same sdlx tokens + error codes (share.prove); a differing root drops
//   the defines whose edits it reaches (case params-proof).
// Author: Imperator_Aug (ARSENAL, ia-9b9fae2f)
const fs = require('fs'), path = require('path');
const share = require('./share');

const UNITS_RE = /^resource\/set\/multiplayer\/units\/.*\.set$/;
const UNITS_MAP = { c: 'charge', sc: 'score', cw: 'weight', cp: 'points', t: 'tags', s: 'side', g: 'group', b: 'button', f: 'fore', n: 'crew', i: 'icon' };
const strictPrefix = (a, b) => b.length > a.length && b.startsWith(a);
const clashes = P => { const out = []; for (const a of P) for (const b of P) if (strictPrefix(a, b)) out.push([a, b]); return out; };
const okWord = w => /^[a-z][a-z0-9_]*$/.test(w);

function bodyNamed(body) {
  const out = [];
  for (const x of body.matchAll(/%(\w+)/g)) if (!/^\d+$/.test(x[1]) && !out.includes(x[1])) out.push(x[1]);
  return out;
}

function unitsMap(named) {
  const map = new Map();
  const maxOf = re => Math.max(0, ...named.map(p => re.exec(p)).filter(Boolean).map(r => r[1].length > 1 || +r[1] >= 10 ? 2 : 1));
  const padC = maxOf(/^c(\d+)$/) > 1, padN = maxOf(/^n(\d+)$/) > 1;
  for (const p of named) {
    let r;
    if (UNITS_MAP[p]) map.set(p, UNITS_MAP[p]);
    else if ((r = /^n(\d+)$/.exec(p))) map.set(p, 'crew' + (padN ? r[1].padStart(2, '0') : r[1]));
    else if ((r = /^c(\d+)$/.exec(p))) map.set(p, 'member' + (padC ? r[1].padStart(2, '0') : r[1]));
  }
  return map;
}

// the word the value of %p feeds, from the body text
function contextWord(body0, p) {
  const body = body0.replace(/"(?:[^"\\\r\n]|\\.)*"|;[^\r\n]*/g, x => x[0] === ';' ? ' '.repeat(x.length) : x);   // comments out, same offsets
  const re = new RegExp('%' + p + '(?!\\w)');
  const m = re.exec(body);
  if (!m) return null;
  const at = m.index;
  const call = /(\w+)\([^()]*$/.exec(body.slice(Math.max(0, at - 60), at));
  if (call) return call[1].length >= 4 && !/^\d/.test(call[1]) ? call[1].toLowerCase() : null;
  // enclosing blocks, innermost first
  const chain = [];
  let d = 0;
  for (let k = at - 1; k >= 0 && chain.length < 4; k--) {
    const ch = body[k];
    if (ch === '}') d++;
    else if (ch === '{') { if (d) d--; else { const w = /^\{\s*("?)([A-Za-z_][\w\-]*)\1?\s*("([^"]*)")?/.exec(body.slice(k, k + 80)); chain.push(w ? { key: w[2], str: w[4] || null } : { key: null }); } }
  }
  const named = chain.filter(c => c.key && !/^\d/.test(c.key));
  if (!named.length) return null;
  const inner = named[0];
  const snake = w => w.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (inner.key.toLowerCase() === 'thickness') { const st = named.find(c => c.key.toLowerCase() === 'setting' && c.str); return st ? snake(st.str.replace(/\*/g, '')) + '_mm' : 'mm'; }
  const par = named.find(c => c.key.toLowerCase() === 'parameters' && c.str);
  return snake((par ? par.str + '_' : '') + inner.key);
}

function wordMap(named) {
  return (body) => {
    const map = new Map();
    for (const [a, b] of clashes(named)) {
      if (map.has(a)) continue;
      const cw = contextWord(body, a);
      let w = null;
      if (cw && /_mm$/.test(cw)) w = cw;                                                       // {setting "x" {thickness %p}}
      else if (named.some(q => q !== a && new RegExp('^' + a + '_?\\d+$').test(q))) w = a + '_main';   // body, body2
      else if (a.length <= 3) w = cw;                                                           // abbreviation: the key it feeds
      else w = a + '_main';
      if (w && okWord(w) && w !== a) map.set(a, w);
      void b;
    }
    return map;
  };
}

// drop renames until the final names are unique and prefix-free (only renamed names are dropped)
function settle(named, map, frozen) {
  for (const p of frozen) map.delete(p);
  for (;;) {
    const fin = named.map(p => [p, map.get(p) || p]);
    let drop = null;
    for (const [p, a] of fin) {
      for (const [q, b] of fin) {
        if (p === q) continue;
        if (a === b || strictPrefix(a, b)) { drop = map.has(p) ? p : map.has(q) ? q : null; if (drop) break; }
      }
      if (drop) break;
    }
    if (!drop) return map;
    map.delete(drop);
  }
}

function plan(ctx) {
  const m = ctx.model, cases = [];
  const live = share.liveVanillaCalled(m);
  const view = share.makeView(ctx, null);
  const R = share.resolveAll(ctx, view);
  // step buylist converts the buy cards to unit_* macros with whole-word parameters and keeps the old card macros defined. When it is
  // part of this run or has run (units/_macros.inc defines unit_* macros), the buy-list macros are its job: left alone here.
  const only = (ctx.opts && ctx.opts.only) || [];
  const inc = R.defs && [...R.defs.values()].some(x => x.key === 'resource/set/multiplayer/units/_macros.inc' && /^unit_/.test(x.d.name));
  // measured on RobZ: params before buylist cuts buylist from 2426 to 1010 rows (122 cases instead of 16), so the map is opt-in
  const buylist = only.includes('buylist') || !!inc || process.env.MACROSTD_PARAMS_UNITS !== '1';
  let leftToBuylist = 0;
  let clashDefs = 0;
  // body as the word finder reads it: call parameters inside it that the previous pass renames carry their new names
  const ctxBody = (def, body, prev) => {
    if (!prev) return body;
    const [a, b] = def.d.bodySpan, eds = [];
    for (const w of prev.values()) for (const st of w.sites) if (st.key === def.key) for (const p of st.c.params) {
      const to = w.map.get(p.name);
      if (to && p.nameSpan[0] >= a && p.nameSpan[1] <= b) eds.push({ a: p.nameSpan[0] - a, b: p.nameSpan[1] - a, t: to });
    }
    const seen = new Set();
    return share.applyEdits(body, eds.filter(e => { const k = e.a + ':' + e.b; if (seen.has(k)) return false; seen.add(k); return true; }));
  };
  const collect = (prev, cases) => {
  const work = new Map();
  clashDefs = 0; leftToBuylist = 0;
  for (const def of R.defs.values()) {
    if (!def.rec.mod || !def.rec.scope) continue;
    const d = def.d, body = def.rec.s.slice(d.bodySpan[0], d.bodySpan[1]);
    const named = bodyNamed(body);
    if (!named.length) continue;
    const units = UNITS_RE.test(def.key);
    if (units && buylist) { if (clashes(named).length) leftToBuylist++; continue; }
    const cl = clashes(named);
    if (cl.length) clashDefs++;
    if (!cl.length && !units) continue;
    const where = `${def.rec.rel}:${def.rec.sc.lineOf(d.span[0])}`;
    const skip = why => { if (cl.length) cases.push({ id: 'params-skip', title: `"${d.name}" ${where}: parameters kept`, detail: why + `; clash ${cl.map(x => x.join('/')).join(', ')}` }); };
    if (live.has(d.name)) { skip('a live vanilla file calls this name (PORT-55)'); continue; }
    if (d.inDefine >= 0 || !d.closed || def.rec.sc.defines.some(x => x.inDefine === def.i)) { skip('nested or unclosed define'); continue; }
    const sites = [...def.sites].map(id => R.sites.get(id));
    const out = sites.find(s => !s.rec.mod || !s.rec.scope || s.dyn);
    if (out) { skip(`call ${out.rec.rel}:${out.rec.sc.lineOf(out.c.span[0])} is ${!out.rec.mod ? 'in a vanilla file' : !out.rec.scope ? 'outside the edited files' : 'a built name'}`); continue; }
    // pairs a call passes only the short one of while the body uses the long one: sdlx pastes there today, renaming would change data
    const frozen = new Set(), risky = [], unpassed = [];
    for (const s of sites) {
      const passed = new Set(s.c.params.map(p => p.name));
      if (s.c.args.length) continue;
      for (const w of named) if (!passed.has(w)) {
        let pasted = false;
        for (const p of passed) if (strictPrefix(p, w)) { pasted = true; frozen.add(p); frozen.add(w); risky.push(`${s.rec.rel}:${s.rec.sc.lineOf(s.c.span[0])} passes ${p}(..) not ${w}(..)`); }
        if (!pasted && !frozen.has(w)) { frozen.add(w); unpassed.push(`${w}: ${s.rec.rel}:${s.rec.sc.lineOf(s.c.span[0])}`); }
      }
    }
    if (unpassed.length && cl.length) cases.push({ id: 'params-unpassed', title: `"${d.name}" ${where}: ${unpassed.map(x => x.replace(/:.*/, '')).join(', ')} kept`, detail: `a call does not pass it, so "%name" stays literally in the data (SDL-21) and a new name would change it: ${unpassed.slice(0, 3).join('; ')}` });
    let map = units ? unitsMap(named) : wordMap(named)(ctxBody(def, body, prev));
    map = settle(named, map, frozen);
    if (risky.length && cl.length) cases.push({ id: 'params-paste', title: `"${d.name}" ${where}: ${[...frozen].sort().join(', ')} kept`, detail: `sdlx pastes <short value><rest> today (SDL-56), renaming would change the data: ${[...new Set(risky)].slice(0, 3).join('; ')}` });
    if (!map.size) continue;
    work.set(def.id, { def, named, map, sites, body, where });
  }
  return work;
  };
  // the words of one define can come from the new names of the macros it calls: collect until the maps settle
  let work = collect(null, []);
  for (let i = 0; i < 4; i++) {
    const tmp = [], next = collect(work, tmp);
    const same = next.size === work.size && [...next].every(([id, w]) => work.has(id) && [...w.map].every(([k, v]) => work.get(id).map.get(k) === v) && w.map.size === work.get(id).map.size);
    work = next;
    if (same || i === 3) { cases.push(...tmp); break; }
  }
  // a call that reaches several defines: the passed names must map the same way
  for (let changed = true; changed;) {
    changed = false;
    for (const s of R.sites.values()) {
      const ws = [...s.refs].filter(id => R.defs.get(id) && (work.has(id) || s.refs.size > 1));
      if (ws.length < 2) continue;
      for (const p of s.c.params) {
        const to = new Set(ws.map(id => work.has(id) ? (work.get(id).map.get(p.name) || p.name) : p.name));
        if (to.size < 2) continue;
        for (const id of ws) if (work.has(id) && work.get(id).map.has(p.name)) {
          const w = work.get(id); w.map.delete(p.name); settle(w.named, w.map, []); changed = true;
          cases.push({ id: 'params-shared-call', title: `"${w.def.d.name}" ${w.where}: ${p.name} kept`, detail: `${s.rec.rel}:${s.rec.sc.lineOf(s.c.span[0])} reaches several defines that would name it differently` });
        }
      }
    }
  }
  for (const [id, w] of work) if (!w.map.size) work.delete(id);

  const render = W => {
    const eds = new Map(), rows = new Map(), touched = new Map();
    const ed = (rec, a, b, t, row, id) => {
      if (!eds.has(rec.key)) { eds.set(rec.key, { rec, list: [] }); rows.set(rec.key, []); }
      eds.get(rec.key).list.push({ a, b, t }); rows.get(rec.key).push(row);
      if (!touched.has(id)) touched.set(id, new Set()); touched.get(id).add(rec.key);
    };
    for (const [id, w] of W) {
      const d = w.def.d, rec = w.def.rec;
      const line = rec.sc.lineOf(d.span[0]);
      for (const x of w.body.matchAll(/%(\w+)/g)) {
        const to = w.map.get(x[1]);
        if (!to) continue;
        const a = d.bodySpan[0] + x.index + 1;
        ed(rec, a, a + x[1].length, to, { line: rec.sc.lineOf(a), kind: 'param_body', before: '%' + x[1], after: '%' + to, note: `in "${d.name}" (line ${line})` }, id);
      }
      for (const s of w.sites) for (const p of s.c.params) {
        const to = w.map.get(p.name);
        if (!to) continue;
        ed(s.rec, p.nameSpan[0], p.nameSpan[1], to, { line: s.rec.sc.lineOf(p.nameSpan[0]), kind: 'param_call', before: p.name, after: to, note: `call of "${d.name}"` }, id);
      }
    }
    const overlay = new Map();
    for (const [key, e] of eds) {
      // a call site reached through 2 defines gets the same edit twice
      const seen = new Set(), list = e.list.filter(x => { const k = x.a + ':' + x.b; if (seen.has(k)) return false; seen.add(k); return true; });
      overlay.set(key, { s: share.applyEdits(e.rec.s, list), rel: e.rec.rel });
      const rs = new Set(); rows.set(key, rows.get(key).filter(r => { const k = r.line + r.before + r.after + r.kind; if (rs.has(k)) return false; rs.add(k); return true; }));
    }
    return { overlay, rows, touched };
  };

  let out = render(work);
  for (let round = 0; out.overlay.size; round++) {
    const bad = share.prove(ctx, R, out.overlay);
    if (!bad.length) break;
    const b = bad[0];
    const cands = [...out.touched].filter(([id, ks]) => [...ks].some(k => b.vis && b.vis.has(k))).map(([id]) => id);
    const passes = S => { const W = new Map([...work].filter(([id]) => !S.includes(id))); return !share.prove(ctx, { roots: [b.root], rootFiles: R.rootFiles }, render(W).overlay).length; };
    let found = null; const S = [];
    for (const id of cands.slice(0, 80)) { S.push(id); if (passes(S)) { found = S; break; } }
    if (found) for (let i = found.length - 2; i >= 0; i--) { const T = found.filter((x, j) => j !== i); if (passes(T)) found = T; }
    if (!found) found = cands;
    if (!found.length || round > 40) { cases.push({ id: 'params-proof', title: 'params stopped', detail: `${b.root} differs (${b.why})` }); return { changes: [], cases }; }
    for (const id of found) { const w = work.get(id); cases.push({ id: 'params-proof', title: `"${w.def.d.name}" ${w.where}: parameters kept`, detail: `${b.root} would change ${b.why}` }); work.delete(id); }
    out = render(work);
  }
  const changes = [];
  let nParams = 0;
  for (const w of work.values()) nParams += w.map.size;
  for (const [key, o] of out.overlay) {
    const create = !ctx.exists(o.rel);
    changes.push({ file: o.rel, after: Buffer.from(o.s, 'latin1'), create, rows: out.rows.get(key).sort((a, b) => a.line - b.line) });
  }
  if (leftToBuylist) cases.push({ id: 'params-buylist', title: `${leftToBuylist} buy-list macros with prefix clashes left to step buylist`, detail: 'buylist converts their cards to unit_* macros with whole-word parameters; the old macros keep their names for the cards it does not convert' });
  return { changes, cases, stats: { defines: work.size, params: nParams, clashDefs } };
}

module.exports = { id: 'params', title: 'macro parameter names: whole words, no name a prefix of another (SDL-56)', plan, unitsMap, contextWord, settle, clashes };
