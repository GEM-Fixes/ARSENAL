# one scenario per line: expected PATCH codes (info included)
dryrun PATCH_DRY_RUN+PATCH_FULL_COPY
setexisting PATCH_COPIED+PATCH_FULL_COPY+PATCH_WROTE
setmissing PATCH_KEY_MISSING
add PATCH_WROTE
second PATCH_COPIED+PATCH_FULL_COPY+PATCH_WROTE
second2 PATCH_WROTE
breaks PATCH_REFUSED
addfile PATCH_WROTE
setfile_bad -
nofile PATCH_NO_FILE
