"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createNode,
  noteNodeOpened,
  revealNodePassword,
  setNodeAutoSubmit,
  setNodePaused,
  type NodeEligibility,
  type NodeView,
} from "@/app/node-actions";

/**
 * The seller's always-on browser: create it, open it, pause it.
 *
 * Opens in a new tab rather than an iframe, because browsers refuse to send
 * a basic-auth login inside an embedded frame and the node's screen sits
 * behind one. The password shows once at creation, like a pairing code, and
 * can be revealed again from here — it is stored encrypted, not hashed.
 *
 * The consent paragraph is not decoration. This browser runs on Flock's
 * servers and holds the seller's marketplace sessions; docs/NODES.md says
 * what that changes and why a lawyer reads it before a second paying seller
 * gets one.
 */
export default function NodeCard({
  node,
  eligibility,
}: {
  node: NodeView | null;
  eligibility: NodeEligibility;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ url: string; password: string } | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const create = () =>
    start(async () => {
      setError(null);
      const outcome = await createNode();
      if (outcome.ok) {
        setFresh({ url: outcome.url, password: outcome.password });
        router.refresh();
      } else {
        setError(outcome.error);
      }
    });

  const open = (url: string) => {
    void noteNodeOpened();
    window.open(url, "_blank", "noopener");
  };

  if (!node && !eligibility.eligible) {
    return (
      <div className="notice">
        <strong>A browser that lists for you while your laptop is shut</strong>
        <p>
          {eligibility.reason}{" "}
          {eligibility.planLabel === "Lamb" && (
            <>
              See <Link href="/pricing" className="link">plans</Link>.
            </>
          )}
        </p>
      </div>
    );
  }

  // A revoked pairing or a server-side failure: the container may or may
  // not exist, but the seller's browser is not going to work until it is
  // created again, and createNode handles whatever is left of the old one.
  const dead = Boolean(node && (node.tokenRevoked || node.status === "error" || node.status === "retired"));

  if (!node || fresh || dead) {
    return (
      <>
        {error && (
          <div className="notice notice-bad">
            <strong>Couldn&apos;t create your browser</strong>
            <p>{error}</p>
          </div>
        )}

        {fresh ? (
          <div className="pairing">
            <span className="field-label">Your browser is ready</span>
            <p style={{ margin: "0 0 8px" }}>
              Open it, sign in to each marketplace once inside it, then close every tab. It
              pairs with Flock by itself. Username is the last part of the address; this is the
              password:
            </p>
            <code className="pairing-code">{fresh.password}</code>
            <div className="review-actions">
              <button type="button" className="button" onClick={() => open(fresh.url)}>
                Open your browser
              </button>
              <button type="button" className="button button-quiet" onClick={() => copy(fresh.password)}>
                {copied ? "Copied" : "Copy password"}
              </button>
              <span className="muted">You can reveal it again from this card.</span>
            </div>
          </div>
        ) : (
          <>
            {dead && node && (
              <div className="notice notice-bad">
                <strong>
                  {node.tokenRevoked
                    ? "Your browser's pairing was revoked"
                    : node.status === "retired"
                      ? "Your browser was retired"
                      : "Your browser could not be set up"}
                </strong>
                <p>
                  {node.error ?? "It will not pick up any fills until it is created again."}{" "}
                  Creating it again replaces it; you will sign in to your marketplaces once more.
                </p>
              </div>
            )}
            <div className="notice notice-warn">
              <strong>Before you create one, know what it is</strong>
              <p>
                This browser runs on Flock&apos;s servers, not your machine, and holds the
                marketplace sessions you sign in to inside it. Flock never sees a password: you
                type them into the browser itself. Marketplaces may treat listings from a hosted
                browser differently from ones made on your own laptop, and Facebook and Mercari
                in particular are stricter. Facebook and Mercari listings always wait for you to
                press the final button; Depop, Vinted and Grailed can publish by themselves only
                if you switch that on.
              </p>
            </div>
            <div className="review-actions" style={{ margin: "18px 0" }}>
              <button type="button" className="button" onClick={create} disabled={pending}>
                {pending
                  ? "Creating… this takes about a minute"
                  : dead
                    ? "Create it again"
                    : "Create my browser"}
              </button>
            </div>
          </>
        )}
      </>
    );
  }

  const state = node.status;
  const live = node.liveness;
  const pillClass =
    state === "ready" && live.state === "fresh"
      ? "pill pill-on"
      : state === "error" || live.state === "silent"
        ? "pill pill-danger"
        : "pill";
  const pillText =
    state === "ready"
      ? live.state === "fresh"
        ? "running"
        : live.state === "never"
          ? "starting"
          : live.state
      : state;

  return (
    <div className="notice">
      {error && (
        <div className="notice notice-bad">
          <strong>That didn&apos;t work</strong>
          <p>{error}</p>
        </div>
      )}

      <strong>
        Your browser <span className={pillClass}>{pillText}</span>
      </strong>
      <p className="muted">{live.detail}</p>
      {node.error && <p className="muted">Last error: {node.error}</p>}

      <div className="review-actions">
        <button type="button" className="button button-sm" onClick={() => open(node.url)}>
          Open your browser →
        </button>

        {shown ? (
          <code className="pairing-code" style={{ fontSize: 13 }}>{shown}</code>
        ) : (
          <button
            type="button"
            className="button button-sm button-quiet"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const outcome = await revealNodePassword();
                if (outcome.ok) setShown(outcome.password);
                else setError(outcome.error);
              })
            }
          >
            Show password
          </button>
        )}

        <button
          type="button"
          className="button button-sm button-quiet"
          disabled={pending || (state !== "ready" && state !== "paused")}
          onClick={() =>
            start(async () => {
              setError(null);
              const outcome = await setNodePaused(state !== "paused");
              if (!outcome.ok) setError(outcome.error ?? "Couldn't change that.");
              router.refresh();
            })
          }
        >
          {state === "paused" ? "Resume" : "Pause"}
        </button>
      </div>

      <label className="checkline" style={{ marginTop: 12 }}>
        <input
          type="checkbox"
          checked={node.autoSubmit}
          disabled={pending}
          onChange={(e) =>
            start(async () => {
              setError(null);
              const outcome = await setNodeAutoSubmit(e.target.checked);
              if (!outcome.ok) setError(outcome.error ?? "Couldn't change that.");
              router.refresh();
            })
          }
        />
        <span>
          Let it press publish on Depop, Vinted and Grailed when a form fills cleanly.
          <span className="muted"> Never on Facebook or Mercari — those wait for you.</span>
        </span>
      </label>

      <p className="muted" style={{ marginTop: 10, fontSize: 12.5 }}>
        Address: <code>{node.url}</code> · username <code>{node.slug}</code>. Sign in to each
        marketplace once inside it and close every tab. Paused, it keeps its sessions but takes
        no work.
      </p>
    </div>
  );
}
