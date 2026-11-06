"use client";

import { useEffect, useRef, useState } from "react";
import { Calibrator } from "@/lib/motion/calibrate";
import { cameraProblem } from "@/lib/motion/camera-error";
import { PoseFeed } from "@/lib/motion/feed";
import { GestureEngine } from "@/lib/motion/gestures";
import { HAND_COLOURS } from "@/lib/motion/overlay";

const DOTS = 24;
const DOT_MS = 4000;
const DOT_RADIUS = 0.11; // of the screen's height, the smallest target a game should use is about half this
const TOP = 0.75; // raised hands leave the camera's frame, so targets stay below head height
const WOBBLE_FRAMES = 15;

const emptyScore = () => ({ hits: 0, missed: 0, totalMs: 0 });
const median = (values) => [...values].sort((a, b) => a - b)[values.length >> 1] ?? 0;

// Places a dot on its hand's own side first, then anywhere, so crossing the body is measured too.
function nextDot(index, now) {
  const hand = index % 2 === 0 ? "left" : "right";
  const crossing = index >= DOTS / 2;
  const side = hand === "left" ? -1 : 1;
  const x = crossing ? (Math.random() * 1.6 - 0.8) : side * (0.15 + Math.random() * 0.65);
  return { hand, crossing, x, y: Math.random() * (TOP + 0.7) - 0.7, at: now };
}

// The screen's half-height is the unit for dots, so they stay round on any window.
function spread(values) {
  if (values.length < WOBBLE_FRAMES) return null;
  const recent = values.slice(-WOBBLE_FRAMES);
  const meanX = recent.reduce((sum, point) => sum + point.x, 0) / recent.length;
  const meanY = recent.reduce((sum, point) => sum + point.y, 0) / recent.length;
  return Math.sqrt(recent.reduce((sum, point) => sum + (point.x - meanX) ** 2 + (point.y - meanY) ** 2, 0) / recent.length);
}

export default function CursorLab() {
  const video = useRef(null);
  const canvas = useRef(null);
  const feed = useRef(null);
  const engine = useRef(null);
  const calibrator = useRef(null);
  const cursors = useRef({ left: null, right: null });
  const round = useRef(null);
  const paths = useRef({ left: [], right: [] });
  const wobble = useRef([]);

  const [phase, setPhase] = useState("off");
  const [message, setMessage] = useState("Start the camera, or just move your pointer to try the test.");
  const [score, setScore] = useState({ left: emptyScore(), right: emptyScore(), near: emptyScore(), crossing: emptyScore() });
  const [left, setLeft] = useState(0);
  const [steady, setSteady] = useState(null);

  async function start() {
    setMessage("Starting the camera");
    try {
      feed.current = new PoseFeed();
      await feed.current.start(video.current);
    } catch (error) {
      feed.current.stop();
      setMessage(cameraProblem(error, window.location.port));
      return;
    }
    calibrator.current = new Calibrator({ framing: "upper" });
    setPhase("calibrating");
    setMessage("Stand still with your head, shoulders and hands in view.");
    feed.current.subscribe(onFrame);
  }

  function onFrame({ points, t }) {
    if (!engine.current) {
      const result = calibrator.current.push(points, t);
      setMessage(result.message);
      if (result.done) {
        engine.current = new GestureEngine(result.calibration, { framing: "upper", moves: [] });
        setPhase("ready");
        setMessage("Move your hands. Each one has its own cursor.");
      }
      return;
    }
    const result = engine.current.push(points, t);
    if (!result.features) return;
    cursors.current = result.features.cursor;
    for (const side of ["left", "right"]) {
      const at = cursors.current[side];
      if (!at) continue;
      paths.current[side] = [...paths.current[side].slice(-WOBBLE_FRAMES), at];
      const value = spread(paths.current[side]);
      if (value !== null) wobble.current.push(value);
    }
  }

  function begin() {
    setScore({ left: emptyScore(), right: emptyScore(), near: emptyScore(), crossing: emptyScore() });
    wobble.current = [];
    round.current = { index: 0, dot: nextDot(0, performance.now()) };
    setLeft(DOTS);
    setPhase("running");
    setMessage("Reach each dot with the hand of its colour. There is nothing to click.");
  }

  function settle(hit, ms) {
    const run = round.current;
    const { hand, crossing } = run.dot;
    setScore((current) => {
      const add = (row) => ({ hits: row.hits + (hit ? 1 : 0), missed: row.missed + (hit ? 0 : 1), totalMs: row.totalMs + (hit ? ms : 0) });
      const place = crossing ? "crossing" : "near";
      return { ...current, [hand]: add(current[hand]), [place]: add(current[place]) };
    });
    run.index += 1;
    setLeft(DOTS - run.index);
    if (run.index >= DOTS) {
      round.current = null;
      // A median sits in the quiet moments, because most frames of a reach are the hand travelling.
      const quiet = wobble.current.filter((value) => value < 0.05);
      setSteady(quiet.length ? median(quiet) : null);
      setPhase("ready");
      setMessage("Done. Save the results if you want to send them over.");
      return;
    }
    run.dot = nextDot(run.index, performance.now());
  }

  useEffect(() => {
    const onPointer = (event) => {
      if (engine.current || !canvas.current) return;
      const rect = canvas.current.getBoundingClientRect();
      const at = { x: ((event.clientX - rect.left) / rect.width) * 2 - 1, y: 1 - ((event.clientY - rect.top) / rect.height) * 2 };
      cursors.current = at.x < 0 ? { left: at, right: null } : { left: null, right: at };
    };
    window.addEventListener("pointermove", onPointer);

    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const host = canvas.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      if (host.width !== Math.round(rect.width) || host.height !== Math.round(rect.height)) Object.assign(host, { width: Math.round(rect.width), height: Math.round(rect.height) });
      const { width, height } = host;
      const ctx = host.getContext("2d");
      ctx.clearRect(0, 0, width, height);
      const place = ({ x, y }) => [((x + 1) / 2) * width, ((1 - y) / 2) * height];

      const run = round.current;
      if (run) {
        const now = performance.now();
        const { dot } = run;
        const [x, y] = place(dot);
        const radius = DOT_RADIUS * height;
        ctx.fillStyle = HAND_COLOURS[dot.hand];
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        const hand = cursors.current[dot.hand];
        const reached = hand && Math.hypot(place(hand)[0] - x, place(hand)[1] - y) <= radius;
        if (reached) settle(true, now - dot.at);
        else if (now - dot.at > DOT_MS) settle(false, 0);
      }

      for (const side of ["left", "right"]) {
        const at = cursors.current[side];
        if (!at) continue;
        const [x, y] = place(at);
        ctx.strokeStyle = HAND_COLOURS[side];
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(x, y, 18, 0, Math.PI * 2);
        ctx.moveTo(x - 28, y);
        ctx.lineTo(x + 28, y);
        ctx.moveTo(x, y - 28);
        ctx.lineTo(x, y + 28);
        ctx.stroke();
      }
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      feed.current?.stop();
    };
  }, []);

  function save() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ score, steady, at: new Date().toISOString() })], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `taksh-drill-cursor-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const rows = [["Left hand", score.left], ["Right hand", score.right], ["On its own side", score.near], ["Across the body", score.crossing]];
  const done = rows[0][1].hits + rows[0][1].missed + rows[1][1].hits + rows[1][1].missed;

  return (
    <main className="lab cursor-lab">
      <header className="lab__head">
        <h1>Hand cursor</h1>
        <p data-testid="cursor-status">{message}</p>
        <div className="answers">
          {phase === "off" && <button type="button" className="button button--go" onClick={start}>Start camera</button>}
          {phase !== "running" && phase !== "calibrating" && <button type="button" className="button" onClick={begin}>Run the test</button>}
          {done > 0 && phase !== "running" && <button type="button" className="button" onClick={save}>Save results</button>}
        </div>
      </header>
      <div className="cursor-lab__field" data-testid="cursor-field">
        <video ref={video} playsInline muted />
        <canvas ref={canvas} />
      </div>
      <section>
        <p data-testid="cursor-left">{phase === "running" ? `${left} dots left` : `${DOTS} dots: the first half on each hand's own side, then anywhere.`}</p>
        <table className="controls" data-testid="cursor-results">
          <thead>
            <tr><th scope="col">Dots</th><th scope="col">Reached</th><th scope="col">Missed</th><th scope="col">Average time</th></tr>
          </thead>
          <tbody>
            {rows.map(([label, row]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>{row.hits}</td>
                <td>{row.missed}</td>
                <td>{row.hits ? `${(row.totalMs / row.hits / 1000).toFixed(2)} s` : "n/a"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {steady !== null && <p>Cursor wobble when your hand is still: {((steady * window.innerWidth) / 2).toFixed(1)} px on this screen.</p>}
      </section>
    </main>
  );
}
