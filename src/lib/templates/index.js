// The template registry. A game is a template plus a skin (world, character, art style) and bounded
// tuning numbers, so anything generated is playable by construction.
import blades from "./blades.js";
import bout from "./bout.js";
import chop from "./chop.js";
import corners from "./corners.js";
import flyer from "./flyer.js";
import guard from "./guard.js";
import harmonium from "./harmonium.js";
import hop from "./hop.js";
import matka from "./matka.js";
import pads from "./pads.js";
import poses from "./poses.js";
import rally from "./rally.js";
import runner from "./runner.js";

export const TEMPLATES = [runner, hop, rally, pads, bout, flyer, poses, guard, matka, harmonium, chop, blades, corners];
const byId = new Map(TEMPLATES.map((template) => [template.id, template]));

export const templateInfo = (id) => byId.get(id);
export { defaultTuning, simulate } from "./shared.js";
