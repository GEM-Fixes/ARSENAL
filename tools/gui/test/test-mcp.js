// MCP keep-updated guard: the page and route list of the arsenal-gui MCP server (tools/mcp/gui/registry.json) must match the GUI code.
// Fails when a route or a page was added, removed or renamed (or a tab row changed) without regenerating the list, and prints the
// one command that fixes it. Reads code only: starts no server, writes nothing.
// Author: Imperator_Aug (ARSENAL, ia-efb5ee0f)
'use strict';
const path = require('path');
const gen = require(path.join(__dirname, '..', '..', 'mcp', 'gui', 'gen.js'));
const CMD = 'node tools/mcp/gui.js --gen';
let saved = null, why = '';
try { saved = gen.load(); } catch (e) { why = String(e.message).split('\n')[0]; }
if (!saved) { console.log('FAIL mcp: tools/mcp/gui/registry.json is not there or not JSON (' + why + ')'); console.log('run: ' + CMD); process.exit(1); }
const now = gen.build({ fields: false }), d = gen.drift(saved, now);
if (!d.ok) {
  console.log('FAIL mcp: tools/mcp/gui/registry.json does not match the GUI code (' + d.lines.length + ' difference' + (d.lines.length === 1 ? '' : 's') + '):');
  for (const l of d.lines.slice(0, 30)) console.log('  ' + l);
  if (d.lines.length > 30) console.log('  ... ' + (d.lines.length - 30) + ' more');
  console.log('run: ' + CMD);
  process.exit(1);
}
// the saved list is whole: every route has its class and its fields were scanned
let bad = 0;
for (const r of saved.routes) if (!r.route || !r.writes || !Array.isArray(r.body) || !Array.isArray(r.query) || !r.read) { bad++; if (bad <= 5) console.log('FAIL mcp: route row not whole: ' + JSON.stringify(r).slice(0, 160)); }
if (bad) { console.log('run: ' + CMD); process.exit(1); }
// the page list of the skill arsenal-gui-use is made from registry.json: stale when its own check says so
const refresh = path.join(__dirname, '..', '..', '..', '.claude', 'skills', 'arsenal-gui-use', 'refresh-pages.js');
if (require('fs').existsSync(refresh)) {
  const r = require('child_process').spawnSync(process.execPath, [refresh, '--check'], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) {
    console.log('FAIL mcp: the page list of the skill arsenal-gui-use is stale: ' + String(r.stdout || r.stderr || '').trim().split(/\r?\n/).slice(-3).join(' / '));
    console.log('run: node .claude/skills/arsenal-gui-use/refresh-pages.js');
    process.exit(1);
  }
}
console.log('mcp: registry.json matches the GUI code (' + saved.routes.length + ' routes, ' + Object.keys(saved.pages).length + ' pages, ' + saved.games.length + ' game tabs)');
process.exit(0);   // the GUI modules leave handles open
