import { cleanRuns, designLevel } from "@/lib/pipeline/pipeline";
import { validateSpec } from "@/lib/spec/validate";
import { badRequest, route } from "../_shared";

// The next level of a game, designed from the player's earlier runs of it.
export const POST = route(async (body, provider) => {
  const check = validateSpec(body.spec);
  if (!check.ok) throw badRequest("That game isn't valid.");
  const runs = cleanRuns(check.spec, body.runs);
  if (!runs.length) throw badRequest("Play the game once first.");
  return designLevel({ spec: check.spec, runs }, provider);
});
