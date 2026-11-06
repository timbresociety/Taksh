"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { playCue } from "@/lib/game/sound";
import { GestureEngine, MOVE_READINGS, personalLevel } from "@/lib/motion/gestures";
import { drawGhost, drawSkeleton } from "@/lib/motion/overlay";
import { gestureInfo } from "@/lib/spec/contract";
import { templateInfo } from "@/lib/templates";
import MoveCoach from "./MoveCoach";

const CAMERA_REPS = 2;
const KEY_REPS = 1;
const RANGE_CHECK_MS = 5000;
const NEXT_MOVE_MS = 650;
const NEAR_MISS = 0.6; // below this the player was doing something else, and their range is not known

// One row per move the game listens to, with the key that stands in for it.
function movesOf(template) {
  const seen = new Set();
  return template.bindings.flatMap(({ gesture, action }) => {
    const info = gestureInfo(gesture);
    if (seen.has(gesture) || !info || info.hidden) return [];
    seen.add(gesture);
    return [{ gesture, label: info.label, cue: info.cue, action: template.actions.find((item) => item.id === action) }];
  });
}

export default function PracticeStage({ spec, mode, feed, calibration, onDone }) {
  const template = templateInfo(spec.template);
  const moves = useMemo(() => movesOf(template), [template]);
  const usesCamera = mode === "camera";
  const reps = usesCamera ? CAMERA_REPS : KEY_REPS;

  const video = useRef(null);
  const overlay = useRef(null);
  const fill = useRef(null);
  const coach = useRef(null);
  const personal = useRef({});
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(0);
  const [note, setNote] = useState(null);
  const [replay, setReplay] = useState(0);
  const move = moves[index];

  // The whole list is known up front, so the shelf can never strand a player on an empty step.
  useEffect(() => {
    if (index >= moves.length) onDone(personal.current);
  }, [index, moves.length, onDone]);

  // Once for the screen. Attaching again for each move would restart the video under the player.
  useEffect(() => {
    if (usesCamera && feed.current?.running) feed.current.attach(video.current).catch(() => {});
  }, [usesCamera, feed]);

  useEffect(() => {
    if (!move) return undefined;
    let done = 0;
    let peak = 0;
    let checkedAt = null;
    let advancing = null;

    const landed = () => {
      done += 1;
      setCount(done);
      setNote(null);
      playCue("hit");
      if (done >= reps) advancing = setTimeout(() => setIndex((current) => current + 1), NEXT_MOVE_MS);
    };

    let unsubscribe = () => {};
    if (usesCamera && feed.current?.running) {
      const engine = new GestureEngine(calibration, { framing: template.framing, moves: [move.gesture], personal: personal.current });
      unsubscribe = feed.current.subscribe(({ points, t, aspect }) => {
        if (overlay.current) {
          drawSkeleton(overlay.current, points, aspect, "#e9ff3a");
          drawGhost(overlay.current, coach.current?.ghost(), aspect, calibration);
        }
        const result = engine.push(points, t);
        for (const event of result.events) if (event.gesture === move.gesture && !event.returning && done < reps) landed();
        if (!result.features) return;

        const meter = engine.meter(move.gesture, result.features);
        if (fill.current) fill.current.style.width = `${Math.min(1, meter) * 100}%`;

        // A move that nearly fires is the player's real range, so the game comes to them.
        peak = Math.max(peak, MOVE_READINGS[move.gesture]?.read(result.features) ?? 0);
        checkedAt ??= t;
        if (t - checkedAt < RANGE_CHECK_MS || done >= reps) return;
        checkedAt = t;
        const level = personalLevel(move.gesture, peak);
        if (level && level < engine.level(move.gesture) && peak >= engine.level(move.gesture) * NEAR_MISS) {
          personal.current[move.gesture] = level;
          engine.personalise({ [move.gesture]: level });
          setNote("Set to your range. Try it again.");
        } else if (done === 0) setNote("Now you. Copy the character.");
        peak = 0;
      });
    }

    const onKey = (event) => {
      if (event.repeat || event.key.toLowerCase() !== move.action?.key.toLowerCase()) return;
      event.preventDefault();
      setReplay((value) => value + 1);
      if (!usesCamera && done < reps) landed();
    };
    window.addEventListener("keydown", onKey);

    setCount(0);
    setNote(null);
    return () => {
      clearTimeout(advancing);
      unsubscribe();
      window.removeEventListener("keydown", onKey);
    };
  }, [move, reps, usesCamera, feed, calibration, template]);

  if (!move) return null;

  return (
    <main className="practice" data-testid="practice" data-gesture={move.gesture}>
      <section className="practice__teach">
        <MoveCoach gesture={move.gesture} look={spec.skin.hero} replay={replay} coachRef={coach} />
        <div className="practice__move">
          <h1>{move.label}</h1>
          <p>{move.cue}</p>
          <p className="practice__hint">Copy it like a mirror. The thick white limb is the one that moves, and the thin line is the path it takes.</p>
          {move.action && (
            <p className="practice__key">
              <kbd>{move.action.keyLabel}</kbd> on the keyboard
            </p>
          )}
        </div>
      </section>

      <section className="practice__try">
        {usesCamera ? (
          <>
            <div className="mirror">
              <video ref={video} playsInline muted />
              <canvas ref={overlay} />
            </div>
            <p className="practice__hint">Yellow is you. Match the white skeleton.</p>
          </>
        ) : (
          <p className="practice__prompt">Press <kbd>{move.action?.keyLabel}</kbd> to try it.</p>
        )}
        {usesCamera && (
          <div className="meter practice__meter" aria-hidden="true">
            <span ref={fill} />
          </div>
        )}
        <p className="practice__count" data-testid="practice-count" aria-live="polite">
          {note ?? `${count} of ${reps}`}
        </p>
        <ol className="practice__list">
          {moves.map((item, i) => (
            <li key={item.gesture} data-state={i < index ? "done" : i === index ? "now" : "next"}>{item.label}</li>
          ))}
        </ol>
        <div className="answers">
          <button type="button" className="button" onClick={() => setIndex((current) => current + 1)}>
            Next move
          </button>
          <button type="button" className="button button--go" data-testid="practice-skip" onClick={() => onDone(personal.current)}>
            Start the game
          </button>
        </div>
      </section>
    </main>
  );
}
