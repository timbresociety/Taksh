import { readScope, specHash } from "@/lib/arkiv/schema";
import { postScore, topScores } from "@/lib/arkiv/store";
import { validateSpec } from "@/lib/spec/validate";
import { arkivRoute, badRequest, readBody, throttle } from "../_route";

export const dynamic = "force-dynamic";

// GET /api/arkiv/scores?template=hop[&world=&style=&hash=&mode=] reads the board live from Arkiv.
export const GET = arkivRoute(async (request) => {
  let scope;
  try {
    scope = readScope(request.nextUrl.searchParams);
  } catch (error) {
    throw badRequest(error.message);
  }
  return { available: true, ...(await topScores(scope)) };
});

// The score is what the browser says it is. The spec must still be a real, playable game.
export const POST = arkivRoute(async (request) => {
  const body = await readBody(request);
  const checked = validateSpec(body.spec);
  if (!checked.ok) throw badRequest(`That game spec is not valid: ${checked.errors[0]}`);
  if (typeof body.result?.score !== "number") throw badRequest("The score is missing.");
  throttle(request);
  const hash = await specHash(body.spec);
  return { available: true, hash, ...(await postScore({ spec: checked.spec, hash, result: body.result, mode: body.mode, player: body.player })) };
});
