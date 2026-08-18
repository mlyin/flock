const root = document.getElementById("root");

const send = (message) =>
  new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));

function note(text, tone = "bad") {
  const el = document.createElement("div");
  el.className = `msg msg-${tone}`;
  el.textContent = text;
  root.appendChild(el);
}

async function renderPairing(error) {
  const { apiBase } = await chrome.storage.local.get("apiBase");

  root.innerHTML = `
    <label for="code" style="font-size:11.5px;opacity:.7;display:block;margin-bottom:5px">
      Pairing code — from Flock → Extension
    </label>
    <input id="code" placeholder="XXXXXX-XXXXXX" autocomplete="off" spellcheck="false" />
    <label for="base" style="font-size:11.5px;opacity:.7;display:block;margin:12px 0 5px">
      Flock address
    </label>
    <input id="base" value="${apiBase || "https://sellonflock.com"}" spellcheck="false" />
    <div class="row"><button id="pair" class="primary">Pair</button></div>`;

  if (error) note(error);

  document.getElementById("pair").addEventListener("click", async () => {
    const token = document.getElementById("code").value.trim();
    const base = document.getElementById("base").value.trim().replace(/\/$/, "");
    if (!token) return;

    await chrome.storage.local.set({ token, apiBase: base });
    const result = await send({ type: "queue" });

    if (result?.ok) {
      renderQueue(result.data.listings);
    } else {
      await chrome.storage.local.remove("token");
      renderPairing(result?.error ?? "Couldn't reach Flock.");
    }
  });
}

async function renderQueue(listings) {
  const { background, autoSubmit, depopUsername, lastSyncAt } =
    await chrome.storage.local.get(["background", "autoSubmit", "depopUsername", "lastSyncAt"]);

  const syncedAgo = lastSyncAt
    ? `synced ${Math.max(1, Math.round((Date.now() - lastSyncAt) / 60000))}m ago`
    : "not synced yet";

  root.innerHTML = `
    <div class="opts">
      <label><input type="checkbox" id="opt-bg" ${background === true ? "checked" : ""} />
        Fill in a hidden window (off = watch it work)</label>
      <label><input type="checkbox" id="opt-submit" ${autoSubmit ? "checked" : ""} />
        Submit automatically when nothing is missing</label>
    </div>

    <!-- Without a username there's no shop to read, so listing URLs and sold
         status can never come back. Depop's shop slug is not derivable from
         anything we already hold, so it has to be asked for. -->
    <div class="opts">
      <label style="display:block">
        <span style="display:block;margin-bottom:6px">Your Depop username</span>
        <input id="depop-user" type="text" placeholder="yumseller22"
               value="${depopUsername ? String(depopUsername).replace(/"/g, "&quot;") : ""}" />
      </label>
      <div style="display:flex;gap:8px;align-items:center">
        <button id="sync-now">Sync Depop now</button>
        <span class="item-meta" id="sync-when">${syncedAgo}</span>
      </div>
    </div>

    <div class="row" style="margin:0 0 4px">
      <button id="refresh">Refresh</button>
      <button id="unpair" style="margin-left:auto">Unpair</button>
    </div>`;

  document.getElementById("opt-bg").addEventListener("change", (e) =>
    chrome.storage.local.set({ background: e.target.checked })
  );
  document.getElementById("opt-submit").addEventListener("change", (e) =>
    chrome.storage.local.set({ autoSubmit: e.target.checked })
  );

  const userField = document.getElementById("depop-user");
  userField.addEventListener("change", (e) =>
    // Tolerate a pasted profile URL as well as a bare handle.
    chrome.storage.local.set({
      depopUsername: e.target.value.trim().replace(/^.*depop\.com\//i, "").replace(/\/+$/, ""),
    })
  );

  document.getElementById("sync-now").addEventListener("click", async (e) => {
    const username = userField.value.trim().replace(/^.*depop\.com\//i, "").replace(/\/+$/, "");
    if (!username) return note("Add your Depop username first.");
    await chrome.storage.local.set({ depopUsername: username });

    e.target.disabled = true;
    e.target.textContent = "Syncing…";
    const result = await send({ type: "sync-depop-all", username });
    e.target.disabled = false;
    e.target.textContent = "Sync Depop now";

    if (result?.ok) {
      const d = result.data ?? {};
      note(
        `Read ${d.listings ?? 0} listing(s) and ${d.threads ?? 0} thread(s).` +
          (d.matched ? ` Linked ${d.matched} to items.` : ""),
        true
      );
    } else {
      note(result?.error ?? "Sync failed.");
    }
  });

  if (listings.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent =
      "Nothing drafted yet. In Flock, open a garment and hit Write listing copy.";
    root.appendChild(empty);
  }

  for (const listing of listings) {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div>
        <div class="item-name">${listing.label}</div>
        <div class="item-meta">${listing.sku} · ${listing.channel} · $${listing.price}</div>
      </div>`;

    const button = document.createElement("button");
    button.className = "primary";
    const CHANNEL_NAME = { depop: "Depop", mercari: "Mercari", vinted: "Vinted", grailed: "Grailed", ebay: "eBay", poshmark: "Poshmark", facebook: "Facebook" };
    button.textContent = `Fill on ${CHANNEL_NAME[listing.channel] ?? listing.channel}`;
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Opening…";
      const result = await send({ type: "fill", listingId: listing.id });
      if (result?.ok) {
        window.close();
      } else {
        button.disabled = false;
        button.textContent = "Retry";
        note(result?.error ?? "Something went wrong.");
      }
    });

    row.appendChild(button);
    root.appendChild(row);
  }

  document.getElementById("refresh").addEventListener("click", load);
  document.getElementById("unpair").addEventListener("click", async () => {
    await chrome.storage.local.remove("token");
    renderPairing();
  });
}

async function load() {
  const { token } = await chrome.storage.local.get("token");
  if (!token) return renderPairing();

  root.innerHTML = '<div class="empty">Loading…</div>';
  const result = await send({ type: "queue" });

  if (result?.ok) renderQueue(result.data.listings);
  else renderPairing(result?.error);
}

load();
