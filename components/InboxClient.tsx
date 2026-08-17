"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { analyzeInboxPhotos, type AnalyzeResult } from "@/app/actions";

export type Shot = { name: string; size: number; modified: number };

const kb = (bytes: number) => `${Math.round(bytes / 1024).toLocaleString()} KB`;

export default function InboxClient({ shots }: { shots: Shot[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const toggle = (name: string) =>
    setSelected((current) =>
      current.includes(name) ? current.filter((n) => n !== name) : [...current, name]
    );

  const analyze = () => {
    setResult(null);
    startTransition(async () => {
      const outcome = await analyzeInboxPhotos(selected);
      setResult(outcome);
      if (outcome.ok) {
        setSelected([]);
        router.refresh();
      }
    });
  };

  return (
    <>
      <div className="selectbar">
        <div>
          <strong>{selected.length || "No"}</strong> {selected.length === 1 ? "photo" : "photos"} selected
          {selected.length > 1 && <span className="muted"> — treated as one garment</span>}
        </div>
        <div className="selectbar-actions">
          {selected.length > 0 && (
            <button type="button" className="pill" onClick={() => setSelected([])} disabled={pending}>
              Clear
            </button>
          )}
          <button
            type="button"
            className="button"
            onClick={analyze}
            disabled={pending || selected.length === 0}
          >
            {pending ? "Reading photos…" : "Identify garment"}
          </button>
        </div>
      </div>

      {result?.ok === false && (
        <div className="notice notice-bad">
          <strong>That didn&apos;t work</strong>
          <p>{result.error}</p>
        </div>
      )}

      {result?.ok && (
        <div className="notice notice-good">
          <strong>
            {result.sku} drafted{" "}
            <a href={`/items/${result.itemId}`} className="link">
              — review it
            </a>
          </strong>
          <p>
            {result.questions.length > 0
              ? `${result.questions.length} thing${result.questions.length === 1 ? "" : "s"} it couldn't tell from the photos. They're waiting on the item page.`
              : "It was confident about everything. Still worth a look before you list."}
          </p>
        </div>
      )}

      <div className="shots">
        {shots.map((shot) => {
          const on = selected.includes(shot.name);
          const order = selected.indexOf(shot.name) + 1;
          return (
            <button
              key={shot.name}
              type="button"
              className={on ? "shot shot-on" : "shot"}
              onClick={() => toggle(shot.name)}
              disabled={pending}
              aria-pressed={on}
            >
              <img src={`/api/photo?p=${encodeURIComponent(`inbox/${shot.name}`)}`} alt={shot.name} />
              {on && <span className="shot-order">{order}</span>}
              <span className="shot-meta">
                <span className="shot-name">{shot.name}</span>
                <span>{kb(shot.size)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
