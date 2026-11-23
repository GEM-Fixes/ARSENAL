#!/usr/bin/env node
// unitcard goh-smoke: every card route of the Units page tool "Unit card" once for Gates of Hell, against the real GoH install, one
// line per function: ok / fail + reason. Not in run.sh (needs a real install, takes minutes). Read only: make is preview only, cutouts
// only as the plain-style dry answer, a scratch mod folder stands in for a mod.
//   node tools/unitcard/test/goh-smoke.js [--dir <GoH install>] [--no-render]
// Starts the GUI in-process on a free port (as render.js does) and, for one vehicle, one gun, one squad and one soldier: current,
// styles (plain and game layers), weapons, scene, plan, make (preview), cutouts (plain: no GIMP); once: kinds, images, gimp, fidelity
// (the vehicle). Then one headless render per kind of the vehicle and the squad (tools/unitcard/render.js session) and make from them.
// Exit: 0 all ok (or skipped: no GoH install), 1 a function failed.
// Env: ARSENAL_TMP (scratch; else the OS temp).
// Author: unitcard tool (ARSENAL)
// Author: Imperator_Aug (ARSENAL, ia-dd21ad07)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const T = path.join(__dirname, '..', '..');
const argv = process.argv.slice(2), opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };

async function main() {
  let dir = opt('--dir');
  if (!dir) { try { dir = require(path.join(T, 'lib', 'games')).install('goh').dir; } catch (e) { dir = null; } }
  if (!dir || !fs.existsSync(dir)) { console.log('goh-smoke: skipped, no Gates of Hell install found (give --dir).'); return 0; }
  const base0 = process.env.ARSENAL_TMP || os.tmpdir();
  const tmp = path.join(base0, 'cardlook', 'smoke'), mod = path.join(tmp, 'no-mod');
  fs.mkdirSync(mod, { recursive: true });
  const I = require(path.join(T, 'unitcard', 'lib', 'img'));
  const G = require(path.join(T, 'gui', 'gui'));
  const srv = await G.start({ port: 0, tmpRoot: path.join(tmp, 'gui') });
  const rows = [];
  const post = async (p, b) => {
    const go = () => fetch(srv.url.replace(/\/$/, '') + p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-arsenal-game': 'goh' }, body: JSON.stringify(Object.assign({ gid: 'goh', game: dir, mod }, b)), signal: AbortSignal.timeout(15 * 60 * 1000) });
    let r; try { r = await go(); } catch (e) { await new Promise(z => setTimeout(z, 200)); r = await go(); }
    const j = await r.json().catch(() => ({ error: 'HTTP ' + r.status })); if (!r.ok || j.error) throw new Error(j.error || 'HTTP ' + r.status); return j;
  };
  // one function: ok + a short note, or fail + the reason
  async function check(name, fn) {
    const t0 = Date.now();
    try { const note = await fn(); rows.push({ name, ok: true, note: note || '', s: (Date.now() - t0) / 1000 }); }
    catch (e) { rows.push({ name, ok: false, note: String(e && e.message || e).split('\n')[0].slice(0, 300), s: (Date.now() - t0) / 1000 }); }
    const r = rows[rows.length - 1]; console.log((r.ok ? 'ok   ' : 'FAIL ') + name + ' (' + r.s.toFixed(1) + 's)' + (r.note ? ': ' + r.note : ''));
  }
  // a plain see-through test subject (no game pixels): a dark block on a clear ground
  const subj = (() => { const p = I.blank(160, 90, [0, 0, 0, 0]); for (let y = 25; y < 75; y++) for (let x = 20; x < 140; x++) { const i = (y * 160 + x) * 4; p.d[i] = 70; p.d[i + 1] = 72; p.d[i + 2] = 60; p.d[i + 3] = 255; } return 'data:image/png;base64,' + I.png(p).toString('base64'); })();
  try {
    let kinds = null;
    await check('kinds', async () => { kinds = await post('/api/x/units/card/kinds', {}); return (kinds.kinds || []).map(k => k.id).join(' ') + (kinds.na && kinds.na.length ? '; na ' + kinds.na.map(n => n.id).join(' ') : ''); });
    // the units as the Units page has them (search results: the page id, GoH id@file@period); --vehicle / --gun / --squad / --soldier <q>
    const pick = {};
    const roles = [['vehicle', 'kv1', 'vehicle', g => g === 'vehicle'], ['gun', '76mm', 'vehicle', g => g === 'gun'], ['squad', 'rifle', 'squad', g => g === 'infantry'], ['soldier', 'sniper', 'soldier', g => g === 'infantry']];
    for (const [role, q0, kind, okG] of roles) {
      await check('pick ' + role, async () => {
        const q = opt('--' + role) || q0, j = await post('/api/x/units/search', { q, kind, all: true, limit: 30 });
        for (const h of j.results || []) {
          const body = { id: h.id }; if (h.card) body.card = h.card;
          let c; try { c = await post('/api/x/units/card/current', body); } catch (e) { continue; }
          if (!(c.kinds || []).length || !okG(c.unit && c.unit.group)) continue;
          pick[role] = { id: h.id, card: h.card, cur: c }; return h.id + ' (' + c.unit.kind + '/' + c.unit.group + ', kinds ' + c.kinds.map(k => k.kind).join(' ') + ')';
        }
        throw new Error('no ' + role + ' with card kinds among ' + (j.results || []).length + ' search hits for "' + q + '"');
      });
    }
    for (const role of Object.keys(pick)) {
      const P = pick[role], u = P.cur.unit, ks = (P.cur.kinds || []).map(k => k.kind), body = { id: P.id, kind: u.kind, army: u.army };
      if (u.breed) body.breed = u.breed; if (P.card) body.card = P.card;
      await check(role + ' current', async () => (ks.length ? ks.join(' ') : 'no kinds') + (P.cur.na && P.cur.na.length ? '; na ' + P.cur.na.map(n => n.id).join(' ') : ''));
      for (const plate of ['plain', 'game']) await check(role + ' styles ' + plate, async () => { const j = await post('/api/x/units/card/styles', Object.assign({ plate }, body)); return (j.styles || []).map(s => s.kind + ':' + (s.cutter || '-')).join(' ') + (j.gimp ? '; gimp ' + (j.gimp.found ? 'found' : 'none') : ''); });
      if (role === 'squad' || role === 'soldier') await check(role + ' weapons', async () => { const j = await post('/api/x/units/card/weapons', body); return (j.weapons || []).slice(0, 3).map(w => w.model + ' x' + Math.round(w.n * 10) / 10).join(', ') || 'none'; });
      for (const k of P.cur.kinds || []) {
        const sc = (k.camera && k.camera.scene) || 'vehicle';
        if (sc === 'emblem') { await check(role + ' scene ' + k.kind, async () => 'emblem kind: nothing rendered (by design)'); continue; }
        await check(role + ' scene ' + k.kind, async () => {
          const sb = sc === 'weapon' ? { kind: 'card', group: u.group } : sc === 'soldier' ? { kind: 'portrait', group: u.group, breed: u.breed || '' } : sc === 'buy' ? { kind: 'card', group: u.group } : { kind: k.kind, group: u.group === 'gun' ? 'gun' : 'vehicle' };
          const j = await post('/api/x/units/card/scene', Object.assign({}, body, sb));
          return (j.scene.meshes || []).length + ' meshes' + (j.weapon ? ', weapon ' + j.weapon.model : '') + (j.dropped ? ', ' + j.dropped + ' crew meshes dropped' : '');
        });
      }
      await check(role + ' plan', async () => { const j = await post('/api/x/units/card/plan', body); return ((j.kinds || []).map(k => k.kind).join(' ') || 'none') + (j.skip && j.skip.length ? '; skip ' + j.skip.map(s => s.kind).join(' ') : ''); });
      await check(role + ' make (preview)', async () => {
        const j = await post('/api/x/units/card/make', Object.assign({}, body, { src: subj, plate: 'plain', write: false }));
        const pv = Object.keys(j.previews || {}); const sk = (j.plan && j.plan.skip) || [];
        if (!pv.length) throw new Error('no preview' + (sk.length ? ': ' + sk.map(s => s.kind + ' ' + s.why).join('; ') : ''));
        return pv.length + ' kinds previewed, ' + (j.files || []).length + ' files planned' + (sk.length ? '; skip ' + sk.map(s => s.kind + ': ' + s.why).join('; ') : '');
      });
      await check(role + ' cutouts (plain, no GIMP)', async () => { const j = await post('/api/x/units/card/cutouts', Object.assign({ plate: 'plain' }, body)); if ((j.rows || []).length) throw new Error('rows came back in plain style'); return j.line || 'no rows'; });
    }
    await check('images', async () => { const j = await post('/api/x/units/card/images', {}); return (j.images || []).length + ' images in the mod'; });
    await check('gimp', async () => { const j = await post('/api/x/units/card/gimp', {}); return (j.found ? 'found ' : 'not found ') + (j.line || ''); });
    if (pick.vehicle) await check('fidelity (vehicle)', async () => { const j = await post('/api/x/units/card/fidelity', { id: pick.vehicle.id }); return JSON.stringify(j).slice(0, 160); });

    // headless renders of the vehicle and the squad, then make from them
    if (!argv.includes('--no-render')) {
      const R = require(path.join(T, 'unitcard', 'render'));
      let S = null;
      await check('render session', async () => { S = await R.session({ gid: 'goh', dir, mod, tmp: path.join(tmp, 'r') }); return S.url; });
      if (S) {
        try {
          for (const role of ['vehicle', 'squad']) {
            const P = pick[role]; if (!P) continue;
            const u = P.cur.unit, spec = { id: P.id, card: P.card, kind: u.kind, army: u.army, breed: u.breed || '', group: u.group };
            const shots = R.shotsOf('goh', u.group, P.cur.kinds || [], { scale: 4 }), srcs = {};
            const res = await S.render(spec, shots).catch(e => shots.map(s => ({ id: s.id, url: null, info: { error: e.message } })));
            for (const s of shots) {
              const r = res.find(x => x.id === s.id) || {};
              await check(role + ' render ' + s.id, async () => {
                if (r.info && r.info.why === 'emblem') return 'emblem kind: not rendered (by design)';
                if (!r.url) throw new Error(R.whyOf(r.info));
                srcs[s.id] = r.url; return s.w + 'x' + s.h + ' (' + s.scene + ')';
              });
            }
            await check(role + ' make from renders', async () => {
              if (!Object.keys(srcs).length) throw new Error('no render to make from');
              const j = await post('/api/x/units/card/make', { id: P.id, card: P.card, kind: u.kind, army: u.army, kinds: Object.keys(srcs), srcs, fits: { default: { trim: true, mode: 'contain' } }, key: 'none', plate: 'plain', write: false });
              const pv = Object.keys(j.previews || {}), sk = (j.plan && j.plan.skip) || [];
              if (!pv.length) throw new Error('no preview' + (sk.length ? ': ' + sk.map(x => x.kind + ' ' + x.why).join('; ') : ''));
              return pv.join(' ') + (sk.length ? '; skip ' + sk.map(x => x.kind + ': ' + x.why).join('; ') : '');
            });
          }
        } finally { await S.close(); }
      }
    }
  } finally { await srv.close(); }
  const bad = rows.filter(r => !r.ok);
  console.log('goh-smoke: ' + (rows.length - bad.length) + ' ok, ' + bad.length + ' failed');
  return bad.length ? 1 : 0;
}
main().then(c => process.exit(c), e => { console.error('goh-smoke: ' + (e && e.stack || e)); process.exit(1); });
