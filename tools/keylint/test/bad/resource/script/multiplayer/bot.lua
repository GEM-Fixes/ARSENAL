function OnGameQuant()
	BotApi.Commands:Spawn("a", MaxSquadSize)
	BotApi.Commands:CaptureFlag(squad, "f")
	local inc = BotApi.Commands:Income(1)
	BotApi.Commands:BoardVehicle(squad, veh)
	-- BotApi.Commands:FireAt(squad)
	BotApi.Commands:Retreat(squad)
end
