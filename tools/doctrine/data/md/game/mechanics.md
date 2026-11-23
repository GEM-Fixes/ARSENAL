# Engine mechanics that shape doctrine (stock AS2 engine)

Read from the as64 notes (`run\docs\internal`:, limits AI/GPL/VIS/HUM) and the game files, 2026-11-08. Facts marked [T] in as64 are untested there and stay untested here. Mod values come from `profiles/*.yaml`.

## Unit stance logic (each soldier, once a second)
**Scope: AI auto-move only.** These values drive what a unit does on its own when it has no move order (idle, or holding a position). A move, attack or withdraw order from a player or from the bot command layer overrides them. So `no_retreat`, `advance_ratio` and `move_radius` change how units behave between orders, not what orders can make them do.
- threat = enemy strength near the unit; spread = own strength near it. retreatLimit = retreat_ratio x threat, advanceLimit = advance_ratio x spread, both x1.5 in cover.
- Advance: morale > 70 and threat > advanceLimit (charge if threat > 2x the limit).
- Retreat, unless `no_retreat`: spread > retreatLimit gives full retreat; morale < 50 falls back, < 30 retreats; a retreat holds until retreatLimit >= spread.
- Engine defaults: retreat 2, advance 2, move radius 7 m. **RobZ** sets no_retreat 1, advance 10, move radius 50: idle units never self-retreat, rarely self-advance, and roam up to 50 m on their own. A planned withdrawal is an order in both mods; RobZ only removes the unplanned one.

## Morale and fear
- Morale 0-100, regains about 0.83 per second. Damage costs damage x 20 and stops recovery for 10 s; morale is capped by health %.
- A death costs -60 morale shared among allies within 20 m; the killer gains +10. Allies pull 25% toward each other's morale.
- **No suppression model** (HUM-09): incoming fire that misses does nothing. "Pin" exists only as losses and fear.
- Frightened: health below 10% always, below 20% 70% of the time, below 30% 30% of the time.

## Cover and pose (AI soldiers)
- Seeks cover within 15 m (skips the flee 30% of the time); with no cover, flees 10-20 m.
- Approach pose: prone beyond 25 m of the target, crouched beyond 10 m, standing within 7 m.
- Self-heals below 70% health with a bandage after 5 s without seeing an enemy.

## Spotting
- Sight range = preset radius x scale x factor. Rule trees: the first matching branch wins and a deeper match **replaces** the factor, it does not multiply.
- A soldier who fired in the last second is seen farther (vanilla 1.15, RobZ 1.65 of radius), whatever his cover.
- Once a target is already seen (`visible`), its factor becomes 1.0 vanilla / 1.05 RobZ, so in RobZ a spotted standing man is tracked to ~87 m though first seen at ~124 m (as64 rule order, not checked in play).
- Still targets inside `uncover` range are spotted whatever their pose.
- Recognition: a contact counts once time seen > distance / sight x RecognizeTime. Engine default 2 s, vanilla 0.25 s, RobZ 0.01 s: near instant in both mods.
- Contacts are shared over InformRange (vanilla 40 m, RobZ 120 m). Unseen contacts are remembered 120 s.
- Haze and weather do not cut AI sight. Night factor 0.13, but most vanilla map presets switch the penalty off; lit targets are fully seen.
- **Concealment correction (2026-11-08):** RobZ does not make concealment worth less. Contact comes earlier, but cover and prone cut sight more (3.75x against 2.5x in vanilla).

## Smoke
- Wind does not move bullets, grenades or smoke (VIS-16). The "wind" part of smoke doctrine is out in game.
- Vanilla smoke grenade: screen builds over 5 s, lasts about 60 s. Mortar smoke builds in 2-5 s, about 60 s in both mods.
- RobZ grenade, launcher and shell smoke: about 90 s, plus a sight-blocking sphere (106.8 units, about 5 m) for 87 s; white phosphorus 40-60 s; large smoke 120 s.
- Throw range: vanilla 25 m, RobZ 32 m.

## Targeting and vehicles
- A contact no target group matches is never attacked (AI-01).
- A vehicle has one target list for all its weapons (AI-06): its MGs wait while the gun hunts a tank. AI vehicle MGs fire about one burst per 1.3 s.
- Hatch gunners leave their MG when threat is above 4x. Bailed crews may re-enter after 20 s; stock bots do not re-crew (AI-13).
- A vehicle that cannot aim detours every 2-4 s, which makes it circle. Aim delay 0.3-1.1 s.
- HE blast falls linearly to zero at its radius; penetration ends at range + 5 m. Towed guns cannot fire.

## What stock bots can and cannot order
- Bot Lua can only Spawn, CaptureFlag and SayChat (AI-12, MIS-08). No artillery fire missions (AI-11). Grenade ammo drops and flamethrowers need direct control (GPL-16).
- Vanilla `bot.data.lua`: squads of 5, orders rotate every 3 min, flag priority captured 1 / enemy 2 / neutral 3.
- Unit limits give no refund on death.

## What this changes in the doctrine mapping
| Doctrine idea | In game |
|---|---|
| Suppress, then assault | Proxy: losses and fear only. Kill or blind (smoke) the base of fire instead of pinning it. |
| Concealment, hold fire | Direct, and stronger in RobZ: prone in cover is seen at 33 m against 124 m standing in the open. Firing reveals at once (1.65 factor). |
| Ambush | Direct if the ambusher is still, outside the enemy's uncover range, and holds fire until the set range. |
| Smoke and wind | Smoke blinds as doctrine says; wind is out; life is fixed per mod. |
| Withdrawal | Always an order in both mods. Auto-move only: vanilla idle units also fall back alone when outnumbered by the retreat ratio; RobZ idle units never do (no_retreat). |
| Short bounds | RobZ starts stamina at 50 with slow regain: walk inside danger range, sprint only short dashes. |
