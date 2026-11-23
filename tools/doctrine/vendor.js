// doctrine vendor: refresh tools/doctrine/data/ from the Men of War doctrine pack (read only).
//   node tools/doctrine/vendor.js <pack dir: .../dist/men-of-war-doctrine> [--robz-yaml <.../3-game/profiles/robz.yaml>]
// Copies sdk/doctrine.json, the pack README (credit and limits), sdk/missions/*.md, markdown/game/*.md, markdown/profiles/*.md,
// markdown/personas.md and core.md into data/md/, then builds data/text.json (the same texts as one module, so the single exe bundles them).
// --robz-yaml: also writes data/robz-botconfig.json (RobZ godny BotConfig key list with the author's notes) from the SDK source profile.
// Author: Imperator_Aug (ARSENAL, ia-ed96df64)
'use strict';
const fs = require('fs'), path = require('path');
const D = path.join(__dirname, 'data');

function mdTree() {
  const out = { missions: {}, game: {}, profiles: {}, personas: '', core: '', readme: '' };
  const rd = p => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const M = path.join(D, 'md');
  for (const k of ['missions', 'game', 'profiles']) {
    const d = path.join(M, k);
    if (fs.existsSync(d)) for (const f of fs.readdirSync(d).sort()) if (f.endsWith('.md')) out[k][f.replace(/\.md$/, '')] = rd(path.join(d, f));
  }
  for (const k of ['personas', 'core']) { const p = path.join(M, k + '.md'); if (fs.existsSync(p)) out[k] = rd(p); }
  const r = path.join(D, 'PACK-README.md'); if (fs.existsSync(r)) out.readme = rd(r);
  return out;
}

// tiny reader for the bot_config block of robz.yaml: "  Key:\n    v: ...\n    note: ..."
function botConfigYaml(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n'), keys = {};
  let on = false, cur = null;
  const unq = s => { s = s.trim(); if (/^".*"$/.test(s)) { try { return JSON.parse(s); } catch (e) { return s.slice(1, -1); } } return s; };
  for (const l of lines) {
    if (/^bot_config:\s*$/.test(l)) { on = true; continue; }
    if (!on) continue;
    if (/^\S/.test(l)) break;
    let m = /^  ([A-Za-z_]\w*):\s*$/.exec(l);
    if (m) { cur = keys[m[1]] = { v: null }; continue; }
    m = /^    (v|note):\s*(.*)$/.exec(l);
    if (m && cur) cur[m[1]] = unq(m[2]);
  }
  return keys;
}

function main() {
  const a = process.argv.slice(2);
  const pack = a.find(x => !x.startsWith('--') && a[a.indexOf(x) - 1] !== '--robz-yaml');
  const yi = a.indexOf('--robz-yaml'), yaml = yi >= 0 ? a[yi + 1] : null;
  if (!pack) { console.error('usage: node vendor.js <pack dir> [--robz-yaml <robz.yaml>]'); process.exit(2); }
  const P = path.resolve(pack);
  if (!fs.existsSync(path.join(P, 'sdk', 'doctrine.json'))) { console.error('Not a doctrine pack (no sdk/doctrine.json): ' + P); process.exit(2); }
  fs.mkdirSync(path.join(D, 'md'), { recursive: true });
  fs.copyFileSync(path.join(P, 'sdk', 'doctrine.json'), path.join(D, 'doctrine.json'));
  fs.copyFileSync(path.join(P, 'README.md'), path.join(D, 'PACK-README.md'));
  const cp = (from, to) => { fs.mkdirSync(to, { recursive: true }); for (const f of fs.readdirSync(from)) if (f.endsWith('.md')) fs.copyFileSync(path.join(from, f), path.join(to, f)); };
  cp(path.join(P, 'sdk', 'missions'), path.join(D, 'md', 'missions'));
  cp(path.join(P, 'markdown', 'game'), path.join(D, 'md', 'game'));
  cp(path.join(P, 'markdown', 'profiles'), path.join(D, 'md', 'profiles'));
  for (const f of ['personas.md', 'core.md']) fs.copyFileSync(path.join(P, 'markdown', f), path.join(D, 'md', f));
  fs.writeFileSync(path.join(D, 'text.json'), JSON.stringify(mdTree(), null, 1));
  if (yaml) {
    const keys = botConfigYaml(fs.readFileSync(yaml, 'utf8'));
    fs.writeFileSync(path.join(D, 'robz-botconfig.json'), JSON.stringify({
      source: 'Men of War doctrine pack SDK, 3-game/profiles/robz.yaml bot_config (values and notes from the RobZ godny bot.data.lua). Reference only.',
      count: Object.keys(keys).length, keys }, null, 1));
  }
  console.log('vendored into ' + D);
}
if (require.main === module) main();
module.exports = { botConfigYaml, mdTree };
