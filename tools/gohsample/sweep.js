// gohsample sweep: run `preloadsweep plan` (launches nothing) over names.txt with a good and a bad sentinel, and write RUN.md.
// preloadsweep plan insists the target mod sit at <game>/mods/<folder>; the mod is NOT installed. The plan runs against a temp overlay game dir
// (same recipe as tools/check/check.js) that links <out>/mod at mods/gohsample, then run.json is rewritten to the real game paths.
// Author: Imperator_Aug (ARSENAL, ia-b04522f6)
const fs = require('fs'), path = require('path');
const C = require('./common');
const { MOD_NAME, MOD_B } = require('./build');

const THIN = 'gohsample_sweep', BAD = 'gohsample_bad_sentinel';
const oneCrasherWorst = n => { if (n <= 1) return 0; const a = Math.ceil(n / 2), b = n - a; return 1 + Math.max(oneCrasherWorst(a) + 1, oneCrasherWorst(b)); };
const q = s => '"' + s + '"';

async function sweep(o) {
  const out = path.resolve(o.out), plan = C.readJson(o.plan);
  const game = o.game || plan.meta.as2, goh = o.goh || plan.meta.goh;
  C.guardOut(out, game, goh);
  // game parity: target as64 (default, RUN.md as before) | mowas2: preloadsweep --exe mowas_2, mowas_2.exe, no as64+, and no testrun line
  // (mowas_2.exe has no -control and no -instance, limits TST-19 [I]): every run is started by hand, the log is the main one [T]
  const tg = C.target(o, plan), mw = tg.id === 'mowas2';
  const modsOf = (...m) => tg.mods.concat(m).join(',');
  const runLine = (mods, what) => mw ? `# ${tg.file} has no -control and no -instance (limits TST-19): start ${q(C.fwd(game) + '/' + tg.file)} by hand with mods '${mods}'${what}`
    : null;
  const log = o.q ? () => { } : console.log, T0 = Date.now();
  const namesFile = path.join(out, 'names.txt');
  if (!fs.existsSync(namesFile)) C.die(`${namesFile} missing: run build first`);
  const names = fs.readFileSync(namesFile, 'latin1').split(/\r?\n/).filter(Boolean);
  const sweepDir = path.join(out, 'sweep'), ps = path.join(C.TOOLS, 'preloadsweep', 'preloadsweep.js');
  const info = { planRan: false, names: names.length, good: o.good || null, bad: BAD, why: '' };
  let stepLine = '', logPath = '', exePath = '';
  if (!o['no-plan']) {
    const ov = C.makeOverlay(game, path.join(out, 'mod'), MOD_NAME);
    try {
      const base = [ 'plan', ov.mod, '--names-file', namesFile, '--out', sweepDir, '--game', ov.ov, ...tg.flag, '--name', THIN, '--target-name', MOD_NAME ];
      let good = o.good || null;
      if (!good) {   // first pass without sentinels: preloadsweep picks a vanilla def from the base preload list as the fallback good sentinel
        const r0 = await C.runNode(ps, base, { timeout: 300000 });
        let g = null; try { g = C.readJson(path.join(sweepDir, 'run.json')).good; } catch { /* no run.json */ }
        if (g) good = g.name; else info.why = 'first pass: ' + (r0.out + r0.err).trim().split(/\r?\n/).slice(-2).join(' ');
      }
      if (good) {
        const r = await C.runNode(ps, base.concat(['--sentinels', `${good},${BAD}`]), { timeout: 300000 });
        info.good = good; info.planExit = r.code; info.planOut = r.out.trim();
        const rj = path.join(sweepDir, 'run.json');
        if (r.code === 0 && fs.existsSync(rj)) {
          const run = C.readJson(rj);
          const fix = s => typeof s === 'string' ? C.fwd(s).split(C.fwd(ov.ov)).join(C.fwd(game)) : s;
          run.game = fix(run.game); run.target.dir = fix(run.target.dir); if (run.exe) run.exe.path = fix(run.exe.path);
          run.note = 'game/target/exe paths rewritten from the temp overlay to the real install by gohsample; nothing was installed';
          C.writeJson(rj, run);
          info.planRan = true; info.runId = run.current && run.current.id; info.exe = run.exe && run.exe.path;
          exePath = run.exe ? run.exe.path : '';
          for (const l of r.out.split(/\r?\n/)) {
            if (/^\s+node tools\/testrun/.test(l)) stepLine = fix(l.trim());
            if (/^3\./.test(l.trim())) logPath = (/read "([^"]+)"/.exec(l) || [])[1] || '';
          }
        } else info.why = `plan exit ${r.code}: ${(r.out + r.err).trim().split(/\r?\n/).slice(-3).join(' | ')}`;
      } else if (!info.why) info.why = 'no good sentinel found (no base preload list); pass --good <vanilla def>';
    } finally { ov.cleanup(); }
  } else info.why = '--no-plan';
  const gameF = C.fwd(game), outF = C.fwd(out);
  const runN = oneCrasherWorst(names.length);
  const minPerRun = 5;
  const bf = ((plan.partB && plan.partB.files) || []), bootN = bf.filter(f => /^BOOT_/.test(f.loadKind)).length, incN = bf.filter(f => f.loadKind === 'ON_INCLUDE').length;
  const partBmd = !bf.length ? [] : [
    '## 5b. Part B: set/ and properties files (mod_b), a SEPARATE mod', '',
    `${bf.length} non-entity files hold the format-difference codes entities cannot carry. They go in ${q(outF + '/mod_b')} (never in mod: they override vanilla names).`,
    '', '**A preload list cannot test these.** Load points, from source [I, not run in game]:', '',
    `- ${bootN} files under set/ (set/stuff/**, set/*.set): read at engine data load, BEFORE any match. The game reads every file under set/stuff/ and the other set/*.set. A bad file kills the boot, so the test is a boot, bisected by file.`,
    `- ${incN} files under properties/: read only when an entity def includes them (SPAWN of the including def). Entities in part A already pull the ones they name (PORT_PROPS_COPIED); a properties file nothing includes is NOT exercised: its outcome stays NOT_REACHED.`,
    '- Forcing USE of a stuff: the file is already parsed at boot. To also test the use path, a test entity can name it: `{Weaponry {place "gun" {weapon "<stuff name>"}}}`; a missing/bad stuff then goes through GetStuff (, dummy_checker, "may lead to crash") [I, LOG-07].',
    '', 'Boot bisect (nothing is launched by the tool):', '', '```',
    `node tools/gohsample/gohsample.js boot --out ${q(outF)}                 # step 1: writes ${outF}/boot_active with ALL ${bootN} boot files`,
    `cp -r ${q(outF + '/boot_active')} ${q(gameF + '/mods/' + MOD_B)}      # (replace the folder at every step)`,
    runLine(modsOf(MOD_B), ': reaching the main menu = clean, crash/exit = crash') || `node tools/testrun/testrun.js --exe ${q(exePath || gameF + '/as64.exe')} --mods 'as64+,${MOD_B}' --inst 1 --timeout 120   # reaching the main menu = clean, crash/exit = crash`,
    `node tools/gohsample/gohsample.js boot --out ${q(outF)} --result clean   # or --result crash; repeat until it prints DONE`,
    '```', '',
    `Compare with: --boot-state ${q(outF + '/boot-state.json')} (crashers = CRASH, clean = LOAD). **Stop when crashes repeat a known cause**: read the Exception text once, drop every file sharing it, do not bisect the same cause again.`, '',
  ];
  const md = [
    `# gohsample RUN (${tg.id} preload sweep)`,
    '', `**${C.NOTICE}**`, '',
    `Nothing was installed and no game was launched. ${info.planRan ? `preloadsweep plan ran (run id ${info.runId}, ${names.length} entities, sentinels good=${info.good} bad=${BAD}).` : `preloadsweep plan did NOT run (${info.why}); run the plan command below by hand.`}`,
    '', '## 1. Install (manual)', '',
    '```', `cp -r ${q(outF + '/mod')} ${q(gameF + '/mods/' + MOD_NAME)}`, `cp -r ${q(outF + '/sweep')} ${q(gameF + '/mods/' + THIN)}`, '```', '', '(part B uses a separate mod folder, see 5b.)', '',
    `Nothing else may be enabled besides the two folders. Both are removed again in step 6.`,
    '', ...(info.planRan ? [] : ['### plan (only if it did not run)', '', '```', `node tools/preloadsweep/preloadsweep.js plan ${q(gameF + '/mods/' + MOD_NAME)} --names-file ${q(outF + '/names.txt')} --out ${q(outF + '/sweep')} --name ${THIN} --target-name ${MOD_NAME} --sentinels <vanilla def>,${BAD}`, '```', '']),
    '## 2. Run (one multiplayer match loads the preload list)', '',
    '```', stepLine || runLine(modsOf(MOD_NAME, THIN), ', host a LAN match on multi/1v1_road:combat, wait for the load to end or crash') || `node tools/testrun/testrun.js --exe ${q(exePath || gameF + '/as64.exe')} --map multi/1v1_road:combat --mods 'as64+,${MOD_NAME},${THIN}' --inst 1 --hold 5 --timeout 300`, '```', '',
    'No control pipe on this exe: host the LAN match by hand with those mods if testrun cannot. [T]', '',
    '## 3. Read', '', '```', `node tools/preloadsweep/preloadsweep.js read ${q(logPath || (mw ? '<main user log dir>/game.log' : '<instance 1 log dir>/game.log'))} --plan ${q(outF + '/sweep/run.json')} --json > ${q(outF + '/read1.json')}`, '```', '',
    'Add `--crashed` when the process died with no Exception block.', '',
    '## 4. A crash continues into bisect (one crash ends the run)', '', '```',
    `node tools/preloadsweep/preloadsweep.js bisect --plan ${q(outF + '/sweep/run.json')} --log ${q(logPath || '<game.log>')}   # or --crashed / --clean`,
    '```', '',
    `Bisect rewrites the preload file in ${q(outF + '/sweep')}, not in the installed copy: after every bisect step copy ${q(outF + '/sweep')} over ${q(gameF + '/mods/' + THIN)} again, then run step 2 and 4 again, until bisect prints \`done\`. Crashers are in run.json \`bisect.crashers\`; pass that folder to compare as --bisect-log.`, '',
    '**Stop rule: stop when crashes repeat a known cause** (same Exception message / same code as an earlier crasher). Record the cause once, drop every entity sharing it from names.txt, re-plan with the rest. Do not bisect the same cause twice.', '',
    '## 5. Compare', '', '```', `node tools/gohsample/gohsample.js compare --predictions ${q(outF + '/predictions.json')} --read ${q(outF + '/read1.json')} --bisect-log ${q(outF + '/sweep')}${bootN ? ' --boot-state ' + q(outF + '/boot-state.json') : ''} --out ${q(outF)}`, '```', '',
    ...partBmd,
    '## 6. Cleanup', '', `Remove ALL installed folders: ${q(gameF + '/mods/' + MOD_NAME)}, ${q(gameF + '/mods/' + THIN)}${bootN ? ' and ' + q(gameF + '/mods/' + MOD_B) : ''}${mw ? `; ${tg.file} has no instances: its log is the main user log, keep it (copy the results out, never clear it).` : '; clear the instance log once results are recorded (instance 1 only, never instance 0).'}`, '',
    '## Estimates [T, unmeasured: no run has been timed yet; these are guesses to size the work, not measurements]', '',
    `- one preload run: about ${minPerRun} min (game start + match load + preload of ${names.length} entities).`,
    `- clean list: 1 run, about ${minPerRun} min.`,
    `- one crasher in ${names.length} entities: at most ${1 + runN} runs, about ${(1 + runN) * minPerRun} min (preloadsweep bisect bound).`,
    `- k distinct crashers cost about k times the bisect bound; hence the stop rule (stop when crashes repeat a known cause).`,
    ...(bootN ? [`- part B boot step: about 2 min per boot (menu only); one crasher in ${bootN} files: at most ${1 + oneCrasherWorst(bootN)} boots, about ${2 * (1 + oneCrasherWorst(bootN))} min.`] : []), '',
  ];
  fs.writeFileSync(path.join(out, 'RUN.md'), md.join('\r\n'));
  info.runMd = C.fwd(path.join(out, 'RUN.md')); info.bisectRunsOneCrasher = 1 + runN; info.ms = Date.now() - T0;
  C.writeJson(path.join(out, 'sweep-info.json'), info);
  log(`sweep: ${info.planRan ? 'preloadsweep plan ran' : 'plan did NOT run: ' + info.why}; ${names.length} names; RUN.md -> ${info.runMd} (${info.ms} ms)`);
  return info;
}

module.exports = { sweep };
