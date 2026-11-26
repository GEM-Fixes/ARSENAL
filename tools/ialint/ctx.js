// ialint, read-once module form (lib/modset, phase 2; how-to: tools/lib/MODSET.md): run(ctx) = the CLI
// with ctx.argv, reading the folder's def files (the place check) through the pass (ctx.reader()) and listing the folder from
// the pass's adopted scan instead of its own. Same output.
// Author: Imperator_Aug (ARSENAL, ia-15939e88)
module.exports = { run: ctx => require('./ialint').main(ctx.argv, { ra: ctx.reader() }) };
