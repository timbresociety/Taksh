"use client";

import { useEffect, useRef, useState } from "react";
import { createFixtureProvider } from "@/lib/pipeline/provider-fixture";
import { createRenderer } from "@/lib/render/renderer";
import { createRound, stepRound } from "@/lib/runtime/engine";
import { displayFont } from "./BriefStage";

const provider = createFixtureProvider();

const PAIRS = [
  ["neon", "boxing"],
  ["pixel", "goalkeeper"],
  ["comic", "robot"],
  ["papercut", "hurdles"],
  ["chalk", "goalkeeper"],
  ["watercolor", "robot"],
];

function Frame({ preset, game, atIndex }) {
  const canvas = useRef(null);
  const [spec, setSpec] = useState(null);

  useEffect(() => {
    provider.complete({ stage: "generate", input: { idea: `${preset} ${game}` } }).then(({ data }) => setSpec(data));
  }, [preset, game]);

  useEffect(() => {
    if (!spec) return;
    document.fonts.ready.then(() => {
      const renderer = createRenderer(canvas.current, spec, { fontFamily: displayFont() });
      renderer.resize();
      const round = createRound(spec);
      const event = spec.events[atIndex];
      while (round.t < event.atMs - event.telegraphMs * 0.28) stepRound(round, 20);
      renderer.draw({ round, dt: 16, pose: null });
    });
  }, [spec, atIndex]);

  return (
    <figure className="art-frame">
      <canvas ref={canvas} />
      <figcaption>{preset}, {game}</figcaption>
    </figure>
  );
}

export default function ArtReview() {
  return (
    <main className="art-review">
      <h1>Art review</h1>
      <div className="art-grid">
        {PAIRS.map(([preset, game]) => (
          <Frame key={preset} preset={preset} game={game} atIndex={3} />
        ))}
      </div>
    </main>
  );
}
