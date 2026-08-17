"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import AddressForm from "./AddressForm";
import { deleteAddress, makeDefaultAddress, type AddressRow } from "@/app/actions";

export default function AddressBook({ addresses }: { addresses: AddressRow[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(addresses.length === 0);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const act = (fn: () => Promise<void>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  const oneLine = (a: AddressRow) =>
    [a.line1, a.line2, a.city, a.state, a.postcode, a.country].filter(Boolean).join(", ");

  return (
    <>
      {addresses.length === 0 && !adding && (
        <div className="notice notice-warn">
          <strong>No address yet</strong>
          <p>Depop and Mercari both block a listing until the account has a ship-from address.</p>
        </div>
      )}

      {addresses.length > 0 && (
        <div className="addressbook">
          {addresses.map((address) =>
            editing === address.id ? (
              <div key={address.id} className="addresscard">
                <AddressForm address={address} onDone={() => setEditing(null)} />
              </div>
            ) : (
              <div key={address.id} className="addresscard">
                <div className="addresscard-head">
                  <span className="addresscard-label">
                    {address.label ?? "Address"}
                    {address.is_default && <span className="badge badge-listed">default</span>}
                  </span>
                  <div className="addresscard-actions">
                    {!address.is_default && (
                      <button
                        type="button"
                        className="copy"
                        disabled={pending}
                        onClick={() => act(() => makeDefaultAddress(address.id))}
                      >
                        Make default
                      </button>
                    )}
                    <button type="button" className="copy" onClick={() => setEditing(address.id)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="copy"
                      disabled={pending}
                      onClick={() => act(() => deleteAddress(address.id))}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <p className="addresscard-body">{oneLine(address)}</p>
                {address.name && <p className="addresscard-body muted">{address.name}</p>}
              </div>
            )
          )}
        </div>
      )}

      {adding ? (
        <div className="addresscard">
          <AddressForm onDone={() => setAdding(false)} />
        </div>
      ) : (
        <div className="review-actions" style={{ marginTop: 16 }}>
          <button type="button" className="button" onClick={() => setAdding(true)}>
            Add an address
          </button>
          <span className="muted">
            The default is the one the extension enters into Depop and Mercari.
          </span>
        </div>
      )}
    </>
  );
}
