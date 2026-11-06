"use client";

import { useEffect, useRef, useState } from "react";
import { GameSession } from "@/lib/game/session";
import { playCue } from "@/lib/game/sound";
import { GestureEngine } from "@/lib/motion/gestures";
import { drawSkeleton } from "@/lib/motion/overlay";
import { createRenderer } from "@/lib/render/renderer";
import { bodyFromLandmarks } from "@/lib/render/sprites";
import { ACTIONS, actionInfo } from "@/lib/spec/contract";
import { displayFont } from "./BriefStage";

const HUD_INTERVAL_MS = 80;
const MAX_FRAME_MS = 50;

const KEY_ACTIONS = new Map(ACTIONS.flatMap((action) => [[action.key, action.id], [action.key.toUpperCase(), action.id]]));

export default function PlayStage({ spec, mode, feed, calibration, onEnd, onQuit, onRecalibrate }) {
  const canvas = useRef(null);
  const video = useRef(null);
  const overlay = useRef(null);
  const [hud, setHud] = useState(null);
  const usesCamera = mode === "camera";

  useEffect(() => {
    const session = new GameSession(spec, { usesCamera });
    const renderer = createRenderer(canvas.current, spec, { fontFamily: displayFont() });
    renderer.resize();
    const onResize = () => renderer.resize();
    window.addEventListener("resize", onResize);

    let pose = null;
    let scaleDrift = false;
    let tracking = usesCamera ? "searching" : "keyboard";
    let unsubscribe = () => {};

    if (usesCamera && feed.current?.running) {
      const engine = new GestureEngine(calibration);
      feed.current.attach(video.current);
      unsubscribe = feed.current.subscribe(({ points, t, aspect }) => {
        const result = engine.push(points, t);
        tracking = result.tracking;
        session.setTracking(tracking);
        for (const event of result.events) session.handleGesture(event);
        if (overlay.current) drawSkeleton(overlay.current, points, aspect, spec.artStyle.palette.target);
        if (result.features && points) {
          const { hipRise, scale } = result.features;
          scaleDrift = scale < 0.72 || scale > 1.32;
          pose = { body: bodyFromLandmarks(points, calibration.torso), rise: Math.max(0, hipRise), drop: Math.max(0, -hipRise) };
        }
      });
    }

    const onKey = (event) => {
      const action = KEY_ACTIONS.get(event.key);
      if (!action || event.repeat) return;
      event.preventDefault();
      session.handleKey(action);
    };
    window.addEventListener("keydown", onKey);

    let raf = 0;
    let last = performance.now();
    let lastHud = 0;
    let taken = 0;
    let lastCount = null;
    let ended = false;

    function frame(now) {
      const dt = Math.min(MAX_FRAME_MS, now - last);
      last = now;

      for (const outcome of session.tick(dt)) {
        if (outcome.type === "end") continue;
        renderer.onOutcome(outcome, session.round);
        playCue(outcome.type);
      }
      for (; taken < session.actionsTaken.length; taken += 1) renderer.onAction(session.actionsTaken[taken].action);

      const count = session.countdownMs === null ? null : Math.ceil(session.countdownMs / 1000);
      if (count !== lastCount) {
        if (count !== null) playCue("tick");
        else if (lastCount !== null) playCue("go");
        lastCount = count;
      }

      renderer.draw({ round: session.round, dt: session.phase === "playing" ? dt : 0, pose });

      if (now - lastHud > HUD_INTERVAL_MS) {
        lastHud = now;
        const { round } = session;
        setHud({
          phase: session.phase,
          count,
          score: round.score,
          combo: round.combo,
          lives: round.lives,
          lane: round.lane,
          remaining: Math.max(0, Math.ceil((spec.end.durationMs - round.t) / 1000)),
          movements: session.movements,
          tracking,
          scaleDrift,
          tally: round.tally,
        });
      }

      if (session.phase === "ended" && !ended) {
        ended = true;
        playCue("end");
        setTimeout(() => onEnd({ ...session.round.result, actions: session.actionsTaken.length }), 500);
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    };
  }, [spec, usesCamera, feed, calibration, onEnd]);

  const actions = [...new Set(spec.movementBindings.map((binding) => binding.action))];

  return (
    <main className="play" data-testid="play" data-phase={hud?.phase} data-lane={hud?.lane} data-score={hud?.score} data-tally={JSON.stringify(hud?.tally ?? {})}>
      <canvas ref={canvas} className="play__canvas" />

      <div className="hud">
        <div className="hud__score">
          <span data-testid="score">{hud?.score ?? 0}</span>
          {hud?.combo > 1 && <small>{hud.combo} in a row</small>}
        </div>
        <div className="hud__clock">{hud?.remaining ?? Math.round(spec.end.durationMs / 1000)}s</div>
        {hud?.lives !== null && hud?.lives !== undefined && (
          <div className="hud__lives" aria-label={`${hud.lives} lives left`}>
            {"●".repeat(hud.lives)}
            <span>{"●".repeat(Math.max(0, spec.end.lives - hud.lives))}</span>
          </div>
        )}
      </div>

      <ol className="movements" aria-label="Detected movements" data-testid="movements">
        {hud?.movements.map((movement) => (
          <li key={movement.id} data-used={movement.used}>
            {movement.label}
            {usesCamera && <small>{Math.round(movement.confidence * 100)}%</small>}
          </li>
        ))}
      </ol>

      {usesCamera && (
        <div className="pip" data-tracking={hud?.tracking}>
          <video ref={video} playsInline muted />
          <canvas ref={overlay} />
          <span className="pip__state">{{ good: "Tracking", partial: "Legs not in view", lost: "Lost you", searching: "Looking for you" }[hud?.tracking]}</span>
        </div>
      )}

      <div className="keys" aria-label="Keyboard controls">
        {actions.map((action) => (
          <span key={action}>
            <kbd>{actionInfo(action).keyLabel}</kbd>
            {actionInfo(action).label}
          </span>
        ))}
        <button type="button" className="text-button" onClick={onQuit}>
          Quit round
        </button>
      </div>

      {hud?.phase === "countdown" && (
        <div className="overlay">
          <p className="overlay__count">{hud.count}</p>
          <p className="overlay__text">{spec.objective}</p>
        </div>
      )}

      {hud?.phase === "paused" && (
        <div className="overlay overlay--paused" data-testid="paused">
          {hud.count === null ? (
            <>
              <p className="overlay__title">Paused</p>
              <p className="overlay__text">We lost sight of you. Step back into view and the round will pick up where it stopped.</p>
              <button type="button" className="button" onClick={onRecalibrate}>
                Recalibrate
              </button>
            </>
          ) : (
            <p className="overlay__count">{hud.count}</p>
          )}
        </div>
      )}

      {hud?.scaleDrift && hud?.phase === "playing" && <p className="drift-note">Move back to your starting spot</p>}
    </main>
  );
}
