#!/usr/bin/env node
// prepare step of vfs-39.json: <mod>/resource.pak with forced zip64 records (EOCD64, locator, extra fields). Writes that one file.
// Author: Imperator_Aug (ARSENAL, ia-763c58db)
const fs = require('fs'), path = require('path');
const zipwrite = require('../../../lib/zipwrite');
const out = process.argv[2];
if (!out) { console.error('usage: mk-vfs39.js <mod folder>'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'resource.pak'), zipwrite.zip([['at/vfs39.cfg', Buffer.from('trs_vfs39_marker\r\n')]], { zip64: true }));
