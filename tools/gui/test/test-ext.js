// GUI-EXT contract test: every ext in ext/index.js is well formed, its script obeys the page.js rules, its strings exist in all 4 languages,
// the page still builds and parses, and each ext's own test (ext/<id>/test.js, if present) passes. Arg: scratch dir.
// Author: Imperator_Aug (ARSENAL, ia-528db272)
const fs = require('fs'), path = require('path'), cp = require('child_process'), vm = require('vm');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'gx-')));
fs.mkdirSync(work, { recursive: true });
const EXT = require('../ext');
const W = require('../../lib/test/wait');
const contract = require('../contract');
let bad = 0;
const fail = m => { bad++; console.log('FAIL ' + m); };
const ids = new Set();
for (const x of EXT) {
  if (!x || !/^[a-z][a-z0-9]*$/.test(x.id || '')) { fail('ext id ' + (x && x.id)); continue; }
  if (ids.has(x.id)) fail('dup ext ' + x.id); ids.add(x.id);
  if (x.script) {
    if (/`|\$\{/.test(x.script)) fail(x.id + ': script has a backtick or dollar-brace');
    if (/\.innerHTML\s*=|insertAdjacentHTML|document\.write/.test(x.script)) fail(x.id + ': script writes HTML (use h()/textContent)');
    if (x.tab !== false && !x.script.includes('EXT_SCREENS.' + x.id) && !x.script.includes("EXT_SCREENS['" + x.id + "']")) fail(x.id + ': script does not set EXT_SCREENS.' + x.id);
    if (x.tab !== false && !x.nav) fail(x.id + ': script but no nav key');   // tab:false = a script for every page, no screen (ext view)
  }
  const L = x.lang || {}, en = Object.keys(L.en || {});
  for (const c of ['ru', 'uk', 'zh']) for (const k of en) if (!(L[c] && typeof L[c][k] === 'string' && L[c][k])) fail(x.id + ': lang ' + c + ' missing ' + k);
  if (x.nav && !(L.en && L.en[x.nav])) fail(x.id + ': nav key ' + x.nav + ' not in its en strings');
  // every tx('key') used in the script should exist in en (ext strings or core)
  const core = require('../lang/en.json');
  for (const m of (x.script || '').matchAll(/\btx\('([a-zA-Z0-9_.]+)'/g)) if (!m[1].endsWith('.') && !(L.en && L.en[m[1]]) && !core[m[1]]) fail(x.id + ': tx key ' + m[1] + ' undefined');
  for (const k of Object.keys(x.commands || {})) if (!contract.COMMANDS[k]) fail(x.id + ': command ' + k + ' not merged');
  for (const k of Object.keys(x.routes || {})) if (!/^(GET|POST) \/api\/x\/[a-z0-9/_-]+$/.test(k)) fail(x.id + ': route ' + k + ' must be GET|POST /api/x/...');
}
// page builds and every script element parses
const page = require('../page');
for (const m of page.matchAll(/<script>([\s\S]*?)<\/script>/g)) { try { new vm.Script(m[1]); } catch (e) { fail('page script does not parse: ' + e.message); } }
// per-ext tests
for (const x of EXT) {
  const t = path.join(__dirname, '..', 'ext', x.id, 'test.js');
  if (!fs.existsSync(t)) continue;
  const r = W.spawnSync(process.execPath, [t, path.join(work, x.id)], { encoding: 'utf8', timeout: 600000 }, 'test-ext ' + x.id);   // some ext tests are long: 10 min, then once more with 20
  if (r.status !== 0) fail(x.id + ': ext test\n' + String(r.stdout + r.stderr).split('\n').slice(-12).join('\n'));
}
console.log(bad ? bad + ' failures' : 'ext ' + EXT.length + ' PASS');
process.exit(bad ? 1 : 0);
