// pro ext: "Expert tools" page (advanced mode): all-tools launcher (read-only, deny-list in policy.js), diffs, stat sheets,
// conflicts view with an ITM-clean copy, and "copy as command" for any contract command.
// Author: Imperator_Aug (ARSENAL, ia-6291798f)
'use strict';
module.exports = { id: 'pro', nav: 'pro.nav', adv: true, script: require('./script'), lang: require('./lang'), routes: require('./routes').routes, prep: require('./routes').prep };
