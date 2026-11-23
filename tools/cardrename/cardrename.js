#!/usr/bin/env node
// cardrename: renames MP buy-list cards of a mod to `<name>(<side>)` (hero-button cards start with `hero`) and their text keys with them.
//   rows LOC-02 LOC-03 LOC-04 LOC-11 LOC-21
// usage: node tools/cardrename/cardrename.js plan|apply <modDir> --game <dir> [--exe mowas_2|as64] [--out <folder>] [--map f.tsv] [--json f] [-q]
//        node tools/cardrename/cardrename.js verify <modDir> --game <dir> --out <folder> --overlay <scratch dir> [--exe ..]   (see verify.js)
//   plan  : writes only the rename map TSV (--map, default <out>/cardrename-map.tsv or ./cardrename-map.tsv)
//   apply : writes every changed file under --out with mod-relative paths (byte-preserving outside the renamed names) + the map.
//           The mod folder is never written.
// Engine facts this follows (source read, not run in game):
//   name text: : non-breed card -> GetUnitDescription(model = card name)
// registry units/<name>/desc (set/registry/unit.reg), then desc/entity/<name>; only when
//     both give nothing desc/squad/<name>. So a card named after a model keeps its name from desc/entity and is left alone; only cards
//     that resolve through desc/squad (or have no text at all and hold soldiers) are renamed, and the new name must not be a
//     registry unit, a desc/entity key or an entity model (it would then resolve there instead).
//   info: spawn button: card name loads as an entity -> info/entity/<info|name> + tech panel
//     else info/squad/<info|name>. Info dialog ( -> ): id = {info X}
//     if set else card name; title desc/squad/<id>, text info/squad/<id>. So a card whose name is an entity model is never renamed
//     (it would lose the tech panel); `{info old}` redirects in any card are rewritten with the keys; a card with {info X} keeps X.
//   macros: `{"%name(%side)" ..}` cards are renamed through their name(..) call argument; a macro naming the card `%name` alone
//     would need '(' inside a macro argument -> left. Other uses of the name in the macro body are caught by verify (re-expansion).
//   button picture: /interface/scene/unit_icon/<card name>, else the
//     stub: the old picture is copied to the new name (old file kept; map menus name pictures by {image <name>}, left as they are).
//   units files: LoadUnits reads one of <game type>/<game class>/common.set + its includes; a game units file
//     nothing includes is not loaded, so its mentions do not block. References in other loose files: whole quoted name -> renamed;
//     comments, path segments, files outside resource/, map {image x} -> left; anything else (bare token, inside a longer string,
//     unclassified use in a units file, mention in a loaded game file the mod does not override) -> the card is skipped.
//   keys case-insensitive (LOC-03, tag lower case), later duplicate wins (LOC-04); .lng includes expanded (LOC-21, lib/lnginc).
// Author: Imperator_Aug (ARSENAL, ia-36305f1c)
const fs = require('fs'), path = require('path');
const sdlset = require('../lib/sdlset');
const sdlx = require('../lib/sdlx');
const lnginc = require('../lib/lnginc');
const games = require('../lib/games');
const buylist = require('../lngsplit/buylist');
const { relPath } = require('../lib/report');

const lc = s => String(s).toLowerCase();
const ICON = 'resource/interface/scene/unit_icon/';
const LOC = 'resource/interface/text/', MLOC = 'resource/localization/', UNITS = 'resource/set/multiplayer/units/';
const NAME_RE = /^[a-z0-9_\-]+(\([a-z0-9_]+\))?$/;
const TEXT_EXT = new Set(['set', 'mi', 'lua', 'inc', 'info', 'ext', 'script', 'presets', 'mod', 'def', 'reg', 'scn', 'txt', 'lng', 'mgr', 'mmp', 'mis', 'sdl', 'cfg', 'ini', 'xml', '']);
const SKIP_DIRS = /^resource\/(entity|texture|sound|shader|music|video|properties|localization|interface\/text)\//;
const BIN_EXT = /\.(dds|tga|png|jpg|jpeg|bmp|ply|anm|wav|ogg|mp3|pak|zip|vol|ebm|avi|bik|ttf|psd|exe|dll|mo|cache|pso|vso|db|pdn|ms3d|mtl)$/i;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- file text helpers (latin1 = byte-preserving) ----------
function splitKeep(s) { const p = s.split(/(\r\n|\n)/), lines = [], eols = []; for (let i = 0; i < p.length; i += 2) { lines.push(p[i]); eols.push(p[i + 1] || ''); } return { lines, eols }; }
// first ';' (or '--' for lua) outside quotes; -1 if none.  string spans [[a,b]] (b = index of the closing quote)
function scanLine(L, lua) {
  const spans = []; let cmt = -1;
  for (let i = 0; i < L.length; i++) {
    const c = L[i];
    if (c === '"') { const a = i; i++; while (i < L.length && L[i] !== '"') i += L[i] === '\\' ? 2 : 1; spans.push([a, Math.min(i, L.length)]); continue; }
    if (!lua && c === ';') { cmt = i; break; }
    if (lua && c === '-' && L[i + 1] === '-') { cmt = i; break; }
  }
  return { spans, cmt };
}
// whole-token matches of any name in `names` (Set lower) in one lowercased line -> [{col, len, name}]
function tokens(l, names) {
  const out = [];
  for (const m of l.matchAll(/[a-z0-9_\-]+/g)) {
    const w = m[0], i = m.index, nx = l[i + w.length];
    if (nx === '(') { const p = /^\(([a-z0-9_]+)\)/.exec(l.slice(i + w.length)); if (p) { const full = w + p[0]; const after = l[i + full.length]; if (names.has(full) && !(after && /[a-z0-9_\-]/.test(after))) { out.push({ col: i, len: full.length, name: full }); continue; } } }
    if (names.has(w)) out.push({ col: i, len: w.length, name: w });
  }
  return out;
}

// ---------- localization: every leaf occurrence (not only the winner) ----------
function lngLeaves(buf, vpath, open, file) {
  const p = lnginc.parseLng(buf, vpath, { open, file });
  if (p.fatal || !p.root) return [];
  const prefix = lnginc.keyPrefix(vpath), out = [];
  const visit = (n, kp) => {
    if (!n.name) return;
    const key = kp + n.name;
    if (n.kids.length) return n.kids.forEach(c => visit(c, key + '/'));
    const ln = n.nameTok ? n.nameTok.line : n.line, o = p.origin[ln - 1] || { file, line: ln };
    const oo = n.open && p.origin[n.open.line - 1], oc = n.close && p.origin[n.close.line - 1];
    out.push({ lk: lc(key), key, leaf: n.name, txt: n.vals.filter(v => v.t === 's').map(v => v.v).join(''), file: o.file, line: o.line,
      single: !!(oo && oc && oo.file === o.file && oc.file === o.file && oo.line === o.line && oc.line === o.line) });
  };
  for (const t of p.root.kids) { if (!t.name) continue; if (lc(t.name) === 'tags') t.kids.forEach(c => visit(c, prefix)); else visit(t, prefix); }
  return out;
}
// effective text of a folder over the game: Map lowerKey -> [occurrences in load order]; last = winner (LOC-04)
function readTexts(src) {
  const eff = new Map();
  if (src.v) for (const k of src.v.files.keys()) if (k.startsWith(LOC) && k.endsWith('.lng')) eff.set(k.slice(LOC.length), { vk: k, mod: null });
  for (const [k, f] of src.local) if (k.startsWith(MLOC) && k.endsWith('.lng') && !k.includes('/_dropped/')) eff.set(k.slice(MLOC.length), { vk: LOC + k.slice(MLOC.length), mod: f });
  const open = vk => {
    const l = lc(vk);
    if (l.startsWith(LOC) && src.local.has(MLOC + l.slice(LOC.length))) { const f = src.local.get(MLOC + l.slice(LOC.length)); return { buf: fs.readFileSync(f), file: f }; }
    const b = src.readVfs(l); return b ? { buf: b, file: 'vfs:' + l } : null;
  };
  const keys = new Map();
  for (const [rel, e] of eff) {
    const buf = e.mod ? fs.readFileSync(e.mod) : src.readVfs(e.vk); if (!buf) continue;
    let ls; try { ls = lngLeaves(buf, rel, open, e.mod || 'vfs:' + e.vk); } catch (x) { continue; }
    for (const o of ls) { if (!keys.has(o.lk)) keys.set(o.lk, []); keys.get(o.lk).push(o); }
  }
  return keys;
}
// keys of the game's own .lng files (no mod): a mod part that drops one of them shows the raw key where vanilla uses it (LOC-01)
function gameTextKeys(src) {
  const s = new Set(); if (!src.v) return s;
  const open = vk => { const b = src.readVfs(lc(vk)); return b ? { buf: b, file: 'vfs:' + lc(vk) } : null; };
  for (const k of src.v.files.keys()) if (k.startsWith(LOC) && k.endsWith('.lng') && /^(desc|info).lng$/.test(k.slice(LOC.length))) { const b = src.readVfs(k); if (!b) continue; try { for (const o of lngLeaves(b, k.slice(LOC.length), open, 'vfs:' + k)) s.add(o.lk); } catch (x) {} }
  return s;
}
const textOf = (keys, k) => { const a = keys.get(lc(k)); return a && a.length ? a[a.length - 1].txt : null; };

// ---------- registry units/<name>/desc and entity model names ----------
function regUnits(src) {
  const s = new Set(), b = src.get('resource/set/registry/unit.reg');
  if (!b) return s;
  const r = sdlx.read(b, { file: 'unit.reg', key: 'resource/set/registry/unit.reg', open: src.open, onError: () => {} });
  const val = it => it ? (it.value !== undefined ? it.value : it.text) : null;
  const walk = (b, inU) => { for (const it of b.items || []) { if (it.k !== 'BLOCK') continue; const f = it.items[0]; const nm = f && lc(val(f) || '');
    if (!inU && nm === 'units') { walk(it, true); continue; }
    if (inU && nm && it.items.some(x => x.k === 'BLOCK' && x.items[0] && lc(val(x.items[0]) || '') === 'desc')) s.add(nm); } };
  walk(r.root, false);
  return s;
}
function entityNames(src) {
  const s = new Set();
  const add = k => { if (!k.startsWith('resource/entity/')) return; const parts = k.split('/'); for (let i = 2; i < parts.length - 1; i++) s.add(parts[i]); const b = parts[parts.length - 1], d = b.lastIndexOf('.'); s.add(d > 0 ? b.slice(0, d) : b); };
  if (src.v) for (const k of src.v.files.keys()) add(k);
  for (const k of src.local.keys()) add(k);
  return s;
}

// ---------- new name ----------
function newNameOf(lname, side, hero) {
  let base, m = /^(.*)\(([^()]+)\)$/.exec(lname);
  if (m) base = m[1];
  else {
    const st = side.split('_'), t = lname.split('_');
    base = lname;
    for (let i = 0; i + st.length <= t.length; i++) if (st.every((x, j) => t[i + j] === x)) { const r = [...t.slice(0, i), ...t.slice(i + st.length)].join('_'); if (r) base = r; break; }
  }
  if (hero && !base.startsWith('hero')) base = 'hero_' + base;
  return { base, name: `${base}(${side})` };
}

function plan(o) {
  const t0 = Date.now();
  const modDir = path.resolve(o.modDir);
  const exe = games.exeOf ? (games.exeOf(o.exe) || undefined) : o.exe;
  const bl = buylist.read({ modDir, gameDir: o.gameDir, exe });
  const src = sdlset.createSource({ gameDir: o.gameDir, folder: modDir, exe });
  const keys = readTexts(src), gameKeys = gameTextKeys(src), reg = regUnits(src), ents = entityNames(src);
  const localOf = key => { const k = lc(key); return src.winner(k) === 'local' ? src.local.get(k) : null; };
  const relOf = f => relPath(modDir, f);
  const fileCache = new Map();
  const fileLines = f => { if (!fileCache.has(f)) { const s = fs.readFileSync(f).toString('latin1'); fileCache.set(f, splitKeep(s)); } return fileCache.get(f); };

  // ---- cards: live (with also) + commented, grouped by lower name ----
  const groups = new Map();
  for (const c of bl.cards) { if (c.kind === 'soldier') continue; groups.set(c.lname, { lname: c.lname, card: c, sites: [c, ...c.also].map(a => ({ where: a.where, commented: false })), commented: [] }); }
  for (const c of bl.commented) {
    if (!groups.has(c.lname)) groups.set(c.lname, { lname: c.lname, card: c, sites: [], commented: [], onlyCommented: true });
    const g = groups.get(c.lname); g.sites.push({ where: c.where, commented: true }); g.commented.push(c);
  }
  const allNames = new Set([...bl.cards, ...bl.commented].map(c => c.lname));
  const rows = [];
  for (const g of groups.values()) {
    const c = g.card, ln = g.lname;
    const hero = [c, ...(c.also || []), ...g.commented].some(a => a.button === 'hero');
    const side = c.side;
    const r = { old: c.name, lname: ln, side: side || '', button: [...new Set([c, ...(c.also || [])].map(a => a.button).filter(Boolean))].join(',') || (c.button || ''), kind: c.kind,
      hero, g, status: 'ok', reason: '', refs: {}, files: new Set(), edits: [], appends: [], deletes: [], inserts: [], where: c.where, info: c.info };
    rows.push(r);
    const desc = reg.has(ln) ? 'registry' : keys.has('desc/entity/' + ln) ? 'entity' : keys.has('desc/squad/' + ln) ? 'squad' : 'none';
    r.desc = desc;
    const skip = (st, why) => { r.status = st; r.reason = why; };
    const nn = side ? newNameOf(ln, side, hero) : null; if (nn) { r.new = nn.name; r.newBase = nn.base; }
    if (nn && c.name === nn.name) { skip('conforming', ''); continue; }
    if (nn && ln === nn.name) { skip('conforming', 'case only (card name ' + c.name + ' kept)'); continue; }
    if (desc === 'registry' || desc === 'entity') { r.heroModel = hero; skip('left', `name text from ${desc === 'registry' ? 'registry units/' + ln + '/desc' : 'desc/entity/' + ln} (model-named card)${hero ? '; hero button: a new name would no longer load the entity, so the info button would switch from info/entity + tech panel to info/squad' : ''}`); continue; }
    if (ents.has(ln)) { r.heroModel = hero; skip('left', 'card name is an entity model (spawn button and info dialog load it as a unit: info/entity + tech panel)'); continue; }
    if (!side) { skip('skipped', 'no side (no (side) suffix, no side tag)'); continue; }
    if (desc === 'none' && !g.onlyCommented && c.kind !== 'infantry' && c.kind !== 'vehicle_group') { skip('left', 'no name text and not a squad-type card'); continue; }
    if (desc === 'none' && g.onlyCommented) { skip('left', 'commented-out card with no desc/squad text'); continue; }
    if (!NAME_RE.test(ln)) { skip('skipped', 'name has characters outside [a-z0-9_-]'); continue; }
    if (reg.has(nn.name) || keys.has('desc/entity/' + nn.name) || ents.has(nn.name) || ents.has(nn.base)) { skip('skipped', `new name ${nn.name} is a model/registry name`); continue; }
    if (/^-|-$/.test(nn.base)) { skip('skipped', 'odd base'); continue; }
  }
  // collisions
  const cand = rows.filter(r => r.status === 'ok');
  const byNew = new Map();
  for (const r of cand) { if (!byNew.has(r.new)) byNew.set(r.new, []); byNew.get(r.new).push(r); }
  for (const [nn, rs] of byNew) {
    if (rs.length > 1) for (const r of rs) { r.status = 'skipped'; r.reason = 'collision: ' + rs.map(x => x.old).join(' + ') + ' -> ' + nn; }
    else if (allNames.has(nn)) { const r = rs[0]; r.status = 'skipped'; r.reason = `collision: card ${nn} already exists`; const other = rows.find(x => x.lname === nn); if (other) other.collide = r.old; }
  }

  // ---- definition sites ----
  const ok = () => rows.filter(r => r.status === 'ok');
  // units files the engine can load: LoadUnits reads one of <game type>.set, <game class>.set, common.set
  // what they include. Every mod units file counts; a game units file counts when it is a root (common*, units*) or some read includes it.
  const liveUnits = new Set();
  const readU = (k, get) => { try { src.read({ key: k, file: k, get }, () => {}); } catch (x) {} };
  for (const [k, f] of src.local) if (k.startsWith(UNITS) && /\.set$/.test(k)) { liveUnits.add(k); readU(k, () => fs.readFileSync(f)); }
  if (src.v) for (const k of src.v.files.keys()) if (!src.local.has(k) && /^resource\/set\/multiplayer\/units\/(common|units)[^/]*\.set$/.test(k)) { liveUnits.add(k); readU(k, () => src.readVfs(k)); }
  for (const k of src.included) if (k.startsWith(UNITS)) liveUnits.add(k);
  const defSites = new Map();   // file|line -> row
  for (const r of ok()) {
    for (const s of r.g.sites) {
      const f = localOf(s.where.file);
      if (!f && !liveUnits.has(lc(s.where.file))) continue;   // game units file no units root includes: not loaded
      if (!f) { r.status = 'skipped'; r.reason = `defined in ${s.where.file} that the mod does not override (game file)`; break; }
      const { lines } = fileLines(f), L = lines[s.where.line - 1] || '', l = lc(L);
      const { cmt } = scanLine(L, false);
      const lit = [...l.matchAll(new RegExp(`\\{\\s*"(${esc(r.lname)})"`, 'g'))].filter(m => s.commented ? m.index > cmt && cmt >= 0 : (cmt < 0 || m.index < cmt));
      if (lit.length === 1) { const col = lit[0].index + lit[0][0].indexOf('"') + 1; r.edits.push({ f, line: s.where.line, col, len: r.lname.length, to: r.new, kind: s.commented ? 'definition (commented)' : 'definition' }); defSites.set(f + '|' + s.where.line + '|' + col, r); continue; }
      const bm = /^(.*)\(([^()]+)\)$/.exec(r.lname);
      const ma = bm ? [...l.matchAll(new RegExp(`\\bname\\(\\s*(${esc(bm[1])})\\s*\\)`, 'g'))].filter(m => s.commented ? cmt >= 0 && m.index > cmt : (cmt < 0 || m.index < cmt)) : [];
      if (ma.length === 1 && lit.length === 0) { const col = ma[0].index + ma[0][0].indexOf(ma[0][1], 5); r.edits.push({ f, line: s.where.line, col, len: bm[1].length, to: r.newBase, kind: 'definition (macro name arg)' }); continue; }
      if (!bm && /\bname\(/.test(l)) { r.status = 'left'; r.reason = 'macro builds the card name from name(..) alone; the new name needs "(" inside a macro argument'; break; }
      r.status = 'skipped'; r.reason = `definition site not found at ${relOf(f)}:${s.where.line}`; break;
    }
  }

  // ---- references in the mod's loose files and in game files the mod does not override ----
  const names = new Set(ok().map(r => r.lname)), byL = new Map(ok().map(r => [r.lname, r]));
  const touchedKinds = new Map();
  const addRef = (r, kind, n = 1) => { r.refs[kind] = (r.refs[kind] || 0) + n; };
  const block = (r, why) => { if (r.status === 'ok') { r.status = 'skipped'; r.reason = why; } };
  // cards whose {info} names the card: an actor card would read info/entity
  for (const c of bl.cards) if (c.info && byL.has(c.info) && c.lname !== c.info && ents.has(c.lname)) block(byL.get(c.info), `{info ${c.info}} in entity-named card ${c.name}`);
  const scanFile = (text, rel, isMod, f) => {
    if (!names.size) return;
    const isUnits = rel.startsWith('units:'), lua = /\.lua$/i.test(rel);
    const { lines } = splitKeep(text);
    lines.forEach((L, i) => {
      const l = lc(L);
      const toks = tokens(l, names); if (!toks.length) return;
      const { spans, cmt } = scanLine(L, lua);
      for (const t of toks) {
        const r = byL.get(t.name); if (!r || r.status !== 'ok') continue;
        const pv = l[t.col - 1], nx = l[t.col + t.len];
        if (!isMod && rel.startsWith(UNITS) && !liveUnits.has(rel)) { addRef(r, 'game units file no units root includes (left)'); continue; }
        if (!isMod) { if (cmt >= 0 && t.col > cmt) continue; if (pv === '/' || pv === '.' || nx === '/' || nx === '.') continue; block(r, `referenced by game file ${rel}:${i + 1} that the mod does not override`); continue; }
        const disp = rel.replace(/^units:/, '');
        if (f && defSites.has(f + '|' + (i + 1) + '|' + t.col)) continue;   // definition, already an edit
        if (isUnits && /^\s*;*\s*\{\s*"$/.test(l.slice(0, t.col)) && l[t.col + t.len] === '"') { r.edits.push({ f, line: i + 1, col: t.col, len: t.len, to: r.new, kind: (cmt >= 0 && t.col > cmt ? 'commented ' : '') + 'definition the buy-list reader does not list' }); continue; }
        if (!/^resource\//.test(disp)) { addRef(r, 'not game data (left)'); continue; }
        if (cmt >= 0 && t.col > cmt) { addRef(r, 'comment (left)'); continue; }
        if (pv === '/' || pv === '.' || nx === '/' || nx === '.' || pv === '\\' || nx === '\\') { addRef(r, 'path segment (left)'); continue; }
        const sp = spans.find(s => t.col > s[0] && t.col < s[1]);
        if (isUnits) {
          if (/\{\s*info\s+"?$/.test(l.slice(0, t.col)) && (!sp || (sp[0] === t.col - 1 && sp[1] === t.col + t.len))) { r.edits.push({ f, line: i + 1, col: t.col, len: t.len, to: sp || !r.new.includes('(') ? r.new : '"' + r.new + '"', kind: 'info redirect' }); continue; }
          block(r, `unclassified use in units file ${disp}:${i + 1}`); continue;
        }
        const area = disp.split('/').slice(1, /^resource\/(set|map)\//.test(disp) ? 3 : 2).join('/');
        if (sp) {
          if (sp[0] === t.col - 1 && sp[1] === t.col + t.len) { r.edits.push({ f, line: i + 1, col: t.col, len: t.len, to: r.new, kind: 'quoted name in ' + area }); continue; }
          block(r, `inside a longer string at ${disp}:${i + 1}`); continue;
        }
        if (/\{\s*image\s+$/.test(l.slice(0, t.col))) { addRef(r, 'map menu {image} name (left; the icon file stays)'); continue; }
        block(r, `bare token at ${disp}:${i + 1}`);
      }
    });
  };
  let scanned = 0, vscanned = 0;
  for (const [k, f] of src.local) {
    if (k.startsWith(MLOC) || SKIP_DIRS.test(k) || BIN_EXT.test(k)) continue;
    let st; try { st = fs.statSync(f); } catch { continue; } if (st.size > 8e6) continue;
    const isUnits = k.startsWith(UNITS);
    scanFile(fs.readFileSync(f).toString('latin1'), (isUnits ? 'units:' : '') + relOf(f), true, f); scanned++;
  }
  if (src.v) for (const k of src.v.files.keys()) {
    if (src.local.has(k) || SKIP_DIRS.test(k) || BIN_EXT.test(k) || !k.startsWith('resource/')) continue;
    const ext = sdlset.extOf(k); if (!TEXT_EXT.has(ext)) continue;
    const b = src.readVfs(k); if (!b || b.length > 8e6 || (b.includes(0))) continue;
    scanFile(b.toString('latin1'), k, false, null); vscanned++;
  }

  // ---- text keys ----
  const modFile = f => typeof f === 'string' && !f.startsWith('vfs:') && path.resolve(f).toLowerCase().startsWith(modDir.toLowerCase() + path.sep);
  const isVanillaPart = f => /(^|\/)vanilla\//i.test(relOf(f).replace(/^localization\//i, ''));
  // mod part for a key that sits in a vanilla part: a mod file (not vanilla/, not a .lng parent) whose every leaf is in that group.
  // Preference: same path with mod/ for vanilla/, then .../<side>/<button>.inc, hero/<side>.inc, any path naming the side, any.
  const fileGroups = new Map();
  for (const occ of keys.values()) for (const o of occ) { if (!modFile(o.file)) continue; const par = o.lk.slice(0, o.lk.length - o.leaf.length - 1); if (!fileGroups.has(o.file)) fileGroups.set(o.file, new Set()); fileGroups.get(o.file).add(par); }
  const modPartFor = (group, r, same) => {
    const c = [...fileGroups].filter(([f, s]) => s.size === 1 && s.has(group) && !isVanillaPart(f) && !/\.lng$/i.test(f)).map(([f]) => [f, lc(relOf(f))]).sort((a, b) => a[1] < b[1] ? -1 : 1);
    const btn = (r.button || '').split(',')[0];
    const tests = [x => x === lc(same), x => x.endsWith(`/${r.side}/${btn}.inc`), x => r.hero && x.endsWith(`/hero/${r.side}.inc`), x => x.includes(`/${r.side}/`) || x.endsWith(`/${r.side}.inc`), () => true];
    for (const t of tests) { const h = c.find(([, x]) => t(x)); if (h) return h[0]; }
    return null;
  };
  for (const r of ok()) {
    const kinds = [['desc', true], ['info', true]];
    for (const [kk] of kinds) {
      const oldK = `${kk}/squad/${r.lname}`, newK = `${kk}/squad/${r.new}`;
      const occ = keys.get(oldK) || [];
      if (!occ.length) continue;
      const oldTxt = occ[occ.length - 1].txt, newTxt = textOf(keys, newK);
      const modOcc = occ.filter(x => modFile(x.file));
      if (modOcc.length < occ.length && !modOcc.length) { block(r, `${oldK} only in a game text file the mod does not override`); break; }
      if (newTxt !== null) {
        if (newTxt !== oldTxt) { block(r, `${newK} exists with other text`); break; }
        for (const x of modOcc) { if (isVanillaPart(x.file)) continue; if (!x.single) { block(r, `${oldK} at ${relOf(x.file)}:${x.line} is not a one-line key`); break; } r.deletes.push({ f: x.file, line: x.line }); addRef(r, kk + ' key dropped (new key has same text)'); }
        continue;
      }
      const inMod = modOcc.filter(x => !isVanillaPart(x.file));
      if (inMod.length) {
        for (const x of inMod) {
          const { lines } = fileLines(x.file), L = lines[x.line - 1] || '', l = lc(L);
          const ms = [...l.matchAll(new RegExp(`\\{\\s*("?)(${esc(r.lname)})\\1(?=[\\s{}"]|$)`, 'g'))];
          if (ms.length !== 1) { block(r, `${oldK} leaf not found on ${relOf(x.file)}:${x.line}`); break; }
          const q = ms[0][1] === '"', col = ms[0].index + ms[0][0].length - r.lname.length - (q ? 1 : 0);
          const to = q ? r.new : '"' + r.new + '"';
          // old key also in the game's own text file: keep the old line (a mod file replacing it must not drop it, LOC-01) and add the new one under it
          if (gameKeys.has(oldK)) { if (!x.single) { block(r, `${oldK} at ${relOf(x.file)}:${x.line} is not a one-line key`); break; } r.inserts.push({ f: x.file, line: x.line, text: L.slice(0, col) + to + L.slice(col + r.lname.length), kind: kk + ' key copied under the old (game text has the old key)' }); }
          else r.edits.push({ f: x.file, line: x.line, col, len: r.lname.length, to, kind: kk + ' key renamed' });
        }
      } else {
        const x = modOcc[modOcc.length - 1];
        if (!x.single) { block(r, `${oldK} at ${relOf(x.file)}:${x.line} is not a one-line key`); break; }
        const rel = relOf(x.file), mf = modPartFor(`${kk}/squad`, r, rel.replace(/(^|\/)vanilla\//i, '$1mod/'));
        if (!mf) { block(r, `${oldK} in vanilla part ${rel}; no mod part holding only ${kk}/squad keys to add ${newK}`); break; }
        const L = fileLines(x.file).lines[x.line - 1], l = lc(L);
        const ms = [...l.matchAll(new RegExp(`\\{\\s*("?)(${esc(r.lname)})\\1(?=[\\s{}"]|$)`, 'g'))];
        if (ms.length !== 1) { block(r, `${oldK} leaf not found on ${rel}:${x.line}`); break; }
        const q = ms[0][1] === '"', col = ms[0].index + ms[0][0].length - r.lname.length - (q ? 1 : 0);
        const nl = L.slice(0, q ? col : col) + (q ? r.new : '"' + r.new + '"') + L.slice(col + r.lname.length);
        r.appends.push({ f: mf, text: nl.trim(), from: rel + ':' + x.line, kind: kk + ' key added to mod part (old stays in vanilla part)' });
      }
    }
  }
  // ---- buy button picture: /interface/scene/unit_icon/<card name> ----
  // the old picture is copied to the new name (old file kept: map menus name it by {image}); stub stays stub
  const icons = new Map();
  for (const k of [...src.local.keys(), ...(src.v ? src.v.files.keys() : [])]) if (k.startsWith(ICON)) { const b = k.slice(ICON.length); if (b.includes('/')) continue; const base = b.replace(/\.[^.]*$/, ''); if (!icons.has(base)) icons.set(base, new Set()); icons.get(base).add(k); }
  for (const r of ok()) {
    const a = icons.get(r.lname), b = icons.get(r.new);
    if (b && !a) { block(r, `picture unit_icon/${r.new} exists, the card shows the stub picture today`); continue; }
    if (!a) continue;
    if (b) { const x = src.get([...a][0]), y = src.get([...b][0]); if (!x || !y || !x.equals(y)) block(r, `picture unit_icon/${r.new} exists with other bytes than unit_icon/${r.lname}`); continue; }
    r.copies = [...a].map(k => ({ rel: ICON + r.new + k.slice(ICON.length + r.lname.length), buf: src.get(k), from: k }));
  }
  // drop edits of non-ok rows; summarise
  for (const r of rows) {
    if (r.status !== 'ok') { r.edits = []; r.appends = []; r.deletes = []; r.copies = []; r.inserts = []; continue; }
    for (const a of r.inserts) { r.files.add(relOf(a.f)); addRef(r, a.kind); }
    for (const c of r.copies || []) { r.files.add(c.rel); addRef(r, 'button picture copied to the new name'); }
    for (const e of r.edits) { r.files.add(relOf(e.f)); addRef(r, e.kind); }
    for (const a of r.appends) { r.files.add(relOf(a.f)); addRef(r, a.kind); }
    for (const d of r.deletes) r.files.add(relOf(d.f));
  }
  for (const r of rows) for (const [k, n] of Object.entries(r.refs)) if (r.status === 'ok') touchedKinds.set(k, (touchedKinds.get(k) || 0) + n);
  if (src.v) require('../lib/vfs').closeRecs();
  return { rows, modDir, ms: Date.now() - t0, scanned, vscanned, kinds: touchedKinds, fileLines, relOf, buttons: bl.buttons };
}

// apply edits in memory -> Map rel -> Buffer
function build(p) {
  const per = new Map();
  const get = f => { if (!per.has(f)) { const { lines, eols } = p.fileLines(f); per.set(f, { lines: [...lines], eols: [...eols], edits: [], del: new Set(), app: [], ins: new Map() }); } return per.get(f); };
  for (const r of p.rows) {
    if (r.status !== 'ok') continue;
    for (const e of r.edits) get(e.f).edits.push(e);
    for (const d of r.deletes) get(d.f).del.add(d.line);
    for (const a of r.inserts || []) { const x = get(a.f); if (!x.ins.has(a.line)) x.ins.set(a.line, []); x.ins.get(a.line).push(a.text); }
    for (const a of r.appends) get(a.f).app.push(a);
  }
  const out = new Map();
  for (const [f, x] of per) {
    const byLine = new Map();
    for (const e of x.edits) { if (!byLine.has(e.line)) byLine.set(e.line, []); byLine.get(e.line).push(e); }
    for (const [ln, es] of byLine) {
      es.sort((a, b) => b.col - a.col);
      let L = x.lines[ln - 1];
      const seen = new Set();
      for (const e of es) { if (seen.has(e.col)) continue; seen.add(e.col); L = L.slice(0, e.col) + e.to + L.slice(e.col + e.len); }
      x.lines[ln - 1] = L;
    }
    let lines = [], eols = [];
    x.lines.forEach((L, i) => { if (!x.del.has(i + 1)) { lines.push(L); eols.push(x.eols[i]); } for (const t of x.ins.get(i + 1) || []) { if (!eols[eols.length - 1]) eols[eols.length - 1] = x.eols.find(Boolean) || '\r\n'; lines.push(t); eols.push(x.eols[i] || ''); } });
    if (x.app.length) {
      const eol = x.eols.find(Boolean) || '\r\n';
      if (lines.length && lines[lines.length - 1] === '' && eols[eols.length - 1] === '') { lines.pop(); eols.pop(); }
      if (eols.length && !eols[eols.length - 1]) eols[eols.length - 1] = eol;
      for (const a of x.app) { lines.push(a.text); eols.push(eol); }
    }
    out.set(p.relOf(f), Buffer.from(lines.map((L, i) => L + eols[i]).join(''), 'latin1'));
  }
  for (const r of p.rows) if (r.status === 'ok') for (const c of r.copies || []) if (c.buf) out.set(c.rel, c.buf);
  return out;
}

function mapTsv(p) {
  const head = ['old', 'new', 'side', 'button', 'kind', 'files', 'references', 'status', 'reason'];
  const rows = p.rows.slice().sort((a, b) => (a.where.file + a.where.line).localeCompare(b.where.file + b.where.line));
  const cell = s => String(s == null ? '' : s).replace(/[\t\r\n]/g, ' ');
  return [head.join('\t'), ...rows.map(r => [r.old, r.status === 'ok' ? r.new : (r.new || ''), r.side, r.button, r.kind + '/' + r.desc, [...r.files].join(' '),
    Object.entries(r.refs).map(([k, n]) => `${k}:${n}`).join('; '), r.status, r.reason + (r.collide ? `; target of ${r.collide}` : '')].map(cell).join('\t'))].join('\r\n') + '\r\n';
}

function summary(p) {
  const st = {}, why = {};
  for (const r of p.rows) { st[r.status] = (st[r.status] || 0) + 1; if (r.status === 'left' || r.status === 'skipped') { const k = r.status + ': ' + r.reason.replace(/ [^ ]*[\/:][^ ]*/g, ' X').replace(/\S+ \+ \S+ -> \S+/, 'A + B -> N').replace(/card \S+ already/, 'card N already'); why[k] = (why[k] || 0) + 1; } }
  return { cards: p.rows.length, status: st, reasons: why, kinds: Object.fromEntries(p.kinds), ms: p.ms, scanned: p.scanned, vscanned: p.vscanned };
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) { console.log('usage: node tools/cardrename/cardrename.js plan|apply <modDir> --game <dir> [--exe mowas_2|as64] [--out <folder>] [--map f.tsv] [--json f] [-q]\n       node tools/cardrename/cardrename.js verify <modDir> --game <dir> --out <folder> --overlay <scratch dir> [--exe ..]\nRenames MP buy-list cards of a mod to <name>(<side>) and their text keys with them. plan writes only the rename map; apply writes changed files under --out; the mod folder is never written.'); return 0; }
  const o = {}, pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--game') o.gameDir = argv[++i]; else if (a === '--exe') o.exe = argv[++i]; else if (a === '--out') o.out = argv[++i];
    else if (a === '--map') o.map = argv[++i]; else if (a === '--json') o.json = argv[++i]; else if (a === '--overlay') o.overlay = argv[++i];
    else if (a === '-q') o.q = true; else pos.push(a);
  }
  const [cmd, modDir] = pos;
  if (!['plan', 'apply', 'verify'].includes(cmd) || !modDir || (cmd !== 'plan' && !o.out)) {
    console.error('usage: node tools/cardrename/cardrename.js plan|apply <modDir> --game <dir> [--exe mowas_2|as64] [--out <folder>] [--map f.tsv] [--json f] [-q]\n       ... verify <modDir> --game <dir> --out <folder> --overlay <dir>');
    return 2;
  }
  if (o.exe) { const g = games.get(o.exe); if (!g) { console.error('--exe must be one of as64|mowas_2|mowas2'); return 2; } o.exe = g.exe; }
  o.modDir = modDir;
  if (cmd === 'verify') return require('./verify').run(o);
  if (o.out && path.resolve(o.out).toLowerCase().startsWith(path.resolve(modDir).toLowerCase())) { console.error('--out must be outside the mod folder'); return 2; }
  const p = plan(o);
  const mapFile = o.map || (o.out ? path.join(o.out, 'cardrename-map.tsv') : 'cardrename-map.tsv');
  if (cmd === 'apply') {
    const files = build(p);
    for (const [rel, buf] of files) { const f = path.join(o.out, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); }
    console.log(`${files.size} files written under ${o.out}`);
  }
  fs.mkdirSync(path.dirname(path.resolve(mapFile)), { recursive: true });
  fs.writeFileSync(mapFile, mapTsv(p));
  const s = summary(p);
  if (!o.q) for (const r of p.rows) if (r.status === 'skipped' || (r.status === 'left' && r.hero)) console.log(`${r.status}\t${r.old}\t${r.new || ''}\t${r.reason}`);
  console.log(`cards ${s.cards}: ` + Object.entries(s.status).map(([k, n]) => `${k} ${n}`).join(', '));
  for (const [k, n] of Object.entries(s.reasons).sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${k}`);
  console.log('references: ' + Object.entries(s.kinds).map(([k, n]) => `${k} ${n}`).join(', '));
  console.log(`map ${mapFile} (${s.ms} ms, ${s.scanned} mod files + ${s.vscanned} game files scanned)`);
  if (o.json) fs.writeFileSync(o.json, JSON.stringify({ summary: s, rows: p.rows.map(r => ({ old: r.old, new: r.new, side: r.side, button: r.button, kind: r.kind, desc: r.desc, hero: r.hero, status: r.status, reason: r.reason, files: [...r.files], refs: r.refs })) }, null, 1));
  return 0;
}

module.exports = { plan, build, mapTsv, newNameOf, readTexts, regUnits, entityNames, main };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
