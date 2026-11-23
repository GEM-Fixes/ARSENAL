// previews real-install test (MV-PRV): per installed game, `mapviz previews plan`, `write`, `check` and `undo` on one real
// multiplayer map (MoW:AS2 and AS64 multi/1v1_road, GoH multi/1v1_balzerweg), into a new mod folder under the scratch dir
// (outside every install; the install is read only, through vfs). Checks: exits, the default targets per game, the
// written sizes and byte lengths, check passing, undo leaving the mod map folder empty again. MoW:AS2 also gets --title
// (drawn with the game's own font). Prints the times and where the files are; pictures are not pinned (texture data and
// paint may change). Skipped per game when the install is absent; MAPVIZ_NO_GAME=1 skips everything (no folder is made).
// Without a scratch dir the test makes one under the temp folder and deletes it on PASS; MAPVIZ_PREVIEWS_KEEP=1 keeps it.
// usage: node tools/mapviz/previews/test/real.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-575cf3de)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');

const MVJS = path.resolve(__dirname, '../../mapviz.js');
let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz previews: ' + what); } }

function installs() {
  if (process.env.MAPVIZ_NO_GAME === '1') return {};
  const gd = require('../../../lib/gamedir');
  const out = {};
  let as2 = null;
  try { const r = gd.resolve({}); as2 = r && r.dir && fs.existsSync(path.join(r.dir, 'resource', 'map.pak')) ? r.dir : null; } catch (e) { as2 = null; }
  let goh = null;
  try { const g = gd.goh(); goh = g && fs.existsSync(path.join(g, 'resource', 'map', 'multi.pak')) ? g : null; } catch (e) { goh = null; }
  if (as2) { out.mowas2 = as2; out.as64 = as2; }
  if (goh) out.goh = goh;
  return out;
}
function cli(args) {
  const t = Date.now();
  const r = spawnSync(process.execPath, [MVJS, 'previews'].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env), timeout: 900000 });
  return { code: r.status, out: r.stdout || '', err: (r.stderr || '').trim(), s: (Date.now() - t) / 1000 };
}
const json = s => { try { return JSON.parse(s); } catch (e) { return null; } };

const MAPS = { mowas2: 'multi/1v1_road', as64: 'multi/1v1_road', goh: 'multi/1v1_balzerweg' };
const WRITE = { mowas2: ['preview', 'small', 'header', 'minimap'], as64: ['preview', 'small', 'header', 'minimap'], goh: ['preview', 'header', 'minimap'] };

const have = installs();
const targets = Object.keys(MAPS).filter(t => have[t]);
if (!targets.length) {
  console.log('skip: ' + (process.env.MAPVIZ_NO_GAME === '1' ? 'MAPVIZ_NO_GAME=1' : 'no MoW:AS2 / AS64 / GoH install found'));
  console.log('PASS mapviz previews real (0, skipped)');
  process.exit(0);
}
for (const t of Object.keys(MAPS)) if (!have[t]) console.log('skip ' + t + ': no install');

const OWN = !process.argv[2] && process.env.MAPVIZ_PREVIEWS_KEEP !== '1';
const W = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'mapviz-prv-real-')));
fs.mkdirSync(W, { recursive: true });
{
  const c = process.env.ARSENAL_CACHE;
  process.env.ARSENAL_CACHE = c && path.resolve(c).startsWith(W + path.sep) ? c : path.join(W, 'cache');
}

for (const t of targets) {
  const key = MAPS[t];
  const mod = path.join(W, 'mods', 'prv_' + t);
  fs.mkdirSync(mod, { recursive: true });
  fs.writeFileSync(path.join(mod, 'mod.info'), '{mod\r\n\t{name "previews test"}\r\n}\r\n');
  // the title is part of the plan (and its hash): MoW:AS2 gets one
  const base = ['--target', t, '--game', have[t], '--map', key, '--mod', mod].concat(t === 'mowas2' ? ['--title', '1v1 Road'] : []);
  const tag = t + ' ' + key;
  const pr = cli(['plan'].concat(base, ['--json']));
  const p = json(pr.out);
  ok((pr.code === 0 || pr.code === 1) && p && p.hash, tag + ' plan exit 0 or 1, got ' + pr.code + ' ' + pr.err.slice(-300));
  if (!p) continue;
  const rows = p.targets.filter(x => x.state === 'write');
  ok(rows.map(x => x.id).sort().join() === WRITE[t].slice().sort().join(), tag + ' default targets ' + rows.map(x => x.id).join(','));
  ok(p.notes.some(n => n.code === 'PRV_NOT_IN_STACK'), tag + ' the mod is not in the stack: PRV_NOT_IN_STACK noted');
  console.log(tag + ' plan ' + pr.s.toFixed(1) + ' s: ' + rows.map(x => x.id + ' ' + x.size.join('x') + ' ' + x.source.resolved + ' ' + x.compose + ' ratio ' + x.stretch.ratio +
    (x.warnings.length ? ' [' + x.warnings.map(w => w.code).join(' ') + ']' : '')).join('; '));
  const wr = cli(['write'].concat(base, ['--plan-hash', p.hash, '--json']));
  const wb = json(wr.out);
  ok((wr.code === 0 || wr.code === 1) && wb && wb.written && wb.written.length === rows.length, tag + ' write exit 0 or 1, ' + rows.length + ' files, got ' + wr.code + ' ' + wr.err.slice(-300));
  console.log(tag + ' write ' + wr.s.toFixed(1) + ' s' + (wb && Object.keys(wb.notes || {}).length ? ', notes ' + JSON.stringify(wb.notes) : '') + ' -> ' + path.join(mod, 'resource', 'map', ...key.split('/')));
  for (const x of rows) {
    const f = path.join(mod, ...x.path.split('/'));
    const n = fs.existsSync(f) ? fs.statSync(f).size : -1;
    ok(n === x.bytes, tag + ' ' + x.id + ' ' + n + ' B, plan ' + x.bytes);
  }
  const ck = cli(['check'].concat(base, ['--json']));
  const cb = json(ck.out);
  ok(ck.code === 0 && cb && cb.ok, tag + ' check exit 0, got ' + ck.code + ' ' + (cb && cb.files ? JSON.stringify(cb.files.filter(f => !f.ok)) : ck.err.slice(-300)));
  if (OWN) {
    const un = cli(['undo'].concat(base, ['--json']));
    const md = path.join(mod, 'resource', 'map', ...key.split('/'));
    const left = fs.existsSync(md) ? fs.readdirSync(md) : [];
    ok(un.code === 0 && left.length === 0, tag + ' undo exit 0, map folder empty again, got ' + un.code + ' ' + left.join(','));
  }
}

if (fail) { console.log(fail + ' failed, ' + pass + ' passed; scratch ' + W); process.exit(1); }
if (OWN) try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* temp */ }
else console.log('kept ' + W);
console.log('PASS mapviz previews real (' + pass + ')');
