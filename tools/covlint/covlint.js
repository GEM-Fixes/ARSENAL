#!/usr/bin/env node
// covlint: does each linter behind tools/check catch a seeded fault in real-format data, and does 0 findings mean data was read?
//   node tools/covlint/covlint.js [--out <workdir>] [--game <dir>] [--only a,b] [--md]
// per case: a small vanilla file (read from the game paks through lib/pakset; localization.pak through lib/pak) is written as a mod folder
// (clean copy) and again with one seeded fault (bad copy); the linter runs as a child on bad, clean and an empty folder.
//   caught   = the expected code is a counted finding (not info) on bad
//   clean    = findings on the unmodified vanilla copy (real data; 0 expected, otherwise listed)
//   empty    = findings on an empty folder; "silent" when it says 0 findings and gives no no-data notice (a finding of the linter)
//   seen     = files written to the folder / distinct files the linter names in its bad-run output
// the ialint "invented" case reads tools/ialint/test/shape (invented text in the shape of vanilla set/interaction_entity; no vanilla in the repo).
// exit 0 = every case caught and no clean-run hit of the seeded code; 1 otherwise. empty-run silence is reported, not an exit failure.
// Author: Imperator_Aug (ARSENAL, ia-02103bee)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const pakset = require('../lib/pakset'), pak = require('../lib/pak');

const T = path.resolve(__dirname, '..');
const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; };
const GAME = opt('--game') || require('../lib/gamedir').require({ what: 'covlint' });   // DOOR-A: no dir = one line, exit 2 (was a TypeError on path.join(null))
const OUT = path.resolve(opt('--out') || path.join(os.tmpdir(), 'covlint'));
const ONLY = opt('--only') ? new Set(opt('--only').split(',')) : null;

const crlf = s => s.replace(/\r?\n/g, '\r\n');
const L1 = b => b.toString('latin1'), B1 = s => Buffer.from(s, 'latin1');
let SET;
const vkey = re => { const m = SET.entries.filter(e => (typeof re === 'string' ? e.key === re : re.test(e.key))); if (!m.length) throw new Error('vanilla entry not found: ' + re); return m[0]; };
const vread = re => { const e = vkey(re); return { key: e.key, buf: pakset.read(e) }; };
const sibling = (key, name) => path.posix.join(path.posix.dirname(key), name);
function repl(s, from, to) { if (!(from instanceof RegExp ? from.test(s) : s.includes(from))) throw new Error('seed anchor not found: ' + from); return s.replace(from, to); }

// case: {id, linter, script, argv(dir)->[..], code, fault, build()->{clean:[[relpath, Buffer]], bad:[[relpath, Buffer]]}}
const C = [];
const V = (id, linter, script, argv, code, fault, build, known) => C.push({ id, linter, script, argv, code, fault, build, known: !!known });
const D = d => [d];
const DG = d => [d, '--game', GAME];

V('sdllint', 'sdllint', 'sdllint/sdllint.js', D, 'BLOCK_UNCLOSED', 'vanilla .def + `{zz` never closed (SDL-01)', () => {
  const f = vread('entity/construction/entourage/x/net_x/net_x.def'), p = 'resource/' + f.key;
  return { clean: [[p, f.buf]], bad: [[p, B1(L1(f.buf) + '\r\n{zz\r\n')]] };
});
V('keylint', 'keylint', 'keylint/keylint.js', DG, 'WARN_FLOAT_GOT_NONNUM', 'vanilla car .def, `{mass 2000}` -> `{mass heavy}` (SDL-31, learned type)', () => {
  const f = vread('entity/-vehicle/car/universal/universal.def'), p = 'resource/' + f.key;
  return { clean: [[p, f.buf]], bad: [[p, B1(repl(L1(f.buf), '{mass 2000}', '{mass heavy}'))]] };
});
V('humlint', 'humlint', 'humlint/humlint.js', D, 'HUM_VITALITY_KEY', 'vanilla properties/human.ext, vitality Health key `inc` renamed `regen` (HUM-01)', () => {
  const f = vread('properties/human.ext'), p = 'resource/' + f.key;
  return { clean: [[p, f.buf]], bad: [[p, B1(repl(L1(f.buf), /\{inc(\s+)1\.0\}/, '{regen$11.0}'))]] };
});
V('movlint', 'movlint', 'movlint/movlint.js', DG, 'MOV_WHEEL_RADIUS_ZERO', 'vanilla car .mdl, basis `WheelRadius=0.5` -> `WheelRadius=0` (MOV-20)', () => {
  const d = vread('entity/-vehicle/car/universal/universal.def'), m = vread(sibling(d.key, 'universal.mdl'));
  const pd = 'resource/' + d.key, pm = 'resource/' + m.key;
  return { clean: [[pd, d.buf], [pm, m.buf]], bad: [[pd, d.buf], [pm, B1(repl(L1(m.buf), 'WheelRadius=0.5;', 'WheelRadius=0;'))]] };
});
V('fxlint', 'fxlint', 'fxlint/fxlint.js', DG, 'IA_ACTION_UNKNOWN', 'vanilla dummy.inc under vanilla entity.set, `{delete}` -> `{bogus_cov_action}` (VIS-18)', () => {
  const s = vread('set/interaction_entity/entity.set'), i = vread('set/interaction_entity/dummy.inc');
  const ps = 'resource/' + s.key, pi = 'resource/' + i.key;
  return { clean: [[ps, s.buf], [pi, i.buf]], bad: [[ps, s.buf], [pi, B1(repl(L1(i.buf), '{delete}', '{bogus_cov_action}'))]] };
});
V('strlint', 'strlint', 'strlint/strlint.js', D, 'STR_MDL_MISSING', 'vanilla construction .def (+ its .mdl), Extension renamed to an .mdl that is not there', () => {
  const d = vread('entity/construction/entourage/household_equipment/x/bucket_x/bucket_x.def'), m = vread(sibling(d.key, 'bucket_x.mdl'));
  const pd = 'resource/' + d.key, pm = 'resource/' + m.key;
  // the .mdl's {VolumeView} .ply and {Polyhedron} .vol: without the .vol the clean copy gave STR_VIEW_MISSING (strlint right, seed incomplete; COV-LINT)
  const plys = [...L1(m.buf).matchAll(/(?:VolumeView|Polyhedron)\s+"([^"]+)"/g)].map(x => vread(sibling(m.key, x[1]))).map(y => ['resource/' + y.key, y.buf]);
  return { clean: [[pd, d.buf], [pm, m.buf], ...plys], bad: [[pd, B1(repl(L1(d.buf), 'bucket_x.mdl', 'bucket_zz.mdl'))], [pm, m.buf], ...plys] };
});
V('ialint', 'ialint (vanilla)', 'ialint/ialint.js', DG, 'INT_EVENT_DUP', 'vanilla entity.set + dummy.inc, the `{on "pause"}` handler of entity "dummy" written twice (INT-02)', () => {
  const s = vread('set/interaction_entity/entity.set'), i = vread('set/interaction_entity/dummy.inc');
  const ps = 'resource/' + s.key, pi = 'resource/' + i.key, row = '{on "pause"\t{view pause ""}}';
  return { clean: [[ps, s.buf], [pi, i.buf]], bad: [[ps, s.buf], [pi, B1(repl(L1(i.buf), row, row + '\r\n\t' + row))]] };
});
V('ialint-blend', 'ialint (vanilla, INT-08)', 'ialint/ialint.js', DG, 'INT_USE_BLEND_TEX', 'same, `{use_blend_tex "t"}` added to the stop handler of "dummy" (INT-08); vanilla has the same dead code, so ialint may demote it to info', () => {
  const s = vread('set/interaction_entity/entity.set'), i = vread('set/interaction_entity/dummy.inc');
  const ps = 'resource/' + s.key, pi = 'resource/' + i.key;
  return { clean: [[ps, s.buf], [pi, i.buf]], bad: [[ps, s.buf], [pi, B1(repl(L1(i.buf), '{view stop ""}}', '{use_blend_tex "t"}{view stop ""}}'))]] };
}, true);
const SHAPE = path.join(T, 'ialint', 'test', 'shape');
const shapeFiles = () => { const out = [], walk = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) walk(path.join(d, e.name), r); else out.push([r, B1(crlf(fs.readFileSync(path.join(d, e.name), 'latin1')))]); } }; walk(SHAPE, ''); return out; };
V('ialint-invented', 'ialint (invented)', 'ialint/ialint.js', D, 'INT_EVENT_DUP', 'invented fixture tools/ialint/test/shape, a second `{on blast_hit}` in one entity (INT-02)', () => {
  const clean = shapeFiles(), key = 'resource/set/interaction_entity/basic.inc';
  const bad = clean.map(([p, b]) => p === key ? [p, B1(repl(L1(b), /\{"prop_chunk"/, '{"prop_chunk"\r\n\t{on blast_hit {hide 1}}'))] : [p, b]);
  return { clean, bad };
});
V('ialint-invented-blend', 'ialint (invented, INT-08)', 'ialint/ialint.js', D, 'INT_USE_BLEND_TEX', 'invented fixture, `{use_blend_tex "t"}` added to the bullet_hit handler of "prop_crate" (INT-08)', () => {
  const clean = shapeFiles(), key = 'resource/set/interaction_entity/gear/crate.inc';
  const bad = clean.map(([p, b]) => p === key ? [p, B1(repl(L1(b), '{spawn "wood_chips_small"}', '{use_blend_tex "t"}{spawn "wood_chips_small"}'))] : [p, b]);
  return { clean, bad };
});
V('uilint','uilint', 'uilint/uilint.js', DG, 'FONT_SIZE_RANGE', 'vanilla main_8.font written as main_300.font with {size 300} (UI-16)', () => {
  const f = vread('interface/font/main_8.font');
  return { clean: [['resource/' + f.key, f.buf]], bad: [['resource/interface/font/main_300.font', B1(repl(L1(f.buf), '{size 8}', '{size 300}'))]] };
});
// expcheck only treats the folder as a mod when it sits in <game>/mods (then --mods is derived); elsewhere with --game it lints vanilla (finding, see report).
// so the folder is given as a fixture game dir (no --game), the form its own test uses.
const EXP = () => {
  const m = vread('entity/construction/entourage/mine_carriage/coal_in/coal_in.mdl'), y = vread(sibling(m.key, 'coal_in.ply'));
  const pm = 'resource/' + m.key, py = 'resource/' + y.key;
  return { clean: [[pm, m.buf], [py, y.buf]], bad: [[pm, B1(repl(L1(m.buf), '{VolumeView "coal_in.ply"}', '{VolumeView "coal_in.ply"}\r\n\t\t{bone "coal_in"\r\n\t\t\t{Position 0 0 0}\r\n\t\t}'))], [py, y.buf]] };
};
V('expcheck', 'expcheck', 'expcheck/expcheck.js', D, 'WARN_EXP_DUP_BONE', 'vanilla .mdl (+ .ply), a second bone with the same name under the same parent (FMT-19)', () => EXP());
V('expcheck-game', 'expcheck (--game form)', 'expcheck/expcheck.js', DG, 'WARN_EXP_DUP_BONE', 'same files, folder outside <game>/mods given with --game (the form `check` uses for non-mods folders)', () => EXP(), true);
V('milint','milint', 'milint/milint.js', DG, 'MAP_PLAYERS', 'vanilla map.info (+ combat.mi), maxPlayers 2 -> 3, odd (MAP-02)', () => {
  const i = vread('map/multi/1v1_winter_hills/map.info'), m = vread('map/multi/1v1_winter_hills/combat.mi');
  const pi = 'resource/' + i.key, pm = 'resource/' + m.key;
  return { clean: [[pi, i.buf], [pm, m.buf]], bad: [[pi, B1(repl(L1(i.buf), 'maxPlayers 2', 'maxPlayers 3'))], [pm, m.buf]] };
});
const LOCPAK = path.join(GAME, 'localization.pak');
const locRead = name => { const l = pak.list(LOCPAK), e = [...l].find(x => x.name === name); if (!e) throw new Error('localization.pak entry not found: ' + name); l.fd = fs.openSync(LOCPAK, 'r'); try { return pak.read(l, e); } finally { fs.closeSync(l.fd); } };
V('lnglint', 'lnglint', 'lnglint/lnglint.js', D, 'TAG_UNCLOSED', 'vanilla mission .lng (UTF-8), added value `<c(ff0000)MG` with no `>` (LOC-07)', () => {
  const b = locRead('mission/single/00_mow_rus/9-hydroplane.lng'), p = 'localization/mission/single/00_mow_rus/9-hydroplane.lng';
  const s = b.toString('utf8');
  return { clean: [[p, b]], bad: [[p, Buffer.from(repl(s, /\}\s*$/, '\t{"zz_cov" "<c(ff0000)MG"}\r\n}\r\n'), 'utf8')]] };
});
V('binhdr', 'binhdr', 'binhdr/binhdr.js', d => ['-', '--folder', d], 'PLY_BAD_MAGIC', 'vanilla 104-byte .ply, first 4 bytes zeroed (FMT-13)', () => {
  const f = vread('entity/service/land/map.ply'), p = 'resource/' + f.key, bad = Buffer.from(f.buf); bad.fill(0, 0, 4);
  return { clean: [[p, f.buf]], bad: [[p, bad]] };
});
V('loccover', 'loccover', 'loccover/loccover.js', DG, 'LOC_FILE_REPLACED', 'vanilla desc.lng cut to its first key: wholesale replace drops the rest (LOC-01)', () => {
  const b = locRead('desc.lng'), s = b.toString('utf8'), cut = s.indexOf('{"hint" "Hint"}');
  if (cut < 0) throw new Error('desc.lng anchor missing');
  const head = s.slice(0, cut + '{"hint" "Hint"}'.length) + '\r\n\t\t}\r\n\t}\r\n}\r\n';
  return { clean: [['localization/desc.lng', b]], bad: [['localization/desc.lng', Buffer.from(head, 'utf8')]] };
});

// ---- runner
function put(dir, files) { fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); for (const [p, b] of files) { const f = path.join(dir, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); } }
function run(c, dir) {
  const t0 = Date.now(), r = cp.spawnSync(process.execPath, [path.join(T, c.script), ...c.argv(dir)], { encoding: 'utf8', timeout: 300000, maxBuffer: 1 << 28 });
  const out = (r.stdout || '') + (r.stderr ? '\n[stderr]\n' + r.stderr : '');
  const rows = [], info = [];
  for (const ln of out.split(/\r?\n/)) {
    const m = ln.match(/^(info: )?(.+?)(?::(\d+))?: ((?:WARN_)?[A-Z][A-Z0-9_]+)\b/);
    if (m) (m[1] ? info : rows).push({ file: m[2], line: m[3] || '', code: m[4], text: ln.toLowerCase() });
  }
  const n = out.match(/^(\d+) findings/m);
  return { status: r.status, signal: r.signal, sec: ((Date.now() - t0) / 1000).toFixed(1), out, rows, info, total: n ? +n[1] : null, error: r.error ? String(r.error) : null };
}
const NODATA = /no (\w+ )?(files|data|input)|nothing to (check|lint)|empty|0 files|not found|no such/i;
const names = r => new Set([...r.rows, ...r.info].map(x => x.file)).size;

function main() {
  SET = pakset.open(path.join(GAME, 'resource'), null);
  const res = [];
  for (const c of C) {
    if (ONLY && !ONLY.has(c.id)) continue;
    const row = { id: c.id, linter: c.linter, fault: c.fault, code: c.code, known: c.known };
    try {
      const { clean, bad } = c.build(), base = path.join(OUT, c.id);
      put(path.join(base, 'clean'), clean); put(path.join(base, 'bad'), bad); put(path.join(base, 'empty'), []);
      const rb = run(c, path.join(base, 'bad')), rc = run(c, path.join(base, 'clean')), re = run(c, path.join(base, 'empty'));
      // caught = the expected code, counted, on a line that names a file the seed changed (basename; ialint names the includer plus "[from x.inc:N]")
      const cm = new Map(clean.map(([p, b]) => [p, b])), changed = bad.filter(([p, b]) => !cm.has(p) || !cm.get(p).equals(b)).map(([p]) => path.posix.basename(p).toLowerCase());
      row.caught = rb.rows.some(x => x.code === c.code && changed.some(n => x.text.includes(n)));
      row.anyCode = rb.rows.some(x => x.code === c.code);
      row.infoOnly = !row.caught && rb.info.some(x => x.code === c.code && changed.some(n => x.text.includes(n)));
      row.badCodes = [...new Set(rb.rows.map(x => x.code))].join(' ');
      row.badTotal = rb.total; row.clean = rc.total; row.cleanCodes = [...new Set(rc.rows.map(x => x.code))].join(' ');
      row.cleanHit = rc.rows.some(x => x.code === c.code);
      const sn = s => { const m = s.out.match(/(\d+) files\b/); return m ? +m[1] : null; };
      row.seenClean = sn(rc); row.seenEmpty = sn(re);
      row.empty = re.total; row.emptyNotice = NODATA.test(re.out);
      row.emptySilent = (re.total === 0 || re.total === null) && !row.emptyNotice && re.status === 0;
      row.emptyStatus = re.status;
      row.filesIn = clean.length; row.filesNamed = names(rb); row.sec = [rb.sec, rc.sec, re.sec].join('/');
      row.crash = [rb, rc, re].some(r => r.error || r.signal || /\bat .*\.js:\d+/.test(r.out)) ? 'child error' : '';
      row.tail = { bad: rb.out.split(/\r?\n/).slice(0, 6).join('\n'), clean: rc.out.split(/\r?\n/).slice(0, 4).join('\n'), empty: re.out.split(/\r?\n/).slice(0, 4).join('\n') };
    } catch (e) { row.error = e.message; }
    res.push(row);
    console.log(`${row.error ? 'ERROR' : row.caught ? 'CAUGHT' : 'MISSED'} ${c.id}: ${row.error || `bad=${row.badTotal} [${row.badCodes}] clean=${row.clean} [${row.cleanCodes}] empty=${row.empty}${row.emptySilent ? ' SILENT' : ''} in=${row.filesIn} named=${row.filesNamed} says-files clean/empty=${row.seenClean}/${row.seenEmpty} sec=${row.sec}${row.crash ? ' ' + row.crash : ''}`}`);
    if (args.includes('-v') || row.error || !row.caught) console.log(row.tail ? `--bad--\n${row.tail.bad}\n--clean--\n${row.tail.clean}\n--empty--\n${row.tail.empty}` : '');
  }
  SET.close();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(res, null, 1));
  if (args.includes('--md')) {
    console.log('\n| linter | seeded fault | code | caught | clean run | empty run | files in / named |\n|---|---|---|---|---|---|---|');
    for (const r of res) console.log(`| ${r.linter} | ${r.fault} | ${r.code} | ${r.error ? 'ERROR ' + r.error : r.caught ? 'yes' : r.infoOnly ? 'NO (info only)' : 'NO'} | ${r.clean}${r.cleanCodes ? ' (' + r.cleanCodes + ')' : ''} | ${r.empty}${r.emptySilent ? ' silent' : ''} | ${r.filesIn} / ${r.filesNamed} |`);
  }
  const bad = res.filter(r => r.error || !r.caught && !r.known || r.cleanHit && !r.known);
  console.log(`\n${res.length} cases, ${res.filter(r => r.caught).length} caught, ${res.filter(r => r.emptySilent).length} silent on empty folder, ${bad.length} failing`);
  process.exit(bad.length ? 1 : 0);
}
main();
