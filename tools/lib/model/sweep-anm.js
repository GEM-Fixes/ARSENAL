// sweep-anm: round-trip every vanilla .anm through tools/lib/model/anm.js (parse then write must be byte-identical).
// usage: node tools/lib/model/sweep-anm.js <gameDir> [--sample N] [--mods] [--exe as64|mowas_2|mowas2|goh]
//   --exe (sweepargs.js): mowas_2 leaves the as64/ folder out (MoW:AS2 does not mount as64/core); goh with no <gameDir> = the GoH
//   install; none or as64 = every folder, as before.
//   reads in place: loose *.anm and *.anm entries of every *.pak / *.pat under <gameDir> (the mods folder only with --mods).
//   prints `<total> files, <same> identical, <diff> differ, <err> unreadable`, counts per version and per frame-chunk kind,
//   the engine problems seen (obj.problems, by kind), and the first 10 failing paths with the reason.
//   --sample N: every k-th file so about N are read. exit 1 when any file differs or is unreadable.
// Author: Imperator_Aug (ARSENAL, ia-19745c58)
'use strict';
const fs = require('fs'), path = require('path');
const pak = require('../pak'), anm = require('./anm');

function walk(dir, mods, out) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!mods && e.name.toLowerCase() === 'mods' && dir === out.root) continue; if (out.noAs64 && e.name.toLowerCase() === 'as64' && dir === out.root) continue; walk(p, mods, out); }
    else if (/\.(pak|pat)$/i.test(e.name)) out.paks.push(p);
    else if (/\.anm$/i.test(e.name)) out.loose.push(p);
  }
}

function main(argv0) {
  const X = require('./sweepargs').cli(argv0), argv = X.args;
  const gameDir = require('./sweepargs').gameFor(argv.find(a => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--sample'), X.exe, () => null);
  if (!gameDir) { console.log('usage: node tools/lib/model/sweep-anm.js <gameDir> [--sample N] [--mods]'); return 2; }
  const si = argv.indexOf('--sample'), sample = si >= 0 ? Number(argv[si + 1]) : 0;
  const t0 = Date.now();
  const found = { root: gameDir, paks: [], loose: [], noAs64: X.exe === 'mowas_2' };
  walk(gameDir, argv.includes('--mods'), found);
  const items = [];
  for (const f of found.loose) items.push({ name: path.relative(gameDir, f).replace(/\\/g, '/'), read: () => fs.readFileSync(f) });
  for (const p of found.paks) {
    let ents; try { ents = pak.list(p); } catch (e) { items.push({ name: path.relative(gameDir, p), read: () => { throw e; } }); continue; }
    for (const ent of ents) if (/\.anm$/i.test(ent.name)) items.push({ name: path.relative(gameDir, p).replace(/\\/g, '/') + ':' + ent.name, read: () => pak.read(ents, ent) });
  }
  const step = sample > 0 && items.length > sample ? items.length / sample : 1;
  let total = 0, same = 0, diff = 0, err = 0;
  const vers = {}, kinds = {}, probs = {}, fails = [];
  for (let k = 0; k < items.length; k += step) {
    const it = items[Math.floor(k)];
    total++;
    let buf, o;
    try { buf = it.read(); o = anm.parse(buf); } catch (e) { err++; fails.push(`${it.name}: threw ${e.message}`); continue; }
    if (o.error) { err++; if (fails.length < 10) fails.push(`${it.name}: ${o.error}`); }
    const v = '0x' + o.version.toString(16); vers[v] = (vers[v] || 0) + 1;
    const ks = [...new Set(o.chunks.filter(c => c.recs).map(c => c.tag))].join('+') || 'none';
    kinds[ks] = (kinds[ks] || 0) + 1;
    for (const p of o.problems) { const key = p.replace(/\d+/g, 'N').replace(/bone \S+ keyed/, 'bone X keyed'); probs[key] = (probs[key] || 0) + 1; }
    let w;
    try { w = anm.write(o); } catch (e) { if (!o.error) { err++; fails.push(`${it.name}: write threw ${e.message}`); } continue; }
    if (w.equals(buf)) { if (!o.error) same++; }
    else { diff++; let at = 0; while (at < w.length && w[at] === buf[at]) at++; fails.push(`${it.name}: differs at byte ${at} (in ${buf.length}, out ${w.length})`); }
  }
  console.log(`${total} files, ${same} identical, ${diff} differ, ${err} unreadable  (${Date.now() - t0} ms)`);
  console.log('versions: ' + Object.entries(vers).map(([k, v]) => `${k} ${v}`).join(', '));
  console.log('frame chunk kinds: ' + Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(', '));
  for (const [k, v] of Object.entries(probs).sort((a, b) => b[1] - a[1])) console.log(`problem x${v}: ${k}`);
  for (const f of fails.slice(0, 10)) console.log('FAIL ' + f);
  return diff || err ? 1 : 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { main };
