// test fixture module (loaded only through ARSENAL_MCP_EXTRA_TOOLS): one tool per server rule.
'use strict';
const fs = require('fs'), path = require('path');
const ALL = ['as64', 'mowas2', 'goh'];
const tool = (name, kind, handler, extra) => Object.assign({ name, title: 'Fixture ' + name, description: 'Test fixture.', kind, games: ALL,
  inputSchema: { type: 'object', properties: { path: { type: 'string' }, n: { type: 'integer' }, text: { type: 'string' }, free: { type: 'string', dash: true }, list: { type: 'array' } } }, handler }, extra || {});
module.exports = { group: 'fx', tools: [
  tool('mow_fx_write', 'write', async (a, ctx) => {
    if (!ctx.guard.writing) return { text: 'preview: would write ' + a.path + (ctx.guard.canWrite(a.path) ? '' : '') , data: { preview: true, blocked: ctx.guard.canWrite(a.path) } };
    const p = ctx.guard.write(a.path);
    fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, 'x');
    return { text: 'wrote ' + p };
  }, { inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } }),
  tool('mow_fx_sneak', 'read', async (a, ctx) => { const p = ctx.guard.write(a.path); fs.writeFileSync(p, 'x'); return { text: 'wrote ' + p }; }),
  tool('mow_fx_launch', 'launch', async (a, ctx) => { ctx.guard.launch(); return { text: 'launched (not really)' }; }),
  tool('mow_fx_dry', 'launch', async (a, ctx) => { if (a.dry === true) return { text: 'would launch' }; ctx.guard.launch(); return { text: 'launched (not really)' }; }, { inputSchema: { type: 'object', properties: { dry: { type: 'boolean' } } } }),
  tool('mow_fx_big', 'read', async a => ({ text: 'y'.repeat(a.n || 100000), data: { big: 'z'.repeat(200000) } })),
  tool('mow_fx_throw', 'read', async () => { throw new Error('boom'); }),
  tool('mow_fx_goh', 'read', async () => ({ text: 'goh only' }), { games: ['goh'] }),
  tool('mow_fx_na', 'read', async () => ({ na: 'this game keeps no such file' })),
  tool('mow_fx_game', 'read', async (a, ctx) => { const g = ctx.game(a); return { text: g.id + ' ' + g.exe + ' ' + g.kind + ' ' + (g.source || 'none'), data: { dir: g.dir, facts: g.profile ? Object.keys(g.profile.facts).length : 0 } }; }),
  tool('mow_fx_run', 'read', async (a, ctx) => {
    if (a.text === 'badargv') return ctx.run('q', [1, 2]).then(() => ({ text: 'ran' }));
    if (a.text === 'notool') return ctx.run('no-such-tool-zz', []).then(() => ({ text: 'ran' }));
    if (a.text === 'name') { ctx.name(a.free, 'free'); return { text: 'ok' }; }
    const r = await ctx.run('q', ['-l', 'VFS-01']);
    return { text: r.text, data: { code: r.code } };
  }),
] };
