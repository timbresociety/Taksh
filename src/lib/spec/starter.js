// Ready-made specs for the game shelf, each with a look chosen to show the game at its best.
import { templateInfo } from "../templates/index.js";
import { DEFAULT_HERO, DEFAULT_RIVAL, SPEC_VERSION } from "./contract.js";
import { validateSpec } from "./validate.js";

export const STARTER_LOOKS = {
  lane_runner: { world: "mumbai", style: "bright" },
  hop: { world: "diwali", style: "bright" },
  rally: { world: "sunset", style: "bright" },
  pads: { world: "station", style: "neon" },
  bout: { world: "downtown", style: "comic" },
  flyer: { world: "marine_drive", style: "toon" },
  poses: { world: "sunset", style: "toon" },
  guard: { world: "forest", style: "pixel" },
  matka: { world: "diwali", style: "bright" },
  harmonium: { world: "village", style: "toon" },
  chop: { world: "mumbai", style: "bright" },
  blades: { world: "diwali", style: "comic" },
  keeper: { world: "marine_drive", style: "bright" },
  oars: { world: "marine_drive", style: "toon" },
  rickshaw: { world: "mumbai", style: "bright" },
  handi: { world: "mumbai", style: "comic" },
  circuit: { world: "sunset", style: "bright" },
  sights: { world: "downtown", style: "bright" },
  rangoli: { world: "diwali", style: "bright" },
  dabba: { world: "mumbai", style: "toon" },
  popup: { world: "village", style: "bright" },
};

export function starterSpec(id, seed = Math.floor(Math.random() * 1e6)) {
  const template = templateInfo(id);
  return validateSpec({
    specVersion: SPEC_VERSION, template: id, title: template.name, objective: template.pitch, seed,
    skin: { ...STARTER_LOOKS[id], hero: DEFAULT_HERO, rival: DEFAULT_RIVAL },
    tuning: [],
  }).spec;
}
