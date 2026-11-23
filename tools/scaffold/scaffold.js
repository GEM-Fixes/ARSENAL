#!/usr/bin/env node
// scaffold: new tool skeleton (opt #29). writes tools/<name>/<name>.js (uilint-style check + CLI on sdlset/report)
// + test/{mkfixture.js,run.sh,.gitignore} (milint-style truth diff). stub runs clean: 0 findings, test PASS.
// the generated tool takes --exe as64|mowas_2|mowas2|goh (lib/games) and hands it to sdlset.createSource (game parity)
// usage: node tools/scaffold/scaffold.js <name> [ROW-ID...] [--root toolsDir]   refuses if tools/<name> exists
// Author: Imperator_Aug (ARSENAL, ia-5c902540)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');

const TOOLS = path.join(__dirname, '..');

const TOOL = `#!/usr/bin/env node
// __NAME__: TODO one-line purpose. rows __ROWS__
// usage: node tools/__NAME__/__NAME__.js <mod folder> [-q] [--summary]
//        node tools/__NAME__/__NAME__.js --vfs --game <dir> [--mods a,b]   (whole mounted vfs)
//   --exe as64|mowas_2|mowas2|goh   the game whose file set is mounted (default: as64.exe in the folder -> as64, as before);
//     --exe goh with --vfs and no --game: the GoH install (lib/games install)
// codes: TODO_CODE (ROW-ID) ...
const path = require('path');
const sdlset = require('../lib/sdlset');
const games = require('../lib/games');
const { createReport } = require('../lib/report');

function check(opts) {
  const rep = createReport();
  let mods = opts.mods;
  if (!mods && opts.folder && opts.gameDir && path.basename(path.dirname(path.resolve(opts.folder))).toLowerCase() === 'mods') mods = [path.basename(path.resolve(opts.folder))];
  const src = sdlset.createSource({ gameDir: opts.gameDir, mods, exe: opts.exe, folder: opts.folder });
  const items = new Map();
  if (opts.vfs) for (const t of src.vfsItems()) items.set(t.key, t);
  else { for (const t of src.modItems()) items.set(t.key, t); for (const t of src.folderItems()) items.set(t.key, t); }

  let files = 0;
  for (const [key, t] of items) {
    // TODO: filter keys this tool covers, e.g. if (!/^resource\\/set\\//.test(key)) continue;
    let r; try { r = src.read(t, () => {}); } catch (e) { r = null; }
    if (!r) continue;
    files++;
    // TODO: walk r.root; rep.add(t.file, line, 'TODO_CODE', 'what breaks in game (ROW-ID)');
  }
  return { rep, files };
}

if (require.main === module) {
  const args = process.argv.slice(2), o = {}, pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--game') o.gameDir = args[++i]; else if (a === '--mods') o.mods = args[++i].split(',').filter(Boolean);
    else if (a === '--exe') { const g = games.get(args[++i]); if (!g) { console.error('--exe must be one of as64|mowas_2|mowas2|goh'); process.exit(2); } o.exe = g.exe; }
    else if (a === '--vfs') o.vfs = true; else if (a === '-q') o.q = true; else if (a === '--summary') o.summary = true; else pos.push(a);
  }
  o.folder = pos[0];
  if (o.vfs && !o.gameDir && o.exe === 'goh') o.gameDir = games.install('goh').dir || undefined;
  if (!o.folder && !o.vfs || o.vfs && !o.gameDir) { console.error('usage: node tools/__NAME__/__NAME__.js <mod folder> | --vfs --game <dir> [--mods a,b] [--exe as64|mowas_2|goh] [-q] [--summary]'); process.exit(2); }
  const { rep, files } = check(o);
  rep.print({ showInfo: !o.q, byCode: true, summary: o.summary });
  console.log(\`\${files} files\`);
}
module.exports = { check };
`;

const MKFIXTURE = `// __NAME__ fixture: fixture/mod + truth.md. put(rel, lines): line = text | [text, CODE...] → truth "rel:line: CODE"
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'fixture');
fs.rmSync(dir, { recursive: true, force: true });
const truth = ['# file:line: CODE (seeded defects; diffed by run.sh)'];
function put(rel, lines) {
  const f = path.join(dir, 'mod', rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const text = lines.map((l, i) => {
    if (Array.isArray(l)) { for (const c of l.slice(1)) truth.push(\`\${rel}:\${i + 1}: \${c}\`); return l[0]; }
    return l;
  });
  fs.writeFileSync(f, text.join('\\r\\n') + '\\r\\n', 'latin1');   // game text = cp1251 + CRLF
}

// TODO: one clean file + one seeded defect per code, e.g.
// put('resource/set/demo.set', ['{x 1}', ['{bad 2}', 'TODO_CODE']]);
put('resource/set/clean.set', ['{x 1}']);

fs.writeFileSync(path.join(__dirname, 'truth.md'), truth.join('\\n') + '\\n');
`;

const RUN = `#!/bin/sh
cd "$(dirname "$0")"
node mkfixture.js || exit 1
node ../__NAME__.js fixture/mod -q > out.txt
cat out.txt
grep -v '^#' truth.md | sed 's/: / /' | sort > want.txt
grep -v 'findings$\\|^by code\\| files$' out.txt | awk '{ f=$1; sub(/:$/,"",f); print f" "$2 }' | sort > got.txt
diff want.txt got.txt || { echo "FAIL: findings differ from truth.md"; exit 1; }
echo PASS
`;

function scaffold(name, ids = [], { root = TOOLS } = {}) {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`bad tool name '${name}' (lowercase, digits, -)`);
  const dir = path.join(root, name);
  if (fs.existsSync(dir)) throw new Error(`${dir} exists; scaffold only makes new tools`);
  const fill = s => s.split('__NAME__').join(name).split('__ROWS__').join(ids.join(' ') || 'TODO');
  const files = {
    [`${name}.js`]: fill(TOOL),
    'test/mkfixture.js': fill(MKFIXTURE),
    'test/run.sh': fill(RUN),
    'test/.gitignore': 'fixture/\nout.txt\nwant.txt\ngot.txt\n',
    'REPORT.json': JSON.stringify({ tool: name, rows: ids, files: [], tests: 'FAIL', real: [], specIssues: [], libGaps: [], tags: {}, notes: 'TODO fill at end of build (schema: .claude/agents/tool-builder.md)' }, null, 2) + '\n',
  };
  for (const [rel, text] of Object.entries(files)) {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  }
  return Object.keys(files).map(r => path.join(dir, r));
}

module.exports = { scaffold };

if (require.main === module) {
  const a = process.argv.slice(2), ids = [];
  let name = null, root = TOOLS;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--root') root = a[++i];
    else if (!name) name = a[i];
    else ids.push(a[i].toUpperCase());
  }
  if (!name) { console.error('usage: node tools/scaffold/scaffold.js <name> [ROW-ID...] [--root toolsDir]'); process.exit(2); }
  try { for (const f of scaffold(name, ids, { root })) console.log('wrote ' + f); }
  catch (e) { console.error(e.message); process.exit(1); }
}
