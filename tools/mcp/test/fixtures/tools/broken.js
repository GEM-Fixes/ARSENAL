// test fixture: a module that fails to load. The server must name it in mow_tools and go on.
'use strict';
throw new Error('fixture module broken on purpose');
