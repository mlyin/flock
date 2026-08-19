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
  // Facebook refuses /marketplace/create/item directly and bounces to
  // /marketplace/; its own "Create new listing" link points at /create/.
  facebook: "https://www.facebook.com/marketplace/create/",
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
};

const FILLER = {
  depop: "fill-depop.js",
  mercari: "fill-mercari.js",
  vinted: "fill-vinted.js",
  grailed: "fill-grailed.js",
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
        listing_url: detail?.product_url ?? null,
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
        ]);
        sendResponse({ ok: true, data: prefs });
        return;
      }

      if (message.type === "set-prefs") {
        // Whitelisted keys only — this arrives from a web page, and letting it
        // write arbitrary keys would let it overwrite the pairing token.
        const allowed = ["autoSubmit", "background", "depopUsername"];
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

        const tab = await chrome.tabs.create({ url, active: false });
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

        // A minimised window keeps the page out of your way while it fills.
        // An extension can't drive a truly headless page — the marketplace is a
        // React app and needs a real renderer to mount its form at all.
        //
        // If the sell page is already open in some tab, reuse it: retrying a
        // fill shouldn't pile up tabs, and a tab you opened to watch the fill
        // happen stays the one being filled. Reloading it first resets any
        // half-filled form to a known-clean state.
        // Always a fresh tab. Reusing whichever tab happened to be on the sell
        // page picks an arbitrary one across every window — including a listing
        // the seller was part-way through writing, which it would then
        // overwrite. It also raced its own reload and filled a document that
        // was already being replaced. A new tab costs nothing and can't destroy
        // anyone's work.
        let tab;
        if (background === true) {
          const win = await chrome.windows.create({ url, state: "minimized", focused: false });
          tab = win.tabs[0];
        } else {
          tab = await chrome.tabs.create({ url });
        }
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
          await chrome.windows.update(tab.windowId, { state: "normal", focused: true });
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
      files: ["read-depop-listings.js"],
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
      const { token, lastBadge } = await chrome.storage.local.get(["token", "lastBadge"]);
      if (!token) return sendResponse({ ok: true, skipped: "unpaired" });

      // Only act on a rise. Going 2 -> 0 just means they read them.
      const previous = lastBadge ?? 0;
      await chrome.storage.local.set({ lastBadge: message.count });
      if (message.count <= previous) return sendResponse({ ok: true, skipped: "no increase" });

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
