// bots parts "buycheck" and "stages": what the game sees with a mod on: the game (lib/vfs of the request's game), the mods it is built on
// (deps, in order) and the mod folder itself, each mounted as a layer the way the engine mounts a mod (loose files, resource/*.pak, N.pat,
// localization), so buy cards and texts that live only inside a pak are read too.
//   view(ctx, mod, deps) -> {sets: [{rel, file, text, src: 'game'|'dep'|'mod', dep}], lng: Map lower key -> text, gameKnown,
//                            armyNames: {army id: lobby name}} (armies/<id>.set title, worded by the .lng texts)
//   No game folder: an empty folder stands in for the game, so the mod and its deps are still read (gameKnown false).
//   The file view is lib/gameview's shared one (withModsSync: game + the folders as layers, built from the lib/modtree listings,
//   no walk of the mod; RobZ 1.31.0 loose took 13-18 s to walk, 0.3 s from its listing). What is read out of it is kept per game +
//   mod + deps while the game stamp stands and, for each folder, the modtree signatures of the areas it is read from (set,
//   interface, text, pak, other = mod.info) do. A folder with no scan in this process (nobody awaited `ready` or modtree.ensure
//   for it, or it was touched): the old way, a walk by lib/vfs, kept while the paks, N.pat, mod.info and loose units sets of each
//   folder keep their size and time (`sig`); a server (ctx.modtree) then starts the scan in the background.
//   ready(ctx, mod, deps) -> Promise   for a route that can wait: scans the folders (shared, not blocking), so `view` does not walk.
//   warm(ctx, mod, deps) -> Promise    the same for a route of a server (ctx.modtree) that calls `view` right after: only the folders
//     with no scan of this process (none yet, or touched by a write) are scanned and waited for; a folder that has one costs nothing
//     (`view` asks for a newer scan in the background, as before). No ctx.modtree: nothing (the old way). Never rejects.
//   Game-layer files are parsed once per game.
//   lngLeaves(text, pre, out): the {"key" "text"} leaves of a .lng ({tags} is the root, not a key part).
// Author: Imperator_Aug (ARSENAL, ia-addc3205)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const lib = require('../../lib');
const vfs = require(path.join(__dirname, '..', '..', '..', '..', '..', 'lib', 'vfs'));
const gameview = require(path.join(__dirname, '..', '..', '..', '..', '..', 'lib', 'gameview')), modtree = require(path.join(__dirname, '..', '..', '..', '..', '..', 'lib', 'modtree'));

const ARMY = /^resource\/set\/multiplayer\/armies\/([^/]+)\.set$/i;
const UNITS = /^resource\/set\/multiplayer\/units\/(?:.*\/)?([^/]+\.(?:set|inc))$/i, LNG = /^resource\/interface\/text\/([^/]+\.lng)$/i;
const AREAS = ['set', 'interface', 'text', 'pak', 'other'], REVAL_MS = 15000;

function walk(dir, re, out = [], base = '') {
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const d of ents.sort((a, b) => a.name.localeCompare(b.name))) {
    const r = base ? base + '/' + d.name : d.name;
    if (d.isDirectory()) walk(path.join(dir, d.name), re, out, r); else if (re.test(d.name)) out.push(r);
  }
  return out;
}
function sig(dir) {
  const st = p => { try { const s = fs.statSync(p); return s.size + ':' + s.mtimeMs; } catch (e) { return '-'; } };
  const out = [];
  for (const d of [dir, path.join(dir, 'resource')]) { let l = []; try { l = fs.readdirSync(d); } catch (e) { /* none */ } for (const f of l.sort()) if (/\.(pat|pak)$/i.test(f) || /^mod\.info$/i.test(f)) out.push(f + '=' + st(path.join(d, f))); }
  for (const sub of [['resource', 'set', 'multiplayer', 'units'], ['resource', 'set', 'multiplayer', 'armies'], ['resource', 'localization'], ['localization']]) { const ud = path.join(dir, ...sub); for (const r of walk(ud, /\.(set|inc|lng)$/i)) out.push(r + '=' + st(path.join(ud, ...r.split('/')))); }
  return out.join('|');
}
function emptyGame(ctx) {
  const d = path.join((ctx && typeof ctx.tmpRoot === 'string' && ctx.tmpRoot) || os.tmpdir(), 'bots-empty-game');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// {"key" "text"} leaves of a .lng text into out (lower key -> text)
function lngLeaves(text, pre, out) {
  const re = /"((?:[^"\\]|\\.)*)"|[{}]|[^\s{}"]+/g, stack = [];
  let m, open = false, cur = null;
  text = text.replace(/^﻿/, '');
  while ((m = re.exec(text))) {
    const t = m[0];
    if (t === '{') { open = true; cur = { name: null, vals: [] }; stack.push(cur); continue; }
    if (t === '}') {
      const b = stack.pop();
      if (b && b.name != null && b.vals.length === 1 && b.leaf !== false) out.set(pre.concat(stack.map(x => x.name).filter(x => x != null && x.toLowerCase() !== 'tags'), b.name).join('/').toLowerCase(), b.vals[0]);
      if (stack.length) stack[stack.length - 1].leaf = false;
      cur = stack[stack.length - 1] || null; continue;
    }
    if (!cur) continue;
    const v = m[1] !== undefined ? m[1].replace(/\\"/g, '"') : t;
    if (open) { cur.name = v; open = false; } else cur.vals.push(v);
  }
  return out;
}
const lngPre = f => (/^#/.test(f) ? [] : [f.slice(0, -4).toLowerCase()]);

const VIEW = new Map(), BASE = new Map();   // view cache; game-layer record -> parsed (sets text / lng leaves)
function view(ctx, mod, deps) {
  const G = lib.gameOf(ctx), gameDir = G.dir || emptyGame(ctx), D = deps || [];
  const key = G.id + '|' + path.resolve(gameDir) + '|' + D.map(d => path.resolve(d.dir)).join('>') + '|' + path.resolve(mod);
  // freshness: the shared scan's signatures when every folder has one, else the old size + time walk of the few places read
  const dirs = [mod].concat(D.map(d => d.dir)), Ts = dirs.map(d => { try { return modtree.fresh(d); } catch (e) { return null; } }), now = Date.now();
  if (ctx && ctx.modtree) for (let i = 0; i < dirs.length; i++) if (!Ts[i] || now - Ts[i].at > REVAL_MS) modtree.ensure(dirs[i]).catch(() => {});
  const vo = { gameDir, gid: G.id, mods: D.map((d, i) => ({ dir: d.dir, id: '~dep' + i })).concat([{ dir: mod, id: '~mod' }]) };
  const s = Ts.every(Boolean) ? 'T ' + gameview.stamp(vo) + ' ' + Ts.map(T => AREAS.map(a => T.areas[a]).join(',')).join('#') : 'W ' + dirs.map(sig).join('#'), c = VIEW.get(key);
  if (c && c.sig === s) return c.out;
  const out = { sets: [], lng: new Map(), gameKnown: !!G.dir, armyTitle: {}, armyNames: {} };
  try {
    const v = gameview.withModsSync(vo, { noAge: true });
    const srcOf = r => { const l = String(r.layer || ''); if (l.startsWith('~mod')) return { src: 'mod' }; const m = /^~dep(\d+)/.exec(l); return m ? { src: 'dep', dep: D[Number(m[1])].title } : { src: 'game' }; };
    const lngs = [];
    for (const [k, r] of v.files) {
      if (r.deleted) continue;
      const am = ARMY.exec(k);
      if (am) { try { const tm = /\{\s*title\s+"([^"]+)"/i.exec(vfs.readRec(r).toString('latin1')); if (tm) out.armyTitle[am[1].toLowerCase()] = tm[1]; } catch (e) { /* unreadable */ } continue; }
      const u = UNITS.exec(k), g = !u && LNG.exec(k);
      if (!u && !g) continue;
      const w = srcOf(r), bk = w.src === 'game' ? G.id + '|' + r.container + '|' + r.entry + '|' + r.size : null;
      if (u) {
        let text = bk && BASE.get(bk);
        if (text == null) { text = vfs.readRec(r).toString('latin1'); if (bk) BASE.set(bk, text); }
        out.sets.push(Object.assign({ rel: k.slice(9), file: u[1], text }, w));
      } else lngs.push({ k, r, f: g[1], bk, src: w.src });
    }
    // texts: game first, then deps, then the mod (a later layer's key wins)
    const rank = x => ({ game: 0, dep: 1, mod: 2 })[x.src];
    for (const x of lngs.sort((a, b) => rank(a) - rank(b))) {
      let leaves = x.bk && BASE.get(x.bk);
      if (!leaves) { leaves = lngLeaves(vfs.readRec(x.r).toString('utf8'), lngPre(x.f), new Map()); if (x.bk) BASE.set(x.bk, leaves); }
      for (const [a, b] of leaves) out.lng.set(a, b);
    }
  } catch (e) { out.error = String((e && e.message) || e); }
  finally { try { vfs.closeRecs(); } catch (e) { /* nothing open */ } }
  // the mod's (and deps') resource/localization/*.lng: the place cardrename and pricecalc write names to
  for (const d of D.map(x => x.dir).concat([mod])) {
    const ld = path.join(d, 'resource', 'localization');
    for (const r of walk(ld, /\.lng$/i)) { const b = r.split('/').pop(); try { lngLeaves(fs.readFileSync(path.join(ld, ...r.split('/')), 'utf8'), lngPre(b), out.lng); } catch (e) { /* unreadable */ } }
  }
  // army names as the game shows them in the lobby: armies/<id>.set {title "mp/army/eng"} -> that text ("Commonwealth")
  for (const [a, k] of Object.entries(out.armyTitle)) { const v = out.lng.get(String(k).replace(/^\/+/, '').toLowerCase()); if (v) out.armyNames[a] = v.replace(/<[^<>]*>/g, '').trim(); }
  VIEW.set(key, { sig: s, out });
  return out;
}

async function ready(ctx, mod, deps) {
  await Promise.all([mod].concat((deps || []).map(d => d.dir)).map(d => modtree.ensure(d).catch(() => null)));
}

async function warm(ctx, mod, deps) {
  if (!ctx || !ctx.modtree || !mod) return;
  const need = [mod].concat((deps || []).map(d => d.dir)).filter(d => { try { return !!d && !modtree.fresh(d); } catch (e) { return false; } });
  if (need.length) await Promise.all(need.map(d => modtree.ensure(d).catch(() => null)));
}
const scanned = dirs => dirs.every(d => { try { return !!modtree.fresh(d); } catch (e) { return false; } });

module.exports = { view, ready, warm, scanned, lngLeaves, sig, walk };
