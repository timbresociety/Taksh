// The template registry. A game is a template plus a skin (world, character, art style) and bounded
// tuning numbers, so anything generated is playable by construction.
import bout from "./bout.js";
import flyer from "./flyer.js";
import guard from "./guard.js";
import hop from "./hop.js";
import pads from "./pads.js";
import poses from "./poses.js";
import rally from "./rally.js";
import reps from "./reps.js";
import runner from "./runner.js";

export const TEMPLATES = [runner, hop, rally, pads, bout, flyer, reps, poses, guard];
const byId = new Map(TEMPLATES.map((template) => [template.id, template]));

export const templateInfo = (id) => byId.get(id);
export { defaultTuning, simulate } from "./shared.js";
