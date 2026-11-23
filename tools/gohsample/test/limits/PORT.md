# PORT test fixture (synthetic rows, gohsample test only)
PORT-22 | arithmetic `(expr)` in locomotion keys | no AS2 eval | evaluate to literal | [I] fixture | chk goh2as2 WARN_PORT_ARITH_EVAL WARN_PORT_ARITH_FAIL
PORT-31 | GoH-only file kinds | no AS2 loader | omit | [I] fixture | chk goh2as2 WARN_PORT_SKIP_KIND
PORT-33 | GoH-only set kinds | no AS2 kind | skip | [I] fixture | chk goh2as2 WARN_PORT_SKIP_SET_KIND
