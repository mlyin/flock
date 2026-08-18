import PairExtension from "@/components/PairExtension";
import ExtensionSettings from "@/components/ExtensionSettings";
import ProbeForm from "@/components/ProbeForm";
import { supabaseServer } from "@/lib/supabase/server";
import { shortDate } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const supabase = await supabaseServer();
  const { data: tokens } = await supabase
    .from("extension_tokens")
    .select("id, label, created_at, last_used_at")
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  return (
    <>
      <div className="sectionhead">
        <h2>Browser extension</h2>
        <p>For Depop and Mercari, which have no listing API</p>
      </div>

      <div className="notice">
        <strong>How this works</strong>
        <p>
          The extension fills the sell form on Depop or Mercari inside your own browser
          session, then stops — <strong>you click submit yourself</strong>. Flock never sees
          your Depop or Mercari password, and nothing posts from our servers. That&apos;s
          deliberate: a listing that comes from your real browser looks like you, because it is.
        </p>
      </div>

      <p>
        Don&apos;t have the extension yet? <a href="/install">Install it</a> — it&apos;s a
        one-minute manual install until the Chrome Web Store listing is approved.
      </p>

      <PairExtension existing={tokens?.length ?? 0} />

      {/* Behaviour settings used to hide in the toolbar popup. They belong
          here, next to the pairing they depend on. Renders nothing until the
          extension is actually installed. */}
      <ExtensionSettings />

      <ProbeForm />

      {(tokens?.length ?? 0) > 0 && (
        <>
          <div className="sectionhead">
            <h2>Paired devices</h2>
          </div>
          <div className="inboxlist">
            {tokens!.map((token) => (
              <div key={token.id} className="inboxrow">
                <span className="inboxrow-name">{token.label ?? "Extension"}</span>
                <span className="inboxrow-meta">
                  paired {shortDate(token.created_at)}
                  {token.last_used_at ? ` · last used ${shortDate(token.last_used_at)}` : " · never used"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
