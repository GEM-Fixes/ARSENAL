// builds the godny bot fixes as a separate patch folder. reads the set's gamelogic.pak, changes nothing in the set.
//   node refmods/robz/mapfix-build.js --game <install> --out <mod folder under mods/>
// fix 1 = map name from the Starting line. fix 2 = a "Not found" line also proves the log can be read, so silent refusals count as missing from the first order.
// the patch holds a full copy of bot.lua, so it goes stale if the set's bot.lua changes: rebuild then. maintainer: make the 2 edits in bot.lua and repack instead.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const pak = require('../../tools/lib/pak.js');
const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null; };
const game = arg('game'), out = arg('out');
if (!game || !out) { console.error('usage: --game <install> --out <mods/folder>'); process.exit(2); }
if (!/[\\/]mods[\\/][^\\/]+$/.test(path.resolve(out))) { console.error('--out must be a folder directly under mods/'); process.exit(2); }
const SET = 'robz realism mod 1.30.10 godny implementation';
const list = pak.list(`${game}/mods/${SET}/resource/gamelogic.pak`);
const name = x => String(x.name || x.path || x.file || x).split('\\').join('/').toLowerCase();
const entry = list.find(x => name(x) === 'script/multiplayer/bot.lua');
if (!entry) throw new Error('bot.lua not in gamelogic.pak');
const src = Buffer.from(pak.read(list, entry)).toString('latin1');
let fixed = src;

const mapAnchor = /(for m in string\.gmatch\(txt, "Loading map '\(\[\^'\]\+\)'"\) do last = m end\r?\n)/;
const MAP = `\tif not last then for m in string.gmatch(txt, 'Starting "([^":]+)') do last = m end end\r\n`;
if (!fixed.includes(MAP.trim())) {
  if (!mapAnchor.test(fixed)) throw new Error('map anchor not found: bot.lua changed, apply by hand');
  fixed = fixed.replace(mapAnchor, `$1${MAP}`);
}
const BUY_OLD = `if string.find(txt, "Not found - " .. name, 1, true) then return "missing" end`;
const BUY_NEW = `if string.find(txt, "Not found - " .. name, 1, true) then S.logWorks = true; return "missing" end`;
if (!fixed.includes(BUY_NEW)) {
  if (!fixed.includes(BUY_OLD)) throw new Error('buy anchor not found: bot.lua changed, apply by hand');
  fixed = fixed.replace(BUY_OLD, BUY_NEW);
}
if (fixed === src) { console.log('both fixes already in the set: no patch needed'); process.exit(0); }

fs.mkdirSync(`${out}/resource/script/multiplayer`, { recursive: true });
fs.writeFileSync(`${out}/mod.info`, '{Mod\r\n\t{Name "godny bot fixes"}\r\n\t{MinGameVersion "3.262"}\r\n\t{MaxGameVersion "3.262"}\r\n}\r\n', 'latin1');
fs.writeFileSync(`${out}/resource/script/multiplayer/bot.lua`, fixed, 'latin1');
const sha = b => crypto.createHash('sha256').update(b, 'latin1').digest('hex').slice(0, 12);
console.log(`bot.lua ${sha(src)} -> ${sha(fixed)}, ${fixed.length - src.length} bytes added, written to ${out}`);
