# lng-add test truth (test.js builds test/work fresh; one case per line)
1 add leaf to CRLF+BOM file, own-line close: only inserted bytes, 0 findings
2 new nested chain {new{deep{key}}} appended before top close
3 duplicate key (case-insens) refused: LNG_KEY_EXISTS, file unchanged
4 --force replaces text in place
5 escapes: quote, \n, backslash written as one escaped line, lint clean
6 LF file with inline close braces: inserted inline, LF kept
7 key lacking file title prefix (non-# file): LNG_KEY_PREFIX
8 missing file created with {tags}
9 text `a < b`: LNG_LINT_TAG_STRAY (new lnglint finding only)
10 key naming a block: LNG_KEY_IS_BLOCK
11 cp1251 file: LNG_ENC, not touched
12 key defined in another vanilla file: WARN_LNG_KEY_SHADOWS_VANILLA
13 new file at vanilla path desc.lng: LNG_FILE_REPLACES_VANILLA
14 key in own replaced vanilla file: no shadow
