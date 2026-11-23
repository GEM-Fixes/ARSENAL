// claude ext: page "Claude" (Help & Docs, every game tab). The skills and MCP tool groups of this toolkit as pieces, pack groups
// and the full pack: each with its own download (a zip) and Install into Claude (preview, then write; uninstall; what is installed).
// The work is tools/mcp/pack/pack.js (contract: tools/mcp/README.md "Pieces, groups and downloads"). The game tab only presets the
// default game of the servers; nothing here reads a game or a mod.
// Author: Imperator_Aug (ARSENAL, ia-4abd563c)
'use strict';
module.exports = { id: 'claude', nav: 'claude.nav', adv: false, after: 'guides', script: require('./script'), lang: require('./lang'), routes: require('./routes').routes };
