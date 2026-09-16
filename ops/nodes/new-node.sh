#!/usr/bin/env bash
# One browser node: a Chromium container with a persistent profile, the Flock
# extension loaded from a path that never moves, and a web screen (Selkies)
# behind a password. Called by provisioner.py; runnable by hand.
#
#   new-node.sh SLUG [TZ] [PROXY|-] [TOKEN|-] [API_BASE]
#
# The pairing token may also arrive as $FLOCK_NODE_TOKEN (the provisioner
# passes it that way, so it never shows in `ps`); the positional wins if both
# are set. Prints, as its LAST line, one JSON object:
#   {"url","host","port","password"}
# Everything else goes to stderr.
#
# Why Chromium and not Chrome: Google removed --load-extension from
# Chrome-branded builds in 137. Chromium keeps it, and the extension id of an
# unpacked extension is derived from its absolute path — so the copy lives at
# /config/flock-extension inside the container and is never moved (the Mac
# mini runbook §3.3 has the silent failure that follows if it is).
set -euo pipefail
# Everything this script creates holds a live session or a pairing token.
umask 077

slug=${1:?usage: new-node.sh SLUG [TZ] [PROXY|-] [TOKEN|-] [API_BASE]}
tz=${2:-America/Los_Angeles}
proxy=${3:--}
token=${4:--}
[ "$token" = "-" ] && token=${FLOCK_NODE_TOKEN:--}
api_base=${5:-https://www.sellonflock.com}

base=${FLOCK_NODES_BASE:-/srv/flock-nodes}
host=${FLOCK_NODES_HOST:-nodes.sellonflock.com}
image=${FLOCK_NODES_IMAGE:-lscr.io/linuxserver/chromium:latest}
routes=${FLOCK_NODES_ROUTES:-/etc/caddy/routes}

[[ "$slug" =~ ^[a-z0-9]{4,32}$ ]] || { echo "bad slug: $slug" >&2; exit 2; }
[[ "$token" = "-" || "$token" =~ ^[A-Z0-9-]{10,64}$ ]] || { echo "bad token" >&2; exit 2; }
[ -d "$base/extension" ] || {
  echo "no extension build at $base/extension — run 'npm run pack:ext' and rsync dist/extension/ there" >&2
  exit 2
}

# One provision at a time. Port allocation below is read-then-bind, and two
# concurrent provisions would otherwise pick the same port and the loser
# would leave a half-made node behind.
mkdir -p "$base" "$routes"
exec 9>"$base/.provision.lock"
flock 9

[ -e "$base/$slug" ] && { echo "node $slug already exists" >&2; exit 3; }

mkdir -p "$base/$slug/config"
cp -r "$base/extension" "$base/$slug/config/flock-extension"

# Zero-click pairing: background.js adopts this on first start if unpaired.
if [ "$token" != "-" ]; then
  printf '{"apiBase":"%s","token":"%s"}\n' "$api_base" "$token" \
    > "$base/$slug/config/flock-extension/node.json"
fi

# Next port. nodes.txt is the ledger, one line per node ever created, so
# ports are never reused while a retired node's profile is still on disk.
port=$(( 31000 + $( [ -f "$base/nodes.txt" ] && wc -l < "$base/nodes.txt" || echo 0 ) ))
if command -v ss >/dev/null; then
  while ss -ltn "sport = :$port" 2>/dev/null | grep -q LISTEN; do port=$((port + 1)); done
fi

password=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)

flags="--load-extension=/config/flock-extension --profile-directory=Default --no-first-run --no-default-browser-check about:blank"
if [ "$proxy" != "-" ]; then
  # A residential exit for this seller. Flock and Supabase traffic bypasses
  # it so the metered address only carries marketplace traffic. Chromium
  # takes no credentials in --proxy-server: whitelist the host's IP at the
  # provider instead.
  flags="$flags --proxy-server=http://$proxy --proxy-bypass-list=*.sellonflock.com;*.supabase.co;127.0.0.1"
fi

# The container runs as uid 1000 (PUID) and must read the profile; nobody
# else on the host needs to. The docker daemon, as root, bind-mounts fine.
chown -R 1000:1000 "$base/$slug"
chmod 700 "$base/$slug"

# The image should already be present (host-setup.sh pulls it), so this is a
# no-op most days. It is here so a first node on a host that skipped setup
# does not fail at `docker run`, and it runs before any side effect below.
docker image inspect "$image" >/dev/null 2>&1 || docker pull "$image" >&2

# Docker's default seccomp profile stays on. The image's wrapped-chromium
# passes --no-sandbox unconditionally (linuxserver/docker-chromium master,
# root/usr/bin/wrapped-chromium, read 16 Sep 2026), so the syscalls that
# `seccomp=unconfined` would unblock are never asked for, and the profile is
# the layer that keeps a root shell inside the container from reaching the
# kernel surface most container escapes need.
#
# And there is a root shell to keep from it: the Selkies web UI ships a
# terminal with passwordless sudo, so whoever holds the node URL and
# password could otherwise become root on a host running other sellers'
# marketplace sessions. HARDEN_DESKTOP removes sudo, the terminals and the
# files/apps sidebar; HARDEN_OPENBOX keeps Chromium from being closed and
# restarts it if it is (a closed Chromium is a node whose extension is gone);
# SELKIES_ENABLE_SHARING stops the seller minting share links to their own
# screen. All three verified against docker-baseimage-selkies/README.md
# on 16 Sep 2026. The container listens on loopback only.
docker run -d --name "node-$slug" --restart unless-stopped \
  --shm-size=1g --memory 1500m --cpus 1 \
  -e PUID=1000 -e PGID=1000 -e TZ="$tz" \
  -e HARDEN_DESKTOP=true -e HARDEN_OPENBOX=true -e SELKIES_ENABLE_SHARING=false \
  -e SUBFOLDER="/n/$slug/" -e CUSTOM_USER="$slug" -e PASSWORD="$password" \
  -e CHROME_CLI="$flags" \
  -v "$base/$slug/config:/config" \
  -p "127.0.0.1:$port:3000" \
  "$image" >/dev/null

printf 'handle /n/%s/* {\n\treverse_proxy 127.0.0.1:%s\n}\n' "$slug" "$port" > "$routes/$slug.caddy"
chmod 644 "$routes/$slug.caddy"
systemctl reload caddy >&2 || echo "caddy reload failed; run it by hand" >&2

echo "$slug $port $(date -Is)" >> "$base/nodes.txt"
printf '{"url":"https://%s/n/%s/","host":"%s","port":%s,"password":"%s"}\n' \
  "$host" "$slug" "$host" "$port" "$password"
