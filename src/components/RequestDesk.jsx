"use client";

// Where a player asks for something the game does not have yet. The request runs on the server for as
// long as it takes; this panel polls for it, survives a reload, and keeps what was made in a small
// library on this device so it can be picked again later.
import { useCallback, useEffect, useState } from "react";

const KINDS = [
  { id: null, label: "Anything" },
  { id: "world", label: "World" },
  { id: "style", label: "Art style" },
  { id: "character", label: "Character" },
  { id: "boss", label: "Boss" },
  { id: "game", label: "Game" },
];
const STAGES = [
  { id: "queued", label: "Waiting for a turn" },
  { id: "reading", label: "Reading your request" },
  { id: "drafting", label: "Making it" },
  { id: "checking", label: "Checking it works" },
  { id: "fixing", label: "Fixing what the checks found" },
];
const PENDING_KEY = "taksh.requests";
const LIBRARY_KEY = "taksh.made";
const GIVE_UP_MS = 20 * 60 * 1000; // a run that is still going after this is left to finish on its own

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function readLibrary() {
  return read(LIBRARY_KEY, { world: [], style: [], character: [] });
}
function remember(result) {
  const library = readLibrary();
  const list = library[result.kind] ?? [];
  const key = result.item.id ?? result.item.name;
  library[result.kind] = [result.item, ...list.filter((item) => (item.id ?? item.name) !== key)].slice(0, 12);
  write(LIBRARY_KEY, library);
}

const KIND_NOUN = { world: "world", style: "art style", character: "character", boss: "boss", game: "game" };

export default function RequestDesk({ onUse, onStandIn }) {
  const [kind, setKind] = useState(null);
  const [text, setText] = useState("");
  const [request, setRequest] = useState(null); // { id, startedAt, progress, result }
  const [error, setError] = useState(null);

  // A request in flight when the page was closed picks up where it was.
  useEffect(() => {
    const pending = read(PENDING_KEY, null);
    if (pending?.id && Date.now() - pending.startedAt < GIVE_UP_MS) setRequest({ ...pending, progress: null, result: null });
  }, []);

  const poll = useCallback(async (id) => {
    const response = await fetch(`/api/requests/${id}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "The request was lost.");
    return body;
  }, []);

  useEffect(() => {
    if (!request?.id || request.result) return;
    let alive = true;
    let timer = 0;
    let wait = 2000;
    const tick = async () => {
      try {
        const progress = await poll(request.id);
        if (!alive) return;
        if (progress.result) {
          write(PENDING_KEY, null);
          if (progress.result.status === "ready" && progress.result.item) remember(progress.result);
          setRequest((current) => ({ ...current, progress, result: progress.result }));
          return;
        }
        setRequest((current) => ({ ...current, progress }));
      } catch (problem) {
        if (!alive) return;
        if (Date.now() - request.startedAt > 60000) {
          write(PENDING_KEY, null);
          setRequest(null);
          setError(problem.message);
          return;
        }
      }
      if (Date.now() - request.startedAt > GIVE_UP_MS) {
        setError("This one is taking very long. It keeps going on our side; come back to it later.");
        return;
      }
      wait = Math.min(8000, wait * 1.3); // a busy model can take minutes, so ask less often as it goes
      timer = setTimeout(tick, wait);
    };
    timer = setTimeout(tick, 1200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [request?.id, request?.result, request?.startedAt, poll]);

  async function send(event) {
    event.preventDefault();
    setError(null);
    try {
      const response = await fetch("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, kind }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The request could not be sent.");
      const started = { id: body.id, startedAt: Date.now(), text, kind };
      write(PENDING_KEY, started);
      setRequest({ ...started, progress: null, result: null });
    } catch (problem) {
      setError(problem.message);
    }
  }

  const reset = () => {
    write(PENDING_KEY, null);
    setRequest(null);
    setText("");
  };

  const busy = request && !request.result;
  const stage = request?.progress?.stage ?? "queued";
  const result = request?.result;

  return (
    <section className="desk" aria-labelledby="desk-title" data-testid="request-desk">
      <h2 id="desk-title">Ask for something new</h2>

      {!request && (
        <form className="desk__form" onSubmit={send}>
          <div className="who" role="group" aria-label="What to make">
            {KINDS.map((item) => (
              <button key={item.label} type="button" className="chip" aria-pressed={kind === item.id} onClick={() => setKind(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          <label className="visually-hidden" htmlFor="desk-text">What should we make?</label>
          <textarea
            id="desk-text"
            rows={3}
            maxLength={600}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="A Goa beach at sunset, a black-and-white noir look, a ten-armed monsoon robot boss…"
          />
          <button className="button" type="submit" disabled={!text.trim()}>
            Send request
          </button>
          <p className="desk__hint">Worlds, art styles and characters are ready to play when they're done. Bosses and new games go to the builders, and you get the closest one to play now.</p>
        </form>
      )}

      {busy && (
        <div className="desk__wait" role="status" aria-live="polite">
          <p className="desk__asked">“{request.text}”</p>
          <ol className="desk__stages">
            {STAGES.filter((item) => item.id !== "fixing" || stage === "fixing").map((item) => (
              <li key={item.id} data-state={item.id === stage ? "now" : STAGES.findIndex((other) => other.id === item.id) < STAGES.findIndex((other) => other.id === stage) ? "done" : "next"}>
                {item.label}
              </li>
            ))}
          </ol>
          <p className="desk__hint">This can take a few minutes. Keep playing; it carries on without you and will be here when you're back.</p>
        </div>
      )}

      {result && <Outcome result={result} onUse={onUse} onStandIn={onStandIn} onAgain={reset} />}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

function Outcome({ result, onUse, onStandIn, onAgain }) {
  const noun = KIND_NOUN[result.kind] ?? "request";
  if (result.status === "ready") {
    const name = result.item.label ?? result.item.name;
    return (
      <div className="desk__done" data-testid="request-ready">
        <p className="desk__name">{name}</p>
        <p>{result.item.blurb}</p>
        {result.note && <p className="desk__hint">{result.note}</p>}
        {result.needs?.length > 0 && <p className="desk__hint">Still to come: {result.needs.join("; ")}.</p>}
        <div className="answers">
          <button type="button" className="button button--go" onClick={() => onUse(result)}>
            {result.kind === "character" ? "Play as this character" : `Use this ${noun}`}
          </button>
          <button type="button" className="text-button" onClick={onAgain}>Ask for something else</button>
        </div>
      </div>
    );
  }
  if (result.status === "queued") {
    return (
      <div className="desk__done" data-testid="request-queued">
        <p className="desk__name">{result.item.name}</p>
        <p>{result.item.pitch}</p>
        <p className="desk__hint">A new {noun} needs building, so your design has gone to the builders.{result.standIn ? ` Until then, the closest is ${result.standIn.label}.` : ""}</p>
        <div className="answers">
          {result.standIn && (
            <button type="button" className="button button--go" onClick={() => onStandIn(result.standIn)}>
              Play {result.standIn.label}
            </button>
          )}
          <button type="button" className="text-button" onClick={onAgain}>Ask for something else</button>
        </div>
      </div>
    );
  }
  return (
    <div className="desk__done" data-testid="request-failed">
      <p>{result.message ?? "That one didn't work out. Try asking in other words."}</p>
      <button type="button" className="text-button" onClick={onAgain}>Try again</button>
    </div>
  );
}
