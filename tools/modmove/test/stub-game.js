// stub-game: fake game exe for modmove live tests (run via node; modmove matches it by command line). argv[2] = target name.
// config: JSON file in env STUB_CFG: {<target>: {logDir, game, userDir|null, scan:'profile'|'all', mode:'ok'|'crash'|'relaunch', modeMod:?}}
// writes a fake game.log, logs the canary line when a mounted mod folder carries the canary .lng, then stays alive until killed.
// Author: Imperator_Aug (ARSENAL, ia-37f6ec37)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const target = process.argv[2], cfg = JSON.parse(fs.readFileSync(process.env.STUB_CFG, 'utf8'))[target];
if (!cfg) { console.error('no cfg for ' + target); process.exit(3); }
if (cfg.mode === 'relaunch' && !process.env.STUB_CHILD) {   // Steam-style: the first process spawns the real one and exits
  const c = cp.spawn(process.execPath, [__filename, target], { detached: true, stdio: 'ignore', env: Object.assign({}, process.env, { STUB_CHILD: '1' }) });
  c.unref();
  process.exit(0);
}
fs.mkdirSync(cfg.logDir, { recursive: true });
const lines = ['[00:00:00] stub boot ' + target, '[00:00:01] Localization key redefinition: x in /interface/text/#editor.lng'];
let names = [];
if (cfg.scan === 'all') { try { names = fs.readdirSync(path.join(cfg.game, 'mods')); } catch { /* none */ } }
else if (cfg.userDir) {
  try {
    const pd = path.join(cfg.userDir, 'profiles');
    for (const id of fs.readdirSync(pd)) {
      const t = fs.readFileSync(path.join(pd, id, 'options.set'), 'latin1'), m = /\{mods((?:\s+"[^"]*")*)\s*\}/i.exec(t);
      if (m) names = names.concat((m[1].match(/"[^"]*"/g) || []).map(s => s.slice(1, -1).split(':')[0]));
    }
  } catch { /* none */ }
}
if (target === 'goh') for (const n of names) lines.push('[00:00:02] Mod: activate mod ' + n);
const mode = (process.env.STUB_MODE_MOD && names.some(n => /^e2e|^mm_stage/.test(n))) ? process.env.STUB_MODE_MOD : cfg.mode;
for (const n of names) {
  const ld = path.join(cfg.game, 'mods', n, 'localization');
  try { for (const f of fs.readdirSync(ld)) if (/zz_modmove_canary/.test(f)) lines.push('[00:00:02] Localization key redefinition: canary in /mods/' + n + '/localization/' + f); } catch { /* no lng */ }
}
if (mode === 'crash') lines.push('[00:00:03] ***** Exception *****', 'Program will be terminated', 'Exception code 0xC0000005 at 0x7FF612345678');
fs.writeFileSync(path.join(cfg.logDir, 'game.log'), lines.join('\r\n') + '\r\n');
if (mode === 'crash') process.exit(1);
setInterval(() => {}, 1000);
