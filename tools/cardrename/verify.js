// cardrename/verify: overlay check of an `apply --out` result. Copies the mod's resource/set and localization/ into --overlay (a
//   scratch folder; it must be empty, missing, or made by an earlier verify), lays the out files on top and compares mod vs overlay:
//   - buy list: per side/button the same cards in the same order (old names mapped through the map), nothing lost or duplicated,
//     same commented-out count, every field but the name the same (macro re-expansion: content, tags, group, cost, level, info)
//   - per card: shown name text (registry -> desc/entity -> desc/squad) and info text (entity card:
//     info/entity/<info|name>; else dialog title desc/squad/<info|name> + text info/squad/<info|name>, )
//   - every units file: sdlx error count and card count unchanged
//   prints VERIFY_* lines for each difference, then `verify: PASS|FAIL`.
// Author: Imperator_Aug (ARSENAL, ia-32a40417)
const fs = require('fs'), path = require('path');
const buylist = require('../lngsplit/buylist');
const sdlset = require('../lib/sdlset');
const sdlx = require('../lib/sdlx');
const { walkFiles, relPath } = require('../lib/report');
const cr = require('./cardrename');

const MARK = '.cardrename-overlay';
function copyTree(a, b) { if (!fs.existsSync(a)) return; for (const f of walkFiles(a, /./)) { const t = path.join(b, path.relative(a, f)); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.copyFileSync(f, t); } }

function makeOverlay(modDir, out, ov) {
  if (fs.existsSync(ov)) {
    if (fs.readdirSync(ov).length && !fs.existsSync(path.join(ov, MARK))) throw new Error(`--overlay ${ov} is not empty and not an earlier overlay`);
    fs.rmSync(ov, { recursive: true, force: true });
  }
  fs.mkdirSync(ov, { recursive: true }); fs.writeFileSync(path.join(ov, MARK), '');
  copyTree(path.join(modDir, 'resource', 'set'), path.join(ov, 'resource', 'set'));
  copyTree(path.join(modDir, 'localization'), path.join(ov, 'localization'));
  for (const f of walkFiles(out, /./)) { const rel = relPath(out, f); if (/^cardrename-map\.tsv$/i.test(rel)) continue; const t = path.join(ov, rel); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.copyFileSync(f, t); }
}

function readMap(f) {
  const m = new Map();
  for (const L of fs.readFileSync(f, 'utf8').split(/\r?\n/).slice(1)) { const c = L.split('\t'); if (c[7] === 'ok') m.set(c[0].toLowerCase(), c[1].toLowerCase()); }
  return m;
}

function view(dir, o, reg, ents) {
  const bl = buylist.read({ modDir: dir, gameDir: o.gameDir, exe: o.exe });
  const src = sdlset.createSource({ gameDir: o.gameDir, folder: dir, exe: o.exe });
  const keys = cr.readTexts(src);
  const T = k => { const a = keys.get(k.toLowerCase()); return a && a.length ? a[a.length - 1].txt : null; };
  const name = c => reg.has(c.lname) ? '(registry)' : T('desc/entity/' + c.lname) ?? T('desc/squad/' + c.lname);
  const info = c => { const id = c.info || c.lname; return ents.has(c.lname) ? ['entity', T('info/entity/' + id)] : [T('desc/squad/' + id), T('info/squad/' + id)]; };
  // units files: sdlx errors + cards per file
  const files = new Map();
  for (const [k, f] of src.local) if (k.startsWith('resource/set/multiplayer/units/')) { let n = 0; try { sdlx.read(fs.readFileSync(f), { file: k, key: k, open: src.open, onError: () => n++ }); } catch (x) { n = -1; } files.set(k, { err: n, cards: 0 }); }
  for (const c of [...bl.cards, ...bl.commented]) for (const a of [c, ...(c.also || [])]) { const x = files.get(a.where.file.toLowerCase()); if (x) x.cards++; }
  if (src.v) require('../lib/vfs').closeRecs();
  return { bl, name, info, files };
}

function run(o) {
  const modDir = path.resolve(o.modDir), ov = path.resolve(o.overlay || ''), out = path.resolve(o.out);
  if (!o.overlay) { console.error('verify needs --overlay <scratch dir>'); return 2; }
  makeOverlay(modDir, out, ov);
  const map = readMap(path.join(out, 'cardrename-map.tsv'));
  const src0 = sdlset.createSource({ gameDir: o.gameDir, folder: modDir, exe: o.exe });
  const reg = cr.regUnits(src0), ents = cr.entityNames(src0);
  const A = view(modDir, o, reg, ents), B = view(ov, o, reg, ents);
  const bad = []; const say = (code, msg) => bad.push(`${code} ${msg}`);
  const nm = s => map.get(s) || s;
  const fields = c => JSON.stringify([c.button, c.group, c.cost, c.level, c.tags, c.content, c.info ? nm(c.info) : null, c.kind, c.side, (c.also || []).length]);
  // per button order
  const lists = bl => { const m = new Map(); for (const c of bl.cards) for (const a of [c, ...c.also]) { if (!a.button) continue; const k = (a.side || '?') + '/' + a.button; if (!m.has(k)) m.set(k, []); m.get(k).push(a.lname); } return m; };
  const la = lists(A.bl), lb = lists(B.bl);
  for (const k of new Set([...la.keys(), ...lb.keys()])) { const x = (la.get(k) || []).map(nm).join(' '), y = (lb.get(k) || []).join(' '); if (x !== y) say('VERIFY_ORDER', `${k}: before ${x.slice(0, 200)} | after ${y.slice(0, 200)}`); }
  if (A.bl.cards.length !== B.bl.cards.length) say('VERIFY_COUNT', `cards ${A.bl.cards.length} -> ${B.bl.cards.length}`);
  if (A.bl.commented.length !== B.bl.commented.length) say('VERIFY_COUNT', `commented cards ${A.bl.commented.length} -> ${B.bl.commented.length}`);
  // button picture /interface/scene/unit_icon/<card name>: exists before <-> exists after
  const ICON = 'resource/interface/scene/unit_icon/', base = k => k.slice(ICON.length).replace(/\.[^.]*$/, '');
  const ic0 = new Set();
  for (const k of [...src0.local.keys(), ...(src0.v ? src0.v.files.keys() : [])]) if (k.startsWith(ICON)) ic0.add(base(k));
  const ic1 = new Set(ic0);
  for (const f of walkFiles(out, /./)) { const k = relPath(out, f).toLowerCase(); if (k.startsWith(ICON)) ic1.add(base(k)); }
  const bByName = new Map(B.bl.cards.map(c => [c.lname, c]));
  for (const c of A.bl.cards) { const d = bByName.get(nm(c.lname)); if (d && ic0.has(c.lname) !== ic1.has(d.lname)) say('VERIFY_ICON', `${c.name} -> ${d.name}: picture ${ic0.has(c.lname)} -> ${ic1.has(d.lname)}`); }
  let named = 0, same = 0;
  for (const c of A.bl.cards) {
    if (c.kind === 'soldier') continue;
    const d = bByName.get(nm(c.lname));
    if (!d) { say('VERIFY_LOST', `${c.name} -> ${nm(c.lname)} not in the overlay`); continue; }
    if (fields(c) !== fields(d)) say('VERIFY_FIELDS', `${c.name}: ${fields(c)} -> ${fields(d)}`);
    const n0 = A.name(c), n1 = B.name(d);
    if (n0 !== null) { named++; if (n0 !== n1) say('VERIFY_NAME', `${c.name} -> ${d.name}: "${n0}" -> "${n1}"`); else same++; }
    const i0 = JSON.stringify(A.info(c)), i1 = JSON.stringify(B.info(d));
    if (i0 !== i1) say('VERIFY_INFO', `${c.name} -> ${d.name}: ${i0.slice(0, 120)} -> ${i1.slice(0, 120)}`);
  }
  for (const [k, x] of A.files) { const y = B.files.get(k); if (!y) { say('VERIFY_FILE', `${k} missing`); continue; } if (x.err !== y.err || x.cards !== y.cards) say('VERIFY_FILE', `${k}: errors ${x.err} -> ${y.err}, cards ${x.cards} -> ${y.cards}`); }
  for (const b of bad) console.log(b);
  console.log(`verify: ${A.bl.cards.length} cards (${A.bl.commented.length} commented), ${map.size} renamed, ${named} with a name text (${same} same after), ${A.files.size} units files`);
  console.log(`verify: ${bad.length ? 'FAIL ' + bad.length : 'PASS'}`);
  return bad.length ? 1 : 0;
}
module.exports = { run, makeOverlay };
