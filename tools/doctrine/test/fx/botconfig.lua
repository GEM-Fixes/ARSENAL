-- Robz-like bot settings (test fixture, made up). аб cp1251 bytes
BotConfig = {
	Debug          = true,   -- writes a log
	HoldMaxShare   = 0.45,   -- share of groups on flags
	GatherMax      = 90,     -- gather time
	LaunchShare    = 0.8,
	WaveTimeout    = 260,
	SwitchMargin   = 2.0,
	ReorderPeriod  = 150,
	EarlyPush      = 300,
	EarlyAssaultRatio = 0.7,
	AttackSpread   = 0.8,
	EngageDist     = 2000,
	BoundStep      = 320,
	AssaultRatio   = 1.3,
	UnderFireMaxMove = 600,
	DangerDist     = 2600,
	Smoke          = true,
	SmokeEvery     = 40,
	SmokeAttackEvery = 25,
	BackShare      = 0.42,
	DirAttackRatio = 1.4,
	SameUnitGap    = { light = 150, tank = 90 },
}
BotConfig.Exploit = true
