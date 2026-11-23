// expcheck --exe test (run after mkfixture.js): the fixture game has no exe, so --exe as64 / mowas_2 give the same findings as no --exe;
// --exe goh (on a copy whose mod.info allows GoH 1.067: GoH skips a mod outside its version range) gives the same findings plus EXP_GOH_BASIS; --exe bogus exits 2. Exits 1 on a difference.
// Author: Imperator_Aug (ARSENAL, ia-d93f2318)
const path = require('path'), { spawnSync } = require('child_process');
const { check } = require('../expcheck');
const game = path.join(__dirname, 'fixture', 'game');
const fs = require('fs'), W = process.env.TEST_WORK || fs.mkdtempSync(path.join(require('os').tmpdir(), 'expcheck-exe-')), gg = path.join(W, 'gohgame');   // the GoH copy stays out of the repo
fs.rmSync(gg, { recursive: true, force: true }); fs.cpSync(game, gg, { recursive: true });
fs.writeFileSync(path.join(gg, 'mods', 'm1', 'mod.info'), ['{Mod', ' {Name "m1"}', ' {MinGameVersion "1.067"}', ' {MaxGameVersion "1.067"}', '}', ''].join('\r\n'));
const run = (exe, g = game) => { const j = check({ gameDir: g, mods: ['m1'], exe }).rep.toJSON(); return j.findings.concat(j.info).map(f => `${f.file}:${f.line} ${f.code}`).sort(); };
let bad = 0;
const eq = (what, got, want) => { const x = JSON.stringify(got), y = JSON.stringify(want); if (x !== y) { bad++; console.log(`FAIL ${what}: ${x} want ${y}`); } else console.log('ok ' + what); };
const base = run(undefined);
if (!base.length) { bad++; console.log('FAIL no findings on the fixture'); }
eq('--exe as64 = no --exe', run('as64'), base);
eq('--exe mowas_2 = no --exe', run('mowas_2'), base);
eq('--exe mowas2 = no --exe', run('mowas2'), base);
const goh = run('goh', gg);
eq('--exe goh = no --exe + EXP_GOH_BASIS', goh.filter(l => !/EXP_GOH_BASIS/.test(l)), base);
eq('--exe goh basis line', goh.filter(l => /EXP_GOH_BASIS/.test(l)).length, 1);
// m1 as shipped is outside the GoH version range: --mods m1 under goh checks nothing (was: every layer); --folder checks it anyway
const codes = l => l.filter(x => !/EXP_GOH_BASIS|STATS/.test(x));
eq('--exe goh, m1 dropped: no findings', codes(run('goh')), []);
const runF = (exe, g = game) => { const j = check({ gameDir: g, folder: path.join(g, 'mods', 'm1'), exe }).rep.toJSON(); return j.findings.concat(j.info).map(f => `${f.file}:${f.line} ${f.code}`).sort(); };
eq('--folder on a dropped mod in <game>/mods = its findings', codes(runF('goh')), codes(base));
eq('--folder under as64 = --mods', codes(runF(undefined)), codes(base));
const cf = spawnSync(process.execPath, [path.join(__dirname, '..', 'expcheck.js'), '--folder', path.join(game, 'mods', 'm1'), '--game', game, '--exe', 'goh', '-q'], { encoding: 'utf8' });
eq('--folder CLI finds the dup bone', /WARN_EXP_DUP_BONE/.test(cf.stdout), true);
const nf = spawnSync(process.execPath, [path.join(__dirname, '..', 'expcheck.js'), '--folder', path.join(game, 'mods', 'm1')], { encoding: 'utf8', env: Object.assign({}, process.env, { ARSENAL_GAME: '', MOW_GAME: '' }) });
eq('--folder with no --game exits 2', nf.status, 2);
// a mod folder with capitals in <game>/mods: the mod id is the lowercase folder name, as the vfs keys it (VFS-12; was: raw name, nothing mounted)
const cg = path.join(W, 'capgame'); fs.rmSync(cg, { recursive: true, force: true }); fs.cpSync(game, cg, { recursive: true });
fs.renameSync(path.join(cg, 'mods', 'm1'), path.join(cg, 'mods', 'M1_Cap'));
const cc = spawnSync(process.execPath, [path.join(__dirname, '..', 'expcheck.js'), path.join(cg, 'mods', 'M1_Cap'), '--game', cg, '--no-rc', '-q'], { encoding: 'utf8' });
eq('capitalised mod folder in <game>/mods is mounted', /WARN_EXP_DUP_BONE/.test(cc.stdout), true);
fs.rmSync(cg, { recursive: true, force: true });
// a listed mod that does not mount: the 0-files line comes with the vfs reason (MOD_*)
const cd = spawnSync(process.execPath, [path.join(__dirname, '..', 'expcheck.js'), path.join(game, 'mods', 'm1'), '--game', game, '--exe', 'goh', '--no-rc', '-q'], { encoding: 'utf8' });
eq('dropped mod: reason printed', /0 files read/.test(cd.stderr) && /expcheck: MOD_[A-Z_]+ /.test(cd.stderr), true);
const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'expcheck.js'), game, '--mods', 'm1', '--exe', 'bogus'], { encoding: 'utf8' });
eq('--exe bogus exit', r.status, 2);
fs.rmSync(process.env.TEST_WORK ? gg : W, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
