"use client";

import { useEffect, useState } from "react";
import { EXPLORER, MAX_NAME, specHash } from "@/lib/arkiv/schema";
import { templateInfo } from "@/lib/templates";

const NAME_KEY = "taksh.player";

async function call(path, body) {
  const response = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await response.json().catch(() => ({ error: "Arkiv did not respond." }));
  if (!response.ok) throw new Error(data.error);
  return data;
}

// The board is read live from Arkiv every time it opens, and again after a post.
export default function ArkivBoard({ spec, result, mode, source, cover }) {
  const [hash, setHash] = useState(null);
  const [scope, setScope] = useState("template");
  const [cameraOnly, setCameraOnly] = useState(false);
  const [board, setBoard] = useState(null);
  const [name, setName] = useState("");
  const [posted, setPosted] = useState(null);
  const [published, setPublished] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setName(localStorage.getItem(NAME_KEY) ?? "");
    specHash(spec).then(setHash, () => setHash(null)); // crypto.subtle needs localhost or HTTPS
  }, [spec]);

  useEffect(() => {
    const params = new URLSearchParams({ template: spec.template });
    if (scope === "look") {
      params.set("world", spec.skin.world);
      params.set("style", spec.skin.style);
    }
    if (scope === "game" && hash) params.set("hash", hash);
    if (cameraOnly) params.set("mode", "camera");
    let live = true;
    setBoard(null);
    call(`/api/arkiv/scores?${params}`).then(
      (data) => live && setBoard(data),
      (failure) => live && setBoard({ available: false, error: failure.message }),
    );
    return () => {
      live = false;
    };
  }, [spec, scope, hash, cameraOnly, posted]);

  async function run(label, work) {
    setBusy(label);
    setError(null);
    try {
      await work();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(null);
    }
  }

  const postScore = () =>
    run("Writing to Arkiv", async () => {
      localStorage.setItem(NAME_KEY, name);
      setPosted(await call("/api/arkiv/scores", { spec, result, mode, player: name }));
    });

  const publish = () => run("Publishing", async () => setPublished(await call("/api/arkiv/games", { spec, author: name, source, cover })));

  const templateName = templateInfo(spec.template)?.name ?? spec.template;

  return (
    <section className="result__revise" data-testid="arkiv-board" aria-labelledby="board-title">
      <h2 id="board-title">Leaderboard</h2>
      <div className="examples" role="group" aria-label="Which scores">
        <button type="button" className="chip" aria-pressed={scope === "template"} onClick={() => setScope("template")}>All {templateName}</button>
        <button type="button" className="chip" aria-pressed={scope === "look"} onClick={() => setScope("look")}>{spec.skin.world}, {spec.skin.style}</button>
        <button type="button" className="chip" aria-pressed={scope === "game"} disabled={!hash} onClick={() => setScope("game")}>This exact game</button>
        <label className="chip">
          <input type="checkbox" checked={cameraOnly} onChange={(event) => setCameraOnly(event.target.checked)} /> Camera only
        </label>
      </div>

      {!board && <p>Reading from Arkiv</p>}
      {board?.available === false && <p className="error" role="status">Leaderboard unavailable: {board.error}</p>}
      {board?.rows && board.rows.length === 0 && <p>No scores here yet. Post yours first.</p>}
      {board?.rows?.length > 0 && (
        <table className="controls" data-testid="board-rows">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Player</th>
              <th scope="col">Score</th>
              <th scope="col">World</th>
              <th scope="col">Played with</th>
            </tr>
          </thead>
          <tbody>
            {board.rows.map((row, index) => (
              <tr key={row.key} aria-current={row.key === posted?.key ? "true" : undefined} style={row.key === posted?.key ? { fontWeight: 700 } : undefined}>
                <td>{index + 1}</td>
                <td>{row.player}</td>
                <td>{row.score}</td>
                <td>{row.world}, {row.style}</td>
                <td>{row.mode}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {board?.rows && <p className="fixture-hint">{board.count} scores match, read at block {board.block}.</p>}

      {!posted ? (
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            postScore();
          }}
        >
          <label className="visually-hidden" htmlFor="player-name">Your name</label>
          <input id="player-name" value={name} maxLength={MAX_NAME} placeholder="Your name" onChange={(event) => setName(event.target.value)} />
          <button className="button" type="submit" disabled={Boolean(busy) || board?.available === false}>
            {busy === "Writing to Arkiv" ? busy : `Post ${result.score}`}
          </button>
        </form>
      ) : (
        <p data-testid="posted">
          Posted. You are #{posted.rank} of {posted.total} on {templateName}.{" "}
          <a href={`${EXPLORER}/tx/${posted.txHash}`} target="_blank" rel="noreferrer">See the transaction</a>
        </p>
      )}

      <div className="answers">
        {published ? (
          <p data-testid="published">
            {published.existing ? "Already shared at " : "Shared at "}
            <a href={published.url}>{published.url.slice(0, 18)}…</a>
            {published.swarm && <>. Cover and spec on <a href={published.swarm} target="_blank" rel="noreferrer">Swarm</a></>}
          </p>
        ) : (
          <button type="button" className="text-button" disabled={Boolean(busy) || board?.available === false} onClick={publish}>
            {busy === "Publishing" ? busy : "Publish this game"}
          </button>
        )}
        <a className="text-button" href="/games">Shared games</a>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {board?.query && (
        <details className="spec-json">
          <summary>Query sent to Arkiv</summary>
          <pre>{board.query}</pre>
        </details>
      )}
    </section>
  );
}
