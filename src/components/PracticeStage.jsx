"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cursorTrial } from "@/lib/game/cursor-lesson";
import { practiceMoves } from "@/lib/game/practice";
import { playCue } from "@/lib/game/sound";
import { GestureEngine, MOVE_READINGS, personalLevel } from "@/lib/motion/gestures";
import { clearCanvas, drawDemo, drawLesson, mirrorPlacer, pushTrail } from "@/lib/motion/lesson-draw";
import { drawGhost, drawSkeleton } from "@/lib/motion/overlay";
import { templateInfo } from "@/lib/templates";
import MoveCoach from "./MoveCoach";

const CAMERA_REPS = 2;
const KEY_REPS = 1;
const RANGE_CHECK_MS = 5000;
const NEXT_MOVE_MS = 650;
const NEAR_MISS = 0.6; // below this the player was doing something else, and their range is not known

// Said when a hand reached the target without doing it.
const CURSOR_NOTES = { slow: "Faster! Swipe right through it.", wrong: "Other hand for this one." };
const CURSOR_HINTS = {
  aim: "Each ring sits on its hand. The dashed box is the whole screen, so reach to the box's edge to reach the screen's.",
  slice: "Each ring sits on its hand. The dashed box is the whole screen. A slow hand goes through, a fast one cuts.",
  slide: "Each ring sits on its hand. Only side to side counts, so raise your hands a little and slide them.",
};

// A cursor game's move on a loop, drawn as the ring the player will see, with no character.
function CursorDemo({ kind, mouse }) {
  const canvas = useRef(null);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const frame = (now) => {
      drawDemo(canvas.current, kind, (now - start) / 1000, { mouse });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [kind, mouse]);
  return <canvas ref={canvas} className="practice__demo" data-testid="cursor-demo" data-kind={kind} aria-hidden="true" />;
}

export default function PracticeStage({ spec, mode, feed, calibration, onDone }) {
  const template = templateInfo(spec.template);
  const usesCamera = mode === "camera";
  const moves = useMemo(() => practiceMoves(template, usesCamera), [template, usesCamera]);

  const video = useRef(null);
  const overlay = useRef(null);
  const pad = useRef(null);
  const fill = useRef(null);
  const coach = useRef(null);
  const personal = useRef({});
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(0);
  const [note, setNote] = useState(null);
  const [replay, setReplay] = useState(0);
  const move = moves[index];
  const reps = move?.dots?.length ?? (usesCamera ? CAMERA_REPS : KEY_REPS);

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

    // A cursor step is scored the way its game plays, from the camera's hands or from the mouse.
    const trial = move.dots ? cursorTrial(move, template, spec) : null;
    const trails = {};
    let said = null;
    const cursorFrame = (canvas, cursors, t, aspect, at) => {
      const dot = move.dots[done];
      drawLesson(canvas, move, cursors, dot, pushTrail(trails, cursors, t), at);
      const now = trial.push(cursors, t, aspect, dot);
      if (now === "hit") landed();
      else if (now && now !== said) setNote(CURSOR_NOTES[now]);
      said = now;
    };

    let unsubscribe = () => {};
    if (usesCamera && feed.current?.running) {
      const engine = new GestureEngine(calibration, { framing: template.framing, moves: move.dots ? [] : [move.gesture], personal: personal.current });
      unsubscribe = feed.current.subscribe(({ points, t, aspect }) => {
        if (overlay.current) {
          drawSkeleton(overlay.current, points, aspect, "#e9ff3a");
          if (!move.dots) drawGhost(overlay.current, coach.current?.ghost(), aspect, calibration);
        }
        const result = engine.push(points, t);
        if (move.dots) {
          if (result.features && overlay.current) cursorFrame(overlay.current, result.features.cursor, t, aspect, mirrorPlacer(overlay.current, aspect, result.features.reach));
          return;
        }
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

    // Without a camera the mouse is the right hand, as it is in the game, across the pad here.
    const canvas = pad.current;
    const onPointer = (event) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = 1 - ((event.clientY - rect.top) / rect.height) * 2;
      clearCanvas(canvas);
      cursorFrame(canvas, { left: null, right: { x, y } }, event.timeStamp, rect.width / rect.height);
    };
    if (!usesCamera && move.dots && canvas) {
      clearCanvas(canvas);
      drawLesson(canvas, move, { left: null, right: null }, move.dots[0]);
      canvas.addEventListener("pointermove", onPointer);
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
      canvas?.removeEventListener("pointermove", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [move, reps, usesCamera, feed, calibration, template, spec]);

  if (!move) return null;

  return (
    <main className="practice" data-testid="practice" data-gesture={move.gesture}>
      <section className="practice__teach">
        {move.dots ? (
          <CursorDemo kind={move.gesture} mouse={!usesCamera} />
        ) : move.keyOnly ? (
          <div className="practice__bigkey" aria-hidden="true">
            <kbd>{move.action.keyLabel}</kbd>
          </div>
        ) : (
          <MoveCoach gesture={move.demo ?? move.gesture} look={spec.skin.hero} replay={replay} coachRef={coach} />
        )}
        <div className="practice__move">
          <h1>{move.label}</h1>
          <p>{move.cue}</p>
          {move.dots && <p className="practice__hint">Watch the ring. {usesCamera ? "Your hands" : "Your mouse"} will do the same.</p>}
          {!move.dots && !move.keyOnly && <p className="practice__hint">Copy it like a mirror. The thick white limb is the one that moves, and the thin line is the path it takes.</p>}
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
            <p className="practice__hint">{move.dots ? CURSOR_HINTS[move.gesture] : "Yellow is you. Match the white skeleton."}</p>
          </>
        ) : move.dots ? (
          <>
            <div className="mirror practice__pad">
              <canvas ref={pad} data-testid="practice-pad" />
            </div>
            <p className="practice__hint">The ring is your mouse.</p>
          </>
        ) : (
          <p className="practice__prompt">Press <kbd>{move.action?.keyLabel}</kbd> to try it.</p>
        )}
        {usesCamera && !move.dots && (
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
