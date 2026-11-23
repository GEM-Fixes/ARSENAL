// GUI-EXT art: "Look and sound" page. Textures (camo), sounds, icons, portraits, models. Reads the game, writes only into the mod folder the user picked.
// Author: Imperator_Aug (ARSENAL, ia-61291595)
const fs = require('fs'), path = require('path');
const C = require('./core');
const L = require('./lang');
const SCRIPT = require('./script');
const explain = require('../../../lib/explain');

const q = (u, k) => u.searchParams.get(k) || '';
// the game of the request (game parity): AS64 (or a server with no game words) = the AS2 folder as a string, as before;
// MoW:AS2 = {dir: the same AS2 install, exe: 'mowas_2'} (the vfs then leaves out as64/core); GoH = {dir: the GoH install
// (ctx.curDir), exe: 'goh', kind: 'goh'} (the page's AS2 folder override ?game= / body.game is not the GoH folder: ignored there)
const gid = ctx => (ctx && typeof ctx.gameId === 'function' ? ctx.gameId() : 'as64');
function gdir(ctx, u, body) {
  if (gid(ctx) === 'goh') {
    const d = typeof ctx.curDir === 'function' ? ctx.curDir() : null;
    if (!d) throw C.bad('The Gates of Hell folder was not found. Set it with "Game folder" at the top of the page.');
    return { dir: d, exe: 'goh', kind: 'goh' };
  }
  const o = (body && body.game) || (u && q(u, 'game'));
  let g = o && typeof o === 'string' && fs.existsSync(o) && fs.statSync(o).isDirectory() ? o : null;
  if (!g) g = ctx.game();
  if (!g) throw C.bad('The game folder is not set. Use "Game folder" at the top of the page.');
  return gid(ctx) === 'as64' ? g : { dir: g, exe: ctx.exe(), kind: 'as2' };
}
const dirOfG = g => (typeof g === 'string' ? g : g.dir);
const exeArgs = g => (typeof g === 'string' || !g.exe ? [] : ['--exe', g.exe]);   // AS64: the argument list stays as it was
function card(code) { try { const c = explain.explain(code); return { what: c.what, why: c.why, fix: (c.fix || []).slice(0, 4), tag: c.tag }; } catch (e) { return null; } }

// JOBS: a request stopped from the footer: returned right after a cancelled ctx.runTool (the dispatcher answers 499 whatever comes
// back), so a killed tool is never shown as a failed check or conversion. writes(ctx): the footer asks twice before stopping.
const STOPPED = { cancelled: true };
const writes = ctx => { if (ctx && ctx.job) ctx.job.writes = true; };
async function runCheck(ctx, game, mod) {
  const tools = [], rows = [], notes = [];
  // binhdr: file headers (meshes, animations, textures, volumes) of the files this mod provides
  const a = await ctx.runTool('binhdr', 'binhdr/binhdr.js', [dirOfG(game), '--folder', mod, '--format', 'json'].concat(exeArgs(game)), { timeoutMs: 170000 });
  if (a.cancelled) return STOPPED;
  let j = null; try { j = JSON.parse(a.stdout); } catch (e) { /* not json */ }
  if (j) { tools.push({ tool: 'binhdr', ok: true, n: j.total || 0 }); for (const f of j.findings || []) rows.push({ tool: 'binhdr', code: f.code, file: f.file, line: f.line, msg: f.msg }); }
  else tools.push({ tool: 'binhdr', ok: false, note: (a.timedOut ? 'timed out' : (a.stderr || a.stdout || 'no output').slice(0, 300)) });
  // expcheck: limits of the 3ds Max exporter
  const b = await ctx.runTool('expcheck', 'expcheck/expcheck.js', [mod, '--game', dirOfG(game)].concat(exeArgs(game)), { timeoutMs: 170000 });
  if (b.cancelled) return STOPPED;
  if (b.code === 0 || b.code === 1) {
    tools.push({ tool: 'expcheck', ok: true });
    for (const ln of String(b.stdout).split(/\r?\n/)) { const m = /^(?!info:)(.+?)(?::(\d+))?: ([A-Z][A-Z0-9_]+) (.*)$/.exec(ln); if (m) rows.push({ tool: 'expcheck', code: m[3], file: m[1], line: +m[2] || 0, msg: m[4] }); }
  } else tools.push({ tool: 'expcheck', ok: false, note: (b.timedOut ? 'timed out' : (b.stderr || b.stdout || 'no output').slice(0, 300)) });
  // assetsame compares the AS2 and GoH installs, not a mod: not run here
  notes.push('assetsame');
  const own = C.strayImages(game, mod);
  const byCode = new Map();
  for (const r of rows) { let g = byCode.get(r.code); if (!g) byCode.set(r.code, g = { code: r.code, tool: r.tool, n: 0, samples: [], card: card(r.code) }); g.n++; if (g.samples.length < 4) g.samples.push((r.file || '') + (r.line ? ':' + r.line : '')); }
  return { mod, tools, groups: [...byCode.values()].sort((x, y) => y.n - x.n), stray: own.stray, headers: own.headers, notes, total: rows.length + own.stray.length + own.headers.length };
}

// CACHE (gui README contract 1): a route that reads the mod folder first awaits the shared walk of the mod (lib/modtree ensure: its
// last scan when young, else one async scan every page shares), so core.js takes the file list from it and walks nothing itself; a
// route that wrote into the mod touches the walk afterwards (the next ensure reads the folder again). A preview (dry, plan) writes
// nothing and touches nothing.
const MT = require('../../../lib/modtree');
const modOfReq = (u, b) => (b && typeof b.mod === 'string' && b.mod) || (u && u.searchParams && u.searchParams.get('mod')) || '';
function withMod(fn, writesMod) {
  return async (u, b, ctx) => {
    const mt = (ctx && ctx.modtree) || MT, mod = modOfReq(u, b);
    let dir = '', done = null, T = null;
    if (mod) { try { dir = path.resolve(mod); if (fs.statSync(dir).isDirectory()) { T = await mt.ensure(dir); done = C.useScan(dir, T); } else dir = ''; } catch (e) { dir = ''; T = null; } }
    try { return await fn(u, b, ctx, T, dir); } finally { if (done) done(); if (writesMod && dir && !(b && (b.dry || b.plan))) { try { mt.touch(dir); } catch (e) { /* nothing kept */ } } }
  };
}
// the two list routes (names for the search boxes, the mod's asset list) made the same answer again on every call. The answer
// is a function of the game's view (one object until the game's files move, lib/gameview) and of the mod's files (the scan's
// 'all' signature: name, size and time of every file), so it is kept under those two; a mod that could not be scanned is read
// each time, as before.
const KEPT = new WeakMap(), NO_VIEW = {};
function kept(view, key, make) {
  let m = KEPT.get(view || NO_VIEW); if (!m) KEPT.set(view || NO_VIEW, m = new Map());
  if (m.has(key)) return m.get(key);
  const r = make();
  if (m.size >= 6) m.clear();
  m.set(key, r);
  return r;
}
const READS_MOD = ['GET /api/x/art/names', 'GET /api/x/art/unit', 'GET /api/x/art/camo', 'POST /api/x/art/check', 'GET /api/x/art/icons', 'GET /api/x/art/assets'];
const WRITES_MOD = ['POST /api/x/art/copy', 'POST /api/x/art/camo-write', 'POST /api/x/art/wav-convert', 'POST /api/x/art/icon-png'];

module.exports = {
  id: 'art', nav: 'art.nav', adv: false, after: 'models',
  script: SCRIPT, lang: L, commands: {},
  routes: {
    'GET /api/x/art/names': async (u, b, ctx, T, dir) => {   // the search boxes' index (searchKit)
      const g = gdir(ctx, u), mod = q(u, 'mod') || '';
      if (mod && !(T && dir)) return C.names(g, mod);
      return kept(C.game(g), 'names|' + (mod ? dir + '|' + T.all : ''), () => C.names(g, mod));
    },
    'GET /api/x/art/unit':async (u, b, ctx) => C.unitFiles(gdir(ctx, u), q(u, 'mod') || '', q(u, 'name')),
    'POST /api/x/art/copy': async (u, b, ctx) => { b = b || {}; const g = gdir(ctx, u, b); return b.dry ? Object.assign(C.copyPlan(g, b.mod, b.keys, !!b.overwrite), { dry: true }) : (writes(ctx), C.copyDo)(g, b.mod, b.keys, !!b.overwrite); },
    'GET /api/x/art/camo': async (u, b, ctx) => C.camoInfo(gdir(ctx, u), q(u, 'mod') || '', q(u, 'name')),
    'POST /api/x/art/camo-write': async (u, b, ctx) => { b = b || {}; const g = gdir(ctx, u, b); if (b.dry) { const p = C.camoPlan(g, b.mod, b.name, b.option, b.variant); return Object.assign({ dry: true, how: p.how, line: p.line, def: p.def, dest: p.dest, variantFileFound: p.variantFileFound, text: p.text.length < 30000 ? p.text : '' }, p.game ? { game: p.game } : {}); } writes(ctx); const p = C.camoDo(g, b.mod, b.name, b.option, b.variant); return Object.assign({ dry: false, written: p.written, how: p.how, line: p.line, def: p.def, dest: p.dest, variantFileFound: p.variantFileFound }, p.game ? { game: p.game } : {}); },
    'POST /api/x/art/check': async (u, b, ctx) => { b = b || {}; const g = gdir(ctx, u, b); return runCheck(ctx, g, C.modDir(b.mod, g, false)); },
    'GET /api/x/art/sound': async (u, b, ctx) => C.soundOf(gdir(ctx, u), q(u, 'weapon')),
    'GET /api/x/art/wav': async (u, b, ctx) => {
      const p = q(u, 'path'), mod = q(u, 'mod');
      if (!p || !/\.(wav|ogg|mp3|flac)$/i.test(p)) throw C.bad('Pick a sound file (.wav).');
      let file = path.isAbsolute(p) ? p : mod ? path.join(C.modDir(mod, gdir(ctx, u), false), p) : '';
      if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) throw C.bad('That file does not exist.');
      if (fs.statSync(file).size > 60e6) throw C.bad('That file is larger than 60 MB.');
      const r = C.wavInfo(fs.readFileSync(file)); r.file = file; return r;
    },
    // a wav the mod (or the GUI upload folder) holds -> PCM16 / IMA ADPCM at a resource/sound path in the mod. plan:true writes nothing.
    // A phone may not call it: remote.js lets no unlisted POST through (default deny), and the route refuses a remote session itself too.
    'POST /api/x/art/wav-convert': async (u, b, ctx) => {
      if (ctx && ctx.session && ctx.session.remote) throw Object.assign(C.bad('View only on this device: convert sounds on the PC.', 403), { key: 'rmt.viewOnly' });
      b = b || {}; const g = gdir(ctx, u, b);
      if (!(b.plan || b.dry)) writes(ctx);
      return C.wavConvert(g, b.mod, { src: b.src, out: b.out, format: b.format, rate: b.rate, overwrite: !!b.overwrite, plan: !!(b.plan || b.dry) }, ctx.tmpRoot);
    },
    'GET /api/x/art/icons': async (u, b, ctx) => C.iconInfo(gdir(ctx, u), q(u, 'mod') || '', q(u, 'name')),
    'POST /api/x/art/icon-png': async (u, b, ctx) => {
      b = b || {}; const g = gdir(ctx, u, b), p = C.pngPlan(g, b.mod, b.name, b.kind, b.png);
      if (b.dry) return { dry: true, targets: p.targets.map(t => ({ key: t.key, size: t.size, guessed: t.guessed, exists: t.exists })) };
      const tmp = path.join(ctx.tmpRoot || require('os').tmpdir(), 'as2gui-art'); fs.mkdirSync(tmp, { recursive: true });
      const done = [], bySize = {};
      writes(ctx);
      for (const t of p.targets) {
        if (!bySize[t.size]) {
          const out = path.join(tmp, 'icon-' + t.size + '-' + Date.now() + '.tga');
          const r = await ctx.runTool('artport', 'artport/artport.js', ['convert', p.png, out, '--size', t.size], { timeoutMs: 60000 });
          // stopped: the icons copied so far stay in the mod (each one a whole file); the half-made picture and the scratch copies go
          if (r.cancelled) { for (const f of Object.values(bySize).concat(out)) { try { fs.unlinkSync(f); } catch (e) { /* not there */ } } return STOPPED; }
          if (r.code !== 0 || !fs.existsSync(out)) throw C.bad('Could not convert the picture: ' + (r.stderr || r.stdout || 'unknown error').slice(0, 300), 500);
          bySize[t.size] = out;
        }
        fs.mkdirSync(path.dirname(t.dest), { recursive: true }); fs.copyFileSync(bySize[t.size], t.dest); done.push(t.key);
      }
      for (const f of Object.values(bySize)) { try { fs.unlinkSync(f); } catch (e) { /* ignore */ } }
      return { dry: false, written: done.length, done };
    },
    'GET /api/x/art/assets': async (u, b, ctx, T, dir) => {
      const g = gdir(ctx, u), mod = q(u, 'mod');
      if (!(mod && T && dir)) return C.assetList(g, mod);
      return kept(null, 'assets|' + dir + '|' + T.all, () => C.assetList(g, mod));
    },
    'GET /api/x/art/blender': async (u, b, ctx) => {
      const r = await ctx.runTool('blen', 'blen/install.js', ['--check'], { timeoutMs: 60000 });
      if (r.cancelled) return STOPPED;
      return { code: r.code, text: String(r.stdout + (r.stderr ? '\n' + r.stderr : '')).slice(0, 4000), found: /^blender:/m.test(r.stdout), enabled: /addon enabled in fresh start: True/.test(r.stdout) };
    },
  },
};
for (const k of READS_MOD) module.exports.routes[k] = withMod(module.exports.routes[k], false);
for (const k of WRITES_MOD) module.exports.routes[k] = withMod(module.exports.routes[k], true);
