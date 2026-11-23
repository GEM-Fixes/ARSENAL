// GUI extensions (GUI-EXT). Each entry is one folder under tools/gui/ext/<id>/ with an index.js that exports:
//   { id, nav: 'lang key for the tab', adv: bool (behind the Advanced switch), after: 'page id to sit after' (optional),
//     script: 'browser JS (page.js rules: no backtick, no dollar-brace, DOM via h()/textContent) that sets EXT_SCREENS.<id>=function(root){...return {refresh,focus}}',
//     lang: {en:{key:text}, ru:{}, uk:{}, zh:{}}   merged into the page strings (en is the fallback),
//     commands: {cmdId: contract entry}            merged into contract.COMMANDS (same shape),
//     routes: {'GET /api/x/<id>/...': async fn(url, body, ctx) -> JSON}   ctx = {gamedir, tools, tmpRoot, runTool(tool, entry, args, {timeoutMs}), game(), allowLaunch,
//       gameId(), exe(), kind(), gohDir(), curDir(), session, pathOk, onClose}
//       game() = the AS2 install (?game=, body.game, else gamedir.resolve); gameId() = 'as64'|'mowas2'|'goh', the page's game (?gid=, body.gid,
//       header x-arsenal-game; unknown or none = 'as64'); exe() = its vfs exe ('as64'|'mowas_2'|'goh'); kind() = 'as2'|'goh';
//       gohDir() = the GoH install (?goh=, body.goh, header x-arsenal-goh URI-decoded, else gamedir.goh; null when none);
//       curDir() = the install of the request's game (gohDir() under goh, else game()). A remote device's GoH folder is checked as its game.
//     prep: [{id, title, needs, areas, games, state(ctx, q), run(ctx, q, job)}]   optional: the Prepare sections of the ext (README, CACHE
//       contract 1). Collected below into one list, module.exports.prep (each item with ext = the ext id; ext/prep/collect.js checks the
//       shape, ids unique, needs exist); routes read it as ctx.prepSections. module.exports.prepProblems = what was left out and why.
// The list is literal so the single-exe bundler keeps each module. Order = tab order unless `after` is set.
// Author: Imperator_Aug (ARSENAL, ia-07ba588f)
const EXT = [
  require('./view'),   // no tab (tab:false): window.VIEW, file viewers on every page; first, so later scripts find it
  require('./task'),   // no tab (tab:false): window.TASK, the Quick Guided Task row above the tabs and the task window
  require('./help'),
  require('./prep'),   // Prepare: prepared data made ahead of time (Help & Docs, first sub page); owns the sections game.view and mod.tree
  require('./docs'),
  require('./guides'),
  require('./claude'),   // Claude: skills and MCP tool groups as downloads + install into Claude (tools/mcp/pack), every game tab
  require('./units'),
  require('./balance'),
  require('./models'),
  require('./maps'),
  require('./missions'),
  require('./mapviz'),   // the Map Viewer (tools/mapviz): map list, layers and pictures, all three games
  require('./art'),
  require('./logs'),
  require('./testplan'),   // Test Plan (tools/testplan): changes, test rows, game test files, the list for the player; all three games
  require('./share'),
  require('./goh'),
  require('./modes'),
  require('./bots'),
  require('./unitai'),   // Unit AI: group D, drawn by the bots script
  require('./mapai'),    // Map scripts for AI: group E, drawn by the bots script
  require('./doctrine'),
  require('./files'),
  require('./ide'),
  require('./pro'),
];
const PREP = require('./prep/collect')(EXT);
EXT.prep = PREP.prep;
EXT.prepProblems = PREP.problems;
module.exports = EXT;
