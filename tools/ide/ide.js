#!/usr/bin/env node
// ide: command line of the Editor's language service and the Notepad++ pack (contract: tools/ide/README.md).
//   node tools/ide/ide.js check|hover|def|refs|symbols|words|fixes <file> [--mod DIR] [--game DIR] [--exe as64|mowas_2|mowas2|goh] [--line N] [--col N] [--json] [--pause]
//   node tools/ide/ide.js npp status|plan|install|uninstall [--theme GEM2.xml] [--settings DIR]
//   node tools/ide/ide.js send <file> [line] [col]      (Notepad++ Run menu -> the running GUI)
//   node tools/ide/ide.js vanilla <file>                (open the vanilla original of a mod file in the GUI)
// It reads text and prints findings. It compiles, builds and launches nothing.
// Author: Imperator_Aug (ARSENAL, ia-10bd866e)
const USAGE = 'usage: ide check|hover|def|refs|symbols|words|fixes <file> [--mod DIR] [--game DIR] [--exe as64|mowas_2|mowas2|goh] [--line N] [--col N] [--json] [--pause]\n' +
  '       ide npp status|plan|install|uninstall [--theme GEM2.xml] [--settings DIR]\n' +
  '       ide send <file> [line] [col] | ide vanilla <file>';
async function main(argv) {
  const cmd = argv[0];
  if (!cmd || cmd === '--help' || cmd === '-h') { console.log(USAGE); return cmd ? 0 : 2; }
  if (cmd === 'npp' || cmd === 'send' || cmd === 'vanilla') return require('./npp/cli').run(argv);
  if (['check', 'hover', 'def', 'refs', 'symbols', 'words', 'fixes'].includes(cmd)) return require('./intel/cli').run(argv);
  console.error(USAGE); return 2;
}
if (require.main === module) main(process.argv.slice(2)).then(c => { process.exitCode = c || 0; }, e => { console.error('ide: ' + e.message); process.exitCode = 2; });
module.exports = { main };
