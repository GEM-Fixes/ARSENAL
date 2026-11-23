// lngsplit/dead: who uses a mod-only text key? facts from vanilla vfs + the mod's loose resource/ (the mod has no paks), verdict per key.
//   const facts = gather({ modDir, gameDir, exe, cacheDir, log })   slow part (vfs, unit cards, entityindex stuff, literal scan)
//   verdict(facts, key, title) -> { group, verdict: 'dead'|'kept'|'unsure', reason }
// rules (LOC-02 unknown key = raw text;:
//   desc/human/<breed>          kept: MP soldier card <breed>, breed file set/breed/<breed>.*, a breed file of that base name at any depth
//   desc|info/entity/<x>, info/special/<x>, info/armor_angle/<x>/..   kept: .def base name x, MP card x (GetUnitDescription), card {info x},
//                               unit.reg unit x
//   desc|info/squad/<name>      kept: MP card <name> (cards read through sdlx: include + %-macro expansion), card {info name};
//                               unsure: <name> or its bare form is a word in a units file whose macros do not resolve standalone
//                               and that no other units file includes (vanilla + mod)
//   desc/<ammo|weapon|stuff|container>/<tags>   kept: a stuff's file-name tags minus grenade/pattern/ammo/weapon equal the tag set
//                               (order-free; the engine uses tags = file-name tags, /) or a stuff
//                               {desc "key"}; also kept (wide rule, the static match is known to miss real items such as
//                               "bullet37_ger ap" of shell/bullet37.ger.ap.ammo): every word is in one stuff file's pool = dotted name
//                               parts + runs of adjacent parts joined by '_' + its {tag} words + {from} pattern tags + macro call names;
//                               dead only when no stuff file forms the words; container with no match: unsure
//   mission/<multi|single>/<path>/..   kept: map/<multi|single>/<path prefix> folder exists (LOC-24 nested maps); dead: the first folder
//                               does not exist; unsure otherwise
//   '#' files (UI)              kept: key in vanilla or literal key string in a text file; else unsure (never dead)
//   any key                     kept when the literal key string appears in a vanilla or mod set/interface/script/map/properties/entity
//                               text file (quoted string or a bare word with '/'); otherwise the group rule; no rule = unsure
// stuff: entityindex (tools/entityindex/index.js) is required, not copied; loccover's stuff key code is not exported and uses the full
//   tag set (tagsOf), which the engine does not ( uses tags), so the file-name tag set (fileTagsOf) is used here.
// Author: Imperator_Aug (ARSENAL, ia-3eaeaa6b)
const fs = require('fs'), path = require('path');
const sdlset = require('../lib/sdlset');

const SKIP = new Set(['grenade', 'pattern', 'ammo', 'weapon']);
const lc = s => String(s).toLowerCase();
const LIT_RE = /^resource\/(set|interface|script|map|properties|entity)\/.*?(\.(set|inc|def|ext|mi|info|lua|ammo|weapon|pattern|grenade|reg|presets|txt|ui|cfg|xml|mine|hand)|\/[^./]+)$/;
const TOK_RE = /"([^"\r\n]{1,300})"|([A-Za-z0-9_\-.()%]+(?:\/[A-Za-z0-9_\-.()%]+)+)/g;

function gather(o) {
  const log = o.log || (() => {});
  const t0 = Date.now();
  const src = sdlset.createSource({ gameDir: o.gameDir, folder: o.modDir, exe: o.exe });
  const keys = new Set();
  if (src.v) for (const k of src.v.files.keys()) keys.add(k);
  for (const k of src.local.keys()) if (k.startsWith('resource/') && !k.startsWith('resource/localization/')) keys.add(k);
  log(`vfs ${keys.size} keys (${Date.now() - t0} ms)`);
  // defs, breeds, maps (o.light: these only, for the layout)
  const defs = new Map(), breeds = new Set(), breedBase = new Map(), mapDirs = new Map();   // mapDirs: dir -> holds files directly
  for (const k of keys) {
    let m;
    if ((m = /^resource\/entity\/(.+)\/([^/]+)\.def$/.exec(k))) { if (!defs.has(m[2])) defs.set(m[2], []); defs.get(m[2]).push(m[1]); }
    else if ((m = /^resource\/set\/breed\/(.+)\.[^./]+$/.exec(k))) { breeds.add(m[1]); const b = m[1].slice(m[1].lastIndexOf('/') + 1); if (!breedBase.has(b)) breedBase.set(b, m[1]); }
    if ((m = /^resource\/map\/((?:multi|single)\/.+)\/[^/]+$/.exec(k))) {
      const segs = m[1].split('/');
      for (let i = 2; i <= segs.length; i++) { const d = segs.slice(0, i).join('/'); if (!mapDirs.has(d)) mapDirs.set(d, false); }
      mapDirs.set(m[1], true);
    }
  }
  if (o.light) { if (src.v) require('../lib/vfs').closeRecs(); return { defs, breeds, breedBase, mapDirs }; }
  // MP unit cards (vanilla + mod, every file under set/multiplayer/units, macros expanded through the including file)
  const U = 'resource/set/multiplayer/units/';
  const cards = new Map(), infoOf = new Set(), undef = new Map();
  const get = k => src.get(k);
  for (const k of [...keys].sort()) {
    if (!k.startsWith(U)) continue;
    let r, nu = 0;
    try { r = src.read({ key: k, file: k, get: () => get(k) }, (f, l, c) => { if (c === 'MACRO_UNDEFINED') nu++; }); } catch { r = null; }
    if (nu) undef.set(k, nu);
    if (!r) continue;
    const walk = (b, inUnits) => {
      for (const it of b.items || []) {
        if (it.k === 'MOD') { walk(it, inUnits); continue; }   // (mod "x" ..) content counts (a card may sit in one)
        if (it.k !== 'BLOCK') continue;
        const f = it.items[0];
        if (f && f.k === 'IDENT' && lc(f.text) === 'units') { walk(it, true); continue; }
        if (inUnits && f && (f.k === 'STRING' || f.k === 'IDENT')) {
          const n = lc(f.k === 'STRING' ? f.value : f.text);
          cards.set(n, (cards.get(n) || 0) + 1);
          for (const g of it.items.slice(1)) if (g.k === 'BLOCK' && g.items[0] && g.items[0].k === 'IDENT' && lc(g.items[0].text) === 'info' && g.items[1]) infoOf.add(lc(g.items[1].value !== undefined ? g.items[1].value : g.items[1].text));
        } else walk(it, false);
      }
    };
    walk(r.root, false);
  }
  const unresolvedFiles = [...undef.keys()].filter(k => !src.included.has(k));
  const unresolvedWords = new Set();
  for (const k of unresolvedFiles) { const b = get(k); if (b) for (const w of b.toString('latin1').toLowerCase().match(/[a-z0-9_\-.%]+/g) || []) unresolvedWords.add(w); }
  // unit.reg unit names
  const regUnits = new Set();
  for (const rk of ['resource/set/registry/unit.reg']) {
    const b = get(rk); if (!b) continue;
    let r; try { r = src.read({ key: rk, file: rk, get: () => b }, () => {}); } catch { r = null; }
    const walk = blk => { for (const it of blk.items || []) if (it.k === 'BLOCK') { const f = it.items[0]; if (f && (f.k === 'STRING' || f.k === 'IDENT') && lc(f.text) !== 'units') regUnits.add(lc(f.k === 'STRING' ? f.value : f.text)); else walk(it); } };
    if (r) walk(r.root);
  }
  log(`cards ${cards.size}, unresolved units files ${unresolvedFiles.length} (${Date.now() - t0} ms)`);
  // stuff (entityindex), file-name tag sets + {desc} fields
  const stuffSets = new Set(), stuffDesc = new Set(), allTagSets = [], widePools = [];
  if (!o.noStuff) {
    const ix = require('../entityindex/index');
    const cache = path.join(o.cacheDir, 'entityindex.' + require('crypto').createHash('md5').update(path.resolve(o.gameDir) + '|' + path.resolve(o.modDir) + '|' + (o.exe || '')).digest('hex').slice(0, 8) + '.json');
    fs.mkdirSync(o.cacheDir, { recursive: true });
    // raw facts per stuff file: {desc "key"}, macro call names ("ger" args ..), words of every {tag ..} string
    const extract = buf => {
      const s = buf.toString('latin1'), d = /\{\s*desc\s+"([^"]*)"/i.exec(s), macros = [], tags = [];
      for (const m of s.matchAll(/\(\s*"([^"]+)"/g)) macros.push(lc(m[1]));
      for (const m of s.matchAll(/\{\s*tag((?:\s+"[^"]*")+)/gi)) for (const q of m[1].matchAll(/"([^"]*)"/g)) tags.push(...lc(q[1]).split(/\s+/).filter(Boolean));
      return { desc: d ? d[1] : null, macros, tags };
    };
    const b = ix.build({ gameDir: o.gameDir, folder: o.modDir, exe: o.exe, allowUnmounted: true, cache,
      aux: { lngsplit_stuff2: { raw: true, select: k => k.startsWith('resource/set/stuff/'), extract } } });
    const idx = b.idx;
    for (const k of Object.keys(idx.stuff)) {
      const ft = [...idx.fileTagsOf(k)];
      stuffSets.add(ft.filter(t => !SKIP.has(t)).sort().join(' '));
      const all = idx.tagsOf(k);
      allTagSets.push(all);
      const a = idx.aux.lngsplit_stuff2 && idx.aux.lngsplit_stuff2[k], x = a && a.data;
      if (x && x.desc) stuffDesc.add(lc(x.desc));
      // wide word pool (coordinator rule, 2026-11-18: "bullet37_ger ap" is a real item of bullet37.ger.ap.ammo): dotted name parts,
      // every run of adjacent parts joined by '_', the file's own {tag} words, its {from} pattern's tags (tagsOf), macro call names
      const parts = (idx.stuff[k].name || k.slice(k.lastIndexOf('/') + 1)).toLowerCase().split('.').filter(Boolean);
      const pool = new Set([...parts, ...all]);
      for (let i = 0; i < parts.length; i++) for (let j = i + 2; j <= parts.length; j++) pool.add(parts.slice(i, j).join('_'));
      if (x) { for (const w of x.tags) pool.add(w); for (const w of x.macros) pool.add(w); }
      widePools.push(pool);
    }
    log(`stuff ${Object.keys(idx.stuff).length}, desc fields ${stuffDesc.size} (${Date.now() - t0} ms)`);
  }
  // literal strings
  const literal = new Set();
  let scanned = 0;
  for (const k of keys) {
    if (!LIT_RE.test(k)) continue;
    let b; try { b = get(k); } catch { b = null; }
    if (!b || b.length > 8e6) continue;
    scanned++;
    const s = b.toString('latin1');
    TOK_RE.lastIndex = 0;
    let m;
    while ((m = TOK_RE.exec(s))) { const t = lc(m[1] !== undefined ? m[1] : m[2]); if (t.includes('/')) literal.add(t.replace(/^\/+/, '')); }
  }
  log(`literal scan ${scanned} files, ${literal.size} strings (${Date.now() - t0} ms)`);
  if (src.v) require('../lib/vfs').closeRecs();
  return { defs, breeds, breedBase, mapDirs, cards, infoOf, unresolvedFiles, unresolvedWords, regUnits, stuffSets, stuffDesc, allTagSets, widePools, literal, noStuff: !!o.noStuff, vanilla: o.vanillaKeys || new Map() };
}

// class folder of an entity def: '-vehicle/tank_medium/..' -> tank_medium, 'inventory/box1' -> inventory
function entityClass(facts, name) {
  const d = facts.defs.get(lc(name));
  if (!d) return null;
  const segs = d.slice().sort()[0].split('/');
  const c = segs[0].startsWith('-') && segs.length > 1 && /^-(vehicle|building|object|static)/.test(segs[0]) ? segs[1] : segs[0];
  return c.replace(/^-+/, '') || null;
}

function verdict(f, key, title) {
  const k = lc(key), segs = k.split('/');
  const lit = f.literal.has(k);
  const K = (group, reason) => ({ group, verdict: 'kept', reason });
  const D = (group, reason) => lit ? K(group, 'literal key string in a text file') : { group, verdict: 'dead', reason };
  const S = (group, reason) => lit ? K(group, 'literal key string in a text file') : { group, verdict: 'unsure', reason };
  if (title.startsWith('#')) {
    const g = 'ui:' + title;
    if (f.vanilla.has(k)) return K(g, 'vanilla key');
    return S(g, 'UI key not found as a literal string (scripts may build it)');
  }
  const [a, b] = segs;
  if (a === 'desc' && b === 'human') {
    const rest = segs.slice(2).join('/'), base = segs[segs.length - 1];
    if (!rest) return S('desc/human', 'no breed part');
    if (f.cards.has(rest)) return K('desc/human', 'MP soldier card ' + rest);
    if (f.breeds.has(rest)) return K('desc/human', 'breed file set/breed/' + rest);
    if (f.breedBase.has(base)) return K('desc/human', 'breed file of that name: set/breed/' + f.breedBase.get(base));
    if (f.unresolvedWords.has(base)) return S('desc/human', 'name appears in a units file whose macros do not resolve');
    return D('desc/human', `no breed set/breed/${rest} (any depth by name), no MP card, no literal use`);
  }
  if ((a === 'desc' || a === 'info') && (b === 'entity' || b === 'special' || b === 'armor_angle')) {
    const g = a + '/' + b;
    if (a === 'desc' && b !== 'entity') return S(g, 'no rule for this group');
    const x = segs[2];
    if (!x) return S(g, 'no name part');
    if (b !== 'armor_angle' && segs.length > 3) return S(g, 'name holds a "/"');
    if (f.defs.has(x)) return K(g, 'entity .def ' + x);
    if (f.cards.has(x)) return K(g, 'MP card ' + x);
    if (f.infoOf.has(x)) return K(g, 'card {info ' + x + '}');
    if (f.regUnits.has(x)) return K(g, 'unit.reg unit ' + x);
    if (f.unresolvedWords.has(x)) return S(g, 'name appears in a units file whose macros do not resolve');
    return D(g, `no .def ${x}, no MP card or {info} of that name, no literal use`);
  }
  if ((a === 'desc' || a === 'info') && b === 'squad') {
    const g = a + '/squad', name = segs.slice(2).join('/'), bare = name.replace(/\([^()]*\)$/, '');
    if (!name) return S(g, 'no name part');
    if (f.cards.has(name)) return K(g, 'MP card ' + name);
    if (f.infoOf.has(name)) return K(g, 'card {info ' + name + '}');
    if (a === 'desc' && f.defs.has(name)) return K(g, 'entity .def ' + name);
    // name(side) key of a card that exists under the bare name: the text was written for a real card but the engine looks up the
    // bare name (LOC-13), so it probably never shows. Kept, not parked: it is a key to rename, not a leftover (owner 2026-11-18).
    if (bare !== name && (f.cards.has(bare) || f.infoOf.has(bare))) return K(g, `MISKEYED: MP card is bare-named "${bare}", the engine looks up ${a}/squad/${bare}; rename the key to show this text`);
    if (f.unresolvedWords.has(name) || f.unresolvedWords.has(bare)) return S(g, `${bare} appears in a units file whose macros do not resolve standalone`);
    return D(g, `no MP card ${name} (units files read with macros), no {info}, no literal use`);
  }
  if (a === 'desc' && ['ammo', 'weapon', 'stuff', 'container'].includes(b)) {
    const g = 'desc/' + b, rest = segs.slice(2).join('/');
    if (f.stuffDesc.has(k)) return K(g, 'stuff {desc} field');
    if (rest.includes('/')) return S(g, 'sub-group, no stuff rule');
    const want = rest.split(' ').filter(Boolean);
    if (f.stuffSets.has(want.filter(t => !SKIP.has(t)).sort().join(' '))) return K(g, 'stuff file-name tags match');
    if (f.noStuff) return S(g, 'stuff not read (--no-stuff)');
    const words = want.filter(t => !SKIP.has(t));
    if (words.length && f.widePools.some(p => words.every(w => p.has(w)))) return K(g, 'words formed by one stuff file (dotted name parts / joined parts / {tag} / {from} pattern tags / macro names)');
    if (b === 'container') return S(g, 'no stuff gives desc/container (key not from the stuff rule)');
    if (!words.length) return S(g, 'no tag words');
    return D(g, 'no stuff file forms these words (file-name parts, joined parts, {tag}, {from} pattern tags, macro names), no {desc} field, no literal use');
  }
  if (a === 'mission' && (b === 'multi' || b === 'single')) {
    const g = 'mission/' + b, p = segs.slice(2, -1);
    if (!p.length) return S(g, 'no map part');
    for (let i = p.length; i >= 1; i--) if (f.mapDirs.has(b + '/' + p.slice(0, i).join('/'))) return K(g, `map folder map/${b}/${p.slice(0, i).join('/')}`);
    return D(g, `no map folder map/${b}/${p[0]}`);
  }
  return S(segs.slice(0, 2).join('/'), 'no rule for this group');
}

module.exports = { gather, verdict, entityClass };
