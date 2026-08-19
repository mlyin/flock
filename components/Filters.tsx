import Link from "next/link";
import { CHANNELS, CHANNEL_LABEL } from "@/lib/fees";
import ChannelIcon from "./ChannelIcon";

type Params = { status: string; channel: string; sort: string };

const STATUSES = [
  { value: "all", label: "All" },
  { value: "listed", label: "Listed" },
  { value: "sold", label: "Sold" },
  { value: "draft", label: "Draft" },
];

const SORTS = [
  { value: "sku", label: "SKU" },
  { value: "aging", label: "Oldest listed" },
  { value: "profit", label: "Best profit" },
  { value: "price", label: "Highest ask" },
];

function href(current: Params, patch: Partial<Params>) {
  const next = { ...current, ...patch };
  const qs = new URLSearchParams();
  if (next.status !== "all") qs.set("status", next.status);
  if (next.channel !== "all") qs.set("channel", next.channel);
  if (next.sort !== "sku") qs.set("sort", next.sort);
  const s = qs.toString();
  return s ? `/?${s}` : "/";
}

export default function Filters({ params }: { params: Params }) {
  return (
    <div className="filters">
      <div className="filtergroup">
        <span>Status</span>
        {STATUSES.map((s) => (
          <Link
            key={s.value}
            href={href(params, { status: s.value })}
            className={params.status === s.value ? "pill pill-on" : "pill"}
          >
            {s.label}
          </Link>
        ))}
      </div>

      <div className="filtergroup">
        <span>Channel</span>
        <Link href={href(params, { channel: "all" })} className={params.channel === "all" ? "pill pill-on" : "pill"}>
          All
        </Link>
        {CHANNELS.map((c) => (
          <Link
            key={c}
            href={href(params, { channel: c })}
            className={params.channel === c ? "pill pill-on" : "pill"}
          >
            <ChannelIcon channel={c} size={14} />
            {CHANNEL_LABEL[c]}
          </Link>
        ))}
      </div>

      <div className="filtergroup">
        <span>Sort</span>
        {SORTS.map((s) => (
          <Link
            key={s.value}
            href={href(params, { sort: s.value })}
            className={params.sort === s.value ? "pill pill-on" : "pill"}
          >
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
