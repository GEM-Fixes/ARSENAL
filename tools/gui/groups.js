// GUI games and tabs (W5 shell, nine-tab layout 2026-11-13): the one table of which game shows which tabs, and which pages sit in each.
// The header has three games (MoW:AS2, AS64, GoH); under it the tabs of the current game only; under them the sub-tab row (a tab with
// two or more sub-tabs on show); above the page the third row (a sub-tab with two or more items on show). Game parity (2026-11-14): MoW:AS2
// and GoH list every tab, sub-tab and page of AS64 in the same order; a page that cannot run in a game stays listed and goes into that
// game's na (below). GoH adds its own goh page (the GoH to AS2 port). An id with no page in the GUI yet is never shown.
// Per game: id, name (shown as is, a game name), exe (the file that marks its folder), version, target (the tools' word for it:
// check --exe, gen --target, upgrade --to, fix --target), kind ('as2' = an Assault Squad 2 install, 'goh' = a Gates of Hell install),
// open (pages that sit behind the Advanced switch elsewhere but are this game's main work: shown without it), tabs.
// na (optional, game parity): {pageId: 'lang key of the reason'} = a page this game lists in its tabs but cannot run. The page keeps its place
// in the tab rows; its screen is hidden and the page shows naCard(key) instead: "Not available in <game>: <reason>" (page.js). Reason keys are
// na.<page>.<game> in the ext's own lang (en ru uk zh); for a core page (play, test) in tools/gui/lang/*.json. An na page is not in the page's INGAME (no "go to" button or next step leads there; it
// is in NA), and a link to it never switches game. A page that works but has one card or button that cannot exist draws that line itself.
// Per tab: id, label (core lang key, always shown), key (Alt+key, the same for a tab in every game, never by position: GT-27), subs.
// Per sub-tab: id (unique in its tab), label (core lang key), pages = refs in third-row order, why (the tools and options that decide
// it; has the long form). A ref is a page id or 'page/view' (one view of a page, e.g. 'docs/engine').
// Each tab also has pages = the page ids its refs name (derived), for the readers of the flat list.
// ADVREF = refs that show only with Advanced (besides the pages an ext marks adv). Advanced never adds a tab.
// Author: Imperator_Aug (ARSENAL, ia-68947d3b)
const T = { help: ['grp.help', '1'], mods: ['grp.mods', '2'], ide: ['grp.ide', '3'], models: ['grp.models', '4'], maps: ['grp.maps', '5'], bots: ['grp.bots', '6'], units: ['grp.units', '7'], share: ['grp.share', '8'], tools: ['grp.tools', '9'] };
const sub = (id, label, pages, why) => ({ id, label, pages, why });
const tab = (id, subs) => ({ id, label: T[id][0], key: T[id][1], subs, pages: [...new Set(subs.flatMap(s => s.pages.map(r => r.split('/')[0])))] });
const ADVREF = ['docs/project'];

const HELP = () => tab('help', [
  sub('start', 'grp.s.start', ['help/first', 'help/around', 'help/lookup'], 'three views of the help page: first mod (what a mod is, the four steps), around the app (top bar, pages, warning words, file types), look up and help (glossary, limit rows, not showing, report text)'),
  sub('prep', 'grp.s.prep', ['prep'], 'prepared data: make it ahead of time, see what is ready or out of date, remove it (ext/prep; lib/cachestore, modtree, gameview)'),
  sub('docs', 'grp.s.docs', ['docs/arsenal', 'docs/modding', 'docs/engine', 'docs/project'], 'the documents, in parts; Project Notes with Advanced'),
  sub('guides', 'grp.s.guides', ['guides'], 'guides and tools from other modders (tools/gemindex), offline'),
  sub('claude', 'grp.s.claude', ['claude'], 'the Claude skills and MCP tool groups of this toolkit: download each piece, group or all, install into Claude (tools/mcp/pack)'),
  sub('history', 'grp.s.history', ['docs/history'], 'historical sources'),
]);
const TOOLS = () => tab('tools', [
  sub('tools', 'grp.s.tools', ['make', 'pro'], 'make: the Generator, gen --target <game>; pro: overdiff, misdiff, verdiff, conflicts, statsheet read any mod folder (Advanced)'),
  sub('settings', 'grp.s.settings', ['settings'], 'Advanced, Arrange, where the window settings are kept'),
]);

const GAMES = [
  { id: 'mowas2', name: 'MoW:AS2', exe: 'mowas_2.exe', version: '3.262', target: 'mowas2', kind: 'as2', na: {}, open: [], tabs: [
    HELP(),
    tab('mods', [
      sub('mods', 'grp.s.mods', ['mods', 'upgrade', 'files'], 'mod list of <game>/mods; mod.info range 3.262 shows as classic; upgrade --to as64 (the road to as64; the easy card keeps as64); files = the old editor (vfs exe mowas_2), Advanced'),
      sub('check', 'grp.s.check', ['check', 'logs'], 'check --exe mowas2, fix --target mowas2; logtriage reads either build\'s game.log'),
    ]),
    tab('ide', [sub('ide', 'grp.ide', ['ide'], 'Editor: lib/vfs key lookup per game (exe mowas_2)')]),
    tab('models', [sub('models', 'grp.models', ['models', 'art'], 'soedit, armorsim --exe mowas_2 on the shared install; art: textures, sounds, icons into a MoW:AS2 mod (vfs exe mowas_2)')]),
    tab('maps', [
      sub('maps', 'grp.s.maps', ['maps'], 'map-clone --target mowas2, --exe mowas_2'),
      sub('viewer', 'grp.s.viewer', ['mapviz'], 'mapviz --target mowas2: map list, layers and pictures (lib/vfs exe mowas_2)'),
      sub('missions', 'grp.s.missions', ['missions'], 'mission-clone --target mowas2, misdiff --exe mowas_2, milint'),
    ]),
    tab('bots', [
      sub('modes', 'grp.s.modes', ['modes'], 'game modes of the game and the mod; allow bots in a mode; multiplayer start settings (vfs exe mowas_2)'),
      sub('bots', 'grp.s.bots', ['bots', 'doctrine'], 'botrecipe and doctrine --exe mowas_2 on the MoW:AS2 bot files'),
      sub('unitai', 'grp.s.unitai', ['unitai'], 'how AI units behave: brain and sensor values, target and ammo rules (bots parts brain, targets)'),
      sub('mapai', 'grp.s.mapai', ['mapai'], 'orders for bot units written into a map mission file (bots part mission)'),
    ]),
    tab('units', [
      sub('units', 'grp.s.units', ['units/make'], 'gen ops, patch-entity, statsheet read MoW:AS2 data (lib/vfs exe mowas_2)'),
      sub('balance', 'grp.s.balance', ['balance', 'units/tune'], 'balance --exe mowas_2 reads MoW:AS2 data'),
    ]),
    tab('share', [
      sub('test', 'grp.s.test', ['testplan', 'test'], 'testplan: what changed in the mod, the test rows for it (model loads, gun fires, gun does damage, model takes damage, more), run files for edrun and prove, the list for the player; test: edrun mowas_2_ed.exe and prove --exe mowas_2.exe, dry and plan only (no -console, -control, -instance on mowas_2.exe: TST-19)'),
      sub('share', 'grp.s.share', ['share'], 'share: mod.info classic range 3.262, release-check, packer'),
      sub('play', 'grp.s.play', ['play'], 'as2 play --exe <game>/mowas_2.exe, install, uninstall, modswitch test copy'),
    ]),
    TOOLS(),
  ] },
  { id: 'as64', name: 'AS64', exe: 'as64.exe', version: '3.301', target: 'as64', kind: 'as2', na: {}, open: [], tabs: [
    HELP(),
    tab('mods', [
      sub('mods', 'grp.s.mods', ['mods', 'upgrade', 'files'], 'mod list and the new mod card; upgrade --to as64; files = the old editor (vfs as64), Advanced'),
      sub('check', 'grp.s.check', ['check', 'logs'], 'check (all builds, as64 first), fix --target as64; logs: logtriage, wouldload --exe as64'),
    ]),
    tab('ide', [sub('ide', 'grp.ide', ['ide'], 'Editor: lib/vfs as64 key lookup')]),
    tab('models', [sub('models', 'grp.models', ['models', 'art'], 'soedit, armorsim on as64 models; art: textures, sounds, icons into an as64 mod')]),
    tab('maps', [
      sub('maps', 'grp.s.maps', ['maps'], 'map-clone --target as64'),
      sub('viewer', 'grp.s.viewer', ['mapviz'], 'mapviz --target as64: map list, layers and pictures (lib/vfs exe as64)'),
      sub('missions', 'grp.s.missions', ['missions'], 'mission-clone --target as64, misdiff, milint'),
    ]),
    tab('bots', [
      sub('modes', 'grp.s.modes', ['modes'], 'game modes of the game and the mod; allow bots in a mode; multiplayer start settings'),
      sub('bots', 'grp.s.bots', ['bots', 'doctrine'], 'botrecipe and doctrine on the as64 bot files'),
      sub('unitai', 'grp.s.unitai', ['unitai'], 'how AI units behave: brain and sensor values, target and ammo rules (bots parts brain, targets)'),
      sub('mapai', 'grp.s.mapai', ['mapai'], 'orders for bot units written into a map mission file (bots part mission)'),
    ]),
    tab('units', [
      sub('units', 'grp.s.units', ['units/make'], 'gen ops, patch-entity, statsheet read as64 data (lib/vfs exe as64)'),
      sub('balance', 'grp.s.balance', ['balance', 'units/tune'], 'balance reads as64 data'),
    ]),
    tab('share', [
      sub('test', 'grp.s.test', ['testplan', 'test'], 'testplan: what changed in the mod, the test rows for it (model loads, gun fires, gun does damage, model takes damage, more), run files for edrun and prove, the list for the player; test: edrun as64_ed.exe and prove, unit pair picker'),
      sub('share', 'grp.s.share', ['share'], 'share: enhanced range 3.301, release-check, packer, mpsync'),
      sub('play', 'grp.s.play', ['play'], 'as2 play on as64.exe'),
    ]),
    TOOLS(),
  ] },
  // GoH: the same tabs as AS64; na = whole pages that cannot exist here. It is empty (owner 2026-11-15: no page is switched off under GoH):
  // a page that has a part GoH cannot run says so on that part. Test Run is shown: its unit pair picker works (the saved pairs file is the
  // list the player goes through); its editor run card and prove card stay with one line each and no buttons (the GoH editor never starts
  // the mission,; no control pipe for prove,; keys na.test.edrun.goh
  // na.test.prove.goh). The goh page (GoH to AS2 port) is GoH only.
  { id: 'goh', name: 'GoH', exe: 'call_to_arms.exe', version: '', target: 'goh', kind: 'goh',
    na: {}, open: ['goh'], tabs: [
    HELP(),
    tab('mods', [
      sub('mods', 'grp.s.mods', ['mods', 'upgrade', 'files'], 'pick the mod to check or port; the list reads <GoH>/mods; upgrade --to goh (as2togoh, AS2 to GoH); files: GoH mods read only, writes only into a GoH mod folder outside the install (writeguard), Advanced'),
      sub('check', 'grp.s.check', ['check', 'logs'], 'check --exe goh --goh <GoH folder> (lib/vfs exe goh); logs: logtriage on the GoH user dir game.log (GHLOG-07, GHLOG-16)'),
    ]),
    tab('ide', [sub('ide', 'grp.ide', ['ide'], 'Editor: lib/vfs key lookup per game (exe goh; GoH mods read only, writes outside the install)')]),
    tab('models', [sub('models', 'grp.models', ['models', 'art'], 'models: SOEdit and the model editor on GoH models (vfs exe goh, owner 2026-11-15), writes into a mod outside the install, a copy ARSENAL made in <GoH>/mods, or with Advanced straight into a mod there; the Armor sub-tab is na (AS2 damage model); art: textures, sounds, icons into a GoH mod outside the install (vfs exe goh)')]),
    tab('maps', [
      sub('maps', 'grp.s.maps', ['maps'], 'GoH list from lib/vfs exe goh, map-clone --target goh, .pot title'),
      sub('viewer', 'grp.s.viewer', ['mapviz'], 'mapviz --target goh: map list, layers and pictures (lib/vfs exe goh)'),
      sub('missions', 'grp.s.missions', ['missions'], 'misdiff --exe goh (read only); add a mode refused (missions.e.gohadd)'),
    ]),
    tab('bots', [
      sub('modes', 'grp.s.modes', ['modes'], 'game modes of GoH and the mod; bot difficulty and start money (vfs exe goh)'),
      sub('bots', 'grp.s.bots', ['bots', 'doctrine'], 'bots: what bots buy, read from script/multiplayer/units/<army>/<list>.<army>.lua (botrecipe/gohbuys), add a unit to one list in a mod outside the install (botrecipe --exe goh); doctrine: ConquestConfig check (profile conquest); no bot.data.lua (GHMIS-66)'),
      sub('unitai', 'grp.s.unitai', ['unitai'], 'how AI units behave: brain and sensor values, target and ammo rules (bots parts brain, targets)'),
      sub('mapai', 'grp.s.mapai', ['mapai'], 'orders for bot units written into a map mission file (bots part mission)'),
    ]),
    tab('units', [
      sub('units', 'grp.s.units', ['units/make', 'goh'], 'units: statsheet reads GoH cards (lib/vfs exe goh), names from localizations .pot (GHLOC-01); goh: goh2as2 with donorpick, donorfit, portfix; its Translate numbers fold runs goh2as2 --ask-json (GoH unit and numbers to AS2)'),
      sub('balance', 'grp.s.balance', ['balance', 'units/tune'], 'balance reads GoH data; changes go only into a GoH mod outside the install'),
    ]),
    tab('share', [
      sub('test', 'grp.s.test', ['testplan', 'test'], 'testplan: changes, test rows checked without a game, the list for the player (GoH runs no test game: the GoH editor never starts the mission and GoH has no control pipe); test: the pair picker writes a pairs file, the edrun and prove cards say why they do not run'),
      sub('share', 'grp.s.share', ['share'], 'share: GoH mod.info range (exe version, open Max, Tags develop), modinfo --goh, check --exe goh --goh, packer --goh, workshop uploader in binaries/x64, release-check --goh'),
      sub('play', 'grp.s.play', ['play'], 'na: no write into the GoH install and no GoH run (play)'),
    ]),
    TOOLS(),
  ] },
];
module.exports = { GAMES, DEFAULT: 'as64', ADVREF };
