import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy — Threader",
  description: "What Threader stores, what it sends elsewhere, and what it never sees.",
};

/**
 * Public — the Chrome Web Store requires a reachable privacy policy, and a
 * reviewer hitting a login wall is a rejection. Kept in sync with what the code
 * actually does; if the data flow changes, this changes with it.
 */
export default function PrivacyPage() {
  return (
    <div className="prose">
      <h1>Privacy</h1>
      <p className="prose-lead">
        Threader helps you catalogue secondhand clothing and list it across marketplaces.
        This describes exactly what it stores, what it sends elsewhere, and what it never
        touches. Last updated 17 August 2026.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>
          <strong>Your account.</strong> Name and email address from Google when you sign in.
          We never receive your Google password.
        </li>
        <li>
          <strong>Photos you upload</strong>, in private storage. They are not public, not
          indexed, and reachable only through short-lived links generated for your own session.
        </li>
        <li>
          <strong>Your inventory.</strong> Garment details, prices, costs, listing text, and
          which marketplaces you posted to.
        </li>
      </ul>

      <h2>What we send elsewhere</h2>
      <ul>
        <li>
          <strong>Anthropic</strong> — only if you use photo identification or AI listing copy.
          Your photos and garment details are sent to Claude to produce that text. If you never
          press those buttons, nothing is sent. Anthropic does not train models on API data.
        </li>
        <li>
          <strong>Supabase</strong> hosts the database, file storage, and sign-in.
        </li>
        <li>
          <strong>Vercel</strong> hosts the application.
        </li>
      </ul>
      <p>
        We do not sell your data, share it with advertisers, or use it for any purpose other
        than running Threader for you.
      </p>

      <h2>The browser extension</h2>
      <p>
        The extension exists because Depop and Mercari have no listing API. It reads the
        listing you drafted in Threader and fills their sell form in your own browser.
      </p>
      <ul>
        <li>
          It <strong>never sees your Depop or Mercari password</strong>. It uses the session
          you are already signed in with, the same way you would.
        </li>
        <li>
          It <strong>never submits a listing</strong>. It fills the form and stops; you review
          everything and click publish yourself.
        </li>
        <li>
          It only runs on <code>depop.com</code> and <code>mercari.com</code>, and only when you
          ask it to fill a specific listing.
        </li>
        <li>
          It does <strong>not</strong> read your browsing history, other tabs, or any page you
          have not sent it to.
        </li>
        <li>
          It stores one thing locally: the pairing code linking it to your Threader account.
          Unpair at any time from the extension itself.
        </li>
      </ul>

      <h2>Deleting your data</h2>
      <p>
        Email <a href="mailto:mlyin03@gmail.com">mlyin03@gmail.com</a> and we will delete your
        account, photos, and inventory. Revoking a pairing code from the Extension page cuts the
        extension off immediately.
      </p>

      <h2>Security</h2>
      <p>
        Every row in the database is protected by row-level security, so the database itself
        enforces that you can only reach your own inventory. Pairing codes are stored only as
        hashes. Photo storage is private, with access scoped to your account.
      </p>

      <h2>Contact</h2>
      <p>
        <a href="mailto:mlyin03@gmail.com">mlyin03@gmail.com</a>
      </p>
    </div>
  );
}
