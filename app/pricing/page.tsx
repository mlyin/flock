import type { Metadata } from "next";
import Link from "next/link";
import { PLANS } from "@/lib/plan";
import { usd } from "@/lib/money";

export const metadata: Metadata = {
  title: "Pricing — Flock",
  description: "Priced by how much you have live. Free for five listings at once, no card and no clock.",
};

/**
 * Public (see middleware.ts): this is a page people read before signing up.
 *
 * Two rules held throughout. Nothing claims a feature that doesn't exist —
 * anything unbuilt is marked "in build" inline rather than listed beside
 * working ones, because a pricing page is where overclaiming costs most.
 * And no invented proof: no user counts, no testimonials, no logos.
 */
export default function PricingPage() {
  return (
    <div className="pricing">
      <header className="pricing-head">
        <h1>Priced by how much you have live.</h1>
        <p className="landing-lead">
          Lamb and Hogget are the same product at two sizes — every marketplace, every tool,
          nothing clipped. Mutton adds what you only need once resale is the job. The free plan
          has no clock and doesn&apos;t ask for a card.
        </p>
      </header>

      {/* A flock crossing the page: two lanes at different speeds, so it reads
          as depth rather than a marquee. Decorative, hidden from readers. */}
      <div className="flock-band" aria-hidden>
        <div className="lane lane-far">
          <div className="run">
            {Array.from({ length: 16 }, (_, i) => (
              <span key={i} className="drifter" style={{ ["--d" as string]: `${(i % 6) * 0.21}s` }}>
                <img src="/brand/sheep-ink.svg" alt="" width={26} height={26} />
              </span>
            ))}
          </div>
        </div>
        <div className="lane lane-near">
          <div className="run">
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i} className="drifter" style={{ ["--d" as string]: `${(i % 5) * 0.29}s` }}>
                <img src="/brand/sheep-ink.svg" alt="" width={40} height={40} />
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="tiers">
        {PLANS.map((plan) => (
          <section key={plan.id} className={`tier ${plan.id === "hogget" ? "tier-pick" : ""}`}>
            {plan.id === "hogget" && <span className="tier-flag">Most sellers</span>}

            <h2>{plan.label}</h2>
            <p className="tier-price">
              {plan.monthly === 0 ? "Free" : <>{usd(plan.monthly)}<span>/mo</span></>}
            </p>
            <p className="tier-cap">
              {plan.activeListings === null
                ? "No cap"
                : `${plan.activeListings} listings live at once`}
            </p>
            <p className="tier-headline">{plan.headline}</p>

            <ul className="tier-features">
              {plan.features.map((f) => (
                <li key={f.text}>
                  <span aria-hidden>{f.soon ? "·" : "✓"}</span>
                  <span>
                    {f.text}
                    {f.soon && <em className="tier-soon">in build, not live yet</em>}
                  </span>
                </li>
              ))}
            </ul>

            <p className="tier-forwhom">{plan.forWhom}</p>

            <Link href="/login" className={plan.id === "hogget" ? "button" : "button button-quiet"}>
              {plan.cta}
            </Link>
            <p className="tier-fine">{plan.fine}</p>
          </section>
        ))}
      </div>

      <p className="pricing-note">
        Some accounts are on Mutton permanently — the people who were using this before it worked
        properly.
      </p>

      <p className="pricing-body">
        Flock reads the tag and fills the sell form in your own browser — you press publish. Vinted
        takes nothing from the seller; Depop, Grailed and Mercari do, and Flock shows the real net
        either way. Where a fee rate hasn&apos;t been rechecked recently the app says so rather than
        quoting it with confidence.
      </p>

      <section className="faq">
        <h2>Questions worth asking</h2>

        <div>
          <h3>What counts as an active listing?</h3>
          <p>
            One garment, however many marketplaces it&apos;s on. A jacket live on Depop, Vinted and
            Grailed is <strong>one</strong> listing against your cap, not three. Drafts don&apos;t
            count. Sold and taken-down items don&apos;t count. It&apos;s what&apos;s live right now,
            not what you&apos;ve ever added — so a free account can list, sell and relist forever
            without hitting anything.
          </p>
        </div>

        <div>
          <h3>What happens at the cap?</h3>
          <p>
            It only stops the next listing going up. It never takes anything down. At five on Lamb
            all five stay live and editable — mark one sold or take one down and the sixth goes up
            straight away. If you move to a smaller plan while over its cap, nothing is delisted and
            nothing is deleted: you keep every listing, you just can&apos;t create new ones until
            you&apos;re back under. Flock never pulls a listing off a marketplace unless you ask it
            to.
          </p>
        </div>

        <div>
          <h3>Can I cancel?</h3>
          <p>
            Yes — in the app, no email to write. You keep the paid plan until the end of the period
            you&apos;ve paid for, then drop to Lamb. Your listings stay live and your data stays
            put. We don&apos;t ask why.
          </p>
        </div>

        <div>
          <h3>Why are some features marked &quot;in build&quot;?</h3>
          <p>
            Because they aren&apos;t finished, and a pricing page is the worst place to find that
            out afterwards. Anything unmarked works today. Anything marked doesn&apos;t yet, and
            saying so here costs less than a refund and a bad review later.
          </p>
        </div>
      </section>
    </div>
  );
}
