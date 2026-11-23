// TEST ONLY: zip.js --small with launcher test settings (a loopback pin base is allowed; the sh launchers believe they run on <sys> <mach>).
// zip.js's own command line never passes these settings (main's second argument), so a release build cannot get them.
// usage: node tools/dist/test/smallbuild.js <sys> <mach> <zip.js arguments...>
// Author: Imperator_Aug (ARSENAL, ia-83a15282)
const [sys, mach, ...rest] = process.argv.slice(2);
require('../zip.js').main(['--small', ...rest], { sys, mach });
