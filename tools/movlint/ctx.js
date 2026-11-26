// movlint, read-once module form (lib/modset, phase 2; how-to: tools/lib/MODSET.md): run(ctx) = the CLI
// with ctx.argv, reading the mod's files through the pass (ctx.reader()) and listing the folder from the pass's scan
// (strlint/fastread prepare) instead of its own read-ahead and listing. Same output.
// Author: Imperator_Aug (ARSENAL, ia-7cfdb838)
module.exports = { run: ctx => require('./movlint').main(ctx.argv, { ra: ctx.reader() }) };
