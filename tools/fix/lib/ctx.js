// fix ctx: mount the source mod through lib/vfs (loose + packs, same as sdllint/wouldload) and a base without it.
//   const c = open(modDir, gameDir, {deps?}) -> { id, dir, note, list, deps, v, vb, mine(rec), stats(), reason }
//   v = vfs with deps + mod; vb = vfs with deps only (what the mod's files replaced); c.reason set (and v null) when not mounted
//   o.exe = the vfs exe ('as64'|'mowas_2'|'goh', lib/games); none = as before (vfs picks as64 when as64.exe is in the folder). c.exe = the exe used.
//     mowas_2: no as64/core, no as64+ (the lib/vfs mowas_2 exe rule); when the folder holds as64.exe the game is always staged without it, so every tool fix starts on the
//     staged dir (sdllint, keylint, milint, fxlint, refcheck, binhdr, wouldload) sees mowas_2 too. goh: Workshop items of 400750 discovered (vfs).
// Author: Imperator_Aug (ARSENAL, ia-ed609860)
const fs = require('fs'), path = require('path');
const vfs = require('../../lib/vfs'), names = require('../../lib/names'), { readText } = require('../../lib/enc'), sdl = require('../../lib/sdl');
const C = require('../../modmove/lib/common'), { isDirLike } = require('../../lib/dirlike');

const fwd = C.fwd;

// mod.info -> { name, desc, min, max, keys:[[Key,val]] } in file order (legacy and modern share the block form)
function readInfo(dir) {
  const f = path.join(dir, 'mod.info');
  if (!fs.existsSync(f)) return null;
  const r = readText(f, 'cp1251');
  const root = r.fatal ? null : sdl.kids(sdl.parseLines(r.lines, () => {}), 'mod')[0];
  const o = { name: '', desc: '', min: null, max: null };
  if (!root) return o;
  for (const k of root.kids) {
    const n = String(k.name || '').toLowerCase(), v = k.vals.length ? String(k.vals[0].v) : '';
    if (n === 'name') o.name = v; else if (n === 'desc') o.desc = v;
    else if (n === 'mingameversion') o.min = v; else if (n === 'maxgameversion') o.max = v;
    else if (n === 'tags') o.tags = v;   // GoH only (GHVFS-02); AS2 ignores the key
  }
  return o;
}

// mod outside <game>/mods: a temp game dir whose top-level folders are junctions to the real ones (no admin needed), mods/ holds junctions to the
// installed mods plus the given folder. The real game and mod are never written. c.cleanup() removes the junctions (rmdir, never recursive into targets).
// so = { force, dropExe:[lower-case top-level exe names left out] } (mowas_2 on a folder that holds as64.exe)
function stageGame(game, dir, so = {}) {
  const mods = path.join(game, 'mods'), id = names.normalize(path.basename(dir));
  if (!so.force && path.resolve(path.dirname(dir)).toLowerCase() === path.resolve(mods).toLowerCase()) return null;
  const drop = new Set(so.dropExe || []);
  const st = fs.mkdtempSync(path.join(require('os').tmpdir(), 'fixgame-')), made = [];
  const link = (t, l) => { fs.symlinkSync(t, l, 'junction'); made.push(l); };
  const cleanup = () => { for (const l of made.slice().reverse()) { try { fs.rmdirSync(l); } catch { /* ignore */ } } try { fs.rmSync(st, { recursive: true, force: true }); } catch { /* ignore */ } };
  try {
  fs.mkdirSync(path.join(st, 'mods'));
  // top-level files: the data ones (paks, N.pat, info, txt) hardlinked or copied as tools/check overlay() does (REV-TOOLS 2: 0-byte stand-ins made vfs
  // drop localization.pak and 1.pat, so every lng fix was skipped); exes hardlinked else an empty stand-in (vfs only tests that they exist); the rest empty
  const data = [];
  for (const e of fs.readdirSync(game, { withFileTypes: true })) {
    if (e.name.toLowerCase() === 'mods' || drop.has(e.name.toLowerCase())) continue;
    const p = path.join(game, e.name), q = path.join(st, e.name);
    if (isDirLike(e, game)) link(p, q);
    else if (/\.(pak|pat|info|txt)$/i.test(e.name)) { try { fs.linkSync(p, q); } catch { fs.copyFileSync(p, q); } data.push(e.name); }
    else if (/\.exe$/i.test(e.name)) { try { fs.linkSync(p, q); } catch { fs.writeFileSync(q, ''); } }
    else fs.writeFileSync(q, '');
  }
  // self-check: a staged data file that differs in size from the real one means the base would be read short; fail loudly, never "clean"
  const bad = data.filter(n => { try { return fs.statSync(path.join(st, n)).size !== fs.statSync(path.join(game, n)).size; } catch { return true; } });
  if (fs.existsSync(mods)) for (const e of fs.readdirSync(mods, { withFileTypes: true })) {
    if (!isDirLike(e, mods) || names.normalize(e.name) === id) continue;
    link(path.join(mods, e.name), path.join(st, 'mods', e.name));
  }
  link(dir, path.join(st, 'mods', path.basename(dir)));
  return { st, cleanup, bad };
  } catch (e) { cleanup(); throw e; }
}

function open(modDir, gameDir, o = {}) {
  const dir = path.resolve(modDir); let game = path.resolve(gameDir), stage = null;
  const exe = o.exe === 'mowas2' ? 'mowas_2' : o.exe;
  // mowas_2 on the shared AS2 folder: staged without as64.exe, so the tools fix runs on the staged dir pick mowas_2 too (they name no exe)
  const hideAs64 = exe === 'mowas_2' && fs.existsSync(path.join(game, 'as64.exe'));
  let why = 'mod is outside <game>/mods: read through a temporary staged game dir (junctions, nothing written)';
  if (o.stage !== false && fs.existsSync(path.join(dir, 'mod.info'))) {
    stage = stageGame(game, dir, hideAs64 ? { force: true, dropExe: ['as64.exe', 'as64_ed.exe'] } : {});
    if (stage) { game = stage.st; if (hideAs64) why = 'MoW:AS2: read through a temporary staged game dir without as64.exe (junctions, nothing written), so no as64/core and no as64+ are mounted'; }
  }
  try { return openIn(dir, game, stage, Object.assign({}, o, { exe, stageWhy: why })); } catch (e) { if (stage) stage.cleanup(); throw e; }   // a throw must not leave the staged dir behind
}
function openIn(dir, game, stage, o) {
  const c = { id: names.normalize(path.basename(dir)), dir, game, note: stage ? o.stageWhy : '', list: [], deps: [], v: null, vb: null, reason: '', info: readInfo(dir), cleanup: stage ? stage.cleanup : () => {} };
  // exe: as before when none is named (as64.exe in the folder -> as64 with as64+); mowas_2 never plus; goh: Workshop items (400750)
  c.exe = o.exe || null;
  const plus = o.exe ? o.exe === 'as64' && fs.existsSync(path.join(game, 'as64.exe')) : fs.existsSync(path.join(game, 'as64.exe'));
  const found = vfs.discover(game, [], o.exe === 'goh' ? { items: true } : { plus });
  const m = found.get(c.id);
  if (!c.info) { c.reason = 'no mod.info: the engine does not list this folder as a mod'; return c; }
  if (stage && stage.bad.length) { c.reason = 'staging the game dir failed: ' + stage.bad.join(', ') + ' not the same size as the real file (base would be read short)'; return c; }
  if (!m) { c.reason = `${c.id} is not discovered under ${fwd(path.join(game, 'mods'))} (copy or link the mod there; workshop items work too)`; return c; }
  if (!stage && path.resolve(m.dir).toLowerCase() !== dir.toLowerCase()) {
    c.note = `engine mounts ${fwd(m.dir)} for this id, not the folder given: that copy is read`;
    c.dir = path.resolve(m.dir); c.info = readInfo(c.dir) || c.info;
  }
  // Require closure, deps first
  const deps = [], seen = new Set([c.id]);
  const add = list => { for (const r of list) { if (seen.has(r)) continue; seen.add(r); const d = found.get(r); if (!d) { c.reason = `required mod "${r}" is not installed`; continue; } add(d.requires || []); deps.push(r); } };
  if (o.deps) for (const d of o.deps) { if (!seen.has(d)) { seen.add(d); deps.push(d); } }
  else add(m.requires || []);
  if (c.reason) return c;
  const modern = C.verCmp(C.verParse(m.min), C.MODERN_MIN) >= 0 && C.verParse(m.min).length > 0;
  const pre = modern && plus && found.has('as64+') && !deps.includes('as64+') ? ['as64+'] : [];
  c.deps = pre.concat(deps); c.list = c.deps.concat([c.id]);
  const mk = mods => { const v = vfs.build(Object.assign({ gameDir: game, mods, disableVersionControl: true }, o.exe ? { exe: o.exe } : {})); return v; };
  c.v = mk(c.list); c.vb = mk(c.deps);
  if (!c.v.mods.includes(c.id)) {
    const p = c.v.problems.filter(x => /^MOD_/.test(x.code)).map(x => x.code + ' ' + x.msg);
    c.reason = 'vfs did not mount it: ' + (p[0] || 'no reason given'); c.v = null;
  }
  c.mineOf = rec => mineOf(c, rec);
  return c;
}

const mineOf = (c, rec) => !!rec && !rec.deleted && (rec.layer === c.id || String(rec.layer).startsWith(c.id + ' patch '));
function stats(c) {
  let files = 0; const paks = new Set();
  for (const r of c.v.files.values()) if (mineOf(c, r)) { files++; if (r.source === 'pak') paks.add(r.container); }
  // a pak that holds only keys that lost to a later layer still counted via the winners; add every mod pak the mount touched
  for (const s of c.v.shadows) { const r = s.over; if (mineOf(c, r) && r.source === 'pak') paks.add(r.container); }
  return { files, paks: paks.size, pakList: [...paks] };
}

module.exports = { open, mineOf, stats, readInfo, fwd };
