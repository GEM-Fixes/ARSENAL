// sdllint --exe test: a made-up folder (no game) with a {## disabled tag. With no --exe and --exe as64/mowas_2 it is info SDL_DISABLED_TAG
// (as before); --exe goh picks the GoH rules (SDL_GOH_DISABLED_TAG) though no GoH exe is beside it; --exe bogus exits 2. Exits 1 on a difference.
// Author: Imperator_Aug (ARSENAL, ia-051771bf)
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const W = process.env.TEST_WORK || path.join(__dirname, 'fixture'), d = path.join(W, 'exe-folder');
fs.rmSync(d, { recursive: true, force: true });
fs.mkdirSync(path.join(d, 'resource', 'entity', 'a'), { recursive: true });
fs.writeFileSync(path.join(d, 'resource', 'entity', 'a', 'a.def'), [';SDL', '{game_entity', '\t{##flag 1}', '\t{x "a"}', '}', ''].join('\r\n'));
// made-up GoH install (GOH_GAME): --exe goh with no --game mounts it, so an include that only it holds resolves
const g = path.join(W, 'exe-gohgame');
fs.rmSync(g, { recursive: true, force: true });
fs.mkdirSync(path.join(g, 'binaries', 'x64'), { recursive: true }); fs.writeFileSync(path.join(g, 'binaries', 'x64', 'call_to_arms.exe'), '');
fs.mkdirSync(path.join(g, 'resource', 'properties'), { recursive: true }); fs.writeFileSync(path.join(g, 'resource', 'properties', 'goh_only.inc'), ';SDL\r\n{y 1}\r\n');
fs.mkdirSync(path.join(d, 'resource', 'entity', 'b'), { recursive: true });
fs.writeFileSync(path.join(d, 'resource', 'entity', 'b', 'b.def'), [';SDL', '{game_entity', '\t(include "/properties/goh_only.inc")', '}', ''].join('\r\n'));
const env = Object.assign({}, process.env, { GOH_GAME: g });
const cli = path.join(__dirname, '..', 'sdllint.js');
const run = (...a) => spawnSync(process.execPath, [cli, d, ...a], { encoding: 'utf8', env });
const code = r => ((/^info: \S+ (SDL_\w+)/m.exec(r.stdout) || [])[1]) || r.stdout.slice(0, 200);
let bad = 0;
const eq = (what, got, want) => { if (got !== want) { bad++; console.log(`FAIL ${what}: ${got} want ${want}`); } else console.log('ok ' + what); };
eq('no --exe', code(run()), 'SDL_DISABLED_TAG');
eq('--exe as64', code(run('--exe', 'as64')), 'SDL_DISABLED_TAG');
eq('--exe mowas_2', code(run('--exe', 'mowas_2')), 'SDL_DISABLED_TAG');
eq('--exe goh', code(run('--exe', 'goh')), 'SDL_GOH_DISABLED_TAG');
eq('--exe bogus exit', run('--exe', 'bogus').status, 2);
eq('no --exe: GoH-only include missing', /INCLUDE_MISSING/.test(run().stdout), true);
eq('--exe goh, no --game: the GoH install is mounted', /INCLUDE_MISSING/.test(run('--exe', 'goh').stdout), false);
fs.rmSync(d, { recursive: true, force: true }); fs.rmSync(g, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
