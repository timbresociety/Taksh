"use client";

import { useState } from "react";

const EXAMPLES = [
  "Pixel art goalkeeper saving penalties in a packed stadium",
  "Escape a giant robot in a comic book factory",
  "A neon boxing workout where I punch glowing pads",
];

export default function IdeaStage({ draft, intent, busy, error, fixture, onSubmit, onAccept, onChangeIdea }) {
  const [idea, setIdea] = useState(draft.idea);
  const [answer, setAnswer] = useState("");

  const asking = intent?.status === "clarify";
  const unsupported = intent?.status === "unsupported";

  return (
    <main className="court">
      <CourtLines />
      <header className="court__mark">Taksh</header>

      {!asking && !unsupported && (
        <form
          className="centre-circle"
          onSubmit={(event) => {
            event.preventDefault();
            if (idea.trim()) onSubmit(idea.trim());
          }}
        >
          <h1>Say a game. Play it with your body.</h1>
          <label className="visually-hidden" htmlFor="idea">
            Your game idea
          </label>
          <textarea
            id="idea"
            value={idea}
            rows={3}
            maxLength={500}
            placeholder="A goalkeeper who saves shots by stepping side to side"
            onChange={(event) => setIdea(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (idea.trim()) onSubmit(idea.trim());
              }
            }}
          />
          <button className="button button--go" type="submit" disabled={Boolean(busy) || !idea.trim()}>
            {busy ?? "Make my game"}
          </button>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="examples">
            {EXAMPLES.map((example) => (
              <button key={example} type="button" className="chip" onClick={() => setIdea(example)}>
                {example}
              </button>
            ))}
          </div>
        </form>
      )}

      {asking && (
        <section className="centre-circle" data-testid="clarify">
          <p className="quoted-idea">{draft.idea}</p>
          <h2>{intent.question}</h2>
          <div className="answers">
            {intent.options.map((option) => (
              <button key={option} type="button" className="button" disabled={Boolean(busy)} onClick={() => onSubmit(draft.idea, option)}>
                {option}
              </button>
            ))}
          </div>
          <form
            className="inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (answer.trim()) onSubmit(draft.idea, answer.trim());
            }}
          >
            <label className="visually-hidden" htmlFor="answer">
              Your answer
            </label>
            <input id="answer" value={answer} maxLength={200} placeholder="Or answer in your own words" onChange={(event) => setAnswer(event.target.value)} />
            <button className="button" type="submit" disabled={Boolean(busy) || !answer.trim()}>
              Answer
            </button>
          </form>
          {busy && <p className="busy">{busy}</p>}
          {error && <p className="error" role="alert">{error}</p>}
        </section>
      )}

      {unsupported && (
        <section className="centre-circle" data-testid="unsupported">
          <h2>{intent.message}</h2>
          <p className="closest">{intent.unsupported.closest}</p>
          <div className="answers">
            <button type="button" className="button button--go" disabled={Boolean(busy)} onClick={onAccept}>
              {busy ?? "Play this version"}
            </button>
            <button type="button" className="button" disabled={Boolean(busy)} onClick={onChangeIdea}>
              Change my idea
            </button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
        </section>
      )}

      {fixture && !asking && !unsupported && (
        <p className="fixture-hint">Fixture mode recognises goalkeepers, robots, boxing and hurdles, plus style words like pixel, comic, paper, chalk, watercolour and neon.</p>
      )}
    </main>
  );
}

// The page is the game's own floor plan: three lanes running at you, with the idea at centre court.
function CourtLines() {
  return (
    <svg className="court__lines" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke">
        <path d="M430 0 L60 1000" vectorEffect="non-scaling-stroke" />
        <path d="M477 0 L360 1000" vectorEffect="non-scaling-stroke" />
        <path d="M523 0 L640 1000" vectorEffect="non-scaling-stroke" />
        <path d="M570 0 L940 1000" vectorEffect="non-scaling-stroke" />
        <path d="M0 880 H1000" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}
