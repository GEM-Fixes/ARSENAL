// GUI-EXT units, tool "Unit card": routes under /api/x/units/card/*. Every picture a unit shows in the interface (buy card, unit
// list, squad, portrait, GoH shop, damage scheme) made in the vanilla style of its class from an image or a render of the model.
// The image work (style reads, compose, encode, write) runs on the unitcard worker thread (tools/unitcard/lib/worker.js), never on
// the server thread (PERF.md part 1); its views and styles are cached in the worker by game + mod + the mod's folder stamps.
// make = preview unless body.write (one code path); a write goes only into the picked mod, after the shared write guard.
// styles = the layers of each class (lib/layers.js, with the GIMP cutouts of the class when made: lib/cutouts.js); cutouts = make them
// with the user's GIMP (one unitcard child per class, cancellable); gimp = where GIMP is; openxcf = a class .xcf in the GIMP window.
// Author: unitcard tool (ARSENAL)
// Author: Imperator_Aug (ARSENAL, ia-012be765)
'use strict';
const path = require('path');
const UC = path.join(__dirname, '..', '..', '..', 'unitcard', 'lib');
let W = null; const worker = () => W || (W = require(path.join(UC, 'worker')));
const K = () => require(path.join(UC, 'kinds'));
const CAM = () => require(path.join(UC, 'camera'));

module.exports = function cardRoutes(S) {
  const L = S.lib;
  const ctxOf = (ctx, b, needMod) => {
    const game = L.gameOf(ctx, b), mod = L.modOf(b, game, needMod), gid = L.gidOf(ctx, b, game);
    return { game, mod, gid };
  };
  // the unit as the page has it: id (GoH: id@file@period card key -> the id), kind, army, breed (soldiers)
  const unitOf = b => {
    const id = String(b.id || '').split('@')[0].trim();
    if (!id || id.length > 120 || /[\0\r\n]/.test(id)) L.bad('Pick a unit first.');
    const u = { id };
    for (const k of ['kind', 'army', 'breed', 'def', 'portrait']) if (b[k] && typeof b[k] === 'string' && /^[a-z0-9_ .()/@-]{1,120}$/i.test(b[k])) u[k] = b[k];
    if (b.hero) u.hero = true;
    return u;
  };
  const SAFE_KIND = /^[a-z_]{2,20}$/;
  const kindsOf = b => (Array.isArray(b.kinds) ? b.kinds.filter(k => SAFE_KIND.test(String(k))).map(String) : undefined);
  // what the picture work may take from the body: numbers, the fit per kind, a source picture as a data URL (8 MB body limit)
  const fitOf = f => { if (!f || typeof f !== 'object') return {}; const o = {};
    if (f.mode === 'contain' || f.mode === 'cover') o.mode = f.mode;
    for (const k of ['scale', 'dx', 'dy', 'margin']) if (Number.isFinite(Number(f[k]))) o[k] = Number(f[k]);
    if (Array.isArray(f.box) && f.box.length === 4 && f.box.every(v => Number.isFinite(Number(v)))) o.box = f.box.map(Number);
    if (Array.isArray(f.anchor) && f.anchor.length === 2) o.anchor = f.anchor.map(Number);
    if (f.mirror) o.mirror = true; if (f.trim) o.trim = true; return o; };
  const pic = s => (typeof s === 'string' && /^data:image\/(png|jpeg|jpg|bmp);base64,/i.test(s) ? s : null);
  const args = (ctx, b, needMod) => {
    const c = ctxOf(ctx, b, needMod);
    const a = { game: c.game, gid: c.gid, mod: c.mod, unit: unitOf(b), kinds: kindsOf(b), builtIn: !!b.builtIn, matchMod: !!(b.matchMod && c.mod) };
    // the card style (tools/unitcard make / styles): 'plain' drawn by code (the default there), 'game' layers cut from the game's cards
    const PL = v => (v === 'plain' || v === 'game' ? v : undefined);
    if (PL(b.plate)) a.plate = b.plate;
    if (b.plateBy && typeof b.plateBy === 'object') { const o = {}; for (const k of Object.keys(b.plateBy)) if (SAFE_KIND.test(k) && PL(b.plateBy[k])) o[k] = b.plateBy[k]; if (Object.keys(o).length) a.plateBy = o; }
    return { c, a };
  };

  async function kinds(ctx, b) {
    const gid = L.gidOf(ctx, b, null), k = K();
    return { gid, family: k.family(gid), kinds: k.list(gid).map(x => ({ id: x.id, folder: x.folder, w: x.w, h: x.h, frames: x.frames, on: x.on, tag: x.tag, use: x.use, miss: x.miss })), na: k.NOT[k.family(gid)] || [] };
  }
  async function current(ctx, b) { const { a } = args(ctx, b, false); return worker().call('current', a); }
  async function styles(ctx, b) { const { a } = args(ctx, b, false); return worker().call('styles', a); }
  // the render's scene: the line-up of the unit (its skin and texture variant as picked on the page) and the camera of the kind and
  // class (tools/unitcard/lib/camera.js), taken by the viewer's snapshot({ view, light })
  // the weapons of an infantry buy, most carried first: an AS2 / AS64 infantry buy card shows no soldier but the flat side
  // silhouette of the squad's main weapon (compared on sheets of the game's own cards), GoH's the squad's weapons side by side.
  // Read with the Equipment card's own kit route (every soldier of the buy, what he holds counts his number of men, a weapon he
  // only carries counts half). -> [{ model (stuff {entity}), item, name, n, hands }]
  const WEAPON = /^[a-z0-9_ .()/-]{1,120}$/i;
  async function weaponsOf(ctx, b) {
    const kit = S.routes['POST /api/x/units/kit'], base = { mod: b.mod, gid: b.gid, game: b.game, lang: b.lang };
    const top = await kit('', Object.assign({ id: String(b.id || ''), card: b.card }, base), ctx);
    const men = top && Array.isArray(top.items) ? [{ kit: top, n: 1 }] : [];
    for (const s of (top && top.soldiers) || []) {
      let k = null; try { k = await kit('', Object.assign({ id: s.id }, base), ctx); } catch (e) { k = null; }
      if (k && Array.isArray(k.items)) men.push({ kit: k, n: Math.max(1, Number(s.n) || 1) });
    }
    const by = new Map(), out = [];
    for (const m of men) for (const it of m.kit.items) {
      if (it.kind !== 'weapon' || !it.model || !WEAPON.test(it.model)) continue;
      let w = by.get(it.model);
      if (!w) { w = { model: it.model, item: it.item, name: it.name || '', n: 0, hands: 0 }; by.set(it.model, w); out.push(w); }
      w.n += it.inHands ? m.n : m.n / 2; if (it.inHands) w.hands += m.n;
    }
    return out.sort((x, y) => y.hands - x.hands || y.n - x.n);
  }
  async function weapons(ctx, b) { args(ctx, b, false); unitOf(b); return { weapons: await weaponsOf(ctx, b) }; }
  async function scene(ctx, b) {
    const { c } = args(ctx, b, false);
    const body = { id: String(b.id || ''), mod: b.mod, gid: b.gid, game: b.game };
    if (b.card) body.card = String(b.card);
    const look = {};
    if (b.skin) look.skin = String(b.skin);
    if (b.variant === false || b.variant === '-') look.variant = '-'; else if (b.variant) look.variant = String(b.variant);
    const pr = CAM().preset(c.gid, String(b.kind || 'card'), String(b.group || 'vehicle'));
    // the weapon alone (an infantry buy card): the one picked on the page, else the one the squad has most of
    let weapon = null, arms = null;
    if (pr.scene === 'weapon') {
      arms = await weaponsOf(ctx, b);
      const want = typeof b.weapon === 'string' && WEAPON.test(b.weapon) ? b.weapon : '';
      weapon = (want && (arms.find(w => w.model === want) || { model: want, item: want, name: '', n: 0, hands: 0 })) || arms[0] || null;
      if (!weapon) L.bad('No weapon with a model was found in the equipment of this squad, so there is nothing to draw for its buy card.');
      look.only = true; look.of = weapon.model; look.kind = 'vehicle'; delete look.skin;
    }
    // one soldier alone for a portrait or a squad picture (the breed's man), else the whole buy
    else if ((b.kind === 'portrait' || b.kind === 'squad') && b.breed) { look.only = true; look.of = 'breed:' + String(b.breed); look.kind = 'soldier'; }
    // a vehicle or gun alone, without the crew that comes with its buy
    else if (b.group === 'vehicle' || b.group === 'gun') { look.only = true; look.of = String(b.id || '').split('@')[0]; look.kind = 'vehicle'; }
    if (Object.keys(look).length) body.look = look;
    const r = await L.lineupOf(ctx, body);
    if (!r || !r.scene) L.bad('No model to render for this unit (the line-up came back empty).');
    // owner 2026-11-22 "render it without the crew": a vehicle or gun card shows that model alone. look.only already asks the line-up
    // for one model; here any other figure (crew, passengers, soldiers) is dropped as well and the bounds (the camera fit) are the
    // vehicle's own box
    let sc = r.scene, dropped = 0;
    if (b.group === 'vehicle' || b.group === 'gun') {
      const figs = r.figures || [], veh = figs.find(f => f.kind !== 'soldier');
      if (veh) { const keep = (sc.meshes || []).filter(m => m.figure === veh.index); dropped = (sc.meshes || []).length - keep.length; sc = Object.assign({}, sc, { meshes: keep, bounds: veh.box || sc.bounds }); }
    }
    // a portrait asked with no breed (render.js without --breed): the first soldier of the buy alone, not the whole squad
    else if (b.kind === 'portrait' && !b.breed) {
      const sol = (r.figures || []).find(f => f.kind === 'soldier');
      if (sol) { const keep = (sc.meshes || []).filter(m => m.figure === sol.index); if (keep.length) { dropped = (sc.meshes || []).length - keep.length; sc = Object.assign({}, sc, { meshes: keep, bounds: sol.box || sc.bounds }); } }
    }
    r.scene = sc;
    // nothing to draw: say why (the line-up's note, e.g. the model file was not found) instead of an empty picture
    if (!(sc.meshes || []).length) L.bad((r.notes || []).filter(Boolean).join(' ') || 'No model to render for this unit (the line-up has no mesh).');
    // the scene stays as the model is; the camera is the viewer's snapshot view (lib/camera.js view), az / el / fov boxes override it
    const view = CAM().view(pr, { az: b.az, el: b.el, fov: b.fov });
    const out = { scene: r.scene, camera: { az: view.az, el: view.el, fov: view.fov, view, light: CAM().light(pr), preset: pr }, notes: r.notes || [],
      figures: (r.figures || []).filter(f => !(b.group === 'vehicle' || b.group === 'gun') || f.kind !== 'soldier').map(f => ({ kind: f.kind, id: f.id })), dropped };
    if (weapon) { out.weapon = weapon; out.weapons = arms; }
    return out;
  }
  async function plan(ctx, b) { const { a } = args(ctx, b, false); a.newPortrait = b.newPortrait; a.keepPortrait = !!b.keepPortrait; return worker().call('plan', a); }
  async function make(ctx, b) {
    const write = !!b.write, { c, a } = args(ctx, b, write);
    if (write) {
      L.guardWrite(c.gid, c.game, c.mod, b);
      const why = require('../../../lib/writeguard').refuseWrite(c.mod, { game: c.game });
      if (why) L.bad(String(why).replace(/^refused:\s*/, ''));
    }
    a.src = pic(b.src);
    // srcs[kind]: one picture, or a list (GoH infantry card: the squad's weapons, most carried first, at most 3) the composer stacks
    a.srcs = {}; for (const k of Object.keys(b.srcs || {})) { if (!SAFE_KIND.test(k)) continue; const v = b.srcs[k];
      if (Array.isArray(v)) { const l = v.map(pic).filter(Boolean).slice(0, 3); if (l.length) a.srcs[k] = l.length > 1 ? l : l[0]; } else if (pic(v)) a.srcs[k] = v; }
    if (!a.src && !Object.keys(a.srcs).length) L.bad('Give a picture first: an image file, or a render of the model.');
    a.fits = {}; for (const k of Object.keys(b.fits || {})) if (k === 'default' || SAFE_KIND.test(k)) a.fits[k] = fitOf(b.fits[k]);
    a.key = Array.isArray(b.key) && b.key.length === 3 ? b.key.map(Number) : b.key === 'none' ? 'none' : 'auto';
    for (const k of ['tol', 'soft']) if (Number.isFinite(Number(b[k]))) a[k] = Number(b[k]);
    a.look = ['auto', 'colour', 'silhouette', 'grey'].includes(b.look) ? b.look : 'auto';
    if (Array.isArray(b.tone) && b.tone.length === 3) a.tone = b.tone.map(Number);
    a.shadow = b.shadow !== false; a.outline = b.outline !== false;
    if (b.newPortrait && /^[a-z0-9_]{1,60}$/i.test(String(b.newPortrait))) a.newPortrait = String(b.newPortrait);
    a.keepPortrait = !!b.keepPortrait; a.write = write;
    // per kind: the class numbers the page shows (editable), the badge pick, the template pick, the layers shown in the preview
    const per = (o, fn) => { const r = {}; for (const k of Object.keys(o && typeof o === 'object' ? o : {})) if (SAFE_KIND.test(k)) { const v = fn(o[k]); if (v !== undefined) r[k] = v; } return r; };
    a.styleBy = per(b.styleBy, s => { if (!s || typeof s !== 'object') return undefined; const o = {};
      for (const k of ['height', 'width', 'baseline', 'cx', 'match']) if (s[k] !== '' && s[k] != null && Number.isFinite(Number(s[k]))) o[k] = Number(s[k]);
      if (['auto', 'colour', 'silhouette', 'keep'].includes(s.look)) o.look = s.look; if (Array.isArray(s.tone) && s.tone.length === 3) o.tone = s.tone.map(Number); if (s.shadow != null) o.shadow = !!s.shadow; return o; });
    a.badgeBy = per(b.badgeBy, v => (v === 'none' || (typeof v === 'string' && /^[A-Za-z0-9_]{1,24}$/.test(v)) ? v : pic(v) || undefined));
    a.templateBy = per(b.templateBy, v => (typeof v === 'string' && /^[a-z0-9_ .()@-]{1,120}$/i.test(v) ? v : undefined));
    a.layersBy = per(b.layersBy, v => { if (!v || typeof v !== 'object') return undefined; const o = {}; for (const k of ['background', 'army', 'frame', 'badge', 'subject']) if (v[k] === false) o[k] = false; return o; });
    const r = await worker().call('make', a);
    if (write && r.written && r.written.length) { try { if (ctx && ctx.modtree && ctx.modtree.touch) ctx.modtree.touch(c.mod); } catch (e) { /* ignore */ } }
    r.gid = c.gid; r.mod = c.mod;
    r.check = checkLines(c.gid, r);
    return r;
  }
  // what to look at in game, per kind written (README part 1, [T] rows)
  function checkLines(gid, r) {
    const kinds = [...new Set((r.files || []).map(f => f.kind).filter(k => k !== 'data'))];
    return kinds.map(k => ({ kind: k, where: { card: 'buy panel: the card, then hover, press, and a locked card', small: 'unit list at the bottom while a vehicle is selected; end-of-match statistics',
      squad: 'unit list button of the soldier', portrait: 'selected soldier panel', shop: 'Conquest shop and reinforcements', scheme: 'damage panel of the selected vehicle' }[k] || k }));
  }
  // a source picture: a disk path (the image box) or the bytes of a dropped / picked file -> a PNG data URL the page draws
  async function load(ctx, b) {
    const a = {};
    if (b.path && typeof b.path === 'string') a.path = b.path;
    else if (typeof b.data === 'string' && /^data:[^;,]*;base64,/.test(b.data)) { a.data = b.data; a.name = String(b.name || 'x.png').slice(0, 200); }
    else L.bad('No picture was given.');
    return worker().call('load', a);
  }
  async function gimp(ctx, b) { return worker().call('gimp', {}); }
  async function fidelity(ctx, b) { const { a } = args(ctx, b, false); return worker().call('fidelity', a); }
  async function openxcf(ctx, b) { return worker().call('openxcf', { dir: String(b.dir || '') }); }
  // the GIMP cutouts of the unit's classes (or every class of a kind with b.all): one unitcard child per class, so the job row shows
  // how far it is and Cancel stops the child that runs; b.force cuts again (hand edits are then replaced)
  async function cutouts(ctx, b) {
    const { c, a } = args(ctx, b, false);
    // plain style: drawn by code, nothing is cut and GIMP is not asked
    if (a.plate !== 'game') return { gimp: null, rows: [], plate: 'plain', line: 'Plain card style: no cutouts are made (pick "Layers from the game\'s cards" for them).' };
    const st = await worker().call('styles', a);
    const todo = [];
    for (const s of st.styles || []) {
      if (s.template) continue;
      if (b.all) { if (!todo.some(t => t.kind === s.kind && !t.group)) todo.push({ kind: s.kind }); }
      else todo.push({ kind: s.kind, group: s.group, army: a.unit.army ? s.army : '' });
    }
    if (!st.gimp || !st.gimp.found) return { gimp: st.gimp, rows: [], line: st.gimp ? st.gimp.line : 'GIMP not found, using the built-in cutter.' };
    const rows = [];
    for (let i = 0; i < todo.length; i++) {
      const t = todo[i];
      if (ctx && ctx.job && ctx.job.set) ctx.job.set({ what: 'Cutouts ' + (i + 1) + '/' + todo.length + ': ' + t.kind + (t.group ? '/' + t.group + (t.army ? '(' + t.army + ')' : '') : ''), page: 'units' });
      const argv = ['cutouts', '--game', c.gid === 'goh' ? 'goh' : 'as64', '--dir', c.game, '--kind', t.kind, '--json'];
      if (t.group) argv.push('--group', t.group); if (t.army) argv.push('--army', t.army);
      if (b.force) argv.push('--force');
      if (a.matchMod) argv.push('--mod', c.mod, '--source', 'mod');
      const r = await ctx.runTool('unitcard', 'unitcard/unitcard.js', argv, { timeoutMs: 30 * 60 * 1000 });
      if (r.cancelled) break;
      let d = null; try { d = JSON.parse(r.stdout); } catch (e) { d = null; }
      if (!d) { rows.push({ kind: t.kind, group: t.group || '', army: t.army || '', cutter: 'builtin', why: (r.stderr || 'no answer').slice(-400) }); continue; }
      for (const x of d.rows || []) if (x.kind) rows.push(x);
    }
    await worker().call('forget', {});
    return { gimp: st.gimp, rows, line: st.gimp.line };
  }
  async function images(ctx, b) { const game = L.gameOf(ctx, b), mod = L.modOf(b, game, false); return worker().call('images', { mod }); }
  const w = S.wrap;
  return {
    'POST /api/x/units/card/kinds': w(kinds),
    'POST /api/x/units/card/current': w(current),
    'POST /api/x/units/card/styles': w(styles),
    'POST /api/x/units/card/scene': w(scene),
    'POST /api/x/units/card/weapons': w(weapons),
    'POST /api/x/units/card/plan': w(plan),
    'POST /api/x/units/card/make': w(make),
    'POST /api/x/units/card/load': w(load),
    'POST /api/x/units/card/images': w(images),
    'POST /api/x/units/card/gimp': w(gimp),
    'POST /api/x/units/card/cutouts': w(cutouts),
    'POST /api/x/units/card/openxcf': w(openxcf),
    'POST /api/x/units/card/fidelity': w(fidelity),
  };
};
