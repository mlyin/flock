# Running Flock on your own box

Vercel stays the default. This is for when you want the app on hardware you
control — a rented VPS, or the Mac mini in the cupboard.

**Roughly 40 minutes**, most of it waiting for DNS. You need a domain you can
edit DNS for, and the Supabase project keys you already have.

> This hosts **the app**. It does not move the browser automation off the
> seller's machine — that is a different problem with a different risk profile,
> and it lives in [CLOUD-BROWSER.md](CLOUD-BROWSER.md).

---

## 1. Pick a box

The app is a single Next.js standalone server. Supabase is managed and
external, so the box holds no database and needs no disk to speak of. `sharp`
compiles images, which is the only thing here that wants real CPU.

| | Enough | Comfortable |
|---|---|---|
| RAM | 1 GB | 2 GB |
| vCPU | 1 | 2 |
| Disk | 20 GB | 40 GB |

Any of Hetzner, DigitalOcean, Vultr or Linode will do. Pick a region near your
sellers, not near you — the box talks to Supabase on every request, so put it
in the same region as your Supabase project if you can.

Ubuntu 24.04 LTS. Add your SSH public key during creation so password login is
never enabled at all.

---

## 2. First boot

```bash
ssh root@YOUR_IP
```

```bash
adduser --disabled-password --gecos "" flock
usermod -aG sudo flock
rsync --archive --chown=flock:flock ~/.ssh /home/flock
```

Lock down SSH — password auth off, no direct root:

```bash
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
```

Firewall — only SSH and web:

```bash
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

Security patches without you:

```bash
apt update && apt install -y unattended-upgrades && dpkg-reconfigure -f noninteractive unattended-upgrades
```

Docker:

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker flock
```

**Open a second terminal and confirm `ssh flock@YOUR_IP` works before closing
this one.** Locking yourself out of a fresh box is a rite of passage worth
skipping.

---

## 3. Point the domain at it

An `A` record for your domain to the box's IPv4, and `AAAA` to its IPv6 if it
has one. Do this **now**: Caddy gets its certificate by having Let's Encrypt
connect back on port 80, so DNS has to have propagated before the container
starts. Check with `dig +short yourdomain.com`.

---

## 4. Put the app on it

As `flock`:

```bash
sudo mkdir -p /opt/flock && sudo chown flock:flock /opt/flock && cd /opt/flock
```

Copy `docker-compose.yml` and `Caddyfile` from this repo into that directory.

Then `.env` — the same names as `.env.example`, plus two for Caddy:

```bash
DOMAIN=flock.yourdomain.com
TLS_EMAIL=you@example.com
```

```bash
chmod 600 .env
```

GHCR images are private by default, so log in once:

```bash
echo YOUR_GITHUB_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

The token needs `read:packages` and nothing else.

```bash
docker compose up -d
docker compose logs -f
```

Caddy will fetch a certificate on first request. Watch for `certificate
obtained successfully`.

---

## 5. Hand the deploy to CI

`.github/workflows/deploy-vps.yml` already builds on every push to main and
then sits dormant. To wake it:

**Repository variable:** `VPS_ENABLED` = `true`

**Secrets:**

| Secret | What |
|---|---|
| `VPS_HOST` | the IP or hostname |
| `VPS_USER` | `flock` |
| `VPS_SSH_KEY` | a private key whose public half is in `/home/flock/.ssh/authorized_keys` |
| `SUPABASE_DB_URL` | session-pooler string — the migration step needs it |
| `NEXT_PUBLIC_SUPABASE_URL` | build arg |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | build arg |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | build arg |

Generate a deploy-only key rather than reusing your own:

```bash
ssh-keygen -t ed25519 -C flock-deploy -f ~/.ssh/flock_deploy -N ""
```

The pipeline is **image → migrate → deploy**, in that order and for a reason:
a deploy that ships a migration without applying it runs new code against an
old schema, and that surfaces as a missing column deep inside a request rather
than as a failed deploy. The deploy step then waits for the container's own
healthcheck instead of trusting that `up -d` means "serving".

---

## 6. Cutting over from Vercel

Run both. Point a subdomain (`box.yourdomain.com`) at the VPS first and use it
for a few days — same database, so it is the same app with the same data, and
nothing is at stake in switching back.

When you move the apex over, remember what is pinned to the origin:

- **Supabase Auth** — add the new domain under Authentication → URL
  Configuration → Redirect URLs, or Google sign-in returns to the old one.
- **`NEXT_PUBLIC_SITE_URL`** in `.env` — Stripe redirects and OAuth callbacks
  read it.
- **The extension** — `manifest.json` `host_permissions` lists origins
  explicitly. A new domain means a new version and a reload for every install.
- **Stripe webhook** endpoint URL.

Rolling back is a DNS change. Keep the Vercel project alive until you have gone
a week without touching it.

---

## What this does not give you

Vercel does a few things this setup does not, and it is worth knowing which of
them you actually use:

- **A CDN.** One box in one region serves everyone. For a dashboard behind a
  login this matters less than it sounds, and Caddy caches the immutable
  `/_next/static` assets hard.
- **Zero-downtime deploys.** `docker compose up -d` restarts the container;
  there are a few seconds of connection refused. Add a second replica and
  Caddy will round-robin if that ever matters.
- **Automatic image optimisation.** `next/image` still works — `sharp` is in
  the image — it just runs on your CPU.
- **Someone else being paged.** This is the real trade. You now own uptime.

---

## Backups

The box holds almost nothing: `.env`, and Caddy's certificates. Both are
recoverable — the certificates re-issue on their own and `.env` you can
rewrite. **Supabase holds everything that matters**, so the backup that counts
is the one you take there (Database → Backups), plus a periodic
`GET /api/export` which produces a fee-adjusted CSV of every garment, listing
and sale.
