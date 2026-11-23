#!/usr/bin/env node
// lngstd: standardizer for a mod's split localization folder (tools/lngsplit layout). Copies the folder to --out and applies line-level
//   edits to <title>/mod/**.inc parts only (vanilla parts, _dropped/, parents, comments and line order untouched; a second run is a no-op).
//   rows LOC-03 LOC-04 LOC-05 LOC-06 LOC-07 LOC-08 LOC-14 LOC-28
// usage: node tools/lngstd/lngstd.js <modDir> --out <folder> [--loc <textFolder>] [--only glyph,case,space,soldier,weapon,year]
//          [--report f.tsv] [--spelling f.tsv] [-q]
//   --loc   text folder (default <modDir>/localization, else <modDir>/resource/interface/text; relative = under <modDir>)
//   passes: glyph  U+2010/2011 en/em dash -> '-' (em dash glued between words -> ' - '), curly quotes -> straight (double -> \"),
//                  U+2026 -> '...', NBSP -> space; other non-Latin-1 chars only reported (LOC-14)
//           case   key and nested group names lower-cased (LOC-03); a lower-case collision is left and reported (LOC-04)
//           space  strip leading/trailing spaces, collapse runs of spaces (not inside <..> tags, not next to \n); --spelling lists
//                  misspelling candidates (near-duplicate of a much more frequent word, repeated word, 155m beside 155mm), not applied
//           soldier desc/human/** names brought to the measured majority prefix form (colour tag, its hex case, spacing, first letter
//                  capital); a non-majority colour used by 2+ names is a deliberate sub-group: left and reported
//           weapon desc/weapon/** stat blocks (name\n Label - value unit ...) to the majority label wording per stat, separator, lead
//                  space, unit spelling/spacing and stat order; values and colour tags kept; unparsed blocks left and reported
//           year   desc/squad keys (squad/, hero/ but not *_entity, vehicle_group/ parts) that differ only by a year token (_39.._45,
//                  _1939.._1945) and share one text get the year appended (measured form, default ' 1944'); every key of such a
//                  group gets a '; ToE:' comment line above it (below its context line)
//   guards: an edit that changes the %-spec sequence (LOC-28) or leaves an unclosed tag (LOC-07/08) is reverted and reported
// codes (findings = items left unchanged): LNGSTD_ENC (LOC-05: part not UTF-8 / BOM, skipped) WARN_LNGSTD_GLYPH_OTHER (LOC-14)
//   LNGSTD_CASE_COLLISION (LOC-03/04) WARN_LNGSTD_SPACE_BLANK WARN_LNGSTD_SOLDIER_SUBGROUP WARN_LNGSTD_WEAPON_UNPARSED
//   WARN_LNGSTD_WEAPON_ORDER WARN_LNGSTD_YEAR_VANILLA WARN_LNGSTD_YEAR_HAS_YEAR LNGSTD_PARAM_GUARD (LOC-28) LNGSTD_TAG_GUARD (LOC-07/08)
//   WARN_LNGSTD_UNMAPPED (line in a mod part that no parent includes); info LNGSTD_EDIT per change
// Author: Imperator_Aug (ARSENAL, ia-dfc6e068)
const fs = require('fs'), path = require('path');
const lnginc = require('../lib/lnginc');
const { createReport } = require('../lib/report');

const PASSES = ['case', 'glyph', 'space', 'soldier', 'weapon', 'year'];
const LEAF = /^(\s*\{\s*")((?:[^"\\]|\\.)*)("\s+")((?:[^"\\]|\\.)*)("\s*\}.*)$/;
const GROUP = /^(\s*\{\s*")((?:[^"\\]|\\.)*)("\s*)$/;
const TOE = /^\s*;\s*ToE:/i;
const TOE_LINE = '; ToE:';

// ---------- files ----------
function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out); else out.push(path.relative(base, p).replace(/\\/g, '/'));
  }
  return out;
}
const isModPart = rel => /^[^/]+\/mod\/.+\.inc$/i.test(rel) && !/^_dropped\//i.test(rel);
const fkey = f => path.resolve(f).toLowerCase();

function locate(modDir, loc) {
  if (loc) { const a = path.resolve(modDir, loc); return fs.existsSync(a) ? a : path.resolve(loc); }
  for (const c of ['localization', 'resource/interface/text']) { const p = path.join(modDir, c); if (fs.existsSync(p)) return p; }
  return null;
}

// ---------- key map: (file,line) -> full key, every leaf/group of the folder ----------
function keyMap(locDir, rels) {
  const at = new Map(), all = [];
  for (const rel of rels) {
    if (!/\.lng$/i.test(rel) || /^_dropped\//i.test(rel)) continue;
    let p; try { p = lnginc.parseLng(path.join(locDir, rel), rel, { textDir: locDir }); } catch { continue; }
    if (p.fatal || !p.root) continue;
    const prefix = lnginc.keyPrefix(rel);
    const visit = (n, kp) => {
      if (!n.name) return;
      const key = kp + n.name, o = p.origin[n.line - 1] || { file: path.join(locDir, rel), line: n.line };
      const r = { key, file: o.file, line: o.line, group: n.kids.length > 0, txt: n.vals.filter(v => v.t === 's').map(v => v.v).join('') };
      all.push(r); at.set(fkey(o.file) + ':' + o.line, r);
      n.kids.forEach(c => visit(c, key + '/'));
    };
    for (const t of p.root.kids) {
      if (!t.name) continue;
      if (t.name.toLowerCase() === 'tags') t.kids.forEach(c => visit(c, prefix)); else visit(t, prefix);
    }
  }
  return { at, all };
}

// ---------- text helpers ----------
const specs = t => (t.match(/%[-+ #0]*\d*(?:\.\d+)?[a-zA-Z%]/g) || []).join(',');
function tagsOk(t) {
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== '<') continue;
    if (t[i + 1] === '<') { i++; continue; }
    const j = t.indexOf('>', i), k = t.indexOf('<', i + 1);
    if (j < 0 || (k >= 0 && k < j)) return false;
    i = j;
  }
  return true;
}
const plain = t => t.replace(/<<|<[^<>]*>/g, ' ').replace(/\\n/g, ' ');

// glyph: returns new text; others = non-Latin-1 chars left
function glyph(t) {
  let s = t.replace(/[‐‑–]/g, '-').replace(/…/g, '...').replace(/ /g, ' ');
  s = s.replace(/(.?)—(.?)/g, (m, a, b) => (a && b && /\S/.test(a) && /\S/.test(b) && a !== '\\') ? a + ' - ' + b : a + '-' + b);
  s = s.replace(/[‘’‚‛′]/g, '\'').replace(/[“”„‟″]/g, '\\"');
  const others = [...new Set([...s].filter(c => c.codePointAt(0) > 0xff))];
  return { s, others };
}

// space: protect tags and \n neighbourhood
function space(t) {
  if (!/\S/.test(t)) return t;
  // split into tag / \n / text tokens
  const toks = t.match(/<<|<[^<>]*>|\\n|\\.|[^<\\]+|[<\\]/g) || [];
  for (let i = 0; i < toks.length; i++) {
    const k = toks[i];
    if (k.startsWith('<') || k.startsWith('\\')) continue;
    const prevNl = toks[i - 1] === '\\n', nextNl = toks[i + 1] === '\\n';
    let x = k;
    // runs of 2+ spaces collapse, except a run that touches \n (kept as is)
    x = x.replace(/ {2,}/g, (m, off) => ((off === 0 && prevNl) || (off + m.length === x.length && nextNl)) ? m : ' ');
    toks[i] = x;
  }
  let s = toks.join('');
  s = s.replace(/^ +/, '').replace(/ +$/, '');
  return s;
}

function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// ---------- weapon stat blocks ----------
const SYN = {
  range: ['range', 'effective range', 'max range', 'maximum range', 'firing range'],
  pen: ['penetration', 'armor penetration', 'armour penetration'],
  vel: ['muzzle velocity', 'velocity', 'muzzle speed'],
  acc: ['accuracy'], barrage: ['barrage'],
  reload: ['reloading time', 'reload time', 'reload', 'reloading'],
  rpm: ['cycling rate', 'cyclic rate'], rof: ['rate of fire', 'fire rate'],
};
const statId = base => { const b = base.toLowerCase(); for (const [id, l] of Object.entries(SYN)) if (l.includes(b)) return id; return b; };
const UNITS = { m: ['m', 'meters', 'metres', 'meter', 'metre'], mm: ['mm'], 'm/s': ['m/s', 'mps', 'm/sec'], s: ['s', 'sec', 'secs', 'seconds', 'second'],
  rpm: ['rpm'], rpmin: ['rounds per minute', 'rounds/min', 'rds/min'], shell: ['shells', 'shell'] };
const unitId = u => { const l = u.toLowerCase(); for (const [id, v] of Object.entries(UNITS)) if (v.includes(l)) return id; return l ? 'other:' + l : ''; };
const STAT = /^( *)([A-Za-z][A-Za-z .]*?)( +- +| *: +)((?:<c\([0-9a-fA-F]+\)>)?)(.*?)((?:<c\([0-9a-fA-F]+\)>)?)$/;
function parseWeapon(t) {
  if (!t.includes('\\n')) return null;
  const segs = t.split('\\n');
  const h = /^(.*?)((?:<[^<>]*>)*)$/.exec(segs[0]);
  const w = { name: h[1], headTags: h[2], stats: [] };
  if (!w.name.trim()) return { bad: 'no weapon name before the first \\n' };
  for (const s of segs.slice(1)) {
    const m = STAT.exec(s);
    if (!s.trim()) return { bad: 'empty line (\\n\\n) inside the block' };
    if (!m) return { bad: `stat line not "Label - value": "${s.slice(0, 40)}"` };
    if (/[<>]/.test(m[5])) return { bad: `extra tag inside a stat value: "${s.slice(0, 40)}"` };
    const lq = /^(.*?)((?: [A-Z][A-Z0-9]+)*)$/.exec(m[2]);
    const st = { lead: m[1], base: lq[1], qual: lq[2], sep: m[3], vtag: m[4], ttag: m[6], id: statId(lq[1]) };
    const vm = /^(\d[\d.,]*(?: ?- ?\d[\d.,]*)?)( *)([A-Za-z/][A-Za-z/ .]*?)?$/.exec(m[5]);
    if (vm) { st.value = vm[1]; st.usp = vm[2]; st.unit = vm[3] || ''; } else if (/^[A-Za-z][A-Za-z ]*$/.test(m[5])) { st.value = m[5]; st.usp = ''; st.unit = ''; st.word = true; }
    else return { bad: `value not "number unit" or a word: "${m[5].slice(0, 30)}"` };
    st.uid = unitId(st.unit);
    w.stats.push(st);
  }
  return w;
}
const statText = st => st.lead + st.base + st.qual + st.sep + st.vtag + st.value + st.usp + st.unit + st.ttag;
const weaponText = w => w.name + w.headTags + w.stats.map(s => '\\n' + statText(s)).join('');

function majority(counts) { let best = null, n = -1; for (const [k, v] of Object.entries(counts)) if (v > n) { best = k; n = v; } return best; }
const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

// ---------- main ----------
function run(opts) {
  const rep = createReport(), log = opts.log || (() => {});
  const only = new Set(opts.only || PASSES);
  const locDir = opts.locDir;
  const rels = walk(locDir).sort();
  const km = keyMap(locDir, rels);
  const changes = [], left = [];
  const leftAdd = (rel, line, key, pass, code, msg) => { rep.add(rel, line, code, msg); left.push({ rel, line, key, pass, msg }); };

  // read mod parts
  const parts = [];
  for (const rel of rels.filter(isModPart)) {
    const buf = fs.readFileSync(path.join(locDir, rel));
    const str = buf.toString('utf8');
    if (str.charCodeAt(0) === 0xfeff || !Buffer.from(str, 'utf8').equals(buf)) { leftAdd(rel, 1, '', 'all', 'LNGSTD_ENC', 'part is not UTF-8 without BOM: left as is (LOC-05)'); continue; }
    const raw = str.split('\n'), lines = raw.map(l => l.replace(/\r$/, '')), cr = raw.map(l => l.endsWith('\r'));
    const part = { rel, lines, cr, orig: lines.slice(), entries: [], inserts: new Map() };
    lines.forEach((L, i) => {
      if (/^\s*;/.test(L)) return;
      const m = LEAF.exec(L), g = m ? null : GROUP.exec(L);
      if (!m && !g) return;
      const k = km.at.get(fkey(path.join(locDir, rel)) + ':' + (i + 1));
      if (!k) { leftAdd(rel, i + 1, '', 'all', 'WARN_LNGSTD_UNMAPPED', 'no parent .lng includes this line: key unknown, left as is'); return; }
      const e = m ? { part, li: i, pre: m[1], name: m[2], mid: m[3], text: m[4], post: m[5], key: k.key, leaf: true }
        : { part, li: i, pre: g[1], name: g[2], post: g[3], key: k.key, leaf: false };
      e.text0 = e.text; e.name0 = e.name; e.lkey = k.key.toLowerCase();
      part.entries.push(e);
    });
    parts.push(part);
  }
  const entries = parts.flatMap(p => p.entries), leaves = entries.filter(e => e.leaf);
  const change = (e, pass, field, val, note) => {
    const before = e[field]; if (before === val) return;
    e[field] = val; changes.push({ e, pass, field, before, after: val, note });
  };

  // case (LOC-03/04)
  if (only.has('case')) {
    const forms = new Map();
    for (const k of km.all) { const l = k.key.toLowerCase(); if (!forms.has(l)) forms.set(l, new Set()); forms.get(l).add(k.key); }
    for (const e of entries) {
      if (e.name === e.name.toLowerCase()) continue;
      const f = forms.get(e.lkey);
      if (f && f.size > 1) { leftAdd(e.part.rel, e.li + 1, e.key, 'case', 'LNGSTD_CASE_COLLISION', `key "${e.key}" lower-cases onto ${[...f].filter(x => x !== e.key).map(x => '"' + x + '"').join(', ')}: both left (LOC-03, LOC-04)`); continue; }
      change(e, 'case', 'name', e.name.toLowerCase());
    }
  }
  // glyph (LOC-14)
  if (only.has('glyph')) for (const e of leaves) {
    const g = glyph(e.text);
    change(e, 'glyph', 'text', g.s);
    if (g.others.length) leftAdd(e.part.rel, e.li + 1, e.key, 'glyph', 'WARN_LNGSTD_GLYPH_OTHER', `non-Latin-1 ${g.others.map(c => c + ' U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(', ')} left: font may lack it (LOC-14)`);
  }
  // space
  if (only.has('space')) for (const e of leaves) {
    if (e.text.length && !/\S/.test(e.text)) { leftAdd(e.part.rel, e.li + 1, e.key, 'space', 'WARN_LNGSTD_SPACE_BLANK', 'text is only spaces: left'); continue; }
    change(e, 'space', 'text', space(e.text));
  }

  // soldier
  const tables = {};
  if (only.has('soldier')) {
    const sol = leaves.filter(e => e.lkey.startsWith('desc/human/'));
    const SP = /^((?:<c\(([0-9a-fA-F]+)\)>)?)( *)(.*)$/;
    const c = { prefix: {}, colour: {}, hexcase: {}, space: {}, first: {}, words: {} };
    for (const e of sol) {
      const m = SP.exec(e.text);
      inc(c.prefix, m[1] ? 'present' : 'absent');
      if (m[2]) { inc(c.colour, m[2].toLowerCase()); inc(c.hexcase, m[2] === m[2].toLowerCase() ? 'lower' : m[2] === m[2].toUpperCase() ? 'upper' : 'mixed'); }
      if (m[1]) inc(c.space, JSON.stringify(m[3]));
      const f = m[4][0] || '';
      inc(c.first, /\p{Lu}/u.test(f) ? 'Upper' : /\p{Ll}/u.test(f) ? 'lower' : 'other');
      const ws = m[4].replace(/\(.*?\)/g, '').split(/\s+/).filter(w => /^\p{L}/u.test(w));
      if (ws.length > 1) inc(c.words, ws.every(w => /^\p{Lu}/u.test(w)) ? 'Title Case' : 'mixed');
    }
    tables.soldier = c;
    const maj = { prefix: majority(c.prefix), colour: majority(c.colour), hexcase: majority(c.hexcase), space: JSON.parse(majority(c.space) || '""'), first: majority(c.first) };
    const firstShare = (c.first[maj.first] || 0) / Math.max(1, sol.length);
    tables.soldierMajority = maj;
    const hexOut = h => maj.hexcase === 'upper' ? h.toUpperCase() : h.toLowerCase();
    if (sol.length) for (const e of sol) {
      const m = SP.exec(e.text);
      let tag = m[1], sp = m[3], rest = m[4];
      if (m[2] && m[2].toLowerCase() !== maj.colour) {
        const n = c.colour[m[2].toLowerCase()];
        if (n >= 2) { leftAdd(e.part.rel, e.li + 1, e.key, 'soldier', 'WARN_LNGSTD_SOLDIER_SUBGROUP', `colour ${m[2]} used by ${n} names (a sub-group, majority ${maj.colour}): left`); tag = `<c(${m[2]})>`; }
        else tag = `<c(${hexOut(maj.colour)})>`;
      } else if (m[2]) tag = `<c(${hexOut(m[2])})>`;
      if (!m[1] && maj.prefix === 'present' && maj.colour) tag = `<c(${hexOut(maj.colour)})>`;
      if (tag) sp = maj.space;
      if (maj.first === 'Upper' && firstShare >= 0.66 && /^\p{Ll}/u.test(rest)) rest = rest[0].toUpperCase() + rest.slice(1);
      change(e, 'soldier', 'text', tag + sp + rest);
    }
  }

  // weapon
  if (only.has('weapon')) {
    const wl = leaves.filter(e => e.lkey.startsWith('desc/weapon/'));
    const parsed = [];
    for (const e of wl) {
      const w = parseWeapon(e.text);
      if (!w) continue;
      if (w.bad) { leftAdd(e.part.rel, e.li + 1, e.key, 'weapon', 'WARN_LNGSTD_WEAPON_UNPARSED', `stat block not parsed (${w.bad}): left`); continue; }
      parsed.push({ e, w });
    }
    const t = { label: {}, sep: {}, lead: {}, unit: {}, usp: {}, prec: {}, colour: {}, head: {} };
    for (const { w } of parsed) {
      inc(t.head, w.headTags);
      w.stats.forEach((s, i) => {
        (t.label[s.id] = t.label[s.id] || {}); inc(t.label[s.id], s.base);
        inc(t.sep, JSON.stringify(s.sep)); inc(t.lead, JSON.stringify(s.lead));
        if (s.uid && !s.uid.startsWith('other:')) {
          (t.unit[s.id + '|' + s.uid] = t.unit[s.id + '|' + s.uid] || {});
          if (!(s.uid === 'shell' && s.value === '1')) inc(t.unit[s.id + '|' + s.uid], s.unit);
          (t.usp[s.id] = t.usp[s.id] || {}); inc(t.usp[s.id], JSON.stringify(s.usp));
        }
        (t.colour[s.id] = t.colour[s.id] || {}); inc(t.colour[s.id], s.vtag ? 'coloured' : 'plain');
        for (const s2 of w.stats.slice(i + 1)) if (s2.id !== s.id) inc(t.prec, s.id + '<' + s2.id);
      });
    }
    const M = { label: {}, unit: {}, usp: {}, sep: JSON.parse(majority(t.sep) || '" - "'), lead: JSON.parse(majority(t.lead) || '" "') };
    for (const [id, o] of Object.entries(t.label)) M.label[id] = majority(o);
    for (const [k, o] of Object.entries(t.unit)) M.unit[k] = majority(o);
    for (const [id, o] of Object.entries(t.usp)) M.usp[id] = JSON.parse(majority(o));
    const before = (a, b) => (t.prec[a + '<' + b] || 0) - (t.prec[b + '<' + a] || 0);
    tables.weapon = t; tables.weaponMajority = M;
    for (const { e, w } of parsed) {
      const ids = w.stats.map(s => s.id);
      if (new Set(ids).size !== ids.length) { leftAdd(e.part.rel, e.li + 1, e.key, 'weapon', 'WARN_LNGSTD_WEAPON_UNPARSED', 'a stat appears twice: left'); continue; }
      for (const s of w.stats) {
        const lab = M.label[s.id];
        if (lab && (t.label[s.id][lab] > (t.label[s.id][s.base] || 0))) s.base = lab;
        if (s.sep.trim() === M.sep.trim() || /^ *- +$/.test(s.sep)) s.sep = M.sep;
        if (s.lead !== M.lead && /^ *$/.test(s.lead)) s.lead = M.lead;
        if (s.uid && !s.uid.startsWith('other:')) {
          let u = M.unit[s.id + '|' + s.uid];
          if (u && s.uid === 'shell') u = s.value === '1' ? u.replace(/s$/, '') : (u.endsWith('s') ? u : u + 's');
          if (u) s.unit = u;
          if (M.usp[s.id] !== undefined) s.usp = M.usp[s.id];
        }
      }
      // order: insertion sort by majority precedence (strict only)
      const st = w.stats.slice();
      for (let i = 1; i < st.length; i++) for (let j = i; j > 0 && before(st[j].id, st[j - 1].id) > 0; j--) [st[j - 1], st[j]] = [st[j], st[j - 1]];
      if (st.some((s, i) => s !== w.stats[i])) {
        const reset = w.headTags.match(/<c\([0-9a-fA-F]+\)>/), last = w.stats[w.stats.length - 1];
        const conform = reset && w.stats.every((s, i) => s.ttag === (s.vtag && i < w.stats.length - 1 ? reset[0] : (i === w.stats.length - 1 ? last.ttag : '')));
        if (!conform) leftAdd(e.part.rel, e.li + 1, e.key, 'weapon', 'WARN_LNGSTD_WEAPON_ORDER', `stat order ${ids.join('>')} differs from the majority but the colour reset pattern is irregular: order left`);
        else {
          const endTag = last.ttag;
          st.forEach((s, i) => { s.ttag = i === st.length - 1 ? endTag : (s.vtag ? reset[0] : ''); });
          w.stats = st;
        }
      }
      change(e, 'weapon', 'text', weaponText(w));
    }
  }

  // year
  let yearForm = null;
  if (only.has('year')) {
    const YR = /_(19)?(39|4[0-5])(?=[_(]|$)/g;
    const HASY = /\b19(39|4[0-5])\b|'(39|4[0-5])\b/;
    const inArea = rel => /^desc\/mod\/(squad|vehicle_group)\//i.test(rel) || (/^desc\/mod\/hero\/[^/]+\.inc$/i.test(rel) && !/_entity\.inc$/i.test(rel));
    // measured form over desc/mod texts of squads and entities
    const forms = {};
    for (const e of leaves) {
      if (!/^desc\/(squad|entity)\//.test(e.lkey)) continue;
      const v = plain(e.text).trim();
      if (/ 19(39|4[0-5])$/.test(v)) inc(forms, 'suffix " 1944"'); else if (/\(19(39|4[0-5])\)$/.test(v)) inc(forms, 'suffix " (1944)"');
      else if (/'(39|4[0-5])$/.test(v)) inc(forms, 'suffix " \'44"'); else if (/\b19(39|4[0-5])\b/.test(v)) inc(forms, 'year inside the name');
    }
    const fm = majority(Object.fromEntries(Object.entries(forms).filter(([k]) => k.startsWith('suffix'))));
    yearForm = { counts: forms, chosen: fm || 'suffix " 1944"', measured: !!fm };
    const fmt = y => yearForm.chosen === 'suffix " (1944)"' ? ` (${y})` : yearForm.chosen === 'suffix " \'44"' ? ` '${y.slice(2)}` : ' ' + y;
    const groups = new Map();
    const squadKeys = km.all.filter(k => !k.group && /^desc\/squad\//i.test(k.key));
    const modByKey = new Map(leaves.map(e => [e.lkey, e]));
    for (const k of squadKeys) {
      const name = k.key.slice('desc/squad/'.length).toLowerCase();
      const ms = [...name.matchAll(YR)];
      if (ms.length !== 1) continue;
      const base = name.slice(0, ms[0].index) + name.slice(ms[0].index + ms[0][0].length);
      const year = ms[0][1] ? ms[0][1] + ms[0][2] : '19' + ms[0][2];
      if (!groups.has(base)) groups.set(base, []);
      groups.get(base).push({ k, year, e: modByKey.get(k.key.toLowerCase()) });
    }
    for (const [base, g] of groups) {
      if (new Set(g.map(x => x.year)).size < 2) continue;
      const mods = g.filter(x => x.e && inArea(x.e.part.rel));
      if (!mods.length) continue;
      for (const x of mods) {
        const p = x.e.part, li = x.e.li;
        if (!(li > 0 && TOE.test(p.lines[li - 1])) && !p.inserts.has(li)) p.inserts.set(li, TOE_LINE);
      }
      const texts = new Set(g.map(x => x.e ? x.e.text : x.k.txt));
      if (texts.size !== 1) continue;
      const vanilla = g.filter(x => !x.e || !inArea(x.e.part.rel));
      if (vanilla.length) { for (const x of mods) leftAdd(x.e.part.rel, x.e.li + 1, x.e.key, 'year', 'WARN_LNGSTD_YEAR_VANILLA', `year group "${base}" has members outside the mod squad parts (${vanilla.map(v => v.k.key).join(', ')}): text left`); continue; }
      const txt = [...texts][0];
      if (HASY.test(plain(txt))) { for (const x of mods) leftAdd(x.e.part.rel, x.e.li + 1, x.e.key, 'year', 'WARN_LNGSTD_YEAR_HAS_YEAR', 'text already carries a year: left'); continue; }
      for (const x of mods) {
        const m = /^(.*?)((?:<[^<>]*>)*)$/.exec(x.e.text);
        change(x.e, 'year', 'text', m[1].replace(/ +$/, '') + fmt(x.year) + m[2]);
      }
    }
  }

  // guards (LOC-28, LOC-07/08): revert text edits that change % specs or break tags
  for (const e of leaves) {
    if (e.text === e.text0) continue;
    let why = null;
    if (specs(e.text) !== specs(e.text0)) why = ['LNGSTD_PARAM_GUARD', '%-spec sequence would change (LOC-28)'];
    else if (tagsOk(e.text0) && !tagsOk(e.text)) why = ['LNGSTD_TAG_GUARD', 'edit would leave an unclosed tag (LOC-07, LOC-08)'];
    if (!why) continue;
    leftAdd(e.part.rel, e.li + 1, e.key, 'guard', why[0], why[1] + ': text edits reverted');
    for (let i = changes.length - 1; i >= 0; i--) if (changes[i].e === e && changes[i].field === 'text') changes.splice(i, 1);
    e.text = e.text0;
  }

  // spelling candidates (on the edited texts)
  let spelling = null;
  if (only.has('space') && opts.spelling !== false) spelling = spell(km, leaves);

  // rebuild parts
  const outFiles = new Map();
  for (const p of parts) {
    for (const e of p.entries) {
      if (e.leaf) p.lines[e.li] = e.pre + e.name + e.mid + e.text + e.post;
      else p.lines[e.li] = e.pre + e.name + e.post;
    }
    const changed = p.lines.some((l, i) => l !== p.orig[i]) || p.inserts.size;
    if (!changed) continue;
    const out = [], lineMap = [];
    p.lines.forEach((l, i) => {
      if (p.inserts.has(i)) out.push(p.inserts.get(i) + '\r');
      lineMap[i] = out.length + 1;
      out.push(l + (p.cr[i] ? '\r' : ''));
    });
    p.lineMap = lineMap;
    outFiles.set(p.rel, Buffer.from(out.join('\n'), 'utf8'));
  }
  const toeAdded = parts.reduce((n, p) => n + p.inserts.size, 0);
  for (const p of parts) for (const [li] of p.inserts) changes.push({ e: { part: p, li, key: (p.entries.find(x => x.li === li) || {}).key || '' }, pass: 'year', field: 'comment', before: '', after: TOE_LINE });
  for (const c of changes) rep.info(c.e.part.rel, c.e.li + 1, 'LNGSTD_EDIT', `${c.pass} ${c.e.key}: ${JSON.stringify(c.before)} -> ${JSON.stringify(c.after)}`);
  return { rep, changes, left, tables, yearForm, spelling, outFiles, rels, toeAdded, parts };
}

function spell(km, leaves) {
  const freq = new Map(), rows = [];
  const words = t => plain(t).match(/[A-Za-zÀ-ɏ]+/g) || [];
  const texts = km.all.filter(k => !k.group).map(k => k.txt);
  const modLower = new Set(leaves.map(e => e.lkey));
  // vanilla + parents use the read text; mod leaves the edited one
  const all = km.all.filter(k => !k.group && !modLower.has(k.key.toLowerCase())).map(k => k.txt).concat(leaves.map(e => e.text));
  for (const t of all) for (const w of words(t)) { const l = w.toLowerCase(); freq.set(l, (freq.get(l) || 0) + 1); }
  const unitN = new Map();
  for (const t of all) for (const m of plain(t).matchAll(/\b(\d+)mm\b/g)) unitN.set(m[1], (unitN.get(m[1]) || 0) + 1);
  const common = [...freq].filter(([, n]) => n >= 4).map(([w]) => w);
  const byLen = new Map(); for (const w of common) { if (!byLen.has(w.length)) byLen.set(w.length, []); byLen.get(w.length).push(w); }
  const cache = new Map();
  const near = l => {
    if (cache.has(l)) return cache.get(l);
    const f = freq.get(l) || 0, max = l.length >= 8 ? 2 : 1;
    let best = null;
    for (let d = -max; d <= max; d++) for (const v of byLen.get(l.length + d) || []) {
      if (v === l || v[0] !== l[0]) continue;
      const [sh, lo] = v.length < l.length ? [v, l] : [l, v];   // inflection, not a typo: range/ranged, close/closer, speed/speedy
      if (lo.length === sh.length + 1 && lo.startsWith(sh) && 'drysnl'.includes(lo[lo.length - 1])) continue;
      if ((v.startsWith(l) || l.startsWith(v)) && Math.abs(v.length - l.length) >= 2) continue;
      const fv = freq.get(v);
      if (fv < Math.max(4, 3 * f)) continue;
      if (v === l + 's' || l === v + 's' || v === l + 'es' || l === v + 'es' || v === l + 'ed' || l === v + 'ed') continue;
      if (l.replace(/[À-ɏ]/g, '') !== l || v.replace(/[À-ɏ]/g, '') !== v) { if (l.normalize('NFD').replace(/[̀-ͯ]/g, '') === v.normalize('NFD').replace(/[̀-ͯ]/g, '')) continue; }
      const dist = lev(l, v, max);
      if (dist <= max && (!best || fv > best.fv)) best = { v, fv, dist };
    }
    cache.set(l, best); return best;
  };
  for (const e of leaves) {
    const p = plain(e.text), seen = new Set();
    for (const w of words(e.text)) {
      const l = w.toLowerCase();
      if (l.length < 5 || w === w.toUpperCase() || seen.has(l) || (freq.get(l) || 0) > 2) continue;
      seen.add(l);
      const b = near(l);
      if (b) rows.push({ e, word: w, score: b.dist * 1e6 - b.fv, sugg: w[0] === w[0].toUpperCase() ? b.v[0].toUpperCase() + b.v.slice(1) : b.v, why: `edit distance ${b.dist} from "${b.v}" (${b.fv}x, this ${freq.get(l)}x)` });
    }
    for (const m of p.matchAll(/\b([A-Za-z]{2,})\s+\1\b/gi)) rows.push({ e, word: m[0], score: 0, sugg: m[1], why: 'repeated word' });
    for (const m of p.matchAll(/\b(\d+)m\b/g)) { const n = unitN.get(m[1]) || 0; if (n >= 3) rows.push({ e, word: m[0], score: 0, sugg: m[1] + 'mm', why: `"${m[1]}mm" appears ${n}x in the folder` }); }
  }
  return rows.sort((a, b) => a.score - b.score);
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const a = path.join(src, e.name), b = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
}
const tsv = v => String(v == null ? '' : v).replace(/[\t\r\n]/g, ' ');

function printTables(r) {
  const out = [];
  const fmt = o => Object.entries(o || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
  if (r.tables.soldier) {
    const c = r.tables.soldier, m = r.tables.soldierMajority;
    out.push('soldier names (desc/human, mod parts): prefix ' + fmt(c.prefix) + ' | colour ' + fmt(c.colour) + ' | hex ' + fmt(c.hexcase) + ' | space after tag ' + fmt(c.space) + ' | first letter ' + fmt(c.first) + ' | words ' + fmt(c.words));
    out.push(`  majority: ${m.prefix === 'present' ? `<c(${m.colour})>` : 'no tag'}${JSON.stringify(m.space)}, first letter ${m.first}`);
  }
  if (r.tables.weapon) {
    const t = r.tables.weapon, M = r.tables.weaponMajority;
    out.push('weapon stat blocks (desc/weapon, mod parts): head tag ' + fmt(t.head) + ' | separator ' + fmt(t.sep) + ' | lead ' + fmt(t.lead));
    for (const [id, o] of Object.entries(t.label)) {
      const units = Object.entries(t.unit).filter(([k]) => k.startsWith(id + '|')).map(([k, o2]) => k.split('|')[1] + ': ' + fmt(o2)).join('; ');
      out.push(`  ${id}: label ${fmt(o)} -> "${M.label[id]}" | unit ${units || '-'} | number-unit space ${fmt(t.usp[id])} | value colour ${fmt(t.colour[id])}`);
    }
    const ids = Object.keys(t.label);
    const rank = ids.map(a => [a, ids.reduce((n, b) => n + (t.prec[a + '<' + b] || 0) - (t.prec[b + '<' + a] || 0), 0)]).sort((a, b) => b[1] - a[1]);
    out.push('  order (precedence score): ' + rank.map(([a, n]) => `${a}(${n})`).join(' > '));
  }
  if (r.yearForm) out.push(`year form: existing names ${fmt(r.yearForm.counts) || 'none'} -> ${r.yearForm.chosen}${r.yearForm.measured ? ' (measured majority)' : ' (default, no existing suffix form)'}`);
  const per = {}; for (const c of r.changes) per[c.pass] = (per[c.pass] || 0) + 1;
  out.push('changes: ' + (PASSES.map(p => `${p} ${per[p] || 0}`).join(', ')) + ` (year incl. ${r.toeAdded} '; ToE:' lines)`);
  return out.join('\n');
}

if (require.main === module) {
  const a = process.argv.slice(2), o = { pos: [] };
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    if (x === '--out') o.out = a[++i]; else if (x === '--loc') o.loc = a[++i]; else if (x === '--only') o.only = a[++i].split(',').filter(Boolean);
    else if (x === '--report') o.report = a[++i]; else if (x === '--spelling') o.spellingFile = a[++i]; else if (x === '-q') o.q = true;
    else if (x === '-h' || x === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 8).join('\n')); process.exit(0); }
    else o.pos.push(x);
  }
  const usage = 'usage: node tools/lngstd/lngstd.js <modDir> --out <folder> [--loc <textFolder>] [--only glyph,case,space,soldier,weapon,year] [--report f.tsv] [--spelling f.tsv] [-q]';
  if (!o.pos[0] || !o.out) { console.error(usage); process.exit(2); }
  if (o.only && o.only.some(p => !PASSES.includes(p))) { console.error('--only: passes are ' + PASSES.join(',')); process.exit(2); }
  const modDir = path.resolve(o.pos[0]), locDir = locate(modDir, o.loc), out = path.resolve(o.out);
  if (!locDir || !fs.existsSync(locDir)) { console.error('no localization folder under ' + modDir); process.exit(2); }
  const inside = (p, d) => { const r = path.relative(d, p); return !r || (!r.startsWith('..') && !path.isAbsolute(r)); };
  if (inside(out, locDir) || inside(locDir, out) || inside(out, modDir)) { console.error('--out must be outside the mod and the localization folder'); process.exit(2); }
  const t0 = Date.now();
  const r = run({ locDir, only: o.only });
  copyDir(locDir, out);
  for (const [rel, buf] of r.outFiles) fs.writeFileSync(path.join(out, rel), buf);
  if (o.report) {
    const rows = ['file\tline\tkey\tpass\tbefore\tafter'];
    for (const c of r.changes) rows.push([c.e.part.rel, c.e.part.lineMap ? c.e.part.lineMap[c.e.li] - (c.field === 'comment' ? 1 : 0) : c.e.li + 1, c.e.key, c.field === 'name' ? 'case' : c.pass, c.before, c.after].map(tsv).join('\t'));
    for (const l of r.left) rows.push([l.rel, l.line, l.key, 'left:' + l.pass, '', l.msg].map(tsv).join('\t'));
    fs.writeFileSync(o.report, rows.join('\r\n') + '\r\n');
  }
  if (o.spellingFile && r.spelling) fs.writeFileSync(o.spellingFile, ['file\tline\tkey\tword\tsuggestion\twhy'].concat(r.spelling.map(s => [s.e.part.rel, s.e.li + 1, s.e.key, s.word, s.sugg, s.why].map(tsv).join('\t'))).join('\r\n') + '\r\n');
  console.log(printTables(r));
  if (r.spelling) console.log(`spelling candidates: ${r.spelling.length}${o.spellingFile ? ' -> ' + o.spellingFile : ''}`);
  console.log(`${r.outFiles.size} part files changed -> ${out} (${Date.now() - t0} ms)`);
  r.rep.print({ showInfo: !o.q, byCode: true });
}
module.exports = { run, glyph, space, parseWeapon, weaponText, lev };
