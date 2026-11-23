#!/usr/bin/env node
// wouldload: L1 rung of the validation ladder. static verdict per exe: would this mod load?
//   node wouldload.js <modDir> [--exe as64,mowas2|mowas_2,goh] [--game AS2dir] [--goh GoHdir] [--json f] [-q]
//   test/expert: --exe-as64 f --exe-mowas2 f --exe-goh f (exe path), --ver-goh v (GoH version when the exe has no PE),
//                --cache-dir d (refcheck caches), --inject f.json ({as64|mowas2|goh|as2:{sdllint|refcheck:text|null}}, as2 = both AS2 exes when they have no key of their own, null = tool failed)
//   --no-warm: no vanilla refcheck warm run first (by default, when neither the mod's refcheck cache nor the vanilla entityindex cache of
//              that exe and folder exists, one vanilla refcheck builds the vanilla one, so the mod run is seeded warm; --time shows it)
//   --reach-all: --json carries exes[t].reachAll = {defs: {def key: REACHABLE|ORPHAN|UNKNOWN}, unrefFiles: [entity .mdl/.ply nothing names]} (check reach gate)
// GoH version gate: Min/Max against the exe version (PORT-46); mod.info Tags with the word "develop" skips it (GHVFS-02)
// verdicts: REFUSED (version gate) | LIKELY_CRASH (crash class found) | LOADS_STATIC (static only, not run) | UNKNOWN (paks unread, exe missing, tool failed)
// --exe takes the game ids as64, mowas2, goh and the vfs names mowas_2 (lib/games), comma separated; default all three.
// wraps sdllint + refcheck; one pass per exe: the as64 pass mounts as64/core (and as64+ for a modern mod), the mowas2 pass gives
// sdllint and refcheck --exe mowas_2 (no as64/core, no as64+ in the vfs view: PORT-48), the goh pass reads the GoH install.
// nothing is written to the game or the mod.
// exit: 0 = every verdict LOADS_STATIC, 1 = any LIKELY_CRASH or REFUSED (game crashes or silently drops the mod), 2 = usage, wouldload failed, or an UNKNOWN verdict.
// Author: Imperator_Aug (ARSENAL, ia-d51aaca2)
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const C = require('../modmove/lib/common'), vfs = require('../lib/vfs'), pak = require('../lib/pak');
const { readText } = require('../lib/enc'), sdl = require('../lib/sdl'), games = require('../lib/games');

const AS64_PLAIN = C.MODERN_MIN;   //  PRODUCT_VERSION "3.301": the PE field carries the data version, not this one
const CLS = require('./classes');   // engine behaviour per crash code with source cites; SPAWN = fatal when the entity def is first read, USE = dies when the item is used
const { reachability, reachAll } = require('./reach');   // REACHABLE | ORPHAN | UNKNOWN per crash entity; ORPHAN is reported, not counted
// sdllint codes that are fatal when an entity def is read: the HARD set of classes.js (ERROR_MSG sites, cited there)
const CRASH_LINT = { has: c => CLS.isHard(c) };
const LABEL = { as64: 'as64.exe', mowas2: 'mowas_2.exe', goh: 'call_to_arms.exe' };
const MODINFO_FATAL = /^(SYNTAX|MODINFO_PARSE|ENC_BOM)$/;

// ---- mod.info
function readModInfo(dir) {
  const f = path.join(dir, 'mod.info');
  if (!fs.existsSync(f)) return null;
  const r = readText(f, 'cp1251'), out = { min: '', max: '', minSet: false, maxSet: false, requires: [], tags: '' };
  if (r.fatal) return out;
  const root = sdl.kids(sdl.parseLines(r.lines, () => {}), 'mod')[0];
  if (!root) return out;
  for (const k of root.kids) {
    const n = String(k.name || '').toLowerCase(), v = k.vals.length ? String(k.vals[0].v) : '';
    if (n === 'mingameversion') { out.min = v; out.minSet = true; }
    else if (n === 'maxgameversion') { out.max = v; out.maxSet = true; }
    else if (n === 'require') out.requires.push(v.split(':')[0].toLowerCase());
    else if (n === 'tags') out.tags = (out.tags ? out.tags + ' ' : '') + v;   // GoH key (GHVFS-02): one string of space-separated words; every Tags line counts, as lib/vfs [I]
  }
  return out;
}
// GHVFS-02 [V]: GoH tag "develop" lifts the version check, the same test as modinfo GOH_DEVELOP
const isDevelop = mi => !!(mi && /(^|\s)develop(\s|$)/i.test(mi.tags || ''));
const isModern = mi => { const v = C.verParse(mi && mi.min); return v.length > 0 && C.verCmp(v, C.MODERN_MIN) >= 0; };

// ---- version gate: IsGameVersionSupported (as64, mowas2 = legacy branch only). GoH: PORT-46, goh-drive
// ver = data version (AS2) or exe version (GoH), string|null. -> {state:'accepted'|'refused'|'unknown', text}
function gate(target, mi, ver) {
  if (!mi) return { state: 'refused', text: 'no mod.info: no exe lists this folder as a mod' };
  const mn = C.verParse(mi.min), mx = C.verParse(mi.max), rng = `Min "${mi.min}" Max "${mi.max}"`, res = (state, text) => ({ state, text });
  if (target === 'goh') {
    if (isDevelop(mi)) return res('accepted', `Tags has "develop": GoH skips the version check, ${rng} not compared [V rule, GHVFS-02]`);
    // GHVFS-26 [V]: each bound optional, a missing one is open; a mod.info with no bounds loads on any version (the same rule as lib/vfs)
    if (!mn.length && !mx.length) return res('accepted', `no usable Min or Max: open on GoH, any exe version [V rule, GHVFS-26]`);
    const v = C.verParse(ver);
    if (!v.length) return res('unknown', `GoH exe version unknown, ${rng} not compared: not tested`);
    const anyMin = /^any$/i.test(mi.min), anyMax = /^any$/i.test(mi.max);   // goh-drive: "any" accepted
    if (mn.length && !anyMin && C.verCmp(v, mn) < 0) return res('refused', `${rng}: GoH exe ${ver} is below Min [V rule, PORT-46]`);
    if (mx.length && !anyMax && C.verCmp(v, mx) > 0) return res('refused', `${rng}: GoH exe ${ver} is above Max [V rule, PORT-46]`);
    return res('accepted', `${rng} holds GoH exe ${ver}` + (!mi.maxSet || !mi.minSet ? ' (one bound absent: open [V rule, GHVFS-26])' : ''));
  }
  if (target === 'as64' && isModern(mi)) {
    if (C.verCmp(AS64_PLAIN, mn) < 0) return res('refused', `modern mod, Min "${mi.min}" is above as64 plain version ${AS64_PLAIN.join('.')}`);
    return res('accepted', `modern mod, Min "${mi.min}" <= as64 plain version ${AS64_PLAIN.join('.')}, no Max check; needs as64+ in {mods} (Enhanced)`);
  }
  if (!mn.length || !mx.length) return res('refused', `legacy mod needs both Min and Max, got ${rng}`);
  const v = C.verParse(ver);
  if (C.verCmp(v, mn) < 0 || C.verCmp(v, mx) > 0) return res('refused', `${rng} does not hold data version ${ver}`);
  return res('accepted', `legacy mod, ${rng} holds data version ${ver}` + (target === 'as64' ? ' (runs in Classic, no as64+)' : ''));
}

// ---- what the engine would mount of this folder (VFS-26, VFS-14; vfs.js mount step): .pak + N.pat
// goh: GoH mods ship localizations/<lang>.pak (plural dir, as GoH vanilla localizations/default.pak) [I]
function pakSurvey(modDir, files, goh) {
  const low = files.map(f => [f, f.toLowerCase()]), locRe = goh ? /^(resource|localization|localizations)\// : /^(resource|localization)\//;
  const pats = new Set(low.filter(x => /^\d+\.pat$/.test(x[1])).map(x => parseInt(x[1], 10)));
  let top = 0; while (pats.has(top + 1)) top++;
  const mountable = [], ignored = [];
  for (const [f, l] of low) {
    if (/^\d+\.pat$/.test(l)) (parseInt(l, 10) <= top ? mountable : ignored).push(f);
    else if (l.endsWith('.pak')) (l === 'resource.pak' || l === 'localization.pak' || locRe.test(l) ? mountable : ignored).push(f);
  }
  return { mountable, ignored };
}

// ---- mount plan for one game dir: the same vfs.build sdllint + refcheck do, so what they will read is known, not assumed
// t = 'as64' | 'mowas2' | 'goh'. as64 names no exe to the vfs (its own pick, as before); mowas2 names mowas_2, so the shared
// AS2 folder is not read as as64 (as64/core, as64+ left out); goh names goh, so a --goh folder is read as GoH even when the vfs
// would not pick it from its exe files (sdllint and refcheck get the same --exe)
const VFS_EXE = { mowas2: 'mowas_2', goh: 'goh' };
function mountPlan(modDir, gameDir, mi, survey, t) {
  const goh = t === 'goh', vexe = VFS_EXE[t], as64 = t !== 'mowas2' && fs.existsSync(path.join(gameDir, 'as64.exe'));
  const out = { gameDir, mounted: false, why: '', list: [], others: new Set(), unread: [...survey.mountable], requireMissing: [], v: null, note: '', ms: 0 };
  const t0 = Date.now();
  const under = path.resolve(path.dirname(modDir)).toLowerCase() === path.resolve(gameDir, 'mods').toLowerCase();
  const problems = [];
  let found = new Map();
  try { found = vfs.discover(path.resolve(gameDir), problems, { plus: as64 }); } catch (e) { out.why = 'mod discovery failed: ' + e.message; }
  // Require of the mod and of each required mod, in the list or vfs skips the mod (VFS-17)
  const id = path.basename(path.resolve(modDir)).toLowerCase();
  const reqs = [], seen = new Set([id]);
  const addReq = names => { for (const r of names) { if (seen.has(r)) continue; seen.add(r); const m = found.get(r); if (!m) { out.requireMissing.push(r); continue; } reqs.push(r); addReq(m.requires || []); } };
  addReq((mi && mi.requires) || []);
  // GoH Workshop mod (outside <goh>/mods, GOHMOD-3): not mounted, but sdllint reads its resource paks directly when the game is GoH;
  // a pak counts as read when its directory lists (localization paks: listed only, not linted)
  if (!under && goh) {
    out.direct = true;
    out.unread = survey.mountable.filter(f => { try { pak.list(path.join(modDir, f)); return false; } catch (e) { return true; } });
    out.why = `folder is not under ${C.fwd(path.join(gameDir, 'mods'))}, cannot mount`;
    out.ms = Date.now() - t0; return out;
  }
  if (!under) { out.why = `folder is not under ${C.fwd(path.join(gameDir, 'mods'))}, cannot mount`; out.ms = Date.now() - t0; return out; }
  const list = [...new Set([...(isModern(mi) && as64 ? ['as64+'] : []), ...reqs, id])];
  try {
    const v = vfs.build(vexe ? { gameDir, mods: list, exe: vexe } : { gameDir, mods: list });
    vfs.closeRecs();
    if (v.mods.includes(id)) {
      out.mounted = true; out.list = list; out.v = v;
      for (const x of list) if (x !== id) out.others.add(x);
      const bad = new Set(v.problems.filter(p => p.code === 'PAK_BAD').map(p => C.fwd(p.where).toLowerCase()));
      // a Workshop item of the same id loads instead of the mods/ folder (VFS-51): read and judge what would load
      const m = found.get(id);
      if (m && path.resolve(m.dir).toLowerCase() !== path.resolve(modDir).toLowerCase()) {
        out.note = `engine mounts ${C.fwd(m.dir)} for this id, not the folder given: that copy was read, the folder given was not`;
        out.lintDir = path.resolve(m.dir); out.files = C.walk(out.lintDir); out.survey = pakSurvey(out.lintDir, out.files);
      }
      const base = out.lintDir || modDir, sv = out.survey || survey;
      out.unread = sv.mountable.filter(f => bad.has(C.fwd(path.join(base, f)).toLowerCase()));
    } else {
      const p = v.problems.filter(x => /^MOD_/.test(x.code) && x.code !== 'MOD_ROOT_IGNORED' && x.code !== 'MOD_ROOT_PATCH').map(x => x.code + ' ' + x.msg);
      out.why = `vfs did not mount it (the tools mount at ${goh ? 'the GoH exe version' : 'the AS2 version 3.262.1'}): ` + (p.find(x => x.toLowerCase().includes(`"${id}"`)) || p[0] || 'no reason given');   // the line about this mod, not another folder's
    }
  } catch (e) { out.why = 'vfs build failed: ' + e.message; }
  out.ms = Date.now() - t0;
  return out;
}

// ---- child tool, async so the passes run side by side (common.runTool is sync)
function runAsync(tool, args, timeoutMs) {
  return new Promise(resolve => {
    const t0 = Date.now(), chunks = [];
    let errTail = '', timedOut = false;   // GUI-LOC: say why a pass ended without its findings line (exit 134 = out of memory, timeout)
    const child = cp.spawn(process.execPath, [path.join(C.TOOLS, tool, tool + '.js'), ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = timeoutMs > 0 ? setTimeout(() => { timedOut = true; C.killTree(child.pid); }, timeoutMs) : null;   // --timeout 0 = no limit
    child.stdout.on('data', d => chunks.push(d));
    child.stderr.on('data', d => { errTail = (errTail + d).slice(-2000); });
    child.on('error', e => { clearTimeout(timer); resolve({ ok: false, out: '', why: e.message, ms: Date.now() - t0 }); });
    child.on('close', code => {
      clearTimeout(timer);
      const out = Buffer.concat(chunks).toString('utf8');
      // the count line proves the tool got to its end; exit status only says whether it found something
      const ok = /^\d+ findings/m.test(out);
      const oom = code === 134 || /out of memory|heap limit|Allocation failed/i.test(errTail);
      const why = ok ? '' : `${tool} ended without a findings line${timedOut ? ` (killed after ${timeoutMs / 1000}s timeout)` : oom ? ` (exit ${code}: out of memory)` : code ? ` (exit ${code})` : ''}`;
      resolve({ ok, out, why, oom, timedOut, code, ms: Date.now() - t0 });
    });
  });
}

// ---- classify. root of an include chain = last [via]; entity = basename of a .def under resource/entity (entityindex, engine)
const isEntityDef = f => /^(resource\/)?entity\/.*\.def$/i.test(C.fwd(f));
const baseName = f => C.fwd(f).split('/').pop().replace(/\.def$/i, '').toLowerCase();
function classify(lint, ref, plan) {
  const crash = new Map(), silent = [];
  let more = 0, foreign = 0;
  const isForeign = f => {
    const r = plan.v && plan.v.files.get(C.fwd(f).toLowerCase());
    return !!r && [...plan.others].some(o => r.layer === o || String(r.layer).startsWith(o + ' patch'));
  };
  const hit = (ent, f, why, cls) => { const e = crash.get(ent); if (e) e.more++; else crash.set(ent, { entity: ent, cls: cls || (CLS.OTHER[f.code] || ['SPAWN'])[0], file: f.file, line: f.line, code: f.code, msg: f.msg.replace(/\s+\[via .*$/, '') + (why || ''), more: 0 }); };
  // a def refcheck names as a losing duplicate is never loaded (ENG-04), so its findings can't crash that entity [I]
  const losers = new Set(ref.filter(f => f.code === 'ENTITY_REDEFINITION' && /is ignored/.test(f.msg)).map(f => C.fwd(f.file).toLowerCase()));
  for (const f of lint) {
    if (isForeign(f.file)) { foreign++; continue; }
    const vias = [...f.msg.matchAll(/\[via (.+?):\d+\]/g)];
    const root0 = vias.length ? vias[vias.length - 1][1] : f.file;
    // GoH paks read directly (plan.direct): sdllint names 'resource/x.pak!entity/..'; the entry name is the virtual path under resource/
    const root = plan.direct ? C.fwd(root0).replace(/^[^!]*\.pak!/i, 'resource/') : root0;
    if (CRASH_LINT.has(f.code) && isEntityDef(root) && !losers.has(C.fwd(root).toLowerCase())) hit(baseName(root), f);
    // HARD code under a set/ root (LoadStuff / ReloadGameData read it at game start, classes.js loadRoot): LOAD class, fatal at start, no reach question [I]
    else if (CRASH_LINT.has(f.code) && CLS.loadRoot(root)) hit('set:' + C.fwd(root).toLowerCase(), f, '', 'LOAD');
    else silent.push(f);
  }
  for (const f of ref) {
    if (isForeign(f.file)) { foreign++; continue; }
    const one = /\(entity ([^)]+)\)\s*$/.exec(f.msg), many = /\(\+(\d+) entities, e\.g\. ([^)]+)\)\s*$/.exec(f.msg);
    if (f.code === 'REF_WEAPON_UNKNOWN' && (one || many) && !losers.has(C.fwd(f.file).toLowerCase())) {
      if (one) hit(one[1].toLowerCase(), f);
      else { const names = many[2].split(', ').map(s => s.trim().toLowerCase()); for (const n of names) hit(n, f); more += Math.max(0, +many[1] + 1 - names.length); }
    } else silent.push(f);
  }
  return { crash: [...crash.values()].sort((a, b) => a.entity < b.entity ? -1 : 1), unnamed: more, silent, foreign };
}

// ---- verdict for one exe. pure: test/ calls it on hand-made states
// s: {exeFound, gate, fatalInfo, startup, readProblems:[text], toolFailed:[text], crash:[], unnamed, tested}
function verdict(s) {
  if (!s.exeFound) return { verdict: 'UNKNOWN', text: 'exe not found, nothing to judge: not tested' };
  if (s.fatalInfo) return { verdict: 'LIKELY_CRASH', text: `mod.info does not parse: ${s.fatalInfo} (ENG-24: stops game start on every exe)` };
  if (s.gate.state === 'refused') return { verdict: 'REFUSED', text: s.gate.text };
  if (s.startup) return { verdict: 'LIKELY_CRASH', text: s.startup };
  const partial = [...(s.readProblems || []), ...(s.toolFailed || [])];
  if (s.gate.state === 'unknown') partial.unshift(s.gate.text);
  // only REACHABLE + UNKNOWN count; an entry without .reach (hand-made state) counts
  const all = s.crash || [], crash = all.filter(c => c.reach !== 'ORPHAN'), orph = all.length - crash.length;
  const on = orph ? ` (${orph} ORPHAN_CRASH not counted: not reachable from the mod or vanilla)` : '';
  if (partial.length) return { verdict: 'UNKNOWN', text: partial.join('; ') + (crash.length ? `; ${crash.length} crash-class candidates in what was read, they may be wrong without the unread part` : '') + on };
  if (crash.length || s.unnamed) {
    const f = crash[0];
    return { verdict: 'LIKELY_CRASH', text: `${crash.length + (s.unnamed || 0)} entities are crash-class candidates, static only, not run.${f ? ` first: ${f.entity}: ${f.code}` : ''}${on}` };
  }
  return { verdict: 'LOADS_STATIC', text: (orph ? 'no counted crash class found' : 'no crash class found') + ', version accepted: static only, not run' + on };
}

// ---- reachability (reach.js): adds .reach/.reachWhy to each crash entry; one scan per pass serves every exe on it
function annotate(crash, p) {
  if (!crash.length) return;
  const pl = p.plan;
  if (!pl.mounted || !pl.v) { for (const e of crash) { e.reach = 'UNKNOWN'; e.reachWhy = 'mod not mounted by the tools: no vanilla/layer view to judge reachability'; } return; }
  p.memo = p.memo || {};
  // LOAD class (set/ roots) is read at game start: nothing to reach
  for (const e of crash) if (e.cls === 'LOAD') { e.reach = 'REACHABLE'; e.reachWhy = 'read at game start (set/ root)'; }
  const ents = crash.filter(e => e.cls !== 'LOAD');
  if (!ents.length) return;
  try {
    const res = reachability(pl.v, pl.list[pl.list.length - 1], new Set(ents.map(e => e.entity)), p.memo);
    for (const e of ents) { const r = res.get(e.entity); e.reach = r.reach; e.reachWhy = r.why; }
  } catch (err) { for (const e of ents) { e.reach = 'UNKNOWN'; e.reachWhy = 'reachability scan failed: ' + err.message; } }
  vfs.closeRecs();
}

// ---- passes
async function runPass(key, modDir, gameDir, plan, o) {
  if (o.inject) {
    // inject keys: as64 | mowas2 | goh; 'as2' serves as64 and mowas2 when they have no key of their own (the old one-pass form)
    const j = o.inject[key] || (key !== 'goh' && o.inject.as2) || {}, mk = n => j[n] === null ? { ok: false, out: '', why: n + ' failed (injected)', ms: 0 } : { ok: true, out: j[n] || '0 findings\n', why: '', ms: 0 };
    return { lint: mk('sdllint'), ref: mk('refcheck') };
  }
  const cacheKey = crypto.createHash('md5').update([path.resolve(gameDir), plan.mounted ? plan.list.join(',') : path.resolve(modDir)].join('|').toLowerCase()).digest('hex').slice(0, 12);
  require('../lib/cachewrite').mkdir(o.cacheDir);   // read-only folder: one stderr line; refcheck then runs without writing its cache
  // as64 keeps the old 'as2-' cache name (it is the view the old shared pass read); mowas2 and goh have their own
  const tc = require('../lib/toolcache'), cacheName = (key === 'as64' ? 'as2' : key) + '-' + cacheKey + '.json';   // default dir: per-user, an old file in tools/wouldload/cache copied over
  const cache = path.resolve(o.cacheDir) === path.resolve(tc.dir('wouldload')) ? tc.file('wouldload', cacheName, path.join(__dirname, 'cache')) : path.join(o.cacheDir, cacheName);
  // modDir, not plan.lintDir: sdllint scopes to the layer named by the folder's basename, and that is the mod id
  const lintArgs = [modDir, '--game', gameDir, '-q', '--no-rc'], refArgs = [gameDir, '--scope', 'mod', '-q', '--no-rc', '--cache', cache];
  if (plan.mounted) { lintArgs.push('--mods', plan.list.join(',')); refArgs.push('--mods', plan.list.join(',')); }
  else refArgs.push('--folder', modDir);
  if (VFS_EXE[key]) { lintArgs.push('--exe', VFS_EXE[key]); refArgs.push('--exe', VFS_EXE[key]); }
  const lintP = runAsync('sdllint', lintArgs, o.timeout), warm = o.noWarm ? null : await warmVanilla(key, gameDir, cache, o);
  const [lint, ref] = await Promise.all([lintP, runAsync('refcheck', refArgs, o.timeout)]);
  return { lint, ref, warm };
}
// refcheck seeds a mod run that has no cache of its own from the vanilla entityindex cache of the same exe (refcheck seedCache).
// When that vanilla cache is missing too, one vanilla refcheck of the same exe and folder builds it first, under its own timeout, so
// the mod run starts warm (a cold GoH mod run parsed the whole GoH tree inside the mod run's limit) and every later mod is warm.
// The mod's findings do not change; a failed warm run leaves the mod run cold, as before. --no-warm skips it.
async function warmVanilla(key, gameDir, cache, o) {
  const ix = require('../entityindex/index'), exe = VFS_EXE[key];
  let modCache, vanilla;
  try { modCache = ix.cachePath(cache, exe, gameDir); vanilla = ix.cachePath(path.join(C.TOOLS, 'entityindex', 'cache', 'vanilla.json'), exe, gameDir); }
  catch (e) { return null; }
  if (fs.existsSync(modCache) || fs.existsSync(vanilla)) return null;
  if (!o.q) console.error(`wouldload: no vanilla refcheck cache for ${LABEL[key]} yet: building it once (first run on this machine)`);
  const r = await runAsync('refcheck', [gameDir, '-q', '--no-rc', ...(exe ? ['--exe', exe] : [])], o.timeout);
  return { ok: r.ok && fs.existsSync(vanilla), ms: r.ms, why: r.why };
}

async function analyse(modDir, o) {
  const t0 = Date.now();
  const inst = C.installs({ as2: o.game, goh: o.goh });
  const files = C.walk(modDir), survey = pakSurvey(modDir, files), surveyGoh = pakSurvey(modDir, files, true), mi = readModInfo(modDir);
  const surveyOf = key => key === 'goh' ? surveyGoh : survey;
  let fatalInfo = '';
  if (mi && !o.inject) {
    const r = C.runTool('modinfo', [modDir, '-q', '--no-rc']);
    const f = C.parseFindings(r.out).find(x => MODINFO_FATAL.test(x.code));
    if (f) fatalInfo = `${f.code} line ${f.line}: ${f.msg}`;
  }
  // per exe: exe + gate first, so a pass only runs where something can come of it
  const exes = {};
  for (const t of o.exes) {
    const exe = C.exeOf(t, inst, o), exeFound = !!exe && fs.existsSync(exe);
    const dv = C.dataVersion(t, exeFound ? exe : null);
    const ver = t === 'goh' ? (o.verGoh || dv.ver || null) : dv.ver;
    exes[t] = { target: t, exe: exe ? C.fwd(exe) : null, exeFound, version: ver, versionSrc: t === 'goh' && o.verGoh ? '--ver-goh' : dv.src, gate: gate(t, mi, ver), fatalInfo };
    const rq = (mi && mi.requires) || [];
    if (t === 'as64' && mi && !isModern(mi) && rq.includes('as64+')) exes[t].startup = 'legacy mod (Min < 3.301) requires as64+: mode mismatch at startup (ENG-26), first load crash class on as64';
  }
  // one pass per exe (as64, mowas2, goh): the two AS2 exes share the install folder but not the vfs view (as64/core, as64+)
  const wanted = t => exes[t].exeFound && exes[t].gate.state !== 'refused' && !fatalInfo;
  const roots = { as64: inst.as2, mowas2: inst.as2, goh: inst.goh }, passes = {};
  const jobs = [];
  for (const key of C.TARGETS) {
    if (!o.exes.includes(key) || !wanted(key)) continue;
    const plan = mountPlan(modDir, roots[key], mi, surveyOf(key), key);
    passes[key] = { plan };
    jobs.push(runPass(key, modDir, roots[key], plan, o).then(r => { passes[key].lint = r.lint; passes[key].ref = r.ref; passes[key].warm = r.warm; }));
  }
  // --reach-all needs only the pass's view, not its lint: scanned here while sdllint and refcheck run in their own processes (before: after
  // them, 5-10 s per pass on top). Own memo, so the crash rows' reach (annotate) reads as before.
  if (o.reachAll) for (const key of Object.keys(passes)) {
    const p = passes[key];
    if (!p.plan.mounted || !p.plan.v) continue;
    try { p.reachAll = reachAll(p.plan.v, p.plan.list[p.plan.list.length - 1], {}); } catch (err) { p.reachAll = { none: 'reach scan failed: ' + err.message }; }
    vfs.closeRecs();
    await new Promise(r => setImmediate(r));   // read the children's pipes between the passes
  }
  await Promise.all(jobs);
  for (const t of o.exes) {
    const x = exes[t], key = t, p = passes[key];
    const read = { files: files.length, paks: surveyOf(key).mountable.length, paksRead: 0, unread: [], ignored: surveyOf(key).ignored, mounted: false, why: '', lintFiles: null, note: '' };
    x.read = read; x.crash = []; x.unnamed = 0; x.silent = []; x.readProblems = []; x.toolFailed = [];
    if (p && wanted(t)) {
      x.tested = true;
      read.mounted = p.plan.mounted; read.why = p.plan.why; read.note = p.plan.note; if (p.plan.direct) read.direct = true;
      const sv = p.plan.survey || surveyOf(key);
      if (p.plan.files) read.files = p.plan.files.length;
      read.paks = sv.mountable.length; read.ignored = sv.ignored;
      read.patches = sv.mountable.filter(f => /\.pat$/i.test(f)).length;
      const warned = C.parseFindings(p.lint.out).some(f => f.code === 'WARN_SDLLINT_PAKS_UNREAD');
      read.unread = warned && !p.plan.unread.length ? [...sv.mountable] : p.plan.unread;
      read.paksRead = sv.mountable.length - read.unread.length;
      const fm = /^(\d+) files \(/m.exec(p.lint.out); if (fm) read.lintFiles = +fm[1];
      const req = [...p.plan.requireMissing, ...(t === 'mowas2' && mi.requires.includes('as64+') ? ['as64+'] : [])];
      if (read.unread.length) x.readProblems.push(`${read.unread.length} of ${sv.mountable.length} paks unread (${read.unread.slice(0, 5).join(', ')}${read.unread.length > 5 ? ', ...' : ''}): ${read.why || 'bad pak'}`);
      if (req.length) x.readProblems.push(`Require ${[...new Set(req)].join(', ')} not installed for this exe: engine skips the mod (VFS-17)`);
      for (const [n, r] of [['sdllint', p.lint], ['refcheck', p.ref]]) if (!r.ok) x.toolFailed.push(`${n} did not finish (${r.why}): not tested`);
      const lint = p.lint.ok ? C.parseFindings(p.lint.out).filter(f => !f.info) : [], ref = p.ref.ok ? C.parseFindings(p.ref.out).filter(f => !f.info) : [];
      const c = classify(lint.filter(f => f.code !== 'WARN_SDLLINT_PAKS_UNREAD'), ref, p.plan);
      x.crash = c.crash; x.unnamed = c.unnamed; x.silent = c.silent; x.foreign = c.foreign;
      annotate(c.crash, p);
      // --reach-all (tools/check reach gate): reach of every mod def + unreferenced entity meshes, one scan per pass
      if (o.reachAll) {
        if (!p.reachAll) {
          if (!p.plan.mounted || !p.plan.v) p.reachAll = { none: 'mod not mounted by the tools: no reach judged' };
          else { try { p.memo = p.memo || {}; p.reachAll = reachAll(p.plan.v, p.plan.list[p.plan.list.length - 1], p.memo); } catch (err) { p.reachAll = { none: 'reach scan failed: ' + err.message }; } vfs.closeRecs(); }
        }
        x.reachAll = p.reachAll;
      }
      x.orphans = c.crash.filter(e => e.reach === 'ORPHAN').map(e => e.entity);
      x.reachCounts = { REACHABLE: 0, ORPHAN: 0, UNKNOWN: 0 };
      for (const e of c.crash) x.reachCounts[e.reach]++;
    }
    Object.assign(x, verdict(x));
    if (t === 'goh' && x.tested) x.text += ' [I: GoH dialect noise in the findings]';
  }
  const timing = {};
  for (const k of Object.keys(passes)) { timing[k] = { vfs: passes[k].plan.ms, sdllint: passes[k].lint.ms, refcheck: passes[k].ref.ms }; if (passes[k].warm) timing[k].warm = passes[k].warm.ms; }
  return { mod: C.fwd(modDir), modInfo: mi && { min: mi.min, max: mi.max, requires: mi.requires, modern: isModern(mi) }, exes, timing, ms: Date.now() - t0 };
}

// ---- print
function printAll(R, o) {
  const L = s => console.log(s);
  L(`wouldload ${R.mod}`);
  L(R.modInfo ? `mod.info: Min "${R.modInfo.min}" Max "${R.modInfo.max}"${R.modInfo.modern ? ' (modern)' : ' (legacy)'}${R.modInfo.requires.length ? ', Require ' + R.modInfo.requires.join(' ') : ''}` : 'mod.info: none');
  let total = 0, shown = null;
  for (const t of o.exes) {
    const x = R.exes[t], tag = t === 'goh' ? ' [I]' : '';
    L(''); L(`== ${t} (${x.exe || 'no install path'}${x.exeFound ? '' : ', MISSING'})`);
    const rd = x.read;
    if (!x.tested) L(`READ: ${rd.files} files, ${rd.paks} paks found, 0 read: not tested`);
    else {
      let s = `READ: ${rd.files} files, ${rd.paksRead} of ${rd.paks} paks read`;
      s += rd.mounted ? ', mod mounted' : rd.direct ? `, mod NOT mounted (${rd.why}), its paks read directly (resource paks linted, localization paks listed only)` : `, mod NOT mounted (${rd.why}), loose files only`;
      if (rd.lintFiles !== null) s += `; sdllint read ${rd.lintFiles} SDL files`;
      L(s);
      if (rd.unread.length) L(`UNREAD paks: ${rd.unread.join(', ')}`);
      if (rd.note) L(`NOTE: ${rd.note}`);
      if (rd.mounted && rd.patches) L(`NOTE: ${rd.patches} N.pat read by refcheck only: sdllint scopes to the mod layer and skips patch layers`);
    }
    if (rd.ignored.length) L(`IGNORED by the engine, not read (VFS-26, VFS-14): ${rd.ignored.join(', ')}`);
    L(`VERSION: ${x.gate.state} on ${x.version || 'unknown version'} (${x.versionSrc}): ${x.gate.text}`);
    if (!x.tested) L('FINDINGS: not tested (no lint run for this exe)');
    else {
      // each exe has its own pass now: "same list" only when the two AS2 lists are equal entry for entry
      const sig = JSON.stringify(x.crash.map(c => [c.entity, c.file, c.line, c.code, c.cls, c.msg, c.more, c.reach]));
      const sameAs = shown && t !== 'goh' && shown.t !== 'goh' && shown.sig === sig ? shown.t : null;
      const counted = x.crash.filter(c => c.reach !== 'ORPHAN'), orph = x.crash.filter(c => c.reach === 'ORPHAN');
      L(`CRASH CLASS: ${counted.length} entities named${x.unnamed ? ` + ${x.unnamed} unnamed behind shared refs` : ''} (candidates, static, precision unmeasured)${tag}`);
      if (sameAs) L(`  same list as ${sameAs} above`);
      else {
        for (const c of counted) L(`  ${c.entity}: ${c.file}:${c.line}: ${c.code} class ${c.cls}:${c.msg}${c.more ? ` (+${c.more} more)` : ''} reach ${c.reach || '-'}${tag}`);
        if (orph.length) {
          L(`ORPHAN_CRASH ${orph.length}: not reachable from the mod or vanilla, not counted${tag}`);
          for (const c of orph) L(`  ${c.entity}: ${c.file}:${c.line}: ${c.code}${o.q ? '' : ' - ' + c.reachWhy}`);
        }
      }
      if (!shown) shown = { t, sig };
      const by = {};
      for (const f of x.silent) by[f.code] = (by[f.code] || 0) + 1;
      if (!o.q) L(`SILENT or cosmetic: ${x.silent.length} findings${tag}: ${Object.entries(by).sort((a, b) => b[1] - a[1]).map(e => e[0] + ' ' + e[1]).join(', ') || 'none'}`);
      if (x.foreign) L(`not counted: ${x.foreign} findings in required mods`);
      total += counted.length;
    }
    L(`VERDICT ${t}: ${x.verdict}: ${x.text}`);
  }
  L('');
  if (o.time) {
  const tp = Object.entries(R.timing).map(([k, v]) => `${k}: vfs ${(v.vfs / 1000).toFixed(1)} s, sdllint ${(v.sdllint / 1000).toFixed(1)} s, refcheck ${(v.refcheck / 1000).toFixed(1)} s` + (v.warm !== undefined ? ` (after a vanilla refcheck warm run of ${(v.warm / 1000).toFixed(1)} s)` : '')).join('; ');
  L(`time: ${(R.ms / 1000).toFixed(1)} s${R.ms > 30000 ? ' (over the 30 s target)' : ''}${tp ? ' (' + tp + ', side by side)' : ''}`);
  }
  L(`${total} findings`);
}

function usage(rc = 2) { (rc ? console.error : console.log)('usage: node wouldload.js <modDir> [--exe as64,mowas2|mowas_2,goh] [--game AS2dir] [--goh GoHdir] [--json f] [--reach-all] [--time] [--no-warm] [--timeout sec, 0 = none; default 600 per pass] [-q]\n  exit 0 = all LOADS_STATIC, 1 = any LIKELY_CRASH or REFUSED, 2 = usage, tool failed, or UNKNOWN'); process.exit(rc); }

function parseArgs(argv) {
  const o = { exes: C.TARGETS.slice(), q: false, timeout: 600000, cacheDir: require('../lib/toolcache').dir('wouldload') }, pos = [];
  const VALS = { '--game': 'game', '--goh': 'goh', '--json': 'json', '--exe-as64': 'exe-as64', '--exe-mowas2': 'exe-mowas2', '--exe-goh': 'exe-goh', '--ver-goh': 'verGoh', '--cache-dir': 'cacheDir', '--inject': 'injectFile' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') usage(0);
    if (a === '-q') o.q = true;
    else if (a === '--reach-all') o.reachAll = true;
    else if (a === '--time') o.time = true;
    else if (a === '--no-warm') o.noWarm = true;
    else if (a === '--timeout') { const v = argv[++i]; if (!/^\d+(\.\d+)?$/.test(v || '')) usage(); const ms = +v * 1000; o.timeout = ms <= 2147483647 ? ms : 0; }   // seconds per pass; 0, or more than a timer can hold = no limit (check passes 0)
    else if (a === '--exe') { if (argv[i + 1] === undefined) usage(); o.exes = [...new Set(argv[++i].split(',').map(s => s.trim().toLowerCase()).filter(Boolean).map(s => games.idOf(s) || s))]; }
    else if (VALS[a]) { if (argv[i + 1] === undefined) usage(); o[VALS[a]] = argv[++i]; }
    else if (a[0] === '-') usage();
    else pos.push(a);
  }
  if (pos.length !== 1 || !o.exes.length || o.exes.some(t => !C.TARGETS.includes(t))) usage();
  if (!fs.existsSync(pos[0]) || !fs.statSync(pos[0]).isDirectory()) { console.error('wouldload: not a folder: ' + pos[0]); process.exit(2); }
  o.modDir = path.resolve(pos[0]);
  if (o.injectFile) o.inject = JSON.parse(fs.readFileSync(o.injectFile, 'utf8'));
  return o;
}

if (require.main === module) {
  const o = parseArgs(process.argv.slice(2));
  analyse(o.modDir, o).then(R => {
    printAll(R, o);
    if (o.json) {
      const j = JSON.parse(JSON.stringify(R));
      if (!o.time) { delete j.timing; delete j.ms; }   // DET-FIX: clock values only with --time
      fs.writeFileSync(o.json, JSON.stringify(j, null, 1));
    }
    const vs = o.exes.map(t => R.exes[t] && R.exes[t].verdict);
    process.exitCode = vs.some(v => v === 'LIKELY_CRASH' || v === 'REFUSED') ? 1 : vs.some(v => v !== 'LOADS_STATIC') ? 2 : 0;
  }).catch(e => { console.log('VERDICT all: UNKNOWN: wouldload failed: ' + e.stack); process.exitCode = 2; });
}
module.exports = { CLS, reachability, gate, verdict, classify, pakSurvey, readModInfo, isModern, isDevelop };
