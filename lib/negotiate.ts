import { CHANNEL_LABEL, projectedNet } from "./fees";
import type { ScoredOffer } from "./offers";

/**
 * What to do about an offer — decided in code, not by a model.
 *
 * The model never gets a vote on money here, and that is deliberate. A price
 * decision has to be inspectable: the seller should be able to read why Flock
 * said counter at $612 and disagree with the reasoning, not with a black box.
 * Everything below is arithmetic over numbers they set — floor price, cost
 * basis, and the channel's real fees.
 *
 * A model is used for exactly one thing, in lib/negotiate-reply.ts: turning
 * this decision into a sentence a stranger will read. That is a writing task.
 *
 * NOTHING HERE SENDS ANYTHING. Accepting an offer creates a binding sale and
 * replying puts words in the seller's mouth to a real buyer — both stay one
 * deliberate tap away, with the reasoning on screen. "Auto-negotiation" means
 * the thinking is automatic, not the commitment.
 */

export type Move = "accept" | "counter" | "decline" | "ask";

export type Verdict = {
  move: Move;
  /** Only set when move === "counter". */
  counterAt: number | null;
  /** What the seller clears if this move lands. */
  netIfTaken: number;
  /** One sentence, in the seller's terms, explaining the call. */
  because: string;
  /** The arithmetic, so the seller can check it rather than trust it. */
  working: string[];
  /** True when a human really must look — never auto-anything. */
  needsSeller: boolean;
};

export type Policy = {
  /**
   * How close to the floor an offer can land and still be worth taking.
   * A floor is what you'd accept; haggling over the last 2% costs more in
   * relisting than it wins.
   */
  acceptWithinPercentOfFloor: number;
  /** Where to counter, as a fraction of the gap between offer and ask. */
  counterSplit: number;
  /** Never counter above the asking price — that reads as bad faith. */
  neverExceedAsk: boolean;
};

export const DEFAULT_POLICY: Policy = {
  acceptWithinPercentOfFloor: 0.03,
  counterSplit: 0.5,
  neverExceedAsk: true,
};

const round = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * Judge one offer.
 *
 * The order of the checks is the argument. Missing information beats every
 * other consideration: without a floor price there is no such thing as a good
 * offer, only a number, and guessing one would be inventing the seller's
 * bottom line for them.
 */
export function judgeOffer(offer: ScoredOffer, policy: Policy = DEFAULT_POLICY): Verdict {
  const working: string[] = [];
  const ask = offer.item?.list_price == null ? null : Number(offer.item.list_price);
  const label = CHANNEL_LABEL[offer.channel];

  working.push(`Offer ${money(offer.amount)} on ${label}.`);
  working.push(
    `After ${label} fees that nets ${money(offer.net)}${
      offer.cost !== null ? `, ${money(round(offer.net - offer.cost))} over the ${money(offer.cost)} you paid` : ""
    }.`
  );

  if (offer.floor === null) {
    return {
      move: "ask",
      counterAt: null,
      netIfTaken: offer.net,
      because: "No floor price set on this garment, so there's nothing to judge the offer against.",
      working: [...working, "Set a floor — the lowest you'd actually take — and this decides itself."],
      needsSeller: true,
    };
  }

  working.push(`Your floor is ${money(offer.floor)}.`);

  // The floor is an amount the SELLER receives, so compare like with like:
  // an offer of $600 on Poshmark is not the same $600 as on Vinted.
  const floorNet = projectedNet(offer.channel, offer.floor);
  working.push(`Your floor nets ${money(floorNet)} on ${label} once fees come out.`);

  if (offer.net >= floorNet) {
    return {
      move: "accept",
      counterAt: null,
      netIfTaken: offer.net,
      because: `Clears your floor — ${money(offer.net)} in hand against the ${money(floorNet)} you said you'd take.`,
      working,
      needsSeller: true,
    };
  }

  const shortfall = round(floorNet - offer.net);
  const withinTolerance = shortfall <= floorNet * policy.acceptWithinPercentOfFloor;
  working.push(`That's ${money(shortfall)} short of your floor.`);

  if (withinTolerance) {
    return {
      move: "accept",
      counterAt: null,
      netIfTaken: offer.net,
      because: `${money(shortfall)} under your floor — inside the ${Math.round(
        policy.acceptWithinPercentOfFloor * 100
      )}% you'd rather take than relist for.`,
      working,
      needsSeller: true,
    };
  }

  // Counter, if there's room between the offer and the ask to split.
  if (ask !== null && ask > offer.amount) {
    const midpoint = round(offer.amount + (ask - offer.amount) * policy.counterSplit);
    // Never counter below your own floor — that's negotiating against yourself.
    const counterAt = Math.max(midpoint, offer.floor);
    const capped = policy.neverExceedAsk ? Math.min(counterAt, ask) : counterAt;

    if (capped > offer.amount) {
      working.push(`You're asking ${money(ask)}; countering at ${money(capped)}.`);
      return {
        move: "counter",
        counterAt: capped,
        netIfTaken: projectedNet(offer.channel, capped),
        because: `Too far under your floor to take, but there's room — ${money(
          capped
        )} nets ${money(projectedNet(offer.channel, capped))}.`,
        working,
        needsSeller: true,
      };
    }
  }

  return {
    move: "decline",
    counterAt: null,
    netIfTaken: offer.net,
    because: `${money(shortfall)} below what you said you'd accept, with no room to counter.`,
    working,
    needsSeller: true,
  };
}

/** Judge a whole queue at once, biggest shortfall to smallest. */
export function judgeAll(offers: ScoredOffer[], policy: Policy = DEFAULT_POLICY) {
  return offers.map((offer) => ({ offer, verdict: judgeOffer(offer, policy) }));
}

export const MOVE_LABEL: Record<Move, string> = {
  accept: "Accept",
  counter: "Counter",
  decline: "Decline",
  ask: "Needs you",
};
