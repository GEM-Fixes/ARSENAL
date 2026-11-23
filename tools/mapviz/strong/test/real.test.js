// strong real-install test (MV-STR): per installed game, strong points (infantry, both sides) and strong checks on one
// real multiplayer map (MoW:AS2 and AS64 multi/1v1_road, GoH multi/1v1_balzerweg), in process. Sight is the real part
// when rules/sight exports what strong calls (else the synth.js stand-in); cover likewise (MAPVIZ_STRONG_STANDIN_COVER=1
// forces the stand-in); pass and water are the real parts. The test
// says which. It also checks the weapon reaches and unit heights strong reads from each game's files.
// Numbers are not pinned; the checks are sane ranges, shapes and timings. Skipped per game when the install is absent;
// MAPVIZ_NO_GAME=1 skips everything (no folder is made). Installs are read through vfs only. The scratch folder (cache)
// is made under the temp folder and deleted on PASS.
// usage: node tools/mapviz/strong/test/real.test.js
// Author: Imperator_Aug (ARSENAL, ia-db411218)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz strong real: ' + what); } }

function installs() {
  if (process.env.MAPVIZ_NO_GAME === '1') return {};
  const gd = require('../../../lib/gamedir');
  const out = {};
  let as2 = null;
  try { const r = gd.resolve({}); as2 = r && r.dir && fs.existsSync(path.join(r.dir, 'resource', 'map.pak')) ? r.dir : null; } catch (e) { as2 = null; }
  let goh = null;
  try { const g = gd.goh(); goh = g && fs.existsSync(path.join(g, 'resource', 'map', 'multi.pak')) ? g : null; } catch (e) { goh = null; }
  if (as2) { out.mowas2 = as2; out.as64 = as2; }
  if (goh) out.goh = goh;
  return out;
}
const MAPS = { mowas2: 'multi/1v1_road', as64: 'multi/1v1_road', goh: 'multi/1v1_balzerweg' };

const have = installs();
const targets = Object.keys(MAPS).filter(t => have[t]);
if (!targets.length) {
  console.log('skip: ' + (process.env.MAPVIZ_NO_GAME === '1' ? 'MAPVIZ_NO_GAME=1' : 'no MoW:AS2 / AS64 / GoH install found'));
  console.log('PASS mapviz strong real (0, skipped)');
  process.exit(0);
}
for (const t of Object.keys(MAPS)) if (!have[t]) console.log('skip ' + t + ': no install');

const W = fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-strong-real-'));
process.env.ARSENAL_CACHE = path.join(W, 'cache');
const S = require('../index');
const F = require('../frame');
const K = require('../../lib/mapkit');
const synth = require('./synth');

for (const t of targets) {
  const t0 = Date.now();
  try {
    const rules = synth.rules({ realSight: true, realCover: process.env.MAPVIZ_STRONG_STANDIN_COVER !== '1' });
    console.log(t + ' ' + MAPS[t] + ': sight ' + (rules.sight.synth ? 'stand-in (rules/sight not built)' : 'real') + ', cover ' + (rules.cover.synth ? 'stand-in' : 'real') + ', pass and water real');
    const src = K.source({ target: t, game: have[t] });
    const I = S.inputs([], { target: t, map: MAPS[t], rules, src });
    const fr = F.strongFrame(I.doc);
    const r = S.run(I, { kind: 'inf', side: 'both', seed: 1, ensemble: 2 });
    const j = r.json, sec = (Date.now() - t0) / 1000;
    ok(r.grids.every(g => g.w === fr.w && g.h === fr.h && g.etype === 'u8' && g.data.length === fr.w * fr.h), t + ' layers on the strong frame ' + fr.w + ' x ' + fr.h);
    const ca = j.candidates.filter(c => c.side === 'a' && c.gate), cb = j.candidates.filter(c => c.side === 'b' && c.gate);
    ok(ca.length >= 20 && cb.length >= 20, t + ' gated candidates a ' + ca.length + ' b ' + cb.length);
    ok(j.candidates.every(c => c.score >= 0 && c.score <= 1 && Object.values(c.f).every(v => v >= 0 && v <= 1)), t + ' scores and factors in 0..1');
    const mean = l => l.reduce((s, c) => s + c.score, 0) / Math.max(1, l.length);
    ok(mean(ca) > 0.1 && mean(ca) < 0.95 && mean(cb) > 0.1 && mean(cb) < 0.95, t + ' mean scores a ' + mean(ca).toFixed(3) + ' b ' + mean(cb).toFixed(3));
    ok(j.frame.contactCells > 0 && j.frame.flagsActive.length > 0, t + ' contact cells ' + j.frame.contactCells + ', flags ' + j.frame.flagsActive.join(','));
    ok(j.labels.length >= 1 && j.labels.length <= 20, t + ' labels ' + j.labels.length);
    const gate = r.grids.find(g => g.name === 'strong.a.inf.gate');
    let open = 0, shut = 0; for (const v of gate.data) { if (v === 250) open++; else if (v === 0) shut++; }
    ok(open > shut * 0.2 && open > 100, t + ' gate a open ' + open + ' shut ' + shut);
    // reaches and unit heights from the game's own files (rules.md 9.4)
    const wp = require('../danger').weapons(I);
    const wantM = t === 'goh' ? [160, 20.7] : [110, 17];
    ok(wp.mortar.source === 'stack' && wp.mortar.reachM === wantM[0] && wp.grenade.source === 'stack' && wp.grenade.reachM === wantM[1], t + ' weapon reaches from the stack ' + JSON.stringify(wp));
    const fw = j.frame.weapons || {};
    ok(['grenade', 'mortar', 'howitzer'].every(k => fw[k] && fw[k].reachM === wp[k].reachM && fw[k].source === wp[k].source && fw[k].name === wp[k].name), t + ' frame.weapons written as used ' + JSON.stringify(fw));
    ok(!('ground' in (gate.meta.reasons || {})) && (gate.meta.offGround === undefined || gate.meta.offGround > 0), t + ' gate meta: no ground reason, offGround ' + gate.meta.offGround);
    const ht = S.heights('tank', null, S.unitEntry(I, 'tank')), ha = S.heights('at', null, S.unitEntry(I, 'at'));
    console.log(t + ' unit heights: tank ' + JSON.stringify(ht) + '; at ' + JSON.stringify(ha));
    ok(ht.topU >= 30 && ht.topU <= 80 && ha.gunU >= 10 && ha.gunU <= 40, t + ' tank top ' + ht.topU + ' u, at gun ' + ha.gunU + ' u (' + ht.source + ', ' + ha.source + ')');
    const t1 = Date.now();
    const ch = S.checks(I, {});
    ok(ch.every(c => c.kind === 'check' && Number.isFinite(c.x) && Number.isFinite(c.y) && c.region === 0), t + ' check items');
    ok(!ch.some(c => c.code === 'FLAG_UNREACHABLE' && c.unit === 'inf'), t + ' infantry reaches every flag');
    ok(I.mode === 'battle_zones', t + ' default mode battle_zones: ' + I.mode);
    // per-game ranges from the vision profile (goh binocular 200 m, inf uncover 20 m; as2 binocular 180 m)
    const R = S.ranges(I, 'inf'), vw = I.sight.vprof.viewers || {};
    ok(R.source === 'profile' && R.binocU === vw.binocular.reachM * 20 && R.enemyUncoverU === vw.inf.uncoverM * 20, t + ' ranges from the profile: binocular ' + R.binocU / 20 + ' m, uncover ' + R.enemyUncoverU / 20 + ' m');
    ok(!ch.some(c => c.code === 'PICTURE_REFUSED'), t + ' no PICTURE_REFUSED on a vanilla map: ' + JSON.stringify(ch.filter(c => c.code === 'PICTURE_REFUSED')));
    if (t === 'goh') {
      ok(!ch.some(c => c.code === 'FLAG_UNREACHABLE' && c.unit === 'tank'), t + ' tanks reach every flag zone (the flag point is blocked)');
      ok(ch.some(c => c.code === 'FLAG_IN_DANGER' || c.code === 'FLAG_IN_BINOC'), t + ' flag danger and binocular checks run on goh');
    }
    // no enemy route: kz is nodata and noted, never a silent 0
    const kzs = j.candidates.filter(c => c.gate && 'kz' in c.f).length;
    ok(kzs > 0 || j.notes.some(n => n.code === 'STRONG_DEGRADED' && /no routes/.test(n.msg)), t + ' kz on ' + kzs + ' candidates or a no-routes note');
    for (const it of ch.filter(c => c.code === 'REACH_UNEQUAL')) ok(it.value > it.limit, t + ' REACH_UNEQUAL value above its limit ' + it.value + ' / ' + it.limit);
    const counts = {}; for (const c of ch) counts[c.code] = (counts[c.code] || 0) + 1;
    console.log(t + ': ' + j.candidates.length + ' candidates, labels ' + j.labels.map(id => { const c = j.candidates.find(x => x.id === id); return c.label + ' ' + c.score; }).join('; ') +
      ', d ' + j.frame.d + ' s, points ' + sec.toFixed(1) + ' s, checks ' + ((Date.now() - t1) / 1000).toFixed(1) + ' s: ' + JSON.stringify(counts) + '; notes ' + j.notes.map(n => n.code).join(','));
    ok(sec < 600, t + ' points under 10 min (' + sec.toFixed(1) + ' s)');
  } catch (e) { fail++; console.log('FAIL mapviz strong real: ' + t + ' threw ' + (e && e.stack)); }
}
if (!fail) fs.rmSync(W, { recursive: true, force: true }); else console.log('kept ' + W);
console.log((fail ? 'FAIL' : 'PASS') + ' mapviz strong real (' + pass + ' passed, ' + fail + ' failed)');
process.exit(fail ? 1 : 0);
