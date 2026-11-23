// install / uninstall gold: a fake game folder in a temp dir, copy and link forms, the marker file, the refuse cases.
// refuse cases run twice, through as2.js and through the exe route (flow.main, what sea-main calls for flow.EXE_OK); the text must be equal.
// prints the transcript (paths normalized); run.sh diffs it with golden-install.txt
// Author: Imperator_Aug (ARSENAL, ia-034f1afd)
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const AS2 = path.join(__dirname, '..', 'as2.js'), FLOW = path.join(__dirname, '..', 'flow.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'as2-inst-'));
const fwd = s => s.replace(/\\/g, '/');
const norm = s => fwd(s.split(root.replace(/\\/g, '\\\\')).join(root)).split(fwd(root)).join('<tmp>').replace(/<tmp>\/\/+/g, '<tmp>/').replace(/"time":"[^"]*"/g, '"time":"<time>"').replace(/\r/g, '');
const w = (p, t) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); };
const G = path.join(root, 'game');
w(path.join(G, 'mods', 'keep', 'keep.txt'), 'x');
w(path.join(G, 'as64.exe'), '');
w(path.join(root, 'mymod', 'mod.info'), '{Mod\r\n\t{Name "mymod"}\r\n\t{MinGameVersion "3.301"}\r\n}\r\n');
w(path.join(root, 'mymod', 'resource', 'readme.txt'), 'hi');
fs.mkdirSync(path.join(root, 'nomod'));
w(path.join(G, 'mods', 'hand', 'hand.txt'), 'by hand');
w(path.join(G, 'mods', 'hand', 'mod.info'), '{Mod\r\n\t{Name "hand"}\r\n}\r\n');
const env = { ...process.env, AS2_HOME: root, AS2_NO_STEAM: '1' }; delete env.AS2_GAME;
const run = (route, args) => {
  const a = route === 'cli' ? [AS2, ...args] : ['-e', 'process.exitCode=require(process.argv[1]).main(JSON.parse(process.argv[2]))', FLOW, JSON.stringify(args)];
  const r = spawnSync(process.execPath, a, { cwd: root, env, encoding: 'utf8' });
  return norm((r.stdout || '') + (r.stderr || '')) + 'rc=' + r.status + '\n';
};
const log = [];
const say = s => log.push(s);
const tree = d => { const o = []; const walk = (p, r) => { for (const n of fs.readdirSync(p).sort()) { const f = path.join(p, n), rr = r + n; if (fs.lstatSync(f).isDirectory()) { o.push(rr + '/'); walk(f, rr + '/'); } else o.push(rr); } }; walk(d, ''); return o.join(' '); };
const mods = () => say('  mods/: ' + fs.readdirSync(path.join(G, 'mods')).sort().join(' '));
const marker = n => { try { say('  marker: ' + norm(fs.readFileSync(path.join(G, 'mods', n, '.as2-installed'), 'utf8'))); } catch (e) { say('  marker: none'); } };
// ok = mutating step, cli only. refuse = both routes, must be equal
const ok = args => { say('$ ARSENAL ' + args.join(' ')); say(run('cli', args).replace(/\n$/, '')); };
const refuse = args => {
  say('$ ARSENAL ' + args.join(' '));
  const a = run('cli', args), b = run('exe', args);
  say(a.replace(/\n$/, ''));
  if (a !== b) say('!! EXE ROUTE DIFFERS:\n' + b.replace(/\n$/, ''));
  else say('  (same text through the exe route)');
};
const g = ['--game', 'game'];
say('## copy form');
ok(['install', 'mymod', ...g]); mods(); marker('mymod'); say('  files: ' + tree(path.join(G, 'mods', 'mymod')));
say('## reinstall of our own copy is allowed');
ok(['install', 'mymod', ...g]); marker('mymod');
say('## uninstall: needs --yes');
ok(['uninstall', 'mymod', ...g]); mods();
ok(['uninstall', 'mymod', ...g, '--yes']); mods();
say('## link form');
ok(['install', 'mymod', ...g, '--link']); mods();
say('  junction: ' + fs.lstatSync(path.join(G, 'mods', 'mymod')).isSymbolicLink());
say('  marker in the source folder: ' + fs.existsSync(path.join(root, 'mymod', '.as2-installed')));
ok(['uninstall', 'mymod', ...g, '--yes']); mods();
say('  source still there: ' + fs.existsSync(path.join(root, 'mymod', 'resource', 'readme.txt')) + ', marker left in source: ' + fs.existsSync(path.join(root, 'mymod', '.as2-installed')));
say('## refuse cases (as2.js and exe route)');
refuse(['install', 'nomod', ...g]);
refuse(['install', 'nosuch', ...g]);
refuse(['install', 'mymod', '--name', 'hand', ...g]);
say('  hand-made folder untouched: ' + tree(path.join(G, 'mods', 'hand')));
refuse(['uninstall', 'hand', ...g, '--yes']);
refuse(['uninstall', 'keep', ...g, '--yes']);
refuse(['uninstall', 'ghost', ...g, '--yes']);
refuse(['uninstall', '../x', ...g, '--yes']);
ok(['install', 'game/mods/hand', ...g, '--force']);
say('  hand-made folder after the refusals: ' + tree(path.join(G, 'mods', 'hand')));
// T-INSTALL: name rules, missing game folder, source inside destination, destination inside source
w(path.join(root, 'Cap_Mod', 'mod.info'), '{Mod\r\n}\r\n');
refuse(['install', 'Cap_Mod', ...g]);
refuse(['install', 'mymod', '--name', 'two words', ...g]);
refuse(['install', 'mymod', '--name', 'a/b', ...g]);
refuse(['install', 'mymod', '--game', 'nosuch_game']);
say('  missing game folder created: ' + fs.existsSync(path.join(root, 'nosuch_game')));
ok(['install', 'mymod', '--name', 'inner', ...g]);
w(path.join(G, 'mods', 'inner', 'sub', 'mod.info'), '{Mod\r\n}\r\n');
refuse(['install', 'game/mods/inner/sub', '--name', 'inner', ...g, '--force']);
say('  inner after the refusal: ' + tree(path.join(G, 'mods', 'inner')));
w(path.join(root, 'wrap', 'mod.info'), '{Mod\r\n}\r\n');
fs.mkdirSync(path.join(root, 'wrap', 'game', 'mods'), { recursive: true }); w(path.join(root, 'wrap', 'game', 'as64.exe'), '');
refuse(['install', 'wrap', '--name', 'x', '--game', 'wrap/game']);
say('  mods/ in wrap/game: ' + (fs.readdirSync(path.join(root, 'wrap', 'game', 'mods')).join(' ') || '(empty)'));
ok(['uninstall', 'inner', ...g, '--yes']); mods();
say('## --force over a hand-made folder: refused, files kept (I-10)');
ok(['install', 'mymod', '--name', 'hand', ...g, '--force']); marker('hand'); say('  files: ' + tree(path.join(G, 'mods', 'hand')));
process.stdout.write(log.join('\n') + '\n');
fs.rmSync(root, { recursive: true, force: true });
