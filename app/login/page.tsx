import SignInWithGoogle from "@/components/SignInWithGoogle";
import { supabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  const error = typeof sp.error === "string" ? sp.error : null;

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="gate-brand">
          <strong>Flock</strong>
          <span>Resale operations</span>
        </div>

        <p className="gate-pitch">
          Photograph a garment once. It gets identified, priced, and listed everywhere you
          sell — with an honest answer to what you actually netted.
        </p>

        {error && (
          <div className="notice notice-bad">
            <strong>Sign-in didn&apos;t complete</strong>
            <p>{error}</p>
          </div>
        )}

        {supabaseConfigured() ? (
          <SignInWithGoogle next={next} />
        ) : (
          <div className="notice notice-warn">
            <strong>Not configured yet</strong>
            <p>
              Supabase environment variables are missing, so there&apos;s nothing to sign in
              to. See <code>.env.example</code>.
            </p>
          </div>
        )}

        <p className="gate-fine">
          We only read your name and email from Google. Flock never receives your Google
          password.
        </p>
      </div>
    </div>
  );
}
