"use client";

import { useEffect, useState } from "react";
import { slugLabel } from "@/lib/ens/records";

const safeSlug = (text) => {
  try {
    return slugLabel(text);
  } catch {
    return "";
  }
};

// Publishes the current spec as an ENSv2 subname. When ENS is not configured the game still plays,
// and this panel says why publishing is off.
export default function PublishGame({ spec }) {
  const [ens, setEns] = useState(null);
  const [label, setLabel] = useState(() => safeSlug(spec.title));
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [published, setPublished] = useState(null);

  useEffect(() => {
    fetch("/api/ens").then((r) => r.json()).then(setEns).catch(() => setEns({ available: false, reason: "the server did not answer." }));
  }, []);

  if (!ens) return null;
  if (!ens.available) return <p className="fixture-hint" data-testid="ens-unavailable">Publishing to ENS is unavailable: {ens.reason}</p>;

  async function publish(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/ens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec, label, owner }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPublished(data);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  const tx = (hash) => (published.explorer ? <a href={`${published.explorer}/tx/${hash}`} target="_blank" rel="noreferrer">{hash.slice(0, 10)}…</a> : hash);

  return (
    <section className="revision" data-testid="ens-publish">
      <h2>Give this game a name</h2>
      {published ? (
        <>
          <p>
            Published as <a href={`/play/${published.name}`} data-testid="ens-name">{published.name}</a>. Anyone can play it from that name.
          </p>
          <p>
            Owner {published.owner}. Resolver {tx(published.txs.resolver)}, registration {tx(published.txs.register)}.
          </p>
        </>
      ) : (
        <form className="inline-form" onSubmit={publish}>
          <label className="visually-hidden" htmlFor="ens-label">Name</label>
          <input id="ens-label" value={label} maxLength={40} onChange={(event) => setLabel(event.target.value)} placeholder="moon-hop" />
          <span>.{ens.parent}</span>
          <label className="visually-hidden" htmlFor="ens-owner">Owner address</label>
          <input id="ens-owner" value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="Owner 0x address, or blank for the parent owner" />
          <button className="button" type="submit" disabled={busy || !safeSlug(label)}>
            {busy ? "Publishing, two transactions" : "Publish to ENS"}
          </button>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
