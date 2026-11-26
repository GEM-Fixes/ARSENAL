#!/usr/bin/env node
// ship: write the stock index of a game install as the file the installer carries 6), so the first mod check
// a new PC does not build it (~7 min). Build machine only; reads the game, writes only into --out and the per-user cache.
//   node tools/entityindex/ship.js --game <dir> [--exe as64|mowas_2|call_to_arms] --out <dir> [--no-build | --plain]
//   --exe       the game view (call_to_arms = goh). Default: goh for a GoH folder, as64 when as64.exe is there, else mowas_2.
//   build       refcheck <game> --exe X refreshes the stock cache first (the same cache a check makes, with refcheck's per-file
//               tables; nothing is parsed when it is up to date). --plain: entityindex build only (no refcheck tables).
//               --no-build: take the current cache as it is (it must fit the game).
//   writes      <out>/vanilla.<exe>.<fp 12 hex>.json.gz: the cache with meta.game dropped and meta.paks (name|size of each pak the
//               fingerprint reads) added; entityindex findShipped reads it. Refused: a cache that is partial, of another game or
//               fingerprint, built with mods, or that holds the install path. Prints the file name and size.
// One AS2 file serves both exes (the other exe seeds from it); ship both for an exact match on each.
// exit 0 written, 1 failed, 2 bad call
// Author: Imperator_Aug (ARSENAL, ia-b0e65767)
'use strict';
require('../lib/help')(__filename);
const fs = require('fs'), path = require('path'), zlib = require('zlib'), { spawnSync } = require('child_process');
const ix = require('./index');
const die = (m, c = 1) => { console.error('ship: ' + m); process.exit(c); };

async function main(a = process.argv.slice(2)) {
  const o = { build: 'refcheck' };
  for (let i = 0; i < a.length; i++) {
    const v = () => { if (a[i + 1] === undefined) die(a[i] + ' needs a value', 2); return a[++i]; };
    if (a[i] === '--game') o.game = path.resolve(v());
    else if (a[i] === '--exe') o.exe = v();
    else if (a[i] === '--out') o.out = path.resolve(v());
    else if (a[i] === '--no-build') o.build = 'none';
    else if (a[i] === '--plain') o.build = 'plain';
    else die('unknown option ' + a[i] + ' (--help lists them)', 2);
  }
  if (!o.game || !o.out) die('--game <dir> and --out <dir> are needed', 2);
  if (!fs.existsSync(o.game)) die('no game folder ' + o.game, 2);
  let exe;
  if (o.exe) { exe = /^call_to_arms$/i.test(o.exe) ? 'goh' : (() => { try { return ix.normExe(o.exe); } catch (e) { return die(e.message, 2); } })(); }
  else exe = require('../lib/games').detect(o.game) === 'goh' ? 'goh' : fs.existsSync(path.join(o.game, 'as64.exe')) ? 'as64' : 'mowas_2';
  const real = ix.realGame(o.game), fp = ix.gameFp(real, exe);
  if (!fp) die('no pak in ' + real + ': nothing to ship (a loose folder has no fingerprint)');
  const van = path.join(__dirname, 'cache', 'vanilla.json'), cache = ix.cachePath(van, exe, o.game);

  if (o.build === 'refcheck') {
    const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'refcheck', 'refcheck.js'), o.game, '-q', '--no-rc', '--exe', exe], { encoding: 'utf8', maxBuffer: 1 << 28 });
    if (r.status !== 0 && r.status !== 1) die('refcheck ended with ' + r.status + ': ' + (r.stderr || '').trim().split('\n').slice(-5).join(' | '));
  } else if (o.build === 'plain') {
    await ix.buildAsync({ gameDir: o.game, exe, cache: van, shipped: false });
  }

  const m = fs.existsSync(cache) ? ix.metaHead(cache) : null;
  if (!m) die('no stock cache ' + cache + (o.build === 'none' ? ' (run without --no-build)' : ''));
  const bad = [];
  if (m.version !== ix.VERSION) bad.push(`index version ${m.version}, not ${ix.VERSION}`);
  if (m.partial) bad.push('a checkpoint of a build that did not finish');
  if (m.exe !== exe) bad.push(`built for exe ${m.exe}, not ${exe}`);
  if (m.fp !== fp) bad.push('built for another fingerprint (the game changed since: run without --no-build)');
  if (m.mods && m.mods.length) bad.push('built with mods mounted: ' + m.mods.join(', '));
  if (m.folder) bad.push('built with a folder');
  if (bad.length) die(cache + ':\n  ' + bad.join('\n  '));

  const text = fs.readFileSync(cache, 'utf8'), d = JSON.parse(text);
  delete d.meta.game; delete d.meta.folder;
  d.meta.paks = ix.pakList(real, exe);
  const out = JSON.stringify(d);
  // no path of this machine may go into a file that ships
  const low = out.toLowerCase();
  for (const p of new Set([real, o.game])) for (const f of [p, p.split('\\').join('/'), p.split('\\').join('\\\\')]) if (low.includes(f.toLowerCase())) die('the index holds the install path ' + f + ': not shipped');
  if (/[a-z]:(?:\\\\|\/)users(?:\\\\|\/)|"\/home\/|"\/users\//i.test(out)) die('the index holds a user folder path: not shipped');

  const gz = zlib.gzipSync(Buffer.from(out, 'utf8'), { level: 9 });
  const name = `vanilla.${exe}.${fp.slice(0, 12)}.json.gz`, file = path.join(o.out, name), tmp = file + '.' + process.pid + '.part';
  fs.mkdirSync(o.out, { recursive: true });
  fs.writeFileSync(tmp, gz); fs.renameSync(tmp, file);
  const n = Object.keys(d.entities || {}).length;
  console.log(`ship: ${file} ${gz.length} bytes (${(gz.length / 1048576).toFixed(2)} MB, ${n} entities, exe ${exe}, from ${(text.length / 1048576).toFixed(1)} MB)`);
}
main().catch(e => die(e && e.stack || String(e)));
