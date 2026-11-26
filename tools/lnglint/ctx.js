// lnglint, read-once module form (lib/modset, phase 2; how-to: tools/lib/MODSET.md): run(ctx) = the CLI
// with ctx.argv, reading the .lng files through the pass (ctx.reader()). Same output.
// Author: Imperator_Aug (ARSENAL, ia-a67335eb)
module.exports = { run: ctx => require('./lnglint').main(ctx.argv, { ra: ctx.reader() }) };
