// chains fixture: fake tools dir + chains dir + fake game; truth.md = seeded dry-validation defects (one per line)
// Author: Imperator_Aug (ARSENAL, ia-82cfccc4)
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'fixture');
fs.rmSync(dir, { recursive: true, force: true });
const truth = ['# file:line: CODE (seeded defects of the dry validation; diffed by run.sh)'];
const put = (rel, text) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const chain = (name, steps, extra) => put('chains/' + name + '.json', JSON.stringify(Object.assign({ name, steps }, extra || {}), null, 1));
const defect = (file, line, code) => truth.push(`chains/${file}.json:${line}: ${code}`);

// fake tools: echo prints its argv; boom exits 3; both know --good, echo handles --help
put('tools/echo/echo.js', "const a = process.argv.slice(2);\nif (a[0] === '--help') { console.log('usage: echo [--good] [--help]'); process.exit(0); }\n// flags: --good\nconsole.log('echo ' + a.join(' '));\nconsole.log('MARK ok');\n");
put('tools/boom/boom.js', "console.log('boom ran');\nprocess.exit(3);\n// flags: --good\n");
put('tools/INDEX.md', 'echo | node tools/echo/echo.js [--good] [--help]\nboom | node tools/boom/boom.js [--good]\n');
// fake game with the two approved folders, mod.info + a stray file (reset must remove it)
put('game/mods/e2e_test/mod.info', '{Mod}\n');
put('game/mods/e2e_test/stray.txt', 'x');
put('game/mods/other/mod.info', '{Mod}\n');

// --- dry-validation chains (seeded defects)
chain('d_clean', [{ tool: 'echo', argv: ['--good', '$MOD'] }, { tool: '@copy', argv: ['$SCRATCH/a', '$MOD'] }]);
chain('d_missing', [{ tool: 'echo', argv: [] }, { tool: 'nope', argv: [] }]); defect('d_missing', 2, 'CHAIN_TOOL_MISSING');
chain('d_flag', [{ tool: 'echo', argv: ['--good', '--bogus'] }]); defect('d_flag', 1, 'CHAIN_FLAG_UNKNOWN');
chain('d_write', [{ tool: 'echo', argv: ['-o', 'C:/elsewhere/x.md'] }]); defect('d_write', 1, 'CHAIN_UNSAFE_WRITE');
chain('d_copy', [{ tool: '@copy', argv: ['$SCRATCH/a', 'C:/elsewhere'] }]); defect('d_copy', 1, 'CHAIN_UNSAFE_WRITE');
chain('d_def', [{ tool: 'echo' }]); defect('d_def', 1, 'CHAIN_BAD_DEF');

// --- run chains (own dir so the dry test and the run test do not mix)
chain('r_a_pass', [{ tool: 'echo', argv: ['--good', '$MODNAME'], match: 'MARK ok' }, { tool: 'echo', argv: ['x'], reject: 'FAILED' }]);
chain('r_b_fail', [{ tool: 'echo', argv: [] }, { tool: 'boom', argv: [] }, { tool: 'echo', argv: ['never'] }]);
chain('r_c_exit', [{ tool: 'boom', argv: [], exit: [0, 3] }, { tool: 'echo', argv: ['--good'], match: 'NOT PRESENT' }]);
chain('r_d_after', [{ tool: 'echo', argv: ['--good'] }]);
for (const f of fs.readdirSync(path.join(dir, 'chains'))) if (/^r_/.test(f)) { fs.mkdirSync(path.join(dir, 'runchains'), { recursive: true }); fs.renameSync(path.join(dir, 'chains', f), path.join(dir, 'runchains', f)); }

fs.writeFileSync(path.join(__dirname, 'truth.md'), truth.join('\n') + '\n');
