"use client";

import { useEffect, useRef } from "react";
import { actionInfo, gestureInfo } from "@/lib/spec/contract";
import { createRound, stepRound } from "@/lib/runtime/engine";
import { createRenderer } from "@/lib/render/renderer";

export function displayFont() {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--font-display");
  return value.trim() || "sans-serif";
}

export function Controls({ spec }) {
  const actions = [...new Set(spec.movementBindings.map((binding) => binding.action))];
  return (
    <table className="controls" data-testid="controls">
      <thead>
        <tr>
          <th scope="col">Your body</th>
          <th scope="col">Does</th>
          <th scope="col">Key</th>
        </tr>
      </thead>
      <tbody>
        {actions.map((action) => (
          <tr key={action}>
            <td>
              {spec.movementBindings
                .filter((binding) => binding.action === action)
                .map((binding) => gestureInfo(binding.gesture).label)
                .join(" or ")}
            </td>
            <td>{actionInfo(action).label}</td>
            <td>
              <kbd>{actionInfo(action).keyLabel}</kbd>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Preview({ spec }) {
  const canvas = useRef(null);

  useEffect(() => {
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled || !canvas.current) return;
      const renderer = createRenderer(canvas.current, spec, { fontFamily: displayFont() });
      renderer.resize();
      const round = createRound(spec);
      const first = spec.events[1] ?? spec.events[0];
      while (round.t < first.atMs - first.telegraphMs * 0.25) stepRound(round, 20);
      renderer.draw({ round, dt: 16, pose: null });
    });
    return () => {
      cancelled = true;
    };
  }, [spec]);

  return <canvas ref={canvas} className="preview" aria-label={`Preview of ${spec.title}`} />;
}

export default function BriefStage({ game, onPlay, onBack }) {
  const { spec } = game;
  const seconds = Math.round(spec.end.durationMs / 1000);
  const ending = { time: `${seconds} seconds`, lives: `${spec.end.lives} lives, up to ${seconds} seconds`, score: `Reach ${spec.end.winScore} in ${seconds} seconds` }[spec.end.type];

  return (
    <main className="brief">
      <Preview spec={spec} />
      <section className="brief__copy">
        <h1 data-testid="game-title">{spec.title}</h1>
        <p className="brief__objective">{spec.objective}</p>
        <p className="brief__meta">{ending}</p>
        <Controls spec={spec} />
        <div className="answers">
          <button type="button" className="button button--go" onClick={() => onPlay("camera")}>
            Play with camera
          </button>
          <button type="button" className="button" onClick={() => onPlay("keyboard")}>
            Play with keyboard
          </button>
        </div>
        <button type="button" className="text-button" onClick={onBack}>
          Start a new idea
        </button>
      </section>
    </main>
  );
}
