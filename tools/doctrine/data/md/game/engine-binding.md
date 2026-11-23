# Engine binding

Maps each policy term to the input that tunes it. The engine-level adaptation of buying and tactical AI is a separate work and its own inputs are not known here. The nearest existing surface is the RobZ godny bot's `BotConfig` table (`resource/script/multiplayer/bot.data.lua`). Its keys and values are in `profiles/robz.yaml` under `bot_config`. This table is a read-only reference, not a design. Vanilla's bot data has only `MaxSquadSize`, `OrderRotationPeriod` and `FlagPriority`.

| Policy term | Nearest BotConfig keys (RobZ godny bot) | Notes |
|---|---|---|
| main effort (axis, priority) | `Director`, `DirAttackRatio`, `DirDefendRatio`, `DirAvoid`, `FlagValueWeight`, `AttackSpread` | Director attacks at local ratio 1.4, defends at 1.1. Spread 0.8 rad gives three approaches. |
| attack waves, tempo | `GatherMax`, `LaunchShare`, `WaveTimeout`, `EarlyPush`, `EarlyAssaultRatio` | Gather then launch at 80% present. |
| group task: hold / economy | `HoldFlags`, `HoldMaxShare`, `FrontRange`, `MidRange`, `BackShare`, `MidHoldMin`, `BotHoldPref` | Hold share is capped at 45%. |
| fire and movement (bound) | `BoundStep`, `BoundEvery`, `BoundRatio`, `EngageDist`, `EngageHold`, `CoverRadius`, `UnderFireHold`, `UnderFireMaxMove` | 16 m bounds, 100 m engage distance. |
| assault line, capture | `LineGap`, `LineSpacing`, `LineMax`, `AssaultRatio`, `CaptureTeam`, `CapWalkDist` | Assault at local ratio 1.3. |
| dig in, fortify (defense layout) | `DigBands`, `DigSpacing`, `BuildSandbags`, `Fortify*`, `MGNests`, `Nest*` | Dig 15-35 m behind a held flag. |
| MG, sniper and AT-rifle siting | `MGMin/Want/Max`, `MGDigBack`, `MGLineBack`, `SniperMin/Want/Max`, `ATRMin/Want/Max` | Siting bands in units (20 = 1 m). |
| AT screen, guns | `AtRange`, `AtHuntRange`, `AtGunBack`, `EmplaceBack`, `GunMove`, `BuyAtGuns` | AI guns do not move (`BuyAtGuns` false). |
| tank and TD standoff | `TankRange`, `TDRange`, `VehBack`, `VehMinInf`, `VehMinArmor`, `VehMinAT`, `FaceTolTank`, `FaceTolTD`, `VehStep` | Tanks fight armour at about 120 m, TDs at 170 m. |
| light vehicles flee AT | `LightFleeDist`, `LightFleeTo`, `LightFleeTime`, `LightUntil` | |
| smoke | `Smoke`, `SmokeRange`, `SmokeCount`, `SmokeMaxFrac`, `SmokeEvery`, `SmokeAttackEvery` | 4 rounds at 45 m: front edge, both sides, middle. |
| grenades | `Grenades`, `GrenadeRange`, `AtGrenadeRange`, `GrenadeSafe` | 37 m, AT 22 m. |
| movement under threat | `DangerDist`, `Run`, `RunDist`, `CalmDist`, `PoseGap`, `ProneAfter` | Walk within 130 m of a known MG or vehicle. |
| force shape, role share, must-haves | `early`, `mid`, `late`, `antiTank`, `BotStrength`, `TDAfter`, `LightWhenArmour`, `AtNeedMax` | Composition tables by match stage. |
| money held back | `SaveForVehicles`, `SaveMinGroups`, `SaveMaxTime`, `BuyWaitBase`, `BuyWaitPerCost`, `BuyLead` | |
| withdrawal order | `Disengage` | Works in both mods. `no_retreat 1` (RobZ) only stops idle units retreating by auto-move; it never blocks an order. |
| distance ratio base (`mg`, `rifle`, `gun_medium`, `sight`) | profile `range_m`, `vision.sight_vs_infantry_m` | See `profiles/fields.md`. |

The bot author's replay numbers in the comments (for example "players fight armour at ~110 m") are not checked and are not doctrine.
