// goh2as2 sub-commands (GOH2-FX, the hand steps of cov-l8i). Each writes only under the mod folder it is given (<mod>/resource/..).
//   goh2as2 pot2lng  --pot <file.pot | GoH key> [--goh <GoH dir>] (--ctx <msgctxt> | --msgid <text>) <mod> --file <rel .lng> --key <lng key> [--force] [--game G] [--dry-run]
//       GoH .pot row (msgctxt = key, msgid = English text) into an AS2 .lng slot; the write is tools/lng-add (UTF-8, byte-preserving, LOC-05)
//   goh2as2 wav2story --goh <GoH dir> --wav <GoH key .wav> <mod> --key <sound key, e.g. mission/multi/edrun_test/story> [--dry-run]
//       GoH wav copied to <mod>/resource/sound/<key>.wav (the key the mission names, no extension); a non-RIFF/WAVE file is refused
//   goh2as2 anmswap --anm <file.anm | GoH key> [--goh <GoH dir>] --names <file, one vanilla anm key per line> <mod> [--game G] [--dry-run]
//       one .anm copied under every vanilla name listed (properties/animation/human/stand_idle.anm ...); with --game a name vanilla lacks is warned
// codes: X_NOT_FOUND X_NO_ROW X_AMBIG_ROW X_NOT_WAV X_BAD_KEY X_OUT_REFUSED (exit 2); WARN_X_NAME_NOT_VANILLA (written anyway)
// Author: Imperator_Aug (ARSENAL, ia-eb9612bb)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');

const die = (code, msg) => { console.error(`error: ${code} ${msg}`); process.exit(2); };
function parse(a, flags) {   // flags: name -> 1 (takes a value) | 0 (switch); the one bare arg is the mod
  const o = { _: [] };
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    if (x.startsWith('--')) { const n = x.slice(2); if (!(n in flags)) die('X_BAD_ARG', 'unknown arg ' + x); if (flags[n]) { if (i + 1 >= a.length) die('X_BAD_ARG', x + ' needs a value'); o[n] = a[++i]; } else o[n] = true; }
    else o._.push(x);
  }
  if (o._.length !== 1) die('X_BAD_ARG', 'give exactly one mod folder');
  o.mod = o._[0];
  return o;
}
// a source: a real file path, else a GoH virtual key (loose or in a pak) read through goh2as2's index
function readSrc(spec, goh) {
  if (fs.existsSync(spec) && fs.statSync(spec).isFile()) return { buf: fs.readFileSync(spec), from: spec };
  if (!goh) die('X_NOT_FOUND', `${spec}: no such file (give --goh to read a GoH key)`);
  const g = require('./goh2as2'), idx = g.buildIndex(goh), k = spec.toLowerCase().replace(/\\/g, '/').replace(/^\/?(resource\/)?/, '');
  const e = idx.map.get(k); if (!e) { idx.ps.close(); die('X_NOT_FOUND', `${k}: not in GoH data`); }
  const buf = g.readEnt(e); idx.ps.close();
  return { buf, from: 'GoH ' + k };
}
const keyOk = k => k && !/(^|\/)\.\.(\/|$)/.test(k) && !path.isAbsolute(k) && !/[:*?"<>|]/.test(k);
function put(o, rel, buf) {
  const p = path.join(o.mod, 'resource', rel);
  let st = null; try { st = fs.lstatSync(p); } catch { /* new */ }
  if (st && (st.isSymbolicLink() || st.nlink > 1)) die('X_OUT_REFUSED', `${p} is a link: writing would change the file it points at`);
  if (!o['dry-run']) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); }
  console.log(`${o['dry-run'] ? 'would write' : 'wrote'} ${p} (${buf.length} bytes)`);
}
function modCheck(o) { if (!fs.existsSync(o.mod) || !fs.statSync(o.mod).isDirectory()) die('X_NOT_FOUND', `mod folder ${o.mod} not found (make it with newmod)`); }

// .pot row text: the existing tools/lng parser rules (msgctxt starts a row; "..." continuation lines; \n \t \" \\ escapes)
function potRows(buf) {
  const t = buf.toString('utf8').replace(/^﻿/, ''), rows = []; let cur = null, st = null;
  const un = s => s.replace(/\\(.)/g, (m, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
  const flush = () => { if (cur) rows.push({ ctx: un(cur.ctx), id: un(cur.id), str: un(cur.str) }); cur = null; };
  for (const raw of t.split('\n')) {
    const l = raw.replace(/\r$/, '').trim(); let m;
    if (l.startsWith('#')) continue;
    if ((m = /^msgctxt\s+"(.*)"$/.exec(l))) { flush(); cur = { ctx: m[1], id: '', str: '' }; st = 'ctx'; }
    else if (!cur) continue;
    else if ((m = /^msgid\s+"(.*)"$/.exec(l))) { cur.id = m[1]; st = 'id'; }
    else if ((m = /^msgstr\s+"(.*)"$/.exec(l))) { cur.str = m[1]; st = 'str'; }
    else if ((m = /^"(.*)"$/.exec(l))) cur[st] += m[1];
  }
  flush();
  return rows;
}
function pot2lng(a) {
  const o = parse(a, { pot: 1, goh: 1, ctx: 1, msgid: 1, file: 1, key: 1, force: 0, game: 1, 'dry-run': 0 });
  if (!o.pot || !o.file || !o.key || (!o.ctx && !o.msgid)) die('X_BAD_ARG', 'usage: as2 goh2as2 pot2lng --pot f (--ctx c | --msgid t) <mod> --file x.lng --key k');
  modCheck(o);
  const rows = potRows(readSrc(o.pot, o.goh).buf).filter(r => o.ctx ? r.ctx === o.ctx : r.id === o.msgid);
  if (!rows.length) die('X_NO_ROW', `no .pot row with ${o.ctx ? 'msgctxt ' + JSON.stringify(o.ctx) : 'msgid ' + JSON.stringify(o.msgid)}`);
  if (rows.length > 1 && new Set(rows.map(r => r.id)).size > 1) die('X_AMBIG_ROW', `${rows.length} rows match with different text; give --ctx`);
  const text = rows[0].id, esc = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t');   // lng-add reads these escapes back
  console.log(`pot row ${rows[0].ctx}: ${JSON.stringify(text)}`);
  const args = [path.join(__dirname, '..', 'lng-add', 'lng-add.js'), o.mod, '--file', o.file, '--key', o.key, '--text', esc];
  if (o.force) args.push('--force'); if (o.game) args.push('--game', o.game); if (o['dry-run']) args.push('--dry-run');
  const r = cp.spawnSync(process.execPath, args, { encoding: 'utf8' });
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  process.exitCode = r.status;
}
function wav2story(a) {
  const o = parse(a, { goh: 1, wav: 1, key: 1, 'dry-run': 0 });
  if (!o.wav || !o.key) die('X_BAD_ARG', 'usage: as2 goh2as2 wav2story --goh G --wav <key.wav> <mod> --key <sound key>');
  modCheck(o);
  const k = o.key.toLowerCase().replace(/\\/g, '/').replace(/^\/?(resource\/)?(sound\/)?/, '').replace(/\.wav$/, '');
  if (!keyOk(k)) die('X_BAD_KEY', o.key);
  const s = readSrc(o.wav, o.goh);
  if (s.buf.length < 12 || s.buf.toString('latin1', 0, 4) !== 'RIFF' || s.buf.toString('latin1', 8, 12) !== 'WAVE') die('X_NOT_WAV', `${s.from} is not a RIFF/WAVE file`);
  put(o, 'sound/' + k + '.wav', s.buf);
}
function anmswap(a) {
  const o = parse(a, { anm: 1, goh: 1, names: 1, game: 1, 'dry-run': 0 });
  if (!o.anm || !o.names) die('X_BAD_ARG', 'usage: as2 goh2as2 anmswap --anm <anm> --names <file> <mod> [--game G]');
  modCheck(o);
  const s = readSrc(o.anm, o.goh);
  const names = fs.readFileSync(o.names, 'utf8').split(/\r?\n/).map(l => l.replace(/#.*/, '').trim().toLowerCase().replace(/\\/g, '/').replace(/^\/?(resource\/)?/, '')).filter(Boolean);
  if (!names.length) die('X_BAD_ARG', o.names + ': no names');
  let van = null;
  if (o.game) { const g = require('./goh2as2'); van = g.buildIndex(o.game); }
  let n = 0;
  for (const k of names) {
    if (!/\.anm$/.test(k) || !keyOk(k)) die('X_BAD_KEY', k + ' (want a resource-relative .anm key)');
    if (van && !van.map.has(k)) console.log(`WARN_X_NAME_NOT_VANILLA ${k}: vanilla AS2 has no such anm, nothing reads it unless a mod names it`);
    put(o, k, s.buf); n++;
  }
  if (van) van.ps.close();
  console.log(`anmswap: ${s.from} under ${n} name(s)`);
}
const SUBS = { pot2lng, wav2story, anmswap,
  stuffport: a => require('./stuffport').stuffport(a),    // COV-L8K: GoH stuff file + macro map (stuffport.js)
  avicheck: a => require('./avicheck').main(a) };          // COV-L8K: AVI codec/size check (avicheck.js)
module.exports = { SUBS, potRows, parse, die, modCheck, put, keyOk, readSrc };
