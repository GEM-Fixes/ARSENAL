// view kind sound, server side: a .wav player that plays a file the way the game does (tools/sound: lib/wav decode, model.js rules).
// Routes (GET, read only, open to a phone):
//   GET /api/x/view/sound/plan?<ref>&distance=&bearing=&ambient=&loop=&duration=&seed=
//     -> { name, key, soundKey, media, kind, header, notes, plan, from, options, folder:{key, files, bag}, names, limits }
//        plan = model.plan of this file in its real folder (folder.set chain through the layered game view, the user's profile volumes
//        when one is found, else the game defaults: options.source says which); bag = the shuffle-bag order the game picks in
//   GET /api/x/view/sound/pcm?<ref>      -> { type:'wav'|'mp3', rate, channels, frames, seconds, codec, cut, b64 }
//        a wav is decoded here exactly as the core does it (IMA ADPCM cannot play in a browser) and sent as a plain PCM16 wav;
//        an mp3 (music: device media stream) and MP3-in-WAV are sent as they are for the browser's decodeAudioData
//   GET /api/x/view/sound/name?mod=&name=[&as=fire|reload]  -> a sound NAME as written in fireSound, link_sound, start_sound ...
//        -> { name, played, hint, exists, folderKey, files, pick, warn, plan, bag }
//   GET /api/x/view/sound/burst?<ref>&every=&shots=&folder=1  -> { every, shots:[{i, t, key, result, reason, startedAt, endedAt}] }
//        the engine's voice limits over a burst (model limits().simulate per file: 3 copies, 50 ms anti-reverb, cut rules)
// <ref> = mod=&rel= | mod=&key= | [mod=&]path= (../ref.js). Nothing is written; no process is started.
// Game parity: every route reads the page's game (ctx.gameId). MoW:AS2 is played like AS64 (same sound forms and rules) over the
// MoW:AS2 view (exe mowas_2); GoH reads the GoH view and the GoH profile volumes, answers rules:'goh' and asks tools/sound/model for
// the GoH rules with opts.game 'goh' (plan, name) and model.folder(.., {game:'goh'}) (burst): sub-folders keep the parent's
// distances (GHVIS-29), folder volume also on ambient sounds (GHVIS-30), filters.set chains (GHVIS-33). plan and name also give
// { game, rules: 'as2'|'goh' }. GoH plays .wav only, as AS2 (GHVIS-140 [I]).
// Author: Imperator_Aug (ARSENAL, ia-2af067f1)
'use strict';
const R = require('../ref'), lib = require('../../files/lib');
const wav = require('../../../../lib/wav'), model = require('../../../../sound/model');

const MAX_FILE = 32 * 1024 * 1024, MAX_PCM = 48 * 1024 * 1024, MAX_SECONDS = 600, LIST_CAP = 5000, BAG_MAX = 300;
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const lc = s => String(s == null ? '' : s).replace(/\\/g, '/').toLowerCase();
const dirOf = k => { const i = k.lastIndexOf('/'); return i < 0 ? '' : k.slice(0, i); };
const baseOf = k => String(k).slice(String(k).lastIndexOf('/') + 1);
const extOf = n => { const b = baseOf(lc(n)), i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1) : ''; };
const num = (sp, k, d) => { const v = sp.get(k); if (v == null || v === '') return d; const n = Number(v); if (!Number.isFinite(n)) throw bad(k + ': a number is needed'); return n; };

// ---------------------------------------------------------------- the game's files as a model src {read, list}
// over the layered view of the mod (../ref readKey/listKeys); without a mod (a path ref on a page with no mod): the game alone
const _dirIdx = new WeakMap();
function dirIndex(v) {
  let m = _dirIdx.get(v);
  if (!m) { m = new Map(); for (const [k, r] of v.files) { if (r && r.deleted) continue; const d = dirOf(k); let a = m.get(d); if (!a) m.set(d, a = []); a.push(k); } _dirIdx.set(v, m); }
  return m;
}
// Game parity: the request's game (ctx.gameId: 'as64' | 'mowas2' | 'goh'; a ctx without it = as64). as64 reads as before (sound.js
// makeSource, vfs picks as64); mowas2 names exe mowas_2 over the same AS2 install, goh exe goh over the GoH install (ctx.curDir).
const gidOf = ctx => { try { const g = typeof ctx.gameId === 'function' ? ctx.gameId() : null; return g === 'mowas2' || g === 'goh' ? g : 'as64'; } catch (e) { return 'as64'; } };
const EXE = { as64: 'as64', mowas2: 'mowas_2', goh: 'goh' };
// the vfs exe of the request: ctx.exe() (gui.js) when it names this game's exe, else the table (a ctx without exe(), tests)
const exeOf = (ctx, gid) => {
  try { const x = typeof ctx.exe === 'function' ? ctx.exe() : null, G = x ? require('../../../../lib/games').get(x) : null; if (G && G.id === gid) return G.exe; } catch (e) { /* the table */ }
  return EXE[gid];
};
function dirOfGame(ctx, gid) {
  if (gid === 'goh') { try { return (typeof ctx.curDir === 'function' && ctx.curDir()) || (typeof ctx.gohDir === 'function' && ctx.gohDir()) || null; } catch (e) { return null; } }
  return typeof ctx.game === 'function' ? ctx.game() : null;
}
// the game alone (no mod) for a named exe: tools/lib/sdlset createSource takes exe (the same {read, list} shape as makeSource)
function exeSource(gameDir, exe) {
  const s = require('../../../../lib/sdlset').createSource({ gameDir, exe });
  const byDir = new Map();
  if (s.v) for (const [k, r] of s.v.files) { if (r && r.deleted) continue; const d = k.slice(0, k.lastIndexOf('/')); let a = byDir.get(d); if (!a) byDir.set(d, a = []); a.push(k); }
  return { read: k => { try { return s.get(model.norm(k)); } catch (e) { return null; } }, list: p => byDir.get(model.norm(p)) || [], raw: s };
}
const _gameSrc = new Map();
function gameSrc(ctx) {
  const gid = gidOf(ctx), g = dirOfGame(ctx, gid);
  if (!g) return null;
  if (ctx.session && ctx.session.remote) throw bad('Pick your mod folder first (Mods page).', 403);
  const ck = gid + '|' + g;   // the three games never share a source
  const c = _gameSrc.get(ck);
  if (c && Date.now() - c.t < 60000) return c.src;
  let src = null;
  try { src = gid === 'as64' ? require('../../../../sound/sound').makeSource({ gameDir: g, mods: [], x: {} }) : exeSource(g, exeOf(ctx, gid)); } catch (e) { src = null; }
  _gameSrc.set(ck, { t: Date.now(), src }); if (_gameSrc.size > 3) _gameSrc.delete(_gameSrc.keys().next().value);
  return src;
}
function srcFor(ctx, mod) {
  if (!mod) return gameSrc(ctx) || model.memSource({});
  const lists = new Map(), reads = new Map();
  const read = k => {
    k = lc(k); if (reads.has(k)) return reads.get(k);
    let b = null;
    try { b = R.readKey(ctx, mod, k, { max: MAX_FILE }); } catch (e) { if (e.status === 403) throw e; b = null; }
    reads.set(k, b); return b;
  };
  const list = dir => {
    dir = lc(dir).replace(/\/+$/, ''); if (lists.has(dir)) return lists.get(dir);
    const pre = dir + '/';
    let a = R.listKeys(ctx, mod, pre);
    if (a.length >= LIST_CAP) {   // a big tree under this folder: the direct files may be past the cap; take them from the view's index
      try { const cv = lib.vfsFor(ctx, lib.readMod(ctx, mod)); if (cv.v) a = a.concat(dirIndex(cv.v).get(dir) || []); } catch (e) { /* keep the capped list */ }
    }
    a = [...new Set(a.filter(k => k.startsWith(pre) && k.indexOf('/', pre.length) < 0))].sort();
    lists.set(dir, a); return a;
  };
  return { read, list };
}

// ---------------------------------------------------------------- the user's volumes: the newest profile options.set, else game defaults
// as64 and mowas2 share the AS2 profiles (userdir.profiles). GoH: <GoH user dir>/profiles/<id>/options.set (userdir.gohUserDir,
// GHVFS-13 [V]); its {sound {volume ..}} block has the AS2 form (read with model.options; checked on a real GoH profile) [I].
// profilesOf(gid) -> the options.set files of that game's profiles (userdir.profilesFor; tests swap it with _setProfilesOf)
const profilesOfDefault = gid => require('../../../../lib/userdir').profilesFor(gid === 'goh' ? 'goh' : null, 0);
let profilesOf = profilesOfDefault;
const _opt = new Map();
function userOptions(gid) {
  gid = gid === 'goh' ? 'goh' : 'as2';
  const c = _opt.get(gid);
  if (c && Date.now() - c.t < 30000) return c.v;
  let v = { source: 'defaults', file: null, found: [], values: model.options(null) };
  try {
    const fs = require('fs'), files = profilesOf(gid);
    const best = files.map(f => ({ f, m: (fs.statSync(f).mtimeMs || 0) })).sort((a, b) => b.m - a.m)[0];
    if (best) { const values = model.options(fs.readFileSync(best.f)); v = { source: 'profile', file: best.f, found: Object.keys(values.found || {}), values }; }
  } catch (e) { /* defaults */ }
  _opt.set(gid, { t: Date.now(), v });
  return v;
}

// ---------------------------------------------------------------- facts
function headerOf(p) {
  if (!p) return null;
  const f = p.fmt || {};
  return { ok: !!p.ok, kind: p.kind, codec: f.codec || null, tag: p.tag == null ? null : p.tag, channels: f.channels || 0, rate: f.rate || 0, bits: f.bits || 0,
    blockAlign: f.blockAlign || 0, samplesPerBlock: f.samplesPerBlock || null, frames: p.frames || 0, seconds: p.seconds || 0, dataBytes: p.dataBytes || 0,
    chunks: (p.chunks || []).map(c => c.id.trim()), loops: (p.loops || []).length, error: p.error || null };
}
// the sound key this file plays under: its game key, else a path with /sound/ in it, else a file in the sound root (README: a loose
// file outside sound/ plays like a vanilla folder through the root folder.set)
function soundKeyOf(r) {
  const k = lc(r.key || '');
  if (k.startsWith(model.ROOT + '/')) return { key: k, real: true };
  const p = lc(r.file && !r.inPak ? r.file : (r.entry || r.rel || r.name || ''));
  const m = /(?:^|\/)(?:resource\/)?sound\/(.+)$/.exec(p);
  if (m) return { key: model.ROOT + '/' + m[1], real: !!r.key };
  return { key: model.ROOT + '/' + lc(r.name || 'sound.wav'), real: false };
}
// which folder.set of the chain set each value (null = the folder default or the sound.set default loudness)
function fromOf(chain) {
  const out = { group: null, volume: null, distance: null, priority: null, signal: null };
  for (const c of chain || []) {
    const o = c.own; if (!o || !c.setKey) continue;
    if (o.tag != null) out.group = c.setKey;
    if (o.volume != null) out.volume = c.setKey;
    if (o.reset || o.distance || o.minDistance != null || o.maxDistance != null || o.loudness) out.distance = c.setKey;
    if (o.loudness) out.priority = c.setKey;
    if (o.signal) out.signal = c.setKey;
  }
  return out;
}
// the names a modder writes to play this file (each checked with the engine's own name rule)
function namesOf(key, list) {
  const rel = key.slice(model.ROOT.length + 1), dir = dirOf(rel), title = model.titleOf(rel), out = [];
  const add = (name, use, played) => { const r = model.resolve(played, list); out.push({ name, use, played, pick: r.pick, files: r.files.length, ok: !r.warn && (r.pick !== 'fixed' || r.fixed === key) }); };
  if (dir) add(dir, 'folder', dir);
  add((dir ? dir + '/' : '') + title, 'file', (dir ? dir + '/' : '') + title);
  for (const [pre, use] of [['weapon/shot/', 'fireSound'], ['weapon/reload/', 'reloadSound']]) {
    if (!rel.startsWith(pre)) continue;
    const d = dir.slice(pre.length);
    if (d) add(d, use, pre + d);
    add((d ? d + '/' : '') + title, use, (d ? pre + d + '/' : pre) + title);
  }
  return out;
}
function bagOf(files, seed) {
  if (!files || files.length < 2) return files ? files.slice() : [];
  const b = model.bag(files, model.engineRandom(seed)), n = Math.min(BAG_MAX, files.length * 3), out = [];
  for (let i = 0; i < n; i++) out.push(b.next());
  return out;
}
function planOpts(sp) {
  const loopS = sp.get('loop');
  const loop = loopS == null || loopS === '' ? 1 : (loopS === 'forever' || loopS === 'true' ? true : num(sp, 'loop', 1));
  return { distance: Math.max(0, num(sp, 'distance', 0)), bearing: num(sp, 'bearing', 0), ambient: sp.get('ambient') === '1' || sp.get('ambient') === 'true',
    loop, duration: Math.max(0, num(sp, 'duration', 0)), seed: Math.floor(num(sp, 'seed', 1)) >>> 0 };
}

async function plan(url, body, ctx) {
  const sp = url.searchParams, q = R.refOfQuery(url);
  const r = R.readRef(ctx, q, { max: MAX_FILE });
  const ext = extOf(r.name), info = wav.parse(r.buf), sk = soundKeyOf(r);
  const gid = gidOf(ctx), uo = userOptions(gid), o = planOpts(sp);
  if (gid === 'goh') o.game = 'goh';   // GoH play rules (tools/sound/model: GHVIS-29, -30, -33); as64 and mowas2: the AS2 rules, opts as before
  const out = { name: r.name, game: gid, rules: gid === 'goh' ? 'goh' : 'as2', key: r.key, rel: r.rel, where: r.where, size: r.size, ext, soundKey: sk.key, inSound: sk.real,
    media: false, kind: info.kind, header: headerOf(info), notes: info.notes || [], plan: null, from: null,
    options: { source: uo.source, file: uo.file, found: uo.found, values: uo.values },
    folder: { key: dirOf(sk.key), files: [], bag: [] }, names: [], limits: null };
  const isMusic = ext === 'mp3' || /(^|\/)music\//.test(lc(r.key || r.rel || r.file || ''));
  if (info.kind === 'mp3' && ext === 'mp3' || (isMusic && !sk.real)) {
    // music: AIL streams through device media, not the sound folders (tools/sound README); volume = the game_music option [I]
    out.media = true;
    out.music = { master: uo.values.master, music: uo.values.game_music, gain: model.M.groupVolume(uo.values.master, uo.values.game_music) };
    if (info.kind !== 'wav') return out;
  }
  const src = srcFor(ctx, r.where === 'outside' && !q.mod ? null : (q.mod || null));
  let p = null;
  try { p = model.plan(Object.assign({ key: sk.key, buf: r.buf, volumes: uo.values }, o), src); } catch (e) { out.planError = e.message; }
  if (p) {
    out.plan = p; out.from = fromOf(p.settings && p.settings.chain);
    out.folder.files = (p.resolve && p.resolve.files) || [];
    if (out.folder.files.indexOf(sk.key) < 0 && !sk.real) out.folder.files = [sk.key].concat(out.folder.files);
    out.folder.bag = bagOf(out.folder.files, o.seed);
    out.names = sk.real ? namesOf(sk.key, src.list) : [];
    const L = model.limits(), set = model.soundSet(src.read), pool = (uo.values.buffers || model.M.POOL_START);
    out.limits = { maxCopies: L.maxFilePlayedChannels, maxPlaying: L.maxPlaying, antiReverbMs: L.antiReverbMs, cutoffPart: L.cutoffPart, keepTimeMs: L.keepTimeMs, tickMs: L.tickMs,
      pool, groupFree: L.groupFree(set, pool) };
    // the loudness row the folder took (sound.set), for the facts card
    if (p.settings && p.settings.loudness && set.loudness[lc(p.settings.loudness)]) { const Lr = set.loudness[lc(p.settings.loudness)]; out.loudness = { name: Lr.name, min: Lr.min, max: Lr.max, priority: Lr.priority }; }
  }
  return out;
}

async function pcm(url, body, ctx) {
  const r = R.readRef(ctx, R.refOfQuery(url), { max: MAX_FILE });
  const ext = extOf(r.name), p = wav.parse(r.buf);
  if (p.kind === 'mp3' || (ext === 'mp3' && p.kind !== 'wav')) return { name: r.name, type: 'mp3', size: r.buf.length, b64: r.buf.toString('base64') };
  if (p.kind === 'ogg' || p.kind === 'flac') throw bad(r.name + ': this is an .' + p.kind + ' file. The game cannot play it, so it is not played here either. Convert it to a real .wav.', 415);
  const d = wav.decode(r.buf);
  if (!d.ok) {
    if (d.payload && d.payload.codec === 'mp3') {   // MP3 inside a WAV: whether the game plays it is [T]; the browser decodes the mp3 part
      return { name: r.name, type: 'mp3', inWav: true, size: d.payload.len, b64: r.buf.subarray(d.payload.off, d.payload.off + d.payload.len).toString('base64') };
    }
    throw bad(r.name + ': ' + (d.error || 'this sound cannot be decoded') + '.', 415);
  }
  let frames = d.frames, cut = false;
  const maxFrames = Math.min(Math.floor(MAX_PCM / (2 * d.channels)), MAX_SECONDS * d.rate);
  if (frames > maxFrames) { frames = maxFrames; cut = true; }
  const out = wav.encodePcm16({ rate: d.rate, channels: d.channels, pcm: cut ? d.pcm.subarray(0, frames * d.channels) : d.pcm });
  return { name: r.name, type: 'wav', rate: d.rate, channels: d.channels, frames, seconds: frames / d.rate, codec: d.codec, trimmedByFact: !!d.trimmedByFact, cut, b64: out.toString('base64') };
}

// a sound NAME (fireSound "mg34", start_sound "ambient/rain", link_sound ...) -> what the game plays
async function name(url, body, ctx) {
  const sp = url.searchParams, raw = String(sp.get('name') || '').trim(), as = sp.get('as') || '';
  if (!raw || raw.length > 400 || /\0/.test(raw)) throw bad('name: a sound name like weapon/shot/gun is needed');
  const mod = sp.get('mod') || null;
  if (mod) lib.checkRead(ctx, mod);   // read mode: a GoH mod in <GoH>/mods or a Workshop item may be viewed
  const src = srcFor(ctx, mod);
  let n = lc(raw).replace(/^\/+/, '').replace(/^resource\//, '').replace(/^sound\//, '');
  if (as === 'fire') n = 'weapon/shot/' + n; else if (as === 'reload') n = 'weapon/reload/' + n;
  let res = model.resolve(n, src.list), hint = null;
  if (res.warn && !as) for (const pre of ['weapon/shot/', 'weapon/reload/']) if (!model.resolve(pre + n, src.list).warn) { hint = pre + n; break; }
  const gid = gidOf(ctx), o = planOpts(sp), uo = userOptions(gid);
  if (gid === 'goh') o.game = 'goh';
  const out = { game: gid, rules: gid === 'goh' ? 'goh' : 'as2', name: raw, played: n, hint, exists: res.exists, folderKey: res.folderKey, files: res.files, pick: res.pick, fixed: res.fixed, warn: res.warn, plan: null, bag: [] };
  if (!res.warn) {
    out.bag = res.fixed ? [res.fixed] : bagOf(res.files, o.seed);
    try { out.plan = model.plan(Object.assign({ name: n, volumes: uo.values }, o), src); } catch (e) { out.planError = e.message; }
  }
  return out;
}

// a burst: one shot every `every` ms, `shots` times, through the engine's per-file copy rules
async function burst(url, body, ctx) {
  const sp = url.searchParams, q = R.refOfQuery(url);
  const every = Math.max(1, Math.min(10000, num(sp, 'every', 67))), shots = Math.max(1, Math.min(200, Math.floor(num(sp, 'shots', 20))));
  const r = R.resolve(ctx, q), sk = soundKeyOf(r);
  const src = srcFor(ctx, r.where === 'outside' && !q.mod ? null : (q.mod || null));
  const own = R.readRef(ctx, q, { max: MAX_FILE }).buf;
  const useFolder = sp.get('folder') === '1';
  let keys = [sk.key];
  if (useFolder) { const files = model.resolve(dirOf(sk.key).slice(model.ROOT.length + 1), src.list).files; if (files.length > 1) { const b = model.bag(files, model.engineRandom(Math.floor(num(sp, 'seed', 1)) >>> 0)); keys = []; for (let i = 0; i < shots; i++) keys.push(b.next()); } }
  const picks = []; for (let i = 0; i < shots; i++) picks.push(keys[keys.length === 1 ? 0 : i]);
  const gid = gidOf(ctx);
  const settings = (() => { try { return gid === 'goh' ? model.folder(dirOf(sk.key), src.read, model.soundSet(src.read), undefined, { game: 'goh' }) : model.folder(dirOf(sk.key), src.read, model.soundSet(src.read)); } catch (e) { return null; } })();
  const L = model.limits(), byKey = new Map();
  picks.forEach((k, i) => { let a = byKey.get(k); if (!a) byKey.set(k, a = []); a.push(i); });
  const shotsOut = new Array(shots);
  for (const [k, idx] of byKey) {
    const buf = k === sk.key ? own : src.read(k), p = buf ? wav.parse(buf) : null;
    const fileMs = p && p.ok && p.fmt.rate ? p.frames / p.fmt.rate * 1000 : 0;
    const bpf = p && p.ok && p.frames ? p.dataBytes / p.frames : 1;
    const sim = L.simulate(idx.map(i => i * every), { fileMs: fileMs || 1, bytesPerFrame: bpf, priority: settings ? settings.priority : -1 });
    sim.copies.forEach((c, j) => { const i = idx[j]; shotsOut[i] = { i, t: c.t, key: k, fileMs: Math.round(fileMs), result: fileMs ? c.result : 'rejected', reason: fileMs ? c.reason : 'no-file', startedAt: c.startedAt, endedAt: c.endedAt }; });
  }
  return { every, count: shots, folder: useFolder, tickMs: L.tickMs, maxCopies: L.maxFilePlayedChannels, antiReverbMs: L.antiReverbMs, shots: shotsOut };
}

const ROUTES = {
  'GET /api/x/view/sound/plan': plan,
  'GET /api/x/view/sound/pcm': pcm,
  'GET /api/x/view/sound/name': name,
  'GET /api/x/view/sound/burst': burst,
};
module.exports = {
  exts: ['wav', 'mp3', 'ogg', 'flac'],
  routes: ROUTES,
  remote: Object.keys(ROUTES),
  _srcFor: srcFor, _namesOf: namesOf, _soundKeyOf: soundKeyOf, _reset: () => { _opt.clear(); _gameSrc.clear(); }, _gidOf: gidOf, _exeOf: exeOf, _userOptions: userOptions, _setProfilesOf: fn => { profilesOf = fn || profilesOfDefault; _opt.clear(); },
};
