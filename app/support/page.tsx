import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support — Flock",
  description: "Get help with your Flock account, garment photos, inventory, and listing drafts.",
};

export default function SupportPage() {
  return (
    <main className="prose">
      <h1>Flock support</h1>
      <p className="prose-lead">
        Need help with your account, photos, inventory, or listing drafts? Email{" "}
        <a className="link" href="mailto:mlyin03@gmail.com?subject=Flock%20support">
          mlyin03@gmail.com
        </a>.
      </p>
      <p>
        Include your device, app version, and what happened. A screenshot of an error can
        help. Please do not send passwords, sign-in codes, or payment details.
      </p>

      <h2>Signing in</h2>
      <p>
        Use the same account you used to set up Flock. If the app cannot connect, check
        your internet connection and try again. You can also open{" "}
        <Link className="link" href="/login">Flock on the web</Link>.
      </p>

      <h2>Adding photos</h2>
      <p>
        Allow camera or photo access when prompted. If you previously declined, open
        your device Settings and update Flock&apos;s permissions. Use clear photos of the
        garment and its labels, then review the item details before preparing a listing.
      </p>

      <h2>Listing drafts and marketplace sales</h2>
      <p>
        A draft in Flock is not a published marketplace listing. Check the marketplace
        itself to confirm publication or a sale. For marketplace payments, refunds, and
        shipping disputes, contact that marketplace&apos;s support team.
      </p>

      <h2>Deleting your account</h2>
      <p>
        Sign in to Flock and open <Link className="link" href="/settings">Settings</Link>
        {" "}to request account deletion. If you cannot access your account, email us for
        help. Deleting a Flock account does not remove listings from your marketplace accounts.
      </p>

      <p>
        <Link className="link" href="/privacy">Privacy policy</Link>
        {" · "}<Link className="link" href="/">Back to Flock</Link>
      </p>
    </main>
  );
}
