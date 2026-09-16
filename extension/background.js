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
 * Publish detection that survives the service worker.
 *
 * After the seller (or an auto-submit) presses the marketplace's button, the
 * filled tab navigates to the new listing. That navigation is the
 * notification nobody was sending us. On a laptop a listener attached for
 * the fill's lifetime was enough; on a node nobody is watching, the seller
 * may finish Facebook's second screen ten minutes later, and MV3 has long
 * since put the worker to sleep — taking any dynamically attached listener
 * with it.
 *
 * So the watch is a ROW in chrome.storage.local, and the listener that reads
 * it is registered at the top level of this file, which is the one kind of
 * listener Chrome wakes the worker for. An in-memory resolver sits beside
 * it so a running job can also await the outcome, but the recording never
 * depends on that resolver being alive.
 */
const WATCHES_KEY = "publishWatches";
const WATCH_MINUTES = 10;

/** tabId -> settle(result | null), for the job that attached the watch and is still awake. */
const publishResolvers = new Map();

async function rememberWatch(tabId, listingId, channel) {
  const { [WATCHES_KEY]: watches = [] } = await chrome.storage.local.get([WATCHES_KEY]);
  const kept = watches.filter((w) => w.tabId !== tabId && w.until > Date.now());
  kept.push({ tabId, listingId, channel, until: Date.now() + WATCH_MINUTES * 60 * 1000 });
  await chrome.storage.local.set({ [WATCHES_KEY]: kept });
}

async function forgetWatch(tabId) {
  const { [WATCHES_KEY]: watches = [] } = await chrome.storage.local.get([WATCHES_KEY]);
  const kept = watches.filter((w) => w.tabId !== tabId && w.until > Date.now());
  if (kept.length !== watches.length) await chrome.storage.local.set({ [WATCHES_KEY]: kept });
}

/** The public listing URL this navigation amounts to, or null if it is not one. */
async function publishedUrlFor(tabId, url, channel) {
  const pattern = PUBLISHED_URL[channel];
  const via = PUBLISHED_VIA[channel];
  if (pattern && pattern.test(url)) return url;
  if (via && via.landing.test(url)) {
    // The profile renders its cards after load, so give it a moment before
    // looking. If the link still isn't there, record nothing rather than
    // save the profile URL as though it were the listing — a wrong link is
    // worse than none, because it looks like it worked.
    await new Promise((r) => setTimeout(r, 2500));
    try {
      const [hit] = await chrome.scripting.executeScript({ target: { tabId }, func: via.find });
      return hit?.result || null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Tell Flock. Returns what happened, because on a node the seller is not watching. */
async function recordPublished(listingId, channel, url) {
  try {
    await api(`/api/ext/listing/${listingId}/posted`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    await chrome.storage.local.set({ lastPublished: { listingId, channel, url, at: Date.now() } });
    return { url, recorded: true, error: null };
  } catch (postedError) {
    // On a laptop the shop sync will catch it later; don't interrupt the
    // seller with an error about bookkeeping they didn't ask for. A node
    // reports it, because there the seller is not watching.
    return { url, recorded: false, error: postedError?.message ?? String(postedError) };
  }
}

async function settleWatchFromNavigation(tabId, url) {
  const { [WATCHES_KEY]: watches = [] } = await chrome.storage.local.get([WATCHES_KEY]);
  const watch = watches.find((w) => w.tabId === tabId);
  if (!watch) return;
  if (watch.until < Date.now()) {
    await forgetWatch(tabId);
    publishResolvers.get(tabId)?.(null);
    publishResolvers.delete(tabId);
    return;
  }

  const listingUrl = await publishedUrlFor(tabId, url, watch.channel);
  if (!listingUrl) return; // not the listing yet; keep watching

  await forgetWatch(tabId);
  const result = await recordPublished(watch.listingId, watch.channel, listingUrl);
  publishResolvers.get(tabId)?.(result);
  publishResolvers.delete(tabId);
}

// Top level, so Chrome wakes the worker for these even after it slept.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (!info.url) return;
  void settleWatchFromNavigation(tabId, info.url);
});
chrome.tabs.onRemoved.addListener((tabId) => {
  publishResolvers.get(tabId)?.(null);
  publishResolvers.delete(tabId);
  void forgetWatch(tabId);
});

/**
 * Watch the filled tab until it lands on a listing URL, then record it.
 *
 * Returns { done }: a promise that resolves once the marketplace navigated
 * to a listing — with { url, recorded, error }, where `recorded` says whether
 * Flock accepted the posted call (the plan cap can refuse it) — or with null
 * if the watch expired or the tab closed. The persisted watch outlives this
 * promise: if the worker sleeps first, the navigation is still recorded, and
 * the posted route upgrades the job.
 */
function watchForPublish(tabId, listingId, channel) {
  let settle = () => {};
  const done = new Promise((resolve) => {
    settle = resolve;
  });

  if (!PUBLISHED_URL[channel] && !PUBLISHED_VIA[channel]) {
    settle(null);
    return { done };
  }

  publishResolvers.set(tabId, settle);
  void rememberWatch(tabId, listingId, channel);
  setTimeout(() => {
    if (publishResolvers.get(tabId) === settle) {
      publishResolvers.delete(tabId);
      settle(null);
    }
  }, WATCH_MINUTES * 60 * 1000);

  return { done };
}

/**
 * Wait for a watch, keeping the worker alive while doing so.
 *
 * A bare timer is exactly what MV3 kills a worker over: with no extension
 * API in flight for thirty seconds it is terminated, and a job that was
 * waiting to report never reports. Touching the tab every few seconds is
 * activity Chrome counts, and also notices the tab closing.
 */
async function awaitPublish(watch, tabId, ms) {
  const deadline = Date.now() + ms;
  let settled = false;
  let result = null;
  const done = watch.done.then((r) => {
    settled = true;
    result = r;
  });
  while (!settled && Date.now() < deadline) {
    await Promise.race([done, new Promise((r) => setTimeout(r, 4000))]);
    if (settled) break;
    try {
      await chrome.tabs.get(tabId);
    } catch {
      break; // the tab is gone
    }
  }
  return settled ? result : null;
}

/**
 * Fill one listing's marketplace form.
 *
 * The single path for both a laptop fill (the popup's own auto-submit setting,
 * result shown on the page) and a node job (the server's per-job decision,
 * result reported back), so the two can never drift. Returns the filler's
 * result, the tab, the saved fill report's id, and — when asked to wait — what
 * the marketplace did with an auto-submit, or null.
 *
 * `node` changes only where the tab goes: a node fills in a background tab and
 * never pulls focus, because the seller may be finishing a previous form in
 * the node's screen. Mercari still gets a foreground tab everywhere, since it
 * serves a background one an empty document.
 */
async function runFill(listingId, { autoSubmit = false, awaitPublishMs = 0, node = false } = {}) {
  const payload = await api(`/api/ext/listing/${listingId}`);
  const url = SELL_PAGE[payload.channel];
  const filler = FILLER[payload.channel];
  if (!url || !filler) throw new Error(`No filler for ${payload.channel} yet.`);

  // Queued before the seller published by hand, claimed after: the second
  // listing a fill would now create is the double-sale this product exists
  // to prevent. The server's claim skips these too; this is the belt.
  if (payload.status && payload.status !== "draft") {
    throw new Error(`That listing is ${payload.status}, not a draft — nothing to fill.`);
  }

  const { background } = await chrome.storage.local.get(["background"]);

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
  const quiet = (node || background === true) && !NEEDS_FOREGROUND.has(payload.channel);

  // Always a fresh tab. Reusing whichever tab happened to be on the sell
  // page picks an arbitrary one across every window — including a listing
  // the seller was part-way through writing, which it would then
  // overwrite. It also raced its own reload and filled a document that
  // was already being replaced.
  const tab = await chrome.tabs.create({ url, active: !quiet });

  try {
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
    // finished by hand. The watch is persisted and expires after ten minutes.
    const watch = watchForPublish(tab.id, listingId, payload.channel);
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
    // where you'd never notice it. Not on a node: there the seller is not
    // at this screen, and pulling focus would land on whatever they are
    // in the middle of when they are.
    if (!node && (result?.missing?.length || result?.blocked?.length)) {
      await chrome.tabs.update(tab.id, { active: true });
    }

    // Send the form's own account back to Flock. This is what ends the
    // screenshot loop: the validation text that used to reach us only as a
    // photograph of a red message now lands in the database next to the
    // listing that produced it. Best-effort on purpose — a reporting
    // failure must never turn a successful fill into an error.
    let reportId = null;
    try {
      const saved = await api("/api/ext/fill-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          listingId,
          filled: result?.filled ?? [],
          missing: result?.missing ?? [],
          blocked: result?.blocked ?? [],
          controls: result?.report?.controls ?? [],
          errors: result?.report?.errors ?? [],
          url: result?.report?.url ?? null,
        }),
      });
      reportId = saved?.id ?? null;
    } catch (reportError) {
      console.warn("[flock] fill report not saved:", reportError.message);
    }

    // A node waits, briefly, for the marketplace to answer an auto-submit.
    // Null here means "not seen yet", never "not published": the persisted
    // watch keeps going for ten minutes and the posted route upgrades the
    // job if it lands later.
    const publish = awaitPublishMs > 0 ? await awaitPublish(watch, tab.id, awaitPublishMs) : null;

    return { result, tabId: tab.id, reportId, publish };
  } catch (error) {
    // The tab is the evidence of what went wrong. Name it on the error so a
    // node job can keep track of it (and a retry can close it) instead of
    // leaking one foreground tab per failure.
    error.tabId = tab.id;
    throw error;
  }
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
        // A laptop fill: the popup's own auto-submit setting applies and the
        // page shows the result. Node jobs go through runQueuedJobs below,
        // where the server decides auto-submit per job.
        const { autoSubmit } = await chrome.storage.local.get(["autoSubmit"]);
        const { result } = await runFill(message.listingId, { autoSubmit: Boolean(autoSubmit) });
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

// adoptNodeConfig first: on a node this is what pairs the extension, and the
// alarms it arms are useless until a token exists. On a laptop it is a no-op.
chrome.runtime.onInstalled.addListener(async () => {
  await adoptNodeConfig();
  scheduleSync();
  scheduleJobs();
});
chrome.runtime.onStartup.addListener(async () => {
  await adoptNodeConfig();
  scheduleSync();
  scheduleJobs();
});

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

/* ==========================================================================
   Browser nodes
   --------------------------------------------------------------------------
   The same extension, running in a Chromium container Flock hosts for a
   seller (docs/NODES.md). Two things differ from a laptop, and both are
   decided by the SERVER rather than by anything stored here:

   - Pairing is zero-click. The provisioner writes node.json (apiBase, token)
     into the node's copy of this folder before Chromium starts; on install
     or startup an unpaired extension adopts it and remembers that it is a
     node. The store build excludes node.json, so on a laptop the fetch 404s
     and nothing happens — and nothing below runs on a laptop at all.
   - Work arrives as jobs. Every minute the node asks /api/ext/jobs; the
     route hands back a fill only for a token that belongs to a node row, so
     even a laptop that somehow polled would get an empty list. Each job
     carries its own autoSubmit, decided server-side and never true for
     Facebook or Mercari — lib/nodes.ts is the one place that rule lives.

   The node reports the filler's RAW result and the server classifies it.
   Filling a form is not publishing a listing: only the posted route, fed by
   the tab navigating to the live listing, ever marks a job published.
   ========================================================================== */

async function adoptNodeConfig() {
  const { token } = await chrome.storage.local.get(["token"]);
  if (token) return;
  try {
    const response = await fetch(chrome.runtime.getURL("node.json"));
    if (!response.ok) return;
    const cfg = await response.json();
    if (typeof cfg?.token !== "string" || typeof cfg?.apiBase !== "string") return;
    await chrome.storage.local.set({
      token: cfg.token,
      apiBase: cfg.apiBase.replace(/\/$/, ""),
      node: true,
    });
  } catch {
    // Not a node: the file does not exist on a laptop install.
  }
}

const JOBS_ALARM = "flock-jobs";
const JOBS_MINUTES = 1;
// How long a job waits for an auto-submitted form to become a listing before
// reporting "submit pressed, marketplace not yet heard from". The persisted
// watch keeps going for ten minutes regardless; a late landing still
// upgrades the job through the posted route.
const JOB_PUBLISH_WAIT_MS = 45 * 1000;
// One job per poll (the server hands out one) and a lock across
// service-worker restarts, together, keep a run under Chrome's five-minute
// per-event cap and one tab at a time.
const JOBS_LOCK_MS = 5 * 60 * 1000;

/** Same-worker guard; the persisted lock below covers restarts. */
let jobsInFlight = false;

async function scheduleJobs() {
  await chrome.alarms.clear(JOBS_ALARM);
  // Only a node polls. A laptop asking every minute would stamp its
  // token's last_used_at into meaninglessness for the Paired devices list.
  const { node } = await chrome.storage.local.get(["node"]);
  if (!node) return;
  chrome.alarms.create(JOBS_ALARM, { periodInMinutes: JOBS_MINUTES, delayInMinutes: 1 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== JOBS_ALARM) return;
  await runQueuedJobs();
});

async function runQueuedJobs() {
  // Taken before the first await. Chrome can deliver two alarm events to one
  // worker back to back (after a suspend, or onInstalled and onStartup both
  // scheduling); if both read storage before either set the flag, both saw
  // the lock free and two fills ran at once, which is the one-tab-at-a-time
  // contract PER_POLL=1 exists for.
  if (jobsInFlight) return;
  jobsInFlight = true;
  // Only a run that took the persisted lock may release it: an early return
  // because a previous worker still holds it must leave that lock alone.
  let locked = false;

  try {
    const { token, node, jobsLockUntil, activeJob } = await chrome.storage.local.get([
      "token",
      "node",
      "jobsLockUntil",
      "activeJob",
    ]);
    if (!token || !node) return;
    if (jobsLockUntil && Date.now() < jobsLockUntil) return;
    await chrome.storage.local.set({ jobsLockUntil: Date.now() + JOBS_LOCK_MS });
    locked = true;

    // A job recorded as active when this worker started is one the previous
    // worker died on — killed at the five-minute cap, or Chromium restarted.
    // Say so, rather than leave it `running` until the server reclaims it.
    if (activeJob) {
      await reportJob(activeJob.id, {
        ok: false,
        error: "The browser restarted while filling this. Nothing was submitted by it.",
      });
      await chrome.storage.local.remove("activeJob");
    }

    let jobs = [];
    try {
      jobs = (await api("/api/ext/jobs"))?.jobs ?? [];
    } catch (error) {
      // A revoked token, or Flock unreachable. Recorded so the node's own
      // service-worker console says why nothing is happening.
      await chrome.storage.local.set({ lastJobsAt: Date.now(), lastJobsError: error.message });
      return;
    }

    for (const job of jobs) {
      await runOneJob(job);
    }
    await chrome.storage.local.set({
      lastJobsAt: Date.now(),
      lastJobsError: null,
      lastJobsCount: jobs.length,
    });
  } finally {
    jobsInFlight = false;
    if (locked) await chrome.storage.local.set({ jobsLockUntil: 0 });
  }
}

async function reportJob(jobId, report) {
  try {
    await api(`/api/ext/jobs/${jobId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(report),
    });
  } catch (error) {
    // The job stays `running` on the server until it is reclaimed or a
    // person looks. Better than inventing an outcome the server never heard.
    console.warn("[flock] job result not delivered:", error.message);
  }
}

async function runOneJob(job) {
  // One tab per listing on a node. A retry after a handoff would otherwise
  // leave the previous attempt's filled form open beside the new one — two
  // forms for one garment, one press away from two listings.
  const { jobTabs = {} } = await chrome.storage.local.get(["jobTabs"]);
  if (jobTabs[job.listingId]) {
    await chrome.tabs.remove(jobTabs[job.listingId]).catch(() => {});
    delete jobTabs[job.listingId];
    await chrome.storage.local.set({ jobTabs });
  }

  await chrome.storage.local.set({ activeJob: { id: job.id, listingId: job.listingId, since: Date.now() } });

  let report;
  try {
    const { result, tabId, reportId, publish } = await runFill(job.listingId, {
      autoSubmit: Boolean(job.autoSubmit),
      awaitPublishMs: job.autoSubmit ? JOB_PUBLISH_WAIT_MS : 0,
      node: true,
    });
    report = {
      ok: true,
      filled: result?.filled ?? [],
      missing: result?.missing ?? [],
      blocked: result?.blocked ?? [],
      reportId,
      // What the marketplace showed, and whether Flock took it. The server
      // decides what that means; if it saw a listing Flock could not record,
      // the seller is told, with the URL, rather than shown "waiting".
      publishedUrl: publish?.url ?? null,
      postedError: publish && !publish.recorded ? publish.error ?? "not recorded" : null,
    };
    // A recorded publish has done its job and the tab goes. Anything else —
    // a form a person must finish, or a listing Flock could not record —
    // stays open, in the tab strip, for the seller to find in the node's
    // screen. Never pulled to the front: they may be mid-form elsewhere.
    if (publish?.recorded) {
      await chrome.tabs.remove(tabId).catch(() => {});
    } else {
      jobTabs[job.listingId] = tabId;
      await chrome.storage.local.set({ jobTabs });
    }
  } catch (error) {
    report = { ok: false, error: error.message };
    // The tab is the evidence; keep it, and let the next attempt close it.
    if (error.tabId) {
      jobTabs[job.listingId] = error.tabId;
      await chrome.storage.local.set({ jobTabs });
    }
  }

  await reportJob(job.id, report);
  await chrome.storage.local.remove("activeJob");
}

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
