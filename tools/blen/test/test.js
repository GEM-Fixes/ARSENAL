// Author: Imperator_Aug (ARSENAL, ia-4a5dd856)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const { spawnSync } = require('child_process');
const B = require('../../lib/platform').findBlender();   // BLENDER, registry, Program Files, PATH
if (!B) process.exit(3);
const t = fs.mkdtempSync(path.join(os.tmpdir(), 'blen-'));
const env = { ...process.env, BLENDER_USER_SCRIPTS: path.join(t, 's'), BLENDER_USER_CONFIG: path.join(t, 'c') };
const run = (...a) => spawnSync(process.execPath, [path.join(__dirname, '..', 'install.js'), '--blender', B, ...a], { encoding: 'utf8', env });
try {
  fs.mkdirSync(path.join(t, 'a')); fs.writeFileSync(path.join(t, 'a', '__init__.py'), 'bl_info = {}');
  const u = run('--url', 'https://example.invalid/a.zip');
  assert.notStrictEqual(u.status, 0); assert.ok(/refusing download/.test(u.stderr), 'no hash, no download');
  const d = run('--from', path.join(t, 'a'), '--dry-run');
  assert.ok(/dry-run: would copy/.test(d.stdout), d.stdout + d.stderr);
  console.log('blen 2 checks pass');
} finally { fs.rmSync(t, { recursive: true, force: true }); }
