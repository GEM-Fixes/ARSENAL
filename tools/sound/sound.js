#!/usr/bin/env node
// sound: decode game .wav files and show how the game plays a sound (model.js). Read-only on the game; writes only --out / temp.
//   sound info <file|key> [--distance m] [--ambient] ...   header, notes, folder settings, play plan
//   sound resolve <name> name -> folder, files, settings
//   sound decode <file|key> --out <file.wav>                plain PCM16 wav (refused inside a game folder)
//   sound play <file|key|name> [--distance m] [--bearing deg] [--loop n] [--ambient] [--duration s] [--dry] [--keep FILE]
//   sound sweep [--limit n]                                 decode every wav of the game (+ --mod/--mods): codecs, failures, notes
// common: --game DIR (default lib/gamedir), --mods a,b (vfs mods by name), --mod DIR (a mod folder over the vfs), --json,
//   --options FILE (a profile options.set) | --profile (the main profile's options.set) for the user volumes; else game defaults
//   --exe as64|mowas_2|mowas2|goh (lib/cli): the game's vfs view (sdlset createSource exe). MoW:AS2 = the AS64 rules on the mowas_2 file set
//     (no as64/core); goh: the GoH install (games.install, unless --game), the GoH play rules of model.js (GHVIS-29 folder distances,
//     GHVIS-30 folder volume on ambient, GHVIS-31 no min distance = stopped, GHVIS-33 filters.set chains: info shows them, sweep lists
//     them), --profile reads the GoH profile options.set (lib/userdir gohProfiles). No --exe: as before (the vfs picks as64 first).
// Author: Imperator_Aug (ARSENAL, ia-6a9559a6)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const cli = require('../lib/cli'), wav = require('../lib/wav'), model = require('./model');

const HELP = `sound <info|resolve|decode|play|sweep> [args]
  info <file|key>        header, notes, folder settings, how the game plays it
  resolve <name>         e.g. weapon/shot/gun or gun/85to100_cal/88mm_flak41 (weapon fireSound adds weapon/shot/)
  decode <file|key> --out <file.wav>
  play <file|key|name>   [--distance m] [--bearing deg] [--loop n] [--ambient] [--duration s] [--seed n] [--dry] [--keep FILE]
  sweep                  [--limit n] [--all-notes]
options: --game DIR  --exe as64|mowas2|goh  --mods a,b  --mod DIR  --json  --options FILE | --profile  --rolloff r  --out-rate hz`;

function args(argv) {
  const o = cli.parse(argv, { flags: ['--json', '--ambient', '--dry', '--profile', '--all-notes', '-h', '--help'], values: ['--mod', '--out', '--distance', '--bearing', '--loop', '--duration', '--seed', '--keep', '--options', '--rolloff', '--out-rate', '--limit'] });
  o.cmd = o.pos.shift();
  // cli.parse looks at AS2_GAME / as2.json only; then the Steam probe of lib/gamedir (skipped for decode of a loose file)
  // --exe goh: the GoH install only (games.install: GOH_GAME, as2.json "goh", Steam), never the AS2 install
  if (!o.gameDir && !(o.cmd === 'decode' && o.pos[0] && fs.existsSync(o.pos[0]))) {
    try { o.gameDir = (o.exe === 'goh' ? require('../lib/games').install('goh').dir : require('../lib/gamedir').resolve().dir) || null; } catch (e) { /* none */ }
  }
  o.game = o.exe === 'goh' ? 'goh' : undefined;   // model.js rules
  return o;
}

// ---------- source: vfs (+ mod folder) as { read, list } ----------
function makeSource(o) {
  if (!o.gameDir && !o.x.mod) return null;
  const sdlset = require('../lib/sdlset');
  let s;
  try { s = sdlset.createSource({ gameDir: o.gameDir || undefined, mods: o.mods.length ? o.mods : undefined, folder: o.x.mod || undefined, exe: o.exe || undefined }); }
  catch (e) { throw new Error('cannot read the game files: ' + e.message); }
  const keys = new Set();
  if (s.v) for (const k of s.v.files.keys()) keys.add(k);
  if (o.x.mod) { for (const k of s.local.keys()) keys.add(k); for (const k of s.packed().keys()) keys.add(k); }
  const byDir = new Map();
  for (const k of keys) { const d = k.slice(0, k.lastIndexOf('/')); let a = byDir.get(d); if (!a) byDir.set(d, a = []); a.push(k); }
  const mine = k => o.x.mod && (s.local.has(k) || s.packed().has(k));
  return {
    read: k => { try { return s.get(model.norm(k)); } catch (e) { return null; } },
    list: p => byDir.get(model.norm(p)) || [],
    keys: () => [...keys], mine, raw: s,
  };
}

// a file path on disk, or a virtual key ('resource/sound/..', 'sound/..', '/sound/..', '..' under sound)
function target(arg, src) {
  if (!arg) throw new Error('give a file or key');
  if (fs.existsSync(arg) && fs.statSync(arg).isFile()) {
    const p = path.resolve(arg).replace(/\\/g, '/'), m = /\/(resource\/)?sound\/(.+)$/i.exec(p);
    return { buf: fs.readFileSync(arg), file: arg, key: m ? model.norm('resource/sound/' + m[2]) : null };
  }
  let k = model.norm(arg);
  if (k.startsWith('resource/')) k = k.slice(9);
  if (k.startsWith('sound/')) k = k.slice(6);
  k = model.ROOT + '/' + k;
  if (!k.endsWith('.wav')) k += '.wav';
  const buf = src ? src.read(k) : null;
  return { buf, file: null, key: k };
}

function userOptions(o) {
  let file = o.x.options || null;
  if (!file && o.x.profile) {
    const UD = require('../lib/userdir'), p = o.game === 'goh' ? UD.gohProfiles() : UD.profiles(0);
    file = p[0] || null; if (!file) throw new Error(o.game === 'goh' ? 'no GoH profile options.set found (lib/userdir gohUserDir)' : 'no profile options.set found');
  }
  if (!file) return { file: null, values: model.options(null) };
  return { file, values: model.options(fs.readFileSync(file)) };
}

function planOpts(o, extra) {
  const uo = userOptions(o);
  return Object.assign({
    distance: o.x.distance !== undefined ? +o.x.distance : 0, bearing: o.x.bearing !== undefined ? +o.x.bearing : 0,
    ambient: !!o.x.ambient, loop: o.x.loop !== undefined ? +o.x.loop : 1, duration: o.x.duration ? +o.x.duration : 0,
    seed: o.x.seed !== undefined ? +o.x.seed : 1, rolloff: o.x.rolloff !== undefined ? +o.x.rolloff : undefined,
    outRate: o.x['out-rate'] ? +o.x['out-rate'] : undefined, volumes: uo.values,
  }, o.game ? { game: o.game } : {}, extra, { optionsFile: uo.file });
}

const out = (o, obj, text) => { if (o.x.json) process.stdout.write(JSON.stringify(obj, null, 2) + '\n'); else process.stdout.write(text(obj) + '\n'); };
const fmtNotes = ns => ns.map(n => `  [${n.level}] ${n.code}: ${n.msg}${n.key ? ' (' + n.key + (n.line ? ':' + n.line : '') + ')' : ''}`).join('\n');
const r3 = v => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);

function planText(p) {
  if (!p.ok && !p.wav) return `not playable: ${p.error || 'unknown'}\n` + fmtNotes(p.notes || []);
  const s = p.settings, g = p.gain, d = p.distances;
  return [
    `file      ${p.key}`,
    `wav       ${p.wav ? `${p.wav.codec} ${p.wav.channels}ch ${p.wav.rate} Hz ${p.wav.bits}-bit, ${p.wav.frames} frames, ${p.wav.seconds} s` : 'missing'}`,
    `folder    ${p.folderKey}  (${p.resolve.pick}${p.resolve.files.length > 1 ? ', ' + p.resolve.files.length + ' files' : ''})`,
    `settings  group ${s.group}${s.groupKnown ? '' : ' (default)'}, volume ${s.volume}, distance ${r3(s.minDistance)}..${r3(s.maxDistance)} m, priority ${s.priority}, loudness ${s.loudness || '-'}${s.signal ? `, signal ${s.signal.name} ${s.signal.radius}` : ''}`,
    `chain     ${s.chain.filter(c => c.setKey).map(c => (c.key.slice(model.ROOT.length + 1) || '(root)') + JSON.stringify(c.own)).join(' > ') || '(no folder.set)'}`,
    `play      ${p.positional ? 'positioned 3D' : 'ambient 2D'}, ${p.loop === 0 ? 'loop forever' : p.loop > 1 ? p.loop + ' passes' : 'once'}, distance ${d.distance} m, bearing ${d.bearing} deg`,
    `gain      group ${g.group} x folder ${g.folder} -> channel ${g.channel}; 3D ${g.distance}; pan ${g.pan} -> L ${g.left} R ${g.right}`,
    `miles     min ${r3(d.milesMin)} m, max ${d.milesMax === null ? 'none' : r3(d.milesMax) + ' m'}, rolloff ${d.rolloff}; low pass ${p.lowPass.active ? 'cut-off ' + p.lowPass.cutoff + ' (' + p.lowPass.hz + ' Hz)' : 'off'}`,
    `rate      file ${p.rate.file} Hz x ${p.rate.factor} -> out ${p.rate.out} Hz`,
    p.filters ? `filters   ${p.filters.present ? p.filters.chains.join(', ') + ' (' + p.filters.stages + ' stages, ' + (p.filters.applied ? 'on this positioned channel, dry at rest' : 'not on ambient plays') + ')' : 'no filters.set'}  [GoH]` : null,
    p.notes.length ? 'notes\n' + fmtNotes(p.notes) : 'notes     none',
  ].filter(x => x !== null).join('\n');
}

// ---------- commands ----------
function cmdInfo(o, src) {
  const t = target(o.pos[0], src);
  if (!t.buf) throw new Error(`not found: ${o.pos[0]}${src ? '' : ' (no game folder: give --game DIR or a file path)'}`);
  const info = wav.parse(t.buf);
  let p = null;
  if (src && t.key && t.key.startsWith(model.ROOT + '/')) p = model.plan(planOpts(o, { key: t.key, buf: t.buf }), src);
  const res = { file: t.file, key: t.key, wav: Object.assign({}, info, { chunks: info.chunks }), plan: p };
  out(o, res, r => {
    const f = r.wav.fmt;
    const head = r.wav.ok ? `${f.codec} (tag 0x${f.tag.toString(16)}) ${f.channels}ch ${f.rate} Hz ${f.bits}-bit align ${f.blockAlign}${f.samplesPerBlock ? ' spb ' + f.samplesPerBlock : ''}, ${r.wav.frames} frames, ${r3(r.wav.seconds)} s, data ${r.wav.dataBytes} bytes @${r.wav.dataOffset}` : `not usable: ${r.wav.error}`;
    return [`${r.file || r.key}`, `header    ${head}`, `chunks    ${r.wav.chunks.map(c => c.id.trim() + ':' + c.size).join(' ')}`,
      r.wav.loops && r.wav.loops.length ? `loops     ${r.wav.loops.map(l => l.start + '..' + l.end).join(' ')}` : null,
      r.plan ? planText(r.plan) : (r.wav.notes.length ? 'notes\n' + fmtNotes(r.wav.notes) : 'notes     none') + (src ? '' : '\n(no game folder: folder settings not shown)'),
    ].filter(Boolean).join('\n');
  });
}

function cmdResolve(o, src) {
  if (!src) throw new Error('resolve needs the game files: --game DIR');
  const name = o.pos[0] || '';
  const r = model.resolve(name, src.list);
  const set = model.soundSet(src.read);
  const settings = r.warn && !r.files.length ? null : model.folder(r.folderKey, src.read, set, undefined, o.game ? { game: o.game } : undefined);
  // weapon fireSound / reloadSound names get weapon/shot/ or weapon/reload/ in front
  let hint = null;
  if (r.warn) for (const pre of ['weapon/shot/', 'weapon/reload/']) if (!model.resolve(pre + name, src.list).warn) { hint = pre + name; break; }
  const res = { resolve: r, hint, settings: settings && Object.assign({}, settings, { chain: settings.chain }) };
  out(o, res, x => {
    const r0 = x.resolve, s = x.settings;
    return [`name      ${r0.name}`, `folder    ${r0.folderKey}${r0.exists ? ' (a folder)' : ' (dirname + file)'}`,
      r0.warn ? `warning   ${r0.warn} (the game logs it and plays nothing)` : `pick      ${r0.pick}${r0.fixed ? ' ' + r0.fixed : ''}`,
      x.hint ? `hint      as a weapon fireSound/reloadSound the game plays '${x.hint}' (the weapon reader adds the prefix): try that name` : null,
      `files     ${r0.files.length}${r0.files.length ? '\n' + r0.files.map(f => '  ' + f).join('\n') : ''}`,
      s ? `settings  group ${s.group}, volume ${s.volume}, distance ${r3(s.minDistance)}..${r3(s.maxDistance)} m, priority ${s.priority}, loudness ${s.loudness || '-'}${s.signal ? ', signal ' + s.signal.name + ' ' + s.signal.radius : ''}${s.anySet ? '' : ' (no folder.set in the chain)'}` : null,
      s && s.warnings.length ? 'notes\n' + fmtNotes(s.warnings) : null].filter(Boolean).join('\n');
  });
  if (r.warn) process.exitCode = 1;
}

function refuse(file, o) {
  const wg = require('../lib/writeguard');
  return wg.refuseWrite(path.resolve(file), { game: o.gameDir, purpose: 'write the decoded sound' });
}

function cmdDecode(o, src) {
  const t = target(o.pos[0], src);
  if (!t.buf) throw new Error(`not found: ${o.pos[0]}`);
  if (!o.x.out) throw new Error('decode needs --out <file.wav>');
  const why = refuse(o.x.out, o);
  if (why) throw new Error(why);
  const d = wav.decode(t.buf);
  if (!d.ok) { out(o, { ok: false, code: d.code, error: d.error, payload: d.payload || null }, x => `cannot decode: ${x.code} ${x.error}${x.payload ? ` (payload ${x.payload.codec} at ${x.payload.off}, ${x.payload.len} bytes)` : ''}`); process.exitCode = 1; return; }
  fs.writeFileSync(o.x.out, wav.encodePcm16(d));
  out(o, { ok: true, out: path.resolve(o.x.out), rate: d.rate, channels: d.channels, frames: d.frames, codec: d.codec }, x => `wrote ${x.out}: PCM16 ${x.channels}ch ${x.rate} Hz, ${x.frames} frames (from ${x.codec})`);
}

function cmdPlay(o, src) {
  const arg = o.pos[0];
  let p, buf;
  const looksFile = arg && fs.existsSync(arg) && fs.statSync(arg).isFile();
  if (looksFile || /\.wav$/i.test(arg || '')) {
    const t = target(arg, src);
    if (!t.buf) throw new Error(`not found: ${arg}`);
    buf = t.buf;
    if (src && t.key) p = model.plan(planOpts(o, { key: t.key, buf }), src);
    // a loose file plays like a vanilla folder: vanilla default loudness (sound.set: 20 0) through the root folder.set {loudness "default"}
    else p = model.plan(planOpts(o, { key: 'resource/sound/__loose__/' + path.basename(arg).toLowerCase(), buf }), model.memSource({ 'resource/sound/sound.set': '{sound {loudness "default" 20 0}}', 'resource/sound/folder.set': '{sound {loudness "default"}}' }));
  } else {
    if (!src) throw new Error('a sound name needs the game files: --game DIR');
    p = model.plan(planOpts(o, { name: arg }), src);
    if (p.key) buf = src.read(p.key);
  }
  if (!p.ok || !buf) { out(o, p, planText); process.exitCode = 1; return; }
  const d = wav.decode(buf);
  if (!d.ok) { p.notes.push({ code: 'NOT_DECODABLE', level: 'error', msg: d.error }); out(o, p, planText); process.exitCode = 1; return; }
  const loops = p.loop === 0 ? 1 : p.loop;
  const r = model.render(d, p, { loops, maxSeconds: 120 });
  const res = Object.assign({}, p, { render: { frames: r.frames, rate: r.rate, seconds: r3(r.frames / r.rate) } });
  if (o.x.keep) { const why = refuse(o.x.keep, o); if (why) throw new Error(why); fs.writeFileSync(o.x.keep, wav.encodePcm16(r)); res.render.file = path.resolve(o.x.keep); }
  if (o.x.dry) { res.render.played = false; out(o, res, x => planText(x) + `\nrender    ${x.render.seconds} s stereo ${x.render.rate} Hz (dry: not played)${x.render.file ? ' -> ' + x.render.file : ''}`); return; }
  if (process.platform !== 'win32') throw new Error('play needs Windows (PowerShell SoundPlayer); use --dry or --keep FILE');
  const tmp = path.join(os.tmpdir(), `arsenal-sound-${process.pid}-${Date.now()}.wav`);
  fs.writeFileSync(tmp, wav.encodePcm16(r));
  try {
    if (!o.x.json) process.stdout.write(planText(p) + `\nplaying   ${res.render.seconds} s ...\n`);
    const ps = cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(New-Object System.Media.SoundPlayer '${tmp.replace(/'/g, "''")}').PlaySync()`], { shell: false, stdio: 'ignore', timeout: 180000 });
    res.render.played = ps.status === 0;
    if (ps.status !== 0) process.exitCode = 1;
  } finally { try { fs.unlinkSync(tmp); } catch (e) { /* gone */ } }
  if (o.x.json) out(o, res, () => '');
}

function cmdSweep(o, src) {
  if (!src) throw new Error('sweep needs the game files: --game DIR (or --mod DIR)');
  const t0 = Date.now();
  let keys = src.keys().filter(k => k.startsWith(model.ROOT + '/') && k.endsWith('.wav')).sort();
  if (o.x.limit) keys = keys.slice(0, +o.x.limit);
  const set = model.soundSet(src.read), cache = new Map();
  const res = { wav: keys.length, decoded: 0, failed: [], byCodec: {}, byFormat: {}, notes: {}, noteFiles: {}, frames: 0, seconds: 0, folders: { count: 0, noFolderSet: [], warnings: [] }, soundSet: { loudness: set.order.length, errors: set.errors }, mod: o.x.mod || null, mods: o.mods, ms: 0 };
  const folders = new Set();
  for (const k of keys) {
    const b = src.read(k);
    if (!b) { res.failed.push({ key: k, code: 'UNREADABLE', error: 'cannot read' }); continue; }
    const d = wav.decode(b), p = d.parse || wav.parse(b);
    const codec = p.ok ? p.fmt.codec : p.kind;
    res.byCodec[codec] = (res.byCodec[codec] || 0) + 1;
    if (p.ok) { const f = `${p.fmt.codec} ${p.fmt.channels}ch ${p.fmt.rate} ${p.fmt.bits}b`; res.byFormat[f] = (res.byFormat[f] || 0) + 1; }
    if (d.ok) { res.decoded++; res.frames += d.frames; res.seconds += d.frames / d.rate; }
    else res.failed.push({ key: k, code: d.code, error: d.error });
    for (const n of p.notes) { res.notes[n.code] = (res.notes[n.code] || 0) + 1; (res.noteFiles[n.code] = res.noteFiles[n.code] || []).push(k); }
    folders.add(k.slice(0, k.lastIndexOf('/')));
  }
  for (const fk of [...folders].sort()) {
    const s = model.folder(fk, src.read, set, cache, o.game ? { game: o.game } : undefined);
    if (!s.anySet) res.folders.noFolderSet.push(fk);
  }
  const seenW = new Set();
  for (const s of cache.values()) for (const w of s.warnings) { const id = w.key + w.code + w.line; if (!seenW.has(id)) { seenW.add(id); res.folders.warnings.push(w); } }
  res.folders.count = folders.size;
  res.seconds = Math.round(res.seconds);
  const music = src.keys().filter(k => k.startsWith('resource/music/'));
  res.music = { files: music.length, byExt: music.reduce((a, k) => { const e = k.slice(k.lastIndexOf('.')); a[e] = (a[e] || 0) + 1; return a; }, {}) };
  if (o.game === 'goh') { const f = model.filtersSet(src.read); res.filters = { present: f.present, stages: f.stages, chains: f.chains, errors: f.errors }; }
  res.ms = Date.now() - t0;
  if (!o.x['all-notes']) for (const c of Object.keys(res.noteFiles)) if (res.noteFiles[c].length > 40) res.noteFiles[c] = res.noteFiles[c].slice(0, 40).concat([`... ${res.noteFiles[c].length - 40} more (--all-notes)`]);
  out(o, res, r => [
    `wav ${r.wav}, decoded ${r.decoded}, failed ${r.failed.length}, ${Math.round(r.seconds / 60)} min of sound, ${r.folders.count} folders (${r.ms} ms)`,
    'codecs    ' + Object.entries(r.byCodec).map(([k, v]) => `${k} ${v}`).join(', '),
    'formats\n' + Object.entries(r.byFormat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${String(v).padStart(5)} ${k}`).join('\n'),
    'notes     ' + (Object.entries(r.notes).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'),
    ...Object.entries(r.noteFiles).filter(([k]) => k !== 'STEREO' || o.x['all-notes']).map(([k, v]) => `  ${k}:\n` + v.map(x => '    ' + x).join('\n')),
    r.failed.length ? 'failed\n' + r.failed.map(f => `  ${f.key}: ${f.code} ${f.error}`).join('\n') : 'failed    none',
    `no folder.set in chain: ${r.folders.noFolderSet.length}` + (r.folders.noFolderSet.length ? '\n' + r.folders.noFolderSet.map(x => '  ' + x).join('\n') : ''),
    r.folders.warnings.length ? 'folder.set notes\n' + fmtNotes(r.folders.warnings) : 'folder.set notes: none',
    `sound.set ${r.soundSet.loudness} loudness` + (r.soundSet.errors.length ? '\n' + fmtNotes(r.soundSet.errors) : ''),
    `music     ${r.music.files} files ${JSON.stringify(r.music.byExt)} (streams)`,
    r.filters ? `filters   ${r.filters.present ? r.filters.chains.map(c => c.name + '[' + c.filters.map(f => f.type).join('+') + ']').join(' ') + ', ' + r.filters.stages + ' stages' : 'no filters.set'} (GoH, GHVIS-33)` + (r.filters.errors.length ? '\n' + fmtNotes(r.filters.errors) : '') : null,
  ].filter(x => x !== null).join('\n'));
}

function main() {
  const o = args(process.argv.slice(2));
  if (!o.cmd || o.x.h || o.x.help) { console.log(HELP); if (!o.cmd && !o.x.h && !o.x.help) process.exitCode = 2; return; }
  const src = o.cmd === 'decode' && o.pos[0] && fs.existsSync(o.pos[0]) ? null : makeSource(o);
  const C = { info: cmdInfo, resolve: cmdResolve, decode: cmdDecode, play: cmdPlay, sweep: cmdSweep }[o.cmd];
  if (!C) throw new Error(`unknown command '${o.cmd}'\n` + HELP);
  C(o, src);
}

if (require.main === module) cli.run(main);
module.exports = { args, target, makeSource, planText };
