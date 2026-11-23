// GUI-EXT goh: "Gates of Hell unit" wizard. Picks a GoH unit (read-only from the GoH paks), suggests donors, runs the tested goh2as2 chain
// (guide/19: --donor --rep-key --pull-props --mtl-fallback --match-weapon, fit pass on), shows what changed, runs the fit check.
// Writes only to the folder the user picked (a mod folder; inside the game dir only <game>/mods/<name>). Never starts the game.
// Port target (body.target / ?target=): as64 (default, argument lists as before) or mowas2 (--exe mowas_2 to goh2as2 and donorfit, the
// mowas_2 vfs view for the donor pool, prove plan line without as64+). The AS2 folder is ctx.game() for both; GoH is always the source.
// Author: Imperator_Aug (ARSENAL, ia-31230d34)
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const pakset = require('../../../lib/pakset');
const gamedirLib = require('../../../lib/gamedir');
const lang = require('./lang');

const bad = (m, status = 400) => Object.assign(new Error(m), { status });
const NAME = /^[A-Za-z0-9_.\-]{1,80}$/;
const unq = p => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '');
const same = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const inside = (child, parent) => { const c = unq(path.resolve(child)), p = unq(path.resolve(parent)); return same(c, p) || (c.length > p.length && same(c.slice(0, p.length), p) && c[p.length] === '/'); };

// the GoH install: ?goh= (or body.goh), else the page's GoH folder (ctx.gohDir, header x-arsenal-goh), else gamedir.goh()
function gohDir(ctx, url) {
  const o = url && url.searchParams && url.searchParams.get('goh');
  let g = null;
  try { g = o && fs.existsSync(o) ? o : (ctx && typeof ctx.gohDir === 'function' && ctx.gohDir()) || gamedirLib.goh(); } catch (e) { g = null; }
  return g && fs.existsSync(path.join(g, 'resource')) ? g : null;
}
// port target (the AS2 game the unit is made for; GoH is the source): 'as64' (default) or 'mowas2' (settled point
// MoW:AS2 target [I]: no ported unit was loaded in mowas_2.exe). exe = the vfs exe handed to the tools as --exe, null for as64 (the AS64
// argument list stays as it was; the tools default to as64 when as64.exe is in the AS2 folder)
// With no target sent, the request's game decides: MoW:AS2 in the header (ctx.gameId() 'mowas2') gives mowas2, every other game gives as64.
function targetOf(v, ctx) {
  const g = require('../../../lib/games');
  const t = v == null || v === '' ? (ctx && typeof ctx.gameId === 'function' && ctx.gameId() === 'mowas2' ? 'mowas2' : 'as64') : g.idOf(String(v));
  if (t !== 'as64' && t !== 'mowas2') throw bad('target: as64 or mowas2 (the AS2 game the GoH unit is ported to)');
  return { id: t, exe: t === 'mowas2' ? 'mowas_2' : null };
}
function gohOpt(body) { return body && body.goh ? { searchParams: new URLSearchParams({ goh: String(body.goh) }) } : null; }
function gameFor(ctx, v) {
  if (v) { if (!fs.existsSync(v)) throw bad('game folder not found: ' + v); return v; }
  const g = ctx.game(); return g && fs.existsSync(g) ? g : null;
}

// ---- unit list (GoH vehicles: entity/-vehicle/<nation>/<class>/../<name>/<name>.def), kept in memory and in the shared store
// CACHE (gui README contract 1): section goh.units, ver LIST_VER, parts {goh: the GoH folder}, stamps {game: lib/gameview stamp of
// the GoH install (exe version + name, size, mtime of every pak it mounts)}. The stamp is asked at most every 5 s (gameview), so the
// pak folders are not walked on every search key any more. The list reads the paks under resource/ only, which that stamp covers.
const mem = new Map();
const cachestore = require('../../../lib/cachestore'), gameview = require('../../../lib/gameview');
// the shared store: the server's (ctx.cache); a ctx without it (tests) keeps one under its temp folder
const storeOf = ctx => (ctx && ctx.cache) || cachestore.open({ root: path.join((ctx && ctx.tmpRoot) || os.tmpdir(), 'cache', 'store') });
const unitParts = goh => ({ goh: path.resolve(unq(goh)).replace(/\\/g, '/').toLowerCase() });
const unitStamps = goh => ({ game: gameview.stamp({ gameDir: goh, exe: 'goh' }) });
// one pak key -> a unit, or null. Wrecks and damage stages (<class>/x/<name>_x/<name>_x.def, _xx) are not units (GT-39)
function unitOfKey(key) {
  const k = String(key).toLowerCase(), s = k.split('/');
  if (s[0] !== 'entity' || s[1] !== '-vehicle' || s.length < 5) return null;
  const stem = s[s.length - 1].replace(/\.def$/, '');
  if (s[s.length - 2] !== stem) return null;
  if (s.slice(2, -2).includes('x') || /_xx?$/.test(stem)) return null;
  const cls = s.slice(3, -2).find(x => /^(tank_light|tank_medium|tank_heavy|btr|car|cannon|mortar|airborne|marine|trailer|special|train)$/.test(x)) || '';
  return { name: stem, nation: s[2], cls, key: k };
}
const LIST_VER = 3;   // bump when unitOfKey changes, so an old kept list is not reused (1, 2: the lists of the temp folder file)
function listUnits(ctx, goh) {
  const root = path.join(goh, 'resource'), st = unitStamps(goh), S = storeOf(ctx), stamp = S.root + '|' + st.game, m = mem.get(goh);
  if (m && m.stamp === stamp) return m.units;
  try { const c = S.get('goh.units', LIST_VER, unitParts(goh), st); if (c && Array.isArray(c.value)) { mem.set(goh, { stamp, units: c.value }); return c.value; } } catch (e) { /* no entry */ }
  const ps = pakset.open(root, new Set(['.def'])), by = new Map();
  try {
    for (const e of ps.entries) {
      const u = unitOfKey(e.key); if (!u) continue;
      const o = by.get(u.name); if (!o || u.key.length < o.key.length) by.set(u.name, u);
    }
  } finally { ps.close(); }
  const units = [...by.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
  mem.set(goh, { stamp, units });
  try { S.put('goh.units', LIST_VER, unitParts(goh), st, units); } catch (e) { /* the store is best effort */ }
  return units;
}
function lev(a, b) {
  const m = a.length, n = b.length; if (Math.abs(m - n) > 4) return 99;
  let p = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; }
  return p[n];
}
function searchUnits(units, q) {
  const s = String(q || '').toLowerCase().trim().replace(/\.def$/, ''); if (!s) return { units: [] };
  const toks = s.split(/\s+/);
  const sc = u => { const n = u.name.toLowerCase(); if (n === s) return 0; if (n.startsWith(s)) return 1; if (toks.every(t => n.includes(t))) return 2; if (toks.every(t => (n + ' ' + u.nation + ' ' + u.cls).includes(t))) return 3; return -1; };
  const hits = units.map(u => [sc(u), u]).filter(x => x[0] >= 0).sort((a, b) => a[0] - b[0] || (a[1].name < b[1].name ? -1 : 1)).map(x => x[1]);
  const out = { units: hits.slice(0, 40), total: hits.length };
  if (!hits.length) {
    const lim = Math.max(2, Math.floor(s.length / 3));
    out.didYouMean = units.map(u => [lev(s, u.name.toLowerCase()), u]).filter(x => x[0] <= lim).sort((a, b) => a[0] - b[0] || (a[1].name < b[1].name ? -1 : 1)).slice(0, 6).map(x => x[1]);
  }
  return out;
}

// ---- donors: top 3 from donorpick's own scoring (module exports), vanilla pool cached per AS2 folder and target exe
const pools = new Map();
function dec(b) { let x = b; if (x[0] === 0xEF && x[1] === 0xBB && x[2] === 0xBF) x = x.subarray(3); return new TextDecoder('utf-8').decode(x); }
// the pool itself is donorpick's own vanillaPool(game, exe) (one scoring view for the tool and the page); this only caches it per
// AS2 folder and target exe (no exe = the vfs default, as64 first, as before)
function vanillaPool(dp, game, exe) {
  const pk = game + '|' + (exe || 'as64');
  if (pools.has(pk)) return pools.get(pk);
  const pool = dp.vanillaPool(game, exe || undefined);
  pools.set(pk, pool); return pool;
}
function suggestDonors(ctx, goh, game, unit, exe) {
  const dp = require('../../../donorpick/donorpick');
  const root = path.join(goh, 'resource'), ps = pakset.open(root, null), map = new Map();
  let rep;
  try {
    for (const e of ps.entries) map.set(e.key.toLowerCase(), e);
    const read = k => { const e = map.get(k); return e ? dec(pakset.read(e)) : null; };
    const key = unit.key, t0 = read(key); if (t0 == null) throw bad('GoH def not readable: ' + key, 404);
    const text = dp.withIncludes(t0, key.slice(0, key.lastIndexOf('/')), read), stem = key.slice(key.lastIndexOf('/') + 1).replace(/\.def$/, '');
    const f = dp.stemCal(dp.features(text), stem); rep = { key, stem, cls: dp.classOfKey(key, f), ...f };
  } finally { ps.close(); }
  if (!rep.cls || rep.cls === 'infantry') return { cls: rep.cls, donors: [], unplaced: 'This kind of unit has no donor (no tank, car, gun or mortar class).' };
  const res = dp.pick(rep, vanillaPool(dp, game, exe));
  const ranked = res.ranked || [], seen = new Set(), donors = [];
  for (const r of ranked) {
    if (seen.has(r.p.stem)) continue; seen.add(r.p.stem);
    const c = r.p.f, why = [];
    why.push('class ' + rep.cls);
    why.push(rep.cal ? 'gun ' + rep.cal + ' mm vs ' + (c.cal || 'none') : 'no main gun');
    why.push('armour ' + rep.armour + ' vs ' + c.armour);
    if (rep.mover !== '?' && c.mover !== '?') why.push('mover ' + rep.mover + '/' + c.mover);
    why.push('crew ' + rep.crew + ' vs ' + c.crew);
    donors.push({ stem: r.p.stem, score: Math.round(r.s * 100) / 100, why });
    if (donors.length >= 3) break;
  }
  return { cls: rep.cls, confidence: res.conf || 'low', donors, unplaced: res.donor ? null : res.unplaced || null, entity: unit.name, crew: rep.crew, armour: rep.armour, calibre: rep.cal || null };
}

// donor sub-group: the vanilla vehicle folder (the names index hint)
const donorSub = p => { const m = /^resource\/entity\/-vehicle\/([^/]+)\//.exec(p.key); return (m && m[1]) || 'other'; };

// ---- output folder rules
function checkOut(ctx, out, game, goh) {
  if (!out || typeof out !== 'string') throw bad('out: a folder path is needed');
  const o = path.resolve(out);
  if (goh && inside(o, goh)) throw bad('refused: the output folder is inside the Gates of Hell folder');
  if (/[\\/]steamapps[\\/]workshop[\\/]/i.test(unq(o))) throw bad('refused: the output folder is inside a Workshop folder');
  if (game && inside(o, game)) {
    const rel = unq(path.relative(game, o)).split('/');
    if (!(rel.length === 2 && rel[0].toLowerCase() === 'mods' && rel[1])) throw bad('refused: inside the game folder only <game>/mods/<name> may be written');
  }
  if (fs.existsSync(o)) {
    const st = fs.statSync(o); if (!st.isDirectory()) throw bad('out is a file, not a folder');
    const ls = fs.readdirSync(o);
    if (ls.length && !fs.existsSync(path.join(o, 'GOH-ORIGIN.tsv')) && !fs.existsSync(path.join(o, 'mod.info'))) throw bad('refused: that folder is not empty and is not a mod folder. Pick a new or an empty folder.');
  }
  return o;
}

// ---- convert (plan = --dry-run)
const SEV = { error: 0, warning: 1, note: 2 };
function groupBy(list) { const m = new Map(); for (const f of list) { const k = f.code + '|' + f.severity; const g = m.get(k); if (g) g.n++; else m.set(k, { code: f.code, severity: f.severity, msg: f.msg, file: f.file, n: 1 }); } return [...m.values()]; }
const ADV = { speed: 'goh.adv.speed', fuel: 'goh.adv.fuel', mass: 'goh.adv.mass', turn_time: 'goh.adv.turn', start_time: 'goh.adv.start', limits: 'goh.adv.limits' };
function advOf(key) { if (/^armo(u)?r_/.test(key)) return 'goh.adv.armour'; const b = key.split(' ')[0]; return ADV[b] || 'goh.adv.other'; }
function whatChanged(out, unit, warnings) {
  const w = { counts: null, values: [], dropped: [] };
  for (const f of warnings) {
    let m;
    if (f.code === 'WARN_PORT_CREW_CAPPED' && (m = /GoH crew (\d+), the port has (\d+)/.exec(f.msg))) w.crew = { goh: +m[1], port: +m[2] };
    else if (f.code === 'WARN_PORT_WEAPON_SWAPPED' && (m = /donor weapon "([^"]+)".*-> vanilla "([^"]+)".*rep's "([^"]+)"/.exec(f.msg))) w.weapon = { from: m[1], to: m[2], rep: m[3] };
    else if (f.code === 'WARN_PORT_ARMOUR') w.armour = f.msg.replace(/\s*\[[VIT]\]\s*$/, '').slice(0, 300);
  }
  let g = null;
  try { g = JSON.parse(fs.readFileSync(path.join(out, 'gaps', unit + '.gaps.json'), 'utf8')); } catch (e) { return w; }
  w.counts = g.counts;
  const dr = new Map();
  for (const x of g.gaps || []) {
    if (x.kind === 'dropped') dr.set(x.code, (dr.get(x.code) || 0) + 1);
    else if (x.kind === 'donor' && x.code === 'PORT_DONOR_DEF') { const m = /--donor ([^:\s]+)/.exec(x.reason); if (m) w.donor = m[1]; }
    else if (x.kind === 'baked' && x.code === 'XLATE_WRITE') {
      const m = /GoH (\S+(?: \S+)*?) -> (\S+(?: \S+)*?) written into the donor def \(donor had ([^;)]*)/.exec(x.reason);
      if (m) w.values.push({ key: x.key, goh: m[1], written: m[2], donor: m[3], adv: advOf(x.key) });
    }
  }
  w.dropped = [...dr.entries()].map(([code, n]) => ({ code, n }));
  return w;
}
async function convert(ctx, body) {
  body = body || {};
  const unit = String(body.unit || ''), donor = String(body.donor || '');
  if (!NAME.test(unit)) throw bad('unit: a GoH unit name is needed');
  if (!NAME.test(donor)) throw bad('donor: a vanilla unit name is needed (use "Suggest donor")');
  const tg = targetOf(body.target, ctx), goh = gohDir(ctx, gohOpt(body)), game = gameFor(ctx, body.game);
  if (!goh) throw bad('no Gates of Hell install found');
  if (!game) throw bad('no Assault Squad 2 folder found');
  const out = checkOut(ctx, body.out, game, goh), dry = body.dry !== false;
  if (!dry && body.confirm !== true) throw bad('confirm: true is needed to write files (run the preview first)');
  // the tested chain, guide/19 section 7. --no-ask: every out-of-range value takes the AS2-scale default (the page explains it).
  const args = ['--goh', goh, '--entity', unit, '--donor', donor, '--rep-key', '--pull-props', '--mtl-fallback', '--match-weapon', '--no-ask', '--game', game, '--out', out, '--format', 'json'];
  if (tg.exe) args.push('--exe', tg.exe);   // MoW:AS2 target: the mowas_2 view (no as64/core) for the donor, the lookups and the fit pass
  if (dry) args.push('--dry-run');
  if (!dry && ctx.job) ctx.job.writes = true;   // JOBS: the converted unit is written into the output mod folder
  let r;
  try { r = await ctx.runTool('goh2as2', 'goh2as2/goh2as2.js', args, { timeoutMs: 240000 }); }
  finally { if (!dry) touchMod(ctx, out); }   // CACHE: the output folder is a mod folder; the shared walk reads it again after a write
  // stopped from the footer: nothing is read from the killed tool. A stopped write leaves the files written so far in the output
  // folder (it may have held files before, so nothing is removed here); running the conversion again writes the whole set
  if (r.cancelled) return { cancelled: true };
  let j = null; try { j = JSON.parse(r.stdout); } catch (e) { /* not json */ }
  const lines = String(r.stderr || '').split(/\r?\n/).filter(Boolean);
  if (r.timedOut) return { ok: false, unit, error: 'The conversion took too long and was stopped.', lines: lines.slice(-6) };
  if (!j || r.code !== 0) return { ok: false, unit, error: (lines.find(l => /not found|PORT_NOT_FOUND|ERR_|unknown|refus/i.test(l)) || lines[0] || 'The conversion failed.'), lines: lines.slice(-8) };
  const fs_ = j.findings || [], info = j.info || [];
  const errors = groupBy(fs_.filter(f => f.severity === 'error')), warnings = groupBy(fs_.filter(f => f.severity !== 'error' && f.severity !== 'note'));
  const noteF = groupBy(fs_.filter(f => f.severity === 'note').concat(info));
  errors.sort((a, b) => a.code < b.code ? -1 : 1); warnings.sort((a, b) => (SEV[a.severity] - SEV[b.severity]) || (a.code < b.code ? -1 : 1));
  return {
    ok: true, dry, unit, donor, out, target: tg.id, goh_only: true, errors, warnings,
    infoCount: info.length + fs_.filter(f => f.severity === 'note').length, infoGroups: noteF.sort((a, b) => b.n - a.n).map(g => ({ code: g.code, n: g.n, sample: g.msg })),
    summary: lines.filter(l => /^(would write|wrote|keylint|fit pass|closure check|unit names)/.test(l)).slice(0, 6),
    what: dry ? null : whatChanged(out, unit, fs_.filter(f => f.severity !== 'note')),
  };
}

// ---- fit check: donorfit (read) and portfix macrocheck (read); apply = donorfit --fit --write --in-place
async function fit(ctx, body) {
  body = body || {}; const unit = String(body.unit || '');
  if (!NAME.test(unit)) throw bad('unit: a unit name is needed');
  const tg = targetOf(body.target, ctx), game = gameFor(ctx, body.game), goh = gohDir(ctx, gohOpt(body)); if (!game) throw bad('no Assault Squad 2 folder found');
  const out = checkOut(ctx, body.out, game, goh);
  if (!fs.existsSync(path.join(out, 'GOH-ORIGIN.tsv'))) throw bad('that folder was not made by the Gates of Hell wizard (no GOH-ORIGIN.tsv)');
  const def = path.join(out, 'resource', 'entity', unit, unit + '.def');
  if (!fs.existsSync(def)) throw bad('unit def not found in the output folder: resource/entity/' + unit + '/' + unit + '.def', 404);
  const base = [def, '--game', game, '--moddir', out].concat(tg.exe ? ['--exe', tg.exe] : []);
  if (body.apply) { if (body.confirm !== true) throw bad('confirm: true is needed to change files'); if (ctx.job) ctx.job.writes = true;
    let w; try { w = await ctx.runTool('donorfit', 'donorfit/donorfit.js', base.concat(['--fit', '--write', '--in-place']), { timeoutMs: 180000 }); } finally { touchMod(ctx, out); }
    if (w.cancelled) return { cancelled: true }; }
  const r = await ctx.runTool('donorfit', 'donorfit/donorfit.js', base.concat(['--json']), { timeoutMs: 180000 });
  if (r.cancelled) return { cancelled: true };
  let j = null; try { j = JSON.parse(r.stdout); } catch (e) { /* not json */ }
  if (!j) throw bad('The fit check gave no result: ' + String(r.stderr || r.stdout).split(/\r?\n/)[0], 500);
  const txt = x => typeof x === 'string' ? x : (x && (x.msg || x.message || x.code)) || JSON.stringify(x);
  const problems = [];
  const mc = await ctx.runTool('portfix', 'portfix/portfix.js', ['macrocheck', out, '--game', game].concat(tg.exe ? ['--exe', tg.exe] : []), { timeoutMs: 180000 });
  if (mc.cancelled) return { cancelled: true };
  const m = /(\d+) undefined macros, (\d+) missing includes/.exec(String(mc.stdout) + String(mc.stderr));
  if (m && (+m[1] || +m[2])) problems.push('portfix macrocheck: ' + m[1] + ' undefined macros, ' + m[2] + ' missing includes');
  return { ok: true, unit, target: tg.id, applied: !!body.apply, misses: (j.misses || []).map(txt), warnings: (j.warnings || []).map(txt), notes: (j.notes || []).map(txt), problems, seats: (j.seats || []).length, bones: j.mdlBones || 0 };
}

// ---- "Show me my unit": commands only (the game is never started here)
function show(ctx, url) {
  const unit = url.searchParams.get('unit') || '', out = url.searchParams.get('out') || '';
  if (!NAME.test(unit)) throw bad('unit: a unit name is needed');
  const tg = targetOf(url.searchParams.get('target'), ctx);
  const g = gameFor(ctx, url.searchParams.get('game')) || '<AS2 folder>', mod = path.basename(out || 'goh_' + unit) || 'goh_' + unit;
  // as64+ is the AS64 built-in mod: only on the AS64 target. MoW:AS2: prove takes the exe file (mowas_2.exe); --plan only, no run here
  const prove = tg.id === 'mowas2' ? ' --exe mowas_2.exe --mods ' + mod : ' --mods as64+,' + mod;
  return { unit, target: tg.id, steps: [
    { id: 'install', cmd: 'ARSENAL install "' + (out || '<output folder>') + '" --name ' + mod + ' --game "' + g + '" --dry' },
    { id: 'plan', cmd: 'ARSENAL prove --game "' + g + '" --unit ' + unit + ' --army <army>' + prove + ' --tiny --plan' },
    { id: 'place', cmd: 'ARSENAL place-entity --game "' + g + '" --help' },
  ], launch: false };
}

// CACHE: a write route's last step (lib/modtree touch: the next shared walk of that mod folder reads it again)
function touchMod(ctx, dir) { try { ((ctx && ctx.modtree) || require('../../../lib/modtree')).touch(dir); } catch (e) { /* nothing kept */ } }
// Prepare (gui README "Prepare sections"): the GoH unit list, on the GoH tab (q.game.dir = the GoH install). Game only.
const PREP = [{
  id: 'goh.units', title: 'goh.prep.units', needs: [], areas: [], games: ['goh'],
  state(ctx, q) {
    const goh = q && q.game && q.game.dir; if (!goh || !fs.existsSync(goh)) return { state: 'na', why: [] };
    return storeOf(ctx).state('goh.units', LIST_VER, unitParts(goh), unitStamps(goh));
  },
  async run(ctx, q, job) {
    const goh = q && q.game && q.game.dir; if (!goh || !fs.existsSync(goh)) throw bad('no Gates of Hell install found', 404);
    if (job && job.set) job.set({ stage: 'goh.prep.units', done: 0, total: 1 });
    await new Promise(r => setImmediate(r));   // the job is listed before the one read (under a second, in one step)
    if (job && job.cancelled) return { cancelled: true };
    const n = listUnits(ctx, goh).length;
    if (job && job.set) job.set({ stage: 'goh.prep.units', done: 1, total: 1 });
    return { units: n };
  },
}];

module.exports = {
  id: 'goh', nav: 'goh.nav', adv: true, after: 'test',
  prep: PREP,
  script: require('./script'),
  lang: lang,
  commands: {
    gohport: {
      summary: 'Port one Gates of Hell unit to AS2 with the tested chain (goh2as2 with donor, rep-key, pull-props, mtl-fallback, match-weapon and the fit pass). Use dry first.',
      tool: 'goh2as2', entry: 'goh2as2/goh2as2.js', result: 'none',
      fields: [
        { name: 'goh', flag: '--goh', type: 'path', desc: 'Gates of Hell install', req: true },
        { name: 'entity', flag: '--entity', type: 'repeat', desc: 'one GoH unit name', req: true },
        { name: 'donor', flag: '--donor', type: 'str', desc: 'vanilla donor unit (see donorpick)', req: true },
        { name: 'out', flag: '--out', type: 'path', desc: 'output mod folder, e.g. <AS2>/mods/goh_<unit>', req: true },
        { name: 'game', flag: '--game', type: 'path', desc: 'AS2 install dir', req: true },
        { name: 'exe', flag: '--exe', type: 'enum', values: ['as64', 'mowas_2'], desc: 'port target: as64 (default when as64.exe is in the AS2 folder) or mowas_2 (MoW:AS2, no as64/core)' },
        { name: 'repKey', flag: '--rep-key', type: 'bool', desc: 'unit in its own folder (tested chain: on)' },
        { name: 'pullProps', flag: '--pull-props', type: 'bool', desc: 'pull the model properties (tested chain: on)' },
        { name: 'mtlFallback', flag: '--mtl-fallback', type: 'bool', desc: 'donor material for a missing one (tested chain: on)' },
        { name: 'matchWeapon', flag: '--match-weapon', type: 'bool', desc: 'nearest vanilla weapon (tested chain: on)' },
        { name: 'noAsk', flag: '--no-ask', type: 'bool', desc: 'never ask: every value takes the AS2 scale default' },
        { name: 'noFitPass', flag: '--no-fit-pass', type: 'bool', desc: 'skip the fit pass' },
        { name: 'dryRun', flag: '--dry-run', type: 'bool', desc: 'write nothing' },
      ],
    },
  },
  routes: {
    'GET /api/x/goh/status': async (url, body, ctx) => {
      const goh = gohDir(ctx, url); let game = null; try { game = gameFor(ctx, url.searchParams.get('game')); } catch (e) { game = null; }
      return { goh, game, ok: !!(goh && game) };
    },
    'GET /api/x/goh/units': async (url, body, ctx) => {
      const goh = gohDir(ctx, url); if (!goh) throw bad('no Gates of Hell install found', 404);
      const all = listUnits(ctx, goh), r = searchUnits(all, url.searchParams.get('q'));
      return { units: r.units, total: r.total || 0, didYouMean: r.didYouMean || [], all: all.length };
    },
    'GET /api/x/goh/donors': async (url, body, ctx) => {
      const goh = gohDir(ctx, url); if (!goh) throw bad('no Gates of Hell install found', 404);
      const game = gameFor(ctx, url.searchParams.get('game')); if (!game) throw bad('no Assault Squad 2 folder found', 404);
      const name = String(url.searchParams.get('unit') || ''), u = listUnits(ctx, goh).find(x => x.name === name);
      if (!u) throw bad('unknown GoH unit: ' + name, 404);
      const tg = targetOf(url.searchParams.get('target'), ctx);
      return Object.assign(suggestDonors(ctx, goh, game, u, tg.exe), { target: tg.id });
    },
    // the search boxes' index (searchKit, owner 2026-11-19): every unit name (kind=units) or donor stem (kind=donors) in one flat list,
    // read once per page load and filtered in the browser while the user types: {items: [{name, group, sub, cal?}], all}
    'GET /api/x/goh/names': async (url, body, ctx) => {
      const kind = url.searchParams.get('kind');
      if (kind === 'units') {
        const goh = gohDir(ctx, url); if (!goh) throw bad('no Gates of Hell install found', 404);
        const us = listUnits(ctx, goh);
        return { kind, all: us.length, items: us.map(u => ({ name: u.name, group: u.cls || 'other', sub: u.nation || '' })) };
      }
      if (kind === 'donors') {
        const tg = targetOf(url.searchParams.get('target'), ctx);
        const game = gameFor(ctx, url.searchParams.get('game')); if (!game) throw bad('no Assault Squad 2 folder found', 404);
        const seen = new Set(), items = [];
        for (const x of vanillaPool(require('../../../donorpick/donorpick'), game, tg.exe)) { if (seen.has(x.stem)) continue; seen.add(x.stem); items.push({ name: x.stem, group: x.cls || 'other', sub: donorSub(x), cal: (x.f && x.f.cal) || null }); }
        items.sort((a, b) => (a.name < b.name ? -1 : 1));
        return { kind, all: items.length, items, target: tg.id };
      }
      throw bad('kind: units or donors');
    },
    'POST /api/x/goh/convert': async (url, body, ctx) => convert(ctx, body),
    'POST /api/x/goh/fit': async (url, body, ctx) => fit(ctx, body),
    'GET /api/x/goh/show': async (url, body, ctx) => show(ctx, url),
  },
  _t: { searchUnits, lev, checkOut, whatChanged, advOf, unitOfKey, listUnits, targetOf, vanillaPool, gohDir, pools, storeOf, unitParts, unitStamps, LIST_VER, mem },
};
