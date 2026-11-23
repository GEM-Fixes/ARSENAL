#!/usr/bin/env node
// exever: compare the 3 game exes + Steam build ids against exit 1 = something changed: append a row there.
//   node tools/exever/exever.js [--as2 dir] [--goh dir] [--log file] [--online]
//   --online also reads the public Steam build from api.steamcmd.net (sends only the app id)
// Author: Imperator_Aug (ARSENAL, ia-5807e0aa)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), https = require('https');
const { check, LOG } = require('../lib/exever');
const o = { as2: require('../lib/gamedir').resolve().dir, goh: require('../lib/gamedir').goh(), log: LOG };
const a = process.argv.slice(2);
for (let i = 0; i < a.length; i++) { if (a[i] === '--as2') o.as2 = a[++i]; else if (a[i] === '--goh') o.goh = a[++i]; else if (a[i] === '--log') o.log = a[++i]; else if (a[i] === '--online') o.online = true; else { console.error('unknown ' + a[i]); process.exit(2); } }
const text = fs.existsSync(o.log) ? fs.readFileSync(o.log, 'utf8') : '';
let n = 0;
const rep = { info: s => console.log('info ' + s), add: (c, s) => { n++; console.log(c + ' ' + s); }, finish: () => { console.log(n + ' findings'); return n ? 1 : 0; } };
const EXES = [[o.as2, 'as64.exe'], [o.as2, 'mowas_2.exe'], [o.goh, 'binaries/x64/call_to_arms.exe']];
const GAMES = [['AS2', 244450, o.as2], ['GoH', 400750, o.goh]];

for (const [dir, rel] of EXES) {
  const f = path.join(dir, rel);
  if (!fs.existsSync(f)) { rep.info(`${rel}: not found under ${dir}`); continue; }
  const r = check(f, text);
  if (r.known) rep.info(`${r.name}: ${r.short} known (${r.pe || 'no PE version'}, ${r.bytes} bytes)`);
  else rep.add('EXE_NEW_BUILD', `${r.name}: sha ${r.sha} not in the log (${r.pe || 'no PE version'}, ${r.bytes} bytes, ${r.mtime}). append a row, recheck facts that depend on it`);
}
// steamapps/appmanifest_<id>.acf sits beside common/<game>
function manifestBuild(dir, id) {
  const f = path.join(dir, '..', '..', `appmanifest_${id}.acf`);
  if (!fs.existsSync(f)) return null;
  const m = /"buildid"\s+"(\d+)"/.exec(fs.readFileSync(f, 'latin1'));
  return m && m[1];
}
function publicBuild(id) {
  return new Promise(res => {
    const req = https.get(`https://api.steamcmd.net/v1/info/${id}`, r => {
      let s = ''; r.on('data', d => s += d);
      r.on('end', () => { try { res(JSON.parse(s).data[id].depots.branches.public.buildid); } catch { res(null); } });
    });
    req.on('error', () => res(null)); req.setTimeout(15000, () => { req.destroy(); res(null); });
  });
}
(async () => {
  for (const [name, id, dir] of GAMES) {
    const b = manifestBuild(dir, id);
    if (b === null) { rep.info(`${name}: no appmanifest_${id}.acf`); continue; }
    const row = new RegExp(`\\|\\s*${id}\\s*\\|\\s*${b}\\s*\\|`).test(text);
    if (row) rep.info(`${name}: installed Steam build ${b} known`);
    else rep.add('EXE_NEW_STEAM_BUILD', `${name}: installed Steam build ${b} not in the log. append a row`);
    if (o.online) {
      const p = await publicBuild(id);
      if (p === null) rep.info(`${name}: public Steam build not read (offline or api changed)`);
      else if (p !== b) rep.add('EXE_STEAM_UPDATE_OUT', `${name}: Steam lists build ${p}, installed ${b}: an update is out`);
      else rep.info(`${name}: public Steam build ${p} = installed`);
    }
  }
  process.exit(rep.finish());
})();
