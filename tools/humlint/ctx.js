// humlint, read-once module form (lib/modset, phase 2; how-to: tools/lib/MODSET.md): run(ctx) = the CLI
// with ctx.argv, reading the mod's files through the pass (ctx.reader()) instead of its own read-ahead. Same output.
// Author: Imperator_Aug (ARSENAL, ia-bf51609c)
module.exports = { run: ctx => require('./humlint').main(ctx.argv, { ra: ctx.reader() }) };
