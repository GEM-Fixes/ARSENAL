// view kind video test. Arg: scratch dir. Synthetic .avi files built here: a good one (XVID + MP3, JUNK, idx1, an odd chunk size,
// in the mod and deflated in a pak), and seeded defects: avih size wrong, one stream, PCM sound, H.264, frames inside LIST rec, a cut
// last chunk, no movi; an MJPG one whose frames the browser draws. Checks the game's verdict codes and source lines, the audio route
// (joined 01wb bytes, the cap), the frame route, the kind's files (exts, routes, remote, strings), then the page in a fake DOM: facts,
// verdict, play/stop/seek with a fake AudioContext, hide() stops the sound, the MJPG frame slider. Last line PASS.
// Author: Imperator_Aug (ARSENAL, ia-3f7038b4)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'vidk-')));
require('../../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const wr = (f, b) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };
async function rejects(fn, status, m) { let e = null; try { await fn(); } catch (x) { e = x; } ok(e && e.status === status, m + (e ? ' [' + e.message + ']' : ' [no error]')); }

// ---- AVI builder
const L = s => Buffer.from(s, 'latin1');
function ck(id, d) { const b = Buffer.alloc(8 + d.length + (d.length & 1)); b.write(id, 0, 'latin1'); b.writeUInt32LE(d.length, 4); d.copy(b, 8); return b; }
const list = (t, parts) => ck('LIST', Buffer.concat([L(t)].concat(parts)));
function avi(o) {
  o = Object.assign({ avihSize: 0x38, streams: 2, frames: 50, us: 40000, vfcc: 'XVID', atag: 0x55, abytes: 32000, avg: 16000, rec: false, cut: false, junk: true, movi: true, jpeg: false }, o);
  const ah = Buffer.alloc(o.avihSize); ah.writeUInt32LE(o.us, 0); ah.writeInt32LE(o.frames, 16); ah.writeUInt32LE(o.streams, 24); ah.writeInt32LE(64, 32); ah.writeInt32LE(48, 36);
  const sh0 = Buffer.alloc(56); sh0.write('vids', 0, 'latin1'); sh0.write(o.vfcc.toLowerCase(), 4, 'latin1'); sh0.writeUInt32LE(1, 20); sh0.writeUInt32LE(25, 24); sh0.writeUInt32LE(o.frames, 32);
  const sf0 = Buffer.alloc(40); sf0.writeUInt32LE(40, 0); sf0.writeInt32LE(64, 4); sf0.writeInt32LE(48, 8); sf0.write(o.vfcc, 16, 'latin1');
  const sh1 = Buffer.alloc(56); sh1.write('auds', 0, 'latin1'); sh1.writeUInt32LE(1, 20); sh1.writeUInt32LE(o.avg, 24); sh1.writeUInt32LE(o.abytes, 32);
  const sf1 = Buffer.alloc(16); sf1.writeUInt16LE(o.atag, 0); sf1.writeUInt16LE(2, 2); sf1.writeUInt32LE(44100, 4); sf1.writeUInt32LE(o.avg, 8); sf1.writeUInt16LE(1, 12);
  const strl = [list('strl', [ck('strh', sh0), ck('strf', sf0)])];
  if (o.streams > 1) strl.push(list('strl', [ck('strh', sh1), ck('strf', sf1)]));
  const hdrl = list('hdrl', [ck('avih', ah)].concat(strl));
  const ch = [];
  const per = o.streams > 1 ? Math.floor(o.abytes / o.frames) : 0;
  for (let i = 0; i < o.frames; i++) {
    const f = Buffer.alloc(i === 1 ? 33 : 40, i & 0xff); if (o.jpeg) { f[0] = 0xff; f[1] = 0xd8; f[2] = 0xff; }
    ch.push(ck('00dc', f));
    if (per) { const a = Buffer.alloc(per, 0x30 + (i % 10)); ch.push(ck('01wb', a)); }
  }
  let movi = o.rec ? list('movi', [list('rec ', ch)]) : list('movi', ch);
  const top = [L('AVI '), hdrl];
  if (o.junk) top.push(ck('JUNK', Buffer.alloc(100)));
  if (o.movi) top.push(movi);
  top.push(ck('idx1', Buffer.alloc(16 * 4)));
  let body = Buffer.concat(top);
  const r = Buffer.concat([L('RIFF'), Buffer.alloc(4), body]); r.writeUInt32LE(body.length, 4);
  return o.cut ? r.subarray(0, r.length - 64 - 8 - 20) : r;   // the idx1 gone and the last chunk cut
}

const game = path.join(work, 'game');
process.env.GOH_GAME = path.join(work, 'goh'); process.env.AS2_NO_STEAM = '1'; process.env.AS2_HOME = path.join(work, 'home');
wr(path.join(game, 'as64.exe'), 'MZ');
const mod = path.join(game, 'mods', 'mine');
wr(path.join(mod, 'mod.info'), '{mod {name "Mine"}}\r\n');
const V = 'resource/video/';
const files = {
  good: avi(), avih: avi({ avihSize: 0x40 }), one: avi({ streams: 1 }), pcm: avi({ atag: 1 }), h264: avi({ vfcc: 'H264' }), rec: avi({ rec: true }),
  cut: avi({ cut: true }), nomovi: avi({ movi: false }), mjpg: avi({ vfcc: 'MJPG', jpeg: true, streams: 1, frames: 5 }), drift: avi({ frames: 10 }),
};
for (const k of Object.keys(files)) wr(path.join(mod, V + k + '.avi'), files[k]);
wr(path.join(mod, 'resource.pak'), require('../../../../lib/zipwrite').zip([['video/good.avi', files.good, true]]));
const ctx = { tools: path.join(__dirname, '..', '..', '..', '..'), tmpRoot: work, game: () => game, allowLaunch: false };
const VS = require('./video.server'), VL = require('./video.lang'), VC = require('./video.client'), FS = require('../server');
const route = (p, q) => { const u = new URL('http://x' + p + (q ? '?' + q : '')); const f = VS.routes['GET ' + p] || FS.routes['GET ' + p]; return f(u, null, ctx); };
const info = rel => route('/api/x/view/video/info', 'mod=' + encodeURIComponent(mod) + '&rel=' + encodeURIComponent(rel));
const codes = o => o.verdict.why.map(w => w.code);

(async () => {
  // ---- the kind's files
  ok(VS.exts.join() === 'avi' && VS.remote.length === 3 && VS.remote.every(r => VS.routes[r]), 'server: .avi, three read-only routes open to a phone');
  ok(VL.every(r => r.length === 5 && r[0].startsWith('view.video.') && r.slice(1).every(s => typeof s === 'string' && s.length)), 'strings: view.video.* in en, ru, uk, zh');
  const keys = new Set(VL.map(r => r[0]).concat(require('../lang').map(r => r[0])));
  const miss = [...VC.script.matchAll(/tx\('([a-z0-9.]+)'/gi)].map(m => m[1]).filter(k => !keys.has(k) && !/\.$/.test(k));
  ok(!miss.length && !/`|\$\{|innerHTML|insertAdjacentHTML|document\.write/.test(VC.script), 'client: page-safe, every tx key exists ' + miss.join());
  const src = fs.readFileSync(require.resolve('../../../../lib/avi'), 'utf8');
  const allCodes = [...src.matchAll(/add\('([a-zA-Z0-9]+)'/g)].map(m => m[1]).concat([...src.matchAll(/fail\('([a-zA-Z0-9]+)'/g)].map(m => 'fail.' + m[1]), ['stepped']);
  const noStr = [...new Set(allCodes)].filter(c => !keys.has('view.video.r.' + c));
  ok(!noStr.length, 'every verdict code has a string: ' + noStr.join());

  // ---- the game's verdict
  const g = await info(V + 'good.avi');
  ok(g.ok && g.avih.width === 64 && g.avih.height === 48 && Math.abs(g.fps - 25) < 1e-9 && g.fourcc === 'XVID' && g.streams[1].fmt.tag === 0x55, 'good: avih, fps from microseconds per frame, codec, MP3');
  ok(g.video.count === 50 && g.audio.count === 50 && g.idx1 && g.verdict.picture === 'plays' && g.verdict.sound === 'plays' && !g.verdict.why.length, 'good: 50 frames, 50 sound chunks, plays with sound ' + codes(g));
  ok(g.dur.agree === true && Math.abs(g.dur.video - 2) < 1e-9 && Math.abs(g.dur.audio - 2) < 0.01 && !g.video.chunks, 'good: 2 s of both, they agree; no chunk lists sent');
  ok(g.top.some(t => t.id === 'JUNK') && g.video.bytes === 49 * 40 + 33, 'good: JUNK skipped, an odd chunk size padded');
  const gp = await info('resource.pak:\x3avideo/good.avi');
  ok(gp.ok && gp.video.count === 50 && gp.audio.bytes === g.audio.bytes, 'good inside a deflated pak entry: the same facts (slices, never whole)');
  const a1 = await info(V + 'avih.avi');
  ok(!a1.ok && a1.fail.code === 'avihSize' && !('src' in a1.fail) && a1.verdict.picture === 'wont' && a1.verdict.sound === 'wont', 'avih size 0x40: nothing plays, no source line sent');
  const o1 = await info(V + 'one.avi');
  ok(o1.ok && o1.verdict.picture === 'plays' && o1.verdict.sound === 'silent' && codes(o1).includes('oneStream') && !('src' in o1.verdict.why[0]), 'one stream: plays silent, no source line sent');
  const p1 = await info(V + 'pcm.avi');
  ok(p1.verdict.sound === 'wont' && codes(p1).includes('notMp3') && p1.verdict.why.find(w => w.code === 'notMp3').p.f === 'PCM', 'PCM sound: will not play (MP3 only, line 131)');
  const h1 = await info(V + 'h264.avi');
  ok(h1.verdict.picture === 'wont' && codes(h1).includes('codec') && h1.browser === 'h264', 'H.264: will not play');
  const r1 = await info(V + 'rec.avi');
  ok(r1.ok && r1.video.count === 0 && r1.lists === 1 && r1.verdict.picture === 'wont' && codes(r1).includes('inRec'), 'frames inside LIST rec: never read');
  const c1 = await info(V + 'cut.avi');
  ok(c1.ok && (c1.video.cut || c1.audio.cut) && codes(c1).includes('cut') && !c1.idx1, 'a cut last chunk: playback ends there');
  const m1 = await info(V + 'nomovi.avi');
  ok(!m1.ok && m1.fail.code === 'noMovi', 'no movi: nothing (' + (m1.fail && m1.fail.code) + ')');
  const d1 = await info(V + 'drift.avi');
  ok(d1.dur.agree === false && codes(d1).includes('durations'), 'video 0.4 s, sound 2 s: they differ');

  // ---- audio and frame routes
  const q = rel => 'mod=' + encodeURIComponent(mod) + '&rel=' + encodeURIComponent(rel);
  const au = await route('/api/x/view/video/audio', q(V + 'good.avi'));
  const ab = Buffer.from(au.b64, 'base64');
  ok(au.bytes === 32000 && au.total === 32000 && !au.cut && ab[0] === 0x30 && ab[640] === 0x31 && ab[31999] === 0x39, 'audio: the 01wb payloads joined in order');
  await rejects(() => route('/api/x/view/video/audio', q(V + 'one.avi')), 404, 'audio: none in a one-stream file -> 404');
  const fr = await route('/api/x/view/video/frame', q(V + 'mjpg.avi') + '&n=2');
  ok(fr.mime === 'image/jpeg' && fr.count === 5 && Buffer.from(fr.b64, 'base64')[1] === 0xd8, 'frame: an MJPG frame as a JPEG');
  await rejects(() => route('/api/x/view/video/frame', q(V + 'good.avi') + '&n=0'), 415, 'frame: an XVID frame -> 415');
  await rejects(() => route('/api/x/view/video/frame', q(V + 'mjpg.avi') + '&n=9'), 400, 'frame: past the last -> 400');

  // ---- play in the PC's own video player (spawn stubbed: nothing starts)
  const spawned = [];
  VS._setSpawn((exe, args, o) => { spawned.push({ exe, args, o }); return { unref() {}, on() {} }; });
  VS._setPlatform('win32');
  const PLAY = 'POST /api/x/view/video/play', playR = (b, c) => VS.routes[PLAY](null, b, c || ctx);
  const RM = require('../../../remote');
  ok(typeof VS.routes[PLAY] === 'function' && !VS.remote.includes(PLAY) && !RM.allowed('POST', '/api/x/view/video/play') && !require('../index').remote.includes(PLAY), 'play: a POST route, not in the kind\'s remote list, refused for a phone by remote.js (default deny)');
  const loose = path.join(mod, V + 'good.avi');
  let pr = await playR({ mod, rel: V + 'good.avi' });
  ok(pr.ok && !pr.extracted && path.resolve(pr.file) === path.resolve(loose) && pr.size === files.good.length, 'play loose: opened where it is, no copy');
  ok(spawned.length === 1 && spawned[0].exe === 'explorer.exe' && spawned[0].args.length === 1 && spawned[0].args[0] === pr.file && spawned[0].o.shell === false && spawned[0].o.detached === true, 'play loose: explorer.exe with one argv element (the path), shell:false, detached');
  pr = await playR({ path: loose, mod });
  ok(pr.ok && !pr.extracted && path.resolve(pr.file) === path.resolve(loose) && spawned.length === 2, 'play by full path inside the mod: in place');
  // a pak entry: plan first (nothing written, nothing started), then unpacked byte-identical, then reused
  const vdir = path.join(work, 'view-video');
  const pl = await playR({ mod, rel: 'resource.pak:\x3avideo/good.avi', plan: true });
  ok(pl.plan && pl.extracted && !pl.reused && pl.inPak === 'resource.pak' && path.dirname(pl.file) === vdir && !fs.existsSync(pl.file) && spawned.length === 2, 'plan: says a copy goes to the temp folder, writes and starts nothing');
  fs.mkdirSync(vdir, { recursive: true });
  const oldF = path.join(vdir, 'old.avi'), newF = path.join(vdir, 'fresh.avi');
  fs.writeFileSync(oldF, 'x'); fs.writeFileSync(newF, 'y'); const two = new Date(Date.now() - 2 * 86400000); fs.utimesSync(oldF, two, two);
  pr = await playR({ mod, rel: 'resource.pak:\x3avideo/good.avi' });
  ok(pr.extracted && !pr.reused && pr.file === pl.file && fs.readFileSync(pr.file).equals(files.good) && spawned.length === 3 && spawned[2].args.length === 1 && spawned[2].args[0] === pr.file, 'play pak entry: unpacked byte-identical to the temp folder, then opened');
  ok(!fs.existsSync(oldF) && fs.existsSync(newF) && !fs.readdirSync(vdir).some(f => /\.part$/.test(f)), 'play: files older than a day go, fresh ones stay, no .part left');
  pr = await playR({ mod, rel: 'resource.pak:\x3avideo/good.avi' });
  ok(pr.extracted && pr.reused && pr.file === pl.file && spawned.length === 4, 'play pak entry again: the same copy reused');
  // a big deflated entry: unpacked in slices, byte-identical
  const big = Buffer.alloc(9 * 1024 * 1024 + 123); for (let i = 0; i + 4 <= big.length; i += 4) big.writeUInt32LE((i * 2654435761) >>> 0, i);
  wr(path.join(mod, 'big.pak'), require('../../../../lib/zipwrite').zip([['video/big.avi', big, true]]));
  pr = await playR({ mod, rel: 'big.pak:\x3avideo/big.avi' });
  ok(pr.extracted && fs.statSync(pr.file).size === big.length && fs.readFileSync(pr.file).equals(big), 'play a 9 MB deflated entry: unpacked in 4 MB slices, byte-identical');
  // a loose path the system opener would misread (a comma): through a temp copy with a plain name
  wr(path.join(mod, V + 'a,b.avi'), files.one);
  pr = await playR({ mod, rel: V + 'a,b.avi' });
  ok(pr.extracted && !/,/.test(path.basename(pr.file)) && fs.readFileSync(pr.file).equals(files.one), 'play a path with a comma: a copy with a plain name');
  // other systems: the same argv rule
  VS._setPlatform('darwin'); const n0 = spawned.length; await playR({ mod, rel: V + 'good.avi' });
  ok(spawned[n0].exe === 'open' && spawned[n0].args.length === 1 && spawned[n0].args[0] === loose && spawned[n0].o.shell === false, 'play macOS: open <file>, no shell');
  VS._setPlatform('win32');
  // refusals: nothing starts
  const n1 = spawned.length;
  wr(path.join(mod, 'resource', 'run.exe'), 'MZ'); wr(path.join(work, 'outside', 'x.avi'), files.good);
  await rejects(() => playR({ mod, rel: '../outside/x.avi' }), 400, 'play: ".." out of the mod -> 400');
  await rejects(() => playR({ mod, path: path.join(work, 'outside', 'x.avi') }), 403, 'play: a full path outside the game and mod folders -> 403');
  await rejects(() => playR({ mod, rel: 'resource/run.exe' }), 415, 'play: not a video (an .exe would run) -> 415');
  await rejects(() => playR({ mod, rel: V + 'nope.avi' }), 404, 'play: no such file -> 404');
  await rejects(() => playR({ mod, rel: V + 'good.avi' }, Object.assign({}, ctx, { session: { remote: true }, pathOk: () => true })), 403, 'play: a phone session -> 403 (and remote.js never lets it through)');
  await rejects(() => playR({ mod, rel: { x: 1 } }), 400, 'play: a ref that is not a string -> 400');
  ok(spawned.length === n1, 'refusals started nothing');
  VS._setSpawn(() => null);
  await rejects(() => playR({ mod, rel: V + 'good.avi' }), 500, 'play: the opener cannot start -> 500 in plain words');
  VS._setSpawn((exe, args, o) => { spawned.push({ exe, args, o }); return { unref() {}, on() {} }; });

  // ---- the page in a fake DOM
  const fakedom = require('../../../test/fakedom'), doc = fakedom.make(), timers = [];
  const ac = { started: 0, stopped: 0, offs: [], closed: 0 };
  class FakeAC { constructor() { this.currentTime = 0; this.destination = {}; }
    decodeAudioData(buf, res) { ac.decoded = buf.byteLength; Promise.resolve().then(() => res({ duration: 2 })); }
    createBufferSource() { return { connect() {}, start(t, off) { ac.started++; ac.offs.push(off); }, stop() { ac.stopped++; } }; }
    resume() {} close() { ac.closed++; } }
  const box = { document: doc, console, setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout() {}, atob: s => Buffer.from(s, 'base64').toString('latin1'), AudioContext: FakeAC };
  box.window = box;
  const LS = {}; for (const r of require('../lang').concat(VL)) LS[r[0]] = r[1];
  const h = (t, a, k) => { const e = doc.createElement(t); for (const x in a || {}) { const v = a[x]; if (v == null || v === false) continue; if (x === 'class') e.className = v; else if (x === 'text') e.textContent = v; else if (x.slice(0, 2) === 'on') e.addEventListener(x.slice(2), v); else e.setAttribute(x, v === true ? '' : v); } (k || []).forEach(c => { if (c != null) e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); }); return e; };
  const tx = (k, p) => { let s = LS[k] || k; if (p) s = s.replace(/\{(\w+)\}/g, (m, x) => (p[x] == null ? m : String(p[x]))); return s; };
  const posts = [];
  const api = (u, b) => {
    if (b !== undefined) { const body = JSON.parse(JSON.stringify(b)); posts.push(body); return Promise.resolve().then(() => VS.routes['POST ' + u](null, body, ctx)).then(j => JSON.parse(JSON.stringify(j))); }
    const i = u.indexOf('?'); return route(u.slice(0, i), u.slice(i + 1)).then(j => JSON.parse(JSON.stringify(j)));
  };
  Object.assign(box, { h, tx, api, S: { mod, sec: {} }, show() {}, toast() {} });
  vm.createContext(box);
  vm.runInContext(require('../client').script(require('../client').css + '\n' + VC.css) + '\n' + VC.script, box, { filename: 'video-script' });
  const flush = async () => { for (let i = 0; i < 10; i++) { timers.splice(0).forEach(f => f()); await new Promise(r => setImmediate(r)); } };
  const host = doc.createElement('div'); doc.body.appendChild(host);
  ok(box.VIEW.kindOf('resource/video/menu.avi') === 'video', 'page: .avi is the video kind');
  const hd = box.VIEW.mount(host, { mod, rel: V + 'good.avi' }, 'good.avi', { kind: 'video' });
  await flush();
  const t = host.textContent;
  ok(/64 x 48/.test(t) && /XVID/.test(t) && /MP3, 2 channels, 44100 Hz/.test(t) && /\(they match\)/.test(t) && /Picture in the game/.test(t), 'page: facts card (size, codec, sound, lengths match)');
  ok(host.querySelectorAll('b.vw-vd-ok').length === 2 && /Browsers cannot draw XVID/.test(t), 'page: plays + plays; the browser cannot draw XVID, said in one line');
  const play = host.querySelector('.vw-vd-au').querySelector('button');
  play.click(); await flush();
  if (process.env.DBG) console.log(JSON.stringify(ac), play.textContent, host.querySelector('.vw-vd-tl').textContent, host.querySelector('.vw-vd-msg').textContent);
  ok(ac.started === 1 && ac.decoded === 32000 && play.textContent === 'Stop' && /0:00 \/ 0:02/.test(host.querySelector('.vw-vd-tl').textContent), 'page: Play decodes the joined MP3 and starts it');
  const bar = host.querySelector('input.vw-vd-bar'); bar.value = '500'; bar.fire('change'); await flush();
  ok(ac.started === 2 && ac.offs[1] === 1, 'page: the time bar seeks (restarts at 1 s)');
  hd.hide(); await flush();
  ok(ac.stopped >= 2 && play.textContent === 'Play', 'page: hide() stops the sound');
  hd.show(); play.click(); await flush(); hd.close();
  ok(ac.closed === 1 && !host.children.length, 'page: close() stops and ends the audio context');
  // a one-stream MJPG: no sound, a frame slider with a JPEG
  const h2 = doc.createElement('div'); doc.body.appendChild(h2);
  box.VIEW.mount(h2, { mod, rel: V + 'mjpg.avi' }, 'mjpg.avi', { kind: 'video' }); await flush();
  const img = h2.querySelector('img.vw-vd-img');
  ok(/silent/.test(h2.textContent) && /only one stream/i.test(h2.textContent) && /No sound track/.test(h2.textContent) && !/\.cpp\b/.test(h2.textContent), 'page MJPG: silent, why, no source line');
  ok(img && /^data:image\/jpeg;base64,/.test(img.getAttribute('src')) && /Frame 1 of 5/.test(h2.textContent), 'page MJPG: the first frame drawn');
  const sl = h2.querySelector('input.vw-vd-bar'); sl.value = '3'; sl.fire('change'); await flush();
  ok(/Frame 4 of 5/.test(h2.textContent), 'page MJPG: the slider moves frames');
  // a broken one: the reason and the ffmpeg line
  const h3 = doc.createElement('div'); doc.body.appendChild(h3);
  box.VIEW.mount(h3, { mod, rel: V + 'avih.avi' }, 'avih.avi', { kind: 'video' }); await flush();
  ok(/exactly 56 bytes/.test(h3.textContent) && /ffmpeg -i in\.mp4/.test(h3.textContent) && h3.querySelectorAll('b.vw-vd-bad').length === 2, 'page broken: will not play, why, how to make one');

  // ---- page: Play in my video player (askDo first; Cancel = no POST that starts anything)
  const asks = []; let answer = false;
  box.askDo = o => { asks.push(o); return Promise.resolve(answer); };
  const realPosts = () => posts.filter(p => p.plan !== true);
  const h4 = doc.createElement('div'); doc.body.appendChild(h4);
  box.VIEW.mount(h4, { mod, rel: V + 'good.avi' }, 'good.avi', { kind: 'video' }); await flush();
  const xb = h4.querySelector('button.vw-vd-ext'), xm = () => h4.querySelector('.vw-vd-xmsg').textContent;
  ok(xb && xb.textContent === 'Play in my video player' && /primary/.test(xb.className) && /press "Play in my video player" above/.test(h4.textContent), 'page: the primary button beside the sound, the XVID line points at it');
  let s0 = spawned.length;
  xb.click(); await flush();
  const a0 = asks[0] || { lines: [] };
  if (process.env.DBG) console.log(JSON.stringify(a0));
  ok(asks.length === 1 && a0.title === 'Play in my video player' && a0.ok === 'Open the player' && a0.lines.length === 3 && /^File: good\.avi \(/.test(a0.lines[0]) && /outside ARSENAL/.test(a0.lines[1]) && /\.avi files/.test(a0.lines[1]) && /Nothing in the game or the mod is changed/.test(a0.lines[2]) && !a0.where, 'page loose: askDo with the file and size, the outside player, nothing changed; no where');
  ok(!realPosts().length && spawned.length === s0 && xm() === '', 'page: Cancel = no POST that opens, nothing started, no status');
  answer = true; xb.click(); await flush();
  ok(asks.length === 2 && realPosts().length === 1 && realPosts()[0].rel === V + 'good.avi' && spawned.length === s0 + 1 && /good\.avi opened in your video player/.test(xm()), 'page: confirm = POST, opened, status line');
  // a pak entry: the copy line and the temp path as where
  const h5 = doc.createElement('div'); doc.body.appendChild(h5);
  box.VIEW.mount(h5, { mod, rel: 'resource.pak:\x3avideo/good.avi' }, 'good.avi', { kind: 'video' }); await flush();
  for (let i = 0; i < 200 && !h5.querySelector('button.vw-vd-ext'); i++) { await new Promise(r => setTimeout(r, 10)); await flush(); }
  h5.querySelector('button.vw-vd-ext').click(); await flush();
  const a1p = asks[2] || { lines: [] };
  ok(a1p.lines.length === 4 && /inside resource\.pak, so a copy is first unpacked to the temp folder/.test(a1p.lines[2]) && a1p.where === path.join(work, 'view-video', path.basename(a1p.where)) && /good\.avi$/.test(a1p.where), 'page pak entry: the copy line, the temp path as where');
  ok(/opened in your video player/.test(h5.querySelector('.vw-vd-xmsg').textContent) && spawned.length === s0 + 2, 'page pak entry: opened');
  // an error in plain words
  VS._setSpawn(() => null); h5.querySelector('button.vw-vd-ext').click(); await flush();
  ok(/^The video player could not be opened: No video player could be started on this PC for \.avi files/.test(h5.querySelector('.vw-vd-xmsg').textContent), 'page: the error in plain words');
  VS._setSpawn((exe, args, o) => { spawned.push({ exe, args, o }); return { unref() {}, on() {} }; });
  // no askDo on the page: the browser's confirm, never a start without a question
  delete box.askDo; let conf = null; box.confirm = t => { conf = t; return false; };
  s0 = spawned.length; const p0 = realPosts().length;
  xb.click(); await flush();
  ok(conf && /Play in my video player/.test(conf) && /Nothing in the game/.test(conf) && realPosts().length === p0 && spawned.length === s0, 'page without askDo: window.confirm asks, Cancel starts nothing');
  delete box.confirm; xb.click(); await flush();
  ok(realPosts().length === p0 && spawned.length === s0, 'page without askDo or confirm: nothing starts');
  // the phone view: no button, the plain XVID line
  box.RMT = true;
  const h6 = doc.createElement('div'); doc.body.appendChild(h6);
  box.VIEW.mount(h6, { mod, rel: V + 'good.avi' }, 'good.avi', { kind: 'video' }); await flush();
  ok(!h6.querySelector('button.vw-vd-ext') && !/video player/.test(h6.textContent) && /Browsers cannot draw XVID/.test(h6.textContent), 'page remote: no Play in my video player button, the XVID line does not point at one');
  delete box.RMT;
  box.IDE = { remote: true };
  const h7 = doc.createElement('div'); doc.body.appendChild(h7);
  box.VIEW.mount(h7, { mod, rel: V + 'good.avi' }, 'good.avi', { kind: 'video' }); await flush();
  ok(!h7.querySelector('button.vw-vd-ext'), 'page with IDE.remote: no button');
  delete box.IDE;
  VS._setSpawn(null); VS._setPlatform(null);

  // ---- optional sweep of the game's videos
  const G = process.env.AS2_SWEEP_GAME;
  if (G && fs.existsSync(G)) {
    const pak = require('../../../../lib/pak'), AVI = require('../../../../lib/avi');
    let k = 0, f = 0;
    for (const p of ['video.pak', 'video_origins.pak']) {
      const pf = path.join(G, 'resource', p); if (!fs.existsSync(pf)) continue;
      for (const e of pak.list(pf).filter(x => /\.avi$/i.test(x.name))) {
        k++; const R = require('../ref'); const s = { type: 'pak', file: pf, ent: e };
        const o = await AVI.parse((off, len) => R.readRange(s, off, len), e.size);
        if (!o.ok) { f++; console.log('sweep fail ' + e.name + ' ' + o.fail.code); }
        else console.log('sweep ' + e.name + ' ' + o.fourcc + ' ' + o.avih.width + 'x' + o.avih.height + ' ' + o.fps.toFixed(2) + 'fps v' + o.video.count + ' a' + o.audio.count + ' ' + o.verdict.picture + '/' + o.verdict.sound + ' ' + codes(o).join(','));
      }
    }
    console.log('sweep: ' + k + ' avi, ' + f + ' failed');
  }

  console.log(bad ? bad + ' of ' + n + ' failed' : 'view kind video ' + n + ' PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crash ' + e.stack); process.exit(1); });
