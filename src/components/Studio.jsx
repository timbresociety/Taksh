"use client";

import { useEffect, useRef, useState } from "react";
import { unlockSound } from "@/lib/game/sound";
import IdeaStage from "./IdeaStage";
import BriefStage from "./BriefStage";
import CalibrateStage from "./CalibrateStage";
import PlayStage from "./PlayStage";
import ResultStage from "./ResultStage";

async function post(path, body) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

export default function Studio() {
  const [stage, setStage] = useState("idea");
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState({ idea: "", clarification: "" });
  const [intent, setIntent] = useState(null);
  const [game, setGame] = useState(null);
  const [mode, setMode] = useState("keyboard");
  const [calibration, setCalibration] = useState(null);
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(null);
  const feed = useRef(null);

  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => setStatus(null));
    return () => feed.current?.stop();
  }, []);

  async function attempt(label, work) {
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

  async function generate(idea, clarification, brief) {
    const generated = await post("/api/generate", { idea, clarification, brief });
    if (!generated.ok) throw new Error(`The generated game failed validation after a repair: ${generated.errors[0]}`);
    setGame(generated);
    setRevision(null);
    setStage("brief");
  }

  const submitIdea = (idea, clarification) =>
    attempt("Reading your idea", async () => {
      setDraft({ idea, clarification: clarification ?? "" });
      const reading = await post("/api/intent", { idea, clarification });
      setIntent(reading);
      if (reading.status === "ready") {
        setBusy("Building your game");
        await generate(idea, clarification, reading.brief);
      }
    });

  const acceptClosest = () =>
    attempt("Building the closest game", () => generate(draft.idea, draft.clarification || undefined, intent.brief));

  const reviseIdea = () => {
    setIntent(null);
    setError(null);
  };

  function startPlay(nextMode) {
    unlockSound();
    setMode(nextMode);
    setResult(null);
    if (nextMode === "camera" && !calibration) setStage("calibrate");
    else setStage("play");
  }

  const reviseGame = (request) =>
    attempt("Changing your game", async () => {
      const revised = await post("/api/revise", { spec: game.spec, request });
      if (!revised.ok) throw new Error(`That change didn't take: ${revised.errors[0]}`);
      setRevision({ ...revised, request });
      setGame((current) => ({ ...current, spec: revised.spec, source: revised.source, model: revised.model }));
    });

  const restart = () => {
    setStage("idea");
    setIntent(null);
    setGame(null);
    setRevision(null);
    setResult(null);
    setError(null);
  };

  const fixture = status?.source === "fixture";

  return (
    <div className="studio" data-stage={stage}>
      {stage !== "play" && stage !== "calibrate" && <SourceNote status={status} />}

      {stage === "idea" && (
        <IdeaStage draft={draft} intent={intent} busy={busy} error={error} fixture={fixture} onSubmit={submitIdea} onAccept={acceptClosest} onChangeIdea={reviseIdea} />
      )}
      {stage === "brief" && <BriefStage game={game} onPlay={startPlay} onBack={restart} />}
      {stage === "calibrate" && (
        <CalibrateStage
          feed={feed}
          onDone={(values) => {
            setCalibration(values);
            setStage("play");
          }}
          onKeyboard={() => {
            setMode("keyboard");
            setStage("play");
          }}
        />
      )}
      {stage === "play" && (
        <PlayStage
          key={JSON.stringify(game.spec.events) + mode}
          spec={game.spec}
          mode={mode}
          feed={feed}
          calibration={calibration}
          onRecalibrate={() => {
            setCalibration(null);
            setStage("calibrate");
          }}
          onQuit={() => setStage("brief")}
          onEnd={(outcome) => {
            setResult(outcome);
            setStage("result");
          }}
        />
      )}
      {stage === "result" && (
        <ResultStage
          game={game}
          result={result}
          revision={revision}
          busy={busy}
          error={error}
          mode={mode}
          onRevise={reviseGame}
          onPlay={startPlay}
          onNew={restart}
        />
      )}
    </div>
  );
}

function SourceNote({ status }) {
  if (!status) return null;
  if (status.source === "fixture") {
    return (
      <p className="source-note source-note--fixture" data-testid="source-note">
        Fixture mode. No model is connected, so games come from canned examples, not from your words.
      </p>
    );
  }
  return (
    <p className="source-note" data-testid="source-note">
      Generating with {status.model}
    </p>
  );
}
