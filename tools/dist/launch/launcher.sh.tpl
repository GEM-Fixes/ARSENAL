#!/bin/sh
@@HEAD@@
AR_GUI=@@GUI@@
AR_V='@@NODE_VERSION@@'
AR_MIN=@@MIN_MAJOR@@
AR_BASE='@@BASE@@'
ar_say() { printf '%s\n' "$*" >&2; }

# the package folder: this file's folder, also when started through a symlink or from another folder
ar_self=$0
while [ -h "$ar_self" ]; do
  ar_dir=$(cd -P -- "$(dirname -- "$ar_self")" && pwd) || break
  ar_link=$(readlink -- "$ar_self") || break
  case $ar_link in /*) ar_self=$ar_link ;; *) ar_self=$ar_dir/$ar_link ;; esac
done
AR_PKG=$(cd -P -- "$(dirname -- "$ar_self")" && pwd) || { ar_say "ARSENAL: cannot find the package folder"; exit 3; }

# commands the single exe refuses or hides are refused here the same way (tools/dist/sea-main.js)
@@GATE@@

ARSENAL_VERSION='@@ARSENAL_VERSION@@'; export ARSENAL_VERSION
if [ -z "${GEM_INDEX_DIR-}" ] && [ -z "${GEMINDEX_DATA-}" ] && [ -d "$AR_PKG/gemindex" ]; then GEM_INDEX_DIR=$AR_PKG/gemindex; export GEM_INDEX_DIR; fi

AR_SYS=@@SYS@@
AR_MACH=@@MACH@@
ar_os=; ar_cpu=; ar_user=
case $AR_SYS in
  Linux) ar_os=linux; if [ -n "${XDG_DATA_HOME-}" ]; then ar_user=$XDG_DATA_HOME/arsenal/node; elif [ -n "${HOME-}" ]; then ar_user=$HOME/.local/share/arsenal/node; fi ;;
  Darwin) ar_os=darwin; if [ -n "${HOME-}" ]; then ar_user="$HOME/Library/Application Support/ARSENAL/node"; fi ;;
esac
case $AR_MACH in
  x86_64|amd64) ar_cpu=x64 ;;
  aarch64|arm64|armv8*) ar_cpu=arm64 ;;
esac
# an x64 shell under Rosetta on an Apple CPU: fetch the arm64 build
if [ "$ar_os-$ar_cpu" = darwin-x64 ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null)" = 1 ]; then ar_cpu=arm64; fi

# a. ARSENAL_NODE
AR_NODE=
if [ -n "${ARSENAL_NODE-}" ]; then
  if [ -f "$ARSENAL_NODE" ] && [ -x "$ARSENAL_NODE" ]; then AR_NODE=$ARSENAL_NODE
  else ar_say "ARSENAL: ARSENAL_NODE is set to \"$ARSENAL_NODE\", which is not an executable file. Point it at a node binary, or clear it."; exit 3; fi
fi
# b. a copy fetched before: in the package, else per user
if [ -z "$AR_NODE" ] && [ -x "$AR_PKG/node/$AR_V/node" ]; then AR_NODE=$AR_PKG/node/$AR_V/node; fi
if [ -z "$AR_NODE" ] && [ -n "$ar_user" ] && [ -x "$ar_user/$AR_V/node" ]; then AR_NODE=$ar_user/$AR_V/node; fi
# c. node on PATH, major version at least AR_MIN
if [ -z "$AR_NODE" ] && command -v node >/dev/null 2>&1; then
  if [ "$(node -e "console.log(parseInt(process.versions.node,10)>=$AR_MIN?'ok':'old')" 2>/dev/null)" = ok ]; then AR_NODE=$(command -v node); fi
fi

# d. fetch the pinned Node.js, check its sha256 before unpacking, move into place last
if [ -z "$AR_NODE" ]; then
  AR_FILE=; AR_SHA=
  case $ar_os-$ar_cpu in
@@POSIX_FILES@@
  esac
  if [ -z "$AR_FILE" ]; then
    ar_say "ARSENAL: no Node.js download is pinned for this system ($AR_SYS $AR_MACH). Install Node.js $AR_V (or $AR_MIN or newer) from https://nodejs.org and start again, or set ARSENAL_NODE to a node binary."; exit 3
  fi
  ar_stem=${AR_FILE%.tar.gz}
  if command -v curl >/dev/null 2>&1; then ar_dl=curl; elif command -v wget >/dev/null 2>&1; then ar_dl=wget
  else ar_say "ARSENAL: neither curl nor wget is installed. Install one, or install Node.js $AR_V (or $AR_MIN or newer) yourself, and start again."; exit 3; fi
  if command -v sha256sum >/dev/null 2>&1; then ar_sum=sha256sum; elif command -v shasum >/dev/null 2>&1; then ar_sum='shasum -a 256'
  else ar_say "ARSENAL: neither sha256sum nor shasum is installed, so the download cannot be checked. Install Node.js $AR_V (or $AR_MIN or newer) yourself and start again."; exit 3; fi
  ar_root=$AR_PKG/node
  ar_stage=$ar_root/.part-$AR_V-$$
  if ! { mkdir -p -- "$ar_root" 2>/dev/null && mkdir -- "$ar_stage" 2>/dev/null; }; then
    rmdir -- "$ar_root" 2>/dev/null
    if [ -z "$ar_user" ]; then ar_say "ARSENAL: cannot write $AR_PKG/node and there is no per-user folder (HOME is not set). Set ARSENAL_NODE to a node binary."; exit 3; fi
    ar_root=$ar_user
    ar_stage=$ar_root/.part-$AR_V-$$
    if ! { mkdir -p -- "$ar_root" 2>/dev/null && mkdir -- "$ar_stage" 2>/dev/null; }; then
      ar_say "ARSENAL: cannot write $AR_PKG/node nor $ar_root. Set ARSENAL_NODE to a node binary."; exit 3
    fi
  fi
  ar_dest=$ar_root/$AR_V
  ar_fail() { rm -rf -- "$ar_stage"; rmdir -- "$ar_root" 2>/dev/null; ar_say "ARSENAL: $*"; exit 3; }
  trap 'rm -rf -- "$ar_stage"; exit 3' HUP INT TERM
  ar_say "ARSENAL: first start: downloading Node.js $AR_V ($AR_FILE) from $AR_BASE into $ar_dest"
  if [ "$ar_dl" = curl ]; then
    curl -fL --proto @@PROTO@@ --proto-redir @@PROTO@@ --retry 2 --progress-bar -o "$ar_stage/$AR_FILE" "$AR_BASE$AR_FILE" || ar_fail "the download of $AR_BASE$AR_FILE failed. Nothing was installed."
  else
    @@WGET@@ -q -O "$ar_stage/$AR_FILE" "$AR_BASE$AR_FILE" || ar_fail "the download of $AR_BASE$AR_FILE failed. Nothing was installed."
  fi
  ar_got=$($ar_sum < "$ar_stage/$AR_FILE" | cut -d ' ' -f 1)
  [ "$ar_got" = "$AR_SHA" ] || ar_fail "checksum mismatch for $AR_FILE: want sha256 $AR_SHA, got $ar_got. The file was deleted, nothing was installed."
  tar -xzf - -C "$ar_stage" "$ar_stem/bin/node" < "$ar_stage/$AR_FILE" || ar_fail "unpacking bin/node from $AR_FILE failed. Nothing was installed."
  mv -- "$ar_stage/$ar_stem/bin/node" "$ar_stage/node" && chmod 755 "$ar_stage/node" || ar_fail "unpacking bin/node from $AR_FILE failed. Nothing was installed."
  rm -rf -- "$ar_stage/$ar_stem" "$ar_stage/$AR_FILE"
  if [ -x "$ar_dest/node" ]; then rm -rf -- "$ar_stage"
  else rm -rf -- "$ar_dest"; mv -- "$ar_stage" "$ar_dest" || ar_fail "cannot move node into $ar_dest. Nothing was installed."; fi
  trap - HUP INT TERM
  AR_NODE=$ar_dest/node
fi

# e. run the tools
if [ "$AR_GUI" = 1 ] && [ $# -eq 0 ]; then set -- gui --open; fi
exec "$AR_NODE" "$AR_PKG/tools/as2/as2.js" "$@"
