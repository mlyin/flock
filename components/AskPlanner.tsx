"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CHANNELS, CHANNEL_LABEL, askPlan, isConsignment, type Channel } from "@/lib/fees";
import { setTargetAndPrice } from "@/app/actions";
import ChannelIcon from "./ChannelIcon";
import { usd } from "@/lib/money";

/**
 * "I paid $30 and I want $40 out of it — what do I list it at?"
 *
 * Every other view here runs the sum forwards: pick a price, see the net. That
 * leaves the seller iterating by hand, because the fee comes out of the number
 * they're trying to choose. This runs it backwards, on every channel at once,
 * which is the only way the spread is visible — the same $40 needs $70.00 on
 * Vinted and $87.50 on Poshmark, and that gap is worth more than any copy the
 * app writes.
 *
 * The maths is in lib/fees and runs here in the browser, so the table moves
 * while the seller types. Only the target and a chosen price are written.
 */
export default function AskPlanner({
  itemId,
  costBasis,
  targetProfit,
  listPrice,
  listedOn,
}: {
  itemId: string;
  costBasis: number;
  targetProfit: number | null;
  listPrice: number | null;
  listedOn: Channel[];
}) {
  const [target, setTarget] = useState<string>(targetProfit == null ? "" : String(targetProfit));
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const wanted = Number(target);
  const live = Number.isFinite(wanted) && wanted > 0;

  const plans = useMemo(
    () => (live ? askPlan(CHANNELS, { costBasis, targetProfit: wanted }) : []),
    [live, wanted, costBasis]
  );

  const save = (price?: number) => {
    startTransition(async () => {
      const outcome = await setTargetAndPrice(itemId, live ? wanted : null, price);
      setSaved(outcome.ok ? (price ? `Listing at ${usd(price)}.` : "Target saved.") : outcome.error);
      router.refresh();
    });
  };

  return (
    <>
      <div className="sectionhead">
        <h2>What should I list it at?</h2>
        <p>
          Say what you want to clear and Flock works the ask backwards through each
          marketplace&apos;s fees. Postage excluded, so the channels compare like for like.
        </p>
      </div>

      <div className="planner">
        <div className="planner-inputs">
          <label>
            <span>You paid</span>
            <strong>{usd(costBasis)}</strong>
          </label>
          <label className="planner-target">
            <span>You want to make</span>
            <div className="planner-money">
              <em>$</em>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={target}
                placeholder="40.00"
                onChange={(e) => {
                  setTarget(e.target.value);
                  setSaved(null);
                }}
                onBlur={() => save()}
              />
            </div>
          </label>
          {saved && <p className="planner-saved">{saved}</p>}
        </div>

        {!live ? (
          <p className="muted planner-empty">
            Enter a number and every marketplace shows the price that gets you there.
          </p>
        ) : (
          <table className="planner-table">
            <thead>
              <tr>
                <th>Marketplace</th>
                <th className="num">List at</th>
                <th className="num">Fees</th>
                <th className="num">You keep</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => {
                const on = listedOn.includes(plan.channel);
                const chosen = plan.ask != null && listPrice != null && Math.abs(plan.ask - listPrice) < 0.005;

                return (
                  <tr key={plan.channel} className={on ? "planner-on" : undefined}>
                    <td>
                      <ChannelIcon channel={plan.channel} />{" "}
                      {CHANNEL_LABEL[plan.channel]}
                      {on && <span className="muted"> · listed</span>}
                    </td>

                    {plan.ask == null ? (
                      <td className="num muted" colSpan={3}>
                        {isConsignment(plan.channel)
                          ? "They set the price, not you"
                          : "No price reaches that"}
                      </td>
                    ) : (
                      <>
                        <td className="num planner-ask">{usd(plan.ask)}</td>
                        <td className="num muted">{usd(plan.fees)}</td>
                        <td className="num">{usd(plan.net)}</td>
                      </>
                    )}

                    <td className="num">
                      {plan.ask != null &&
                        (chosen ? (
                          <span className="muted">current</span>
                        ) : (
                          <button
                            type="button"
                            className="linkbtn"
                            disabled={pending}
                            onClick={() => save(plan.ask!)}
                          >
                            use
                          </button>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
