// macrostd step vet: names the veterancy score tables of the soldier breeds for what they are and explains them in comments.
//   Renames the table defines veterancy_<kind> -> vet_<word> (MAP below) where they live: the shared file the sides include
//   (resource/set/breed/mp/robz_vet.inc in RobZ) and the side-only tables in a side's veterancy_generic.inc. Rewrites the
//   breed_vet define (parameter kind -> table, body ("veterancy_%kind") -> ("vet_%table")) and every breed call
//   ("breed_vet" kind(<kind>)) -> ("breed_vet" table(<word>)). Writes the explanation comments: a top header in the shared file
//   (ranks, score, -1/0 start, the (mod "mp") set, every table with its numbers and uses, the rank effects copied from
//   set/ability/veterancy.set), one header per define (who uses it, how it derives from its base table, checked against the
//   numbers), a 2-line header in each veterancy_generic.inc and the list of valid table words above breed_vet.
//   PORT-55/61: an old name that a LIVE vanilla file (one the mod does not replace) calls stays callable as a one-line alias
//   (define "veterancy_1" ("vet_standard")) right after its table; old names nothing calls are gone. Nested calls expand the
//   body in place, verify proves the vanilla breeds expand the same.
//   Report-only rows of kind `outline` (never applied): breeds with a literal {veterancy} block, table numbers that break their
//   base table (rank, expected, actual), tables whose (mod "mp") numbers differ from the outer ones, and per side the breeds whose
//   table looks wrong for their name [I] (crew names off the crew tables, elite names on vet_standard).
//   Idempotent: the output is regenerated from either name form, a second plan writes no file (outline rows stay).
//   Rows SDL-17 SDL-18 SDL-19 SDL-21 SDL-56 GPL-11 PORT-55 PORT-61 TST-108.
// Author: Imperator_Aug (ARSENAL, ia-b2cc612c)
const { scan } = require('../scan');

// old kind (after "veterancy_") -> new word (after "vet_"); order = listing order
const MAP = [
  ['1', 'standard'], ['1_lvl2', 'standard_start2'], ['1_lvl3', 'standard_start3'],
  ['elite', 'elite'], ['lvl2', 'elite_start2'], ['lvl5', 'start5'],
  ['tankcrew', 'crew'], ['tankcrew_lvl3', 'crew_start3'],
  ['lvl1', 'ss_start1'], ['lvl3', 'ss_start3'], ['1_old', 'standard_old'],
];
const K2W = new Map(MAP), W2K = new Map(MAP.map(([k, w]) => [w, k])), ORDER = MAP.map(x => x[1]);
const BASES = ['standard', 'elite', 'crew'];
const baseOf = w => { const m = /^(standard|elite|crew)_start\d$/.exec(w); return m ? m[1] : null; };
const GEN = 'veterancy_generic.inc';
const CALL_RE = /^(\t*)\("breed_vet" (kind|table)\(([a-z0-9_]+)\)\)(.*)$/;

// numbers of one table body: { outer:[5], mp:[5]|null }
function nums(body) {
  const b = body.replace(/"[^"\r\n]*"|;[^\r\n]*/g, x => x[0] === '"' ? x : '');
  const m = /\(mod\s+"mp"([\s\S]*)\)/.exec(b);
  const get = t => { const a = [null, null, null, null, null]; const re = /\{"lvl_([1-5])"\s+(-?\d+(?:\.\d+)?)/g; let x; while ((x = re.exec(t))) a[+x[1] - 1] = +x[2]; return a; };
  return { outer: get(m ? b.slice(0, m.index) + b.slice(m.index + m[0].length) : b), mp: m ? get(m[1]) : null };
}
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const fmt = a => a.map(v => v === null ? '?' : String(v)).join('/');
const startRank = a => { const i = a.indexOf(0); return i >= 0 && a.slice(0, i).every(v => v === -1) ? i + 1 : 0; };
// expected numbers of base table b with the soldier starting at rank r
const shifted = (b, r) => b.map((v, i) => i < r - 1 ? -1 : v - b[r - 1]);

// derivation of one table: { text, breaks:[{rank, want, got}], base }
function derive(w, t, tabs) {
  const r = startRank(t.outer), b = baseOf(w) || (/^ss_/.test(w) ? 'elite' : null);
  if (BASES.includes(w)) return { text: 'base table', breaks: [] };
  if (w === 'standard_old') { const s = tabs.get('standard'); return { text: 'older numbers' + (s && t.mp && same(t.mp, s.outer) ? '; its (mod "mp") set equals vet_standard' : ''), breaks: [] }; }
  if (w === 'start5' || (r === 5 && !b)) return { text: 'every rank reached at once: the soldier starts at rank 5 (the same for any base table)', breaks: [] };
  const B = b && tabs.get(b);
  if (!B || !r) return { text: 'no base table found', breaks: [] };
  const want = shifted(B.outer, r), breaks = [];
  for (let i = r; i < 5; i++) if (want[i] !== t.outer[i]) breaks.push({ rank: i + 1, want: want[i], got: t.outer[i] });
  const minus = B.outer[r - 1];
  if (!breaks.length) return { text: `vet_${b}, soldier starts at rank ${r}; numbers = vet_${b} minus ${minus}`, breaks, base: b };
  const other = BASES.filter(x => x !== b && tabs.get(x) && same(shifted(tabs.get(x).outer, r), t.outer));
  const what = /^ss_/.test(w) ? `soldier starts at rank ${r}; ` + (other.length ? `numbers = vet_${other[0]} minus ${tabs.get(other[0]).outer[r - 1]}` : 'matches no base table')
    : `vet_${b}, soldier starts at rank ${r}` + (other.length ? `; numbers = vet_${other[0]} minus ${tabs.get(other[0]).outer[r - 1]}, not vet_${b}` : '');
  return { text: `${what}; vet_${b} minus ${minus} would be ${fmt(want.slice(r - 1))} from rank ${r}, this has ${fmt(t.outer.slice(r - 1))}`, breaks, base: b };
}

// rank effects of set/ability/veterancy.set -> comment lines
const SHORT = { health: 'health', health_regeneration: 'hp_regen', stamina: 'stamina', stamina_regeneration: 'st_regen', tank: 'tank', vehicle: 'vehicle', cannon: 'cannon', weapon_reload: 'reload', weapon_skill: 'w_skill', medic: 'medic' };
function effects(text) {
  if (!text) return [';   (set/ability/veterancy.set not found)'];
  const s = text.replace(/;[^\r\n]*/g, ''), ranks = [], cols = [];
  const re = /\{"(lvl_[1-5])"\s+from\s+veterancy([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  let m;
  while ((m = re.exec(s))) {
    const v = new Map(), e = /\{"([a-z_]+)"\s+(-?[\d.]+)\s*\}/g;
    let x;
    while ((x = e.exec(m[2]))) { v.set(x[1], x[2]); if (!cols.includes(x[1])) cols.push(x[1]); }
    ranks.push([m[1], v]);
  }
  if (!ranks.length) return [';   (no {"lvl_N" from veterancy} blocks found in set/ability/veterancy.set)'];
  const head = ['rank', ...cols.map(c => SHORT[c] || c)];
  const rows = ranks.map(([r, v]) => [r, ...cols.map(c => v.has(c) ? v.get(c) : '-')]);
  const wd = head.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
  const line = r => ';   ' + r.map((x, i) => i ? x.padStart(wd[i]) : x.padEnd(wd[i])).join('  ');
  return [line(head), ...rows.map(line)];
}

module.exports = {
  id: 'vet',
  title: 'veterancy tables: vet_ names, breed_vet table(word), explanation comments',
  MAP, nums, derive, effects,
  plan(ctx) {
    const m = ctx.model, changes = [], cases = [];
    const textOf = rel => ctx.read(rel).toString('latin1');
    // ---- breeds and their calls
    const breedKeys = [...m.files.keys()].filter(k => /^resource\/set\/breed\/.+\.set$/.test(k) && m.files.get(k).scope).sort();
    const uses = new Map(), usesSide = new Map(), unknown = new Map(), breeds = [];
    for (const k of breedKeys) {
      const F = m.files.get(k), s = textOf(F.rel);
      if (s !== F.s) throw new Error(`vet: ${F.rel} changed since the model was built`);
      const side = (/^resource\/set\/breed\/mp\/([^/]+)\//.exec(k) || [])[1] || '';
      const eol = s.includes('\r\n') ? '\r\n' : '\n', lines = s.split(eol);
      const b = { F, s, eol, lines, side, calls: [], literal: [] };
      lines.forEach((l, i) => {
        const c = CALL_RE.exec(l);
        if (c) {
          const w = c[2] === 'kind' ? K2W.get(c[3]) : (W2K.has(c[3]) ? c[3] : undefined);
          if (!w) { const n = c[2] + '(' + c[3] + ')'; if (!unknown.has(n)) unknown.set(n, []); unknown.get(n).push(F.rel); return; }
          b.calls.push({ i, c, w });
          uses.set(w, (uses.get(w) || 0) + 1);
          const us = usesSide.get(w) || new Map(); us.set(side, (us.get(side) || 0) + 1); usesSide.set(w, us);
        } else if (/^\t+\{veterancy\s*(;.*)?$/.test(l)) b.literal.push(i);
      });
      breeds.push(b);
    }
    if (unknown.size) return { changes: [], cases: [...unknown].map(([n, f]) => ({ id: 'vet-unknown-kind', title: `breed_vet ${n} has no new name: step not applied`, detail: f.slice(0, 8).join(', ') })) };

    // ---- table files: every mod file defining a table (old or new name) or named veterancy_generic.inc under set/breed
    const tabFiles = [];
    for (const [k, F] of m.files) {
      if (!F.scope || !/^resource\/set\/breed\//.test(k)) continue;
      const isGen = k.endsWith('/' + GEN);
      const sc = scan(F.s);
      const defs = sc.defines.filter(d => { const o = /^veterancy_(.+)$/.exec(d.name), n = /^vet_(.+)$/.exec(d.name); return (o && K2W.has(o[1])) || (n && W2K.has(n[1])); });
      if (isGen || defs.length) tabFiles.push({ k, F, sc, isGen });
    }
    tabFiles.sort((a, b) => a.k < b.k ? -1 : 1);
    const tabs = new Map(), where = new Map(), isAlias = d => /^\s*\("vet_[a-z0-9_]+"\)\s*$/.test(d.body);
    for (const T of tabFiles) {
      T.side = T.isGen ? T.k.split('/').slice(-2)[0] : null;
      for (const d of T.sc.defines) {
        d.body = T.F.s.slice(d.bodySpan[0], d.bodySpan[1]);
        const o = /^veterancy_(.+)$/.exec(d.name), n = /^vet_(.+)$/.exec(d.name);
        if (o && isAlias(d)) { d.alias = true; continue; }
        const w = o ? K2W.get(o[1]) : n && W2K.has(n[1]) ? n[1] : null;
        if (!w) { if (o) cases.push({ id: 'vet-unknown-table', title: `${d.name} in ${T.F.rel} kept (not in the name map)`, detail: 'no breed calls it through breed_vet; dynamic vet_%table cannot reach it' }); continue; }
        d.w = w;
        const t = nums(d.body);
        if (!tabs.has(w)) tabs.set(w, t);
        else if (!same(tabs.get(w).outer, t.outer)) cases.push({ id: 'vet-table-differs', title: `vet_${w}: ${T.F.rel} has other numbers than the first definition`, detail: fmt(tabs.get(w).outer) + ' vs ' + fmt(t.outer) });
        if (!where.has(w)) where.set(w, []);
        where.get(w).push(T);
      }
    }
    // ---- names a LIVE vanilla file calls (PORT-55/61) or a mod file outside the table files and breed_vet calls literally
    const keep = new Set();
    for (const [k, f] of m.vanilla.files) {
      if (m.files.has(k)) continue;
      for (const c of f.c || []) { const n = typeof c === 'string' ? c : c && c.name; const o = n && /^veterancy_(.+)$/.exec(n); if (o && K2W.has(o[1])) keep.add(o[1]); }
    }
    for (const [n, e] of m.byName) {
      const o = /^veterancy_(.+)$/.exec(n);
      if (o && K2W.has(o[1]) && e.calls.some(c => !tabFiles.some(T => T.k === c.key) && !c.dynamic)) keep.add(o[1]);
    }
    const sideOnly = w => (where.get(w) || []).every(T => T.isGen);
    const sidesOf = w => [...new Set((where.get(w) || []).map(T => T.side))].join(', ');
    const sideList = w => [...(usesSide.get(w) || new Map())].map(([s, n]) => `${s} ${n}`).join(', ');

    // ---- per-table derivation + outline rows on the define
    const der = new Map(), defRows = new Map();   // file key -> rows
    const addRow = (k, r) => { if (!defRows.has(k)) defRows.set(k, []); defRows.get(k).push(r); };
    const caseLines = { breaks: [], mpdiff: [], nomp: [] };
    for (const w of ORDER) {
      const t = tabs.get(w);
      if (!t) continue;
      const d = derive(w, t, tabs);
      der.set(w, d);
      const T = where.get(w)[0], def = T.sc.defines.find(x => x.w === w);
      for (const b of d.breaks) {
        addRow(T.k, { line: def.line, kind: 'outline', before: `vet_${w} lvl_${b.rank}: expected ${b.want} (vet_${d.base} minus ${tabs.get(d.base).outer[startRank(t.outer) - 1]})`, after: String(b.got), note: 'number breaks its base table (not changed)' });
      }
      if (d.breaks.length) caseLines.breaks.push(`vet_${w}: ` + d.breaks.map(b => `lvl_${b.rank} ${b.got} (expected ${b.want})`).join(', '));
      if (t.mp && !same(t.mp, t.outer)) {
        addRow(T.k, { line: def.line, kind: 'outline', before: `vet_${w} outer ${fmt(t.outer)}`, after: `mod "mp" ${fmt(t.mp)}`, note: '(mod "mp") numbers differ from the outer ones (not changed)' });
        caseLines.mpdiff.push(`vet_${w}: outer ${fmt(t.outer)}, mod "mp" ${fmt(t.mp)}`);
      }
      if (!t.mp && (uses.get(w) || 0)) caseLines.nomp.push(`vet_${w}`);
    }
    if (caseLines.breaks.length) cases.push({ id: 'vet-pattern-break', title: `${caseLines.breaks.length} tables do not follow their base table`, detail: caseLines.breaks.join('; ') });
    if (caseLines.mpdiff.length) cases.push({ id: 'vet-mp-differs', title: 'tables whose (mod "mp") numbers differ from the outer ones', detail: caseLines.mpdiff.join('; ') + ' [I] how two numbers for one rank combine in multiplayer is not verified' });
    if (caseLines.nomp.length) cases.push({ id: 'vet-mp-missing', title: `${caseLines.nomp.length} used tables have no (mod "mp") set`, detail: caseLines.nomp.join(', ') + ': same numbers in every game; the base tables repeat theirs inside (mod "mp")' });
    for (const w of ORDER) if (tabs.has(w) && !(uses.get(w) || 0) && !keep.has(W2K.get(w))) cases.push({ id: 'vet-unused', title: `vet_${w} (was veterancy_${W2K.get(w)}) is called by no breed`, detail: `defined in ${(where.get(w) || []).map(T => T.F.rel).join(', ')}; kept (renamed): remove it?` });

    // ---- effects text
    const eff = ctx.exists('resource/set/ability/veterancy.set') ? textOf('resource/set/ability/veterancy.set') : (ctx.vanilla.read('resource/set/ability/veterancy.set') || '').toString('latin1') || null;

    // ---- header texts
    const usesTxt = w => { const n = uses.get(w) || 0; return n ? `${n} breed${n > 1 ? 's' : ''}` : 'unused'; };
    const sharedFile = tabFiles.find(T => !T.isGen && T.sc.defines.some(d => d.w));
    const sharedRel = sharedFile ? '/' + sharedFile.F.rel.replace(/^resource\//, '') : null;
    function topHeader(T) {
      const name = T.F.rel.split('/').pop();
      const L = [
        `; ${name}: veterancy score tables of the soldier breeds, one define per table, shared by all sides`,
        `;   Each side's ${GEN} includes this file. A breed picks its table with`,
        ';   ("breed_vet" table(<word>)) from set/breed/breed_macros.inc, which expands to',
        `;   {veterancy (include "${GEN}") ("vet_<word>")}.`,
        ';',
        '; How veterancy works (modweb/humans/veterancy.md):',
        ';   A soldier has 5 ranks, lvl_1 .. lvl_5. A table gives the score each rank needs.',
        ';   A rank is active when the soldier\'s score >= its number. Only the highest rank reached',
        ';   applies; the ranks do not add up.',
        ';   The score rises with kills (the amount per kill comes from the unit card score) and with',
        ';   healing as a medic (+0.5 per patient) [I].',
        ';   -1 = always reached, 0 = reached at once (the score starts at 0). A table that starts with',
        ';   -1 .. 0 makes the soldier START at the rank that holds the 0; its later numbers are then the',
        ';   base table minus what that rank needed (each table below says where this holds).',
        ';   Numbers outside (mod "mp" ...) are read in every game. Numbers inside (mod "mp" ...) are',
        ';   read in addition when a multiplayer mission loads (the engine sets the SDL mod "mp").',
        ';   Where both sets are equal this changes nothing; how two different numbers for one rank',
        ';   combine is not verified [I].',
        ';',
        '; Tables: score for lvl_1..lvl_5, (mod "mp") set, breeds using it',
      ];
      const wn = Math.max(...ORDER.filter(w => tabs.has(w)).map(w => w.length)) + 4;
      for (const w of ORDER) {
        const t = tabs.get(w);
        if (!t) continue;
        const mp = !t.mp ? 'no mp set' : same(t.mp, t.outer) ? 'mp same ' : 'mp ' + fmt(t.mp);
        const so = sideOnly(w) ? ` (${sidesOf(w)} only)` : '';
        L.push(';   ' + ('vet_' + w).padEnd(wn) + t.outer.map(v => String(v === null ? '?' : v).padStart(5)).join('') + '   ' + mp + '   ' + usesTxt(w) + so);
      }
      for (const k of [...keep].sort()) L.push(`;   veterancy_${k} = vet_${K2W.get(k)}, kept for vanilla breeds the mod does not replace`);
      L.push(';',
        '; Rank effects: set/ability/veterancy.set (change them there). Fractions added to the base',
        ';   (0.10 = +10%); reload = share of the reload time saved; w_skill = levels added to every',
        ';   weapon skill. hp_regen = health_regeneration, st_regen = stamina_regeneration.',
        ...effects(eff));
      return L;
    }
    function defHeader(w, T) {
      const d = der.get(w), t = tabs.get(w), n = uses.get(w) || 0;
      const who = n ? `score table of ${n} breed${n > 1 ? 's' : ''}` : 'score table no breed uses';
      const L = [`; vet_${w}: ${who}`];
      if (n) L.push(`;   breeds per side: ${sideList(w)}`);
      L.push(...d.text.split('; ').map(x => `;   ${x}`));
      L.push(';   ' + (t.mp ? (same(t.mp, t.outer) ? '(mod "mp") set: the same numbers' : `(mod "mp") set: ${fmt(t.mp)}, differs from the outer ${fmt(t.outer)}`) : 'no (mod "mp") set: the same numbers in every game'));
      L.push(`;   e.g. ("vet_${w}")   from a breed: ("breed_vet" table(${w}))`);
      return L;
    }
    const aliasLines = k => [`; veterancy_${k}: old name of vet_${K2W.get(k)}, kept for vanilla breeds the mod does not replace (they call it)`,
      `;   e.g. ("veterancy_${k}")`, `(define "veterancy_${k}" ("vet_${K2W.get(k)}"))`];
    function genHeader(T, ownTabs) {
      return [`; ${GEN} (${T.side}): includes ${sharedRel || 'the shared tables'} (shared tables)` + (ownTabs.length ? `, plus ${ownTabs.length} own table${ownTabs.length > 1 ? 's' : ''} below` : ' and nothing else') + '.',
        `;   Keep it under this name: breed_vet${hasVanilla(T) ? ' and this folder\'s vanilla breeds' : ''} include it from the breed's folder.`];
    }
    const hasVanilla = T => { const dir = T.k.slice(0, T.k.lastIndexOf('/') + 1); for (const [k] of m.vanilla.files) if (k.startsWith(dir) && k.endsWith('.set') && !m.files.has(k)) return true; return false; };

    // ---- rewrite table files
    for (const T of tabFiles) {
      const s = textOf(T.F.rel);
      if (s !== T.F.s) throw new Error(`vet: ${T.F.rel} changed since the model was built`);
      const eol = s.includes('\r\n') ? '\r\n' : '\n', ls = T.sc.lineStarts;
      const rows = [];
      let out = s;
      const defs = T.sc.defines.filter(d => d.w || d.alias).sort((a, b) => b.span[0] - a.span[0]);
      for (const d of defs) {
        const hs = d.header.length && new RegExp('^;\\s*(veterancy_|vet_)[a-z0-9_]+:').test(d.header[0]) ? ls[d.line - 1 - d.header.length] : ls[d.line - 1];
        if (d.alias) {
          let a = hs; const pre = out.slice(0, a);
          if (pre.endsWith(eol + eol)) a -= eol.length;
          let e = d.span[1]; if (out.startsWith(eol, e)) e += eol.length;   // the alias was written as eol eol <alias>: drop one blank line with it
          out = out.slice(0, a) + out.slice(e);
          continue;
        }
        const k = W2K.get(d.w);
        let block = defHeader(d.w, T).join(eol) + eol + '(define "vet_' + d.w + '"' + out.slice(d.nameSpan[1] + 1, d.span[1]);
        if (keep.has(k)) block += eol + eol + aliasLines(k).join(eol);
        if (d.name !== 'vet_' + d.w) rows.push({ line: d.line, kind: 'rename', before: d.name, after: 'vet_' + d.w, note: keep.has(k) ? `alias ${d.name} kept: live vanilla files call it (PORT-55/61)` : '' });
        out = out.slice(0, hs) + block + out.slice(d.span[1]);
      }
      if (T.isGen) {
        const own = ORDER.filter(w => (where.get(w) || []).includes(T));
        const H = genHeader(T, own);
        const lines = out.split(eol);
        let n = 0;
        if (lines[0].startsWith('; ' + GEN)) while (n < lines.length && /^;/.test(lines[n])) n++;
        out = H.join(eol) + eol + lines.slice(n).join(eol);
      } else if (T.sc.defines.some(d => d.w)) {
        const name = T.F.rel.split('/').pop(), lines = out.split(eol);
        let n = 0;
        if (lines[0].startsWith('; ' + name + ':') || lines[0].startsWith('; robz shared macros (macrostd share)')) { while (n < lines.length && /^;/.test(lines[n])) n++; while (n < lines.length && lines[n] === '') n++; }
        out = topHeader(T).join(eol) + eol + eol + lines.slice(n).join(eol);
      }
      if (out !== s) { rows.unshift({ line: 1, kind: 'comment', before: '', after: 'veterancy explanation headers', note: '' }); }
      if (rows.length || defRows.has(T.k)) changes.push({ file: T.F.rel, after: out !== s ? Buffer.from(out, 'latin1') : null, create: false, rows: rows.concat(defRows.get(T.k) || []) });
    }

    // ---- breed_vet define
    const bv = m.byName.get('breed_vet');
    const bvDef = bv && bv.defs.find(d => m.files.get(d.key) && m.files.get(d.key).scope);
    if (bvDef) {
      const F = m.files.get(bvDef.key), s = textOf(F.rel), sc = scan(s), d = sc.defines.find(x => x.name === 'breed_vet');
      const eol = s.includes('\r\n') ? '\r\n' : '\n';
      const shared = ORDER.filter(w => tabs.has(w) && !sideOnly(w)), own = ORDER.filter(w => tabs.has(w) && sideOnly(w));
      const words = [];
      const wrap = (items, tail) => {   // ';     a, b, c' lines of <= 100 chars, tail after the last item
        let cur = '';
        items.forEach((x, i) => {
          const t = x + (i === items.length - 1 ? tail : ',');
          if (cur && (';     ' + cur + ' ' + t).length > 100) { words.push(';     ' + cur); cur = t; } else cur = cur ? cur + ' ' + t : t;
        });
        if (cur) words.push(';     ' + cur);
      };
      if (shared.length) wrap(shared.map(w => w + (uses.get(w) ? '' : ' (unused)')), ' (every side)');
      for (const w of own) wrap([w + (uses.get(w) ? '' : ' (unused)')], ` (${sidesOf(w)} only)`);
      const H = [
        '; breed_vet: the {veterancy} block of a breed. It includes veterancy_generic.inc from the CALLING breed\'s folder',
        `;   (each side has its own; it pulls in ${sharedRel || 'the shared tables'}) and calls the score table vet_<table>.`,
        ';   table - which score table, the word after "vet_":',
        ...words,
        `;     numbers, breeds per table and rank effects: top of ${sharedRel ? sharedRel.replace(/^\//, '') : 'the shared tables file'}`,
        ';   e.g. ("breed_vet" table(standard))',
      ];
      const block = H.join(eol) + eol + ['(define "breed_vet"', '\t{veterancy', '\t\t(include "veterancy_generic.inc")', '\t\t("vet_%table")', '\t}', ')'].join(eol);
      const hs = d.header.length && /^;\s*breed_vet:/.test(d.header[0]) ? sc.lineStarts[d.line - 1 - d.header.length] : sc.lineStarts[d.line - 1];
      const out = s.slice(0, hs) + block + s.slice(d.span[1]);
      if (out !== s) changes.push({ file: F.rel, after: Buffer.from(out, 'latin1'), create: false, rows: [{ line: d.line, kind: 'breed_vet', before: '("veterancy_%kind")', after: '("vet_%table")', note: 'parameter kind -> table' }] });
    } else if (breeds.some(b => b.calls.length)) return { changes: [], cases: [{ id: 'vet-no-breed-vet', title: 'breed_vet define not found in the mod: step not applied', detail: '' }] };

    // ---- breeds: calls + literal blocks
    const tier = new Map();   // side -> [rel, why]
    for (const b of breeds) {
      const rows = [];
      for (const { i, c, w } of b.calls) {
        const nl = c[1] + '("breed_vet" table(' + w + '))' + c[4];
        if (nl !== b.lines[i]) { rows.push({ line: i + 1, kind: 'vet_call', before: b.lines[i].trim(), after: nl.trim(), note: '' }); b.lines[i] = nl; }
      }
      for (const i of b.literal) {
        const vals = [];
        for (let j = i + 1; j < b.lines.length && !/^\t\}/.test(b.lines[j]); j++) { const x = /\{"(lvl_\d)"\s+(-?[\d.]+)/.exec(b.lines[j]); if (x) vals.push(x[2]); }
        rows.push({ line: i + 1, kind: 'outline', before: 'literal {veterancy} block ' + vals.join('/'), after: '', note: 'not breed_vet: matches no vet_ table (not changed)' });
      }
      const name = b.F.rel.split('/').pop().replace(/\.set$/, ''), w = b.calls.length ? b.calls[0].w : null;
      let why = null;
      if (w && /tank|crew/.test(name) && !/^crew/.test(w)) why = `crew name on vet_${w}`;
      else if (w && /elite/.test(name) && w === 'standard') why = 'elite name on vet_standard';
      if (why) { if (!tier.has(b.side)) tier.set(b.side, []); tier.get(b.side).push([b.F.rel, why]); }
      if (rows.length) changes.push({ file: b.F.rel, after: rows.some(r => r.kind === 'vet_call') ? Buffer.from(b.lines.join(b.eol), 'latin1') : null, create: false, rows });
    }
    for (const [side, list] of [...tier].sort()) {
      const T = tabFiles.find(x => x.isGen && x.side === side);
      const row = { line: 1, kind: 'outline', before: `${side}: ${list.length} breeds whose table looks wrong for their name [I]`, after: list.slice(0, 5).map(([r, y]) => r.split('/').pop() + ' (' + y + ')').join(', '), note: 'heuristic on the file name, not changed' };
      const c = T && changes.find(x => x.file === T.F.rel);
      if (c) c.rows.push(row); else changes.push({ file: T ? T.F.rel : list[0][0], after: null, create: false, rows: [row] });
    }
    // ---- commented-out tables (left as they are)
    for (const T of tabFiles) {
      const cm = [...T.F.s.matchAll(/^;\s*\(define "(veterancy_[a-z0-9_]+)"/gm)].map(x => x[1]);
      if (cm.length) cases.push({ id: 'vet-commented', title: `${T.F.rel}: commented-out ${cm.join(', ')} left as it is`, detail: 'dead text from step dead; delete it or bring it back under a vet_ name' });
    }
    return { changes, cases };
  },
};
