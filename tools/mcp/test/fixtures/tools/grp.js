// test fixture: tool groups. A tool's own `group` wins over the module's; a group that is not one short lower-case word is refused.
'use strict';
const h = async () => ({ text: 'ok' }), s = { type: 'object', properties: {} }, g = ['as64', 'mowas2', 'goh'];
const tool = (name, extra) => Object.assign({ name, title: 'Fixture ' + name, description: 'Test fixture.', inputSchema: s, games: g, kind: 'read', handler: h }, extra);
module.exports = { group: 'fxa', tools: [
  tool('mow_fxg_plain'),
  tool('mow_fxg_own', { group: 'fxb' }),
  tool('mow_fxg_badgroup', { group: 'Two Words' }),
] };
