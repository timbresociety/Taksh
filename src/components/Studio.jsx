"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { unlockSound } from "@/lib/game/sound";
import { starterSpec } from "@/lib/spec/starter";
import { templateInfo } from "@/lib/templates";
import IdeaStage from "./IdeaStage";
import BriefStage from "./BriefStage";
import CalibrateStage from "./CalibrateStage";
import PlayStage from "./PlayStage";
import PracticeStage from "./PracticeStage";
import ResultStage from "./ResultStage";

async function post(path, body) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

// initialGame opens straight on the brief, as a shared game from Arkiv does.
export default function Studio({ initialGame = null }) {
  const [stage, setStage] = useState(initialGame ? "brief" : "idea");
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState({ idea: "", clarification: "" });
  const [intent, setIntent] = useState(null);
  const [game, setGame] = useState(initialGame);
  const [mode, setMode] = useState("keyboard");
  const [calibration, setCalibration] = useState(null);
  const [practised, setPractised] = useState({});
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(null);
  const [playCount, setPlayCount] = useState(0);
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

  // traces are 0G receipts. The intent step's receipt is kept so the game's total cost is complete.
  async function generate(idea, clarification, brief, earlier = []) {
    const generated = await post("/api/generate", { idea, clarification, brief });
    if (!generated.ok) throw new Error(`The generated game failed validation after a repair: ${generated.errors[0]}`);
    setGame({ ...generated, traces: [...earlier, ...(generated.traces ?? [])] });
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
        await generate(idea, clarification, reading.brief, reading.traces);
      }
    });

  const acceptClosest = () =>
    attempt("Building the closest game", () => generate(draft.idea, draft.clarification || undefined, intent.brief, intent.traces));

  const reviseIdea = () => {
    setIntent(null);
    setError(null);
  };

  const pickGame = (id) => {
    setGame({ spec: starterSpec(id), source: "template" });
    setRevision(null);
    setStage("brief");
  };

  const changeSkin = (change) => setGame((current) => ({ ...current, spec: { ...current.spec, skin: { ...current.spec.skin, ...change } } }));

  // A calibration taken for an arms-only game has not seen the legs, so a full-body game needs its own.
  function startPlay(nextMode) {
    unlockSound();
    setMode(nextMode);
    setResult(null);
    setPlayCount((count) => count + 1);
    const framing = templateInfo(game.spec.template).framing;
    if (nextMode === "camera" && calibration?.framing !== framing) setStage("calibrate");
    else setStage(afterSetup());
  }

  // The moves are taught once per game; a replay goes straight in. A game that shows each move as it
  // calls it needs no lesson first.
  const afterSetup = () => (practised[game.spec.template] || templateInfo(game.spec.template).teachesItsOwnMoves ? "play" : "practice");

  const finishPractice = useCallback((levels) => {
    setPractised((current) => ({ ...current, [game.spec.template]: levels }));
    setStage("play");
  }, [game]);

  const reviseGame = (request) =>
    attempt("Changing your game", async () => {
      const revised = await post("/api/revise", { spec: game.spec, request });
      if (!revised.ok) throw new Error(`That change didn't take: ${revised.errors[0]}`);
      setRevision({ ...revised, request });
      setGame((current) => ({ ...current, spec: revised.spec, source: revised.source, model: revised.model, traces: [...(current.traces ?? []), ...(revised.traces ?? [])] }));
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
      {stage !== "play" && stage !== "calibrate" && stage !== "practice" && <SourceNote status={status} game={stage === "idea" ? null : game} />}

      {stage === "idea" && (
        <IdeaStage draft={draft} intent={intent} busy={busy} error={error} fixture={fixture} voice={status?.source === "0g"} onSubmit={submitIdea} onAccept={acceptClosest} onChangeIdea={reviseIdea} onPick={pickGame} />
      )}
      {stage === "brief" && <BriefStage game={game} onChangeSkin={changeSkin} onPlay={startPlay} onBack={restart} />}
      {stage === "calibrate" && (
        <CalibrateStage
          feed={feed}
          framing={templateInfo(game.spec.template).framing}
          onDone={(values) => {
            setCalibration({ ...values, framing: templateInfo(game.spec.template).framing });
            setStage(afterSetup());
          }}
          onKeyboard={() => {
            setMode("keyboard");
            setStage(afterSetup());
          }}
        />
      )}
      {stage === "practice" && (
        <PracticeStage
          spec={game.spec}
          mode={mode}
          feed={feed}
          calibration={calibration}
          onDone={finishPractice}
        />
      )}
      {stage === "play" && (
        <PlayStage
          key={JSON.stringify(game.spec) + mode + playCount}
          spec={game.spec}
          mode={mode}
          feed={feed}
          calibration={calibration}
          personal={practised[game.spec.template]}
          rival={status?.source === "0g" ? "0g" : undefined}
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

function SourceNote({ status, game }) {
  if (!status) return null;
  if (status.source === "fixture") {
    return (
      <p className="source-note source-note--fixture" data-testid="source-note">
        Fixture mode. No model is connected, so games come from canned examples, not from your words.
      </p>
    );
  }
  const traces = game?.traces ?? [];
  if (traces.length) {
    const cost = traces.reduce((sum, trace) => sum + (trace.costUsd ?? 0), 0);
    const last = traces.at(-1);
    return (
      <p className="source-note source-note--0g" data-testid="source-note" title={traces.map((trace) => trace.requestId).join("\n")}>
        Built on 0G with {game.model} in a private TEE. {traces.length} {traces.length === 1 ? "call" : "calls"}, ${cost.toFixed(4)}.
        Request <code>{last.requestId.slice(0, 8)}</code>
      </p>
    );
  }
  return (
    <p className="source-note" data-testid="source-note">
      {status.source === "0g" ? `Generating on 0G with ${status.model} in a private TEE` : `Generating with ${status.model}`}
    </p>
  );
}
