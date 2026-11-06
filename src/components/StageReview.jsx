"use client";

import { useEffect, useRef } from "react";
import { GameSession } from "@/lib/game/session";
import { DEFAULT_HERO, DEFAULT_RIVAL, SPEC_VERSION } from "@/lib/spec/contract";
import { validateSpec } from "@/lib/spec/validate";
import { REACTION_MS } from "@/lib/templates/shared";
import { createStage } from "@/lib/stage/stage";

// Plays any template with its own bot, so a world and style can be checked without a player.
// Query: template, world, style, body, preview.
export default function StageReview() {
  const host = useRef(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const template = query.get("template") ?? "lane_runner";
    const { spec } = validateSpec({
      specVersion: SPEC_VERSION, template, title: "Review", objective: "Review", seed: Number(query.get("seed") ?? 7),
      skin: { world: query.get("world") ?? "downtown", style: query.get("style") ?? "bright", hero: { ...DEFAULT_HERO, body: query.get("body") ?? DEFAULT_HERO.body }, rival: DEFAULT_RIVAL },
      tuning: [],
    });
    let alive = true;
    let stage = null;
    createStage(host.current, spec, { preview: query.has("preview") }).then((made) => {
      stage = made;
      const session = new GameSession(spec);
      const pending = [];
      let last = performance.now();
      function frame(now) {
        if (!alive) return;
        const dt = Math.min(50, now - last);
        last = now;
        for (const event of session.tick(dt)) if (event.type !== "action") stage.event(event, session.state);
        if (session.phase === "playing") {
          const wanted = session.template.bot(session.state, "quick");
          if (wanted && !pending.some((item) => item.action === wanted)) pending.push({ action: wanted, at: now + REACTION_MS.quick });
          for (const item of pending.splice(0)) {
            if (item.at <= now) session.act(item.action);
            else pending.push(item);
          }
        }
        stage.frame(session.state, dt);
        window.__stageFrames = (window.__stageFrames ?? 0) + 1;
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
      window.__rigReady = true;
    }).catch((error) => {
      console.error(error);
      window.__rigError = `${error.message}\n${error.stack}`;
    });
    return () => {
      alive = false;
      stage?.dispose();
    };
  }, []);

  return <div ref={host} style={{ position: "fixed", inset: 0 }} />;
}
