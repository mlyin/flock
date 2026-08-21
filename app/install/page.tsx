import type { Metadata } from "next";
import ExtensionVersion from "@/components/ExtensionVersion";
import { EXTENSION_VERSION } from "@/lib/extension";

export const metadata: Metadata = {
  title: "Install the extension — Flock",
  description: "Install the Flock browser extension manually, until it's on the Chrome Web Store.",
};

/**
 * Public on purpose (see middleware.ts): this is the link you paste into a
 * group chat. The zip lives in a public Supabase Storage bucket, uploaded by
 * `node scripts/publish-extension.mjs`. Once the Chrome Web Store listing is
 * approved, this page becomes a link to the store and the manual steps go.
 */
const ZIP_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/extension/flock-extension-latest.zip`;

export default function InstallPage() {
  return (
    <div className="prose">
      <h1>Install the Flock extension</h1>
      <p className="prose-lead">
        The extension fills marketplace sell forms from your Flock inventory — you review
        everything and press publish yourself. It isn&apos;t on the Chrome Web Store yet, so for
        now it installs manually. Takes about a minute.
      </p>

      <ExtensionVersion current={EXTENSION_VERSION} showCurrent />

      <p>
        <a className="button" href={ZIP_URL}>
          Download flock-extension-latest.zip
        </a>
      </p>

      <h2>Set it up in Chrome</h2>
      <ol>
        <li>
          <strong>Unzip the download.</strong> You&apos;ll get a folder with{" "}
          <code>manifest.json</code> inside. Keep the folder somewhere permanent — Chrome loads
          the extension from it, so deleting the folder removes the extension.
        </li>
        <li>
          <strong>Open</strong> <code>chrome://extensions</code> — paste that into the address
          bar.
        </li>
        <li>
          <strong>Turn on “Developer mode”</strong> — the toggle in the top-right corner.
        </li>
        <li>
          <strong>Click “Load unpacked”</strong> and pick the unzipped folder (the one containing{" "}
          <code>manifest.json</code>).
        </li>
      </ol>

      <h2>Pair it with your account</h2>
      <ol>
        <li>
          Sign in at <a href="https://www.sellonflock.com">sellonflock.com</a>, then go to{" "}
          <strong>Settings → Browser extension</strong>.
        </li>
        <li>Click the Flock icon in Chrome&apos;s toolbar and paste the pairing code.</li>
      </ol>
      <p>
        From then on, every listing in your inventory gets a one-click <em>Fill</em> button per
        marketplace. The extension opens the sell form in a tab, fills what it can, and stops —
        it never submits a listing for you.
      </p>

      <h2>Updating</h2>
      <p>
        Manual installs don&apos;t auto-update. When something&apos;s fixed, download the zip
        again from this page, unzip it over the same folder, and click the reload arrow on the
        extension&apos;s card at <code>chrome://extensions</code>.
      </p>

      <p className="muted">
        Chrome may warn about developer-mode extensions when it restarts — that&apos;s expected
        for any manually installed extension. What it does with your data is covered in the{" "}
        <a href="/privacy">privacy page</a>.
      </p>
    </div>
  );
}
