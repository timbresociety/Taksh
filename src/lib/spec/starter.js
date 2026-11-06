// Ready-made specs for the game shelf, each with a look chosen to show the game at its best.
import { templateInfo } from "../templates/index.js";
import { DEFAULT_HERO, DEFAULT_RIVAL, SPEC_VERSION } from "./contract.js";
import { validateSpec } from "./validate.js";

export const STARTER_LOOKS = {
  lane_runner: { world: "downtown", style: "bright" },
  hop: { world: "moon", style: "bright" },
  rally: { world: "sunset", style: "bright" },
  pads: { world: "station", style: "neon" },
  bout: { world: "downtown", style: "comic" },
  flyer: { world: "forest", style: "toon" },
  reps: { world: "village", style: "clay" },
  poses: { world: "sunset", style: "toon" },
  guard: { world: "forest", style: "pixel" },
};

export function starterSpec(id, seed = Math.floor(Math.random() * 1e6)) {
  const template = templateInfo(id);
  return validateSpec({
    specVersion: SPEC_VERSION, template: id, title: template.name, objective: template.pitch, seed,
    skin: { ...STARTER_LOOKS[id], hero: DEFAULT_HERO, rival: DEFAULT_RIVAL },
    tuning: [],
  }).spec;
}
