#!/usr/bin/env node
// build (L5): hemtt-style pipeline for one mod folder. spawns the existing tools, parses their `file[:line]: CODE msg`
// lines + `N findings`, classifies ERROR (non-WARN_ code) / WARN (WARN_ prefix), packs only when the gate is clean.
//   node build.js <mod folder> [--game G] [--mods a,b] [--stages lint,ref,loc,mission,pack | tool names] [--out pakdir]
//                 [--strict] [-q] [--json] [--exe as64|mowas_2|mowas2|goh]
// --exe: the game (lib/games). Forwarded as --exe <vfs exe> to every stage that takes a game (and modinfo); none = as before.
//   --exe goh without --game: the GoH install (lib/games install). modinfo gets --game when given (a GoH --game = GoH mod.info rules,
//   GHVFS-02) and --goh with --exe goh. GoH loc stage: lnglint lints the .pot/.po/.lng; loccover is skipped (it reads the AS2
//   localization/ .lng only, GoH text is localizations/<code>/interface/text/, GHLOC-01). packer gets --goh (GHVFS-04 layout).
// --print-plan: print each wanted stage's argument list (or skip reason) as JSON and exit 0; runs nothing.
// stages: lint = modinfo sdllint keylint strlint humlint movlint fxlint (+expcheck with --game, binhdr = binary formats (crash-on-load mesh etc.), ialint/uilint when the mod has interaction/ui files); ref = refcheck;
//   loc = lnglint loccover; mission = milint (only with map/mission files); pack = packer (dry unless --out).
// vs doctor: doctor runs a fixed parallel set and reports only the first finding per code (no loccover, no packer, no
// gate). build needs every finding per tool and a gate before pack, so it spawns the linters itself.
// Author: Imperator_Aug (ARSENAL, ia-6d81e882)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');

const registry = require('../lib/registry'), games = require('../lib/games');
const GROUPS = {}; // stage groups from the registry (lib/registry.js build field), order = registry order
for (const g of ['lint', 'ref', 'loc', 'mission', 'pack']) GROUPS[g] = registry.forBuild(g).map(t => t.name);
// binhdr (FMT: crash-on-load meshes etc.) is a lint-stage member, last of the group; registry has it doctor-only (no build field)
GROUPS.lint.push('binhdr');
const ALL = Object.values(GROUPS).flat();
const groupOf = t => Object.keys(GROUPS).find(g => GROUPS[g].includes(t));

const argv = process.argv.slice(2), o = {}, pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--game') o.game = argv[++i];
  else if (a === '--mods') o.mods = argv[++i];
  else if (a === '--stages') o.stages = argv[++i].split(',').filter(Boolean);
  else if (a === '--out') o.out = argv[++i];
  else if (a === '--strict') o.strict = true;
  else if (a === '-q') o.q = true;
  else if (a === '--json') o.json = true;
  else if (a === '--workspace') o.ws = argv[++i];
  else if (a === '--print-plan') o.printPlan = true;
  else if (a === '--exe') { const g = games.get(argv[++i]); if (!g) { console.error('--exe must be as64, mowas_2 (mowas2) or goh'); process.exit(2); } o.exe = g.exe; }
  else pos.push(a);
}
if (o.exe === 'goh' && !o.game && !o.ws) { const r = games.install('goh'); if (r.dir) o.game = r.dir; }
if (o.ws) return require('./workspace').run(o, argv);
if (pos.length !== 1 || !fs.existsSync(pos[0]) || !fs.statSync(pos[0]).isDirectory()) {
  console.error('usage: build.js <mod folder> [--game G] [--mods deps] [--stages lint,ref,loc,mission,pack] [--out pakdir] [--strict] [-q] [--json] [--exe as64|mowas_2|goh] [--print-plan]');
  process.exit(2);
}
const folder = path.resolve(pos[0]);
const game = o.game ? path.resolve(o.game) : null;
let wanted = o.stages ? o.stages.flatMap(s => GROUPS[s] || (ALL.includes(s) ? [s] : [])) : ALL;
if (o.stages) for (const s of o.stages) if (!GROUPS[s] && !ALL.includes(s)) { console.error(`unknown stage "${s}" (lint ref loc mission pack | ${ALL.join(' ')})`); process.exit(2); }
wanted = ALL.filter(t => wanted.includes(t));

// ---- which file kinds does the mod have (milint/ialint/uilint only then)
const kinds = { mi: false, ia: false, ui: false };
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name), rel = path.relative(folder, p).replace(/\\/g, '/').toLowerCase();
    if (e.isDirectory()) { if (e.name !== '.git') walk(p); continue; }
    if (/\.(mi|pat|materials)$|(^|\/)map\.info$|set\/multiplayer\//.test(rel) || /(^|\/)map\/.*\.(mi|info|net)$/.test(rel)) kinds.mi = true;
    if (/set\/(interaction|effects)|(^|\/)effects\.set$/.test(rel)) kinds.ia = true;
    if (/panel_control|set\/interface|\/interface\/|(^|\/)keys\.set$|\/fonts?\//.test(rel)) kinds.ui = true;
  }
})(folder);

const toolsDir = path.join(__dirname, '..');
const mods = o.mods ? ['--mods', o.mods] : [];
const X = o.exe ? ['--exe', o.exe] : [];   // the vfs exe, only when named: the AS64 argument lists stay as they were
// GoH: --exe goh, or (no --exe) a --game folder holding binaries/x64/call_to_arms.exe (the vfs pick)
const goh = o.exe ? o.exe === 'goh' : !!(game && fs.existsSync(path.join(game, 'binaries', 'x64', 'call_to_arms.exe')));
const G = game ? ['--game', game, ...mods, ...X] : [];
const refMods = game ? [...(o.mods ? o.mods.split(',') : []), folder].join(',') : null;
const plan = {
  // modinfo: --game (an AS2 --game changes nothing there; a GoH one gives the GoH version rules, GHVFS-02) and --goh on GoH
  modinfo: fs.existsSync(path.join(folder, 'mod.info')) && [folder, ...(game ? ['--game', game] : []), ...(goh ? ['--goh'] : []), ...X, '-q'],
  sdllint: [folder, ...G, '-q'],
  keylint: [folder, ...G, '-q'],
  ialint: kinds.ia && [folder, ...G, '-q'],
  uilint: kinds.ui && [folder, ...G, '-q'],
  refcheck: game ? [game, '--mods', refMods, '--scope', 'mod', ...X, '-q'] : ['-', '--folder', folder, '-q'],
  lnglint: [folder, '-q'],
  loccover: !goh && [folder, '-q'],
  strlint: [folder, ...G, '-q'],
  humlint: [folder, ...G, '-q'],
  movlint: [folder, ...G, '-q'],
  fxlint: [folder, ...G, '-q'],
  binhdr: fs.existsSync(path.join(folder, 'resource')) && [game || '-', '--folder', folder, ...(game && o.mods ? ['--mods', o.mods] : []), ...(game ? X : []), '-q'],
  expcheck: game && [folder, ...G, '-q'],
  milint: kinds.mi && [folder, ...G, '-q'],
  packer: [folder, ...(o.out ? ['--out', path.resolve(o.out)] : ['--dry']), ...(goh ? ['--goh'] : []), '-q'],
};
const skipWhy = t => !fs.existsSync(path.join(toolsDir, t, t + '.js')) ? 'tool missing'
  : !plan[t] ? ({ modinfo: 'no mod.info', ialint: 'no interaction files', uilint: 'no ui files', milint: 'no map/mission files', expcheck: 'no --game', binhdr: 'no resource/',
    loccover: 'GoH text is .pot under localizations/ (GHLOC-01); loccover reads the AS2 localization/ .lng only' }[t] || 'n/a') : null;

if (o.printPlan) {   // the argument list of every wanted stage (or its skip reason), runs nothing
  console.log(JSON.stringify(Object.fromEntries(wanted.map(t => [t, skipWhy(t) ? { skipped: skipWhy(t) } : plan[t]])), null, 1));
  process.exit(0);
}
const LINE = /^(.+?)(?::(\d+))?: ([A-Z][A-Z0-9_]*)(?: (.*))?$/;
function runTool(t) {
  return new Promise(res => {
    const t0 = Date.now();
    const p = spawn(process.execPath, [path.join(toolsDir, t, t + '.js'), ...plan[t]], { cwd: folder });
    let out = '', err = '';
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    p.on('close', code => {
      const st = { tool: t, group: groupOf(t), ms: Date.now() - t0, findings: [], errors: 0, warns: 0, top: {}, skipped: null };
      let total = null;
      for (const l of (out + '\n' + err).split(/\r?\n/)) {
        let m = /^(\d+) findings$/.exec(l);
        if (m) { total = +m[1]; continue; }
        if (/^info:/.test(l) || !(m = LINE.exec(l))) continue;
        const sev = m[3].startsWith('WARN_') ? 'WARN' : 'ERROR';
        const fn = m[1].replace(/\\/g, '/'), fr = folder.replace(/\\/g, '/') + '/';
        st.findings.push({ file: fn.startsWith(fr) ? fn.slice(fr.length) : fn, line: m[2] ? +m[2] : 0, code: m[3], msg: m[4] || '', sev });
      }
      if (total === null && code !== 0 && !st.findings.length) {
        const first = (err + out).split(/\r?\n/).find(Boolean) || `exit ${code}`;
        st.findings.push({ file: t, line: 0, code: 'TOOL_FAILED', msg: first.slice(0, 200), sev: 'ERROR' });
      }
      for (const f of st.findings) { f.sev === 'ERROR' ? st.errors++ : st.warns++; st.top[f.code] = (st.top[f.code] || 0) + 1; }
      res(st);
    });
  });
}

async function main() {
  const stages = [], runnable = [];
  for (const t of wanted) {
    const why = skipWhy(t);
    if (why) stages.push({ tool: t, group: groupOf(t), ms: 0, findings: [], errors: 0, warns: 0, top: {}, skipped: why });
    else if (t !== 'packer') runnable.push(t);
  }
  // pool of 4
  const done = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, runnable.length) }, async () => {
    while (next < runnable.length) done.push(await runTool(runnable[next++]));
  }));
  stages.push(...done);
  const sum = () => stages.reduce((a, s) => (a.e += s.errors, a.w += s.warns, a), { e: 0, w: 0 });
  let gate = sum();
  let blocked = gate.e > 0 || (o.strict && gate.w > 0);
  if (wanted.includes('packer')) {
    const why = skipWhy('packer');
    if (why) stages.push({ tool: 'packer', group: 'pack', ms: 0, findings: [], errors: 0, warns: 0, top: {}, skipped: why });
    else if (blocked) stages.push({ tool: 'packer', group: 'pack', ms: 0, findings: [], errors: 0, warns: 0, top: {}, skipped: `blocked by ${gate.e} errors${o.strict ? ` / ${gate.w} warns (--strict)` : ''}` });
    else stages.push(await runTool('packer'));
  }
  stages.sort((a, b) => ALL.indexOf(a.tool) - ALL.indexOf(b.tool));
  const tot = sum();
  const packer = stages.find(s => s.tool === 'packer');
  const packed = !!packer && !packer.skipped;
  const fail = tot.e > 0 || (o.strict && tot.w > 0);
  if (o.json) {
    console.log(JSON.stringify({ mod: folder, ok: !fail, errors: tot.e, warns: tot.w, packed, dry: packed && !o.out, stages }, null, 1));
  } else {
    const topS = s => Object.entries(s.top).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${c}x${n}`).join(' ');
    if (!o.q) {
      console.log(`build ${folder}${game ? ' (game ' + game + ')' : ' (no game: refs vs mod only)'}${o.strict ? ' --strict' : ''}`);
      console.log('stage    tool      ms     err  warn  top codes');
      for (const s of stages) console.log(`${s.group.padEnd(8)} ${s.tool.padEnd(9)} ${String(s.ms).padStart(5)} ${s.skipped ? '  -     -   skipped: ' + s.skipped : `${String(s.errors).padStart(5)} ${String(s.warns).padStart(5)}  ${topS(s)}`}`);
    }
    for (const s of stages) {
      if (!s.findings.length) continue;
      console.log(`[${s.group}/${s.tool}]`);
      for (const f of s.findings) console.log(`${f.file}${f.line ? ':' + f.line : ''}: ${f.code} ${f.msg}`.trimEnd());
    }
    console.log(`${tot.e + tot.w} findings (${tot.e} errors, ${tot.w} warnings); ${fail ? 'BUILD FAILED' + (packed ? '' : ' (pack skipped)') : packed ? (o.out ? 'packed to ' + path.resolve(o.out) : 'pack dry-run ok') : 'BUILD OK'}`);
  }
  process.exit(fail ? 1 : 0);
}
main();
