// One view per template, keyed by template id.
import { bout, pads, poses, rally, reps, showcase } from "./arena.js";
import { guard, lane_runner } from "./lanes.js";
import { flyer, hop } from "./sideways.js";

export const VIEWS = { lane_runner, hop, rally, pads, bout, flyer, reps, poses, guard };
export { showcase };
