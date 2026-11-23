// GoH texts for the Bots page: the in-game names of units and the lobby names of armies, read from the .pot files (GoH texts are gettext:
// msgctxt = key, msgid = the default text; GHLOC-01). Unit name = desc/squad/<card>, else desc/squad/<card without "(army)">, else
// desc/entity/<card> (the keys tools/pricecalc/goh.js names() uses, read here with the same lngpot.potKeys). Army name = the title key of
// set/multiplayer/armies/<code>.set ({title "mp/army/ger"} [V vanilla]), else mp/army/<code>, worded by task/recipes/army.goh.js textOf
// (the same reader the army task uses; given a small adapter over the files below, not a gen Ctx).
// Files: the game's resource/interface/text/**/*.pot through the one shared game view (bots/lib gameView), then the mod's loose
// resource/interface/text/**/*.pot and localizations/default/interface/text/**/*.pot (where lng-add --exe goh writes), mod after game, so a
// mod text wins. Mission texts are left out. A mod's paks are not read here [I]: their texts show the game's name (or the card id).
// CACHE: about 30-40 ms warm on the real GoH install (1.6 MB of .pot, measured 2026-11-23), so it is kept in memory only (PERF C1: under
// 200 ms), per game stamp + mod + the size and time of each of the mod's text files (a small walk of those two folders). Read only.
// Author: Imperator_Aug (ARSENAL, ia-a5d9f8a3)
'use strict';
const fs = require('fs'), path = require('path');
const L = () => require('./lib');
const lngpot = () => require('../../../upgrade/lib/lngpot');
const armyGoh = () => require('../task/recipes/army.goh');

const TEXT_RE = /^resource\/interface\/text\/.+\.pot$/i;
const MOD_DIRS = [['resource', 'interface', 'text'], ['localizations', 'default', 'interface', 'text']];
const lc = s => String(s == null ? '' : s).toLowerCase();
const clean = s => String(s).replace(/<[^<>]*>/g, '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();

// the mod's loose .pot files: [{abs, key (as a game key, so textOf's pattern takes it), sig}]
function modFiles(mod) {
  const out = [];
  if (!mod) return out;
  MOD_DIRS.forEach((parts, i) => {
    const walk = (d, rel) => {
      let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
      for (const e of es) {
        const p = path.join(d, e.name), r = rel + '/' + e.name;
        if (e.isDirectory()) { if (!/^mission$/i.test(e.name)) walk(p, r); }
        else if (/\.pot$/i.test(e.name)) { let st = null; try { st = fs.statSync(p); } catch (x) { continue; } out.push({ abs: p, key: 'resource/interface/text/~mod' + i + r, sig: r + ':' + st.size + ':' + st.mtimeMs }); }
      }
    };
    walk(path.join(mod, ...parts), '');
  });
  return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

const MEMO = new Map(), MAX = 4;
// -> {desc: Map lower key -> text, g: the reader adapter for army.goh textOf, titles: {code: title key}} | null (no game)
function texts(ctx, mod) {
  const B = L(), G = B.gameOf(ctx);
  if (G.kind !== 'goh' || !G.dir) return null;
  const mf = modFiles(mod), key = G.id + '|' + lc(path.resolve(G.dir)) + '|' + B.gameStamp(ctx, G) + '|' + (mod ? lc(path.resolve(mod)) : '') + '|' + mf.map(f => f.sig).join(',');
  if (MEMO.has(key)) return MEMO.get(key);
  const vfs = require('../../../lib/vfs'), v = B.gameView(ctx, G), files = new Map();
  try {
    if (v) for (const [k, r] of v.files) if (TEXT_RE.test(k) && !/\/mission\//i.test(k)) files.set(k, () => vfs.readRec(r).toString('utf8'));
  } catch (e) { /* unreadable game view: the mod's texts only */ }
  for (const f of mf) files.set(f.key, () => fs.readFileSync(f.abs, 'utf8'));
  const keys = [...files.keys()], text = new Map();
  const readStr = k => { if (!text.has(k)) { let t = ''; try { t = files.get(k)().replace(/^﻿/, ''); } catch (e) { t = ''; } text.set(k, t); } return text.get(k); };
  const desc = new Map();
  try {
    for (const k of keys) for (const [ck, t] of lngpot().potKeys(readStr(k))) if (/^desc\/(squad|entity)\//i.test(ck) && String(t).trim()) desc.set(lc(ck), clean(t));
  } finally { try { if (vfs.closeRecs) vfs.closeRecs(); } catch (e) { /* none open */ } }
  // the army title keys: armies/<code>.set of the mod, else the game
  const titles = {};
  const armyRels = new Set();
  if (v) for (const k of v.files.keys()) { const m = /^resource\/(set\/multiplayer\/armies\/[a-z0-9_]+\.set)$/i.exec(k); if (m) armyRels.add(m[1].toLowerCase()); }
  if (mod) { try { for (const f of fs.readdirSync(path.join(mod, 'resource', 'set', 'multiplayer', 'armies'))) if (/^[a-z0-9_]+\.set$/i.test(f)) armyRels.add('set/multiplayer/armies/' + f.toLowerCase()); } catch (e) { /* none */ } }
  for (const rel of armyRels) {
    let t = null; try { t = B.effective(ctx, mod || path.join(require('os').tmpdir(), 'arsenal-no-mod'), rel).text; } catch (e) { t = null; }
    const m = t && /\{\s*title\s+"([^"]+)"/i.exec(t);
    if (m) titles[path.basename(rel, '.set')] = m[1];
  }
  // texts are read once for desc; textOf asks readStr again for the mp/ keys (same strings, kept in `text` until this entry goes)
  const g = { keys: re => keys.filter(k => re.test(k)), readStr };
  const out = { desc, g, titles };
  MEMO.set(key, out);
  while (MEMO.size > MAX) MEMO.delete(MEMO.keys().next().value);
  return out;
}

// {unit: in-game name} for the units that have one (the rest are left out: the page shows the card id)
function namesOf(ctx, mod, units) {
  const T = texts(ctx, mod), out = {};
  if (!T) return out;
  for (const u of units || []) {
    const k = lc(u), t = T.desc.get('desc/squad/' + k) || T.desc.get('desc/squad/' + k.replace(/\([^)]*\)\s*$/, '')) || T.desc.get('desc/entity/' + k);
    if (t) out[u] = t;
  }
  return out;
}
// {code: lobby name} for every army with an armies/<code>.set, plus the asked codes (mp/army/<code>); codes with no text are left out
function armyNames(ctx, mod, codes) {
  const T = texts(ctx, mod), out = {};
  if (!T) return out;
  const all = new Set(Object.keys(T.titles).concat((codes || []).map(lc)));
  for (const a of all) {
    let t = ''; try { t = armyGoh().textOf(T.g, T.titles[a] || 'mp/army/' + a); } catch (e) { t = ''; }
    t = clean(t || '');
    if (t) out[a] = t;
  }
  return out;
}
const forget = () => MEMO.clear();

module.exports = { namesOf, armyNames, texts, modFiles, forget };
