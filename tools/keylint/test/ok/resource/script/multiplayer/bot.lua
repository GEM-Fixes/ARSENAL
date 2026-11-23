function OnGameQuant()
	BotApi.Commands:Spawn("a", MaxSquadSize)
	BotApi.Commands:CaptureFlag(squad, "f")
	BotApi.Commands:SayChat("hi")
	local inc = BotApi.Commands:Income(1)
	local t = BotApi.Commands:EnemyHasTanks()
	-- BotApi.Commands:FireAt(squad)
	local s = "BotApi.Commands:Retreat(x)"
end
