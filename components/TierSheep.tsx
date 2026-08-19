/**
 * A sheep per tier, aged like the tier is named.
 *
 * Lamb springs, hogget walks with purpose, mutton stands still and lets the
 * flock come to it. The motion is the argument the copy is making, which is why
 * it isn't the same loop scaled three times.
 *
 * CSS-only, and assigned inside `prefers-reduced-motion: no-preference` so the
 * still frame is the default rather than the fallback. Each is decorative —
 * `aria-hidden`, because the tier name above it already says everything.
 */
export default function TierSheep({ tier }: { tier: "lamb" | "hogget" | "mutton" }) {
  return (
    <div className={`tiersheep tiersheep-${tier}`} aria-hidden>
      {/* Mutton stands in a small flock: three behind, one in front. The tier
          is about running stock, so the picture is more than one animal. */}
      {tier === "mutton" && (
        <>
          <img className="tiersheep-back" src="/brand/sheep-ink.svg" alt="" width={22} height={22} />
          <img className="tiersheep-back" src="/brand/sheep-ink.svg" alt="" width={18} height={18} />
        </>
      )}
      <img className="tiersheep-main" src="/brand/sheep-lime.svg" alt="" width={38} height={38} />
      <span className="tiersheep-ground" />
    </div>
  );
}
