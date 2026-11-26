// unitcard/render: the headless render command's pure parts (arguments, the shots of a unit from the camera presets, the plain reasons,
// the scene body per scene kind) and the camera presets (tools/unitcard/lib/camera.js). No game and no browser needed; with
// UC_LIVE=<as64 game folder> and a browser (Edge or Chrome) one real render of UC_UNIT (default t34_76) is made as well.
//   node tools/unitcard/test/render.test.js
// Author: unitcard tool (ARSENAL)
// Author: Imperator_Aug (ARSENAL, ia-61cd3883)
'use strict';
const assert = require('assert'), path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process');
const R = require('../render'), CAM = require('../lib/camera');
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };

(async () => {
  // arguments
  assert.deepStrictEqual(R.args(['--game', 'goh', '--unit', 'x', '--json', '--kinds', 'card,small']), { game: 'goh', unit: 'x', json: true, kinds: 'card,small' });
  assert.strictEqual(R.args(['stray'])._bad, 'stray');
  ok('args: --key value, a lone flag is true, a stray word is bad use');

  // camera presets: every game family, kind and class has one, with a scene, a view and a light; the view boxes override
  for (const gid of ['as64', 'mowas2', 'goh']) for (const kind of ['card', 'small', 'shop', 'squad', 'portrait', 'scheme']) for (const g of ['vehicle', 'gun', 'infantry', 'hero']) {
    const p = CAM.preset(gid, kind, g), v = CAM.view(p), l = CAM.light(p);
    assert.ok(['vehicle', 'soldier', 'weapon', 'buy', 'emblem'].includes(p.scene), gid + ' ' + kind + ' ' + g + ' scene');
    assert.ok(kind !== 'squad' || p.scene === 'emblem', 'squad pictures are an emblem, never a rendered soldier');
    assert.ok(kind === 'scheme' || l.grade && l.grade.tint.length === 3 && l.grade.con > 0 && l.grade.gamma > 0, 'light carries the fitted colour step');
    assert.ok(Number.isFinite(v.az) && Number.isFinite(v.el) && v.fit === 'silhouette' && v.margin >= 0 && v.margin < 0.45, 'view ' + JSON.stringify(v));
    assert.ok(v.ortho ? v.fov === 0 : v.fov > 0 && v.fov < 90, 'lens');
    assert.ok(l.el > 0 && l.amb > 0 && l.dif > 0, 'light from above');
    assert.ok(typeof p.why === 'string' && p.why.length > 10, 'says what it is');
  }
  const pv = CAM.preset('as64', 'card', 'vehicle');
  assert.deepStrictEqual([CAM.view(pv, { az: '', el: null }).az, CAM.view(pv, { az: '15', el: 40, fov: 50 }).az, CAM.view(pv, { el: 40 }).el, CAM.view(pv, { fov: 50 }).fov], [pv.az, 15, 40, 50], 'empty boxes = the preset, numbers win');
  assert.strictEqual(CAM.view(CAM.preset('as64', 'scheme', 'vehicle'), { fov: 40 }).fov, 0, 'the scheme stays flat');
  assert.ok(pv.mirror === true, 'the game draws left-handed: the picture is mirrored like it');
  assert.ok(CAM.preset('goh', 'portrait', 'infantry').part && CAM.preset('goh', 'portrait', 'infantry').scene === 'soldier', 'GoH portrait: head and shoulders of the soldier');
  assert.ok(CAM.preset('as64', 'portrait', 'infantry').scene === 'soldier' && !CAM.preset('as64', 'portrait', 'infantry').part, 'AS2 portrait: the whole soldier');
  assert.ok(CAM.preset('as64', 'card', 'infantry').scene === 'weapon' && CAM.preset('as64', 'card', 'infantry').ortho && CAM.preset('goh', 'card', 'infantry').scene === 'weapon' && CAM.preset('as64', 'card', 'gun').scene === 'vehicle', 'infantry card = the weapon alone, flat; gun = alone');
  assert.ok(CAM.preset('goh', 'card', 'infantry').stack === 3 && !CAM.preset('as64', 'card', 'infantry').stack, 'GoH infantry card stacks up to 3 weapons, AS2 shows one');
  assert.strictEqual(R.shotsOf('goh', 'infantry', [{ kind: 'card', w: 100, h: 50 }])[0].stack, 3, 'shotsOf carries the stack');
  assert.ok(/emblem/.test(R.WHY.emblem), 'an emblem kind says why it is not rendered');
  // the old trick stays for old callers
  assert.ok(Array.isArray(CAM.turn(10, 20)) && CAM.turn(10, 20).length === 12 && typeof CAM.turnScene === 'function');
  ok('camera: a preset per game, kind and class (scene, view, light, why), boxes override, scheme flat, mirrored like the game, portraits per game');

  // the shots of a unit: 8x the kind's size (the longer side at most 2400), the preset's view and light and scene
  const kinds = [{ kind: 'card', w: 104, h: 52 }, { kind: 'portrait', w: 97, h: 135 }, { kind: 'scheme', w: 97, h: 140 }];
  const sh = R.shotsOf('as64', 'vehicle', kinds, {});
  assert.deepStrictEqual(sh.map(s => [s.id, s.w, s.h, s.scene]), [['card', 832, 416, 'vehicle'], ['portrait', 776, 1080, 'soldier'], ['scheme', 776, 1120, 'vehicle']]);
  assert.ok(sh[0].view.mirror && sh[0].light && sh[2].view.ortho, 'view and light from the preset');
  const big = R.shotsOf('goh', 'vehicle', [{ kind: 'shop', w: 112, h: 140 }], { scale: 30 });
  assert.ok(Math.max(big[0].w, big[0].h) <= 2400, 'longest side capped');
  const ov = R.shotsOf('as64', 'vehicle', [kinds[0]], { az: '-20', el: '30', scale: 2 });
  assert.deepStrictEqual([ov[0].w, ov[0].view.az, ov[0].view.el], [208, -20, 30], '--az --el --scale');
  ok('shotsOf: 8x by default, capped at 2400, preset view and light, --az --el --scale override');

  // the scene per scene kind, and the plain reasons
  assert.deepStrictEqual(R.sceneBody('soldier', { group: 'infantry', breed: 'mp/ger/rifle' }), { kind: 'portrait', group: 'infantry', breed: 'mp/ger/rifle' });
  assert.deepStrictEqual(R.sceneBody('buy', {}), { kind: 'card', group: 'infantry' });
  assert.deepStrictEqual([R.sceneBody('weapon', {}), R.sceneBody('weapon', { weapon: 'mp40' }).weapon], [{ kind: 'card', group: 'infantry' }, 'mp40'], 'the weapon alone: the one picked, else the most carried');
  assert.deepStrictEqual([R.sceneBody('vehicle', { group: 'gun' }).group, R.sceneBody('vehicle', {}).group], ['gun', 'vehicle']);
  for (const w of ['timeout', 'failed', 'nomesh', 'nogl']) assert.ok(R.whyOf({ why: w }).length > 10 && !/undefined/.test(R.whyOf({ why: w })), w);
  assert.ok(/parse error/.test(R.whyOf({ why: 'failed', detail: 'parse error' })) && R.whyOf(null) === 'no picture');
  ok('sceneBody: vehicle alone, the soldier, the weapon, the buy; whyOf: a plain line per reason with the detail');

  // bad use: exit 2 and the usage line
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'render.js')], { encoding: 'utf8' });
  assert.strictEqual(r.status, 2); assert.ok(/usage: node tools\/unitcard\/render\.js/.test(r.stderr));
  ok('main: no unit or out = exit 2 with the usage line');

  // live (optional): one real render against the game
  if (process.env.UC_LIVE) {
    const out = fs.mkdtempSync(path.join(process.env.UC_TMP || os.tmpdir(), 'ucr-'));
    const unit = process.env.UC_UNIT || 't34_76';
    const L = require('../../lib/test/wait').spawnSync(process.execPath, [path.join(__dirname, '..', 'render.js'), '--game', 'as64', '--dir', process.env.UC_LIVE, '--unit', unit, '--kinds', 'card', '--out', out, '--scale', '2', '--json'], { encoding: 'utf8', timeout: 600000 }, 'unitcard render live');
    assert.strictEqual(L.status, 0, L.stdout + L.stderr);
    const f = path.join(out, unit + '_card.png'); assert.ok(fs.existsSync(f) && fs.statSync(f).size > 1000, 'a PNG');
    ok('live: ' + unit + ' card rendered headless');
  }
  console.log('PASS unitcard render (' + n + ')');
})().catch(e => { console.error(e && e.stack || e); console.log('FAIL unitcard render'); process.exit(1); });
