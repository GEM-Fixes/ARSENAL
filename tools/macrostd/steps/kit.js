// macrostd step kit: the {inventory ..} block of the soldier breeds (resource/set/breed/**/*.set). Writes
//   resource/set/breed/breed_kit.inc and adds (include "/set/breed/breed_kit.inc") to breed_macros.inc after its header comment
//   (TST-108: the file and the include come in the same step; breeds already include breed_macros.inc, SDL-17/GPL-11).
//   A macro is made for every load used 4+ times across all factions (owner rule); everything else stays a generic call or literal.
//   Weapons, grouped by CLASS across all factions. Class = where the item's stuff file lives (engine lookup: every word of the item
//   name is a '.' token of a set/stuff file name, mod over vanilla; .pattern/.fsm/.presets skipped): set/stuff/<pistol|smg|rifle|
//   mgun|flame>/.. -> that class, bazooka/ and rifle/ptr/ (AT rifles) -> at, reactive/ -> mortar, any other folder -> its name.
//     pair = `{item "<w>" filled}` + the NEXT line `{item "ammo <a>" <n>}` whose stuff the weapon's {filling} tags take (only that
//            first ammo line; a second one stays literal; ammo the weapon does not load = literal, case kit-foreign-ammo)
//     standard load = the (ammo, rounds) most of the weapon's pairs use (a tie at the top = no standard, case kit-no-standard)
//     <class>_<weapon>            the standard, no parameters, e.g. ("rifle_mauzer")
//     <class>_<weapon>_<rounds>   any other load of that weapon used 4+ times ("smg_mp40_96"); _<ammo>_<rounds> when the ammo differs
//     kit_<class>                 every load used under 4 times: ("kit_rifle" gun(mauzer) ammo(mauser_clip) rounds(120)). One generic per
//                                 class (not one kit_gun) so every weapon line in a breed names its class, standard or not.
//   Grenade-type items, grouped by KIND across factions, one line each (order is data: only single lines are replaced):
//     kind from the stuff: .mine / 'mine' tag -> mine, grenade/00 grenade_smoke or 'smoke' tag -> smoke, {damage fire -> fire,
//     {damage cumulative or grenade/02 grenade_at -> at, explosive/ -> explosive, other grenade/ -> frag. Others are not grenades.
//     every (item, count form) used 4+ times: <kind>_<short>_x<count>, kind at = at_grenade, short = item words without 'grenade' and
//     the kind word, count n -> xn, two numbers a b -> xa_b, '.'->p '-'->m, no count -> nothing: ("frag_m24_x2")
//     ("at_grenade_hohlladung") ("smoke_x1") ("at_grenade_m24x5_x0_1"). Two item spellings that give one name ("grenade m24x5" /
//     "m24x5 grenade"): the less used keeps its words in order (at_grenade_m24x5_grenade). The header names each macro's item string.
//   Out of line (report only, TSV kind `outline`, emitted when the plan writes a --tsv so a re-plan stays 0 change rows): kit_<class>
//   calls (load under 4 uses: the standard and the difference), literal grenade lines under 4 uses of an item that has a macro
//   (nearest macro and the difference), weapon with no ammo line / foreign ammo / other weapon form. Non-standard macros are listed
//   as case kit-nonstandard. Totals per class are case kit-outline.
//   Re-run / upgrade: an existing breed_kit.inc is read back, its calls count as the loads they expand to, the table is rebuilt from
//   all loads and the file rewritten; calls whose load got (or lost) a macro are re-written. Same input -> 0 change rows.
// Author: Imperator_Aug (ARSENAL, ia-232fd4dd)
const fs = require('fs'), path = require('path');
const { walkFiles, relPath } = require('../../lib/report');

const KIT_REL = 'resource/set/breed/breed_kit.inc';
const KIT_LINE = '(include "/set/breed/breed_kit.inc")';
const MAC_REL = 'resource/set/breed/breed_macros.inc';
const MAC_LINE = '(include "/set/breed/breed_macros.inc")';
const MIN_USES = 4;
const NUM = /^-?\d+(\.\d+)?$/;
const VAL = /^[^\s()"%;{}][^()"%;{}\r\n]*[^\s()"%;{}]$|^[^\s()"%;{}]$/;   // SDL-19: no ')' and nothing that breaks the quoted body
const CLASS_ORDER = ['pistol', 'smg', 'rifle', 'mgun', 'at', 'flame', 'mortar'];
const KIND_ORDER = ['frag', 'at', 'smoke', 'fire', 'mine', 'explosive'];
const KIND_PREFIX = { frag: 'frag', at: 'at_grenade', smoke: 'smoke', fire: 'fire', mine: 'mine', explosive: 'explosive' };
const lc = s => s.toLowerCase();
const ident = s => lc(s).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const numId = s => s.replace(/\./g, 'p').replace(/-/g, 'm');

// ---- stuff index: item name -> stuff keys (engine FindStuff: file-name tags only)
function stuffIndex(ctx) {
  const recs = new Map();   // key -> { key, tags:Set, mod }
  const add = (key, mod) => {
    if (!key.startsWith('resource/set/stuff/') || /\.(fsm|presets)$/.test(key) || key.endsWith('/.presets')) return;
    const base = key.slice(key.lastIndexOf('/') + 1), tags = new Set(base.split('.').filter(Boolean));
    if (tags.has('pattern')) return;
    recs.set(key, { key, tags, mod });
  };
  const v = ctx.model.vanilla && ctx.model.vanilla.v;
  if (v && v.files) for (const k of v.files.keys()) add(k, false);
  const sd = path.join(ctx.modDir, 'resource', 'set', 'stuff');
  if (fs.existsSync(sd)) for (const f of walkFiles(sd, /./)) add(lc('resource/set/stuff/' + relPath(sd, f)), true);
  const byTag = new Map();
  for (const r of recs.values()) for (const t of r.tags) { let l = byTag.get(t); if (!l) byTag.set(t, l = []); l.push(r); }
  const memo = new Map(), text = new Map();
  const find = name => {
    const k = lc(name).trim();
    if (memo.has(k)) return memo.get(k);
    const w = k.split(/\s+/).filter(Boolean);
    const first = byTag.get(w[0]) || [];
    const res = w.length ? first.filter(r => w.every(t => r.tags.has(t))) : [];
    memo.set(k, res); return res;
  };
  const read = key => {
    if (text.has(key)) return text.get(key);
    let b = null;
    const r = recs.get(key);
    try { b = r && r.mod ? fs.readFileSync(path.join(ctx.modDir, ...key.split('/'))) : ctx.vanilla.read(key); } catch (x) { b = null; }
    const s = b ? b.toString('latin1') : '';
    text.set(key, s); return s;
  };
  return { find, read };
}
function classOf(key) {
  const p = key.slice('resource/set/stuff/'.length).split('/');
  if (p[0] === 'bazooka' || (p[0] === 'rifle' && p.includes('ptr'))) return 'at';
  if (p[0] === 'reactive') return 'mortar';
  return p.length > 1 ? ident(p[0]) || null : null;
}
function kindOf(S, key) {
  const p = key.slice('resource/set/stuff/'.length).split('/');
  const tags = key.slice(key.lastIndexOf('/') + 1).split('.');
  if (p[0] !== 'grenade' && p[0] !== 'explosive') return null;
  const s = S.read(key).replace(/;[^\r\n]*/g, '');
  if (tags.includes('mine')) return 'mine';
  if (p[1] === '00 grenade_smoke' || tags.includes('smoke')) return 'smoke';   // before fire: WP smoke (m15, n77) also has {damage fire
  if (/\{damage\s+(add\s+)?fire\b/.test(s)) return 'fire';
  if (p[0] === 'explosive') return 'explosive';
  if (/\{damage\s+(add\s+)?cumulative\b/.test(s) || p[1] === '02 grenade_at') return 'at';
  return 'frag';
}
const pick = (keys, f) => {   // one value for all matching stuffs, or null when none / they disagree
  const vals = new Set(keys.map(f));
  return vals.size === 1 ? [...vals][0] : null;
};

// ---- one inventory line -> { code, comment, item:{name, args:[tok]} | null }
function splitLine(l) {
  let q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (c === '"') q = !q;
    else if (c === ';' && !q) { let j = i; while (j > 0 && /[ \t]/.test(l[j - 1])) j--; return { code: l.slice(0, j), comment: l.slice(i) }; }
  }
  return { code: l, comment: '' };
}
function parseItem(code, ind) {
  if (!code.startsWith(ind) || /^\s/.test(code.slice(ind.length))) return null;
  const m = /^\{item\s+"([^"\r\n]+)"((?:\s+[^\s"{}]+)*)\s*\}\s*$/.exec(code.slice(ind.length));
  return m ? { name: m[1], args: m[2].trim() ? m[2].trim().split(/\s+/) : [] } : null;
}

// inventory block of a breed text -> { lines, eol, a (first item line), b (end line, exclusive), ind } | null
function inventory(s) {
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  const lines = s.split(eol);
  const i = lines.findIndex(l => /^\t\{inventory\s*$/.test(l));
  if (i < 0) return null;
  let e = -1;
  for (let k = i + 1; k < lines.length; k++) if (lines[k] === '\t}') { e = k; break; }
  return e < 0 ? null : { lines, eol, a: i + 1, b: e, ind: '\t\t' };
}

// does the ammo item load into the weapon? weapon stuff {filling "<tags>" n} (followed through a non-pattern {from}, 3 deep) must
// be a subset of the file-name tags of a stuff the ammo item names. Unknown filling -> true [I].
// several stuffs may carry the gun's tags (rifle/g41 + rifle/sniper/g41): every one's filling counts, a fit with any is a fit
function fillingOf(S, keys, depth) {
  const out = [];
  for (const k of keys) {
    const s = S.read(k).replace(/;[^\r\n]*/g, '');
    const f = /\{filling\s+"([^"]+)"/i.exec(s);
    if (f) { out.push(lc(f[1]).split(/\s+/).filter(Boolean)); continue; }
    const fr = /^\s*\{from\s+"([^"]+)"/.exec(s);
    if (fr && depth < 3 && !/\bpattern\b/i.test(fr[1])) { const r = fillingOf(S, S.find(fr[1]).map(x => x.key), depth + 1); if (r) out.push(...r); else return null; }
    else return null;   // a stuff with no known filling: unknown
  }
  return out.length ? out : null;
}
function fits(S, cache, gun, ammoName) {
  const ck = 'fit\u0000' + gun + '\u0000' + ammoName;
  if (cache.has(ck)) return cache.get(ck);
  const fills = fillingOf(S, S.find(gun).map(r => r.key), 0);
  const r = !fills || S.find(ammoName).some(a => fills.some(fill => fill.every(t => a.tags.has(t))));
  cache.set(ck, r); return r;
}

// classify the inventory: pairs, weapon lines without a pair, grenade lines
// defs (re-run) = the existing breed_kit.inc defines: name -> { t:'pair', gun, ammo, rounds } | { t:'gren', item, form }; a call line
// of one of them (or a kit_<class> call) counts as the load it expands to, so a re-run recounts and renames like a fresh run.
function entries(inv, S, cache, defs) {
  const out = [];
  const info = name => {
    if (cache.has(name)) return cache.get(name);
    const keys = S.find(name).map(r => r.key);
    const r = { cls: pick(keys, classOf), kind: /^ammo\s/i.test(name) ? null : pick(keys, k => kindOf(S, k)), n: keys.length };
    cache.set(name, r); return r;
  };
  for (let k = inv.a; k < inv.b; k++) {
    const sp = splitLine(inv.lines[k]);
    const cm = sp.comment ? [sp.comment] : [];
    const c0 = sp.code.startsWith(inv.ind) ? sp.code.slice(inv.ind.length).replace(/\s+$/, '') : '';
    let cl = /^\("([a-z0-9_]+)"\)$/.exec(c0);
    if (cl && defs.has(cl[1])) {
      const d = defs.get(cl[1]);
      if (d.t === 'pair') out.push({ t: 'pair', k, n: 1, gun: d.gun, ammo: d.ammo, rounds: d.rounds, cls: info(d.gun).cls, comments: cm, call: true });
      else out.push({ t: 'gren', k, n: 1, name: d.item, form: d.form, kind: info(d.item).kind || d.kind, comments: cm, call: true });
      continue;
    }
    cl = /^\("kit_([a-z0-9_]+)" gun\(([^()]+)\) ammo\(([^()]+)\) rounds\(([^()]+)\)\)$/.exec(c0);
    if (cl && defs.has('kit_' + cl[1])) { out.push({ t: 'pair', k, n: 1, gun: cl[2], ammo: cl[3], rounds: cl[4], cls: info(cl[2]).cls || cl[1], comments: cm, call: true }); continue; }
    const it = parseItem(sp.code, inv.ind);
    if (!it) {   // weapon in another form (filling / counts) -> for the out-of-line list
      const w = /^\t\t\{item\s+"([^"\r\n]+)"\s.*\bfill(ed|ing)\b/.exec(sp.code);
      if (w) out.push({ t: 'wform', k, name: w[1], text: sp.code.trim() });
      continue;
    }
    if (it.args.length === 1 && it.args[0] === 'filled') {
      const I = info(it.name);
      const sp2 = k + 1 < inv.b ? splitLine(inv.lines[k + 1]) : null, am = sp2 && parseItem(sp2.code, inv.ind);
      const ammo = am && /^ammo\s+\S/.test(am.name) && am.args.length === 1 && NUM.test(am.args[0]) ? am : null;
      const fit = ammo ? fits(S, cache, it.name, ammo.name) : true;
      if (ammo && !fit) out.push({ t: 'foreign', k, name: it.name, cls: I.cls, next: sp2.code.trim() });
      else if (ammo) {
        out.push({ t: 'pair', k, n: 2, gun: it.name, ammo: ammo.name.replace(/^ammo\s+/, ''), rounds: ammo.args[0], cls: I.cls, comments: [sp.comment, sp2.comment].filter(Boolean) });
        k++;
      } else out.push({ t: 'lone', k, name: it.name, cls: I.cls, next: k + 1 < inv.b ? inv.lines[k + 1].trim() : '(end of inventory)' });
      continue;
    }
    if (it.args.every(a => NUM.test(a)) && it.args.length <= 2) {
      const I = info(it.name);
      if (I.kind) out.push({ t: 'gren', k, n: 1, name: it.name, form: it.args.join(' '), kind: I.kind, comments: cm });
    }
  }
  return out;
}
const sideOf = rel => { const p = rel.split('/'); return p[p.length - 2]; };
const gunName = (cls, gun) => cls + '_' + ident(lc(gun).split(/\s+/).filter(w => w !== 'weapon').join(' ') || gun);
function grenName(kind, item, form) {
  let words = lc(item).split(/\s+/).filter(w => w !== 'grenade' && w !== kind);
  let short = ident(words.join(' '));
  if (short.startsWith(kind + '_')) short = short.slice(kind.length + 1);
  if (short.endsWith('_' + kind)) short = short.slice(0, -kind.length - 1);
  const a = form ? form.split(' ').map(numId) : [];
  // the count is its own word (_x2), so an item name that holds an x (m24x5) stays readable: at_grenade_m24x5_x0_1
  const cnt = a.length ? 'x' + a.join('_') : '';
  // an item that is just "<kind> grenade" with no count would be the bare kind word ("smoke"): say grenade
  if (!short && !cnt) return KIND_PREFIX[kind] + '_grenade';
  return KIND_PREFIX[kind] + (short ? '_' + short : '') + (cnt ? '_' + cnt : '');
}
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

// ---- the macro file
function header(name, what, eg) { return ['; ' + name + ': ' + what, ';   e.g. ' + eg]; }
function pad(rows) {
  const w = rows[0].map((_, i) => Math.max(...rows.map(r => String(r[i]).length)));
  return rows.map(r => (';   ' + r.map((c, i) => String(c).padEnd(w[i])).join('  ')).replace(/\s+$/, ''));
}
const gLine = (name, form) => '{item "' + name + '"' + (form ? ' ' + form : '') + '}';
const formText = f => f ? 'count ' + f : 'no count';
function kitFile(T, eol) {
  const L = [
    '; breed_kit.inc: weapon and grenade loads of the soldier breeds, by class across all factions (written by macrostd step kit).',
    ';   Included from breed_macros.inc, so every breed that includes that file can call these. A macro exists for every load',
    ';   used ' + MIN_USES + '+ times (all factions together):',
    ';   <class>_<weapon>: the weapon filled plus its standard ammo line (the load most breeds give it).',
    ';   <class>_<weapon>_<rounds>: another load of that weapon used ' + MIN_USES + '+ times (non-standard load; _<ammo>_<rounds> when the',
    ';   ammo differs). kit_<class>: the same two lines for any load used less (a rare deviation shows as a kit_ call).',
    ';   <kind>_<item>_x<count>: one grenade-type item line (kind at = at_grenade). Lines a breed has besides these stay literal',
    ';   in the breed\'s order.',
  ];
  for (const cls of T.classes) {
    const ws = T.guns.filter(g => g.cls === cls), gen = T.generic.get(cls);
    L.push('', '; ==== ' + cls + ' ====');
    if (ws.length) L.push(...pad([['macro', 'weapon', 'ammo', 'rounds', 'uses', 'factions', 'note']].concat(ws.map(g => [g.name, g.gun, g.ammo, g.rounds, g.uses, g.sides.join(' '), g.note]))));
    if (gen) L.push(';   kit_' + cls + ': ' + plural(gen.uses, 'other load') + ' (' + plural(gen.guns.size, 'weapon') + ')');
    for (const g of ws) L.push('', ...header(g.name, 'item "' + g.gun + '" filled + ' + g.rounds + ' "ammo ' + g.ammo + '" (' + g.note + ', ' + g.uses + ' uses)', '("' + g.name + '")'),
      '(define "' + g.name + '"', '\t{item "' + g.gun + '" filled}', '\t{item "ammo ' + g.ammo + '" ' + g.rounds + '}', ')');
    if (gen) L.push('', '; kit_' + cls + ': a ' + cls + ' weapon filled + one ammo line, for loads used under ' + MIN_USES + ' times',
      ';   gun - weapon item name as in {item "<gun>" filled}', ';   ammo - ammo item name after "ammo " (may contain spaces)', ';   rounds - ammo count',
      ';   e.g. ("kit_' + cls + '" gun(' + gen.eg.gun + ') ammo(' + gen.eg.ammo + ') rounds(' + gen.eg.rounds + '))',
      '(define "kit_' + cls + '"', '\t{item "%gun" filled}', '\t{item "ammo %ammo" %rounds}', ')');
  }
  for (const kind of T.kinds) {
    const gs = T.grens.filter(g => g.kind === kind);
    L.push('', '; ==== grenades: ' + kind + ' ====');
    L.push(...pad([['macro', 'item', 'count', 'uses', 'factions']].concat(gs.map(g => [g.name, '"' + g.item + '"', g.form || '-', g.uses, g.sides.join(' ')]))));
    for (const g of gs) L.push('', ...header(g.name, 'item "' + g.item + '", ' + formText(g.form) + ' (' + kind + ', ' + g.uses + ' uses' + (g.std ? '' : ', not the most used count of this item') + ')', '("' + g.name + '")'), '(define "' + g.name + '"', '\t' + gLine(g.item, g.form), ')');
  }
  return L.join(eol) + eol;
}

// existing breed_kit.inc -> defines name -> load (re-run / upgrade)
function readKit(s) {
  const defs = new Map();
  for (const m of s.matchAll(/\(define "([a-z0-9_]+)"\r?\n\t\{item "([^"%]+)" filled\}\r?\n\t\{item "ammo ([^"%]+)" (\S+)\}\r?\n\)/g)) defs.set(m[1], { t: 'pair', gun: m[2], ammo: m[3], rounds: m[4] });
  for (const m of s.matchAll(/\(define "(kit_[a-z0-9_]+)"\r?\n\t\{item "%gun" filled\}/g)) defs.set(m[1], { t: 'generic' });
  const kinds = Object.entries(KIND_PREFIX).sort((a, b) => b[1].length - a[1].length);
  for (const m of s.matchAll(/\(define "([a-z0-9_]+)"\r?\n\t\{item "([^"%]+)"((?: [^\s}]+)*)\}\r?\n\)/g)) {
    const k = kinds.find(([, p]) => m[1].startsWith(p + '_') || m[1] === p);
    defs.set(m[1], { t: 'gren', item: m[2], form: m[3].trim(), kind: k ? k[0] : 'frag' });
  }
  return defs;
}

function planAll(ctx) {
  const m = ctx.model, cases = [];
  const S = stuffIndex(ctx), cache = new Map();
  const exists = ctx.exists(KIT_REL);
  const oldKit = exists ? ctx.read(KIT_REL).toString('latin1') : null;
  const defs = exists ? readKit(oldKit) : new Map();
  const keys = [...m.files.keys()].filter(k => /^resource\/set\/breed\/.+\.set$/.test(k) && m.files.get(k).scope).sort();
  const files = [];
  for (const k of keys) {
    const F = m.files.get(k), s = ctx.read(F.rel).toString('latin1');
    const inv = inventory(s);
    if (!inv) continue;
    files.push({ F, s, inv, es: entries(inv, S, cache, defs) });
  }
  // ---- stats over literal lines and existing calls alike
  const wStat = new Map(), gStat = new Map();   // gun -> Map(ammo \0 rounds -> {n, sides}); item -> Map(form -> {n, sides})
  const bump = (M, a, b, side) => { let x = M.get(a); if (!x) M.set(a, x = new Map()); let y = x.get(b); if (!y) x.set(b, y = { n: 0, sides: new Set() }); y.n++; y.sides.add(side); };
  for (const f of files) for (const e of f.es) {
    if (e.t === 'pair') bump(wStat, e.gun, e.ammo + '\u0000' + e.rounds, sideOf(f.F.rel));
    if (e.t === 'gren') bump(gStat, e.name, e.form, sideOf(f.F.rel));
  }
  const sortLoads = M => [...M].sort((x, y) => y[1].n - x[1].n || (x[0] < y[0] ? -1 : 1));
  const total = M => [...M.values()].reduce((a, b) => a + b.n, 0);
  const kitKey = lc(KIT_REL);
  const nameFree = n => {
    if (m.vanilla.defined.has(n) || m.vanilla.called.has(n)) return false;
    const b = m.byName.get(n);
    return !b || b.defs.every(d => d.key === kitKey);   // our own earlier defines may be reused
  };
  const used = new Set();
  const claim = (cands) => { for (const n of cands) if (!used.has(n) && nameFree(n)) { used.add(n); return n; } return null; };
  const T = { guns: [], grens: [], generic: new Map(), classes: [], kinds: [] };
  const gunMac = new Map(), gunStd = new Map(), grenMac = new Map(), grenTop = new Map();
  const ties = [], unresolved = [];
  // weapons: by the uses of their most used load
  const gunOrder = [...wStat].map(([gun, M]) => ({ gun, M, loads: sortLoads(M) })).sort((a, b) => b.loads[0][1].n - a.loads[0][1].n || (a.gun < b.gun ? -1 : 1));
  for (const { gun, M, loads } of gunOrder) {
    const I = cache.get(gun);
    if (!I || !I.cls) { unresolved.push(gun); continue; }
    const tie = loads.length > 1 && loads[1][1].n === loads[0][1].n;
    if (tie && loads[0][1].n >= MIN_USES) ties.push(gun + ' (' + loads.slice(0, 3).map(([k, v]) => k.replace('\u0000', ' ') + ' x' + v.n).join(', ') + ')');
    const [stdAmmo, stdRounds] = loads[0][0].split('\u0000');
    if (!tie) gunStd.set(gun, { ammo: stdAmmo, rounds: stdRounds, uses: loads[0][1].n, total: total(M) });
    for (const [load, st] of loads) {
      if (st.n < MIN_USES) break;
      const [ammo, rounds] = load.split('\u0000');
      if (!VAL.test(gun) || !VAL.test(ammo) || !NUM.test(rounds)) continue;
      const isStd = !tie && load === loads[0][0];
      const base = gunName(I.cls, gun), base2 = I.cls + '_' + ident(gun);
      const tailN = (ammo !== stdAmmo ? '_' + ident(ammo) : '') + '_' + numId(rounds);
      const name = claim(isStd ? [base, base2] : [base + tailN, base2 + tailN, base + '_' + ident(ammo) + '_' + numId(rounds)]);
      if (!name) continue;
      const g = { name, gun, ammo, rounds, cls: I.cls, uses: st.n, sides: [...st.sides].sort(), std: isStd,
        note: isStd ? 'standard' : tie ? 'even split, no standard' : 'non-standard load, standard is ' + (ammo !== stdAmmo ? stdAmmo + ' ' : '') + stdRounds };
      T.guns.push(g); gunMac.set(gun + '\u0000' + load, g);
    }
  }
  // grenades: every (item, form) used 4+ times
  const grenCand = [];
  for (const [item, M] of gStat) {
    const loads = sortLoads(M), kind = (cache.get(item) || {}).kind;
    if (!kind) continue;
    grenTop.set(item, { form: loads[0][0], uses: loads[0][1].n });
    for (const [form, st] of loads) if (st.n >= MIN_USES) grenCand.push({ item, form, kind, uses: st.n, sides: [...st.sides].sort(), std: form === loads[0][0] });
  }
  grenCand.sort((a, b) => b.uses - a.uses || (a.item < b.item ? -1 : a.item > b.item ? 1 : a.form < b.form ? -1 : 1));
  for (const g of grenCand) {
    const a = g.form ? g.form.split(' ').map(numId) : [], cnt = a.length ? '_x' + a.join('_') : '';
    let words = ident(g.item);
    if (words.startsWith(g.kind + '_')) words = words.slice(g.kind.length + 1);
    const name = claim([grenName(g.kind, g.item, g.form), KIND_PREFIX[g.kind] + '_' + words + cnt, ...[2, 3, 4, 5].map(i => grenName(g.kind, g.item, g.form) + '_' + i)]);
    if (!name) continue;
    g.name = name; T.grens.push(g); grenMac.set(g.item + '\u0000' + g.form, g);
  }
  const stdMac = new Set(T.guns.filter(g => g.std).map(g => g.gun));   // no-ammo / foreign / other-form rows: weapons with a standard macro
  const genName = cls => 'kit_' + cls;
  const genOk = cls => { const n = genName(cls); return !T.guns.some(g => g.name === n) && !T.grens.some(g => g.name === n) && nameFree(n); };
  // ---- render every breed
  const changes = [], outline = [], outlineBy = new Map(), lone = [], bad = [], foreign = [];
  const out = (f, line, cls, item, how, std) => { outline.push({ f, line, item, how, std }); outlineBy.set(cls, (outlineBy.get(cls) || 0) + 1); };
  const stdText = gun => { const s = gunStd.get(gun); return s ? s.ammo + ' ' + s.rounds + ' (' + s.uses + ' uses)' : 'none'; };
  let anyUse = false, eol = '\r\n';
  const counts = { gun: 0, nonstd: 0, generic: 0, grenade: 0 };
  for (const f of files) {
    const { inv } = f, ind = inv.ind, rep = new Map();
    for (const e of f.es) {
      const L = e.k + 1, cm = e.comments && e.comments.length ? ' ' + e.comments.join(' ') : '';
      let lines = null, kind = '';
      if (e.t === 'pair') {
        const g = gunMac.get(e.gun + '\u0000' + e.ammo + '\u0000' + e.rounds);
        if (g) { lines = [ind + '("' + g.name + '")' + cm]; kind = 'kit_gun'; counts[g.std ? 'gun' : 'nonstd']++; anyUse = true; }
        else if (e.cls && VAL.test(e.gun) && VAL.test(e.ammo) && NUM.test(e.rounds) && genOk(e.cls)) {
          lines = [ind + '("' + genName(e.cls) + '" gun(' + e.gun + ') ammo(' + e.ammo + ') rounds(' + e.rounds + '))' + cm]; kind = 'kit_generic'; counts.generic++; anyUse = true;
          let gs = T.generic.get(e.cls); if (!gs) T.generic.set(e.cls, gs = { uses: 0, guns: new Set(), eg: e }); gs.uses++; gs.guns.add(e.gun);
          const s = gunStd.get(e.gun), n = wStat.get(e.gun).get(e.ammo + '\u0000' + e.rounds).n;
          out(f, L, e.cls, e.gun, `${e.gun} with ${e.ammo} ${e.rounds} (${plural(n, 'breed')})` + (s && s.ammo === e.ammo && s.rounds === e.rounds ? `, the most used load of this weapon but under ${MIN_USES} uses` : s ? (s.ammo === e.ammo ? `, standard is ${s.rounds} (${s.rounds - e.rounds > 0 ? '-' : '+'}${Math.abs(s.rounds - e.rounds)})` : `, standard is ${s.ammo} ${s.rounds}`) : ', no standard load'), stdText(e.gun));
        } else {
          if (e.cls) bad.push(f.F.rel + ':' + L + ' ' + e.gun + ' / ' + e.ammo);
          else if (!unresolved.includes(e.gun)) unresolved.push(e.gun);
          lines = e.call ? [ind + '{item "' + e.gun + '" filled}' + cm, ind + '{item "ammo ' + e.ammo + '" ' + e.rounds + '}'] : null; kind = 'kit_literal';
        }
      } else if (e.t === 'gren') {
        const g = grenMac.get(e.name + '\u0000' + e.form);
        if (g) { lines = [ind + '("' + g.name + '")' + cm]; kind = 'kit_grenade'; counts.grenade++; anyUse = true; }
        else {
          lines = e.call ? [ind + gLine(e.name, e.form) + cm] : null; kind = 'kit_literal';
          const near = T.grens.filter(x => x.item === e.name).sort((a, b) => b.uses - a.uses)[0];
          if (near) out(f, L, 'grenade ' + near.kind, e.name, `${gLine(e.name, e.form)} (${plural(gStat.get(e.name).get(e.form).n, 'breed')}), nearest ${near.name} = ${formText(near.form)}` + (/ |\./.test(e.form) && !/ |\./.test(near.form) ? ' (odd count form)' : ''), near.name + ' (' + near.uses + ' uses)');
        }
      } else if (e.t === 'foreign') {
        if (stdMac.has(e.name)) out(f, L, e.cls || '?', e.name, `${e.name} followed by ammo it does not load (${e.next})`, stdText(e.name));
        foreign.push(e.name + ' + ' + e.next);
      } else if (e.t === 'lone') {
        if (stdMac.has(e.name)) out(f, L, e.cls || '?', e.name, `${e.name} with no ammo line (next: ${e.next})`, stdText(e.name));
        lone.push(e.name);
      } else if (e.t === 'wform') {
        if (stdMac.has(e.name)) out(f, L, (cache.get(e.name) || {}).cls || '?', e.name, `other weapon form: ${e.text}`, stdText(e.name));
      }
      if (!lines) continue;
      const before = inv.lines.slice(e.k, e.k + e.n);
      if (before.join('\n') !== lines.join('\n')) rep.set(e.k, { n: e.n, lines, kind, before });
    }
    if (!rep.size) continue;
    const rows = [], nl = inv.lines.slice(0, inv.a);
    for (let k = inv.a; k < inv.b;) {
      const r = rep.get(k);
      if (r) { rows.push({ line: k + 1, kind: r.kind, before: r.before.map(s => s.trim()).join(' / '), after: r.lines.map(s => s.trim()).join(' / '), note: '' }); nl.push(...r.lines); k += r.n; }
      else nl.push(inv.lines[k++]);
    }
    nl.push(...inv.lines.slice(inv.b));
    if (!nl.includes(MAC_LINE)) {
      const b = nl.findIndex(l => /^\{breed\b/.test(l));
      if (b < 0 || !ctx.exists(MAC_REL)) { bad.push(f.F.rel + ': no (include "/set/breed/breed_macros.inc") and none can be added'); continue; }
      nl.splice(b, 0, MAC_LINE);
      rows.unshift({ line: b + 1, kind: 'include', before: '', after: MAC_LINE, note: 'TST-108' });
    }
    eol = inv.eol;
    changes.push({ file: f.F.rel, after: Buffer.from(nl.join(inv.eol), 'latin1'), create: false, rows });
  }
  if (anyUse && !ctx.exists(MAC_REL)) return { changes: [], cases: [{ id: 'kit-no-macros-file', title: 'kit not applied: ' + MAC_REL + ' missing (run step breed first)', detail: '' }] };
  if (anyUse || exists) {
    T.classes = [...new Set([...T.guns.map(g => g.cls), ...T.generic.keys()])].sort((a, b) => (CLASS_ORDER.indexOf(a) + 1 || 99) - (CLASS_ORDER.indexOf(b) + 1 || 99) || (a < b ? -1 : 1));
    T.kinds = KIND_ORDER.filter(k => T.grens.some(g => g.kind === k));
    const text = kitFile(T, eol);
    if (text !== oldKit) changes.unshift({ file: exists ? (m.files.get(kitKey) || { rel: KIT_REL }).rel : KIT_REL, after: Buffer.from(text, 'latin1'), create: !exists,
      rows: [{ line: 1, kind: exists ? 'rewrite' : 'create', before: '', after: `${T.guns.length} weapon, ${T.generic.size} generic, ${T.grens.length} grenade macros`, note: 'TST-108' }] });
  }
  if (anyUse) {
    const s = ctx.read(MAC_REL).toString('latin1'), e2 = s.includes('\r\n') ? '\r\n' : '\n', L = s.split(e2);
    if (!L.includes(KIT_LINE)) {
      let h = 0; while (h < L.length && /^;/.test(L[h])) h++;
      L.splice(h, 0, KIT_LINE);
      changes.push({ file: (m.files.get(lc(MAC_REL)) || { rel: MAC_REL }).rel, after: Buffer.from(L.join(e2), 'latin1'), create: false, rows: [{ line: h + 1, kind: 'include', before: '', after: KIT_LINE, note: 'TST-108: breed_kit.inc comes in the same step' }] });
    }
  }
  // outline: report rows (only when a TSV is written) + totals per class
  if (ctx.opts && ctx.opts.tsv) {
    const byFile = new Map();
    for (const o of outline) { let l = byFile.get(o.f.F.rel); if (!l) byFile.set(o.f.F.rel, l = []); l.push({ line: o.line, kind: 'outline', before: o.item, after: o.how, note: 'standard ' + o.std }); }
    for (const [file, rows] of byFile) { const c = changes.find(x => x.file === file); if (c) c.rows.push(...rows); else changes.push({ file, after: null, create: false, rows }); }
  }
  const ns = T.guns.filter(g => !g.std);
  if (ns.length) cases.push({ id: 'kit-nonstandard', title: ns.length + ' non-standard weapon loads used ' + MIN_USES + '+ times got their own macro', detail: ns.map(g => `${g.name}: ${g.uses} breeds, ${g.note.replace('non-standard load, ', '')}`).join('; ') });
  if (ties.length) cases.push({ id: 'kit-no-standard', title: ties.length + ' weapons split evenly at the top: no standard, each 4+ load gets a _<rounds> macro', detail: ties.join('; ') });
  if (unresolved.length) cases.push({ id: 'kit-no-class', title: unresolved.length + ' weapons with no single stuff class: their pairs stay literal', detail: unresolved.join(', ') });
  if (outline.length) cases.push({ id: 'kit-outline', title: outline.length + ' inventory entries out of line (TSV kind outline when --tsv)', detail: [...outlineBy].sort((a, b) => b[1] - a[1]).map(([c, n]) => c + ' ' + n).join(', ') });
  if (lone.length) { const c = new Map(); for (const n of lone) c.set(n, (c.get(n) || 0) + 1); cases.push({ id: 'kit-no-ammo', title: lone.length + ' filled weapon lines not followed by an ammo line stay literal', detail: [...c].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n, v]) => n + ' x' + v).join(', ') }); }
  if (foreign.length) { const c = new Map(); for (const n of foreign) c.set(n, (c.get(n) || 0) + 1); cases.push({ id: 'kit-foreign-ammo', title: foreign.length + ' weapons followed by an ammo line their stuff {filling} does not take: literal (the ammo belongs to another weapon)', detail: [...c].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n, v]) => n + ' x' + v).join('; ') }); }
  if (bad.length) cases.push({ id: 'kit-literal', title: bad.length + ' pairs kept literal (value form or name)', detail: bad.slice(0, 10).join('; ') });
  return { changes, cases, T, outline, counts };
}

module.exports = {
  id: 'kit',
  title: 'soldier breeds: weapon + ammo and grenade loads by class (breed_kit.inc)',
  planAll, grenName, gunName, classOf, readKit,
  plan(ctx) { const r = planAll(ctx); return { changes: r.changes, cases: r.cases }; },
};
