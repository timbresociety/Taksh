"use client";

import { useState } from "react";
import { TEMPLATES } from "@/lib/templates";
import MicButton from "./MicButton";
import DailyCard from "./DailyCard";

const EXAMPLES = [
  "A pixel goalkeeper saving shots in the forest",
  "Boxing a rival on a space station, comic style",
  "Flying through hoops at sunset",
];

export default function IdeaStage({ draft, intent, busy, error, fixture, voice, onSubmit, onAccept, onChangeIdea, onPick }) {
  const [idea, setIdea] = useState(draft.idea);
  const [answer, setAnswer] = useState("");
  const [micError, setMicError] = useState(null);

  const asking = intent?.status === "clarify";
  const unsupported = intent?.status === "unsupported";

  return (
    <main className="shelf-page">
      <header className="court__mark">Taksh</header>

      {!asking && !unsupported && (
        <>
          <form
            className="pitch"
            onSubmit={(event) => {
              event.preventDefault();
              if (idea.trim()) onSubmit(idea.trim());
            }}
          >
            <h1>Say a game. Play it with your body.</h1>
            <label className="visually-hidden" htmlFor="idea">
              Your game idea
            </label>
            <div className="pitch__box">
              <textarea
                id="idea"
                value={idea}
                rows={2}
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
              {voice && <MicButton disabled={Boolean(busy)} onText={setIdea} onError={setMicError} />}
              <button className="button button--go" type="submit" disabled={Boolean(busy) || !idea.trim()}>
                {busy ?? "Make my game"}
              </button>
            </div>
            {(error || micError) && <p className="error" role="alert">{error || micError}</p>}
            <div className="examples">
              {EXAMPLES.map((example) => (
                <button key={example} type="button" className="chip" onClick={() => setIdea(example)}>
                  {example}
                </button>
              ))}
            </div>
            {fixture && <p className="fixture-hint">Fixture mode matches keywords such as run, box, fly, pose, Mumbai, Diwali, neon and pixel.</p>}
          </form>

          <DailyCard />

          <section className="shelf" aria-labelledby="shelf-title">
            <h2 id="shelf-title">Or start from a game</h2>
            <a className="text-button" href="/games">Or play one someone shared</a>
            <ul data-testid="shelf">
              {TEMPLATES.map((template) => (
                <li key={template.id}>
                  <button type="button" className="game-card" data-template={template.id} onClick={() => onPick(template.id)}>
                    <img src={`/previews/game-${template.id}.webp`} alt="" width="640" height="360" loading="lazy" />
                    <span className="game-card__name">{template.name}</span>
                    <span className="game-card__pitch">{template.pitch}</span>
                    <span className="game-card__facts">
                      <span>{template.kind}</span>
                      <span>{template.length}</span>
                      <span>{template.space}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {asking && (
        <section className="pitch pitch--question" data-testid="clarify">
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
        <section className="pitch pitch--question" data-testid="unsupported">
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
    </main>
  );
}
