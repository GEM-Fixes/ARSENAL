# tool CODE (one per seeded defect; run.sh diffs against build --json of fixture/bad; packer row from --stages pack)
modinfo UNKNOWN_KEY
sdllint BLOCK_UNCLOSED
keylint WARN_UNKNOWN_KEY
refcheck REF_MODEL_MISSING
lnglint DUP_KEY
loccover LOC_DAMAGE_KEY
milint MAP_PLAYERS
packer WARN_TEXT_NOT_CRLF
# workspace (run.sh): BUILD_REQUIRE_MISSING wc/mod.info (require "nope"); BUILD_REQUIRE_CYCLE wd<->we
binhdr PLY_MTL_MISSING
