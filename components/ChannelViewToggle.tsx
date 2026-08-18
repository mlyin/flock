"use client";

import { useEffect, useState } from "react";

/**
 * Icons or names for the channel chips.
 *
 * "EB PM DP MC VT GR" is dense and fast once you know it, and opaque until you
 * do. Rather than pick for everyone, the preference lives on the document as
 * data-chanview and CSS swaps which label shows — so it costs no re-render, and
 * server-rendered rows don't need the value threaded down to them.
 */
export default function ChannelViewToggle() {
  const [view, setView] = useState<"icons" | "names">("icons");

  useEffect(() => {
    const stored = (localStorage.getItem("threader:chanview") as "icons" | "names") ?? "icons";
    setView(stored);
    document.documentElement.setAttribute("data-chanview", stored);
  }, []);

  const choose = (next: "icons" | "names") => {
    setView(next);
    localStorage.setItem("threader:chanview", next);
    document.documentElement.setAttribute("data-chanview", next);
  };

  return (
    <div className="filtergroup">
      <span className="filters-label">Channels</span>
      <button
        type="button"
        className={view === "icons" ? "pill pill-on" : "pill"}
        onClick={() => choose("icons")}
        aria-pressed={view === "icons"}
      >
        Icons
      </button>
      <button
        type="button"
        className={view === "names" ? "pill pill-on" : "pill"}
        onClick={() => choose("names")}
        aria-pressed={view === "names"}
      >
        Names
      </button>
    </div>
  );
}
