"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import BulkBar from "./BulkBar";

/**
 * Selection for a server-rendered table.
 *
 * The inventory table renders on the server — photos, signed URLs, fee maths —
 * and turning it into a client component to get checkboxes would drag all of
 * that across the boundary for the sake of a Set of ids.
 *
 * So the checkboxes are plain server-rendered inputs carrying data-bulk-id, and
 * this listens for changes on the container. Event delegation is the older
 * trick and it is the right one here: the table stays a server component and
 * selection costs one client island.
 */
export default function BulkController({ children }: { children: React.ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const sync = useCallback(() => {
    const root = container.current;
    if (!root) return;
    const boxes = [...root.querySelectorAll<HTMLInputElement>("input[data-bulk-id]")];
    setSelected(boxes.filter((b) => b.checked).map((b) => b.dataset.bulkId!).filter(Boolean));
  }, []);

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    root.addEventListener("change", sync);
    return () => root.removeEventListener("change", sync);
  }, [sync]);

  const clear = useCallback(() => {
    const root = container.current;
    if (root) {
      for (const box of root.querySelectorAll<HTMLInputElement>("input[data-bulk-id]")) {
        box.checked = false;
      }
    }
    setSelected([]);
  }, []);

  return (
    <div ref={container}>
      {children}
      <BulkBar selected={selected} onClear={clear} />
    </div>
  );
}
