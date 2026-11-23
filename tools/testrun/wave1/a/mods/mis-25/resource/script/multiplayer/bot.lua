-- MIS-25 probe: run a quant timer the way stock bot.lua SetSquadOrder does, with OrderRotationPeriod as its delay. Prints only.
require([[/script/multiplayer/bot.data]])
local last, n = nil, 0
local function Tick()
	n = n + 1
	local now = os.clock()
	print(string.format("TRS25 tick=%d dt=%.1f", n, now - last))
	last = now
	if n < 6 then
		BotApi.Events:SetQuantTimer(Tick, OrderRotationPeriod)
	end
end
local function Start()
	print("TRS25 start period=" .. tostring(OrderRotationPeriod))
	last = os.clock()
	BotApi.Events:SetQuantTimer(Tick, OrderRotationPeriod)
	BotApi.Events:SetQuantTimer(function() print("TRS25 late fired") end, 600000)
end
BotApi.Events:Subscribe(BotApi.Events.GameStart, Start)
BotApi.Events:Subscribe(BotApi.Events.Quant, function() end)
