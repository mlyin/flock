/**
 * Flock simulator: a synthetic closet run end to end through the money math.
 *
 *   node scripts/simulate.mjs            run, print report, exit 1 on violation
 *   node scripts/simulate.mjs --json     machine-readable, for agents and CI
 *   node scripts/simulate.mjs --seed 7   reproduce a run exactly
 *
 * What it exists for: the fee engine's contract is "list at the ask we print
 * and you clear the net we promised". Unit tests check that at points; this
 * sweeps it across a whole simulated inventory — every channel, awkward cents,
 * shipping permutations — and reports the violations with enough context to
 * reproduce each one. An agent asked to "run the simulations" runs this.
 *
 * Node 24 strips types natively, so importing the real lib/*.ts is free — the
 * simulator exercises production code, not a copy of it.
 */

import { CHANNELS, askPlan, askForNet, computeFees, isConsignment, projectedNet } from "../lib/fees.ts";

const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const SEED = Number(args[args.indexOf("--seed") + 1]) || 42;
const COUNT = Number(args[args.indexOf("--count") + 1]) || 400;

// Deterministic PRNG (mulberry32) — a simulation that can't be reproduced
// can't be debugged.
let state = SEED >>> 0;
function rand() {
  state |= 0; state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (list) => list[Math.floor(rand() * list.length)];
const dollars = (lo, hi) => Math.round((lo + rand() * (hi - lo)) * 100) / 100;

const BRANDS = ["Carhartt", "Alo", "Levi's", "Patagonia", "Stüssy", "Arc'teryx", "Uniqlo", "Nike", "Maison Margiela", null];
const CATEGORIES = ["Outerwear", "Denim", "Tops", "Knitwear", "Footwear", "Dresses", "Accessories"];

function makeItem(i) {
  return {
    sku: `SIM-${String(i + 1).padStart(4, "0")}`,
    brand: pick(BRANDS),
    category: pick(CATEGORIES),
    costBasis: dollars(1, 80),
    targetProfit: dollars(2, 120),
    shippingCollected: rand() < 0.5 ? 0 : dollars(4, 15),
    shippingCost: rand() < 0.5 ? 0 : dollars(4, 15),
  };
}

const items = Array.from({ length: COUNT }, (_, i) => makeItem(i));
const violations = [];
const stats = { items: COUNT, seed: SEED, asks: 0, unpriceable: 0, byChannel: {} };

for (const item of items) {
  const plan = askPlan([...CHANNELS], item);

  for (const row of plan) {
    const tag = `${item.sku} ${row.channel}`;
    const channelStats = (stats.byChannel[row.channel] ??= { asks: 0, unpriceable: 0, avgAsk: 0 });

    if (row.ask === null) {
      stats.unpriceable++;
      channelStats.unpriceable++;
      if (!isConsignment(row.channel) && item.costBasis + item.targetProfit < 500) {
        // A modest target no channel price can clear is suspicious — flag it.
        violations.push({ kind: "unpriceable-modest-target", tag, item });
      }
      continue;
    }

    stats.asks++;
    channelStats.asks++;
    channelStats.avgAsk += row.ask;

    const opts = { shippingCollected: item.shippingCollected, shippingCost: item.shippingCost };
    const target = item.costBasis + item.targetProfit;
    const net = projectedNet(row.channel, row.ask, opts);

    // The contract: the printed ask clears the target.
    if (net < target - 0.005) {
      violations.push({ kind: "ask-misses-target", tag, ask: row.ask, net, target, item });
    }
    // Sanity: net never exceeds the money that changed hands.
    if (net > row.ask + item.shippingCollected + 0.005) {
      violations.push({ kind: "net-exceeds-gross", tag, ask: row.ask, net, item });
    }
    // Fees at the ask are what the plan says they are.
    const fees = computeFees(row.channel, { soldPrice: row.ask, shippingCollected: item.shippingCollected })
      .reduce((sum, f) => sum + f.amount, 0);
    if (Math.abs(fees - row.fees) > 0.01) {
      violations.push({ kind: "plan-fee-mismatch", tag, planFees: row.fees, actual: fees, item });
    }
    // Inversion self-consistency: solving again for the achieved net stays ≤ ask.
    const again = askForNet(row.channel, target, opts);
    if (again !== null && again > row.ask + 0.005) {
      violations.push({ kind: "solver-unstable", tag, first: row.ask, second: again, item });
    }
  }
}

for (const c of Object.values(stats.byChannel)) {
  c.avgAsk = c.asks ? Math.round((c.avgAsk / c.asks) * 100) / 100 : null;
}

if (JSON_OUT) {
  console.log(JSON.stringify({ ok: violations.length === 0, stats, violations: violations.slice(0, 50) }, null, 2));
} else {
  console.log(`simulated ${COUNT} garments × ${CHANNELS.length} channels (seed ${SEED})`);
  console.log(`asks priced: ${stats.asks} · unpriceable: ${stats.unpriceable}`);
  for (const [channel, c] of Object.entries(stats.byChannel)) {
    console.log(`  ${channel.padEnd(12)} asks ${String(c.asks).padStart(4)}  avg $${c.avgAsk ?? "—"}  unpriceable ${c.unpriceable}`);
  }
  if (violations.length) {
    console.log(`\n${violations.length} VIOLATION(S) — first 10:`);
    for (const v of violations.slice(0, 10)) console.log(" ", JSON.stringify(v));
  } else {
    console.log("\nno violations — every printed ask keeps its promise");
  }
}

process.exit(violations.length ? 1 : 0);
