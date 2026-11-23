# sdllint truth: one expected finding per line (file:line: CODE). bad/ must produce exactly these.
# cascades (engine would also die here): a.def:9 string eats '}' -> BLOCK_UNCLOSED; b.def:1 = define body line, reached via
# call b.def:4 (unreplaced %p) and b.def:6 (value 'a(b' makes body '{v a(b}' -> CONTROL_BAD + BLOCK_UNCLOSED)
a.def:10: TAG_SWALLOWS
a.def:11: WARN_PAREN_STRAY
a.def:12: MOD_NAME
a.def:13: MOD_NESTED
a.def:14: UNREPLACED_PARAM
a.def:1: HASH_COMMENT
a.def:2: IDENT_SPLIT
a.def:3: IDENT_SPLIT
a.def:4: LEADING_DOT
a.def:5: NUMBER_SUFFIX
a.def:6: NUMBER_EXP0
a.def:7: NEG_HEX
a.def:8: WARN_INT_RANGE
a.def:9: BLOCK_UNCLOSED
a.def:9: STR_NEWLINE
b.def:10: MACRO_CYCLE
b.def:12: CONTROL_BAD
b.def:1: BLOCK_UNCLOSED
b.def:1: CONTROL_BAD
b.def:1: UNREPLACED_PARAM
b.def:3: PARAM_SPACE
b.def:4: ARGS_CASE
b.def:5: MACRO_UNDEFINED
b.def:6: WARN_PARAM_UNBALANCED
b.def:6: WARN_PAREN_STRAY
b.def:8: INCLUDE_MISSING
b.def:9: INCLUDE_CYCLE
c.def:3: DEFINE_UNCLOSED
d.def:1: BLOCK_UNCLOSED
e.def:1: BLOCK_END_STRAY
e.def:2: MACRO_UNDEFINED
f.def:1: BOM_UTF16
g.def:2: BAD_BYTE
h.def:1: WARN_STR_NOT_UTF8
