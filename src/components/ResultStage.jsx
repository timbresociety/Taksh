"use client";

import { useState } from "react";

const SUGGESTIONS = ["Give me more time to dodge", "Make it harder", "Switch it to chalk"];

const HEADLINES = { win: "You did it", lose: "Not this time", complete: "Round over" };

function formatValue(value, unit) {
  if (unit === "ms") return `${(value / 1000).toFixed(1)}s`;
  return `${value}${unit}`;
}

export default function ResultStage({ game, result, revision, busy, error, mode, onRevise, onPlay, onNew }) {
  const [request, setRequest] = useState("");
  const { spec } = game;
  const { theme } = spec;

  return (
    <main className="result">
      <section className="result__score">
        <h1 data-testid="result-headline">{HEADLINES[result.outcome]}</h1>
        <p className="result__number" data-testid="result-score">{result.score}</p>
        <dl className="tally">
          <div>
            <dt>{theme.hitText}</dt>
            <dd>{result.tally.hit}</dd>
          </div>
          <div>
            <dt>{theme.missText}</dt>
            <dd>{result.tally.miss}</dd>
          </div>
          <div>
            <dt>{theme.avoidText}</dt>
            <dd>{result.tally.avoid}</dd>
          </div>
          <div>
            <dt>{theme.hurtText}</dt>
            <dd>{result.tally.hurt}</dd>
          </div>
        </dl>
      </section>

      <section className="result__revise">
        <h2>What should change?</h2>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (request.trim()) onRevise(request.trim());
          }}
        >
          <label className="visually-hidden" htmlFor="revision">
            Change to make
          </label>
          <input id="revision" value={request} maxLength={300} placeholder="Give me more time to dodge" onChange={(event) => setRequest(event.target.value)} />
          <button className="button" type="submit" disabled={Boolean(busy) || !request.trim()}>
            {busy ?? "Change it"}
          </button>
        </form>
        <div className="examples">
          {SUGGESTIONS.map((suggestion) => (
            <button key={suggestion} type="button" className="chip" onClick={() => setRequest(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
        {error && <p className="error" role="alert">{error}</p>}

        {revision && (
          <div className="revision" data-testid="revision">
            <p>{revision.changeSummary}</p>
            {revision.comparison.changes.length > 0 && (
              <table className="controls">
                <thead>
                  <tr>
                    <th scope="col">Measured</th>
                    <th scope="col">Before</th>
                    <th scope="col">Now</th>
                  </tr>
                </thead>
                <tbody>
                  {revision.comparison.changes.map((change) => (
                    <tr key={change.key}>
                      <td>{change.label}</td>
                      <td>{formatValue(change.before, change.unit)}</td>
                      <td>{formatValue(change.after, change.unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <div className="answers">
          <button type="button" className="button button--go" onClick={() => onPlay(mode)}>
            {revision ? "Play the new version" : "Play again"}
          </button>
          <button type="button" className="text-button" onClick={onNew}>
            Start a new idea
          </button>
        </div>
        <details className="spec-json">
          <summary>GameSpec</summary>
          <pre>{JSON.stringify(spec, null, 2)}</pre>
        </details>
      </section>
    </main>
  );
}
