// recipe "icon", the Gates of Hell branch (game parity 2026-11-23): the buy card (unit_icon + unit_icon_small), the shop card
// (portrait_squad), the soldier portrait and the squad card, made here frame by frame at the GoH size and copied into the mod.
// Kinds, folders, frames and fallback sizes: tools/unitcard/lib/kinds.js GOH (README part 1); the size of the game's own picture of
// that name wins (read from its first frame). Read on the GoH install [V 2026-11-23]: frames are <name>_00.._03 in TGA
// PNG (a .png of the same name wins over the .tga, FMT-04, so a frame the game has as .png is written as .png); some names are an .ebm
// that lists its frames ({bitmap {frame "x_00.tga"} ...}); a game .ebm wins over loose frames (unitcard check UC-EBM), so the mod gets
// its own .ebm naming the new frames. A picked game icon is read (through its .ebm when it has one), scaled and written the same way.
// The damage scheme on GoH is the vehicle view [V 2026-11-23, GHUI-195]: resource/interface/scene/vehicle_view/<set>/body.ebm names
// its picture ({bitmap {Axis 82 156} {Frame "body.tga" 100}}, body.tga 164x312 32-bit on stug3f), damage/<part>.tga + .ebm are white part
// masks the game tints by state (interface.set vehicle_view/colors, GHUI-194), turret.ebm the turret sprite. The set is the vehicle's
// model name [I] (383 of 620 folders are a def name). A picture replaces the body picture at its size; a name with no view gets a copy
// of a picked view's folder (the masks come with it). Every card and view is [T].
// Author: Imperator_Aug (ARSENAL, ia-7ef7859a)
'use strict';
const fs = require('fs'), path = require('path');

const SCENE = 'resource/interface/scene/';
const K = () => require('../../../../unitcard/lib/kinds');
const I = () => require('../../../../unitcard/lib/img');
const art = () => require('../../art/core');
const lc = s => String(s == null ? '' : s).toLowerCase();
// recipe kind -> the unitcard GoH kinds it writes
const KINDS = { icon: ['card', 'small'], shop: ['shop'], portrait: ['portrait'], squad: ['squad'] };
const FOLDER_KIND = { unit_icon: 'icon', unit_icon_small: 'icon', portrait_squad: 'shop', portrait: 'portrait', squad: 'squad', vehicle_view: 'scheme' };
const KIND_FOLDER = { icon: 'unit_icon', shop: 'portrait_squad', portrait: 'portrait', squad: 'squad', scheme: 'vehicle_view' };
const VV = SCENE + 'vehicle_view/';
const PIC = ['.tga', '.png', '.dds'];

const gameG = dir => (dir ? { dir, exe: 'goh', kind: 'goh' } : null);
const viewOf = (dir, mod) => art().view(gameG(dir), mod && fs.existsSync(mod) ? mod : null);
// a GoH picture key -> {dir, name} (any frame, TGA, PNG, DDS or the .ebm), else null
function iconOf(key) {
  const k = lc(key).replace(/\\/g, '/'), v = /^resource\/interface\/scene\/vehicle_view\/([^/]+)\/body\.(tga|png|dds|ebm)$/.exec(k);
  if (v) return { dir: 'vehicle_view', name: v[1] };
  const m = /^resource\/interface\/scene\/(unit_icon|unit_icon_small|squad|portrait_squad|portrait)\/([^/]+?)(?:_0\d)?\.(tga|png|dds|ebm)$/.exec(k);
  return m ? { dir: m[1], name: m[2] } : null;
}
// the .ebm frame list of a key (file names in its folder)
function ebmFrames(V, k) {
  if (!V.has(k)) return [];
  const t = V.readAny(V.get(k)).toString('latin1'), out = [], re = /\{\s*frame\s+"([^"]+)"/gi; let m;
  while ((m = re.exec(t))) out.push(lc(m[1]).replace(/\\/g, '/'));
  return out;
}
// the picture the game shows for frame i of <folder>/<name>: its .ebm frame (that wins), else the loose frame (PNG wins over TGA),
// else frame 0; frames 0 = one file
function frameKey(V, folder, name, i, frames) {
  const base = SCENE + folder + '/';
  if (frames) {
    const ebm = ebmFrames(V, base + name + '.ebm');
    if (ebm.length) { const f = ebm[Math.min(i, ebm.length - 1)], k = f.includes('/') ? 'resource/' + f.replace(/^\/+/, '') : base + f; if (V.has(k)) return k; }
  }
  const stems = frames ? [base + name + '_0' + i, base + name + '_00'] : [base + name];
  for (const s of stems) for (const e of ['.png', '.tga', '.dds']) if (V.has(s + e)) return s + e;
  return null;
}
const decodeKey = (V, k) => I().decode(V.readAny(V.get(k)), k);
// the files a kind writes for a name: [{key, folder, frame, w, h, ext, guessed}] plus the .ebm keys the game has for it
function targets(V, kind, name) {
  const out = [], ebms = [];
  for (const id of KINDS[kind] || []) {
    const k = K().get('goh', id); let w = k.w, h = k.h, guessed = true;
    const first = frameKey(V, k.folder, name, 0, k.frames);
    if (first && first.startsWith(SCENE + k.folder + '/')) { try { const p = decodeKey(V, first); if (p.w && p.h) { w = p.w; h = p.h; guessed = false; } } catch (e) { /* unreadable: the vanilla size */ } }
    const base = SCENE + k.folder + '/', files = [];
    for (let i = 0; i < (k.frames || 1); i++) {
      const stem = base + name + (k.frames ? '_0' + i : '');
      const ext = V.has(stem + '.png') ? '.png' : '.tga';
      files.push({ key: stem + ext, folder: k.folder, frame: k.frames ? i : null, w, h, ext, guessed });
    }
    out.push(...files);
    if (k.frames && V.has(base + name + '.ebm')) ebms.push({ key: base + name + '.ebm', files: files.map(f => f.key.slice(base.length)) });
  }
  return { files: out, ebms };
}
function ebmText(files) { return Buffer.from(['{bitmap'].concat(files.map(f => '    {frame "' + f + '"}'), ['}', '']).join('\r\n'), 'latin1'); }

// lookup "iconname" on GoH: the names that have a picture of the kind (in = kind_goh), the typed words first as a new name
function lookName(ctx, dir, words, opt, NAME_RE) {
  const kind = KIND_FOLDER[opt && opt.in] ? opt.in : 'icon', d = SCENE + KIND_FOLDER[kind] + '/', w = lc(words).trim(), out = [], seen = new Set();
  if (dir) {
    const V = viewOf(dir, opt && opt.mod);
    for (const k of V.keys()) {
      if (!k.startsWith(d)) continue;
      const ic = iconOf(k); if (!ic || ic.dir !== KIND_FOLDER[kind] || seen.has(ic.name) || (w && !ic.name.includes(w))) continue;
      seen.add(ic.name);
      out.push({ id: ic.name, name: ic.name, where: V.m.has(k) ? 'mod' : 'game', ref: { key: k }, sub: 'has a picture: yours replaces it' });
    }
  }
  out.sort((a, b) => a.name.length - b.name.length || (a.name < b.name ? -1 : 1));
  const exact = seen.has(w);
  if (w && NAME_RE.test(w) && !exact) out.unshift({ id: w, name: w, where: 'new', ref: null, sub: 'a new name: no picture has it yet' });
  return { results: out.slice(0, 400), exact };
}
// lookup "icon" on GoH: the card pictures of the game and the mod (one row per folder and name)
function lookIcon(ctx, dir, words, opt) {
  if (!dir) return [];
  const V = viewOf(dir, opt && opt.mod), ws = lc(words).split(/[\s,]+/).filter(Boolean), out = [], seen = new Set();
  for (const k of V.keys()) {
    if (!k.startsWith(SCENE)) continue;
    const ic = iconOf(k); if (!ic || seen.has(ic.dir + '/' + ic.name)) continue;
    if (ws.length && !ws.every(w => k.includes(w))) continue;
    seen.add(ic.dir + '/' + ic.name);
    out.push({ id: k, name: ic.name, where: ic.dir, ref: { key: k }, sub: V.m.has(k) ? 'mod' : 'game' });
  }
  return out.sort((a, b) => a.name.length - b.name.length || (a.name < b.name ? -1 : 1)).slice(0, 400);
}

// the body picture of a vehicle view: the file its body.ebm names (a frame in its folder, or a /interface/.. path), else a loose body
// picture; null when the view is not there
function bodyOf(V, name) {
  const d = VV + name + '/', e = d + 'body.ebm';
  if (V.has(e)) {
    const m = /\{\s*frame\s+"([^"]+)"/i.exec(V.readAny(V.get(e)).toString('latin1'));
    if (m) { const f = lc(m[1]).replace(/\\/g, '/'), k = f.includes('/') ? 'resource/' + f.replace(/^\/+/, '') : d + f; if (V.has(k)) return k; }
  }
  for (const x of ['.png', '.tga']) if (V.has(d + 'body' + x)) return d + 'body' + x;
  return null;
}
const viewFiles = (V, name) => [...V.keys()].filter(k => k.startsWith(VV + name + '/'));
// the damage view (kind scheme): a: the picture answer, iq its question
function scheme(c, H, V, name, a, iq) {
  const copies = [], notes = [], to = VV + name + '/';
  let pic = null, from = null;
  if (a && a.src === 'file') {
    const f = [].concat(c.value(iq) || [])[0];
    if (!f || !fs.existsSync(f)) throw H.bad('The picture you brought is gone from the staging folder. Bring it again.');
    try { pic = I().decode(fs.readFileSync(f), f); } catch (e) { throw H.bad('The picture ' + path.basename(f) + ' cannot be read (' + e.message + '). Save it as PNG and bring it again.'); }
  } else if (a && a.src === 'exist') {
    const ic = iconOf(String(a.value || ''));
    if (!ic || ic.dir !== 'vehicle_view') throw H.bad('Pick a damage view of the game (vehicle_view/<vehicle>/body), or bring a PNG picture.');
    from = ic.name;
  }
  const has = bodyOf(V, name);
  // a name with no view: the folder of a picked view, else of the unit the task starts from, is copied (its part masks come with it)
  if (!has && !from) { const b = lc(c.base && c.base.id).replace(/\\/g, '/').replace(/\.def$/, ''), bn = b.slice(b.lastIndexOf('/') + 1); if (bn && bn !== name && bodyOf(V, bn)) from = bn; }
  if (from === name) throw H.bad('The damage view would stay as it is: bring a new picture or pick another view.');
  if (!has && !from) throw H.bad('Gates of Hell has no damage view named ' + name + ' (' + to + 'body.ebm). Pick the view of a game vehicle to copy (its part masks come with it), or make the view of a vehicle that has one.');
  if (from) {
    if (!bodyOf(V, from)) throw H.bad('Gates of Hell has no damage view named ' + from + '.');
    for (const k of viewFiles(V, from)) copies.push({ key: k, to: to + k.slice((VV + from + '/').length) });
    notes.push('The damage view of ' + from + ' (' + copies.length + ' files: the body picture, the part masks under damage/ and the turret sprite) is copied as ' + to + '. The masks keep the outline of ' + from + ' [T].');
  }
  if (pic) {
    const src = bodyOf(V, from || name);
    if (!src.startsWith(VV + (from || name) + '/')) throw H.bad('The body picture of ' + (from || name) + ' is ' + src + ', shared with other views; this task does not replace a shared picture.');
    const rel = src.slice((VV + (from || name) + '/').length), key = to + rel;
    let w = 164, h = 312; try { const p = I().decode(V.readAny(V.get(src)), src); if (p.w && p.h) { w = p.w; h = p.h; } } catch (e) { /* the stock size */ }
    const q = pic.w === w && pic.h === h ? pic : I().resize(pic, w, h), png = /\.png$/.test(key), buf = png ? I().png(q) : I().tga(q);
    if (!/\.(tga|png)$/.test(key)) throw H.bad('The body picture of ' + (from || name) + ' is ' + rel + '; this task writes TGA or PNG only.');
    const st = 'icon/vehicle_view/' + name + '/' + rel, out = path.join(c.staging, ...st.split('/'));
    fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, buf);
    const at = copies.findIndex(x => x.to === key);
    if (at >= 0) copies.splice(at, 1);
    copies.push({ staged: st, to: key });
    notes.push('Your picture is scaled to ' + w + 'x' + h + ' (the size of the body picture) and saved as ' + key + '. The part masks under damage/ stay: keep the vehicle where the old picture has it, or the damage marks miss it [T].');
  }
  notes.push('Gates of Hell finds the view by the vehicle\'s model name [I]: a vehicle whose model is ' + name + ' shows it while selected [T].');
  return { copies, notes, result: name };
}

// compile on GoH. H: the recipe's helpers {bad, badK, NAME_RE}
function compile(draft, c, H) {
  const dir = c.gameDir;
  if (!dir) throw H.badK('task.icon.e.nogoh', 'Set the Gates of Hell folder first (the Game folder button at the top): the task reads the game\'s pictures and sizes.');
  const kind = String(c.value('kind_goh') || c.value('kind') || 'icon');
  if (!KINDS[kind] && kind !== 'scheme') throw H.bad('Pick which picture to make.');
  const name = lc(c.value('name_goh') || c.value('name'));
  if (!H.NAME_RE.test(name)) throw H.bad('Type the icon name: usually the unit name, small English letters, digits, _ and brackets.');
  const iq = c.verb === 'change' ? 'newimage' : 'image', a = c.answer(iq), copies = [], notes = [];
  if (c.verb === 'change' && (!a || a.src === 'keep')) throw H.bad('Bring the new picture, or pick another icon of the game: a change needs a new picture.');
  if (kind === 'scheme') return scheme(c, H, viewOf(dir, c.mod), name, a, iq);
  const V = viewOf(dir, c.mod), T = targets(V, kind, name);
  // the picture each target frame is made from: fromFrame(t) -> {w, h, d} or null
  let fromFrame = null;
  const own = f => { let p; try { p = I().decode(fs.readFileSync(f), f); } catch (e) { throw H.bad('The picture ' + path.basename(f) + ' cannot be read (' + e.message + '). Save it as PNG and bring it again.'); } return () => p; };
  if (a && a.src === 'file') {
    const f = [].concat(c.value(iq) || [])[0];
    if (!f || !fs.existsSync(f)) throw H.bad('The picture you brought is gone from the staging folder. Bring it again.');
    fromFrame = own(f);
    notes.push('Your picture is scaled to the game size of each frame here and used for every frame: ' + [...new Set(T.files.map(t => t.folder + ' ' + t.w + 'x' + t.h))].join(', ') + ' (the size of the game\'s own picture of that name wins when there is one).');
  } else {
    const picked = a && a.src === 'exist' ? String(a.value || '') : '';
    const onDisk = picked && /\.(png|tga)$/i.test(picked) && c.mod ? path.join(c.mod, ...lc(picked).replace(/\\/g, '/').split('/')) : null;
    if (onDisk && fs.existsSync(onDisk) && !iconOf(picked)) fromFrame = own(onDisk);
    else {
      const fromBase = lc(c.base && c.base.id).replace(/\\/g, '/').replace(/\.def$/, ''), baseName = fromBase.slice(fromBase.lastIndexOf('/') + 1);
      const ic = picked ? iconOf(picked) : (baseName ? { dir: null, name: baseName } : null);
      if (!ic) throw H.bad('Bring a PNG picture or pick an icon of the game.');
      if (ic.dir && FOLDER_KIND[ic.dir] !== kind) throw H.bad('That picture is a ' + ic.dir + ' icon; pick a picture of the same kind, or bring a PNG and it is scaled to the game size.');
      if (ic.name === name) throw H.bad('The icon would stay as it is: bring a new picture or pick another one from the game.');
      const memo = new Map();
      fromFrame = t => {
        const k = frameKey(V, t.folder, ic.name, t.frame || 0, t.frame != null ? 4 : 0);
        if (!k) return null;
        if (!memo.has(k)) memo.set(k, decodeKey(V, k));
        return memo.get(k);
      };
    }
  }
  const made = [];
  for (const t of T.files) {
    const p = fromFrame(t);
    if (!p) { notes.push('No picture for ' + t.key + ' in the game: it is left out.'); continue; }
    const q = p.w === t.w && p.h === t.h ? p : I().resize(p, t.w, t.h), buf = t.ext === '.png' ? I().png(q) : I().tga(q);
    const rel = 'icon/' + t.key.slice(SCENE.length);
    const out = path.join(c.staging, ...rel.split('/'));
    fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, buf);
    copies.push({ staged: rel, to: t.key }); made.push(t.key);
    if (t.ext === '.png') notes.push(t.key + ' is written as PNG: the game has a .png of that name, and a .png wins over a .tga (FMT-04).');
  }
  if (!copies.length) throw H.bad('The game has no ' + kind + ' picture to copy from. Bring a PNG or pick another icon.');
  for (const e of T.ebms) {
    const rel = 'icon/' + e.key.slice(SCENE.length), out = path.join(c.staging, ...rel.split('/'));
    fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, ebmText(e.files));
    copies.push({ staged: rel, to: e.key });
    notes.push('The game has ' + e.key + ', which wins over loose frames: your mod gets its own .ebm that names the new frames.');
  }
  if (!T.files.some(t => V.g.has(t.key) || V.g.has(t.key.replace(/\.(tga|png)$/, '.png')) || V.g.has(t.key.replace(/\.(tga|png)$/, '.tga'))) && !T.ebms.length) notes.push('The game has no ' + kind + ' picture named ' + name + ': a new icon at the vanilla GoH size. Only a unit (or squad) named ' + name + ' shows it.');
  else notes.push('This replaces the game\'s ' + kind + ' picture ' + name + ' in your mod: every card that shows ' + name + ' shows your picture while the mod is on [T].');
  return { copies, notes, result: name };
}

module.exports = { KINDS, iconOf, frameKey, targets, ebmText, lookName, lookIcon, compile, viewOf, bodyOf };
