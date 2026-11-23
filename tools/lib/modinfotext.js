// modinfotext: mod.info is game text data, so every writer emits CRLF (tools-other:70: a LF-only mod.info reached a test mod).
// crlf(text|Buffer) -> Buffer with every line end CRLF (lone \n and lone \r both become \r\n), bytes otherwise kept (latin1 round trip).
// writeModInfo(file, text|Buffer) writes crlf(...) and makes the folder. isCrlf(Buffer) -> true when no bare \n or \r is present.
// Author: Imperator_Aug (ARSENAL, ia-d6507bca)
const fs = require('fs'), path = require('path');
function crlf(x) {
  const s = Buffer.isBuffer(x) ? x.toString('latin1') : String(x);
  return Buffer.from(s.replace(/\r\n|\r|\n/g, '\r\n'), 'latin1');
}
function isCrlf(b) {
  const s = Buffer.isBuffer(b) ? b.toString('latin1') : String(b);
  return !/\r(?!\n)|(^|[^\r])\n/.test(s);
}
function writeModInfo(file, x) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const b = crlf(x);
  fs.writeFileSync(file, b);
  return b;
}
module.exports = { crlf, isCrlf, writeModInfo };
