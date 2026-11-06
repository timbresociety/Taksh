import { specHash } from "@/lib/arkiv/schema";
import { listGames, publishGame } from "@/lib/arkiv/store";
import { validateSpec } from "@/lib/spec/validate";
import { templateInfo } from "@/lib/templates";
import { arkivRoute, badRequest, readBody, throttle } from "../_route";

export const dynamic = "force-dynamic";

// GET /api/arkiv/games[?template=hop] lists published games, newest first.
export const GET = arkivRoute(async (request) => {
  const template = request.nextUrl.searchParams.get("template") || undefined;
  if (template && !templateInfo(template)) throw badRequest(`Unknown template "${template}".`);
  return { available: true, ...(await listGames({ template })) };
});

// Stores the validated spec, so whoever opens it plays exactly what was published.
export const POST = arkivRoute(async (request) => {
  const body = await readBody(request);
  const checked = validateSpec(body.spec);
  if (!checked.ok) throw badRequest(`That game spec is not valid: ${checked.errors[0]}`);
  throttle(request);
  const hash = await specHash(checked.spec);
  const published = await publishGame({ spec: checked.spec, hash, author: body.author, source: body.source });
  return { available: true, hash, url: `/games/${published.key}`, ...published };
});
