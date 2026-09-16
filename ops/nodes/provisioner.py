#!/usr/bin/env python3
"""
Flock node provisioner.

Standard library only. Listens on 127.0.0.1:9000 behind Caddy, which exposes
/provision and /nodes/* on the host site. One shared secret, checked with a
constant-time compare, gates every call. It shells out to new-node.sh and
docker; nothing here knows about sellers, only slugs.

  POST   /provision              {slug, tz, proxy, token, apiBase}
                                 -> {url, host, port, password}
  POST   /nodes/<slug>/restart   docker restart
  DELETE /nodes/<slug>           docker rm -f; the profile stays on disk

Runs under systemd (host-setup.sh installs the unit) with
NODE_PROVISION_SECRET, FLOCK_NODES_HOST and FLOCK_NODES_BASE in
/etc/flock-nodes.env. The same secret is NODE_PROVISION_SECRET in Flock's
environment; app/node-actions.ts is the only caller.
"""

import hmac
import json
import os
import re
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = os.environ.get("FLOCK_NODES_BASE", "/srv/flock-nodes")
ROUTES = os.environ.get("FLOCK_NODES_ROUTES", "/etc/caddy/routes")
SECRET = os.environ.get("NODE_PROVISION_SECRET", "")
NEW_NODE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "new-node.sh")

SLUG = re.compile(r"^[a-z0-9]{4,32}$")
TZ = re.compile(r"^[A-Za-z_]+(/[A-Za-z0-9_+\-]+){0,2}$")
PROXY = re.compile(r"^[A-Za-z0-9.\-]+:\d{2,5}$")
# Pairing tokens are uppercase alphanumerics in dashed groups (lib/exttoken.ts).
TOKEN = re.compile(r"^[A-Z0-9-]{10,64}$")

if not SECRET:
    sys.exit("NODE_PROVISION_SECRET is not set (see /etc/flock-nodes.env)")


class Handler(BaseHTTPRequestHandler):
    server_version = "flock-provisioner/1"

    # -- plumbing -----------------------------------------------------------

    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _authed(self):
        # Bytes, not str: compare_digest on str raises for non-ASCII input,
        # and an unauthenticated caller must get a 401, not a crashed handler.
        got = self.headers.get("Authorization", "").encode("utf-8", "surrogateescape")
        return hmac.compare_digest(got, f"Bearer {SECRET}".encode())

    def _body(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return None
        if n <= 0:
            return {}
        if n > 65536:
            return None
        try:
            parsed = json.loads(self.rfile.read(n) or b"{}")
        except json.JSONDecodeError:
            return None
        return parsed if isinstance(parsed, dict) else None

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

    # -- routes -------------------------------------------------------------

    def do_POST(self):
        if not self._authed():
            return self._send(401, {"error": "unauthorized"})
        if self.path == "/provision":
            return self._provision()
        match = re.match(r"^/nodes/([a-z0-9]{4,32})/restart$", self.path)
        if match:
            return self._docker(["restart", f"node-{match.group(1)}"])
        self._send(404, {"error": "no such route"})

    def do_DELETE(self):
        if not self._authed():
            return self._send(401, {"error": "unauthorized"})
        match = re.match(r"^/nodes/([a-z0-9]{4,32})$", self.path)
        if not match:
            return self._send(404, {"error": "no such route"})
        slug = match.group(1)
        self._docker(["rm", "-f", f"node-{slug}"], then=lambda: self._retire_route(slug))

    # -- work ---------------------------------------------------------------

    def _retire_route(self, slug):
        try:
            os.remove(os.path.join(ROUTES, f"{slug}.caddy"))
        except FileNotFoundError:
            pass
        subprocess.run(["systemctl", "reload", "caddy"], check=False)

    def _docker(self, args, then=None):
        try:
            result = subprocess.run(["docker", *args], capture_output=True, text=True, timeout=120)
        except subprocess.TimeoutExpired:
            return self._send(504, {"error": "docker timed out"})
        if result.returncode != 0:
            return self._send(500, {"error": result.stderr.strip()[-500:]})
        if then:
            then()
        self._send(200, {"ok": True})

    def _provision(self):
        body = self._body()
        if body is None:
            return self._send(400, {"error": "bad json"})

        slug = str(body.get("slug", ""))
        tz = str(body.get("tz") or "America/Los_Angeles")
        proxy = str(body.get("proxy") or "-")
        token = str(body.get("token") or "-")
        api_base = str(body.get("apiBase") or "https://www.sellonflock.com")

        # Every argument reaches a shell script. Validate the shape here so
        # the script only ever sees what it was written for.
        if not SLUG.match(slug):
            return self._send(400, {"error": "bad slug"})
        if not TZ.match(tz):
            return self._send(400, {"error": "bad tz"})
        if proxy != "-" and not PROXY.match(proxy):
            return self._send(400, {"error": "bad proxy"})
        if token != "-" and not TOKEN.match(token):
            return self._send(400, {"error": "bad token"})
        if not api_base.startswith("https://") or any(c in api_base for c in ' "\\\n'):
            return self._send(400, {"error": "bad apiBase"})

        try:
            # The token travels in the environment, not on the command line,
            # so it is not readable in `ps` for the provisioning window.
            result = subprocess.run(
                ["bash", NEW_NODE, slug, tz, proxy, "-", api_base],
                capture_output=True,
                text=True,
                timeout=300,
                env={
                    **os.environ,
                    "FLOCK_NODES_BASE": BASE,
                    "FLOCK_NODES_ROUTES": ROUTES,
                    "FLOCK_NODE_TOKEN": token,
                },
            )
        except subprocess.TimeoutExpired:
            return self._send(504, {"error": "new-node.sh timed out"})

        if result.returncode != 0:
            return self._send(500, {"error": (result.stderr or result.stdout).strip()[-500:]})

        lines = result.stdout.strip().splitlines()
        try:
            self._send(200, json.loads(lines[-1]) if lines else {})
        except json.JSONDecodeError:
            self._send(500, {"error": "new-node.sh printed no JSON"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "9000"))
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
