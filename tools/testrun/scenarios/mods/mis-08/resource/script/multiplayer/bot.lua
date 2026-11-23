-- MIS-08 probe: report which command names BotApi.Commands exposes, once at game start
local names = {"Spawn", "CaptureFlag", "SayChat", "Income", "EnemyHasTanks", "ClearOrders", "Attack", "Retreat", "Move", "Fire"}
local function Probe()
	for _, n in ipairs(names) do
		local ok, v = pcall(function() return BotApi.Commands[n] end)
		local msg = "TRS08 " .. n .. "=" .. (ok and type(v) or "error")
		pcall(function() print(msg) end)
		pcall(function() BotApi.Commands:SayChat(msg) end)
	end
end
BotApi.Events:Subscribe(BotApi.Events.GameStart, Probe)
