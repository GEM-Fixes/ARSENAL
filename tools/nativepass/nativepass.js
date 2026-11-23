#!/usr/bin/env node
// nativepass: make a ported unit native by data rows (nativerules/1), not by code per key. NAT-ENG, 2h batch.
//   node tools/nativepass/nativepass.js <mod dir> --out <dir> [--rules <file|dir>] [--dry] [--json f] [--game G] [--no-game] [--exe as64|mowas_2|mowas2]
//   --exe: the AS2 build of the vanilla reader (lib/vfs build exe; mowas_2: no as64/core, so an include that only as64/core holds is not vanilla);
//   none = the vfs rule (as64.exe in the folder -> as64), as before. --exe goh: refused, exit 2 (GoH is the port's source). Default game: lib/games
//   Reads the unit defs under <mod dir>/resource (entity/**/<stem>/<stem>.def), expands includes/macros (lib/sdlx), applies the rule rows
//   (default tools/nativepass/rules/*.json; file name then id order) and edits the SOURCE text with the smallest splice (lib/sdlwrite):
//   bytes outside an edit stay (CRLF, comments, cp1251). A key from a mod include/define: that file is edited. From a vanilla include: skipped.
//   Writes every text file of the mod (no NUL byte, not a known binary extension) to <out>, edited or not. Never writes into <mod dir>.
//   Record nativepass/1 {form, units:[{unit,class,applied:[{rule,key,act,from,to}],skipped:[{rule,key,why}]}], rules, bad:[{rule,why}]}
//   class: tools/native decides (path -vehicle/<class>/, else key overlap) when the game is readable (--game, default the G install);
//   no game: the path segment only. No class: unit untouched, listed with class null.
//   API: core(files Map rel->Buffer, {rules, classOf(key), vanilla(key)->Buffer|null}) -> {record, out Map rel->Buffer}
// Author: NAT-ENG (2h batch)
// Author: Imperator_Aug (ARSENAL, ia-10a829a8)
'use strict';
const fs = require('fs'), path = require('path');
const sdlx = require('../lib/sdlx'), SW = require('../lib/sdlwrite'), M = require('../keylint/model');

const J = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// default game: the AS2 install through lib/games (gamedir: AS2_GAME, as2.json, Steam), looked up only when no --game / --no-game
const gDefault = () => { try { return require('../lib/games').install('as64').dir; } catch (e) { return null; } };
// --exe: the AS2 build the port is for; goh is refused (GoH is the source of a port, never its target)
function exeArg(v) {
  const games = require('../lib/games'), g = games.get(v);
  if (!g) { console.error('nativepass: --exe must be one of as64|mowas_2|mowas2 (got ' + v + ')'); process.exit(2); }
  if (g.kind === 'goh') games.refuse('nativepass', g, 'a ported unit is made native to an AS2 build (as64 or mowas_2); GoH is the source of the port', 'plan/reports/game-parity/t-port-b.md: n/a (source game)');
  return g.exe;
}
const ACTS = new Set(['drop', 'move', 'set', 'scale', 'clamp', 'keep']);
const BIN_EXT = new Set(['dds', 'tga', 'png', 'jpg', 'jpeg', 'bmp', 'ply', 'vol', 'anm', 'wav', 'ogg', 'mp3', 'pak', 'zip', 'exe', 'dll', 'bin', 'fnt', 'ttf', 'sfx', 'dat', 'mesh']);
const extOf = f => { const b = f.slice(f.lastIndexOf('/') + 1), i = b.lastIndexOf('.'); return i < 0 ? '' : b.slice(i + 1).toLowerCase(); };
const isText = (rel, buf) => !BIN_EXT.has(extOf(rel)) && !buf.includes(0);

// ---------- rules ----------
function loadRules(src) {
  const files = [];
  if (src && fs.existsSync(src)) {
    if (fs.statSync(src).isDirectory()) { for (const f of fs.readdirSync(src).filter(f => f.endsWith('.json')).sort(J)) files.push(path.join(src, f)); }
    else files.push(src);
  }
  const out = [];
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    out.push({ file: path.basename(f), rows: (j && j.rules) || [], form: j && j.form });
  }
  return out;
}
// [{file, rows}] -> {rows sorted (file, id), bad[]}
function checkRules(sets) {
  const rows = [], bad = [];
  for (const s of [...sets].sort((a, b) => J(a.file, b.file))) {
    if (s.form && s.form !== 'nativerules/1') { bad.push({ rule: s.file, why: 'form ' + s.form + ', want nativerules/1' }); continue; }
    for (const r of [...s.rows].sort((a, b) => J(String(a.id), String(b.id)))) {
      const why = badRow(r);
      if (why) bad.push({ rule: String(r.id || s.file + '?'), why }); else rows.push(Object.assign({ _file: s.file }, r));
    }
  }
  return { rows, bad };
}
function badRow(r) {
  if (!r || typeof r !== 'object') return 'not an object';
  if (!r.id) return 'no id';
  if (typeof r.key !== 'string' || !/^entity(\/|$)/.test(r.key.toLowerCase())) return 'key must be a flat key from entity/';
  if (!ACTS.has(r.act)) return 'act ' + r.act;
  if (!r.src) return 'no src, no row';
  if (r.class !== '*' && !Array.isArray(r.class)) return 'class must be "*" or a list';
  if (r.act === 'move' && (typeof r.to !== 'string' || !/^entity\//.test(r.to.toLowerCase()))) return 'move needs to';
  if (r.act === 'set' && r.value === undefined) return 'set needs value';
  if (r.act === 'scale' && typeof r.factor !== 'number') return 'scale needs a number factor';
  if (r.act === 'clamp' && r.value === undefined) return 'clamp needs value [min,max]';
  if (r.when !== undefined && r.when !== 'absent' && r.when !== 'present') return 'when ' + r.when;
  return null;
}
const classOk = (r, cls) => r.class === '*' || r.class.map(c => String(c).toLowerCase()).includes(cls);
// a {"<class>":v,"*":v} map (not a list, not a literal) -> the class's value
function valueFor(v, cls) {
  if (v && typeof v === 'object' && !Array.isArray(v)) return Object.prototype.hasOwnProperty.call(v, cls) ? v[cls] : v['*'];
  return v;
}

// ---------- key patterns ----------
const hasWild = k => k.includes('*');
function matchKey(pat, key) {
  const p = pat.toLowerCase().split('/'), k = key.split('/');
  const seg = (a, b) => a === '*' || (a.includes('*') ? new RegExp('^' + a.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*/g, '[^/]*') + '$').test(b) : a === b);
  const m = (i, j) => {
    if (i === p.length) return j === k.length;
    if (p[i] === '**') { for (let x = j; x <= k.length; x++) if (m(i + 1, x)) return true; return false; }
    return j < k.length && seg(p[i], k[j]) && m(i + 1, j + 1);
  };
  return m(0, 0);
}

// ---------- values ----------
const NUM = /^[-+]?(\d+\.?\d*|\.\d+)$/;
function fmtNum(n, intLike) {
  if (intLike) return String(Math.round(n));
  const s = String(+n.toFixed(6));
  return s.includes('.') || s.includes('e') ? s : s + '.0';
}
function literal(v) {
  if (Array.isArray(v)) return v.map(literal).join(' ');
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  return String(v);   // strings are SDL text as written: "\"tank\"" for a quoted string
}
// segment `extender:smokescreen` -> `extender "smokescreen"`
const segText = s => { const i = s.indexOf(':'); return i < 0 ? s : s.slice(0, i) + ' "' + s.slice(i + 1) + '"'; };
const nestText = (segs, inner) => segs.reduceRight((acc, s) => '{' + segText(s) + (acc === '' ? '' : ' ' + acc) + '}', inner);

// ---------- one mod ----------
function core(files, o) {
  o = o || {};
  const lower = new Map();   // 'resource/..' lower -> rel as given
  for (const rel of files.keys()) lower.set(rel.replace(/\\/g, '/').toLowerCase(), rel);
  const modBuf = key => lower.has(key) ? files.get(lower.get(key)) : null;
  const open = r => {
    if (r.kind !== 'virtual') return null;
    const b = modBuf(r.key);
    if (b) return { buf: b, file: r.key, key: r.key };
    const v = o.vanilla ? o.vanilla(r.key) : null;
    return v ? { buf: v, file: 'vanilla:' + r.key, key: r.key } : null;
  };
  const { rows, bad } = checkRules(o.rules || []);
  const trees = new Map();   // mod file key -> {t, lines[], removed[], owner Map}
  const treeOf = key => {
    if (!trees.has(key)) {
      const b = modBuf(key), t = SW.parse(b), ls = [0];
      for (let i = 0; i < t.src.length; i++) { const c = t.src.charCodeAt(i); if (c === 10 || (c === 13 && t.src.charCodeAt(i + 1) !== 10)) ls.push(i + 1); }
      const byLine = new Map();
      const lineOf = p => { let lo = 0, hi = ls.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ls[m] <= p) lo = m; else hi = m - 1; } return lo + 1; };
      const listsByLine = new Map();
      (function walk(n) {
        for (const k of n.items) {
          if (!k.items) continue;
          const m = k.type === 'block' ? byLine : listsByLine, L = lineOf(k.start);
          if (!m.has(L)) m.set(L, []); m.get(L).push(k); walk(k);
        }
      })(t.root);
      trees.set(key, { t, byLine, listsByLine, removed: [], owner: new Map(), inserts: new Set() });
    }
    return trees.get(key);
  };
  const units = [...lower.keys()].filter(k => { const p = k.split('/'); return p[0] === 'resource' && p[1] === 'entity' && p[2] === '-vehicle' && p.length >= 5 && k.endsWith('.def') && p[p.length - 2] === p[p.length - 1].slice(0, -4); }).sort(J);
  const recUnits = [];
  for (const key of units) {
    const stem = key.slice(key.lastIndexOf('/') + 1, -4), ekey = key.slice('resource/'.length);
    const cls = o.classOf ? o.classOf(ekey) : null;
    const u = { unit: stem, class: cls || null, applied: [], skipped: [] };
    recUnits.push(u);
    if (!cls) { u.skipped.push({ rule: '-', key: '-', why: 'no class: unit untouched' }); continue; }
    const mine = rows.filter(r => classOk(r, cls));
    if (!mine.length) continue;
    const r0 = sdlx.read(modBuf(key), { file: key, key, open, onError: () => {} });
    // occurrences of every flat key: path -> [{blk, file, line, name, ord}]
    const occ = new Map(), ordc = new Map();
    (function walk(b, p, isRoot, d) {
      if (d > 8) return;
      for (const c of M.parts(b, isRoot).kids) {
        const cp = M.parts(c, false);
        if (!cp.key || (cp.keyTok && cp.keyTok.k === 'IDENT' && cp.keyTok.text[0] === '%')) continue;
        const id = (p ? p + '/' : '') + String(cp.key).toLowerCase().replace(/^game_entity$/, 'entity');
        const nm = cp.keyTok && (cp.keyTok.k === 'IDENT' ? cp.keyTok.text.toLowerCase() : null);
        const sig = c.file + '|' + c.line + '|' + nm + '|' + JSON.stringify(c.via || null);
        const ord = ordc.get(sig) || 0; ordc.set(sig, ord + 1);
        if (!occ.has(id)) occ.set(id, []);
        occ.get(id).push({ blk: c, file: c.file, line: c.line, name: nm, ord });
        walk(c, id, false, d + 1);
      }
    })(r0.root, '', true, 0);
    const claimed = new Map();
    const skip = (r, k, why) => u.skipped.push({ rule: r.id, key: k, why });
    // the sdlwrite node of an occurrence: {f (tree), node} | {why}
    const nodeOf = oc => {
      if (String(oc.file).startsWith('vanilla:')) return { why: 'vanilla include' };
      if (!modBuf(oc.file)) return { why: 'source not found: ' + oc.file };
      const f = treeOf(oc.file), cand = (f.byLine.get(oc.line) || []).filter(n => n.name === oc.name);
      const n = cand[oc.ord] || cand[0];
      if (!n) return { why: 'no source block (key built by a macro parameter)' };
      if (f.removed.some(([s, e]) => n.start >= s && n.end <= e)) return { why: 'inside a dropped block' };
      return { f, node: n, file: oc.file, oc };
    };
    const valItems = n => { const a = []; for (let i = n.type === 'list' ? 0 : 1; i < n.items.length; i++) { const k = n.items[i]; if (k.type === 'block' || k.type === 'list') break; a.push(k); } return a; };
    // the value as the reader sees it (macros and params expanded): number when one number, else the texts joined
    const valOf = x => {
      const t = M.parts(x.oc.blk, false).toks;
      if (!t.length) return null;
      if (t.length === 1 && typeof t[0].value === 'number') return t[0].value;
      return t.map(z => z.k === 'STRING' ? '"' + z.value + '"' : String(z.value !== undefined ? z.value : z.text)).join(' ');
    };
    const ownKey = (f, n) => n.start + ':' + n.end;
    // value sites: the node's own value items, a `%p` item followed to the macro call's `p(..)` argument (via chain)
    // -> {sites:[{f, item, owner}], arg} | {why}
    const argOf = (via, p) => {
      if (!via) return { why: 'macro parameter %' + p + ' unresolved' };
      if (String(via.file).startsWith('vanilla:')) return { why: 'vanilla include (macro call of %' + p + ')' };
      if (!modBuf(via.file)) return { why: 'source not found: ' + via.file };
      const f = treeOf(via.file);
      for (const l of f.listsByLine.get(via.line) || []) for (let i = 0; i + 1 < l.items.length; i++) {
        const a = l.items[i], b = l.items[i + 1];
        if (a.type === 'atom' && a.text.toLowerCase() === p.toLowerCase() && b.type === 'list') {
          const vs = valItems(b);
          if (vs.length === 1 && /^%\w+$/.test(vs[0].text)) return argOf(via.via, vs[0].text.slice(1));
          return { f, list: b, items: vs };
        }
      }
      // positional argument %N: ("name" args a0 a1 ..) on the call line -> the N-th item after `args`
      if (/^\d+$/.test(p)) for (const l of f.listsByLine.get(via.line) || []) {
        const i = l.items.findIndex(x => x.type === 'atom' && x.text.toLowerCase() === 'args');
        const a = i < 0 ? null : l.items[i + 1 + Number(p)];
        if (!a || a.type !== 'atom') continue;
        if (/^%\w+$/.test(a.text)) return argOf(via.via, a.text.slice(1));
        return { f, list: l, items: [a] };
      }
      return { why: 'macro argument ' + p + '() not found at the call site' };
    };
    const sitesOf = x => {
      const vs = valItems(x.node), ps = vs.filter(v => /^%\w+$/.test(v.text));
      if (!ps.length) return { f: x.f, owner: x.node, items: vs, own: true };
      if (vs.length !== 1) return { why: 'mixed literal and macro parameter values' };
      const a = argOf(x.oc.blk.via, ps[0].text.slice(1));
      if (a.why) return a;
      if (a.f.removed.some(([s, e]) => a.list.start >= s && a.list.end <= e)) return { why: 'inside a dropped block' };
      return { f: a.f, owner: a.list, items: a.items, own: false };
    };
    // shared-file guard: another unit's different edit of the same node wins. list = [{f, owner, text}] -> why | null; marks .mine
    const claimAll = list => {
      for (const c of list) { const was = c.f.owner.get(ownKey(c.f, c.owner)); if (was && was.text !== c.text) return 'shared file: ' + was.unit + ' edited this block first'; }
      for (const c of list) { const k = ownKey(c.f, c.owner); c.mine = !c.f.owner.has(k); if (c.mine) c.f.owner.set(k, { unit: stem, text: c.text }); }
      return null;
    };
    const splice = (f, s, e, text) => f.t.splices.push({ start: s, end: e, text, node: null });
    const parentEditable = (segs) => {   // deepest present ancestor of segs with an editable node, prefer the unit def
      for (let i = segs.length - 1; i >= 1; i--) {
        const pk = segs.slice(0, i).join('/'), l = occ.get(pk);
        if (!l) continue;
        const ns = l.map(nodeOf), pick = ns.find(x => x.node && x.file === key) || ns.find(x => x.node);
        if (!pick) return { why: ns[0].why, at: pk };
        return Object.assign({ rest: segs.slice(i), at: pk }, pick);
      }
      return { why: 'no entity block' };
    };
    const insertUnder = (pe, text) => {
      const dk = ownKey(pe.f, pe.node) + '+' + text;
      if (pe.f.inserts.has(dk)) return;
      pe.f.inserts.add(dk);
      SW.insertChild(pe.node, pe.node.items.length, text);
    };
    for (const r of mine) {
      const pat = r.key.toLowerCase();
      const keys = hasWild(pat) ? [...occ.keys()].filter(k => matchKey(pat, k)).sort(J) : [pat];
      for (const k of keys) {
        if (claimed.has(k)) { skip(r, k, 'key taken by ' + claimed.get(k)); continue; }
        const l = occ.get(k) || [];
        const present = l.length > 0;
        const done = (from, to, extra) => {   // from/to = first occurrence; n = occurrences when more than one (all edited alike)
          const a = { rule: r.id, key: k, act: r.act, from, to }; if (l.length > 1) a.n = l.length;
          u.applied.push(a); claimed.set(k, r.id); if (extra) claimed.set(extra, r.id);
        };
        if (r.act !== 'set' && !present) continue;   // nothing to drop/move/scale/clamp/keep
        if (r.act === 'set') {
          const when = r.when || 'absent';
          if (when === 'absent' && present) { skip(r, k, 'present (set when absent)'); continue; }
          if (when === 'present' && !present) { skip(r, k, 'absent (set when present)'); continue; }
          const v = valueFor(r.value, cls);
          if (v === undefined) { skip(r, k, 'no value for class ' + cls); continue; }
          const text = literal(v);
          if (!present) {
            const pe = parentEditable(k.split('/'));
            if (!pe.node) { skip(r, k, pe.why + (pe.at ? ' (' + pe.at + ')' : '')); continue; }
            insertUnder(pe, nestText(pe.rest, text)); done(null, v); continue;
          }
          const ns = l.map(nodeOf), badn = ns.find(x => !x.node);
          if (badn) { skip(r, k, badn.why); continue; }
          const ss = ns.map(sitesOf), bads = ss.find(s => s.why);
          if (bads) { skip(r, k, bads.why); continue; }
          const plan = ss.map(s => Object.assign(s, { text }));
          const why = claimAll(plan);
          if (why) { skip(r, k, why); continue; }
          const from = valOf(ns[0]);
          for (const s of plan) if (s.mine) {
            if (s.items.length) splice(s.f, s.items[0].start, s.items[s.items.length - 1].end, text);
            else if (s.own) splice(s.f, s.owner.items[0].end, s.owner.items[0].end, ' ' + text);
            else splice(s.f, s.owner.start + 1, s.owner.start + 1, text);
          }
          done(from, v); continue;
        }
        const ns = l.map(nodeOf), badn = ns.find(x => !x.node);
        if (badn) { skip(r, k, badn.why); continue; }
        const from = valOf(ns[0]);
        if (r.act === 'keep') { done(from, from); continue; }
        if (r.act === 'drop') {
          const plan = ns.map(x => ({ f: x.f, owner: x.node, text: '<drop>' }));
          const why = claimAll(plan);
          if (why) { skip(r, k, why); continue; }
          for (const s of plan) if (s.mine) { SW.removeNode(s.owner); s.f.removed.push([s.owner.start, s.owner.end]); }
          done(from, null); continue;
        }
        if (r.act === 'scale' || r.act === 'clamp') {
          let lim = null;
          if (r.act === 'clamp') { lim = valueFor(r.value, cls); if (!Array.isArray(lim) || lim.length !== 2 || typeof lim[0] !== 'number' || typeof lim[1] !== 'number') { skip(r, k, 'clamp value for ' + cls + ' is not [min,max]'); continue; } }
          const plan = [];
          let why = null;
          for (const x of ns) {
            const s = sitesOf(x);
            if (s.why) { why = s.why; break; }
            const vs = s.items.filter(v => NUM.test(v.text));
            if (!vs.length) { why = 'no number in source'; break; }
            s.nv = vs.map(v => { const n = +v.text, ok = !/[.eE]/.test(v.text); const y = r.act === 'scale' ? n * r.factor : Math.min(lim[1], Math.max(lim[0], n)); return { v, text: y === n ? v.text : fmtNum(y, ok && (r.act === 'scale' || Number.isInteger(y))) }; });   // clamp to a fractional bound keeps the fraction (5 -> 1.1, not 1)
            s.text = s.nv.map(z => z.text).join(' ');
            plan.push(s);
          }
          if (!why) why = claimAll(plan);
          if (why) { skip(r, k, why); continue; }
          for (const p of plan) if (p.mine) for (const z of p.nv) if (z.text !== z.v.text) splice(p.f, z.v.start, z.v.end, z.text);
          const to = plan[0].nv.length === 1 ? +plan[0].nv[0].text : plan[0].nv.map(z => z.text).join(' ');
          done(from, to); continue;
        }
        if (r.act === 'move') {
          const to = r.to.toLowerCase();
          if (hasWild(pat) || hasWild(to)) { skip(r, k, 'move needs concrete keys'); continue; }
          if (occ.has(to)) { skip(r, k, 'target present: ' + to); continue; }
          if (claimed.has(to)) { skip(r, k, 'target taken by ' + claimed.get(to)); continue; }
          if (ns.length !== 1) { skip(r, k, 'key occurs ' + ns.length + ' times'); continue; }
          const x = ns[0], n = x.node, ks = k.split('/'), ts = to.split('/');
          const plan = [{ f: x.f, owner: n, text: '<move ' + to + '>' }];
          if (ks.slice(0, -1).join('/') === ts.slice(0, -1).join('/') && !ts[ts.length - 1].includes(':') && !ks[ks.length - 1].includes(':')) {
            const why = claimAll(plan); if (why) { skip(r, k, why); continue; }
            if (plan[0].mine) splice(x.f, n.items[0].start, n.items[0].end, ts[ts.length - 1]);   // rename in place
          } else {
            const pe = parentEditable(ts);
            if (!pe.node) { skip(r, k, pe.why); continue; }
            if (pe.f.removed.some(([s, e]) => pe.node.start >= s && pe.node.end <= e) || (pe.f === x.f && pe.node.start >= n.start && pe.node.end <= n.end)) { skip(r, k, 'target parent inside the moved block'); continue; }
            const why = claimAll(plan); if (why) { skip(r, k, why); continue; }
            const body = x.f.t.src.slice(n.items[ks[ks.length - 1].includes(':') ? 1 : 0].end, n.closeStart).replace(/^[ \t]+|[ \t]+$/g, '');
            if (plan[0].mine) { SW.removeNode(n); x.f.removed.push([n.start, n.end]); }
            const last = pe.rest[pe.rest.length - 1];
            insertUnder(pe, nestText(pe.rest.slice(0, -1), '{' + segText(last) + (body ? ' ' + body : '') + '}'));
          }
          done(from, from, to); continue;
        }
      }
    }
  }
  const out = new Map();
  for (const [rel, b] of files) {
    const key = rel.replace(/\\/g, '/').toLowerCase();
    out.set(rel, trees.has(key) ? SW.serialize(trees.get(key).t) : b);
  }
  recUnits.sort((a, b) => J(a.unit, b.unit) || J(String(a.class), String(b.class)));
  return { record: { form: 'nativepass/1', rules: rows.length, bad, units: recUnits }, out };
}

// ---------- disk ----------
function readMod(dir) {
  const files = new Map();
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => J(a.name, b.name))) {
      const p = path.join(d, e.name), r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { if (!/^\.(git|svn)$/.test(e.name)) walk(p, r); }
      else if (e.isFile() && !BIN_EXT.has(extOf(r))) { const b = fs.readFileSync(p); if (isText(r, b)) files.set(r, b); }
    }
  };
  walk(dir, '');
  return files;
}
function classes(modDir, game) {
  if (game && fs.existsSync(game)) {
    try {
      const N = require('../native/native.js'), j = N.run({ input: modDir, game });
      const m = new Map(j.units.map(u => [u.key, u.class]));
      return { by: 'native', of: k => m.get(k) || null };
    } catch (e) { /* fall through to path */ }
  }
  let known = null;
  try { known = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'xlate', 'table.json'), 'utf8')).classes || {})); } catch (e) { /* none */ }
  return { by: 'path', of: k => { const p = k.split('/'); if (p[1] !== '-vehicle') return null; const segs = p.slice(2, -2).reverse(); return segs.find(s => !known || known.has(s)) || null; } };
}
function vanillaReader(game, exe) {
  if (!game || !fs.existsSync(game)) return null;
  const vfs = require('../lib/vfs'), bo = { gameDir: game }; if (exe) bo.exe = exe;   // no exe: the vfs rule (as64 first), as before
  const v = vfs.build(bo);
  return key => { const r = v.files.get(key); return r ? vfs.readRec(r) : null; };
}

function main() {
  const a = process.argv.slice(2), o = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--out') o.out = a[++i]; else if (a[i] === '--rules') o.rules = a[++i]; else if (a[i] === '--dry') o.dry = true;
    else if (a[i] === '--json') o.json = a[++i]; else if (a[i] === '--game') o.game = a[++i]; else if (a[i] === '--no-game') o.noGame = true;
    else if (a[i] === '--exe') o.exe = exeArg(a[++i]);
    else if (a[i] === '-h' || a[i] === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 14).join('\n')); return 0; }
    else if (!o.mod) o.mod = a[i];
  }
  if (!o.mod || (!o.out && !o.dry)) { console.error('usage: nativepass <mod dir> --out <dir> [--rules <file|dir>] [--dry] [--json f] [--game G] [--no-game] [--exe as64|mowas_2]'); return 2; }
  const mod = path.resolve(o.mod);
  if (!fs.existsSync(path.join(mod, 'resource'))) { console.error('nativepass: no resource/ in ' + o.mod); return 2; }
  const game = o.noGame ? null : (o.game || (d => (d && fs.existsSync(d) ? d : null))(gDefault()));
  if (o.out && !o.dry) {
    const out = path.resolve(o.out), rel = path.relative(mod, out);
    if (!rel || (!rel.startsWith('..') && !path.isAbsolute(rel))) { console.error('nativepass: --out is inside the mod dir: refused'); return 2; }
    const why = require('../lib/writeguard').refuseWrite(out, { game, purpose: 'nativepass out' });
    if (why) { console.error('nativepass: --out refused: ' + why); return 2; }
  }
  const rules = loadRules(o.rules || path.join(__dirname, 'rules'));
  const files = readMod(mod), cl = classes(mod, game);
  const { record, out } = core(files, { rules, classOf: cl.of, vanilla: vanillaReader(game, o.exe) });
  if (o.out && !o.dry) {
    const od = path.resolve(o.out);
    for (const [rel, b] of out) { const p = path.join(od, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, b); }
  }
  const txt = JSON.stringify(record, null, 1) + '\n';
  if (o.json) fs.writeFileSync(o.json, txt); else process.stdout.write(txt);
  const ap = record.units.reduce((s, u) => s + u.applied.length, 0), sk = record.units.reduce((s, u) => s + u.skipped.length, 0);
  console.error(`nativepass: ${record.units.length} units (class by ${cl.by}), ${record.rules} rules, ${record.bad.length} bad rows, ${ap} applied, ${sk} skipped, ${out.size} text files${o.dry ? ' (dry)' : ''}`);
  return 0;
}
module.exports = { core, loadRules, checkRules, matchKey, readMod, classes, vanillaReader };
if (require.main === module) process.exitCode = main();
