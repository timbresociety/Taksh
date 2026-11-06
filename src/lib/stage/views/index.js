// One view per template, keyed by template id.
import { bout, pads, poses, rally, showcase } from "./arena.js";
import { blades } from "./blades.js";
import { chop } from "./chop.js";
import { corners } from "./corners.js";
import { harmonium } from "./harmonium.js";
import { guard, lane_runner } from "./lanes.js";
import { matka } from "./matka.js";
import { flyer, hop } from "./sideways.js";

export const VIEWS = { lane_runner, hop, rally, pads, bout, flyer, poses, guard, matka, harmonium, chop, blades, corners };
export { showcase };
