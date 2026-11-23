// test fixture: tools with a wrong form, and a name another module already has. Each is skipped and named, the good one loads.
'use strict';
const h = async () => ({ text: 'ok' }), s = { type: 'object', properties: {} }, g = ['as64'];
module.exports = { group: 'badform', tools: [
  { name: 'BadName', title: 't', description: 'd', inputSchema: s, games: g, kind: 'read', handler: h },
  { name: 'mow_fx_nokind', title: 't', description: 'd', inputSchema: s, games: g, kind: 'delete', handler: h },
  { name: 'mow_lookup', title: 't', description: 'd', inputSchema: s, games: g, kind: 'read', handler: h },
  { name: 'mow_fx_fine', title: 'Fine', description: 'A good tool beside bad ones.', inputSchema: s, games: g, kind: 'read', handler: h },
] };
