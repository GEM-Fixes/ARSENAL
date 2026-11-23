---
name: mow-robz
description: RobZ Realism, the realism overhaul mod for Men of War Assault Squad 2 (mowas2) and its 64-bit build AS64 (as64), current 1.31.x: for people who play it, who mod on top of it and who maintain it. Load when the user says "RobZ", "RobZ Realism", "realism mod", "robz 1.31", "robz 1.30", "patch for RobZ", "sub-mod of RobZ", "addon for RobZ", "RobZ crashes", "RobZ will not load", "RobZ with another mod", "RobZ on AS64", "RobZ Classic or Enhanced", "RobZ units / prices / doctrine", "RobZ bots do nothing", "RobZ damage system", "why did my shot do nothing in RobZ", "what does RobZ change", "which RobZ version do I have", or asks how to play RobZ (ranges, income, presets, veterancy). Gates of Hell (goh) has no RobZ: the tools answer not available and name the note about a look-alike.
---

# mow-robz: RobZ Realism for players, sub-modders, maintainers (router)

Read ONE sub-file for the question at hand; each stands alone. Files sit beside this one.
game word: MCP `game` = `as64|mowas2|goh` (goh = not available) - CLI `--exe as64|mowas_2`. G = game install, R = the RobZ folder.

## Always
- R, every other installed mod, the game and its data are read-only. A change to RobZ = a sub-mod in a new folder the user names, loaded after RobZ
- numbers change per version: ask the tools (they read R now), do not quote a price or a count from memory or from these files
- tags: [V] read or measured, [I] inferred, [T] not run in game, [author] = the mod author's own readme. Say the tag with the fact
- the published 1.31.0 has the same data as 1.30.10 [V crc]; the loose 1.31.x tree differs a lot and is [T] (versions.md)
- sub-mod text: CRLF, UTF-8 strings, ASCII identifiers; RobZ comments may be cp1251 (keep bytes)
- done = the game ran RobZ + the sub-mod and game.log was read (skill `mow-mod-test`)

## Question -> file -> tools
| question | read | tools |
|---|---|---|
| which RobZ is installed, paks or loose, where things sit | structure.md | `mow_robz_find`, `mow_robz_system` |
| how it plays: damage, ranges, income, presets, veterancy, bots | play.md | `mow_robz_changes`, `mow_robz_unit`, `mow_robz_system` |
| a card's price, cooldown, CP, what it brings; an army's roster | play.md | `mow_robz_unit` |
| make a patch or sub-mod on RobZ, check one | submod.md | `mow_robz_submod`, `mow_mods_clash`, `mow_mods_patch` |
| RobZ with another mod | submod.md | `mow_robz_submod`, `mow_mods_clash` |
| RobZ on AS64: Classic, Enhanced, upgraded copy | as64.md | `mow_robz_find`, `mow_robz_issues`, `mow_mod_upgrade` |
| 1.30 against 1.31, what a sub-mod must follow | versions.md | `mow_robz_issues`, `mow_robz_notes` |
| crash, will not load, bots idle, no damage, raw text | trouble.md | `mow_robz_issues`, `mow_mod_check` |
| the long notes on one topic | - | `mow_robz_notes` (topic, file) |

## Tools (MCP first, CLI second)
| MCP | answers |
|---|---|
| `mow_robz_find` | installs in G/mods and the Workshop folder, version, layout, range, mods that name RobZ |
| `mow_robz_changes` | what RobZ changes by area (damage, guns, infantry, economy, armies, modes, content) + live counts |
| `mow_robz_system` | `kind` macro, preset, tier, army, doctrine: read from R |
| `mow_robz_unit` | buy cards: price, cooldown, CP, rank, content, year set; filters side, kind, year, max_cost |
| `mow_robz_submod` | a sub-mod against RobZ: mod.info, Require, identical copies, shared files replaced whole, macros defined twice; `deep` adds per-key clashes |
| `mow_robz_issues` | known issues by version, game, area |
| `mow_robz_notes` | sections of refmods/robz by topic |

CLI (each prints usage with `--help`): `tools/conflicts/conflicts.js`, `tools/conflicts/patchmod.js`, `tools/overdiff/overdiff.js`,
`tools/check/check.js`, `tools/upgrade/upgrade.js`, `tools/rzsys/rzsys.js` (put a unit RobZ lacks under its rules),
maintainer side `tools/macrostd`, `tools/cardrename`, `tools/lngsplit`. Words and IDs: / `-l ID`.

## Depth
- refmods/robz/findings.md (what the mod is), systems.md (damage, guns, economy rule sets), systems-test.md (what ran in game),
  potential.md (bots, defects, what it shows is possible), upgrade-130.md (AS64 copy), goh-candidate.md (GoH look-alike)
- game rules RobZ sits on:, limits/INDEX.md; other skills: `mow-mod-together`, `mow-mod-start`, `mow-play-coach`, `mow-play-trouble`
