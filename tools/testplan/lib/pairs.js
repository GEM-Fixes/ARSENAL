// Author: Imperator_Aug (ARSENAL, ia-2e719f80)
'use strict';
// testplan pairs (README "emit and pairs"): one edrun pair = a shooter, a foe, a distance and flags.
//   id(pair)                 -> 'P-' + 5 chars base32 (A-Z 2-7) of sha1(shooter|foe|dist|ammo|flags). pure
//   name(pair, kind?)        -> fo_<shooter>__<foe> | di_<unit>__<shooter> | cr_<shooter>__<foe> | ctl (a-z 0-9 _ only: edrun validate). pure
//   unique(pairs)            -> the same list, names made unique in it (_2, _3 ...). pure
//   describe(pair, units)    -> {id, name, text, shooter:{id,name,army,cls}, foe:{..}, dist, flags}. pure; units = statsheet units list or {id: unit}
//   lib(state)               -> {list(), get(name), save(name, pairs), remove(name)}: <state>/pairs/<name>.json. pure (fs only), state = dir or {dir}
//   suggest(stack, {shooter, foe?, cls?, crew?, cards?, weaponMm?, groupOf?, minOf?}) -> Promise of an edrun pair (+ id, note)
//        | {needsGame:true, why} (no game dir and no injected cards) | {refused:true, why} (goh) | {error, why}
//   check(stack, pairs, {rangeOf?, minOf?, layout?, validate?}) -> [{id, name, status, notes, warns}], no game started.
//        status: OK OUTOFRANGE TOOCLOSE BLOCKED CROWDED NOUNIT NOSPAWN (edrun preflight) | INVALID (edrun validate) | NORUN (goh)
// game data only through edrun/pack.js, edrun/preflight.js, edrun/mindist.js, edrun/edrun.js (layout, validate), required on first use.
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
// edrun.js:194 DIST (map units, 20 per metre). kept here so the pure calls need no edrun; suggest reads edrun's own when it loads
const DIST = { vehicle: 300, gun: 300, infantry: 30 };
const UNITS_PER_M = 20;
const FOE_VEH = 'gaz67b', FOE_INF = 'mp/ger/rifle';   // edrun/pack.js defaults
const HEAVY_MM = 75, HEAVY_FOE = 't34_0';             // a heavy gun gets an armoured foe [T: the 75 mm line is a guess]
const NOT_FLAGS = new Set(['name', 'id', 'shooter', 'foe', 'dist', 'ammo', 'kind', 'note', 'rows']);

function base32(buf, n) {
  let bits = 0, val = 0, out = '';
  for (const b of buf) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5 && out.length < n) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
    if (out.length >= n) break;
  }
  return out;
}
const stable = v => (Array.isArray(v) ? '[' + v.map(stable).join(',') + ']'
  : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => k + ':' + stable(v[k])).join(',') + '}' : JSON.stringify(v));
// every key that changes what the pair tests, sorted: class, crew, count, watch, control, task, ammoBox ...
function flagsOf(pair) {
  return Object.keys(pair || {}).filter(k => !NOT_FLAGS.has(k) && pair[k] !== undefined && pair[k] !== false && pair[k] !== null).sort()
    .map(k => k + '=' + stable(pair[k]));
}
function id(pair) {
  const p = pair || {};
  const s = [p.shooter || '', p.foe || '', p.dist === undefined || p.dist === null ? '' : p.dist, p.ammo || '', flagsOf(p).join(';')].join('|');
  return 'P-' + base32(crypto.createHash('sha1').update(s.toLowerCase()).digest(), 5);
}

const lc = s => String(s).toLowerCase().replace(/^mp\//, '').replace(/\(.*$/, '').replace(/\.\w+$/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'x';
function kindOf(pair, kind) {
  if (kind) return kind;
  if (pair.kind) return pair.kind;
  if (pair.control) return 'ctl';
  if (pair.task === 'aiuse') return 'cr';
  const m = /^(fo|di|cr|tk)_/.exec(String(pair.name || ''));
  return m ? m[1] : 'fo';
}
function name(pair, kind) {
  const p = pair || {}, k = kindOf(p, kind);
  if (k === 'ctl') return /^ctl\d*$/.test(String(p.name || '')) ? p.name : 'ctl';
  const s = lc(p.shooter || 'none'), f = lc(p.foe || 'none');
  let n = k === 'di' ? `di_${f}__${s}` : `${k}_${s}__${f}`;
  if (p.ammo) n += '_' + lc(p.ammo);
  return n;
}
function unique(pairs) {
  const seen = new Set();
  for (const p of pairs) {
    let n = p.name, k = 1;
    while (seen.has(n)) n = `${p.name}_${++k}`;
    p.name = n; seen.add(n);
  }
  return pairs;
}

function unitMap(units) {
  const m = new Map();
  if (!units) return m;
  const put = (k, u) => { if (k !== undefined && k !== null && k !== '') { const s = String(k).toLowerCase(); if (!m.has(s)) m.set(s, u); } };
  if (Array.isArray(units)) for (const u of units) { if (!u) continue; for (const k of [u.id, u.entity, u.key, u.breed, u.card, u.unit]) put(k, u); }
  else for (const k of Object.keys(units)) put(k, units[k]);
  return m;
}
function side(def, um, cls) {
  const u = def ? um.get(String(def).toLowerCase()) || um.get(String(def).toLowerCase().split('/').pop()) : null;
  const nm = u && (u.title || u.display || u.gameName || u.label || (u.name !== def ? u.name : null));
  return { id: def || null, name: nm || null, army: (u && u.army) || (/^mp\/([a-z0-9]+)\//.exec(String(def || '')) || [])[1] || null, cls: (u && (u.cls || u.class)) || cls || null };
}
const said = s => (s.name ? `${s.name} (${s.id})` : String(s.id));
function describe(pair, units) {
  const p = pair || {}, um = unitMap(units), k = kindOf(p);
  const foeCls = p.foeClass || (p.foe && String(p.foe).includes('/') ? 'infantry' : 'vehicle');
  const shooter = side(p.shooter, um, p.class), foe = side(p.foe, um, foeCls);
  const dist = p.dist !== undefined && p.dist !== null ? +p.dist : DIST[p.class] || null;
  const m = dist === null ? null : +(dist / UNITS_PER_M).toFixed(1);
  const flags = [];
  if (p.control) flags.push('control');
  if (p.task) flags.push('task ' + p.task);
  if (p.watch) flags.push('watch');
  if (p.ammo) flags.push('ammo ' + p.ammo);
  if (p.count) flags.push('count ' + p.count);
  for (const f of ['rear', 'free', 'freeFire', 'foeFire', 'noorder', 'once', 'isolate', 'never', 'static']) if (p[f]) flags.push(f);
  if (p.mark) flags.push('mark ' + p.mark);
  const n = p.count && p.count > 1 ? `${p.count} x ` : '';
  let text;
  if (!p.foe) text = `${n}${said(shooter)}: ${p.task || (p.move ? 'move' : 'no foe')}`;
  else if (k === 'cr') text = `${said(shooter)} is crewed by the game and left to fire at ${said(foe)}`;
  else text = `${n}${said(shooter)} fires at ${said(foe)}`;
  if (p.foe && m !== null) text += ` from ${m} m`;
  if (p.ammo) text += ` with ${p.ammo}`;
  return { id: id(p), name: p.name || name(p), text, shooter, foe, dist, flags };
}

// ---- library: <state>/pairs/<name>.json
function lib(state) {
  const base = typeof state === 'string' ? state : state && state.dir;
  if (!base) throw new Error('pairs.lib: a state dir is needed');
  const dir = path.join(base, 'pairs');
  const fileOf = n => {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.\-]{0,63}$/.test(String(n || '')) || /\.\./.test(n)) throw new Error(`pairs.lib: name "${n}" must be letters, digits, _ . - (64 at most)`);
    return path.join(dir, n + '.json');
  };
  const readOf = f => { try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return Array.isArray(j) ? j : null; } catch (e) { return null; } };
  return {
    dir,
    list() {
      let names = [];
      try { names = fs.readdirSync(dir).filter(n => /\.json$/i.test(n)); } catch (e) { return []; }
      return names.sort().map(n => {
        const f = path.join(dir, n), ps = readOf(f);
        let mtimeMs = 0; try { mtimeMs = fs.statSync(f).mtimeMs; } catch (e) { /* gone */ }
        return { name: n.replace(/\.json$/i, ''), count: ps ? ps.length : 0, bad: !ps, mtimeMs, ids: ps ? ps.map(p => p.id || id(p)) : [] };
      });
    },
    get(n) { return readOf(fileOf(n)); },
    save(n, pairs) {
      const f = fileOf(n);
      if (!Array.isArray(pairs) || !pairs.length) throw new Error('pairs.lib: save needs a non-empty pair list');
      const out = pairs.map(p => { if (!p || !p.shooter) throw new Error('pairs.lib: a pair needs a shooter'); const q = { ...p }; delete q.id; return { ...q, name: q.name || name(q), id: id(q) }; });
      unique(out);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(f, JSON.stringify(out, null, 1) + '\n');
      return { name: n, path: f, count: out.length, ids: out.map(p => p.id) };
    },
    remove(n) { const f = fileOf(n); if (!fs.existsSync(f)) return false; fs.unlinkSync(f); return true; },
  };
}

// ---- game data
const vfsExe = stack => (stack && stack.exe && stack.exe !== 'as64' ? stack.exe : undefined);
const isGoh = stack => !!stack && (stack.kind === 'goh' || stack.gid === 'goh' || stack.exe === 'goh');
function gohWhy() { try { return require('../../edrun/mindist.js').GOH_WHY.join(' (') + ')'; } catch (e) { return 'the GoH editor never starts the mission, so no edrun pair can run (modweb/testing/in-play-nopipe.md)'; } }
// cards of the stack: injected (tests, a caller that already has them) or read once per stack by edrun/pack.js
const cardCache = new Map();
function cardsOf(stack, opt = {}) {
  if (opt.cards) return { cards: opt.cards, weaponMm: opt.weaponMm || null, groupOf: opt.groupOf || null };
  if (!stack || !stack.gameDir) return null;
  const k = [stack.gameDir, (stack.mods || []).join(','), stack.exe || ''].join('|');
  if (!cardCache.has(k)) cardCache.set(k, require('../../edrun/pack.js').loadCards(stack.gameDir, stack.mods || [], vfsExe(stack)));
  return cardCache.get(k);
}

// edrun.js reads process.argv when it loads (--inst, --insts: a stderr line, exit 2 on a bad value). Load it with a neutral argv so the
// caller's own arguments are never read by it; null when it cannot load.
let edMod;
function edrunMod() {
  if (edMod !== undefined) return edMod;
  const argv = process.argv;
  try { process.argv = argv.slice(0, 2).concat(['--inst', '1']); edMod = require('../../edrun/edrun.js'); } catch (e) { edMod = null; } finally { process.argv = argv; }
  return edMod;
}

function suggest(stack, opt = {}) {
  return Promise.resolve().then(() => {
    const shooter = opt.shooter && String(opt.shooter);
    if (!shooter) return { error: 'noshooter', why: 'pairs.suggest needs a shooter' };
    if (isGoh(stack)) return { refused: true, why: gohWhy() };
    const got = cardsOf(stack, opt);
    if (!got) return { needsGame: true, why: 'no game dir: unit cards and weapon ranges cannot be read' };
    const pack = require('../../edrun/pack.js'), { cards } = got, notes = [];
    const cls = opt.cls === 'human' ? 'infantry' : opt.cls;
    const m = /^(.*?)(?:\(([a-z0-9]+)\))?$/.exec(shooter), repName = m[1], army = m[2];
    let pair = null;
    const card = !repName.includes('/') && pack.findCard(cards, repName, army);
    if (card) {
      const b = pack.buildPairs([{ name: repName, army, opts: {} }], cards, { noDi: true, control: true, groupOf: got.groupOf, weaponMm: got.weaponMm });
      const it = b.items.find(i => i.kind === 'fo');
      if (!it) return { error: 'nopair', why: (b.errs.filter(e => /^rep /.test(e))[0] || `no fire pair can be made for ${shooter}`) };
      pair = { ...it.pair };
    } else if (repName.includes('/') || cls === 'infantry') pair = { class: 'infantry', shooter: repName, count: 3, foe: FOE_INF };
    else if ((cls === 'vehicle' || cls === 'gun') && Array.isArray(opt.crew) && opt.crew.length) { pair = { class: cls, shooter: repName, crew: opt.crew.slice(), foe: FOE_VEH, foeCrew: [FOE_INF] }; notes.push('no card: crew as given'); }
    else return { error: 'nocard', why: `${shooter}: no card on this stack, so no crew is known (give cls and crew, or a breed path for a man)` };

    // foe: the caller's, else by class (pack), a heavy foe for a heavy gun
    const setFoe = (foe, why) => {
      const f = String(foe);
      delete pair.foeCrew; delete pair.foeClass; delete pair.mark;
      if (f.includes('/')) { pair.foe = f; return; }
      const fb = pack.baseName(f), fc = pack.findCard(cards, fb, null), crew = fb === FOE_VEH ? [FOE_INF] : fc && pack.crewOf(fc);
      pair.foe = fb;
      if (fc && !crew && pack.squadBreed(fc)) { pair.foe = pack.squadBreed(fc); return; }
      pair.foeCrew = crew || [FOE_INF];
      if (!crew) notes.push(`foe ${fb}: no card with a crew on this stack, ${FOE_INF} put in`);
      if (fc && fc.tags && fc.tags.includes('cannon')) pair.foeClass = 'gun';
      if (why) notes.push(why);
    };
    if (opt.foe) setFoe(opt.foe);
    else if (pair.class !== 'infantry' && pair.foe === FOE_VEH && got.weaponMm) {
      let mm = null; try { mm = got.weaponMm(repName); } catch (e) { mm = null; }
      if (mm !== null && mm >= HEAVY_MM) {
        const hc = pack.findCard(cards, HEAVY_FOE, null);
        if (hc && pack.crewOf(hc) && pack.baseName(repName).toLowerCase() !== HEAVY_FOE) setFoe(HEAVY_FOE, `${mm} mm gun: armoured foe ${HEAVY_FOE} instead of ${FOE_VEH} [T]`);
      }
    }
    // distance: edrun's class default as a number (so the id is stable), raised to the smallest distance the gun can point at the foe
    const dflt = (edrunMod() || {}).DIST || DIST;
    if (pair.dist === undefined) pair.dist = dflt[pair.class] || DIST[pair.class];
    if (pair.class !== 'infantry' && pair.foe) {
      let minOf = opt.minOf || null;
      if (!minOf && stack && stack.gameDir && !opt.cards) { try { minOf = require('../../edrun/mindist.js').makeMinReader(stack.gameDir, stack.mods || [], { exe: vfsExe(stack) }); } catch (e) { notes.push('smallest distance not read: ' + e.message); } }
      if (minOf) {
        let r = null; try { r = minOf(pair.shooter, pair.foe); } catch (e) { r = { unknown: e.message }; }
        if (r && r.min > 0) {
          let marg = 1.1; try { marg = require('../../edrun/preflight.js').MARGINAL || marg; } catch (e) { /* keep */ }
          const need = Math.ceil(r.min * marg);
          if (need > pair.dist) { notes.push(`distance raised from ${pair.dist} to ${need}: the gun cannot point at the foe nearer than ${Math.round(r.min)} units (TST-73, TST-74)`); pair.dist = need; }
        } else if (r && r.unknown) notes.push('smallest distance unknown: ' + r.unknown);
      } else notes.push('smallest distance not checked (no game data)');
    }
    pair.watch = true;
    delete pair.name;
    pair.name = name(pair, 'fo');
    const out = { name: pair.name, ...pair };
    out.id = id(out);
    if (notes.length) out.note = notes.join('; ');
    return out;
  });
}

function check(stack, pairs, opt = {}) {
  const list = Array.isArray(pairs) ? pairs : [];
  const row = (p, status, notes, warns) => ({ id: (p && p.id) || id(p || {}), name: p && p.name, status, notes: notes || [], warns: warns || [] });
  if (isGoh(stack)) return list.map(p => row(p, 'NORUN', [gohWhy()]));
  let ed = null, pf = null;
  if (!opt.layout || !opt.validate) ed = edrunMod();
  try { pf = require('../../edrun/preflight.js'); } catch (e) { pf = null; }
  const layout = opt.layout || (ed && ed.layout), validate = opt.validate || (ed && ed.validate), per = (ed && ed.MAX_PAIRS) || 8;
  if (!pf || !layout) return list.map(p => row(p, 'OK', [], ['preflight not available: nothing checked']));
  let rangeOf = opt.rangeOf || null; const common = [];
  if (!rangeOf && stack && stack.gameDir) { try { rangeOf = pf.makeRangeReader(stack.gameDir, stack.mods || [], { exe: vfsExe(stack) }); } catch (e) { common.push('weapon ranges not read: ' + e.message); } }
  if (!rangeOf) common.push('no game data: range and smallest distance not checked, only the form and the placements');
  const out = [];
  for (let at = 0; at < list.length; at += per) {
    const chunk = list.slice(at, at + per), bad = new Map();
    if (validate) {
      for (const e of validate(chunk, false, per) || []) {
        const m = /^pair (\d+) /.exec(e);
        if (m) { const p = chunk[+m[1]]; (bad.get(p) || bad.set(p, []).get(p)).push(e.replace(/^pair \d+ \([^)]*\): /, '')); }
        else common.push(e);
      }
    }
    const good = chunk.filter(p => !bad.has(p));
    let res = {};
    if (good.length) { try { res = pf.check(good, layout, { rangeOf, minOf: opt.minOf }); } catch (e) { common.push('preflight failed: ' + e.message); } }
    for (const p of chunk) {
      if (bad.has(p)) { out.push(row(p, 'INVALID', bad.get(p))); continue; }
      const r = res[p.name] || { status: 'OK', notes: [], warns: ['not checked'] };
      out.push({ ...row(p, r.status, r.notes, [...(r.warns || []), ...common]), ...(r.dist !== undefined ? { dist: r.dist } : {}) });
    }
  }
  return out;
}

module.exports = { id, name, unique, describe, suggest, check, lib, edrunMod, flagsOf, kindOf, cardsOf, isGoh, gohWhy, vfsExe, DIST, UNITS_PER_M, FOE_VEH, FOE_INF, HEAVY_MM, HEAVY_FOE };
