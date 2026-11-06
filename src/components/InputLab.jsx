"use client";

import { useEffect, useRef, useState } from "react";
import { Calibrator } from "@/lib/motion/calibrate";
import { cameraProblem } from "@/lib/motion/camera-error";
import { PoseFeed } from "@/lib/motion/feed";
import { GestureEngine, THRESHOLDS } from "@/lib/motion/gestures";
import { drawSkeleton } from "@/lib/motion/overlay";
import { GESTURES, gestureInfo } from "@/lib/spec/contract";

const PROMPT_MS = 3200;
const REST_MS = 1400;
const REPS = 6;

// Bars show each live signal against its trigger threshold, in torso lengths.
function readings(f) {
  const { step, hand, kick, knee, jump, burpee, squat, lean, punch, hook, uppercut, swing, reach, guard } = THRESHOLDS;
  return [
    ["Step", Math.abs(f.hipOffset), step.enter],
    ["Left hand", f.reachLeft, hand.enter],
    ["Right hand", f.reachRight, hand.enter],
    ["Left kick", f.kickLeft, kick.enter],
    ["Right kick", f.kickRight, kick.enter],
    ["Left knee", f.kneeLeft, knee.enter],
    ["Right knee", f.kneeRight, knee.enter],
    ["Jump", f.feetLifted ? f.hipRise : 0, jump.enter],
    ["Burpee", f.burpee, burpee.enter],
    ["Squat", f.squat, squat.enter],
    ["Lean", Math.abs(f.lean), lean.enter],
    ["Left punch", f.punchLeft, punch.enter],
    ["Right punch", f.punchRight, punch.enter],
    ["Left hook", f.hookLeft, hook.enter],
    ["Right hook", f.hookRight, hook.enter],
    ["Left uppercut", f.riseLeft, uppercut.enter],
    ["Right uppercut", f.riseRight, uppercut.enter],
    ["Swing", Math.abs(f.sweep), swing.enter],
    ["Left reach", f.heightLeft, reach.enter],
    ["Right reach", f.heightRight, reach.enter],
    ["Guard", f.guard, guard.enter],
  ];
}

const DRILLABLE = GESTURES.filter((gesture) => !gesture.hidden);

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
  const calibrator = useRef(new Calibrator());
  const trace = useRef({ frames: [], calibration: null });
  const drill = useRef(null);

  const [state, setState] = useState({ phase: "off", message: "Start the camera to begin." });
  const [live, setLive] = useState(null);
  const [log, setLog] = useState([]);
  const [totals, setTotals] = useState(emptyTotals);
  const [prompt, setPrompt] = useState(null);
  const [falseFires, setFalseFires] = useState(0);
  const [selected, setSelected] = useState(DRILLABLE.map((gesture) => gesture.id));

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
    setState({ phase: "calibrating", message: "Stand still with your whole body in view." });
  }

  function recalibrate() {
    engine.current = null;
    calibrator.current = new Calibrator();
    setState({ phase: "calibrating", message: "Stand still with your whole body in view." });
  }

  function onFrame({ points, raw, t, aspect }) {
    drawSkeleton(overlay.current, points, aspect);
    if (raw) trace.current.frames.push({ t: Math.round(t), lm: raw.map((p) => [+p.x.toFixed(4), +p.y.toFixed(4), +(p.visibility ?? 0).toFixed(2), +(p.z ?? 0).toFixed(4)]) });
    else trace.current.frames.push({ t: Math.round(t), lm: null });
    trace.current.aspect = aspect;

    if (!engine.current) {
      const result = calibrator.current.push(points, t);
      setState((current) => ({ ...current, message: result.message, progress: result.progress }));
      if (result.done) {
        engine.current = new GestureEngine(result.calibration, { moves: "all" });
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
      setLog((items) => [...result.events.map((event) => ({ ...event, id: `${event.t}${event.gesture}` })), ...items].slice(0, 30));
    }
    setLive({
      tracking: result.tracking,
      features: result.features,
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
    const queue = selected.flatMap((id) => Array(REPS).fill(id)).sort(() => Math.random() - 0.5);
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
    run.current = { gesture, seen: [] };
    setPrompt({ gesture, left: run.queue.length + 1 });
    setTimeout(() => {
      settlePrompt();
      setTimeout(nextPrompt, REST_MS);
    }, PROMPT_MS);
  }

  function settlePrompt() {
    const run = drill.current;
    if (!run?.current) return;
    const { gesture, seen } = run.current;
    run.current = null;
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
              <button type="button" className="button" onClick={recalibrate}>
                Recalibrate
              </button>
              <button type="button" className="button" onClick={() => download(`taksh-drill-${Date.now()}.json`, { totals, falseFires, live: live && { fps: live.fps, inferenceMs: live.inferenceMs, delegate: live.delegate }, at: new Date().toISOString() })}>
                Save results
              </button>
              <button type="button" className="button" onClick={() => download(`taksh-trace-${Date.now()}.json`, trace.current)}>
                Save trace
              </button>
            </>
          )}
        </div>
      </header>

      <section className="lab__view">
        <div className="mirror">
          <video ref={video} playsInline muted />
          <canvas ref={overlay} />
          {prompt && (
            <p className="lab__prompt" data-testid="lab-prompt">
              {gestureInfo(prompt.gesture).cue}
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
        {live?.features ? (
          readings(live.features).map(([label, value, enter]) => (
            <div className="gauge" key={label}>
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
        <p>Each move is prompted {REPS} times in random order. Do it once per prompt.</p>
        <fieldset className="drill-picks">
          <legend className="visually-hidden">Moves in the drill</legend>
          {DRILLABLE.map((gesture) => (
            <label key={gesture.id}>
              <input
                type="checkbox"
                checked={selected.includes(gesture.id)}
                onChange={(event) => setSelected((current) => (event.target.checked ? [...current, gesture.id] : current.filter((id) => id !== gesture.id)))}
              />
              {gesture.label}
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
