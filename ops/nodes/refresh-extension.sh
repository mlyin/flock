#!/usr/bin/env bash
# Copy the current extension build into every node, keeping each node's own
# node.json (its pairing). Run before the nightly restart, which is what
# makes Chromium load the new files: an unpacked extension is read at
# startup, and `docker restart` alone changes nothing on disk.
#
#   refresh-extension.sh            # every node
#   refresh-extension.sh n1a2b3c4   # one
set -euo pipefail
base=${FLOCK_NODES_BASE:-/srv/flock-nodes}
[ -d "$base/extension" ] || { echo "no build at $base/extension" >&2; exit 2; }

for dir in "$base"/n*/; do
  slug=$(basename "$dir")
  [ $# -gt 0 ] && [ "$slug" != "$1" ] && continue
  target="$dir/config/flock-extension"
  [ -d "$target" ] || continue
  keep=$(mktemp)
  [ -f "$target/node.json" ] && cp "$target/node.json" "$keep"
  rsync -a --delete "$base/extension/" "$target/"
  [ -s "$keep" ] && cp "$keep" "$target/node.json"
  rm -f "$keep"
  chown -R 1000:1000 "$target"
  echo "refreshed $slug"
done
