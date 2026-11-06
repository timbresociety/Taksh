"use client";

import { useEffect, useState } from "react";

const EXPLORER = "https://chainscan-galileo.0g.ai";
const sent = new WeakMap(); // one upload per episode, even when React mounts this twice

// After a round against the 0G rival: what its brain decided, and where the round lives on 0G Storage.
export default function RivalEpisode({ episode }) {
  const [stored, setStored] = useState(null);
  const decided = episode.decisions.filter((decision) => decision.requestId);
  const stops = episode.decisions.length - decided.length;
  const cost = decided.reduce((sum, decision) => sum + (decision.costUsd ?? 0), 0);
  const last = decided.at(-1);

  useEffect(() => {
    if (!sent.has(episode)) {
      sent.set(episode, fetch("/api/rival/episode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(episode) }).then((r) => r.json()));
    }
    sent.get(episode).then(setStored).catch(() => setStored({ error: "0G Storage did not respond." }));
  }, [episode]);

  return (
    <div className="rival-episode" data-testid="rival-episode">
      <p>
        The rival made {decided.length} {decided.length === 1 ? "decision" : "decisions"} on 0G (${cost.toFixed(4)})
        {stops > 0 && `, and held its guard ${stops} ${stops === 1 ? "time" : "times"} when 0G did not answer`}.
        {last?.read && <> Its read on you: “{last.read}”</>}
      </p>
      {!stored && <p>Saving this round to 0G Storage…</p>}
      {stored?.txHash && (
        <p>
          Saved on 0G Storage. Root <code>{stored.rootHash.slice(0, 12)}…</code>{" "}
          <a href={`${EXPLORER}/tx/${stored.txHash}`} target="_blank" rel="noreferrer">See the transaction</a>
        </p>
      )}
      {stored?.rival && (
        <p>
          The rival&apos;s ENS name is <code>{stored.rival}</code>. The server is setting its <code>taksh.rival.last-episode</code> record to this round.
        </p>
      )}
      {stored?.error && <p className="rival-episode__error">{stored.error}{stored.rootHash && <> Root <code>{stored.rootHash.slice(0, 12)}…</code></>}</p>}
    </div>
  );
}
