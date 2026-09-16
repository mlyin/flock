"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkDraftListings, bulkDropPrices } from "@/app/actions";
import { queueFillsForItems } from "@/app/node-actions";

/**
 * Act on many garments at once.
 *
 * The inventory table had no selection at all, so a ten percent drop across
 * the stuff that's been sitting a month meant opening forty item pages. The
 * dashboard has counted "sitting over 30 days" for weeks and offered nothing
 * to do about it.
 *
 * Selection lives here rather than in the table so the bar can stay put while
 * the page below it re-renders.
 */
export default function BulkBar({
  selected,
  onClear,
  hasNode = false,
}: {
  selected: string[];
  onClear: () => void;
  /** The seller has an always-on browser to hand fills to (docs/NODES.md). */
  hasNode?: boolean;
}) {
  const [percent, setPercent] = useState("10");
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  if (selected.length === 0) return null;

  const draft = () => {
    setNote(null);
    start(async () => {
      const outcome = await bulkDraftListings(selected);
      if (!outcome.ok) {
        setNote(outcome.error ?? "That did not work.");
        return;
      }
      // Report the failures too. A silent "drafted 34" when 6 were skipped
      // is how a seller finds out weeks later that six garments never had copy.
      setNote(
        outcome.failed > 0
          ? `${outcome.drafted} drafted · ${outcome.failed} could not be`
          : `${outcome.drafted} drafted on every channel`
      );
      router.refresh();
    });
  };

  const drop = () => {
    setNote(null);
    start(async () => {
      const outcome = await bulkDropPrices(selected, Number(percent));
      if (!outcome.ok) {
        setNote(outcome.error);
        return;
      }
      // Say what actually happened, including what didn't. "Done" would hide
      // the fact that six of them stopped at their floor.
      const parts = [`${outcome.changed} repriced`];
      if (outcome.floored > 0) parts.push(`${outcome.floored} stopped at their floor`);
      if (outcome.skipped > 0) parts.push(`${outcome.skipped} left alone`);
      setNote(parts.join(" · "));
      router.refresh();
    });
  };

  // "Fill", not "publish". The node fills every drafted form; Depop, Vinted
  // and Grailed publish only if the seller switched auto-submit on, and
  // Facebook and Mercari always wait for a person. The dashboard's pending
  // panel says which is which, per listing.
  const sendToNode = () => {
    setNote(null);
    start(async () => {
      const outcome = await queueFillsForItems(selected);
      if (!outcome.ok) {
        setNote(outcome.error ?? "That did not work.");
        return;
      }
      const parts = [`${outcome.queued} sent to your browser`];
      if (outcome.skipped > 0) parts.push(`${outcome.skipped} skipped (not a draft, already queued, or over your plan's cap)`);
      setNote(parts.join(" · "));
      router.refresh();
    });
  };

  return (
    <div className="bulkbar">
      <strong>
        {selected.length} selected
      </strong>

      <label className="bulkbar-drop">
        <span>Drop</span>
        <input
          type="number"
          min="1"
          max="89"
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
        />
        <span>%</span>
      </label>

      <button type="button" className="button button-sm" disabled={pending} onClick={drop}>
        {pending ? "Dropping…" : "Drop the price"}
      </button>

      <button type="button" className="pill" disabled={pending} onClick={draft}>
        {pending ? "Drafting…" : "Draft listing copy"}
      </button>

      {hasNode && (
        <button type="button" className="pill" disabled={pending} onClick={sendToNode}>
          {pending ? "Sending…" : "Fill in my browser"}
        </button>
      )}

      <button type="button" className="linkbtn" onClick={onClear}>
        clear
      </button>

      {note && <span className="bulkbar-note">{note}</span>}

      <span className="muted bulkbar-fine">
        Never goes below a garment&apos;s floor. Live listings are repriced here; the
        marketplace still needs the change made on its own form.
        {hasNode && " Filling in your browser is not publishing: Facebook and Mercari wait for you to press their button, and the rest publish only if auto-submit is on."}
      </span>
    </div>
  );
}
