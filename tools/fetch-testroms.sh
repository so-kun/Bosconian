#!/bin/sh
# Fetch the zexdoc/zexall Z80 instruction exercisers (Frank D. Cringle,
# GPL — fetched at test time, not committed to this repository).
# Source: anotherlin/z80emu testfiles (well-known mirror of the CP/M binaries).
set -eu
dir="$(dirname "$0")/../tests/fixtures"
mkdir -p "$dir"
base="https://raw.githubusercontent.com/anotherlin/z80emu/master/testfiles"
for f in zexdoc.com zexall.com; do
  if [ ! -f "$dir/$f" ]; then
    echo "fetching $f ..."
    curl -fsSL -o "$dir/$f" "$base/$f"
  fi
done
sha256sum "$dir"/zexdoc.com "$dir"/zexall.com
