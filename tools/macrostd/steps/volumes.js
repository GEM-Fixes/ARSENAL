// macrostd step volumes: literal {Volume "name" ...} / {volume "name" ...} blocks in entity .def files (and the samedef
//   <x>_body.inc files defs include) become calls of one macro per repeated shape, defined in resource/properties/robz/volumes.inc.
//   shape = the block's tokens with the name string -> "%name" and the number of the first {thickness N} / {Thickness N} -> %mm,
//   whitespace normalized. A shape becomes a macro when it is used >= MIN (50) times, has an inner block, and the call is shorter
//   than the literal. Key case is kept exactly as written (Volume/volume, thickness/Thickness are separate shapes: DDA keys are
//   strcmp, SDL-33; the .def readers' case rule is [I]). Blocks with a comment, '(' ')', '%', a byte >= 0x80, or a name with '\' or
//   ')' stay literal (SDL-19: a named value ends at the first ')'). Every changed file gets (include "/properties/robz/volumes.inc")
//   before its first non-comment line (SDL-17/GPL-11: define before use; absolute path so the folder does not matter); the new
//   .inc is created in the same step (TST-108). Params name / mm: neither is a prefix of the other (SDL-56); no defaults (SDL-21).
//   Macro text is substituted inside strings ("%name"), modweb sdl/macros.
// Author: Imperator_Aug (ARSENAL, ia-2dbbd8bc)
const fs = require('fs'), path = require('path');
const { toks } = require('./samedef');

const INC_REL = 'resource/properties/robz/volumes.inc', INC_KEY = INC_REL.toLowerCase(), INC_RAW = '/properties/robz/volumes.inc';
const MIN = 50;
// hand names for the shapes RobZ uses 50+ times (key = normalized shape); others get an automatic vol_ name
//   "_lower" = the same block written {volume ...} (key case kept, SDL-33); "_component_first" = {component} written before {tags}
const NAMES = {
  '{Volume "%name" {thickness %mm} {able {touch} {bullet} {blast}}}': ['vol_plate_hit', 'armor plate that takes touch, bullet and blast hits'],
  '{Volume "%name" {Tags "body"} {Thickness %mm} {able {visible 1}}}': ['vol_body_visible', 'plate tagged body, visible'],
  '{Volume "%name" {tags "body"} {component "body"} {thickness %mm}}': ['vol_body_plate', 'armor plate of the body component (tags + component "body")'],
  '{volume "%name" {tags "body"} {component "body"} {thickness %mm}}': ['vol_body_plate_lower', 'armor plate of the body component (tags + component "body"), key written volume'],
  '{volume "%name" {component "body"} {tags "body"} {thickness %mm}}': ['vol_body_plate_component_first', 'armor plate of the body component, key written volume, component before tags'],
  '{Volume "%name" {Tags "body" "fire"} {Thickness %mm}}': ['vol_body_fire', 'plate tagged body + fire'],
  '{Volume "%name" {Tags "body"} {Thickness %mm}}': ['vol_body_tagged', 'plate tagged body'],
  '{Volume "%name" {tags "body"} {component "body"}}': ['vol_body_part', 'volume of the body component without thickness'],
  '{volume "%name" {tags "body"} {component "body"}}': ['vol_body_part_lower', 'volume of the body component without thickness, key written volume'],
  '{volume "%name" {component "body"} {tags "body"}}': ['vol_body_part_component_first', 'volume of the body component without thickness, key written volume, component before tags'],
  '{Volume "%name" {tags "turret"} {component "turret"}}': ['vol_turret_part', 'volume of the turret component without thickness'],
  '{volume "%name" {component "turret"} {tags "turret"}}': ['vol_turret_part_component_first', 'volume of the turret component without thickness, key written volume, component before tags'],
  '{Volume "%name" {tags "gun"} {component "gun"}}': ['vol_gun_part', 'volume of the gun component without thickness'],
  '{Volume "%name" {able clear {hole}} {component "turret"}}': ['vol_turret_hole_only', 'turret volume whose only ability is hole'],
  '{Volume "%name" {able clear {hole}} {component "body"}}': ['vol_body_hole_only', 'body volume whose only ability is hole'],
  '{Volume "%name" {Tags "body"} {Thickness %mm} {able {obstacle 0}}}': ['vol_body_no_obstacle', 'plate tagged body that is no obstacle'],
  '{Volume "%name" {Tags "body"} {Thickness %mm} {able {visible 0} {obstacle 0}}}': ['vol_body_hidden', 'plate tagged body, not visible and no obstacle'],
  '{Volume "%name" {Tags "body" "fire"} {Thickness %mm} {able {obstacle 0}}}': ['vol_body_fire_no_obstacle', 'plate tagged body + fire that is no obstacle'],
  '{Volume "%name" {Tags "body" "fire"} {able {visible 0} {obstacle 0}}}': ['vol_body_fire_hidden', 'volume tagged body + fire without thickness, not visible and no obstacle'],
  '{Volume "%name" {able {visible 0}}}': ['vol_invisible', 'volume that is not visible'],
  '{Volume "%name" {tags "body"} {able {obstacle 0} {blast 0}} {thickness %mm} {component "body"}}': ['vol_body_plate_no_obstacle_blast', 'body component plate that is no obstacle and takes no blast'],
  '{volume "%name" {tags "grenade_fg_target"} {able clear {contact} {touch}} {component "sticky_body"}}': ['vol_sticky_grenade_target', 'sticky_body volume a thrown grenade sticks to (tag grenade_fg_target, contact + touch only)'],
};

const isNum = t => /^[-+]?(\d+\.?\d*|\.\d+)$/.test(t);

// blocks in one text: [{ a, b, name, mm, key }] and the count of literal blocks left alone
function findBlocks(s) {
  const T = toks(s), out = [];
  let skipped = 0;
  for (let i = 0; i + 2 < T.length; i++) {
    if (T[i].k !== '{' || T[i + 1].k !== 'W' || !/^volume$/i.test(s.slice(T[i + 1].a, T[i + 1].b))) continue;
    if (T[i + 2].k !== 'S') continue;          // {volume 470}: another key
    let d = 0, j = i, bad = false;
    for (; j < T.length; j++) { const t = T[j]; if (t.k === 'C' || t.k === '(' || t.k === ')' || (t.k === 'S' && t.bad)) bad = true; if (t.k === '{') d++; else if (t.k === '}' && --d === 0) break; }
    if (j >= T.length) break;
    const P = T.slice(i, j + 1), text = s.slice(T[i].a, T[j].b);
    const nameRaw = s.slice(P[2].a + 1, P[2].b - 1);
    if (bad || /[%\x80-\xff]/.test(text) || !nameRaw || /[\\)(]/.test(nameRaw)) { skipped++; i = j; continue; }
    const parts = P.map(t => s.slice(t.a, t.b));
    parts[2] = '"%name"';
    let mm = null;
    for (let k = 3; k + 3 < P.length; k++) {
      if (P[k].k === '{' && P[k + 1].k === 'W' && /^thickness$/i.test(parts[k + 1]) && P[k + 2].k === 'W' && isNum(parts[k + 2]) && P[k + 3].k === '}') { mm = parts[k + 2]; parts[k + 2] = '%mm'; break; }
    }
    let key = '';
    for (let k = 0; k < parts.length; k++) key += (k && parts[k - 1] !== '{' && parts[k] !== '}' ? ' ' : '') + parts[k];
    out.push({ a: T[i].a, b: T[j].b, name: nameRaw, mm, key, inner: P.filter(t => t.k === '{').length > 1, len: text.replace(/\s+/g, ' ').length });
    i = j;
  }
  return { blocks: out, skipped };
}

const callText = (macro, x) => `("${macro}" name(${x.name})` + (x.mm !== null ? ` mm(${x.mm})` : '') + ')';
function autoName(key) {
  const w = key.replace(/"%name"|%mm/g, ' ').match(/[A-Za-z0-9_]+/g).slice(1).map(x => x.toLowerCase());
  const out = [];
  for (const x of w) if (!out.includes(x) && !['tags', 'component', 'able', 'thickness'].includes(x)) out.push(x);
  return 'vol_' + (out.join('_') || 'plain').replace(/[^a-z0-9_]/g, '_');
}
function defineText(macro, desc, key, eol) {
  const hasMm = key.includes('%mm');
  return [`; ${macro}: ${desc}`, ';   name - volume name in the model (text, without quotes)'].concat(hasMm ? [';   mm - armor thickness, mm'] : [])
    .concat([`;   e.g. ("${macro}" name(body)${hasMm ? ' mm(10)' : ''})`, `(define "${macro}"`, '\t' + key, ')', '']).join(eol);
}

// files the step edits: entity .def in scope + <x>_body.inc that a def includes (also when created earlier in this run)
function targets(ctx) {
  const m = ctx.model, out = new Map();
  for (const F of m.files.values()) if (F.scope && /^resource\/entity\/.*\.def$/.test(F.key) && ctx.exists(F.rel)) out.set(F.key, F.rel);
  for (const F of m.files.values()) {
    if (!F.scope || !/^resource\/entity\/.*\.def$/.test(F.key) || !ctx.exists(F.rel)) continue;
    const s = ctx.read(F.rel).toString('latin1');
    for (const mt of s.matchAll(/\(include\s+"([^"\/\\%]+_body(?:_\d+)?\.inc)"/g)) {
      const rel = F.rel.slice(0, F.rel.lastIndexOf('/') + 1) + mt[1];
      if (ctx.exists(rel)) out.set(rel.toLowerCase(), rel);
    }
  }
  return out;
}

module.exports = {
  id: 'volumes',
  title: '{Volume ...} shapes used 50+ times become vol_ macros in properties/robz/volumes.inc',
  findBlocks, NAMES, MIN,
  plan(ctx) {
    const m = ctx.model, changes = [], cases = [];
    const min = Number(ctx.opts && ctx.opts.volmin) || MIN;
    const files = targets(ctx);
    const per = new Map(), count = new Map(), gain = new Map(), inner = new Map();
    let total = 0, skippedLit = 0;
    for (const [key, rel] of files) {
      const s = ctx.read(rel).toString('latin1');
      const r = findBlocks(s);
      skippedLit += r.skipped; total += r.blocks.length + r.skipped;
      if (!r.blocks.length) continue;
      per.set(key, { rel, s, blocks: r.blocks });
      for (const x of r.blocks) {
        count.set(x.key, (count.get(x.key) || 0) + 1);
        inner.set(x.key, x.inner);
        gain.set(x.key, (gain.get(x.key) || 0) + x.len - callText('vol_xxxxxxxxxx', x).length);
      }
    }
    // existing volumes.inc (an earlier run, or another step): reuse defines with the same body
    const incExists = ctx.exists(INC_REL);
    const incOld = incExists ? ctx.read(INC_REL).toString('latin1') : '';
    const oldDefs = new Map();
    for (const mt of incOld.matchAll(/\(define "([^"]+)"\s*\r?\n?\s*([\s\S]*?)\r?\n?\)/g)) oldDefs.set(mt[1], mt[2].trim());
    const chosen = new Map(), used = new Set();
    const shapes = [...count].filter(([k, n]) => n >= min && inner.get(k) && gain.get(k) > 0).sort((a, b) => b[1] - a[1]);
    for (const [k, n] of shapes) {
      let [name, desc] = NAMES[k] || [autoName(k), 'Volume block ' + k.replace(/"%name"/, '"<name>"').replace(/%mm/, '<mm>')];
      if (used.has(name)) { let i = 2; while (used.has(name + '_' + i)) i++; name += '_' + i; }
      const old = oldDefs.get(name);
      const clash = old !== undefined ? old !== k : (m.byName.has(name) || m.vanilla.defined.has(name) || m.vanilla.called.has(name));
      if (clash) { cases.push({ id: 'volumes-name', title: `macro name "${name}" already exists`, detail: `shape ${k} (${n} uses) left literal` }); continue; }
      used.add(name);
      chosen.set(k, { name, desc, n, fresh: old === undefined });
    }
    if (!chosen.size) return { changes, cases };
    let calls = 0, linesBefore = 0, linesAfter = 0;
    const nl = t => t.split(/\r\n|\n|\r/).length;
    for (const [key, f] of per) {
      const hits = f.blocks.filter(x => chosen.has(x.key));
      if (!hits.length) continue;
      const eol = (/\r\n|\n|\r/.exec(f.s) || ['\r\n'])[0];
      let s = f.s;
      const rows = [];
      for (const x of hits.slice().reverse()) {
        const c = chosen.get(x.key), t = callText(c.name, x);
        rows.unshift({ line: nl(s.slice(0, x.a)), kind: 'volume', before: s.slice(x.a, x.b).replace(/\s+/g, ' '), after: t, note: '' });
        s = s.slice(0, x.a) + t + s.slice(x.b);
        calls++;
      }
      const has = new RegExp('\\(include\\s+"' + INC_RAW.replace(/[.\/]/g, '\\$&') + '"', 'i').test(s);
      if (!has) {
        const T = toks(s), first = T.find(t => t.k !== 'C');
        const ls = first ? s.lastIndexOf('\n', first.a - 1) + 1 : s.length;
        const at = first ? Math.max(ls, s.lastIndexOf('\r', first.a - 1) + 1) : s.length;
        s = s.slice(0, at) + `(include "${INC_RAW}")` + eol + s.slice(at);
        rows.unshift({ line: nl(s.slice(0, at)), kind: 'include', before: '', after: `(include "${INC_RAW}")`, note: '' });
      }
      linesBefore += nl(f.s); linesAfter += nl(s);
      // a _body.inc samedef made earlier in this run exists only in the overlay on plan; ctx.exists sees the overlay
      changes.push({ file: f.rel, after: Buffer.from(s, 'latin1'), create: !ctx.exists(f.rel), rows });
    }
    // volumes.inc
    const eol = '\r\n';
    let inc = incOld;
    if (!incExists) inc = ['; RobZ volume macros (macrostd volumes): one per {Volume ...} shape the entity defs use ' + min + '+ times.',
      '; include with (include "' + INC_RAW + '") before the first call.', ''].join(eol) + eol;
    else if (inc.length && !/[\r\n]$/.test(inc)) inc += eol;
    const added = [];
    for (const [k, c] of chosen) if (c.fresh) { inc += defineText(c.name, c.desc, k, eol) + eol; added.push(c.name); }
    if (inc !== incOld) changes.push({ file: INC_REL, after: Buffer.from(inc, 'latin1'), create: !incExists, rows: added.map(n => ({ line: 0, kind: 'define', before: '', after: n, note: `${chosen.get([...chosen].find(([, c]) => c.name === n)[0]).n} uses` })) });
    const stat = { blocks: total, literalSkipped: skippedLit, distinct: count.size, macros: [...chosen.values()].map(c => `${c.name} ${c.n}`), calls, files: changes.length - (inc !== incOld ? 1 : 0), linesBefore, linesAfter };
    module.exports.lastStat = stat;
    if (!ctx.opts || !ctx.opts.quiet) process.stderr.write(`volumes: ${JSON.stringify(stat)}\n`);
    return { changes, cases };
  },
};
