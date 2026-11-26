// vfs, read-once module form (lib/modset, phase 2; how-to: tools/lib/MODSET.md): run(ctx) = the CLI
// ctx.argv; the pass's scan of the mod folder is taken as that mod's listing and the loose files VFS-35 searches (only when a
// listed mod deletes a file) are read through the pass (ctx.reader()). Same output.
// Author: Imperator_Aug (ARSENAL, ia-4a356d1a)
module.exports = { run: ctx => require('./vfs').main(ctx.argv, { ra: ctx.reader() }) };
