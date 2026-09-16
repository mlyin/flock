#!/usr/bin/env bash
# Turn a fresh Ubuntu 24.04 box into a Flock node host. Run once, as root,
# after the first-boot hardening in docs/VPS.md §2 (user, SSH keys, ufw,
# unattended-upgrades, docker). Idempotent enough to re-run.
#
#   FLOCK_NODES_HOST=nodes.sellonflock.com bash ops/nodes/host-setup.sh
#
# What it leaves behind:
#   /srv/flock-nodes/            new-node.sh, provisioner.py, one dir per node, nodes.txt
#   /etc/caddy/Caddyfile         the site; /etc/caddy/routes/*.caddy one per node
#   /etc/flock-nodes.env         NODE_PROVISION_SECRET (printed once at the end)
#   flock-provisioner.service    python3 provisioner.py on 127.0.0.1:9000
#   /etc/cron.d/flock-nodes      04:00 restart every node; 04:20 back up each profile
set -euo pipefail

base=${FLOCK_NODES_BASE:-/srv/flock-nodes}
host=${FLOCK_NODES_HOST:-nodes.sellonflock.com}
here=$(cd "$(dirname "$0")" && pwd)

[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
command -v docker >/dev/null || { echo "install docker first: curl -fsSL https://get.docker.com | sh" >&2; exit 1; }

# Caddy from its own repository; the distro package lags.
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl python3
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  > /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy

mkdir -p "$base" /etc/caddy/routes /srv/backups
# import with an empty glob is fine on current Caddy; the placeholder makes it
# fine on any Caddy.
[ -f /etc/caddy/routes/00-placeholder.caddy ] \
  || printf '# one file per node lands here; new-node.sh writes them\n' > /etc/caddy/routes/00-placeholder.caddy
sed "s/nodes\.sellonflock\.com/$host/" "$here/Caddyfile" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl enable --now caddy
systemctl reload caddy

install -m 0755 "$here/new-node.sh" "$base/new-node.sh"
install -m 0755 "$here/refresh-extension.sh" "$base/refresh-extension.sh"
install -m 0755 "$here/provisioner.py" "$base/provisioner.py"
chmod 750 "$base"

# Pull the image now, outside any provision: a first `docker run` that has to
# fetch a few hundred megabytes is what turns a two-minute provision timeout
# in the app into an orphaned container.
docker pull "${FLOCK_NODES_IMAGE:-lscr.io/linuxserver/chromium:latest}"

if [ ! -f /etc/flock-nodes.env ]; then
  printf 'NODE_PROVISION_SECRET=%s\nFLOCK_NODES_HOST=%s\nFLOCK_NODES_BASE=%s\n' \
    "$(openssl rand -base64 32 | tr -d '/+=')" "$host" "$base" > /etc/flock-nodes.env
  chmod 600 /etc/flock-nodes.env
fi

cat > /etc/systemd/system/flock-provisioner.service <<UNIT
[Unit]
Description=Flock node provisioner
After=network-online.target docker.service caddy.service
Wants=network-online.target

[Service]
EnvironmentFile=/etc/flock-nodes.env
ExecStart=/usr/bin/python3 $base/provisioner.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now flock-provisioner
systemctl restart flock-provisioner

# Nightly, host time. 03:55 copies the current extension build into every
# node; 04:00 restarts them, which is what makes Chromium load it and re-arms
# the extension's alarms from outside (nothing inside a service worker can
# bring a lost alarm back). A restart does NOT update the container image;
# that is a `docker rm` and a fresh `docker run`, done by hand when you mean
# it. The backup is the only copy of ten live marketplace sessions; keep
# three, and copy one off-host.
cat > /etc/cron.d/flock-nodes <<CRON
55 3 * * * root FLOCK_NODES_BASE=$base $base/refresh-extension.sh >/dev/null 2>&1
0 4 * * * root docker ps --filter name=node- --format '{{.Names}}' | xargs -r -n1 docker restart >/dev/null 2>&1
20 4 * * * root for d in $base/n*/; do s=\$(basename "\$d"); tar czf "/srv/backups/\$s-\$(date +\\%F).tgz" -C "\$d" config 2>/dev/null; ls -1t /srv/backups/\$s-*.tgz 2>/dev/null | tail -n +4 | xargs -r rm; done
CRON

cat <<DONE

Node host ready at https://$host

Put these in Vercel (Settings → Environment Variables) and in .env.local:
  NODE_PROVISION_URL=https://$host
  NODE_PROVISION_SECRET=$(grep NODE_PROVISION_SECRET /etc/flock-nodes.env | cut -d= -f2)

Then copy the extension build to $base/extension (rsync with a trailing slash:
scp -r nests a second copy inside the first on the next deploy):
  npm run pack:ext && rsync -a --delete dist/extension/ root@$host:$base/extension/
Existing nodes pick a new build up at the 04:00 restart, or now with:
  $base/refresh-extension.sh && docker ps --filter name=node- -q | xargs -r docker restart

First node, by hand, to prove the host:
  $base/new-node.sh test1 America/Los_Angeles - - https://www.sellonflock.com
DONE
