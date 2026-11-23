// fix/gate: every changed SDL file must pass, else that file is reverted and reported.
//   1 target findings gone, by count (lint and refcheck targets alike; set: n/a)   2 no new codes from sdllint + keylint + milint + refcheck on the result
//   3 lib/sdldiff: only the targeted lines changed (flattened entries whose line is not a changed line must be equal)
// run(c, edits, outDir, o) -> Map key -> reason (files to revert). outDir already holds the candidate files.
// Author: Imperator_Aug (ARSENAL, ia-c1f4805e)
const fs = require('fs'), os = require('os'), path = require('path');
const C = require('../../modmove/lib/common'), sdldiff = require('../../lib/sdldiff');

const norm = f => `${String(f.file).toLowerCase().replace(/\\/g, '/')}|${f.code}|${String(f.msg).replace(/:\d+\]/g, ']').replace(/\s+\(\+\d+ entities.*$/, '').replace(/\(entity [^)]*\)/, '').replace(/^map\.info maxPlayers \d+ needs/, 'map.info maxPlayers N needs')}`;   // an odd maxPlayers made even needs the same points
const tally = fs => { const m = new Map(); for (const f of fs) m.set(norm(f), (m.get(norm(f)) || 0) + 1); return m; };

// a child that stopped before it said what it found: spawn error, signal, no text, or a failed exit with no refusal line of refcheck's own
//   (or with a node stack trace). status undefined (a stand-in runner that sets none) is not read as a failure.
const failedExit = r => r.status === null || (typeof r.status === 'number' && r.status !== 0);
const crashText = t => /^\s+at |Error:/m.test(t);
const ownRefusal = t => /MOD_VERSION|named mod\(s\)/.test(t);
const notFinished = r => !!(r.error || r.signal || (!r.out && !r.err) || (failedExit(r) && (!ownRefusal(r.out + '\n' + r.err) || crashText(r.err))));
function notFinishedWhy(r) {
  if (r.error) return r.error.code || r.error.message;
  if (r.signal) return 'signal ' + r.signal;
  const lines = String(r.err || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const line = lines.find(l => /Error:/.test(l)) || lines[0];   // node prints the file:line and the code line before the Error: line
  return line ? line.replace(/[()]/g, '').slice(0, 160) : (r.status === null ? 'killed' : 'exit ' + r.status);
}

function refcheck(c, folder, o) {
  const args = [c.game, '--mods', c.list.join(','), '--scope', 'mod', '-q'];
  if (folder) args.push('--folder', folder);
  if (o.cache) args.push('--cache', o.cache);
  if (c.exe) args.push('--exe', c.exe);   // the fix's game (lib/games); none = as before
  const r = C.runTool('refcheck', args);
  const ok = /^\d+ findings/m.test(r.out);
  // killed (spawn timeout, signal, crash) or silent: say so, so refWhy does not blame the mod.info on an empty text or a stack trace.
  //   A refusal refcheck itself gives (exit 3, 'named mod(s) did not mount' with MOD_VERSION lines) still takes the refWhy path.
  if (!ok && notFinished(r)) { const why = 'refcheck did not finish (' + notFinishedWhy(r) + ')'; return { ok, list: [], err: why, errFull: why }; }
  // err: short, for lines that quote it; errFull: the whole checker text, which refWhy/blocked parse (a later MOD_VERSION line must not be cut off)
  return { ok, list: ok ? C.parseFindings(r.out).filter(f => !f.info) : [], err: ok ? '' : (r.err || r.out).slice(0, 200), errFull: ok ? '' : String(r.err || r.out) };
}

function lintAll(c, folder) {
  const opts = Object.assign({ folder, gameDir: c.game, mods: c.list }, c.exe ? { exe: c.exe } : {}), out = [];   // exe: the fix's game (lib/games); the staged dir already shows it
  for (const [mod, fn] of [['sdllint', 'lint'], ['keylint', 'check'], ['milint', 'check']]) {
    const r = require('../../' + mod + '/' + mod)[fn](opts);
    for (const f of (r.rep || r).toJSON({ tool: mod }).findings) { f.file = String(f.file).replace(/\\/g, '/'); out.push(f); }
  }
  return out;
}

function sdldiffCheck(e) {
  try {
    const a = sdldiff.parse(e.before, { key: e.key }), b = sdldiff.parse(e.after, { key: e.key });
    const bad = [];
    for (const k of new Set([...a.keys(), ...b.keys()])) {
      const x = a.get(k), y = b.get(k);
      if (sdldiff.sameValue(x, y)) continue;
      if (!((x && e.lines.has(x.line)) || (y && e.lines.has(y.line)))) bad.push(k);
    }
    return bad.length ? `sdldiff: untargeted keys changed: ${bad.slice(0, 3).join(', ')}` : null;
  } catch (x) { return 'sdldiff failed: ' + x.message; }
}

// before = refcheck list on the source (given), edits already written under outDir
function run(c, edits, outDir, o) {
  const bad = new Map();
  if (!edits.length) return bad;
  // 3 sdldiff
  for (const e of edits) { const r = sdldiffCheck(e); if (r) bad.set(e.key, r); }
  const keyed = new Map(edits.map(e => [e.key, e]));
  const culprits = (f, cands) => {
    const hit = new Set();
    const fk = String(f.file).toLowerCase(); if (cands.has(fk)) hit.add(fk);
    for (const m of String(f.msg).matchAll(/\[via ([^\]]+?):\d+\]/g)) if (cands.has(m[1])) hit.add(m[1]);
    return hit;
  };
  // 2 lints: baseline = source as mounted (empty overlay), after = the patch folder
  const live = () => new Map([...keyed].filter(([k]) => !bad.has(k)));
  let b0, a0;
  {
    const empty = o.lintBefore ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'fixgate-'));
    try { b0 = tally(o.lintBefore || lintAll(c, empty)); } finally { if (empty) fs.rmSync(empty, { recursive: true, force: true }); }
    a0 = lintAll(c, outDir);
    const seen = new Map();
    for (const f of a0) {
      const k = norm(f); seen.set(k, (seen.get(k) || 0) + 1);
      if (seen.get(k) <= (b0.get(k) || 0)) continue;
      const hit = culprits(f, live());
      if (!hit.size) { for (const e of live().keys()) bad.set(e, `new ${f.code} not attributable to one file (${f.file}); all SDL edits reverted`); }
      else for (const h of hit) bad.set(h, `new ${f.code} ${String(f.msg).slice(0, 80)}`);
    }
  }
  // refcheck: before (no overlay) vs after (overlay = outDir)
  const rb = o.refBefore || refcheck(c, null, o), ra = refcheck(c, outDir, o);
  if (!rb.ok || !ra.ok) { for (const k of live().keys()) bad.set(k, (e => /^refcheck did not finish/.test(e) ? e : 'refcheck did not finish: ' + e)(rb.ok ? ra.err : rb.err)); return bad; }
  const before = tally(rb.list), after = new Map();
  for (const f of ra.list) {
    const k = norm(f); after.set(k, (after.get(k) || 0) + 1);
    if (after.get(k) <= (before.get(k) || 0)) continue;
    const hit = culprits(f, live());
    if (!hit.size) { for (const e of live().keys()) bad.set(e, `new ${f.code} not attributable to one file (${f.file}); all edits reverted`); }
    else for (const h of hit) bad.set(h, `new ${f.code} ${String(f.msg).slice(0, 80)}`);
  }
  // 1 target gone
  // per edit and finding text: n targets must take the count down by n (or to 0: a linter may cap what it prints per file)
  const la = tally(a0), cnt = (m1, m2, k) => (m1.get(k) || 0) + (m2.get(k) || 0);
  for (const e of edits) {
    if (bad.has(e.key) || !e.targets) continue;
    const n = new Map(); for (const t of e.targets) n.set(norm(t), (n.get(norm(t)) || 0) + 1);
    for (const t of e.targets) { const k = norm(t), a = cnt(la, after, k), b = cnt(b0, before, k); if (a > 0 && a > b - n.get(k)) { bad.set(e.key, `target finding still there: ${t.code} line ${t.line}`); break; } }
  }
  return bad;
}

// versionLines(c, err) -> { dep, own }: every MOD_VERSION line of the checker text ({id, ver, min, max}); dep = the first one that names a required
//   mod (not c.id), own = the one that names c.id. A blocked dep is preferred over the own range: fixing this mod's mod.info cannot help it.
function versionLines(c, err) {
  const id = String(c.id).toLowerCase(), all = [];
  for (const m of String(err || '').matchAll(/mod "([^"]+)" unsupported on (?:GoH )?(\S+) \(Min "([^"]*)" Max "([^"]*)"\)/g)) all.push({ id: m[1], ver: m[2], min: m[3], max: m[4] });
  return { dep: all.find(x => x.id.toLowerCase() !== id) || null, own: all.find(x => x.id.toLowerCase() === id) || null, all };
}
// refWhy(c, err, fixedInfo) -> the FIX_REFCHECK_FAILED text. The cause is taken from the checker's own MOD_VERSION lines: when one names a
//   required mod (not c.id), fixing this mod's mod.info cannot help (e.g. an AS64-only dep, Min 3.301, under mowas_2.exe). When only the own
//   mod is named and the modinfo fixer found its range fine (fixedInfo null), the two gates disagree: say so, do not blame the mod.info
//   (real case: a GoH mod tagged develop, which GoH loads at any version, GHVFS-02 [V], while the path checker's vfs gate reads only Min/Max).
function refWhy(c, err, fixedInfo) {
  const said = '. The other fixers still ran. Checker said: ' + String(err).replace(/\s+/g, ' ').slice(0, 160);
  const { dep, own } = versionLines(c, err);
  const nf = /^refcheck did not finish \(([^)]*)\)/.exec(String(err || ''));
  if (nf) return `path fixes (repoint) skipped: the path checker did not finish (${nf[1]}); rerun fix, or pass --cache`;
  if (dep)
    return `path fixes (repoint) skipped: the path checker could not load this mod because it requires "${dep.id}", which does not load on game version ${dep.ver} (its range: Min "${dep.min}" Max "${dep.max}"); fixing this mod's own mod.info will not change that: run fix for the game "${dep.id}" is made for, or drop that requirement` + said;
  if (own && !fixedInfo) {
    const dev = c.exe === 'goh' && /(^|\s)develop(\s|$)/i.test((c.info && c.info.tags) || '');
    return `path fixes (repoint) skipped: the path checker's version gate refused this mod on ${own.ver} (Min "${own.min}" Max "${own.max}"), but the modinfo fixer finds the range loads on this game` +
      (dev ? ' (its tag develop lets GoH load it at any version, GHVFS-02; the path checker does not read that tag yet)' : '') + '; the two gates disagree, so this is a tool limit, not a fault of the mod.info' + said;
  }
  return 'path fixes (repoint) skipped: the path checker could not load this mod' + (fixedInfo ? ' because its mod.info version range is wrong (see modinfo above); fix that, then run fix again' : ' (usually a mod.info the game refuses, or a missing required mod)') + said;
}

module.exports = { run, refcheck, norm, lintAll, refWhy, versionLines };
