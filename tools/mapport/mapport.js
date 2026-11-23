#!/usr/bin/env node
// mapport: make Gates of Hell map files loadable on as64. Two fixes, both found by crashing real maps (PORT-72, PORT-73):
//   map.grs  GoH adds VER-/SEED chunks and 5-byte patch records, as64 reads u32 records, so width and height go wrong and
//             asks for 4 GB
//   map GoH keys as64 has no keyword for stop the load with `unexpected token`
//   map.net cell 5 (264 of 287 GoH map dirs) is fatal `Different grid cell sizes!` (PORT-70): resampled to cell 10
//            by default with rebuild.decimateNet (every 2nd cell, world size kept). --keep-cell leaves it. Other cells: reported, not changed.
// Keys that as64 reads through DDA or that fail with a warning stay in: an unknown DDA key is skipped
// an unknown extender only warns. Only keys that stop the load are dropped.
//
//   node tools/mapport/mapport.js <resource root> --out <dir> [--only text] [--dry] [--keep-cell] [--json file] [-q]
//   node tools/mapport/mapport.js <ported map root> --out <dir> --carry --goh <GoH resource root> [--as2 <AS2 resource root>] [--only text] [--dry]
//        --carry also writes what the map needs without a GoH mount (tools/mapport/carry.js): land textures from the GoH resource under the same key,
//        mtlN.mtl, AS2-key environment presets; prints bytes copied. Without --carry nothing of this runs and the output is as before.
//   node tools/mapport/units.js --log <game.log> --goh G --game A --mods a,b --out <dir>   build plan for the defs the map names and the stack lacks (units.js header)
//   node tools/mapport/mapport.js --check <resource root> [--only text] [--json file]     lists files still in GoH form, exit 1 if any
// root = any folder pakset can open (loose files and paks). Output keeps keys: <dir>/map/<name>/map, <dir>/map/<name>/map.grs
// Never writes to the root. Text stays byte exact outside the dropped blocks.
// Games: the output is the AS2 form, read by as64 [V] and by MoW:AS2 (mowas_2.exe, same data forms) [I]: the drop list, the --carry KEEP keys and
//   the rebuild names come from the as64 reader; open for MoW:AS2 until one ported map loads on mowas_2.exe (fix row). GoH is the source only.
// Author: Imperator_Aug (ARSENAL, ia-f88c70e6)
'use strict';
require('../lib/help')(__filename, [
  'ARSENAL mapport: make Gates of Hell map files load on as64 (map, map.grs, map.net). Never writes to the root.',
  'usage: ARSENAL mapport <resource root> --out <dir> [--only text] [--dry] [--keep-cell] [--json file] [-q]',
  '       ARSENAL mapport <ported map root> --out <dir> --carry --goh <GoH resource root> [--as2 <AS2 resource root>] [--only text] [--dry]',
  '       ARSENAL mapport --check <resource root> [--only text] [--json file]   (lists files still in GoH form, exit 1 if any)',
  '  --out <dir> output folder   --only <text> keep keys containing text   --dry report only   --keep-cell leave map.net cell 5',
  '  --json <file> summary   --carry add land textures and presets   --goh/--as2 resource roots for --carry   -q quiet',
  'games: output is the AS2 form for as64 and MoW:AS2 (MoW:AS2 not yet proven by a load [I]); GoH is the source',
  'example: ARSENAL mapport C:/goh/resource --out C:/work/ported --dry',
].join('\n'));
const fs = require('fs'), path = require('path');
const pakset = require('../lib/pakset');

// lowercase key path from the file's root block. Every entry here stops the load on as64, see limits/PORT4.md PORT-73
const DROP = new Set([
  'map/haze', 'map/globaltexture',
  'map/entity/areadisableeditor', 'map/entity/disableobstacleseditor',
  'map/entity/component/health', 'map/entity/component/healthbroken',
  'map/entity/volume/able/blockcamera',
  'map/entity/placer/state/storedtouch',
  'map/entity/weaponry/state', // saved aim state only; a State naming a place the entity lacks is not skipped
  // census of all 287 GoH map files (NG-MAPS 2026-11-08) [V]: 603 State blocks, all under map/entity; bodies AccuracyByMotion 568
  // (66 maps) and an empty {Weapon} 35 (7 maps, wrecks with "exploded"); no other key, so dropping the block loses only those
]);
// a block emptied by the drops goes too: an empty `able` would otherwise read as a block with no flags
const EMPTY_GOES = new Set(['map/entity/volume/able', 'map/entity/weaponry']);

// returns { text, dropped: {path: n} }. latin1 string in and out, so bytes are kept
function filterMap(s) {
  const cuts = [], dropped = {}, st = [];
  let i = 0, expect = false;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c === ';') { while (i < n && s[i] !== '\n') i++; continue; }
    if (c === '"') {
      const e = s.indexOf('"', i + 1), stop = e < 0 ? n : e + 1;
      if (expect) { st.push({ key: s.slice(i + 1, stop - 1).toLowerCase(), at: st.openAt, kids: 0, gone: 0 }); expect = false; }
      i = stop; continue;
    }
    if (c === '{') {
      if (expect) st.push({ key: '', at: st.openAt, kids: 0, gone: 0 }); // a block with no key, keep the stack even
      st.openAt = i; expect = true; i++; continue;
    }
    if (c === '}') {
      if (expect) { st.push({ key: '', at: st.openAt, kids: 0, gone: 0 }); expect = false; }
      const b = st.pop();
      if (b) {
        const parent = st[st.length - 1], p = st.map(x => x.key).concat(b.key).join('/');
        if (parent) parent.kids++;
        const drop = DROP.has(p) || (EMPTY_GOES.has(p) && b.kids > 0 && b.gone === b.kids);
        if (drop) {
          dropped[p] = (dropped[p] || 0) + 1;
          while (cuts.length && cuts[cuts.length - 1][0] >= b.at) cuts.pop(); // an outer cut swallows inner ones
          let end = i + 1;
          while (end < n && (s[end] === ' ' || s[end] === '\t')) end++;
          if (s[end] === '\r' && s[end + 1] === '\n') end += 2; else if (s[end] === '\n') end += 1;
          let start = b.at;
          while (start > 0 && (s[start - 1] === ' ' || s[start - 1] === '\t')) start--;
          if (start > 0 && s[start - 1] !== '\n') { start = b.at; end = i + 1; } // block shares its line, cut only the block
          cuts.push([start, end]);
          if (parent) parent.gone++;
        }
      }
      i++; continue;
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { i++; continue; }
    let e = i;
    while (e < n && !' \t\r\n{}";'.includes(s[e])) e++;
    if (expect) { st.push({ key: s.slice(i, e).toLowerCase(), at: st.openAt, kids: 0, gone: 0 }); expect = false; }
    i = e;
  }
  let out = '', at = 0;
  for (const [a, b] of cuts) { out += s.slice(at, a); at = b; }
  return { text: fixFilling(out + s.slice(at), dropped), dropped };
}
// {Item "x" filling "tags" 50 50}: GoH adds a second count, takes one, so Block terminator expected
const FILLING = /(\{\s*item\s+(?:"[^"]*"\s+)+(?:\d+\s+)?filling\s+(?:"[^"]*"\s*)+\d+)\s+\d+(\s*\})/ig;
// {Item "x" filled 50}: as64's `filled` takes no number, it fills to the magazine size
const FILLED = /(\{\s*item\s+(?:"[^"]*"\s+)+(?:\d+\s+)?filled)\s+\d+(\s*\})/ig;
function fixFilling(s, dropped) {
  s = s.replace(FILLED, (w, a, b) => { dropped['map/.../item/filled count'] = (dropped['map/.../item/filled count'] || 0) + 1; return a + b; });
  return s.replace(FILLING, (w, a, b) => { dropped['map/.../item/filling second count'] = (dropped['map/.../item/filling second count'] || 0) + 1; return a + b; });
}

// GoH .grs -> as64 .grs. returns { buf, form, why } form: goh|as2|bad
function convertGrs(b) {
  if (b.length < 12 || b.toString('latin1', 0, 4) !== 'GRAS') return { form: 'bad', why: 'no GRAS' };
  let p = 4, ver = null;
  while (['VER-', 'SEED'].includes(b.toString('latin1', p, p + 4))) { if (b.toString('latin1', p, p + 4) === 'VER-') ver = b.readUInt32LE(p + 4); p += 8; }
  if (b.toString('latin1', p, p + 4) !== 'PMAP') return { form: 'bad', why: 'no PMAP' };
  if (p === 4) return { form: 'as2' };
  if (ver !== 2) return { form: 'bad', why: 'version ' + ver };
  const namesAt = p; p += 4;
  const count = b.readUInt32LE(p); p += 4;
  for (let i = 0; i < count; i++) p += 1 + b[p];
  const left = b.readInt32LE(p), top = b.readInt32LE(p + 4), right = b.readInt32LE(p + 8), bottom = b.readInt32LE(p + 12);
  p += 20; // rect + cell size
  const w = right - left, h = bottom - top, cells = w * h;
  if (w < 0 || h < 0 || p + cells * 5 !== b.length) return { form: 'bad', why: 'size ' + (b.length - p) + ' for ' + cells + ' patches' };
  const out = Buffer.alloc(4 + (p - namesAt) + cells * 4);
  out.write('GRAS', 0, 'latin1');
  b.copy(out, 4, namesAt, p);
  let o = 4 + (p - namesAt), maxPattern = 0, maxVariant = 0;
  for (let i = 0; i < cells; i++, p += 5, o += 4) {
    const pattern = b[p] | b[p + 1] << 8, variant = b[p + 2];
    if (pattern > maxPattern) maxPattern = pattern;
    if (variant > maxVariant) maxVariant = variant;
    out.writeUInt32LE(((pattern & 0xfff) | (variant & 0xf) << 12 | b[p + 3] << 16 | b[p + 4] << 24) >>> 0, o);
  }
  if (maxPattern > 0xfff || maxVariant > 0xf) return { form: 'bad', why: 'pattern ' + maxPattern + ' variant ' + maxVariant };
  return { form: 'goh', buf: out, cells };
}

// loose files under <root>/map as entries with a key
function looseMaps(root) {
  const out = [], walk = (d, pre) => {
    let ds; try { ds = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const x of ds) {
      const key = pre + x.name.toLowerCase();
      if (x.isDirectory()) walk(path.join(d, x.name), key + '/');
      else if (x.isFile()) out.push({ key, file: path.join(d, x.name) });
    }
  };
  walk(path.join(root, 'map'), 'map/');
  return out;
}

function args(a) {
  const o = { _: [] };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--out') o.out = a[++i]; else if (k === '--only') o.only = a[++i]; else if (k === '--json') o.json = a[++i];
    else if (k === '--dry') o.dry = true; else if (k === '--keep-cell') o.keepCell = true; else if (k === '--check') o.check = true; else if (k === '-q') o.q = true;
    else if (k === '--carry') o.carry = true; else if (k === '--goh') o.goh = a[++i]; else if (k === '--as2') o.as2 = a[++i];
    else o._.push(k);
  }
  return o;
}

function main() {
  const o = args(process.argv.slice(2));
  if (!o._[0] || (!o.check && !o.out && !o.dry)) { console.log('usage: mapport <resource root> --out <dir> [--only text] [--dry] [--json file] [-q] | --check <resource root> [--only text]'); process.exitCode = 2; return; }
  const set = pakset.open(o._[0], {});
  const rep = require('../lib/report').createReport();   // --check findings: MAP_GRS_GOH_FORM (PORT-72), MAP_KEY_GOH_ONLY (PORT-73)
  const seen = new Set(), sum = { maps: 0, mapsChanged: 0, grs: 0, grsConverted: 0, grsAlready: 0, grsBad: [], nets: 0, netsResampled: 0, netsCell10: 0, netsCell5: 0, netsOther: [], resampled: [], bytesIn: 0, bytesOut: 0, dropped: {}, still: [] };
  const put = (key, buf) => { if (o.dry || o.check) return; const f = path.join(o.out, key); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); sum.bytesOut += buf.length; };
  // loose first: a loose file beats the same key in a pak
  for (const e of looseMaps(o._[0]).concat(set.entries)) {
    if (seen.has(e.key)) continue;
    const isMap = /^map\/.+\/map$/.test(e.key), isGrs = /^map\/.+\.grs$/.test(e.key), isNet = /^map\/.+\/map\.net$/.test(e.key);
    if (!isMap && !isGrs && !isNet) continue;
    if (o.only && !e.key.includes(o.only)) continue;
    seen.add(e.key);
    const b = e.file ? fs.readFileSync(e.file) : pakset.read(e);
    sum.bytesIn += b.length;
    if (isNet) {
      sum.nets++;
      const cell = b[0], ver = b[1];
      if (cell === 10) { sum.netsCell10++; continue; }
      if (cell !== 5 || ver !== 2) { sum.netsOther.push(e.key + ' cell ' + cell + ' v' + ver + ': no resample rule'); if (o.check) sum.still.push(e.key + ' cell ' + cell); continue; }
      sum.netsCell5++;
      if (o.check) { sum.still.push(e.key + ' cell 5: fatal `Different grid cell sizes!` on as64 (PORT-70)'); continue; }
      if (o.keepCell) { sum.netsOther.push(e.key + ' cell 5 kept (--keep-cell): fatal on as64'); continue; }
      const d = require('./rebuild').decimateNet(b);   // lazy: rebuild requires this file
      sum.netsResampled++; sum.resampled.push(e.key + ' ' + d.info.from.join('x') + ' -> ' + d.info.to.join('x'));
      put(e.key, d.buf);
      continue;
    }
    if (isMap) {
      sum.maps++;
      const s = b.toString('latin1'), r = filterMap(s);
      if (r.text === s) continue;
      sum.mapsChanged++;
      for (const [k, v] of Object.entries(r.dropped)) sum.dropped[k] = (sum.dropped[k] || 0) + v;
      if (o.check) {
        sum.still.push(e.key + ' keys ' + Object.keys(r.dropped).join(' '));
        // PORT-73: one finding per key path (filterMap keeps no line numbers)
        // weaponry/state and the item-count forms are not flagged here: AS2 vanilla maps carry weaponry/state (6 maps), so that is no GoH-only key
        for (const [k, v] of Object.entries(r.dropped).sort()) if (!/^map\/entity\/weaponry|item\//.test(k)) rep.add(e.key, 0, 'MAP_KEY_GOH_ONLY', `GoH-only key ${k} x${v}: as64 stops the map load with "unexpected token" before terrain (PORT-73). change: run mapport --out to drop it (loses only that key's data)`);
      }
      put(e.key, Buffer.from(r.text, 'latin1'));
    } else {
      sum.grs++;
      // PORT-72: a VER-/SEED header after GRAS means GoH 5-byte patch records; as64 reads u32 records, sizes go wrong, fatal ~1.5 min into load
      if (o.check && b.length >= 8 && b.toString('latin1', 0, 4) === 'GRAS' && ['VER-', 'SEED'].includes(b.toString('latin1', 4, 8))) rep.add(e.key, 0, 'MAP_GRS_GOH_FORM', 'map.grs has a VER-/SEED header and 5-byte patch records (GoH form): as64 allocates 4 GB in  and dies about 1.5 min into load (PORT-72). change: run mapport --out to rewrite the records as u32');
      const r = convertGrs(b);
      if (r.form === 'as2') { sum.grsAlready++; continue; }
      if (r.form === 'bad') { sum.grsBad.push(e.key + ': ' + r.why); continue; }
      sum.grsConverted++;
      if (o.check) sum.still.push(e.key + ' GoH grass form');
      put(e.key, r.buf);
    }
  }
  set.close();
  const car = o.carry ? runCarry(o) : null;
  if (car) sum.carry = car;
  if (o.check) sum.findings = rep.toJSON({ tool: 'mapport' }).findings;
  if (o.json) { fs.mkdirSync(path.dirname(path.resolve(o.json)), { recursive: true }); fs.writeFileSync(o.json, JSON.stringify(sum, null, 1)); }
  if (!o.q) {
    console.log('map files ' + sum.maps + ', changed ' + sum.mapsChanged + '; grs ' + sum.grs + ', converted ' + sum.grsConverted + ', already as64 form ' + sum.grsAlready + ', bad ' + sum.grsBad.length + (o.dry ? ' (dry)' : ''));
    if (sum.nets) console.log('map.net ' + sum.nets + ': cell 10 ' + sum.netsCell10 + ', cell 5 ' + sum.netsCell5 + (o.check ? ' (need resample)' : ', resampled to 10 ' + sum.netsResampled) + ', other ' + sum.netsOther.length);
    for (const x of sum.resampled.slice(0, 20)) console.log('  resampled ' + x);
    for (const x of sum.netsOther) console.log('  NET ' + x);
    for (const [k, v] of Object.entries(sum.dropped).sort((a, b) => b[1] - a[1])) console.log('  dropped ' + k + ' x' + v);
    for (const x of sum.grsBad) console.log('  BAD ' + x);
    if (o.check) for (const x of sum.still.slice(0, 50)) console.log('  ' + x);
    if (o.check) rep.print({ format: 'text' });
  }
  if (car && !o.q) printCarry(car, o);
  if (o.check && sum.still.length) process.exitCode = 1;
}

function runCarry(o) {
  if (o.check || !o.out || !o.goh) { console.error('--carry needs --out and --goh <GoH resource root>'); process.exitCode = 2; return null; }
  let as2 = o.as2;
  if (!as2) { const g = require('../lib/gamedir').resolve().dir; if (!g) { console.error('--carry needs --as2 <AS2 resource root> (no game folder found)'); process.exitCode = 2; return null; } as2 = path.join(g, 'resource'); }
  return require('./carry').carry({ root: o._[0], goh: o.goh, as2, out: o.out, only: o.only, dry: o.dry });
}
function printCarry(c, o) {
  console.log('carry: maps ' + c.maps + ', textures copied ' + c.textures + ', skipped (AS2 has) ' + c.skipped + ', mtl ' + c.mtl + ', env presets ' + c.env + ' of ' + c.envNames + ' names, ebm ' + (c.ebm || 0) + ' with frames ' + (c.frames || 0) + ', sky textures ' + (c.sky || 0) + (o.dry ? ' (dry)' : ''));
  console.log('carry: bytes copied ' + c.bytes + ' (' + (c.bytes / 1048576).toFixed(1) + ' MB), formats ' + JSON.stringify(c.formats || {}));
  if (c.envMissing.length) console.log('  env not in GoH: ' + c.envMissing.join(' '));
  for (const w of c.warnings) console.log('  WARN ' + w);
  for (const [k, v] of Object.entries(c.dropped).sort((a, b) => b[1] - a[1])) console.log('  env dropped ' + k + ' x' + v);
  if (c.origin) console.log('carry: GoH-origin ledger ' + c.origin + ' (rev-port #3: this mod carries GoH assets; no publish without a yes)');
}
module.exports = { filterMap, convertGrs, DROP };
if (require.main === module) main();
