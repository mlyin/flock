"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { issueTokenWithId } from "@/lib/exttoken";
import { CHANNEL_LABEL, type Channel } from "@/lib/fees";
import {
  FILLED_STALE_MINUTES,
  OPEN_JOB_STATUSES,
  canCancel,
  canRetry,
  eligibleForQueue,
  isStaleRunning,
  nodeLiveness,
  type FillJobStatus,
  type NodeLiveness,
} from "@/lib/nodes";
import {
  provisionNode,
  provisionerConfigured,
  retireNodeContainer,
  revokeTokenById,
} from "@/lib/nodes-server";
import { standing } from "@/lib/plan";
import { decryptToken, encryptToken, tokenEncryptionReady } from "@/lib/secrets";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

/**
 * Browser nodes, from the seller's side: create one, open it, pause it, and
 * hand it fills.
 *
 * The node itself never appears here as a process — it is a container the
 * provisioner on the node host starts (ops/nodes/), running the same
 * extension a laptop runs. What this file owns is the ROW and the QUEUE: who
 * has a node, what it has been asked to fill, and what came back. The
 * marketplace credentials are typed by the seller into the node's own screen
 * and never pass through anything in this repository.
 *
 * Every write to `nodes.status` and every write to `fill_jobs` beyond the
 * initial ask goes through the service role, scoped by user_id by hand: 0037
 * and 0038 grant the session neither, on purpose.
 */

export type NodeStatus = "provisioning" | "ready" | "paused" | "error" | "retired";

export type NodeView = {
  id: string;
  url: string;
  host: string;
  slug: string;
  status: NodeStatus;
  autoSubmit: boolean;
  proxy: string | null;
  error: string | null;
  createdAt: string;
  lastOpenedAt: string | null;
  liveness: NodeLiveness;
  /** The pairing token was revoked (from Paired devices, or by re-provisioning): the node cannot work. */
  tokenRevoked: boolean;
};

type Err = { ok: false; error: string };
const fail = (error: string): Err => ({ ok: false, error });

async function me() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** A node the seller can currently hand work to. */
const usable = (status: NodeStatus | undefined | null) => status === "ready" || status === "paused";

export async function getNode(): Promise<NodeView | null> {
  const { supabase, user } = await me();
  if (!user) return null;

  // password_enc is not in this select and could not be: 0037 revokes it
  // from the authenticated role. The embed reads the token's last_used_at,
  // which verifyToken stamps on every poll — that is the node's heartbeat.
  const { data: raw } = await supabase
    .from("nodes")
    .select(
      "id, url, host, slug, status, auto_submit, proxy, error, created_at, last_opened_at, token_id, extension_tokens ( last_used_at, revoked_at )"
    )
    .eq("user_id", user.id)
    .maybeSingle();
  if (!raw) return null;

  const data = raw as unknown as {
    id: string;
    url: string;
    host: string;
    slug: string;
    status: NodeStatus;
    auto_submit: boolean | null;
    proxy: string | null;
    error: string | null;
    created_at: string;
    last_opened_at: string | null;
    token_id: string | null;
    extension_tokens: { last_used_at: string | null; revoked_at: string | null } | null;
  };

  return {
    id: data.id,
    url: data.url,
    host: data.host,
    slug: data.slug,
    status: data.status,
    autoSubmit: Boolean(data.auto_submit),
    proxy: data.proxy ?? null,
    error: data.error ?? null,
    createdAt: data.created_at,
    lastOpenedAt: data.last_opened_at ?? null,
    liveness: nodeLiveness(data.extension_tokens?.last_used_at ?? null, new Date()),
    tokenRevoked: !data.token_id || Boolean(data.extension_tokens?.revoked_at),
  };
}

export type NodeEligibility = {
  eligible: boolean;
  reason: string | null;
  planLabel: string;
};

/**
 * Nodes are a real cost of goods (a container, RAM, an IP), so they ride on
 * the paid tiers. And they need the provisioner and the token key to exist
 * on this deployment — a Create button that can only fail is the same
 * mistake as a Fill button for a marketplace with no filler.
 */
export async function nodeEligibility(): Promise<NodeEligibility> {
  const where = await standing();
  if (!where) return { eligible: false, reason: "You're signed out.", planLabel: "" };

  const planLabel = where.plan.label;
  if (where.plan.id === "lamb" && !where.beta) {
    return { eligible: false, reason: "An always-on browser comes with Hogget and Mutton.", planLabel };
  }
  if (!provisionerConfigured()) {
    return { eligible: false, reason: "Browsers aren't switched on for this deployment yet.", planLabel };
  }
  if (!tokenEncryptionReady()) {
    return { eligible: false, reason: "CHANNEL_TOKEN_KEY isn't set, so the browser's login can't be stored safely.", planLabel };
  }
  return { eligible: true, reason: null, planLabel };
}

export type CreateNodeOutcome = { ok: true; url: string; password: string } | Err;

/**
 * Ask the node host for a container, then record it.
 *
 * Order: pairing token first, because the provisioner writes it into the
 * node's copy of the extension so the node pairs itself with no code to
 * paste; then the container; then the row. On any failure after the token
 * exists, the token is revoked; on any failure after the container exists,
 * the container is retired. Nothing dangling can pair or run.
 *
 * Re-creation is allowed only for a row the SERVER put in 'error', or whose
 * token has been revoked — 0037 grants the session no write on status, so a
 * seller cannot manufacture that state to mint containers.
 */
export async function createNode(): Promise<CreateNodeOutcome> {
  const { user } = await me();
  if (!user) return fail("You're signed out.");

  const eligibility = await nodeEligibility();
  if (!eligibility.eligible) return fail(eligibility.reason ?? "Not available.");

  const admin = supabaseAdmin();

  // Scoped by hand: the service role bypasses RLS.
  const { data: existing } = await admin
    .from("nodes")
    .select("id, slug, status, token_id, extension_tokens ( revoked_at )")
    .eq("user_id", user.id)
    .maybeSingle();
  const existingRow = existing as unknown as {
    id: string;
    slug: string;
    status: NodeStatus;
    token_id: string | null;
    extension_tokens: { revoked_at: string | null } | null;
  } | null;

  if (existingRow) {
    const dead =
      existingRow.status === "error" ||
      existingRow.status === "retired" ||
      !existingRow.token_id ||
      Boolean(existingRow.extension_tokens?.revoked_at);
    if (!dead) return fail("You already have a browser. Open it from Settings.");

    // Whatever is left of the old one goes first: its container (best-effort;
    // it may already be gone) and its token, so two containers can never both
    // answer as this seller.
    await retireNodeContainer(existingRow.slug);
    if (existingRow.token_id) await revokeTokenById(user.id, existingRow.token_id);
  }

  // Short, random, and never derived from anything about the seller: the
  // slug is a path on a shared host, and a guessable one is a guessable
  // login page for someone else's marketplace sessions.
  const slug = `n${randomBytes(4).toString("hex")}`;
  const apiBase = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.sellonflock.com").replace(/\/$/, "");

  const { token, id: tokenId } = await issueTokenWithId("Flock browser node");

  let provisioned;
  try {
    provisioned = await provisionNode({ slug, tz: "America/Los_Angeles", proxy: null, token, apiBase });
  } catch (error) {
    await revokeTokenById(user.id, tokenId);
    // The container may or may not exist after a failed call; ask the host to
    // remove it either way. A 404 there is fine.
    await retireNodeContainer(slug);
    return fail(`Couldn't create your browser: ${error instanceof Error ? error.message : String(error)}`);
  }

  const row = {
    user_id: user.id,
    host: provisioned.host,
    slug,
    url: provisioned.url,
    port: provisioned.port,
    password_enc: encryptToken(provisioned.password),
    token_id: tokenId,
    status: "ready",
    error: null,
  };

  const { error } = existingRow
    ? await admin.from("nodes").update(row).eq("id", existingRow.id).eq("user_id", user.id)
    : await admin.from("nodes").insert(row);
  if (error) {
    // A container with a live token and no row is an orphan nobody can see.
    await retireNodeContainer(slug);
    await revokeTokenById(user.id, tokenId);
    return fail(error.message);
  }

  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true, url: provisioned.url, password: provisioned.password };
}

/**
 * The login for the node's screen, decrypted for its owner.
 *
 * A pairing code is shown once because only its hash exists; this is stored
 * as ciphertext under a key outside the database, so its owner can see it
 * again. A seller locked out of the browser holding their marketplace
 * sessions is worse than a seller who can read their own password.
 */
export async function revealNodePassword(): Promise<{ ok: true; password: string } | Err> {
  const { user } = await me();
  if (!user) return fail("You're signed out.");

  const { data } = await supabaseAdmin()
    .from("nodes")
    .select("password_enc")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data?.password_enc) return fail("No browser yet.");

  try {
    return { ok: true, password: decryptToken(data.password_enc as string) };
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

export async function setNodeAutoSubmit(on: boolean): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user } = await me();
  if (!user) return fail("You're signed out.");
  // One of the two columns 0037 lets a session write.
  const { error } = await supabase.from("nodes").update({ auto_submit: on }).eq("user_id", user.id);
  if (error) return fail(error.message);
  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Pause and resume, and nothing else: 0037 grants the session no write on
 * `status`, because createNode() treats 'error' as re-provisionable and a
 * seller who could set it could mint containers on the shared host. So this
 * runs under the service role, scoped by hand, with the transition checked.
 */
export async function setNodePaused(paused: boolean): Promise<{ ok: boolean; error?: string }> {
  const { user } = await me();
  if (!user) return fail("You're signed out.");

  const admin = supabaseAdmin();
  const { data: node } = await admin
    .from("nodes")
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!node) return fail("No browser yet.");
  if (!usable(node.status as NodeStatus)) {
    return fail(`Your browser is ${node.status}, so it can't be ${paused ? "paused" : "resumed"} from here.`);
  }

  const { error } = await admin
    .from("nodes")
    .update({ status: paused ? "paused" : "ready" })
    .eq("id", node.id)
    .eq("user_id", user.id);
  if (error) return fail(error.message);
  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}

export async function noteNodeOpened(): Promise<void> {
  const { supabase, user } = await me();
  if (!user) return;
  await supabase
    .from("nodes")
    .update({ last_opened_at: new Date().toISOString() })
    .eq("user_id", user.id);
}

/* --------------------------------------------------------------------------
   The queue.
   -------------------------------------------------------------------------- */

export type FillJobView = {
  id: string;
  status: FillJobStatus;
  channel: Channel;
  label: string;
  attempts: number;
  autoSubmit: boolean;
  requestedAt: string;
  claimedAt: string | null;
  finishedAt: string | null;
  listingId: string;
  listingTitle: string | null;
  item: { id: string; sku: string; title: string } | null;
  /** From the fill report when there is one, else the node's own outcome. */
  filled: string[];
  missing: string[];
  blocked: string[];
  errors: string[];
  error: string | null;
  canRetry: boolean;
  canCancel: boolean;
  /** For `filled`: how long the marketplace has been silent since the node reported. */
  filledMinutesAgo: number | null;
  /** A `filled` job the marketplace has not answered in a while, or a `running` one whose node went quiet. */
  stale: boolean;
};

/** The row shape PostgREST returns for the select below; supabase-js can't infer it. */
type JobRow = {
  id: string;
  status: FillJobStatus;
  channel: Channel;
  attempts: number | null;
  auto_submit: boolean | null;
  requested_at: string;
  claimed_at: string | null;
  finished_at: string | null;
  outcome: { filled?: string[]; missing?: string[]; blocked?: string[]; error?: string | null } | null;
  error: string | null;
  listing_id: string;
  listings: { id: string; title: string | null; items: { id: string; sku: string; title: string } | null } | null;
  fill_reports: { filled: string[]; missing: string[]; blocked: string[]; errors: string[] } | null;
};

export async function openFillJobs(): Promise<FillJobView[]> {
  const { supabase, user } = await me();
  if (!user) return [];

  const { data } = await supabase
    .from("fill_jobs")
    .select(
      "id, status, channel, attempts, auto_submit, requested_at, claimed_at, finished_at, outcome, error, listing_id, " +
        "listings ( id, title, items ( id, sku, title ) ), fill_reports ( filled, missing, blocked, errors )"
    )
    .in("status", OPEN_JOB_STATUSES)
    .order("requested_at", { ascending: false })
    .limit(60);

  const rows = (data ?? []) as unknown as JobRow[];
  const now = new Date();

  return rows.map((row) => {
    const listing = row.listings;
    const report = row.fill_reports;
    const outcome = row.outcome ?? {};
    const status = row.status;
    const channel = row.channel;
    const attempts = Number(row.attempts ?? 0);

    // A `filled` job's clock starts when the node reported the press; the
    // posted route overwrites finished_at when the marketplace answers.
    const filledAt = status === "filled" ? row.finished_at ?? row.claimed_at : null;
    const filledMinutesAgo = filledAt
      ? Math.max(0, Math.round((now.getTime() - new Date(filledAt).getTime()) / 60_000))
      : null;
    const runningStale = isStaleRunning({ status, claimedAt: row.claimed_at }, now);

    return {
      id: row.id,
      status,
      channel,
      label: CHANNEL_LABEL[channel] ?? channel,
      attempts,
      autoSubmit: Boolean(row.auto_submit),
      requestedAt: row.requested_at,
      claimedAt: row.claimed_at ?? null,
      finishedAt: row.finished_at ?? null,
      listingId: row.listing_id,
      listingTitle: listing?.title ?? null,
      item: listing?.items ?? null,
      filled: report?.filled ?? outcome.filled ?? [],
      missing: report?.missing ?? outcome.missing ?? [],
      blocked: report?.blocked ?? outcome.blocked ?? [],
      errors: report?.errors ?? [],
      error: row.error ?? outcome.error ?? null,
      canRetry: canRetry({ status, attempts, claimedAt: row.claimed_at }, now),
      canCancel: canCancel({ status, claimedAt: row.claimed_at }, now),
      filledMinutesAgo,
      stale: runningStale || (filledMinutesAgo !== null && filledMinutesAgo >= FILLED_STALE_MINUTES),
    };
  });
}

export type QueueOutcome = { ok: boolean; queued: number; skipped: number; error?: string };

/**
 * Ask the node to fill these listings.
 *
 * Only drafts on channels with a filler, never a listing that already has an
 * open job (the unique index makes the second ask a no-op), and never more
 * new garments than the plan has room for — the posted route would refuse
 * the publish later, and a fill that is doomed at publish is a tab the
 * seller has to clean up for nothing. The insert runs under the session
 * (RLS plus the ownership trigger in 0038), so a listing id that is not the
 * caller's is refused by the database, not by this code.
 */
export async function queueFills(listingIds: string[]): Promise<QueueOutcome> {
  if (listingIds.length === 0) return { ok: false, queued: 0, skipped: 0, error: "Nothing selected." };

  const { supabase, user } = await me();
  if (!user) return { ok: false, queued: 0, skipped: 0, error: "You're signed out." };

  const node = await getNode();
  if (!node || !usable(node.status) || node.tokenRevoked) {
    return { ok: false, queued: 0, skipped: 0, error: "Create your browser in Settings first." };
  }

  // RLS scopes this read to the caller's own listings.
  const { data: listings } = await supabase
    .from("listings")
    .select("id, channel, status, item_id")
    .in("id", listingIds);

  const eligible = (listings ?? []).filter((l) =>
    eligibleForQueue({ status: l.status as string, channel: l.channel as Channel })
  );
  let skipped = listingIds.length - eligible.length;

  // The cap counts garments live at once. A garment already live somewhere
  // spends no new slot; a garment live nowhere spends one when its first
  // fill publishes. Admit that many new garments and no more — and count the
  // garments already waiting in the queue as spent, or two calls a minute
  // apart each admit a full plan's worth and the node publishes listings the
  // posted route then refuses to track.
  const where = await standing();
  const { data: live } = await supabase.from("listings").select("item_id").eq("status", "live");
  const liveItems = new Set((live ?? []).map((l) => l.item_id as string));
  const { data: openJobs } = await supabase
    .from("fill_jobs")
    .select("listings ( item_id )")
    .in("status", ["queued", "running", "filled", "needs_seller"]);
  const newItems = new Set<string>();
  for (const row of (openJobs ?? []) as unknown as { listings: { item_id: string } | null }[]) {
    const item = row.listings?.item_id;
    if (item && !liveItems.has(item)) newItems.add(item);
  }
  let room = where?.remaining === null || where?.remaining === undefined
    ? null
    : Math.max(0, where.remaining - newItems.size);
  const admitted: typeof eligible = [];
  for (const l of eligible) {
    const item = l.item_id as string;
    if (liveItems.has(item) || newItems.has(item)) {
      admitted.push(l);
      continue;
    }
    if (room !== null && room <= 0) {
      skipped++;
      continue;
    }
    newItems.add(item);
    if (room !== null) room--;
    admitted.push(l);
  }

  let queued = 0;
  for (const l of admitted) {
    const { error } = await supabase
      .from("fill_jobs")
      .insert({ user_id: user.id, listing_id: l.id, channel: l.channel });
    if (!error) queued++;
    // 23505: an open job already exists for this listing — queued, running,
    // or filled and waiting on the marketplace. Not a failure: asking twice
    // means "yes, still".
    else if (error.code === "23505") skipped++;
    else return { ok: false, queued, skipped, error: error.message };
  }

  revalidatePath("/");
  return { ok: true, queued, skipped };
}

/** Every drafted, fillable listing of these garments. */
export async function queueFillsForItems(itemIds: string[]): Promise<QueueOutcome> {
  if (itemIds.length === 0) return { ok: false, queued: 0, skipped: 0, error: "Nothing selected." };
  const { supabase, user } = await me();
  if (!user) return { ok: false, queued: 0, skipped: 0, error: "You're signed out." };

  const { data } = await supabase
    .from("listings")
    .select("id")
    .in("item_id", itemIds)
    .eq("status", "draft");
  const ids = (data ?? []).map((l) => l.id as string);
  if (ids.length === 0) {
    return { ok: false, queued: 0, skipped: 0, error: "No drafted listings on those garments. Draft listing copy first." };
  }
  return queueFills(ids);
}

/**
 * Run it again. Service role, because 0038 grants the session no UPDATE on
 * fill_jobs; scoped by user_id by hand, with the transition checked by the
 * same rule the dashboard used to offer the button (lib/nodes.ts canRetry).
 */
export async function retryFillJob(id: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await me();
  if (!user) return fail("You're signed out.");

  const admin = supabaseAdmin();
  const { data: raw } = await admin
    .from("fill_jobs")
    .select("id, status, attempts, claimed_at, listing_id, listings ( status )")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  const job = raw as unknown as {
    id: string;
    status: FillJobStatus;
    attempts: number;
    claimed_at: string | null;
    listing_id: string;
    listings: { status: string } | null;
  } | null;
  if (!job) return fail("Not found.");
  if (!canRetry({ status: job.status, attempts: Number(job.attempts), claimedAt: job.claimed_at })) {
    return fail(`That fill can't be retried (${job.status}, ${job.attempts} attempts).`);
  }
  if (job.listings?.status !== "draft") return fail("That listing is no longer a draft.");

  const { error } = await admin
    .from("fill_jobs")
    .update({
      status: "queued",
      node_id: null,
      error: null,
      outcome: null,
      report_id: null,
      claimed_at: null,
      finished_at: null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    return fail(error.code === "23505" ? "A newer fill for that listing is already queued." : error.message);
  }
  revalidatePath("/");
  return { ok: true };
}

/** Withdraw it. Same role and scoping as retry; a run genuinely in flight is refused. */
export async function cancelFillJob(id: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await me();
  if (!user) return fail("You're signed out.");

  const admin = supabaseAdmin();
  const { data: job } = await admin
    .from("fill_jobs")
    .select("id, status, claimed_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!job) return fail("Not found.");
  if (!canCancel({ status: job.status as FillJobStatus, claimedAt: job.claimed_at as string | null })) {
    return fail("Your browser is filling that right now. Give it a minute.");
  }

  const { error } = await admin
    .from("fill_jobs")
    .update({ status: "cancelled", finished_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return fail(error.message);
  revalidatePath("/");
  return { ok: true };
}
