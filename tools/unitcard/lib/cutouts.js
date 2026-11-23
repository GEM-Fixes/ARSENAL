// unitcard/cutouts: the layers of a picture class (plate per frame state, frame / border, army mark, class badges, the subject of
// each reference) CUT BY GIMP from the game's (or the mod's) own pictures, kept in a local cache on the user's machine (never the
// repo): %LOCALAPPDATA%\ARSENAL\cutouts\<game>\<kind>\<class>\<army>\ (env ARSENAL_CUTOUTS overrides the root; a mod's own style
// under <root>\mods\<mod name>-<hash>\...). Without GIMP the built-in cutter (lib/layers.js, the per-pixel median) is used, and every
// answer says which one made the layers.
//   Who decides what: lib/layers.js reads the references of the class and says WHERE things are (the badge zones and classes found by
//   pixel-identical regions, the army strip, the class figure every army draws, the frame transforms and the subject numbers); GIMP
//   does the cutting: for each reference the pixels where it differs from three others of its army (layer mode DIFFERENCE, select by
//   colour on black, inverted) grown by 1 px are its subject (saved as subject_<stem>.png) and are cleared from it; the cleared cards
//   are stacked, one stack per frame state, and merged (a pixel comes from the first card that shows the plate there). Where every
//   card covers the plate (the man of the AS2 portrait, the middle of the infantry card) the bottom layer "fill" shows: the built-in
//   push-pull fill (smooth, from the pixels around), as no stock GIMP 3 has an inpaint filter. The frame is the plate's alpha minus the alpha shrunk by 3 px (alpha kept
//   exactly); the army strip a rectangle cut of the plate; each badge a rectangle cut of one card that draws it, per frame state.
//   build(V, k, group, army, opt) -> Promise<set>   opt: { root, force, source: 'game'|'mod', mod, exclude: [stem], tag }
//   load(dir) -> set | null      set: { dir, cutter: 'gimp', gimp, files: { name: path }, index }
//   apply(model, set) -> model    the model's layers replaced by the cutouts (compose and fidelity then use them)
//   dirOf(gid, k, group, army, opt) -> the cache folder
// Hand edits win: index.json keeps the hash of every file written; a file whose hash differs is kept on a rebuild (unless force), and a
// class .xcf edited in GIMP is exported back to its PNG layers by sync() before the layers are used.
// Author: unitcard tool (ARSENAL)
// Author: Imperator_Aug (ARSENAL, ia-632b5b25)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const I = require('./img'), Ly = require('./layers'), Lk = require('./look');
const GIMP = () => require('../../gimp/gimp');

const STACK = 12;            // cards per stack (enough to clear most pixels; more costs GIMP time)
const hash = buf => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
const safe = s => String(s || '').toLowerCase().replace(/[^a-z0-9_.()-]+/g, '_').slice(0, 80) || '_';
function rootOf(opt) {
  if (opt && opt.root) return opt.root;
  if (process.env.ARSENAL_CUTOUTS) return process.env.ARSENAL_CUTOUTS;
  const la = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(la, 'ARSENAL', 'cutouts');
}
function dirOf(gid, k, group, army, opt) {
  opt = opt || {};
  const parts = [rootOf(opt)];
  if (opt.source === 'mod' && opt.mod) parts.push('mods', safe(path.basename(opt.mod)) + '-' + hash(Buffer.from(path.resolve(opt.mod).toLowerCase())).slice(0, 8));
  parts.push(safe(gid), safe(k.id), safe(group), safe(army || 'all'));
  if (opt.tag) parts.push(safe(opt.tag));
  return path.join(...parts);
}
const readIndex = dir => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); } catch (e) { return null; } };
const fileHash = p => { try { return hash(fs.readFileSync(p)); } catch (e) { return null; } };
const bboxOf = (m, W, H) => { let x0 = W, y0 = H, x1 = -1, y1 = -1; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1]; };

// the GIMP steps of one class into folder out (work = scratch for the inputs). The inputs go in as ONE sheet and the outputs come
// out as ONE sheet: a GIMP file load or save is a plug-in call of about 0.3 s, the cutting itself is core work of milliseconds
// (measured: 37 single loads took 11 s); split() cuts the output sheet into the PNG files after the run.
function stepsOf(model, out, work) {
  const W = model.w, H = model.h, nf = Math.max(1, model.frames), b = model.base, N = W * H;
  const all = model._sets || [], step = Math.max(1, all.length / STACK), sets = [];
  for (let i = 0; i < Math.min(STACK, all.length); i++) sets.push(all[Math.floor(i * step)]);
  fs.mkdirSync(work, { recursive: true }); fs.mkdirSync(out, { recursive: true });
  const L = (r, f) => 'r' + r + '_f' + f;
  // the class figure (every army draws it, its soft edge too) and the badge zones are cleared from every card
  const keepOut = new Uint8Array(N);
  const fig = model.generic ? Ly.dilate(model.generic.mask, W, H, 3) : null;
  if (fig) for (let i = 0; i < N; i++) if (fig[i]) keepOut[i] = 1;
  for (const z of model.zones || []) for (let y = z[1]; y < z[1] + z[3]; y++) for (let x = z[0]; x < z[0] + z[2]; x++) keepOut[y * W + x] = 1;
  // the bottom layer "fill": where no card shows the plate, a smooth fill from around it (built-in push-pull: no stock GIMP inpaint)
  // (the fill is taken only from pixels most cards agree on: a pixel half the cards cover is a vehicle more often than plate)
  const hole = new Uint8Array(N); for (let i = 0; i < N; i++) hole[i] = keepOut[i] || model.hidden[i] || (model.conf && model.conf[i] < 0.6) ? 1 : 0;
  // the alpha there: the 90th percentile of the cards of that frame state (shield, corners; the AS2 squad frame 0 is 75% alpha)
  // the fill keeps the per-pixel plate of the class reading wherever some card shows it (the badge zones too: their texture is real);
  // only pixels no card shows clean (hidden, or low agreement) are filled smoothly
  // the class figure is a gap too: the per-pixel plate there is the figure itself (the AS2 portrait man), so it is filled from around
  const gap = new Uint8Array(N); for (let i = 0; i < N; i++) gap[i] = model.hidden[i] || (fig && fig[i]) || (model.conf && model.conf[i] < 0.6) ? 1 : 0;
  const src = new Uint8Array(N); for (let i = 0; i < N; i++) src[i] = gap[i] || (model.frame && model.frame[i]) ? 1 : 0;   // the border is no source (its light edge would bleed in)
  const fillOf = f => { const p = Ly.pushPull(model.bg[f], src); for (let i = 0; i < N; i++) if (src[i] && !gap[i]) for (let ch = 0; ch < 4; ch++) p.d[i * 4 + ch] = model.bg[f].d[i * 4 + ch]; for (let i = 0; i < N; i++) if (gap[i]) { const a = all.map(x => x.f[Math.min(f, x.f.length - 1)].d[i * 4 + 3]).sort((u, v) => u - v); p.d[i * 4 + 3] = a[Math.min(a.length - 1, Math.floor(a.length * 0.9))]; } return p; };
  // input sheet
  const tiles = [], pics = [];
  const add = (name, p) => { tiles.push({ name }); pics.push(p); };
  // the clean plate of lib/look.js when the class reads (no blur, texture copied into the hidden pixels): it IS the plate layer,
  // and its cutouts are the subject layers (the cards are then not stacked)
  const LC = model._look || null;
  const fills = []; for (let f = 0; f < nf; f++) { fills.push(LC ? LC.plate[f] : fillOf(f)); add('fill_' + f, fills[f]); }
  if (LC && LC.roleUsed === 'badge') for (let f = 0; f < nf; f++) add('clean_' + f, LC.clean[f]);
  const lcuts = LC ? sets.map(x => { try { const c = model._lookCut(x.stem); return c && c.box ? c.pic : null; } catch (e) { return null; } }) : [];
  lcuts.forEach((p, r) => { if (p) add('lsub_' + r, p); });
  sets.forEach((x, r) => { for (let f = 0; f < nf; f++) add(L(r, f), x.f[Math.min(f, x.f.length - 1)]); });
  // what the class reading says each card draws over the plate (lib/layers.js D: far from the per-pixel plate), as a selection
  // source next to GIMP's own difference test: a silhouette several cards share (the same rifle on many infantry cards) agrees
  // between those cards, so the difference test alone keeps it in the plate; so does a badge two cards share. Also every pixel far
  // from the fill (the per-pixel plate where cards show it)
  // and, where few cards show the plate, every pixel far from the smooth fill (a card with another plate there stays out)
  const fb = fillOf(b);
  sets.forEach((x, r) => { const D = model._D && model._D[all.indexOf(x)]; if (!D) return; const m = I.blank(W, H), d = x.f[b].d; for (let i = 0; i < N; i++) if (D[i] || Math.hypot(d[i * 4] - fb.d[i * 4], d[i * 4 + 1] - fb.d[i * 4 + 1], d[i * 4 + 2] - fb.d[i * 4 + 2]) > 30 || Math.abs(d[i * 4 + 3] - fb.d[i * 4 + 3]) > 60) m.d[i * 4] = m.d[i * 4 + 1] = m.d[i * 4 + 2] = m.d[i * 4 + 3] = 255; add('m' + r, m); });
  const ko = bboxOf(keepOut, W, H);
  if (ko) { const m = I.blank(W, H); for (let i = 0; i < N; i++) if (keepOut[i]) m.d[i * 4] = m.d[i * 4 + 1] = m.d[i * 4 + 2] = m.d[i * 4 + 3] = 255; add('keepout', m); }
  const badgeSrc = [];
  (model.badges || []).slice(0, 16).forEach((bc, j) => { const fr = all.find(x => x.stem === (bc.users && bc.users[0])); if (!fr) return; badgeSrc.push({ bc, j, fr }); for (let f = 0; f < nf; f++) add('badge' + j + '_' + f + '_src', fr.f[Math.min(f, fr.f.length - 1)]); });
  const cols = Math.max(1, Math.min(tiles.length, Math.floor(4096 / W))), rows = Math.ceil(tiles.length / cols);
  const sheet = I.blank(cols * W, rows * H);
  tiles.forEach((t, i) => { t.x = (i % cols) * W; t.y = Math.floor(i / cols) * H; const p = pics[i]; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s0 = (y * p.w + x) * 4, d0 = ((t.y + y) * sheet.w + t.x + x) * 4; for (let ch = 0; ch < 4; ch++) sheet.d[d0 + ch] = p.d[s0 + ch]; } });
  const inFile = path.join(work, 'in.png'); fs.writeFileSync(inFile, I.png(sheet));
  fs.writeFileSync(path.join(work, 'blank.png'), I.png(I.blank(W, H)));
  const outs = [];   // [{ name (layer), file }]
  const s = [{ op: 'open', file: path.join(work, 'blank.png'), name: 'blank' }, { op: 'atlas', file: inFile, tiles: tiles.map(t => ({ name: t.name, x: t.x, y: t.y })) }, { op: 'remove', name: 'blank' }];
  for (const t of tiles) if (t.name !== 'fill_' + b && !/^r\d+_f/.test(t.name)) s.push({ op: 'hide', name: t.name });
  const n = sets.length;
  if (LC && LC.roleUsed === 'badge') for (let f = 0; f < nf; f++) outs.push({ name: 'clean_' + f, file: 'clean_' + f + '.png' });
  for (let r = 0; r < n; r++) {
    if (lcuts[r]) { s.push({ op: 'use', name: 'lsub_' + r }, { op: 'rename', name: 'subject_' + r }); outs.push({ name: 'subject_' + r, file: 'subject_' + safe(sets[r].stem) + '.png' }); continue; }
    // where this card differs from three others: not (agrees with one of them)
    const others = [1, 2, 3].map(d => (r + d) % n).filter(q => q !== r);
    others.forEach((q, j) => s.push({ op: 'difference', a: L(r, b), b: L(q, b), threshold: 14, mode: j ? 'add' : 'replace' }));
    s.push({ op: 'invert' });
    if (ko) s.push({ op: 'select', by: 'layer', layer: 'keepout', mode: 'add' });
    if (tiles.some(t => t.name === 'm' + r)) s.push({ op: 'select', by: 'layer', layer: 'm' + r, mode: 'add' });
    s.push({ op: 'grow', px: 1 });
    s.push({ op: 'use', name: L(r, b) }, { op: 'cut', name: 'subject_' + r }, { op: 'hide', name: 'subject_' + r });
    outs.push({ name: 'subject_' + r, file: 'subject_' + safe(sets[r].stem) + '.png' });
    for (let f = 0; f < nf; f++) s.push({ op: 'use', name: L(r, f) }, { op: 'clear' });
    s.push({ op: 'none' });
  }
  // one stack per frame state: the cleared cards over the fill
  for (let f = 0; f < nf; f++) {
    for (let g = 0; g < nf; g++) { s.push({ op: g === f ? 'show' : 'hide', name: 'fill_' + g }); for (let r = 0; r < n; r++) s.push({ op: g === f && !LC ? 'show' : 'hide', name: L(r, g) }); }
    for (let g = 0; g < f; g++) s.push({ op: 'hide', name: 'plate_' + g });
    s.push({ op: 'merge', name: 'plate_' + f }); outs.push({ name: 'plate_' + f, file: 'plate_' + f + '.png' });
  }
  // frame / border: the alpha of the plate minus the alpha shrunk by 3 px, alpha kept exactly (no feather, no antialias)
  s.push({ op: 'use', name: 'plate_' + b }, { op: 'select', by: 'alpha' }, { op: 'shrink', px: 3 }, { op: 'invert' }, { op: 'select', by: 'alpha', mode: 'intersect' }, { op: 'cut', name: 'frame' }, { op: 'none' }, { op: 'hide', name: 'frame' });
  outs.push({ name: 'frame', file: 'frame.png' });
  // army mark: the strip that differs between armies, a rectangle cut of the plate, per frame state
  const am = model.armyMask ? bboxOf(model.armyMask, W, H) : null;
  if (am) for (let f = 0; f < nf; f++) { s.push({ op: 'use', name: 'plate_' + f }, { op: 'select', by: 'rect', x: am[0], y: am[1], w: am[2], h: am[3] }, { op: 'cut', name: 'army_' + f }, { op: 'none' }, { op: 'hide', name: 'army_' + f }); outs.push({ name: 'army_' + f, file: 'army_' + f + '.png' }); }
  // class badges: a rectangle cut of one card that draws it, per frame state
  const badges = [];
  for (const { bc, j, fr } of badgeSrc) {
    for (let f = 0; f < nf; f++) {
      const nm = 'badge' + j + '_' + f;
      s.push({ op: 'use', name: nm + '_src' }, { op: 'select', by: 'rect', x: bc.box[0], y: bc.box[1], w: bc.box[2], h: bc.box[3] }, { op: 'cut', name: nm }, { op: 'none' }, { op: 'hide', name: nm }, { op: 'remove', name: nm + '_src' });
      outs.push({ name: nm, file: nm + '.png' });
    }
    badges.push({ id: bc.id, n: j, box: bc.box, users: bc.users.length, from: fr.stem });
  }
  // one output sheet; then the layered file for a person (the cards dropped, the cutouts kept)
  const oc = Math.max(1, Math.min(outs.length, Math.floor(4096 / W))), orow = Math.ceil(outs.length / oc);
  outs.forEach((o, i) => { o.x = (i % oc) * W; o.y = Math.floor(i / oc) * H; });
  s.push({ op: 'pack', file: path.join(work, 'out.png'), w: oc * W, h: orow * H, tiles: outs.map(o => ({ name: o.name, x: o.x, y: o.y })) });
  for (let r = 0; r < n; r++) for (let f = 0; f < nf; f++) s.push({ op: 'remove', name: L(r, f) });
  for (let f = 0; f < nf; f++) s.push({ op: 'remove', name: 'fill_' + f });
  if (ko) s.push({ op: 'remove', name: 'keepout' });
  for (let r = 0; r < n; r++) s.push({ op: 'remove', name: 'm' + r });
  for (const o of outs) s.push({ op: o.name === 'plate_' + b ? 'show' : 'hide', name: o.name });
  s.push({ op: 'xcf', file: path.join(out, 'class.xcf') }, { op: 'close' });
  return { steps: s, refs: sets.map(x => x.stem), badges, army: am, nf, outs, sheet: path.join(work, 'out.png'), W, H, plateAlpha: fills.map(p => { const a = new Uint8Array(N); for (let i = 0; i < N; i++) a[i] = p.d[i * 4 + 3]; return a; }) };
}
// the output sheet of a run into its PNG files
function split(p, out) {
  const sh = I.decode(fs.readFileSync(p.sheet), p.sheet);
  for (const o of p.outs) {
    const q = I.crop(sh, o.x, o.y, p.W, p.H), m = /^plate_(\d+)$/.exec(o.name);
    // GIMP's merge stacks the half-clear card layers (AS2 squad frame 0 is 75% alpha: two such layers give 94%): the plate keeps
    // GIMP's colour and takes the alpha of the class reading
    if (m && p.plateAlpha && p.plateAlpha[+m[1]]) { const a = p.plateAlpha[+m[1]]; for (let i = 0; i < a.length; i++) q.d[i * 4 + 3] = a[i]; }
    fs.writeFileSync(path.join(out, o.file), I.png(q));
  }
}

// build (or reuse) the cutout set of a class. variants: [{ exclude: [stem], tag }] build more sets in the same GIMP process (fidelity)
async function build(V, k, group, army, opt) {
  opt = opt || {};
  const G = GIMP(), st = G.status();
  if (!st.found) return { cutter: 'builtin', why: st.why || 'GIMP not found' };
  const variants = opt.variants || [{ exclude: opt.exclude || [], tag: opt.tag || '' }];
  const jobs = [], plans = [];
  for (const v of variants) {
    const model = Ly.analyse(V, k, group, army, Object.assign({}, opt, { exclude: v.exclude }));
    const dir = dirOf(V.gid, k, group, army, Object.assign({}, opt, { tag: v.tag }));
    if (model.template || !model.bg) { plans.push({ dir, skip: model.notes.slice(-1)[0] || 'no clean layer (template)' }); continue; }
    // the clean class of lib/look.js (not for a fidelity variant that leaves cards out: the look class reads every card)
    if (!(v.exclude || []).length && !opt.builtInPlate) { try { const LC = Lk.classOf(V, k, group, army, { source: opt.source }); if (LC && !LC.none) { model._look = LC; model._lookCut = stem => Lk.cutout(LC, stem, V, k); } } catch (e) { /* the GIMP stack then */ } }
    const old = readIndex(dir);
    if (old && !opt.force && old.gimp === st.version && old.refsKey === refsKey(model)) { plans.push({ dir, reused: true }); continue; }
    const stage = dir + '.new', work = path.join(rootOf(opt), '_work', hash(Buffer.from(dir)));
    fs.rmSync(stage, { recursive: true, force: true });
    const p = stepsOf(model, stage, work);
    jobs.push(...p.steps); plans.push({ dir, stage, work, model, p, old });
  }
  let r = { ok: true, ms: 0, errors: [] };
  if (jobs.length) r = await G.job(jobs, { timeout: opt.timeout || 20 * 60 * 1000, onChild: opt.onChild });
  const res = [];
  for (const pl of plans) {
    if (pl.skip || pl.reused) { res.push(pl.skip ? { dir: pl.dir, cutter: 'builtin', why: pl.skip } : Object.assign(load(pl.dir), { reused: true })); continue; }
    if (!r.ok) { res.push({ dir: pl.dir, cutter: 'builtin', why: 'GIMP failed: ' + r.errors.slice(0, 3).join(' | ') }); continue; }
    try { split(pl.p, pl.stage); } catch (e) { res.push({ dir: pl.dir, cutter: 'builtin', why: 'GIMP gave no output sheet (' + e.message + ')' }); continue; }
    res.push(commit(pl, st, k, group, army, opt));
    fs.rmSync(pl.work, { recursive: true, force: true });
  }
  const out = res.length === 1 && !opt.variants ? res[0] : res;
  if (Array.isArray(out)) out.ms = r.ms; else out.ms = r.ms;
  return out;
}
const CUT_REV = 6;           // bump when the steps change: older sets are rebuilt
const refsKey = m => hash(Buffer.from('r' + CUT_REV + '|' + (m._sets || []).map(s => s.keys.join(',')).join('|') + '|' + m.w + 'x' + m.h + '|' + m.frames));
// move the staged files in; a file the person changed since the last build stays (its hash differs from the index)
function commit(pl, st, k, group, army, opt) {
  const { dir, stage, model, p, old } = pl;
  fs.mkdirSync(dir, { recursive: true });
  const files = {}, kept = [];
  for (const f of fs.readdirSync(stage)) {
    const to = path.join(dir, f), was = old && old.files && old.files[f];
    if (!opt.force && was && fs.existsSync(to) && fileHash(to) !== was.hash) { kept.push(f); files[f] = Object.assign({}, was, { hand: true }); continue; }
    fs.copyFileSync(path.join(stage, f), to);
    files[f] = { hash: fileHash(to), job: f === 'class.xcf' ? 'xcf' : f.split(/[_.]/)[0] };
  }
  fs.rmSync(stage, { recursive: true, force: true });
  const idx = { game: model.gid, kind: k.id, group, army: army || '', source: opt.source || 'game', mod: opt.mod || '', cutter: 'gimp', gimp: st.version, date: new Date().toISOString(),
    refs: p.refs, refsKey: refsKey(model), sources: (model._sets || []).filter(s => p.refs.includes(s.stem)).map(s => ({ stem: s.stem, keys: s.keys, hash: hash(Buffer.concat(s.f.map(x => Buffer.from(x.d)))) })),
    size: model.w + 'x' + model.h, frames: p.nf, base: model.base, badges: p.badges, army: p.army, files, kept };
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(idx, null, 1));
  return load(dir);
}
function load(dir) {
  const idx = readIndex(dir); if (!idx) return null;
  const files = {}; for (const f of Object.keys(idx.files || {})) if (fs.existsSync(path.join(dir, f))) files[f] = path.join(dir, f);
  return { dir, cutter: 'gimp', gimp: idx.gimp, index: idx, files, kept: idx.kept || [] };
}
// a class .xcf the person edited in GIMP: its layers exported back over the PNGs (marked hand-made), before the layers are used
async function sync(dir) {
  const set = load(dir); if (!set || !set.files['class.xcf']) return set;
  const idx = set.index, x = idx.files['class.xcf'];
  if (!x || fileHash(set.files['class.xcf']) === x.hash) return set;
  const names = Object.keys(idx.files).filter(f => /\.png$/.test(f) && !/^subject_/.test(f)).map(f => f.replace(/\.png$/, ''));
  const steps = [{ op: 'open', file: set.files['class.xcf'] }].concat(names.map(nm => ({ op: 'export', file: path.join(dir, nm + '.png'), name: nm }))).concat([{ op: 'close' }]);
  const r = await GIMP().job(steps); if (!r.ok) return Object.assign(set, { syncError: r.errors.join(' | ') });
  for (const nm of names) idx.files[nm + '.png'] = { hash: fileHash(path.join(dir, nm + '.png')), job: 'xcf-export', hand: true };
  idx.files['class.xcf'] = Object.assign({}, x, { hash: fileHash(set.files['class.xcf']), hand: true });
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(idx, null, 1));
  return load(dir);
}
const pic = p => I.decode(fs.readFileSync(p), p);
const cropOf = (p, b) => I.crop(p, b[0], b[1], b[2], b[3]);
// the model's layers from the cutouts
function apply(model, set) {
  if (!set || set.cutter !== 'gimp' || !set.files) return model;
  const W = model.w, H = model.h, N = W * H, nf = Math.max(1, model.frames), F = set.files;
  const plates = []; for (let f = 0; f < nf; f++) { if (!F['plate_' + f + '.png']) return model; const p = pic(F['plate_' + f + '.png']); if (p.w !== W || p.h !== H) return model; plates.push(p); }
  // the class figure (every army draws it, the AS2 portrait man) is cut out of the plates; the game cards do show it, so the
  // background with the figure keeps it from the class reading and the plate without it is the fill under a new subject
  const withFig = plates.map((p, f) => { if (!model.generic) return p; const q = I.copy(p), o = model.bg[Math.min(f, model.bg.length - 1)], m = model.generic.mask; for (let i = 0; i < N; i++) if (m[i]) for (let c = 0; c < 4; c++) q.d[i * 4 + c] = o.d[i * 4 + c]; return q; });
  model.bg = withFig; model.fill = plates; model.hidden = new Uint8Array(N);
  // the frame: GIMP's ring (alpha minus alpha shrunk by 3 px) where every card agrees; a card may draw into the inner rows of the
  // ring (the AS2 infantry rank strip reaches row 3), and the frame is drawn over the subject
  if (F['frame.png']) { const fr = pic(F['frame.png']), was = model.frame; model.frame = new Uint8Array(N); for (let i = 0; i < N; i++) model.frame[i] = fr.d[i * 4 + 3] && (!was || was[i]) ? 1 : 0; }
  if (F['army_' + model.base + '.png']) { const a = pic(F['army_' + model.base + '.png']); model.armyMask = new Uint8Array(N); for (let i = 0; i < N; i++) model.armyMask[i] = a.d[i * 4 + 3] ? 1 : 0; }
  for (const b of set.index.badges || []) {
    const bc = (model.badges || []).find(x => x.id === b.id); if (!bc) continue;
    // GIMP cuts the badge rectangle of one card that draws it; the pixels that are badge (not that card's plate or subject) are
    // the ones the class reading found pixel-identical between its users
    const fr = []; for (let f = 0; f < nf; f++) { const p = F['badge' + b.n + '_' + f + '.png']; if (!p) continue; const q = cropOf(pic(p), b.box), o = bc.frames[Math.min(f, bc.frames.length - 1)]; if (o && o.w === q.w && o.h === q.h) for (let i = 0; i < q.w * q.h; i++) if (!o.d[i * 4 + 3]) q.d[i * 4 + 3] = 0; fr.push(q); }
    if (fr.length === nf) bc.frames = fr;
  }
  model.cutter = 'gimp'; model.cutouts = set.dir;
  model.notes = (model.notes || []).concat(['Layers cut by GIMP ' + (set.gimp || '') + ' (' + set.dir + ')' + (set.kept && set.kept.length ? '; kept your edits of ' + set.kept.join(', ') : '') + '.']);
  return model;
}
// layer thumbnails of a set for the page
function thumbs(set) {
  if (!set || !set.files) return [];
  return Object.keys(set.files).filter(f => /\.png$/.test(f)).sort().slice(0, 80).map(f => { let url = null; try { url = I.dataUrl(pic(set.files[f])); } catch (e) { url = null; } const x = set.index.files[f] || {}; return { name: f.replace(/\.png$/, ''), url, hand: !!x.hand, job: x.job || '' }; });
}
// fidelity on the GIMP cutouts: one GIMP process builds the leave-one-out sets of the tests, then the round trip runs on them
async function fidelity(V, k, group, army, opt) {
  opt = opt || {};
  const all = Ly.pick(V, k, group, opt).filter(x => !army || x.army === army);
  const tests = Ly.spreadOf(all, opt.tests || 4);
  const root = opt.root || path.join(rootOf(opt), '_fidelity');
  const sets = await build(V, k, group, army, Object.assign({}, opt, { root, variants: tests.map(t => ({ exclude: [t.stem], tag: 'loo-' + safe(t.stem) })) }));
  if (!Array.isArray(sets)) return { cutter: 'builtin', why: sets.why };
  const by = new Map(); tests.forEach((t, i) => by.set(t.stem, sets[i]));
  const r = Ly.fidelity(V, k, group, army, Object.assign({}, opt, { post: (m, stem) => apply(m, by.get(stem)) }));
  r.cutter = 'gimp'; r.gimpMs = sets.ms; return r;
}
module.exports = { build, load, apply, sync, thumbs, dirOf, rootOf, fidelity, stepsOf, split };
