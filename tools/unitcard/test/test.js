// unitcard test: a fixture game (AS2 layout, loose files) and a scratch mod made here, no vanilla art. Seeded defects for check.
// Author: unitcard tool (ARSENAL)
// Author: Imperator_Aug (ARSENAL, ia-0bc5091d)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const T = path.join(__dirname, '..');
const I = require(T + '/lib/img'), K = require(T + '/lib/kinds'), U = require(T + '/lib/unit'), S = require(T + '/lib/styles'), M = require(T + '/lib/make'), C = require(T + '/lib/check'), CAM = require(T + '/lib/camera');
const base = process.env.UC_TMP || os.tmpdir();
const root = path.join(base, 'unitcard-test-' + process.pid);
let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL: ' + m); } };
const put = (rel, buf) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); return p; };

// ---------- fixture game: cards 100x50 (not the table size: the game's own size must win), 4 frames ----------
const G = path.join(root, 'game'), GR = 'game/resource/interface/scene/';
const PL = [190, 180, 150];
function card(w, h, shape, silhouette, seed) {
  const p = I.blank(w, h, [PL[0], PL[1], PL[2], 255]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (Math.min(x, y, w - 1 - x, h - 1 - y) === 0) { p.d[i] = p.d[i + 1] = p.d[i + 2] = 224; } if (x < 4 && y < 4 && x + y < 2) p.d[i + 3] = 0; }
  if (shape) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = 30 + (seed * 7) % 40, cy = 20 + (seed * 3) % 10, r = 8 + seed % 5;
    if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) { const i = (y * w + x) * 4; if (silhouette) { p.d[i] = 90; p.d[i + 1] = 85; p.d[i + 2] = 75; } else { p.d[i] = 60 + seed * 9 % 120; p.d[i + 1] = 120; p.d[i + 2] = 40 + seed * 13 % 100; } }
  }
  return p;
}
const frameOf = (p, f) => f === 0 ? p : f === 1 ? I.lut(p, [0, 1, 2].map(() => Array.from({ length: 256 }, (_, v) => Math.min(255, Math.round(v * 1.2 + 5))))) : f === 2 ? I.lut(p, [Array.from({ length: 256 }, (_, v) => v), Array.from({ length: 256 }, (_, v) => Math.round(v * 0.7)), Array.from({ length: 256 }, (_, v) => Math.round(v * 0.7))]) : I.grey(p);
function cardSet(folder, stem, w, h, frames, sil, seed) { for (let f = 0; f < frames; f++) put(GR + folder + '/' + stem + '_0' + f + '.tga', I.tga(frameOf(card(w, h, true, sil, seed), f))); }
const tanks = ['t1', 't2', 't3', 't4', 't5', 't6'];
tanks.forEach((t, i) => { cardSet('unit_icon', t, 100, 50, 4, false, i + 1); cardSet('unit_icon_small', t, 112, 48, 4, false, i + 1); put('game/resource/entity/-vehicle/tank_medium/' + t + '/' + t + '.def', '{from "pattern tank"}\r\n'); });
['riflemans(rus)', 'smgs(rus)', 'mg(rus)', 'sniper(rus)', 'medics(rus)'].forEach((s, i) => cardSet('unit_icon', s, 100, 50, 4, true, i + 2));
['rus_soldier1', 'rus_soldier2', 'rus_medic', 'rus_officer'].forEach((s, i) => { cardSet('squad', s, 48, 48, 3, true, i); put(GR + 'portrait/' + s + '.tga', I.tga(card(97, 135, true, false, i + 3))); });
// a vanilla .ebm alias for t6 (the mod must write its own .ebm)
put(GR + 'unit_icon/t6.ebm', '{bitmap\r\n    {frame "t6_00.tga"}\r\n    {frame "t6_01.tga"}\r\n}\r\n');
put('game/resource/set/multiplayer/units/vehicles_rus.set', tanks.map(t => '{"' + t + '" ("vs" c(60) t(all) s(rus) n(2)) {cost 100}}').join('\r\n') + '\r\n');
put('game/resource/set/breed/mp/rus/rifle.set', '{breed\r\n\t{skin "rus_t2"}\r\n\t{portrait "rus_soldier1"}\r\n\t{nationality rus}\r\n}\r\n');
put('game/resource/set/breed/mp/rus/smg.set', '{breed\r\n\t{skin "rus_t2"}\r\n\t{portrait "rus_soldier1"}\r\n}\r\n');
put('game/resource/set/breed/mp/rus/lone.set', '{breed\r\n\t{portrait "rus_officer"}\r\n}\r\n');
const MOD = path.join(root, 'mod'); fs.mkdirSync(MOD, { recursive: true });

// ---------- img ----------
const p0 = I.blank(9, 7, [10, 200, 30, 128]);
ok(I.same(p0, I.decodePng(I.png(p0))), 'png round trip');
ok(I.same(p0, I.decode(I.tga(p0), 'x.tga')), 'tga round trip');
const tg = I.tga(p0); ok(tg[2] === 2 && tg[16] === 32 && tg[17] === 8, 'tga header 32-bit type 2 descriptor 8');
const half = I.blank(20, 10, [0, 0, 255, 0]); I.over(half, I.blank(10, 10, [255, 0, 0, 255]), 0, 0, 1);
const rs = I.resize(half, 10, 5); ok(rs.d[(2 * 10 + 4) * 4 + 2] < 20, 'resize premultiplied: no blue bleeds into the red edge');
const keyed = I.keyEdge(card(60, 30, true, false, 1)); ok(keyed.d[3] === 0 && I.hasAlpha(keyed), 'key removal by corner colour');
const ft = I.fit(I.blank(200, 100, [1, 2, 3, 255]), 50, 50, { mode: 'contain' }); const bb = I.bbox(ft); ok(bb && bb[2] === 50 && bb[3] === 25, 'fit contain keeps the aspect ' + bb);
const fc = I.fit(I.blank(200, 100, [1, 2, 3, 255]), 50, 50, { mode: 'cover' }); ok(I.bbox(fc)[3] === 50, 'fit cover fills');
const fb = I.fit(card(100, 50, true, false, 1), 40, 40, { box: [0, 0, 10, 10] }); ok(fb.w === 40, 'fit crop box');
const ol = I.outline(I.fit(I.blank(4, 4, [9, 9, 9, 255]), 10, 10, { scale: 0.4 }), [255, 255, 255], 1); ok(I.bbox(ol)[2] > 4, 'outline grows the subject');
let threw = false; try { I.decode(Buffer.from('hello'), 'x.xyz'); } catch (e) { threw = true; } ok(threw, 'unknown picture kind refused');

// ---------- camera ----------
const Mi = CAM.turn(49.8, 20.2); ok(Math.abs(Mi[0] - 1) < 0.01 && Math.abs(Mi[4] - 1) < 0.01, 'turn at the viewer angle is identity');
const sc = CAM.turnScene({ bounds: { min: [0, 0, 0], max: [10, 4, 2] }, meshes: [{ world: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] }] }, CAM.turn(-38, 22));
ok(sc.meshes[0].world.length === 12 && sc.bounds.min.every(Number.isFinite), 'turnScene turns worlds and bounds');
ok(CAM.preset('as64', 'card', 'infantry').scene === 'weapon' && CAM.preset('as64', 'card', 'vehicle').az === -46 && CAM.preset('goh', 'card', 'vehicle').az < 0, 'presets per game and group');

// ---------- kinds ----------
ok(K.list('as64').length === 5 && K.list('mowas2').length === 5 && K.list('goh').length === 5, 'kinds per game');
ok(K.NOT.goh.some(x => x.id === 'scheme'), 'GoH says why there is no scheme');
ok(K.filesOf(K.get('as64', 'card'), 't1').length === 4 && K.filesOf(K.get('as64', 'portrait'), 'x')[0].key.endsWith('portrait/x.tga'), 'files per kind');

// ---------- styles from the fixture game ----------
const V = U.open({ game: G, gid: 'as64', mod: MOD });
const u = U.resolve(V, 't1'); ok(u.kind === 'vehicle' && u.army === 'rus' && u.cls === 'tank' && u.group === 'vehicle', 'resolve vehicle ' + JSON.stringify(u));
const st = S.extract(V, K.get('as64', 'card'), 'vehicle', 'rus');
ok(st.w === 100 && st.h === 50, 'the game\'s own size wins: ' + st.w + 'x' + st.h);
ok(st.frames === 4 && st.refs.length === 5,'frames and references ' + st.frames + ' ' + st.refs.length);
const mid = st.plate[0].d.slice((25 * 100 + 90) * 4, (25 * 100 + 90) * 4 + 3);
ok(Math.abs(mid[0] - PL[0]) < 8 && Math.abs(mid[2] - PL[2]) < 8, 'plate read from the cards ' + Array.from(mid));
ok(st.look === 'colour', 'vehicles: colour look');
ok(st.fx[1].lut[0][100] > 115 && st.fx[2].lut[1][100] < 85, 'frame tables: hover brighter, pressed less green');
const si = S.extract(V, K.get('as64', 'card'), 'infantry', 'rus');
ok(si.look === 'silhouette' && si.tone && Math.abs(si.tone[0] - 90) < 12, 'infantry: silhouette ' + si.look + ' ' + si.tone);
const fbk = S.fallback(K.get('goh', 'card'), 'vehicle'); ok(fbk.w === 144 && fbk.plate.length === 4 && fbk.from === 'built-in', 'built-in style');

// ---------- plan, make, write ----------
const subject = I.blank(80, 40, [255, 255, 255, 255]); for (let y = 10; y < 30; y++) for (let x = 10; x < 70; x++) { const i = (y * 80 + x) * 4; subject.d[i] = 50; subject.d[i + 1] = 110; subject.d[i + 2] = 40; }
const pv = M.plan(V, u, {}); ok(pv.kinds.map(k => k.kind).join() === 'card,small,scheme', 'vehicle kinds ' + pv.kinds.map(k => k.kind));
const u6 = U.resolve(V, 't6'), p6 = M.plan(V, u6, { kinds: ['card'] }); ok(p6.kinds[0].ebm && p6.kinds[0].files.some(f => f.ebm), 'game .ebm -> the mod writes its own .ebm');
const us = U.resolve(V, 'riflemans(rus)', { breed: 'mp/rus/rifle' }); const ps = M.plan(V, us, {});
ok(us.kind === 'squad' && ps.kinds.map(k => k.kind).join() === 'card,squad,portrait', 'squad kinds ' + ps.kinds.map(k => k.kind));
ok(ps.data.length === 1 && /uc_mp_rus_rifle/.test(ps.data[0].line), 'shared portrait -> a name of its own + breed line');
const ul = U.resolve(V, 'mp/rus/lone'), pl = M.plan(V, ul, {}); ok(pl.data.length === 0 && pl.kinds.every(k => k.stem === 'rus_officer'), 'portrait of one breed: kept');
const pk = M.plan(V, us, { keepPortrait: true }); ok(!pk.data.length, '--keep-portrait');
const r = M.make(V, u, { default: subject }, { plate: 'game', styleBy: { card: { match: 0 } } });
ok(r.out.length === 8 && r.plan.skip.some(s => s.kind === 'scheme') && r.out.filter(f => /unit_icon\//.test(f.key)).every(f => f.size === '100x50'), 'make: card frames at the game size');
ok(r.previews.card.length === 4 && /^data:image\/png;base64,/.test(r.previews.card[0]), 'previews');
const c0 = I.decode(r.out[0].buf, 'a.tga'), sj = r.styles.card.subject, sp = ((sj.baseline - 2) * 100 + sj.cx) * 4; ok(c0.d[sp + 1] > c0.d[sp] + 20, 'the subject is on the card at the class place (green) ' + Array.from(c0.d.slice(sp, sp + 3)));
const c3 = I.decode(r.out[3].buf, 'a.tga'), px3 = c3.d.slice((25 * 100 + 50) * 4, (25 * 100 + 50) * 4 + 3); ok(Math.max(...px3) - Math.min(...px3) < 12, 'locked frame grey ' + Array.from(px3));
const wr = M.write(r, MOD); ok(wr.length === 8 && fs.existsSync(path.join(MOD, 'resource/interface/scene/unit_icon/t1_03.tga')), 'write into the mod');
const rq = M.make(V, us, { default: subject }, { plate: 'game' }); M.write(rq, MOD);
const bt = fs.readFileSync(path.join(MOD, 'resource/set/breed/mp/rus/rifle.set'), 'latin1');
ok(/\{portrait "uc_mp_rus_rifle"\}/.test(bt) && !/[^\r]\n/.test(bt), 'breed line written, CRLF kept');
ok(fs.existsSync(path.join(MOD, 'resource/interface/scene/squad/uc_mp_rus_rifle_02.tga')) && fs.existsSync(path.join(MOD, 'resource/interface/scene/portrait/uc_mp_rus_rifle.tga')), 'squad and portrait under the new name');
const r6 = M.make(V, u6, { default: subject }, { kinds: ['card'], plate: 'game' }); M.write(r6, MOD);
const eb = fs.readFileSync(path.join(MOD, 'resource/interface/scene/unit_icon/t6.ebm'), 'latin1'); ok(/\{frame "t6_03\.tga"\}\r\n/.test(eb), 'ebm written, 4 frames, CRLF');
threw = false; try { M.write({ out: [{ key: '../escape.txt', buf: Buffer.from('x') }] }, MOD); } catch (e) { threw = true; } ok(threw && !fs.existsSync(path.join(root, 'escape.txt')), 'write refuses a path outside the mod');
ok(!fs.readdirSync(G).includes('mod') && !fs.existsSync(path.join(G, 'resource/interface/scene/portrait/uc_mp_rus_rifle.tga')), 'the game folder is not touched');

// ---------- layers, picks, cutouts ----------
const Ly = require(T + '/lib/layers'), Cu = require(T + '/lib/cutouts');
const lm = M.modelOf(V, K.get('as64', 'card'), 'vehicle', 'rus', { builtIn: true });
ok(!lm.template && lm.fill && lm.fill.length === 4 && lm.frame && lm.frame.some(Boolean), 'layers: plate per frame state and a frame mask');
const ls = Ly.summary(lm); ok(ls.refs >= 3 && ls.subject && ls.subject.height > 0, 'layers: subject numbers measured ' + JSON.stringify(ls.subject && { h: ls.subject.height, w: ls.subject.width }));
ok(lm.cutter === 'builtin', 'built-in cutter when asked: ' + lm.cutter);
const rOff = M.make(V, u, { default: subject }, { kinds: ['card'], plate: 'game', builtIn: true, layersBy: { card: { subject: false } } });
const rOn = M.make(V, u, { default: subject }, { kinds: ['card'], plate: 'game', builtIn: true });
ok(rOff.previews.card[0] !== rOn.previews.card[0] && rOff.out[0].buf.equals(rOn.out[0].buf), 'layer off: the preview changes, the written file keeps every layer');
const rNum = M.make(V, u, { default: subject }, { kinds: ['card'], plate: 'game', builtIn: true, styleBy: { card: { width: 40 } } });
ok(!rNum.out[0].buf.equals(rOn.out[0].buf), 'an edited class number changes the card');
const rNone = M.make(V, u, { default: subject }, { kinds: ['card'], plate: 'game', builtIn: true, badgeBy: { card: 'none' } });
ok(rNone.out.length === 4 && /none|-/.test(String(rNone.styles.card.badgeUsed || '-')), 'badge pick none: ' + rNone.styles.card.badgeUsed);
const nog = cp.spawnSync(process.execPath, [path.join(T, 'unitcard.js'), 'cutouts', '--game', 'as64', '--dir', G, '--kind', 'card', '--group', 'vehicle', '--army', 'rus', '--root', path.join(root, 'cut'), '--json'],
  { encoding: 'utf8', env: Object.assign({}, process.env, { ARSENAL_GIMP: 'none', ARSENAL_GIMP_NOREG: '1', PATH: '' }) });
let nj = null; try { nj = JSON.parse(nog.stdout); } catch (e) { nj = null; }
ok(nj && nj.gimp && !nj.gimp.found && !fs.existsSync(path.join(root, 'cut', 'as64', 'card')), 'cutouts without GIMP: built-in cutter, nothing written ' + (nog.stdout || nog.stderr).slice(0, 200));
ok(Cu.load(path.join(root, 'cut', 'nothing')) === null, 'no cutout set: load says null');

// ---------- check (seeded defects) ----------
put('mod/resource/interface/scene/unit_icon/bad_00.tga', I.tga(I.blank(64, 32, [1, 1, 1, 255])));   // wrong size, frames 1..3 missing
put('mod/resource/interface/scene/unit_icon/t5_00.tga', I.tga(card(100, 50, true, false, 1)));        // fine size? table 104x52 -> size finding
put('game/resource/interface/scene/unit_icon/t5.ebm', '{bitmap\r\n    {frame "t5_00.tga"}\r\n}\r\n');
put('mod/resource/set/breed/mp/rus/ghost.set', '{breed\r\n\t{portrait "nobody_here"}\r\n}\r\n');
const V2 = U.open({ game: G, gid: 'as64', mod: MOD });
const ck = C.check(V2, MOD, { sizes: { card: [100, 50] } }), codes = ck.findings.map(f => f.code + ' ' + f.key);
ok(codes.some(c => /UC-SIZE .*bad_00/.test(c)), 'check: UC-SIZE');
ok(codes.some(c => /UC-FRAMES .*bad/.test(c)), 'check: UC-FRAMES');
ok(codes.some(c => /UC-EBM .*t5\.ebm/.test(c)) && !codes.some(c => /UC-EBM .*t6/.test(c)), 'check: UC-EBM (t5 yes, t6 has its own)');
ok(codes.some(c => /UC-PORTRAIT .*ghost/.test(c)) && !codes.some(c => /UC-PORTRAIT .*rifle/.test(c)), 'check: UC-PORTRAIT');
ok(!codes.some(c => /UC-SIZE .*t1_0/.test(c)), 'check: written cards pass the size');
V.close(); V2.close();

// ---------- look: clean plate, cutout, compose by the numbers, acceptance sheet ----------
const Lk = require(T + '/lib/look'), Sh = require(T + '/lib/sheet');
const V3 = U.open({ game: G, gid: 'as64' }), kc = K.get('as64', 'card');
const LC = Lk.classOf(V3, kc, 'vehicle', '', {});
ok(!LC.none && LC.plate.length === 4 && LC.w === 100 && LC.h === 50, 'look: class read ' + (LC.none || LC.w + 'x' + LC.h));
{ let far = 0; for (let y = 6; y < 44; y++) for (let x = 6; x < 94; x++) { const o = (y * 100 + x) * 4; if (Math.abs(LC.plate[0].d[o] - PL[0]) + Math.abs(LC.plate[0].d[o + 1] - PL[1]) + Math.abs(LC.plate[0].d[o + 2] - PL[2]) > 12) far++; }
  ok(far === 0, 'look: plate is the parchment everywhere inside the frame, no subject left in it (' + far + ' px off)'); }
const lcut = Lk.cutout(LC, 't1', V3, kc);
ok(lcut && lcut.box && Math.abs(lcut.box[2] - 18) <= 3 && Math.abs(lcut.box[3] - 18) <= 3, 'look: cutout is the round subject, no plate ' + JSON.stringify(lcut && lcut.box));
{ let plate = 0; for (let i = 0; i < 100 * 50; i++) if (lcut.pic.d[i * 4 + 3] > 128 && Math.abs(lcut.pic.d[i * 4] - PL[0]) < 10 && Math.abs(lcut.pic.d[i * 4 + 2] - PL[2]) < 10) plate++; ok(plate === 0, 'look: no parchment in the cutout (' + plate + ')'); }
const lr = Lk.compose(LC, subject, {});
ok(lr.frames && lr.frames.length === 4, 'look: compose gives every frame');
{ const d = lr.frames[0].d, m = LC.m, o = ((Math.round(m.bottom) - 3) * 100 + Math.round(m.cx)) * 4; ok(d[o + 1] > d[o] + 20, 'look: subject at the measured place (green) ' + Array.from(d.slice(o, o + 3))); }
ok(/too small|too little/.test(Lk.compose(LC, I.blank(6, 4, [50, 110, 40, 255]), {}).why || ''), 'look: a tiny picture is refused with a reason');
ok(/empty/.test(Lk.compose(LC, I.blank(40, 40, [0, 0, 0, 0]), {}).why || ''), 'look: an empty picture is refused with a reason');
const rk = M.make(V3, U.resolve(V3, 't3'), {}, { kinds: ['card'], plate: 'game' });
ok(!rk.out.length && rk.plan.skip.some(s => s.kind === 'card' && /No picture given/.test(s.why)), 'make: no picture -> skipped with a reason');
const rl = M.make(V3, U.resolve(V3, 't3'), { default: subject }, { kinds: ['card'], plate: 'game' });
ok(rl.out.length === 4 && rl.styles.card.cutter === 'look' && rl.styles.card.look.cards >= 3, 'make: the clean-plate path is used ' + (rl.styles.card && rl.styles.card.cutter));
const shr = Sh.sheet(V3, kc, 'vehicle', '', { out: path.join(root, 'sheets'), units: 4, plate: 'game' });
ok(shr.file && fs.existsSync(shr.file) && shr.rows.length === 4 && shr.rows.every(r => r.err != null && r.err < 20), 'sheet: one PNG, every unit made, close to the game card ' + JSON.stringify(shr.rows.map(r => r.err)));
// ---------- plain style (default): every layer drawn by code from the class numbers, no pixel of a game card ----------
{ const Pl = require(T + '/lib/plain'), PC = path.join(root, 'plain');
  const rp = M.make(V3, U.resolve(V3, 't3'), { default: subject }, { kinds: ['card'], plainCache: PC });
  ok(rp.out.length === 4 && rp.styles.card.cutter === 'plain' && rp.styles.card.measured && rp.plan.plate === 'plain', 'plain is the default and measured from the game cards ' + (rp.styles.card && rp.styles.card.cutter));
  ok(fs.readdirSync(PC).some(n => /.json$/.test(n)), 'plain: the class numbers are cached as JSON');
  // no pixel of the fixture's art: the cached numbers hold no picture (no array near the card's pixel count), and the plate drawn
  // from those numbers alone (no game open) is the plate used
  const P = Pl.plainOf(V3, kc, 'vehicle', '', { cache: PC }), jf = fs.readdirSync(PC).find(n => /^as64_card_vehicle__game/.test(n)), J = JSON.parse(fs.readFileSync(path.join(PC, jf), 'utf8'));
  let big = 0; (function walk(v, inTf) { if (Array.isArray(v)) { if (v.length > 256) big++; v.forEach(x => walk(x, inTf)); } else if (v && typeof v === 'object') for (const k in v) walk(v[k], inTf || k === 'tf'); })(J);
  const Pd = Pl.draw(Object.assign(J, { gid: 'as64', fam: 'as2', group: 'vehicle' }), kc);
  ok(!big && Pd.plate.every((p, f) => I.same(p, P.plate[f])), 'plain: drawn from numbers only (no picture in the cache, the same plate without the game)');
  ok(P.plate.length === 4 && P.tf.length === 4 && !P.cards.length && P.plate[2].d.some((v, j) => v !== P.plate[0].d[j]), 'plain: a plate per frame state, frame tables, the pressed plate differs');
  // no game art at all: the built-in numbers, every kind of both games
  for (const gid of ['as64', 'goh']) for (const k of K.list(gid)) { const gr = k.id === 'squad' || k.id === 'portrait' ? 'infantry' : 'vehicle', Q = Pl.plainOf(null, k, gr, 'usa', { gid, cache: false }), r = Lk.compose(Q, subject, {});
    ok(!Q.plain.measured && r.frames && r.frames.length === Math.max(1, k.frames || 1) && r.frames[0].w === k.w, 'plain without game art: ' + gid + ' ' + k.id + ' ' + (r.why || '')); }
  const Qs = Pl.plainOf(null, K.get('goh', 'squad'), 'infantry', 'usa', { gid: 'goh', cache: false }); ok(Qs.env[0] === 0 && Qs.env[24 * 48 + 24] === 255 && Qs.ring.some(Boolean), 'plain squad: a shield with an outline');
  const Qi = Pl.plainOf(null, kc, 'infantry', 'usa', { gid: 'as64', cache: false }); ok(Qi.zones.length === 1 && Qi.roleUsed === 'silhouette' && Qi.plain.strip.colours.length === 3, 'plain AS2 soldier card: a flag strip in the army colours, silhouette');
  // squad: an emblem on the shield, never the default soldier picture; none = a generic mark
  const us3 = U.resolve(V3, 'riflemans(rus)', { breed: 'mp/rus/rifle' }), rs0 = M.make(V3, us3, { default: subject }, { kinds: ['squad'], plainCache: PC }), rs1 = M.make(V3, us3, { default: subject, squad: subject }, { kinds: ['squad'], plainCache: PC });
  ok(rs0.styles.squad && rs0.styles.squad.generic && rs1.styles.squad && !rs1.styles.squad.generic && /emblem/i.test(rs0.styles.squad.look.wants), 'plain squad: generic mark with no emblem, the emblem when given');
  const ch = Pl.chevrons(60, 50); ok(I.bbox(ch, 20) && I.bbox(ch, 20)[3] > 20, 'generic chevrons drawn');
  // GoH infantry card: up to three weapons stacked
  const st = Pl.stack([subject, subject, subject]); ok(st.h > subject.h * 2 && st.w === subject.w, 'stack: three pictures top to bottom ' + st.w + 'x' + st.h);
  const rg = M.make(V3, U.resolve(V3, 't3'), { card: [subject, subject] }, { kinds: ['card'], plainCache: PC }); ok(rg.out.length === 4, 'make: srcs[kind] as an array');
  const rb = M.make(V3, U.resolve(V3, 't3'), { default: subject }, { kinds: ['card'], plainMeasure: false }); ok(rb.styles.card && !rb.styles.card.measured, 'plain: built-in numbers when not measured');
}
V3.close();
// layouts: cards with a full-height divider at one column are a strip layout, the rest 'full'
{ const mkc = (strip, s) => { const p = card(100, 50, true, false, s); if (strip) for (let y = 0; y < 50; y++) { const i = (y * 100 + 30) * 4; p.d[i] = p.d[i + 1] = p.d[i + 2] = 20; } return { stem: 'c' + s, f: [p] }; };
  const cs = [1, 2, 3, 4].map(s => mkc(true, s)).concat([5, 6, 7].map(s => mkc(false, s))), ly = Lk.layoutsOf(cs, 0, 100, 50);
  ok(ly.length === 2 && /^strip(29|30|31)$/.test(ly[0].id) && ly[0].n === 4 && ly[1].id === 'full' && cs[5].layout === 'full', 'layouts: strip cards and full cards split ' + JSON.stringify(ly)); }

// ---------- CLI ----------
const cli = (...a) => cp.spawnSync(process.execPath, [path.join(T, 'unitcard.js'), ...a], { encoding: 'utf8' });
const kj = cli('kinds', '--json'); ok(kj.status === 0 && JSON.parse(kj.stdout).length === 12, 'cli kinds');
fs.writeFileSync(path.join(root, 'subj.png'), I.png(subject));
const MOD2 = path.join(root, 'mod2'); fs.mkdirSync(MOD2);
const mk = cli('make', '--game', G, '--gid', 'as64', '--mod', MOD2, '--unit', 't2', '--from', path.join(root, 'subj.png'), '--plate', 'game', '--json');
ok(mk.status === 0 && JSON.parse(mk.stdout).files.length === 8 && fs.readdirSync(MOD2).length === 0, 'cli make without --write writes nothing');
const mw = cli('make', '--game', G, '--gid', 'as64', '--mod', MOD2, '--unit', 't2', '--from', path.join(root, 'subj.png'), '--fit', 'cover', '--mirror', '--plate', 'game', '--write');
ok(mw.status === 0 && fs.existsSync(path.join(MOD2, 'resource/interface/scene/unit_icon_small/t2_02.tga')), 'cli make --write ' + mw.stderr);
const mr = cli('make', '--game', G, '--gid', 'as64', '--mod', MOD2, '--unit', 't2', '--render'); ok(mr.status === 2 && /GUI/.test(mr.stderr), 'cli make --render points at the GUI');
const pr = cli('plan', '--game', G, '--gid', 'as64', '--mod', MOD2, '--unit', 't2', '--render', '--json'); ok(pr.status === 0 && JSON.parse(pr.stdout).source.cameras.card.az === CAM.preset('as64', 'card', 'vehicle').az, 'cli plan --render gives the camera');
const bp = cli('make', '--game', G, '--gid', 'as64', '--mod', MOD2, '--unit', 't2', '--from', path.join(root, 'subj.png'), '--plate', 'cutout'); ok(bp.status === 2 && /--plate/.test(bp.stderr), 'cli --plate refuses an unknown value');
const ch = cli('check', '--game', G, '--gid', 'as64', '--mod', MOD, '--json'); ok(ch.status === 1 && JSON.parse(ch.stdout).counts.error >= 1, 'cli check exits 1 on errors');

if (!process.env.UC_KEEP) try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { /* leave it */ }
console.log((bad ? 'FAIL ' : 'ok ') + (n - bad) + '/' + n);
process.exit(bad ? 1 : 0);
