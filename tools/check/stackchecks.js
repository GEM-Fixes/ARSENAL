// stackchecks: two static checks over the MOUNTED STACK (base game + mod + its deps), review severity, run by check via preflight.js.
// codes are deliberately not in lib/registry (so never part of a verdict); read-only, nothing is run.
//   PREFLIGHT_WEAPON_FILLED_NO_FILLING  an entity def (a file of the checked mod's layer) has {weapon "X" filled} and stuff X, after following its
//        {from "tags"} chain, has no non-empty {filling "tags" ..}.  Link to the crash (run w8/T1c/rpz3 game0.log, a tank with {weapon "mg34" filled}):
//        the log has `No Stuff found for tags '' (may lead to crash) (<def>, <line>)` at the two weapon lines [V log], then at arm
//        `EXCEPTION_ACCESS_VIOLATION read at 0` in [V log]. hands a weapon whose stuff has
//        empty filling tags the shared static s_noAmmo, whose weapon is null and IsSpent/GetRoundsInMagazine read weapon before any
//        null check [V]. That the empty filling is the cause is [I]: no run gave the stuff a filling and re-ran. [T]
//        stuff lookup: tags of a stuff file = file name (+ `pattern`/`ammo` for .pattern/.ammo) + its {tag ".."} words [I];
//        0 or >1 files match the weapon name = skipped (unknown), not reported.
//   PREFLIGHT_STEM_TWO_CLASSES  one def file stem (the entity name) used by two defs in different dirs whose root blocks differ (game_entity vs actor ..),
//        at least one of them from the checked mod's layer. The engine logs `Entity redefinition: <stem>`; in run w8/T1c/g1b the later grenade def (class
//        actor, item stuff extender) and the tank def (game_entity) shared the stem m24 and the first throw crashed
//        (`Entity m24[61] does not have stuff extender!`) [V log]; which def the name resolves to is [I].
//   run({ game, modId, exe? }) -> [{ code, n, samples }]   exe = vfs exe of the target game (none: the folder's own pick, as before)
// Author: Imperator_Aug (ARSENAL, ia-349865b5)
const path = require('path');
const vfs = require('../lib/vfs'), sdlx = require('../lib/sdlx');

const lc = s => String(s).toLowerCase();
const nm = b => { const f = b.items && b.items[0]; return f && (f.k === 'STRING' || f.k === 'IDENT') ? lc(f.value !== undefined ? f.value : f.text) : null; };
const sval = f => f && (f.k === 'STRING' || f.k === 'IDENT') ? String(f.value !== undefined ? f.value : f.text) : null;

// exe: the vfs exe of the target game (preflight/check: 'mowas_2' on the shared install = no as64/core; 'goh'); none = the folder's own pick
function build(game, modId, exe) {
  let v = vfs.build({ gameDir: game, mods: [modId], ...(exe ? { exe } : {}) });
  if (!v.mods.includes(modId) && v.exe === 'as64' && v.problems.some(p => p.code === 'MOD_MODE')) v = vfs.build({ gameDir: game, mods: ['as64+', modId], ...(exe ? { exe } : {}) });
  return v;
}

function run({ game, modId, exe }) {
  const v = build(game, modId, exe), out = [];
  const rd = k => vfs.readRec(v.files.get(k));
  const open = r => (v.files.has(r.key) ? { buf: rd(r.key), file: r.key, key: r.key } : null);
  const parse = (k, pre) => sdlx.read(rd(k), { file: k, key: k, open, onError: () => {}, preInclude: pre || [] }).root;
  try {
    // ---- stuff index
    const stuff = [];   // { key, tags:Set, kind }
    for (const k of v.files.keys()) {
      if (!k.startsWith('resource/set/stuff/')) continue;
      const base = k.split('/').pop();
      if (base === '.presets' || /\.ammo$/.test(base)) continue;
      const pat = /\.pattern$/.test(base), stem = base.replace(/\.pattern$/, '');
      stuff.push({ key: k, tags: new Set([...(pat ? ['pattern'] : []), stem]), nameTags: new Set([...(pat ? ['pattern'] : []), stem]), pat });
    }
    const tagged = new Map();     // key -> parsed first block (lazy), also collects {tag ".."}
    const info = new Map();
    const presetsFor = k => { const d = k.split('/'); d.pop(); while (d.length > 2) { const p = d.join('/') + '/.presets'; if (v.files.has(p)) return [p]; d.pop(); } return []; };
    const top = e => { if (!info.has(e.key)) {
      let b = null; try { b = parse(e.key, presetsFor(e.key)).items.find(x => x.k === 'BLOCK' && x.file === e.key); } catch { /* unreadable: unknown */ }
      const i = { from: null, filling: false, ok: !!b };
      if (b) {
        if (nm(b) === 'from') i.from = sval(b.items[1]);
        for (const c of b.items) {
          if (c.k !== 'BLOCK') continue;
          const n = nm(c);
          if (n === 'tag') for (const w of c.items.slice(1)) { const s = sval(w); if (s) for (const t of s.split(/\s+/)) e.tags.add(lc(t)); }
          if (n === 'filling') { const s = sval(c.items[1]); if (s && s.trim()) i.filling = true; }
        }
      }
      info.set(e.key, i);
    } return info.get(e.key); };
    for (const e of stuff) top(e);   // tags of every file known before any lookup
    // a name given by the file name wins over the same word appearing in some other file's {tag ".."} list (hmgun.pattern also carries tag `mgun`) [I]
    const find = words => {
      const w = words.split(/\s+/).filter(Boolean).map(lc);
      if (!w.length) return [];
      const named = stuff.filter(e => w.every(t => e.nameTags.has(t)));
      return named.length ? named : stuff.filter(e => w.every(t => e.tags.has(t)));
    };
    const hasFilling = (e, depth) => {
      const i = top(e);
      if (!i.ok) return null;
      if (i.filling) return true;
      if (!i.from || depth > 8) return false;
      const ps = find(i.from).filter(x => x !== e);
      if (ps.length !== 1) return ps.length ? null : false;
      return hasFilling(ps[0], depth + 1);
    };
    const stuffRes = new Map();
    const resolve = name => {
      if (!stuffRes.has(name)) {
        const c = find(name).filter(e => !e.pat);
        stuffRes.set(name, c.length === 1 ? { e: c[0], f: hasFilling(c[0], 0) } : null);
      }
      return stuffRes.get(name);
    };
    // ---- weapon filled
    const byStuff = new Map();
    for (const [k, rec] of v.files) {
      if (!/^resource\/entity\/.*\.def$/.test(k)) continue;   // whole stack, not only the mod's layer: a mod's stuff override can break a base def (T: base pz3 + mg34)
      const raw = rd(k);
      if (!/filled/i.test(raw.toString('latin1'))) continue;
      const root = sdlx.read(raw, { file: k, key: k, open, onError: () => {} }).root;
      const visit = b => {
        for (const it of b.items) {
          if (it.k !== 'BLOCK') continue;
          if (nm(it) === 'weapon' && it.items.some(x => x.k === 'IDENT' && lc(x.text) === 'filled')) {
            const w = sval(it.items[1]);
            const r = w && resolve(w);
            if (r && r.f === false) {
              const key = r.e.key;
              if (!byStuff.has(key)) byStuff.set(key, { w, uses: [], layers: new Set(), slayer: v.files.get(key).layer });
              byStuff.get(key).uses.push(`${k.split('/').pop()}:${it.line}`);
              byStuff.get(key).layers.add(rec.layer);
            }
          }
          visit(it);
        }
      };
      visit(root);
    }
    if (byStuff.size) {
      const n = [...byStuff.values()].reduce((a, x) => a + x.uses.length, 0);
      out.push({ code: 'PREFLIGHT_WEAPON_FILLED_NO_FILLING', n, samples: [...byStuff].slice(0, 3).map(([key, x]) => `{weapon "${x.w}" filled} -> ${key} has no filling [stuff layer ${x.slayer}; def layers ${[...x.layers].join(',')}]: ${x.uses.length} uses in ${x.uses.slice(0, 8).join(' ')}`), all: [...byStuff].map(([key, x]) => `{weapon "${x.w}" filled} -> ${key} [stuff ${x.slayer}; defs ${[...x.layers].join(',')}] ${x.uses.length} uses: ${x.uses.slice(0, 80).join(' ')}`), stuffs: byStuff.size });
    }
    // ---- one stem, two classes
    const stems = new Map();
    for (const [k, rec] of v.files) {
      if (!/^resource\/entity\/.*\.def$/.test(k)) continue;
      const s = lc(k.split('/').pop().replace(/\.def$/, ''));
      let a = stems.get(s); if (!a) stems.set(s, a = []);
      a.push({ k, mine: rec.layer === modId });
    }
    const hits = [];
    for (const [s, a] of stems) {
      if (a.length < 2 || !a.some(x => x.mine)) continue;
      const cls = new Map();
      for (const x of a) {
        const t = rd(x.k).toString('latin1').replace(/^﻿|^\xEF\xBB\xBF/, ''), m = /^(?:\s|;[^\n]*\n)*\{\s*([A-Za-z_]\w*)/.exec(t);
        cls.set(x.k, m ? lc(m[1]) : '?');
      }
      if (new Set(cls.values()).size > 1) hits.push(`${s}: ${[...cls].map(([k, c]) => `${c} ${k.replace(/^resource\/entity\//, '')}`).join(' | ')}`);
    }
    if (hits.length) out.push({ code: 'PREFLIGHT_STEM_TWO_CLASSES', n: hits.length, samples: hits.slice(0, 3), all: hits });
  } finally { vfs.closeRecs(); }
  return out;
}
module.exports = { run };
if (require.main === module) {
  const a = process.argv.slice(2);
  if (a.length < 2) { console.error('usage: node tools/check/stackchecks.js <game dir> <mod id under mods/> [--all]'); process.exit(2); }
  for (const r of run({ game: a[0], modId: a[1] })) { console.log(`${r.code} x${r.n}`); for (const s of (a[2] === '--all' && r.all) || r.samples) console.log('  ' + s); }
}
