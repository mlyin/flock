import webpush from "web-push";
import { supabaseAdmin } from "./supabase/server";

/**
 * Web push.
 *
 * Works on iOS 16.4+ but only once the site is added to the home screen —
 * Safari refuses `Notification.requestPermission()` in a normal tab. That's why
 * the prompt in PushSetup checks for standalone display before offering.
 */

let configured = false;

function configure() {
  if (configured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:support@sellonflock.com",
    publicKey,
    privateKey
  );
  configured = true;
  return true;
}

export const pushConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

export type Notification = {
  title: string;
  body: string;
  /** Where tapping it should land. */
  url?: string;
  /** Same tag replaces an earlier notification rather than stacking. */
  tag?: string;
};

/**
 * Sends to every live endpoint the user owns. Dead endpoints are marked rather
 * than deleted — "notifications stopped" should be answerable.
 *
 * Never throws: a failed notification must not fail the request that triggered
 * it. A sale still needs recording even if the phone can't be reached.
 */
export async function notify(userId: string, notification: Notification): Promise<number> {
  if (!configure()) return 0;

  const admin = supabaseAdmin();
  const { data: subscriptions } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId)
    .is("failed_at", null);

  if (!subscriptions?.length) return 0;

  const payload = JSON.stringify(notification);
  let delivered = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          { TTL: 60 * 60 * 12 }
        );
        delivered += 1;
        await admin
          .from("push_subscriptions")
          .update({ last_sent_at: new Date().toISOString() })
          .eq("id", subscription.id);
      } catch (error: unknown) {
        const status = (error as { statusCode?: number })?.statusCode;
        // 404/410 mean the browser threw the subscription away — uninstalled,
        // permission revoked, or profile cleared. Anything else is transient.
        if (status === 404 || status === 410) {
          await admin
            .from("push_subscriptions")
            .update({
              failed_at: new Date().toISOString(),
              fail_reason: `gone (${status})`,
            })
            .eq("id", subscription.id);
        }
      }
    })
  );

  return delivered;
}
