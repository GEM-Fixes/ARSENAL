# Translation: doctrine terms to game terms

Doctrine says what good play is. This file restates it in terms that hold on any mod and any game size. It does not say how the engine does it; that link is `engine-binding.md`. Engine behaviour behind the numbers is in `mechanics.md`; profile fields are explained in `profiles/fields.md`.

| Doctrine term | Game term | Rule |
|---|---|---|
| Echelon | Force group | Set by squads on hand, from `ladder.md`. Never by map name. |
| Branch | Role | Read from unit data, per `roles.md`. |
| Phase | Match phase | Set by flags, force ratio and tempo. See below. |
| Terrain | Feature class | open, woods, town, ridge, river, road. |
| Distance | Ratio of a profile value | `0.6 x mg` means 60% of the profile's median MG range. Doctrine yards are never used directly. |
| Time | Distance over unit speed | Doctrinal minutes do not fit match length. |
| Nation | Army family | From the profile's `armies` table. Unknown armies use the universal core. |

## Match phases
A **phase change** is the moment a group's or team's phase moves from one row of this table to another. It's the only safe time to change force shape or reassign groups.

| Phase | Enters when | Leaves when |
|---|---|---|
| approach | no contact on the chosen axis | first contact |
| recon | contact, enemy line unclear | enemy positions on the axis are known, or the time allowance ends |
| attack | local force ratio favors us at the chosen point | objective reached, or the attack stalls |
| assault | assault group inside close range of the objective | objective held or lost |
| defense | local force ratio is against us, or we hold what we want | ratio turns in our favor |
| counterattack | a held point was just lost and a reserve exists | point retaken or reserve spent |
| withdrawal | group cannot hold and has somewhere to go | group is rejoined with the next position |

Starting values for "favors" and "stalled" are design values, not doctrine, and are untested.

## Distances
Every distance in a rule names its base: `mg`, `rifle`, `gun_medium`, `sight_open` (standing man in the open), `sight_cover_prone` (prone man in cover) or `uncover` (still target auto-spotted). The profile supplies the number, so one rule stays valid across mods. A doctrinal yardage goes in the claim as evidence; the ratio in the rule is marked `param_source: design` or `tuned`, unless the source itself states the proportion. A value read from the mod profile (such as smoke life) is `param_source: profile`.

## Fit tags
- `direct`: the game has it.
- `proxy`: must be approximated.
- `engine`: depends on the adaptation.
- `out`: not in the game, such as supply or long preparatory fires.

Known stock limits to recheck against the adaptation (details in `mechanics.md`): no suppression model, so "pin then assault" is a proxy; morale is capped by health. Stock bots have no artillery fire missions (AI-11). Bailed crews are not re-crewed (AI-13). Stock bot Lua can order only `Spawn`, `CaptureFlag` and `SayChat` (MIS-08). Wind moves nothing, so smoke wind rules are out. In RobZ, idle units on AI auto-move never self-retreat; ordered moves are unaffected.
