// macrostd step share: one place per macro family, one body per name (A5 + A6). Works on names defined in more than one mod file
//   (lint DEFINE_DUP_SAME / DEFINE_DUP_DIFF).
//   Call resolution: every root (mod roots + vanilla roots reaching mod files, stuff `.presets` first, SDL-50) is executed in include
//   order like sdlx (defines per top-level file, after the definition, SDL-17/GPL-11; macro bodies resolve their calls when expanded;
//   call names built with %x are substituted from the call's values). Each call site learns which define(s) it reaches.
//   1. Different bodies, same name: the bodies (comments/whitespace ignored) are grouped; call sites that reach defines of 2 groups tie
//      the groups. A group is pinned (keeps the name) when a call site in a vanilla file, outside the edited files, or with a built
//      name reaches it, or a call site also reaches a define outside the edited mod files. The pinned group, else the group with the
//      most call sites, keeps the name; every other single-body group gets "<name>_<words>" (words the body has and the kept body
//      lacks, or "no_<word>"; else _v2, _v3), define + every call site it reaches renamed. Case when 2 groups must keep the name.
//   2. Same body in more than one file (after 1): ONE define in a shared file, every copy replaced by `(include "<shared>")` at its
//      spot (the first copy in a file; later copies in that file go). Shared files: crew_* -> properties/robz/crew.inc, volume* ->
//      properties/robz/volumes.inc, set/breed/mp/<side>/ copies -> set/breed/mp/robz_vet.inc, set/multiplayer/units/ copies ->
//      set/multiplayer/units/_macros.inc, else properties/robz/<first word of the name>.inc. Each starts with a comment listing its
//      defines; every define gets "; <name>: <what>" + param lines + e.g. line.
//   Proof in the plan: every root whose include closure touches a changed file is expanded with sdlx before and after (expand.js
//   tokens + error codes). A root that differs drops every name whose edits it reaches (case share-proof) and the plan is redone.
//   Rows SDL-17 SDL-18 SDL-50 SDL-56 GPL-11 PORT-55 PORT-61 TST-108 VFS-01.
// Author: Imperator_Aug (ARSENAL, ia-63575be4)
const fs = require('fs'), path = require('path');
const { scan } = require('../scan');
const sdlx = require('../../lib/sdlx');
const { expand, firstDiff, errKey } = require('../expand');
const model = require('../model');

const norm = b => b.replace(/"(?:[^"\\\r\n]|\\.)*"|;[^\r\n]*/g, x => x[0] === ';' ? ' ' : x).replace(/\s+/g, ' ').trim();
const MAX_DEPTH = 60;

// ---------------------------------------------------------------------------------------------------------------- file view
// view.get(key) -> rec { key, rel, s, sc, mod, scope, top:[ev], byDef: Map defIdx -> [ev] } | null
//   overlay: Map key -> { s, rel } (changed / created mod text); else model text, else a mod file on disk (ctx.read), else vanilla
function makeView(ctx, overlay) {
  const m = ctx.model, cache = new Map();
  const get = key => {
    if (cache.has(key)) return cache.get(key);
    let r = null;
    const F = m.files.get(key);
    if (overlay && overlay.has(key)) { const o = overlay.get(key); r = mkRec(key, o.rel, o.s, true, model.inScope(key)); }
    else if (F) r = mkRec(key, F.rel, F.s, true, F.scope, F.scan);
    else if (ctx.exists(key)) r = mkRec(key, key, ctx.read(key).toString('latin1'), true, model.inScope(key));
    else { const b = m.vanilla.read(key); if (b) r = mkRec(key, key, b.toString('latin1'), false, false); }
    cache.set(key, r);
    return r;
  };
  const buf = key => { const r = get(key); return r ? Buffer.from(r.s, 'latin1') : null; };
  return { get, buf };
}

// calls hidden in positional args: ("x" args ("y")) -> y runs when x's body uses %<arg index>
function hiddenOf(c, base) {
  const out = [];
  c.args.forEach((a, i) => {
    if (a.text[0] !== '(') return;
    const sc = scan(a.text), off = base + a.span[0], calls = [];
    for (const h of sc.calls) {
      if (h.inDefine >= 0) continue;
      calls.push(shift(h, off));
    }
    if (calls.length) out.push({ idx: String(i), calls });
  });
  return out;
}
function shift(c, off) {
  const sp = x => [x[0] + off, x[1] + off];
  const r = Object.assign({}, c, { span: sp(c.span), nameSpan: sp(c.nameSpan), params: c.params.map(p => Object.assign({}, p, { nameSpan: sp(p.nameSpan), valSpan: sp(p.valSpan) })), args: c.args.map(a => ({ text: a.text, span: sp(a.span) })) });
  r.hidden = hiddenOf(c, off);
  r.hidden.forEach(h => h.calls.forEach(x => { x.inner = true; }));
  return r;
}
function mkRec(key, rel, s, mod, scope, sc) {
  sc = sc || scan(s);
  const ev = [];
  sc.defines.forEach((d, i) => ev.push({ k: 'D', pos: d.span[0], in: d.inDefine, d, i }));
  for (const i of sc.includes) ev.push({ k: 'I', pos: i.span[0], in: i.inDefine, inc: i });
  for (const c of sc.calls) ev.push({ k: 'C', pos: c.span[0], in: c.inDefine, c: Object.assign({}, c, { hidden: hiddenOf(c, 0) }) });
  ev.sort((a, b) => a.pos - b.pos);
  const top = [], byDef = new Map();
  for (const e of ev) { if (e.in < 0) top.push(e); else { if (!byDef.has(e.in)) byDef.set(e.in, []); byDef.get(e.in).push(e); } }
  return { key, rel, s, sc, mod, scope, top, byDef };
}

// sdlx subst: params sorted, reversed, plain text replace of %name
function substText(text, P) {
  if (!P || text.indexOf('%') < 0) return text;
  for (const name of [...P.keys()].sort().reverse()) text = text.split('%' + name).join(P.get(name));
  return text;
}

// ---------------------------------------------------------------------------------------------------------------- resolver
// resolveAll(ctx, view) -> { sites: Map id -> site, defs: Map id -> def, rootFiles: Map root -> Set(keys), roots:[keys] }
//   site { id, key, rec, c, dyn (name built with %x), refs:Set(defId), undef }   def { id, key, rec, d, i, sites:Set(siteId) }
function resolveAll(ctx, view) {
  const m = ctx.model;
  const sites = new Map(), defs = new Map(), rootFiles = new Map();
  const defOf = (rec, i) => {
    const id = rec.key + '@' + rec.sc.defines[i].span[0];
    let x = defs.get(id);
    if (!x) defs.set(id, x = { id, key: rec.key, rec, d: rec.sc.defines[i], i, sites: new Set() });
    return x;
  };
  const siteOf = (rec, c) => {
    const id = rec.key + '@' + c.span[0];
    let x = sites.get(id);
    if (!x) sites.set(id, x = { id, key: rec.key, rec, c, dyn: false, refs: new Set(), undef: false });
    return x;
  };
  const roots = [...new Set([...m.roots.mod, ...m.roots.vanilla])];
  for (const root of roots) {
    const rec0 = view.get(root);
    if (!rec0) continue;
    const table = new Map(), visited = new Set(), incStack = [], macStack = [];
    const run = (e, rec, S, from, depth) => {
      if (e.k === 'D') {
        const name = S ? substText(e.d.name, S) : e.d.name;
        table.set(name, defOf(rec, e.i));
      } else if (e.k === 'I') {
        const raw = S ? substText(e.inc.raw, S) : e.inc.raw;
        if (raw.includes('%')) return;
        const r = sdlx.resolveInclude(raw, from);
        if (r.kind !== 'virtual' || incStack.includes(r.key) || incStack.length > MAX_DEPTH) return;
        const t = view.get(r.key);
        if (!t) return;
        visited.add(r.key);
        incStack.push(r.key);
        for (const x of t.top) run(x, t, null, r.key, depth);
        incStack.pop();
      } else invoke(e.c, rec, S, from, depth);
    };
    const invoke = (c, rec, S, from, depth) => {
      let name = c.name, dyn = false;
      if (name.includes('%')) { name = substText(name, S); dyn = true; }
      const site = siteOf(rec, c);
      if (dyn) site.dyn = true;
      if (name.includes('%')) { site.undef = true; return; }
      const ref = table.get(name);
      if (!ref) { site.undef = true; return; }
      site.refs.add(ref.id); ref.sites.add(site.id);
      if (depth > MAX_DEPTH || macStack.includes(name)) return;
      const P = new Map();
      if (c.args.length) c.args.forEach((a, i) => P.set(String(i), S ? substText(a.text, S) : a.text));
      for (const p of c.params) P.set(p.name, S ? substText(p.value, S) : p.value);
      const body = ref.rec.s.slice(ref.d.bodySpan[0], ref.d.bodySpan[1]);
      for (const h of c.hidden || []) if (body.includes('%' + h.idx)) for (const hc of h.calls) invoke(hc, rec, S, from, depth + 1);
      macStack.push(name);
      for (const e of ref.rec.byDef.get(ref.i) || []) run(e, ref.rec, P, from, depth + 1);
      macStack.pop();
    };
    visited.add(root);
    for (const p of m.preInclude(root)) {
      const t = view.get(p); if (!t) continue;
      visited.add(p); incStack.push(p);
      for (const x of t.top) run(x, t, null, p, 0);
      incStack.pop();
    }
    incStack.push(root);
    for (const x of rec0.top) run(x, rec0, null, root, 0);
    rootFiles.set(root, visited);
  }
  return { sites, defs, rootFiles, roots };
}

// ---------------------------------------------------------------------------------------------------------------- proof
// prove(ctx, R, overlay) -> [{ root, why }] roots whose sdlx expansion (tokens + error codes) changes with the overlay
function sideOf(ctx, overlay) {
  const m = ctx.model, cache = new Map();
  const get = key => {
    if (cache.has(key)) return cache.get(key);
    let b = null;
    if (overlay && overlay.has(key)) b = Buffer.from(overlay.get(key).s, 'latin1');
    else if (m.files.has(key)) b = Buffer.from(m.files.get(key).s, 'latin1');
    else if (ctx.exists(key)) b = ctx.read(key);
    else b = m.vanilla.read(key);
    cache.set(key, b);
    return b;
  };
  const open = r => {
    if (r.kind === 'fs') { const p = path.join(ctx.gameDir || '.', r.key); return fs.existsSync(p) ? { buf: fs.readFileSync(p), file: r.key, key: r.key } : null; }
    if (r.kind === 'user') return null;
    const b = get(r.key);
    return b ? { buf: b, file: r.key, key: r.key } : null;
  };
  return { get, open, has: k => !!get(k) };
}
function prove(ctx, R, overlay) {
  const changed = new Set(overlay.keys());
  const A = sideOf(ctx, null), B = sideOf(ctx, overlay), bad = [];
  for (const root of R.roots) {
    const vis = R.rootFiles.get(root);
    if (!vis || ![...changed].some(k => vis.has(k))) continue;
    const pre = ctx.model.preInclude(root);
    const a = expand(A, root, pre), b = expand(B, root, pre);
    if (!a || !b) { if (a || b) bad.push({ root, why: 'root missing on one side' }); continue; }
    const d = firstDiff(a.toks, b.toks);
    if (d) { bad.push({ root, why: `at ${d.path}: ${JSON.stringify(d.a)} -> ${JSON.stringify(d.b)}`, vis }); continue; }
    if (errKey(a.errs) !== errKey(b.errs)) bad.push({ root, why: 'sdlx error codes change', vis });
  }
  return bad;
}

// apply edits [{a, b, t}] (non-overlapping) to s
function applyEdits(s, eds) {
  const E = eds.slice().sort((x, y) => y.a - x.a);
  for (let i = 1; i < E.length; i++) if (E[i].b > E[i - 1].a) throw new Error(`overlapping edits at ${E[i].a}..${E[i].b} and ${E[i - 1].a}..${E[i - 1].b}`);
  for (const e of E) s = s.slice(0, e.a) + e.t + s.slice(e.b);
  return s;
}
const eolOf = s => { const i = s.indexOf('\n'); return i > 0 && s[i - 1] === '\r' ? '\r\n' : i >= 0 ? '\n' : '\r\n'; };
// live vanilla callers: names called by a vanilla file the mod does not overwrite
function liveVanillaCalled(m) {
  const set = new Set();
  for (const [k, f] of m.vanilla.files) if (!m.files.has(k)) for (const c of f.c) set.add(c);
  return set;
}

// ---------------------------------------------------------------------------------------------------------------- naming
const snake = w => w.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
const STOP = new Set(['forward', 'reverse', 'putoff', 'puton', 'if', 'else', 'not', 'and', 'or', 'args']);
function words(body) {
  const out = [];
  for (const x of norm(body).matchAll(/%?[A-Za-z_][A-Za-z0-9_]*/g)) {
    const w = snake(x[0].replace(/^%/, ''));
    if (w && !/^\d/.test(w) && !STOP.has(w) && !out.includes(w)) out.push(w);
  }
  return out;
}
function suffixes(baseBody, body, name) {
  const nameW = new Set(name.toLowerCase().split(/[_\-]+/));
  const strip = w => w.split('_').filter(x => !nameW.has(x)).join('_');
  const bw = new Set(words(baseBody)), ow = words(body), ows = new Set(ow);
  const fam = list => {   // door1 door2 -> two_doors (a numbered family counts as one word)
    const out = [], NUM = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    for (const w of list) {
      const r = /^(.*[a-z])_?(\d+)$/.exec(w);
      if (r) {
        const all = list.filter(x => new RegExp('^' + r[1] + '_?\\d+$').test(x));
        if (all.length > 1) { const t = (NUM[all.length] || all.length) + '_' + r[1] + 's'; if (!out.includes(t)) out.push(t); continue; }
      }
      out.push(w);
    }
    return out.filter(w => w.length >= 3);
  };
  const added = fam(ow.filter(w => !bw.has(w)).map(strip).filter(Boolean));
  const removed = fam([...bw].filter(w => !ows.has(w)).map(strip).filter(Boolean));
  const c = [];
  if (added.length) { c.push(added[0]); if (added.length > 1) c.push(added.slice(0, 2).join('_')); if (added.length > 2) c.push(added.slice(0, 3).join('_')); }
  if (removed.length) { c.push('no_' + removed[0]); if (removed.length > 1) c.push('no_' + removed.slice(0, 2).join('_')); }
  if (added.length && removed.length) c.push(added[0] + '_no_' + removed[0]);
  return [...new Set(c.map(x => snake(x)).filter(x => x && x.length <= 40))];
}

// shared file for a group of defines (keys)
const SHARED = [
  [(n, ks) => ks.every(k => /^resource\/set\/breed\/mp\/[^/]+\//.test(k)), 'resource/set/breed/mp/robz_vet.inc'],
  [(n, ks) => ks.every(k => /^resource\/set\/multiplayer\/units\//.test(k)), 'resource/set/multiplayer/units/_macros.inc'],
  [(n, ks) => ks.every(k => /^resource\/set\/stuff\//.test(k)), 'resource/properties/robz/weapon.inc'],
  [(n, ks) => ks.every(k => /^resource\/set\/interaction_entity\//.test(k)), 'resource/properties/robz/interaction.inc'],
  [n => /crew|place|get_off|_ik_/.test(n), 'resource/properties/robz/crew.inc'],
  [n => /volume|contact|glass|piece/.test(n), 'resource/properties/robz/volumes.inc'],
  [n => /^(armor|abm|components|accuracy|health|fg)/.test(n), 'resource/properties/robz/armor.inc'],
];
function sharedFor(name, keys) {
  const n = name.toLowerCase();
  for (const [t, f] of SHARED) if (t(n, keys)) return f;
  return 'resource/properties/robz/vehicle.inc';
}

// ---------------------------------------------------------------------------------------------------------------- header text
let whatOf = null;
try { whatOf = require('./header').whatOf; } catch (x) { whatOf = null; }
const ascii = s => s.replace(/[^\x20-\x7e]/g, '?');
function whatOfBody(body) {
  if (whatOf) { try { const w = whatOf(body); if (w) return w; } catch (x) {} }
  const bl = [];
  let d = 0;
  for (const x of norm(body).matchAll(/[{}]|"(?:[^"\\]|\\.)*"|[^\s{}"]+/g)) {
    const t = x[0];
    if (t === '{') { d++; continue; } if (t === '}') { d--; continue; }
    if (d === 1 && bl.length < 6) { const prev = x.input.slice(0, x.index).trimEnd(); if (prev.endsWith('{')) bl.push('{' + t + '}'); }
  }
  return bl.length ? bl.join(' ') : 'macro text';
}
function defHeader(name, body, desc, example) {
  const P = [];
  for (const x of body.matchAll(/%(\w+)/g)) if (!P.includes(x[1])) P.push(x[1]);
  const L = [`; ${name}: ${ascii(desc || whatOfBody(body))}`];
  for (const p of P) {
    const at = body.indexOf('%' + p);
    const pre = body.slice(Math.max(0, body.lastIndexOf('{', at)), at);
    const key = /^\{\s*([A-Za-z_][\w]*)/.exec(pre);
    L.push(`;   ${/^\d+$/.test(p) ? '%' + p : p} - ${key ? 'value in {' + key[1] + '}' : 'text it is pasted into'}`);
  }
  L.push(';   e.g. ' + ascii(example || `("${name}"${P.length ? ' ' + P.map(p => /^\d+$/.test(p) ? null : p + '(..)').filter(Boolean).join(' ') : ''})`).slice(0, 150));
  return L;
}

// ---------------------------------------------------------------------------------------------------------------- plan
function buildPlan(ctx, R, exclude, live, siteRen) {
  const m = ctx.model, cases = [];
  // body text as it will read: calls inside it that an earlier name's rename reaches carry the new name
  if (!R.byKey) { R.byKey = new Map(); for (const st of R.sites.values()) { if (!R.byKey.has(st.key)) R.byKey.set(st.key, []); R.byKey.get(st.key).push(st); } }
  const bodyOf = d => {
    if (!siteRen || !siteRen.size) return d.body;
    const [a, b] = d.bodySpan, eds = [];
    for (const st of R.byKey.get(d.key) || []) if (siteRen.has(st.id) && st.c.nameSpan[0] >= a && st.c.nameSpan[1] <= b) eds.push({ a: st.c.nameSpan[0] - a, b: st.c.nameSpan[1] - a, t: siteRen.get(st.id) });
    return eds.length ? applyEdits(d.body, eds) : d.body;
  };
  const scopeRec = k => { const F = m.files.get(k); return F && F.scope; };
  const names = [...m.byName.keys()].filter(n => {
    if (exclude.has(n)) return false;
    const ks = new Set(m.byName.get(n).defs.filter(d => d.scope).map(d => d.key));
    return ks.size >= 2;
  }).sort();
  const usedNew = new Set();
  const taken = t => usedNew.has(t) || m.byName.has(t) || m.vanilla.defined.has(t) || m.vanilla.called.has(t) || !!m.dynMatch(t);
  const renames = [];      // { name, to, defs:[defInfo], sites:[site] }
  const shares = [];       // { name (final), defs:[defInfo], target }
  const touched = new Map();   // name -> Set(keys)
  const touch = (n, k) => { if (!touched.has(n)) touched.set(n, new Set()); touched.get(n).add(k); };
  let nRen = 0;
  const dead = [];
  for (const n of names) {
    const all = m.byName.get(n).defs.filter(d => d.scope);
    const infos = [];
    for (const d of all) { const id = d.key + '@' + d.span[0], r = R.defs.get(id); infos.push({ id, key: d.key, rec: r ? r.rec : null, d, sites: r ? r.sites : new Set() }); }
    // groups by body
    const groups = new Map();
    for (const x of infos) { const raw = bodyOf(x.d), b = norm(raw); if (!groups.has(b)) groups.set(b, { body: b, raw, defs: [], sites: new Set(), pinned: [] }); groups.get(b).defs.push(x); }
    const G = [...groups.values()];
    const gOf = new Map(); for (const g of G) for (const x of g.defs) { gOf.set(x.id, g); for (const s of x.sites) g.sites.add(s); }
    for (const g of G) {
      for (const x of g.defs) {
        if (x.d.inDefine >= 0 || !x.d.closed) g.pinned.push('nested or unclosed define');
        if (!x.rec) g.pinned.push('define not reached from any root');
      }
      for (const sid of g.sites) {
        const s = R.sites.get(sid);
        if (!s.rec.mod) g.pinned.push(`vanilla call ${s.key}:${s.rec.sc.lineOf(s.c.span[0])}`);
        else if (!s.rec.scope) g.pinned.push(`call outside the edited files ${s.rec.rel}`);
        else if (s.dyn) g.pinned.push(`built call name "${s.c.name}" ${s.rec.rel}`);
        for (const r of s.refs) if (!gOf.has(r)) g.pinned.push(`call ${s.rec.rel}:${s.rec.sc.lineOf(s.c.span[0])} also reaches ${r.replace(/@.*/, '')}`);
      }
    }
    // tie groups that share call sites (union-find)
    const parent = new Map(G.map(g => [g, g]));
    const find = g => { while (parent.get(g) !== g) g = parent.get(g); return g; };
    for (const g of G) for (const sid of g.sites) for (const r of R.sites.get(sid).refs) { const h = gOf.get(r); if (h && find(h) !== find(g)) parent.set(find(h), find(g)); }
    const clusters = new Map();
    for (const g of G) { const r = find(g); if (!clusters.has(r)) clusters.set(r, []); clusters.get(r).push(g); }
    const C = [...clusters.values()].map(gs => ({ gs, pinned: gs.some(g => g.pinned.length), uses: gs.reduce((a, g) => a + g.sites.size, 0) }));
    let keepers = C.filter(c => c.pinned);
    if (!keepers.length && C.every(c => !c.uses)) {   // no copy is ever called: nothing to tell apart (step dead)
      cases.push({ id: 'share-dead', title: `"${n}": no copy is called (${infos.length} defines)`, detail: infos.slice(0, 4).map(x => `${x.d.rel}:${x.d.line}`).join(', ') + ': left as they are' });
      continue;
    }
    if (!keepers.length) keepers = [C.slice().sort((a, b) => b.uses - a.uses || b.gs[0].defs.length - a.gs[0].defs.length)[0]];
    let oneBody = true;
    if (keepers.length > 1 || keepers[0].gs.length > 1) {
      oneBody = false;
      const why = keepers.map(c => c.gs.map(g => `${g.defs[0].d.rel}:${g.defs[0].d.line}` + (g.pinned.length ? ` (${g.pinned[0]})` : ' (call sites shared with another body)')).join(' + ')).join(' | ');
      cases.push({ id: 'share-keeps-name', title: `"${n}": ${keepers.reduce((a, c) => a + c.gs.length, 0)} bodies must keep the name`, detail: why });
    }
    // naming base: the kept body with the most call sites
    const base = keepers.flatMap(c => c.gs).sort((a, b) => b.sites.size - a.sites.size || b.defs.length - a.defs.length)[0];
    const final = new Map();   // group -> final name
    for (const c of keepers) for (const g of c.gs) final.set(g, n);
    for (const c of C) {
      if (keepers.includes(c)) continue;
      if (c.gs.length > 1) {
        cases.push({ id: 'share-tied', title: `"${n}": ${c.gs.length} bodies share call sites`, detail: c.gs.map(g => `${g.defs[0].d.rel}:${g.defs[0].d.line}`).join(', ') + ': not renamed' });
        oneBody = false;
        for (const g of c.gs) final.set(g, n);
        continue;
      }
      const g = c.gs[0];
      let to = null;
      for (const sfx of suffixes(base.raw, g.raw, n)) { const t = n + '_' + sfx; if (/^[a-z0-9_]+$/.test(sfx) && !taken(t)) { to = t; break; } }
      for (let k = 2; !to; k++) { const t = n + '_v' + k; if (!taken(t)) to = t; }
      usedNew.add(to);
      final.set(g, to);
      renames.push({ name: n, to, group: g, defs: g.defs, sites: [...g.sites].map(id => R.sites.get(id)) });
      nRen++;
      for (const x of g.defs) touch(n, x.key);
      for (const sid of g.sites) touch(n, R.sites.get(sid).key);
    }
    // share: every group whose final name has one body and copies in >= 2 files
    for (const g of G) {
      const fn = final.get(g);
      if (fn === n && !oneBody) continue;
      if (!g.sites.size) { if (fn !== n) dead.push(`${fn} (${g.defs.length}x, e.g. ${g.defs[0].d.rel}:${g.defs[0].d.line})`); continue; }   // never called: renamed, not shared
      const keys = [...new Set(g.defs.map(x => x.key))];
      if (keys.length < 2) continue;
      if (g.defs.some(x => x.d.inDefine >= 0 || !x.d.closed)) continue;
      shares.push({ name: n, final: fn, group: g, defs: g.defs, target: sharedFor(fn, keys) });
      for (const x of g.defs) touch(n, x.key);
    }
  }
  if (dead.length) cases.push({ id: 'share-dead', title: `${dead.length} renamed bodies are never called`, detail: 'renamed so the name means one thing, not moved to a shared file; step dead can comment them out: ' + dead.join(', ') });
  return { renames, shares, cases, touched, nRen, R };
}

// text edits of a plan -> overlay Map key -> { s, rel, create }, rows per key
function render(ctx, P) {
  const m = ctx.model, R0 = P.R;
  const eds = new Map(), rows = new Map();
  const ed = (key, a, b, t, row) => { if (!eds.has(key)) { eds.set(key, []); rows.set(key, []); } eds.get(key).push({ a, b, t }); if (row) rows.get(key).push(row); };
  const recOf = key => m.files.get(key) ? { s: m.files.get(key).s, sc: m.files.get(key).scan, rel: m.files.get(key).rel } : null;
  // renames
  for (const r of P.renames) {
    for (const x of r.defs) ed(x.key, x.d.nameSpan[0], x.d.nameSpan[1], r.to, { line: x.d.line, kind: 'define_rename', before: r.name, after: r.to, note: 'other body than the one that keeps the name' });
    for (const s of r.sites) ed(s.key, s.c.nameSpan[0], s.c.nameSpan[1], r.to, { line: s.rec.sc.lineOf(s.c.span[0]), kind: s.rec.sc.calls.some(c => c.span[0] === s.c.span[0] && c.inDefine >= 0) ? 'call_in_macro' : 'call', before: r.name, after: r.to, note: '' });
  }
  // shares: removal spans
  const byTarget = new Map();
  const removals = [];   // { key, a, b, x, sh }
  for (const sh of P.shares) {
    if (!byTarget.has(sh.target)) byTarget.set(sh.target, []);
    byTarget.get(sh.target).push(sh);
    for (const x of sh.defs) {
      const F = recOf(x.key), s = F.s, ls = F.sc.lineStarts, d = x.d;
      const lineStart = l => ls[l - 1], lineEnd = l => (l < ls.length ? ls[l] : s.length);
      const pre = s.slice(lineStart(d.line), d.span[0]);
      const endL = F.sc.lineOf(d.span[1] - 1), post = s.slice(d.span[1], lineEnd(endL)).replace(/[\r\n]+$/, '');
      let a = d.span[0], b = d.span[1], whole = false, ind = '';
      if (/^[ \t]*$/.test(pre) && /^[ \t]*$/.test(post)) {
        whole = true; ind = pre;
        let first = d.line;
        if (d.header.length) { const h0 = d.line - d.header.length; if (h0 === 1 || /^[ \t]*$/.test(F.sc.lineText(h0 - 1))) first = h0; }
        a = lineStart(first); b = lineEnd(endL);
      }
      removals.push({ key: x.key, a, b, whole, ind, x, sh, eol: eolOf(s) });
    }
  }
  // edits inside removed spans belong to the shared copy
  const inside = new Map();   // removal -> [edits]
  for (const [key, E] of eds) {
    const rs = removals.filter(r => r.key === key);
    if (!rs.length) continue;
    const keep = [];
    for (const e of E) {
      const r = rs.find(r => e.a >= r.a && e.b <= r.b);
      if (r) { if (!inside.has(r)) inside.set(r, []); inside.get(r).push(e); }
      else if (rs.some(r => e.a < r.b && e.b > r.a)) throw new Error(`share: edit crosses a removed define in ${key}`);
      else keep.push(e);
    }
    eds.set(key, keep);
  }
  // removal text: the first spot per file and target gets the include
  const firstSpot = new Map(), spots = new Map();
  removals.sort((p, q) => p.key < q.key ? -1 : p.key > q.key ? 1 : p.a - q.a);
  for (const r of removals) {
    const fk = r.key + '|' + r.sh.target;
    const inc = `(include "/${r.sh.target.replace(/^resource\//, '')}")`;
    let t = '';
    if (!firstSpot.has(fk)) { firstSpot.set(fk, r); t = r.whole ? r.ind + inc + r.eol : inc; if (!spots.has(r.sh.target)) spots.set(r.sh.target, new Set()); spots.get(r.sh.target).add(r.key); }
    ed(r.key, r.a, r.b, t, { line: r.x.d.line, kind: 'share', before: r.sh.name, after: t ? inc.replace(/"/g, "'") : '(removed: shared file included above)', note: `${r.sh.final} defined once in ${r.sh.target}` });
  }
  // shared files
  const overlay = new Map(), created = [];
  for (const [target, list] of byTarget) {
    const key = target.toLowerCase();
    const exists = ctx.exists(target);
    let s = exists ? ctx.read(target).toString('latin1') : '';
    const eol = '\r\n';
    const blocks = [];
    for (const sh of list.sort((a, b) => a.final < b.final ? -1 : 1)) {
      const src = removals.find(r => r.sh === sh && r.x === sh.defs[0]);
      const F = recOf(src.key), d = src.x.d;
      // the define text with the edits inside it, name = final name
      const ins = (inside.get(src) || []).filter(e => e.a >= d.span[0] && e.b <= d.span[1]).map(e => ({ a: e.a - d.span[0], b: e.b - d.span[0], t: e.t }));
      let txt = applyEdits(F.s.slice(d.span[0], d.span[1]), ins);
      txt = txt.replace(/^\(\s*define\s+"[^"]*"/, `(define "${sh.final}"`);
      const body = txt.replace(/^\(\s*define\s+"[^"]*"/, '').replace(/\)$/, '');
      const lines = txt.split(/\r\n|\n|\r/);
      const ind0 = /^[ \t]*/.exec(F.s.slice(F.sc.lineStarts[d.line - 1], d.span[0]))[0];
      const out = lines.map((L, i) => i === 0 ? L : (L.startsWith(ind0) ? L.slice(ind0.length) : L.replace(/^[ \t]+/, '\t')));
      const ex = example(ctx.model, sh, R0);
      blocks.push(defHeader(sh.final, body, d.desc && !/^[ \t]*;\s*-+/.test(d.desc) ? d.desc : null, ex).join(eol) + eol + out.join(eol) + eol);
    }
    const names = list.map(sh => sh.final).sort();
    const wrap = (head, xs) => { const L = []; let cur = head; for (const x of xs) { if (cur.length + x.length > 130) { L.push(cur.replace(/,$/, ',')); cur = ';  '; } cur += ' ' + x + ','; } L.push(cur.replace(/,$/, '')); return L.join(eol) + eol; };
    if (!exists) s = `; robz shared macros (macrostd share): one define per name, included where the copies were` + eol + wrap('; defines:', names) + eol;
    else s = s.replace(/^((?:;[^\r\n]*\r?\n)+)/, x => x + wrap('; defines (added):', names));
    s += blocks.join(eol);
    const indent = require('./indent').indentText(s);
    if (!indent.error) s = indent.out;
    overlay.set(key, { s, rel: target, create: !exists });
    created.push(target);
  }
  for (const [key, E] of eds) {
    const F = m.files.get(key);
    if (!F) throw new Error('share: no model file ' + key);
    if (!E.length) continue;
    overlay.set(key, { s: applyEdits(F.s, E), rel: F.rel, create: false });
  }
  return { overlay, rows, created, spots };
}
// e.g. text: the shortest literal call that reaches the shared group (calls outside define bodies first), name = final name
function example(m, sh, R) {
  const cs = [...sh.group.sites].map(id => R.sites.get(id)).filter(s => s && s.rec.mod && !s.dyn && !s.c.inner);
  cs.sort((a, b) => (a.c.inDefine >= 0) - (b.c.inDefine >= 0) || (a.c.span[1] - a.c.span[0]) - (b.c.span[1] - b.c.span[0]));
  const s = cs[0];
  if (!s) return null;
  const t = s.rec.s.slice(s.c.span[0], s.c.span[1]).replace(/;[^\r\n]*/g, '').replace(/\s+/g, ' ');
  return t.replace(/^\(\s*"[^"]*"/, `("${sh.final}"`);
}

function plan(ctx) {
  const m = ctx.model, cases = [];
  const live = liveVanillaCalled(m);
  const R = resolveAll(ctx, makeView(ctx, null));
  const exclude = new Set();
  let P, out;
  // renames change the bodies of the macros that call them: group again until the renames settle
  const fix = ex => {
    let siteRen = new Map(), Q = null;
    for (let i = 0; i < 6; i++) {
      Q = buildPlan(ctx, R, ex, live, siteRen);
      const next = new Map();
      for (const r of Q.renames) for (const st of r.sites) next.set(st.id, r.to);
      if (next.size === siteRen.size && [...next].every(([k, v]) => siteRen.get(k) === v)) break;
      siteRen = next;
    }
    return Q;
  };
  const t0 = Date.now(), log = s => { if (process.env.MACROSTD_DEBUG) process.stderr.write(`share: ${s} (${Date.now() - t0} ms)\n`); };
  for (let round = 0; ; round++) {
    P = fix(exclude);
    out = render(ctx, P);
    if (!out.overlay.size) break;
    const bad = prove(ctx, R, out.overlay);
    log(`round ${round}: ${out.overlay.size} files, ${bad.length} roots differ`);
    if (!bad.length) break;
    if (round > 40) { cases.push({ id: 'share-proof', title: 'share stopped', detail: `${bad.length} roots still differ, first ${bad[0].root} ${bad[0].why}` }); return { changes: [], cases }; }
    // find the name to leave alone for the first differing root: shared names first (a shared file brings its other defines along)
    const b = bad[0];
    const sharedNames = new Set(P.shares.map(s => s.name));
    // a shared file brings all its defines to every spot that includes it
    for (const sh of P.shares) { P.touched.get(sh.name).add(sh.target.toLowerCase()); for (const k of out.spots.get(sh.target) || []) P.touched.get(sh.name).add(k); }
    const cands = [...P.touched].filter(([n, ks]) => !exclude.has(n) && [...ks].some(k => b.vis && b.vis.has(k))).map(([n]) => n)
      .sort((x, y) => (sharedNames.has(y) - sharedNames.has(x)) || (P.touched.get(x).size - P.touched.get(y).size) || (x < y ? -1 : 1));
    // grow a set of left-alone names until the root passes, then drop the ones it does not need
    const passes = S => { const ex = new Set([...exclude, ...S]); return !prove(ctx, { roots: [b.root], rootFiles: R.rootFiles }, render(ctx, fix(ex)).overlay).length; };
    let found = null;
    const S = [];
    for (const n of cands.slice(0, 60)) { S.push(n); if (passes(S)) { found = S; break; } }
    if (found) for (let i = found.length - 2; i >= 0; i--) { const T = found.filter((x, j) => j !== i); if (passes(T)) found = T; }
    log(`root ${b.root}: leave ${found ? found.join(', ') : 'all ' + cands.length}`);
    if (!found) found = cands;
    if (!found.length) { cases.push({ id: 'share-proof', title: 'share stopped', detail: `${b.root} differs (${b.why}) and no edited name reaches it` }); return { changes: [], cases }; }
    for (const n of found) { exclude.add(n); cases.push({ id: 'share-proof', title: `"${n}" left as it is`, detail: `${b.rel || b.root} would change ${b.why}` }); }
  }
  const changes = [];
  for (const [key, o] of out.overlay) {
    const rows = (out.rows.get(key) || []).sort((a, b) => a.line - b.line);
    if (o.create && !rows.length) rows.push({ line: 1, kind: 'create', before: '', after: o.rel, note: 'shared defines' });
    changes.push({ file: o.rel, after: Buffer.from(o.s, 'latin1'), create: !ctx.exists(o.rel), rows });
  }
  const sum = `${P.nRen} bodies renamed, ${P.shares.length} names shared in ${out.created.length} files (${out.created.join(', ')})`;
  return { changes, cases: P.cases.concat(cases), summary: sum, stats: { renamed: P.nRen, shared: P.shares.length, files: out.created } };
}

module.exports = {
  id: 'share',
  title: 'one body per macro name (other bodies renamed) and one define per body (shared include file)',
  plan, resolveAll, makeView, prove, applyEdits, substText, liveVanillaCalled, norm, suffixes, sharedFor, defHeader,
};
