// T-ZIP: the release drop list leaves out what the Front door drops, and keeps what a shipped tool requires as a module.
// Builds ONE exe with the same sea.js arguments zip.js uses (RELEASE_DROP + MODULE_ONLY) into tools/dist/test/work-rel, then:
//   1 no dropped folder in the embedded files; every module-only folder is embedded
//   2 every literal relative require() and path.join(__dirname, '..', dir, file) in an embedded tool resolves inside the embedded files
//   3 `goh2as2 --help` and `gen --help` run from the exe (exit 0); a dropped tool and a module-only tool answer "unknown tool" (exit 2)
// usage: node tools/dist/test/modules.js [--keep]
// Author: Imperator_Aug (ARSENAL, ia-32c273de)
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const { RELEASE_DROP, MODULE_ONLY, seaArgs } = require('../zip.js');
const W = path.join(__dirname, 'work-rel'), TOOLS = path.join(__dirname, '..', '..');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL: ' + m); } };
fs.rmSync(W, { recursive: true, force: true }); fs.mkdirSync(W, { recursive: true });
const b = spawnSync(process.execPath, seaArgs(W, 'ARSENAL'), { encoding: 'utf8' });
ok(b.status === 0, 'build rc ' + b.status + '\n' + (b.stdout || '') + (b.stderr || ''));
const exe = path.join(W, process.platform === 'win32' ? 'ARSENAL.exe' : 'ARSENAL');
if (b.status === 0) {
  const keys = JSON.parse(fs.readFileSync(path.join(W, 'manifest.json'), 'utf8')), K = new Set(keys);
  const top = new Set(keys.map(k => k.split('/')[0]));
  const dropped = RELEASE_DROP.split(','), mods = MODULE_ONLY.split(',');
  // 1
  ok(!mods.some(m => dropped.includes(m)), '1 a module-only tool is also in the drop list');
  for (const d of dropped) ok(!top.has(d), '1 dropped tool still embedded: ' + d);
  for (const m of mods) ok(fs.existsSync(path.join(TOOLS, m)) ? top.has(m) : true, '1 module-only tool not embedded: ' + m);
  // 2
  const has = p => [p, p + '.js', p + '.json', p + '/index.js'].some(c => K.has(c));
  const norm = p => path.posix.normalize(p);
  const miss = [], HELPER = /^gui\/ext\/(balance\/blockcheck|units\/fakedom)\.js$/;
  for (const k of keys.filter(k => /\.js$/.test(k))) {
    // comment lines and <placeholder> paths are documentation, not requires
    const src = fs.readFileSync(path.join(TOOLS, k), 'utf8').split(/\r?\n/).filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n').replace(/require\(\s*(['"])[^'"]*<[^'"]*\1\s*\)/g, ''), dir = path.posix.dirname(k);
    // an optional part (gui/ext/models/index.js `opt(() => require('./sub/x'))`, skipped on MODULE_NOT_FOUND, sea-main throws that too) may be absent
    // the same with a name first (gui/ext/task/index.js `opt('mod.client', () => require('./recipes/mod.client'))`: a recipe may have no client file)
    // HELPER: two test helpers that sit beside their page, not in a test/ folder; only test files require them, and they require
    // the shared gui/test/blockcheck.js, which is never embedded DIST_TEST_HELPERS)
    if (HELPER.test(k)) continue;
    for (const m of src.matchAll(/(opt\(\s*(?:'[^']*'\s*,\s*)?\(\)\s*=>\s*)?require\(\s*(['"])(\.{1,2}\/[^'"]+)\2\s*\)/g)) if (!m[1] && !has(norm(dir + '/' + m[3]))) miss.push(`${k}: require ${m[3]}`);
    for (const m of src.matchAll(/path\.(?:join|resolve)\(\s*__dirname\s*,\s*((?:'[^'/]*'\s*,\s*)*'[^'/]*')\s*\)/g)) {
      const parts = m[1].split(',').map(x => x.trim().slice(1, -1)), rel = norm(dir + '/' + parts.join('/'));
      if (parts[0] === '..' && parts.length >= 2 && /\.js$/.test(parts[parts.length - 1]) && !has(rel)) miss.push(`${k}: path ${parts.join('/')}`);
    }
  }
  ok(miss.length === 0, '2 embedded tools require files that are not embedded:\n  ' + miss.slice(0, 20).join('\n  '));
  // 3
  const run = a => require('../../lib/test/wait').spawnSync(exe, a, { encoding: 'utf8' }, 'dist modules');
  for (const t of ['goh2as2', 'gen']) { const r = run([t, '--help']); ok(r.status === 0 && /usage: ARSENAL /i.test(r.stdout), `3 ${t} --help rc ${r.status}\n${r.stdout}${r.stderr}`); }
  for (const t of ['q', 'notes', 'score', 'wpn', 'covanm']) { const r = run([t]); ok(r.status === 2 && /unknown tool/.test(r.stderr), `3 ${t}: want unknown tool rc 2, got ${r.status}\n${r.stderr}`); }
  const hl = run(['help', '--all']).stdout;
  for (const t of ['covcheck', 'notes', 'score', 'wpn']) ok(!new RegExp('^\\s*' + t + '\\b', 'm').test(hl), '3 help lists ' + t);
}
if (!process.argv.includes('--keep')) fs.rmSync(W, { recursive: true, force: true });
console.log(fails ? `modules: ${fails} failed` : 'modules: PASS');
process.exit(fails ? 1 : 0);
