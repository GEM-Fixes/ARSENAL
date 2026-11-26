// view kind sound test. Arg: scratch dir. A fixture game + mod with a sound folder chain (sound.set loudness rows, folder.set tag +
// Volume on weapon/, loudness on weapon/shot/gun/), PCM16 + IMA ADPCM + stereo files, an .ogg renamed to .wav, an .mp3.
// Checks: the kind's files (exts, routes, remote, strings, page-safe script); plan (values and which folder.set set them, names a
// modder writes, folder files, bag = model.bag); pcm (a PCM16 wav whose samples equal wav.decode, IMA too; mp3 as is; ogg -> 415);
// name (fire/reload forms, a hint, a fixed file); burst (engine copy rules); the page in a fake DOM with a stub AudioContext (gains,
// pan and low pass equal the model's plan at that distance, play, stop, Space, raw mode, hide stops, show does not play, bag order,
// burst verdicts and voices, compact player, a renamed ogg says so); the Editor page switch (leaving it hides the active viewer,
// coming back shows it). Last line PASS.
// Author: Imperator_Aug (ARSENAL, ia-95ec7c58)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'sndk-')));
require('../../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const wr = (f, b) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-5);
async function rejects(fn, status, m) { let e = null; try { await fn(); } catch (x) { e = x; } ok(e && e.status === status, m + (e ? ' [' + e.message + ']' : ' [no error]')); return e; }

const game = path.join(work, 'game');
process.env.GOH_GAME = path.join(work, 'goh'); process.env.AS2_NO_STEAM = '1'; process.env.AS2_HOME = path.join(work, 'home');
wr(path.join(game, 'as64.exe'), 'MZ');
const mod = path.join(game, 'mods', 'mine');
wr(path.join(mod, 'mod.info'), '{mod {name "Mine"}}\r\n');
const wav = require('../../../../lib/wav'), model = require('../../../../sound/model');
const SR = path.join(mod, 'resource', 'sound');
const tone = (frames, ch, f) => { const p = new Int16Array(frames * ch); for (let i = 0; i < frames; i++) for (let c = 0; c < ch; c++) p[i * ch + c] = Math.round(Math.sin(i * f * (c + 1)) * 12000); return p; };
const A = wav.encodePcm16({ rate: 22050, channels: 1, pcm: tone(4410, 1, 0.05) });           // 0.2 s
const B = wav.encodeImaAdpcm({ rate: 22050, channels: 1, pcm: tone(6000, 1, 0.03) });        // IMA ADPCM
const C = wav.encodePcm16({ rate: 44100, channels: 2, pcm: tone(4410, 2, 0.02) });           // stereo
wr(path.join(SR, 'sound.set'), '{sound\r\n {percent "effects" 40 8}\r\n {loudness "default" 5 30}\r\n {loudness "shoot loud" 35 0 30}\r\n}\r\n');
wr(path.join(SR, 'weapon', 'folder.set'), '{sound\r\n {tag effects}\r\n {volume 1.2}\r\n}\r\n');
wr(path.join(SR, 'weapon', 'shot', 'gun', 'folder.set'), '{sound\r\n {loudness "shoot loud"}\r\n}\r\n');
wr(path.join(SR, 'weapon', 'shot', 'gun', 'a.wav'), A);
wr(path.join(SR, 'weapon', 'shot', 'gun', 'b.wav'), B);
wr(path.join(SR, 'weapon', 'shot', 'gun', 'c.wav'), C);
wr(path.join(SR, 'weapon', 'reload', 'rifle', 'r.wav'), A);
wr(path.join(SR, 'misc', 'bad.wav'), Buffer.concat([Buffer.from('OggS'), Buffer.alloc(200, 7)]));
const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0, 0, 0, 0, 0]), Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(400)]);
wr(path.join(mod, 'resource', 'music', 'track.mp3'), MP3);
const ctx = { tools: path.join(__dirname, '..', '..', '..', '..'), tmpRoot: work, game: () => game, allowLaunch: false };
const SS = require('./sound.server'), SL = require('./sound.lang'), SC = require('./sound.client');
const EXT = require('../index');
const GUN = 'resource/sound/weapon/shot/gun';
const call = (route, q) => { const u = new URL('http://x/api/x/view/sound/' + route); for (const k of Object.keys(q)) u.searchParams.set(k, q[k]); return SS.routes['GET /api/x/view/sound/' + route](u, null, ctx); };

(async () => {
  // ---- the kind's files
  ok(['wav', 'mp3', 'ogg', 'flac'].every(x => SS.exts.includes(x)) && SS.remote.length === 4 && SS.remote.every(r => /^GET \/api\/x\/view\/sound\/[a-z]+$/.test(r)) && EXT.remote.includes('GET /api/x/view/sound/pcm'), 'server: wav/mp3 (+ ogg/flac to explain them), 4 read-only routes open to a phone');
  ok(SL.every(r => r.length === 5 && r[0].startsWith('view.sound.') && r.slice(1).every(s => typeof s === 'string' && s.length)), 'strings: view.sound.* in en, ru, uk, zh');
  const keys = new Set(SL.map(r => r[0]).concat(require('../lang').map(r => r[0])));
  const miss = [...SC.script.matchAll(/tx\('([a-z0-9.]+)'/gi)].map(m => m[1]).filter(k => !k.endsWith('.') && !keys.has(k));
  ok(!miss.length && !/`|\$\{|innerHTML|insertAdjacentHTML|document\.write/.test(SC.script), 'client: page-safe, every tx key exists ' + miss.join());
  ok(/window\.SNDMATH/.test(SC.script) && !/\blet |\bconst |=>/.test(SC.script), 'client: SNDMATH (tools/sound/play.src.js) is in the page script, ES5');

  // ---- plan
  const pA = await call('plan', { mod, key: GUN + '/a.wav' });
  const s = pA.plan && pA.plan.settings;
  ok(pA.header.ok && pA.header.codec && pA.header.rate === 22050 && pA.header.channels === 1 && pA.inSound && pA.soundKey === GUN + '/a.wav' && !pA.media, 'plan: header and the sound key');
  ok(s && s.group === 'effects' && s.volume === 1.2 && s.loudness === 'shoot loud' && s.minDistance === 35 && s.maxDistance === 0 && s.priority === 30, 'plan: tag/Volume from weapon/, loudness from gun/ ' + JSON.stringify(s && { g: s.group, v: s.volume, l: s.loudness, a: s.minDistance, b: s.maxDistance, p: s.priority }));
  ok(pA.from.group === 'resource/sound/weapon/folder.set' && pA.from.volume === 'resource/sound/weapon/folder.set' && pA.from.distance === GUN + '/folder.set' && pA.from.priority === GUN + '/folder.set', 'plan: which folder.set set each value');
  ok(pA.loudness && pA.loudness.name === 'shoot loud' && pA.loudness.min === 35, 'plan: the loudness row of sound.set');
  ok(['profile', 'defaults'].includes(pA.options.source) && pA.plan.gain.group >= 0 && pA.plan.gain.group <= 1 && near(pA.plan.gain.group, model.M.groupVolume(pA.options.values.master, pA.options.values.effects), 1e-5), 'plan: group volume from the ' + pA.options.source + ' volumes');
  ok(pA.folder.key === GUN && pA.folder.files.join() === [GUN + '/a.wav', GUN + '/b.wav', GUN + '/c.wav'].join(), 'plan: the folder\'s files');
  const bg = model.bag(pA.folder.files, model.engineRandom(1)), want = []; for (let i = 0; i < 9; i++) want.push(bg.next());
  ok(pA.folder.bag.join() === want.join(), 'plan: bag = the game shuffle-bag pick (model.bag, seed 1), 3 rounds');
  const nm = pA.names.map(x => x.use + ':' + x.name + (x.ok ? '' : '!')).join();
  ok(nm === 'folder:weapon/shot/gun,file:weapon/shot/gun/a,fireSound:gun,fireSound:gun/a', 'plan: names a modder writes ' + nm);
  ok(pA.limits && pA.limits.maxCopies === 3 && pA.limits.antiReverbMs === 50, 'plan: voice limits');
  const pC = await call('plan', { mod, key: GUN + '/c.wav', distance: '70' });
  ok(pC.plan.notes.some(x => x.code === 'STEREO_3D') && near(pC.plan.gain.distance, 0.5, 1e-6), 'plan: a stereo file played positioned is noted; 70 m at min 35 = half');
  const pO = await call('plan', { mod, key: 'resource/sound/misc/bad.wav' });
  ok(pO.kind === 'ogg' && pO.notes.some(x => x.code === 'OGG_RENAMED') && !pO.header.ok, 'plan: an ogg renamed to wav: the verdict');
  const pM = await call('plan', { mod, rel: 'resource/music/track.mp3' });
  ok(pM.media && pM.music && near(pM.music.gain, model.M.groupVolume(pM.music.master, pM.music.music), 1e-9), 'plan: an mp3 is music (device media), its volume the music option');

  // ---- pcm
  const cA = await call('pcm', { mod, key: GUN + '/a.wav' }), dA = wav.decode(Buffer.from(cA.b64, 'base64')), rA = wav.decode(A);
  ok(cA.type === 'wav' && dA.ok && dA.codec === 'pcm' && dA.rate === 22050 && dA.channels === 1 && Buffer.compare(Buffer.from(dA.pcm.buffer, dA.pcm.byteOffset, dA.pcm.byteLength), Buffer.from(rA.pcm.buffer, rA.pcm.byteOffset, rA.pcm.byteLength)) === 0, 'pcm: PCM16 wav, samples = wav.decode');
  const cB = await call('pcm', { mod, key: GUN + '/b.wav' }), dB = wav.decode(Buffer.from(cB.b64, 'base64')), rB = wav.decode(B);
  ok(cB.codec === rB.codec && rB.codec !== 'pcm' && dB.frames === rB.frames && dB.pcm.every((v, i) => v === rB.pcm[i]), 'pcm: IMA ADPCM decoded here as the core does, samples = wav.decode (' + rB.codec + ')');
  const cM = await call('pcm', { mod, rel: 'resource/music/track.mp3' });
  ok(cM.type === 'mp3' && Buffer.from(cM.b64, 'base64').equals(MP3), 'pcm: an mp3 is sent as it is');
  const eO = await rejects(() => call('pcm', { mod, key: 'resource/sound/misc/bad.wav' }), 415, 'pcm: an ogg renamed to wav -> 415');
  ok(eO && /\.ogg file/.test(eO.message) && /Convert/.test(eO.message), 'pcm: the 415 says it in plain words');

  // ---- name
  const n1 = await call('name', { mod, name: 'gun', as: 'fire' });
  ok(!n1.warn && n1.folderKey === GUN && n1.files.length === 3 && n1.pick === 'random' && n1.bag.length === 9 && n1.plan && n1.plan.settings.loudness === 'shoot loud', 'name: fireSound "gun" -> weapon/shot/gun, random of 3');
  const n2 = await call('name', { mod, name: 'gun' });
  ok(n2.warn && n2.hint === 'weapon/shot/gun', 'name: a short form alone is unknown, with the hint');
  const n3 = await call('name', { mod, name: 'weapon/shot/gun/b' });
  ok(n3.pick === 'fixed' && n3.fixed === GUN + '/b.wav' && n3.bag.join() === GUN + '/b.wav', 'name: a file name is fixed');
  const n4 = await call('name', { mod, name: 'rifle', as: 'reload' });
  ok(n4.folderKey === 'resource/sound/weapon/reload/rifle' && n4.pick === 'single', 'name: reloadSound');
  await rejects(() => call('name', { mod, name: '' }), 400, 'name: empty -> 400');

  // ---- burst
  const bu = await call('burst', { mod, key: GUN + '/a.wav', every: '10', shots: '10' });
  const res = bu.shots.map(x => x.result);
  ok(bu.shots.length === 10 && bu.maxCopies === 3 && res.filter(r => r === 'played').length >= 1 && res.some(r => r === 'rejected' || r === 'cut') && bu.shots.every(x => x.key === GUN + '/a.wav'), 'burst: 10 shots 10 ms apart: some play, some dropped ' + res.join());
  const sim = model.limits().simulate(bu.shots.map((x, i) => i * 10), { fileMs: 200, bytesPerFrame: 2, priority: 30 });
  ok(sim.copies.map(c => c.result).join() === res.join(), 'burst: = model limits().simulate');
  const bf = await call('burst', { mod, key: GUN + '/a.wav', every: '300', shots: '6', folder: '1' });
  ok(new Set(bf.shots.map(x => x.key)).size === 3 && bf.shots.every(x => x.result === 'played'), 'burst: folder picks through the bag, 300 ms apart all play');

  // ---- the page script in a fake DOM with a stub AudioContext
  const fakedom = require('../../../test/fakedom'), doc = fakedom.make(), timers = [], calls = [];
  const ACS = [];
  function Param(v) { return { value: v }; }
  function Node(kind, a) { const o = { kind, conn: [], connect(t) { this.conn.push(t); }, disconnect() { this.conn = []; } }; a.nodes.push(o); return o; }
  function StubAC(o) {
    const a = this; ACS.push(a); a.opt = o || {}; a.sampleRate = (o && o.sampleRate) || 44100; a.currentTime = 0; a.nodes = []; a.closed = false; a.destination = { kind: 'dest' };
    a.createBuffer = (ch, len, rate) => { const d = []; for (let i = 0; i < ch; i++) d.push(new Float32Array(len)); return { numberOfChannels: ch, length: len, sampleRate: rate, duration: len / rate, getChannelData: i => d[i] }; };
    a.createBufferSource = () => { const s = Node('src', a); s.playbackRate = Param(1); s.loop = false; s.started = null; s.stopped = null; s.start = (w, f) => { s.started = [w, f]; }; s.stop = w => { s.stopped = w == null ? 'now' : w; }; return s; };
    a.createGain = () => { const g = Node('gain', a); g.gain = Param(1); return g; };
    a.createBiquadFilter = () => { const f = Node('filter', a); f.type = ''; f.frequency = Param(350); f.Q = Param(1); return f; };
    a.createChannelMerger = () => Node('merger', a);
    a.decodeAudioData = (ab, ok2) => { const b = a.createBuffer(2, 4410, 44100); ok2(b); };
    a.resume = () => Promise.resolve(); a.close = () => { a.closed = true; return Promise.resolve(); };
  }
  const routes = EXT.routes;
  const api = u => { calls.push(u); const p = u.split('?')[0], f = routes['GET ' + p]; if (!f) return Promise.reject(new Error('unknown ' + u));
    return Promise.resolve().then(() => f(new URL('http://x' + u), null, ctx)).then(r => JSON.parse(JSON.stringify(r))); };
  const box = { document: doc, console, setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout() {}, AudioContext: StubAC,
    atob: s => Buffer.from(s, 'base64').toString('latin1'), DataView, Float32Array, Int16Array, Uint8Array, ArrayBuffer };
  box.window = box;
  const L = {}; for (const r of require('../lang').concat(SL)) L[r[0]] = r[1];
  const h = (t, a, k) => { const e = doc.createElement(t); for (const x in a || {}) { const v = a[x]; if (v == null || v === false) continue; if (x === 'class') e.className = v; else if (x === 'text') e.textContent = v; else if (x.slice(0, 2) === 'on') e.addEventListener(x.slice(2), v); else { e.setAttribute(x, v === true ? '' : v); if (x === 'disabled') e.disabled = true; } } (k || []).forEach(c => { if (c != null) e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); }); return e; };
  const tx = (k, p) => { let t = L[k] || k; if (p) t = t.replace(/\{(\w+)\}/g, (m, x) => (p[x] == null ? m : String(p[x]))); return t; };
  Object.assign(box, { h, tx, api, S: { mod, sec: {} }, show() {}, toast() {} });
  vm.createContext(box);
  vm.runInContext(require('../client').script(require('../client').css + '\n' + SC.css) + '\n' + SC.script, box, { filename: 'sound-script' });
  const V = box.VIEW, SM = box.SNDMATH;
  const flush = async () => { for (let i = 0; i < 12; i++) { timers.splice(0, 50).forEach(f => f()); await new Promise(r => setImmediate(r)); } };
  ok(V && V.specs.sound && typeof V.soundMini === 'function' && SM && SM.gainAt(70, 35, 0, 1) === 0.5, 'page: the sound kind and SNDMATH are on the page');
  ok(V.kindOf('resource/sound/x/a.wav') === 'sound' && V.kindOf('m.MP3') === 'sound' && V.kindOf('b.ogg') === 'sound', 'page: .wav/.mp3/.ogg open in the sound player (IDE tab, Mod Files page, links)');
  const host = doc.createElement('div'); doc.body.appendChild(host);
  const hd = V.mount(host, { mod, key: GUN + '/a.wav' }, 'a.wav', { kind: 'sound' });
  await flush();
  const q = sel => host.querySelector(sel), qa = sel => host.querySelectorAll(sel);
  const playB = q('.vw-snd-play'), txt = host.textContent;
  ok(playB && playB.textContent === 'Play' && !ACS.length, 'page: drawn, not playing, no audio made before Play');
  ok(/shoot loud/.test(txt) && /weapon\/folder\.set/.test(txt) && /shot\/gun\/folder\.set/.test(txt) && q('.vw-head'), 'page: facts card says where each value comes from');
  ok(qa('.vw-snd-f').length === 3 && /fireSound|gun/.test(q('.vw-snd-names').textContent), 'page: folder files to click and the names');
  ok(/Miles/.test(q('.vw-snd-miles').textContent), 'page: one line on what Miles adds that is not modelled');
  playB.click(); await flush();
  const ac = ACS[ACS.length - 1], srcs = () => ac.nodes.filter(x => x.kind === 'src'), live = () => srcs().filter(x => x.started && !x.stopped);
  const outRate = pA.plan.rate.out;
  ok(ac && ac.opt.sampleRate === outRate && live().length === 1 && playB.textContent === 'Stop', 'play: one voice, the context at the game\'s output rate ' + outRate);
  const gains = () => ac.nodes.filter(x => x.kind === 'gain'), flt = () => ac.nodes.filter(x => x.kind === 'filter').pop();
  let g2 = gains().slice(-2);
  ok(g2.length === 2 && near(g2[0].gain.value, pA.plan.gain.left) && near(g2[1].gain.value, pA.plan.gain.right), 'play: L/R gain = model plan (group x Volume x distance, pan) ' + g2.map(x => x.gain.value) + ' vs ' + pA.plan.gain.left);
  ok(flt() && flt().type === 'lowpass' && near(flt().Q.value, -3.0103, 1e-9) && flt().frequency.value === ac.sampleRate / 2, 'play: the low pass is in the chain, open at the listener');
  // distance + bearing: the live voice follows the model
  const pD = await call('plan', { mod, key: GUN + '/a.wav', distance: '70', bearing: '90' });
  const distI = q('.vw-snd-dist'), bearI = q('.vw-snd-bear');
  ok(qa('.vw-snd-mk').length === 1 && /35/.test(q('.vw-snd-marks').textContent), 'distance: the min mark (no max: shoot loud has max 0)');
  distI.value = '70'; distI.fire('input'); bearI.value = '90'; bearI.fire('input');
  g2 = gains().slice(-2);
  ok(near(g2[0].gain.value, pD.plan.gain.left) && near(g2[1].gain.value, pD.plan.gain.right) && pD.plan.lowPass.hz && near(flt().frequency.value, pD.plan.lowPass.hz, 0.1), 'distance 70 m, bearing 90: gains and low pass = model plan ' + g2.map(x => x.gain.value) + ' ' + flt().frequency.value + ' vs ' + [pD.plan.gain.left, pD.plan.gain.right, pD.plan.lowPass.hz]);
  ok(/Gain/.test(q('.vw-snd-rd').textContent) || q('.vw-snd-rd').textContent.length > 10, 'readout shows the numbers');
  playB.click(); await flush();
  ok(!live().length && playB.textContent === 'Play', 'stop: the voice stops');
  q('.vw-host').fire('keydown', { key: ' ' }); await flush();
  ok(live().length === 1 && playB.textContent === 'Stop', 'Space plays');
  hd.hide(); await flush();
  ok(!live().length && playB.textContent === 'Play', 'hide: stops the sound');
  hd.show(); await flush();
  ok(!live().length && playB.textContent === 'Play', 'show: does not play by itself');
  // raw mode: the file straight to the output
  const modeS = q('.vw-snd-mode'); modeS.value = 'raw'; modeS.fire('change');
  const nf = ac.nodes.filter(x => x.kind === 'filter').length; playB.click(); await flush();
  const ac2 = ACS[ACS.length - 1], rs = ac2.nodes.filter(x => x.kind === 'src').pop();
  ok(rs && rs.started && !rs.stopped && rs.conn[0] === ac2.destination && ac2.nodes.filter(x => x.kind === 'filter').length === (ac2 === ac ? nf : 0), 'raw: the file goes straight to the output');
  playB.click(); modeS.value = 'game'; modeS.fire('change'); await flush();
  // folder: next as the game picks
  const nextB = [...qa('button')].find(b => b.textContent === tx('view.sound.next')), pickL = q('.vw-snd-pick'), seen = [];
  for (let i = 0; i < 4; i++) { nextB.click(); await flush(); seen.push(pickL.textContent); }
  ok(seen.every((t, i) => t.indexOf(pA.folder.bag[i].split('/').pop()) >= 0) && seen[0].indexOf('1') >= 0, 'next: plays the bag order ' + seen.join(' | '));
  const pcmAsked = calls.filter(u => /\/sound\/pcm\?/.test(u)).map(u => decodeURIComponent(u).split('key=')[1]);
  ok(pcmAsked.length >= 3 && new Set(pcmAsked).size === pcmAsked.length, 'next: each file loaded once (cache)');
  hd.hide();
  // burst
  q('.vw-snd-every').value = '10'; q('.vw-snd-shots').value = '10';
  const burstB = [...qa('button')].find(b => b.textContent === tx('view.sound.burstRun'));
  burstB.click(); await flush();
  const shots = qa('.vw-snd-shot'), acB = ACS[ACS.length - 1];
  const kept = bu.shots.filter(x => x.result !== 'rejected' && x.startedAt != null).length, cut = bu.shots.filter(x => x.result === 'cut').length;
  ok(shots.length === 10 && shots.map(x => x.getAttribute('data-res')).join() === res.join(), 'burst: verdict per shot = the engine rules');
  const bsrc = acB.nodes.filter(x => x.kind === 'src').slice(-kept);
  ok(bsrc.length === kept && bsrc.every(x => x.started) && bsrc.filter(x => typeof x.stopped === 'number').length === cut && /dropped|cut|10/.test(q('.vw-snd-bsum').textContent), 'burst: plays only the shots that survive, cuts the cut ones (' + kept + ' voices, ' + cut + ' cut)');
  hd.hide();
  ok(!acB.nodes.filter(x => x.kind === 'src').some(x => x.started && !x.stopped), 'burst: hide stops every voice');
  hd.close();
  ok(acB.closed && !host.children.length, 'close: the audio context closed, the host emptied');
  // compact player (Art page rows, dialog box)
  const mh = doc.createElement('div'); doc.body.appendChild(mh);
  const mini = V.soundMini(mh, { mod, key: GUN + '/b.wav' }, 'b.wav'); await flush();
  ok(mh.querySelector('.vw-snd-mini') && !mh.querySelector('.vw-snd-burst') && mh.querySelector('.vw-snd-play'), 'compact: one row (Play, Next, wave, Open)');
  mh.querySelector('.vw-snd-play').click(); await flush();
  const acM = ACS[ACS.length - 1];
  ok(acM.nodes.some(x => x.kind === 'src' && x.started && !x.stopped), 'compact: plays (IMA file decoded on the server)');
  mini.hide(); ok(!acM.nodes.some(x => x.kind === 'src' && x.started && !x.stopped), 'compact: hide stops'); mini.close();
  const n0 = ACS.length, mini2 = V.soundMini(mh, { mod, key: GUN + '/a.wav' }, 'a.wav', { play: true }); await flush();
  const acM2 = ACS[ACS.length - 1];
  ok(ACS.length >= n0 && acM2.nodes.some(x => x.kind === 'src' && x.started && !x.stopped), 'compact: opened from a Listen button it plays once the plan is in');
  mini2.close();
  // a renamed ogg says so and does not ask for the samples
  const oh = doc.createElement('div'); doc.body.appendChild(oh);
  const oo = V.mount(oh, { mod, key: 'resource/sound/misc/bad.wav' }, 'bad.wav', { kind: 'sound' }); await flush();
  const before = calls.length; oh.querySelector('.vw-snd-play').click(); await flush();
  ok(/ogg/i.test(oh.querySelector('.vw-snd-msg').textContent) && /OGG_RENAMED/.test(oh.textContent) && !calls.slice(before).some(u => /pcm/.test(u)), 'ogg renamed: says it in plain words, nothing played');
  oo.close();
  // an mp3: the browser decodes it, music volume
  const ph = doc.createElement('div'); doc.body.appendChild(ph);
  const po = V.mount(ph, { mod, rel: 'resource/music/track.mp3' }, 'track.mp3', { kind: 'sound' }); await flush();
  ph.querySelector('.vw-snd-play').click(); await flush();
  const acP = ACS[ACS.length - 1], gP = acP.nodes.filter(x => x.kind === 'gain').pop();
  ok(acP.nodes.some(x => x.kind === 'src' && x.started && !x.stopped) && gP && near(gP.gain.value, pM.music.gain) && !acP.nodes.some(x => x.kind === 'filter'), 'mp3: decoded by the browser, played at the music volume, not positioned');
  po.close();

  // ---- the Editor page: leaving it hides the active viewer, coming back shows it (ide/ui/core.js)
  {
    const G = path.join(__dirname, '..', '..', '..'), d2 = fakedom.make(), store = new Map(), tm = [];
    const resp = o => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(JSON.stringify(o))), body: null });
    const bx = { document: d2, console, TextDecoder, setTimeout: f => { tm.push(f); return tm.length; }, clearTimeout: () => {}, setInterval: () => 0, confirm: () => true,
      atob: s => Buffer.from(s, 'base64').toString('latin1'),
      localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
      fetch: u => { const p = String(u).split('?')[0];
        if (p === '/api/health') return resp({ ok: true, allowLaunch: false, version: 'test' });
        if (p === '/api/commands') return resp({ commands: require(path.join(G, 'contract')).describe() });
        if (p === '/api/settings') return resp({ settings: {}, empty: true, file: '' });
        if (p === '/api/game') return resp({ dir: '', tried: [], ok: false, codes: ['none'] });
        if (p === '/api/x/view/info') return resp({ name: 's.zzs', rel: 'resource/s.zzs', size: 10, where: 'mine', type: 'data', magic: '00', ext: 'zzs', kind: 'zzs', text: false });
        return new Promise(() => {}); } };
    bx.window = bx; vm.createContext(bx);
    vm.runInContext(/<script>([\s\S]*)<\/script>/.exec(require(path.join(G, 'page.js')))[1], bx);
    { const t0 = Date.now(); while (!bx.__as2gui && Date.now() - t0 < 60000) await new Promise(r => setImmediate(r)); if (!bx.__as2gui) process.stderr.write('WAIT sound kind test: the page not built after 60 s\n'); }   // by time, not by count
    const fl = async () => { for (let i = 0; i < 10; i++) { tm.splice(0).forEach(f => { try { f(); } catch { /* page timers */ } }); await new Promise(r => setImmediate(r)); } };
    const St = bx.__as2gui, IDEo = bx.IDE, M = 'C:/g/mods/mine', ev = { hide: 0, show: 0 };
    bx.VIEW.reg('zzs', { where: 'tab', exts: ['zzs'], open: () => ({ hide() { ev.hide++; }, show() { ev.show++; }, close() {} }) });
    St.mod = M; bx.as2Link('page:ide'); await fl();
    const dd = await IDEo.open({ mod: M, rel: 'resource/s.zzs' }); await fl();
    ok(dd && dd.view === 'zzs' && ev.hide === 0 && typeof IDEo.pageVis === 'function', 'editor: a viewer tab is open');
    bx.as2Link('page:mods'); await fl();
    ok(ev.hide === 1 && ev.show === 0, 'editor: leaving the Editor page hides the active viewer (a sound stops) ' + JSON.stringify(ev));
    bx.as2Link('page:ide'); await fl();
    ok(ev.hide === 1 && ev.show === 1, 'editor: coming back shows it (no auto-play) ' + JSON.stringify(ev));
    bx.as2Link('page:ide'); await fl();
    ok(ev.hide === 1 && ev.show === 1, 'editor: staying on the page changes nothing');
  }

  console.log(bad ? bad + ' of ' + n + ' failed' : 'view kind sound ' + n + ' PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crash ' + e.stack); process.exit(1); });
