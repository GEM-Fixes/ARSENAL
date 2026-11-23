#!/usr/bin/env node
// portverdict: one static verdict per ported unit (NAT-VER, contract verdict/1). Stands in for the in-game port exam. Holds no check of
// its own: runs the part tools as child processes and joins their JSON.
//   node tools/portverdict/portverdict.js <mod dir> --game G [--goh H] [--exe as64|mowas_2|mowas2] [--target as64|mowas2] [--json f] [--part name=file ...]
//   --exe / --target: the AS2 build the port is judged for (lib/games; the two must agree): sdllint --exe <vfs exe> and check --target <id>;
//   none = as64 with the AS64 argument lists as before. goh: refused, exit 2 (GoH is the source of a port, given by --goh)
//   parts: K keys, V values, G gaps  <- tools/native (native/1)
//          S syntax                  <- tools/sdllint --format json, findings (not info) in the unit's files, minus the ref codes below
//          R refs                    <- tools/check --json: crash-class samples in the unit's files. Counted: sev crash; crash codes check
//                                       moved to review only because "nothing in the mod uses this unit" (the exam spawns the unit);
//                                       WARN_PATHER_UNKNOWN (keylint, check rates it silent, but it stopped a port load:
//                                       A sample naming a key listed in <mod>/text-only.tsv counts as resolved.
//          B scale                   <- tools/unitbox (unitbox/1); tool absent or box null: ok null. scale.src = unitbox src
//                                       (goh-ply: the port holds the mdl text only, box from model plys; needs --goh)
//   units: native's classed units (+ variant defs native's dir scan skips, run by def path, see main); when <mod>/gaps/ exists, only those with gaps/<stem>.gaps.json (the ported units, not the ammo/weapon
//   defs a port pulls along).
//   files of a unit: native "defs" when present, else the def plus what it includes inside the mod ((include "x"), {extension "x"}).
//   a part tool that fails: that part ok null with why, the unit is not native and not bar.
//   two results per unit: bar = keys, syntax, refs ok, scale not failed, gaps 0/0 (the owner's static-proof bar; values left out);
//   native = bar and values ok. A unit with only values failing is bar true, native false. Text: NATIVE / bar / no.
//   --part name=file (native|sdllint|check|unitbox): read that JSON instead of running the tool (tests, reruns).
//   output: sorted, no dates, no absolute paths. exit 0 = ran, 2 = usage or no unit list.
// Author: Imperator_Aug (ARSENAL, ia-df79916a)
require('../lib/help')(__filename);
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const games = require('../lib/games');

const TOOLS = path.resolve(__dirname, '..');
const PARTS = ['keys', 'values', 'syntax', 'refs', 'scale', 'gaps'];
const LETTER = { keys: 'K', values: 'V', syntax: 'S', refs: 'R', scale: 'B', gaps: 'G' };
// sdllint codes that are a dangling name, not bad syntax: they go to refs (through check), not syntax
const REF_CODES = new Set(['INCLUDE_MISSING', 'MACRO_UNDEFINED', 'STR_MACRO_UNDEFINED']);
// load-crash codes check does not rate crash (see header)
const EXTRA_CRASH = new Set(['WARN_PATHER_UNKNOWN']);
const ORPHAN_NOTE = 'nothing in the mod uses this unit';

function usage(msg) { if (msg) console.error('portverdict: ' + msg); console.error('usage: node tools/portverdict/portverdict.js <mod dir> --game G [--goh H] [--exe as64|mowas_2] [--target as64|mowas2] [--json f] [--part native|sdllint|check|unitbox=file]'); process.exit(2); }
function parseArgs(argv) {
  const o = { parts: {} }, pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], nx = () => { if (i + 1 >= argv.length) usage(a + ' needs a value'); return argv[++i]; };
    if (a === '--game') o.game = nx(); else if (a === '--goh') o.goh = nx(); else if (a === '--json') o.json = nx();
    else if (a === '--exe' || a === '--target') { const v = nx(), g = games.get(v); if (!g) usage(a + ' must be one of as64|mowas_2|mowas2'); if (g.kind === 'goh') games.refuse('portverdict', g, 'the verdict is for an AS2 build (as64 or mowas2) a GoH port is made for; GoH is the source, given by --goh', 'plan/reports/game-parity/t-port-b.md: n/a (source game)'); o[a.slice(2)] = g.id; }
    else if (a === '--part') { const v = nx(), e = v.indexOf('='); if (e < 1) usage('--part name=file'); o.parts[v.slice(0, e)] = v.slice(e + 1); }
    else if (a === '-h' || a === '--help') usage();
    else if (a.startsWith('-')) usage('unknown option ' + a); else pos.push(a);
  }
  if (o.exe && o.target && o.exe !== o.target) usage('--exe ' + o.exe + ' and --target ' + o.target + ' name two builds');
  if (pos.length !== 1) usage('one mod dir');
  o.mod = path.resolve(pos[0]);
  if (!fs.existsSync(o.mod)) usage('no such mod dir');
  return o;
}

const slash = s => String(s || '').replace(/\\/g, '/');
const lc = s => slash(s).toLowerCase();
const tail = (s, n) => { const t = String(s || '').trim().split(/\r?\n/).filter(Boolean); return t.slice(-n).join(' / ').slice(0, 200); };

// run one part tool -> {data} or {why}
function runTool(name, script, args, tmp, outFlag, extra) {
  const f = path.join(tmp, name + '.json');
  if (!fs.existsSync(script)) return { why: 'tool absent: tools/' + slash(path.relative(TOOLS, script)) };
  const r = cp.spawnSync(process.execPath, [script, ...args, ...outFlag(f), ...(extra || [])], { encoding: 'utf8', maxBuffer: 1 << 28, cwd: path.resolve(TOOLS, '..') });
  if (r.error) return { why: name + ' did not start: ' + r.error.message };
  let data = null;
  try { data = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* below */ }
  if (!data) return { why: `${name} wrote no JSON (exit ${r.status}): ${tail(r.stderr || r.stdout, 2)}` };
  return { data };
}
// argument lists of the part tools (before their output flag). The build: --target, else --exe, else as64 (as before). Named build only:
// sdllint --exe <vfs exe> (mowas_2: no as64/core in its vfs) and check --target <id>; nothing named = the AS64 lists, to the byte.
function childArgs(o) {
  const gameArgs = o.game ? ['--game', o.game] : [], goh = o.goh ? ['--goh', o.goh] : [];
  const tg = o.target || o.exe || 'as64', named = !!(o.target || o.exe);
  return {
    native: [o.mod, ...gameArgs],
    sdllint: [o.mod, ...gameArgs, ...(named ? ['--exe', games.exeOf(tg)] : []), '--format', 'json'],
    check: [o.mod, ...gameArgs, ...goh, '--target', tg, '--locs', '1000000', '-q'],
    unitbox: [o.mod, ...gameArgs, ...goh],
  };
}
function readPart(file) { try { return { data: JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch (e) { return { why: 'part file unreadable: ' + path.basename(file) }; } }

// files of a unit: def + includes inside the mod (mod-relative, lower case)
function unitFiles(mod, defRel) {
  const seen = new Set(), stack = [defRel];
  while (stack.length) {
    const rel = stack.pop(), k = lc(rel);
    if (seen.has(k)) continue;
    const abs = path.join(mod, rel);
    if (!fs.existsSync(abs)) continue;
    seen.add(k);
    let text = ''; try { text = fs.readFileSync(abs, 'latin1'); } catch { continue; }
    text = text.replace(/;[^\r\n]*/g, '');
    for (const m of text.matchAll(/\(\s*include\s+"([^"]+)"|\{\s*extension\s+"([^"]+)"/gi)) {
      const n = slash(m[1] || m[2]);
      const r = n.startsWith('/') ? 'resource' + n : path.posix.join(path.posix.dirname(slash(rel)), n);
      stack.push(r);
    }
  }
  return seen;
}

function textOnly(mod) {
  const f = path.join(mod, 'text-only.tsv');
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split(/\r?\n/).map(l => lc(l.split('\t')[0].trim())).filter(Boolean).map(k => k.replace(/^\/+/, '').replace(/^resource\//, ''));
}
const listed = (keys, msg) => { const m = lc(msg); return keys.some(k => m.includes(k)); };

function main() {
  const o = parseArgs(process.argv.slice(2));
  const G = o.game;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'portverdict-'));
  const get = (name, run) => o.parts[name] ? readPart(o.parts[name]) : run();
  let P;
  try {
    const CA = childArgs(o);
    P = {
      native: get('native', () => runTool('native', path.join(TOOLS, 'native/native.js'), CA.native, tmp, f => ['-o', f])),
      sdllint: get('sdllint', () => runTool('sdllint', path.join(TOOLS, 'sdllint/sdllint.js'), CA.sdllint, tmp, f => ['-o', f])),
      check: get('check', () => runTool('check', path.join(TOOLS, 'check/check.js'), CA.check, tmp, f => ['--json', f])),
      unitbox: get('unitbox', () => runTool('unitbox', path.join(TOOLS, 'unitbox/unitbox.js'), CA.unitbox, tmp, f => ['-o', f])),
    };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }

  // variant defs (57mm_m1/57mm_m1_early.def: only (include "57mm_m1.inc") + own blocks) sit in another unit's folder; native's mod-dir
  // scan takes <stem>/<stem>.def only (tools/native/native.js units(), line 87), so a ported unit with a gaps file but no native row is
  // run through native once more by its def path (native's single-def mode) and merged. Not done when --part native is given.
  if (!o.parts.native && P.native.data && Array.isArray(P.native.data.units)) {
    const gd = path.join(o.mod, 'gaps');
    const have = new Set(P.native.data.units.map(u => lc(path.posix.basename(slash(u.key), '.def'))));
    const want = fs.existsSync(gd) ? fs.readdirSync(gd).filter(f => /.gaps.json$/i.test(f)).map(f => f.replace(/.gaps.json$/i, '').toLowerCase()).filter(s => !have.has(s)).sort() : [];
    if (want.length) {
      const root = path.join(o.mod, 'resource');
      const defs = fs.existsSync(path.join(root, 'entity')) ? fs.readdirSync(path.join(root, 'entity'), { recursive: true }).map(slash).filter(f => want.includes(lc(path.posix.basename(f, '.def'))) && /.def$/i.test(f)).sort() : [];
      const t2 = fs.mkdtempSync(path.join(os.tmpdir(), 'portverdict-'));
      try {
        defs.forEach((d, i) => {
          const r = runTool('native' + i, path.join(TOOLS, 'native/native.js'), [path.join(root, 'entity', d), ...(G ? ['--game', G] : [])], t2, f => ['-o', f]);
          if (r.data && Array.isArray(r.data.units)) for (const u of r.data.units) if (!have.has(lc(path.posix.basename(slash(u.key), '.def')))) { P.native.data.units.push(u); have.add(lc(path.posix.basename(slash(u.key), '.def'))); }
        });
      } finally { fs.rmSync(t2, { recursive: true, force: true }); }
    }
  }
  if (!P.native.data || !Array.isArray(P.native.data.units)) { console.error('portverdict: no unit list: native ' + (P.native.why || 'gave no units')); process.exit(2); }
  // ported units: with a gaps/ folder (goh2as2 writes one per ported unit) the units that have <stem>.gaps.json; else every classed unit.
  // the defs a port pulls along (ammo, weapons, inventory) carry no gaps file and are not exam units.
  const gapsDir = path.join(o.mod, 'gaps');
  const gapsSet = fs.existsSync(gapsDir) ? new Set(fs.readdirSync(gapsDir).filter(f => /\.gaps\.json$/i.test(f)).map(f => f.replace(/\.gaps\.json$/i, '').toLowerCase())) : null;
  const units = P.native.data.units.filter(u => u.class && !u.skipped && (!gapsSet || gapsSet.has(lc(path.posix.basename(slash(u.key), '.def')))));
  const tko = textOnly(o.mod);

  // syntax findings, refs samples
  const sdl = P.sdllint.data ? (P.sdllint.data.findings || []).filter(f => !REF_CODES.has(f.code)) : null;
  let refs = null;
  if (P.check.data && Array.isArray(P.check.data.findings)) {
    refs = [];
    for (const row of P.check.data.findings) {
      for (const s of row.samples || []) {
        const crash = row.sev === 'crash' && !s.note || s.note === ORPHAN_NOTE || EXTRA_CRASH.has(row.code);
        if (!crash) continue;
        if (row.tool === 'sdllint' && !REF_CODES.has(row.code)) continue;   // syntax, counted under S
        if (listed(tko, s.msg)) continue;
        refs.push({ file: lc(s.file), line: s.line || 0, code: row.code });
      }
    }
  }
  const boxes = new Map();
  if (P.unitbox.data && Array.isArray(P.unitbox.data.units)) for (const b of P.unitbox.data.units) boxes.set(lc(b.unit) + '|' + lc(b.class), b);

  const out = [];
  for (const u of units) {
    const defRel = 'resource/' + slash(u.key).replace(/^resource\//, '');
    const files = Array.isArray(u.defs) && u.defs.length ? new Set(u.defs.map(d => { const s = lc(d); return s.startsWith('resource/') ? s : 'resource/' + s; })) : unitFiles(o.mod, defRel);
    const v = { unit: u.unit, class: u.class };
    v.keys = { ok: !u.missing.length && !u.extra.length, missing: [...u.missing].sort(), extra: [...u.extra].sort() };
    v.values = { ok: !u.values.length, out: u.values.map(x => ({ key: x.key, value: x.value, min: x.min, max: x.max })).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0) };
    if (sdl) { const n = sdl.filter(f => files.has(lc(f.file))).length; v.syntax = { ok: n === 0, n }; }
    else v.syntax = { ok: null, n: null, why: P.sdllint.why || 'sdllint gave no findings list' };
    if (refs) {
      const mine = refs.filter(r => files.has(r.file)).map(r => `${r.file}:${r.line} ${r.code}`);
      const uniq = [...new Set(mine)].sort();
      v.refs = { ok: uniq.length === 0, n: uniq.length, first: uniq.slice(0, 3) };
    } else v.refs = { ok: null, n: null, first: [], why: P.check.why || 'check gave no findings list' };
    if (!P.unitbox.data) v.scale = { ok: null, why: P.unitbox.why || 'unitbox gave nothing' };
    else {
      const b = boxes.get(lc(u.unit) + '|' + lc(u.class)) || [...boxes.values()].find(x => lc(x.unit) === lc(u.unit));
      if (!b) v.scale = { ok: null, why: 'unit not in unitbox output' };
      else if (!b.box) v.scale = { ok: null, why: b.why || 'no box' };
      else { v.scale = { ok: b.ok === true ? true : b.ok === false ? false : null, why: b.why || '' }; if (b.src) v.scale.src = b.src; }
    }
    if (u.gaps && u.gaps.present !== false) v.gaps = { hand: u.gaps.hand | 0, unexplained: u.gaps.unexplained | 0 };
    else v.gaps = { hand: null, unexplained: null, why: 'no gaps file' };
    // bar: the static proof (keys, syntax, refs, scale, gaps); values (a stat outside the class range) is the unit's own number, not a port fault
    v.bar = v.keys.ok === true && v.syntax.ok === true && v.refs.ok === true && v.scale.ok !== false && v.gaps.hand === 0 && v.gaps.unexplained === 0;
    v.native = v.bar && v.values.ok === true;
    out.push(v);
  }
  out.sort((a, b) => a.class < b.class ? -1 : a.class > b.class ? 1 : a.unit < b.unit ? -1 : a.unit > b.unit ? 1 : 0);
  const partOk = (v, p) => p === 'gaps' ? (v.gaps.hand == null ? null : v.gaps.hand === 0 && v.gaps.unexplained === 0) : v[p].ok;
  const byPart = {};
  for (const p of PARTS) byPart[p] = out.filter(v => partOk(v, p) === false).length;
  const rec = { form: 'verdict/1', mod: path.basename(o.mod), units: out, counts: { units: out.length, bar: out.filter(v => v.bar).length, native: out.filter(v => v.native).length, byPart } };

  if (o.json) fs.writeFileSync(o.json, JSON.stringify(rec, null, 1) + '\n');
  // text: letter = ok, lower case = failed, '.' = not judged (null)
  const w = Math.max(4, ...out.map(v => v.unit.length));
  for (const v of out) {
    const l = PARTS.map(p => { const k = partOk(v, p); return k === true ? LETTER[p] : k === false ? LETTER[p].toLowerCase() : '.'; }).join('');
    console.log(`${l} ${v.native ? 'NATIVE' : v.bar ? 'bar   ' : 'no    '} ${v.unit.padEnd(w)} ${v.class}`);
  }
  const notes = ['native', 'sdllint', 'check', 'unitbox'].filter(n => P[n].why).map(n => `${n}: ${P[n].why}`);
  for (const n of notes) console.log('part not run: ' + n);
  console.log(`portverdict ${rec.mod}: ${rec.counts.bar} bar, ${rec.counts.native} of ${rec.counts.units} native; failed by part: ` + PARTS.map(p => `${LETTER[p]} ${byPart[p]}`).join(', ') + ' (letter = ok, lower = failed, . = not judged)');
}

module.exports = { childArgs };
if (require.main === module) main();
