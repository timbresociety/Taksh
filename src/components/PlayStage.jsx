"use client";

import { useEffect, useRef, useState } from "react";
import { startRivalBrain } from "@/lib/agent/rival-brain";
import { GameSession } from "@/lib/game/session";
import { playCue } from "@/lib/game/sound";
import { GestureEngine } from "@/lib/motion/gestures";
import { drawRange, drawSkeleton } from "@/lib/motion/overlay";
import { cueGestures, rangeOf } from "@/lib/motion/range";
import { gestureInfo } from "@/lib/spec/contract";
import { createStage } from "@/lib/stage/stage";
import { templateInfo } from "@/lib/templates";

const HUD_INTERVAL_MS = 80;
const MAX_FRAME_MS = 50;
const FEED_STALL_MS = 250;
const FILL_FADE = 0.88; // a speed move's meter is a flash, so the guide's fill lets go of it slowly

// What the guide shows for a cue: each move's range of motion, drawn from its demo pose, and the
// keys that make it, so keyboard players still see the body move.
function guideFor(template, cue) {
  const gestures = cueGestures(cue);
  const bindings = gestures.map((gesture) => template.bindings.find((binding) => binding.gesture === gesture));
  const ranges = gestures.map((gesture, index) => rangeOf(bindings[index]?.demo ?? gesture));
  const shown = gestures.filter((_, index) => ranges[index]);
  const keys = [...new Set(bindings.map((binding) => template.actions.find((action) => action.id === binding?.action)?.keyLabel).filter(Boolean))];
  return { gestures: shown, ranges: ranges.filter(Boolean), keys, label: cue?.label ?? gestureInfo(gestures[0])?.label ?? null };
}

const EVENT_CUES = {
  coin: "hit", catch: "hit", gate: "hit", land: "hit", perfect: "hit", hit: "hit", match: "hit",
  clear: "avoid", dodge: "avoid", blocked: "avoid", rep: "tick",
  miss: "miss", short: "miss", wrong: "miss", fall: "miss",
  hurt: "hurt", knockdown: "go",
  good: "smash",
  stray: "tick",
  cut: "chop", blast: "boom",
  slash: "chop", clang: "clang", boss_enter: "roar", boss_hit: "hit", boss_part: "boom", boss_parry: "clang", boss_blocked: "clang", boss_down: "boom",
  shot: "shot", grenade: "boom", empty: "tick",
  save: "hit", punch: "boom", kick: "tick", goal: "miss", rocket: "roar",
  stroke: "splash", pass: "hit", finish: "go", near: "horn", bump: "miss",
  climb: "hit", call: "go", smash: "crack", set_done: "hit", shaky: "miss",
  downed: "smash", tile: "tile", crack: "tick", bounce: "bounce", garland: "hit", cleared: "go", pop: "pop", bop: "bop",
};

export default function PlayStage({ spec, mode, feed, calibration, personal, rival, onEnd, onQuit, onRecalibrate }) {
  const host = useRef(null);
  const video = useRef(null);
  const overlay = useRef(null);
  const guideCanvas = useRef(null);
  const [hud, setHud] = useState(null);
  const [failure, setFailure] = useState(null);
  const [brain, setBrain] = useState(null);
  const usesCamera = mode === "camera";
  const template = templateInfo(spec.template);

  useEffect(() => {
    const brainy = rival === "0g" && Boolean(templateInfo(spec.template).plan);
    const session = new GameSession(spec, { usesCamera, rival: brainy ? "0g" : undefined });
    const rivalBrain = brainy ? startRivalBrain(session, { onChange: setBrain }) : null;
    if (brainy) setBrain({ status: "thinking", taunt: null, decisions: 0 });
    if (window.location.search.includes("e2e")) window.__takshSession = session; // lets scripts/e2e.mjs read the game it plays
    const keys = new Map(template.actions.map((action) => [action.key.toLowerCase(), action]));
    let stage = null;
    let raf = 0;
    let alive = true;
    let scaleDrift = false;
    let tracking = usesCamera ? "searching" : "keyboard";
    let unsubscribe = () => {};
    // The move the round wants now, set from the HUD and drawn on every frame without a re-render.
    let cue = null;
    let cueKey = "";
    let guide = guideFor(template, null);
    let fills = [];
    let painted = false;
    let fedAt = -Infinity; // when the camera last drew the guide, so a stalled feed hands it to the frame loop
    const setCue = (next) => {
      const key = next ? cueGestures(next).join() : "";
      cue = next;
      if (key === cueKey) return;
      cueKey = key;
      guide = guideFor(template, next);
      fills = guide.gestures.map(() => 0);
    };
    const paintGuide = (t, points = null, features = null, engine = null) => {
      if (!guideCanvas.current || (!guide.ranges.length && !painted)) return;
      painted = guide.ranges.length > 0;
      if (engine) fills = guide.gestures.map((gesture, index) => Math.max(Math.min(1, engine.meter(gesture, features)), fills[index] * FILL_FADE));
      drawRange(guideCanvas.current, { ranges: guide.ranges, fills, points, calibration, urgency: cue?.urgency ?? 0, t });
    };

    if (usesCamera && feed.current?.running) {
      const engine = new GestureEngine(calibration, { framing: template.framing, moves: template.bindings.map((binding) => binding.gesture), personal });
      feed.current.attach(video.current).catch(() => {}); // a remount interrupts play, and the next attach restarts it
      unsubscribe = feed.current.subscribe(({ points, t, aspect }) => {
        const result = engine.push(points, t);
        tracking = result.tracking;
        session.setTracking(tracking);
        for (const event of result.events) session.handleGesture(event);
        if (template.aim && result.features) session.handleAim(result.features.cursor);
        if (template.drive && result.features) session.handleDrive({ speed: result.features.speed, tilt: result.features.tilt });
        stage?.follow(points, calibration.torso);
        if (overlay.current) drawSkeleton(overlay.current, points, aspect, "#e9ff3a");
        fedAt = performance.now();
        paintGuide(t, points, result.features, engine);
        if (result.features && template.framing === "full") scaleDrift = result.features.scale < 0.72 || result.features.scale > 1.32;
      });
    }

    const onKeyDown = (event) => {
      const action = keys.get(event.key.toLowerCase());
      if (!action || event.repeat) return;
      event.preventDefault();
      session.handleKey(action.id);
    };
    const onKeyUp = (event) => {
      const action = keys.get(event.key.toLowerCase());
      if (action?.hold) session.handleKey(`${action.id}_release`);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    const onResize = () => stage?.resize();
    window.addEventListener("resize", onResize);
    // Without a camera the pointer is the hand.
    const onPointer = (event) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = 1 - (event.clientY / window.innerHeight) * 2;
      session.handleAim({ right: { x, y }, left: null });
    };
    if (template.aim && !usesCamera) window.addEventListener("pointermove", onPointer);

    let last = 0;
    let lastHud = 0;
    let lastCount = null;
    let ended = false;

    function frame(now) {
      const dt = Math.min(MAX_FRAME_MS, now - last);
      last = now;

      rivalBrain?.tick();
      for (const event of session.tick(dt)) {
        if (event.type === "action") continue;
        stage.event(event, session.state);
        const cue = EVENT_CUES[event.type];
        if (cue) playCue(cue);
      }

      const count = session.countdownMs === null ? null : Math.ceil(session.countdownMs / 1000);
      if (count !== lastCount) {
        if (count !== null) playCue("tick");
        else if (lastCount !== null) playCue("go");
        lastCount = count;
      }

      stage.frame(session.state, dt);

      if (now - lastHud > HUD_INTERVAL_MS) {
        lastHud = now;
        const shown = session.hud();
        setCue(session.phase === "playing" ? shown.cue ?? null : null);
        setHud({ ...shown, cue, phase: session.phase, count, movements: session.movements, tracking, scaleDrift });
      }
      // Without a camera the guide plays the move on a loop, here; with one, the feed draws it per frame,
      // unless the feed has stalled or never started, when the loop keeps the panel from sitting blank.
      if (!usesCamera || now - fedAt > FEED_STALL_MS) paintGuide(now);

      if (session.phase === "ended" && !ended) {
        ended = true;
        playCue("end");
        rivalBrain?.stop();
        // A 0G-rival round carries its whole episode, so the result screen can store it on 0G.
        const episode = rivalBrain && { spec, options: session.options, roundId: rivalBrain.roundId, ...session.recording, decisions: rivalBrain.decisions };
        setTimeout(() => onEnd({ ...session.result(), ...(episode && { episode }) }), 1100);
      }
      raf = requestAnimationFrame(frame);
    }

    // The countdown waits for the world, or a slow connection would eat the start of the round.
    createStage(host.current, spec).then((made) => {
      if (!alive) {
        made.dispose();
        return;
      }
      stage = made;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }).catch((error) => setFailure(error.message));

    return () => {
      alive = false;
      rivalBrain?.stop();
      cancelAnimationFrame(raf);
      unsubscribe();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      stage?.dispose();
    };
  }, [spec, template, usesCamera, feed, calibration, personal, rival, onEnd]);

  // A cue whose moves have no pose to draw shows nothing, rather than an empty panel.
  const cueGuide = hud?.cue && hud.phase === "playing" ? guideFor(template, hud.cue) : null;
  const shownGuide = cueGuide?.ranges.length ? cueGuide : null;

  return (
    <main className="play" data-testid="play" data-template={spec.template} data-phase={hud?.phase ?? "loading"} data-score={hud?.score}>
      <div ref={host} className="play__canvas" />

      <div className="hud">
        <div className="hud__score">
          <small>{hud?.label ?? "Score"}</small>
          <span data-testid="score">{hud?.score ?? 0}</span>
        </div>
        {hud?.extra && <p className="hud__call" data-testid="call" data-tone={hud.tone ?? undefined}>{hud.extra}</p>}
        {brain && (
          <p className="hud__rival" data-testid="rival-brain" data-status={brain.status}>
            {{ thinking: "0G rival is reading you", planned: brain.taunt ? `“${brain.taunt}”` : "0G rival has a plan", lost: "0G signal lost. Rival holds its guard" }[brain.status]}
            <small>{brain.decisions} decisions on 0G</small>
          </p>
        )}
        <div className="hud__side">
          <div className="hud__clock" data-testid="clock">{hud?.clock}</div>
          {hud?.maxLives !== undefined && (
            <div className="hud__lives" aria-label={`${hud.lives} lives left`}>
              {"●".repeat(Math.max(0, hud.lives))}
              <span>{"●".repeat(Math.max(0, hud.maxLives - hud.lives))}</span>
            </div>
          )}
        </div>
      </div>

      {hud?.bars && (
        <div className="hud__bars">
          {hud.bars.map((bar) => (
            <div key={bar.label} className="bar">
              <span>{bar.label}</span>
              <i style={{ width: `${bar.value * 100}%` }} />
            </div>
          ))}
        </div>
      )}
      {hud?.meter !== undefined && (
        <div className="hud__meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(hud.meter * 100)}>
          <i style={{ width: `${hud.meter * 100}%` }} />
        </div>
      )}

      <ol className="movements" aria-label="Detected movements" data-testid="movements">
        {hud?.movements.map((movement) => (
          <li key={movement.id} data-used={movement.used}>
            {movement.label}
            {usesCamera && <small>{Math.round(movement.confidence * 100)}%</small>}
          </li>
        ))}
      </ol>

      {/* The move to make, as a body to copy rather than words to read. The word under it is for anyone who can't see it well. */}
      <figure className="guide" data-testid="guide" data-active={Boolean(shownGuide)} data-urgent={(hud?.cue?.urgency ?? 0) > 0.7} aria-hidden={!shownGuide}>
        <canvas ref={guideCanvas} />
        {shownGuide && (
          <figcaption>
            {shownGuide.label}
            {!usesCamera && shownGuide.keys.map((key) => <kbd key={key}>{key}</kbd>)}
          </figcaption>
        )}
      </figure>

      {usesCamera && (
        <div className="pip" data-tracking={hud?.tracking} data-large={spec.template === "poses"}>
          <video ref={video} playsInline muted />
          <canvas ref={overlay} />
          <span className="pip__state">{{ good: "Tracking", partial: "Legs not in view", lost: "Lost you", searching: "Looking for you" }[hud?.tracking]}</span>
        </div>
      )}

      <div className="keys" aria-label="Keyboard controls">
        {(hud?.keys ? template.actions.filter((action) => hud.keys.includes(action.id)) : template.actions.slice(0, 6)).map((action) => (
          <span key={action.id}>
            <kbd>{action.keyLabel}</kbd>
            {action.label}
          </span>
        ))}
        <button type="button" className="text-button" onClick={onQuit}>
          Quit round
        </button>
      </div>

      {!hud && (
        <div className="overlay">
          <p className="overlay__text" role={failure ? "alert" : undefined}>{failure ? `The game did not load: ${failure}` : "Building your world"}</p>
        </div>
      )}

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
