import SignInWithGoogle from "@/components/SignInWithGoogle";
import DashboardPreview from "@/components/DashboardPreview";

/**
 * What a stranger sees at sellonflock.com.
 *
 * Until now they saw a bare Google button and had to guess what the product
 * was. This says what it does, and — deliberately — what it doesn't.
 *
 * Nothing here is invented. No user counts, no testimonials, no "trusted by",
 * no time-saved statistic. Every claim is something the code actually does
 * today: the channel list matches the fillers that exist, and the marketplaces
 * with no filler yet are named as coming rather than implied to work. A landing
 * page that overstates gets found out on day one, by the person who signed up
 * because of it.
 */
export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <span className="landing-brand">
          <img src="/brand/icon-lime.svg" alt="" width={30} height={30} />
          <strong>Flock</strong>
        </span>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <h1>
            List it once.
            <br />
            <span className="landing-accent">Sell it everywhere.</span>
          </h1>
          <p className="landing-lead">
            Photograph a garment and Flock writes the listing, works out what you&apos;d
            actually clear after fees, and fills in the sell form on every marketplace you
            use — in your own browser, on your own accounts.
          </p>
          <div className="landing-cta">
            <SignInWithGoogle next="/" />
          </div>
          <p className="landing-fine">Free while it&apos;s in early access.</p>
        </div>

        {/* muted + playsInline + autoPlay is the combination browsers actually
            honour for inline motion; without all three it silently refuses.
            aria-hidden because it says nothing the headline does not. */}
        <video
          className="landing-hero-video"
          src="/brand/hero-1080.mp4"
          autoPlay
          muted
          loop
          playsInline
          aria-hidden
        />
      </section>

      <section className="landing-showcase">
        <h2>Everything, in one place</h2>
        <p className="landing-lead landing-lead-sm">
          Every garment, every channel it&apos;s on, and what each one would actually pay
          you after its cut.
        </p>
        <DashboardPreview />
      </section>
      <section className="landing-band">
        <div className="landing-steps">
          <article>
            <span className="landing-step">1</span>
            <h3>Photograph it</h3>
            <p>
              Upload the photos you&apos;d post anyway. Flock reads the brand, size, colour,
              material and condition off them, and asks when it isn&apos;t sure rather than
              guessing.
            </p>
          </article>
          <article>
            <span className="landing-step">2</span>
            <h3>Price it properly</h3>
            <p>
              Every marketplace takes a different cut. Flock shows what lands in your account on
              each one, so you can pick where to list on the number that matters instead of the
              headline price.
            </p>
          </article>
          <article>
            <span className="landing-step">3</span>
            <h3>Post it everywhere</h3>
            <p>
              One click per marketplace. The browser extension opens the sell page and fills it
              in — photos, title, description, category, size, condition, price.
            </p>
          </article>
        </div>
      </section>

      <section className="landing-band landing-band-alt">
        <h2>Where it posts</h2>
        <p className="landing-lead landing-lead-sm">
          Depop, Vinted, Grailed and Mercari today. Poshmark, eBay, Facebook Marketplace and The
          RealReal are being added.
        </p>
        <ul className="landing-chips">
          <li>Depop</li>
          <li>Vinted</li>
          <li>Grailed</li>
          <li>Mercari</li>
          <li className="landing-chip-soon">Poshmark</li>
          <li className="landing-chip-soon">eBay</li>
          <li className="landing-chip-soon">Facebook</li>
          <li className="landing-chip-soon">The RealReal</li>
        </ul>
      </section>

      <section className="landing-band">
        <div className="landing-two">
          <div>
            <h2>It runs in your browser, not on our servers</h2>
            <p>
              Flock never asks for a marketplace password and never posts from a datacentre. The
              extension fills the form inside your own signed-in session, so a listing comes from
              you because it is from you.
            </p>
          </div>
          <div>
            <h2>You press publish</h2>
            <p>
              By default Flock fills the form and stops — you check it and post. Turn on automatic
              publishing if you&apos;d rather it finished the job.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-foot">
        <h2>Start with one garment</h2>
        <p className="landing-lead landing-lead-sm">
          It takes a couple of minutes to see whether it&apos;s worth your time.
        </p>
        <div className="landing-cta">
          <SignInWithGoogle next="/" />
        </div>
        <p className="landing-fine">
          <a href="/privacy">Privacy</a> · <a href="/install">Install the extension</a>
        </p>
      </section>
    </div>
  );
}
