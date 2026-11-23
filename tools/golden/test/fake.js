// fake tool for the golden test: prints report-contract lines; argv[2] = number of A_ONE findings; argv[3] (optional) = the vfs exe
// golden handed over (${EXE}): one more finding EXE_<exe>, so the test sees which game the run was for
// Author: Imperator_Aug (ARSENAL, ia-2c287e49)
const n = +process.argv[2];
for (let i = 0; i < n; i++) console.log(`resource/x${i}.def:${i + 1}: A_ONE msg`);
console.log('info: resource/y.def: B_INFO not counted');
console.log('resource/z.set: WARN_TWO msg');
if (process.argv[3]) console.log(`resource/exe.def: EXE_${process.argv[3].toUpperCase()} msg`);
console.log(`${n + 1} findings`);
