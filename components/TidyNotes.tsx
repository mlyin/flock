"use client";

import { useState, useTransition } from "react";
import { tidyItemNotes } from "@/app/actions";

/**
 * The flaws and notes fields, plus a button that copy-edits what's in them.
 *
 * A client island inside the otherwise-server review form. It has to be
 * stateful because the whole point is replacing the textarea contents in
 * place — and it sends what's ON SCREEN, not what's in the database, so a
 * seller who has typed three lines and not saved doesn't lose them.
 *
 * The button is deliberately called "Tidy up" rather than "Rewrite with AI".
 * It fixes spelling, merges repeats and orders the sentences; it does not add
 * claims, and a name promising more would set the wrong expectation about a
 * field that ends up describing a real garment's condition.
 */
export default function TidyNotes({
  itemId,
  notes,
  flaws,
}: {
  itemId: string;
  notes: string;
  flaws: string[];
}) {
  const [notesText, setNotesText] = useState(notes);
  const [flawsText, setFlawsText] = useState(flaws.join("\n"));
  const [before, setBefore] = useState<{ notes: string; flaws: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const empty = !notesText.trim() && !flawsText.trim();

  const tidy = () => {
    setError(null);
    const snapshot = { notes: notesText, flaws: flawsText };
    start(async () => {
      const outcome = await tidyItemNotes(
        itemId,
        notesText,
        flawsText.split("\n").map((l) => l.trim()).filter(Boolean)
      );
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      // Keep the original within reach. An edit the seller doesn't like is
      // otherwise unrecoverable — they've just watched their own words vanish.
      setBefore(snapshot);
      setNotesText(outcome.notes);
      setFlawsText(outcome.flaws.join("\n"));
    });
  };

  const undo = () => {
    if (!before) return;
    setNotesText(before.notes);
    setFlawsText(before.flaws);
    setBefore(null);
  };

  return (
    <>
      <label className="field" htmlFor="flaws">
        <span className="field-label">Flaws — one per line, as you&apos;d write them in a listing</span>
        <textarea
          id="flaws"
          name="flaws"
          rows={3}
          value={flawsText}
          onChange={(e) => setFlawsText(e.target.value)}
        />
      </label>

      <label className="field" htmlFor="notes">
        <span className="field-label">Notes</span>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          value={notesText}
          onChange={(e) => setNotesText(e.target.value)}
        />
      </label>

      <div className="tidyrow">
        <button type="button" className="button button-quiet" onClick={tidy} disabled={pending || empty}>
          {pending ? "Tidying…" : "Tidy up the wording"}
        </button>
        {before && !pending && (
          <button type="button" className="linkbtn" onClick={undo}>
            undo
          </button>
        )}
        <span className="muted">
          {error
            ? error
            : "Fixes spelling and repeats in what you wrote. It won't add anything you didn't say."}
        </span>
      </div>
    </>
  );
}
