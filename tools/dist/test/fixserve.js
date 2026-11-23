// Fixture download server for the small package launcher tests: 127.0.0.1 only, port picked by the OS, serves the files of one folder
// by base name (GET /<name>), 404 for anything else, appends every request path to a log file. Prints "port <n>" when listening.
// usage: node tools/dist/test/fixserve.js <folder> <log file>
// Author: Imperator_Aug (ARSENAL, ia-278fb4e7)
const fs = require('fs'), path = require('path'), http = require('http');
const [dir, log] = process.argv.slice(2);
if (!dir || !log) { console.error('usage: node fixserve.js <folder> <log file>'); process.exit(2); }
const srv = http.createServer((req, res) => {
  fs.appendFileSync(log, req.url + '\n');
  const name = decodeURIComponent(req.url.replace(/^\//, '').split('?')[0]);
  const f = path.join(dir, name);
  if (!/^[\w.-]+$/.test(name) || !fs.existsSync(f)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': fs.statSync(f).size });
  fs.createReadStream(f).pipe(res);
});
srv.listen(0, '127.0.0.1', () => console.log('port ' + srv.address().port));
