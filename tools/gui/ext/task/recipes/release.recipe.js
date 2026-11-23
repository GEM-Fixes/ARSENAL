// recipe "make a release": the name, text, game range and new version for mod.info, the Workshop picture, then the step "Release
// check" (POST /api/x/task/r/release/check): the new mod.info and picture are made in this task's staging folder and the Share page's
// own release check runs on them (the name, text, version, range and picture items) and on the mod (junk, Gates of Hell, pack, check).
// A check with a fail stops the task. The Write step copies mod.info and the picture into the mod (a restore point each), then the
// Share page routes make the package and the clean Workshop copy in the folder you picked (outside the mod). The play card is made
// on its own screen (POST /api/x/share/card, read only). Nothing is uploaded: the Workshop uploader stays on the Share page.
// Author: Imperator_Aug (ARSENAL, ia-94ea3684)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ST = require('./upgrade.recipe').ST;
const D = require('../lib/draft');

const KINDS = ['minor', 'patch', 'major', 'set'];
const RANGE = { classic: { MinGameVersion: '3.262.0', MaxGameVersion: '3.262.1' }, enhanced: { MinGameVersion: '3.301', MaxGameVersion: '' } };
const VER = /^\d+(\.\d+){0,3}$/;
const GOH_RANGE = ['keep', 'goh', 'none'];
const ORDER = ['preview.jpg', 'preview.jpeg', 'preview.png', 'preview.gif'];   // the first one there wins (share routes previewState)
const INFO_ITEMS = ['info', 'range', 'name', 'desc', 'version', 'preview'];
const share = () => require('../../share/routes');
// game parity: the task's game (draft.game, c.game, opt.game, else ctx.task.id, else ctx.gameId as a string or a function), and the
// route ctx the Share page routes get for it (gameId() exe() kind() gohDir() curDir() answer for that game: lib/game.js routeCtx)
const GM = require('../../../../lib/games');
function gidOf(ctx, x) {
  let v = x;
  if (!v && ctx && ctx.task && ctx.task.id) v = ctx.task.id;
  if (!v && ctx) { try { v = typeof ctx.gameId === 'function' ? ctx.gameId() : ctx.gameId; } catch (e) { v = null; } }
  return GM.idOf(v) || 'as64';
}
function shareCtx(ctx, gid) {
  if (ctx && typeof ctx.routeCtx === 'function' && ctx.task && ctx.task.id === gid) return ctx.routeCtx();
  try { const TG = require('../lib/game'); return TG.routeCtx(ctx || {}, TG.of(ctx || {}, gid)); } catch (e) { /* no task game lib: plain functions */ }
  return Object.assign({}, ctx, { gameId: () => gid, exe: () => GM.exeOf(gid), kind: () => GM.kindOf(gid) });
}
// MoW:AS2 (3.262) loads a legacy mod only: its data version must lie in [Min, Max]; an Enhanced range (Min 3.301) never loads there
// (VFS-48, modweb vfs/modinfo:7)
function refuseRange(i, gid) {
  if (gid === 'mowas2' && i.range === 'enhanced') return 'MoW:AS2 does not load a mod with the Enhanced range (MinGameVersion 3.301 is newer than its 3.262, VFS-48). Pick Classic (the 3.262 rules) or keep the range the mod has.';
  return null;
}

// gid: the task's game; on GoH the range comes from range_goh (keep | goh: the exe's own version as Min, open Max | none)
function inputs(v, draft, gid) {
  const s = x => String(x == null ? '' : x).trim();
  const pa = draft && draft.answers && draft.answers.preview;
  const pic = pa && pa.src === 'file' && Array.isArray(pa.staged) && pa.staged.length ? String(pa.staged[0]) : '';
  const card = v('card') || {};
  const r = {
    mod: s(draft && draft.mod), name: s(v('name')), desc: String(v('desc') == null ? '' : v('desc')).replace(/\r\n?/g, '\n').trim(),
    range: gid === 'goh' ? (GOH_RANGE.includes(v('range_goh')) ? v('range_goh') : 'keep') : RANGE[v('range')] ? v('range') : 'keep', kind: KINDS.includes(v('version_kind')) ? v('version_kind') : 'minor',
    version: s(v('version')), note: s(v('version_note')), known: s(v('known_name')), pic, deep: v('deep') !== false,
    pack: v('package') === true, ws: v('workshop_copy') === true, out: s(v('out')),
    cardMods: [].concat(card.mods || []).map(s).filter(Boolean).slice(0, 40),
    // the clash check reads the play card's list (asked once): every mod on it but this one
    clash: v('clash') === true, updated: v('updated') === true,
  };
  r.clashWith = r.clash ? r.cardMods.filter(m => m.toLowerCase() !== path.basename(r.mod).toLowerCase()).slice(0, 20) : [];
  return r;
}
// gohMin: the GoH data version of the install (share rangesFor: exe 1.0.6.7 -> 1.067, GHNET-22); an empty line is removed (applyInfo goh)
function fieldsOf(i, gohMin) {
  const f = { Name: i.name, Desc: i.desc };
  if (RANGE[i.range]) Object.assign(f, RANGE[i.range]);
  if (i.range === 'goh') Object.assign(f, { MinGameVersion: String(gohMin || '1.067'), MaxGameVersion: '' });
  if (i.range === 'none') Object.assign(f, { MinGameVersion: '', MaxGameVersion: '' });
  return f;
}
function refuseInfo(i) {
  if (!i.name) return 'Type the name of the mod.';
  if (i.kind === 'set' && !VER.test(i.version)) return 'The version must be numbers with dots, like 1.2.';
  return null;
}
function refuseOut(i) {
  if ((i.pack || i.ws) && !ST.isAbs(i.out)) return 'Pick the folder the package goes into (a full path, for example on your Desktop).';
  return null;
}
// the mods-together check reads mods installed in the game's mods folder by folder name (share/routes.js clashes)
function refuseClash(i, gameDir) {
  if (!i.clashWith.length) return null;
  if (!gameDir) return 'Set the game folder at the top of the page first: the check of mods played together reads its mods folder.';
  const folder = path.basename(i.mod);
  for (const m of [folder].concat(i.clashWith)) {
    if (/[\\/:*?"<>|]/.test(m)) return 'Type mod folder names only, not paths: ' + m;
    if (!fs.existsSync(path.join(gameDir, 'mods', m, 'mod.info'))) return 'The mod ' + m + ' is not installed in the game mods folder, so the check of mods played together cannot read it.';
  }
  return null;
}
// everything the staged mod.info and picture depend on
const sigOf = i => ST.sig(['release', i.mod, i.name, i.desc, i.range, i.kind, i.kind === 'set' ? i.version : '', i.note, i.known, i.pic, i.deep]);

// the release check: new mod.info + picture in staging, the share gate on them and on the mod
async function checkRoute(url, body, ctx) {
  ST.remote(ctx);
  const R = module.exports, d = ST.draftOf(ctx, body, 'release'), gid = gidOf(ctx, d.game);
  ctx = shareCtx(ctx, gid);   // the Share page routes below read the draft's game
  const vals = (await R.values(Object.assign({}, ctx, { mod: d.mod }), null, { game: gid })) || {};
  const i = inputs(ST.getter(d, vals), d, gid), why = refuseInfo(i) || refuseRange(i, gid);
  if (why) throw ST.bad(why);
  if (!ST.isAbs(i.mod) || !fs.existsSync(path.join(i.mod, 'mod.info'))) throw ST.bad('Pick your mod first (a folder with a mod.info).');
  const S = share(), SR = S.routes, mod = i.mod, goh = gid === 'goh';
  // GoH: mod.info as GoH reads it (lower case keys, Tags kept; share applyInfo/readInfo goh) and its own range (rangesFor)
  const gohMin = goh ? ((S._t.rangesFor(ctx).goh || {}).min || '1.067') : '', gopt = goh ? { goh: true } : undefined;
  // JOBS: the Share routes below get this request's ctx, so a tool they start is this request's and the footer's Cancel kills it;
  // after a stop nothing more is asked and nothing is staged
  const info = await SR['POST /api/x/share/info'](null, { mod, fields: fieldsOf(i, gohMin), knownName: i.known }, ctx);   // checks the fields, writes nothing
  if (ST.stopped(ctx)) return Object.assign({}, ST.STOPPED);
  const ver = await SR['POST /api/x/share/version'](null, { mod, kind: i.kind, value: i.version, note: i.note }, ctx);   // the next version, writes nothing
  if (ST.stopped(ctx)) return Object.assign({}, ST.STOPPED);
  const cur = S._t.readInfo(mod, gopt), text = S._t.applyInfo(cur.raw, Object.assign(fieldsOf(i, gohMin), { Version: ver.next }), gopt).text;
  const work = ST.work(ctx, d.id, 'rl-work'), look = path.join(work, path.basename(mod)), pairs = [];
  fs.mkdirSync(look, { recursive: true });
  fs.writeFileSync(path.join(look, 'mod.info'), Buffer.from(text, 'latin1'));
  fs.writeFileSync(path.join(work, 'mod.info'), Buffer.from(text, 'latin1'));
  pairs.push({ from: path.join(work, 'mod.info'), rel: 'mod.info' });
  const have = ORDER.filter(n => fs.existsSync(path.join(mod, n)));
  let pv = '';
  if (i.pic) {
    const src = D.stagedPath(ctx, d.id, i.pic);
    const p = await SR['POST /api/x/share/preview'](null, { mod, from: src }, ctx);
    if (ST.stopped(ctx)) { fs.rmSync(work, { recursive: true, force: true }); return Object.assign({}, ST.STOPPED); }
    if (!p.ok) { fs.rmSync(work, { recursive: true, force: true }); return { ok: false, why: p.why, size: p.size }; }
    pv = 'preview.' + p.kind;
    fs.copyFileSync(src, path.join(look, pv)); fs.copyFileSync(src, path.join(work, pv));
    pairs.push({ from: path.join(work, pv), rel: pv });
  } else if (have.length) fs.copyFileSync(path.join(mod, have[0]), path.join(look, have[0]));
  const real = await SR['POST /api/x/share/gate'](null, { mod, deep: i.deep }, ctx);
  if (ST.stopped(ctx)) { fs.rmSync(work, { recursive: true, force: true }); return Object.assign({}, ST.STOPPED); }
  const lk = await SR['POST /api/x/share/gate'](null, { mod: look, deep: false }, ctx);
  if (ST.stopped(ctx)) { fs.rmSync(work, { recursive: true, force: true }); return Object.assign({}, ST.STOPPED); }
  const items = real.items.map(it => (INFO_ITEMS.includes(it.id) ? lk.items.find(x => x.id === it.id) || it : it));
  const others = have.filter(n => n !== pv);
  if (pv && others.length) items.push({ id: 'previewOld', status: ORDER.indexOf(others[0]) < ORDER.indexOf(pv) ? 'fail' : 'warn', detail: others.join(', ') });
  const fails = items.filter(x => x.status === 'fail').length, warns = items.filter(x => x.status === 'warn').length;
  const map = ST.stage(ctx, d.id, 'rl', pairs, mod, { sig: sigOf(i), ready: !fails, fails, next: ver.next, old: ver.old, noteText: ver.noteText });
  fs.rmSync(work, { recursive: true, force: true });
  return { ok: true, sig: map.sig, ready: !fails, fails, warns, items, next: ver.next, old: ver.old, noteText: ver.noteText, nameChanged: !!info.nameChanged, warn: info.warn || [], changes: (info.changes || []).concat(ver.next !== ver.old ? [{ key: 'Version', from: ver.old, to: ver.next }] : []), files: map.files.length };
}

// the Workshop takes a preview under 1 MB: refused at the upload, with what to do
const PREVIEW_MAX = 1024 * 1024;
function previewCheck(f) { return f && f.size >= PREVIEW_MAX ? { key: 'task.release.k.previewBig', params: { kb: Math.ceil(f.size / 1024) } } : null; }

module.exports = {
  id: 'release',
  verbs: ['make'],
  // GoH (game parity 2026-11-23): the Share page routes run their GoH branch (modinfo --goh, packer --goh, check --exe goh) through
  // shareCtx; mod.info is written with the GoH keys and Tags kept, the range is range_goh (the exe's version as Min, open Max:
  // GHNET-22, PORT-46). Every result in game is [T].
  games: ['as64', 'mowas2', 'goh'],
  needs: ['mod'],
  order: 400,
  title: { make: 'task.release.t' },
  test: 'task.release.test',   // the Test step: where to look in the game
  census: 'release',
  // the groups up to the package are essential: the release check must come after the answers it checks, and a "keep all" skip would
  // skip it. The play card and "More checks" (read only, nothing written) come after them and Quick keeps them as they are (steps()
  // asks essential groups first); the clash check reads the card's list, so the card comes first
  groups: [
    { id: 'info', title: 'task.release.g.info', essential: true, q: [
      { id: 'name', kind: 'text', ask: 'task.release.q.name', help: 'task.release.h.name', covers: ['info.name'], limits: { re: '^[^"{}\\\\\\r\\n]{1,200}$' } },
      { id: 'desc', kind: 'text', ask: 'task.release.q.desc', help: 'task.release.h.desc', covers: ['info.desc'], optional: true },
      { id: 'range', kind: 'choice', ask: 'task.release.q.range', help: 'task.release.h.range', covers: ['info.range'], limits: { values: ['keep', 'enhanced', 'classic'], limit: 'VFS-19' }, when: { $game: ['as64', 'mowas2'] } },
      { id: 'range_goh', kind: 'choice', ask: 'task.release.q.range_goh', help: 'task.release.h.range_goh', covers: [], limits: { values: GOH_RANGE, limit: 'GHNET-22' }, when: { $game: ['goh'] } },
      { id: 'version_kind', kind: 'choice', ask: 'task.release.q.version_kind', help: 'task.release.h.version_kind', covers: ['info.version_kind'], limits: { values: KINDS } },
      { id: 'version', kind: 'text', ask: 'task.release.q.version', help: 'task.release.h.version', covers: ['info.version'], limits: { re: '^\\d+(\\.\\d+){0,3}$' }, when: { version_kind: 'set' } },
      { id: 'version_note', kind: 'text', ask: 'task.release.q.version_note', help: 'task.release.h.version_note', covers: ['info.version_note'], optional: true },
      { id: 'known_name', kind: 'text', ask: 'task.release.q.known_name', help: 'task.release.h.known_name', covers: ['info.known_name'], optional: true },
    ] },
    { id: 'picture', title: 'task.release.g.picture', essential: true, q: [
      { id: 'preview', kind: 'file', ask: 'task.release.q.preview', help: 'task.release.h.preview', covers: ['pic.preview'], picker: { sources: ['keep', 'file'], kinds: ['.png', '.jpg', '.jpeg'], check: previewCheck } },
    ] },
    { id: 'gate', title: 'task.release.g.gate', essential: true, q: [
      { id: 'deep', kind: 'yesno', ask: 'task.release.q.deep', help: 'task.release.h.deep', covers: ['gate.deep'] },
      { id: 'gate', kind: 'rel-gate', ask: 'task.release.q.gate', help: 'task.release.h.gate', covers: ['gate.items'] },
    ] },
    { id: 'pack', title: 'task.release.g.pack', essential: true, q: [
      { id: 'package', kind: 'yesno', ask: 'task.release.q.package', help: 'task.release.h.package', covers: ['pack.package'] },
      { id: 'workshop_copy', kind: 'yesno', ask: 'task.release.q.workshop_copy', help: 'task.release.h.workshop_copy', covers: ['pack.workshop_copy'] },
      { id: 'out', kind: 'text', ask: 'task.release.q.out', help: 'task.release.h.out', covers: ['pack.out'], optional: true },
    ] },
    { id: 'card', title: 'task.release.g.card', essential: false, q: [
      { id: 'card', kind: 'rel-card', ask: 'task.release.q.card', help: 'task.release.h.card', covers: ['card.mods'] },
    ] },
    { id: 'more', title: 'task.release.g.more', essential: false, q: [
      { id: 'clash', kind: 'yesno', ask: 'task.release.q.clash_with', help: 'task.release.h.clash_with', covers: ['gate.clashes'] },
      { id: 'updated', kind: 'yesno', ask: 'task.release.q.updated', help: 'task.release.h.updated', covers: ['gate.updated'] },
    ] },
  ],
  kept: [
    ['pack.allow_private', 'no tool step yet: POST /api/x/share/package has no field for it (it always runs packer --package without --allow-private); also not safe to offer a novice: it would ship private files'],
    ['pack.summary', 'no tool step yet: POST /api/x/share/package has no field for it; it lists the paks it made itself'],
    ['up.uploader', 'not safe: installing the uploader writes into the game folder and starting it opens a program (compile.js REFUSED_ROUTES holds share/uploader); the Share page does it after its own confirm'],
    ['up.title', 'no tool step yet: typed in the Workshop uploader window; no tool or route writes it'],
    ['up.tags', 'no tool step yet: picked in the Workshop uploader window; no tool or route writes them'],
    ['up.visibility', 'no tool step yet: picked in the Workshop uploader window; no tool or route writes it'],
    ['up.change_note', 'no tool step yet: pasted in the Workshop uploader window; the task shows the text made from your change note'],
  ],
  checklist: ['task.release.c.list', 'task.release.c.play', 'task.release.c.pack', 'task.release.c.upload', 'task.release.c.card'],
  values: async (ctx, base, opt) => {
    const v = { name: '', desc: '', range: 'keep', range_goh: 'keep', version_kind: 'minor', version: '1.0', version_note: '', known_name: '', preview: '', deep: true, package: true, workshop_copy: false, out: '', card: { mods: [] }, clash: false, updated: false };
    const mod = ctx && ctx.mod;
    if (!mod) return v;
    try {
      const u = new URL('http://127.0.0.1/api/x/share/info?' + new URLSearchParams({ mod }));
      const r = await share().routes['GET /api/x/share/info'](u, null, shareCtx(ctx, gidOf(ctx, opt && opt.game)));
      v.name = r.fields.Name || r.folder; v.desc = r.fields.Desc || ''; v.range = RANGE[r.range] ? r.range : 'keep'; v.range_goh = r.range === 'goh' || r.range === 'none' ? r.range : 'keep';
      v.version = r.fields.Version || '1.0'; v.known_name = r.fileId ? r.fields.Name || '' : ''; v.card = { mods: [r.folder] };
      v.out = path.join(os.homedir(), 'Desktop', r.folder + '_release');
    } catch { /* no mod.info yet: plain defaults */ }
    return v;
  },
  compile: async (draft, c) => {
    const gid = gidOf(c, c.game);
    const i = inputs(c.value, draft, gid), why = refuseInfo(i) || refuseRange(i, gid) || refuseOut(i) || refuseClash(i, c.gameDir);
    if (why) throw ST.bad(why);
    const st = ST.copies(c, 'rl', sigOf(i), 'Release check'), map = st.map;
    if (!map.ready) throw ST.bad('The release check has red lines (' + map.fails + '). Go back to the step "Is the mod ready to share?": each red line has a button that takes you to the fix.');
    // the Share page routes read the task's game (AS64: gameId() 'as64', the folder as before)
    const calls = [], notes = st.notes.slice(), ctx = shareCtx({ game: () => c.gameDir || null }, gid), folder = path.basename(i.mod);
    const outs = [];
    if (i.pack) outs.push(['POST /api/x/share/package', { out: path.join(i.out, 'package') }]);
    if (i.ws) outs.push(['POST /api/x/share/workshop', { out: path.join(i.out, 'workshop'), knownName: i.known }]);
    for (const [route, body] of outs) {
      const oc = await share().routes['POST /api/x/share/outcheck'](null, { mod: i.mod, out: body.out }, ctx);
      if (!oc.ok) throw ST.bad(oc.refused.msg);
      const dest = path.join(body.out, folder);
      if (/workshop$/.test(route) && fs.existsSync(dest) && fs.readdirSync(dest).length) throw ST.bad('The folder ' + dest + ' already has files in it. Pick another folder, or empty it yourself first.');
      calls.push({ route, body });   // compile.js ROUTE_DRY: write false is their dry run (packer --dry; a file list)
    }
    // read only checks (ROUTE_DRY read: they run at Review and at Write alike, nothing is written); your mod is loaded last
    if (i.clashWith.length) { calls.push({ route: 'POST /api/x/share/clashes', body: { mods: i.clashWith.concat([folder]) } }); notes.push('Mods together: ' + i.clashWith.concat([folder]).join(', ') + ' (the last one wins a clash).'); }
    if (i.clash && !i.clashWith.length) notes.push('Mods together: the play card lists no other mod, so there is nothing to check for clashes.');
    if (i.updated) { calls.push({ route: 'POST /api/x/share/updated', body: {} }); notes.push('The game update check takes up to five minutes, at Review and again at Write.'); }
    notes.push('mod.info: version ' + (map.old || 'none') + ' to ' + map.next + '.');
    if (map.noteText) notes.push('Change note for the Workshop uploader: ' + map.noteText.replace(/\n/g, ' / '));
    notes.push('Nothing is uploaded. Upload with the Workshop uploader on the Share page.');
    return { copies: st.copies, calls, notes, result: { version: map.next, note: map.noteText } };
  },
  routes: { 'POST /api/x/task/r/release/check': checkRoute },
  inputs, sigOf, refuseRange, shareCtx, gidOf, fieldsOf,
};
