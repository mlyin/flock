/**
 * Fetches a listing payload from Flock, opens the marketplace's sell page,
 * and injects the filler.
 *
 * It never submits. The user reviews the filled form and clicks the button
 * themselves — that's both the honest boundary when it's their marketplace
 * account and the thing that keeps this looking like a person rather than a bot.
 */

const SELL_PAGE = {
  depop: "https://www.depop.com/products/create/",
  mercari: "https://www.mercari.com/sell/",
  vinted: "https://www.vinted.com/items/new",
  grailed: "https://www.grailed.com/sell/new",
  poshmark: "https://poshmark.com/create-listing",
  // Read live 21 Aug 2026: /marketplace/create/item loads the form directly
  // when signed in. An earlier note here claimed it bounces to /marketplace/,
  // which is no longer true and cost us an extra redirect on every fill.
  facebook: "https://www.facebook.com/marketplace/create/item",
  // Not a listing form: the consignment packing list, reached via
  // Sell → Ship to Us → START. Landing here directly works when signed in.
  // eBay's listing form is four screens in. This is screen one; fill-ebay.js
  // drives the prelist and background.js waits for /lstng before filling.
  ebay: "https://www.ebay.com/sl/prelist/identify",
  therealreal: "https://www.therealreal.com/sell-trr/packing-list",
  // Verified 19 Aug 2026. No filler yet — the form hasn't been read, and a
  // Fill button with nothing behind it is the mistake The RealReal taught us.
  vestiaire: "https://www.vestiairecollective.com/sell-clothes-online/",
  // StockX has no create form — selling starts from a catalog search. The
  // filler's job there is search-and-select, not form-fill.
  stockx: "https://stockx.com/sell",
};

/**
 * One selector per channel that only exists once the form has actually mounted.
 * Waiting for these beats waiting a fixed number of seconds: the pages differ by
 * seconds between loads, and a fixed wait either fails on a slow one or wastes
 * time on a fast one.
 */
const READY = {
  depop: "#description",
  mercari: "#sellName",
  vinted: "#title",
  grailed: 'input[name="title"]',
  therealreal: "#category-dropdown-input",
  // Facebook gives its fields no stable attribute at all — generated class
  // names, React ids, no aria-label. The one durable thing is that each field
  // sits in a <label> carrying its name, so "the form has mounted" means "a
  // label saying Title exists". Nothing narrower would survive a redeploy.
  facebook: "label",
  // The prelist's category dialog, not the listing form — see EBAY_FORM below.
  ebay: 'input[aria-label="Enter a category value"]',
};

/**
 * eBay alone needs two rounds: the prelist has to be driven before the form it
 * produces exists. This is what to wait for between them.
 */
const EBAY_FORM = 'input[name="title"]';

const FILLER = {
  depop: "fill-depop.js",
  mercari: "fill-mercari.js",
  vinted: "fill-vinted.js",
  grailed: "fill-grailed.js",
  therealreal: "fill-therealreal.js",
  ebay: "fill-ebay.js",
  facebook: "fill-facebook.js",
};

const HOME = "https://www.sellonflock.com";

/**
 * Hosts a paired install might still have stored.
 *
 * getthreader.com is the pre-rename name. The bare apex is here too because it
 * 308s to www, and following a redirect on every API call is a wasted round
 * trip on something that also runs on a timer.
 *
 * (The rename sweep previously set OLD_HOME to the same string as HOME, so this
 * check compared a value against itself and migrated nobody. Same blind
 * find-replace that broke the manifest.)
 */
const OLD_HOMES = ["https://getthreader.com", "https://sellonflock.com"];

async function config() {
  const { token, apiBase } = await chrome.storage.local.get(["token", "apiBase"]);

  // A stored value beats the default forever, so an install paired before the
  // move would keep calling the old host with nothing pointing at the cause.
  // Move it once, here.
  if (OLD_HOMES.includes(apiBase)) {
    await chrome.storage.local.set({ apiBase: HOME });
    return { token, apiBase: HOME };
  }

  return { token, apiBase: apiBase || HOME };
}

async function api(path, options = {}) {
  const { token, apiBase } = await config();
  if (!token) throw new Error("Not paired. Open the Flock extension and enter your code.");

  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), authorization: `Bearer ${token}` },
  });

  if (response.status === 401) throw new Error("Pairing code rejected. Generate a new one in Flock.");
  if (!response.ok) throw new Error(`Flock returned ${response.status}.`);
  return response.json();
}

/**
 * Resolves once the tab has finished loading.
 *
 * Checks the current status first: a cached page can reach "complete" before
 * the listener is attached, and waiting for an event that already fired hangs
 * forever. The timeout is the backstop — a stuck load should surface as an
 * error, not as a spinner nobody can clear.
 */
function whenLoaded(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      fn(arg);
    };

    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") finish(resolve);
    };

    const timer = setTimeout(
      () => finish(reject, new Error("The marketplace page didn't finish loading.")),
      timeoutMs
    );

    chrome.tabs.onUpdated.addListener(listener);

    // Already done before we started listening?
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) return finish(reject, new Error(chrome.runtime.lastError.message));
      if (tab?.status === "complete") finish(resolve);
    });
  });
}

/** Polls in the page until the form exists, or gives up with a real error. */
async function waitForForm(tabId, selector, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const [hit] = await chrome.scripting.executeScript({
        target: { tabId },
        func: (sel) => Boolean(document.querySelector(sel)),
        args: [selector],
      });
      if (hit?.result) return true;
    } catch {
      // Tab still navigating — executeScript throws until it settles.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/**
 * Reads Depop's inbox and posts it to Flock.
 *
 * The thread list has the buyer and the preview; only the thread page has the
 * product link, and that link is the exact key that ties a conversation to a
 * garment. So this walks the threads one at a time in a single tab rather than
 * guessing a match from the item title.
 */
async function syncDepopMessages(maxThreads = 20) {
  const tab = await chrome.tabs.create({ url: "https://www.depop.com/messages/", active: false });
  try {
    await whenLoaded(tab.id);
    if (!(await waitForForm(tab.id, 'a[href^="/messages/"]', 20000))) {
      throw new Error("Depop's inbox didn't load. Check you're signed in.");
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["read-depop-messages.js"],
    });
    const list = await chrome.tabs.sendMessage(tab.id, { type: "depop-read-list" });
    const threads = (list?.threads ?? []).slice(0, maxThreads);

    const messages = [];
    for (const thread of threads) {
      await chrome.tabs.update(tab.id, { url: thread.url });
      await whenLoaded(tab.id);
      await new Promise((r) => setTimeout(r, 2500)); // the pane renders after load

      let detail = { product_url: null, bubbles: [] };
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["read-depop-messages.js"],
        });
        detail = await chrome.tabs.sendMessage(tab.id, { type: "depop-read-thread" });
      } catch {
        // A thread that won't render shouldn't lose the rest of the sync.
      }

      const body = detail?.bubbles?.length
        ? detail.bubbles[detail.bubbles.length - 1]
        : thread.preview;

      messages.push({
        external_id: thread.id,
        thread_id: thread.id,
        sender: thread.sender,
        body,
        // The amount is what makes a message an offer. Without it every row
        // arrived as kind='message' and the offer queue could never contain a
        // single item, however many offers were sitting in the inbox.
        offer_amount: detail?.offer_amount ?? null,
        listing_url: detail?.product_url ?? null,
        product_url: detail?.product_url ?? null,
        buyer_handle: thread.sender ?? null,
        raw: { when: thread.when, bubbles: detail?.bubbles ?? [] },
      });
    }

    return await api("/api/ext/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: "depop", messages }),
    });
  } finally {
    await chrome.tabs.remove(tab.id).catch(() => {});
  }
}


/**
 * Published-listing URL shapes.
 *
 * After the seller clicks List, the marketplace navigates the very tab we
 * filled to the new listing. That navigation is the notification nobody was
 * sending us — no "I published it" button required.
 *
 * depop is verified against a real listing:
 *   /products/yumseller21-ivory-soho-pullover-brand-alo-ab33/
 * The others follow each site's public listing URLs and will be confirmed the
 * first time one is published. A miss is not fatal: the shop sync backfills the
 * URL within the hour, and the manual control is still there.
 */
const PUBLISHED_URL = {
  depop: /^https:\/\/(www\.)?depop\.com\/products\/(?!create|edit)[^/]+\/?$/i,
  vinted: /^https:\/\/(www\.)?vinted\.com\/items\/\d+/i,
  grailed: /^https:\/\/(www\.)?grailed\.com\/listings\/\d+/i,
  mercari: /^https:\/\/(www\.)?mercari\.com\/(item|us\/item)\/[^/]+/i,
};

/**
 * Pages a marketplace sends you to after publishing that AREN'T the listing.
 *
 * Vinted drops you on your own profile (/member/<id>?promo_shown=true) with a
 * "Item listed" dialog over it — the listing URL is never visited, so watching
 * for /items/<id> waits forever on a listing that went live seconds ago.
 *
 * The listing is still reachable: it's the newest card on that profile. So
 * treat these as "published" too, and go find the URL rather than give up.
 */
const PUBLISHED_VIA = {
  depop: {
    // Publishing lands on /products/create/success/?productId=NNN, which the
    // listing pattern deliberately excludes since it also has to reject the
    // create form. The page carries a "View listing" link, and its href is the
    // real one — pointing at .../manage/, the seller's own view, so trim that
    // to leave the public URL a buyer would open.
    landing: new RegExp(String.raw`^https://(www\.)?depop\.com/products/create/success`, 'i'),
    find: () => {
      const link = [...document.querySelectorAll('a[href*="/products/"]')].find((a) => {
        const href = a.getAttribute('href') || '';
        return !/\/products\/(create|edit)/.test(href);
      });
      if (!link) return null;
      return new URL(link.getAttribute('href'), location.origin).href.replace(/\/manage\/?$/, '/');
    },
  },
  vinted: {
    landing: /^https:\/\/(www\.)?vinted\.com\/member\/\d+/i,
    // Newest first on a profile, so the first item link is the one just made.
    find: () => {
      const link = document.querySelector('a[href*="/items/"]');
      return link ? new URL(link.getAttribute('href'), location.origin).href : null;
    },
  },
};

/**
 * Watch the filled tab until it lands on a listing URL, then record it.
 *
 * Gives up after ten minutes and detaches on tab close, so a seller who fills a
 * form and wanders off doesn't leave a listener running for the session.
 */
function watchForPublish(tabId, listingId, channel) {
  const pattern = PUBLISHED_URL[channel];
  const via = PUBLISHED_VIA[channel];
  if (!pattern && !via) return;

  let done = false;

  const finish = () => {
    if (done) return;
    done = true;
    chrome.tabs.onUpdated.removeListener(onUpdated);
    chrome.tabs.onRemoved.removeListener(onRemoved);
    clearTimeout(timer);
  };

  const onUpdated = async (changedTabId, info) => {
    if (changedTabId !== tabId || !info.url) return;

    const direct = pattern && pattern.test(info.url);
    const landed = via && via.landing.test(info.url);
    if (!direct && !landed) return;

    finish();

    let url = info.url;
    if (!direct && landed) {
      // The profile renders its cards after load, so give it a moment before
      // looking. If the link still isn't there, record nothing rather than
      // save the profile URL as though it were the listing — a wrong link is
      // worse than none, because it looks like it worked.
      await new Promise((r) => setTimeout(r, 2500));
      try {
        const [hit] = await chrome.scripting.executeScript({
          target: { tabId },
          func: via.find,
        });
        if (!hit?.result) return;
        url = hit.result;
      } catch {
        return;
      }
    }

    try {
      await api(`/api/ext/listing/${listingId}/posted`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      await chrome.storage.local.set({
        lastPublished: { listingId, channel, url, at: Date.now() },
      });
    } catch {
      // The shop sync will catch it later; don't interrupt the seller with an
      // error about bookkeeping they didn't ask for.
    }
  };

  const onRemoved = (closedTabId) => {
    if (closedTabId === tabId) finish();
  };

  const timer = setTimeout(finish, 10 * 60 * 1000);
  chrome.tabs.onUpdated.addListener(onUpdated);
  chrome.tabs.onRemoved.addListener(onRemoved);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === "queue") {
        sendResponse({ ok: true, data: await api("/api/ext/queue") });
        return;
      }

      // Settings moved to the site; only the extension can reach this store.
      if (message.type === "get-prefs") {
        const prefs = await chrome.storage.local.get([
          "autoSubmit",
          "background",
          "depopUsername",
          "syncPaused",
        ]);
        sendResponse({ ok: true, data: prefs });
        return;
      }

      if (message.type === "set-prefs") {
        // Whitelisted keys only — this arrives from a web page, and letting it
        // write arbitrary keys would let it overwrite the pairing token.
        const allowed = ["autoSubmit", "background", "depopUsername", "syncPaused"];
        const patch = {};
        for (const key of allowed) {
          if (key in message.prefs) patch[key] = message.prefs[key];
        }
        await chrome.storage.local.set(patch);
        sendResponse({ ok: true, data: patch });
        return;
      }

      // Read a marketplace form and report its structure, filling nothing.
      // Pointing browser automation at these sites is itself detectable —
      // Poshmark refused a request outright with a debugger attached — but
      // the extension is a normal part of this browser, so it sees the real
      // page and looks like nobody unusual.
      if (message.type === "probe") {
        const url = SELL_PAGE[message.channel];
        if (!url) throw new Error(`No sell page known for ${message.channel}.`);

        // Foreground, deliberately. Mercari renders its sell form in a normal
        // tab and serves a BACKGROUND one an empty document — bodyLength 0, no
        // inputs, no buttons. That single flag is the whole reason Mercari has
        // looked "broken for automation" since the first probe: fills worked
        // because chrome.tabs.create defaults to active, and reads did not
        // because this one asked for a background tab.
        const tab = await chrome.tabs.create({ url, active: true });
        try {
          await whenLoaded(tab.id).catch(() => {});
          // No READY selector for a form nobody has seen yet; give the app a
          // moment to mount, then report whatever is actually there.
          await new Promise((r) => setTimeout(r, 6000));
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["probe-form.js"],
          });
          sendResponse({ ok: true, data: await chrome.tabs.sendMessage(tab.id, { type: "probe" }) });
        } finally {
          await chrome.tabs.remove(tab.id).catch(() => {});
        }
        return;
      }

      if (message.type === "fill") {
        const payload = await api(`/api/ext/listing/${message.listingId}`);
        const url = SELL_PAGE[payload.channel];
        const filler = FILLER[payload.channel];
        if (!url || !filler) throw new Error(`No filler for ${payload.channel} yet.`);

        const { background, autoSubmit } = await chrome.storage.local.get([
          "background",
          "autoSubmit",
        ]);

        // A tab, never a window.
        //
        // Filling used to open a minimised WINDOW when the background option
        // was on, which is jarring — a new window appearing off-screen reads
        // as the app misbehaving rather than working. A background tab does
        // the same job inside the window you're already in.
        //
        // Mercari is the exception and must be FOREGROUND. It serves a
        // background tab an empty document — no inputs, no buttons — which is
        // the entire reason it looked unfillable for so long. Anything that
        // needs to actually render gets an active tab regardless of the
        // preference.
        const NEEDS_FOREGROUND = new Set(["mercari"]);
        const quiet = background === true && !NEEDS_FOREGROUND.has(payload.channel);

        // Always a fresh tab. Reusing whichever tab happened to be on the sell
        // page picks an arbitrary one across every window — including a listing
        // the seller was part-way through writing, which it would then
        // overwrite. It also raced its own reload and filled a document that
        // was already being replaced.
        const tab = await chrome.tabs.create({ url, active: !quiet });
        // Not fatal if it times out. Some sell pages keep a socket open and
        // never report "complete" at all.
        // waitForForm below polls for the actual form, which is the readiness
        // test that matters — let it produce the error if the page is truly dead.
        await whenLoaded(tab.id).catch(() => {});

        const ready = await waitForForm(tab.id, READY[payload.channel] ?? "form");
        if (!ready) {
          throw new Error(
            `${payload.channel} didn't render its sell form. Open the tab and check you're signed in.`
          );
        }

        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [filler] });

        // Watch for the published URL from BEFORE the fill, not after it.
        // Auto-submit navigates the tab the instant the form is complete, and
        // a watcher attached after the fill response misses that navigation —
        // as does one never attached because the fill timed out but the seller
        // finished by hand. The watcher self-detaches after ten minutes.
        watchForPublish(tab.id, message.listingId, payload.channel);
        // Fillers catch their own crashes and respond with { error }, but a
        // response can still fail to arrive — a navigation mid-fill kills the
        // content script without closing the port. The deadline turns that
        // silence into an error the page can show. 90s covers the slowest real
        // fill (nine photos plus a cascade) with room to spare.
        // eBay: drive the three prelist screens first, then wait for the form
        // they produce. Every other channel's sell URL IS the form.
        if (payload.channel === "ebay") {
          const prelist = await chrome.tabs
            .sendMessage(tab.id, { type: "fill", payload })
            .catch(() => null);

          const onForm = await waitForForm(tab.id, EBAY_FORM, 60000);
          if (!onForm) {
            const stuck = prelist?.notes?.length
              ? ` Stopped at: ${prelist.notes.join("; ")}`
              : "";
            throw new Error(
              `eBay didn't reach the listing form.${stuck} Finish the category and condition steps in the tab, then fill again.`
            );
          }

          // Fresh page, so the content script has to be injected again.
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [filler] });
        }

        const result = await Promise.race([
          chrome.tabs.sendMessage(tab.id, {
            type: "apply",
            payload,
            autoSubmit: Boolean(autoSubmit),
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("The fill didn't finish within 90 seconds.")), 90000)
          ),
        ]);
        if (result?.error) throw new Error(`The ${payload.channel} filler crashed: ${result.error}`);

        // If anything is still missing, the decision is yours — bring the
        // window forward rather than leaving a half-filled form minimised
        // where you'd never notice it.
        if (result?.missing?.length || result?.blocked?.length) {
          await chrome.tabs.update(tab.id, { active: true });
        }

        // Send the form's own account back to Flock. This is what ends the
        // screenshot loop: the validation text that used to reach us only as a
        // photograph of a red message now lands in the database next to the
        // listing that produced it. Best-effort on purpose — a reporting
        // failure must never turn a successful fill into an error.
        try {
          await api("/api/ext/fill-report", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              // message.listingId, not listingId — the only binding of that
              // bare name is watchForPublish's parameter, which is not in
              // scope here. It threw a ReferenceError into the best-effort
              // catch below, so the feature meant to END the screenshot loop
              // silently never delivered one report.
              listingId: message.listingId,
              filled: result?.filled ?? [],
              missing: result?.missing ?? [],
              blocked: result?.blocked ?? [],
              controls: result?.report?.controls ?? [],
              errors: result?.report?.errors ?? [],
              url: result?.report?.url ?? null,
            }),
          });
        } catch (reportError) {
          console.warn("[flock] fill report not saved:", reportError.message);
        }

        sendResponse({ ok: true, data: result });
        return;
      }

      if (message.type === "sync-messages") {
        if (message.channel !== "depop") {
          throw new Error(`No message reader for ${message.channel} yet.`);
        }
        sendResponse({ ok: true, data: await syncDepopMessages() });
        return;
      }

      // The shop read the 30-minute alarm already does, on demand. Import
      // needs it now rather than in half an hour, and the same read is what
      // sale detection diffs against.
      if (message.type === "sync-shop") {
        if (message.channel !== "depop") {
          throw new Error(`No shop reader for ${message.channel} yet.`);
        }
        const { depopUsername } = await chrome.storage.local.get(["depopUsername"]);
        const username = message.username || depopUsername;
        if (!username) throw new Error("Set your Depop username in Settings first.");
        if (message.username && message.username !== depopUsername) {
          await chrome.storage.local.set({ depopUsername: message.username });
        }
        sendResponse({ ok: true, data: await syncDepopListings(username) });
        return;
      }

      if (message.type === "comps") {
        sendResponse({ ok: true, data: await readSoldComps(message.url) });
        return;
      }

      if (message.type === "posted") {
        sendResponse({
          ok: true,
          data: await api(`/api/ext/listing/${message.listingId}/posted`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ url: message.url }),
          }),
        });
        return;
      }

      sendResponse({ ok: false, error: `Unknown message: ${message.type}` });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
  })();

  return true; // keep the channel open for the async reply
});

/* ==========================================================================
   Background sync
   --------------------------------------------------------------------------
   Why this lives in the extension and not on the server:

   Depop, Poshmark, Grailed, Vinted and Mercari have no public API for reading
   your own shop. There is no key to give a server and no way for one to
   authenticate as the seller. The extension is the only thing that holds the
   session, so any polling has to happen here, in the seller's own browser,
   using the tab they're already signed into. eBay is the exception — once its
   API approval lands, that one can be polled server-side properly.

   The alarm is deliberately infrequent. Each run opens a background tab and
   walks message threads; doing that every few minutes would be both visible to
   the seller and exactly the traffic pattern a marketplace looks for.
   ========================================================================== */

const SYNC_ALARM = "flock-sync";
const SYNC_MINUTES = 30;

chrome.runtime.onInstalled.addListener(() => scheduleSync());
chrome.runtime.onStartup.addListener(() => scheduleSync());

async function scheduleSync() {
  await chrome.alarms.clear(SYNC_ALARM);
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_MINUTES, delayInMinutes: 2 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== SYNC_ALARM) return;

  // A real off switch. Reading the inbox opens a Depop tab, and a tab you
  // didn't ask for appearing while you work is worth being able to stop
  // outright rather than merely making quieter.
  const { syncPaused } = await chrome.storage.local.get(["syncPaused"]);
  if (syncPaused) return;

  // Unpaired means there's nowhere to send what we read; don't open tabs for
  // nothing, and don't nag.
  const { token } = await chrome.storage.local.get(["token"]);
  if (!token) return;

  // Never more than twice an hour, even if alarms double-fire after the
  // machine wakes. The sync tab opens with active:false so it doesn't steal
  // focus; this throttle is what keeps the traffic pattern unremarkable.
  const { lastSyncAt } = await chrome.storage.local.get(["lastSyncAt"]);
  if (Date.now() - (lastSyncAt ?? 0) < 25 * 60 * 1000) return;

  try {
    const result = await syncDepopMessages();
    // Shop sync is best-effort: no username stored just means the seller
    // hasn't set one yet, which shouldn't fail the message sync.
    const { depopUsername } = await chrome.storage.local.get(["depopUsername"]);
    let shop = null;
    if (depopUsername) {
      shop = await syncDepopListings(depopUsername).catch((e) => ({ error: e.message }));
    }
    await chrome.storage.local.set({
      lastSyncAt: Date.now(),
      lastSyncResult: { ok: true, ...result, shop },
    });
  } catch (error) {
    await chrome.storage.local.set({
      lastSyncAt: Date.now(),
      lastSyncResult: { ok: false, error: error.message },
    });
  }
});

/* --------------------------------------------------------------------------
   Depop shop sync — which listings are live, and where.

   This is what makes a channel chip clickable. Flock fills a form, the
   seller publishes on Depop, and nothing came back with the URL it landed at.
   Rather than ask them to paste it, read their shop.
   -------------------------------------------------------------------------- */

async function syncDepopListings(username) {
  if (!username) throw new Error("No Depop username stored. Set it in the extension popup.");

  const tab = await chrome.tabs.create({
    url: `https://www.depop.com/${encodeURIComponent(username)}/`,
    active: false,
  });

  try {
    await whenLoaded(tab.id);
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      // money.js first: read-depop-listings.js calls parseMoney, and a content
      // script that runs before its dependency throws a ReferenceError into a
      // catch and reports an empty shop — which sale detection reads as
      // "everything vanished".
      files: ["money.js", "read-depop-listings.js"],
    });

    const result = await chrome.tabs.sendMessage(tab.id, { type: "depop-read-shop" });
    const listings = result?.listings ?? [];

    let imported = null;
    if (listings.length) {
      imported = await api("/api/ext/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel: "depop", listings }),
      });
    }

    // matched/ambiguous come back from the reconciler, so the popup can say
    // whether a listing was actually tied to a garment rather than just read.
    return {
      found: listings.length,
      matched: imported?.matched ?? 0,
      ambiguous: imported?.ambiguous ?? 0,
    };
  } finally {
    await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

/**
 * Open an eBay sold-listings search in a background tab and read it.
 *
 * The page is public, so unlike every other reader here this one does not act
 * as the seller or depend on a session. It still runs in the extension rather
 * than on the server for a plainer reason: a datacentre IP scraping eBay
 * search gets a challenge page, and a person's browser asking for a page a
 * person could ask for does not.
 */
async function readSoldComps(url) {
  if (!url || !/^https:\/\/www\.ebay\.com\/sch\//.test(url)) {
    // The URL arrives from the page over postMessage. Anything that is not an
    // eBay search is not something to open in a tab on the seller's behalf.
    throw new Error("Not an eBay search URL.");
  }

  const tab = await chrome.tabs.create({ url, active: false });

  try {
    await whenLoaded(tab.id);
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["read-ebay-sold.js"],
    });

    const result = await chrome.tabs.sendMessage(tab.id, { type: "ebay-read-sold" });
    return {
      comps: result?.comps ?? [],
      skipped: result?.skipped ?? null,
      reportedTotal: result?.reportedTotal ?? null,
      noResults: Boolean(result?.noResults),
    };
  } finally {
    await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

/* --------------------------------------------------------------------------
   Badge-driven sync.

   watch-depop.js reports Depop's own "See N new offers" header badge whenever
   the seller has any Depop tab open. A change there is a far better trigger
   than a timer: it costs nothing, and it fires within seconds of an offer
   arriving rather than up to half an hour later.
   -------------------------------------------------------------------------- */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "depop-badge") return;

  (async () => {
    try {
      const { token, lastBadge, syncPaused, lastBadgeSync } = await chrome.storage.local.get([
        "token",
        "lastBadge",
        "syncPaused",
        "lastBadgeSync",
      ]);
      if (!token) return sendResponse({ ok: true, skipped: "unpaired" });
      if (syncPaused) return sendResponse({ ok: true, skipped: "paused" });

      // Only act on a rise. Going 2 -> 0 just means they read them.
      const previous = lastBadge ?? 0;
      await chrome.storage.local.set({ lastBadge: message.count });
      if (message.count <= previous) return sendResponse({ ok: true, skipped: "no increase" });

      // The badge is read from a MutationObserver on a busy page, so it can
      // rise more than once in quick succession. Without a floor, each rise
      // opens another Depop tab. Five minutes is still far faster than the
      // half-hourly alarm and is bounded.
      if (lastBadgeSync && Date.now() - lastBadgeSync < 5 * 60 * 1000) {
        return sendResponse({ ok: true, skipped: "cooling down" });
      }
      await chrome.storage.local.set({ lastBadgeSync: Date.now() });

      const data = await syncDepopMessages();
      await chrome.storage.local.set({ lastSyncAt: Date.now(), lastSyncResult: { ok: true, ...data } });
      sendResponse({ ok: true, synced: true });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
  })();

  return true;
});

/* One button in the popup: read the shop and the inbox, in that order.
   Shop first, because a freshly-read listing URL is what lets a message be
   matched to the item it's about. */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "sync-depop-all") return;

  (async () => {
    try {
      const username =
        message.username ||
        (await chrome.storage.local.get(["depopUsername"])).depopUsername;

      const shop = username ? await syncDepopListings(username) : { found: 0 };
      const messages = await syncDepopMessages();

      await chrome.storage.local.set({ lastSyncAt: Date.now() });
      sendResponse({
        ok: true,
        data: { listings: shop.found ?? 0, threads: messages?.threads ?? 0, matched: shop.matched ?? 0 },
      });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
  })();

  return true;
});
