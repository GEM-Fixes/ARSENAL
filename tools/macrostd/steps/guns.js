// macrostd step guns (plan A9): weapon and gun tables in resource/set/stuff/** (stuff files with and without extension, their folder
//   .presets, SDL-50). Nothing here changes a value; verify proves it.
//   1. parameter renames (define body %x + every call that binds to that define): damage_215/170/100 a b c d e range ->
//      at20 at100 at170 at215 at250 max, damage_heat a range -> damage max, speed / speed_lowarc s -> mps (body {speed (* k %s)}).
//      A define is renamed only when its body has the expected shape, every caller binds to it alone (roots' include closure,
//      SDL-17/50), no live vanilla file (one the mod does not override) binds to it (PORT-55/61), no caller sits in a macro body or
//      outside the edited files, and no parameter of the define or its calls is a strict prefix of another (SDL-56). Else a case.
//   2. one comment table above accuracy_curve_gun: every accuracy_curve_* with its base, AP and HE range and the suffix legend,
//      all read from the bodies ([I] where the meaning is a guess from the numbers).
//   3. the author's design tables from "<mod>/tings to do.txt" (filler / energy tables) as ';' comments above the fg_* group of
//      shell/.presets and reactive/.presets, bytes kept. Tables without a define (cumulative_*) are cases.
//   4. every define in a .presets file this step touches gets the header `; name: what` + `;   param - meaning` + `;   e.g. (...)`.
//   Idempotent: a second plan finds 0 rows (headers / tables carry their marker).
// Author: Imperator_Aug (ARSENAL, ia-c55e0884)
const fs = require('fs'), path = require('path');
const { lineEnds, bodyParams } = require('../scan');

const DAMAGE_MAP = { a: 'at20', b: 'at100', c: 'at170', d: 'at215', e: 'at250', range: 'max' };
// name -> { map, shape: body (comments stripped, whitespace collapsed) must match }
const RENAMES = [
  { name: 'damage_215', map: DAMAGE_MAP, shape: /^\{projectileDamageTable \{20 %a\} \{100 %b\} \{170 %c\} \{215 %d\} \{%range \(\+ \(\* \(\/ \(- 250 %range\) \(- 250 215\)\) \(- %d %e\)\) %e\)\} \{\(\+ %range 5\) 0\} \}$/ },
  { name: 'damage_170', map: DAMAGE_MAP, shape: /^\{projectileDamageTable \{20 %a\} \{100 %b\} \{170 %c\} \{%range \(\+ \(\* \(\/ \(- 215 %range\) \(- 215 170\)\) \(- %c %d\)\) %d\)\} \{\(\+ %range 5\) 0\} \}$/ },
  { name: 'damage_100', map: DAMAGE_MAP, shape: /^\{projectileDamageTable \{20 %a\} \{100 %b\} \{%range \(\+ \(\* \(\/ \(- 170 %range\) \(- 170 100\)\) \(- %b %c\)\) %c\)\} \{\(\+ %range 5\) 0\} \}$/ },
  { name: 'damage_heat', map: { a: 'damage', range: 'max' }, shape: /^\{projectileDamageTable \{0 %a\} \{%range %a\} \{\(\+ %range 5\) 0\}\}$/ },
  { name: 'speed', map: { s: 'mps' }, shape: /^\{speed \(\* [0-9.]+ %s\)\}$/ },
  { name: 'speed_lowarc', map: { s: 'mps' }, shape: /^\{speed \(\* [0-9.]+ %s\)\}$/ },
];
const ACC_MARK = '; ---- accuracy curves (macrostd guns): every accuracy_curve_*, read from the bodies ----';
const TAB_MARK = '; ---- design table (author, "tings to do.txt"';
// author tables: heading regex in the txt, target .presets, define group start (first define whose name matches)
const TABLES = [
  { id: 'fillers_150', title: '150 mm+ shell fillers: kg, fg value, damage distances, fg define, mid damage and distances', head: /^150\+ fillers/, pre: /^E = highest energy/, until: 'blank', file: 'resource/set/stuff/shell/.presets', group: /^fg/ },
  { id: 'other_shell', title: 'gun shell fillers: kg, fg value, damage distances, fg define', head: /^other shell fillers/, until: 'blank2', file: 'resource/set/stuff/shell/.presets', group: /^fg/ },
  { id: 'fg_maximum', title: 'fg_maximum note', head: /^fg_maximum max damage/, until: 'one', file: 'resource/set/stuff/shell/.presets', group: /^fg_maximum$/ },
  { id: 'mortar', title: 'mortar fillers (reactive/mortar*/.presets hold their own fg_* group): kg, fg value, damage distances, fg define', head: /^mortar fillers/, pre: /^E = highest energy/, until: 'blank', file: 'resource/set/stuff/reactive/.presets', group: /^fg/ },
  { id: 'rocket', title: 'rocket fillers: kg, fg value, damage distances, fg define, mid/max damage and distances', head: /^;rocket damage overall/, until: 'blank', file: 'resource/set/stuff/reactive/.presets', group: /^fg/ },
  { id: 'cumulative', title: 'recoilless / rifle grenade HEAT warheads', head: /^recoilless HE/, until: 'blank', file: null, group: /^cumulative/ },
];
const DESIGN_FILE = 'tings to do.txt';

// ---- text helpers
function stripComments(s) {   // ';' to line end, outside strings; strings never span a line end (SDL-08)
  let o = '', inS = false;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (inS) { o += c; if (c === '\\') { o += s[k + 1] || ''; k++; } else if (c === '"' || c === '\n' || c === '\r') inS = false; continue; }
    if (c === '"') { inS = true; o += c; continue; }
    if (c === ';') { while (k < s.length && s[k] !== '\n' && s[k] !== '\r') k++; k--; continue; }
    o += c;
  }
  return o;
}
const flat = s => stripComments(s).replace(/\s+/g, ' ').trim();
// replace %old params in a body outside comments and strings; -> { text, n }
function renameBody(body, map) {
  let o = '', n = 0, inS = false;
  for (let k = 0; k < body.length; k++) {
    const c = body[k];
    if (inS) { o += c; if (c === '\\') { o += body[k + 1] || ''; k++; } else if (c === '"' || c === '\n' || c === '\r') inS = false; continue; }
    if (c === '"') { inS = true; o += c; continue; }
    if (c === ';') { let e = k; while (e < body.length && body[e] !== '\n' && body[e] !== '\r') e++; o += body.slice(k, e); k = e - 1; continue; }
    if (c === '%') { const m = /^\w+/.exec(body.slice(k + 1)); if (m && Object.prototype.hasOwnProperty.call(map, m[0])) { o += '%' + map[m[0]]; k += m[0].length; n++; continue; } }
    o += c;
  }
  return { text: o, n };
}
const strictPrefix = names => { const u = [...new Set(names)]; for (const a of u) for (const b of u) if (a !== b && b.startsWith(a)) return [a, b]; return null; };

// ---- binding: which define(s) a call in file key can see (include closure of every root that reaches the file)
function binder(m) {
  const rootsCache = new Map(), visCache = new Map();
  const roots = key => {
    if (rootsCache.has(key)) return rootsCache.get(key);
    const out = new Set(), seen = new Set([key]), st = [key];
    while (st.length) {
      const k = st.pop(), up = m.includedBy.get(k);
      if (!up || !up.size) { if (!k.endsWith('/.presets')) out.add(k); continue; }
      for (const u of up) if (!seen.has(u)) { seen.add(u); st.push(u); }
    }
    rootsCache.set(key, out); return out;
  };
  const visible = root => {
    if (visCache.has(root)) return visCache.get(root);
    const seen = new Set([root]), st = [root];
    while (st.length) { const k = st.pop(); for (const t of m.graph.get(k) || []) if (!seen.has(t)) { seen.add(t); st.push(t); } }
    visCache.set(root, seen); return seen;
  };
  const defKeys = name => {
    const s = new Set((m.byName.get(name) || { defs: [] }).defs.map(d => d.key));
    for (const [k, f] of m.vanilla.files) if (!m.files.has(k) && f.d.includes(name)) s.add(k);
    return s;
  };
  // -> Set of define file keys a call in `key` may bind to
  const binds = (name, key, dk) => { const out = new Set(); for (const r of roots(key)) { const v = visible(r); for (const k of dk) if (v.has(k)) out.add(k); } return out; };
  return { roots, visible, defKeys, binds };
}

// ---- descriptions for the define headers
const ACC_AMMO = { ap: 'AP', apc: 'APC', apcbc: 'APBC/APHEBC/APCBC/BR-350', apcr: 'APCR', hvap: 'HVAP', heat: 'HEAT', apds: 'APDS', fg: 'HE/WP' };
function paramMeaning(p, d, body) {
  const used = new RegExp('%' + p + '(?!\\w)').test(stripComments(body));
  const unused = used ? '' : ' (passed by callers, not used by this body)';
  if (/^damage_(215|170|100)$/.test(d.name) || d.name === 'damage') {
    const at = { at20: 20, at100: 100, at170: 170, at215: 215, at250: 250, a: 20, b: 100, c: 170, d: 215, e: 250 }[p];
    if (at && d.name === 'damage') return `damage (penetration) at ${at} m`;
    if (at) {
      const last = +d.name.slice(7), next = { 215: 250, 170: 215, 100: 170 }[last];
      if (at === next) return `damage at ${at} m: the ${last}-${at} m line is read at max m (not a table point)` + unused;
      return `damage (penetration) at ${at} m` + unused;
    }
    if (p === 'max' || p === 'range') return `range where the table ends, m: damage there interpolated, 0 from max+5 m`;
  }
  if (d.name === 'damage_heat') {
    if (p === 'damage' || p === 'a') return 'damage (penetration), the same from 0 m to max';
    if (p === 'max' || p === 'range') return 'range where the damage ends, m (0 from max+5 m)';
  }
  if (p === 'mps' || (p === 's' && /^\{speed/.test(flat(body)))) return 'projectile speed, m/s (callers pass the real muzzle velocity)';
  if (d.name === 'speed_all' && ['ap', 'apcr', 'heat', 'fg'].includes(p)) return `projectile speed of the ${{ ap: 'AP-type (ap/apc/apbc/aphebc/apcbc/br350*)', apcr: 'APCR/APDS/HVAP', heat: 'HEAT', fg: 'HE/WP' }[p]} shells, m/s`;
  if (p === 'r' && /recoveryTime \(\/ 60 %r\)/.test(flat(body))) return 'rate of fire, rounds per minute (recoveryTime = 60 / r)';
  if (p === 'r1') return 'spread multiplier of the curve (smaller = more accurate)';
  if (p === 'ap' && /direct_howitz/.test(d.name)) return 'spread multiplier for AP/APC shells';
  if (p === 'heat' && /direct_howitz/.test(d.name)) return 'spread multiplier for HEAT shells';
  if (p === 'max_dist_ap') return 'last aimed range of AP-type shells, m (spread 40 from +5 m)';
  if (p === 'max_dist_fg') return 'last aimed range of HE/WP shells, m (spread 40 from +5 m)';
  if (p === 'max_dist') return 'last aimed range, m (spread 60 from +5 m)';
  let mm = /^(\w+?)_acc$/.exec(p);
  if (mm) return `spread factor (x the multiplier) at the last aimed range for ${ACC_AMMO[mm[1]] || mm[1]} shells` + unused;
  if (/^\d+$/.test(p) && /^fg/.test(d.name)) return 'filler value (explosive energy): anti-tank energy and anti-personnel area scale with it';
  if (/^\d+$/.test(p) && /^_tr/.test(d.name)) return 'tracer size: trace length (and width) scale with it';
  // fallback: the tag around the first use
  const b = stripComments(body), i = b.search(new RegExp('%' + p + '(?!\\w)'));
  if (i < 0) return 'passed by callers, not used by this body';
  let dep = 0;
  for (let k = i; k >= 0; k--) { const c = b[k]; if (c === '}') dep++; else if (c === '{') { if (dep === 0) { const t = /^\{(\w+)/.exec(b.slice(k)); if (t) return `value of {${t[1]}}`; } else dep--; } }
  return 'value substituted into the body';
}
// top-level summary of a body
function topLevel(body) {
  const b = stripComments(body), out = [];
  let dep = 0;
  for (let k = 0; k < b.length; k++) {
    const c = b[k];
    if (c === '"') { const e = b.indexOf('"', k + 1); k = e < 0 ? b.length : e; continue; }
    if (c === '{' || c === '(') {
      if (dep === 0) {
        if (c === '{') { const t = /^\{\s*(\w+)(?:\s+"([^"]*)")?/.exec(b.slice(k)); if (t) out.push({ k: 'tag', name: t[1], arg: t[2] }); }
        else { const t = /^\(\s*"([^"]*)"/.exec(b.slice(k)), u = /^\(\s*mod\s+"([^"]*)"/.exec(b.slice(k)); if (t) out.push({ k: 'call', name: t[1], text: b.slice(k) }); else if (u) out.push({ k: 'mod', name: u[1] }); }
      }
      dep++;
    } else if (c === '}' || c === ')') dep--;
  }
  return out;
}
function callText(c, map) {
  const ps = c.params.map(p => (map && map[p.name] || p.name) + '(' + p.value.replace(/\s+/g, ' ').trim() + ')');
  const as = c.args && c.args.length ? ['args'].concat(c.args.map(a => a.text.replace(/\s+/g, ' '))) : [];
  return `("${c.name}"${ps.length || as.length ? ' ' : ''}${ps.concat(as).join(' ')})`;
}
function what(d, body) {
  const f = flat(body), n = d.name;
  if (/^damage_(215|170|100)$/.test(n)) { const last = n.slice(7); return `projectileDamageTable (penetration by range): points from 20 m to ${last} m, the ${last} m line read at max m, 0 from max+5 m`; }
  if (n === 'damage_heat') return 'projectileDamageTable (HEAT): the same damage from 0 m to max m, 0 from max+5 m';
  if (n === 'damage') return 'projectileDamageTable (penetration by range): points at 20/100/170/215/250 m, 0 from 255 m';
  const sp = /^\{speed \(\* ([0-9.]+) %\w+\)\}$/.exec(f);
  if (sp) return `{speed} = ${sp[1] === '1.0' ? 'the value' : sp[1] + ' x the value'} (projectile speed)`;
  if (n === 'speed_all') return '{speed} per ammo type: base and every {parameters} block (AP-type, APCR-type, HEAT, HE/WP)';
  if (n === 'accuracy_curve_gun' || n === 'accuracy_curve_gun_anti_far' || n === 'accuracy_curve_direct_howitz' || n === 'accuracy_curve_direct_howitz_anti_far')
    return 'spread table {radiusTable} per ammo type: x multiplier at 0/50/90/120/150 m, *_acc at the last aimed range +3 m, ' + (/howitz/.test(n) ? '60' : '40') + ' from +5 m' + (/anti_far/.test(n) ? '; HE/WP' + (/howitz/.test(n) ? '/HEAT' : '') + ' start at 20 at 0 m (see the table above)' : '');
  const tl = topLevel(body);
  const one = tl.length === 1 && tl[0].k === 'call' ? tl[0] : null;
  if (one && /^accuracy_curve_(gun|direct_howitz)/.test(one.name)) {
    const v = p => { const x = new RegExp('\\b' + p + '\\(([^)]*)\\)').exec(one.text); return x ? x[1] : '?'; };
    const ap = /howitz/.test(one.name) ? v('max_dist') : v('max_dist_ap'), he = /howitz/.test(one.name) ? v('max_dist') : v('max_dist_fg');
    return `spread curve "${one.name}": AP-type aimed to ${ap} m, HE to ${he} m (row in the accuracy table above)`;
  }
  if (one && /^accuracy_curve_/.test(one.name)) { const r = /\br1\(([^)]*)\)/.exec(one.text); if (r && !/%/.test(r[1])) return `"${one.name}" with the multiplier r1 ${r[1]}`; }
  const parts = [];
  const calls = tl.filter(t => t.k === 'call');
  for (const c of calls) { const ps = [...c.text.matchAll(/(\w+)\(([^)]*)\)/g)].map(x => x[1] + '(' + x[2] + ')'); parts.push(`"${c.name}"` + (ps.length ? ' with ' + ps.slice(0, 4).join(' ') + (ps.length > 4 ? ' ...' : '') : '')); }
  const tags = [...new Set(tl.filter(t => t.k === 'tag' && t.name !== 'parameters').map(t => '{' + t.name + '}'))];
  if (tags.length) parts.push('sets ' + tags.slice(0, 8).join(' ') + (tags.length > 8 ? ' ...' : ''));
  const pars = tl.filter(t => t.k === 'tag' && t.name === 'parameters').map(t => t.arg);
  if (pars.length) parts.push('per-ammo {parameters} ' + pars.slice(0, 6).join(' ') + (pars.length > 6 ? ' ...' : ''));
  const mods = tl.filter(t => t.k === 'mod').map(t => t.name);
  if (mods.length) parts.push('(mod "' + mods.join('" "') + '") block');
  if (/^fg/.test(n) && /blastwave/.test(f)) return 'HE blast: blastwave damage layers (anti-tank, anti-personnel) scaled by the filler value';
  return parts.join('; ') || 'empty body';
}

function eolOf(s) { const e = lineEnds(s); if (!e.length) return '\r\n'; return e.filter(x => x.len === 2).length * 2 >= e.length ? '\r\n' : s.slice(e[0].pos, e[0].pos + e[0].len); }

// ---- the accuracy table
function accTable(m, F, defs) {
  const val = (d, p) => { const mm = new RegExp('\\b' + p + '\\(([^)]*)\\)').exec(stripComments(d.body)); return mm ? mm[1] : ''; };
  const callee = d => { const t = topLevel(d.body).filter(x => x.k === 'call'); return t.length === 1 ? t[0].name : ''; };
  const curves = defs.filter(d => /^accuracy_curve_/.test(d.name));
  const rows = [], suf = new Map();
  for (const d of curves) {
    const mm = /^accuracy_curve_(direct_howitz_)?(\d+)m(_.*)?$/.exec(d.name);
    const base = callee(d) || '(base)';
    const ap = val(d, 'max_dist_ap') || val(d, 'max_dist'), he = val(d, 'max_dist_fg') || val(d, 'max_dist');
    rows.push([d.name, base, ap, he, val(d, 'fg_acc'), val(d, 'apds_acc') || val(d, 'ap_acc')]);
    if (mm) {
      const R = +mm[2], s = (mm[3] || '').replace(/_anti_far$/, '') || '(none)';
      if (!mm[1]) { if (!suf.has(s)) suf.set(s, new Set()); if (he) suf.get(s).add(R - +he); }
    }
  }
  // what _anti_far changes: compare the base pairs block by block
  const blocks = d => { const out = new Map(); const b = stripComments(d.body); const re = /\{parameters "(\w+)"/g; let last = 0, name = '(base)', mm; while ((mm = re.exec(b))) { out.set(name, b.slice(last, mm.index).replace(/\s+/g, ' ')); name = mm[1]; last = mm.index; } out.set(name, b.slice(last).replace(/\s+/g, ' ')); return out; };
  const byName = new Map(defs.map(d => [d.name, d]));
  const afDiff = n => { const a = byName.get(n), b = byName.get(n + '_anti_far'); if (!a || !b) return ''; const x = blocks(a), y = blocks(b); return [...x.keys()].filter(k => x.get(k) !== y.get(k)).join(' '); };
  const rng = s => [...(suf.get(s) || [])].sort((a, b) => a - b).map(v => v ? `R-${v}` : 'R').join(' / ');
  const L = [ACC_MARK,
    '; base curves (spread radius = factor x multiplier at 0/50/90/120/150 m, then *_acc x multiplier at the last aimed range +3 m):',
    ';   accuracy_curve_gun                    guns, one block per ammo type; spread 40 from the last aimed range +5 m',
    `;   accuracy_curve_gun_anti_far           same, but blocks ${afDiff('accuracy_curve_gun') || '-'} start at spread 20 at 0 m instead of 0`,
    ';   accuracy_curve_direct_howitz          direct-fire howitzers: AP/APC x ap, HEAT x heat, APCR/HE/WP x r1; spread 60 from +5 m',
    `;   accuracy_curve_direct_howitz_anti_far same, but blocks ${afDiff('accuracy_curve_direct_howitz') || '-'} start at spread 20 at 0 m`,
    ';   accuracy_curve_2 / accuracy_curve_3   fixed tables to 250 m / 800 m, no range cut',
    '; suffixes (R = the <R>m in the name; HE = max_dist_fg, AP = max_dist_ap = R):',
    `;   <R>m           AP-type shells aimed to R m, HE to ${rng('(none)')} (as found)`,
    `;   _10m_he        HE aimed to ${rng('_10m_he')}`,
    `;   _20m_he_elite  HE aimed to ${rng('_20m_he_elite')}, fg_acc as the _10m_he curve [I] elite crews`,
    `;   _vet           HE aimed to ${rng('_vet')} (the full range) [I] veteran crews: the name says so, the body only moves the HE range`,
    `;   _17pdr         HE aimed to ${rng('_17pdr')}, apds_acc about 1.6x (APDS spread worse at range) [I] 17pdr APDS`,
    ';   _anti_far      calls the *_anti_far base (spread 20 at 0 m, see above) [I] the name suggests a far-shooting fix; the body only changes that 0 m spread',
    ';   order in names: accuracy_curve_[direct_howitz_]<R>m[_10m_he|_20m_he_elite|_vet|_17pdr][_anti_far]',
    '; accuracy_<quality>[_<R>m][suffix] below = one curve with a fixed multiplier r1 (zenite_low 1.30 ... max 0.875)',
  ];
  const w = [0, 0, 0, 0, 0, 0];
  const hdr = ['curve', 'base', 'AP m', 'HE m', 'fg_acc', 'apds_acc / ap_acc'];
  for (const r of [hdr, ...rows]) r.forEach((c, i) => { w[i] = Math.max(w[i], String(c).length); });
  for (const r of [hdr, ...rows]) L.push(';   ' + r.map((c, i) => i === r.length - 1 ? String(c) : String(c).padEnd(w[i])).join('  ').replace(/\s+$/, ''));
  return L;
}

// ---- author tables from the txt
function readTables(modDir) {
  const p = path.join(modDir, DESIGN_FILE);
  if (!fs.existsSync(p)) return null;
  const s = fs.readFileSync(p).toString('latin1');
  const lines = s.split(/\r\n|\n|\r/);
  const out = new Map();
  for (const t of TABLES) {
    const i = lines.findIndex(L => t.head.test(L));
    if (i < 0) continue;
    let a = i;
    if (t.pre && i > 0 && t.pre.test(lines[i - 1])) a = i - 1;
    let b = i;
    if (t.until === 'blank') { while (b + 1 < lines.length && lines[b + 1].trim() && !/^-{4,}/.test(lines[b + 1])) b++; }
    else if (t.until === 'blank2') { while (b + 1 < lines.length && !(lines[b + 1].trim() === '' && (b + 2 >= lines.length || lines[b + 2].trim() === ''))) b++; }
    while (b > a && !lines[b].trim()) b--;
    out.set(t.id, { from: a + 1, to: b + 1, lines: lines.slice(a, b + 1) });
  }
  return out;
}

module.exports = {
  id: 'guns',
  title: 'gun tables: damage/speed parameter names, accuracy curve table, author design tables, define headers',
  RENAMES, renameBody, stripComments, strictPrefix,
  plan(ctx) {
    const m = ctx.model, changes = [], cases = [];
    const B = binder(m);
    const edits = new Map();   // rel -> [{ a, b, text, ord, row }]
    const add = (rel, e) => { if (!edits.has(rel)) edits.set(rel, []); edits.get(rel).push(e); };
    const touched = new Set();
    const stuffPresets = d => /^resource\/set\/stuff\/.*\.presets$/.test(d.key) && d.key.endsWith('/.presets');
    const renamedParams = new Map();   // define idx -> map (for the e.g. line)

    // 1. parameter renames
    for (const R of RENAMES) {
      const x = m.byName.get(R.name);
      if (!x) continue;
      const dk = B.defKeys(R.name);
      for (const d of x.defs) {
        if (!d.scope || !stuffPresets(d)) continue;
        const map = {};
        for (const [o, n] of Object.entries(R.map)) if (new RegExp('%' + o + '(?!\\w)').test(stripComments(d.body))) map[o] = n;
        if (!Object.keys(map).length) continue;           // done already (or nothing to do)
        const skip = why => cases.push({ id: 'guns-param', title: `${d.rel}:${d.line}: "${R.name}" parameters not renamed`, detail: why });
        if (!R.shape.test(flat(d.body))) { skip('body is not the expected shape: ' + flat(d.body).slice(0, 160)); continue; }
        if (d.inDefine >= 0) { skip('define inside another define'); continue; }
        if (m.dynMatch(R.name)) { skip('name may be built by a dynamic call'); continue; }
        const why = [], mine = [];
        for (const c of x.calls) {
          const bk = B.binds(R.name, c.key, dk);
          if (!bk.has(d.key)) continue;
          if (bk.size > 1) { why.push(`${c.rel}:${c.line} sees ${bk.size} defines of the name`); continue; }
          if (c.def) { why.push(`${c.rel}:${c.line} calls it inside the macro "${c.def.name}"`); continue; }
          if (!c.scope) { why.push(`${c.rel}:${c.line} is outside the edited files`); continue; }
          if (c.args && c.args.length) { why.push(`${c.rel}:${c.line} passes positional args`); continue; }
          mine.push(c);
        }
        for (const [k, f] of m.vanilla.files) {
          if (m.files.has(k) || !f.c.includes(R.name)) continue;
          if (B.binds(R.name, k, dk).has(d.key)) { why.push(`live vanilla file ${k} calls it (PORT-55/61)`); if (why.length > 6) break; }
        }
        // SDL-56 over the define's params and every caller's params after the rename
        const ren = p => map[p] || R.map[p] || p;
        const all = d.params.named.map(ren);
        for (const c of mine) { const ps = c.params.map(p => ren(p.name)); const pp = strictPrefix(ps.concat(d.params.named.map(ren))); if (pp) { why.push(`${c.rel}:${c.line}: "${pp[0]}" is a strict prefix of "${pp[1]}" (SDL-56)`); break; } all.push(...ps); }
        const pp = strictPrefix(all); if (pp && !why.length) why.push(`"${pp[0]}" is a strict prefix of "${pp[1]}" (SDL-56)`);
        for (const n of Object.values(map)) if (d.params.named.includes(n)) why.push(`"${n}" already a parameter`);
        for (const c of mine) for (const p of c.params) if (Object.values(R.map).includes(p.name) && !R.map[p.name]) why.push(`${c.rel}:${c.line} already passes "${p.name}"`);
        if (why.length) { skip(why.slice(0, 6).join('; ') + (why.length > 6 ? ` (+${why.length - 6})` : '')); continue; }
        // edits: body
        const r = renameBody(d.body, map);
        add(d.rel, { a: d.bodySpan[0], b: d.bodySpan[1], text: r.text, ord: 5, expect: d.body, row: { line: d.line, kind: 'param_define', before: `${R.name}: ${Object.keys(map).join(' ')}`, after: Object.values(map).join(' '), note: `${r.n} uses in the body` } });
        touched.add(d.rel);
        renamedParams.set(d.idx, R.map);
        for (const c of mine) for (const p of c.params) if (R.map[p.name]) add(c.rel, { a: p.nameSpan[0], b: p.nameSpan[1], text: R.map[p.name], ord: 5, expect: p.name, row: { line: c.line, kind: 'param_call', before: `${R.name} ${p.name}(`, after: `${R.map[p.name]}(`, note: '' } });
      }
    }

    // 3. author tables (decide the files before headers)
    const tables = readTables(ctx.modDir);
    const tableIns = [];
    if (!tables) cases.push({ id: 'guns-design', title: `"${DESIGN_FILE}" not found in the mod folder`, detail: 'author tables not copied' });
    else for (const t of TABLES) {
      const tb = tables.get(t.id);
      if (!tb) { cases.push({ id: 'guns-design', title: `table "${t.id}" not found in "${DESIGN_FILE}"`, detail: String(t.head) }); continue; }
      if (!t.file) {
        const has = [...m.byName.keys()].some(n => t.group.test(n) && m.byName.get(n).defs.length);
        if (!has) { cases.push({ id: 'guns-design-nodef', title: `table "${t.id}" (${DESIGN_FILE} lines ${tb.from}-${tb.to}) not copied`, detail: `no define matches ${t.group} in the mod (names in the table: ${[...new Set(tb.lines.join(' ').match(/cumulative\w*/g) || [])].join(' ')})` }); }
        continue;
      }
      const F = m.files.get(t.file.toLowerCase());
      if (!F) { cases.push({ id: 'guns-design', title: `${t.file} not in the mod`, detail: `table ${t.id} not copied` }); continue; }
      const d = m.defines.find(x => x.key === F.key && t.group.test(x.name) && x.inDefine < 0);
      if (!d) { cases.push({ id: 'guns-design', title: `${t.file}: no define matches ${t.group}`, detail: `table ${t.id} not copied` }); continue; }
      const mark = `${TAB_MARK} line${tb.from === tb.to ? ' ' + tb.from : `s ${tb.from}-${tb.to}`}`;
      if (F.s.includes(mark)) continue;
      const body = [`${mark}): ${t.title}, copied as written ----`].concat(tb.lines.map(L => L.startsWith(';') ? L : (L.length ? '; ' + L : ';')));
      tableIns.push({ F, d, lines: body, id: t.id, from: tb.from, to: tb.to });
      touched.add(F.rel);
    }

    // 2. accuracy table above accuracy_curve_gun
    for (const F of m.files.values()) {
      if (!F.scope || !/^resource\/set\/stuff\/.*\/\.presets$/.test(F.key)) continue;
      const defs = m.defines.filter(d => d.key === F.key);
      const g = defs.find(d => d.name === 'accuracy_curve_gun');
      if (!g || F.s.includes(ACC_MARK)) continue;
      tableIns.push({ F, d: g, lines: accTable(m, F, defs), id: 'accuracy', acc: true });
      touched.add(F.rel);
    }

    // 4. headers for every define in the touched .presets files
    const firstCall = (name, key) => {
      const x = m.byName.get(name); if (!x) return null;
      const dir = key.slice(0, key.lastIndexOf('/') + 1);
      const top = x.calls.filter(c => !c.def && !c.bad);
      return top.find(c => c.key.startsWith(dir) && c.key.slice(dir.length).indexOf('/') < 0) || top[0] || x.calls.find(c => !c.bad) || null;
    };
    for (const rel of touched) {
      const F = m.files.get(rel.toLowerCase());
      if (!F || !F.key.endsWith('.presets')) continue;
      const eol = eolOf(F.s), ls = F.scan.lineStarts;
      for (const d of m.defines.filter(x => x.key === F.key)) {
        if (d.inDefine >= 0) continue;
        if (d.header.some(h => h.replace(/^[ \t]*/, '').startsWith(`; ${d.name}:`))) continue;
        const lineStart = ls[d.line - 1];
        if (!/^[ \t]*$/.test(F.s.slice(lineStart, d.span[0]))) { cases.push({ id: 'guns-header', title: `${rel}:${d.line}: "${d.name}" shares its line`, detail: 'no header written' }); continue; }
        const ind = F.s.slice(lineStart, d.span[0]);
        const map = renamedParams.get(d.idx) || {};
        const body = renameBody(d.body, Object.fromEntries(Object.entries(map).filter(([o]) => new RegExp('%' + o + '(?!\\w)').test(d.body)))).text;
        const params = bodyParams(stripComments(body));
        const c = firstCall(d.name, d.key);
        const H = [`; ${d.name}: ${what(d, body)}`];
        // caller order first (also params the body ignores, damage_170 at250 ...), then body-only ones
        const order = [...new Set((c ? c.params.map(p => map[p.name] || p.name) : []).concat(params.named))];
        for (const p of order) H.push(`;   ${p} - ${paramMeaning(p, d, body)}`);
        for (const p of params.positional) H.push(`;   args ${p} (positional %${p}) - ${paramMeaning(p, d, body)}`);
        H.push(`;   e.g. ${c ? callText(c, map) : `("${d.name}"${params.named.map(p => ` ${p}(..)`).join('')}${params.positional.length ? ' args ..' : ''})`}${c ? '' : ' (no call in the mod)'}`);
        add(rel, { a: lineStart, b: lineStart, text: H.map(h => ind + h).join(eol) + eol, ord: 2, row: { line: d.line, kind: 'header', before: d.name, after: `${H.length} comment lines`, note: '' } });
      }
    }
    tableIns.forEach((t, i) => {   // tables at one position keep the TABLES order (lower ord = earlier in the text)
      const ls = t.F.scan.lineStarts, eol = eolOf(t.F.s);
      const pos = ls[t.d.line - t.d.header.length - 1];
      add(t.F.rel, { a: pos, b: pos, text: t.lines.join(eol) + eol + eol, ord: 1 + i / 1000, row: { line: t.d.line, kind: t.acc ? 'acc_table' : 'design_table', before: t.d.name, after: `${t.lines.length} comment lines`, note: t.acc ? '' : `${DESIGN_FILE} lines ${t.from}-${t.to}` } });
    });

    // apply edits per file (descending position; at one position lower ord ends up first)
    for (const [rel, eds] of edits) {
      const F = m.files.get(rel.toLowerCase());
      let s = ctx.read(rel).toString('latin1');
      if (s !== F.s) { cases.push({ id: 'guns-stale', title: `${rel}: changed since the model was built`, detail: 'not edited' }); continue; }
      eds.sort((p, q) => q.a - p.a || q.ord - p.ord);
      for (let i = 1; i < eds.length; i++) if (eds[i].b > eds[i - 1].a) throw new Error(`guns: overlapping edits in ${rel}`);
      for (const e of eds) {
        if (e.expect !== undefined && s.slice(e.a, e.b) !== e.expect) throw new Error(`guns: span mismatch in ${rel} at ${e.a}`);
        s = s.slice(0, e.a) + e.text + s.slice(e.b);
      }
      changes.push({ file: rel, after: Buffer.from(s, 'latin1'), create: false, rows: eds.slice().reverse().map(e => e.row) });
    }
    return { changes, cases };
  },
};
