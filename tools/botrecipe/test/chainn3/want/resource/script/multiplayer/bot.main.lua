-- AI-3 probe, before the require: the first Subscribe per event stays, so these two stay and call the stock globals.
local last = 0
local function Tick()
	local now = os.time()
	if now - last < 10 then return end
	last = now
	local n, s = 0, ""
	for _, f in pairs(BotApi.Scene.Flags) do
		n = n + 1
		s = s .. " " .. tostring(f.name) .. "=" .. tostring(f.occupant)
	end
	local q = 0
	for _ in pairs(BotApi.Scene.Squads) do q = q + 1 end
	print("AI3 tick side=" .. tostring(BotApi.Instance.playerId) .. " army=" .. tostring(BotApi.Instance.army) .. " t=" .. now .. " flags=" .. n .. s .. " squads=" .. q .. " income=" .. tostring(BotApi.Commands:Income(BotApi.Instance.playerId)))
end
BotApi.Events:Subscribe(BotApi.Events.Quant, function()
	OnGameQuant()
	Tick()
end)
BotApi.Events:Subscribe(BotApi.Events.GameSpawn, function(args)
	print("AI3 spawn side=" .. tostring(BotApi.Instance.playerId) .. " squad=" .. tostring(args.squadId) .. " t=" .. os.time())
	OnGameSpawn(args)
end)
require([[/script/multiplayer/bot]])
-- bot.lua calls these globals by name, so they can be wrapped after the require.
local cf = CaptureFlag
CaptureFlag = function(squad)
	print("AI3 order side=" .. tostring(BotApi.Instance.playerId) .. " squad=" .. tostring(squad) .. " t=" .. os.time())
	return cf(squad)
end
local gn = GetNextUnitToSpawn
GetNextUnitToSpawn = function(p)
	local u = gn(p)
	print("AI3 pick side=" .. tostring(BotApi.Instance.playerId) .. " unit=" .. tostring(u and u.unit) .. " t=" .. os.time())
	return u
end
print("AI3 loaded side=" .. tostring(BotApi.Instance.playerId) .. " army=" .. tostring(BotApi.Instance.army) .. " team=" .. tostring(BotApi.Instance.team))
