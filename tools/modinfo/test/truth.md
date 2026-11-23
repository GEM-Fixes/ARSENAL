One defect per line (each = one counted finding; ok/ has none; WARN_NAME_FOLDER is info only, uncounted).
syn_unbalanced: SYNTAX unbalanced braces
syn_string: SYNTAX unclosed string
syn_noroot: SYNTAX no root Mod
unk_key: UNKNOWN_KEY Desk (did you mean Desc)
dup_key: DUP_KEY
ver_missing: VER_MISSING
ver_range: VER_RANGE game < Min
ver_old: VER_RANGE max too old
ver_order: VER_ORDER + 2x VER_RANGE (order violation implies range reject) = 3 findings
req_missing: REQ_MISSING nothere
delete_prefix: DELETE_PREFIX set/x
bad_fileid: BAD_FILEID
enc_bom: ENC_BOM
not_mod: WARN_NOT_MOD
parse_quote: MODINFO_PARSE stray token (real case, ENG-24)
parse_bare: MODINFO_PARSE unquoted value
modern_ok: none (Require as64+ builtin, Min 3.301 modern, escaped quotes valid; info only)
