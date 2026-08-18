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
      Pairing code — from Threader → Extension
    </label>
    <input id="code" placeholder="XXXXXX-XXXXXX" autocomplete="off" spellcheck="false" />
    <label for="base" style="font-size:11.5px;opacity:.7;display:block;margin:12px 0 5px">
      Threader address
    </label>
    <input id="base" value="${apiBase || "https://getthreader.com"}" spellcheck="false" />
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
      renderPairing(result?.error ?? "Couldn't reach Threader.");
    }
  });
}

async function renderQueue(listings) {
  const { background, autoSubmit } = await chrome.storage.local.get(["background", "autoSubmit"]);

  root.innerHTML = `
    <div class="opts">
      <label><input type="checkbox" id="opt-bg" ${background === true ? "checked" : ""} />
        Fill in a hidden window (off = watch it work)</label>
      <label><input type="checkbox" id="opt-submit" ${autoSubmit ? "checked" : ""} />
        Submit automatically when nothing is missing</label>
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

  if (listings.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent =
      "Nothing drafted yet. In Threader, open a garment and hit Write listing copy.";
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
    button.textContent = `Fill on ${listing.channel === "depop" ? "Depop" : "Mercari"}`;
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
