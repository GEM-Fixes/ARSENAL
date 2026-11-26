// expcheck, read-once module form (lib/modset, phase 2; how-to: tools/lib/MODSET.md): run(ctx) = the CLI
// with ctx.argv, reading the loose .mdl and .vol through the pass (ctx.reader()) and the .ply/.anm header pages as range reads
// of it (32 KB pages, when the pass has them; else read here as in the CLI). Same output.
// Author: Imperator_Aug (ARSENAL, ia-d73e97b2)
module.exports = { run: ctx => require('./expcheck').main(ctx.argv, { ra: ctx.reader() }) };
