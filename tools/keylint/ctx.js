// keylint, read-once module form (lib/modset, phase 2; how-to: tools/lib/MODSET.md): run(ctx) = the CLI
// with ctx.argv, reading the mod's files through the pass (ctx.reader()) and taking its listing instead of its own walk. Same output.
// Author: Imperator_Aug (ARSENAL, ia-3f609c93)
module.exports = { run: ctx => require('./keylint').main(ctx.argv, { ra: ctx.reader(), listing: ctx.listing }) };
