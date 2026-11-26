// uilint, read-once module form (lib/modset, phase 2; how-to: tools/lib/MODSET.md): run(ctx) = the CLI
// with ctx.argv, reading the walked UI files through the pass (ctx.reader()) instead of its own read-ahead and listing the
// folder from the pass's adopted scan instead of its own walk. Same output.
// Author: Imperator_Aug (ARSENAL, ia-03b9249c)
module.exports = { run: ctx => require('./uilint').main(ctx.argv, { ra: ctx.reader() }) };
