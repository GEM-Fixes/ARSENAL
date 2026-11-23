// mcp robz group, readers (tools/mcp/tools/robz.js). Read-only: nothing here writes into a mod or the game. No IO at require time.
// RobZ Realism ships as paks (Workshop 1.30.x) or as loose files (a maintainer's 1.31.x tree), so every reader goes through
// source(dir): one view of a mod folder, keys = lower case paths from the mod root ('resource/set/x.set', 'localization/desc.lng').
//   modInfo(dir)              mod.info keys -> { name, desc, min, max, fileId, require[] } | null
//   describe(dir, where)      -> { dir, folder, where, name, version, min, max, mode, layout, paks, robz, companion } | null (no mod.info)
//   scan(gameDir)             every mod of <game>/mods and of the Workshop folder beside it, described
//   pick(ctx, g, args)        the RobZ install to read: args.mod, else the newest found (args.version narrows); refusal when none
//   source(dir)               -> { dir, has(key), get(key) Buffer|null, size(key), keys(prefix) [] }   loose files win over paks
//   defines(S)                -> Map name -> [{ file, line, params[], note }]   every (define "x" of resource/set + resource/properties
//   cards(S, G)               -> { rows: [{ id, side, kind, cost, level, charge, cp, score, fore, tags, content, group, button, sets[] }], sets[], errors }
//                             the buy cards of every unit set (set/multiplayer/units/*.set with a {units block), macros expanded (lib/sdlx)
//   presets(S, G)             -> [{ mode, id, unitMode, apply, cp, start, finish, growTime, limits }]   set/multiplayer/games/*.set, expanded
//   tiers(S)                  -> [{ tier, points }]   shell tier -> points of the tank damage counter (safeties/penetration_safety.inc)
//   compare(S, sub)           a sub-mod's files against RobZ -> { same[], replaced[], fresh, text[], defines[] }
//   notes(root)               refmods/robz/*.md cut at '## ' headings -> [{ file, head, text }]
// Author: Imperator_Aug (ARSENAL, ia-c8b8ca95)
'use strict';
const fs = require('fs'), path = require('path');
const U = require('../mod/util');
const pak = require('../../../lib/pak');

const APPID = '244450';   // Men of War: Assault Squad 2 on Steam (the Workshop folder name)
const SIDES = ['axis_minor', 'ger_ss', 'ger2', 'ger', 'rus_guard', 'rus', 'usa', 'eng', 'jap'];
const lc = s => String(s == null ? '' : s).toLowerCase();
const fwd = p => String(p).replace(/\\/g, '/');

// ---------- mod.info, installs ----------
function modInfo(dir) {
  let t; try { t = fs.readFileSync(path.join(dir, 'mod.info'), 'latin1'); } catch (e) { return null; }
  const out = { name: null, desc: null, min: null, max: null, fileId: null, require: [] };
  const re = /\{\s*"?([A-Za-z]+)"?\s+"((?:[^"\\]|\\.)*)"/g; let m;
  t = t.replace(/^\s*;.*$/gm, '');
  while ((m = re.exec(t))) {
    const k = lc(m[1]), v = Buffer.from(m[2], 'latin1').toString('utf8');
    if (k === 'name') out.name = v; else if (k === 'desc') out.desc = U.short(v, 240);
    else if (k === 'mingameversion') out.min = v; else if (k === 'maxgameversion') out.max = v;
    else if (k === 'fileid') out.fileId = v; else if (k === 'require') out.require.push(v);
  }
  return out;
}
const verOf = s => { const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(String(s || '')); return m ? m[0] : null; };
const verCmp = (a, b) => { const x = String(a || '0').split('.').map(Number), y = String(b || '0').split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
// modern (Enhanced on AS64) = MinGameVersion >= 3.301 (VFS-48); anything else is a legacy mod (Classic on AS64, native on the 32-bit game)
const modeOf = i => (i && parseFloat(i.min) >= 3.301 ? 'enhanced' : 'classic');
function describe(dir, where) {
  const i = modInfo(dir); if (!i) return null;
  const ls = d => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return []; } };
  const res = ls(path.join(dir, 'resource')), paks = res.filter(e => /\.pak$/i.test(e.name)).map(e => e.name), loose = res.filter(e => e.isDirectory()).map(e => e.name);
  const nm = i.name || '', robz = /rob\s*z/i.test(nm) && /realism/i.test(nm) && !/\bfor\b|compatible|patch|add-?on|sub-?mod/i.test(nm);
  return { dir, folder: path.basename(dir), where, name: nm, version: verOf(nm) || verOf(path.basename(dir)), min: i.min, max: i.max, mode: modeOf(i), fileId: i.fileId, require: i.require,
    layout: paks.length && loose.length ? 'paks + loose files' : paks.length ? 'paks' : loose.length ? 'loose files' : 'no resource folder', paks, robz,
    companion: !robz && /rob\s*z/i.test(nm + ' ' + (i.desc || '') + ' ' + i.require.join(' ')) };
}
function scan(gameDir) {
  const out = [], dirs = [[path.join(gameDir, 'mods'), 'mods'], [path.resolve(gameDir, '..', '..', 'workshop', 'content', APPID), 'workshop']];
  for (const [d, where] of dirs) {
    let ns = []; try { ns = fs.readdirSync(d); } catch (e) { continue; }
    for (const n of ns) { const x = U.isDir(path.join(d, n)) ? describe(path.join(d, n), where) : null; if (x) out.push(x); }
  }
  return out;
}
function pick(ctx, g, args) {
  if (args && args.mod) {
    const d = U.dirArg(ctx, args.mod, 'mod'), x = describe(d, 'given');
    if (!x) throw ctx.refusal('no mod.info in ' + fwd(d) + ': that is not a mod folder');
    return x;
  }
  const all = scan(U.need(ctx, g)).filter(x => x.robz), want = args && args.version ? String(args.version) : '';
  const hit = (want ? all.filter(x => String(x.version || '').startsWith(want)) : all).sort((a, b) => verCmp(b.version, a.version) || (a.where === 'mods' ? -1 : 1));
  if (!hit.length) throw ctx.refusal('no RobZ Realism install' + (want ? ' of version ' + want : '') + ' was found in <game>/mods or in the Workshop folder' + (all.length ? ' (found: ' + all.map(x => x.version).join(', ') + ')' : '') + '. Pass mod with the full path of the RobZ folder');
  return hit[0];
}

// ---------- one view of a mod folder ----------
const SRC = new Map();
function source(dir) {
  dir = path.resolve(dir);
  let stamp = ''; try { stamp = String(fs.statSync(path.join(dir, 'resource')).mtimeMs); } catch (e) { stamp = ''; }
  const k = lc(dir), c = SRC.get(k);
  if (c && c.stamp === stamp) return c.S;
  let pk = null;
  const paks = () => {
    if (pk) return pk; pk = new Map();
    let ns = []; try { ns = fs.readdirSync(path.join(dir, 'resource')).filter(n => /\.pak$/i.test(n)).sort(); } catch (e) { ns = []; }
    for (const n of ns) { let L; try { L = pak.list(path.join(dir, 'resource', n)); } catch (e) { continue; } for (const ent of L) if (!ent.name.endsWith('/')) pk.set('resource/' + lc(ent.name), { L, ent }); }
    return pk;
  };
  const abs = key => path.join(dir, key);
  const walks = new Map();
  function walk(prefix) {
    if (walks.has(prefix)) return walks.get(prefix);
    const out = [], go = (d, rel) => {
      let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
      for (const e of es) { if (e.isDirectory()) { if (!e.name.startsWith('.')) go(path.join(d, e.name), rel + lc(e.name) + '/'); } else if (!/\.pak$/i.test(e.name)) out.push(rel + lc(e.name)); }
    };
    go(abs(prefix), prefix.endsWith('/') ? prefix : prefix + '/');
    walks.set(prefix, out); return out;
  }
  const S = {
    dir,
    has: key => U.isFile(abs(key)) || paks().has(key),
    size(key) { try { const s = fs.statSync(abs(key)); if (s.isFile()) return s.size; } catch (e) { /* in a pak */ } const p = paks().get(key); return p ? p.ent.size : -1; },
    get(key) {
      try { if (U.isFile(abs(key))) return fs.readFileSync(abs(key)); } catch (e) { return null; }
      const p = paks().get(key); if (!p) return null;
      try { return pak.read(p.L, p.ent); } catch (e) { return null; }
    },
    keys(prefix) { const set = new Set(walk(prefix)); for (const key of paks().keys()) if (key.startsWith(prefix)) set.add(key); return [...set].sort(); },
    memo: new Map(),
  };
  SRC.set(k, { stamp, S });
  if (SRC.size > 6) SRC.delete(SRC.keys().next().value);
  return S;
}
const memo = (S, name, make) => { if (!S.memo.has(name)) S.memo.set(name, make()); return S.memo.get(name); };
const TEXT = /\.(set|inc|ext|def|presets|pattern|ammo|weapon|accuracy)$|\/[^./]+$/;
const text = (S, key) => { const b = S.get(key); return b && b.length < 4e6 ? b.toString('latin1') : ''; };

// ---------- macros ----------
function scanDefines(S, prefixes, into) {
  for (const p of prefixes) for (const key of S.keys(p)) {
    if (!TEXT.test(key)) continue;
    const t = text(S, key); if (!t.includes('(define')) continue;
    const re = /\(define\s+"([^"]+)"/g; let m;
    while ((m = re.exec(t))) {
      let depth = 0, i = m.index, q = false; const end = Math.min(t.length, i + 30000);
      for (; i < end; i++) { const ch = t[i]; if (ch === '"') q = !q; else if (!q) { if (ch === '(') depth++; else if (ch === ')' && --depth === 0) break; } }
      const body = t.slice(m.index + m[0].length, i), params = [...new Set((body.match(/%[A-Za-z_][A-Za-z0-9_]*/g) || []).map(x => x.slice(1)))];
      const before = t.slice(Math.max(0, m.index - 1500), m.index).split(/\r?\n/).filter(l => l.trim()), cm = [];
      for (let j = before.length - 1; j >= 0 && /^\s*;/.test(before[j]); j--) cm.unshift(before[j].replace(/^\s*;+\s*/, ''));
      const note = (cm.find(l => lc(l).startsWith(lc(m[1]) + ':')) || cm[0] || '').replace(/[^\x20-\x7e]+/g, ' ').trim();
      const row = { file: key, line: t.slice(0, m.index).split('\n').length, params, note: U.short(note, 200) };
      if (!into.has(m[1])) into.set(m[1], []);
      into.get(m[1]).push(row);
    }
  }
  return into;
}
const defines = S => memo(S, 'defines', () => scanDefines(S, ['resource/set/', 'resource/properties/'], new Map()));

// ---------- expanded reads (lib/sdlx) ----------
function expand(S, G, key) {
  const sdlx = require('../../../lib/sdlx'), errs = [];
  const get = k => S.get(k) || (G ? G.get(k) : null);
  const buf = get(key); if (!buf) return null;
  const open = r => { if (r.kind === 'fs' || r.kind === 'user') return null; const b = get(r.key); return b ? { buf: b, file: r.key, key: r.key } : null; };
  let r = null;
  try { r = sdlx.read(buf, { file: key, key, open, onError: (file, line, code, msg) => { if (errs.length < 50) errs.push({ code, file, line, msg: U.short(msg, 160) }); } }); }
  catch (e) { errs.push({ code: 'READER_THROW', file: key, line: 0, msg: String(e && e.message) }); }
  return { root: r && r.root, errs };
}
const val = n => (n.k === 'STRING' ? (n.value != null ? n.value : n.text) : n.text);
const kids = b => { const out = []; for (const it of b.items) { if (it.k === 'MOD') out.push(...kids(it)); else out.push(it); } return out; };
const nameOf = b => { const k = kids(b); return k.length && k[0].k !== 'BLOCK' ? val(k[0]) : ''; };
const blocks = b => kids(b).filter(x => x.k === 'BLOCK');
const child = (b, name) => blocks(b).find(x => lc(nameOf(x)) === lc(name));
const rest = b => kids(b).slice(1).filter(x => x.k !== 'BLOCK').map(val).join(' ').trim();
const deep = (b, pathNames) => { let x = b; for (const n of pathNames) { x = x && child(x, n); } return x || null; };
const num = s => { const n = parseFloat(s); return Number.isFinite(n) ? n : null; };

function cards(S, G) {
  return memo(S, 'cards', () => {
    const roots = S.keys('resource/set/multiplayer/units/').filter(k => /\/units\/[^/]+\.set$/.test(k) && /\{\s*units\b/.test(text(S, k).replace(/^\s*;.*$/gm, '')));
    const by = new Map(), sets = [], errors = [];
    for (const key of roots) {
      const x = expand(S, G, key); if (!x || !x.root) continue;
      const set = path.basename(key, '.set'), u = child(x.root, 'units'); if (!u) continue;
      let n = 0;
      for (const c of blocks(u)) {
        const id = nameOf(c); if (!id) continue;
        const f = {}; for (const b of blocks(c)) { const k = lc(nameOf(b)); if (k && f[k] === undefined) f[k] = rest(b); }
        if (f.cost === undefined && f.content === undefined) continue;   // an "extra" row (score and points of a unit that is not bought)
        const tags = lc(f.tags || ''), words = tags.split(/\s+/), side = SIDES.find(s => words.includes(s)) || (/mp\/([a-z0-9_]+)\//.exec(lc(f.content || '')) || [])[1] || '';
        const row = { id, side, kind: /\(/.test(f.content || '') ? 'vehicle' : /^\s*\*|,|:\d/.test(f.content || '') || /squad/.test(lc(f.button || '') + lc(f.group || '')) ? 'squad' : 'soldier',
          cost: num(f.cost), level: num(f.level), charge: num(f.charge), cp: num(f.cp), score: num(f.score), fore: num(f.fore), tags: f.tags || '', content: U.short(f.content || '', 220), group: f.group || '', button: f.button || '', sets: [set] };
        const k2 = lc(id) + '|' + row.cost + '|' + row.level, old = by.get(k2);
        if (old) { if (!old.sets.includes(set)) old.sets.push(set); } else by.set(k2, row);
        n++;
      }
      sets.push({ set, cards: n, errors: x.errs.length });
      for (const e of x.errs.slice(0, 5)) errors.push(Object.assign({ set }, e));
    }
    return { rows: [...by.values()], sets, errors };
  });
}

function presets(S, G) {
  return memo(S, 'presets', () => {
    const out = [];
    for (const key of S.keys('resource/set/multiplayer/games/').filter(k => /\/games\/[^/]+\.set$/.test(k))) {
      const x = expand(S, G, key); if (!x || !x.root) continue;
      const game = child(x.root, 'game'), ps = game && child(game, 'presets'); if (!ps) continue;
      const mode = path.basename(key, '.set'), settings = child(game, 'settings');
      for (const p of blocks(ps)) {
        const g1 = n => { const b = child(p, n); return b ? rest(b) : ''; }, com = child(p, 'common') || p;
        const res = deep(com, ['budgets', 'vehicle', 'resource']), r = n => { const b = res && child(res, n); return b ? num(rest(b)) : null; };
        const c1 = n => { const b = child(com, n); return b ? rest(b) : ''; };
        out.push({ mode, id: nameOf(p), unitMode: g1('unitMode'), apply: g1('apply'), cp: c1('commandPoints'), start: r('start'), finish: r('finish'), growTime: r('growTime'), period: r('period'), limits: U.short(c1('unitLimits'), 200),
          bots: !!(settings && child(settings, 'enableBots')) });
      }
    }
    return out;
  });
}

function tiers(S) {
  return memo(S, 'tiers', () => {
    const t = text(S, 'resource/set/interaction_entity/tank/safeties/penetration_safety.inc'), out = [], seen = new Set();
    let cur = null;
    for (const l of t.split(/\r?\n/)) {
      const a = /\bstuff\s+"([^"]+)"/.exec(l); if (a) cur = a[1];
      const b = /"(\d+)_dam_add"/.exec(l);
      if (b && cur && !seen.has(cur)) { seen.add(cur); out.push({ tier: cur, points: +b[1] }); }
    }

    return { rows: out, classes: S.keys('resource/set/interaction_entity/tank/').filter(k => /\/tank_[a-z]+\.inc$/.test(k)).map(k => path.basename(k, '.inc')) };
  });
}

// ---------- a sub-mod against RobZ ----------
function compare(S, sub) {
  const B = source(sub), same = [], replaced = [], textFiles = [], dups = [];
  const keys = B.keys('resource/').concat(B.keys('localization/'));
  let fresh = 0;
  for (const key of keys) {
    if (!S.has(key)) { fresh++; continue; }
    const a = S.size(key), b = B.size(key);
    let eq = a === b;
    if (eq && a <= 16e6) { const x = S.get(key), y = B.get(key); eq = !!(x && y && x.equals(y)); }
    (eq ? same : replaced).push({ file: key, size: b, robz: a });
    if (key.startsWith('localization/') && /\.lng$/.test(key)) textFiles.push(key);
  }
  const mine = scanDefines(B, ['resource/set/', 'resource/properties/', 'resource/entity/'], new Map()), theirs = defines(S);
  for (const [name, rows] of mine) {
    const r = theirs.get(name); if (!r) continue;
    const other = rows.filter(x => !r.some(y => y.file === x.file));   // a define of the same name in a file RobZ does not have
    if (other.length) dups.push({ name, file: other[0].file, line: other[0].line, robz: r[0].file + ':' + r[0].line });
  }
  return { files: keys.length, fresh, same, replaced, text: textFiles, defines: dups };
}

// ---------- the digest notes of the repo ----------
function notes(root) {
  const dir = path.join(root, 'refmods', 'robz'), out = [];
  let ns = []; try { ns = fs.readdirSync(dir).filter(n => /\.md$/i.test(n)).sort(); } catch (e) { return out; }
  for (const n of ns) {
    let t = ''; try { t = fs.readFileSync(path.join(dir, n), 'utf8'); } catch (e) { continue; }
    const parts = t.split(/^(?=##? )/m);
    for (const p of parts) { const head = (/^##? +(.*)$/m.exec(p) || [])[1] || n; if (p.trim()) out.push({ file: 'refmods/robz/' + n, head: head.trim(), text: p.trim() }); }
  }
  return out;
}

module.exports = { APPID, SIDES, modInfo, describe, scan, pick, source, defines, cards, presets, tiers, compare, notes, verOf, verCmp, modeOf, text, fwd, lc };
