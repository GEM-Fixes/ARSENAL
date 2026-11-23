// docs ext (GUI-DOCS): read and search the documentation inside the GUI. By default the start page and the books (modding guide,
// engine document); the maintainers' notes (root pages, modweb, limits, internal notes when present, refmods, tool index, plan) only with Advanced on.
// Read-only. The documents are read at run time from the source tree or from a docs folder next to the exe; they are not inside the exe.
// Author: Imperator_Aug (ARSENAL, ia-a01c32f3)
module.exports = { id: 'docs', nav: 'docs.nav', adv: false, after: 'help', script: require('./script'), lang: require('./lang'), routes: require('./routes').routes };
