// ext task: outside programs section 5). One entry per program: what it is for, how it is found on this PC (never a
// download), the numbered steps to do there (lang keys task.prog.<id>.*), and what comes back and which reader checks it.
// Routes (server.js wires them):
//   GET  /api/x/task/external?ids=a,b&for=sound,texture  -> {programs: [{id, name, what, for, steps, back, guide, open, found, how,
//        path (PC only), can: {start, file, folder, reveal}}]}  found or not per program on this PC; a phone gets no paths
//   POST /api/x/task/external/open {draft, id, action: start|file|folder|reveal, staged|rel|path, where: mod|staging, plan, token}
//        plan:true = dry: what would open, plus a one time token (5 minutes); start and file then need that token back, so a program
//        opens only after the page's confirm box. PC only. Paths: the draft's staging folder, the picked mod, the registry's own
//        program path; anything else is refused. The game and its editor never start from here (no command opens them for this):
//        the page shows their path and "Show in folder" instead.
// Adding a program = one entry in PROGRAMS plus its lang rows (task.prog.<id>.what, .s1.., .back) in lang.js; nothing else to wire.
// Every start is an argv array, shell:false, detached (lib/platform openPath and revealInFolder for files and folders).
// Author: Imperator_Aug (ARSENAL, ia-e188c640)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const D = require('./lib/draft');

const bad = (m, s) => D.bad(m, s);
// open: exe (start the program, or the file in it) | default (the PC's own program for the file kind) | game (never started here) |
//       cli (a command line tool: steps only) | none (ARSENAL cannot find or start it: steps and the Guides page only)
const OPENS = ['exe', 'default', 'game', 'cli', 'none'];
// file kinds a program is for: the picker kinds (server.js FILE_TYPES) plus the census words skin and icon
const FOR = ['sound', 'texture', 'picture', 'model', 'text', 'video', 'font', 'skin', 'icon', 'any'];
// the upload check per kind is server.js sniff (type from the bytes, wav and picture facts): back.kinds names the picker kinds
const steps = (id, n) => Array.from({ length: n }, (x, i) => 'task.prog.' + id + '.s' + (i + 1));
const pf = (rel) => ['%ProgramFiles%\\' + rel, '%ProgramW6432%\\' + rel, '%ProgramFiles(x86)%\\' + rel];

const PROGRAMS = [
  { id: 'soedit', name: 'SOEdit', for: ['model', 'skin'], open: 'exe', guide: 'SOEdit',
    find: { repo: 'soedit' }, steps: steps('soedit', 4), back: { kinds: ['model'], inMod: true } },
  { id: 'blender-gem2', name: 'Blender (GEM2 Engine Tools)', for: ['model', 'skin'], open: 'exe', guide: 'Blender',
    find: { env: ['BLENDER'], exe: 'blender.exe', reg: [{ key: 'HKLM\\SOFTWARE\\BlenderFoundation', value: 'InstallDir', sub: true }, { key: 'HKCU\\SOFTWARE\\BlenderFoundation', value: 'InstallDir', sub: true }],
      paths: pf('Blender Foundation\\*\\blender.exe').concat(['%LOCALAPPDATA%\\Programs\\Blender Foundation\\*\\blender.exe']), onPath: ['blender.exe'] },
    steps: steps('blender-gem2', 4), back: { kinds: ['model'], inMod: false } },
  { id: '3dsmax-gem', name: '3ds Max (GEM exporter)', for: ['model'], open: 'exe', guide: '3ds Max GEM',
    find: { paths: pf('Autodesk\\*\\3dsmax.exe') }, steps: steps('3dsmax-gem', 2), back: { kinds: ['model'], inMod: false } },
  { id: 'gemimport', name: 'GEMImport, PLY2FBX, DEF2FBX', for: ['model'], open: 'none', guide: 'GEMImport',
    find: {}, steps: steps('gemimport', 3), back: { kinds: ['model'], inMod: false } },
  { id: 'mow-ply-tweaker', name: 'MoW PLY Tweaker', for: ['model', 'skin'], open: 'none', guide: 'PLY Tweaker',
    find: {}, steps: steps('mow-ply-tweaker', 3), back: { kinds: ['model'], inMod: false } },
  { id: 'dds-editor', name: 'DDS image editor', for: ['texture', 'skin', 'picture'], open: 'exe', guide: 'DDS',
    find: { paths: pf('NVIDIA Corporation\\NVIDIA Texture Tools\\nvtt_export.exe').concat(pf('Adobe\\*\\Photoshop.exe'), pf('Paint.NET\\paintdotnet.exe'), pf('GIMP *\\bin\\gimp-*.exe')) },
    steps: steps('dds-editor', 4), back: { kinds: ['texture'], inMod: false } },
  { id: 'texture-batch', name: 'Texture Batch Converter', for: ['texture', 'skin'], open: 'none', guide: 'Texture Batch Converter',
    find: {}, steps: steps('texture-batch', 3), back: { kinds: ['texture'], inMod: false } },
  { id: 'normalmap', name: 'NormalMap Online, Materialize', for: ['texture', 'skin'], open: 'none', guide: 'normal map',
    find: { paths: pf('Materialize\\Materialize.exe') }, steps: steps('normalmap', 4), back: { kinds: ['texture'], inMod: false } },
  { id: 'image-editor', name: 'Image editor (PNG, TGA)', for: ['icon', 'picture', 'texture'], open: 'default', guide: 'icon',
    find: { assoc: '.png' }, steps: steps('image-editor', 3), back: { kinds: ['picture'], inMod: false } },
  { id: 'icon-editor', name: 'Icon Editor', for: ['icon'], open: 'none', guide: 'Icon Editor',
    find: {}, steps: steps('icon-editor', 2), back: { kinds: ['picture'], inMod: false } },
  { id: 'audacity', name: 'Audacity', for: ['sound'], open: 'exe', guide: 'Audacity',
    find: { paths: pf('Audacity\\Audacity.exe'), onPath: ['audacity.exe'] }, steps: steps('audacity', 3), back: { kinds: ['sound'], inMod: false } },
  { id: 'ffmpeg', name: 'ffmpeg', for: ['sound', 'video'], open: 'cli', guide: 'ffmpeg',
    find: { onPath: ['ffmpeg.exe'], paths: pf('ffmpeg\\bin\\ffmpeg.exe') }, steps: steps('ffmpeg', 3), back: { kinds: ['sound'], inMod: false } },
  { id: 'notepadpp', name: 'Notepad++ (ARSENAL pack)', for: ['text', 'skin', 'icon', 'sound', 'model'], open: 'exe', guide: 'Notepad++',
    find: { exe: 'notepad++.exe', appPath: 'notepad++.exe', reg: [{ key: 'HKLM\\SOFTWARE\\Notepad++', value: '' }], paths: pf('Notepad++\\notepad++.exe') },
    steps: steps('notepadpp', 3), back: { kinds: ['text'], inMod: true } },
  // game parity: the editor of the draft's game; GoH's lives in the GoH install (binaries/x64/call_to_arms_ed.exe [V on the install])
  { id: 'game-editor', name: 'Game editor (as64_ed, mowas_2_ed, call_to_arms_ed)', for: ['model', 'skin'], open: 'game', guide: 'editor',
    find: { game: { as64: 'as64_ed.exe', mowas2: 'mowas_2_ed.exe', goh: 'binaries/x64/call_to_arms_ed.exe' } }, steps: steps('game-editor', 3),
    // GoH: the editor sits in binaries/x64 and ARSENAL never writes into the GoH install, so the mod is put where GoH reads it by hand
    stepsFor: { goh: ['task.prog.game-editor.goh.s1', 'task.prog.game-editor.s2', 'task.prog.game-editor.s3'] }, back: { kinds: [], inMod: true } },
  { id: 'video-player', name: 'Video player', for: ['video'], open: 'default', guide: 'video',
    find: { assoc: '.avi' }, steps: steps('video-player', 2), back: { kinds: ['video'], inMod: false } },
];
const EXTRA = [];   // test hook: entries added with add()

// the game and its editor (tools/lib/writeguard): never started from here, whatever entry names them
const GAME_EXES = ['as64.exe', 'mowas_2.exe', 'as64_ed.exe', 'mowas_2_ed.exe', 'mowas_2_workshop.exe', 'workshop_gui.exe',
  'call_to_arms.exe', 'call_to_arms_ed.exe', 'call_to_arms_server.exe'];

function all() { return PROGRAMS.concat(EXTRA); }
function byId(id) { return all().find(p => p.id === id) || null; }
// every lang key an entry names
function keysOf(e) { return ['task.prog.' + e.id + '.what', 'task.prog.' + e.id + '.back'].concat(e.steps || []); }
// an entry's shape -> [problems]
function checkEntry(e) {
  const out = [];
  if (!e || !/^[a-z0-9][a-z0-9-]*$/.test(String(e.id || ''))) { out.push('id must be [a-z0-9][a-z0-9-]*'); return out; }
  const w = e.id + ': ';
  if (typeof e.name !== 'string' || !e.name) out.push(w + 'name is needed');
  if (!Array.isArray(e.for) || !e.for.length || e.for.some(k => !FOR.includes(k))) out.push(w + 'for must be a list of ' + FOR.join(', '));
  if (!OPENS.includes(e.open)) out.push(w + 'open must be ' + OPENS.join(' | '));
  if (!e.find || typeof e.find !== 'object') out.push(w + 'find must be an object');
  if (!Array.isArray(e.steps) || !e.steps.length || e.steps.some(k => typeof k !== 'string' || k.indexOf('task.prog.' + e.id + '.') !== 0)) out.push(w + 'steps must be lang keys task.prog.' + e.id + '.*');
  if (e.stepsFor != null && (typeof e.stepsFor !== 'object' || Object.entries(e.stepsFor).some(([g, l]) => !require('../../../lib/games').get(g) || !Array.isArray(l) || !l.length || l.some(k => typeof k !== 'string' || k.indexOf('task.prog.' + e.id + '.') !== 0)))) out.push(w + 'stepsFor must be {game: lang keys task.prog.' + e.id + '.*}');
  if (!e.back || !Array.isArray(e.back.kinds) || e.back.kinds.some(k => !FOR.includes(k))) out.push(w + 'back must be {kinds, inMod}');
  if (e.open === 'default' && !(e.find && e.find.assoc)) out.push(w + 'open default needs find.assoc');
  return out;
}

// ---------------------------------------------------------------- finding programs on this PC (cached a minute)
let H = { env: null, reg: null, platform: null, spawn: null, soedit: null, game: undefined, goh: undefined };   // test hooks
const isWin = () => (H.platform || process.platform) === 'win32';
const envOf = () => H.env || process.env;
const isFile = p => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
// reg query -> list of string values (the default value when value is '')
function regQuery(key, value, sub) {
  if (H.reg) return H.reg(key, value, sub) || [];
  if (!isWin()) return [];
  const args = ['query', key].concat(sub ? ['/s'] : []).concat(value ? ['/v', value] : ['/ve']);
  try {
    const r = cp.spawnSync('reg', args, { shell: false, encoding: 'utf8', windowsHide: true, timeout: 4000 });
    return regValues(r.stdout);
  } catch { return []; }
}
function regValues(text) {
  const out = [], re = /REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/gm; let m;
  while ((m = re.exec(text || ''))) out.push(m[1].replace(/^"|"$/g, ''));
  return out;
}
// the same query without blocking the server thread (PERF A11: the list route awaits it): same arguments, same answer
function regQueryA(key, value, sub) {
  if (H.reg || !isWin()) return Promise.resolve(regQuery(key, value, sub));
  const args = ['query', key].concat(sub ? ['/s'] : []).concat(value ? ['/v', value] : ['/ve']);
  return new Promise(res => {
    try { cp.execFile('reg', args, { shell: false, encoding: 'utf8', windowsHide: true, timeout: 4000 }, (err, stdout) => res(regValues(stdout))); } catch { res([]); }
  });
}
function expand(t) {
  const env = envOf(); let miss = false;
  const s = String(t).replace(/%([^%]+)%/g, (x, k) => { const v = env[k]; if (!v) miss = true; return v || ''; });
  return miss ? null : s;
}
// a path with '*' components (one folder level each) -> the files that are there, newest name last
function glob(p) {
  const parts = p.split(/[\\/]+/);
  let cur = [parts[0] + path.sep];
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i], next = [];
    if (seg.indexOf('*') < 0) { for (const c of cur) next.push(path.join(c, seg)); }
    else {
      const re = new RegExp('^' + seg.replace(/[.+^$()|[\]{}\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
      for (const c of cur) { let names = []; try { names = fs.readdirSync(c); } catch { continue; } for (const n of names.sort()) if (re.test(n)) next.push(path.join(c, n)); }
    }
    cur = next.slice(0, 200);
    if (!cur.length) return [];
  }
  return cur.filter(isFile);
}
function gameDir(ctx) { if (H.game !== undefined) return H.game; try { return (ctx && ctx.game && ctx.game()) || null; } catch { return null; } }
// the GoH install (game parity): the request's (ctx.gohDir()), else tools/lib/gamedir goh(); null when none
function gohDirOf(ctx) {
  if (H.goh !== undefined) return H.goh;
  try { const g = ctx && (typeof ctx.gohDir === 'function' ? ctx.gohDir() : ctx.gohDir); if (g) return g; } catch { /* none */ }
  try { return require('../../../lib/gamedir').goh() || null; } catch { return null; }
}
const GM = require('../../../lib/games');
// the game a request or a draft is for: the id given (?game=, draft.game), else the request's (ctx.gameId()), else as64
function gameIdOf(ctx, id) { const g = GM.get(id) || (() => { try { return GM.get(ctx && typeof ctx.gameId === 'function' ? ctx.gameId() : null); } catch { return null; } })(); return g ? g.id : (id || ''); }
// the install folder that holds the game's own programs: the GoH install for goh, else the AS2 install
const installOf = (ctx, gameId) => (GM.kindOf(gameId) === 'goh' ? gohDirOf(ctx) : gameDir(ctx));
// entry -> {found, path, how}; how: env | reg | path | onPath | repo | game | assoc. One body for both callers: a generator that
// yields each registry query [key, value, sub] and takes the values back; findOne answers them with regQuery (blocking), findOneA
// with regQueryA (awaited), in the same order
function findOne(e, ctx, gameId) { const g = findSteps(e, ctx, gameId); let s = g.next(); while (!s.done) s = g.next(regQuery(s.value[0], s.value[1], s.value[2])); return s.value; }
async function findOneA(e, ctx, gameId) { const g = findSteps(e, ctx, gameId); let s = g.next(); while (!s.done) s = g.next(await regQueryA(s.value[0], s.value[1], s.value[2])); return s.value; }
function* findSteps(e, ctx, gameId) {
  const f = e.find || {}, exe = f.exe;
  const hit = (p, how) => ({ found: true, path: p ? path.resolve(p) : null, how });
  for (const k of f.env || []) { const v = envOf()[k]; if (!v) continue; const p = isDir(v) && exe ? path.join(v, exe) : v; if (isFile(p)) return hit(p, 'env'); }
  if (f.repo === 'soedit') {
    try {
      const r = H.soedit ? H.soedit() : require('../../../soedit/locate').locate({ hash: () => '' });
      if (r && r.path) return hit(r.path, 'repo');
    } catch { /* no soedit helper in this copy */ }
  }
  if (f.game) {
    // the game's own name first, then the other names of the same install (AS64 and MoW:AS2 share one); a GoH name is looked up only
    // in the GoH install and an AS2 name only in the AS2 install
    const kind = GM.kindOf(gameId) || 'as2', g = installOf(ctx, gameId);
    if (g) {
      const names = [f.game[gameId]].concat(Object.keys(f.game).filter(k => (GM.kindOf(k) || 'as2') === kind).map(k => f.game[k])).filter(Boolean);
      for (const n of names) { const p = path.join(g, ...String(n).split('/')); if (isFile(p)) return hit(p, 'game'); }
    }
  }
  if (isWin()) {
    if (f.appPath) for (const root of ['HKLM', 'HKCU']) for (const v of yield [root + '\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\' + f.appPath, '', false]) if (isFile(v)) return hit(v, 'reg');
    for (const r of f.reg || []) for (const v of yield [r.key, r.value, r.sub]) { const p = exe && !/\.exe$/i.test(v) ? path.join(v, exe) : v; if (isFile(p)) return hit(p, 'reg'); }
    for (const t of f.paths || []) { const x = expand(t); if (!x) continue; const g = x.indexOf('*') >= 0 ? glob(x) : (isFile(x) ? [x] : []); if (g.length) return hit(g[g.length - 1], 'path'); }
  }
  for (const n of f.onPath || []) for (const d of String(envOf().PATH || envOf().Path || '').split(path.delimiter)) { if (!d) continue; const p = path.join(d, n); if (isFile(p)) return hit(p, 'onPath'); }
  if (f.assoc) {
    // the PC's own program for the file kind: Windows keeps it under HKCR\<ext> (or the user's choice); explorer opens with it
    if (!isWin()) return hit(null, 'assoc');
    const has = (yield ['HKCR\\' + f.assoc, '', false]).length || (yield ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\' + f.assoc + '\\UserChoice', 'ProgId', false]).length;
    if (has) return hit(null, 'assoc');
  }
  return { found: false, path: null, how: null };
}
const CACHE = new Map(), CACHE_MS = 60000;
function find(e, ctx, gameId) {
  const k = e.id + '|' + (gameId || '') + '|' + (installOf(ctx, gameId) || '');
  const c = CACHE.get(k);
  if (c && Date.now() - c.at < CACHE_MS) return c.r;
  const r = findOne(e, ctx, gameId);
  CACHE.set(k, { at: Date.now(), r });
  return r;
}
// find without blocking: the same memo row, filled by the awaited search
async function findA(e, ctx, gameId) {
  const k = e.id + '|' + (gameId || '') + '|' + (installOf(ctx, gameId) || '');
  const c = CACHE.get(k);
  if (c && Date.now() - c.at < CACHE_MS) return c.r;
  const r = await findOneA(e, ctx, gameId);
  CACHE.set(k, { at: Date.now(), r });
  return r;
}
const isGameExe = p => !!p && GAME_EXES.includes(path.basename(p).toLowerCase());
function canOf(e, f) {
  const game = e.open === 'game' || isGameExe(f.path);
  return { start: !game && e.open === 'exe' && f.found && !!f.path, file: !game && f.found && (e.open === 'exe' ? !!f.path : e.open === 'default'), folder: true, reveal: !!(f.found && f.path) };
}

// ---------------------------------------------------------------- GET list
function q(u, k) { return u && u.searchParams ? u.searchParams.get(k) || '' : ''; }
// the programs a list request asks for, in the order of the answer -> {ids, gameId, pick}
function pickOf(u, ctx) {
  const ids = q(u, 'ids').split(',').map(s => s.trim()).filter(Boolean), kinds = q(u, 'for').split(',').map(s => s.trim()).filter(Boolean);
  const gameId = gameIdOf(ctx, q(u, 'game'));
  let pick = all();
  if (ids.length || kinds.length) {
    const named = ids.map(byId).filter(Boolean), more = kinds.length ? all().filter(e => !named.includes(e) && e.for.some(k => kinds.includes(k) || k === 'any')) : [];
    pick = named.concat(more);
  }
  return { ids, gameId, pick };
}
// the route: every program of the request is looked for with awaited registry queries first (one after the other, in the order of
// the list), so listRoute below answers from the memo and no reg process blocks the server thread (PERF A11)
async function listRouteA(u, b, ctx) {
  const p = pickOf(u, ctx);
  for (const e of p.pick) await findA(e, ctx, p.gameId);
  return listRoute(u, b, ctx);
}
function listRoute(u, b, ctx) {
  const remote = !!(ctx && ctx.session && ctx.session.remote);
  const { ids, gameId, pick } = pickOf(u, ctx);
  const programs = pick.map(e => {
    const f = find(e, ctx, gameId);
    return { id: e.id, name: e.name, for: e.for, open: e.open, guide: e.guide || e.name, what: 'task.prog.' + e.id + '.what', steps: (e.stepsFor && e.stepsFor[gameId]) || e.steps,
      back: { kinds: e.back.kinds, inMod: !!e.back.inMod, say: 'task.prog.' + e.id + '.back' },
      exe: (e.find && e.find.game && e.find.game[gameId] && path.posix.basename(e.find.game[gameId])) || (f.path && !remote ? path.basename(f.path) : ''),
      found: f.found, how: f.how, path: remote ? null : f.path, can: remote ? { start: false, file: false, folder: false, reveal: false } : canOf(e, f) };
  });
  // found ones first, the registry order kept inside each half (a named id list keeps its own order)
  if (!ids.length) programs.sort((a, c) => (c.found ? 1 : 0) - (a.found ? 1 : 0));
  return { programs, remote };
}

// ---------------------------------------------------------------- POST open
const TOKENS = new Map(), TOKEN_MS = 5 * 60000;
const low = p => path.resolve(p).toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
const under = (f, root) => !!root && (low(f) === low(root) || (low(f) + '/').startsWith(low(root) + '/'));
function noRemote(ctx) { if (ctx && ctx.session && ctx.session.remote) throw Object.assign(bad('view only on this device: a phone never starts a program on the PC', 403), { key: 'rmt.viewOnly' }); }
// the draft's folders a program may open: its staging folder, and the picked mod (absolute, there, not the game)
function rootsOf(ctx, d) {
  const out = { staging: D.stageDir(ctx, d.id), mod: null };
  if (d.mod && path.isAbsolute(d.mod) && isDir(d.mod)) {
    const WG = require('../../../lib/writeguard'), why = WG.refuseWrite(d.mod, { game: installOf(ctx, gameIdOf(ctx, d.game)) || undefined, purpose: 'open a file of a guided task' });
    if (!why) out.mod = path.resolve(d.mod);
  }
  return out;
}
function targetOf(ctx, d, b, roots) {
  if (b.staged != null && b.staged !== '') return D.stagedPath(ctx, d.id, String(b.staged));
  if (b.rel != null && b.rel !== '') {
    if (!roots.mod) throw D.badK('task.e.pickMod', 'Pick your mod first: only files of the picked mod open from here.', 403);
    return require('./lib/compile').inMod(roots.mod, String(b.rel));
  }
  if (b.path != null && b.path !== '') {
    const p = String(b.path);
    if (/\0/.test(p) || !path.isAbsolute(p)) throw bad('A full path is needed.', 400);
    if (!under(p, roots.staging) && !(roots.mod && under(p, roots.mod))) throw D.badK('task.e.onlyHere', 'Only files in this task\'s staging folder or in the picked mod open from here.', 403);
    return path.resolve(p);
  }
  return null;
}
// body -> what a call does: {e, f, action, target, cmd: {how: start|open|reveal, file, args}}
function planOf(ctx, b) {
  noRemote(ctx);
  if (!b || typeof b !== 'object') throw bad('Nothing to open.');
  const e = byId(String(b.id || ''));
  if (!e) throw bad('No outside program ' + String(b.id || '').slice(0, 40) + ' in the list.', 404);
  const d = D.load(ctx, String(b.draft || '')), roots = rootsOf(ctx, d), action = String(b.action || '');
  if (!['start', 'file', 'folder', 'reveal'].includes(action)) throw bad('action is start, file, folder or reveal.');
  const f = find(e, ctx, gameIdOf(ctx, d.game)), can = canOf(e, f), game = e.open === 'game' || isGameExe(f.path);
  if (game && (action === 'start' || action === 'file')) throw Object.assign(D.badK('task.ho.game', 'The game and its editor start only through ARSENAL\'s own commands, with their own question first. Use Show in folder and start it yourself.', 403), { code: 'TASK_EXT_GAME' });
  if (action === 'folder') {
    const where = b.where === 'staging' || (b.where !== 'mod' && !roots.mod) ? 'staging' : 'mod';
    const dir = where === 'mod' ? roots.mod : roots.staging;
    if (!dir) throw D.badK('task.e.pickMod', 'Pick your mod first.', 400);
    return { e, f, d, action, target: dir, where, cmd: { how: 'open', file: dir } };
  }
  if (action === 'reveal') {
    const t = targetOf(ctx, d, b, roots);
    if (t) return { e, f, d, action, target: t, cmd: { how: 'reveal', file: t } };
    if (!f.found || !f.path) throw D.badK('task.e.notHere', e.name + ' is not on this PC.', 404, { n: e.name });
    return { e, f, d, action, target: f.path, cmd: { how: 'reveal', file: f.path } };
  }
  if (!f.found) throw D.badK('task.e.notHere', e.name + ' is not on this PC. The Guides & External Tools page says where people get it.', 404, { n: e.name });
  if (action === 'start') {
    if (!can.start) throw D.badK('task.e.noStart', e.name + ' is not started from here: follow the steps on the card.', 400, { n: e.name });
    return { e, f, d, action, target: null, cmd: { how: 'start', file: f.path, args: [] } };
  }
  const t = targetOf(ctx, d, b, roots);
  if (!t) throw bad('Name the file to open: staged, rel or path.');
  if (!can.file) throw D.badK('task.e.noStart', e.name + ' does not open files from here: follow the steps on the card.', 400, { n: e.name });
  return { e, f, d, action, target: t, cmd: e.open === 'default' ? { how: 'open', file: t } : { how: 'start', file: f.path, args: [t] } };
}
const sigOf = p => JSON.stringify([p.e.id, p.d.id, p.action, p.target ? low(p.target) : '', p.cmd.how, p.cmd.file ? low(p.cmd.file) : '']);
function sweepTokens() { const now = Date.now(); for (const [k, v] of TOKENS) if (v.exp < now) TOKENS.delete(k); }
function startExe(file, args) {
  if (isGameExe(file)) return { ok: false, why: 'game' };
  try {
    const sp = H.spawn || cp.spawn;
    const ch = sp(file, args, { shell: false, detached: true, stdio: 'ignore', windowsHide: false, cwd: path.dirname(file) });
    if (ch && ch.on) ch.on('error', () => {});
    if (ch && ch.unref) ch.unref();
    return { ok: !!(ch && (ch.pid || H.spawn)), cmd: [file].concat(args) };
  } catch (e) { return { ok: false, why: e.message }; }
}
function platOpt() {
  const o = {};
  if (H.platform) o.platform = H.platform;
  if (H.spawn) o.spawn = (file, args, so) => { const ch = H.spawn(file, args, Object.assign({}, so, { shell: false, detached: true })); return ch || { error: new Error('could not start ' + file) }; };
  return o;
}
async function openRoute(u, b, ctx) {
  const p = planOf(ctx, b || {});
  const out = { ok: true, id: p.e.id, name: p.e.name, action: p.action, target: p.target, program: p.f.path, how: p.cmd.how, where: p.where || null,
    exists: p.target ? fs.existsSync(p.target) : true };
  const needAsk = p.action === 'start' || p.action === 'file';
  out.inMod = !!p.e.back.inMod;
  if (b.plan === true) {
    if (needAsk) { sweepTokens(); const t = crypto.randomBytes(12).toString('hex'); TOKENS.set(t, { sig: sigOf(p), exp: Date.now() + TOKEN_MS }); out.token = t; }
    return Object.assign(out, { plan: true });
  }
  if (needAsk) {
    const t = TOKENS.get(String(b.token || ''));
    if (!t || t.exp < Date.now() || t.sig !== sigOf(p)) throw Object.assign(D.badK('task.e.ask', 'Ask first: the page asks before it opens a program (plan, then the confirm box).', 409), { code: 'TASK_EXT_ASK' });
    TOKENS.delete(String(b.token));
  }
  // a program that saves straight into the mod: the mod's files are kept before it opens (a game program: at Show in folder, since
  // the user starts it from there); I am done, Write or Throw away give each file it changed a restore point
  const roots = rootsOf(ctx, p.d);
  if (p.e.back.inMod && roots.mod && (needAsk || (p.action === 'reveal' && p.e.open === 'game'))) out.guard = require('./lib/compile').extGuardOpen(ctx, p.d, roots.mod, p.e.id);
  if (p.action === 'folder' && p.where === 'staging') fs.mkdirSync(p.target, { recursive: true });
  if (p.target && !fs.existsSync(p.target)) throw D.badK('task.e.fileGone', 'The file is gone: ' + path.basename(p.target), 404, { f: path.basename(p.target) });
  const P = require('../../../lib/platform');
  const r = p.cmd.how === 'start' ? startExe(p.cmd.file, p.cmd.args) : p.cmd.how === 'reveal' ? P.revealInFolder(p.cmd.file, platOpt()) : P.openPath(p.cmd.file, platOpt());
  if (!r.ok) throw D.badK('task.e.couldNot', p.e.name + ' could not be started on this PC.', 500, { n: p.e.name });
  return out;
}

// POST {draft} -> {closed, restore: [ids], changed, unguarded} | {closed: false}: "I am done" of a program that saved into the mod
function backRoute(u, b, ctx) {
  noRemote(ctx);
  const d = D.load(ctx, String((b && b.draft) || ''));
  return require('./lib/compile').extGuardClose(ctx, d.id) || { closed: false, restore: [], changed: 0, unguarded: [] };
}
const routes = {
  'GET /api/x/task/external': listRouteA,
  'POST /api/x/task/external/open': openRoute,
  'POST /api/x/task/external/back': async (u, b, ctx) => backRoute(u, b, ctx),
};
module.exports = { PROGRAMS, OPENS, FOR, GAME_EXES, routes, all, byId, keysOf, checkEntry, find, findA, planOf, listRoute, listRouteA, openRoute, backRoute };
// test hooks (not enumerable): add/remove an entry, fake finding and starting
Object.defineProperty(module.exports, '_add', { value: e => { const p = checkEntry(e); if (p.length) throw new Error(p.join('; ')); EXTRA.push(e); CACHE.clear(); }, enumerable: false });
Object.defineProperty(module.exports, '_reset', { value: () => { EXTRA.length = 0; CACHE.clear(); TOKENS.clear(); H = { env: null, reg: null, platform: null, spawn: null, soedit: null, game: undefined, goh: undefined }; }, enumerable: false });
Object.defineProperty(module.exports, '_hooks', { value: o => { Object.assign(H, o || {}); CACHE.clear(); }, enumerable: false });
