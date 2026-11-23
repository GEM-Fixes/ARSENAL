// Author: Imperator_Aug (ARSENAL, ia-9a3a104a)
'use strict';
// XLATE-2: translated values for a --donor unit. Donor structure stays; numbers, armour macro args, crew count, gun/turret limits come from the GoH rep.
//   tools/xlate/table.json (XLATE-1) gives per class: how to translate each curated key (copy | factor | const) and the AS2 native range / raw arrays.
//   Every value written is [T] until a unit with it is played.
// Asking protocol (GUI-2 can drive it): see ask below
const fs = require('fs'), path = require('path');

let TABLE = null;
const loadTable = p => TABLE || (TABLE = JSON.parse(fs.readFileSync(p || path.join(__dirname, '..', 'xlate', 'table.json'), 'utf8')));
const FACES = ['front', 'side', 'rear', 'top'];
// curated key -> the raw-array path (classes[c].keys[path]) where one exists, else the AS2 p5..p95 of factors only
const RAW = { speed: 'entity/chassis/locomotion/maxspeed', mass: 'entity/mass', turn_time: 'entity/chassis/locomotion/turntime', start_time: 'entity/chassis/locomotion/starttime', fuel: 'entity/chassis/fuelbag/volume' };

// ---- text helpers (cp1251 text read as latin1, CRLF)
function blockEnd(t, i) {   // t[i] is '{': index just past the matching '}', strings and ; comments skipped
  let d = 0;
  for (let j = i; j < t.length; j++) {
    const c = t[j];
    if (c === '"') { j = t.indexOf('"', j + 1); if (j < 0) return -1; } else if (c === ';') { const n = t.indexOf('\n', j); if (n < 0) return -1; j = n; } else if (c === '{') d++; else if (c === '}' && --d === 0) return j + 1;
  }
  return -1;
}
function findBlock(t, name, from = 0, to = t.length) {
  const re = new RegExp('\\{\\s*' + name + '(?![\\w])', 'ig'); re.lastIndex = from;
  const m = re.exec(t); if (!m || m.index >= to) return null;
  const e = blockEnd(t, m.index); return e < 0 ? null : { s: m.index, e };
}
// set {Key N} inside block Parent (or at top level of the first game_entity when parent is null); replaces the last assignment, else adds one before the closing brace
function setKey(t, parent, key, val) {
  const span = findBlock(t, parent || 'game_entity');
  if (!span) return null;
  const inner = t.slice(span.s, span.e), re = new RegExp('^\\{\\s*' + key + '\\s+(-?[\\d.]+)\\s*\\}', 'i');
  let d = 0, last = null;
  for (let j = 0; j < inner.length; j++) {
    const c = inner[j];
    if (c === '"') { j = inner.indexOf('"', j + 1); if (j < 0) break; } else if (c === ';') { j = inner.indexOf('\n', j); if (j < 0) break; }
    else if (c === '{') { if (!parent ? d === 1 : true) { const m = re.exec(inner.slice(j, j + 80)); if (m) last = { at: j, txt: m[0], num: m[1] }; } d++; } else if (c === '}') d--;
  }
  const old = last ? +last.num : null;
  if (last) { const a = span.s + last.at; return { text: t.slice(0, a) + last.txt.replace(last.num, String(val)) + t.slice(a + last.txt.length), old, added: false }; }
  const close = span.e - 1, ls = t.lastIndexOf('\n', close) + 1, ind = t.slice(ls, close);
  if (ind.trim() === '') return { text: t.slice(0, ls) + ind + '\t{' + key + ' ' + val + '}\r\n' + t.slice(ls), old: null, added: true };   // closing brace on its own line: new line above it, one tab deeper
  return { text: t.slice(0, close) + ' {' + key + ' ' + val + '} ' + t.slice(close), old: null, added: true };
}
const nums = s => (s.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);

// ---- tables
function classOfKey(key) { const p = key.split('/'); return p[0] === 'entity' && p[1] === '-vehicle' ? p[3] : null; }   // GoH: entity/-vehicle/<nation>/<class>/..
const donorClass = key => { const p = key.split('/'); return p[3]; };   // AS2: resource/entity/-vehicle/<class>/..
// PORTREV (rev-port #2): a factor row with mode 'none' (n0: airborne, trailer, special, generic, many w: rows) is no predictor; treat it as absent
const usable = f => !!(f && f.mode && f.mode !== 'none');
function pickClass(T, gohCls, dCls) { return T.factors[gohCls] && usable(T.factors[gohCls].speed) ? gohCls : (T.factors[dCls] && usable(T.factors[dCls].speed) ? dCls : null); }

function predict(f, v) { if (!usable(f)) return null; const r = f.mode === 'copy' ? v : f.mode === 'factor' ? v * f.factor : f.value; return typeof r === 'number' && Number.isFinite(r) ? r : null; }
function qmap(v, a, b) {   // quantile map of v from the GoH raw array a to the AS2 raw array b (piecewise linear through min p5 p25 p50 p75 p95 max)
  const ks = ['min', 'p5', 'p25', 'p50', 'p75', 'p95', 'max'], xs = [], ys = [];
  for (const k of ks) if (a[k] != null && b[k] != null && (!xs.length || a[k] > xs[xs.length - 1])) { xs.push(a[k]); ys.push(b[k]); }
  if (xs.length < 2) return null;
  if (v <= xs[0]) return ys[0] + (v - xs[0]) * (ys[1] - ys[0]) / (xs[1] - xs[0]) * 0;   // at or below the sample: its AS2 minimum
  if (v >= xs[xs.length - 1]) return ys[ys.length - 1];
  for (let i = 1; i < xs.length; i++) if (v <= xs[i]) return ys[i - 1] + (v - xs[i - 1]) * (ys[i] - ys[i - 1]) / (xs[i] - xs[i - 1]);
  return null;
}
const nice = (k, v) => k === 'speed' || k === 'turn_time' || k === 'start_time' ? +v.toFixed(1) : Math.round(v);

// ---- asking. mode: 'off' | 'json' | 'tty' | 'answers'. A question is one JSON object; the answer is one JSON object.
//   out line:  {"xlate":"question","v":1,"id","unit","class","stage":"engine"|"scale","key","goh","translated","range":{"p5","p95"},"scaled","donor","choices":["scale","translated","donor"],"default":"scale","rest_of_class":true}
//   in line:   {"id":"<same id>","choice":"scale|translated|donor","rest":true|false}
let stdinBuf = '';
function readLine() {
  const b = Buffer.alloc(1);
  for (;;) {
    const i = stdinBuf.indexOf('\n'); if (i >= 0) { const l = stdinBuf.slice(0, i); stdinBuf = stdinBuf.slice(i + 1); return l; }
    let n; try { n = fs.readSync(0, b, 0, 1, null); } catch (e) { if (e.code === 'EAGAIN') continue; if (e.code === 'EOF') n = 0; else throw e; }
    if (!n) { const l = stdinBuf; stdinBuf = ''; return l || null; }
    stdinBuf += b.toString('latin1');
  }
}
function makeAsker(opt) {
  const mode = opt.ask || 'off', answers = opt.answers || {}, restMem = new Map(), log = [];
  const ask = q => {
    const rk = q.class + '|' + q.stage;
    let choice = q.default, how = 'default (asking off)';
    if (restMem.has(rk)) { choice = restMem.get(rk); how = 'rest of class'; }
    else if (mode === 'answers') { const a = answers[q.id] || answers[rk] || answers['*']; if (a) { choice = a.choice; how = 'answers file'; if (a.rest) restMem.set(rk, choice); } else how = 'default (no answer on file)'; }
    else if (mode === 'json' || mode === 'tty') {
      if (mode === 'json') fs.writeSync(1, JSON.stringify(Object.assign({ xlate: 'question', v: 1 }, q, { choices: ['scale', 'translated', 'donor'], rest_of_class: true })) + '\n');
      else fs.writeSync(2, `${q.unit} ${q.key} (${q.stage}): GoH ${q.goh} -> ${q.translated}, AS2 ${q.class} range ${q.range.p5}..${q.range.p95}, scaled ${q.scaled}, donor ${q.donor}. [s]cale/[t]ranslated/[d]onor, add ! for the rest of this class > `);
      const l = readLine();
      if (l === null) { how = 'default (no answer: stdin closed)'; }
      else {
        let a = null; try { a = JSON.parse(l); if (a.id && a.id !== q.id) { a = null; how = 'default (answer id ' + l.slice(0, 40) + ' is not ' + q.id + ')'; } } catch { const m = /^\s*([std])\w*(!?)/i.exec(l); if (m) a = { choice: { s: 'scale', t: 'translated', d: 'donor' }[m[1].toLowerCase()], rest: m[2] === '!' }; }
        if (a && ['scale', 'translated', 'donor'].includes(a.choice)) { choice = a.choice; how = 'asked'; if (a.rest) restMem.set(rk, choice); } else how = 'default (answer unreadable)';
      }
    }
    log.push({ id: q.id, stage: q.stage, key: q.key, choice, how });
    return { choice, how };
  };
  return { ask, log, mode };
}

// ---- the armour rule. ONE function: GL-3 may replace it. In: rep k (from xlate.extract), class factors. Out: {part:{face:value}} + per-face notes.
function armourRule(k, F) {
  const out = { body: {}, turret: {} }, notes = [];
  for (const part of ['body', 'turret']) for (const face of FACES) {
    const mx = F[`armor_${part}_${face}_max`], md = F[`armor_${part}_${face}_med`];
    if (!usable(mx) && !usable(md)) continue;
    if (!usable(mx) || !usable(md)) { const one = usable(mx) ? 'max' : 'med', f1 = one === 'max' ? mx : md, raw1 = k[`armor_${part}_${face}_${one}`]; if (raw1 === undefined && f1.mode !== 'const') continue; const v1 = predict(f1, raw1); if (v1 == null) continue; out[part][face] = { v: v1, goh: raw1, agg: one, mode: f1.mode, lo: f1.as2_p5, hi: f1.as2_p95, key: `armor_${part}_${face}_${one}` }; continue; }
    const pick = mx && mx.chosen ? 'max' : md && md.chosen ? 'med' : (!md || (mx && mx.train_err[mx.mode] <= md.train_err[md.mode]) ? 'max' : 'med');
    const f = pick === 'max' ? mx : md, raw = k[`armor_${part}_${face}_${pick}`];
    if (raw === undefined && f.mode !== 'const') continue;   // the rep has no such face and the predictor needs it: the donor's number stands
    const pv = predict(f, raw); if (pv == null) continue;
    out[part][face] = { v: pv, goh: raw, agg: pick, mode: f.mode, lo: f.as2_p5, hi: f.as2_p95, key: `armor_${part}_${face}_${pick}` };
  }
  return { faces: out, notes };
}

// ---- XLATE-3: the GL-3 rule (tools/xlate/armour/rule.js). Volumes of the rep come from its own text (def + the includes goh2as2 gathered), read by statsheet.armorOf.
function repVolumes(text) {
  try {
    const sdlx = require('../lib/sdlx'), ix = require('../entityindex/index'), { armorOf } = require('../statsheet/statsheet.js');
    let src = text;
    if (src.includes('{##')) { const CK = require('../portdiff/checks'), { fixHashTags } = require('./goh2as2'); src = CK.stripDisabledBlocks(fixHashTags(src)); }
    const root = sdlx.read(Buffer.from(src, 'latin1'), { file: 'rep.def', key: 'rep.def', open: () => null, onError: () => {} }).root;
    const tops = [root, ...ix.kids(root).filter(b => /^(game_)?entity$/i.test(ix.nameOf(b) || ''))], out = [];
    for (const t of tops) for (const v of armorOf(t).volumes) out.push({ name: v.name, sides: v.sides });
    return out;
  } catch (e) { return []; }
}
function glRule(cls, text) {   // -> { r: rule.js result, vols: n } | null when the rep has no volumes (caller falls back to the old aggregate rule)
  const vols = repVolumes(text); if (!vols.length) return null;
  return { r: require('../xlate/armour/rule.js').armourRule(cls, vols), vols: vols.length };
}

// ---- crew
const crewCount = s => { let n = 0; const m = /\(\s*"crew_(\d)_human/i.exec(s); if (m) n += +m[1]; n += (s.match(/\(\s*"crew_(?:human|inside|gunner)[a-z_]*"/gi) || []).length; return n; };
// C2d (MB-R13 port-build:88): crew places the AS2 def builds. A crew_N_human macro gives N; each ("crew_human*"/"crew_inside*"/"crew_gunner*" ...)
// call names one place(X) (unique names, as crew.ext repeats them). A card or squad crew above this count fails `Link failed: human[..] to <unit>` and the man stays outside.
function crewPlaces(s) {
  const m = /\(\s*"crew_(\d)_human[a-z_]*"/i.exec(s), names = new Set();
  for (const c of s.matchAll(/\(\s*"crew_(?:human|inside|gunner)[a-z_]*"[^)\r\n]*?place\(\s*([A-Za-z0-9_]+)\s*\)/gi)) names.add(c[1].toLowerCase());
  return { n: (m ? +m[1] : 0) + names.size, macro: m ? +m[1] : 0, names: [...names] };
}
// doors each vanilla crew macro links through (b8-k.md item 7 [V]); a macro whose doors the mdl lacks leaves the unit never operatable (PORT-137)
const MACRO_DOORS = { crew_3_human: ['emit1', 'emit2'], crew_4_human: ['emit1', 'emit2'], crew_4_human_extended: ['emit0', 'emit1', 'emit2'] };
// largest crew macro count in (dc, rc] whose doors the mdl has; dc when none fits; rc when the mdl bones are unknown
function crewCap(rc, dc, ext, types) {
  if (!types) return rc;
  for (let n = rc; n > dc; n--) { const nm = `crew_${n}_human${n === 4 && ext ? '_extended' : ''}`, need = MACRO_DOORS[nm]; if (!need || need.every(d => types.has(d))) return n; }
  return dc;
}
// XLATE-5 (3): a seat call is the whole balanced ( ... ) form, across lines and with inner parens (place(x) door1(y)); the old [^)]* stopped at the first inner ")" and left the rest of the call as stray lines.
// Parens inside quoted strings and ; comments do not count. An unbalanced call is cut at the end of its line (never the rest of the file).
function seatEnd(s, i) {
  let depth = 0, q = false;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (q) { if (c === '"') q = false; else if (c === '\n') q = false; continue; }
    if (c === '"') q = true;
    else if (c === ';') { while (j < s.length && s[j] !== '\n') j++; }
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return j + 1;
  }
  const nl = s.indexOf('\n', i); return nl < 0 ? s.length : nl;
}
const seatLines = s => [...s.matchAll(/\(\s*"seat_human"/gi)].map(m => { const e = seatEnd(s, m.index); return { txt: s.slice(m.index, e), index: m.index }; });
// remove a seat call and, when its lines held nothing else, the blank line it leaves
function cutSeat(t, d) {
  let a = d.index, b = d.index + d.txt.length;
  const ls = t.lastIndexOf('\n', a - 1) + 1; let le = t.indexOf('\n', b); if (le < 0) le = t.length;
  if (!t.slice(ls, a).trim() && !t.slice(b, le).trim()) { a = ls; b = Math.min(t.length, le + 1); }
  return t.slice(0, a) + t.slice(b);
}

function peerCrew(vf, vfsLib, dCls) {
  const cnt = [];
  for (const k of vf.files.keys()) {
    if (!k.startsWith('resource/entity/-vehicle/' + dCls + '/') || !k.endsWith('.def')) continue;
    const p = k.split('/'); if (p[p.length - 2] !== p[p.length - 1].slice(0, -4)) continue;
    let s; try { s = vfsLib.readRec(vf.files.get(k)).toString('latin1'); } catch { continue; }
    const c = k.slice(0, k.lastIndexOf('/')) + '/crew.ext', n = crewCount(s) + (/\{\s*extension\s+"crew\.ext"/i.test(s) && vf.files.has(c) ? crewCount(vfsLib.readRec(vf.files.get(c)).toString('latin1')) : 0);
    if (n) cnt.push(n);
  }
  cnt.sort((a, b) => a - b); return cnt.length ? { n: cnt.length, min: cnt[0], p50: cnt[cnt.length >> 1], max: cnt[cnt.length - 1] } : null;
}

// ---- list-only keys of the rep (rules.json: dropped flaws, vaulting, highhardness)
function listedKeys(src) {
  const out = new Map();
  for (const m of src.matchAll(/\{\s*(quality|no_flaw|small_flaw|medium_flaw|large_flaw|[a-z_]*_flaw|highhardness|flag_vaultable|obstacleid|vault[a-z_]*|pather_set|caststeel)\b/ig)) { const k = m[1].toLowerCase(); out.set(k, (out.get(k) || 0) + 1); }
  return out;
}

// ---- gun/turret limits (Q35): GoH `{bone "name" {limits a b}}` for turret and gun bones into the donor's matching bone block
function limitsOf(src) {
  const out = new Map();
  for (const m of src.matchAll(/\{\s*bone\s+"([^"\r\n]+)"/ig)) {
    const e = blockEnd(src, m.index); if (e < 0) continue;
    const l = /\{\s*limits((?:\s+-?[\d.]+)*)\s*\}/i.exec(src.slice(m.index, e)); if (l) out.set(m[1].toLowerCase(), nums(l[1]));
  }
  return out;
}

// ---- main entry
// ctx: { text, repSrc, repAll, repKey, donorKey, extract(): rep k record, vf, vfsLib, types (mdl bone types Map|null), opt, T, add(code,msg), info(code,msg) }
function translate(ctx) {
  const { opt } = ctx, T = loadTable(opt.table), res = { wrote: [], skipped: [], asked: [], listed: [], native: null };
  const gcls = classOfKey(ctx.repKey), dcls = donorClass(ctx.donorKey), cls = pickClass(T, gcls, dcls);
  if (!cls) { ctx.info('XLATE_SKIPPED', `no table class for rep class ${gcls || '?'} / donor class ${dcls || '?'}: nothing translated`); res.skipped.push('class'); return Object.assign(res, { text: ctx.text }); }
  const F = T.factors[cls], rec = ctx.extract(), k = rec ? rec.k : {};
  const asker = ctx.asker || makeAsker(opt); res.asker = asker; res.cls = cls; res.unit = ctx.unit;
  let text = ctx.text;
  const unit = ctx.unit;
  // one value through: predictor -> engine check -> scale check -> ask
  const decide = (key, goh, f, extra) => {
    if (!usable(f)) { ctx.add('WARN_XL_NO_FACTOR', `${key}: class ${cls} has no predictor (mode ${f ? f.mode : 'missing'}); donor value kept [I]`); return { keep: true, why: 'no factor (mode ' + (f ? f.mode : 'missing') + ')' }; }
    let v = predict(f, goh), why = f.mode;
    if (v == null) { ctx.add('WARN_XL_NO_FACTOR', `${key}: predictor gave no finite value; donor value kept [I]`); return { keep: true, why: 'no finite prediction' }; }
    const raw = RAW[key] && T.classes[cls] && T.classes[cls].keys[RAW[key]];
    const scaled = raw && raw.goh && raw.as2 && goh != null ? qmap(goh, raw.goh, raw.as2) : null;
    const clampV = x => Math.min(f.as2_p95, Math.max(f.as2_p5, x));
    const alt = scaled != null ? scaled : clampV(v);
    const q = { id: `${unit}:${key}`, unit, class: cls, key, goh, translated: nice(key, v), range: { p5: f.as2_p5, p95: f.as2_p95 }, scaled: nice(key, alt), donor: extra && extra.donor !== undefined ? extra.donor : null };
    const bad = !Number.isFinite(v) || v < 0 || (v === 0 && key !== 'armor_top');   // the engine side is only shape and sign (xlate-1 limits)
    if (bad) { q.stage = 'engine'; res.asked.push(q.id + ' engine'); const a = asker.ask(Object.assign(q, { default: 'scale' })); return a.choice === 'donor' ? { keep: true, why: 'engine limit, donor kept (' + a.how + ')' } : { v: alt, why: `engine limit (${v}) -> AS2 scale (${a.how})` }; }
    if (v < f.as2_p5 || v > f.as2_p95) {
      q.stage = 'scale'; res.asked.push(q.id + ' scale'); const a = asker.ask(Object.assign(q, { default: 'scale' }));
      if (a.choice === 'translated') return { v, why: `outside AS2 ${f.as2_p5}..${f.as2_p95}, translated kept (${a.how})` };
      if (a.choice === 'donor') return { keep: true, why: `outside AS2 ${f.as2_p5}..${f.as2_p95}, donor kept (${a.how})` };
      return { v: alt, why: `outside AS2 ${f.as2_p5}..${f.as2_p95}: ${nice(key, v)} -> ${nice(key, alt)} on the AS2 scale (${a.how})` };
    }
    return { v, why };
  };
  const put = (key, goh, f, parent, tkey, donorVal) => {
    if (goh == null) { res.skipped.push(key + ' (rep has none)'); return; }
    const d = decide(key, goh, f, { donor: donorVal });
    if (d.keep) { res.skipped.push(key + ': ' + d.why); return; }
    const val = nice(key, d.v), r = setKey(text, parent, tkey, val);
    if (!r) { res.skipped.push(key + ': donor has no ' + (parent || 'game_entity') + ' block'); ctx.add('WARN_XLATE_NO_SLOT', `${key}: donor has no {${parent || 'game_entity'}} block to write {${tkey} ${val}}; not written [I]`); return; }
    text = r.text; res.wrote.push({ key, goh, value: val, donor: r.old, mode: f.mode, note: d.why, added: r.added });
  };
  put('speed', k.speed, F.speed, 'Locomotion', 'MaxSpeed');
  put('turn_time', k.turn_time, F.turn_time, 'Locomotion', 'TurnTime');
  put('start_time', k.start_time, F.start_time, 'Locomotion', 'StartTime');
  put('mass', k.mass, F.mass, null, 'mass');
  if (k.fuel != null && findBlock(text, 'fuelbag')) put('fuel', k.fuel, F.fuel, 'fuelbag', 'volume'); else if (k.fuel != null) res.skipped.push('fuel: donor has no fuelbag block');
  // ---- armour: macro args turret(...) body(...) of the donor's armor_<class> call. The rep's class macro replaces the donor's (DF_ARMOUR fix).
  const gl3 = glRule(cls, ctx.repAll), ar = gl3 ? null : armourRule(k, F);
  res.armour = gl3 ? { rule: 'GL-3', volumes: gl3.vols, flags: gl3.r.flags, how: gl3.r.how } : { rule: 'old aggregate (fallback)', why: 'the rep has no volume with a thickness in its text' };
  res.skipped.push(gl3 ? `armour rule: GL-3 (${gl3.vols} volumes of the rep)` : 'armour rule: OLD AGGREGATE FALLBACK (the rep has no volumes)');   // shows in the --xlate-json record
  if (gl3) { for (const fl of gl3.r.flags) ctx.info('XLATE_ARMOUR_FLAG', fl); } else ctx.info('XLATE_ARMOUR_FALLBACK', 'armour: rep has no volumes, the old table-aggregate rule is used instead of the GL-3 rule [I]');
  const re = /\(\s*"(armor_(?:light|medium|heavy|super[a-z]*|small|tiny|mid|big))"([^)\r\n]*)\)/i;
  const am0 = /\(\s*"(armor_(?:light|medium|heavy|super[a-z]*|small|tiny|mid|big))"/i.exec(text);
  let am = null;
  if (am0) {   // balanced parens: the args are themselves turret(..) body(..)
    let d = 0, e = -1; for (let j = am0.index; j < text.length; j++) { const c = text[j]; if (c === '"') j = text.indexOf('"', j + 1); else if (c === '(') d++; else if (c === ')' && --d === 0) { e = j + 1; break; } if (j < 0) break; }
    if (e > 0) { am = [text.slice(am0.index, e), am0[1], text.slice(am0.index + am0[0].length, e - 1)]; am.index = am0.index; }
  }
  if (!am) res.skipped.push('armour: donor has no ("armor_<class>" turret() body()) call');
  else {
    let args = am[2], name = am[1];
    const repMac = /\(\s*"(armor_(?:light|medium|heavy|super[a-z]*|small|tiny|mid|big))"/i.exec(ctx.repAll);
    const want = repMac ? repMac[1].toLowerCase() : gcls === 'tank_light' ? 'armor_light' : gcls === 'tank_heavy' ? 'armor_heavy' : gcls === 'tank_medium' ? 'armor_medium' : name;
    if (want !== name.toLowerCase()) {
      const defd = [...ctx.vf.files.keys()].some(x => /^resource\/properties\/[^/]*\.(ext|inc)$/.test(x) && new RegExp('\\(define\\s+"' + want + '"').test(ctx.vfsLib.readRec(ctx.vf.files.get(x)).toString('latin1')));
      if (defd) { res.wrote.push({ key: 'armour_macro', goh: repMac ? repMac[1] : gcls, value: want, donor: name, mode: 'class', note: 'DF_ARMOUR fix: donor macro renamed to the rep class' }); name = want; }
      else res.skipped.push(`armour macro: ${want} is not defined in properties; ${name} kept`);
    }
    for (const part of ['body', 'turret']) {
      const pm = new RegExp('\\b' + part + '\\(([^)]*)\\)', 'i').exec(args), faces = gl3 ? (gl3.r[part] || {}) : ar.faces[part];
      if (!pm) { if (Object.keys(faces).length) res.skipped.push(`armour ${part}: donor macro has no ${part}() arg`); continue; }
      const dn = nums(pm[1]), outv = dn.slice(), n = dn.length;
      FACES.forEach((face, i) => {
        const fc = faces[face]; if (fc === undefined || fc === null) return;
        const slot = n >= 4 ? i : n === 2 ? (i === 0 ? 0 : i === 1 ? 1 : -1) : (i === 0 ? 0 : -1); if (slot < 0) return;
        if (gl3) {   // GL-3 value is already an AS2 area number (mode copy or class peer): no scale question, the table's AS2 range for armour is the XLATE-1 one that mixed engine volumes into body [V, see xlate-3.md]
          const how = gl3.r.how[part][face], v = Math.round(fc);
          if (!(v > 0)) return;
          outv[slot] = v; res.wrote.push({ key: `armor_${part}_${face}`, goh: how === 'mode' ? fc : null, value: v, donor: dn[slot], mode: how, note: `GL-3 rule (${how === 'mode' ? 'mode of the rep\'s ' + part + ' volumes' : 'class peer value'}) [T]` });
          return;
        }
        const f = F[fc.key], d = decide(fc.key, fc.goh, f, { donor: dn[slot] });
        if (d.keep) { res.skipped.push(fc.key + ': ' + d.why); return; }
        outv[slot] = Math.round(d.v); res.wrote.push({ key: fc.key, goh: fc.goh, value: Math.round(d.v), donor: dn[slot], mode: fc.mode, note: d.why });
      });
      args = args.replace(pm[0], part + '(' + outv.join(' ') + ')');
    }
    text = text.slice(0, am.index) + '("' + name + '"' + args + ')' + text.slice(am.index + am[0].length);
  }
  // ---- gun/turret limits (Q35)
  const gl = limitsOf(ctx.repAll);
  if (opt.dropLimits) {
    let n = 0; for (const nm of ['turret', 'gun_rot', 'gun', 'mgun', 'mgun1_rot', 'mgun_rot']) { const m = new RegExp('(\\{\\s*bone\\s+"' + nm + '"[^{}]*?)\\{\\s*limits[^}]*\\}\\s*', 'i').exec(text); if (m) { text = text.replace(m[0], m[1]); n++; } }
    res.wrote.push({ key: 'limits', value: 'removed', donor: n + ' blocks', mode: '--drop-limits', note: 'Q35: gun and turret limits removed (vanilla later) [T]' });
  } else {
    for (const [nm, vals] of gl) {
      if (!/turret|gun|mgun|mount/i.test(nm)) continue;
      const m = new RegExp('(\\{\\s*bone\\s+"' + nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^{}]*?)\\{\\s*limits((?:\\s+-?[\\d.]+)*)\\s*\\}', 'i').exec(text);
      if (!m) { res.skipped.push(`limits ${nm}: donor def has no {limits} on that bone`); continue; }
      const bt = ctx.types && ctx.types.get(nm), want = bt === 'socket' ? 1 : bt === 'revolute' ? 2 : null;
      if (want !== null && vals.length !== want) { res.skipped.push(`limits ${nm}: GoH has ${vals.length} value(s), the mdl bone (${bt}) takes ${want}`); continue; }
      if (want === null && !(vals.length === 1 || vals.length === 2)) continue;
      const nv = ' ' + vals.join(' '); if (nums(m[2]).join(' ') === vals.join(' ')) continue;
      text = text.replace(m[0], m[1] + '{limits' + nv + '}'); res.wrote.push({ key: 'limits ' + nm, goh: vals.join(' '), value: vals.join(' '), donor: nums(m[2]).join(' ') || 'none', mode: 'copy', note: 'Q35 gun/turret limit from the rep [T]' });
    }
  }
  // ---- crew (Q46, Q47)
  const rc = crewCount(ctx.repAll), dcrewSrc = text + (/\{\s*extension\s+"crew\.ext"/i.test(text) && ctx.vf.files.has(ctx.donorKey.slice(0, ctx.donorKey.lastIndexOf('/')) + '/crew.ext') ? ctx.vfsLib.readRec(ctx.vf.files.get(ctx.donorKey.slice(0, ctx.donorKey.lastIndexOf('/')) + '/crew.ext')).toString('latin1') : '');
  const dc = crewCount(dcrewSrc), peers = peerCrew(ctx.vf, ctx.vfsLib, dcls);
  const cm = /\(\s*"crew_(\d)_human(_extended)?"\s*\)/i.exec(text);
  res.crew = { rep: rc, donor: dc, peers };
  if (rc && rc !== dc) {
    if (cm && rc >= 2 && rc <= 4) {
      const n = rc > dc ? crewCap(rc, dc, !!cm[2], ctx.types) : rc;
      if (n < rc) ctx.add('WARN_PORT_CREW_CAPPED', `GoH crew ${rc}, but the mdl lacks the doors of crew_${rc}_human (${(MACRO_DOORS[`crew_${rc}_human${rc === 4 && cm[2] ? '_extended' : ''}`] || []).filter(d => !ctx.types.has(d)).join(', ')}): crew capped at ${n} (PORT-137) [I]`);
      const nn = `("crew_${n}_human${n === 4 && cm[2] ? '_extended' : ''}")`;
      if (n !== dc) { text = text.replace(cm[0], nn); res.wrote.push({ key: 'crew', goh: rc, value: n, donor: dc, mode: 'count', note: `crew macro ${cm[0]} -> ${nn} [T]` }); }
      else res.skipped.push(`crew: GoH ${rc}, capped to the donor's ${dc} (mdl doors)`);
    } else res.skipped.push(`crew: GoH ${rc}, donor ${dc}; donor crew sits in crew.ext or in single crew_human lines: not changed`);
  } else if (rc) res.wrote.push({ key: 'crew', goh: rc, value: dc, donor: dc, mode: 'same', note: 'count already equal' });
  if (peers && rc && (rc < peers.min || rc > peers.max)) ctx.add('WARN_XLATE_CREW_PEERS', `rep crew ${rc} is outside the ${dcls} peers in AS2 (${peers.min}..${peers.max}, median ${peers.p50}, ${peers.n} units) [I]`);
  const rseats = seatLines(ctx.repAll).length, ds = seatLines(text);
  if (ds.length > rseats) {
    const drop = ds.slice(rseats); let t2 = text;
    for (const d of drop.reverse()) { t2 = cutSeat(t2, d); res.listed.push('seat dropped: ' + d.txt.replace(/\s*\r?\n\s*/g, ' ')); }
    text = t2; ctx.add('WARN_XLATE_SEATS_DROPPED', `GoH layout wins (Q46/Q47): the rep has ${rseats} seat line(s), the donor ${ds.length}; dropped ${drop.length}: ${drop.map(d => d.txt.replace(/\s*\r?\n\s*/g, ' ')).reverse().join(' | ')} [I]`);
  }
  // C2d: places the port ends with (def + the donor folder's crew.ext); GoH crew above them is capped, and cards/squads must not ask for more
  {
    const ck = ctx.donorKey.slice(0, ctx.donorKey.lastIndexOf('/')) + '/crew.ext';
    const ce = /\{\s*extension\s+"crew\.ext"/i.test(text) && ctx.vf.files.has(ck) ? ctx.vfsLib.readRec(ctx.vf.files.get(ck)).toString('latin1') : '';
    const pl = crewPlaces(text + '\n' + ce); res.crew.places = pl.n;
    if (rc && pl.n && rc > pl.n) ctx.add('WARN_PORT_CREW_CAPPED', `GoH crew ${rc}, the port has ${pl.n} crew place(s)${pl.names.length ? ' (' + pl.names.join(', ') + ')' : ''}: crew is ${pl.n}; a card or squad with more crew fails "Link failed" and the extra man stays outside (MB-R13 staghound) [V]`);
  }
  // ---- listed, not translated
  for (const [kk, n] of listedKeys(ctx.repAll)) { res.listed.push(`${kk} x${n}`); }
  if (res.listed.length) ctx.add('WARN_XLATE_LISTED', `GoH keys listed, not translated (flaws, vaulting, hard plate): ${res.listed.join(', ')} [I]`);
  for (const w of res.wrote) ctx.info('XLATE_WRITE', `${w.key}: GoH ${w.goh === undefined ? '-' : w.goh} -> ${w.value} (donor ${w.donor === null ? 'none' : w.donor}; ${w.mode}; ${w.note}) [T]`);
  for (const s of res.skipped) ctx.info('XLATE_SKIP', s);
  res.text = text; return res;
}

// ---- static native check: every key path of the written def (macros and includes expanded through the vfs) must be held by at least one AS2 peer of the class
function nativeCheck(text, defKey, cls, vf, vfsLib) {
  const T = loadTable(), sdlx = require('../lib/sdlx'), xl = require('../xlate/xlate.js');
  const open = r => { if (r.kind !== 'virtual') return null; const e = vf.files.get(r.key.toLowerCase()) || vf.files.get(r.key); return e ? { buf: vfsLib.readRec(e), file: r.key, key: r.key } : null; };
  const fk = 'resource/' + defKey.replace(/^resource\//, '');
  const root = sdlx.read(Buffer.from(text, 'latin1'), { file: fk, key: fk, open, onError: () => {} }).root;
  const flat = xl.flatten(root), peers = T.classes[cls] && T.classes[cls].keys;
  if (!peers) return { checked: 0, misses: [], note: 'no class ' + cls };
  const misses = []; let n = 0;
  for (const p of Object.keys(flat)) { n++; const e = peers[p]; if (!e || !e.as2 || !(e.as2.units || e.as2.n)) misses.push(p); }
  return { checked: n, misses, cls };
}
function armourRead(text, defKey, vf, vfsLib) {   // the armour the written def gives, by the same reader the table was made with (xlate armorFaces)
  const sdlx = require('../lib/sdlx'), xl = require('../xlate/xlate.js');
  const open = r => { if (r.kind !== 'virtual') return null; const e = vf.files.get(r.key.toLowerCase()) || vf.files.get(r.key); return e ? { buf: vfsLib.readRec(e), file: r.key, key: r.key } : null; };
  const fk = 'resource/' + defKey.replace(/^resource\//, '');
  const root = sdlx.read(Buffer.from(text, 'latin1'), { file: fk, key: fk, open, onError: () => {} }).root;
  // same reading as xlate.js armorFaces (not exported there): per-volume plates, then an armor/setting area replaces the matching volumes' values; max and median per face
  const { armorOf } = require('../statsheet/statsheet.js'), ix = require('../entityindex/index');
  const top = ix.kids(root).find(b => /^(game_)?entity$/i.test(ix.nameOf(b) || '')) || root, { volumes, areas } = armorOf(top);
  // XLATE-3 fix [V, see xlate-3.md]: the old reader (xlate.js armorFaces) pooled `engine*` (and mantlet/cupola) volumes into body/turret. The default tank volume set has an `engine`
  // volume in every def and most defs have no body* volume at all (their hull is only the area), so body was read from the engine area (pz1b, pz6e, m5a1).
  // Now: the part's OWN area (name or volumes pattern body*|hull* / turret*) gives the four faces; only if there is none, the part's own volumes (same prefix).
  const out = {};
  for (const part of ['body', 'turret']) {
    const re = part === 'body' ? /^(body|hull)/i : /^turret/i;
    const a = areas.find(x => x.t && (re.test(x.name) || x.pats.some(p => re.test(p))));
    for (const f of FACES) {
      let x = a ? a.t[f] : null;
      if (!a) { const l = volumes.filter(v => re.test(v.name)).map(v => f === 'side' ? Math.max(v.sides.left, v.sides.right) : v.sides[f]).filter(n => n > 0); x = l.length ? Math.max(...l) : null; }
      if (x > 0) out[`armor_${part}_${f}`] = x;
    }
  }
  return out;
}
// COV-C40 target selectors (AI-02): as64 picks a selector by {targetSelector "<type>"} = a {type} in /set/target/select.set
// no match = null selector = the actor senses foes but ranks none (no auto target, silent).
// AS2 vanilla types (gamelogic.pak set/target/*.inc, as64-3 the same 2026-11-09); GoH-only types mapped by family [I] (kept = no selector).
const AS2_TARGET_TYPES = ['cannon_shell', 'moto', 'cannon_rocket', 'cannon_bullet', 'tank', 'tank_bullet', 'searchlight'];
const TARGET_SEL_MAP = {
  tank_heavy: 'tank', tank_medium: 'tank', tank_light: 'tank', tank_spg: 'tank',
  tank_zenite: 'tank_bullet', car_bullet: 'tank_bullet', airborne_bullet: 'tank_bullet',
  cannon_big: 'cannon_shell', cannon_small: 'cannon_shell', cannon_howitzer: 'cannon_shell', supergun: 'cannon_shell',
  cannon_aa: 'cannon_bullet', cannon_zenite: 'cannon_bullet', rocket: 'cannon_rocket',
};
// -> {text, changes:[{from,to}], unknown:[type]} ; types AS2 has and unit-tag selectors (human*) are left alone
function mapTargetSelector(text) {
  const changes = [], unknown = [];
  const out = String(text).replace(/(\{\s*targetSelector\s+")([^"]*)(")/gi, (m, a, ty, b) => {
    const lo = ty.toLowerCase();
    if (AS2_TARGET_TYPES.includes(lo) || /^human(_|$)/.test(lo)) return m;   // human*: AS2 selects humans by {unit "human" ..} tags, not by type
    if (TARGET_SEL_MAP[lo]) { changes.push({ from: ty, to: TARGET_SEL_MAP[lo] }); return a + TARGET_SEL_MAP[lo] + b; }
    unknown.push(ty); return m;
  });
  return { text: out, changes, unknown };
}
module.exports = { AS2_TARGET_TYPES, TARGET_SEL_MAP, mapTargetSelector, usable, pickClass, seatLines, cutSeat, crewPlaces, crewCap, translate, nativeCheck, armourRead, armourRule, glRule, repVolumes, makeAsker, qmap, predict, loadTable, blockEnd, findBlock, setKey, crewCount, classOfKey };
