# Node host

The machine that runs a browser per seller. Design and rules are in
`docs/NODES.md`; this folder is what goes on the box.

| File | What |
|---|---|
| `host-setup.sh` | one-shot: Caddy, the provisioner service, cron, the secret, the image pull |
| `Caddyfile` | the host site: `/provision`, `/nodes/*`, one route file per node |
| `provisioner.py` | 127.0.0.1:9000, bearer-gated, shells out to `new-node.sh` and docker |
| `new-node.sh` | one container: Chromium + persistent profile + extension + Selkies web screen |
| `refresh-extension.sh` | copies a new extension build into every node, keeping each node's pairing |

## Order

1. A VPS with a US IP for US sellers (DigitalOcean SFO3, 4 vCPU / 8 GB carries
   five or six nodes). Harden it per `docs/VPS.md` §2 and install Docker.
2. DNS: an `A` record `nodes` → the box, **DNS only** (grey cloud).
3. `FLOCK_NODES_HOST=nodes.sellonflock.com bash ops/nodes/host-setup.sh`
4. `npm run pack:ext && rsync -a --delete dist/extension/ root@nodes.sellonflock.com:/srv/flock-nodes/extension/`
   (rsync with the trailing slashes; `scp -r` nests a second copy on the next deploy)
5. Put `NODE_PROVISION_URL` and `NODE_PROVISION_SECRET` (printed by step 3)
   in Vercel and `.env.local`. `CHANNEL_TOKEN_KEY` must already be set.
6. Create your own node from Settings → Your Flock browser. Open it, sign in
   to each marketplace, close every tab. Send one Depop draft to it from the
   inventory page and watch the dashboard.

## What a node is

`lscr.io/linuxserver/chromium` with `/config` on the host disk, so the
profile — and every marketplace session in it — survives restarts. The
extension is copied to `/config/flock-extension` and loaded with
`--load-extension`; Chromium keeps that flag, Chrome-branded builds dropped
it in 137. `node.json` next to the manifest carries the pairing token, so the
extension pairs itself on first start.

Each node is `127.0.0.1:<port>` on the host and `/n/<slug>/` on the site,
behind Selkies' own login (user = slug, password = what the script printed).

## Failure modes, and what they look like

| Symptom | Cause | Fix |
|---|---|---|
| Settings says "Couldn't create your browser: the node host answered 401" | secret mismatch | same value in `/etc/flock-nodes.env` and Vercel; `systemctl restart flock-provisioner` |
| "new-node.sh printed no JSON" | script failed early | `journalctl -u flock-provisioner`, then run the script by hand with the same args |
| Node card says silent | container stopped, token revoked, or Flock unreachable from the box | `docker ps`, `docker logs node-<slug>`, then the extension's service-worker console in the node |
| Every fill fails with "didn't render its sell form" | the marketplace session expired | open the node, sign in again by hand |
| Depop tabs pile up | jobs published but tab close failed, or nightly restart missed | `docker restart node-<slug>` |

## Retiring a node

`curl -X DELETE -H "Authorization: Bearer $SECRET" https://nodes.sellonflock.com/nodes/<slug>`
removes the container and the route; the profile stays under
`/srv/flock-nodes/<slug>` until you delete it. Set the row's status to
`retired` in Flock.
