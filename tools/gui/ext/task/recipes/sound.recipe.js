// recipe "make or change a sound": where it plays, the game sound it starts from, the wav files, conversion for the game, how it is
// heard (mixer channel, loudness class, volume, the signal bots hear, a new loudness class) and the weapon that fires it.
// Contract: ../README.md. Census: census/sound.json.
// make: gen ops (soundclass for a new loudness row, sound for the folder with its wavs and folder.set, set for a weapon's
// fireSound / reloadSound). change: copies over the game file names. A file the game would not play right goes through the Art
// page's POST /api/x/art/wav-convert (dry in plan, restore point at Write); it runs after gen and copies and writes over them.
// Also the helper the voice recipe uses (module.exports._lib). Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-74b77776)
'use strict';
const fs = require('fs'), path = require('path');

const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const art = () => require('../../art/core');
// a sound name as the game writes it: relative to sound/, no extension, forward slashes, lower case
const norm = s => String(s == null ? '' : s).replace(/\\/g, '/').toLowerCase().trim().replace(/^\/+/, '').replace(/^resource\//, '').replace(/^sound\//, '').replace(/\.wav$/, '').replace(/\/+$/, '');
const pad2 = n => (n < 10 ? '0' : '') + n;
// the task's game: the given id (c.game, o.game, opt.game), else ctx.task (README "The game of a task"), else ctx.gameId (a string in
// values, a function in a route), nothing = as64. gameOf -> the game as art/core takes it: the AS2 folder as a string for AS64 (as
// before), {dir, exe: 'mowas_2', kind: 'as2'} for MoW:AS2 (the same install without as64/core; art/core keys its cache by the exe)
function gidOf(ctx, g) {
  if (g) return String(g);
  if (ctx && ctx.task && ctx.task.id) return String(ctx.task.id);
  try { const x = ctx && ctx.gameId; return String((typeof x === 'function' ? x.call(ctx) : x) || 'as64'); } catch (e) { return 'as64'; }
}
// Gates of Hell (2026-11-23): {dir: the GoH install, exe 'goh', kind 'goh'}; its make is sound.goh.js (a folder.set naming its keys)
const SGH = () => require('./sound.goh');
function gameIn(dir, gid) {
  if (!dir) return null;
  if (gid === 'goh') return SGH().gameG(dir);
  const G = require('../../../../lib/games').get(gid);
  return G && G.id !== 'as64' && G.kind === 'as2' ? { dir, exe: G.exe, kind: 'as2' } : dir;
}
const gameOf = (ctx, game) => {
  const gid = gidOf(ctx, game);
  let d = null; try { d = gid === 'goh' ? SGH().gohDir(ctx) : (ctx && ctx.game && ctx.game()) || null; } catch (e) { d = null; }
  return gameIn(d, gid);
};
const isGohG = g => !!(g && typeof g === 'object' && g.kind === 'goh');
function viewOf(g, mod) { const C = art(); return C.view(g, mod && fs.existsSync(mod) ? mod : null); }
const WAV_NAME = /^[a-z0-9_ .()-]+\.wav$/;   // what the gen sound and voice ops accept as a file name

// a name -> {name, folder: true|false|null, files: [keys], setKey}
function soundAt(V, name) {
  const n = norm(name), base = 'resource/sound/' + n, files = [];
  if (!n) return { name: n, folder: null, files };
  for (const k of V.keys()) if (k.startsWith(base + '/') && k.endsWith('.wav') && k.slice(base.length + 1).indexOf('/') < 0) files.push(k);
  if (files.length) return { name: n, folder: true, files: files.sort(), setKey: V.has(base + '/folder.set') ? base + '/folder.set' : null };
  if (V.has(base + '.wav')) return { name: n, folder: false, files: [base + '.wav'], setKey: null };
  return { name: n, folder: null, files };
}

// game-ready = what vanilla ships: PCM16 or IMA ADPCM at 44100 or 22050 Hz (census sound.json wav.codec, wav.rate; FMT-14); Gates of
// Hell (goh true) ships 48000 Hz PCM16 too (a sample of its wavs [V 2026-11-23])
const RATES = goh => (goh ? [44100, 22050, 48000] : [44100, 22050]);
function wavFacts(file, goh) {
  const W = require('../../../../lib/wav'), p = W.parse(fs.readFileSync(file));
  if (!p.ok) return { ok: false, why: p.kind || p.error };
  const f = p.fmt || {}, tag = p.tag != null ? p.tag : f.tag;
  return { ok: true, tag, bits: f.bits, rate: f.rate, channels: f.channels, ready: ((tag === 1 && f.bits === 16) || tag === 0x11) && RATES(goh).includes(f.rate) };
}
// what the converter must do with a brought file: null = the file plays as it is; else {format: ima|pcm16, rate: number|null}
// mode: auto | ima | pcm16; rate: keep | 44100 | 22050
function convertSpec(file, mode, rate, goh) {
  const fx = wavFacts(file, goh);
  if (!fx.ok) throw bad('The file ' + path.basename(file) + ' is not a wav the game can read (' + fx.why + '). Save it as WAV in an audio editor (Audacity) or with ffmpeg, then bring it again.');
  const r = rate === '44100' || rate === '22050' ? Number(rate) : null;
  const needRate = r && r !== fx.rate, wrongRate = !RATES(goh).includes(fx.rate);
  const fmt = mode === 'pcm16' ? 'pcm16' : mode === 'ima' ? 'ima' : (fx.tag === 1 && fx.bits === 16 ? 'pcm16' : 'ima');
  const want = mode === 'ima' ? fx.tag !== 0x11 : mode === 'pcm16' ? !(fx.tag === 1 && fx.bits === 16) : !fx.ready;
  if (!want && !needRate && !wrongRate) return null;
  return { format: fmt, rate: needRate ? r : wrongRate ? 44100 : null };
}
// one wav-convert call: src (a staged file) -> out (a key in the mod), written over what gen or a copy put there
// The route answers ok:false for "worked, with a warning" (stereo stays stereo); the call's own ok() decides (README change 38): a
// plan that read the file, or a write that wrote it, passes. The stereo warning is a compile note (see compile).
const convertOk = r => !!(r && !r.error && r.dest && (r.plan || (r.written && fs.existsSync(r.dest))));
const convertCall = (src, out, spec) => ({ route: 'POST /api/x/art/wav-convert', body: { src, out, format: spec.format, rate: spec.rate, overwrite: true }, ok: convertOk });
// how one brought file reaches the mod: {file (to copy or give gen), spec (a route call still to make) | null}
const routeOf = (c, file, spec) => ({ file, spec: spec || null });
// a stereo file made mono in the staging folder (lib/wav toMono, the mean of the channels, 16 bit PCM, rate kept) for what a copy or
// the wav-convert route writes (neither downmixes); what the gen sound or voice op writes gets mono: true instead (GEN_SOUND_MONO)
function monoFile(c, file) {
  const fx = wavFacts(file); if (!fx.ok || fx.channels === 1) return file;
  const W = require('../../../../lib/wav'), d = W.decode(fs.readFileSync(file));
  if (!d.ok || !d.pcm) return file;
  const out = path.join(c.staging, 'mono', path.basename(file));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, W.encodePcm16(W.toMono(d)));
  return out;
}
// upload check (README change 50, picker.check): a wav the game's reader parses, and for a make a file name the gen op takes
const wavCheck = (named, pre) => f => {
  const p = require('../../../../lib/wav').parse(f.bytes);
  if (!p.ok) return { key: pre + '.e.wav', params: { n: f.name, w: String(p.kind || p.error || 'unknown') } };
  if (named && !WAV_NAME.test(String(f.name).toLowerCase())) return { key: pre + '.e.name', params: { n: f.name } };
  return null;
};
const isStereo = f => { const x = wavFacts(f); return x.ok && x.channels > 1; };
// sound.set percent rows: {group: {share, max}} (the game's shares of the sound channels per mixer group, VIS-27)
function percentRows(V) {
  const out = {}, k = 'resource/sound/sound.set';
  if (!V.has(k)) return out;
  const t = V.readAny(V.get(k)).toString('latin1'), re = /\{\s*percent\s+"([^"]+)"\s+(\d+)(?:\s+(\d+))?\s*\}/gi;
  let m; while ((m = re.exec(t))) out[m[1].toLowerCase()] = { share: Number(m[2]), max: m[3] != null ? Number(m[3]) : null };
  return out;
}
// one percent change -> {spec (a soundclass percent value), note}; share or max left empty keeps the game's value
function percentChange(V, group, share, max, what) {
  const rows = percentRows(V), cur = rows[group] || { share: 0, max: null };
  const s = share == null || share === '' ? cur.share : Math.round(Number(share)), mx = max == null || max === '' ? cur.max : Math.round(Number(max));
  if (!(s >= 0 && s <= 100)) throw bad('The share is 0 to 100.');
  if (mx != null && !(mx >= 1)) throw bad('At once: 1 or more.');
  if (s === cur.share && mx === cur.max) return null;
  const sum = Object.entries(rows).reduce((a, [g, r]) => a + (g === group ? s : r.share), 0);
  return { spec: { [group]: mx != null ? s + ' ' + mx : s },
    note: 'Every ' + group + ' sound of the game (' + what + ') now gets ' + s + ' of 100 sound channels' + (mx != null ? ', at most ' + mx + ' at once' : '') + ' (was ' + cur.share + (cur.max != null ? ', at most ' + cur.max : '') + '). sound.set is shared by all sounds' + (sum !== 100 ? '; the shares now add up to ' + sum + ', not 100' : '') + '. Not tested in game.' };
}

// new file names over a folder: when the folder already has files (a change), the new sounds take their names in turn, so only the
// new sounds are left in the game's shuffle bag; else <stem>_01.wav ..
function targetNames(existing, n, stem) {
  const ex = (existing || []).map(k => k.slice(k.lastIndexOf('/') + 1));
  if (ex.length) { const out = ex.slice(); return { names: out, map: out.map((x, i) => i % n) }; }
  const out = []; for (let i = 0; i < n; i++) out.push(stem + '_' + pad2(i + 1) + '.wav');
  return { names: out, map: out.map((x, i) => i) };
}

const PLACE = { fire: 'weapon/shot', reload: 'weapon/reload', vehicle: 'vehicle', effect: 'detonation', voice: 'human/talk', world: 'world', other: 'mod' };
function guessWhere(name) {
  const n = norm(name);
  if (n.startsWith('weapon/shot/')) return 'fire';
  if (n.startsWith('weapon/reload/')) return 'reload';
  if (n.startsWith('vehicle/')) return 'vehicle';
  if (/^(detonation|fire|hit|crush)\//.test(n)) return 'effect';
  if (/\/talk\//.test(n)) return 'voice';
  if (n.startsWith('world/')) return 'world';
  return 'other';
}
// a branch: what the parent says the sound is for (picker.pass.for, else its question id)
function whereFromParent(q) {
  const s = String(q || '');
  if (/reload/.test(s)) return 'reload';
  if (/fire|shot|shoot/.test(s)) return 'fire';
  if (/engine|move|track|turret|wheel|exhaust/.test(s)) return 'vehicle';
  if (/voice|talk|speech|line/.test(s)) return 'voice';
  if (/blast|explo|fx|hit|burn/.test(s)) return 'effect';
  return null;
}

// lookups: sound names (folders the game picks from at random), weapons (stuff files), loudness classes (rows of sound.set)
async function lookSound(ctx, words, opt) {
  const g = gameOf(ctx, opt && opt.game); if (!g) return [];
  const V = viewOf(g, opt && opt.mod), ws = String(words || '').toLowerCase().split(/[\s,]+/).filter(Boolean), by = new Map();
  for (const k of V.keys()) {
    if (!k.startsWith('resource/sound/') || !k.endsWith('.wav')) continue;
    const d = k.slice(15, k.lastIndexOf('/'));
    if (ws.length && !ws.every(w => k.includes(w))) continue;
    const o = by.get(d) || { n: 0, first: k, mod: false }; o.n++; if (V.m.has(k)) o.mod = true; by.set(d, o);
  }
  const out = [];
  for (const [d, o] of by) out.push({ id: d, name: d.slice(d.lastIndexOf('/') + 1), where: o.mod ? 'mod' : 'game', ref: { key: o.first }, sub: o.n + ' wav' });
  return out.sort((a, b) => a.id.length - b.id.length || (a.id < b.id ? -1 : 1));
}
async function lookWeapon(ctx, words, opt) {
  const g = gameOf(ctx, opt && opt.game); if (!g) return [];
  const V = viewOf(g, opt && opt.mod), ws = String(words || '').toLowerCase().split(/[\s,]+/).filter(Boolean), out = [], goh = isGohG(g);
  for (const k of V.keys()) {
    // GoH: rifles and guns have no extension, rocket launchers end in .weapon (vanilla GoH set/stuff [V])
    if (!k.startsWith('resource/set/stuff/') || (/\.[a-z0-9]+$/.test(k.slice(k.lastIndexOf('/') + 1)) && !(goh && k.endsWith('.weapon')))) continue;
    if (ws.length && !ws.every(w => k.includes(w))) continue;
    out.push({ id: k, name: k.slice(k.lastIndexOf('/') + 1), where: k.slice(19, k.lastIndexOf('/')), ref: { key: k }, sub: V.m.has(k) ? 'mod' : 'game' });
  }
  return out.sort((a, b) => a.name.length - b.name.length || (a.name < b.name ? -1 : 1));
}
function soundSetOf(V) { const M = require('../../../../sound/model'); return M.soundSet(k => { const r = V.get(k); return r ? V.readAny(r) : null; }); }
async function lookLoudness(ctx, words, opt) {
  const g = gameOf(ctx, opt && opt.game); if (!g) return [];
  const set = soundSetOf(viewOf(g, opt && opt.mod)), w = String(words || '').toLowerCase().trim();
  return (set.order || []).filter(n => !w || n.includes(w)).map(n => {
    const r = set.loudness[n] || {}, nm = r.name || n;
    return { id: nm, name: nm, where: 'sound.set', ref: { key: 'resource/sound/sound.set' }, sub: (r.min != null ? r.min + ' to ' + r.max + ' m' : '') };
  });
}

// fireSound / reloadSound in a stuff file: one gen set row on the file's root block (add = set when it is there, else create)
function slotRow(V, stuffKey, slot, value, goh) {
  const k = String(stuffKey || '').toLowerCase().replace(/\\/g, '/');
  const rec = V.get(k); if (!rec) throw bad('The weapon file ' + k + ' is not in the game or your mod.');
  const buf = V.readAny(rec), t = require('../../../../lib/sdlwrite').parse(buf);
  const root = (t.root.items || []).find(x => x.type === 'block' || x.type === 'list');
  const rn = root && root.name ? String(root.name).replace(/^"|"$/g, '') : '';
  // GoH: some files spell it reloadsound (4 vanilla files [V]); the row keeps the file's own spelling
  if (goh) { const m = new RegExp('\\{\\s*(' + slot + ')\\s', 'i').exec(buf.toString('latin1')); if (m) slot = m[1]; }
  return { entity: 'file:' + k, path: (rn ? rn + '/' : '') + slot, value: '"' + value + '"', op: 'add' };
}

const MAKE = { $verb: ['make'] }, CHANGE = { $verb: ['change'] }, AS2G = ['as64', 'mowas2'];
// what makes the sound -> nothing plays a new sound of these kinds until it is linked by hand (no tool binds a vehicle slot, an effect,
// a world speaker or a voice line; kept rows vehicle.*, world.*): said at Review
const UNLINKED = ['vehicle', 'effect', 'voice', 'world', 'other'];
module.exports = {
  id: 'sound',
  verbs: ['make', 'change'],
  // Gates of Hell (2026-11-23): sound.goh.js writes a new folder with a folder.set that names its distance (GHVIS-31); change is the
  // same copy over the game file names; the new loudness class questions are AS2 only (GoH asks the distances, dist_min / dist_max)
  games: ['as64', 'mowas2', 'goh'],
  needs: ['mod'],
  order: 100,
  title: 'task.sound.t',
  census: 'sound',
  base: { lookup: 'soundname' },
  groups: [
    // essential = what a first-time user must answer: make (what makes it, its name, the sound it starts from, the weapon for a shot or
    // reload) or change (the one game sound replaced), and the recordings. The file format has safe defaults (Automatic, keep the rate).
    { id: 'place', title: 'task.sound.g.place', essential: true, q: [
      { id: 'where', kind: 'choice', ask: 'task.sound.q.where', help: 'task.sound.h.where', when: MAKE,
        limits: { values: ['fire', 'reload', 'vehicle', 'effect', 'voice', 'world', 'other'] } },
      { id: 'name', kind: 'id', ask: 'task.sound.q.name', help: 'task.sound.h.name', covers: ['wav.file'], when: MAKE,
        limits: { re: '^[a-z0-9_]{1,40}$', limit: 'VIS-08' } },
      { id: 'like', kind: 'thing', ask: 'task.sound.q.like', help: 'task.sound.h.like', covers: ['wav.folder_pick'], when: MAKE,
        limits: { limit: 'VIS-08' }, picker: { sources: ['keep', 'exist'], lookup: 'soundname' } },
      // change: the one question that names what is overwritten (never a reference question)
      { id: 'target', kind: 'thing', ask: 'task.sound.q.target', help: 'task.sound.h.target', when: CHANGE,
        limits: { limit: 'VIS-08' }, picker: { sources: ['keep', 'exist'], lookup: 'soundname' } },
      { id: 'user', kind: 'thing', ask: 'task.sound.q.user', help: 'task.sound.h.user', covers: ['weapon.fire_sound', 'weapon.reload_sound'],
        optional: true, picker: { sources: ['keep', 'exist'], lookup: 'weapon' }, when: { $verb: ['make'], where: ['fire', 'reload'] } },
    ] },
    { id: 'files', title: 'task.sound.g.files', essential: true, q: [
      { id: 'files', kind: 'file', multi: true, ask: 'task.sound.q.files', help: 'task.sound.h.files', covers: ['wav.seconds'], when: MAKE,
        limits: { limit: 'FMT-14' }, picker: { sources: ['keep', 'file', 'ext'], kinds: ['.wav'], ext: ['audacity', 'ffmpeg'], check: wavCheck(true, 'task.sound') } },
      // change: no keep (a changed sound needs new recordings)
      { id: 'newfiles', kind: 'file', multi: true, ask: 'task.sound.q.newfiles', help: 'task.sound.h.newfiles', when: CHANGE,
        limits: { limit: 'FMT-14' }, picker: { sources: ['file', 'ext'], kinds: ['.wav'], ext: ['audacity', 'ffmpeg'], check: wavCheck(false, 'task.sound') } },
    ] },
    { id: 'format', title: 'task.sound.g.format', q: [
      { id: 'convert', kind: 'choice', ask: 'task.sound.q.convert', help: 'task.sound.h.convert', covers: ['wav.codec', 'wav.ima_block'],
        limits: { values: ['auto', 'ima', 'pcm16'], limit: 'FMT-14' } },
      { id: 'rate', kind: 'choice', ask: 'task.sound.q.rate', help: 'task.sound.h.rate', covers: ['wav.rate'],
        limits: { values: ['keep', '44100', '22050'], unit: 'Hz' } },
      { id: 'mono', kind: 'yesno', ask: 'task.sound.q.mono', help: 'task.sound.h.mono', covers: ['wav.channels'] },
    ] },
    { id: 'heard', title: 'task.sound.g.heard', q: [
      { id: 'tag', kind: 'choice', ask: 'task.sound.q.tag', help: 'task.sound.h.tag', covers: ['folder.tag'], when: MAKE,
        limits: { values: ['like', 'effects', 'emotions', 'speech', 'environment'], limit: 'VIS-09' } },
      { id: 'loudness', kind: 'thing', ask: 'task.sound.q.loudness', help: 'task.sound.h.loudness', covers: ['folder.loudness'], when: MAKE,
        optional: true, picker: { sources: ['keep', 'exist'], lookup: 'loudness' } },
      { id: 'volume', kind: 'number', ask: 'task.sound.q.volume', help: 'task.sound.h.volume', covers: ['folder.volume'], when: MAKE,
        optional: true, limits: { min: 0, max: 1, step: 0.05 } },
      // GoH: the distances the folder.set names (a loudness row of sound.set; a new row when none has them). GHVIS-31: none = stopped
      { id: 'dist_min', kind: 'number', ask: 'task.sound.q.dist_min', help: 'task.sound.h.dist_min', covers: [], when: { $verb: ['make'], $game: ['goh'] },
        limits: { min: 0.1, max: 5000, step: 0.5, unit: 'm', usual: [3, 200], limit: 'GHVIS-31' } },
      { id: 'dist_max', kind: 'number', ask: 'task.sound.q.dist_max', help: 'task.sound.h.dist_max', covers: [], when: { $verb: ['make'], $game: ['goh'] },
        limits: { min: 1, max: 5000, step: 5, unit: 'm', usual: [30, 2000], limit: 'GHVIS-29' } },
      { id: 'signal', kind: 'choice', ask: 'task.sound.q.signal', help: 'task.sound.h.signal', covers: ['folder.signal'], when: MAKE,
        limits: { values: ['like', 'shot', 'explosion', 'movement', 'hit', 'sound'] } },
      { id: 'signal_m', kind: 'number', ask: 'task.sound.q.signal_m', help: 'task.sound.h.signal_m', when: { $verb: ['make'], signal: ['shot', 'explosion', 'movement', 'hit', 'sound'] },
        limits: { min: 0, max: 1000, step: 5, unit: 'm' } },
    ] },
    { id: 'class', title: 'task.sound.g.class', q: [
      // AS2 only: on GoH the distances above make the row (dist_min / dist_max)
      { id: 'newclass', kind: 'yesno', ask: 'task.sound.q.newclass', help: 'task.sound.h.newclass', covers: ['mix.loudness'], when: { $verb: ['make'], $game: AS2G }, limits: { limit: 'VIS-27' } },
      { id: 'class_name', kind: 'id', ask: 'task.sound.q.class_name', help: 'task.sound.h.class_name', when: { $verb: ['make'], $game: AS2G, newclass: [true] },
        limits: { re: '^[A-Za-z0-9_][A-Za-z0-9_ ]{0,30}$' }, unique: { lookup: 'loudness' } },
      { id: 'class_min', kind: 'number', ask: 'task.sound.q.class_min', help: 'task.sound.h.class_min', when: { $verb: ['make'], $game: AS2G, newclass: [true] },
        limits: { min: 0, max: 5000, step: 5, unit: 'm' } },
      { id: 'class_max', kind: 'number', ask: 'task.sound.q.class_max', help: 'task.sound.h.class_max', when: { $verb: ['make'], $game: AS2G, newclass: [true] },
        limits: { min: 0, max: 5000, step: 10, unit: 'm' } },
      { id: 'class_prio', kind: 'number', ask: 'task.sound.q.class_prio', help: 'task.sound.h.class_prio', when: { $verb: ['make'], $game: AS2G, newclass: [true] },
        optional: true, limits: { min: 0, max: 1000, step: 1 } },
      // the mixer group's share of the sound channels (sound.set percent rows, shared by every sound of the group)
      { id: 'share', kind: 'number', ask: 'task.sound.q.share', help: 'task.sound.h.share', covers: ['mix.channel'], when: MAKE,
        optional: true, limits: { min: 0, max: 100, step: 1, unit: '%', limit: 'VIS-27' } },
      { id: 'at_once', kind: 'number', ask: 'task.sound.q.at_once', help: 'task.sound.h.at_once', when: MAKE,
        optional: true, limits: { min: 1, max: 64, step: 1 } },
    ] },
  ],
  kept: [
    ['wav.copies', 'engine rule, nothing to set: at most 3 copies of one file at once, a repeat within 50 ms is dropped (VIS-10)'],
    ['folder.distance', 'not asked: none of the 78 game folder.set files holds MinDistance or MaxDistance, so the line form is not shown by the game; the loudness class sets the distance'],
    ['folder.signal_period', 'no tool step yet: the gen sound op writes no SignalPeriod'],
    ['vehicle.link_sound', 'no tool step yet: no editor binds a sound to a vehicle slot (link_sound in the interaction script); the vehicle task keeps the copy\'s slots'],
    ['vehicle.slot_extra', 'no tool step yet: same as the vehicle slots, no slot editor'],
    ['vehicle.sound_tag', 'no tool step yet: no writer for the vehicle sound tag macro'],
    ['vehicle.script_sound', 'no tool step yet: script sound actions belong to a mission script; no op writes them'],
    ['world.fx_sound', 'no tool step yet: no writer for an effect {sound}; change the sound itself (verb change) to hear it in every blast that uses it'],
    ['world.speaker', 'no tool step yet: no gen op for an ambient speaker'],
    ['world.thunder', 'no tool step yet: the thunder sound is named by the weather files [I]; change the sound itself (verb change) instead'],
    ['voice.breed', 'owned by the voice set and soldier tasks (gen breed voice); this task makes the sound files they point at'],
  ],
  test: 'task.sound.test',
  checklist: ['task.sound.c.hear', 'task.sound.c.far', 'task.sound.c.log'],
  lookups: { soundname: lookSound, weapon: lookWeapon, loudness: lookLoudness },
  values: async (ctx, base, o) => {
    o = o || {};
    const id = base && base.id ? norm(base.id) : '';
    const parent = (o.pass && o.pass.for) || (o.draft && o.draft.parent && o.draft.parent.q) || '';
    const v = { where: whereFromParent(parent) || (id ? guessWhere(id) : 'fire'), name: id ? (id.slice(id.lastIndexOf('/') + 1) + '_new').replace(/[^a-z0-9_]/g, '_').slice(0, 40) : '',
      like: id, target: id, files: null, newfiles: null, convert: 'auto', rate: 'keep', mono: true, share: null, at_once: null, user: '', tag: 'like', loudness: '', volume: null, signal: 'like', signal_m: 40,
      newclass: false, class_name: '', class_min: 10, class_max: 300, class_prio: null };
    if (o.pass && o.pass.keys && o.pass.keys.weapon) v.user = String(o.pass.keys.weapon);
    const g = gameOf(ctx, o && o.game);
    if (gidOf(ctx, o && o.game) === 'goh') { v.dist_min = 5; v.dist_max = 100; }   // the GoH sound.set default row, until a folder is read
    if (g && id) {
      try {
        const V = viewOf(g, ctx.mod), s = soundAt(V, id);
        // GoH: the folder resolves through defines.inc presets (sound/model game goh); its distances fill dist_min / dist_max
        if (s.folder && isGohG(g)) {
          const R = SGH().resolve(V, s.name);
          if (R) { v.loudness = R.loudness && R.loudness !== 'default' ? R.loudness : ''; if (R.volume != null && R.volume !== 1) v.volume = R.volume; if (R.signal && R.signal.radius) v.signal_m = R.signal.radius; v.dist_min = R.min; v.dist_max = R.max; }
        } else if (s.folder) { const f = require('../../../../sound/model').folder('resource/sound/' + s.name, k => { const r = V.get(k); return r ? V.readAny(r) : null; }); if (f) { v.loudness = f.loudness && f.loudness !== 'default' ? f.loudness : ''; if (f.volume != null && f.volume !== 1) v.volume = f.volume; if (f.signal && f.signal.radius) v.signal_m = f.signal.radius; } }
      } catch (e) { /* no game view: the defaults stay */ }
    }
    return v;
  },
  compile: (draft, c) => {
    const g = gameIn(c.gameDir, c.game), goh = isGohG(g);
    if (!g) throw c.game === 'goh' ? Object.assign(bad('Set the Gates of Hell folder first (the Game folder button at the top): the task reads the game\'s sounds.'), { key: 'task.sound.e.nogoh' })
      : bad('Set the game folder first (the Game folder button at the top): the task reads the game\'s sounds.');
    const V = viewOf(g, c.mod), copies = [], notes = [], ops = [], calls = [];
    const isChange = c.verb === 'change';
    // change: the sound replaced is the target question (else the base picked at the start); a make's "start from" sound is only read
    const like = isChange ? norm(c.value('target') || (c.base && c.base.id)) : norm(c.value('like')), L = soundAt(V, like), name = String(c.value('name') || '').toLowerCase();
    const where = isChange ? guessWhere(like) : String(c.value('where') || 'other');
    const mode = String(c.value('convert') || 'auto'), rate = String(c.value('rate') || 'keep');
    const fq = isChange ? 'newfiles' : 'files', fa = c.answer(fq), brought = fa && fa.src === 'file' ? [].concat(c.value(fq) || []).filter(Boolean) : [];
    if (fa && fa.src === 'file' && !brought.length) throw bad(isChange ? 'Bring at least one wav file: they replace the game sound.' : 'Bring at least one wav file, or keep the sounds of the copy.');
    for (const f of brought) if (!fs.existsSync(f)) throw bad('A file you brought is gone from the staging folder: ' + path.basename(f) + '. Bring it again.');
    // mono (default yes): a stereo file is made mono; copies and route calls read the mono file made here, gen gets mono: true
    const mono = c.value('mono') !== false, stereo = brought.filter(isStereo).map(f => path.basename(f));
    const src = brought.map(f => (mono ? monoFile(c, f) : f));
    const ways = src.map(f => routeOf(c, f, convertSpec(f, mode, rate, goh))), specs = ways.map(w => w.spec);
    const nConv = specs.filter(Boolean).length;
    if (nConv) notes.push('Converted for the game: ' + nConv + ' of ' + brought.length + ' files.');
    if (stereo.length) notes.push(mono ? 'Made mono (' + stereo.join(', ') + '): the game places a mono sound in the world, where it plays. Not tested in game.'
      : 'Stereo stays stereo (' + stereo.join(', ') + '), as you asked: a sound placed in the 3D world should be mono. The converter warns about it; it is not an error.');
    let folder, single = null;
    if (isChange) {
      if (!like || L.folder === null) throw bad('Pick the game sound you want to replace (the "which sound do you want to replace" step).');
      if (L.folder) folder = L.name; else { folder = L.name.slice(0, L.name.lastIndexOf('/')); single = L.files[0]; }
      if (!brought.length) throw bad('Bring the new wav files: a changed sound needs new recordings.');
      const stem = (folder.slice(folder.lastIndexOf('/') + 1) || 'sound').replace(/[^a-z0-9_]/g, '_');
      const t = single ? { names: [single.slice(single.lastIndexOf('/') + 1)], map: [0] } : targetNames(L.files, brought.length, stem);
      const swap = [];
      t.names.forEach((n, i) => {
        const j = t.map[i], to = 'resource/sound/' + folder + '/' + n;
        if (specs[j]) calls.push(convertCall(ways[j].file, to, specs[j])); else copies.push({ staged: path.relative(c.staging, ways[j].file).replace(/\\/g, '/'), to });
        swap.push(n + ' by ' + path.basename(brought[j]));
      });
      // Review shows exactly which game recordings are replaced
      notes.push('Replaced in your mod: ' + t.names.length + ' recording' + (t.names.length > 1 ? 's' : '') + ' of the game sound ' + (single ? L.name : folder) + ' (' + swap.join(', ') + '). Every weapon or unit that plays it plays yours while the mod is on.');
      if (!single && L.files.length > brought.length) notes.push('The game folder has ' + L.files.length + ' files; your ' + brought.length + ' take their names in turn, so only your sounds play.');
    } else {
      if (!/^[a-z0-9_]{1,40}$/.test(name)) throw bad('Type a name for the new sound: small English letters, digits and _.');
      if (L.folder !== true) throw bad('Pick a game sound folder to start from (the "start from" step): the new sound takes its settings' + (brought.length ? '' : ' and its files') + '.');
      // the folder sits next to the like folder; a weapon sound sits under weapon/shot or weapon/reload (the engine adds that part)
      const pre = PLACE[where] || 'mod', up = s => (s.indexOf('/') < 0 ? '' : s.slice(0, s.lastIndexOf('/')));
      let parent = up(L.name);
      if ((where === 'fire' || where === 'reload') && !(parent + '/').startsWith(pre + '/')) { parent = pre; notes.push('The sound sits under ' + pre + '/ so the weapon finds it, with the folder settings of ' + like + '.'); }
      folder = parent ? parent + '/' + name : name;
      if (soundAt(V, folder).folder !== null) throw bad('A sound named ' + folder + ' is already there. Pick another name.');
      if (UNLINKED.includes(where)) notes.push(where === 'voice'
        ? 'Nothing plays the new sound ' + folder + ' yet: soldier lines are made in the voice task (a voice set). To use this sound, name it in a script or a set file by hand.'
        : 'Nothing plays the new sound ' + folder + ' yet: no step here links a new sound to a vehicle, a blast or the world. To change what one of them sounds like, run this task again with change and pick that game sound; or name ' + folder + ' in its file by hand.');
      const tag = String(c.value('tag') || 'like');
      let grpOf = () => { try { return require('../../../../sound/model').folder('resource/sound/' + L.name, k => { const r = V.get(k); return r ? V.readAny(r) : null; }).group; } catch (e) { return null; } };
      if (goh) {
        // GoH: wav copies and a folder.set that names its keys (sound.goh.js); the gen sound op is AS2 only
        const R = SGH().make({ c, V, L, like: L.name, name, folder, brought, src, ways, specs, convertCall, WAV_NAME, notes, calls, copies, ops });
        grpOf = () => R.group;
      } else {
      const op = { op: 'sound', id: folder, like: L.name, format: mode === 'ima' ? 'ima' : 'pcm' };
      if (brought.length) {
        op.files = brought.slice();
        if (mono && stereo.length) op.mono = true;
        brought.forEach((f, j) => {
          const n = path.basename(f).toLowerCase();
          if (!WAV_NAME.test(n)) throw bad('The file name ' + path.basename(f) + ' must be plain English letters, digits, space, _ . ( ) or -, ending in .wav. Rename it and bring it again.');
          if (specs[j]) calls.push(convertCall(ways[j].file, 'resource/sound/' + folder + '/' + n, specs[j]));
        });
      }
      // how it is heard: only answers that differ from the like folder (kept answers leave the op to copy the like's settings)
      if (tag !== 'like') op.tag = tag;
      if (c.value('newclass') === true) {
        const cn = String(c.value('class_name') || '').trim(), mn = Number(c.value('class_min')), mx = Number(c.value('class_max'));
        if (!/^[A-Za-z0-9_][A-Za-z0-9_ ]{0,30}$/.test(cn)) throw bad('Type a name for the new loudness class (English letters, digits, _ and spaces).');
        if (!(mn >= 0) || !(mx >= mn)) throw bad('The new loudness class: the full volume distance must be at most the silent distance.');
        const sc = { op: 'soundclass', name: cn, min: mn, max: mx }, pr = c.value('class_prio');
        if (pr != null && pr !== '') sc.priority = Number(pr);
        ops.push(sc); op.loudness = cn;
      } else if (!c.kept('loudness') && c.value('loudness')) op.loudness = String(c.value('loudness'));
      if (!c.kept('volume') && c.value('volume') != null && c.value('volume') !== '') op.volume = Number(c.value('volume'));
      const sig = String(c.value('signal') || 'like');
      if (sig !== 'like') op.signal = sig + ' ' + Number(c.value('signal_m') || 0);
      else if (!c.kept('signal_m') && c.value('signal_m') != null) notes.push('The signal radius is used only with a signal kind; the like folder\'s signal is copied as it is.');
      ops.push(op);
      }
      // the mixer group's share of the sound channels: one soundclass percent row (sound.set is shared by every sound)
      const sh = c.kept('share') ? null : c.value('share'), ao = c.kept('at_once') ? null : c.value('at_once');
      if ((sh != null && sh !== '') || (ao != null && ao !== '')) {
        let grp = tag !== 'like' ? tag : null;
        if (!grp) grp = grpOf();
        grp = String(grp || 'effects').toLowerCase();
        const pc = percentChange(V, grp, sh, ao, 'your sound ' + folder + ' plays in the ' + grp + ' group');
        if (pc) { ops.push({ op: 'soundclass', percent: pc.spec }); notes.push(pc.note); }
      }
    }
    // the slot name: a weapon gets weapon/shot/ or weapon/reload/ put in front by the engine
    let slot = single ? single.slice(15, -4) : folder + '/';
    if (where === 'fire' && slot.startsWith('weapon/shot/')) slot = slot.slice(12);
    if (where === 'reload' && slot.startsWith('weapon/reload/')) slot = slot.slice(14);
    const user = isChange ? '' : String(c.value('user') || '');
    if (user && (where === 'fire' || where === 'reload')) ops.push({ op: 'set', rows: [slotRow(V, user, where === 'fire' ? 'fireSound' : 'reloadSound', slot, goh)] });
    return { gen: ops.length ? { ops } : null, copies, calls, notes, result: slot };
  },
  _lib: { gidOf, gameIn, norm, soundAt, wavFacts, convertSpec, convertCall, routeOf, targetNames, viewOf, gameOf, bad, pad2, WAV_NAME, wavCheck, monoFile, isStereo, percentRows, percentChange },
};
