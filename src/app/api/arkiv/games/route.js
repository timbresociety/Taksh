import { cleanName, specHash, stableJson } from "@/lib/arkiv/schema";
import { listGames, publishGame } from "@/lib/arkiv/store";
import { validateSpec } from "@/lib/spec/validate";
import { cleanCover, gameFiles, swarmOn, swarmUrl, uploadCollection } from "@/lib/swarm/bee";
import { createBudget } from "@/lib/agent/budget";
import { WORLDS } from "@/lib/spec/contract";
import { templateInfo } from "@/lib/templates";
import { arkivRoute, badRequest, readBody, throttle } from "../_route";

const MAX_SPEC_BYTES = 4096;
// Each upload spends the postage batch, whoever asks.
const swarmBudget = createBudget(20);

export const dynamic = "force-dynamic";

// GET /api/arkiv/games[?template=hop][&world=moon] lists published games, newest first.
export const GET = arkivRoute(async (request) => {
  const template = request.nextUrl.searchParams.get("template") || undefined;
  const world = request.nextUrl.searchParams.get("world") || undefined;
  if (template && !templateInfo(template)) throw badRequest(`Unknown template "${template}".`);
  if (world && !WORLDS.some((w) => w.id === world)) throw badRequest(`Unknown world "${world}".`);
  return { available: true, ...(await listGames({ template, world })) };
});

// Stores the validated spec, so whoever opens it plays exactly what was published.
export const POST = arkivRoute(async (request) => {
  const body = await readBody(request);
  const checked = validateSpec(body.spec);
  if (!checked.ok) throw badRequest(`That game spec is not valid: ${checked.errors[0]}`);
  // A real spec is about 600 bytes. Only title and objective are free text, so cap the whole thing.
  if (new TextEncoder().encode(stableJson(checked.spec)).length > MAX_SPEC_BYTES) throw badRequest("That game is too large to publish.");
  throttle(request);
  const hash = await specHash(checked.spec);
  // A Swarm failure costs the game its cover, not its publish.
  const upload = swarmOn() && body.cover
    ? async () => {
        try {
          const cover = await cleanCover(body.cover);
          if (!cover) return null;
          swarmBudget();
          return await uploadCollection(gameFiles({ spec: checked.spec, cover, author: cleanName(body.author), playUrl: `${new URL(request.url).origin}/games` }));
        } catch (error) {
          console.error("Swarm upload skipped:", error.message);
          return null;
        }
      }
    : null;
  const published = await publishGame({ spec: checked.spec, hash, author: body.author, source: body.source, upload });
  return { available: true, hash, url: `/games/${published.key}`, ...published, swarm: published.swarmRef ? swarmUrl(published.swarmRef) : null };
});
