"use client";

import { useEffect, useRef, useState } from "react";
import { Calibrator } from "@/lib/motion/calibrate";
import { cameraProblem } from "@/lib/motion/camera-error";
import { PoseFeed } from "@/lib/motion/feed";
import { CARDIO_MOVES, GestureEngine, LOCKED_MOVES, MOVE_READINGS } from "@/lib/motion/gestures";
import { drawGhost, drawSkeleton } from "@/lib/motion/overlay";
import { GESTURES, gestureInfo } from "@/lib/spec/contract";
import { templateInfo } from "@/lib/templates";
import MoveCoach from "./MoveCoach";

const PROMPT_MS = 3200;
const REST_MS = 1400;
const REP_CHOICES = [3, 6]; // six is steadier, three keeps a drill of twenty moves to about four minutes

// Bars show each live signal against the level that fires it, locked moves first. 1.00 fires.
const GAUGES = [...LOCKED_MOVES.filter((id) => MOVE_READINGS[id]), ...Object.keys(MOVE_READINGS).filter((id) => !LOCKED_MOVES.includes(id))];
const readings = (engine, f) => GAUGES.map((id) => [id, gestureInfo(id)?.label ?? id, engine.meter(id, f), 1]);

const DRILLABLE = GESTURES.filter((gesture) => !gesture.hidden);
const drillMinutes = (moves, reps) => Math.max(1, Math.round((moves * reps * (PROMPT_MS + REST_MS)) / 60000));
// The moves one game listens to, so a drill can check just those.
const movesOf = (id) => [...new Set(templateInfo(id).bindings.map((binding) => binding.gesture))].filter((gesture) => DRILLABLE.some((item) => item.id === gesture));

function emptyTotals() {
  return Object.fromEntries(DRILLABLE.map((gesture) => [gesture.id, { prompts: 0, detected: 0, missed: 0, doubles: 0, wrong: 0 }]));
}

function download(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export default function InputLab() {
  const video = useRef(null);
  const overlay = useRef(null);
  const feed = useRef(null);
  const engine = useRef(null);
  const calibrator = useRef(null);
  const trace = useRef({ frames: [], calibration: null });
  const drill = useRef(null);
  const coach = useRef(null);
  const logged = useRef(0);

  const [state, setState] = useState({ phase: "off", message: "Start the camera to begin." });
  const [live, setLive] = useState(null);
  const [log, setLog] = useState([]);
  const [totals, setTotals] = useState(emptyTotals);
  const [prompt, setPrompt] = useState(null);
  const [falseFires, setFalseFires] = useState(0);
  const [selected, setSelected] = useState(LOCKED_MOVES);
  const [reps, setReps] = useState(REP_CHOICES[0]);
  const [framing, setFraming] = useState("full");
  const [shown, setShown] = useState(LOCKED_MOVES[0]);

  async function start() {
    setState({ phase: "starting", message: "Starting the camera" });
    try {
      feed.current = new PoseFeed();
      await feed.current.start(video.current);
    } catch (error) {
      feed.current.stop();
      setState({ phase: "off", message: cameraProblem(error, window.location.port) });
      return;
    }
    feed.current.subscribe(onFrame);
    recalibrate();
  }

  function recalibrate(next = framing) {
    engine.current = null;
    calibrator.current = new Calibrator({ framing: next });
    trace.current.framing = next;
    setState({ phase: "calibrating", message: next === "full" ? "Stand still with your whole body in view." : "Stand still with your head, shoulders and hands in view." });
  }

  function changeFraming(next) {
    setFraming(next);
    if (feed.current?.running) recalibrate(next);
  }

  function onFrame({ points, raw, world, t, aspect }) {
    drawSkeleton(overlay.current, points, aspect);
    if (trace.current.calibration) drawGhost(overlay.current, coach.current?.ghost(), aspect, trace.current.calibration);
    if (raw) trace.current.frames.push({ t: Math.round(t), lm: raw.map((p, i) => [+p.x.toFixed(4), +p.y.toFixed(4), +(p.visibility ?? 0).toFixed(2), +(p.z ?? 0).toFixed(4), +(world?.[i]?.z ?? 0).toFixed(4)]) });
    else trace.current.frames.push({ t: Math.round(t), lm: null });
    trace.current.aspect = aspect;

    if (!engine.current) {
      const result = calibrator.current.push(points, t);
      setState((current) => ({ ...current, message: result.message, progress: result.progress }));
      if (result.done) {
        engine.current = new GestureEngine(result.calibration, { framing: trace.current.framing, moves: "all" });
        trace.current.calibration = result.calibration;
        trace.current.calibratedAt = Math.round(t);
        setState({ phase: "ready", message: "Calibrated. Try each move, or run a drill." });
      }
      return;
    }

    const result = engine.current.push(points, t);
    for (const event of result.events) {
      // Coming back to the middle after a step is part of that step, so a drill does not score it.
      if (event.returning || !DRILLABLE.some((gesture) => gesture.id === event.gesture)) continue;
      recordDrill(event);
    }
    if (result.events.length) {
      setLog((items) => [...result.events.map((event) => ({ ...event, id: (logged.current += 1) })), ...items].slice(0, 30));
    }
    setLive({
      tracking: result.tracking,
      features: result.features,
      gauges: result.features && readings(engine.current, result.features),
      fps: feed.current.stats.fps,
      inferenceMs: feed.current.stats.inferenceMs,
      delegate: feed.current.delegate,
    });
  }

  function recordDrill(event) {
    const run = drill.current;
    if (!run) return;
    if (run.current) run.current.seen.push(event.gesture);
    else setFalseFires((count) => count + 1);
  }

  function runDrill() {
    const queue = selected.flatMap((id) => Array(reps).fill(id)).sort(() => Math.random() - 0.5);
    setTotals(emptyTotals());
    setFalseFires(0);
    drill.current = { queue, current: null };
    nextPrompt();
  }

  function nextPrompt() {
    const run = drill.current;
    if (!run) return;
    const gesture = run.queue.shift();
    if (!gesture) {
      drill.current = null;
      setPrompt(null);
      return;
    }
    run.current = { gesture, seen: [], at: Math.round(performance.now()) };
    setPrompt({ gesture, left: run.queue.length + 1 });
    setShown(gesture);
    setTimeout(() => {
      settlePrompt();
      setTimeout(nextPrompt, REST_MS);
    }, PROMPT_MS);
  }

  function settlePrompt() {
    const run = drill.current;
    if (!run?.current) return;
    const { gesture, seen, at } = run.current;
    run.current = null;
    // Kept with the trace, so a replay knows what the player was asked for at each moment.
    trace.current.prompts = [...(trace.current.prompts ?? []), { gesture, at, until: Math.round(performance.now()), seen }];
    setPrompt(null);
    const matches = seen.filter((name) => name === gesture).length;
    setTotals((current) => {
      const row = { ...current[gesture] };
      row.prompts += 1;
      if (matches === 0) row.missed += 1;
      else row.detected += 1;
      if (matches > 1) row.doubles += matches - 1;
      row.wrong += seen.length - matches;
      return { ...current, [gesture]: row };
    });
  }

  useEffect(() => () => feed.current?.stop(), []);

  const rows = Object.entries(totals).filter(([, row]) => row.prompts > 0);
  const sum = (key) => rows.reduce((total, [, row]) => total + row[key], 0);

  return (
    <main className="lab">
      <header className="lab__head">
        <h1>Input lab</h1>
        <p data-testid="lab-status">{state.message}</p>
        <div className="answers">
          {state.phase === "off" && (
            <button type="button" className="button button--go" onClick={start}>
              Start camera
            </button>
          )}
          {state.phase === "ready" && (
            <>
              <button type="button" className="button button--go" onClick={runDrill} disabled={Boolean(drill.current)}>
                Run drill
              </button>
              <button type="button" className="button" onClick={() => recalibrate()}>
                Recalibrate
              </button>
              <button type="button" className="button" onClick={() => download(`taksh-drill-${Date.now()}.json`, { totals, falseFires, live: live && { fps: live.fps, inferenceMs: live.inferenceMs, delegate: live.delegate }, at: new Date().toISOString() })}>
                Save results
              </button>
              <button type="button" className="button" onClick={() => download(`taksh-trace-${Date.now()}.json`, { ...trace.current, totals, falseFires })}>
                Save trace
              </button>
            </>
          )}
        </div>
      </header>

      <fieldset className="drill-picks">
        <legend>What the camera can see</legend>
        {[["full", "Whole body, standing back"], ["upper", "Head, shoulders and hands"]].map(([id, label]) => (
          <label key={id}>
            <input type="radio" name="framing" checked={framing === id} onChange={() => changeFraming(id)} />
            {label}
          </label>
        ))}
      </fieldset>

      <section className="lab__view">
        <div className="lab__coach">
          <MoveCoach gesture={shown} coachRef={coach} />
          <p>{gestureInfo(shown).cue}</p>
          <p className="practice__hint">Copy it like a mirror. On camera, yellow is you: match the white skeleton.</p>
        </div>
        <div className="mirror">
          <video ref={video} playsInline muted />
          <canvas ref={overlay} />
          {prompt && (
            <p className="lab__prompt" data-testid="lab-prompt">
              {gestureInfo(prompt.gesture).cue}
              <span className="lab__left">{prompt.left} left</span>
            </p>
          )}
        </div>
        <dl className="lab__stats">
          <div><dt>Tracking</dt><dd data-testid="lab-tracking">{live?.tracking ?? "off"}</dd></div>
          <div><dt>Frames per second</dt><dd data-testid="lab-fps">{live?.fps ?? 0}</dd></div>
          <div><dt>Inference</dt><dd>{live ? `${live.inferenceMs.toFixed(1)} ms` : "n/a"}</dd></div>
          <div><dt>Runs on</dt><dd>{live?.delegate ?? "n/a"}</dd></div>
        </dl>
      </section>

      <section className="lab__gauges" aria-label="Live signals">
        <h2>Live signals</h2>
        {live?.gauges ? (
          live.gauges.map(([id, label, value, enter]) => (
            <div className="gauge" key={id}>
              <span>{label}</span>
              <div className="gauge__track">
                <i style={{ width: `${Math.max(0, Math.min(1.5, value / enter)) * 66.6}%` }} data-over={value >= enter} />
                <b />
              </div>
              <span>{value.toFixed(2)}</span>
            </div>
          ))
        ) : (
          <p>Signals appear after calibration.</p>
        )}
      </section>

      <section className="lab__log">
        <h2>Detected</h2>
        <ol data-testid="lab-log">
          {log.map((event) => (
            <li key={event.id}>
              <strong>{gestureInfo(event.gesture).label}</strong>
              {event.returning ? " (back to middle)" : ""}
              <span>{Math.round(event.confidence * 100)}%</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="lab__drill">
        <h2>Drill</h2>
        <p>
          Each move is prompted {reps} times in random order. Do it once per prompt. {selected.length} moves take about {drillMinutes(selected.length, reps)} min, and the trace can be saved at any point.
        </p>
        <div className="answers">
          <button type="button" className="button" onClick={() => setSelected(LOCKED_MOVES)}>Core moves</button>
          <button type="button" className="button" onClick={() => setSelected(CARDIO_MOVES)}>Cardio moves</button>
          <button type="button" className="button" onClick={() => setSelected(movesOf("keeper"))}>Last Line moves</button>
          {REP_CHOICES.map((count) => (
            <button key={count} type="button" className="button" aria-pressed={reps === count} onClick={() => setReps(count)}>{count} each</button>
          ))}
          <a className="button" href="/debug/cursor">Hand cursor test</a>
        </div>
        <fieldset className="drill-picks">
          <legend className="visually-hidden">Moves in the drill</legend>
          {DRILLABLE.map((gesture) => (
            <label key={gesture.id}>
              <input
                type="checkbox"
                checked={selected.includes(gesture.id)}
                onChange={(event) => setSelected((current) => (event.target.checked ? [...current, gesture.id] : current.filter((id) => id !== gesture.id)))}
              />
              <button type="button" className="text-button" onClick={() => setShown(gesture.id)}>{gesture.label}</button>
            </label>
          ))}
        </fieldset>
        <table className="controls" data-testid="drill-results">
          <thead>
            <tr>
              <th scope="col">Move</th>
              <th scope="col">Prompts</th>
              <th scope="col">Detected</th>
              <th scope="col">Missed</th>
              <th scope="col">Doubles</th>
              <th scope="col">Wrong move</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([id, row]) => (
              <tr key={id}>
                <td>{gestureInfo(id).label}</td>
                <td>{row.prompts}</td>
                <td>{row.detected}</td>
                <td>{row.missed}</td>
                <td>{row.doubles}</td>
                <td>{row.wrong}</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr>
                <th scope="row">All moves</th>
                <td>{sum("prompts")}</td>
                <td>{sum("detected")}</td>
                <td>{sum("missed")}</td>
                <td>{sum("doubles")}</td>
                <td>{sum("wrong")}</td>
              </tr>
            )}
          </tbody>
        </table>
        <p>Moves detected between prompts: {falseFires}</p>
      </section>
    </main>
  );
}
