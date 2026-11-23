# Guide plan: Modding Men of War: Assault Squad 2 (incl. as64 build)

## 1. Audience, tone, style rules
- Audience: new-to-intermediate modders comfortable with a text editor and folders, not with engine internals.
- Plain, friendly English prose. Full sentences, short paragraphs, second person ("you"). Explain every term on first use and link to the glossary (chapter 22).
- Banned: caveman shorthand, arrows used as grammar, limit IDs ("VFS-08") or `lim` cites anywhere in text, absolute user paths (use `<game folder>`, `<mod folder>`, `mods/mymod/...`), third-party mod names, source file:line cites in body text. Allowed: at most one short "Engine reference" footnote per chapter naming the topic or function (no line numbers).
- Tags: [V] facts are stated plainly. [I]/[T] facts get a visible "(unconfirmed)" marker or an "Unconfirmed" callout, never presented as certain, with a hint on how to test them in game.
- ENCODING (state exactly; repeat in chapters 03, 04, 05, 14, 20): text data files (.def, .ext, .set, .mi, .patch, scripts and similar) use CRLF line endings; as64 reads every string value as UTF-8 in data and `.lng` alike (cp1251 strings show as U+FFFD boxes [V]); identifiers ASCII; vanilla is ASCII outside `;` comments, which may hold cp1251/cp866 bytes: keep them. Paks are ordinary zip files. Warn that editors can silently change encoding or line endings.
- Chapter format: title; "What you will learn"; numbered sections with short, accurate SDL/script snippets taken from the blocks; "Pitfalls" box drawn from limits rows (no IDs shown); "Try it" mini-exercise where sensible; "Next" line.
- Game folder and vanilla data are read-only advice: always tell readers to work in their own mod folder.
- Commands: use `ARSENAL <tool>` form (explain once, chapter 19, that it runs `node tools/<tool>/<tool>.js`). Tools marked [NEW] in QUICKSTART are described as "planned".
- Plain Markdown, UTF-8: headings, lists, code fences; tables at most 4 columns.
- Source access:<topic>/<block>.md; limits via `grep -n "pattern" limits/AREA.md` also works. Read only what is listed.

## 2. Chapter list (files in guide/)
Status (2026-11-10, version 2.0): the guide is a book in three parts, read in this order: README.md (front page), Part I "By process" `p01..p16`, Part II "In detail" `01..22`, Part III "Reference" `r01..r12`. build-pdf.js finds each part by file pattern; CHANGELOG.md gives the version. Sections 3 and 4 below are the 1.x plan for Part II; the brief for 2.0 is
PDF: `node guide/build-pdf.js` from the repository root; needs Edge or Chrome (prints in the background); writes `guide/dist/AS2-Modding-Guide-v<version>.html` and `.pdf`, overwriting; `--html-only`, `--browser <exe>`, `--out <folder>`. The book holds README and the three parts; CHANGELOG.md and the commit are not printed (owner 2026-11-10: no work history in user documents).

Part I, one job per page: p01-first-mod, p02-change-unit-numbers, p03-add-a-unit, p04-change-a-gun, p05-change-armour, p06-edit-a-model, p07-text-and-translation, p08-icons-and-interface, p09-copy-and-change-a-map, p10-missions-and-modes, p11-bots, p12-unit-from-gates-of-hell, p13-old-mod-to-64-bit, p14-check-fix-read-log, p15-pack-and-share, p16-find-guides-and-tools.

Part III, one entry per key or function (Where, Type, Values, Does, Limits, Example, See): r01-mod-info-and-folder, r02-entity-definition, r03-extenders-and-components, r04-chassis-and-movement, r05-humans, r06-weapons-and-ammunition, r07-armour-volumes-damage, r08-vision-effects-sound, r09-interface-and-localization, r10-interaction-scripts, r11-mission-files, r12-bot-lua-and-console.

Part II: README.md (front page), 01-getting-started, 02-install-layout, 03-mod-folder-and-load-order, 04-vfs-paks-patches, 05-sdl-language, 06-data-keys-entities, 07-units-vehicles-movement, 08-infantry-and-humans, 09-weapons-ammo-damage, 10-ai-and-bots, 11-interaction-scripts, 12-missions-and-multiplayer-setup, 13-maps, 14-localization, 15-interface-and-icons, 16-effects-sound-models, 17-balance-pricing-gameplay, 18-testing-and-logs, 19-toolchain, 20-packaging-and-release, 21-troubleshooting, 22-glossary. (All .md.) Porting from Gates of Hell is a short appendix section in chapter 19. Multiplayer sync/desync is covered in 12 and 21.

## 3. Per-chapter spec (M =, L = limits area, T = tool)

### 01-getting-started (1500 w)
Purpose: what soft-code modding is, what you can and cannot change, first small win.
Outline: what a mod is; editable layers (entity data, interaction scripts, mission/.mi/Lua, UI data, .lng); what is compiled and unchangeable; minimum toolset (encoding-aware editor, zip tool, optional Node + as2); first mod in 10 minutes (newmod + one changed value); learning from vanilla data; reading the "unconfirmed" markers.
Sources:,; M ui/overview, testing/env, testing/launch; tools/QUICKSTART.md sections 1-2; L ENG, TST (skim).

### 02-install-layout (1800 w)
Purpose: tour of game folder, user data, executables, paks.
Outline: game folder; resource paks and contents; set/ subfolders; entity folder classes; user profile files (options, profile, game.log location); which exe to run (original vs as64); launch options; Classic vs Enhanced teaser (pointer to ch. 3); Workshop folders.
Sources: M files/resource, set-dirs, vehicles, vpaths; M ui/folders; M testing/env, launch; M vfs/workshop; L VFS (mode rows only), TST.

### 03-mod-folder-and-load-order (2500 w)
Purpose: mod structure, mod.info, activation, ordering, Classic vs Enhanced mode.
Outline: minimal layout; mod.info keys and version gate; dependencies; Classic vs Enhanced (built-in extras mod, which mods load in which mode, making a mod work in both, minimum game version); activation in Options > MODS and profile; order; what resets when mods change; multiplayer-synced prefixes; encoding.
Sources: M vfs/modinfo, mods, order, mount; M files/mount; M testing/launch; L VFS (mod, order, version-gate, built-in mod rows), TST (mod apply), NET (lobby CRC); T modinfo, modswitch, newmod.

### 04-vfs-paks-patches (2500 w)
Purpose: virtual file system, precedence, paks, .pat patches.
Outline: virtual paths and name normalisation; loose vs pak vs mod precedence with worked examples; pak = zip and zip-root rules; N.pat archives; .patch semantics (replace, delete, remap); gotchas (loose .patch not read, name ordering); inspecting the effective file set; encoding reminder.
Sources: M vfs/repo, names, mount, order, patch, emulate; M files/vpaths, mount; M testing/packing; L VFS (pick pitfalls), KEY (patch rows); T vfs, conflicts, overdiff.

### 05-sdl-language (3000 w)
Purpose: SDL syntax used by all data.
Outline: blocks, keys, values; comments (semicolon only); strings and escapes; int vs float rule; tags, colors, vectors, ranges, time; include, define, macros and parameters; `mod`/`from` inheritance; fatal vs warning errors with real message examples; BOM; key matching, unknown keys, repeats, merging; safe editing; validating.
Sources: M sdl/lexer, strings-tags, reader, macros, errors, dda-syntax, types-num, types-misc, roundtrip; L SDL (about 15 top pitfalls); T sdllint, lintrc.

### 06-data-keys-entities (3000 w)
Purpose: anatomy of an entity and how to add one.
Outline: entity classes/folders; top-level def keys; tag lists; `from` and conv rules; volumes and armor areas; extenders (inventory, vitality, shield, supply, light, cannon); sensors basics; seats; stuff base types; data sets (material, breed, ability, target selectors); step-by-step new entity with clone-entity; common mistakes.
Sources: M keys/conv, def-top, volume, armor, extenders, sensor, seats, stuff-base, data-sets; M formats/wiring, vol; M refcheck/* (skim); L KEY, STR, FMT (vol rows); T keylint, clone-entity, patch-entity, entityindex, refcheck, newmod.

### 07-units-vehicles-movement (2500 w)
Purpose: vehicles, chassis, physics, pathfinding, terrain.
Outline: units and scale; vehicle keys; chassis and locomotion (wheels, tracks, gears); legged movement; terrain and speed; pathfinding classes and obstacles; orders; collisions; water/rigid bodies; tuning examples.
Sources: M movement/* (units, vehicle-keys, vehicle-physics, chassis, foot, human, terrain, pather, obstacles, pathfinding, orders, collision, rigid-water); M keys/chassis; L MOV; T movlint.

### 08-infantry-and-humans (2500 w)
Purpose: soldiers.
Outline: human entity; health and death; morale; stances; abilities; weapon skill and veterancy; breeds; inventory and reload; animation choice; crew and seats; tuning examples.
Sources: M humans/* (all 15); M keys/seats; L HUM; T humlint.

### 09-weapons-ammo-damage (3500 w)
Purpose: weapons, ammo, flight, penetration, armor, blast, fire.
Outline: weapon keys; ammo types; spreading and accuracy; flight; penetration test step by step; armor thickness; ricochet and graze; blast and fragments; fire and cook-off; infantry damage; worked tuning examples; pitfalls.
Sources: M keys/weaponry, weapon-keys, weapon-damage, spreading, ammo, armor; M damage/* (all 11); M gameplay/armor, artillery; L DMG, KEY (weapon rows), GPL; T statsheet, patch-entity.

### 10-ai-and-bots (2000 w)
Purpose: target choice, firing, MP bots.
Outline: target selection; ammo selection; firing rules; infantry tactics; vehicle AI; vision as AI input; MP bot Lua; which data changes affect AI; symptom-to-cause list.
Sources: M ai/* (all 8); M mission/bot-lua, bot-data; M keys/sensor; L AI, MIS (bot rows).

### 11-interaction-scripts (3000 w)
Purpose: the `{on event}` interaction language.
Outline: concept and loading; block tags, levels, inherit/overload; events; custom events; conditions; actions (set/call/delay/spawn/delete; sound/view/animation; entity/physics/FX; actor actions); flags and caps; worked examples; debugging.
Sources: M interaction/* (all 9); L INT; T ialint.

### 12-missions-and-multiplayer-setup (3500 w)
Purpose: game modes, MP setup, budgets, mission scripting, console, sync awareness.
Outline: how an MP game is assembled (game card, mode .set, preset); budgets and keys; unit entries, cost, unlock; making a new mode (mission-clone); .mi structure, triggers, commands, conditions; bot data/Lua; console, registry, options; pricing model; MP sync and desync causes, mod CRC rules.
Sources: M mission/* (all 10), pricing/*, net/model, sync, lobby, rng, modder, rules; L MIS, NET, GPL (pricing rows); T mission-clone, milint, misdiff, mpsync.

### 13-maps (2500 w)
Purpose: map folder, terrain, points, registration.
Outline: map vs mission; map folder files; map entity file; terrain data and materials; map points (spawn, flags); .mi top level and players; lobby registration; minimal new MP map recipe; pathfinding grid notes; editor saves; patching vanilla maps from a mod.
Sources: M maps/* (all 7); M mission/mi-structure; L MAP; T mapview, place-entity, misdiff.

### 14-localization (1800 w)
Purpose: .lng files and adding texts.
Outline: where texts come from; .lng syntax and key derivation; load/replace rule; UTF-8 requirement (stress the exception); key families; step-by-step adding texts; checks.
Sources: M localization/format, keys, add; L LOC; T lnglint, loccover, lng-add.

### 15-interface-and-icons (2200 w)
Purpose: data-driven UI.
Outline: compiled vs data UI; interface folder; icons and frame naming; MP purchase card and category pictures; unit cards and portraits; widgets, skins, page scripts; actions; command panel; keys.set and hotkeys; fonts, cursors, minimap.
Sources: M ui/* (all 11); L UI; T uilint.

### 16-effects-sound-models (2500 w)
Purpose: vision, FX, sound, weather, LOD, camera, asset formats, model wiring.
Outline: vision and detection data; sound names; environment presets; FX definitions and limits; LOD and rendering; camera; asset formats overview; wiring a model into a def; texture rules; checking headers.
Sources: M vision-fx/* (all 13), formats/* (dispatch, ply-chunks, anm, textures, sound-misc, mdl, vol, wiring); L VIS, FMT; T fxlint, binhdr.

### 17-balance-pricing-gameplay (1800 w)
Purpose: balancing, player-facing view of data changes.
Outline: mechanics as players see them; infantry, squads, armor, artillery, UI behaviours; table of data change vs effect; MP economy and score; balance workflow (statsheet before/after, conflicts, overdiff); things that bite.
Sources: M gameplay/* (all 8), pricing/*; L GPL; tools/QUICKSTART.md section 2; T statsheet, overdiff, conflicts.

### 18-testing-and-logs (3000 w)
Purpose: in-game testing and reading game.log.
Outline: per-change test loop; launch and mod activation; LAN test bed; lobby; controls cheat sheet; screenshots and records; game.log structure; fatal vs warning tables; benign noise; minidumps; OOS dumps; triage checklist and bisecting; automation (testrun, logtriage).
Sources: M testing/* (all 7), logs/* (all 8); L TST, LOG, NET (OOS rows); T testrun, logtriage.

### 19-toolchain (2800 w)
Purpose: the as2 tool set.
Outline: install/run (as2, node, npm link, standalone); common flags (-q, --summary, --format, --game, --mods, .lintrc); tool families (linters, indexes/ref check, vfs, authoring helpers, comparison, build/doctor, test runner, porting); recommended command order; reading findings; what linters cannot catch; the QUICKSTART workflows as tutorials; brief appendix on porting from Gates of Hell.
Sources: tools/QUICKSTART.md, tools/INDEX.md (skip builder-kit tools such as libapi, brief, scaffold, buildlog, rows, srcdrift, webcheck, golden, usage), tools/lib/registry.js;; M porting/*; L PORT (top rows).

### 20-packaging-and-release (1800 w)
Purpose: shipping a mod.
Outline: loose vs pak; pak roles and naming; zip structure; encoding check; pre-release gate (build, doctor); MP compatibility and CRC; Workshop basics; versioning and minimum game version; changelog; git for mods.
Sources: M testing/packing; M vfs/mount, workshop, modinfo; M net/lobby, modder; L VFS (pak rows), SDL (BOM/encoding rows), TST; T packer, build, doctor, mpsync, drift.

### 21-troubleshooting (2500 w)
Purpose: symptom-to-cause catalogue and common crashes.
Outline: mod not listed; listed but no effect; closes on load (define not found, unexpected token, missing resource); missing text; untextured models; unselectable or immobile units; armor/damage surprises; MP desync and lobby mismatch; Classic vs Enhanced problems; performance; text decision tree; what to attach when asking for help.
Sources: M logs/fatal, warnings, warnings2, benign, triage, minidump, oos; M ai/fixes; L TST, LOG, VFS, SDL, ENG plus `grep -n "crash\|silent" limits/*.md`; T logtriage, doctor.

### 22-glossary (1500 w, group 5)
About 120 A-Z entries (SDL, DDA, def, ext, set, pak, pat, patch, VFS, lng, mi, interaction, quant, OOS, cp1251, extender, stuff, breed...) with chapter pointers. Sources:, SPEC.md; skim finished chapters.

### README.md (800 w, group 5)
Intro, audience, TOC with one-line summaries, reading paths (quick tweak, new unit, new map/mode, porting), conventions (placeholders, encoding warning, unconfirmed marker), glossary pointer.

## 4. Writer groups (disjoint files)
- Group 1 foundation (~11.3k w): 01-getting-started, 02-install-layout, 03-mod-folder-and-load-order, 04-vfs-paks-patches, 05-sdl-language
- Group 2 entities and combat (~11.5k): 06-data-keys-entities, 07-units-vehicles-movement, 08-infantry-and-humans, 09-weapons-ammo-damage
- Group 3 behaviour and content (~11k): 10-ai-and-bots, 11-interaction-scripts, 12-missions-and-multiplayer-setup, 13-maps
- Group 4 presentation, balance, test (~11.3k): 14-localization, 15-interface-and-icons, 16-effects-sound-models, 17-balance-pricing-gameplay, 18-testing-and-logs
- Group 5 tools, release, wrap-up (~11k): 19-toolchain, 20-packaging-and-release, 21-troubleshooting, then 22-glossary and README.md (last, after skimming the others)

Cross-group rules: refer to other chapters by number and title only; never edit another group's files; use identical placeholders (<game folder>, mods/mymod). Each writer ends with a self-check: no absolute paths, no limit IDs, no source file:line, encoding statement correct, unconfirmed items marked. Group 5's final pass reports inconsistencies in its reply instead of editing others' files.
