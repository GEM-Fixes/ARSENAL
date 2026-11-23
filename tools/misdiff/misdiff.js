#!/usr/bin/env node
// misdiff: semantic mission diff (.mi map/mode files), not a text diff. rows MIS-04 (unitLimits/preset context only)
// usage: node tools/misdiff/misdiff.js <a> <b> [-q] [--format json] [--summary]
//          a/b = map folder (holds <mode>.mi + map.info) or one .mi file
//        node tools/misdiff/misdiff.js --game G [--mods m1,m2] --map <name> [--mods-a m0]
//          = vanilla (no mods) vs mod-winning version of resource/map/multi/<name> (or single/<name>) through the vfs
//        [--exe as64|mowas_2|mowas2|goh] the game's vfs view on both sides (the shared AS2 install gives as64 when none is named:
//          as64/core and the Classic/Enhanced filter; mowas_2: no as64/core, the 3.262 range filter; goh: the GoH paks and its mods).
//          --exe goh with no --game: the GoH install (lib/cli). GoH .mi and <mode>.info parse with the same reader [V].
//        [--mod-dir D1,D2] mod folders by path mounted on the b side after --mods (vfs modDirs; a mod outside <game>/mods, e.g. a GoH
//          mod folder outside the GoH install); --mods may then be empty
//        --map name: any letter case (vfs keys are lower case). Only resource/map/multi|single/<name> of the game and of each mod is
//          walked (paks are all listed), so a whole GoH mod folder costs no more than its map; [--whole-tree] walks every folder (same output)
//        a mod the vfs leaves out (version range, as64 Classic/Enhanced mode, missing Require) is said on either side as
//          the finding WARN_MISDIFF_MOD_DROPPED (with or without --exe; rel = mods-a or mods). A finding, not an info line: the
//          MIS_DIFF_* info lines are the changes only, so a reader counting them (the GUI Missions diff) never takes a drop for a change
// output rel = mode file name (combat.mi); line = b side (a side for removed things)
// info codes (not counted; changes): MIS_DIFF_MODE_ADDED/_REMOVED  MIS_DIFF_MAPINFO_CHANGED
//   MIS_DIFF_ENTITY_ADDED/_REMOVED/_MOVED/_DEF_CHANGED/_CHANGED   (Entity "<def>" 0x<uid>, matched by uid; label adds map_point name/team)
//   MIS_DIFF_{TRIGGER,ZONE,EVENT,WAYPOINT,TASK,VAR,LINK}_ADDED/_REMOVED/_CHANGED   (Helpers children by name/Name; dup names #n)
//   MIS_DIFF_HELPER_CHANGED (other Helpers kinds: reinforcements, mission_options ...)  MIS_DIFF_BLOCK_CHANGED (other top blocks)
//   MIS_DIFF_SPAWN_COUNT (SpawnPoint map_points per team/phase differ)
// findings (counted; engine reaction unverified -> WARN_):
//   WARN_MISDIFF_UID_COLLISION      b has two entities with one uid that a does not (second wins/clones: unverified)
//   WARN_MISDIFF_REMOVED_REFERENCED entity/trigger/zone/... removed in b but a Link, {mids}, or trigger value in b still names it
//   WARN_MISDIFF_MOD_DROPPED        --map form: a listed mod the vfs left out on that side (the side shows the game without it)
// Author: Imperator_Aug (ARSENAL, ia-21684b06)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');
const sdlx = require('../lib/sdlx'), vfs = require('../lib/vfs');
const { createReport } = require('../lib/report'), cli = require('../lib/cli');

const lc = s => (s == null ? '' : String(s)).toLowerCase();

// ---- light tree: {name, vals:[{k,text,value}], kids, line}; MOD blocks flattened
function lite(b) {
  const o = { name: null, vals: [], kids: [], line: b.line }, named = { v: false };
  const walk = items => {
    for (const it of items) {
      if (it.k === 'BLOCK') o.kids.push(lite(it));
      else if (it.k === 'MOD') walk(it.items);
      else if (!named.v && (it.k === 'IDENT' || it.k === 'STRING')) { o.name = it.k === 'STRING' ? it.value : it.text; named.v = true; }
      else o.vals.push({ k: it.k, text: it.text, value: it.k === 'STRING' ? it.value : it.value !== undefined ? it.value : it.text });
    }
  };
  walk(b.items);
  return o;
}
const kid = (n, name) => n.kids.find(k => lc(k.name) === lc(name));
const v0 = n => (n && n.vals.length ? String(n.vals[0].value) : null);
const ser = n => '{' + n.name + ' ' + n.vals.map(v => v.text).join(' ') + n.kids.map(ser).join('') + '}';
const serKids = (n, skip) => n.kids.filter(k => !(skip && skip.has(lc(k.name)))).map(ser).join('');

function parseMi(buf, file) {
  const r = sdlx.read(buf, { file, key: file.toLowerCase(), open: () => null, onError: () => {} });
  const top = r.root.items.find(it => it.k === 'BLOCK' && it.items.some(x => x.k === 'IDENT' && lc(x.text) === 'mission'));
  return top ? lite(top) : { name: 'mission', vals: [], kids: [], line: 1 };
}

// ---- sources: Map modeFile -> { buf } ; info: Buffer|null
function dirSource(p) {
  const out = new Map();
  const st = fs.statSync(p);
  if (st.isFile()) { out.set(path.basename(p), fs.readFileSync(p)); return { files: out, single: true }; }
  for (const n of fs.readdirSync(p)) if (/\.(mi|info)$/i.test(n)) out.set(n.toLowerCase(), fs.readFileSync(path.join(p, n)));
  return { files: out };
}
function vfsSource(v, base) {
  const out = new Map(), pre = base + '/';
  for (const [k, r] of v.files) if (k.startsWith(pre) && /^[^/]+\.(mi|info)$/.test(k.slice(pre.length))) out.set(k.slice(pre.length), vfs.readRec(r));
  return { files: out };
}

const fmtNum = n => String(Math.round(n * 100) / 100);
const hex = n => '0x' + Number(n).toString(16);
const pos = e => { const p = kid(e, 'Position'); return p && p.vals.length >= 2 ? p.vals.map(v => Number(v.value)) : null; };

function entityInfo(e) {
  const ext = kid(e, 'Extender'), nm = ext && v0(kid(ext, 'name')), tm = ext && v0(kid(ext, 'team'));
  return `"${v0({ vals: e.vals.slice(0, 1) })}" ${hex(e.vals[1].value)}` + (nm ? ` ${nm}` : '') + (tm ? ` team ${tm}` : '');
}
const isEntity = e => lc(e.name) === 'entity' && e.vals.length >= 2 && e.vals[1].k === 'INTEGER';

// keyed collection diff. items [{key,node}]; dup keys get #n
function keyed(items, keyFn) {
  const m = new Map(), seen = new Map();
  for (const n of items) {
    let k = keyFn(n); if (k == null) k = '';
    const c = (seen.get(k) || 0) + 1; seen.set(k, c);
    m.set(c > 1 ? `${k}#${c}` : k, n);
  }
  return m;
}
function diffKeyed(kind, A, B, emit, label) {
  for (const [k, n] of A) if (!B.has(k)) emit(`MIS_DIFF_${kind}_REMOVED`, n.line, `${label || kind.toLowerCase()} ${k} removed`, 'a');
  for (const [k, n] of B) {
    const a = A.get(k);
    if (!a) emit(`MIS_DIFF_${kind}_ADDED`, n.line, `${label || kind.toLowerCase()} ${k} added`, 'b');
    else if (ser(a) !== ser(n)) emit(`MIS_DIFF_${kind}_CHANGED`, n.line, `${label || kind.toLowerCase()} ${k} changed: ${whatChanged(a, n)}`, 'b');
  }
}
// short description of which children/vals differ
const lab = x => x.name == null ? '{' + x.vals.map(v => v.text).join(' ') + '}' : String(x.name);
function whatChanged(a, b) {
  const parts = [];
  if (a.vals.map(v => v.text).join(' ') !== b.vals.map(v => v.text).join(' ')) parts.push(`value ${a.vals.map(v => v.text).join(' ')} -> ${b.vals.map(v => v.text).join(' ')}`.slice(0, 120));
  const ka = new Map(), kb = new Map();
  for (const x of a.kids) ka.set(lab(x) + (ka.has(lab(x)) ? '+' : ''), x);
  for (const x of b.kids) kb.set(lab(x) + (kb.has(lab(x)) ? '+' : ''), x);
  const chg = [];
  for (const [k, x] of ka) { if (!kb.has(k)) chg.push('-' + k); else if (ser(x) !== ser(kb.get(k))) chg.push('~' + k); }
  for (const k of kb.keys()) if (!ka.has(k)) chg.push('+' + k);
  if (chg.length) parts.push(chg.slice(0, 8).join(' ') + (chg.length > 8 ? ' ...' : ''));
  return parts.join('; ') || 'content';
}

const HELP_KEYED = { triggers: ['TRIGGER', n => n.name], waypoints: ['WAYPOINT', n => n.name], tasks: ['TASK', n => n.name], vars: ['VAR', n => n.name] };

function helpers(top) {
  const h = { keyed: {}, zones: [], events: [], other: new Map() };
  for (const k of ['triggers', 'waypoints', 'tasks', 'vars']) h.keyed[k] = [];
  for (const hb of top.kids.filter(c => lc(c.name) === 'helpers')) for (const c of hb.kids) {
    const n = lc(c.name);
    if (HELP_KEYED[n]) h.keyed[n].push(...c.kids);
    else if (n === 'zones') h.zones.push(...c.kids);
    else if (n === 'zone') h.zones.push(c);
    else if (n === 'event' && c.vals.length) h.events.push(c);
    else h.other.set(n, (h.other.get(n) || '') + ser(c));
  }
  return h;
}

// all string/ident values + mids numbers used by trigger/action text
function usage(h) {
  const vals = new Set(), mids = new Set();
  const walk = n => {
    for (const v of n.vals) vals.add(String(v.value));
    if (lc(n.name) === 'mids') { for (const v of n.vals) mids.add(Number(v.value)); for (const k of n.kids) if (/^\d+$/.test(String(k.name))) mids.add(Number(k.name)); }
    n.kids.forEach(walk);
  };
  for (const t of h.keyed.triggers) walk(t);
  return { vals, mids };
}

function diffMi(file, A, B, rep) {
  const emit = (code, line, msg, side) => rep.info(file, line, code, msg + (side === 'a' ? ' (line in a)' : ''));
  // ---- entities
  const ea = A.kids.filter(isEntity), eb = B.kids.filter(isEntity);
  const uidMap = (es, side) => {
    const m = new Map(), dup = new Set();
    for (const e of es) { const u = Number(e.vals[1].value); if (m.has(u)) dup.add(u); else m.set(u, e); }
    return { m, dup };
  };
  const ua = uidMap(ea), ub = uidMap(eb);
  for (const u of ub.dup) if (!ua.dup.has(u)) {
    const second = eb.filter(e => Number(e.vals[1].value) === u)[1];
    rep.add(file, second.line, 'WARN_MISDIFF_UID_COLLISION', `uid ${hex(u)} used by 2+ entities in b${ua.m.has(u) ? '' : ' (new uid)'}`);
  }
  const removedUids = [], removedMids = new Map();
  for (const [u, e] of ua.m) if (!ub.m.has(u)) {
    emit('MIS_DIFF_ENTITY_REMOVED', e.line, `entity ${entityInfo(e)} removed`, 'a');
    removedUids.push([u, e]);
    const mid = v0(kid(e, 'MID')); if (mid != null) removedMids.set(Number(mid), e);
  }
  for (const [u, e] of ub.m) {
    const a = ua.m.get(u);
    if (!a) { emit('MIS_DIFF_ENTITY_ADDED', e.line, `entity ${entityInfo(e)} added${pos(e) ? ' at ' + pos(e).map(fmtNum).join(' ') : ''}`, 'b'); continue; }
    if (v0({ vals: a.vals.slice(0, 1) }) !== v0({ vals: e.vals.slice(0, 1) })) emit('MIS_DIFF_ENTITY_DEF_CHANGED', e.line, `entity ${hex(u)} def ${v0({ vals: a.vals.slice(0, 1) })} -> ${v0({ vals: e.vals.slice(0, 1) })}`, 'b');
    const pa = pos(a), pb = pos(e);
    if (pa && pb) {
      const d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
      if (d > 0.005) emit('MIS_DIFF_ENTITY_MOVED', e.line, `entity ${entityInfo(e)} moved ${fmtNum(d)}m: ${pa.map(fmtNum).join(' ')} -> ${pb.map(fmtNum).join(' ')}`, 'b');
    } else if (!!pa !== !!pb) emit('MIS_DIFF_ENTITY_CHANGED', e.line, `entity ${entityInfo(e)} Position ${pa ? 'removed' : 'added'}`, 'b');
    const skip = new Set(['position']);
    if (serKids(a, skip) !== serKids(e, skip)) emit('MIS_DIFF_ENTITY_CHANGED', e.line, `entity ${entityInfo(e)} changed: ${whatChanged({ vals: [], kids: a.kids.filter(k => lc(k.name) !== 'position') }, { vals: [], kids: e.kids.filter(k => lc(k.name) !== 'position') })}`, 'b');
  }
  // spawn counts
  const spawns = es => { const c = {}; for (const e of es) { const x = kid(e, 'Extender'); if (x && v0(x) === 'map_point' && lc(v0(kid(x, 'visor'))) === 'spawnpoint') { const k = `team ${v0(kid(x, 'team'))} phase ${v0(kid(x, 'phase')) || 0}`; c[k] = (c[k] || 0) + 1; } } return c; };
  const sa = spawns(ea), sb = spawns(eb);
  for (const k of new Set([...Object.keys(sa), ...Object.keys(sb)])) if ((sa[k] || 0) !== (sb[k] || 0)) emit('MIS_DIFF_SPAWN_COUNT', B.line, `spawn points ${k}: ${sa[k] || 0} -> ${sb[k] || 0}`, 'b');

  // ---- links (top-level Link a {b ..})
  const links = t => keyed(t.kids.filter(c => lc(c.name) === 'link'), n => v0(n));
  diffKeyed('LINK', links(A), links(B), emit);
  // ---- other top blocks (not Entity, Link, Helpers)
  const rest = t => keyed(t.kids.filter(c => !isEntity(c) && !['link', 'helpers'].includes(lc(c.name))), n => String(n.name));
  const ra = rest(A), rb = rest(B);
  for (const [k, n] of ra) if (!rb.has(k)) emit('MIS_DIFF_BLOCK_REMOVED', n.line, `block ${k.trim()} removed`, 'a');
  for (const [k, n] of rb) { const a = ra.get(k); if (!a) emit('MIS_DIFF_BLOCK_ADDED', n.line, `block ${k.trim()} added`, 'b'); else if (ser(a) !== ser(n)) emit('MIS_DIFF_BLOCK_CHANGED', n.line, `block ${k.trim()} changed: ${whatChanged(a, n)}`, 'b'); }

  // ---- helpers
  const ha = helpers(A), hb = helpers(B);
  for (const k of Object.keys(HELP_KEYED)) {
    const [kind, kf] = HELP_KEYED[k];
    diffKeyed(kind, keyed(ha.keyed[k], kf), keyed(hb.keyed[k], kf), emit);
  }
  const zk = n => (n.name === 'Zone' || lc(n.name) === 'zone') ? v0(kid(n, 'Name')) : (v0(kid(n, 'Name')) || n.name);
  diffKeyed('ZONE', keyed(ha.zones, zk), keyed(hb.zones, zk), emit);
  diffKeyed('EVENT', keyed(ha.events, v0), keyed(hb.events, v0), emit);
  for (const k of new Set([...ha.other.keys(), ...hb.other.keys()])) {
    const x = ha.other.get(k), y = hb.other.get(k);
    if (x !== y) emit('MIS_DIFF_HELPER_CHANGED', B.line, `Helpers ${k} ${x == null ? 'added' : y == null ? 'removed' : 'changed'}`, 'b');
  }

  // ---- suspects: removed things still referenced by b
  const linkRefs = new Set();
  for (const l of B.kids.filter(c => lc(c.name) === 'link')) {
    if (l.vals.length) linkRefs.add(Number(l.vals[0].value));
    for (const c of l.kids) linkRefs.add(c.vals.length ? Number(c.vals[0].value) : Number(c.name));
  }
  const use = usage(hb);
  for (const [u, e] of removedUids) if (linkRefs.has(u)) rep.add(file, B.line, 'WARN_MISDIFF_REMOVED_REFERENCED', `entity ${entityInfo(e)} removed in b but a Link in b still names it`);
  for (const [m, e] of removedMids) if (use.mids.has(m)) rep.add(file, B.line, 'WARN_MISDIFF_REMOVED_REFERENCED', `entity ${entityInfo(e)} (MID ${m}) removed in b but a trigger {mids} in b still lists it`);
  const refName = (kind, mapA, mapB) => { for (const k of mapA.keys()) if (!mapB.has(k) && use.vals.has(k.replace(/#\d+$/, '')) && !hasSame(mapB, k)) rep.add(file, B.line, 'WARN_MISDIFF_REMOVED_REFERENCED', `${kind} "${k}" removed in b but a trigger in b still names it`); };
  const hasSame = (m, k) => m.has(k.replace(/#\d+$/, ''));
  refName('trigger', keyed(ha.keyed.triggers, n => n.name), keyed(hb.keyed.triggers, n => n.name));
  refName('zone', keyed(ha.zones, zk), keyed(hb.zones, zk));
  refName('event', keyed(ha.events, v0), keyed(hb.events, v0));
  refName('waypoint', keyed(ha.keyed.waypoints, n => n.name), keyed(hb.keyed.waypoints, n => n.name));
  refName('task', keyed(ha.keyed.tasks, n => n.name), keyed(hb.keyed.tasks, n => n.name));
}

// map.info = flat SDL {game {k v}}: key path -> value text
function parseInfo(buf, file) {
  const r = sdlx.read(buf, { file, key: file, open: () => null, onError: () => {} });
  const out = new Map();
  const walk = (b, pre) => { for (const it of b.items) if (it.k === 'BLOCK') { const l = lite(it); const w = n => { if (n.vals.length) out.set(pre + n.name, n.vals.map(v => v.text).join(' ')); n.kids.forEach(w); }; w(l); } };
  walk(r.root, '');
  return out;
}

function diffSources(sa, sb, rep, cnt = {}) {   // cnt.onlyA / cnt.onlyB = files on one side only
  const fa = sa.files, fb = sb.files;
  let pairs = [];
  if (sa.single || sb.single) {
    const x = [...fa.keys()][0], y = [...fb.keys()][0];
    if (x !== undefined && y !== undefined) pairs.push([y, fa.get(x), fb.get(y)]);
  } else {
    cnt.onlyA = [...fa.keys()].filter(k => !fb.has(k)).length; cnt.onlyB = [...fb.keys()].filter(k => !fa.has(k)).length;
    for (const k of fa.keys()) if (!fb.has(k)) rep.info(k, 0, 'MIS_DIFF_MODE_REMOVED', `${k} only in a`);
    for (const k of fb.keys()) if (!fa.has(k)) rep.info(k, 0, 'MIS_DIFF_MODE_ADDED', `${k} only in b`);
    for (const k of fb.keys()) if (fa.has(k)) pairs.push([k, fa.get(k), fb.get(k)]);
  }
  let n = 0;
  for (const [k, x, y] of pairs.sort((p, q) => p[0] < q[0] ? -1 : 1)) {
    if (x.equals(y)) continue;
    n++;
    if (/\.info$/i.test(k)) {
      const ia = parseInfo(x, k), ib = parseInfo(y, k);
      for (const key of new Set([...ia.keys(), ...ib.keys()])) if (ia.get(key) !== ib.get(key)) rep.info(k, 0, 'MIS_DIFF_MAPINFO_CHANGED', `${key}: ${ia.has(key) ? ia.get(key) : '(none)'} -> ${ib.has(key) ? ib.get(key) : '(none)'}`);
      continue;
    }
    diffMi(k, parseMi(x, k), parseMi(y, k), rep);
  }
  return n;
}

// fs seam for vfs.build (opts.fs) in the --map form: below a mount root's resource/ folder only the folders on the way to
// map/multi|single/<map> are listed; every file is kept (paks and N.pat, whose keys may hold the map, are mounted whole). A key under
// resource/map/<map>/ therefore comes out as from the whole tree; a whole GoH mod folder is not walked (route limit 600 s).
// rel = the path after the first 'resource' segment whose rest is on the way (a folder named resource higher up is passed by).
function mapOnlyFs(mm) {
  const want = /^(multi|single)\//.test(mm) ? ['map/' + mm] : ['map/multi/' + mm, 'map/single/' + mm];
  const onWay = rel => want.some(w => w === rel || w.startsWith(rel + '/') || rel.startsWith(w + '/'));
  return {
    statSync: (...a) => fs.statSync(...a),
    readFileSync: (...a) => fs.readFileSync(...a),
    readdirSync: (d, ...a) => {
      const names = fs.readdirSync(d, ...a);
      const segs = path.resolve(String(d)).split(/[\\/]+/).map(s => s.toLowerCase());
      let rel = null;
      for (let i = 0; i < segs.length && rel === null; i++) if (segs[i] === 'resource') { const r = segs.slice(i + 1).join('/'); if (!r || onWay(r)) rel = r; }
      if (rel === null || want.some(w => rel === w || rel.startsWith(w + '/'))) return names;   // not below resource/, or inside the map
      return names.filter(n => {
        const nm = typeof n === 'string' ? n : n.name, child = (rel ? rel + '/' : '') + nm.toLowerCase();
        if (onWay(child)) return true;
        try { return !fs.statSync(path.join(String(d), nm)).isDirectory(); } catch { return true; }
      });
    },
  };
}

function check(o) {
  const rep = createReport();
  let sa, sb;
  if (o.map) {
    // vfs keys are lower case: 'multi/1v1_Hiekalla' names the same map as 'multi/1v1_hiekalla'
    const mm = o.map.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase().replace(/^(resource\/)?map\//, '');
    const base = c => `resource/map/${/^(multi|single)\//.test(mm) ? mm : (c === 'multi' ? 'multi/' : 'single/') + mm}`;
    const ex = o.exe ? { exe: o.exe } : {};   // no --exe: the build as before
    const seam = o.wholeTree ? {} : { fs: mapOnlyFs(mm) };   // only the map's folder is walked (paks are all listed): same files under base(), far less to read
    const va = vfs.build({ gameDir: o.gameDir, mods: o.modsA || [], ...ex, ...seam }), vb = vfs.build({ gameDir: o.gameDir, mods: o.mods, ...ex, ...seam, ...(o.modDirs && o.modDirs.length ? { modDirs: o.modDirs } : {}) });
    // both sides, with or without --exe: a mod the range or the Classic/Enhanced filter drops would leave its side as vanilla
    // without a word (an Enhanced 3.301 mod in an as64 Classic list: 'no changes'). A warn finding, kept out of the MIS_DIFF_* change lines:
    // the 'N files differ' line and every count of change lines stay the same.
    const drops = [...vfs.dropped(va).map(l => ['mods-a', l]), ...vfs.dropped(vb).map(l => ['mods', l])];
    for (const [w, l] of drops) rep.add(w, 0, 'WARN_MISDIFF_MOD_DROPPED', l);
    const pick = v => { for (const c of ['multi', 'single']) { const s = vfsSource(v, base(c)); if (s.files.size) return s; } return { files: new Map() }; };
    sa = pick(va); sb = pick(vb);
    // a map only a dropped mod holds: the drop is the reason, so it goes into the error (the report is never printed)
    if (!sa.files.size && !sb.files.size) throw new Error(`map ${o.map}: no files under resource/map/multi|single${drops.length ? '; ' + drops.map(d => d[1]).join('; ') : ''}`);
  } else {
    sa = dirSource(o.a); sb = dirSource(o.b);
  }
  const cnt = {}, changed = diffSources(sa, sb, rep, cnt);
  return { rep, changed, onlyA: cnt.onlyA || 0, onlyB: cnt.onlyB || 0 };
}

if (require.main === module) cli.run(() => {
  const o = cli.parse(process.argv.slice(2), { values: ['--map', '--mods-a', '--mod-dir'], flags: ['--whole-tree'] });
  const map = o.x.map, modsA = o.x['mods-a'] ? o.x['mods-a'].split(',').filter(Boolean) : [];
  const modDirs = o.x['mod-dir'] ? o.x['mod-dir'].split(',').filter(Boolean) : [];
  if (map ? !o.gameDir || !(o.mods.length || modDirs.length) : o.pos.length !== 2) {
    console.error('usage: node tools/misdiff/misdiff.js <a> <b> [-q] [--format json]\n       node tools/misdiff/misdiff.js --game G --mods m --map <name> [--mods-a m0] [--mod-dir D] [--exe as64|mowas_2|goh]');
    process.exit(2);
  }
  const { rep, changed, onlyA, onlyB } = check({ a: o.pos[0], b: o.pos[1], map, gameDir: o.gameDir, mods: o.mods, modsA, exe: o.exe, modDirs, wholeTree: !!o.x['whole-tree'] });
  cli.printReport(rep, o, { tool: 'misdiff' });
  if (o.format === 'text') console.log(`${changed} files differ${onlyA || onlyB ? `, ${onlyA} only in a, ${onlyB} only in b` : ''}`);
});
module.exports = { check, diffMi, parseMi, mapOnlyFs };
