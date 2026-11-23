// view kind video, server side (.avi): the facts of an .avi read with the GAME's rules (tools/lib/avi.js),
// never loaded whole (1 MB slices through R.readRange).
//   GET /api/x/view/video/info?<ref>         -> { ok, fail, avih, fps, streams, top, movi, video{count,bytes,max,cut}, audio{...},
//                                               other, lists, idx1, dur{video,audio,agree}, verdict{picture,sound,why[{code,src,p}]},
//                                               fourcc, browser, notes, audioCap }
//   GET /api/x/view/video/audio?<ref>        -> { b64, bytes, total, cut, cap }  the '01wb' payloads joined (MP3 for decodeAudioData),
//                                               at most 16 MB (cut = true when the track is longer)
//   GET /api/x/view/video/frame?<ref>&n=     -> { n, count, mime, b64 }  frame n's '00dc' payload, only when it is a JPEG (MJPG): the
//                                               one kind of AVI frame a browser draws by itself; anything else -> 415
//   POST /api/x/view/video/play  body = the ref ({mod, rel} | {mod, key[, idx]} | {mod, path}) [+ plan:true]
//                                            -> { ok, file, extracted, reused, size, name, inPak }
//        Opens the video in this PC's own player (the program the system sets for the extension), through lib/platform openPath:
//        an argv array, shell:false, detached; never a shell string, never the game. A loose file opens where it is. A file inside a
//        pak (a game pak, a mod pak entry <pak>::<entry>, a layer) is first unpacked to <tmpRoot>/view-video in 4 MB slices
//        (R.readRange; never whole in memory), read-only, reused while one with the same size is there; files there older than a day go
//        on each call. plan:true = nothing written, nothing started: the answer says what a real call would do (the page's question).
//        Only the extensions this kind claims (a player starts by extension: never an .exe). Not in `remote`: a phone never starts a
//        program on the PC (ALLOW in tools/gui/remote.js is default deny; refused here too when ctx.session.remote).
// A parse is kept per file (size + time) for the frame and audio routes. The only write is the temp copy above.
// Author: Imperator_Aug (ARSENAL, ia-6e4e0ecd)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const R = require('../ref'), AVI = require('../../../../lib/avi');

const AUDIO_CAP = 16 << 20, KEEP = 6;
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const CACHE = new Map();

async function parsed(ctx, url) {
  const r = R.resolve(ctx, R.refOfQuery(url));
  let mt = 0; try { mt = fs.statSync(r.file).mtimeMs; } catch { /* gone: no cache key */ }
  const k = [r.file, r.entry || '', r.size, mt].join('|');
  let c = CACHE.get(k);
  if (!c) {
    c = { r, p: AVI.parse((off, len) => R.readRange(r.src, off, len), r.size) };
    CACHE.set(k, c);
    while (CACHE.size > KEEP) CACHE.delete(CACHE.keys().next().value);
    c.p.catch(() => CACHE.delete(k));
  }
  return { r: c.r, o: await c.p };
}
const lean = s => ({ count: s.count, bytes: s.bytes, max: s.max, cut: s.cut });

async function info(url, body, ctx) {
  const { o } = await parsed(ctx, url);
  const out = Object.assign({}, o, { audioCap: AUDIO_CAP });
  if (o.video) out.video = lean(o.video);
  if (o.audio) out.audio = lean(o.audio);
  // the page shows each reason by its code; the reader's source lines stay out of the answer
  const plain = x => { const y = Object.assign({}, x); delete y.src; return y; };
  if (o.fail) out.fail = plain(o.fail);
  if (o.verdict) out.verdict = Object.assign({}, o.verdict, { why: (o.verdict.why || []).map(plain) });
  if (o.notes) out.notes = o.notes.map(plain);
  return out;
}
async function audio(url, body, ctx) {
  const { r, o } = await parsed(ctx, url);
  if (!o.ok || !o.audio || !o.audio.count) throw bad('This video has no sound track the game reads (no 01wb chunks).', 404);
  const a = await AVI.audioBytes((off, len) => R.readRange(r.src, off, len), o.audio.chunks, AUDIO_CAP);
  return { b64: a.buf.toString('base64'), bytes: a.buf.length, total: a.total, cut: a.cut, cap: AUDIO_CAP };
}
async function frame(url, body, ctx) {
  const { r, o } = await parsed(ctx, url);
  const n = Number(url.searchParams.get('n') || 0);
  if (!o.ok || !o.video || !o.video.count) throw bad('This video has no frames the game reads (no 00dc chunks).', 404);
  if (!Number.isInteger(n) || n < 0 || n >= o.video.chunks.length) throw bad('n: a frame from 0 to ' + (o.video.chunks.length - 1), 400);
  const c = o.video.chunks[n], b = await R.readRange(r.src, c[0], Math.min(c[1], 8 << 20));
  if (!(b.length > 3 && b[0] === 0xff && b[1] === 0xd8)) throw bad('This frame is not a picture the browser can draw (' + (o.fourcc || '?') + ').', 415);
  return { n, count: o.video.count, mime: 'image/jpeg', b64: b.toString('base64') };
}

// ---------------------------------------------------------------- play in the PC's own video player
const EXTS = ['avi'];
const SLICE = 4 << 20, COPY_MAX = 4 * 1024 * 1024 * 1024, AGE = 24 * 3600 * 1000, DIR = 'view-video';
let _spawn = null, _plat = null;   // test hooks: fake spawn, platform name for lib/platform
// lib/platform options: the real launcher by default; with the test spawn the same argv goes to the fake (detached, no shell)
function platOpt() {
  const o = {};
  if (_plat) o.platform = _plat;
  if (_spawn) o.spawn = (file, args, so) => {
    const ch = _spawn(file, args, Object.assign({}, so, { shell: false, detached: true }));
    if (ch && ch.on) ch.on('error', () => {});
    if (ch && ch.unref) ch.unref();
    return ch || { error: new Error('could not start ' + file) };
  };
  return o;
}
const low = p => path.resolve(p).toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
const under = (f, root) => !!root && (low(f) + '/').startsWith(low(root) + '/');
const extOf = s => { const b = String(s || '').split('::').pop().split(/[\\/]/).pop().toLowerCase(), i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1) : ''; };
const safeName = (tag, name) => crypto.createHash('sha1').update(String(tag)).digest('hex').slice(0, 10) + '-' + String(name).split(/[\\/]/).pop().replace(/[^A-Za-z0-9._-]/g, '_').slice(-80);
const statOf = f => { try { return fs.statSync(f); } catch { return null; } };
// body -> the ref query (strings, empty values dropped), the same forms as the GET routes
function refOfBody(b) {
  const q = {};
  for (const k of ['mod', 'rel', 'key', 'idx', 'path']) { const v = b[k]; if (v == null || v === '') continue; if (typeof v !== 'string' && typeof v !== 'number') throw bad(k + ': a string is needed'); q[k] = String(v); }
  return q;
}
// files in view-video older than a day go (a file a player still holds open stays; errors ignored)
function sweep(dir) {
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  const old = Date.now() - AGE;
  for (const e of ents) {
    if (!e.isFile()) continue;
    const f = path.join(dir, e.name);
    try { const st = fs.lstatSync(f); if (!st.isFile() || st.mtimeMs >= old) continue; try { fs.chmodSync(f, 0o666); } catch { /* */ } fs.unlinkSync(f); } catch { /* in use or gone */ }
  }
}
// ref -> what a play does: {r, file, extracted, have}. Refusals: a phone, another extension, a path outside the game and mod folders
function planOf(ctx, body) {
  if (ctx && ctx.session && ctx.session.remote) throw bad('A phone cannot start a program on the PC. Open the video on the PC.', 403);
  if (!body || typeof body !== 'object') throw bad('Open a file first: rel, key or path is needed.');
  const r = R.resolve(ctx, refOfBody(body));
  const e = extOf(r.name);
  if (!EXTS.includes(e) || (!r.entry && !EXTS.includes(extOf(r.file)))) throw bad('Only video files open in the video player (' + EXTS.map(x => '.' + x).join(', ') + ').', 415);
  if (r.where === 'outside') {
    // the page's game folder (game parity: under GoH the GoH install, ctx.curDir; else the AS2 install, as before)
    let g = null; try { g = (typeof ctx.curDir === 'function' && ctx.curDir()) || (ctx.game && ctx.game()); } catch { g = null; }
    const roots = [g, r.mod, r.mod && path.dirname(r.mod)].filter(Boolean);
    if (!roots.some(x => under(r.file, x))) throw bad('That file is outside the game and mod folders.', 403);
  }
  // explorer.exe reads commas and quotes in its argument as switches: such a loose path goes through a temp copy with a plain name
  const odd = /[",;]/.test(r.file);
  if (!r.entry && !odd) return { r, file: r.file, extracted: false, have: true };
  if (!ctx.tmpRoot) throw bad('There is no temp folder for the copy.', 500);
  if (r.size > COPY_MAX) throw bad('The video is over 4 GB: too big to unpack a copy.', 413);
  let mt = 0; try { mt = fs.statSync(r.file).mtimeMs; } catch { /* gone: resolve already said */ }
  const f = path.join(ctx.tmpRoot, DIR, safeName([low(r.file), r.entry || '', r.size, mt].join('|'), r.name));
  const st = statOf(f);
  return { r, file: f, extracted: true, have: !!(st && st.isFile() && st.size === r.size) };
}
// the pak entry (or odd-named file) -> its temp copy, written in slices to a .part file, then renamed; read-only after
async function unpack(p) {
  const { r, file } = p, dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  if (p.have) { const t = new Date(); try { fs.utimesSync(file, t, t); } catch { /* read-only on some systems: kept a day from the first copy */ } return true; }
  const part = file + '.' + process.pid + '-' + crypto.randomBytes(4).toString('hex') + '.part';
  const fd = fs.openSync(part, 'w');
  try {
    for (let off = 0; off < r.size;) {
      const b = await R.readRange(r.src, off, Math.min(SLICE, r.size - off));
      if (!b.length) throw bad('The video ends early inside its pak (' + off + ' of ' + r.size + ' bytes).', 415);
      let w = 0; while (w < b.length) w += fs.writeSync(fd, b, w, b.length - w);
      off += b.length;
    }
    fs.closeSync(fd);
  } catch (e) { try { fs.closeSync(fd); } catch { /* closed */ } try { fs.unlinkSync(part); } catch { /* */ } throw e; }
  try {
    const old = statOf(file);
    if (old) { try { fs.chmodSync(file, 0o666); } catch { /* */ } fs.unlinkSync(file); }
    fs.renameSync(part, file);
  } catch (e) {
    try { fs.unlinkSync(part); } catch { /* */ }
    const st = statOf(file);   // another call made the same copy at the same time, or a player holds the old one
    if (!(st && st.isFile() && st.size === r.size)) throw bad('The copy could not be put in the temp folder: ' + e.message, 500);
    return true;
  }
  try { fs.chmodSync(file, 0o444); } catch { /* best effort: read-only flag */ }
  return false;
}
async function play(url, body, ctx) {
  const p = planOf(ctx, body), r = p.r;
  const out = { ok: true, file: p.file, extracted: p.extracted, reused: p.extracted && p.have, size: r.size, name: r.name, inPak: r.inPak || null };
  if (body.plan === true) return Object.assign(out, { plan: true });
  if (p.extracted) { sweep(path.dirname(p.file)); out.reused = await unpack(p); }
  else if (!statOf(p.file)) throw bad('The file is gone.', 404);
  const o = require('../../../../lib/platform').openPath(p.file, platOpt());
  if (!o.ok) throw bad('No video player could be started on this PC for .' + extOf(r.name) + ' files. Set a program for them in the system\'s default apps, then try again.', 500);
  return out;
}

const routes = { 'GET /api/x/view/video/info': info, 'GET /api/x/view/video/audio': audio, 'GET /api/x/view/video/frame': frame, 'POST /api/x/view/video/play': play };
module.exports = {
  exts: EXTS,
  routes,
  // read-only GETs only: the play route is never here (a phone must not start a program on the PC)
  remote: ['GET /api/x/view/video/info', 'GET /api/x/view/video/audio', 'GET /api/x/view/video/frame'],
  AUDIO_CAP,
};
// test hooks (not enumerable)
Object.defineProperty(module.exports, '_setSpawn', { value: fn => { _spawn = fn || null; }, enumerable: false });
Object.defineProperty(module.exports, '_setPlatform', { value: p => { _plat = p || null; }, enumerable: false });
