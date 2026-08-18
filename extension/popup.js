/**
 * The popup does one job: pair this browser with a Flock account, and show
 * whether that worked.
 *
 * It used to also list every drafted listing with its own Fill button, and hold
 * the auto-submit toggle, the hidden-window toggle, a Depop username field and
 * a sync button. All of that was a second, worse copy of the site — the same
 * listings without the photos, prices or fee maths, and settings buried behind
 * a toolbar icon you have to remember exists.
 *
 * Pairing has to live here, because only an extension can write to
 * chrome.storage.local. Everything else belongs on the site, so that's where it
 * is now.
 */

const root = document.getElementById("root");

const send = (message) =>
  new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));

function note(text, tone = "bad") {
  const el = document.createElement("div");
  el.className = `msg msg-${tone}`;
  el.textContent = text;
  root.appendChild(el);
}

const HOME = "https://sellonflock.com";

async function renderPairing(error) {
  const { apiBase } = await chrome.storage.local.get("apiBase");

  root.innerHTML = `
    <label for="code" style="font-size:11.5px;opacity:.7;display:block;margin-bottom:5px">
      Pairing code — from Flock → Settings → Browser extension
    </label>
    <input id="code" placeholder="XXXXXX-XXXXXX" autocomplete="off" spellcheck="false" />
    <label for="base" style="font-size:11.5px;opacity:.7;display:block;margin:12px 0 5px">
      Flock address
    </label>
    <input id="base" value="${apiBase || HOME}" spellcheck="false" />
    <div class="row"><button id="pair" class="primary">Pair</button></div>`;

  if (error) note(error);

  document.getElementById("pair").addEventListener("click", async () => {
    const token = document.getElementById("code").value.trim();
    const base = document.getElementById("base").value.trim().replace(/\/$/, "");
    if (!token) return;

    await chrome.storage.local.set({ token, apiBase: base });
    const result = await send({ type: "queue" });

    if (result?.ok) {
      renderPaired(result.data.listings?.length ?? 0);
    } else {
      // Don't keep a token the server just rejected. A stored bad token makes
      // every later call fail the same way with nothing pointing at the cause.
      await chrome.storage.local.remove("token");
      renderPairing(result?.error ?? "Couldn't reach Flock.");
    }
  });
}

async function renderPaired(drafted) {
  const { apiBase } = await chrome.storage.local.get("apiBase");
  const home = apiBase || HOME;

  root.innerHTML = `
    <div class="msg msg-ok" style="margin:0 0 12px">
      Connected${drafted ? ` · ${drafted} listing${drafted === 1 ? "" : "s"} ready` : ""}
    </div>
    <p style="font-size:12.5px;opacity:.75;margin:0 0 14px;line-height:1.5">
      Open a garment in Flock and press Fill next to a marketplace. This window
      doesn't need to be open.
    </p>
    <div class="row">
      <button id="open" class="primary">Open Flock</button>
      <button id="unpair" style="margin-left:auto">Unpair</button>
    </div>`;

  document.getElementById("open").addEventListener("click", () => {
    chrome.tabs.create({ url: home });
    window.close();
  });

  document.getElementById("unpair").addEventListener("click", async () => {
    await chrome.storage.local.remove("token");
    renderPairing();
  });
}

async function load() {
  const { token } = await chrome.storage.local.get("token");
  if (!token) return renderPairing();

  root.innerHTML = '<div class="empty">Checking…</div>';
  const result = await send({ type: "queue" });

  if (result?.ok) renderPaired(result.data.listings?.length ?? 0);
  else renderPairing(result?.error);
}

load();
