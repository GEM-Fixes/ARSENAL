// builds the clone-play fixture (generated, gitignored: holds clones of vanilla data). run before testrun --scenario clone-play.json
//   node tools/testrun/scenarios/mkclone-play.js --game <install>
// one clone per army: the bot's army is random and a card of another army makes Spawn return true without buying
// Author: Imperator_Aug (ARSENAL, ia-482ebd13)
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const arg = process.argv.indexOf('--game');
if (arg < 0) { console.error('usage: mkclone-play.js --game <install>'); process.exit(2); }
const G = process.argv[arg + 1], HERE = __dirname, R = path.join(HERE, '..', '..', '..');
const src = fs.mkdtempSync(path.join(os.tmpdir(), 'clone-play-')), out = path.join(HERE, 'mods', 'clone-play');
const crlf = s => s.replace(/\r?\n/g, '\r\n');
const BASE = { usa: 'willysmb', rus: 'gaz67b', ger: 'r12', eng: 'willysmb_eng', jap: 'type97' };
for (const [army, base] of Object.entries(BASE)) {
  const r = cp.spawnSync(process.execPath, [path.join(R, 'tools/clone-entity/clone-entity.js'), '--game', G, '--out', src, '--entity', base, '--as', 'e2e_v_' + army, '--name', 'E2E ' + army, '--roster'], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(army, r.stdout, r.stderr); process.exit(1); }
}
fs.writeFileSync(path.join(src, 'mod.info'), crlf('{Mod\n {Name "trs clone-play"}\n {MinGameVersion "3.301"}\n}\n'));
fs.mkdirSync(path.join(src, 'resource/script/multiplayer'), { recursive: true });
fs.mkdirSync(path.join(src, 'resource/set/multiplayer/games'), { recursive: true });
fs.copyFileSync(path.join(HERE, 'mods/mis-08/resource/set/multiplayer/games/combat.set'), path.join(src, 'resource/set/multiplayer/games/combat.set'));
fs.writeFileSync(path.join(src, 'resource/script/multiplayer/bot.main.lua'), crlf(`require([[/script/multiplayer/bot]])

-- bot buys a fake name (control: engine must say not found), a vanilla card (control: bot can buy), then the clone. after that vanilla logic
local base = {${Object.entries(BASE).map(([a, b]) => `${a} = "${b}"`).join(', ')}}
local seq, i = nil, 1

local function Probe()
	if not seq then
		local army = BotApi.Instance.army
		seq = {"e2e_no_such_card", base[army], "e2e_v_" .. army}
		print("TRSCLONE army=" .. tostring(army))
	end
	local name = seq[i]
	if name then
		if BotApi.Commands:Spawn(name, 5) then
			print("TRSCLONE tried " .. name)
			i = i + 1
		end
	else
		OnGameQuant()
	end
end

BotApi.Events:Unsubscribe(BotApi.Events.Quant)
BotApi.Events:Subscribe(BotApi.Events.Quant, Probe)
`));
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'resource'), { recursive: true });
fs.copyFileSync(path.join(src, 'mod.info'), path.join(out, 'mod.info'));
fs.cpSync(path.join(src, 'localization'), path.join(out, 'localization'), { recursive: true });
const r = cp.spawnSync(process.execPath, [path.join(R, 'tools/packer/packer.js'), src, '--out', path.join(out, 'resource')], { encoding: 'utf8' });
if (r.status !== 0) { console.error(r.stdout, r.stderr); process.exit(1); }
fs.rmSync(src, { recursive: true, force: true });
console.log('built', out, fs.readdirSync(path.join(out, 'resource')).join(' '));
